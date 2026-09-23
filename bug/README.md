# Ship the Bug · 2D + 3D

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

Launch a ladybug from DFINITY's Zurich rooftop into the Internet Computer universe.
Version 0.17.0 offers **3D Immersive** and **2D Retro** in the existing Bug app and Hub tile.
Choose a mode before launch or after a flight; your preference is remembered on this device.
Both modes use the same callsign, browser identity and optional Hub sign-in.
3D keeps Season 2 and its Early flights archive; 2D has its own Season 1 board.
The mode buttons in the scoreboard browse either board without changing your flight.
Switching after a flight keeps it private unless you publish or save locally first.
An active flight or publication cannot be interrupted by the mode switch.

See [installation and custom domains](INSTALL.md) to connect your own instance.

Anyone can open the game URL and play immediately. Choose a callsign to publish a
score. **Player profile → Sign in through Kebapstack** is optional. A previously verified
public profile stays available in the same browser after Hub expiry or an outage;
that remembered association grants no access to company data or settings.
If an older session has already lost its identity record, the browser automatically
returns to its own guest profile. Callsigns owned by other profiles remain protected. Hub users and browser
guests compete on the same public leaderboard **within each mode on this deployment**. Independently
installed stacks have independent boards; this is not a federation across every stack.

**Points = floor(distance in metres) + 50 × collected coins.** Publishing is optional
for each flight. A successful publication explicitly distinguishes a new best from a lower flight that retains the existing record. The receipt names the mode and confirms its saved best. An identical retry after a lost response is safe within the two-hour receipt window while this backend remains running; upgrades clear transient receipts. The scoreboard highlights your callsign, and 2D and 3D records remain separate. Only callsign, points, distance, coins and publication time are public.
Choose **Remove my published scores** to remove your own public entry for the selected mode. Browser guest
identity is stored locally; clearing browser data loses that identity. Hub identities
use the Hub's stable person ID, so a reassigned email cannot inherit scores.

## 2D Retro

The 2D route has its own encounter rhythm: single walls or mines at least 600 m
apart, recovery pickups and dedicated Motoko passages with 180 m hazard buffers.
Cyan solar currents give free lift every 800 m. Their visible ribbon covers the
actual flight corridor; smaller ecosystem pickups and occasional ground pads fill
the gaps, with one ground pad every 400 m where hazard spacing permits. Five manual boosts remain valuable rather than forming an automatic ride.
Aim with the mouse, or drag on the sky, hold to charge and release to launch.
The angle slider, Space and fire controls remain available. Space charges and launches even while the angle slider has focus. The curved Motoko tracer follows its flight path; reduced motion hides the exhaust.

Three original pixel backgrounds unfold with distance: a star nursery, a spiral
sea and a deep galaxy field. They crossfade behind the game with subtle parallax,
stars, occasional comets and short discovery messages. Images load progressively;
flight starts immediately and retains the procedural sky if an image fails.
Art was generated for this game, inspired by [Webb's Cosmic Cliffs](https://science.nasa.gov/missions/webb/nasas-webb-reveals-cosmic-cliffs-glittering-landscape-of-star-birth/)
and [ESA/Webb's image collection](https://esawebb.org/images/archive/top100/), not real telescope data.

The Canvas2D mode has detailed 16-bit pixel sprites, a banded Zürich sunset, a
street-aligned DFINITY building based on the supplied office photograph, with five
white-framed office rows, charcoal bands and a glazed ground floor, and a wider Motoko orbit. A perfect 38° launch
starts at 132 m/s, charging peaks after 0.75 seconds, and the stronger gravity
produces a punchier arc. The closer desktop camera and parallax restore a faster
sense of travel, without altering the simulation clock or 150 m/s cap. Five boosts, coins, pickups, heat, mines, shields and FLOW
Overdrive remain. The flight follows its arc automatically: Space boosts and
F/J fires with predictive aim. There are no arrow, camera or tilt controls.
Motoko flies in from above, makes a strafing pass and climbs out for another approach; predictive aim follows its actual velocity. Device-local score histories
are also separate. Only the selected renderer is loaded.

3D adds ground pads on about 80% of 200 m chunks and a low coffee pickup every third chunk. Recovery pickups keep their diminishing returns; manual boost charges are not refilled.

The sections below describe the retained 3D flight rules.

## Webb space photography (3D)

Three real Webb fields enter the 3D background with distance: Carina Cosmic Cliffs,
Phantom Galaxy M74 and SMACS 0723 Deep Field. They are local image assets loaded
progressively after launch, with crossfades, reduced-motion support and a retained
procedural sky on loading failure. One depth-tested background layer keeps the bug,
planets and obstacles in front; it fills chase and side views at phone and desktop
aspects. These are photographic fields used as scenery, not an accurate sky map.
Full image credits and linked sources are in the 3D help dialog and
[the image credits](src/assets/webb/CREDITS.md).

## After dark

Each flight starts with **five prompt boosts**. They share the existing boost button;
the five small charge indicators fit the phone dock. Motoko first appears at 500 m,
patrols through 1,600 m, and returns from 2,200 m in 1,100 m patrols separated by 700 m
quiet stretches. Warnings, fixed-aim pulses, two-hit debugging and the eight-second
banishment stay the same. The ghost never appears earlier in the launch sequence.

A decorative black hole fades into the left-hand sky between 1,800 and 2,250 m, with
a dark shadow, photon ring and a lens-inspired accretion disk. One shader quad keeps
it inexpensive; reduced motion freezes the disk. It has no gravity or collision effect.
The space-bug vector icon is shared by the game header and favicon; matching PNG
exports serve the Hub/Kitchen tile and iPhone home-screen icon. Existing installed Hub
tiles keep admin-selected artwork during recipe updates, so an operator must explicitly
replace an existing tile picture to adopt the new icon.

## Zurich launch deck

The opening is a blue-hour arcade interpretation of Genferstrasse: the DFINITY
facade, historic neighbours, tree-lined streets, yellow crossings and a lake edge.
Ten small cars travel around the block on two separated lanes. Street details and
cars share instanced geometry; traffic pauses with dialogs/the game and stays still
when reduced motion is requested. The scenery has no gameplay collisions.
Dark flight logs use the same cockpit palette as the launch controls, including
profile, help and phone steering setup. The bug and launch guide stay unobstructed
at the checked portrait and landscape sizes.

## Finish a flight

When grounded speed falls below 6 m/s, the bug settles at a fixed position. Remaining
boosts get a 1.6-second rescue window; with none left, results follow after 0.25 seconds.
Steering or wind cannot prolong the final crawl. Real airtime and bounces continue.

The result screen opens automatically with your points and a public leaderboard
comparison. It shows the leaders, nearby scores and your flight, with a clearly
marked private preview. Your existing published best stays visible if this flight
is lower. Equal scores keep their earlier place; results below the top 100 show
`100+`, since the API does not expose lower ranks.

Choose or edit your callsign and **Publish score** in this same screen, or choose
**Play again · keep private**. There is no profile or scoreboard dialog to navigate
through at the end. Publication is never automatic. After publishing, confirmation
and the refreshed comparison remain in place. **Save only on this device** is an
independent local copy. If the board is unavailable, your result stays visible with
an inline retry. On phones, the screen scrolls as one page.

## Fly

- The outlined cyan/mint launch ribbon pulses along the predicted path and stays 10 CSS pixels wide on phones (8 on desktop). It responds to your angle and charge; reduced motion keeps it static.
- Desktop steering uses A/D or the left/right arrow keys exclusively; mouse movement and dragging never steer. Phone tilt and touch arrows are unchanged.
- Hold Space (or the green touch button), release near full for a perfect launch. The charge meter swings back: holding forever loses the timing bonus. Space boosts five times.
- Phones have separate left/right touch buttons. Before the first flight on each phone page visit, choose **USE TILT** or **USE ARROWS INSTEAD**. Tilt asks for motion permission only after your click and waits for a usable neutral reading. The small phone icon on the left edge switches it off/on; no persistent steering banner covers the scene. Pause and resume to set a new neutral grip. Screen rotation pauses and recalibrates. If access is denied or readings stop, the arrows remain usable. Sensor readings stay in this page and are never sent or stored.
- Hold F/J or the FIRE button to shoot firewalls and Motoko. Use bursts: continuous firing overheats the blaster. Orange armored walls and the ghost need two hits. C changes camera; P/Escape pauses;
  R restarts; M toggles sound. Profile, help and scoreboard pause the flight.
- Every gold ring adds 50 points and FLOW energy, without an immediate speed increase. Every launch remixes lanes and pickups. Steer toward risky coins or choose a safer line.
- Coffee appears in about 70% of sections and floor pads in about 55%; airborne rewards sit lower and closer to the main flight lanes. Floor rescues are still lucky finds. Lift rewards diminish as the run gets longer, and air resistance increases with progress and time. Five manual boosts retain their power.
- FLOW rewards clean flying: +4 per coin, +8 extra on every fifth consecutive coin (at most 2.5 seconds between coins), +20 for a close mine/firewall pass after completely clearing it. At 100, Overdrive starts automatically for 3.2 seconds: an initial +22 m/s and up to +4 m/s² thrust / +2 m/s² lift, with the same late-run diminishing returns as pickups. Speed remains capped at 150 m/s. Hits cancel FLOW, shields preserve it, and a five-second recovery prevents chaining. No extra button or leaderboard multiplier is added.
- Wind gives a two-second warning before a gust: tailwinds and updrafts help, while crosswinds and headwinds require a correction.
- Exploit mines start at 225 m: four on the floor per 200 m, plus one airborne mine per 200 m from the second minefield. Red warning rings mark their footprint. Each row leaves three floor lanes open, including two neighbouring ones; the openings shift gradually and the outside edges are no longer permanently safe. Fly above a ground mine, steer through the openings or clear it with one pulse. A collision costs 40% momentum unless an Identity shield absorbs it. Defusing adds 15 K simulated cycles and a separate counter, without extra leaderboard points.
- Motoko follows the supplied spacecraft references: compact pink/violet armour, a round dark visor, yellow eyes and a recessed cyan rear thruster. Velocity-aligned banking and twelve cyan/magenta exhaust ribbons follow the engine’s previous world positions, bending through turns with a brighter soft glow. Instanced engine details keep draw calls low; the wake stops on pause and is hidden with reduced motion.
- Motoko first patrols from 500 to 1,600 m, then returns from 2,200 m in recurring patrols with quiet gaps. It flies world-space approach, strafe and recovery curves, alternating sides. Its nose follows its velocity. A pink cannon charges for 0.8 seconds before a two-shot burst aimed at the locked lane. The shot does not follow later sideways dodges. Only projectile contact costs 33% momentum; the ghost body is harmless. The burst is followed by a 1.8-second climb-out. A short impact grace period prevents both shots from stacking momentum penalties. Two player hits debug Motoko and cancel its incoming pulse. An Identity shield blocks one shot. Debugging it gives eight seconds of peace and 75 K **simulated** cycles, not leaderboard points.

Ten chapters lead through Caffeine, Motoko, canisters, identity, OISY, Chain Fusion,
Cloud Engines, NNS and Mainnet. Stars, planets, an accretion disc and boost trails
surround the flight. A giant articulated DFINITY astronaut fades into the right-hand horizon from 750–1,100 m and has a rounded white helmet, curved infinity visor, padded suit and mirrored five-finger gloves. A relaxed shoulder/elbow/wrist wave repeats every ten seconds, with smooth preparation and settling. The outer route edges carry a restrained, slow RGB pulse that freezes on pause and stays static with reduced motion. Small satellites drift on the opposite side; occasional comets remain at the upper edges. These distant decorations have no collisions. Reduced motion holds the astronaut and satellites still and hides comet motion.

The astronaut commander appears for 4.5 seconds at each new epoch, then fades away.
It returns once when the grounded bug has little momentum and boosts remain. Routine
pickups, combat and camera changes do not bring the portrait back. Control notices
use the existing dock hint. No story message opens a modal over the bug. Cycle burn is **fictional
arcade telemetry**, not real ICP spending or a measured platform burn rate.

## Run, build and verify

```sh
cd bug
npm ci
mops install --locked
npm run build:backend
npm run build
npm test
npm run test:backend
npm start
```

`npm start` serves dist on localhost:4177. `npm run preview:backend` starts an isolated
PocketIC backend for public guest testing in another terminal. It does not connect
to production data. `?test=1` exposes visible scene inspection controls; those flights
cannot be published. Runtime assets are bundled locally, without a CDN dependency.
The shared Hub client and tokens are copied from the canonical repository sources.
The Hub topbar lives inside the player profile so it cannot obstruct the game.

## Upgrade and data safety

See [INSTALL.md](INSTALL.md). Keep the existing backend and frontend canisters and the
legacy asset-canister recipe. Never use reinstall for this upgrade. Keep compiler
1.12.0 and core 2.6.1. This module retains its existing append-only persistence model:
old fields and APIs remain; new 3D state is in separate maps. We deliberately avoid a
simultaneous persistence-model conversion, which would complicate fresh installation,
rollback and the deployed state contract. Populated 0.2.1 and 0.3.1 → current PocketIC upgrades are tested, including a repeated upgrade.

**Season 2** retains its existing records through the 0.7 minefield update. Gameplay has become harder since 0.4; earlier Season 2 records were earned without mines. Scoring remains distance plus coins, with no automatic score reset. The previous public 3D board
remains visible under **Early flights**. Current and archived records use separate
keys in the existing stable maps; profile identities and stored scores are retained.
Remove my published scores removes that pilot's records from both public seasons.
New local scores use a separate browser storage key; earlier local saves remain visible
below the Season 2 saves on the device tab. Route randomness is local to each launch; coin numbering and
forward positions remain compatible with the server's reach checks.

The old employee-only 2D boards stay private behind their original authenticated APIs.
They are not copied to the public 3D board, and their distance-only ranking is not
mixed with the new coin scoring. Existing chosen handles are reserved and recovered
on Hub sign-in. Names outside the new callsign format remain in the archive; choose
a new callsign to publish a 3D run. Admin `resetBoards` clears both generations' boards.

Hub-linked operations retain the SDK's maximum 60-second directory lease and fail
closed if it expires. Public guest play remains available. The backend issues a
single-use flight ticket and checks elapsed server time, distance, duplicate coins,
reachable coin positions and payload bounds. These are plausibility checks, **not**
a full authoritative replay or protection against multiple guest identities. Treat
the board as casual arcade competition, not a basis for prizes or financial rewards.

When speaking, the phone commander uses a shallow radio strip above the flight scene. It stays hidden on the rooftop. Held arcade buttons suppress text selection and WebKit callouts; profile fields and dialog text remain editable/selectable. Responsive layouts are checked at narrow portrait sizes and phone landscape. Sensor math and failure paths are tested with simulated readings; real iPhone sensor permission and sensitivity still need a hardware playtest.
WebGL2 is required for 3D; the 2D mode uses Canvas2D. Real phone performance depends on the device. Runtime npm
dependencies, rendered UI and upgrade/security tests are checked with each release.

### Public source artwork

The flight guide uses the canonical Bug mark. The supplied third-party mascot portrait is omitted from this distribution because its redistribution license was not documented. Code-drawn scenery and ecosystem references do not imply endorsement. See [third-party notices](../THIRD_PARTY_NOTICES.md).
