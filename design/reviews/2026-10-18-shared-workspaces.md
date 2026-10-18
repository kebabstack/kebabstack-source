# Shared workspace controls and evidence review

- Standard: 1.1.2; review date: 2026-10-18.
- Candidate: Hub 0.41.0, Assets 0.29.0, Contracts 0.20.0, Desk 0.34.0,
  Forms 0.8.0, Trust 0.12.0, Watch 0.12.0, Crumbs 0.10.0.
- Scope: opted-in operational tables/forms; Assets bulk/reread photo correction;
  Contracts intake and existing-record proposals. See `sdk/WORKSPACE-UI.md` for
  the per-app adoption boundary. Status: **locally reviewed, scoped gaps remain**.
- Before: separate source viewers, unsortable report tables, wide editable proposal
  table, PDF-only controls shown for images. No task-time baseline was measured.
- After: shared loaded-row controls, source viewer and labelled proposal fields.
  No backend business logic or permission contract changes; backend version only.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary review task | Pass locally | Assets reread: change model, zoom, keep correction; change appears in review, inventory remains unchanged until Apply. Contracts proposal: change amount, zoom and theme; edited value retained. |
| Input/save integrity | Pass locally | Component regressions plus Contracts admin/editor/member smoke check exact accepted fields, corrected amount and revision-protected payload. Ambiguous fields remain unticked. |
| Lists/counts/exports | Pass locally | 1,000-row sort regression, blanks last, reset, replaced tbody and editable transition. Real Contracts filter shows 1 of 2 loaded rows while portfolio count stays 2. Crumbs raw counts sort 320, 620, 1194, 2152. Export scope unchanged. |
| Source safety/lifecycle | Pass locally | Unsupported HTML rejected, late response discarded, blob disposal, image zoom and existing PDF lifecycle tests. Source fetch stays in app permission boundary. |
| Desktop/mobile | Scoped pass | Actual Assets and Contracts views at 1280×800 and 320×740. Contracts field cards: 254px wide inside 320px viewport, document width 320px (no page overflow). Image controls hide PDF paging and single-source chooser. |
| Light/dark/focus | Scoped pass | Contracts light and dark; native keyboard focus and explicit field labels. Real scrolling/focus kept global navigation visible. No full screen-reader or 200% text certification. |
| Short viewport | Scoped check | 800×500 responsive layout/keyboard navigation inspected; exhaustive short-screen workflows remain in rotating coverage. |
| Other consuming apps | Automated/source evidence | All operational frontends run their existing role/workflow smokes; byte-identical runtime distribution checked. Full interactive browser workflows for Hub/Desk/Forms/Trust/Watch remain open. |
| API/SDK/version/docs | Pass locally | No new Candid surface. Matching module versions/changelogs, served SDK guide, canonical JS/CSS, generated Crumbs OpenAPI version derived from package metadata. |
| Fresh and populated upgrades | Separate release gate | Stable compatibility against committed baselines and existing local suite; packaged release/upgrade evidence belongs in the private candidate receipt. A fresh install is not a populated upgrade. |
| Live behavior | Not checked for this candidate | This change is not deployed. Production requires authorization and identical package publish/update/verify. |

## Decisions and remaining work

- Controls describe **loaded rows**, never server-wide results. Persistent saved
  table preferences, server-wide sorting and column drag-reordering are not implemented.
- Mixed-currency and unsupported formatted values are not sorted as numbers.
- Editable grids/selection queues retain application-owned behavior. Games, MCP,
  collector, public embeds and website do not load the workspace JS. Independent
  Kitchen/Vault/game versions are not advanced for unused opt-in CSS copies.
- Native option filtering keeps the selected value and original select. Safari/iOS
  picker behavior and assistive-technology operation remain explicit rotation items.
- PDF canvas is a visual aid; original text/download remains necessary for accessible
  source text. Multi-page PDF rendering uses the existing pinned Contracts renderer.
- Public Bug/Bug2D versions are newer than this internal source: preserve them during
  public reconciliation and retain their live recipes during suite publication.
- Private screenshots/logs: release-tools/shared-workspace-review/evidence. All
  browser fixtures are fictional; no customer contracts or live credentials used.

## Rotation

The existing weekday 09:30 Europe/Zurich heartbeat now tracks concrete coverage
units in private `daily-quality/coverage.json`. Daily: changed/high-risk boundaries,
then an unverified and an oldest unverified executable case; five groups across
five weekday runs. Blocked/inspected is not passed. Broad seeded workflows remain
unverified until decomposed and actually exercised.
