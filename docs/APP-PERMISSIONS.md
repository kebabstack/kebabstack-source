# App permissions in Hub

Implemented in Hub 0.23.1, Assets 0.11.0, Contracts 0.8.0, Desk 0.9.0, Forms 0.3.0, Trust 0.4.0 and Watch 0.6.0; SDK 0.6.0. Use the rollout sequence below for your installation. The local permission regressions also check preservation of unrelated external directory integrations.

Hub → **Permissions** is the authority for these six apps. Select an app to see every person's effective role and its reason. Select a person to see their saved roles across apps. Expand “What each role allows” for capabilities. Hub owners review and save changes; global Hub admins can inspect but cannot delegate app privileges.

| Role | Scope |
|---|---|
| Active global Hub Owner/Admin | Admin in all six apps, inherited and not lowerable by an app policy |
| App Admin assigned in Hub | All content and settings in that app, including other people's content |
| Employee in Assets | Assigned devices and own sales/offers/invoices |
| Requester in Desk | Own tickets and explicitly assigned pending approvals |
| Agent in Desk | All tickets; no app settings |
| Employee in Forms | Own forms/submissions and explicitly shared forms, within viewer/editor permissions |
| Employee in Contracts | Own personal workspace and explicitly shared teamspaces/records |
| Employee in Trust | Own devices/results and published check catalogue |
| Fleet viewer in Trust | Read all fleet devices/results; no configuration |
| Viewer in Watch | Read **all** monitoring; no changes |
| No access | Cannot sign in or read protected app data |

Watch defaults to No access because it has no personal monitoring area. The other five default to Employee/Requester. Public Forms submission links and scoped external Assets dealroom links remain their own explicitly shared access paths; they never grant app administration.

## Precedence and identity

Inactive or missing Hub accounts have no app access. For active accounts: global Owner/Admin overrides everything; an individual assignment overrides groups and the app default; the highest assigned group role wins; otherwise the app default applies. Individual No access can exclude a group member. Manual membership changes to groups that grant app roles are owner-only, including temporary group grants. For an IdP-managed group, its trusted SCIM source remains the membership authority; assigning that group deliberately delegates membership there. Person and group assignments use immutable Hub IDs, not email addresses or mutable group names. A re-issued email does not inherit the former person's individual assignment.

Hub Helpdesk is not an automatic app administrator or agent. Assign Desk Agent or Trust Fleet viewer explicitly where intended. Former local admin email lists, local role groups, claims and Contracts legacy editor/admin lists confer no rights in the new releases. Their stable data remains available to Hub's migration reference. Deprecated mutation APIs return failure; app settings return empty retired role fields.

Object collaboration remains in the app: sharing a form, adding a teamspace member or assigning a ticket is a content operation. It cannot promote somebody to an app administrator or grant access to a different app. Infrastructure controllers and anyone able to replace a canister's code remain outside the application-role boundary.

## What confirmation means

Saving changes the Hub's decision. “Confirmed by app” additionally requires the app's protocol, current permission snapshot and directory lease to match. The snapshot covers effective roles, identity bindings and their source, including group and global Hub-role changes. A partial directory push cannot confirm a mixed snapshot. Confirmation expires in the UI after at most 60 seconds; use Refresh/Check app enforcement for a new observation.

Apps pull a complete directory every 30 seconds. Every protected request refuses a directory 60 seconds old, including during Hub failure. Push can accelerate changes but never extends that lease. Existing app sessions re-evaluate current roles. This bounds stale application access **after Hub knows the change**; it does not promise instantaneous revocation or bound upstream IdP sync latency. Already downloaded records cannot be recalled.

For centralized apps, legacy connector access rules, directory source filters/scopes and temporary app grants no longer decide access. Their mutation APIs refuse changes. Old pending reviews/grants are marked superseded at the first policy save; unrelated apps keep their existing model. Data lanes still limit profile/groups/AI/notifications. The app permission protocol is essential authorization and remains present without the optional `roles` lane.

Lunch Check-in remains on its existing `team-directory` integration. Its `team_info`/`team_members` schema, identity lane, source scope and `entity=LLC` / `city^=Remote` exclusions are unchanged. Lunch cannot be assigned one of the six-app policies. A dedicated populated Hub-upgrade regression compares its complete directory response before and after activating all six policies.

## Upgrade and rollout

1. Record deployed versions/module hashes and take normal recoverable snapshots. Use the matching prior release as the stable-signature and populated-upgrade baseline. Do not reinstall data canisters.
2. Deploy the Hub candidate first. Existing apps continue their old rules until upgraded; the Hub labels them unconfirmed.
3. For each of the six apps, inventory its former local administrators and groups, connector access and source filters. The migration reference is historical configuration plus cached role observations, not an automatic import or a complete identity audit. Review former identities and group membership in Hub.
4. Save a reviewed central policy in Hub before upgrading that app. The proposed effective-role table is the decision record. In Forms and Contracts, **Admin now includes all personal and team content**; do not silently translate a former technical administrator or editor into Admin. Preserve any intended employee exclusions explicitly.
5. Upgrade that app backend and matching frontend. Without a valid central policy, the new backend denies protected sign-in. Old local controls cannot rescue a missing policy; a Hub owner configures it centrally.
6. Check app enforcement in Hub. Test a global owner/admin, an app-specific administrator and two ordinary employees, including an existing session after revocation. Inspect own versus other-person content, files, exports and settings. Keep the app marked unconfirmed while verification fails.
7. Roll out the remaining apps, then publish matching Kitchen recipes from a clean reviewed commit. A newly installed app also needs its Hub policy saved before first sign-in.

Rollback must be deliberate: restoring an old app binary restores its old authorization code and potentially its retained historical local grants. Its central enforcement check must be considered failed. Restore the matched Hub/app release and reviewed access configuration, not just a frontend. No automated rollback or production deployment is performed by the local tests.

## Local evidence

Run `node --test tests/permissions.test.mjs` for the cross-app authorization matrix and `node --test hub/test/permissions-ui.mjs` for the review UI. Set `KEBAB_PERMISSIONS_BASELINE` to a directory containing `<module>/backend.wasm` and `<module>/backend.did` for the seven real prior releases to run the populated upgrade test. The broader suite remains `tests/security.test.mjs` plus each module's frontend smoke. No production identities or records are used in these tests.

## Desk reporting capabilities

Hub 0.31.0 additionally assigns project-scoped `time_review`, `compensation`, `release` and `export` to people/groups for Desk 0.19.0. They supplement a base role; No access still denies entry. Use Requester for HR/Finance to avoid broad support access. Hub Owners/Admins retain all app capabilities, subject to no-self-approval rules. Grants bind to the exact backend and participate in enforcement snapshots. See [Service reporting](../desk/REPORTING.md).
