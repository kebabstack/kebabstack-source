# Crumbs 0.11.0 — native traffic context and Matomo history

- Standard: 1.2.0. Source branch: `codex/crumbs-matomo`, based on public `7e28729`.
- Surface: report breakdowns, tracking setup/source freshness, imported History.
- Review date: 19 October 2026. Status: verified scoped local workflows; full accessibility certification remains partial.
- This review does not itself grant production authorization. The operator subsequently explicitly authorized rollout; see the production acceptance section below.

## Behavior and boundaries

Both tracking identity modes share native GeoIP/ASN/hosting lookup. Screen size and
webdriver are browser signals. Hosting is not proof of a bot; unknown is not human.
DB-IP Lite is monthly, reduced accuracy, CC BY 4.0 with visible attribution. Public
AWS EC2/Google Cloud ranges cover those providers only. Offline operator commands
prepare/load snapshots; no additional runtime process or per-visitor outcall exists.

Matomo daily aggregates retain date labels, timezone, source method, original
scalar metrics and availability. They do not reconstruct visits or enter native
totals. Import retries are idempotent and revised overlapping rows conflict.
Capacity remains 100,000 imported rows and 5,000 rows per history query. A real
private Matomo export and business cutover reconciliation are not part of local
synthetic fixtures; retain the source archive and select report scope explicitly.

## Acceptance evidence

| Gate | Result and scope |
|---|---|
| Permissions | Local canister tests: controller-only dataset changes, website-scoped report/import access, denied read-key imports, preserved manager keys on prior-release upgrade. |
| Ingestion | Both cookie/daily identities, IPv4/IPv6/mapped addresses, screen validation, expiry, staged activation and retries across database refresh and upgrade tested. |
| Full data | Complete October 2026 DB-IP City Lite (7,786,865 normalized ranges) and ASN Lite (477,362) loaded in PocketIC. Google IPv4/IPv6 ASN lookup, 50-event batch and populated upgrade passed. Local timing is not a production SLA. |
| History | Original metrics and unavailable fields rendered; malformed/partial/hierarchical reports rejected; authorization/idempotence/conflict tested through native REST. UI dates use source calendar labels rather than website UTC offsets. |
| Browser | Actual IAB interactions at 1280×800, 800×800, 390×640, 320×640 and 1024×500; light/dark, keyboard focus and real scrolling. Global bar remains at viewport top. |
| Responsive defect | Initial long Matomo row squeezed labels into a narrow column. Dedicated wrapping history layout fixes it; 320/390 px renders rechecked. |
| Empty/error/stale | Admin, manager, reader and empty-state frontend smokes, existing loading/stale-response/revocation tests. |
| Runtime/design | Canonical runtime sync/check, SDK copies, brand and design gates; no new palette or logo. |
| Full accessibility | Screen-reader task completion, Safari/iOS and 200% text enlargement not certified in this review. |
| Release | Clean format-2 package verified (793 artifacts). Packaged Crumbs: 25 passed, one unavailable ancient baseline skipped; central permissions/Lunch: 2 passed; shared release executor: 8 passed. Initial local acceptance; subsequent production receipts are separate. |

## Integrity map

| Producer / consumer | Reconciliation |
|---|---|
| Tracker → native ingress | Optional screen/automation fields; same consent/GPC/DNT gates; IP lookup does not strengthen visitor hashing. |
| Native state → reports/export | Event context migration, storage charge, dimensions/filters, REST JSON, OpenAPI, JS types, generated Candid/browser IDL. Committed stable baselines remain unchanged. |
| Optional collector → backend | New optional context and compatibility with pre-existing queued events; no runtime collector is required for native mode. |
| Operator datasets → canister | Bounded dictionary/chunk staging, ordered disjoint ranges, controller checks, expiry and provenance. SHA-256 checked upload packages, explicit destination/identity, validation-only default. |
| Matomo API → History | Read-only exporter, strict archive adapter, manage-key import, date-label rendering, availability and retained source metrics. Actual tenant export remains untested. |
| Hub / SDK / other apps | No permission schema change; original role/lease behavior retained. Full-suite gates and separate packaged Lunch/central-permission regressions are required. |
| Documentation / recipes | Crumbs 0.11.0 source/served changelog, setup/privacy/parity/metric/API guides and generated operator page. Recipes derive Crumbs version. Website claims remain compatible; no unshipped parity claim added. |
| Independent modules | Hub, Assets, Desk, Forms, Contracts, Trust, Watch, Kitchen, Vault, Bug, website and MCP retain their own versions. Suite checks do not imply full interactive recertification of them. |

## Reproduce extended local tests

Use pinned dependencies and local identities. Set `CRUMBS_NATIVE_BASELINE` to a
verified prior Wasm/Candid directory for the populated upgrade fixture.
`CRUMBS_TRAFFIC_DATA_DIR` enables the complete dataset fixture with prepared
`city-v2`, `asn`, `hosting` folders. `CRUMBS_TRAFFIC_LOAD=1` adds context and
1,000 network/ASN groups to the 50,000-event load test. Packaged tests use
`CRUMBS_PACKAGED_CRUMBS_WASM` and `CRUMBS_PACKAGED_HUB_WASM`; suite integration
fixtures use `KEBAB_TEST_BUNDLE` and their documented prior baselines.

## Final local acceptance (19 October 2026)

The packaged executable loaded 8,269,786 city/ASN/hosting ranges and retained
these through a populated upgrade from the hash-verified published 0.10.0
baseline. PocketIC reported 1,276,353,828 memory bytes; a 50-event enriched batch
took 166 ms. The 50,000-event, 1,000-network-group regression passed. These are
local measurements, not production latency or cost guarantees.

The actual ICP CLI uploader passed against the packaged local canister with
5,559 hosting ranges, a verified local root key and a disposable named identity.
The identity and seed were deleted afterward. Reproduce with
`node crumbs/test/uploader-cli.mjs PACKAGE_DIR WASM`. A pooled Node Buffer decode
bug discovered by this test was fixed using an exact Uint8Array backing buffer
and the CLI's structured JSON response.

Final Crumbs unit tests: 40 passed. The initial suite run had eight obsolete
JavaScript Candid fixture failures (missing explicit optional context); these
were fixed and all eight passed in the complete Crumbs backend rerun. The initial
suite command therefore did not exit successfully. Downstream website (16), MCP
(45) and Python (24) gates passed independently. Historical baseline skips in
other modules remain recorded; full accessibility certification remains partial.

Evidence, immutable bundle checksums and retained dataset packages are in the
local `kebabstack-release-tools/crumbs-native-matomo-2026-10-19/receipt.json` and
its `evidence/` directory. Only Crumbs changes in the prepared catalogue; refresh
against the live catalogue before any future authorized publication. Real tenant
Matomo export and business reconciliation remain outstanding.

## Authorized production preflight

The operator explicitly authorized production rollout after another bug check.
The live 0.10.0 backend hash matched the retained published upgrade baseline.
The first 100,000-event fixture reproduced an instruction-limit failure in the
old release's report query before migration. The candidate now stops report
scans at 50,000 with an explicit capacity error rather than attempting that
unbounded-cost report. Storage, paginated exports and imported-row limits remain
unchanged. Source/served limits and changelogs were reconciled.

The corrected source regression migrates 100,000 events split across two days,
checks stored/accepted counts and byte charge, compares an exact 50,000-event
report before/after, verifies unknown legacy context and duplicate retry, and
requires a capacity error for the full interval. It passed. The fixture waits
for the existing central-permission refresh after upgrade; it does not bypass
permissions. Final packaged and production receipts are recorded separately.

Preflight runtime introspection reported 738,197,504 bytes of allocated Wasm
memory and about 223 MB maximum live heap, below the configured 3 GiB Wasm limit.
The management status aggregate (about 2.96 GB) also includes other canister
memory usage and must not be mistaken for Wasm heap size. No memory setting was
changed on this basis. Authenticated live Overview and website access worked.
Both dfinity.org and kebabstack.dev reference the hosted Crumbs tracker, so no
separate tracking-script source deployment is needed for this rollout.

## 0.11.1 production follow-up

Crumbs 0.11.0 was published and deployed through the shared executor (job 327).
Authenticated Overview and access settings remained available. The live empty
Countries panel exposed obsolete pre-geolocation copy; 0.11.1 explains that new
visits gain location once a current dataset is active. The operator upload now
batches up to 16,384 ranges per ingress call while retaining 1,024-range lookup
chunks. Entire batches are validated before mutation. State and Candid schemas
are unchanged; the new uploader requires backend 0.11.1.

The new regression rejects an oversized batch and an invalid final range,
then proves no prefix was committed, checks chunk boundaries and address gaps,
and resumes a pending dataset across upgrade. Both this test and the existing
active-dataset/identity/retry test passed from the actual published 0.11.0
executable to the candidate. Packaged full-dataset, full-suite and final live
results are recorded in the private patch-0.11.1 release receipts. This section
does not imply those pending checks have passed.

The 0.11.1 acceptance completed successfully: full-suite backend 244 passed,
zero failed, 42 optional historical/load fixtures skipped. Other local release
gates also passed. Actual packaged Crumbs: 25 passed, zero failed, three skipped;
two of those upgrade/load cases were separately executed and passed against the
published 0.10.0 baseline with 100,000 events. Only the ancient 0.1 baseline
remains unavailable in the combined Crumbs coverage. The complete 8,269,786-range
fixture passed with 1,477,680,859 local memory bytes and a 989 ms 50-event batch
under concurrent test load (not a production SLA). The real CLI uploader passed
with 5,559 ranges and removed its disposable identity.

Published/deployed artifact source: `0a78a00`; release ID
`baec225977ec511436cc16b57f24f50be11fe9ad00443eab6d88b1dcc589c49c`.
The shared executor verified both components and restored upload permissions;
a separate verify job confirmed the installation. Authenticated live Overview,
corrected location help, company sign-in, timezone/retention and Artem's existing
Manage grant were checked. Actual Geo/ASN/hosting activation and final runtime
measurements are retained in the private release receipt. No private Matomo
export was imported, no user keys were created, and unrelated apps were not
deployed. Full workflow/accessibility recertification remains partial.
