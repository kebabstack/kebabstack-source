#!/usr/bin/env bash
# Frontend smoke: boots dist/ in jsdom against a scripted fake backend, walks
# every route in all three roles, asserts the DOM. Catches blank-page class
# bugs (ReferenceError, missing ids, broken routing) before a deploy.
#   npm ci (at the repository root)
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
cp dist/oncall-navigation.js dist/compensation.js dist/oncall-regional.js dist/oncall-regional-editor.js dist/oncall-reminders.js dist/service-status.js dist/service-status.css dist/oncall-status.js dist/oncall-calendar.js dist/reporting.js dist/reporting.css dist/oncall-alerts.js dist/oncall-response.js dist/oncall.js dist/oncall-planning.js dist/oncall.css dist/customer-workflows.js dist/customer-privacy.js dist/customer-projects.js dist/index.html dist/app.js dist/idl.js dist/hub-client.js dist/canonical-url.js dist/ticket-view.js dist/person-context.js dist/message-format.js dist/desk.css dist/profile-pictures.js "$T/"
cp test/agent-bundle.stub.js "$T/agent-bundle.js"
cp test/smoke.mjs "$T/"
[ -d node_modules ] && ln -s "$(pwd)/node_modules" "$T/node_modules" || true
[ -n "${NODE_PATH:-}" ] && ln -sfn "$NODE_PATH" "$T/node_modules" || true
[ -d ../node_modules ] && [ ! -e "$T/node_modules" ] && ln -s "$(cd .. && pwd)/node_modules" "$T/node_modules" || true
for role in admin agent requester; do (cd "$T" && node smoke.mjs "$role" | tail -1); done
for flow in canonical canonical-ticket return; do (cd "$T" && node smoke.mjs requester "$flow"); done
node --test test/compensation.test.mjs test/oncall-regional.test.mjs test/service-status.test.mjs test/reporting.test.mjs test/canonical-url.test.mjs test/experience.test.mjs test/person-context.test.mjs test/customer-projects.test.mjs test/oncall-planning.test.mjs test/oncall-ui.test.mjs test/oncall-response.test.mjs test/oncall-alerts.test.mjs
rm -rf "$T"
