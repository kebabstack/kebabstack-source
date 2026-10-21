# Hub 0.43 — actionable TV totals

- Standard: 1.2.0. Branch: `codex/operations-actionable`.
- Surface: Operations → Screens and anonymous TV display.
- Review: 19 October 2026. Status: scoped verification; full accessibility certification remains partial.
- Task: see paid asset sales awaiting IT, open onboarding/offboarding and shared plus explicitly selected personal Workboard counts in a team room.
- Rules: REPORTING-01/03/04/05/06, NAVIGATION-06, privacy and role boundaries.
- Previous failure: normal Operations showed these totals; an older TV approval intentionally omitted them. A second-account setup also counted the approving technical account instead of the operator's tasks.

## Acceptance evidence

| Gate | Evidence / limitation |
|---|---|
| Primary task | Seven metric cards plus focus summary, separate paid sales; personal/shared subtotals labelled. No record links on TV. |
| Permissions | Only original approving Owner changes scope. Target personal account must currently be active and Desk admin. Other Owners can revoke, not alter a grant. Anonymous TV gets fixed numeric fields only. |
| Account selection | Explicit email in authenticated management, pinned by stable person ID. Default is approving account; select another only when its totals may be shared. No account name/email/ID enters public state or snapshots. Existing Desk admins can already inspect personal work in the source app. |
| Stale/partial | Existing freshness/expiry checks retained; missing new fields shown unavailable, not healthy zero. Revocation and permission checks repeat after source await. |
| Save/retry | Existing credentials, expiry and connector identities retained; rejected options do not mutate grants. Selection checked before mutation. Source replies are discarded when selection changes during await. |
| Counts | Local fixtures distinguish approving Owner's one personal task from another administrator's two; 1,000-task regression crosses source pagination. Lifecycle counts remain subsets, sales follow-ups retain exclusive next-step meanings. |
| Shared runtime | Canonical tokens/logos/components unchanged. Runtime, design, brand and SDK gates required for release. |
| Layout | Local sample preview at 1920×1080; seven cards plus focus fit without overlap. Short 1600×800 uses vertical scrolling; 800×560 and 320×560 have no horizontal/card clipping. Original 8-card overflow reproduced and fixed. Management reviewed in dark mode, explicit selected-account save tested. |
| Navigation | TV intentionally has no authenticated global navigation. Screens management uses canonical sticky SDK host; prior real scroll checks retained. |
| Accessibility | Native form controls, semantic labels/status messages. Full screen-reader task completion, 200% text enlargement and real-room viewing distance are not certified. 3840×2160 remains a separate physical-device check. |
| Privacy/retention | No task titles, personal names, buyers or amounts. Small totals can still be sensitive; approval text states this. Selection map is removed with grant removal; expired-grant pruning applies. |
| Time/currency | Task due dates use UTC; no monetary totals; Finance-confirmed payment is recorded source state, not bank access. |
| Help | Source/served changelog, installation help, Operations metric guide and generated bindings synchronized. |
| Upgrade | Additive stable map, unchanged grant record. Committed stable baseline retained. Populated previous-release and packaged-executable checks required before rollout. |

## Integrity map

Desk 0.35 and Assets 0.30 already produce the additive metric fields. Hub 0.43
filters and renders them only under explicitly extended display scopes. Candid,
browser IDL and served SDK interface are generated from compiled Hub source.
No REST/MCP display-management API is introduced. Other apps, Kitchen/Vault,
website and optional services keep their independent versions. Existing public
website sample data and claims are unchanged. Full suite tests assess integration;
they do not certify every unrelated interactive workflow.

## Delivery

Local preview evidence and release receipts live in the operator's private
`operations-tv-2026-10-19` release directory. The user authorized live correction
and specifically approved anonymous totals including their personal tasks.
Record package, full-suite and live results there; this design review alone is
not proof of deployment or physical-TV verification.
