# Assets 0.31.0 — Iru inventory number writeback review

Review of Assets 0.31.0 against product standard 1.2.0. The populated upgrade uses the 0.30.0 artifact as its baseline.

## Behavior and decision

IT enables the option per Iru connection after granting Update Device permission,
then runs Sync now and reviews confirmed/pending counts. Existing connections remain
off through upgrade. Assets supplies its automatically allocated immutable inventory
number; only `asset_tag` is sent to Iru. Every six-hour sync also applies the option.
The executive benefit is fewer duplicate edits, with no measured time/cost savings
claim. Correct device identities, token rights and unresolved failures remain IT work.

Each sync attempts at most 25 differing records. Unique normalized local and remote
serials plus a unique external ID are required; a detail GET checks identity again.
A failed or uncertain write stops later writes in that run. A subsequent read avoids
repeating an already-applied value. A 2xx without matching identity/value is unconfirmed.
Disabling cannot recall an in-flight request. The service does not change assignments,
blueprints, device names, device tags, secrets or erase controls.

## Integrity map

| Surface | Scope / evidence |
|---|---|
| Assets backend | Connection option in a separate stable map; existing connection/asset records and immutable tag allocator retained. Guard manual writes with Admin before/after awaits. Timer uses the saved option. |
| Iru | Documented GET and PATCH device endpoint; only `asset_tag` body. Non-replicated HTTPS dependency; mocked provider locally, no live Iru write yet. |
| Candid/browser | Generated from compiled source. `setMdmTagWriteback` and additive `MdmView.tagWriteback`; existing signatures preserved. |
| Frontend | Settings → Connections option, explicit overwrite confirmation, partial/error status and retry guidance. Admin scope retained. |
| REST, OpenAPI, SDK, MCP | No new route/tool: deliberately administrator-only Candid configuration like existing MDM settings. Canonical SDK/runtime/logo bytes unchanged. |
| Hub, Desk, Trust, Forms, Contracts | No producer/consumer contract change; central permission, workboard, finance, custody and notifications retain their versions. Suite regressions cover shared integrations. |
| Knowledge, Watch, Crumbs, Bug | No product changes. Crumbs test expectation follows PocketIC 16 gateway-injected client address; direct invalid-address tests remain. |
| Kitchen, Vault, SDK example | No product changes. Format-2 recipe reads Assets version from mops.toml; packaged executable upgrade checks required. |
| Website, optional collector, kebab-mcp | Independent version lines retained; no new marketing claim, service or route. |
| Documentation/version | Assets source/served changelog, README, INSTALL and contextual help updated to 0.31.0; root test tooling 0.3.1. Deployment receipt remains separate. |
| Local tooling | PocketIC 16.1.0 for actual PATCH support; pinned JS client retained with a test-only raw HTTP/ingress adapter. No production dependency added. |

## Scoped design acceptance

| Gate | Result / limitation |
|---|---|
| Primary task and consequences | Explicit per-connection state, confirmation, Update Device requirement, 25-device continuation. |
| Role boundaries | Admin success; unauthenticated and Employee denial; Jamf option rejected. Backend regression, frontend Admin smoke. |
| Failure/retry/concurrency | Permission denial, malformed response, timeout reconciliation, duplicate/wrong identity, changed serial, disabled/removed connection and preserved upgrade option covered by targeted regression. |
| Lists/load | 1,000-device/11-page fixture, 30 outdated numbers in 25/5/0 runs; not a maximum-capacity certification. A full 100-page list fails closed. |
| Canonical styling | Shared components/tokens/logos; runtime, brand and design gates. No local palette or logo variant. |
| Browser | Chrome light/dark at 1280×800, 800×800, 320×740 and 1280×400; keyboard Enter activation and disabling verified. Real wheel scrolling retained global topbar at y=0 (scroll 789/887/1297/1189 px). Narrow table remains a labelled horizontal scroll region. |
| Accessibility limits | Native screen reader, touch/keyboard scrolling, 200% text zoom and full application accessibility certification not performed. No claim of full certification. |
| Privacy | API secret stays in existing protected connection storage; sanitized failure guidance; history records only inventory changes. Engine/Iru infrastructure remains within confidentiality boundary. |
| Navigation/login | Existing shared host owns sticky navigation. Full authenticated production handoff not verified for this candidate. |
| Measurements | No baseline task-time measurement. Visual checks cover this settings workflow only. |

## Release acceptance

Run suite integrity gates and targeted regressions, then build the clean committed
format-2 package. Verify the exact packaged executable with a populated upgrade from
the published 0.30.0 baseline and the central-permission/Lunch-preservation fixtures.
Record failures/skips in the external receipt; source build success alone is insufficient.
Production publication/deployment requires explicit authorization; no live change is
made by these local checks. After permission and deployment, enable writeback only
once the operator has supplied Iru rights, then verify actual Iru values.
