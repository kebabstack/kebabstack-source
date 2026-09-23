#!/usr/bin/env python3
"""Set a one-time browser setup code using the deployer's existing CLI identity.

Run after deployment: python3 tools/setup-code.py kitchen --environment ic
For a manually deployed hub, use `hub` instead of `kitchen`.
The code is configured on the backend, never written to source or shell history.
An unconfigured backend accepts setup only from its controller.
"""
import argparse
from pathlib import Path
import secrets
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("module", choices=["kitchen", "hub"])
parser.add_argument("--environment", required=True, help="Explicit deployment environment, e.g. ic (the implicit mainnet environment the engine deploy uses)")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
key = "KEBAB_SETUP_CODE" if args.module == "kitchen" else "KEBAB_CLAIM_CODE"
code = secrets.token_hex(32)
command = ["icp", "canister", "settings", "update", "backend", "--environment", args.environment,
           "--add-environment-variable", f"{key}={code}", "--force"]
try:
    result = subprocess.run(command, cwd=root / args.module, capture_output=True, text=True)
except FileNotFoundError:
    sys.exit("icp CLI is not installed; follow docs/INSTALL.md first.")
if result.returncode:
    # CLI diagnostics can echo arguments. Redact even when setup fails.
    sys.exit((result.stderr or result.stdout or "Could not configure the backend.").replace(code, "[redacted]"))
print(f"Setup code for {args.module} (keep private; enter it in the browser):\n{code}")
print("The code grants first-run setup only. It cannot claim a configured stack.")
