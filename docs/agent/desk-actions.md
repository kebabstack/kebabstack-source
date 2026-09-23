# Driving desk from an AI assistant

desk is built for the "people live in chat" world: every action a requester
or agent can take in the UI is a plain canister method. An assistant with a
session token can file, follow, work and approve requests. This page is the
contract; `desk/backend/backend.did` is the type-level truth.

## Getting a session

The assistant acts *as a person*. Two ways to hold a session token:

1. **Hand-off from the browser**: the person copies nothing — the assistant
   runs in a context that already has the desk session (`localStorage`
   key `ks-desk-session` in the desk origin).
2. **Hub ticket**: the authenticated person asks the Hub for a ticket bound to
   the Desk tile, then `loginWithTicket(ticket)` redeems it. Being a registered
   connector alone does not authorize impersonating a person. Tokens last at most
   10 hours, but every protected call also requires an active directory lease
   below 60 seconds; `signOut(token)` ends a session early.

Every method below takes the token as its first argument. A stale or
deactivated session returns `null` / `ok = false` — never trap.

## Who am I

```
whoami(tok) → ?{ id; email; displayName; role : requester|agent|admin; groups; orgName; aiOn }
```

## People are ids (desk ≥ 0.6.0)

Every person in a ticket — `requester`, `assignee`, an event's `who`, a task's
`by`, `approver`/`decidedBy`, a file's `by`, person-type field values — is the
hub's stable person id (`p_…`), never the address. To show a name, use the cards
in `TicketFull.people` (id → displayName, email, active) or `TicketRow.requesterName`
/ `assigneeName` (+ `requesterEmail` / `assigneeEmail`). "Is this my ticket?" is
`ticket.requester == whoami.id`. Where you **give** a person to desk — `assign`,
`agentCreate.requester`, `setApprover`, person fields, the assignee filter — an
e-mail address is accepted (that is what the directory hands you) and resolved
to the id server-side. Pseudo-actors: `system`, `ai`, `slack:<user>` (a Slack
author without a hub account); `legacy:<address>` marks a person the hub never
knew (rare, from data older than 0.6.0).

## Requester actions

| Do | Call | Notes |
|---|---|---|
| see what I can ask for | `catalog(tok) → [RequestType]` | `fields[]` tells the form; `sensitive` fields must be collected privately |
| file a request | `createRequest(tok, typeId, subject, body, fields : [(key, value)])` | validates required fields, dates (`yyyy-mm-dd`), select options; unknown keys are dropped; 1 per 10 s, max 30 active per person; returns `{ ok; id; key; detail }` |
| list mine | `myTickets(tok) → [TicketRow]` | |
| read one | `getTicket(tok, id) → ?TicketFull` | internal notes and AI notes are filtered out for requesters server-side |
| reply | `comment(tok, id, body)` | if the ticket waits on the requester, this reopens it (the one automatic transition) |
| it is solved / reopen | `requesterSetStatus(tok, id, "resolved" | "open")` | a rejected request cannot be reopened — file a new one |
| fix my text | `setSubject(tok, id, subject, body)` | own tickets only |
| attach | `addFile(tok, id, name, mime, bytes)` | ≤ 1.5 MB, ≤ 20 per ticket |
| approvals waiting for me | `myApprovals(tok) → [TicketRow]` | direct or via a hub group I am in |
| decide | `decideApproval(tok, id, approve : Bool, note)` | never on my own request; approvers can read the ticket while it is pending, not write to it; access ends with the decision |

## Agent actions (role agent or admin)

| Do | Call |
|---|---|
| the queue | `listTickets(tok, { view : all|open|mine|unassigned|waiting|breached|done; status; queue; assignee; q })` |
| numbers | `stats(tok)` |
| file on behalf | `agentCreate(tok, { typeId; subject; body; fields; requester; priority; channel })` — set `channel` to where it came from (`chat`, `phone`, `email`, your app slug) |
| take / assign | `assign(tok, id, email)` — `""` unassigns; only agents/admins are accepted |
| move | `setQueue(tok, id, groupName)` |
| status | `setStatus(tok, id, status, waitingOn)` — `waiting` needs `requester` or `third-party`; `resolved` is refused while checklist items are open or an approval is pending |
| priority | `setPriority(tok, id, low|normal|high|urgent)` |
| public reply | `comment(tok, id, body)` — sets first-response time, notifies the requester |
| internal note | `addNote(tok, id, body)` — never visible to the requester |
| checklist | `setTask(tok, id, idx, open|done|na)`, `addTask(tok, id, title)` |
| fields | `setFields(tok, id, [(key, value)])` — re-validated against the type; date field may move the due date |
| due | `setDue(tok, id, ?nanos)` |
| links | `addLink(tok, id, kind, ref)` / `removeLink` — `asset:<tag>`, `device:<id>`, `url:<https://…>` |
| people | `directory(tok, q)`, `agents(tok)` |
| AI help | `aiSummary(tok, id)` (stored as internal note), `aiDraft(tok, id, intent)` (returned only — post it yourself with `comment` after a human looks) |

## Admin actions

`getSettings`, `updateSettings`, `setAdminEmails`, `setAi`, `setAiTriage`, `clearAiKey`,
`aiTest`, `adminCatalog`, `upsertType(tok, id | 0, TypeInput)`,
`removeType`, `setTypeOrder`, `resetCatalogDefaults`, `setApprover`
(re-route a pending approval), `syncNow`, `seedDemo`, `adminLogRows`.

## Rules an assistant must keep

- **Identity is the session.** Never file or comment as someone else unless
  you hold *their* session; use `agentCreate` with `requester` when acting
  as an agent on a colleague's behalf, and say so in the body.
- **Sensitive fields stay private.** If a request type has `sensitive`
  fields, collect them in a private channel or send the person to the
  portal form; never echo them back into a shared chat.
- **Status is explicit.** Do not "resolve" because a reply sounded final;
  ask, then call `setStatus` / `requesterSetStatus`.
- **Notes vs replies.** Anything about the requester that they should not
  read goes through `addNote`. When in doubt, note.
- **AI output is a draft.** `aiDraft` text is posted only after a human
  approved it. `aiSummary` is for agents and is stored as a note.
- **Deep links.** A ticket is `<desk url>#/t/<id>`; use it in every message
  you send about it.

## Events you can read (timeline)

`getTicket(...).events[]` — `kind` ∈ created · comment · note · status ·
assign · queue · priority · field · file · approval · task · link · ai;
`who` is an e-mail, `system` or `ai`; `meta` carries structured details
(`status`, `assignee`, `decision`, …). Timelines are append-only: this is
the audit trail.
