use foldhash::{HashMap, HashMapExt, HashSet, HashSetExt};
use serde::Deserialize;
use serde_json::Value;

use super::sessions::Prepared;
use super::timeframe::parse_millis;

/// One row of the pool's per-session account log (attribution.ndjson).
#[derive(Debug, Clone, PartialEq)]
pub struct Binding {
    pub at: String,
    pub session_id: String,
    pub account_id: Option<String>,
    pub event: String,
    pub cause: String,
    pub millis: f64,
}

/// One sample of an account's limits (usage-history.ndjson).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitReading {
    pub account: String,
    pub at: f64,
    #[serde(default)]
    pub five_hour: Option<f64>,
    #[serde(default)]
    pub week: Option<f64>,
    #[serde(default)]
    pub five_hour_resets_at: Option<f64>,
    #[serde(default)]
    pub week_resets_at: Option<f64>,
}

/// A limit window's kind, in the order points and charges index them.
pub const KINDS: [&str; 2] = ["fiveHour", "week"];

pub(crate) fn kind_index(kind: &str) -> usize {
    usize::from(kind != KINDS[0])
}

impl LimitReading {
    pub(crate) fn value(&self, kind: usize) -> Option<f64> {
        [self.five_hour, self.week][kind]
    }

    pub(crate) fn resets_at(&self, kind: usize) -> Option<f64> {
        [self.five_hour_resets_at, self.week_resets_at][kind]
    }
}

pub fn parse_reading(line: &[u8]) -> Option<LimitReading> {
    serde_json::from_slice(line).ok()
}

pub fn parse_binding(line: &[u8]) -> Option<Binding> {
    let row: Value = serde_json::from_slice(line).ok()?;
    let text = |key: &str| {
        row.get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let (at, session_id, event) = (text("at"), text("sessionId"), text("event"));
    let millis = parse_millis(&at);
    if at.is_empty() || millis.is_nan() || session_id.is_empty() {
        return None;
    }
    if !matches!(event.as_str(), "start" | "failure" | "observe-live") {
        return None;
    }
    // A subagent's binding can sit on another account than its session's own conversation.
    if !text("agent").is_empty() {
        return None;
    }
    let account_id = match row.get("accountId") {
        Some(Value::String(account)) => Some(account.clone()),
        None | Some(Value::Null) if event == "observe-live" => None,
        _ => return None,
    };
    Some(Binding {
        at,
        session_id,
        account_id,
        event,
        cause: text("cause"),
        millis,
    })
}

/// An append-only ndjson log read in pieces: the rows of its whole lines, and how far into
/// the log they reach.
pub struct AppendLog<T> {
    parse: fn(&[u8]) -> Option<T>,
    rows: Vec<T>,
    end: u64,
}

impl<T> AppendLog<T> {
    pub fn new(parse: fn(&[u8]) -> Option<T>) -> Self {
        AppendLog {
            parse,
            rows: Vec::new(),
            end: 0,
        }
    }

    pub fn rows(&self) -> &[T] {
        &self.rows
    }

    pub fn end(&self) -> u64 {
        self.end
    }

    /// Adds the whole lines of `bytes`, which start `from` bytes into the log; from its start,
    /// they replace every row. Returns how many bytes it took.
    pub fn extend(&mut self, from: u64, bytes: &[u8]) -> u64 {
        if from == 0 {
            self.rows.clear();
        }
        let whole = bytes.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
        self.rows
            .extend(bytes[..whole].split(|&b| b == b'\n').filter_map(self.parse));
        self.end = from + whole as u64;
        whole as u64
    }
}

impl AppendLog<LimitReading> {
    /// Takes readings from a pool that serves only its recent history: they replace what's
    /// held from the earliest of them on. Returns whether that changed any.
    pub fn take_recent(&mut self, readings: Vec<LimitReading>) -> bool {
        let Some(from) = readings.iter().map(|r| r.at).reduce(f64::min) else {
            return false;
        };
        let (kept, replaced): (Vec<_>, Vec<_>) = std::mem::take(&mut self.rows)
            .into_iter()
            .partition(|r| r.at < from);
        let changed = replaced != readings;
        self.rows = kept;
        self.rows.extend(readings);
        changed
    }
}

/// Readings in time order, keeping file order for ties.
pub fn sorted_readings(rows: &[LimitReading]) -> Vec<LimitReading> {
    let mut out = rows.to_vec();
    out.sort_by(|a, b| a.at.partial_cmp(&b.at).unwrap_or(std::cmp::Ordering::Equal));
    out
}

fn by_millis(rows: &mut [Binding]) {
    rows.sort_by(|a, b| {
        a.millis
            .partial_cmp(&b.millis)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
}

/// token-tracker's attribution history: account-bound hooks, plus process scans for
/// sessions no hook named, where a scan that saw several accounts within a second
/// binds the session to none.
pub fn binding_history(all: &[Binding]) -> Vec<Binding> {
    let mut rows = all.to_vec();
    by_millis(&mut rows);
    let mut authoritative = HashSet::new();
    let mut history = Vec::new();
    for row in rows.iter().filter(|row| row.event != "observe-live") {
        if row.account_id.as_deref().is_some_and(|a| !a.is_empty()) {
            authoritative.insert(row.session_id.as_str());
        }
        history.push(row.clone());
    }
    let mut order = Vec::new();
    let mut observed: HashMap<&str, Vec<&Binding>> = HashMap::new();
    for row in &rows {
        if row.event != "observe-live" || authoritative.contains(row.session_id.as_str()) {
            continue;
        }
        observed
            .entry(&row.session_id)
            .or_insert_with(|| {
                order.push(row.session_id.as_str());
                Vec::new()
            })
            .push(row);
    }
    for session in order {
        let observations = &observed[session];
        let mut i = 0;
        while i < observations.len() {
            let mut first = observations[i].clone();
            let mut accounts: HashSet<Option<String>> =
                [first.account_id.clone()].into_iter().collect();
            i += 1;
            while i < observations.len() && observations[i].millis - first.millis <= 1000.0 {
                accounts.insert(observations[i].account_id.clone());
                i += 1;
            }
            if accounts.len() != 1 {
                first.account_id = None;
            }
            history.push(first);
        }
    }
    by_millis(&mut history);
    history
}

/// Finds the account a Claude request's session was bound to at the request's own time.
pub struct AccountLookup {
    by_session: HashMap<String, Vec<(f64, Option<String>)>>,
}

impl AccountLookup {
    pub fn new(history: &[Binding]) -> Self {
        let mut by_session: HashMap<String, Vec<(f64, Option<String>)>> = HashMap::new();
        for row in history {
            by_session
                .entry(row.session_id.clone())
                .or_default()
                .push((row.millis, row.account_id.clone()));
        }
        AccountLookup { by_session }
    }

    pub fn account_of<'a>(&'a self, event: &'a Prepared) -> &'a str {
        if !event.account_id.is_empty() {
            return &event.account_id[..];
        }
        let Some(list) = self.by_session.get(&*event.session_id) else {
            return "";
        };
        if &*event.harness != "claude" || event.millis.is_nan() {
            return "";
        }
        let at = list.partition_point(|(millis, _)| *millis <= event.millis);
        match at.checked_sub(1).map(|i| &list[i].1) {
            Some(Some(account)) => account,
            _ => "",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::views::Row;
    use crate::views::sessions::prepare;

    fn bind(session: &str, account: &str, event: &str, millis: f64) -> Binding {
        Binding {
            at: String::new(),
            session_id: session.into(),
            account_id: Some(account.into()),
            event: event.into(),
            cause: String::new(),
            millis,
        }
    }

    #[test]
    fn scans_that_saw_two_accounts_bind_none() {
        let history = binding_history(&[
            bind("hooked", "a", "start", 10.0),
            bind("hooked", "b", "observe-live", 20.0),
            bind("scanned", "a", "observe-live", 30.0),
            bind("scanned", "b", "observe-live", 900.0),
            bind("scanned", "b", "observe-live", 5000.0),
        ]);
        let lookup = AccountLookup::new(&history);
        let at = |session: &str, ms: f64| {
            let rows = [Row {
                harness: "claude".into(),
                session_id: session.into(),
                millis: ms,
                ..Default::default()
            }];
            lookup.account_of(&prepare(&rows)[0]).to_string()
        };
        assert_eq!(
            [
                at("hooked", 30.0),
                at("scanned", 100.0),
                at("scanned", 6000.0),
                at("scanned", 10.0)
            ],
            ["a", "", "b", ""]
        );
    }

    #[test]
    fn append_log_takes_whole_lines_and_starts_over_from_zero() {
        let mut log = AppendLog::new(parse_reading);
        let first =
            b"{\"account\":\"a\",\"at\":1,\"fiveHour\":1,\"week\":2}\n{\"account\":\"a\",\"at\":2,";
        let took = log.extend(0, first);
        assert_eq!((log.rows().len(), log.end()), (1, took));
        let rest =
            b"{\"account\":\"a\",\"at\":2,\"fiveHour\":null,\"week\":3}\nnot json\n{\"at\":3}\n";
        log.extend(log.end(), rest);
        let rows = log.rows();
        assert_eq!(
            (rows.len(), rows[1].five_hour, rows[1].week),
            (2, None, Some(3.0))
        );
        log.extend(
            0,
            b"{\"account\":\"b\",\"at\":9,\"fiveHour\":0,\"week\":0}\n",
        );
        assert_eq!((log.rows().len(), log.rows()[0].account.as_str()), (1, "b"));
    }

    #[test]
    fn recent_readings_replace_what_is_held_from_their_start() {
        let reading = |at: f64, week: f64| LimitReading {
            account: "a".into(),
            at,
            five_hour: None,
            week: Some(week),
            five_hour_resets_at: None,
            week_resets_at: None,
        };
        let mut log = AppendLog::new(parse_reading);
        assert!(log.take_recent(vec![
            reading(1.0, 1.0),
            reading(2.0, 2.0),
            reading(3.0, 3.0)
        ]));
        assert!(log.take_recent(vec![
            reading(3.0, 3.0),
            reading(2.5, 2.5),
            reading(4.0, 4.0)
        ]));
        let weeks: Vec<f64> = log.rows().iter().filter_map(|r| r.week).collect();
        assert_eq!(weeks, [1.0, 2.0, 3.0, 2.5, 4.0]);
        assert!(!log.take_recent(vec![
            reading(3.0, 3.0),
            reading(2.5, 2.5),
            reading(4.0, 4.0)
        ]));
        assert!(!log.take_recent(Vec::new()));
        assert_eq!(log.rows().len(), 5);
    }

    #[test]
    fn bindings_keep_only_known_events() {
        let parse = |line: &str| parse_binding(line.as_bytes()).map(|b| b.account_id);
        assert_eq!(
            parse(
                r#"{"at":"2026-10-14T06:00:03.181Z","sessionId":"s","accountId":"a","event":"start"}"#
            ),
            Some(Some("a".into()))
        );
        assert_eq!(
            parse(
                r#"{"at":"2026-10-14T06:00:03.181Z","sessionId":"s","accountId":null,"event":"observe-live"}"#
            ),
            Some(None)
        );
        assert_eq!(
            parse(
                r#"{"at":"2026-10-14T06:00:03.181Z","sessionId":"s","accountId":null,"event":"start"}"#
            ),
            None
        );
        assert_eq!(
            parse(
                r#"{"at":"2026-10-14T06:00:03.181Z","sessionId":"s","accountId":"b","event":"start","agent":"a06b74126f7b5358a"}"#
            ),
            None
        );
        assert_eq!(
            parse(
                r#"{"at":"2026-10-14T06:00:03.181Z","sessionId":"s","accountId":"a","event":"move"}"#
            ),
            None
        );
    }
}
