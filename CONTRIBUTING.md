# Develop and verify

Use a separate checkout when another editor/deployer is active. Read AGENTS.md.

```bash
npm install -g @icp-sdk/icp-cli@1.4.0 @icp-sdk/ic-wasm@0.11.1
npm ci
export PATH="$PWD/node_modules/.bin:$PATH"
npm run check
```

The npm lock pins Mops, jsdom and the PocketIC client. Mops pins compiler 1.12.0
and module dependencies. `npm ci` installs the PocketIC binary through its package
install script; review dependency changes before updating the lock. Node must be
22.22.2 or a newer supported release compatible with these dependencies.
`npm run check` reads the deployment placeholders from the git index, so a working clone that keeps live canister ids in its tracked frontends (never commit them) still passes; the metadata checks run against the working tree.

`bug/`, `contracts/relay/` and `kebab-mcp/` have their own pinned npm locks.
`npm run check` installs them with `npm ci --ignore-scripts` before their checks,
so a fresh CI checkout exercises the game and email relay too. The assistant server’s `package.json` version, `VERSION` in
`server.mjs` and `CHANGELOG.md` must agree (check-release).

Every changed module gets a semantic version and changelog entry. Versions shown
by `version()`, `info()` or `hub_manifest()` must describe the running code, so
backend build constants are transient. Generate Candid from Motoko, then run
`python3 tools/sync-bindings.py` and `python3 hub/tools/sync-sdk.py`. Copy the shared
browser client/tokens from their canonical sources, never edit app copies.

`tools/check-release.py` checks version/changelog consistency, placeholders and
portable lockfiles. Install the staged-content guard once:

```bash
git config core.hooksPath .githooks
```

The hook checks the staged blob even on a machine without local canister mappings.
Do not stage the live-ID variants of frontend files. Work from a clean clone for
release packing: `python3 kitchen/tools/pack-recipes.py --build`. It rejects stale
artifacts, dirty source and unsafe output destinations; failures preserve the
previous pantry. A recipe hash is integrity against the manifest, not provenance.

No test command deploys to a live network. Local security tests execute Wasm in
PocketIC and mock external identity-provider responses. They do not establish
production latency, operator availability or full OIDC/SCIM interoperability.
Run representative upgrade and restore tests on a disposable engine before a
production release. See docs/OPERATIONS.md for the deployment ledger and recovery.

For a stateful upgrade regression, build the deployed commit in a separate checkout
with its pinned compiler. Keep the relevant Wasm modules as
`<baseline>/<module>/backend.wasm`, then run
`KEBAB_BASELINE_DIR=<baseline> npm run check`. This additionally upgrades populated
Hub/Desk/Assets/Watch state and preserves Vault/Kitchen configuration. Contracts
also supports `KEBAB_CONTRACTS_SAAS_BASELINE_DIR` for a populated 0.6.3-to-0.7.0
upgrade. Bug has separate populated mode-board and public-session regressions,
documented in [its install guide](bug/INSTALL.md). A runtime upgrade requiring
an unavailable historical artifact is explicitly skipped, never reported as tested.
Stable compatibility is checked for all active modules and the SDK example.

The retained standalone `bug2d/` deployment is outside the active Kitchen recipe.
Check it separately with its pinned `npm ci`, `npm run build:backend`, `npm test`
and `npm run test:backend`; do not deploy it over the integrated 2D/3D game.

For a public source release, follow [the publication procedure](docs/PUBLIC-SOURCE.md).
`npm run test:publication` checks the source exporter locally. `npm run audit:public-source`
audits committed HEAD and is expected to block while publication findings remain;
it never uploads code or changes a running deployment. Retain the license and
attribution when creating a new sanitized Git history.

For reproduction only, `KEBAB_TEST_WASM_DIR=<baseline> node --test
--test-name-pattern='<case>' tests/security.test.mjs` runs selected regressions
against old Wasm. Failures are expected for fixed vulnerabilities. Never set this
variable for candidate acceptance. External SSO responses remain mocked.

## Product design standard

The [Brand & Product System](design/README.md) is the shared design and UX authority.
Before changing a user-facing flow or adding a tool, read its relevant rules in
[the complete standard](design/STANDARD.md), reuse the canonical logos/shared
foundations, and use [the review template](design/REVIEW-TEMPLATE.md). The standard
covers behavior, permissions, SSO, states, automation, privacy and accessibility
as well as appearance. Existing apps are migrated through the
[adoption plan](design/ADOPTION.md); the target tokens do not silently replace
`hub/dist/tokens.css`. Run `npm run design:build` and `npm run design:check` for
standard changes. Keep source, generated docs, versions and changelogs aligned.

Use public pull requests for code and reproducible issues for bugs. Do not include real customer records, access tokens, private keys or production configuration. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Contributions are under the repository MIT license unless an existing upstream license applies.
