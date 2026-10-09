# Contracts — agreements of every kind, costs, licenses and renewals

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

App roles are managed exclusively in [Hub → Permissions](../docs/APP-PERMISSIONS.md). Active Hub owners/admins and per-app Admins can see and manage all app content. Employees retain their own and explicitly shared content; Watch requires an explicit Viewer/Admin grant by default.


Version **0.7.1** makes the daily workflow **upload → review → save → stay ahead of renewal**.
The overview shows current annual recurring cost, upcoming decisions and unassigned licenses.
The SaaS table brings tool, owner, license count, dates, cancellation deadline and auto-renewal
into one view. Personal and teamspaces retain their existing access rules.

## Start with one contract

1. Open Contracts from Hub and choose your workspace. Personal is yours alone.
2. **Upload contract**. AI reads the original PDF/image or email using the configured Hub model.
3. Review **Software**, **Cost**, and **Renewal & cancellation**. Choose an owner from Hub.
   Additional commercial fields and source evidence remain available on demand.
4. Save once. Active tracking is selected explicitly in the review; uncheck it for an offer or
   draft. Saving never signs, pays, cancels or renews the actual agreement.
5. In **Settings**, choose renewal recipients and follow-ups. In **Management report**, select
   a year and download CSV or print/save PDF.

## Trash and permanent deletion

Delete first moves a record or inbox document to **Trash**, where it can be restored.
**Delete permanently** removes one selected item after confirmation. It requires current edit
access to that item and workspace, and the item must still be in Trash when confirmed.

Deleting a record removes its linked documents, license key, stored price history, proposals
and reminders. Deleting only an inbox document keeps the saved contract fields. Files referenced
by another document are kept until their last reference is deleted. The operation cannot be
undone in Contracts; a minimal operator deletion log remains. Previously delivered Hub/Slack
notifications, downloaded exports, source emails and separately managed snapshots/backups are
not recalled or erased. Permanent deletion does not cancel a vendor subscription.

## Document review notifications

When AI extracts new details, the notification asks you to review and save them. It does not
mean that reading or saving failed. Contracts rechecks pending review requests before handing
one to Hub, including retries queued by older versions. Filed, ignored or trashed documents,
completed proposals and superseded assignments no longer produce a review notification.
Already handed-off Hub/Slack messages remain in notification history; opening one shows the
current document status. Renewal reminders are separate from these review requests.

## Renewal reminders and Hub people

Default reminders are **90, 60, 30 and 7 days before renewal or expiry**, plus a one-time overdue
notice. A cancellation deadline is also checked 90 days ahead, covering long notice periods.
The background check runs after a fresh directory pull, then every six hours. A late first
observation sends the most relevant warning instead of a backlog of every missed milestone.
Workspace owners select the contract owner, workspace owners, Hub admins/owners and optional
Hub groups. A recipient must already have access to that contract. Add the appropriate IT
ordinary reviewers as teamspace members when they should oversee that space. App admins already have access to all content. The app URL and Hub `notify` lane must be configured; Slack delivery uses Hub's
existing bot and each recipient's Slack preference. Connection status shows failed deliveries.

The Hub directory supplies active people and their groups. In a record's **People & licenses**
view, assign people directly or select groups. Group rosters update from the directory; direct
and group membership is deduplicated. An assignment records license allocation, not permission
to read the contract or key, and does not provision a seat in the vendor's service. Inactive direct
holders remain visible for cleanup. Only groups with active directory members are selectable.

## Costs and management reports

Annual run rate annualizes the prices of records marked active/cancelling: monthly ×12,
quarterly ×4, yearly ×1. Offers, keys and billing documents are excluded. Missing price,
currency or frequency is reported instead of assumed. Recorded dates and subscription status
need to be kept current; the app does not infer that an expired contract renewed itself.

Historical accrued costs are **estimates**, prorated across known contract dates and saved price
changes, capped at today. The first known price applies from its stated contract start; subsequent
changes apply from the time they were recorded. Earlier undocumented changes cannot be reconstructed.
Archiving a subscription retains its recorded cost history. Separate invoice/receipt totals show
recorded billing documents for their document year; they do not prove payment and may need
reconciliation. Currencies and tax bases remain separate; there is no exchange-rate conversion or silent
addition of net and gross prices. Exports are scoped to the currently selected workspace.

## License keys

**License keys → Add license key** stores the key, tool, vendor, owner, license count and optional
expiry. A key is restricted to its owner, named viewers and that workspace's owners. Explicit
reveal is audited and the browser hides the result after 20 seconds. Key values are separate from
contract fields and absent from AI inputs, ordinary queries, audit text, reminders and standard
CSV/JSON exports. This is application access control, not end-to-end encryption against hosting
controllers. These exports are not a backup of secret values.

## Missing vendor terms

When renewal or cancellation terms are missing, the review can automatically ask the configured
AI for an official vendor terms URL and fetch that public page. You can supply a direct URL if
it cannot identify one. Only vendor/product names are used for URL discovery; private contract
contents are never sent to the vendor website. The retrieved text is read by the configured AI;
quoted evidence must appear on the page. The result includes source and retrieval time and stays
separate until **Use as a reviewed suggestion** is selected.

This is a best-effort public page check, not a web search index or legal verification. Websites
requiring sign-in, JavaScript, redirects or oversized responses may need a direct terms URL or
manual review. Current public terms may differ from a signed order or the terms at purchase.
Unknown conditions remain unknown. AI cannot guarantee which legal terms apply.

## Access belongs to a workspace

| Area / role | Access |
|---|---|
| Personal | Its active owner and all app admins. Not shared with other employees automatically. |
| Teamspace owner | Reads its records, manages membership, settings and archive status. Keep two owners for continuity. |
| Teamspace editor | Maintains accessible records, incoming documents, proposals, tasks and imports. |
| Teamspace viewer | Reads and exports accessible content; cannot change it. |
| Shared Contract intake | Active Hub admins and Hub owners can review and distribute. Contracts Admins assigned in Hub also have access. |

The workspace selector lists your personal workspace, the teamspaces you belong to and (for app admins) the shared Contract intake and the pre-workspace **Existing contracts**. App admins reach everything else — other people's personal workspaces that hold records, and teamspaces they do not belong to — from **Settings → All workspaces**; empty personal workspaces are not listed. A teamspace owner can delete an empty teamspace from Manage workspace; records, including the trash, must be moved or deleted first, and sessions bound to the space end.
| Hub / app administrator | Configures the Hub connection, AI lane and app settings. Can access all personal/team content, including restricted records. |

A restricted record further limits access to its responsible person, deputy and named viewers,
plus that **space’s owners** and app admins. Those people must already belong to the space. Ordinary workspace
records are visible to every member. An unfiled upload in a team inbox is shared with that team.

Every content API is scoped on the backend, including files, rules, proposals, exports and diagnostics.
Each tab gets its own space-bound view of the same Hub session; switching another tab does not change it.
Removing a member blocks subsequent calls immediately. Hub account deactivation and loss of app access
follow the existing 60-second directory lease. Previously downloaded information cannot be revoked.
These are application permissions, not end-to-end encryption against hosting controllers. With AI
enabled, original supported files, source text and allowed candidate context are sent to the organisation’s configured provider.

## Existing records and upgrades

Historically, version **0.2.0** kept pre-upgrade records and evidence in **Existing contracts**. The previous
administrator/editor person IDs are captured once; existing explicit responsibility and visibility
were retained. Since **0.8.0**, central permissions supersede frozen local administrator/editor grants; Admin means all content. Existing responsible people and legacy
space owners may move individual records, including their evidence, into spaces they own.
An owner can also move a record between two spaces they own. Moving shared evidence is refused.

Archived spaces remain readable; intake and content changes stop.

## AI is optional; documents arrive by upload

AI access is checked in the background after startup, then at most once every five minutes. This
checks the Hub configuration without sending a document or making a billable model request.
Without AI, manual records, documents, terms, tasks and reminders work. With the Hub `ai` lane,
AI reads original PDFs (including scans) and PNG/JPEG/WebP/GIF images through the configured
provider. It recognises contracts, subscriptions, invoices and receipts and suggests editable
details. A separate Hub vision model is used when configured. Anthropic Messages and OpenAI
Chat Completions file/image formats are supported; the model must support the supplied format.
Visual quotes are labelled as AI readings for human review. Text quotes are checked against
source text. AI cannot sign, pay, renew or cancel anything.

The review keeps contract dates, renewal/notice terms, seat counts and prices in editable
fields. **Purchase & billing details** adds the quote/order reference, customer PO, payment
terms, billing contact, unit price period, renewal term and commercial conditions. A monthly
per-seat price is separate from an annual invoice total. The saved record keeps these details
with its original; edits check the record revision and workspace permissions. CSV and JSON
exports include them (JSON schema version 3).

PDF text can follow internal drawing order instead of the visible layout. The reader now
orders text by visual rows. When AI reads a supplied original but its quote cannot be matched
to extracted text, the field stays as a **Check original** suggestion. It cannot qualify for
automatic routine-invoice filing. Review it against the document before saving. Unknown or
foreign evidence is refused. For an older incomplete extraction, choose **Read again with AI**:
a successful reading replaces older open AI suggestions while keeping evidence and decisions
in history. Failed rereads keep the previous suggestions; confirmed records are not rewritten.
The review shows queued/reading state and elapsed time until completion. Untouched forms
refresh automatically; your edits are kept until you choose the new suggestions. If progress
cannot be refreshed, **Check progress** only reads status and does not start another AI call.
Transient timeouts remain queued, with automatic retries after 30 and 60 seconds (at most
three attempts). Configuration errors stop immediately. Earlier suggestions remain available.
The compact AI response retains the same facts and evidence. Sonnet 5 uses medium effort for
extraction to reduce latency; the native PDF/image input and configured provider stay the same.
An HTTP outcall has its own hosting deadline, so a longer UI wait does not extend that deadline.
The AI wire format names currency-unit amounts explicitly (for example USD 9339.84, not 933984
cents). A detected 100× discrepancy from a quoted price leaves that field for review instead
of displaying an inflated amount; other supported facts remain available.


Delete an inbox item or saved record to **Trash** to remove it from active work. Restore is
available in the same workspace. This does not permanently erase originals or change access.

Since **0.14.0** there is no mail relay: documents reach a workspace by upload (PDF, image, text or a saved
.eml) or pasted text from a signed-in member. Nothing is sent or received by e-mail; reminders go through the
Hub to Slack.

## Costs and practical limits

The aim is to replace a separate spreadsheet or contract register for teams that can work within
these limits. Compare avoidable SaaS fees with Cloud Engine hosting, AI usage, optional email routing,
and the time required for setup, review and operation; savings depend on those actual costs.
This is an alpha contract register, not an e-signature, legal-advice, payment or ERP product.

Files: **1.5 MB each**, 10 per message, 400 MB total. Keep originals below **1.4 MB for AI reading**: base64 and prompt overhead count towards the platform’s 2,000,000-byte request limit. Larger originals remain stored but may need compression for AI. An unreadable, encrypted or oversized original needs a clearer/smaller copy. Browser PDF extraction: 50 pages and 60,000
characters maximum; text truncation is disclosed for review. Mail: 16 MB local `.eml` input,
200 KB submitted message text, 300 intakes per hour across the app. Default AI budget: 200 calls/day.
Dates use an organisation-wide fixed timezone offset, not automatic daylight-saving rules.
CSV and JSON exports contain only the selected space’s visible data. JSON identifies the space and
includes document metadata, not document bytes or a full-instance restore package; download files separately.
Personal data remains inaccessible after offboarding unless the person is reactivated; appoint
multiple team owners before someone leaves.

## Development and operations

[INSTALL.md](INSTALL.md) · [CHANGELOG.md](CHANGELOG.md) ·
[AI/API instructions](../docs/agent/contracts-actions.md) · [design history](../docs/CONTRACTS.md).
The backend uses the pinned Motoko compiler and existing persistent state contract. Before deploying,
check the candidate stable signature against the committed baseline and run the upgrade regression.

The browser PDF bundle is pinned through `tools/pdf-text/package-lock.json`. Rebuild with:

```sh
npm ci --ignore-scripts --prefix contracts/tools/pdf-text
node contracts/tools/build-pdf-text.mjs
```

## Document-first intake (0.4.0, simplified in 0.15.0)

Since 0.15.0 the only path for a document is upload → check → record: the review opens directly, one click saves and opens the record, and the inbox entry then reads "Saved as <contract>". Since 0.16.0 the same review also updates an existing contract ("Save as: an update to an existing contract"): the record is preselected when the document is linked, named by the AI or added from the record's Documents tab, today's values show as placeholders, filled fields replace them, and the document is attached. A contract without paperwork is entered with **Add by hand**. "Suggested changes" remain as history and for suggestions made on a record.

**Add contract** starts with a PDF, text file, saved email or image. The original is stored first;
the review page shows AI details and lets you complete missing values before a single atomic
save creates the record with its document and selected tracking status. A workspace owner can choose another owned workspace
as the destination. Existing-contract suggestions keep their revision-checked review flow.

For a shared address, use the built-in **Contract intake**, available to current Hub admins
and owners, then distribute reviewed records. To route a later email to an existing private
or team agreement, choose **Move document there for review** before matching it in the
destination. Transfers require ownership of both spaces and carry the original evidence.
AI uses complete original supported files, bounded supplementary text and available thread
references. Large groups of attachments require multiple model calls within outcall limits.
Visible signature marks and reported signing remain unverified suggestions, not automatic
activation, proof of identity or digital signature verification.

## Person context in Desk

Agents can open permission-checked summaries of related employee records in Desk.
See [employee context and directory follow-up](../docs/LIFECYCLE.md) for the workflow,
data boundaries and rollout. App roles remain managed in Hub.

## Hub Operations

This app contributes aggregate-only, Admin-authorized summaries to Hub → Operations. See [definitions, access and freshness](../docs/HUB-OPERATIONS.md). Individual records remain in the app.

## Contract types (0.13.0)

Every contract shares the same core: counterparty, product or agreement, reference, responsible person and deputy, visibility, status, confirmed terms (amount, interval, start, end, renewal rule, notice rule, last cancellation date, internal decision date), documents, tasks and history. A **contract type** adds fields of its own. Admins define types under **Settings → Contract types**: each field has a key, a label, a kind (text, number, date, choice, amount, yes/no, person), whether it is required, whether it shows in the list, and for dates whether it triggers reminders. Starters: SaaS / Subscription (seats and license holders), Datacenter / Colocation (site, racks, power, bandwidth, SLA, access-list owner, access review date), Telecom / Connectivity, Hardware lease / Maintenance, Services / Consulting, Rent / Real estate, Other. Built-in types can be edited and disabled, not deleted.

The record shows the type and its details beside the terms; the Contracts list shows the type and the fields marked for it, filters by type and searches those fields. New contracts pick a type in the editor. When a document is uploaded, the AI reading classifies it into one of the types by subject matter (never SaaS by default) and proposes the type's field values (`contractType`, `type:<key>`); the review screen shows the type (changeable) with its fields above the shared terms, hides seats for types without seats, and files everything with one **Save contract**. If no type fits, the AI proposes a new one with fields; an admin creates it from the review with one click and the values already read are kept. **Read again as the selected type** forces a type the AI missed. A person field accepts an e-mail and is stored as the directory id. Invalid type values are refused before anything is written. The sidebar reads Overview · To do · Contracts · License keys · Inbox · Settings; the Contract types card sits on the Settings page next to the renewal reminders (Hub admins). Offboarding in Desk asks about seats only for types that have seats; a person named in a type field appears in that person's context in Desk.

## Reminders (0.14.0): one schedule per workspace

Each workspace sets its own reminder policy under **Settings → Reminders**: the marks (days before, default 90, 60, 30, 7), whether reminders are on, and who hears them (responsible person, workspace owners, Hub admins, extra Hub groups; the deputy always). The policy drives all three reminder kinds of that workspace: renewal and cancellation deadlines, dated type fields marked "remind", and task due dates (tasks use the marks at or under 30 days, else 7). Every message starts with the workspace name, so IT and PfOps tell their deadlines apart. There is no global schedule any more; the global settings keep only the decision lead (how many days before the cancellation date the internal decision date falls), time zone and AI budget. Delivery: the Hub notification lane → Slack direct message from the Kebabstack bot; a person who mutes the bot still sees the reminder in the Hub inbox. No e-mail is sent.

Marks run against the **last cancellation date** when the record has one, otherwise against the renewal or end date. Recipients: the policy's picks (responsible person, space owners, Hub admins, groups), always the deputy, and the register's admins when nobody in the space is active. Auto-renewing contracts whose renewal date passed roll forward by their billing interval with an audit entry. A cancellation date typed by a person is kept; a computed one follows changes of the renewal date, the notice rule and the lead-days setting. Reminders do not depend on the app address; without one the notification carries no link.
