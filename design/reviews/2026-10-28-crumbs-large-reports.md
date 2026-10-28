# Crumbs full-report review

- Standard: 1.2.0; candidate Crumbs 0.12.0; 2026-10-28.
- Task: read a 30-day website report without manually shortening the range.
- Finding P1: the native query rejects more than 50,000 events, leaving all dashboard panels empty.
- Relevant rules: PURPOSE-01/03/04, DATA correctness, loading/error transparency.
- Scope: report execution and clients; no palette, layout or navigation redesign.

## Evidence

- Local PocketIC: 100,000 events, 50,000 recurring cookie IDs across two UTC days;
  exact range and daily counts, filters, goals, funnels and journeys. Query guard
  remains; authorized atomic update methods calculate the complete retained range.
- Browser: synthetic capacity fallback, 30-day selector, populated Overview,
  Acquisition and Journeys; actual scrolling. No production analytics were used.
- Client regressions: no fallback on forbidden/invalid/network errors, expensive
  fallbacks serialized, no update replay; same arguments and credentials retained.
- Existing role smokes: admin, manager, viewer and empty states.
- APIs/IDL generated from compiler; native REST and optional collector reconciled;
  curated MCP fallback version-gated; generic query-only guard unchanged.

## Limits and release gate

The source change is not a live deployment. Final packaged upgrade and suite results
are recorded in the private release receipt. Real production 30-day figures must be
verified after an explicitly authorized deployment. Screen reader, Safari/iOS,
320px and 200% text testing were not repeated for this execution-only change. The
browser fixture demonstrates UI recovery, not canister load performance. Storage
and instruction limits remain finite; no unlimited-capacity claim is made.
