# Contracts: document comparison and extraction audit

- Standard: 1.2.0; Contracts 0.19.0, local candidate, 2026-10-17.
- Scope: list, confirmed terms, original preview, supplementary vendor lookup, extraction input.
- Reviewer: Codex. Status: local implementation and scoped checks complete; packaged release and production verification pending. No production deployment.

## Findings and changes

- Cost-cell `white-space: nowrap` inherited by long discount notes inflated the table and squeezed names. Fixed column sizing, bounded prose, compact type/status beneath names and labelled narrow-screen cards.
- Notes occupied a single cell of the terms grid. Full-width prose now; wide-screen preview beside terms.
- Invoice/receipt branch returned before search and type filters. Filters now compose.
- Originals available only as downloads. Inert PDF canvas/image preview with zoom, page selection, session/stale checks and disposal on navigation/sign-out; uploaded HTML is never embedded.
- Public terms helper only available during intake; saved sources without open vendor proposals could not discover a URL. Available on saved records, uses saved vendor, preserves URL/time and requires review/save, recording the source in the audit reason.
- PDF hyperlink annotations were lost, middle extracted clauses omitted, and native supplementary text capped at 12k. Annotation destinations/page markers now retained; full retained text on text-only path and up to 120k supplementary characters on native path (reduced to preserve HTTP byte budget).
- Real local examples inspected with permission: reseller bundles, invoice quantity vs seats, product-scoped cancellation clauses, and long separate terms documents. Private documents and their contents are not committed. Prompt instructions now explicitly distinguish these cases. This is not a measured live-model accuracy claim.

## Verification scope

- Browser: synthetic long names/discount prose; 1280x800 desktop, 800x700 tablet, 320x740 narrow, light/dark. Desktop list fits available width; page horizontal overflow absent at 320 and 800. PDF zoom doubles canvas width inside its scroll container; two-page navigation works.
- Real scrolling: desktop and narrow page content scrolls while global bar stays at top. Short desktop viewport (1280x500) also verified with actual scrolling.
- Automated: full Contracts frontend role smoke; PDF annotation regression; invoice search regression; preview stale-response, cleanup and active-content exclusion tests. Backend: 31 passed, 4 optional historical-fixture tests skipped; access, evidence, revision, persistence, money and vendor tests; populated published 0.18.1 to candidate upgrade preserving terms/original bytes.
- Not certified: complete screen-reader/keyboard audit, 200% text enlargement, all documents/providers, current live-provider extraction against private examples. Historical optional upgrade fixtures remain separate from the current populated upgrade.
- No shared SDK/runtime modifications; canonical tokens and branding retained. No new permission or automatic confirmation path.

## Operator and decision workflow

Open a record, compare original pages with confirmed terms, review AI changes separately.
When the contract references another terms page, run the public check and verify its applicability
before saving. A current public page cannot establish the version agreed at signing.
An executive receives recorded costs/deadlines with provenance; incomplete terms stay visibly unknown.
No savings or model accuracy guarantee is claimed.
