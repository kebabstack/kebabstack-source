# Person IDs — one stable identity per person

Decision 2026-09-06 (hub 0.17, SDK 0.3, then every app). Status: built in full on
2026-09-06 — hub 0.17.0, sdk 0.3.0, desk 0.6.0, assets 0.6.0, forms 0.2.0, trust 0.2.0,
watch 0.5.0, bug 0.2.0; see the changelogs and the deploy ledger for what is live.

## Why

Until 0.16 the e-mail address *was* the identity, everywhere: the hub resolved
access, roles, passkey links, group seats, access policies, grants, reviews,
notifications and OIDC subjects by e-mail, and every app keyed its own data
(tickets, devices, forms, boards) by e-mail. Two things break under that model:

- **Renames.** A person's address changes (name change, domain change,
  IdP migration). The IdP updates the record; every reference in the hub and in
  the apps now points at a stranger, and SCIM refused the rename outright
  (`409 userName rename requires coordinated identity migration`).
- **Re-issued addresses.** A leaver's address is handed to a newcomer. The
  newcomer inherits the leaver's history in every app — and in the hub also
  their **passkey links, hub role, group seats and grants**, because
  `accessOf(email)` finds an active account under that address again. That is
  an access-control bug, not only a privacy leak.

## The model

**One opaque, stable ID per person**, minted by the hub, never reused:

```
p_<16 hex>      e.g. p_3f9a1c77b2e04d5a
```

Derived as `sha256(seed ‖ counter)` from a per-hub random seed (raw_rand, minted
once) and a stable counter — synchronous, unique, unpredictable, no head-count
leak. IDs are minted for every account the hub knows, active or not.

The hub keeps a **person registry**:

| structure | content |
|---|---|
| `persons : pid → { email (current); emails (history); createdAt; sealedAt }` | the person |
| `userKeyToPid : "connId:externalId" → pid` | which accounts are this person |
| `emailToPid : email → pid` | who holds an address **now** |

**Merge rule** (when an account is first seen): if its address is currently held
by a person who still has an **active** account, the new account joins that person
(same human, second source — the pre-0.17 semantics). Otherwise a new person is
minted — and if the address had a previous holder, that holder is **sealed**. The
newcomer's own status does not matter (hub 0.19): IdPs stage people inactive first,
and 0.17/0.18 attached such a newcomer to the departed holder, which handed them the
holder's role, keys and seats on activation (audit HB1-01). A source that tries to
move an account onto an address another *active* person holds is refused: the old
address stays and the journal says so (`addressHeldByOther`, SCIM and sync alike).

**Rename** (`renamePerson`): one update call rewrites every hub structure that
references the old address to the new one — roles, passkey links, invites,
group seats, policy people, app owners, grants, requests, reviews,
notifications, Slack opt-out, avatar, OIDC subject and consents, connected AI
assistants and pending assistant codes (0.19), live sessions
and suite tokens — then updates the registry. Journaled. SCIM renames are
accepted; IdP-sync renames are detected by `reconcilePersons()` after every sync
and by a periodic safety net.

**Sealing** (address re-issued to a new person): the previous holder's
*configuration* references under that address are deleted (role, passkey
links, invites, group seats, policy entries, ownerships — nothing may transfer
to the newcomer) and their *history* references (notifications, grants,
requests, review items, OIDC subject/consents) are rewritten to the sealed form
`address#pid`, which the UI shows as "former person". The newcomer starts with
nothing.

Inside the hub the **current e-mail remains the working key** — the hub is one
canister and the rewrite is atomic, so there is exactly one source of truth
(the registry) and no distributed consistency problem. Rekeying 150 hub
functions and their frontend would buy nothing but risk. (Decision 2026-09-06:
"Register + atomarer Rename".)

## What the hub exposes

- `ConnectorUser.id : ?Text` on `connectorDirectory` and on the `hub_upsert` push (wire-optional so the SDK's `?Text` decodes it exactly; it is always set).
- `redeemTicket → { …; id : ?Text }`, `portalWhoami / suiteState / ssoWhoami → { …; id }`, `UserView.personId`.
- `connectorLookup(emails : [Text]) : [(Text, Text)]` — address → id for any
  address the hub has ever known (connectors only; departed people included).
  Apps use it once, to migrate their e-mail-keyed data.
- Users page: the ID on the person card (copyable), address history, "former
  holder" note; local people can be renamed (Users → edit e-mail).
- `hub_notify`, `ownedObjects`, `reassignOwned` keep taking e-mail addresses:
  the app resolves them against its directory cache (current people) or its
  `former` table. The wire contract does not change for old apps.

## What an app does (SDK 0.3/0.4, mo:kebab-hub)

Apps go **fully ID-keyed**: every stored reference to a person is a pid; the
e-mail is display data resolved through the directory cache at read time.

- `Hub.DirectoryRow` = `ConnectorUser` + `id : ?Text` is what the hub sends. The
  stored `ConnectorUser` and `Session` types stay as they are — a record inside a
  stable map cannot grow, not even by an optional field (verified with
  `moc --stable-compatible`); the id lives in a new stable table instead.
- Two app-side tables next to `people`: `ids : address → id` (every address the
  app has seen) and `former : id → last row` (a person whose address moved on to
  someone else — so their name still renders on their old records). Complete
  directory replies go through `Hub.syncDirectory(people, ids, former,
  sessions, rows)`.
- `Hub.pidOf(ids, email)` at the API boundary (pickers still choose by
  address/name, the backend stores the id); `Hub.personById(people, ids,
  former, pid)` for display (`{ id; email; displayName; active; known }`);
  `Hub.emailOf(ids, pid)` for notifications; `Hub.isActiveId` for gates.
- The scaffold's `me(tok)` returns `{ id; email; displayName; role }` with
  `id = pidOf(ids, s.email)` — sessions stay keyed by token, carry the address.
- **Migration on upgrade**: the app sets `idMigration = #pending` in
  `postupgrade`, a zero-second timer collects every distinct e-mail in its
  domain data, asks the hub `connectorLookup`, rekeys, and marks unknown
  addresses `legacy:<email>` (`Hub.lookupIds`, `Hub.migrateKey`); until it finishes, write methods answer
  `{ ok = false; detail = "people ids are being migrated — try again in a minute" }`.
  The hub must be on 0.17 before an app on SDK 0.3 is updated (the kitchen
  updates the hub first anyway).

## Roll-out

| stage | release | what |
|---|---|---|
| A | hub 0.17 | registry, minting for all accounts at upgrade, rename + sealing, SCIM rename allowed, `id` in directory/ticket/whoami, `connectorLookup`, Users UI |
| B | sdk 0.3 (mo:kebab-hub) | `DirectoryRow`, `ids`/`former`/`syncDirectory`, `pidOf`/`personById`, migration helpers, onboard-app docs |
| C | desk 0.6.0 · assets 0.6.0 · forms 0.2.0 · trust 0.2.0 · watch 0.5.0 · bug 0.2.0 | data keyed by id, one-time migration right after the upgrade (writes refused for its few seconds), display-resolved views, smokes; update assets and trust in the same session (`trust_serialOwners` carries ids) |

## Limits, honestly

- A person who leaves and returns under a **new IdP account** is a new person;
  the old one stays sealed. A `mergePersons(old, new)` owner action is the
  planned follow-up — nothing is merged automatically.
- Two *active* accounts under the same address are still one person (merge
  rule); a rename into an address another active person holds is refused,
  journaled, and left for an admin.
- Moving a person from "added here" to SCIM/IdP mastering: push while the local
  record is still **active** (the accounts merge by address), then deactivate the
  local record. Deactivating first turns the pushed account into a new person and
  seals the old one.
- Existing OIDC subjects (`kb_…`) stay as they are so relying parties keep
  their `sub`; new subjects are minted as before. A rename moves the subject to
  the new address; sealing parks it under `address#pid`.
- Apps in the transition window (hub 0.17, app still on SDK 0.2) see a rename
  as one person leaving and another arriving — the pre-0.17 behaviour, for at
  most as long as the app update takes.
