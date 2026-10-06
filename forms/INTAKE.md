# Public intake and Desk handoff (alpha)

## For the operator

1. Create a form, or use **Publish & connect → Use appeal template** to create a
   separate draft. The template asks for contact email, affected resource and a
   reason; it does not import historical Jotform submissions.
2. Under **Publish & connect**, allow exact HTTPS embedding origins, choose the
   page-context keys you need and link your privacy notice. Copy the embed code.
   Fix its theme to dark or light when the host page has a fixed theme. The frame
   resizes automatically. Keep the direct-link fallback alongside it.
3. Context is explicitly supplied, displayed to the respondent, and labelled
   unverified. No parent URL is collected automatically. Never put tokens or full
   sensitive URLs in context. The origin list is a browser integration limit,
   not authentication or proof of the affected resource's ownership.
4. For Desk handling, require an email and disable respondent editing. In Desk
   **Customer projects → Project & integrations → Forms**, register the Forms
   backend, form number and request type. Use a request type without required
   extra fields. Set up the destination in Forms using the returned source number
   and Desk backend ID. Both setup actions require the respective app Admin role
   from Hub. These are native server calls; no API secret enters the embed.
5. Open the form, send a synthetic test response and check the response drawer's
   **Desk delivery** panel. The ticket carries readable question/answer content
   and unverified context. Desk owns assignment and resolution. An entered email
   never becomes an employee identity.

## Reliability and recovery

Accepted answers are stored before any cross-app call. New connected responses
are queued; older responses are not retroactively copied. Every minute, the worker
handles up to ten eligible deliveries. A timeout is retried after five minutes,
up to ten attempts. A definite Desk rejection blocks automatic retries. An editor
can retry from the response drawer after fixing the destination. Exact retries
use the same reference and payload; Desk keeps a non-content receipt to prevent
duplicates and recreation of erased tickets.

Pausing the Forms connection stops pending sends; disabling a Desk source rejects
future calls. An already dispatched call can still finish. Changing the source
never silently reroutes old responses. Reconnect the original source to resume
its queue. The first version does not map answers into required Desk custom fields.

Public submission retries use a 30-day receipt. After an uncertain network result, the browser freezes the draft and retries the identical payload. Browser reloads start a new
submission reference; there is no cross-device identity or reliable bot detection.
A hidden trap field, bounds, quotas and server validation reduce accidental and
basic abusive input; they do not replace a production anti-abuse gateway.

## Privacy and deletion

Retention is opt-in: 0 disables it; otherwise 7–3650 days from submission. A shorter
period takes effect after a seven-day grace period. The six-hour sweep deletes
answers, notes, context and any queued delivery copy. Explicit response deletion
removes the same local records. A delivered Desk ticket is a separate copy governed
by the project's retention/erasure controls. Deletion while a call is in flight
cannot recall a ticket already accepted in Desk. Handle both copies when processing
an erasure request, as well as backups and any exported notifications.

Forms never exposes the generated Desk customer-access secret. The response drawer
links staff to the authenticated Desk ticket. External email is **not enabled**;
see the [prepared relay contract](../docs/integrations/MAIL-RELAY.md). This release
does not yet replace Jotform's mail notification feature or verify recipients.

## For a decision maker

This adds an independently hosted intake form and moves case handling into the
existing support project, avoiding a second approval workflow. It is an alpha
integration, not full Jotform parity. Before replacing a live suspension appeal
form, test the actual hosting page/CSP, mobile browsers, abuse controls, delivery
recovery and team ownership. Host Forms outside the application whose suspension
or outage it reports. A platform-wide outage can still affect both.
