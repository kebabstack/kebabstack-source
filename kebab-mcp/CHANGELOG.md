# Changelog — kebab-mcp

## [0.3.0] — 2026-09-23

- Recheck Hub authorization and menu membership before app calls, including cached sessions. Fail closed on Hub errors, isolate caches by Hub/tile/backend and reject ambiguous or partial app names. Coalesce concurrent sign-ins and refresh live interfaces.
- Add `kebab_query`, which enforces query-only execution, and searchable/paginated method discovery. Mark backend error responses as MCP errors. Never replay an update automatically.
- Validate integer precision/ranges, booleans, required and extra record fields, tuple lengths and blob bytes. Preserve large numbers as decimal strings instead of mistaking IDs or amounts for timestamps. Bound recursive input/interface parsing.
- Add Desk customer projects, ticket/person/offboarding context, on-call response and HR/Finance reporting; Asset sales progress; due Contracts; Forms metadata; and Crumbs site/report tools. Use the apps' existing project and record permissions. Verify signatures against current interfaces.
- Add Hub-side self-disconnection (Hub 0.33.0+), atomic private credential storage and explicit local-only cleanup. Document separate app-session revocation limits and AI-provider data flows.
- Publish a branded Hub setup guide using the actual GitHub source installation. Require Node 22.22.2+ and include installation/changelog in package contents.

## [0.2.1] — 2026-09-23

- Document the supported installation from the public GitHub source and configure clients with the local Node entry point. Remove instructions to fetch an unpublished npm package. Assistant permissions and behavior are unchanged.
- Align package, lockfile and server versions.

## [0.2.0] — 2026-09-06

Security release from the full audit (`KEBABSTACK-AUDIT-2026-09-06.md`). Works with hub ≥ 0.19 (0.18 tokens were retired there; reconnect once).

### Fixed — security
- **No more remote code.** An app's interface was fetched as JavaScript from the app's frontend URL and executed inside this process — whoever controlled a frontend or a menu URL could run code on every connected person's computer (MC-01). The interface is now PARSED (`lib/did-parse.mjs`) from the backend's own `candid:service` metadata read through the IC API; nothing from the network is executed.
- `kebab_call` is marked destructive (it reaches delete/remove/archive methods), so clients ask first (MC-04).

### Fixed — bugs
- **Updates are never repeated.** The old retry treated any empty answer after 60 s as a lost session and re-ran the call — an update could be sent twice. Now only queries are retried, and only after the app's `whoami`/`me` confirmed the session is gone (MC-02).
- **`opt` results are unwrapped** (`null` or the value) — `kebab_ticket` said `[]` instead of "no such ticket" (MC-03).
- Nanosecond timestamps come out as ISO times.
- The start-up guard also works on Windows paths and the `.cmd` shim (MC-05).

### Tests
- The parser is checked against every committed `backend.did` of the suite, method by method against the generated bindings.

## [0.1.0] — 2026-09-06

First release. A stdio MCP server that connects a chat assistant to the hub's assistant lane (hub ≥ 0.18):

- `connect <code>` exchanges the one-time code from the hub menu for a personal 30-day token (`~/.kebab-mcp/config.json`, 0600); `status`, `disconnect`.
- Generic tools `kebab_connect`, `kebab_whoami`, `kebab_apps`, `kebab_describe` (live Candid with documentation), `kebab_call` (any method, JSON → Candid, the person's app session prepended).
- Curated tools for the bundled apps: people, my tickets, queue, one ticket, catalog, new request, comment, devices, my devices' health, domains.
- One app session per app via hub ticket → `loginWithTicket`, reused ≈ 9 h, re-login on a dropped session; read tools marked `readOnlyHint`.
- Tests: JSON↔Candid coercion and an in-memory MCP round trip against fake hub/app canisters (no network).
