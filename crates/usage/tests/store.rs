#![allow(clippy::unwrap_used)]

use broadcom_usage::event::{Batch, Device, Event};
use broadcom_usage::pricing::Pricing;
use broadcom_usage::store::Store;

fn device(id: &str) -> Device {
    Device {
        id: id.into(),
        label: id.into(),
        synced_at: None,
    }
}

fn open(dir: &std::path::Path) -> Store {
    let pricing = Pricing::open(dir, None);
    Store::open(&dir.join("usage.db"), device("server"), pricing.policy()).unwrap()
}

fn record(id: &str, output: i64) -> Event {
    Event {
        id: id.into(),
        timestamp: "2026-11-03T00:00:00Z".into(),
        harness: "claude".into(),
        model: "claude-opus-4-5-20251101".into(),
        project: "/work/project".into(),
        session_id: "session".into(),
        input_tokens: 100,
        output_tokens: output,
        service_tier: Some("standard".into()),
        cache_write_1h_tokens: Some(0),
        ..Default::default()
    }
}

fn batch(device_id: &str, events: Vec<Event>, deleted: &[&str]) -> Batch {
    Batch {
        device: device(device_id),
        events,
        deleted_ids: deleted
            .iter()
            .map(std::string::ToString::to_string)
            .collect(),
    }
}

#[test]
fn applies_persists_and_keeps_metadata() {
    let dir = tempdir();
    let store = open(&dir);
    let mut titled = record("a", 10);
    titled.session_title = "title".into();
    titled.t3_thread_id = "t1".into();
    titled.t3_thread_url = "https://example.com/t1".into();
    let result = store
        .apply(&batch("mac", vec![titled, record("b", 5)], &[]), false)
        .unwrap();
    assert_eq!(result.accepted, 2);
    let result = store
        .apply(
            &batch("mac", vec![record("a", 20), record("b", 5)], &["missing"]),
            false,
        )
        .unwrap();
    assert_eq!(
        (result.accepted, result.updated, result.deleted),
        (0, 1, 0),
        "a correction replaces, an unchanged record is skipped"
    );
    store.apply(&batch("mac", vec![], &["b"]), false).unwrap();
    let result = store
        .apply(
            &batch("mac", vec![record("a", 1), record("c", 1)], &[]),
            true,
        )
        .unwrap();
    assert_eq!(result.accepted, 1, "an import only fills missing records");
    drop(store);

    let store = open(&dir);
    let records = store.device_records("mac").unwrap();
    assert_eq!(records.len(), 2);
    let a = records.iter().find(|e| e.id == "a").unwrap();
    assert_eq!((a.output_tokens, a.session_title.as_str()), (20, "title"));
    assert!(
        !a.t3_thread_url.is_empty(),
        "metadata a collector couldn't read this time is kept"
    );
    let devices = store.devices().unwrap();
    assert_eq!(
        (devices[0].id.as_str(), devices[1].id.as_str()),
        ("server", "mac")
    );
    assert!(devices[1].synced_at.is_some());
    let events = store.events().unwrap();
    assert_eq!(events.len(), 2);
    assert!(events[0].cost_known && events[0].cost_usd > 0.0);
}

#[test]
fn keeps_one_copy_across_devices() {
    let dir = tempdir();
    let store = open(&dir);
    store
        .apply(&batch("server", vec![record("x", 5)], &[]), false)
        .unwrap();
    store
        .apply(
            &batch("mac", vec![record("x", 5), record("y", 1)], &[]),
            false,
        )
        .unwrap();
    store
        .apply(&batch("zz", vec![record("y", 9)], &[]), false)
        .unwrap();
    let events = store.events().unwrap();
    let owner = |id: &str| {
        events
            .iter()
            .find(|e| e.id == id)
            .unwrap()
            .device_id
            .clone()
    };
    assert_eq!(events.len(), 2);
    assert_eq!(owner("x"), "server", "a tie goes to the server's own copy");
    assert_eq!(owner("y"), "zz", "the larger copy wins");
    store.apply(&batch("zz", vec![], &["y"]), false).unwrap();
    assert_eq!(
        store
            .events()
            .unwrap()
            .iter()
            .find(|e| e.id == "y")
            .unwrap()
            .device_id,
        "mac",
        "withdrawing a copy brings back the next"
    );
}

fn wire() -> Event {
    Event {
        source: "proxy".into(),
        id: "proxy:one".into(),
        response_id: "msg_1".into(),
        upstream_request_id: "req_1".into(),
        account_id: "actual-account".into(),
        timestamp: "2026-11-03T00:00:00Z".into(),
        harness: "claude".into(),
        model: "claude-opus-4-5-20251101".into(),
        session_id: "session".into(),
        project: "microscope".into(),
        entrypoint: "microscope".into(),
        input_tokens: 100,
        output_tokens: 20,
        ..Default::default()
    }
}

#[test]
fn proxy_receipt_takes_its_transcripts_metadata() {
    let dir = tempdir();
    let store = open(&dir);
    store
        .apply(&batch("server", vec![wire()], &[]), false)
        .unwrap();
    let got = store.events().unwrap();
    assert_eq!(
        (got.len(), got[0].project.as_str()),
        (1, "microscope"),
        "a receipt stands alone"
    );

    let mut transcript = record("claude:message:msg_1:req_1", 10);
    transcript.timestamp = "2026-11-03T00:00:01Z".into();
    transcript.session_title = "Code review".into();
    let mut historical = transcript.clone();
    historical.id = "claude:message:msg_earlier:req_earlier".into();
    historical.output_tokens = 5;
    historical.session_title = String::new();
    store
        .apply(&batch("mac", vec![transcript, historical], &[]), false)
        .unwrap();
    let check = |store: &Store| {
        let got = store.events().unwrap();
        assert_eq!(
            got.len(),
            2,
            "matched response counted once, earlier history kept: {got:?}"
        );
        let receipt = got
            .iter()
            .find(|e| e.is_proxy())
            .expect("wire accounting kept");
        assert_eq!(receipt.output_tokens, 20);
        assert_eq!(receipt.account_id, "actual-account");
        assert_eq!(receipt.project, "/work/project");
        assert_eq!(receipt.session_title, "Code review");
        assert_eq!(receipt.device_id, "mac");
        assert_eq!(receipt.entrypoint, "microscope");
    };
    check(&store);
    drop(store);
    let store = open(&dir);
    check(&store);
    assert_eq!(
        store.device_records("mac").unwrap().len(),
        2,
        "raw evidence kept"
    );

    store
        .apply(&batch("server", vec![], &["proxy:one"]), false)
        .unwrap();
    assert_eq!(
        store.events().unwrap().len(),
        2,
        "without its receipt the transcript counts again"
    );
}

#[test]
fn only_exact_request_identity_reconciles() {
    let cases: Vec<(&str, Event, Event, usize)> = vec![
        (
            "header fallback",
            Event {
                source: "proxy".into(),
                harness: "claude".into(),
                model: "opus".into(),
                upstream_request_id: "req_1".into(),
                ..Default::default()
            },
            Event {
                harness: "claude".into(),
                model: "opus".into(),
                id: "claude:message:msg_1:req_1".into(),
                ..Default::default()
            },
            1,
        ),
        (
            "codex native",
            Event {
                source: "proxy".into(),
                harness: "codex".into(),
                response_id: "resp_1".into(),
                ..Default::default()
            },
            Event {
                harness: "codex".into(),
                id: "codex:response:resp_1".into(),
                ..Default::default()
            },
            1,
        ),
        (
            "different response",
            Event {
                source: "proxy".into(),
                harness: "claude".into(),
                response_id: "msg_1".into(),
                ..Default::default()
            },
            Event {
                harness: "claude".into(),
                id: "claude:message:msg_2:req_2".into(),
                ..Default::default()
            },
            2,
        ),
        (
            "no identity",
            Event {
                source: "proxy".into(),
                harness: "claude".into(),
                session_id: "same".into(),
                ..Default::default()
            },
            Event {
                harness: "claude".into(),
                session_id: "same".into(),
                id: "t".into(),
                ..Default::default()
            },
            2,
        ),
        (
            "advisor retained",
            Event {
                source: "proxy".into(),
                harness: "claude".into(),
                response_id: "msg_1".into(),
                ..Default::default()
            },
            Event {
                harness: "claude".into(),
                id: "claude:advisor:hash".into(),
                ..Default::default()
            },
            2,
        ),
    ];
    for (name, mut wire, mut transcript, want) in cases {
        let dir = tempdir();
        let store = open(&dir);
        wire.id = "proxy:w".into();
        wire.timestamp = "2026-11-03T00:00:00Z".into();
        if transcript.id.is_empty() {
            transcript.id = "t".into();
        }
        transcript.timestamp = "2026-11-03T00:00:00Z".into();
        store
            .apply(&batch("server", vec![wire], &[]), false)
            .unwrap();
        store
            .apply(&batch("mac", vec![transcript], &[]), false)
            .unwrap();
        assert_eq!(store.events().unwrap().len(), want, "{name}");
    }
}

/// Transcripts to write, ids to withdraw, and the title and project every receipt then shows.
type Step<'a> = (Vec<Event>, Vec<&'a str>, (&'a str, &'a str));

#[test]
fn session_metadata_reaches_every_receipt() {
    let receipt = |id: &str, entrypoint: &str| Event {
        source: "proxy".into(),
        id: id.into(),
        upstream_request_id: format!("req_{id}"),
        timestamp: "2026-11-03T00:00:00Z".into(),
        harness: "claude".into(),
        model: "claude-opus-4-5-20251101".into(),
        session_id: "session".into(),
        entrypoint: entrypoint.into(),
        output_tokens: 20,
        ..Default::default()
    };
    let transcript = |id: &str, at: &str, title: &str, project: &str| Event {
        timestamp: at.into(),
        session_title: title.into(),
        project: project.into(),
        entrypoint: "cli".into(),
        ..record(id, 5)
    };
    let receipts = || vec![receipt("p1", ""), receipt("p2", "sdk"), receipt("p3", "")];
    let rows = |store: &Store| {
        let mut got: Vec<_> = store
            .events()
            .unwrap()
            .into_iter()
            .filter(Event::is_proxy)
            .map(|e| (e.id, e.session_title, e.project, e.entrypoint))
            .collect();
        got.sort();
        got
    };
    let t = transcript;
    let steps: Vec<Step> = vec![
        (
            vec![t("t1", "2026-11-03T00:00:01Z", "First", "/a")],
            vec![],
            ("First", "/a"),
        ),
        (
            vec![t("t2", "2026-11-03T00:00:02Z", "Second", "/b")],
            vec![],
            ("Second", "/b"),
        ),
        (
            vec![t("t2", "2026-11-03T00:00:02Z", "Second", "/c")],
            vec![],
            ("Second", "/c"),
        ),
        (
            vec![t("t3", "2026-11-03T00:00:03Z", "", "/d")],
            vec![],
            ("", "/d"),
        ),
        (vec![], vec!["t3"], ("Second", "/c")),
        (vec![], vec!["t2"], ("First", "/a")),
        (vec![], vec!["t1"], ("", "")),
    ];
    let dir = tempdir();
    let store = open(&dir);
    store
        .apply(&batch("server", receipts(), &[]), false)
        .unwrap();
    let mut held: Vec<Event> = Vec::new();
    for (events, deleted, (title, project)) in steps {
        held.retain(|e| !deleted.contains(&e.id.as_str()) && !events.iter().any(|n| n.id == e.id));
        held.extend(events.iter().cloned());
        store.apply(&batch("mac", events, &deleted), false).unwrap();
        let after = held.iter().map(|e| e.id.as_str()).collect::<Vec<_>>();
        let got = rows(&store);
        assert!(
            got.iter()
                .all(|r| (r.1.as_str(), r.2.as_str()) == (title, project)),
            "{after:?}: {got:?}"
        );
        let fresh_dir = tempdir();
        let fresh = open(&fresh_dir);
        fresh
            .apply(&batch("server", receipts(), &[]), false)
            .unwrap();
        fresh
            .apply(&batch("mac", held.clone(), &[]), false)
            .unwrap();
        assert_eq!(got, rows(&fresh), "{after:?}");
    }
}

fn tempdir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "broadcom-usage-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn journal_line(e: &Event) -> String {
    format!("{{\"e\":{}}}\n", serde_json::to_string(e).unwrap())
}

fn visible_ids(store: &Store) -> Vec<String> {
    store.events().unwrap().into_iter().map(|e| e.id).collect()
}

#[test]
fn journals_follow_withdrawals_and_rewrites() {
    use broadcom_usage::follow::{self, Followed, Format};
    use std::io::Write;
    let dir = tempdir();
    let store = open(&dir);
    let journal = dir.join("mac.ndjson");
    let followed = Followed {
        path: journal.clone(),
        device: device("mac"),
        format: Format::Journal,
        shared: false,
    };
    let (x, y) = (record("x", 1), record("y", 1));
    std::fs::write(
        &journal,
        journal_line(&x) + &journal_line(&y) + "{\"d\":\"x\"}\n",
    )
    .unwrap();
    follow::catch_up(&store, &followed).unwrap();
    assert_eq!(visible_ids(&store), ["y"]);

    // Go appends a withdrawal and compacts in the same call, before it is read.
    let z = record("z", 1);
    std::fs::OpenOptions::new()
        .append(true)
        .open(&journal)
        .unwrap()
        .write_all(journal_line(&z).as_bytes())
        .unwrap();
    follow::catch_up(&store, &followed).unwrap();
    std::fs::OpenOptions::new()
        .append(true)
        .open(&journal)
        .unwrap()
        .write_all(b"{\"d\":\"y\"}\n")
        .unwrap();
    let fresh = dir.join("compact-1");
    std::fs::write(&fresh, journal_line(&z)).unwrap();
    std::fs::rename(&fresh, &journal).unwrap();
    follow::catch_up(&store, &followed).unwrap();
    assert_eq!(visible_ids(&store), ["z"]);
}

/// A journal for a device Go last heard from at 1000, and a push here at 2000.
fn moved_device(dir: &std::path::Path) -> (Store, broadcom_usage::follow::Followed) {
    use broadcom_usage::follow::{Followed, Format};
    let store = open(dir);
    let followed = Followed {
        path: dir.join("mac.ndjson"),
        device: Device {
            synced_at: Some(1000),
            ..device("mac")
        },
        format: Format::Journal,
        shared: false,
    };
    (store, followed)
}

fn push(store: &Store, events: Vec<Event>) {
    let mut pushed = batch("mac", events, &[]);
    pushed.device.synced_at = Some(2000);
    store.apply(&pushed, false).unwrap();
}

fn append(path: &std::path::Path, text: &str) {
    use std::io::Write;
    std::fs::OpenOptions::new()
        .append(true)
        .open(path)
        .unwrap()
        .write_all(text.as_bytes())
        .unwrap();
}

/// Replaces a file the way Go compacts a journal, so it gets a new inode.
fn rewrite(path: &std::path::Path, text: &str) {
    let fresh = path.with_extension("fresh");
    std::fs::write(&fresh, text).unwrap();
    std::fs::rename(&fresh, path).unwrap();
}

fn outputs(store: &Store) -> Vec<(String, i64)> {
    let mut out: Vec<_> = store
        .device_records("mac")
        .unwrap()
        .into_iter()
        .map(|e| (e.id, e.output_tokens))
        .collect();
    out.sort();
    out
}

#[test]
fn a_journal_read_again_keeps_what_its_device_pushed_here() {
    use broadcom_usage::follow::{self, Followed};
    let dir = tempdir();
    let (store, followed) = moved_device(&dir);
    let text = journal_line(&record("x", 1)) + &journal_line(&record("y", 1));
    std::fs::write(&followed.path, &text).unwrap();
    follow::catch_up(&store, &followed).unwrap();

    push(&store, vec![record("x", 5), record("p", 1)]);
    let held = [("p".into(), 1), ("x".into(), 5), ("y".into(), 1)];
    rewrite(&followed.path, &text);
    follow::catch_up(&store, &followed).unwrap();
    assert_eq!(outputs(&store), held, "a copied journal changes nothing");

    let elsewhere = dir.join("same-journal.ndjson");
    std::fs::hard_link(&followed.path, &elsewhere).unwrap();
    let lost_cursor = Followed {
        path: elsewhere,
        device: followed.device.clone(),
        format: followed.format,
        shared: false,
    };
    follow::catch_up(&store, &lost_cursor).unwrap();
    assert_eq!(
        outputs(&store),
        held,
        "a journal without a cursor changes nothing"
    );
}

#[test]
fn a_device_mid_move_takes_what_go_still_writes() {
    use broadcom_usage::follow;
    let dir = tempdir();
    let (store, followed) = moved_device(&dir);
    std::fs::write(&followed.path, journal_line(&record("x", 1))).unwrap();
    follow::catch_up(&store, &followed).unwrap();
    push(&store, vec![record("p", 1)]);

    append(
        &followed.path,
        &(journal_line(&record("q", 1)) + "{\"d\":\"x\"}\n"),
    );
    follow::catch_up(&store, &followed).unwrap();
    assert_eq!(
        outputs(&store),
        [("p".into(), 1), ("q".into(), 1)],
        "appended lines apply as written"
    );

    append(&followed.path, &journal_line(&record("q", 7)));
    rewrite(
        &followed.path,
        &(journal_line(&record("q", 7)) + &journal_line(&record("r", 1))),
    );
    follow::catch_up(&store, &followed).unwrap();
    assert_eq!(
        outputs(&store),
        [("p".into(), 1), ("q".into(), 1), ("r".into(), 1)],
        "a compaction only adds what the store lacks"
    );
}

#[test]
fn a_journal_read_after_its_device_pushed_here_adds_only_last_versions() {
    use broadcom_usage::follow;
    let dir = tempdir();
    let (store, followed) = moved_device(&dir);
    push(&store, vec![record("x", 5)]);
    let text = journal_line(&record("x", 1))
        + "{\"d\":\"x\"}\n"
        + &journal_line(&record("x", 2))
        + &journal_line(&record("z", 1))
        + "{\"d\":\"z\"}\n"
        + &journal_line(&record("y", 1))
        + &journal_line(&record("y", 3));
    std::fs::write(&followed.path, &text).unwrap();
    follow::catch_up(&store, &followed).unwrap();
    assert_eq!(outputs(&store), [("x".into(), 5), ("y".into(), 3)]);
}

#[test]
fn a_journal_for_a_repository_fetched_here_keeps_what_was_fetched() {
    use broadcom_usage::follow;
    let dir = tempdir();
    let store = open(&dir);
    std::fs::create_dir_all(dir.join("events")).unwrap();
    std::fs::write(
        dir.join("devices.json"),
        r#"[{"id":"github:o/r","label":"GitHub o/r","syncedAt":1000}]"#,
    )
    .unwrap();
    let journals = follow::go_journals(&dir, &device("server"), |d| d.id == "github:o/r");
    let text = journal_line(&record("x", 1));
    std::fs::write(&journals[0].path, &text).unwrap();
    follow::catch_up(&store, &journals[0]).unwrap();

    let mut fetched = batch("github:o/r", vec![record("g", 1)], &[]);
    fetched.device.synced_at = Some(500);
    store.apply(&fetched, true).unwrap();
    rewrite(&journals[0].path, &text);
    follow::catch_up(&store, &journals[0]).unwrap();
    let mut ids: Vec<_> = store.device_ids("github:o/r").unwrap();
    ids.sort();
    assert_eq!(ids, ["g", "x"]);
}

#[test]
fn a_new_price_reaches_only_its_models_records() {
    use broadcom_usage::pricing::{Policy, Rates};
    let dir = tempdir();
    let store = open(&dir);
    let unpriced = Event {
        model: "claude-next-1".into(),
        ..record("new", 10)
    };
    push(&store, vec![unpriced, record("old", 10)]);
    let cost = |store: &Store, id: &str| {
        let e = store
            .events()
            .unwrap()
            .into_iter()
            .find(|e| e.id == id)
            .unwrap();
        (e.cost_known, e.cost_usd)
    };
    assert_eq!(cost(&store, "new"), (false, 0.0));
    let (_, before) = store.rows_after(-1).unwrap();

    let mut catalog = Policy::bundled().catalog;
    catalog.models.insert(
        "claude-next-1".into(),
        Rates::from([
            ("input_cost_per_token".into(), 1e-6),
            ("output_cost_per_token".into(), 2e-6),
        ]),
    );
    store
        .set_policy(&std::sync::Arc::new(Policy::new(catalog, Vec::new())))
        .unwrap();
    let (known, usd) = cost(&store, "new");
    assert!(known && (usd - 120e-6).abs() < 1e-12);
    let (changed, _) = store.rows_after(before).unwrap();
    assert_eq!(changed.len(), 1, "records of other models are left alone");
}
