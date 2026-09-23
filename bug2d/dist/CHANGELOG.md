# Changelog

## [0.2.5] — 2026-09-23

- Prepare the public source edition: use the canonical Bug mark for the flight guide and omit the supplied mascot portrait whose redistribution license was not documented. Flight behavior, profiles and scores are unchanged.

## [0.2.4] — 2026-09-22

- Synchronize the shared navigation SDK scroll fix. Preserve the embedded account panel and immersive game/HUD layout; no game-balance changes.

## [0.2.3] — 2026-09-22

- Keep the legacy standalone frontend compatible with shared suite navigation/tokens; the unified Bug app remains the supported deployment.

## [0.2.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.2.1] — 2026-09-17

- Synchronized the shared browser SDK; Hub jump URLs preserve the intended app without retaining a stale Hub route. Public play and optional sign-in remain unchanged.

## [0.2.0] — 2026-09-08

- Replace coarse pixel sprites and scanlines with smooth illustrated Canvas2D art,
  layered sunsets, clear bug/Motoko silhouettes and a modern retro interface.
- Increase full-charge launch speed from 70 to 102 m/s at 38°, shorten charge to
  0.9 seconds, strengthen boosts, and make the trajectory more direct.
- Remove keyboard arrows, touch arrows, tilt chooser and CRT controls. Automatic
  forward flight uses launch, boost and fire; help and flight hints match.
- Move Motoko into a wider, higher orbit and lead its motion with the blaster.
- Anchor the DFINITY façade, windows and sidewalk to one consistent street baseline.
- Cache character/background art and reuse world objects between chunk boundaries.
- Preserve profiles and scores through a tested 0.1.0 → 0.2.0 upgrade; reject new
  submissions from outdated clients. Existing scores retain their original balance.

## [0.1.0] — 2026-09-08

- Fork the 0.11.0 3D gameplay into its own `bug2d` module and independent deployment.
- Canvas2D side view, integer-pixel sprites, Zurich skyline and rooftop, striped
  sunset, space chapters, a pixel Motoko, laser pulses, pickup effects and CRT toggle.
- Flatten the collision plane and adapt steering to pull up/dive with a speed cost.
  Keep five boosts, heat, shields, mines, recurring Motoko, FLOW and end-of-flight results.
- Separate server leaderboard, frontend identity/local scores, version validation
  and Hub tile; keep opt-in publication and existing authentication protections.
- Keyboard and multi-touch controls; reduced motion and pausing remain supported.
