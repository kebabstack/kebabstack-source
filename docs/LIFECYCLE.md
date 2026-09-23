# Employee context and directory follow-up

Implemented in Hub 0.26, Desk 0.10 and the matching five app releases. Local
verification is required before production rollout. This is a read-only support
context and assisted offboarding workflow; it does not provision vendor accounts,
schedule destructive actions, wipe devices or automatically cancel subscriptions.

## Operator workflow

Use the existing Onboarding and Offboarding request types in Desk. The `person`
field identifies the employee for Offboarding; normal requests use the requester.
Hub → People → Offboarding in Desk opens the existing case or a prefilled request.
Hub's immediate lock-out remains separate. Transfer work does not lock an account.

When SCIM, an Okta hook/pull, or a local account change deactivates a known person,
Hub records an event with stable identity, source, timestamp and effective access.
An initial inactive import is silent. Removing a source is not classified as an
employee departure. Service/secondary accounts are excluded. Another active source
or a forced-active override is explicitly reported; an IdP signal is not proof of
company-wide revocation or employment termination.

Desk polls every 30 seconds independently of revocation. It reuses an open case,
or creates an internal Account review in the Offboarding template's routing group
(empty = centrally assigned Desk staff). No departed employee is made requester.
Confirm departure to use the existing Offboarding template and checklist, or record
why this is not a departure. The template remains linked when renamed; configured
approvals also apply to confirmed cases. Designated approvers get the ordinary
ticket view while their approval is pending, without directory events or app context.
Decisions reject a newer directory event and the affected identity cannot be replaced. Reactivation puts the case back into review and blocks
checklist completion/resolution. Existing work is preserved; nothing is rolled back.
A later explicit HR request can join the automatic case and receive the ordinary
requester view; directory events, internal notes and cross-app context remain staff-only.

Cases use stable person IDs, not reusable email addresses. Hub retains 20,000 events;
Desk commits its cursor with the corresponding ticket changes. A failed delivery
retries, including after upgrades. Workspace displays errors and any history gap
instead of claiming full coverage. Review inactive people manually if a prolonged
outage exceeded retention. Notification delivery remains the existing Hub notification
lane; the durable Desk case is the authoritative follow-up.

## Context and permissions

Desk agents/admins see a compact affected-person card and related requests. Each
connected source loads independently; previous/completed items stay collapsed.
The browser holds summaries transiently and clears them on navigation/sign-out.
Summaries are not copied into public comments or automatically sent to AI.

- Assets: all six hardware kinds, current and recorded previous assignments, sales.
- Contracts: responsibilities, deputies and license allocations visible under the
  viewer's current workspace/record permissions. Allocation is not vendor access.
- Forms: ownership, explicit shares and assigned-review counts; no answers or
  inferred respondent identity from an unverified email address.
- Trust: associated device/check status; no node authentication keys or raw telemetry.
- Watch: domains created or watched by the person; no private notes.
- Desk: up to 30 related requests visible to the agent; open the workspace for more.

Each app returns at most 100 summary items and the full visible count; the UI links
to the source for the complete list. These are relationships retained in the apps,
not a reconstruction of deleted records or removed group/license assignments.
Freshness and source errors are explicit. The person card reports Desk-directory
state; the lifecycle event separately records Hub state at detection time.

A Desk agent role alone does not grant access to another app's data. Hub checks the
Desk role and the source-app role; the source checks its directory lease, the exact
current Hub role and its own record permissions. Role changes during a call deny
the result. Only the registered Hub can call a source's `hub_personContext` method.
All app role grants remain under Hub → Permissions. Lunch and other external
directory consumers keep their existing contracts and filters.

## Upgrade and checks

Keep the pinned compiler and committed `.most` baselines. New persistent state is
in compatible side tables; no existing record fields are removed or rewritten.
Upgrade Hub, the source apps and then Desk with the normal verified release bundle.
Hub captures the existing directory as baseline on first upgrade, so historical
inactive accounts do not produce a backlog. Source apps without this protocol
appear unavailable until updated. An upgraded Hub can queue changes while Desk is
being updated. Perform a populated upgrade test and the Lunch/permissions regression.

Tests: `tests/lifecycle.test.mjs`, `desk/test/person-context.test.mjs`, existing Desk
experience/security tests. For populated previous-version testing set
`KEBAB_LIFECYCLE_BASELINE` to a checked-out built release root. Tests use PocketIC
and isolated identities, never production accounts.

## Verification recorded on 2026-09-17

- All seven affected backends compile with the pinned toolchain and pass stable
  compatibility against their committed state signatures; those baselines are unchanged.
- Five PocketIC scenarios pass, including upgrades from the preceding built release
  with tickets, hardware, forms, contracts, domains and a Trust device present.
  The Lunch directory result is compared before and after the Hub upgrade.
- Frontend smoke checks pass for Hub, Desk, Assets, Contracts, Forms, Trust and Watch.
  Desk also has dedicated context, privacy, navigation-race and decision tests.
- Existing security/permission tests and a targeted rerun cover the current release.
  Eight optional tests for older fixture releases were not run in that full suite;
  the new lifecycle suite supplies its own preceding-release upgrade fixture.
- Desktop and 390 px mobile previews were inspected with synthetic data. Production
  rollout and live IdP delivery have not been exercised by these local checks.
