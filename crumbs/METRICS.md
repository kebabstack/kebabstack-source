# Metric contract, version 1

All event times and API ranges are integer Unix seconds. `from` is inclusive, `until` exclusive. Site configuration and daily/hourly buckets currently require UTC. Native reports span at most 1827 days and scan at most 100,000 retained events, including same-day session context before `from`. Larger scans return a capacity error, never sampled totals. List limits truncate breakdown rows only, explicitly indicated by `truncated`.

| Metric | Definition |
|---|---|
| Visitors | Distinct site-specific, daily rotating estimates in the selected events. Summing multiple days counts the same person on multiple days. NAT, changing IP/UA and privacy blocking affect accuracy. |
| Visits | Sessions with a qualifying pageview or custom event, ending after 30 minutes without either. IDs rotate at UTC midnight; visits do not cross midnight. |
| Pageviews / events | Accepted pageview / custom-event records after deduplication. Engagement records increment neither. |
| Bounces | Visits with at most one pageview and no interactive custom event. A custom-only noninteractive visit can be a bounce. |
| Bounce rate | `100 * bounces / visits`, zero if no visits. |
| Duration | Sum of last minus first pageview/custom-event timestamp per qualifying session. Single-event sessions have zero duration. Divide by visits for the mean. Sessions are reconstructed through the report end, without future lookahead. |
| Engagement | Active visible-page milliseconds reported by the tracker. Engagement does not start or extend a session. |
| Scroll | Maximum observed depth per visit/path. Mean depth = scrollDepthSum / scrollSamples. Only pages with engagement measurements contribute. |
| Revenue | Sum of integer minor units grouped by currency. No FX conversion or guessed decimal multiplier; caller supplies currency-specific minor units. |
| Realtime | Distinct daily estimates with a pageview in the preceding five minutes, not a presence connection. |
| Conversions | Distinct estimates meeting the goal filter; rate uses all qualifying visitors as denominator. |
| Funnels | Ordered steps within a session; each step counts distinct daily estimates reaching that stage. Each event advances at most one step. |
| Journeys | Counts of observed pageview transitions per session, plus entry/exit markers. Filtered paths form the displayed sequence. |

Filters combine dimensions with AND, values within one dimension with OR; `exclude` negates the dimension match. Events are ordered by timestamp and backend-assigned native order (or signed collector insertion order), then ID. Site/source/medium/campaign/content/term acquisition comes from the first session event; subsequent SPA pageviews retain it. Entry/exit filters use the session's first/last pageview in loaded context. Other dimensions apply to each event. Filtered bounce and duration describe the full reconstructed qualifying session, not a made-up sub-session.

Page/source/device breakdown visitors are not additive: a visitor can appear in several rows. Properties must be allowlisted per site; use `prop:NAME` through the API. The simple browser/OS parser groups coarse families, not exact Plausible UA classifications. Referrer sources use hostnames (for example `www.google.com`), not Plausible's curated marketing labels.

Imported CSV rows retain the source's dimension grouping and integer counts. Missing source metrics are represented by zero in the transport model but are **unavailable**, not measured zeros. `import:visitors` is the only complete daily visitor total; never sum visitors across pages, custom-event properties, source groups or browser versions to manufacture a total. History does not support reconstructed sessions, funnels, arbitrary intersections or automatic merging with native traffic. Importer accepts UTC exports only; choose non-overlapping source periods.

Native ingress timestamps the first successful receipt, not a browser-provided clock. Same-ID retries retain their original time/order/visitor, including after midnight, while retained and within the seven-day ingestion window. Native location fields are empty; only the optional Node collector supplies locally derived GeoIP. Daily secrets differ between modes; use one mode per website, and record a mode switch as a measurement boundary.

## Acquisition, goals and combined reports (0.6.0)

- Channels and AI assistants use the first recorded event of each 30-minute visit. Explicit campaign medium labels take precedence over recognized referral hosts. Host matching requires an exact hostname or subdomain boundary. Missing referrers remain unknown; AI referrals measure clicks from recognized assistants, not crawler activity or all AI influence. UTM labels are sender-controlled inputs.
- Page and event goal completions count matching records. Scroll goals require a matching page and an engagement record at or above 1–100%; at most one completion per visit per goal. A visitor can complete an event goal repeatedly; conversion rate uses distinct daily visitor estimates divided by the report's daily visitor estimates, not completion count. Engagement is sent every 30 visible seconds and at page lifecycle boundaries, best effort.
- Revenue is attached to recorded events in minor currency units. Acquisition attribution is visit-first; currencies are never converted or summed together. Revenue tables have up to 1,000 traffic-ranked groups and state when low-volume groups may be omitted; totals cover the entire valid query. This is not an accounting ledger, refund system or proof of payment. Send once after confirmed success with a stable, non-personal event ID for delivery retries.
- All websites sums each permitted site's report. Visitor counts are website/day estimates, not unique people across websites or days. A failed site is identified; partial totals are labelled. Site-specific filters are intentionally absent in the combined view.
- Realtime uses a rolling 30-minute window with UTC minute buckets; the separate active indicator covers five minutes. Auto-refresh is 30 seconds while the page is active, with draft preservation. Normal reports use UTC hours/days. Missing buckets mean no recorded events, not confirmed uptime of collection.
- Saved filters and funnels store configuration, not metric snapshots. They are shared with the website's readers and managed by website managers/admins, capped at 100/site, 2,000/deployment and 8,192 filter-value characters per saved item.
- Search Console stores the latest explicitly refreshed report. Google uses Pacific Time, finalized data, privacy omissions and top-row limits. Its clicks are not Crumbs visitors. The saved snapshot states its own dates, ignores Crumbs filters and records refresh time. Totals are queried separately, never reconstructed by summing incomplete search terms.
- Retention can be configured up to 1,827 days (roughly five years), still subject to event/storage/report bounds. Raising retention neither restores deleted data nor provides rollups or five-year capacity at arbitrary traffic volume. Default remains 365 days.
