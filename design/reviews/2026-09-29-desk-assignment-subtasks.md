# Desk automatic assignment and Workboard subtasks

- Standard 1.2.0; Desk 0.26.0; review date 2026-09-29, Codex.
- Status: verified for the local scope below; not deployed.
- Users: Desk administrator configures intake ownership; Desk staff manage project
  steps. Employees have neither configuration nor Workboard access.
- Rules: GOVERNANCE-07, NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07,
  workflow integrity, permission, automation and notification rules.
- Outcome: choose a default once, vary only exceptional request types; record small
  project steps inside their existing task without a second ticket workflow.
- No task-time or savings measurements; no blanket accessibility certification.

## Acceptance evidence

| Gate | Result | Evidence / limit |
|---|---|---|
| Scope and completion | Pass | New internal tickets only; manual/existing assignments and customer intake preserved. Task Done requires all subtasks complete; legacy API cannot bypass the check. |
| Access | Pass | Real local Hub roles: admin-only configuration; staff-only Workboard; project outsiders, employees, forged sessions, deactivated users and stale directory rejected. Subtasks inherit parent audience. |
| Defaults and fallback | Pass | No default on upgrade; per-type person or explicit unassigned exception; revoked override → active default → unassigned. Queue/settings warnings and ticket activity explain failures. |
| Notifications | Scoped | Existing Hub notification transport reused, targeting assigned owner. Pending approvals keep their approval gate. No real Slack delivery or live notification test performed; no phone-delivery claim. |
| Retry/concurrency | Pass | Configuration revisions; task+subtasks saved atomically; create payload retry idempotent; stale task/subtask updates rejected; duplicate/foreign subtask IDs and limits checked. Pending forms prevent a second save and edits to the submitted payload. |
| Error and draft | Pass | Failed/stale save retains current controls and choices; explicit reread guidance after uncertain settings save. Drafts do not survive reload or navigation, as documented. |
| Source data | Pass | Existing ticket checklist and Assets hand-over workflow remain authoritative. No extra source-card checklist. Customer intake cannot inherit internal assignment. |
| Composition | Pass after correction | Existing task context is a short line; owner/state and subtasks come before optional notes/date disclosure. Subtask section starts around 413 CSS px at 1280×800. Settings default selector is 360 px maximum; exceptions are collapsed until relevant. |
| Responsive and themes | Scoped pass | Actual browser 1280×800, 800×800, 320×640 and short 1280×600; both themes. Initial mobile subtask input was too narrow and corrected to a two-row grid. Document width stays 320 CSS px. |
| Navigation | Pass | Wheel-scroll long assignment list and task page in desktop/narrow/short views; global header top remains 0. No local sticky container introduced. |
| Keyboard / assistive tech | Scoped | Native labelled form controls, visible shared focus, keyboard Enter saving and validation. Full VoiceOver, text-spacing and 200% text-only zoom certification not performed. No animation added. |
| Live browser workflow | Pass locally | Saved default with an Offboarding exception, reloaded and observed it persisted. Changed one checkbox, saved, observed 2/3 on board, reopened; Done was blocked with one unfinished step. |
| Backend and upgrade | Pass | New fresh-install and populated 0.25→0.26 regression; second upgrade preserves rules/subtasks; old tickets/tasks preserved. Candidate stable signature compatible with committed 0.25 signature before promotion. |
| Regression suites | Pass | Desk role/router smoke + 91 UI tests; 111 backend regressions passed, 15 older optional fixture checks skipped. Dedicated new populated upgrade ran and passed separately. Existing Workboard test verifies central Finance/source scope and Lunch preservation. |
| Shared foundations | Pass | Brand/design/runtime/SDK checks and release metadata/placeholders check. Hub, Assets, shared client and palette are unchanged. |
| Help, limits, versions | Pass | README, INSTALL, WORKBOARD guide and served guide/changelog updated. 50 steps per task, no nesting/separate owners/notifications. Kitchen derives the Desk recipe version from mops.toml. |

## Remaining release work

Production rollout was authorized on 2026-09-29 together with Workboard Operations. Build/publish the
format-2 bundle from the committed candidate, exercise its packaged executable,
and deploy it through the release executor.
No live records or external messages were changed. The local preview uses
synthetic records. Private browser evidence is retained outside the repository.
