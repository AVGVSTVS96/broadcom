use std::path::{Path, PathBuf};

use anyhow::{Context, bail};
use serde_json::{Map, Value};

use crate::{config::expand_home, files};

pub fn settings_path() -> PathBuf {
    std::env::var_os("CLAUDE_CONFIG_DIR")
        .map_or_else(|| expand_home(Path::new("~/.claude")), PathBuf::from)
        .join("settings.json")
}

pub async fn check(url: &str, key: &str) -> anyhow::Result<()> {
    let response = reqwest::Client::new()
        .get(format!("{url}/v1/models"))
        .bearer_auth(key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
        .with_context(|| format!("reaching {url}"))?;
    let status = response.status();
    if !status.is_success() {
        bail!(
            "{url} answered {status}: {}",
            response.text().await.unwrap_or_default()
        );
    }
    Ok(())
}

pub fn write(path: &Path, url: &str, key: &str) -> anyhow::Result<()> {
    let path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let mut settings: Map<String, Value> = match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .with_context(|| format!("reading {} as JSON", path.display()))?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Map::new(),
        Err(e) => return Err(e).with_context(|| format!("reading {}", path.display())),
    };
    let Value::Object(env) = settings
        .entry("env")
        .or_insert_with(|| Value::Object(Map::new()))
    else {
        bail!("{}: env isn't an object", path.display());
    };
    env.insert("ANTHROPIC_BASE_URL".into(), url.into());
    env.insert("ANTHROPIC_AUTH_TOKEN".into(), key.into());
    let text = format!("{}\n", serde_json::to_string_pretty(&settings)?);
    files::write_atomic(&path, text.as_bytes())
        .with_context(|| format!("writing {}", path.display()))
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use serde_json::json;

    use super::write;

    #[test]
    fn sets_the_pool_and_keeps_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(
            &path,
            json!({"theme": "dark", "env": {"FOO": "1", "ANTHROPIC_BASE_URL": "http://old"}})
                .to_string(),
        )
        .unwrap();

        write(&path, "https://pool.example", "k").unwrap();

        let text = std::fs::read_to_string(&path).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&text).unwrap(),
            json!({"theme": "dark", "env": {"FOO": "1", "ANTHROPIC_BASE_URL": "https://pool.example", "ANTHROPIC_AUTH_TOKEN": "k"}})
        );
        assert!(text.find("theme") < text.find("env"));
    }

    #[test]
    fn writes_through_a_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("dotfiles.json");
        let link = dir.path().join("settings.json");
        std::fs::write(&real, "{}").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        write(&link, "https://pool.example", "k").unwrap();

        assert!(link.is_symlink());
        assert!(
            std::fs::read_to_string(&real)
                .unwrap()
                .contains("pool.example")
        );
    }

    #[test]
    fn starts_a_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".claude/settings.json");

        write(&path, "https://pool.example", "k").unwrap();

        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&path).unwrap())
                .unwrap()["env"]["ANTHROPIC_AUTH_TOKEN"],
            "k"
        );
    }
}
