# Crumbs workspace composition correction

- Date: 2026-09-23. Standard 1.2.0; Crumbs 0.6.1; Hub 0.32.2 (served documentation only).
- Task: identify the selected website and read a report immediately; reach occasional administration without cluttering every report.
- Trigger: user rejected the oversized site-context card. The previous review checked tokens/reflow but missed hierarchy. Its visual verdict is explicitly corrected.
- Rules: LAYOUTS-07, LAYOUTS-08, COMPONENTS-07, GOVERNANCE-07, NAVIGATION-06.
- Status: composition corrected and locally reviewed for the surfaces below. No production rollout or full accessibility certification.

## Before / after evidence

Browser screenshots are recorded in the associated review conversation using fictitious local data. Viewport dimensions below are CSS pixels, not screenshot bitmap dimensions.

| Surface | Observation |
|---|---|
| Before, approximately 800 px wide | White padded site card, bold select, role pill and two equally bordered administration actions. Context block measured 94.6 px high; report controls wrapped to 100 px. Report began around y=474. |
| After, 800 px wide | One 44 px context row inside the heading. No role pill or create action above each report. Saved-filter operations are disclosed on demand. Report begins around y=274, roughly 200 px earlier. |
| After, 1280 × 800 | Native site selector 320 × 44 px; primary report region starts at y=280; first data row remains visible at roughly y=535. Whole viewport inspected in light and dark. |
| After, 320 × 800 | Document width equals 320; selector and quiet All websites action share a 44 px context row. Report options reflow, navigation/table scroll locally. Light/dark inspected; no desktop height target imposed. |
| Long name, 800 px | Saved “North America customer support and product documentation” in the local fixture; context remains 44 px and no document overflow. Native option retains the full name. |
| Disclosure | Opened using the real browser; Escape closes and focuses summary. Existing UI smoke confirms refresh does not close an active disclosure. Saving opens/focuses the form; management moves focus to its region. |
| Scope / administration | All websites has a combined scope heading and no misleading single-site selector; Add website is placed in that collection. Empty accounts keep their direct Add website action. Access wording appears under Settings. |

## Verification and remaining scope

- Crumbs admin, manager, viewer and two empty-state UI smokes passed, including permissions, navigation, drafts and stale-response checks.
- Design generation/tests and canonical runtime/SDK checks passed. Canonical runtime component dimensions were not changed.
- Crumbs/Hub pinned builds and committed stable-signature compatibility checks passed; generated bindings and release metadata remain consistent.
- Hub frontend smoke and existing role/sign-in tests passed. The 18 available Crumbs backend cases passed; two optional historic-baseline cases were skipped without their fixture binaries. The focused Hub setup/invite/SSO/SCIM run passed all 16 cases. The broader suite attempt was stopped after missing build artifacts for unchanged apps; no whole-suite security pass is claimed.
- Desktop and narrow screenshots were visually reviewed as complete pages. No measured task-time saving is claimed.
- Full screen-reader use, actual 200% text-only enlargement and device-specific touch testing remain unverified. Narrow reflow is not a substitute for those checks.

Local preview: Crumbs `/acquisition` on port 8792; standard `/design/#workspace` on port 4202. Temporary viewport overrides reset after review.
