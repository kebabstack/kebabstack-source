# Install assets next to your hub

**Permission model update:** requires Hub 0.23.0 or later. Before upgrading an existing app, save its policy under Hub → Permissions. After upgrading, check app enforcement there. Missing policies deny protected sign-in. Review [the central permission model and rollout](../docs/APP-PERMISSIONS.md), especially broader Admin content access in Forms and Contracts.


Prerequisite: a running kebab-stack hub (`../hub`, see `docs/INSTALL.md`)
and the same `icp` / `mops` setup. Same engine or a different one — assets
talks to the hub canister-to-canister either way.

> First run `npm ci` at the repo root and add its `node_modules/.bin` to PATH
> as in [the main install guide](../docs/INSTALL.md). Build in a separate checkout.

## 1 · Deploy (two phases)

```bash
cd assets
mops install --locked
icp deploy -e ic --subnet <SUBNET-ID>
```

Note both canister ids from the output. Then in `dist/app.js`:

- `__BACKEND_CANISTER_ID__` → assets **backend** canister id; replace it in **both `dist/app.js` and `dist/deal.js`**
- `__HUB_URL__` → your hub **frontend** URL (e.g. `https://<hub-frontend>.icp.net`)

Verify (`grep -c '__BACKEND_CANISTER_ID__\|__HUB_URL__' dist/app.js dist/deal.js` must print 0 for both files), then deploy again:

```bash
icp deploy -e ic --subnet <SUBNET-ID>
```

## 2 · Wire assets to the hub (CLI, once)

```bash
icp canister call backend setHub '("<HUB-BACKEND-CANISTER-ID>")' -e ic
```

`setHub` configures the Hub and clears old authorization caches. Local admin bootstrap methods are retired.

## 3 · Register assets in the hub

Hub → **Apps** → 🍢 **Connect an app**: paste the assets **backend** canister
id → the hub reads assets's manifest (needs identity, profile, groups, roles,
notify; would like avatars, push) → keep or widen the lanes → who may use
it (everyone, or e.g. a group) → tile URL `https://<assets-frontend>.icp.net/`
(App, SSO ticket) → Connect.

Now the hub pushes deactivations to assets and assets may read the directory.
Trigger the first pull: assets → Settings → **Sync directory now**
(or wait up to 30 seconds).

**Lanes.** The app *needs* identity, profile, roles and — since 0.8.4 — notifications (hand-overs,
offers and invoices reach people through the hub's bell); it *wants* the AI lane and groups. The
kitchen grants the needs at install and re-grants new ones on update; on a hub that was connected by
hand, put them on the skewer under Apps → assets → *What it may know*. Settings → General → **Notifications**
shows whether the last one got through and what to do if not.

## 4 · Configure Hub permissions

Open Hub → **Permissions**, select this app and review the effective roles. Active Hub owners/admins inherit Admin. Assign app admins and any specialist roles here; save the policy, then **Check app enforcement**. Employee access is own/shared content; Watch defaults to No access. There are no app-local administrator settings.

## 5 · Finish

- assets → Settings → General → **Who runs the register**: company name, **App address**
  (this Assets frontend's HTTPS URL for notification links), tag prefix.
- Optional: Hub Settings → AI — any OpenAI-compatible chat endpoint or Anthropic.
- Evaluation instance: Settings → Maintenance → **Seed demo data**.

Open the hub portal → tile **assets** → you land signed in.

**Links from Slack and the Hub bell.** Set **Settings → General → Who runs the register → App address** to
this Assets frontend's HTTPS URL (not the Hub or backend URL). New offer and invoice
notifications then open `/#/offers/<sale-id>` directly. The buyer sees just that offer,
its terms and, once issued, its invoice. If their Assets session has expired, the Hub
signs them in and returns to the same offer; use the account that received it.
Only the buyer can accept. Slack DMs also require the Hub's Slack integration and
the recipient's notification preference. Old Slack messages are not rewritten.

### Custom domain

1. Follow the [ICP custom-domain setup](https://skills.internetcomputer.org/.well-known/skills/custom-domains/SKILL.md): DNS-only CNAMEs for the domain and ACME challenge, one canister-ID TXT record, the frontend's `/.well-known/ic-domains` file, validation and registration. Wait for verified HTTPS before switching the app's address.
2. Update the existing Assets tile URL in the Hub, preserving its ID and connector. Set Assets → Settings → General → Who runs the register → **App address** to the same HTTPS origin, e.g. `https://assets.example.com/` (no path, query or fragment).
3. Assets 0.8.6 redirects the old origin to this configured address, retaining device/offer routes. Browser sessions and URL tickets are not transferred: the Hub signs the person in on the new origin. This app uses Hub identity, so its people and sales do not change when its frontend domain changes. The Hub's own Internet Identity origin stays unchanged.
4. Keep the API host separate from the frontend URL. Do not replace `IC_HOST` with the custom domain.
5. Keep `/.well-known/ic-domains` in each deployment. Kitchen preserves installation-specific `/.well-known/` assets. For a manual legacy asset-canister sync, include the file in the deployment directory and add `{ "match": ".well-known", "ignore": false }` to its `.ic-assets.json5`. Domain ownership files belong to an installation, not the shared Kitchen recipe.

Test a current offer through the custom URL and an old canister URL, including a new Hub login. Changing the domain does not resend old Slack messages.

## 6 · Selling devices (optional, agree with finance first)

Settings → Sales & billing → **Invoice settings**: legal name and structured address of the company
as creditor, UID, whether VAT applies and the rate, a **CH/LI IBAN** (a normal one is enough — the
payment reference is a SCOR reference derived from the invoice number; a QR-IBAN cannot be used with SCOR), the
number prefix and whether the year is part of the number (`IT-2026-0001`), payment terms, the
payment-part language, the price rule (write-down months, floor, minimum) and the hand-over terms
the buyer accepts online (page 2 of every invoice; changing the text bumps its version).

Agree three things with finance before the first invoice: the **number range** (it must not collide
with theirs — every issued invoice and credit note goes to them via Sales → *Export for finance*),
the **VAT treatment** of used-equipment sales, and the **price rule** (selling below fair value to an
employee can count as pay in kind — that is an HR/finance decision, the app only records it).
Invoices are business records: they stay in the register (no trash), the buyer's postal address remains in the sale record and
on the archived invoice, and the PDF archived is the one handed out (hash on the record).

Colleague invoices and historical manual invoices use the browser's vendored `pdf-lib` and
`qrcode-generator` (MIT). New external dealroom invoices are generated and archived by the
Motoko canister in the same update as acceptance. No external PDF service receives buyer data.
The QR implementation derives from the vendored MIT encoder; attribution is in `backend/lib/Qr-NOTICE.txt`.
The backend PDF supports WinAnsi Latin text and common typographic punctuation. Unsupported
characters or an address too long for the payment layout produce a clear failure without
accepting the offer or consuming a number. Complete terms paginate; they are never cut off.

### External buyers: private dealroom

1. In the device's sale, enter the outside buyer's name, email and agreed price. Their address
   can be completed by the buyer. Set **Settings → General → Who runs the register → App address** to the
   Assets HTTPS origin. Finish **Settings → Sales & billing** before creating the link.
2. **Create private link**, copy it immediately and send it to that buyer through your usual
   channel. Assets does not email it automatically. One link grants access to this sale only;
   anyone holding it can respond as the buyer. It is not identity verification or a qualified
   electronic signature. No Hub sign-in is required.
3. The buyer checks the offer, fills in their address, explicitly accepts the terms and gets an
   automatically issued invoice. The invoice number, accepted offer and PDF are committed
   together. Repeating the action cannot create another invoice. The seller need not be online.
4. The buyer downloads the PDF, then explicitly confirms receipt. The history distinguishes
   opening the room, requesting a download, and confirming receipt. Requesting bytes does not
   prove that a file was opened or saved. Acceptance, decline and completion notify the admin
   who created the link, through the Hub and its configured Slack DM delivery. The buyer's
   email is a contact field; no message is sent to it by this flow.
5. IT checks the bank/payment record and **marks paid**. Save the wipe/MDM checks, release the
   device in ABM if necessary, then **Record hand-over**. The device is marked sold
   at that final step; until then the sale keeps it reserved, including while paid. Invoice receipt is optional for this step and remains visibly unconfirmed until the buyer confirms it. An expired/revoked link does not block IT from recording actual delivery. ABM/MDM
   changes remain manual — the confirmation is an IT assertion, not an API write to Apple.

An unaccepted offer has **Decline & cancel sale**. Once invoiced, the buyer contacts IT for
cancellation; IT creates the credit note and handles any refund. Existing issued external sales
can get a room for their already-archived PDF and receipt confirmation without changing their
original acceptance or invoice. If an old PDF is missing, staff must archive it first.

Links expire 14 days after creation, can be revoked immediately, and are replaced when a new
one is created. Creating a link returns its random key once; only SHA-256 is stored. The key
travels in the URL fragment, never in the HTTP request or referrer. The standalone page has no
analytics or third-party resources and retains the key only in tab session storage for reload.
Buyer/price/description edits revoke the link; changed device identity or billing configuration
blocks acceptance and needs a replacement link. Issued invoices retain their original snapshot.

The sale's **External dealroom** card shows activity, preparation and hand-over. A pending
notification is shown there and retried every five minutes while the Hub can be reached. Check
Settings → General → Notifications if the Hub rejects delivery; Slack additionally needs the recipient's
Hub Slack settings and the configured relay. Delivery retries are keyed to avoid duplicate Hub
notifications. No private buyer link is included in those notifications.

For manual asset uploads, preserve `.well-known/ic-domains` and include `deal.html`, `deal.js`,
`deal.css` and the generated `idl.js`. Add the following rule to your installation's ignored
`dist/.ic-assets.json5` (merge with its existing rules):

```json
{ "match": "deal.html", "headers": {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive"
} }
```

Kitchen recipes patch `deal.js` alongside `app.js`; the page also refuses to render within
an iframe. During an upgrade, use the version's generated `.did` / `idl.js`, check stable
compatibility against the committed `.most`, and snapshot the existing canisters. Never test
acceptance, cancellation or payment against real production sales.

SCOR/IBAN rule: [SIX QR-bill implementation guidelines, section 4.3.2](https://www.six-group.com/dam/download/banking-services/standardization/qr-bill/ig-qr-bill-v2.3-en.pdf).

## 7 · Apple Business Manager (optional)

In Apple Business Manager (an Organization Administrator): **Preferences → API → Add** creates an
API account. Its **Role Access must include device management** — *Read Only* answers 403 to every
device read, **IT Admin** works (both verified live 2026-09-07); there is no narrower role Apple
offers for reading devices, and the app itself never writes to Apple. Note the **Client ID**
(`BUSINESSAPI.…`), create a key, note its **Key ID** and download the `.pem`. In assets: Settings → Connections →
*Apple Business Manager* → name, client id, key id, drop the `.pem` → *Add connection* → *Test*
(fetches a token, reads the first page) → *Sync now*. The `.pem` never leaves your browser: it signs
one client assertion there (180 days, Apple's maximum) and only that assertion is stored. Before it
ends — the card says *signed until …* and warns two weeks ahead — open *Edit* and drop the `.pem`
again. One connection per Apple organisation (one organisation already lists every device-management
service it feeds). Apple School Manager works the same with a `SCHOOLAPI.` client id.

Selling an Apple device: take it into the register from the Apple page if it is not there yet, sell
it from the device page as usual, and **release it in Apple Business Manager once the invoice is paid**
— the sale page and the Apple filter *Sold — release in ABM* remind you until the next sync sees it
gone. A device left in ABM assigned to your MDM forces the buyer into that MDM at setup.

If *Test* fails and the status line is not enough: `node assets/tools/abm-probe.mjs <client id>
<key id> <key.pem>` does the same calls from your terminal and prints Apple's full answers.

Afterwards the **Apple** page lists what Apple knows next to what the register knows: *Not in the
register* is the gap to close (Add / Add all → devices land as *unknown* with their order details),
*No device management* are devices no MDM holds. The sync repeats every six hours; devices released
from Apple's register disappear from the list, devices already in the register stay.

## Upgrades

Before every backend deploy of a live assets (append-only stable state):

```bash
moc --stable-types $(mops sources) backend/main.mo -o /tmp/assets.wasm
moc --stable-compatible backend/backend.most /tmp/assets.most     # must be silent
icp deploy -e ic --subnet <SUBNET-ID>
cp /tmp/assets.most backend/backend.most
```

Frontend-only changes: `./test/run-smoke.sh` first (jsdom, three roles), then
deploy.


## 8 · Assets 0.10 workflow and PIN lookup

- The Sales phases count sale records (one device per sale). Counts are computed over
  the full register, independent of the 100-row page and search. Search matches device,
  tag, serial, buyer name and invoice number. **Needs action** excludes Complete and Cancelled.
- IT records **Complete** through **Record hand-over**. Paid alone is not proof of delivery.
  This also applies to colleague sales. Existing invoices are unchanged. Historical paid
  sales without a recorded hand-over remain Paid; review them instead of inferring completion.
  The recorded timestamp is the time IT saves the hand-over; describe older hand-overs in
  the optional note. A newer non-cancelled sale blocks completing an older sale for that device.
- The preparation guide explains the order: check locks/codes, wipe and validate setup,
  release ABM/MDM, then remove the MDM record. Wipe command delivery and absence from
  the provider list do not establish that preparation succeeded.
- **Check Kandji / Iru** uses GET `/api/v1/devices/{device_id}/secrets/unlockpin` against
  the configured connection. The existing API token needs the provider's corresponding
  device-secret permission. The app does not grant it. A 401/403 produces a permission
  message; a 404 or empty PIN is not interpreted as an unlocked device. Verify with a
  controlled test Mac after deployment before relying on the integration operationally.
- The lookup is administrator-only and rechecks access and the original MDM association
  after the outcall. A successful access is audited without the PIN. There is no stable
  PIN field, document attachment, buyer API exposure, localStorage or sessionStorage copy.
  A response is visible in the requesting browser and passes through the configured engine;
  this is not end-to-end secret encryption against its infrastructure operators.
- **Settings → Data & privacy** describes the current data lifecycle. There is no automatic
  deletion job. Invoice retention and a deletion policy for operational data must be agreed
  before adding such a job; see `UX-REVIEW.md`.
- Deploy backend and frontend as one compatible release. New frontend files `assets.css`
  and `workflow.js` must be uploaded as well. Preserve installation-specific domains,
  security headers and deployment substitutions as described above. Kitchen automatically
  packages these files and reads the version from `mops.toml`.

### Upgrade to 0.13: hardware offboarding

Upgrade Hub to 0.27, Assets to 0.13 and Desk to 0.14 in one tested suite release. No directory, Lunch or role reconfiguration is needed. Existing custody and invoices are preserved; confirmed open offboardings are discovered by the background sweep. The shipped Reclaim devices task updates automatically; review custom checklist wording if it duplicates hardware tracking. Test a populated upgrade and follow the [operator workflow](../docs/HARDWARE-OFFBOARDING.md).

## Operations rollout

Publish with Hub 0.28 and the matching source releases through the tested suite update service. No new roles, directory lanes or Lunch changes are required. Existing records remain in place. See [Operations rollout and verification](../docs/HUB-OPERATIONS.md#release-and-verification).
