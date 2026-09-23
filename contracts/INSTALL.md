# Install contracts next to your hub

**Permission model update:** requires Hub 0.23.0 or later. Before upgrading an existing app, save its policy under Hub → Permissions. After upgrading, check app enforcement there. Missing policies deny protected sign-in. Review [the central permission model and rollout](../docs/APP-PERMISSIONS.md), especially broader Admin content access in Forms and Contracts.


The easy way: Hub → **Kitchen** → install **Contracts**. The kitchen deploys both canisters,
patches the placeholders, runs `setHub`, connects the app to the hub and puts it on the menu.
Then continue at step 4.

By hand, the same as the other apps (`../assets/INSTALL.md` has the long form):

## 1 · Deploy (two phases)

```bash
cd contracts
mops install --locked
icp deploy -e ic --subnet <SUBNET-ID>
```

Note both canister ids. In `dist/app.js` replace `__BACKEND_CANISTER_ID__` with the contracts
**backend** id and `__HUB_URL__` with your hub **frontend** URL, verify
(`grep -c '__BACKEND_CANISTER_ID__\|__HUB_URL__' dist/app.js` prints 0), deploy again.

## 2 · Wire contracts to the hub (CLI, once)

```bash
icp canister call backend setHub '("<HUB-BACKEND-CANISTER-ID>")' -e ic
```

## 3 · Register contracts in the hub

Hub → **Apps** → 🍢 **Connect an app**: paste the contracts **backend** canister id → the hub
reads the manifest (needs identity, notify; would like roles, groups, ai, avatars) → tile URL
`https://<contracts-frontend>.icp.net/` (App, SSO ticket) → Connect. For proposals from mail, a hub
**owner** grants the `ai` lane in the app's Lanes editor (Settings → AI must hold a key).

## 4 · First run

- Open **Settings → AI connection** to check Hub registration, the AI lane, key availability and
  the provider/model. **Refresh connection** fetches configuration without calling the model.
  A Contracts administrator can choose **Test AI connection** for one neutral JSON example:
  no document content is sent, and it uses one request from the daily budget. Tests are limited
  to one per minute. A successful configuration check alone does not prove the model works.
  Model test results reset on restart or configuration changes. Failed documents keep their
  original; after correcting configuration, use Inbox details → Filing → **Read again with AI**.
- A Hub owner/admin sets the organisation name, **this app’s URL**, timezone offset and reminder
  defaults under **Settings → Inspect connection → Settings**. Grant `notify` for reminders and optional `ai` for
  extraction. These settings do not grant access to personal or team contents.
- Each user starts in **Personal**. Create a Teamspace and add colleagues under **Members & settings**.
  Owner/editor/viewer roles are assigned here, not via the Hub’s IT groups. Keep two team owners.
- Select the intended space before creating/importing records or uploading documents. Any team
  member can read its unfiled inbox; use Personal or a separate teamspace for confidential intake.
- Upload a PDF or `.eml`, review proposals with evidence, confirm terms, then assign responsibility.
  Choose “no payment” / “no fixed expiry” only where the agreement explicitly supports it.

## SaaS setup (0.7.0)

- In Hub, grant Contracts `identity`, `roles`, `groups`, `notify`, and optional `ai` lanes.
  Check the existing Hub Slack bot connection and enable Slack DMs for the intended recipients.
- In Contracts, set the public app URL under **Settings → Inspect connection → Settings**.
  An unset app URL prevents renewal scheduling, so queued warnings never contain empty links.
- In each teamspace, **Settings → Renewal reminders** configures its policy. Defaults are
  90/60/30/7 days; 90 must remain included. Recipients still require contract access. App admins can access every workspace; ordinary recipients need explicit membership.
- Upload and review a subscription, choose an owner, and check **Track as an active subscription**
  before saving. Existing draft records remain drafts until a person activates them.
- Assign Hub groups on a contract's **People & licenses** tab. Only active people/groups from
  the connector's directory are available. License assignment does not create vendor accounts.
- Public vendor terms checks use the same Hub AI credentials and budget. They also make a
  bounded public HTTPS GET. No new search API or secret is required. Supply a direct public
  terms URL if automatic discovery or page reading fails.

### Upgrade from 0.6.3

Use an upgrade, never reinstall. New side tables preserve the deployed Contract/Terms shapes.
Save baseline Wasm, DID, stable signature and snapshots first. Verify stable compatibility and
run the populated upgrade test using `KEBAB_CONTRACTS_SAAS_BASELINE_DIR` with those artifacts.
Publish the complete frontend directory, including `saas-workspace.js`, `saas-metrics.js`,
`saas.css`, `vendor-terms.js` and `license-assignment.js`, with the generated IDL.
The release starts recording price changes; it cannot recover undocumented historical prices.
Keys are excluded from normal data exports and need a canister snapshot for full recovery.
A return to older code cannot expose the new key fields through its old interface; preserve the
candidate state and test rollback compatibility before attempting a downgrade.

## 5 · Optional mail routing

Follow [relay/RUNBOOK.md](relay/RUNBOOK.md). The operator trusts the relay principal in **Settings → Inspect connection → Relay**; the space owner then connects that same principal under **Members & settings → Mail intake**.
Use a separate identity per space. A trusted but unbound identity cannot submit mail. A bound relay
cannot read records or choose another destination from an email header. Archived spaces reject intake.
Personal-space relay binding is available through `setSpaceRelay`; the browser relay panel is for teams.

## Upgrading 0.2.x to 0.3.0

This release keeps the existing Candid interface and stable data layout. Upgrade the existing
backend and publish the complete frontend directory, including `experience.css` and
`contract-mark.svg`. Keep the deployed Hub URL, app URL, canister IDs and workspace memberships.
The new favicon can also be used as the Contracts tile icon in Hub; an already-uploaded tile
icon does not change just because the app's favicon changed.

Rejecting a proposal now records the decision without creating an empty contract. An unfiled
source stays in review so an editor can choose **Filing → Create a contract** or link it to an
existing record. No automatic cleanup of previously created drafts is performed.

No relay configuration is added by this update. Since 0.5.0 original PDFs and images use native
provider vision. Configure a vision-capable model in Hub → AI; a separate vision model is optional.
Employees need personal ownership or team membership. App admins can access all workspaces.

## Historical upgrade: 0.1.0 to 0.2.0

The frozen administrator/editor access described below applied through 0.7.x. In 0.8.0 central Hub permissions supersede it; retained local lists grant no rights.

1. Preserve the existing canister IDs and take the normal operator backup/snapshot before upgrading.
2. Build with the pinned compiler. Before replacing `backend/backend.most`, run
   `moc --stable-compatible COMMITTED_BASELINE.most backend/dist/backend.most`.
3. Run the Contracts security tests and the real old-to-new upgrade regression. Set
   `KEBAB_CONTRACTS_BASELINE_DIR` to the directory containing the previous release’s `backend.wasm`
   and `backend.did`. Run from the repository root:

   ```sh
   node --test --test-name-pattern='^contracts:' tests/security.test.mjs
   NODE_PATH="$PWD/node_modules" bash contracts/test/run-smoke.sh
   ```

   PocketIC must be installed. The fixtures model the Cloud Engine’s free cost schedule.
4. Upgrade the backend in place, deploy the matching frontend, and reopen from the Hub. Do not reinstall.
   In-memory workspace views are recreated from the existing session; records and memberships persist.
5. Existing records appear under **Existing contracts**, with the previous admin/editor person IDs
   captured once and explicit responsibility/viewers preserved. Later Hub promotions confer no access.
6. Before resuming relay deliveries, open **Existing contracts** as a captured owner and call
   `setSpaceRelay(scopedToken, relayPrincipal, true)`, or create the destination Teamspace, move its
   records explicitly and bind the relay there. The legacy binding step uses the API; teamspaces
   have a browser panel. Unbound deliveries are refused, so test the relay retry/failure handling.
7. If distributing via Kitchen, regenerate the pantry from the committed release with
   `python3 kitchen/tools/pack-recipes.py --build` and deploy Kitchen separately. The recipe version
   comes from `contracts/mops.toml`; do not publish a new frontend with an older backend recipe.

## Operational limits

- Files require a current authorized session. Maximum 1.5 MB per file, 10 per message, 400 MB total.
  Browser text PDFs are read locally (50 pages / 60,000 characters); scans/images are manual review.
- AI uses the Hub’s configured provider and key. Source text and authorized candidate context leave
  the canister for that provider. Workspace separation is not end-to-end encryption against controllers.
- Reminders use the Hub outbox with retries. Set the frontend URL and grant `notify`; diagnostics
  show only the current space’s accessible sources and notifications.
- CSV/JSON exports are scoped to the selected space and current permissions. Document bytes are
  downloaded separately. This JSON is not a complete instance backup or automatic restore format.
- Hub offboarding sees generic references to eligible team contracts, without contract titles.
  Reassignment is limited to people who already have access. Personal records are not handed over.
- Deactivating the only team owner can strand management access. Appoint another owner first.

## Email intake setup

Use **Guide → Mail setup** in the app or [relay/RUNBOOK.md](relay/RUNBOOK.md). A shared mailbox
lands in the built-in **Contract intake** after its relay is bound there. Only current Hub
admins and owners, and Contracts Admins assigned in Hub, can review this inbox. A different team destination
requires its own explicitly bound relay. Email cannot route itself into private spaces based
on a subject or sender. Both global relay trust and workspace-owner binding are required.
Retain a Google copy and configure an independent recovery address before real deliveries.

The 0.4.0 upgrade adds a receipt namespace for document moves. Existing data stays in place;
receipts are captured when an existing source next moves. It does not reconstruct the original
inbox for documents moved by earlier releases. The common intake is virtual and follows Hub
roles; it does not silently move or share legacy or private content.

## Upgrading 0.6.1 to 0.6.2

Upgrade the existing backend and publish `intake-review.js` and the served changelog. No Hub
key or model change is required. Stable records and Candid stay compatible. Existing queued
jobs retain their state; an already exhausted item can be restarted with **Read again with AI**.
The new three-attempt cap applies to unfinished extraction jobs too. `AI_TIMEOUT` identifies a
hosting HTTP deadline; increasing the browser wait is not a remedy. Check **Workspace tools →
AI** for provider access and **Status** for the last safe error and next attempt. A neutral
connection test does not prove that a full document will complete within the hosting deadline.

## Upgrading 0.6.2 to 0.6.3

Upgrade the backend and served changelog. Money naming changes are internal to the AI request;
public Candid and stable data are unchanged. Existing confirmed contracts are not rewritten.
Re-read an earlier unconfirmed suggestion to obtain the new decimal-money extraction.

## Upgrade from 0.7.0 to 0.7.1

Upgrade the backend normally and publish the matching frontend assets, generated bindings and
Kitchen recipe. Candid adds `deletePermanently`; existing calls and stable state remain compatible. Existing pending review requests are checked against
the current document/proposal state when the outbox timer runs; obsolete ones are discarded,
and actionable ones use the corrected wording. Messages already handed to Hub or Slack are
not recalled. No connector reconfiguration is needed.

## Operations rollout

Publish with Hub 0.28 and the matching source releases through the tested suite update service. No new roles, directory lanes or Lunch changes are required. Existing records remain in place. See [Operations rollout and verification](../docs/HUB-OPERATIONS.md#release-and-verification).
