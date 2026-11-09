//! The running service: the store, what feeds it, and the deck over it, each following
//! the real change that concerns it.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use axum::extract::{RawQuery, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use tokio::sync::mpsc;

use crate::config::Config;
use crate::deck::Deck;
use crate::event::{Batch, Device};
use crate::follow::{self, Followed, Format};
use crate::github::GitHub;
use crate::pricing::Pricing;
use crate::store::Store;
use crate::views::Range;

pub struct App {
    pub config: Config,
    pub store: Arc<Store>,
    pub pricing: Arc<Pricing>,
    pub deck: Arc<Deck>,
    pub key: String,
}

impl App {
    pub fn local(&self) -> &Device {
        self.store.local()
    }

    /// Every file this service follows into the store.
    fn followed(&self) -> Vec<Followed> {
        let mut out = Vec::new();
        if let Some(dir) = &self.config.go_usage_dir {
            let shared_local = self.config.collects() || self.config.receipts.is_some();
            out.extend(follow::go_journals(dir, self.local(), shared_local));
        }
        if let Some(path) = &self.config.receipts {
            out.push(Followed {
                path: path.clone(),
                device: self.local().clone(),
                format: Format::Receipts,
                whole: false,
            });
        }
        out
    }

    /// Reads what the followed files gained.
    pub fn catch_up(&self) -> Result<usize> {
        let mut read = 0;
        for followed in self.followed() {
            read += follow::catch_up(&self.store, &followed)?;
        }
        Ok(read)
    }
}

/// Starts everything that keeps the store and the deck current.
pub fn start(app: Arc<App>) {
    let deck = app.deck.clone();
    tokio::task::spawn_blocking({
        let store = app.store.clone();
        move || {
            if let Err(e) = store.reprice_if_stale() {
                tracing::warn!("repricing: {e:#}");
            }
        }
    });
    tokio::spawn({
        let store = app.store.clone();
        app.pricing.clone().run(move |policy| {
            let store = store.clone();
            tokio::task::spawn_blocking(move || {
                if let Err(e) = store.set_policy(policy) {
                    tracing::warn!("repricing: {e:#}");
                }
            });
        })
    });
    if app.config.collects() {
        let app = app.clone();
        std::thread::spawn(move || collect(&app));
    }
    if !app.config.github_repos.is_empty() {
        let github = GitHub::new(
            &app.config.state_dir,
            app.config.github_repos.clone(),
            app.pricing.clone(),
        );
        let store = app.store.clone();
        tokio::spawn(github.run(move |batch| {
            tokio::task::block_in_place(|| store.apply(&batch, true).map(|_| ()))
        }));
    }
    let limits_changed = Arc::new(tokio::sync::Notify::new());
    tokio::spawn({
        let deck = deck.clone();
        let limits_changed = limits_changed.clone();
        let mut revision = app.store.subscribe();
        async move {
            loop {
                tokio::select! {
                    changed = revision.changed() => if changed.is_err() { return },
                    () = limits_changed.notified() => {}
                }
                tokio::time::sleep(Duration::from_secs(15)).await;
                revision.mark_unchanged();
                deck.usage_changed();
            }
        }
    });
    let pool = app.config.pool_dir.clone();
    let receipts = app.config.receipts.clone();
    if let Err(e) = std::fs::create_dir_all(pool.join("plans")) {
        tracing::warn!("creating {}: {e}", pool.display());
    }
    spawn_watch(
        &[(pool.clone(), false), (pool.join("plans"), false)],
        Duration::from_secs(1),
        move |path| receipts.as_deref() != Some(path),
        {
            let deck = deck.clone();
            move || {
                limits_changed.notify_one();
                deck.publish();
            }
        },
    );
    let claude = &app.config.claude;
    let (sessions, jobs) = (claude.join("sessions"), claude.join("jobs"));
    let hex_state = app.config.hex.join("state");
    spawn_watch(
        &[
            (sessions.clone(), false),
            (jobs.clone(), true),
            (hex_state.clone(), true),
        ],
        Duration::from_millis(250),
        move |path| {
            let named = |root: &Path, names: &[&str]| {
                path.strip_prefix(root)
                    .is_ok_and(|rest| rest.components().count() == 2)
                    && path
                        .file_name()
                        .is_some_and(|n| names.iter().any(|x| n == *x))
            };
            path.starts_with(&sessions)
                || named(&jobs, &["state.json"])
                || named(&hex_state, &["sessions", "hub.sock"])
        },
        {
            let deck = deck.clone();
            move || {
                deck.refresh_processes();
                deck.publish();
            }
        },
    );
    tokio::spawn(follow_hex(
        deck.clone(),
        app.config.hex.join(".hex/bin/hex"),
    ));
    tokio::spawn({
        let deck = deck.clone();
        async move {
            let mut minute = tokio::time::interval(Duration::from_secs(60));
            let mut beat = tokio::time::interval(Duration::from_secs(20));
            let mut five = tokio::time::interval(Duration::from_secs(300));
            loop {
                tokio::select! {
                    _ = minute.tick() => {
                        let deck = deck.clone();
                        let _ = tokio::task::spawn_blocking(move || { deck.refresh_processes(); deck.publish(); }).await;
                    }
                    _ = beat.tick() => deck.stream.heartbeat(),
                    _ = five.tick() => deck.reload(true),
                }
            }
        }
    });
    tokio::spawn(async move {
        let first = app.clone();
        if let Ok(Err(e)) = tokio::task::spawn_blocking(move || first.catch_up()).await {
            tracing::warn!("following files: {e:#}");
        }
        tokio::spawn(follow_files(app));
        let names = deck.clone();
        let _ = tokio::task::spawn_blocking(move || names.refresh_names()).await;
        deck.publish();
        if let Err(e) = deck.warm(vec![Range::Week]).await {
            tracing::warn!("loading 7d: {e:#}");
        }
    });
}

/// The folders to watch for transcripts. A folder that doesn't exist yet is not created:
/// the nearest existing folder above it is watched instead, and `arm` moves the watch
/// onto the folder itself once it appears.
struct Roots {
    wanted: Vec<PathBuf>,
    watching: std::collections::HashSet<PathBuf>,
    waiting_on: std::collections::HashSet<PathBuf>,
}

impl Roots {
    fn new(wanted: Vec<PathBuf>) -> Self {
        Self {
            wanted,
            watching: std::collections::HashSet::default(),
            waiting_on: std::collections::HashSet::default(),
        }
    }

    /// Returns whether a folder was newly watched, so the files already in it get read.
    fn arm(&mut self, watcher: &mut impl Watcher) -> bool {
        let mut armed = false;
        for root in &self.wanted {
            if self.watching.contains(root) {
                continue;
            }
            if root.is_dir() {
                match watcher.watch(root, RecursiveMode::Recursive) {
                    Ok(()) => {
                        armed = true;
                        self.watching.insert(root.clone());
                    }
                    Err(e) => tracing::warn!("watching {}: {e}", root.display()),
                }
            } else if let Some(above) = root.ancestors().skip(1).find(|p| p.is_dir())
                && self.waiting_on.insert(above.to_path_buf())
            {
                tracing::info!(
                    "{} not there yet; watching {}",
                    root.display(),
                    above.display()
                );
                if let Err(e) = watcher.watch(above, RecursiveMode::NonRecursive) {
                    tracing::warn!("watching {}: {e}", above.display());
                }
            }
        }
        armed
    }
}

/// Collects this machine's transcripts into the store, then again whenever they change:
/// once writes go quiet for a second, or five seconds into a steady stream.
fn collect(app: &App) {
    let sources = crate::collect::Sources {
        device_id: app.local().id.clone(),
        ..Default::default()
    };
    let mut collector =
        match crate::collect::Collector::open(sources, &app.config.state_dir.join("collect.db")) {
            Ok(c) => c,
            Err(e) => return tracing::error!("collector: {e:#}"),
        };
    let (tx, rx) = std::sync::mpsc::channel();
    let Ok(mut watcher) =
        notify::recommended_watcher(move |event: notify::Result<notify::Event>| match event {
            Ok(e) if matches!(e.kind, notify::EventKind::Access(_)) => {}
            Ok(e) if !e.need_rescan() => {
                let _ = tx.send(Some(e.paths));
            }
            _ => {
                let _ = tx.send(None);
            }
        })
    else {
        return;
    };
    let mut roots = Roots::new(collector.roots());
    loop {
        if roots.arm(&mut watcher) {
            collector.rescan();
        }
        let policy = app.pricing.policy();
        let device = app.local().clone();
        let result = collector.collect(&policy, |c| {
            for warning in &c.warnings {
                tracing::warn!("collector: {warning}");
            }
            app.store
                .apply(
                    &Batch {
                        device,
                        events: c.events,
                        deleted_ids: c.retracted_ids,
                    },
                    false,
                )
                .map(|_| ())
        });
        if let Err(e) = result {
            tracing::warn!("collecting: {e:#}");
        }
        let Ok(first) = rx.recv() else {
            return;
        };
        let mut note = |paths: Option<Vec<PathBuf>>| match paths {
            Some(paths) => collector.changed(paths),
            None => collector.rescan(),
        };
        note(first);
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while let Ok(paths) = rx.recv_timeout(
            Duration::from_secs(1)
                .min(deadline.saturating_duration_since(std::time::Instant::now())),
        ) {
            note(paths);
            if std::time::Instant::now() >= deadline {
                break;
            }
        }
        while let Ok(paths) = rx.try_recv() {
            note(paths);
        }
    }
}

/// Calls `changed` once things go quiet for `wait` after a burst of changes to
/// `relevant` paths under `paths` (each watched alone, or with everything below it).
fn spawn_watch(
    paths: &[(PathBuf, bool)],
    wait: Duration,
    relevant: impl Fn(&Path) -> bool + Send + 'static,
    changed: impl Fn() + Send + Sync + 'static,
) {
    let changed = Arc::new(changed);
    let (tx, mut rx) = mpsc::unbounded_channel();
    let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(e) = event
            && !matches!(e.kind, notify::EventKind::Access(_))
            && (e.need_rescan() || e.paths.iter().any(|p| relevant(p)))
        {
            let _ = tx.send(());
        }
    });
    let Ok(mut watcher) = watcher else { return };
    for (path, children) in paths {
        let mode = if *children {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };
        if let Err(e) = watcher.watch(path, mode) {
            tracing::debug!("watching {}: {e}", path.display());
        }
    }
    tokio::spawn(async move {
        let _watcher = watcher;
        while rx.recv().await.is_some() {
            tokio::time::sleep(wait).await;
            while rx.try_recv().is_ok() {}
            let _ = tokio::task::spawn_blocking({
                let changed = changed.clone();
                move || changed()
            })
            .await;
        }
    });
}

/// Follows `hex watch`, which prints a line whenever a thread's name changes.
async fn follow_hex(deck: Arc<Deck>, hex: PathBuf) {
    use tokio::io::AsyncBufReadExt;
    if !hex.exists() {
        return;
    }
    loop {
        let child = tokio::process::Command::new(&hex)
            .arg("watch")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn();
        if let Ok(mut child) = child {
            if let Some(out) = child.stdout.take() {
                let mut lines = tokio::io::BufReader::new(out).lines();
                while let Ok(Some(_)) = lines.next_line().await {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    let names = deck.clone();
                    let _ = tokio::task::spawn_blocking(move || names.refresh_names()).await;
                    deck.publish();
                    deck.stream.stale(&["usage"]);
                }
            }
            let _ = child.wait().await;
        }
        tracing::warn!("hex watch exited; starting it again");
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

/// Catches up whenever a followed file changes: once the writes go quiet for a second,
/// or five seconds into a steady stream.
pub async fn follow_files(app: Arc<App>) {
    let dirs: std::collections::BTreeSet<PathBuf> = app
        .followed()
        .iter()
        .filter_map(|f| f.path.parent().map(Path::to_path_buf))
        .collect();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let Ok(mut watcher) =
        notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            if event.is_ok_and(|e| !matches!(e.kind, notify::EventKind::Access(_))) {
                let _ = tx.send(());
            }
        })
    else {
        return;
    };
    for dir in &dirs {
        if let Err(e) = std::fs::create_dir_all(dir).and_then(|()| {
            watcher
                .watch(dir, RecursiveMode::NonRecursive)
                .map_err(std::io::Error::other)
        }) {
            tracing::warn!("watching {}: {e}", dir.display());
        }
    }
    let pass = |app: Arc<App>| async move {
        match tokio::task::spawn_blocking(move || app.catch_up()).await {
            Ok(Ok(n)) if n > 0 => tracing::debug!("followed {n} lines"),
            Ok(Err(e)) => tracing::warn!("following files: {e:#}"),
            _ => {}
        }
    };
    pass(app.clone()).await;
    while rx.recv().await.is_some() {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            tokio::select! {
                more = rx.recv() => if more.is_none() { return },
                () = tokio::time::sleep(Duration::from_secs(1)) => break,
                () = tokio::time::sleep_until(deadline) => break,
            }
        }
        pass(app.clone()).await;
    }
}

fn reply<T: Serialize>(result: Result<T, String>) -> Response {
    let headers = [(header::CACHE_CONTROL, "no-store")];
    match result {
        Ok(value) => (headers, axum::Json(value)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            headers,
            axum::Json(serde_json::json!({"error": e})),
        )
            .into_response(),
    }
}

pub async fn usage(State(app): State<Arc<App>>, RawQuery(query): RawQuery) -> Response {
    reply(
        app.deck
            .usage(query.as_deref().unwrap_or(""))
            .await
            .map_err(|e| e.to_string()),
    )
}

pub async fn sessions(State(app): State<Arc<App>>, RawQuery(query): RawQuery) -> Response {
    let range = form_urlencoded::parse(query.unwrap_or_default().as_bytes())
        .find(|(k, _)| k == "range")
        .map_or(Range::Week, |(_, v)| Range::parse(&v));
    reply(app.deck.sessions(range).await.map_err(|e| e.to_string()))
}

pub async fn credits(State(app): State<Arc<App>>) -> Response {
    reply(app.deck.credits().await.as_ref().clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_root_that_appears_later_is_watched_without_being_created() {
        let base = std::env::temp_dir().join(format!("app-roots-{}", std::process::id()));
        let root = base.join("tool/sessions");
        std::fs::create_dir_all(&base).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        })
        .unwrap();
        let mut roots = Roots::new(vec![root.clone()]);
        assert!(!roots.arm(&mut watcher));
        assert!(!root.exists());

        std::fs::create_dir_all(&root).unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(5)).is_ok());
        assert!(roots.arm(&mut watcher));
        while rx.try_recv().is_ok() {}
        std::fs::write(root.join("late.jsonl"), "{}").unwrap();
        let seen = rx.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        assert!(seen.paths.iter().any(|p| p.starts_with(&root)));
        std::fs::remove_dir_all(base).unwrap();
    }
}
