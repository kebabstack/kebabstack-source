# Product design review · God Candle and neutral steering

- Standard version: 1.2.0; retained immersive-game exception.
- App / module version / commit: Bug 0.19.0, public source edition, including standalone 0.18.0.
- Surface and primary task: steer a 3D flight, collect coins, clear red candles, trigger and understand the automatic Moon combination.
- Roles and data scopes tested: local browser guest SanityPilot; isolated backend guests, signed/delegated identities and legacy administration regressions. No production data used.
- Review date / reviewer: 2026-09-30 / Codex.
- Status: verified for the scoped evidence below; hardware, full accessibility and balance certification remain open.
- Relevant rule IDs: NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07; immersive-game visuals.
- Previous failure: 3D physics added crosswind to lateral velocity even with zero input and tilt disabled. It could move the player to either side during weather cycles. Floating obstacles behind the bug could also stand between the chase camera and player.
- Intended outcome: neutral controls hold a lane; the new reward is understandable, bounded and visible without adding object density or large assets.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task, next actor, blockers and completion | Pass, scoped | Actual projectile/coin combinations in either order trigger once; visible practice scene uses the same collection and projectile code. Normal 18-second browser flight finished at 682 m / 2 coins and published 782 points locally. |
| Positive and negative role / guest / project permissions | Pass, regression | Existing 29 backend integration/security checks and standalone upgrade tests. Rules whitelist extended explicitly; ownership, setup and private APIs unchanged. |
| Direct entry, Hub launch, deep link and session expiry | Pass, regression | Direct local guest entry and 2D/3D switch tested. Standalone identity regressions and signed delegation renewal retained; see prior standalone review for sign-in limits. |
| Loading, empty, partial, stale, error and forbidden states | Pass, scoped | Candle models share geometry/materials, need no external texture and enter the existing shader warm-up. Empty local board and successful publication verified. Loader failure/fallback regressions retained. |
| Retry, duplicate action, interruption and concurrent edit | Pass | Duplicate coins/cleared objects cannot complete twice; partial armored hits and floor-mine kills do not count. Fixed six-second deadline cannot be extended by repeated progress. Shared recovery prevents stacking. Pause freezes simulation time. |
| Input validation, draft preservation, save and review | Pass, scoped | 24 seeded 65-second zero-input simulations cover both former side-wind directions; x/vx stay fixed. Released steering decays without a persistent pull. Native input cancellation/tilt regressions pass. Browser flight ended with tilt=false, steer=0, x=0. |
| Lists, filters, counts, exports and pagination scope | Pass, scoped | Results count total overdrives and the God Candle subset. Scoring/coin IDs stay unchanged. Existing mode-specific publication/retry tests pass; no new export. |
| Canonical logos, tokens, type, spacing and components | Pass | Shared runtime/SDK, 14-mark brand guard and 13 design checks pass. Candles are gameplay geometry, not product marks. No shared source edits. |
| Assembled initial viewport | Pass, scoped | Added progress inside the existing boost controls, updated legend/help, preserved primary launch/boost/fire controls. No extra overlay across the flight corridor. |
| Light/dark, 320 px reflow, desktop, text zoom and long labels | Partial | Rendered at native desktop, 1280×800, 320×740 and 800×500. No horizontal overflow at 320 px; God Candle and controls remain visible. Both modes and their help checked. No theme redesign; 200% text-only zoom and exhaustive long-name variants not re-certified in this change. |
| Global bar remains visible during real scrolling (NAVIGATION-06) | Pass, scoped | Shared long help scrolled in the browser at desktop, 320 px and short 800×500. Measured scroll offsets 2076 / 2788 / 2315 px while header top remained 0. Game world itself does not scroll. Existing standalone navigation exception retained. |
| Keyboard, focus, screen reader, contrast and reduced motion | Partial | Keyboard launch, help close and mode switch verified; combo has descriptive accessible text. Reduced-motion model test keeps a steady candle and reset hides it; no new flashing. Full screen-reader, contrast and real-device motion certification remain open. |
| Privacy, secrets, retention and audience boundaries | Pass, regression | Test-only guest/board; no new storage or permissions. Practice inspection flights cannot publish. Production IDs and canonical origin placeholders retained. |
| Timezones, currency, source evidence and freshness | Pass, scoped | Combo uses simulation time, not wall time. Pause cannot consume its window. Candles are fictional arcade effects; no token/trading API. Rules ID changes independently from release version. |
| Notifications, automation history and recovery | N/A | No new automation or external notification. Existing in-game toast/boost status reused. |
| Contextual guide, help, changed behavior and changelog | Pass | 3D combo, red hazards, armor and neutral steering explained. 2D removes Moon help/status before populating its unchanged rules. README/INSTALL/served changelog updated. |
| Representative task repeated after change | Pass, scoped | Repeated God Candle practice scenes, normal 3D flight/publication, reset, mode switch and 2D help/flight/publication smoke (21 seconds, 1,934 m, 25 coins, 3,184 points on the separate local board). |
| Module tests and release checks | Pass, scoped | 171 frontend/game tests; 29 backend/security checks; populated upgrade on Mops and ICP-recipe binaries; compiled candidate stable-compatible with committed baseline. Generated interface unchanged. Runtime/SDK/brand/design guards pass. |

## Findings

| Priority | Rule ID | Observation / reproduction | User impact | Fix / owner | Status |
|---|---|---|---|---|---|
| P2 | Input predictability | `wind.x` added to lateral velocity with zero input | Unexpected left/right motion with tilt disabled | Remove lateral weather in 3D, show calm during old crosswind periods / Codex | Fixed locally and regression tested |
| P2 | Gameplay feedback | No short, deliberate coin/combat combination | Few tactical reasons to link the existing actions | 3 coins + 1 red candle in 6 seconds, 3.2-second bounded boost / Codex | Implemented; wider player balance feedback pending |
| P2 | Visible collision bounds | Air mines had broad low hulls; new candle silhouette is tall/narrow | Invisible or missed impacts if old bounds were reused | Swept body/wick bounds shared with model dimensions / Codex | Tested for hits, safe gaps and fast movement |
| P2 | Camera readability | Passed objects remained in front of chase camera | Temporary oversized foreground obstruction | Hide fully passed pickups; derive visibility each update so warm-up/reset restores them / Codex | Browser checked |

## Deliberate exception

Existing immersive-game palette and standalone player controls are retained. Red and
green geometry convey in-world threats/rewards, supplemented by shape, armor ring,
text and timers. Canonical company/product branding is unchanged. Revisit gameplay
readability on the next Bug release; do not propagate these effects to suite UI.

## Delivery

This record describes the initial local review before rollout. Existing scores/profiles, current 3D Season 2 and 2D
Season 1 persist. The 3D balance changes; older 3D records still reflect older rules.
No migration or leaderboard reset is implied. Backend and frontend must roll out
together because 3D now submits `moon-2026-09-30`; the earlier rules remain accepted.

Visual inspection included the normal 3D flight, a frozen God Candle practice scene, and a 320 px portrait layout. Private screenshots are excluded from the source distribution.

One normal 3D browser flight recorded 3,125 ms initial preparation, 1,254 measured
active frames, p95 25 ms, longest frame 342 ms and 12 frames over 50 ms. No browser
warnings/errors were observed. This is a sample on one workstation after other
scene inspections/resizing, not a cold-start benchmark or a universal smoothness
claim. First-flight/device profiling limits from the standalone review still apply.

Publishing this source does not deploy or change any installation. An authorized
rollout needs the suite format-2 publish/update/verify workflow and its
Lunch/central-permission preservation checks. Installation-specific deployment
receipts are excluded from the source distribution. Real mobile sensors/GPU,
Safari, Internet Identity passkeys on the final origin and full accessibility
certification remain outside this local verification.
