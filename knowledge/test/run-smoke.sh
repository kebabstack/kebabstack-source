#!/usr/bin/env bash
set -euo pipefail
node --check knowledge/dist/app.js
node --check knowledge/dist/sharing.js
node --test knowledge/test/*.test.mjs
