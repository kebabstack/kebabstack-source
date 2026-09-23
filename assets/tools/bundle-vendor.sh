#!/usr/bin/env bash
# Refresh dist/vendor/ — the browser-side libraries behind the sale invoice (pdf-lib renders the PDF, qrcode-generator the Swiss QR Code).
# Pinned versions, copied unmodified from the npm packages; the license headers are kept.
# Usage: assets/tools/bundle-vendor.sh   (needs node + npm)
set -euo pipefail
PDFLIB="${PDFLIB:-1.17.1}"; QR="${QR:-1.4.4}"
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
(cd "$T" && npm init -y >/dev/null && npm install --silent --no-audit --no-fund "pdf-lib@$PDFLIB" "qrcode-generator@$QR")
{ echo "// pdf-lib $PDFLIB (https://pdf-lib.js.org) — MIT License, Copyright (c) 2019 Andrew Dillon. Unmodified UMD build (dist/pdf-lib.min.js) so the sale invoice can be rendered as a PDF in the browser."; echo "// Refresh: assets/tools/bundle-vendor.sh"; cat "$T/node_modules/pdf-lib/dist/pdf-lib.min.js"; } > dist/vendor/pdf-lib.min.js
{ echo "// qrcode-generator $QR (https://github.com/kazuhikoarase/qrcode-generator) — MIT License, Copyright (c) 2009 Kazuhiko Arase. Unmodified (qrcode.js) so the Swiss QR Code can be drawn as vector squares."; echo "// Refresh: assets/tools/bundle-vendor.sh"; cat "$T/node_modules/qrcode-generator/qrcode.js"; } > dist/vendor/qrcode.js
echo "dist/vendor refreshed: pdf-lib $PDFLIB · qrcode-generator $QR"
