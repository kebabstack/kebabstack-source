# Crumbs report performance

Scope: authenticated overview and read-only shared reports. Keep the canonical layout and controls. Bundle current dimensions in one authorized snapshot and previous-period dimensions separately; no retained result cache or data-model migration. Long charts over 900 days preserve the existing path.

Consumers: browser overview/shared report and generated Candid IDL. Existing REST/SDK/MCP individual-report interfaces unchanged. Optional collector packages current generated IDL/client independently.

Verification: exact multi-dimension comparisons at 100,000 events/50,000 recurring cookie browsers; filters, timezone boundaries, top-row limits, new ingestion, share revocation, malformed bundles and populated 0.12.0 upgrade. UI role/empty smokes pass, including delayed bundle revocation. Local Chrome synthetic fallback preview: 30-day selection, Page filter, chart metric change and keyboard point inspection on desktop and 390×844 passed. Screenshots retained privately. Final packaged and full-suite results are recorded in the private release receipt. Safari/iOS, screenreader and 200% text not claimed.

Performance numbers must identify their environment; a local PocketIC timing is not a production SLA. Existing finite storage/instruction/response bounds remain.

A bundle is capped at 200,000 event × dimension units; the client splits dimensions and returns no partial bundle. Each split is a fresh authorization/snapshot. No visual layout change, shared runtime change or new product claim.
