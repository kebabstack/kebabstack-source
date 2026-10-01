# Product design review · Ship the Bug 0.20.0

- Standard version: 1.2.0; retained immersive-game exception.
- App / module version: Bug 0.20.0, public source edition, based on committed 0.19.0.
- Surface and primary task: launch, steer/shoot, read effects and results in 3D or 2D, optionally publish a score.
- Roles and data scopes tested: local guests with fictitious names; isolated signed/delegated identities and legacy authorization regressions. No production score writes.
- Review date / reviewer: 2026-10-01 / Codex.
- Status: scoped verification complete with the P2 mobile findings below; not full accessibility certification.
- Relevant rule IDs: NAVIGATION-06, VISUAL-02, LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07; existing immersive-game exception.
- Previous behavior: 0.19 rendering/typography; the supplied 0.20 release adds presentation effects and audio. No controlled before/after performance comparison was made.
- Intended outcome: preserve flight rules, scoring, profiles and boards while presenting the supplied visual/audio update without restyling or refactoring it.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task, next actor, blockers and completion | Pass | Normal 3D flight finished at 764 m, six coins and 1,064 points. Normal 2D flight finished at 3,745 m, 43 coins and 5,895 points; published successfully as fictitious ReleaseTwenty on the isolated local board. |
| Positive and negative role / guest / project permissions | Pass, regression | 29 historical backend/security checks and the standalone populated upgrade/delegation suite. Backend source differs from 0.19 only in BUILD_VERSION; generated Candid/IDL and committed stable signature are unchanged. |
| Direct entry, Hub launch, deep link and session expiry | Pass, scoped | Direct local entry, both modes and replay. Existing player-session and community regressions pass. No new real Internet Identity passkey certification; legacy protected interfaces remain unchanged. |
| Loading, empty, partial, stale, error and forbidden states | Pass, scoped | Actual GPU warm-up, locally served font loads, empty local board and publication states observed. Existing fallback/recovery regressions pass; no forced GPU context-loss exercise in this review. |
| Retry, duplicate action, interruption and concurrent edit | Pass, regression | Existing mode-specific publication, exact retry and authorization regressions retained. UI profile/help pause behavior retained. |
| Input validation, draft preservation, save and review | Pass, scoped | Local fictitious callsign and confirmed publication receipt; existing validation/storage tests retained. New local-best and opt-in sound controls inspected; subjective audio quality not certified. |
| Lists, filters, counts, exports and pagination scope | Pass, scoped | 2D publication receipt reports the computed score and correct board. Shared independent-board/ownership tests pass. No changes to export/pagination. |
| Canonical logos, tokens, type, spacing and components | Pass with exception | Canonical brand/runtime guards pass. Four WOFF2 files total 60,396 bytes, inspected for font names, embedded copyright/OFL reference and absence of private metadata; original copyright and full OFL text bundled. Shared sources unchanged. |
| Assembled initial viewport and hierarchy | Pass, scoped | 1280 × 800 launch, HUD, impacts, Overdrive and result views inspected. Visual choices supplied by the release author are retained. |
| Light/dark, 320 px reflow, desktop, text zoom and long labels | Partial | Desktop 1280 × 800, short 800 × 450, portrait 390 × 844 and narrow 320 × 740 inspected. See 320 px HUD finding. No separate light theme, 200% text enlargement or exhaustive long-name sweep. |
| Global bar remains visible during actual scrolling (NAVIGATION-06) | Pass, scoped | Long help scrolled 3,022.5 px at portrait width and 2,087 px at 800 × 450; header top remained 0. Modals cover/inert the game intentionally. Game retains its standalone navigation exception. Physical touch hardware not tested. |
| Keyboard, focus, screen reader, contrast and reduced motion | Partial | Keyboard launch, boost, shot and modal actions work. Reduced motion exercised in both modes through a private local test proxy emulating JS/CSS media preference; 2D banner transition measured 0s. This is not an OS/device preference certification. Full screen-reader and contrast audit remains open. |
| Privacy, secrets, retention and audience boundaries | Pass, scoped | Source retains deployment placeholders. Private test harness and deployment receipts are outside the repository. Browser tests use local canisters; practice scenes cannot publish. |
| Timezones, currency, source evidence and freshness | Pass, regression | Physics/rules/scoring/course files remain byte-identical except display VERSION strings. Rules remain moon-2026-09-30 / arcade-2026-09-09; no season or state-schema change. Fictional cycle counters remain labelled. |
| Notifications, automation history and recovery | N/A | No new notifications or external automation. |
| Contextual guide, help, changed behavior and changelog | Pass | Supplied README and 0.20.0 changelog preserved. Existing help and installation/release workflow retained. |
| Representative task repeated after change | Pass, scoped | Both normal modes completed. Full 3D practice encounter from 450 m through 1,683.8 m recorded waiting → arrive → orbit → warning → fire → recover → leaving, including three hits. Targeted hit, projectile and Overdrive scenes rendered successfully. |
| Module tests and release checks | Pass, source checkpoint | Pinned npm/Mops installs, check --fix, backend/frontend builds, committed stable compatibility, 171 frontend checks, default backend test, 29 historical security checks, populated standalone upgrade and runtime/brand/design checks passed. Actual stamped-artifact validation and deployment evidence are retained separately by the release operator. |

## GPU evidence and limits

Browser rendering used ANGLE Metal on Apple M1 Pro with 4× MSAA, not software
rendering. A normal 3D flight recorded startup 17,291 ms, p95 frame interval 33 ms,
maximum 392 ms and two frames above 50 ms. A later warm-cache practice encounter
recorded startup 2,013 ms, p95 17 ms and maximum 183 ms. Samples have different
viewports/cache state and are not a benchmark or proof of universal smoothness.
No black frames or browser warnings/errors were observed in the inspected scenes.
This does not prove every rendered frame on every GPU is free of artifacts.

Screenshots and the temporary GPU/encounter/media-emulation harness are retained
in private release evidence, not distributed as game code.

## Findings

| Priority | Rule ID | Observation / reproduction | User impact | Fix / owner | Status |
|---|---|---|---|---|---|
| P2 | VISUAL-02 / responsive layout | At 320 px, 3D HUD extends to 375 px; pause lies at x=339–375 and part of airspeed is clipped. At 390 px it fits. | Narrow-screen players cannot reach this pause button; profile/help still pause the flight. | Future narrow HUD layout correction / game maintainer | Open; supplied design retained per release scope |
| P2 | Accessible controls | 2D portrait cabinet styles hide the sound button. Desktop sound toggle and M work. | Touch-only portrait users cannot toggle sound in this layout. | Future mobile sound-control review / game maintainer | Open; supplied design retained per release scope |

## Deliberate exception

- Scope: Bug's immersive palette, HUD, pixel cabinet and local game typefaces; no suite account bar.
- Reason: preserve the user's supplied presentation release and the existing standalone game workflow. This does not change shared suite typography or product logos.
- Owner / decision date: user release request, 2026-10-01.
- Compensating measures: locally bundled licensed fonts, canonical marks/tokens, explicit state and score controls, regression tests and the mobile gaps above.
- Review: next Bug release; existing standalone/immersive review records remain applicable.

## Delivery

This record is the source/browser acceptance checkpoint. Production authorization
covers upgrading the existing Bug backend and frontend through Kitchen with the
same public origin, not reinstalling or creating canisters. The release operator
must test the actual stamped executable, preserve unrelated catalogue entries,
publish that identical format-2 artifact, run update and verify, and retain the
before/after preservation receipt. Hardware touch/tilt, Safari, real passkeys,
exhaustive accessibility and broader performance certification remain untested.
