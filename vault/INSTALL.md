# Install the vault

Ten minutes. Needs: the hub already claimed (you are its owner), the `icp` CLI
linked to the identity that deployed the hub (see `docs/INSTALL.md` §1–2).

> First run `npm ci` at the repo root and add its `node_modules/.bin` to PATH
> as in [the main install guide](../docs/INSTALL.md). Build in a separate checkout.

## 1 · Deploy (backend only — the vault has no UI of its own)

```bash
cd kebabstack/vault
mops install --locked
icp deploy -e ic --subnet <SUBNET-ID>
```

Note the backend canister id — the **vault id**.

## 2 · Point it at the hub

The vault trusts the hub to answer "is this principal an owner?" — and only
that hub.

```bash
icp canister call backend setHub '("<HUB-BACKEND-ID>")' -e ic
icp canister call backend info -e ic       # shows hubId + the vault's principal
```

## 3 · Tell the hub

Hub → **Backups** → **Setup (IT)** → paste the vault id → Save. The page now lists
every canister of the suite (hub backend + frontend, each connected app's
backend and its tile's frontend) — all "not yet" protected.

## 4 · Make the vault a co-controller

Only controllers may snapshot. The Setup tab prints one line per unprotected
canister; run them from the identity that deployed each canister:

```bash
icp canister settings update <CANISTER-ID> -n ic --add-controller <VAULT-ID> -f
```

`-n ic` because you address the canister by id, not by project name; `-f`
because the confirmation prompt otherwise swallows the run. You keep your own
controller; the vault is added. Verify with `icp canister status <CANISTER-ID>
-n ic | grep -i controllers`, then **Re-check all** — rows turn "protected".

Alternative: the Console's canister settings page has the same "add
controller" field.

## 5 · First snapshot and a schedule

Services → **Snapshots…** → note → **Snapshot now** (the canister is stopped
for a few seconds). Then **Schedule…**: daily at 03:00 UTC, keep 7 is a good
default for backends; frontends rarely need more than keep 2.

## What to expect

- A snapshot stops → snapshots → starts the canister; users see a few seconds
  of "canister is stopped" if they hit it in that window. Schedules run in the
  hour you pick.
- Platform limit: 10 snapshots per canister. `keep` rotates the oldest out.
  Snapshots count towards the canister's storage.
- **Restore** replaces the canister's whole state (Wasm + memory) with the
  snapshot. Everything after that moment is gone. The vault takes a safety
  snapshot of the current state first (default on); you also have to type the
  canister's name.
- After an upgrade with changed stable types, an OLD snapshot restores the OLD
  Wasm too — that is fine, that is what a rollback is.
- The vault cannot snapshot itself (a canister cannot stop itself). It holds
  only schedules and notes; redeploying it is cheap.

## Remove

Hub → Backups → Setup → clear the vault id → Save. Then remove the vault from
each canister's controllers (`--remove-controller`) and delete the vault
canister from the Console. Snapshots already taken stay with their canisters
until deleted there.
