# Crumbs

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

Cookieless website analytics for kebab-stack, targeting a reliable Plausible replacement. **0.6.1 is an alpha pilot, not yet approved to retire Plausible.** Backend, native HTTP collection, REST API and dashboard run on your Cloud Engine. A Node/SQLite collector remains optional. Core analytics does not require an external analytics SaaS. Optional Google integrations are explicitly configured by the operator.

For management: the implemented core covers traffic, acquisition, events, goals, funnels, journeys and historical imports. The adoption decision depends on matching your real workload and the features you use. There is no validated throughput or operating-cost claim. See [replacement acceptance](PARITY.md).

For operators: [INSTALL](INSTALL.md) covers native collection, Hub access, retention, monitoring, deployment and the optional Node collector. [API](dist/api.html), [OpenAPI](dist/openapi.json), [metric definitions](METRICS.md), [privacy](PRIVACY.md) and [changelog](CHANGELOG.md) describe the implementation.

## Implemented

0.6.1 puts website context in the compact page heading. Use All websites to add a site, Settings to inspect your access and Saved filters to open saved-filter actions.

New in 0.6.0: Acquisition compares channels, recognized AI referrals and campaigns with events and revenue. Goals & revenue adds no-code scroll thresholds and source-attributed currency totals. Saved filters/funnels and All websites reduce repeated setup. Search Console has guided, on-demand OAuth setup; a downloadable Data Studio connector reads aggregates with a website-scoped key. See the in-app [integration guide](dist/integrations.html).

- Small tracker with no cookies or browser storage; pageviews, SPA navigation, custom events/properties, optional outbound/download/form events, active time and scroll depth. Consent gating, pause/resume, GPC and DNT support. No account IDs or persistent cross-site identifier.
- Native canister HTTP ingress with durable commit before acknowledgment, per-site daily HMAC visitor estimates, batching, retries, deduplication and atomic validation. Raw IP/UA are processed by the canister but excluded from stored analytics events. Optional Node/SQLite collector and local GeoIP database.
- Dashboard with realtime visitors, date comparison, campaign/source/page/device/location reports, compound filters, goals, sequential funnels, journeys, entry/exit pages and imported history. Reporting timezone is explicitly UTC in this release.
- Task-focused settings for General, Tracking script and People & access; automatic website IDs, quick/custom date ranges, explicit goal/funnel forms, copy controls and unsaved-change confirmation. Empty accounts show one relevant next step.
- Native Candid plus REST v1, generated Candid/browser bindings, OpenAPI 3.1, JS client with TypeScript declarations, raw export, goals, annotations and import endpoints. Read/manage/share keys require their issuer's current website management rights and a fresh Hub directory.
- Hub sign-in and central roles: Admin, Analyst (viewer), None. New access defaults to None. Per-website Read/Manage grants to named Hub users; Hub owners/admins always administer all websites. New websites start admin-only. Separate signed collector principals. See [website access](ACCESS.md).
- Plausible CSV importer for ten documented export tables. Original compound groups are preserved; historical data remains separate from live statistics.
- Explicit storage/report bounds, immediate retention filtering and bounded physical cleanup. Populated upgrade and access-control tests use real local PocketIC canisters.

## Architecture

```text
website / SPA → HTTPS gateway → Crumbs backend on Cloud Engine
                                     │ native HTTP update → durable events
                                     ├ REST v1 / Candid ← dashboard and integrations
                                     └ Hub directory ← users and website access
```

The HTTP query entrypoint requests a verified update. Successful native `202` responses report `durability: "canister"`: accepted events are already committed. The backend chooses time, order and the daily website visitor hash; browser-supplied identifiers cannot override them. IP limits and total event budgets bound application work. No extra server is required.

On the supported ICP gateway, `X-Real-IP` is overwritten from its connection metadata. Ordinary `X-Forwarded-For` is ignored. This is **not proof of a gateway caller**: direct public Candid calls can forge request headers, and browser analytics are inherently forgeable. No HTTP header grants report or management access. Collection continues during Hub outages; protected reports fail closed when the directory lease expires.

Native requests, including IP and User-Agent, enter replicated canister execution. Only normalized events, daily random secret and HMAC rate keys enter application state; raw addresses and User-Agents are not stored there. Gateway/subnet ingress handling, logs and snapshots remain part of the privacy assessment. The optional Node mode keeps raw IP/UA out of canister requests and adds a disk queue; choose one collection mode per website to avoid inconsistent visitor estimates. Native mode has no GeoIP lookup, so location fields remain empty. See [PRIVACY](PRIVACY.md).

## Local development

From the repository root, run `npm ci`, then run `npm ci` from `crumbs/collector`. In `crumbs`, run `../node_modules/.bin/mops install --locked`, `../node_modules/.bin/mops check --fix`, then `../node_modules/.bin/mops build`. Generate bindings with `python3 tools/sync-bindings.py crumbs` from the root. Tests:

```sh
node --test crumbs/test/*.test.mjs tests/crumbs.test.mjs
bash crumbs/test/run-smoke.sh
node crumbs/test/preview.mjs
```

The preview at `http://127.0.0.1:8792` uses explicitly labelled sample data; it is not deployed or included in release assets. Root `npm run check` builds and checks the whole suite, including Crumbs. See the suite release workflow before deployment.
