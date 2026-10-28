# Changelog

## Documentation — 2026-10-28

- Correct the README read-authorization cache duration to less than 60 seconds, matching the implementation since 0.2.1. State-changing calls still refresh authorization. No executable, API or release-version change.

## [0.2.2] — 2026-09-22

- Publish the canonical line mark in the release catalogue. The packer verifies the central logo registry before creating releases. No stable-state or operational changes.

## [0.2.1] — 2026-09-05

- Preserve an unconfirmed restart/operation as a failure even when a snapshot is later found; keep snapshot metadata and actionable recovery details.
- Abort retention cleanup on a failed deletion instead of pretending the snapshot disappeared.
- Limit owner read authorization caches to below 60 seconds; clear them on Hub changes and failed refreshes.
- Align mops package version with info().version (the previous package said 0.1.0 while runtime reported 0.2.0); document per-canister and off-platform backup limits.
