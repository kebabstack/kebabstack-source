#!/usr/bin/env bash
# Frontend smoke: boots dist/ in jsdom against a scripted fake backend, walks
# overview, add, domain, evidence, settings in both roles.
set -euo pipefail
cd "$(dirname "$0")/.."
node --check dist/app.js
T=$(mktemp -d)
cp dist/index.html dist/app.js dist/idl.js dist/hub-client.js dist/workspace.js dist/canonical-url.js "$T/"
cp test/agent-bundle.stub.js "$T/agent-bundle.js"
cp test/smoke.mjs test/fixture.js "$T/"
[ -d node_modules ] && ln -s "$(pwd)/node_modules" "$T/node_modules" || true
[ -n "${NODE_PATH:-}" ] && ln -sfn "$NODE_PATH" "$T/node_modules" || true
(cd "$T" && node smoke.mjs admin  && node smoke.mjs viewer )
rm -rf "$T"
