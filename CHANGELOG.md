# Monorepo changes

## [0.3.0] — 2026-10-18

- Add shared workspace table/form and source-viewer regression coverage, canonical distribution checks and rotating daily review guidance.

## [0.2.6] — 2026-10-18

- Extend the daily integrity workflow with interactive visual coverage, safe public-source publication and website evidence checks. Keep private reports outside public distribution.
- Reconcile the adoption-limit overview with current Contracts uploads, Crumbs consent modes and explicit integration/UX/dependency evidence boundaries.
- Correct the public repository installation URL and remove links to private rollout receipts from public-facing guides.
- Reconcile publication safeguards from the public upstream: reject private files added to an exported repository, enforce Crumbs placeholders, and distinguish valid Unicode replacement characters from binary data. Exclude dated private integrity receipts.
- Normalize generated Candid whitespace without changing signatures. Hub/Kitchen browser bindings and MCP dependency updates have independent module releases.

## [0.2.5] — 2026-10-18

- Require stack-wide integrity and dependency tracing for each change, including APIs/SDKs, documentation, versions, integrations, packaged upgrades and explicit verification limits. Define the general bug-check workflow in `docs/INTEGRITY-CHECK.md`.
- Reject stale served changelogs and mismatched module package/lock/OpenAPI versions in release metadata checks; test both stale and corrected companion files.
- Refresh the SDK example lockfile for the current SDK dependency graph; the existing locked build gate exposed the stale local dependency hash.
- Include the independently deployed website build/tests in the suite gate. Update the website integration fixture to acknowledge Crumbs durable receipts and always close its test window on failure.
- Discover all root Node regression files instead of maintaining a second manual list; this restores the omitted Forms intake tests to the whole-suite gate.
- Remove the obsolete Contracts relay test path and the stale suite-overview relay claim; Contracts removed email intake in 0.14.0.
- Align the suite overview with Crumbs' optional consented browser recognition. No application or production permission changes accompany these repository rules.

## [0.2.4] — 2026-09-18

- Added Hub Operations shared-screen pairing, scoped aggregate access, expiry and revocation, with an independent TV view and local authorization/upgrade regressions. Historical trends and the remaining marketplace roadmap are still planned.

## [0.2.3] — 2026-09-18

- Implemented the signed-in Hub Operations work view and authenticated numeric source summaries, with local UI, permission and populated-upgrade checks. TV credentials and historical charts remain planned.

## [0.2.2] — 2026-09-18

- Added a staged roadmap for Hub Operations, connected follow-up, SaaS account
  reconciliation, evidence exports, assistant controls and public distribution.
- Added a committed-source audit/export gate that excludes internal operational
  records and Git history, reports findings without credential values, preserves
  source/license bytes and refuses unresolved findings or unsafe destinations.
- Added hash-bound manual asset reviews and regression coverage for publication
  boundaries. This does not certify the current source as marketplace-ready.
- No application code, deployment configuration, roles or directory interfaces changed.

## [0.2.1] — 2026-09-10

- Consolidate the Desk 0.8.1 and Assets 0.9.0 branches with Hub 0.22.1, Contracts 0.7.0 and Bug 0.17.0. Preserve deployment placeholders and installation-specific metadata.
- Pin patched transitive development dependencies: smol-toml 1.7.1 for Mops in root and both game packages, and sharp 0.35.4 for the Contracts relay simulator. Retain the pinned Mops compiler and Wrangler versions. Game runtime releases are unchanged.
- Always install the game dependencies and run the Contracts relay tests in the whole-suite check, including fresh CI checkouts. Compare upgraded Kitchen/Vault versions against their release manifests instead of a stale hardcoded Kitchen 0.6.0.
- Fix the ABM regression harness to inspect the pinned PocketIC client’s tuple-shaped HTTP headers; preserve the bearer-token assertion and renew the test login after advancing 181 days to check assertion expiry.
- Keep the unfinished Kitchen Domains work on a separate draft branch. No production deployment accompanies this consolidation.

## [0.2.0] — 2026-09-05

- Security and correctness review: Hub 0.16.0; Desk/Assets/Watch 0.4.0; Kitchen 0.6.0; Vault 0.2.1; SDK 0.2.0. See module changelogs for behavior changes.
- Pin local compiler/test tooling, add real backend security regressions, release guards and CI checks.
- Rewrite executive/IT positioning and operational/install guidance; synchronize served help and remove unsupported cost, availability and adoption claims.
- Preserve deployment placeholders, shared SDK sources and committed stable baselines. No live deployment accompanies this review.
