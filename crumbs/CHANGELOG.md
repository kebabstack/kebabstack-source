# Crumbs changelog

## [0.11.2] - 2026-10-20

- Traffic over time now shows the exact bucket date and selected metric on hover or tap, including the comparison value. Arrow keys, Home and End inspect the chart without a mouse.
- Pages, sources, countries, devices and detail breakdowns show up to ten rows before scrolling. All loaded rows remain available and clickable as report filters; totals, exports and APIs are unchanged.


## [0.11.1] — 2026-10-19

- Batch operator uploads of up to 16,384 IP ranges while retaining bounded 1,024-range lookup chunks, full validation before mutation and atomic activation. Reduces setup round trips without a runtime server or state/API schema change.
- Correct the empty location report guidance: native location data applies to new visits after dataset activation.

## [0.11.0] — 2026-10-19

- Bound native report scans to 50,000 events: the previous 100,000-event bound can exceed the query instruction limit. Larger ranges return an actionable capacity error without sampling; event export and historical aggregate storage limits are unchanged.

- Add native local IP range lookup with staged, controller-authorized dataset activation, provenance and expiration. No runtime IP lookup service or Node process is required. Operators prepare/update separately licensed public datasets.
- Add screen size, network/ASN and hosting/automation-signal report dimensions for cookie and cookieless collection. Unknown does not mean human; existing UA exclusions remain.
- Add read-only Matomo archive export and idempotent historical aggregate import preserving original dates, timezone and missing-metric information. History remains separate from native reports.
- Migrate existing events with unknown traffic context; preserve website access, keys, collection identities and report definitions.


## [0.10.0] — 2026-10-18

- Adopt shared opt-in table controls (loaded-row search, accessible sorting, column visibility and reset), form validation feedback and searchable long native selections. Preserve application-owned filtering, exports, permissions and editable grids.

## [0.9.1] — 2026-10-18

- Reduce report instruction cost: deduplicate compact visitor keys once per contributing visit/group and calculate acquisition dimensions/filters once per session. Preserve exact totals, attribution and existing visitor/session boundaries.
- Replace raw replica/request dumps with short actionable errors; failed reports do not show stale totals.
- Link a cookie/cookieless capability comparison and API examples directly from Tracking script settings. Explain consent, browser recognition, missing geography and unimplemented features.
- Correct the normalized event export OpenAPI schema and TypeScript cookie input/export declarations. Document tracking-mode filters, date buckets and REST versus Candid-only coverage.

## [0.9.0] — 2026-10-18

- Optional consent-gated first-party cookie IDs (fixed maximum 90 days) alongside unchanged cookieless defaults. Equal Allow/Reject panel, persistent preferences/withdrawal, CMP integration guide and generated setup snippets; GPC/DNT remain authoritative.
- Tracking-mode breakdown/filter separates daily cookieless estimates from consented browser IDs. Report guidance distinguishes measured pageviews, visitor estimates, missing data and native geography limits.
- Fix duplicate pageviews from repeated resume/consent callbacks and missed navigations when redaction maps different URLs to the same path. Validate durable receipts before removing queued events, bound request sizes, expose drops and back off on transient failures.
- Optional Node collector honors DNT, rejects conflicting retries and commits batches atomically when its local queue approaches capacity.
- Clarify empty duration/bounce values, keep current reports usable if comparison fails, and improve narrow layout and reduced-motion behavior.

## [0.8.0] — 2026-10-11

- Faster sign-in: the ticket login makes one Hub call and answers; the session token derives from a per-app secret seed instead of a management-canister random call (one consensus round less); the directory is pulled only when the person is unknown or the cache is stale.
- Suite login: opened on the company domain with the Hub's suite cookie (Hub ≥ 0.40.0), Crumbs signs in through `loginWithSuite` without a detour through the Hub page. Sign out in Crumbs clears the cookie; the Hub re-checks the person and their Crumbs access on every redemption. No analytics or permission changes.

## [0.7.0] — 2026-10-10

- Reports open on the last seven days in the website's own time zone: daily buckets follow local midnights, the time zone is editable per website and shown next to the dates, and the last website, period and acquisition goal are remembered per browser. Eight metric cards compare to the previous period; the chart labels its axis, draws the previous period and lists its values.
- Acquisition answers "which source brought the sign-ups": conversions and rate per channel, source, campaign or page for a chosen goal (new `goalRows` query). Quick goals save with one click; goal values suggest existing paths and events; funnels save from the builder and run again from a list. Managers share a read-only report link in one step.
- Settings: adding a website asks only for the domain (name, time zone and retention default), Tracking script shows whether the first pageviews arrive, People & access adds a person with one click and explains ineligible people, API keys warn two weeks before expiry and default their names. History appears only once imports exist; website selection, All websites and Add website live in one picker.
- Entry/exit, direct and unknown values read the same everywhere; countries show flag and name. No collection, authorization or data-model changes; `dayStarts` is optional in report requests and existing API clients keep UTC days.

## [0.6.2] — 2026-09-29

- Synchronize the shared Hub console link: visible for active global Hub Owner/Admin/Helpdesk roles, hidden for ordinary users and app-only roles. Existing app permissions and business records are unchanged. Requires Hub 0.37.1 for the navigation hint.

## [0.6.1] — 2026-09-23

- Move website context into a compact page heading, put Add website in All websites, and show access metadata in Settings. Group saved-filter actions in a keyboard-accessible disclosure. Bound report selectors so reports, rather than administration, lead the page. No analytics or permission changes.

## [0.6.0] — 2026-09-23

- Add Acquisition: campaign channels, recognized AI referrals, complete event/revenue context and safe CSV export. Keep missing sources and first-event attribution explicit.
- Add codeless scroll goals, goal completion/revenue API, source-attributed revenue tables, saved filters/funnels with concurrent-edit checks, and a scoped multi-website overview.
- Add guided on-demand Google Search Console authorization with memory-only tokens, optional search terms and saved aggregate reports; ship an operator-deployed Data Studio connector with fixed endpoint and per-viewer read keys.
- Add rolling realtime chart, metric choice and accessible chart data. Preserve date/filter scopes, draft input, access-revocation handling and shared design tokens.
- Extend configurable retention to 1,827 days while keeping default 365 and existing explicit capacity limits. Migrate existing goals and preserve collection state, grants and credentials.
- Minimize tracker URLs/referrers before transport, expose local collection diagnostics, flush engagement periodically and handle BFCache restores. Honor GPC/DNT and consent throughout.
- Filter a small known referrer-spam list; optionally exclude hosting ranges with a licensed local database in Node mode. Explain the remaining native/geography/datacenter boundaries.
- Update setup, privacy, metric definitions and feature acceptance. Core rollout, Google activation and production workload acceptance remain separate steps.

## [0.5.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes.

## [0.5.0] — 2026-09-22

- Adopt shared typography, controls, themes and navigation across analytics and shared reports. Preserve site scopes, collector behavior and report access.

## [0.4.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.4.1] — 2026-09-19

Handles automatically generated website-ID collisions without blocking distinct domains. Prevents edits and duplicate submissions while a form is saving, and discards pending funnel results when their steps change. Includes the 0.4.0 UX cleanup; Supersedes the initially published 0.4.0 UX package.

## [0.4.0] — 2026-09-19

Simplifies the analytics workspace with role-aware empty states, report-only date controls, quick periods and clear filter names. Website settings are separated into General, Tracking script and People & access. Website IDs are generated from the domain; creation leads directly to the correct installation snippet. Search results no longer duplicate website members.

Replaces goal prompts and funnel syntax with forms and step controls. Adds copy actions for tracking scripts, API keys and private report links; contextual save/error feedback, pending-action protection and confirmation dialogs for destructive actions. API management is shown only to website managers/admins; exports explicitly describe their full retained-data scope. Formats revenue as currency and bounce changes as percentage points, and removes unavailable comparisons from shared reports. Improves small-screen layouts, keyboard labels and light/dark presentation.

No backend state or authorization contract changes. Backend version is updated with the matching frontend and API specification; native collection, website grants and credentials are preserved.

## [0.3.0] — 2026-09-19

Adds native HTTP event collection and the complete REST v1 surface to the backend canister. The verified HTTP query-to-update path commits accepted events before returning 202; no Node host is required. Adds bounded JSON parsing, privacy normalization, daily random HMAC visitor estimates, atomic batches, stable-ID retries across midnight/upgrades and bounded IP/global rate counters. HTTP reports and mutations reuse existing Hub/website/key authorization. Adds a state migration preserving 0.2.0 records, credentials and access grants.

Website settings now generate a frontend-hosted tracker snippet with the native backend API preselected. Documents native versus optional Node durability, gateway header limitations, replicated raw request processing, snapshot retention and missing native GeoIP. Native mode remains an alpha pilot subject to PARITY.md cutover gates.

## [0.2.0] — 2026-09-19

Adds per-website Read/Manage grants to named Hub users, a name/email directory picker and effective role controls. Hub owners/admins and centrally granted Crumbs admins retain automatic full access. New websites are admin-only until shared. Website managers can maintain their own settings, content, members and keys; app-wide creation/deletion and health remain administrative.

Enforces website scope on sessions and every API operation. All API/share keys now depend on their issuer's current management rights and a fresh Hub directory; demotion deletes their keys. Share reports consequently fail closed during Hub outages. Access changes use revision checks, stable person IDs and recorded last-editor/time. Hub rebinding clears website grants.

Adds one state migration. Existing 0.1.0 viewer rules are preserved and explicitly shown as legacy until reviewed; new clients leave the deprecated viewers field empty and use the access API. Includes generated bindings, REST/OpenAPI/typed SDK updates, UI access tests and a populated 0.1.0 upgrade regression. See ACCESS.md for the permission contract. Remains an alpha pilot with the PARITY.md cutover gates.

## [0.1.0] — 2026-09-19

Initial alpha pilot for cookieless website analytics on Cloud Engines. Adds a signed collector lane, durable Node/SQLite collector, privacy normalization and daily pseudonyms; SPA/event/engagement tracking; traffic reports, filters, goals, funnels, journeys, scoped keys, sharing, exports and historical aggregates. Includes a Plausible CSV importer, Candid/REST/OpenAPI/JS API surfaces and an operator-facing metric/privacy/acceptance contract.

Integrates Hub central permissions (Hub 0.30.0, SDK 0.11.0) and Kitchen format-2 packaging. Uses the pinned Motoko/core versions, an initial migration and generated bindings. Includes real local canister authorization/data-integrity/populated-upgrade tests, collector restart tests, a real signed HTTP-to-canister integration test and dashboard/tracker smokes. Collector calls have bounded deadlines and redact internal transport details from public errors. Production cutover, large-volume capacity, arbitrary timezone, Search Console and scheduled reports remain unvalidated or planned as documented in PARITY.md.
