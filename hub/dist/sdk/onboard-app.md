# Onboard an app to the kebab-stack hub

Prompt-ready guide for a coding agent (Claude, Codex, Cursor, a human) that
wires a canister app — new or existing — into the hub. Follow it top to
bottom; every step has an acceptance check. Paste it into your agent's
context together with `sdk/README.md`.

## 0 · What you are wiring into

The hub is the org's people directory and sign-in gateway. Apps never hold
their own user list; they hold a **read-only cache** of the hub's directory
and trust the hub for two things: **who is this person** (sign-in) and **is
this person still allowed in** (deactivation). Each app is one **connector**
in the hub, identified by its **backend canister id**.

You need from the hub admin:

| Item | Where |
|---|---|
| hub backend canister id | Hub → How this hub works → footer, or `icp canister status` in the hub repo |
| hub frontend URL | the browser |
| your app registered as connector (backend canister id + tile URL) | Hub → Apps → Connected apps → Register, then App tiles |

Nothing else — no shared secret, no API key. The hub verifies you by your
canister principal; you verify the hub the same way.

## 1 · Backend: add the dependency

```toml
# mops.toml
[toolchain]
moc = "1.12.0"
[dependencies]
core = "2.6.1"
kebab-hub = "<path or git to kebabstack/sdk/motoko>"
```

`mops install`, then `import Hub "mo:kebab-hub";` compiles.

**Check:** `mops check --fix` passes in the configured app project.

## 2 · Backend: stable state

Add to your `persistent actor` — and never remove or rename these later
(Enhanced Orthogonal Persistence: dropping a stable var breaks the upgrade
with `IC0503`; declare and `ignore` instead):

```motoko
var hubId : Text = "";
let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
let ids : Map.Map<Text, Text> = Map.empty<Text, Text>();                         // address -> person id
let former : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // id -> last row of a person whose address moved on
```

**People are ids, not addresses.** Every reference to a person in YOUR data
(requester, assignee, owner, player …) is the hub's stable person id
(`p_…`), obtained with `Hub.pidOf(ids, email)` at the API boundary and
rendered with `Hub.personById(people, ids, former, pid)`. Addresses change
and get re-issued; ids do not (docs/PERSON-IDS.md).

Plus a `setHub(id)` gated to your owner/controller (see `sdk/example`).

## 3 · Backend: the connector contract (hub → app)

Three methods, names exact, gated to the hub principal:

```motoko
public shared ({ caller }) func hub_upsert(rows : [Hub.DirectoryRow]) : async Nat
public shared ({ caller }) func hub_deactivate(emails : [Text]) : async Nat
public shared query func hub_ping() : async Text
```

- `hub_upsert`: `Hub.upsertRows(people, ids, former, sessions, rows)` — the same id bookkeeping as the 30-second sync (a re-issued address parks the previous holder under `former` and ends their sessions; a renamed person keeps one address). Never write `ids` by hand. Key = lowercased e-mail.
- `hub_deactivate`: `Hub.endSessionsOf(sessions, emails)` **then**
  `Hub.deactivate(people, emails)`. Never delete their rows or data — flag
  inactive. The person disappears from pickers, mentions, assignment; their
  tickets/docs/records stay.
- `hub_ping`: return your app slug. The hub shows it as connection health.
- **`hub_manifest() : async Hub.Manifest`** (query, strongly recommended): name,
  version, description and the **lanes** you `needs` / `wants` (identity ·
  profile · groups · roles · avatars · notify · push). The hub's connect wizard
  reads it and pre-sets the lanes; the admin cannot untick `needs`. Declare the
  minimum: a game needs `["identity"]`, a service desk needs profile + groups +
  roles + notify. The hub enforces lanes server-side — you only ever receive
  what was granted.
- optional `hub_usesGroup(name) : async [Text]` (query): where your app uses
  that hub group — short phrases like "default queue of 3 request types",
  "approver group of Access request", "12 open requests". The hub shows them
  on the group so admins see a group's effect before renaming or deleting it.

**Check:** with a fake principal the calls trap; the hub's Apps page shows
your connector green after registration.

## 4 · Backend: sign-in lane (app → hub)

The hub opens your app with `#uht=<ticket>` in the URL fragment.

```motoko
public shared func loginWithTicket(ticket : Text) : async ?{ token : Text; suiteToken : Text; email : Text; displayName : Text; role : Text } {
  if (not Hub.ticketLooksValid(ticket)) return null;
  let r = await Hub.hub(hubId).redeemTicket(ticket);
  if (not r.ok) return null;
  let tok = <hex of raw_rand>;                 // 256+ bits, your entropy
  ignore Hub.mintSession(sessions, tok, r.email, r.displayName, ttl);
  ?{ token = tok; suiteToken = (switch (r.suiteToken) { case (?t) t; case null "" }); email = r.email; displayName = r.displayName; role = roleOf(r.email) };
  // r.id is the person's stable id (null on a hub < 0.17); your `me(tok)` derives it as Hub.pidOf(ids, s.email)
};
```

`suiteToken` is the hub's read-only token for the person's **topbar** (bell,
menu, name, picture) inside your app — pass it through to the frontend
untouched, never store it beyond the session, never log it.

Every authenticated method resolves `Hub.session(sessions, tok)` **and**
requires `Hub.isActive(people, email)` — a deactivated person's stale token
must fail even before `hub_deactivate` arrives.

Tickets are single-use, 90 s, bound to the tile's connector; redemption on
your side is the only step that consumes them.

**Passkey lane (optional, for apps that also want direct sign-in):** the
caller's principal can be resolved with `Hub.hub(hubId).principalPerson
(Principal.toText(caller))` → `?{ email; access }`. Only accept `#active`.
Sessions still go through `mintSession` so both lanes end in one model.

**Check:** open the tile from the hub portal → land in the app signed in as
yourself; refresh → still signed in; deactivate yourself in the hub → next
call is refused before its directory lease reaches 60 seconds (including during a Hub outage).

## 5 · Backend: directory cache

Pull `Hub.hub(hubId).connectorDirectory()` every 30 seconds and on stale sign-in.
Apply complete replies with `Hub.syncDirectory(people, ids, former, sessions, rows)`,
which revokes absent/inactive people, records every address's id and parks the
previous holder of a re-issued address under `former`; use `Hub.upsert` only for
partial pushes. Record the request START time.
Every protected read/write must reject when `Hub.directoryFresh` is false (60
seconds). Pushes do not renew that lease. Discard a response if the Hub binding or
push epoch changed during the await; recheck access after entropy/external calls.
Only controllers may call `setHub`, and changing it clears sessions and caches.
Use `Hub.attribute(u, "department")` etc.
for the hub-side whitelisted org profile; `Hub.attribute(u, "groups")`
(`"a;b"`) for group routing. **Roles rule of the suite:** `Hub.attribute(u,
"hubRole")` is `owner` / `admin` / `helpdesk` for hub staff — treat hub
owners/admins as admins of your app and helpdesk as agents by default, and
let hub groups widen the team. Never build a separate admin list that can
drift from the hub.

**Check:** `activePeople()` equals the hub's People list filtered to your
app's scope.

### 5b · Migrating an app that stored addresses (once, in the release that adopts ids)

```motoko
var idMigration : Text = "pending"; // stable; "done" once rewritten
transient let _migrate = Timer.setTimer<system>(#seconds 0, func() : async () { await migrateIds() });
func migrateIds() : async () {
  if (idMigration == "done" or hubId == "") return;
  let addresses = <every distinct address in your data>;
  let found = Map.empty<Text, Text>();
  for ((e, pid) in (await Hub.lookupIds(Hub.hub(hubId), addresses)).vals()) Map.add(found, Text.compare, e, pid);
  <rewrite every reference: Hub.migrateKey(found, email)>;   // unknown addresses become legacy:<address>
  idMigration := "done";
};
```

Until `idMigration == "done"`, every write method answers `{ ok = false; detail =
"people ids are being migrated — try again in a minute" }`. Update the hub to
≥ 0.17 before the app (the kitchen does).

## 6 · Backend: notifications (optional)

`Hub.hub(hubId).hub_notify({ email; title; url; kind; dedupeKey })` — the
hub delivers title + deep link to the person's bell (and Slack DM if they
opted in). Never put content in `title`; the link opens behind your own
sign-in. Reuse `dedupeKey` for "same thing again" to collapse noise.

## 6b · Backend: AI (optional, lane "ai")

The company sets ONE AI key in the hub (Settings → AI). Ask for the lane in
your manifest (`wants = ["ai"]`), then `Hub.hub(hubId).hub_aiCredentials()`
returns `?{ provider; url; model; visionModel; key }` — `null` when the lane
is not granted or no key is set. Cache it for a few minutes (a rotation in
the hub reaches you on the next fetch), never persist it, call the vendor
from your canister with a **non-replicated** HTTPS outcall
(`is_replicated = ?false`: single node, no consensus — right for answers
that differ every time), and report your calls with `hub_aiUsed(n)` so the
owner sees who uses the key. When the hub returns `null`, ask `hub_aiStatus()`
(query, no key inside) and tell the person precisely which of the two is
missing: no key → link `<hub>/#/settings/ai`; no lane → link
`<hub>/#/apps/<connectorId>/know` (opens your app's panel on *What it may
know*). Never ask them for a key.

## 7 · Frontend

```js
import { takeHubTicket, hubJumpUrl, session, initials, mountTopbar, topbarIdlFactory } from "./hub-client.js";
```

1. On load: `takeHubTicket()`; if present → `loginWithTicket` → `session.save(r.token)` + `session.saveSuite(r.suiteToken)`.
2. Else `session.load()` → call `me(tok)`; null → `session.clear()`.
3. No session: `location.href = hubJumpUrl(HUB_URL, location.href)`.
4. Avatars: `connectorAvatars(emails)` from the hub, fall back to `initials()`.
5. Sign-out: `signOut(tok)` then `session.clear()`.

**The topbar (mandatory).** Your page has no header of its own. Put
`<div id="topbar"></div>` at the top of the signed-in layout and mount the
shared bar once you know who is signed in:

```js
const hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId }); // info() of your backend returns hubId
const topbar = mountTopbar($("topbar"), {
  hub: { actor: hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
  app: { name: "watch", eyebrow: info.orgName },        // app name in the brand slot, company as eyebrow
  person: { email: me.email, displayName: me.displayName, role: me.role },
  onSignOut: signOut,
});
```

What it renders, everywhere the same: brand (company logo from the hub, or
the suite mark; a tap goes to the menu) · app name · **Apps ▾** (the person's
apps, fresh on every open; apps open in this tab via the hub, outside links in
a new tab) · **bell** (unread badge, list on open, mark read before the link
opens, "Mark all read") · theme (arrives with the sign-in ticket, so it does
not flip between apps) · **you ▾** (name, e-mail, how you signed in, "You're
an admin here." when `person.role === "admin"`, Sign out). **Sign out** runs
your `onSignOut` and then ends the hub session too. The bar refreshes the
unread count every 30 s, the list when open, and on tab focus; two missed
heartbeats say "Can't reach the hub", an ended token says "Sign in again" —
never a stale zero. Your own tabs go **below** it (`position: sticky; top:
var(--ks-topbar-h)` if you want them sticky). Theme: the bar toggles
`data-theme` on `<html>` and stores `ks-theme` — read the same attribute.
Options that would make your top look different (extra buttons, custom
panels, jump, theme hooks, ids) are hub-only and ignored in apps.

Ship `hub-client.js` **and** `tokens.css` byte-identical to the SDK's copies
in your `dist/` (`sdk/tools/check-sdk.py` fails otherwise) — that is what
keeps every app's top identical.

Never show a person the hub returned as inactive, never build a "users"
admin page — people management lives in the hub. Deep-link every screen
(hash routes) so notifications can point at them.

**Check:** ticket is gone from the address bar after load; back button does
not re-trigger sign-in; sign-out really invalidates the token server-side;
the bell shows the same count as the hub's menu page; Menu ▾ lists the same
apps as the menu page and switching lands signed in.

## 8 · Register in the hub

Hub → Apps → 🍢 **Connect an app**: the admin pastes your **backend**
canister id; the hub calls `hub_ping` and `hub_manifest`, pins your `needs`
on the lane skewer, lets the admin grant more, choose who may use the app
and create the bound tile — one call at the end. Self-service alternative:
the portal's "Connect your app" request; on approval the lanes come from
your manifest. Portal users now see your tile; the hub starts pushing
deactivations (and the directory too, if the `push` lane was granted).

## 9 · Deploy discipline (every backend deploy, forever)

```bash
moc --stable-types $(mops sources) backend/main.mo -o /tmp/new.wasm
moc --stable-compatible backend/backend.most /tmp/new.most   # must be silent
# Hub → Backups → your backend → Snapshots… → "before vX.Y" (if the vault is installed)
icp deploy -e ic
cp /tmp/new.most backend/backend.most                          # only after a successful deploy
```

A snapshot before every live upgrade turns a bad deploy into a two-click
restore instead of a forensic afternoon.

`icp`'s "✔ Compatible" checks Candid only. Stable vars are append-only.
Never `--mode reinstall` or `--force` a live canister.

## 10 · Make it cookable — a kitchen recipe

The hub's **kitchen** installs and updates apps from **recipes** without a
terminal: an owner presses Install, the kitchen creates the two canisters,
installs your backend, installs a standard asset canister for your frontend,
copies your `dist/` files in, calls `setHub`, registers the app in the hub
and hands both canisters to the vault. To make your app cookable, follow
these conventions (all of them are checked by `kitchen/tools/pack-recipes.py`
or at install time):

| Convention | Why |
|---|---|
| `hub_ping()` returns your **recipe id** (e.g. `"desk"`) | the kitchen verifies an adopted backend is what the recipe says |
| `setHub(id : Text)` exists and is gated by `Principal.isController(caller)` | the kitchen is a controller of what it installs and calls it right after install |
| backend takes **no init argument** | the kitchen installs with Candid `()` |
| frontend is plain static files in `dist/` (any framework, built output committed) | the kitchen installs the standard asset canister and copies the files |
| ids and URLs in `dist/` are **placeholders**: `__BACKEND_CANISTER_ID__`, `__HUB_URL__` | the kitchen patches them at install time (`${backend}`, `${hubUrl}`, `${frontendUrl}`, `${hubId}`); your local deploy swaps live ids in, git keeps placeholders |
| `hub_manifest().needs` is the minimum | the kitchen grants exactly `needs`; owners widen lanes deliberately in the Lanes editor |
| stable variables append-only, `moc --stable-compatible` before release | kitchen updates upgrade with `wasm_memory_persistence = keep`; a breaking change fails the upgrade (the pre-update snapshot is the way back) |

Then add one entry to `RECIPES` in `kitchen/tools/pack-recipes.py` (id, app
folder, patch list, `post: [{method: "setHub", arg: "${hubId}"}]`, menu
entry kind + note) and run `python3 kitchen/tools/pack-recipes.py --build`
before the next kitchen deploy. The pantry ships the committed frontend
(from git HEAD) and the backend `icp build` produced.

**Check:** the recipe appears under Hub → Kitchen; Install on a test hub
ends with twelve green steps and an "up to date" pill (the running module
hash equals the recipe's sha256).

## 11 · Acceptance checklist

- [ ] `hub_upsert` / `hub_deactivate` / `hub_ping` exist, hub-gated, exact names
- [ ] sign-in via tile ticket works; ticket stripped from URL; refresh keeps session
- [ ] deactivated person: sessions dead, hidden from UI, data retained
- [ ] complete directory refreshed every 30 seconds; authorization fails closed at 60 seconds; absence revokes sessions; callbacks and setHub authenticated
- [ ] identity = the person id (`p_…`) in your data, the address only for display/pickers; no merging on display names
- [ ] every authenticated method checks session **and** `isActive`
- [ ] notifications (if any) carry title + link only
- [ ] `.most` committed; stable-compat run before deploy
- [ ] app registered in Hub → Apps, connector shows green ping
- [ ] app redeems Hub tickets in its backend; no separate IdP integration is required in the app
- [ ] cookable: `hub_ping` = recipe id, controller-gated `setHub(Text)`, placeholders in `dist/`, entry in `pack-recipes.py`
- [ ] the shared topbar is the page's only header (`mountTopbar`), `suiteToken` passed through from `redeemTicket`; `hub-client.js` + `tokens.css` identical to the SDK (`check-sdk`)

## Product logos

[Logo library and design rules](../../design/logos/README.md) define the permanent Kebabstack product marks approved from kebabstack.dev. Use `design/logos/registry.json`; never invent a separate app logo, emoji or coloured tile. Run `npm run brand:sync` and `npm run brand:check` when changing a mark or adding a tool. Keep the website, app favicon/header, Hub menu, Kitchen recipe and Cloud Engine console aligned. Company and external-app branding remain separate.
