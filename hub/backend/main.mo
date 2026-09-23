import Displays "Displays";
import Brand "Brand";
import HubClient "../../sdk/motoko/src/lib";
import Operations "../../sdk/motoko/src/Operations";
/// kebab-stack hub — people, sign-in, apps and backups on a cloud engine
///
/// One canonical store of a company's people, fed from three sources (typed
/// in here, pushed by SCIM 2.0, pulled from Okta), one passkey sign-in, and
/// one contract through which every connected app gets its users, its access
/// decisions and its lock-outs — instead of each app syncing on its own.
///
/// Sync model:
///   - PULL: HTTPS outcalls to the Okta Users API per connection
///     (direct aaaaa-aa call, is_replicated=false — zero cycles on an engine).
///   - PUSH (instant deprovisioning): Okta Event Hooks POST to
///     /hooks/okta/<connId>/<secret> on this canister — deactivations and
///     suspensions take effect the moment Okta fires the event; SCIM clients
///     push to /scim/v2.
///   - Apps gate access via checkAccess(email): the hub is the
///     authorization source of truth, independent of any sync lag.
///
/// Connector contract (the candid every app implements — see sdk/):
///   hub_upsert     : (vec ConnectorUser) -> (nat)
///   hub_deactivate : (vec text) -> (nat)      // emails
///   hub_ping       : () -> (text) query
///
/// House conventions: no committed canister mappings; placeholders in dist/;
/// install per docs/INSTALL.md.

import Support "../../sdk/motoko/src/Support";
import Hardware "../../sdk/motoko/src/Hardware";
import Lifecycle "Lifecycle";
import Permissions "../../sdk/motoko/src/Permissions";
import Option "mo:core/Option";
import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat16 "mo:core/Nat16";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Float "mo:core/Float";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Error "mo:core/Error";
import Timer "mo:core/Timer";
import Iter "mo:core/Iter";
import Json "mo:json";
import Runtime "mo:core/Runtime";
import ECDSA "mo:ecdsa";
import Sha256 "mo:sha2/Sha256";
import Rsa "Rsa";

persistent actor UserHub {

  // ---------- auth ----------

  let admins : Map.Map<Principal, Text> = Map.empty<Principal, Text>(); // principal -> label

  func isOwner(p : Principal) : Bool = Principal.isController(p);

  // ---------- roles ----------
  // owner    = everything, incl. sources, tokens, roles
  // admin    = people, groups, apps, branding — not sources/tokens/roles
  // helpdesk = day-2 support: kill switch, invites, read-only otherwise
  //
  // The role belongs to the PERSON (directory e-mail): every passkey linked
  // to that person inherits it, and connected apps see it as "hubRole". The
  // principal-level `admins`/`adminRoles` maps remain for bootstrap (the
  // deployer's passkey before it is linked to anyone) and legacy entries.
  // isAdmin(p) means "any staff member" and keeps gating reads + helpdesk actions.
  let adminRoles : Map.Map<Principal, Text> = Map.empty<Principal, Text>(); // absent = "admin"
  let personRoles : Map.Map<Text, Text> = Map.empty<Text, Text>(); // email -> owner | admin | helpdesk
  func rank(r : Text) : Nat = if (r == "owner") 3 else if (r == "admin") 2 else if (r == "helpdesk") 1 else 0;
  func personRoleOf(email : Text) : Text = switch (Map.get(personRoles, Text.compare, email)) { case (?r) r; case null "" };
  /// role a principal gets through the person it is linked to (deactivated people carry none)
  func linkedRole(p : Principal) : Text {
    switch (Map.get(principalLinks, Principal.compare, p)) {
      case (?e) { if (accessOf(e) == #active) personRoleOf(e) else "" };
      case null "";
    };
  };
  func roleOf(p : Principal) : Text {
    if (isOwner(p)) return "owner"; // controllers are always owners
    switch (principalLinks.get(p)) { case (?email) { if (accessOf(email) != #active) return "" }; case null {} };
    var best = if (Map.containsKey(admins, Principal.compare, p)) (switch (Map.get(adminRoles, Principal.compare, p)) { case (?r) r; case null "admin" }) else "";
    let lr = linkedRole(p);
    if (rank(lr) > rank(best)) best := lr;
    best;
  };
  func isAdmin(p : Principal) : Bool = roleOf(p) != "";
  func isOwnerRole(p : Principal) : Bool = roleOf(p) == "owner";
  func isAdminRole(p : Principal) : Bool { let r = roleOf(p); r == "owner" or r == "admin" };

  // Protect the configured identity rank even while that person is deactivated.
  // Include legacy principal roles and controller links, not only personRoles.
  func identityRank(email : Text) : Nat {
    var result = rank(personRoleOf(email));
    for ((pr, e) in principalLinks.entries()) if (e == email) {
      let r = if (isOwner(pr)) rank("owner") else if (admins.containsKey(pr)) rank(switch (adminRoles.get(pr)) { case (?v) v; case null "admin" }) else 0;
      if (r > result) result := r;
    };
    result;
  };
  func canManagePerson(caller : Principal, email : Text) : Bool {
    isOwnerRole(caller) or rank(roleOf(caller)) > identityRank(email);
  };

  public shared query ({ caller }) func myRole() : async Text { roleOf(caller) };

  /// Semantic version of this hub build — the same string as hub/mops.toml and the frontend (sdk/tools/check-sdk.py keeps the three in step).
  /// The frontend shows it bottom-left with the changelog and warns when backend and frontend differ.
  /// `transient`: in a persistent actor every plain `let` is STABLE and keeps its first-install value across upgrades —
  /// a stable constant is frozen forever (that is how 0.8.1 kept reporting 0.8.0). Constants belong in `transient let`.
  transient let BUILD_VERSION : Text = "0.32.2";
  /// stable since 0.8.0 and therefore frozen at "0.8.0"; kept only because a stable field cannot be dropped without a migration. Do not read.
  let HUB_VERSION : Text = "0.13.0";
  public query func version() : async Text { BUILD_VERSION };

  public shared ({ caller }) func setAdminRole(p : Text, role : Text) : async Bool {
    assert isOwnerRole(caller);
    if (role != "owner" and role != "admin" and role != "helpdesk") return false;
    let pr = Principal.fromText(p);
    if (not Map.containsKey(admins, Principal.compare, pr)) return false;
    Map.add(adminRoles, Principal.compare, pr, role);
    journal("admin", "role of " # p # " set to " # role, caller);
    true;
  };

  /// Give a PERSON a hub role ("" removes it). Owners only. Every passkey
  /// linked to the person inherits it; apps see it as hubRole.
  public shared ({ caller }) func setPersonRole(email : Text, role : Text) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    if (role != "" and role != "owner" and role != "admin" and role != "helpdesk") return { ok = false; detail = "role must be owner, admin, helpdesk or empty" };
    let e = lower(norm(email));
    var found = false;
    for ((_, u) in Map.entries(users)) if (u.email == e) found := true;
    if (not found) return { ok = false; detail = "no directory entry with that e-mail" };
    // never leave the hub without an owner
    if (personRoleOf(e) == "owner" and role != "owner") {
      var others = 0;
      for ((em, r) in Map.entries(personRoles)) if (r == "owner" and em != e and accessOf(em) == #active and principalLinks.values().any(func x = x == em)) others += 1;
      for ((pr, _) in Map.entries(admins)) if (roleOf(pr) == "owner" and principalLinks.get(pr) != ?e) others += 1;
      if (others == 0 and not isOwner(caller)) return { ok = false; detail = "this is the last owner — name another owner first" };
    };
    if (role == "") ignore Map.delete(personRoles, Text.compare, e) else Map.add(personRoles, Text.compare, e, role);
    journal("admin", "role of " # e # " set to " # (if (role == "") "member" else role), caller);
    { ok = true; detail = "" };
  };

  public shared query ({ caller }) func listPersonRoles() : async [{ email : Text; displayName : Text; role : Text; active : Bool }] {
    assert isAdmin(caller);
    let out = List.empty<{ email : Text; displayName : Text; role : Text; active : Bool }>();
    for ((e, r) in Map.entries(personRoles)) {
      var name = e;
      for ((_, u) in Map.entries(users)) if (u.email == e and u.displayName != "") name := u.displayName;
      List.add(out, { email = e; displayName = name; role = r; active = accessOf(e) == #active });
    };
    List.toArray(out);
  };

  public shared query ({ caller }) func whoami() : async Text { Principal.toText(caller) };
  public shared query ({ caller }) func amIAdmin() : async Bool { isAdmin(caller) };

  public shared ({ caller }) func addAdmin(p : Text, name : Text) : async Bool {
    assert isOwnerRole(caller);
    let pr = Principal.fromText(p);
    if (Principal.isAnonymous(pr)) return false; // would make EVERY anonymous caller staff
    Map.add(admins, Principal.compare, pr, name);
    journal("admin", "added admin " # name # " (" # p # ")", caller);
    true;
  };

  public shared query ({ caller }) func listAdmins() : async [{ principal : Text; name : Text; role : Text }] {
    assert isAdmin(caller);
    let out = List.empty<{ principal : Text; name : Text; role : Text }>();
    for ((pr, name) in Map.entries(admins)) List.add(out, { principal = Principal.toText(pr); name; role = roleOf(pr) });
    List.toArray(out);
  };

  public shared ({ caller }) func removeAdmin(p : Text) : async Bool {
    assert isOwnerRole(caller);
    ignore Map.delete(admins, Principal.compare, Principal.fromText(p));
    ignore Map.delete(adminRoles, Principal.compare, Principal.fromText(p)); // a re-added principal starts as plain admin
    journal("admin", "removed admin " # p, caller);
    true;
  };

  // ---------- journal ----------

  type JournalEntry = { at : Int; kind : Text; detail : Text; by : Text };
  let runs : List.List<JournalEntry> = List.empty<JournalEntry>();

  func cutText(t : Text, n : Nat) : Text { if (t.size() <= n) return t; var out = ""; var i = 0; for (c in t.chars()) { if (i < n) out #= Char.toText(c); i += 1 }; out };
  transient let syncCollisionNoted : Map.Map<Text, Int> = Map.empty<Text, Int>();
  func noteSyncCollision(key : Text, kept : Text, wanted : Text) {
    let last = switch (Map.get(syncCollisionNoted, Text.compare, key)) { case (?t) t; case null 0 };
    if (Time.now() - last < 24 * 3_600_000_000_000) return;
    Map.add(syncCollisionNoted, Text.compare, key, Time.now());
    journal("persons", "sync: the source wants " # kept # " to become " # wanted # ", which another active person holds — kept the old address; resolve it at the source", SYSTEM_PRINCIPAL);
  };
  func journal(kind : Text, detail : Text, by : Principal) {
    if (kind == "local" or kind == "kill" or kind == "conn" or kind == "scim" or kind == "sync" or kind == "hook" or kind == "people" or kind == "kind") observeLifecycle();
    List.add(runs, { at = Time.now(); kind; detail; by = Principal.toText(by) });
    // cap at 800, keep the newest 500
    if (List.size(runs) > 800) {
      let arr = List.toArray(runs);
      List.clear(runs);
      let n = arr.size();
      var i : Nat = n - 500;
      while (i < n) { List.add(runs, arr[i]); i += 1 };
    };
  };

  public shared query ({ caller }) func getJournal() : async [JournalEntry] {
    assert isAdmin(caller);
    let arr = List.toArray(runs);
    let n = arr.size();
    Array.tabulate<JournalEntry>(Nat.min(n, 250), func i = arr[n - 1 - i]);
  };

  // ---------- small helpers ----------

  func lower(t : Text) : Text = Text.toLower(t);
  func norm(t : Text) : Text = Text.trim(t, #char ' ');

  func maskToken(t : Text) : Text {
    if (t == "") return "";
    let n = t.size();
    if (n <= 8) return "••••";
    let arr = Text.toArray(t);
    var tail = "";
    var i : Nat = n - 4;
    while (i < n) { tail #= Char.toText(arr[i]); i += 1 };
    "••••…" # tail;
  };

  func hex(b : Blob) : Text {
    let digits = Text.toArray("0123456789abcdef");
    var out = "";
    for (byte in Blob.toArray(b).vals()) {
      let v = Nat8.toNat(byte);
      out #= Char.toText(digits[v / 16]) # Char.toText(digits[v % 16]);
    };
    out;
  };

  /// yield point: ends the current execution slice inside heavy loops so no
  /// single slice approaches the 40B instruction limit (IC0522).
  func yieldNow() : async () {};

  // base64 (standard, padded) + base64url (unpadded, JWS) — no external dep
  func b64core(bytes : [Nat8], urlSafe : Bool) : Text {
    let chars = Text.toArray(
      if (urlSafe) "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" else "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    );
    var out = "";
    var i = 0;
    let n = bytes.size();
    while (i < n) {
      let b0 = Nat8.toNat(bytes[i]);
      let b1 = if (i + 1 < n) Nat8.toNat(bytes[i + 1]) else 0;
      let b2 = if (i + 2 < n) Nat8.toNat(bytes[i + 2]) else 0;
      out #= Char.toText(chars[b0 / 4]);
      out #= Char.toText(chars[(b0 % 4) * 16 + b1 / 16]);
      if (i + 1 < n) out #= Char.toText(chars[(b1 % 16) * 4 + b2 / 64]) else if (not urlSafe) out #= "=";
      if (i + 2 < n) out #= Char.toText(chars[b2 % 64]) else if (not urlSafe) out #= "=";
      i += 3;
    };
    out;
  };
  func base64(t : Text) : Text = b64core(Blob.toArray(Text.encodeUtf8(t)), false);
  func b64url(bytes : [Nat8]) : Text = b64core(bytes, true);
  func b64urlText(t : Text) : Text = b64core(Blob.toArray(Text.encodeUtf8(t)), true);

  /// base64url decode (tolerates missing padding and standard alphabet)
  func b64urlDecode(t : Text) : ?[Nat8] {
    func val(c : Char) : ?Nat {
      if (c >= 'A' and c <= 'Z') return ?(Nat32.toNat(Char.toNat32(c) - 65));
      if (c >= 'a' and c <= 'z') return ?(Nat32.toNat(Char.toNat32(c) - 97) + 26);
      if (c >= '0' and c <= '9') return ?(Nat32.toNat(Char.toNat32(c) - 48) + 52);
      if (c == '-' or c == '+') return ?62;
      if (c == '_' or c == '/') return ?63;
      null;
    };
    if (t.size() > 16_384) return null; // anonymous callers reach this (OIDC token endpoint) — bound the work
    let out = List.empty<Nat8>();
    var acc = 0;
    var bits = 0;
    for (c in t.chars()) {
      if (c != '=') {
        switch (val(c)) {
          case null return null;
          case (?v) {
            acc := acc * 64 + v;
            bits += 6;
            if (bits >= 8) {
              bits -= 8;
              List.add(out, ((acc / (2 ** bits)) % 256).toNat8());
              acc := acc % (2 ** bits); // keep the accumulator small: cost stays linear in the input
            };
          };
        };
      };
    };
    ?List.toArray(out);
  };

  /// percent-encode everything outside RFC 3986 unreserved characters
  func urlEnc(t : Text) : Text {
    let digits = Text.toArray("0123456789ABCDEF");
    var out = "";
    for (b in Blob.toArray(Text.encodeUtf8(t)).vals()) {
      let n = Nat8.toNat(b);
      let c = n.toNat32().toChar();
      let unreserved = (c >= 'A' and c <= 'Z') or (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-' or c == '.' or c == '_' or c == '~';
      if (unreserved) out #= Char.toText(c) else out #= "%" # Char.toText(digits[n / 16]) # Char.toText(digits[n % 16]);
    };
    out;
  };

  // ---------- first-run setup + org config (wizard) ----------
  // A fresh install has no admins map entries, but the deployer is always
  // isOwner (controller) — that is the bootstrap: the controller signs in,
  // runs setup once, and becomes the first named admin.

  var orgName : Text = "";
  var directoryMode : Text = ""; // "" until setup; then: standalone | scim | hybrid
  var setupDone : Bool = false;

  public query func getSetup() : async { orgName : Text; directoryMode : Text; setupDone : Bool } {
    { orgName; directoryMode; setupDone };
  };

  public shared ({ caller }) func runSetup(name : Text, mode : Text, adminLabel : Text) : async Bool {
    assert isAdmin(caller);
    if (setupDone) return false;
    let n = norm(name);
    if (n == "" or (mode != "standalone" and mode != "scim" and mode != "hybrid")) return false;
    orgName := n;
    directoryMode := mode;
    if (not Map.containsKey(admins, Principal.compare, caller)) {
      Map.add(admins, Principal.compare, caller, norm(adminLabel));
    };
    setupDone := true;
    journal("setup", "first-run setup: org \"" # n # "\", directory mode " # mode, caller);
    true;
  };

  /// First run without a terminal: on a hub that is not set up yet, the first
  /// passkey to sign in claims it — org name, and the person behind the
  /// passkey (name + e-mail) is created in the directory, linked, and made
  /// owner. Closed the moment setup is done. The window is the minute between
  /// deploy and first open, on a URL only the deployer knows. The CLI
  /// `addAdmin` stays as break-glass for a lost passkey.
  // ---- cooked by the kitchen: a one-time claim code closes the claim window ----
  // The kitchen wires vault + kitchen ids into a fresh hub (controller-gated,
  // unclaimed hubs only) and hands the person who cooked it a 256-bit code;
  // only that code may claim the hub. Hubs deployed by hand keep the open
  // first-sign-in claim.
  var claimCode : Text = "";
  var claimUsed : Bool = false;
  // The kitchen also plants the code as the canister environment variable
  // KEBAB_CLAIM_CODE at CREATION time — so the very first message this hub
  // ever handles is already protected, before bootstrapWire can arrive.
  func effectiveClaimCode<system>() : Text {
    if (claimUsed) return "";
    if (claimCode != "") return claimCode;
    switch (Runtime.envVar<system>("KEBAB_CLAIM_CODE")) { case (?v) v; case null "" };
  };
  public shared ({ caller }) func bootstrapWire(args : { vaultId : Text; kitchenId : Text; claimCode : Text }) : async { ok : Bool; detail : Text } {
    if (not Principal.isController(caller)) return { ok = false; detail = "controllers only" };
    if (setupDone or Map.size(admins) > 0 or Map.size(personRoles) > 0) return { ok = false; detail = "this hub is already claimed — wiring is a first-run step" };
    // once wired, the kitchen and the vault (canister controllers) may not re-wire; a human controller (deployer) still may — break-glass
    if (claimCode != "" and (Principal.toText(caller) == kitchenId or Principal.toText(caller) == vaultId)) return { ok = false; detail = "already wired" };
    switch (principalSafe(args.vaultId)) { case (?p) vaultId := Principal.toText(p); case null { if (norm(args.vaultId) != "") return { ok = false; detail = "vaultId: not a canister id" } } };
    switch (principalSafe(args.kitchenId)) { case (?p) kitchenId := Principal.toText(p); case null return { ok = false; detail = "kitchenId: not a canister id" } };
    if (args.claimCode.size() < 32) return { ok = false; detail = "claim code too short" };
    claimCode := args.claimCode;
    journal("setup", "wired by the kitchen " # kitchenId # (if (vaultId != "") ", vault " # vaultId else "") # "; claim code set", caller);
    { ok = true; detail = "" };
  };
  public shared func claimNeedsCode() : async Bool { effectiveClaimCode<system>() != "" and not setupDone };
  public shared ({ caller }) func claimHubWithCode(code : Text, args : { orgName : Text; displayName : Text; email : Text }) : async { ok : Bool; detail : Text } {
    let want = effectiveClaimCode<system>();
    if (want == "" and not Principal.isController(caller)) return { ok = false; detail = "the installer must configure a one-time setup code first — see the installation guide" };
    if (want != "" and norm(code) != want) return { ok = false; detail = "wrong claim code — it is on the kitchen page that cooked this hub" };
    let r = claimInternal(caller, args);
    if (r.ok) { claimCode := ""; claimUsed := true };
    r;
  };
  public shared ({ caller }) func claimHub(args : { orgName : Text; displayName : Text; email : Text }) : async { ok : Bool; detail : Text } {
    if (effectiveClaimCode<system>() != "") return { ok = false; detail = "this hub was cooked by the kitchen — claim it with the code from the kitchen page" };
    if (not Principal.isController(caller)) return { ok = false; detail = "a one-time setup code is required — ask the installer" };
    claimInternal(caller, args);
  };
  func claimInternal(caller : Principal, args : { orgName : Text; displayName : Text; email : Text }) : { ok : Bool; detail : Text } {
    if (Principal.isAnonymous(caller)) return { ok = false; detail = "sign in first" };
    if (setupDone) return { ok = false; detail = "this hub is already set up" };
    let n = norm(args.orgName);
    let e = lower(norm(args.email));
    let dn = norm(args.displayName);
    if (n == "") return { ok = false; detail = "organization name is required" };
    if (dn == "") return { ok = false; detail = "your name is required" };
    if (e == "" or not Text.contains(e, #char '@')) return { ok = false; detail = "a valid e-mail is required — it becomes your identity in every connected app" };
    let key = userKey(LOCAL_CONN, e);
    if (not Map.containsKey(users, Text.compare, key)) {
      let now = Time.now();
      Map.add(users, Text.compare, key, { connId = LOCAL_CONN; externalId = e; email = e; displayName = dn; firstName = ""; lastName = ""; status = "ACTIVE"; activeIdp = true; override = null; attributes = []; createdAt = now; updatedAt = now });
    };
    Map.add(principalLinks, Principal.compare, caller, e);
    Map.add(personRoles, Text.compare, e, "owner");
    orgName := n;
    directoryMode := "standalone";
    setupDone := true;
    reconcilePersons();
    journal("setup", "hub claimed: org \"" # n # "\", owner " # e, caller);
    { ok = true; detail = "" };
  };

  /// Change org name / directory mode after setup (Settings). Mode is
  /// steering info, not a data-model switch: local (conn 0) and mastered
  /// users coexist, so switching loses nothing.
  public shared ({ caller }) func updateSetup(name : Text, mode : Text) : async Bool {
    assert isOwnerRole(caller);
    if (not setupDone) return false;
    let n = norm(name);
    if (n == "" or (mode != "standalone" and mode != "scim" and mode != "hybrid")) return false;
    orgName := n;
    directoryMode := mode;
    journal("setup", "settings updated: org \"" # n # "\", directory mode " # mode, caller);
    true;
  };

  // ---------- HTTPS outcalls (direct aaaaa-aa, proven zero-cycle on engines) ----------

  type HttpHeader = { name : Text; value : Text };
  type HttpResponsePayload = { status : Nat; headers : [HttpHeader]; body : Blob };
  type TransformArgs = { response : HttpResponsePayload; context : Blob };
  type HttpRequestArgs = {
    url : Text;
    max_response_bytes : ?Nat64;
    headers : [HttpHeader];
    body : ?Blob;
    method : { #get; #post; #head };
    transform : ?{ function : shared query TransformArgs -> async HttpResponsePayload; context : Blob };
    is_replicated : ?Bool; // false = single node, no consensus/transform — right for live APIs
  };
  transient let ic00 : actor {
    http_request : HttpRequestArgs -> async HttpResponsePayload;
    raw_rand : () -> async Blob;
  } = actor ("aaaaa-aa");

  func doOutcall(req : HttpRequestArgs) : async HttpResponsePayload {
    try {
      await ic00.http_request(req);
    } catch (e) {
      { status = 0; headers = []; body = Text.encodeUtf8("direct outcall failed: " # Error.message(e)) };
    };
  };

  /// Flat UTF-8 output avoids rebuilding a deep text rope for large profile fields.
  /// O(n) splitter for a top-level JSON array (no external JSON dependency for the hot path):
  /// mo:json parsing is quadratic on big docs, so each item is parsed alone.
  func splitJsonArray(body : Text) : ?[Text] {
    let cs = Blob.toArray(Text.encodeUtf8(body));
    let n = cs.size();
    var i = 0;
    while (i < n and (cs[i] == 32 or cs[i] == 10 or cs[i] == 13 or cs[i] == 9)) i += 1;
    if (i >= n or cs[i] != 91) return null;
    i += 1;
    let items = List.empty<Text>();
    let cur = List.empty<Nat8>();
    var depth = 0;
    var inStr = false;
    var esc = false;
    while (i < n) {
      let c = cs[i];
      if (inStr) {
        List.add(cur, c);
        if (esc) esc := false else if (c == 92) esc := true else if (c == 34) inStr := false;
      } else if (c == 34) { inStr := true; List.add(cur, c) } else if (c == 123 or c == 91) { depth += 1; List.add(cur, c) } else if (c == 125 or c == 93) {
        if (depth == 0 and c == 93) {
          if (List.size(cur) > 0) List.add(items, Text.decodeUtf8(Blob.fromArray(cur.toArray())) ?? "");
          return ?List.toArray(items);
        };
        if (depth == 0) return null;
        depth -= 1;
        List.add(cur, c);
      } else if (c == 44 and depth == 0) {
        List.add(items, Text.decodeUtf8(Blob.fromArray(cur.toArray())) ?? "");
        List.clear(cur);
      } else List.add(cur, c);
      i += 1;
    };
    null;
  };

  /// mo:json traps on JSON surrogate-pair escapes (emojis in profile fields) —
  /// neutralize them BEFORE parsing.
  func sanitizeSurrogates(t : Text) : Text = HubClient.sanitizeSurrogates(t);

  func jsonField(obj : Json.Json, names : [Text]) : Text {
    let kv = switch (obj) { case (#object_(pairs)) pairs; case (_) return "" };
    for (n in names.vals()) {
      let want = lower(n);
      for ((k, v) in kv.vals()) {
        if (lower(k) == want) {
          switch (v) {
            case (#string(s)) { if (s != "") return s };
            case (#number(#int(i))) { return Int.toText(i) };
            case (#number(#float(f))) { return Float.toText(f) };
            case (#bool(b)) { return if (b) "true" else "false" };
            case (_) {};
          };
        };
      };
    };
    "";
  };

  /// Flatten a JSON object's scalar fields into [(key, value)] — used to keep
  /// ALL IdP profile attributes without hardcoding a schema ("AIware": agents
  /// can read the full attribute set).
  func flattenObj(obj : Json.Json) : [(Text, Text)] {
    let kv = switch (obj) { case (#object_(pairs)) pairs; case (_) return [] };
    let out = List.empty<(Text, Text)>();
    for ((k, v) in kv.vals()) {
      switch (v) {
        case (#string(s)) List.add(out, (k, s));
        case (#number(#int(i))) List.add(out, (k, Int.toText(i)));
        case (#number(#float(f))) List.add(out, (k, Float.toText(f)));
        case (#bool(b)) List.add(out, (k, if (b) "true" else "false"));
        case (#null_) {};
        case (#array(items)) {
          var joined = "";
          for (it in items.vals()) {
            let s = switch (it) {
              case (#string(s)) s;
              case (#number(#int(i))) Int.toText(i);
              case (#number(#float(f))) Float.toText(f);
              case (#bool(b)) if (b) "true" else "false";
              case (_) "";
            };
            if (s != "") { if (joined != "") joined #= ", "; joined #= s };
          };
          if (joined != "") List.add(out, (k, joined));
        };
        case (_) {};
      };
    };
    List.toArray(out);
  };

  // ---------- IdP connections ----------

  type SyncStat = { at : Int; ok : Bool; detail : Text; fetched : Nat };
  type Conn = {
    id : Nat;
    name : Text;
    kind : Text; // "okta" | "entra" (entra: prepared, not yet implemented)
    baseUrl : Text; // e.g. https://acme.okta.com — no trailing slash
    token : Text; // OAuth client_secret of the API Services app. Write-only, never exposed.
    enabled : Bool;
    hookSecret : Text; // random path secret for the Okta Event Hook endpoint
    lastSync : ?SyncStat;
  };
  let conns : Map.Map<Nat, Conn> = Map.empty<Nat, Conn>();
  var nextConnId : Nat = 1;
  // OAuth client_id per connection (separate map: appended after go-live —
  // stable vars are APPEND-ONLY, never reshape a live record)
  let oauthClientIds : Map.Map<Nat, Text> = Map.empty<Nat, Text>();
  // P-256 signing key per connection for private_key_jwt (raw 32-byte
  // scalar). Generated IN the canister from raw_rand; never leaves it —
  // Okta only ever sees the public JWK.
  let oauthKeys : Map.Map<Nat, Blob> = Map.empty<Nat, Blob>();
  // reentrancy guard per connection: startedAt timestamp. A trap mid-sync
  // would leave a plain Bool guard stuck (state committed at earlier awaits
  // persists) — so the guard EXPIRES after 15 min instead (F1, security review).
  transient let syncing : Map.Map<Nat, Int> = Map.empty<Nat, Int>();
  let syncGuardTtlNs : Int = 15 * 60 * 1_000_000_000;
  func isSyncing(id : Nat) : Bool {
    switch (Map.get(syncing, Nat.compare, id)) {
      case (?t) Time.now() - t < syncGuardTtlNs;
      case null false;
    };
  };
  // live console line per connection: queries are served WHILE an update call
  // awaits outcalls, so the frontend polls getLive() during a sync for a
  // real-time ticker.
  transient let liveStatus : Map.Map<Nat, Text> = Map.empty<Nat, Text>();
  func live(id : Nat, t : Text) { Map.add(liveStatus, Nat.compare, id, t) };

  public shared query ({ caller }) func getLive(id : Nat) : async Text {
    assert isAdmin(caller);
    if (isSyncing(id)) { switch (Map.get(liveStatus, Nat.compare, id)) { case (?t) t; case null "" } } else "";
  };

  func snippet(t : Text, max : Nat) : Text {
    if (t.size() <= max) return t;
    let arr = Text.toArray(t);
    var s = "";
    var i = 0;
    while (i < max) { s #= Char.toText(arr[i]); i += 1 };
    s # "…";
  };
  // Bearer-token cache: client-credentials tokens live ~1h; refresh 2 min early
  transient let tokenCache : Map.Map<Nat, { access : Text; expiresAt : Int }> = Map.empty<Nat, { access : Text; expiresAt : Int }>();

  func clientIdOf(id : Nat) : Text = switch (Map.get(oauthClientIds, Nat.compare, id)) { case (?v) v; case null "" };

  // ---- private_key_jwt (ES256) ----

  transient let p256 = ECDSA.prime256v1Curve();

  func keyFor(id : Nat) : ?ECDSA.PrivateKey {
    switch (Map.get(oauthKeys, Nat.compare, id)) {
      case null null;
      case (?blob) {
        switch (ECDSA.privateKeyFromBytes(Blob.toArray(blob).vals(), #raw({ curve = p256 }))) {
          case (#ok(k)) ?k;
          case (#err(_)) null;
        };
      };
    };
  };

  func genKey(id : Nat) : async Bool {
    let entropy = await ic00.raw_rand();
    switch (ECDSA.generatePrivateKey(Blob.toArray(entropy).vals(), p256)) {
      case (#ok(k)) {
        Map.add(oauthKeys, Nat.compare, id, k.toBytes(#raw).toBlob());
        ignore Map.delete(tokenCache, Nat.compare, id);
        true;
      };
      case (#err(_)) false;
    };
  };

  /// Public JWK for the connection's signing key — paste into the Okta app
  /// (Client authentication: Public key / Private key).
  func jwkFor(id : Nat) : Text {
    switch (keyFor(id)) {
      case null "";
      case (?k) {
        let unc = k.getPublicKey().toBytes(#uncompressed); // 0x04 ‖ x(32) ‖ y(32)
        if (unc.size() != 65) return "";
        let x = Array.tabulate<Nat8>(32, func i = unc[1 + i]);
        let y = Array.tabulate<Nat8>(32, func i = unc[33 + i]);
        "{\"kty\":\"EC\",\"crv\":\"P-256\",\"kid\":\"user-hub-" # Nat.toText(id) # "\",\"x\":\"" # b64url(x) # "\",\"y\":\"" # b64url(y) # "\"}";
      };
    };
  };

  /// Signed client-assertion JWT (RFC 7523) for the token endpoint.
  func clientAssertion(c : Conn, cid : Text) : async { ok : Bool; jwt : Text; detail : Text } {
    let key = switch (keyFor(c.id)) { case (?k) k; case null return { ok = false; jwt = ""; detail = "no signing key — regenerate it and register the JWK in Okta" } };
    let nonce = await ic00.raw_rand(); // per-signature ECDSA nonce (MUST be fresh)
    let jtiSrc = await ic00.raw_rand();
    let jti = hex(Array.tabulate<Nat8>(16, func i = Blob.toArray(jtiSrc)[i]).toBlob());
    let nowS = Time.now() / 1_000_000_000;
    let header = "{\"alg\":\"ES256\",\"typ\":\"JWT\",\"kid\":\"user-hub-" # Nat.toText(c.id) # "\"}";
    let payload = "{\"iss\":\"" # cid # "\",\"sub\":\"" # cid # "\",\"aud\":\"" # c.baseUrl # "/oauth2/v1/token\",\"iat\":" # Int.toText(nowS) # ",\"exp\":" # Int.toText(nowS + 300) # ",\"jti\":\"" # jti # "\"}";
    let signingInput = b64urlText(header) # "." # b64urlText(payload);
    switch (key.sign(Blob.toArray(Text.encodeUtf8(signingInput)).vals(), Blob.toArray(nonce).vals())) {
      case (#err(e)) { { ok = false; jwt = ""; detail = "signing failed: " # e } };
      case (#ok(sig)) { { ok = true; jwt = signingInput # "." # b64url(sig.toBytes(#raw)); detail = "" } };
    };
  };

  /// OAuth 2.0 client credentials against the org authorization server.
  /// Primary lane: private_key_jwt (Okta mandates it on the org AS) — the
  /// ES256 client assertion is signed in-canister. Fallback lane:
  /// client_secret_basic, for orgs that allow secrets. Token comes from
  /// cache when still fresh.
  func bearerFor(c : Conn) : async { ok : Bool; auth : Text; detail : Text } {
    let cid = clientIdOf(c.id);
    if (cid == "") return { ok = false; auth = ""; detail = "no OAuth client id configured" };
    switch (Map.get(tokenCache, Nat.compare, c.id)) {
      case (?t) { if (t.expiresAt > Time.now() + 120_000_000_000) return { ok = true; auth = "Bearer " # t.access; detail = "" } };
      case null {};
    };
    live(c.id, "requesting OAuth token (" # c.baseUrl # ")…");
    let hasKey = Map.containsKey(oauthKeys, Nat.compare, c.id);
    var reqHeaders : [HttpHeader] = [
      { name = "Content-Type"; value = "application/x-www-form-urlencoded" },
      { name = "Accept"; value = "application/json" },
      { name = "User-Agent"; value = "kebabstack-hub" },
    ];
    var reqBody = "grant_type=client_credentials&scope=okta.users.read";
    if (hasKey) {
      let ca = await clientAssertion(c, cid);
      if (not ca.ok) return { ok = false; auth = ""; detail = ca.detail };
      reqBody #= "&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer&client_assertion=" # ca.jwt;
    } else {
      if (c.token == "") return { ok = false; auth = ""; detail = "neither signing key nor client secret configured" };
      reqHeaders := Array.concat<HttpHeader>([{ name = "Authorization"; value = "Basic " # base64(cid # ":" # c.token) }], reqHeaders);
    };
    let req : HttpRequestArgs = {
      url = c.baseUrl # "/oauth2/v1/token";
      max_response_bytes = ?(10_000 : Nat64);
      headers = reqHeaders;
      body = ?Text.encodeUtf8(reqBody);
      method = #post;
      transform = null;
      is_replicated = ?false;
    };
    let res = await doOutcall(req);
    let bodyText = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null "" };
    if (res.status < 200 or res.status >= 300) {
      return { ok = false; auth = ""; detail = "token endpoint HTTP " # Nat.toText(res.status) # ": " # bodyText };
    };
    let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return { ok = false; auth = ""; detail = "unparseable token response" } };
    let access = jsonField(parsed, ["access_token"]);
    if (access == "") return { ok = false; auth = ""; detail = "no access_token in response: " # bodyText };
    let expiresIn = switch (Nat.fromText(jsonField(parsed, ["expires_in"]))) { case (?n) n; case null 3600 };
    Map.add(tokenCache, Nat.compare, c.id, { access; expiresAt = Time.now() + expiresIn * 1_000_000_000 });
    { ok = true; auth = "Bearer " # access; detail = "" };
  };

  func connOf(id : Nat) : ?Conn = Map.get(conns, Nat.compare, id);

  func normBase(u : Text) : Text {
    var s = norm(u);
    // strip trailing slashes
    label strip loop {
      if (Text.endsWith(s, #text "/")) {
        let arr = Text.toArray(s);
        var t = "";
        var i = 0;
        while (i + 1 < arr.size()) { t #= Char.toText(arr[i]); i += 1 };
        s := t;
      } else break strip;
    };
    s;
  };

  public shared ({ caller }) func addConnection(args : { name : Text; kind : Text; baseUrl : Text; clientId : Text; clientSecret : Text }) : async { ok : Bool; id : Nat; detail : Text } {
    assert isOwnerRole(caller);
    let base = normBase(args.baseUrl);
    if (not Text.startsWith(base, #text "https://")) return { ok = false; id = 0; detail = "baseUrl must start with https://" };
    if (args.kind != "okta" and args.kind != "entra") return { ok = false; id = 0; detail = "kind must be okta or entra" };
    if (args.kind == "entra") return { ok = false; id = 0; detail = "Entra ID is prepared but not implemented yet — v1 targets Okta" };
    if (norm(args.clientId) == "") return { ok = false; id = 0; detail = "the OAuth client id is required (API Services app)" };
    let id = nextConnId;
    nextConnId += 1;
    let secret = hex(await ic00.raw_rand());
    Map.add(conns, Nat.compare, id, {
      id;
      name = norm(args.name);
      kind = args.kind;
      baseUrl = base;
      token = norm(args.clientSecret); // optional: only the client_secret fallback lane uses it
      enabled = true;
      hookSecret = secret;
      lastSync = null;
    });
    Map.add(oauthClientIds, Nat.compare, id, norm(args.clientId));
    // ES256 signing key for private_key_jwt — generated here, never leaves
    ignore await genKey(id);
    journal("conn", "added connection #" # Nat.toText(id) # " " # norm(args.name) # " (" # args.kind # ", " # base # ", OAuth client " # norm(args.clientId) # ", private_key_jwt)", caller);
    { ok = true; id; detail = "register the public key (JWK) in the Okta app now" };
  };

  /// Empty clientId / clientSecret keep the stored values.
  public shared ({ caller }) func updateConnection(id : Nat, args : { name : Text; baseUrl : Text; clientId : Text; clientSecret : Text; enabled : Bool }) : async { ok : Bool; detail : Text } {
    assert isOwnerRole(caller);
    switch (connOf(id)) {
      case null { { ok = false; detail = "no such connection" } };
      case (?c) {
        let base = normBase(args.baseUrl);
        if (not Text.startsWith(base, #text "https://")) return { ok = false; detail = "baseUrl must start with https://" };
        let tok = if (norm(args.clientSecret) == "") c.token else norm(args.clientSecret);
        Map.add(conns, Nat.compare, id, { c with name = norm(args.name); baseUrl = base; token = tok; enabled = args.enabled });
        if (norm(args.clientId) != "") Map.add(oauthClientIds, Nat.compare, id, norm(args.clientId));
        ignore Map.delete(tokenCache, Nat.compare, id); // credentials may have changed
        journal("conn", "updated connection #" # Nat.toText(id) # " " # norm(args.name) # (if (args.enabled) "" else " (disabled)"), caller);
        { ok = true; detail = "" };
      };
    };
  };

  public shared ({ caller }) func removeConnection(id : Nat) : async Bool {
    assert isOwnerRole(caller);
    ignore Map.delete(conns, Nat.compare, id);
    // drop that connection's users (remember the emails BEFORE deleting)
    let doomed = List.empty<Text>();
    let mails = List.empty<Text>();
    for ((k, u) in Map.entries(users)) if (u.connId == id) { List.add(doomed, k); List.add(mails, u.email) };
    for (k in List.values(doomed)) ignore Map.delete(users, Text.compare, k);
    // AUDIT FIX 2026-08-28 (H3/H12): push the deactivation for people who lost
    // their last active source, and burn the dead connection's credentials.
    let gone = List.empty<Text>();
    for (e in List.values(mails)) { if (e != "" and accessOf(e) != #active) List.add(gone, e) };
    if (List.size(gone) > 0) await notifyDeactivated(List.toArray(gone));
    ignore Map.delete(oauthKeys, Nat.compare, id);
    ignore Map.delete(oauthClientIds, Nat.compare, id);
    ignore Map.delete(tokenCache, Nat.compare, id);
    journal("conn", "removed connection #" # Nat.toText(id) # " and " # Nat.toText(List.size(doomed)) # " of its users (" # Nat.toText(List.size(gone)) # " pushed as deactivated)", caller);
    true;
  };

  /// Rotate the ES256 signing key; returns the new public JWK to register
  /// in the Okta app (the old key stops working immediately).
  public shared ({ caller }) func regenSigningKey(id : Nat) : async Text {
    assert isOwnerRole(caller);
    if (connOf(id) == null) return "";
    if (await genKey(id)) {
      journal("conn", "rotated the private_key_jwt signing key for connection #" # Nat.toText(id), caller);
      jwkFor(id);
    } else "";
  };

  public shared query ({ caller }) func getJwk(id : Nat) : async Text {
    assert isOwnerRole(caller);
    jwkFor(id);
  };

  public shared ({ caller }) func regenHookSecret(id : Nat) : async Text {
    assert isOwnerRole(caller);
    switch (connOf(id)) {
      case null "";
      case (?c) {
        let secret = hex(await ic00.raw_rand());
        if (not isOwnerRole(caller) or connOf(id) != ?c) return "";
        Map.add(conns, Nat.compare, id, { c with hookSecret = secret });
        journal("conn", "regenerated event-hook secret for connection #" # Nat.toText(id), caller);
        "/hooks/okta/" # Nat.toText(id) # "/" # secret;
      };
    };
  };

  type ConnView = {
    id : Nat;
    name : Text;
    kind : Text;
    baseUrl : Text;
    enabled : Bool;
    clientId : Text;
    tokenMask : Text; // masked client secret (fallback lane only)
    jwk : Text; // public JWK of the in-canister ES256 signing key
    hookPath : Text;
    lastSync : ?SyncStat;
    userCount : Nat;
    activeCount : Nat;
    syncing : Bool;
  };

  public shared query ({ caller }) func listConnections() : async [ConnView] {
    assert isAdmin(caller);
    let out = List.empty<ConnView>();
    for ((id, c) in Map.entries(conns)) {
      var total = 0;
      var act = 0;
      for ((_, u) in Map.entries(users)) {
        if (u.connId == id) {
          total += 1;
          if (effActive(u)) act += 1;
        };
      };
      List.add(out, {
        id;
        name = c.name;
        kind = c.kind;
        baseUrl = c.baseUrl;
        enabled = c.enabled;
        clientId = clientIdOf(id);
        tokenMask = maskToken(c.token);
        jwk = jwkFor(id);
        hookPath = if (isOwnerRole(caller)) "/hooks/okta/" # Nat.toText(id) # "/" # c.hookSecret else ""; // the secret is owner-tier material
        lastSync = c.lastSync;
        userCount = total;
        activeCount = act;
        syncing = isSyncing(id);
      });
    };
    List.toArray(out);
  };

  // ---------- user store ----------

  type UserRec = {
    connId : Nat;
    externalId : Text; // Okta user id
    email : Text; // lowercased
    displayName : Text;
    firstName : Text;
    lastName : Text;
    status : Text; // raw IdP status (ACTIVE, SUSPENDED, DEPROVISIONED, …)
    activeIdp : Bool; // derived from status / event hooks
    override : ?Text; // manual IT kill switch (reason); wins over the IdP
    attributes : [(Text, Text)]; // full flattened IdP profile
    createdAt : Int;
    updatedAt : Int;
  };
  let users : Map.Map<Text, UserRec> = Map.empty<Text, UserRec>(); // key = connId:externalId

  // Account classification (admin-set, hub-central so EVERY connected tool
  // inherits it): missing/"person" = a real person's primary account;
  // "service" = service account (sa-*…); "secondary" = a person's additional
  // org account (e.g. a twin account in a second org). Non-person accounts are EXCLUDED
  // from every tool-facing directory (connectorDirectory, team_members,
  // previewPush) — sign-in/access itself stays Okta's call.
  let userKinds : Map.Map<Text, Text> = Map.empty<Text, Text>(); // userKey -> kind

  // Positive override (the counterpart of the kill switch): the account is
  // treated as ACTIVE regardless of its IdP status — until cleared. Survives
  // IdP deactivation on purpose (that is the point of a manual override);
  // clearly flagged in the UI and journaled.
  let forceActive : Map.Map<Text, Text> = Map.empty<Text, Text>(); // userKey -> reason
  func isForced(key : Text) : Bool = Map.containsKey(forceActive, Text.compare, key);
  /// THE one effective-access rule: kill switch wins, then force-active, then IdP.
  func effActive(u : UserRec) : Bool {
    if (u.override != null) return false;
    u.activeIdp or isForced(userKey(u.connId, u.externalId));
  };
  func kindOfUser(key : Text) : Text = switch (Map.get(userKinds, Text.compare, key)) { case (?k) k; case null "person" };
  func directoryEligible(u : UserRec) : Bool = kindOfUser(userKey(u.connId, u.externalId)) == "person";

  public shared ({ caller }) func setUserKinds(keys : [Text], kind : Text) : async Nat {
    assert isAdminRole(caller);
    if (kind != "person" and kind != "service" and kind != "secondary") return 0;
    if (keys.size() > 500) return 0;
    var n = 0;
    for (key in keys.vals()) {
      if (switch (users.get(key)) { case (?u) canManagePerson(caller, u.email); case null false }) {
        if (kind == "person") { ignore Map.delete(userKinds, Text.compare, key) } else { Map.add(userKinds, Text.compare, key, kind) };
        n += 1;
      };
    };
    if (n > 0) journal("kind", "marked " # Nat.toText(n) # " account(s) as " # kind, caller);
    n;
  };

  func userKey(connId : Nat, externalId : Text) : Text = Nat.toText(connId) # ":" # externalId;

  /// Okta statuses that mean "may access tools". LOCKED_OUT/RECOVERY/
  /// PASSWORD_EXPIRED are temporary credential states, not offboarding.
  func statusActive(status : Text) : Bool {
    status == "ACTIVE" or status == "RECOVERY" or status == "PASSWORD_EXPIRED" or status == "LOCKED_OUT";
  };

  // ---------- local directory (standalone/hybrid mode) ----------
  // People who exist only in the hub (no external IdP). They live in the SAME
  // user store under the reserved connection id 0 (IdP connections start at
  // 1), so every downstream lane — effActive, accessOf, connectorDirectory,
  // kill switch, sync views — treats them like any synced account.
  // externalId = lowercased email. Mode "scim" (Sources → "added here" off)
  // is enforced here too: no local person can be created then, by anyone.

  let LOCAL_CONN : Nat = 0;
  let SCIM_CONN : Nat = 900_000_000; // reserved source id for SCIM-mastered people

  public shared ({ caller }) func addLocalUser(email : Text, displayName : Text, firstName : Text, lastName : Text) : async Bool {
    assert isAdminRole(caller);
    if (directoryMode == "scim") return false; // "added here" is switched off under Sources
    let e = lower(norm(email));
    if (e == "") return false;
    let key = userKey(LOCAL_CONN, e);
    if (Map.containsKey(users, Text.compare, key)) return false;
    if (accessOf(e) == #active) return false; // an ACTIVE account from another source holds this address — no local twin that would outlive its offboarding
    if (not canManagePerson(caller, e)) return false; // a departed owner's address may only be re-issued by an owner (re-issuing seals the previous holder)
    let now = Time.now();
    Map.add(users, Text.compare, key, {
      connId = LOCAL_CONN;
      externalId = e;
      email = e;
      displayName = norm(displayName);
      firstName = norm(firstName);
      lastName = norm(lastName);
      status = "ACTIVE";
      activeIdp = true;
      override = null;
      attributes = [];
      createdAt = now;
      updatedAt = now;
    });
    reconcilePersons();
    journal("local", "added local user " # e, caller);
    true;
  };

  // The standard org profile every AD/Okta user carries — first-class here.
  // Editable for LOCAL entries; mastered accounts get these from their source.
  let PROFILE_KEYS : [Text] = ["title", "department", "division", "organization", "costCenter", "employeeNumber", "manager", "location", "userType"];

  public shared ({ caller }) func setUserProfile(email : Text, fields : [(Text, Text)]) : async Bool {
    assert isAdminRole(caller);
    let e = lower(norm(email));
    if (not canManagePerson(caller, e)) return false;
    let key = userKey(LOCAL_CONN, e);
    switch (Map.get(users, Text.compare, key)) {
      case null false; // only local entries are editable — mastered profiles belong to their source
      case (?u) {
        if (fields.size() > 40) return false;
        let attrs = List.empty<(Text, Text)>();
        for ((k, v) in fields.vals()) {
          var known = false;
          for (pk in PROFILE_KEYS.vals()) if (pk == k) known := true;
          if (known and norm(v) != "") List.add(attrs, (k, norm(v)));
        };
        for ((k, v) in u.attributes.vals()) {
          var canon = false;
          for (pk in PROFILE_KEYS.vals()) if (pk == k) canon := true;
          if (not canon) List.add(attrs, (k, v));
        };
        Map.add(users, Text.compare, key, { u with attributes = List.toArray(attrs); updatedAt = Time.now() });
        journal("local", "profile updated for " # e, caller);
        true;
      };
    };
  };

  /// CSV bulk onboarding: creates LOCAL entries. A row is skipped when the
  /// e-mail is empty or the person is already known from ANY source.
  public shared ({ caller }) func importPeople(rows : [{ email : Text; displayName : Text; firstName : Text; lastName : Text; fields : [(Text, Text)] }]) : async { created : Nat; skipped : Nat } {
    assert isAdminRole(caller);
    if (rows.size() > 500 or directoryMode == "scim") return { created = 0; skipped = rows.size() }; // "added here" switched off → nothing is created
    var created = 0;
    var skipped = 0;
    let now = Time.now();
    for (r in rows.vals()) {
      let e = lower(norm(r.email));
      if (e == "" or accessOf(e) != #unknown) { skipped += 1 } else {
        let attrs = List.empty<(Text, Text)>();
        for ((k, v) in r.fields.vals()) {
          var known = false;
          for (pk in PROFILE_KEYS.vals()) if (pk == k) known := true;
          if (known and norm(v) != "" and r.fields.size() <= 20) List.add(attrs, (k, norm(v)));
        };
        Map.add(users, Text.compare, userKey(LOCAL_CONN, e), {
          connId = LOCAL_CONN;
          externalId = e;
          email = e;
          displayName = norm(r.displayName);
          firstName = norm(r.firstName);
          lastName = norm(r.lastName);
          status = "ACTIVE";
          activeIdp = true;
          override = null;
          attributes = List.toArray(attrs);
          createdAt = now;
          updatedAt = now;
        });
        created += 1;
      };
    };
    reconcilePersons();
    journal("local", "CSV import: " # Nat.toText(created) # " created, " # Nat.toText(skipped) # " skipped", caller);
    { created; skipped };
  };

  public shared ({ caller }) func setLocalUserActive(email : Text, active : Bool) : async Bool {
    assert isAdminRole(caller);
    let e = lower(norm(email));
    if (not canManagePerson(caller, e)) return false;
    let key = userKey(LOCAL_CONN, e);
    switch (Map.get(users, Text.compare, key)) {
      case (?u) {
        Map.add(users, Text.compare, key, { u with status = if (active) "ACTIVE" else "DEPROVISIONED"; activeIdp = active; updatedAt = Time.now() });
        journal("local", (if (active) "activated" else "deactivated") # " local user " # e, caller);
        if (not active and accessOf(e) != #active) { await notifyDeactivated([e]) };
        true;
      };
      case null false;
    };
  };

  type UserView = {
    key : Text;
    connId : Nat;
    connName : Text;
    externalId : Text;
    email : Text;
    displayName : Text;
    status : Text;
    active : Bool; // effective: IdP-active AND no manual override
    override : ?Text;
    updatedAt : Int;
    attributes : [(Text, Text)];
    kind : Text; // person | service | secondary
    forced : Bool; // manually forced active (positive override)
    role : Text; // hub role of the PERSON: owner | admin | helpdesk | "" (member)
    personId : Text; // stable id from the person registry (0.17)
  };

  func toView(u : UserRec) : UserView {
    let cname = switch (connOf(u.connId)) { case (?c) c.name; case null (if (u.connId == LOCAL_CONN) "Local" else if (isScimConn(u.connId)) (switch (scimSourceOfConn(u.connId)) { case (?src) src.name; case null "SCIM" }) else "#" # Nat.toText(u.connId)) };
    {
      key = userKey(u.connId, u.externalId);
      connId = u.connId;
      connName = cname;
      externalId = u.externalId;
      email = u.email;
      displayName = u.displayName;
      status = u.status;
      active = effActive(u);
      override = u.override;
      updatedAt = u.updatedAt;
      attributes = u.attributes;
      kind = kindOfUser(userKey(u.connId, u.externalId));
      forced = isForced(userKey(u.connId, u.externalId));
      role = hubRoleOf(u.email);
      personId = pidForEmail(u.email);
    };
  };

  public shared query ({ caller }) func listUsers(args : { offset : Nat; limit : Nat; conn : ?Nat; search : Text; activeOnly : Bool }) : async { total : Nat; items : [UserView] } {
    assert isAdmin(caller);
    let q = lower(norm(args.search));
    let matched = List.empty<UserView>();
    for ((_, u) in Map.entries(users)) {
      let connOk = switch (args.conn) { case null true; case (?cid) u.connId == cid };
      let activeOk = if (args.activeOnly) effActive(u) else true;
      var searchOk = true;
      if (q != "") {
        searchOk := Text.contains(lower(u.email), #text q) or Text.contains(lower(u.displayName), #text q) or Text.contains(lower(u.status), #text q);
      };
      if (connOk and activeOk and searchOk) List.add(matched, toView(u));
    };
    let arr = List.toArray(matched);
    let sorted = Array.sort<UserView>(arr, func(a, b) = Text.compare(a.email, b.email));
    let total = sorted.size();
    let lim = Nat.min(args.limit, 200);
    let from = Nat.min(args.offset, total);
    let count = Nat.min(lim, total - from);
    let items = Array.tabulate<UserView>(count, func i = sorted[from + i]);
    { total; items };
  };

  public shared query ({ caller }) func getUser(key : Text) : async ?UserView {
    assert isAdmin(caller);
    switch (Map.get(users, Text.compare, key)) { case (?u) ?toView(u); case null null };
  };

  /// Manual kill switch: blocks the user hub-wide immediately, independent of
  /// the IdP. Cleared explicitly or never — the IdP cannot re-activate an
  /// overridden user.
  public shared ({ caller }) func deactivateUser(key : Text, reason : Text) : async Bool {
    assert isAdmin(caller);
    switch (Map.get(users, Text.compare, key)) {
      case null false;
      case (?u) {
        if (not canManagePerson(caller, u.email)) return false;
        // the kill switch is per PERSON: every record carrying this e-mail
        // (other Okta org, SCIM, local twin) gets the override, otherwise
        // accessOf would keep the person active via the sibling account
        let why = ?(if (norm(reason) == "") "manual deactivation" else norm(reason));
        let keys = List.empty<Text>();
        for ((k, r) in Map.entries(users)) if (r.email == u.email) List.add(keys, k);
        for (k in List.toArray(keys).vals()) {
          switch (Map.get(users, Text.compare, k)) {
            case (?r) { Map.add(users, Text.compare, k, { r with override = why; updatedAt = Time.now() }); ignore Map.delete(forceActive, Text.compare, k) };
            case null {};
          };
        };
        journal("kill", "manual deactivation of " # u.email # " (" # Nat.toText(List.toArray(keys).size()) # " record(s)): " # reason, caller);
        // AUDIT FIX 2026-08-28 (H4/C9): only push when NO other account keeps
        // the person active — same residual-access filter as every other lane.
        if (accessOf(u.email) != #active) await notifyDeactivated([u.email]);
        true;
      };
    };
  };

  /// Bulk kill switch: one call, one journal summary, ONE deactivation push
  /// to the connected apps at the end.
  public shared ({ caller }) func deactivateUsers(keys : [Text], reason : Text) : async Nat {
    assert isAdmin(caller);
    if (keys.size() > 500) return 0;
    let r = if (norm(reason) == "") "manual deactivation (bulk)" else norm(reason);
    var n = 0;
    let selected = Map.empty<Text, Bool>();
    for (key in keys.values()) switch (users.get(key)) { case (?u) { if (canManagePerson(caller, u.email)) selected.add(u.email, true) }; case null {} };
    let emails = List.empty<Text>();
    // Bulk and single kill switches both operate on the person, across all source records.
    for ((key, u) in users.entries().toArray().values()) {
      if (selected.containsKey(u.email)) {
        if (u.override == null or isForced(key)) n += 1;
        users.add(key, { u with override = ?r; updatedAt = Time.now() });
        ignore forceActive.delete(key);
      };
    };
    for ((email, _) in selected.entries()) emails.add(email);
    if (n > 0) {
      journal("kill", "bulk deactivation of " # Nat.toText(n) # " users: " # r, caller);
      // push only accounts with no active source left
      let toPush = List.empty<Text>();
      for (e in List.values(emails)) { if (accessOf(e) != #active) List.add(toPush, e) };
      await notifyDeactivated(List.toArray(toPush));
    };
    n;
  };

  public shared ({ caller }) func clearOverrides(keys : [Text]) : async Nat {
    assert isAdminRole(caller);
    if (keys.size() > 500) return 0;
    let selected = Map.empty<Text, Bool>();
    for (key in keys.values()) switch (users.get(key)) { case (?u) { if (canManagePerson(caller, u.email)) selected.add(u.email, true) }; case null {} };
    var n = 0;
    for ((key, u) in users.entries().toArray().values()) {
      if (selected.containsKey(u.email) and (u.override != null or isForced(key))) {
        users.add(key, { u with override = null; updatedAt = Time.now() });
        ignore forceActive.delete(key);
        n += 1;
      };
    };
    if (n > 0) journal("kill", "bulk override clear for " # Nat.toText(n) # " records", caller);
    n;
  };

  public shared ({ caller }) func clearOverride(key : Text) : async Bool {
    assert isAdminRole(caller); // re-granting access is an admin decision, not helpdesk
    switch (Map.get(users, Text.compare, key)) {
      case null false;
      case (?u) {
        if (not canManagePerson(caller, u.email)) return false;
        let keys = List.empty<Text>();
        for ((k, r) in Map.entries(users)) if (r.email == u.email) List.add(keys, k);
        for (k in List.toArray(keys).vals()) {
          switch (Map.get(users, Text.compare, k)) {
            case (?r) { Map.add(users, Text.compare, k, { r with override = null; updatedAt = Time.now() }); ignore Map.delete(forceActive, Text.compare, k) };
            case null {};
          };
        }; // clears BOTH directions, for every record of the person
        journal("kill", "override cleared for " # u.email # " (" # key # ") — IdP status applies again", caller);
        true;
      };
    };
  };

  /// Positive override: treat the account as ACTIVE regardless of its IdP
  /// status (e.g. STAGED before day one). Survives IdP changes until cleared.
  public shared ({ caller }) func reactivateUser(key : Text, reason : Text) : async Bool {
    assert isAdminRole(caller); // force-active overrides offboarding — admin only
    switch (Map.get(users, Text.compare, key)) {
      case null false;
      case (?u) {
        if (not canManagePerson(caller, u.email)) return false;
        Map.add(forceActive, Text.compare, key, if (norm(reason) == "") "manual activation" else norm(reason));
        Map.add(users, Text.compare, key, { u with override = null; updatedAt = Time.now() }); // kill switch off
        journal("kill", "FORCED ACTIVE: " # u.email # " (" # key # "): " # reason, caller);
        true;
      };
    };
  };

  // ---------- Okta pull sync ----------

  func headerVal(headers : [HttpHeader], nameLower : Text) : Text {
    for (h in headers.vals()) if (lower(h.name) == nameLower) return h.value;
    "";
  };

  /// Extract rel="next" URL from an Okta Link header.
  func nextLink(headers : [HttpHeader]) : ?Text {
    let v = headerVal(headers, "link");
    if (v == "") return null;
    for (part in Text.split(v, #char ',')) {
      if (Text.contains(part, #text "rel=\"next\"")) {
        let cs = Text.toArray(part);
        var start : ?Nat = null;
        var i = 0;
        while (i < cs.size()) {
          if (cs[i] == '<') start := ?(i + 1) else if (cs[i] == '>') {
            switch (start) {
              case (?s) {
                var url = "";
                var j = s;
                while (j < i) { url #= Char.toText(cs[j]); j += 1 };
                return ?url;
              };
              case null {};
            };
          };
          i += 1;
        };
      };
    };
    null;
  };

  func oktaGet(c : Conn, url : Text) : async (Nat, Text, [HttpHeader]) {
    let bearer = await bearerFor(c);
    if (not bearer.ok) return (0, "OAuth: " # bearer.detail, []);
    let req : HttpRequestArgs = {
      url;
      max_response_bytes = ?(1_900_000 : Nat64);
      headers = [
        { name = "Authorization"; value = bearer.auth },
        { name = "Accept"; value = "application/json" },
        { name = "User-Agent"; value = "kebabstack-hub" },
      ];
      body = null;
      method = #get;
      transform = null;
      is_replicated = ?false;
    };
    let res = await doOutcall(req);
    // one retry on 401: cached token may have been revoked server-side
    if (res.status == 401) {
      ignore Map.delete(tokenCache, Nat.compare, c.id);
      let fresh = await bearerFor(c);
      if (not fresh.ok) return (0, "OAuth: " # fresh.detail, []);
      let res2 = await doOutcall({ req with headers = [
        { name = "Authorization"; value = fresh.auth },
        { name = "Accept"; value = "application/json" },
        { name = "User-Agent"; value = "kebabstack-hub" },
      ] });
      let raw2 = switch (Text.decodeUtf8(res2.body)) { case (?t) t; case null "" };
      let body2 = if (res2.status >= 200 and res2.status < 300) sanitizeSurrogates(raw2) else raw2;
      return (res2.status, body2, res2.headers);
    };
    let raw = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null "" };
    let body = if (res.status >= 200 and res.status < 300) sanitizeSurrogates(raw) else raw;
    (res.status, body, res.headers);
  };

  /// Validates reachability, token, and permissions with a 1-user page.
  public shared ({ caller }) func testConnection(id : Nat) : async { ok : Bool; status : Nat; detail : Text } {
    assert isAdminRole(caller);
    switch (connOf(id)) {
      case null { { ok = false; status = 0; detail = "no such connection" } };
      case (?c) {
        let (status, body, _) = await oktaGet(c, c.baseUrl # "/api/v1/users?limit=1");
        if (status >= 200 and status < 300) {
          journal("sync", "test OK for connection #" # Nat.toText(id) # " (" # c.name # ")", caller);
          { ok = true; status; detail = "OAuth + Users API OK" };
        } else {
          { ok = false; status; detail = snippet(body, 300) };
        };
      };
    };
  };

  type SyncResult = { ok : Bool; detail : Text; fetched : Nat; created : Nat; updated : Nat; deactivated : Nat };

  func syncConnInternal(id : Nat, by : Principal) : async SyncResult {
    switch (connOf(id)) {
      case null return { ok = false; detail = "no such connection"; fetched = 0; created = 0; updated = 0; deactivated = 0 };
      case (?c) {
        if (not c.enabled) return { ok = false; detail = "connection disabled"; fetched = 0; created = 0; updated = 0; deactivated = 0 };
        if (isSyncing(id)) return { ok = false; detail = "sync already running"; fetched = 0; created = 0; updated = 0; deactivated = 0 };
        Map.add(syncing, Nat.compare, id, Time.now());
        let syncStart = Time.now();
        var fetched = 0;
        var created = 0;
        var updated = 0;
        var deactivated = 0;
        let deactEmails = List.empty<Text>();
        let seen = Map.empty<Text, Bool>();
        // 200 = Okta's max page size: at our org sizes the whole pull is ONE
        // outcall per org (cursor pagination is inherently sequential, so the
        // fewer pages the better).
        var url = c.baseUrl # "/api/v1/users?limit=200";
        var pages = 0;
        var failDetail = "";
        label paging while (pages < 60) {
          pages += 1;
          live(id, "page " # Nat.toText(pages) # ": fetching users from " # c.baseUrl # "…");
          let (status, body, hdrs) = await oktaGet(c, url);
          if (connOf(id) != ?c) { failDetail := "source configuration changed during sync — retry with the current source"; break paging };
          if (status < 200 or status >= 300) {
            failDetail := "HTTP " # Nat.toText(status) # " on page " # Nat.toText(pages) # ": " # snippet(body, 220);
            break paging;
          };
          let items = switch (splitJsonArray(body)) { case (?a) a; case null { failDetail := "response is not a JSON array (page " # Nat.toText(pages) # ")"; break paging } };
          live(id, "page " # Nat.toText(pages) # ": parsing " # Nat.toText(items.size()) # " users…");
          var idx = 0;
          for (itemText in items.vals()) {
            idx += 1;
            if (idx % 25 == 0) {
              live(id, "page " # Nat.toText(pages) # ": processed " # Nat.toText(idx) # "/" # Nat.toText(items.size()) # " (total " # Nat.toText(fetched) # ")…");
              await yieldNow();
              if (connOf(id) != ?c) { failDetail := "source changed during sync"; break paging };
            };
            switch (Json.parse(itemText)) {
              case (#err(_)) { failDetail := "malformed user in source response — reconciliation skipped"; break paging };
              case (#ok(item)) {
                let oid = jsonField(item, ["id"]);
                if (oid != "") {
                  let status_ = jsonField(item, ["status"]);
                  let profile = switch (Json.get(item, "profile")) { case (?p) p; case null #null_ };
                  let email = lower(jsonField(profile, ["email", "login"]));
                  let first = jsonField(profile, ["firstName"]);
                  let last = jsonField(profile, ["lastName"]);
                  var dn = jsonField(profile, ["displayName"]);
                  if (dn == "") dn := norm(first # " " # last);
                  let attrs = flattenObj(profile);
                  let key = userKey(id, oid);
                  Map.add(seen, Text.compare, key, true);
                  fetched += 1;
                  let now = Time.now();
                  switch (Map.get(users, Text.compare, key)) {
                    case null {
                      Map.add(users, Text.compare, key, {
                        connId = id;
                        externalId = oid;
                        email;
                        displayName = dn;
                        firstName = first;
                        lastName = last;
                        status = status_;
                        activeIdp = statusActive(status_);
                        override = null;
                        attributes = attrs;
                        createdAt = now;
                        updatedAt = now;
                      });
                      created += 1;
                    };
                    case (?old) {
                      // TOCTOU guard (F16, security review): if this record
                      // changed AFTER the sync started (event hook, kill
                      // switch), the page data is staler than that change —
                      // keep the newer status, update only the profile.
                      let fresher = old.updatedAt > syncStart;
                      // an address change onto an address another ACTIVE person holds would merge two people through every e-mail lane — keep the old one and say so
                      let emailNext = if (email != old.email and addressHeldByOther(key, email)) { noteSyncCollision(key, old.email, email); old.email } else email;
                      if (old.activeIdp and not fresher and not statusActive(status_)) List.add(deactEmails, emailNext);
                      Map.add(users, Text.compare, key, {
                        old with
                        email = emailNext;
                        displayName = dn;
                        firstName = first;
                        lastName = last;
                        status = if (fresher) old.status else status_;
                        activeIdp = if (fresher) old.activeIdp else statusActive(status_);
                        attributes = attrs;
                        updatedAt = now;
                      });
                      updated += 1;
                    };
                  };
                };
              };
            };
          };
          // follow rel="next" — only within the same Okta org
          switch (nextLink(hdrs)) {
            case (?next) {
              if (not Text.startsWith(next, #text (c.baseUrl # "/api/v1/users?"))) { failDetail := "unsafe or unsupported pagination link — reconciliation skipped"; break paging };
              if (pages >= 60) { failDetail := "pagination limit reached — incomplete sync, reconciliation skipped"; break paging };
              url := next;
            };
            case null break paging;
          };
          await yieldNow();
        };
        // full pull succeeded: users of this conn NOT in the listing were
        // deprovisioned in Okta (the users API omits DEPROVISIONED) -> inactive
        if (failDetail == "") {
          live(id, "reconciling deprovisioned users…");
          for ((k, u) in Map.entries(users)) {
            if (u.connId == id and not Map.containsKey(seen, Text.compare, k) and u.activeIdp and u.updatedAt <= syncStart) {
              Map.add(users, Text.compare, k, { u with status = "DEPROVISIONED"; activeIdp = false; updatedAt = Time.now() });
              deactivated += 1;
              List.add(deactEmails, u.email);
            };
          };
        };
        reconcilePersons(); // ids for new accounts, renames for changed addresses (0.17)
        let ok = failDetail == "";
        let detail = if (ok) {
          Nat.toText(fetched) # " users (" # Nat.toText(created) # " new, " # Nat.toText(updated) # " updated, " # Nat.toText(deactivated) # " deprovisioned)";
        } else failDetail;
        switch (connOf(id)) {
          case (?c2) Map.add(conns, Nat.compare, id, { c2 with lastSync = ?{ at = Time.now(); ok; detail; fetched } });
          case null {};
        };
        ignore Map.delete(syncing, Nat.compare, id);
        journal("sync", "connection #" # Nat.toText(id) # " (" # c.name # "): " # detail, by);
        // push deactivations to connected apps (only accounts with no other
        // active source left — accessOf decides)
        let toPush = List.empty<Text>();
        for (e in List.values(deactEmails)) { if (accessOf(e) != #active) List.add(toPush, e) };
        await notifyDeactivated(List.toArray(toPush));
        { ok; detail; fetched; created; updated; deactivated };
      };
    };
  };

  public shared ({ caller }) func syncNow(id : Nat) : async SyncResult {
    assert isAdminRole(caller);
    await syncConnInternal(id, caller);
  };

  /// Sync all enabled connections IN PARALLEL: start every sync first (each
  /// call issues its outcalls immediately), await afterwards. Two Oktas take
  /// as long as the slower one, not the sum. The per-connection `syncing`
  /// guard keeps overlapping runs of the SAME connection out.
  public shared ({ caller }) func syncAll() : async [(Nat, SyncResult)] {
    assert isAdminRole(caller);
    let futs = List.empty<(Nat, async SyncResult)>();
    for ((id, c) in Map.entries(conns)) {
      if (c.enabled) List.add(futs, (id, syncConnInternal(id, caller)));
    };
    let out = List.empty<(Nat, SyncResult)>();
    for ((id, f) in List.values(futs)) List.add(out, (id, await f));
    List.toArray(out);
  };

  // ---------- auto-sync (poll timer) ----------

  var autoSyncSecs : Nat = 3600; // 0 = off; default hourly

  public shared ({ caller }) func setAutoSync(secs : Nat) : async Bool {
    assert isOwnerRole(caller);
    autoSyncSecs := secs;
    journal("config", "auto-sync set to " # Nat.toText(secs) # "s", caller);
    true;
  };

  public shared query ({ caller }) func getSettings() : async { autoSyncSecs : Nat } {
    assert isAdmin(caller); // F3, security review: config is admin-only
    { autoSyncSecs };
  };

  func tick() : async () {
    let now = Time.now();
    // OIDC housekeeping: expire codes/tokens; resume an interrupted key generation (an upgrade drops one-shot timers)
    oidcSweep();
    if (oidcGen != null and not oidcGenBusy) oidcArmTick<system>(0);
    governanceSweep<system>(); // temporary access that is due ends here
    // prune expired SSO sessions
    let doomed = List.empty<Text>();
    for ((t, s) in Map.entries(sessions)) if (now > s.expiresAt) List.add(doomed, t);
    for (t in List.values(doomed)) ignore Map.delete(sessions, Text.compare, t);
    // prune expired, never-redeemed app tickets too (F18)
    let doomedT = List.empty<Text>();
    for ((t, tk) in Map.entries(tickets)) if (now > tk.expiresAt) List.add(doomedT, t);
    for (t in List.values(doomedT)) ignore Map.delete(tickets, Text.compare, t);
    if (autoSyncSecs == 0) return;
    // start all due syncs in parallel, then await them
    let futs = List.empty<async SyncResult>();
    for ((id, c) in Map.entries(conns)) {
      if (c.enabled) {
        let due = switch (c.lastSync) {
          case null true;
          case (?s) Int.abs(now - s.at) >= autoSyncSecs * 1_000_000_000;
        };
        if (due) List.add(futs, syncConnInternal(id, Principal.fromText("2vxsx-fae")));
      };
    };
    for (f in List.values(futs)) ignore await f;
  };

  // (the auto-sync timer itself is declared at the END of the actor — it must
  // come after every stable field that tick() touches, or M0016 definedness)

  // ---------- Okta Event Hook endpoint (instant deprovisioning) ----------

  var hookEvents : Nat = 0;
  var lastHookAt : ?Int = null;

  type HeaderField = (Text, Text);
  type HttpGwRequest = { method : Text; url : Text; headers : [HeaderField]; body : Blob };
  type HttpGwResponse = { status_code : Nat16; headers : [HeaderField]; body : Blob; upgrade : ?Bool };

  func gwHeader(headers : [HeaderField], nameLower : Text) : Text {
    for ((n, v) in headers.vals()) if (lower(n) == nameLower) return v;
    "";
  };

  func jsonRes(code : Nat16, body : Text) : HttpGwResponse = {
    status_code = code;
    headers = [("Content-Type", "application/json")];
    body = Text.encodeUtf8(body);
    upgrade = null;
  };

  public query func http_request(req : HttpGwRequest) : async HttpGwResponse {
    // all hook traffic goes through update calls (consensus + state changes)
    if (Text.startsWith(req.url, #text "/hooks/") or Text.startsWith(req.url, #text "/scim/") or Text.startsWith(req.url, #text "/oidc/") or Text.startsWith(req.url, #text "/.well-known/openid-configuration")) {
      return { status_code = 200; headers = []; body = Text.encodeUtf8(""); upgrade = ?true };
    };
    {
      status_code = 200;
      headers = [("Content-Type", "text/plain")];
      body = Text.encodeUtf8("User Hub backend. UI lives on the frontend canister.");
      upgrade = null;
    };
  };

  func pathParts(url : Text) : [Text] {
    // strip query, split path
    var path = url;
    let it = Text.split(url, #char '?');
    switch (it.next()) { case (?p) path := p; case null {} };
    splitPath(path);
  };
  func splitPath(path : Text) : [Text] {
    let out = List.empty<Text>();
    for (seg in Text.split(path, #char '/')) if (seg != "") List.add(out, seg);
    List.toArray(out);
  };

  public func http_request_update(req : HttpGwRequest) : async HttpGwResponse {
    if (Text.startsWith(req.url, #text "/scim/")) return await scimHandle(req);
    if (Text.startsWith(req.url, #text "/oidc/") or Text.startsWith(req.url, #text "/.well-known/openid-configuration")) return await* oidcHandle<system>(req);
    if (not Text.startsWith(req.url, #text "/hooks/")) return jsonRes(404, "{\"error\":\"not found\"}");
    let parts = pathParts(req.url);
    // expected: hooks / okta / <connId> / <secret>
    if (parts.size() != 4 or parts[0] != "hooks" or parts[1] != "okta") return jsonRes(404, "{\"error\":\"bad hook path\"}");
    let connId = switch (Nat.fromText(parts[2])) { case (?n) n; case null return jsonRes(404, "{\"error\":\"bad connection id\"}") };
    let c = switch (connOf(connId)) { case (?c) c; case null return jsonRes(404, "{\"error\":\"unknown connection\"}") };
    if (parts[3] != c.hookSecret or c.hookSecret == "") return jsonRes(403, "{\"error\":\"bad secret\"}");

    // Okta one-time verification (GET with X-Okta-Verification-Challenge)
    if (req.method == "GET") {
      let challenge = gwHeader(req.headers, "x-okta-verification-challenge");
      if (challenge == "") return jsonRes(400, "{\"error\":\"no challenge header\"}");
      journal("hook", "event hook verified for connection #" # Nat.toText(connId), Principal.fromText("2vxsx-fae"));
      // escape quotes/backslashes before echoing into JSON (F19 — defense in
      // depth; only a caller holding the hook secret reaches this branch)
      let safe = Text.replace(Text.replace(challenge, #char '\\', "\\\\"), #char '\"', "\\\"");
      return jsonRes(200, "{\"verification\":\"" # safe # "\"}");
    };

    if (req.method != "POST") return jsonRes(405, "{\"error\":\"method not allowed\"}");
    let bodyText = switch (Text.decodeUtf8(req.body)) { case (?t) sanitizeSurrogates(t); case null "" };
    let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return jsonRes(400, "{\"error\":\"unparseable body\"}") };
    let events = switch (Json.get(parsed, "data.events")) { case (?#array(a)) a; case (_) [] };
    var applied = 0;
    let hookDeact = List.empty<Text>();
    for (ev in events.vals()) {
      let evType = jsonField(ev, ["eventType"]);
      let targets = switch (Json.get(ev, "target")) { case (?#array(a)) a; case (_) ([] : [Json.Json]) };
      for (t in targets.vals()) {
        if (jsonField(t, ["type"]) == "User") {
          let oid = jsonField(t, ["id"]);
          let altEmail = lower(jsonField(t, ["alternateId"]));
          let key = userKey(connId, oid);
          let deact = evType == "user.lifecycle.deactivate" or evType == "user.lifecycle.suspend" or evType == "user.lifecycle.delete.initiated";
          let react = evType == "user.lifecycle.activate" or evType == "user.lifecycle.unsuspend";
          if (deact or react) {
            let newStatus = if (deact) { if (evType == "user.lifecycle.suspend") "SUSPENDED" else "DEPROVISIONED" } else "ACTIVE";
            switch (Map.get(users, Text.compare, key)) {
              case (?u) {
                Map.add(users, Text.compare, key, { u with status = newStatus; activeIdp = not deact; updatedAt = Time.now() });
                applied += 1;
                if (deact) List.add(hookDeact, u.email);
                journal("hook", evType # " -> " # u.email # " (" # c.name # ")", Principal.fromText("2vxsx-fae"));
              };
              case null {
                // unknown user id: try by email within this connection
                var hit = false;
                for ((k, u) in Map.entries(users)) {
                  if (not hit and u.connId == connId and u.email == altEmail and altEmail != "") {
                    Map.add(users, Text.compare, k, { u with status = newStatus; activeIdp = not deact; updatedAt = Time.now() });
                    applied += 1;
                    if (deact) List.add(hookDeact, u.email);
                    hit := true;
                    journal("hook", evType # " -> " # u.email # " (" # c.name # ", matched by email)", Principal.fromText("2vxsx-fae"));
                  };
                };
                if (not hit) journal("hook", evType # " for UNKNOWN user " # altEmail # " (" # c.name # ") — run a sync", Principal.fromText("2vxsx-fae"));
              };
            };
          };
        };
      };
    };
    reconcilePersons();
    hookEvents += 1;
    lastHookAt := ?Time.now();
    // instant push to connected apps (only if no other active source remains)
    let toPush = List.empty<Text>();
    for (e in List.values(hookDeact)) { if (accessOf(e) != #active) List.add(toPush, e) };
    await notifyDeactivated(List.toArray(toPush));
    jsonRes(200, "{\"ok\":true,\"applied\":" # Nat.toText(applied) # "}");
  };

  // ---------- connector registry (the central point tools sync FROM) ----------

  type Connector = { id : Nat; name : Text; canisterId : Principal; note : Text; addedAt : Int };
  let connectors : Map.Map<Nat, Connector> = Map.empty<Nat, Connector>();
  var nextConnectorId : Nat = 1;
  // Source scoping per connector: which IdP connections this tool may see.
  // Empty / missing = ALL connections (default). Example: Quick Meet scoped
  // to one Okta org only — accounts of the other org then neither appear in its
  // directory nor can they redeem tickets or pass checkAccess for it.
  let connectorScopes : Map.Map<Nat, [Nat]> = Map.empty<Nat, [Nat]>();

  // F17: only colleague-facing profile fields leave the hub — HR-sensitive
  // Okta attributes (birth date, cost center, supervisor ids, HR status, …)
  // never reach connector tools, whatever Okta adds in the future.
  let FORWARDED_ATTRS : [Text] = ["title", "department", "division", "organization", "businessUnit", "city", "state", "countryCode", "entity", "manager", "managerName", "employeeNumber", "mobilePhone", "primaryPhone", "startDate"];
  func forwardedAttrs(attrs : [(Text, Text)]) : [(Text, Text)] {
    Array.filter<(Text, Text)>(attrs, func(kv : (Text, Text)) : Bool {
      for (a in FORWARDED_ATTRS.vals()) { if (a == kv.0) return true };
      false;
    });
  };

  /// Highest hub staff role held by any passkey linked to this person
  /// ("" = not hub staff). owner > admin > helpdesk.
  func hubRoleOf(email : Text) : Text {
    var best = personRoleOf(email);
    for ((pr, em) in Map.entries(principalLinks)) {
      if (em == email and (isOwner(pr) or Map.containsKey(admins, Principal.compare, pr))) {
        let r = roleOf(pr);
        if (r == "owner" or (r == "admin" and best != "owner") or (r == "helpdesk" and best == "")) best := r;
      };
    };
    best;
  };

  func connectorByPrincipal(p : Principal) : ?Connector {
    for ((_, c) in Map.entries(connectors)) if (Principal.equal(c.canisterId, p)) return ?c;
    null;
  };
  func scopeOf(connectorId : Nat) : [Nat] = switch (Map.get(connectorScopes, Nat.compare, connectorId)) { case (?s) s; case null [] };
  func inScope(scope : [Nat], connId : Nat) : Bool {
    if (scope.size() == 0) return true;
    for (c in scope.vals()) if (c == connId) return true;
    false;
  };
  /// accessOf, but only counting accounts from connections within the scope.
  func accessOfScoped(email : Text, scope : [Nat]) : { #active; #inactive; #unknown } {
    let e = lower(norm(email));
    if (e == "") return #unknown;
    var found = false;
    for ((_, u) in Map.entries(users)) {
      if (u.email == e and inScope(scope, u.connId)) {
        found := true;
        if (effActive(u)) return #active;
      };
    };
    if (found) #inactive else #unknown;
  };

  // ---- instant deactivation push (the hub_deactivate lane of the contract) ----
  // Fire-and-forget to every registered connector; a tool that doesn't
  // implement hub_deactivate just fails the call harmlessly (caught).
  type ConnectorPushActor = actor { hub_deactivate : ([Text]) -> async Nat };
  func notifyDeactivated(emails : [Text]) : async () {
    if (emails.size() == 0) return;
    let snap = List.empty<Principal>(); // snapshot: connectors may change while we await
    for ((id, c) in Map.entries(connectors)) if (not isOidcConnector(id)) List.add(snap, c.canisterId); // OIDC clients have no canister to push to
    for (cid in List.toArray(snap).vals()) {
      let a : ConnectorPushActor = actor (Principal.toText(cid));
      try { ignore await (with timeout = 30) a.hub_deactivate(emails) } catch (_) {};
    };
  };

  // ---------- SCIM 2.0 server (external mastering: Okta / Entra / HRIS push) ----------
  // Since 0.20 there are SCIM SOURCES: several identity providers push through their own
  // bearer token (stored as a hash), each into its own source id, and each sees, changes,
  // deactivates and groups ONLY its own people. Source 1 keeps the reserved id SCIM_CONN, so
  // a hub that ran one SCIM token before 0.20 continues without moving a single record.
  // Optional domain scope per source: a source may only provision addresses of its own domains.
  // People pushed here live in the same user store, so every lane — effActive, accessOf,
  // connectorDirectory, kill switch — treats them like any other account.

  var scimToken : Text = ""; // pre-0.20 single token (plain) — honoured until source 1 rotates it; then empty
  var scimLastSeen : Int = 0;
  var scimLastOp : Text = "";
  type ScimSource = { id : Nat; name : Text; tokenHash : Text; domains : [Text]; enabled : Bool; createdAt : Int; lastSeen : Int; lastOp : Text; note : Text };
  let scimSources : Map.Map<Nat, ScimSource> = Map.empty<Nat, ScimSource>();
  var nextScimSourceId : Nat = 1;
  let groupScimSource : Map.Map<Text, Nat> = Map.empty<Text, Nat>(); // SCIM group id → source id (groups pushed before 0.20 belong to source 1)
  transient let SCIM_MAX_SOURCES : Nat = 10;

  func scimConnId(sourceId : Nat) : Nat = if (sourceId == 1) SCIM_CONN else SCIM_CONN + sourceId;
  func isScimConn(connId : Nat) : Bool = connId >= SCIM_CONN and connId < SCIM_CONN + 1_000_000;
  func scimSourceOfConn(connId : Nat) : ?ScimSource { for ((_, src) in Map.entries(scimSources)) if (scimConnId(src.id) == connId) return ?src; null };
  func scimHash(tok : Text) : Text = hex(Sha256.fromBlob(#sha256, Text.encodeUtf8(tok)));
  /// the source a bearer token belongs to (enabled sources only); the pre-0.20 token maps to source 1
  func scimSourceByToken(bearer : Text) : ?ScimSource {
    if (bearer == "") return null;
    let h = scimHash(bearer);
    for ((_, src) in Map.entries(scimSources)) if (src.enabled and src.tokenHash == h) return ?src;
    if (scimToken != "" and bearer == scimToken) { switch (Map.get(scimSources, Nat.compare, 1)) { case (?src) { if (src.enabled) return ?src }; case null {} } };
    null;
  };
  func scimAnyEnabled() : Bool { for ((_, src) in Map.entries(scimSources)) if (src.enabled) return true; false };
  /// is the source that masters this connection still switched on? (off → its people and groups become editable here)
  func scimConnLive(connId : Nat) : Bool = switch (scimSourceOfConn(connId)) { case (?src) src.enabled; case null false };
  func scimUserCount(sourceId : Nat) : Nat { var n = 0; let c = scimConnId(sourceId); for ((_, u) in Map.entries(users)) if (u.connId == c) n += 1; n };
  func scimGroupCount(sourceId : Nat) : Nat { var n = 0; for ((_, sid) in Map.entries(groupScimSource)) if (sid == sourceId) n += 1; n };
  func cleanDomains(ds : [Text]) : [Text] {
    let out = List.empty<Text>();
    for (d0 in ds.vals()) { let d = lower(norm(Text.trimStart(norm(d0), #char '@'))); if (d != "" and Text.contains(d, #char '.') and not Text.contains(d, #char ' ') and not has(List.toArray(out), d)) List.add(out, d) };
    List.toArray(out);
  };
  func domainAllowed(src : ScimSource, email : Text) : Bool {
    if (src.domains.size() == 0) return true;
    let dom = switch (Text.split(email, #char '@').toArray()) { case (ps) { if (ps.size() == 2) ps[1] else "" } };
    for (d in src.domains.vals()) if (dom == d) return true;
    false;
  };
  /// pre-0.20 hubs: the single token becomes source 1 ("SCIM"), its people keep their records
  func scimMigrate() {
    if (Map.size(scimSources) > 0) return;
    var pushed = false;
    for ((_, u) in Map.entries(users)) if (u.connId == SCIM_CONN) pushed := true;
    if (scimToken == "" and not pushed and Map.size(groupScimIds) == 0) return;
    Map.add(scimSources, Nat.compare, 1, { id = 1; name = "SCIM"; tokenHash = (if (scimToken == "") "" else scimHash(scimToken)); domains = []; enabled = scimToken != ""; createdAt = Time.now(); lastSeen = scimLastSeen; lastOp = scimLastOp; note = "" });
    for ((sid, _) in Map.entries(groupScimIds)) Map.add(groupScimSource, Text.compare, sid, 1);
    nextScimSourceId := 2;
    journal("scim", "0.20: the SCIM token became source #1 (\"SCIM\")", Principal.fromText("2vxsx-fae"));
  };
  func mintScimToken() : async Text { hex(await ic00.raw_rand()) # hex(await ic00.raw_rand()) };

  /// Owners: a new SCIM source — a name (the IdP), optional domains it may provision. Returns the bearer token ONCE; only its hash is kept.
  public shared ({ caller }) func addScimSource(name : Text, domains : [Text]) : async { ok : Bool; id : Nat; token : Text; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; id = 0; token = ""; detail = "owners only" };
    scimMigrate();
    let n = norm(name);
    if (n == "" or n.size() > 60) return { ok = false; id = 0; token = ""; detail = "a name for the source (1–60 characters), e.g. the identity provider" };
    if (Map.size(scimSources) >= SCIM_MAX_SOURCES) return { ok = false; id = 0; token = ""; detail = "at most ten SCIM sources" };
    for ((_, src) in Map.entries(scimSources)) if (lower(src.name) == lower(n)) return { ok = false; id = 0; token = ""; detail = "a source with that name exists" };
    if (nextScimSourceId < 2) nextScimSourceId := (if (Map.size(scimSources) == 0) 1 else 2);
    let id = nextScimSourceId;
    let tok = await mintScimToken();
    if (not isOwnerRole(caller) or Map.containsKey(scimSources, Nat.compare, id)) return { ok = false; id = 0; token = ""; detail = "changed meanwhile — try again" };
    nextScimSourceId := id + 1;
    Map.add(scimSources, Nat.compare, id, { id; name = n; tokenHash = scimHash(tok); domains = cleanDomains(domains); enabled = true; createdAt = Time.now(); lastSeen = 0; lastOp = ""; note = "" });
    journal("scim", "SCIM source #" # Nat.toText(id) # " \"" # n # "\" created" # (if (domains.size() > 0) " (domains " # Text.join(cleanDomains(domains).vals(), ", ") # ")" else ""), caller);
    { ok = true; id; token = tok; detail = "" };
  };
  /// Owners: replace a source's token — the old one stops working at once (also retires the pre-0.20 plain token for source 1).
  public shared ({ caller }) func rotateScimSourceToken(id : Nat) : async { ok : Bool; token : Text; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; token = ""; detail = "owners only" };
    await rotateScimInternal(caller, id);
  };
  // private: no self-call through the public surface (the caller would become the canister)
  func rotateScimInternal(caller : Principal, id : Nat) : async { ok : Bool; token : Text; detail : Text } {
    scimMigrate();
    switch (Map.get(scimSources, Nat.compare, id)) { case null return { ok = false; token = ""; detail = "no such source" }; case (?_) {} };
    let tok = await mintScimToken();
    let src = switch (Map.get(scimSources, Nat.compare, id)) { case (?s) s; case null return { ok = false; token = ""; detail = "source vanished" } };
    if (not isOwnerRole(caller)) return { ok = false; token = ""; detail = "not allowed" };
    Map.add(scimSources, Nat.compare, id, { src with tokenHash = scimHash(tok); enabled = true });
    if (id == 1) scimToken := "";
    journal("scim", "SCIM source #" # Nat.toText(id) # " \"" # src.name # "\": token rotated", caller);
    { ok = true; token = tok; detail = "" };
  };
  /// Admins: rename, change the domain scope or the note of a source.
  public shared ({ caller }) func updateScimSource(id : Nat, name : Text, domains : [Text], note : Text) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    scimMigrate();
    let src = switch (Map.get(scimSources, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such source" } };
    let n = norm(name); if (n == "" or n.size() > 60) return { ok = false; detail = "a name (1–60 characters)" };
    for ((_, o) in Map.entries(scimSources)) if (o.id != id and lower(o.name) == lower(n)) return { ok = false; detail = "a source with that name exists" };
    Map.add(scimSources, Nat.compare, id, { src with name = n; domains = cleanDomains(domains); note = norm(note) });
    journal("scim", "SCIM source #" # Nat.toText(id) # " updated: " # n # (if (domains.size() > 0) " · domains " # Text.join(cleanDomains(domains).vals(), ", ") else " · any domain"), caller);
    { ok = true; detail = "" };
  };
  /// Owners: pause (pushes are refused with 401, its people and groups become editable here) or resume a source.
  public shared ({ caller }) func setScimSourceEnabled(id : Nat, enabled : Bool) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    scimMigrate();
    let src = switch (Map.get(scimSources, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such source" } };
    if (enabled and src.tokenHash == "" and not (id == 1 and scimToken != "")) return { ok = false; detail = "this source has no token — rotate it first" };
    Map.add(scimSources, Nat.compare, id, { src with enabled });
    journal("scim", "SCIM source #" # Nat.toText(id) # " \"" # src.name # "\" " # (if (enabled) "resumed" else "paused"), caller);
    { ok = true; detail = "" };
  };
  /// Owners: remove a source. Its people are dropped like an Okta connection's (deactivations pushed to the apps), its groups become ordinary groups.
  public shared ({ caller }) func removeScimSource(id : Nat) : async { ok : Bool; detail : Text; people : Nat } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only"; people = 0 };
    scimMigrate();
    let src = switch (Map.get(scimSources, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such source"; people = 0 } };
    let conn = scimConnId(id);
    let doomed = List.empty<Text>(); let mails = List.empty<Text>();
    for ((k, u) in Map.entries(users)) if (u.connId == conn) { List.add(doomed, k); List.add(mails, u.email) };
    for (k in List.values(doomed)) ignore Map.delete(users, Text.compare, k);
    reconcilePersons();
    let gone = List.empty<Text>();
    for (e in List.values(mails)) { if (e != "" and accessOf(e) != #active) List.add(gone, e) };
    let sids = List.empty<Text>(); for ((sid, s0) in Map.entries(groupScimSource)) if (s0 == id) List.add(sids, sid);
    for (sid in List.values(sids)) { ignore Map.delete(groupScimSource, Text.compare, sid); ignore Map.delete(groupScimIds, Text.compare, sid) }; // the groups stay, now manual
    ignore Map.delete(scimSources, Nat.compare, id);
    if (id == 1) scimToken := "";
    if (List.size(gone) > 0) await notifyDeactivated(List.toArray(gone));
    journal("scim", "SCIM source #" # Nat.toText(id) # " \"" # src.name # "\" removed with " # Nat.toText(List.size(doomed)) # " of its people (" # Nat.toText(List.size(gone)) # " pushed as deactivated)", caller);
    { ok = true; detail = ""; people = List.size(doomed) };
  };
  public type ScimSourceView = { id : Nat; name : Text; domains : [Text]; enabled : Bool; createdAt : Int; lastSeen : Int; lastOp : Text; note : Text; userCount : Nat; groupCount : Nat; hasToken : Bool; legacyToken : Bool };
  /// Admins: the SCIM sources with their counters (tokens never leave the hub).
  public shared query ({ caller }) func listScimSources() : async [ScimSourceView] {
    assert isAdmin(caller);
    let out = List.empty<ScimSourceView>();
    // a pre-0.20 hub that has not called a mutating method yet: show the token as source 1 too
    if (Map.size(scimSources) == 0 and scimToken != "") List.add(out, { id = 1; name = "SCIM"; domains = []; enabled = true; createdAt = 0; lastSeen = scimLastSeen; lastOp = scimLastOp; note = ""; userCount = scimUserCount(1); groupCount = Map.size(groupScimIds); hasToken = true; legacyToken = true });
    for ((_, src) in Map.entries(scimSources)) List.add(out, { id = src.id; name = src.name; domains = src.domains; enabled = src.enabled; createdAt = src.createdAt; lastSeen = src.lastSeen; lastOp = src.lastOp; note = src.note; userCount = scimUserCount(src.id); groupCount = scimGroupCount(src.id); hasToken = src.tokenHash != "" or (src.id == 1 and scimToken != ""); legacyToken = src.id == 1 and scimToken != "" });
    List.toArray(out);
  };

  // ---- pre-0.20 methods, kept for the old UI and for scripts: they act on source 1 ----
  /// Owners: generate or rotate the token of source 1 (creates the source when the hub had none).
  public shared ({ caller }) func genScimToken() : async Text {
    assert isOwnerRole(caller);
    scimMigrate();
    if (not Map.containsKey(scimSources, Nat.compare, 1)) {
      let r = await addScimSourceInternal(caller, "SCIM", []);
      return r.token;
    };
    let r = await rotateScimInternal(caller, 1);
    r.token;
  };
  func addScimSourceInternal(caller : Principal, name : Text, domains : [Text]) : async { token : Text } {
    let tok = await mintScimToken();
    if (Map.containsKey(scimSources, Nat.compare, 1)) return { token = "" };
    Map.add(scimSources, Nat.compare, 1, { id = 1; name; tokenHash = scimHash(tok); domains = cleanDomains(domains); enabled = true; createdAt = Time.now(); lastSeen = 0; lastOp = ""; note = "" });
    if (nextScimSourceId < 2) nextScimSourceId := 2;
    journal("scim", "SCIM source #1 \"" # name # "\" created", caller);
    { token = tok };
  };
  /// Owners: switch source 1 off (pushes refused; people already pushed stay).
  public shared ({ caller }) func revokeScimToken() : async Bool {
    assert isOwnerRole(caller);
    scimMigrate();
    switch (Map.get(scimSources, Nat.compare, 1)) { case (?src) Map.add(scimSources, Nat.compare, 1, { src with enabled = false; tokenHash = "" }); case null {} };
    scimToken := "";
    journal("scim", "SCIM source #1 disabled (token revoked)", caller);
    true;
  };
  /// Admins: SCIM at a glance — enabled = at least one source is on; counters over all sources.
  public shared query ({ caller }) func scimStatus() : async { enabled : Bool; lastSeen : Int; lastOp : Text; userCount : Nat } {
    assert isAdmin(caller);
    var n = 0; var seen : Int = scimLastSeen; var op = scimLastOp;
    for ((_, u) in Map.entries(users)) if (isScimConn(u.connId)) n += 1;
    for ((_, src) in Map.entries(scimSources)) if (src.lastSeen > seen) { seen := src.lastSeen; op := src.lastOp };
    { enabled = scimAnyEnabled() or (Map.size(scimSources) == 0 and scimToken != ""); lastSeen = seen; lastOp = op; userCount = n };
  };

  // ---- helpers ----
  func jesc(t : Text) : Text {
    var out = "";
    for (c in t.chars()) {
      if (c == '\"') { out #= "\\\"" } else if (c == '\\') { out #= "\\\\" } else if (c == '\n') { out #= "\\n" } else if (c == '\r') {} else { out #= Char.toText(c) };
    };
    out;
  };
  func hexVal(c : Char) : ?Nat {
    switch (c) {
      case '0' ?0; case '1' ?1; case '2' ?2; case '3' ?3; case '4' ?4;
      case '5' ?5; case '6' ?6; case '7' ?7; case '8' ?8; case '9' ?9;
      case 'a' ?10; case 'b' ?11; case 'c' ?12; case 'd' ?13; case 'e' ?14; case 'f' ?15;
      case 'A' ?10; case 'B' ?11; case 'C' ?12; case 'D' ?13; case 'E' ?14; case 'F' ?15;
      case _ null;
    };
  };
  func urlDecode(t : Text) : Text {
    let cs = Iter.toArray(t.chars());
    var out = "";
    var i = 0;
    while (i < cs.size()) {
      let c = cs[i];
      if (c == '+') { out #= " "; i += 1 } else if (c == '%' and i + 2 < cs.size()) {
        switch (hexVal(cs[i + 1]), hexVal(cs[i + 2])) {
          case (?h, ?l) { out #= Char.toText(Nat32.toChar(Nat.toNat32(h * 16 + l))); i += 3 };
          case (_, _) { out #= Char.toText(c); i += 1 };
        };
      } else { out #= Char.toText(c); i += 1 };
    };
    out;
  };
  func queryParam(url : Text, name : Text) : Text {
    let it = Text.split(url, #char '?');
    ignore it.next();
    switch (it.next()) {
      case null "";
      case (?qs) {
        for (pair in Text.split(qs, #char '&')) {
          let kv = Iter.toArray(Text.split(pair, #char '='));
          if (kv.size() >= 1 and kv[0] == name) {
            return if (kv.size() >= 2) urlDecode(kv[1]) else "";
          };
        };
        "";
      };
    };
  };
  func scimRes(code : Nat16, body : Text) : HttpGwResponse = {
    status_code = code;
    headers = [("Content-Type", "application/scim+json")];
    body = Text.encodeUtf8(body);
    upgrade = null;
  };
  func scimErr(code : Nat16, detail : Text) : HttpGwResponse =
    scimRes(code, "{\"schemas\":[\"urn:ietf:params:scim:api:messages:2.0:Error\"],\"status\":\"" # Nat16.toText(code) # "\",\"detail\":\"" # jesc(detail) # "\"}");

  func scimUserJson(u : UserRec) : Text {
    "{\"schemas\":[\"urn:ietf:params:scim:schemas:core:2.0:User\"],\"id\":\"" # jesc(u.externalId)
    # "\",\"userName\":\"" # jesc(u.email)
    # "\",\"displayName\":\"" # jesc(u.displayName)
    # "\",\"name\":{\"givenName\":\"" # jesc(u.firstName) # "\",\"familyName\":\"" # jesc(u.lastName)
    # "\"},\"active\":" # (if (u.activeIdp) "true" else "false")
    # ",\"meta\":{\"resourceType\":\"User\"}}";
  };

  func scimFindByEmail(conn : Nat, e : Text) : ?UserRec {
    for ((_, u) in Map.entries(users)) if (u.connId == conn and u.email == e) return ?u;
    null;
  };
  /// another SCIM source holds this address with an active account → 409 (one address, one source)
  func heldByOtherScimSource(conn : Nat, e : Text) : ?Text {
    for ((_, u) in Map.entries(users)) if (isScimConn(u.connId) and u.connId != conn and u.email == e and u.activeIdp) { return ?(switch (scimSourceOfConn(u.connId)) { case (?src) src.name; case null "another source" }) };
    null;
  };

  func opActive(v : Json.Json) : ?Bool {
    switch (v) {
      case (#bool(b)) ?b;
      case (#string(sv)) {
        let l = lower(sv);
        if (l == "true") ?true else if (l == "false") ?false else null;
      };
      case (#object_(_)) {
        let f = lower(jsonField(v, ["active"]));
        if (f == "true") ?true else if (f == "false") ?false else null;
      };
      case (_) null;
    };
  };

  /// One object member by its exact key (case-insensitive). `Json.get` reads dotted paths, so a
  /// key that itself contains dots — every SCIM schema URN ("…:2.0:User") — needs this instead.
  func jsonKey(obj : Json.Json, key : Text) : Json.Json {
    let kv = switch (obj) { case (#object_(pairs)) pairs; case (_) return #null_ };
    let want = lower(key);
    for ((k, v) in kv.vals()) if (lower(k) == want) return v;
    #null_;
  };

  func scimProfile(body : Json.Json) : [(Text, Text)] {
    // 0.20.1: read with jsonKey — Json.get split the URN at "2.0" and silently dropped the whole
    // enterprise extension, so department, cost centre, manager … never arrived through SCIM.
    let ent = jsonKey(body, "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User");
    let mgr = jsonKey(ent, "manager");
    let mgrTxt = do { let d = jsonField(mgr, ["displayName"]); if (d != "") d else jsonField(mgr, ["value"]) };
    let out = List.empty<(Text, Text)>();
    func put(k : Text, v : Text) { if (v != "") List.add(out, (k, v)) };
    put("title", jsonField(body, ["title"]));
    put("userType", jsonField(body, ["userType"]));
    put("location", jsonField(body, ["location", "timezone", "locale"]));
    put("department", jsonField(ent, ["department"]));
    put("division", jsonField(ent, ["division"]));
    put("organization", jsonField(ent, ["organization"]));
    put("costCenter", jsonField(ent, ["costCenter"]));
    put("employeeNumber", jsonField(ent, ["employeeNumber"]));
    put("manager", mgrTxt);
    // 0.20.1 — the work address and every schema-extension attribute become plain attributes
    // under the same names the Okta pull lane uses, so an exclude filter such as
    // "city^=Remote" or "entity=LLC" works whichever lane brought the person in.
    func have(k : Text) : Bool { for ((ok, _) in List.toArray(out).vals()) if (lower(ok) == lower(k)) return true; false };
    for ((k, v) in scimAddressAttrs(body).vals()) if (not have(k)) put(k, v);
    for ((k, v) in scimExtensionAttrs(body).vals()) if (not have(k)) put(k, v);
    List.toArray(out);
  };

  /// SCIM `addresses` → (city, state, countryCode). The entry typed "work" wins, then the
  /// primary one, then the first. Street and postal code are deliberately not kept.
  func scimAddressAttrs(body : Json.Json) : [(Text, Text)] {
    let items = switch (Json.get(body, "addresses")) { case (?#array(a)) a; case (_) return [] };
    if (items.size() == 0) return [];
    var pick = items[0];
    var rank = 0; // 0 = first, 1 = primary, 2 = work
    for (it in items.vals()) {
      let r = if (lower(jsonField(it, ["type"])) == "work") 2 else if (lower(jsonField(it, ["primary"])) == "true") 1 else 0;
      if (r > rank) { pick := it; rank := r };
    };
    addressAttrsOf(pick);
  };
  func addressAttrsOf(addr : Json.Json) : [(Text, Text)] {
    let out = List.empty<(Text, Text)>();
    for ((src, key) in [("locality", "city"), ("region", "state"), ("country", "countryCode")].vals()) {
      let v = jsonField(addr, [src]);
      if (v != "") List.add(out, (key, v));
    };
    List.toArray(out);
  };

  /// Scalars of every `urn:…` schema-extension object other than the enterprise one (Okta and
  /// Entra send custom profile attributes such as `entity` this way) — at most 32 of them.
  func scimExtensionAttrs(body : Json.Json) : [(Text, Text)] {
    let kv = switch (body) { case (#object_(pairs)) pairs; case (_) return [] };
    let out = List.empty<(Text, Text)>();
    for ((k, v) in kv.vals()) {
      let kl = lower(k);
      if (Text.startsWith(kl, #text "urn:") and kl != "urn:ietf:params:scim:schemas:extension:enterprise:2.0:user") {
        for (pv in flattenObj(v).vals()) if (List.size(out) < 32) List.add(out, pv);
      };
    };
    List.toArray(out);
  };

  /// Last segment of a SCIM attribute path (`urn:x:y:User:entity` → `entity`, `a.b.c` → `c`).
  func pathLeaf(path : Text) : Text {
    var leaf = "";
    for (seg in Text.split(path, #char ':')) { for (s in Text.split(seg, #char '.')) if (s != "") leaf := s };
    leaf;
  };

  func scimApplyBody(conn : Nat, existing : ?UserRec, id : Text, body : Json.Json) : UserRec {
    let now = Time.now();
    let email0 = lower(norm(jsonField(body, ["userName"])));
    let given = jsonField(body, ["givenName"]);
    let name = switch (Json.get(body, "name")) { case (?n) n; case null #null_ };
    let first = if (given != "") given else jsonField(name, ["givenName"]);
    let last = jsonField(name, ["familyName"]);
    let disp0 = jsonField(body, ["displayName"]);
    let activeTxt = lower(jsonField(body, ["active"]));
    let base = switch (existing) {
      case (?u) u;
      case null ({
        connId = conn; externalId = id; email = email0; displayName = ""; firstName = ""; lastName = "";
        status = "ACTIVE"; activeIdp = true; override = null; attributes = []; createdAt = now; updatedAt = now;
      } : UserRec);
    };
    let email = if (email0 != "") email0 else base.email;
    let disp = if (disp0 != "") disp0 else if (first # last != "") norm(first # " " # last) else if (base.displayName != "") base.displayName else email;
    let act = if (activeTxt == "false") false else if (activeTxt == "true") true else base.activeIdp;
    {
      base with
      email;
      displayName = disp;
      firstName = if (first != "") first else base.firstName;
      lastName = if (last != "") last else base.lastName;
      status = if (act) "ACTIVE" else "DEPROVISIONED";
      activeIdp = act;
      attributes = do {
        let prof = scimProfile(body);
        let merged = List.empty<(Text, Text)>();
        for (pv in prof.vals()) List.add(merged, pv);
        // keep what the record already had, override with what this body carries,
        // and never store credentials or protocol plumbing as profile attributes
        let skip = ["password", "schemas", "id", "meta", "active", "username", "groups", "x509certificates"];
        func skipped(k : Text) : Bool { for (sk in skip.vals()) if (lower(k) == sk) return true; false };
        for ((k, v) in flattenObj(body).vals()) {
          var dup = false;
          for ((pk, _) in prof.vals()) if (pk == k) dup := true;
          if (not dup and not skipped(k)) List.add(merged, (k, v));
        };
        for ((k, v) in base.attributes.vals()) {
          var have = false;
          for ((mk, _) in List.toArray(merged).vals()) if (mk == k) have := true;
          if (not have and not skipped(k)) List.add(merged, (k, v));
        };
        List.toArray(merged);
      };
      updatedAt = now;
    };
  };

  /// Apply one path-ful SCIM PATCH value. Empty value = remove the attribute.
  func withAttr(u : UserRec, key : Text, value : Text) : UserRec {
    let out = List.empty<(Text, Text)>();
    for ((k, v) in u.attributes.vals()) if (lower(k) != lower(key)) List.add(out, (k, v));
    if (value != "") List.add(out, (key, value));
    ({ u with attributes = List.toArray(out) });
  };
  func scimPatchField(u : UserRec, pathLower : Text, value : Text) : UserRec {
    func setAttr(key : Text) : UserRec = withAttr(u, key, value);
    let isAddress = Text.startsWith(pathLower, #text "addresses");
    if (pathLower == "username") { if (value != "") ({ u with email = lower(norm(value)) }) else u }
    else if (pathLower == "displayname") ({ u with displayName = value })
    else if (pathLower == "name.givenname") ({ u with firstName = value })
    else if (pathLower == "name.familyname") ({ u with lastName = value })
    else if (Text.endsWith(pathLower, #text "department")) setAttr("department")
    else if (Text.endsWith(pathLower, #text "costcenter")) setAttr("costCenter")
    else if (Text.endsWith(pathLower, #text "division")) setAttr("division")
    else if (Text.endsWith(pathLower, #text "organization")) setAttr("organization")
    else if (Text.endsWith(pathLower, #text "employeenumber")) setAttr("employeeNumber")
    else if (Text.endsWith(pathLower, #text "manager") or Text.endsWith(pathLower, #text "manager.value")) setAttr("manager")
    else if (pathLower == "title") setAttr("title")
    else if (pathLower == "usertype") setAttr("userType")
    else if (pathLower == "locale" or pathLower == "timezone" or pathLower == "location") setAttr("location")
    else if (isAddress and Text.endsWith(pathLower, #text "locality")) setAttr("city")
    else if (isAddress and Text.endsWith(pathLower, #text "region")) setAttr("state")
    else if (isAddress and Text.endsWith(pathLower, #text "country")) setAttr("countryCode")
    else if (Text.startsWith(pathLower, #text "urn:")) {
      // custom schema extension (`urn:…:User:entity`): the leaf is the attribute name
      let leaf = pathLeaf(pathLower);
      if (leaf == "" or leaf == "user" or Text.contains(leaf, #char '[')) u else setAttr(leaf);
    }
    else u; // unknown path: ignore (SCIM allows partial support)
  };

  func scimStore(u : UserRec) { Map.add(users, Text.compare, userKey(u.connId, u.externalId), u) };
  func scimTouch(src : ScimSource, op : Text) { Map.add(scimSources, Nat.compare, src.id, { src with lastSeen = Time.now(); lastOp = op }); scimLastSeen := Time.now(); scimLastOp := op };

  func scimHandle(req : HttpGwRequest) : async HttpGwResponse {
    // auth first, always: the bearer token names the source; everything below is scoped to it
    scimMigrate();
    if (not scimAnyEnabled()) return scimErr(401, "SCIM is not enabled on this hub");
    let auth = gwHeader(req.headers, "authorization");
    let bearer = switch (Text.stripStart(auth, #text "Bearer ")) { case (?t) norm(t); case null "" };
    let src = switch (scimSourceByToken(bearer)) { case (?s) s; case null return scimErr(401, "invalid bearer token") };
    let conn = scimConnId(src.id);
    let parts = pathParts(req.url);
    // expected: scim / v2 / <resource> [/ <id>]
    if (parts.size() < 2 or parts[0] != "scim" or parts[1] != "v2") return scimErr(404, "unknown path");
    let resource = if (parts.size() >= 3) parts[2] else "";
    let rid = if (parts.size() >= 4) parts[3] else "";
    scimTouch(src, req.method # " /" # resource # (if (rid != "") "/…" else ""));

    if (resource == "ServiceProviderConfig") {
      return scimRes(200, "{\"schemas\":[\"urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig\"],\"patch\":{\"supported\":true},\"bulk\":{\"supported\":false,\"maxOperations\":0,\"maxPayloadSize\":0},\"filter\":{\"supported\":true,\"maxResults\":200},\"changePassword\":{\"supported\":false},\"sort\":{\"supported\":false},\"etag\":{\"supported\":false},\"authenticationSchemes\":[{\"type\":\"oauthbearertoken\",\"name\":\"Bearer token\",\"description\":\"Authorization: Bearer <token>\"}]}");
    };

    if (resource == "Groups") return await scimGroups(req, rid, src, conn);

    if (resource != "Users") return scimErr(404, "unknown resource");

    // ---- /Users ----
    if (req.method == "GET" and rid == "") {
      // optional filter: userName eq "someone@acme.com"
      let f = queryParam(req.url, "filter");
      var emailFilter = "";
      if (f != "") {
        if (not Text.startsWith(lower(f), #text "username eq")) return scimErr(400, "only the filter userName eq \"…\" is supported");
        let seg = Iter.toArray(Text.split(f, #char '\"'));
        if (seg.size() >= 2) emailFilter := lower(norm(seg[1]));
      };
      let hits = List.empty<Text>();
      for ((_, u) in Map.entries(users)) {
        if (u.connId == conn and (emailFilter == "" or u.email == emailFilter)) List.add(hits, scimUserJson(u));
      };
      let arr = List.toArray(hits);
      var joined = "";
      var i = 0;
      for (r in arr.vals()) { joined #= (if (i > 0) "," else "") # r; i += 1 };
      return scimRes(200, "{\"schemas\":[\"urn:ietf:params:scim:api:messages:2.0:ListResponse\"],\"totalResults\":" # Nat.toText(arr.size()) # ",\"startIndex\":1,\"itemsPerPage\":" # Nat.toText(arr.size()) # ",\"Resources\":[" # joined # "]}");
    };

    if (req.method == "GET") {
      switch (Map.get(users, Text.compare, userKey(conn, rid))) {
        case (?u) return scimRes(200, scimUserJson(u));
        case null return scimErr(404, "no such user");
      };
    };

    // mutations need a parseable body (except DELETE)
    let bodyText = switch (Text.decodeUtf8(req.body)) { case (?t) sanitizeSurrogates(t); case null "" }; // mo:json traps on \uD8xx escapes (emoji) — same guard as the hook path

    if (req.method == "POST" and rid == "") {
      let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return scimErr(400, "unparseable body") };
      let email = lower(norm(jsonField(parsed, ["userName"])));
      if (email == "") return scimErr(400, "userName is required");
      if (not domainAllowed(src, email)) return scimErr(403, "this source may only provision addresses of: " # Text.join(src.domains.vals(), ", "));
      switch (scimFindByEmail(conn, email)) { case (?_) return scimErr(409, "uniqueness: userName already exists"); case null {} };
      switch (heldByOtherScimSource(conn, email)) { case (?o) return scimErr(409, "uniqueness: userName is provisioned by another source (" # o # ")"); case null {} };
      let expectedHash = src.tokenHash;
      let id = hex(await ic00.raw_rand());
      switch (Map.get(scimSources, Nat.compare, src.id)) { case (?cur) { if (not cur.enabled or cur.tokenHash != expectedHash) return scimErr(401, "SCIM authorization changed") }; case null return scimErr(401, "SCIM authorization changed") };
      switch (scimFindByEmail(conn, email)) { case (?_) return scimErr(409, "uniqueness: userName already exists"); case null {} };
      switch (heldByOtherScimSource(conn, email)) { case (?o) return scimErr(409, "uniqueness: userName is provisioned by another source (" # o # ")"); case null {} };
      let u = scimApplyBody(conn, null, id, parsed);
      scimStore(u); reconcilePersons();
      journal("scim", "created " # u.email, Principal.fromText("2vxsx-fae"));
      return scimRes(201, scimUserJson(u));
    };

    if (rid == "") return scimErr(404, "user id missing");
    let key = userKey(conn, rid);
    let existing = switch (Map.get(users, Text.compare, key)) { case (?u) u; case null return scimErr(404, "no such user") };

    if (req.method == "PUT") {
      let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return scimErr(400, "unparseable body") };
      let u = scimApplyBody(conn, ?existing, rid, parsed);
      if (u.email != existing.email and not domainAllowed(src, u.email)) return scimErr(403, "this source may only provision addresses of: " # Text.join(src.domains.vals(), ", "));
      if (u.email != existing.email and addressHeldByOther(key, u.email)) return scimErr(409, "userName is held by another active person; deactivate that account first or use a different address");
      scimStore(u); reconcilePersons(); // a userName change is a rename of the same person (0.17) — the registry moves every reference
      journal("scim", "replaced " # u.email # (if (not u.activeIdp and existing.activeIdp) " (deactivated)" else ""), Principal.fromText("2vxsx-fae"));
      if (existing.activeIdp and not u.activeIdp and accessOf(u.email) != #active) { await notifyDeactivated([u.email]) };
      return scimRes(200, scimUserJson(u));
    };

    if (req.method == "PATCH") {
      let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return scimErr(400, "unparseable body") };
      let ops = switch (Json.get(parsed, "Operations")) {
        case (?#array(a)) a;
        case (_) { switch (Json.get(parsed, "operations")) { case (?#array(a)) a; case (_) ([] : [Json.Json]) } };
      };
      var act : ?Bool = null;
      var cur = existing;
      var changed = false;
      for (op in ops.vals()) {
        let pl = lower(jsonField(op, ["path"]));
        let opName = lower(jsonField(op, ["op"]));
        let v = switch (Json.get(op, "value")) { case (?x) x; case null #null_ };
        if (opName == "replace" or opName == "add") {
          if (pl == "active") {
            switch (opActive(v)) { case (?b) act := ?b; case null {} };
          } else if (pl == "") {
            // path-less op: value is a (partial) User object — run it through the mapper
            switch (v) {
              case (#object_(_)) { cur := scimApplyBody(conn, ?cur, rid, v); changed := true; switch (opActive(v)) { case (?b) act := ?b; case null {} } };
              case (_) {};
            };
          } else if (Text.startsWith(pl, #text "addresses") and (switch (v) { case (#object_(_)) true; case (#array(_)) true; case (_) false })) {
            // whole address object (Okta: path `addresses[type eq "work"]`, value {locality, region, country, …})
            let addr = switch (v) { case (#array(a)) (if (a.size() > 0) a[0] else #null_); case (x) x };
            for ((k, val) in addressAttrsOf(addr).vals()) { cur := withAttr(cur, k, val); changed := true };
          } else {
            // path-ful scalar (Entra style): userName, displayName, name.givenName, title, …:enterprise…:department
            let sv = switch (v) { case (#string(t)) t; case (#bool(b)) (if (b) "true" else "false"); case (_) jsonField(v, ["value", "displayName"]) };
            if (sv != "") { cur := scimPatchField(cur, pl, sv); changed := true };
          };
        } else if (opName == "remove" and pl != "" and pl != "active") {
          cur := scimPatchField(cur, pl, ""); changed := true;
        };
      };
      switch (act) { case (?b) { cur := { cur with activeIdp = b; status = if (b) "ACTIVE" else "DEPROVISIONED" }; changed := true }; case null {} };
      if (not changed) return scimRes(200, scimUserJson(existing));
      let u = { cur with updatedAt = Time.now() };
      if (u.email != existing.email and not domainAllowed(src, u.email)) return scimErr(403, "this source may only provision addresses of: " # Text.join(src.domains.vals(), ", "));
      if (u.email != existing.email and addressHeldByOther(key, u.email)) return scimErr(409, "userName is held by another active person; deactivate that account first or use a different address");
      scimStore(u); reconcilePersons();
      journal("scim", "patched " # u.email # (switch (act) { case (?false) " (deactivated)"; case (?true) " (activated)"; case null "" }), Principal.fromText("2vxsx-fae"));
      if (existing.activeIdp and not u.activeIdp and accessOf(u.email) != #active) { await notifyDeactivated([u.email]) };
      return scimRes(200, scimUserJson(u));
    };

    if (req.method == "DELETE") {
      let u = { existing with activeIdp = false; status = "DEPROVISIONED"; updatedAt = Time.now() };
      scimStore(u); reconcilePersons();
      journal("scim", "deleted (deactivated) " # u.email, Principal.fromText("2vxsx-fae"));
      if (accessOf(u.email) != #active) { await notifyDeactivated([u.email]) };
      return { status_code = 204; headers = []; body = Text.encodeUtf8(""); upgrade = null };
    };

    scimErr(405, "method not supported");
  };

  // ---- SCIM /Groups: groups pushed by the IdP (Okta "Push Groups", Entra) ----
  // A pushed group is mastered by the IdP: read-only in the hub UI while SCIM
  // is on. Members arrive as SCIM user ids (our externalId) — we resolve them
  // to e-mails; unknown ids are ignored, not errors (IdPs push in any order).
  func scimGroupJson(conn : Nat, g : Group) : Text {
    var mem = "";
    var i = 0;
    for (m in g.members.vals()) {
      let uid = switch (scimFindByEmail(conn, m)) { case (?u) u.externalId; case null m };
      mem #= (if (i > 0) "," else "") # "{\"value\":\"" # jesc(uid) # "\",\"display\":\"" # jesc(m) # "\"}";
      i += 1;
    };
    "{\"schemas\":[\"urn:ietf:params:scim:schemas:core:2.0:Group\"],\"id\":\"" # jesc(scimIdOfGroup(g.id)) # "\",\"displayName\":\"" # jesc(g.name) # "\",\"members\":[" # mem # "],\"meta\":{\"resourceType\":\"Group\"}}";
  };
  func scimMemberEmail(conn : Nat, v : Text) : Text {
    switch (Map.get(users, Text.compare, userKey(conn, v))) { case (?u) u.email; case null { if (Text.contains(v, #char '@')) lower(norm(v)) else "" } };
  };
  func scimMembersOf(conn : Nat, j : Json.Json) : [Text] {
    let out = List.empty<Text>();
    switch (Json.get(j, "members")) {
      case (?#array(items)) { for (it in items.vals()) { let e = scimMemberEmail(conn, jsonField(it, ["value"])); if (e != "") List.add(out, e) } };
      case (_) {};
    };
    List.toArray(out);
  };
  func groupOwnedBy(sid : Text, sourceId : Nat) : Bool = switch (Map.get(groupScimSource, Text.compare, sid)) { case (?s) s == sourceId; case null sourceId == 1 }; // pre-0.20 groups belong to source 1
  func scimGroupList(sourceId : Nat, conn : Nat, nameFilter : Text) : Text {
    let hits = List.empty<Text>();
    for ((sid, gid) in Map.entries(groupScimIds)) {
      if (groupOwnedBy(sid, sourceId)) switch (Map.get(groups, Nat.compare, gid)) { case (?g) { if (nameFilter == "" or lower(g.name) == lower(nameFilter)) List.add(hits, scimGroupJson(conn, g)) }; case null {} };
    };
    let arr = List.toArray(hits);
    var joined = "";
    var i = 0;
    for (r in arr.vals()) { joined #= (if (i > 0) "," else "") # r; i += 1 };
    "{\"schemas\":[\"urn:ietf:params:scim:api:messages:2.0:ListResponse\"],\"totalResults\":" # Nat.toText(arr.size()) # ",\"startIndex\":1,\"itemsPerPage\":" # Nat.toText(arr.size()) # ",\"Resources\":[" # joined # "]}";
  };
  func scimGroups(req : HttpGwRequest, rid : Text, src : ScimSource, conn : Nat) : async HttpGwResponse {
    let scimP = Principal.fromText("2vxsx-fae");
    if (req.method == "GET" and rid == "") {
      let f = queryParam(req.url, "filter");
      var nameFilter = "";
      if (f != "") {
        if (not Text.startsWith(lower(f), #text "displayname eq")) return scimErr(400, "only the filter displayName eq \"…\" is supported");
        let seg = Iter.toArray(Text.split(f, #char '\"'));
        if (seg.size() >= 2) nameFilter := norm(seg[1]);
      };
      return scimRes(200, scimGroupList(src.id, conn, nameFilter));
    };
    let bodyText = switch (Text.decodeUtf8(req.body)) { case (?t) t; case null "" };
    if (req.method == "POST" and rid == "") {
      let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return scimErr(400, "unparseable body") };
      let name = norm(jsonField(parsed, ["displayName"]));
      if (name == "") return scimErr(400, "displayName is required");
      // same name already mastered via SCIM (any source) → conflict: group names stay unique across the hub, rename it in the IdP; same name manual → the IdP takes it over
      let gid = switch (groupByName(name)) {
        case (?g) { if (groupSource(g.id) == "scim") return scimErr(409, "uniqueness: displayName already exists" # (if (groupOwnedBy(scimIdOfGroup(g.id), src.id)) "" else " (pushed by another source — rename the group in your identity provider)")); g.id };
        case null createGroup(name, "");
      };
      let sid = hex(await ic00.raw_rand());
      Map.add(groupScimIds, Text.compare, sid, gid);
      Map.add(groupScimSource, Text.compare, sid, src.id);
      switch (Map.get(groups, Nat.compare, gid)) { case (?g) Map.add(groups, Nat.compare, gid, { g with members = normMembers(scimMembersOf(conn, parsed)) }); case null {} };
      journal("scim", "group created " # name # " (source " # src.name # ")", scimP);
      switch (Map.get(groups, Nat.compare, gid)) { case (?g) return scimRes(201, scimGroupJson(conn, g)); case null return scimErr(500, "group vanished") };
    };
    if (rid == "") return scimErr(404, "group id missing");
    if (not groupOwnedBy(rid, src.id)) return scimErr(404, "no such group"); // another source's group is invisible here
    let gid = switch (Map.get(groupScimIds, Text.compare, rid)) { case (?g) g; case null return scimErr(404, "no such group") };
    let g = switch (Map.get(groups, Nat.compare, gid)) { case (?g) g; case null return scimErr(404, "no such group") };
    if (req.method == "GET") return scimRes(200, scimGroupJson(conn, g));
    if (req.method == "DELETE") {
      ignore Map.delete(groups, Nat.compare, gid);
      ignore Map.delete(groupScimIds, Text.compare, rid);
      ignore Map.delete(groupScimSource, Text.compare, rid);
      journal("scim", "group deleted " # g.name, scimP);
      return { status_code = 204; headers = []; body = Text.encodeUtf8(""); upgrade = null };
    };
    let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return scimErr(400, "unparseable body") };
    if (req.method == "PUT") {
      let name = norm(jsonField(parsed, ["displayName"]));
      if (name != "" and lower(name) != lower(g.name)) { switch (groupByName(name)) { case (?o) { if (o.id != gid) return scimErr(409, "uniqueness: displayName already exists") }; case null {} } };
      let ng = { g with name = (if (name == "") g.name else name); members = normMembers(scimMembersOf(conn, parsed)) };
      Map.add(groups, Nat.compare, gid, ng);
      journal("scim", "group replaced " # ng.name # " (" # Nat.toText(ng.members.size()) # " members)", scimP);
      return scimRes(200, scimGroupJson(conn, ng));
    };
    if (req.method == "PATCH") {
      let ops = switch (Json.get(parsed, "Operations")) {
        case (?#array(a)) a;
        case (_) { switch (Json.get(parsed, "operations")) { case (?#array(a)) a; case (_) ([] : [Json.Json]) } };
      };
      var cur = g;
      for (op in ops.vals()) {
        let opName = lower(jsonField(op, ["op"]));
        let path = lower(jsonField(op, ["path"]));
        let v = switch (Json.get(op, "value")) { case (?x) x; case null #null_ };
        if (path == "displayname" or (path == "" and jsonField(v, ["displayName"]) != "")) {
          let n = norm(switch (v) { case (#string(t)) t; case (_) jsonField(v, ["displayName"]) });
          if (n != "") cur := { cur with name = n };
        };
        if (path == "members" or Text.startsWith(path, #text "members[") or (path == "" and (switch (Json.get(v, "members")) { case (?_) true; case null false }))) {
          let vals : [Text] = switch (v) {
            case (#array(items)) Array.map<Json.Json, Text>(items, func(it) = scimMemberEmail(conn, jsonField(it, ["value"])));
            case (#object_(_)) { switch (Json.get(v, "members")) { case (?#array(items)) Array.map<Json.Json, Text>(items, func(it) = scimMemberEmail(conn, jsonField(it, ["value"]))); case (_) [] } };
            case (_) [];
          };
          if (opName == "add") cur := { cur with members = normMembers(Array.concat(cur.members, vals)) }
          else if (opName == "replace") cur := { cur with members = normMembers(vals) }
          else if (opName == "remove") {
            // Okta: path = members[value eq "<id>"], no value
            var target = "";
            if (Text.startsWith(path, #text "members[")) {
              let seg = Iter.toArray(Text.split(jsonField(op, ["path"]), #char '\"'));
              if (seg.size() >= 2) target := scimMemberEmail(conn, seg[1]);
            };
            let drop = if (target != "") [target] else vals;
            cur := { cur with members = Array.filter<Text>(cur.members, func(m) { for (d in drop.vals()) if (d == m) return false; true }) };
          };
        };
      };
      Map.add(groups, Nat.compare, gid, cur);
      journal("scim", "group patched " # cur.name # " (" # Nat.toText(cur.members.size()) # " members)", scimP);
      return scimRes(200, scimGroupJson(conn, cur));
    };
    scimErr(405, "method not supported");
  };

  // Per-connector EXCLUDE filters against the synced Okta profile attributes
  // (hub-central, like kinds/scoping — tools never filter themselves).
  // Rule format, case-insensitive: "field=value" (exact) or "field^=prefix".
  // Example (Lunch Check-in, on-site only): ["entity=LLC", "city^=Remote"].
  let connectorFilters : Map.Map<Nat, [Text]> = Map.empty<Nat, [Text]>();
  func filtersOf(connectorId : Nat) : [Text] = switch (Map.get(connectorFilters, Nat.compare, connectorId)) { case (?f) f; case null [] };

  // ---- who may use an app: the access policy ----
  // "everyone" (default) = every active person the source scope + exclude
  // filters leave; "selected" = only people in these groups, with these hub
  // roles, or named here. Evaluated in every gate (tickets, checkAccess,
  // directory, avatars, notifications) and for which tiles a person sees.
  public type AccessPolicy = { mode : Text; groups : [Text]; roles : [Text]; people : [Text] };
  let connectorAccess : Map.Map<Nat, AccessPolicy> = Map.empty<Nat, AccessPolicy>();
  func expiredGrant(target : Text, email : Text) : Bool {
    for ((_, g) in grants.entries()) if (g.state == "active" and g.target == target and g.email == email and g.expiresAt != 0 and g.expiresAt <= Time.now()) return true;
    false;
  };
  func groupMember(g : Group, email : Text) : Bool {
    not expiredGrant("group:" # Nat.toText(g.id), email) and g.members.values().any(func e = e == email);
  };
  func policyOf(cid : Nat) : AccessPolicy = switch (Map.get(connectorAccess, Nat.compare, cid)) {
    case (?p) ({ p with people = p.people.filter(func e = not expiredGrant("app:" # Nat.toText(cid), e)) });
    case null ({ mode = "everyone"; groups = []; roles = []; people = [] });
  };
  func policyAllows(cid : Nat, email : Text) : Bool {
    if (cid == 0) return true;
    switch (centrallyAllowed(cid, email)) { case (?allowed) allowed; case null policyAllowsP(policyOf(cid), email) };
  };
  func policyAllowsP(p : AccessPolicy, email : Text) : Bool {
    if (p.mode != "selected") return true;
    let e = lower(norm(email));
    for (x in p.people.vals()) if (x == e) return true;
    if (p.roles.size() > 0) { let r = hubRoleOf(e); if (r != "") { for (x in p.roles.vals()) if (x == r) return true } };
    if (p.groups.size() > 0) {
      for ((_, g) in Map.entries(groups)) {
        var wanted = false;
        for (pg in p.groups.vals()) if (lower(pg) == lower(g.name)) wanted := true;
        if (wanted and groupMember(g, e)) return true;
      };
    };
    false;
  };
  // Bound to the exact Desk backend; replacing a connector cannot transfer grants.
  type ReportingPolicy = { canisterId : Principal; revision : Nat; grants : [Permissions.ReportingGrant] };
  let deskReportingPolicies = Map.empty<Nat, ReportingPolicy>();
  func reportingText(cid : Nat, email : Text) : Text {
    let cfg = appPermissionPolicies.get(cid) ?? (return "");
    let conn = connectors.get(cid) ?? (return "");
    let policy = deskReportingPolicies.get(cid) ?? (return "");
    if (cfg.policy.app != "desk" or policy.canisterId != conn.canisterId or permissionDecision(cfg.policy, email).role == "none") return "";
    var result = ";";
    for (grant in policy.grants.values()) {
      let matches = switch (grant.subject) { case (#person id) id == pidForEmail(email); case (#group id) switch (groups.get(id)) { case (?g) groupMember(g, email); case null false } };
      if (matches) for (cap in grant.capabilities.values()) { let item = grant.projectId.toText() # ":" # cap # ";"; if (not result.contains(#text(";" # item))) result #= item };
    };result
  };
  public type DeskReportingAccess = { ok : Bool; detail : Text; revision : Nat; grants : [Permissions.ReportingGrant]; scopes : [Permissions.ReportingScope]; capabilities : [Permissions.Role] };
  public shared ({ caller }) func getDeskReportingAccess(cid : Nat) : async DeskReportingAccess { await reportingAccess(caller, cid) };
  func reportingAccess(caller : Principal, cid : Nat) : async DeskReportingAccess {
    func fail(message : Text) : DeskReportingAccess = { ok = false; detail = message; revision = 0; grants = []; scopes = []; capabilities = [] };
    if (not isAdminRole(caller)) return fail("Hub administrators only");
    let conn = connectors.get(cid) ?? (return fail("App unavailable"));
    let cfg = appPermissionPolicies.get(cid) ?? (return fail("Save central Desk permissions first"));
    if (cfg.policy.app != "desk") return fail("This scope belongs to Desk");
    let app : actor { hub_reportingScopes : shared () -> async [Permissions.ReportingScope] } = actor (conn.canisterId.toText());
    let scopes = try { await (with timeout = 15) app.hub_reportingScopes() } catch (_) { return fail("Update Desk to enable scoped reporting access") };
    if (not isAdminRole(caller) or connectors.get(cid) != ?conn or appPermissionPolicies.get(cid) != ?cfg) return fail("Access or app changed. Refresh.");
    let p = deskReportingPolicies.get(cid);
    let bound = switch p { case (?p) p.canisterId == conn.canisterId; case null false };
    { ok = true; detail = "Supplemental rights never grant incident or ticket access. No access in the base policy still denies entry."; revision = switch p { case (?p) p.revision; case null 0 }; grants = if (bound) (p ?? ({ canisterId = conn.canisterId; revision = 0; grants = [] })).grants else []; scopes; capabilities = Permissions.reportingCapabilities }
  };
  public shared ({ caller }) func setDeskReportingAccess(cid : Nat, revision : Nat, grants : [Permissions.ReportingGrant]) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "Only Hub owners manage permissions" };
    if (grants.size() > 200) return { ok = false; detail = "Maximum 200 scoped assignments" };
    let conn = connectors.get(cid) ?? (return { ok = false; detail = "App unavailable" });
    let base = appPermissionPolicies.get(cid);
    let access = await reportingAccess(caller, cid);
    if (not access.ok) return { ok = false; detail = access.detail };
    if (not isOwnerRole(caller) or connectors.get(cid) != ?conn or appPermissionPolicies.get(cid) != base or access.revision != revision) return { ok = false; detail = "App or permissions changed. Refresh." };
    let current = deskReportingPolicies.get(cid);
    if ((switch current { case (?p) p.revision; case null 0 }) != revision) return { ok = false; detail = "Reporting permissions changed. Refresh." };
    var seen : [Text] = [];
    for (grant in grants.values()) {
      if (not access.scopes.any(func p = p.id == grant.projectId) or grant.capabilities.size() == 0 or grant.capabilities.size() > 4) return { ok = false; detail = "Select an existing project and 1–4 reporting capabilities" };
      var caps : [Text] = [];
      for (cap in grant.capabilities.values()) { if (not Permissions.reportingValid(cap) or caps.any(func c = c == cap)) return { ok = false; detail = "Invalid or duplicate capability" };caps := caps.concat([cap]) };
      let subject = switch (grant.subject) {
        case (#person id) { let p = persons.get(id) ?? (return { ok = false; detail = "Unknown person" });if (p.sealedAt != 0) return { ok = false; detail = "Former identity cannot receive new grants" };"p:" # id };
        case (#group id) { if (not groups.containsKey(id)) return { ok = false; detail = "Unknown group" };"g:" # id.toText() }
      };
      let key = subject # ":" # grant.projectId.toText();
      if (seen.any(func k = k == key)) return { ok = false; detail = "Combine capabilities for the same subject and project" };seen := seen.concat([key]);
    };
    deskReportingPolicies.add(cid, { canisterId = conn.canisterId; revision = revision + 1; grants });
    appPermissionChecks.remove(cid);
    journal("permissions", "Desk reporting app #" # cid.toText() # " revision " # (revision + 1).toText() # ": " # debug_show(grants), caller);
    ignore Timer.setTimer<system>(#seconds 0, func() : async () { try { await pushDirectoryTo(cid) } catch (_) {} });
    { ok = true; detail = "Reporting rights saved in Hub. Check app enforcement; the directory lease still applies." }
  };
  // ---- authoritative app permissions (person ids, never email identities) ----
  let appPermissionPolicies = Map.empty<Nat, Permissions.StoredPolicy>();
  type PermissionCheck = { status : Permissions.Status; checkedAt : Int };
  let appPermissionChecks = Map.empty<Nat, PermissionCheck>();
  type PermissionDecision = { role : Text; source : Text; inherited : Bool };
  func permissionDecision(p : Permissions.Policy, email : Text) : PermissionDecision {
    let e = lower(norm(email));
    if (accessOf(e) != #active) return { role = "none"; source = "Inactive or missing Hub account"; inherited = true };
    let hr = hubRoleOf(e);
    if (hr == "owner" or hr == "admin") return { role = "admin"; source = "Global Hub " # hr; inherited = true };
    let pid = pidForEmail(e);
    if (pid == "") return { role = "none"; source = "Person identity is not ready"; inherited = true };
    for (g in p.people.vals()) if (g.id == pid) return { role = g.role; source = "Individual assignment"; inherited = false };
    var role = "none"; var source = "";
    for (grant in p.groups.vals()) {
      switch (groups.get(grant.id)) {
        case (?g) { if (groupMember(g, e) and Permissions.rank(grant.role) > Permissions.rank(role)) { role := grant.role; source := "Group: " # g.name } };
        case null {};
      };
    };
    if (source != "") return { role; source; inherited = true };
    { role = p.defaultRole; source = "App default"; inherited = true };
  };
  // Include effective identity/group/account changes, not just policy edits.
  // Length-prefixed fields make the snapshot unambiguous; compute once per directory.
  func permissionStamp(cid : Nat) : Text {
    let cfg = appPermissionPolicies.get(cid) ?? (return "");
    var snapshot = cfg.revision.toText() # ":";
    func field(t : Text) : Text { t.size().toText() # ":" # t };
    for ((id, person) in persons.entries()) if (person.sealedAt == 0 and pidForEmail(person.email) == id) {
      let d = permissionDecision(cfg.policy, person.email);
      snapshot #= field(id) # field(person.email) # field(d.role) # field(d.source) # field(reportingText(cid, person.email));
    };
    cfg.revision.toText() # ":" # sha256Hex(snapshot);
  };
  func permissionBearingGroup(gid : Nat) : Bool {
    appPermissionPolicies.values().any(func c = c.policy.groups.any(func g = g.id == gid)) or deskReportingPolicies.values().any(func p = p.grants.any(func g = g.subject == #group(gid)));
  };
  func centrallyAllowed(cid : Nat, email : Text) : ?Bool {
    switch (appPermissionPolicies.get(cid)) { case (?c) ?(permissionDecision(c.policy, email).role != "none"); case null null };
  };
  func permissionPolicyError(p : Permissions.Policy) : ?Text {
    if (not Permissions.supported(p.app)) return ?"Choose a supported app";
    if (not Permissions.valid(p.app, p.defaultRole) or p.defaultRole == "admin" or p.defaultRole == "agent") return ?"Choose a non-administrative app default";
    if (p.people.size() > 2000 or p.groups.size() > 100) return ?"Too many assignments";
    let seen = Map.empty<Text, Bool>();
    for (g in p.people.vals()) {
      if (not Permissions.valid(p.app, g.role)) return ?"Unsupported person role";
      if (seen.containsKey(g.id)) return ?"A person may have only one assignment";
      let person = persons.get(g.id) ?? (return ?"Unknown person id");
      if (person.sealedAt != 0) return ?"Remove assignments to former person identities";
      seen.add(g.id, true);
    };
    let gs = Map.empty<Nat, Bool>();
    for (g in p.groups.vals()) {
      if (not Permissions.valid(p.app, g.role) or g.role == "none") return ?"Groups grant a supported role; use an individual No access assignment to exclude a person";
      if (not groups.containsKey(g.id) or gs.containsKey(g.id)) return ?"Unknown or duplicate group";
      gs.add(g.id, true);
    };
    null;
  };
  type PermissionPerson = { id : Text; email : Text; name : Text; active : Bool; role : Text; source : Text; inherited : Bool; assigned : ?Text; previouslyAllowed : Bool };
  func permissionPeople(cid : Nat, p : Permissions.Policy) : [PermissionPerson] {
    let out = List.empty<PermissionPerson>();
    for ((id, person) in persons.entries()) if ((person.sealedAt == 0 and pidForEmail(person.email) == id) or p.people.any(func g = g.id == id)) {
      let d = if (person.sealedAt != 0 or pidForEmail(person.email) != id) ({ role = "none"; source = "Former person identity — remove its assignment"; inherited = true }) else permissionDecision(p, person.email);
      let assigned = p.people.find(func g = g.id == id).map(func g = g.role);
      out.add({ id; email = person.email; name = nameOfEmail(person.email); active = person.sealedAt == 0 and pidForEmail(person.email) == id and accessOf(person.email) == #active; role = d.role; source = d.source; inherited = d.inherited; assigned; previouslyAllowed = accessForConn(person.email, cid) == #active });
    };
    out.toArray();
  };
  public type AppPermissionView = { id : Nat; name : Text; configured : Bool; revision : Nat; policy : Permissions.Policy; roles : [Permissions.Role]; people : [PermissionPerson]; checkedAt : Int; enforced : Bool; status : ?Permissions.Status; canManage : Bool };
  func permissionView(cid : Nat, caller : Principal, preview : ?Permissions.Policy) : ?AppPermissionView {
    let c = connectors.get(cid) ?? (return null);
    let saved = appPermissionPolicies.get(cid);
    let p = switch (preview) { case (?p) p; case null { switch (saved) { case (?v) v.policy; case null ({ app = ""; defaultRole = "none"; people = []; groups = [] }) } } };
    let revision = switch (saved) { case (?v) v.revision; case null 0 };
    let checked = appPermissionChecks.get(cid);
    let checkedAt = switch (checked) { case (?v) v.checkedAt; case null 0 };
    let status = checked.map(func x = x.status);
    let enforced = switch (status) { case (?v) v.model == 1 and v.app == p.app and v.revision == permissionStamp(cid) and (switch (saved) { case (?c) c.policy == p; case null false }) and checkedAt + 60_000_000_000 > Time.now() and v.directoryAt + 60_000_000_000 > Time.now(); case null false };
    ?{ id = cid; name = c.name; configured = saved != null; revision; policy = p; roles = Permissions.roles(p.app); people = if (p.app == "") [] else permissionPeople(cid, p); checkedAt; enforced; status; canManage = isOwnerRole(caller) };
  };
  public shared query ({ caller }) func getAppPermissions(cid : Nat) : async ?AppPermissionView {
    assert isAdminRole(caller);
    permissionView(cid, caller, null);
  };
  public shared query ({ caller }) func previewAppPermissions(cid : Nat, p : Permissions.Policy) : async ?AppPermissionView {
    assert isAdminRole(caller);
    if (permissionPolicyError(p) != null) return null;
    permissionView(cid, caller, ?p);
  };
  func reportingSummary(cid : Nat, email : Text) : [Text] {
    let encoded = reportingText(cid, email);
    let policy = deskReportingPolicies.get(cid) ?? (return []);
    var result : [Text] = [];
    for (grant in policy.grants.values()) for (cap in Permissions.reportingCapabilities.values()) {
      if (Permissions.reportingHas(encoded, grant.projectId, cap.id)) {
        let text = cap.name # " · on-call project #" # grant.projectId.toText();
        if (not result.any(func x = x == text)) result := result.concat([text]);
      };
    };result
  };
  public shared query ({ caller }) func personAppPermissions(pid : Text) : async [{ cid : Nat; name : Text; app : Text; configured : Bool; role : Text; roleLabel : Text; source : Text; can : [Text]; cannot : [Text] }] {
    assert isAdminRole(caller);
    let person = persons.get(pid) ?? (return []);
    if (person.sealedAt != 0 or pidForEmail(person.email) != pid) return [];
    connectors.entries().map(func (cid, c) {
      switch (appPermissionPolicies.get(cid)) {
        case (?cfg) { let d = permissionDecision(cfg.policy, person.email); let r = Permissions.roles(cfg.policy.app).find(func r = r.id == d.role); { cid; name = c.name; app = cfg.policy.app; configured = true; role = d.role; roleLabel = switch(r) { case (?r) r.name; case null "No access" }; source = d.source; can = (switch(r) {case (?r) r.can;case null []}).concat(reportingSummary(cid, person.email)); cannot = switch(r) {case (?r) r.cannot;case null []} } };
        case null ({ cid; name = c.name; app = ""; configured = false; role = "unknown"; roleLabel = "Unconfirmed"; source = "App still uses its own permission rules"; can = []; cannot = [] });
      };
    }).toArray();
  };
  public shared ({ caller }) func setAppPermissions(cid : Nat, expectedRevision : Nat, p : Permissions.Policy) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "Only Hub owners manage app permissions" };
    switch (permissionPolicyError(p)) { case (?e) return { ok = false; detail = e }; case null {} };
    let c = connectors.get(cid) ?? (return { ok = false; detail = "No such app" });
    let current = appPermissionPolicies.get(cid);
    let rev = switch (current) { case (?v) v.revision; case null 0 };
    if (rev != expectedRevision) return { ok = false; detail = "Permissions changed. Reload and review the current rules" };
    switch (current) { case (?v) { if (v.policy.app != p.app) return { ok = false; detail = "The connected app type cannot be changed" } }; case null {} };
    let app : ManifestActor = actor (c.canisterId.toText());
    let manifest = try { await (with timeout = 10) app.hub_manifest() } catch (_) { return { ok = false; detail = "The app did not answer. Permissions were not changed" } };
    if (lower(norm(manifest.name)) != p.app) return { ok = false; detail = "The selected app type does not match its backend" };
    if (not isOwnerRole(caller) or connectors.get(cid) != ?c) return { ok = false; detail = "Permission or app changed during verification" };
    let latestRev = switch (appPermissionPolicies.get(cid)) { case (?v) v.revision; case null 0 };
    if (latestRev != expectedRevision) return { ok = false; detail = "Permissions changed. Reload before saving" };
    switch (permissionPolicyError(p)) { case (?e) return { ok = false; detail = e }; case null {} };
    let before = switch (current) { case (?v) v.policy; case null ({ app = p.app; defaultRole = "legacy"; people = []; groups = [] }) };
    if (before.defaultRole != p.defaultRole) journal("permissions", "app #" # cid.toText() # " default: " # before.defaultRole # " → " # p.defaultRole, caller);
    for (g in p.people.vals()) {
      let was = before.people.find(func x = x.id == g.id).map(func x = x.role) ?? "inherited";
      if (was != g.role) journal("permissions", "app #" # cid.toText() # " person " # g.id # ": " # was # " → " # g.role, caller);
    };
    for (g in before.people.vals()) if (not p.people.any(func x = x.id == g.id)) journal("permissions", "app #" # cid.toText() # " person " # g.id # ": " # g.role # " → inherited", caller);
    for (g in p.groups.vals()) {
      let was = before.groups.find(func x = x.id == g.id).map(func x = x.role) ?? "no grant";
      if (was != g.role) journal("permissions", "app #" # cid.toText() # " group #" # g.id.toText() # ": " # was # " → " # g.role, caller);
    };
    for (g in before.groups.vals()) if (not p.groups.any(func x = x.id == g.id)) journal("permissions", "app #" # cid.toText() # " group #" # g.id.toText() # ": " # g.role # " → no grant", caller);
    if (current == null) {
      for ((id, g) in grants.entries()) if (g.state == "active" and g.target == "app:" # cid.toText()) grants.add(id, { g with state = "superseded" });
      for ((id, item) in reviewItems.entries()) if (item.cid == cid and item.decision == "") reviewItems.add(id, { item with decision = "superseded"; applied = "Replaced by central Hub permissions"; decidedAt = Time.now(); decidedBy = actorLabel(caller) });
    };
    appPermissionPolicies.add(cid, { policy = p; revision = rev + 1; updatedAt = Time.now() });
    ignore appPermissionChecks.remove(cid);
    journal("permissions", "app #" # cid.toText() # " revision " # (rev + 1).toText() # ": default " # p.defaultRole # ", " # p.people.size().toText() # " person and " # p.groups.size().toText() # " group assignments", caller);
    // Push is an acceleration, never a substitute for the bounded full-directory lease.
    ignore Timer.setTimer<system>(#seconds 0, func() : async () { try { await pushDirectoryTo(cid) } catch (_) {} });
    { ok = true; detail = "Saved in Hub. Verify app enforcement; current sessions refresh within the directory lease" };
  };
  public shared ({ caller }) func checkAppPermissions(cid : Nat) : async { ok : Bool; detail : Text; status : ?Permissions.Status } {
    if (not isAdminRole(caller)) return { ok = false; detail = "Hub admins only"; status = null };
    let c = connectors.get(cid) ?? (return { ok = false; detail = "No such app"; status = null });
    let expected = appPermissionPolicies.get(cid);
    let app : actor { hub_permissionStatus : shared () -> async Permissions.Status } = actor (c.canisterId.toText());
    let status = try { await (with timeout = 30) app.hub_permissionStatus() } catch (_) { return { ok = false; detail = "This app has not confirmed central permissions. Update or check its connection"; status = null } };
    if (not isAdminRole(caller) or connectors.get(cid) != ?c or appPermissionPolicies.get(cid) != expected) return { ok = false; detail = "Configuration changed during verification; check again"; status = null };
    if (status.model != 1 or not Permissions.supported(status.app)) return { ok = false; detail = "Unsupported permissions protocol"; status = null };
    appPermissionChecks.add(cid, { status; checkedAt = Time.now() });
    { ok = true; detail = "App response received. Compare the confirmed revision with the Hub policy"; status = ?status };
  };

  // ---- lanes: WHAT an app receives (OAuth-style scopes, enforced here) ----
  // identity  e-mail, display name, active — the minimum for SSO, always on
  // profile   whitelisted org attributes (title, department, manager, …)
  // groups    the person's hub groups ("groups" attribute, groupsOf)
  // roles     the person's hub staff role ("hubRole" attribute)
  // avatars   profile pictures via connectorAvatar(s)
  // notify    may call hub_notify (bell / chat DM)
  // push      the hub pushes the scoped directory into hub_upsert (15 min)
  // Deactivation is ALWAYS pushed — security is not optional.
  // Connectors registered before lanes existed have no entry → all lanes
  // (what they got until now); the wizard always writes an explicit list.
  // ai        may fetch the company's AI key from the hub (hub_aiCredentials) — one key for the suite, set under Settings → AI
  let LANES : [Text] = ["identity", "profile", "groups", "roles", "avatars", "notify", "push"]; // STABLE (frozen at first install): legacy default for connectors without an explicit list — must not grow
  transient let LANE_LIST : [Text] = ["identity", "profile", "groups", "roles", "avatars", "notify", "push", "ai"]; // every lane a connector may be granted
  let connectorLanes : Map.Map<Nat, [Text]> = Map.empty<Nat, [Text]>();
  func lanesOf(cid : Nat) : [Text] = switch (Map.get(connectorLanes, Nat.compare, cid)) { case (?l) l; case null LANES };
  func hasLane(cid : Nat, lane : Text) : Bool { if (lane == "identity") return true; for (l in lanesOf(cid).vals()) if (l == lane) return true; false };
  func cleanLanes(ls : [Text]) : [Text] {
    let out = List.empty<Text>();
    List.add(out, "identity");
    for (l in ls.vals()) { let x = lower(norm(l)); var known = false; for (k in LANE_LIST.vals()) if (k == x) known := true; if (known and x != "identity" and not has(List.toArray(out), x)) List.add(out, x) };
    List.toArray(out);
  };
  func has(xs : [Text], x : Text) : Bool { for (y in xs.vals()) if (y == x) return true; false };
  /// attributes an app may see for one person, by its lanes
  func attrsForConn(cid : Nat, email : Text, raw : [(Text, Text)], stamp : Text) : [(Text, Text)] {
    var out : [(Text, Text)] = if (hasLane(cid, "profile")) forwardedAttrs(raw) else [];
    if (hasLane(cid, "groups")) {
      let e = lower(norm(email));
      var names = "";
      for ((_, g) in Map.entries(groups)) { if (groupMember(g, e)) names #= (if (names == "") "" else ";") # g.name };
      if (names != "") out := Array.concat(out, [("groups", names)]);
    };
    if (hasLane(cid, "roles")) { let hr = hubRoleOf(lower(norm(email))); if (hr != "") out := Array.concat(out, [("hubRole", hr)]) };
    switch (appPermissionPolicies.get(cid)) {
      case (?cfg) { let d = permissionDecision(cfg.policy, email); out := Array.concat(out, [("appPermissionModel", Permissions.model), ("appPermissionApp", cfg.policy.app), ("appPermissionRevision", stamp), ("appRole", d.role), ("appRoleSource", d.source)]); if (cfg.policy.app == "desk") out := out.concat([("deskReportingModel", "1"), ("deskReporting", reportingText(cid, email))]) };
      case null {};
    };
    out;
  };

  public shared ({ caller }) func setConnectorLanes(id : Nat, lanes : [Text]) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (not Map.containsKey(connectors, Nat.compare, id)) return { ok = false; detail = "no such app" };
    let ls = if (isOidcConnector(id)) oidcLanes(cleanLanes(lanes)) else cleanLanes(lanes); // an external app has no canister: no push, notify or avatars
    if (has(ls, "ai") and not hasLane(id, "ai") and not isOwnerRole(caller)) return { ok = false; detail = "only an owner may share the company AI credential with an app" };
    Map.add(connectorLanes, Nat.compare, id, ls);
    journal("connector", "lanes of app #" # Nat.toText(id) # " set to [" # Text.join(ls.vals(), ", ") # "]", caller);
    if (has(ls, "push")) ignore Timer.setTimer<system>(#seconds 0, func() : async () { await pushDirectoryTo(id) });
    { ok = true; detail = "" };
  };

  /// Syntactic check before Principal.fromText (which traps on garbage): the
  /// textual form is lowercase base32 groups of 5 joined by "-", last group ≤ 5.
  func principalSafe(t : Text) : ?Principal {
    let x = lower(norm(t));
    if (x.size() < 5 or x.size() > 63) return null;
    var run = 0;
    var groups = 0;
    for (c in x.chars()) {
      if (c == '-') { if (run == 0 or run > 5) return null; run := 0; groups += 1 }
      else if ((c >= 'a' and c <= 'z') or (c >= '2' and c <= '7')) run += 1
      else return null;
    };
    if (run == 0 or run > 5 or groups == 0) return null;
    ?Principal.fromText(x);
  };

  // ---- vault (backups) ----
  // The vault is a separate canister (a co-controller of the hub and of the
  // apps). The browser talks to it directly; the vault asks us whether the
  // caller is a hub OWNER — and only the configured vault may ask.
  var vaultId : Text = "";
  public shared ({ caller }) func setVault(id : Text) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    vaultId := if (norm(id) == "") "" else (switch (principalSafe(id)) { case null return { ok = false; detail = "not a canister id" }; case (?p) Principal.toText(p) });
    journal("admin", (if (vaultId == "") "vault unset" else "vault set to " # vaultId), caller);
    { ok = true; detail = "" };
  };
  public shared query ({ caller }) func vaultInfo() : async { vaultId : Text } { assert isAdmin(caller); { vaultId } };
  public shared query ({ caller }) func vaultAuth(p : Text) : async Bool {
    if (vaultId == "" or Principal.toText(caller) != vaultId) return false;
    switch (principalSafe(p)) { case (?pr) roleOf(pr) == "owner"; case null false };
  };

  // ---- kitchen (installer / updater) ----
  // Like the vault, the kitchen is a separate canister that is a controller of
  // the apps it cooks. It may register what it installed (kitchenConnect) and
  // asks us whether a browser principal is an owner (kitchenAuth).
  var kitchenId : Text = "";
  public shared ({ caller }) func setKitchen(id : Text) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    kitchenId := if (norm(id) == "") "" else (switch (principalSafe(id)) { case null return { ok = false; detail = "not a canister id" }; case (?p) Principal.toText(p) });
    journal("admin", (if (kitchenId == "") "kitchen unset" else "kitchen set to " # kitchenId), caller);
    { ok = true; detail = "" };
  };
  func isKitchen(p : Principal) : Bool = kitchenId != "" and Principal.toText(p) == kitchenId;
  public shared query ({ caller }) func kitchenInfo() : async { kitchenId : Text } { assert isAdmin(caller); { kitchenId } };
  public shared query ({ caller }) func kitchenAuth(p : Text) : async Bool {
    if (not isKitchen(caller)) return false;
    switch (principalSafe(p)) { case (?pr) roleOf(pr) == "owner"; case null false };
  };
  /// What the kitchen needs to know to cook: where the vault is, which canister
  /// serves this UI (for menu URLs and hub-frontend updates), the org name.
  public shared ({ caller }) func kitchenConfig() : async { vaultId : Text; frontendId : Text; orgName : Text; hubId : Text } {
    assert (isKitchen(caller) or isAdmin(caller));
    let fe = switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:frontend")) { case (?v) v; case null "" };
    { vaultId; frontendId = fe; orgName; hubId = Principal.toText(Principal.fromActor(UserHub)) };
  };
  /// The kitchen registers an app it just installed: lanes from the app's
  /// manifest (needs ∪ wants), everyone may use it, bound menu entry.
  public shared ({ caller }) func kitchenConnect(args : { name : Text; canisterId : Text; note : Text; tile : ?{ name : Text; url : Text; kind : Text } }) : async { ok : Bool; id : Nat; tileId : Nat; detail : Text } {
    if (not isKitchen(caller)) return { ok = false; id = 0; tileId = 0; detail = "kitchen only" };
    let pr = switch (principalSafe(norm(args.canisterId))) { case (?p) p; case null return { ok = false; id = 0; tileId = 0; detail = "that is not a canister id" } };
    let a : ManifestActor = actor (Principal.toText(pr));
    // only what the app NEEDS — an owner widens lanes deliberately in the Lanes editor, never by default.
    // Three attempts: a canister that was installed seconds ago can still be waking up, and a silent
    // fall-back to identity-only would leave the app without its notify/roles lanes (a silent alert path).
    var manifest : ?Manifest = null; var tries = 0;
    while (manifest == null and tries < 3) { tries += 1; manifest := try { ?(await (with timeout = 10) a.hub_manifest()) } catch (_) { null } };
    // App-supplied metadata never grants a credential by itself.
    let lanes : [Text] = switch (manifest) { case (?m) cleanLanes(m.needs).filter(func l = l != "ai"); case null ["identity"] };
    if (not isKitchen(caller)) return { ok = false; id = 0; tileId = 0; detail = "kitchen authorization changed" };
    let r = connectInternal<system>({ name = args.name; canisterId = args.canisterId; note = args.note; lanes; access = { mode = "everyone"; groups = []; roles = []; people = [] }; tile = args.tile }, caller);
    if (r.ok and manifest == null) return { r with detail = "the app did not answer hub_manifest — only identity granted; open Apps → the app → What it may know → Re-read what the app needs" };
    r;
  };
  /// Re-read the app's manifest and grant every lane it NEEDS that is missing (never removes one).
  /// Admins from the app panel; the kitchen after every update — so an app that gained a need on update gets it.
  public shared ({ caller }) func resyncLanes(cid : Nat) : async { ok : Bool; added : [Text]; detail : Text } {
    if (not (isAdminRole(caller) or isKitchen(caller))) return { ok = false; added = []; detail = "admins only" };
    await* resyncLanesInternal(cid, caller);
  };
  func resyncLanesInternal(cid : Nat, caller : Principal) : async* { ok : Bool; added : [Text]; detail : Text } {
    let c = switch (Map.get(connectors, Nat.compare, cid)) { case (?c) c; case null return { ok = false; added = []; detail = "no such app" } };
    if (isOidcConnector(cid)) return { ok = false; added = []; detail = "external software has no manifest" };
    let a : ManifestActor = actor (Principal.toText(c.canisterId));
    let m = switch (try { ?(await (with timeout = 10) a.hub_manifest()) } catch (_) { null }) { case (?m) m; case null return { ok = false; added = []; detail = "the app did not answer hub_manifest" } };
    if (not (isAdminRole(caller) or isKitchen(caller)) or connectors.get(cid) != ?c) return { ok = false; added = []; detail = "authorization or app configuration changed" };
    let have = lanesOf(cid);
    let missing = Array.filter<Text>(cleanLanes(m.needs), func(l) = l != "ai" and not has(have, l));
    if (missing.size() == 0) return { ok = true; added = []; detail = (if (has(cleanLanes(m.needs), "ai") and not has(have, "ai")) "AI access requires an explicit owner grant in the Lanes editor" else "the app has every lane it needs") };
    let ls = Array.concat(have, missing);
    Map.add(connectorLanes, Nat.compare, cid, ls);
    journal("connector", "lanes of app #" # Nat.toText(cid) # " re-read from its manifest: added [" # Text.join(missing.vals(), ", ") # "]", caller);
    if (has(missing, "push")) ignore Timer.setTimer<system>(#seconds 0, func() : async () { await pushDirectoryTo(cid) });
    { ok = true; added = missing; detail = "" };
  };
  /// The kitchen's variant, by canister id (it does not know connector numbers).
  /// (0.16.1: shares the worker instead of a shared self-call, which made the hub its own caller and refused itself.)
  public shared ({ caller }) func kitchenResyncLanes(canisterId : Text) : async { ok : Bool; added : [Text]; detail : Text } {
    if (not isKitchen(caller)) return { ok = false; added = []; detail = "kitchen only" };
    let pr = switch (principalSafe(norm(canisterId))) { case (?p) p; case null return { ok = false; added = []; detail = "that is not a canister id" } };
    switch (connectorByPrincipal(pr)) { case (?c) await* resyncLanesInternal(c.id, caller); case null ({ ok = false; added = []; detail = "not a registered app" }) };
  };

  /// What an app says about itself (optional contract method hub_manifest).
  public type Manifest = { name : Text; version : Text; description : Text; needs : [Text]; wants : [Text] };
  type ManifestActor = actor { hub_ping : shared query () -> async Text; hub_manifest : shared query () -> async Manifest };
  /// Wizard step 1: is this a hub-ready app, and what does it ask for?
  public shared ({ caller }) func probeApp(canisterId : Text) : async { ok : Bool; ping : Text; manifest : ?Manifest; already : ?Nat; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; ping = ""; manifest = null; already = null; detail = "admins only" };
    let cid = norm(canisterId);
    let pr = switch (principalSafe(cid)) { case (?p) p; case null return { ok = false; ping = ""; manifest = null; already = null; detail = "that is not a canister id" } };
    let already : ?Nat = switch (connectorByPrincipal(pr)) { case (?c) ?c.id; case null null };
    let a : ManifestActor = actor (cid);
    let ping = try { await (with timeout = 10) a.hub_ping() } catch (_) { return { ok = false; ping = ""; manifest = null; already; detail = "no hub_ping there — is this the app's BACKEND canister, built with the kebab-hub SDK?" } };
    let manifest : ?Manifest = try { ?(await (with timeout = 10) a.hub_manifest()) } catch (_) { null };
    { ok = true; ping; manifest; already; detail = "" };
  };

  /// Wizard finale — one call: connector + lanes + access + tile (bound).
  public shared ({ caller }) func connectApp(args : { name : Text; canisterId : Text; note : Text; lanes : [Text]; access : AccessPolicy; tile : ?{ name : Text; url : Text; kind : Text } }) : async { ok : Bool; id : Nat; tileId : Nat; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; id = 0; tileId = 0; detail = "admins only" };
    connectInternal<system>(args, caller);
  };
  func connectInternal<system>(args : { name : Text; canisterId : Text; note : Text; lanes : [Text]; access : AccessPolicy; tile : ?{ name : Text; url : Text; kind : Text } }, caller : Principal) : { ok : Bool; id : Nat; tileId : Nat; detail : Text } {
    let n = norm(args.name);
    if (n == "") return { ok = false; id = 0; tileId = 0; detail = "name is required" };
    if (has(cleanLanes(args.lanes), "ai") and not isOwnerRole(caller)) return { ok = false; id = 0; tileId = 0; detail = "only an owner may share the company AI credential with an app" };
    let pr = switch (principalSafe(norm(args.canisterId))) { case (?p) p; case null return { ok = false; id = 0; tileId = 0; detail = "that is not a canister id" } };
    if (pr.isAnonymous()) return { ok = false; id = 0; tileId = 0; detail = "anonymous callers cannot be registered as apps" };
    switch (connectorByPrincipal(pr)) { case (?c) return { ok = false; id = c.id; tileId = 0; detail = "this canister is already connected as " # c.name }; case null {} };
    if (args.access.mode != "everyone" and args.access.mode != "selected") return { ok = false; id = 0; tileId = 0; detail = "access mode must be everyone or selected" };
    switch (args.tile) { case (?t) { if (not Text.startsWith(norm(t.url), #text "https://")) return { ok = false; id = 0; tileId = 0; detail = "tile URL must start with https://" }; if (t.kind != "app" and t.kind != "link") return { ok = false; id = 0; tileId = 0; detail = "tile kind must be app or link" } }; case null {} };
    let id = nextConnectorId;
    nextConnectorId += 1;
    Map.add(connectors, Nat.compare, id, { id; name = n; canisterId = pr; note = norm(args.note); addedAt = Time.now() });
    let ls = cleanLanes(args.lanes);
    Map.add(connectorLanes, Nat.compare, id, ls);
    Map.add(connectorAccess, Nat.compare, id, { mode = args.access.mode; groups = Array.map<Text, Text>(args.access.groups, norm); roles = args.access.roles; people = Array.map<Text, Text>(args.access.people, func(x) = lower(norm(x))) });
    var tileId = 0;
    switch (args.tile) {
      case (?t) {
        tileId := nextAppLinkId;
        nextAppLinkId += 1;
        Map.add(appLinks, Nat.compare, tileId, { id = tileId; name = (if (norm(t.name) == "") n else norm(t.name)); url = norm(t.url); note = norm(args.note) });
        Map.add(appLinkKinds, Nat.compare, tileId, t.kind);
        Map.add(appLinkConnectors, Nat.compare, tileId, id);
      };
      case null {};
    };
    journal("connector", "connected app " # n # " (" # norm(args.canisterId) # ") lanes [" # Text.join(ls.vals(), ", ") # "], access " # args.access.mode # (if (tileId > 0) ", tile #" # Nat.toText(tileId) else ""), caller);
    if (has(ls, "push")) ignore Timer.setTimer<system>(#seconds 0, func() : async () { await pushDirectoryTo(id) });
    { ok = true; id; tileId; detail = "" };
  };

  // push lane: the scoped, lane-filtered directory into the app's hub_upsert
  type UpsertActor = actor { hub_upsert : ([ConnectorUser]) -> async Nat };
  func directoryFor(cid : Nat) : [ConnectorUser] {
    let stamp = permissionStamp(cid);
    let seen = Map.empty<Text, Bool>();
    let out = List.empty<ConnectorUser>();
    for ((_, u) in Map.entries(users)) {
      if (eligibleFor(cid, u, policyOf(cid)) and not Map.containsKey(seen, Text.compare, u.email)) {
        Map.add(seen, Text.compare, u.email, true);
        let cname = switch (connOf(u.connId)) { case (?c) c.name; case null "" };
        List.add(out, { email = u.email; displayName = u.displayName; firstName = u.firstName; lastName = u.lastName; active = accessForConn(u.email, cid) == #active; source = cname; externalId = u.externalId; attributes = attrsForConn(cid, u.email, u.attributes, stamp); id = ?pidForEmail(u.email) });
      };
    };
    List.toArray(out);
  };
  func pushDirectoryTo(cid : Nat) : async () {
    if (isOidcConnector(cid)) return; // nothing to push to
    let c = switch (Map.get(connectors, Nat.compare, cid)) { case (?c) c; case null return };
    if (not hasLane(cid, "push")) return;
    let rows = directoryFor(cid);
    if (rows.size() > 5000) return; // push lane is for normal org sizes; large orgs pull
    let a : UpsertActor = actor (Principal.toText(c.canisterId));
    try { ignore await (with timeout = 60) a.hub_upsert(rows); Map.add(connectorPushedAt, Nat.compare, cid, Time.now()) } catch (_) {};
  };
  let connectorPushedAt : Map.Map<Nat, Int> = Map.empty<Nat, Int>();

  /// Full population rule for one app: person-kind, source scope, exclude filters, access policy.
  func eligibleFor(cid : Nat, u : UserRec, p : AccessPolicy) : Bool =
    u.email != "" and directoryEligible(u) and (switch (centrallyAllowed(cid, u.email)) { case (?allowed) allowed; case null inScope(scopeOf(cid), u.connId) and not excludedBy(u, filtersOf(cid)) and policyAllowsP(p, u.email) });
  /// Access of a person as ONE app sees it (scope + policy); #unknown = not visible to that app.
  func accessForConn(email : Text, cid : Nat) : { #active; #inactive; #unknown } {
    let e = lower(norm(email));
    let policy = policyOf(cid);
    var found = false;
    for ((_, u) in users.entries()) {
      if (u.email == e and eligibleFor(cid, u, policy)) {
        found := true;
        if (effActive(u)) return #active;
      };
    };
    if (found) #inactive else #unknown;
  };
  func callerCid(caller : Principal) : Nat = switch (connectorByPrincipal(caller)) { case (?c) c.id; case null 0 };

  public shared ({ caller }) func setConnectorAccess(id : Nat, p : AccessPolicy) : async { ok : Bool; detail : Text } {
    if (appPermissionPolicies.containsKey(id)) return { ok = false; detail = "Manage this app under Hub Permissions" };
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (not Map.containsKey(connectors, Nat.compare, id)) return { ok = false; detail = "no such app" };
    if (p.mode != "everyone" and p.mode != "selected") return { ok = false; detail = "mode must be everyone or selected" };
    if (p.groups.size() > 100 or p.people.size() > 500 or p.roles.size() > 3) return { ok = false; detail = "too many entries" };
    for (r in p.roles.vals()) if (r != "owner" and r != "admin" and r != "helpdesk") return { ok = false; detail = "roles: owner, admin, helpdesk" };
    let clean : AccessPolicy = { mode = p.mode; groups = Array.map<Text, Text>(p.groups, norm); roles = p.roles; people = Array.map<Text, Text>(p.people, func(x) = lower(norm(x))) };
    Map.add(connectorAccess, Nat.compare, id, clean);
    journal("connector", "access of app #" # Nat.toText(id) # " set to " # clean.mode # (if (clean.mode == "selected") " (" # Nat.toText(clean.groups.size()) # " groups, " # Nat.toText(clean.roles.size()) # " roles, " # Nat.toText(clean.people.size()) # " people)" else ""), caller);
    { ok = true; detail = "" };
  };

  /// Who would get in under the current rules — for the admin's live preview.
  public shared query ({ caller }) func accessPreview(id : Nat) : async { count : Nat; sample : [Text] } {
    assert isAdmin(caller);
    previewWith(id, policyOf(id));
  };
  /// Same, for an unsaved draft policy (the builder shows the effect before saving).
  public shared query ({ caller }) func accessPreviewFor(id : Nat, p : AccessPolicy) : async { count : Nat; sample : [Text] } {
    assert isAdmin(caller);
    previewWith(id, p);
  };
  func previewWith(id : Nat, p : AccessPolicy) : { count : Nat; sample : [Text] } {
    let seen = Map.empty<Text, Bool>();
    let sample = List.empty<Text>();
    var n = 0;
    for ((_, u) in Map.entries(users)) {
      if (eligibleFor(id, u, p) and effActive(u) and not Map.containsKey(seen, Text.compare, u.email)) {
        Map.add(seen, Text.compare, u.email, true);
        n += 1;
        if (List.size(sample) < 8) List.add(sample, if (u.displayName != "") u.displayName else u.email);
      };
    };
    { count = n; sample = List.toArray(sample) };
  };

  func attrOf(u : UserRec, field : Text) : Text {
    let f = lower(field);
    for ((k, v) in u.attributes.vals()) { if (lower(k) == f) return v };
    "";
  };
  func excludedBy(u : UserRec, rules : [Text]) : Bool {
    for (r in rules.vals()) {
      // prefix rule first: "field^=prefix"
      let parts = Iter.toArray(Text.split(r, #text "^="));
      if (parts.size() == 2) {
        if (Text.startsWith(lower(attrOf(u, parts[0])), #text (lower(norm(parts[1]))))) return true;
      } else {
        let eq = Iter.toArray(Text.split(r, #char '='));
        if (eq.size() == 2 and lower(attrOf(u, eq[0])) == lower(norm(eq[1]))) return true;
      };
    };
    false;
  };

  public shared ({ caller }) func setConnectorFilters(id : Nat, rules : [Text]) : async Bool {
    assert isAdminRole(caller);
    if (appPermissionPolicies.containsKey(id)) return false;
    if (not Map.containsKey(connectors, Nat.compare, id)) return false;
    if (rules.size() > 20) return false;
    for (r in rules.vals()) { if (r.size() > 120 or (not Text.contains(r, #char '='))) return false };
    Map.add(connectorFilters, Nat.compare, id, rules);
    var lbl = "";
    for (r in rules.vals()) { if (lbl != "") lbl #= " · "; lbl #= r };
    journal("connector", "exclude filters of connector #" # Nat.toText(id) # " set to [" # lbl # "]", caller);
    true;
  };

  public shared ({ caller }) func setConnectorScope(id : Nat, connIds : [Nat]) : async Bool {
    assert isAdminRole(caller);
    if (appPermissionPolicies.containsKey(id)) return false;
    if (not Map.containsKey(connectors, Nat.compare, id)) return false;
    if (connIds.size() > 50) return false;
    Map.add(connectorScopes, Nat.compare, id, connIds);
    var lbl = "";
    for (c in connIds.vals()) { if (lbl != "") lbl #= ","; lbl #= Nat.toText(c) };
    journal("connector", "scope of connector #" # Nat.toText(id) # " set to [" # (if (lbl == "") "all" else lbl) # "]", caller);
    true;
  };

  public shared ({ caller }) func registerConnector(args : { name : Text; canisterId : Text; note : Text }) : async { ok : Bool; id : Nat; detail : Text } {
    assert isAdminRole(caller);
    let p = Principal.fromText(norm(args.canisterId));
    if (p.isAnonymous()) return { ok = false; id = 0; detail = "anonymous callers cannot be registered as connectors" };
    switch (connectorByPrincipal(p)) { case (?c) return { ok = false; id = c.id; detail = "this canister is already registered as connector #" # Nat.toText(c.id) }; case null {} };
    let id = nextConnectorId;
    nextConnectorId += 1;
    Map.add(connectors, Nat.compare, id, { id; name = norm(args.name); canisterId = p; note = norm(args.note); addedAt = Time.now() });
    journal("connector", "registered connector #" # Nat.toText(id) # " " # norm(args.name) # " (" # norm(args.canisterId) # ")", caller);
    { ok = true; id; detail = "" };
  };

  /// Edit name/note in place. The canister id is the connector's IDENTITY
  /// (every gate hangs on it) — changing it = remove + register, deliberately.
  public shared ({ caller }) func updateConnector(id : Nat, args : { name : Text; note : Text }) : async Bool {
    assert isAdminRole(caller);
    switch (Map.get(connectors, Nat.compare, id)) {
      case null false;
      case (?c) {
        Map.add(connectors, Nat.compare, id, { c with name = norm(args.name); note = norm(args.note) });
        journal("connector", "updated connector #" # Nat.toText(id) # " " # norm(args.name), caller);
        true;
      };
    };
  };

  public shared ({ caller }) func removeConnector(id : Nat) : async Bool {
    assert isAdminRole(caller);
    if (isOidcConnector(id)) return false; // external (OIDC) apps are removed under Sign-in for other apps — owners only, with their codes and tokens
    ignore Map.delete(connectors, Nat.compare, id);
    ignore Map.delete(connectorLanes, Nat.compare, id);
    ignore Map.delete(connectorAccess, Nat.compare, id);
    ignore appPermissionPolicies.remove(id);
    ignore appPermissionChecks.remove(id);
    ignore Map.delete(connectorPushedAt, Nat.compare, id);
    let orphaned = List.empty<Nat>();
    for ((tile, cid) in Map.entries(appLinkConnectors)) if (cid == id) List.add(orphaned, tile);
    for (tile in List.toArray(orphaned).vals()) ignore Map.delete(appLinkConnectors, Nat.compare, tile);
    governanceForget<system>("app:" # Nat.toText(id), id);
    journal("connector", "removed connector #" # Nat.toText(id), caller);
    true;
  };

  public shared query ({ caller }) func listConnectors() : async [{ id : Nat; name : Text; canisterId : Text; note : Text; addedAt : Int; scope : [Nat]; filters : [Text]; access : AccessPolicy; lanes : [Text]; pushedAt : Int; owners : [Text]; permissionsManaged : Bool; permissionApp : Text }] {
    assert isAdmin(caller);
    let out = List.empty<{ id : Nat; name : Text; canisterId : Text; note : Text; addedAt : Int; scope : [Nat]; filters : [Text]; access : AccessPolicy; lanes : [Text]; pushedAt : Int; owners : [Text]; permissionsManaged : Bool; permissionApp : Text }>();
    for ((_, c) in Map.entries(connectors)) List.add(out, { id = c.id; name = c.name; canisterId = Principal.toText(c.canisterId); note = c.note; addedAt = c.addedAt; scope = scopeOf(c.id); filters = filtersOf(c.id); access = policyOf(c.id); lanes = lanesOf(c.id); pushedAt = (switch (Map.get(connectorPushedAt, Nat.compare, c.id)) { case (?t) t; case null 0 }); owners = ownersOf(c.id); permissionsManaged = appPermissionPolicies.containsKey(c.id); permissionApp = switch (appPermissionPolicies.get(c.id)) { case (?v) v.policy.app; case null "" } });
    List.toArray(out);
  };


  // ---- ownership container (offboarding): list + reassign owned objects ----
  // Optional part of the connector contract. Tools with clearly owned,
  // work-in-progress objects (forms, docs, projects) implement:
  //   hub_ownedObjects : (text) -> (vec OwnedObject) query
  //   hub_reassign     : (vec text, text, text) -> (nat)
  // Tools without ownable objects (chat archives, check-in records) simply
  // don't — the probe reports them as unsupported.

  type OwnedObject = { id : Text; kind : Text; title : Text; meta : Text; updatedAt : Int };
  type OwnershipActor = actor {
    hub_ownedObjects : (Text) -> async [OwnedObject];
    hub_reassign : ([Text], Text, Text) -> async Nat;
  };

  /// Objects owned by `email` in one connected tool. supported=false when
  /// the connector doesn't implement the ownership contract (call fails).
  public shared ({ caller }) func ownedObjects(connectorId : Nat, email : Text) : async { ok : Bool; supported : Bool; objects : [OwnedObject]; detail : Text } {
    assert isAdminRole(caller);
    switch (Map.get(connectors, Nat.compare, connectorId)) {
      case null ({ ok = false; supported = false; objects = []; detail = "no such connector" });
      case (?c) {
        let a : OwnershipActor = actor (Principal.toText(c.canisterId));
        try {
          let objs = await (with timeout = 30) a.hub_ownedObjects(lower(norm(email)));
          { ok = true; supported = true; objects = objs; detail = "" };
        } catch (e) {
          { ok = false; supported = false; objects = []; detail = Error.message(e) };
        };
      };
    };
  };

  /// Reassign selected objects in one tool from one email to another.
  public shared ({ caller }) func reassignOwned(connectorId : Nat, ids : [Text], fromEmail : Text, toEmail : Text) : async { ok : Bool; moved : Nat; detail : Text } {
    assert isAdminRole(caller);
    if (hardwareSource(connectorId)) return { ok = false; moved = 0; detail = "Hardware needs a confirmed physical handover. Open the person’s Desk offboarding or the device in Assets." };
    if (ids.size() == 0 or ids.size() > 500) return { ok = false; moved = 0; detail = "select 1-500 objects" };
    switch (Map.get(connectors, Nat.compare, connectorId)) {
      case null ({ ok = false; moved = 0; detail = "no such connector" });
      case (?c) {
        let a : OwnershipActor = actor (Principal.toText(c.canisterId));
        try {
          let n = await (with timeout = 60) a.hub_reassign(ids, lower(norm(fromEmail)), lower(norm(toEmail)));
          journal("ownership", "reassigned " # Nat.toText(n) # "/" # Nat.toText(ids.size()) # " object(s) in " # c.name # ": " # lower(norm(fromEmail)) # " → " # lower(norm(toEmail)), caller);
          { ok = n > 0; moved = n; detail = if (n == 0) "the tool moved nothing — is the new owner active and the selection current?" else "" };
        } catch (e) {
          { ok = false; moved = 0; detail = Error.message(e) };
        };
      };
    };
  };

  /// THE access gate. Tools call this on login/session validation: the hub is
  /// the source of truth, so an Okta deactivation (event hook or manual kill
  /// switch) blocks access everywhere instantly — even though the user's
  /// Internet Identity continues to exist.
  /// active = the email is effectively active in AT LEAST ONE connected IdP.
  func accessOf(email : Text) : { #active; #inactive; #unknown } {
    let e = lower(norm(email));
    if (e == "") return #unknown;
    var found = false;
    for ((_, u) in Map.entries(users)) {
      if (u.email == e) {
        found := true;
        if (effActive(u)) return #active;
      };
    };
    if (found) #inactive else #unknown;
  };

  public shared query ({ caller }) func checkAccess(email : Text) : async { #active; #inactive; #unknown } {
    // connector callers see access RELATIVE TO THEIR SCOPE; admins see global
    switch (connectorByPrincipal(caller)) {
      case (?c) accessForConn(email, c.id);
      case null { assert isAdmin(caller); accessOf(email) };
    };
  };

  // ---------- person <-> principal links (passkey sign-in for people) ----------
  // A person (canonical key: email) can have n login principals. Admins mint
  // an invite code for an email; the person signs in with their passkey and
  // claims it once — from then on tools can resolve caller -> person. This is
  // what keeps "who you are" (directory, possibly externally mastered) apart
  // from "how you sign in" (principals), so OIDC login can be added later
  // without any migration.

  let principalLinks : Map.Map<Principal, Text> = Map.empty<Principal, Text>(); // principal -> email
  type Invite = { email : Text; expiresAt : Int };
  let inviteCodes : Map.Map<Text, Invite> = Map.empty<Text, Invite>(); // code -> invite

  public shared ({ caller }) func createInvite(email : Text) : async ?Text {
    assert isAdmin(caller);
    let e = lower(norm(email));
    // An invitation grants the person's identity, including their role.
    // Helpdesk may recover members; admins may recover lower roles; owners may recover anyone.
    if (not canManagePerson(caller, e)) return null;
    if (accessOf(e) == #unknown) return null; // person must exist in the directory
    if (Map.containsKey(sampleEmails, Text.compare, e)) return null; // sample people are props — they never sign in
    let code = hex(await ic00.raw_rand());
    if (not isAdmin(caller) or not canManagePerson(caller, e)) return null;
    if (accessOf(e) == #unknown or sampleEmails.containsKey(e)) return null;
    // single active invite per person: re-minting replaces any older code
    let stale = List.empty<Text>();
    for ((c, inv) in Map.entries(inviteCodes)) if (inv.email == e) List.add(stale, c);
    for (c in List.toArray(stale).vals()) ignore Map.delete(inviteCodes, Text.compare, c);
    Map.add(inviteCodes, Text.compare, code, { email = e; expiresAt = Time.now() + 7 * 24 * 3600 * 1_000_000_000 });
    journal("invite", "minted sign-in invite for " # e, caller);
    ?code;
  };

  public shared ({ caller }) func claimInvite(code : Text) : async Bool {
    if (Principal.isAnonymous(caller)) return false;
    switch (Map.get(inviteCodes, Text.compare, code)) {
      case (?inv) {
        if (accessOf(inv.email) != #active) return false;
        switch (principalLinks.get(caller)) {
          case (?linked) { if (linked != inv.email) return false };
          case null {};
        };
        ignore Map.delete(inviteCodes, Text.compare, code); // single use, valid or not
        if (Time.now() > inv.expiresAt) return false;
        Map.add(principalLinks, Principal.compare, caller, inv.email);
        journal("invite", "principal linked to " # inv.email, caller);
        true;
      };
      case null false;
    };
  };

  public shared query ({ caller }) func myAccess() : async { email : ?Text; access : { #active; #inactive; #unknown } } {
    switch (Map.get(principalLinks, Principal.compare, caller)) {
      case (?e) { { email = ?e; access = accessOf(e) } };
      case null { { email = null; access = #unknown } };
    };
  };

  /// Resolve a principal to a person, for connected tools (scope-relative,
  /// same rule as checkAccess) and admins (global).
  public shared query ({ caller }) func principalPerson(p : Text) : async ?{ email : Text; access : { #active; #inactive; #unknown } } {
    let pr = Principal.fromText(p);
    switch (Map.get(principalLinks, Principal.compare, pr)) {
      case null {
        switch (connectorByPrincipal(caller)) { case (?_) {}; case null assert isAdmin(caller) };
        null;
      };
      case (?e) {
        switch (connectorByPrincipal(caller)) {
          case (?c) ?{ email = e; access = accessForConn(e, c.id) };
          case null { assert isAdmin(caller); ?{ email = e; access = accessOf(e) } };
        };
      };
    };
  };

  /// Admin links their OWN passkey to a directory person — the console's
  /// "Portal" switch then shows the workspace and opens connected apps as
  /// that person (the way every end user does). Re-linking replaces.
  public shared ({ caller }) func linkMyPrincipal(email : Text) : async { ok : Bool; detail : Text } {
    if (not isAdmin(caller)) return { ok = false; detail = "admins only" };
    let e = lower(norm(email));
    var found = false;
    for ((_, u) in Map.entries(users)) if (u.email == e) found := true;
    if (not found) return { ok = false; detail = "no directory entry with that e-mail — add the person under People first" };
    // no privilege escalation through linking: the role travels with the person,
    // so a helpdesk passkey must not attach itself to the owner's entry
    if (principalLinks.get(caller) == ?e) return { ok = true; detail = "already linked" };
    if (not canManagePerson(caller, e)) return { ok = false; detail = "only an owner can link an equal or higher role" };
    Map.add(principalLinks, Principal.compare, caller, e);
    journal("invite", "admin linked own passkey to " # e, caller);
    { ok = true; detail = "" };
  };

  public shared ({ caller }) func unlinkPrincipal(p : Text) : async Bool {
    assert isAdminRole(caller);
    let pr = Principal.fromText(p);
    switch (principalLinks.get(pr)) { case (?e) { if (not canManagePerson(caller, e)) return false }; case null return false };
    ignore principalLinks.delete(pr);
    journal("invite", "unlinked principal " # p, caller);
    true;
  };

  public shared query ({ caller }) func listPrincipalLinks() : async [{ principal : Text; email : Text }] {
    assert isAdmin(caller);
    let out = List.empty<{ principal : Text; email : Text }>();
    for ((pr, e) in Map.entries(principalLinks)) List.add(out, { principal = Principal.toText(pr); email = e });
    List.toArray(out);
  };

  public shared query ({ caller }) func listInvites() : async [{ email : Text; expiresAt : Int }] {
    assert isAdmin(caller);
    let out = List.empty<{ email : Text; expiresAt : Int }>();
    for ((_, inv) in Map.entries(inviteCodes)) List.add(out, { email = inv.email; expiresAt = inv.expiresAt });
    List.toArray(out);
  };

  public shared ({ caller }) func revokeInvite(email : Text) : async Nat {
    assert isAdmin(caller);
    let e = lower(norm(email));
    if (not canManagePerson(caller, e)) return 0;
    let stale = List.empty<Text>();
    for ((c, inv) in Map.entries(inviteCodes)) if (inv.email == e) List.add(stale, c);
    for (c in List.toArray(stale).vals()) ignore Map.delete(inviteCodes, Text.compare, c);
    let n = List.toArray(stale).size();
    if (n > 0) journal("invite", "revoked open invite for " # e, caller);
    n;
  };

  /// Hard-delete a LOCAL person (conn 0). Mastered accounts are owned by
  /// their source and cannot be deleted here — they would reappear on the
  /// next sync/push. Deleting also unlinks their passkeys, revokes open
  /// invites, and pushes a deactivation to every connected tool unless
  /// another source still holds the e-mail active.
  /// Delete a person's hub-mastered records: Local always; SCIM-mastered ones
  /// only while SCIM is switched off (with a live token the IdP would just
  /// push them back — delete there). IdP-synced records are never deleted here.
  public shared ({ caller }) func removeLocalUser(email : Text) : async Bool {
    assert isAdminRole(caller);
    let e = lower(norm(email));
    if (not canManagePerson(caller, e)) return false;
    if (not purgeLocal(e, caller)) return false;
    if (accessOf(e) != #active) { await notifyDeactivated([e]) };
    true;
  };
  /// Hard-delete every hub-mastered record of an e-mail (Local always, SCIM only
  /// while SCIM is off) with its passkey links, role, invites and group seats.
  func purgeLocal(e : Text, caller : Principal) : Bool {
    if (not canManagePerson(caller, e)) return false;
    let keys = List.empty<Text>();
    for ((k, u) in Map.entries(users)) {
      if (u.email == e and (u.connId == LOCAL_CONN or (isScimConn(u.connId) and not scimConnLive(u.connId)))) List.add(keys, k);
    };
    switch (List.size(keys)) {
      case 0 false;
      case _ {
        for (key in List.toArray(keys).vals()) {
          ignore Map.delete(users, Text.compare, key);
          ignore Map.delete(userKinds, Text.compare, key);
          ignore Map.delete(forceActive, Text.compare, key);
        };
        // no account left for this e-mail → the OIDC subject dies with it (a re-issued address gets a new one)
        var left = false; for ((_, u) in Map.entries(users)) if (u.email == e) left := true;
        if (not left) { ignore Map.delete(oidcSubs, Text.compare, e); oidcDropWhere(true, true, func(_, em) = em == e); for ((_, m) in Map.entries(oidcConsents)) ignore Map.delete(m, Text.compare, e) };
        let ps = List.empty<Principal>();
        for ((pr, em) in Map.entries(principalLinks)) if (em == e) List.add(ps, pr);
        for (pr in List.toArray(ps).vals()) ignore Map.delete(principalLinks, Principal.compare, pr);
        ignore Map.delete(personRoles, Text.compare, e);
        let cs = List.empty<Text>();
        for ((c, inv) in Map.entries(inviteCodes)) if (inv.email == e) List.add(cs, c);
        for (c in List.toArray(cs).vals()) ignore Map.delete(inviteCodes, Text.compare, c);
        // …and out of every group
        let gids = List.empty<Nat>();
        for ((gid, g) in Map.entries(groups)) { for (m in g.members.vals()) if (m == e) List.add(gids, gid) };
        for (gid in List.toArray(gids).vals()) {
          switch (Map.get(groups, Nat.compare, gid)) {
            case (?g) {
              let keep = List.empty<Text>();
              for (m in g.members.vals()) if (m != e) List.add(keep, m);
              Map.add(groups, Nat.compare, gid, { g with members = List.toArray(keep) });
            };
            case null {};
          };
        };
        journal("local", "deleted " # Nat.toText(List.size(keys)) # " record(s) of " # e # " permanently (passkeys unlinked, invites revoked, groups purged)", caller);
        true;
      };
    };
  };

  // ---------- sample company (try it before you add real people) ----------
  // A fictional 24-person company with departments, managers, three groups and
  // two menu entries — so a fresh hub shows something alive. Everything is
  // tracked and removed in one call; sample people use the reserved
  // example.com domain and can never sign in.
  let sampleEmails : Map.Map<Text, Nat> = Map.empty<Text, Nat>();
  let sampleGroups : Map.Map<Nat, Nat> = Map.empty<Nat, Nat>();
  let sampleTiles : Map.Map<Nat, Nat> = Map.empty<Nat, Nat>();
  var sampleOn : Bool = false;
  func sampleActive() : Bool = sampleOn;

  public shared ({ caller }) func seedSample() : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (sampleOn) return { ok = false; detail = "the sample company is already here" };
    // (first, last, title, department, manager-first.last, location)
    let people : [(Text, Text, Text, Text, Text, Text)] = [
      ("Nora", "Kaya", "CEO", "Leadership", "", "Zurich"),
      ("Emre", "Aslan", "CTO", "Leadership", "nora.kaya", "Berlin"),
      ("Lea", "Brunner", "COO", "Leadership", "nora.kaya", "Zurich"),
      ("Samir", "Haddad", "Head of Sales", "Sales", "nora.kaya", "Dubai"),
      ("Mia", "Novak", "Head of People", "People", "lea.brunner", "Zurich"),
      ("Jonas", "Weber", "Engineering Lead", "Engineering", "emre.aslan", "Berlin"),
      ("Aylin", "Demir", "Senior Engineer", "Engineering", "jonas.weber", "Berlin"),
      ("Tom", "Fischer", "Senior Engineer", "Engineering", "jonas.weber", "Remote"),
      ("Priya", "Nair", "Engineer", "Engineering", "jonas.weber", "Bangalore"),
      ("Luca", "Moretti", "Engineer", "Engineering", "jonas.weber", "Milan"),
      ("Hana", "Sato", "Engineer", "Engineering", "jonas.weber", "Tokyo"),
      ("Felix", "Bauer", "Platform Engineer", "Engineering", "jonas.weber", "Berlin"),
      ("Sofia", "Rossi", "Product Designer", "Engineering", "emre.aslan", "Milan"),
      ("Omar", "Farouk", "Account Executive", "Sales", "samir.haddad", "Dubai"),
      ("Elena", "Petrova", "Account Executive", "Sales", "samir.haddad", "Zurich"),
      ("David", "Kim", "Sales Engineer", "Sales", "samir.haddad", "Remote"),
      ("Chloe", "Martin", "Marketing Lead", "Sales", "samir.haddad", "Paris"),
      ("Ben", "Schulz", "Finance Lead", "Operations", "lea.brunner", "Zurich"),
      ("Ines", "Lopez", "Office & Travel", "Operations", "lea.brunner", "Zurich"),
      ("Kofi", "Mensah", "IT Support", "Operations", "lea.brunner", "Remote"),
      ("Yara", "Said", "People Partner", "People", "mia.novak", "Dubai"),
      ("Noah", "Lindqvist", "Recruiter", "People", "mia.novak", "Stockholm"),
      ("Zoe", "Keller", "Legal Counsel", "Operations", "lea.brunner", "Zurich"),
      ("Arjun", "Mehta", "Data Analyst", "Engineering", "jonas.weber", "Bangalore"),
    ];
    let now = Time.now();
    var added = 0;
    for ((f, l, title, dept, mgr, loc) in people.vals()) {
      let e = lower(f # "." # l # "@example.com");
      let key = userKey(LOCAL_CONN, e);
      if (not Map.containsKey(users, Text.compare, key)) {
        let attrs = List.empty<(Text, Text)>();
        List.add(attrs, ("title", title)); List.add(attrs, ("department", dept)); List.add(attrs, ("location", loc)); List.add(attrs, ("organization", "Sample Company"));
        if (mgr != "") List.add(attrs, ("manager", mgr # "@example.com"));
        Map.add(users, Text.compare, key, { connId = LOCAL_CONN; externalId = e; email = e; displayName = f # " " # l; firstName = f; lastName = l; status = "ACTIVE"; activeIdp = true; override = null; attributes = List.toArray(attrs); createdAt = now; updatedAt = now });
        Map.add(sampleEmails, Text.compare, e, 0);
        added += 1;
      };
    };
    // one person already offboarded — so the "locked out" state is visible too
    switch (Map.get(users, Text.compare, userKey(LOCAL_CONN, "arjun.mehta@example.com"))) {
      case (?u) Map.add(users, Text.compare, userKey(LOCAL_CONN, u.email), { u with override = ?"sample: left the company" });
      case null {};
    };
    func grp(name : Text, note : Text, dept : Text) {
      if (groupByName(name) != null) return;
      let gid = createGroup(name, note);
      let ms = List.empty<Text>();
      for ((f, l, _, d, _, _) in people.vals()) if (d == dept or dept == "*") List.add(ms, lower(f # "." # l # "@example.com"));
      switch (Map.get(groups, Nat.compare, gid)) { case (?g) Map.add(groups, Nat.compare, gid, { g with members = List.toArray(ms) }); case null {} };
      Map.add(sampleGroups, Nat.compare, gid, 0);
    };
    grp("Engineering", "sample · everyone who ships", "Engineering");
    grp("Sales", "sample · quota carriers and marketing", "Sales");
    grp("Leadership", "sample · approves the big things", "Leadership");
    func tile(name : Text, url : Text, note : Text) {
      let id = nextAppLinkId; nextAppLinkId += 1;
      Map.add(appLinks, Nat.compare, id, { id; name; url; note });
      Map.add(appLinkKinds, Nat.compare, id, "link");
      Map.add(sampleTiles, Nat.compare, id, 0);
    };
    tile("Handbook", "https://example.com/handbook", "sample · how we work");
    tile("Expenses", "https://example.com/expenses", "sample · receipts in, money out");
    sampleOn := true;
    journal("sample", "sample company added: " # Nat.toText(added) # " people, 3 groups, 2 menu entries", caller);
    { ok = true; detail = Nat.toText(added) # " people, 3 groups, 2 menu entries" };
  };

  public shared ({ caller }) func removeSample() : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (not sampleOn) return { ok = false; detail = "no sample company here" };
    var n = 0;
    for ((e, _) in Map.entries(sampleEmails)) { if (purgeLocal(e, caller)) n += 1 };
    Map.clear(sampleEmails);
    for ((gid, _) in Map.entries(sampleGroups)) ignore Map.delete(groups, Nat.compare, gid); // sample groups are manual — no SCIM ids to clean
    Map.clear(sampleGroups);
    for ((tid, _) in Map.entries(sampleTiles)) { dropTileIcon(tid); ignore Map.delete(appLinks, Nat.compare, tid); ignore Map.delete(appLinkKinds, Nat.compare, tid); ignore Map.delete(appLinkConnectors, Nat.compare, tid) };
    Map.clear(sampleTiles);
    sampleOn := false;
    journal("sample", "sample company removed (" # Nat.toText(n) # " people)", caller);
    { ok = true; detail = Nat.toText(n) # " people, their groups and menu entries removed" };
  };

  // ---------- home: the pulse, in one query ----------
  public shared query ({ caller }) func home() : async {
    orgName : Text; setupDone : Bool;
    people : Nat; active : Nat; inactive : Nat; withKey : Nat; openInvites : Nat;
    groups : Nat; apps : Nat; tiles : Nat; pendingRequests : Nat; accessRequests : Nat; reviewsOpen : Nat; reviewsOverdue : Nat;
    sources : Nat; scimOn : Bool; vaultId : Text; sample : Bool; role : Text;
    recent : [JournalEntry];
  } {
    assert isAdmin(caller);
    var total = 0; var act = 0;
    let seen = Map.empty<Text, Bool>();
    for ((_, u) in Map.entries(users)) {
      if (not Map.containsKey(seen, Text.compare, u.email)) { Map.add(seen, Text.compare, u.email, true); total += 1; if (accessOf(u.email) == #active) act += 1 };
    };
    let keyed = Map.empty<Text, Bool>();
    for ((_, e) in Map.entries(principalLinks)) Map.add(keyed, Text.compare, e, true);
    let pending = 0; // connector requests from the menu were removed in 0.19; the field stays for compatibility
    var invites = 0;
    for ((_, inv) in Map.entries(inviteCodes)) if (inv.expiresAt > Time.now()) invites += 1;
    var openReq = 0;
    for ((_, r) in Map.entries(accessRequests)) if (r.state == "open") openReq += 1;
    var revOpen = 0; var revLate = 0;
    for ((_, r) in Map.entries(reviews)) if (r.state == "open") { revOpen += 1; if (Time.now() > r.dueAt) revLate += 1 };
    let arr = List.toArray(runs); let n = arr.size();
    {
      orgName; setupDone;
      people = total; active = act; inactive = total - act; withKey = Map.size(keyed); openInvites = invites;
      groups = Map.size(groups); apps = Map.size(connectors); tiles = Map.size(appLinks); pendingRequests = pending; accessRequests = openReq; reviewsOpen = revOpen; reviewsOverdue = revLate;
      sources = Map.size(conns); scimOn = scimAnyEnabled() or (Map.size(scimSources) == 0 and scimToken != ""); vaultId; sample = sampleActive(); role = roleOf(caller);
      recent = Array.tabulate<JournalEntry>(Nat.min(n, 6), func i = arr[n - 1 - i]);
    };
  };

  // ---------- groups (org structure) ----------
  // Flat groups with multi-membership — the authorization primitive for app
  // scoping and desk routing. Manual for now; SCIM group push comes later.
  type Group = { id : Nat; name : Text; note : Text; members : [Text] };
  let groups : Map.Map<Nat, Group> = Map.empty<Nat, Group>();
  var nextGroupId : Nat = 1;
  // parallel maps (stable records are append-only): where a group is mastered
  let groupScimIds : Map.Map<Text, Nat> = Map.empty<Text, Nat>(); // SCIM group id -> group id
  func groupSource(gid : Nat) : Text { for ((_, g) in Map.entries(groupScimIds)) if (g == gid) return "scim"; "manual" };
  func scimIdOfGroup(gid : Nat) : Text { for ((sid, g) in Map.entries(groupScimIds)) if (g == gid) return sid; "" };
  /// SCIM-mastered groups are edited in the IdP while SCIM is on; once SCIM is
  /// switched off they become ordinary groups you may edit or delete here.
  func groupEditable(gid : Nat) : Bool { if (groupSource(gid) == "manual") return true; let sid = scimIdOfGroup(gid); let owner = switch (Map.get(groupScimSource, Text.compare, sid)) { case (?s) s; case null 1 }; switch (Map.get(scimSources, Nat.compare, owner)) { case (?src) not src.enabled; case null (Map.size(scimSources) > 0 or scimToken == "") } };
  func groupByName(n : Text) : ?Group { for ((_, g) in Map.entries(groups)) if (lower(g.name) == lower(n)) return ?g; null };

  public type GroupView = { id : Nat; name : Text; note : Text; members : [Text]; source : Text; editable : Bool };
  func groupView(g : Group, caller : Principal) : GroupView = { id = g.id; name = g.name; note = g.note; members = g.members; source = groupSource(g.id); editable = groupEditable(g.id) and (not permissionBearingGroup(g.id) or isOwnerRole(caller)) };

  func createGroup(name : Text, note : Text) : Nat {
    let id = nextGroupId;
    nextGroupId += 1;
    Map.add(groups, Nat.compare, id, { id; name = norm(name); note = norm(note); members = [] });
    id;
  };
  /// members: known directory e-mails only, de-duplicated
  func normMembers(emails : [Text]) : [Text] {
    let cur = List.empty<Text>();
    for (a in emails.vals()) {
      let e = lower(norm(a));
      if (e != "" and accessOf(e) != #unknown) {
        var dup = false;
        for (m in List.toArray(cur).vals()) if (m == e) dup := true;
        if (not dup) List.add(cur, e);
      };
    };
    List.toArray(cur);
  };

  public shared ({ caller }) func addGroup(name : Text, note : Text) : async { ok : Bool; id : Nat; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; id = 0; detail = "admins only" };
    let n = norm(name);
    if (n == "") return { ok = false; id = 0; detail = "group name is required" };
    if (n.size() > 60) return { ok = false; id = 0; detail = "group name: max 60 characters" };
    switch (groupByName(n)) { case (?g) return { ok = false; id = g.id; detail = "a group named \"" # g.name # "\" already exists" }; case null {} };
    let id = createGroup(n, note);
    journal("group", "created group " # n, caller);
    { ok = true; id; detail = "" };
  };

  public shared ({ caller }) func updateGroup(id : Nat, name : Text, note : Text) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (permissionBearingGroup(id) and not isOwnerRole(caller)) return { ok = false; detail = "This group grants app roles; only Hub owners may change it" };
    let g = switch (Map.get(groups, Nat.compare, id)) { case (?g) g; case null return { ok = false; detail = "no such group" } };
    if (not groupEditable(id)) return { ok = false; detail = "this group is pushed by your IdP via SCIM — rename it there" };
    let n = norm(name);
    if (n == "") return { ok = false; detail = "group name is required" };
    switch (groupByName(n)) { case (?o) { if (o.id != id) return { ok = false; detail = "a group named \"" # o.name # "\" already exists" } }; case null {} };
    Map.add(groups, Nat.compare, id, { g with name = n; note = norm(note) });
    journal("group", "renamed group #" # Nat.toText(id) # " to " # n, caller);
    { ok = true; detail = "" };
  };

  public shared ({ caller }) func removeGroup(id : Nat) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (permissionBearingGroup(id) and not isOwnerRole(caller)) return { ok = false; detail = "This group grants app roles; only Hub owners may change it" };
    let g = switch (Map.get(groups, Nat.compare, id)) { case (?g) g; case null return { ok = false; detail = "no such group" } };
    if (not groupEditable(id)) return { ok = false; detail = "this group is pushed by your IdP via SCIM — unassign the app or delete it there" };
    ignore Map.delete(groups, Nat.compare, id);
    let sid = scimIdOfGroup(id);
    governanceForget<system>("group:" # Nat.toText(id), 0);
    if (sid != "") { ignore Map.delete(groupScimIds, Text.compare, sid); ignore Map.delete(groupScimSource, Text.compare, sid) };
    journal("group", "deleted group " # g.name, caller);
    { ok = true; detail = "" };
  };

  public shared ({ caller }) func setGroupMembers(id : Nat, add : [Text], remove : [Text]) : async { ok : Bool; detail : Text; members : Nat } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only"; members = 0 };
    if (add.size() > 500 or remove.size() > 500) return { ok = false; detail = "max 500 changes per call"; members = 0 };
    if (permissionBearingGroup(id) and not isOwnerRole(caller)) return { ok = false; detail = "This group grants app roles; only Hub owners may change it"; members = 0 };
    let g = switch (Map.get(groups, Nat.compare, id)) { case (?g) g; case null return { ok = false; detail = "no such group"; members = 0 } };
    if (not groupEditable(id)) return { ok = false; detail = "membership of this group is managed by your IdP via SCIM"; members = g.members.size() };
    let kept = Array.filter<Text>(g.members, func(m) { for (r in remove.vals()) if (lower(norm(r)) == m) return false; true });
    let merged = normMembers(Array.concat(kept, add));
    var unknown = 0;
    for (a in add.vals()) if (accessOf(lower(norm(a))) == #unknown) unknown += 1;
    Map.add(groups, Nat.compare, id, { g with members = merged });
    journal("group", "membership updated for " # g.name # " (" # Nat.toText(merged.size()) # " members)", caller);
    { ok = true; detail = (if (unknown > 0) Nat.toText(unknown) # " not in the directory — skipped" else ""); members = merged.size() };
  };

  /// Where a group has an effect: app access policies here, and whatever each
  /// connected app reports via the OPTIONAL contract method
  /// `hub_usesGroup(name) : async [Text]` (queues, approvals, roles …).
  /// Apps without the method are simply skipped.
  type GroupUsesActor = actor { hub_usesGroup : (Text) -> async [Text] };
  public shared ({ caller }) func groupUsage(id : Nat) : async [{ app : Text; uses : [Text] }] {
    assert isAdmin(caller);
    let g = switch (Map.get(groups, Nat.compare, id)) { case (?g) g; case null return [] };
    let out = List.empty<{ app : Text; uses : [Text] }>();
    // hub-side: access policies
    let hubUses = List.empty<Text>();
    for ((cid, p) in Map.entries(connectorAccess)) {
      var hit = false;
      for (pg in p.groups.vals()) if (lower(pg) == lower(g.name)) hit := true;
      if (hit and p.mode == "selected" and not appPermissionPolicies.containsKey(cid)) {
        switch (Map.get(connectors, Nat.compare, cid)) { case (?c) List.add(hubUses, "grants access to " # c.name); case null {} };
      };
    };
    for ((cid, cfg) in appPermissionPolicies.entries()) {
      for (grant in cfg.policy.groups.vals()) if (grant.id == id) {
        switch (connectors.get(cid)) { case (?c) hubUses.add("grants " # grant.role # " in " # c.name # " (central permissions)"); case null {} };
      };
    };
    if (List.size(hubUses) > 0) List.add(out, { app = "hub"; uses = List.toArray(hubUses) });
    // apps: ask each connector (snapshot first — never iterate a map across awaits)
    let conns = Iter.toArray(Map.values(connectors));
    for (c in conns.vals()) {
      if (isOidcConnector(c.id)) continue; // external apps cannot be asked
      let a : GroupUsesActor = actor (Principal.toText(c.canisterId));
      try {
        let uses = await (with timeout = 10) a.hub_usesGroup(g.name);
        if (uses.size() > 0) List.add(out, { app = c.name; uses });
      } catch (_) {};
    };
    List.toArray(out);
  };

  public shared query ({ caller }) func listGroups() : async [GroupView] {
    assert isAdmin(caller);
    let out = List.empty<GroupView>();
    for ((_, g) in Map.entries(groups)) List.add(out, groupView(g, caller));
    List.toArray(out);
  };

  /// Groups of one person — for connected tools (routing, scoping) and admins.
  public shared query ({ caller }) func groupsOf(email : Text) : async [Text] {
    let e = lower(norm(email));
    let allowed = switch (connectorByPrincipal(caller)) {
      case (?c) hasLane(c.id, "groups") and accessForConn(e, c.id) != #unknown; // outside the app's population = unknown person
      case null isAdmin(caller);
    };
    assert allowed;
    let out = List.empty<Text>();
    for ((_, g) in Map.entries(groups)) {
      if (groupMember(g, e)) List.add(out, g.name);
    };
    List.toArray(out);
  };

  /// What a Phase-2 push would send to a connector (dedup by email, active
  /// only) — lets us verify the contract against the first connected apps
  /// before any tool-side code exists.
  type ConnectorUser = {
    email : Text;
    displayName : Text;
    firstName : Text;
    lastName : Text;
    active : Bool;
    source : Text; // connection name
    externalId : Text;
    attributes : [(Text, Text)];
    id : ?Text; // the person's stable id (0.17) — wire-optional so an SDK expecting `?Text` decodes it exactly; ?"" only in the seconds before the seed is minted
  };

  public shared query ({ caller }) func previewPush() : async [ConnectorUser] {
    assert isAdminRole(caller);
    let seen = Map.empty<Text, Bool>();
    let out = List.empty<ConnectorUser>();
    for ((_, u) in Map.entries(users)) {
      if (effActive(u) and u.email != "" and directoryEligible(u) and not Map.containsKey(seen, Text.compare, u.email)) {
        Map.add(seen, Text.compare, u.email, true);
        let cname = switch (connOf(u.connId)) { case (?c) c.name; case null "" };
        List.add(out, {
          email = u.email;
          displayName = u.displayName;
          firstName = u.firstName;
          lastName = u.lastName;
          active = true;
          source = cname;
          externalId = u.externalId;
          attributes = forwardedAttrs(u.attributes); // exactly what a connector receives (F17)
          id = ?pidForEmail(u.email);
        });
      };
    };
    List.toArray(out);
  };

  // ---------- SSO login for synced users (OIDC, no Internet Identity) ----------
  //
  // Users sign in with Okta SSO or Google (OIDC Authorization Code + PKCE).
  // The BACKEND exchanges the code at the provider's token endpoint via a
  // direct TLS outcall — the id_token therefore comes straight from the
  // provider, so claim checks (iss/aud/exp) suffice without local JWKS
  // signature verification. The email claim is matched against the synced
  // user store: only effectively ACTIVE users get a session, and every
  // session check re-validates the live status (instant deprovisioning).

  type SsoProvider = {
    id : Nat;
    name : Text; // button label, e.g. "Acme Okta"
    kind : Text; // "okta" | "google"
    issuer : Text; // okta: https://<org>.okta.com · google: https://accounts.google.com
    clientId : Text;
    clientSecret : Text; // google web clients require it; okta SPA (PKCE) leaves it empty
    enabled : Bool;
  };
  let ssoProviders : Map.Map<Nat, SsoProvider> = Map.empty<Nat, SsoProvider>();
  var nextSsoId : Nat = 1;

  type Session = { email : Text; displayName : Text; provider : Text; createdAt : Int; expiresAt : Int };
  let sessions : Map.Map<Text, Session> = Map.empty<Text, Session>(); // token -> session

  // ---- suite tokens (0.14.0): the person's topbar inside an app ----
  // Minted at redeemTicket and handed to the app, which passes it to its
  // frontend. Scope is READ-ONLY and narrow — exactly the five calls the
  // shared topbar needs (suiteState, myNotifications, markNotificationsRead,
  // portalApps, portalWhoami, myAvatarPortal). Never a portal session: no tickets, no
  // requests, no reviews, no preferences.
  type SuiteToken = { email : Text; displayName : Text; connId : Nat; createdAt : Int; expiresAt : Int };
  let suiteTokens : Map.Map<Text, SuiteToken> = Map.empty<Text, SuiteToken>();
  transient let SUITE_TTL_NS : Int = 12 * 3_600_000_000_000;
  func suiteSession(tok : Text) : ?Session {
    switch (Map.get(suiteTokens, Text.compare, tok)) {
      case null null;
      case (?t) { if (Time.now() >= t.expiresAt or not connectors.containsKey(t.connId) or accessForConn(t.email, t.connId) != #active) null else ?{ email = t.email; displayName = t.displayName; provider = "suite"; createdAt = t.createdAt; expiresAt = t.expiresAt } };
    };
  };
  /// Portal session OR suite token — for the read-only topbar calls only.
  func portalOrSuiteSession(caller : Principal, tok : Text) : ?Session {
    switch (portalSession(caller, tok)) { case (?s) ?s; case null suiteSession(tok) };
  };
  func pruneSuiteTokens() {
    let now = Time.now(); let victims = List.empty<Text>();
    for ((k, t) in Map.entries(suiteTokens)) if (now > t.expiresAt and List.size(victims) < 500) List.add(victims, k);
    for (k in List.values(victims)) ignore Map.delete(suiteTokens, Text.compare, k);
  };

  /// Portal v2 — ONE identity model for the person plane: an SSO session
  /// token (OIDC lane), or — token "" — the caller's passkey principal linked
  /// to a directory entry via an invite. Both yield a Session, so every portal
  /// lane (tiles, tickets, notifications, avatar, requests) serves both.
  func portalSession(caller : Principal, tok : Text) : ?Session {
    if (tok != "") {
      switch (sessions.get(tok)) { case (?s) { if (Time.now() >= s.expiresAt or accessOf(s.email) != #active) return null; return ?s }; case null return null };
    };
    if (Principal.isAnonymous(caller)) return null;
    switch (Map.get(principalLinks, Principal.compare, caller)) {
      case null null;
      case (?e) {
        if (accessOf(e) != #active) return null; // a locked-out person keeps no portal session, passkey or not
        var name = e;
        for ((_, u) in Map.entries(users)) if (u.email == e and u.displayName != "") name := u.displayName;
        ?{ email = e; displayName = name; provider = "passkey"; createdAt = 0; expiresAt = Time.now() + 3_600_000_000_000 };
      };
    };
  };

  /// Who am I in the portal — passkey (token "") or SSO token.
  public shared query ({ caller }) func portalWhoami(token : Text) : async ?{ email : Text; displayName : Text; provider : Text; expiresAt : Int; active : Bool; id : Text } {
    switch (portalOrSuiteSession(caller, token)) {
      case null {
        // a locked-out person with a linked passkey has no session any more (0.19) — but the menu must still be able to
        // tell them so instead of looping back to sign-in: whoami alone answers "inactive", every other read stays closed
        if (token == "" and not Principal.isAnonymous(caller)) {
          switch (Map.get(principalLinks, Principal.compare, caller)) {
            case (?e) { if (accessOf(e) != #active) return ?{ email = e; displayName = e; provider = "passkey"; expiresAt = Time.now(); active = false; id = pidForEmail(e) } };
            case null {};
          };
        };
        null;
      };
      case (?s) {
        if (Time.now() > s.expiresAt) return null;
        ?{ email = s.email; displayName = s.displayName; provider = s.provider; expiresAt = s.expiresAt; active = accessOf(s.email) == #active; id = pidForEmail(s.email) };
      };
    };
  };
  let sessionTtlNs : Int = 8 * 3600 * 1_000_000_000;

  func ssoUrls(p : SsoProvider) : { auth : Text; token : Text; userinfo : Text } {
    if (p.kind == "google") {
      { auth = "https://accounts.google.com/o/oauth2/v2/auth"; token = "https://oauth2.googleapis.com/token"; userinfo = "https://openidconnect.googleapis.com/v1/userinfo" };
    } else {
      { auth = p.issuer # "/oauth2/v1/authorize"; token = p.issuer # "/oauth2/v1/token"; userinfo = p.issuer # "/oauth2/v1/userinfo" };
    };
  };

  public shared ({ caller }) func addSsoProvider(args : { name : Text; kind : Text; issuer : Text; clientId : Text; clientSecret : Text }) : async { ok : Bool; id : Nat; detail : Text } {
    assert isOwnerRole(caller);
    if (args.kind != "okta" and args.kind != "google") return { ok = false; id = 0; detail = "kind must be okta or google" };
    let iss = if (args.kind == "google") "https://accounts.google.com" else normBase(args.issuer);
    if (args.kind == "okta" and not Text.startsWith(iss, #text "https://")) return { ok = false; id = 0; detail = "issuer must start with https://" };
    if (norm(args.clientId) == "") return { ok = false; id = 0; detail = "client id is required" };
    if (args.kind == "google" and norm(args.clientSecret) == "") return { ok = false; id = 0; detail = "Google web clients require the client secret" };
    let id = nextSsoId;
    nextSsoId += 1;
    Map.add(ssoProviders, Nat.compare, id, { id; name = norm(args.name); kind = args.kind; issuer = iss; clientId = norm(args.clientId); clientSecret = norm(args.clientSecret); enabled = true });
    journal("sso", "added SSO provider #" # Nat.toText(id) # " " # norm(args.name) # " (" # args.kind # ")", caller);
    { ok = true; id; detail = "" };
  };

  public shared ({ caller }) func removeSsoProvider(id : Nat) : async Bool {
    assert isOwnerRole(caller);
    ignore Map.delete(ssoProviders, Nat.compare, id);
    journal("sso", "removed SSO provider #" # Nat.toText(id), caller);
    true;
  };

  public shared ({ caller }) func setSsoProviderEnabled(id : Nat, enabled : Bool) : async Bool {
    assert isOwnerRole(caller);
    switch (Map.get(ssoProviders, Nat.compare, id)) {
      case null false;
      case (?p) { Map.add(ssoProviders, Nat.compare, id, { p with enabled }); journal("sso", (if (enabled) "enabled" else "disabled") # " sign-in provider " # p.name, caller); true };
    };
  };

  /// PUBLIC (pre-login): what the sign-in page needs to start the redirect.
  /// Config only — no secrets (clientId is public by definition in OIDC).
  public query func listSsoProvidersPublic() : async [{ id : Nat; name : Text; kind : Text; clientId : Text; authUrl : Text }] {
    let out = List.empty<{ id : Nat; name : Text; kind : Text; clientId : Text; authUrl : Text }>();
    for ((_, p) in Map.entries(ssoProviders)) {
      if (p.enabled) List.add(out, { id = p.id; name = p.name; kind = p.kind; clientId = p.clientId; authUrl = ssoUrls(p).auth });
    };
    List.toArray(out);
  };

  // Anonymous-DoS guard (F2, security review): ssoExchange triggers an
  // outcall per call, so a flood would spend our Okta/Google rate limits.
  // Global sliding window: max 300 exchange attempts per 5 minutes (a company-wide
  // login rush must fit; the limit protects the provider's quota, not seats).
  transient var ssoWindowStart : Int = 0;
  transient var ssoWindowCount : Nat = 0;

  func jwtField(j : Json.Json, key : Text) : ?Json.Json {
    let pairs = switch j { case (#object_(ps)) ps; case _ return null };
    var found : ?Json.Json = null;
    for ((k, v) in pairs.values()) if (k == key) { if (found != null) return null; found := ?v };
    found;
  };
  func jwtText(j : Json.Json, key : Text) : Text = switch (jwtField(j, key)) { case (?#string(t)) t; case _ "" };
  func jwtNat(j : Json.Json, key : Text) : ?Nat = switch (jwtField(j, key)) { case (?#number(#int(n))) { if (n >= 0) ?Int.abs(n) else null }; case _ null };
  func jwtJson(segment : Text) : ?Json.Json {
    let bytes = switch (b64urlDecode(segment)) { case (?b) b; case null return null };
    let txt = switch (Text.decodeUtf8(bytes.toBlob())) { case (?t) t; case null return null };
    switch (Json.parse(sanitizeSurrogates(txt))) { case (#ok(j)) ?j; case _ null };
  };
  // JWKS is a replicated GET. A token response from one node cannot invent its own key.
  // The bounded cache fails closed after expiry. An unknown kid triggers a refresh (rotation).
  transient let ssoKeyCache = Map.empty<Text, { at : Int; keys : [Json.Json] }>();
  public query func ssoKeysTransform(args : TransformArgs) : async HttpResponsePayload {
    { args.response with headers = [] };
  };
  func ssoKey(p : SsoProvider, kid : Text) : async ?Json.Json {
    let url = if (p.kind == "google") "https://www.googleapis.com/oauth2/v3/certs" else p.issuer # "/oauth2/v1/keys";
    switch (ssoKeyCache.get(url)) {
      case (?c) { if (Time.now() - c.at < 300_000_000_000) { for (k in c.keys.values()) if (jwtText(k, "kid") == kid) return ?k } };
      case null {};
    };
    let requestedAt = Time.now();
    let res = await doOutcall({ url; method = #get; body = null; headers = [{ name = "Accept"; value = "application/json" }]; max_response_bytes = ?65_536; is_replicated = ?true; transform = ?{ function = ssoKeysTransform; context = "" } });
    if (res.status != 200) return null;
    let txt = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null return null };
    let j = switch (Json.parse(sanitizeSurrogates(txt))) { case (#ok(j)) j; case _ return null };
    let keys = switch (jwtField(j, "keys")) { case (?#array(a)) a; case _ return null };
    if (keys.size() > 32) return null;
    ssoKeyCache.add(url, { at = requestedAt; keys });
    for (k in keys.values()) if (jwtText(k, "kid") == kid) return ?k;
    null;
  };
  func verifySsoToken(p : SsoProvider, parts : [Text]) : async Bool {
    let header = switch (jwtJson(parts[0])) { case (?j) j; case null return false };
    if (jwtText(header, "alg") != "RS256" or jwtField(header, "crit") != null) return false;
    let kid = jwtText(header, "kid");
    if (kid == "" or kid.size() > 256) return false;
    let k = switch (await ssoKey(p, kid)) { case (?k) k; case null return false };
    if (jwtText(k, "kty") != "RSA" or (jwtText(k, "use") != "" and jwtText(k, "use") != "sig") or (jwtText(k, "alg") != "" and jwtText(k, "alg") != "RS256")) return false;
    let n = switch (b64urlDecode(jwtText(k, "n"))) { case (?x) x; case null return false };
    let e = switch (b64urlDecode(jwtText(k, "e"))) { case (?x) x; case null return false };
    let sig = switch (b64urlDecode(parts[2])) { case (?x) x; case null return false };
    if (n.size() < 256 or n.size() > 512 or e.size() > 4) return false;
    Rsa.verifyDigest(Rsa.fromBytes(n), Rsa.fromBytes(e), sha256Bytes(parts[0] # "." # parts[1]), sig);
  };

  /// PUBLIC: authorization-code exchange. Returns a session token on success.
  public shared func ssoExchange(providerId : Nat, code : Text, redirectUri : Text, codeVerifier : Text) : async { ok : Bool; token : Text; email : Text; displayName : Text; detail : Text } {
    // the window counts FAILED exchanges only: successful sign-ins never rate-limit the company (an anonymous caller could otherwise lock everyone out)
    let fail = func(d : Text) : { ok : Bool; token : Text; email : Text; displayName : Text; detail : Text } { ssoWindowCount += 1; { ok = false; token = ""; email = ""; displayName = ""; detail = d } };
    // input sanity caps before anything else (F2)
    if (code == "" or codeVerifier.size() < 43 or code.size() > 2048 or codeVerifier.size() > 128 or redirectUri.size() > 512) return fail("oversized input");
    if (not Text.startsWith(redirectUri, #text "https://")) return fail("redirect_uri must be https");
    let nowW = Time.now();
    if (nowW - ssoWindowStart > 5 * 60 * 1_000_000_000) { ssoWindowStart := nowW; ssoWindowCount := 0 };
    if (ssoWindowCount >= 600) return { ok = false; token = ""; email = ""; displayName = ""; detail = "rate limited — try again in a few minutes" };
    let p = switch (Map.get(ssoProviders, Nat.compare, providerId)) { case (?p) p; case null return fail("unknown provider") };
    if (not p.enabled) return fail("provider disabled");
    var body = "grant_type=authorization_code&code=" # urlEnc(code) # "&redirect_uri=" # urlEnc(redirectUri) # "&client_id=" # urlEnc(p.clientId) # "&code_verifier=" # urlEnc(codeVerifier);
    if (p.clientSecret != "") body #= "&client_secret=" # urlEnc(p.clientSecret);
    let res = await doOutcall({
      url = ssoUrls(p).token;
      max_response_bytes = ?(30_000 : Nat64);
      headers = [
        { name = "Content-Type"; value = "application/x-www-form-urlencoded" },
        { name = "Accept"; value = "application/json" },
        { name = "User-Agent"; value = "kebabstack-hub" },
      ];
      body = ?Text.encodeUtf8(body);
      method = #post;
      transform = null;
      is_replicated = ?false;
    });
    let bodyText = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null "" };
    if (res.status < 200 or res.status >= 300) return fail("token exchange HTTP " # Nat.toText(res.status) # ": " # snippet(bodyText, 220));
    let parsed = switch (Json.parse(bodyText)) { case (#ok(j)) j; case (#err(_)) return fail("unparseable token response") };
    let idToken = jsonField(parsed, ["id_token"]);
    if (idToken == "") return fail("no id_token in response");
    let parts = Text.split(idToken, #char '.').toArray();
    if (parts.size() != 3) return fail("malformed id_token");
    if (not (await verifySsoToken(p, parts))) return fail("ID token signature could not be verified — retry sign-in or check the provider keys");
    let claims = switch (jwtJson(parts[1])) { case (?j) j; case null return fail("malformed id_token claims") };
    let iss = jwtText(claims, "iss");
    let issOk = if (p.kind == "google") (iss == "https://accounts.google.com" or iss == "accounts.google.com") else iss == p.issuer;
    if (not issOk) return fail("issuer mismatch");
    // This integration accepts one audience only. Multiple-audience tokens need a separate azp policy.
    if (jwtText(claims, "aud") != p.clientId) return fail("audience mismatch");
    let expS = switch (jwtNat(claims, "exp")) { case (?n) n; case null return fail("missing expiry") };
    let iatS = switch (jwtNat(claims, "iat")) { case (?n) n; case null return fail("missing issued-at time") };
    let nowS = Time.now() / 1_000_000_000;
    if (nowS >= expS or iatS > nowS + 60 or expS <= iatS) return fail("id_token expired or invalid time claims");
    if (jwtText(claims, "sub") == "") return fail("missing subject");
    // The frontend sends the S256 PKCE challenge as nonce. Only the same verifier can complete this flow.
    if (jwtText(claims, "nonce") != b64url(sha256Bytes(codeVerifier))) return fail("login attempt mismatch — start sign-in again");
    // 0.20.2 — Okta's org authorization server issues a "thin" ID token in the code flow: the
    // scope-dependent claims (email_verified among them) are only served by /userinfo. When the
    // claim is absent we ask there, bound to the same subject and address, before trusting it.
    var email = lower(jwtText(claims, "email"));
    var verified = jwtField(claims, "email_verified") == ?#bool(true);
    if (jwtField(claims, "email_verified") == null) {
      let access = jsonField(parsed, ["access_token"]);
      if (access == "") return fail("the provider sent neither email_verified nor an access token to look it up");
      let ui = await doOutcall({
        url = ssoUrls(p).userinfo;
        max_response_bytes = ?(30_000 : Nat64);
        headers = [
          { name = "Authorization"; value = "Bearer " # access },
          { name = "Accept"; value = "application/json" },
          { name = "User-Agent"; value = "kebabstack-hub" },
        ];
        body = null;
        method = #get;
        transform = null;
        is_replicated = ?false;
      });
      let uiText = switch (Text.decodeUtf8(ui.body)) { case (?t) t; case null "" };
      if (ui.status < 200 or ui.status >= 300) return fail("userinfo HTTP " # Nat.toText(ui.status) # ": " # snippet(uiText, 220));
      let info = switch (Json.parse(uiText)) { case (#ok(j)) j; case (#err(_)) return fail("unparseable userinfo response") };
      if (jsonField(info, ["sub"]) != jwtText(claims, "sub")) return fail("userinfo subject does not match the ID token");
      let uiEmail = lower(jsonField(info, ["email"]));
      if (email == "") email := uiEmail
      else if (uiEmail != "" and uiEmail != email) return fail("userinfo address does not match the ID token");
      verified := jsonField(info, ["email_verified"]) == "true";
    };
    if (not verified) return fail("the provider must verify the email address before sign-in");
    if (email == "") return fail("no verified email claim");
    // THE gate: only synced, effectively active users may sign in
    switch (accessOf(email)) {
      case (#active) {};
      case (#inactive) { journal("sso", "login DENIED (inactive): " # email # " via " # p.name, Principal.fromText("2vxsx-fae")); return fail("account is deactivated") };
      case (#unknown) { journal("sso", "login DENIED (unknown): " # email # " via " # p.name, Principal.fromText("2vxsx-fae")); return fail("no synced user for " # email) };
    };
    var dn = jsonField(claims, ["name"]);
    if (dn == "") dn := norm(jsonField(claims, ["given_name"]) # " " # jsonField(claims, ["family_name"]));
    if (dn == "") dn := email;
    let tok = hex(await ic00.raw_rand()) # hex(await ic00.raw_rand());
    let now = Time.now();
    if (ssoProviders.get(providerId) != ?p or not p.enabled or accessOf(email) != #active or now / 1_000_000_000 >= expS) return fail("provider or account changed during sign-in");
    Map.add(sessions, Text.compare, tok, { email; displayName = dn; provider = p.name; createdAt = now; expiresAt = now + sessionTtlNs });
    journal("sso", "login OK: " # email # " via " # p.name, Principal.fromText("2vxsx-fae"));
    { ok = true; token = tok; email; displayName = dn; detail = "" };
  };

  /// PUBLIC: session check. Re-validates the LIVE user status on every call,
  /// so a deactivation kills existing sessions instantly.
  public query func ssoWhoami(token : Text) : async ?{ email : Text; displayName : Text; provider : Text; expiresAt : Int; active : Bool; id : Text } {
    switch (Map.get(sessions, Text.compare, token)) {
      case null null;
      case (?s) {
        if (Time.now() > s.expiresAt) return null;
        ?{ email = s.email; displayName = s.displayName; provider = s.provider; expiresAt = s.expiresAt; active = accessOf(s.email) == #active; id = pidForEmail(s.email) };
      };
    };
  };

  public shared func ssoLogout(token : Text) : async Bool {
    ignore Map.delete(sessions, Text.compare, token);
    true;
  };

  public shared query ({ caller }) func listSsoProviders() : async [SsoProvider] {
    assert isAdminRole(caller);
    let out = List.empty<SsoProvider>();
    for ((_, p) in Map.entries(ssoProviders)) List.add(out, { p with clientSecret = maskToken(p.clientSecret) });
    List.toArray(out);
  };

  // ---------- profile pictures (portal upload, synced to connected tools) ----------

  let userAvatars : Map.Map<Text, Blob> = Map.empty<Text, Blob>(); // email -> client-downscaled JPEG
  let AVATAR_MAX : Nat = 400_000;
  let MAX_AVATARS : Nat = 5000;

  public shared ({ caller }) func setMyAvatar(sessionToken : Text, img : Blob) : async Bool {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return false };
    if (Time.now() > s.expiresAt or accessOf(s.email) != #active) return false;
    if (img.size() == 0 or img.size() > AVATAR_MAX) return false;
    if (not Map.containsKey(userAvatars, Text.compare, s.email) and Map.size(userAvatars) >= MAX_AVATARS) return false;
    Map.add(userAvatars, Text.compare, s.email, img);
    true;
  };

  public shared ({ caller }) func clearMyAvatar(sessionToken : Text) : async Bool {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return false };
    if (Time.now() > s.expiresAt) return false; // AUDIT FIX (H9): standard session guard
    Map.remove(userAvatars, Text.compare, s.email);
    true;
  };

  public shared query ({ caller }) func myAvatarPortal(sessionToken : Text) : async ?Blob {
    switch (portalOrSuiteSession(caller, sessionToken)) { // suite token too: the same picture in every app's topbar
      case (?s) { if (Time.now() > s.expiresAt) null else Map.get(userAvatars, Text.compare, s.email) };
      case null null;
    };
  };

  // AUDIT FIX 2026-08-28 (H10): avatars honor the caller's source scope —
  // a tool scoped to one org must not fetch the other org's photos.
  func avatarScopeOk(caller : Principal, email : Text) : Bool {
    switch (connectorByPrincipal(caller)) {
      case (?c) hasLane(c.id, "avatars") and accessForConn(email, c.id) != #unknown;
      case null true; // admins
    };
  };

  /// Profile picture for connected tools (registered connectors + admins).
  public shared query ({ caller }) func connectorAvatar(email : Text) : async ?Blob {
    assert (connectorByPrincipal(caller) != null or isAdmin(caller));
    let e = lower(norm(email));
    if (not avatarScopeOk(caller, e)) return null;
    Map.get(userAvatars, Text.compare, e);
  };

  /// Bulk variant: one query returns every stored picture for the given
  /// emails (missing ones are simply absent — no null poisoning). Lets tools
  /// prefetch the whole directory's avatars in one call instead of N updates.
  public shared query ({ caller }) func connectorAvatars(emails : [Text]) : async [(Text, Blob)] {
    assert (connectorByPrincipal(caller) != null or isAdmin(caller));
    if (emails.size() > 200) return [];
    let out = List.empty<(Text, Blob)>();
    for (e in emails.vals()) {
      let k = lower(norm(e));
      if (avatarScopeOk(caller, k)) { // H10: scope filter here too
        switch (Map.get(userAvatars, Text.compare, k)) { case (?b) List.add(out, (k, b)); case null {} };
      };
    };
    List.toArray(out);
  };

  // ---------- company branding (portal logo) ----------

  var companyLogo : ?Blob = null; // PNG/SVG/JPEG as uploaded, capped
  var companyLogoMime : Text = "";
  let LOGO_MAX : Nat = 300_000;

  public shared ({ caller }) func setCompanyLogo(img : Blob, mime : Text) : async Bool {
    assert isAdminRole(caller);
    if (img.size() == 0 or img.size() > LOGO_MAX) return false;
    if (not Text.startsWith(mime, #text "image/")) return false;
    companyLogo := ?img;
    companyLogoMime := mime;
    journal("apps", "company logo updated (" # Nat.toText(img.size()) # " bytes, " # mime # ")", caller);
    true;
  };

  public shared ({ caller }) func clearCompanyLogo() : async Bool {
    assert isAdminRole(caller);
    companyLogo := null;
    companyLogoMime := "";
    journal("apps", "company logo removed", caller);
    true;
  };

  /// Public: a company logo is not a secret, and the sign-in page may want it too.
  public query func getCompanyLogo() : async ?{ img : Blob; mime : Text } {
    switch (companyLogo) { case (?b) ?{ img = b; mime = companyLogoMime }; case null null };
  };

  // ---------- app links (portal tiles) + single-sign-on hand-off to tools ----------
  //
  // A tile click mints a ONE-TIME ticket bound to the portal session. The
  // tool's frontend passes it to the tool's backend, which redeems it here
  // via an inter-canister call — redeemTicket is caller-gated to REGISTERED
  // connector canisters, so a stolen ticket is useless outside the tool, and
  // the hub re-checks the user's live status at redemption time.

  type AppLink = { id : Nat; name : Text; url : Text; note : Text };
  let appLinks : Map.Map<Nat, AppLink> = Map.empty<Nat, AppLink>();
  var nextAppLinkId : Nat = 1;
  // tile kind, parallel map (stable records are append-only):
  // "app" (default) = SSO ticket hand-off · "link" = plain bookmark, opened
  // directly in a new tab (e.g. tool.example.com)
  let appLinkKinds : Map.Map<Nat, Text> = Map.empty<Nat, Text>();
  func kindOf(id : Nat) : Text = switch (Map.get(appLinkKinds, Nat.compare, id)) { case (?k) k; case null "app" };
  // tile -> connector binding, parallel map. A bound tile's tickets can ONLY
  // be redeemed by that connector canister (a stolen ticket is useless at any
  // other app). 0 / absent = unbound: any registered connector may redeem
  // (legacy behaviour). Approval binds automatically; admins can rebind.
  let appLinkConnectors : Map.Map<Nat, Nat> = Map.empty<Nat, Nat>();
  func connectorOfTile(id : Nat) : Nat = switch (Map.get(appLinkConnectors, Nat.compare, id)) { case (?c) c; case null 0 };
  // "on the menu" switch per tile, parallel map: a hidden tile keeps its address and binding but
  // is not shown to anyone — an admin takes an app off the menu without disconnecting it
  let appLinkHidden : Map.Map<Nat, Bool> = Map.empty<Nat, Bool>();
  func tileHidden(id : Nat) : Bool = switch (Map.get(appLinkHidden, Nat.compare, id)) { case (?h) h; case null false };
  type AppLinkView = { id : Nat; name : Text; url : Text; note : Text; kind : Text; connectorId : Nat; hidden : Bool; hasIcon : Bool };
  func linkView(a : AppLink) : AppLinkView = { id = a.id; name = a.name; url = a.url; note = a.note; kind = kindOf(a.id); connectorId = connectorOfTile(a.id); hidden = tileHidden(a.id); hasIcon = tileIconOf(a.id) != null };

  func productIcon(id : Nat) : ?Blob {
    switch (appPermissionPolicies.get(connectorOfTile(id))) {
      case (?policy) Brand.logo(policy.policy.app);
      case null null;
    };
  };

  // ---- menu entry pictures ----
  // An uploaded picture shows on the menu (and in the Apps list, the app panel,
  // the consent card) instead of the two-letter initials. Kept small: the
  // frontend scales to 128×128 before upload; PNG, JPEG or WebP; ≤ 100 KB.
  let tileIcons : Map.Map<Nat, Blob> = Map.empty<Nat, Blob>();
  let tileIconMimes : Map.Map<Nat, Text> = Map.empty<Nat, Text>();
  transient let TILE_ICON_MAX : Nat = 100_000;
  public shared ({ caller }) func setTileIcon(id : Nat, img : Blob, mime : Text) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (productIcon(id) != null) return { ok = false; detail = "This Kebabstack app uses its standard product logo" };
    let a = switch (Map.get(appLinks, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no such menu entry — put the app on the menu first" } };
    if (img.size() == 0 or img.size() > TILE_ICON_MAX) return { ok = false; detail = "picture must be 1 byte – 100 KB (the hub scales it to 128 px first)" };
    if (mime != "image/png" and mime != "image/jpeg" and mime != "image/webp") return { ok = false; detail = "PNG, JPEG or WebP only" };
    Map.add(tileIcons, Nat.compare, id, img);
    Map.add(tileIconMimes, Nat.compare, id, mime);
    journal("apps", "picture set for " # a.name # " (" # Nat.toText(img.size()) # " bytes)", caller);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func clearTileIcon(id : Nat) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    if (productIcon(id) != null) return { ok = false; detail = "This Kebabstack app uses its standard product logo" };
    ignore Map.delete(tileIcons, Nat.compare, id);
    ignore Map.delete(tileIconMimes, Nat.compare, id);
    { ok = true; detail = "" };
  };
  /// The kitchen sets the picture a recipe ships, right after installing the app. Never overwrites a picture an admin chose.
  func kitchenTileIconInternal(id : Nat, img : Blob, mime : Text, caller : Principal) : { ok : Bool; detail : Text } {
    let a = switch (Map.get(appLinks, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no such menu entry" } };
    if (Map.containsKey(tileIcons, Nat.compare, id)) return { ok = true; detail = "kept the picture an admin set" };
    if (img.size() == 0 or img.size() > TILE_ICON_MAX) return { ok = false; detail = "picture must be 1 byte – 100 KB" };
    if (mime != "image/png" and mime != "image/jpeg" and mime != "image/webp") return { ok = false; detail = "PNG, JPEG or WebP only" };
    Map.add(tileIcons, Nat.compare, id, img);
    Map.add(tileIconMimes, Nat.compare, id, mime);
    journal("apps", "picture set for " # a.name # " by the kitchen (" # Nat.toText(img.size()) # " bytes)", caller);
    { ok = true; detail = "" };
  };
  /// The kitchen sets the picture a recipe ships, right after installing the app. Never overwrites a picture an admin chose.
  public shared ({ caller }) func kitchenSetTileIcon(id : Nat, img : Blob, mime : Text) : async { ok : Bool; detail : Text } {
    if (not isKitchen(caller)) return { ok = false; detail = "kitchen only" };
    kitchenTileIconInternal(id, img, mime, caller);
  };
  /// The same, addressed by the app's backend canister — for apps the kitchen updated or adopted (it may not know the tile number).
  /// Finds the menu entry bound to that app; never overwrites a picture an admin chose.
  /// (0.16.1: no longer delegates through a shared self-call — that made the hub its own caller and refused itself.)
  public shared ({ caller }) func kitchenSetTileIconFor(canisterId : Text, img : Blob, mime : Text) : async { ok : Bool; detail : Text } {
    if (not isKitchen(caller)) return { ok = false; detail = "kitchen only" };
    let pr = switch (principalSafe(norm(canisterId))) { case (?p) p; case null return { ok = false; detail = "that is not a canister id" } };
    let cid = switch (connectorByPrincipal(pr)) { case (?c) c.id; case null return { ok = false; detail = "not a registered app" } };
    var tile : Nat = 0;
    for ((id, _) in Map.entries(appLinks)) if (connectorOfTile(id) == cid) tile := id;
    if (tile == 0) return { ok = false; detail = "the app has no menu entry" };
    kitchenTileIconInternal(tile, img, mime, caller);
  };
  func dropTileIcon(id : Nat) { ignore Map.delete(tileIcons, Nat.compare, id); ignore Map.delete(tileIconMimes, Nat.compare, id) };
  func tileIconOf(id : Nat) : ?{ img : Blob; mime : Text } {
    switch (productIcon(id)) { case (?img) return ?{ img; mime = "image/svg+xml" }; case null {} };
    switch (Map.get(tileIcons, Nat.compare, id)) {
      case (?img) ?{ img; mime = (switch (Map.get(tileIconMimes, Nat.compare, id)) { case (?m) m; case null "image/png" }) };
      case null null;
    };
  };
  /// The picture of one menu entry (public like the company logo: a picture, no name, no address).
  public query func tileIcon(id : Nat) : async ?{ img : Blob; mime : Text } { tileIconOf(id) };
  /// The picture of an external (OIDC) app by its client id — for the consent card.
  public query func oidcClientIcon(clientId : Text) : async ?{ img : Blob; mime : Text } {
    switch (oidcByClientId(norm(clientId))) {
      case (?c) { for ((tid, cid) in Map.entries(appLinkConnectors)) if (cid == c.cid) return tileIconOf(tid); null };
      case null null;
    };
  };

  // The menu is alphabetical for everyone (predictable on day one); people pin and recents do the rest.
  // `appOrder` is kept only for stable-memory compatibility — it no longer influences anything.
  var appOrder : [Nat] = [];
  func orderedAppViews() : [AppLinkView] {
    let arr = Array.map<AppLink, AppLinkView>(Iter.toArray(Map.values(appLinks)), linkView);
    Array.sort<AppLinkView>(arr, func(a, b) = Text.compare(lower(a.name), lower(b.name)));
  };
  /// Menu switch (admins). Turning a tile on that has no address yet is refused — give it one first.
  public shared ({ caller }) func setTileHidden(id : Nat, hidden : Bool) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    let a = switch (Map.get(appLinks, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no such menu entry" } };
    Map.add(appLinkHidden, Nat.compare, id, hidden);
    journal("apps", (if (hidden) "took " else "put ") # a.name # (if (hidden) " off the menu" else " on the menu"), caller);
    { ok = true; detail = "" };
  };
  /// Give a connected app a menu entry (or change its address). Kind follows the app: hub apps sign in by ticket,
  /// external apps by OpenID Connect. Admins.
  public shared ({ caller }) func setConnectorMenu(cid : Nat, url : Text, note : Text) : async { ok : Bool; tileId : Nat; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; tileId = 0; detail = "admins only" };
    let c = switch (Map.get(connectors, Nat.compare, cid)) { case (?c) c; case null return { ok = false; tileId = 0; detail = "no such app" } };
    let u = norm(url);
    if (not Text.startsWith(u, #text "https://")) return { ok = false; tileId = 0; detail = "the address must start with https://" };
    let kind = if (isOidcConnector(cid)) "oidc" else "app";
    for ((tid, k) in Map.entries(appLinkConnectors)) if (k == cid) {
      switch (Map.get(appLinks, Nat.compare, tid)) { case (?t) { Map.add(appLinks, Nat.compare, tid, { t with url = u; note = (if (norm(note) == "") t.note else norm(note)) }); if (kindOf(tid) == "link") Map.add(appLinkKinds, Nat.compare, tid, kind) }; case null {} };
      ignore Map.delete(appLinkHidden, Nat.compare, tid);
      journal("apps", "menu entry of " # c.name # " set to " # u, caller);
      return { ok = true; tileId = tid; detail = "" };
    };
    let tid = nextAppLinkId; nextAppLinkId += 1;
    Map.add(appLinks, Nat.compare, tid, { id = tid; name = c.name; url = u; note = norm(note) });
    Map.add(appLinkKinds, Nat.compare, tid, kind);
    Map.add(appLinkConnectors, Nat.compare, tid, cid);
    journal("apps", "menu entry for " # c.name # " created (" # u # ")", caller);
    { ok = true; tileId = tid; detail = "" };
  };

  public shared ({ caller }) func setAppOrder(ids : [Nat]) : async Bool {
    assert isAdminRole(caller);
    appOrder := Array.filter<Nat>(ids, func(i) = Map.containsKey(appLinks, Nat.compare, i));
    journal("apps", "tile order updated", caller);
    true;
  };

  type AppTicket = { email : Text; displayName : Text; appId : Nat; expiresAt : Int };
  transient let tickets : Map.Map<Text, AppTicket> = Map.empty<Text, AppTicket>();
  let ticketTtlNs : Int = 90 * 1_000_000_000; // 90 s: mint -> redirect -> redeem

  public shared ({ caller }) func addAppLink(args : { name : Text; url : Text; note : Text; kind : Text }) : async { ok : Bool; id : Nat; detail : Text } {
    assert isAdminRole(caller);
    if (not Text.startsWith(norm(args.url), #text "https://")) return { ok = false; id = 0; detail = "url must start with https://" };
    // "win" = SSO app that opens in a small game/terminal-style popup window
    if (args.kind != "app" and args.kind != "link" and args.kind != "win") return { ok = false; id = 0; detail = "kind must be app, link or win" };
    let id = nextAppLinkId;
    nextAppLinkId += 1;
    Map.add(appLinks, Nat.compare, id, { id; name = norm(args.name); url = norm(args.url); note = norm(args.note) });
    Map.add(appLinkKinds, Nat.compare, id, args.kind);
    journal("apps", "added " # args.kind # " tile #" # Nat.toText(id) # " " # norm(args.name), caller);
    { ok = true; id; detail = "" };
  };

  /// Edit a tile in place — the id stays stable (apps reference it as
  /// HUB_JUMP_ID), so renames/URL changes never break the jump wiring.
  public shared ({ caller }) func updateAppLink(id : Nat, args : { name : Text; url : Text; note : Text; kind : Text }) : async { ok : Bool; detail : Text } {
    assert isAdminRole(caller);
    if (not Map.containsKey(appLinks, Nat.compare, id)) return { ok = false; detail = "no such tile" };
    if (not Text.startsWith(norm(args.url), #text "https://")) return { ok = false; detail = "url must start with https://" };
    if (args.kind != "app" and args.kind != "link" and args.kind != "win") return { ok = false; detail = "kind must be app, link or win" };
    Map.add(appLinks, Nat.compare, id, { id; name = norm(args.name); url = norm(args.url); note = norm(args.note) });
    Map.add(appLinkKinds, Nat.compare, id, args.kind);
    journal("apps", "updated tile #" # Nat.toText(id) # " " # norm(args.name), caller);
    { ok = true; detail = "" };
  };

  public shared query ({ caller }) func listAppLinks() : async [AppLinkView] {
    assert isAdmin(caller);
    orderedAppViews();
  };

  /// Bind a tile to the connector that may redeem its tickets (0 = unbind).
  public shared ({ caller }) func setTileConnector(appId : Nat, connectorId : Nat) : async { ok : Bool; detail : Text } {
    assert isAdminRole(caller);
    if (not Map.containsKey(appLinks, Nat.compare, appId)) return { ok = false; detail = "no such tile" };
    if (connectorId == 0) {
      ignore Map.delete(appLinkConnectors, Nat.compare, appId);
      journal("apps", "tile #" # Nat.toText(appId) # " unbound (any connector may redeem)", caller);
      return { ok = true; detail = "" };
    };
    let c = switch (Map.get(connectors, Nat.compare, connectorId)) { case (?c) c; case null return { ok = false; detail = "no such connector" } };
    Map.add(appLinkConnectors, Nat.compare, appId, connectorId);
    journal("apps", "tile #" # Nat.toText(appId) # " bound to connector #" # Nat.toText(connectorId) # " " # c.name, caller);
    { ok = true; detail = "" };
  };

  public shared ({ caller }) func removeAppLink(id : Nat) : async Bool {
    assert isAdminRole(caller);
    ignore Map.delete(appLinks, Nat.compare, id);
    ignore Map.delete(appLinkConnectors, Nat.compare, id);
    ignore Map.delete(appLinkHidden, Nat.compare, id);
    dropTileIcon(id);
    journal("apps", "removed app link #" # Nat.toText(id), caller);
    true;
  };

  // ---------- onboarding requests (self-service, admin approval) ----------
  // Developers request from the portal ("Onboard your app"); an admin decides
  // in the Connectors view. Approval registers the connector and (optionally)
  // creates the portal tile in the same click — sources/filters are then one
  // click away in the same view. Nothing here grants access by itself.

  type ConnectorRequest = {
    id : Nat;
    appName : Text;
    note : Text; // one-liner, shows on the tile
    canisterId : Text; // BACKEND canister, normalized principal text
    tileKind : Text; // "app" (SSO) | "link" | "none"
    tileUrl : Text;
    lane : Text; // "directory" | "team-directory"
    populationWish : Text; // free text: desired sources / exclude filters
    requestedBy : Text; // hub SSO email
    at : Int;
    status : Text; // "pending" | "approved" | "rejected"
    decision : Text; // admin note (approval detail / reject reason)
    decidedAt : Int;
  };
  let connectorRequests : Map.Map<Nat, ConnectorRequest> = Map.empty<Nat, ConnectorRequest>();
  var nextConnectorRequestId : Nat = 1;
  // The member-facing "Onboard your app" request flow (submit/list/approve/reject) was removed in 0.19:
  // apps are connected by admins in Apps → Connect an app (probe, lanes, access). The map above stays for stable compatibility.

  /// Portal tiles for a signed-in user (session-gated, not public).
  public shared query ({ caller }) func portalApps(sessionToken : Text) : async [AppLinkView] {
    switch (portalOrSuiteSession(caller, sessionToken)) {
      case null [];
      case (?s) {
        if (Time.now() > s.expiresAt or accessOf(s.email) != #active) return [];
        // a tile bound to an app shows only to people that app lets in
        Array.filter<AppLinkView>(orderedAppViews(), func(a) { not a.hidden and (a.connectorId == 0 or accessForConn(s.email, a.connectorId) == #active) });
      };
    };
  };

  /// Mint a one-time hand-off ticket for an app tile (portal session required).
  public shared ({ caller }) func mintAppTicket(sessionToken : Text, appId : Nat) : async { ok : Bool; ticket : Text; url : Text; detail : Text } {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return { ok = false; ticket = ""; url = ""; detail = "no session" } };
    if (Time.now() > s.expiresAt) return { ok = false; ticket = ""; url = ""; detail = "session expired" };
    if (accessOf(s.email) != #active) return { ok = false; ticket = ""; url = ""; detail = "account inactive" };
    let app = switch (Map.get(appLinks, Nat.compare, appId)) { case (?a) a; case null return { ok = false; ticket = ""; url = ""; detail = "unknown app" } };
    let boundCid = connectorOfTile(appId);
    if (boundCid == 0 or not connectors.containsKey(boundCid)) return { ok = false; ticket = ""; url = ""; detail = "this sign-in tile needs a registered app binding — ask an admin" };
    if (boundCid != 0 and accessForConn(s.email, boundCid) != #active) return { ok = false; ticket = ""; url = ""; detail = "this app is not available to you" };
    if (tileHidden(appId)) return { ok = false; ticket = ""; url = ""; detail = "this app is off the menu right now" };
    let t = hex(await ic00.raw_rand());
    // Authorization and the destination can change while entropy is requested.
    if (portalSession(caller, sessionToken) == null or accessForConn(s.email, boundCid) != #active or connectorOfTile(appId) != boundCid or appLinks.get(appId) != ?app or tileHidden(appId)) return { ok = false; ticket = ""; url = ""; detail = "access or app configuration changed — try again" };
    Map.add(tickets, Text.compare, t, { email = s.email; displayName = s.displayName; appId; expiresAt = Time.now() + ticketTtlNs });
    { ok = true; ticket = t; url = app.url; detail = "" };
  };

  /// Redeem a hand-off ticket. ONLY registered connector canisters may call.
  /// One-time: the ticket is deleted on first use, valid 90 s, and the
  /// user's live status is re-checked here.
  public shared ({ caller }) func redeemTicket(ticket : Text) : async { ok : Bool; email : Text; displayName : Text; detail : Text; suiteToken : ?Text; id : ?Text } {
    let conn = switch (connectorByPrincipal(caller)) { case (?c) c; case null return { ok = false; email = ""; displayName = ""; detail = "caller is not a registered connector"; suiteToken = null; id = null } };
    switch (Map.get(tickets, Text.compare, ticket)) {
      case null { { ok = false; email = ""; displayName = ""; detail = "unknown or already used ticket"; suiteToken = null; id = null } };
      case (?tk) {
        ignore Map.delete(tickets, Text.compare, ticket);
        if (Time.now() > tk.expiresAt) return { ok = false; email = ""; displayName = ""; detail = "ticket expired"; suiteToken = null; id = null };
        // binding gate: a tile bound to a connector only hands its tickets to that canister
        let bound = connectorOfTile(tk.appId);
        if (bound == 0 or not appLinks.containsKey(tk.appId)) return { ok = false; email = ""; displayName = ""; detail = "this ticket has no registered app binding"; suiteToken = null; id = null };
        if (bound != 0 and bound != conn.id) {
          journal("apps", "ticket DENIED for " # tk.email # ": tile #" # Nat.toText(tk.appId) # " is bound to connector #" # Nat.toText(bound) # ", redeemed by " # conn.name, caller);
          return { ok = false; email = ""; displayName = ""; detail = "this ticket belongs to a different app"; suiteToken = null; id = null };
        };
        // scope gate: the user must be active in a connection this tool is allowed to see
        if (accessForConn(tk.email, conn.id) != #active) {
          journal("apps", "ticket DENIED for " # tk.email # " at " # conn.name # " (inactive or outside the connector's source scope)", caller);
          return { ok = false; email = ""; displayName = ""; detail = "your account is not eligible for this app"; suiteToken = null; id = null };
        };
        journal("apps", "ticket redeemed for " # tk.email # " by connector " # conn.name, caller);
        // the suite token: the same bell, menu and identity inside the app — read-only, 12 h
        pruneSuiteTokens();
        let st = hex(await ic00.raw_rand());
        if (connectorByPrincipal(caller) != ?conn or connectorOfTile(tk.appId) != conn.id or accessForConn(tk.email, conn.id) != #active) return { ok = false; email = ""; displayName = ""; detail = "access was revoked while signing in"; suiteToken = null; id = null };
        let nowS = Time.now();
        Map.add(suiteTokens, Text.compare, st, { email = tk.email; displayName = tk.displayName; connId = conn.id; createdAt = nowS; expiresAt = nowS + SUITE_TTL_NS });
        { ok = true; email = tk.email; displayName = tk.displayName; detail = ""; suiteToken = ?st; id = ?pidForEmail(tk.email) };
      };
    };
  };

  /// Full directory for a registered connector canister (pull lane): dedup by
  /// email, effective active flag included — tools cache this and refresh
  /// periodically. Complements the frozen Phase-2 push contract.
  public shared query ({ caller }) func connectorDirectory() : async [ConnectorUser] {
    // scoped to the calling connector's allowed connections; admins see all
    let (scope, rules) = switch (connectorByPrincipal(caller)) {
      case (?c) (scopeOf(c.id), filtersOf(c.id));
      case null { assert isAdmin(caller); (([] : [Nat]), ([] : [Text])) };
    };
    let cid = callerCid(caller);
    let stamp = permissionStamp(cid);
    let seen = Map.empty<Text, Bool>();
    let out = List.empty<ConnectorUser>();
    for ((_, u) in Map.entries(users)) {
      if ((if (appPermissionPolicies.containsKey(cid)) eligibleFor(cid, u, policyOf(cid)) else u.email != "" and inScope(scope, u.connId) and directoryEligible(u) and not excludedBy(u, rules) and policyAllows(cid, u.email)) and not Map.containsKey(seen, Text.compare, u.email)) {
        Map.add(seen, Text.compare, u.email, true);
        let cname = switch (connOf(u.connId)) { case (?c) c.name; case null "" };
        List.add(out, {
          email = u.email;
          displayName = u.displayName;
          firstName = u.firstName;
          lastName = u.lastName;
          active = accessForConn(u.email, cid) == #active;
          source = cname;
          externalId = u.externalId;
          // what this app may see, by its lanes: profile attributes (F17
          // whitelist), groups ("groups" = "a;b"), staff role ("hubRole")
          attributes = attrsForConn(cid, u.email, u.attributes, stamp);
          id = ?pidForEmail(u.email);
        });
      };
    };
    List.toArray(out);
  };

  // ---------- team-directory provider (minimal, standard v2.5 wire shapes) ----------
  //
  // Lets consumers built for the team-directory standard (e.g. Lunch Check-in's
  // roster switch) pull their people from the hub: only team_info (handshake)
  // and team_members are implemented — consumers feature-detect the rest.
  // Gated to registered connector canisters + admins.

  type TdTeamInfo = { name : Text; version : Text; standard : Text; memberCount : Nat; changeSeq : ?Nat };
  type TdTeamMember = {
    memberId : Text;
    firstName : Text;
    lastName : Text;
    email : Text;
    title : Text;
    departmentId : ?Text;
    managerId : ?Text;
    active : ?Bool;
    protected : ?Bool;
    version : ?Nat;
  };

  // AUDIT FIX 2026-08-28 (H1/C5): the team-directory lane now honors the
  // caller's SOURCE SCOPE exactly like connectorDirectory — a tool scoped to
  // one Okta org must not see (or activity-flag) the other org's people.
  func tdMembers(scope : [Nat], rules : [Text], cid : Nat) : [TdTeamMember] {
    let seen = Map.empty<Text, Bool>();
    let out = List.empty<TdTeamMember>();
    for ((_, u) in Map.entries(users)) {
      if ((if (appPermissionPolicies.containsKey(cid)) eligibleFor(cid, u, policyOf(cid)) else u.email != "" and inScope(scope, u.connId) and directoryEligible(u) and not excludedBy(u, rules) and policyAllows(cid, u.email)) and not Map.containsKey(seen, Text.compare, u.email)) {
        Map.add(seen, Text.compare, u.email, true);
        List.add(out, {
          memberId = u.email; // stable join key for consumers keyed by email
          firstName = u.firstName;
          lastName = u.lastName;
          email = u.email;
          title = "";
          departmentId = null;
          managerId = null;
          active = ?(accessForConn(u.email, cid) == #active);
          protected = null;
          version = null;
        });
      };
    };
    List.toArray(out);
  };

  func callerScopeFilters(caller : Principal) : ([Nat], [Text]) {
    switch (connectorByPrincipal(caller)) { case (?c) (scopeOf(c.id), filtersOf(c.id)); case null (([] : [Nat]), ([] : [Text])) };
  };

  public shared query ({ caller }) func team_info() : async TdTeamInfo {
    assert (connectorByPrincipal(caller) != null or isAdmin(caller));
    let (scope, rules) = callerScopeFilters(caller);
    { name = "User Hub"; version = "2.5.0"; standard = "team-directory"; memberCount = tdMembers(scope, rules, callerCid(caller)).size(); changeSeq = null };
  };

  public shared query ({ caller }) func team_members() : async [TdTeamMember] {
    assert (connectorByPrincipal(caller) != null or isAdmin(caller));
    let (scope, rules) = callerScopeFilters(caller);
    tdMembers(scope, rules, callerCid(caller));
  };

  // ---------- portal widget: my lunch check-ins ----------

  var lunchCanister : Text = ""; // Lunch Check-in BACKEND canister id (admin-set)

  public shared ({ caller }) func setLunchCanister(id : Text) : async Bool {
    assert isOwnerRole(caller);
    lunchCanister := norm(id);
    journal("apps", "lunch canister set to " # norm(id), caller);
    true;
  };

  type LunchSummary = { total : Nat; thisMonth : Nat; recent : [Text]; dates : [Text] };
  type LunchActor = actor { checkinsFor : (Text) -> async LunchSummary };

  /// Session-gated: a user's own check-in summary, proxied from the Lunch
  /// Check-in canister (which must list THIS canister as an admin).
  /// Is this user part of the population the LUNCH connector receives?
  /// Uses the lunch connector's own scope + exclude filters (entity=LLC,
  /// city^=Remote, kind filtering) — US/remote colleagues who can't check in
  /// simply don't get the widget. Lunch not registered as connector = show
  /// for everyone (old behavior).
  func lunchEligible(email : Text) : Bool {
    var found : ?Connector = null;
    for ((_, c) in Map.entries(connectors)) {
      if (Principal.toText(c.canisterId) == lunchCanister) found := ?c;
    };
    switch (found) {
      case null true;
      case (?c) {
        let scope = scopeOf(c.id);
        let rules = filtersOf(c.id);
        for ((_, u) in Map.entries(users)) {
          if (u.email == email and inScope(scope, u.connId) and directoryEligible(u) and not excludedBy(u, rules) and policyAllows(c.id, u.email)) return true;
        };
        false;
      };
    };
  };

  public shared ({ caller }) func portalLunch(sessionToken : Text) : async ?LunchSummary {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return null };
    if (Time.now() > s.expiresAt or accessOf(s.email) != #active) return null;
    if (lunchCanister == "") return null;
    if (not lunchEligible(s.email)) return null; // not in the lunch roster population — no widget
    let lunch : LunchActor = actor (lunchCanister);
    try { ?(await (with timeout = 30) lunch.checkinsFor(s.email)) } catch (_) { null };
  };

  // ---------- notifications (hub as broker: tools -> people) ----------
  //
  // The return lane of the connector contract. Tools call hub_notify() —
  // caller-gated exactly like redeemTicket — and the hub delivers:
  //   1. portal inbox (always; bell in the top bar)
  //   2. Slack DM via chat.postMessage (admin-configured bot token,
  //      per-user opt-out) — direct outcall, the proven zero-cycle lane.
  // Payload policy: TITLE + LINK ONLY. Content stays behind the tool's
  // own SSO — nothing sensitive rides through Slack.

  type Notification = {
    id : Nat;
    email : Text; // recipient, lowercased
    fromApp : Text; // connector name (journal-stable)
    title : Text;
    url : Text; // deep link into the tool ("" = none)
    kind : Text; // free tag, e.g. "form.submission"
    at : Int;
    read : Bool;
    slack : Text; // "off" | "queued" | "sent" | "skipped: …" | "failed: …"
  };
  let notifications : Map.Map<Nat, Notification> = Map.empty<Nat, Notification>();
  var nextNotifId : Nat = 1;
  let notifSlackOptOut : Map.Map<Text, Bool> = Map.empty<Text, Bool>(); // email -> opted out (default = DMs ON)
  let notifDedupe : Map.Map<Text, Int> = Map.empty<Text, Int>(); // "<connectorId>:<dedupeKey>" -> at
  var slackBotToken : Text = ""; // LEGACY (single-bot era) — folded into slackBots via migrateLegacySlackBot()
  var slackEnabled : Bool = false; // global Slack delivery switch
  let slackIdCache : Map.Map<Text, Text> = Map.empty<Text, Text>(); // LEGACY cache, no longer used (append-only rule)

  let NOTIF_PER_USER_CAP : Nat = 200;
  let NOTIF_RETENTION_NS : Int = 90 * 86400 * 1_000_000_000;
  let NOTIF_DEDUPE_NS : Int = 48 * 3600 * 1_000_000_000;

  // per-connector rate limit: max 120 notifications / 5 min (transient window)
  transient let notifWindows : Map.Map<Nat, (Int, Nat)> = Map.empty<Nat, (Int, Nat)>();

  func jsonEsc(t : Text) : Text {
    var out = "";
    for (c in t.chars()) {
      out #= switch (c) {
        case '\"' "\\\"";
        case '\\' "\\\\";
        case '\n' "\\n";
        case '\r' "\\r";
        case '\t' "\\t";
        case c { if (Char.toNat32(c) < 32) " " else Char.toText(c) };
      };
    };
    out;
  };

  /// Repair legacy root hash links without changing their origin or route. Extra
  /// slashes at the certified asset root can fail gateway verification. Leave
  /// subpaths, query strings and all other URLs exactly as supplied.
  func notificationUrl(url : Text) : Text {
    let rest = switch (Text.stripStart(url, #text "https://")) { case (?r) r; case null return url };
    let base = Text.split(rest, #char '#').next() ?? "";
    let host = Text.split(base, #char '/').next() ?? "";
    if (host == "" or Text.contains(host, #char '?') or Text.contains(host, #char '@') or Text.contains(host, #char '\\')) return url;
    let path = Text.stripStart(base, #text host) ?? "";
    if (path.size() < 2) return url;
    for (c in path.chars()) if (c != '/') return url;
    let route = Text.stripStart(rest, #text base) ?? "";
    if (not Text.startsWith(route, #text "#/")) return url;
    "https://" # host # "/" # route;
  };

  func notifCapUser(email : Text) {
    var count = 0;
    var oldestId : Nat = 0;
    var oldestAt : Int = 0;
    for ((id, n) in Map.entries(notifications)) {
      if (n.email == email) {
        count += 1;
        if (oldestId == 0 or n.at < oldestAt) { oldestId := id; oldestAt := n.at };
      };
    };
    if (count >= NOTIF_PER_USER_CAP and oldestId != 0) ignore Map.delete(notifications, Nat.compare, oldestId);
  };

  /// CONTRACT (return lane): a registered connector notifies a person.
  /// Admins may call too (testing). Recipient must be ACTIVE and inside the
  /// caller's source scope — the same population rule as connectorDirectory.
  public shared ({ caller }) func hub_notify(args : { email : Text; title : Text; url : Text; kind : Text; dedupeKey : Text }) : async { ok : Bool; detail : Text } {
    let (fromApp, connId) = switch (connectorByPrincipal(caller)) {
      case (?c) { if (not hasLane(c.id, "notify")) return { ok = false; detail = "this app has no notify lane — an admin can grant it under Apps → Lanes" }; (c.name, c.id) };
      case null {
        if (not isAdmin(caller)) return { ok = false; detail = "caller is not a registered connector" };
        ("User Hub", 0);
      };
    };
    let email = lower(norm(args.email));
    let title = norm(args.title);
    if (email == "" or title == "") return { ok = false; detail = "email and title are required" };
    if (title.size() > 200) return { ok = false; detail = "title too long (max 200)" };
    if (args.url != "" and (not Text.startsWith(args.url, #text "https://") or args.url.size() > 500)) return { ok = false; detail = "url must be https:// and <= 500 chars" };
    if (args.kind.size() > 60 or args.dedupeKey.size() > 120) return { ok = false; detail = "kind/dedupeKey too long" };
    // rate limit per caller
    let now = Time.now();
    let (ws, wc) = switch (Map.get(notifWindows, Nat.compare, connId)) { case (?w) w; case null (now, 0) };
    let (ws2, wc2) = if (now - ws > 5 * 60 * 1_000_000_000) (now, 0) else (ws, wc);
    if (wc2 >= 120) return { ok = false; detail = "rate limited (120 / 5 min per app)" };
    Map.add(notifWindows, Nat.compare, connId, (ws2, wc2 + 1));
    // population gate: same scope rule as the directory
    if (accessForConn(email, connId) != #active) return { ok = false; detail = "recipient is not an active user for this app" };
    // AUDIT FIX 2026-08-28 (H6/C6): full population rule like the directory —
    // person-kind + the connector's exclude filters, not just source scope.
    if (connId != 0) {
      var eligible = false;
      let scope6 = scopeOf(connId);
      let rules6 = filtersOf(connId);
      for ((_, u) in Map.entries(users)) {
        if (u.email == email and inScope(scope6, u.connId) and directoryEligible(u) and not excludedBy(u, rules6) and policyAllows(connId, u.email)) eligible := true;
      };
      if (not eligible) return { ok = false; detail = "recipient is outside this app's population" };
    };
    // dedupe
    if (args.dedupeKey != "") {
      let dk = Nat.toText(connId) # ":" # args.dedupeKey;
      switch (Map.get(notifDedupe, Text.compare, dk)) {
        case (?t) { if (now - t < NOTIF_DEDUPE_NS) return { ok = true; detail = "duplicate suppressed" } };
        case null {};
      };
      Map.add(notifDedupe, Text.compare, dk, now);
    };
    notifCapUser(email);
    migrateLegacySlackBot();
    let optedOut = switch (Map.get(notifSlackOptOut, Text.compare, email)) { case (?b) b; case null false };
    let slackState = if (not slackEnabled or enabledBotsSnapshot().size() == 0) "off" else if (optedOut) "skipped: user opted out" else "queued";
    let id = nextNotifId;
    nextNotifId += 1;
    Map.add(notifications, Nat.compare, id, { id; email; fromApp; title; url = notificationUrl(args.url); kind = args.kind; at = now; read = false; slack = slackState });
    if (slackState == "queued") ignore Timer.setTimer<system>(#seconds 1, deliverSlack);
    { ok = true; detail = "" };
  };

  // ---- AI for the whole suite: ONE key, set here, fetched by apps with the "ai" lane ----
  // Apps never store the key themselves; they call hub_aiCredentials (caller-gated on the
  // lane) and cache it briefly. Rotation happens here once. Usage is counted per app.
  public type AiConfig = { provider : Text; url : Text; model : Text }; // provider: "openai" (chat/completions-compatible) | "anthropic"
  var aiProvider : Text = "";
  var aiUrl : Text = "";
  var aiModel : Text = "";
  var aiKey : Text = ""; // write-only: never returned to a browser
  var aiVisionModel : Text = ""; // optional: a model for pictures, "" = same as model
  var aiSetAt : Int = 0;
  let aiUsage : Map.Map<Nat, (Nat, Int)> = Map.empty<Nat, (Nat, Int)>(); // connector id -> (calls reported, last)
  let aiFetches : Map.Map<Nat, (Nat, Int)> = Map.empty<Nat, (Nat, Int)>(); // connector id -> (credential fetches, last)
  func aiOn() : Bool = aiKey != "" and aiUrl != "" and aiModel != "";
  /// Owners set the company's AI access. Empty key keeps the stored one (so URL/model can change alone).
  public shared ({ caller }) func setAi(args : { provider : Text; url : Text; model : Text; key : Text; visionModel : ?Text }) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    let prov = lower(norm(args.provider));
    if (prov != "openai" and prov != "anthropic") return { ok = false; detail = "provider: openai (or any chat/completions-compatible API) or anthropic" };
    let url = norm(args.url);
    if (not Text.startsWith(url, #text "https://") or url.size() > 300) return { ok = false; detail = "url must start with https://" };
    let model = norm(args.model);
    if (model == "" or model.size() > 120) return { ok = false; detail = "model is required" };
    let key = norm(args.key);
    if (key == "" and aiKey == "") return { ok = false; detail = "an API key is required the first time" };
    if (key.size() > 400) return { ok = false; detail = "key too long" };
    aiProvider := prov; aiUrl := url; aiModel := model;
    if (key != "") { aiKey := key; aiSetAt := Time.now() };
    aiVisionModel := switch (args.visionModel) { case (?v) norm(v); case null aiVisionModel };
    journal("admin", "AI access set: " # prov # " · " # model # (if (key != "") " · new key" else ""), caller);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func clearAi() : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    aiProvider := ""; aiUrl := ""; aiModel := ""; aiKey := ""; aiVisionModel := ""; aiSetAt := 0;
    journal("admin", "AI access removed", caller);
    { ok = true; detail = "" };
  };
  /// Admin view: what is set (never the key) and which apps use it.
  public shared query ({ caller }) func aiInfo() : async { on : Bool; provider : Text; url : Text; model : Text; visionModel : Text; keyHint : Text; setAt : Int; apps : [{ id : Nat; name : Text; hasLane : Bool; calls : Nat; lastCall : Int; fetches : Nat; lastFetch : Int }] } {
    assert isAdmin(caller);
    let apps = List.empty<{ id : Nat; name : Text; hasLane : Bool; calls : Nat; lastCall : Int; fetches : Nat; lastFetch : Int }>();
    for ((cid, c) in Map.entries(connectors)) {
      if (not isOidcConnector(cid)) {
        let (calls, lastCall) = switch (Map.get(aiUsage, Nat.compare, cid)) { case (?u) u; case null (0, 0) };
        let (fetches, lastFetch) = switch (Map.get(aiFetches, Nat.compare, cid)) { case (?u) u; case null (0, 0) };
        List.add(apps, { id = cid; name = c.name; hasLane = hasLane(cid, "ai"); calls; lastCall; fetches; lastFetch });
      };
    };
    let hint = if (aiKey == "") "" else { let n = aiKey.size(); if (n <= 8) "••••" else "…" # (Text.fromIter(Iter.drop<Char>(aiKey.chars(), n - 4 : Nat))) };
    { on = aiOn(); provider = aiProvider; url = aiUrl; model = aiModel; visionModel = aiVisionModel; keyHint = hint; setAt = aiSetAt; apps = List.toArray(apps) };
  };
  /// Connector contract (lane "ai"): the credentials an app uses for its own calls to the AI vendor.
  /// Cache them for a few minutes; a rotation here reaches every app on its next fetch.
  public shared ({ caller }) func hub_aiCredentials() : async ?{ provider : Text; url : Text; model : Text; visionModel : Text; key : Text } {
    let conn = switch (connectorByPrincipal(caller)) { case (?c) c; case null return null };
    if (not hasLane(conn.id, "ai")) return null;
    if (not aiOn()) return null;
    let (n, _) = switch (Map.get(aiFetches, Nat.compare, conn.id)) { case (?u) u; case null (0, 0) };
    Map.add(aiFetches, Nat.compare, conn.id, (n + 1, Time.now()));
    ?{ provider = aiProvider; url = aiUrl; model = aiModel; visionModel = (if (aiVisionModel == "") aiModel else aiVisionModel); key = aiKey };
  };
  /// For an app's settings page: is a key set, and does THIS app have the lane? Never the key itself. Any registered connector may ask.
  public shared query ({ caller }) func hub_aiStatus() : async ?{ connectorId : Nat; keySet : Bool; laneGranted : Bool; provider : Text; model : Text; visionModel : Text } {
    switch (connectorByPrincipal(caller)) {
      case (?c) ?{ connectorId = c.id; keySet = aiOn(); laneGranted = hasLane(c.id, "ai"); provider = aiProvider; model = aiModel; visionModel = (if (aiVisionModel == "") aiModel else aiVisionModel) };
      case null null;
    };
  };
  /// Apps report their calls so the owner sees who uses the key (best effort, one call per batch is fine).
  public shared ({ caller }) func hub_aiUsed(calls : Nat) : async () {
    switch (connectorByPrincipal(caller)) {
      case (?c) { let (n, _) = switch (Map.get(aiUsage, Nat.compare, c.id)) { case (?u) u; case null (0, 0) }; Map.add(aiUsage, Nat.compare, c.id, (n + Nat.min(calls, 10_000), Time.now())) };
      case null {};
    };
  };

  // ---- Slack delivery: MULTI-WORKSPACE bots (one bot per Slack workspace) ----
  // One bot per Slack workspace, managed centrally here. Delivery finds the
  // recipient by trying each enabled bot's users.lookupByEmail (cached).
  // Tools don't own Slack credentials: the admin ASSIGNS bots per connector
  // and tools fetch them via hub_slackCredentials (caller-gated) — rotation
  // happens in one place.

  type SlackBot = {
    id : Nat;
    name : Text; // admin label, e.g. "Acme" / "Acme Labs"
    token : Text; // xoxb-…, write-only
    signingSecret : Text; // for tools doing Events API intake (write-only)
    teamName : Text; // resolved via auth.test
    enabled : Bool;
  };
  let slackBots : Map.Map<Nat, SlackBot> = Map.empty<Nat, SlackBot>();
  var nextSlackBotId : Nat = 1;
  let connectorBots : Map.Map<Nat, [Nat]> = Map.empty<Nat, [Nat]>(); // connectorId -> assigned bot ids
  let slackUserCache2 : Map.Map<Text, (Nat, Text)> = Map.empty<Text, (Nat, Text)>(); // email -> (botId, slack user id)

  /// One-time fold of the legacy single-token config into bot #1.
  /// (slackBotToken/slackIdCache stay declared — append-only discipline.)
  func migrateLegacySlackBot() {
    if (slackBotToken != "" and Map.size(slackBots) == 0) {
      let id = nextSlackBotId;
      nextSlackBotId += 1;
      Map.add(slackBots, Nat.compare, id, { id; name = "Slack (legacy token)"; token = slackBotToken; signingSecret = ""; teamName = ""; enabled = true });
      slackBotToken := "";
      Map.clear(slackIdCache);
    };
  };

  // AUDIT FIX 2026-08-28 (H8/C14): timestamp guard with self-expiry (F1
  // pattern) — one trap must not wedge Slack delivery until the next upgrade.
  transient var slackBusyAt : Int = 0;
  func slackBusyNow() : Bool = slackBusyAt != 0 and Time.now() - slackBusyAt < 5 * 60 * 1_000_000_000;

  func slackApi(token : Text, url : Text, jsonBody : ?Text) : async { ok : Bool; body : Text } {
    let res = await doOutcall({
      url;
      max_response_bytes = ?(20_000 : Nat64);
      headers = [
        { name = "Authorization"; value = "Bearer " # token },
        { name = "Content-Type"; value = "application/json; charset=utf-8" },
        { name = "User-Agent"; value = "kebabstack-hub" },
      ];
      body = switch (jsonBody) { case (?b) ?Text.encodeUtf8(b); case null null };
      method = switch (jsonBody) { case (?_) #post; case null #get };
      transform = null;
      is_replicated = ?false;
    });
    let bodyText = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null "" };
    { ok = res.status >= 200 and res.status < 300; body = bodyText };
  };

  func enabledBotsSnapshot() : [SlackBot] {
    let out = List.empty<SlackBot>();
    for ((_, b) in Map.entries(slackBots)) if (b.enabled and b.token != "") List.add(out, b);
    List.toArray(out);
  };

  /// Which bot can reach this email? Cache hit first, then probe each
  /// enabled workspace (bots snapshotted before any await).
  func slackTarget(email : Text) : async ?(SlackBot, Text) {
    switch (Map.get(slackUserCache2, Text.compare, email)) {
      case (?(bid, uid)) {
        switch (Map.get(slackBots, Nat.compare, bid)) {
          case (?b) { if (b.enabled and b.token != "") return ?(b, uid) };
          case null {};
        };
      };
      case null {};
    };
    for (b in enabledBotsSnapshot().vals()) {
      let r = await slackApi(b.token, "https://slack.com/api/users.lookupByEmail?email=" # urlEnc(email), null);
      if (r.ok) {
        switch (Json.parse(r.body)) {
          case (#ok(j)) {
            if (jsonField(j, ["ok"]) == "true") {
              let uid = switch (Json.get(j, "user.id")) { case (?#string(s)) s; case (_) "" };
              if (uid != "") {
                Map.add(slackUserCache2, Text.compare, email, (b.id, uid));
                return ?(b, uid);
              };
            };
          };
          case (#err(_)) {};
        };
      };
    };
    null;
  };

  func deliverSlack() : async () {
    migrateLegacySlackBot();
    if (slackBusyNow() or not slackEnabled or Map.size(slackBots) == 0) return;
    slackBusyAt := Time.now();
    // snapshot FIRST: hub_notify may add entries while we await outcalls,
    // and mutating a Map mid-iteration is undefined territory.
    let queued = List.empty<Nat>();
    for ((id, n) in Map.entries(notifications)) {
      if (n.slack == "queued" and List.size(queued) < 10) List.add(queued, id); // batch cap; the sweep timer retries
    };
    for (id in List.values(queued)) {
      switch (Map.get(notifications, Nat.compare, id)) {
        case (?n) {
          if (n.slack == "queued") {
            let outcome = switch (await slackTarget(n.email)) {
              case null "failed: no Slack user for " # n.email # " in any workspace";
              case (?(bot, uid)) {
                // AUDIT FIX (H7): neutralize Slack mrkdwn control chars in
                // free-text fields — a tool must not smuggle <url|label> links.
                let mrk = func(t : Text) : Text = Text.replace(Text.replace(Text.replace(t, #char '&', "&amp;"), #char '<', "&lt;"), #char '>', "&gt;");
                let link = if (n.url != "") "\n<" # jsonEsc(notificationUrl(n.url)) # "|Open in " # jsonEsc(mrk(n.fromApp)) # " →>" else "";
                let payload = "{\"channel\":\"" # jsonEsc(uid) # "\",\"unfurl_links\":false,\"text\":\"*" # jsonEsc(mrk(n.title)) # "*  —  " # jsonEsc(mrk(n.fromApp)) # link # "\"}";
                let r = await slackApi(bot.token, "https://slack.com/api/chat.postMessage", ?payload);
                if (r.ok and Text.contains(r.body, #text "\"ok\":true")) "sent (" # bot.name # ")" else "failed: " # snippet(r.body, 120);
              };
            };
            switch (Map.get(notifications, Nat.compare, id)) {
              case (?cur) Map.add(notifications, Nat.compare, id, { cur with slack = outcome });
              case null {};
            };
            if (not Text.startsWith(outcome, #text "sent")) journal("notify", "Slack DM to " # n.email # " (" # n.fromApp # "): " # outcome, Principal.fromText("2vxsx-fae"));
          };
        };
        case null {};
      };
    };
    slackBusyAt := 0;
  };

  func notifPrune() {
    let now = Time.now();
    let doomed = List.empty<Nat>();
    for ((id, n) in Map.entries(notifications)) if (now - n.at > NOTIF_RETENTION_NS) List.add(doomed, id);
    for (id in List.values(doomed)) ignore Map.delete(notifications, Nat.compare, id);
    let doomedD = List.empty<Text>();
    for ((k, t) in Map.entries(notifDedupe)) if (now - t > NOTIF_DEDUPE_NS) List.add(doomedD, k);
    for (k in List.values(doomedD)) ignore Map.delete(notifDedupe, Text.compare, k);
  };

  // ---- portal inbox (session-gated, same pattern as portalApps) ----

  public shared query ({ caller }) func myNotifications(sessionToken : Text, limit : Nat) : async { total : Nat; unread : Nat; slackDm : Bool; items : [Notification] } {
    let empty = { total = 0; unread = 0; slackDm = true; items = [] : [Notification] };
    let s = switch (portalOrSuiteSession(caller, sessionToken)) { case (?s) s; case null return empty };
    if (Time.now() > s.expiresAt or accessOf(s.email) != #active) return empty;
    var total = 0;
    var unread = 0;
    let mine = List.empty<Notification>();
    for ((_, n) in Map.entries(notifications)) {
      if (n.email == s.email) {
        total += 1;
        if (not n.read) unread += 1;
        List.add(mine, n);
      };
    };
    let arr = Array.sort<Notification>(List.toArray(mine), func(a, b) = Int.compare(b.at, a.at));
    let cap = Nat.min(if (limit == 0) 30 else Nat.min(limit, 100), arr.size());
    {
      total;
      unread;
      slackDm = switch (Map.get(notifSlackOptOut, Text.compare, s.email)) { case (?b) not b; case null true };
      items = Array.tabulate<Notification>(cap, func i { let n = arr[i]; { n with url = notificationUrl(n.url) } });
    };
  };

  /// The topbar's heartbeat (every 30 s from every open tab): who am I, how many unread, when does this token end.
  /// null = no valid session/token → the topbar shows "reconnect". Cheap: one pass over the inbox, no list.
  public shared query ({ caller }) func suiteState(token : Text) : async ?{ email : Text; displayName : Text; unread : Nat; expiresAt : Int; active : Bool; provider : Text; id : Text } {
    let s = switch (portalOrSuiteSession(caller, token)) { case (?s) s; case null return null };
    if (Time.now() > s.expiresAt) return null;
    let active = accessOf(s.email) == #active;
    var unread = 0;
    if (active) for ((_, n) in Map.entries(notifications)) if (n.email == s.email and not n.read) unread += 1;
    ?{ email = s.email; displayName = s.displayName; unread; expiresAt = s.expiresAt; active; provider = s.provider; id = pidForEmail(s.email) };
  };
  public shared ({ caller }) func markNotificationsRead(sessionToken : Text, ids : [Nat]) : async Nat {
    let s = switch (portalOrSuiteSession(caller, sessionToken)) { case (?s) s; case null return 0 };
    if (Time.now() > s.expiresAt) return 0;
    var n = 0;
    if (ids.size() == 0) {
      // empty = mark ALL mine read (snapshot ids first, then mutate)
      let mine = List.empty<Nat>();
      for ((id, x) in Map.entries(notifications)) if (x.email == s.email and not x.read) List.add(mine, id);
      for (id in List.values(mine)) {
        switch (Map.get(notifications, Nat.compare, id)) {
          case (?x) { Map.add(notifications, Nat.compare, id, { x with read = true }); n += 1 };
          case null {};
        };
      };
    } else {
      for (id in ids.vals()) {
        switch (Map.get(notifications, Nat.compare, id)) {
          case (?x) { if (x.email == s.email and not x.read) { Map.add(notifications, Nat.compare, id, { x with read = true }); n += 1 } };
          case null {};
        };
      };
    };
    n;
  };

  public shared ({ caller }) func setNotifSlackPref(sessionToken : Text, slackDm : Bool) : async Bool {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return false };
    if (Time.now() > s.expiresAt) return false;
    Map.add(notifSlackOptOut, Text.compare, s.email, not slackDm);
    true;
  };

  // ---- admin: Slack workspaces (bots) + assignment + delivery log ----

  func slackAuthProbe(token : Text) : async { ok : Bool; teamName : Text; detail : Text } {
    let r = await slackApi(token, "https://slack.com/api/auth.test", ?"{}");
    if (not r.ok) return { ok = false; teamName = ""; detail = "HTTP error: " # snippet(r.body, 120) };
    switch (Json.parse(r.body)) {
      case (#ok(j)) {
        if (jsonField(j, ["ok"]) != "true") return { ok = false; teamName = ""; detail = snippet(r.body, 160) };
        { ok = true; teamName = jsonField(j, ["team"]); detail = "" };
      };
      case (#err(_)) ({ ok = false; teamName = ""; detail = "unparseable auth.test response" });
    };
  };

  public shared ({ caller }) func addSlackBot(args : { name : Text; token : Text; signingSecret : Text }) : async { ok : Bool; id : Nat; detail : Text } {
    assert isOwnerRole(caller);
    migrateLegacySlackBot();
    if (norm(args.name) == "" or norm(args.token) == "") return { ok = false; id = 0; detail = "name and token are required" };
    let probe = await slackAuthProbe(norm(args.token));
    if (not probe.ok) return { ok = false; id = 0; detail = "token rejected by Slack: " # probe.detail };
    let id = nextSlackBotId;
    nextSlackBotId += 1;
    Map.add(slackBots, Nat.compare, id, { id; name = norm(args.name); token = norm(args.token); signingSecret = norm(args.signingSecret); teamName = probe.teamName; enabled = true });
    journal("notify", "Slack bot #" # Nat.toText(id) # " added: " # norm(args.name) # " (workspace " # probe.teamName # ")", caller);
    { ok = true; id; detail = probe.teamName };
  };

  /// Empty token/secret = keep the stored one.
  public shared ({ caller }) func updateSlackBot(id : Nat, args : { name : Text; token : Text; signingSecret : Text; enabled : Bool }) : async { ok : Bool; detail : Text } {
    assert isOwnerRole(caller);
    switch (Map.get(slackBots, Nat.compare, id)) {
      case null ({ ok = false; detail = "unknown bot" });
      case (?b) {
        var teamName = b.teamName;
        let newToken = if (norm(args.token) != "") norm(args.token) else b.token;
        if (norm(args.token) != "") {
          let probe = await slackAuthProbe(newToken);
          if (not probe.ok) return { ok = false; detail = "token rejected by Slack: " # probe.detail };
          teamName := probe.teamName;
          // token changed — user-id cache entries for this bot are stale
          let doomed = List.empty<Text>();
          for ((e, (bid, _)) in Map.entries(slackUserCache2)) if (bid == id) List.add(doomed, e);
          for (e in List.values(doomed)) ignore Map.delete(slackUserCache2, Text.compare, e);
        };
        // AUDIT FIX (H13): re-check after the await — a concurrent remove
        // must not be resurrected by this write.
        if (Map.get(slackBots, Nat.compare, id) == null) return { ok = false; detail = "bot was removed meanwhile" };
        Map.add(slackBots, Nat.compare, id, {
          id;
          name = if (norm(args.name) != "") norm(args.name) else b.name;
          token = newToken;
          signingSecret = if (norm(args.signingSecret) != "") norm(args.signingSecret) else b.signingSecret;
          teamName;
          enabled = args.enabled;
        });
        journal("notify", "Slack bot #" # Nat.toText(id) # " updated (enabled=" # (if (args.enabled) "true" else "false") # (if (norm(args.token) != "") ", token rotated" else "") # ")", caller);
        { ok = true; detail = "" };
      };
    };
  };

  public shared ({ caller }) func removeSlackBot(id : Nat) : async Bool {
    assert isOwnerRole(caller);
    ignore Map.delete(slackBots, Nat.compare, id);
    let doomed = List.empty<Text>();
    for ((e, (bid, _)) in Map.entries(slackUserCache2)) if (bid == id) List.add(doomed, e);
    for (e in List.values(doomed)) ignore Map.delete(slackUserCache2, Text.compare, e);
    journal("notify", "Slack bot #" # Nat.toText(id) # " removed", caller);
    true;
  };

  public shared ({ caller }) func setSlackDelivery(enabled : Bool) : async Bool {
    assert isOwnerRole(caller);
    migrateLegacySlackBot();
    slackEnabled := enabled;
    // AUDIT FIX (H17): disabling delivery retires the queue — re-enabling
    // days later must not fire stale DMs.
    if (not enabled) {
      let queued = List.empty<Nat>();
      for ((id, n) in Map.entries(notifications)) if (n.slack == "queued") List.add(queued, id);
      for (id in List.values(queued)) {
        switch (Map.get(notifications, Nat.compare, id)) {
          case (?n) Map.add(notifications, Nat.compare, id, { n with slack = "skipped: delivery disabled" });
          case null {};
        };
      };
    };
    journal("notify", "Slack delivery " # (if (enabled) "ENABLED" else "disabled"), caller);
    true;
  };

  public shared query ({ caller }) func listSlackBots() : async { enabled : Bool; bots : [{ id : Nat; name : Text; teamName : Text; tokenMasked : Text; hasSigning : Bool; enabled : Bool }]; assignments : [(Nat, [Nat])] } {
    assert isAdminRole(caller);
    let out = List.empty<{ id : Nat; name : Text; teamName : Text; tokenMasked : Text; hasSigning : Bool; enabled : Bool }>();
    // legacy not yet migrated? show it as a pseudo-row so the admin isn't confused
    if (slackBotToken != "" and Map.size(slackBots) == 0) {
      List.add(out, { id = 0; name = "Legacy token (will migrate on next event)"; teamName = ""; tokenMasked = maskToken(slackBotToken); hasSigning = false; enabled = true });
    };
    for ((_, b) in Map.entries(slackBots)) {
      List.add(out, { id = b.id; name = b.name; teamName = b.teamName; tokenMasked = maskToken(b.token); hasSigning = b.signingSecret != ""; enabled = b.enabled });
    };
    let asg = List.empty<(Nat, [Nat])>();
    for ((cid, bids) in Map.entries(connectorBots)) List.add(asg, (cid, bids));
    { enabled = slackEnabled; bots = List.toArray(out); assignments = List.toArray(asg) };
  };

  /// Admin smoke test per bot: sends a real DM through the full path.
  public shared ({ caller }) func testSlackBot(id : Nat, email : Text) : async { ok : Bool; detail : Text } {
    assert isOwnerRole(caller);
    migrateLegacySlackBot();
    let b = switch (Map.get(slackBots, Nat.compare, id)) { case (?b) b; case null return { ok = false; detail = "unknown bot" } };
    let e = lower(norm(email));
    journal("slack", "test DM via bot " # b.name # " to " # e, caller);
    let r = await slackApi(b.token, "https://slack.com/api/users.lookupByEmail?email=" # urlEnc(e), null);
    let uid = switch (Json.parse(r.body)) {
      case (#ok(j)) { if (jsonField(j, ["ok"]) == "true") { switch (Json.get(j, "user.id")) { case (?#string(s)) s; case (_) "" } } else "" };
      case (#err(_)) "";
    };
    if (uid == "") return { ok = false; detail = "no Slack user for " # e # " in workspace " # b.teamName };
    let p = await slackApi(b.token, "https://slack.com/api/chat.postMessage", ?("{\"channel\":\"" # jsonEsc(uid) # "\",\"text\":\"*Test notification* — User Hub delivery works (workspace " # jsonEsc(b.teamName) # ").\"}"));
    if (p.ok and Text.contains(p.body, #text "\"ok\":true")) ({ ok = true; detail = "DM sent via " # b.name }) else ({ ok = false; detail = snippet(p.body, 160) });
  };

  /// Admin: which bots a connector tool may fetch credentials for.
  public shared ({ caller }) func setConnectorBots(connectorId : Nat, botIds : [Nat]) : async Bool {
    assert isOwnerRole(caller);
    if (Map.get(connectors, Nat.compare, connectorId) == null) return false;
    Map.add(connectorBots, Nat.compare, connectorId, botIds);
    journal("notify", "connector #" # Nat.toText(connectorId) # " assigned Slack bots [" # Text.join(Iter.map<Nat, Text>(botIds.vals(), Nat.toText), ",") # "]", caller);
    true;
  };

  /// CONTRACT: a registered connector fetches its ASSIGNED Slack credentials
  /// (token + signing secret) — tools stop owning Slack config; rotation
  /// happens here once and propagates on the tools' next pull.
  public shared query ({ caller }) func hub_slackCredentials() : async [{ id : Nat; name : Text; teamName : Text; token : Text; signingSecret : Text }] {
    let conn = switch (connectorByPrincipal(caller)) { case (?c) c; case null { assert isAdmin(caller); return [] } };
    let assigned = switch (Map.get(connectorBots, Nat.compare, conn.id)) { case (?a) a; case null [] };
    let out = List.empty<{ id : Nat; name : Text; teamName : Text; token : Text; signingSecret : Text }>();
    for (bid in assigned.vals()) {
      switch (Map.get(slackBots, Nat.compare, bid)) {
        case (?b) { if (b.enabled) List.add(out, { id = b.id; name = b.name; teamName = b.teamName; token = b.token; signingSecret = b.signingSecret }) };
        case null {};
      };
    };
    List.toArray(out);
  };

  public shared query ({ caller }) func listRecentNotifications() : async [Notification] {
    assert isAdmin(caller);
    let arr = Array.sort<Notification>(Iter.toArray(Iter.map<(Nat, Notification), Notification>(Map.entries(notifications), func(kv) = kv.1)), func(a, b) = Int.compare(b.at, a.at));
    Array.tabulate<Notification>(Nat.min(100, arr.size()), func i = arr[i]);
  };

  // ---------- ICP chart proxy — RETIRED ----------
  public shared func icpChart() : async { src : Text; body : Text } {
    // Retired 2026-09-02 with the portal price hero: the hub makes no third-party
    // calls for decoration. Kept as an empty stub so old clients do not trap.
    { src = ""; body = "" };
  };

  // ---------- dashboard ----------

  public shared query ({ caller }) func stats() : async {
    users : Nat;
    active : Nat;
    inactive : Nat;
    connections : Nat;
    connectors : Nat;
    hookEvents : Nat;
    lastHookAt : ?Int;
    autoSyncSecs : Nat;
  } {
    assert isAdmin(caller);
    var total = 0;
    var act = 0;
    for ((_, u) in Map.entries(users)) {
      total += 1;
      if (effActive(u)) act += 1;
    };
    {
      users = total;
      active = act;
      inactive = total - act;
      connections = Map.size(conns);
      connectors = Map.size(connectors);
      hookEvents;
      lastHookAt;
      autoSyncSecs;
    };
  };

  // =====================================================================
  // ACCESS GOVERNANCE — who may use what, for how long, and who checks.
  //   · app owners      the people who answer for an app; reviews land with them
  //   · temporary access a grant puts a person on an app's people list or
  //                      into a group and takes them off again when it ends
  //   · access requests  people ask from their menu; hub admins decide, with a duration
  //   · access reviews   a snapshot of who may use an app; the owner keeps or
  //                      removes every entry; a removal is effective at once
  // Everything here edits the existing access policy and groups, so every
  // gate (tickets, OIDC, directory, notifications) follows automatically.
  // Design: docs/GOVERNANCE.md
  // =====================================================================

  let connectorOwners : Map.Map<Nat, [Text]> = Map.empty<Nat, [Text]>(); // cid -> owner e-mails
  func ownersOf(cid : Nat) : [Text] = switch (Map.get(connectorOwners, Nat.compare, cid)) { case (?o) o; case null [] };

  public type Grant = {
    id : Nat;
    email : Text;
    target : Text; // "app:<cid>" | "group:<gid>"
    targetName : Text; // journal-stable label
    reason : Text;
    grantedBy : Text;
    grantedAt : Int;
    expiresAt : Int; // 0 = until revoked
    state : Text; // active | expired | revoked
    endedAt : Int;
    endedBy : Text;
  };
  let grants : Map.Map<Nat, Grant> = Map.empty<Nat, Grant>();
  var nextGrantId : Nat = 1;

  public type AccessRequest = {
    id : Nat;
    email : Text;
    cid : Nat;
    appName : Text;
    reason : Text;
    wantedHours : Nat; // 0 = no end date
    at : Int;
    state : Text; // open | approved | denied | withdrawn
    decidedBy : Text;
    decidedAt : Int;
    note : Text;
    grantId : Nat; // 0 = none
  };
  let accessRequests : Map.Map<Nat, AccessRequest> = Map.empty<Nat, AccessRequest>();
  var nextAccessRequestId : Nat = 1;

  public type Review = { id : Nat; name : Text; startedBy : Text; startedAt : Int; dueAt : Int; state : Text; closedAt : Int; apps : [Nat] };
  public type ReviewItem = {
    id : Nat;
    reviewId : Nat;
    cid : Nat;
    appName : Text;
    subject : Text; // person:<email> | group:<name> | role:<role> | everyone
    detail : Text; // display name, "12 members", …
    reviewers : [Text]; // app owners when the review started; [] = hub admins
    decision : Text; // "" | keep | remove
    decidedBy : Text;
    decidedAt : Int;
    note : Text;
    applied : Text; // what a removal changed
  };
  let reviews : Map.Map<Nat, Review> = Map.empty<Nat, Review>();
  let reviewItems : Map.Map<Nat, ReviewItem> = Map.empty<Nat, ReviewItem>();
  var nextReviewId : Nat = 1;
  var nextReviewItemId : Nat = 1;

  transient let GOV_MAX_HOURS : Nat = 24 * 366;
  transient let GOV_TEXT_MAX : Nat = 300;
  transient let GOV_KEEP_NS : Int = 365 * 24 * 3600 * 1_000_000_000; // ended grants / decided requests are pruned after a year
  transient let HOUR_NS : Int = 3600 * 1_000_000_000;

  // ---- small helpers ----
  func nameOfEmail(email : Text) : Text {
    var name = email;
    for ((_, u) in Map.entries(users)) if (u.email == email and u.displayName != "") name := u.displayName;
    name;
  };
  /// who acted — the linked person's e-mail, else the principal
  func actorLabel(caller : Principal) : Text = switch (Map.get(principalLinks, Principal.compare, caller)) { case (?e) e; case null Principal.toText(caller) };
  func adminEmails() : [Text] {
    let out = List.empty<Text>();
    for ((e, r) in Map.entries(personRoles)) if ((r == "owner" or r == "admin") and accessOf(e) == #active) List.add(out, e);
    List.toArray(out);
  };
  func hubLink<system>(hash : Text) : Text { let b = oidcFrontendBase<system>(); if (b == "") "" else b # "/#/" # hash };
  func govSession(caller : Principal, tok : Text) : ?Session {
    switch (portalSession(caller, tok)) {
      case (?s) { if (Time.now() > s.expiresAt or accessOf(s.email) != #active) null else ?s };
      case null null;
    };
  };
  func pad2(n : Nat) : Text = if (n < 10) "0" # Nat.toText(n) else Nat.toText(n);
  /// "2026-09-03 14:05 UTC" from nanoseconds (civil-from-days, H. Hinnant)
  func whenText(ns : Int) : Text {
    if (ns <= 0) return "";
    let secs = Int.abs(ns / 1_000_000_000);
    let days = secs / 86400;
    let rem = secs % 86400;
    let z = days + 719468;
    let era = z / 146097;
    let doe = z % 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    let y = yoe + era * 400 + (if (m <= 2) 1 else 0);
    Nat.toText(y) # "-" # pad2(m) # "-" # pad2(d) # " " # pad2(rem / 3600) # ":" # pad2((rem % 3600) / 60) # " UTC";
  };
  func durationText(hours : Nat) : Text {
    if (hours == 0) "until it is taken away again" else if (hours < 48) "for " # Nat.toText(hours) # " hours" else "for " # Nat.toText(hours / 24) # " days";
  };
  func csvCell(t : Text) : Text {
    // spreadsheet-safe: no formula start, quotes doubled
    let s = Text.replace(t, #text "\"", "\"\"");
    let guarded = if (Text.startsWith(s, #char '=') or Text.startsWith(s, #char '+') or Text.startsWith(s, #char '-') or Text.startsWith(s, #char '@')) "'" # s else s;
    "\"" # guarded # "\"";
  };

  /// A hub-made notification: same bell and Slack lane as hub_notify, without the per-app population gate.
  func notifyLocal<system>(email : Text, title : Text, url : Text, kind : Text, dedupeKey : Text) {
    if (accessOf(email) != #active) return;
    let now = Time.now();
    if (dedupeKey != "") {
      let dk = "0:" # dedupeKey;
      switch (Map.get(notifDedupe, Text.compare, dk)) { case (?t) { if (now - t < NOTIF_DEDUPE_NS) return }; case null {} };
      Map.add(notifDedupe, Text.compare, dk, now);
    };
    notifCapUser(email);
    migrateLegacySlackBot();
    let optedOut = switch (Map.get(notifSlackOptOut, Text.compare, email)) { case (?b) b; case null false };
    let slackState = if (not slackEnabled or enabledBotsSnapshot().size() == 0) "off" else if (optedOut) "skipped: user opted out" else "queued";
    let id = nextNotifId;
    nextNotifId += 1;
    Map.add(notifications, Nat.compare, id, { id; email; fromApp = "hub"; title; url; kind; at = now; read = false; slack = slackState });
    if (slackState == "queued") ignore Timer.setTimer<system>(#seconds 1, deliverSlack);
  };

  // ---- policy / group edits (return true when something changed) ----
  func policyAddPerson(cid : Nat, email : Text) : Bool {
    if (appPermissionPolicies.containsKey(cid)) return false;
    let p = policyOf(cid);
    for (x in p.people.vals()) if (x == email) return false;
    Map.add(connectorAccess, Nat.compare, cid, { p with people = Array.concat(p.people, [email]) });
    true;
  };
  func policyRemovePerson(cid : Nat, email : Text) : Bool {
    if (appPermissionPolicies.containsKey(cid)) return false;
    let p = switch (connectorAccess.get(cid)) { case (?p) p; case null return false };
    let kept = Array.filter<Text>(p.people, func(x) = x != email);
    if (kept.size() == p.people.size()) return false;
    Map.add(connectorAccess, Nat.compare, cid, { p with people = kept });
    true;
  };
  func policyRemoveGroup(cid : Nat, name : Text) : Bool {
    if (appPermissionPolicies.containsKey(cid)) return false;
    let p = policyOf(cid);
    let kept = Array.filter<Text>(p.groups, func(x) = lower(x) != lower(name));
    if (kept.size() == p.groups.size()) return false;
    Map.add(connectorAccess, Nat.compare, cid, { p with groups = kept });
    true;
  };
  func policyRemoveRole(cid : Nat, role : Text) : Bool {
    if (appPermissionPolicies.containsKey(cid)) return false;
    let p = policyOf(cid);
    let kept = Array.filter<Text>(p.roles, func(x) = x != role);
    if (kept.size() == p.roles.size()) return false;
    Map.add(connectorAccess, Nat.compare, cid, { p with roles = kept });
    true;
  };
  func groupAddMember(gid : Nat, email : Text) : Bool {
    switch (Map.get(groups, Nat.compare, gid)) {
      case null false;
      case (?g) {
        for (m in g.members.vals()) if (m == email) return false;
        Map.add(groups, Nat.compare, gid, { g with members = Array.concat(g.members, [email]) });
        true;
      };
    };
  };
  func groupRemoveMember(gid : Nat, email : Text) : Bool {
    switch (Map.get(groups, Nat.compare, gid)) {
      case null false;
      case (?g) {
        let kept = Array.filter<Text>(g.members, func(m) = m != email);
        if (kept.size() == g.members.size()) return false;
        Map.add(groups, Nat.compare, gid, { g with members = kept });
        true;
      };
    };
  };

  // ---- app owners ----
  /// Who answers for an app (max 5). Reviews of this app land with them; without owners they land with the hub admins.
  public shared ({ caller }) func setConnectorOwners(cid : Nat, owners : [Text]) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    let c = switch (Map.get(connectors, Nat.compare, cid)) { case (?c) c; case null return { ok = false; detail = "no such app" } };
    if (owners.size() > 5) return { ok = false; detail = "max 5 owners" };
    let clean = normMembers(owners);
    if (clean.size() < owners.size()) return { ok = false; detail = "every owner must be a person in the directory" };
    if (clean.size() == 0) ignore Map.delete(connectorOwners, Nat.compare, cid) else Map.add(connectorOwners, Nat.compare, cid, clean);
    journal("access", "owners of " # c.name # " set to " # (if (clean.size() == 0) "nobody (hub admins)" else Text.join(clean.vals(), ", ")), caller);
    { ok = true; detail = "" };
  };

  // ---- temporary access ----
  func parseTarget(target : Text) : ?{ #app : Nat; #group : Nat } {
    switch (Text.stripStart(target, #text "app:")) {
      case (?n) { switch (Nat.fromText(n)) { case (?v) ?#app(v); case null null } };
      case null {
        switch (Text.stripStart(target, #text "group:")) {
          case (?n) { switch (Nat.fromText(n)) { case (?v) ?#group(v); case null null } };
          case null null;
        };
      };
    };
  };
  func targetLabel(t : { #app : Nat; #group : Nat }) : Text {
    switch (t) {
      case (#app cid) { switch (Map.get(connectors, Nat.compare, cid)) { case (?c) c.name; case null "app #" # Nat.toText(cid) } };
      case (#group gid) { switch (Map.get(groups, Nat.compare, gid)) { case (?g) "group " # g.name; case null "group #" # Nat.toText(gid) } };
    };
  };
  /// Creates and applies a grant. Shared by the admin form and by approved requests.
  func grantCreate<system>(email : Text, target : Text, hours : Nat, reason : Text, by : Text, byP : Principal) : { ok : Bool; detail : Text; id : Nat } {
    let e = lower(norm(email));
    if (accessOf(e) != #active) return { ok = false; detail = "that person is not an active member of the directory"; id = 0 };
    if (hours > GOV_MAX_HOURS) return { ok = false; detail = "max 366 days"; id = 0 };
    if (reason.size() > GOV_TEXT_MAX) return { ok = false; detail = "reason too long (max 300)"; id = 0 };
    let t = switch (parseTarget(target)) { case (?t) t; case null return { ok = false; detail = "target must be app:<id> or group:<id>"; id = 0 } };
    for ((_, g) in Map.entries(grants)) if (g.state == "active" and g.email == e and g.target == target) return { ok = false; detail = "an active grant for this person and target exists — revoke it first"; id = 0 };
    switch (t) {
      case (#app cid) {
        if (appPermissionPolicies.containsKey(cid)) return { ok = false; detail = "Manage this app under Hub Permissions"; id = 0 };
        if (not Map.containsKey(connectors, Nat.compare, cid)) return { ok = false; detail = "no such app"; id = 0 };
        if (policyOf(cid).mode != "selected") return { ok = false; detail = "everyone may use this app already — switch it to selected people first (Apps → Edit → who may use it)"; id = 0 };
        if (policyAllows(cid, e)) return { ok = false; detail = "this person already has access (by name, group or role)"; id = 0 };
        ignore policyAddPerson(cid, e);
      };
      case (#group gid) {
        if (permissionBearingGroup(gid) and not isOwnerRole(byP)) return { ok = false; detail = "This group grants app roles; only Hub owners may change its membership"; id = 0 };
        if (not Map.containsKey(groups, Nat.compare, gid)) return { ok = false; detail = "no such group"; id = 0 };
        if (not groupEditable(gid)) return { ok = false; detail = "membership of this group is managed by your IdP via SCIM"; id = 0 };
        if (not groupAddMember(gid, e)) return { ok = false; detail = "already a member of this group"; id = 0 };
      };
    };
    let now = Time.now();
    let id = nextGrantId;
    nextGrantId += 1;
    let name = targetLabel(t);
    let g : Grant = { id; email = e; target; targetName = name; reason = norm(reason); grantedBy = by; grantedAt = now; expiresAt = (if (hours == 0) 0 else now + hours * HOUR_NS); state = "active"; endedAt = 0; endedBy = "" };
    Map.add(grants, Nat.compare, id, g);
    journal("access", "access to " # name # " given to " # e # " " # durationText(hours) # (if (g.reason != "") " — " # g.reason else ""), byP);
    notifyLocal<system>(e, "You now have access to " # name # (if (hours == 0) "" else " " # durationText(hours)), hubLink<system>("portal"), "access.granted", "grant-" # Nat.toText(id));
    { ok = true; detail = (if (hours == 0) "" else "ends " # whenText(g.expiresAt)); id };
  };
  /// Undo what a grant did. Idempotent — the person may have been removed by hand already.
  func grantRelease(g : Grant) : Text {
    switch (parseTarget(g.target)) {
      case (?#app cid) { if (policyRemovePerson(cid, g.email)) "" else " (was no longer on the list)" };
      case (?#group gid) { if (groupRemoveMember(gid, g.email)) "" else " (was no longer a member)" };
      case null "";
    };
  };
  func endGrant<system>(id : Nat, state : Text, by : Text, byP : Principal, notify : Bool) {
    switch (Map.get(grants, Nat.compare, id)) {
      case (?g) {
        if (g.state != "active") return;
        let d = grantRelease(g);
        let now = Time.now();
        Map.add(grants, Nat.compare, id, { g with state; endedAt = now; endedBy = by });
        journal("access", "access of " # g.email # " to " # g.targetName # (if (state == "expired") " ended" else " revoked by " # by) # d, byP);
        if (notify) notifyLocal<system>(g.email, "Your access to " # g.targetName # (if (state == "expired") " has ended" else " was taken away"), "", "access." # state, "grant-" # Nat.toText(id) # "-" # state);
      };
      case null {};
    };
  };

  /// Give a person access to an app (people list) or a group for a while. hours 0 = until revoked.
  public shared ({ caller }) func grantAccess(args : { email : Text; target : Text; hours : Nat; reason : Text }) : async { ok : Bool; detail : Text; id : Nat } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only"; id = 0 };
    grantCreate<system>(args.email, args.target, args.hours, args.reason, actorLabel(caller), caller);
  };
  public shared ({ caller }) func revokeGrant(id : Nat) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    switch (Map.get(grants, Nat.compare, id)) {
      case null ({ ok = false; detail = "no such grant" });
      case (?g) {
        switch (parseTarget(g.target)) { case (?#group gid) { if (permissionBearingGroup(gid) and not isOwnerRole(caller)) return { ok = false; detail = "Only Hub owners change membership of app-role groups" } }; case _ {} };
        if (g.state != "active") return { ok = false; detail = "already " # g.state };
        endGrant<system>(id, "revoked", actorLabel(caller), caller, true);
        { ok = true; detail = "" };
      };
    };
  };
  /// Newest first; activeOnly = the ones still in force. Capped at 300.
  public shared query ({ caller }) func listGrants(activeOnly : Bool) : async [Grant] {
    assert isAdmin(caller);
    let out = List.empty<Grant>();
    for ((_, g) in Map.entries(grants)) if (not activeOnly or g.state == "active") List.add(out, g);
    let arr = List.toArray(out);
    let sorted = Array.sort<Grant>(arr, func(a, b) = Int.compare(b.grantedAt, a.grantedAt));
    Array.tabulate<Grant>(Nat.min(sorted.size(), 300), func i = sorted[i]);
  };
  /// What a person may ask for or be given: apps with a people-based rule they are not in yet, and editable groups.
  public shared query ({ caller }) func grantTargets(email : Text) : async { apps : [{ cid : Nat; name : Text }]; groups : [{ gid : Nat; name : Text }] } {
    assert isAdmin(caller);
    let e = lower(norm(email));
    let apps = List.empty<{ cid : Nat; name : Text }>();
    for ((cid, c) in Map.entries(connectors)) if (not appPermissionPolicies.containsKey(cid) and policyOf(cid).mode == "selected" and not policyAllows(cid, e)) List.add(apps, { cid; name = c.name });
    let gs = List.empty<{ gid : Nat; name : Text }>();
    for ((gid, g) in Map.entries(groups)) {
      var member = false;
      for (m in g.members.vals()) if (m == e) member := true;
      if (groupEditable(gid) and (not permissionBearingGroup(gid) or isOwnerRole(caller)) and not member) List.add(gs, { gid; name = g.name });
    };
    { apps = List.toArray(apps); groups = List.toArray(gs) };
  };

  /// Runs from the 5-minute tick: ends grants that are due, prunes old records.
  func governanceSweep<system>() {
    let now = Time.now();
    let due = List.empty<Nat>();
    for ((id, g) in Map.entries(grants)) if (g.state == "active" and g.expiresAt != 0 and g.expiresAt <= now) List.add(due, id);
    for (id in List.values(due)) endGrant<system>(id, "expired", "time", Principal.fromActor(UserHub), true);
    let oldG = List.empty<Nat>();
    for ((id, g) in Map.entries(grants)) if (g.state != "active" and now - g.endedAt > GOV_KEEP_NS) List.add(oldG, id);
    for (id in List.values(oldG)) ignore Map.delete(grants, Nat.compare, id);
    let oldR = List.empty<Nat>();
    for ((id, r) in Map.entries(accessRequests)) if (r.state != "open" and now - r.decidedAt > GOV_KEEP_NS) List.add(oldR, id);
    for (id in List.values(oldR)) ignore Map.delete(accessRequests, Nat.compare, id);
  };
  /// Called when an app or group disappears: its grants end, its open requests are withdrawn.
  func governanceForget<system>(target : Text, cid : Nat) {
    let ids = List.empty<Nat>();
    for ((id, g) in Map.entries(grants)) if (g.state == "active" and g.target == target) List.add(ids, id);
    for (id in List.values(ids)) {
      switch (Map.get(grants, Nat.compare, id)) { case (?g) Map.add(grants, Nat.compare, id, { g with state = "revoked"; endedAt = Time.now(); endedBy = "target removed" }); case null {} };
    };
    if (cid != 0) {
      ignore Map.delete(connectorOwners, Nat.compare, cid);
      let rs = List.empty<Nat>();
      for ((id, r) in Map.entries(accessRequests)) if (r.state == "open" and r.cid == cid) List.add(rs, id);
      for (id in List.values(rs)) {
        switch (Map.get(accessRequests, Nat.compare, id)) { case (?r) Map.add(accessRequests, Nat.compare, id, { r with state = "withdrawn"; decidedBy = "app removed"; decidedAt = Time.now() }); case null {} };
      };
    };
  };

  // ---- access requests (from the menu) ----
  /// Apps this person could ask for: a people-based rule they are not in, in their part of the company, on the menu.
  public shared query ({ caller }) func requestableApps(sessionToken : Text) : async [{ cid : Nat; name : Text; note : Text; openRequest : Bool }] {
    let s = switch (govSession(caller, sessionToken)) { case (?s) s; case null return [] };
    let out = List.empty<{ cid : Nat; name : Text; note : Text; openRequest : Bool }>();
    for ((cid, c) in Map.entries(connectors)) {
      if (not appPermissionPolicies.containsKey(cid) and policyOf(cid).mode == "selected" and not policyAllows(cid, s.email) and accessOfScoped(s.email, scopeOf(cid)) == #active) {
        var hidden = false;
        var hasTile = false;
        for ((tid, tc) in Map.entries(appLinkConnectors)) if (tc == cid) { hasTile := true; if (tileHidden(tid)) hidden := true };
        if (not (hasTile and hidden)) {
          var open = false;
          for ((_, r) in Map.entries(accessRequests)) if (r.state == "open" and r.email == s.email and r.cid == cid) open := true;
          List.add(out, { cid; name = c.name; note = c.note; openRequest = open });
        };
      };
    };
    Array.sort<{ cid : Nat; name : Text; note : Text; openRequest : Bool }>(List.toArray(out), func(a, b) = Text.compare(lower(a.name), lower(b.name)));
  };
  /// Ask for access. wantedHours 0 = no end date. Hub admins are notified.
  public shared ({ caller }) func requestAccess(sessionToken : Text, cid : Nat, reason : Text, wantedHours : Nat) : async { ok : Bool; detail : Text; id : Nat } {
    if (appPermissionPolicies.containsKey(cid)) return { ok = false; detail = "Ask a Hub owner to assign your app role in Permissions"; id = 0 };
    let s = switch (govSession(caller, sessionToken)) { case (?s) s; case null return { ok = false; detail = "no session"; id = 0 } };
    let c = switch (Map.get(connectors, Nat.compare, cid)) { case (?c) c; case null return { ok = false; detail = "no such app"; id = 0 } };
    if (policyOf(cid).mode != "selected") return { ok = false; detail = "everyone may use this app already"; id = 0 };
    if (policyAllows(cid, s.email)) return { ok = false; detail = "you already have access"; id = 0 };
    if (accessOfScoped(s.email, scopeOf(cid)) != #active) return { ok = false; detail = "this app is not available to your part of the company"; id = 0 };
    let r = norm(reason);
    if (r.size() > GOV_TEXT_MAX) return { ok = false; detail = "reason too long (max 300)"; id = 0 };
    if (wantedHours > GOV_MAX_HOURS) return { ok = false; detail = "max 366 days"; id = 0 };
    var mine = 0;
    for ((_, q) in Map.entries(accessRequests)) if (q.state == "open" and q.email == s.email) { mine += 1; if (q.cid == cid) return { ok = false; detail = "you already asked — waiting for a decision"; id = 0 } };
    if (mine >= 10) return { ok = false; detail = "too many open requests"; id = 0 };
    let id = nextAccessRequestId;
    nextAccessRequestId += 1;
    Map.add(accessRequests, Nat.compare, id, { id; email = s.email; cid; appName = c.name; reason = r; wantedHours; at = Time.now(); state = "open"; decidedBy = ""; decidedAt = 0; note = ""; grantId = 0 });
    journal("access", s.email # " asked for access to " # c.name # " " # durationText(wantedHours) # (if (r != "") " — " # r else ""), caller);
    let link = hubLink<system>("access/requests");
    for (a in adminEmails().vals()) notifyLocal<system>(a, nameOfEmail(s.email) # " asks for access to " # c.name, link, "access.request", "req-" # Nat.toText(id) # "-" # a);
    { ok = true; detail = "sent to your hub admins"; id };
  };
  public shared ({ caller }) func withdrawAccessRequest(sessionToken : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let s = switch (govSession(caller, sessionToken)) { case (?s) s; case null return { ok = false; detail = "no session" } };
    switch (Map.get(accessRequests, Nat.compare, id)) {
      case (?r) {
        if (r.email != s.email) return { ok = false; detail = "not your request" };
        if (r.state != "open") return { ok = false; detail = "already " # r.state };
        Map.add(accessRequests, Nat.compare, id, { r with state = "withdrawn"; decidedBy = s.email; decidedAt = Time.now() });
        { ok = true; detail = "" };
      };
      case null ({ ok = false; detail = "no such request" });
    };
  };
  /// The caller's own requests, newest first (20).
  public shared query ({ caller }) func myAccessRequests(sessionToken : Text) : async [AccessRequest] {
    let s = switch (govSession(caller, sessionToken)) { case (?s) s; case null return [] };
    let out = List.empty<AccessRequest>();
    for ((_, r) in Map.entries(accessRequests)) if (r.email == s.email) List.add(out, r);
    let sorted = Array.sort<AccessRequest>(List.toArray(out), func(a, b) = Int.compare(b.at, a.at));
    Array.tabulate<AccessRequest>(Nat.min(sorted.size(), 20), func i = sorted[i]);
  };
  /// Admin view: open requests first-in-first-out, or the history newest first (300).
  public shared query ({ caller }) func listAccessRequests(openOnly : Bool) : async [AccessRequest] {
    assert isAdmin(caller);
    let out = List.empty<AccessRequest>();
    for ((_, r) in Map.entries(accessRequests)) if (not openOnly or r.state == "open") List.add(out, r);
    let arr = List.toArray(out);
    let sorted = if (openOnly) Array.sort<AccessRequest>(arr, func(a, b) = Int.compare(a.at, b.at)) else Array.sort<AccessRequest>(arr, func(a, b) = Int.compare(b.at, a.at));
    Array.tabulate<AccessRequest>(Nat.min(sorted.size(), 300), func i = sorted[i]);
  };
  /// Approve (with the asked-for or an overriding duration) or deny. The person is told either way.
  public shared ({ caller }) func decideAccessRequest(id : Nat, approve : Bool, hours : ?Nat, note : Text) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    let r = switch (Map.get(accessRequests, Nat.compare, id)) { case (?r) r; case null return { ok = false; detail = "no such request" } };
    if (r.state != "open") return { ok = false; detail = "already " # r.state };
    if (note.size() > GOV_TEXT_MAX) return { ok = false; detail = "note too long (max 300)" };
    let by = actorLabel(caller);
    let now = Time.now();
    if (not approve) {
      Map.add(accessRequests, Nat.compare, id, { r with state = "denied"; decidedBy = by; decidedAt = now; note = norm(note) });
      journal("access", "request of " # r.email # " for " # r.appName # " denied" # (if (norm(note) != "") " — " # norm(note) else ""), caller);
      notifyLocal<system>(r.email, "Your request for " # r.appName # " was not approved" # (if (norm(note) != "") ": " # norm(note) else ""), "", "access.denied", "req-" # Nat.toText(id) # "-denied");
      return { ok = true; detail = "" };
    };
    let h = switch (hours) { case (?h) h; case null r.wantedHours };
    let g = grantCreate<system>(r.email, "app:" # Nat.toText(r.cid), h, cutText("request #" # Nat.toText(id) # (if (r.reason != "") ": " # r.reason else ""), GOV_TEXT_MAX), by, caller);
    if (not g.ok) {
      // only "already has access" closes the request without a grant; any other failure (bad hours, everyone-policy, …) leaves it OPEN and tells the admin why
      if (Text.startsWith(g.detail, #text "this person already has access") or Text.startsWith(g.detail, #text "an active grant for this person")) {
        Map.add(accessRequests, Nat.compare, id, { r with state = "approved"; decidedBy = by; decidedAt = now; note = "no grant needed: " # g.detail });
        return { ok = true; detail = "approved — " # g.detail };
      };
      return { ok = false; detail = g.detail };
    };
    Map.add(accessRequests, Nat.compare, id, { r with state = "approved"; decidedBy = by; decidedAt = now; note = norm(note); grantId = g.id });
    { ok = true; detail = g.detail };
  };

  // ---- access reviews ----
  func reviewCounts(rid : Nat) : { items : Nat; decided : Nat; removed : Nat; overdue : Bool } {
    var items = 0; var decided = 0; var removed = 0;
    for ((_, it) in Map.entries(reviewItems)) if (it.reviewId == rid) { items += 1; if (it.decision != "") decided += 1; if (it.decision == "remove") removed += 1 };
    let overdue = switch (Map.get(reviews, Nat.compare, rid)) { case (?r) r.state == "open" and Time.now() > r.dueAt; case null false };
    { items; decided; removed; overdue };
  };
  /// Start a review: one line per rule entry of every chosen app, frozen now. Owners (or the hub admins) are told.
  public shared ({ caller }) func startReview(args : { name : Text; apps : [Nat]; dueDays : Nat }) : async { ok : Bool; detail : Text; id : Nat; items : Nat } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only"; id = 0; items = 0 };
    let name = norm(args.name);
    if (name == "" or name.size() > 80) return { ok = false; detail = "name: 1–80 characters"; id = 0; items = 0 };
    if (args.apps.size() == 0 or args.apps.size() > 100) return { ok = false; detail = "pick 1–100 apps"; id = 0; items = 0 };
    if (args.apps.any(func cid = appPermissionPolicies.containsKey(cid))) return { ok = false; detail = "Review centrally managed apps in Hub Permissions"; id = 0; items = 0 };
    if (args.dueDays == 0 or args.dueDays > 90) return { ok = false; detail = "due in 1–90 days"; id = 0; items = 0 };
    for (cid in args.apps.vals()) if (not Map.containsKey(connectors, Nat.compare, cid)) return { ok = false; detail = "no such app #" # Nat.toText(cid); id = 0; items = 0 };
    var open = 0;
    for ((_, r) in Map.entries(reviews)) if (r.state == "open") open += 1;
    if (open >= 20) return { ok = false; detail = "close some open reviews first (max 20)"; id = 0; items = 0 };
    let now = Time.now();
    let rid = nextReviewId;
    nextReviewId += 1;
    let by = actorLabel(caller);
    Map.add(reviews, Nat.compare, rid, { id = rid; name; startedBy = by; startedAt = now; dueAt = now + args.dueDays * 24 * HOUR_NS; state = "open"; closedAt = 0; apps = args.apps });
    var n = 0;
    let told = Map.empty<Text, Nat>(); // reviewer -> items
    func addItem(cid : Nat, appName : Text, subject : Text, detail : Text, reviewers : [Text]) {
      let iid = nextReviewItemId;
      nextReviewItemId += 1;
      Map.add(reviewItems, Nat.compare, iid, { id = iid; reviewId = rid; cid; appName; subject; detail; reviewers; decision = ""; decidedBy = ""; decidedAt = 0; note = ""; applied = "" });
      n += 1;
      for (rv in reviewers.vals()) Map.add(told, Text.compare, rv, (switch (Map.get(told, Text.compare, rv)) { case (?k) k + 1; case null 1 }));
    };
    for (cid in args.apps.vals()) {
      switch (Map.get(connectors, Nat.compare, cid)) {
        case null {};
        case (?c) {
          let owners = Array.filter<Text>(ownersOf(cid), func(o) = accessOf(o) == #active);
          let p = policyOf(cid);
          if (p.mode != "selected") {
            let pv = previewWith(cid, p);
            addItem(cid, c.name, "everyone", "everyone in scope — " # Nat.toText(pv.count) # " people today", owners);
          } else {
            for (e in p.people.vals()) addItem(cid, c.name, "person:" # e, nameOfEmail(e) # (if (accessOf(e) != #active) " · not active" else ""), owners);
            for (gn in p.groups.vals()) {
              let members = switch (groupByName(gn)) { case (?g) Nat.toText(g.members.size()) # " members"; case null "group no longer exists" };
              addItem(cid, c.name, "group:" # gn, members, owners);
            };
            for (r in p.roles.vals()) addItem(cid, c.name, "role:" # r, "everyone with hub role " # r, owners);
          };
        };
      };
    };
    journal("access", "review \"" # name # "\" started: " # Nat.toText(args.apps.size()) # " apps, " # Nat.toText(n) # " entries, due " # whenText(now + args.dueDays * 24 * HOUR_NS), caller);
    let link = hubLink<system>("portal");
    for ((rv, k) in Map.entries(told)) notifyLocal<system>(rv, "Access review \"" # name # "\": " # Nat.toText(k) # " entries to check by " # whenText(now + args.dueDays * 24 * HOUR_NS), link, "access.review", "rev-" # Nat.toText(rid) # "-" # rv);
    var unowned = 0;
    for ((_, it) in Map.entries(reviewItems)) if (it.reviewId == rid and it.reviewers.size() == 0) unowned += 1;
    if (unowned > 0) for (a in adminEmails().vals()) notifyLocal<system>(a, "Access review \"" # name # "\": " # Nat.toText(unowned) # " entries without an app owner land with you", hubLink<system>("access/reviews"), "access.review", "rev-" # Nat.toText(rid) # "-admin-" # a);
    { ok = true; detail = Nat.toText(n) # " entries"; id = rid; items = n };
  };
  public shared query ({ caller }) func listReviews() : async [{ review : Review; items : Nat; decided : Nat; removed : Nat; overdue : Bool }] {
    assert isAdmin(caller);
    let out = List.empty<{ review : Review; items : Nat; decided : Nat; removed : Nat; overdue : Bool }>();
    for ((rid, r) in Map.entries(reviews)) { let k = reviewCounts(rid); List.add(out, { review = r; items = k.items; decided = k.decided; removed = k.removed; overdue = k.overdue }) };
    Array.sort<{ review : Review; items : Nat; decided : Nat; removed : Nat; overdue : Bool }>(List.toArray(out), func(a, b) = Int.compare(b.review.startedAt, a.review.startedAt));
  };
  public shared query ({ caller }) func listReviewItems(reviewId : Nat) : async [ReviewItem] {
    assert isAdmin(caller);
    let out = List.empty<ReviewItem>();
    for ((_, it) in Map.entries(reviewItems)) if (it.reviewId == reviewId) List.add(out, it);
    Array.sort<ReviewItem>(List.toArray(out), func(a, b) = Nat.compare(a.id, b.id));
  };
  /// The named reviewers; entries without an app owner belong to the hub owners/admins.
  func isReviewerOf(it : ReviewItem, email : Text) : Bool {
    for (rv in it.reviewers.vals()) if (rv == email) return true;
    if (it.reviewers.size() == 0) { let r = hubRoleOf(email); return r == "owner" or r == "admin" };
    false;
  };
  /// What the signed-in person has to decide: undecided entries of open reviews where they are the reviewer.
  public shared query ({ caller }) func myReviewItems(sessionToken : Text) : async [{ item : ReviewItem; reviewName : Text; dueAt : Int }] {
    let s = switch (govSession(caller, sessionToken)) { case (?s) s; case null return [] };
    let out = List.empty<{ item : ReviewItem; reviewName : Text; dueAt : Int }>();
    for ((_, it) in Map.entries(reviewItems)) {
      if (it.decision == "" and isReviewerOf(it, s.email)) {
        switch (Map.get(reviews, Nat.compare, it.reviewId)) {
          case (?r) { if (r.state == "open") List.add(out, { item = it; reviewName = r.name; dueAt = r.dueAt }) };
          case null {};
        };
      };
    };
    Array.sort<{ item : ReviewItem; reviewName : Text; dueAt : Int }>(List.toArray(out), func(a, b) = Nat.compare(a.item.id, b.item.id));
  };
  /// keep or remove. Remove is effective at once: the entry leaves the app's rule (a person also loses a running grant).
  public shared ({ caller }) func decideReviewItem(sessionToken : Text, itemId : Nat, decision : Text, note : Text) : async { ok : Bool; detail : Text } {
    let email = switch (govSession(caller, sessionToken)) { case (?s) s.email; case null { if (isAdminRole(caller)) actorLabel(caller) else return { ok = false; detail = "no session" } } };
    let it = switch (Map.get(reviewItems, Nat.compare, itemId)) { case (?it) it; case null return { ok = false; detail = "no such entry" } };
    let rv = switch (Map.get(reviews, Nat.compare, it.reviewId)) { case (?r) r; case null return { ok = false; detail = "no such review" } };
    if (rv.state != "open") return { ok = false; detail = "this review is closed" };
    if (it.decision != "") return { ok = false; detail = "already decided: " # it.decision };
    if (not isReviewerOf(it, email) and not isAdminRole(caller)) return { ok = false; detail = "you are not the reviewer of this entry" };
    if (decision != "keep" and decision != "remove") return { ok = false; detail = "decision must be keep or remove" };
    if (note.size() > GOV_TEXT_MAX) return { ok = false; detail = "note too long (max 300)" };
    var applied = "";
    if (decision == "remove") {
      if (it.subject == "everyone") return { ok = false; detail = "an everyone-rule can only be confirmed here — to restrict the app, switch it to selected people under Apps → Edit → who may use it" };
      switch (Text.stripStart(it.subject, #text "person:")) {
        case (?e) {
          applied := if (policyRemovePerson(it.cid, e)) "removed from the people list" else "was no longer on the people list";
          let ids = List.empty<Nat>();
          for ((gid, g) in Map.entries(grants)) if (g.state == "active" and g.email == e and g.target == "app:" # Nat.toText(it.cid)) List.add(ids, gid);
          for (gid in List.values(ids)) endGrant<system>(gid, "revoked", email, caller, false);
          notifyLocal<system>(e, "Your access to " # it.appName # " was removed in an access review", "", "access.review.removed", "rev-" # Nat.toText(it.reviewId) # "-" # Nat.toText(itemId));
        };
        case null {
          switch (Text.stripStart(it.subject, #text "group:")) {
            case (?gn) { applied := if (policyRemoveGroup(it.cid, gn)) "the group no longer opens this app" else "the group was no longer in the rule" };
            case null {
              switch (Text.stripStart(it.subject, #text "role:")) {
                case (?r) { applied := if (policyRemoveRole(it.cid, r)) "the role no longer opens this app" else "the role was no longer in the rule" };
                case null return { ok = false; detail = "unknown entry kind" };
              };
            };
          };
        };
      };
    };
    let now = Time.now();
    Map.add(reviewItems, Nat.compare, itemId, { it with decision; decidedBy = email; decidedAt = now; note = norm(note); applied });
    journal("access", "review \"" # rv.name # "\": " # it.appName # " · " # it.subject # " → " # decision # (if (applied != "") " (" # applied # ")" else "") # (if (norm(note) != "") " — " # norm(note) else ""), caller);
    let k = reviewCounts(it.reviewId);
    if (k.decided == k.items) {
      Map.add(reviews, Nat.compare, it.reviewId, { rv with state = "closed"; closedAt = now });
      journal("access", "review \"" # rv.name # "\" completed: " # Nat.toText(k.items) # " entries, " # Nat.toText(k.removed) # " removed", caller);
    };
    { ok = true; detail = applied };
  };
  /// Close a review early; undecided entries stay undecided in the record.
  public shared ({ caller }) func closeReview(id : Nat) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    switch (Map.get(reviews, Nat.compare, id)) {
      case null ({ ok = false; detail = "no such review" });
      case (?r) {
        if (r.state != "open") return { ok = false; detail = "already closed" };
        Map.add(reviews, Nat.compare, id, { r with state = "closed"; closedAt = Time.now() });
        let k = reviewCounts(id);
        journal("access", "review \"" # r.name # "\" closed: " # Nat.toText(k.decided) # " of " # Nat.toText(k.items) # " decided, " # Nat.toText(k.removed) # " removed", caller);
        { ok = true; detail = "" };
      };
    };
  };
  /// Evidence export — one line per entry, spreadsheet-safe.
  public shared query ({ caller }) func reviewCsv(id : Nat) : async Text {
    assert isAdmin(caller);
    let r = switch (Map.get(reviews, Nat.compare, id)) { case (?r) r; case null return "" };
    var out = "review,started by,started,due,closed,app,entry,detail,reviewers,decision,decided by,decided,note,applied\n";
    let items = List.empty<ReviewItem>();
    for ((_, it) in Map.entries(reviewItems)) if (it.reviewId == id) List.add(items, it);
    for (it in Array.sort<ReviewItem>(List.toArray(items), func(a, b) = Nat.compare(a.id, b.id)).vals()) {
      out #= Text.join([csvCell(r.name), csvCell(r.startedBy), csvCell(whenText(r.startedAt)), csvCell(whenText(r.dueAt)), csvCell(whenText(r.closedAt)), csvCell(it.appName), csvCell(it.subject), csvCell(it.detail), csvCell(if (it.reviewers.size() == 0) "hub admins" else Text.join(it.reviewers.vals(), "; ")), csvCell(if (it.decision == "") "undecided" else it.decision), csvCell(it.decidedBy), csvCell(whenText(it.decidedAt)), csvCell(it.note), csvCell(it.applied)].vals(), ",") # "\n";
    };
    out;
  };
  /// Numbers for Home and the Access page.
  public shared query ({ caller }) func governanceSummary() : async { openRequests : Nat; activeGrants : Nat; endingSoon : Nat; openReviews : Nat; overdueReviews : Nat; undecided : Nat } {
    assert isAdmin(caller);
    var openRequests = 0; var activeGrants = 0; var endingSoon = 0; var openReviews = 0; var overdueReviews = 0; var undecided = 0;
    let now = Time.now();
    for ((_, r) in Map.entries(accessRequests)) if (r.state == "open") openRequests += 1;
    for ((_, g) in Map.entries(grants)) if (g.state == "active") { activeGrants += 1; if (g.expiresAt != 0 and g.expiresAt - now < 24 * HOUR_NS) endingSoon += 1 };
    for ((rid, r) in Map.entries(reviews)) if (r.state == "open") { openReviews += 1; if (now > r.dueAt) overdueReviews += 1; undecided += reviewCounts(rid).items - reviewCounts(rid).decided };
    { openRequests; activeGrants; endingSoon; openReviews; overdueReviews; undecided };
  };

  // =====================================================================
  // PERSON REGISTRY (0.17) — one stable, opaque id per person, minted here,
  // never reused. The current e-mail stays the working key inside this
  // canister; the registry is the single truth for "which address is whose"
  // and a rename/sealing rewrites every e-mail reference in ONE update call.
  // Design, merge rule and limits: docs/PERSON-IDS.md.
  // =====================================================================
  type Person = { pid : Text; email : Text; emails : [Text]; createdAt : Int; sealedAt : Int };
  let persons : Map.Map<Text, Person> = Map.empty<Text, Person>(); // pid -> person
  let userKeyToPid : Map.Map<Text, Text> = Map.empty<Text, Text>(); // "connId:externalId" -> pid
  let emailToPid : Map.Map<Text, Text> = Map.empty<Text, Text>(); // current holder of an address
  var pidSeed : ?Blob = null; // per-hub random seed (raw_rand, once) — ids derive from it, so they are unpredictable
  var pidCounter : Nat = 0;
  var pidBootstrappedAt : Int = 0;
  transient let SYSTEM_PRINCIPAL : Principal = Principal.fromText("2vxsx-fae");

  /// p_<16 hex> = sha256(seed ‖ counter): synchronous, unique, no head-count leak. null until the seed exists.
  func mintPid() : ?Text {
    switch (pidSeed) {
      case null null;
      case (?seed) {
        pidCounter += 1;
        let h = Blob.toArray(Sha256.fromArray(#sha256, Array.concat(Blob.toArray(seed), Blob.toArray(Text.encodeUtf8("pid:" # Nat.toText(pidCounter))))));
        ?("p_" # hex(Array.tabulate<Nat8>(8, func i = h[i]).toBlob()));
      };
    };
  };
  func pidOfKey(key : Text) : ?Text = Map.get(userKeyToPid, Text.compare, key);
  /// the id of the person who holds an address now ("" if the hub never saw it or the seed is not minted yet)
  func pidForEmail(email : Text) : Text = switch (Map.get(emailToPid, Text.compare, lower(norm(email)))) { case (?p) p; case null "" };
  func personOf(pid : Text) : ?Person = Map.get(persons, Text.compare, pid);
  func pidHasActiveAccount(pid : Text) : Bool {
    for ((k, p) in Map.entries(userKeyToPid)) if (p == pid) { switch (Map.get(users, Text.compare, k)) { case (?u) { if (effActive(u)) return true }; case null {} } };
    false;
  };
  /// the address a person currently uses: the most recently updated ACTIVE account, else the most recently updated one
  func currentEmailFor(pid : Text) : Text {
    var best : ?UserRec = null;
    for ((k, p) in Map.entries(userKeyToPid)) if (p == pid) {
      switch (Map.get(users, Text.compare, k)) {
        case (?u) {
          switch (best) {
            case null best := ?u;
            case (?b) { if ((effActive(u) and not effActive(b)) or (effActive(u) == effActive(b) and u.updatedAt > b.updatedAt)) best := ?u };
          };
        };
        case null {};
      };
    };
    switch (best) { case (?u) u.email; case null "" };
  };
  /// first sight of an account: join the person who holds its address ONLY if that person still has an active account
  /// (same human, another source); otherwise the address is being re-issued — seal the departed holder and mint a new person.
  /// The newcomer's own status does not matter: IdPs create people STAGED/inactive first, and joining them to a departed
  /// holder would hand them that holder's role, passkeys and seats the moment they are activated (audit 2026-09-06, HB1-01).
  func ensurePid(key : Text, u : UserRec) : ?Text {
    switch (pidOfKey(key)) { case (?p) return ?p; case null {} };
    let e = u.email;
    if (e != "") {
      switch (Map.get(emailToPid, Text.compare, e)) {
        case (?holder) {
          if (pidHasActiveAccount(holder)) { Map.add(userKeyToPid, Text.compare, key, holder); return ?holder };
          sealPerson(holder, e); // a departed person's address goes to a newcomer: nothing transfers
        };
        case null {};
      };
    };
    switch (mintPid()) {
      case null null;
      case (?pid) {
        Map.add(persons, Text.compare, pid, { pid; email = e; emails = if (e == "") [] else [e]; createdAt = Time.now(); sealedAt = 0 });
        Map.add(userKeyToPid, Text.compare, key, pid);
        if (e != "") Map.add(emailToPid, Text.compare, e, pid);
        ?pid;
      };
    };
  };
  /// Rewrite every reference to an address. rename: old -> new everywhere. sealing: configuration
  /// (role, passkeys, invites, seats, policies, ownerships, live sessions) is DROPPED, history is
  /// moved to the sealed form so nothing attaches to the address's next holder.
  func rewriteEmailRefs(old : Text, new : Text, sealing : Bool) {
    // role
    switch (Map.get(personRoles, Text.compare, old)) { case (?r) { ignore Map.delete(personRoles, Text.compare, old); if (not sealing) Map.add(personRoles, Text.compare, new, r) }; case null {} };
    // passkey links
    let prs = List.empty<Principal>();
    for ((pr, em) in Map.entries(principalLinks)) if (em == old) List.add(prs, pr);
    for (pr in List.values(prs)) { if (sealing) ignore Map.delete(principalLinks, Principal.compare, pr) else Map.add(principalLinks, Principal.compare, pr, new) };
    // invites
    let codes = List.empty<Text>();
    for ((c, inv) in Map.entries(inviteCodes)) if (inv.email == old) List.add(codes, c);
    for (c in List.values(codes)) { switch (Map.get(inviteCodes, Text.compare, c)) { case (?inv) { if (sealing) ignore Map.delete(inviteCodes, Text.compare, c) else Map.add(inviteCodes, Text.compare, c, { inv with email = new }) }; case null {} } };
    // group seats
    let gids = List.empty<Nat>();
    for ((gid, g) in Map.entries(groups)) if (has(g.members, old)) List.add(gids, gid);
    for (gid in List.values(gids)) { switch (Map.get(groups, Nat.compare, gid)) { case (?g) Map.add(groups, Nat.compare, gid, { g with members = swapOrDrop(g.members, old, new, sealing) }); case null {} } };
    // access policies (people) + app owners
    let pcids = List.empty<Nat>();
    for ((cid, p) in Map.entries(connectorAccess)) if (has(p.people, old)) List.add(pcids, cid);
    for (cid in List.values(pcids)) { switch (Map.get(connectorAccess, Nat.compare, cid)) { case (?p) Map.add(connectorAccess, Nat.compare, cid, { p with people = swapOrDrop(p.people, old, new, sealing) }); case null {} } };
    let ocids = List.empty<Nat>();
    for ((cid, os) in Map.entries(connectorOwners)) if (has(os, old)) List.add(ocids, cid);
    for (cid in List.values(ocids)) { switch (Map.get(connectorOwners, Nat.compare, cid)) { case (?os) Map.add(connectorOwners, Nat.compare, cid, swapOrDrop(os, old, new, sealing)); case null {} } };
    // history: grants, requests, reviews, connector requests, notifications — always moved (sealed form for a departed person)
    let sw = func(t : Text) : Text = if (t == old) new else t;
    let gs = List.empty<Nat>(); for ((id, g) in Map.entries(grants)) if (g.email == old or g.grantedBy == old or g.endedBy == old) List.add(gs, id);
    for (id in List.values(gs)) { switch (Map.get(grants, Nat.compare, id)) { case (?g) Map.add(grants, Nat.compare, id, { g with email = sw(g.email); grantedBy = sw(g.grantedBy); endedBy = sw(g.endedBy) }); case null {} } };
    let rs = List.empty<Nat>(); for ((id, r) in Map.entries(accessRequests)) if (r.email == old or r.decidedBy == old) List.add(rs, id);
    for (id in List.values(rs)) { switch (Map.get(accessRequests, Nat.compare, id)) { case (?r) Map.add(accessRequests, Nat.compare, id, { r with email = sw(r.email); decidedBy = sw(r.decidedBy) }); case null {} } };
    let rvs = List.empty<Nat>(); for ((id, r) in Map.entries(reviews)) if (r.startedBy == old) List.add(rvs, id);
    for (id in List.values(rvs)) { switch (Map.get(reviews, Nat.compare, id)) { case (?r) Map.add(reviews, Nat.compare, id, { r with startedBy = new }); case null {} } };
    let its = List.empty<Nat>(); for ((id, it) in Map.entries(reviewItems)) if (it.subject == "person:" # old or has(it.reviewers, old) or it.decidedBy == old) List.add(its, id);
    for (id in List.values(its)) { switch (Map.get(reviewItems, Nat.compare, id)) { case (?it) Map.add(reviewItems, Nat.compare, id, { it with subject = (if (it.subject == "person:" # old) "person:" # new else it.subject); reviewers = swapOrDrop(it.reviewers, old, new, false); decidedBy = sw(it.decidedBy) }); case null {} } };
    let crs = List.empty<Nat>(); for ((id, r) in Map.entries(connectorRequests)) if (r.requestedBy == old) List.add(crs, id);
    for (id in List.values(crs)) { switch (Map.get(connectorRequests, Nat.compare, id)) { case (?r) Map.add(connectorRequests, Nat.compare, id, { r with requestedBy = new }); case null {} } };
    let ns = List.empty<Nat>(); for ((id, n) in Map.entries(notifications)) if (n.email == old) List.add(ns, id);
    for (id in List.values(ns)) { switch (Map.get(notifications, Nat.compare, id)) { case (?n) Map.add(notifications, Nat.compare, id, { n with email = new }); case null {} } };
    // preferences + picture
    switch (Map.get(notifSlackOptOut, Text.compare, old)) { case (?v) { ignore Map.delete(notifSlackOptOut, Text.compare, old); if (not sealing) Map.add(notifSlackOptOut, Text.compare, new, v) }; case null {} };
    switch (Map.get(userAvatars, Text.compare, old)) { case (?b) { ignore Map.delete(userAvatars, Text.compare, old); if (not sealing) Map.add(userAvatars, Text.compare, new, b) }; case null {} };
    // OIDC: the subject follows the person (relying parties keep their `sub`); consents move too, so the next holder consents afresh
    switch (Map.get(oidcSubs, Text.compare, old)) { case (?s) { ignore Map.delete(oidcSubs, Text.compare, old); Map.add(oidcSubs, Text.compare, new, s) }; case null {} };
    for ((_, m) in Map.entries(oidcConsents)) { switch (Map.get(m, Text.compare, old)) { case (?t) { ignore Map.delete(m, Text.compare, old); Map.add(m, Text.compare, new, t) }; case null {} } };
    if (sealing) oidcDropWhere(true, true, func(_, em) = em == old) else {
      let cks = List.empty<Text>(); for ((k, c) in Map.entries(oidcCodes)) if (c.email == old) List.add(cks, k);
      for (k in List.values(cks)) { switch (Map.get(oidcCodes, Text.compare, k)) { case (?c) Map.add(oidcCodes, Text.compare, k, { c with email = new }); case null {} } };
      let tks = List.empty<Text>(); for ((k, t) in Map.entries(oidcTokens)) if (t.email == old) List.add(tks, k);
      for (k in List.values(tks)) { switch (Map.get(oidcTokens, Text.compare, k)) { case (?t) Map.add(oidcTokens, Text.compare, k, { t with email = new }); case null {} } };
    };
    // assistants (0.18): tokens and pending codes follow a rename, die with a sealing — the previous holder's assistant must never act as the next holder
    let ats = List.empty<Text>(); for ((k, a) in Map.entries(assistants)) if (a.email == old) List.add(ats, k);
    for (k in List.values(ats)) { switch (Map.get(assistants, Text.compare, k)) { case (?a) { if (sealing) Map.add(assistants, Text.compare, k, { a with revokedAt = (if (a.revokedAt == 0) Time.now() else a.revokedAt) }) else Map.add(assistants, Text.compare, k, { a with email = new }) }; case null {} } };
    let acs = List.empty<Text>(); for ((k, c) in Map.entries(assistantCodes)) if (c.email == old) List.add(acs, k);
    for (k in List.values(acs)) { switch (Map.get(assistantCodes, Text.compare, k)) { case (?c) { if (sealing) ignore Map.delete(assistantCodes, Text.compare, k) else Map.add(assistantCodes, Text.compare, k, { c with email = new }) }; case null {} } };
    ignore Map.delete(slackUserCache2, Text.compare, old); // the cached Slack user id belongs to the old holder of the address
    // live sessions, suite tokens, pending app tickets: follow a rename, die with a sealing
    let ss = List.empty<Text>(); for ((k, s) in Map.entries(sessions)) if (s.email == old) List.add(ss, k);
    for (k in List.values(ss)) { switch (Map.get(sessions, Text.compare, k)) { case (?s) { if (sealing) ignore Map.delete(sessions, Text.compare, k) else Map.add(sessions, Text.compare, k, { s with email = new }) }; case null {} } };
    let sts = List.empty<Text>(); for ((k, s) in Map.entries(suiteTokens)) if (s.email == old) List.add(sts, k);
    for (k in List.values(sts)) { switch (Map.get(suiteTokens, Text.compare, k)) { case (?s) { if (sealing) ignore Map.delete(suiteTokens, Text.compare, k) else Map.add(suiteTokens, Text.compare, k, { s with email = new }) }; case null {} } };
    let tcs = List.empty<Text>(); for ((k, t) in Map.entries(tickets)) if (t.email == old) List.add(tcs, k);
    for (k in List.values(tcs)) { switch (Map.get(tickets, Text.compare, k)) { case (?t) { if (sealing) ignore Map.delete(tickets, Text.compare, k) else Map.add(tickets, Text.compare, k, { t with email = new }) }; case null {} } };
  };
  func swapOrDrop(xs : [Text], old : Text, new : Text, drop : Bool) : [Text] {
    let out = List.empty<Text>();
    for (x in xs.vals()) { if (x != old) List.add(out, x) else if (not drop and not has(List.toArray(out), new)) List.add(out, new) };
    List.toArray(out);
  };
  /// true when `email` is currently held by an ACTIVE person other than the one owning account `key` — a rename onto it would merge two people
  func addressHeldByOther(key : Text, email : Text) : Bool {
    let e = lower(norm(email));
    switch (Map.get(emailToPid, Text.compare, e)) {
      case (?other) { pidOfKey(key) != ?other and pidHasActiveAccount(other) };
      case null false;
    };
  };
  /// A person's address changed (IdP sync, SCIM, local edit): one atomic rewrite. Refused when another active person holds the new address;
  /// a departed previous holder of the new address is sealed first (nothing of theirs may attach to the renamed person).
  func renamePerson(pid : Text, old : Text, new : Text) : Bool {
    let p = switch (personOf(pid)) { case (?p) p; case null return false };
    if (old == new or new == "") return false;
    switch (Map.get(emailToPid, Text.compare, new)) {
      case (?other) {
        if (other != pid) {
          if (pidHasActiveAccount(other)) { journal("persons", "address collision: " # new # " is held by another active person — " # old # " keeps its references until an admin resolves it", SYSTEM_PRINCIPAL); return false };
          sealPerson(other, new);
        };
      };
      case null {};
    };
    rewriteEmailRefs(old, new, false);
    Map.add(persons, Text.compare, pid, { p with email = new; emails = if (has(p.emails, new)) p.emails else Array.concat(p.emails, [new]) });
    if (pidForEmail(old) == pid) ignore Map.delete(emailToPid, Text.compare, old);
    Map.add(emailToPid, Text.compare, new, pid);
    journal("persons", "address changed: " # old # " → " # new # " (" # pid # ") — roles, seats, grants, notifications and OIDC subject follow", SYSTEM_PRINCIPAL);
    true;
  };
  /// A departed person's address is being re-issued: drop what could transfer, park the history under address#pid.
  func sealPerson(pid : Text, email : Text) {
    let p = switch (personOf(pid)) { case (?p) p; case null return };
    let sealed = email # "#" # pid;
    rewriteEmailRefs(email, sealed, true);
    Map.add(persons, Text.compare, pid, { p with email = sealed; sealedAt = Time.now() });
    if (pidForEmail(email) == pid) ignore Map.delete(emailToPid, Text.compare, email);
    journal("persons", "address re-issued: " # email # " had a previous holder (" # pid # ") — their role, passkeys, seats and grants were dropped, their history is kept as " # sealed, SYSTEM_PRINCIPAL);
  };
  /// Mint ids for accounts without one and apply address changes. Cheap (O(accounts)); runs after every
  /// directory mutation and every two minutes as a safety net. Nothing happens before the seed exists.
  func reconcilePersons() {
    if (pidSeed == null) return;
    for ((k, u) in Map.entries(users)) ignore ensurePid(k, u);
    let pids = List.empty<Text>();
    for ((pid, _) in Map.entries(persons)) List.add(pids, pid);
    for (pid in List.values(pids)) {
      switch (personOf(pid)) {
        case (?p) { if (p.sealedAt == 0) { let cur = currentEmailFor(pid); if (cur != "" and cur != p.email) ignore renamePerson(pid, p.email, cur) } };
        case null {};
      };
    };
    observeLifecycle();
  };
  func pidBootstrap() : async () {
    if (pidSeed == null) { let r = await ic00.raw_rand(); if (pidSeed == null) pidSeed := ?r };
    reconcilePersons();
    if (pidBootstrappedAt == 0) { pidBootstrappedAt := Time.now(); journal("persons", "person ids minted for " # Nat.toText(Map.size(persons)) # " people (" # Nat.toText(Map.size(users)) # " accounts)", SYSTEM_PRINCIPAL) };
  };
  /// address -> person id for any address the hub has ever known (departed people included). Connectors only — this is the apps' one-time migration lane.
  public shared query ({ caller }) func connectorLookup(emails : [Text]) : async [(Text, Text)] {
    switch (connectorByPrincipal(caller)) { case (?_) {}; case null assert isAdmin(caller) };
    if (emails.size() > 5000) return [];
    let out = List.empty<(Text, Text)>();
    for (raw in emails.vals()) {
      let e = lower(norm(raw));
      var pid = pidForEmail(e);
      if (pid == "") { label scan for ((p, per) in Map.entries(persons)) { if (has(per.emails, e)) { pid := p; break scan } } };
      if (pid != "") List.add(out, (e, pid));
    };
    List.toArray(out);
  };
  /// The registry card for one address: id, history, former-holder note (staff).
  public shared query ({ caller }) func personCard(email : Text) : async ?{ pid : Text; email : Text; emails : [Text]; createdAt : Int; sealed : Bool; formerHolders : [Text] } {
    assert isAdmin(caller);
    let e = lower(norm(email));
    let pid = pidForEmail(e);
    if (pid == "") return null;
    let p = switch (personOf(pid)) { case (?p) p; case null return null };
    let former = List.empty<Text>();
    for ((q, per) in Map.entries(persons)) if (q != pid and per.sealedAt != 0 and has(per.emails, e)) List.add(former, q);
    ?{ pid; email = p.email; emails = p.emails; createdAt = p.createdAt; sealed = p.sealedAt != 0; formerHolders = List.toArray(former) };
  };
  /// Local people (added here) can change their address; mastered accounts get renames from their source.
  public shared ({ caller }) func renameLocalUser(email : Text, newEmail : Text) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    let old = lower(norm(email)); let new = lower(norm(newEmail));
    if (new == "" or not Text.contains(new, #char '@')) return { ok = false; detail = "that is not an e-mail address" };
    if (old == new) return { ok = false; detail = "same address" };
    if (not canManagePerson(caller, old)) return { ok = false; detail = "you cannot manage this person" };
    let u = switch (Map.get(users, Text.compare, userKey(LOCAL_CONN, old))) { case (?u) u; case null return { ok = false; detail = "only people added here can be renamed — mastered accounts change at their source" } };
    if (Map.containsKey(users, Text.compare, userKey(LOCAL_CONN, new))) return { ok = false; detail = "a local person already has that address" };
    switch (Map.get(emailToPid, Text.compare, new)) { case (?other) { if (pidHasActiveAccount(other)) return { ok = false; detail = "another active person holds that address" } }; case null {} };
    let pid = switch (pidOfKey(userKey(LOCAL_CONN, old))) { case (?p) p; case null return { ok = false; detail = "person ids are still being minted — try again in a minute" } };
    // local accounts are keyed by their address: move the record, then let the registry rewrite every reference
    ignore Map.delete(users, Text.compare, userKey(LOCAL_CONN, old)); ignore Map.delete(userKeyToPid, Text.compare, userKey(LOCAL_CONN, old));
    for (m in [userKinds, forceActive].vals()) { switch (Map.get(m, Text.compare, userKey(LOCAL_CONN, old))) { case (?v) { ignore Map.delete(m, Text.compare, userKey(LOCAL_CONN, old)); Map.add(m, Text.compare, userKey(LOCAL_CONN, new), v) }; case null {} } };
    Map.add(users, Text.compare, userKey(LOCAL_CONN, new), { u with externalId = new; email = new; updatedAt = Time.now() });
    Map.add(userKeyToPid, Text.compare, userKey(LOCAL_CONN, new), pid);
    if (not renamePerson(pid, old, new)) return { ok = false; detail = "the address could not be moved — see the journal" };
    journal("local", "renamed " # old # " → " # new, caller);
    { ok = true; detail = "" };
  };

  // =====================================================================
  // ASSISTANTS (0.18) — a person connects an AI assistant (an MCP client such as a desktop
  // chat app) ONCE: a one-time code from the menu becomes a 30-day assistant token; with it the
  // hub mints app tickets for that person exactly like the portal does, so the assistant signs
  // into every app with the person's own rights — nothing more. Revocable here, visible in the
  // menu, an owner can switch the lane off for the company. Design: docs/agent/mcp.md.
  // =====================================================================
  type AssistantCode = { email : Text; displayName : Text; expiresAt : Int };
  let assistantCodes : Map.Map<Text, AssistantCode> = Map.empty<Text, AssistantCode>(); // one-time code -> who minted it
  public type Assistant = { id : Nat; email : Text; client : Text; createdAt : Int; expiresAt : Int; lastUsedAt : Int; revokedAt : Int; uses : Nat };
  let assistants : Map.Map<Text, Assistant> = Map.empty<Text, Assistant>(); // sha256(token) -> assistant (0.19; plain-token keys from 0.18 are retired by pruneAssistants)
  var nextAssistantId : Nat = 1;
  var assistantsEnabled : Bool = true; // 0.18 — frozen stable value, no longer read (a stable var is never removed)
  var assistantsOn : Bool = false; // 0.19: the company switch, OFF until an owner turns it on (Settings → AI)
  transient let ASSISTANT_CODE_TTL_NS : Int = 10 * 60_000_000_000;
  transient let ASSISTANT_TOKEN_TTL_NS : Int = 30 * 24 * 3_600_000_000_000;

  func assistantKey(token : Text) : Text = sha256Hex(token);
  func assistantOf(token : Text) : ?Assistant {
    if (not assistantsOn or token == "") return null;
    switch (Map.get(assistants, Text.compare, assistantKey(token))) {
      case (?a) { if (a.revokedAt != 0 or Time.now() > a.expiresAt or accessOf(a.email) != #active) null else ?a };
      case null null;
    };
  };
  func touchAssistant(token : Text, a : Assistant) { Map.add(assistants, Text.compare, assistantKey(token), { a with lastUsedAt = Time.now(); uses = a.uses + 1 }) };
  func liveAssistantsOf(email : Text) : Nat { var n = 0; for ((_, a) in Map.entries(assistants)) if (a.email == email and a.revokedAt == 0 and Time.now() <= a.expiresAt) n += 1; n };
  func pruneAssistants() {
    let now = Time.now(); let dead = List.empty<Text>();
    // 0.18 stored the token itself as the key (128 hex); since 0.19 the key is its sha256 (64 hex) — old entries can no longer be presented, retire them
    for ((t, a) in Map.entries(assistants)) if (t.size() != 64 and a.revokedAt == 0) List.add(dead, t);
    for (t in List.values(dead)) { switch (Map.get(assistants, Text.compare, t)) { case (?a) Map.add(assistants, Text.compare, t, { a with revokedAt = now }); case null {} } };
    List.clear(dead);
    for ((c, ac) in Map.entries(assistantCodes)) if (now > ac.expiresAt) List.add(dead, c);
    for (c in List.values(dead)) ignore Map.delete(assistantCodes, Text.compare, c);
    List.clear(dead);
    for ((t, a) in Map.entries(assistants)) if (now > a.expiresAt + 90 * 24 * 3_600_000_000_000) List.add(dead, t); // expired tokens stay listed for 90 days, then go
    for (t in List.values(dead)) ignore Map.delete(assistants, Text.compare, t);
  };
  public type AssistantView = { id : Nat; client : Text; createdAt : Int; expiresAt : Int; lastUsedAt : Int; uses : Nat; active : Bool; email : Text };
  func assistantView(a : Assistant) : AssistantView = { id = a.id; client = a.client; createdAt = a.createdAt; expiresAt = a.expiresAt; lastUsedAt = a.lastUsedAt; uses = a.uses; active = a.revokedAt == 0 and Time.now() <= a.expiresAt; email = a.email };

  // ---- the person plane (menu) ----
  /// The code the person pastes into their assistant: "<hub backend canister id>.<one-time code>", valid 10 minutes, one per person.
  public shared ({ caller }) func mintAssistantCode(sessionToken : Text) : async { ok : Bool; code : Text; detail : Text } {
    if (not assistantsOn) return { ok = false; code = ""; detail = "assistants are switched off for this company — an owner can turn them on under Settings → AI" };
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return { ok = false; code = ""; detail = "no session" } };
    let old = List.empty<Text>();
    for ((c, ac) in Map.entries(assistantCodes)) if (ac.email == s.email or Time.now() > ac.expiresAt) List.add(old, c);
    for (c in List.values(old)) ignore Map.delete(assistantCodes, Text.compare, c);
    let code = hex(await ic00.raw_rand());
    if (portalSession(caller, sessionToken) == null or not assistantsOn) return { ok = false; code = ""; detail = "session ended" };
    Map.add(assistantCodes, Text.compare, code, { email = s.email; displayName = s.displayName; expiresAt = Time.now() + ASSISTANT_CODE_TTL_NS });
    journal("assistant", "connect code minted by " # s.email, caller);
    { ok = true; code = Principal.toText(Principal.fromActor(UserHub)) # "." # code; detail = "" };
  };
  public shared query ({ caller }) func myAssistants(sessionToken : Text) : async [AssistantView] {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return [] };
    let out = List.empty<AssistantView>();
    for ((_, a) in Map.entries(assistants)) if (a.email == s.email and a.revokedAt == 0) List.add(out, assistantView(a));
    List.toArray(out);
  };
  public shared ({ caller }) func revokeAssistant(sessionToken : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return { ok = false; detail = "no session" } };
    for ((t, a) in Map.entries(assistants)) {
      if (a.id == id and a.email == s.email) {
        if (a.revokedAt != 0) return { ok = false; detail = "already disconnected" };
        Map.add(assistants, Text.compare, t, { a with revokedAt = Time.now() });
        journal("assistant", "assistant \"" # a.client # "\" disconnected by " # s.email, caller);
        return { ok = true; detail = "" };
      };
    };
    { ok = false; detail = "no such assistant" };
  };
  // ---- owners: the company switch + oversight ----
  public shared ({ caller }) func setAssistantsEnabled(on : Bool) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    assistantsOn := on;
    if (not on) {
      // off means off: every connected assistant is disconnected for good, pending codes die; switching on again starts from zero
      let live = List.empty<Text>(); for ((k, a) in Map.entries(assistants)) if (a.revokedAt == 0) List.add(live, k);
      for (k in List.values(live)) { switch (Map.get(assistants, Text.compare, k)) { case (?a) Map.add(assistants, Text.compare, k, { a with revokedAt = Time.now() }); case null {} } };
      Map.clear(assistantCodes);
    };
    journal("assistant", if (on) "assistants switched on" else "assistants switched off — every connected assistant was disconnected", caller);
    { ok = true; detail = "" };
  };
  public shared query ({ caller }) func listAssistants() : async { enabled : Bool; items : [AssistantView] } {
    assert isAdmin(caller);
    let out = List.empty<AssistantView>();
    for ((_, a) in Map.entries(assistants)) if (a.revokedAt == 0) List.add(out, assistantView(a));
    { enabled = assistantsOn; items = List.toArray(out) };
  };
  public shared ({ caller }) func revokeAssistantOf(id : Nat) : async { ok : Bool; detail : Text } {
    if (not isAdminRole(caller)) return { ok = false; detail = "admins only" };
    for ((t, a) in Map.entries(assistants)) {
      if (a.id == id and a.revokedAt == 0) {
        if (not canManagePerson(caller, a.email)) return { ok = false; detail = "you cannot manage this person" };
        Map.add(assistants, Text.compare, t, { a with revokedAt = Time.now() });
        journal("assistant", "assistant \"" # a.client # "\" of " # a.email # " disconnected by staff", caller);
        return { ok = true; detail = "" };
      };
    };
    { ok = false; detail = "no such assistant" };
  };

  // ---- the assistant plane (the MCP server calls these with its token) ----
  /// One-time exchange: whoever holds a fresh code gets the token. clientName = the client's name, e.g. the desktop chat app.
  public shared func redeemAssistantCode(codeIn : Text, clientName : Text) : async { ok : Bool; token : Text; email : Text; displayName : Text; id : Text; expiresAt : Int; orgName : Text; detail : Text } {
    func fail(d : Text) : { ok : Bool; token : Text; email : Text; displayName : Text; id : Text; expiresAt : Int; orgName : Text; detail : Text } = { ok = false; token = ""; email = ""; displayName = ""; id = ""; expiresAt = 0; orgName = ""; detail = d };
    if (not assistantsOn) return fail("assistants are switched off for this company");
    var code = norm(codeIn);
    for (part in Text.split(code, #char '.')) code := part; // accept "<canister>.<code>" and the bare code
    let ac = switch (Map.get(assistantCodes, Text.compare, code)) { case (?x) x; case null return fail("unknown or already used code — mint a new one in the hub menu") };
    ignore Map.delete(assistantCodes, Text.compare, code);
    if (Time.now() > ac.expiresAt) return fail("the code expired (10 minutes) — mint a new one in the hub menu");
    if (accessOf(ac.email) != #active) return fail("account inactive");
    if (liveAssistantsOf(ac.email) >= 10) return fail("this person already has 10 connected assistants — disconnect one in the hub menu first");
    let token = hex(await ic00.raw_rand()) # hex(await ic00.raw_rand());
    if (not assistantsOn or accessOf(ac.email) != #active) return fail("access changed while connecting");
    var lbl = norm(clientName); if (lbl == "") lbl := "assistant";
    if (lbl.size() > 60) { var cut = ""; var i = 0; for (c in lbl.chars()) { if (i < 60) cut #= Char.toText(c); i += 1 }; lbl := cut };
    let a : Assistant = { id = nextAssistantId; email = ac.email; client = lbl; createdAt = Time.now(); expiresAt = Time.now() + ASSISTANT_TOKEN_TTL_NS; lastUsedAt = 0; revokedAt = 0; uses = 0 };
    nextAssistantId += 1;
    Map.add(assistants, Text.compare, assistantKey(token), a); // the token itself is never stored
    journal("assistant", "assistant \"" # lbl # "\" connected for " # ac.email # " (30 days, revocable in the menu)", SYSTEM_PRINCIPAL);
    { ok = true; token; email = ac.email; displayName = ac.displayName; id = pidForEmail(ac.email); expiresAt = a.expiresAt; orgName; detail = "" };
  };
  public shared query func assistantWhoami(token : Text) : async ?{ email : Text; displayName : Text; id : Text; client : Text; expiresAt : Int; orgName : Text; hubRole : Text } {
    switch (assistantOf(token)) {
      case null null;
      case (?a) {
        var name = a.email;
        for ((_, u) in Map.entries(users)) if (u.email == a.email and u.displayName != "") name := u.displayName;
        ?{ email = a.email; displayName = name; id = pidForEmail(a.email); client = a.client; expiresAt = a.expiresAt; orgName; hubRole = hubRoleOf(a.email) };
      };
    };
  };
  /// The person's menu as the assistant sees it: connector-bound app tiles the person may open, with the BACKEND canister to talk to.
  public shared query func assistantApps(token : Text) : async [{ tileId : Nat; name : Text; url : Text; note : Text; canisterId : Text }] {
    let a = switch (assistantOf(token)) { case (?a) a; case null return [] };
    let out = List.empty<{ tileId : Nat; name : Text; url : Text; note : Text; canisterId : Text }>();
    for (v in orderedAppViews().vals()) {
      if (not v.hidden and (v.kind == "app" or v.kind == "win") and v.connectorId != 0 and not isOidcConnector(v.connectorId) and accessForConn(a.email, v.connectorId) == #active) {
        switch (Map.get(connectors, Nat.compare, v.connectorId)) {
          case (?c) List.add(out, { tileId = v.id; name = v.name; url = v.url; note = v.note; canisterId = Principal.toText(c.canisterId) });
          case null {};
        };
      };
    };
    List.toArray(out);
  };
  /// A one-time app ticket for the assistant's person — the same gates as the portal's mintAppTicket.
  public shared func assistantTicket(token : Text, tileId : Nat) : async { ok : Bool; ticket : Text; url : Text; detail : Text } {
    let a = switch (assistantOf(token)) { case (?a) a; case null return { ok = false; ticket = ""; url = ""; detail = "assistant token unknown, expired, revoked or switched off — reconnect from the hub menu" } };
    let app = switch (Map.get(appLinks, Nat.compare, tileId)) { case (?x) x; case null return { ok = false; ticket = ""; url = ""; detail = "unknown app" } };
    let boundCid = connectorOfTile(tileId);
    if (boundCid == 0 or not connectors.containsKey(boundCid)) return { ok = false; ticket = ""; url = ""; detail = "this tile has no registered app binding" };
    if (accessForConn(a.email, boundCid) != #active) return { ok = false; ticket = ""; url = ""; detail = "this app is not available to you" };
    if (tileHidden(tileId)) return { ok = false; ticket = ""; url = ""; detail = "this app is off the menu right now" };
    let t = hex(await ic00.raw_rand());
    if (assistantOf(token) == null or accessForConn(a.email, boundCid) != #active or connectorOfTile(tileId) != boundCid or appLinks.get(tileId) != ?app or tileHidden(tileId)) return { ok = false; ticket = ""; url = ""; detail = "access changed while minting" };
    var name = a.email;
    for ((_, u) in Map.entries(users)) if (u.email == a.email and u.displayName != "") name := u.displayName;
    Map.add(tickets, Text.compare, t, { email = a.email; displayName = name; appId = tileId; expiresAt = Time.now() + ticketTtlNs });
    touchAssistant(token, a);
    journal("assistant", "\"" # a.client # "\" opened " # app.name # " for " # a.email, SYSTEM_PRINCIPAL);
    { ok = true; ticket = t; url = app.url; detail = "" };
  };
  /// Colleagues, exactly as the pickers of the person's OWN apps see them: the union of the directories the hub hands to the
  /// connectors behind the tiles this person may open (each with its scope, exclude filters, access policy and lanes — title/department
  /// only from an app with the profile lane, groups only from one with the groups lane). No apps → nobody. q = name or address.
  public shared query func assistantPeople(token : Text, q : Text) : async [{ id : Text; email : Text; displayName : Text; title : Text; department : Text; groups : [Text] }] {
    let a = switch (assistantOf(token)) { case null return []; case (?a) a };
    let needle = lower(norm(q));
    let seen = Map.empty<Text, Bool>();
    let out = List.empty<{ id : Text; email : Text; displayName : Text; title : Text; department : Text; groups : [Text] }>();
    let cids = List.empty<Nat>();
    for (v in orderedAppViews().vals()) {
      if (not v.hidden and (v.kind == "app" or v.kind == "win") and v.connectorId != 0 and not isOidcConnector(v.connectorId) and accessForConn(a.email, v.connectorId) == #active and not has_(List.toArray(cids), v.connectorId)) List.add(cids, v.connectorId);
    };
    label apps for (cid in List.values(cids)) {
      for (u in directoryFor(cid).vals()) {
        if (List.size(out) >= 25) break apps;
        if (u.active and not Map.containsKey(seen, Text.compare, u.email) and (needle == "" or Text.contains(u.email, #text needle) or Text.contains(lower(u.displayName), #text needle))) {
          Map.add(seen, Text.compare, u.email, true);
          func attr(k : Text) : Text { for ((kk, v) in u.attributes.vals()) if (kk == k) return v; "" };
          let gs = List.empty<Text>();
          for (g in Text.split(attr("groups"), #char ';')) { let n = norm(g); if (n != "") List.add(gs, n) };
          List.add(out, { id = switch (u.id) { case (?i) i; case null "" }; email = u.email; displayName = u.displayName; title = attr("title"); department = attr("department"); groups = List.toArray(gs) });
        };
      };
    };
    List.toArray(out);
  };
  func has_(xs : [Nat], x : Nat) : Bool { for (y in xs.vals()) if (y == x) return true; false };

  // =====================================================================
  // OpenID Connect PROVIDER — the hub signs people into other software
  // (Grafana, GitLab, a vendor's SaaS): Authorization Code + PKCE only,
  // RS256 by default (ES256 per client), no refresh tokens, no dynamic
  // registration. Design and limits: docs/OIDC-PROVIDER.md.
  //
  // An OIDC client IS a connector: it has a connector record (with a
  // synthetic principal nobody can sign as), so lanes decide the claims it
  // receives, the access policy decides who may sign in, its tile appears on
  // the menu and every action lands in the journal. `oidcClients` holds what
  // is OIDC-specific, keyed by connector id.
  // =====================================================================

  type OidcClient = {
    cid : Nat; // connector id
    clientId : Text; // "kb_" + 24 hex
    secretHash : Text; // hex(sha256(secret)); "" for public clients (PKCE only)
    redirectUris : [Text]; // exact matches
    isPublic : Bool;
    alg : Text; // RS256 | ES256
    consent : Text; // once | always
    enabled : Bool;
    createdAt : Int;
    updatedAt : Int;
  };
  let oidcClients : Map.Map<Nat, OidcClient> = Map.empty<Nat, OidcClient>();
  type OidcCode = { cid : Nat; redirectUri : Text; nonce : Text; challenge : Text; email : Text; sub : Text; provider : Text; scope : Text; authTime : Int; expiresAt : Int };
  let oidcCodes : Map.Map<Text, OidcCode> = Map.empty<Text, OidcCode>(); // code -> grant (single use, 60 s)
  type OidcToken = { cid : Nat; email : Text; sub : Text; scope : Text; expiresAt : Int };
  let oidcTokens : Map.Map<Text, OidcToken> = Map.empty<Text, OidcToken>(); // access token -> ... (1 h)
  let oidcSubs : Map.Map<Text, Text> = Map.empty<Text, Text>(); // email -> stable opaque subject
  let oidcConsents : Map.Map<Nat, Map.Map<Text, Int>> = Map.empty<Nat, Map.Map<Text, Int>>(); // cid -> (email -> when)
  transient let oidcTokenHits : Map.Map<Nat, (Int, Nat)> = Map.empty<Nat, (Int, Nat)>(); // cid -> (window start, count) — successful exchanges only; a 5-minute window need not survive upgrades
  transient let oidcJournalAt : Map.Map<Text, Int> = Map.empty<Text, Int>(); // throttle key -> last journal time (per person/client; a chatty person cannot flush the journal)
  var oidcIssuerOverride : Text = ""; // custom domain for the backend, set by an owner; "" = canister gateway URL
  var oidcFrontendOverride : Text = ""; // where the authorize view lives; "" = CANONICAL_ORIGIN / frontend canister
  // signing keys — generated here, never leave the canister
  var oidcRsaKey : ?Rsa.Key = null;
  var oidcRsaPrev : ?Rsa.Key = null; // previous key stays in the JWKS for 24 h after a rotation
  var oidcRsaPrevUntil : Int = 0;
  var oidcGen : ?Rsa.Gen = null; // resumable key generation in progress
  transient var oidcGenBusy : Bool = false; // transient: an upgrade or a trap must never leave the generator locked
  var oidcGenStartedAt : Int = 0;
  var oidcEcKey : ?Blob = null; // P-256 raw private key for ES256 id_tokens
  var oidcEcKid : Text = "";
  // NOTE these limits are stable `let`s (deployed 0.7.0) and therefore frozen at the values below — to change one, add a `transient let` with a new name and switch the uses.
  let OIDC_CODE_TTL : Int = 60 * 1_000_000_000;
  let OIDC_TOKEN_TTL : Int = 3600 * 1_000_000_000;
  let OIDC_IDTOKEN_TTL : Int = 900; // seconds
  let OIDC_MAX_CODES = 1000;
  let OIDC_MAX_TOKENS = 20_000;
  let OIDC_MAX_BODY = 4096; // a real token request is < 1 KB
  let OIDC_LANES : [Text] = ["identity", "profile", "groups", "roles"]; // lanes an external app can use (no canister → no push/notify/avatars)
  func oidcLanes(ls : [Text]) : [Text] = Array.filter<Text>(ls, func(l) = has(OIDC_LANES, l));
  func consentOf(cid : Nat, email : Text) : Bool = switch (Map.get(oidcConsents, Nat.compare, cid)) { case (?m) Map.containsKey(m, Text.compare, email); case null false };
  func recordConsent(cid : Nat, email : Text) { let m = switch (Map.get(oidcConsents, Nat.compare, cid)) { case (?m) m; case null { let m = Map.empty<Text, Int>(); Map.add(oidcConsents, Nat.compare, cid, m); m } }; Map.add(m, Text.compare, email, oidcNow()) };
  let OIDC_MAX_CODES_PER_PERSON = 3;
  let OIDC_RATE_PER_5MIN = 600; // successful token exchanges per client — bounds RSA work, not guessing (secrets and codes are 256-bit)

  func sha256Hex(t : Text) : Text = hex(Sha256.fromIter(#sha256, Text.encodeUtf8(t).vals()));
  func sha256Bytes(t : Text) : [Nat8] = Blob.toArray(Sha256.fromIter(#sha256, Text.encodeUtf8(t).vals()));
  func selfId() : Text = Principal.toText(Principal.fromActor(UserHub));
  func oidcIssuer() : Text = if (oidcIssuerOverride != "") oidcIssuerOverride else "https://" # selfId() # ".icp.net";
  func oidcFrontendBase<system>() : Text {
    if (oidcFrontendOverride != "") return oidcFrontendOverride;
    switch (Runtime.envVar<system>("PUBLIC_CANISTER_ID:frontend")) { case (?v) "https://" # v # ".icp.net"; case null "" };
  };
  func oidcByClientId(clientId : Text) : ?OidcClient { for ((_, c) in Map.entries(oidcClients)) if (c.clientId == clientId) return ?c; null };
  func isOidcConnector(cid : Nat) : Bool = Map.containsKey(oidcClients, Nat.compare, cid);
  func oidcNow() : Int = Time.now();
  func randomHex(bytes : Nat) : async* Text {
    let r = Blob.toArray(await ic00.raw_rand());
    hex(Array.tabulate<Nat8>(Nat.min(bytes, r.size()), func i = r[i]).toBlob());
  };
  /// a principal nobody holds a key for: 28 random bytes + 0x02 (self-authenticating shape)
  func syntheticPrincipal() : async* Principal {
    let r = Blob.toArray(await ic00.raw_rand());
    Principal.fromBlob(Array.tabulate<Nat8>(29, func i = if (i == 28) 0x02 else r[i]).toBlob());
  };
  /// the stable subject for a person: allocated once at authorize time (no race between id_token and userinfo),
  /// keyed by e-mail because the e-mail IS the hub's identity — a re-issued address inherits the sub (documented)
  func subFor(email : Text) : async* Text {
    switch (Map.get(oidcSubs, Text.compare, email)) {
      case (?s) s;
      case null {
        let fresh = "kb_" # (await* randomHex(16));
        switch (Map.get(oidcSubs, Text.compare, email)) { case (?s) s; case null { Map.add(oidcSubs, Text.compare, email, fresh); fresh } }; // re-check after the await
      };
    };
  };
  func oidcJournalOnce(key : Text, every : Int, kind : Text, detail : Text, by : Principal) {
    let t = oidcNow();
    switch (Map.get(oidcJournalAt, Text.compare, key)) { case (?last) { if (t - last < every) return }; case null {} };
    Map.add(oidcJournalAt, Text.compare, key, t);
    journal(kind, detail, by);
  };
  /// expire codes and tokens — collect first, delete after (never delete while iterating a mo:core Map)
  func oidcSweep() {
    let t = oidcNow();
    if (Map.size(oidcJournalAt) > 5000) Map.clear(oidcJournalAt);
    let dead = List.empty<Text>();
    for ((k, c) in Map.entries(oidcCodes)) if (t > c.expiresAt) List.add(dead, k);
    for (k in List.values(dead)) ignore Map.delete(oidcCodes, Text.compare, k);
    List.clear(dead);
    for ((k, tk) in Map.entries(oidcTokens)) if (t > tk.expiresAt) List.add(dead, k);
    for (k in List.values(dead)) ignore Map.delete(oidcTokens, Text.compare, k);
    switch (oidcRsaPrev) { case (?_) { if (t > oidcRsaPrevUntil) oidcRsaPrev := null }; case null {} };
  };
  func oidcDropWhere(codes : Bool, tokens : Bool, pred : (Nat, Text) -> Bool) {
    let dead = List.empty<Text>();
    if (codes) { for ((k, c) in Map.entries(oidcCodes)) if (pred(c.cid, c.email)) List.add(dead, k); for (k in List.values(dead)) ignore Map.delete(oidcCodes, Text.compare, k); List.clear(dead) };
    if (tokens) { for ((k, tk) in Map.entries(oidcTokens)) if (pred(tk.cid, tk.email)) List.add(dead, k); for (k in List.values(dead)) ignore Map.delete(oidcTokens, Text.compare, k) };
  };

  // ---------- keys ----------
  /// JWKS entry for an RSA key
  func rsaJwk(k : Rsa.Key) : Text =
    "{\"kty\":\"RSA\",\"use\":\"sig\",\"alg\":\"RS256\",\"kid\":\"" # k.kid # "\",\"n\":\"" # b64url(Rsa.toBytes(k.n, Rsa.keyBytes(k))) # "\",\"e\":\"AQAB\"}";
  func ecJwk() : Text {
    switch (oidcEcKey) {
      case null "";
      case (?blob) {
        switch (ECDSA.privateKeyFromBytes(Blob.toArray(blob).vals(), #raw({ curve = p256 }))) {
          case (#err(_)) "";
          case (#ok(k)) {
            let unc = k.getPublicKey().toBytes(#uncompressed);
            if (unc.size() != 65) return "";
            "{\"kty\":\"EC\",\"use\":\"sig\",\"alg\":\"ES256\",\"crv\":\"P-256\",\"kid\":\"" # oidcEcKid # "\",\"x\":\"" # b64url(Array.tabulate<Nat8>(32, func i = unc[1 + i])) # "\",\"y\":\"" # b64url(Array.tabulate<Nat8>(32, func i = unc[33 + i])) # "\"}";
          };
        };
      };
    };
  };
  func oidcJwksJson() : Text {
    let keys = List.empty<Text>();
    switch (oidcRsaKey) { case (?k) List.add(keys, rsaJwk(k)); case null {} };
    switch (oidcRsaPrev) { case (?k) { if (oidcNow() <= oidcRsaPrevUntil) List.add(keys, rsaJwk(k)) }; case null {} };
    let ec = ecJwk(); if (ec != "") List.add(keys, ec);
    "{\"keys\":[" # Text.join(List.values(keys), ",") # "]}";
  };
  func kidNow(prefix : Text, salt : Text) : Text {
    let days = oidcNow() / (86_400 * 1_000_000_000);
    prefix # "-" # Int.toText(days) # "-" # salt;
  };
  /// Start (or continue) RSA key generation in the background. Idempotent.
  transient var oidcTickArmed : Bool = false;
  func oidcArmTick<system>(afterSecs : Nat) {
    if (oidcTickArmed) return;
    oidcTickArmed := true;
    ignore Timer.setTimer<system>(#seconds afterSecs, func() : async () { oidcTickArmed := false; await oidcGenTick() });
  };
  /// Start (or resume after an upgrade) key generation in the background. Idempotent.
  func oidcEnsureKeys<system>() {
    if (oidcEcKey == null) ignore Timer.setTimer<system>(#seconds 0, func() : async () { await oidcGenEc() });
    if (oidcRsaKey == null and oidcGen == null) { oidcGen := ?Rsa.newGen(1024); oidcGenStartedAt := oidcNow() };
    if (oidcGen != null and not oidcGenBusy) oidcArmTick<system>(0);
  };
  transient var oidcEcBusy : Bool = false;
  func oidcGenEc() : async () {
    if (oidcEcKey != null or oidcEcBusy) return;
    oidcEcBusy := true;
    try {
      let f1 = ic00.raw_rand(); let f2 = ic00.raw_rand();
      let entropy = await f1; let saltSrc = Blob.toArray(await f2); let salt = hex(Array.tabulate<Nat8>(3, func i = saltSrc[i]).toBlob());
      if (oidcEcKey == null) switch (ECDSA.generatePrivateKey(Blob.toArray(entropy).vals(), p256)) {
        case (#ok(k)) { oidcEcKey := ?k.toBytes(#raw).toBlob(); oidcEcKid := kidNow("hub-ec", salt); journal("oidc", "ES256 signing key ready (" # oidcEcKid # ")", Principal.fromActor(UserHub)) };
        case (#err(_)) {};
      };
    } catch (_) {} finally { oidcEcBusy := false };
  };
  transient var oidcGenFailures : Nat = 0;
  /// One slice of the prime search: ≤ 60 candidates (≈ 6–10 B instructions), then re-arm.
  func oidcGenTick() : async () {
    if (oidcGenBusy) return;
    let g = switch (oidcGen) { case (?g) g; case null return };
    oidcGenBusy := true;
    try {
      // 128 bytes for the candidate + 32 for the witnesses = 5 × raw_rand, requested in parallel (one round trip, not five)
      let f1 = ic00.raw_rand(); let f2 = ic00.raw_rand(); let f3 = ic00.raw_rand(); let f4 = ic00.raw_rand(); let f5 = ic00.raw_rand();
      let pool = List.empty<Nat8>();
      for (blob in [await f1, await f2, await f3, await f4, await f5].vals()) for (b in Blob.toArray(blob).vals()) List.add(pool, b);
      // ≤ 60 odd candidates per slice: ≈ 10 survive the sieve → ≈ 3.4 B instructions typical, ≈ 13 B in the worst case (limit 40 B)
      let g2 = Rsa.step(g, List.toArray(pool), 60);
      oidcGen := ?g2;
      if (g2.done) {
        let kid = kidNow("hub-rsa", await* randomHex(3));
        switch (Rsa.finish(g2, kid, oidcNow())) {
          case (?k) {
            // self-check before the key is used for anything
            let probe = sha256Bytes("kebab-stack key self-check " # kid);
            if (Rsa.verifyDigest(k.n, k.e, probe, Rsa.signDigest(k, probe))) {
              switch (oidcRsaKey) { case (?old) { oidcRsaPrev := ?old; oidcRsaPrevUntil := oidcNow() + 24 * 3_600 * 1_000_000_000 }; case null {} };
              oidcRsaKey := ?k; oidcGen := null;
              journal("oidc", "RS256 signing key ready (" # kid # ", " # Nat.toText(g2.tried) # " candidates)", Principal.fromActor(UserHub));
            } else { oidcGen := ?Rsa.newGen(1024); oidcGenFailures += 1; journal("oidc", "generated key failed its self-check — starting over", Principal.fromActor(UserHub)) };
          };
          case null { oidcGen := ?Rsa.newGen(1024); oidcGenFailures += 1 }; // unusable pair (should not happen) — start over
        };
      };
    } catch (e) {
      oidcGenFailures += 1;
      if (oidcGenFailures == 3) journal("oidc", "key generation keeps failing: " # Error.message(e) # " — retrying with backoff", Principal.fromActor(UserHub));
    } finally { oidcGenBusy := false };
    // re-arm (a trap in the slice skips this line; the 5-minute tick() watchdog resumes the search then); back off after repeated failures
    if (oidcGen != null) oidcArmTick<system>(if (oidcGenFailures >= 3) 60 else 1);
  };
  /// Owners: new RS256 key; the old one stays in the JWKS for 24 h so tokens in flight verify.
  public shared ({ caller }) func oidcRotateKey() : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    if (oidcGen != null) return { ok = false; detail = "a key is already being generated" };
    oidcGen := ?Rsa.newGen(1024); oidcGenStartedAt := oidcNow();
    oidcArmTick<system>(0);
    journal("oidc", "RS256 key rotation started", caller);
    { ok = true; detail = "generating — the current key keeps signing until the new one is ready" };
  };

  // ---------- JWT ----------
  func jsonArr(xs : [Text]) : Text = "[" # Text.join(Array.map<Text, Text>(xs, func(x) = "\"" # jsonEsc(x) # "\"").vals(), ",") # "]";
  func attrIn(attrs : [(Text, Text)], k : Text) : Text { for ((a, v) in attrs.vals()) if (a == k) return v; "" };
  /// the person behind an e-mail as claims for one client, filtered by its lanes
  func oidcClaims(cid : Nat, email : Text, sub : Text) : Text {
    var name = ""; var first = ""; var last = ""; var attrs : [(Text, Text)] = [];
    // only accounts within the client's source scope may contribute profile data (a client scoped to one org never sees the other's titles)
    for ((_, u) in Map.entries(users)) if (u.email == email and inScope(scopeOf(cid), u.connId)) { if (u.displayName != "") name := u.displayName; if (u.firstName != "") first := u.firstName; if (u.lastName != "") last := u.lastName; if (attrs.size() == 0) attrs := u.attributes };
    let out = List.empty<Text>();
    List.add(out, "\"sub\":\"" # jsonEsc(sub) # "\"");
    List.add(out, "\"email\":\"" # jsonEsc(email) # "\"");
    // Directory enrollment does not prove ownership of a mailbox. Do not assert email_verified.
    List.add(out, "\"preferred_username\":\"" # jsonEsc(email) # "\"");
    if (name != "") List.add(out, "\"name\":\"" # jsonEsc(name) # "\"");
    if (first != "") List.add(out, "\"given_name\":\"" # jsonEsc(first) # "\"");
    if (last != "") List.add(out, "\"family_name\":\"" # jsonEsc(last) # "\"");
    if (hasLane(cid, "profile")) {
      for (k in ["title", "department", "division", "organization", "city", "countryCode", "managerName", "employeeNumber"].vals()) {
        let v = attrIn(attrs, k); if (v != "") List.add(out, "\"" # k # "\":\"" # jsonEsc(v) # "\"");
      };
    };
    if (hasLane(cid, "groups")) {
      let gs = List.empty<Text>();
      for ((_, g) in Map.entries(groups)) { if (groupMember(g, email)) List.add(gs, g.name) };
      List.add(out, "\"groups\":" # jsonArr(List.toArray(gs)));
    };
    if (hasLane(cid, "roles")) { let hr = hubRoleOf(email); List.add(out, "\"hub_role\":\"" # (if (hr == "") "member" else hr) # "\"") };
    Text.join(List.values(out), ",");
  };
  func signJwt(alg : Text, payload : Text) : async* ?Text {
    if (alg == "ES256") {
      let blob = switch (oidcEcKey) { case (?b) b; case null return null };
      let key = switch (ECDSA.privateKeyFromBytes(Blob.toArray(blob).vals(), #raw({ curve = p256 }))) { case (#ok(k)) k; case (#err(_)) return null };
      let header = "{\"alg\":\"ES256\",\"typ\":\"JWT\",\"kid\":\"" # oidcEcKid # "\"}";
      let input = b64urlText(header) # "." # b64urlText(payload);
      let nonce = await ic00.raw_rand();
      switch (key.sign(Blob.toArray(Text.encodeUtf8(input)).vals(), Blob.toArray(nonce).vals())) {
        case (#ok(sig)) ?(input # "." # b64url(sig.toBytes(#raw)));
        case (#err(_)) null;
      };
    } else {
      let k = switch (oidcRsaKey) { case (?k) k; case null return null };
      let header = "{\"alg\":\"RS256\",\"typ\":\"JWT\",\"kid\":\"" # k.kid # "\"}";
      let input = b64urlText(header) # "." # b64urlText(payload);
      ?(input # "." # b64url(Rsa.signDigest(k, sha256Bytes(input))));
    };
  };

  // ---------- client registry (owners) ----------
  type OidcClientArgs = { name : Text; note : Text; redirectUris : [Text]; isPublic : Bool; alg : Text; consent : Text; lanes : [Text]; access : AccessPolicy; tileUrl : Text };
  /// after the literal host the URI must continue with "/", ":" or end — "http://localhost.evil.tld" is not local
  func hostEnds(x : Text, host : Text) : Bool {
    let rest = switch (Text.stripStart(x, #text host)) { case (?r) r; case null return false };
    rest == "" or Text.startsWith(rest, #text "/") or Text.startsWith(rest, #text ":");
  };
  func cleanRedirects(uris : [Text]) : ?[Text] {
    if (uris.size() == 0 or uris.size() > 20) return null;
    let out = List.empty<Text>();
    for (u in uris.vals()) {
      let x = norm(u);
      if (x == "" or Text.contains(x, #char '#') or Text.contains(x, #char ' ')) return null;
      let localOk = (Text.startsWith(x, #text "http://localhost") and hostEnds(x, "http://localhost")) or (Text.startsWith(x, #text "http://127.0.0.1") and hostEnds(x, "http://127.0.0.1"));
      if (not (Text.startsWith(x, #text "https://") or localOk)) return null;
      List.add(out, x);
    };
    ?List.toArray(out);
  };
  public shared ({ caller }) func addOidcClient(args : OidcClientArgs) : async { ok : Bool; id : Nat; clientId : Text; secret : Text; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; id = 0; clientId = ""; secret = ""; detail = "owners only" };
    let n = norm(args.name);
    if (n == "" or n.size() > 80) return { ok = false; id = 0; clientId = ""; secret = ""; detail = "name is required (max 80 characters)" };
    let uris = switch (cleanRedirects(args.redirectUris)) { case (?u) u; case null return { ok = false; id = 0; clientId = ""; secret = ""; detail = "1–20 redirect URIs, https:// (or http://localhost for development), no fragments" } };
    if (args.alg != "RS256" and args.alg != "ES256") return { ok = false; id = 0; clientId = ""; secret = ""; detail = "alg must be RS256 or ES256" };
    if (args.consent != "once" and args.consent != "always") return { ok = false; id = 0; clientId = ""; secret = ""; detail = "consent must be once or always" };
    if (args.access.mode != "everyone" and args.access.mode != "selected") return { ok = false; id = 0; clientId = ""; secret = ""; detail = "access mode must be everyone or selected" };
    if (Map.size(oidcClients) >= 200) return { ok = false; id = 0; clientId = ""; secret = ""; detail = "too many clients" };
    let pr = await* syntheticPrincipal();
    let clientId = "kb_" # (await* randomHex(12));
    let secret = if (args.isPublic) "" else await* randomHex(32);
    if (not isOwnerRole(caller)) return { ok = false; id = 0; clientId = ""; secret = ""; detail = "owners only" }; // re-check after the awaits
    let id = nextConnectorId; nextConnectorId += 1;
    Map.add(connectors, Nat.compare, id, { id; name = n; canisterId = pr; note = norm(args.note); addedAt = Time.now() });
    let ls = oidcLanes(cleanLanes(args.lanes));
    Map.add(connectorLanes, Nat.compare, id, ls);
    Map.add(connectorAccess, Nat.compare, id, { mode = args.access.mode; groups = Array.map<Text, Text>(args.access.groups, norm); roles = args.access.roles; people = Array.map<Text, Text>(args.access.people, func(x) = lower(norm(x))) });
    Map.add(oidcClients, Nat.compare, id, { cid = id; clientId; secretHash = (if (secret == "") "" else sha256Hex(secret)); redirectUris = uris; isPublic = args.isPublic; alg = args.alg; consent = args.consent; enabled = true; createdAt = Time.now(); updatedAt = Time.now() });
    oidcSetTile(id, n, norm(args.note), norm(args.tileUrl));
    oidcEnsureKeys<system>();
    journal("oidc", "client " # n # " (" # clientId # ", " # (if (args.isPublic) "public/PKCE" else "confidential") # ", " # args.alg # ") created, lanes [" # Text.join(ls.vals(), ", ") # "], access " # args.access.mode, caller);
    { ok = true; id; clientId; secret; detail = "" };
  };
  /// the menu entry of an external app: kind "oidc" = opens the app, which signs the person in through the hub
  func oidcSetTile(cid : Nat, name : Text, note : Text, url : Text) {
    if (url == "" or not Text.startsWith(url, #text "https://")) return;
    for ((tid, c) in Map.entries(appLinkConnectors)) if (c == cid) {
      switch (Map.get(appLinks, Nat.compare, tid)) { case (?t) { Map.add(appLinks, Nat.compare, tid, { t with url }); Map.add(appLinkKinds, Nat.compare, tid, "oidc") }; case null {} };
      ignore Map.delete(appLinkHidden, Nat.compare, tid);
      return;
    };
    let tid = nextAppLinkId; nextAppLinkId += 1;
    Map.add(appLinks, Nat.compare, tid, { id = tid; name; url; note });
    Map.add(appLinkKinds, Nat.compare, tid, "oidc");
    Map.add(appLinkConnectors, Nat.compare, tid, cid);
  };
  public shared ({ caller }) func updateOidcClient(id : Nat, args : { redirectUris : [Text]; alg : Text; consent : Text; enabled : Bool; tileUrl : ?Text }) : async { ok : Bool; detail : Text } {
    let tileUrl = switch (args.tileUrl) { case (?t) norm(t); case null "" }; // optional field: older callers stay compatible
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    let c = switch (Map.get(oidcClients, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such client" } };
    if (tileUrl != "" and not Text.startsWith(tileUrl, #text "https://")) return { ok = false; detail = "menu entry must be an https:// address" };
    let uris = switch (cleanRedirects(args.redirectUris)) { case (?u) u; case null return { ok = false; detail = "1–20 redirect URIs, https:// (or http://localhost), no fragments" } };
    if (args.alg != "RS256" and args.alg != "ES256") return { ok = false; detail = "alg must be RS256 or ES256" };
    if (args.consent != "once" and args.consent != "always") return { ok = false; detail = "consent must be once or always" };
    Map.add(oidcClients, Nat.compare, id, { c with redirectUris = uris; alg = args.alg; consent = args.consent; enabled = args.enabled; updatedAt = Time.now() });
    switch (Map.get(connectors, Nat.compare, id)) { case (?k) oidcSetTile(id, k.name, k.note, tileUrl); case null {} };
    journal("oidc", "client #" # Nat.toText(id) # " updated (" # Nat.toText(uris.size()) # " redirect URIs, " # args.alg # ", " # (if (args.enabled) "enabled" else "DISABLED") # ")", caller);
    { ok = true; detail = "" };
  };
  public shared ({ caller }) func rotateOidcSecret(id : Nat) : async { ok : Bool; secret : Text; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; secret = ""; detail = "owners only" };
    let c = switch (Map.get(oidcClients, Nat.compare, id)) { case (?c) c; case null return { ok = false; secret = ""; detail = "no such client" } };
    if (c.isPublic) return { ok = false; secret = ""; detail = "public clients have no secret (PKCE)" };
    let secret = await* randomHex(32);
    if (not isOwnerRole(caller) or oidcClients.get(id) != ?c) return { ok = false; secret = ""; detail = "authorization or client configuration changed" };
    Map.add(oidcClients, Nat.compare, id, { c with secretHash = sha256Hex(secret); updatedAt = Time.now() });
    journal("oidc", "client #" # Nat.toText(id) # " secret rotated", caller);
    { ok = true; secret; detail = "" };
  };
  public shared ({ caller }) func removeOidcClient(id : Nat) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    let c = switch (Map.get(oidcClients, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such client" } };
    ignore Map.delete(oidcClients, Nat.compare, id);
    ignore Map.delete(connectors, Nat.compare, id);
    ignore Map.delete(connectorLanes, Nat.compare, id);
    ignore Map.delete(connectorAccess, Nat.compare, id);
    let tiles = List.empty<Nat>();
    for ((tid, cid) in Map.entries(appLinkConnectors)) if (cid == id) List.add(tiles, tid);
    for (tid in List.values(tiles)) { dropTileIcon(tid); ignore Map.delete(appLinks, Nat.compare, tid); ignore Map.delete(appLinkKinds, Nat.compare, tid); ignore Map.delete(appLinkConnectors, Nat.compare, tid) };
    oidcDropWhere(true, true, func(cid, _) = cid == id);
    ignore Map.delete(oidcConsents, Nat.compare, id);
    governanceForget<system>("app:" # Nat.toText(id), id);
    ignore Map.delete(oidcTokenHits, Nat.compare, id);
    journal("oidc", "client #" # Nat.toText(id) # " (" # c.clientId # ") removed", caller);
    { ok = true; detail = "" };
  };
  public type OidcClientView = { cid : Nat; name : Text; clientId : Text; redirectUris : [Text]; isPublic : Bool; alg : Text; consent : Text; enabled : Bool; createdAt : Int; lanes : [Text]; access : AccessPolicy; tileUrl : Text };
  func oidcTileUrl(cid : Nat) : Text { for ((tid, c) in Map.entries(appLinkConnectors)) if (c == cid) { switch (Map.get(appLinks, Nat.compare, tid)) { case (?t) return t.url; case null {} } }; "" };
  public shared query ({ caller }) func listOidcClients() : async [OidcClientView] {
    if (not isAdminRole(caller)) return [];
    let out = List.empty<OidcClientView>();
    for ((cid, c) in Map.entries(oidcClients)) {
      let name = switch (Map.get(connectors, Nat.compare, cid)) { case (?k) k.name; case null "?" };
      List.add(out, { cid; name; clientId = c.clientId; redirectUris = c.redirectUris; isPublic = c.isPublic; alg = c.alg; consent = c.consent; enabled = c.enabled; createdAt = c.createdAt; lanes = lanesOf(cid); access = policyOf(cid); tileUrl = oidcTileUrl(cid) });
    };
    List.toArray(out);
  };
  /// Provider status for the owner page: issuer, endpoints, key state.
  public shared query ({ caller }) func oidcInfo() : async { issuer : Text; discovery : Text; authorize : Text; keyState : Text; kid : Text; ecKid : Text; clients : Nat; generatingSince : Int; tried : Nat; issuerOverride : Text; frontendOverride : Text } {
    if (not isAdminRole(caller)) return { issuer = ""; discovery = ""; authorize = ""; keyState = ""; kid = ""; ecKid = ""; clients = 0; generatingSince = 0; tried = 0; issuerOverride = ""; frontendOverride = "" };
    let iss = oidcIssuer();
    let keyState = switch (oidcRsaKey, oidcGen) { case (?_, null) "ready"; case (?_, ?_) "ready · rotating"; case (null, ?_) "generating"; case (null, null) "none" };
    let tried = switch (oidcGen) { case (?g) g.tried; case null 0 };
    { issuer = iss; discovery = iss # "/.well-known/openid-configuration"; authorize = iss # "/oidc/authorize"; keyState; kid = (switch (oidcRsaKey) { case (?k) k.kid; case null "" }); ecKid = oidcEcKid; clients = Map.size(oidcClients); generatingSince = oidcGenStartedAt; tried; issuerOverride = oidcIssuerOverride; frontendOverride = oidcFrontendOverride };
  };
  /// Owners: custom domains. Changing the issuer invalidates every client's configuration — the UI says so.
  public shared ({ caller }) func setOidcOrigins(issuer : Text, frontend : Text) : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    let i = norm(issuer); let f = norm(frontend);
    func urlChars(t : Text) : Bool { for (ch in t.chars()) { if (not (Char.isAlphabetic(ch) or Char.isDigit(ch) or ch == '.' or ch == '-' or ch == ':' or ch == '/')) return false }; true };
    if (not urlChars(i) or not urlChars(f)) return { ok = false; detail = "addresses may contain letters, digits, . - : / only" };
    if (i != "" and (not Text.startsWith(i, #text "https://") or Text.endsWith(i, #text "/"))) return { ok = false; detail = "issuer must be https:// without a trailing slash" };
    if (f != "" and (not Text.startsWith(f, #text "https://") or Text.endsWith(f, #text "/"))) return { ok = false; detail = "frontend must be https:// without a trailing slash" };
    oidcIssuerOverride := i; oidcFrontendOverride := f;
    journal("oidc", "origins set: issuer " # (if (i == "") "(canister)" else i) # ", frontend " # (if (f == "") "(canister)" else f), caller);
    { ok = true; detail = "" };
  };
  /// Start key generation now (owners) — normally triggered by the first client.
  public shared ({ caller }) func oidcPrepareKeys() : async { ok : Bool; detail : Text } {
    if (not isOwnerRole(caller)) return { ok = false; detail = "owners only" };
    oidcEnsureKeys<system>();
    { ok = true; detail = (if (oidcRsaKey != null) "keys ready" else "generating in the background") };
  };

  // ---------- authorize (called by the hub's own frontend) ----------
  public type OidcAuthReq = { clientId : Text; redirectUri : Text; scope : Text; state : Text; nonce : Text; codeChallenge : Text; codeChallengeMethod : Text; responseType : Text; prompt : Text };
  /// What the consent card shows. Anyone signed in may ask; nothing secret in here.
  public shared query ({ caller }) func oidcPreview(sessionToken : Text, clientId : Text, redirectUri : Text) : async { ok : Bool; name : Text; shares : [Text]; consented : Bool; email : Text; displayName : Text; detail : Text } {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return { ok = false; name = ""; shares = []; consented = false; email = ""; displayName = ""; detail = "sign in first" } };
    let c = switch (oidcByClientId(norm(clientId))) { case (?c) c; case null return { ok = false; name = ""; shares = []; consented = false; email = s.email; displayName = s.displayName; detail = "unknown client" } };
    if (not c.enabled) return { ok = false; name = ""; shares = []; consented = false; email = s.email; displayName = s.displayName; detail = "this app is switched off" };
    if (not has(c.redirectUris, norm(redirectUri))) return { ok = false; name = ""; shares = []; consented = false; email = s.email; displayName = s.displayName; detail = "the app asked to send you to an address it did not register" };
    let name = switch (Map.get(connectors, Nat.compare, c.cid)) { case (?k) k.name; case null "?" };
    let shares = List.empty<Text>(); List.add(shares, "who you are (name, e-mail)");
    if (hasLane(c.cid, "profile")) List.add(shares, "your job profile"); if (hasLane(c.cid, "groups")) List.add(shares, "your groups"); if (hasLane(c.cid, "roles")) List.add(shares, "your hub role");
    let consented = c.consent == "once" and consentOf(c.cid, s.email);
    if (accessForConn(s.email, c.cid) != #active) return { ok = false; name; shares = List.toArray(shares); consented; email = s.email; displayName = s.displayName; detail = "this app is not available to you" };
    { ok = true; name; shares = List.toArray(shares); consented; email = s.email; displayName = s.displayName; detail = "" };
  };
  /// Issue the one-time code. Every check again, then 32 random bytes bound to everything.
  public shared ({ caller }) func oidcAuthorize(sessionToken : Text, r : OidcAuthReq) : async { ok : Bool; code : Text; redirectUri : Text; iss : Text; detail : Text } {
    let s = switch (portalSession(caller, sessionToken)) { case (?s) s; case null return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "sign in first" } };
    if (Time.now() > s.expiresAt) return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "session expired" };
    let c = switch (oidcByClientId(norm(r.clientId))) { case (?c) c; case null return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "unknown client" } };
    if (not c.enabled) return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "this app is switched off" };
    let ru = norm(r.redirectUri);
    if (not has(c.redirectUris, ru)) return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "redirect_uri is not registered for this client" };
    if (r.responseType != "code") return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "only response_type=code is supported" };
    if (not Text.contains(" " # r.scope # " ", #text " openid ")) return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "scope must include openid" };
    if (r.codeChallenge != "" and r.codeChallengeMethod != "S256") return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "only code_challenge_method=S256 is supported" };
    if (c.isPublic and r.codeChallenge == "") return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "public clients must use PKCE" };
    if (r.codeChallenge != "" and (r.codeChallenge.size() < 43 or r.codeChallenge.size() > 128)) return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "bad code_challenge" };
    if (r.nonce.size() > 512 or r.state.size() > 1024 or r.scope.size() > 256) return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "parameter too long" };
    if (r.prompt == "none") return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "prompt=none is not supported" };
    if (accessForConn(s.email, c.cid) != #active) {
      oidcJournalOnce("deny#" # s.email # "#" # Nat.toText(c.cid), 3_600 * 1_000_000_000, "oidc", "sign-in to " # c.clientId # " DENIED for " # s.email # " (inactive or outside the client's access policy)", caller);
      return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "this app is not available to you" };
    };
    if ((c.alg == "RS256" and oidcRsaKey == null) or (c.alg == "ES256" and oidcEcKey == null)) { oidcEnsureKeys<system>(); return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "the hub's signing key is still being generated — try again in a minute" } };
    oidcSweep();
    // per person: at most 3 codes in flight — the oldest is replaced, so one chatty tab cannot block the hub for everyone
    var mine = 0; var oldestK = ""; var oldestT : Int = 0;
    for ((k, cd) in Map.entries(oidcCodes)) if (cd.email == s.email) { mine += 1; if (oldestK == "" or cd.authTime < oldestT) { oldestK := k; oldestT := cd.authTime } };
    if (mine >= OIDC_MAX_CODES_PER_PERSON and oldestK != "") ignore Map.delete(oidcCodes, Text.compare, oldestK);
    if (Map.size(oidcCodes) >= OIDC_MAX_CODES) return { ok = false; code = ""; redirectUri = ""; iss = ""; detail = "too many sign-ins in flight — try again shortly" };
    let sub = await* subFor(s.email);
    let code = await* randomHex(32);
    // stored under its hash: a state dump yields no live codes
    Map.add(oidcCodes, Text.compare, sha256Hex(code), { cid = c.cid; redirectUri = ru; nonce = r.nonce; challenge = r.codeChallenge; email = s.email; sub; provider = s.provider; scope = r.scope; authTime = Time.now(); expiresAt = Time.now() + OIDC_CODE_TTL });
    if (c.consent == "once") recordConsent(c.cid, s.email);
    oidcJournalOnce("ok#" # s.email # "#" # Nat.toText(c.cid), 600 * 1_000_000_000, "oidc", s.email # " signed in to " # (switch (Map.get(connectors, Nat.compare, c.cid)) { case (?k) k.name; case null c.clientId }), caller);
    { ok = true; code; redirectUri = ru; iss = oidcIssuer(); detail = "" };
  };

  // ---------- HTTP: discovery, JWKS, token, userinfo ----------
  func oidcHeaders(extra : [HeaderField]) : [HeaderField] = Array.concat<HeaderField>([("Content-Type", "application/json"), ("Cache-Control", "no-store"), ("Pragma", "no-cache"), ("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Headers", "authorization, content-type"), ("Access-Control-Allow-Methods", "GET, POST, OPTIONS")], extra);
  func oidcJson(code : Nat16, body : Text) : HttpGwResponse = { status_code = code; headers = oidcHeaders([]); body = Text.encodeUtf8(body); upgrade = null };
  func oidcErr(code : Nat16, err : Text, desc : Text) : HttpGwResponse = oidcJson(code, "{\"error\":\"" # err # "\",\"error_description\":\"" # jsonEsc(desc) # "\"}");
  func formFields(body : Blob) : [(Text, Text)] {
    let t = switch (Text.decodeUtf8(body)) { case (?t) t; case null "" };
    let out = List.empty<(Text, Text)>();
    for (pair in Text.split(t, #char '&')) {
      let kv = Iter.toArray(Text.split(pair, #char '='));
      if (kv.size() >= 1 and kv[0] != "") List.add(out, (urlDecode(kv[0]), if (kv.size() >= 2) urlDecode(Text.join(Array.sliceToArray<Text>(kv, 1, kv.size()).vals(), "=")) else ""));
    };
    List.toArray(out);
  };
  func field(fs : [(Text, Text)], k : Text) : Text { for ((a, v) in fs.vals()) if (a == k) return v; "" };
  /// RFC 6749 § 3.1: a parameter MUST NOT appear twice
  func duplicated(fs : [(Text, Text)]) : ?Text { var i = 0; for ((a, _) in fs.vals()) { var j = i + 1; while (j < fs.size()) { if (fs[j].0 == a) return ?a; j += 1 }; i += 1 }; null };
  func basicAuth(headers : [HeaderField]) : ?(Text, Text) {
    let h = gwHeader(headers, "authorization");
    if (not Text.startsWith(lower(h), #text "basic ") or h.size() < 7) return null;
    let b64 = norm(Text.fromIter(Array.sliceToArray<Char>(Text.toArray(h), 6, h.size()).vals())); // after "Basic " whatever its case
    let raw = switch (b64urlDecode(b64)) { case (?b) b; case null return null };
    let t = switch (Text.decodeUtf8(Array.toBlob(raw))) { case (?t) t; case null return null };
    let it = Text.split(t, #char ':');
    let u = switch (it.next()) { case (?u) urlDecode(u); case null return null };
    let p = switch (it.next()) { case (?p) urlDecode(p); case null "" };
    ?(u, p);
  };
  func oidcRateOk(cid : Nat) : Bool {
    let t = oidcNow();
    let (start, n) = switch (Map.get(oidcTokenHits, Nat.compare, cid)) { case (?x) x; case null (t, 0) };
    if (t - start > 300 * 1_000_000_000) { Map.add(oidcTokenHits, Nat.compare, cid, (t, 1)); return true };
    if (n >= OIDC_RATE_PER_5MIN) return false;
    Map.add(oidcTokenHits, Nat.compare, cid, (start, n + 1)); true;
  };
  func oidcDiscoveryJson() : Text {
    let iss = oidcIssuer();
    "{\"issuer\":\"" # iss # "\",\"authorization_endpoint\":\"" # iss # "/oidc/authorize\",\"token_endpoint\":\"" # iss # "/oidc/token\",\"userinfo_endpoint\":\"" # iss # "/oidc/userinfo\",\"jwks_uri\":\"" # iss # "/oidc/jwks\"," #
    "\"response_types_supported\":[\"code\"],\"response_modes_supported\":[\"query\"],\"grant_types_supported\":[\"authorization_code\"],\"subject_types_supported\":[\"public\"]," #
    "\"id_token_signing_alg_values_supported\":[\"RS256\",\"ES256\"],\"scopes_supported\":[\"openid\",\"profile\",\"email\",\"groups\"]," #
    "\"token_endpoint_auth_methods_supported\":[\"client_secret_basic\",\"client_secret_post\",\"none\"],\"code_challenge_methods_supported\":[\"S256\"]," #
    "\"claims_supported\":[\"sub\",\"iss\",\"aud\",\"exp\",\"iat\",\"auth_time\",\"nonce\",\"email\",\"email_verified\",\"name\",\"given_name\",\"family_name\",\"preferred_username\",\"groups\",\"hub_role\",\"title\",\"department\"]," #
    "\"authorization_response_iss_parameter_supported\":true,\"claims_parameter_supported\":false,\"request_parameter_supported\":false,\"request_uri_parameter_supported\":false}";
  };
  func oidcHandle<system>(req : HttpGwRequest) : async* HttpGwResponse {
    let path = switch (Text.split(req.url, #char '?').next()) { case (?p) p; case null req.url };
    if (req.method == "OPTIONS") return { status_code = 204; headers = oidcHeaders([]); body = Text.encodeUtf8(""); upgrade = null };
    if (path == "/.well-known/openid-configuration") return oidcJson(200, oidcDiscoveryJson());
    if (path == "/oidc/jwks") { oidcSweep(); return oidcJson(200, oidcJwksJson()) };
    if (path == "/oidc/authorize") {
      // a plain URL for relying parties that cannot handle a fragment in the authorization endpoint:
      // the backend hands the browser (with the whole query) to the sign-in view on the frontend
      let it = Text.split(req.url, #char '?'); ignore it.next();
      let qs = switch (it.next()) { case (?q) q; case null "" };
      if (qs.size() > 4096) return oidcErr(414, "invalid_request", "query too long");
      let fe = oidcFrontendBase<system>();
      if (fe == "") return oidcErr(503, "temporarily_unavailable", "frontend address unknown — set it under Apps → Sign-in for other apps → Addresses");
      return { status_code = 302; headers = [("Location", fe # "/#/oidc/authorize?" # qs), ("Cache-Control", "no-store")]; body = Text.encodeUtf8(""); upgrade = null };
    };
    if (path == "/oidc/userinfo") return oidcUserinfo(req);
    if (path == "/oidc/token") return await* oidcToken(req);
    oidcErr(404, "not_found", "unknown OIDC endpoint");
  };
  func oidcUserinfo(req : HttpGwRequest) : HttpGwResponse {
    if (req.body.size() > OIDC_MAX_BODY) return oidcErr(413, "invalid_request", "body too large");
    let h = gwHeader(req.headers, "authorization");
    let raw = switch (Text.stripStart(h, #text "Bearer ")) { case (?t) norm(t); case null field(formFields(req.body), "access_token") };
    let tok = if (raw == "") "" else sha256Hex(raw);
    if (tok == "") return { status_code = 401; headers = oidcHeaders([("WWW-Authenticate", "Bearer")]); body = Text.encodeUtf8(""); upgrade = null };
    let t = switch (Map.get(oidcTokens, Text.compare, tok)) { case (?t) t; case null return { status_code = 401; headers = oidcHeaders([("WWW-Authenticate", "Bearer error=\"invalid_token\"")]); body = Text.encodeUtf8("{\"error\":\"invalid_token\"}"); upgrade = null } };
    if (oidcNow() > t.expiresAt) { ignore Map.delete(oidcTokens, Text.compare, tok); return { status_code = 401; headers = oidcHeaders([("WWW-Authenticate", "Bearer error=\"invalid_token\"")]); body = Text.encodeUtf8("{\"error\":\"invalid_token\",\"error_description\":\"expired\"}"); upgrade = null } };
    if (accessForConn(t.email, t.cid) != #active) { ignore Map.delete(oidcTokens, Text.compare, tok); return { status_code = 401; headers = oidcHeaders([("WWW-Authenticate", "Bearer error=\"invalid_token\"")]); body = Text.encodeUtf8("{\"error\":\"invalid_token\",\"error_description\":\"access revoked\"}"); upgrade = null } };
    oidcJson(200, "{" # oidcClaims(t.cid, t.email, t.sub) # "}");
  };
  func oidcToken(req : HttpGwRequest) : async* HttpGwResponse {
    if (req.method != "POST") return oidcErr(405, "invalid_request", "POST only");
    if (req.body.size() > OIDC_MAX_BODY) return oidcErr(413, "invalid_request", "body too large");
    let fs = formFields(req.body);
    switch (duplicated(fs)) { case (?d) return oidcErr(400, "invalid_request", "parameter repeated: " # d); case null {} };
    if (field(fs, "grant_type") != "authorization_code") return oidcErr(400, "unsupported_grant_type", "only authorization_code");
    // client identification: Basic header OR body — never a mix of two identities (RFC 6749 § 2.3)
    var clientId = field(fs, "client_id"); var secret = field(fs, "client_secret");
    switch (basicAuth(req.headers)) {
      case (?(u, p)) { if (clientId != "" and clientId != u) return oidcErr(401, "invalid_client", "client_id in body and header differ"); if (secret != "") return oidcErr(401, "invalid_client", "two client authentication methods"); clientId := u; secret := p };
      case null {};
    };
    let c = switch (oidcByClientId(clientId)) { case (?c) c; case null return oidcErr(401, "invalid_client", "unknown client") };
    let self = Principal.fromActor(UserHub);
    if (not c.enabled) return oidcErr(401, "invalid_client", "client disabled");
    if (not c.isPublic) { if (secret == "" or sha256Hex(secret) != c.secretHash) { oidcJournalOnce("badsecret#" # Nat.toText(c.cid), 600 * 1_000_000_000, "oidc", "token request for " # c.clientId # " with a wrong client secret", self); return oidcErr(401, "invalid_client", "bad client secret") } };
    let code = sha256Hex(field(fs, "code"));
    let grant = switch (Map.get(oidcCodes, Text.compare, code)) { case (?g) g; case null { oidcJournalOnce("badcode#" # Nat.toText(c.cid), 600 * 1_000_000_000, "oidc", "token request for " # c.clientId # " with an unknown or already used code", self); return oidcErr(400, "invalid_grant", "unknown or already used code") } };
    ignore Map.delete(oidcCodes, Text.compare, code); // single use, whatever happens next
    if (oidcNow() > grant.expiresAt) return oidcErr(400, "invalid_grant", "code expired");
    if (grant.cid != c.cid) { oidcJournalOnce("wrongclient#" # Nat.toText(c.cid), 600 * 1_000_000_000, "oidc", "token request for " # c.clientId # " with a code issued to another client", self); return oidcErr(400, "invalid_grant", "code was issued to a different client") };
    if (field(fs, "redirect_uri") != "" and field(fs, "redirect_uri") != grant.redirectUri) return oidcErr(400, "invalid_grant", "redirect_uri mismatch");
    let v = field(fs, "code_verifier");
    if (grant.challenge != "") {
      if (v.size() < 43 or v.size() > 128) return oidcErr(400, "invalid_grant", "code_verifier missing or malformed");
      if (b64url(sha256Bytes(v)) != grant.challenge) { oidcJournalOnce("pkce#" # Nat.toText(c.cid), 600 * 1_000_000_000, "oidc", "PKCE verification failed for " # c.clientId, self); return oidcErr(400, "invalid_grant", "PKCE verification failed") };
    } else {
      // PKCE downgrade protection: a verifier for a code that was issued without a challenge means the code was injected
      if (v != "") return oidcErr(400, "invalid_grant", "code was issued without PKCE");
      if (c.isPublic) return oidcErr(400, "invalid_grant", "PKCE required");
    };
    if (accessForConn(grant.email, c.cid) != #active) return oidcErr(400, "invalid_grant", "access revoked");
    if (not oidcRateOk(c.cid)) return oidcErr(429, "slow_down", "too many token requests for this client — try again in a few minutes");
    let nowS = oidcNow() / 1_000_000_000;
    let claims = oidcClaims(c.cid, grant.email, grant.sub);
    let amr = if (grant.provider == "passkey") "[\"passkey\"]" else "[\"fed\"]"; // fed = federated company SSO (Okta/Google) session
    let payload = "{\"iss\":\"" # oidcIssuer() # "\",\"aud\":\"" # c.clientId # "\",\"iat\":" # Int.toText(nowS) # ",\"exp\":" # Int.toText(nowS + OIDC_IDTOKEN_TTL) # ",\"auth_time\":" # Int.toText(grant.authTime / 1_000_000_000) # ",\"amr\":" # amr # (if (grant.nonce != "") ",\"nonce\":\"" # jsonEsc(grant.nonce) # "\"" else "") # "," # claims # "}";
    let idToken = switch (await* signJwt(c.alg, payload)) { case (?t) t; case null return oidcErr(503, "temporarily_unavailable", "signing key not ready") };
    if (Map.size(oidcTokens) >= OIDC_MAX_TOKENS) { oidcSweep(); if (Map.size(oidcTokens) >= OIDC_MAX_TOKENS) return oidcErr(503, "temporarily_unavailable", "too many live sessions — try again later") };
    let access = await* randomHex(32);
    Map.add(oidcTokens, Text.compare, sha256Hex(access), { cid = c.cid; email = grant.email; sub = grant.sub; scope = grant.scope; expiresAt = oidcNow() + OIDC_TOKEN_TTL });
    oidcJson(200, "{\"access_token\":\"" # access # "\",\"token_type\":\"Bearer\",\"expires_in\":3600,\"scope\":\"" # jsonEsc(grant.scope) # "\",\"id_token\":\"" # idToken # "\"}");
  };

  // checks every 5 minutes whether any connection is due (and prunes expired
  // SSO sessions); re-created on every upgrade (transient), no re-arm needed.
  // Declared LAST: it runs at init and closes over tick(), which touches
  // stable fields declared above.

  // ---- Desk lifecycle outbox and permission-preserving person context ----
  // New side tables preserve the deployed state contract. Initial observations
  // are taken from existing state on upgrade; historical inactive users stay quiet.
  func lifecycleSnapshot() : Map.Map<Text, Lifecycle.Observation> {
    let result = Map.empty<Text, Lifecycle.Observation>();
    for ((key, u) in users.entries()) if (directoryEligible(u)) {
      switch (pidOfKey(key)) {
        case (?pid) {
          let source = switch (connOf(u.connId)) { case (?c) c.name; case null switch (scimSourceOfConn(u.connId)) { case (?src) src.name; case null if (u.connId == 0) "Local directory" else "Directory" } };
          let account : Lifecycle.Account = { key; active = u.activeIdp; source = source # " · " # u.status };
          let previous = result.get(pid) ?? ({ accounts = []; active = false; name = u.displayName; email = u.email });
          result.add(pid, { previous with accounts = previous.accounts.concat([account]); active = previous.active or effActive(u) });
        };
        case null {};
      };
    };
    result;
  };
  let lifecycleObserved = lifecycleSnapshot();
  let lifecycleEvents = Map.empty<Nat, Support.Event>();
  var lifecycleSequence : Nat = 0;
  func observeLifecycle() {
    let current = lifecycleSnapshot();
    for ((pid, value) in current.entries()) {
      switch (lifecycleObserved.get(pid)) {
        case (?previous) {
          switch (Lifecycle.change(previous, value)) {
            case (?change) {
              lifecycleSequence += 1;
              lifecycleEvents.add(lifecycleSequence, { seq = lifecycleSequence; personId = pid; name = value.name; email = value.email; at = Time.now(); kind = change.kind; source = change.source; effectiveActive = value.active });
              if (lifecycleSequence > 20_000) lifecycleEvents.remove(lifecycleSequence - 20_000);
            };
            case null {};
          };
        };
        case null {};
      };
      lifecycleObserved.add(pid, value);
    };
    // Source deletion is administrative; remembering absence avoids a false
    // transition if that same source/account is later imported again.
    for ((pid, _) in lifecycleObserved.entries().toArray().vals()) if (not current.containsKey(pid)) lifecycleObserved.remove(pid);
  };
  func deskConnector(caller : Principal) : ?Connector {
    let c = connectorByPrincipal(caller) ?? (return null);
    let policy = appPermissionPolicies.get(c.id) ?? (return null);
    if (policy.policy.app != "desk") return null;
    ?c;
  };
  func supportViewer(caller : Principal, viewer : Text) : Bool {
    let c = deskConnector(caller) ?? (return false);
    let person = personOf(viewer) ?? (return false);
    if (person.sealedAt != 0 or pidForEmail(person.email) != viewer or accessForConn(person.email, c.id) != #active) return false;
    let policy = appPermissionPolicies.get(c.id) ?? (return false);
    let role = permissionDecision(policy.policy, person.email).role;
    role == "admin" or role == "agent";
  };
  public shared query ({ caller }) func hub_lifecycleEvents(after : Nat) : async Support.Batch {
    assert deskConnector(caller) != null;
    let out = List.empty<Support.Event>();
    var cursor = after;
    for ((seq, event) in lifecycleEvents.entries()) if (seq > after and out.size() < 50) { out.add(event); cursor := seq };
    let earliest = if (lifecycleSequence > 20_000) lifecycleSequence - 20_000 else 0;
    { events = out.toArray(); cursor; gap = after < earliest };
  };
  public shared query ({ caller }) func supportDeskUrl() : async Text {
    assert isAdmin(caller);
    let email = principalLinks.get(caller) ?? (return "");
    for ((cid, policy) in appPermissionPolicies.entries()) if (policy.policy.app == "desk" and accessForConn(email, cid) == #active) {
      let role = permissionDecision(policy.policy, email).role;
      if (role == "agent" or role == "admin") for ((tid, tile) in appLinks.entries()) if (connectorOfTile(tid) == cid and Text.startsWith(tile.url, #text "https://")) return tile.url;
    };
    "";
  };
  public shared query ({ caller }) func hub_supportSources(viewer : Text) : async [Support.Source] {
    assert supportViewer(caller, viewer);
    let out = List.empty<Support.Source>();
    for ((cid, policy) in appPermissionPolicies.entries()) if (policy.policy.app != "desk") {
      switch (connectors.get(cid)) {
        case (?c) {
          var url = "";
          for ((tid, tile) in appLinks.entries()) if (connectorOfTile(tid) == cid and Text.startsWith(tile.url, #text "https://")) url := tile.url;
          out.add({ cid; app = policy.policy.app; name = c.name; url });
        };
        case null {};
      };
    };
    out.toArray();
  };
  public shared ({ caller }) func hub_supportContext(viewer : Text, subject : Text, cid : Nat) : async Support.Context {
    if (not supportViewer(caller, viewer) or personOf(subject) == null) return Support.denied();
    let person = personOf(viewer) ?? (return Support.denied());
    let c = connectors.get(cid) ?? (return Support.unavailable());
    let policy = appPermissionPolicies.get(cid) ?? (return Support.denied());
    if (not Permissions.supported(policy.policy.app) or policy.policy.app == "desk" or accessForConn(person.email, cid) != #active) return Support.denied();
    let viewerRole = permissionDecision(policy.policy, person.email).role;
    let app : actor { hub_personContext : shared query (Text, Text, Text) -> async Support.Context } = actor (c.canisterId.toText());
    try {
      let result = await (with timeout = 15) app.hub_personContext(viewer, subject, viewerRole);
      if (not supportViewer(caller, viewer) or connectors.get(cid) != ?c or accessForConn(person.email, cid) != #active or pidForEmail(person.email) != viewer or appPermissionPolicies.get(cid) != ?policy or permissionDecision(policy.policy, person.email).role != viewerRole) return Support.denied();
      result;
    } catch (_) { Support.unavailable() };
  };

  type HardwareDesk = actor { hub_hardwareCase : shared query Nat -> async ?Hardware.Case };
  func hardwareSource(cid : Nat) : Bool = switch (appPermissionPolicies.get(cid)) { case (?p) p.policy.app == "assets"; case null false };
  func hardwareCase(caller : Principal, input : Hardware.Case) : ?Hardware.Case {
    let desk = deskConnector(caller) ?? (return null);
    if (input.desk != caller.toText() or personOf(input.person) == null) return null;
    var url = "";
    for ((tid, tile) in appLinks.entries()) if (connectorOfTile(tid) == desk.id and Text.startsWith(tile.url, #text "https://")) url := tile.url;
    ?{ input with url };
  };
  // Desk is the authority for confirmation; Assets is the authority for custody.
  // Only registered Desk can synchronize cases. No directory or Lunch writes here.
  public shared ({ caller }) func hub_syncHardware(input : Hardware.Case) : async Hardware.Progress {
    let c = hardwareCase(caller, input) ?? (return Hardware.unavailable());
    let desk = deskConnector(caller);
    let sources = connectors.entries().toArray().filter(func (cid, _) = hardwareSource(cid));
    var total = 0; var open = 0;
    for ((cid, source) in sources.vals()) {
      let app : actor { hub_syncHardware : shared Hardware.Case -> async Hardware.Progress } = actor (source.canisterId.toText());
      let result = try { await (with timeout = 15) app.hub_syncHardware(c) } catch (_) { return Hardware.unavailable() };
      if (deskConnector(caller) != desk or connectors.get(cid) != ?source or not hardwareSource(cid) or result.state != "ready") return Hardware.unavailable();
      total += result.total; open += result.open;
    };
    // Include late additions/removals rather than claiming an incomplete sweep is complete.
    if (connectors.entries().toArray().filter(func (cid, _) = hardwareSource(cid)) != sources) return Hardware.unavailable();
    { state = "ready"; sources = sources.size(); bindings = sources.map(func (cid, c) = cid.toText() # ":" # c.canisterId.toText()); total; open; checkedAt = Time.now() };
  };
  public shared ({ caller }) func hub_hardwareCheck(deskId : Text, ticket : Nat, viewer : Text) : async ?Hardware.Case {
    let source = connectorByPrincipal(caller) ?? (return null);
    let policy = appPermissionPolicies.get(source.id) ?? (return null);
    let person = personOf(viewer) ?? (return null);
    if (not hardwareSource(source.id) or pidForEmail(person.email) != viewer or accessForConn(person.email, source.id) != #active or permissionDecision(policy.policy, person.email).role != "admin") return null;
    let desk = connectors.values().find(func c = c.canisterId.toText() == deskId) ?? (return null);
    if (deskConnector(desk.canisterId) == null) return null;
    let app : HardwareDesk = actor (deskId);
    let result = try { await (with timeout = 15) app.hub_hardwareCase(ticket) } catch (_) { return null };
    if (connectorByPrincipal(caller) != ?source or appPermissionPolicies.get(source.id) != ?policy or pidForEmail(person.email) != viewer or accessForConn(person.email, source.id) != #active or permissionDecision(policy.policy, person.email).role != "admin" or connectors.get(desk.id) != ?desk or deskConnector(desk.canisterId) == null) return null;
    hardwareCase(desk.canisterId, result ?? (return null));
  };

  transient let _autoSyncTimer = Timer.recurringTimer<system>(#seconds 300, func() : async () { await tick() });
  // push lane: every 15 min the scoped, lane-filtered directory goes into hub_upsert of apps that asked for it
  transient let _pushTimer = Timer.recurringTimer<system>(#seconds 900, func() : async () {
    let ids = List.empty<Nat>();
    for ((cid, ls) in Map.entries(connectorLanes)) if (has(ls, "push")) List.add(ids, cid);
    for (cid in List.toArray(ids).vals()) await pushDirectoryTo(cid);
  });

  // notification sweep: retry queued Slack DMs (e.g. after an upgrade killed
  // the one-shot timer) and prune old notifications + dedupe keys. Declared
  // last for the same definedness reason as the auto-sync timer.
  transient let _notifTimer = Timer.recurringTimer<system>(#seconds 120, func() : async () { migrateLegacySlackBot(); notifPrune(); reconcilePersons(); pruneAssistants(); await deliverSlack() });
  // person registry (0.17): mint the seed once, give every account an id, apply pending renames — after install and after every upgrade
  transient let _pidTimer = Timer.setTimer<system>(#seconds 0, func() : async () { await pidBootstrap() });
  // Operations is a read surface, never a second permission system.
  // Bootstrap controllers without an active person cannot impersonate an employee.
  func operationsViewer(caller : Principal, cid : Nat) : ?Text {
    if (Principal.isAnonymous(caller) or not isAdmin(caller)) return null;
    let email = principalLinks.get(caller) ?? (return null);
    let pid = pidForEmail(email);
    let person = personOf(pid) ?? (return null);
    let policy = appPermissionPolicies.get(cid) ?? (return null);
    if (person.sealedAt != 0 or person.email != email or not Operations.supported(policy.policy.app) or accessForConn(email, cid) != #active or permissionDecision(policy.policy, email).role != "admin") return null;
    ?pid;
  };
  public shared query ({ caller }) func operationsSources() : async [Support.Source] {
    assert not Principal.isAnonymous(caller) and isAdmin(caller);
    let out = List.empty<Support.Source>();
    for ((cid, policy) in appPermissionPolicies.entries()) if (operationsViewer(caller, cid) != null) {
      switch (connectors.get(cid)) {
        case (?c) {
          var url = "";
          for ((tid, tile) in appLinks.entries()) if (connectorOfTile(tid) == cid and Text.startsWith(tile.url, #text "https://")) url := tile.url;
          out.add({ cid; app = policy.policy.app; name = c.name; url });
        };
        case null {};
      };
    };
    out.toArray();
  };
  public shared ({ caller }) func operationsSnapshot(cid : Nat) : async Operations.Snapshot {
    let viewer = operationsViewer(caller, cid) ?? (return Operations.denied());
    let c = connectors.get(cid) ?? (return Operations.unavailable());
    let policy = appPermissionPolicies.get(cid);
    let source : actor { hub_operations : shared query Text -> async Operations.Snapshot } = actor (c.canisterId.toText());
    let result = try { await (with timeout = 15) source.hub_operations(viewer) } catch (_) { Operations.unavailable() };
    if (operationsViewer(caller, cid) != ?viewer or connectors.get(cid) != ?c or appPermissionPolicies.get(cid) != policy) return Operations.denied();
    if (result.schema != 1 or result.metrics.size() > 32 or result.metrics.any(func (key, value) = key.size() > 32 or value > 9_007_199_254_740_991) or result.checkedAt > Time.now() or Time.now() - result.checkedAt > 60_000_000_000) return Operations.unavailable();
    result;
  };


  // Approved screens persist through compatible upgrades. Pairing requests and call
  // budgets are transient; an interrupted pairing can safely be started again.
  let operationsDisplays : Map.Map<Text, Displays.Grant> = Map.empty<Text, Displays.Grant>();
  var operationsDisplayNext : Nat = 0;
  transient let operationsPairs : Map.Map<Text, Displays.Pending> = Map.empty<Text, Displays.Pending>();
  transient var operationsPairWindow : Int = 0;
  transient var operationsPairCount : Nat = 0;
  transient let operationsDisplayReads : Map.Map<Text, Int> = Map.empty<Text, Int>();
  transient let DISPLAY_MINUTE : Int = 60_000_000_000;
  transient let DISPLAY_DAY : Int = 86_400_000_000_000;

  func displayOwner(caller : Principal) : ?Text {
    if (Principal.isAnonymous(caller) or not isOwnerRole(caller)) return null;
    let email = principalLinks.get(caller) ?? (return null);
    let pid = pidForEmail(email);
    let person = personOf(pid) ?? (return null);
    if (person.sealedAt != 0 or person.email != email or accessOf(email) != #active) return null;
    ?pid;
  };
  func displayActive(grant : Displays.Grant) : Bool {
    grant.expiresAt > Time.now() and displayOwner(grant.by) == ?grant.personId;
  };
  func displayScope(grant : Displays.Grant, cid : Nat) : ?Displays.Scope {
    if (not displayActive(grant) or operationsViewer(grant.by, cid) != ?grant.personId) return null;
    let scope = grant.scopes.find(func s = s.cid == cid) ?? (return null);
    let conn = connectors.get(cid) ?? (return null);
    let policy = appPermissionPolicies.get(cid) ?? (return null);
    if (conn.canisterId != scope.canisterId or policy.policy.app != scope.app) return null;
    ?scope;
  };
  func displayPrune() {
    let now = Time.now();
    for ((code, p) in operationsPairs.entries().toArray().vals()) if (p.expiresAt <= now) ignore operationsPairs.delete(code);
    for ((hash, g) in operationsDisplays.entries().toArray().vals()) if (g.expiresAt + 30 * DISPLAY_DAY < now) ignore operationsDisplays.delete(hash);
    for ((key, at) in operationsDisplayReads.entries().toArray().vals()) if (now - at > DISPLAY_MINUTE) ignore operationsDisplayReads.delete(key);
  };
  public shared query ({ caller }) func operationsDisplayAdmin() : async { canManage : Bool; displays : [Displays.View] } {
    if (displayOwner(caller) == null) return { canManage = false; displays = [] };
    let out = List.empty<Displays.View>();
    for ((_, g) in operationsDisplays.entries()) out.add({ id = g.id; name = g.name; createdAt = g.createdAt; expiresAt = g.expiresAt; sources = Displays.sources(g); active = displayActive(g) });
    { canManage = true; displays = out.toArray() };
  };
  // No authority is granted here. Approval is a separate authenticated Owner action.
  // Browser randomness supplies a 256-bit secret; only its hash is registered/stored.
  public shared func operationsDisplayPair(code : Text, keyHash : Text) : async Displays.PairResult {
    if (not Displays.hex(code, 10) or not Displays.hex(keyHash, 64)) return #invalid;
    displayPrune();
    let now = Time.now();
    if (operationsDisplays.containsKey(keyHash)) return #invalid;
    let codeHash = scimHash(code);
    switch (operationsPairs.get(codeHash)) {
      case (?p) { if (p.keyHash == keyHash) return #ok(p.expiresAt); return #busy };
      case null {};
    };
    if (operationsPairs.values().any(func p = p.keyHash == keyHash)) return #busy;
    if (now - operationsPairWindow >= DISPLAY_MINUTE) { operationsPairWindow := now; operationsPairCount := 0 };
    if (operationsPairs.size() >= 64 or operationsPairCount >= 12) return #busy;
    operationsPairCount += 1;
    let expiresAt = now + 10 * DISPLAY_MINUTE;
    operationsPairs.add(codeHash, { keyHash; expiresAt });
    #ok(expiresAt);
  };
  public shared ({ caller }) func operationsDisplayApprove(code : Text, name : Text, cids : [Nat], days : Nat) : async Displays.Approval {
    let personId = displayOwner(caller) ?? (return #denied);
    if (not Displays.hex(code, 10) or name.size() == 0 or name.size() > 60 or name.chars().any(func c = c < ' ') or cids.size() == 0 or cids.size() > 5 or (days != 1 and days != 7 and days != 30)) return #invalid;
    displayPrune();
    let codeHash = scimHash(code);
    let pending = operationsPairs.get(codeHash) ?? (return #missing);
    if (operationsDisplays.size() >= 100 or operationsDisplays.values().filter(func g = displayActive(g)).toArray().size() >= 20) return #limit;
    let scopes = List.empty<Displays.Scope>();
    for (cid in cids.vals()) {
      if (operationsViewer(caller, cid) != ?personId) return #denied;
      let c = connectors.get(cid) ?? (return #invalid);
      let policy = appPermissionPolicies.get(cid) ?? (return #invalid);
      if (scopes.values().any(func s = s.cid == cid or s.app == policy.policy.app)) return #invalid;
      scopes.add({ cid; app = policy.policy.app; canisterId = c.canisterId });
    };
    ignore operationsPairs.delete(codeHash);
    operationsDisplayNext += 1;
    let id = operationsDisplayNext;
    let now = Time.now();
    operationsDisplays.add(pending.keyHash, { id; name; by = caller; personId; createdAt = now; expiresAt = now + days * DISPLAY_DAY; scopes = scopes.toArray() });
    journal("display", "Screen " # id.toText() # " approved: " # name # " (" # cids.size().toText() # " sources, " # days.toText() # " days)", caller);
    #ok(id);
  };
  public shared ({ caller }) func operationsDisplayRevoke(id : Nat) : async Bool {
    if (displayOwner(caller) == null) return false;
    for ((hash, g) in operationsDisplays.entries()) if (g.id == id) {
      ignore operationsDisplays.delete(hash);
      journal("display", "Screen " # id.toText() # " revoked: " # g.name, caller);
      return true;
    };
    false;
  };
  // Update rather than uncertified query: these responses control what a public
  // display is permitted to keep on screen. No authenticated Hub session is used.
  public shared func operationsDisplayState(secret : Text) : async Displays.State {
    if (not Displays.hex(secret, 64)) return #ended;
    let hash = scimHash(secret);
    switch (operationsDisplays.get(hash)) {
      case (?g) {
        if (not displayActive(g)) return #ended;
        #ready({ id = g.id; name = g.name; expiresAt = g.expiresAt; checkedAt = Time.now(); sources = Displays.sources(g) });
      };
      case null {
        for (p in operationsPairs.values()) if (p.keyHash == hash and p.expiresAt > Time.now()) return #pending(p.expiresAt);
        #ended;
      };
    };
  };
  public shared func operationsDisplayForget(secret : Text) : async () {
    if (not Displays.hex(secret, 64)) return;
    let hash = scimHash(secret);
    switch (operationsDisplays.get(hash)) {
      case (?g) { ignore operationsDisplays.delete(hash); journal("display", "Screen " # g.id.toText() # " disconnected on device", Principal.anonymous()) };
      case null {};
    };
    for ((code, p) in operationsPairs.entries().toArray().vals()) if (p.keyHash == hash) ignore operationsPairs.delete(code);
  };
  public shared func operationsDisplaySnapshot(secret : Text, cid : Nat) : async Operations.Snapshot {
    if (not Displays.hex(secret, 64)) return Operations.denied();
    let hash = scimHash(secret);
    let grant = operationsDisplays.get(hash) ?? (return Operations.denied());
    let scope = displayScope(grant, cid) ?? (return Operations.denied());
    let c = connectors.get(cid) ?? (return Operations.denied());
    let policy = appPermissionPolicies.get(cid);
    displayPrune();
    let readKey = hash # ":" # cid.toText();
    if (Time.now() - (operationsDisplayReads.get(readKey) ?? 0) < 10_000_000_000) return Operations.unavailable();
    operationsDisplayReads.add(readKey, Time.now());
    let source : actor { hub_operations : shared query Text -> async Operations.Snapshot } = actor (c.canisterId.toText());
    let result = try { await (with timeout = 15) source.hub_operations(grant.personId) } catch (_) { Operations.unavailable() };
    if (operationsDisplays.get(hash) != ?grant or displayScope(grant, cid) != ?scope or connectors.get(cid) != ?c or appPermissionPolicies.get(cid) != policy) return Operations.denied();
    if (result.schema != 1 or result.metrics.size() > 32 or result.metrics.any(func (key, value) = key.size() > 32 or value > 9_007_199_254_740_991) or result.checkedAt > Time.now() or Time.now() - result.checkedAt > DISPLAY_MINUTE) return Operations.unavailable();
    Displays.filter(scope.app, result);
  };

};
