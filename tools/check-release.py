#!/usr/bin/env python3
"""Check release metadata and deployment placeholders; --staged checks Git's index."""
import argparse, json, pathlib, re, subprocess, sys, tomllib
ROOT = pathlib.Path(__file__).resolve().parents[1]
FRONTENDS = {'hub/dist/index.html': {'BACKEND_CANISTER_ID': '__BACKEND_CANISTER_ID__', 'CANONICAL_ORIGIN': ''}, **{f'{m}/dist/app.js': {'BACKEND_CANISTER_ID': '__BACKEND_CANISTER_ID__', 'HUB_URL': '__HUB_URL__'} for m in ['desk','assets','watch','crumbs','trust','forms','bug','bug2d','contracts']}}

FRONTENDS['crumbs/dist/shared.js'] = {'BACKEND_CANISTER_ID': '__BACKEND_CANISTER_ID__'}
FRONTENDS['desk/dist/support.js'] = {'BACKEND_CANISTER_ID': '__BACKEND_CANISTER_ID__'}

def placeholder_errors(path, data):
    errors = []
    for key, expected in FRONTENDS[path].items():
        matches = re.findall(r'\bconst\s+' + key + r'\s*=\s*["\']([^"\']*)["\']', data)
        if matches != [expected]: errors.append(f'{path}: {key} must be the repository placeholder {expected!r}')
    return errors

def main():
    args = argparse.ArgumentParser(description=__doc__); args.add_argument('--staged', action='store_true')
    args.add_argument('--placeholders-from-index', action='store_true', help='check the deployment placeholders in the git index instead of the working tree (a live working clone keeps its canister ids in the tracked frontends on purpose); metadata is still checked in the working tree')
    options = args.parse_args()
    errors = []
    for path in FRONTENDS:
        if options.staged or options.placeholders_from_index:
            r = subprocess.run(['git','show',f':{path}'], cwd=ROOT, capture_output=True, text=True)
            if r.returncode:
                if options.placeholders_from_index and (ROOT/path).exists(): data = (ROOT/path).read_text()  # a new module not yet added: its working copy is what will be added
                else: errors.append(f'{path}: missing from staged tree'); continue
            else: data = r.stdout
        else: data = (ROOT/path).read_text()
        errors += placeholder_errors(path, data)
    if not options.staged:
        for module in ['hub','desk','assets','watch','crumbs','trust','forms','bug','bug2d','contracts','vault','kitchen']:
            config = tomllib.loads((ROOT/module/'mops.toml').read_text()); version = config['package']['version']
            source = (ROOT/module/'backend/main.mo').read_text()
            if not re.search(r'transient let BUILD_VERSION\s*:\s*Text\s*=\s*"'+re.escape(version)+'"',source): errors.append(f'{module}: runtime version must match mops.toml ({version})')
            if f'## [{version}]' not in (ROOT/module/'CHANGELOG.md').read_text(): errors.append(f'{module}: missing changelog section {version}')
            lock=(ROOT/module/'mops.lock').read_text()
            if re.search(r'/(Users|home)/',lock): errors.append(f'{module}: lock contains an absolute local path; regenerate with pinned Mops')
        for module in ['bug','bug2d']:
            version=tomllib.loads((ROOT/module/'mops.toml').read_text())['package']['version']
            for relative in ['package.json','package-lock.json','dist/build-info.json']:
                if json.loads((ROOT/module/relative).read_text())['version'] != version: errors.append(f'{module}/{relative}: version must match {version}')
            for folder in ['src','dist']:
                files=['app.js','physics.js']+(['two-d/physics.js'] if module=='bug' else [])
                for filename in files:
                    source=(ROOT/module/folder/filename).read_text()
                    constant='APP_VERSION' if filename=='app.js' else 'VERSION'
                    if not re.search(r'export const '+constant+r"\s*=\s*[\"']"+re.escape(version)+r"[\"']",source): errors.append(f'{module}/{folder}/{filename}: {constant} must match {version}')
        sdk=tomllib.loads((ROOT/'sdk/motoko/mops.toml').read_text())['package']['version']
        mcp=json.loads((ROOT/'kebab-mcp/package.json').read_text())['version']
        if f'export const VERSION = "{mcp}"' not in (ROOT/'kebab-mcp/server.mjs').read_text(): errors.append(f'kebab-mcp: server VERSION must match package.json ({mcp})')
        if f'## [{mcp}]' not in (ROOT/'kebab-mcp/CHANGELOG.md').read_text(): errors.append(f'kebab-mcp: missing changelog section {mcp}')
        if f'## [{sdk}]' not in (ROOT/'sdk/CHANGELOG.md').read_text(): errors.append('SDK changelog missing')
    if errors: print('\n'.join(errors)); return 1
    print('Release metadata/placeholders OK' if not options.staged else 'Staged deployment placeholders OK'); return 0
if __name__=='__main__': sys.exit(main())
