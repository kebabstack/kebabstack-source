#!/usr/bin/env bash
# Frontend smoke: boots dist/ in jsdom against a scripted fake backend and walks Today, inbox
# (.eml upload through the intake lane, proposal decision), contracts, one record, connection
# (status · settings · import · export) and docs as admin, editor and member.
set -euo pipefail
cd "$(dirname "$0")/.."
node --check dist/app.js
node test/saas-metrics.mjs
node test/saas-workspace.mjs
node test/pdf-text.mjs
node test/review-fields.mjs
node test/analysis-progress.mjs
T=$(mktemp -d)
cp dist/saas-workspace.js dist/saas-metrics.js dist/vendor-terms.js dist/license-assignment.js dist/index.html dist/app.js dist/document-upload.js dist/intake-review.js dist/commercial-details.js dist/analysis-progress.js dist/idl.js dist/hub-client.js "$T/"
mkdir -p "$T/vendor" && cp dist/vendor/postal-mime.js "$T/vendor/"
cp test/agent-bundle.stub.js "$T/agent-bundle.js"
cp test/smoke.mjs "$T/"
[ -d node_modules ] && ln -s "$(pwd)/node_modules" "$T/node_modules" || true
[ -n "${NODE_PATH:-}" ] && ln -sfn "$NODE_PATH" "$T/node_modules" || true
(cd "$T" && node smoke.mjs admin && node smoke.mjs editor && node smoke.mjs member)
rm -rf "$T"
