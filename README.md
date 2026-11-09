# BROADCOM

A Claude account pool and its dashboard: where new work goes, what every plan and free API credit has left, how fast it's being spent, and by whom.

| Folder                         | What it is                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [`apps/web`](apps/web)         | the dashboard, for a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) pool or broadcom-proxy |
| [`crates/proxy`](crates/proxy) | broadcom-proxy: one address for all your Claude subscriptions                                           |
| [`crates/usage`](crates/usage) | broadcom-usage: collects agent usage and answers the dashboard's Usage views                            |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/overview-dark.png">
  <img alt="Overview: which account takes new work, what every plan and free credit has left, and each account's pace" src="docs/screenshots/overview-light.png">
</picture>

<table>
  <tr>
    <td width="50%"><picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/limits-dark.png">
        <img alt="Limits: a spiral of one account's weeks, when it ran out and when it comes back" src="docs/screenshots/limits-light.png">
      </picture></td>
    <td width="50%"><picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/accounts-dark.png">
        <img alt="Accounts: every sign-in, its weekly limit and when it expires" src="docs/screenshots/accounts-light.png">
      </picture></td>
  </tr>
  <tr>
    <td align="center">Limits</td>
    <td align="center">Accounts</td>
  </tr>
</table>

## Install

On macOS or Linux:

```sh
curl -fsSL https://github.com/AVGVSTVS96/broadcom/releases/latest/download/install.sh | sh
```

It puts the pool, the usage service and the dashboard in `~/.local/share/broadcom`, with nothing else to install first. Then it asks you to sign in a Claude account and starts all three. The dashboard is at http://127.0.0.1:4840, and its Accounts page adds more accounts. Later, `broadcom` starts them again.

Point Claude Code at the pool:

```sh
export ANTHROPIC_BASE_URL=http://127.0.0.1:8317
export ANTHROPIC_CUSTOM_HEADERS="X-Api-Key: $(head -1 ~/.config/broadcom-proxy/client-keys)"
claude
```

The pool alone is also on crates.io: `cargo install broadcom-proxy`. [Its README](crates/proxy) covers config and running it as a service.

## Develop

Next.js 16, shadcn on Base UI, Tailwind 4, Effect 4.

```sh
bun install
BROADCOM_PROXY=http://127.0.0.1:8317 bun --filter @broadcom/web dev
```

`BROADCOM_KEY_FILE` points at the proxy's management key (default `~/.config/cliproxyapi/key`). The key stays on the server.
