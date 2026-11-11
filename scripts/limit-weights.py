"""How much plan limit each model uses per token, next to Opus 5.5.

Fits each account's limit meter rise (weekly or five-hour) between readings to the proxy's
receipts in the same span, one column per model, no intercept. A column is the model's tokens
priced at Opus 5.5 list rates, so a coefficient over Opus's is "limit per token at the same token
mix, Opus = 1". `--fable` adds Fable allowance readings: each account's Fable-only meter, worth
`share` of the week, which measures Fable directly instead of by regression.

    uv run --with numpy python -I scripts/limit-weights.py [--kind week|fiveHour] [--bin 60]
        [--since ISO] [--until ISO] [--skip PREFIX] [--fable readings.ndjson] [--boot 2000]

`--fable` lines are {"account", "at" (ms), "fable" (% used), "resetsAt" (ms)}, as the pool
endpoint reports them (`fable.used`, `fableAt`, `fable.resetsAt`); the proxy keeps no history.
"""

import argparse
import collections
import datetime
import json
import os
import re
import sqlite3

import numpy as np

STATE = os.path.expanduser("~/.local/state")
DB = f"{STATE}/broadcom-usage/usage.db"
HISTORY = f"{STATE}/cliproxyapi/usage-history.ndjson"
SPENT = f"{STATE}/cliproxyapi/resets-spent.ndjson"

# $/token list prices: input, output, cache read, 5-minute write, 1-hour write.
PRICE = {
    "claude-opus-5-5": (4e-6, 20e-6, 0.2e-6, 5e-6, 8e-6),
    "claude-sonnet-5-5": (2e-6, 10e-6, 0.1e-6, 2.5e-6, 4e-6),
    "claude-haiku-5-5": (0.1e-6, 0.5e-6, 0.01e-6, 0.125e-6, 0.2e-6),
    "claude-fable-5-2": (8e-6, 40e-6, 0.2e-6, 10e-6, 16e-6),
    "claude-fable-5-1": (10e-6, 50e-6, 0.25e-6, 12.5e-6, 20e-6),
}
MODELS = list(PRICE)
NAMES = ["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "Fable 5.2", "Fable 5.1"]
OPUS = np.array(PRICE["claude-opus-5-5"])
FABLE = [MODELS.index("claude-fable-5-2"), MODELS.index("claude-fable-5-1")]
DAY = 86_400_000


def ms(iso):
    iso = re.sub(r"(\.\d{6})\d+", r"\1", iso.replace("Z", "+00:00"))
    return datetime.datetime.fromisoformat(iso).timestamp() * 1000


def when(t):
    return datetime.datetime.fromtimestamp(t / 1000, datetime.UTC).strftime("%m-%d %H:%M")


def receipts(since, until, skip):
    """Per account, sorted (ms, model index, token vector) for every priced proxy receipt."""
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = db.execute(
        "select account_id, millis, raw_model, input, output, cache_read, cache_write,"
        " coalesce(cache_write_1h, 0) from events"
        " where source = 'proxy' and gone = 0 and account_id <> '' and millis between ? and ?",
        (since, until),
    )
    out = collections.defaultdict(list)
    for account, t, model, i, o, cr, cw, w1 in rows:
        if model in PRICE and not (skip and account.startswith(skip)):
            w1 = max(0, min(w1, cw))
            out[account].append((t, MODELS.index(model), np.array((i, o, cr, cw - w1, w1), float)))
    for v in out.values():
        v.sort(key=lambda r: r[0])
    return out


def spend(events, t0, t1, prices):
    """Per model, tokens in (t0, t1] priced by `prices` (a model's own, or Opus for all)."""
    x = np.zeros(len(MODELS))
    for t, m, tok in events:
        if t0 < t <= t1:
            x[m] += tok @ (np.array(PRICE[MODELS[m]]) if prices == "own" else OPUS)
    return x


def spends(account, t0, t1):
    """Reset spends that zeroed `account`'s meters in (t0, t1]."""
    if not os.path.exists(SPENT):
        return []
    out = []
    for line in open(SPENT):
        r = json.loads(line)
        at = ms(r["at"])
        if r["account"] == account and r.get("spent") and t0 < at <= t1:
            out.append((at, r.get("cleared", [])))
    return out


def chains(kind, since, until, skip):
    """Each account's meter, split into runs that only climb: a new window, or a drop of more than
    a few points (a spent reset), starts a new run. Readings jitter by a point, so a run keeps the
    highest reading per bin."""
    key, reset = (kind, f"{kind}ResetsAt")
    by = collections.defaultdict(list)
    for line in open(HISTORY):
        r = json.loads(line)
        if since <= r["at"] <= until and r.get(key) is not None and r.get(reset) is not None:
            if not (skip and r["account"].startswith(skip)):
                by[r["account"]].append((r["at"], r[key], r[reset]))
    out = []
    for account, rs in by.items():
        rs.sort()
        run, high, window = [], 0, rs[0][2]
        for at, v, z in rs:
            if abs(z - window) > 3_600_000 or v < high - 3:
                out.append((account, run))
                run, high, window = [], v, z
            run.append((at, v))
            high = max(high, v)
        out.append((account, run))
    return out


def intervals(kind, binm, since, until, skip, events, cap):
    """(account, day, window id, rise, spend at Opus prices, spend at own prices) between
    consecutive bins of a run. Spans touching the cap are dropped: the meter stops there."""
    rows = []
    for w, (account, run) in enumerate(chains(kind, since, until, skip)):
        top = {}
        for at, v in run:
            b = int(at // binm)
            top[b] = max(top.get(b, -1), v)
        bs = sorted(top)
        for p, q in zip(bs, bs[1:]):
            if top[p] >= cap or top[q] >= cap:
                continue
            t0, t1 = (p + 1) * binm, (q + 1) * binm
            ev = events.get(account, [])
            x = spend(ev, t0, t1, "opus")
            if x.sum() > 0:
                rows.append((account, int(t1 // DAY), w, top[q] - top[p], x, spend(ev, t0, t1, "own")))
    return rows


def fable_rows(path, share, events):
    """Fable allowance rises between consecutive readings of one window, in weekly points.
    The window starts at zero a week before it resets, and after a reset spend that clears it."""
    by = collections.defaultdict(list)
    for line in open(path):
        r = json.loads(line)
        by[r["account"]].append((r["at"], r["fable"], r.get("resetsAt")))
    rows = []
    for account, rs in by.items():
        rs.sort()
        z = next(r[2] for r in rs if r[2])
        prev = (z - 7 * DAY, 0.0)
        for at, f, _ in rs:
            clears = [c for c in spends(account, prev[0], at) if "seven_day_overage_included" in c[1]]
            if clears:
                rows.append((account, prev[0], clears[-1][0], None))
                prev = (clears[-1][0], 0.0)
            x = spend(events.get(account, []), prev[0], at, "opus")
            rows.append((account, prev[0], at, ((f - prev[1]) * share, x)))
            prev = (at, f)
    return [r for r in rows if r[3] is not None]


def fit(X, y):
    return np.linalg.lstsq(X, y, rcond=None)[0]


def boot(X, y, groups, n, seed=1):
    keys = sorted(set(groups))
    idx = collections.defaultdict(list)
    for i, g in enumerate(groups):
        idx[g].append(i)
    rng, out = np.random.default_rng(seed), []
    for _ in range(n):
        pick = [i for g in rng.choice(len(keys), len(keys)) for i in idx[keys[g]]]
        out.append(fit(X[pick], y[pick]))
    return np.array(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", default="week", choices=["week", "fiveHour"])
    ap.add_argument("--bin", type=float, default=60)
    ap.add_argument("--since", default="2026-11-04T00:00:00+00:00")
    ap.add_argument("--until", default="2100-01-01T00:00:00+00:00")
    ap.add_argument("--skip", default="")
    ap.add_argument("--cap", type=float, default=99)
    ap.add_argument("--fable")
    ap.add_argument("--share", type=float, default=0.5)
    ap.add_argument("--boot", type=int, default=2000)
    ap.add_argument("--merge-small", action="store_true", help="fit Sonnet and Haiku as one column")
    a = ap.parse_args()
    since, until, binm = ms(a.since), ms(a.until), a.bin * 60_000

    events = receipts(since - DAY, until, a.skip)
    rows = intervals(a.kind, binm, since, until, a.skip, events, a.cap)
    X = np.array([r[4] for r in rows])
    Xown = np.array([r[5] for r in rows])
    y = np.array([r[3] for r in rows], float)
    cols, names = list(range(len(MODELS))), list(NAMES)
    if a.merge_small:
        X = np.column_stack([X[:, 0], X[:, 1] + X[:, 2], X[:, 3], X[:, 4]])
        Xown = np.column_stack([Xown[:, 0], Xown[:, 1] + Xown[:, 2], Xown[:, 3], Xown[:, 4]])
        cols, names = list(range(4)), ["Opus 5.5", "Sonnet+Haiku", "Fable 5.2", "Fable 5.1"]
    live = [j for j in cols if (X[:, j] > 0).sum() >= 3]
    X, Xown, names = X[:, live], Xown[:, live], [names[j] for j in live]

    b = fit(X, y)
    days_raw = boot(X, y, [(r[0], r[1]) for r in rows], a.boot)
    days = days_raw / days_raw[:, :1]
    wins = boot(X, y, [r[2] for r in rows], a.boot)
    wins = wins / wins[:, :1]
    accounts = sorted({r[0] for r in rows})
    loo = []
    for acc in accounts:
        keep = np.array([r[0] != acc for r in rows])
        c = fit(X[keep], y[keep])
        loo.append(c / c[0])
    loo = np.array(loo)
    own = fit(Xown, y)

    print(f"{a.kind}: {len(y)} spans of {a.bin:.0f} min, {len({r[2] for r in rows})} runs, "
          f"{len({(r[0], r[1]) for r in rows})} account-days, {len(accounts)} accounts, "
          f"rise {y.sum():.0f} points")
    print(f"Opus 5.5: {b[0]:.4f} points per Opus-priced $")
    print(f"{'model':13s} {'weight':>6s}  {'90% acct-day':>13s}  {'90% window':>13s}  "
          f"{'leave-1-acct':>13s}  {'per own $':>9s}  {'spans':>5s}  {'Opus-$':>7s}")
    for j, n in enumerate(names):
        lo, hi = np.percentile(days[:, j], [5, 95])
        wl, wh = np.percentile(wins[:, j], [5, 95])
        print(f"{n:13s} {b[j] / b[0]:6.2f}  [{lo:5.2f},{hi:5.2f}]  [{wl:5.2f},{wh:5.2f}]  "
              f"[{loo[:, j].min():5.2f},{loo[:, j].max():5.2f}]  {own[j] / own[0]:9.2f}  "
              f"{int((X[:, j] > 0).sum()):5d}  {X[:, j].sum():7.0f}")

    if a.fable:
        fr = fable_rows(a.fable, a.share, events)
        fy = np.array([r[3][0] for r in fr])
        fx = np.array([r[3][1][FABLE].sum() for r in fr])
        rate = fy.sum() / fx.sum()
        print(f"\nFable allowance: {len(fr)} spans, {fy.sum():.1f} weekly points at share {a.share}")
        for acc, t0, t1, (pts, x) in fr:
            f = x[FABLE].sum()
            print(f"  {acc[:4]} {when(t0)} -> {when(t1)}  points {pts:5.1f}  Fable Opus-$ {f:7.1f}  "
                  f"Fable 5.1 share {x[FABLE[1]] / f if f else 0:.2f}")
        w = rate / days_raw[:, 0]
        print(f"  {rate:.4f} points per Opus-priced $ of Fable; next to this fit's Opus: "
              f"{rate / b[0]:.2f} (90% from Opus's acct-day spread [{np.percentile(w, 5):.2f},{np.percentile(w, 95):.2f}])")


if __name__ == "__main__":
    main()
