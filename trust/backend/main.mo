import Operations "mo:kebab-hub/Operations";
/// kebab-stack trust — is every work device in good shape? Checked the honest way.
///
/// A small read-only agent (osquery, the open-source standard) runs on each
/// device and reports plain facts — is the disk encrypted, is the screen lock
/// on, is the firewall up. This canister is the server the agents talk to: it
/// enrols them, hands out the checks, collects the answers and scores every
/// device. Admins see the fleet and can ask it questions (in plain language
/// with the hub's AI key, or in osquery SQL). Everyone else sees their own
/// devices — and the exact list of checks, because nothing is inspected in
/// secret. When a check on your device fails, the hub tells you.
///
/// Sign-in, people and the AI key come from the hub (mo:kebab-hub). Who owns
/// which device comes from the assets app (serial → person), with a manual
/// fallback here.
///
/// Stable-state rules: every top-level let/var is stable and append-only —
/// never remove or rename one; new data goes into new side tables.

import Hub "mo:kebab-hub";
import AgentDeployment "lib/AgentDeployment";
import Support "mo:kebab-hub/Support";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat16 "mo:core/Nat16";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Timer "mo:core/Timer";
import Error "mo:core/Error";
import Json "mo:json";

persistent actor Trust {
  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = ""; // hub BACKEND canister id
  var owner : ?Principal = null; // controller who ran setHub (CLI bootstrap)
  var appUrl : Text = ""; // this app's frontend URL (deep links in notifications)
  var orgName : Text = "";
  var adminGroup : Text = "trust-admins"; // hub group → admins of device trust
  var adminEmails : [Text] = []; // bootstrap admins (claimAdmin / addAdminEmail)
  var adminClaimed : Bool = false; // claimAdmin is one-shot
  var assetsId : Text = ""; // assets BACKEND canister id — where device owners come from
  var gatewayDomain : Text = "icp.net"; // the HTTP gateway agents connect through: <backend-id>.<domain>
  transient let BUILD_VERSION : Text = "0.9.1";
  transient let H : Int = 3_600_000_000_000;
  transient let DAY : Int = 86_400_000_000_000;

  // =====================================================================
  // hub SDK state
  // =====================================================================
  let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
  let ids : Map.Map<Text, Text> = Map.empty<Text, Text>(); // address -> hub person id (0.2.0) — device owners store the id
  let former : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // id -> last row of a person whose address moved on
  let groupsCache : Map.Map<Text, [Text]> = Map.empty<Text, [Text]>();
  var lastDirectoryPull : Int = 0;
  transient var directoryEpoch : Nat = 0;
  transient var directoryPullRunning : Bool = false;

  type IC = actor { raw_rand : () -> async Blob };
  transient let ic00 : IC = actor "aaaaa-aa";

  type LogRow = { at : Int; who : Text; what : Text };
  let adminLog : Map.Map<Nat, LogRow> = Map.empty<Nat, LogRow>();
  var nextLogId : Nat = 1;

  // =====================================================================
  // helpers
  // =====================================================================
  func lower(t : Text) : Text = Text.toLower(t);
  func norm(t : Text) : Text = Text.trim(t, #char ' ');
  func now() : Int = Time.now();
  func has(xs : [Text], x : Text) : Bool { for (y in xs.vals()) if (y == x) return true; false };
  func hex(b : Blob) : Text {
    func digit(n : Nat) : Text = Char.toText(Nat32.toChar(Nat.toNat32(if (n < 10) 48 + n else 87 + n)));
    var t = "";
    for (x in Blob.toArray(b).vals()) { let n = Nat8.toNat(x); t #= digit(n / 16) # digit(n % 16) };
    t;
  };
  func log(who : Text, what : Text) {
    Map.add(adminLog, Nat.compare, nextLogId, { at = now(); who; what });
    nextLogId += 1;
    if (nextLogId > 2000) ignore Map.delete(adminLog, Nat.compare, nextLogId - 2000 : Nat);
  };
  func capText(t : Text, n : Nat) : Text {
    if (t.size() <= n) return t;
    var out = ""; var i = 0;
    for (c in t.chars()) { if (i >= n) return out # "…"; out #= Char.toText(c); i += 1 };
    out;
  };
  func jesc(t : Text) : Text {
    var out = "";
    for (ch in t.chars()) {
      switch (ch) {
        case ('\"') out #= "\\\"";
        case ('\\') out #= "\\\\";
        case ('\n') out #= "\\n";
        case ('\r') out #= "\\r";
        case ('\t') out #= "\\t";
        case (c) { if (Char.toNat32(c) < 32) out #= " " else out #= Char.toText(c) };
      };
    };
    out;
  };
  func jstr(j : Json.Json, path : Text) : Text { switch (Json.getAsText(j, path)) { case (#ok(t)) t; case (_) "" } };
  func upperSerial(s : Text) : Text = Text.toUpper(norm(s));
  /// Letters, digits, . _ - only: safe inside a root-run installer script and a URL.
  func tokenSafe(t : Text, minLen : Nat, maxLen : Nat) : Bool {
    let n = t.size();
    if (n < minLen or n > maxLen) return false;
    for (c in t.chars()) {
      let ok = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '.' or c == '_' or c == '-';
      if (not ok) return false;
    };
    true;
  };
  func maskSecret(t : Text) : Text {
    if (t == "") return "";
    let n = t.size();
    if (n <= 8) return "••••";
    let arr = Text.toArray(t);
    var tail = ""; var i : Nat = n - 4;
    while (i < n) { tail #= Char.toText(arr[i]); i += 1 };
    "••••…" # tail;
  };
  func isDemo(nodeKey : Text) : Bool = Text.startsWith(nodeKey, #text "demo-");

  // =====================================================================
  // people & roles (from the hub directory)
  // =====================================================================
  func groupsOfEmail(email : Text) : [Text] {
    let e = lower(email);
    let fromDir = switch (Map.get(people, Text.compare, e)) {
      case (?u) { let g = Hub.attribute(u, "groups"); if (g == "") [] else Text.split(g, #char ';').toArray() };
      case null [];
    };
    if (Map.containsKey(people, Text.compare, e)) return fromDir;
    switch (Map.get(groupsCache, Text.compare, e)) { case (?c) c; case null [] };
  };
  func inGroup(email : Text, group : Text) : Bool = group != "" and has(groupsOfEmail(email), group);
  func hubRoleOf(email : Text) : Text = switch (Map.get(people, Text.compare, lower(email))) { case (?u) Hub.attribute(u, "hubRole"); case null "" };
  /// admin: bootstrap list · admins group · hub owner/admin — runs device trust (checks, enrolment, questions).
  /// helpdesk: hub helpdesk — sees the whole fleet and every device, changes nothing.
  /// member: everyone else in the directory — sees their own devices and the list of checks.
  // Historical migration evidence only. Never use this to authorize a request.
  func legacyRoleOf(email : Text) : Text {
    let e = lower(email);
    let hr = hubRoleOf(e);
    if (has(adminEmails, e) or inGroup(e, adminGroup) or hr == "owner" or hr == "admin") return "admin";
    if (hr == "helpdesk") return "helpdesk";
    "member";
  };
  func roleOf(email : Text) : Text {
    let role = Hub.appRole(people, lower(email), "trust");
    if (role == "viewer") return "helpdesk";
    role;
  };
  func legacyRoleSourceOf(email : Text) : Text {
    let e = lower(email);
    if (has(adminEmails, e)) return "bootstrap admin list";
    if (inGroup(e, adminGroup)) return "hub group " # adminGroup;
    let hr = hubRoleOf(e);
    if (hr != "") return "hub " # hr;
    "directory member";
  };
  func roleSourceOf(email : Text) : Text = Hub.appRoleSource(people, lower(email));
  /// Display name for a stored person id (tolerates a bare address from records older than 0.2.0).
  func nameOf(pid : Text) : Text {
    if (pid == "") return "";
    if (Text.contains(pid, #char '@') and not Text.startsWith(pid, #text "legacy:")) {
      return switch (Map.get(people, Text.compare, lower(pid))) { case (?u) { if (u.displayName != "") u.displayName else pid }; case null pid };
    };
    let p = Hub.personById(people, ids, former, pid);
    if (p.displayName != "") p.displayName else if (p.email != "") p.email else pid;
  };
  func knownPerson(email : Text) : Bool = Map.containsKey(people, Text.compare, lower(email));
  func pidOf(email : Text) : Text = Hub.pidOf(ids, email);
  /// current address of a stored id ("" when the person left and the address moved on)
  func emailOfPid(pid : Text) : Text = if (Text.contains(pid, #char '@') and not Text.startsWith(pid, #text "legacy:")) lower(pid) else Hub.emailOf(ids, pid);
  /// owners may arrive as addresses (assets < 0.6.0, older manual entries) or ids — store ids
  func asPid(x : Text) : Text = if (x == "") "" else if (Text.contains(x, #char '@') and not Text.startsWith(x, #text "legacy:")) pidOf(x) else x;

  /// id = the hub's stable person id — what device ownership stores. email = current address (roles, display).
  type Me = { id : Text; email : Text; displayName : Text; role : Text };
  func me(tok : Text) : ?Me {
    if (not Hub.directoryFresh(lastDirectoryPull)) return null;
    switch (Hub.session(sessions, tok)) {
      case (?s) { if (not Hub.isActive(people, s.email) or roleOf(s.email) == "none") return null; ?{ id = pidOf(s.email); email = s.email; displayName = s.displayName; role = roleOf(s.email) } };
      case null null;
    };
  };
  func admin(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (m.role == "admin") ?m else null }; case null null };
  func staff(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (m.role == "admin" or m.role == "helpdesk") ?m else null }; case null null };

  // =====================================================================
  // bootstrap (CLI) & settings
  // =====================================================================
  public shared ({ caller }) func setHub(id : Text) : async Bool {
    assert Principal.isController(caller);
    let configured = Principal.fromText(norm(id));
    assert not configured.isAnonymous();
    directoryEpoch += 1;
    sessions.clear(); people.clear(); ids.clear(); former.clear(); groupsCache.clear(); lastDirectoryPull := 0;
    owner := ?caller;
    hubId := norm(id);
    log(Principal.toText(caller), "hub set to " # hubId);
    true;
  };
  public shared ({ caller }) func addAdminEmail(email : Text) : async Bool {
    assert Principal.isController(caller);
    false;
  };
  /// First-run claim: while nobody is admin yet, a signed-in hub owner/admin becomes one.
  public shared func claimAdmin(tok : Text) : async { ok : Bool; detail : Text } {
    { ok = false; detail = "App permissions are managed only in the Hub" };
  };
  func adminCount() : Nat { var n = 0; for ((e, u) in Map.entries(people)) if (u.active and roleOf(e) == "admin") n += 1; n };
  func needsClaim() : Bool = false;

  public type Settings = {
    hubId : Text; appUrl : Text; orgName : Text; adminGroup : Text; adminEmails : [Text]; peopleCount : Nat; lastDirectoryPull : Int; adminCount : Nat;
    assetsId : Text; ownersCount : Nat; ownersPulledAt : Int; ownersLastError : Text; manualOwners : Nat; selfId : Text; backendHost : Text; gatewayDomain : Text;
    enrollFingerprint : Text; enrollConfigured : Bool;
    versionMode : Text; pinnedVersion : Text; stableVersion : Text; effectiveVersion : Text;
    tuneDistInterval : Nat; tuneWatchdogMem : Nat; tuneWatchdogUtil : Nat; tuneScheduleSplay : Nat; configVersion : Nat;
    ai : AiState; demoSeeded : Bool;
  };
  public shared query func getSettings(tok : Text) : async ?Settings {
    switch (admin(tok)) {
      case null null;
      case (?_) ?{
        hubId; appUrl; orgName; adminGroup = ""; adminEmails = []; peopleCount = Map.size(people); lastDirectoryPull; adminCount = adminCount();
        assetsId; ownersCount = Map.size(serialOwner); ownersPulledAt; ownersLastError; manualOwners = Map.size(manualOwner); selfId = Principal.toText(Principal.fromActor(Trust)); backendHost = selfHost(); gatewayDomain;
        enrollFingerprint = maskSecret(enrollSecret); enrollConfigured = enrollSecret != "";
        versionMode; pinnedVersion = agentVersion; stableVersion; effectiveVersion = effectiveVersion();
        tuneDistInterval; tuneWatchdogMem; tuneWatchdogUtil; tuneScheduleSplay; configVersion;
        ai = aiState(); demoSeeded;
      };
    };
  };
  public shared func setSettings(tok : Text, args : { adminGroup : Text; appUrl : Text; orgName : Text; assetsId : Text; gatewayDomain : Text }) : async { ok : Bool; detail : Text } {
    if (norm(args.adminGroup) != "") return { ok = false; detail = "Role settings have moved to Hub Permissions" };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (args.appUrl != "" and not Text.startsWith(args.appUrl, #text "https://")) return { ok = false; detail = "app url must start with https://" };
    let aid = norm(args.assetsId);
    if (aid != "") { if (not principalLooksValid(aid)) return { ok = false; detail = "the assets canister id does not look like a canister id (xxxxx-xxxxx-…-cai)" } };
    let gd = lower(norm(args.gatewayDomain));
    if (gd == "" or not tokenSafe(gd, 3, 80) or not Text.contains(gd, #char '.')) return { ok = false; detail = "gateway domain must look like icp.net" };
    let assetsChanged = aid != assetsId;
    appUrl := norm(args.appUrl); orgName := norm(args.orgName); assetsId := aid; gatewayDomain := gd;
    log(m.email, "settings updated");
    if (assetsChanged) { serialOwner.clear(); ownersPulledAt := 0; ownersLastError := ""; if (aid != "") ignore await pullOwners() };
    { ok = true; detail = "" };
  };
  func principalLooksValid(t : Text) : Bool {
    if (t.size() < 5 or t.size() > 63) return false;
    for (c in t.chars()) { let ok = (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-'; if (not ok) return false };
    true;
  };
  public shared func setAdminEmails(tok : Text, emails : [Text]) : async { ok : Bool; detail : Text } {
    { ok = false; detail = "App permissions are managed only in the Hub" };
  };
  public shared query func adminLogRows(tok : Text) : async [LogRow] {
    switch (admin(tok)) {
      case null [];
      case (?_) { let out = List.empty<LogRow>(); for ((_, r) in Map.reverseEntries(adminLog)) { if (List.size(out) < 200) List.add(out, r) }; List.toArray(out) };
    };
  };

  // =====================================================================
  // hub connector contract (the hub is the only caller)
  // =====================================================================
  public shared ({ caller }) func hub_upsert(rows : [Hub.DirectoryRow]) : async Nat {
    assert Hub.isHub(caller, hubId); directoryEpoch += 1;
    Hub.upsertRows(people, ids, former, sessions, rows); // same hand-over protection as the 30-s sync (a re-issued address ends the old holder's sessions)
  };
  public shared ({ caller }) func hub_deactivate(emails : [Text]) : async Nat {
    assert Hub.isHub(caller, hubId); directoryEpoch += 1;
    ignore Hub.endSessionsOf(sessions, emails);
    Hub.deactivate(people, emails);
  };
  /// The Hub brokers this read for a signed-in Desk agent. The viewer retains
  /// their ordinary app permissions; this endpoint never grants extra access.
  public shared query ({ caller }) func hub_personContext(viewer : Text, subject : Text, viewerRole : Text) : async Support.Context {
    assert Hub.isHub(caller, hubId);
    let email = emailOfPid(viewer);
    if (not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or roleOf(email) == "none" or Hub.appRole(people, email, "trust") != viewerRole) return Support.denied();
    if (roleOf(email) == "member" and viewer != subject) return Support.denied();
    let out = List.empty<Support.Item>();
    for ((_, n) in nodes.entries()) if (ownerOfSerial(n.hardwareSerial) == subject) {
      let v = toView(n);
      out.add({ id = n.hardwareSerial; kind = "device posture"; title = n.hostname; detail = n.hardwareSerial # " · " # v.assessment.passed.toText() # " of " # v.assessment.expected.toText() # " verified passing"; status = switch (v.assessment.state) { case ("passing") "checks passing"; case ("attention") "needs attention"; case ("stale") "stale checks"; case ("error") "check unavailable"; case (_) "not fully assessed" }; path = "#/d/" # v.nodeKey; historical = false });
    };
    Support.ready(out.toArray());
  };

  public shared query func hub_ping() : async Text { "trust" };

  public shared ({ caller }) func hub_permissionStatus() : async Hub.PermissionStatus {
    assert Hub.isHub(caller, hubId);
    let expectedHub = hubId;
    try { ignore await pullDirectory() } catch (_) {};
    assert hubId == expectedHub and Hub.isHub(caller, hubId);
    let legacy = List.empty<Hub.LegacyGrant>();
    for ((email, u) in people.entries()) {
      let role = legacyRoleOf(email);
      if (u.active and role != "member" and role != "requester") legacy.add({ email; role; source = legacyRoleSourceOf(email) });
    };
    for (email in adminEmails.vals()) if (not legacy.toArray().any(func x = x.email == email)) legacy.add({ email; role = "admin"; source = "Retired local admin list" });

    { app = "trust"; model = 1; revision = Hub.permissionRevision(people, "trust"); directoryAt = lastDirectoryPull; legacy = legacy.toArray(); legacyGroups = [{ name = adminGroup; role = "admin" }] };
  };
  public shared query func hub_manifest() : async Hub.Manifest {
    {
      name = "trust"; version = BUILD_VERSION; description = "Is every work device in good shape? Read-only checks, scored per device, with the exact list of checks open to everyone";
      needs = ["identity", "roles", "notify"]; // roles: hub staff run device trust; notify: tell a person when a check on their device fails
      wants = ["groups", "ai"]; // groups: the admins group; ai: plain-language questions to the fleet with the company key
    };
  };
  public shared query func hub_usesGroup(_name : Text) : async [Text] { [] };

  func pullDirectory() : async Nat {
    if (hubId == "" or directoryPullRunning) return 0;
    directoryPullRunning := true;
    let expectedHub = hubId;
    let requestedAt = now();
    let epoch = directoryEpoch;
    try {
      let rows = await (with timeout = 30) Hub.hub(expectedHub).connectorDirectory();
      // A push or a configuration change received during the call wins.
      if (hubId != expectedHub or directoryEpoch != epoch) return 0;
      let n = Hub.syncDirectory(people, ids, former, sessions, rows);
      groupsCache.clear();
      lastDirectoryPull := requestedAt;
      n;
    } finally { directoryPullRunning := false };
  };

  // =====================================================================
  // sign-in (hub ticket lane)
  // =====================================================================
  public shared func loginWithTicket(ticket : Text) : async ?{ token : Text; email : Text; displayName : Text; role : Text; suiteToken : Text } {
    if (hubId == "" or not Hub.ticketLooksValid(ticket)) return null;
    let expectedHub = hubId;
    let r = await Hub.hub(expectedHub).redeemTicket(ticket);
    if (not r.ok or hubId != expectedHub) return null;
    if (not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull) or roleOf(r.email) == "none") { try { ignore await pullDirectory() } catch (_) {} };
    if (hubId != expectedHub or not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull) or roleOf(r.email) == "none") return null;
    try { Map.add(groupsCache, Text.compare, lower(r.email), await Hub.hub(hubId).groupsOf(r.email)) } catch (_) {};
    await refreshHubAi(); await refreshAiStatus();
    let tok = hex(await ic00.raw_rand());
    if (hubId != expectedHub or not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull) or roleOf(r.email) == "none") return null;
    ignore Hub.mintSession(sessions, tok, r.email, r.displayName, 10 * H);
    // suiteToken: the hub's read-only token for the shared topbar (bell, menu, name, picture) — passed through, never stored
    ?{ token = tok; email = lower(r.email); displayName = r.displayName; role = roleOf(r.email); suiteToken = (switch (r.suiteToken) { case (?t) t; case null "" }) };
  };
  public shared query func whoami(tok : Text) : async ?{ id : Text; email : Text; displayName : Text; role : Text; roleSource : Text; orgName : Text; hubId : Text; needsClaim : Bool; aiOn : Bool; ai : AiState; enrollConfigured : Bool; ownersConfigured : Bool } {
    switch (me(tok)) {
      case null null;
      case (?m) ?{ id = m.id; email = m.email; displayName = m.displayName; role = m.role; roleSource = roleSourceOf(m.email); orgName; hubId; needsClaim = false; aiOn = aiSource() != ""; ai = aiState(); enrollConfigured = enrollSecret != ""; ownersConfigured = assetsId != "" };
    };
  };
  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };
  public shared query func directory(tok : Text, q : Text) : async [{ email : Text; displayName : Text; department : Text }] {
    switch (staff(tok)) {
      case null [];
      case (?_) {
        let needle = lower(norm(q));
        let out = List.empty<{ email : Text; displayName : Text; department : Text }>();
        for ((e, u) in Map.entries(people)) {
          if (u.active and (needle == "" or Text.contains(e, #text needle) or Text.contains(lower(u.displayName), #text needle))) {
            if (List.size(out) < 12) List.add(out, { email = e; displayName = u.displayName; department = Hub.attribute(u, "department") });
          };
        };
        List.toArray(out);
      };
    };
  };
  public shared query func info() : async { orgName : Text; hubId : Text; hubSet : Bool; appUrl : Text; version : Text } {
    { orgName; hubId; hubSet = hubId != ""; appUrl; version = BUILD_VERSION };
  };
  public shared func syncNow(tok : Text) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    let n = try { await pullDirectory() } catch (e) { return { ok = false; detail = Error.message(e) } };
    { ok = true; detail = Nat.toText(n) # " people" };
  };

  // =====================================================================
  // AI — the company's key from the hub (lane "ai"), never stored here
  // =====================================================================
  transient var hubAi : ?Hub.AiCredentials = null;
  transient var hubAiAt : Int = 0;
  transient var hubAiTried : Bool = false;
  func refreshHubAi() : async () {
    if (hubId == "") return;
    if (hubAiTried and now() - hubAiAt < 5 * 60_000_000_000) return;
    hubAiTried := true; hubAiAt := now();
    hubAi := try { await Hub.hub(hubId).hub_aiCredentials() } catch (_) { null };
  };
  func aiSource() : Text = switch (hubAi) { case (?_) "hub"; case null "" };
  transient var aiKeySet : Bool = false;
  transient var aiLane : Bool = false;
  transient var aiConnId : Nat = 0;
  func refreshAiStatus() : async () {
    if (hubId == "") return;
    switch (try { await Hub.hub(hubId).hub_aiStatus() } catch (_) { null }) {
      case (?st) { aiKeySet := st.keySet; aiLane := st.laneGranted; aiConnId := st.connectorId };
      case null {};
    };
  };
  public type AiState = { source : Text; keySet : Bool; laneGranted : Bool; connectorId : Nat; model : Text };
  func aiState() : AiState = { source = aiSource(); keySet = aiKeySet; laneGranted = aiLane; connectorId = aiConnId; model = (switch (hubAi) { case (?c) c.provider # " · " # c.model; case null "" }) };
  public shared func refreshAi(tok : Text) : async { ok : Bool; detail : Text; state : AiState } {
    switch (me(tok)) { case null return { ok = false; detail = "no session"; state = aiState() }; case (?_) {} };
    hubAiTried := false;
    await refreshHubAi();
    await refreshAiStatus();
    let st = aiState();
    switch (hubAi) {
      case (?c) ({ ok = true; detail = "AI from the hub: " # c.provider # " · " # c.model; state = st });
      case null ({ ok = false; detail = (if (not aiKeySet) "no AI key in the hub yet — an owner sets one under Settings → AI" else if (not aiLane) "the hub has a key, but this app was not granted the AI lane — Apps → Trust → Edit → What it may know" else "the hub did not hand out the key — try again in a minute"); state = st });
    };
  };

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
    is_replicated : ?Bool; // false: single node, no consensus — right for answers that differ every time
  };
  transient let icHttp : actor { http_request : HttpRequestArgs -> async HttpResponsePayload } = actor ("aaaaa-aa");

  func stripFences(t : Text) : Text {
    var s = Text.trim(t, #char ' ');
    s := Text.trim(s, #char '\n');
    s := Text.replace(s, #text "```sql", "");
    s := Text.replace(s, #text "```json", "");
    s := Text.replace(s, #text "```", "");
    Text.trim(s, #predicate(func(c) = c == ' ' or c == '\n' or c == '\r' or c == '\t' or c == ';'));
  };
  func aiPrompt(os : Text) : Text {
    let host = switch (os) { case ("windows") "a Windows host"; case ("linux") "a Linux host"; case ("macos") "a macOS (darwin) host"; case (_) "a macOS (darwin) host unless the question names another operating system" };
    "You are an osquery expert. Convert the user's question into EXACTLY ONE read-only osquery SQL SELECT for " # host # ". osquery speaks SQLite. Output ONLY the SQL: no prose, no code fences, no trailing semicolon, a single statement.\n" #
    "\nCRITICAL osquery rules:\n" #
    "- PER-USER tables return ZERO rows unless you JOIN the users table on uid. This is the #1 mistake. It applies to: chrome_extensions, chrome_extension_content_scripts, safari_extensions, firefox_addons, browser_plugins, shell_history, crontab, authorized_keys. Pattern: SELECT u.username, x.* FROM users u JOIN chrome_extensions x USING (uid).\n" #
    "- SELECT only; never modify data; no ATTACH, no PRAGMA, no semicolons.\n" #
    "- Reference only tables and columns that exist in osquery on that operating system. Select explicit columns, not *. Add a sensible ORDER BY or WHERE when it helps.\n" #
    "\nUseful macOS tables: os_version, system_info, uptime, battery, apps(name,bundle_short_version,path,last_opened_time), homebrew_packages, users(uid,username), logged_in_users, disk_encryption(name,encrypted), gatekeeper(assessments_enabled), sip_config(config_flag,enabled), alf(global_state) [application firewall], managed_policies(domain,name,value), launchd, kernel_extensions, processes(pid,name,path,on_disk), listening_ports(pid,port,protocol,address), interface_addresses(interface,address), chrome_extensions, safari_extensions, firefox_addons, browser_plugins, plist(path,key,value), certificates, startup_items.\n" #
    "Useful Windows tables: programs(name,version,publisher), services(name,status,start_type), registry(path,name,data), bitlocker_info, windows_security_center, patches, scheduled_tasks, logged_in_users, processes, listening_ports.\n" #
    "Useful Linux tables: deb_packages, rpm_packages, systemd_units, iptables, shadow(username,password_status), users, crontab (per-user), kernel_modules, mounts, processes, listening_ports.\n" #
    "\nExamples:\n" #
    "Q: which browser extensions are installed?\n" #
    "A: SELECT u.username, ce.name, ce.identifier, ce.version FROM users u JOIN chrome_extensions ce USING (uid) UNION SELECT u.username, se.name, se.identifier, se.version FROM users u JOIN safari_extensions se USING (uid) UNION SELECT u.username, fa.name, fa.identifier, fa.version FROM users u JOIN firefox_addons fa USING (uid)\n" #
    "Q: what apps are installed?\n" #
    "A: SELECT name, bundle_short_version AS version, path FROM apps ORDER BY name\n" #
    "Q: which processes are listening on the network?\n" #
    "A: SELECT DISTINCT p.name, lp.port, lp.protocol, lp.address FROM listening_ports lp JOIN processes p ON lp.pid = p.pid WHERE lp.port != 0\n" #
    "Q: is the firewall on?\n" #
    "A: SELECT global_state FROM alf";
  };
  /// Plain language → osquery SQL. Extraction only: the admin reviews the SQL and runs it explicitly.
  public shared func aiToQuery(tok : Text, question : Text, os : Text) : async { ok : Bool; sql : Text; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; sql = ""; detail = "admins only" }; case (?_) {} };
    let q = norm(question);
    if (q == "") return { ok = false; sql = ""; detail = "ask something first" };
    if (q.size() > 600) return { ok = false; sql = ""; detail = "keep the question under 600 characters" };
    await refreshHubAi();
    let cr = switch (hubAi) { case (?c) c; case null return { ok = false; sql = ""; detail = "no AI key — an owner sets one under the hub's Settings → AI and grants this app the AI lane" } };
    let anthropic = cr.provider == "anthropic";
    let sys = aiPrompt(lower(norm(os)));
    let body = if (anthropic)
      "{\"model\":\"" # jesc(cr.model) # "\",\"max_tokens\":512,\"temperature\":0,\"system\":\"" # jesc(sys) # "\",\"messages\":[{\"role\":\"user\",\"content\":\"" # jesc(q) # "\"}]}"
    else
      "{\"model\":\"" # jesc(cr.model) # "\",\"temperature\":0,\"messages\":[{\"role\":\"system\",\"content\":\"" # jesc(sys) # "\"},{\"role\":\"user\",\"content\":\"" # jesc(q) # "\"}]}";
    let headers = if (anthropic) [
      { name = "x-api-key"; value = cr.key }, { name = "anthropic-version"; value = "2023-06-01" }, { name = "Content-Type"; value = "application/json" },
    ] else [
      { name = "Authorization"; value = "Bearer " # cr.key }, { name = "Content-Type"; value = "application/json" },
    ];
    let req : HttpRequestArgs = { url = cr.url; max_response_bytes = ?100_000; headers; body = ?Text.encodeUtf8(body); method = #post; transform = null; is_replicated = ?false };
    let res = try { await (with timeout = 90) icHttp.http_request(req) } catch (e) { return { ok = false; sql = ""; detail = "the AI vendor did not answer: " # Error.message(e) } };
    try { await Hub.hub(hubId).hub_aiUsed(1) } catch (_) {};
    let txt = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null return { ok = false; sql = ""; detail = "unreadable answer from the AI vendor" } };
    if (res.status != 200) return { ok = false; sql = ""; detail = "the AI vendor answered " # Nat.toText(res.status) # ": " # capText(txt, 200) };
    let outer = switch (Json.parse(txt)) { case (#ok(j)) j; case (#err(_)) return { ok = false; sql = ""; detail = "the AI vendor sent no JSON" } };
    let content = if (anthropic) {
      switch (Json.get(outer, "content")) { case (?#array(items)) { var t = ""; for (it in items.vals()) if (t == "" and jstr(it, "type") == "text") t := jstr(it, "text"); t }; case (_) "" };
    } else jstr(outer, "choices[0].message.content");
    let sql = stripFences(content);
    if (sql == "") return { ok = false; sql = ""; detail = "the model returned no SQL" };
    switch (sqlSafe(sql)) { case (?e) return { ok = false; sql; detail = "the model's SQL was refused: " # e }; case null {} };
    { ok = true; sql; detail = "" };
  };

  // =====================================================================
  // device owners — from the assets app (serial → person), manual fallback here
  // =====================================================================
  // serialOwner: what assets last said (authoritative). manualOwner: an admin's
  // answer for serials assets does not know. Both keyed by SERIAL_UPPER; values are
  // hub person ids (0.2.0) — assets ≥ 0.6.0 sends ids, older versions addresses (converted on arrival).
  let serialOwner : Map.Map<Text, Text> = Map.empty<Text, Text>();
  let manualOwner : Map.Map<Text, Text> = Map.empty<Text, Text>();
  var ownersPulledAt : Int = 0;
  var ownersLastError : Text = "";
  transient var ownersPullRunning : Bool = false;
  type AssetsAPI = actor { trust_serialOwners : shared () -> async [(Text, Text)] };

  func ownerOfSerial(serial : Text) : Text {
    let s = upperSerial(serial);
    if (s == "") return "";
    switch (Map.get(serialOwner, Text.compare, s)) {
      case (?e) e;
      case null { switch (Map.get(manualOwner, Text.compare, s)) { case (?e) e; case null "" } };
    };
  };
  func ownerSource(serial : Text) : Text {
    let s = upperSerial(serial);
    if (Map.containsKey(serialOwner, Text.compare, s)) return "assets";
    if (Map.containsKey(manualOwner, Text.compare, s)) return "manual";
    "";
  };
  func pullOwners() : async { ok : Bool; count : Nat; detail : Text } {
    if (assetsId == "") return { ok = false; count = 0; detail = "no assets canister configured — Settings → Where owners come from" };
    if (ownersPullRunning) return { ok = false; count = Map.size(serialOwner); detail = "a pull is already running" };
    ownersPullRunning := true;
    let expected = assetsId;
    try {
      let a : AssetsAPI = actor (expected);
      let rows = try { await (with timeout = 30) a.trust_serialOwners() } catch (e) {
        ownersLastError := Error.message(e);
        return { ok = false; count = Map.size(serialOwner); detail = "assets did not answer: " # capText(Error.message(e), 160) # " — is this canister's id entered in Assets → Settings?" };
      };
      if (assetsId != expected) return { ok = false; count = 0; detail = "settings changed during the pull" };
      serialOwner.clear();
      for ((s, e) in rows.vals()) { let k = upperSerial(s); if (k != "" and e != "") Map.add(serialOwner, Text.compare, k, asPid(lower(e))) };
      ownersPulledAt := now(); ownersLastError := "";
      { ok = true; count = Map.size(serialOwner); detail = "" };
    } finally { ownersPullRunning := false };
  };
  public shared func pullOwnersNow(tok : Text) : async { ok : Bool; count : Nat; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; count = 0; detail = "admins only" }; case (?_) {} };
    await pullOwners();
  };
  /// Name the person for a device assets does not know. Pick from the directory; "" clears.
  public shared func setDeviceOwner(tok : Text, nodeId : Text, email : Text) : async { ok : Bool; detail : Text } {
    let nodeKey = deviceKey(nodeId);
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let n = switch (Map.get(nodes, Text.compare, nodeKey)) { case (?n) n; case null return { ok = false; detail = "no such device" } };
    let s = upperSerial(n.hardwareSerial);
    if (s == "") return { ok = false; detail = "this device reported no serial number — nothing to attach a person to" };
    if (Map.containsKey(serialOwner, Text.compare, s)) return { ok = false; detail = "assets says this device belongs to " # nameOf(ownerOfSerial(s)) # " — change it there; it arrives here within 15 minutes" };
    let e = lower(norm(email));
    if (e == "") { ignore Map.delete(manualOwner, Text.compare, s); log(m.email, "owner cleared for " # n.hostname); return { ok = true; detail = "" } };
    if (not knownPerson(e)) return { ok = false; detail = "pick the person from the directory" };
    Map.add(manualOwner, Text.compare, s, pidOf(e));
    log(m.email, "owner of " # n.hostname # " set to " # e);
    { ok = true; detail = "" };
  };

  // =====================================================================
  // enrolment secret
  // =====================================================================
  // The shared secret baked into the installer. Rotatable; never read back in full.
  var enrollSecret : Text = "";
  public shared func generateEnroll(tok : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    enrollSecret := hex(await ic00.raw_rand());
    log(m.email, "enrolment secret " # (if (enrollSecret == "") "set" else "rotated"));
    { ok = true; detail = "" };
  };
  public shared func setEnroll(tok : Text, secret : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let v = norm(secret);
    if (not tokenSafe(v, 8, 128)) return { ok = false; detail = "8–128 characters: letters, digits, . _ -" };
    enrollSecret := v;
    log(m.email, "enrolment secret set by hand");
    { ok = true; detail = "" };
  };

  // =====================================================================
  // devices (one Node = one enrolled agent)
  // =====================================================================
  type Node = {
    nodeKey : Text;
    hostIdentifier : Text; // osquery host_identifier (the hardware UUID)
    hostname : Text;
    hardwareSerial : Text; // ties the device to a person (assets / manual)
    osVersion : Text;
    platform : Text;
    enrolledAt : Int;
    lastSeen : Int;
    posture : [(Text, Bool, Text)]; // latest result per check: checkId -> (pass, detail)
    postureAt : Int;
  };
  let nodes : Map.Map<Text, Node> = Map.empty<Text, Node>(); // nodeKey -> Node
  var enrollCount : Nat = 0;
  transient let MAX_NODES : Nat = 5_000;
  transient var enrolWindowStart : Int = 0;
  transient var enrolWindowCount : Nat = 0;
  var demoSeeded : Bool = false;

  // Browser identifiers are not osquery authentication credentials. Keep the old
  // node shape and agent keys intact; existing authorized links remain readable.
  let deviceIds = Map.empty<Text, Text>(); // agent key -> public id
  let deviceKeys = Map.empty<Text, Text>(); // public id -> agent key
  var nextDeviceId : Nat = 1;
  func ensureDeviceId(key : Text) {
    if (Map.containsKey(deviceIds, Text.compare, key)) return;
    let id = "device-" # Nat.toText(nextDeviceId); nextDeviceId += 1;
    Map.add(deviceIds, Text.compare, key, id); Map.add(deviceKeys, Text.compare, id, key);
  };
  func deviceId(key : Text) : Text = switch (Map.get(deviceIds, Text.compare, key)) { case (?id) id; case null "" };
  func deviceKey(id : Text) : Text = switch (Map.get(deviceKeys, Text.compare, id)) { case (?key) key; case null id };
  system func postupgrade() { for ((key, _) in Map.entries(nodes)) ensureDeviceId(key) };

  // Old aggregate timestamps cannot prove the age of individual checks. Results
  // from before this release become verified again as agents report naturally.
  type Observation = { at : Int; error : Bool };
  let observations = Map.empty<Text, Observation>();
  func observationKey(key : Text, check : Text) : Text = key # "#" # check;
  let checkGenerations = Map.empty<Text, Nat>();
  func checkWireId(id : Text) : Text = id # (switch (Map.get(checkGenerations, Text.compare, id)) { case (?v) "~" # Nat.toText(v); case null "" });
  func checkFromWire(wire : Text) : ?Check {
    for (c in allChecks().vals()) if (wire == checkWireId(c.id)) return ?c;
    null;
  };
  func forgetCheck(id : Text) {
    let previous = "cis:" # checkWireId(id);
    let generation = switch (Map.get(checkGenerations, Text.compare, id)) { case (?v) v + 1; case null 1 };
    Map.add(checkGenerations, Text.compare, id, generation);
    ignore Map.delete(distQueries, Text.compare, previous);
    for ((key, _) in Map.entries(nodes)) {
      ignore Map.delete(observations, Text.compare, observationKey(key, id));
      let pending = switch (Map.get(pendingByNode, Text.compare, key)) { case (?v) v; case null [] };
      Map.add(pendingByNode, Text.compare, key, Array.filter<Text>(pending, func(q) = q != previous));
    };
  };
  func applicable(n : Node, c : Check) : Bool = isEnabled(c.id) and (c.os == "all" or c.os == osFamily(n.platform));
  func observation(n : Node, id : Text) : ?Observation {
    switch (Map.get(observations, Text.compare, observationKey(n.nodeKey, id))) {
      case (?o) ?o;
      case null { if (isDemo(n.nodeKey) and Array.find<(Text, Bool, Text)>(n.posture, func(p) = p.0 == id) != null) ?{ at = n.postureAt; error = false } else null };
    };
  };
  func resultState(n : Node, id : Text) : Text {
    switch (observation(n, id)) {
      case null "pending";
      case (?o) { if (now() - o.at > DAY or now() - n.lastSeen > DAY) "stale" else if (o.error) "error" else "current" };
    };
  };
  type Assessment = { state : Text; expected : Nat; passed : Nat; failing : Nat; pending : Nat; stale : Nat; errors : Nat };
  func assessment(n : Node) : Assessment {
    var expected = 0; var passed = 0; var failing = 0; var pending = 0; var stale = 0; var errors = 0;
    for (c in allChecks().vals()) if (applicable(n, c)) {
      expected += 1;
      switch (resultState(n, c.id)) {
        case ("pending") pending += 1;
        case ("stale") stale += 1;
        case ("error") errors += 1;
        case (_) { switch (Array.find<(Text, Bool, Text)>(n.posture, func(p) = p.0 == c.id)) { case (?(_, true, _)) passed += 1; case (?_) failing += 1; case null pending += 1 } };
      };
    };
    let state = if (expected == 0) "no_checks" else if (failing > 0) "attention" else if (now() - n.lastSeen > DAY or stale > 0) "stale" else if (errors > 0) "error" else if (pending > 0) "pending" else "passing";
    { state; expected; passed; failing; pending; stale; errors };
  };

  func nodeBySerial(serial : Text) : ?Node {
    for ((_, n) in Map.entries(nodes)) { if (n.hardwareSerial != "" and n.hardwareSerial == serial) return ?n };
    null;
  };
  func emptyNode(key : Text) : Node = {
    nodeKey = key; hostIdentifier = ""; hostname = ""; hardwareSerial = "";
    osVersion = ""; platform = ""; enrolledAt = now(); lastSeen = now(); posture = []; postureAt = 0;
  };

  // =====================================================================
  // checks — DATA: an osquery SQL + a rule over the returned rows + the OS it applies to
  // =====================================================================
  //   rule grammar (evalRule):
  //     nonEmpty            pass if >= 1 row
  //     empty               pass if 0 rows ("no bad thing exists")
  //     eq:<col>:<val>      first row's <col> == <val>
  //     ne:<col>:<val>      first row's <col> != <val>   (0 rows = absent = pass)
  //     in:<col>:<v1>|<v2>  first row's <col> in the set
  //     ge:<col>:<n> / le:<col>:<n>   numeric compare
  //   os: macos | windows | linux | all
  //   level: 1 = baseline everybody should meet · 2 = stricter
  public type Check = { id : Text; title : Text; sql : Text; interval : Nat; level : Nat; category : Text; os : Text; rule : Text };

  /// Built-in catalogue, derived from the CIS benchmarks. macOS is the most complete;
  /// Windows and Linux are starters (table names are right; review on a real device).
  transient let BUILTIN : [Check] = [
    // ---- macOS ----
    { id = "filevault"; title = "Disk encryption (FileVault) on"; level = 1; category = "Encryption"; os = "macos"; interval = 3600; rule = "eq:encrypted:1";
      sql = "SELECT de.encrypted FROM disk_encryption de JOIN mounts m ON de.name = m.device_alias WHERE m.path = '/';" },
    { id = "firewall"; title = "Firewall on"; level = 1; category = "Network"; os = "macos"; interval = 3600; rule = "ne:global_state:0";
      sql = "SELECT global_state FROM alf;" },
    { id = "firewallStealth"; title = "Firewall stealth mode on"; level = 2; category = "Network"; os = "macos"; interval = 3600; rule = "eq:stealth_enabled:1";
      sql = "SELECT stealth_enabled FROM alf;" },
    { id = "firewallLogging"; title = "Firewall logging on"; level = 2; category = "Network"; os = "macos"; interval = 3600; rule = "eq:logging_enabled:1";
      sql = "SELECT logging_enabled FROM alf;" },
    { id = "sip"; title = "System Integrity Protection on"; level = 1; category = "System integrity"; os = "macos"; interval = 3600; rule = "eq:enabled:1";
      sql = "SELECT enabled FROM sip_config WHERE config_flag = 'sip';" },
    { id = "gatekeeper"; title = "Gatekeeper on"; level = 1; category = "System integrity"; os = "macos"; interval = 3600; rule = "eq:assessments_enabled:1";
      sql = "SELECT assessments_enabled FROM gatekeeper;" },
    { id = "screenlock"; title = "Screen lock asks for a password"; level = 1; category = "Access"; os = "macos"; interval = 3600; rule = "eq:enabled:1";
      sql = "SELECT enabled FROM screenlock;" },
    { id = "screenlockGrace"; title = "Screen lock grace period ≤ 5 s"; level = 2; category = "Access"; os = "macos"; interval = 3600; rule = "le:grace_period:5";
      sql = "SELECT grace_period FROM screenlock;" },
    { id = "remotelogin"; title = "Remote login (SSH) off"; level = 1; category = "Access"; os = "macos"; interval = 3600; rule = "eq:remote_login:0";
      sql = "SELECT remote_login FROM sharing_preferences;" },
    { id = "screensharing"; title = "Screen sharing off"; level = 1; category = "Access"; os = "macos"; interval = 3600; rule = "eq:screen_sharing:0";
      sql = "SELECT screen_sharing FROM sharing_preferences;" },
    { id = "remoteManagement"; title = "Remote management off"; level = 2; category = "Access"; os = "macos"; interval = 3600; rule = "eq:remote_management:0";
      sql = "SELECT remote_management FROM sharing_preferences;" },
    { id = "fileSharing"; title = "File sharing off"; level = 2; category = "Access"; os = "macos"; interval = 3600; rule = "eq:file_sharing:0";
      sql = "SELECT file_sharing FROM sharing_preferences;" },
    { id = "guestDisabled"; title = "Guest account off"; level = 2; category = "Access"; os = "macos"; interval = 86400; rule = "ne:value:1";
      sql = "SELECT value FROM plist WHERE path = '/Library/Preferences/com.apple.loginwindow.plist' AND key = 'GuestEnabled';" },
    { id = "osversion"; title = "Operating system reports a version"; level = 1; category = "Updates"; os = "macos"; interval = 86400; rule = "nonEmpty";
      sql = "SELECT version FROM os_version;" },
    { id = "autoupdateCheck"; title = "Checks for updates automatically"; level = 1; category = "Updates"; os = "macos"; interval = 86400; rule = "eq:value:1";
      sql = "SELECT value FROM plist WHERE path = '/Library/Preferences/com.apple.SoftwareUpdate.plist' AND key = 'AutomaticCheckEnabled';" },
    { id = "autoupdateInstall"; title = "Installs macOS updates automatically"; level = 2; category = "Updates"; os = "macos"; interval = 86400; rule = "eq:value:1";
      sql = "SELECT value FROM plist WHERE path = '/Library/Preferences/com.apple.SoftwareUpdate.plist' AND key = 'AutomaticallyInstallMacOSUpdates';" },
    { id = "securityUpdateInstall"; title = "Installs security responses automatically"; level = 1; category = "Updates"; os = "macos"; interval = 86400; rule = "eq:value:1";
      sql = "SELECT value FROM plist WHERE path = '/Library/Preferences/com.apple.SoftwareUpdate.plist' AND key = 'ConfigDataInstall';" },
    // ---- Windows ----
    { id = "win_bitlocker"; title = "Disk encryption (BitLocker) on C:"; level = 1; category = "Encryption"; os = "windows"; interval = 3600; rule = "eq:protection_status:1";
      sql = "SELECT protection_status FROM bitlocker_info WHERE drive_letter = 'C:';" },
    { id = "win_defender"; title = "Antivirus healthy"; level = 1; category = "System integrity"; os = "windows"; interval = 3600; rule = "eq:antivirus:Good";
      sql = "SELECT antivirus FROM windows_security_center;" },
    { id = "win_firewall"; title = "Firewall healthy"; level = 1; category = "Network"; os = "windows"; interval = 3600; rule = "eq:firewall:Good";
      sql = "SELECT firewall FROM windows_security_center;" },
    { id = "win_autoupdate"; title = "Automatic updates healthy"; level = 1; category = "Updates"; os = "windows"; interval = 86400; rule = "eq:autoupdate:Good";
      sql = "SELECT autoupdate FROM windows_security_center;" },
    { id = "win_uac"; title = "User Account Control healthy"; level = 1; category = "Access"; os = "windows"; interval = 3600; rule = "eq:user_account_control:Good";
      sql = "SELECT user_account_control FROM windows_security_center;" },
    { id = "win_rdp"; title = "Remote Desktop off"; level = 2; category = "Access"; os = "windows"; interval = 3600; rule = "eq:data:1";
      sql = "SELECT data FROM registry WHERE path = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\fDenyTSConnections';" },
    { id = "win_osversion"; title = "Operating system reports a version"; level = 1; category = "Updates"; os = "windows"; interval = 86400; rule = "nonEmpty";
      sql = "SELECT version FROM os_version;" },
    // ---- Linux ----
    { id = "lin_osversion"; title = "Operating system reports a version"; level = 1; category = "Updates"; os = "linux"; interval = 86400; rule = "nonEmpty";
      sql = "SELECT version FROM os_version;" },
    { id = "lin_noEmptyPw"; title = "No accounts with empty passwords"; level = 1; category = "Access"; os = "linux"; interval = 86400; rule = "empty";
      sql = "SELECT username FROM shadow WHERE password_status = 'empty';" },
    { id = "lin_noExtraUid0"; title = "Only root has UID 0"; level = 1; category = "Access"; os = "linux"; interval = 86400; rule = "empty";
      sql = "SELECT username FROM users WHERE uid = 0 AND username != 'root';" },
    { id = "lin_firewall"; title = "Firewall rules present (iptables)"; level = 1; category = "Network"; os = "linux"; interval = 3600; rule = "nonEmpty";
      sql = "SELECT chain FROM iptables LIMIT 1;" },
    { id = "lin_worldWritable"; title = "No world-writable files in /etc"; level = 2; category = "System integrity"; os = "linux"; interval = 86400; rule = "empty";
      sql = "SELECT path FROM file WHERE directory = '/etc' AND (mode LIKE '%7' OR mode LIKE '%6' OR mode LIKE '%3' OR mode LIKE '%2') LIMIT 5;" },
  ];

  let customChecks : Map.Map<Text, Check> = Map.empty<Text, Check>(); // admin-authored, same shape
  var enabledChecks : [Text] = [];
  var checksCustomized : Bool = false; // false → level-1 built-ins are active

  func allChecks() : [Check] {
    let out = List.empty<Check>();
    for (c in BUILTIN.vals()) List.add(out, c);
    for ((_, c) in Map.entries(customChecks)) List.add(out, c);
    List.toArray(out);
  };
  func checkById(id : Text) : ?Check { for (c in allChecks().vals()) { if (c.id == id) return ?c }; null };
  func checkTitle(id : Text) : Text = switch (checkById(id)) { case (?c) c.title; case null id };
  func osFamily(platform : Text) : Text {
    let p = Text.toLower(platform);
    if (p == "darwin") "macos" else if (p == "windows") "windows" else "linux";
  };
  func defaultEnabled() : [Text] {
    let l = List.empty<Text>();
    for (c in BUILTIN.vals()) { if (c.level == 1) List.add(l, c.id) };
    List.toArray(l);
  };
  func enabledList() : [Text] = if (checksCustomized) enabledChecks else defaultEnabled();
  func isEnabled(id : Text) : Bool { for (e in enabledList().vals()) { if (e == id) return true }; false };

  public shared func setChecks(tok : Text, ids : [Text]) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let l = List.empty<Text>();
    for (id in ids.vals()) { switch (checkById(id)) { case (?_) { if (not has(List.toArray(l), id)) List.add(l, id) }; case null {} } };
    for (id in enabledList().vals()) if (not has(List.toArray(l), id)) forgetCheck(id);
    for (id in List.values(l)) if (not isEnabled(id)) forgetCheck(id);
    enabledChecks := List.toArray(l); checksCustomized := true;
    log(m.email, "active checks set (" # Nat.toText(enabledChecks.size()) # ")");
    { ok = true; detail = Nat.toText(enabledChecks.size()) # " checks active" };
  };
  public shared func addCheck(tok : Text, args : { id : Text; title : Text; category : Text; os : Text; level : Nat; sql : Text; rule : Text }) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let cid = norm(args.id);
    func idOk(t : Text) : Bool {
      if (t.size() == 0 or t.size() > 40) return false;
      for (c in t.chars()) { let k = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_' or c == '-'; if (not k) return false };
      true;
    };
    if (not idOk(cid)) return { ok = false; detail = "id: letters, digits, _ or - (max 40)" };
    for (b in BUILTIN.vals()) { if (b.id == cid) return { ok = false; detail = "that id belongs to a built-in check" } };
    switch (sqlSafe(args.sql)) { case (?e) return { ok = false; detail = e }; case null {} };
    let (op, _, _) = ruleParts(norm(args.rule));
    if (op != "nonEmpty" and op != "empty" and op != "eq" and op != "ne" and op != "in" and op != "ge" and op != "le") return { ok = false; detail = "rule must be nonEmpty, empty, eq:col:val, ne:col:val, in:col:a|b, ge:col:n or le:col:n" };
    let osN = do { let o = lower(norm(args.os)); if (o == "macos" or o == "windows" or o == "linux" or o == "all") o else "all" };
    let lvl = if (args.level == 2) 2 else 1;
    let isNew = not Map.containsKey(customChecks, Text.compare, cid);
    if (not isNew) forgetCheck(cid);
    Map.add(customChecks, Text.compare, cid, { id = cid; title = (if (norm(args.title) == "") cid else capText(norm(args.title), 80)); sql = norm(args.sql); interval = 3600; level = lvl; category = (if (norm(args.category) == "") "Custom" else capText(norm(args.category), 40)); os = osN; rule = norm(args.rule) });
    if (isNew) { enabledChecks := Array.concat(enabledList(), [cid]); checksCustomized := true };
    log(m.email, (if (isNew) "custom check added " else "custom check updated ") # cid);
    { ok = true; detail = "" };
  };
  public shared func deleteCheck(tok : Text, id : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (not Map.containsKey(customChecks, Text.compare, id)) return { ok = false; detail = "no such custom check" };
    forgetCheck(id);
    ignore Map.delete(customChecks, Text.compare, id);
    enabledChecks := Array.filter<Text>(enabledList(), func(e) = e != id); checksCustomized := true;
    ignore Map.delete(distQueries, Text.compare, "cis:" # id);
    log(m.email, "custom check deleted " # id);
    { ok = true; detail = "" };
  };
  public type CheckView = { id : Text; title : Text; sql : Text; level : Nat; category : Text; os : Text; rule : Text; enabled : Bool; custom : Bool };
  /// Every check, for everyone signed in — nothing is inspected in secret.
  public shared query func checksCatalog(tok : Text) : async [CheckView] {
    switch (me(tok)) {
      case null [];
      case (?_) Array.map<Check, CheckView>(allChecks(), func(c) = { id = c.id; title = c.title; sql = c.sql; level = c.level; category = c.category; os = c.os; rule = c.rule; enabled = isEnabled(c.id); custom = Map.containsKey(customChecks, Text.compare, c.id) });
    };
  };
  /// The questions admins asked the fleet lately (plain text), for everyone signed in.
  public shared query func recentQueries(tok : Text) : async [{ title : Text; sql : Text; source : Text; createdAt : Int }] {
    switch (me(tok)) {
      case null [];
      case (?_) {
        let out = List.empty<{ title : Text; sql : Text; source : Text; createdAt : Int }>();
        for ((_, q) in Map.entries(distQueries)) { if (q.source != "cis" and q.source != "info") List.add(out, { title = q.title; sql = q.sql; source = q.source; createdAt = q.createdAt }) };
        let sorted = Array.sort<{ title : Text; sql : Text; source : Text; createdAt : Int }>(List.toArray(out), func(a, b) = Int.compare(b.createdAt, a.createdAt));
        Array.tabulate<{ title : Text; sql : Text; source : Text; createdAt : Int }>(Nat.min(sorted.size(), 50), func i = sorted[i]);
      };
    };
  };

  // ---------- device facts (osquery basics, refreshed when a device page opens) ----------
  type InfoQ = { id : Text; title : Text; sql : Text };
  transient let DEVICE_INFO : [InfoQ] = [
    { id = "os"; title = "Operating system"; sql = "SELECT name, version, build FROM os_version;" },
    { id = "hardware"; title = "Hardware"; sql = "SELECT hardware_model, hardware_serial, cpu_brand, physical_memory, cpu_logical_cores FROM system_info;" },
    { id = "uptime"; title = "Uptime"; sql = "SELECT total_seconds FROM uptime;" },
    { id = "disk"; title = "Disk (root)"; sql = "SELECT round((blocks_available * blocks_size) / 1073741824.0, 1) AS free_gb, round((blocks * blocks_size) / 1073741824.0, 1) AS total_gb FROM mounts WHERE path = '/';" },
    { id = "battery"; title = "Battery"; sql = "SELECT percent_remaining, cycle_count, condition, charging, charged FROM battery;" },
    { id = "loadavg"; title = "Load average"; sql = "SELECT average FROM load_average WHERE period = '5m';" },
    { id = "agent"; title = "osquery agent"; sql = "SELECT version FROM osquery_info;" },
    { id = "user"; title = "Logged-in user"; sql = "SELECT user FROM logged_in_users WHERE type = 'user' ORDER BY time DESC LIMIT 1;" },
    { id = "net"; title = "Network (IPv4)"; sql = "SELECT address FROM interface_addresses WHERE address NOT LIKE '127.%' AND address NOT LIKE '169.254.%' AND address NOT LIKE '%:%' LIMIT 1;" },
  ];

  // ---------- rule engine ----------
  func ruleParts(rule : Text) : (Text, Text, Text) {
    var op = ""; var col = ""; var val = ""; var i = 0;
    for (seg in Text.split(rule, #char ':')) {
      if (i == 0) op := seg else if (i == 1) col := seg else { val := (if (val == "") seg else val # ":" # seg) };
      i += 1;
    };
    (op, col, val);
  };
  func inSet(set : Text, got : Text) : Bool { for (v in Text.split(set, #char '|')) { if (v == got) return true }; false };
  func cmpNum(got : Text, want : Text, ge : Bool) : Bool {
    switch (Nat.fromText(got), Nat.fromText(want)) {
      case (?g, ?w) (if (ge) g >= w else g <= w);
      case _ false;
    };
  };
  func evalRule(rule : Text, rows : Json.Json) : (Bool, Text) {
    let arr = switch (rows) { case (#array(a)) a; case (_) [] };
    let (op, col, val) = ruleParts(rule);
    if (op == "nonEmpty") return (arr.size() > 0, if (arr.size() > 0) Nat.toText(arr.size()) # " row(s)" else "no data");
    if (op == "empty") return (arr.size() == 0, if (arr.size() == 0) "none — good" else Nat.toText(arr.size()) # " found");
    // "ne" over 0 rows: the value is absent, so it is not equal to <val> — pass (a plist key missing at its safe default).
    if (arr.size() == 0) return (if (op == "ne") true else false, if (op == "ne") "absent (ok)" else "no data returned");
    let got = switch (Json.getAsText(arr[0], col)) { case (#ok(t)) t; case (_) "" };
    let d = col # "=" # got;
    switch (op) {
      case "eq" (got == val, d);
      case "ne" (got != val, d);
      case "in" (inSet(val, got), d);
      case "ge" (cmpNum(got, val, true), d);
      case "le" (cmpNum(got, val, false), d);
      case _ (false, "unknown rule: " # op);
    };
  };
  func evalCheck(id : Text, rows : Json.Json) : (Bool, Text) {
    switch (checkById(id)) { case (?c) evalRule(c.rule, rows); case null (false, "unknown check") };
  };

  /// One gate for every query that can reach a device. osquery is read-only by
  /// design; on top: SELECT/WITH only, no ATTACH, no tables that expose secrets
  /// or file contents. Returns a plain reason, or null when fine.
  func sqlSafe(sql : Text) : ?Text {
    let low = Text.toLower(norm(sql));
    if (low == "") return ?"the query is empty";
    if (low.size() > 4000) return ?"keep the query under 4000 characters";
    if (not Text.startsWith(low, #text "select") and not Text.startsWith(low, #text "with")) return ?"only read-only SELECT queries are allowed";
    if (Text.contains(low, #text "attach ") or Text.contains(low, #text "attach\t") or Text.contains(low, #text "attach\n") or Text.contains(low, #text "attach(")) return ?"ATTACH is not allowed";
    if (Text.contains(low, #text "user_ssh_keys")) return ?"user_ssh_keys is blocked (private key material)";
    if (Text.contains(low, #text "carves") or Text.contains(low, #text "carve(")) return ?"file carving is blocked";
    null;
  };

  // ---------- distributed queries: run once, answered on the agent's next poll ----------
  type DistQuery = { id : Text; sql : Text; title : Text; createdBy : Text; createdAt : Int; source : Text }; // source: admin | ai | cis | info
  let distQueries : Map.Map<Text, DistQuery> = Map.empty<Text, DistQuery>();
  let pendingByNode : Map.Map<Text, [Text]> = Map.empty<Text, [Text]>(); // nodeKey -> [queryId]
  let distResults : Map.Map<Text, (Text, Int)> = Map.empty<Text, (Text, Int)>(); // "queryId#nodeKey" -> (rowsJson, at)
  var distSeq : Nat = 0;

  func addPending(nodeKey : Text, qid : Text) {
    let cur = switch (Map.get(pendingByNode, Text.compare, nodeKey)) { case (?a) a; case null [] };
    if (Array.find<Text>(cur, func(x) = x == qid) == null) Map.add(pendingByNode, Text.compare, nodeKey, Array.concat(cur, [qid]));
  };
  func objHasKey(fields : [(Text, Json.Json)], k : Text) : Bool { for ((kk, _) in fields.vals()) { if (kk == k) return true }; false };

  // =====================================================================
  // osquery TLS remote endpoints (served through the HTTP gateway)
  // =====================================================================
  public type HttpGwRequest = { method : Text; url : Text; headers : [(Text, Text)]; body : Blob };
  public type HttpGwResponse = { status_code : Nat16; headers : [(Text, Text)]; body : Blob; upgrade : ?Bool };
  func jsonRes(code : Nat16, body : Text) : HttpGwResponse = { status_code = code; headers = [("Content-Type", "application/json")]; body = Text.encodeUtf8(body); upgrade = null };
  func textRes(body : Text) : HttpGwResponse = { status_code = 200; headers = [("Content-Type", "text/plain")]; body = Text.encodeUtf8(body); upgrade = null };
  transient let ACCEPT = "{\"node_invalid\":false}";
  transient let REENROLL = "{\"node_invalid\":true}";

  func agentStatusResponse(url : Text) : ?HttpGwResponse {
    if (url == "/agent/health" or Text.startsWith(url, #text "/agent/health?")) return ?textRes("trust-agent-v2");
    if (Text.startsWith(url, #text "/agent/version") or Text.startsWith(url, #text "/agent/decommissioned")) return ?textRes("");
    null;
  };

  /// Agent routes use the gateway's consensus-verified update path. Plain query
  /// bodies without HTTP certification are rejected by the normal gateway.
  public shared query func http_request(req : HttpGwRequest) : async HttpGwResponse {
    // Retire the legacy updater: no public hardware identifiers, remote removal or
    // unverified version feed. Old scripts safely do nothing until IT migrates them.
    if (agentStatusResponse(req.url) != null or Text.startsWith(req.url, #text "/enroll") or Text.startsWith(req.url, #text "/config")
      or Text.startsWith(req.url, #text "/distributed/") or Text.startsWith(req.url, #text "/log")) {
      return { status_code = 200; headers = []; body = Array.toBlob([]); upgrade = ?true };
    };
    { status_code = 404; headers = [("Content-Type", "text/plain")]; body = Text.encodeUtf8("kebab-stack trust — osquery TLS remote endpoints: /enroll /config /distributed/read /distributed/write /log"); upgrade = null };
  };

  // ACCEPT keeps an agent going; only node_invalid=true makes it re-enrol. We
  // say node_invalid ONLY when we positively know the node — never because a body
  // failed to parse: the gateway can hand us a truncated body on large POSTs
  // (/log, /distributed/write), and refusing those would loop the agent through
  // re-enrolment forever. Those two routes always ACCEPT and skip unusable bodies.
  public shared func http_request_update(req : HttpGwRequest) : async HttpGwResponse {
    switch (agentStatusResponse(req.url)) { case (?response) return response; case null {} };
    let bodyText = switch (Text.decodeUtf8(req.body)) { case (?t) t; case null "" };
    let jOpt = switch (Json.parse(bodyText)) { case (#ok(x)) ?x; case (#err(_)) null };
    if (Text.startsWith(req.url, #text "/enroll")) {
      return (switch (jOpt) { case (?j) enrollRoute(j); case null jsonRes(200, REENROLL) });
    };
    let nodeKey = switch (jOpt) { case (?j) jstr(j, "node_key"); case null scanField(bodyText, "node_key") };
    if (isDemo(nodeKey)) return jsonRes(200, REENROLL); // sample devices have guessable keys and no agent — nothing may write to them
    let known = switch (Map.get(nodes, Text.compare, nodeKey)) {
      case (?node) { Map.add(nodes, Text.compare, nodeKey, { node with lastSeen = now() }); true };
      case null false;
    };
    if (Text.startsWith(req.url, #text "/config")) return (if (known) { seedChecks(nodeKey); Map.add(nodeConfigVer, Text.compare, nodeKey, configVersion); configRoute() } else jsonRes(200, REENROLL));
    if (Text.startsWith(req.url, #text "/distributed/read")) return (if (known) distReadRoute(nodeKey) else jsonRes(200, REENROLL));
    if (Text.startsWith(req.url, #text "/distributed/write")) {
      switch (jOpt) { case (?j) { if (known) distWriteRoute(nodeKey, j) }; case null {} };
      return jsonRes(200, ACCEPT);
    };
    if (Text.startsWith(req.url, #text "/log")) {
      switch (jOpt) { case (?j) { if (known) logRoute(nodeKey, j) }; case null {} };
      return jsonRes(200, ACCEPT);
    };
    jsonRes(404, REENROLL);
  };

  /// "key":"value" out of a raw body without a full parse — fallback for bodies mo:json cannot read.
  func scanField(body : Text, key : Text) : Text {
    let needle = "\"" # key # "\"";
    var afterOpt : ?Text = null; var idx = 0;
    for (seg in Text.split(body, #text needle)) { if (idx == 1) afterOpt := ?seg; idx += 1 };
    let after = switch (afterOpt) { case (?a) a; case null return "" };
    var seenColon = false; var inVal = false; var out = "";
    label scan for (c in after.chars()) {
      if (not inVal) {
        if (c == ':') { seenColon := true } else if (seenColon and c == '\"') { inVal := true };
      } else {
        if (c == '\"') break scan;
        out #= Char.toText(c);
      };
    };
    out;
  };

  func enrollRoute(j : Json.Json) : HttpGwResponse {
    if (enrollSecret == "") return jsonRes(200, REENROLL);
    if (jstr(j, "enroll_secret") != enrollSecret) return jsonRes(200, REENROLL);
    let hostId = jstr(j, "host_identifier");
    let hostname = do { let h = jstr(j, "host_details.system_info.hostname"); if (h != "") h else jstr(j, "host_details.os_version.name") };
    let serial = jstr(j, "host_details.system_info.hardware_serial");
    let osv = jstr(j, "host_details.os_version.version");
    let platform = jstr(j, "host_details.os_version.platform");
    // a removed device may not come back while its agent is uninstalling itself
    if (isDecommissioned(hostId, serial)) return jsonRes(200, REENROLL);
    // re-enrolment of known hardware keeps its node key and history — but only when the hardware identity matches:
    // the enrol secret sits on every device, so a serial alone must never hand out another device's key (audit TR-01)
    let existing = switch (if (serial != "") nodeBySerial(serial) else null) {
      case (?n) { if (n.hostIdentifier == "" or hostId == "" or n.hostIdentifier == hostId) ?n else null };
      case null null;
    };
    if (existing == null and Map.size(nodes) >= MAX_NODES) return jsonRes(200, REENROLL); // fleet cap — a leaked secret cannot flood the register
    if (existing == null) {
      let tw = now(); if (tw - enrolWindowStart > 3_600_000_000_000) { enrolWindowStart := tw; enrolWindowCount := 0 };
      if (enrolWindowCount >= 300) return jsonRes(200, REENROLL); // at most 300 new devices an hour
      enrolWindowCount += 1;
    };
    let key = switch (existing) { case (?n) n.nodeKey; case null genNodeKeySync() };
    let t = now();
    let prior = switch (Map.get(nodes, Text.compare, key)) { case (?n) n; case null { enrollCount += 1; emptyNode(key) } };
    Map.add(nodes, Text.compare, key, {
      prior with nodeKey = key; hostIdentifier = capText(hostId, 64); hostname = capText(hostname, 120); hardwareSerial = capText(serial, 64);
      osVersion = capText(osv, 40); platform = capText(platform, 20); enrolledAt = (if (existing == null) t else prior.enrolledAt); lastSeen = t;
    });
    ensureDeviceId(key);
    jsonRes(200, "{\"node_key\":\"" # key # "\",\"node_invalid\":false}");
  };

  // node keys come from randomness, but enrol runs inside a sync route (no await):
  // a timer keeps a pool of pre-minted keys; the fallback is salted with a random value.
  let keyPool = List.empty<Text>();
  var keySeq : Nat = 0;
  var keySalt : Text = "";
  func genNodeKeySync() : Text {
    switch (List.removeLast(keyPool)) {
      case (?k) k;
      case null { keySeq += 1; "nk-" # keySalt # "-" # Int.toText(now()) # "-" # Nat.toText(keySeq) };
    };
  };

  // ---- agent tuning, served LIVE via /config (no re-push) ----
  // osquery pulls /config every 300 s; the `options` block overrides the flags file.
  var tuneDistInterval : Nat = 15; // seconds between polls for questions (responsiveness)
  var tuneWatchdogMem : Nat = 150; // MB — the agent is restarted above this
  var tuneWatchdogUtil : Nat = 30; // % of one core, sustained
  var tuneScheduleSplay : Nat = 30; // % random spread of scheduled work
  var configVersion : Nat = 1; // bumps on every tuning change; devices are stamped when they pull
  let nodeConfigVer : Map.Map<Text, Nat> = Map.empty<Text, Nat>();

  public shared func setTuning(tok : Text, args : { distInterval : Nat; watchdogMem : Nat; watchdogUtil : Nat; splay : Nat }) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let clamp = func(x : Nat, lo : Nat, hi : Nat) : Nat = if (x < lo) lo else if (x > hi) hi else x;
    tuneDistInterval := clamp(args.distInterval, 5, 3600);
    tuneWatchdogMem := clamp(args.watchdogMem, 50, 4000);
    tuneWatchdogUtil := clamp(args.watchdogUtil, 5, 100);
    tuneScheduleSplay := clamp(args.splay, 0, 90);
    configVersion += 1;
    log(m.email, "agent tuning changed (config v" # Nat.toText(configVersion) # ")");
    { ok = true; detail = "" };
  };

  func configRoute() : HttpGwResponse {
    // Checks run through the fast distributed lane (seedChecks), so the scheduled
    // config stays empty. The options block re-asserts the read-only guardrails.
    let opts =
      "\"distributed_interval\":" # Nat.toText(tuneDistInterval) # "," #
      "\"watchdog_memory_limit\":" # Nat.toText(tuneWatchdogMem) # "," #
      "\"watchdog_utilization_limit\":" # Nat.toText(tuneWatchdogUtil) # "," #
      "\"watchdog_delay\":60," #
      "\"schedule_splay_percent\":" # Nat.toText(tuneScheduleSplay) # "," #
      "\"disable_carver\":true," #
      "\"disable_events\":true," #
      "\"read_max\":52428800," #
      "\"host_identifier\":\"uuid\"," #
      "\"logger_tls_period\":60";
    jsonRes(200, "{\"options\":{" # opts # "},\"schedule\":{},\"node_invalid\":false}");
  };

  func distReadRoute(nodeKey : Text) : HttpGwResponse {
    let pend = switch (Map.get(pendingByNode, Text.compare, nodeKey)) { case (?a) a; case null [] };
    var qs = ""; var first = true;
    for (qid in pend.vals()) {
      switch (Map.get(distQueries, Text.compare, qid)) {
        case (?q) { if (not first) qs #= ","; first := false; qs #= "\"" # jesc(qid) # "\":\"" # jesc(q.sql) # "\"" };
        case null {};
      };
    };
    jsonRes(200, "{\"queries\":{" # qs # "},\"node_invalid\":false}");
  };

  func distWriteRoute(nodeKey : Text, j : Json.Json) {
    let node = switch (Map.get(nodes, Text.compare, nodeKey)) { case (?n) n; case null return };
    let fields = switch (Json.get(j, "queries")) { case (?#object_(f)) f; case (_) [] };
    let t = now();
    let pend = switch (Map.get(pendingByNode, Text.compare, nodeKey)) { case (?a) a; case null [] };
    let isPending = func(qid : Text) : Bool = has(pend, qid);
    let failed = func(qid : Text) : Bool = switch (Json.getAsInt(j, "statuses." # qid)) { case (#ok(code)) code != 0; case (_) false };
    let errorJson = "[{\"query_error\":\"The agent could not run this query. Check its OS and permissions.\"}]";
    for ((qid, rows) in fields.vals()) {
      if (Text.startsWith(qid, #text "cis:")) {
        let wire = switch (Text.stripStart(qid, #text "cis:")) { case (?c) c; case null "" };
        switch (checkFromWire(wire)) {
          case (?c) { if (applicable(node, c) and not failed(qid)) {
            switch rows { case (#array(_)) { let (pass, detail) = evalCheck(c.id, rows); notePosture(nodeKey, c.id, pass, detail, t) }; case (_) {} };
          } };
          case null {};
        };
      } else if (isPending(qid)) {
        Map.add(distResults, Text.compare, qid # "#" # nodeKey, (if (failed(qid)) errorJson else capText(Json.stringify(rows, null), 60_000), t));
      };
    };
    // Failed queries may carry only a status, without an entry in `queries`.
    for (qid in pend.vals()) if (failed(qid)) {
      switch (Text.stripStart(qid, #text "cis:")) {
        case (?wire) { switch (checkFromWire(wire)) { case (?c) { if (applicable(node, c)) Map.add(observations, Text.compare, observationKey(nodeKey, c.id), { at = t; error = true }) }; case null {} } };
        case null { Map.add(distResults, Text.compare, qid # "#" # nodeKey, (errorJson, t)) };
      };
    };
    let remaining = Array.filter<Text>(pend, func(qid) = not objHasKey(fields, qid) and not failed(qid));
    Map.add(pendingByNode, Text.compare, nodeKey, remaining);
  };

  func logRoute(nodeKey : Text, j : Json.Json) {
    // scheduled snapshot results arrive as { data: [ { name, snapshot: [...] } ] }
    switch (Json.get(j, "data")) {
      case (?#array(items)) {
        let t = now();
        for (it in items.vals()) {
          let name = jstr(it, "name");
          switch (checkFromWire(name)) {
            case (?c) {
              let rows = Json.get(it, "snapshot");
              switch (Map.get(nodes, Text.compare, nodeKey), rows) {
                case (?n, ?(#array(_))) { if (applicable(n, c)) { let (pass, detail) = evalCheck(c.id, switch rows { case (?r) r; case null #array([]) }); notePosture(nodeKey, c.id, pass, detail, t) } };
                case (_) {};
              };
            };
            case null {};
          };
        };
      };
      case (_) {};
    };
  };

  /// Record one check result on a device. A check that starts failing queues a
  /// notification to the device's person (flushed by a timer, best effort).
  func notePosture(nodeKey : Text, checkId : Text, pass : Bool, detail : Text, t : Int) {
    let n = switch (Map.get(nodes, Text.compare, nodeKey)) { case (?n) n; case null return };
    Map.add(observations, Text.compare, observationKey(nodeKey, checkId), { at = t; error = false });
    var wasFailing = false; var found = false;
    let updated = Array.map<(Text, Bool, Text), (Text, Bool, Text)>(n.posture, func((k, p, d)) = if (k == checkId) { found := true; wasFailing := not p; (k, pass, capText(detail, 200)) } else (k, p, d));
    let posture = if (found) updated else Array.concat(updated, [(checkId, pass, capText(detail, 200))]);
    Map.add(nodes, Text.compare, nodeKey, { n with posture; postureAt = t });
    if (not pass and not wasFailing and isEnabled(checkId) and not isDemo(nodeKey)) List.add(notifyQueue, (nodeKey, checkId));
  };

  // ---------- notifications: one message per device per batch of newly failing checks ----------
  let notifyQueue = List.empty<(Text, Text)>(); // (nodeKey, checkId)
  transient var notifyRunning : Bool = false;
  func flushNotifications() : async () {
    if (hubId == "" or notifyRunning or List.size(notifyQueue) == 0) return;
    notifyRunning := true;
    try {
      let batch = List.toArray(notifyQueue); notifyQueue.clear();
      // group by node
      let byNode = Map.empty<Text, [Text]>();
      for ((nk, cid) in batch.vals()) {
        let cur = switch (Map.get(byNode, Text.compare, nk)) { case (?a) a; case null [] };
        if (Array.find<Text>(cur, func(x) = x == cid) == null) Map.add(byNode, Text.compare, nk, Array.concat(cur, [cid]));
      };
      label devicesLoop for ((nk, cids) in Map.entries(byNode)) {
        let n = switch (Map.get(nodes, Text.compare, nk)) { case (?n) n; case null continue devicesLoop };
        let email = emailOfPid(ownerOfSerial(n.hardwareSerial)); // owner is a person id; a former colleague whose address moved on gets nothing
        if (email == "" or not Hub.isActive(people, email)) continue devicesLoop;
        var names = ""; var i = 0;
        for (c in cids.vals()) { if (i < 3) { names #= (if (i > 0) ", " else "") # checkTitle(c) }; i += 1 };
        if (cids.size() > 3) names #= " and " # Nat.toText(cids.size() - 3) # " more";
        let host = if (n.hostname == "") "your device" else n.hostname;
        let title = host # ": " # names # (if (cids.size() == 1) " needs" else " need") # " attention";
        let link = if (appUrl == "") "" else appUrl # "/#/d/" # deviceId(nk);
        let r = try { await Hub.hub(hubId).hub_notify({ email; title; url = link; kind = "trust.check"; dedupeKey = "trust-" # nk # "-" # cids[0] }) } catch (e) ({ ok = false; detail = Error.message(e) });
        log("trust", (if (r.ok) "told " else "could not tell ") # email # " about " # Nat.toText(cids.size()) # " failing check(s) on " # host # (if (r.ok) "" else ": " # capText(r.detail, 120)));
      };
    } finally { notifyRunning := false };
  };

  // Seed the active checks as fast distributed queries (ids "cis:<id>") so posture
  // fills within seconds of enrolment; each answer clears from pending, and the
  // next /config pull (every 5 min) re-seeds → a rolling refresh.
  func ensureCheckQueries() {
    for (c in allChecks().vals()) {
      Map.add(distQueries, Text.compare, "cis:" # checkWireId(c.id), { id = "cis:" # checkWireId(c.id); sql = c.sql; title = c.title; createdBy = "system"; createdAt = now(); source = "cis" });
    };
  };
  func seedChecks(nodeKey : Text) {
    ensureCheckQueries();
    let fam = switch (Map.get(nodes, Text.compare, nodeKey)) { case (?n) osFamily(n.platform); case null "all" };
    let cur = switch (Map.get(pendingByNode, Text.compare, nodeKey)) { case (?a) a; case null [] };
    var next = cur;
    for (cid in enabledList().vals()) {
      let applies = switch (checkById(cid)) { case (?c) (c.os == "all" or c.os == fam); case null false };
      if (applies) { let id = "cis:" # checkWireId(cid); if (Array.find<Text>(next, func(x) = x == id) == null) next := Array.concat(next, [id]) };
    };
    if (next.size() != cur.size()) Map.add(pendingByNode, Text.compare, nodeKey, next);
  };
  func ensureInfoQueries() {
    for (c in DEVICE_INFO.vals()) {
      let id = "info:" # c.id;
      if (not Map.containsKey(distQueries, Text.compare, id)) Map.add(distQueries, Text.compare, id, { id; sql = c.sql; title = c.title; createdBy = "system"; createdAt = now(); source = "info" });
    };
  };

  // =====================================================================
  // reading the fleet
  // =====================================================================
  func enabledPosture(posture : [(Text, Bool, Text)]) : [(Text, Bool, Text)] = Array.filter<(Text, Bool, Text)>(posture, func((id, _, _)) = isEnabled(id));
  public type DeviceView = {
    nodeKey : Text; hostname : Text; hardwareSerial : Text; osVersion : Text; platform : Text; os : Text;
    owner : Text; ownerName : Text; ownerSource : Text; ownerEmail : Text; // owner = person id (0.2.0)
    enrolledAt : Int; lastSeen : Int; postureAt : Int;
    posture : [(Text, Bool, Text)]; score : Nat; failing : Nat;
    configCurrent : Bool; demo : Bool; failingChecks : [Text];
    assessment : Assessment;
  };
  func toView(n : Node) : DeviceView {
    let o = ownerOfSerial(n.hardwareSerial);
    let a = assessment(n);
    let p = Array.filter<(Text, Bool, Text)>(n.posture, func(p) = switch (checkById(p.0)) { case (?c) applicable(n, c); case null false });
    let failingChecks = Array.map<(Text, Bool, Text), Text>(Array.filter<(Text, Bool, Text)>(p, func((id, ok, _)) = not ok and resultState(n, id) == "current"), func(p) = p.0);
    {
      nodeKey = deviceId(n.nodeKey); hostname = n.hostname; hardwareSerial = n.hardwareSerial; osVersion = n.osVersion; platform = n.platform; os = osFamily(n.platform);
      owner = o; ownerName = (if (o == "") "" else nameOf(o)); ownerSource = ownerSource(n.hardwareSerial); ownerEmail = emailOfPid(o);
      enrolledAt = n.enrolledAt; lastSeen = n.lastSeen; postureAt = n.postureAt;
      posture = p; score = if (a.expected == 0) 0 else a.passed * 100 / a.expected; failing = a.failing; assessment = a; failingChecks;
      configCurrent = (switch (Map.get(nodeConfigVer, Text.compare, n.nodeKey)) { case (?v) v == configVersion; case null false }) or isDemo(n.nodeKey); demo = isDemo(n.nodeKey);
    };
  };
  func canSee(m : Me, n : Node) : Bool = m.role != "member" or (ownerOfSerial(n.hardwareSerial) != "" and ownerOfSerial(n.hardwareSerial) == m.id);

  /// Staff see the whole fleet; a member sees the devices that are theirs.
  public shared query func devices(tok : Text) : async [DeviceView] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    let out = List.empty<DeviceView>();
    for ((_, n) in Map.entries(nodes)) if (canSee(m, n)) List.add(out, toView(n));
    List.toArray(out);
  };
  public type FleetStats = { devices : Nat; compliant : Nat; avgScore : Nat; activeChecks : Nat; onLatestConfig : Nat; configVersion : Nat; enrollConfigured : Bool; ownersConfigured : Bool; unowned : Nat; failingByCheck : [(Text, Text, Nat, Nat)] };
  public shared query func fleetStats(tok : Text) : async ?FleetStats {
    switch (staff(tok)) { case null return null; case (?_) {} };
    var total = 0; var compliant = 0; var scoreSum = 0; var onLatest = 0; var unowned = 0;
    let seen = Map.empty<Text, (Nat, Nat)>(); // checkId -> (fail, seen)
    for ((_, n) in Map.entries(nodes)) {
      total += 1;
      let a = assessment(n); scoreSum += (if (a.expected == 0) 0 else a.passed * 100 / a.expected);
      if (a.state == "passing") compliant += 1;
      if (ownerOfSerial(n.hardwareSerial) == "") unowned += 1;
      switch (Map.get(nodeConfigVer, Text.compare, n.nodeKey)) { case (?v) { if (v == configVersion) onLatest += 1 }; case null { if (isDemo(n.nodeKey)) onLatest += 1 } };
      for ((id, ok, _) in enabledPosture(n.posture).vals()) if (resultState(n, id) == "current" and (switch (checkById(id)) { case (?c) applicable(n, c); case null false })) {
        let (f, s) = switch (Map.get(seen, Text.compare, id)) { case (?x) x; case null (0, 0) };
        Map.add(seen, Text.compare, id, (if (ok) f else f + 1, s + 1));
      };
    };
    let fb = List.empty<(Text, Text, Nat, Nat)>();
    for ((id, (f, s)) in Map.entries(seen)) List.add(fb, (id, checkTitle(id), f, s));
    ?{
      devices = total; compliant; avgScore = (if (total == 0) 0 else scoreSum / total); activeChecks = enabledList().size();
      onLatestConfig = onLatest; configVersion; enrollConfigured = enrollSecret != ""; ownersConfigured = assetsId != ""; unowned;
      failingByCheck = Array.sort<(Text, Text, Nat, Nat)>(List.toArray(fb), func(a, b) = Nat.compare(b.2, a.2));
    };
  };

  /// Everything one device page shows. Staff see any device; a member only their own.
  public type DeviceDetail = { device : DeviceView; info : [(Text, Text, Text)]; checks : [{ id : Text; title : Text; category : Text; level : Nat; custom : Bool; pass : Bool; detail : Text; state : Text; observedAt : Int }] };
  public shared query func deviceDetail(tok : Text, nodeId : Text) : async ?DeviceDetail {
    let nodeKey = deviceKey(nodeId);
    let m = switch (me(tok)) { case (?m) m; case null return null };
    let n = switch (Map.get(nodes, Text.compare, nodeKey)) { case (?n) n; case null return null };
    if (not canSee(m, n)) return null;
    let info = List.empty<(Text, Text, Text)>();
    for (c in DEVICE_INFO.vals()) {
      switch (Map.get(distResults, Text.compare, "info:" # c.id # "#" # nodeKey)) { case (?(rowsJson, _)) List.add(info, (c.id, c.title, rowsJson)); case null {} };
    };
    let checks = List.empty<{ id : Text; title : Text; category : Text; level : Nat; custom : Bool; pass : Bool; detail : Text; state : Text; observedAt : Int }>();
    for (c in allChecks().vals()) if (applicable(n, c)) {
      let result = Array.find<(Text, Bool, Text)>(n.posture, func(p) = p.0 == c.id);
      let o = observation(n, c.id);
      List.add(checks, { id = c.id; title = c.title; category = c.category; level = c.level; custom = Map.containsKey(customChecks, Text.compare, c.id); pass = switch result { case (?(_, pass, _)) pass; case null false }; detail = switch result { case (?(_, _, detail)) detail; case null "" }; state = resultState(n, c.id); observedAt = switch o { case (?v) v.at; case null 0 } });
    };
    ?{ device = toView(n); info = List.toArray(info); checks = List.toArray(checks) };
  };
  /// Opening a device page re-asks it for its facts (answered on the agent's next poll).
  public shared func refreshDeviceInfo(tok : Text, nodeId : Text) : async Bool {
    let nodeKey = deviceKey(nodeId);
    switch (staff(tok)) { case null return false; case (?_) {} };
    if (not Map.containsKey(nodes, Text.compare, nodeKey) or isDemo(nodeKey)) return false;
    ensureInfoQueries();
    for (c in DEVICE_INFO.vals()) addPending(nodeKey, "info:" # c.id);
    true;
  };

  // ---------- questions to the fleet or to one device ----------
  public shared func createQuery(tok : Text, args : { sql : Text; title : Text; source : Text; nodeKey : Text }) : async { ok : Bool; id : Text; targeted : Nat; detail : Text } {
    await createScopedQuery(tok, args, "all");
  };
  public shared func createScopedQuery(tok : Text, input : { sql : Text; title : Text; source : Text; nodeKey : Text }, os : Text) : async { ok : Bool; id : Text; targeted : Nat; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; id = ""; targeted = 0; detail = "admins only" } };
    let args = { input with nodeKey = deviceKey(input.nodeKey) };
    if (not has(["all", "macos", "windows", "linux"], os)) return { ok = false; id = ""; targeted = 0; detail = "Choose a supported operating system" };
    let clean = norm(args.sql);
    switch (sqlSafe(clean)) { case (?e) return { ok = false; id = ""; targeted = 0; detail = e }; case null {} };
    if (args.nodeKey != "" and (not Map.containsKey(nodes, Text.compare, args.nodeKey) or isDemo(args.nodeKey))) return { ok = false; id = ""; targeted = 0; detail = (if (isDemo(args.nodeKey)) "sample devices cannot answer questions" else "no such device") };
    distSeq += 1;
    let id = "q" # Nat.toText(distSeq);
    let source = if (args.source == "ai") "ai" else "admin";
    Map.add(distQueries, Text.compare, id, { id; sql = clean; title = (if (norm(args.title) == "") capText(clean, 80) else capText(norm(args.title), 80)); createdBy = m.id; createdAt = now(); source });
    var n = 0;
    if (args.nodeKey != "") { addPending(args.nodeKey, id); n := 1 }
    else { for ((k, node) in Map.entries(nodes)) { if (not isDemo(k) and (os == "all" or osFamily(node.platform) == os)) { addPending(k, id); n += 1 } } };
    log(m.email, "asked " # (if (args.nodeKey != "") "one device" else Nat.toText(n) # " device(s)") # ": " # capText(clean, 100));
    { ok = true; id; targeted = n; detail = (if (n == 0) "no device can answer yet — enrol one first" else "") };
  };
  public shared query func queryResults(tok : Text, id : Text) : async ?{ title : Text; sql : Text; answered : Nat; targeted : Nat; rows : [(Text, Text, Text)] } {
    switch (admin(tok)) { case null return null; case (?_) {} };
    let q = switch (Map.get(distQueries, Text.compare, id)) { case (?x) x; case null return null };
    let rows = List.empty<(Text, Text, Text)>();
    var answered = 0; var targeted = 0;
    for ((k, n) in Map.entries(nodes)) {
      let pending = switch (Map.get(pendingByNode, Text.compare, k)) { case (?a) Array.find<Text>(a, func(x) = x == id) != null; case null false };
      switch (Map.get(distResults, Text.compare, id # "#" # k)) {
        case (?(rowsJson, _)) { answered += 1; targeted += 1; List.add(rows, (deviceId(k), n.hostname, rowsJson)) };
        case null { if (pending) targeted += 1 };
      };
    };
    ?{ title = q.title; sql = q.sql; answered; targeted; rows = List.toArray(rows) };
  };

  // Monitoring removal revokes enrolment. Endpoint cleanup is an MDM operation;
  // a separate IT verification records evidence, never inferred from last contact.
  public type Removal = { id : Text; hostname : Text; serial : Text; identifiers : [Text]; requestedAt : Int; verifiedAt : Int; verifiedBy : Text; evidence : Text };
  let removals : Map.Map<Text, Removal> = Map.empty<Text, Removal>();
  public shared query func removalRecords(tok : Text) : async [Removal] {
    switch (admin(tok)) { case null []; case (?_) Iter.toArray(Map.values(removals)) };
  };
  public shared func verifyRemoval(tok : Text, id : Text, evidence : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let note = norm(evidence);
    if (note.size() < 8 or note.size() > 500) return { ok = false; detail = "Add an MDM job reference or audit result (8–500 characters)." };
    let r = switch (Map.get(removals, Text.compare, id)) { case null return { ok = false; detail = "removal not found" }; case (?r) r };
    if (r.verifiedAt != 0) return { ok = false; detail = "already verified" };
    Map.add(removals, Text.compare, id, { r with verifiedAt = now(); verifiedBy = m.email; evidence = note });
    log(m.email, "verified agent removal for " # r.hostname # ": " # note);
    { ok = true; detail = "IT verification saved. This is an operator attestation, not an automatic device acknowledgement." };
  };
  let decommissioned : Map.Map<Text, Int> = Map.empty<Text, Int>(); // hostIdentifier or SERIAL -> at
  func isDecommissioned(uuid : Text, serial : Text) : Bool {
    (uuid != "" and Map.containsKey(decommissioned, Text.compare, uuid)) or (serial != "" and Map.containsKey(decommissioned, Text.compare, serial));
  };
  func purgeNode(nodeKey : Text) {
    let id = deviceId(nodeKey); ignore Map.delete(deviceKeys, Text.compare, id); ignore Map.delete(deviceIds, Text.compare, nodeKey);
    for (c in allChecks().vals()) ignore Map.delete(observations, Text.compare, observationKey(nodeKey, c.id));
    ignore Map.delete(nodes, Text.compare, nodeKey);
    ignore Map.delete(pendingByNode, Text.compare, nodeKey);
    ignore Map.delete(nodeConfigVer, Text.compare, nodeKey);
    let doomed = List.empty<Text>();
    for ((k, _) in Map.entries(distResults)) { if (Text.endsWith(k, #text ("#" # nodeKey))) List.add(doomed, k) };
    for (k in List.values(doomed)) ignore Map.delete(distResults, Text.compare, k);
  };
  public shared func removeDevices(tok : Text, nodeKeys : [Text]) : async { ok : Bool; removed : Nat; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; removed = 0; detail = "admins only" } };
    var n = 0;
    let t = now();
    for (id in nodeKeys.vals()) {
      let nk = deviceKey(id);
      switch (Map.get(nodes, Text.compare, nk)) {
        case (?node) {
          if (not isDemo(nk)) {
            if (node.hostIdentifier != "") Map.add(decommissioned, Text.compare, node.hostIdentifier, t);
            if (node.hardwareSerial != "") Map.add(decommissioned, Text.compare, node.hardwareSerial, t);
          };
          if (not isDemo(nk)) {
            let handle = deviceId(nk);
            Map.add(removals, Text.compare, handle, { id = handle; hostname = node.hostname; serial = node.hardwareSerial; identifiers = [node.hostIdentifier, node.hardwareSerial]; requestedAt = t; verifiedAt = 0; verifiedBy = ""; evidence = "" });
          };
          purgeNode(nk);
          log(m.email, "removed monitoring for " # node.hostname # (if (isDemo(nk)) " (sample)" else ""));
          n += 1;
        };
        case null {};
      };
    };
    { ok = n > 0; removed = n; detail = (if (n == 0) "nothing removed" else "") };
  };
  /// Let a removed identifier back in (the device re-appears when its agent next enrols, if still installed).
  public shared func allowAgain(tok : Text, ids : [Text]) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    var n = 0;
    for (id in ids.vals()) {
      if (Map.delete(decommissioned, Text.compare, norm(id))) n += 1;
      for ((key, r) in Map.entries(removals)) {
        if (key == id or Array.any<Text>(r.identifiers, func x = x == norm(id))) {
          for (identifier in r.identifiers.vals()) { if (Map.delete(decommissioned, Text.compare, identifier)) n += 1 };
          ignore Map.delete(removals, Text.compare, key);
        };
      };
    };
    log(m.email, "allowed " # Nat.toText(n) # " identifier(s) to enrol again");
    { ok = n > 0; detail = (if (n == 0) "nothing changed" else "") };
  };
  public shared query func removedList(tok : Text) : async [(Text, Int)] {
    switch (admin(tok)) { case null []; case (?_) { let out = List.empty<(Text, Int)>(); for ((k, at) in Map.entries(decommissioned)) List.add(out, (k, at)); List.toArray(out) } };
  };

  // =====================================================================
  // the installer: flags + one script per OS, pointed at this canister
  // =====================================================================
  func selfHost() : Text = Principal.toText(Principal.fromActor(Trust)) # "." # gatewayDomain;

  func flagsBody(host : Text) : Text = flagsBodyFor(host, "unix");
  /// the flags file per platform — Windows keeps its secret next to the binary, not under /etc (the Unix path made every Windows enrolment fail)
  func flagsBodyFor(host : Text, platform : Text) : Text {
    "--tls_hostname=" # host # "\n" #
    (if (platform == "windows") "--enroll_secret_path=C:\\Program Files\\osquery\\enroll.secret\n" else "--enroll_secret_path=/etc/osquery/enroll.secret\n") #
    "--enroll_tls_endpoint=/enroll\n" #
    "--config_plugin=tls\n" #
    "--config_tls_endpoint=/config\n" #
    "--config_refresh=300\n" #
    "--disable_distributed=false\n" #
    "--distributed_plugin=tls\n" #
    "--distributed_tls_read_endpoint=/distributed/read\n" #
    "--distributed_tls_write_endpoint=/distributed/write\n" #
    "--distributed_interval=15\n" #
    "--logger_plugin=tls\n" #
    "--logger_tls_endpoint=/log\n" #
    "--logger_tls_period=60\n" #
    "--host_identifier=uuid\n" #
    // resource guardrails (osquery's own watchdog restarts a runaway worker)
    "--disable_watchdog=false\n" #
    "--watchdog_memory_limit=150\n" #
    "--watchdog_utilization_limit=30\n" #
    "--watchdog_delay=60\n" #
    "--schedule_splay_percent=30\n" #
    // Disable file carving and event streams; queries still report system metadata.
    "--disable_carver=true\n" #
    "--disable_events=true\n" #
    "--read_max=52428800\n";
  };
  public shared query func flagsFile(tok : Text) : async ?Text {
    switch (admin(tok)) { case null null; case (?_) ?flagsBody(selfHost()) };
  };

  // ---------- agent version: track osquery's latest stable, or pin one ----------
  var agentVersion : Text = "5.23.0"; // the pinned value
  var versionMode : Text = "stable"; // stable | pinned
  var stableVersion : Text = ""; // resolved from osquery's GitHub releases, cached
  var stableResolvedAt : Int = 0;
  transient let VERSION_FLOOR = "5.23.0";
  func effectiveVersion() : Text {
    if (versionMode == "pinned" and agentVersion != "") return agentVersion;
    if (stableVersion != "") return stableVersion;
    if (agentVersion != "") return agentVersion;
    VERSION_FLOOR;
  };
  func resolveStable() : async Bool {
    let req : HttpRequestArgs = {
      url = "https://api.github.com/repos/osquery/osquery/releases/latest"; max_response_bytes = ?200_000;
      headers = [{ name = "User-Agent"; value = "kebab-stack-trust" }, { name = "Accept"; value = "application/vnd.github+json" }];
      body = null; method = #get; transform = null; is_replicated = ?false;
    };
    let res = try { await (with timeout = 60) icHttp.http_request(req) } catch (_) { return false };
    if (res.status != 200) return false;
    let body = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null return false };
    let j = switch (Json.parse(body)) { case (#ok(x)) x; case (#err(_)) return false };
    let tag = jstr(j, "tag_name");
    let v = if (Text.startsWith(tag, #text "v")) Text.trimStart(tag, #text "v") else tag;
    if (not tokenSafe(v, 1, 40)) return false; // never let a malformed upstream tag reach an installer
    stableVersion := v; stableResolvedAt := now();
    true;
  };
  /// Legacy endpoint retained for compatibility; endpoint versions are deployed by IT.
  public shared func setAgentVersion(tok : Text, _mode : Text, _pinned : Text) : async { ok : Bool; detail : Text; effective : Text } {
    switch (admin(tok)) {
      case null { { ok = false; detail = "admins only"; effective = AgentDeployment.version } };
      case (?_) { { ok = false; detail = "Agent updates are managed through your deployment tool. Download the reviewed installer in Add devices."; effective = AgentDeployment.version } };
    };
  };
  public shared query func deploymentFile(tok : Text, os : Text, kind : Text, quiet : Bool) : async ?AgentDeployment.File {
    switch (admin(tok)) { case null return null; case (?_) {} };
    // All substitutions come from validated configuration, not caller-supplied shell text.
    let flags = Text.replace(flagsBody(selfHost()), #text "--enroll_secret_path=/etc/osquery/enroll.secret\n", "");
    AgentDeployment.file(os, kind, selfHost(), enrollSecret, flags, quiet);
  };
  public shared query func installScript(tok : Text, os : Text) : async ?Text {
    switch (admin(tok)) { case null return null; case (?_) {} };
    let flags = Text.replace(flagsBody(selfHost()), #text "--enroll_secret_path=/etc/osquery/enroll.secret\n", "");
    switch (AgentDeployment.file(os, "install", selfHost(), enrollSecret, flags, true)) { case null null; case (?f) ?f.body };
  };

  // =====================================================================
  // sample fleet — to see what the app does before a single agent is installed
  // =====================================================================
  public shared func seedDemo(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (demoSeeded or Map.size(nodes) > 0) return { ok = false; detail = "the fleet is not empty" };
    demoSeeded := true;
    let t = now();
    func mk(key : Text, host : Text, serial : Text, platform : Text, osv : Text, fails : [Text], ageH : Int) {
      let fam = osFamily(platform);
      let posture = List.empty<(Text, Bool, Text)>();
      for (cid in enabledList().vals()) {
        switch (checkById(cid)) {
          case (?c) { if (c.os == fam or c.os == "all") { let bad = has(fails, cid); List.add(posture, (cid, not bad, (if (bad) "needs attention (sample)" else "ok (sample)"))) } };
          case null {};
        };
      };
      ensureDeviceId(key);
      Map.add(nodes, Text.compare, key, { nodeKey = key; hostIdentifier = "DEMO-" # key; hostname = host; hardwareSerial = serial; osVersion = osv; platform; enrolledAt = t - 30 * DAY; lastSeen = t - ageH * H; posture = List.toArray(posture); postureAt = t - ageH * H });
    };
    mk("demo-1", "Ada's MacBook Pro", "DEMO0001", "darwin", "15.6", [], 0);
    mk("demo-2", "Ben's MacBook Air", "DEMO0002", "darwin", "15.5", ["filevault", "screenlock"], 3);
    mk("demo-3", "Chen's ThinkPad", "DEMO0003", "windows", "11 23H2", ["win_bitlocker"], 1);
    mk("demo-4", "Build server", "DEMO0004", "ubuntu", "24.04", ["lin_firewall"], 26);
    Map.add(manualOwner, Text.compare, "DEMO0001", m.id);
    log(m.email, "sample fleet added (4 devices)");
    { ok = true; detail = "4 sample devices" };
  };
  public shared func removeDemo(tok : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let ids = List.empty<Text>();
    for ((k, n) in Map.entries(nodes)) if (isDemo(k)) { List.add(ids, k); ignore Map.delete(manualOwner, Text.compare, upperSerial(n.hardwareSerial)) };
    for (k in List.values(ids)) purgeNode(k);
    demoSeeded := false;
    log(m.email, "sample fleet removed (" # Nat.toText(List.size(ids)) # " devices)");
    { ok = true; detail = Nat.toText(List.size(ids)) # " removed" };
  };

  // =====================================================================
  // housekeeping
  // =====================================================================
  func retention() {
    let t = now();
    let doomed = List.empty<Text>();
    for ((k, (_, at)) in Map.entries(distResults)) { if (t - at > 30 * DAY) List.add(doomed, k) };
    for (k in List.values(doomed)) ignore Map.delete(distResults, Text.compare, k);
    let oldQ = List.empty<Text>();
    for ((k, q) in Map.entries(distQueries)) { if (q.source != "cis" and q.source != "info" and t - q.createdAt > 30 * DAY) List.add(oldQ, k) };
    for (k in List.values(oldQ)) ignore Map.delete(distQueries, Text.compare, k);
  };

  // ---------- timers (declared last) ----------
  // =====================================================================
  // person ids (0.2.0): device owners (from assets or set here) are the hub's stable person id. This release
  // converts older address-keyed owners once, right after the upgrade (docs/PERSON-IDS.md).
  // =====================================================================
  var idMigration : Text = "pending"; // pending | done
  transient let MIGRATING : Text = "people ids are being migrated — try again in a minute";
  func migrating() : Bool = idMigration != "done";
  func isAddress(t : Text) : Bool = Text.contains(t, #char '@') and not Text.startsWith(t, #text "legacy:");
  func migrateIds() : async () {
    if (idMigration == "done") return;
    if (Map.size(serialOwner) == 0 and Map.size(manualOwner) == 0 and Map.size(distQueries) == 0) { idMigration := "done"; return }; // fresh install
    if (hubId == "") return;
    try { ignore await pullDirectory() } catch (_) {};
    let seen = Map.empty<Text, Bool>();
    func note(x : Text) { if (isAddress(x)) Map.add(seen, Text.compare, lower(x), true) };
    for ((_, e) in Map.entries(serialOwner)) note(e);
    for ((_, e) in Map.entries(manualOwner)) note(e);
    for ((_, q) in Map.entries(distQueries)) note(q.createdBy);
    let emails = Iter.toArray(Map.keys(seen));
    let found = Map.empty<Text, Text>();
    if (emails.size() > 0) {
      let hits = try { await Hub.lookupIds(Hub.hub(hubId), emails) } catch (_) { return }; // hub unreachable: the 30-second timer retries
      for ((e, pid) in hits.vals()) Map.add(found, Text.compare, e, pid);
    };
    if (idMigration == "done") return;
    func mig(x : Text) : Text = if (isAddress(x)) Hub.migrateKey(found, x) else x;
    for ((k, e) in Iter.toArray(Map.entries(serialOwner)).vals()) if (isAddress(e)) Map.add(serialOwner, Text.compare, k, mig(e));
    for ((k, e) in Iter.toArray(Map.entries(manualOwner)).vals()) if (isAddress(e)) Map.add(manualOwner, Text.compare, k, mig(e));
    for ((k, q) in Iter.toArray(Map.entries(distQueries)).vals()) if (isAddress(q.createdBy)) Map.add(distQueries, Text.compare, k, { q with createdBy = mig(q.createdBy) });
    idMigration := "done";
    log("system", "owner references migrated to person ids: " # Nat.toText(emails.size()) # " addresses, " # Nat.toText(Map.size(found)) # " known to the hub, the rest kept as legacy:<address>");
  };
  transient let _idMigrationTimer = Timer.setTimer<system>(#seconds 0, func() : async () { await migrateIds() });

  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () {
    try { ignore await pullDirectory() } catch (_) {};
    ignore Hub.pruneSessions(sessions);
    if (migrating()) { try { await migrateIds() } catch (_) {} };
    if (keySalt == "") keySalt := hex(await ic00.raw_rand());
    var have = List.size(keyPool);
    while (have < 16) { List.add(keyPool, hex(await ic00.raw_rand())); have += 1 };
  });
  ignore Timer.recurringTimer<system>(#seconds 60, func() : async () { try { await flushNotifications() } catch (_) {} });
  ignore Timer.recurringTimer<system>(#seconds 900, func() : async () { if (assetsId != "") { try { ignore await pullOwners() } catch (_) {} } });
  ignore Timer.recurringTimer<system>(#seconds 86_400, func() : async () {
    retention();
    // Agent updates now follow the approved, hash-pinned deployment bundle.
  });
  /// Aggregate-only read for Hub Operations; no session or records leave this app.
  public shared query ({ caller }) func hub_operations(viewer : Text) : async Operations.Snapshot {
    assert Hub.isHub(caller, hubId);
    let email = emailOfPid(viewer);
    if (viewer == "" or pidOf(email) != viewer or not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or Hub.appRole(people, email, "trust") != "admin") return Operations.denied();
    var total = 0; var passing = 0; var attention = 0; var unverified = 0; var scoreSum = 0; var assessed = 0;
    for (n in nodes.values()) if (not isDemo(n.nodeKey)) {
      total += 1; let a = assessment(n);
      if (a.state == "passing") passing += 1;
      if (a.failing > 0) attention += 1;
      // Full current coverage is separate from the outcome of the checks.
      if (a.expected == 0 or a.pending > 0 or a.stale > 0 or a.errors > 0 or now() - n.lastSeen > DAY) unverified += 1
      else { assessed += 1; scoreSum += a.passed * 100 / a.expected };
    };
    Operations.ready([("total", total), ("passing", passing), ("attention", attention), ("unverified", unverified), ("assessed", assessed), ("score", if (assessed == 0) 0 else scoreSum / assessed)]);
  };

};
