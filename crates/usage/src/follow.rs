//! Follows append-only ndjson files into the store, from where the last read stopped:
//! the Go proxy's per-device journals (`{"e":record}` and `{"d":id}` lines) while it
//! still keeps usage, and a proxy's receipts file (one record per line).

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::Deserialize;

use crate::event::{Batch, Device, Event};
use crate::store::Store;

#[derive(Clone, Copy, PartialEq)]
pub enum Format {
    /// Go's store journal: an upsert or a withdrawal per line, holding everything Go
    /// had for its device.
    Journal,
    /// One record per line.
    Receipts,
}

pub struct Followed {
    pub path: PathBuf,
    /// For a journal, `synced_at` is when Go last heard from the device.
    pub device: Device,
    pub format: Format,
    /// This service writes the device's records from a source of its own too: this
    /// machine's transcripts or receipts, or a GitHub repository it fetches.
    pub shared: bool,
}

impl Followed {
    /// Whether the journal no longer holds all the device has: the service writes it too,
    /// or the store heard from it after Go last did, as when it pushes here.
    fn heard_here(&self, store: &Store) -> Result<bool> {
        let at = store.synced_at(&self.device.id)?;
        Ok(self.shared
            || at
                .zip(self.device.synced_at)
                .is_some_and(|(at, go)| at > go))
    }
}

#[derive(Deserialize)]
struct JournalLine {
    #[serde(default)]
    e: Option<Event>,
    #[serde(default)]
    d: Option<String>,
}

enum Change {
    Put(Box<Event>),
    Withdraw(String),
}

fn parse(line: &[u8], format: Format) -> Option<Change> {
    match format {
        Format::Receipts => serde_json::from_slice::<Event>(line)
            .ok()
            .filter(|e| !e.id.is_empty())
            .map(|e| Change::Put(Box::new(e))),
        Format::Journal => match serde_json::from_slice::<JournalLine>(line).ok()? {
            JournalLine { e: Some(e), .. } => Some(Change::Put(Box::new(e))),
            JournalLine { d: Some(id), .. } if !id.is_empty() => Some(Change::Withdraw(id)),
            _ => None,
        },
    }
}

impl Change {
    fn id(&self) -> &str {
        match self {
            Change::Put(e) => &e.id,
            Change::Withdraw(id) => id,
        }
    }
}

/// Reads what was appended since the cursor and applies it in order. A file that was
/// replaced or shrank is read again from the start: a journal through `reread`, anything
/// else line by line, where applying a record already held changes nothing.
/// Returns how many lines were read.
pub fn catch_up(store: &Store, followed: &Followed) -> Result<usize> {
    let key = followed.path.to_string_lossy().into_owned();
    let Ok(mut file) = File::open(&followed.path) else {
        return Ok(0);
    };
    let meta = file.metadata()?;
    let (inode, offset) = match store.cursor(&key)? {
        Some((inode, offset)) if inode == meta.ino() && offset <= meta.len() => (inode, offset),
        _ => (meta.ino(), 0),
    };
    if offset == meta.len() {
        return Ok(0);
    }
    if followed.format == Format::Journal && offset == 0 {
        let (read, end) = reread(store, followed, &mut file)?;
        store.set_cursor(&key, inode, end)?;
        return Ok(read);
    }
    file.seek(SeekFrom::Start(offset))?;
    let mut read = 0;
    each_chunk(&mut file, followed.format, |changes, end| {
        read += changes.len();
        apply_in_order(store, &followed.device, changes, false)?;
        store.set_cursor(&key, inode, offset + end)
    })?;
    Ok(read)
}

/// Reads a journal from the start and applies each record's last line only, so a read cut
/// short and begun again ends where one whole read would. While Go alone hears from the
/// device, the journal is all it has: what it no longer names is withdrawn (Go compacts a
/// journal by renaming a fresh copy over it, so its last withdrawals are never read). Once
/// the store has heard from the device since Go did, the journal only adds the records the
/// store lacks and leaves every record it holds as it is. Returns the lines read and where
/// the read stopped.
fn reread(store: &Store, followed: &Followed, file: &mut File) -> Result<(usize, u64)> {
    let (mut last, mut lines) = (HashMap::new(), 0);
    let end = each_chunk(file, Format::Journal, |changes, _| {
        for change in changes {
            last.insert(change.id().to_owned(), lines);
            lines += 1;
        }
        Ok(())
    })?;
    file.seek(SeekFrom::Start(0))?;
    let mut line = 0;
    each_chunk(
        &mut (&mut *file).take(end),
        Format::Journal,
        |changes, _| {
            let latest = changes
                .into_iter()
                .filter(|change| {
                    line += 1;
                    last.get(change.id()) == Some(&(line - 1))
                })
                .collect();
            apply_in_order(store, &followed.device, latest, followed.heard_here(store)?)
        },
    )?;
    if !followed.heard_here(store)? {
        let gone = store
            .device_ids(&followed.device.id)?
            .into_iter()
            .filter(|id| !last.contains_key(id));
        apply_in_order(
            store,
            &followed.device,
            gone.map(Change::Withdraw).collect(),
            false,
        )?;
    }
    Ok((lines, end))
}

/// Hands each run of whole lines to `f` with how far into the reader they end, and returns
/// where the last whole line ends.
fn each_chunk(
    reader: &mut impl Read,
    format: Format,
    mut f: impl FnMut(Vec<Change>, u64) -> Result<()>,
) -> Result<u64> {
    let mut done = 0;
    let mut chunk = vec![0u8; 8 << 20];
    let mut carry: Vec<u8> = Vec::new();
    loop {
        let n = reader.read(&mut chunk)?;
        if n == 0 {
            return Ok(done);
        }
        carry.extend_from_slice(&chunk[..n]);
        let Some(end) = carry.iter().rposition(|&b| b == b'\n') else {
            continue;
        };
        let changes = carry[..end]
            .split(|&b| b == b'\n')
            .filter_map(|line| parse(line, format))
            .collect();
        done += end as u64 + 1;
        carry.drain(..=end);
        f(changes, done)?;
    }
}

/// Applies upserts and withdrawals in file order, a run of one kind at a time. With
/// `fill`, as `Store::apply` takes it, only records the store lacks are added.
fn apply_in_order(store: &Store, device: &Device, changes: Vec<Change>, fill: bool) -> Result<()> {
    let mut batch = Batch {
        device: device.clone(),
        ..Default::default()
    };
    let flush = |batch: &mut Batch| -> Result<()> {
        store.apply(&std::mem::take(batch), fill)?;
        batch.device = device.clone();
        Ok(())
    };
    for change in changes {
        match change {
            Change::Put(e) => {
                if !batch.deleted_ids.is_empty() {
                    flush(&mut batch)?;
                }
                batch.events.push(*e);
            }
            Change::Withdraw(id) => {
                if !batch.events.is_empty() {
                    flush(&mut batch)?;
                }
                batch.deleted_ids.push(id);
            }
        }
        if batch.events.len() + batch.deleted_ids.len() >= 2000 {
            flush(&mut batch)?;
        }
    }
    if !batch.events.is_empty() || !batch.deleted_ids.is_empty() {
        flush(&mut batch)?;
    }
    Ok(())
}

/// The Go store's journals: one per device in `<dir>/events`, labeled by `<dir>/devices.json`.
/// `shared` says which devices this service also writes itself.
pub fn go_journals(dir: &Path, local: &Device, shared: impl Fn(&Device) -> bool) -> Vec<Followed> {
    let devices: Vec<Device> = std::fs::read(dir.join("devices.json"))
        .ok()
        .and_then(|d| serde_json::from_slice(&d).ok())
        .unwrap_or_default();
    devices
        .into_iter()
        .map(|device| {
            let device = if device.id == local.id {
                Device {
                    synced_at: device.synced_at,
                    ..local.clone()
                }
            } else {
                device
            };
            Followed {
                path: dir
                    .join("events")
                    .join(format!("{}.ndjson", path_escape(&device.id))),
                shared: shared(&device),
                device,
                format: Format::Journal,
            }
        })
        .collect()
}

/// Go's url.PathEscape, as its journal file names use it.
fn path_escape(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'.'
            | b'_'
            | b'~'
            | b':'
            | b'@'
            | b'&'
            | b'='
            | b'+'
            | b'$' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}
