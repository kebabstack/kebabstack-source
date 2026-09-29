# Desk Workboard review

- Standard: 1.2.0; Desk 0.25.0, Hub 0.36.0, Assets 0.17.0, SDK 0.14.0.
- Surface: IT project tasks with live internal Desk and optional Assets sale cards.
- Roles: Desk administrator, group member/outsider, requester, Assets Finance; inactive/stale and revoked access.
- Date / reviewer: 2026-09-29 / Codex.
- Status: Verified for the scoped local checks below; production rollout not performed.
- Rules: NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07; shared role, privacy and state rules.
- Prior task-time/savings measurements: unavailable; no saving claimed.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task, next actor, blocker, completion | Pass | Four states; Waiting reason; sale paid remains active until physical hand-over. Source transition stays in its original app. |
| Role and group boundaries | Pass | Local real Hub/Desk/Assets test: requester/forged session rejected, outsider denied, group membership and Finance removed, Hub-only source caller, stale lease fails closed. |
| Direct entry and session | Scoped pass | Full Desk router and module smokes, late-response/sign-out test. Real company IdP reauthentication not repeated; shared SSO code unchanged. |
| Loading, empty, partial, stale, errors | Pass | Progressive load, source-unavailable/restricted message, old data cleared, page bounds. Live unavailable service UI exercised in jsdom. |
| Retry and concurrent writes | Pass | Exact create retry and payload mismatch, revisions on task/project/link/archive; double submit blocked. |
| Validation/draft/save | Pass | Waiting/date/owner validation and failed-save draft test. Browser created a waiting task with a reason. |
| Lists, counts, pagination | Scoped pass | Pages limited to 100, explicit load-more counts, archive list has pagination; column counts describe loaded cards. No export promised. |
| Canonical brand/runtime | Pass | Existing Desk logo, shared tokens/components; brand/design/runtime checks. No product logo introduced. |
| Initial composition | Pass | Desktop project selector 240 px, scope selector 160 px, controls 44 px, one Add task primary. First board at about 445 px in 1280 px desktop view. |
| Responsive/themes | Scoped pass | Browser at 1280×800, 1280×600, 800×600 and 320×640; both themes; 320 px document width remained 320 px, one card column. |
| Sticky global navigation | Pass | Real wheel scroll at desktop and narrow widths; topbar top remained 0 with a 61 px bar. |
| Keyboard/assistive tech | Scoped | Native labelled controls and semantic headings, visible shared focus, state selector alternative to dragging. Full VoiceOver and 200% text enlargement certification not completed. No animation added. |
| Privacy/retention | Pass with explicit boundary | Buyer contacts, amounts, technical notes and private links excluded from source cards. Personal work is admin-readable and labelled. Archiving is not deletion; no automated project retention claimed. |
| Dates and freshness | Pass | Calendar-date strings, no guessed UTC midnight. Visible-board refresh every 30 seconds, existing 60-second Hub directory lease. |
| Notifications/automation | N/A | No new project notifications or auto-created projects. Source status projection is automatic; source mutations remain authoritative. |
| Context/help/changelog | Pass | Inline guide, Desk help, full WORKBOARD guide, module and SDK version/changelog updates. |
| Representative repeat | Pass | Browser created a task, confirmed its waiting card, archived it, found it under Projects, and restored it to the board. |
| Backend/upgrade | Pass | Fresh install and populated upgrade from committed pre-change Wasm; second upgrade preserves new tasks. Existing sale, ticket, Finance configuration, central policies and Lunch roster preserved. Original committed stable signatures checked before updating baselines. |
| Release artifact | Pass | Format-2 bundle built from 876d50f. Its exact stamped Hub/Desk/Assets executables passed fresh and populated-baseline Workboard upgrades plus four Finance regressions (6 passed); a separate older Finance fixture was not supplied and skipped. No publish/deploy performed. |

## Findings resolved

- Do not map payment to completed work: use Assets' true sale phase and next-action evidence.
- Avoid implying project membership opens source data: links store references and recheck source access.
- Keep cancelled-sale wording visible, even in Done.
- Show archived tasks and provide restore, including paging; archive is reversible.
- Keep selector sizes bounded and remove the repeated project label from cards in an already selected project.
- Disable filters during a refresh so an old response cannot be mistaken for a newly selected filter.
- Preserve the originating Workboard/project when returning from a ticket; the ticket loader must not replace it with the support queue.

## Deliberate scope

External customer tickets remain in Customer projects. Project audience and task
project are fixed after creation to avoid silently broadening access. Workboard
uses explicit state selection, not source-card drag transitions. Caps and retention
limits are documented. Full suite accessibility certification remains separate.
Screenshots and private test logs use synthetic fixtures only; no live records
were loaded or changed for this review.
