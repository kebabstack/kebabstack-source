/// kebab-stack hub client — everything an app canister needs to plug into
/// the hub: typed hub interface, ticket sign-in, sessions, directory cache,
/// the connector-contract gate and central permission protocol (Permissions.mo).
///
///   import Hub "mo:kebab-hub";
///   let hub = Hub.hub("<hub backend canister id>");
///   let r = await hub.redeemTicket(ticket);
///
/// See sdk/README.md for the full wiring and docs/agent/onboard-app.md for
/// the step-by-step an agent (or a human) follows.

import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Map "mo:core/Map";
import Text "mo:core/Text";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Blob "mo:core/Blob";
import Permissions "Permissions";

module {
  /// A complete directory response grants at most 60 seconds of cached access.
  /// Record the request START time, so a slow response cannot extend old rights.
  public let DIRECTORY_LEASE_NS : Int = 60_000_000_000;
  public func directoryFresh(requestedAt : Int) : Bool {
    let now = Time.now();
    requestedAt > 0 and requestedAt <= now and now - requestedAt < DIRECTORY_LEASE_NS;
  };
  public type PermissionStatus = Permissions.Status;
  public type LegacyGrant = Permissions.LegacyGrant;
  /// Missing, mismatched and unknown permission data never falls back to local roles.
  public func appRole(people : Map.Map<Text, ConnectorUser>, email : Text, app : Text) : Text {
    let u = people.get(email) ?? (return "none");
    if (not u.active or attribute(u, "appPermissionModel") != Permissions.model or attribute(u, "appPermissionApp") != app) return "none";
    let role = attribute(u, "appRole");
    if (Permissions.valid(app, role)) role else "none";
  };
  public func appRoleSource(people : Map.Map<Text, ConnectorUser>, email : Text) : Text {
    let u = people.get(email) ?? (return "Hub permissions unavailable");
    if (attribute(u, "appPermissionModel") != Permissions.model) return "Hub permissions unavailable";
    "Hub · " # attribute(u, "appRoleSource");
  };
  public func permissionRevision(people : Map.Map<Text, ConnectorUser>, app : Text) : Text {
    var revision = "";
    for (u in people.values()) if (u.active) {
      if (attribute(u, "appPermissionModel") != Permissions.model or attribute(u, "appPermissionApp") != app) return "";
      let r = attribute(u, "appPermissionRevision");
      if (r == "" or (revision != "" and revision != r)) return "";
      revision := r;
    };
    revision;
  };
  // ---------- hub types (mirror hub/backend/backend.did exactly) ----------

  public type Access = { #active; #inactive; #unknown };

  /// A person as stored in your directory cache. Unchanged since 0.1 on purpose: it sits inside
  /// stable maps in every app, and a stable record cannot grow (not even by an optional field).
  /// The person's stable id travels separately — see `DirectoryRow` and `ids` below.
  public type ConnectorUser = {
    active : Bool;
    attributes : [(Text, Text)]; // hub-side whitelisted org profile (title, department, manager, …) + ("groups", "a;b") = the person's hub groups + ("hubRole", "owner|admin|helpdesk") when they are hub staff
    displayName : Text;
    email : Text; // the person's CURRENT address — display data and the key of the cache; it can change, the id cannot
    externalId : Text;
    firstName : Text;
    lastName : Text;
    source : Text;
  };
  /// What the hub sends (connectorDirectory, hub_upsert): a ConnectorUser plus the person's stable id
  /// (hub ≥ 0.17; null from an older hub). Store your references to people as this id, never as the address —
  /// addresses change and get re-issued (docs/PERSON-IDS.md). Motoko lets you pass a DirectoryRow wherever a
  /// ConnectorUser is expected (extra fields are fine), so older code keeps compiling.
  public type DirectoryRow = {
    active : Bool;
    attributes : [(Text, Text)];
    displayName : Text;
    email : Text;
    externalId : Text;
    firstName : Text;
    lastName : Text;
    source : Text;
    id : ?Text;
  };

  public type Notify = {
    dedupeKey : Text; // same key within the window = one notification
    email : Text; // recipient (must be in the app's scope)
    kind : Text; // free tag, e.g. "ticket", "approval"
    title : Text; // what happened — the hub delivers title + link ONLY
    url : Text; // deep link into your app
  };

  /// suiteToken (hub ≥ 0.14): hand it to your frontend for the shared topbar (bell, menu, person) — read-only, 12 h, null on old hubs.
  /// id (hub ≥ 0.17): the person's stable id — what your app stores; null on old hubs (then use `pidOf(ids, email)` after the next directory pull).
  public type RedeemResult = { ok : Bool; email : Text; displayName : Text; detail : Text; suiteToken : ?Text; id : ?Text };

  /// What your app declares about itself — the hub's connect wizard reads it
  /// (optional contract method `hub_manifest`). Lanes = what you receive:
  ///   identity  e-mail, name, active (always granted)
  ///   profile   org attributes (title, department, manager, …)
  ///   groups    the person's hub groups ("groups" attribute, groupsOf)
  ///   roles     hub staff role ("hubRole" attribute)
  ///   avatars   profile pictures (connectorAvatar/s)
  ///   notify    you may call hub_notify
  ///   push      the hub pushes the directory into your hub_upsert every 15 min
  /// `needs` = without these the app does not work (the admin cannot untick
  /// them); `wants` = nice to have (off by default). Ask for the minimum.
  public type Manifest = { name : Text; version : Text; description : Text; needs : [Text]; wants : [Text] };
  /// What hub_aiCredentials hands out (lane "ai"). provider: "openai" (any chat/completions-compatible API) | "anthropic".
  public type AiCredentials = { provider : Text; url : Text; model : Text; visionModel : Text; key : Text };

  /// The hub as seen from an app canister. Every method is gated hub-side on
  /// the caller being a REGISTERED connector (Apps → Connect an app).
  public type Hub = actor {
    redeemTicket : shared (Text) -> async RedeemResult;
    checkAccess : shared query (Text) -> async Access;
    principalPerson : shared query (Text) -> async ?{ email : Text; access : Access };
    connectorDirectory : shared query () -> async [DirectoryRow];
    connectorLookup : shared query ([Text]) -> async [(Text, Text)]; // address -> person id for any address the hub has ever known (hub ≥ 0.17) — the one-time migration lane
    connectorAvatar : shared query (Text) -> async ?Blob;
    connectorAvatars : shared query ([Text]) -> async [(Text, Blob)];
    groupsOf : shared query (Text) -> async [Text];
    hub_notify : shared (Notify) -> async { ok : Bool; detail : Text };
    hub_aiCredentials : shared () -> async ?AiCredentials; // lane "ai": the company's AI key, one for the suite — cache ≤ 5 min, never store
    hub_aiUsed : shared (Nat) -> async (); // report your calls in batches so owners see who uses the key
    hub_aiStatus : shared query () -> async ?{ connectorId : Nat; keySet : Bool; laneGranted : Bool; provider : Text; model : Text; visionModel : Text }; // for your settings page: say precisely what is missing
  };

  public func hub(canisterId : Text) : Hub = actor (canisterId);

  // ---------- the contract YOUR app implements (hub is the only caller) ----------
  //
  //   public shared ({ caller }) func hub_upsert(rows : [Hub.DirectoryRow]) : async Nat
  //   public shared ({ caller }) func hub_deactivate(emails : [Text]) : async Nat
  //   public shared query func hub_ping() : async Text   // your app slug
  //
  // Gate each one with `assert Hub.isHub(caller, hubCanisterId)`.
  //
  // OPTIONAL, recommended: declare yourself — the connect wizard shows name,
  // version and the lanes you need/want and pre-sets them:
  //   public shared query func hub_manifest() : async Hub.Manifest
  //
  // OPTIONAL, recommended: tell the hub where you use a group so admins see
  // the effect of a group before they touch it (queues, approvers, roles):
  //   public shared query func hub_usesGroup(name : Text) : async [Text]
  // Return short human phrases ("default queue of 3 request types"); [] when unused.

  public func isHub(caller : Principal, hubCanisterId : Text) : Bool {
    caller == Principal.fromText(hubCanisterId);
  };

  // ---------- sessions (session-token lane) ----------
  //
  // Keep `let sessions : Map.Map<Text, Session> = Map.empty()` as a stable
  // field in your actor and pass it in. Tokens come from raw_rand (see
  // README) — this module never generates entropy itself.

  public type Session = { email : Text; displayName : Text; createdAt : Int; expiresAt : Int };

  public func mintSession(sessions : Map.Map<Text, Session>, token : Text, email : Text, displayName : Text, ttlNanos : Int) : Session {
    let now = Time.now();
    let s : Session = { email = lower(email); displayName; createdAt = now; expiresAt = now + ttlNanos };
    Map.add(sessions, Text.compare, token, s);
    s;
  };

  /// Valid session or null (expired ones are removed on the way).
  public func session(sessions : Map.Map<Text, Session>, token : Text) : ?Session {
    switch (Map.get(sessions, Text.compare, token)) {
      case null null;
      case (?s) {
        if (Time.now() > s.expiresAt) { ignore Map.delete(sessions, Text.compare, token); null } else ?s;
      };
    };
  };

  public func endSession(sessions : Map.Map<Text, Session>, token : Text) {
    ignore Map.delete(sessions, Text.compare, token);
  };

  /// Kill every session of these people — call it from hub_deactivate.
  public func endSessionsOf(sessions : Map.Map<Text, Session>, emails : [Text]) : Nat {
    let victims = List.empty<Text>();
    for ((tok, s) in Map.entries(sessions)) {
      for (e in emails.vals()) if (lower(e) == s.email) List.add(victims, tok);
    };
    for (tok in List.toArray(victims).vals()) ignore Map.delete(sessions, Text.compare, tok);
    List.toArray(victims).size();
  };

  /// Drop sessions past their expiry (call from a timer or opportunistically).
  public func pruneSessions(sessions : Map.Map<Text, Session>) : Nat {
    let now = Time.now();
    let dead = List.empty<Text>();
    for ((tok, s) in Map.entries(sessions)) if (now > s.expiresAt) List.add(dead, tok);
    for (tok in List.toArray(dead).vals()) ignore Map.delete(sessions, Text.compare, tok);
    List.toArray(dead).size();
  };

  // ---------- directory cache ----------
  //
  // Keep `let people : Map.Map<Text, ConnectorUser> = Map.empty()` (key =
  // lowercased email) as a stable field. Pull `hub.connectorDirectory()` on a
  // 30-second timer and on stale sign-ins, then `replaceDirectory`. Record the
  // request start time and deny access when `directoryFresh` is false. Partial
  // hub_upsert pushes use `upsert`; they never renew the complete-directory lease.

  public func upsert(people : Map.Map<Text, ConnectorUser>, rows : [ConnectorUser]) : Nat {
    var n = 0;
    for (r in rows.vals()) { Map.add(people, Text.compare, lower(r.email), r); n += 1 };
    n;
  };

  /// Apply a COMPLETE connectorDirectory response. Missing people have lost
  /// this app's scope, even if they are still active elsewhere in the company.
  /// Keep an inactive record for historical references, and revoke sessions.
  /// Use upsert for partial push batches; absence in a batch is not revocation.
  public func replaceDirectory(people : Map.Map<Text, ConnectorUser>, sessions : Map.Map<Text, Session>, rows : [ConnectorUser]) : Nat {
    let incoming = Map.empty<Text, Bool>();
    for (r in rows.values()) incoming.add(lower(r.email), r.active);
    let revoked = List.empty<Text>();
    for ((email, u) in people.entries().toArray().values()) {
      if (incoming.get(email) != ?true) {
        people.add(email, { u with active = false; attributes = [] });
        revoked.add(email);
      };
    };
    for (r in rows.values()) {
      if (not r.active) revoked.add(lower(r.email));
    };
    ignore endSessionsOf(sessions, revoked.toArray());
    upsert(people, rows);
  };

  // ---------- person ids (hub ≥ 0.17) ----------
  //
  // Keep two more stable fields next to `people`:
  //   let ids : Map.Map<Text, Text> = Map.empty()           // address -> person id, every address this app has seen
  //   let former : Map.Map<Text, ConnectorUser> = Map.empty() // id -> last known row of a person whose address moved on
  // and apply complete directory replies with `syncDirectory` instead of `replaceDirectory`.
  // Store people in YOUR data as `pidOf(ids, email)`; render them with `personById`.
  // A person the hub does not know any more (or an id from an older hub) is `legacy:<address>`.

  public func rowId(r : DirectoryRow) : Text = switch (r.id) { case (?i) { if (i == "") "legacy:" # lower(r.email) else i }; case null "legacy:" # lower(r.email) };
  public func isLegacy(pid : Text) : Bool = Text.startsWith(pid, #text "legacy:");
  /// the id to store for an address: the hub's id when known, else a legacy marker that still resolves to the address
  public func pidOf(ids : Map.Map<Text, Text>, email : Text) : Text {
    switch (Map.get(ids, Text.compare, lower(email))) { case (?p) p; case null "legacy:" # lower(email) };
  };
  /// Bookkeeping for one directory row (complete sync or partial push). Two invariants hold afterwards:
  ///   1. an address that arrives with a different id than before parks the previous holder's row under `former`
  ///      and ends their sessions — nothing of theirs attaches to the newcomer;
  ///   2. one id has ONE address: when `e` now carries `pid`, older addresses still pointing at that id are a
  ///      rename and are retired — otherwise emailOf/personById could keep answering the dead address.
  func applyRow(people : Map.Map<Text, ConnectorUser>, ids : Map.Map<Text, Text>, former : Map.Map<Text, ConnectorUser>, sessions : Map.Map<Text, Session>, rev : Map.Map<Text, Text>, r : DirectoryRow) {
    let e = lower(r.email);
    let incomingId = rowId(r);
    switch (Map.get(ids, Text.compare, e)) {
      case (?old) {
        if (old != incomingId and not isLegacy(old)) {
          switch (Map.get(people, Text.compare, e)) { case (?u) Map.add(former, Text.compare, old, { u with active = false; attributes = [] }); case null {} };
          ignore endSessionsOf(sessions, [e]); // the address changed hands: whoever was signed in as it is out
          ignore Map.delete(rev, Text.compare, old);
        };
      };
      case null {};
    };
    if (not isLegacy(incomingId)) {
      switch (Map.get(rev, Text.compare, incomingId)) {
        case (?prev) { if (prev != e) ignore Map.delete(ids, Text.compare, prev) }; // renamed: retire the old address
        case null {};
      };
      Map.add(rev, Text.compare, incomingId, e);
      Map.add(ids, Text.compare, e, incomingId);
    } else if (not Map.containsKey(ids, Text.compare, e)) {
      Map.add(ids, Text.compare, e, incomingId); // never downgrade a real id to a legacy marker
    };
    ignore Map.delete(former, Text.compare, incomingId); // back in the directory → no longer former
  };
  func reverseIds(ids : Map.Map<Text, Text>) : Map.Map<Text, Text> {
    let rev = Map.empty<Text, Text>();
    for ((e, p) in Map.entries(ids)) if (not isLegacy(p)) Map.add(rev, Text.compare, p, e);
    rev;
  };
  /// Complete directory reply (hub ≥ 0.17): like replaceDirectory, plus the id table and the former-holder table.
  /// When an address arrives with a different id than before, the previous holder's row is kept under `former`
  /// so their name still renders on their old records — and nothing of theirs attaches to the newcomer.
  /// A renamed person (same id, new address) keeps one address: the old one is dropped from `ids`.
  public func syncDirectory(people : Map.Map<Text, ConnectorUser>, ids : Map.Map<Text, Text>, former : Map.Map<Text, ConnectorUser>, sessions : Map.Map<Text, Session>, rows : [DirectoryRow]) : Nat {
    let rev = reverseIds(ids);
    for (r in rows.vals()) applyRow(people, ids, former, sessions, rev, r);
    // data from before 0.4 may still hold several addresses per id: keep exactly the one the hub sent
    let stale = List.empty<Text>();
    for ((a, p) in Map.entries(ids)) {
      switch (Map.get(rev, Text.compare, p)) { case (?cur) { if (cur != a and not isLegacy(p)) List.add(stale, a) }; case null {} };
    };
    for (a in List.values(stale)) ignore Map.delete(ids, Text.compare, a);
    replaceDirectory(people, sessions, rows);
  };
  /// Partial push from the hub (your `hub_upsert`): the SAME id bookkeeping as syncDirectory for the rows given
  /// (former holder parked, sessions of a re-issued address ended, renamed address retired), then `upsert`.
  /// Use this instead of writing `ids` yourself — a raw `Map.add(ids, …)` skips the hand-over protection.
  public func upsertRows(people : Map.Map<Text, ConnectorUser>, ids : Map.Map<Text, Text>, former : Map.Map<Text, ConnectorUser>, sessions : Map.Map<Text, Session>, rows : [DirectoryRow]) : Nat {
    let rev = reverseIds(ids);
    let revoked = List.empty<Text>();
    for (r in rows.vals()) { applyRow(people, ids, former, sessions, rev, r); if (not r.active) List.add(revoked, lower(r.email)) };
    ignore endSessionsOf(sessions, List.toArray(revoked));
    upsert(people, rows);
  };
  /// The address that carries an id right now — prefers an address whose row is active when several still point at it.
  func addrOf(people : Map.Map<Text, ConnectorUser>, ids : Map.Map<Text, Text>, pid : Text) : ?Text {
    var found : ?Text = null;
    for ((e, p) in Map.entries(ids)) if (p == pid) {
      if (isActive(people, e)) return ?e;
      if (found == null) found := ?e;
    };
    found;
  };
  public type Person = { id : Text; email : Text; displayName : Text; active : Bool; known : Bool };
  /// Render a stored id: the current row, else the former-holder row, else the legacy address, else "former person".
  public func personById(people : Map.Map<Text, ConnectorUser>, ids : Map.Map<Text, Text>, former : Map.Map<Text, ConnectorUser>, pid : Text) : Person {
    if (pid == "") return { id = ""; email = ""; displayName = ""; active = false; known = false };
    switch (addrOf(people, ids, pid)) {
      case (?e) { switch (Map.get(people, Text.compare, e)) { case (?u) return { id = pid; email = u.email; displayName = u.displayName; active = u.active; known = true }; case null {} } };
      case null {};
    };
    switch (Map.get(former, Text.compare, pid)) { case (?u) return { id = pid; email = u.email; displayName = u.displayName; active = false; known = true }; case null {} };
    switch (Text.stripStart(pid, #text "legacy:")) {
      case (?e) {
        switch (Map.get(people, Text.compare, e)) { case (?u) ({ id = pid; email = u.email; displayName = u.displayName; active = u.active; known = true }); case null ({ id = pid; email = e; displayName = e; active = false; known = false }) };
      };
      case null ({ id = pid; email = ""; displayName = "former person"; active = false; known = false });
    };
  };
  /// The current address of a stored id ("" when the person left and their address moved on).
  /// (Since 0.4.0 an id has one address in `ids`; while several still point at it — data from before 0.4 — the
  /// active one wins. Pass `people` via `currentEmailOf` to get that preference; this variant keeps the old signature.)
  public func emailOf(ids : Map.Map<Text, Text>, pid : Text) : Text {
    for ((e, p) in Map.entries(ids)) if (p == pid) return e;
    switch (Text.stripStart(pid, #text "legacy:")) { case (?e) e; case null "" };
  };
  /// The current address of a stored id, preferring an address whose row is active ("" when the person left).
  public func currentEmailOf(people : Map.Map<Text, ConnectorUser>, ids : Map.Map<Text, Text>, pid : Text) : Text {
    switch (addrOf(people, ids, pid)) { case (?e) e; case null { switch (Text.stripStart(pid, #text "legacy:")) { case (?e) e; case null "" } } };
  };
  /// Is this id an active person in the directory right now?
  public func isActiveId(people : Map.Map<Text, ConnectorUser>, ids : Map.Map<Text, Text>, pid : Text) : Bool {
    switch (addrOf(people, ids, pid)) { case (?e) return isActive(people, e); case null {} };
    switch (Text.stripStart(pid, #text "legacy:")) { case (?e) isActive(people, e); case null false };
  };
  /// One-time migration of e-mail-keyed data (docs/PERSON-IDS.md): ask the hub for the ids of every address you
  /// store, then rewrite with `migrateKey`. Unknown addresses become `legacy:<address>` and still render.
  public func lookupIds(h : Hub, emails : [Text]) : async [(Text, Text)] {
    if (emails.size() == 0) return [];
    await (with timeout = 60) h.connectorLookup(emails);
  };
  public func migrateKey(found : Map.Map<Text, Text>, email : Text) : Text {
    let e = lower(email);
    if (e == "") return "";
    switch (Map.get(found, Text.compare, e)) { case (?p) p; case null "legacy:" # e };
  };

  /// Mark inactive (never delete — their data stays as archive).
  public func deactivate(people : Map.Map<Text, ConnectorUser>, emails : [Text]) : Nat {
    var n = 0;
    for (e in emails.vals()) {
      switch (Map.get(people, Text.compare, lower(e))) {
        case (?u) { Map.add(people, Text.compare, lower(e), { u with active = false }); n += 1 };
        case null {};
      };
    };
    n;
  };

  public func isActive(people : Map.Map<Text, ConnectorUser>, email : Text) : Bool {
    switch (Map.get(people, Text.compare, lower(email))) { case (?u) u.active; case null false };
  };

  public func attribute(u : ConnectorUser, key : Text) : Text {
    for ((k, v) in u.attributes.vals()) if (k == key) return v;
    "";
  };

  // ---------- helpers ----------

  public func lower(t : Text) : Text = Text.toLower(t);

  /// mo:json (1.4) traps on JSON surrogate-pair escapes (`\uD83D\uDE00` — emoji in a Slack message, a DNS TXT
  /// record, a profile field). Run every body from outside through this BEFORE `Json.parse`; the escapes become `?`.
  public func sanitizeSurrogates(t : Text) : Text {
    // Work on flat UTF-8 bytes. Text.fromIter concatenates one character at a
    // time: large responses then trap in text_len while the JSON lexer reads them.
    let cs = Blob.toArray(Text.encodeUtf8(t));
    let n = cs.size();
    let out = List.empty<Nat8>();
    var i = 0;
    func hex(c : Nat8) : Bool = (c >= 48 and c <= 57) or (c >= 65 and c <= 70) or (c >= 97 and c <= 102);
    while (i < n) {
      // A quoted backslash belongs to the string, not to a Unicode escape.
      if (i + 1 < n and cs[i] == 92 and cs[i + 1] == 92) {
        out.add(92 : Nat8); out.add(92 : Nat8); i += 2;
      } else {
        let isSur = i + 5 < n and cs[i] == 92 and cs[i + 1] == 117 and (cs[i + 2] == 68 or cs[i + 2] == 100) and
          ((cs[i + 3] >= 56 and cs[i + 3] <= 57) or (cs[i + 3] >= 65 and cs[i + 3] <= 70) or (cs[i + 3] >= 97 and cs[i + 3] <= 102)) and hex(cs[i + 4]) and hex(cs[i + 5]);
        if (isSur) { out.add(63 : Nat8); i += 6 } else { out.add(cs[i]); i += 1 };
      };
    };
    Text.decodeUtf8(Blob.fromArray(out.toArray())) ?? t;
  };

  /// Ticket sanity before the inter-canister call: hex, 16–160 chars.
  public func ticketLooksValid(t : Text) : Bool {
    let n = t.size();
    if (n < 16 or n > 160) return false;
    for (c in t.chars()) {
      if (not ((c >= '0' and c <= '9') or (c >= 'a' and c <= 'f') or (c >= 'A' and c <= 'F'))) return false;
    };
    true;
  };
};
