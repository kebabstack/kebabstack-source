# desk — concept (2026-09-02, historical draft)

> Historical design/review record. It describes its stated date, not current
> behavior or deployment instructions. Use README.md, docs/GAPS.md and the
> current module INSTALL/CHANGELOG files for the supported flow.

Service management for the skewer: requests, queues, catalog, approvals.
First app built on the `kebab-hub` SDK. Not a port of the in-house tool's
ticket module — a clean design that keeps its hard-won lessons.

## What the in-house tool got right (keep the lesson, not the code)

| Lesson | Where it came from | desk translation |
|---|---|---|
| Replies never change status | "thanks!" used to reopen tickets | status moves are explicit actions, always; comments are comments |
| Internal notes never leave the canister | `internal` flag on comments, filtered server-side for the portal | two event kinds: `comment` (visible to requester) and `note` (agents only); portal query filters server-side |
| Two-way with identity | "Agent (IT)" / "Person (via portal)" labels | every event carries actor e-mail + kind (agent · requester · system · ai) |
| Push, not poll | Slack Events API, HMAC verify, 5-min replay window, event_id dedupe | any external intake is a verified webhook into `http_request_update`; polling exists nowhere |
| AI triage is a suggestion | subject/category/priority/summary as a system note; ticket created even without an AI key | triage writes a `note` by actor `ai`; never overwrites what the requester typed; never auto-sends |
| Typed forms gate resolution | on/offboarding form + checklist; ticket cannot resolve with open items | generic: a **request type** has fields + checklist; open checklist items block `resolved` |
| Deadline drives urgency | ⏳ badges, hourly escalation, max 1/day per ticket | `dueAt` on every ticket; SLA target from the request type; one nudge per breach, via `hub_notify` |
| PII stays off public channels | Slack intake steered on/offboarding to the portal form | request types carry `visibility: portalOnly` — chat intake links to the form instead of collecting |
| Side tables, not growing records | v18/v19 could not add fields to `Ticket` (stable map value) | designed for extension from day 1: core record + `fields : [(Text, Text)]` + append-only event log |
| Intake context through the whole pipeline | B1: multi-workspace tickets stored the wrong channel | `channel` is a first-class field on the ticket and on every event |
| Attachments capped, bytes in the canister | 20 files/ticket, own copy | same; blob side table keyed by file id |
| Sign-in via hub ticket, identity = e-mail | `redeemHubTicket`, portal shows own tickets | SDK does it; requester = hub e-mail; deactivated → portal gone, tickets stay |

## What gets rethought

**1. The catalog replaces categories and the hardcoded on/offboarding.**
The in-house tool has a free-text category list plus one special-cased request
type (on/offboarding with a form and a checklist). desk makes that special
case the *generic primitive*: a **request type** = name, description, typed
fields, checklist template, target queue, approval rule, SLA targets,
visibility. On/offboarding, access request, software purchase, hardware,
"something is broken" are just catalog entries. Admins edit the catalog in
the UI; the seed ships eight sensible defaults.

**2. Approval as a step, not a comment.** Half of real IT requests need a
yes from someone (manager, budget owner, security). A request type can
require approval by: nobody · the requester's manager (hub attribute
`manager` — this is why Directory+ exists) · a hub group (e.g. "Security").
The approver acts from the portal or the notification link; the decision
is an event; work cannot start before approval.

**3. Roles come from the hub, not from a local admin list.** Agents = a
hub group (default "desk-agents"), desk admins = a hub group (default
"desk-admins"), everyone in the directory = requester. `groupsOf(email)` at
sign-in. Groups finally *do* something (hub review proposal 5). Bootstrap:
controller sets the two group names; until they exist, controller is admin.

**4. Queues route by group, not by channel.** A queue is a hub group the
ticket is assigned to before a person picks it up. Request types default a
queue; agents can move tickets. Department-based routing (`department`
attribute → queue) is a catalog rule, not code.

**5. An event log instead of a comments array.** Every change — comment,
note, status, assignment, field edit, file, approval, checklist item — is
one append-only event with actor and time. It gives the timeline UI, the
audit trail, and the AI summary for free, and it never grows the ticket
record.

**6. Status model, small and unambiguous.** `new → open → waiting →
resolved → closed`, plus `waitingOn : requester | third-party | approval`.
Requester reply on `waiting(requester)` flips to `open` — the one automatic
transition, because it is the requester's explicit action. Auto-close after
N days resolved (configurable, default 7).

**7. Notifications go through the hub.** No Slack tokens in desk. Assignment,
reply, approval needed, SLA breach → `hub_notify` (title + deep link). The
hub already does bell + Slack DM + dedupe.

**8. Chat is an intake plugin, the portal is the default.** Slack/Teams
intake becomes `desk/plugins/chat-intake` later, credentials via the hub
bot registry, exactly the Events pattern that worked. v1 ships portal +
agent workspace + agent-facing API.

**9. AIware from the first commit.** Every requester and agent action is a
documented, callable method (`docs/agent/desk-actions.md`): file a request,
list mine, comment, approve, assign, resolve. AI features inside desk stay
assistive: triage note, thread summary, suggested reply as a draft, similar
tickets. Nothing AI does is irreversible without a human click.

## What is dropped (the predecessor's org-specific organs, dead weight)

MDM/IdP vendor specifics and the predecessor's trusted domain · II `verified_email` attribute lane
(the hub owns identity) · `ITS-XXXXX` invite codes and "request access"
tickets (hub invites) · internal-Slack escalation channel · fallback
polling · hardware model catalog tied to Assets internals (becomes a
generic link `asset:<tag>` via the contract) · per-workspace intake cards
(plugin) · org-specific checklist texts (generic defaults) · `win` tiles etc.

## Data model (stable, extension-safe)

```
Ticket   { id; key "DSK-42"; typeId; subject; body; status; waitingOn; priority;
           requester; assignee; queue; channel; fields : [(Text, Text)];
           links : [(Text, Text)]; createdAt; updatedAt; dueAt : ?Int;
           firstResponseAt : ?Int; resolvedAt : ?Int; closedAt : ?Int }
Event    { id; ticketId; at; actor; actorKind; kind; body; meta : [(Text, Text)] }
Type     { id; name; icon; description; fields : [FieldDef]; checklist : [Text];
           queue; approval : #none | #manager | #group Text;
           respondH; resolveH; visibility; enabled }
Task     ticketId -> [{ title; state open|done|na; by; at }]
Approval ticketId -> { approver; decidedBy; state pending|approved|rejected; at; note }
File     id -> { ticketId; name; mime; size; data; by; at }
Article  id -> { title; body(md); tags; updatedAt }          (KB, phase 2)
```
Every map is a top-level stable field; records are never mutated in shape
(append-only stable vars, side tables for anything new).

## Surfaces

- **Requester portal** (`#/me`): new request from the catalog (form from
  `fields`), my requests, timeline, comment, self-resolve/reopen, approvals
  waiting for me.
- **Agent workspace** (`#/queue`, `#/t/42`): queues, filters (mine ·
  unassigned · waiting · breached), ticket with timeline + side panel
  (requester card from the hub directory, fields, checklist, links),
  actions, AI panel (summary · suggested reply draft).
- **Admin** (`#/settings/*`): catalog, groups/queues, SLA, auto-close,
  AI key (or read from a suite-wide config later), seed data toggle.
- Docs page "How desk works" + architecture SVG, kept current (same rule as
  the hub).

## Contracts to other layers (interfaces only, no coupling)

hub: SDK (sign-in, directory, deactivate, notify, groups, manager).
assets: `links` entry `asset:<tag>`; assets may call `desk_openFor(email)`
later to show a person's open requests at offboarding. trust: `links`
entry `device:<id>`; posture shown from the trust API when present.

## Phasing

- **v0.1 (this sprint):** hub-wired skeleton via SDK, catalog with typed
  fields + checklist + queue, tickets + event log, portal + agent workspace,
  approvals (manager/group), hub notifications, SLA due dates + breach
  nudge, AI triage/summary/draft (optional key), seed data, docs page,
  agent actions doc.
- **v0.2:** chat-intake plugin (Slack), KB articles + deflection, CSV
  export, saved views, e-mail intake via inbound-webhook relay (evaluate).
- **Later:** assets/trust link resolvers, recurring requests, CSAT.
