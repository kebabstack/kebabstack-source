#!/usr/bin/env bash
# Frontend smoke: boots dist/ in jsdom against a scripted fake backend, walks
# intake, devices, one device (purchase + sale), the sale (issue → PDF with Swiss QR-bill →
# archive), sales list, import, settings (billing) in both roles (and with AI off); the buyer's offers page.
set -euo pipefail
cd "$(dirname "$0")/.."
node --check dist/app.js
node --check dist/deal.js
T=$(mktemp -d)
cp dist/handover.js dist/index.html dist/app.js dist/canonical-url.js dist/workflow.js dist/idl.js dist/hub-client.js dist/invoice-pdf.js "$T/"
mkdir -p "$T/vendor" && cp dist/vendor/pdf-lib.min.js dist/vendor/qrcode.js "$T/vendor/"
cp test/agent-bundle.stub.js "$T/agent-bundle.js"
cp test/smoke.mjs "$T/"
python3 - "$T/app.js" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
p.write_text(p.read_text().replace('__HUB_URL__', 'https://hub.test/'))
PY
[ -d node_modules ] && ln -s "$(pwd)/node_modules" "$T/node_modules" || true
[ -n "${NODE_PATH:-}" ] && ln -sfn "$NODE_PATH" "$T/node_modules" || true
[ -d ../node_modules ] && [ ! -e "$T/node_modules" ] && ln -s "$(cd .. && pwd)/node_modules" "$T/node_modules" || true
(cd "$T" && node smoke.mjs admin 2>/dev/null | tail -3 && node smoke.mjs admin noai 2>/dev/null | tail -3 && node smoke.mjs member 2>/dev/null | tail -3)
(cd "$T" && node smoke.mjs admin ai admin-deal)
(cd "$T" && for flow in auto retry rejected return signed canonical canonical-ticket; do node smoke.mjs member ai "$flow"; done)
node --test test/canonical-url.test.mjs test/handover.test.mjs
rm -rf "$T"

(cd .. && node assets/test/dealroom.mjs accept && node assets/test/dealroom.mjs decline)
