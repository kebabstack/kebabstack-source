# Crumbs 0.4.1 UX verification — 2026-09-19

The UX release keeps the existing backend state and API contract. The only Motoko change is the version constant.

- All 29 local collector, tracker, importer and canister/HTTP tests pass. No historical tests were skipped: the populated native upgrade uses the published 0.3.0 executable; the legacy website-access upgrade uses 0.1.0.
- Five UI modes pass: Admin, Reader, Website Manager, empty Admin and empty Reader. Checks include permissions, delayed responses after revocation, automatic website IDs including distinct domains with colliding slugs, pending form locks and duplicate-submit prevention, and the correct new-site snippet, date validation, cleared stale funnel results, explicit goals, deduplicated user search, unsaved-input preservation and cancellation of browser navigation.
- Mobile 390 px and desktop layouts were reviewed in the browser, including light/dark themes, settings, goals/funnels and empty accounts. Preview data is synthetic.
- Pinned Mops build and stable compatibility against the committed baseline pass. Generated bindings and canonical SDK copies are unchanged and verified. Native HMAC/JSON/path checks pass.

Reproduce the release upgrade with `CRUMBS_NATIVE_BASELINE` pointing to a directory containing the published 0.3.0 `backend.wasm` and matching `backend.did`; retain `CRUMBS_ACCESS_BASELINE` for the 0.1.0 fixture. Use the test commands below. Deployment receipts and packaged-test results belong beside the immutable bundle in the sibling `kebabstack-crumbs-artifacts` directory.

The existing workload/capacity, privacy and Plausible cutover gates remain unchanged. This is a UX release, not a new parity or throughput claim.

---

# Crumbs 0.3.0 validation

Local validation on 2026-09-19 with pinned Motoko 1.12.0/core 2.6.1, Mops 3.2.0, Node 26.5.0 and PocketIC 14.0.0. This increment moves default event collection and REST v1 into the backend canister. The previous [0.2.0 validation](TESTING-0.2.0.md) and [suite checks](TESTING-0.1.0.md) remain recorded separately.

## Local checks

- Pinned root/collector npm dependencies and Mops dependencies installed. `mops check --fix` and build pass. JSON 1.4.0 matches the suite's pinned parser. The candidate stable signature is compatible with the committed 0.2.0 contract, checked before replacing the baseline. The new migration adds native collector state without changing previous migrations.
- **29 tests passed, no skips**: 11 collector/tracker/import/client tests and 18 canister/HTTP tests. Both actual packaged 0.1.0 and 0.2.0 baselines were supplied. Metrics, access, keys and legacy grants survive populated upgrades. Collection is independent of Hub availability; protected reads and keys retain their existing scope and revocation behavior.
- Native regressions cover durable acknowledgment, raw-IP/UA exclusion from stored events, redacted paths/properties, campaign attribution, ignored browser time/visitor fields, duplicates across retries/midnight/upgrades, daily/site pseudonyms, invalid-batch atomicity, privacy signals, malformed/bounded input, rate limiting and recovery. Native REST exercises every documented resource with allowed and denied operations, stale revisions and manager-key revocation.
- A real PocketIC HTTP gateway resolves the canister subdomain, upgrades the query to an update and returns native event acceptance and authenticated reports. PocketIC does not inject address metadata: the test first checks that missing X-Real-IP fails closed, then supplies deterministic fixture metadata. A separate public ICP echo probe and review of ic-gateway/request_meta source confirmed connection-derived X-Real-IP replacement; that is distinct from the local transport test. Direct Candid calls can forge headers; this remains explicitly outside the anti-fraud guarantees. No report permission derives from an IP/header.
- Three RFC 4231 HMAC-SHA-256 known vectors, malformed-surrogate/depth handling and path decoding pass using the pinned Motoko interpreter. Run `node crumbs/test/native-unit.mjs` after Mops install.
- **Five UI modes pass**: Admin, Reader, Manager and both empty states. The native API URL and frontend-hosted tracker snippet are checked. Deferred protected responses still cannot repaint/export after website access disappears.
- OpenAPI, generated Candid/browser IDL, canonical SDK copies and release placeholders are checked. The tested 5,000-event local fixture remains exact; this is not a production throughput benchmark.

Reproduce from the repository root:

```sh
CRUMBS_ACCESS_BASELINE=/absolute/0.1-fixture CRUMBS_NATIVE_BASELINE=/absolute/0.2-fixture node --test crumbs/test/*.test.mjs tests/crumbs.test.mjs
node crumbs/test/native-unit.mjs
bash crumbs/test/run-smoke.sh
```

Each fixture contains its matching backend.wasm and backend.did. Missing historical fixtures explicitly skip the associated test. `CRUMBS_PACKAGED_CRUMBS_WASM` and `CRUMBS_PACKAGED_HUB_WASM` select immutable executables for the same tests. Do not compile while tests read Wasm outputs.

## Scope

Native 202 means committed canister events; optional Node 202 means a durable local queue. Native requests contain raw IP/UA during replicated processing, although stored analytics events do not. Native geography is absent. Snapshot/ingress retention, event schemas and hosting arrangements still require operator review. See PRIVACY.md and INSTALL.md.

Plausible cutover still requires the workload/capacity and parallel-measurement gates in PARITY.md. The report/storage bounds, UTC-only dates, separate imports, coarse classification and missing Search Console/scheduled reports remain material. The pre-existing Bug version assertion prevents claiming an entirely green monorepo check; this increment does not change Bug. Packaging and deployment evidence will be recorded with the actual immutable release hashes.

## Published package verification

The frozen source commit `b7bbf97` produced the 0.3.0 release. The composed production catalogue preserves every previously published descriptor except Hub and Kitchen, and adds Crumbs. `bundleFiles()` verifies 11 recipes and 444 referenced files including gzip, placeholders and hashes. The identical stamped executables were published and installed through Kitchen; no deployment restamping was performed.

- **18 Crumbs canister/HTTP cases passed with packaged executables**, including populated upgrades from 0.1.0 and 0.2.0.
- **Two populated upgrades passed from the actual previously published Hub/Kitchen Wasms**, whose hashes matched the live baseline.
- **Seven packaged Lunch/central-role checks passed**, covering Lunch directory preservation and every existing central application.
- The optional collector archive has 18 verified payloads; a clean production dependency installation and isolated identity initialization pass. SHA-256: `8d92bceb3f4bad9c4a6580e7f15aa8e77738c1bffd8da72462e43fb59dabfb7a`.

| Component | Version | Release ID |
|---|---|---|
| kitchen | 0.8.0 | `704b351d9988ca91b1fb892221fc944240274ed85045e72041e7c393b8340c7c` |
| hub | 0.30.0 | `84f203ed131b90c1c51fc58fc789d1a60366796969f63ac2c5a5b2c38f1db10d` |
| crumbs | 0.3.0 | `4dcdb19b2a69f91e205df0e8071ca3b11ac1a75363f494456fd8384c95b3d200` |

Production verification confirms current matching Hub, Kitchen and Crumbs releases; actual HTTPS native health and REST authorization; fresh Hub policy confirmation with inherited owner/admin rights; and no tracking response cookies. A rejected request for an unregistered synthetic site exercises the production gateway address path without storing analytics. No website or real analytics traffic was added by this rollout. The deployment identity is not a linked Hub person, so the final personal browser login requires the user's company SSO/passkey; positive login and authenticated REST flows passed against the exact packaged canisters locally. Existing six central policies/effective grants, Lunch roster, all previous connector contracts, canister settings and unrelated applications are preserved. A successful Lunch directory pull is checked after the Hub upgrade. Existing release-store assets except the intentionally updated catalogue remain unchanged.

The persistent sibling `kebabstack-crumbs-artifacts/0.3.0-b7bbf97/` directory holds the release bundle, baseline fixtures, logs and deployment/hash receipts. Private temporary roster/policy captures and temporary test signing identities are removed after verification. Production checks do not replace the real-workload and 14-day comparison gates in PARITY.md.

## 0.12.0 full-report regression (2026-10-28)

`tests/crumbs.test.mjs` now includes a 100,000-event dataset with 50,000 consented
browser IDs returning on two UTC days, queried over 30 days. The old fast query
returns its 50,000-event capacity error; full update reporting must return exactly
50,000 range visitors and 100,000 visits/pageviews/bounces. Daily visitors sum to
100,000 and are deliberately **not** used as range visitors. Checks include path
filtering, day buckets, goals, goal rows, funnels, journeys, native HTTP and denied
credentials/revoked sharing. Set `CRUMBS_FULL_BASELINE` to a directory containing
the published 0.11.2 backend.wasm/backend.did to run the same fixture through a
populated upgrade before exercising the new methods. Set
`CRUMBS_PACKAGED_CRUMBS_WASM` to verify the stamped release executable.

This is a local PocketIC correctness/execution-limit test, not a production SLA
or coverage of every worst-case string/filter/cardinality combination. Existing
storage, response-size and platform execution limits still apply. Browser preview
`?large&many` simulates the capacity response before returning synthetic full
reports, exercising the actual frontend fallback; it does not benchmark a canister.

`test/report-client.test.mjs` covers query success, precise fallback selection,
serialized expensive calls and non-replayed errors. The optional collector package
must contain `dist/report-client.js`; MCP 0.4.1 has a version-gated curated fallback
without changing generic query-only enforcement.

## 0.13.0 overview performance

The 100,000-event fixture uses 50,000 consented browser IDs recurring on two days inside a 30-day interval. It compares every field of seven individual reports against the bounded bundle client, including rows, ordering, truncation, revenue and scan counts. With `CRUMBS_FULL_BASELINE` pointing to a directory containing the published 0.12.0 `backend.wasm` and generated `backend.did`, it also compares the old results before a populated upgrade against the candidate after upgrade. Baseline data and viewer authorization must survive.

A local PocketIC source-candidate run on 29 October measured 33.72 s for seven published 0.12.0 reports versus 17.73 s through the new bounded bundle path (1.90×; 47% less elapsed time). This is synthetic local execution, not a production/browser latency promise. Single-report candidate execution was 27.09 s. Measurements vary with host load. Bundle requests over 200,000 event × dimension units split dimensions; they never sum daily unique counts. Initial unbounded seven-dimension prototypes exceeded the update instruction limit and were rejected before release.

Additional regressions cover mid-session filters, explicit local-day boundaries, top-row limits, exact visitor bitmap word boundaries via high cardinality, newly ingested data, revoked shared keys, malformed bundles, budget fallback, network failures and late UI responses after permission revocation. Shared reports prevent overlapping refreshes. Existing finite storage and execution limits remain; arbitrary filter/cardinality combinations are not certified as unbounded.
