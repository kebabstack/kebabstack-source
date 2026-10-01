# Product design review · standalone Ship the Bug

- Standard version: 1.2.0 (existing immersive game visual exception retained).
- App / module version: Bug 0.18.0, public source edition. Historical deployed 0.17.5 source was also compared; its gameplay/rules match the 0.17.4 baseline.
- Surface and primary task: open a game, choose a guest/local name or Internet Identity, fly in 2D/3D, optionally publish or retain a private result.
- Roles and data scopes tested: isolated guests, distinct signed principals, refreshed delegated HTTP identities, legacy company sessions, anonymous callers and controller-only operations.
- Review date / reviewer: 2026-09-30 / Codex.
- Status: verified within the evidence below; full accessibility, real passkey and hardware certification remain open.
- Relevant rule IDs: NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07; existing immersive visual exception.
- Previous failure: public 0.17.5 frontend submitted its UI version; Rules.mo accepted only 0.16.0, 0.16.1 and 0.17.0. Refresh could never fix this server-side rejection. Reproduced locally in both modes before upgrading.
- Intended outcome: standalone optional player identity, explicit publication and successful compatible flights; initial graphics preparation before enabling play.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task, next actor, blockers and completion | Pass | Real local 3D flight published 1,041 points; 2D flight published 2,284 points as fictitious SanityPilot. Each displayed its saved receipt and separate board. |
| Positive and negative role / guest / project permissions | Pass, scoped | 29 existing backend/security tests; standalone signed caller without Hub; anonymous writes, name theft and administrative access rejected. No company-permission changes. |
| Direct entry, Hub launch, deep link and session expiry | Pass, scoped | Direct guest play, preserved guest key, profile restoration, cancelled and simulated successful II login/logout, cross-tab change and async renewal checks. Hub tickets are scrubbed, never redeemed. Real official II popup opened and cancellation returned to guest; no personal account used. |
| Loading, empty, partial, stale, error and forbidden states | Pass, scoped | Launch inaccessible until warm-up resolves; images preload with bounded timeout and procedural fallback. Failed renderer exposes reload/2D recovery. Empty/offline boards and invalid/taken names covered. Hardware context loss UI implemented; actual GPU-loss exercise remains open. |
| Retry, duplicate action, interruption and concurrent edit | Pass | Exact submission retained after lost responses; permanent errors stop futile retries; publication locks; delayed board/profile replies cannot overwrite a newer state. |
| Input validation, draft preservation, save and review | Pass | Per-principal local optional names, no public reservation before publication, retained guest identity after II logout. Invalid names, disabled storage and corrupted guest keys checked. |
| Lists, filters, counts, exports and pagination scope | Pass, scoped | Separate 2D/3D boards, own best versus private result, top-100 scope and archive checks. No new export functionality. |
| Canonical logos, tokens, type, spacing and components | Pass | Brand guard verifies 14 marks, shared runtime guard and 13 design tests pass. No alternative game mark or local shared-palette overrides introduced. |
| Assembled initial viewport | Pass, scoped | Desktop game scene, profile and results inspected. Game retains its immersive HUD and local controls; no suite navigation/login panel. |
| Light/dark, 320 px reflow, desktop, text zoom and long labels | Partial | Chrome at native 1600×1200, 1280×800, 320×640 and 800×450. Profile/result actions reachable with no horizontal overflow at 320 px. Existing dark/retro art retained. 200% text enlargement, separate theme variant and long-label sweep not certified. |
| Global bar remains visible during real scrolling (NAVIGATION-06) | Pass within game scope | Keyboard scrolling moved desktop result by 160 px, narrow profile by 225.5 px and short profile by 239 px; game header stayed at y=0. Modals intentionally cover/inert the underlying game, with reachable close/actions. The standalone game has no global suite menu. Real touch scroll remains a hardware check. |
| Keyboard, focus, screen reader, contrast and reduced motion | Partial | Enter activation, launch keys, modal focus/scroll and loading input lock checked. Existing reduced-motion tests retained; loading animation honors preference. Full screen-reader and contrast audit not performed. |
| Privacy, secrets, retention and audience boundaries | Pass, scoped | Guest key kept locally; II delegated identity separate; publication explicit. Local saves remain device-local. No live IDs, private account credentials or production writes in the change. Archived company data remains private. |
| Timezones, currency, source evidence and freshness | Pass, scoped | Existing UTC day/seed and flight time/score tests retained. Simulated cycles stay labelled; no financial claims. |
| Notifications, automation history and recovery | N/A | No new notifications or automations. |
| Contextual guide, help, changed behavior and changelog | Pass | Module README, INSTALL, changelog and recipe description reflect standalone identity and loader. Historic upgrades explicitly distinguished. |
| Representative task repeated after change | Pass | Repeated 3D launches, reset, profile, 2D switch/flight/publication and responsive result checks. No production board used. |
| Module tests and release checks | Pass, scoped | 162 frontend/game tests; 29 backend/security checks; populated standalone upgrade with Mops and ICP-recipe binaries; committed stable signature compatibility; unchanged generated Candid/IDL; runtime, SDK, logo and design guards. See delivery limits. |

## Findings

| Priority | Rule ID | Observation / reproduction | User impact | Fix / owner | Status |
|---|---|---|---|---|---|
| P1 | Primary task | 0.17.5 UI rejected by unchanged 0.17.0 rules whitelist in both modes | Repeated reload cannot publish | Stable rules ID plus explicit compatible legacy versions / Codex | Fixed and regression tested |
| P2 | Loading | Textures and shaders first prepared during flight; redundant course filtering per physics tick | Early stutters | Preload/compile/GPU uploads, bounded fallback, range-change filtering and coin batching / Codex | Implemented and browser checked |
| P2 | Performance | Sustained slow frames also occur after image loading | Preloading alone cannot ensure smooth play | Early-flight graphics calibration plus bounded adaptive detail / Codex | Implemented; hardware verification remains |
| P2 | Retry / recovery | Permanent rejected flights offered the same ineffective retry | Misleading recovery loop | Disable permanent retry, preserve local save and next flight / Codex | Fixed |
| P1 | Identity integrity | Newly introduced II/guest switching must not send a flight with a different caller | Cross-account ownership mistakes | Pin launching principal; check renewed identity before writes; lock player changes / Codex | Regression checked |

## Deliberate exception

- Rule / scope: shared suite account bar for `bug` only.
- Reason: user explicitly requested a standalone guest/Internet Identity game. Mounting the suite account UI would contradict that workflow.
- Owner / decision date: user request / 2026-09-30; implemented by Codex.
- Compensating measure: canonical marks/tokens remain synchronized. SDK topbar check exempts only Bug. Legacy backend fields/APIs stay for safe populated upgrades; protected data is not opened.
- Review: next Bug release. No change to other official app navigation or Lunch.

## Delivery and remaining limits

This record describes the initial local review before rollout. The public source
and generated frontend use installation placeholders; publishing them does not
deploy or change any installation. Operators use a tested format-2 bundle and the
shared Kitchen publish/update/verify workflow for an authorized production rollout,
including Lunch/central-permission preservation checks. The ICP-recipe backend
executable was tested directly during this review. Installation-specific deployment
receipts are excluded from the source distribution.

The signed HTTP regression exercises actual delegation signatures and renewal with
isolated keys against a local canister. It does not stand in for a full Internet
Identity passkey flow on the final HTTPS origin. Real mobile sensor/performance,
Safari and full assistive-technology certification remain open. Leaderboard checks
remain plausibility validation, not authoritative simulation or prize-grade anti-cheat.

### Performance observations

Measurements use the visible `?test=1` diagnostics, up to the first 3,600 active
foreground flight frames. They are local Chrome observations on this workstation,
with random courses and varying system load, not a controlled device benchmark.

- Before adaptive detail, complete first-flight samples showed p95 frame intervals
  of 108–191 ms and individual stalls up to 675 ms. A previous last-600-frame-only
  sample was 17 ms; that omitted the costly beginning and was not used to claim a
  smooth first flight.
- With adaptive detail, observed p95 values were 34–75 ms. The final sampled flight
  after coin batching: 6,090 ms preparation, 687 measured frames, p95 75 ms,
  longest frame 301 ms, 77 frames over 50 ms. It completed, collected coins and
  produced its correct result with no WebGL warnings/errors.
- Coin batching reduced observed comparable-course draw-call counts from around
  640–700 to around 450. Geometry/texture counts stayed bounded during the sampled
  launches. Automated checks verify transforms, collection visibility, fresh-run
  restoration and instance-buffer growth.

Initial image/shader work now occurs before launch and rendering cost is lower,
but intermittent stalls remain on this machine. No universal 60-fps or stutter-free
claim is made. Further device profiling should focus on later course construction,
remaining scene draw calls and background system/GPU contention. Do not change
physics or leaderboard limits to hide rendering delays.
