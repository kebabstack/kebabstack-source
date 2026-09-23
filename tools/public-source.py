#!/usr/bin/env python3
"""Audit/export one committed source tree. Never copy a working directory or Git history.

This is a publication gate, not proof that all secrets, personal data or licensing
issues have been found. Findings contain paths/rule IDs/line numbers, never values.
"""
import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = (
    '**/deployments/**', 'docs/release-*.md', 'docs/reviews/**',
    'docs/REVIEW-*.md', 'docs/SANITIZE.md', 'docs/RELAUNCH.md', '**/DEPLOYED.md',
    '.git/**', '**/.git/**', '.icp/**', '**/.icp/**', '.mops/**', '**/.mops/**',
    'node_modules/**', '**/node_modules/**', '**/backend/dist/**',
    'kitchen/dist/recipes/**', '.marketplace-private/**',
    '.env', '.env.*', '**/.env', '**/.env.*', '**/.dev.vars',
    '*.pem', '*.key', '*.p12', '*.pfx', '*.keystore', '*.log', '*.sqlite', '*.db',
    '*.wasm', '*.zip', '*.tar', '*.tar.gz', '*.tgz', '.DS_Store', '**/.DS_Store',
)
RULES = {
    'private-key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[ \t]*(?:\r?\n|\\n|\\r\\n)[A-Za-z0-9+/=]{20,}'),
    'github-token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'slack-token': re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    'aws-access-key': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'provider-key': re.compile(r'\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{35,}\b'),
    'local-user-path': re.compile(r'/(?:Users|home)/[A-Za-z0-9._-]+/(?:Documents|Library|Desktop|Downloads)/'),
    'local-temp-path': re.compile(r'/var/folders/[A-Za-z0-9/_-]+'),
    'canister-reference': re.compile(r'\b[a-z0-9]{5}(?:-[a-z0-9]{5}){3}-cai\b'),
    'deployment-domain': re.compile(r'https?://(?:dfinity|assets|contracts|desk|forms|trust|watch|crumbs|play|relay)\.kebabstack\.com\b', re.I),
    'company-configuration': re.compile(r'(?:@dfinity\.org\b|https?://(?:[\w-]+\.)?dfinity\.okta\.com\b)', re.I),
}
# Public infrastructure and obvious examples are not installation identifiers.
PUBLIC_CANISTERS = {'rrkah-fqaaa-aaaaa-aaaaq-cai', 'rdmx6-jaaaa-aaaaa-aaadq-cai',
                    'rwlgt-iiaaa-aaaaa-aaaaa-cai', 'xxxxx-xxxxx-xxxxx-xxxxx-cai',
                    'ryjl3-tyaaa-aaaaa-aaaba-cai'}  # Public ICP ledger, used by the upstream agent.
NON_WAIVABLE = {'private-key', 'github-token', 'slack-token', 'aws-access-key',
                'provider-key', 'unsafe-path', 'unsupported-git-entry',
                'frontend-placeholder', 'denied-marker', 'link-to-private-file',
                'company-configuration', 'deployment-domain', 'local-user-path', 'local-temp-path',
                'private-file-in-public-tree'}
FRONTENDS = {
    'hub/dist/index.html': {'BACKEND_CANISTER_ID': '__BACKEND_CANISTER_ID__', 'CANONICAL_ORIGIN': ''},
    **{f'{m}/dist/app.js': {'BACKEND_CANISTER_ID': '__BACKEND_CANISTER_ID__', 'HUB_URL': '__HUB_URL__'}
       for m in ['desk', 'assets', 'watch', 'crumbs', 'trust', 'forms', 'bug', 'bug2d', 'contracts']},
    'desk/dist/support.js': {'BACKEND_CANISTER_ID': '__BACKEND_CANISTER_ID__'},
}


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.PIPE)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def excluded(path):
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in EXCLUDED)


def read_tree(root, ref):
    commit = git(root, 'rev-parse', '--verify', ref + '^{commit}').decode().strip()
    entries = []
    for raw in git(root, 'ls-tree', '-rz', '--full-tree', commit).split(b'\0'):
        if not raw:
            continue
        meta, name = raw.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        path = name.decode('utf-8', errors='strict')
        entries.append((path, mode, kind, oid))
    return commit, entries


def load_reviews(path):
    if path is None:
        return []
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        raise ValueError('Reviews must be a JSON array')
    for review in data:
        if (not isinstance(review, dict) or not isinstance(review.get('path'), str)
                or not re.fullmatch(r'[a-f0-9]{64}', str(review.get('sha256', '')))
                or not isinstance(review.get('rules'), list) or not review['rules']
                or not all(isinstance(r, str) and r not in NON_WAIVABLE for r in review['rules'])
                or not isinstance(review.get('reason'), str) or len(review['reason'].strip()) < 12):
            raise ValueError('Invalid review; use an exact path, SHA-256, reviewable rules and a reason')
    return data


def findings_for(path, data, markers):
    findings = []
    def add(rule, line=0):
        item = {'path': path, 'rule': rule, 'line': line, 'sha256': digest(data)}
        if item not in findings:
            findings.append(item)
    # Scan ASCII credential markers in binary metadata as well. A reviewed image
    # must not become an escape hatch for a recognizable credential.
    try:
        text = data.decode('utf-8')
        binary = '\0' in text
    except UnicodeDecodeError:
        text = data.decode('utf-8', errors='replace')
        binary = True
    if binary:
        add('binary-review')
    for rule, pattern in RULES.items():
        for match in pattern.finditer(text):
            if rule == 'canister-reference' and match.group() in PUBLIC_CANISTERS:
                continue
            add(rule, text.count('\n', 0, match.start()) + 1)
    folded = text.casefold()
    for marker in markers:
        start = folded.find(marker.casefold())
        if start >= 0:
            add('denied-marker', text.count('\n', 0, start) + 1)
    for key, expected in FRONTENDS.get(path, {}).items():
        values = re.findall(r'\bconst\s+' + key + r'\s*=\s*["\']([^"\']*)["\']', text)
        if values != [expected]:
            add('frontend-placeholder')
    return findings


def audit(root, ref='HEAD', reviews=(), markers=()):
    commit, entries = read_tree(root, ref)
    files, omitted, findings, approved = {}, [], [], []
    for path, mode, kind, oid in entries:
        parts = PurePosixPath(path).parts
        if path.startswith('/') or '..' in parts or '\\' in path or any(ord(c) < 32 for c in path):
            findings.append({'path': '[unsafe path]', 'rule': 'unsafe-path', 'line': 0, 'sha256': ''})
            continue
        if excluded(path):
            omitted.append(path)
            continue
        if kind != 'blob' or mode not in {'100644', '100755'}:
            findings.append({'path': path, 'rule': 'unsupported-git-entry', 'line': 0, 'sha256': ''})
            continue
        data = git(root, 'cat-file', 'blob', oid)
        files[path] = (mode, data)
        for item in findings_for(path, data, markers):
            review = next((r for r in reviews if item['rule'] not in NON_WAIVABLE
                           and r['path'] == path and r['sha256'] == item['sha256']
                           and item['rule'] in r['rules']), None)
            (approved if review else findings).append(item)
    # Once exported, a public repository must never acquire the files that a
    # private development-tree export would omit. Exclusion is not permission
    # to commit operational records to the public repository.
    if '.kebab-public-source.json' in files:
        for path in omitted:
            findings.append({'path': path, 'rule': 'private-file-in-public-tree', 'line': 0, 'sha256': ''})
    # Removal of an internal record must not silently leave a broken Markdown link.
    omitted_set = set(omitted)
    for path, (_, data) in files.items():
        if not path.endswith('.md'):
            continue
        text = data.decode('utf-8', errors='replace')
        for match in re.finditer(r'\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)', text):
            href = match.group(1).split('#')[0]
            if not href or '://' in href or href.startswith(('#', 'mailto:')):
                continue
            # Pure path normalization without touching the operator filesystem.
            target = os.path.normpath(str(PurePosixPath(path).parent / href)).replace(os.sep, '/')
            if target in omitted_set:
                findings.append({'path': path, 'rule': 'link-to-private-file',
                                 'line': text.count('\n', 0, match.start()) + 1, 'sha256': digest(data)})
    report = {'format': 'kebab-public-source-audit-v1', 'sourceCommit': commit,
              'filesSelected': len(files), 'filesExcluded': len(omitted),
              'excluded': omitted, 'findings': findings, 'reviewed': approved,
              'patternGatePassed': not findings,
              'marketplaceReady': False,
              'remainingGates': ['Manual content and license review', 'Clean build and fresh installation',
                                 'Populated upgrade and restore', 'Marketplace submission requirements']}
    return report, files


def export_tree(root, output, report, files):
    if report['findings']:
        raise ValueError('Export refused: resolve the reported findings first')
    root, output = Path(root).resolve(), Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('Export destination already exists; it will not be replaced')
    # Resolve parent aliases before the checkout-boundary check (macOS /var and
    # /tmp themselves are aliases). Never resolve an existing destination link.
    output = output.resolve()
    if not output.parent.is_dir():
        raise ValueError('Export parent must exist')
    if output == root or root in output.parents:
        raise ValueError('Export destination must be outside the source checkout')
    for required in ('README.md', 'LICENSE'):
        if required not in files:
            raise ValueError('Export requires README.md and LICENSE')
    manifest = {'format': 'kebab-public-source-v1', 'sourceCommit': report['sourceCommit'],
                'historyIncluded': False, 'marketplaceReady': False, 'files': []}
    with tempfile.TemporaryDirectory(prefix='.kebab-public-', dir=output.parent) as temporary:
        stage = Path(temporary) / 'source'
        stage.mkdir()
        for path, (mode, data) in sorted(files.items()):
            target = stage / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o755 if mode == '100755' else 0o644)
            manifest['files'].append({'path': path, 'sha256': digest(data), 'mode': mode})
        manifest_path = stage / '.kebab-public-source.json'
        if manifest_path.exists():
            raise ValueError('Source already contains an export manifest; export the original tree instead')
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        if output.exists():
            raise ValueError('Destination appeared during export; it was not modified')
        stage.rename(output)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--ref', default='HEAD', help='Committed source ref (default HEAD); never the working tree')
    parser.add_argument('--report', type=Path, help='Private audit JSON; no matched values are written')
    parser.add_argument('--reviews', type=Path, help='Explicit path/hash-bound manual reviews')
    parser.add_argument('--deny-file', type=Path, help='Private UTF-8 file of additional literal markers, one per line')
    parser.add_argument('--out', type=Path, help='New directory outside the source checkout; only created on a clean audit')
    args = parser.parse_args()
    try:
        reviews = load_reviews(args.reviews)
        markers = [s.strip() for s in args.deny_file.read_text().splitlines() if s.strip()] if args.deny_file else []
        if any(len(s) < 4 for s in markers):
            raise ValueError('Private deny markers must contain at least four characters')
        report, files = audit(args.repo, args.ref, reviews, markers)
        if args.report:
            # A report can name internal files. Restrict access, and never overwrite a file.
            fd = os.open(args.report, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump(report, stream, indent=2)
                stream.write('\n')
        print(f"Selected {report['filesSelected']} files; excluded {report['filesExcluded']} internal/generated files.")
        for item in report['findings']:
            print(f"{item['path']}:{item['line']}: {item['rule']}")
        if report['findings']:
            print(f"Publication gate blocked: {len(report['findings'])} findings. No source export was written.")
            return 1
        if args.out:
            manifest = export_tree(args.repo, args.out, report, files)
            print(f"Exported {len(manifest['files'])} files without Git history. This is not a marketplace certification.")
        else:
            print('Pattern gate passed. Manual review and release acceptance are still required.')
        return 0
    except (ValueError, OSError, subprocess.CalledProcessError, UnicodeError) as error:
        # Do not echo Git stderr, source data, private markers or token-bearing arguments.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Audit failed; check source ref, paths and file permissions.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
