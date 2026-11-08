#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/broadcom-deploy.lock
flock 9
state=~/.config/broadcom
url=$(sed -n 's/^BROADCOM_URL=//p' "$state/env")
live=$(sed -n 's/^BROADCOM_DIST=//p' "$state/slot" 2>/dev/null || true)
next=$([ "$live" = .next-a ] && echo .next-b || echo .next-a)
git fetch --quiet origin main
git merge --ff-only --quiet origin/main
bun install --frozen-lockfile --silent
rm -rf "apps/web/$next"
BROADCOM_DIST=$next bun run --cwd apps/web build >/tmp/broadcom-build.log 2>&1 || { tail -30 /tmp/broadcom-build.log; exit 1; }
echo "BROADCOM_DIST=$next" >"$state/slot"
systemctl --user restart broadcom.service
for _ in $(seq 20); do
  curl -sf -o /dev/null "$url" && { echo "live: $(git log -1 --format='%h %s') from $next"; exit 0; }
  sleep 0.5
done
echo "broadcom did not answer after restart" >&2
exit 1
