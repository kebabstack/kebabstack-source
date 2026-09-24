# Changelog — kebab-stack assets

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
