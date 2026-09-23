#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --check dist/app.js
node --check dist/access.js
node --check dist/tracker.js
node --check dist/shared.js
node test/ui-smoke.mjs admin
node test/ui-smoke.mjs viewer
node test/ui-smoke.mjs manager
node test/ui-smoke.mjs admin empty
node test/ui-smoke.mjs viewer empty
