# Update service — operator guide

The company manages apps in **Hub → Apps**. Connected apps holds access, data sharing and menu settings. Owners install suite apps under **Add app**, review software in **Updates**, and inspect operations in **History**. External tools such as Lunch continue using their existing deployment and directory integration.

The installer (historically Kitchen) is a separate privileged canister. Its asset canister (historically Pantry) stores releases and the first-install bootstrap page. The store is infrastructure, not another application for employees or IT administrators to maintain by hand.

## Publish and deploy a release

Use a clean, reviewed checkout. Install pinned dependencies with `npm ci`. The packer builds every component, checks stable compatibility against its committed baseline and reads committed frontend files. Never pack a working copy containing live IDs.

```sh
python3 kitchen/tools/pack-recipes.py --build --out /absolute/release/recipes
node kitchen/tools/release.mjs publish --bundle /absolute/release/recipes --kitchen INSTALLER_ID --identity OPERATOR
node kitchen/tools/release.mjs check --kitchen INSTALLER_ID --identity OPERATOR
```

The publisher verifies all files locally, refuses changes to existing immutable package paths, uploads a complete batch and activates its index atomically. Earlier releases and bootstrap/domain files remain in the store. Static files include checked gzip variants for efficient delivery; files containing deployment placeholders use their verified configured identity representation. Backend provenance is stamped **before** the manifest is hashed. Publish these exact artifacts; do not stamp them again during deployment.

Hub then offers only releases available from this company's configured source. It does not scrape GitHub or assume the operator's latest checkout is a tested release. A future vendor release feed can publish to the same store; no unattended external feed is currently enabled. A CI system can run the same publisher with an explicitly configured operator identity.

An operator can start the same job from the terminal:

```sh
node kitchen/tools/release.mjs update --app assets --kitchen INSTALLER_ID --identity OPERATOR
node kitchen/tools/release.mjs install --app forms --kitchen INSTALLER_ID --identity OPERATOR
node kitchen/tools/release.mjs verify --app assets --kitchen INSTALLER_ID --identity OPERATOR
```

`update` and `install` bind to the current published release ID. `verify` changes no application code: it checks the installed backend and complete frontend and records the result. A direct deployment is current only if it matches the same artifacts. A newer running version is reported without offering a downgrade. A different build with the same version requires review.

## Upgrade the installer

The installer cannot reliably upgrade itself while keeping its own operation alive. Update it once with the operator CLI, while no job is running:

```sh
node kitchen/tools/release.mjs upgrade-installer --bundle /absolute/release/recipes --kitchen INSTALLER_ID --identity OPERATOR
```

This saves a snapshot, upgrades with preserved Wasm memory, then checks the module hash, version, Hub/source binding and all canister settings. It preserves existing installation records and job history. Version 0.7.0 is required before Hub 0.25.0 can use the new update API. Publish the format-2 bundle after upgrading an older installer. Its initial bootstrap page does not need to be replaced on each release.

## Connect an existing company once

Deploy the installer and its asset canister using `kitchen/icp.yaml` on the company's Cloud Engine (OpenCloud supports the zero-cycle management operations used here). Set a private setup code for a new unclaimed stack with `python3 tools/setup-code.py kitchen --environment ic`; never expose an open claim window.

For an existing Hub, use the original controller identity to configure:

```sh
icp canister call INSTALLER_ID setHub '("HUB_BACKEND_ID")' -n ic --identity OPERATOR
icp canister call INSTALLER_ID setPantry '("RELEASE_STORE_ID")' -n ic --identity OPERATOR
icp canister call HUB_BACKEND_ID setKitchen '("INSTALLER_ID")' -n ic --identity OPERATOR
icp canister call VAULT_ID setKitchen '("INSTALLER_ID")' -n ic --identity OPERATOR
```

The Hub's `setKitchen` call requires its owner identity. The operator controller can configure the installer and Vault. Retain the company's existing controllers; add the installer as a co-controller of Hub backend/frontend, Vault, and both components of each app it will manage. Vault must control application backends and frontends to take their snapshots. The installer handles Vault's own snapshot directly.

Hub and Vault are discovered from the existing Hub configuration. For an older manually installed suite app, the operator adopts the existing pair once; this does not redeploy it or change its role policy:

```sh
icp canister call INSTALLER_ID adopt '("assets", "APP_BACKEND_ID", "APP_FRONTEND_ID", "")' -n ic --identity OPERATOR
```

Adoption checks controllers and the backend's app identity. Its historical version field is informational; subsequent checks read the actual running code. Non-suite integrations are not adopted. New central-permission apps need a saved Hub policy before their first protected sign-in.

## Update and recovery behavior

An update first verifies the package, dependencies, running components and existing sign-in configuration. It then takes **both backend and frontend snapshots**, stages the frontend, upgrades the backend with preserved memory and publishes the entire frontend in a single asset-canister batch. Finally it checks the backend hash/version, all published frontend files and retained deployment properties. Only then is the installed release recorded as complete.

Existing custom Hub URLs, canonical origin, domain files, application HTTP headers and cache properties are retained. The asset canister may refresh its own `ic_env` discovery cookie during publication. Temporary Prepare/Commit grants are revoked on success or handled failure. Existing unrelated assets remain; removing obsolete application files requires an explicit migration. Package contents are checksummed against the operator's trusted source, not independently signed by a vendor.

Backend and frontend are separate services, so they cannot be upgraded in one cross-canister transaction. A failure after the backend step leaves a visible repair operation. Retrying the same release retains an already matching backend and repairs the frontend. Data is **never automatically rolled back**, because new writes after an update could otherwise be lost. For incompatible changes, plan a maintenance window and recovery with the operator.

Inspect **Apps → History** for the failed stage and snapshot references. If the process or installer is forcibly terminated, inspect asset-canister batches and the installer's Prepare/Commit grants; remove only grants introduced for that operation. Snapshot retention is managed by Vault; the installer self-upgrade retains up to the platform limit and replaces the oldest only when necessary. Restore snapshots only after reviewing which new data would be discarded.

Avoid manual deployments or installer upgrades during active jobs. A 30-minute watchdog marks abandoned operations failed; it cannot undo external changes or recover a stopped service after a platform outage. Controller-level recovery remains an operator task. Restoring a snapshot, removing failed-install leftovers or forgetting an adopted installation is deliberate, never an automatic cleanup.

## Product logos in the Cloud Engine console

Product logos come from `design/logos/registry.json`. After installing/updating the
corresponding frontend files, inspect the console metadata with:

```sh
node kitchen/tools/sync-console-brand.mjs --kitchen INSTALLER_ID --identity OPERATOR
```

This read-only check verifies the actual image bytes at every intended URL before
preparing a change. Add `--apply` to correct the main-canister flag, icon path and
base URL; add `--out /private/path/report.json` to retain the result. The command
preserves and checks every unrelated setting. It needs the existing Hub owner
and controller identity; it never grants itself an app role. Vault uses the Hub's
served `/brand/vault.svg`. Kitchen uses its release-store frontend's favicon;
update that bootstrap asset separately without replacing the stored recipes,
domain declarations, permissions or other bootstrap files.
