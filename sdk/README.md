# kebab-hub SDK

Everything an app needs to become a layer on the skewer: single sign-on
through the hub, the people directory, bounded access revocation, notifications.
Two files, no framework.

| Piece | For | What it gives you |
|---|---|---|
| `sdk/motoko` (`mo:kebab-hub`) | your app **backend** canister | typed hub interface, ticket redeem, sessions, directory cache, connector-contract gate |
| `sdk/js/hub-client.js` | your app **frontend** | read the hub ticket from the URL, jump back to the hub, session store, initials, **the shared topbar** (`mountTopbar`: brand · app · menu · bell · theme · person) |
| `hub/dist/tokens.css` | your app **frontend** | the design tokens (colours, type, radii) — copy it next to `hub-client.js`; `check-sdk` fails on a stale copy |
| `docs/agent/onboard-app.md` | you or your coding agent | the step-by-step, in prompt form |
| `sdk/example` | copy-paste start | a minimal app that is fully wired |

## Backend contract

Start from [the compiled example](https://github.com/kebabstack/kebabstack-source/blob/main/sdk/example/backend/main.mo); it contains the full
sign-in, controller-only configuration and directory-lease flow. The code is a
minimal session example; add the shared topbar/suite-token pass-through below for
a complete product UI.

- Pin the local SDK dependency in `mops.toml`; use the repository's pinned Mops
  (`npm ci`, then put `node_modules/.bin` on PATH) and commit generated lockfiles.
- Only a controller may configure `setHub`. Validate the principal and clear the
  old directory/sessions when switching Hub.
- Redeem a one-time Hub ticket, fetch a fresh complete directory when needed,
  generate random session entropy, then recheck Hub binding and active access
  after awaits before minting a session.
- Pull `connectorDirectory()` every 30 seconds. Use `Hub.syncDirectory` for
  this complete snapshot: absence or inactivity revokes cached sessions, every
  address's person id is recorded, a re-issued address parks its previous holder.
  Record the **request start time**, not response arrival. Every protected method
  must call `Hub.directoryFresh` and refuse access at 60 seconds, even during outage.
- **People are ids.** Store `Hub.pidOf(ids, email)` in your data, never the
  address; render with `Hub.personById(people, ids, former, pid)`. Addresses
  change and get re-issued, the hub's `p_…` id does not (docs/PERSON-IDS.md,
  migration recipe in the onboarding guide §5b).
- `hub_upsert` is a partial push: use `Hub.upsertRows` (SDK ≥ 0.4) and do not renew the lease.
  `hub_deactivate` marks people inactive and kills their sessions. Authenticate
  both callbacks with `Hub.isHub`; discard pulls overtaken by a push/config change.
- The `roles` and `groups` lanes supply current role/routing attributes. An app
  manifest cannot grant itself the `ai` lane: sharing the company API key requires
  an explicit owner decision. Assets, Contracts, Desk, Forms, Trust and Watch use
  the central permission protocol below and have no local role fallback.

The lease bounds app-side stale authorization after the Hub has learned a change.
It does not bound upstream provisioning latency or revoke tokens already held by
external services. Run the real backend regression tests when adapting this flow.

## Frontend: shared sign-in and navigation

Copy `sdk/ui/signin.html` (replace `__APP_NAME__`) and `hub/dist/signin.css` alongside
`hub-client.js` and the design tokens. Include the stylesheet after app styles.
The seven business tools use exactly this markup and stylesheet; synchronize/check them
with `python3 sdk/tools/sync-signin.py` / `--check`.

```js
import { appSignIn, takeHubTicket, session, mountTopbar, topbarIdlFactory } from "./hub-client.js";
const signIn = appSignIn({ name: "My app", hubUrl: HUB_URL });
document.getElementById("loginBtn").onclick = () => signIn.continue();
try {
  const ticket = takeHubTicket(); // scrubs the ticket, restores theme and saved hash route
  if (ticket) {
    session.clear(); // a rejected new identity must not resume an old account
    signIn.status("", "signing in");
    const [result] = await app.loginWithTicket(ticket);
    if (!result) throw new Error("Sign-in was not accepted. Please try again.");
    session.save(result.token);
    session.saveSuite(result.suiteToken);
  }
  // Validate the stored app session and render the authorized workspace here.
} catch (error) {
  document.getElementById("loginStatus").textContent = error.message;
  signIn.status("err", error.message);
} finally {
  signIn.ready();
}
```

`appSignIn` locks duplicate starts and describes session checking, Hub navigation and
errors. `hubJumpUrl` accepts an HTTPS Hub address, saves the current hash in this tab
and starts a clean `?jump=` request. Hub resolves the destination against registered
apps and checks access before redirecting. The Hub console is never a progress screen.
Public forms and guest dealrooms keep their existing public entry paths; the shared
screen applies to authenticated workspaces.

**The topbar.** Every app in the suite shows the same bar — brand (the
company logo the hub holds, or the suite mark) · app name · **Apps ▾** (the
person's apps) · **bell** · theme · **you ▾** — so switching apps never
changes the top. Do not build your own header; mount the shared one:

```js
const hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId }); // your backend's info() knows the hub
const topbar = mountTopbar(document.getElementById("topbar"), {
  hub: { actor: hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
  app: { name: "my app", eyebrow: info.orgName }, person: { email: me.email, displayName: me.displayName, role: me.role },
  onSignOut: signOut,
});
```

The mount element receives `ks-topbar-host` and owns the sticky position. Place it
as a direct child of the full-height workspace, outside the content scroller. Do
not override its position or place it in an overflow-clipped/short header wrapper.
Use `--ks-topbar-offset` for sticky navigation below the bar. Keep long side menus
independently scrollable and test real page scrolling at desktop, narrow and zoomed
sizes; DOM-only tests cannot verify sticky layout. `destroy()` removes the host
class. See `NAVIGATION-06` in the design standard.

The bell polls the unread count every 30 s (one cheap `suiteState` query),
loads the list when opened, refreshes when the tab comes back and after every
action; an ended suite token shows *Sign in again*; "Sign out" ends the app's
session and the hub's. The suite token is read-only
and good for six hub calls (`suiteState`, `myNotifications`,
`markNotificationsRead`, `portalApps`, `portalWhoami`, `myAvatarPortal`) —
nothing else accepts it. Copy `hub-client.js` and `tokens.css` into your
`dist/` unchanged; `sdk/tools/check-sdk.py` fails when a copy differs.

## Declare yourself, then get connected

```motoko
public shared query func hub_manifest() : async Hub.Manifest {
  { name = "My app"; version = "0.1.0"; description = "…"; needs = ["identity"]; wants = ["avatars"] };
};
```

Lanes = what you receive about people: `identity` (always) · `profile` ·
`groups` · `roles` · `avatars` · `notify` · `push`. Ask for the minimum —
the admin sees your `needs` pinned on the skewer and can refuse the rest.

Hub → **Apps** → 🍢 **Connect an app**: the admin pastes your **backend**
canister id, the hub reads your manifest, skewers the lanes, picks who may
use the app and creates the bound portal tile — one call. From then on
`Hub.hub(hubId)` calls succeed within your lanes and the hub pushes
deactivations.

## Installable by the kitchen

Apps that follow four conventions can be installed and updated from the
hub's Kitchen page in one click: `hub_ping()` returns the recipe id,
`setHub(Text)` is controller-gated, the backend takes no init argument, and
`dist/` carries the placeholders `__BACKEND_CANISTER_ID__` / `__HUB_URL__`.
Add a `RECIPES` entry in `kitchen/tools/pack-recipes.py` — see
`docs/agent/onboard-app.md` § 10.

## Rules that keep the suite coherent

- Identity is the person id (`p_…`); the address is display data and the key of the cache — it can change and be re-issued. Never merge accounts on display names.
- Directory rows are read-only in your app; the hub is the source of truth.
- Deactivation = Slack model: the person vanishes from your UI within
  seconds, their data stays as archive.
- Stable vars are append-only; run `moc --stable-compatible` against your
  committed `.most` before every backend deploy.
- Notifications carry a title and a deep link only — content stays behind
  your own sign-in.

## Central app roles (SDK 0.6.0)

The six first-party business apps use `Hub.appRole(people, email, app)` exclusively,
after checking the directory lease. It requires `appPermissionModel=1`, a matching
`appPermissionApp`, and a supported `appRole`; missing/unknown values mean `none`.
These attributes are supplied by Hub independently of the optional global `roles` lane.
`Permissions.mo` defines roles and their capabilities. The served `kebab-hub.mo`
requires the adjacent served `Permissions.mo`; package users receive both automatically.

`hub_permissionStatus` is callable only by the configured Hub. `permissionRevision`
confirms a single consistent snapshot across all active directory rows, not merely the
first row. It does not extend freshness. Never consult local email lists, groups or
bootstrap claims as an alternative source of app roles. See [the permission model](../docs/APP-PERMISSIONS.md).

## Read-only support context

`Support.mo` defines bounded person summaries and lifecycle event batches.
`hub_personContext(viewerId, subjectId, currentAppRole)` is Hub-only; reject stale
directories or a role mismatch and enforce ordinary record permissions. Return
no documents, secrets, messages, public edit tokens or raw telemetry. See
[Lifecycle](../docs/LIFECYCLE.md) for the broker and UI contract.

`Hardware.mo` defines the case and aggregate-progress protocol for registered Desk/Assets services. Hub authenticates connector bindings, Desk owns confirmation and Assets owns custody. It does not extend the directory or Lunch contract; see [hardware offboarding](../docs/HARDWARE-OFFBOARDING.md).

## Operations summaries

`Operations.mo` defines schema-1 numeric snapshots. A source implements `hub_operations(viewerId)` for its configured Hub only, verifies the person ID, directory freshness, active account and central Admin role, and returns no individual records or secrets. Hub rechecks its own permissions and connector after the call. See [Operations](../docs/HUB-OPERATIONS.md).

### Supplemental Desk reporting (0.12.0)

Desk 0.19.0 accepts `deskReportingModel=1` and delimiter-separated project/capability entries in `deskReporting` from the trusted Hub directory. Hub 0.31.0 controls person/group grants and binds them to the current Desk canister. Apps must first enforce active identity, current directory lease and a non-`none` base app role; supplemental rights do not bypass these checks or confer Agent access. `Permissions.reportingHas` checks exact project and known capability boundaries. Lunch remains on its existing directory contract.

### JSON response safety (0.12.1)

`sanitizeSurrogates` returns flat UTF-8 text, preserving escaped backslash literals. Run it before the pinned JSON parser when handling external responses. This fixes large-response text stack overflows; it does not impose response-size or nesting limits for callers. Watch additionally bounds certificate JSON nesting and separates retry timing from successful evidence.

## Product logos

[Logo library and design rules](../design/logos/README.md) define the permanent Kebabstack product marks approved from kebabstack.dev. Use `design/logos/registry.json`; never invent a separate app logo, emoji or coloured tile. Run `npm run brand:sync` and `npm run brand:check` when changing a mark or adding a tool. Keep the website, app favicon/header, Hub menu, Kitchen recipe and Cloud Engine console aligned. Company and external-app branding remain separate.

## Shared product design

Use `design/tokens.json` through the generated `hub/dist/tokens.css`, load
`hub/dist/components.css` after app styles and opt a workspace into shared controls
with `body.ks-workspace`. App copies are generated by `npm run runtime:sync` and
validated by `npm run runtime:check`. Keep print styles and game-world/HUD styling
scoped exceptions; navigation, sign-in and account menus use the shared SDK. Do
not redefine the palette in individual apps. See `design/README.md` for all rules.
