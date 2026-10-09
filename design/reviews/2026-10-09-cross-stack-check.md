# Cross-stack check — 2026-10-09

Standing rule (owner, 2026-10-09): every change, however small, is checked against the whole suite and the
other apps are pulled along in the same release. This is the first full pass. Facts only; each line names the
contract, the consumer, and what was done or deliberately left.

## Contracts between apps (what to re-check on every change)

| Contract | Producer → consumer | Where |
|---|---|---|
| `hub_personContext` / `hub_supportSources` | Assets, Contracts, Trust, Watch, Forms → Hub → Desk person panel | `*/backend/main.mo`, `hub/backend/main.mo` (brokers), `desk/dist/person-context.js` |
| `hub_syncHardware` | Desk → Hub → Assets (custody) → Desk checklist "Reclaim devices" | `desk/backend/main.mo` syncHardware, `assets` syncHardwareCase |
| `hub_syncSeats` | Desk → Hub → Contracts (seat holders) → Desk checklist "Revoke licenses & seats" | Desk 0.31, Hub 0.39, Contracts 0.12 |
| `hub_operations` | Desk, Assets, Trust, Contracts, Watch → Hub Operations page and TV (`#/tv`) | `hub/dist/operations.js`, `hub/dist/displays.js`, whitelist `hub/backend/Displays.mo` |
| `hub_lifecycleEvents` | Hub → Desk (offboarding, onboarding) | `hub/backend/Lifecycle.mo`, `desk` syncLifecycle |
| `hub_notify` | every app → Hub bell / Slack | outboxes in each app |
| `hub_ownedObjects` / `hub_reassign` / `hub_usesGroup` | apps → Hub ownership view and group deletion guard | per app |
| `trust_serialOwners` | Assets → Trust (device owner) | `assets` export, `trust` pullOwners |
| Forms → Desk delivery | Forms → Desk customer intake | Forms 0.6, Desk intake |
| SDK copies | `sdk/motoko/src`, `sdk/js/hub-client.js`, `hub/dist/tokens.css` → every app | `hub/tools/sync-sdk.py`, `sdk/tools/check-sdk.py`, `tools/sync-bindings.py` |

## Changes of the last days and what they touched

| Change | Shipped | Consumers checked | Pulled along now |
|---|---|---|---|
| Desk 0.30 late replies, Slack reactions | 2026-10-06 | Hub notify, Slack scopes | docs only |
| Hub 0.38 `#created` lifecycle events → Desk onboarding | 2026-10-06 | SDK `Support.Event.kind`, Desk, every app that decodes events | SDK 0.15 synced to all apps at the time |
| Hub 0.38.1 TV redesign | 2026-10-06 | TV tests, display API unchanged | — |
| Contracts seats + Trust marker (0.12 / 0.10) | 2026-10-06 | Desk checklist, Hub broker, docs/LIFECYCLE | **Operations/TV had no seat metric** → Contracts 0.12.1 `seatsHeld`, Hub 0.39.1 |
| Assets 0.19.1 one-step payments | 2026-10-06 | Finance notices, Hub notify | — (ledger unchanged) |
| Assets 0.20–0.22 labels, registration, bulk photos | 2026-10-07 | Hub company logo (read), Trust serial export (unchanged) | — |
| Assets 0.23 `deployed` status + locations | 2026-10-08 | **Operations/TV did not know the status** (counted only in total); person panel lacked location | Assets 0.23.1 `deployed` metric + location in person context, Hub 0.39.1 optional metric, docs table |
| Desk 0.31.1 Slack mentions | 2026-10-08 | Slack intake only | — |

## Done in this pass (Hub 0.39.1, Assets 0.23.1, Contracts 0.12.1)

- Hub display whitelist gains **optional** metrics (`Displays.optional`): a newer app may send them, an older
  app without them is still a valid source. TV (`displays.js`) and Operations (`operations.js`) treat missing
  optional counts as 0. Before this, any new metric key would have turned a TV card into "Source unverified".
- Assets reports `deployed`; TV detail line and Operations context say "n deployed at a location".
- Contracts reports `seatsHeld`; Operations shows a row and a follow-up item "Release seats of departed
  people"; the TV focus list includes it.
- Desk person panel: Assets items carry "at <location>".
- `docs/HUB-OPERATIONS.md` definitions updated for both.

## Checked and left as is (with reason)

- Trust `trust_serialOwners`: deployed devices have no owner, so nothing to export; a location column in Trust
  would need a second export (`trust_serialPlaces`) and a Trust release — queued, not urgent.
- Hardware offboarding counts devices by assignee; deployed devices are not personal, correct as is.
- CSV import accepts `deployed` through the status vocabulary; README import section lists the statuses generically.
- Watch, Forms, Crumbs, Bug: no contract touched by the recent changes.

## Still open from the audit (next blocks)

1. Watch watchers and Forms ownership at offboarding (same pattern as seats).
2. Trust: device location from Assets.
3. SDK consolidation of the six connector copies.
4. Operations coverage for Forms and Crumbs.

## Contracts 0.13.0 — contract types (same day, second pass)

- Contracts: shared core + admin-defined type fields; starter types for SaaS, datacenter, telecom, hardware,
  services, rent, other. Existing records stay SaaS. Reminders run against the cancellation deadline.
- Hub: `hub_personContext` lists a person named in a type field ("Access contact", "Broker contact"), so the
  Desk person panel and offboarding see them. `seatsHeld` only counts types with seats. No new Operations keys.
- Desk: no change needed; the person panel reads the context items as before.
- Docs: Contracts README (types, reminders), CHANGELOG 0.13.0. `docs/HUB-OPERATIONS.md` unchanged (no new metric).
- Tests: `tests/security.test.mjs` "contract types" case; smoke fixture carries a datacenter record.

## Contracts 0.13.1 — workspace selector (owner feedback, same day)

- Owner saw one "Personal · <name>" per directory person plus two "IT" teamspaces and could not delete any.
  Cause: `listSpaces` enumerated every directory person for admins; no delete endpoint existed.
- Now: selector = memberships (personal, own teamspaces) + shared (intake, legacy) for admins; everything
  reachable by role only sits under Settings → All workspaces (other people's personal workspaces only when
  they hold records, with e-mail). `deleteSpace` removes an empty teamspace (owner, revision-checked), ends
  bound sessions, drops relay links and the reminder policy.
- Cross-stack: no Hub/Desk contract touched (`SpaceView` is Contracts-internal). Docs: README access section.

## Contracts 0.14.0 — no e-mail, one reminder policy per workspace (owner request, same day)

- Mail relay removed end to end: worker (`contracts/relay`, its lock moved to `contracts/tools/pdf-text` for the
  PDF bundle), Relay tab, Mail setup guide, contracts address, per-space relay binding, `setSpaceRelay`,
  `setRelayPrincipals`, relay caller path in `intakeBegin`. Stable vars stay (upgrade contract), unused.
- Reminders: the per-workspace policy (`setRenewalPolicy`) now drives deadlines, typed dates and tasks; the
  global `reminderDays` is retired; the 90-day mark is no longer mandatory. Titles start with the workspace name.
- Cross-stack: Hub `hub_notify` unchanged (e-mail → Slack DM; no channel target exists in the Hub, so a
  per-workspace Slack channel would need a Hub lane change — noted as a follow-up). Desk/Assets untouched.
- Docs: README, INSTALL, OPERATIONS, agent guide, CONTRACTS design note, GAPS.

## Contracts 0.14.1 — AI type classification (owner test upload, same day)

- A moving-company order confirmation landed on SaaS: `contractType` was missing from the answer schema and a
  classification carries no quote, so it was dropped; the review then defaulted to SaaS.
- Now: schema and prompt require a type by subject matter; a classification needs no evidence; unknown type
  names become a `typeProposal` (validated fields) the review can create in one click; unknown `type:` keys are
  dropped with a note; "Read again as the selected type" pins a type (`reprocessSourceAs`). Default is Other.
- Cross-stack: none (Contracts-internal AI contract). Tests: PocketIC classification case, smoke proposal card.

## Contracts 0.14.2 / 0.15.0 — upload path simplified (owner feedback, same day)

- Owner saved an upload, landed on an empty list: the AI had classed the Bechtle invoice as a billing
  document, which the list hid. Fixes: save opens the record; billing documents are listed and tagged;
  "Track as subscription" converts one; the document type sits in the first review section; invoices
  with a period/seats default to a tracked subscription; titles come from vendor and product.
- 0.15.0: new documents open the review directly (inbox rows, Today items, pasted text, `#/inbox/<id>`
  redirect); saved documents show "Saved as <contract>", their inbox page is history. "Proposals" became
  "Suggested changes" (for mails about existing contracts); plain-language statuses.
- Cross-stack: none; Hub notifications unchanged. Backend only bumps the served version.

## Contracts 0.16.0 — tester feedback (same day)

- Radoslaw: contracts without a document (old agreements) and several documents per contract. Owner: the
  leftover "suggested changes" path contradicts "no e-mail in Contracts".
- Now: one review for new and existing records (`fileToContract`), "+ Add document" on the record,
  "Add by hand" for paperless contracts. Cross-stack: none.
