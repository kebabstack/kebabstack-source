# Plausible replacement acceptance

The target is operational replacement of the Plausible features actually used by a company. Version 0.6.0 establishes a tested core and an evaluation deployment; it is not a claim of full Plausible parity. Current baseline: [Plausible documentation](https://plausible.io/docs), [CSV format](https://plausible.io/docs/csv-import), reviewed September 2026.

| Capability | Crumbs 0.6.0 |
|---|---|
| Pageviews, visitors, visits, bounce, duration, realtime | Implemented; daily/UTC estimates with rolling minute view |
| Pages, sources, UTM campaigns, channels and AI referrals | Implemented; deterministic first-event attribution, recognized hostnames, exact filters |
| Geography | Optional Node GeoIP; native location fields remain empty |
| Scroll depth and codeless goals | Implemented; page, event, 1–100% threshold; per-visit scroll deduplication |
| Downloads, outbound clicks, form events, custom properties | Implemented; allowlisted properties; form submission is an attempt, not confirmed success |
| Revenue / ecommerce attribution | Event revenue UI/API by channel/source/campaign/landing; currencies separate; no order, refund or accounting engine |
| Funnels and journeys | Implemented; saved 2–10-step funnels, exact filters, within-visit semantics |
| Consolidated view, teams, website scopes | Implemented; up to 100 sites; named Hub Read/Manage access; no artificial ten-seat plan limit |
| Five-year retention | Configurable to 1,827 days; default 365; no rollups or unlimited volume guarantee |
| Search Console | Implemented on-demand OAuth + saved aggregate snapshot; requires Google client/property setup and live acceptance test |
| Data Studio connector | Downloadable operator-deployed Apps Script connector; daily aggregates; live Google deployment still required |
| Bot / spam / datacenter filtering | UA heuristic and small explicit spam list; hosting-range filtering requires optional Node + licensed local database; native datacenter classification absent |
| Stats API, export, history | Candid/REST/OpenAPI/JS types; ten Plausible CSV tables; imported history stays separate |
| Saved filters and funnels | Shared site configuration with revision checks; not exported metric snapshots |
| Cookie-free collection | Implemented; privacy signals honored; no persistent visitor IDs; not automatic legal consent exemption |
| Scheduled email reports / spike alerts | Not implemented in this release |
| Arbitrary timezone / returning-person identity | UTC reporting; persistent cross-day identity deliberately absent |
| Large-volume analytics | Capacity errors, no sampling; sharding and aggregate rollups not implemented |
| Matomo heatmaps/replay/tag manager/AB testing | Not implemented; not a claim of full Matomo parity |

## Required before retiring Plausible

1. Record monthly/peak events, number of sites, retention, longest required report, used features and source timezone. Include custom and engagement events, not just pageviews. Match or explicitly accept feature/metric differences.
2. Load a representative synthetic dataset and 2× observed peak ingestion on the actual Engine/ingress. Measure p95 collector acknowledgment, delivery lag, report latency, memory and storage. Target acknowledged-event loss = 0 under restart/retry tests; browser events blocked before acknowledgment remain inherently best effort.
3. Exercise native rate/capacity limits and backend stop/start, network timeout, duplicate delivery, poison events, key revocation, Hub outage, snapshot recovery and a populated packaged upgrade. Check both data and authorization after recovery. In optional Node mode also exercise collector restart, queue saturation and disk-full.
4. Run Plausible and Crumbs in parallel on an authorized test/real site for at least 14 days. Reconcile by day/page/source/event, explain gaps caused by bot filters, blockers, pseudonym boundaries and classification. Choose agreed tolerances before the run; do not select a favorable threshold afterward.
5. Verify the legal basis, site event schema, proxy logs, retention, backups, controller access and actual hosting jurisdictions. Test configured consent withdrawal if required.
6. Approve the identical tested format-2 bundle (and collector artifact when using Node), then retire the old subscription only after the operator signs off. Deployment and real-site collection need explicit authorization.

Current safeguards are not production benchmarks: backend scans ≤100,000 events/report; storage ≤256 MiB logical event charge (2048 bytes plus conservative field charge per event) and ≤2 million events, whichever comes first; imports ≤100,000 rows and ≤5,000/read; optional Node queue ≤100,000 pending events; HTTP ≤48 KiB and ≤50 events/request; native intake ≤300 events/IP/minute and ≤30,000 events total/minute. Normal records hit the byte charge before the count ceiling. These limits deliberately reject excess work rather than falsify totals. Larger target workloads require partitioning/rollups and repeatable capacity evidence before cutover.
