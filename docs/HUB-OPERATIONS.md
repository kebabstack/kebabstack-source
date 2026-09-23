# Hub Operations

Status: work and TV views implemented locally in Hub 0.29, with Desk 0.15,
Assets 0.14, Trust 0.8, Contracts 0.10 and Watch 0.8. Historical trends are planned.
Implementation/test status is separate from production deployment.

## The operator's workflow

Open **Hub → Operations**. Five connected apps contribute current summaries.
A short **Where to focus** panel highlights one follow-up per app. Open that app
to investigate and act; tickets remain in Desk, custody in Assets and terms in
Contracts. Operations never changes a device, completes a departure or renews a
contract. It does not create another task list.

A Hub console user needs an active person identity and central **Admin** access
in each contributing app. Active Hub owners/admins inherit app administration.
Helpdesk does not inherit fleet/company access: only apps explicitly granting that
person Admin contribute. Employees keep their existing personal workspaces.
Bootstrap controllers without a linked active person cannot read these totals.
Configure access under **Hub → Permissions**, never in Operations or the source.

The view refreshes once per minute while visible. Sources load independently;
failed checks replace old totals, and browser snapshots expire after 90 seconds.
An empty or unavailable source is not counted as healthy. Returning to a hidden
tab rechecks access before showing totals. Connector and policy changes during a
request invalidate the reply. A source also requires its existing fresh directory
lease (at most 60 seconds); upstream IdP provisioning latency is additional.

## Definitions

| Source | Included | Interpretation |
|---|---|---|
| Desk | Internal unresolved/unclosed tickets, unassigned tickets, breached response/due targets, directory reviews and confirmed offboardings | Customer-project tickets never contribute. A disabled account is a review, not proof of departure. Recent lifecycle processing must be verified separately. |
| Trust | Real enrolled devices, fully assessed devices, verified average score, current failures and unverified devices | Samples excluded. Score averages the per-device percentage of passing applicable checks only where all applicable checks have current, successful observations; current failing checks lower the score. Missing/stale/error/no-check evidence remains unverified. This is enrolled-fleet coverage, not proof that all company hardware is enrolled. |
| Assets | Unarchived inventory, assigned hardware, in-stock unassigned hardware, open offboarding handovers, received items in preparation and unfinished sales | Every hardware kind counts. In-stock excludes tracked open handovers. IT must record preparation; a return alone is not reuse readiness. Paid sales remain open until physical handover. |
| Contracts | Visible active/cancelling contracts across all admin-accessible spaces; upcoming and overdue decisions, missing decision dates and missing/inactive owners | Uses the recorded internal decision date (including existing term-derived dates). Excludes trash, billing documents, offers and license-key records. Unknown dates do not become zero-day deadlines. Indefinite/non-renewing agreements do not require a renewal date. No currency addition or claimed vendor usage/savings. |
| Watch | Enabled domains, existing monitoring alerts/warnings, late/error checks, known near expiry and unverified expiry | A late check exceeds twice the configured interval, with a 30-minute minimum. Expiry evidence older than two days or missing is unverified. Paused domains are excluded. These are recorded monitoring results, not HTTP uptime or direct TLS checks. |

Counts on a card can overlap. For example, a failing Trust device can also lack
another check, and a device awaiting sale can be in an offboarding handover.
Do not add the cards into a purported company health score or total workload.
The next-action panel prioritizes service breaches, failing evidence, open handovers,
overdue decisions and domain alerts within their respective apps; it is not a
cross-company incident severity engine.

## The executive decision

Use Operations to see where IT needs capacity, evidence or an accountable owner.
Review source coverage before drawing conclusions. It provides a current view,
not a trend, audited compliance status, measured time saving or forecast. Small
aggregate counts may still reveal sensitive activity; this signed-in work view
is not a public dashboard. The separate TV view below shares only explicitly
approved aggregate scopes and never signs into an Owner account.

## A screen for the team room

1. On the TV, open your Hub URL with `#/tv` and select **Generate pairing code**.
   Use a dedicated browser profile for the room. The TV route never initializes
   AuthClient or resumes an existing SSO session, even if the browser has one.
2. On your own computer, an active, linked **Hub Owner** opens **Operations →
   Screens**. Enter the ten-character code shown on the physical screen, name
   the room, select its sources and choose **1, 7 or 30 days** (default: 7).
   Sources start unselected. A pairing code expires after ten minutes.
3. Select **Approve this screen**. The TV connects automatically. Full screen
   expands the display; configure the device's sleep/kiosk settings separately.
4. To stop sharing, use **Revoke** beside the screen in Hub. **Disconnect** on
   the TV removes its local credential and requests server revocation. If that
   request cannot reach Hub, revoke it centrally. Renewal requires a new pairing;
   there is no permanent or automatically renewed display grant.

The TV never exposes app links or business-action controls. Desk shares internal
queue/service-target counts, not customer projects or directory departures. Assets
shares inventory, stock and preparation, not offboarding handovers or employee
sales. Trust, Contracts and Watch share the documented numeric coverage and
follow-up metrics. No names, emails, ticket/contract text, device serials, vendor
amounts, node keys or source URLs travel through the display API. The screen name
is visible, so use a room name without personal or confidential information.
Small aggregate counts can still reveal sensitive circumstances: select sources
appropriate for everyone who can see the physical screen.

TV totals refresh every minute. Access is confirmed with an update call every
15 seconds; a responsive visible browser hides all totals after 30 seconds
without fresh confirmation. Individual source values expire after 90 seconds.
Hiding the tab clears its data and returning rechecks access. Revocation blocks
new server reads immediately, including an already-running call's reply; an
already displayed value can remain until the browser checks again. A paused
browser, screenshot or external video capture cannot be remotely erased.

Approval is bound to the approving Owner's stable person ID and principal, and
the selected app/connector identities. Loss of that Owner's active status or
Owner role suspends the grant; restoration within its expiry can resume it.
Use **Revoke** for permanent removal. Source access is checked separately on
every read; removing/replacing a connector cannot silently widen an existing
grant. Re-pair screens when changing responsible Owner or source selection.

The browser generates a 256-bit random display key and stores it in this Hub
origin's local storage, separately from sign-in credentials. The key never enters
a URL; the backend stores its SHA-256 hash. It authorizes only display status,
selected whitelisted metrics and self-disconnection. Treat the room browser as
trusted for those aggregates; clearing its storage requires re-pairing. Limits:
20 active screens, 100 retained approvals, 64 pending pairings, 12 new pairing
requests per minute per Hub and one source read per screen/source every ten
seconds. Public pairing may be temporarily unavailable under abuse; it cannot
grant data access without Owner approval. Expired approval metadata is pruned
30 days after expiry on the next pairing/source operation. Revocation deletes
it immediately; the Hub activity journal retains approval/revocation events
without codes, key hashes or secret keys. Pending pairing codes do not survive
an upgrade; existing approvals do.

## Release and verification

Publish the tested Hub and five source updates together through the Kitchen
format-2 release workflow. Older sources show **Source unavailable** until upgraded;
existing sign-in and app features keep their prior contract. No connector/role
reconfiguration, new directory lane or Lunch change is required. Backends expose
`hub_operations(viewerId)` only to their configured Hub. Hub's `operationsSnapshot`
rechecks caller, person, connector and policy after its bounded 15-second call.
The schema accepts only bounded numeric metrics; it carries no records, addresses,
serials, agent credentials, contract values or free-text tickets. It stores no
new metric history. Hub 0.29 adds separate stable display approvals; committed
stable baselines remain intact and are compared before upgrade.

Run module checks/builds, SDK consistency, frontend smokes and
`node --test tests/operations.test.mjs tests/displays.test.mjs`. Set `KEBAB_OPERATIONS_BASELINE` to a
clean prior-source build tree to exercise populated upgrades for Hub and all
five apps, central permission preservation and Lunch's exact directory response.
For display-specific upgrades set `KEBAB_DISPLAY_BASELINE` to the prior Hub
Wasm/Candid directory. `KEBAB_DISPLAY_CANDIDATE` selects packaged per-module
Wasm/Candid directories. Checks cover ordinary users, forged credentials, code
replay/expiry, wrong scopes, role loss, rename, deactivation, revocation, browser
failures and retention through upgrades.
Before a production release, repeat with actual packaged executables and follow
[kitchen/INSTALL.md](../kitchen/INSTALL.md). Local validation is not a deployment.
