# Product design review · Ship the Bug 0.20.1

- Standard: 1.2.0; retained standalone immersive-game exception.
- App: Bug 0.20.1, based on public 0.20.0 (`bc4bff6`).
- Task: keep flight visible during boosts, release steering reliably, reach pause/sound on phones.
- Roles/scopes: fictitious local guest/practice flights and isolated backend identities; no production score writes.
- Date/reviewer: 2026-10-01 / Codex.
- Status: scoped verification complete; not full accessibility/device certification.
- Rules: VISUAL-02, NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07.
- Before: reported fade near God Candle, intermittent held steering and two mobile findings from the 0.20 review.
- Outcome: repair those failures, retain presentation, flight balance, boards and origin.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task and completion | Pass | Real God Candle lab action uses existing shot/coin logic. Before the fix body opacity fell to 0.0000146; after it stayed 1 throughout 208 animation frames. Green effect retained. |
| Positive/negative permissions and guests | Pass, regression | Historical 29-check security/upgrade suite and populated standalone identity/delegation suite. Backend changes only BUILD_VERSION. |
| Direct entry, launch, deep link, session expiry | Pass, scoped | Local 2D/3D entry, launch, help and pause. Existing session/publication regressions retained; real passkeys not recertified. |
| Loading, stale, error and forbidden states | Pass, scoped | GPU preparation completes. Injected invalid post-effect uniform previously blackened the frame; corrected renderer preserves the raw scene and recovers. Existing loading/error regressions pass. |
| Retry, interruption and duplicate action | Pass | Two new pointer tests failed before and pass after: release outside button after failed capture; return with unpressed mouse after lost release. Independent pointers and cancelled charges retained. |
| Input validation, drafts, save and review | Pass, regression | Existing validation unchanged. Hover at four positions gave x=0, vx=0, no keys/held controls with tilt disabled. |
| Lists, counts and data scope | Unchanged | Same boards, rules, scoring and course. No export/pagination changes. |
| Canonical logos, tokens, type and components | Pass with retained exception | Runtime sync/check, brand/design checks pass. No new assets, fonts, logos or palette. Discarded SDK timestamp-only sync change; canonical content unchanged. |
| Assembled viewport and hierarchy | Pass, scoped | Desktop presentation retained. 320px HUD has two rows, all three statistics and cycle-burn line separate from commander. |
| Reflow, desktop, zoom, long labels | Partial | Both modes at 320×740, desktop 1280×800, short 800×450. 3D HUD x=12…308, pause x=253…297 (44×44); 2D pause x=252…296 (44×44). No horizontal document overflow. Exhaustive text enlargement/long-name sweep open. |
| Actual scrolling (NAVIGATION-06) | Pass, scoped | Help scrolled 3,700px at 320×740 (3D), 1,800px at 800×450 and 1,600px at 1280×800 (2D). Header top stayed 0. Modal intentionally inerts game; standalone exception retained. |
| Keyboard, focus, screen reader, contrast, reduced motion | Partial | Both pause buttons open dialog and focus Resume. Space launches 2D. 320px sound button visible (36×44), off→on→off with accessible state. No new motion. Prior reduced-motion behavior retained; physical sensors, screen-reader and full contrast certification not performed. |
| Privacy, secrets and audience | Pass, scoped | Fictitious local profile; harnesses, deployment IDs and private receipts outside Git. Source placeholders retained. Public-source pattern audit and secret scan pass. |
| Timezones, currency and freshness | Unchanged | Fictional cycle telemetry stays labelled; no time/currency changes. |
| Notifications and automation | N/A | No messaging, notification or scheduler changes. |
| Help, behavior and changelog | Pass | New 0.20.1 entry; 0.20.0 preserved. Existing controls/help remain accurate. |
| Representative task repeated | Pass | Full real-GPU Motoko encounter: 450→1,680.46m, 838 frames, waiting→arrive→orbit→warning→fire→recover→leaving, three hits. Both mode controls exercised. A normal 2D flight completed at 4,253m / 48 coins / 6,653 points and published to the isolated local board. |
| Module tests and release checks | Pass, source checkpoint | Pinned installs, Mops check/build, committed stable compatibility, 175 frontend tests, 29 historical backend checks, standalone migration, runtime/brand/design guards. Actual stamped artifact testing remains a separate required release gate. |

## Findings

| Priority | Reproduction / impact | Fix | Status |
|---|---|---|---|
| P1 | `.surge` matched both overlay and temporary body state; entire game faded during a 900ms boost cue. | Scope overlay style to `body > .surge`; regression covers both modes and boost states. | Browser-reproduced before/after; fixed |
| P1 | Failed capture lost releases outside the button, leaving steering/fire held. | Matching global release/cancel and unpressed-mouse recovery. | Failing-before/passing-after tests; fixed |
| P2 | Six reversed smoothstep edges produced undefined shader results. Invalid effects could propagate black frames. | Ordered edges and raw-scene fallback. | GPU fault injection verified; fixed |
| P2 | 320px HUD overflow put pause offscreen. | Two-row HUD, 44px pause, separate telemetry line. | Both modes verified; fixed |
| P2 | 2D portrait hid sound. | Keep toggle visible and fit header. | Off/on/off tested; fixed |

The [Khronos smoothstep definition](https://github.com/KhronosGroup/OpenGL-Refpages/blob/main/gl4/smoothstep.xml)
specifies undefined results when edge0 is greater than or equal to edge1.
This portability defect is separate from the reproduced CSS fade.

## GPU evidence and limits

ANGLE Metal / Apple M1 Pro, 4× MSAA. Route sweep: 721 frames over 0…18,000m,
no black frames. Quality transitions exercised levels 0, 1 and 2 over 180 frames,
no black frames. The complete Motoko encounter likewise had no black frames.
Invalid-effect injection: mean luminance before 80.29, fallback 60.16, restored
80.29; no nearly-black sample fraction. The fallback keeps the scene while
omitting the defective effect. These are scoped checks, not a performance
benchmark or certification of every GPU/browser.

The reported fade was initially absent from canvas pixel probes because CSS
opacity affected the whole page. The user's God Candle clarification led to
its exact reproduction. Private screenshots and harness records are retained
by the release operator outside the repository.

## Exception and delivery

Retain approved standalone immersive palette, fonts and game navigation from
0.20. Owner: user release request, 2026-10-01; next review on material interface
change. No new branding exception.

This source review precedes deployment. Test the stamped executable, publish
the identical format-2 Bug recipe and upgrade existing canisters through Kitchen.
Preserve other catalogue entries and immutable packages. Verify hashes, boards,
profiles, domains, Lunch and central permissions with private before/after
receipts. Safari/mobile hardware, real passkeys and exhaustive accessibility
remain outside this hotfix certification.
