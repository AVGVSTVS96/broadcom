# BROADCOM

A Claude account pool and its dashboard: which account takes new work, how much each plan and free credit has left, how fast it's going, how many tokens it has spent and who spent them, and adding or removing accounts. Also hosts pages for the machine it runs on (Files, Plugins, Executor).

The pool spends cheapest first: plans, then free credit, then paid extra usage. Free credit costs nothing: the monthly API credit a Max or Ultra plan includes, and any promotional or cloud credit, held in API keys in an organization with no card, so they need no extra-usage switch. Paid extra usage bills money, and only on an account whose owner turned extra usage on. Call each by those names; "API credit" alone doesn't say which.

## Commands

- `bun run check`: oxlint, oxfmt, typecheck and tests for the web app, then rustfmt, clippy and tests for the crates. CI and the pre-commit hook run it.
- `bun run fix`: oxlint's fixes, oxfmt, cargo fmt.
- `bun --filter @broadcom/web dev`: the dashboard, with `BROADCOM_PROXY` set.
- `scripts/deploy.sh`: builds `apps/web` from `origin/main` into the idle `.next-a`/`.next-b` slot and restarts `broadcom.service`.
- `cargo install --path crates/usage` then restart `broadcom-usage.service`: ships the usage service.
- `git tag vX.Y.Z && git push origin vX.Y.Z`: the release workflow builds the macOS and Linux downloads `scripts/install.sh` fetches (both binaries, the standalone dashboard, the Bun that runs it, `scripts/broadcom`), smoke-tests each and publishes them. `cargo publish -p broadcom-proxy` after bumping its version.

## Map

| Folder                      | Job                                                                               | Imports            |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| `apps/web/app/`             | routes: read, derive, render                                                      | features, lib      |
| `apps/web/features/<page>/` | a page's components, its `read.ts` and `actions.ts`                               | lib                |
| `apps/web/lib/proxy/`       | the `Proxy` service, every payload's Effect Schema, reads pages share             | nothing in the app |
| `apps/web/lib/<domain>/`    | pool, usage, files, plugins, executor, settings, time, live: logic and adapters   | lib                |
| `apps/web/lib/outside.ts`   | the only home of React effects                                                    | react              |
| `apps/web/components/`      | `ui/` from `bunx shadcn add`; `viz/` shared chart pieces (SVG, d3-scale/d3-shape) | lib                |
| `crates/proxy`              | broadcom-proxy, the Rust account pool; `DESIGN.md`                                | its own deps       |
| `crates/usage`              | broadcom-usage; `api/` holds its schemas and examples                             | its own deps       |
| `systemd/`                  | the user units the server runs                                                    |                    |

## Rules and what enforces them

| Rule                                                                                                     | Enforced by                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Only a `read.ts` or `actions.ts` talks to the proxy                                                      | `oxlint.config.ts` override                                   |
| No `useEffect`: derive in render, act in handlers, `useSubscription`/`useImperative` for outside systems | `oxlint.config.ts`                                            |
| No comments, `as` or `any`                                                                               | `oxlint.config.ts`                                            |
| Server code never reaches a client bundle                                                                | `import "server-only"` on adapters                            |
| The dashboard decodes what the usage service sends                                                       | `lib/proxy/contract.test.ts` over `crates/usage/api/examples` |
| The usage service reads what the proxy writes                                                            | the receipt test in `crates/usage`                            |
| `api/*.schema.json` match the Rust types                                                                 | `cargo test schemas`                                          |

## Look

Bloomberg terminal × Vercel × Linear, Swiss Helvetica, drawn heavily from the inspiration board (`~/Developer/pages/pages/broadcom-inspiration/`): a chart should visibly come from one of those images, in this app's style.

- A section is a `Section` card (`components/viz/section.tsx`). Its title is the verdict, a sentence with the number in it ("Max 20x is 1.5× ahead of even pace"), and the line under it is the evidence. View toggles sit top right.
- Numbers are big, light and tabular, with the unit small and muted beside them (`Stat`). Meters are thick rounded bars (`Meter`) or tick rows (`Ticks`).
- Color means state, never decoration: greys for data, `ok` green for room, `over` amber for ahead of pace, `bad` coral for run out, hatched coral (`HatchPattern`) for locked until reset, dashed for forecast. `brand` orange marks only the account taking new work. `tokens` violet marks token volume: the heatmap, token totals and the token views of Usage, with `tokens-2`/`tokens-3` as its second and third series.
- Accounts are told apart by name and position, in greys, with the one in focus in full ink. Legends sit in one muted line under the chart.
- Phone first: one column at 390 px, names above full-width tracks, nothing scrolls sideways except a chart that says so. Check 390 px and 1440 px, light and dark, before calling a page done.

## Judgment

- Next 16, Effect 4 and TypeScript 7 are newer than model memory: read `apps/web/node_modules/next/dist/docs/` and the `.d.ts` in `node_modules/effect/dist/`.
- Every string goes through the clean-copy ladder (`~/Developer/pages/tools/newsprint/clean-copy.md`): delete before rewording.
- The repo is public: no names, emails, keys or tailnet addresses in code, fixtures or screenshots.
