/// kebab-stack forms — forms in, decisions out.
///
/// A form builder (sections, the usual question types, go-to-section
/// branching) with anonymous public links, and a review pipeline for what
/// comes in: received → in review → accepted / declined, with ratings, an
/// assignee and team notes per submission. Charts and CSV export. Forms are
/// shared with colleagues as editors or viewers; deleted forms rest in a
/// 90-day trash.
///
/// Access model: people from the hub directory build and review (sign-in by
/// hub ticket, mo:kebab-hub). Respondents are anonymous — every form has a
/// random public slug; a client-generated edit token lets a respondent change
/// their own answers while the form allows it. Public writes are rate-limited
/// and growth-capped. The form definition and the answers are opaque JSON
/// owned by the frontend ({"v":1,…}); the canister owns identity, lifecycle,
/// review state and caps.
///
/// Stable-state rules: every top-level let/var is stable and append-only —
/// never remove or rename one; new data goes into new side tables.

import Hub "mo:kebab-hub";
import Support "mo:kebab-hub/Support";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Timer "mo:core/Timer";
import Error "mo:core/Error";

persistent actor Forms {
  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = ""; // hub BACKEND canister id
  var owner : ?Principal = null; // controller who ran setHub (CLI bootstrap)
  var appUrl : Text = ""; // this app's frontend URL (deep links in notifications)
  var orgName : Text = "";
  var adminGroup : Text = "forms-admins"; // hub group → admins (settings only; everyone in the directory builds forms)
  var adminEmails : [Text] = [];
  var adminClaimed : Bool = false;
  transient let BUILD_VERSION : Text = "0.5.1";
  transient let H : Int = 3_600_000_000_000;

  // =====================================================================
  // hub SDK state
  // =====================================================================
  let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
  let ids : Map.Map<Text, Text> = Map.empty<Text, Text>(); // address -> hub person id (0.2.0) — owners, shares, assignees, reviewers, note authors store the id
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
  func prefix(t : Text, n : Nat) : Text {
    var out = ""; var i = 0;
    for (c in t.chars()) { if (i < n) { out #= Char.toText(c); i += 1 } };
    out;
  };

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
  /// admin: hub owner/admin · the admins group · the bootstrap list — settings and the sample. Everyone else in the directory: member (builds and reviews their own and shared forms).
  // Historical migration evidence only. Never use this to authorize a request.
  func legacyRoleOf(email : Text) : Text {
    let e = lower(email);
    let hr = hubRoleOf(e);
    if (has(adminEmails, e) or inGroup(e, adminGroup) or hr == "owner" or hr == "admin") return "admin";
    "member";
  };
  func roleOf(email : Text) : Text {
    let role = Hub.appRole(people, lower(email), "forms");
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
  func active(email : Text) : Bool = Hub.isActive(people, lower(email));
  func pidOf(email : Text) : Text = Hub.pidOf(ids, email);
  /// current address of a stored id ("" when the person left and the address moved on)
  func emailOfPid(pid : Text) : Text = if (Text.contains(pid, #char '@') and not Text.startsWith(pid, #text "legacy:")) lower(pid) else Hub.emailOf(ids, pid);

  /// id = the hub's stable person id — what forms, shares, assignments, ratings and notes store. email = current address (roles, display).
  type Me = { id : Text; email : Text; displayName : Text; role : Text };
  func me(tok : Text) : ?Me {
    if (not Hub.directoryFresh(lastDirectoryPull)) return null;
    switch (Hub.session(sessions, tok)) {
      case (?s) { if (not Hub.isActive(people, s.email) or roleOf(s.email) == "none") return null; ?{ id = pidOf(s.email); email = s.email; displayName = s.displayName; role = roleOf(s.email) } };
      case null null;
    };
  };
  func admin(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (m.role == "admin") ?m else null }; case null null };

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
  public shared func claimAdmin(tok : Text) : async { ok : Bool; detail : Text } {
    { ok = false; detail = "App permissions are managed only in the Hub" };
  };
  func adminCount() : Nat { var n = 0; for ((e, u) in Map.entries(people)) if (u.active and roleOf(e) == "admin") n += 1; n };
  func needsClaim() : Bool = false;

  public type Settings = { hubId : Text; appUrl : Text; orgName : Text; adminGroup : Text; adminEmails : [Text]; peopleCount : Nat; lastDirectoryPull : Int; adminCount : Nat; forms : Nat; submissions : Nat; trashed : Nat; demoSeeded : Bool };
  public shared query func getSettings(tok : Text) : async ?Settings {
    switch (admin(tok)) {
      case null null;
      case (?_) ?{ hubId; appUrl; orgName; adminGroup = ""; adminEmails = []; peopleCount = Map.size(people); lastDirectoryPull; adminCount = adminCount(); forms = Map.size(forms); submissions = subsTotal; trashed = Map.size(formTrash); demoSeeded };
    };
  };
  public shared func setSettings(tok : Text, args : { adminGroup : Text; appUrl : Text; orgName : Text }) : async { ok : Bool; detail : Text } {
    if (norm(args.adminGroup) != "") return { ok = false; detail = "Role settings have moved to Hub Permissions" };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (args.appUrl != "" and not Text.startsWith(args.appUrl, #text "https://")) return { ok = false; detail = "app url must start with https://" };
    appUrl := norm(args.appUrl); orgName := norm(args.orgName);
    log(m.email, "settings updated");
    { ok = true; detail = "" };
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
    if (not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or roleOf(email) == "none" or Hub.appRole(people, email, "forms") != viewerRole) return Support.denied();
    let out = List.empty<Support.Item>();
    let assignments = Map.empty<Nat, Nat>();
    for (s in subs.values()) if (s.assignee == subject) assignments.add(s.formId, (assignments.get(s.formId) ?? 0) + 1);
    for ((_, f) in forms.entries()) if (canView(f, viewer) or (isTrashed(f.id) and formRole(f, viewer) == ?"owner")) {
      let owned = f.createdBy == subject;
      let sharedWith = sharesOf(f.id).any(func (pid, _) = pid == subject);
      let assigned = assignments.get(f.id) ?? 0;
      if (owned or sharedWith or assigned > 0) out.add({ id = f.id.toText(); kind = "form"; title = f.title; detail = (if (owned) "Owner" else if (sharedWith) "Shared access" else "Review assignment") # (if (assigned > 0) " · " # assigned.toText() # " assigned submissions" else ""); status = if (isTrashed(f.id)) "trash" else statusWord(f.status); path = "#/form/" # f.id.toText(); historical = isTrashed(f.id) or f.status == #closed });
    };
    Support.ready(out.toArray());
  };

  public shared query func hub_ping() : async Text { "forms" };

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

    { app = "forms"; model = 1; revision = Hub.permissionRevision(people, "forms"); directoryAt = lastDirectoryPull; legacy = legacy.toArray(); legacyGroups = [{ name = adminGroup; role = "admin" }] };
  };
  public shared query func hub_manifest() : async Hub.Manifest {
    {
      name = "forms"; version = BUILD_VERSION; description = "Forms in, decisions out: a builder with public links and a review pipeline for what comes in";
      needs = ["identity", "notify"]; // notify: a new submission reaches the form's owner and editors
      wants = ["roles", "groups"]; // roles: hub staff run the settings; groups: the admins group
    };
  };
  public shared query func hub_usesGroup(_name : Text) : async [Text] { [] };
  /// Offboarding: the forms a person owns (trash included). The hub shows them and lets an admin reassign.
  type OwnedObject = { id : Text; kind : Text; title : Text; meta : Text; updatedAt : Int };
  public shared query ({ caller }) func hub_ownedObjects(email : Text) : async [OwnedObject] {
    assert Hub.isHub(caller, hubId);
    let e = pidOf(lower(norm(email))); // the hub speaks addresses; forms store ids
    let out = List.empty<OwnedObject>();
    for ((_, f) in Map.entries(forms)) {
      if (f.createdBy == e) {
        let (total, _, _, _, _) = formCounts(f.id);
        let meta = statusWord(f.status) # " · " # Nat.toText(total) # " submission" # (if (total == 1) "" else "s") # (if (isTrashed(f.id)) " · in trash" else "");
        List.add(out, { id = Nat.toText(f.id); kind = "form"; title = f.title; meta; updatedAt = f.updatedAt });
      };
    };
    List.toArray(out);
  };
  public shared ({ caller }) func hub_reassign(ids : [Text], from : Text, to : Text) : async Nat {
    assert Hub.isHub(caller, hubId); directoryEpoch += 1;
    let f0 = pidOf(lower(norm(from))); let t0e = lower(norm(to));
    if (t0e == "" or not active(t0e)) return 0;
    let t0 = pidOf(t0e);
    var n = 0;
    for (idT in ids.vals()) {
      switch (Nat.fromText(idT)) {
        case (?id) {
          switch (Map.get(forms, Nat.compare, id)) {
            case (?f) { if (f.createdBy == f0) { Map.add(forms, Nat.compare, id, { f with createdBy = t0; updatedAt = now() }); n += 1 } };
            case null {};
          };
        };
        case null {};
      };
    };
    if (n > 0) log("hub", Nat.toText(n) # " form(s) moved from " # f0 # " to " # t0 # " (offboarding)");
    n;
  };

  func pullDirectory() : async Nat {
    if (hubId == "" or directoryPullRunning) return 0;
    directoryPullRunning := true;
    let expectedHub = hubId;
    let requestedAt = now();
    let epoch = directoryEpoch;
    try {
      let rows = await (with timeout = 30) Hub.hub(expectedHub).connectorDirectory();
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
    let tok = hex(await ic00.raw_rand());
    if (hubId != expectedHub or not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull) or roleOf(r.email) == "none") return null;
    ignore Hub.mintSession(sessions, tok, r.email, r.displayName, 10 * H);
    ?{ token = tok; email = lower(r.email); displayName = r.displayName; role = roleOf(r.email); suiteToken = (switch (r.suiteToken) { case (?t) t; case null "" }) };
  };
  public shared query func whoami(tok : Text) : async ?{ id : Text; email : Text; displayName : Text; role : Text; roleSource : Text; orgName : Text; hubId : Text; needsClaim : Bool } {
    switch (me(tok)) {
      case null null;
      case (?m) ?{ id = m.id; email = m.email; displayName = m.displayName; role = m.role; roleSource = roleSourceOf(m.email); orgName; hubId; needsClaim = false };
    };
  };
  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };
  /// People picker (sharing, assignees): active directory members matching q.
  public shared query func directory(tok : Text, q : Text) : async [{ email : Text; displayName : Text; department : Text }] {
    switch (me(tok)) {
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
  // forms — types & state
  // =====================================================================
  public type FormStatus = { #draft; #open; #closed };
  public type SubStatus = { #received; #inReview; #accepted; #declined };
  public type Form = {
    id : Nat;
    slug : Text; // public link token
    title : Text;
    description : Text;
    schema : Text; // JSON, frontend-owned, versioned
    status : FormStatus;
    allowEdit : Bool; // respondents may edit their submission while open
    cap : Nat; // max submissions, 0 = unlimited
    createdBy : Text; // e-mail of the owner
    createdAt : Int;
    updatedAt : Int;
    nextNum : Nat; // per-form submission counter
  };
  public type Review = { reviewer : Text; rating : Nat; at : Int }; // rating 1..5
  public type Note = { author : Text; text : Text; at : Int };
  type Submission = {
    id : Nat; formId : Nat; num : Nat;
    answers : Text; // JSON {qid: value}
    submitterName : Text; // respondent-declared, unverified
    submitterEmail : Text;
    submittedAt : Int; updatedAt : Int;
    status : SubStatus; assignee : Text; reviews : [Review]; notes : [Note];
    editToken : Text; // client-generated secret; never leaves via internal views
  };
  /// Internal view — everything except the respondent's edit token.
  public type SubView = { id : Nat; formId : Nat; num : Nat; answers : Text; submitterName : Text; submitterEmail : Text; submittedAt : Int; updatedAt : Int; status : SubStatus; assignee : Text; assigneeName : Text; reviews : [Review]; notes : [Note]; people : [(Text, Text, Text)] }; // assignee/reviewer/author are person ids; people = (id, current address, name) for each of them
  public type FormMeta = {
    id : Nat; slug : Text; title : Text; status : FormStatus; allowEdit : Bool; cap : Nat; createdBy : Text; createdByName : Text; createdAt : Int; updatedAt : Int;
    subs : Nat; subsReceived : Nat; subsInReview : Nat; subsAccepted : Nat; subsDeclined : Nat;
    myRole : Text; // owner | editor | viewer
    closesAt : Int; // 0 = no deadline
  };

  transient let MAX_FORMS : Nat = 2_000;
  transient let MAX_SUBS_TOTAL : Nat = 50_000;
  transient let MAX_SUBS_PER_FORM : Nat = 5_000;
  transient let MAX_SCHEMA : Nat = 200_000;
  transient let MAX_ANSWERS : Nat = 64_000; // BYTES of the answers JSON (0.2.1 — before, characters, i.e. up to 4× more)
  transient let MAX_ANSWER_BYTES_TOTAL : Nat = 256_000_000; // ≈ 256 MB of answers across all forms — the canister refuses new submissions beyond it
  var answerBytesTotal : Nat = 0;
  var answerBytesCounted : Bool = false; // one-time recount after the upgrade that introduced the budget
  func answerBytes(a : Text) : Nat = Text.encodeUtf8(a).size();
  transient let MAX_TEXT : Nat = 4_000;
  transient let MAX_SHARES : Nat = 200;
  transient let TRASH_TTL_NS : Int = 90 * 86_400_000_000_000;

  var nextFormId : Nat = 1;
  var nextSubId : Nat = 1;
  let forms : Map.Map<Nat, Form> = Map.empty<Nat, Form>();
  let slugIndex : Map.Map<Text, Nat> = Map.empty<Text, Nat>();
  let subs : Map.Map<Nat, Submission> = Map.empty<Nat, Submission>();
  var subsTotal : Nat = 0;
  let formShares : Map.Map<Nat, [(Text, Text)]> = Map.empty<Nat, [(Text, Text)]>(); // formId -> [(email, editor|viewer)]
  let formDeadlines : Map.Map<Nat, Int> = Map.empty<Nat, Int>(); // formId -> closes at (ns); absent = none
  let formTrash : Map.Map<Nat, Int> = Map.empty<Nat, Int>(); // formId -> deleted at; a trashed form is frozen and invisible
  var demoSeeded : Bool = false;

  func statusWord(s : FormStatus) : Text = switch (s) { case (#draft) "draft"; case (#open) "open"; case (#closed) "closed" };
  func isTrashed(id : Nat) : Bool = Map.containsKey(formTrash, Nat.compare, id);
  func sharesOf(id : Nat) : [(Text, Text)] = switch (Map.get(formShares, Nat.compare, id)) { case (?s) s; case null [] };
  func deadlineOf(id : Nat) : Int = switch (Map.get(formDeadlines, Nat.compare, id)) { case (?d) d; case null 0 };
  func pastDeadline(id : Nat) : Bool { let d = deadlineOf(id); d > 0 and now() > d };
  /// owner | editor | viewer | null (no access)
  /// pid = the caller's person id (shares and owners are stored as ids)
  func formRole(f : Form, pid : Text) : ?Text {
    if (Hub.directoryFresh(lastDirectoryPull) and roleOf(emailOfPid(pid)) == "admin") return ?"owner";
    if (f.createdBy == pid) return ?"owner";
    for ((p, r) in sharesOf(f.id).vals()) if (p == pid) return ?r;
    null;
  };
  func canView(f : Form, pid : Text) : Bool = not isTrashed(f.id) and formRole(f, pid) != null;
  func canEdit(f : Form, pid : Text) : Bool {
    if (isTrashed(f.id)) return false;
    switch (formRole(f, pid)) { case (?"owner") true; case (?"editor") true; case _ false };
  };
  func canReview(s : Submission, pid : Text) : Bool = switch (Map.get(forms, Nat.compare, s.formId)) { case (?f) canEdit(f, pid); case null false };
  func formCounts(formId : Nat) : (Nat, Nat, Nat, Nat, Nat) {
    var total = 0; var rec = 0; var rev = 0; var acc = 0; var dec = 0;
    for ((_, s) in Map.entries(subs)) {
      if (s.formId == formId) {
        total += 1;
        switch (s.status) { case (#received) rec += 1; case (#inReview) rev += 1; case (#accepted) acc += 1; case (#declined) dec += 1 };
      };
    };
    (total, rec, rev, acc, dec);
  };
  func toMeta(f : Form, myRole : Text) : FormMeta {
    let (total, rec, rev, acc, dec) = formCounts(f.id);
    { id = f.id; slug = f.slug; title = f.title; status = f.status; allowEdit = f.allowEdit; cap = f.cap; createdBy = f.createdBy; createdByName = nameOf(f.createdBy); createdAt = f.createdAt; updatedAt = f.updatedAt;
      subs = total; subsReceived = rec; subsInReview = rev; subsAccepted = acc; subsDeclined = dec; myRole; closesAt = deadlineOf(f.id) };
  };
  func toView(s : Submission) : SubView = {
    id = s.id; formId = s.formId; num = s.num; answers = s.answers; submitterName = s.submitterName; submitterEmail = s.submitterEmail;
    submittedAt = s.submittedAt; updatedAt = s.updatedAt; status = s.status; assignee = s.assignee; assigneeName = (if (s.assignee == "") "" else nameOf(s.assignee)); reviews = s.reviews; notes = s.notes;
    people = peopleOfSub(s);
  };
  func peopleOfSub(s : Submission) : [(Text, Text, Text)] {
    let seen = Map.empty<Text, Bool>(); let out = List.empty<(Text, Text, Text)>();
    func add(p : Text) { if (p != "" and not Map.containsKey(seen, Text.compare, p)) { Map.add(seen, Text.compare, p, true); List.add(out, (p, emailOfPid(p), nameOf(p))) } };
    add(s.assignee); for (r in s.reviews.vals()) add(r.reviewer); for (n in s.notes.vals()) add(n.author);
    List.toArray(out);
  };
  func hardDeleteForm(id : Nat) {
    switch (Map.get(forms, Nat.compare, id)) { case (?f) ignore Map.delete(slugIndex, Text.compare, f.slug); case null {} };
    ignore Map.delete(forms, Nat.compare, id);
    ignore Map.delete(formShares, Nat.compare, id);
    ignore Map.delete(formDeadlines, Nat.compare, id);
    ignore Map.delete(formTrash, Nat.compare, id);
    let doomed = List.empty<Nat>();
    for ((k, s) in Map.entries(subs)) if (s.formId == id) List.add(doomed, k);
    for (k in List.values(doomed)) { switch (Map.get(subs, Nat.compare, k)) { case (?s) releaseBytes(s.answers); case null {} }; ignore Map.delete(subs, Nat.compare, k); if (subsTotal > 0) subsTotal -= 1 };
  };
  func releaseBytes(a : Text) { let b = answerBytes(a); answerBytesTotal := (if (answerBytesTotal >= b) answerBytesTotal - b else 0) };
  func purgeTrash() {
    let t = now();
    let due = List.empty<Nat>();
    for ((id, at) in Map.entries(formTrash)) if (t - at > TRASH_TTL_NS) List.add(due, id);
    for (id in List.values(due)) hardDeleteForm(id);
  };
  func freshSlug() : async Text {
    var slug = "";
    label gen loop {
      slug := prefix(hex(await ic00.raw_rand()), 14);
      if (not Map.containsKey(slugIndex, Text.compare, slug)) break gen;
    };
    slug;
  };
  func emptySchema() : Text = "{\"v\":1,\"sections\":[{\"id\":1,\"title\":\"\",\"desc\":\"\",\"questions\":[]}]}";

  // =====================================================================
  // forms — build (anyone in the directory owns what they create)
  // =====================================================================
  public shared func createForm(tok : Text, title : Text) : async ?FormMeta {
    if (migrating()) return null;
    purgeTrash();
    let m = switch (me(tok)) { case (?m) m; case null return null };
    if (Map.size(forms) >= MAX_FORMS) return null;
    let tt = norm(title);
    if (tt.size() == 0 or tt.size() > MAX_TEXT) return null;
    let slug = await freshSlug();
    let t = now();
    let f : Form = { id = nextFormId; slug; title = tt; description = ""; schema = emptySchema(); status = #draft; allowEdit = false; cap = 0; createdBy = m.id; createdAt = t; updatedAt = t; nextNum = 1 };
    Map.add(forms, Nat.compare, f.id, f);
    Map.add(slugIndex, Text.compare, slug, f.id);
    nextFormId += 1;
    ?toMeta(f, "owner");
  };
  public shared func updateForm(tok : Text, id : Nat, args : { title : Text; description : Text; schema : Text; allowEdit : Bool; cap : Nat }) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "no such form" } };
    if (not canEdit(f, m.id)) return { ok = false; detail = "you can look at this form but not change it" };
    let tt = norm(args.title);
    if (tt.size() == 0 or tt.size() > MAX_TEXT) return { ok = false; detail = "the title needs 1–4000 characters" };
    if (args.description.size() > MAX_TEXT) return { ok = false; detail = "the description is too long" };
    if (args.schema.size() > MAX_SCHEMA) return { ok = false; detail = "the form is too large (200 000 characters of definition)" };
    Map.add(forms, Nat.compare, id, { f with title = tt; description = args.description; schema = args.schema; allowEdit = args.allowEdit; cap = args.cap; updatedAt = now() });
    { ok = true; detail = "" };
  };
  public shared func setFormStatus(tok : Text, id : Nat, status : FormStatus) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "no such form" } };
    if (not canEdit(f, m.id)) return { ok = false; detail = "viewers cannot change the status" };
    Map.add(forms, Nat.compare, id, { f with status; updatedAt = now() });
    { ok = true; detail = "" };
  };
  /// Response deadline (ns epoch, 0 = none). Owner/editor set it.
  public shared func setDeadline(tok : Text, id : Nat, closesAt : Int) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "no such form" } };
    if (not canEdit(f, m.id)) return { ok = false; detail = "viewers cannot set a deadline" };
    if (closesAt < 0) return { ok = false; detail = "bad date" };
    if (closesAt == 0) ignore Map.delete(formDeadlines, Nat.compare, id) else Map.add(formDeadlines, Nat.compare, id, closesAt);
    Map.add(forms, Nat.compare, id, { f with updatedAt = now() });
    { ok = true; detail = "" };
  };
  /// Copy a form you can see into a fresh draft you own (definition + settings; no submissions, shares or deadline).
  public shared func duplicateForm(tok : Text, id : Nat) : async ?FormMeta {
    if (migrating()) return null;
    let m = switch (me(tok)) { case (?m) m; case null return null };
    let src = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return null };
    if (not canView(src, m.id) or Map.size(forms) >= MAX_FORMS) return null;
    let slug = await freshSlug();
    let t = now();
    let f : Form = { id = nextFormId; slug; title = capText("Copy of " # src.title, MAX_TEXT); description = src.description; schema = src.schema; status = #draft; allowEdit = src.allowEdit; cap = src.cap; createdBy = m.id; createdAt = t; updatedAt = t; nextNum = 1 };
    Map.add(forms, Nat.compare, f.id, f);
    Map.add(slugIndex, Text.compare, slug, f.id);
    nextFormId += 1;
    ?toMeta(f, "owner");
  };
  /// Soft delete — the form rests in the owner's trash for 90 days; its public link stops working meanwhile.
  public shared func deleteForm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    purgeTrash();
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "no such form" } };
    if (formRole(f, m.id) != ?"owner") return { ok = false; detail = "only the owner can delete a form" };
    if (isTrashed(id)) return { ok = false; detail = "already in the trash" };
    Map.add(formTrash, Nat.compare, id, now());
    { ok = true; detail = "" };
  };
  /// Back from the trash, exactly as it was. Shares with people who left are dropped silently.
  public shared func restoreForm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "no such form" } };
    if (formRole(f, m.id) != ?"owner") return { ok = false; detail = "only the owner can restore a form" };
    if (not isTrashed(id)) return { ok = false; detail = "not in the trash" };
    ignore Map.delete(formTrash, Nat.compare, id);
    let kept = Array.filter<(Text, Text)>(sharesOf(id), func((pid, _)) = Hub.isActiveId(people, ids, pid)); // shares are person ids since 0.2.0
    if (kept.size() == 0) ignore Map.delete(formShares, Nat.compare, id) else Map.add(formShares, Nat.compare, id, kept);
    { ok = true; detail = "" };
  };
  public shared query func listTrash(tok : Text) : async [{ id : Nat; title : Text; deletedAt : Int; purgeAt : Int; subs : Nat }] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    let out = List.empty<{ id : Nat; title : Text; deletedAt : Int; purgeAt : Int; subs : Nat }>();
    for ((id, at) in Map.entries(formTrash)) {
      switch (Map.get(forms, Nat.compare, id)) {
        case (?f) { if (formRole(f, m.id) == ?"owner") { let (total, _, _, _, _) = formCounts(id); List.add(out, { id; title = f.title; deletedAt = at; purgeAt = at + TRASH_TTL_NS; subs = total }) } };
        case null {};
      };
    };
    List.toArray(out);
  };
  /// Delete forever, straight from the trash (owner only).
  public shared func purgeForm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "no such form" } };
    if (formRole(f, m.id) != ?"owner") return { ok = false; detail = "only the owner can delete a form forever" };
    if (not isTrashed(id)) return { ok = false; detail = "move it to the trash first" };
    hardDeleteForm(id);
    log(m.email, "form #" # Nat.toText(id) # " deleted forever");
    { ok = true; detail = "" };
  };
  /// Own forms + forms shared with me.
  public shared query func listForms(tok : Text) : async [FormMeta] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    let out = List.empty<FormMeta>();
    for ((_, f) in Map.entries(forms)) {
      if (not isTrashed(f.id)) { switch (formRole(f, m.id)) { case (?r) List.add(out, toMeta(f, r)); case null {} } };
    };
    List.toArray(out);
  };
  public type FormFull = { form : Form; meta : FormMeta; shares : [(Text, Text, Text)] }; // (email, role, name)
  public shared query func getForm(tok : Text, id : Nat) : async ?FormFull {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return null };
    if (not canView(f, m.id)) return null;
    let r = switch (formRole(f, m.id)) { case (?r) r; case null return null };
    ?{ form = f; meta = toMeta(f, r); shares = Array.map<(Text, Text), (Text, Text, Text)>(sharesOf(id), func((p, ro)) = (emailOfPid(p), ro, nameOf(p))) }; // (current address, role, name) — the share editor speaks addresses
  };

  // =====================================================================
  // sharing (owner manages; directory-validated)
  // =====================================================================
  /// Replaces the full share list. Roles: editor | viewer.
  public shared func setShares(tok : Text, id : Nat, shares : [(Text, Text)]) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "no such form" } };
    if (isTrashed(id)) return { ok = false; detail = "the form is in the trash" };
    if (formRole(f, m.id) != ?"owner") return { ok = false; detail = "only the owner shares a form" };
    if (shares.size() > MAX_SHARES) return { ok = false; detail = "too many people (200 max)" };
    let clean = List.empty<(Text, Text)>();
    label rows for ((e0, r) in shares.vals()) {
      let e = lower(norm(e0));
      if (e == "") continue rows; // a former colleague's share echoed back without an address — drop it
      let p = pidOf(e);
      if (p == f.createdBy) return { ok = false; detail = "the owner does not need a share" };
      if (r != "editor" and r != "viewer") return { ok = false; detail = "role must be editor or viewer" };
      if (not active(e)) return { ok = false; detail = "pick people from the directory: " # e };
      var dup = false;
      for ((p2, _) in List.toArray(clean).vals()) if (p2 == p) dup := true;
      if (not dup) List.add(clean, (p, r));
    };
    if (List.size(clean) == 0) ignore Map.delete(formShares, Nat.compare, id) else Map.add(formShares, Nat.compare, id, List.toArray(clean));
    { ok = true; detail = "" };
  };

  // =====================================================================
  // respondents (public, anonymous)
  // =====================================================================
  transient var subWindowStart : Int = 0;
  transient var subWindowCount : Nat = 0;

  public shared query func publicForm(slug : Text) : async ?{ title : Text; description : Text; schema : Text; allowEdit : Bool; open : Bool; capReached : Bool; closesAt : Int; orgName : Text } {
    let id = switch (Map.get(slugIndex, Text.compare, slug)) { case (?id) id; case null return null };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return null };
    if (f.status == #draft or isTrashed(f.id)) return null; // drafts and trashed forms are invisible
    let (total, _, _, _, _) = formCounts(f.id);
    let capReached = f.cap > 0 and total >= f.cap;
    ?{ title = f.title; description = f.description; schema = f.schema; allowEdit = f.allowEdit; open = f.status == #open and not capReached and not pastDeadline(f.id); capReached; closesAt = deadlineOf(f.id); orgName };
  };
  /// Internal preview: any status incl. drafts, sign-in + access required, never creates a submission.
  public shared query func previewForm(tok : Text, slug : Text) : async ?{ id : Nat; title : Text; description : Text; schema : Text; allowEdit : Bool; status : FormStatus; myRole : Text; closesAt : Int } {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    let id = switch (Map.get(slugIndex, Text.compare, slug)) { case (?id) id; case null return null };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return null };
    if (isTrashed(id)) return null;
    switch (formRole(f, m.id)) {
      case (?r) ?{ id = f.id; title = f.title; description = f.description; schema = f.schema; allowEdit = f.allowEdit; status = f.status; myRole = r; closesAt = deadlineOf(id) };
      case null null;
    };
  };
  public shared func submitPublic(slug : Text, name : Text, email : Text, answers : Text, editToken : Text) : async { ok : Bool; num : Nat; detail : Text } {
    func fail(d : Text) : { ok : Bool; num : Nat; detail : Text } = { ok = false; num = 0; detail = d };
    let bytes = answerBytes(answers);
    if (answers.size() == 0 or bytes > MAX_ANSWERS) return fail("the answers are too large");
    if (name.size() > MAX_TEXT or email.size() > MAX_TEXT) return fail("name or e-mail too long");
    if (editToken.size() > 0 and (editToken.size() < 16 or editToken.size() > 128)) return fail("bad token");
    let t = now();
    if (t - subWindowStart > 5 * 60_000_000_000) { subWindowStart := t; subWindowCount := 0 };
    if (subWindowCount >= 600) return fail("too many submissions right now — try again in a few minutes");
    let id = switch (Map.get(slugIndex, Text.compare, slug)) { case (?id) id; case null return fail("form not found") };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return fail("form not found") };
    if (isTrashed(f.id)) return fail("form not found");
    if (f.status != #open) return fail("this form is not accepting submissions");
    if (pastDeadline(f.id)) return fail("the response deadline has passed");
    if (subsTotal >= MAX_SUBS_TOTAL or answerBytesTotal + bytes > MAX_ANSWER_BYTES_TOTAL) return fail("storage is full — tell the form owner");
    let (total, _, _, _, _) = formCounts(f.id);
    if (total >= MAX_SUBS_PER_FORM) return fail("this form is full");
    if (f.cap > 0 and total >= f.cap) return fail("this form has reached its submission limit");
    subWindowCount += 1; // only an ACCEPTED submission counts towards the window — invalid slugs and closed forms cannot lock everyone out
    answerBytesTotal += bytes;
    let sub : Submission = { id = nextSubId; formId = f.id; num = f.nextNum; answers; submitterName = capText(norm(name), 200); submitterEmail = lower(capText(norm(email), 200)); submittedAt = t; updatedAt = t; status = #received; assignee = ""; reviews = []; notes = []; editToken };
    Map.add(subs, Nat.compare, sub.id, sub);
    Map.add(forms, Nat.compare, f.id, { f with nextNum = f.nextNum + 1 });
    nextSubId += 1;
    subsTotal += 1;
    notifyReviewers<system>(f, sub.num, sub.id); // detached — the respondent never waits on the hub
    { ok = true; num = sub.num; detail = "" };
  };
  /// Respondent pulls their own submission back (edit lane).
  public shared query func mySubmission(slug : Text, editToken : Text) : async ?{ num : Nat; answers : Text; updatable : Bool; status : SubStatus } {
    if (editToken.size() < 16) return null;
    let id = switch (Map.get(slugIndex, Text.compare, slug)) { case (?id) id; case null return null };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return null };
    if (isTrashed(id)) return null;
    for ((_, s) in Map.entries(subs)) {
      if (s.formId == id and s.editToken == editToken) return ?{ num = s.num; answers = s.answers; updatable = f.allowEdit and f.status == #open and not pastDeadline(id); status = s.status };
    };
    null;
  };
  public shared func updateMySubmission(slug : Text, editToken : Text, answers : Text) : async { ok : Bool; detail : Text } {
    if (editToken.size() < 16) return { ok = false; detail = "bad token" };
    let bytes = answerBytes(answers);
    if (answers.size() == 0 or bytes > MAX_ANSWERS) return { ok = false; detail = "the answers are too large" };
    let id = switch (Map.get(slugIndex, Text.compare, slug)) { case (?id) id; case null return { ok = false; detail = "form not found" } };
    let f = switch (Map.get(forms, Nat.compare, id)) { case (?f) f; case null return { ok = false; detail = "form not found" } };
    if (isTrashed(f.id)) return { ok = false; detail = "form not found" };
    if (not (f.allowEdit and f.status == #open)) return { ok = false; detail = "this form does not allow changes" };
    if (pastDeadline(f.id)) return { ok = false; detail = "the response deadline has passed" };
    for ((k, s) in Map.entries(subs)) {
      if (s.formId == id and s.editToken == editToken) {
        let before = answerBytes(s.answers);
        if (bytes > before and answerBytesTotal + (bytes - before) > MAX_ANSWER_BYTES_TOTAL) return { ok = false; detail = "storage is full — tell the form owner" };
        let grown = answerBytesTotal + bytes; answerBytesTotal := (if (grown >= before) grown - before else 0);
        Map.add(subs, Nat.compare, k, { s with answers; updatedAt = now() }); return { ok = true; detail = "" };
      };
    };
    { ok = false; detail = "submission not found" };
  };

  /// Tell the owner and the editors about a new submission — through the hub, detached.
  func notifyReviewers<system>(f : Form, subNum : Nat, subId : Nat) {
    if (hubId == "") return;
    let recipients = List.empty<Text>();
    List.add(recipients, f.createdBy);
    for ((e, r) in sharesOf(f.id).vals()) if (r == "editor") List.add(recipients, e);
    let title = "New submission #" # Nat.toText(subNum) # " · " # capText(f.title, 80);
    let url = if (appUrl == "") "" else appUrl # "/#/form/" # Nat.toText(f.id) # "/subs";
    let addr = List.empty<Text>();
    for (p in List.values(recipients)) { let e = emailOfPid(p); if (e != "" and not has(List.toArray(addr), e)) List.add(addr, e) }; // a former colleague whose address moved on is skipped
    let targets = List.toArray(addr);
    ignore Timer.setTimer<system>(#seconds 0, func() : async () {
      for (e in targets.vals()) {
        try { ignore await (with timeout = 30) Hub.hub(hubId).hub_notify({ email = e; title; url; kind = "forms.submission"; dedupeKey = "sub-" # Nat.toText(subId) # "-" # e }) } catch (_) {};
      };
    });
  };

  // =====================================================================
  // review (owner/editor; viewers read)
  // =====================================================================
  public shared query func listSubmissions(tok : Text, formId : Nat) : async [SubView] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    switch (Map.get(forms, Nat.compare, formId)) { case (?f) { if (not canView(f, m.id)) return [] }; case null return [] };
    let out = List.empty<SubView>();
    for ((_, s) in Map.entries(subs)) if (s.formId == formId) List.add(out, toView(s));
    List.toArray(out);
  };
  public shared func setSubmissionStatus(tok : Text, subId : Nat, status : SubStatus) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let s = switch (Map.get(subs, Nat.compare, subId)) { case (?s) s; case null return { ok = false; detail = "no such submission" } };
    if (not canReview(s, m.id)) return { ok = false; detail = "viewers cannot review" };
    Map.add(subs, Nat.compare, subId, { s with status; updatedAt = now() });
    { ok = true; detail = "" };
  };
  public shared func assignSubmission(tok : Text, subId : Nat, email : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let e = lower(norm(email));
    if (e != "" and not active(e)) return { ok = false; detail = "pick the person from the directory" };
    let s = switch (Map.get(subs, Nat.compare, subId)) { case (?s) s; case null return { ok = false; detail = "no such submission" } };
    if (not canReview(s, m.id)) return { ok = false; detail = "viewers cannot assign" };
    Map.add(subs, Nat.compare, subId, { s with assignee = (if (e == "") "" else pidOf(e)); updatedAt = now() });
    { ok = true; detail = "" };
  };
  /// One rating per reviewer (upsert), 1..5.
  public shared func rateSubmission(tok : Text, subId : Nat, rating : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    if (rating < 1 or rating > 5) return { ok = false; detail = "1 to 5 stars" };
    let s = switch (Map.get(subs, Nat.compare, subId)) { case (?s) s; case null return { ok = false; detail = "no such submission" } };
    if (not canReview(s, m.id)) return { ok = false; detail = "viewers cannot rate" };
    let others = Array.filter<Review>(s.reviews, func(r) = r.reviewer != m.id);
    Map.add(subs, Nat.compare, subId, { s with reviews = Array.concat(others, [{ reviewer = m.id; rating; at = now() }]); updatedAt = now() });
    { ok = true; detail = "" };
  };
  public shared func addNote(tok : Text, subId : Nat, text : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let tt = norm(text);
    if (tt.size() == 0 or tt.size() > MAX_TEXT) return { ok = false; detail = "a note needs 1–4000 characters" };
    let s = switch (Map.get(subs, Nat.compare, subId)) { case (?s) s; case null return { ok = false; detail = "no such submission" } };
    if (not canReview(s, m.id)) return { ok = false; detail = "viewers cannot add notes" };
    if (s.notes.size() >= 200) return { ok = false; detail = "200 notes is plenty" };
    Map.add(subs, Nat.compare, subId, { s with notes = Array.concat(s.notes, [{ author = m.id; text = tt; at = now() }]); updatedAt = now() });
    { ok = true; detail = "" };
  };
  /// Spam clean-up: the form owner removes a submission for good.
  public shared func deleteSubmission(tok : Text, subId : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let s = switch (Map.get(subs, Nat.compare, subId)) { case (?s) s; case null return { ok = false; detail = "no such submission" } };
    switch (Map.get(forms, Nat.compare, s.formId)) { case (?f) { if (formRole(f, m.id) != ?"owner" or isTrashed(f.id)) return { ok = false; detail = "only the form owner deletes submissions" } }; case null {} };
    releaseBytes(s.answers);
    ignore Map.delete(subs, Nat.compare, subId);
    if (subsTotal > 0) subsTotal -= 1;
    { ok = true; detail = "" };
  };

  // =====================================================================
  // sample form — to see what the app does
  // =====================================================================
  public shared func seedDemo(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (demoSeeded) return { ok = false; detail = "the sample form exists already" };
    if (Map.size(forms) >= MAX_FORMS) return { ok = false; detail = "form limit reached" };
    demoSeeded := true;
    let slug = await freshSlug();
    let t = now();
    let schema = "{\"v\":1,\"askName\":\"optional\",\"askEmail\":\"off\",\"sections\":[{\"id\":1,\"title\":\"About the idea\",\"desc\":\"\",\"questions\":[{\"id\":1,\"type\":\"short\",\"title\":\"Name of the idea\",\"req\":true},{\"id\":2,\"type\":\"para\",\"title\":\"What problem does it solve?\",\"req\":true},{\"id\":3,\"type\":\"choice\",\"title\":\"Who benefits most?\",\"opts\":[\"Customers\",\"The team\",\"Everyone\"],\"routes\":{},\"req\":true},{\"id\":4,\"type\":\"scale\",\"title\":\"How ready is it?\",\"min\":1,\"max\":5,\"minL\":\"an idea\",\"maxL\":\"ready to ship\",\"req\":false}]}]}";
    let f : Form = { id = nextFormId; slug; title = "Sample: idea box"; description = "A sample form with a few submissions to try the review pipeline. Remove it under Settings whenever you like."; schema; status = #open; allowEdit = true; cap = 0; createdBy = m.id; createdAt = t; updatedAt = t; nextNum = 1 };
    Map.add(forms, Nat.compare, f.id, f); Map.add(slugIndex, Text.compare, slug, f.id); nextFormId += 1;
    let rows : [(Text, Text, SubStatus)] = [
      ("Ada", "{\"1\":\"Lunch roulette\",\"2\":\"People eat with the same colleagues every day.\",\"3\":\"The team\",\"4\":4}", #accepted),
      ("Ben", "{\"1\":\"Quiet hours\",\"2\":\"Too many meetings before noon.\",\"3\":\"Everyone\",\"4\":3}", #inReview),
      ("", "{\"1\":\"Plant wall\",\"2\":\"The office feels grey.\",\"3\":\"Everyone\",\"4\":2}", #received),
    ];
    var num = 1;
    for ((nm, ans, st) in rows.vals()) {
      Map.add(subs, Nat.compare, nextSubId, { id = nextSubId; formId = f.id; num; answers = ans; submitterName = nm; submitterEmail = ""; submittedAt = t - num * H; updatedAt = t - num * H; status = st; assignee = ""; reviews = (if (st == #accepted) [{ reviewer = m.id; rating = 5; at = t }] else []); notes = []; editToken = "" });
      nextSubId += 1; subsTotal += 1; num += 1;
    };
    Map.add(forms, Nat.compare, f.id, { f with nextNum = num });
    log(m.email, "sample form added");
    { ok = true; detail = "sample form with 3 submissions" };
  };
  public shared func removeDemo(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    var n = 0;
    let ids = List.empty<Nat>();
    for ((id, f) in Map.entries(forms)) if (f.title == "Sample: idea box" and f.createdBy == m.id) List.add(ids, id);
    for (id in List.values(ids)) { hardDeleteForm(id); n += 1 };
    demoSeeded := false;
    log(m.email, "sample form removed");
    { ok = true; detail = Nat.toText(n) # " removed" };
  };

  // ---------- timers ----------
  // =====================================================================
  // person ids (0.2.0): owners, shares, assignees, reviewers and note authors are the hub's stable person id.
  // This release rewrites older address-keyed records once, right after the upgrade (docs/PERSON-IDS.md);
  // writes by signed-in people are refused with a plain sentence until that is done. Public submissions
  // carry no person ids and keep working.
  // =====================================================================
  var idMigration : Text = "pending"; // pending | done
  transient let MIGRATING : Text = "people ids are being migrated — try again in a minute";
  func migrating() : Bool = idMigration != "done";
  func isAddress(t : Text) : Bool = Text.contains(t, #char '@') and not Text.startsWith(t, #text "legacy:");
  func migrateIds() : async () {
    if (idMigration == "done") return;
    if (Map.size(forms) == 0) { idMigration := "done"; return }; // fresh install
    if (hubId == "") return;
    try { ignore await pullDirectory() } catch (_) {};
    let seen = Map.empty<Text, Bool>();
    func note(x : Text) { if (isAddress(x)) Map.add(seen, Text.compare, lower(x), true) };
    for ((_, f) in Map.entries(forms)) note(f.createdBy);
    for ((_, sh) in Map.entries(formShares)) for ((e, _) in sh.vals()) note(e);
    for ((_, s) in Map.entries(subs)) { note(s.assignee); for (r in s.reviews.vals()) note(r.reviewer); for (n in s.notes.vals()) note(n.author) };
    let emails = Iter.toArray(Map.keys(seen));
    let found = Map.empty<Text, Text>();
    if (emails.size() > 0) {
      let hits = try { await Hub.lookupIds(Hub.hub(hubId), emails) } catch (_) { return }; // hub unreachable: the 30-second timer retries
      for ((e, pid) in hits.vals()) Map.add(found, Text.compare, e, pid);
    };
    if (idMigration == "done") return;
    func mig(x : Text) : Text = if (isAddress(x)) Hub.migrateKey(found, x) else x;
    for ((id, f) in Iter.toArray(Map.entries(forms)).vals()) if (isAddress(f.createdBy)) Map.add(forms, Nat.compare, id, { f with createdBy = mig(f.createdBy) });
    for ((id, sh) in Iter.toArray(Map.entries(formShares)).vals()) Map.add(formShares, Nat.compare, id, Array.map<(Text, Text), (Text, Text)>(sh, func((e, r)) = (mig(e), r)));
    for ((id, s) in Iter.toArray(Map.entries(subs)).vals()) {
      Map.add(subs, Nat.compare, id, { s with assignee = mig(s.assignee); reviews = Array.map<Review, Review>(s.reviews, func(r) = { r with reviewer = mig(r.reviewer) }); notes = Array.map<Note, Note>(s.notes, func(n) = { n with author = mig(n.author) }) });
    };
    idMigration := "done";
    log("system", "people references migrated to person ids: " # Nat.toText(emails.size()) # " addresses, " # Nat.toText(Map.size(found)) # " known to the hub, the rest kept as legacy:<address>");
  };
  transient let _idMigrationTimer = Timer.setTimer<system>(#seconds 0, func() : async () { await migrateIds() });
  transient let _answerBytesTimer = Timer.setTimer<system>(#seconds 0, func() : async () {
    if (answerBytesCounted) return;
    var n = 0; for ((_, sub) in Map.entries(subs)) n += answerBytes(sub.answers);
    answerBytesTotal := n; answerBytesCounted := true;
  });

  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { try { ignore await pullDirectory() } catch (_) {}; ignore Hub.pruneSessions(sessions); if (migrating()) { try { await migrateIds() } catch (_) {} } });
  ignore Timer.recurringTimer<system>(#seconds 21_600, func() : async () { purgeTrash() });
};
