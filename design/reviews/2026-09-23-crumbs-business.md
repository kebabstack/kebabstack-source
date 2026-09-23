# Crumbs business reporting design review

- Standard: 1.1.2. Crumbs 0.6.0 and website 0.4.0, 2026-09-23.
- Status: functional checks locally verified; external integrations pending operator acceptance. **Visual composition approval withdrawn after user feedback on the oversized context card.** See [the correction](2026-09-23-crumbs-workspace.md). Token/reflow checks did not justify the earlier layout verdict.
- Primary tasks: understand acquisition, define a conversion, reuse a report, compare websites and connect optional SEO/reporting tools.
- Before: repeated filter setup; scroll conversions, revenue attribution and cross-site totals were not directly available. No task-time reduction has been measured.
- After: explicit Acquisition / Goals & revenue / All websites paths, reusable filters/funnels, contextual setup guides and local collection diagnostics.

| Gate | Evidence / result |
|---|---|
| Canonical identity and components | Logo/runtime/SDK checks pass; existing shared tokens and persistent topbar preserved |
| Reports and audience | Real backend positive/negative site grants; combined reports identify partial failures and never deduplicate people across sites |
| Workflow | UI smokes exercise scroll goals, filters/funnels, source selection, Google configuration, error and empty states |
| Safe edits | Revision-checked saved reports/config; unsaved Google/filter drafts; refresh skips drafts; captured site/epoch discards stale reads |
| Navigation / NAVIGATION-06 | Browser scroll at 706.5px: global bar top 0; 390px and 320px document width equal viewport. Tables scroll within their containers |
| Light/dark and desktop/mobile | Browser inspected Acquisition and Goals & revenue; website Crumbs demo inspected at desktop and 390px. Temporary viewport reset after review |
| Keyboard / accessibility | Named controls, semantic tables, chart data alternative, visible focus and existing dialog handling. Full screen-reader and 200% text-zoom audit not completed |
| Currency/time/freshness | Currencies separate, UTC native buckets, rolling realtime, own-date/Pacific-Time Google snapshot and latest refresh shown |
| Privacy | Optional search terms default off; tokens in memory; fixed connector API origin; explicit retention and collection-blocker explanations |
| Product copy | Website labels all samples, preserves alpha boundaries and names optional Google setup. No savings, GDPR certification or unsupported residency claims |
| Deployment | Local candidate only; full production/Google acceptance is separate |

See `crumbs/TESTING-0.6.0.md` and `crumbs/PARITY.md` for reproducible checks and remaining workload gates. Existing SSO, Hub directory and Lunch were not changed.
