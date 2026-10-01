# Install or upgrade Ship the Bug

Version 0.19.0 adds the 3D God Candle combination, replaces airborne hazards with
red candle models and removes automatic lateral weather drift. Deploy backend and
frontend together: 3D submits `moon-2026-09-30`, while 2D retains
`arcade-2026-09-09`. Both and the explicitly listed legacy versions are accepted;
release numbers are still not rules identifiers. Keep both boards, profiles,
canisters and canonical origin in place. There is no stable-schema change or season
reset. Historical 3D records reflect their original balance.

Include `candle.js` and `candle-view.js` through the normal frontend build. The
combo uses no additional textures and is included in shader preparation. Validate
neutral steering across weather cycles, genuine shot/coin combos in either order,
expiry, damage, cooldown, reduced motion and the unchanged 2D mode. Run the populated
upgrade regression with the committed pre-standalone baseline as before; the new
rules must be accepted without reintroducing the recurring version rejection.


Version 0.18.0 makes player sign-in standalone: guest browser identity, an optional
local profile and Internet Identity. The frontend needs only its backend ID; the
`__HUB_URL__` placeholder remains for existing Kitchen recipe compatibility and is
not used by the game. Fresh standalone installations need no `setHub`, directory,
suite account or admin claim. Existing Kitchen-managed installations retain their
Hub binding and protected legacy APIs; do not erase these as part of the update.

Upgrade the existing backend and frontend together without replacing canisters,
changing the public origin or reinstalling. Existing guest keys, verified legacy
public profile associations, names, both boards and private archives are retained.
Guest, legacy Hub and Internet Identity players are not merged by name. Internet
Identity is origin-bound: publish/share one canonical URL and do not configure a
shared derivation origin or transfer identities across aliases.

The backend now validates the stable rules identifier `arcade-2026-09-09`, not the
UI version. Explicitly compatible 0.16.0–0.17.5 submissions remain accepted. This
fixes the observed 0.17.5 frontend / 0.17.0-rules rejection. Still-valid rejected
flight tickets survive an upgrade; reload alone could not fix the old backend.
That 0.18.0 compatibility fix made no balance change or stable-schema migration;
0.19.0 changes the 3D mechanics described above.

Include the new `loading.js`, `frame-budget.js`, `coin-instances.js`, `ruleset.js`, `player-session.js` and rebuilt
`client-api.js`. Pinned `@icp-sdk/auth` 10.0.1 supplies Internet Identity. Its popup
uses the official `id.ai` service; calls to the game use the normal authenticated
ICP endpoint. Production uses the SDK trust anchor. The local preview writes its
isolated replica key into ignored runtime configuration; never publish that file.
3D starts after texture/shader preparation. Failed or slow background images fall
back to the procedural sky; test this as well as the successful loading path.

The entries below describe earlier upgrade behavior; 0.18.0 replaces the optional
Hub player-login flow described there.

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

## Existing Kebabstack installation

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
`npm test`, and `npm run test:backend`. Run `mops check --fix` before building. The build checks the committed stable baseline
before generating Candid/browser bindings. The default backend integration check
seeds synthetic profiles and scores, verifies both modes and invalid submissions,
and checks a populated restart. Historical migration cases require explicit
baseline artifacts as described below. For a populated
0.11.0 upgrade, supply its previously built Wasm, then run
`KEBAB_MODES_BASELINE_WASM=/absolute/path/to/0.11.0.wasm npm run test:modes:backend`.
Set `KEBAB_MODES_BASELINE_VERSION=0.12.0` with a 0.12.0 Wasm to seed and
verify both populated mode boards. It checks unchanged 3D records, shared names, separate boards, cross-mode ticket
rejection, replay protection, scoped deletion and a repeated upgrade.

Also build the committed 0.17.4/0.17.5 source separately and run:

```sh
KEBAB_STANDALONE_BASELINE_WASM=/absolute/path/to/baseline.wasm npm run test:standalone:backend
icp build
KEBAB_CANDIDATE_WASM="$PWD/.icp/cache/artifacts/backend" KEBAB_STANDALONE_BASELINE_WASM=/absolute/path/to/baseline.wasm npm run test:standalone:backend
```

This reproduces the old-version failure in both modes, upgrades populated state,
retries the rejected tickets and checks independent signed players, anonymous/admin
rejection and repeat upgrades. It also verifies the actual recipe-built executable.
Keep the committed `.most` baseline unchanged until compatibility has passed.
Browser review and its remaining limits are recorded in
[the 0.18 review](../design/reviews/2026-09-30-bug-standalone.md).

Commit source and generated `dist/` with placeholders, then build Kitchen recipes
from that clean checkout with `python3 kitchen/tools/pack-recipes.py --build`.
This packs both renderers and the shared backend under the existing `bug` recipe ID.

## Production rollout

Follow [Kitchen's release workflow](../kitchen/INSTALL.md): publish a tested format-2
bundle, then use `kitchen/tools/release.mjs update --app bug` and `verify`. Publish
and deploy the identical stamped artifact. Preserve immutable packages, bootstrap,
custom-domain and installation metadata. Do not bypass the release catalogue or
restamp Wasm at deployment. Production rollout requires explicit authorization.

## Fresh installations

For an independent game, deploy the backend and static frontend from `icp.yaml`,
configure the backend placeholder in a disposable frontend copy and retain the
repository placeholders. Use a stable HTTPS origin for Internet Identity. No Hub
setup call or public first-visitor claim is needed. Public players cannot reset
other players' scores or acquire administrative access.

Kitchen may still manage the existing `bug` recipe and tile, including its legacy
controller-only Hub binding. This is an operator deployment option, not a player
login requirement. Keep `@dfinity/asset-canister@v2.2.1` for existing frontends.

### Tests from the public source snapshot

`npm run test:backend` runs fresh setup and a populated restart of the current
release without private Git history. Historical migrations are separate: provide
`KEBAB_LEGACY_BASELINE_DIR` (0.2.1) and `KEBAB_EARLY_PUBLIC_BASELINE_DIR`
(early public arcade), each containing `backend.wasm` and `backend.did`, to run
those retained migration cases. Without them, they are explicitly skipped.
`KEBAB_MODES_BASELINE_WASM` and `KEBAB_MODES_BASELINE_VERSION` enable a previous
mode-aware release upgrade. Score payload compatibility follows `RULESET` and `RULESET_3D`;
cosmetic app version bumps do not change that protocol.
