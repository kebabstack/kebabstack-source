#!/usr/bin/env sh
# Preflight for docs/INSTALL.md § A: is this machine ready to deploy the kitchen?
# Prints one line per requirement, exits 1 if anything is missing. No changes are made.
#   sh kitchen/tools/preflight.sh
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PATH="$repo_dir/node_modules/.bin:$PATH"
export PATH
ok=0; bad=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok+1)); }
fail() { printf '  \033[31m✗\033[0m %s\n     → %s\n' "$1" "$2"; bad=$((bad+1)); }
have() { command -v "$1" >/dev/null 2>&1; }

echo "kebab-stack preflight"
have git      && pass "git $(git --version 2>/dev/null | awk '{print $3}')"           || fail "git missing"      "install from https://git-scm.com"
if have node; then
  v=$(node --version | sed 's/^v//'); major=${v%%.*}
  node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&(b>22||(b===22&&c>=2)))?0:1)' && pass "node $v" || fail "node $v is too old" "kebab-stack needs Node.js 22.22.2 or newer — https://nodejs.org"
else fail "node missing" "install Node.js 22.22.2 or newer — https://nodejs.org"; fi
have icp      && pass "icp $(icp --version 2>/dev/null | awk '{print $NF}')"           || fail "icp CLI missing"  "npm install -g @icp-sdk/icp-cli @icp-sdk/ic-wasm"
have ic-wasm  && pass "ic-wasm"                                                        || fail "ic-wasm missing"  "npm install -g @icp-sdk/ic-wasm   (the Motoko and asset recipes need it)"
if have mops && [ "$(mops --version 2>/dev/null | awk '/^CLI / {print $2; exit}')" = "3.2.0" ]; then
  pass "mops 3.2.0 (pinned)"
else fail "pinned mops 3.2.0 missing" "run npm ci at the repo root"; fi
if have python3 && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'; then
  pass "$(python3 --version)"
else fail "Python 3.11 or newer required" "install from https://python.org"; fi

if have icp; then
  ident=$(icp identity default 2>/dev/null | tail -n1)
  if [ -n "$ident" ] && [ "$ident" != "anonymous" ]; then
    pass "icp identity '$ident' is active — check it is the one you sign in to the console with: icp identity principal"
  else
    fail "no linked icp identity" "icp identity link web my-engine --auth https://opencloud.org && icp identity default my-engine"
  fi
fi

echo
if [ "$bad" -eq 0 ]; then
  echo "All $ok checks passed. Next: cd kitchen && python3 tools/pack-recipes.py --build && mops install --locked && icp deploy -e prod --subnet <SUBNET-ID>"
  echo "Your subnet id is on the engine's Settings page in the console."
else
  echo "$bad missing, $ok ok. Fix the lines marked ✗, then run this again."; exit 1
fi
