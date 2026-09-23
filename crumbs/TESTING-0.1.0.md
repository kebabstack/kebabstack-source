# Crumbs 0.1.0 validation record

Local validation on 2026-09-19, macOS, Node 26.5.0, pinned Mops 3.2.0, Motoko 1.12.0 and core 2.6.1. This is alpha-pilot evidence, not production approval or a throughput SLA. No production canister was installed or upgraded and no real website traffic was collected.

## Crumbs checks

- `node --test crumbs/test/*.test.mjs tests/crumbs.test.mjs`: **18 passed**, no skips. Covers collector privacy normalization, trusted-proxy handling, durable restart/retry/deduplication, poison-record isolation, transport deadlines, public error redaction, tracker SPA/consent behavior, CSV import, REST/client adaptation and real canister authorization/data integrity.
- The seven canister/HTTP cases include exact metrics and attribution, batch atomicity, scoped access and revocation, retention cleanup, a populated Crumbs upgrade and a signed HTTP collector → Candid backend → HTTP report round trip. The live HTTP test uses a private PocketIC NNS/application network, a test identity, an explicit locally obtained DER root key and an isolated temporary SQLite store.
- `bash crumbs/test/run-smoke.sh`: **3 passed**, covering Admin, Viewer and an empty installation. Visual review included desktop/mobile layouts and dark theme. The preview uses sample data.
- The 5,000-event local dataset produced exactly 1,000 unique daily visitors and 5,000 pageviews. One run took 1,528 ms to ingest and 87 ms to report in PocketIC; these are local observations, not Engine benchmarks.
- OpenAPI generation drift, compiled Candid/browser IDL, release metadata/placeholders and canonical SDK copies passed their checks.

## Upgrade and suite checks

Pinned dependencies were installed and all suite backends passed Mops check/build and stable compatibility against committed baselines. Crumbs has a new initial state contract: its populated upgrade test upgrades the same candidate image, not an earlier released Crumbs schema.

Two populated Hub/installer upgrade cases passed using artifacts compiled from committed base `057f019`. A separate Lunch-directory test passed across that Hub upgrade, retaining roster, filters and legacy access. The tested candidate preserves the suite's existing central permissions and setup-code requirements.

`npm run check` is **not wholly green**. It stops at the pre-existing `bug/tests/two-d.test.mjs` version assertion: expected `0.17.0`, actual `0.17.1`. Both values already exist at base `057f019`; this work does not change Bug. Other frontend checks before that point passed, and Contracts was run separately.

The remaining backend/release matrix contained 144 cases: 124 passed, 19 were skipped for optional historical baselines, and one Desk install read a Wasm while a concurrent build was rewriting it. Rerunning that Desk test after the build finished passed. This yields 125 passing cases across the recorded runs, not a claim that the initial run was clean. Keep compilation and tests that read its output sequential. Contracts relay tests (18), MCP tests (8) and Python tooling tests (16) also passed.

## Release artifacts

Source used for release packaging: `3f88a9fa3dd3ca581da9225de21bcfc7692d649f`.

Collector artifact: `crumbs-collector-final-0.1.0.tar.gz`, SHA-256 `6c2e5aa0091203d7c97636185a896757a2bed90446d2c6a37aecd7e3f1dc3b78`. All 17 payload file hashes matched after extraction. A clean `npm ci --omit=dev --ignore-scripts` and the packaged `--principal` CLI succeeded, including resolution through the macOS `/tmp` symlink. Plausible import CLI validation also succeeded with a synthetic CSV and no transmission.

The clean format-2 build succeeded and `bundleFiles()` verified **11 recipes / 442 files**, including deployment placeholders and gzip representations. The same checks passed after copying the output into the persistent artifact directory. All seven Crumbs canister/HTTP tests passed against the stamped Crumbs/Hub executables; an additional HTTP integration run passed using the extracted collector artifact. Two populated Hub/installer upgrade cases and seven Lunch/central-role cases also passed using the actual packaged backends and packaged asset executable.

Local artifact directory: `../kebabstack-crumbs-artifacts/0.1.0-3f88a9f/` relative to the repository root. It contains `recipes/`, `crumbs-collector-final-0.1.0.tar.gz`, `verified-bundle.json` and test logs. The packaging checkout was at `3f88a9f`; recipe provenance records each component's last relevant source commit, so Hub/Kitchen retain `a6be2f2`. Subsequent changes only add test-harness support and this validation record.

| Component | Version | Release ID |
|---|---|---|
| kitchen | 0.8.0 | `704b351d9988ca91b1fb892221fc944240274ed85045e72041e7c393b8340c7c` |
| hub | 0.30.0 | `84f203ed131b90c1c51fc58fc789d1a60366796969f63ac2c5a5b2c38f1db10d` |
| crumbs | 0.1.0 | `c006fe1ee4b42a6aab360c2d35c646dc63abd60aed44234c05b6773d3f81f672` |

The branch `codex/crumbs-analytics` is isolated from the original worktree's concurrent Desk/Hub/SDK work. This bundle excludes those uncommitted changes. Reconcile both branches, resolve shared version changes and rebuild/retest before any suite rollout that should include them.

For reproducible packaged checks, `tests/permissions.test.mjs` and `tests/releases.test.mjs` accept `KEBAB_TEST_BUNDLE` pointing at `recipes/`; the helper verifies each selected backend's size and SHA-256. Supply committed old artifacts through `KEBAB_HUB_BASELINE`, `KEBAB_KITCHEN_BASELINE` and `KEBAB_PERMISSIONS_BASELINE`, and the bundled frontend executable through `KEBAB_ASSET_WASM`. Run the populated installer/Hub cases and the Lunch/Hub-role cases:

```sh
node --test --test-name-pattern='populated installer|Hub itself' tests/releases.test.mjs
node --test --test-name-pattern='lunch team-directory|Hub role authority' tests/permissions.test.mjs
```

Crumbs tests accept `CRUMBS_PACKAGED_CRUMBS_WASM` and `CRUMBS_PACKAGED_HUB_WASM` pointing at the immutable backend paths from the index. Compiled `.did` files must come from the matching checkout. Do not run a compiler concurrently with tests reading its output.
 The bundle is local and unpublished. Publish and deploy only its identical stamped artifacts through the documented Kitchen workflow after authorization. Source commit and release IDs identify exactly what was tested.

## Remaining acceptance work

See [PARITY](PARITY.md) for the cutover contract. Required work includes the actual OpenCloud/ingress configuration, target-volume capacity tests, failure/recovery drills and at least 14 days of parallel reconciliation with Plausible. UTC-only reporting, explicit storage/report limits, separate imported history, coarse classification and missing Search Console/scheduled reports remain material differences.

A trusted Node collector is a separate host process. Cookieless operation does not by itself establish consent exemption or GDPR compliance; assess actual event schemas, logs, retention, backups, roles and hosting locations as described in [PRIVACY](PRIVACY.md).
