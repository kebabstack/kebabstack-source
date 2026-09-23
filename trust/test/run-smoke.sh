#!/usr/bin/env bash
# Frontend smoke: boots dist/ in jsdom against a scripted fake backend, walks
# fleet, one device, checks, ask, enrolment, settings as admin (with and without
# AI), helpdesk and member.
set -euo pipefail
cd "$(dirname "$0")/.."
node --check dist/app.js
T=$(mktemp -d)
cp dist/index.html dist/app.js dist/idl.js dist/hub-client.js dist/canonical-url.js "$T/"
cp test/agent-bundle.stub.js "$T/agent-bundle.js"
cp test/smoke.mjs test/fixture.mjs "$T/"
ln -s "$(cd .. && pwd)/node_modules" "$T/node_modules"
[ -n "${NODE_PATH:-}" ] && ln -sfn "$NODE_PATH" "$T/node_modules" || true
(cd "$T" && node smoke.mjs admin 2>/dev/null | tail -3 && node smoke.mjs admin noai 2>/dev/null | tail -3 && node smoke.mjs helpdesk 2>/dev/null | tail -3 && node smoke.mjs member 2>/dev/null | tail -3)
for flow in canonical canonical-ticket; do (cd "$T" && node smoke.mjs admin "$flow"); done
node --test test/canonical-url.test.mjs
rm -rf "$T"
