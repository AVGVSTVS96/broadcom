//! broadcom-usage reading a pool it reaches only over its management API: the pool's
//! accounts, receipts, session moves and limit readings arrive, and so does what it adds.

#![allow(clippy::unwrap_used)]

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use broadcom_proxy::app::{App as Proxy, Endpoints};
use broadcom_usage::app::App;
use broadcom_usage::config::Config;
use broadcom_usage::deck::Deck;
use broadcom_usage::event::Device;
use broadcom_usage::pricing::Pricing;
use broadcom_usage::store::Store;
use serde_json::json;

async fn serve(router: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    format!("http://{address}")
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

/// A broadcom-proxy with plan accounts `a` and `b`, in front of a stand-in for Anthropic.
async fn pool(dir: &Path) -> (Arc<Proxy>, String) {
    let at = |p: &str| dir.join(p);
    write(&at("client-keys"), "client-key\n");
    write(&at("management-key"), "admin-key\n");
    for name in ["a", "b"] {
        let login = json!({"type": "claude", "access_token": format!("token-{name}"), "refresh_token": "r",
                           "account_uuid": name, "email": format!("{name}@example.com"), "expired": "2099-01-01T00:00:00Z"});
        write(
            &at(&format!("auths/claude-{name}.json")),
            &login.to_string(),
        );
    }
    let config = json!({
        "listen": "127.0.0.1:0", "accountOwner": false, "clientKeysFile": at("client-keys"),
        "managementKeyFile": at("management-key"), "credentialsDir": at("auths"), "stateDir": at("state"),
    });
    write(&at("config.json"), &config.to_string());
    let anthropic = serve(Router::new().fallback(|| async {
        axum::Json(
            json!({"id": "msg_1", "type": "message", "model": "claude-x", "content": [],
                          "usage": {"input_tokens": 3, "output_tokens": 2}}),
        )
    }))
    .await;
    let (config, revision) = broadcom_proxy::config::Config::load(&at("config.json")).unwrap();
    let ends = Endpoints {
        anthropic: anthropic.clone(),
        claude_platform: anthropic.clone(),
        claude_ai: anthropic.clone(),
        openai_auth: anthropic,
    };
    let app = Arc::new(Proxy::new(at("config.json"), config, revision, ends).unwrap());
    tokio::spawn(broadcom_proxy::manage::run_live(app.clone()));
    tokio::spawn({
        let live = app.live.clone();
        async move { live.run_stale().await }
    });
    let url = serve(broadcom_proxy::router(app.clone())).await;
    (app, url)
}

async fn send(proxy: &str, session: &str) {
    let response = reqwest::Client::new()
        .post(format!("{proxy}/v1/messages"))
        .header("x-api-key", "client-key")
        .header("x-claude-code-session-id", session)
        .json(&json!({"model": "claude-x", "max_tokens": 1, "messages": [{"role": "user", "content": "hi"}]}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
}

fn usage(dir: &Path, pool: &str) -> Arc<App> {
    let config = Config {
        pool: pool.into(),
        state_dir: dir.join("usage"),
        ..Config::default()
    };
    std::fs::create_dir_all(&config.state_dir).unwrap();
    let pricing = Pricing::open(&config.state_dir, None);
    let local = Device {
        id: "server".into(),
        label: "server".into(),
        synced_at: None,
    };
    let store =
        Arc::new(Store::open(&config.state_dir.join("usage.db"), local, pricing.policy()).unwrap());
    Arc::new(App {
        deck: Arc::new(Deck::new(config.clone(), store.clone())),
        config,
        store,
        pricing: Arc::new(pricing),
        key: "admin-key".into(),
    })
}

async fn until(what: &str, done: impl Fn() -> bool) {
    for _ in 0..100 {
        if done() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("{what} never arrived");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_pool_elsewhere_is_read_over_its_api_and_followed_as_it_grows() {
    let dir = std::env::temp_dir().join(format!("broadcom-usage-pool-{}", std::process::id()));
    let (proxy, url) = pool(&dir).await;
    send(&url, "51933568-42b8-4c8e-bc44-2bed00731a66").await;
    let state = dir.join("state");
    std::fs::write(
        state.join("usage-history.ndjson"),
        "{\"account\":\"a\",\"at\":1,\"fiveHour\":10,\"week\":20}\n",
    )
    .unwrap();

    let app = usage(&dir, &url);
    tokio::spawn(broadcom_usage::pool::follow(app.clone(), || {}));
    let receipts = || app.store.events().unwrap().len();
    let bindings = || app.deck.bindings.lock().rows().len();
    until("the pool's state", || {
        receipts() == 1
            && bindings() == 1
            && app.deck.readings.lock().rows().len() == 1
            && app.deck.pool.lock().grants == Some(Vec::new())
            && app.deck.pool.lock().accounts.len() == 2
    })
    .await;
    let labels: Vec<String> = app
        .deck
        .pool
        .lock()
        .accounts
        .values()
        .map(|a| a.label.clone())
        .collect();
    assert_eq!(labels, ["a@example.com", "b@example.com"]);

    send(&url, "61933568-42b8-4c8e-bc44-2bed00731a66").await;
    until("what the pool added", || receipts() == 2 && bindings() == 2).await;
    assert_eq!(app.deck.pool.lock().problem, None);
    drop(proxy);
    std::fs::remove_dir_all(dir).unwrap();
}
