# Crumbs collection, consent and dashboard review

- Standard: 1.2.0; module: Crumbs 0.9.0.
- Date/reviewer: 2026-10-18 / Codex.
- Scope: website installation, visitor choice, tracker delivery, native/optional Node ingestion, reporting and responsive dashboard.
- Status: verified within the evidence below; not full accessibility certification or production traffic validation.
- Roles: administrator, manager, viewer and unauthorized actors; synthetic local websites only.
- Baseline: 0.8.0 published executable and committed stable signature. No user production data modified.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task / completion | Pass | Installation offers default cookieless, gated cookieless and gated cookie modes; explains website embed must be replaced. |
| Permissions | Pass | PocketIC suite covers named site access, scoped keys, Hub revocation, sharing and manager restrictions. |
| Loading / empty / partial / failure | Pass within scope | UI smokes include admin/viewer empty state; failed previous-period requests no longer hide current data and display a retry notice. |
| Retry / interruption / concurrency | Pass | Twelve concurrent copies count once; HTTP query handshake never counts; invalid receipts retain events; bounded queue, UTF-8 size, retry backoff and withdrawal tests. |
| Input validation / atomicity | Pass | Malformed cookie identity/consent rejected; conflicting IDs rejected; Node capacity checks whole batch before storing any prefix. |
| Counts / reports | Pass within scope | 5,000-event exact-count fixture; shared-IP cookie separation, IP/day changes, UTC session boundaries, trackingMode breakdown; existing goals/currency/SEO/report tests. Human visitor truth and production ingress not measured. |
| Canonical runtime / logos | Pass | runtime sync/check, design guard and brand guard; no changed shared runtime. |
| Layout / reflow | Pass within scope | Browser overview and tracking setup at 320 px, overview at 800×600 and 1280×800; tracking select overflow fixed from 331 to 320 px. |
| Sticky navigation NAVIGATION-06 | Pass within scope | Real browser scrolling: 320 px/scrollY 1480 retains menu link top 8 px; 800 px/scrollY 600 retains top 12.5 px; desktop long page also remains visible. |
| Themes / accessibility | Partial | Light desktop/mobile, dark mobile, native form semantics, consent focus/reopen checked; full screen reader, 200% text enlargement, long-label matrix and all workflows not certified. Reduced motion stops waiting animation. |
| Privacy / withdrawal | Pass within scope | No default tracker storage. Cookie mode sends nothing before affirmative consent. Revoke clears ID/pending queue; GPC/DNT respected. Reject and allow equally prominent, preferences always available. Browser reload remembers choice. Already committed events are not retroactively deleted. |
| Time / identity | Pass within scope | Cookieless visitor IDs rotate daily; cookie browser IDs stable across days; both split visits at UTC midnight. Sessions are estimates, not identified people. |
| Help / docs | Pass | Served consent guide, CMP integration, privacy disclosure, metric definitions, generated API and changelog updated. |
| Upgrade | Pass | Committed stable baseline compatible; actual published 0.8.0 upgraded with populated reports, grants and keys in PocketIC. |

## Findings and fixes

| Priority | Finding | Resolution |
|---|---|---|
| P1 | Repeat consent callbacks reset pageview state and inflate counts. | Resume/grant idempotent for the current route. |
| P1 | Different routes redacted to identical stored paths suppress real navigations. | In-memory route identity separate from sanitized transport path. |
| P1 | Successful HTTP without a valid durable receipt can silently lose queued events. | Validate receipt type and exact event accounting; retain stable IDs for retry. |
| P1 | Node capacity errors could store a batch prefix. | Atomic preflight and transaction. |
| P1 | Node same-ID conflicting payload could silently look successful. | Normalized conflict validation, including conflicts inside one batch. |
| P2 | Missing backoff and byte bounds worsen delivery under errors. | Bounded UTF-8 batches, backoff/Retry-After and diagnostic dropped counts. |
| P2 | Collection setup overflows at 320 px. | Shrinkable grid/select; verified 320 px document width. |
| P2 | Empty denominator displays misleading zero bounce/duration. | Show unavailable dash; explain estimates and measurement limits. |

## Delivery and limits

Local implementation and tests only. No production deployment or cookie activation authorized/performed. Default websites remain cookieless. The cookie option adds browser recognition, not location, account identity, session replay or heatmaps. Public ingestion cannot establish that an event came from a human; blockers, page closure, offline failures and rejection can reduce recorded counts. Cookieless shared-IP/UA and daily rotation affect unique visitors, not the exactly-once storage of accepted pageviews. Cookie consent flags are input, not legal proof of consent. The bundled choice UI is not a consent audit ledger.

Private rendered evidence: release-crumbs-0.9.0/evidence under the operator's release-tools directory. UI sample numbers are fictitious. No measured before/after operator task-time claim.

## Final release verification

Format-2 candidate built from source a148e10; release ID `8dab2bcf87c6c8c1cda034d0ef922715bafca6e7a9d03baf21de0ca9782c200f`. The actual stamped Crumbs and Hub executables pass 21 backend/security/upgrade tests, plus a separate short-interval UTC-midnight cookie-session regression. The optional historical 0.1.0 baseline test is skipped; the actual published 0.8.0 populated upgrade is executed and passes. Tracker/collector/rendering unit suite: 29 passes; UI role/empty smokes: 5 passes; design guard: 13 passes; runtime/brand/stable checks pass. No failures.

A locally assembled publication catalogue preserves all ten non-Crumbs release records byte-for-byte and passes the shared executor's checksum/compression/placeholder validation (747 files). Nothing was published or deployed. Package-manifest and metric-documentation follow-up changes do not change packaged backend/frontend source inputs. Short-screen consent keyboard navigation was additionally verified at 320×560: Tab reaches and reveals Allow; reject/reopen/choice persistence work.
