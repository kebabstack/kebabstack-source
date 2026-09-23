# Install kebab-stack on your cloud engine

Two ways. **A · the kitchen** (recommended): one terminal session to deploy
the kitchen, then everything in the browser — one button cooks hub and vault,
wires and protects them, and hands you a claim code. **B · by hand**: deploy
hub and vault yourself with the CLI (the original path; still valid, and what
the kitchen automates).

Either way you need a **cloud engine** (e.g. via [opencloud.org](https://opencloud.org)).
Application calls on a Cloud Engine do not require per-canister cycle top-ups.
The engine infrastructure and any external APIs still have costs. These steps
target a Cloud Engine; ordinary ICP application subnets need a different funding setup.

## A · Install with the kitchen

With Hub 0.23.0 and the matching six app releases, a Hub owner must save each
app's policy under **Permissions** before its first protected sign-in. Review
the effective roles there; local app admin lists no longer grant rights.
For existing installations, follow the [central permissions upgrade sequence](APP-PERMISSIONS.md).

Allow time for tool installation, build and checking the result; no installation
time guarantee has been measured for a fresh operator. The initial operator uses
the CLI; routine app installation then happens in the browser. Keep the CLI for
recovery, upgrades of Kitchen itself and controller management.

### A0 · Before you start (once per machine)

| You need | Get it | Check |
|---|---|---|
| Your engine's **subnet id** | Console → your engine → **Settings** (under the engine's identifiers) | you can paste it |
| Git | [git-scm.com](https://git-scm.com) | `git --version` |
| Node.js **22.22.2 or newer supported release** | [nodejs.org](https://nodejs.org) | `node --version` |
| The `icp` CLI + `ic-wasm` | `npm install -g @icp-sdk/icp-cli@1.4.0 @icp-sdk/ic-wasm@0.11.1` | `icp --version` |
| mops (Motoko packages) | `npm ci` in the cloned repository; use `node_modules/.bin/mops` | `node_modules/.bin/mops --version` (pinned 3.2.0) |
| Python **3.11 or newer** | verify your installed version; [python.org](https://python.org) | `python3 --version` |

`kitchen/tools/preflight.sh` runs every check in one go and prints what is
missing (after § A1's `git clone`).

Then link the CLI to the identity you administer the engine with — the
browser opens, you sign in with your passkey:

```bash
icp identity link web my-engine --auth https://opencloud.org
icp identity default my-engine
icp identity principal      # must print the principal you see in the console
```

`--auth` is the exact URL you sign in to your console at. A different origin
derives a different principal and the engine rejects the deploy as
unauthorized. If your console lives elsewhere, use that URL.

### A1 · Get the code, deploy the kitchen (one terminal session)

```bash
git clone https://github.com/kebabstack/kebabstack-source.git kebabstack
cd kebabstack
npm ci
export PATH="$PWD/node_modules/.bin:$PATH"
cd kitchen
python3 tools/pack-recipes.py --build     # fetches packages, builds hub, vault, desk, assets, watch, trust, forms, bug, contracts → recipes into dist/recipes/
mops install --locked
icp deploy -e ic --subnet <SUBNET-ID>      # the kitchen (backend) + the pantry (frontend)
python3 ../tools/setup-code.py kitchen --environment ic
```

The deploy prints the canister URLs. The **frontend** is the pantry. The helper
prints a private setup code; keep it for the next step. The unconfigured backend
refuses public setup until this code exists. Build recipes in a clean, committed
checkout: stale build artifacts and live-ID working copies are refused.

### A2 · Cook in the browser

1. **Sign in** with the key on your device (Face ID / Touch ID / Windows Hello).
2. Enter the **setup code** from the operator, then **Cook the stack.** Thirteen steps run in front of you: vault, hub backend,
   hub frontend, wiring, backups, labels — wait until every required step has completed.
3. Copy the **claim code**, press **Open your hub**, sign in with the same key,
   fill in company name, your name and e-mail; the code is pre-filled. You are
   the owner. The Hub code works only for first setup. Keep both codes private. A visitor
   who only knows either URL cannot take ownership.

From here everything happens in the hub: People, Apps, Backups, and the
**Apps** page installs and updates apps (Service desk, Assets, Watch, Trust, Forms, Ship the Bug) in one click. After installing Assets, grant it the **AI** lane (Apps → Edit → What it may know) and set the company AI key once under Settings → AI.

The Kitchen setup code is distinct from the Hub claim code. It authorizes a
first installation attempt; retry with it if no stack was created. Once Kitchen
has a Hub, it cannot be used to cook another stack. After a reload, sign in with
the same login to recover the accepted job/Hub claim link. If the code is lost
before setup, the controller can run the helper again to rotate it.

Publish a tested release bundle using the [operator release workflow](../kitchen/INSTALL.md).
Hub owners then review and apply updates in **Apps → Updates**; terminal updates
use the same executor and appear in **History**. Publishing a bundle does not
update running apps by itself. Do not redeploy the entire release-store frontend
for routine publication, because that can remove older immutable packages.


## B · Install by hand

### B1 · Link the CLI to your engine identity (once per machine)

```bash
icp identity link web my-engine --auth https://opencloud.org
icp identity default my-engine
icp identity principal   # must print the principal you administer the engine with
```

Sign in with your passkey when the browser opens. If your console lives at a
different URL, use that as `--auth` — the origin determines the derived
principal.

### B2 · Find your subnet id

Engine console → your engine → **Settings** → subnet id. You'll pass it to
every deploy.

### B3 · First deploy (two phases)

The frontend needs the backend's canister id, which only exists after the
first deploy — hence deploy, patch, deploy:

```bash
cd hub                   # from the repository root, after npm ci and PATH setup
mops install --locked
icp deploy -e ic --subnet <SUBNET-ID>
```

Note the two canister ids in the output (`Created canister backend with ID …`
/ `… frontend with ID …`). Read them from the deploy output — do NOT rely on
`icp canister status --id-only` in scripts; on some CLI versions it returns
nothing, and an empty shell variable silently produces broken sed patches.
Verify every substitution with a grep before redeploying. Then:

1. In `dist/index.html`, replace `__BACKEND_CANISTER_ID__` with the
   **backend** canister id.
2. Recommended (before anyone signs in — this cannot be retrofitted without
   orphaning accounts): pin the Internet Identity derivation origin so a
   custom domain later signs the same people in. In `dist/index.html` set
   `CANONICAL_ORIGIN = "https://<frontend-canister-id>.icp.net"` and create
   `dist/.well-known/ii-alternative-origins` listing every origin:
   `{"alternativeOrigins":["https://<frontend-canister-id>.icp.net"]}`
3. Optional console polish: in `icp.yaml` set
   `__META_BASE_URL: "https://<frontend-canister-id>.icp.net"` under the
   frontend's environment variables (named app + icon + Open button).

Deploy again to apply:

```bash
icp deploy -e ic --subnet <SUBNET-ID>
```

Configure a private one-time claim code using the deployer's controller identity:

```bash
python3 ../tools/setup-code.py hub --environment ic
```

### B4 · First run — claim the hub

Open `https://<frontend-canister-id>.icp.net`. The login screen says
**"First run"**. Sign in with your passkey — the wizard asks for three
things plus the code: organization name, your name, your work e-mail,
and the one-time claim code from the operator. That creates you as
the first person in the directory, links this passkey to you and makes you
**owner**. The operator already configured the code via CLI. From here on roles are set per person under
People → Directory (Role column) and every connected app mirrors them.

An unconfigured Hub without a code accepts setup only from its actual canister
controller. A browser login can have a different principal from the CLI because
identity derivation is origin-specific; use the setup code for the browser flow.

Break-glass (lost passkey, no owner left): the CLI identity that deployed is
a controller and may still run
`icp canister call backend addAdmin '("<principal>", "label")' -e ic`.

### B5 · Add people

**Manually:** *People* → Add person (or "Add + invite" in one go) → the
one-time invite link. They open it, sign in with their own passkey, and are
linked to their directory entry — from then on every connected tool can
resolve their sign-in.

**SCIM:** *Directory sync* → *Connected sources* → *Connect a source* (a name for the identity provider, optionally the
mail domains it may provision) → the bearer token is shown once; point that IdP's SCIM
provisioning at `https://<backend-canister-id>.icp.net/scim/v2` — people appear automatically,
deactivations land in seconds and are pushed to every connected tool. Several identity
providers = several sources with their own tokens (hub ≥ 0.20): each sees and changes only the
people and groups it pushed, an address is provisioned by one source at a time, a group name
is unique across the hub. Profile attributes the provider pushes (title, enterprise fields, the
work address as `city`/`state`/`countryCode`, custom schema attributes) are stored under those
names and can drive an app's exclude filters (hub ≥ 0.20.1). User and group endpoints exist;
consult the Hub help and test your IdP's SCIM operations against this implementation before
enabling provisioning.

**Okta pull (optional module):** the hub can also pull an Okta org directly
(API Services app, private_key_jwt, read-only) — *Directory sync* → *Okta pull* walks you through it.

### B6 · Connect tools

Every KebabStack tool (and anything you build) consumes users from the hub
over one contract: scoped access, best-effort `hub_deactivate` pushes and
one-time ticket sign-in. The bundled apps pull a complete directory every 30
seconds and deny access at 60 seconds without fresh Hub confirmation. See
*Connectors* in the portal for the candid and registration.

### B7 · Backups (recommended before the first real upgrade)

Deploy the vault once and let it snapshot the hub and every app on a schedule
— see `vault/INSTALL.md`. From then on the hub's **Backups** page
(owners) is where you snapshot before an upgrade and restore if one goes
wrong.

## Troubleshooting

- **Setup asks for a code:** use the code configured for this backend. If the
  operator did not generate it, use `tools/setup-code.py` from the controller CLI.
  Signing into the same identity service at another origin can yield another
  principal; a passkey login is not automatically a canister controller.
- **App sign-in fails after a Hub outage:** restore Hub connectivity and wait for
  a successful directory pull; then enter through the Hub again. Never lengthen
  the permission lease to hide an outage.
- **Wizard doesn't appear:** setup already completed (`getSetup` shows
  `setupDone = true`). Admins can change settings in the portal instead.
- **Deploy rejected as unauthorized:** relink with the exact console origin
  (`--auth`), and check `icp identity principal` matches your console
  principal.

## Operations dashboard

Hub 0.28 adds the signed-in work dashboard. Publish it with Desk 0.15, Assets 0.14, Trust 0.8, Contracts 0.10 and Watch 0.8. Existing older apps appear unavailable until updated. Follow [Operations](HUB-OPERATIONS.md) for definitions, scopes and upgrade checks.


### Operations on a shared TV (Hub 0.29)

After updating Hub and the five Operations sources, open **Operations → Screens**
as a linked active Owner. Open the same Hub at `#/tv` on the display and approve
its short-lived pairing code with selected sources and an expiry. No directory
lane, role assignment or Lunch change is needed. The TV does not use a Hub login.
See [pairing, revocation and coverage](HUB-OPERATIONS.md#a-screen-for-the-team-room).

### Scoped on-call reporting alpha

Hub 0.31.0 and Desk 0.19.0 add supplemental project reporting grants. Upgrade both tested artifacts before configuring Permissions → Desk → Reporting access. Base app roles, directory-only Lunch consumers and global Owner/Admin inheritance are preserved. Follow [the reporting operator guide](../desk/REPORTING.md) for retention and separation of duties; payroll cutover requires a reconciled pilot period.
