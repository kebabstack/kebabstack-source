# Changelog — kebab-stack bug (Ship the Bug)

## [0.17.5] — 2026-09-23
- Keep score payload compatibility separate from the displayed app version so cosmetic releases do not prevent publishing valid flights. Exercise the browser payload version against the local backend.


- Prepare the public source edition: use the canonical Bug mark for the flight guide and omit the supplied mascot portrait whose redistribution license was not documented. Flight behavior, profiles and scores are unchanged.

## [0.17.4] — 2026-09-22

- Synchronize the shared navigation SDK scroll fix. Preserve the embedded account panel and immersive game/HUD layout; no game-balance changes.

## [0.17.3] — 2026-09-22

- Update shared suite account/navigation chrome and canonical suite identity. Retain the intentional game-world/HUD visual exception and existing score rules.

## [0.17.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.17.1] — 2026-09-17

- Synchronized the shared browser SDK; Hub jump URLs preserve the intended app without retaining a stale Hub route. Public play and optional sign-in remain unchanged.

## [0.17.0] — 2026-09-10

- Remove desktop mouse steering from 3D. A/D and arrow keys steer; F/J fires. Preserve phone tilt, touch arrows, boost/fire buttons and scene taps, and retain 2D pointer aiming.
- Space now charges and launches directly after adjusting the launch-angle slider in both modes. Text entry stays protected; pause, reset and dialogs cancel held actions.
- Rebuild the horizon astronaut around the supplied DFINITY mascot: rounded helmet and curved black visor, padded white suit, raised chest controls, backpack, boots and anatomically mirrored five-finger gloves. Rotate the glove on the viewer’s right by 180° around the forearm so its thumb faces inward. A smooth ten-second greeting cycle coordinates shoulder, elbow and wrist, then settles into a relaxed pose.
- Anchor Motoko’s brighter cyan/magenta plume to a bounded history of engine positions so it curves through turns. Preserve the rigid velocity-facing spacecraft. The 2D counterpart uses curved pixel tracers without adding 3D scenery.
- Add a restrained travelling RGB pulse to the two outer route edges. Visual effects freeze when paused; reduced motion holds the astronaut and route steady and hides the exhaust.
- Preserve scores, profiles, physics and both seasons; continue accepting identical gameplay submissions from 0.16.0 and 0.16.1 tabs.
- Verified 141 frontend/game checks, 29 backend/security checks and a populated 0.16.1 upgrade of both boards, plus browser checks of slider-to-Space launch, 3D geometry, exhaust, RGB shading and portrait framing.


## [0.16.1] — 2026-09-10

- Keep public play and opt-in publishing independent of Hub session expiry and outages, in both 2D and 3D. Remember verified browser-to-player ownership so callsigns, in-flight tickets and existing bests keep working after the optional company sign-in expires.
- Restore the browser guest automatically when a legacy session can no longer prove its former player association. Never require sign-in/sign-out to play publicly or infer ownership from a typed callsign.
- Suppress expired Hub credentials in the player profile and keep company settings, directory and private historical boards protected by their existing live authorization.
- Keep a failed optional Hub login from preventing guest profile loading. Clarify that public score publication requires no sign-in.
- Retain both scoreboards and accept unchanged 0.16.0 flight payloads during this compatible fix.
- Verified 139 frontend/game checks, 29 backend/security checks, populated mode-board upgrade, and a real 0.16.0 expiry reproduction followed by guest recovery, in-flight publication and repeat upgrade.

## [0.16.0] — 2026-09-09

- Fix flickering Alpine snowcaps: end the rock geometry at the snowline instead of drawing coincident rock and snow faces. Preserve the original silhouette, colours and instanced rendering.

- Guest score publication now confirms the actual saved best and the board (2D or 3D). Lower flights explicitly say the higher best remains, and own scores are highlighted. Errors and retry controls stay beside Publish; a failed board refresh does not erase a confirmed submission or invent a rank.
- Add caller- and mode-bound publication receipts so identical retries after a lost acknowledgement return the original result. Legacy submission endpoints remain single-use; unchanged validation, stable storage, separate mode boards and archives are preserved.
- Make 3D desktop steering keyboard-first. Passive mouse position no longer pulls the bug sideways. Hold-and-drag remains available; release, pause and keyboard input clear mouse steering.
- Add more ground pads and occasional low coffee pickups in 3D; double the cadence of ground recovery pads on the 2D course. Five manual boosts, diminishing returns, coin IDs and score formula remain unchanged.
- Motoko now flies world-space approach, strafe and climbing escape curves with alternating sides. Its armour faces its actual flight direction, backed by a broad twelve-ribbon energy exhaust. A visible 0.8-second charge precedes a faster two-shot burst; shots remain dodgeable and cannot stack immediate damage. Predictive player aim tracks the moving craft. The 2D version shares these attack phases with a pixel exhaust and tracer effects.
- Verify frontend and simulation regressions, a populated 0.15.0 upgrade with both boards and guest publication receipts, and backend authorization/data-preservation checks. No leaderboard reset.


## [0.15.0] — 2026-09-08

### Changed
- Match the 2D DFINITY façade to the supplied office photograph: five long rows of white window frames, charcoal horizontal bands, a pale side elevation, a glazed ground floor, a warm entrance and the coloured infinity mark. Keep the roof launch height and street foundation aligned.
- Add three genuine Webb photographs to 3D space: Carina Cosmic Cliffs, the Phantom Galaxy M74 and SMACS 0723 Deep Field. A single distant layer crossfades locally bundled images behind existing planets and gameplay, with progressive loading, gentle drift and reduced-motion support. Full credits and source links appear in the 3D help dialog.
- Preserve both gameplay modes, their physics, scores, identities and seasons. The backend update only changes the release version; no stable-state migration is needed.

### Verified
- 132 frontend/game checks, including reference façade bounds, progressive texture loading, late-load crossfades, failure fallback, camera framing, depth testing, pause/reduced-motion behaviour and bounded texture reuse.
- 28 backend security/Hub checks and a populated 0.14.0 → 0.15.0 upgrade preserve both boards, shared names and archive, including a repeated upgrade. Stable field types and gameplay rules are unchanged.

## [0.14.0] — 2026-09-08

### Changed
- Replace flattened 3D obstacle lanes with a purpose-built 2D course. Walls and mines are at least 600 m apart, with recovery pickups after each obstacle. Motoko has separate 650 m encounters, 1,750 m of quiet between patrols, and 180 m hazard buffers.
- Add visible cyan solar currents every 800 m. Swept collision follows the entire ribbon and grants one lift per crossing. Place smaller ecosystem pickups and ground pads between currents; preserve five manual boosts and diminishing late-flight assistance.
- Restore mouse aiming and touch drag on the sky: hold to charge, adjust the real launch arc, then release. Cancellation, focus loss, dialogs and reset never fire an accidental launch. Slider and Space remain available; flight clicks fire the blaster.
- Add three original 16-bit cosmic backgrounds: star nursery, spiral galaxy and deep field, with distance-based transitions, restrained star parallax, occasional comets and discovery messages. Load progressively without blocking play, cache small render surfaces and respect reduced motion.
- Keep 3D gameplay, shared identities, both seasons and existing scores. Earlier 2D scores reflect the previous balance. Backend changes are version-only; the stable schema and server coin positions are unchanged.

### Verified
- 130 frontend/game tests cover both mode entrypoints, pointer launch/cancellation, 80 seeded courses across 120 chunks, hazard/ghost separation, visible swept currents, all tested launch angles, finite flights and useful manual boosts.
- 28 backend security/Hub checks and a populated 0.13.0 → 0.14.0 upgrade preserve both boards, profiles and archive, including a repeated upgrade.
- Native Canvas rendering with all three decoded artworks averages below 1 ms per draw in sampled desktop/phone/landscape scenes. This is an offscreen renderer measurement, not a browser frame-rate claim.

## [0.13.0] — 2026-09-08

### Changed
- Restore 2D pixel character with detailed, stepped bug and Motoko sprites, a consistent two-CSS-pixel scene grid, a stronger colour palette, banded skies and angular arcade menus. Text and controls stay crisp above the scene.
- Revisit the original 0.1.0 flight: perfect 38° launches rise from 102 to 132 m/s; charging takes 0.75 seconds, prompt boosts add up to 48 m/s, and gravity produces a shorter first arc. The desktop camera and scaled parallax make the world move through the screen substantially faster without speeding the simulation clock.
- Keep the 150 m/s cap, five boosts, automatic aim, wider Motoko orbit, shared profiles, 2D/3D switch and separate boards. Motoko's pulse prediction uses the same gravity as the new arc. Existing scores remain; earlier 2D scores reflect the previous balance. 3D flight rules are unchanged.

### Verified
- 124 frontend/game tests, including 130 m in the first second, a first bounce before five seconds, fast desktop scrolling, pixel-grid rendering, widened ghost targeting and finite seeded flights.
- Backend security/Hub tests and populated 0.12.0 → 0.13.0 upgrades retain both public boards and shared names, including a repeated upgrade. Stable field types and score limits are unchanged.

## [0.12.0] — 2026-09-08

### Changed
- One game with 3D Immersive and 2D Retro selectors before launch and after a flight. Remember the selected mode; prevent switching during charging, flight or publication. Phone steering setup now follows the choice of 3D and a launch attempt.
- Integrate the modern Canvas2D edition: fast 102 m/s perfect launches, five boosts, clear illustrated bug and Motoko sprites, a street-aligned DFINITY building and a wider aerial ghost orbit. Automatic trajectory and predictive fire replace 3D steering controls.
- Share the current browser identity, callsign, Hub sign-in and profile. Keep 3D Season 2 and Early flights; introduce an independent 2D Season 1 board. Both boards can be browsed from either mode. Device-local score histories stay separate.
- Bind server tickets and stored scores to each mode while preserving existing stable fields. Legacy public methods remain 3D; deleting one mode's public scores preserves the other.

### Verified
- 123 frontend/game regressions, including both entrypoints, mode locks, async board races, 2D flight speed, wider ghost targeting and all chapter render paths.
- 28 backend integration checks, including fresh installs, historical populated upgrades, Hub identity sharing and revocation for both modes.
- Additional populated 0.11.0 upgrade: retained 3D records, separate 2D records, shared names, cross-mode ticket rejection, invalid payloads, replay protection, archive isolation, scoped deletion and repeat upgrade.

## [0.11.0] — 2026-09-07

### Changed
- Five manual prompt boosts per flight, with five responsive charge indicators and matching help text. Boost effects stay bounded; automatic FLOW Overdrive is separate.
- Motoko retains its 500–1,600 m debut and returns from 2,200 m in recurring 1,100 m patrols with 700 m quiet gaps. The ghost fades out at patrol boundaries, clears incoming shots, and can re-enter later. Its warning, projectile damage and eight-second banishment are unchanged.
- A left-hand event-horizon scene replaces the small background hole: dark shadow, bright photon ring, lens-inspired arcs and a flowing accretion disk. It fades in after 1,800 m, uses one shader quad, stays off the flight centre and respects reduced motion.
- New vector Space-Bug icon for the game header/browser, with matching Kitchen/Hub PNG and iPhone home-screen export. Existing Hub artwork is changed explicitly; automatic Kitchen updates preserve admin choices.
- Retain Season 2 scores and identities. Earlier scores reflect the earlier three-boost budget. Version constants, help, operator docs and served assets updated together.

## [0.10.0] — 2026-09-07

### Changed
- Dark arcade launch deck and flight logs: cyan/lilac accents, an illuminated score, a clearly highlighted private flight, dark callsign fields and consistent profile/help/pause/steering panels. The end-of-flight leaderboard and publication choices stay in one scrollable screen.
- An authored Zurich neighbourhood inspired by the supplied Genferstrasse photographs: graphite DFINITY facade with white window frames, warm offices, infinity signs, historic neighbours, yellow pedestrian crossings, tree supports, parking and lakeside scenery. This is a stylized arcade setting rather than a geographic replica.
- Ten small cars follow two separated lanes through the neighbourhood, with rounded turns, headlights and fixed spacing. Facades, street details and the fleet use instanced geometry. Traffic pauses with the game and freezes for reduced motion; street decoration does not affect collisions or scores.
- Blue-hour sky and launch-pad edge lights keep the opening connected to the cyberspace visual style. The bug spawn, pulsing trajectory, phone controls, scoring, Season 2, Hub login and installation-specific domain files are preserved.

### Verified
- Traffic continuity, loop boundaries and separation checks, plus desktop, portrait and landscape visual checks. Existing gameplay and populated backend upgrades remain covered; physical iPhone GPU performance needs a device playtest.

## [0.9.1] — 2026-09-07

### Changed
- Optional installation metadata at `/.well-known/bug-deployment.json` pins the Hub tile ID, so signing in from the original canister URL or a custom domain reaches the same registered app. Invalid/missing IDs retain the normal origin-based flow; metadata cannot override the API host or identities.
- Documented the `play.kebabstack.com` DNS/ICP deployment, installation-specific domain files, preserved Kitchen updates and origin-bound guest profiles. API calls remain on `https://icp-api.io`; Hub identity and existing global records are unchanged.

## [0.9.0] — 2026-09-07

### Added
- Automatic FLOW Overdrive: coins add 4 energy, every fifth coin in a series adds 8, and a genuinely close mine/firewall pass adds 20 after clearing the whole hazard. A full meter triggers 3.2 seconds of bounded thrust, lift, gold/mint trails and a distinct sound. Damage breaks FLOW, shields preserve it, and a five-second recovery prevents continuous chaining. No extra input, direct point multiplier or new prompt boost is introduced.
- A giant articulated DFINITY astronaut at the right-hand horizon: white spacesuit, curved dark visor with a coloured infinity, backpack, gloves and boots, with a slowly waving arm. Shared geometry and instanced rigid details keep the model bounded. It fades in between 750 and 1,100 m, behind the gameplay corridor.
- Small distant satellites and occasional peripheral comet trails. Decorations have no collisions and no new HUD panels. Reduced motion freezes the greeting/drift and hides moving comets.

### Verified
- Regression checks cover clean-pass timing, duplicate/collision farming, coin series, cooldown, damage/shields, automatic activation, speed limits, pause/reduced motion, articulated waving, model bounds and phone-safe placement. Versions, docs and served assets are synchronized; scoring, public identities, Season 2 records and stable state remain.

## [0.8.0] — 2026-09-07

### Changed
- Rebalance each 200 m minefield to four floor mines and one airborne mine (previously six plus two). Three floor lanes stay open, including a connected pair that shifts between rows; no lane is permanently immune. Coffee appears in about 70% of sections and pads in 55%; airborne rewards sit lower and closer to the flight corridor. Coins retain their count, IDs, forward positions and 50-point value. Diminishing lift and rising drag remain.
- Replace tiny trajectory dots with a continuous cyan/mint ribbon, a dark contrast outline and a travelling pulse. Its width stays at ten CSS pixels on narrow phones and eight on desktop, with fixed geometry buffers. Reduced motion keeps the guide static; launch hides it.
- Motoko now charges a visible pink cannon for 1.25 seconds and fires a pink energy pulse at the warned lane. Pulses have fixed aim and swept collision checks; only their impact costs 33% momentum. The ghost body no longer slows the bug. Shield absorption, hit effects and a distinct firing sound make the cause clear. Debugging Motoko cancels an incoming pulse.
- Retain brief commander messages, faster landings, public profiles, opt-in score publication, Season 2 records and the stable data contract. Earlier scores reflect earlier course balance.

### Verified
- Regression coverage for pulse warnings, actual impacts, early/late dodges, shields, cancellation, fast crossings, harmless body contact, lower mine density, reward distribution and the responsive launch ribbon. Browser checks at desktop and phone sizes, plus populated backend upgrades.

## [0.7.1] — 2026-09-07

### Fixed
- Rebuild Motoko from the supplied spacecraft references: compact pink/violet rigid armour, round dark visor and yellow eyes, scalloped rear opening, recessed cyan thruster and translucent energy trails. Smooth banking and engine glow replace fish-like body waves, fins and an organic tail. Engine details are instanced for mobile rendering.
- Commander appears for 4.5 seconds on an epoch change, then fades away. It returns once per near-stop opportunity when boosts remain and hides after a rescue. No repeated chapter text, pickup cheers or combat popups; control notices use the existing dock hint. The rooftop remains clear.
- Grounded speed below 6 m/s settles the bug immediately at a fixed position. A remaining boost has a 1.6-second rescue window; an exhausted flight finishes after 0.25 seconds. Held steering and wind cannot prolong the final crawl; genuine airtime and bounces still play out.
- Preserve mines, two-hit Motoko combat, score calculation, Season 2 records and stable state. Versions and served documentation are synchronized.

### Verified
- Regression coverage for commander expiry/rearming, rescue priority, frozen landing positions, last-chance boosts, spent boosts, continued airtime, rigid 3D shape, engine trails, camera independence and reduced motion. Browser checks at desktop and phone sizes, plus populated backend upgrades.

## [0.7.0] — 2026-09-07

### Added
- Exploit minefields from 225 m: six ground mines per 200 m, plus two airborne mines from 425 m. Visible red danger rings and an initial radio warning introduce the hazard. Two adjoining floor lanes stay open in each row, with connected openings between rows; neither outside edge is always safe.
- One pulse defuses a mine; an unshielded collision costs 40% momentum. Low hull collision bounds allow genuine flyovers. Mine clears have separate effects, simulated-cycle rewards and result counters, without changing distance-plus-coin scoring.

### Changed
- Replace the billboard ghost and detached spheres with a continuous procedural 3D Motoko: rounded mantle, embedded curved visor, luminous eyes, connected fins and a long flowing tail. Travelling body waves, breathing and banking follow its motion. The model retains its world orientation when switching cameras; animation stops during pause and honours reduced motion.
- Preserve the readable locked-lane attack warning, two-hit ghost combat and recovery window. Add mine-aware aim assistance and shield/help text. Shared mine buffers keep rendering resources bounded through course changes and restarts.
- Retain Season 2, archived boards, identities and the stable data contract. Earlier Season 2 records were earned before minefields; this release does not reset them.

### Verified
- Mine route continuity, coin IDs, high-speed collisions, safe flyovers, rising-path shots, one-time rewards, shields, procedural model deformation and camera independence. Desktop/phone browser inspections and populated backend upgrade tests. Physical iPhone GPU performance and sensor feel still require a device playtest.

## [0.6.1] — 2026-09-07

### Changed
- Explicit phone preflight choice between tilt and arrows, once per page visit rather than every run. Motion permission is requested only from a player click; setup waits for the first valid neutral reading.
- Replace the persistent TILT/CENTER/status strip with a 46px phone icon on the left edge. The icon shows the current state, switches tilt off immediately and enables/calibrates it from one click. Pause/resume resets the neutral grip.
- Denied permission or missing readings keep the arrow fallback in the same setup dialog. Sensor loss during play gives only a brief fallback message. Late permission responses cannot override cancellation; delayed Hub sign-in does not stack over the phone setup.
- Preserve Season 2 scoring, public and archived boards, identities and stable state.

### Verified
- Preflight choice, gesture-triggered permission, calibration, toggling, rejection, sensor timeout and cancellation regressions. Responsive portrait/landscape checks; physical iPhone permission and sensor feel still require a device playtest.

## [0.6.0] — 2026-09-07

### Changed
- Every completed flight opens one result screen with points, the global leaderboard comparison and the current flight highlighted. Leaders and nearby scores are shown together; rank estimates remain private until explicitly published.
- Choose or correct a callsign and publish directly in the result screen. Play again, keep private or save locally without opening nested profile or scoreboard dialogs.
- Publication confirmation and the refreshed board stay in the same view. A previous better score remains the pilot's official best; equal scores retain the earlier place. Results beyond the public top 100 are marked `100+` rather than given an unverified rank.
- Responsive result layout uses one scroll area on phones. Connection failures and name errors have inline recovery; late requests cannot overwrite the next flight.
- Season 2 records, archived scores, identities and scoring rules are retained.

### Verified
- Regression coverage for private previews, ties, existing best scores, top-100 limits, one-action name reservation/publication, errors and asynchronous run changes. Desktop and phone layouts and publication are exercised against a disposable local backend.

## [0.5.0] — 2026-09-07

### Added
- Optional phone tilt steering with explicit motion permission, a neutral grip, smoothing, dead zone and a CENTER button. Screen orientation is accounted for; rotation pauses and recalibrates. Denied/unavailable/stale sensors fall back to arrows. Sensor readings are neither recorded nor sent.

### Fixed
- Portrait commander becomes a shallow radio strip above the launch scene, keeping the rooftop bug visible. Smaller headlines leave an open flight corridor on short phone displays.
- Prevent WebKit text selection, long-press callouts and drag gestures on the game surface and button contents. Profile fields and dialog text remain editable/selectable.
- Camera reframes immediately after a viewport rotation, including during pause; hidden intro text no longer widens a narrow flight screen.
- Held controls release on cancellation, lost capture, backgrounding and reset, with independent pointers for simultaneous steering and firing. Boost/Fire remain large in landscape.
- Season 2 scores, existing identities and archived results are unchanged.

### Verified
- Regression checks cover sensor permission denial/races, rotation, calibration, stale/null data and multitouch cancellation. Browser layouts and controls are checked at portrait and landscape sizes. Real iPhone permission prompts and sensor feel require a device playtest.

## [0.4.0] — 2026-09-07

### Changed
- Season 2 gameplay: a swinging launch meter with a perfect-release bonus, freshly randomized routes per launch, announced gusts, increasing drag and diminishing pickup lift. Coins reward score without adding speed; floor pads no longer guarantee a cruising-speed reset.
- More firewalls as the run advances, later walls with visible armor, a shorter aiming cone and blaster heat. Controlled bursts preserve the weapon for an incoming threat.
- Motoko now enters smoothly, circles in front of the chase camera and follows into canister airspace. Attacks lock a lane with a warning; two real pulse impacts banish it for eight seconds. Hits cost momentum, shields can absorb them, and ghost defeats have their own effects and counter.
- Preserve the old public 3D leaderboard under Early flights and rank harder runs on a separate Season 2 board. Existing identities, handles, private 2D data and stable field types remain intact; players can remove their scores from both public seasons.

- Flight debrief opens at the score on short screens, with a contextual retry tip and separate local score histories for the two rulesets.

### Verified
- Regression coverage for continuous ghost motion, warning/dodge timing, moving-target projectile hits, armor, overheating, route/coin invariants and idle-flight termination. Populated upgrades cover the old 2D version and public 0.3.1 archive separation.

## [0.3.1] — 2026-09-07

### Fixed
- Logged-in player profiles use two rows for shared Hub navigation, with touch-sized controls and names that truncate in the available dialog width. Game header styles no longer leak into the Hub bar.
- Apps, notifications and account panels expand inside the profile dialog instead of floating over it. Narrow screens retain all controls without horizontal overlap; the profile close button now has a 44 px touch target.

## [0.3.0] — 2026-09-07

### Changed
- Replace the 2D frontend in the existing Bug app with the Zurich → Cyberspace 3D arcade: chase camera, ten ecosystem chapters, planets/stars, pulse blaster, boost trails, mobile controls, fair Motoko ghost and astronaut commander. Story messages stay clear of the bug.
- Public instant play plus optional Kebapstack sign-in, chosen callsigns and one opt-in public board per deployment. Points are whole metres plus 50 per coin; cycle-burn telemetry is explicitly simulated.
- Preserve the deployed Hub configuration, stable person identities, names, settings and private 2D boards. Add separate public 3D state; no historical internal entry becomes public. Shared Hub navigation is available in the player profile.
- Signed browser identities, single-use server flight tickets, bounded score/coin validation and request limits. Hub sessions retain the existing SDK's maximum 60-second freshness requirement. Upgrade and regression tests cover both generations.

## [0.2.1] — 2026-09-06

### Fixed
- **Scores have hard caps** (3 km, 10 minutes, trace inside the world) — the plausibility check compared the distance with a duration the client reported, so a 3 744 km run was one request away (audit BG-01). The 8-second submit limit is per person, not per session.
- `hub_upsert` uses the SDK's `upsertRows` (SDK 0.4).

## [0.2.0] — 2026-09-06

### Changed
- **Players are ids.** Board names, handles, scores, ghosts and the dethroned notification are keyed by the hub's stable person id (`p_…`) instead of the address (hub ≥ 0.17, SDK 0.3). A rename keeps your scores; a re-issued address never inherits someone's board name or best run. `whoami.player` carries the id. (Boards never showed addresses — nothing changes on screen.)
- One-time migration right after this upgrade converts stored addresses via the hub; submits, name changes and resets answer "people ids are being migrated — try again in a minute" for the few seconds it takes. Requires hub 0.17 first.

## [0.1.0] — 2026-09-06

### Added
- First release of **Ship the Bug**, ported into the stack from a working standalone mini-game: the pixel world, physics with sub-stepping and diminishing returns, the daily seeded world, the ghost of today's champion, three prompt boosts, restart, retro sound, phone controls.
- **Generic IT world as the default, packaged as a swappable `WORLD` object** (zones · pickups · weights · air bands · quips · outage gusts) next to the sprite library `SPR`. Zones: localhost, dev, staging, production, IT support, app store, the cloud, open source, ⚠ outage, the internet. The company name from the hub goes on the roof sign.
- Built on `mo:kebab-hub` like the other apps: hub ticket sign-in, 60-second complete-directory lease with 30-second pulls, roles from the hub (owners/admins run the settings, everyone in the directory plays), `claimAdmin` for hub owners/admins, the shared topbar (the game's own identity chrome is gone), `hub_notify` kind `bug.dethroned` to the previous all-time champion.
- Scoreboards strictly opt-in per run (private runs only count anonymously), board name = hub name or a unique handle, **Remove my scores**, admin **Reset all boards** (new season); anti-cheat (plausible speed for the duration, 8-second submit spacing, known zones), retention (weekly 8 weeks, daily + ghosts 14 days). Every write answers `{ ok; detail }`.
- Frontend smoke that actually throws a bug (keyboard), publishes the run, opens the scoreboard and checks the world pack against the sprites and the backend's zone list.
