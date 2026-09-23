# Customer support in Desk

Create one **Customer project** per product or support audience. The support team works in Desk beside Internal support, with its own queue and conversations. Customers do not need a Hub account. They submit through the public form, website widget or your product backend and keep a private ticket link for replies and status.

This is an alpha for company-operated product support. It reuses the existing ticket handling, central roles and backups instead of another support service. No savings figure is claimed: hosting, gateway traffic, support work, release operation and abuse handling still have costs. Projects are logical access boundaries in one Desk installation; company administrators and infrastructure controllers are trusted across them.

## Operator workflow

1. Set Desk’s canonical HTTPS origin in Settings → General.
2. In Hub, give the support agents the **Desk Agent** role and put them in the product’s support group. Hub owners/admins and Desk Admins already manage all projects.
3. In Desk → **Customer projects → New project**, name the product, choose that Hub group and write a short customer-facing introduction. Blank group means admins only. Group membership does not grant the Desk Agent role by itself. Keep group names stable; review project configuration after renaming or deleting a Hub group.
4. Keep the form short. Name, email, subject and message are included. Optional fields can be short text, long text, choice, date or yes/no. Submitted field definitions are retained with their ticket when the form later changes.
5. Enable the public widget only when ready. Open the prominent **Embedding guide** in **Project & integrations**, or jump to **Embed & API**. Copy its embed code there or share the form link. For your own product UI, create a server API key with only the needed permissions.
6. Handle incoming requests in the project workspace. Assign to a project teammate, add an internal note, reply publicly, wait or resolve. First response target is 24 hours. Customer replies appear in the same conversation; private notes never appear in the customer API.

An employee who happens to use the same email as a customer does not inherit access to that customer request. Customer email is unverified contact information, never a login identity. Customer requests never fetch employee devices/contracts, trigger lifecycle flows, mirror conversation content to Slack or run AI triage. A generic project-activity notification can use Hub’s configured delivery.

Pausing new requests leaves existing conversations available. Disabling or rotating the public widget does not revoke server keys or private ticket links. Revoke keys in project settings; revoke/replace a specific customer link in the ticket. Replacing a link immediately invalidates its predecessor; save the new link before leaving the ticket. Staff authorization uses the existing Hub directory freshness lease (up to 60 seconds), not a promise of instantaneous propagation.

## Request types and workflows

Open **Customer projects → your project → Project & integrations → Request types & workflows**. Hub owners and Desk admins configure the types. Project agents can work requests but cannot change the configuration.

Each type has its own customer-facing name, description, fields, starting priority and response/resolution targets. Add up to 20 types per project. Customers choose a type in the public form; product backends send its `typeId`. The default type stays enabled and handles older integrations that omit `typeId`. Rename and configure it to match your product. Pause other types individually, or pause the entire project to stop intake.

Start with **Use refund template**, adapt it and save. Nothing is installed or enabled until you save:

1. **Support review** — verify the order and review eligibility.
2. **Refund approval** — explicitly approve, return for changes or cancel with a reason.
3. **Refund confirmation** — record the refund in your payment system and inform the customer.

This is a handling workflow, not a payment integration. Desk does not transfer money. The template does not decide your refund policy or legal obligations.

Configure up to 8 ordered steps with a name, optional internal instructions, a responsible Hub group, an explicit approval gate and up to 8 required checks. Reorder steps with the arrows. With no steps, the type uses Desk’s standard receive/work/resolve process. Targets count elapsed hours from submission, including waiting; 0 disables a target.

Leave a step’s group blank for the entire project support team. If you name a group, its members also need **Desk Agent** and membership in the project’s support group in Hub. The editor shows how many eligible project agents are in each chosen group and warns when none can handle the step. A workflow group never grants project access. Hub owners and Desk admins can act on every step. Queue notifications go to eligible members of the current step’s group and Desk admins. Approval is a recorded human decision; it does not require a different person from the previous step.

On a ticket, the current step is expanded and the rest of the path remains compact. Complete all required checks and any additional checklist items before advancing. Approval steps use **Approve & continue**, rather than ordinary completion. The generic status control cannot skip the workflow. Agents can still wait for a customer or partner; a customer reply resumes the conversation without advancing a step. Return one step for rework or cancel with an internal reason. Returning clears that step’s checks. Reopening restarts at step one and clears checks. Previous actions, including approvals, remain in the staff activity history.

Edits apply only to **new tickets**. Each submission snapshots its type, fields and workflow. Existing tickets, including those created before workflows were introduced, keep their handling process. Concurrent configuration and step changes are rejected with a reload message. Workflow progress and definitions stored on a ticket are included in the operator review export and erased with the ticket by the existing retention policy.

Customer schemas contain only enabled type names, descriptions and fields. Private ticket links expose the chosen type and simple ticket status/outcome; they never expose internal step names, groups, instructions, checklists or approval reasons. Workflows currently follow a linear sequence; conditional branches, automated payment actions and outbound workflow webhooks are not implemented.

## Embedding: widget and public form

Project settings generate a ready-to-copy snippet:

```html
<script src="https://YOUR-DESK/widget.js"
        data-project="PUBLIC_WIDGET_ID"
        data-label="Contact support" defer></script>
```

To preselect a type, add `data-request-type="TYPE_ID"` to the script. For a direct form or iframe, append `/TYPE_ID` after the public widget ID. This is a convenience selection, not an access restriction; customers can still choose any enabled type in the project.

The loader creates an accessible support dialog with an iframe. It does not read your site’s user/session data and does not contain a secret. Style is isolated with a shadow root. A direct iframe is also possible:

```html
<iframe src="https://YOUR-DESK/support.html#form/PUBLIC_WIDGET_ID"
        title="Customer support" referrerpolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        allow="clipboard-write" style="width:100%;height:720px;border:0"></iframe>
```

Your website’s content security policy must allow the script and frame from Desk. The support page uses its own stylesheet and local JavaScript, without Hub sign-in or third-party fonts. Customer capabilities stay in URL fragments, not query strings, and the page sends no referrer. Do not add analytics or third-party scripts to this page.

The form is **public** when enabled. The public ID only chooses a project. Exact HTTPS origin allowlists restrict direct browser API integrations; an embedded form executes on Desk’s origin, and non-browser callers can forge Origin. Neither CORS nor the public ID proves customer identity or prevents bots. A company needing authenticated intake should disable the widget and expose its own authenticated product backend with a secret key. Apply product account limits or anti-abuse controls there; Desk does not yet include CAPTCHA.

## Server API

Base URL: `https://DESK_BACKEND_CANISTER.icp.net/support/v1/projects/PROJECT_ID`.
Use a project API key in `Authorization: Bearer SECRET`, stored only on your backend. Browser requests carrying an Origin are rejected for this route; never embed the secret in a website, app bundle or mobile client. Keys expire after 1–365 days, show once and are stored as SHA-256 hashes. Create at most 10 active keys per project.

| Method and suffix | Permission | Meaning |
| --- | --- | --- |
| `GET /schema` | Any valid project key | Project name, revision, defaultTypeId, requestTypes and their custom fields |
| `POST /tickets` | `tickets:create` | Create one request; returns ID, key and private URL |
| `GET /tickets/{id}` | `tickets:read` | Customer-visible content of this project ticket |
| `POST /tickets/{id}/replies` | `tickets:reply` | Add a reply as the customer |


The top-level `schema.fields` remains the default type’s fields for older integrations. For a selected type, use `schema.requestTypes.find(t => t.id === typeId).fields`. Any type, project or privacy change increments the project schema revision. Fetch it before creating a new request; on HTTP 409, keep the customer’s draft, fetch the current schema and ask them to review changes. Retry an uncertain submission with its original exact payload and token: successful earlier submissions are returned even if the type has since changed or been paused.

Read/reply keys can operate on any ticket in their project if they know its ID. Your backend must authorize the signed-in customer against your own ticket-to-customer mapping. There is no list-by-email endpoint, and no API operation for internal notes, assignments, staff roles or Hub records. A reply key does not impersonate a support agent.

Example in a Node backend (keep IDs as strings/BigInts in systems exceeding JSON’s safe integer range):

```js
import { randomBytes } from 'node:crypto';
const base = 'https://DESK_BACKEND_CANISTER.icp.net/support/v1/projects/PROJECT_ID';
const headers = { Authorization: `Bearer ${process.env.DESK_SUPPORT_KEY}` };
const schemaResponse = await fetch(`${base}/schema`, { headers });
if (!schemaResponse.ok) throw new Error('Support configuration unavailable');
const schema = await schemaResponse.json();
const payload = {
  revision: schema.revision,
  typeId: schema.defaultTypeId, // or an enabled ID from schema.requestTypes
  clientToken: randomBytes(32).toString('hex'),
  name: 'Alex Example', email: 'alex@example.com',
  subject: 'Question about my order', body: 'Here is what happened…',
  fields: { order_id: 'O-123' } // only if this field exists on the selected request type
};
// Persist this exact payload for uncertain transport retries; treat clientToken as a secret.
const response = await fetch(`${base}/tickets`, {
  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
// Privately associate result.id with the authenticated product customer.
// Show result.url to that customer; never log it or the request's clientToken.
```

`clientToken` must be 32 cryptographically random bytes encoded as 64 lowercase hex characters. It is the private ticket capability and the creation retry key. Repeating the exact request with that token returns the existing ticket (200); first creation returns 201. A different payload with the same token returns 409. Do not derive tokens from customer emails, timestamps, sequential IDs or passwords. Rotated/revoked/expired capabilities cannot be recovered through the retry endpoint.

All custom field values are strings: booleans use `"true"`/`"false"`, dates `"YYYY-MM-DD"`, choices one exact configured option. Unknown or duplicate properties/fields are rejected. Schema changes return 409 until the current revision is used. Basic fields have limits: name 100, email 254, subject 160, message 8000 characters; each custom value 2000 characters, at most 12 fields.

Reply body:

```json
{"body":"More information about the issue","requestId":"ANOTHER_32_RANDOM_BYTES_AS_64_LOWERCASE_HEX"}
```

Replies are limited to 2000 characters. Exact reply retries with the same requestId return the current conversation without a duplicate. Using it for another message returns 409. Keep the requestId and original reply until confirmation. Use a new requestId for the next reply.

A 400 response means invalid input; 401 invalid key; 403 wrong permission or browser origin; 404 unavailable widget/ticket; 409 stale schema, closed ticket, paused intake or a conflicting retry; 413 excessive payload; 429 quota; 503 unavailable configuration/storage. Do not automatically retry permanent errors. For uncertain network errors, retry the identical payload with the same token/requestId. Gateway update calls may take several seconds.

## Custom browser integrations and private tickets

Public browser intake, when enabled, uses `/support/v1/widgets/PUBLIC_WIDGET_ID/schema` (GET) and `/tickets` (POST) with the same creation body and no secret API key. Add the product’s exact HTTPS origin to the project. Requests from disallowed browser origins do not receive CORS access. This is a public create-only endpoint, never a customer read endpoint.

Private links use `/support.html#ticket/TICKET_ID/SECRET`. The page uses `/support/v1/customer/tickets/TICKET_ID` and `/replies`, passing that capability in the Authorization header. A capability grants read/reply for precisely one ticket and expires 90 days after creation or replacement. The portal polls while visible every 30 seconds; it does not send email. Anyone holding the link can use it. Copy it only into a channel appropriate for the customer.

## Boundaries, retention and operations

- Maximum 30 projects; intake 30/hour and 200/day **per project**, shared by widget/API. Maximum 10,000 customer tickets and 100 MB of accounted customer submission/schema/reply bytes per installation; internal staff notes and existing Desk metadata have separate storage behavior. Quotas count accepted requests. Public ticket conversations accept replies while fewer than 100 total ticket events exist. Rate limit: one customer reply per ticket per 10 seconds. Quotas are conservative alpha limits, not a throughput guarantee.
- Automatic project retention, immediate admin erasure, temporary holds, customer/operator exports and a deletion journal are implemented. See the privacy and restore procedure below. Do not request payment data, passwords or sensitive documents in custom fields.
- This version has no customer email delivery, attachments, customer accounts, AI processing of external requests, automatic company/account matching, ticket transfers between projects or webhooks. The product backend may deliver the private URL through its own authorized channel. Internal employee support keeps its existing features.
- Public request caps reduce storage growth but cannot stop denial of service or targeted quota exhaustion. Monitor intake and pause the widget if needed. A production gateway/Cloud Engine must expose backend HTTP upgrade calls and honor browser CORS; verify the actual hosted route before launch. Keep public-page frame policies compatible with the chosen integration, and preserve the rest of the app’s security headers.
- API and ticket secrets are returned once and stored hashed, but canister administrators/infrastructure remain trusted for code and data. The design does not promise confidential computing or jurisdiction guarantees. Project data is included in Desk backups; no Hub schema, SCIM directory or Lunch sync contract changes are required.

## Privacy, deletion and backups

Open **Customer projects → your project → Project & integrations → Privacy & retention**. Automatic deletion is enabled for every project, including paused intake:

| Rule | Default | What starts the clock |
| --- | --- | --- |
| Completed requests | 90 days | Resolution, or closure if never resolved. Automatic closure does not restart it. |
| Open requests | 365 days | Last ticket update, including staff work or a customer reply. Automatic SLA reminders do not count. |
| Temporary hold | Explicit end date, at most 365 days per setting | A Desk admin records a short justification and duration. The original retention deadline still applies when it ends. |

Both project periods accept 7–730 days; they are product defaults, **not statutory GDPR deadlines**. Choose the shortest period justified by the support purpose and any applicable obligations. There is no “keep forever” switch. Reopening a request switches it back to the inactivity rule. A hold is for a documented exception, not a general replacement for a retention policy. Admins review its necessity; an extension is deliberate and the expiry is visible on the ticket.

A change to shorter periods requires confirmation and protects existing records for at least 24 hours. Upgrading an existing 0.11 installation introduces a one-time seven-day grace period; later upgrades do not restart it. Existing and future tickets then follow the project policy. Changing privacy settings also changes the public form revision so an outdated form cannot silently submit under a stale notice. Add the company’s HTTPS privacy-notice URL; it appears before submission together with the retention summary. Explain the controller, purpose, legal basis, recipients, contact and applicable rights in that notice. Support processing does not automatically require a consent checkbox.

The backend refuses staff, API and private-link access from the deletion deadline, even if a purge batch has not yet run. A background job checks every 30 seconds, examines at most 250 records and purges at most 50 per batch. Large backlogs and platform outages delay record removal from active storage; the settings page shows the last check and pending count. Expired tickets cannot be revived by reopening or extending their private link. The job also runs when nobody is signed in.

Deletion removes the contact, subject/body, submitted fields and schema, conversation and internal notes, tasks, approval, related links, any associated file entries, private-link hash and ticket-specific retry/rate-limit metadata. Accounted storage is reclaimed. Internal employee/lifecycle tickets and Hub identities are excluded. New Hub/Slack notifications only identify activity in the customer project: no customer name, email, subject, message or individual ticket link is sent. If upgrading an earlier 0.11 prototype that generated notifications, review those existing Hub/Slack copies separately; this release cannot withdraw already delivered messages.

### Access requests and immediate erasure

In a customer ticket, **Data & privacy** shows the scheduled deletion date. Hub-assigned Desk admins can download a privacy review package, set/release a temporary hold or erase the request by typing its exact ticket key. Erasure refuses a stale confirmation if the ticket changed. Active holds must be reviewed and released first. Agents cannot change project policies, export review packages, set holds or erase requests.

The review export includes customer contact data, the public conversation, current links/tasks, a hold justification and internal event bodies/metadata. **Review before disclosure**: notes can contain other people’s data. Secrets are excluded. Customers can also download their own submitted contact data and customer-visible conversation through their private link (`GET /support/v1/customer/tickets/ID/export`, same bearer capability). It excludes internal notes and staff identities. A supplied email is not verified identity; do not search-and-delete based on an unverified email alone. The company must authenticate and scope a rights request through an appropriate channel.

An erased creation token leaves only a digest plus expiry for 365 days, preventing an uncertain client retry from recreating the deleted request. Integrations must stop retrying on 409. After this window a reused token is no longer recognized; never reuse tokens. The separate deletion journal records ticket/project IDs, original creation time, deletion time and a fixed reason code for 365 days. It contains no names, addresses, messages or capability secrets, but treat these references as restricted operational data. No automatic anonymisation claim is made. The journal and retry markers are pruned in bounded batches. Intake pauses if the deletion journal reaches 50,000 records; existing requests can still be erased.

### Backups and restore procedure

**Active-data erasure does not rewrite historical canister snapshots, infrastructure copies, operator exports, customer downloads or messages already delivered elsewhere.** The operator must inventory these copies, define and enforce their retention, restrict access and handle relevant recipients. Hub → Backups rotates snapshots by count/schedule, not a guaranteed wall-clock expiry. Explicitly delete snapshots beyond the approved lifetime and check that schedules still run. Use a backup lifetime shorter than the 365-day journal window; archive a current journal securely outside the snapshot you might restore. A journal stored only in the same old snapshot cannot remember later erasures.

1. Export the current deletion journal from each customer project before a planned restore, or use the latest separately retained journal for disaster recovery. Periodically export it as part of your backup procedure; Desk does not automatically archive it elsewhere.
2. Arrange maintenance isolation for **all access to the restored backend**, including private links, public intake, API integrations and staff. Hiding a Hub tile or disabling intake is not sufficient. Vault’s normal restore can restart a running canister: do not use it as an automatic privacy-safe restore path. If your hosting setup cannot prevent access during reconciliation, expire/delete old snapshots instead of restoring them to the public service.
3. Restore under that controlled procedure and run the current Desk release. In project settings → **Backups & deletion journal → Reapply deletions**, import the newer journal and confirm. The backend checks this canister, project, ticket ID and original creation time; it refuses mismatches. Reapplying the same journal is safe, and a prior erasure overrides a hold resurrected from the snapshot. Uploads are processed in batches of 100; if interrupted, retry the unchanged journal.
4. Recheck current project policies and holds, allow overdue retention batches to drain, verify pending removal is zero and check a sample of erased private links before restoring access. Restoring a pre-0.12 release requires upgrading first; do not mistake the migration grace period for permission to reopen erased data.
5. Remove superseded snapshots and exports according to the approved policy. A journal replay is limited to erasures actually recorded in the retained journal; an old or incomplete journal cannot certify all historical deletions.

This feature supports data minimisation, storage limitation and rights handling. It is not a legal certification or a substitute for the company’s processing records, privacy notices, lawful basis, agreements, infrastructure controls and handling of exceptions. See the official [GDPR text (Articles 5, 17 and 19)](https://eur-lex.europa.eu/eli/reg/2016/679/oj) and the [EDPB principles](https://www.edpb.europa.eu/topics/key-gdpr-concepts/basic-principles_en).

## Verification

`tests/customer-support.test.mjs` covers positive/negative project permissions across ticket mutations, group revocation, isolated customer identities, scoped/expired/revoked keys, capabilities, schema validation, input/abuse caps and idempotent retries. Set `KEBAB_CUSTOMER_BASELINE` to a preserved Desk 0.10.0 build directory to run a populated upgrade followed by a second upgrade retaining customer data. Set `KEBAB_RETENTION_BASELINE` to a preserved 0.11.0 build for a populated retention upgrade. Retention regressions cover completed and abandoned requests, automatic hold expiry, private vs internal exports, confirmation races, erased submission retries and journal identity checks. Frontend regressions cover secret/content clearing, privacy confirmation, visible guidance, navigation races and a lost response during public submission.

The widget and documented iframe permit user-triggered privacy-notice tabs and JSON downloads. Preserve `allow-popups`, `allow-popups-to-escape-sandbox` and `allow-downloads` when applying your own iframe sandbox. The privacy link uses `noopener noreferrer`; ticket secrets never enter that URL.

## Embedding troubleshooting

- **No button:** confirm the public widget is enabled and the widget ID matches the current project. Load the script with `defer` and check your page’s console for a blocked script. Replacing the widget address requires updating embeds.
- **Blocked by your site’s content security policy:** allow the Desk frontend origin in `script-src` and `frame-src`. The iframe hosts the form; your product page does not need a secret API key or direct backend `connect-src` permission. A custom browser integration needs the support API origin in its own `connect-src` and an allowed HTTPS origin in Desk.
- **Origin not enabled:** enter the exact scheme, hostname and optional port, with no path or trailing slash. Production and staging are separate entries. Origin restrictions are browser controls, not protection against bots.
- **Form changed (409):** reload `/schema` and have the customer review the current fields/privacy notice before a new submission. Do not change the body/token during an uncertain network retry.
- **No reply email:** customers save the private ticket link; this release does not send email. Never put a server API secret in frontend code.
- **404 on a private link:** the link may have expired, been replaced/revoked, or reached the ticket’s deletion deadline. A deleted ticket cannot be recovered by replacing the link.
