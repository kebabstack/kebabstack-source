# Changelog

## [0.12.4] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes.

## [0.12.3] — 2026-09-22

- Use canonical suite geometry and semantic brand tokens in shared sign-in/navigation. Standardize 44 px controls and light/dark foreground pairs. Preserve pointer focus when dismissing menus and cancel deferred focus after close/destroy; authentication and directory contracts are unchanged.

## [0.12.2] — 2026-09-22

- Embed the canonical product-logo registry and support explicit `app.id` marks in the shared topbar. Standardize sign-in target marks and menu image presentation. The logo rules are part of the onboarding guide; authorization and directory contracts are unchanged.

## [0.12.1] — 2026-09-21

- Use the corrected shared JSON sanitizer: large external responses no longer build a deeply nested text value, and escaped backslash literals remain unchanged.
- Shared app sign-in markup distinguishes automatic verification from an actionable sign-in screen.

## [0.12.0] — 2026-09-19

- Added the supplemental Desk reporting grant/capability definitions and delimiter-safe project permission checks. Existing six-app roles and Lunch directory payloads remain unchanged.

## [0.11.0] — 2026-09-19

- Add the Crumbs analytics permission vocabulary (none, viewer, admin); deny access by default. No directory or stable type changes.

## [0.10.0] — 2026-09-18

- Added the aggregate-only Operations snapshot contract. Directory, permission, Hardware, Support and Lunch interfaces are unchanged.

## [0.9.0] — 2026-09-18

- Added the Hardware case/progress protocol for registered Desk and Assets services. It carries case identity and aggregate progress; device actions remain Assets-admin-only and are checked through Hub. The directory, Support, permission and Lunch contracts are unchanged.

## [0.8.0] — 2026-09-17

- Added the bounded Support protocol for read-only person context and directory lifecycle events. The existing directory, permission and Lunch contracts are unchanged.

## [0.7.0] — 2026-09-17

- Shared app sign-in state, screen template and Hub styling for the six permission-managed tools. Duplicate starts are locked; session checks, ticket errors and retries have one state model.
- Hub jump URLs normalize the Hub address and remove unrelated route/query fragments while preserving the tool’s saved deep link.
- `tools/sync-signin.py --check` detects drift in the shared markup, stylesheet and all browser-client copies. No Motoko interface or stable-state contract changes.

## [0.6.0] — 2026-09-17

- Shared permission vocabulary and strict Hub app-role validation for Assets, Contracts, Desk, Forms, Trust and Watch. Unknown or missing models deny access; local claims and lists are not fallback authority.
- Role provenance and revision helpers preserve the stable directory record shape. The served SDK includes Permissions.mo.

## [0.5.0] — 2026-09-09

- Shared app switcher redesigned with readable app names, current-app context, search result counts and keyboard search/opening.
- Search uses a padded wrapper and scoped input rules so application-wide input styles cannot push it outside the panel. Responsive sizing, light/dark colours and scroll limits are shared by every consuming app.
- No Motoko interface or sign-in protocol changes. App copies of hub-client.js are synchronized from the SDK source.


## [0.4.1] — 2026-09-06

- `tools/did2idl.py`: the dependency order of emitted types treated `IDL.Record(`/`IDL.Opt(` and field keys as references to same-named .did types — a service with a type called `Record` (contracts) got `Contract` emitted before `Terms` and the generated `idl.js` threw on load. Bare identifiers only now; the six existing apps regenerate byte-identical.

## [0.4.0] — 2026-09-06

- **One address per id.** `syncDirectory` now retires the previous address of a renamed person from `ids` (before, the old address stayed and `emailOf`/`personById`/`isActiveId` could answer the dead address — notifications to renamed people were lost). Lookups prefer an address whose row is active while old data still holds duplicates; new `currentEmailOf(people, ids, pid)`.
- **`upsertRows(people, ids, former, sessions, rows)`** for `hub_upsert`: the same hand-over protection as the sync (a re-issued address parks the previous holder under `former` and ends their sessions; a real id is never downgraded to `legacy:`). Apps that wrote `ids` by hand in `hub_upsert` skipped that protection — the example and the onboarding guide now use the helper.
- `sanitizeSurrogates(text)`: run any JSON from outside (Slack, DNS, RDAP, IdP) through it before `mo:json` — the parser traps on emoji escapes.

## [0.3.0] — 2026-09-06

- **Person ids** (hub ≥ 0.17): `DirectoryRow` = ConnectorUser + `id : ?Text` is what `connectorDirectory` and `hub_upsert` carry; `RedeemResult.id`; `connectorLookup` on the hub type.
- New app-side tables `ids` (address → id) and `former` (id → last row of a person whose address moved on), filled by `syncDirectory`; `pidOf`, `personById`, `emailOf`, `isActiveId`, `rowId`, `isLegacy`; `lookupIds` + `migrateKey` for the one-time migration of e-mail-keyed data. Older apps keep compiling: `ConnectorUser` and `Session` are unchanged (a stable record cannot grow), a `DirectoryRow` passes wherever a `ConnectorUser` is expected.
- Onboarding guide: store people as ids, render with `personById`, migrate on upgrade (docs/PERSON-IDS.md).

## [0.2.0] — 2026-09-05

- Keep shared topbar controls usable on narrow screens, including the Hub console menu.

- Add complete-directory replacement and a strict 60-second authorization lease.
- Refresh the example and onboarding guide: controller-only setup, stale-response guards, absence revocation and post-await login checks.
- Distinguish partial pushes from complete pulls and explicit owner AI credential grants.
- Keep served documentation/bindings in step and pin portable dependency tooling.
