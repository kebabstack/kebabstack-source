# kebab-stack update service

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

Hub owners manage software in **Apps → Updates / History** and install additional suite apps under **Add app**. A separate installer executes the jobs; its asset canister stores the published releases. Kitchen and Pantry remain internal deployment names, not separate daily administration screens.

| Component | Responsibility |
|---|---|
| Installer backend (`kitchen`) | Validates releases, creates apps, takes snapshots, updates code and verifies the result. |
| Release store (`pantry`) | Immutable backend/frontend packages plus the first-install bootstrap page. |
| Hub | Owner review, installation/update progress and recent operation history. |
| Release CLI | Publishes tested packages; uses the same executor for app/Hub updates; maintains the installer itself. |

## Routine updates

An operator builds a clean, committed checkout and publishes a verified bundle once. Hub and CLI use those same artifacts. A release includes the actual backend hash, each frontend file's checksum, source provenance, notes and prerequisites. Publication retains earlier packages and activates the catalogue atomically.

The update executor verifies the package and existing configuration, saves backend and frontend snapshots, stages all frontend files, upgrades the backend with preserved memory and publishes the frontend in one batch. It then verifies both components and retained deployment properties. Existing sign-in origins, domain files and application HTTP settings remain. Normal updates do not grant new data lanes or change app roles.

A direct deployment is current only when its backend and frontend match the published release. A matching backend with a different frontend needs repair. A newer installed version is reported without a downgrade action. Failed jobs remain visible. Automatic data rollback is deliberately absent: it could discard new business writes. The [operator guide](INSTALL.md) covers recovery, forced interruptions and publication limits.

## First installation

A fresh installer can create the company's Vault and Hub from the bootstrap page. A private one-time setup code or controller authorization is required; there is no public claim window. The Hub claim code is planted at creation and shown only to the person who started setup. Both releases must pass package verification before creating services.

Installing a suite app creates its two services, sets their Hub connection, registers the app/menu entry and hands both components to Vault. New central-permission apps need a saved policy in Hub before employee sign-in. Daily backend backups default to 03:00 UTC with three retained snapshots; owners can change the schedule under Backups.

Hub and Vault are discovered from the existing Hub configuration. Older manually installed suite apps are adopted once by an operator after controller and app-identity checks. External tools and directory-only integrations such as Lunch keep their own deployment workflow.

## Trust and operations

The installer is a controller of managed applications. Only the configured Hub's owners and installer controllers may start operations. The configured release store is an operator trust boundary: checksums verify consistency with that source, not a vendor signature. One job runs at a time; installation records and recent history survive upgrades.

Cloud Engines such as OpenCloud support the zero-cycle management operations used here. Initial controller setup, publication of new software, installer upgrades and exceptional recovery remain operator work. Backend and frontend are separate canisters; their upgrade cannot form one cross-canister transaction.

See [installation and operation instructions](INSTALL.md) and [release changes](CHANGELOG.md).
