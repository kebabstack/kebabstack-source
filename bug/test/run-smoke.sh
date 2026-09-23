#!/usr/bin/env bash
# DOM-level community flow and deterministic game regressions; actual WebGL is checked in browser.
set -euo pipefail
cd "$(dirname "$0")/.."
node --check dist/main.js
node --check dist/community.js
npm test
