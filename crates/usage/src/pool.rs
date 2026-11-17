//! The account pool's state, read from its management API wherever it runs: its accounts
//! from its live stream, and its state files from where the last read stopped, each read
//! again when the stream says it grew.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::convert::Infallible;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail, ensure};
use axum::body::Bytes;
use parking_lot::Mutex;
use reqwest::StatusCode;
use reqwest::header::{CONTENT_RANGE, RANGE};
use serde::Deserialize;
use serde_json::value::RawValue;
use tokio::sync::Notify;

use crate::app::App;
use crate::deck::PoolState;
use crate::event::{Batch, Event};
use crate::views::{self, AppendLog, LimitReading};

/// The pool's state files this service follows, as the pool names them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum File {
    Receipts,
    Bindings,
    Readings,
    Credits,
}

impl File {
    const ALL: [File; 4] = [
        File::Receipts,
        File::Bindings,
        File::Readings,
        File::Credits,
    ];

    fn name(self) -> &'static str {
        match self {
            File::Receipts => "receipts.ndjson",
            File::Bindings => "attribution.ndjson",
            File::Readings => "usage-history.ndjson",
            File::Credits => "credits.json",
        }
    }
}

const RECEIPTS_CURSOR: &str = "pool:receipts.ndjson";
const PAGE: u64 = 8 << 20;
/// The pool's stream beats every 20 seconds; this long without a word, it's gone.
const SILENCE: Duration = Duration::from_secs(60);

/// A pool that doesn't serve its state files yet.
#[derive(Debug)]
struct NotServed;

impl std::fmt::Display for NotServed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("the pool doesn't serve its files yet")
    }
}

impl std::error::Error for NotServed {}

/// A file's bytes from an offset on, as the pool answers a range of it.
enum Page {
    At(u64, Bytes),
    End,
    /// It's shorter than the offset, so it was replaced: read it from the start.
    Shrank,
}

#[derive(Clone)]
struct Pool {
    base: String,
    key: String,
    http: reqwest::Client,
}

impl Pool {
    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .get(format!("{}/v8/management/{path}", self.base))
            .bearer_auth(&self.key)
    }

    async fn page(&self, file: File, from: u64) -> Result<Page> {
        let response = self
            .get(&format!("deck/files/{}", file.name()))
            .header(RANGE, format!("bytes={from}-{}", from + PAGE - 1))
            .timeout(Duration::from_mins(5))
            .send()
            .await?;
        match response.status() {
            StatusCode::PARTIAL_CONTENT => Ok(Page::At(from, response.bytes().await?)),
            StatusCode::OK => Ok(Page::At(0, response.bytes().await?)),
            StatusCode::RANGE_NOT_SATISFIABLE => {
                let size: u64 = response
                    .headers()
                    .get(CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok()?.strip_prefix("bytes */")?.parse().ok())
                    .context("a refused range without the file's size")?;
                Ok(if size < from { Page::Shrank } else { Page::End })
            }
            StatusCode::NOT_FOUND => Err(NotServed.into()),
            status => bail!("{status}"),
        }
    }

    /// Reads a file on from `from` a page at a time, handing `take` each page and the offset
    /// it starts at, 0 to start over; `take` returns how much it took, its whole lines.
    /// Returns where reading stopped.
    async fn follow(
        &self,
        file: File,
        mut from: u64,
        mut take: impl FnMut(u64, &[u8]) -> Result<u64>,
    ) -> Result<u64> {
        loop {
            match self.page(file, from).await? {
                Page::End => return Ok(from),
                Page::Shrank => from = take(0, &[])?,
                Page::At(start, bytes) => {
                    let took = take(start, &bytes)?;
                    from = start + took;
                    if (bytes.len() as u64) < PAGE {
                        return Ok(from);
                    }
                    ensure!(took > 0, "a line longer than {PAGE} bytes");
                }
            }
        }
    }

    async fn whole(&self, file: File) -> Result<Bytes> {
        let response = self
            .get(&format!("deck/files/{}", file.name()))
            .timeout(Duration::from_mins(1))
            .send()
            .await?;
        if response.status() == StatusCode::NOT_FOUND {
            return Err(NotServed.into());
        }
        Ok(response.error_for_status()?.bytes().await?)
    }

    /// The last `days` days of limit readings, from a pool that doesn't serve its files.
    async fn history(&self, days: u32) -> Result<Vec<LimitReading>> {
        #[derive(Deserialize)]
        struct History {
            readings: Vec<LimitReading>,
        }
        let history: History = self
            .get(&format!("pool/history?days={days}"))
            .timeout(Duration::from_mins(1))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(history.readings)
    }
}

/// The files the stream said grew, waiting to be read.
#[derive(Default)]
struct Wanted {
    files: Mutex<BTreeSet<File>>,
    ready: Notify,
}

impl Wanted {
    fn want(&self, files: impl IntoIterator<Item = File>) {
        self.files.lock().extend(files);
        self.ready.notify_one();
    }
}

type Changed = Arc<dyn Fn() + Send + Sync>;

/// Keeps the deck's view of the pool current, and runs `changed` after its accounts,
/// readings, session moves or grants change. While the pool can't be read, what was read
/// stays and the deck says why; the stream is tried again, sooner the longer it last held.
pub async fn follow(app: Arc<App>, changed: impl Fn() + Send + Sync + 'static) {
    let pool = Pool {
        base: app.config.pool.trim_end_matches('/').to_string(),
        key: app.key.clone(),
        http: reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("an HTTP client"),
    };
    let changed: Changed = Arc::new(changed);
    let wanted = Arc::new(Wanted::default());
    tokio::spawn(read_wanted(
        app.clone(),
        pool.clone(),
        wanted.clone(),
        changed.clone(),
    ));
    let mut wait = Duration::from_secs(1);
    loop {
        let started = Instant::now();
        let Err(e) = listen(&app, &pool, &wanted, &changed).await;
        let problem = format!("can't follow {}: {e:#}", pool.base);
        tracing::warn!("{problem}");
        app.deck.pool.lock().problem = Some(problem);
        if started.elapsed() > Duration::from_mins(1) {
            wait = Duration::from_secs(1);
        }
        tokio::time::sleep(wait).await;
        wait = (wait * 2).min(Duration::from_mins(1));
    }
}

#[derive(Deserialize)]
struct Frame {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    live: HashMap<String, Option<Box<RawValue>>>,
    #[serde(default)]
    tags: Vec<String>,
}

async fn listen(app: &App, pool: &Pool, wanted: &Wanted, changed: &Changed) -> Result<Infallible> {
    let mut response = pool.get("deck/events").send().await?.error_for_status()?;
    let mut buffer = Vec::new();
    loop {
        let chunk = tokio::time::timeout(SILENCE, response.chunk())
            .await
            .context("its stream went quiet")??
            .context("its stream ended")?;
        buffer.extend_from_slice(&chunk);
        while let Some(end) = memchr::memmem::find(&buffer, b"\n\n") {
            let event: Vec<u8> = buffer.drain(..end + 2).collect();
            for data in event
                .split(|&b| b == b'\n')
                .filter_map(|line| line.strip_prefix(b"data: "))
            {
                let frame: Frame = serde_json::from_slice(data)?;
                let snapshot = frame.kind == "snapshot";
                if (snapshot || frame.kind == "patch")
                    && take_accounts(&mut app.deck.pool.lock(), frame.live, snapshot)?
                {
                    changed();
                }
                if snapshot {
                    wanted.want(File::ALL);
                } else if frame.kind == "stale" {
                    wanted.want(
                        File::ALL
                            .into_iter()
                            .filter(|f| frame.tags.iter().any(|t| t == f.name())),
                    );
                }
            }
        }
    }
}

/// Takes the accounts (`a:<id>`) among a frame's live keys, all of them from a snapshot.
/// Returns whether any changed.
fn take_accounts(
    pool: &mut PoolState,
    live: HashMap<String, Option<Box<RawValue>>>,
    snapshot: bool,
) -> Result<bool> {
    let mut accounts = if snapshot {
        BTreeMap::new()
    } else {
        pool.accounts.clone()
    };
    for (key, value) in live {
        let Some(id) = key.strip_prefix("a:") else {
            continue;
        };
        match value {
            Some(value) => accounts.insert(id.to_string(), serde_json::from_str(value.get())?),
            None => accounts.remove(id),
        };
    }
    let changed = accounts != pool.accounts;
    pool.accounts = accounts;
    Ok(changed)
}

async fn read_wanted(app: Arc<App>, pool: Pool, wanted: Arc<Wanted>, changed: Changed) {
    loop {
        wanted.ready.notified().await;
        let files = std::mem::take(&mut *wanted.files.lock());
        let mut problems = Vec::new();
        let mut grew = false;
        for file in files {
            match read(&app, &pool, file).await {
                Ok(more) => grew |= more,
                Err(e) if e.is::<NotServed>() => {
                    problems.push(format!(
                        "{} doesn't serve its {} yet",
                        pool.base,
                        file.name()
                    ));
                }
                Err(e) => problems.push(format!("{} from {}: {e:#}", file.name(), pool.base)),
            }
        }
        for problem in &problems {
            tracing::warn!("{problem}");
        }
        let problem = (!problems.is_empty()).then(|| problems.join("; "));
        grew |= std::mem::replace(&mut app.deck.pool.lock().problem, problem.clone()) != problem;
        if grew {
            let changed = changed.clone();
            let _ = tokio::task::spawn_blocking(move || changed()).await;
        }
    }
}

/// Reads what a file gained. Returns whether the deck's view of the pool changed; receipts
/// tell the store's own listeners.
async fn read(app: &App, pool: &Pool, file: File) -> Result<bool> {
    let deck = &app.deck;
    match file {
        File::Receipts => {
            let from = app.store.cursor(RECEIPTS_CURSOR)?.map_or(0, |(_, at)| at);
            pool.follow(file, from, |start, bytes| {
                tokio::task::block_in_place(|| take_receipts(app, start, bytes))
            })
            .await?;
            Ok(false)
        }
        File::Bindings => follow_log(pool, file, &deck.bindings).await,
        File::Readings => match follow_log(pool, file, &deck.readings).await {
            Err(e) if e.is::<NotServed>() => {
                let days = if deck.readings.lock().rows().is_empty() {
                    90
                } else {
                    1
                };
                let readings = pool.history(days).await?;
                Ok(deck.readings.lock().take_recent(readings))
            }
            read => read,
        },
        File::Credits => {
            let grants =
                views::parse_grants(&pool.whole(file).await?).map_err(anyhow::Error::msg)?;
            let mut state = deck.pool.lock();
            let changed = state.grants.as_ref() != Some(&grants);
            state.grants = Some(grants);
            Ok(changed)
        }
    }
}

async fn follow_log<T>(pool: &Pool, file: File, log: &Mutex<AppendLog<T>>) -> Result<bool> {
    let mut grew = false;
    let from = log.lock().end();
    pool.follow(file, from, |start, bytes| {
        let took = log.lock().extend(start, bytes);
        grew |= took > 0 || start == 0;
        Ok(took)
    })
    .await?;
    Ok(grew)
}

/// Applies a page of receipts as this machine's records, and moves the cursor past its
/// whole lines; applying a receipt already held changes nothing.
fn take_receipts(app: &App, start: u64, bytes: &[u8]) -> Result<u64> {
    let whole = bytes.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    let events: Vec<Event> = bytes[..whole]
        .split(|&b| b == b'\n')
        .filter_map(|line| serde_json::from_slice::<Event>(line).ok())
        .filter(|e| !e.id.is_empty())
        .collect();
    if !events.is_empty() {
        app.store.apply(
            &Batch {
                device: app.local().clone(),
                events,
                ..Default::default()
            },
            false,
        )?;
    }
    app.store
        .set_cursor(RECEIPTS_CURSOR, 0, start + whole as u64)?;
    Ok(whole as u64)
}
