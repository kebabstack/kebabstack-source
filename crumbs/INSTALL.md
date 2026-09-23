# Crumbs operator guide

This is an alpha pilot. Complete [PARITY.md](PARITY.md) before retiring Plausible. Requires Hub ≥0.30.0, the central permission policy, a Crumbs backend/frontend pair on your Cloud Engine, and an HTTP gateway exposing the backend. Native collection and the REST API run in the backend canister. No Node host is required.

## Build and install the app

Use the pinned root dependencies (`npm ci`), then build and verify as described in README. Crumbs uses Motoko 1.12.0/core 2.6.1 and the local SDK. `backend/backend.most` is the initial committed stable contract; every future release must check its candidate against that committed baseline and run a populated upgrade test. The initial migration is not a substitute for future versioned migrations.

Read `kitchen/INSTALL.md` before rollout. From a clean, tested commit, build the format-2 bundle with `python3 kitchen/tools/pack-recipes.py --build --out /absolute/release/recipes`. Publish the identical stamped artifacts to the existing release store, preserving previous immutable packages and bootstrap/domain files. Update Hub first, then install Crumbs via Hub → Apps → Add app or the corresponding `release.mjs install --app crumbs` executor. Production publish/deploy requires explicit authorization.

Create a central Crumbs policy in Hub → Permissions. Default is None; grant Analyst to selected people/groups. Hub owners/admins inherit Admin. The installer binds the Hub; a manually created **local test** canister uses controller-only `setHub`. No first-visitor claim endpoint exists. Keep canister controllers restricted and include the backend in the company's snapshot/recovery plan.

Sign in to Crumbs, add the site's exact lowercase hostname and choose retention (1–1827 days). The release uses UTC for daily buckets. Allowlist only safe event properties and exclude sensitive path prefixes. New websites are admin-only. Under Settings → People & access, search Hub people by name/email and assign Read or Manage. General contains website details and advanced retention/property/path settings. IDs are generated from the domain when a website is created. Hub owners/admins and centrally granted Crumbs admins always see and manage all websites. Existing 0.1.0 viewer rules stay in effect until reviewed. See [ACCESS](ACCESS.md) for the role matrix and upgrade behavior.

## Native collection (default)

After installation, open Settings → Tracking script. The collection API defaults to `https://BACKEND_CANISTER_ID.icp.net`; the generated snippet loads `tracker.js` from the dashboard frontend and explicitly selects `/api/v1/events` on the backend. Copy the snippet onto the intended website. `/healthz` returns `{ok:true,mode:"canister"}` when the current daily secret is ready. Initialization and rotation use `raw_rand`; clients retry while unavailable.

Use the verified gateway domain, not a `.raw` bypass. The canister returns `upgrade=true` from `http_request`, then commits via `http_request_update`. No raw IP or full User-Agent is stored in analytics state, but both pass through replicated ingress execution. On the supported ICP gateway, `X-Real-IP` comes from the gateway's connection metadata; confirm the same behavior when replacing that gateway. Direct Candid clients can forge headers, so these are counting inputs, never authorization. Missing/duplicate address headers are rejected; `X-Forwarded-For` is ignored.

A native `202` contains `{accepted,duplicates,ignored,durability:"canister",delivery:"committed"}`. Only accepted/duplicate records are confirmed stored; excluded paths, privacy signals and bots are acknowledged as ignored. A batch is atomic. Retry identical event IDs/payloads after failures; conflicts return 409. First successful receipt assigns the timestamp/order; retries preserve them across midnight and upgrades while retained and within the seven-day ingestion window. The browser keeps only a bounded memory queue: loss before acknowledgment remains possible. No native disk backlog exists. The daily random secret survives upgrades within its day and is replaced at UTC day boundaries. Raw IP/UA never enter stored event fields. Native GeoIP is not implemented.

Native bounds: 48 KiB request body, 50 events/batch, 300 events per IP/minute, 30,000 events total/minute and at most 5,000 active HMAC IP buckets/minute. Requests over limits fail explicitly; 429/503 include Retry-After. Direct Candid abuse can evade per-IP counting but not the global event budget. Platform ingress limits still apply. These are safety bounds, not benchmarked throughput promises.

Use one collector mode per website. For a custom collection domain, configure and verify gateway routing and TLS before replacing the default URL. Do not route the backend through the frontend asset canister. Keep the backend in the existing snapshot/recovery plan; snapshots may retain old daily secrets and data.

## Optional Node/SQLite collector

Choose this mode when you need local GeoIP or a queue outside the canister, and accept the additional host operations. Kitchen installs canisters only; it does not install this optional host process.

Use Node ≥22.22.2 with `node:sqlite`, a persistent local disk and a dedicated service account. Copy `collector/`, `dist/idl.js`, `dist/tracker.js`, `dist/openapi.json` and the parent `package.json` with the same relative layout; `tools/pack-collector.mjs` creates this artifact from the reviewed tree. Install its pinned dependencies with `npm ci --omit=dev --ignore-scripts` inside `collector/`.

Create the local identity and print only its public principal:

```sh
CRUMBS_DATA_DIR=/var/lib/crumbs node collector/server.mjs --principal
```

As the Crumbs controller, call `configureCollectors` with this principal through your existing authorized operator identity. This replaces the allowlist; include any other intended collectors (maximum ten). Example Candid argument: `(vec { principal "COLLECTOR_PRINCIPAL" })`. This is the only lane permitted to call `ingestBatch` and `collectorSites`. Never give the browser this identity or a report key.

Start with:

```sh
CRUMBS_DATA_DIR=/var/lib/crumbs \
CRUMBS_CANISTER_ID=CRUMBS_BACKEND_ID \
CRUMBS_IC_HOST=https://YOUR_VERIFIED_ENGINE_GATEWAY \
CRUMBS_TRUSTED_PROXIES=127.0.0.1 \
node collector/server.mjs
```

The default bind is `127.0.0.1:8788`; `HOST`/`PORT` override it. The default agent gateway, if omitted, is `https://icp-api.io`. For an isolated local Engine/PocketIC test or a private engine with a different root of trust, set `CRUMBS_ROOT_KEY_FILE` to its independently verified DER-encoded BLS root key (133 bytes, not the raw 96-byte key). The collector never blindly fetches/trusts a remote root key. The dashboard currently follows the suite's ICP gateway configuration; custom standalone networks also require the suite's frontend agent configuration to be adapted and tested.

A reverse proxy terminates HTTPS and must **overwrite**, never append, `X-Crumbs-Client-IP` from its authenticated connection peer. For Nginx on the same host:

```nginx
location / {
    access_log off;
    proxy_pass http://127.0.0.1:8788;
    proxy_set_header X-Crumbs-Client-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For "";
    client_max_body_size 48k;
}
```

Restrict direct access to the collector's socket, use your normal TLS configuration, and keep request bodies/Authorization/IP values out of error logs and tracing. If another load balancer precedes Nginx, correctly authenticate that proxy chain before enabling real-IP rewriting. Ordinary forwarded headers are ignored by Crumbs. An incorrect chain collapses distinct visitors or enables spoofing.

Use your normal service manager with automatic restart, working directory set to the artifact directory, data directory owned by the service account, `UMask=0077`, and no sensitive environment logging. Preserve `identity.json` during updates. The identity, database, WAL and SHM are secrets/operational state; do not place them in git, public assets, or long-lived unfiltered backups. Multiple collectors for one site need a shared coordinated daily salt and deduplication strategy, which this release does not implement; use one collector per site.

Optionally point `CRUMBS_GEO_DB` at a licensed local MaxMind-compatible database. Without it, location dimensions are empty. Database updates are operator-managed; there is no runtime third-party IP lookup.

## Install tracker and use the API

Use Copy script under Settings → Tracking script. In native mode the frontend serves the script and `data-endpoint` selects the backend API. The optional Node collector can also serve `/tracker.js`. Set optional `data-outbound`, `data-downloads`, `data-forms` and `data-hash` explicitly. For required consent, define `window.crumbsConsentRequired = true` before loading the script; grant with `window.crumbsConsentGranted = true; window.crumbs.resume()`, withdraw with `window.crumbsConsentGranted = false; window.crumbs.pause()`. Add the script origin to the site's CSP `script-src` and the collection API origin to `connect-src`. GPC/DNT remain honored even after resume.

Call `crumbs('Signup', {props:{plan:'team'}})` for an allowed custom event. Do not mix report keys into public snippets. A website can choose its own event names; events are not proof of a sale or a human visitor. Public collector requests are limited to 300 events per IP/minute; tune/design this with your expected shared-network audience before rollout.

API & exports creates read/manage/share credentials (1–365 days). Website Managers/Admins can create credentials for their own websites. Every read/manage/share key remains bound to the issuing person's current website management rights and a fresh directory lease. Demotion or removal deletes that person's website keys; shared dashboards fail closed during a Hub outage. Revoke by key ID. HTTP API details are served by the dashboard at `/openapi.json`; dashboard `/api.html` explains scopes, request bodies and responses. Unit responses are JSON null; Candid integers are decimal strings.

## Historical migration

Export and extract Plausible CSVs locally. Keep an immutable private source copy according to your retention policy. Confirm the source timezone is UTC. First validate without transmitting:

```sh
node crumbs/tools/import-plausible.mjs --dir /private/export --site example --timezone UTC
```

Then supply `CRUMBS_URL` and `CRUMBS_API_TOKEN` (manage scope) using your secret manager and repeat with `--send`. Ten documented native export tables are supported. IDs derive from site/table/day/compound dimensions, so retrying is idempotent and conflicting overlapping exports fail. Rows outside site retention are refused; choose retention before migration. There is no ZIP extraction, silent timezone conversion or blind summing across dimensions. Historical statistics appear under History, separate from native traffic. Re-importing a partially completed run is safe. Automatic aggregate rollback is not implemented; delete a disposable pilot site to reset it.

## Operate and recover

For native mode, monitor `/healthz`, authenticated `/api/v1/health` and `/api/v1/collector-health`. Native collector health reports `mode: "canister"`, zero pending records, the last successful native acceptance, and backend validation rejections. HTTP parsing/normalization rejections are not included in that rejection counter. Monitor acknowledgment failures at the website/integration too. Accepted events are already durable; no worker drain is needed. After stop/start or a populated upgrade, verify health, duplicate handling, reports and Hub access. Alerting infrastructure is operator-supplied.

The following additional queue/host procedures apply only to optional Node mode:

- Keep the host clock synchronized. Backend operations have a shared 15-second deadline across signing, agent retries and polling; timeouts retain pending events for retry. Monitor public `/healthz`, authenticated `/api/v1/collector-health` and backend health. A successful HTTP 202 means normalized data is durable in the **collector**, not yet in the canister. The worker drains every two seconds and remains pending on auth/capacity/transport failures. Permanent invalid records are isolated so good records continue.
- Alert on increasing pending count, oldest pending age, rejected count, no recent successful delivery, low disk space, storage charge and report capacity errors. `/collector-health` exposes counts, oldest pending timestamp and last delivery. Rejected receipts are kept 24 hours. No outbound alert service is shipped.
- The browser queues in memory with retry/beacon: blockers, offline close and memory exhaustion can lose events before acknowledgment. Retry stable IDs across transport failures. Queue deduplication keeps the originally normalized record. Backend deduplication lasts as long as the corresponding retained event; do not replay deleted historical traffic as new events.
- Stop/start the collector without deleting its directory to recover pending work. Never start two processes on independently copied state for the same site. If an outage exceeds seven days, pending events become too old for native ingestion; inspect rejected records and record the missing interval.
- Lowering retention hides expired rows immediately; physical cleanup is incremental. Include collector receipts, logs, snapshots and restored copies in the deletion policy. Read PRIVACY.md before claiming anonymization or consent exemption.
- Back up the collector signing identity separately with restricted access. A live SQLite queue backup must use SQLite's backup facilities or a stopped process, not a casual copy of only the `.sqlite` file. Queue/salt copies require short expiry. After any recovery verify configuration, pending counts, signed delivery and stored totals.
- Upgrade the collector from a matching tested artifact, `npm ci` its lockfile, retain its data directory, then restart and verify health. Upgrade the canisters using the published Kitchen artifact and run `release.mjs verify`; do not restamp Wasm or bypass the catalogue.

## Business reporting setup (0.6.0)

Start at Overview, then use Acquisition for channel/AI/campaign questions and Goals & revenue for conversions. Add a page, named event or scroll goal in the form; common download, outbound and form-submission goals prefill it for review. A form submit attempt does not prove successful processing: instrument a named success event for a real conversion. Save frequently used filters or a 2–10-step funnel; colleagues with website Read access can reuse it. All websites shows only sites the current Hub identity may read.

Use Settings → Search Console for the guided setup. Create your organisation's Google web OAuth client with the exact Crumbs frontend HTTPS origin, enable Search Console API, configure Google's audience/test users and verify the selected property. This is not a secret client key. Acquisition → Connect Google & refresh loads the SDK, then Continue with Google opens account selection; no background refresh token is stored. Choose a reporting period of at most 366 days within Google's available history and your site's retention. Search-term collection is optional. Live Google authorization requires a real operator-owned client; local tests use isolated API fixtures.

API & exports links the downloadable [Data Studio connector and integration guide](dist/integrations.html). Deploy it in your own Apps Script project, replace publisher/policy details, fix `CRUMBS_API_ORIGIN` and its manifest `urlFetchWhitelist`, then provide an expiring website Read key through Google's credential prompt. Every viewer uses their own credential. It is not an installed or Google-approved marketplace connector. Test with your actual Google account before relying on it.

For optional Node datacenter filtering, set `CRUMBS_NETWORK_DB=/private/GeoIP2-Anonymous-IP.mmdb` (or the Anonymous Plus database). Obtain/license and update the database separately, use restrictive file permissions, replace it atomically and restart the collector to load the update. A missing or wrong database fails startup. No database or license is bundled. Classification uses `is_hosting_provider` from the [provider's schema](https://dev.maxmind.com/geoip/docs/databases/anonymous-ip/); it can exclude real people behind hosting-based proxies. Do not enable it merely to suppress unexplained visits. Native mode uses UA/referrer heuristics only.

The tracker’s `window.crumbs?.status()` explains `privacy-signal`, `consent-required`, `paused` or `ready` plus delivery state. `accepted` confirms the collection endpoint acknowledged delivery; `ignored` means exclusion, `rejected` a permanent request error, and rate/network/server errors retain the bounded memory queue for retry. A blocker may stop the script itself, leaving `crumbs` undefined. Never bypass a visitor's privacy setting to increase counts.

Upgrade 0.5.x with the new versioned migration; it copies existing goals into the widened goal type while preserving events, keys, website grants and native collection state. Generate bindings from compiled source. Run populated baseline upgrades and the packaged-executable tests before an authorized Kitchen rollout. The optional collector artifact must include `collector/network.mjs` as well as matching generated IDL and tracker.
