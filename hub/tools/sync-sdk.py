#!/usr/bin/env python3
"""The hub serves its own SDK. Copies the SDK sources into hub/dist/sdk/ so a
developer — or a coding agent — can fetch them from the running hub:

    <hub>/sdk/kebab-hub.mo      Motoko module (mo:kebab-hub)
    <hub>/sdk/hub-client.js     browser client
    <hub>/sdk/onboard-app.md    prompt-ready onboarding guide
    <hub>/sdk/mcp.md            AI assistants: setup + contract
    <hub>/sdk/README.md         SDK readme
    <hub>/sdk/hub.did           the hub's live Candid interface
    <hub>/sdk/VERSION           when and from what these were taken
    <hub>/CHANGELOG.md          the hub's changelog (shown bottom-left in the hub)

It also writes the version from hub/mops.toml into dist/index.html
(`const HUB_VERSION = "…"`) — one source of truth for the version.

Run before every hub frontend deploy; sdk/tools/check-sdk.py fails when the
served copies are stale.
"""
import hashlib, pathlib, shutil, subprocess, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "hub/dist/sdk"
OUT.mkdir(exist_ok=True)
pairs = [("sdk/motoko/src/Operations.mo", "Operations.mo"), ("sdk/motoko/src/Hardware.mo", "Hardware.mo"), ("sdk/motoko/src/Support.mo", "Support.mo"), ("sdk/motoko/src/Permissions.mo", "Permissions.mo"), ("sdk/motoko/src/lib.mo", "kebab-hub.mo"), ("sdk/js/hub-client.js", "hub-client.js"),
         ("docs/agent/onboard-app.md", "onboard-app.md"), ("docs/agent/mcp.md", "mcp.md"), ("sdk/README.md", "README.md"), ("hub/backend/backend.did", "hub.did")]
lines = []
for src, dst in pairs:
    shutil.copyfile(ROOT / src, OUT / dst)
    h = hashlib.sha256((ROOT / src).read_bytes()).hexdigest()[:12]
    lines.append(f"{dst:16s} {h}  ← {src}")
try: sha = subprocess.run(["git", "--no-optional-locks", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or "uncommitted"
except Exception: sha = "unknown"
(OUT / "VERSION").write_text(f"kebab-hub SDK · synced {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M} UTC · repo {sha}\n" + "\n".join(lines) + "\n")
print("\n".join(lines)); print("→", OUT)
# OpenTeam operator contract
shutil.copyfile(ROOT / "docs/OPENTEAM.md", ROOT / "hub/dist/openteam-compatibility.md")
# changelog + version
import re
shutil.copyfile(ROOT / "hub/CHANGELOG.md", ROOT / "hub/dist/CHANGELOG.md")
ver = re.search(r'^version\s*=\s*"([^"]+)"', (ROOT / "hub/mops.toml").read_text(), re.M).group(1)
idx = ROOT / "hub/dist/index.html"; html = idx.read_text(encoding="utf-8")
html2 = re.sub(r'const HUB_VERSION = "[^"]*";', f'const HUB_VERSION = "{ver}";', html, count=1)
if html2 != html: idx.write_text(html2, encoding="utf-8")
print(f"CHANGELOG.md → dist · HUB_VERSION {ver}")
