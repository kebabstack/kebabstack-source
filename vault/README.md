# kebab-stack vault — the pantry

One small canister, one job: **snapshots** of the hub and of every connected
app — on demand, on a schedule, restorable from the hub's **Backups** page.

| | |
|---|---|
| holds | no business data — only target list, schedules, snapshot notes, a journal |
| can | `take / load / list / delete_canister_snapshot`, `stop / start` on the canisters it co-controls |
| who | hub **owners** only (the vault asks the hub `vaultAuth(principal)` before anything — fresh for every state change, 5-min cache for reads) and the vault's own controllers |
| where | snapshots stay inside the platform (max 10 per canister); the vault rotates the oldest out |
| UI | Hub → Backups (owner-only page): Services · Schedules · Activity · Setup (IT) |

## Why a separate canister

Snapshots are a **controller** operation and the canister must be **stopped**
while one is taken or loaded. A canister cannot stop itself and carry on, and
a hub → vault → `stop(hub)` chain would deadlock (stopping waits for the open
call to return). So the browser talks to the vault directly, and the vault
checks with the hub that the caller is an owner. Making the vault a
*co*-controller of the hub and of every app also makes it the most privileged
canister of the suite — which is why it does nothing else, is owner-only and
journals every action.

## API (owner or controller unless noted)

| method | |
|---|---|
| `setHub(id)` | controller only, once — the hub backend that answers `vaultAuth` |
| `info()` | hub id, vault principal, target/journal counts |
| `addTarget / removeTarget / listTargets` | the canisters to show; the hub registers its own automatically, custom ones are added under Setup |
| `status(cid)` | protected? (vault in controllers) · state · module hash · sizes · snapshots · schedule · busy |
| `snapshot(cid, note)` | stop → take → start; trims to `keep` first (max 10), replaces the oldest atomically when full |
| `restore(cid, snapshotId, safetySnapshot)` | checks the target exists → optional pre-restore snapshot (never evicting the target) → stop → load → start, all under one lock |
| `deleteSnapshot(cid, snapshotId)` | |
| `setSchedule(cid, {enabled; everyHours; atHourUtc; keep})` · `listSchedules()` | `everyHours = 0` = daily at `atHourUtc` (UTC) |
| `listJournal()` | newest 200 of the last 1000 actions (who, what, ok) |

Locks: one operation per canister at a time; a stale lock expires after 40 min
(a trapped run can never wedge a target). A canister that was already stopped
on purpose is left stopped afterwards; one that was running is always started
again (a stop that times out is cancelled by a start). If a canister could not
be started the result says so explicitly — `icp canister start <id> -n ic`.
Slow platform replies are re-checked against the snapshot list before the
vault reports failure; a restore whose reply was lost is flagged as "MAY have
happened" rather than guessed.

## Install

See `INSTALL.md` (deploy once, `setHub`, add the vault as co-controller of
each canister — the hub's Setup tab prints the exact commands).

## Deploy discipline

Same as every layer: `moc --stable-compatible backend/backend.most` before a
live upgrade; stable vars are append-only. And yes — snapshot the vault's
*targets* before upgrading them; the vault itself has nothing worth restoring
beyond its schedules.
