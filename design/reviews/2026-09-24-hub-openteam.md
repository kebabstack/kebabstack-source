# Hub OpenTeam source review

- Standard: 1.2.0.
- Module: Hub 0.35.0; optional directory source, first import and ongoing status.
- Review: 2026-09-24, Codex.
- Status: source workflow verified within the scope below; not full app/accessibility certification.
- Roles: owner configures/reviews; admin reads and may use existing manual sync API; employee is denied administration. Upstream protected/kind flags grant no Hub role.
- Rules: LAYOUTS-04/05/07/08, COMPONENTS-01/02, NAVIGATION-06, GOVERNANCE-07; permission, source freshness and automation requirements.
- Previous workflow: no OpenTeam input connector. No measured time-saving claim.
- Intended result: an owner can inspect a complete roster and explicitly enable a safe read-only import without configuring Kebabstack app roles in OpenTeam.

| Gate | Result / evidence |
|---|---|
| Primary task and blockers | Pass: source → Preview changes → Apply & enable sync. Identity conflicts explain the required source-ownership decision. Draft setup is not shown as a live connection. |
| Positive and negative authorization | Pass: PocketIC owner/admin/employee cases, no role import, existing identity conflict and central-role preservation through rename. |
| Entry and SSO | Local `#/sources/openteam` entry verified. Existing Hub auth-flow regressions pass. Real OpenSaaS SSO is explicitly outside this connector. |
| Loading / error / stale / empty | Inline progress and retryable errors; atomic complete snapshots. Paused, awaiting review, last-success and overdue/error states are distinct. |
| Concurrent edit / retry | Backend preview expiry, source changes, Hub identity changes, duplicate apply and queued apply vs pause regressions pass. Revision checks cover in-flight configuration changes. |
| Input / draft | Invalid principal shows a helpful error and retains entries. Native principal parser accepts a valid ID and rejects an invalid checksum. Server failures retain form contents. A used source cannot be discarded as an unused draft. |
| Lists and counts | 207-record paginated fixture, 205 default employee imports, bounded 50-row preview; exclusions are counted. Stable IDs remain stable through rename/upgrade. |
| Shared presentation | Canonical product marks, existing controls, tokens and both themes; no new palette or external product-logo variant. Brand/design/runtime guards pass. |
| Initial viewport | At 1280×800 the first source begins at y=308.57 CSS px. Removed the redundant introductory card. |
| Responsive / long input | 1280×800, 800×480 and 320×740 inspected in browser. Source inputs stack at 320 and use 242px available width. Long typed source names remain within the field. No page-level horizontal overflow; wide preview table has a labelled local scroll region. |
| Persistent navigation | Actual scrolling verified: desktop scroll=702, brand top=12.5px; short 800px viewport scroll=480, top=12.5px; 320px viewport scroll=399, top=8px. At 320, hid the redundant Console caption to prevent overlap with the navigation button. |
| Keyboard / assistive tech | Native labels, buttons, disclosures, aria-live feedback and labelled keyboard-focusable table region. Screen-reader, 200% text enlargement and full contrast certification not performed in this scoped review. |
| Privacy and boundaries | Synthetic fixtures only. No production OpenTeam connection. Source profile erasure is separate from Hub history and downstream retention; no full erasure or GDPR certification claim. |
| Automation and recovery | Five-minute polling independent of Okta interval; complete-response and sequence checks; large departure review. Last good directory survives provider errors. The actual Hub lifecycle feed records one departure, not one per poll. |
| Operator help | Contextual guide in Directory sync and How this Hub works; docs/OPENTEAM.md is synchronized to the served compatibility contract. |
| Verification | Nine OpenTeam backend scenarios pass, including a populated 0.34.0 upgrade preserving Lunch/Finance/owner settings. Tested Mops and actual ICP-recipe Wasm; committed stable baseline passes compatibility and is unchanged. Existing 13 selected Hub security regressions, seven auth-flow tests, 50 Hub/SDK UI tests, RSA and assembled Hub smoke pass. |

## Findings resolved

- Introductory card displaced the task: replaced with a single compact explanatory line.
- Narrow source inputs stayed beside each other: stack below available width, fill their row.
- Existing Console caption overlapped the mobile navigation button at 320px: hide that redundant caption below 380px, retaining the canonical mark and accessible controls.
- Pausing an already-paused draft needed to cancel an in-flight apply: explicit source revisions and queued-apply regression.
- Removing an unused draft needed an atomic backend check: dedicated owner-only discard refuses enabled sources or sources with imported records.

## Release boundary

Local candidate only. No tenant connected, no production deployment and no public
repository publication in this change. Reference interface review and independent
synthetic contract testing are not a live OpenTeam pilot or OpenSaaS-wide certification.
No claims about shared sign-in, OpenSaaS AI gateways or upstream role import.
