use foldhash::{HashMap, HashSet, HashSetExt};
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use serde::ser::SerializeMap;
use serde::{Deserialize, Serialize, Serializer};

/// Who a usage row belongs to. Threads are keyed by app and thread id; a name alone never joins.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Who {
    pub kind: String,
    pub app: String,
    pub thread: String,
    pub name: String,
    pub owner: Option<String>,
    pub unit: String,
    pub title: String,
    pub project: String,
    pub repo: String,
    pub workflow: String,
    pub run: Option<String>,
    pub href: Option<String>,
}

impl Serialize for Who {
    /// Exactly the fields each kind has, nulls included.
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("kind", &self.kind)?;
        match self.kind.as_str() {
            "thread" => {
                map.serialize_entry("app", &self.app)?;
                map.serialize_entry("thread", &self.thread)?;
                map.serialize_entry("name", &self.name)?;
                map.serialize_entry("href", &self.href)?;
            }
            "job" => {
                map.serialize_entry("owner", &self.owner)?;
                map.serialize_entry("unit", &self.unit)?;
            }
            "session" => {
                map.serialize_entry("title", &self.title)?;
                map.serialize_entry("project", &self.project)?;
                map.serialize_entry("href", &self.href)?;
            }
            "action" => {
                map.serialize_entry("repo", &self.repo)?;
                map.serialize_entry("workflow", &self.workflow)?;
                map.serialize_entry("run", &self.run)?;
                map.serialize_entry("href", &self.href)?;
            }
            _ => map.serialize_entry("project", &self.project)?,
        }
        map.end()
    }
}

/// A conversation sessions run in, like a chat topic, as `threadsFile` lists it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
struct Thread {
    app: String,
    #[serde(rename = "thread")]
    id: String,
    name: String,
    #[serde(default)]
    href: Option<String>,
}

/// One line of `threadsFile`: a thread, and a session that ran in it.
#[derive(Deserialize)]
struct Entry {
    /// A session id, or its first 8 characters.
    #[serde(default)]
    session: Option<String>,
    #[serde(flatten)]
    thread: Thread,
}

/// The threads sessions ran in, for naming sessions.
#[derive(Debug, Clone, Default)]
pub struct Names {
    /// Thread by session id, or by its first 8 characters.
    sessions: HashMap<String, Thread>,
    /// Threads by name, across apps.
    named: HashMap<String, Vec<Thread>>,
}

/// What names a session: its id, latest title and project.
#[derive(Debug, Clone, Copy)]
pub struct SessionRef<'a> {
    pub session_id: &'a str,
    pub title: Option<&'a str>,
    pub project: &'a str,
    pub repository: Option<&'a str>,
}

static JOB_TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(.+)/([0-9A-Za-z_.@-]+)$").expect("a valid regex"));
/// tokenhub's GitHub import names each session `github:<run>:<attempt>:…` and titles it `<workflow> #<run>`.
static RUN_SESSION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^github:([0-9]+):").expect("a valid regex"));
static RUN_NUMBER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r" #[0-9]+$").expect("a valid regex"));

pub(crate) fn basename(path: &str) -> &str {
    let trimmed = path.trim_end_matches('/');
    trimmed.rsplit('/').next().unwrap_or_default()
}

/// The first `n` bytes of an id, or all of it.
pub(crate) fn prefix(id: &str, n: usize) -> &str {
    id.get(..n).unwrap_or(id)
}

/// Names a session, in order: a GitHub Actions run, by tokenhub's session id; the thread
/// `threadsFile` puts it in, by its id or first 8 characters; a title that names exactly one thread; a bin/job title `<owner>/<unit>`; any other title; else
/// its project. A name alone never joins two threads.
pub fn who_of(names: &Names, s: SessionRef) -> Who {
    let project = s.repository.unwrap_or(s.project).to_string();
    if let Some(run) = RUN_SESSION.captures(s.session_id) {
        let repo = project
            .strip_prefix("https://github.com/")
            .unwrap_or(&project)
            .to_string();
        let workflow = s
            .title
            .map(|title| RUN_NUMBER.replace(title, "").trim().to_string())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "workflow".into());
        let run = run[1].to_string();
        let href = Some(format!("https://github.com/{repo}/actions/runs/{run}"));
        return Who {
            kind: "action".into(),
            repo,
            workflow,
            run: Some(run),
            href,
            ..Who::default()
        };
    }
    let title = s.title.map_or_default(str::trim);
    let found = names
        .sessions
        .get(s.session_id)
        .or_else(|| names.sessions.get(prefix(s.session_id, 8)))
        .or_else(|| match names.named.get(title) {
            Some(threads) if !title.is_empty() && threads.len() == 1 => threads.first(),
            _ => None,
        });
    if let Some(t) = found {
        return Who {
            kind: "thread".into(),
            app: t.app.clone(),
            thread: t.id.clone(),
            name: t.name.clone(),
            href: t.href.clone(),
            ..Who::default()
        };
    }
    if let Some(job) = JOB_TITLE.captures(title) {
        return Who {
            kind: "job".into(),
            owner: Some(job[1].to_string()),
            unit: job[2].to_string(),
            ..Who::default()
        };
    }
    if !title.is_empty() {
        return Who {
            kind: "session".into(),
            title: title.into(),
            project,
            ..Who::default()
        };
    }
    Who {
        kind: "project".into(),
        project,
        ..Who::default()
    }
}

/// The agent row a session ranks under.
pub fn row_of(who: &Who, session_key: &str) -> String {
    match who.kind.as_str() {
        "thread" => format!("t:{}:{}", who.app, who.thread),
        "job" => format!(
            "j:{}/{}",
            who.owner.as_deref().unwrap_or_default(),
            who.unit
        ),
        "session" => format!("s:{session_key}"),
        "action" => format!("g:{}:{}", who.repo, who.workflow),
        _ => format!("p:{}", who.project),
    }
}

/// The agent a session ranks under: an Actions run's agent is its workflow, which links to the repo's runs.
pub fn agent_of(who: &Who) -> Who {
    let mut who = who.clone();
    if who.kind == "action" {
        who.run = None;
        who.href = Some(format!("https://github.com/{}/actions", who.repo));
    }
    who
}

pub fn label_of(who: &Who) -> (String, String) {
    match who.kind.as_str() {
        "thread" => (who.name.clone(), who.app.clone()),
        "job" => match &who.owner {
            Some(owner) => (who.unit.clone(), format!("job of {owner}")),
            None => (who.unit.clone(), "job".into()),
        },
        "session" => (who.title.clone(), basename(&who.project).into()),
        "action" => (
            format!("{} · {}", basename(&who.repo), who.workflow),
            "GitHub Actions".into(),
        ),
        _ => {
            let name = basename(&who.project);
            let label = if name.is_empty() { &who.project } else { name };
            (label.to_string(), "untitled sessions".into())
        }
    }
}

pub fn app_of(who: &Who) -> &str {
    match who.kind.as_str() {
        "thread" => &who.app,
        "job" => "job",
        "action" => "actions",
        _ => "other",
    }
}

/// The threads `file` lists, as a JSON array of `{session?, app, thread, name, href?}`.
/// No file, or none there yet, names no threads.
pub fn read_threads(file: Option<&Path>) -> Result<Names, String> {
    let Some(file) = file else {
        return Ok(Names::default());
    };
    let text = match std::fs::read(file) {
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Names::default()),
        read => read.map_err(|err| format!("{}: {err}", file.display()))?,
    };
    let entries: Vec<Entry> =
        serde_json::from_slice(&text).map_err(|err| format!("{}: {err}", file.display()))?;
    let mut names = Names::default();
    let mut seen = HashSet::new();
    for Entry { session, thread } in entries {
        if seen.insert((thread.app.clone(), thread.id.clone())) {
            names
                .named
                .entry(thread.name.clone())
                .or_default()
                .push(thread.clone());
        }
        if let Some(session) = session.filter(|s| !s.is_empty()) {
            names.sessions.insert(session, thread);
        }
    }
    Ok(names)
}

impl schemars::JsonSchema for Who {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "Who".into()
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        let text = serde_json::json!({ "type": "string" });
        let maybe = serde_json::json!({ "type": ["string", "null"] });
        let kind = |name: &str, fields: &[(&str, &serde_json::Value)]| {
            let mut properties = serde_json::Map::new();
            properties.insert("kind".into(), serde_json::json!({ "const": name }));
            for (field, schema) in fields {
                properties.insert(field.to_string(), (*schema).clone());
            }
            serde_json::json!({ "type": "object", "properties": properties })
        };
        schemars::json_schema!({
            "oneOf": [
                kind("thread", &[("app", &text), ("thread", &text), ("name", &text), ("href", &maybe)]),
                kind("job", &[("owner", &maybe), ("unit", &text)]),
                kind("session", &[("title", &text), ("project", &text), ("href", &maybe)]),
                kind("action", &[("repo", &text), ("workflow", &text), ("run", &maybe), ("href", &maybe)]),
                kind("project", &[("project", &text)]),
            ]
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session<'a>(id: &'a str, title: Option<&'a str>) -> SessionRef<'a> {
        SessionRef {
            session_id: id,
            title,
            project: "/home/me/hex",
            repository: None,
        }
    }

    #[test]
    fn no_threads_file_names_no_threads() {
        for file in [None, Some(Path::new("/nonexistent/threads.json"))] {
            let names = read_threads(file).unwrap();
            assert!(names.sessions.is_empty() && names.named.is_empty());
        }
    }

    #[test]
    fn names_sessions_in_order() {
        let file = std::env::temp_dir().join(format!("threads-{}.json", std::process::id()));
        std::fs::write(
            &file,
            r#"[
                {"session":"live","app":"Telegram","thread":"-1001:Live","name":"Live","href":"https://t.me/c/1/7"},
                {"session":"pastpast","app":"Telegram","thread":"-1001:Past","name":"Past"},
                {"app":"Telegram","thread":"-1001:Once","name":"Once"},
                {"app":"Telegram","thread":"-1001:Twice","name":"Twice"},
                {"app":"Telegram","thread":"-1001:Twice2","name":"Twice"}
            ]"#,
        )
        .unwrap();
        let names = read_threads(Some(&file)).unwrap();
        std::fs::remove_file(&file).unwrap();
        let row = |s: SessionRef| row_of(&who_of(&names, s), "k");
        assert_eq!(row(session("live", None)), "t:Telegram:-1001:Live");
        assert_eq!(
            who_of(&names, session("live", None)).href.as_deref(),
            Some("https://t.me/c/1/7")
        );
        assert_eq!(row(session("pastpast-1234", None)), "t:Telegram:-1001:Past");
        assert_eq!(row(session("x", Some(" Once "))), "t:Telegram:-1001:Once");
        assert_eq!(row(session("x", Some("Twice"))), "s:k");
        assert_eq!(row(session("x", Some("hex/kb-wave"))), "j:hex/kb-wave");
        assert_eq!(row(session("x", None)), "p:/home/me/hex");
        let action = who_of(
            &names,
            SessionRef {
                repository: Some("https://github.com/o/r"),
                ..session("github:42:1:x", Some("CI #42"))
            },
        );
        assert_eq!(
            (row_of(&action, "k"), action.href.as_deref()),
            (
                "g:o/r:CI".into(),
                Some("https://github.com/o/r/actions/runs/42")
            )
        );
    }

    #[test]
    fn who_writes_only_its_kinds_fields() {
        let job = Who {
            kind: "job".into(),
            unit: "u".into(),
            ..Who::default()
        };
        assert_eq!(
            serde_json::to_string(&job).unwrap(),
            r#"{"kind":"job","owner":null,"unit":"u"}"#
        );
    }
}
