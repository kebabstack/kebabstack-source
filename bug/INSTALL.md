# Install or upgrade Ship the Bug

Version 0.17.0 refines controls and scenery in both modes. Desktop 3D controls use
keyboard steering; phone tilt and buttons are unchanged. Include the new
`dist/wake-path.js` when synchronizing assets. The astronaut, curved exhaust and
route lighting are cosmetic: gameplay, scoreboards, pilots and stable state retain
their existing rules and types. Unchanged 0.16.0 and 0.16.1 flight payloads remain
accepted. Upgrade the existing unified Bug backend/frontend in place, retaining
custom-domain metadata and both mode boards.

Version 0.16.1 separates public player ownership from optional Hub sessions.
It adds a bounded browser-to-public-profile map; existing profile/score/run maps
retain their types. Verified legacy links are remembered before expiry pruning,
while unprovable old links fall back to that browser's guest. No name-based account
claiming is permitted. Company APIs retain live session/directory/revocation checks.
Validate the populated 0.16.0 upgrade and expiry-during-flight tests before release:
`KEBAB_PUBLIC_BASELINE_WASM=/path/to/released-0.16.0.wasm npm run test:public:backend`.
Both modes share this backend; do not deploy the legacy standalone `bug2d` module.
The unchanged 0.16.0 gameplay payload remains accepted, preserving valid in-flight
tickets in already-open tabs. A flight that never obtained a server ticket cannot
be reconstructed or published from its displayed score alone.

Version 0.16.0 adds explicit publication receipts, retry-safe guest submissions,
keyboard-first 3D steering, more low recovery pickups, and shared strafing Motoko
attacks in 2D and 3D. Upgrade the existing **Bug** backend and frontend together;
this does not use or replace the separate legacy `bug2d` deployment. Existing
profiles, mode boards, archived scores and Hub bindings remain in place. Cached
old tabs must reload before publishing a new flight after a version upgrade.
Validate against the committed stable signature and run the populated 0.15.0
upgrade test, not only a fresh-install check. Receipt retries are exact-payload,
caller/mode-bound, last-receipt only, bounded to 512 entries and two hours, and
transient across upgrades. They do not bypass score validation or permit rewrites.


Version 0.15.0 refines the 2D office façade and adds locally bundled Webb photographs
in 3D. Update backend and frontend together. Include `dist/webb-backdrop.js`,
`dist/two-d/hq-building.js` and `dist/assets/webb/` in the normal asset sync.
Existing scores, profiles, seasons and gameplay rules persist. The three Webb
JPEGs total about 2.4 MB and load only in 3D; no runtime requests go to ESA/NASA.


Version 0.14.0 rebalances the 2D course, restores pointer aiming and adds pixel galaxy scenery. Update frontend and
backend together; existing 2D/3D scores and profiles persist. There is no new season
or stable-state migration. The 3D balance and 150 m/s score cap are unchanged.
Older 2D scores used the previous balance. Reload before a ranked flight.
The frontend includes three local WebP backgrounds (4.5 MB total), loaded progressively
only in 2D. Keep `dist/assets/two-d/` and the new 2D modules in the asset sync.

Version 0.12.0 integrates 2D and 3D into the existing `bug` installation. Update both
backend and frontend in place. Existing 3D Season 2 records, Early flights, profiles,
Hub configuration and private historical data persist. The new public 2D board uses
a separate key namespace in the existing stable maps; no state migration is required.
The browser identity key stays unchanged, so both modes share a profile on each origin.
Retain custom-domain metadata. Reload before starting a ranked flight.

The experimental `bug2d` deployment remains a legacy installation. Hide its duplicate
Hub tile only after the unified app is ready; retain its canisters and origin-bound
profiles. It is not automatically imported into this backend. The public legacy 2D
board was empty when the shared mode launched. Fresh installs need only recipe `bug`.

Version 0.10.0 refreshes the launch scene and menu styling. It keeps the same Season 2
scores, identities, Hub tile and stable state. Reload after upgrading before starting
a ranked flight. Keep the installation-specific `/.well-known/` domain files; Kitchen
preserves them during the update. Traffic is decorative and respects reduced motion.

Version 0.11.0 gives each flight five boosts, adds later Motoko patrols and refreshes
space scenery/icons. Season 2 stays in place; older records reflect the earlier boost
budget. The shared recipe includes the new tile art for fresh installs. On an existing
Hub, replace the Bug tile picture explicitly: Kitchen preserves admin-selected icons.

## Existing Kebapstack installation

Update recipe **bug** in the Kitchen. This upgrades the existing backend, keeps its
state, refreshes frontend assets and keeps the Hub tile and URL. Do not remove the
old app, create replacement canisters, or select reinstall. Kitchen takes a backend
snapshot before upgrading; take a frontend snapshot as well when using the CLI.

Version 0.3.0 introduces public play and an opt-in public 3D board. Existing internal
2D entries remain private, and Hub configuration, names and administration persist.
Hub sign-in continues using the existing tile binding. Share the frontend URL for
instant public access; a visitor only needs a callsign when publishing a flight.

Version 0.4.0 starts Season 2 for the harder gameplay. Existing public 3D scores are
preserved in the **Early flights** archive, while old employee-only 2D boards remain
private. Profile names and sign-in bindings persist. Flights begun in an earlier
version cannot publish into Season 2; reload before starting a new ranked flight.

Version 0.5.0 improves phone layout and adds optional tilt steering. It retains the
Season 2 board and scoring rules; no new season or stable state fields are introduced.
Reload the game after upgrading before beginning a ranked flight. Motion access is
requested only when the player enables tilt and requires a supporting secure browser.

Version 0.6.0 brings the leaderboard comparison, callsign and publish/private choice
into a single result screen. Season 2, scoring, identity and stable state are unchanged.
Reload after upgrading before starting a ranked flight.

Version 0.6.1 asks phone players to choose tilt or arrows before their first flight
on each page visit. A compact phone icon replaces the persistent steering banner.
Motion permission still requires a player click; Season 2 and stored data are unchanged.

Version 0.7.0 adds Exploit mines and replaces the Motoko render model. It keeps
Season 2 records, profiles, score calculation and stable state. Existing Season 2
records were earned under the earlier course balance; the upgrade does not reset
them. Reload before starting a new ranked flight. No new asset service or CDN is needed.

Version 0.7.1 corrects Motoko to the supplied spacecraft references, makes the
commander temporary and shortens the grounded finish. Season 2, scoring and stable
state remain unchanged. Reload after the Kitchen update.

Version 0.8.0 reduces mine density, improves pickup accessibility, adds a high-contrast
launch ribbon and replaces Motoko contact damage with visible, dodgeable projectiles.
Season 2 records and stable state are retained. Earlier scores reflect earlier course
balance. Reload after upgrading before starting a ranked flight.

Version 0.9.0 adds automatic FLOW Overdrive and the distant waving astronaut with
quiet sky details. It retains the same scoring formula, profiles, Season 2 board and
stable schema. Earlier scores reflect earlier gameplay balance; reload after updating.

Version 0.9.1 supports a stable Hub tile ID in installation metadata for custom domains.
The domain ownership file and tile ID belong to the installation, not the shared recipe.
Use the Cloud Engine console to register your frontend domain and publish its required DNS records. Guest profiles remain
bound to the browser and origin where they were created; the old address stays usable.

## Build a release

Use the repository's pinned tools (`npm ci` at root and in `bug/`). Keep `moc` 1.12.0.
From `bug/`, run `mops install --locked`, `npm run build:backend`, `npm run build`,
`npm test`, and `npm run test:backend`. The build checks the committed stable baseline
before generating Candid/browser bindings. The backend integration test builds the
0.2.1 source from Git, seeds private data, upgrades it, then checks retained state,
public/Hub identity isolation, score validation and revocation. Mode-specific Hub
submission and access revocation are covered by the same suite. For a populated
0.11.0 upgrade, build that Git revision separately, then run
`KEBAB_MODES_BASELINE_WASM=/absolute/path/to/0.11.0.wasm npm run test:modes:backend`.
Set `KEBAB_MODES_BASELINE_VERSION=0.12.0` with a 0.12.0 Wasm to seed and
verify both populated mode boards. It checks unchanged 3D records, shared names, separate boards, cross-mode ticket
rejection, replay protection, scoped deletion and a repeated upgrade.

Commit source and generated `dist/` with placeholders, then build Kitchen recipes
from that clean checkout with `python3 kitchen/tools/pack-recipes.py --build`.
This packs both renderers and the shared backend under the existing `bug` recipe ID.

## Controller CLI upgrade

First inspect `Kitchen.listInstalled`, both canister statuses and `backend.info()`.
Link those **existing** IDs using `icp canister link`, and take snapshots. Build and
compare `backend/backend.most` with `backend/dist/backend.most` before installing.
Deploy the backend with `--mode upgrade --wasm-memory-persistence keep`. For frontend
assets retain `@dfinity/asset-canister@v2.2.1`; the newer static-site recipe is a
different implementation and must not replace the installed asset canister.

Patch `BACKEND_CANISTER_ID` and `HUB_URL` in a disposable copy of `dist/app.js` before
upload. Repository values remain `__BACKEND_CANISTER_ID__` and `__HUB_URL__`. Never
commit live IDs. Use `--no-create` on deploy and verify the resulting public URL,
backend version, global board and Hub tile after the upgrade.

## Fresh Kitchen installation

Install **Ship the Bug** in Kitchen. It supplies canister IDs, calls controller-only
`setHub`, connects the identity/roles lanes, and creates the tile. Manual installs
follow the other Kebapstack apps: deploy the two canisters, patch the frontend
placeholders, call `setHub`, and connect the backend plus frontend tile in the Hub.
There is no public first-visitor admin claim. Public guest profiles cannot change
Hub settings or reset other players' scores.
