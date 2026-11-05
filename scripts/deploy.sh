#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/broadcom-deploy.lock
flock 9
git pull --ff-only --quiet
bun install --frozen-lockfile --silent
bun run build >/tmp/broadcom-build.log 2>&1 || { tail -30 /tmp/broadcom-build.log; exit 1; }
systemctl --user restart broadcom.service
for _ in $(seq 20); do
  curl -sf -o /dev/null http://100.113.223.113:4840/ && { echo "live: $(git log -1 --format='%h %s')"; exit 0; }
  sleep 0.5
done
echo "broadcom did not answer after restart" >&2
exit 1
