# IT Workboard in Desk

Workboard brings project tasks, internal Desk requests and optional hardware sales
into one operational view. It is an alpha feature in Desk 0.25.0, Hub 0.36.0 and
Assets 0.17.0. It reduces the need to copy a source record's status into a separate
project tracker. It does not decide when a payment, hand-over or request is complete.
No time or cost saving has been measured yet.

## For the IT operator

Open **Desk → Workboard**. Start with **My work**, or switch to **Team work** to
see the work your current permissions allow. The project selector narrows all
three sources together. **Desk tickets**, **Hardware sales** and **Completed**
can be toggled independently; the view is saved to your Desk account.

- **Projects → New project:** name the outcome, choose Personal or an existing
  Hub group, and optionally set a target date. A group member also needs a Desk
  agent/admin role to use Workboard. Personal means the creator and Desk admins,
  not a private vault hidden from administrators. The audience stays fixed.
- **Add task:** give it a title, an owner and optionally a date or notes. Open the
  task to change Planned / In progress / Waiting / Done. Waiting requires a short
  reason. A task's project/audience stays fixed after creation. This release uses
  an explicit state control rather than drag-and-drop that can bypass a reason.
- **Link existing work:** select a project and find an internal ticket or sale.
  Only its source reference is retained. Linking never grants anyone permission
  to the original record. Use the card's title to act in Desk or Assets.
- **Archive:** hide a task or project without changing source tickets/sales.
  Find archived projects/tasks under Projects and open their details to restore.
  Restore an archived project before changing its tasks. Archiving is not deletion.

My work means tasks/tickets assigned to you and sales you started. Team work is
permission-filtered, not all company data. If Finance or app access is removed in
Hub, Assets cards disappear. An unavailable source is labelled explicitly, not
represented as zero work. The board refreshes every 30 seconds when visible.
Backend access uses the existing 60-second directory lease after Hub learns a
change; upstream provisioning delay still applies. A disconnected or hidden stale
view asks to reopen. Forms preserve unsaved text on save failures; conflicting
edits require reopening the current version.

## What each column means

| Source | Planned | In progress | Waiting | Done |
|---|---|---|---|---|
| Own task | Explicit task state | Explicit task state | Explicit state + required reason | Explicit completion |
| Internal Desk ticket | New | Open | Waiting | Resolved or closed |
| Assets sale | Draft | Accepted or paid awaiting hand-over | Offer awaiting buyer or invoice awaiting payment | Completed hand-over/payment or cancelled |

A cancelled sale is labelled Cancelled, not presented as a completed delivery.
The sale card points out credit-note/refund review when applicable. Reopened
payment balances follow the original Assets sale phase. Workboard has no payment,
wipe, waiver, invoice, hand-over or ticket-transition bypass.

## Access and information minimisation

Hub remains the only place to assign application roles and the company Finance
team. Workboard is available to Desk agents/admins; requester and reporting-only
accounts do not gain entry. Group projects follow current Hub group membership;
Desk admins can administer all projects. Members can work on tasks and links;
only the project creator or a Desk admin can edit/archive project details.

Hub accepts sales reads only from a registered Desk connector and verifies the
viewer's current Desk staff role and Assets access. Assets independently checks
the Hub caller, current directory lease, active identity and admin/Finance role.
Hub and Desk recheck relevant access after awaits. A Finance grant alone does not
grant Desk staff access. Existing SSO, directory and Lunch contracts are unchanged.

Assets shares the hardware display title, invoice reference, workflow status,
next step, responsible role, dates and internal link. It does not share buyer
contact/address, payment amount/references, PDF contents, private dealroom links,
MDM secrets or technical notes. Project tasks should not contain customer secrets.
External customer tickets remain inside Customer projects in this first release.

## Storage, limits and rollout

Project/task data is additional stable Desk state. Existing tickets and sales are
not copied. Each object retains its latest 50 activity entries. Idempotency records
retain the initial create input so an uncertain retry cannot create duplicate work.
There is currently no automatic deletion of project/task data. Use the company's
normal retention/backup policy; do not advertise this as a retention solution.
The initial bounded release supports 100 projects, 5,000 tasks and 100 source links
per project, with pages of 100 items. Archived objects count toward these limits.

Ship the three modules together through the existing Kitchen release executor,
updating Hub and Assets before Desk. If an older/unavailable source is encountered,
Desk shows its unavailability. New installation still requires the existing one-time
setup code. Preserve the existing Hub policies and external integrations.

Local validation:

```sh
npm ci
# Install/build hub, desk and assets with their pinned Mops toolchain first.
node --test tests/workboard.test.mjs
# Populated committed-baseline upgrade fixture:
KEBAB_WORKBOARD_BASELINE=/private/baseline node --test tests/workboard.test.mjs
# Exact format-2 executable validation:
KEBAB_TEST_BUNDLE=/private/release/recipes KEBAB_WORKBOARD_BASELINE=/private/baseline node --test tests/workboard.test.mjs
node --test desk/test/workboard.test.mjs
node desk/tools/workboard-preview.mjs
```

A baseline directory contains `hub/`, `desk/`, `assets/`, each with `backend.wasm`
and `backend.did` built from the preceding committed release. Preview is disposable,
loopback-only and uses synthetic people, tasks, tickets and sales.

## For a purchasing or IT decision

This is a focused project layer inside the existing service desk, with one company
identity and the real source status. It is not a full portfolio-management system.
The team still chooses project outcomes, owners, priorities and completion. This
release has no dependencies, Gantt charts, project-specific notification rules,
automatic AI project plans or external-customer ticket aggregation. Those are not
marketed as implemented. Adoption should be judged on fewer copied status fields
and clearer ownership in the company's own pilot, not a promised saving.
