# Crumbs 0.2.0 validation

Local validation on 2026-09-19 with pinned Motoko 1.12.0/core 2.6.1, Mops 3.2.0, Node 26.5.0 and PocketIC. No production deployment or real website collection occurred. This adds the [website permission contract](ACCESS.md) to the 0.1.0 pilot; [previous suite and artifact evidence](TESTING-0.1.0.md) remains recorded separately.

## Passed

- Pinned npm dependencies and locked Mops dependencies installed. Mops check/build succeeded. The candidate stable signature passed `moc --stable-compatible` against the committed 0.1.0 baseline **before** replacing it. A new migration initializes only the separate site-access map; the previous migration remains unchanged.
- **23 tests passed, no skips**, using `CRUMBS_ACCESS_BASELINE` for the actual packaged 0.1.0 Wasm plus its matching Candid. This includes all prior tracking/metrics/collector tests and new authorization regressions: default-private sites, Read/Manage scope, Hub Owner/Admin override, cross-site denial, stale revisions, invalid assignees, key/share revocation on demotion, Hub outage/deactivation, and stable-ID preservation across email rename/reuse.
- The populated 0.1.0 → 0.2.0 upgrade preserves metrics, API keys and both legacy viewer modes. Saving named roles ends the legacy mode. A second populated upgrade retains the new roles and existing records.
- The real signed HTTP collector test now exercises site-role output, member lookup, Hub user search, denied Reader access and successful Manager assignment through REST, in addition to durable ingestion/reporting.
- **5 UI smoke modes**: Admin, Reader, Manager, empty Admin and empty Reader. Tests cover name/email selection, escaped directory text, saved manager grants, hidden global controls, and management-control removal when access is demoted. Deferred-response regressions cover final-site revocation while reports, funnels, member lookup, key creation and exports are in flight. Local browser review verifies the settings/member interface with synthetic users.
- OpenAPI drift, compiled Candid/IDL, canonical SDK copies and release metadata/placeholders pass. The Crumbs recipe reads version 0.2.0 from module metadata and includes the new access-editor asset.

Reproduce from the repository root:

```sh
CRUMBS_ACCESS_BASELINE=/absolute/path/to/0.1.0-fixture node --test crumbs/test/*.test.mjs tests/crumbs.test.mjs
bash crumbs/test/run-smoke.sh
```

The baseline fixture contains `backend.wasm` and the matching `backend.did`. Without it, the historical-upgrade case is explicitly skipped, not counted as validated. Native tests also accept `CRUMBS_PACKAGED_CRUMBS_WASM` and `CRUMBS_PACKAGED_HUB_WASM` to exercise immutable recipe outputs. Do not compile concurrently with tests reading build outputs.

## Scope and limits

Hub/SDK/Kitchen production code is unchanged in this increment; their earlier packaged upgrade, Lunch-preservation and central-permission evidence is in the 0.1.0 record. The existing Bug version assertion still prevents claiming a wholly green suite-wide check; it is unrelated to Crumbs and was not changed here.

Plausible retirement still requires the workload/capacity and parallel-measurement gates in [PARITY](PARITY.md). New roles do not establish GDPR compliance. Current permission metadata records only the most recent editor, timestamp and revision; a full change-history feed and automated operational alerts are not implemented.

## Packaging

The matching 0.2.0 canister and collector artifacts must be installed together. The frozen build at `46671246797df24f1491fcbba15803177f31e191` produced a format-2 bundle with 11 recipes; the release verifier checked all 444 files, including gzip representations and deployment placeholders. All ten non-Crumbs release IDs are byte-identical to the previously tested bundle, so the prior Hub/Kitchen/Lunch and central-permission upgrade evidence applies to those unchanged packages.

- Crumbs immutable release: `36323efc6d632d7ba24ac50d75237e8208d2a92fcc5bc34fbfd2ad678f0b0057`.
- Packaged backend SHA-256: `028eeb16b4e5bed8d4eec6c3b1220d782cda9db96df86dff18e147556865c445`.
- Collector archive SHA-256: `165df97ff594c0f15fb832c7d53fdce7a44ad39a2615805de38ba4b0d39ccf74`.
- **12 native/HTTP tests passed, no skips**, against the stamped Crumbs and Hub Wasms, including both populated upgrades and permission/identity regressions.
- The real signed HTTP integration passed once more using the **extracted collector archive** and those stamped Wasms. Its 18-file manifest matches the final source; production-only dependencies and identity initialization were checked in an isolated local directory.
- All five UI smoke modes passed against the final frontend, including deferred responses arriving after website access disappears. The new report regression was first observed failing against the previous frontend.

Artifacts, checksums, baseline fixture and logs are retained in the sibling `kebabstack-crumbs-artifacts/0.2.0-4667124/` directory. Test identities and queue data are not included. No package was published or deployed to production.
