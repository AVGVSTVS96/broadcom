use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    os::unix::fs::OpenOptionsExt,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

use serde::Serialize;

/// Writes `bytes` to a temporary file beside `path` and renames it over `path`, so a reader
/// sees the old file or the new one, never half of one.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    static WRITES: AtomicU64 = AtomicU64::new(0);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension(format!(
        "tmp.{}.{}",
        std::process::id(),
        WRITES.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(&tmp, path)
}

pub fn write_json(path: &Path, value: &impl Serialize) -> io::Result<()> {
    write_atomic(
        path,
        &serde_json::to_vec_pretty(value).map_err(io::Error::other)?,
    )
}

/// Appends `value` as one line to the ndjson file `name` in `dir`.
pub fn append(dir: &Path, name: &str, value: &impl Serialize) {
    let mut line = serde_json::to_vec(value).expect("records serialize");
    line.push(b'\n');
    let result = fs::create_dir_all(dir).and_then(|()| {
        OpenOptions::new()
            .append(true)
            .create(true)
            .mode(0o600)
            .open(dir.join(name))?
            .write_all(&line)
    });
    if let Err(err) = result {
        eprintln!("append {name}: {err}");
    }
}

/// What a reader gets of a file it asked for whole or from a byte offset on.
#[derive(Debug, PartialEq)]
pub enum Slice {
    Whole(Vec<u8>),
    Part {
        from: u64,
        size: u64,
        bytes: Vec<u8>,
    },
    /// The offset is at or past the end of a file this long.
    Past(u64),
}

/// Reads a file whole, or bytes `from` through `to` (to its end without one); a file not
/// written yet reads as empty.
pub fn read_range(path: &Path, range: Option<(u64, Option<u64>)>) -> io::Result<Slice> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            return Ok(range.map_or(Slice::Whole(Vec::new()), |_| Slice::Past(0)));
        }
        Err(e) => return Err(e),
    };
    let mut bytes = Vec::new();
    let Some((from, to)) = range else {
        file.read_to_end(&mut bytes)?;
        return Ok(Slice::Whole(bytes));
    };
    let size = file.metadata()?.len();
    if from >= size {
        return Ok(Slice::Past(size));
    }
    let end = to.map_or(size, |to| (to + 1).min(size));
    file.seek(SeekFrom::Start(from))?;
    file.take(end - from).read_to_end(&mut bytes)?;
    Ok(Slice::Part { from, size, bytes })
}

pub fn now_ms() -> i64 {
    jiff::Timestamp::now().as_millisecond()
}

/// A time as the records write it: RFC 3339 in UTC.
pub fn utc(ms: i64) -> String {
    jiff::Timestamp::from_millisecond(ms)
        .map(|t| t.to_string())
        .unwrap_or_default()
}

/// A time as credential files write it: RFC 3339 with the local offset.
pub fn local(ms: i64) -> String {
    jiff::Timestamp::from_millisecond(ms)
        .map(|t| {
            t.to_zoned(jiff::tz::TimeZone::system())
                .strftime("%Y-%m-%dT%H:%M:%S%:z")
                .to_string()
        })
        .unwrap_or_default()
}

/// A time as people read it in the reset plan: "Mon Jan 2 3:04pm", local.
pub fn when(ms: i64) -> String {
    jiff::Timestamp::from_millisecond(ms)
        .map(|t| {
            t.to_zoned(jiff::tz::TimeZone::system())
                .strftime("%a %b %-d %-I:%M%P")
                .to_string()
        })
        .unwrap_or_default()
}

pub fn parse_ms(text: &str) -> Option<i64> {
    text.parse::<jiff::Timestamp>()
        .ok()
        .map(jiff::Timestamp::as_millisecond)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_reads_whole_or_from_an_offset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipts.ndjson");
        assert_eq!(read_range(&path, Some((0, None))).unwrap(), Slice::Past(0));
        assert_eq!(read_range(&path, None).unwrap(), Slice::Whole(Vec::new()));
        fs::write(&path, "a\nbc\n").unwrap();
        assert_eq!(
            read_range(&path, Some((2, None))).unwrap(),
            Slice::Part {
                from: 2,
                size: 5,
                bytes: b"bc\n".to_vec()
            }
        );
        assert_eq!(
            read_range(&path, Some((0, Some(2)))).unwrap(),
            Slice::Part {
                from: 0,
                size: 5,
                bytes: b"a\nb".to_vec()
            }
        );
        assert_eq!(read_range(&path, Some((5, None))).unwrap(), Slice::Past(5));
        assert_eq!(
            read_range(&path, None).unwrap(),
            Slice::Whole(b"a\nbc\n".to_vec())
        );
    }
}
