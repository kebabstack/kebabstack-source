# Crumbs chart inspection and compact breakdowns — 2026-10-20

Scope: Crumbs 0.11.2; no shared runtime, collection, storage, API or authorization changes. Backend change is the served version only. Based on deployed 0.11.1, retaining native geo/network enrichment and Matomo support.

## User workflows

- Inspect an exact selected metric/date by pointer movement, tap or keyboard; show the previous-period value beside it. Keep the accessible chart-data table and missing-bucket zero convention.
- Read ten rows per overview breakdown, scroll to later rows and click any row to filter. Preserve all loaded results and unchanged API/export totals.

## Evidence

Local synthetic preview with 35 rows per dimension: desktop 1280px and phone 390px; five lists each 440px viewport, 1540px content and 44px rows. Keyboard End scrolls the list to 1100px; row 35 remains clickable and adds the correct Page filter. Real pointer movement across the SVG changes the date/value readout. Chart End/Home navigation and metric changes verified. Sticky global navigation remains visible during actual scrolling; no page horizontal overflow at 390px. Light/dark themes inspected.

Unit regressions cover exact metric values, missing-bucket zero, previous values, keyboard boundaries, single bucket, escaped labels and retained last-row filters. Full suite and packaged upgrade evidence are recorded privately with release hashes; this document is not a claim of production deployment.

## Integration and limits

README, INSTALL, source/served changelog and module version updated together. Candid, SDK, collector and API schema unchanged. Other modules retain independent versions. Public source export must include this release; website/release reconciliation is tracked separately. Full iOS/Safari, screen-reader and 200% text certification remains open. Existing small SVG axis text on phones is not certified by this scoped change; the readable tooltip and data table remain available.
