# Access governance in the hub — design and decisions

Status: **built 2026-09-03, hub 0.9.0** (backend section "ACCESS GOVERNANCE" in
`hub/backend/main.mo`, frontend page **Access**, portal sections *Not on your
menu — ask for access* and *Access review · your decision*, docs card
`#/docs/apps/governance`, smoke block in `hub/test/smoke.mjs`).

The following rationale describes the pre-implementation problem. Current expiry
enforcement uses the grant deadline during authorization; the five-minute cleanup
is bookkeeping, not permission to keep accessing an app after expiry.

## Why this, why now

The hub already answers *who may use which app* with one rule per app
(everyone, or selected groups / hub roles / people). What was missing is what
every audit, every SOC 2 questionnaire and every sensible IT lead asks next:

1. **How does someone get in?** — today: message an admin, admin edits the rule.
2. **How does access end again?** — today: someone remembers.
3. **Who checked that the rule is still right?** — today: nobody, provably.

Vendors sell this as a separate product (Okta Identity Governance, Entra ID
Governance P2). In the hub it is a thin layer over the existing rule, so there
is no second system of record and nothing to keep in sync.

## Decisions (2026-09-03)

| Question | Decision | Why |
|---|---|---|
| Where do requests come from and who decides? | **From the menu card → hub admins (owner/admin)** | The menu is where a person notices an app they cannot open; admins already hold the rule. Routing to app owners is a later option. |
| Who reviews an app's access? | **App owner per app** (new field *who answers for this app*, ≤ 5), fallback hub admins | The owner knows why a line exists; admins do not. Lines without an owner must not fall through the cracks, so they land with admins. |
| When does a review decision take effect? | **At once** | A review that only produces a to-do list is theatre. Remove edits the rule immediately, ends a running grant, tells the person. |

## Model

- **Owner** — `connectorOwners : cid -> [email]`. Only the reviewer role today.
- **Grant** — `{email, target "app:<cid>" | "group:<gid>", expiresAt (0 = until revoked), reason, grantedBy, state active|expired|revoked}`. Creating a grant adds the person to the app's people list or the group; ending it removes them again (idempotent — a hand removal in between is fine). Preconditions: app rule is `selected` and the person is not already allowed; group is editable (not SCIM-pushed) and the person is not a member. One active grant per (person, target).
- **Access request** — `{email, cid, reason, wantedHours, state open|approved|denied|withdrawn}`. Approving calls the same grant creation with the asked-for or an overriding duration; if the person got access by other means meanwhile the request closes as approved with that note. Deny carries a note. ≤ 10 open requests per person, one per app.
- **Review** — `{name, apps, dueAt, state open|closed}` with **items** frozen at start: `person:<email>` (label: display name, "not active" flag), `group:<name>` ("N members"), `role:<r>`, or the single `everyone` for open apps (label: people count today). `reviewers` = active owners at start, `[]` = hub admins. Decision `keep|remove`, `applied` records what a removal changed. Closes itself when every item is decided; admins may close early.

Everything lives in the hub canister as plain records (no migration needed; new
stable maps only). Constants are `transient let`. Ended grants and decided
requests are pruned after a year; reviews are kept (evidence).

## Sweep

`tick()` (every 5 minutes) calls `governanceSweep`: ends due grants (journal
line + notification to the person), prunes old records. Removing an app or a
group calls `governanceForget`: its active grants end, its open requests are
withdrawn, its owners are dropped.

## Notifications (hub-made, same bell + Slack lane as `hub_notify`)

| Event | Who | Text |
|---|---|---|
| request sent | every active owner/admin | "<name> asks for access to <app>" → `#/access/requests` |
| approved / grant given | the person | "You now have access to <app> for 7 days" |
| denied | the person | "Your request for <app> was not approved: <note>" |
| grant ended / taken away | the person | "Your access to <app> has ended" |
| review started | each owner with lines; admins for ownerless lines | "Access review "Q3": 4 entries to check by <date>" |
| removed in a review | the person | "Your access to <app> was removed in an access review" |

Dedupe keys keep repeated ticks from double-sending. `notifyLocal` skips the
per-app population gate (the hub is the sender) but keeps the per-person cap.

## Limits and non-goals (say so in the docs)

- No reviews of group **membership** — only of group → app assignments. A review line "group IT · 4 members" asks *should IT still open this app*, not *should Ben still be in IT*.
- No manager-based reviewers, no due-date reminders, no escalation, no separation-of-duties rules, no request routing to app owners.
- An "everyone" line can only be confirmed; restricting an open app is a deliberate policy change under Apps.
- Grants never touch SCIM-managed groups.
- Date formatting in the backend is UTC (`whenText`, civil-from-days); the frontend shows local time.

## Where to look

- Backend: `hub/backend/main.mo`, section `ACCESS GOVERNANCE` (before the OIDC provider). Public API: `setConnectorOwners`, `grantAccess`, `revokeGrant`, `listGrants`, `grantTargets`, `requestableApps`, `requestAccess`, `withdrawAccessRequest`, `myAccessRequests`, `listAccessRequests`, `decideAccessRequest`, `startReview`, `listReviews`, `listReviewItems`, `myReviewItems`, `decideReviewItem`, `closeReview`, `reviewCsv`, `governanceSummary`. `listConnectors` rows carry `owners`; `home()` carries `accessRequests`, `reviewsOpen`, `reviewsOverdue`.
- Frontend: view `#access` (tabs `requests` · `temporary` · `reviews`, deep links `#/access/<tab>`), `apOwnersBtn` in the app panel, `renderPortalAsk` / `renderPortalReviews` in the portal, dialog `#askOv`.
- Tests: `hub/test/smoke.mjs` block "access governance" (fake backend, all three tabs, app-panel owners, portal ask dialog and review lines).
