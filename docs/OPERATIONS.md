# Operating kebab-stack

Updated 2026-09-18. These responsibilities remain even on a Cloud Engine.

## Before a pilot

Use test data and record the engine/subnet, backend and frontend IDs, controller
identities and module versions. Confirm who can change the engine and who can
upgrade each canister. Kitchen and Vault are co-controllers with broad technical
power; removing a person's Hub role does not remove their platform controller
key. Store recovery credentials outside the browser/device used day to day.

Run through installation, onboarding, an approval, device assignment, offboarding,
Hub outage and restore. Keep the existing IT process until those checks meet your
requirements. The current release has no promised capacity or service level.

## Identity lifecycle

Hub and bundled apps track people with stable person IDs. A rename preserves the
person's records and assignments; reissuing an address creates a new person and does
not transfer the previous holder's permissions or records. See [Person IDs](PERSON-IDS.md).
SCIM accepts renames to a free address and rejects a collision with another active
person. Each SCIM source owns its records and should have explicit mail-domain limits.
Pausing a source refuses its pushes; removing it removes its directory records and
triggers deactivation. Verify the employee's effective state in People after upstream
changes. External integrations can have separate identity and retention rules.

## Working in the Hub console

- **Overview:** current counts and items needing action. The setup checklist is
  collapsed once a workspace has people and apps; company SSO counts as configured
  sign-in. A passkey count is not a count of everyone who can sign in.
- **Operations:** permission-checked summaries and next actions across Desk, Trust,
  Assets, Contracts and Watch. See [dashboard coverage and limits](HUB-OPERATIONS.md).
- **People:** search the directory, open a person, inspect access and manage
  invitations or groups. Company roles and app roles are different: use **Permissions**
  for the six central apps; only an owner can change their policies.
- **Apps:** connections, menu entries and data sharing. Sharing changes are drafts
  until **Save changes**. The connect flow takes the six supported apps directly
  to central permissions; it keeps the existing access editor for other integrations.
- **Directory sync:** connected SCIM sources, optional Okta pull and manual-entry
  settings. Lunch Check-in keeps its existing connector filters and directory contract.
- **Settings:** company identity, Hub administrators, company sign-in, notifications,
  AI/assistants and external OIDC clients. Historical recovery-key grants are shown
  only when present; this UI release does not delete or convert them.
- **Backups**, **Apps → Updates / History** and **Activity:** operations and the audit trail.
  **How this hub works** explains these tasks and the current permission model.

App login and Hub menu launches show a dedicated handoff screen while the Hub checks
access and creates a one-time ticket. The console and employee menu stay hidden and
inert. Errors offer retry or return; a stalled Hub call times out after 30 seconds.
Direct app visits retain their hash route through sign-in. Assets, Contracts, Desk,
Forms, Trust and Watch share one login template and state controller.

## Access and recovery

The setup code grants first-run ownership. Give it privately to the intended
owner; do not put it in source, tickets, a public URL or a chat transcript. After
successful setup the backend refuses another claim. The Kitchen and Hub use
separate codes. Invite links are also credentials: share privately and revoke
unused invites. A login already linked to a different person cannot redeem an
invite to switch identities.

Person lifecycle changes respect identity rank: Helpdesk manages ordinary members;
admins manage lower roles; owners manage all roles. Bulk actions skip protected
identities. This also protects local activation, deletion and login linking.

Keep at least two usable owner logins and a recoverable controller identity.
A controller remains a break-glass owner. From the **Hub** project and the correct
environment, it can call `addAdmin` and `setAdminRole` for a verified replacement
principal. Confirm the identity out of band; possession of an email address in
the directory is not proof that someone owns that mailbox.

The manual kill switch affects every source record for a person. Apps enforce
current scope using complete directory responses, with a lease below 60 seconds
from request start. They pull every 30 seconds and fail closed after expiry.
Incoming IdP provisioning must first reach the Hub; a failed upstream sync can
still leave the Hub with stale source data. Monitor source status and last sync.
Pushes accelerate revocation but are not the sole enforcement mechanism.

Assets, Contracts, Desk, Forms, Trust and Watch use central Hub app roles only;
retained local bootstrap lists grant no access. Review global Hub administration
and explicit central app grants during offboarding. Non-suite integrations may
have their own authorization rules. Platform controllers remain outside this
application-level policy.

## Updates

Build from an isolated clean checkout with pinned npm/Mops dependencies. Keep
frontend placeholders in Git. `npm run check` verifies builds, stable compatibility,
bindings, versions, shared copies and local regressions. A compatible `.most`
proves structural state compatibility, not correct business behavior.

For an existing deployment, compare against its actual deployed commit/signature,
then test an upgrade with representative state. Save a snapshot before deploying.
Do not replace the committed deployed `.most` baseline until the corresponding
backend deploy succeeds. Keep a release ledger of commit, engine, canister IDs,
module hashes, versions, snapshot IDs and test result.

Build and publish one tested format-2 bundle, then apply it through **Apps → Updates**
or the same `release.mjs update` executor. Both backend and frontend are snapshotted;
backend upgrade and frontend publication remain separate steps. A frontend failure
leaves the new backend in place: inspect **Apps → History** and retry the same release.
Verification compares the complete installed artifacts with the published bundle,
not just a version string. Checksums do not protect against a compromised trusted
release-store controller. See [the release workflow](../kitchen/INSTALL.md).

Upgrade the installer with `upgrade-installer` only when no job is active. Do not
run deployments or rollback commands concurrently from multiple editors.

## Backups and restore

Vault snapshots individual canisters and may stop them briefly. Backend and
frontend snapshots do not form an atomic suite-wide checkpoint. Define your
acceptable data loss (RPO) and recovery duration (RTO); there are no measured
values supplied by this project. Scheduled backend snapshots are not off-site
backups. Check successful completion and periodically restore into a disposable
test environment. Preserve necessary CSV exports separately.

The UI enables a safety snapshot before restore; the API permits disabling it.
Keep it enabled unless you have deliberately accepted losing the current state.
A snapshot restores code and state of that canister. Coordinate compatible app,
Hub and frontend versions, and expect sessions/tokens/configuration from the old
state to return. Reapply offboarding and permission changes made after the snapshot
before reopening access. Review and revoke credentials following a security-incident restore.

If Vault reports that a start or operation could not be confirmed, inspect the
canister in the engine Console/CLI before retrying. A timeout does not prove the
platform did nothing. Keep snapshot IDs and remaining failed-install canister IDs
until cleanup is confirmed; never blindly delete an adopted or in-use canister.

## External services and privacy

AI access is optional. Only an owner can explicitly grant an app the `ai` lane;
manifest refresh does not grant credentials automatically. The app receives the
API key and calls the configured provider. Review what ticket text/images leave
the engine, vendor retention and API spend. Revoking the lane cannot erase a key
already disclosed to a malicious app: rotate it at the provider if needed.

Personal AI assistants (hub 0.19; the 0.18 switch was frozen on and its tokens were retired)
are off until an owner switches them on under Settings → AI. A person then connects a chat
assistant on their own computer from the menu (one-time code, 10 minutes) and receives a
30-day token — stored hashed, at most ten per person — that only mints app tickets the person
could mint themselves; lock-out, hidden tiles and the 60-second lease apply unchanged, a
rename carries the token along, a re-issued address kills it. Staff see every connected
assistant with its last use and can disconnect one; switching the lane off disconnects all
of them for good. Colleagues an assistant can look up are exactly those the person's own apps
show in their pickers. Every assistant sign-in is journaled (kind `assistant`). A token is
worth the person's browser session for its lifetime — a lost or shared computer means:
disconnect. The assistant server parses app interfaces from canister metadata and never
executes code fetched from an app. Setup and
contract: `docs/agent/mcp.md`.

Incoming Google/Okta SSO requires a signed RS256 ID token, one matching audience,
valid time claims, nonce bound to PKCE and a verified email. Tokens with unverified
mailboxes are refused. Test your tenant configuration. Outgoing OIDC does not
assert `email_verified`: directory enrollment does not verify a mailbox. External
clients must verify tokens and set their own session/revocation policy.

Trust's agents use the configured HTTP gateway. Treat generated installers as
sensitive: they contain the enrollment secret. Posture is reported by the agent;
Trust is not an independent attestation of the endpoint. Since Trust 0.7, software
updates and removal run through the company's deployment tool, with pinned
artifacts and explicit verification. Removing a device in Trust blocks enrollment
but does not uninstall its agent. The old self-update and decommission feeds are
retired. Follow [the deployment guide](../trust/INSTALL.md), including the macOS
background-item profile before installation. Assets supplies device ownership
through its explicitly allowed connection.

People have one stable id each (hub 0.17). An address change at the source is applied by
the hub in one step (journal kind `persons`); an address re-issued to a newcomer seals the
previous holder — check the journal after HR imports if someone unexpectedly lost a role or
group seat, and never move a person from "added here" to SCIM by deactivating the local
record first (push while it is still active, then deactivate; otherwise the pushed account
is a new person). Apps pick the id up on their next directory refresh.

Forms' public fill pages accept anonymous writes: 600 submissions per five minutes
across all forms, 5 000 per form, 50 000 in total, answers capped at 64 KB. Respondents'
edit tokens are client-generated secrets; a leaked edit link lets its holder change that
one submission while the form is open. Review who owns a form before offboarding — the
hub's ownership view lists forms per person and reassigns them.

Ship the Bug stores only what a player chose to publish (distance, zone, board name) plus
an anonymous throw counter; private runs never leave the browser. A player removes their
own scores from the scoreboard; an admin can reset every board for a new season. The
canister rejects implausible runs and rate-limits submits, but the game runs in the
browser — treat the boards as a social feature, not a record.

Assets can sell devices (0.7.0): invoices with a Swiss QR-bill come out of the register's own
gapless number range — agree that range, the VAT treatment and the price rule with finance before
the first sale, and hand every invoice and credit note to them (Sales → Export for finance). The
buyer signs the hand-over terms by accepting them online with their own sign-in; staff cannot accept
for a colleague. Invoices and credit notes are business records: they stay in the register for good,
the PDF archived is the one handed out (hash on the record), the buyer's postal address remains in the
sale record and archived invoice. Selling below fair value to an employee can count as pay in kind — an HR/finance
decision the app records but does not make.

Assets can read Apple Business Manager (0.8.x): the private key Apple issues stays on the admin's
machine — the browser signs one client assertion (ES256, 180 days, Apple's maximum) and the canister
stores only that; it is traded for one-hour tokens and only read endpoints are called (devices,
device-management services). The assertion is still a bearer secret for those 180 days (stable
memory, vault snapshots): create the API account with a role that can read devices and nothing more
(Apple's Read Only cannot), and revoke the key in Apple Business Manager if the canister is ever
exposed — that kills every assertion at once. Renewal is a human step every ~6 months (Settings card
warns two weeks ahead). A sync runs every six hours; the Apple page shows the gap between what Apple
says the company owns and what the register knows.

Contracts keeps vendor mail: text, headers and files (1.5 MB each, 10 per message, 400 MB in
total) behind the session, plus the AI's proposals with the quoted evidence. Only listed relay
identities hand mail in (Connection → Relay; remove one to kill it at once); anyone signed in can
upload a saved message. The AI reads against a daily budget you set and its answers are checked
(schema, allow-lists, quotes that must occur in the text) — a refused answer leaves a note on the
message, never a change on the record. Confirmations are a person's act and atomic against the
record's revision; a cancellation in a mail is a proposal, ending is decided through the task and
the app never contacts a vendor. Reminders carry title and link only and sit in a retrying outbox
(failures under Connection → Status). The relay is a Cloudflare Email Worker that changes where a
company address is delivered: deploy it deliberately, on a domain whose MX is not in production
use, with the fallback mailbox set (`contracts/relay/RUNBOOK.md`).

Slack notifications and domain checks use external APIs. Outbound calls may fail
or be rate-limited. There is no durable retry queue covering every integration.
Activity logs are not an independent immutable audit archive. Keep an incident
process and determine retention/export requirements before production use.

## Software releases

Use **Hub → Apps → Updates** to review and apply published suite releases, and **History** to inspect operations. The operator [release workflow](../kitchen/INSTALL.md) publishes one immutable bundle for both Hub and CLI. Do not separately modify or stamp deployed artifacts. An empty/unavailable catalogue is a failed check, never “everything current”. Lunch and external integrations retain their own update process.

## Directory follow-up in Desk

Unexpected deactivations create private account reviews or update an existing
offboarding. Review source/effective access, then confirm departure or record why
it is not a departure. See [Lifecycle](LIFECYCLE.md) for limits and recovery.
