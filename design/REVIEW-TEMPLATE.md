# Product design review

Copy this template for each meaningful workflow/surface. Use fictitious data in
public evidence. Do not mark an app verified because one page passed.

- Standard version:
- App / module version / commit:
- Surface and primary task:
- Roles and data scopes tested:
- Review date / reviewer:
- Status: Not reviewed / Gap found / In progress / Verified
- Relevant rule IDs:
- Previous manual steps / errors / task time (measured, with sample):
- Intended outcome and completion evidence:

## Acceptance evidence

For each item record Pass / Fail / Not applicable, a reason and evidence.
Not applicable is a scoped decision; an untested item is not a pass.

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task, next actor, blockers and completion | | |
| Positive and negative role / guest / project permissions | | |
| Direct entry, Hub launch, deep link and session expiry | | |
| Loading, empty, partial, stale, error and forbidden states | | |
| Retry, duplicate action, interruption and concurrent edit | | |
| Input validation, draft preservation, save and review | | |
| Lists, filters, counts, exports and pagination scope | | |
| Canonical logos, tokens, type, spacing and components | | |
| Assembled initial viewport: context hierarchy, secondary actions, selector bounds and first useful content position (LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07) | | |
| Light/dark, 320 px reflow, desktop, text zoom and long labels | | |
| Global bar remains visible during wheel/touch/keyboard scrolling; long sidebar and focused targets stay reachable (NAVIGATION-06) | | |
| Keyboard, focus, screen reader, contrast and reduced motion | | |
| Privacy, secrets, retention and audience boundaries | | |
| Timezones, currency, source evidence and freshness | | |
| Notifications, automation history and recovery | | |
| Contextual guide, help, changed behavior and changelog | | |
| Representative task repeated after change | | |
| Module tests and release checks | | |

Record before/after rendered evidence at 1280 × 800 and 800 px width, 320 px reflow, both themes, long labels and 200% text enlargement. State actual measured sizes and any missing checks. Correcting tokens alone is not a visual pass.

## Findings

| Priority | Rule ID | Observation / reproduction | User impact | Fix / owner | Status |
|---|---|---|---|---|---|

P0: access/data/destructive-integrity defect. P1: core task or accessible use
blocked. P2: avoidable friction or misleading secondary state. P3: polish.
P0 and P1 block the affected release; do not average them away with a score.

## Deliberate exception, if any

- Rule / exact scope:
- Reason and alternative considered:
- Owner / decision date:
- Compensating measure:
- Review or expiry date:
- Linked issue:

## Delivery

- What was actually verified, and what remains untested:
- Before/after task outcome, with measurement limitations:
- Known gaps and next action:
- Local preview / release candidate / deployed (with verification evidence):
- Production authorization and release artifact reference, if deployed:
