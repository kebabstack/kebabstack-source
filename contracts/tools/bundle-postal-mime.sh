#!/usr/bin/env bash
# Rebuild dist/vendor/postal-mime.js — the browser-side MIME parser behind the .eml upload.
# Pinned version, bundled unmodified from the npm package's ESM sources; the license header is kept.
# Usage: contracts/tools/bundle-postal-mime.sh [version]   (needs node + npm; esbuild is fetched on the fly)
set -euo pipefail
VERSION="${1:-2.7.6}"
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
(cd "$T" && npm init -y >/dev/null && npm install --silent --no-audit --no-fund "postal-mime@$VERSION" esbuild@0.24.2)
"$T/node_modules/.bin/esbuild" "$T/node_modules/postal-mime/src/postal-mime.js" --bundle --format=esm --platform=browser --legal-comments=none --outfile="$T/bundle.js"
{
  echo "// postal-mime $VERSION (https://github.com/postalsys/postal-mime) — MIT-0 License, Copyright (c) 2021-2025 Andris Reinman."
  echo "// Bundled unmodified from the npm package's ESM sources (esbuild --bundle --format=esm --platform=browser) so the .eml upload can parse MIME in the browser."
  echo "// Refresh: contracts/tools/bundle-postal-mime.sh"
  cat "$T/bundle.js"
} > dist/vendor/postal-mime.js
echo "dist/vendor/postal-mime.js ← postal-mime@$VERSION ($(wc -c < dist/vendor/postal-mime.js) bytes)"
