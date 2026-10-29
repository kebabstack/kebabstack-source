# Crumbs

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

Website analytics with cookieless defaults and an optional consented cookie mode for kebab-stack, targeting a reliable Plausible replacement. **0.13.0 is an alpha pilot, not yet approved to retire Plausible.** Backend, native HTTP collection, REST API and dashboard run on your Cloud Engine. A Node/SQLite collector remains optional. Core analytics does not require an external analytics SaaS. Optional Google integrations are explicitly configured by the operator.

For management: the implemented core covers traffic, acquisition, events, goals, funnels, journeys and historical imports. The adoption decision depends on matching your real workload and the features you use. There is no validated throughput or operating-cost claim. See [replacement acceptance](PARITY.md).

For operators: [INSTALL](INSTALL.md) covers native collection, Hub access, retention, monitoring, deployment and the optional Node collector. [API](dist/api.html), [OpenAPI](dist/openapi.json), [metric definitions](METRICS.md), [privacy](PRIVACY.md) and [changelog](CHANGELOG.md) describe the implementation.

## Implemented

0.11.0 adds native operator-loaded GeoIP/network datasets, screen size and transparent hosting/automation classification in both tracking modes. [Dataset operation and limits](TRAFFIC.md). [Matomo historical aggregate migration](MATOMO.md) is available; imported history retains the original definitions and timezone. Production cutover still requires measured acceptance.

0.9.1 fixes report instruction exhaustion by reusing compact visitor keys and session-level acquisition calculations. Tracking script settings link the [cookie/cookieless comparison](dist/consent.html#comparison); [API mode examples](dist/api.html#collection-modes), normalized export schema and TypeScript declarations match both modes.

0.9.0 adds optional consented cookies, a visitor choice panel and [CMP integration guide](dist/consent.html), delivery receipt validation, idempotent consent callbacks and accurate route counting even after URL redaction. Collection mode is available as a report breakdown/filter. Existing websites remain cookieless unless their embed is explicitly replaced.

0.6.1 puts website context in the compact page heading. Use All websites to add a site, Settings to inspect your access and Saved filters to open saved-filter actions.

New in 0.7.0: reports open on the last seven days in the website's time zone with previous-period comparison, Acquisition shows conversions per source for a chosen goal, quick goals and funnels save in one click, and Settings adds a website from its domain alone while showing whether tracking data arrives.

New in 0.6.0: Acquisition compares channels, recognized AI referrals and campaigns with events and revenue. Goals & revenue adds no-code scroll thresholds and source-attributed currency totals. Saved filters/funnels and All websites reduce repeated setup. Search Console has guided, on-demand OAuth setup; a downloadable Data Studio connector reads aggregates with a website-scoped key. See the in-app [integration guide](dist/integrations.html).

- Default tracker mode has no cookies or browser storage; optional 90-day first-party browser IDs require explicit consent; pageviews, SPA navigation, custom events/properties, optional outbound/download/form events, active time and scroll depth. Consent gating, pause/resume, GPC and DNT support. No account IDs or persistent cross-site identifier.
- Native canister HTTP ingress with durable commit before acknowledgment, per-site daily HMAC visitor estimates, batching, retries, deduplication and atomic validation. Raw IP/UA are processed by the canister but excluded from stored analytics events. Optional Node/SQLite collector and local GeoIP database.
- Dashboard with realtime visitors, date comparison, campaign/source/page/device/location reports, compound filters, goals, sequential funnels, journeys, entry/exit pages and imported history. Daily buckets follow the website's time zone; hourly and realtime buckets and visitor-ID rotation stay on UTC.
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

The HTTP query entrypoint requests a verified update. Successful native `202` responses report `durability: "canister"`: accepted events are already committed. The backend chooses time, order and the daily website visitor hash; browser-supplied identifiers cannot override cookieless estimates. Explicitly consented random cookie IDs produce separate site-scoped browser pseudonyms. IP limits and total event budgets bound application work. No extra server is required.

On the supported ICP gateway, `X-Real-IP` is overwritten from its connection metadata. Ordinary `X-Forwarded-For` is ignored. This is **not proof of a gateway caller**: direct public Candid calls can forge request headers, and browser analytics are inherently forgeable. No HTTP header grants report or management access. Collection continues during Hub outages; protected reports fail closed when the directory lease expires.

Native requests, including IP and User-Agent, enter replicated canister execution. Only normalized events, daily random secret and HMAC rate keys enter application state; raw addresses and User-Agents are not stored there. Gateway/subnet ingress handling, logs and snapshots remain part of the privacy assessment. The optional Node mode keeps raw IP/UA out of canister requests and adds a disk queue; choose one collection mode per website to avoid inconsistent visitor estimates. Native mode uses locally loaded, unexpired datasets; missing or expired matches leave location fields empty. See [PRIVACY](PRIVACY.md).

## Local development

From the repository root, run `npm ci`, then run `npm ci` from `crumbs/collector`. In `crumbs`, run `../node_modules/.bin/mops install --locked`, `../node_modules/.bin/mops check --fix`, then `../node_modules/.bin/mops build`. Generate bindings with `python3 tools/sync-bindings.py crumbs` from the root. Tests:

```sh
node --test crumbs/test/*.test.mjs tests/crumbs.test.mjs
bash crumbs/test/run-smoke.sh
node crumbs/test/preview.mjs
```

The preview at `http://127.0.0.1:8792` uses explicitly labelled sample data; it is not deployed or included in release assets. Root `npm run check` builds and checks the whole suite, including Crumbs. See the suite release workflow before deployment.

## Shared workspace controls

Operational tables marked for shared controls offer **Table options** for finding
loaded rows and choosing columns. Header buttons sort only the currently loaded
rows; app filters, totals and exports retain their existing scope. Reset restores
the original order. Editable grids and existing app-owned queue sorting stay with
their workflows. Long marked selectors keep native selection and add an option
search. See [shared controls and evidence review](../sdk/WORKSPACE-UI.md).

### Exploring reports

Hover or tap Traffic over time to inspect the date and exact value for the selected metric. With keyboard focus on the chart, use Left/Right or Home/End; Escape dismisses the readout. The previous-period value appears when comparison is enabled. “View chart data” provides the same values as a table.

Overview breakdowns (pages, sources, countries, devices and more details) show ten rows at a time. Scroll inside a breakdown for the remaining loaded results, or focus it and use the keyboard. Clicking a row still filters the report. This display limit does not change reporting totals, API results or exports.

## Faster overview reports (0.13.0)

The overview and shared report bundle their dimensions for the same interval. Events and sessions are prepared once and whole-period totals reused; visitors are never calculated by summing daily uniques. Each bundle reads one current snapshot, checks access again, and uses no persistent result cache. Current, previous and realtime intervals remain separate snapshots as before. The previous period and realtime may therefore reflect a slightly different collection instant.

Direct Candid clients can call `reportBundle(token, request, [(dimension, limit)])`, falling back to `reportBundleFull` only for a query capacity/instruction error. Results are in input order and use the same `Report` records and counting/filter rules as individual reports. All dimensions share the request’s site, interval, filters and local-midnight boundaries; each has its own row limit. Bounds: 1–8 dimensions, each limit 1–1,000, at most 2,000 requested rows total. Invalid bundles fail as a whole. These are Candid-only dashboard methods; existing REST/OpenAPI/SDK and MCP report contracts remain unchanged. Intervals over 900 days retain the existing segmented chart path. No reimport or tracker change is needed.

A bundle is limited to 200,000 scanned-event × dimension units before aggregation. If a bundle exceeds this work limit or the full execution budget, the shared browser client splits **dimensions**, never the date range or visitor population, and only displays the complete result. Split groups are individually authorized snapshots and may reflect intervening collection. An individual report failure remains visible. Visitor counting uses an exact sparse bitmap over local ordinals, not a probabilistic estimate; visit counts use contiguous session traversal.
