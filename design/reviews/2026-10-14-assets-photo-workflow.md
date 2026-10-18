# Product design review — Assets photo capture and correction

- Standard version: 1.2.0
- Module: Assets 0.27.0, branch codex/assets-photo-workflow
- Date / reviewer: 2026-10-14 / Codex
- Scope: admin photo batch, stored-photo re-reading, mobile navigation and review
- Status: Verified for the local checks below; production and OCR-quality validation remain open
- Rules: NAVIGATION-06, GOVERNANCE-03/04/07, DELIVERY-03/05, WRITING-01/02
- Previous task: batch required horizontal scrolling through eleven columns; thumbnails could not be enlarged. Stored-photo reading existed only in list selection and disappeared when transient AI credentials were empty after upgrades.
- Intended outcome: choose photos, inspect evidence alongside editable proposals, register deliberately; reopen an asset and read its latest photo again.
- Measurement: no measured operator-time or cost-saving claim.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Main workflow | Pass locally | Browser: multiple file selection, read, table editing, photo dialog, location/kind correction, return to table. Direct asset re-read opens proposals without saving. |
| Positive / negative access | Pass locally | Seven Assets PocketIC security tests; member photo-reading and correction refused; revoked access rechecked after the AI outcall. Existing role smokes pass. |
| AI status after upgrade | Pass locally | Populated candidate-to-candidate upgrade retains session, asset and photo; startup restores whoami.aiOn without login or Settings. This does not replace packaged-release upgrade verification. |
| Failures / retry / partial save | Pass locally | photo-batch.test.mjs: configuration failure retains photos; nonretryable response makes one call; failed rows can be revisited without submitting successful rows again; preview edits remain until accepted. |
| Evidence and drafts | Pass locally | Photo bytes accompany registration. Preparation failure cannot create a photo-less asset in this workflow. In-app navigation keeps drafts; full reload/tab close still loses them, as stated in the UI. |
| Concurrent change | Scoped | Re-read compares proposed fields with the latest asset before saving, and merges unrelated fields. Existing API is not an atomic compare-and-set; simultaneous operator edits remain a limitation. |
| Composition | Pass for inspected surfaces | Table reduced to selection, photo, vendor, model, serial and review. Other fields are editable in the photo dialog. Optional batch defaults collapsed. Mobile uses labelled cards. Previous 1,200 px minimum is removed. |
| Narrow / themes | Pass for inspected sizes | Rendered at 320×740, 390×844, 800×900, 1280×800 and short 1280×500. Dialog checked in both themes. No page overflow at 320/390; final mobile tabs wrap without internal overflow. Batch before/after captures and dark 800 px view recorded locally. |
| Real scrolling | Pass for inspected views | Native browser scroll: mobile scrollY 262, topbar top 0; short desktop scrollY 1383.5, topbar top 0; 800 px scrollY 1283, topbar top 0. SDK mount host remains sticky. |
| Keyboard and focus | Scoped pass | Native modal, visible close, Escape, labelled inputs, zoom buttons, persistent correction button. Browser Escape closes successfully. Screen-reader walkthrough and 200% text enlargement remain unverified. |
| Shared foundations | Pass | runtime:sync / runtime:check, design:check (13 tests), brand:check. No canonical palette/logo changes. Generated SDK timestamp-only change omitted. |
| Build / state contract | Pass locally | npm ci; pinned mops install, mops check --fix and build; moc 1.12.0 stable-compatible against git HEAD baseline. Compiled Candid and generated browser IDL match existing files. No stable field or API change. |
| AI accuracy / live installation | Not verified | UI fixture and PocketIC vendor responses are simulated. Real provider/model recognition on the owner's photos and production deployment were not performed. |

## Evidence

Private local evidence collection: `assets-photo-review-2026-10-14`.
Fictional data only. Files include before-320.png, before-1280.png,
after-batch-320.png, after-batch-mobile.png, after-batch-desktop.png,
after-batch-800.png, after-batch-800-dark.png, after-photo-editor.png,
after-reread-mobile.png, after-reread-320-dark.png and after-short-dark.png.
Some intermediate desktop captures precede final singular/plural wording and
mobile-tab specificity fixes; final 320/mobile captures include those fixes.

## Findings

| Priority | Observation | Resolution |
|---|---|---|
| P1 | Restored sessions can hide photo reading although the Hub is configured | Startup credential refresh and explicit refresh on demand; admin action remains visible |
| P1 | No direct re-read action on an existing asset | Label photos → Read photo again with AI; editable proposal and photo evidence |
| P1 | Phone review cannot compare tiny photos with truncated fields | Zoomable native photo dialog and responsive cards |
| P2 | Eleven equally prominent table columns and optional defaults obscure the task | Compact table; optional fields in evidence editor; collapsed batch defaults |
| P2 | Shared tab specificity prevents wrapping on phones | Scoped mobile layout overrides sizing/wrapping, without changing canonical tokens |
| P2 | Partial retries lose prior success counts or risk repeated writes | Preserve created rows and disable successful rows; regression included |

## Delivery

Local implementation and preview only. No publication, merge to release/public
branches, catalogue mutation or production deployment. Deployment requires the
normal clean committed format-2 bundle, packaged-executable upgrade checks and
explicit authorization. No full-app accessibility certification is claimed.

### Public-source gate

The committed-HEAD public-source audit was also run and is **blocked** (88
findings across this private source branch). Findings include deployment-domain
references, bundled canister-reference patterns, private-file links and binary
review requirements. The new fictional `assets/test/fixtures/photo-label.png`
also requires a path/hash-bound binary review before public export. No public
export or push was performed. Passing local functional tests does not override
this publication gate.
