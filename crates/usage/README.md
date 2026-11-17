# broadcom-usage

Collects AI coding-agent usage (Claude Code, Codex, Pi, Grok, Muse) from this machine,
other machines' pushes, GitHub Actions artifacts and the account pool's per-request
receipts, prices it, and answers [BROADCOM](../../apps/web)'s Usage,
Sessions and Credits views and its live-sessions stream.

```
transcripts ─┐
Mac pushes ──┤                     ┌─ GET /deck/usage, /deck/sessions, /deck/credits
GH artifacts ┼─▶ SQLite (usage.db) ┤
receipts ────┘   records → events  └─ GET /deck/events (SSE: s:<session>, app:<name>)
```

- `records` keeps every device's records as sent, forever. `events` holds one resolved
  row per record: the best copy across devices, priced, with a proxy receipt standing in
  for the transcript record of the same request. It's maintained on write, so a view
  reads one indexed time range.
- Inputs are followed from where they stopped. A file that was replaced is read again,
  which changes nothing already held.
- The account pool ([broadcom-proxy](../proxy), or CLIProxyAPI) is read over its
  management API at `pool` in the config, wherever it runs: its accounts and plans from
  its live stream, and its receipts, limit readings, session moves and credit grants from
  `deck/files/<name>`, each from where the last read stopped whenever the stream names it
  in a `stale` event. While the pool can't be read, what was read stays, and the credits
  view says why.
- Shapes match the Go deck it replaces; see [api/](api/README.md).

## Run

From the repo root; [systemd/](../../systemd/broadcom-usage.service) has a user service for it.

```
cargo install --path crates/usage
broadcom-usage serve --config ~/.config/broadcom-usage/config.json
```

Every config field is optional; see `src/config.rs`. Clients send the management key as
`Authorization: Bearer <key>` or `X-Management-Key: <key>`.
