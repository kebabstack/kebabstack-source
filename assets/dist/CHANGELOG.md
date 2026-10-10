# Changelog — kebab-stack assets

## [0.24.1] — 2026-10-10

- Hardware sizes: a memory value such as "24 GB LPDDR5" is read as 24 GB (0.24.0 appended the digits after the unit and showed 245 GB). Iru reports volume sizes in binary gigabytes labelled "GB"; they are now shown as decimal GB like macOS and Apple Business Manager (a 512 GB drive reads 494 GB, not 460). Stored values refresh with the next sync (devices read in 0.24.0 are re-read once) or with **Refresh hardware**.
- Device page: **What Iru reports** (admins) lists the sections Iru's details answer contains and quotes the hardware and battery-related ones, read-only and unstored, so further fields (battery condition, cycle count) are wired against the real answer. New update call `mdmDetailsPreview`.

## [0.24.0] — 2026-10-10

- **Hardware from device management.** Devices synced from Iru (Kandji) show processor, cores, memory, boot-volume size and free space, and encryption: the sync reads `/api/v1/devices/{id}/details` for devices without hardware or older than a week, at most 40 per run (one HTTPS call each), the rest on the next run; **Refresh hardware** on the device reads one now. Jamf delivers processor, cores, RAM and disk size with the existing list (plus `section=STORAGE`), Intune storage, free space, RAM and encryption from its list. Where the MDM has nothing, the Apple Business Manager capacity stands in. Shown as a **Hardware** line on the device, as a second line in the device list and in *My devices*, and as `location, processor, cores, memory gb, storage gb` columns in the CSV export. New query fields `hardware` and `abmCapacity`; new update call `refreshHardware`. The token needs Iru's *Device Information* permission; without it the sync result says so.
- **Needs attention** on Devices: one tile with the MDM mismatches, Apple devices not in the register, devices without a serial number and outstanding offboarding follow-ups, each with its answer: **Record hand-over to <person the MDM sees>**, Open Apple inventory, Add serial, Show them. The same one-click hand-over sits in the mismatch note on the device page.
- Device page: *Managed by Iru (name) · seen 3 weeks ago* opens by default with formatted dates instead of raw ISO text, the Apple box reads *Bought via …*, Hardware sits under Serial, **Sell this device** is a head action and the selling card appears only with a purchase price, an open sale or on request, Archive moved into **More**.
- Registering: a photo that matches nothing opens the new-device form by itself; **Add device** opens it directly; the kind follows the model (iPhone → phone, iPad → tablet, MacBook → laptop …) until changed.
- Devices list: checkboxes appear after **Select**; **Clear** returns to reading mode. Tabs wrap on narrow screens so Settings and Apple inventory stay reachable on a phone. Warning pills use the shared rust token; device-page boxes use classes instead of inline styles.
- Settings: an empty app address is filled from the app's own HTTPS address on first open by an admin; the notification links work without a setup step.
- No change to collection, authorization or stored device data; the hardware store is additive, existing MDM notes are kept.

## [0.23.1] — 2026-10-09

- Stack follow-through for the deployed status: Hub Operations and the team-room screen receive a `deployed` count (devices in use at a location without a personal owner), and the person panel in Desk shows a device's location ("at G11-1") beside tag and serial. Requires Hub 0.39.1 for the new count to appear; older Hubs ignore it.

## [0.23.0] — 2026-10-08

- New status **deployed**: a device in use at a location without a personal owner (monitors, docks, meeting-room gear). Set it when registering (single or from photos: status per row and for all rows), on the device page (**Mark deployed here** / **Back to stock** next to the location), or for many devices at once.
- Device list: select devices (checkboxes, **Select all** on the current filter) and apply **Deploy at location**, **Set location only** or **Back to stock** to all of them; devices held by a person, in a hand-over, sold, scrapped or lost are skipped and counted. Labels for the selection print from the same bar.
- The list filter and the status counters know the new status; hand-outs from a deployed device work as before.

## [0.22.0] — 2026-10-07

- Register many devices from photos (Scan a device → **Register many from photos**): drop up to 60 label photos, the reading fills one table (vendor, model, kind, serial or Service Tag, note), devices already in the register are flagged and unticked, defaults for kind, location and recipient apply to every row, each cell stays editable, then one click registers everything with automatic tags and the photo as evidence, and the labels print in one batch.
- Dell: the 7-character Service Tag is read as its own code and stored as the serial, the long serial goes into the note.

## [0.21.0] — 2026-10-07

- Registering a device is one step: take the photo (serial, vendor and model are read and can be corrected), the asset tag is generated automatically unless typed, optionally hand the device to a person from the directory or place it at a location, then **Register device & show label**. The label appears at once and prints from there. Automatic tags continue from the highest numeric tag already in the register; an optional prefix and the number of digits are set under Settings → Register devices.
- Locations: admins define a list (offices, floors, desks, rooms, departments) under Settings → Register devices. A device carries at most one location, shown on its page and in the list, changeable on the device page, searchable. Never required.
- Finding an existing device and recording what happened to it works as before; the previous "Use this new device → what happened" detour is gone.

## [0.20.2] — 2026-10-07

- Settings: the "Tag prefix" field is removed. It was stored but never applied anywhere (not on manual entry, scan or import), so it only suggested a behaviour that did not exist. Device tags are printed and searched exactly as recorded. Existing data is untouched.

## [0.20.1] — 2026-10-07

- Labels: lines shrink to fit the label instead of being cut off; the company logo sits in the centre of the QR code (error correction H keeps the code readable) instead of beside the name; the fixed "if found" line is replaced by a free footer text (up to 160 characters, for example "If found, please contact it@example.com") that is saved with the default layout. The format list names the DK-22212 film alongside DK-22205.

## [0.20.0] — 2026-10-07

- Device labels: **Label** on a device and **Print labels** on the device list render QR labels for Brother DK media (62 × 29, 90 × 29, 23 × 23 mm and 62 mm continuous) and print them through the browser’s print dialog, one label per page. The QR code opens the device page in Assets, so a phone camera identifies a device without an app. Fields are chosen per print (asset tag, serial, vendor and model, company name, company logo from the Hub, an “if found, return to” line); **Save as default** stores the layout for every admin. No device data changes; labels are not stored.

## [0.19.1] — 2026-10-06

- Payments, one step: Finance records a payment with amount and date and a single **Record payment** click. The review dialog and the bank-reference field are gone. The payment history sits directly under the form; every entry has **Edit** (amount or date) and **Remove**. Both are written as correction entries that reverse the original, so the ledger still shows what was recorded, what changed, by whom and when. No change to the ledger rules: no future dates, no overpayment, no recording your own purchase.

## [0.19.0] — 2026-10-06

- A colleague's acceptance issues the invoice at once, as the private dealroom does: gapless number, invoice data, the exact PDF and its archive commit together in the canister. The buyer downloads the invoice immediately; IT no longer clicks *Issue the invoice* and no PDF is rendered in a browser. Long terms paginate and names with non-Latin characters are refused instead of printed as "?".
- When billing settings are incomplete or the layout refuses, the acceptance still counts; IT is told and issues the invoice from the sale page, which now also renders in the canister. Credit notes keep the existing path.
- No stable-state changes; existing sales, invoices and archived PDFs are unchanged.

## [0.18.0] — 2026-10-05

- Buyers no longer see the company's purchase price, pricing rule or internal price note on their own sale: `getSale` and `myOffers` return a buyer view without the proposal. Administrators and Finance see it as before.
- A colleague's acceptance or decline now reaches IT through the Hub (and its Slack delivery) like a dealroom acceptance does; the decline dialog lets the buyer add a short reason, which is kept on the sale.
- A sale accepted under older hand-over terms can be offered again (*Offer again — terms changed*) instead of being stuck between "accepted" and "issue the invoice". Editing a colleague's accepted sale tells the colleague through the Hub that they have to accept again; the result text now says what happened.
- The private dealroom quote covers only what the buyer accepted — buyer, price, VAT, description, device, seller identity, account and terms. Payment days, number prefix, pricing rule and footer changes no longer invalidate every open link. Open links are re-stamped once after the upgrade; issued invoices and revoked links are untouched.
- A dealroom notification that the Hub keeps refusing (for example because the link creator left) stops after an hour of retries: every active administrator is told once and the sale's dealroom history records it, instead of retrying forever.
- Wording: offering a sale to an outside buyer points to the private dealroom link; the paper form is not a step in the product.
- No stable-state removals; existing sales, invoices, PDFs, links and payments are unchanged.

## [0.17.1] — 2026-09-29

- Synchronize the shared Hub console link: visible for active global Hub Owner/Admin/Helpdesk roles, hidden for ordinary users and app-only roles. Existing app permissions and business records are unchanged. Requires Hub 0.37.1 for the navigation hint.
- Preserve intake photos and manual entries when image recognition is unavailable. Retry known transient AI failures once, then offer explicit retry or manual entry. Reject late results after draft/session changes and recheck administrator access after the external call.
- Replace raw provider errors with actionable messages and HTTP status, without changing the configured AI provider or creating hardware automatically.

## [0.17.0] — 2026-09-29

- Add a Hub-only, paginated Workboard projection for current Assets administrators and Finance staff. Return a hardware title, invoice reference, next action and source link; omit buyer/contact, value, invoice contents and technical inventory data.
- Map invoices awaiting payment to Waiting and paid sales to In progress until physical hand-over. Source workflows and permissions are unchanged.

## [0.16.1] — 2026-09-28

- Restore invoice receipt confirmation from the saved dealroom download request after a reload, a device switch or returning from a mobile PDF viewer. Existing issued invoices and prior downloads are preserved.
- Enable **Confirm invoice received** after the PDF download starts, without a second checkbox. The buyer must still press this button explicitly; downloading alone never confirms receipt or payment. Keep confirmation progress and errors beside the action.
- Keep missing PDFs, invalid links and mismatched invoice hashes blocked. Cover reopened links, mobile page restoration, interrupted downloads and confirmation retries with regressions.

## [0.16.0] — 2026-09-24

- Add centrally assigned Finance access: payment queue, invoice/PDF access and exports, a financial projection of every hardware type, per-device straight-line valuation and useful-life defaults. Technical settings, device secrets and custody changes remain administrator-only.
- Record partial payments and reasoned reversals in an append-only, concurrency-checked ledger. Retain prior payment confirmations and issued invoices. Nobody, including admins, may confirm their own purchase.
- Queue issued-invoice notifications to the central Finance team and completed-payment notifications to Assets admins through the Hub bell and configured Slack delivery. Retry safely; missing Finance falls back to IT.
- Keep book value separate from sale-price suggestions; retain valuation changes and separate currency totals. Existing purchase edits invalidate a mismatched valuation until reviewed.

## [0.15.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes.

## [0.15.0] — 2026-09-22

- Adopt shared workspace/navigation controls, paired light/dark action colours and the canonical suite mark. The private dealroom shares the same visual foundations while retaining its separate guest access and handover workflow.

## [0.14.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.14.1] — 2026-09-21

- Session checks and Hub ticket redemption show a compact progress screen instead of presenting the company sign-in form again. Retry controls appear only when sign-in needs attention.
- Use the corrected shared JSON sanitizer: large external responses no longer build a deeply nested text value, and escaped backslash literals remain unchanged.
- A paid, invoiced and prepared device can be handed over even when dealroom invoice receipt is unconfirmed or its link has expired/revoked. Buyer receipt stays a separate, explicit assertion; IT never records it on the buyer’s behalf. Payment, archived invoice, preparation, ABM and active offboarding checks remain required.
- Hand-over names missing preparation steps and checks administration before looking up a sale.

## [0.14.0] — 2026-09-18

- Added the Hub-only Operations summary, limited to an active centrally assigned app admin and a fresh directory. It returns numeric counts without personal records, free text or credentials. Existing data and role assignments are preserved.
- Counts every hardware type; open handovers and received devices in preparation stay out of available stock, and paid sales remain open until handover.

## [0.13.0] — 2026-09-18

- Hardware offboarding now retains custody until a confirmed return, physical handover, completed sale or documented exception. Returns enter preparation before stock; each device has a responsible admin, due date and linked Desk case.
- Desk confirmation automatically captures all assigned hardware types. Actions recheck the current case through Hub; reactivation and pending reviews pause outstanding work. CSV/MDM updates cannot overwrite tracked custody.
- Existing former-colleague sales can continue through a private dealroom. Unissued offers require fresh acceptance; issued invoices and archived documents stay unchanged. External sales retain the offboarding person association.
- Added an admin-only Offboarding filter. Retired generic Hub reassignment for physical devices; new offboarding notes are excluded from employee device histories.

## [0.12.1] — 2026-09-18

- Hide the device overview's Scan a device shortcut from employees. Only Hub-authorized
  Assets admins see it, matching the existing scan route and backend permissions.

## [0.12.0] — 2026-09-17

- Added Hub-brokered, permission-checked support summaries for every assigned hardware kind, previous assignments and employee sales. Private notes, buyer addresses, invoices and device credentials are excluded.

## [0.11.1] — 2026-09-17

- Shared company sign-in screen and progress states match the Hub across all six tools. Session checks and ticket redemption lock the continue button; failures allow an explicit retry.
- New ticket attempts clear any previous local session before redemption, so a rejected ticket cannot reopen a different account’s old session. Deep links and public access routes are preserved.

## [0.11.0] — 2026-09-17

- App roles now come exclusively from Hub permissions. Removed local admin claims, email lists and role-group settings; deprecated mutation APIs refuse changes. Active Hub owners/admins and Hub-assigned app admins have full app access. Employees keep their own and explicitly shared content; Watch requires an explicit viewer/admin assignment by default. The existing 60-second directory lease bounds revocation.
- Configure the central policy in Hub before upgrading this app; an absent or incompatible policy denies sign-in. Historical local role settings are retained only for migration inspection.

## [0.10.0] — 2026-09-17

### Changed
- A shared visual language with the buyer dealroom: warm paper, forest green, quieter cards, readable controls and responsive layouts. The device register is the default landing page; scan/update stays one tap away.
- Sales now follow Offer → Invoice → Paid → Complete, with Cancelled separate. Counts cover the full register, while rows are paginated in batches of 100. Each row names the next task; email, postal address, terms and invoice snapshots are excluded from the overview response.
- Payment and physical hand-over are separate for colleague and external sales. Preparation is checked before hand-over, not before issuing a colleague invoice. Issuing an invoice no longer marks a device sold. Completion requires payment, the archived invoice, saved wipe/MDM checks, ABM release confirmation if listed, and dealroom receipt where applicable.
- Historical paid sales without a recorded hand-over remain in Paid for review; no delivery dates are invented. A newer active sale prevents completing an older sale for that device.
- Sale details prioritise the next task; buyer contact, terms, editing, document hashes and finished buyer activity are disclosed on demand. Settings are grouped into General, Connections, Sales & billing, Data & privacy and Maintenance. Help is organised by topic.

### Added
- An administrator-only, read-only Kandji / Iru unlock PIN lookup during device preparation. The PIN is not saved in application records or logs; the UI clears it after 30 seconds, when hidden, on navigation or sign-out. Access and the device connection are rechecked after the HTTPS response. Lookup errors never echo the provider body.
- A practical wipe and release guide distinguishes the physical device, MDM enrolment, the provider's inventory record, ABM and Activation Lock. Assets does not send destructive MDM commands.
- Data & privacy explains current retention honestly: archiving, cancellation and link revocation do not delete personal data; automatic retention/deletion is not implemented. See `UX-REVIEW.md` for the proposed follow-up.

### Validation
- Frontend role/route, billing, PDF, dealroom and PIN display regressions; PocketIC access, sales lifecycle, PIN/outcall and pagination regressions; populated upgrade from deployed 0.9.0; stable compatibility against the committed baseline.
- Local design preview: `node assets/tools/preview.mjs` from the repository root, then serve `.assets-preview` on localhost. Its fictional fixture is not part of the deployed frontend.

## [0.9.0] — 2026-09-08

### Added
- Private external sale dealrooms: a 256-bit magic link opens exactly one offer without a Hub account. Admins create, replace or revoke links; each expires after 14 days. Only the hash is stored. Changed buyer, price, device identity or billing terms require a new link.
- Buyers review the offer and terms, complete their billing address and accept. The canister allocates the invoice number and archives its PDF atomically; retries return the existing invoice. The invoice freezes seller, buyer, price, terms and payment data. PDFs include complete terms, pagination and a Swiss QR-bill using a normal CH/LI IBAN with SCOR.
- Buyers download the archived invoice and explicitly confirm receipt. IT receives acceptance, decline and completion notifications through the Hub (and its configured Slack delivery). Failed Hub delivery remains in a persistent outbox and retries automatically. The private buyer key never appears in IT notifications.
- IT sees dealroom activity on the sale, confirms actual payment, records wipe/MDM removal and ABM release when applicable, then records hand-over. New dealroom sales reserve the device until hand-over; issuing the invoice alone does not mark it sold.
- An unaccepted offer can be declined and is cancelled without an invoice. An issued invoice requires IT cancellation with a credit note. Existing paper acceptances and archived PDFs remain intact and can be made available in a dealroom.

### Fixed
- Reject QR-IBANs for SCOR invoices; these require a normal IBAN. Respect the combined 140-character limit for QR payment messages and billing information. Corrected the earlier installation instructions.
- Buyer/address, description and VAT changes reset acceptance and invalidate active external links. Country codes must contain two letters.
- Automatic PDF generation refuses unsupported text or an address layout that cannot fit, before acceptance or an invoice number is committed, instead of silently changing or clipping invoice content.

## [0.8.6] — 2026-09-08

### Added
- The configured App address is the canonical frontend origin. Links to an old canister address move to the custom domain while retaining the device/offer route, so an old Slack link still reaches its offer after Hub sign-in. URL tickets, query strings and browser sessions are never forwarded across origins.
- Custom-domain installation guidance, including DNS, certificate registration, Hub tile and App address, plus preservation of the domain ownership file during updates.

## [0.8.5] — 2026-09-08

### Fixed
- Offer and invoice notifications link directly to the buyer's record (`#/offers/<sale-id>`), including in Slack. Opening that link shows its price, terms, acceptance and later invoice in one place; an expired session goes through Hub sign-in and returns to the same offer. A rejected login stays on the sign-in page instead of looping.
- The detail page uses the buyer-scoped offers API. A wrong account sees an unavailable message; accepting or declining keeps the selected record open.
- Notification links tolerate a trailing slash in the configured app address. Settings now explains when a missing address would leave notifications without a link. Existing Slack messages are unchanged.

## [0.8.4] — 2026-09-07

### Fixed
- **Notifications never reached the bell.** The app asked the hub for the notify lane only as a *want*; the kitchen grants *needs*, so every `hub_notify` (hand-over, offer, invoice) was refused with "no notify lane" — and the app ignored the answer. `notify` is now a *need* (the kitchen grants it on the next update; on the hub it is Apps → this app → What it may know → notifications), and every delivery is recorded: the offer/invoice result says "… could NOT be notified: <what the hub said>", the admin log gets a line, and Settings → **Notifications** shows the last attempt with the fix. New query `notifyStatus`.

## [0.8.3] — 2026-09-07

### Added
- **Release backlog.** A device that is sold, scrapped or lost in the register but still listed by Apple Business Manager would push its new owner into the company's device management at setup. The Apple page has a filter *Sold — release in ABM* for exactly these; the sale page shows *still in ABM · <connection · service>* and, once paid, "now release the device in Apple Business Manager"; the device card flags it too. Releasing is a click in Apple Business Manager (the app never writes there); after the next sync the badge is gone. `SaleView.stillInAbm`, `listAbmDevices` filter `sold`.

## [0.8.2] — 2026-09-07

### Fixed
- **Sync and Test no longer exceed the instruction limit.** Measured after 0.8.1 still failed with IC0522: `mo:json`'s parser is quadratic in the body size — 50 of Apple's pretty-printed devices (81 KB) take ~0.7 s of Wasm time, 100 (161 KB) 2.7 s, 200 (323 KB) 12.7 s ≈ 30 B instructions. Apple pages are now 50 devices with a sparse fieldset (`fields[orgDevices]=serialNumber,…`; retried plainly once if Apple rejects it), device lists per device-management service 500 ids; Iru pages 100 instead of 300 and Intune `$top=100` instead of 500 for the same reason (a tenant with more than ~150 devices would have failed the same way).
- Correction to 0.8.1's note: the IC0522 of 0.8.0 was this JSON parse, not the ES256 signature. Browser-side signing stays — it keeps the key off the canister, which is the better design regardless.

## [0.8.1] — 2026-09-07

### Changed
- **The Apple private key never leaves the browser.** 0.8.0 signed the ES256 client assertion inside the canister and hit the network's 40-billion-instruction limit on the first live call (IC0522; Motoko big-number ECDSA is far too slow). Now the browser signs one assertion with WebCrypto when you add or renew the connection — 180 days, Apple's maximum — and only that assertion is stored; it is checked (ES256, key id, client id, audience, expiry, ≤ 180 days) and traded for one-hour tokens. Keys stored by 0.8.0 are wiped on upgrade; open Edit and drop the .pem once more. The Settings card shows *signed until …* and warns two weeks before renewal is due; `addAbm`/`updateAbm` take `assertion` instead of `pem`; `listAbm` shows `signedUntil` instead of `keySet`. `mo:ecdsa` is no longer a dependency.
- Settings: Test, Sync now, Add and the Apple page now show the network's error when a call is rejected instead of staying on "signing in…".
- `assets/tools/abm-probe.mjs`: a terminal probe that does the same calls with Apple's full answers — for when the status line is not enough.

### Verified live (2026-09-07)
- Apple's API account role **Read Only answers 403 ("The API key in use does not allow this request") to every read**; a role that includes device management works. `limit=200` per page and cursor pagination behave as implemented; one organisation lists every device-management service, Apple Configurator included.

## [0.8.0] — 2026-09-07

### Added
- **Apple Business Manager (and Apple School Manager).** Settings → *Apple Business Manager*: connect Apple's own register of what the company bought — client id, key id and the private key (.pem, dropped onto the page; stored write-only as the raw P-256 scalar). The canister signs its own ES256 client assertions (five minutes each), fetches a one-hour token and reads two lists every six hours or on demand: the organisation's devices (`/v1/orgDevices` — serial, model, capacity, colour, order date and number, purchase source, added-to-org date) and which device-management service holds which serial (`/v1/mdmServers` + their device lists). Several connections (organisations) at once; `SCHOOLAPI.` client ids use the school endpoints. Nothing is ever written to Apple; create the API account there with the smallest role.
- New page **Apple**: every device Apple knows, joined with the register by serial — filters *Not in the register*, *No device management*, *In the register*, per connection. *Add* / *Add all* take devices into the register as **unknown** (Apple, model + capacity, kind from the product family, the order details in the history) until someone records the hand-over; as soon as an MDM sees such a device, the MDM sync links it by serial and records the hand-over as before. Devices released from Apple's register disappear from the list; devices already in the register stay.
- Device card: an *Apple Business Manager* box — which service holds it (or none), model/capacity/colour, ordered when/how, in Apple's register since.
- New methods `listAbm`, `addAbm`, `updateAbm`, `removeAbm`, `testAbm`, `syncAbm`, `listAbmDevices`, `abmAdopt`; `getAsset` carries `abm`.

## [0.7.0] — 2026-09-07

### Added
- **Selling devices.** On a device: what the company paid (price, date), a rule that proposes today's selling price (linear write-down over N months, a floor as a share of the purchase price, a minimum), and *Sell this device…* — to a colleague from the directory or an outside buyer with a postal address.
- **The offer and the buyer's signature.** A sale goes draft → offered → accepted → issued → paid. A colleague sees the offer under *Offers & invoices*, reads the hand-over terms, adds their postal address (kept on the invoice only, never in the directory) and accepts with their own sign-in — that acceptance is printed on page 2 of the invoice; nobody can accept for them. For an outside buyer staff record the signed paper copy. A changed terms text bumps its version and open offers must be accepted again.
- **The invoice.** Issuing needs the acceptance, both checks (wiped · removed from the MDM) and complete billing settings. It takes the next number of a gapless range (drafts never use one), derives an ISO 11649 SCOR reference from it, splits the gross price into net and VAT (half-up), marks the device sold and notifies the buyer. The PDF is rendered in the browser: page 1 the invoice with the **Swiss QR-bill** payment part (SIX Implementation Guidelines v2.3 — receipt 62 mm + payment part 148 mm, Swiss QR Code 46 mm with the Swiss cross, structured addresses, SCOR, Swico billing information), page 2 the terms and the acceptance. It is archived exactly as rendered (sha256 on the record, never replaced) and downloadable by admins and the buyer only.
- **Cancel, credit note, paid, export.** Cancelling before issue just ends the sale; after issue it takes a numbered credit note out of the same range and puts the device back in stock (unless paid). *Paid* is a note from finance's statement; reconciliation stays with finance. Sales → *Export for finance* lists invoices and credit notes with net/VAT/gross, reference and the PDF hash.
- Settings → *Selling devices — invoice settings*: company as creditor, UID, VAT, IBAN (CH/LI, mod-97 checked), currency (CHF/EUR), number prefix and year, payment terms, payment-part language (en/de/fr/it), price rule, hand-over terms, closing line.
- Vendored, unmodified: pdf-lib 1.17.1 and qrcode-generator 1.4.4 (`dist/vendor/`, MIT); `tools/bundle-vendor.sh` refreshes them.

### Notes
- New dependency `sha2` (document hashes). No change to existing stable state; sales, purchases and documents live in new tables.
- The event kind `sale` joins the history of a device.

## [0.6.1] — 2026-09-06

### Fixed
- `hub_upsert` uses the SDK's `upsertRows` (SDK 0.4): a re-issued address parks the previous holder and ends their sessions instead of writing the id table by hand (audit DK-01 class).

## [0.6.0] — 2026-09-06

### Changed
- **People are ids.** Assignee, creator, event and photo authors and the person a device was handed to now store the hub's stable person id (`p_…`) instead of the address (hub ≥ 0.17, SDK 0.3). A colleague's address can change or be re-issued; their devices stay theirs and never appear with the address's next holder. Rows and the device page carry `assigneeEmail`/`createdByName`, events arrive display-resolved (names, not ids), `whoami` carries `id`. Pickers, CSV import, MDM user e-mails and the hub's offboarding calls keep speaking addresses; the register resolves them.
- `trust_serialOwners` now hands the trust app **(serial, person id)** — update trust to ≥ 0.2.0 in the same session.
- **One-time migration** right after this upgrade: stored addresses are rewritten to ids via the hub; addresses the hub never knew become `legacy:<address>` and still render. Writes answer "people ids are being migrated — try again in a minute" for the few seconds it takes. Requires hub 0.17 first.

## [0.5.0] — 2026-09-06

### Added
- **Device trust knows who has what.** Settings → *Device trust*: allow the trust app (its backend canister id) to read the list of serial → person. `trust_serialOwners` answers only that caller and records when it last read; the card shows it. Nothing else leaves the register.

## [0.4.0] — 2026-09-05

- Use native keyboard-accessible controls for device-list navigation.

- Correct setup/offboarding help and privacy statements; keep device names readable beside status details on narrow screens.

- Enforce a complete-directory authorization lease below 60 seconds with 30-second refresh and fail-closed outage behavior.
- Revoke absent/inactive people, discard stale directory replies and recheck sign-in after external calls; clear old Hub sessions on reconfiguration.
- Require Hub owner/admin authority for app bootstrap; correct copied installation instructions and portable SDK lock resolution.

## [0.3.0] — 2026-09-04

### Changed
- **The shared topbar.** assets no longer has a header of its own: it mounts the suite's `mountTopbar` from `hub-client.js` — brand (company logo from the hub), app name, Menu ▾ (your apps), the bell (the same inbox as on the hub's menu, unread count every 30 s), theme, person ▾. `loginWithTicket` passes the hub's `suiteToken` through for it. Same top in every app, so switching never changes it.

## [0.2.0] — 2026-09-04

### Added
- **Device management (MDM)** under Settings: connect **Iru (formerly Kandji)**, **Jamf Pro** (API client, computers and mobile devices) or **Microsoft Intune** (Graph, application permission `DeviceManagementManagedDevices.Read.All`). Test reads one page; Sync now — and a timer every six hours — pulls every device: unknown serials become new devices (assigned to the MDM's user when that person is in the hub directory), known devices get vendor, model, tag and kind filled where empty, and a person is assigned only where the register has nobody. Where the register and the MDM disagree — another person, or a device the register calls sold, scrapped or lost — nothing is changed and a **mismatch** is shown on the list and the device page with what to do. Secrets are write-only; pause/resume per connection.
- Devices list shows which MDM sees a device; the device page shows what the MDM last said (name, OS, last seen, logged-in user, compliance).

### Changed
- The AI status says precisely what is missing: no key in the hub, or key present but the **AI lane** not granted to this app — with a link straight to the app's panel in the hub (`hub_aiStatus`). Only the reading step is affected either way.


## [0.1.0] — 2026-09-04

### Added
- First release: device register with append-only history and photos; **photo intake** (camera-first, the hub's AI reads stickers and serials, fuzzy match with confusable-character folding, two-tap create, what-happened chips with the hub directory as person picker, photo kept as evidence); devices list with status counts and search; device page with history, photos, edit, actions, archive; CSV import/export; settings (admins group, named admins, AI status from the hub, sample register, admin log); hub contract incl. `hub_ownedObjects` / `hub_reassign` for offboarding; notification to the person on hand-over.
