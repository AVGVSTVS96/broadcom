# BROADCOM

A dashboard for a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) account pool: where new work goes, what every plan and free API credit has left, how fast it's being spent, and by whom.

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

Next.js 16, shadcn on Base UI, Tailwind 4, Effect 4.

```sh
bun install
BROADCOM_PROXY=http://127.0.0.1:8317 bun run dev
```

`BROADCOM_KEY_FILE` points at the proxy's management key (default `~/.config/cliproxyapi/key`). The key stays on the server.
