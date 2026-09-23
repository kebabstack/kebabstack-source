# Prepare a source snapshot for publication

The live development repository can contain operational evidence and historical
deployment configuration. A public release is a reviewed source snapshot with a
new history. Do not push the internal branch/history to the public repository.

This procedure is implemented tooling. Public marketplace readiness remains an
open milestone in [the staged roadmap](MARKETPLACE-ROADMAP.md).

## Audit an exact commit

Commit the source changes intended for review, then run:

```sh
python3 tools/public-source.py --ref HEAD --report /absolute/private/path/audit.json
```

Use a new report path; the tool refuses to overwrite existing files. The report
has owner-only permissions. It records source commit, relative paths, line
numbers, rule identifiers and hashes, never matched credential values.
An audit with findings exits 1; a processing error exits 2. No finding is a
claim that a credential is active or exploitable.

The tool reads Git blobs from that commit. Untracked files, current working-tree
changes and the old Git history are never copied. Known operational receipt,
deployment, cache, environment, key, database and archive paths are excluded.
Symlinks and submodules in the selected source are refused rather than followed.
Executable file modes and the license are preserved.

Existing source can be scanned before the full cleanup is finished. Findings
block export; they do not cause deletion or automatic rewriting of application
code. Update source deliberately, test it, commit it, and audit the new commit.
Use generic examples in public guides. Replace links to excluded operational
evidence with a public explanation, not a dangling link.

## Private markers and reviewed public assets

Supply installation-specific names, domains or other literal strings in an
external private UTF-8 file, one per line:

```sh
python3 tools/public-source.py --deny-file /absolute/private/path/markers.txt
```

Do not commit that marker list. Matching is case-insensitive, literal, and requires
at least four characters. Additional deny markers cannot be waived.

Binary assets need a visual/content and license review, including metadata.
Legitimate public infrastructure IDs or synthetic test IDs can also need manual
classification. Pass explicit reviews using `--reviews /absolute/private/path/reviews.json`:

```json
[
  {
    "path": "design/example.png",
    "sha256": "<exact SHA-256 from the audit>",
    "rules": ["binary-review"],
    "reason": "Reviewed original illustration and metadata; distribution permitted."
  }
]
```

The example hash must be replaced with the actual 64-character hexadecimal
digest. A review applies only to that path, those bytes and those rule IDs;
changing the file invalidates it. Recognizable credentials, live frontend
bindings, unsafe Git entries and private deny markers cannot be waived. A review
record is an operator decision, not an independent security or license audit.

Pattern matching is not exhaustive. It cannot detect arbitrary personal data,
all credential formats, hidden content or every licensing restriction. Inspect
source, screenshots, binary metadata, third-party attribution, configuration and
documentation before publication. An upstream package name is not customer data.

## Export without overwriting anything

After the audit passes, export to a new directory outside the source checkout:

```sh
python3 tools/public-source.py --ref HEAD \
  --reviews /absolute/private/path/reviews.json \
  --deny-file /absolute/private/path/markers.txt \
  --out /absolute/path/kebabstack-public-candidate
```

The parent must already exist. The exporter refuses an existing destination and
stages the result in a temporary directory before making it visible. It does
not change source files, initialize Git, add a remote, upload to GitHub, publish
a release or deploy a canister.

`.kebab-public-source.json` records the source commit and each exported file's
SHA-256 and mode. It explicitly says `marketplaceReady: false`. That label is
intentional: passing the source pattern gate is not release acceptance.

## Accept the candidate

1. Inspect the exact exported content and retain a private review record.
2. Initialize its new Git history, with the existing license and attribution.
3. Install pinned dependencies, build and run the documented checks in that clean
   repository. Verify actual packages, fresh setup, populated upgrades and restore.
4. Verify that source placeholders become installation-specific values only at
   deployment, and that no existing company configuration is required to install.
5. Prepare the chosen GitHub repository privately, then publish the reviewed
   release and submit it using the marketplace operator's actual requirements.

Use the normal Kitchen release workflow for runtime artifacts. A clean source
export is not a replacement for release stamping, verification or recovery tests.
Keep public release notes separate from internal deployment receipts.
