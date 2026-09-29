# Website: the shared Operations dashboard

- Standard: 1.2.0; website 0.5.5; 29 September 2026.
- Task: an IT operator understands the shared overview, its next steps and the
  difference between personal work access and a team-room display.
- Previous obstacle: Operations was a small illustration inside the Hub tab.
  TV use was mentioned but not demonstrated. No usability timing was measured.
- Outcome: a dedicated section, linked from the suite overview and Hub example,
  with five source summaries and a work/TV illustration switch.
- Relevant rules: PURPOSE-02/04, NAVIGATION-06, REPORTING-01/02/03/04/05,
  ACCESSIBILITY-02/04/05, WRITING-06, GOVERNANCE-07.
- Status: verified within the marketing scope below; not a renewed certification
  of the actual Hub dashboard, display security or the whole suite.

## Acceptance evidence

| Gate | Result and scope |
|---|---|
| Primary task and composition | Pass: one section and two explicitly labelled example views. The Hub example now explains central access, avoiding a duplicate dashboard. A hero link makes the new section discoverable without another top-level navigation item. |
| Source evidence and audience | Pass: compared to `docs/HUB-OPERATIONS.md`, `hub/dist/operations.js` and `displays.js`. Five implemented sources; TV omits sale follow-up and all business-action links. No Forms/Crumbs integration, history or overall health score is implied. |
| Static/empty/error behavior | Pass within scope: both illustrative views are complete HTML without JavaScript. Real source-unavailable handling is explained, not simulated with successful zero totals. No live data request or new backend is introduced. |
| Roles, login, writes, retention, notification delivery | Not applicable to this static illustration. Existing product boundaries are described; their security tests are referenced as evidence, not rerun for a website-only release. |
| Canonical identity and components | Pass: existing registry icons and semantic tokens; existing scene buttons and progressive enhancement reused. Brand, design and runtime checks pass. |
| Assembled responsive surface | Pass within scope: 1280 × 800 desktop, 800 × 800 narrow, 320 × 740 mobile, 1280 × 600 short viewport. Desktop shows five separate source cards; narrow layouts reflow, and mobile uses compact vertical cards. No horizontal page overflow at measured 320, 800 and 1280 widths. |
| Themes and language | German light/dark and English dark reviewed; both language outputs pass existing smokes. Translated headings and controls wrap. Private before/after images retained with the release receipt. |
| Navigation and keyboard | Actual scrolling keeps the shared header at top 0. Enter switches work/TV. Following the sale example activates the Assets panel and moves focus there using the existing explorer behavior. |
| Wider accessibility | Semantic headings, lists, source labels and pressed states inspected. No new animation, automatic rotation or moving counts. Screen-reader certification, 200% text resizing and additional browser engines were not performed. |
| TV-scale claim | This responsive public illustration is not a full-screen TV application or evidence of room-distance readability. No new TV runtime layout is released. The actual product's paired-display scope is linked. |
| Privacy and release | Only synthetic numbers and public source links; no employee records, live dashboard access or new analytics events. Existing deployment analytics configuration and CSP are preserved. |
| Verification | All 16 website smokes, 13 design tests, canonical brand and runtime checks pass. Version, metadata, README, evidence map and changelog updated. Exact deployed assets are compared to the candidate in the private release receipt. |

## Findings and delivery

The sources remain authoritative. A paid sale is still open until physical
handover; selecting the TV example cannot make that work appear completed.
The 96/100 Trust figure describes 38 assessed devices among 40 enrolled, not
all 48 inventory devices. These are synthetic demonstrations, not measured
customer outcomes. The existing source documentation specifies freshness and
revocation delays; the website does not promise instantaneous screen erasure.

No new board/project feature is introduced or advertised in this release.
The independent static website follows its own installation procedure. Suite
backends, Kitchen releases, central permissions and Lunch are unchanged.
