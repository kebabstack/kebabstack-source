#!/usr/bin/env bash
# Hub pre-deploy checks: (1) SDK in step with the hub + served copies fresh,
# (2) architecture diagram layout, (3) jsdom load-smoke of dist/index.html
# (tabs, data sharing, wizard, menu, backups, home, docs). Exit ≠ 0 = do not deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
node test/auth-flow.mjs
node --test test/operations-ui.mjs test/displays-ui.mjs test/updates-ui.mjs test/permissions-ui.mjs test/company-teams.mjs test/openteam-ui.mjs test/handoff.mjs test/data-sharing.mjs test/connect-flow.mjs ../sdk/tools/signin.test.mjs ../sdk/tools/topbar.test.mjs
python3 ../sdk/tools/sync-signin.py --check
python3 ../sdk/tools/check-sdk.py
python3 tools/archsvg.py >/dev/null && echo "diagram layout OK"
bash test/run-rsa.sh
T=$(mktemp -d); cp dist/openteam.js dist/company-teams.js dist/index.html dist/permissions.js dist/updates.js dist/operations.js dist/displays.js test/smoke.mjs "$T/"; mkdir -p "$T/sdk"; cp dist/sdk/hub-client.js "$T/sdk/"
[ -n "${NODE_PATH:-}" ] && ln -sfn "$NODE_PATH" "$T/node_modules" || true
(cd "$T" && node smoke.mjs 2>/dev/null | tail -3); rm -rf "$T"
