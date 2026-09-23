> **Current implementation: 0.2.0 (2026-09-08).** Contracts now uses personal workspaces and explicit
> team membership; Hub admins have no automatic access to new contract contents. This document below
> records the original 0.1.0 design. Where it describes global admin/editor access, one organisation-wide
> inbox or an admin-wide export, it is superseded by [contracts/README.md](../contracts/README.md),
> [INSTALL.md](../contracts/INSTALL.md) and the current [API guide](agent/contracts-actions.md).

# contracts — design (2026-09-06 · built as contracts 0.1.0; this page keeps the decisions)

Contract and subscription management fed by the mail people already write. The operating
principle: **put one address in CC or forward a thread; the module files the message to a
contract, proposes changes with their evidence, and tracks the decisions.** A form that has to
be kept up to date by hand is exactly what this module replaces.

## 0 · Where we start (inventory, HEAD 7d0f863)

| Building block | State | Reuse |
|---|---|---|
| Hub identity, roles, 60-s lease, person ids, offboarding hooks | hub 0.19 · SDK 0.4 | as in every app (`mo:kebab-hub`, `hub_ownedObjects`/`hub_reassign`) |
| AI lane | `hub_aiCredentials` / `hub_aiStatus` / `hub_aiUsed` (SDK), provider call pattern in desk (`aiCall`, both provider shapes, fences stripped, surrogates sanitized) | copy the call pattern; strict schema check on top |
| Notifications | `hub_notify` (title + link only), outbox-with-timer pattern in desk (Slack) | outbox for reminders |
| Protected files | desk `addFile`/`fileData` (1.5 MB per file, session-gated download, byte budget) | same pattern for mail attachments |
| Mail intake | **no canister receives SMTP** and no Gmail connector exists in the repo. A proven pattern exists next to the repo: a Cloudflare Email Worker parses MIME with `postal-mime` and injects the structured message into a canister through a trusted relay identity (Ed25519 key, `trustService`, receive lane only) | the smallest operable adapter — generalised as the module's `relay/` |
| Old contract register (the predecessor tool) | vendor, product, license type, seats, cost, currency, billing cycle, start, renewal, notice period, auto-renew, contact, terms URL, notes, status, `sourceText`; AI `analyzeContract(text)` → JSON suggestion; renewal alerts (lead days, repeat cadence); seat holders per contract | field set, renewal-alert cadence and seat holders carried over; the AI suggestion becomes a *proposal with evidence*, never a direct write |
| Spreadsheet as today's source | a sheet the operator keeps by hand | CSV import with column mapping, preview, row report |

Gaps to fill: message model with provenance, dedupe, proposals/decisions with revisions,
deadline engine (calendar-correct), MIME/attachment intake, extraction schema + validation,
persistent jobs with recovery, connection status, export/restore, kitchen recipe.

## 1 · Architecture decisions

**A1 · Mail intake = relay push, not mailbox polling (v1).** A Cloudflare Email Worker (the
module ships it under `contracts/relay/`) receives the contracts address, parses MIME
(`postal-mime`), extracts text from text-PDFs (`unpdf`), and calls the canister's intake lane
with a trusted relay principal: `intakeBegin(meta) → intakeChunk(id, n, bytes) → intakeCommit(id, sha256)`
(≤ 1.5 MB per chunk, so attachments up to a configured cap survive the 2 MB ingress limit).
Direct mail, CC and forwards all arrive this way; the Google Workspace address is a group or
alias that forwards to the relay address (the workspace itself stays untouched, no OAuth app,
no verification, no polling cursor). The same structured intake method serves the `.eml`
upload in the UI (browser-side `postal-mime`) for backfill and tests. A Gmail-API polling
adapter stays possible behind the same `Source` model — it is *not* in v1 because it needs an
OAuth app, token refresh, history cursors, a re-sync path and (for public distribution)
Google's verification, for a mailbox the operator can already forward from.
*Second-order:* only mail that reaches the address is seen — sent mail appears when the
sender CCs the address; that is the stated operating principle. The relay identity can inject
messages and nothing else; owners trust/rotate it in Settings.

**A2 · Documents: text in the worker, vision in the canister, never a PDF parser in Motoko.**
Text-PDFs are reduced to text in the worker (`unpdf`, page-bounded); PNG/JPEG go to the
provider's vision input from the canister (≤ 1.5 MB); scanned PDFs without text are stored and
marked *needs manual reading*. Files are stored protected (session-gated download), hashed,
capped (size per file, count per message, total budget), the file type sniffed from bytes.

**A3 · Three separate states, one revision counter.** Contract status (draft · active ·
cancellation in progress · end confirmed · ended · archived), processing status per source
(received · processing · ready for review · filed · ignored · failed), decision status per
proposal (open · confirmed · rejected · superseded). Confirming is atomic against the expected
contract revision. Amounts are minor units (Int) + currency + tax basis + interval; business
dates are `YYYY-MM-DD` texts, timestamps are ns Ints; the organisation's time zone is a
setting. Unknown is `null`, never zero, never "no renewal".

**A4 · The AI extracts, the backend decides.** One prompt version, one strict JSON schema
(field allow-list, enums, bounds, evidence quotes that must occur in the source text). A
message becomes *observations*; observations become a *proposal*; a person confirms
field by field. Routine invoices matching a confirmed contract (same amount, same interval,
same vendor) are filed automatically without a task. No AI → sources, manual entry, deadlines
and reminders keep working.

**A5 · Roles: admins run it, editors work it, responsible people see their own.** Hub owner/
admin = module admin (settings, relay trust, import, every contract). A configurable hub group
(default `contracts-editors`) edits every contract. The responsible person of a contract (a
person id) and explicit viewers see and, as responsible, edit that contract. Helpdesk gets
nothing by role — contract terms are not a support artefact, unlike tickets or devices.
Everything is checked server-side per contract, source, file, task and export.

**A6 · Seats travel with the contract.** Seats bought, seat holders (person ids via the hub
picker), and the derived "unused seats" (seats − active holders) come from the predecessor
tool and are the lever this module is expected to move: fewer licences before the renewal.
Comparing seats with real entitlements in the hub (who may open the vendor's app) is a later
hub feature, not v1.

## 2 · Data model (stable, append-only)

Contract{ id; title; vendor; product; customerRef; responsible : pid; deputy : pid|group;
visibility; status; terms : Terms; futureTerms : ?Terms; revision; seats; holders : [pid];
createdAt; updatedAt } · Terms{ amountMinor : ?Int; currency; taxBasis : unknown|net|gross;
interval : ?month|quarter|year|once|other; quantity; unitMinor; start; end; renewalRule;
noticeRule; noticeDate; decideBy } · Source{ id; kind : relay|eml|forward|manual; mailbox;
providerId; messageId; threadRef; receivedAt; claimedFrom; claimedDate; subject; textRef;
htmlRef; hash; status; contractId? } · Document{ id; sourceId; name; mime (sniffed); size;
hash; version; textExtract?; link? } · Observation{ id; sourceId; kind (offer … unclear);
values; effectiveDate?; evidence[] } · Proposal{ id; contractId?; candidates[]; baseRevision;
changes[{ field; old; new; basis; evidence }]; uncertainties[]; status; decidedBy; decidedAt;
note } · Task{ id; contractId; kind (decide|review|assign|deadline); dueOn; assignee : pid;
escalatedTo; snoozedUntil; doneAt; remindersSent[] } · Job{ id; step; idempotencyKey;
attempts; nextAt; lastError } · Audit{ id; at; who (pid|system|ai); what; before; after; sourceId }.

## 3 · Deadlines (product defaults, not contract interpretation)

Separate fields: contract end, renewal date, last cancellation date (from the notice rule and
its source), internal decision date (default 14 days before the cancellation date). Reminders
30/14/7 days before the relevant date, merged per task, immediate when already inside the
window. Calendar months are calendar months (month end, leap years, org time zone — tested);
unclear clauses become a *review* task, never a computed date. Every reminder goes through the
persistent outbox (hub notify, title + protected link, no amounts), with retries and a visible
failure queue; a changed date replaces the pending reminders. Snooze moves the task, not the
deadline, and warns when the deadline itself is crossed.

## 4 · Delivery plan (all five steps shipped in 0.1.0; the external live test of the relay is a separate authorised step)

1. **Core** — model, hub wiring (tickets, lease, roles, `hub_*` contract), contract record, CSV
   import (mapping, preview, report), manual terms with confirmation + revision, deadline
   engine + outbox, Today/Contracts/Record views, kitchen recipe. Usable without any mail.
2. **Intake** — structured intake lane (relay principal + session `.eml`/manual), dedupe
   (provider id, message id, content hash, document hash), attachments, Inbox view, matching
   (customer ref → confirmed rules → candidates → ask), proposals from observations,
   field-wise confirm/correct/reject/assign/snooze, routine-invoice filing.
3. **Extraction** — hub AI lane, prompt v1, strict schema, evidence check, cost caps, mocked
   provider in tests, a versioned synthetic evaluation set (DE/EN).
4. **Relay** — `contracts/relay/` worker (postal-mime + unpdf, chunked intake, retries,
   `wrangler tail` diagnostics), Connection view (last message, oldest open job, failures),
   trust/rotate in Settings, RUNBOOK for the address/group setup. External live test = separate
   authorised step.
5. **Finish** — export (CSV + full versioned dump) and restore notes, docs (README, INSTALL,
   OPERATIONS section, agent contract), `///` on every method (assistants), smoke, PocketIC
   regressions for the acceptance table, hub docs card + archsvg, GAPS rows.

Out of scope for v1 (by specification): e-signature, contract generation, negotiation, legal
assessment, payments, sending cancellations, vendor-portal scraping, company-wide mailbox
analysis, ERP/bank links, long approval chains, Slack action buttons, all mail providers.
