# Changelog — kebab-stack hub

## [0.32.2] — 2026-09-23

- Publish Brand & Product System 1.2.0 with workspace composition examples, compact context/selector rules and full-page visual acceptance criteria. Runtime app styling, roles and directory behavior remain unchanged.

## [0.32.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes. Keep the mobile side drawer below global menus and show its destinations vertically. Publish Brand & Product System 1.1.2 with mandatory NAVIGATION-06 and real-browser scroll acceptance checks.

## [0.32.0] — 2026-09-22

- Update the served Brand & Product System to 1.1.1 with runtime adoption evidence and generation/drift rules.
- Use the approved forest/paper palette, measured shared controls, menu/app-switcher and canonical suite mark across Console and employee workspace. Preserve SSO handoff, central roles, reporting and Lunch directory integration.

## [0.31.4] — 2026-09-22

- Expand the served design standard to 1.1.0: explicit suite-logo source and downloads, measured buttons, menus/tabs, fields and panels, with interactive reference states and search.
- Add Brand & Design Standard to “How this hub works”. This remains static documentation; app styling, access, directory and Lunch behavior are unchanged.

## [0.31.3] — 2026-09-22

- Serve the complete Kebabstack Brand & Product System at `/design/`, with searchable rules, target tokens, interactive examples, a review template and staged adoption plan.
- Keep the existing `/design/logos/` library and permanent product marks; link it to the expanded standard.
- This release documents the target UX and visual rules. Existing app design, directory/Lunch synchronization, permissions and workflow logic are unchanged. Per-app adoption follows separately.

## [0.31.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.
- Built-in menu logos follow the validated central app identity, including renamed apps. Hide picture editing and refuse overrides for these marks; keep external-app pictures and company logos editable. No stable-state or directory/Lunch changes.

## [0.31.1] — 2026-09-21

- Keep individual Okta pull-sync records flat as well, so a large profile field cannot recreate the same text-rope failure after splitting a page.
- Company sign-in uses a compact progress screen during verification and app handoff.
- Use the corrected shared JSON sanitizer: large external responses no longer build a deeply nested text value, and escaped backslash literals remain unchanged. The Hub now uses the SDK implementation instead of a duplicate.
- Directory, Lunch synchronization, role policies and existing sessions retain their contracts.

## [0.31.0] — 2026-09-19

- Added Permissions → Desk → Reporting access: owner-managed person/group assignments for time review, compensation preparation, statement release and approved payroll export, scoped to existing on-call projects.
- Supplemental permissions are bound to the exact Desk backend and included in directory enforcement snapshots. Base No access still denies entry; global Owner/Admin inheritance is unchanged. Reporting-bearing manual groups are owner-managed.
- Updated effective-person summaries and SDK 0.12.0. Existing directory/Lunch contracts remain unchanged. Reporting remains an alpha workflow; this release preserves the deployed Crumbs permission vocabulary and connects Desk 0.23.0.

## [0.30.0] — 2026-09-19

- Add Crumbs to central app permissions and the connect wizard. Its default is No access; Analysts see shared sites and Admins manage analytics. Existing app, Lunch and stable-state contracts are preserved.

## [0.29.0] — 2026-09-18

- Added Operations → Screens: an active, linked Hub Owner approves a TV code, selected aggregate sources and a 1-, 7- or 30-day expiry. Screens use separate read-only capabilities; stored key hashes never act as login or app tokens. Owners can revoke screens centrally.
- Added a responsive, full-screen TV view that bypasses existing passkey/SSO sessions. It omits personal records, departure counts and employee sales, rechecks access every 15 seconds and hides data when access confirmation is stale, the tab is hidden or the connection fails.
- Source reads recheck the approving Owner, stable person identity, connector binding and permissions after asynchronous calls. Pairing requests, active displays and call frequency are bounded; approved screens survive compatible upgrades.
- Updated the operator guide and local upgrade, authorization, pairing, revocation and screen-layout tests. Historical charts remain planned; this release does not deploy or publish itself.

## [0.28.0] — 2026-09-18

- Added Hub → Operations with permission-checked numeric snapshots from Desk, Trust, Assets, Contracts and Watch, independent source states, freshness checks and a focused next-action list. No personal records or fabricated trends are loaded.
- Hub and each source check current administration rights; late responses are rejected after connector, identity or policy changes. Directory, Lunch and central-role contracts remain unchanged.
- This release provides the signed-in work view. Separate TV credentials and retained trend history follow in later stages.

## [0.27.0] — 2026-09-18

- Added an authenticated Desk–Assets hardware coordination service. Desk controls the departure decision, Assets controls custody, and Hub checks connector bindings and the current central Assets admin permission before actions.
- Hardware can no longer be reassigned through the generic ownership transfer. Operators are directed to the Desk offboarding and confirmed Assets handover.
- Existing directory, central-role and Lunch synchronization contracts are unchanged.

## [0.26.0] — 2026-09-17

- Durable directory-change history for Desk follow-up, with stable person IDs, first-import suppression and source-removal handling. SCIM/Okta revocation remains independent of Desk availability.
- Added permission-preserving support-context brokering and an Offboarding in Desk entry on person details. Transfer work is now a separate action that does not deactivate the person.

## [0.25.1] — 2026-09-17

- While release checks are loading, show a loading state instead of claiming no apps are installed. Owners now have one Add app entry point; connecting existing software remains available inside it.

## [0.25.0] — 2026-09-17

- Apps now contains Connected apps, Updates and History, with one Add app flow. Removed the duplicate Pantry/Recipes screen and redirected its existing links.
- Owners review a specific published release before installing it. Status distinguishes complete verification, newer direct deployments, different builds, incomplete frontend updates and unavailable checks.
- Added release notes, progress, retry guidance and operator details on demand. Updated “How this hub works”. External connections such as Lunch retain their own update process.

## [0.24.0] — 2026-09-17

- Reorganized the console around people, apps and permissions, with a shared warm-paper/forest design, simpler directory rows, concise app rows with data sharing inside Edit, searchable apps/activity, accessible mobile navigation and contextual setup forms.
- Company SSO counts as a configured sign-in method; passkey counts no longer imply who can sign in. Source connections appear in their matching sync section. Global Hub and app-specific roles are explained separately.
- App handoffs now run before the admin console or employee workspace is displayed. A dedicated progress/error screen prevents accidental navigation, rejects unregistered destinations and offers retry or return. Passkey owners now honor incoming app jumps.
- Connecting the six central apps now leads to Permissions instead of the obsolete access-list step. Changing a service ID invalidates pending probe results.
- Data-sharing changes stay as a draft until Save; late app probes cannot overwrite a different app’s dialog.
- Replaced the data-sharing drag-and-drop graphic with labelled, keyboard-accessible choices. Rewrote “How this hub works” around actual operator tasks and current central permissions, with technical references on demand.
- Existing person roles, recovery grants, source configuration and Lunch directory integration are preserved. Historical setup controls are contextual; no identity or sync data is deleted.

## [0.23.1] — 2026-09-17

- Apps overview labels centrally managed apps as “Hub permissions”; retired Everyone rules no longer appear as their effective access. Lunch and other existing connectors retain their original labels and controls.

## [0.23.0] — 2026-09-17

- Central permissions for Assets, Contracts, Desk, Forms, Trust and Watch: effective roles, per-person overview, reviewed changes, role provenance, audit history and app enforcement confirmation. Active Hub owners/admins inherit app administration. Stable person/group IDs and explicit precedence replace overlapping app access controls.
- Deploy Hub first, review and save each app policy, then upgrade the six apps. Missing policies deny sign-in in the new app releases. App-local historical roles are migration evidence only.

## [0.22.1] — 2026-09-09

### Fixed
- Repair duplicate slashes at the root of notification hash links, which could trigger an ICP
  response verification error. Existing bell notifications are corrected when read, as are new
  notifications and pending Slack deliveries. Origins, workspace routes and access checks remain
  unchanged; subpaths and query strings are not rewritten.

## [0.22.0] — 2026-09-09

### Changed
- A stable, responsive company sign-in screen, shared progress states and quiet motion in both themes.
- Public branding/provider metadata loads concurrently; removed the forced 2.03-second animation delay. Access is confirmed before showing a successful handoff.

### Fixed
- Lock all sign-in methods during an attempt; recover inline from cancellation, malformed/expired callbacks and failed exchanges.
- Capture combined app-jump/provider parameters before cleaning the URL. Sign-out now precedes stored SSO session resume.
- Passkey setup, invitations, PKCE/state/nonce checks and canonical Internet Identity origin remain in place.

## [0.21.0] — 2026-09-09

### Changed
- The employee menu is now a responsive workspace with readable app cards, favourites, persistent search and clear website/connected-app labels. Light and dark themes share the same hierarchy.
- The employee “How it works” guide now starts with practical steps and expandable answers. Corrected claims about notifications, identity fields, upstream sync, external sign-in and the 60-second access limit.
- Shared app switcher (SDK 0.5.0): compact two-column list, full app names, current-app label, search count and keyboard opening.

### Fixed
- The shared search field stays within the app panel even when host apps apply width:100% to search inputs.
- Favourites are real keyboard-accessible buttons, separate from app navigation; focus survives a pin/unpin.
- Enter opens the first visible search match, not a hidden favourite. Failed refreshes keep a previously loaded menu and report the error; a failed first load offers a retry.

### Release scope
- Prepared from the deployed Hub 0.20.2 baseline. The original clone’s unrelated, uncommitted 0.20.3 Kitchen Domains work is preserved there and is not included here.


## [0.20.2] — 2026-09-07

### Fixed
- **Okta sign-in failed with "the provider must verify the email address before sign-in".** Okta's org authorization server issues a thin ID token in the authorization-code flow — `email_verified` (and other scope claims) are only served by `/userinfo`. When the claim is missing from the ID token, the hub now asks `/userinfo` with the access token and accepts the address only if the subject matches, the address matches and `email_verified` is true there. Providers that put the claim in the ID token (Google) are unchanged; an explicit `email_verified: false` still refuses sign-in.
- Login page: a provider named "Sign in with …" no longer renders as "Sign in with Sign in with …".

## [0.20.1] — 2026-09-07

### Added
- **SCIM: address and custom attributes are filterable.** The work address a provider pushes (`addresses` → `locality`, `region`, `country`) is stored as `city`, `state`, `countryCode` — the same names the Okta pull lane uses — and every custom schema-extension attribute (Okta/Entra custom profile fields such as `entity`) is stored under its own name. Exclude filters on an app (Apps → the app → Who may use it → Advanced → Attribute filters, e.g. `city^=Remote`, `entity=LLC`) therefore work whichever lane brought the person in. PATCH paths for addresses and extension attributes are honoured; street and postal code are not kept.

### Fixed
- **SCIM enterprise attributes never arrived.** The enterprise extension (`urn:…:enterprise:2.0:User` — department, division, organization, cost centre, employee number, manager) was looked up with a dotted-path reader that split the schema URN at "2.0", so those fields were silently dropped on every POST/PUT since the SCIM server shipped. They are stored now; existing people pick them up on the provider's next push or re-sync.
- A SCIM PATCH that renamed an attribute's case (`Entity` vs `entity`) could leave two copies on the person; attribute keys are now matched case-insensitively.

## [0.20.0] — 2026-09-07

### Added
- **SCIM sources.** Several identity providers can push through SCIM at once — each as a *source* with its own bearer token (stored as a sha256 hash), its own record scope and, optionally, a list of mail domains it may provision. A source sees, changes, deactivates and groups **only its own people**: `GET /Users` and `/Groups` are filtered, foreign ids answer 404, an address that another source holds actively answers 409, an address outside the source's domains answers 403. Group names stay unique across the hub: a second source pushing an existing SCIM group name gets 409 (rename it in that IdP); a manual group of the same name is taken over as before.
- Sources → SCIM: a list of sources with people/group counters, last request, domain scope; add (name + domains → key shown once), replace key, pause/resume, edit, remove. Removing a source drops its people like an Okta connection (deactivations pushed to the apps) and turns its groups into ordinary groups. People rows and the person card name the source.
- New methods `addScimSource`, `rotateScimSourceToken`, `updateScimSource`, `setScimSourceEnabled`, `removeScimSource`, `listScimSources`. `genScimToken` / `revokeScimToken` / `scimStatus` keep working and act on source 1 (aggregated status).

### Changed
- A hub that ran one SCIM token before 0.20 continues unchanged: on the first SCIM request or Sources action the token becomes source 1 ("SCIM"); its people and groups keep their records and ids. The pre-0.20 plain token stays valid until you replace it once — then only its hash is kept. Multiple sign-in providers (Okta, Google) were already supported and are unchanged.

## [0.19.1] — 2026-09-06

Documentation only — the tenth module.

- "How this hub works": the architecture diagram and the overview list name **contracts**; the savings card points at the contracts app (last cancellation dates, decision dates, unused seats). No backend behaviour changed.

## [0.19.0] — 2026-09-06

Security release from the full audit (`KEBABSTACK-AUDIT-2026-09-06.md`). Deploy before any app update; apps 0.6.1/0.7.0 expect it.

### Fixed — security
- **Person registry:** an account seen for the first time joins the holder of its address only while that holder still has an *active* account. Before, a newcomer that arrived inactive (IdPs stage people first) was attached to a departed holder's id and inherited role, sign-in keys, seats and grants on activation. Re-issued addresses now always seal the previous holder (HB1-01).
- **Assistants follow the registry:** an assistant token and pending code move with a rename and die with a sealing — the previous holder's assistant could otherwise act as the address's next holder (HB2-01). The cached Slack user id of an address is dropped on rename/sealing (HB2-12).
- **Sync collisions:** an IdP sync that wants to move an account onto an address another active person holds keeps the old address and journals it once a day, instead of merging two people through every e-mail lane (HB1-02).
- **No local twins:** *Add here* refuses an address held by an active account from another source, and re-issuing a departed person's address needs the rank to manage that person (HB1-03/08).
- **Passkey sessions of locked-out people** end at once, like SSO sessions (HB1-06); only `portalWhoami` still answers `active = false` so the menu can show the lock-out notice instead of looping back to sign-in.
- **SSO rate window** counts failed exchanges only (600 per 5 minutes) — successful sign-ins can no longer lock the company out, and an anonymous caller needs 600 failures, not 300 calls (HB2-02).
- **Assistant directory scoped:** `assistantPeople` returns the union of what the person's own apps show in their pickers (scope, exclude filters, access policy, lanes) — not the company directory with every group (HB2-03).
- **Assistant tokens are stored as hashes**; the tokens minted by 0.18 are retired on upgrade (people reconnect with a new code). At most ten live assistants per person. `assistantApps` lists window tiles too (HB2-08/16/20).
- **The assistant lane is OFF by default** (new switch; the 0.18 value was frozen on). Switching off disconnects every assistant for good and clears pending codes (HB2-09).
- **Off the menu means off:** a hidden tile mints no ticket, for people or assistants (HB2-07).
- Base64 decoding on the anonymous OIDC token endpoint is bounded (16 KB, linear cost) (HB1-13). SCIM bodies go through the surrogate guard so an emoji in a display name no longer traps the push (HB1-14).

### Fixed — bugs
- Access requests: a failed grant (e.g. a too-long reason, everyone-policy) leaves the request open and tells the admin why; only "already has access" closes it without a grant. Reasons are cut to the limit (HB2-04).
- Connect-an-app wizard showed no feedback at all: its status element shared an id with the setup wizard (HF-03).
- `#/apps/<id>/<tab>` deep links (used by apps for "grant the AI lane") open the app panel (HF-04).
- "Lately" shows words for every journal kind (HF-28).

### Removed
- The member-facing **Onboard your app** request flow (menu link, request page, admin approval card, `submitConnectorRequest`/`myConnectorRequests`/`listConnectorRequests`/`approveConnectorRequest`/`rejectConnectorRequest`). It spoke canister-ids to non-technical people, granted lanes from an unreviewed manifest and accepted any principal as an app. Apps are connected by admins under Apps → Connect an app. `home.pendingRequests` stays (always 0) for compatibility.

### Docs
- Identity card (join rule, sealing covers assistants, sync collisions), First run (setup code, no first-visitor window), AI assistants card (default off, hashed tokens, scoped people, hidden tiles).

## [0.18.0] — 2026-09-06

### Added
- **AI assistants (MCP).** A person connects a chat assistant on their own computer from the menu: **Connect an assistant** mints a one-time code (`<hub canister>.<code>`, 10 minutes); the assistant's `kebab-mcp` server exchanges it for a personal token (30 days) and from then on asks the hub for app tickets **as that person** — same rights, same lease, same lock-out, same access rules as the menu. Menu card lists connected assistants with last use and a Disconnect button; Settings → AI shows every connected assistant to staff, lets them disconnect one, and gives owners a company-wide switch. Every ticket an assistant opens is journaled (kind `assistant`).
- New methods: `mintAssistantCode`, `myAssistants`, `revokeAssistant` (person plane); `redeemAssistantCode`, `assistantWhoami`, `assistantApps`, `assistantTicket`, `assistantPeople` (assistant plane); `listAssistants`, `revokeAssistantOf`, `setAssistantsEnabled` (staff/owner). Docs: "AI assistants — your apps from the chat", architecture picture, `docs/agent/mcp.md` (also served as `/sdk/mcp.md` and listed under For developers; the menu card links it as the setup guide).
- Stable baseline `backend.most` refreshed to this release (it had stayed at 0.14).

## [0.17.0] — 2026-09-06

### Added
- **Person registry**: every person gets one stable, opaque id (`p_…`, derived from a per-hub random seed, never reused), minted for every known account at upgrade and for every new account since. The current e-mail stays the working key inside the hub; the registry is the single truth for which address is whose (design: `docs/PERSON-IDS.md`).
- **Renames are handled**: when a person's address changes at its source (IdP sync, SCIM `userName`, an edited local entry), one update call moves roles, passkey links, invites, group seats, access-policy entries, app ownerships, grants, requests, review items, notifications, Slack opt-out, avatar, OIDC subject and consents, live sessions and suite tokens to the new address. SCIM no longer answers 409 to a rename. Local people: People → person card → **Change address**.
- **Re-issued addresses seal the previous holder**: when a departed person's address is given to a newcomer, the previous holder's role, passkey links, invites, seats, policy entries and ownerships are dropped (nothing transfers — before 0.17 the newcomer would have inherited them through `accessOf(email)`), and their history is parked as `address#id`.
- The id travels with the directory: `ConnectorUser.id` on `connectorDirectory` and the `hub_upsert` push, `redeemTicket`, `portalWhoami`, `suiteState`, `ssoWhoami`, `UserView.personId`; `connectorLookup(emails)` answers address → id for any address the hub has ever known (connectors only — the apps' one-time migration lane); `personCard(email)` for staff; `renameLocalUser(email, new)`.
- People page: identity card on every person (id with copy, earlier addresses, former holders, sealed note); docs updated (Identity and roles, SCIM limits).

### Changed
- SCIM: `userName` renames are accepted (same person, new address) unless another active person already holds the address — then refused and journaled.

## [0.16.3] — 2026-09-06

### Changed
- Docs and architecture picture speak of "your apps, built on the SDK" instead of naming each one — forms joins desk, assets, watch and trust; a new app no longer needs a hub release. No behaviour change.

## [0.16.2] — 2026-09-06

### Changed
- Docs and architecture picture name the new **Trust** app (device posture) among the SDK-built apps. No behaviour change.

## [0.16.1] — 2026-09-06

### Fixed
- The kitchen's picture and lane calls were refused by the hub ("kitchen only" / "admins only"): `kitchenSetTileIconFor` and `kitchenResyncLanes` delegated through a **shared self-call**, which made the hub its own caller. Both now share a private worker with the original entry points. Effect: recipe pictures and needed lanes finally arrive on update and on "Re-check with the hub" (the service desk's picture was the visible symptom).

## [0.16.0] — 2026-09-05

- Use native keyboard-accessible controls for primary navigation.

- Make Hub console navigation and tables usable on narrow screens; qualify operator and revocation claims in embedded help.

- Enforce the person role hierarchy for direct/bulk lifecycle actions and login linking, including legacy roles and inactive identities.

- Require a private setup code or actual controller for first setup; protect invitations and app bootstrap from privilege escalation.
- Apply source/kind/exclusion/access policy consistently to directory, tickets and suite tokens; recheck authorization and bindings after awaits.
- Verify incoming SSO RS256 signatures against replicated JWKS, PKCE-bound nonce, issuer/audience/time/subject and verified email. Unverified mailboxes now fail sign-in. OIDC provider no longer asserts unproven email verification.
- Expired temporary grants stop authorizing before cleanup; bulk kill switch affects all source records; deactivated linked logins lose legacy staff privileges.
- Abort stale/partial Okta sync reconciliation; constrain pagination to the source Users endpoint. Recheck concurrent SCIM creation and refuse unsafe email renames.
- Require explicit owner grants for company AI credentials; manifest refresh cannot self-grant them. Connector-request approval commits after the manifest response.
- Refresh setup help, operator/decision documentation and alpha boundaries; remove unverified price/SLA claims. Add pinned local security/release checks.

All notable changes to the hub, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) — while the hub is 0.x, a MINOR bump
means a new capability, a PATCH bump a fix; the first 1.0.0 marks the point
where stable interfaces are promised. The version lives in `hub/mops.toml`,
is shown bottom-left in the hub, and the kitchen uses it as the recipe version.

## [0.15.0] — 2026-09-05

### Added
- **The console wears the same topbar** ("Console · <company>", a Menu button, the same bell opening in place, theme, you ▾ with photo/key/role and sign out). The sidebar lost its own brand, bell row, you-chip and theme switch — one top, three surfaces (console, menu page, every app).
- Kitchen page: **Re-check with the hub** on every up-to-date app (kitchen ≥ 0.5.0) — picture and lanes without an update.
- `kitchenSetTileIconFor(canisterId, img, mime)`: the kitchen sets a recipe's picture by the app's backend id — the menu entry is looked up — so updates and adopted apps get their picture too (still never overwriting an admin's). Why: the picture was only ever set at install; an app installed before recipes had pictures (the service desk) never got one.

## [0.14.0] — 2026-09-04

### Fixed
- **The menu's bell never loaded for passkey users.** `refreshNotifications()` returned early when the session token was empty — which is exactly the passkey mode (owners coming from the console). The console bell read the same inbox and showed the count; the menu showed nothing. One inbox, two different readers: that class of bug is gone with the shared topbar below.

### Added
- **One topbar for the whole suite** (`sdk/js/hub-client.js` → `mountTopbar`): brand (company logo or the suite mark → the menu) · app name · Apps ▾ (your apps, fresh on every open, filter from six apps) · bell · theme · you ▾. The hub's menu page mounts it (as "Menu · <company>"), and so does every app — the same element order, the same panels, the same words, wherever you are. The bell polls the unread count every 30 s (cheap `suiteState` query), loads the list when opened, refreshes when the tab comes back and after every action; two missed heartbeats say "Can't reach the hub", an ended token says "Sign in again" — never a stale zero. Marking read happens before the link opens; the page title carries "(n)" while something is unread. **Sign out** from any app ends the hub session too (`?signout=1`). The theme travels with the sign-in ticket (`&th=`) so the look does not flip between apps; a notification's deep link survives the sign-in round trip. Hub-only options (Console button, picture section, Slack switch, jump, theme hook, ids) are ignored on any other origin — an app cannot make its top look different. UX review (20 findings) applied.
- **Suite token**: `redeemTicket` now also returns `suiteToken` (12 h, read-only). The app hands it to its frontend; the topbar uses it to call the hub directly for exactly six things — `suiteState`, `myNotifications`, `markNotificationsRead`, `portalApps`, `portalWhoami`, `myAvatarPortal`. Nothing else accepts it: no tickets, no requests, no reviews, no preferences.
- `suiteState(token)` query: email, name, unread count, expiry, active — the heartbeat every topbar and the console bell share.
- Console bell polls the same heartbeat (30 s, refresh on tab focus).

### Changed
- SDK `RedeemResult` gains `suiteToken : ?Text` (null on older hubs). Onboarding guide § 7 now prescribes the topbar; `check-sdk` fails when an app ships a `hub-client.js` or `tokens.css` that differs from the SDK's or does not mount the topbar.
- `kitchenConnect` reads the app's manifest up to three times before falling back to identity-only, and says so in its answer; new `resyncLanes(cid)` (admins, app panel → "Re-read what the app needs") and `kitchenResyncLanes(canisterId)` (the kitchen after every update) grant lanes an app needs but lacks — never remove one. Closes the silent-alert-path gap (an app without its notify lane).

## [0.13.0] — 2026-09-04

### Added
- **Bell in the console.** Admins whose key is linked to a person see their notifications count in the sidebar (same notifications as on the menu — alerts from the domain watch, hand-overs, access requests) and open them with one click; until now the bell existed only on the menu.

## [0.12.1] — 2026-09-04

### Changed
- The architecture diagram and the layer list name the new **watch** layer (domains watched: DNS changes, dangling names, expiry).

## [0.12.0] — 2026-09-04

### Added
- `hub_aiStatus` for connected apps: is a key set, does *this* app have the AI lane — so an app's settings page can say precisely what is missing instead of "either/or". Never returns the key.
- Deep link `#/apps/<id>/know` (also `access`, `menu`, `tech`) opens an app's panel on that tab — apps link here from their own settings.

## [0.11.0] — 2026-09-04

### Added
- **AI for your apps** (Settings → AI, owners): one API key for the whole suite — provider (OpenAI-compatible or Anthropic), address, model, optional model for pictures. Apps with the new lane **AI** fetch it with `hub_aiCredentials` for their own calls and report usage with `hub_aiUsed`; the page shows which app has the lane and how much it calls. The key is write-only and never reaches a browser; external (OpenID Connect) apps cannot get the lane.
- Lane `ai` in the connect wizard, the app panel and the docs (lanes, keys table, glossary); SDK `Hub` type and onboarding guide § 6b.

## [0.10.1] — 2026-09-03

### Added
- Recipes can ship an app's menu picture: after an install the kitchen hands it to the hub (`kitchenSetTileIcon`, kitchen only, kitchen 0.3.0). A picture an admin chose is never overwritten. The Kitchen page shows recipe pictures from the pantry.

## [0.10.0] — 2026-09-03

### Added
- **Pictures for menu entries.** Apps → Edit → On the menu → *Picture*: choose a file, the hub scales it to 128 × 128 (PNG, JPEG or WebP, ≤ 100 KB) and stores it. Shown on the menu, in the Apps list and on the sign-in card of external software; entries without a picture keep their two letters.
- **Sign-in skewer.** The sign-in page's skewer reacts: while the passkey dialog is open the pieces lift off and hover; when the sign-in worked they are stacked back onto the stick, bottom first, the skewer turns once and the page fades into the console or the menu. Cancelled or refused: the pieces settle back. Only after a click (silent session resume does not animate) and never for people who prefer reduced motion. Also on the way back from a company sign-in.

### Changed
- **Sign-in page** tidied: the company logo (if set) takes the wordmark's place and *kebab-stack* becomes a small product mark; the passkey button is primary, or secondary ("or sign in with your passkey") when company sign-in buttons exist; the line "No SSO providers configured yet" is gone from a page your people see.
- Plain words on the sign-in page: "Sign in with your passkey" (Internet Identity is named in the footnote).

### Removed
- The little skewer of app pieces top-right on the menu — it was full at four apps. The motif lives in the logo and the sign-in animation.

## [0.9.0] — 2026-09-03

### Added
- **Access page** (Requests · Temporary access · Reviews) — the governance layer on top of the one access rule per app. Nothing new to configure: every decision edits the rule the Apps page already shows.
- **Ask for access.** Apps a person may not use yet appear on their menu under *Not on your menu — ask for access*; they say why and for how long. Hub admins are notified, approve with a duration or deny with a note; the person is told either way and sees the outcome on the menu.
- **Temporary access.** Give a person an app (people list) or a group for 4 h · 1 d · 7 d · 30 d · until taken away, with a reason. The hub takes it away again by itself (5-minute tick), writes the journal line and tells the person. Approving a request creates such a grant. Groups managed by SCIM are never touched.
- **Access reviews.** Freeze who may use the chosen apps — one line per person, group, hub role or "everyone" — with a due date. Each app's **owners** (new: *who answers for this app*, up to five, Apps → Edit) decide from their menu; lines without an owner land with the hub admins. **Remove is effective at once** and the person is told; an "everyone" line can only be confirmed. Reviews close themselves when every line is decided; CSV export with spreadsheet-safe cells as evidence.
- Home shows waiting requests and running or overdue reviews under *Needs your attention*; the Access tabs carry counts.
- Docs: *Access governance — asking, lending, checking* under Apps & data, glossary rows, a comparison row (Okta Identity Governance, Entra ID Governance), roadmap line; the architecture diagram lists the layer.

### Changed
- `listConnectors` rows carry `owners`; `home()` carries `accessRequests`, `reviewsOpen`, `reviewsOverdue` (additions only).
- Removing an app or group ends its grants and withdraws its open requests.

## [0.8.2] — 2026-09-03

### Fixed
- `version()` kept answering 0.8.0 after the 0.8.1 upgrade: in a persistent actor a plain `let` is stable and keeps its first-install value, so the version constant was frozen. It is a `transient` constant now (the old stable field stays, unused, because dropping it would need a migration). The Kitchen card and the mismatch warning read the real build version again.
- The version button sits at the very bottom of the sidebar, separated from the You chip.

## [0.8.1] — 2026-09-03

### Fixed
- **The kitchen never downgrades.** The Kitchen page compared module hashes only, so a pantry packed before the running version offered "Update hub to 0.1.0" — and the attempt was stopped by the memory-compatibility check ("Memory-incompatible program upgrade"), with the snapshot taken first and nothing changed. Now the kitchen compares semantic versions with the running hub (`version()`) and with each app's install record: an older recipe shows "pantry is older (x < y) — repack the pantry" instead of a button, and the backend refuses the update as well.

## [0.8.0] — 2026-09-03

### Added
- **Apps as one list.** Hub apps, other software (OpenID Connect) and plain links in a single table: who may use it, what it may know, on the menu, Edit. The connect wizard first asks *what* you are connecting.
- **On-the-menu switch** per app. A hidden entry keeps its address and binding; an app can be taken off the menu without disconnecting it.
- **Per-app panel** (Edit): name and note; who may use it; what it may know; menu entry with address; technical details (service id, client id, redirect URIs, secret, switch off, remove).
- **Version and changelog** bottom-left in the hub; the frontend warns when backend and frontend versions differ.
- **What it costs** — an indicative cost table (one small engine vs per-seat SaaS) under Compared with…, with its assumptions stated.

### Changed
- The menu is **alphabetical for everyone**; the admin-set order is gone. People pin their own favourites, the menu remembers recents.
- Provider values and signing keys for other software moved to **Settings → Sign-in for other apps**; the connector contract moved to **How this hub works → Developers**.
- Lanes offered to an external (OIDC) app are limited to what a token can carry: who signed in, job profile, groups, hub role.

### Removed
- The Menu tab (drag-to-order, linked-app dropdown, manual entry form), the For developers tab and the separate Sign-in for other apps tab on the Apps page.

## [0.7.0] — 2026-09-03

### Added
- **OpenID Connect provider.** The hub signs people into software not built for it (Grafana, GitLab, Nextcloud, Outline, oauth2-proxy, any "sign in with OpenID Connect" switch): discovery, JWKS, authorize (302 to the sign-in view), token, userinfo — all as update calls. Authorization Code with PKCE only; RS256 by default, ES256 per client.
- **RSA in-canister**: RSA-2048 keys generated by a resumable prime search in the background (measured first: signing ≈ 0.7 B instructions, a 1024-bit prime ≈ 25 B on average), RS256 signing via CRT, self-check before use, owner rotation with a 24-hour overlap.
- Clients are connectors: lanes decide the claims, the access policy decides who may sign in, a lock-out refuses code, token and userinfo within seconds.
- Preset-driven setup: pick the app, paste its address; callback URI and menu entry are prefilled; after Connect the exact settings block for that app is shown.
- Consent card ("Sign in to X as Y? X will receive …"), remembered per app unless the app asks for `prompt=consent`.
- Tests: `hub/test/run-rsa.sh` (Motoko generates a key, OpenSSL verifies the signature), `hub/test/oidc-rp.mjs` (dependency-free relying party), `hub/test/grafana-oidc.md`.

### Security
- Two independent reviews (security, Motoko design) applied the same day: PKCE-downgrade protection, subject allocated at authorize time, rate limit on successful exchanges only (600 per client per 5 min), frame protection (`frame-ancestors 'none'` + runtime check), codes and tokens stored under their SHA-256, request body cap, duplicate-parameter and mixed-auth refusal, RFC 9207 `iss` in the authorization response, key generation resumed by the 5-minute tick after an upgrade, collect-then-delete on every map sweep.
- Header comments and labels that named the origin organisation were removed from the source, the served SDK interface and the module metadata.

## [0.6.0] — 2026-09-03

### Added
- **Kitchen** — an installer canister with a pantry of recipes. Install an app in one click (two canisters, code, frontend files with patched placeholders, wiring, menu entry, vault protection); update hub and apps with a snapshot first; adopt apps deployed by hand.
- **Cook your hub** — a fresh kitchen creates vault and hub from recipes, wires and protects them and hands out a one-time claim code; the code is planted as an environment variable before the hub's first message, so there is no open claim window. Install path A in `docs/INSTALL.md` (≈ 15 minutes, then browser only); path A′ from a release bundle needs only the `icp` CLI.
- Every backend the kitchen registers gets a default backup schedule (daily 03:00 UTC, keep 3); the vault accepts it only where no schedule exists.
- `kitchen/tools/preflight.sh` checks a machine before the first deploy.

### Changed
- Kitchen cards show "up to date" from the running module hash, not from version strings.

## [0.5.0] — 2026-09-03

### Added
- **How this hub works** as a wiki: eight tabs with deep links, a generated architecture diagram whose layout checker refuses overlapping labels, an honest comparison with Okta, Entra, JumpCloud and Google, keys and limits tables, a roadmap.
- The hub **serves its own SDK** under `/sdk/` with a freshness check; a viewer in the Developers tab.
- Sidebar **You** chip: photo, key id, theme, sign-out, "link it to me".

### Fixed
- Fact-check of the docs against the code found and fixed: a privilege escalation in linking a key to a person, bulk role clearing by helpdesk, invites for sample people, unscoped group lookups, missing journal entries, an unenforced directory mode, a too-generous SSO exchange limit.

## [0.4.0] — 2026-09-02

### Added
- **Vault** — backups by canister snapshot: targets, schedules, restore with a safety snapshot first, journal; the Backups page in the hub.
- **Home v2** for owners who are not IT: a one-line pulse, cards, a five-step setup path, "needs your attention", recent activity, a sample company to try things on.

### Changed
- **Plain language** on every working page (service · app · what it may know · the menu · lock out); technical words only in How this hub works and Developers.

## [0.3.0] — 2026-09-02

### Added
- **Portal v2 — one person plane**: passkey or company SSO, the same menu, tickets, notifications, avatar and requests for both.
- **kebab-hub SDK** (`mo:kebab-hub` + `hub-client.js`) and the agent onboarding guide; sign-in tickets bound to the menu entry that minted them.
- **Lanes and manifest**: an app declares what it needs and wants; the connect wizard shows it on a skewer; the access policy (everyone / selected groups, roles, people) with a live preview.
- Groups redesign with pickers, SCIM group push, "where is this group used", admin ⇄ portal switch, tabs with deep links on every page, the menu redesigned as a card with pins and recents.

### Fixed
- Bird's-eye review: cross-org leak in `team_members` (connector scope ignored), portal active gate, owner-only hub anchor and other HIGH findings.

## [0.2.0] — 2026-09-01

### Added
- **kebab-stack design system** and IA v2: Home, People, Apps, Sources, Activity, Settings; setup checklist; offboarding flow; invite lifecycle.
- **SCIM 2.0 server**: `/scim/v2` Users and Groups, bearer token, Okta and Entra PATCH dialects, soft delete; verified live against Okta.
- **Directory+**: the standard org profile (enterprise schema), groups, CSV import and export.
- **Roles**: owner / admin / helpdesk, held by the person, inherited by every key.

## [0.1.0] — 2026-09-01

### Added
- The hub as an open, generic layer: deployment configuration and origin-specific identifiers stripped, placeholders in `dist/`, a generic install guide.
- First-run wizard (claim the hub, become owner), invite-claim flow for people, local directory.
