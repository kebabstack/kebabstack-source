# Changelog — kebab-stack contracts

## [0.11.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes.

## [0.11.0] — 2026-09-22

- Keep spend figures readable on narrow phones by stacking summary cards.
- Remove the duplicate product masthead; keep workspace selection and access visible. Adopt shared forest/paper styling, aligned menu targets and common controls without changing teamspace visibility, print output or contract decisions.

## [0.10.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.10.1] — 2026-09-21

- Session checks and Hub ticket redemption show a compact progress screen instead of presenting the company sign-in form again. Retry controls appear only when sign-in needs attention.
- Use the corrected shared JSON sanitizer: large external responses no longer build a deeply nested text value, and escaped backslash literals remain unchanged.
- Sidebar icons use consistently sized SVGs, fixing the Overview glyph alignment across fonts.

## [0.10.0] — 2026-09-18

- Added the Hub-only Operations summary, limited to an active centrally assigned app admin and a fresh directory. It returns numeric counts without personal records, free text or credentials. Existing data and role assignments are preserved.
- Shows upcoming/overdue recorded decisions and missing owners or dates across accessible spaces. Excludes trash, billing documents, offers and license-key records.

## [0.9.0] — 2026-09-17

- Added Hub-brokered support summaries for visible contract responsibilities, deputy assignments and license allocations. Workspace and record permissions still apply; financial details, documents and license keys are excluded.

## [0.8.1] — 2026-09-17

- Shared company sign-in screen and progress states match the Hub across all six tools. Session checks and ticket redemption lock the continue button; failures allow an explicit retry.
- New ticket attempts clear any previous local session before redemption, so a rejected ticket cannot reopen a different account’s old session. Deep links and public access routes are preserved.

## [0.8.0] — 2026-09-17

- App roles now come exclusively from Hub permissions. Removed local admin claims, email lists and role-group settings; deprecated mutation APIs refuse changes. Active Hub owners/admins and Hub-assigned app admins have full app access. Employees keep their own and explicitly shared content; Watch requires an explicit viewer/admin assignment by default. The existing 60-second directory lease bounds revocation. App admins can access all content, including personal workspaces/forms; employee-to-employee isolation remains enforced.
- Configure the central policy in Hub before upgrading this app; an absent or incompatible policy denies sign-in. Historical local role settings are retained only for migration inspection.

## [0.7.1] — 2026-09-10

- Trash now offers explicit permanent deletion for one item, with a confirmation and loading
  feedback. Only an already trashed item that the caller can edit may be removed; current
  workspace access is checked again by the backend.
- Remove linked originals, AI readings, jobs, pending review notices, license secrets and
  record side data. Reclaim unused storage while retaining files referenced by other documents;
  repair the attachment index so a deleted document can be uploaded again. Late AI cannot
  recreate deleted originals. Existing external backups and delivered notifications remain.
- Replace the misleading “could not be filed” notification with a clear request to review
  the extracted details and save. Pending notifications from older versions use the new text.
- Recheck review state before delivery, including retry backoff: suppress requests for filed,
  ignored or trashed documents, completed proposals and superseded review assignments.
- Obsolete requests leave the pending queue without becoming delivery failures. Existing
  Hub/Slack notification history, renewal reminders and workspace access rules are retained.

## [0.7.0] — 2026-09-10

- SaaS-first workspace: compact document review, software portfolio with owners, seats, prices,
  contract periods, cancellation dates and renewal rules. One save can start active tracking.
- Dashboard and management CSV/print report: current annual run rate by currency, upcoming
  decisions, unassigned licenses and estimated historical accrual from recorded terms. Price
  revisions are retained going forward; billing documents are not labelled as paid expenses.
- Restricted license-key inventory with explicit, audited reveal. Secrets never enter AI,
  portfolio responses, notifications or standard contract exports.
- Hub group selection for license assignment with deduplicated, current member counts.
  Assigning software does not grant access to contracts or keys.
- Workspace renewal reminders start at 90 days, with configurable follow-ups and owner/admin/
  group recipients who already have contract access. Earlier cancellation deadlines are also
  checked; delivery rechecks policy, recipient access and current contract dates.
- Optional automatic public-vendor terms cross-check when renewal terms are missing. Public
  page evidence, retrieval time and source remain separate; using a web suggestion is explicit.
  Private documents are never sent to vendor websites. Unreadable sites remain unknown.
- Existing contract state and documents retained; new features use additive side tables.

## [0.6.3] — 2026-09-09

- AI money fields now explicitly name decimal currency values instead of internal minor units.
  A 100× mismatch against a quoted price is withheld for review, preserving other valid fields.
- Extraction explicitly excludes document IDs, PO references and printed contract numbers from
  candidate record IDs. Empty candidate lists stay empty.

## [0.6.2] — 2026-09-09

- Shorter AI wire format keeps the same fields and evidence checks while avoiding repeated
  JSON labels. Sonnet 5 extraction uses explicit medium effort; the neutral probe uses low.
  Original PDFs/images and the configured Hub model are retained.
- Transient provider/outcall failures stay visibly queued and retry after 30/60 seconds,
  with a maximum of three attempts. Permanent provider errors stop without repeated calls.
  Previously extracted suggestions remain available throughout; explicit rereads start promptly.
- Safe diagnostics distinguish hosting timeouts, response limits and connection errors without
  exposing vendor payloads. Failure appears once, including when reopening the document.

## [0.6.1] — 2026-09-09

- AI rereads give immediate button feedback and continue showing real queued/reading state
  even when an older suggestion exists. Elapsed time, completion and failure stay visible.
- The review refreshes automatically when untouched. In-progress edits are preserved, with
  an explicit choice to use the new suggestions; manual edits can still be saved afterwards.
- Both document-review and inbox filing use the same progress panel. A failed status check
  offers a read-only reconnect; leaving the page/workspace stops its watcher.
- Saves, moves, downloads and shared form actions show a consistent loading indicator,
  prevent repeated clicks and respect reduced-motion preferences. No backend workflow change.

## [0.6.0] — 2026-09-09

- Preserve PDF layout readings when the same supplied original's extracted text is in a
  different order. These remain visibly marked suggestions requiring review, never matched
  text or automatic invoice filing. Unknown/foreign evidence is still refused.
- Browser PDF text follows visual rows rather than drawing order. The reader maps supported
  dates and quantities into fields and distinguishes monthly unit prices from annual billing.
- Purchase details: quote/order reference, PO, payment terms, billing contact, unit price period,
  renewal term and commercial conditions. Saved atomically with the document, editable on the
  record, included in scoped CSV/JSON exports, and protected by the record's access/revision.
- A successful AI reread supersedes older pending AI suggestions. Previous evidence and human
  decisions remain in history; failed rereads retain the previous suggestions.
- Includes the Contracts notification URL correction from 0.5.1 (pair with Hub 0.22.1).

## [0.5.1] — 2026-09-09

- Notification links work with app addresses with or without a trailing slash, including
  already queued deliveries. The workspace and document destination stay intact.
- Pair with Hub 0.22.1 to repair links in notifications that were already delivered.

## 0.5.0 — 2026-09-09

- Original PDFs and PNG/JPEG/WebP/GIF images are sent to the Hub provider for native visual
  reading, including image-only scans and purchase screenshots. Anthropic and OpenAI chat
  formats are supported, with bounded batches and the Hub vision-model preference.
- Recognises agreements, subscriptions, invoices and receipts. Review and correct the document
  type; receipt reviews emphasise the total and keep additional terms expandable.
- Visual evidence is labelled as an unverified AI reading. Text quotes remain checked; one
  mismatched quote no longer discards other supported fields. Foreign evidence is rejected.
- Corrects AI decimal amounts to the minor units expected by review forms, including existing
  proposals. Previously saved values are not rewritten.
- Inbox items and saved records can be deleted to a workspace-scoped, restorable Trash.
  Originals remain retained. Trashed records stop reminders; in-flight AI cannot resurrect them.
- Starts analysis immediately after upload or manual retry. The review shows actual processing
  notes and offers retry directly. Long multi-file requests are batched within outcall limits.
- File limits remain 1.5 MB each / 10 attachments; originals below 1.4 MB fit native AI requests.
  Oversized AI requests are refused with compression guidance while keeping the original. Vision requires a capable provider/model;
  unreadable or encrypted originals can need a clearer copy. This is no signature verification.

## 0.4.1 — 2026-09-09

- Fix Anthropic document analysis for models that reject the deprecated `temperature` parameter.
- Workspace tools → AI shows Hub registration, lane, key availability, provider/model and daily
  budget separately from model health. Every signed-in member can inspect the connection;
  Contracts administrators can run a neutral model test without sending contract content.
- Safe, actionable provider errors appear on failed documents. Manual retries reset exhausted
  attempts and refuse concurrent extraction of the same item. Originals and confirmed data remain intact.

## 0.4.0 — 2026-09-09

- Document-first creation: upload → AI progress → editable review with original attachments →
  one atomic draft save. Complete missing fields without opening a blank-record drawer.
- Workspace controls share a consistent baseline. The review page works in light/dark themes
  and narrow viewports, with reduced-motion support.
- New `createContractFromSource` validates facts before creating anything; guards duplicate
  filing and membership; moves source evidence atomically only between owned workspaces.
  A late AI result cannot overwrite a document already reviewed and filed by a person.
- Text-based signature-request / reported-execution suggestions and up to four same-workspace
  referenced messages for context. Original PDF beginnings and endings are included in bounded
  AI input. No OCR, handwriting detection, digital signature verification or auto-activation.
- Built-in Contract intake for current Hub admins/owners only, with relay binding and dynamic
  role revocation. App-only admins gain no content access; personal/team boundaries remain.
- Route unfiled documents between owned workspaces before matching an existing agreement.
  Old extraction jobs stop; original attachments follow; analysis restarts in the destination.
  Original intake receipts prevent redeliveries from recreating moved documents or exposing
  their private source IDs. Existing receipts are remembered on their next move.
- In-app Google Workspace mail setup and downloadable runbook. Shared intake privacy,
  explicit routing after a move, retained Google copies and failure recovery are documented.
- Relay errors during parsing, upload or canister refusal now recover the complete original
  or reject delivery. Empty recipient lists fail closed; oversized attachment sets no longer
  lead to silently incomplete intake. PDF parsing is bounded and releases its resources.


## [0.3.0] — 2026-09-09

### Changed
- A responsive workspace with consistent light/dark colours, a new contract icon, readable navigation and a task-oriented overview.
- Clear document intake, evidence review and manual filing. Create a draft from an incoming item and attach its source without re-entering the workflow.
- Complete dates and labels, keyboard-accessible filters, useful empty states and a practical guide.

### Fixed
- Failed workspace switches recover the previous view. Late searches and record requests cannot overwrite a newer route or workspace.
- Reject an unfiled AI suggestion without creating a draft or changing the source’s contract association; retain the decision and its author.
- Prevent duplicate create/paste requests and show validation/save errors inline. Workspace tokens stay attached to the operation that started with them.
- Removed light-only workspace and modal backgrounds. Personal/team membership boundaries, archived read-only spaces and the 60-second Hub lease are preserved.

## [0.2.1] — 2026-09-08

### Fixed
- Check Hub AI access in the background after startup and periodically, even before the first document.
  Sign-in does not wait for this check. An unchecked connection is no longer reported as disabled;
  status panels show a readable connection state instead of a blank value.
- Discard AI credential replies from an obsolete Hub configuration and bound the internal request.

## [0.2.0] — 2026-09-08

### Added
- Personal workspaces and teamspaces for all departments, with explicit owner/editor/viewer membership,
  per-tab scoped sessions, a workspace switcher, membership settings and archival.
- General agreement intake: saved emails, PDFs, text and images. Text PDFs are read locally; scans
  remain documents for manual review. Reproducible pinned PDF bundle and licence notices.
- Explicit “no payment” and “no fixed expiry” terms for noncommercial/open-ended agreements.
- Scoped CSV/JSON exports and deliberate record moves carrying their supporting evidence.

### Security and migration
- Hub/app administration grants no automatic access to new personal/team contract contents.
  Every nested read/write, AI match, rule, diagnostic, export and notification checks the workspace.
- Bind pending uploads to their creator and space; recheck membership on every chunk/commit.
- Require a space owner to bind each trusted relay identity; archived/inactive spaces reject intake.
- Check source visibility for proposal/task assignment and require assignees to have existing access.
- Recheck source context after AI replies; reject invalid draft decisions without orphan records.
- Carry prior data/access into Existing contracts and freeze old administrator/editor IDs once.
  Offboarding excludes personal records and hides team-contract details from Hub administrators.

### Validation
- Backend permission/AI regressions, fresh-install and populated 0.1.0 → 0.2.0 → 0.2.0 upgrades.
- Stable signature checked against the committed baseline; generated Candid and browser bindings.
- Admin/editor/viewer frontend smoke, browser workspace/PDF checks and responsive layout checks.

**Operator action:** bind existing relay identities to a space during the upgrade window; see INSTALL.md.

## [0.1.0] — 2026-09-06

First release. Design and decisions: `docs/CONTRACTS.md`; acceptance regressions in
`tests/security.test.mjs` (`contracts: …`).

### Added
- **Records with terms and a revision.** Amount in minor units + currency + tax basis + interval,
  start/end, renewal rule and date, notice as months or days, last cancellation date and internal
  decision date derived with calendar months (month end, leap years, org time zone). Unknown stays
  unknown. Every write is atomic against the revision you read. Future terms for an agreed later
  change. Seats, holders (person ids) and unused seats.
- **Intake lane.** `intakeBegin → intakeChunk (≤ 1.5 MB) → intakeCommit` for trusted relay principals
  (kind `relay`, no session) and signed-in people (`.eml` parsed in the browser, or a pasted message).
  Dedupe by delivery id before bytes travel, and by message id + content hash at commit; documents
  reused by hash; files sniffed, capped (1.5 MB each, 10 per message, 400 MB total) and downloadable
  only with a session. Confirmed matching rules (sender address/domain, customer reference, subject)
  file a message to its contract.
- **The AI extracts, the backend decides.** One prompt version and a strict JSON schema: field
  allow-list, enums, bounds, candidate ids only from the offered ones, and evidence quotes that must
  occur verbatim in the message or document text. Anything else is refused with a note on the
  message, and the record never moves. Observations become proposals with old/new values; a value
  equal to the record's is no change. Routine invoices matching a confirmed active contract are filed
  without a proposal or a task. Without the `ai` lane everything else keeps working.
- **Field-wise decisions.** Confirm the ticked fields (as shown or corrected), reject the rest,
  pick the contract among candidates, or (staff) create a draft from the message. A cancellation in
  the mail is a proposal, never a status change — ending is a person's decision through the task.
- **Deadlines and reminders.** Tasks `decide` / `review` / `assign` rebuilt from the terms; reminders
  30/14/7 days ahead through the hub's notification lane with a persistent outbox, backoff and a
  visible failure list with retry. Snooze moves the task, not the deadline.
- **Roles.** Hub owner/admin = admin; the hub group `contracts-editors` (configurable) edits every
  team record; the responsible person and named viewers see their own; `restricted` records are
  visible to admins, the responsible person, the deputy and viewers only. Helpdesk has no special
  access.
- **Import and export.** CSV import with column mapping, preview and per-row report (existing
  vendor + product + reference is skipped, never overwritten; amounts in any common notation;
  responsible by address); CSV export with formula-safe cells; versioned full JSON export for admins.
- **Frontend.** Today · Inbox · one message (proposals, message, documents, filing) · Contracts ·
  Record (terms, proposals, tasks, messages, documents, seats, history) · Connection (status, relay,
  settings, import, export, log) · How it works. Shared topbar and bell, hash deep links for every
  tab, pickers for people and contracts, plain-language texts.
- **Relay** (`relay/`): a Cloudflare Email Worker (postal-mime, unpdf for text PDFs, chunked hand-in
  with sha256, retries, optional fallback mailbox, recipient allow-list) plus RUNBOOK. Deploying it
  is an operator step outside the kitchen install.
- Sample data (six fictional vendors) that comes and goes in one click; kitchen recipe `contracts`.
