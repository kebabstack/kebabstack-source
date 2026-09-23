# Install desk next to your hub

**Permission model update:** requires Hub 0.31.0 or later. Before upgrading an existing app, save its policy under Hub → Permissions. After upgrading, check app enforcement there. Missing policies deny protected sign-in. Review [the central permission model and rollout](../docs/APP-PERMISSIONS.md), especially broader Admin content access in Forms and Contracts.


Prerequisite: a running kebab-stack hub (`../hub`, see `docs/INSTALL.md`)
and the same `icp` / `mops` setup. Same engine or a different one — desk
talks to the hub canister-to-canister either way.

> First run `npm ci` at the repo root and add its `node_modules/.bin` to PATH
> as in [the main install guide](../docs/INSTALL.md). Build in a separate checkout.

## 1 · Deploy (two phases)

```bash
cd desk
mops install --locked
icp deploy -e ic --subnet <SUBNET-ID>
```

Note both canister ids from the output. Then in `dist/app.js` (and the backend placeholder in `dist/support.js`):

- `__BACKEND_CANISTER_ID__` → desk **backend** canister id
- `__HUB_URL__` → your hub **frontend** URL (e.g. `https://<hub-frontend>.icp.net`)

Verify that neither file contains deployment placeholders, then deploy again:

```bash
icp deploy -e ic --subnet <SUBNET-ID>
```

## 2 · Wire desk to the hub (CLI, once)

```bash
icp canister call backend setHub '("<HUB-BACKEND-CANISTER-ID>")' -e ic
```

`setHub` seeds the default catalog. App roles are defined only in Hub (step 4); legacy local admin setters are inert.

## 3 · Register desk in the hub

Hub → **Apps** → 🍢 **Connect an app**: paste the desk **backend** canister
id → the hub reads desk's manifest (needs identity, profile, groups, roles,
notify; would like avatars, push) → keep or widen the lanes → who may use
it (everyone, or e.g. a group) → tile URL `https://<desk-frontend>.icp.net/`
(App, SSO ticket) → Connect.

Now the hub pushes deactivations to desk and desk may read the directory.
Trigger the first pull: desk → Settings → General → **Sync directory now**
(or wait up to 30 seconds).

## 4 · Configure Hub permissions

Open Hub → **Permissions**, select this app and review the effective roles. Active Hub owners/admins inherit Admin. Assign app admins and any specialist roles here; save the policy, then **Check app enforcement**. Employee access is own/shared content; Watch defaults to No access. There are no app-local administrator settings.

## 5 · Finish

- desk → Settings → General: organization name, **this desk's URL** (deep
  links in notifications), key prefix, auto-close.
- Optional: Settings → AI — any OpenAI-compatible chat endpoint or Anthropic.
- Evaluation instance: Settings → General → **Seed demo data**.

Open the hub portal → tile **desk** → you land signed in.

## Upgrades

Before every backend deploy of a live desk (append-only stable state):

```bash
moc --stable-types $(mops sources) backend/main.mo -o /tmp/desk.wasm
moc --stable-compatible backend/backend.most /tmp/desk.most     # must be silent
icp deploy -e ic --subnet <SUBNET-ID>
cp /tmp/desk.most backend/backend.most
```

Frontend-only changes: `./test/run-smoke.sh` first (jsdom, three roles), then
deploy.

## Custom domain for an existing Desk

Keep the existing canisters and Hub connector. For `desk.example.com`, add:

| Type | Name | Value |
|---|---|---|
| CNAME | `desk` | `desk.example.com.icp1.io` |
| TXT | `_canister-id.desk` | existing Desk frontend canister ID |
| CNAME | `_acme-challenge.desk` | `_acme-challenge.desk.example.com.icp2.io` |

Use **DNS only** for both CNAMEs in Cloudflare. Add the domain followed by a newline to
`dist/.well-known/ic-domains`. Preserve any other domains already listed. With the
current asset-canister recipe, merge `{ "match": ".well-known", "ignore": false }`
into the installation's `dist/.ic-assets.json5`. These installation-specific files
are ignored by Git; preserve them on subsequent manual uploads.

Publish the ownership file to the existing frontend, validate with
`GET https://icp.net/custom-domains/v1/desk.example.com/validate`, register with
`POST https://icp.net/custom-domains/v1/desk.example.com`, then check registration
and HTTPS before switching application URLs.

In Desk **Settings → General**, set **This desk's URL** to
`https://desk.example.com/` including the final slash. This sets both the canonical
origin and the destination of new ticket notifications. In the Hub, edit the
existing Desk menu entry to the same URL; retain its connector, icon and audience.
Old ticket links move to the configured origin and retain their ticket ID through
Hub sign-in. Existing sessions are per origin, so a fresh Hub sign-in is expected.
No Okta redirect URI is needed for Desk: Okta still returns to the existing Hub.

The HttpAgent must keep its IC API host (`https://icp0.io` in this build), never
`location.origin`. Slack **Events Request URLs stay on the Desk backend canister**;
the frontend domain does not host Slack intake. No Slack messages need to be sent
as a domain test.

## Customer projects

Set **Settings → General → Desk URL** to the canonical HTTPS frontend origin first. Deploy the public `support.html`, `support.js`, `support.css` and `widget.js` files with the normal frontend. The release recipe patches the backend ID in `support.js` independently; never make the public page load `app.js` or Hub sign-in.

In **Customer projects**, create a product, select its Hub group and enable public intake only when ready. Members also need the centrally assigned Desk Agent role. Staff permissions and directory revocations use Desk’s existing 60-second freshness lease. Project keys and private links have separate revocation controls. See [the integration guide](CUSTOMER-SUPPORT.md). Customer ticket data is included in the existing Desk backend snapshots.

## Customer privacy rollout (0.12)

Review **Customer projects → Project & integrations → Privacy & retention** before accepting customers. New projects have automatic 90-day completed / 365-day inactive retention. Existing 0.11 projects receive a persisted seven-day transition grace period. Shorter configured periods require confirmation and at least 24 hours of grace. Do not ship an empty company privacy notice: set its HTTPS URL and check the customer form.

Confirm the background check timestamp advances, exercise erasure with a test customer ticket, and verify its private link/API access disappears. Keep internal employee tickets outside this policy. Inventory earlier 0.11 Hub/Slack notifications if that prototype accepted real data; old delivered copies are not withdrawn automatically. Configure/verify snapshot rotation, explicitly remove expired snapshots, and retain current deletion journals separately. Read the full [privacy and restore procedure](CUSTOMER-SUPPORT.md#privacy-deletion-and-backups) before restoring a customer-support snapshot: regular Vault restore alone cannot guarantee erased data stays inaccessible.

The in-project **Embedding guide** and **Embed & API** section are the operator entry points. The served guide is generated from `CUSTOMER-SUPPORT.md` with `python3 desk/tools/build-customer-guide.py`; keep both versions in step.

### Upgrade to 0.13.0: customer workflows

This release adds stable side tables for project request types and per-ticket workflow
snapshots. Existing projects retain their default intake fields; old tickets remain on
standard support status handling. No existing project is seeded with sample workflows.
The refund template becomes real configuration only when an admin saves it. Upgrade
backend before frontend, publish the same tested bundle, and preserve the previous
artifact for rollback planning. The committed stable signature must remain unchanged.

Existing widget embeds and API submissions without `typeId` continue to use the default
type. New clients fetch `/schema`, choose an enabled `requestTypes` entry and submit its
ID with the current revision. Keep `customer-workflows.js` in the deployed static assets;
the in-project guide is rebuilt with `python3 desk/tools/build-customer-guide.py`.

### Upgrade to 0.14: hardware offboarding

Upgrade Hub to 0.27, Assets to 0.13 and Desk to 0.14 in one tested suite release. No directory, Lunch or role reconfiguration is needed. Existing custody and invoices are preserved; confirmed open offboardings are discovered by the background sweep. The shipped Reclaim devices task updates automatically; review custom checklist wording if it duplicates hardware tracking. Test a populated upgrade and follow the [operator workflow](../docs/HARDWARE-OFFBOARDING.md).

## Operations rollout

Publish with Hub 0.28 and the matching source releases through the tested suite update service. No new roles, directory lanes or Lunch changes are required. Existing records remain in place. See [Operations rollout and verification](../docs/HUB-OPERATIONS.md#release-and-verification).

## Upgrade candidate 0.16: on-call planning

The candidate adds an on-call side table and generated API bindings; old customer
projects, tickets, permissions and Lunch integration remain unchanged. No project
or schedule is seeded in a real deployment. Deploy the matching frontend including
`oncall.js`, `oncall-planning.js` and `oncall.css` with the backend through the normal
Kitchen bundle. Keep the committed stable baseline until compatibility and populated
upgrade checks pass. This is a local planning alpha, not an authorization to change
the live paging or payroll authority. See [ONCALL.md](ONCALL.md).

## Incident response candidate (0.17)

The local candidate adds native Hub notification queues, response escalation,
explicit incident ownership and accepted handoffs beside on-call coverage.
Responders can record actual work separately; records are unreviewed and follow
incident retention. Monitoring intake is added in the 0.18 candidate below; verified device paging
remains planned. Scoped hourly payroll reporting is added in [REPORTING.md](REPORTING.md). See [the operator workflow and limits](ONCALL.md#respond-to-an-incident).

## Alert sources candidate (0.18)

An administrator connects a source under **On-call → project → Alert sources**.
Each expiring key can only send events for that source's fixed project/service.
Test the connection while paused, enable it, then send one unique occurrence ID
with increasing event sequences. Repeats share one incident; recovery remains
separate from the team's acknowledgement and verified resolution. Copyable setup,
rotation and retry guidance is built into the source page.

Deploy `oncall-alerts.js` with the matching backend through the normal tested
Kitchen bundle. HTTP intake is on the **backend** at `/oncall/v1/sources/{id}/events`,
not the frontend/custom Desk domain. Existing sources are never seeded in a real
upgrade. The generic contract requires a server-side adapter; no direct Watch or
vendor-specific integration is claimed. See [ONCALL.md](ONCALL.md#connect-monitoring).

## Service reporting alpha (0.19.0)

Pair with Hub 0.31.0 and SDK 0.12.0; assign supplemental reporting capabilities in Hub after creating the on-call project. Requesters remain requesters. Read [REPORTING.md](REPORTING.md) before choosing rates, retention or a payroll cutover. Existing periods snapshot their rules. Use the published format-2 release and verify both Hub and Desk after upgrading.

## Desk 0.20 local candidate

Calendar and status tables are additive. Compare the candidate stable signature with
the committed baseline and upgrade populated 0.19 state. Test the actual ICP recipe
executable as well as Mops. The existing `support.js` backend patch also covers
public status: no new canister, login provider or release patch is needed.

After a separately authorized release, configure On-call → project → Status page.
It starts disabled. Follow [STATUS.md](STATUS.md) to select and review the audience.
Hub roles and Lunch are unchanged. Include the additional frontend modules in the
normal format-2 bundle with the matching backend and generated bindings. Publish
and deploy identical artifacts; do not bypass the release catalogue for this candidate.

## Regional planning and reminders candidate

Desk 0.21.0 is a local alpha on top of the 0.20 calendar/status candidate. Existing
projects and published intervals stay intact; reminders initialize disabled. Test
a populated 0.20 upgrade and a second candidate upgrade, including partial cover,
status and a payroll draft. The regional frontend requires matching generated
backend bindings. Enable reminders per project only after checking Hub notify-lane
access and the canonical Desk HTTPS URL. No Hub, SDK, Lunch or directory contract
change is required. See ONCALL.md for clock-change and notification pilot checks.

## Desk 0.22 compensation candidate

This local alpha adds stable side-state for dated rules, statement day snapshots and
separate time-credit corrections. Hub 0.30 remains unchanged. Existing 0.21 statements
keep their legacy calculation/export. Check committed stable compatibility, a populated
0.21 upgrade, a second upgrade with dated rules and the actual recipe executable.
Use `KEBAB_COMPENSATION_BASELINE=/path/to/desk-021` with
`node --test tests/oncall-compensation.test.mjs`. Then run the existing on-call,
reporting, security, central-permission and Lunch preservation checks.

Review [REPORTING.md](REPORTING.md) with payroll before activation: daily allowances
are prorated; work minimum is daily; one reporting calendar applies per project;
new CSVs separate minor currency units and whole credit minutes. Keep existing payroll
imports configured for the legacy schema until the new schema is reconciled. Dated
rules apply only to new whole-day statements; no existing draft is recalculated.
Publish/deploy only through the tested format-2 release workflow after explicit
production authorization. This candidate has not been deployed.
