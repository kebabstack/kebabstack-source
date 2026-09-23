# Working on kebab-stack

This repository targets Cloud Engines (including OpenCloud), for startups and SMEs.
Read README.md and the affected module's README, INSTALL and CHANGELOG before editing.

## Preserve deployments and shared sources

- Live working copies can contain deployment IDs in tracked frontend files. Never commit them.
  The repository keeps `__BACKEND_CANISTER_ID__`, `__HUB_URL__`, and `CANONICAL_ORIGIN = ""`.
- When another editor or agent is active, use an isolated clone/branch. Re-read before editing
  shared files, and review the current upstream diff before integrating changes.
- `sdk/js/hub-client.js` and `hub/dist/tokens.css` are canonical. App copies must be
  byte-identical; update the sources and synchronize their copies.
- Every release change needs a module version bump and a CHANGELOG entry. Keep `mops.toml`,
  backend/frontend version constants, served changelogs and Kitchen recipes consistent.
- Run `python3 hub/tools/sync-sdk.py`, then `python3 sdk/tools/check-sdk.py` after SDK or Hub changes.
- Generate `.did` and browser IDL from compiled source; do not hand-edit generated bindings.

## Verify changes

- Global navigation must remain visible while content scrolls (design rule `NAVIGATION-06`).
  Test actual scrolling on long pages at desktop, narrow and short/zoomed viewports;
  static screenshots and DOM-only smokes cannot verify sticky containment.

- Install the pinned dependencies with `npm ci` and `mops install` in each affected module.
- Use `mops check --fix`, then build each affected backend. Check the candidate stable signature
  with `moc --stable-compatible BASELINE.most CANDIDATE.most` against the **committed** baseline.
  Never replace the baseline before checking it. A fresh-install test is not an upgrade test.
- Run the frontend smokes and the local backend security tests. Keep regressions that demonstrate
  real authorization or data-integrity failures, including negative and successful cases.
- Setup requires a one-time code. Never restore an open first-visitor-wins claim window.
- Local tests must use isolated identities and local canisters. Production deployments require
  explicit authorization for that deployment.

## ICP guidance

Fetch https://skills.internetcomputer.org/.well-known/skills/index.json once per session.
Before editing ICP code, read the matching SKILL.md resources. Relevant areas include
reviewing-motoko, writing-motoko, canister-security, cloud-engine-canisters and mops-cli.
Preserve the pinned compiler and existing state contract during fixes; justify larger migrations
with actual compatibility and upgrade tests. Do not classify a style preference as an exploitable bug.

## Documentation

Explain both the IT operator's workflow and the executive's decision. Distinguish implemented,
alpha and planned behavior. Ground savings in a stated cost model; qualify platform dependencies,
remaining operator work and data-location/confidentiality claims. Never promise zero operations,
guaranteed savings or instantaneous revocation where the implementation cannot ensure it.

## Release workflow

- Read `kitchen/INSTALL.md` before a suite rollout. Build and publish a tested
  format-2 bundle, then use `kitchen/tools/release.mjs update` (the same executor
  as Hub → Apps → Updates). Publish and deploy the identical stamped artifact.
- Do not restamp Wasm during deployment or leave the release catalogue behind
  a direct rollout. Exceptional direct deployments must be reconciled with a
  matching published release and `verify`; mismatches must remain visible.
- Keep the release store's existing immutable packages and bootstrap/domain files.
  Installer upgrades use `upgrade-installer` only while no job is active.
- Verify actual packaged executables as well as local Mops builds: the ICP recipe
  can use different build settings. Include populated upgrades and Lunch/central-
  permission preservation checks. Existing production-authorization rules apply.

## Product logos

[Logo library and design rules](design/logos/README.md) define the permanent Kebabstack product marks approved from kebabstack.dev. Use `design/logos/registry.json`; never invent a separate app logo, emoji or coloured tile. Run `npm run brand:sync` and `npm run brand:check` when changing a mark or adding a tool. Keep the website, app favicon/header, Hub menu, Kitchen recipe and Cloud Engine console aligned. Company and external-app branding remain separate.

## Product design standard

The [Brand & Product System](design/README.md) is the shared design and UX authority.
Before changing a user-facing flow or adding a tool, read its relevant rules in
[the complete standard](design/STANDARD.md), reuse the canonical logos/shared
foundations, and use [the review template](design/REVIEW-TEMPLATE.md). The standard
covers behavior, permissions, SSO, states, automation, privacy and accessibility
as well as appearance. Existing apps are migrated through the
[adoption plan](design/ADOPTION.md); the shared tokens are generated from `design/tokens.json` into canonical
`hub/dist/tokens.css`; shared controls live in `hub/dist/components.css`. Run
`npm run runtime:sync` and `npm run runtime:check` and do not introduce local
app palette overrides. Run `npm run design:build` and `npm run design:check` for
standard changes. Keep source, generated docs, versions and changelogs aligned.
