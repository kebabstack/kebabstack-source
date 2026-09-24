# Company Finance

Implemented in Hub 0.34.0 and Assets 0.16.0. Company membership and app scope live in Hub; Assets enforces its received role through the existing directory lease. Lunch and unrelated tools keep their existing directory behavior.

## Set it up once

A Hub **Owner** opens **Settings → Company teams → Finance**, adds people or existing directory groups, and selects the Assets connection(s) that should use them. Review the assignment and save. The panel lists the current effective recipient count. Hub → Permissions shows each person's effective role and source. Only Owners delegate rights; global Admins can inspect the team and operate apps. Manually maintained groups carrying Finance grants become owner-managed; trusted IdP groups still follow SCIM.

Finance supplements Employee access. Explicit individual **No access** and an inactive account block access; global Owner/Admin and individual Admin retain Admin. The saved app binding includes its backend identity. A replacement connection needs a deliberate new assignment. Other apps, including Desk reporting, do not automatically receive Finance rights.

Assets normally pulls directory changes every 30 seconds and rejects protected actions when the directory lease exceeds 60 seconds. Network delay can prevent refresh; these are freshness bounds, not a promise of immediate revocation. Check app enforcement after consequential changes.

If IT does all bookkeeping, choose **We manage this through IT**. This deliberately disables Finance team grants and dismisses the setup reminder company-wide. Existing Assets admins continue. A configured team with no active, authorized recipients produces a new warning instead of being treated as this opt-out. A Hub Owner can change the choice later.

## Work in Assets

Finance opens **Finance → Payments** for open and overdue invoices, then the sale for its invoice PDF, payment history and outstanding balance. Confirm the actual bank record: enter amount, payment date and optional reference, review, and save. Partial payment leaves a balance; only the full amount marks the invoice paid. Duplicate retries use the same request identifier and cannot append the same payment again. Concurrent edits require a refreshed ledger.

Correct an incorrect payment entry with a full reversal and a reason, preserving its original payment date. Then enter a corrected payment if needed. This is an accounting correction record, not a bank refund instruction. Overpayments are refused rather than silently creating credit balances. A cancelled sale retains its invoice, credit note and payment history; process refunds through the company's accounting process. IT retains cancellation/credit-note creation because cancellation also concerns the hardware sale and custody. Finance can read and download issued credit notes.

Nobody, including an Owner or Admin, can record payment or a correction for their own purchase (person ID or matching buyer email). Another authorized person must confirm it. Finance cannot accept on behalf of a buyer, change sale prices, alter technical inventory, record preparation/hand-over, retrieve MDM secrets or change technical settings. Employees retain their own devices and offers.

Older paid sales appear with a clearly labelled legacy payment confirmation using their stored confirmation date and note. This does not infer the original bank transaction date. Existing invoice numbers, PDFs, acceptance and custody are preserved. Payment corrections do not undo a physical hand-over; the Finance queue still shows any reopened balance.

## Notifications without another recipient list

Newly issued invoices queue a Hub notification with an internal sale link to the current effective Finance recipients. If Finance is absent, intentionally disabled or has no usable recipients, active Assets admins receive it. The buyer's private dealroom key is never included. After full payment, Assets admins receive the preparation/hand-over link. Historical invoices are visible in the queue without a bulk migration notification.

Notifications are deduplicated and retried in bounded batches. The sale shows whether Hub accepted a notification or delivery needs attention. Hub acceptance is not proof that Slack delivered it: Slack DMs depend on the configured Hub integration and each recipient's preference. Existing Hub delivery diagnostics remain authoritative. A failed Slack connection does not remove work from the Finance queue.

## Hardware values

Finance can read a financial projection of every hardware type, including assigned person, serial, status, purchase data and valuation. It does not expose technical notes, photographs, MDM connections or secrets. Set purchase cost, currency, purchase date, in-service date, useful life in months, residual value and a change reason. Useful-life defaults are optional and apply when creating valuations; they never rewrite existing records.

The current model is straight-line depreciation, starting with the calendar month after the in-service date. Before the in-service date the value is unavailable. The reduction is `(purchase − residual) × elapsed calendar months ÷ useful-life months`, rounded down in minor currency units and capped at the residual value. Each change is retained with actor and recording time. A changed purchase basis invalidates a mismatching valuation until reviewed.

**Book value and sale-price suggestion are separate.** The existing commercial sale-price rule retains its own floor and minimum; issued invoices never change when valuation does. Agree useful lives and residuals with your accountant; this feature does not select statutory or tax depreciation rules.

Currency totals are kept separate without assumed exchange rates. Totals cover the **current** active inventory and exclude archived, sold and scrapped hardware. The date selector recalculates the current basis at a date; it is not a historical custody snapshot or a reconstruction of the accounting ledger as originally reported on that date. Missing information stays blank rather than becoming zero. The CSV includes all hardware with current status, selected date, basis and calculated value; payment and invoice exports are separate.

## Decision for the company

This reduces hand-offs between IT and Finance: the same hardware sale holds the immutable invoice and recorded payment evidence, while Hub provides a clear permission boundary. The bank, accounting system, depreciation policy and physical preparation still require the responsible people. No automated bank reconciliation, bank transfers, general ledger posting or tax certification is implied.
