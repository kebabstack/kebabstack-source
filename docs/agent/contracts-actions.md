# Driving contracts from an AI assistant

contracts follows the stack's rule: everything a person can do in the UI is a plain canister
method, and an assistant acts *as the person*. This page is the contract; the type-level truth is
`contracts/backend/backend.did` (every method carries a `///` line an assistant can read via
`kebab_describe`).

## Getting a session

Through the hub, like every app: `kebab-mcp` mints an app ticket for the person and redeems it with
`loginWithTicket(ticket)`; the token lasts at most 10 hours and every call also needs the person's
directory lease (60 s). A stale session answers `null` / `ok = false`, never a trap. `whoami(tok)`
says who you are here: `id` (the hub person id), `role` (`admin | editor | member`), `roleSource`,
`aiOn`, `space` and `spaceRole`. Hub `role` is infrastructure administration; never infer contract rights from it.

Call `listSpaces(rootToken)`, then `openSpace(rootToken, spaceId)` and use the returned **scoped token**
for every record, source, document, rule, task, proposal, diagnostic and export call. Do not mutate a
shared workspace selection; tokens are bound to one space and share the original login expiry.
`createSpace(rootToken, name, description)` creates a teamspace. `getSpace(scopedToken)` returns its
member list; `updateSpace(scopedToken, revision, name, description, members, archived)` is owner-only
and requires an active owner. `setSpaceRelay(scopedToken, principal, enabled)` lets an owner bind a
previously operator-trusted relay identity to exactly one space. Sender addresses never choose scope.
`moveContract(scopedToken, id, revision, destinationSpaceId)` moves a record and its evidence only
when the person owns both spaces (or is responsible for that legacy record). A move changes access:
show the actual source/destination membership and obtain the person’s instruction before doing it.

## The vocabulary

- **Contract** (`getContract`, `listContracts`): the record — title, vendor, product, customer
  reference, responsible person (an id), deputy, visibility, status
  (`draft | active | cancelling | endConfirmed | ended | archived`), **terms**, optional future terms,
  `revision`, seats and holders. Every write against a record carries the `expectedRevision` you
  read; a mismatch means someone changed it — reload and compare, never overwrite.
- **Terms**: `amountMinor` (Int, minor units — `165000` is 1,650.00) + `currency` + `taxBasis`
  (`unknown | net | gross`) + `interval` (`month | quarter | year | once | other | none` or `""`), quantity and
  unit price, `start`, `end`, `renewalRule` (`auto | manual | none | indefinite` or `""`), `renewalDate`, notice
  as `noticeMonths` **or** `noticeDays`, `noticeDate` (last cancellation date), `decideBy` (internal
  decision date). Dates are `YYYY-MM-DD` texts in the organisation's time zone. Unknown is `null` /
  `""`, never zero.
- **Source** (`listSources`, `getSource`): a message — headers, text (the new part first, the
  forwarder's comment separately), documents, processing status
  (`received | processing | review | filed | ignored | failed`).
- **Proposal** (`listProposals`, `getProposal`): what a message suggests — `changes[]` with
  `field`, `oldValue`, `newValue`, `basis` (`explicit | derived | ambiguous | missing`) and
  `evidence[]` quotes; `candidates[]` when the contract is unclear; status
  (`open | confirmed | rejected | superseded`).
- **Task** (`listTasks`): `decide` (the internal decision), `review`, `assign`, `manual`; `dueOn`,
  `daysLeft`, `overdue`.

## Reading

| Want | Call |
|---|---|
| what needs me today | `today(tok)` → proposals to decide, tasks due, unassigned records (staff), failures (staff) |
| my contracts | `listContracts(tok, { q; status; responsible; onlyIncomplete; onlyDue; includeArchived })` |
| one record, everything | `getContract(tok, id)` → contract, proposals, sources, documents, tasks, history, rules, `canEdit` |
| the inbox | `listSources(tok, status, contractId?)` — `""` = everything not filed or ignored |
| one message | `getSource(tok, id)` → text, to/cc, documents, proposals, candidate contracts |
| a file | `documentData(tok, id)` (bytes), `documentText(tok, id)` (what the AI read) |
| people picker | `directory(tok, q)` → id, address, name, department |
| CSV | `exportCsv(tok)` — what the person may see |

## Deciding

| Do | Call | Rules |
|---|---|---|
| confirm / correct / reject | `decideProposal(tok, id, { expectedRevision; target : ?Nat; newContract; accept : [{ field; value }]; note })` | `accept` lists the fields to take **with the value as shown or corrected** (money as `"1650.00"` or minor units); unlisted fields are rejected; empty `accept` = reject all; `target` picks among `candidates` (staff: any contract); `newContract = true` (staff) makes a draft from the message. Atomic against `expectedRevision`. |
| hand to a colleague | `assignProposal(tok, id, personId)` | staff; the colleague must be allowed to see the record |
| later | `snoozeProposal(tok, id, days)` · `snoozeTask(tok, id, days)` | hides it; deadlines do not move; a snooze past the due date is refused |
| a task is done | `completeTask(tok, id, decision, note)` | for a `decide` task say `continue` or `cancel`; `cancel` moves the record to `cancelling` and adds the follow-up "send the cancellation" — **this app never contacts the vendor** |
| propose something I know | `proposeChange(tok, contractId, sourceId?, changes, summary)` | goes through the same confirmation |

## Editing a record (responsible person or staff)

| Do | Call |
|---|---|
| fields | `updateContract(tok, id, expectedRevision, ContractInput)` — people as ids (`directory`) |
| terms by hand | `setTerms(tok, id, expectedRevision, Terms, why)` · `setFutureTerms(tok, id, expectedRevision, ?Terms)` |
| status | `setStatus(tok, id, expectedRevision, status, note)` — a person's decision; `endConfirmed` needs an end date |
| a task | `addTask(tok, contractId, title, dueOn, assigneeId)` · `assignTask(tok, id, personId)` |
| create | `createContract(tok, ContractInput)` — requires write access in the selected space; Personal always uses its owner as responsible |

## Filing mail (staff), handing mail in (anyone signed in)

`linkSource(tok, id, ?contractId, ?{ kind; value })` files a message (kinds `senderAddress |
senderDomain | customerRef | subjectContains`), `setSourceStatus(tok, id, "ignored" | "review",
note)`, `reprocessSource(tok, id)` asks the AI again, `addRule` / `removeRule` / `listRules`.
A saved message is handed in with `intakeBegin(tok, meta) → intakeChunk(tok, id, index, bytes) →
intakeCommit(tok, id)` (kind `eml` or `manual`; the relay uses kind `relay` with no token).

## Admin

`getSettings` / `setSettings` / `setAdminEmails` / `setRelayPrincipals`, `connectionStatus` (staff),
`retryNotification`, `importPreview` / `importCommit` (staff; mapping header → field, `ignore` for
the rest), `exportAll` (current workspace, visible data, versioned JSON, no files), `seedDemo` / `removeDemo`, `adminLogRows`.

## What an assistant must not assume

- Confirming is a **person's** act. An assistant may prepare the accept list and show evidence; it
  should not confirm terms or change a status without the person saying so in that conversation.
- Amounts in proposals are what the model read; `evidence[].quote` is the sentence to show. A field
  with basis `ambiguous` or `missing` is a question, not a value.
- Nothing here sends mail, cancels anything with a vendor or pays. The follow-up task is a reminder
  for a person.

## 0.2.0 permission boundary

Personal means only its active owner. Teamspace owner/editor/viewer membership, and any restricted
record ACL, apply to all calls. Global Hub roles and groups do not add access to new spaces.
Old records stay under `legacy`; captured former admin/editor IDs and existing explicit access are
retained until records are deliberately moved. Never enumerate another workspace by guessing IDs.
JSON `exportAll` is now a **visible-data export for the current workspace**, schema 2 with `spaceId`;
it is not a global admin dump, includes no document bytes, and is not a complete restore package.
Intake chunks/commit require the same person and scope as intakeBegin, or the same bound relay caller.
An archived space is read-only. Hub deactivation follows the existing maximum 60-second directory lease.
`interval = none` explicitly means no payment, and forbids a nonzero amount. `renewalRule = indefinite`
means no fixed expiry and forbids an end/renewal date. Never infer either from missing source text.
