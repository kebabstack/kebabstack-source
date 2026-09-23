# Service status in Desk

Status: **Desk 0.23.0 alpha**, deployed to the workspace on 19 September 2026. Communicate internally or publicly
without exposing tickets, the on-call roster or response notes. This is publication,
not measured uptime or verified paging. Keep an existing communication route during
pilot use.

## Operator workflow

1. Open **On-call → project → Status page**. A Hub-assigned Desk administrator
   selects a title, description, address and project services. Pages start disabled.
2. Choose **People signed in to Desk** for the active Desk workspace, or **Anyone ·
   public internet** for anonymous access. Internal readers need no Agent role;
   private incident access stays scoped. Review the title/description, then enable.
3. Check services and confirm operational status for 1–168 hours. Without a current
   confirmation, the page says **Status unconfirmed**. Active incidents override green.
4. **Publish a notice** requests separate audience-specific text and affected services.
   Review before submitting. An optional incident link stays private: titles, notes,
   identities and alert bodies are never copied. Existing project responders can publish.
5. Append investigating, identified, monitoring and resolved updates. Resolved notices
   are final. Withdraw mistakes to remove them from readers; operator history remains
   until retention. Previously downloaded content cannot be recalled.
6. Maintenance needs start and expected end. It affects status at its scheduled start
   and stays affected past its estimate until a person publishes completion. The page
   labels overdue completion instead of silently returning to green.

Changing audience starts a fresh publication generation. Old internal notices cannot
become public by changing settings. Confirmations reset; history remains private in
project management. Disabling removes a page from anonymous reads and workspace lists.

## Where people find it

- Employees: **Service status** in Desk. Each enabled page shows up to three recent
  notices, active ones first, and the latest update for each.
- Public: `https://<desk-frontend>/support.html#status/<page-address>`. Use **Open
  public page** for the link. No Hub sign-in is needed.
- Customer intake: an enabled public page attached to its on-call project adds a
  status link and indicates known active issues before submission. Workspace-only
  pages never enter the anonymous widget schema.
- Public JSON: `GET https://<desk-backend>/status/v1/<page-address>`. No API key,
  no private fields, `Cache-Control: no-store`; private/disabled pages return 404.
  Alert-source keys cannot publish notices.

The existing `support.js` backend-ID patch covers this page. Include `service-status.js`
and `service-status.css` in the standard release. Public reads do not need Hub
availability but still depend on Desk and its hosting.

## Retention, limits and expectations

Public means anyone, not a secret-link audience. Keep personal details, confidential
findings and sensitive incident text out of publications. Writers use Hub identities
and existing project access; there are no new local accounts or permissions.

Notice history defaults to 90 days, configurable 30–365 days after the latest update
(or scheduled maintenance end if later). After a policy change, physical deletion
has a seven-day grace; expired notices disappear from reader views immediately.
Operational confirmations contain a staff identifier, expire visibly, are overwritten
on reconfirmation and removed when the audience changes. Planning, incidents,
statements, customer tickets, backups and exported copies have separate retention.

A project retains at most 50 notices with up to 12 updates of 1000 characters each.
A full timeline needs a new notice. There are no attachments or subscriptions in
this version: no email, SMS, push, uptime percentage or automatic/AI publication.
The public page refreshes about once a minute. A failed refresh replaces the display
with **Status unavailable**. Revocation is not instantaneous on already open or
externally cached copies.

## Decision and pilot

Desk combines operational context with customer communication while keeping public
text separate. It does not replace an independent emergency status host when your
recovery policy requires one. A status page and service on the same Cloud Engine
share a failure domain.

Test audience switching, failed refreshes, expired confirmations, overdue maintenance
and an update/withdrawal cycle before relying on it. Retain a fallback communication
channel. Compare time spent preparing/publishing similar incidents before claiming
savings; no particular labor or platform-cost reduction is guaranteed.
