#!/usr/bin/env python3
"""Is the SDK in step with the hub? Compares the `Hub` actor type in
sdk/motoko/src/lib.mo with hub/backend/backend.did: every method the SDK
promises must exist in the hub with the same arity and the same
query/update kind. Also checks that the copy the hub serves under
hub/dist/sdk/ is byte-identical to the sources (run hub/tools/sync-sdk.py).

Exit 1 with a list of problems, exit 0 with "SDK OK".
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
lib = (ROOT / "sdk/motoko/src/lib.mo").read_text()
did = (ROOT / "hub/backend/backend.did").read_text()
problems = []

# --- SDK side: methods of `public type Hub = actor { ... }`
m = re.search(r"public type Hub = actor \{(.*?)\n  \};", lib, re.S)
if not m: sys.exit("cannot find `public type Hub = actor { … }` in lib.mo")
sdk = {}
for line in m.group(1).splitlines():
    line = line.strip()
    mm = re.match(r"(\w+) : shared (query )?\((.*?)\) -> async", line)
    if not mm: continue
    name, q, params = mm.group(1), bool(mm.group(2)), mm.group(3)
    arity = 0 if params.strip() == "" else params.count(",") + 1 if not re.search(r"[\[{(]", params) else max(1, len(re.findall(r"(?<![\[{(])\s*,\s*(?![^\[{(]*[\]})])", params)) + 1)
    sdk[name] = (arity, q)

# --- hub side: service methods in the did (multi-line signatures)
svc = did[did.index("service : {"):]
hub = {}
for mm in re.finditer(r"\n  (\w+):\s*\((.*?)\)\s*->\s*\((.*?)\)\s*(query)?;", svc, re.S):
    name, params, q = mm.group(1), mm.group(2), bool(mm.group(4))
    depth, arity, buf = 0, 0, ""
    for ch in params:
        if ch in "({[<": depth += 1
        elif ch in ")}]>": depth -= 1
        if ch == "," and depth == 0: arity += 1
        buf += ch
    if params.strip(): arity += 1
    hub[name] = (arity, q)

for name, (ar, q) in sdk.items():
    if name not in hub: problems.append(f"SDK promises `{name}` but the hub has no such method"); continue
    har, hq = hub[name]
    if har != ar: problems.append(f"`{name}`: SDK arity {ar} vs hub {har}")
    if hq != q: problems.append(f"`{name}`: SDK says {'query' if q else 'update'}, hub says {'query' if hq else 'update'}")

# --- served copy in step with the sources
pairs = [("docs/OPENTEAM.md", "hub/dist/openteam-compatibility.md"), ("sdk/motoko/src/Operations.mo", "hub/dist/sdk/Operations.mo"), ("sdk/motoko/src/Hardware.mo", "hub/dist/sdk/Hardware.mo"), ("sdk/motoko/src/Support.mo", "hub/dist/sdk/Support.mo"), ("sdk/motoko/src/Permissions.mo", "hub/dist/sdk/Permissions.mo"), ("sdk/motoko/src/lib.mo", "hub/dist/sdk/kebab-hub.mo"), ("sdk/js/hub-client.js", "hub/dist/sdk/hub-client.js"),
         ("docs/agent/onboard-app.md", "hub/dist/sdk/onboard-app.md"), ("docs/agent/mcp.md", "hub/dist/sdk/mcp.md"), ("sdk/README.md", "hub/dist/sdk/README.md"),
         ("hub/backend/backend.did", "hub/dist/sdk/hub.did")]
for src, dst in pairs:
    a, b = ROOT / src, ROOT / dst
    if not b.exists(): problems.append(f"served copy missing: {dst} (run hub/tools/sync-sdk.py)")
    elif a.read_bytes() != b.read_bytes(): problems.append(f"served copy stale: {dst} ≠ {src} (run hub/tools/sync-sdk.py)")

# --- every app ships the SDK client and the design tokens byte-identical (that is what keeps the topbar the same everywhere)
apps = sorted(d for d in ROOT.iterdir() if d.is_dir() and (d / "dist/hub-client.js").exists())
for app in apps:
    for src, name in [("sdk/js/hub-client.js", "hub-client.js"), ("hub/dist/tokens.css", "tokens.css")]:
        dst = app / "dist" / name
        if not dst.exists(): problems.append(f"{app.name}/dist/{name} missing — every app ships it (copy from {src})")
        elif dst.read_bytes() != (ROOT / src).read_bytes(): problems.append(f"{app.name}/dist/{name} differs from {src} — copy it, never edit it in the app")
    if "mountTopbar(" not in (app / "dist").joinpath("app.js").read_text(errors="ignore") and "mountTopbar(" not in (app / "dist/index.html").read_text(errors="ignore"):
        problems.append(f"{app.name}: frontend does not mount the shared topbar (mountTopbar) — apps have no header of their own")

# --- version discipline: mops.toml = backend constant = frontend constant, changelog has the section, served copy in step
import re as _re
ver = _re.search(r'^version\s*=\s*"([^"]+)"', (ROOT / "hub/mops.toml").read_text(), _re.M).group(1)
be = _re.search(r'transient let BUILD_VERSION : Text = "([^"]+)"', (ROOT / "hub/backend/main.mo").read_text())
fe = _re.search(r'const HUB_VERSION = "([^"]+)"', (ROOT / "hub/dist/index.html").read_text(encoding="utf-8"))
if not be or be.group(1) != ver: problems.append(f"backend BUILD_VERSION {be.group(1) if be else '?'} ≠ mops.toml {ver} (must be a transient let)")
if not fe or fe.group(1) != ver: problems.append(f"frontend HUB_VERSION {fe.group(1) if fe else '?'} ≠ mops.toml {ver} (run hub/tools/sync-sdk.py)")
cl = (ROOT / "hub/CHANGELOG.md").read_text()
if f"## [{ver}]" not in cl: problems.append(f"hub/CHANGELOG.md has no section for {ver} — every version bump needs its entry")
if not (ROOT / "hub/dist/CHANGELOG.md").exists() or (ROOT / "hub/dist/CHANGELOG.md").read_bytes() != cl.encode(): problems.append("served CHANGELOG.md stale (run hub/tools/sync-sdk.py)")
if not _re.match(r"^\d+\.\d+\.\d+$", ver): problems.append(f"version {ver} is not MAJOR.MINOR.PATCH")

if problems:
    print("SDK CHECK FAIL"); [print(" -", p) for p in problems]; sys.exit(1)
print(f"SDK OK · {len(sdk)} hub methods promised by the SDK all present with matching arity/kind · served copies in step · {len(apps)} apps ship identical client + tokens and mount the topbar · version {ver} in step (mops.toml, backend, frontend, changelog)")
