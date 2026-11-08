//! The proxy's receipts.ndjson lines, read as usage events: fails the moment either side
//! renames, adds or drops a field the other doesn't follow.

#![allow(clippy::unwrap_used)]

use broadcom_proxy::forward::Receipt;
use broadcom_usage::event::Event;
use serde_json::{Value, json};

/// Receipt fields only the proxy reads.
const PROXY_ONLY: [&str; 3] = ["credential", "status", "usage"];

#[test]
fn a_proxy_receipt_reads_as_a_usage_event() {
    let receipt = Receipt {
        source: "proxy",
        id: "proxy:attempt:claude-x".into(),
        response_id: "msg_1".into(),
        upstream_request_id: "req_1".into(),
        account_id: "account".into(),
        credential: "plan".into(),
        failed: true,
        status: 529,
        timestamp: "2026-11-08T00:00:00.000Z".into(),
        harness: "claude",
        model: "claude-x".into(),
        project: "cli".into(),
        repository: Some("github.com/example/repo".into()),
        session_id: "session".into(),
        input_tokens: 1,
        output_tokens: 2,
        cache_read_tokens: 3,
        cache_write_tokens: 4,
        reasoning_tokens: 5,
        cost_usd: 0.25,
        cost_known: true,
        service_tier: Some("standard".into()),
        cache_write_1h_tokens: 6,
        entrypoint: "cli".into(),
        usage: json!({"input_tokens": 1}),
    };
    let line = serde_json::to_value(&receipt).unwrap();
    let event: Event = serde_json::from_value(line.clone()).unwrap();
    assert_eq!(
        event,
        Event {
            source: "proxy".into(),
            id: "proxy:attempt:claude-x".into(),
            response_id: "msg_1".into(),
            upstream_request_id: "req_1".into(),
            account_id: "account".into(),
            failed: true,
            timestamp: "2026-11-08T00:00:00.000Z".into(),
            harness: "claude".into(),
            model: "claude-x".into(),
            project: "cli".into(),
            repository: Some("github.com/example/repo".into()),
            session_id: "session".into(),
            input_tokens: 1,
            output_tokens: 2,
            cache_read_tokens: 3,
            cache_write_tokens: 4,
            reasoning_tokens: 5,
            cost_usd: 0.25,
            cost_known: true,
            service_tier: Some("standard".into()),
            cache_write_1h_tokens: Some(6),
            entrypoint: "cli".into(),
            ..Event::default()
        }
    );

    let Value::Object(read) = serde_json::to_value(&event).unwrap() else {
        unreachable!()
    };
    let unread: Vec<&String> = line
        .as_object()
        .unwrap()
        .keys()
        .filter(|k| !read.contains_key(*k) && !PROXY_ONLY.contains(&k.as_str()))
        .collect();
    assert!(unread.is_empty(), "usage drops {unread:?}");
}
