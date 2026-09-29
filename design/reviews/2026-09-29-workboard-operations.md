# Workboard in Operations

- Standard 1.2.0; Hub 0.37.0 and Desk 0.26.0; reviewed 2026-09-29.
- Audience: currently authorized Hub console / Desk administrators; separately
  approved TV screens. No new employee access or app-local role system.
- Decision: separate shared-project work from internal support; reuse the Desk
  identity and existing card runtime. No new product mark or colour palette.
- Rules: NAVIGATION-06, shared components, honest data states, privacy, source
  authority, automation and explicit capability scope.

## Acceptance

| Check | Evidence |
|---|---|
| Current totals | Real local backend fixtures include waiting, overdue, due-today, undated, unassigned and unavailable-owner cases. Calendar cutoff is UTC. No invented productivity total. |
| Scope | Shared, unarchived projects and open own tasks only. Personal tasks/projects, archived tasks, completed tasks, linked tickets and sales excluded. Project count may include projects without open tasks. |
| Progress | Subtask counts cover open tasks only. Completed subtasks are not separate tasks. Counts and follow-up flags can overlap. |
| Work view | Separate card and next action open the existing Workboard project list. Source access, failures, stale data and late response guards remain authoritative. |
| TV | Explicit unchecked Workboard inclusion requires Desk. Old approval method and previously paired screens keep three Desk metrics. New scope sends ten fixed numeric metrics; no titles, people or project names. New approvals and subtasks survive upgrade. |
| Access | Staff cannot approve screens; employees cannot read Operations; forged inter-app callers rejected. Removal of project members updates unavailable-owner counts. TV revocation rejects subsequent reads. |
| Upgrade | Populated Hub 0.36 / Desk 0.25 upgrade plus second candidate upgrade passed. Existing assignments, tickets, sales, Finance, central scopes and Lunch directory preserved. Stable signatures checked against committed baselines before promotion. |
| UI | Hub frontend smoke and Operations/display regressions pass. Actual desktop, 320px dark/mobile scroll, short-screen manager, Full HD TV; header remains visible. Six TV cards and focus area fit 1920×1080. Sample content explicitly labelled. |
| Limits | No historical trends, per-person productivity scoring or blanket accessibility certification. Existing display expiry/revocation intervals remain. No production business records changed for testing. |

Release requires the identical tested format-2 artifact through the Kitchen
executor. Private acceptance and deployment receipts stay outside public source.
