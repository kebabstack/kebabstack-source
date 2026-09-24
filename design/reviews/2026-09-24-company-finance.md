# Company Finance review

- Standard: 1.2.0.
- Modules: Hub 0.34.0, Assets 0.16.0, Motoko SDK 0.13.0.
- Surfaces: central team assignment and opt-out; Assets payment queue, sale payment ledger, hardware values and defaults.
- Roles: Hub Owner, global Admin, Assets Admin, Finance, employee, inactive person and buyer.
- Review date: 2026-09-24.
- Status: scoped implementation verified; full assistive-technology certification remains unclaimed.
- Applicable rules: NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07, FORMS-01/02/03/04/06 and GOVERNANCE-07; permission, notification and error-state rules.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task and completion | Pass | Queue separates open/overdue payments from hardware values. Only full payment completes its financial state; physical hand-over remains with IT. |
| Positive and negative authorization | Pass | `tests/finance.test.mjs`: owner-only assignment, protected manual group, explicit denial, employee denial, no technical device projection, self-payment refusal and deactivation. Existing six-app regression suite retained. |
| Direct entry and session handling | Scoped pass | Existing Assets/Hub sign-in smokes retained. Backend Finance endpoints use current role and the existing directory lease. New production SSO interaction is not claimed as tested by fixture previews. |
| Errors, retries and concurrency | Pass | Revision-checked team, valuation/default and payment writes; append-only reversals; identical payment request retries do not duplicate. Failed team draft is retained in UI test. |
| Lists and exports | Pass | Backend totals before pagination; 100-row pages; currencies separate. Invoice, payment-history and hardware-value exports have distinct meanings. Date-based values explicitly use current inventory/basis. |
| Branding and controls | Pass | Canonical marks, tokens and runtime retained; new styles define layout only. Real browser measured new search/date/export controls at 44 px tall, search 320 px and date 192 px wide at 1280 px. |
| Initial viewport | Pass | Assets payments first useful rows visible without scrolling at 1280×800. Hardware first row at approximately y=461 px. No large context-selector card. |
| Reflow and themes | Scoped pass | Browser review at 1280×800, 800×600 and 320×640. Hub and Assets document widths matched 320 px at narrow view. Hub dark surface and Assets light/dark surfaces inspected; full 200% text-only zoom, short landscape screens and all theme/workflow combinations remain unverified. |
| Global navigation | Pass | Actual wheel scrolling on the 24-row Assets inventory: scroll y=1600 px, topbar y=0. Hub remained visible during team-form scrolling. Existing shared host owns stickiness. |
| Keyboard / screen reader | Scoped pass | Native labelled controls, explicit review buttons, status/live regions, fieldsets and semantic links. Accessibility tree inspected; full screen-reader audit remains open. |
| Privacy and boundaries | Pass | Separate financial hardware projection excludes technical notes, images and MDM details. Buyer private keys never enter notifications. Valuation reasons stay in financial history, not employee-visible technical history. |
| Currency / time | Pass | Server validates actual calendar dates. Minor-unit arithmetic, separate currencies and explicit calendar-month depreciation; calculation is not presented as a tax rule or historical custody reconstruction. |
| Notifications | Pass | Local backend verifies invoice notification to Finance once, correct internal sale URL, dedup and active-recipient filtering. Hub acceptance explicitly does not claim Slack delivery. Live Slack messages are not sent for testing. |
| Upgrade / data preservation | Pass | Populated upgrade from production Hub 0.33.0 and Assets 0.15.1 preserves invoices, archived PDF bytes, existing payment evidence, technical custody and Lunch roster. Finance configuration and new ledger/values survive a further upgrade. |
| Documentation | Pass | `docs/FINANCE.md`, permission guide, operational/install notes and module changelogs describe implemented scope and boundaries. |

## Findings resolved

- Reduce native fieldset spacing and constrain the Hub person/group selector instead of introducing an oversized configuration block.
- Protect manual Finance groups with the same owner-only delegation boundary as existing app grants.
- Treat explicit No access as a denial, including a person otherwise included through Finance.
- Correcting a fully paid, already handed-over sale can reopen its balance. Cancelling that corrected invoice must not return physically delivered hardware to stock.
- Preserve legacy payment evidence without inventing a bank transaction date or new payer identity.
- Keep asynchronous sale-panel replies tied to the selected sale, and keep old payment API compatibility without a duplicate legacy payment UI.

No user task-time or cost-saving study was performed. No general accounting, tax or accessibility certification is implied. Production authorization: user explicitly requested implementation and immediate rollout; release evidence is retained separately from public source.
