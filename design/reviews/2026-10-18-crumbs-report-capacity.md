# Crumbs report capacity and measurement documentation

- Standard: 1.2.0; module: Crumbs 0.9.1.
- Date/reviewer: 2026-10-18 / Codex.
- Scope: Acquisition/report failure, installation help, cookie/cookieless comparison, REST export contract.
- Status: verified within the evidence below; local candidate, not deployed.
- Roles: admin, manager, viewer, unauthorized; synthetic local data.
- Relevant rules: NAVIGATION-06 and scoped shared layout/help/error conventions.

## Findings and acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary report task | Pass | Prior build exceeds five billion instructions at 50,000 events. Candidate returns exact 50,000 views, 1,000 visitors and visits; path/channel/AI-source/campaign with acquisition filtering pass. Previous 5,000-event regression was insufficient. |
| Data integrity | Pass | Compact query-local visitor ordinals preserve identity across visits. Acquisition dimensions and filters reuse session-level values. No sampled totals or persisted-state change. Existing attribution, midnight, currency, goals, permissions and duplicate tests pass. |
| Error/stale state | Pass | Raw agent/request dumps replaced with short messages. UI smoke confirms failed reports clear totals; error regression excludes serialized credential text. |
| API coverage | Pass within scope | Native REST groups/filters both tracking modes; normalized six-event export matches required OpenAPI fields and excludes raw cookie IDs. Existing resource/permission tests pass. Candid-only saved reports, goal attribution rows and SEO explicitly documented. |
| Help and completion | Pass | Tracking script exposes comparison, consent setup and API links. Desktop table becomes labelled per-capability blocks on phones. |
| Layout | Pass within scope | Real browser at 1280×800 and 320×680; 320px document width without horizontal page overflow. Comparison mobile table was too cramped and corrected. |
| Sticky navigation | Pass within scope | Keyboard scrolling Tracking script at 320×560, scrollY 787; global menu stays at top 8px. Shared runtime unchanged. |
| Accessibility / themes | Partial | Semantic headings, links, row headers and labelled mobile values. Full screen-reader/zoom/theme matrix not rerun for this narrow change; no certification claim. |
| Build / upgrade | Pass | Pinned Mops check/build; committed stable signature compatibility; actual published 0.9.0 populated upgrade preserves metrics, access and keys. |
| Tests | Pass | 30 unit tests; 5 role/empty UI smokes; 21 backend tests plus actual prior-release upgrade separately. Historical optional 0.1.0 baseline remains skipped. Shared design/runtime/brand guards pass. |

## Delivery and limits

No production deployment or tracking-mode switch performed. This fix reduces query work, but the platform instruction ceiling and 100,000-event scan boundary remain. Higher cardinality, complex filters and production workload require their own validation. Browser identity is an estimate, not people counting. Cookie mode adds cross-day browser recognition, not GeoIP, personal identity, heatmaps or replay. Before/after operator task time was not measured. Local preview uses fictional data. Release executable checks are recorded in the private release receipt after packaging.
