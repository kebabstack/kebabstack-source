/// kebab-stack bug — Ship the Bug, the office mini-game.
///
/// Throw a bug off the company roof and see how far it gets through the
/// software-delivery journey: localhost, dev, staging, production … all the
/// way to the internet. Pixel game in the browser; this canister keeps the
/// scoreboards (daily, weekly, all-time), the daily ghost (today's best run,
/// replayed as a translucent chaser) and a player's chosen board name.
///
/// Privacy model: publishing a run is OPT-IN, asked after every throw. Private
/// runs only bump an anonymous counter. Players may remove their published
/// scores anytime. The board shows the name a player chose (their hub name or
/// a unique handle) and is only visible to signed-in people. Scores are archive
/// data — deliberately no hub_ownedObjects/hub_reassign.
///
/// Sign-in and people come from the hub (mo:kebab-hub).
///
/// Stable-state rules: every top-level let/var is stable and append-only —
/// never remove or rename one; new data goes into new side tables.

import Hub "mo:kebab-hub";
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
import Int "mo:core/Int";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Timer "mo:core/Timer";
import Error "mo:core/Error";

import Arcade "mixins/Arcade";
import T "types";

persistent actor Bug {
  let arcadeProfiles : T.Profiles = Map.empty();
  let arcadeAliases : Map.Map<Text, Text> = Map.empty();
  let arcadeLinks : T.Links = Map.empty();
  let arcadeRuns : T.Runs = Map.empty();
  let arcadeScores : T.Scores = Map.empty();
  let arcadeCounters : T.Counters = { var nextId = 0 };
  include Arcade(arcadeProfiles, arcadeAliases, arcadeLinks, arcadeRuns, arcadeScores, arcadeCounters,
    func() : Text { hubId },
    func(tok : Text) : ?Text { switch (me(tok)) { case (?m) ?m.id; case null null } },
    func(ticket : Text) : async ?T.Login { await loginWithTicket(ticket) },
    func(tok : Text) { Hub.endSession(sessions, tok) },
    func(pid : Text) : Text { playerNames.get(pid) ?? "" },
    func(alias : Text) : ?Text { aliasOwner.get(alias) });

  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = "";
  var owner : ?Principal = null;
  var appUrl : Text = ""; // this app's frontend URL (the link in the "dethroned" note)
  var orgName : Text = "";
  var adminGroup : Text = "bug-admins";
  var adminEmails : [Text] = [];
  var adminClaimed : Bool = false;
  transient let BUILD_VERSION : Text = "0.2.5";
  transient let H : Int = 3_600_000_000_000;
  transient let DAY : Int = 86_400_000_000_000;

  // =====================================================================
  // hub SDK state
  // =====================================================================
  let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
  let ids : Map.Map<Text, Text> = Map.empty<Text, Text>(); // address -> hub person id (0.2.0) — players and scores store the id
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

  // =====================================================================
  // people & roles
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
  /// admin: hub owner/admin · the admins group · the bootstrap list — settings only. Everyone in the directory plays.
  func roleOf(email : Text) : Text {
    let e = lower(email);
    let hr = hubRoleOf(e);
    if (has(adminEmails, e) or inGroup(e, adminGroup) or hr == "owner" or hr == "admin") return "admin";
    "player";
  };
  func roleSourceOf(email : Text) : Text {
    let e = lower(email);
    if (has(adminEmails, e)) return "bootstrap admin list";
    if (inGroup(e, adminGroup)) return "hub group " # adminGroup;
    let hr = hubRoleOf(e);
    if (hr != "") return "hub " # hr;
    "directory member";
  };
  /// id = the hub's stable person id — the player key behind every name choice and score. email = current address (roles, notify).
  type Me = { id : Text; email : Text; displayName : Text; role : Text };
  func me(tok : Text) : ?Me {
    if (not Hub.directoryFresh(lastDirectoryPull)) return null;
    switch (Hub.session(sessions, tok)) {
      case (?s) { if (not Hub.isActive(people, s.email)) return null; ?{ id = pidOf(s.email); email = s.email; displayName = s.displayName; role = roleOf(s.email) } };
      case null null;
    };
  };
  func pidOf(email : Text) : Text = Hub.pidOf(ids, email);
  func emailOfPid(pid : Text) : Text = if (Text.contains(pid, #char '@') and not Text.startsWith(pid, #text "legacy:")) lower(pid) else Hub.emailOf(ids, pid);
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
    let e = lower(norm(email));
    if (e == "" or has(adminEmails, e)) return false;
    adminEmails := Array.concat(adminEmails, [e]);
    log(Principal.toText(caller), "admin e-mail added " # e);
    true;
  };
  public shared func claimAdmin(tok : Text) : async { ok : Bool; detail : Text } {
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let hr = hubRoleOf(m.email);
    if (hr != "owner" and hr != "admin") return { ok = false; detail = "a Hub owner/admin must set up app administration; ask the operator to grant the roles lane or use the controller CLI" };
    if (adminClaimed) return { ok = false; detail = "the first-run claim was already used — ask an admin or use addAdminEmail from the CLI" };
    if (adminCount() > 0) return { ok = false; detail = "the game already has admins" };
    adminClaimed := true;
    adminEmails := [m.email];
    log(m.email, "claimed first admin (first-run, one-shot)");
    { ok = true; detail = "" };
  };
  func adminCount() : Nat { var n = 0; for ((e, u) in Map.entries(people)) if (u.active and roleOf(e) == "admin") n += 1; for (e in adminEmails.vals()) if (not Map.containsKey(people, Text.compare, e)) n += 1; n };
  func needsClaim() : Bool = not adminClaimed and adminCount() == 0;

  public type Settings = { hubId : Text; appUrl : Text; orgName : Text; adminGroup : Text; adminEmails : [Text]; peopleCount : Nat; lastDirectoryPull : Int; adminCount : Nat; players : Nat; throws : Nat; published : Nat };
  public shared query func getSettings(tok : Text) : async ?Settings {
    switch (admin(tok)) {
      case null null;
      case (?_) ?{ hubId; appUrl; orgName; adminGroup; adminEmails; peopleCount = Map.size(people); lastDirectoryPull; adminCount = adminCount(); players = Map.size(bestAllTime); throws = throwsTotal; published = publishedTotal };
    };
  };
  public shared func setSettings(tok : Text, args : { adminGroup : Text; appUrl : Text; orgName : Text }) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (args.appUrl != "" and not Text.startsWith(args.appUrl, #text "https://")) return { ok = false; detail = "app url must start with https://" };
    adminGroup := norm(args.adminGroup); appUrl := norm(args.appUrl); orgName := norm(args.orgName);
    log(m.email, "settings updated");
    { ok = true; detail = "" };
  };
  public shared func setAdminEmails(tok : Text, emails : [Text]) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let clean = List.empty<Text>();
    for (x in emails.vals()) { let e = lower(norm(x)); if (e != "" and not has(List.toArray(clean), e)) List.add(clean, e) };
    adminEmails := List.toArray(clean);
    if (roleOf(m.email) != "admin") { adminEmails := Array.concat(adminEmails, [m.email]); return { ok = true; detail = "kept you on the list — you would have locked yourself out" } };
    log(m.email, "bootstrap admins set (" # Nat.toText(adminEmails.size()) # ")");
    { ok = true; detail = "" };
  };
  /// Admins: wipe every board (a new season). Players' name choices stay.
  public shared func resetBoards(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let n = Map.size(bestAllTime);
    bestAllTime.clear(); bestWeekly.clear(); bestDaily.clear(); dailyGhost.clear(); ghostOwner.clear();
    arcadeScores.clear(); arcadeRuns.clear();
    log(m.email, "all boards reset (" # Nat.toText(n) # " players had scores)");
    { ok = true; detail = "boards are empty — new season" };
  };
  public shared query func adminLogRows(tok : Text) : async [LogRow] {
    switch (admin(tok)) {
      case null [];
      case (?_) { let out = List.empty<LogRow>(); for ((_, r) in Map.reverseEntries(adminLog)) { if (List.size(out) < 200) List.add(out, r) }; List.toArray(out) };
    };
  };

  // =====================================================================
  // hub connector contract
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
  public shared query func hub_ping() : async Text { "bug" };
  public shared query func hub_manifest() : async Hub.Manifest {
    {
      name = "bug2d"; version = BUILD_VERSION; description = "Ship the Bug 2D — Zurich to cyberspace; public play, optional Hub sign-in, opt-in global scores";
      needs = ["identity"];
      wants = ["notify", "roles", "groups"]; // notify: the dethroned champion hears about it; roles/groups: who runs the settings
    };
  };
  public shared query func hub_usesGroup(name : Text) : async [Text] {
    let n = lower(norm(name));
    if (n != "" and lower(adminGroup) == n) ["members run the game's settings (admins group)"] else [];
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
  // sign-in
  // =====================================================================
  public shared func loginWithTicket(ticket : Text) : async ?{ token : Text; email : Text; displayName : Text; role : Text; suiteToken : Text } {
    if (hubId == "" or not Hub.ticketLooksValid(ticket)) return null;
    let expectedHub = hubId;
    let r = await Hub.hub(expectedHub).redeemTicket(ticket);
    if (not r.ok or hubId != expectedHub) return null;
    if (not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull)) { try { ignore await pullDirectory() } catch (_) {} };
    if (hubId != expectedHub or not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull)) return null;
    try { Map.add(groupsCache, Text.compare, lower(r.email), await Hub.hub(hubId).groupsOf(r.email)) } catch (_) {};
    let tok = hex(await ic00.raw_rand());
    if (hubId != expectedHub or not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull)) return null;
    ignore Hub.mintSession(sessions, tok, r.email, r.displayName, 10 * H);
    ?{ token = tok; email = lower(r.email); displayName = r.displayName; role = roleOf(r.email); suiteToken = (switch (r.suiteToken) { case (?t) t; case null "" }) };
  };
  /// player = the chosen board name ("" until chosen — the frontend asks on the first visit).
  public shared query func whoami(tok : Text) : async ?{ email : Text; displayName : Text; role : Text; roleSource : Text; orgName : Text; hubId : Text; needsClaim : Bool; player : Text } {
    switch (me(tok)) {
      case null null;
      case (?m) ?{ email = m.email; displayName = m.displayName; role = m.role; roleSource = roleSourceOf(m.email); orgName; hubId; needsClaim = needsClaim() and (hubRoleOf(m.email) == "owner" or hubRoleOf(m.email) == "admin"); player = (switch (Map.get(playerNames, Text.compare, m.id)) { case (?p) p; case null "" }) };
    };
  };
  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };
  public shared query func info() : async { orgName : Text; hubId : Text; hubSet : Bool; appUrl : Text; version : Text } {
    { orgName; hubId; hubSet = hubId != ""; appUrl; version = BUILD_VERSION };
  };
  public shared func syncNow(tok : Text) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    let n = try { await pullDirectory() } catch (e) { return { ok = false; detail = Error.message(e) } };
    { ok = true; detail = Nat.toText(n) # " people" };
  };

  // =====================================================================
  // player names: the hub name or a unique handle, changeable anytime
  // =====================================================================
  let playerNames : Map.Map<Text, Text> = Map.empty<Text, Text>(); // person id -> board name (0.2.0; addresses before)
  let aliasOwner : Map.Map<Text, Text> = Map.empty<Text, Text>(); // lowercase handle -> person id

  func validAlias(a : Text) : Bool {
    let n = a.size();
    if (n < 3 or n > 20) return false;
    for (c in a.chars()) {
      let ok = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == ' ' or c == '_' or c == '.' or c == '-';
      if (not ok) return false;
    };
    true;
  };
  func dropOwnAlias(email : Text) {
    let doomed = List.empty<Text>();
    for ((a, e) in Map.entries(aliasOwner)) if (e == email) List.add(doomed, a);
    for (a in List.values(doomed)) ignore Map.delete(aliasOwner, Text.compare, a);
  };
  func renameScores(email : Text, name : Text) {
    switch (Map.get(bestAllTime, Text.compare, email)) { case (?sc) Map.add(bestAllTime, Text.compare, email, { sc with name }); case null {} };
    for (m in [bestWeekly, bestDaily].vals()) {
      let mine = List.empty<Text>();
      for ((k, _) in Map.entries(m)) if (Text.endsWith(k, #text ("#" # email))) List.add(mine, k);
      for (k in List.values(mine)) { switch (Map.get(m, Text.compare, k)) { case (?sc) Map.add(m, Text.compare, k, { sc with name }); case null {} } };
    };
    for ((k, own) in Map.entries(ghostOwner)) {
      if (own == email) { switch (Map.get(dailyGhost, Text.compare, k)) { case (?g) Map.add(dailyGhost, Text.compare, k, { g with name }); case null {} } };
    };
  };
  public shared func setPlayerName(tok : Text, useReal : Bool, alias : Text) : async { ok : Bool; player : Text; detail : Text } {
    if (migrating()) return { ok = false; player = ""; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; player = ""; detail = "no session" } };
    if (useReal) {
      dropOwnAlias(m.id);
      Map.add(playerNames, Text.compare, m.id, m.displayName);
      renameScores(m.id, m.displayName);
      return { ok = true; player = m.displayName; detail = "" };
    };
    let a = norm(alias);
    if (not validAlias(a)) return { ok = false; player = ""; detail = "3–20 characters: letters, digits, space, . _ -" };
    switch (Map.get(aliasOwner, Text.compare, lower(a))) { case (?o) { if (o != m.id) return { ok = false; player = ""; detail = "that handle is taken — pick another" } }; case null {} };
    dropOwnAlias(m.id);
    Map.add(aliasOwner, Text.compare, lower(a), m.id);
    Map.add(playerNames, Text.compare, m.id, a);
    renameScores(m.id, a);
    { ok = true; player = a; detail = "" };
  };
  func boardNameOf(m : Me) : Text = switch (Map.get(playerNames, Text.compare, m.id)) { case (?p) p; case null m.displayName };

  // =====================================================================
  // scoreboards (opt-in per run)
  // =====================================================================
  // distance in decimetres — integers only, no float drift
  type Score = { email : Text; name : Text; dm : Nat; zone : Text; at : Int }; // email = the player's person id since 0.2.0 (field name kept: stable record)
  let bestAllTime : Map.Map<Text, Score> = Map.empty<Text, Score>(); // person id -> best ever
  let bestWeekly : Map.Map<Text, Score> = Map.empty<Text, Score>(); // "W<week>#personId"
  let bestDaily : Map.Map<Text, Score> = Map.empty<Text, Score>(); // "D<day>#personId" — the seeded daily world
  type TracePt = (Nat, Nat);
  type Ghost = { name : Text; dm : Nat; trace : [TracePt] };
  let dailyGhost : Map.Map<Text, Ghost> = Map.empty<Text, Ghost>(); // "D<day>" -> today's best published run
  let ghostOwner : Map.Map<Text, Text> = Map.empty<Text, Text>(); // "D<day>" -> person id
  var throwsTotal : Nat = 0; // every submitted run, published or not
  var publishedTotal : Nat = 0;
  transient let lastSubmitAt : Map.Map<Text, Int> = Map.empty<Text, Int>(); // person id -> last submit
  transient let MAX_DM : Nat = 30_000; // 3 km — the world ends long before (balanced for ≈ 2 km runs)
  transient let MAX_DUR_MS : Nat = 600_000; // 10 minutes
  /// The world's zones — the frontend's world pack must use these keys.
  transient let ZONES : [Text] = ["localhost", "dev", "staging", "production", "it-support", "app-store", "the-cloud", "open-source", "outage", "the-internet"];

  func dayNum(t : Int) : Int = t / DAY;
  func dayKey(t : Int) : Text = "D" # Int.toText(dayNum(t));
  func weekKey(t : Int) : Text = "W" # Int.toText(t / DAY / 7);
  func sortScores(arr : [Score]) : [Score] = Array.sort<Score>(arr, func(a, b) = Nat.compare(b.dm, a.dm));
  func top(prefix : Text, m : Map.Map<Text, Score>) : [Score] {
    let out = List.empty<Score>();
    for ((k, sc) in Map.entries(m)) if (prefix == "" or Text.startsWith(k, #text prefix)) List.add(out, sc);
    let sorted = sortScores(List.toArray(out));
    Array.tabulate<Score>(Nat.min(25, sorted.size()), func i = sorted[i]);
  };
  func topAllTime() : [Score] = top("", bestAllTime);
  func topWeekly() : [Score] = top(weekKey(now()) # "#", bestWeekly);
  func topDaily() : [Score] = top(dayKey(now()) # "#", bestDaily);
  func rankIn(arr : [Score], email : Text) : Nat { var i = 1; for (sc in arr.vals()) { if (sc.email == email) return i; i += 1 }; 0 };

  /// dm = distance in decimetres; durMs + trace: run duration for the plausibility check and the daily ghost.
  public shared func submitScore(tok : Text, args : { dm : Nat; zone : Text; publish : Bool; durMs : Nat; trace : [TracePt] }) : async { ok : Bool; publishedBest : Nat; rankAllTime : Nat; rankWeekly : Nat; detail : Text } {
    func fail(d : Text) : { ok : Bool; publishedBest : Nat; rankAllTime : Nat; rankWeekly : Nat; detail : Text } = { ok = false; publishedBest = 0; rankAllTime = 0; rankWeekly = 0; detail = d };
    if (migrating()) return fail(MIGRATING);
    let m = switch (me(tok)) { case (?m) m; case null return fail("no session") };
    if (args.dm == 0) return fail("empty run");
    if (not has(ZONES, args.zone)) return fail("unknown zone");
    // anti-cheat: hard caps first (the client reports the duration, so a ratio alone proves nothing — audit BG-01),
    // then the distance must be physically reachable in that time (client speed cap ≈ 2.6 dm per ms)
    if (args.dm > MAX_DM) return fail("that distance is beyond the world — nice try");
    if (args.durMs < 2_000 or args.durMs > MAX_DUR_MS) return fail("implausible run duration");
    if (args.dm > args.durMs * 26 / 10) return fail("that speed would break the physics — nice try");
    if (args.trace.size() > 700) return fail("trace too long");
    for ((x, y) in args.trace.vals()) { if (x > MAX_DM * 10 or y > 20_000) return fail("trace out of bounds") };
    let t = now();
    switch (Map.get(lastSubmitAt, Text.compare, m.id)) { case (?last) { if (t - last < 8_000_000_000) return fail("too fast — enjoy the flight first") }; case null {} };
    Map.add(lastSubmitAt, Text.compare, m.id, t); // per person, not per session — several sign-ins do not multiply the rate
    throwsTotal += 1;
    if (not args.publish) return { ok = true; publishedBest = 0; rankAllTime = 0; rankWeekly = 0; detail = "kept private" };
    publishedTotal += 1;
    let bname = boardNameOf(m);
    let prevTopArr = topAllTime();
    let prevTop = if (prevTopArr.size() > 0) ?prevTopArr[0] else null;
    let cur = switch (Map.get(bestAllTime, Text.compare, m.id)) { case (?c) c.dm; case null 0 };
    if (args.dm > cur) Map.add(bestAllTime, Text.compare, m.id, { email = m.id; name = bname; dm = args.dm; zone = args.zone; at = t });
    let wk = weekKey(t) # "#" # m.id;
    let curW = switch (Map.get(bestWeekly, Text.compare, wk)) { case (?c) c.dm; case null 0 };
    if (args.dm > curW) Map.add(bestWeekly, Text.compare, wk, { email = m.id; name = bname; dm = args.dm; zone = args.zone; at = t });
    let dk = dayKey(t) # "#" # m.id;
    let curD = switch (Map.get(bestDaily, Text.compare, dk)) { case (?c) c.dm; case null 0 };
    if (args.dm > curD) Map.add(bestDaily, Text.compare, dk, { email = m.id; name = bname; dm = args.dm; zone = args.zone; at = t });
    let ghostCur = switch (Map.get(dailyGhost, Text.compare, dayKey(t))) { case (?g) g.dm; case null 0 };
    if (args.dm > ghostCur and args.trace.size() >= 4) {
      Map.add(dailyGhost, Text.compare, dayKey(t), { name = bname; dm = args.dm; trace = args.trace });
      Map.add(ghostOwner, Text.compare, dayKey(t), m.id);
    };
    // a new all-time #1 tells the previous champion — through the hub, detached
    switch (prevTop) {
      case (?p) {
        if (args.dm > p.dm and p.email != m.id and hubId != "") {
          let prevMail = emailOfPid(p.email); let dmT = Nat.toText(args.dm / 10); let dedupe = "dethrone-" # Nat.toText(args.dm); // a former colleague whose address moved on hears nothing
          if (prevMail != "") ignore Timer.setTimer<system>(#seconds 0, func() : async () {
            try { ignore await (with timeout = 30) Hub.hub(hubId).hub_notify({ email = prevMail; title = "Dethroned on Ship the Bug — " # bname # " threw " # dmT # " m. One more throw?"; url = appUrl; kind = "bug.dethroned"; dedupeKey = dedupe }) } catch (_) {};
          });
        };
      };
      case null {};
    };
    { ok = true; publishedBest = Nat.max(args.dm, cur); rankAllTime = rankIn(topAllTime(), m.id); rankWeekly = rankIn(topWeekly(), m.id); detail = "" };
  };

  public type BoardEntry = { name : Text; dm : Nat; zone : Text; at : Int };
  func pub(sc : Score) : BoardEntry = { name = sc.name; dm = sc.dm; zone = sc.zone; at = sc.at };
  /// Signed-in only: the board shows names, so it stays inside the company.
  public shared query func leaderboard(tok : Text) : async ?{ allTime : [BoardEntry]; weekly : [BoardEntry]; daily : [BoardEntry]; day : Int; myBest : Nat; throws : Nat; ghost : ?Ghost } {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    ?{
      allTime = Array.map<Score, BoardEntry>(topAllTime(), pub); weekly = Array.map<Score, BoardEntry>(topWeekly(), pub); daily = Array.map<Score, BoardEntry>(topDaily(), pub);
      day = dayNum(now()); myBest = (switch (Map.get(bestAllTime, Text.compare, m.id)) { case (?c) c.dm; case null 0 }); throws = throwsTotal; ghost = Map.get(dailyGhost, Text.compare, dayKey(now()));
    };
  };
  /// Opt-in implies opt-out: a player removes their own published scores (and their ghost).
  public shared func removeMyScores(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    ignore Map.delete(bestAllTime, Text.compare, m.id);
    for (mp in [bestWeekly, bestDaily].vals()) {
      let doomed = List.empty<Text>();
      for ((k, _) in Map.entries(mp)) if (Text.endsWith(k, #text ("#" # m.id))) List.add(doomed, k);
      for (k in List.values(doomed)) ignore Map.delete(mp, Text.compare, k);
    };
    let doomedG = List.empty<Text>();
    for ((k, own) in Map.entries(ghostOwner)) if (own == m.id) List.add(doomedG, k);
    for (k in List.values(doomedG)) { ignore Map.delete(dailyGhost, Text.compare, k); ignore Map.delete(ghostOwner, Text.compare, k) };
    { ok = true; detail = "your scores are gone from every board" };
  };

  // ---------- housekeeping: old weekly/daily entries + ghosts ----------
  func retention() {
    let t = now();
    let weekCut = t / DAY / 7 - 8; // keep 8 weeks
    let dayCut = t / DAY - 14; // keep 14 days
    func num(k : Text, p : Text) : Int {
      let body = switch (Text.stripStart(k, #text p)) { case (?b) b; case null return 0 };
      let head = switch (Text.split(body, #char '#').next()) { case (?h) h; case null return 0 };
      switch (Nat.fromText(head)) { case (?n) n; case null 0 };
    };
    let dw = List.empty<Text>(); for ((k, _) in Map.entries(bestWeekly)) if (num(k, "W") < weekCut) List.add(dw, k);
    for (k in List.values(dw)) ignore Map.delete(bestWeekly, Text.compare, k);
    let dd = List.empty<Text>(); for ((k, _) in Map.entries(bestDaily)) if (num(k, "D") < dayCut) List.add(dd, k);
    for (k in List.values(dd)) ignore Map.delete(bestDaily, Text.compare, k);
    let dg = List.empty<Text>(); for ((k, _) in Map.entries(dailyGhost)) if (num(k, "D") < dayCut) List.add(dg, k);
    for (k in List.values(dg)) { ignore Map.delete(dailyGhost, Text.compare, k); ignore Map.delete(ghostOwner, Text.compare, k) };
  };

  // =====================================================================
  // person ids (0.2.0): players are the hub's stable person id. This release converts older address-keyed
  // names and scores once, right after the upgrade (docs/PERSON-IDS.md).
  // =====================================================================
  var idMigration : Text = "pending"; // pending | done
  transient let MIGRATING : Text = "people ids are being migrated — try again in a minute";
  func migrating() : Bool = idMigration != "done";
  func isAddress(t : Text) : Bool = Text.contains(t, #char '@') and not Text.startsWith(t, #text "legacy:");
  func migrateIds() : async () {
    if (idMigration == "done") return;
    if (Map.size(playerNames) == 0 and Map.size(bestAllTime) == 0) { idMigration := "done"; return }; // fresh install
    if (hubId == "") return;
    try { ignore await pullDirectory() } catch (_) {};
    let seen = Map.empty<Text, Bool>();
    func note(x : Text) { if (isAddress(x)) Map.add(seen, Text.compare, lower(x), true) };
    for ((e, _) in Map.entries(playerNames)) note(e);
    for ((_, e) in Map.entries(aliasOwner)) note(e);
    for ((e, _) in Map.entries(bestAllTime)) note(e);
    for ((_, e) in Map.entries(ghostOwner)) note(e);
    func tail(k : Text) : Text { var t = k; for (part in Text.split(k, #char '#')) t := part; t };
    for ((k, _) in Map.entries(bestWeekly)) note(tail(k));
    for ((k, _) in Map.entries(bestDaily)) note(tail(k));
    let emails = Iter.toArray(Map.keys(seen));
    let found = Map.empty<Text, Text>();
    if (emails.size() > 0) {
      let hits = try { await Hub.lookupIds(Hub.hub(hubId), emails) } catch (_) { return }; // hub unreachable: the 30-second timer retries
      for ((e, pid) in hits.vals()) Map.add(found, Text.compare, e, pid);
    };
    if (idMigration == "done") return;
    func mig(x : Text) : Text = if (isAddress(x)) Hub.migrateKey(found, x) else x;
    func rekey(m : Map.Map<Text, Score>) {
      for ((k, sc) in Iter.toArray(Map.entries(m)).vals()) {
        let parts = Text.split(k, #char '#').toArray();
        let k2 = if (parts.size() == 2) parts[0] # "#" # mig(parts[1]) else mig(k);
        if (k2 != k or isAddress(sc.email)) { ignore Map.delete(m, Text.compare, k); Map.add(m, Text.compare, k2, { sc with email = mig(sc.email) }) };
      };
    };
    for ((k, v) in Iter.toArray(Map.entries(playerNames)).vals()) if (isAddress(k)) { ignore Map.delete(playerNames, Text.compare, k); Map.add(playerNames, Text.compare, mig(k), v) };
    for ((k, v) in Iter.toArray(Map.entries(aliasOwner)).vals()) if (isAddress(v)) Map.add(aliasOwner, Text.compare, k, mig(v));
    for ((k, v) in Iter.toArray(Map.entries(ghostOwner)).vals()) if (isAddress(v)) Map.add(ghostOwner, Text.compare, k, mig(v));
    rekey(bestAllTime); rekey(bestWeekly); rekey(bestDaily);
    idMigration := "done";
    log("system", "player references migrated to person ids: " # Nat.toText(emails.size()) # " addresses, " # Nat.toText(Map.size(found)) # " known to the hub, the rest kept as legacy:<address>");
  };
  transient let _idMigrationTimer = Timer.setTimer<system>(#seconds 0, func() : async () { await migrateIds() });

  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { try { ignore await pullDirectory() } catch (_) {}; ignore Hub.pruneSessions(sessions); if (migrating()) { try { await migrateIds() } catch (_) {} } });
  ignore Timer.recurringTimer<system>(#seconds 86_400, func() : async () { retention() });
};
