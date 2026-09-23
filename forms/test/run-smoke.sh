#!/usr/bin/env bash
# Frontend smoke: boots dist/ in jsdom against a scripted fake backend and walks
# dashboard, workspace, sharing, trash, settings, docs (admin + member) and the
# public fill page (anonymous respondent).
set -euo pipefail
cd "$(dirname "$0")/.."
node --check dist/app.js
T=$(mktemp -d)
cp dist/index.html dist/app.js dist/idl.js dist/hub-client.js "$T/"
cp test/agent-bundle.stub.js "$T/agent-bundle.js"
cp test/smoke.mjs "$T/"
[ -d node_modules ] && ln -s "$(pwd)/node_modules" "$T/node_modules" || true
[ -n "${NODE_PATH:-}" ] && ln -sfn "$NODE_PATH" "$T/node_modules" || true
(cd "$T" && node smoke.mjs admin 2>/dev/null | tail -3 && node smoke.mjs member 2>/dev/null | tail -3 && node smoke.mjs public 2>/dev/null | tail -3)
rm -rf "$T"
