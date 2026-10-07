# kebab-stack assets

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

App roles are managed exclusively in [Hub → Permissions](../docs/APP-PERMISSIONS.md). Active Hub owners/admins and per-app Admins can see and manage all app content. Employees retain their own and explicitly shared content; Watch requires an explicit Viewer/Admin grant by default.


The devices of a company, on the skewer: who has what, what happened to it,
with the photo that proved it.

**Photo in, device out.** A device changes hands; someone photographs its
back or its inventory sticker on their phone. The picture is the intake: the
hub's AI key reads every code on it, the register matches them against tags
and serials (exact → confusable characters folded → one or two edits) and
shows candidates; you confirm or create the device in two taps; you say what
happened (handed out to *person from the hub directory*, returned, loaned,
sold, scrapped, lost, just documenting); the photo stays as evidence on that
event. Without an AI key everything but the reading step works.

- **Register**: tag, serial, vendor, model, kind, status, assignee (hub person) or external holder, note; archive instead of delete.
- **History**: append-only events per device (hand-over, return, sale, scrapping, note, photo, edit, import, hub reassignment) with who and when.
- **People from the hub**: sign-in by hub ticket, directory for the person picker, roles from the hub (active Hub owners/admins and Hub-assigned app Admins run the register), notifications on hand-over, `hub_ownedObjects` for inventory context. Physical devices are handed over in Assets; generic Hub reassignment is retired.
- **AI from the hub**: lane `ai` → `hub_aiCredentials`; the vision call leaves the engine as a single-node (non-replicated) HTTPS request; the vendor receives the picture, including any personal details visible in it.
- **Device management**: Iru (formerly Kandji), Jamf Pro and Microsoft Intune as sources — sync every six hours or on demand; the MDM fills gaps and creates missing devices, the register keeps the hand-overs; disagreements are shown as mismatches, never applied.
- **Import / export**: CSV both ways; devices known by serial or tag are updated, never duplicated.
- **Apple Business Manager (0.8.0)**: Apple's purchase register as a source — every Mac, iPhone and iPad the company bought and which device-management service holds it. Serials are joined with the register; the *Apple* page shows the gap (owned but not in the register, or held by no MDM at all) and takes devices in as *unknown* until someone finds them. The key Apple issued never leaves the browser — it signs a 180-day client assertion there; nothing is written back to Apple.
- **Selling devices**: purchase-based pricing, offers, numbered invoices with Swiss QR-bills, immutable PDF archives, credit notes and finance exports. Colleagues accept through their Hub account on the same three-step page the external dealroom uses (review & accept → invoice → payment & hand-over); they see price, terms and their invoice, never the company's purchase price or pricing rule. IT is told through the Hub when a colleague accepts or declines. **External buyers use a private dealroom (0.9.0)**: review and accept without an account, receive an automatically generated invoice, download it and confirm receipt. IT gets notified, confirms actual payment and records preparation and hand-over. Buyer receipt confirmation stays separate: a paid, prepared device can be handed over while receipt is pending, without inventing a buyer confirmation. A declined offer is cancelled; cancelling an issued invoice requires a credit note. Payment reconciliation and the books remain with finance.
- **Sample register** to try the intake on.

Install: through the **Kitchen** in your hub (recipe `assets`), or by hand per `INSTALL.md`.
After installing, grant the app the **AI** lane in the hub (Apps → Edit → What it may know) so it may read photos.
Before the first sale: Settings → *Sales & billing* (company as creditor, IBAN, VAT, number prefix agreed with finance, hand-over terms) — see `INSTALL.md` § 6. Want approvals first? Add a request type "Buy my device" in desk (with a manager or finance approval step) and start the sale here once it is approved — no wiring needed.

Set the Assets **App address** under Settings → General → Who runs the register for notification links.
An offer in Slack or the Hub bell opens that offer's price, terms and acceptance
directly, returning to the same place after Hub sign-in if needed. Invoice
notifications open the matching record too; other users cannot accept for the buyer.

For an outside buyer: open the sale → **External dealroom → Create private link**.
Copy it and send it to that buyer. Links last 14 days; replacement links revoke the old one.
The link is the buyer's access credential, so do not post it in a shared channel.
No buyer account, email-code service or invoice-rendering relay is required.
See [the operator workflow](INSTALL.md#external-buyers-private-dealroom) for the full process.

After downloading the invoice, the buyer presses **Confirm invoice received**.
The download request stays with the sale, so reopening the valid private link or
returning from a phone's PDF viewer keeps confirmation available. The button is
the explicit receipt assertion; downloading alone never confirms receipt or payment.


### Assets 0.10 — calmer daily work

The **Devices** register is the entry point. Use **Scan & update** for photo intake,
**Sales** for Offer → Invoice → Paid → Complete (with Cancelled separate), and **Apple
inventory** to reconcile ABM. Each sale shows the next action. A paid sale closes only
when IT records the physical hand-over; this now also applies to colleague sales.
Settings separate daily administration, connections, billing and data retention.

During preparation, **Check Kandji / Iru** reads the linked Mac's unlock PIN on demand.
It requires a token permitted to read device secrets. It never sends an erase or unlock
command, does not query Activation Lock bypass codes, and is not proof that a device is
unlocked. A deleted provider record may no longer have a retrievable PIN. Validate the
wipe and setup before deleting the MDM record.

See [UX decisions and remaining privacy work](UX-REVIEW.md). This release does not add
automatic personal-data deletion. `DEPLOYED.md` continues to describe the last actual
production deployment; a local release build does not change that installation.

## Person context in Desk

Agents can open permission-checked summaries of related employee records in Desk.
See [employee context and directory follow-up](../docs/LIFECYCLE.md) for the workflow,
data boundaries and rollout. App roles remain managed in Hub.

### Hardware offboarding (0.13)

Confirmed Desk departures prepare hardware follow-up automatically. Keep custody until receipt, transfer or sale is confirmed; returned hardware is prepared before reissue. Existing colleague invoices can continue through a private dealroom after departure. See the [operator workflow and boundaries](../docs/HARDWARE-OFFBOARDING.md).

## Hub Operations

This app contributes aggregate-only, Admin-authorized summaries to Hub → Operations. See [definitions, access and freshness](../docs/HUB-OPERATIONS.md). Individual records remain in the app.

## Finance workspace

Hub owners assign Finance in **Hub → Settings → Company teams**. Finance sees all hardware financial records and sales, records payments and corrections, downloads invoices and exports, and maintains purchase cost and straight-line book values. Device management, secrets, preparation and custody stay with Assets administrators. Read the [company Finance guide](../docs/FINANCE.md) for setup, precedence, notifications, legacy payments and calculation boundaries.

## Desk Workboard

Assets 0.17.0 exposes a minimal Hub-only sale status projection for Desk 0.25.0 / Hub 0.36.0. Only existing Assets admins and Finance can read it. Payment and hand-over actions stay in Assets. See [Workboard](../docs/WORKBOARD.md).

## When photo reading is unavailable

Assets 0.17.1 keeps the selected photo in the current browser draft and retries a
known transient AI failure once. If reading still fails, use **Try reading again**
or **Enter details manually**; the same photo can accompany the eventual saved
hardware event. A draft is not durable storage: reloading/closing the page can
lose it. Nothing is added to inventory until the operator saves the final step.

HTTP 503 describes a failed AI-service response, not a completed device upload.
For 401/403 check the Hub AI key/permissions; for 402/429 check the configured
provider's billing or usage limit. The app displays sanitized guidance and the
HTTP status, not provider response bodies. No automatic vendor/model switch is
made. The one transient retry can make a second provider request; ordinary
employees remain unable to invoke photo recognition.

## Device labels

Open a device and choose **Label**, or **Print labels** on a filtered device list. Pick the label size (Brother DK-11209 62 × 29 mm, DK-11201 90 × 29 mm, DK-11221 23 × 23 mm or DK-22205 62 mm continuous) and the fields to show; the QR code always links to the device page. Printing uses the browser's print dialog: select the label printer and the matching media size once, then every label prints 1:1. Any printer the operating system knows works; nothing is sent to a cloud print service. An admin can save the current layout as the default for the register.

## Registering a new device

Scan a device → photo of the factory label (or **Find or add manually**) → **Not in the list — add a new device**. Serial, vendor and model are prefilled from the photo and can be corrected. Leave the tag empty to get the next automatic tag (prefix and digits under Settings → Register devices; the number continues from the highest numeric tag in the register). Optionally pick the person who receives the device or one of the admin-defined locations. **Register device & show label** creates the device, records the hand-out, keeps the photo as evidence and opens the label ready to print.

## Registering many devices from photos

Scan a device → **Register many from photos**. Add up to 60 photos (one label per device), start the reading, review the table: correct serials with low confidence (marked), set kind, location and recipient for all rows at once or per row, untick what should not be imported. Devices already in the register are recognised by serial or tag and unticked. **Register n devices** creates them with automatic tags and the photo as evidence; **Print n labels** follows. Dell Service Tags are stored as the serial.
