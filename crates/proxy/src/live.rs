//! One SSE stream per dashboard tab: a snapshot of every live key on connect, then only the
//! keys whose JSON changed, a removed key as null, and `stale` events naming the state files
//! that grew.

use std::{
    collections::{BTreeSet, HashMap},
    sync::Mutex,
    time::Duration,
};

use bytes::Bytes;
use serde_json::Value;
use tokio::sync::{Notify, mpsc};

#[derive(Default)]
pub struct Stream(Mutex<Inner>, Notify);

#[derive(Default)]
struct Inner {
    keys: Vec<String>,
    live: HashMap<String, String>,
    clients: Vec<mpsc::Sender<Bytes>>,
    closed: bool,
    grown: BTreeSet<&'static str>,
}

fn frame(kind: &str, keys: &[String], values: &HashMap<String, String>) -> Bytes {
    let body: Vec<String> = keys
        .iter()
        .map(|k| {
            format!(
                "{}:{}",
                Value::from(k.as_str()),
                values.get(k).map_or("null", String::as_str)
            )
        })
        .collect();
    Bytes::from(format!(
        "data: {{\"type\":\"{kind}\",\"live\":{{{}}}}}\n\n",
        body.join(",")
    ))
}

impl Stream {
    fn inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.0.lock().expect("stream lock")
    }

    /// A new client's channel, which starts with the snapshot.
    pub fn subscribe(&self) -> mpsc::Receiver<Bytes> {
        let (tx, rx) = mpsc::channel(64);
        let mut inner = self.inner();
        if !inner.closed {
            let _ = tx.try_send(frame("snapshot", &inner.keys, &inner.live));
            inner.clients.push(tx);
        }
        rx
    }

    /// Sends the keys whose value changed since the last publish. A changed key keeps its
    /// place, so a client's order matches a fresh snapshot.
    pub fn publish(&self, entries: &[(String, Value)]) {
        let mut inner = self.inner();
        let next: HashMap<String, String> = entries
            .iter()
            .map(|(k, v)| (k.clone(), v.to_string()))
            .collect();
        let mut changed: Vec<String> = entries
            .iter()
            .filter(|(k, _)| inner.live.get(k) != next.get(k))
            .map(|(k, _)| k.clone())
            .collect();
        changed.extend(
            inner
                .keys
                .iter()
                .filter(|k| !next.contains_key(*k))
                .cloned(),
        );
        let mut order: Vec<String> = inner
            .keys
            .iter()
            .filter(|k| next.contains_key(*k))
            .cloned()
            .collect();
        order.extend(
            entries
                .iter()
                .filter(|(k, _)| !inner.live.contains_key(k))
                .map(|(k, _)| k.clone()),
        );
        inner.keys = order;
        let patch = frame("patch", &changed, &next);
        inner.live = next;
        if !changed.is_empty() {
            inner.send(&patch);
        }
    }

    /// Ends every client's stream, so shutdown isn't held open by tabs that never hang up.
    pub fn close(&self) {
        let mut inner = self.inner();
        inner.closed = true;
        inner.clients.clear();
    }

    pub fn heartbeat(&self) {
        self.inner().send(&Bytes::from_static(b": \n\n"));
    }

    /// Notes that a state file grew; `run_stale` names it to listeners, so a reader
    /// elsewhere reads on from where it stopped.
    pub fn grew(&self, file: &'static str) {
        self.inner().grown.insert(file);
        self.1.notify_one();
    }

    /// Sends the names of the files that grew, at most once a second.
    pub async fn run_stale(&self) {
        loop {
            self.1.notified().await;
            tokio::time::sleep(Duration::from_secs(1)).await;
            let mut inner = self.inner();
            let tags = serde_json::to_string(&std::mem::take(&mut inner.grown)).expect("names");
            inner.send(&Bytes::from(format!(
                "data: {{\"type\":\"stale\",\"tags\":{tags}}}\n\n"
            )));
        }
    }
}

impl Inner {
    /// Drops a client too slow to keep up; its tab reconnects and takes a fresh snapshot.
    fn send(&mut self, data: &Bytes) {
        self.clients.retain(|c| c.try_send(data.clone()).is_ok());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn text(b: &Bytes) -> String {
        String::from_utf8(b.to_vec()).unwrap()
    }

    #[test]
    fn sends_a_snapshot_then_only_what_changed() {
        let stream = Stream::default();
        stream.publish(&[
            ("a:1".into(), json!({"x": 1})),
            ("pool".into(), json!({"y": 1})),
        ]);
        let mut rx = stream.subscribe();
        assert_eq!(
            text(&rx.try_recv().unwrap()),
            "data: {\"type\":\"snapshot\",\"live\":{\"a:1\":{\"x\":1},\"pool\":{\"y\":1}}}\n\n"
        );
        stream.publish(&[
            ("a:1".into(), json!({"x": 1})),
            ("pool".into(), json!({"y": 2})),
        ]);
        assert_eq!(
            text(&rx.try_recv().unwrap()),
            "data: {\"type\":\"patch\",\"live\":{\"pool\":{\"y\":2}}}\n\n"
        );
        stream.publish(&[("pool".into(), json!({"y": 2}))]);
        assert_eq!(
            text(&rx.try_recv().unwrap()),
            "data: {\"type\":\"patch\",\"live\":{\"a:1\":null}}\n\n"
        );
        stream.publish(&[("pool".into(), json!({"y": 2}))]);
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn closing_ends_every_stream() {
        let stream = Stream::default();
        let mut rx = stream.subscribe();
        rx.try_recv().unwrap();
        stream.close();
        assert!(matches!(
            rx.try_recv(),
            Err(mpsc::error::TryRecvError::Disconnected)
        ));
        assert!(matches!(
            stream.subscribe().try_recv(),
            Err(mpsc::error::TryRecvError::Disconnected)
        ));
    }

    #[tokio::test]
    async fn names_the_files_that_grew_once() {
        let stream = std::sync::Arc::new(Stream::default());
        let mut rx = stream.subscribe();
        rx.recv().await.unwrap();
        stream.grew("receipts.ndjson");
        stream.grew("attribution.ndjson");
        stream.grew("receipts.ndjson");
        let running = stream.clone();
        tokio::spawn(async move { running.run_stale().await });
        assert_eq!(
            text(&rx.recv().await.unwrap()),
            "data: {\"type\":\"stale\",\"tags\":[\"attribution.ndjson\",\"receipts.ndjson\"]}\n\n"
        );
    }
}
