# Crumbs changelog

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
