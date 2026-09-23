# Changelog — kebab-stack kitchen

## [0.8.3] — 2026-09-22

- Apply shared controls/tokens to the first-install bootstrap. Reject packages with stale shared runtime or design reference copies. Installer behavior and deployment settings remain unchanged.

## [0.8.2] — 2026-09-22

- Package WebP images as `image/webp`. This preserves the existing game backgrounds' correct content type; earlier catalogues labelled them as generic binary files and the update executor correctly refused that mismatch before changing application code. No image data or installer state changes.

## [0.8.1] — 2026-09-22

- Publish the canonical line mark in the release catalogue. The packer verifies the central logo registry before creating releases. Add a read-only-by-default console-logo reconciliation command with exact asset checks and preservation of unrelated settings. No stable-state or operational changes.

## [0.8.0] — 2026-09-19

- Add the Crumbs analytics recipe, requiring Hub 0.30.0. Its separately operated collector is configured according to crumbs/INSTALL.md. No installer state changes.

## [0.7.4] — 2026-09-18

- Hardware-aware Assets and Desk release recipes require Hub 0.27 or later, so the update executor cannot install their new coordination features against an older Hub. Existing installer operations and unrelated app prerequisites are unchanged.

## [0.7.3] — 2026-09-17

- Package Desk’s public customer-support entry point with its own backend binding. Widget and private ticket pages deploy alongside the staff app without invoking Hub sign-in. No installer state or permission changes.

## [0.7.2] — 2026-09-17

- Keep assembled release files and staging data within the installer instead of sending them through internal replies. Frontends with more than 2 MiB of combined content, including Contracts, can now complete preflight and staging. Chunked storage and complete checksum verification remain in place.

## [0.7.1] — 2026-09-17

- Read every page of the release store and frontend inventories. Stores with more than 100 files no longer hide existing assets from publication, verification or deployment-property preservation.

## [0.7.0] — 2026-09-17

- Versioned format-2 releases contain frontend checksums, verified gzip variants for static files, provenance, notes and requirements. Packages use immutable content paths and are stamped before publication.
- Hub and the release CLI share one update executor and operation history. CLI publication atomically activates the catalogue, retains earlier releases and refuses overwriting an immutable package.
- Updates verify the complete package before modification, require backend/frontend snapshots, stage frontend uploads, publish in one atomic batch and check both components. Existing sign-in origins, headers, cache settings and upload permissions are preserved.
- Read-only verification reconciles direct deployments. Version strings alone no longer mean “current”; downgrade, mismatch and incomplete jobs are explicit. Hub and Vault are discovered from existing configuration.
- Updates do not automatically grant data lanes. Owner checks and reviewed release IDs protect execution. Failed operations expose recovery details; business data is never automatically rolled back.
- Added an operator command to upgrade the installer from the same verified bundle, with a snapshot and settings checks. Existing jobs and installed-app records survive upgrade.

## [0.6.3] — 2026-09-07

- The existing `bug` recipe now packages Ship the Bug 3D 0.3.0 with public play and opt-in global scoring. Existing installations keep their canister IDs, Hub tile and private 2D archive.

## [0.6.2] — 2026-09-06

### Fixed
- **One job at a time, really:** a second install/update started while the first was still reading its recipe slipped past the lock and could create a second pair of canisters for the same app (audit KI-01).
- **The "picture on the menu" step is visible** in install jobs; a failing hub call there no longer disappears (KI-02).
- **No eternal "installing":** an install that traps or is abandoned by the 30-minute watchdog becomes *failed*, so *Remove leftovers* and *Forget* work on it (KI-03).

## [0.6.1] — 2026-09-06

### Fixed
- A hub refusal during "picture on the menu" or "lanes the app needs" showed as a green tick with "hub said: …" in the detail. These steps now fail visibly; the update itself still completes (both steps are best effort).

## [0.6.0] — 2026-09-05

- Replace the public one-hour cook window with a private KEBAB_SETUP_CODE (or controller call); add code entry and recover accepted jobs after reload.
- Correct failed-job retry state. Keep records of canisters whose cleanup failed.
- Verify recipe module SHA-256 for direct and chunked installs. Query installed app/service versions before updates and refuse unknown versions/downgrades.
- Bound cached owner/job access below 60 seconds and clear it on Hub changes. Preserve failed/uncertain operation details; manifest refresh leaves AI credential grants to an explicit owner decision.
- Pack only freshly built, committed sources with stable compatibility checks; reject unsafe destinations and preserve the old pantry on failure.
- Correct info().version and update setup/release documentation.

## [0.5.0] — 2026-09-05

### Added
- **Re-check with the hub** (`refresh(recipeId)`, Kitchen page button on every up-to-date app): runs the two hub-side steps — picture on the menu, lanes the app needs — without touching code. For apps that are already current and therefore get no update (the service desk today).
- **Picture on the menu** as an update step: an app installed before recipes had pictures (or adopted by hand) had none and never got one — the picture was only set at install. Every update now hands the recipe's picture to the hub (`kitchenSetTileIconFor`, by backend canister id; hubs from 0.15.0), still never overwriting a picture an admin chose.

## [0.4.0] — 2026-09-04

### Added
- **Lanes the app needs** as an update step: after upgrading an app the kitchen asks the hub to re-read the app's manifest and grant any lane it now needs (`kitchenResyncLanes`, hubs from 0.14.0; older hubs skip the step). Closes the gap where an app gained a need on update (say, notify) and silently ran without it.

## [0.3.0] — 2026-09-03

### Added
- Recipes can ship a **picture**: `kitchen/art/<id>.png` (≤ 100 KB) is packed into the pantry, shown on the kitchen card, and after an install handed to the hub as the app's menu picture (`kitchenSetTileIcon`, hubs from 0.10.0; older hubs skip the step). The service desk ships one.

## [0.2.0] — 2026-09-03

### Added
- Downgrade guard: `recipes()` reports `runningVersion` and `downgrade` (semantic-version compare against the hub's `version()` or the app's install record); `update` and `updateHub` refuse an older recipe with a message that says how to repack the pantry.

## [0.1.0] — 2026-09-03

### Added
- Installer/updater canister with a pantry of recipes; install, update (snapshot first), adopt; cook a whole stack (vault + hub) with a claim code planted as an environment variable; default backup schedule for every backend it registers.
