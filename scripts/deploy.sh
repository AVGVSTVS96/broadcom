#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/broadcom-deploy.lock
flock 9
state=~/.config/broadcom
mkdir -p "$state"
url=http://127.0.0.1:4840/
live=$(sed -n 's/^BROADCOM_DIST=//p' "$state/slot" 2>/dev/null || true)
next=$([ "$live" = .next-a ] && echo .next-b || echo .next-a)
if [ "${1:-}" != --no-pull ]; then
  git fetch --quiet origin main
  git merge --ff-only --quiet origin/main
fi
head=$(git rev-parse HEAD)
[ "$(cat "$state/built" 2>/dev/null)" = "$head $live" ] && { echo "already built: $(git log -1 --format='%h %s') in $live"; exit 0; }
bun install --frozen-lockfile --silent
rm -rf "apps/web/$next"
BROADCOM_DIST=$next bun run --cwd apps/web build >/tmp/broadcom-build.log 2>&1 || { tail -30 /tmp/broadcom-build.log; exit 1; }
previous=$(cat "$state/slot" 2>/dev/null || true)
echo "BROADCOM_DIST=$next" >"$state/slot"
echo "$head $next" >"$state/built"
if ! systemctl --user is-active --quiet broadcom.service; then
  echo "built: $(git log -1 --format='%h %s') into $next, for broadcom's next start"
  exit 0
fi
systemctl --user restart broadcom.service
for _ in $(seq 20); do
  curl -sf -o /dev/null "$url" && { echo "live: $(git log -1 --format='%h %s') from $next"; exit 0; }
  sleep 0.5
done
echo "broadcom did not answer after restart, rolling back to ${live:-the previous build}" >&2
rm -f "$state/built"
if [ -n "$previous" ]; then echo "$previous" >"$state/slot"; else rm -f "$state/slot"; fi
systemctl --user restart broadcom.service
exit 1
