#!/usr/bin/env python3
"""Fill the pantry: turn the built apps of this repo into kitchen recipes.

    python3 kitchen/tools/pack-recipes.py            # pack from the last `icp build` artifacts
    python3 kitchen/tools/pack-recipes.py --build    # run `icp build` in each app first

For every recipe the script takes
  · the backend wasm from <app>/.icp/cache/artifacts/backend (what icp built),
  · the frontend files from GIT HEAD (<app>/dist/…) — the committed versions
    carry the placeholders the kitchen patches at install time; your local
    dist/ has live ids swapped in and must not ship,
  · the asset-canister module from hub/.icp/cache/artifacts/frontend (gzip),
and writes kitchen/dist/recipes/index.json plus the files. Run it before every
kitchen deploy; the pantry is exactly what the kitchen can cook.
"""
import hashlib, json, pathlib, shutil, subprocess, sys, datetime, re, tempfile, os, gzip

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else ROOT / "kitchen/dist/recipes"

RECIPES = [
    dict(id="kitchen", name="Update service", kind="installer", icon="", app="kitchen", frontend=False,
         description="Installs and verifies releases for this company. Maintained through the release CLI.", patch=[], post=[], tile=None),
    dict(id="hub", name="kebab-stack hub", kind="hub", icon="", app="hub",
         description="People, sign-in, apps, backups — the hub itself. Updated by the kitchen, never installed by it.",
         patch=[{"file": "/index.html", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/index.html", "from": 'CANONICAL_ORIGIN = ""', "to": 'CANONICAL_ORIGIN = "${frontendUrl}"'}],
         post=[], tile=None),
    dict(id="vault", name="Vault (backups)", kind="service", icon="", app="vault", frontend=False,
         description="Snapshots, restore and schedules for the hub and every app. Installed with the stack; no UI of its own — it lives under Backups.",
         patch=[], post=[], tile=None),
    dict(id="desk", name="Service desk", kind="app", icon="", app="desk",
         description="Requests, approvals, queues and SLAs for your company — routed by hub groups, notified through the hub.",
         patch=[{"file": "/support.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "requests, approvals, SLA"}),
    dict(id="assets", name="Assets", kind="app", icon="", app="assets",
         description="Devices: who has what, what happened to it — with the photo that proved it. Photo intake reads stickers and serials with the hub's AI key.",
         patch=[{"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"},
                {"file": "/deal.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "devices · who has what"}),
    dict(id="crumbs", name="Crumbs", kind="app", icon="", app="crumbs",
         description="Cookieless website analytics: visitors, sources, goals and a documented API. Requires the first-party collector.",
         patch=[{"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/shared.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "website analytics · events · conversions"}),
    dict(id="watch", name="Watch", kind="app", icon="", app="watch",
         description="Your domains, watched: DNS changes on two resolvers, dangling CNAMEs, expiry — every 15 minutes, with the evidence for the auditor.",
         patch=[{"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "domains · DNS watch"}),
    dict(id="trust", name="Trust", kind="app", icon="", app="trust",
         description="Is every work device in good shape? A read-only osquery agent reports disk encryption, screen lock, firewall and more; every device gets a score, every person sees their own — and the exact list of checks.",
         patch=[{"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "devices · in good shape?"}),
    dict(id="forms", name="Forms", kind="app", icon="", app="forms",
         description="Forms in, decisions out: build a form, share its public link, review what comes in — received, in review, accepted or declined — with ratings, notes and CSV export.",
         patch=[{"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "forms · public links · review"}),
    dict(id="bug", name="Ship the Bug", kind="app", icon="", app="bug",
         description="Ship the Bug: switch between 2D and 3D, with one profile, optional Hub sign-in and separate opt-in leaderboards.",
         patch=[{"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "2D + 3D arcade · separate leaderboards"}),
    dict(id="contracts", name="Contracts", kind="app", icon="", app="contracts",
         description="Subscriptions and contracts kept current by mail: put one address in CC, the AI proposes what changed with the sentence it read it from, a person confirms field by field. Last cancellation date, decision date and reminders follow from the confirmed terms; seats show what goes unused.",
         patch=[{"file": "/app.js", "from": "__BACKEND_CANISTER_ID__", "to": "${backend}"},
                {"file": "/app.js", "from": "__HUB_URL__", "to": "${hubUrl}"}],
         post=[{"method": "setHub", "arg": "${hubId}"}], tile={"kind": "app", "note": "contracts · renewals · seats"}),
]

TYPES = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
         ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain", ".md": "text/markdown",
         ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm", ".did": "text/plain", ".mo": "text/plain", ".webmanifest": "application/manifest+json"}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def git_ls(prefix):
    if "--from-worktree" in sys.argv: return [str(p.relative_to(ROOT)) for p in sorted((ROOT / prefix).rglob("*")) if p.is_file()]
    out = subprocess.run(["git", "--no-optional-locks", "ls-tree", "-r", "--name-only", "HEAD", prefix], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [l for l in out.splitlines() if l.strip()]
def git_show(path):
    if "--from-worktree" in sys.argv: return (ROOT / path).read_bytes()  # test runs only — the worktree may carry live ids
    return subprocess.run(["git", "--no-optional-locks", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, check=True).stdout
def version_of(app):
    m = re.search(r'^version\s*=\s*"([^"]+)"', (ROOT / app / "mops.toml").read_text(), re.M)
    return m.group(1) if m else "0.0.0"

def main():
    global OUT
    destination = OUT.resolve()
    expected = ROOT / "kitchen/dist/recipes"
    if OUT.is_symlink() or (destination != expected and (ROOT == destination or ROOT in destination.parents or destination.name != "recipes")):
        sys.exit("unsafe output: use kitchen/dist/recipes or a separate directory named recipes outside the source tree")
    if "--from-worktree" in sys.argv or "--build" not in sys.argv:
        sys.exit("release recipes require --build and a clean committed checkout; stale artifacts and --from-worktree are refused")
    dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    if dirty.strip():
        sys.exit("release checkout is dirty: commit reviewed source changes, then build from an isolated clean clone (never commit live IDs)")
    subprocess.run(["node", "design/logos/sync.mjs", "--check"], cwd=ROOT, check=True)
    subprocess.run(["node", "design/runtime/sync.mjs", "--check"], cwd=ROOT, check=True)
    subprocess.run(["node", "design/build.mjs", "--check"], cwd=ROOT, check=True)
    initial_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT)
    mops = ROOT / "node_modules/.bin/mops"
    if not mops.exists(): sys.exit("run npm ci at the repository root first (pinned Mops)")
    os.environ["PATH"] = str(mops.parent) + os.pathsep + os.environ.get("PATH", "")
    if "--build" in sys.argv:
        for r in RECIPES:
            print(f"mops install + icp build in {r['app']} …")
            subprocess.run([str(mops), "install", "--locked"], cwd=ROOT / r["app"], check=True)  # fresh clones have no .mops/
            subprocess.run([str(mops), "check"], cwd=ROOT / r["app"], check=True)
            subprocess.run([str(mops), "build"], cwd=ROOT / r["app"], check=True)
            moc = subprocess.check_output([str(mops), "toolchain", "bin", "moc"], cwd=ROOT / r["app"], text=True).strip()
            baseline = ROOT / r["app"] / "backend/backend.most"
            subprocess.run([moc, "--stable-compatible", str(baseline), str(ROOT / r["app"] / "backend/dist/backend.most")], check=True)
            subprocess.run(["icp", "build"], cwd=ROOT / r["app"], check=True)
    # Build into a sibling staging directory. A failed build cannot erase the old pantry.
    destination.parent.mkdir(parents=True, exist_ok=True)
    OUT = pathlib.Path(tempfile.mkdtemp(prefix=".recipes-build-", dir=destination.parent))
    base_src = ROOT / "hub/.icp/cache/artifacts/frontend"
    if not base_src.exists(): sys.exit("hub/.icp/cache/artifacts/frontend missing — run `icp build` in hub/ first (it holds the asset-canister module)")
    (OUT / "_base").mkdir(); base_dst = OUT / ("_base/" + sha(base_src) + ".wasm.gz"); shutil.copyfile(base_src, base_dst)
    try: commit = subprocess.run(["git", "--no-optional-locks", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except Exception: commit = "unknown"
    index = {"format": 2, "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "commit": commit, "recipes": []}
    for r in RECIPES:
        app, ver = r["app"], version_of(r["app"])
        be_src = ROOT / app / ".icp/cache/artifacts/backend"
        if not be_src.exists(): sys.exit(f"{be_src} missing — run `icp build` in {app}/ (or pass --build)")
        if r["kind"] == "app":  # recipe conventions the kitchen relies on at install/adopt time
            did = (ROOT / app / "backend/backend.did").read_text() if (ROOT / app / "backend/backend.did").exists() else ""
            for m in ("setHub", "hub_ping", "hub_manifest"):
                if not re.search(rf"^\s*{m}\s*:", did, re.M): sys.exit(f"{r['id']}: backend.did lacks `{m}` — see docs/agent/onboard-app.md § 10")
        d = OUT / r["id"] / ver; (d / "frontend").mkdir(parents=True)
        shutil.copyfile(be_src, d / "backend.wasm")
        # Stamp provenance before checksums/publication. Unrelated repository or
        # documentation commits must not manufacture a new build of the same app.
        inputs = [f"{app}/backend", f"{app}/dist", f"{app}/mops.toml", f"{app}/mops.lock", f"{app}/icp.yaml", "sdk/motoko"]
        source_commit = subprocess.check_output(["git", "log", "-1", "--format=%H", "HEAD", "--", *inputs], cwd=ROOT, text=True).strip()
        source_date = subprocess.check_output(["git", "show", "-s", "--format=%cI", source_commit], cwd=ROOT, text=True).strip()
        for key, value in {"service:version": ver, "service:git:sha": source_commit, "service:git:updated_at": source_date}.items():
            subprocess.run(["ic-wasm", str(d / "backend.wasm"), "-o", str(d / "backend.wasm"), "metadata", key, "-d", value, "-k"], check=True)

        files = []
        for path in (git_ls(f"{app}/dist/") if r.get("frontend", True) else []):
            rel = path[len(f"{app}/dist/"):]
            if rel.startswith(".well-known") or pathlib.Path(rel).name.startswith("."): continue  # sync config + II origins file are not app assets
            dst = d / "frontend" / rel; dst.parent.mkdir(parents=True, exist_ok=True); dst.write_bytes(git_show(path))
            file = {"key": "/" + rel, "type": TYPES.get(pathlib.Path(rel).suffix.lower(), "application/octet-stream"), "sha256": sha(dst), "size": dst.stat().st_size}
            # Deployment templates change during installation. Static files can
            # carry a verified compressed representation in the same release.
            if not any(p["file"] == file["key"] for p in r["patch"]):
                compressed = gzip.compress(dst.read_bytes(), compresslevel=9, mtime=0)
                compressed = compressed[:9] + b"\xff" + compressed[10:]  # stable gzip OS byte across Python platforms
                if len(compressed) < dst.stat().st_size:
                    gz = d / "frontend.gzip" / rel; gz.parent.mkdir(parents=True, exist_ok=True); gz.write_bytes(compressed)
                    file["gzip"] = {"sha256": sha(gz), "size": len(compressed)}
            files.append(file)
        for p in r["patch"]:
            if not any(f["key"] == p["file"] for f in files): sys.exit(f"{r['id']}: patch target {p['file']} is not among the frontend files")
            if p["from"].encode() not in (d / "frontend" / p["file"].lstrip("/")).read_bytes(): sys.exit(f"{r['id']}: {p['file']} does not contain {p['from']!r} — is the committed dist sanitized?")
        # optional picture: kitchen/art/<id>.png (≤ 100 KB, PNG) → shows on the menu after install and on the kitchen card
        art = ROOT / "kitchen" / "art" / f"{r['id']}.png"
        image = ""
        if art.exists():
            if art.stat().st_size > 100_000: sys.exit(f"{r['id']}: kitchen/art/{r['id']}.png is larger than 100 KB")
            (d / "icon.png").write_bytes(art.read_bytes()); image = f"recipes/{r['id']}/{ver}/icon.png"
        changelog = git_show(f"{app}/CHANGELOG.md").decode()
        sections = re.split(r"(?m)^## ", changelog)
        notes = next((section.split("\n", 1)[1].strip() for section in sections if section.startswith(f"[{ver}]")), "")
        requires = ([{"id": "kitchen", "minVersion": "0.7.0"}] if app == "hub" else
                    [{"id": "hub", "minVersion": "0.31.0"}] if app == "desk" else
                    [{"id": "hub", "minVersion": "0.27.0"}] if app == "assets" else
                    [{"id": "hub", "minVersion": "0.30.0"}] if app == "crumbs" else
                    [{"id": "hub", "minVersion": "0.23.0"}] if app in ["contracts", "forms", "trust", "watch"] else [])
        image_sha = sha(d / "icon.png") if image else ""
        identity = {"app": app, "version": ver, "sourceCommit": source_commit, "backend": sha(d / "backend.wasm"), "files": files, "patch": r["patch"], "baseFrontend": sha(base_dst) if r.get("frontend", True) else "", "image": image_sha, "requires": requires, "notes": notes, "post": r["post"], "tile": r["tile"]}
        release_id = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        immutable = d / release_id
        immutable.mkdir()
        for item in list(d.iterdir()):
            if item != immutable: shutil.move(str(item), immutable / item.name)
        d = immutable
        index["recipes"].append({
            "releaseId": release_id, "imageSha256": image_sha, "sourceCommit": source_commit, "notes": notes, "requires": requires,
            "id": r["id"], "name": r["name"], "kind": r["kind"], "version": ver, "description": r["description"], "icon": r["icon"], "image": image.replace(f"/{ver}/", f"/{ver}/{release_id}/") if image else "",
            "backend": {"path": f"recipes/{r['id']}/{ver}/{release_id}/backend.wasm", "sha256": sha(d / "backend.wasm"), "size": (d / "backend.wasm").stat().st_size},
            "frontend": ({"wasm": "recipes/_base/" + base_dst.name, "sha256": sha(base_dst), "dir": f"recipes/{r['id']}/{ver}/{release_id}/frontend", "files": files, "patch": r["patch"]} if r.get("frontend", True) else {"wasm": "", "sha256": "", "dir": "", "files": [], "patch": []}),
            "post": r["post"], "tile": r["tile"] or {"kind": "", "note": ""},
        })
        print(f"{r['id']:6s} {ver:8s} backend {((d / 'backend.wasm').stat().st_size / 1048576):.2f} MB · {len(files)} frontend files")
    # raw UTF-8, never \uXXXX escapes: the kitchen's JSON parser (mo:json 1.4) traps on them
    out = json.dumps(index, indent=1, ensure_ascii=False)
    assert "\\u" not in out, "index.json must not contain \\u escapes"
    (OUT / "index.json").write_text(out, encoding="utf-8")
    if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT) != initial_commit or subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT).strip():
        sys.exit("source changed during build — pantry was not published; discard the staging directory")
    previous = destination.with_name(".recipes-previous")
    if previous.exists(): sys.exit("previous pantry backup exists; inspect it before retrying")
    if destination.exists(): destination.rename(previous)
    try: OUT.rename(destination)
    except BaseException:
        if previous.exists(): previous.rename(destination)
        raise
    if previous.exists(): shutil.rmtree(previous)
    print("→", destination / "index.json")

if __name__ == "__main__":
    main()
