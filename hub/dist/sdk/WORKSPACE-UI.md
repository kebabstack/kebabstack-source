# Shared tables, forms and evidence review

Browser components are canonical in `sdk/js/workspace-ui.js` and
`sdk/js/evidence-viewer.js`; styling is canonical in `hub/dist/components.css`.
`npm run runtime:sync` distributes byte-identical copies to the eight operational
workspaces and the served Hub SDK. `npm run runtime:check` checks that boundary.
No framework, external requests, credentials, saved form contents or local-storage
preferences are added by these components.

## Operator workflow

In an adopted table, use its header buttons to sort and **Table options** to find
loaded rows, choose visible columns or reset the view. This operates on the loaded
rows, not unseen server pages. The count says so explicitly. Existing application
filters, totals, exports and selection actions retain their own scope. Column
choices and search reset when the application replaces the table. Persistent saved
views and server-wide sorting are not implemented by this component.

Long marked native selections add **Find an option**. Search narrows the choices
without changing the selected value. Escape clears the search; Enter focuses the
native select rather than submitting a surrounding form. The chosen value and the
app's change/validation handlers remain authoritative.

Marked forms retain browser validation and application-owned save behavior. Invalid
fields appear in a linked error summary and retain their values. Correcting a field
clears its error. This does not replace server validation, revision checking or the
app's existing dirty-draft protections.

Assets label review and Contracts intake/record review share a source viewer.
Choose the source, page and zoom, then compare with the editable proposals. Images
and locally rendered PDFs are allowed; uploaded HTML is never embedded. PDF canvas
is a visual aid: use retained source text or download for accessible original text.
The viewer never invokes AI or saves values. The app performs authorized fetching
and explicit confirmation. Late results after navigation are discarded and image
URLs/PDF resources are released on disposal. AI evidence/uncertainty and existing
values remain owned by the app, rather than being invented by a generic viewer.

For leaders: consistent controls reduce relearning and make review scope clearer;
no measured productivity saving or complete accessibility certification is claimed.

## App integration

Load `workspace-ui.js` as a module on a `body.ks-workspace` operational page.
Use `table[data-ks-table]`, `form[data-ks-form]` and `select[data-ks-search]` explicitly.
Do not apply table enhancement to editable grids, selection queues or headers with
existing sort handlers. The component rejects interactive headers and editable rows.
It supports one header row, one body and ungrouped cells. Grouped/summary rows are
never sorted among ordinary rows.

Headers default to natural **text** sorting. For numerical values, mark a header
`data-ks-sort="number"` and provide an ASCII raw `data-sort-value` on every cell;
never parse formatted currencies, percentages or dates by guessing locale. Empty
and unavailable values stay last in either direction. ISO date strings can use text
sorting with raw values. Use `data-ks-sort="none"` for actions, masked keys, mixed
currency values or unsupported semantics. The first identifying column and action
columns remain visible. Moving rows preserves the existing DOM and action handlers.

`mountEvidenceViewer(root, {documents, load, openPdf, stale})` returns a disposer.
`documents` has id/name/mime; `load(id)` returns authorized bytes or an image URL.
PDF support is injected by the app's pinned local renderer. Call the disposer on
navigation, source replacement or dialog close. The component exposes no backend
API, performs no permissions check on behalf of the app and must not receive a
privileged URL that the current viewer is not allowed to read.

## Adoption boundaries

- Hub: eligible access/history/backups/integration tables; existing people/groups
  sorting and interactive permission editors are retained.
- Assets: connection/history tables and label/photo review in bulk and reread flows;
  inventory cards and editable bulk grids retain their specialized behavior.
- Contracts: portfolio, dates/seats, intake source review and existing proposals.
- Desk: personal request tables, customer project lists and reporting summaries;
  bulk queue selection and on-call scheduling stay app-owned.
- Forms: submissions/history, while form builder/public respondent flows retain
  their existing field semantics.
- Trust/Watch: eligible history/report tables and marked configuration selectors;
  attention-ranked domain/device cards remain purpose-built.
- Crumbs: acquisition/search-console tables use raw numerical sort keys. Report
  limits, totals and exports are not changed by a local table search.
- Kitchen/Vault are operated through Hub; no new backend API. Games, public embeds,
  MCP, the optional collector and website do not load the workspace components.
  Their copied shared CSS gains only unused opt-in rules; no independent game,
  installer, MCP or website release is proposed by this change.
