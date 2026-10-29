# Hub Operations

Status: work and TV views implemented; actionable lifecycle, personal-task and sales-stage summaries added in Hub 0.42, Desk 0.35 and Assets 0.30. Hub 0.43 adds opt-in TV sales, lifecycle and explicitly selected personal task totals. Historical trends are planned.
Implementation/test status is separate from production deployment.

## The operator's workflow

Open **Hub → Operations**. Five connected apps contribute current summaries.
A short **Where to focus** panel shows all current follow-ups before the summary cards, with confirmed payments awaiting IT first. Desk contributes separate Internal support and Workboard cards; Assets contributes Hardware and Asset sales. Open that app
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
| Desk | Internal unresolved/unclosed tickets, unassigned tickets, breached response/due targets, onboarding/offboarding requests, directory reviews and confirmed offboardings | Customer-project tickets never contribute. Onboarding/offboarding counts are subsets of open internal requests. Queue links apply the same lifecycle filter. Onboarding includes the Onboarding request type and recorded directory onboarding cases; offboarding includes the configured departure type and confirmed lifecycle cases. A disabled account is a review, not proof of departure. Recent lifecycle processing must be verified separately. |
| Workboard (Desk 0.35 / Hub 0.42) | Open tasks in unarchived shared projects plus the viewer’s personal standalone tasks and personal projects: overdue, waiting, unassigned/unavailable owners; subtask progress on those tasks | Other people’s personal work, archived work, completed tasks and linked tickets/sales are excluded. Shared and personal subtotals are labelled separately; existing TV shared totals retain their meaning. Target dates become overdue the following UTC day; no date is not overdue. Project count includes unarchived shared projects even with no open tasks. Counts overlap. Open Workboard for details; Operations clears saved board filters for that entry without silently saving new preferences. Admins can inspect more personal work in the source app than this viewer-scoped aggregate includes. |
| Trust | Real enrolled devices, fully assessed devices, verified average score, current failures and unverified devices | Samples excluded. Score averages the per-device percentage of passing applicable checks only where all applicable checks have current, successful observations; current failing checks lower the score. Missing/stale/error/no-check evidence remains unverified. This is enrolled-fleet coverage, not proof that all company hardware is enrolled. |
| Assets | Unarchived inventory, assigned hardware, in-stock unassigned hardware, hardware deployed at a location (Assets 0.23), open offboarding handovers, received items in preparation and unfinished sales | Every hardware kind counts. In-stock excludes tracked open handovers and deployed devices. Deployed means in use at a location without a personal owner (monitors, docks, room gear); it is neither stock nor assigned. IT must record preparation; a return alone is not reuse readiness. Paid sales remain open until physical handover. Hub 0.42 / Assets 0.30 add a separate sales card: confirmed payment awaiting invoice PDF archive, device preparation or handover verification (exclusive next-step stages), unpaid invoices and overdue payment targets, draft/accepted offers and waiting buyers. The paid-phase link opens Sales → Paid. Handover verification still checks Apple/MDM release and custody in Assets; the dashboard does not promise readiness. Finance confirmation is a recorded ledger fact, not a live bank feed. No sale values or currencies are combined. |
| Contracts | Visible active/cancelling contracts across all admin-accessible spaces; upcoming and overdue decisions, missing decision dates, missing/inactive owners and contracts still listing a seat holder who left (Contracts 0.12.1) | Uses the recorded internal decision date (including existing term-derived dates). Excludes trash, billing documents, offers and license-key records. Unknown dates do not become zero-day deadlines. Indefinite/non-renewing agreements do not require a renewal date. No currency addition or claimed vendor usage/savings. |
| Watch | Enabled domains, existing monitoring alerts/warnings, late/error checks, known near expiry and unverified expiry | A late check exceeds twice the configured interval, with a 30-minute minimum. Expiry evidence older than two days or missing is unverified. Paused domains are excluded. These are recorded monitoring results, not HTTP uptime or direct TLS checks. |

Counts on a card can overlap. For example, a failing Trust device can also lack
another check, and a device awaiting sale can be in an offboarding handover.
Do not add the cards into a purported company health score or total workload.
The next-action panel puts confirmed payments awaiting IT first and shows every nonzero follow-up, including service breaches, failing evidence, open handovers,
overdue decisions and domain alerts; it is not a
cross-company incident severity engine.

## The executive decision

Use Operations to see where IT needs capacity, evidence or an accountable owner.
Review source coverage before drawing conclusions. It provides a current view,
not a trend, audited compliance status, measured time saving or forecast. Small
aggregate counts may still reveal sensitive activity; this signed-in work view
is not a public dashboard. The separate TV view below shares only explicitly
approved aggregate scopes and never signs into an Owner account.

## A screen for the team room

Hub Owners open **Operations → Screens**, choose a profile name, a six-digit code
(including leading zeros), its permitted sources and duration. On every TV, open
the same Hub address at `#/tv` and enter that code. Multiple devices can use one
profile, but each receives its own 256-bit random read-only key. The short code
is used for enrollment only and is not saved on the TV or placed in a URL.

Choose **Until revoked** for a permanent dashboard, or 1, 7 or 30 days per screen.
Existing approvals keep their original expiry and scope; an upgrade does not
revive expired/revoked screens. New profiles default to until revoked. Revoke an
individual screen without disconnecting its peers, or remove a profile to revoke
all of its enrolled screens and its enrollment code. To change a profile's code
or source selection, replace that profile and reconnect its screens. An approving
Owner can still adjust individual screen sharing details. No new source or
personal totals are added to an existing approval implicitly.

A normal browser or macOS restart should reconnect with its saved key. Keep the
same browser profile, Hub origin and site data. Private browsing, a kiosk policy
that clears browser data, a new profile/origin or erased site storage requires
entering the profile code again. A browser application cannot recover a credential
that the operating system or browser has deleted. Temporary network failures hide
stale metrics and retry without removing the stored key. Expiry/revocation or lost
Owner access blocks reconnection. No actual macOS update is simulated by the local
tests; browser recreation and backend stop/start/upgrade are tested separately.

Profiles and screens expose only explicitly approved numeric aggregates. Lifecycle,
sales and selected personal task totals need explicit choices. Names, ticket/task
text, serial numbers, buyers and amounts are excluded. Small aggregates may still
be sensitive; share codes only with people allowed to enroll room screens. Owner,
person, connector and app permissions are rechecked before and after source calls.
This remains separate from Hub sign-in, app tokens and directory credentials.

Enrollment codes are hashed, never returned by profile listing or written to the
journal. Five incorrect six-digit codes lock enrollment globally until a linked
active Hub Owner selects **Unlock code entry**. The failure budget persists across
canister upgrades and does not reset after a correct guess. This intentionally
limits guessing across changing anonymous identities; an attacker can temporarily
block new enrollment, but cannot interrupt existing screen keys. Limits remain
20 active screens and 100 retained approvals, with at most 10 profiles. Retire
unused profiles/screens explicitly. Legacy pending approval APIs remain compatible
with older clients; the new UI uses Hub-created numeric profile codes.

Approved keys are stored in this Hub origin's local storage. The backend keeps
only their hashes. Revocation blocks new reads immediately; online screens check
access every 15 seconds and clear stale data within 30 seconds without confirmation.
Infinite approvals are retained until revoked; expired metadata is pruned 30 days
after expiry. Journals contain IDs and names, never codes or keys. Profile and
screen approvals survive compatible upgrades. Source reads are bounded and
throttled per device/source; older source coverage remains explicitly unavailable.

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

## Updating these summaries

Deploy Desk 0.35 and Assets 0.30 before Hub 0.42 through the shared Kitchen executor. The schema-1 metric map is additive: existing Hub and TV consumers keep their original fields. A newer Hub labels missing lifecycle, personal-task and sales-stage detail from older sources as unavailable, never as zero. There is no stable-state migration or new external process. Source counts scan the existing bounded Workboard store (up to 5,000 tasks); Desk ticket and Assets sale scans retain their existing collection-size dependency.

Hub 0.43 adds `operationsDisplayApproveWithOptions` and `operationsDisplayConfigure` with explicit `workboard`, `lifecycle`, `sales` and `personal` booleans plus optional `personalEmail`. Existing approval methods retain their semantics. Scope labels use the existing text field. A new additive stable map pins the selected personal contributor by person ID; existing grant records stay unchanged. Selection is checked against current active Desk-admin permissions before and after each source read. Changing the selected account invalidates in-flight replies; only authenticated Owners see its email in management, never the TV. New data fields are optional for older Desk/Assets sources and displayed as unavailable rather than zero. Deploy only the Hub 0.43 package after Desk 0.35 / Assets 0.30. Saved TV credentials and approvals survive upgrades.
