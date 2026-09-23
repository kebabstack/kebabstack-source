# 🍢 desk

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

Desk 0.23.0 brings coverage planning, incident response, service status and **Time & compensation** into one consistent workflow. Configuration stays under each on-call project's Settings; reporting access comes from Hub 0.31.0. See [ONCALL.md](ONCALL.md), [STATUS.md](STATUS.md) and [REPORTING.md](REPORTING.md) for setup and alpha boundaries.

App roles are managed exclusively in [Hub → Permissions](../docs/APP-PERMISSIONS.md). Active Hub owners/admins and per-app Admins can see and manage all app content. Employees retain their own and explicitly shared content; Watch requires an explicit Viewer/Admin grant by default.


Service management on the skewer: a request catalog with typed forms,
checklists, approvals and SLAs; an append-only timeline per ticket; roles
and queues from hub groups; notifications through the hub; assistive AI.

- **Requesters** file from the catalog, follow their requests, approve what
  is routed to them.
- **Agents** work the queue: assign, wait, resolve, checklist, internal notes visible only to the support team.
- **Admins** shape the catalog and settings.

Built on `mo:kebab-hub` — desk has no user list, no login lane and no chat
tokens of its own. See [CONCEPT.md](CONCEPT.md) for the design and what it
keeps from its predecessor, [INSTALL.md](INSTALL.md) to run it, and
`docs/agent/desk-actions.md` for driving it from an AI assistant.

```
desk/
  backend/main.mo      persistent actor (catalog, tickets, events, approvals, SLA, AI)
  dist/                index.html + app.js SPA, idl.js generated from backend.did
  test/run-smoke.sh    jsdom walk-through in all three roles
  CONCEPT.md · INSTALL.md
```

Status: alpha. **Slack intake** since 0.5.0: a support channel becomes a queue
(message → request, bot answers in the thread, replies both ways, ✅ resolves);
the Slack app is configured once in the hub and assigned to desk there. Teams
intake is not shipped.

Custom domains are supported; see [INSTALL.md](INSTALL.md#custom-domain-for-an-existing-desk).

## Working in Desk

Employees start in **My requests**, choose a service with **New request**, and see
who is helping, what happens next and the conversation on one ticket page. They
can reply, attach a file, mark their request as solved or reopen it.

Agents start in **Internal support**. Filters show assigned, unassigned, waiting,
overdue and completed requests. On the ticket, assignment and status sit beside
the chronological conversation. Routing, target dates, related links and activity
are expandable. **Internal note** is visually distinct from a public reply; AI
suggestions are drafts for an agent to review. Attachments remain public, so they
cannot be added while composing an internal note.

The ticket checks for changes every seven seconds while visible (polling, not a
streaming connection). Refreshes preserve the reply, internal-note draft and
open editors. Reply drafts stay in memory while navigating between requests;
they are cleared at sign-out and do not survive a page reload or closed tab.
A browser unload warning helps prevent accidentally discarding them.

Links and basic Slack/Markdown formatting are displayed without trusting HTML.
Names already present in a Slack mention are shown; otherwise its Slack ID is
retained. Resolving every Slack ID to a name and improving Slack delivery retries
are separate transport work, not part of this frontend release.

Local verification: `bash desk/test/run-smoke.sh` and
`node --test desk/test/experience.test.mjs` from the repository root after `npm ci`.

Hub profile pictures appear in the header and ticket conversation when the Desk
connector has the `avatars` lane. Desk fetches only the signed-in person and
visible ticket participants, in batches of four. Pictures stay in browser memory;
there is no public photo URL or persistent image copy in Desk. Missing pictures
fall back to initials.

## Person context in Desk

Agents can open permission-checked summaries of related employee records in Desk.
See [employee context and directory follow-up](../docs/LIFECYCLE.md) for the workflow,
data boundaries and rollout. App roles remain managed in Hub.

## External customer support

Desk 0.12 includes **Customer projects**: separate product workspaces with Hub-group support teams, configurable intake forms, an embedded widget and scoped server API keys. External customers use a private ticket link without a Hub account. Customer contacts are separate from employee identities and lifecycle context.

This is logical access separation inside one company’s Desk. Company admins and infrastructure controllers remain trusted across projects; it is not a separate encrypted tenant for each customer. See [Customer support](CUSTOMER-SUPPORT.md) for operator steps, exact API contracts and first-version limits.

Customer projects automatically delete completed requests after 90 days and inactive open requests after 365 days by default. Admins configure project retention and notices in **Project & integrations → Privacy & retention**; the adjacent **Embedding guide** explains widget/API setup. Ticket privacy controls support reviewed exports, immediate erasure and expiring holds. Historical backups need the documented rotation and deletion-journal restore procedure; this is GDPR support, not a compliance certification.

## Customer request types and workflows

Since 0.13.0, each external customer project has its own request types, form fields,
service targets and optional ordered workflows. Configure them under **Project &
integrations → Request types & workflows**; a refund template is available to adapt.
Agents see the current step, required checks, responsible team and approval action.
Hub remains authoritative for permissions. Current tickets keep their definition when
configuration changes, and workflow records follow the project's automatic deletion.
See [Customer support guide](CUSTOMER-SUPPORT.md#request-types-and-workflows) for
operator behavior, API selection, upgrade behavior and the current limits.

## Hardware follow-up (0.14)

Confirmed offboardings show verified Assets progress inside the person panel. Handle each device in Assets and let Desk check the result before closure; unavailable sources remain unverified. Reactivation pauses outstanding work. See [Hardware offboarding](../docs/HARDWARE-OFFBOARDING.md).

## Hub Operations

This app contributes aggregate-only, Admin-authorized summaries to Hub → Operations. See [definitions, access and freshness](../docs/HUB-OPERATIONS.md). Individual records remain in the app.

## On-call planning preview (0.16)

Internal operations teams and existing customer projects can prepare bounded
on-call schedules with daily/weekly rotations, backup coverage and accepted
future-shift replacements. Drafts are private to admins; published plans follow
Hub team access. Planning alone sends no incident notifications. The response extension below
adds an explicitly configured Hub channel; scoped hourly payroll reporting is added by the 0.19 alpha in [REPORTING.md](REPORTING.md).
See [On-call planning](ONCALL.md) for the workflow, limits and disposable preview.

## Incident response candidate (0.17)

The local candidate adds native Hub notification queues, response escalation,
explicit incident ownership and accepted handoffs beside on-call coverage.
Responders can record actual work separately; records are unreviewed and follow
incident retention. Monitoring intake is added in the 0.18 candidate below; verified device paging
remains planned. Scoped hourly payroll reporting is added in [REPORTING.md](REPORTING.md). See [the operator workflow and limits](ONCALL.md#respond-to-an-incident).

## Alert sources candidate (0.18)

An administrator connects a source under **On-call → project → Alert sources**.
Each expiring key can only send events for that source's fixed project/service.
Test the connection while paused, enable it, then send one unique occurrence ID
with increasing event sequences. Repeats share one incident; recovery remains
separate from the team's acknowledgement and verified resolution. Copyable setup,
rotation and retry guidance is built into the source page.

Deploy `oncall-alerts.js` with the matching backend through the normal tested
Kitchen bundle. HTTP intake is on the **backend** at `/oncall/v1/sources/{id}/events`,
not the frontend/custom Desk domain. Existing sources are never seeded in a real
upgrade. The generic contract requires a server-side adapter; no direct Watch or
vendor-specific integration is claimed. See [ONCALL.md](ONCALL.md#connect-monitoring).
