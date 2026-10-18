# Public alpha source

This repository contains the Kebabstack monorepo: Hub, Desk, Assets, Trust,
Contracts, Forms, Watch, Crumbs, Kitchen, Vault, the SDK, MCP bridge, product website,
design standard and optional Ship the Bug game. The retained `bug2d/` folder is a
legacy standalone game, not another active suite application. Phone is a design
placeholder, not a shipped app. No Lunch application is included.

The first public commit is a reviewed snapshot with a new history. Internal
deployment receipts, operational review notes, customer data, environment files,
controller credentials, build caches and application state are excluded. Runtime
identifiers remain placeholders. Public infrastructure identifiers and synthetic
test fixtures are intentional. A private development history is not bundled.

## Review the system

1. Start with [the module map](../README.md) and [known limits](GAPS.md).
2. Inspect [central permissions](APP-PERMISSIONS.md), the SDK and each module's
   `backend/main.mo`, Candid interface, frontend and tests. Permissions are
   enforced by the backends; hiding a button is not an access boundary.
3. Run [the documented checks](../CONTRIBUTING.md). They use local PocketIC
   instances and synthetic data, never company identities or production canisters.
4. Review [installation](INSTALL.md), [updates](../kitchen/INSTALL.md),
   [recovery](OPERATIONS.md) and the external service dependencies before a pilot.
5. Report vulnerabilities through [the private reporting channel](../SECURITY.md).

`.kebab-public-source.json` records this reviewed snapshot's file hashes, source
revision and retained public-source overlay. Git commits and release tags identify
subsequent changes. The exporter and its regression tests are
included, but a clean pattern scan is not proof that every issue has been found.

## Scope of this release

The source is MIT licensed, with [upstream exceptions and notices](../THIRD_PARTY_NOTICES.md).
Public source availability is separate from an OpenCloud Marketplace listing.
There is no marketplace certification, independent security audit, universal
regulatory approval or guaranteed operating-cost claim. Review each module's
alpha limits and external integrations.

Historical Wasm baselines containing deployment metadata are not distributed.
Tests needing those artifacts report skips when they are absent; stable-signature
checks still compare against the committed `.most` files. New source releases can
serve as reproducible baselines for future populated-upgrade tests. A backup of
source is not a backup of the data in a running installation.

For future updates, keep production identities and operational configuration
outside this repository. Follow [the source publication procedure](PUBLIC-SOURCE.md)
and the versioned Kitchen release workflow for deployable packages.

## Source maintenance — 18 October 2026

The current source update includes Contracts 0.21.0 with space-scoped, read-only
Brex imports, per-payment assignment across contracts, daily review and guided
completion. It also carries the integrated shared workspace UI versions: Hub
0.41.0, Desk 0.34.0, Assets 0.29.0, Crumbs 0.10.0, Trust 0.12.0, Watch 0.12.0 and
Forms 0.8.0. Kitchen remains 0.9.1, MCP 0.3.1 and website moves to 0.5.7.
Public Bug 0.20.2 and legacy Bug2D 0.2.5 are preserved instead of replacing them
with older internal game sources. Their canonical SDK copies remain synchronized;
the standalone game shell remains independent of company navigation.

The Contracts rollout and website publication are verified separately from this
source snapshot. No real Brex token or payment record is included. Pinned development
tooling still has dependency advisories; passing checks are not a security audit.
See the Contracts validation receipt, module tests and installation guides.
