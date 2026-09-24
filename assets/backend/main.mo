import Option "mo:core/Option";
import Operations "mo:kebab-hub/Operations";
/// kebab-stack assets — the devices of a company, on the skewer.
///
/// A register of devices (tag, serial, vendor, model, kind), who has each one,
/// and an append-only trail of what happened to it — with the photo that
/// proved it. Built around the moment that otherwise gets lost: a device
/// changes hands, someone takes a picture of its back, and the picture rots
/// on a phone. Here the picture IS the intake: the hub's AI reads sticker and
/// serial, the register finds the device (or you create it in two taps), you
/// say what happened, done.
///
/// Since 0.7.0 a device can be sold: an offer to a colleague or an outside buyer, their online
/// acceptance of the hand-over terms, a numbered invoice with a Swiss QR-bill, archived as issued.
///
/// Sign-in, people and the AI key come from the hub (mo:kebab-hub). Roles:
/// admins (hub owner/admin, the admins group, the bootstrap list) run the
/// register; everyone else in the directory sees the devices assigned to them.
///
/// Stable-state rules: every top-level let/var is stable and append-only —
/// never remove or rename one; new data goes into new side tables.

import Hub "mo:kebab-hub";
import Support "mo:kebab-hub/Support";
import Hardware "mo:kebab-hub/Hardware";
import InvoicePdf "lib/InvoicePdf";
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
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Timer "mo:core/Timer";
import Base64 "mo:core/Base64";
import Float "mo:core/Float";
import Error "mo:core/Error";
import VarArray "mo:core/VarArray";
import Json "mo:json";
import Sha256 "mo:sha2/Sha256";

persistent actor Assets {
  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = ""; // hub BACKEND canister id
  var owner : ?Principal = null; // controller who ran setHub (CLI bootstrap)
  var appUrl : Text = ""; // this app's frontend URL (deep links in notifications)
  var orgName : Text = "";
  var adminGroup : Text = "assets-admins"; // hub group → admins of the register
  var adminEmails : [Text] = []; // bootstrap admins (claimAdmin / addAdminEmail)
  var adminClaimed : Bool = false; // claimAdmin is one-shot
  var tagPrefix : Text = "INV-"; // suggested tag prefix for new devices
  var photoBytes : Nat = 0; // total photo bytes held
  var trustId : Text = ""; // the trust app's BACKEND canister id — the only caller allowed to read serial → person
  transient let BUILD_VERSION : Text = "0.16.0";
  transient let MAX_PHOTO : Nat = 900_000; // one photo (the frontend scales to ≤ 1280 px first)
  transient let MAX_PHOTO_TOTAL : Nat = 400_000_000;
  transient let MAX_PHOTOS_PER_ASSET : Nat = 12;
  transient let H : Int = 3_600_000_000_000;

  // =====================================================================
  // hub SDK state
  // =====================================================================
  let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
  let ids : Map.Map<Text, Text> = Map.empty<Text, Text>(); // address -> hub person id (0.6.0) — assignee/by/createdBy store the id
  let former : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // id -> last row of a person whose address moved on
  let groupsCache : Map.Map<Text, [Text]> = Map.empty<Text, [Text]>();
  var lastDirectoryPull : Int = 0;
  transient var directoryEpoch : Nat = 0;
  transient var directoryPullRunning : Bool = false;

  type IC = actor { raw_rand : () -> async Blob };
  transient let ic00 : IC = actor "aaaaa-aa";

  // =====================================================================
  // the register
  // =====================================================================
  /// status: in_stock | assigned | loaned | sold | scrapped | lost | unknown
  /// kind:   laptop | phone | tablet | monitor | accessory | other
  public type Asset = {
    id : Nat;
    tag : Text; // inventory tag as printed on the sticker ("" = none yet)
    serial : Text;
    vendor : Text;
    model : Text;
    kind : Text;
    status : Text;
    assignee : Text; // e-mail of the person who has it ("" = nobody)
    holder : Text; // external holder when sold/loaned outside ("" = none)
    note : Text;
    createdAt : Int;
    updatedAt : Int;
    createdBy : Text;
    archived : Bool;
  };
  /// kind: created | handed_out | returned | loaned | sold | scrapped | lost | note | photo | edited | imported | reassigned
  public type Event = { id : Nat; assetId : Nat; at : Int; by : Text; kind : Text; detail : Text; to : Text; photoId : Nat };
  type Photo = { id : Nat; assetId : Nat; eventId : Nat; at : Int; by : Text; mime : Text; bytes : Blob };
  public type PhotoMeta = { id : Nat; assetId : Nat; eventId : Nat; at : Int; by : Text; mime : Text; size : Nat };

  let assets : Map.Map<Nat, Asset> = Map.empty<Nat, Asset>();
  let events : Map.Map<Nat, Event> = Map.empty<Nat, Event>();
  let photos : Map.Map<Nat, Photo> = Map.empty<Nat, Photo>();
  var nextAssetId : Nat = 1;
  var nextEventId : Nat = 1;
  var nextPhotoId : Nat = 1;

  type LogRow = { at : Int; who : Text; what : Text };
  let adminLog : Map.Map<Nat, LogRow> = Map.empty<Nat, LogRow>();
  var nextLogId : Nat = 1;

  transient let STATUSES : [Text] = ["in_stock", "preparing", "assigned", "loaned", "sold", "scrapped", "lost", "unknown"];
  transient let KINDS : [Text] = ["laptop", "phone", "tablet", "monitor", "accessory", "other"];
  transient let ACTIONS : [Text] = ["handed_out", "returned", "loaned", "sold", "scrapped", "lost", "note", "photo"];

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
    for (c in t.chars()) { if (i >= n) return out; out #= Char.toText(c); i += 1 };
    out;
  };
  func jsonEsc(t : Text) : Text {
    var out = "";
    for (ch in t.chars()) {
      switch (ch) {
        case ('\"') out #= "\\\"";
        case ('\\') out #= "\\\\";
        case ('\n') out #= "\\n";
        case ('\r') out #= "";
        case ('\t') out #= "\\t";
        case (c) { if (Char.toNat32(c) < 32) out #= " " else out #= Char.toText(c) };
      };
    };
    out;
  };
  func jStr(j : Json.Json, path : Text) : Text { switch (Json.getAsText(j, path)) { case (#ok(t)) t; case (_) "" } };
  func jNum(j : Json.Json, path : Text) : Float { switch (Json.getAsFloat(j, path)) { case (#ok(f)) f; case (_) { switch (Json.getAsNat(j, path)) { case (#ok(n)) Int.toFloat(n); case (_) 0.0 } } } };
  func jArr(j : Json.Json, path : Text) : [Json.Json] { switch (Json.get(j, path)) { case (?#array(a)) a; case (_) [] } };
  func stripFences(t : Text) : Text {
    var s = Text.trim(t, #char ' ');
    s := Text.trim(s, #char '\n');
    s := Text.replace(s, #text "```json", "");
    s := Text.replace(s, #text "```", "");
    Text.trim(s, #char '\n');
  };
  /// Spreadsheet-safe CSV cell.
  func csv(t : Text) : Text {
    let s = Text.replace(t, #text "\"", "\"\"");
    let guarded = if (Text.startsWith(s, #char '=') or Text.startsWith(s, #char '+') or Text.startsWith(s, #char '-') or Text.startsWith(s, #char '@')) "'" # s else s;
    "\"" # guarded # "\"";
  };
  /// Identifier normal form for matching: upper-case, alphanumerics only.
  func normId(t : Text) : Text {
    var out = "";
    for (c in Text.toUpper(t).chars()) if (Char.isAlphabetic(c) or Char.isDigit(c)) out #= Char.toText(c);
    out;
  };
  /// Confusable characters folded (a camera's reading of 0/O, 1/I/L, 5/S, 8/B, 2/Z).
  func foldId(t : Text) : Text {
    var out = "";
    for (c in normId(t).chars()) {
      out #= switch (c) { case ('O') "0"; case ('I') "1"; case ('L') "1"; case ('S') "5"; case ('B') "8"; case ('Z') "2"; case ('Q') "0"; case ('D') "0"; case (x) Char.toText(x) };
    };
    out;
  };
  func editDistance(a : Text, b : Text) : Nat {
    let xa = Text.toArray(a); let xb = Text.toArray(b);
    let n = xa.size(); let m = xb.size();
    if (n == 0) return m; if (m == 0) return n;
    var prev = Array.tabulate<Nat>(m + 1, func j = j);
    var i = 1;
    while (i <= n) {
      let curV = VarArray.repeat<Nat>(0, m + 1);
      curV[0] := i;
      var j = 1;
      while (j <= m) {
        let cost : Nat = if (xa[i - 1] == xb[j - 1]) 0 else 1;
        curV[j] := Nat.min(Nat.min(prev[j] + 1, curV[j - 1] + 1), prev[j - 1] + cost);
        j += 1;
      };
      prev := VarArray.toArray<Nat>(curV);
      i += 1;
    };
    prev[m];
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
  /// admin: bootstrap list · admins group · hub owner/admin · hub helpdesk (day-2 support hands devices out). Everyone else: member.
  // Historical migration evidence only. Never use this to authorize a request.
  func legacyRoleOf(email : Text) : Text {
    let e = lower(email);
    let hr = hubRoleOf(e);
    if (has(adminEmails, e) or inGroup(e, adminGroup) or hr == "owner" or hr == "admin" or hr == "helpdesk") return "admin";
    "member";
  };
  func roleOf(email : Text) : Text {
    let role = Hub.appRole(people, lower(email), "assets");
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
  /// Display name for a stored person id (tolerates a bare address from records older than 0.6.0).
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
  /// an event copy fit for display: `by` and a person `to` as names, not ids
  func showEvent(e : Event) : Event = { e with by = (if (e.by == "hub" or e.by == "") e.by else nameOf(e.by)); to = (if ((e.kind == "handed_out" or e.kind == "loaned" or e.kind == "reassigned") and e.to != "" and not Text.contains(e.to, #char ' ')) nameOf(e.to) else e.to) };

  /// id = the hub's stable person id — what every device and event stores. email = the current address (roles, display).
  type Me = { id : Text; email : Text; displayName : Text; role : Text };
  func me(tok : Text) : ?Me {
    if (not Hub.directoryFresh(lastDirectoryPull)) return null;
    switch (Hub.session(sessions, tok)) {
      case (?s) { if (not Hub.isActive(people, s.email) or roleOf(s.email) == "none") return null; ?{ id = pidOf(s.email); email = s.email; displayName = s.displayName; role = roleOf(s.email) } };
      case null null;
    };
  };
  func admin(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (m.role == "admin") ?m else null }; case null null };

  func finance(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (m.role == "admin" or m.role == "finance") ?m else null }; case null null };

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
  /// First-run claim: while nobody is admin yet, the signed-in person becomes one.
  public shared func claimAdmin(tok : Text) : async { ok : Bool; detail : Text } {
    { ok = false; detail = "App permissions are managed only in the Hub" };
  };
  func adminCount() : Nat { var n = 0; for ((e, u) in Map.entries(people)) if (u.active and roleOf(e) == "admin") n += 1; n };
  func needsClaim() : Bool = false;

  public type Settings = { hubId : Text; appUrl : Text; orgName : Text; adminGroup : Text; adminEmails : [Text]; tagPrefix : Text; peopleCount : Nat; lastDirectoryPull : Int; adminCount : Nat; photoBytes : Nat; aiSource : Text; aiModel : Text; ai : AiState; trustId : Text; trustLastPull : Int };
  public shared query func getSettings(tok : Text) : async ?Settings {
    switch (admin(tok)) {
      case null null;
      case (?_) ?{ hubId; appUrl; orgName; adminGroup = ""; adminEmails = []; tagPrefix; peopleCount = Map.size(people); lastDirectoryPull; adminCount = adminCount(); photoBytes; aiSource = aiSource(); aiModel = (switch (hubAi) { case (?c) c.provider # " · " # c.visionModel; case null "" }); ai = aiState(); trustId; trustLastPull };
    };
  };
  /// Which trust app may ask "who has which serial?" — its backend canister id (Trust → Settings shows it). "" switches the export off.
  public shared func setTrustCanister(tok : Text, id : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let t = lower(norm(id));
    if (t != "") {
      if (t.size() < 5 or t.size() > 63) return { ok = false; detail = "that does not look like a canister id" };
      for (c in t.chars()) { let ok = (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-'; if (not ok) return { ok = false; detail = "that does not look like a canister id" } };
    };
    trustId := t; trustLastPull := 0;
    log(m.email, if (t == "") "trust export switched off" else "trust app allowed: " # t);
    { ok = true; detail = "" };
  };
  var trustLastPull : Int = 0;
  /// For the trust app only: every device with a serial and a person (serial, person id — hub ≥ 0.17; trust ≥ 0.2.0 resolves it) — so it can show people their own devices.
  /// An update call on purpose: the last read is recorded, so Settings can show that the wiring works.
  public shared ({ caller }) func trust_serialOwners() : async [(Text, Text)] {
    assert trustId != "" and Principal.toText(caller) == trustId;
    trustLastPull := now();
    let out = List.empty<(Text, Text)>();
    for ((_, a) in Map.entries(assets)) if (not a.archived and a.serial != "" and a.assignee != "") List.add(out, (a.serial, a.assignee));
    List.toArray(out);
  };
  public shared func setSettings(tok : Text, args : { adminGroup : Text; appUrl : Text; tagPrefix : Text; orgName : Text }) : async { ok : Bool; detail : Text } {
    if (norm(args.adminGroup) != "") return { ok = false; detail = "Role settings have moved to Hub Permissions" };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (args.appUrl != "" and not Text.startsWith(args.appUrl, #text "https://")) return { ok = false; detail = "app url must start with https://" };
    appUrl := norm(args.appUrl); tagPrefix := norm(args.tagPrefix); orgName := norm(args.orgName);
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
    if (not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or roleOf(email) == "none" or Hub.appRole(people, email, "assets") != viewerRole) return Support.denied();
    if (roleOf(email) != "admin" and viewer != subject) return Support.denied();
    let out = List.empty<Support.Item>();
    let priorAssets = Map.empty<Nat, Bool>();
    if (roleOf(email) == "admin") for (e in events.values()) if (e.to == subject) priorAssets.add(e.assetId, true);
    for ((_, a) in assets.entries()) {
      let followup = switch (handovers.get(a.id)) { case (?p) p.person == subject and hardwarePending(a.id); case null false };
      let current = a.assignee == subject or followup;
      let previous = not current and priorAssets.containsKey(a.id);
      if (current or (previous and roleOf(email) == "admin")) out.add({ id = "asset:" # a.id.toText(); kind = a.kind; title = deviceName(a); detail = a.tag # (if (a.serial != "") " · " # a.serial else "") # (if (previous) " · Previously assigned" else ""); status = switch (handovers.get(a.id)) { case (?p) if (p.person == subject) handoverProgress(p) else a.status; case null a.status }; path = "#/d/" # a.id.toText(); historical = not followup and (previous or a.archived or a.status == "sold" or a.status == "scrapped") });
    };
    for ((_, s) in sales.entries()) if (s.buyer.pid == subject or (roleOf(email) == "admin" and formerBuyer.get(s.id) == ?subject)) {
      let phase = salePhase(s);
      out.add({ id = "sale:" # s.id.toText(); kind = "sale"; title = switch (assets.get(s.assetId)) { case (?a) deviceName(a); case null "Device sale" }; detail = (if (s.buyer.pid == "") "Sale of assigned hardware" else "Employee sale") # (if (s.invoiceNo != "") " · " # s.invoiceNo else ""); status = phase; path = "#/sale/" # s.id.toText(); historical = phase == "complete" or phase == "cancelled" });
    };
    Support.ready(out.toArray());
  };

  // Hardware custody survives account deactivation. Cases and plans are side
  // tables so existing asset, sale and invoice records keep their state contract.
  public type Handover = {
    assetId : Nat; caseKey : Text; person : Text; choice : Text; stage : Text;
    owner : Text; dueOn : Text; recipient : Text; note : Text; revision : Nat;
    saleId : Nat; updatedAt : Int;
  };
  public type HandoverView = { plan : Handover; context : Hardware.Case; personName : Text; ownerName : Text; recipientEmail : Text; progress : Text; done : Bool; device : Text; identifier : Text };
  public type HandoverInput = { choice : Text; owner : Text; dueOn : Text; recipient : Text; note : Text };
  let hardwareCases = Map.empty<Text, Hardware.Case>();
  let handovers = Map.empty<Nat, Handover>();
  let handoverHistory = Map.empty<Text, Handover>();
  let formerBuyer = Map.empty<Nat, Text>();
  // Explicit private contact for a former colleague; issued invoices stay intact.
  let formerDealContacts = Map.empty<Nat, Text>();
  let formerContactExpires = Map.empty<Nat, Int>();
  func pruneFormerContacts() {
    for ((id, expires) in formerContactExpires.entries().toArray().vals()) if (expires <= now()) {
      formerDealContacts.remove(id); formerContactExpires.remove(id);
    };
  };
  func hardwareKey(c : Hardware.Case) : Text = c.desk # ":" # c.ticket.toText();
  func handoverDone(p : Handover) : Bool {
    if (p.stage == "ready" or p.stage == "transferred" or p.stage == "exception") return true;
    if (p.choice == "sale" and p.saleId != 0) switch (sales.get(p.saleId)) { case (?s) return handedOverAt(s.id) != 0; case null {} };
    false;
  };
  func handoverProgress(p : Handover) : Text {
    if (p.choice == "sale") {
      let s = sales.get(p.saleId) ?? (return "Start the sale");
      if (handoverDone(p)) return "Sale handed over";
      if (s.status == "cancelled") return "Sale cancelled · choose the next step";
      return "Sale · " # salePhase(s);
    };
    switch (p.stage) { case ("received") "Received by IT · prepare for reuse"; case ("ready") "Ready for reuse"; case ("transferred") "Handed over"; case ("exception") "Exception recorded"; case (_) if (p.choice == "transfer") "Awaiting handover" else "Awaiting return" };
  };
  func handoverView(p : Handover) : ?HandoverView {
    let c = hardwareCases.get(p.caseKey) ?? (return null);
    let a = assets.get(p.assetId) ?? (return null);
    ?{ plan = p; context = c; personName = nameOf(p.person); ownerName = nameOf(p.owner); recipientEmail = emailOfPid(p.recipient); progress = handoverProgress(p); done = handoverDone(p); device = deviceName(a); identifier = if (a.serial != "") a.serial else if (a.tag != "") a.tag else a.id.toText() };
  };
  func syncHardwareCase(c : Hardware.Case) : Hardware.Progress {
    let key = hardwareKey(c);
    switch (hardwareCases.get(key)) { case (?old) { if (old.person != c.person or old.revision > c.revision or (old.revision == c.revision and (old.state != c.state or old.dueAt != c.dueAt))) return Hardware.unavailable() }; case null {} };
    hardwareCases.add(key, c);
    if (c.state == "active") {
      for ((id, a) in assets.entries()) if (a.assignee == c.person and a.status != "sold" and a.status != "scrapped") {
        let prior = handovers.get(id);
        let enroll = switch (prior) {
          case null true;
          case (?p) {
            if (p.caseKey == key) false
            else if (handoverDone(p) or (switch (hardwareCases.get(p.caseKey)) { case (?old) old.state == "cancelled" or old.state == "closed"; case null false })) {
              handoverHistory.add(p.caseKey # ":" # id.toText(), p); true;
            } else false;
          };
        };
        if (enroll) {
          let sale = openSaleFor(id);
          let p : Handover = { assetId = id; caseKey = key; person = c.person; choice = if (sale == null) "return" else "sale"; stage = "pending"; owner = ""; dueOn = switch (c.dueAt) { case (?at) isoFromDays(at / 86_400_000_000_000); case null "" }; recipient = ""; note = ""; revision = switch (prior) { case (?old) old.revision + 1; case null 1 }; saleId = switch (sale) { case (?s) s.id; case null 0 }; updatedAt = now() };
          handovers.add(id, p);
          ignore addEvent(id, "hub", "offboarding", "Hardware follow-up linked to " # c.key # "; custody unchanged", "", 0);
        };
      };
    };
    var total = 0; var open = 0;
    for (p in handovers.values()) if (p.caseKey == key) { total += 1; if (not handoverDone(p)) open += 1 };
    for (p in handoverHistory.values()) if (p.caseKey == key) { total += 1; if (not handoverDone(p)) open += 1 };
    // A concurrent case cannot silently hide assets already tracked elsewhere.
    if (c.state == "active") for (a in assets.values()) if (a.assignee == c.person and a.status != "sold" and a.status != "scrapped") switch (handovers.get(a.id)) { case (?p) { if (p.caseKey != key) { total += 1; open += 1 } }; case null { total += 1; open += 1 } };
    { state = "ready"; sources = 1; bindings = []; total; open; checkedAt = now() };
  };
  public shared ({ caller }) func hub_syncHardware(c : Hardware.Case) : async Hardware.Progress {
    assert Hub.isHub(caller, hubId);
    if (migrating() or c.person == "" or c.desk == "" or not has(["active", "paused", "review", "cancelled", "closed"], c.state)) return Hardware.unavailable();
    syncHardwareCase(c);
  };
  public shared query func handoverOf(tok : Text, assetId : Nat) : async ?HandoverView {
    if (admin(tok) == null) return null;
    let p = handovers.get(assetId) ?? (return null); handoverView(p);
  };
  public shared query func pendingHandoverCount(tok : Text) : async Nat {
    if (admin(tok) == null) return 0;
    var total = 0; for (p in handovers.values()) if (hardwarePending(p.assetId)) total += 1; total;
  };
  public shared query func pendingHandovers(tok : Text) : async [HandoverView] {
    if (admin(tok) == null) return [];
    let out = List.empty<HandoverView>();
    for (p in handovers.values()) if (not handoverDone(p)) switch (handoverView(p)) { case (?v) { if (out.size() < 500 and v.context.state != "cancelled" and v.context.state != "closed") out.add(v) }; case null {} };
    out.toArray();
  };
  type HardwareHub = actor { hub_hardwareCheck : shared (Text, Nat, Text) -> async ?Hardware.Case };
  func currentHardwareCase(tok : Text, p : Handover) : async Bool {
    let m = admin(tok) ?? (return false);
    let c = hardwareCases.get(p.caseKey) ?? (return false);
    let expectedHub = hubId;
    if (expectedHub == "") return false;
    let h : HardwareHub = actor (expectedHub);
    let fresh = try { await (with timeout = 20) h.hub_hardwareCheck(c.desk, c.ticket, m.id) } catch (_) { return false };
    if (hubId != expectedHub or admin(tok) != ?m or handovers.get(p.assetId) != ?p) return false;
    let next = fresh ?? (return false);
    if (next.person != p.person or hardwareKey(next) != p.caseKey) return false;
    if (syncHardwareCase(next).state != "ready") return false;
    next.state == "active";
  };
  public shared func updateHandover(tok : Text, assetId : Nat, revision : Nat, action : Text, input : HandoverInput, confirmation : Text) : async { ok : Bool; detail : Text } {
    func fail(t : Text) : { ok : Bool; detail : Text } = { ok = false; detail = t };
    if (migrating()) return fail(MIGRATING);
    if (admin(tok) == null) return fail("Admins only");
    let p = handovers.get(assetId) ?? (return fail("No hardware follow-up on this device"));
    if (p.revision != revision or handoverDone(p)) return fail("This handover changed or is already complete. Refresh the device.");
    let before = assets.get(assetId) ?? (return fail("Device unavailable"));
    if (not (await currentHardwareCase(tok, p))) return fail("The Desk case is paused, changed or unavailable. Refresh the offboarding first.");
    let m = admin(tok) ?? (return fail("Your admin session expired"));
    let a = assets.get(assetId) ?? (return fail("Device unavailable"));
    if (a != before or handovers.get(assetId) != ?p) return fail("The device changed. Refresh before continuing.");
    if (input.note.size() > 1000 or input.dueOn.size() > 10) return fail("Keep the note under 1,000 characters and use YYYY-MM-DD for the due date");
    if (input.dueOn != "" and (switch (parseIso(input.dueOn)) { case (?day) isoFromDays(day) != input.dueOn; case null true })) return fail("Use a valid YYYY-MM-DD due date");
    if (input.owner != "" and (not Hub.isActiveId(people, ids, input.owner) or roleOf(emailOfPid(input.owner)) != "admin")) return fail("Choose an active Assets admin as the responsible person");
    let recipient = if (Text.contains(input.recipient, #char '@')) pidOf(lower(norm(input.recipient))) else input.recipient;
    var next = p;
    if (action == "plan") {
      if (not has(["return", "transfer", "sale"], input.choice)) return fail("Choose return, handover or sale");
      if (p.stage == "received" and input.choice != "return") return fail("Finish preparing the received device before arranging another handover");
      if (input.choice != "sale" and openSaleFor(assetId) != null) return fail("Cancel the open sale first; its invoice and payment history must be preserved");
      if (input.choice == "transfer" and (recipient == p.person or not Hub.isActiveId(people, ids, recipient))) return fail("Choose a different, active recipient");
      next := { p with choice = input.choice; owner = input.owner; dueOn = input.dueOn; recipient = if (input.choice == "transfer") recipient else ""; note = norm(input.note); saleId = if (input.choice == "sale") switch (openSaleFor(assetId)) { case (?s) s.id; case null 0 } else 0 };
    } else {
      let identifier = if (a.serial != "") a.serial else if (a.tag != "") a.tag else a.id.toText();
      if (norm(confirmation) != identifier) return fail("Confirm the serial or asset tag shown on this device");
      if (action != "exception" and a.archived) return fail("Restore this device before recording its handover");
      if (openSaleFor(assetId) != null) return fail("Complete or cancel the open sale first");
      if (action == "receive" and p.choice == "return" and p.stage == "pending") {
        if (a.assignee != p.person) return fail("Custody changed. Review the device history before recording an exception.");
        assets.add(assetId, { a with status = "preparing"; assignee = ""; holder = ""; updatedAt = now() });
        next := { p with stage = "received"; note = if (norm(input.note) == "") p.note else norm(input.note) };
      } else if (action == "ready" and p.stage == "received" and a.status == "preparing" and a.assignee == "") {
        if (norm(input.note) == "") return fail("Record what was checked: data removal, device management and condition as applicable");
        assets.add(assetId, { a with status = "in_stock"; updatedAt = now() }); next := { p with stage = "ready"; note = norm(input.note) };
      } else if (action == "transfer" and p.choice == "transfer" and p.stage == "pending") {
        if (a.assignee != p.person or p.recipient == p.person or not Hub.isActiveId(people, ids, p.recipient)) return fail("The current holder or recipient changed. Review the plan.");
        assets.add(assetId, { a with status = "assigned"; assignee = p.recipient; holder = ""; updatedAt = now() }); next := { p with stage = "transferred"; note = if (norm(input.note) == "") p.note else norm(input.note) };
      } else if (action == "exception") {
        if (norm(input.note).size() < 10) return fail("Document the reason and follow-up responsibility (at least 10 characters)");
        // An exception is not a return. Keep the holder and mark missing hardware honestly.
        if (a.assignee == p.person and a.status != "scrapped") assets.add(assetId, { a with status = "lost"; updatedAt = now() });
        next := { p with stage = "exception"; note = norm(input.note) };
      } else return fail("This action does not match the current handover stage");
    };
    next := { next with owner = if (next.owner == "") m.id else next.owner; revision = p.revision + 1; updatedAt = now() };
    handovers.add(assetId, next);
    ignore addEvent(assetId, m.id, "offboarding", action # " · " # handoverProgress(next) # (if (next.note == "") "" else " · " # next.note), if (action == "transfer") next.recipient else "", 0);
    log(m.email, "Hardware follow-up #" # assetId.toText() # ": " # action);
    { ok = true; detail = handoverProgress(next) };
  };

  public shared query func hub_ping() : async Text { "assets" };

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

    { app = "assets"; model = 1; revision = Hub.permissionRevision(people, "assets"); directoryAt = lastDirectoryPull; legacy = legacy.toArray(); legacyGroups = [{ name = adminGroup; role = "admin" }] };
  };
  public shared query func hub_manifest() : async Hub.Manifest {
    {
      name = "assets"; version = BUILD_VERSION; description = "Devices: who has what, what happened to it, with the photo that proved it";
      needs = ["identity", "profile", "roles", "notify"]; // profile: department on the person card; roles: hub staff run the register; notify: hand-overs, offers and invoices reach people through the hub's bell
      wants = ["ai", "groups"]; // ai: read photos with the company key; groups: the admins group
    };
  };
  public shared query func hub_usesGroup(_name : Text) : async [Text] { [] };
  /// Offboarding: the devices a person holds. The hub shows them and lets an admin reassign.
  type OwnedObject = { id : Text; kind : Text; title : Text; meta : Text; updatedAt : Int };
  public shared query ({ caller }) func hub_ownedObjects(email : Text) : async [OwnedObject] {
    assert Hub.isHub(caller, hubId); directoryEpoch += 1;
    let e = pidOf(lower(norm(email))); // the hub speaks addresses; the register stores ids
    let out = List.empty<OwnedObject>();
    for ((_, a) in Map.entries(assets)) if (not a.archived and a.assignee == e) List.add(out, { id = Nat.toText(a.id); kind = "device"; title = deviceName(a); meta = a.status # (if (a.tag != "") " · " # a.tag else "") # (if (a.serial != "") " · " # a.serial else ""); updatedAt = a.updatedAt });
    List.toArray(out);
  };
  public shared ({ caller }) func hub_reassign(_ids : [Text], _from : Text, _to : Text) : async Nat {
    assert Hub.isHub(caller, hubId);
    // Directory ownership is not evidence of a physical handover.
    0;
  };

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
  public shared query func whoami(tok : Text) : async ?{ id : Text; email : Text; displayName : Text; role : Text; roleSource : Text; orgName : Text; hubId : Text; needsClaim : Bool; aiOn : Bool; aiSource : Text; ai : AiState } {
    switch (me(tok)) {
      case null null;
      case (?m) ?{ id = m.id; email = m.email; displayName = m.displayName; role = m.role; roleSource = roleSourceOf(m.email); orgName; hubId; needsClaim = false; aiOn = aiSource() != ""; aiSource = aiSource(); ai = aiState() };
    };
  };
  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };
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
  // precise reason when there is no key: the hub says whether a key exists and whether THIS app has the lane
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
  func aiState() : AiState = { source = aiSource(); keySet = aiKeySet; laneGranted = aiLane; connectorId = aiConnId; model = (switch (hubAi) { case (?c) c.provider # " · " # c.visionModel; case null "" }) };
  public shared func refreshAi(tok : Text) : async { ok : Bool; detail : Text; state : AiState } {
    switch (me(tok)) { case null return { ok = false; detail = "no session"; state = aiState() }; case (?_) {} };
    hubAiTried := false;
    await refreshHubAi();
    await refreshAiStatus();
    let st = aiState();
    switch (hubAi) {
      case (?c) ({ ok = true; detail = "AI from the hub: " # c.provider # " · " # c.visionModel; state = st });
      case null ({ ok = false; detail = (if (not aiKeySet) "no AI key in the hub yet — an owner sets one under Settings → AI" else if (not aiLane) "the hub has a key, but this app was not granted the AI lane — Apps → Assets → Edit → What it may know" else "the hub did not hand out the key — try again in a minute"); state = st });
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

  transient let VISION_PROMPT : Text = "You read photos of IT devices — usually the back of a laptop, phone or tablet, or an inventory sticker. Return ONLY a JSON object, no prose: {\"reads\":[{\"kind\":\"serial|asset_tag|imei|model|other\",\"value\":\"exact printed text\",\"confidence\":0.0-1.0}],\"vendor\":\"Apple|Dell|Lenovo|...|\",\"model\":\"as printed or recognisable, else empty\",\"kind\":\"laptop|phone|tablet|monitor|accessory|other\",\"sticker\":\"current|old|none|unsure\",\"notes\":\"one short sentence\"}. Transcribe characters exactly as printed — never guess a missing character; when 0/O, 1/I/L, 5/S or 8/B are ambiguous, keep the printed shape and lower the confidence below 0.6. An inventory sticker usually shows a short code like INV-0042 or a barcode with digits; serial numbers are longer (Apple 10-12 characters, Dell 7, Lenovo 8). Include every distinct code you can read.";

  public type Read = { kind : Text; value : Text; confidence : Float };
  public type ReadResult = { ok : Bool; detail : Text; reads : [Read]; vendor : Text; model : Text; kind : Text; sticker : Text; notes : Text };
  func noRead(d : Text) : ReadResult = { ok = false; detail = d; reads = []; vendor = ""; model = ""; kind = ""; sticker = ""; notes = "" };

  /// One vision call. Returns a parsed result or ok=false with a plain reason.
  func aiRead(img : Blob, mime : Text) : async ReadResult {
    await refreshHubAi();
    let cr = switch (hubAi) { case (?c) c; case null return noRead("no AI key — an owner sets one under the hub's Settings → AI and grants this app the AI lane") };
    let b64 = Base64.encode(img);
    let anthropic = cr.provider == "anthropic";
    let ask = "Read this photo.";
    let body = if (anthropic)
      "{\"model\":\"" # jsonEsc(cr.visionModel) # "\",\"max_tokens\":500,\"system\":\"" # jsonEsc(VISION_PROMPT) # "\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"image\",\"source\":{\"type\":\"base64\",\"media_type\":\"" # jsonEsc(mime) # "\",\"data\":\"" # b64 # "\"}},{\"type\":\"text\",\"text\":\"" # ask # "\"}]}]}"
    else
      "{\"model\":\"" # jsonEsc(cr.visionModel) # "\",\"temperature\":0,\"max_tokens\":500,\"messages\":[{\"role\":\"system\",\"content\":\"" # jsonEsc(VISION_PROMPT) # "\"},{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"" # ask # "\"},{\"type\":\"image_url\",\"image_url\":{\"url\":\"data:" # jsonEsc(mime) # ";base64," # b64 # "\",\"detail\":\"high\"}}]}]}";
    let headers = if (anthropic) [
      { name = "x-api-key"; value = cr.key }, { name = "anthropic-version"; value = "2023-06-01" }, { name = "Content-Type"; value = "application/json" },
    ] else [
      { name = "Authorization"; value = "Bearer " # cr.key }, { name = "Content-Type"; value = "application/json" },
    ];
    let req : HttpRequestArgs = { url = cr.url; max_response_bytes = ?200_000; headers; body = ?Text.encodeUtf8(body); method = #post; transform = null; is_replicated = ?false };
    let res = try { await (with timeout = 90) icHttp.http_request(req) } catch (e) { return noRead("the AI vendor did not answer: " # Error.message(e)) };
    try { await Hub.hub(hubId).hub_aiUsed(1) } catch (_) {};
    let txt = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null return noRead("unreadable answer from the AI vendor") };
    if (res.status != 200) return noRead("the AI vendor answered " # Nat.toText(res.status) # ": " # capText(txt, 200));
    let outer = switch (Json.parse(txt)) { case (#ok(j)) j; case (#err(_)) return noRead("the AI vendor sent no JSON") };
    let content = if (anthropic) {
      switch (Json.get(outer, "content")) { case (?#array(items)) { var t = ""; for (it in items.vals()) if (jStr(it, "type") == "text") t := jStr(it, "text"); t }; case (_) "" };
    } else jStr(outer, "choices[0].message.content");
    if (content == "") return noRead("the model returned nothing");
    let j = switch (Json.parse(stripFences(content))) { case (#ok(j)) j; case (#err(_)) return noRead("the model did not answer in the agreed format: " # capText(content, 160)) };
    let reads = List.empty<Read>();
    for (r in jArr(j, "reads").vals()) {
      let v = norm(jStr(r, "value"));
      if (v != "" and v.size() <= 64 and List.size(reads) < 8) List.add(reads, { kind = lower(jStr(r, "kind")); value = v; confidence = jNum(r, "confidence") });
    };
    { ok = true; detail = ""; reads = List.toArray(reads); vendor = capText(norm(jStr(j, "vendor")), 40); model = capText(norm(jStr(j, "model")), 80); kind = lower(norm(jStr(j, "kind"))); sticker = lower(norm(jStr(j, "sticker"))); notes = capText(norm(jStr(j, "notes")), 200) };
  };

  // =====================================================================
  // the register: read, list, edit
  // =====================================================================
  func deviceName(a : Asset) : Text {
    let name = norm(a.vendor # " " # a.model);
    if (name != "") name else if (a.tag != "") a.tag else if (a.serial != "") a.serial else "device #" # Nat.toText(a.id);
  };
  func addEvent(assetId : Nat, by : Text, kind : Text, detail : Text, to : Text, photoId : Nat) : Nat {
    let id = nextEventId; nextEventId += 1;
    Map.add(events, Nat.compare, id, { id; assetId; at = now(); by; kind; detail; to; photoId });
    id;
  };
  func eventsOf(assetId : Nat) : [Event] {
    let out = List.empty<Event>();
    for ((_, e) in Map.entries(events)) if (e.assetId == assetId) List.add(out, e);
    Array.sort<Event>(List.toArray(out), func(a, b) = Int.compare(b.at, a.at));
  };
  func photosOf(assetId : Nat) : [PhotoMeta] {
    let out = List.empty<PhotoMeta>();
    for ((_, p) in Map.entries(photos)) if (p.assetId == assetId) List.add(out, { id = p.id; assetId = p.assetId; eventId = p.eventId; at = p.at; by = p.by; mime = p.mime; size = p.bytes.size() });
    Array.sort<PhotoMeta>(List.toArray(out), func(a, b) = Int.compare(b.at, a.at));
  };
  func canSee(m : Me, a : Asset) : Bool = m.role == "admin" or a.assignee == m.id;

  public type AssetInput = { tag : Text; serial : Text; vendor : Text; model : Text; kind : Text; note : Text };
  func cleanInput(x : AssetInput) : AssetInput = {
    tag = capText(norm(x.tag), 40); serial = capText(norm(x.serial), 64); vendor = capText(norm(x.vendor), 40); model = capText(norm(x.model), 80);
    kind = (if (has(KINDS, lower(norm(x.kind)))) lower(norm(x.kind)) else "other"); note = capText(norm(x.note), 500);
  };
  func duplicateOf(x : AssetInput, exceptId : Nat) : ?Asset {
    let tag = normId(x.tag); let ser = normId(x.serial);
    for ((id, a) in Map.entries(assets)) {
      if (id != exceptId and not a.archived) {
        if (ser != "" and normId(a.serial) == ser) return ?a;
        if (tag != "" and normId(a.tag) == tag) return ?a;
      };
    };
    null;
  };
  func createInternal(by : Text, x : AssetInput, status : Text, assignee : Text, holder : Text, source : Text) : Asset {
    let c = cleanInput(x);
    let id = nextAssetId; nextAssetId += 1;
    let a : Asset = { id; tag = c.tag; serial = c.serial; vendor = c.vendor; model = c.model; kind = c.kind; status = (if (has(STATUSES, status)) status else "unknown"); assignee; holder; note = c.note; createdAt = now(); updatedAt = now(); createdBy = by; archived = false };
    Map.add(assets, Nat.compare, id, a);
    ignore addEvent(id, by, (if (source == "import" or Text.startsWith(source, #text "mdm:")) "imported" else "created"), (if (source == "import") "imported from CSV" else if (Text.startsWith(source, #text "mdm:")) "reported by " # (switch (Text.stripStart(source, #text "mdm:")) { case (?n) n; case null source }) else "created" # (if (source != "") " via " # source else "")), "", 0);
    a;
  };

  public shared func createAsset(tok : Text, x : AssetInput) : async { ok : Bool; id : Nat; detail : Text } {
    if (migrating()) return { ok = false; id = 0; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; id = 0; detail = "admins only" } };
    let c = cleanInput(x);
    if (c.tag == "" and c.serial == "" and c.model == "") return { ok = false; id = 0; detail = "give it at least a tag, a serial or a model" };
    switch (duplicateOf(c, 0)) { case (?d) return { ok = false; id = d.id; detail = "already in the register as " # deviceName(d) # " (#" # Nat.toText(d.id) # ")" }; case null {} };
    let a = createInternal(m.id, c, "in_stock", "", "", "");
    log(m.email, "created " # deviceName(a) # " #" # Nat.toText(a.id));
    { ok = true; id = a.id; detail = "" };
  };
  public shared func updateAsset(tok : Text, id : Nat, x : AssetInput) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let a = switch (Map.get(assets, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no such device" } };
    let c = cleanInput(x);
    switch (duplicateOf(c, id)) { case (?d) return { ok = false; detail = "another device carries that tag or serial: " # deviceName(d) # " (#" # Nat.toText(d.id) # ")" }; case null {} };
    Map.add(assets, Nat.compare, id, { a with tag = c.tag; serial = c.serial; vendor = c.vendor; model = c.model; kind = c.kind; note = c.note; updatedAt = now() });
    ignore addEvent(id, m.id, "edited", "details edited", "", 0);
    { ok = true; detail = "" };
  };
  public shared func archiveAsset(tok : Text, id : Nat, archived : Bool) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let a = switch (Map.get(assets, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no such device" } };
    Map.add(assets, Nat.compare, id, { a with archived; updatedAt = now() });
    ignore addEvent(id, m.id, "edited", (if (archived) "archived" else "restored from archive"), "", 0);
    log(m.email, (if (archived) "archived " else "restored ") # deviceName(a) # " #" # Nat.toText(id));
    { ok = true; detail = "" };
  };

  /// What happened to a device. handed_out/loaned → to = e-mail (or an external name for loaned); sold → to = buyer; note/photo → nothing changes.
  func applyAction(m : Me, a : Asset, action : Text, toRaw : Text, note : Text, photoId : Nat) : { ok : Bool; detail : Text; eventId : Nat } {
    switch (handovers.get(a.id)) { case (?p) {
      let pending = not handoverDone(p) and (switch (hardwareCases.get(p.caseKey)) { case (?c) c.state != "cancelled" and c.state != "closed"; case null true });
      if (pending and action != "note" and action != "photo") return { ok = false; detail = "Use the hardware follow-up on this device to confirm custody"; eventId = 0 };
    }; case null {} };
    if (not has(ACTIONS, action)) return { ok = false; detail = "unknown action"; eventId = 0 };
    let to = norm(toRaw);
    var status = a.status; var assignee = a.assignee; var holder = a.holder; var detail = "";
    switch (action) {
      case ("handed_out") {
        if (to == "" or not knownPerson(to) or not Hub.isActive(people, lower(to))) return { ok = false; detail = "pick the person from the directory"; eventId = 0 };
        status := "assigned"; assignee := pidOf(to); holder := ""; detail := "handed out to " # nameOf(pidOf(to));
      };
      case ("loaned") {
        if (to == "") return { ok = false; detail = "say who has it"; eventId = 0 };
        status := "loaned"; if (knownPerson(to)) { assignee := pidOf(to); holder := "" } else { assignee := ""; holder := capText(to, 80) }; detail := "loaned to " # (if (knownPerson(to)) nameOf(pidOf(to)) else to);
      };
      case ("returned") { status := "in_stock"; assignee := ""; holder := ""; detail := "returned" # (if (a.assignee != "") " by " # nameOf(a.assignee) else "") };
      case ("sold") { status := "sold"; assignee := ""; holder := capText(to, 80); detail := "sold" # (if (to != "") " to " # to else "") };
      case ("scrapped") { status := "scrapped"; assignee := ""; holder := ""; detail := "scrapped / recycled" };
      case ("lost") { status := "lost"; detail := "reported lost" };
      case ("note") { if (note == "") return { ok = false; detail = "a note needs text"; eventId = 0 }; detail := "note" };
      case (_) { detail := "photo added" };
    };
    let d = detail # (if (note != "") " — " # capText(note, 300) else "");
    Map.add(assets, Nat.compare, a.id, { a with status; assignee; holder; updatedAt = now() });
    let eid = addEvent(a.id, m.id, action, d, (if (action == "handed_out" or action == "loaned") (if (knownPerson(to)) pidOf(to) else to) else if (action == "sold") to else ""), photoId);
    if (photoId != 0) { switch (Map.get(photos, Nat.compare, photoId)) { case (?p) Map.add(photos, Nat.compare, photoId, { p with eventId = eid }); case null {} } };
    { ok = true; detail = d; eventId = eid };
  };
  public shared func addEventTo(tok : Text, id : Nat, action : Text, to : Text, note : Text) : async { ok : Bool; detail : Text; eventId : Nat } {
    if (migrating()) return { ok = false; detail = MIGRATING; eventId = 0 };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; eventId = 0 } };
    let a = switch (Map.get(assets, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no such device"; eventId = 0 } };
    if (action == "sold" and handovers.containsKey(id)) return { ok = false; detail = "Complete the sale handover from Sales"; eventId = 0 };
    let r = applyAction(m, a, action, to, note, 0);
    if (r.ok) { log(m.email, deviceName(a) # " #" # Nat.toText(id) # ": " # r.detail); await notifyHandover(a.id, action, to) };
    r;
  };
  /// Tell the person by hub notification when a device lands with them or leaves them (best effort).
  /// The last attempt to reach a person through the hub — shown under Settings, because a hub that
  /// refuses (no notify lane, unknown person) used to fail silently and nobody saw the bell.
  public type NotifyState = { at : Int; ok : Bool; detail : Text; to : Text; title : Text };
  var lastNotify : ?NotifyState = null;
  /// One notification through the hub, with the hub's answer recorded. Returns the hub's detail on failure ("" = delivered).
  func notifyPerson(email : Text, title : Text, url : Text, kind : Text, dedupeKey : Text) : async Text {
    if (hubId == "") return "no hub connected";
    let e = lower(norm(email));
    let r = try { await Hub.hub(hubId).hub_notify({ email = e; title; url; kind; dedupeKey }) } catch (err) { ({ ok = false; detail = "the hub did not answer: " # Error.message(err) }) };
    let detail = if (r.ok) "" else (if (r.detail == "") "the hub refused the notification" else r.detail);
    lastNotify := ?{ at = now(); ok = r.ok; detail; to = e; title };
    if (not r.ok) log("hub", "notification to " # e # " NOT delivered (" # title # "): " # detail);
    detail;
  };
  /// Admins: how the last notification went — the quickest way to see a missing notify lane.
  public shared query func notifyStatus(tok : Text) : async ?NotifyState {
    switch (admin(tok)) { case null null; case (?_) lastNotify };
  };
  // Normalize here too: deployed settings may already contain a trailing slash.
  func appLink(route : Text) : Text {
    let base = Text.trimEnd(norm(appUrl), #char '/');
    if (base == "") "" else base # "/#/" # route;
  };
  func notifyHandover(assetId : Nat, action : Text, to : Text) : async () {
    if (hubId == "") return;
    let a = switch (Map.get(assets, Nat.compare, assetId)) { case (?a) a; case null return };
    let link = appLink("d/" # Nat.toText(assetId));
    if ((action == "handed_out" or action == "loaned") and knownPerson(to)) {
      ignore await notifyPerson(to, deviceName(a) # " is now with you" # (if (a.tag != "") " (" # a.tag # ")" else ""), link, "assets.handover", "hand-" # Nat.toText(assetId) # "-" # Nat.toText(nextEventId));
    };
  };

  func storePhoto(assetId : Nat, by : Text, img : Blob, mime : Text) : { ok : Bool; detail : Text; id : Nat } {
    if (img.size() == 0 or img.size() > MAX_PHOTO) return { ok = false; detail = "photo must be 1 byte – 900 KB (the app scales it first)"; id = 0 };
    if (mime != "image/jpeg" and mime != "image/png" and mime != "image/webp") return { ok = false; detail = "JPEG, PNG or WebP"; id = 0 };
    if (photoBytes + img.size() > MAX_PHOTO_TOTAL) return { ok = false; detail = "photo storage is full — archive old devices or ask IT"; id = 0 };
    if (photosOf(assetId).size() >= MAX_PHOTOS_PER_ASSET) return { ok = false; detail = "this device already has 12 photos"; id = 0 };
    let id = nextPhotoId; nextPhotoId += 1;
    Map.add(photos, Nat.compare, id, { id; assetId; eventId = 0; at = now(); by; mime; bytes = img });
    photoBytes += img.size();
    { ok = true; detail = ""; id };
  };
  public shared func addPhoto(tok : Text, assetId : Nat, img : Blob, mime : Text, note : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let a = switch (Map.get(assets, Nat.compare, assetId)) { case (?a) a; case null return { ok = false; detail = "no such device" } };
    let p = storePhoto(assetId, m.id, img, mime);
    if (not p.ok) return { ok = false; detail = p.detail };
    let r = applyAction(m, a, "photo", "", note, p.id);
    { ok = r.ok; detail = r.detail };
  };
  public shared func removePhoto(tok : Text, photoId : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    switch (Map.get(photos, Nat.compare, photoId)) {
      case (?p) { ignore Map.delete(photos, Nat.compare, photoId); photoBytes -= Nat.min(photoBytes, p.bytes.size()); ignore addEvent(p.assetId, m.id, "edited", "a photo was removed", "", 0); ({ ok = true; detail = "" }) };
      case null ({ ok = false; detail = "no such photo" });
    };
  };
  public shared query func photo(tok : Text, photoId : Nat) : async ?{ mime : Text; bytes : Blob } {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    switch (Map.get(photos, Nat.compare, photoId)) {
      case (?p) { switch (Map.get(assets, Nat.compare, p.assetId)) { case (?a) { if (canSee(m, a)) ?{ mime = p.mime; bytes = p.bytes } else null }; case null null } };
      case null null;
    };
  };

  public type AssetRow = { asset : Asset; assigneeName : Text; photoCount : Nat; lastEvent : Text; lastAt : Int; mdm : Text; mdmUser : Text; mdmMismatch : Bool; assigneeEmail : Text; createdByName : Text }; // asset.assignee/createdBy are person ids (0.6.0)
  func row(a : Asset) : AssetRow {
    var lastEvent = ""; var lastAt = a.updatedAt; var pc = 0;
    for ((_, e) in Map.entries(events)) if (e.assetId == a.id and e.at >= lastAt) { lastEvent := e.detail; lastAt := e.at };
    for ((_, p) in Map.entries(photos)) if (p.assetId == a.id) pc += 1;
    let (mdm, mdmUser, mm) = switch (Map.get(mdmMeta, Nat.compare, a.id)) { case (?x) (x.connName, x.userEmail, mdmMismatch(a, x)); case null ("", "", false) };
    { asset = a; assigneeName = (if (a.assignee == "") "" else nameOf(a.assignee)); photoCount = pc; lastEvent; lastAt; mdm; mdmUser; mdmMismatch = mm; assigneeEmail = emailOfPid(a.assignee); createdByName = nameOf(a.createdBy) };
  };
  /// Admins see everything; members see their own devices. q matches tag, serial, vendor, model, assignee.
  func hardwarePending(id : Nat) : Bool {
    let p = handovers.get(id) ?? (return false);
    let c = hardwareCases.get(p.caseKey) ?? (return true);
    not handoverDone(p) and c.state != "cancelled" and c.state != "closed";
  };
  public shared query func handoverOwners(tok : Text) : async [{ id : Text; name : Text }] {
    if (admin(tok) == null) return [];
    let out = List.empty<{ id : Text; name : Text }>();
    for ((email, person) in people.entries()) if (person.active and roleOf(email) == "admin") out.add({ id = pidOf(email); name = person.displayName });
    out.toArray();
  };
  public shared query func listAssets(tok : Text, q : Text, status : Text, archived : Bool) : async [AssetRow] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    let needle = lower(norm(q)); let nid = normId(q);
    let out = List.empty<AssetRow>();
    for ((_, a) in Map.entries(assets)) {
      if (canSee(m, a) and ((status == "offboarding" and m.role == "admin" and hardwarePending(a.id)) or (status != "offboarding" and a.archived == archived and (status == "" or a.status == status)))) {
        let hay = lower(a.tag # " " # a.serial # " " # a.vendor # " " # a.model # " " # emailOfPid(a.assignee) # " " # nameOf(a.assignee) # " " # a.holder # " " # a.note);
        if (needle == "" or Text.contains(hay, #text needle) or (nid != "" and (Text.contains(normId(a.tag), #text nid) or Text.contains(normId(a.serial), #text nid)))) List.add(out, row(a));
      };
    };
    let arr = Array.sort<AssetRow>(List.toArray(out), func(x, y) = Int.compare(y.lastAt, x.lastAt));
    Array.tabulate<AssetRow>(Nat.min(arr.size(), 500), func i = arr[i]);
  };
  /// events come display-resolved (by/to as names); asset.assignee is the person id, assigneeEmail its current address
  public shared query func getAsset(tok : Text, id : Nat) : async ?{ asset : Asset; assigneeName : Text; assigneeEmail : Text; createdByName : Text; events : [Event]; photos : [PhotoMeta]; mdm : ?MdmMeta; mdmMismatch : Bool; abm : ?AbmDevice } {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    switch (Map.get(assets, Nat.compare, id)) {
      case (?a) { if (not canSee(m, a)) return null; let md = Map.get(mdmMeta, Nat.compare, id); ?{ asset = a; assigneeName = (if (a.assignee == "") "" else nameOf(a.assignee)); assigneeEmail = emailOfPid(a.assignee); createdByName = nameOf(a.createdBy); events = Array.map<Event, Event>(eventsOf(id).filter(func e = m.role == "admin" or e.kind != "offboarding"), showEvent); photos = Array.map<PhotoMeta, PhotoMeta>(photosOf(id), func(ph) = { ph with by = nameOf(ph.by) }); mdm = md; mdmMismatch = (switch (md) { case (?x) mdmMismatch(a, x); case null false }); abm = Map.get(abmDevices, Text.compare, normId(a.serial)) } };
      case null null;
    };
  };
  public shared query func stats(tok : Text) : async { total : Nat; byStatus : [(Text, Nat)]; recent : [{ event : Event; name : Text }]; photos : Nat; photoBytes : Nat } {
    let m = switch (me(tok)) { case (?m) m; case null return { total = 0; byStatus = []; recent = []; photos = 0; photoBytes = 0 } };
    let counts = Map.empty<Text, Nat>();
    var total = 0;
    for ((_, a) in Map.entries(assets)) if (canSee(m, a) and not a.archived) { total += 1; Map.add(counts, Text.compare, a.status, (switch (Map.get(counts, Text.compare, a.status)) { case (?n) n + 1; case null 1 })) };
    let by = List.empty<(Text, Nat)>();
    for (s in STATUSES.vals()) { switch (Map.get(counts, Text.compare, s)) { case (?n) List.add(by, (s, n)); case null {} } };
    let recent = List.empty<{ event : Event; name : Text }>();
    let all = List.empty<Event>();
    for ((_, e) in Map.entries(events)) { switch (Map.get(assets, Nat.compare, e.assetId)) { case (?a) { if (canSee(m, a)) List.add(all, e) }; case null {} } };
    let sorted = Array.sort<Event>(List.toArray(all), func(a, b) = Int.compare(b.at, a.at));
    for (e in sorted.vals()) { if (List.size(recent) < 12) { switch (Map.get(assets, Nat.compare, e.assetId)) { case (?a) List.add(recent, { event = showEvent(e); name = deviceName(a) }); case null {} } } };
    { total; byStatus = List.toArray(by); recent = List.toArray(recent); photos = Map.size(photos); photoBytes };
  };

  // =====================================================================
  // photo intake: read → match → commit
  // =====================================================================
  public shared func intakeRead(tok : Text, img : Blob, mime : Text) : async ReadResult {
    switch (admin(tok)) { case null return noRead("admins only"); case (?_) {} };
    if (img.size() == 0 or img.size() > MAX_PHOTO) return noRead("photo must be 1 byte – 900 KB");
    if (mime != "image/jpeg" and mime != "image/png" and mime != "image/webp") return noRead("JPEG, PNG or WebP");
    await aiRead(img, mime);
  };
  public type Candidate = { row : AssetRow; score : Nat; why : Text };
  /// Fuzzy match of read codes against tags and serials. Scores: 100 exact · 90 after confusable folding · 75 tail/head match · 60 one edit · 50 two edits.
  public shared query func intakeMatch(tok : Text, values : [Text]) : async [Candidate] {
    switch (admin(tok)) { case null return []; case (?_) {} };
    let out = List.empty<Candidate>();
    for ((_, a) in Map.entries(assets)) {
      if (not a.archived) {
        var best = 0; var why = "";
        for (v in values.vals()) {
          let nv = normId(v); let fv = foldId(v);
          if (nv.size() >= 4) {
            for ((field, raw) in [("tag", a.tag), ("serial", a.serial)].vals()) {
              let nr = normId(raw); let fr = foldId(raw);
              if (nr != "") {
                var sc = 0; var w = "";
                if (nr == nv) { sc := 100; w := field # " matches exactly" }
                else if (fr == fv) { sc := 90; w := field # " matches (0/O, 1/I, 5/S read alike)" }
                else if (nr.size() >= 6 and (Text.endsWith(nr, #text nv) or Text.endsWith(nv, #text nr) or Text.startsWith(nr, #text nv))) { sc := 75; w := field # " ends/starts with the read code" }
                else if (nv.size() >= 6 and (Text.contains(nr, #text nv) or Text.contains(nv, #text nr))) { sc := 70; w := field # " contains the read code" }
                else if (Int.abs(nr.size() - nv.size()) <= 2 and nv.size() >= 6) { let d = editDistance(fr, fv); if (d == 1) { sc := 60; w := field # " differs by one character" } else if (d == 2) { sc := 50; w := field # " differs by two characters" } };
                if (sc > best) { best := sc; why := w # " (" # raw # ")" };
              };
            };
          };
        };
        if (best >= 50) List.add(out, { row = row(a); score = best; why });
      };
    };
    let arr = Array.sort<Candidate>(List.toArray(out), func(x, y) = Nat.compare(y.score, x.score));
    Array.tabulate<Candidate>(Nat.min(arr.size(), 6), func i = arr[i]);
  };
  /// The wizard's last step: an existing device or a new one, what happened, the photo as evidence.
  public shared func intakeCommit(tok : Text, args : { assetId : ?Nat; create : ?AssetInput; action : Text; to : Text; note : Text; photo : ?Blob; mime : Text }) : async { ok : Bool; detail : Text; assetId : Nat; eventId : Nat } {
    if (migrating()) return { ok = false; detail = MIGRATING; assetId = 0; eventId = 0 };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; assetId = 0; eventId = 0 } };
    let a : Asset = switch (args.assetId, args.create) {
      case (?id, _) { switch (Map.get(assets, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no such device"; assetId = 0; eventId = 0 } } };
      case (null, ?x) {
        let c = cleanInput(x);
        if (c.tag == "" and c.serial == "" and c.model == "") return { ok = false; detail = "give the new device at least a tag, a serial or a model"; assetId = 0; eventId = 0 };
        switch (duplicateOf(c, 0)) { case (?d) return { ok = false; detail = "already in the register as " # deviceName(d) # " — pick it instead"; assetId = d.id; eventId = 0 }; case null {} };
        createInternal(m.id, c, "in_stock", "", "", "photo intake");
      };
      case (null, null) return { ok = false; detail = "pick a device or create one"; assetId = 0; eventId = 0 };
    };
    var photoId = 0;
    switch (args.photo) {
      case (?img) { let p = storePhoto(a.id, m.id, img, args.mime); if (not p.ok) return { ok = false; detail = p.detail; assetId = a.id; eventId = 0 }; photoId := p.id };
      case null {};
    };
    let action = if (args.action == "") "photo" else args.action;
    let r = applyAction(m, a, action, args.to, args.note, photoId);
    if (not r.ok) return { ok = false; detail = r.detail; assetId = a.id; eventId = 0 };
    log(m.email, deviceName(a) # " #" # Nat.toText(a.id) # ": " # r.detail # (if (photoId != 0) " · photo" else ""));
    await notifyHandover(a.id, action, args.to);
    { ok = true; detail = r.detail; assetId = a.id; eventId = r.eventId };
  };

  // =====================================================================
  // CSV import / export (the way an existing inventory moves in)
  // =====================================================================
  func splitCsvLine(line : Text) : [Text] {
    let out = List.empty<Text>();
    var cur = ""; var q = false; var prevQuote = false;
    for (c in line.chars()) {
      if (q) {
        if (c == '\"') { if (prevQuote) { cur #= "\""; prevQuote := false } else prevQuote := true }
        else { if (prevQuote) { q := false; prevQuote := false; if (c == ',') { List.add(out, cur); cur := "" } else cur #= Char.toText(c) } else cur #= Char.toText(c) };
      } else {
        if (c == '\"') q := true else if (c == ',') { List.add(out, cur); cur := "" } else cur #= Char.toText(c);
      };
    };
    List.add(out, cur);
    List.toArray(out);
  };
  /// Columns (header row, any order, case-insensitive): tag, serial, vendor, model, kind, status, assignee, holder, note. Unknown columns are ignored; a device already known by serial or tag is updated, not duplicated.
  public shared func importCsv(tok : Text, text : Text) : async { ok : Bool; created : Nat; updated : Nat; skipped : Nat; detail : Text } {
    if (migrating()) return { ok = false; created = 0; updated = 0; skipped = 0; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; created = 0; updated = 0; skipped = 0; detail = "admins only" } };
    if (text.size() > 4_000_000) return { ok = false; created = 0; updated = 0; skipped = 0; detail = "file too large (4 MB)" };
    let lines = Array.filter<Text>(Text.split(Text.replace(text, #text "\r", ""), #char '\n').toArray(), func(l) = norm(l) != "");
    if (lines.size() < 2) return { ok = false; created = 0; updated = 0; skipped = 0; detail = "need a header row and at least one device" };
    let header = Array.map<Text, Text>(splitCsvLine(lines[0]), func(h) = lower(norm(h)));
    func col(name : Text) : ?Nat { var i = 0; for (h in header.vals()) { if (h == name) return ?i; i += 1 }; null };
    let cTag = col("tag"); let cSer = col("serial"); let cVen = col("vendor"); let cMod = col("model"); let cKind = col("kind"); let cSt = col("status"); let cAs = col("assignee"); let cHold = col("holder"); let cNote = col("note");
    if (cTag == null and cSer == null) return { ok = false; created = 0; updated = 0; skipped = 0; detail = "the header needs a tag or a serial column" };
    func cell(cells : [Text], c : ?Nat) : Text = switch (c) { case (?i) { if (i < cells.size()) norm(cells[i]) else "" }; case null "" };
    var created = 0; var updated = 0; var skipped = 0;
    var i = 1;
    while (i < lines.size() and i <= 5000) {
      let cells = splitCsvLine(lines[i]);
      let x : AssetInput = { tag = cell(cells, cTag); serial = cell(cells, cSer); vendor = cell(cells, cVen); model = cell(cells, cMod); kind = cell(cells, cKind); note = cell(cells, cNote) };
      let stRaw = lower(cell(cells, cSt)); let assigneeEmail = lower(cell(cells, cAs)); let assignee = if (assigneeEmail == "") "" else pidOf(assigneeEmail); let holder = cell(cells, cHold);
      let status = if (has(STATUSES, stRaw)) stRaw else if (assignee != "") "assigned" else if (stRaw == "") "in_stock" else "unknown";
      if (x.tag == "" and x.serial == "") skipped += 1
      else {
        switch (duplicateOf(cleanInput(x), 0)) {
          case (?d) {
            let c = cleanInput(x);
            Map.add(assets, Nat.compare, d.id, { d with tag = (if (c.tag != "") c.tag else d.tag); serial = (if (c.serial != "") c.serial else d.serial); vendor = (if (c.vendor != "") c.vendor else d.vendor); model = (if (c.model != "") c.model else d.model); kind = (if (cell(cells, cKind) != "") c.kind else d.kind); status = (if (not hardwarePending(d.id) and (stRaw != "" or assignee != "")) status else d.status); assignee = (if (not hardwarePending(d.id) and assignee != "") assignee else d.assignee); holder = (if (not hardwarePending(d.id) and holder != "") holder else d.holder); note = (if (c.note != "") c.note else d.note); updatedAt = now() });
            ignore addEvent(d.id, m.id, "imported", "updated from CSV", "", 0);
            updated += 1;
          };
          case null { ignore createInternal(m.id, { x with kind = x.kind }, status, assignee, holder, "import"); created += 1 };
        };
      };
      i += 1;
    };
    log(m.email, "CSV import: " # Nat.toText(created) # " created, " # Nat.toText(updated) # " updated, " # Nat.toText(skipped) # " skipped");
    { ok = true; created; updated; skipped; detail = "" };
  };
  public shared query func exportCsv(tok : Text) : async Text {
    switch (admin(tok)) { case null return ""; case (?_) {} };
    var out = "id,tag,serial,vendor,model,kind,status,assignee,assignee name,holder,note,updated\n";
    for ((_, a) in Map.entries(assets)) {
      if (not a.archived) out #= Text.join([Nat.toText(a.id), csv(a.tag), csv(a.serial), csv(a.vendor), csv(a.model), csv(a.kind), csv(a.status), csv(emailOfPid(a.assignee)), csv(if (a.assignee == "") "" else nameOf(a.assignee)), csv(a.holder), csv(a.note), Int.toText(a.updatedAt / 1_000_000_000)].vals(), ",") # "\n";
    };
    out;
  };

  // =====================================================================
  // device management (MDM): Iru (formerly Kandji) · Jamf Pro · Microsoft Intune
  // The MDM knows every enrolled device and who is logged in; the register knows
  // who was HANDED the device. A sync creates missing devices, fills vendor/model/
  // OS, assigns a person only where the register has nobody, and otherwise just
  // notes what the MDM says (a mismatch is shown, never applied). Secrets are
  // write-only. Calls leave the engine as single-node (non-replicated) requests.
  //   Iru:    GET  {url}/api/v1/devices?limit=100&offset=N            Bearer <api token>          (api-docs.iru.com)
  //   Jamf:   POST {url}/api/v1/oauth/token (client_credentials)  →  GET {url}/api/v1/computers-inventory?section=GENERAL&section=HARDWARE&section=USER_AND_LOCATION&section=OPERATING_SYSTEM&page=N&page-size=100
  //           and GET {url}/api/v2/mobile-devices?page=N&page-size=100        (developer.jamf.com)
  //   Intune: POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token (client_credentials, scope graph .default)
  //           →  GET https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$select=…&$top=100, follow @odata.nextLink   (learn.microsoft.com; app permission DeviceManagementManagedDevices.Read.All)
  // =====================================================================
  public type MdmConn = {
    id : Nat;
    kind : Text; // iru | jamf | intune
    name : Text;
    url : Text; // iru: https://<sub>.api.kandji.io (or .api.eu.kandji.io) · jamf: https://<x>.jamfcloud.com · intune: tenant id or domain
    clientId : Text; // jamf / intune
    secret : Text; // write-only: iru api token · jamf client secret · intune client secret
    enabled : Bool;
    createdAt : Int;
    lastSync : Int;
    lastResult : Text;
    devices : Nat; // seen in the last sync
    matched : Nat;
    created : Nat;
  };
  public type MdmMeta = { connId : Nat; connName : Text; kind : Text; externalId : Text; deviceName : Text; osVersion : Text; lastSeen : Text; userEmail : Text; userName : Text; compliance : Text; syncedAt : Int };
  public type MdmView = { id : Nat; kind : Text; name : Text; url : Text; clientId : Text; secretSet : Bool; enabled : Bool; createdAt : Int; lastSync : Int; lastResult : Text; devices : Nat; matched : Nat; created : Nat };
  let mdmConns : Map.Map<Nat, MdmConn> = Map.empty<Nat, MdmConn>();
  let mdmMeta : Map.Map<Nat, MdmMeta> = Map.empty<Nat, MdmMeta>(); // assetId -> what the MDM last said
  var nextMdmId : Nat = 1;
  transient var mdmBusy : Bool = false;
  transient let MDM_KINDS : [Text] = ["iru", "jamf", "intune"];

  /// The register says one person, the MDM another (or the MDM sees a device the register calls sold/scrapped/lost).
  func mdmMismatch(a : Asset, x : MdmMeta) : Bool {
    if (a.status == "sold" or a.status == "scrapped" or a.status == "lost") return true;
    x.userEmail != "" and a.assignee != "" and pidOf(x.userEmail) != a.assignee and lower(x.userEmail) != emailOfPid(a.assignee);
  };
  func mdmView(c : MdmConn) : MdmView = { id = c.id; kind = c.kind; name = c.name; url = c.url; clientId = c.clientId; secretSet = c.secret != ""; enabled = c.enabled; createdAt = c.createdAt; lastSync = c.lastSync; lastResult = c.lastResult; devices = c.devices; matched = c.matched; created = c.created };
  public shared query func listMdm(tok : Text) : async [MdmView] {
    switch (admin(tok)) { case null []; case (?_) { let out = List.empty<MdmView>(); for ((_, c) in Map.entries(mdmConns)) List.add(out, mdmView(c)); List.toArray(out) } };
  };
  public shared func addMdm(tok : Text, args : { kind : Text; name : Text; url : Text; clientId : Text; secret : Text }) : async { ok : Bool; detail : Text; id : Nat } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; id = 0 } };
    let kind = lower(norm(args.kind));
    if (not has(MDM_KINDS, kind)) return { ok = false; detail = "kind must be iru, jamf or intune"; id = 0 };
    let url = Text.trimEnd(norm(args.url), #char '/');
    if (kind != "intune" and not Text.startsWith(url, #text "https://")) return { ok = false; detail = "the address must start with https://"; id = 0 };
    if (kind == "intune" and url == "") return { ok = false; detail = "give the tenant id (or the tenant's domain)"; id = 0 };
    if (norm(args.secret) == "") return { ok = false; detail = (if (kind == "iru") "the API token is required" else "the client secret is required"); id = 0 };
    if (kind != "iru" and norm(args.clientId) == "") return { ok = false; detail = "the client id is required"; id = 0 };
    if (Map.size(mdmConns) >= 10) return { ok = false; detail = "max 10 connections"; id = 0 };
    let id = nextMdmId; nextMdmId += 1;
    let name = if (norm(args.name) == "") (if (kind == "iru") "Iru" else if (kind == "jamf") "Jamf Pro" else "Intune") else capText(norm(args.name), 40);
    Map.add(mdmConns, Nat.compare, id, { id; kind; name; url; clientId = norm(args.clientId); secret = norm(args.secret); enabled = true; createdAt = now(); lastSync = 0; lastResult = ""; devices = 0; matched = 0; created = 0 });
    log(m.email, "MDM connection added: " # name # " (" # kind # ")");
    { ok = true; detail = ""; id };
  };
  public shared func updateMdm(tok : Text, id : Nat, args : { name : Text; url : Text; clientId : Text; secret : Text; enabled : Bool }) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let c = switch (Map.get(mdmConns, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such connection" } };
    let url = Text.trimEnd(norm(args.url), #char '/');
    if (c.kind != "intune" and not Text.startsWith(url, #text "https://")) return { ok = false; detail = "the address must start with https://" };
    Map.add(mdmConns, Nat.compare, id, { c with name = (if (norm(args.name) == "") c.name else capText(norm(args.name), 40)); url; clientId = norm(args.clientId); secret = (if (norm(args.secret) == "") c.secret else norm(args.secret)); enabled = args.enabled });
    log(m.email, "MDM connection updated: " # c.name);
    { ok = true; detail = "" };
  };
  public shared func removeMdm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    switch (Map.get(mdmConns, Nat.compare, id)) {
      case (?c) { ignore Map.delete(mdmConns, Nat.compare, id); log(m.email, "MDM connection removed: " # c.name); ({ ok = true; detail = "devices keep their last MDM note" }) };
      case null ({ ok = false; detail = "no such connection" });
    };
  };

  transient var unlockPinBusy = false;
  public shared func deviceUnlockPin(tok : Text, assetId : Nat) : async { ok : Bool; pin : Text; detail : Text } {
    func fail(t : Text) : { ok : Bool; pin : Text; detail : Text } = { ok = false; pin = ""; detail = t };
    let m = admin(tok) ?? (return fail("admins only"));
    let md = mdmMeta.get(assetId) ?? (return fail("No linked MDM device. Check Kandji / Iru directly."));
    let c = mdmConns.get(md.connId) ?? (return fail("MDM connection no longer exists."));
    if (md.kind != "iru" or c.kind != "iru" or not c.enabled or md.externalId == "") return fail("Unlock PIN lookup requires an enabled Kandji / Iru connection.");
    if (unlockPinBusy) return fail("Another PIN lookup is in progress. Try again shortly.");
    unlockPinBusy := true;
    try {
      let req : HttpRequestArgs = { url = c.url # "/api/v1/devices/" # urlEnc(md.externalId) # "/secrets/unlockpin"; max_response_bytes = ?4096; headers = [{ name = "Authorization"; value = "Bearer " # c.secret }, { name = "Accept"; value = "application/json" }]; body = null; method = #get; transform = null; is_replicated = ?false };
      let res = await (with timeout = 30) icHttp.http_request(req);
      // Authorization, connection and device association can change during the outcall.
      if (admin(tok) == null or mdmConns.get(md.connId) != ?c or mdmMeta.get(assetId) != ?md) return fail("Access or device connection changed. Reopen the device.");
      if (res.status == 403 or res.status == 401) return fail("Kandji / Iru denied access. Check the token's device-secret permissions.");
      if (res.status == 404) return fail("No PIN record returned. The device may have been removed; this does not prove it is unlocked.");
      if (res.status != 200) return fail("PIN lookup failed (HTTP " # res.status.toText() # "). Check Kandji / Iru directly.");
      let body = Text.decodeUtf8(res.body) ?? "";
      let j = switch (Json.parse(body)) { case (#ok(j)) j; case (_) return fail("Unexpected PIN response. Check Kandji / Iru directly.") };
      let pin = jStr(j, "pin");
      if (pin == "") return { ok = true; pin = ""; detail = "No unlock PIN returned. Activation Lock is a separate check; verify setup on the device." };
      if (pin.size() != 6) return fail("Unexpected PIN format. Check Kandji / Iru directly.");
      for (ch in pin.chars()) if (ch < '0' or ch > '9') return fail("Unexpected PIN format. Check Kandji / Iru directly.");
      log(m.id, "Viewed MDM unlock PIN for device #" # assetId.toText());
      { ok = true; pin; detail = "Visible for 30 seconds. Not stored in the register or shared with the buyer." };
    } catch (_) { fail("PIN lookup interrupted. Check Kandji / Iru directly.") }
    finally { unlockPinBusy := false };
  };

  // ---- HTTP helpers for the MDM clients ----
  func urlEnc(t : Text) : Text {
    var out = "";
    for (b in Blob.toArray(Text.encodeUtf8(t)).vals()) {
      let n = Nat8.toNat(b);
      let c = Nat32.toChar(Nat.toNat32(n));
      if ((n >= 48 and n <= 57) or (n >= 65 and n <= 90) or (n >= 97 and n <= 122) or c == '-' or c == '_' or c == '.' or c == '~') out #= Char.toText(c)
      else { let h = "0123456789ABCDEF"; let hs = Text.toArray(h); out #= "%" # Char.toText(hs[n / 16]) # Char.toText(hs[n % 16]) };
    };
    out;
  };
  type Fetched = { ok : Bool; status : Nat; body : Text; detail : Text };
  func fetch(method : { #get; #post }, url : Text, headers : [HttpHeader], body : ?Text) : async Fetched {
    let req : HttpRequestArgs = { url; max_response_bytes = ?1_900_000; headers; body = (switch (body) { case (?b) ?Text.encodeUtf8(b); case null null }); method = (switch (method) { case (#get) #get; case (#post) #post }); transform = null; is_replicated = ?false };
    let res = try { await (with timeout = 60) icHttp.http_request(req) } catch (e) { return { ok = false; status = 0; body = ""; detail = "no answer: " # Error.message(e) } };
    let txt = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null "" };
    { ok = res.status >= 200 and res.status < 300; status = res.status; body = txt; detail = (if (res.status >= 200 and res.status < 300) "" else "HTTP " # Nat.toText(res.status) # ": " # capText(txt, 160)) };
  };
  func formToken(tokenUrl : Text, fields : [(Text, Text)]) : async { ok : Bool; token : Text; detail : Text } {
    var body = "";
    for ((k, v) in fields.vals()) body #= (if (body == "") "" else "&") # urlEnc(k) # "=" # urlEnc(v);
    let r = await fetch(#post, tokenUrl, [{ name = "Content-Type"; value = "application/x-www-form-urlencoded" }, { name = "Accept"; value = "application/json" }], ?body);
    if (not r.ok) return { ok = false; token = ""; detail = "token: " # r.detail };
    switch (Json.parse(r.body)) {
      case (#ok(j)) { let t = jStr(j, "access_token"); if (t == "") ({ ok = false; token = ""; detail = "token answer without access_token" }) else ({ ok = true; token = t; detail = "" }) };
      case (#err(_)) ({ ok = false; token = ""; detail = "token answer was not JSON" });
    };
  };

  /// One device as every MDM reports it, normalised.
  type MdmDevice = { externalId : Text; serial : Text; name : Text; vendor : Text; model : Text; kind : Text; os : Text; lastSeen : Text; userEmail : Text; userName : Text; compliance : Text; assetTag : Text };
  func kindFromPlatform(p : Text, model : Text) : Text {
    let pl = lower(p); let ml = lower(model);
    if (Text.contains(ml, #text "ipad") or Text.contains(pl, #text "ipad")) return "tablet";
    if (Text.contains(pl, #text "iphone") or pl == "ios" or pl == "android" or Text.contains(ml, #text "iphone") or Text.contains(ml, #text "pixel") or Text.contains(ml, #text "galaxy")) return "phone";
    if (Text.contains(pl, #text "mac") or Text.contains(pl, #text "windows") or Text.contains(pl, #text "linux") or Text.contains(ml, #text "macbook") or Text.contains(ml, #text "thinkpad") or Text.contains(ml, #text "latitude") or Text.contains(ml, #text "surface")) return "laptop";
    if (Text.contains(pl, #text "tv")) return "other";
    "other";
  };
  /// Iru / Kandji: one page of /api/v1/devices (array, or {results:[…]}).
  func iruPage(c : MdmConn, offset : Nat) : async { ok : Bool; detail : Text; devices : [MdmDevice] } {
    let r = await fetch(#get, c.url # "/api/v1/devices?limit=100&offset=" # Nat.toText(offset), [{ name = "Authorization"; value = "Bearer " # c.secret }, { name = "Accept"; value = "application/json" }], null);
    if (not r.ok) return { ok = false; detail = r.detail; devices = [] };
    let j = switch (Json.parse(r.body)) { case (#ok(j)) j; case (#err(_)) return { ok = false; detail = "not JSON"; devices = [] } };
    let arr = switch (j) { case (#array(a)) a; case (_) jArr(j, "results") };
    let out = List.empty<MdmDevice>();
    for (d in arr.vals()) {
      let model = norm(jStr(d, "model"));
      List.add(out, { externalId = jStr(d, "device_id"); serial = Text.toUpper(norm(jStr(d, "serial_number"))); name = jStr(d, "device_name"); vendor = "Apple"; model; kind = kindFromPlatform(jStr(d, "platform"), model); os = jStr(d, "os_version"); lastSeen = jStr(d, "last_check_in"); userEmail = lower(norm(jStr(d, "user.email"))); userName = jStr(d, "user.name"); compliance = ""; assetTag = norm(jStr(d, "asset_tag")) });
    };
    { ok = true; detail = ""; devices = List.toArray(out) };
  };
  /// Jamf Pro: computers (v1) then mobile devices (v2), both paged.
  func jamfPage(c : MdmConn, token : Text, mobile : Bool, page : Nat) : async { ok : Bool; detail : Text; devices : [MdmDevice]; total : Nat } {
    let url = if (mobile) c.url # "/api/v2/mobile-devices?page=" # Nat.toText(page) # "&page-size=100" else c.url # "/api/v1/computers-inventory?section=GENERAL&section=HARDWARE&section=USER_AND_LOCATION&section=OPERATING_SYSTEM&page=" # Nat.toText(page) # "&page-size=100";
    let r = await fetch(#get, url, [{ name = "Authorization"; value = "Bearer " # token }, { name = "Accept"; value = "application/json" }], null);
    if (not r.ok) return { ok = false; detail = r.detail; devices = []; total = 0 };
    let j = switch (Json.parse(r.body)) { case (#ok(j)) j; case (#err(_)) return { ok = false; detail = "not JSON"; devices = []; total = 0 } };
    let total = switch (Json.getAsNat(j, "totalCount")) { case (#ok(n)) n; case (_) 0 };
    let out = List.empty<MdmDevice>();
    for (d in jArr(j, "results").vals()) {
      if (mobile) {
        let model = norm(jStr(d, "model")); let typ = jStr(d, "type");
        List.add(out, { externalId = jStr(d, "id"); serial = Text.toUpper(norm(jStr(d, "serialNumber"))); name = jStr(d, "name"); vendor = "Apple"; model; kind = kindFromPlatform(typ, model); os = ""; lastSeen = ""; userEmail = ""; userName = jStr(d, "username"); compliance = ""; assetTag = "" });
      } else {
        let model = norm(jStr(d, "hardware.model")); let make = norm(jStr(d, "hardware.make"));
        List.add(out, { externalId = jStr(d, "id"); serial = Text.toUpper(norm(jStr(d, "hardware.serialNumber"))); name = jStr(d, "general.name"); vendor = (if (make == "") "Apple" else make); model; kind = kindFromPlatform(jStr(d, "general.platform"), model); os = jStr(d, "operatingSystem.version"); lastSeen = jStr(d, "general.lastContactTime"); userEmail = lower(norm(jStr(d, "userAndLocation.email"))); userName = jStr(d, "userAndLocation.realname"); compliance = ""; assetTag = norm(jStr(d, "general.assetTag")) });
      };
    };
    { ok = true; detail = ""; devices = List.toArray(out); total };
  };
  /// Intune: Graph managedDevices, following @odata.nextLink.
  func intunePage(token : Text, url : Text) : async { ok : Bool; detail : Text; devices : [MdmDevice]; next : Text } {
    let r = await fetch(#get, url, [{ name = "Authorization"; value = "Bearer " # token }, { name = "Accept"; value = "application/json" }], null);
    if (not r.ok) return { ok = false; detail = r.detail; devices = []; next = "" };
    let j = switch (Json.parse(r.body)) { case (#ok(j)) j; case (#err(_)) return { ok = false; detail = "not JSON"; devices = []; next = "" } };
    let out = List.empty<MdmDevice>();
    for (d in jArr(j, "value").vals()) {
      let model = norm(jStr(d, "model")); let os = jStr(d, "operatingSystem");
      let email = lower(norm(jStr(d, "emailAddress"))); let upn = lower(norm(jStr(d, "userPrincipalName")));
      List.add(out, { externalId = jStr(d, "id"); serial = Text.toUpper(norm(jStr(d, "serialNumber"))); name = jStr(d, "deviceName"); vendor = norm(jStr(d, "manufacturer")); model; kind = kindFromPlatform(os, model); os = os # " " # jStr(d, "osVersion"); lastSeen = jStr(d, "lastSyncDateTime"); userEmail = (if (email != "") email else upn); userName = jStr(d, "userDisplayName"); compliance = jStr(d, "complianceState"); assetTag = "" });
    };
    { ok = true; detail = ""; devices = List.toArray(out); next = jStr(j, "@odata.nextLink") };
  };
  transient let INTUNE_FIRST : Text = "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$select=id,deviceName,serialNumber,manufacturer,model,operatingSystem,osVersion,userPrincipalName,emailAddress,userDisplayName,lastSyncDateTime,complianceState,managedDeviceOwnerType&$top=100";
  func jamfToken(c : MdmConn) : async { ok : Bool; token : Text; detail : Text } = async { await formToken(c.url # "/api/v1/oauth/token", [("grant_type", "client_credentials"), ("client_id", c.clientId), ("client_secret", c.secret)]) };
  func intuneToken(c : MdmConn) : async { ok : Bool; token : Text; detail : Text } = async { await formToken("https://login.microsoftonline.com/" # c.url # "/oauth2/v2.0/token", [("grant_type", "client_credentials"), ("client_id", c.clientId), ("client_secret", c.secret), ("scope", "https://graph.microsoft.com/.default")]) };

  /// Pull everything the MDM knows (paged, capped at 30 pages) — the same list for Test and Sync.
  func mdmPull(c : MdmConn, onePage : Bool) : async { ok : Bool; detail : Text; devices : [MdmDevice] } {
    let all = List.empty<MdmDevice>();
    switch (c.kind) {
      case ("iru") {
        var offset = 0; var pages = 0;
        label paging while (pages < 100) {
          let p = await iruPage(c, offset);
          if (not p.ok) return { ok = false; detail = p.detail; devices = [] };
          for (d in p.devices.vals()) List.add(all, d);
          pages += 1; offset += 100;
          if (onePage or p.devices.size() < 100) break paging;
        };
      };
      case ("jamf") {
        let t = await jamfToken(c);
        if (not t.ok) return { ok = false; detail = t.detail; devices = [] };
        for (mobile in [false, true].vals()) {
          var page = 0;
          label paging while (page < 30) {
            let p = await jamfPage(c, t.token, mobile, page);
            if (not p.ok) { if (mobile) break paging else return { ok = false; detail = p.detail; devices = [] } }; // a tenant without mobile devices may refuse the endpoint
            for (d in p.devices.vals()) List.add(all, d);
            page += 1;
            if (onePage or p.devices.size() < 100) break paging;
          };
          if (onePage) return { ok = true; detail = ""; devices = List.toArray(all) };
        };
      };
      case ("intune") {
        let t = await intuneToken(c);
        if (not t.ok) return { ok = false; detail = t.detail; devices = [] };
        var url = INTUNE_FIRST; var pages = 0;
        label paging while (url != "" and pages < 30) {
          let p = await intunePage(t.token, url);
          if (not p.ok) return { ok = false; detail = p.detail; devices = [] };
          for (d in p.devices.vals()) List.add(all, d);
          pages += 1; url := p.next;
          if (onePage) break paging;
        };
      };
      case (_) return { ok = false; detail = "unknown kind"; devices = [] };
    };
    { ok = true; detail = ""; devices = List.toArray(all) };
  };
  /// Reach the MDM once, read one page, report what it sees — nothing is written.
  public shared func testMdm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    let c = switch (Map.get(mdmConns, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such connection" } };
    let p = await mdmPull(c, true);
    if (not p.ok) return { ok = false; detail = p.detail };
    var known = 0;
    for (d in p.devices.vals()) if (d.serial != "" and findBySerial(d.serial) != null) known += 1;
    { ok = true; detail = "reached " # c.name # ": " # Nat.toText(p.devices.size()) # " devices on the first page, " # Nat.toText(known) # " already in the register" # (if (p.devices.size() > 0) " — e.g. " # (if (p.devices[0].model != "") p.devices[0].model else p.devices[0].name) # " · " # p.devices[0].serial else "") };
  };
  func findBySerial(serial : Text) : ?Asset {
    let n = normId(serial);
    if (n == "") return null;
    for ((_, a) in Map.entries(assets)) if (not a.archived and normId(a.serial) == n) return ?a;
    null;
  };
  /// Full sync: devices → register. Creates what is missing, fills gaps, notes the rest.
  func mdmSyncOne(c : MdmConn, by : Text) : async { ok : Bool; detail : Text } {
    let p = await mdmPull(c, false);
    if (not p.ok) { Map.add(mdmConns, Nat.compare, c.id, { c with lastSync = now(); lastResult = "FAILED: " # p.detail }); return { ok = false; detail = p.detail } };
    var matched = 0; var created = 0; var assigned = 0; var mism = 0;
    for (d in p.devices.vals()) {
      if (d.serial != "") {
        let meta : MdmMeta = { connId = c.id; connName = c.name; kind = c.kind; externalId = d.externalId; deviceName = d.name; osVersion = d.os; lastSeen = d.lastSeen; userEmail = d.userEmail; userName = d.userName; compliance = d.compliance; syncedAt = now() };
        let userKnown = d.userEmail != "" and knownPerson(d.userEmail);
        switch (findBySerial(d.serial)) {
          case (?a) {
            matched += 1;
            var a2 = a;
            if (a.vendor == "" and d.vendor != "") a2 := { a2 with vendor = capText(d.vendor, 40) };
            if (a.model == "" and d.model != "") a2 := { a2 with model = capText(d.model, 80) };
            if (a.tag == "" and d.assetTag != "") a2 := { a2 with tag = capText(d.assetTag, 40) };
            if (a.kind == "other" and d.kind != "other") a2 := { a2 with kind = d.kind };
            // the register has nobody, the MDM has a known person → that is a hand-over we missed
            if (not handovers.containsKey(a.id) and a.assignee == "" and (a.status == "in_stock" or a.status == "unknown") and userKnown) {
              a2 := { a2 with assignee = pidOf(d.userEmail); status = "assigned" }; assigned += 1;
              ignore addEvent(a.id, by, "handed_out", "assigned to " # nameOf(pidOf(d.userEmail)) # " — reported by " # c.name, pidOf(d.userEmail), 0);
            };
            if (mdmMismatch(a2, meta)) mism += 1;
            if (a2 != a) Map.add(assets, Nat.compare, a.id, { a2 with updatedAt = now() });
            Map.add(mdmMeta, Nat.compare, a.id, meta);
          };
          case null {
            let x : AssetInput = { tag = d.assetTag; serial = d.serial; vendor = d.vendor; model = d.model; kind = d.kind; note = "" };
            let a = createInternal(by, x, (if (userKnown) "assigned" else "in_stock"), (if (userKnown) pidOf(d.userEmail) else ""), (if (not userKnown and d.userName != "") d.userName else ""), "mdm:" # c.name);
            Map.add(mdmMeta, Nat.compare, a.id, meta);
            created += 1;
          };
        };
      };
    };
    let detail = Nat.toText(p.devices.size()) # " devices · " # Nat.toText(matched) # " matched · " # Nat.toText(created) # " created" # (if (assigned > 0) " · " # Nat.toText(assigned) # " assigned" else "") # (if (mism > 0) " · " # Nat.toText(mism) # " mismatch" # (if (mism == 1) "" else "es") else "");
    Map.add(mdmConns, Nat.compare, c.id, { c with lastSync = now(); lastResult = detail; devices = p.devices.size(); matched; created });
    log(by, "MDM sync " # c.name # ": " # detail);
    { ok = true; detail };
  };
  public shared func syncMdm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let c = switch (Map.get(mdmConns, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such connection" } };
    if (mdmBusy) return { ok = false; detail = "a sync is already running" };
    mdmBusy := true;
    let r = try { await mdmSyncOne(c, m.id) } catch (e) { ({ ok = false; detail = Error.message(e) }) };
    mdmBusy := false;
    r;
  };
  func mdmSyncAll() : async () {
    if (mdmBusy) return;
    mdmBusy := true;
    let ids = List.empty<Nat>();
    for ((id, c) in Map.entries(mdmConns)) if (c.enabled) List.add(ids, id);
    for (id in List.values(ids)) { switch (Map.get(mdmConns, Nat.compare, id)) { case (?c) { try { ignore await mdmSyncOne(c, "timer") } catch (_) {} }; case null {} } };
    mdmBusy := false;
  };

  // =====================================================================
  // Apple Business Manager / Apple School Manager (0.8.0): who OWNS which Apple device.
  // ABM is the purchase register Apple keeps for the company — every device bought from
  // Apple or an authorised reseller (or added with Apple Configurator), with the
  // device-management service it is assigned to. An MDM only knows devices enrolled
  // right now; ABM also knows the ones in a drawer, on a shelf, or handed out unmanaged.
  // Auth: OAuth client credentials with an ES256 client assertion. Apple lets an assertion
  // live 180 days, so the admin's BROWSER signs one when the connection is made (WebCrypto,
  // from the .pem Apple issued) and the canister keeps only that assertion — the private key
  // never leaves the admin's machine. (0.8.0 signed in-canister with mo:ecdsa and hit the
  // 40 B instruction limit — IC0522 on the first live call.) Read-only calls:
  //   POST https://account.apple.com/auth/oauth2/token?grant_type=client_credentials&client_id=…&client_assertion_type=…&client_assertion=…&scope=business.api
  //   GET  https://api-business.apple.com/v1/orgDevices?limit=200  (follow links.next)
  //   GET  https://api-business.apple.com/v1/mdmServers · /v1/mdmServers/{id}/relationships/devices
  // (developer.apple.com/documentation/applebusinessapi; SCHOOLAPI clients use api-school.apple.com + school.api)
  // Nothing here ever calls a write endpoint — create the API account in ABM with the smallest role.
  // =====================================================================
  public type AbmConn = { id : Nat; name : Text; clientId : Text; keyId : Text; key : Blob; scope : Text; enabled : Bool; createdAt : Int; lastSync : Int; lastResult : Text; devices : Nat; matched : Nat; unmatched : Nat; noMdm : Nat };
  /// `signedUntil` = expiry of the stored client assertion (ns; 0 = none) — drop the .pem again before then.
  public type AbmView = { id : Nat; name : Text; clientId : Text; keyId : Text; signedUntil : Int; scope : Text; enabled : Bool; createdAt : Int; lastSync : Int; lastResult : Text; devices : Nat; matched : Nat; unmatched : Nat; noMdm : Nat };
  /// The browser-signed client assertion of a connection (side table: the stable AbmConn record cannot grow).
  type AbmAssertion = { jwt : Text; exp : Int; signedAt : Int };
  /// One Apple device as ABM last described it. `status` ASSIGNED/UNASSIGNED refers to a device-management service; `mdmServer` names it.
  public type AbmDevice = { serial : Text; connId : Nat; connName : Text; model : Text; family : Text; productType : Text; capacity : Text; color : Text; orderNo : Text; orderDate : Text; addedAt : Text; source : Text; status : Text; mdmServer : Text; updatedAt : Text; syncedAt : Int };
  public type AbmRow = { device : AbmDevice; assetId : ?Nat; assetTag : Text; assetStatus : Text; assigneeName : Text };
  let abmConns : Map.Map<Nat, AbmConn> = Map.empty<Nat, AbmConn>();
  let abmDevices : Map.Map<Text, AbmDevice> = Map.empty<Text, AbmDevice>(); // normId(serial) → what ABM last said
  let abmAssertions : Map.Map<Nat, AbmAssertion> = Map.empty<Nat, AbmAssertion>(); // connId → assertion
  transient let ABM_ASSERTION_MAX_S : Int = 181 * 86_400; // Apple: exp − iat ≤ 180 days
  transient let ABM_PAGE : Nat = 50;
  transient let ABM_FIELDS : Text = "serialNumber,deviceModel,productFamily,productType,deviceCapacity,color,orderNumber,orderDateTime,addedToOrgDateTime,purchaseSourceType,status,updatedDateTime";
  // 0.8.0 stored the private key itself; 0.8.1 never does — wipe what an upgrade brings along.
  do {
    let withKey = List.empty<AbmConn>();
    for ((_, c) in Map.entries(abmConns)) if (c.key.size() > 0) List.add(withKey, c);
    for (c in List.values(withKey)) Map.add(abmConns, Nat.compare, c.id, { c with key = ("" : Blob) });
  };
  var nextAbmId : Nat = 1;
  transient var abmBusy : Bool = false;
  transient let ABM_TOKEN_URL : Text = "https://account.apple.com/auth/oauth2/token";
  transient let ABM_ASSERTION_AUD : Text = "https://account.apple.com/auth/oauth2/v2/token";

  func abmApi(c : AbmConn) : Text = if (c.scope == "school.api") "https://api-school.apple.com/v1" else "https://api-business.apple.com/v1";
  /// Who still lists this device in Apple's register: "<connection> · <service>" / "<connection>" / "".
  func abmHolds(a : ?Asset) : Text = switch (a) {
    case (?x) { switch (Map.get(abmDevices, Text.compare, normId(x.serial))) { case (?d) (if (d.mdmServer != "") d.connName # " · " # d.mdmServer else d.connName); case null "" } };
    case null "";
  };
  func abmSignedUntil(id : Nat) : Int = switch (Map.get(abmAssertions, Nat.compare, id)) { case (?a) a.exp * 1_000_000_000; case null 0 };
  func abmView(c : AbmConn) : AbmView = { id = c.id; name = c.name; clientId = c.clientId; keyId = c.keyId; signedUntil = abmSignedUntil(c.id); scope = c.scope; enabled = c.enabled; createdAt = c.createdAt; lastSync = c.lastSync; lastResult = c.lastResult; devices = c.devices; matched = c.matched; unmatched = c.unmatched; noMdm = c.noMdm };
  /// "2024-03-12T09:41:00Z" → "2024-03-12"
  func dayOf(iso : Text) : Text { let cs = Text.toArray(iso); if (cs.size() < 10) return norm(iso); Text.fromIter(Array.tabulate<Char>(10, func i = cs[i]).vals()) };
  func b64urlDecode(t : Text) : ?Blob {
    var std = Text.map(t, func(ch : Char) : Char = if (ch == '-') '+' else if (ch == '_') '/' else ch);
    while (std.size() % 4 != 0) std #= "=";
    Base64.decode(std);
  };
  /// Check a browser-signed client assertion for THIS connection: ES256, kid = key id, iss = sub = client id,
  /// Apple's audience, not expired, no longer than Apple allows. Returns its expiry (seconds).
  func abmCheckAssertion(jwt : Text, clientId : Text, keyId : Text) : { #ok : Int; #err : Text } {
    let parts = Text.split(jwt, #char '.').toArray();
    if (parts.size() != 3 or jwt.size() > 4_000) return #err("that is not a signed assertion");
    let header = switch (b64urlDecode(parts[0])) { case (?b) (switch (Text.decodeUtf8(b)) { case (?t) t; case null return #err("assertion header unreadable") }); case null return #err("assertion header unreadable") };
    let payload = switch (b64urlDecode(parts[1])) { case (?b) (switch (Text.decodeUtf8(b)) { case (?t) t; case null return #err("assertion payload unreadable") }); case null return #err("assertion payload unreadable") };
    let h = switch (Json.parse(header)) { case (#ok(j)) j; case (#err(_)) return #err("assertion header is not JSON") };
    let p = switch (Json.parse(payload)) { case (#ok(j)) j; case (#err(_)) return #err("assertion payload is not JSON") };
    if (jStr(h, "alg") != "ES256") return #err("the assertion must be signed with ES256");
    if (jStr(h, "kid") != keyId) return #err("the assertion was signed for key id " # jStr(h, "kid") # ", not " # keyId);
    if (jStr(p, "sub") != clientId or jStr(p, "iss") != clientId) return #err("the assertion names another client id");
    if (jStr(p, "aud") != ABM_ASSERTION_AUD) return #err("the assertion has the wrong audience");
    let nowS = now() / 1_000_000_000;
    let exp = switch (Json.getAsInt(p, "exp")) { case (#ok(e)) e; case (_) return #err("the assertion has no expiry") };
    let iat = switch (Json.getAsInt(p, "iat")) { case (#ok(i)) i; case (_) nowS };
    if (exp <= nowS) return #err("the assertion has already expired — sign a fresh one");
    if (exp - iat > ABM_ASSERTION_MAX_S or exp - nowS > ABM_ASSERTION_MAX_S) return #err("Apple accepts at most 180 days of validity");
    #ok(exp);
  };
  func abmScopeOf(clientId : Text) : Text = if (Text.startsWith(lower(clientId), #text "schoolapi.")) "school.api" else "business.api";
  func abmKindOf(family : Text, productType : Text) : Text {
    let f = lower(family); let p = lower(productType);
    if (f == "iphone" or Text.startsWith(p, #text "iphone")) return "phone";
    if (f == "ipad" or Text.startsWith(p, #text "ipad")) return "tablet";
    if (f == "mac" or Text.startsWith(p, #text "mac")) return (if (Text.contains(p, #text "book")) "laptop" else "other");
    "other";
  };

  /// One-hour bearer token. Apple documents the parameters in the query string of the POST.
  func abmToken(c : AbmConn) : async { ok : Bool; token : Text; detail : Text } {
    let a = switch (Map.get(abmAssertions, Nat.compare, c.id)) { case (?a) a; case null return { ok = false; token = ""; detail = "no signed key for this connection — open Edit and drop the .pem again" } };
    if (a.exp <= now() / 1_000_000_000) return { ok = false; token = ""; detail = "the signed key expired on " # isoFromDays(a.exp / 86_400) # " — open Edit and drop the .pem again" };
    let assertion = a.jwt;
    let fields : [(Text, Text)] = [("grant_type", "client_credentials"), ("client_id", c.clientId), ("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"), ("client_assertion", assertion), ("scope", c.scope)];
    var q = "";
    for ((k, v) in fields.vals()) q #= (if (q == "") "" else "&") # urlEnc(k) # "=" # urlEnc(v);
    let r = await fetch(#post, ABM_TOKEN_URL # "?" # q, [{ name = "Content-Type"; value = "application/x-www-form-urlencoded" }, { name = "Accept"; value = "application/json" }], ?"");
    if (not r.ok) return { ok = false; token = ""; detail = "token: " # r.detail };
    switch (Json.parse(r.body)) {
      case (#ok(j)) { let t = jStr(j, "access_token"); if (t == "") ({ ok = false; token = ""; detail = "token answer without access_token" }) else ({ ok = true; token = t; detail = "" }) };
      case (#err(_)) ({ ok = false; token = ""; detail = "token answer was not JSON" });
    };
  };
  func abmGet(token : Text, url : Text) : async Fetched = async { await fetch(#get, url, [{ name = "Authorization"; value = "Bearer " # token }, { name = "Accept"; value = "application/json" }], null) };

  /// Every device ABM knows for this connection, with the name of the device-management service that holds it.
  func abmPull(c : AbmConn, token : Text, onePage : Bool) : async { ok : Bool; detail : Text; devices : [AbmDevice]; servers : Nat } {
    let out = List.empty<AbmDevice>();
    // Small pages on purpose: mo:json's parser is quadratic in the body size — 200 of Apple's
    // pretty-printed devices (320 KB) cost ~30 B instructions and hit IC0522 live; 50 devices with a
    // sparse fieldset stay far below. If Apple rejects the fieldset, the plain request is retried once.
    var url = abmApi(c) # "/orgDevices?limit=" # Nat.toText(ABM_PAGE) # "&fields%5BorgDevices%5D=" # ABM_FIELDS;
    var pages = 0;
    var plainRetried = false;
    while (url != "" and pages < 400) {
      pages += 1;
      let r = await abmGet(token, url);
      if (not r.ok and r.status == 400 and not plainRetried and pages == 1) { plainRetried := true; pages := 0; url := abmApi(c) # "/orgDevices?limit=" # Nat.toText(ABM_PAGE) } else {
      if (not r.ok) return { ok = false; detail = "orgDevices: " # r.detail; devices = []; servers = 0 };
      let j = switch (Json.parse(r.body)) { case (#ok(j)) j; case (#err(_)) return { ok = false; detail = "orgDevices: the answer was not JSON"; devices = []; servers = 0 } };
      for (d in jArr(j, "data").vals()) {
        let sn = do { let s = norm(jStr(d, "attributes.serialNumber")); if (s != "") s else norm(jStr(d, "id")) };
        if (sn != "") List.add(out, {
          serial = capText(sn, 40); connId = c.id; connName = c.name;
          model = capText(jStr(d, "attributes.deviceModel"), 80); family = capText(jStr(d, "attributes.productFamily"), 20); productType = capText(jStr(d, "attributes.productType"), 40);
          capacity = capText(jStr(d, "attributes.deviceCapacity"), 20); color = capText(jStr(d, "attributes.color"), 30);
          orderNo = capText(jStr(d, "attributes.orderNumber"), 40); orderDate = dayOf(jStr(d, "attributes.orderDateTime")); addedAt = dayOf(jStr(d, "attributes.addedToOrgDateTime"));
          source = capText(jStr(d, "attributes.purchaseSourceType"), 20); status = capText(jStr(d, "attributes.status"), 20); mdmServer = ""; updatedAt = dayOf(jStr(d, "attributes.updatedDateTime")); syncedAt = now();
        });
      };
      url := if (onePage) "" else jStr(j, "links.next");
      };
    };
    if (onePage) return { ok = true; detail = ""; devices = List.toArray(out); servers = 0 };
    // which device-management service holds which serial (a handful of services, one list each)
    let holder = Map.empty<Text, Text>();
    var servers = 0;
    let sr = await abmGet(token, abmApi(c) # "/mdmServers?limit=100");
    if (sr.ok) {
      switch (Json.parse(sr.body)) {
        case (#ok(sj)) {
          for (s in jArr(sj, "data").vals()) {
            let sid = jStr(s, "id"); let sname = capText(jStr(s, "attributes.serverName"), 60);
            if (sid != "") {
              servers += 1;
              var durl = abmApi(c) # "/mdmServers/" # urlEnc(sid) # "/relationships/devices?limit=500";
              var dp = 0;
              while (durl != "" and dp < 400) {
                dp += 1;
                let dr = await abmGet(token, durl);
                if (not dr.ok) { durl := "" } else {
                  switch (Json.parse(dr.body)) {
                    case (#ok(dj)) { for (x in jArr(dj, "data").vals()) { let id = normId(jStr(x, "id")); if (id != "") Map.add(holder, Text.compare, id, (if (sname != "") sname else sid)) }; durl := jStr(dj, "links.next") };
                    case (#err(_)) durl := "";
                  };
                };
              };
            };
          };
        };
        case (#err(_)) {};
      };
    };
    let devices = Array.map<AbmDevice, AbmDevice>(List.toArray(out), func d = { d with mdmServer = (switch (Map.get(holder, Text.compare, normId(d.serial))) { case (?n) n; case null "" }) });
    { ok = true; detail = ""; devices; servers };
  };

  func abmSyncOne(c : AbmConn, by : Text) : async { ok : Bool; detail : Text } {
    let t = await abmToken(c);
    if (not t.ok) { Map.add(abmConns, Nat.compare, c.id, { c with lastSync = now(); lastResult = "FAILED: " # t.detail }); return { ok = false; detail = t.detail } };
    let p = await abmPull(c, t.token, false);
    if (not p.ok) { Map.add(abmConns, Nat.compare, c.id, { c with lastSync = now(); lastResult = "FAILED: " # p.detail }); return { ok = false; detail = p.detail } };
    // this connection's picture is replaced whole; devices released from ABM disappear
    let stale = List.empty<Text>();
    for ((k, d) in Map.entries(abmDevices)) if (d.connId == c.id) List.add(stale, k);
    for (k in List.values(stale)) ignore Map.delete(abmDevices, Text.compare, k);
    var matched = 0; var unmatched = 0; var noMdm = 0;
    for (d in p.devices.vals()) {
      Map.add(abmDevices, Text.compare, normId(d.serial), d);
      switch (findBySerial(d.serial)) { case (?_) matched += 1; case null unmatched += 1 };
      if (d.mdmServer == "") noMdm += 1;
    };
    let detail = Nat.toText(p.devices.size()) # " devices · " # Nat.toText(matched) # " in the register · " # Nat.toText(unmatched) # " not in the register · " # Nat.toText(noMdm) # " without a device-management service · " # Nat.toText(p.servers) # (if (p.servers == 1) " service" else " services");
    Map.add(abmConns, Nat.compare, c.id, { c with lastSync = now(); lastResult = detail; devices = p.devices.size(); matched; unmatched; noMdm });
    log(by, "Apple Business Manager sync " # c.name # ": " # detail);
    { ok = true; detail };
  };
  func abmSyncAll() : async () {
    if (abmBusy) return;
    abmBusy := true;
    let ids = List.empty<Nat>();
    for ((id, c) in Map.entries(abmConns)) if (c.enabled) List.add(ids, id);
    for (id in List.values(ids)) { switch (Map.get(abmConns, Nat.compare, id)) { case (?c) { try { ignore await abmSyncOne(c, "timer") } catch (_) {} }; case null {} } };
    abmBusy := false;
  };

  /// Admins: the Apple Business Manager connections (keys never leave the canister).
  public shared query func listAbm(tok : Text) : async [AbmView] {
    switch (admin(tok)) { case null []; case (?_) { let out = List.empty<AbmView>(); for ((_, c) in Map.entries(abmConns)) List.add(out, abmView(c)); List.toArray(out) } };
  };
  /// Admins: connect an ABM/ASM organisation — client id (BUSINESSAPI.… or SCHOOLAPI.…), the key id shown next to the key,
  /// and the client assertion the browser signed from the downloaded .pem (the key itself never arrives here).
  public shared func addAbm(tok : Text, args : { name : Text; clientId : Text; keyId : Text; assertion : ?Text }) : async { ok : Bool; detail : Text; id : Nat } {
    if (migrating()) return { ok = false; detail = MIGRATING; id = 0 };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; id = 0 } };
    if (Map.size(abmConns) >= 5) return { ok = false; detail = "max 5 connections"; id = 0 };
    let clientId = norm(args.clientId);
    if (not (Text.startsWith(lower(clientId), #text "businessapi.") or Text.startsWith(lower(clientId), #text "schoolapi.")) or clientId.size() > 80) return { ok = false; detail = "the client id starts with BUSINESSAPI. (or SCHOOLAPI.) — Apple Business Manager → Preferences → API"; id = 0 };
    let keyId = norm(args.keyId);
    if (keyId == "" or keyId.size() > 80) return { ok = false; detail = "the key id is shown next to the key in Apple Business Manager"; id = 0 };
    let jwt = switch (args.assertion) { case (?a) norm(a); case null "" };
    if (jwt == "") return { ok = false; detail = "drop the .pem first — the browser signs the assertion, the key stays with you"; id = 0 };
    let exp = switch (abmCheckAssertion(jwt, clientId, keyId)) { case (#ok(e)) e; case (#err(d)) return { ok = false; detail = d; id = 0 } };
    let id = nextAbmId; nextAbmId += 1;
    let name = if (norm(args.name) == "") "Apple Business Manager" else capText(norm(args.name), 40);
    Map.add(abmConns, Nat.compare, id, { id; name; clientId; keyId; key = ("" : Blob); scope = abmScopeOf(clientId); enabled = true; createdAt = now(); lastSync = 0; lastResult = ""; devices = 0; matched = 0; unmatched = 0; noMdm = 0 });
    Map.add(abmAssertions, Nat.compare, id, { jwt; exp; signedAt = now() });
    log(m.id, "Apple Business Manager connection added: " # name);
    { ok = true; detail = ""; id };
  };
  /// Admins: rename, renew the signed assertion (null keeps the stored one), pause or resume.
  public shared func updateAbm(tok : Text, id : Nat, args : { name : Text; clientId : Text; keyId : Text; assertion : ?Text; enabled : Bool }) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let c = switch (Map.get(abmConns, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such connection" } };
    let clientId = if (norm(args.clientId) == "") c.clientId else norm(args.clientId);
    if (not (Text.startsWith(lower(clientId), #text "businessapi.") or Text.startsWith(lower(clientId), #text "schoolapi.")) or clientId.size() > 80) return { ok = false; detail = "the client id starts with BUSINESSAPI. (or SCHOOLAPI.)" };
    let keyId = if (norm(args.keyId) == "") c.keyId else capText(norm(args.keyId), 80);
    switch (args.assertion) {
      case (?a) {
        if (norm(a) != "") {
          switch (abmCheckAssertion(norm(a), clientId, keyId)) {
            case (#ok(exp)) Map.add(abmAssertions, Nat.compare, id, { jwt = norm(a); exp; signedAt = now() });
            case (#err(d)) return { ok = false; detail = d };
          };
        };
      };
      case null { if (clientId != c.clientId or keyId != c.keyId) return { ok = false; detail = "a new client id or key id needs a freshly signed assertion — drop the .pem again" } };
    };
    Map.add(abmConns, Nat.compare, id, { c with name = (if (norm(args.name) == "") c.name else capText(norm(args.name), 40)); clientId; keyId; key = ("" : Blob); scope = abmScopeOf(clientId); enabled = args.enabled });
    log(m.id, "Apple Business Manager connection updated: " # c.name);
    { ok = true; detail = "" };
  };
  /// Admins: remove the connection and what it reported; devices already in the register stay.
  public shared func removeAbm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    switch (Map.get(abmConns, Nat.compare, id)) {
      case (?c) {
        ignore Map.delete(abmConns, Nat.compare, id);
        ignore Map.delete(abmAssertions, Nat.compare, id);
        let stale = List.empty<Text>();
        for ((k, d) in Map.entries(abmDevices)) if (d.connId == id) List.add(stale, k);
        for (k in List.values(stale)) ignore Map.delete(abmDevices, Text.compare, k);
        log(m.id, "Apple Business Manager connection removed: " # c.name);
        { ok = true; detail = "devices already in the register stay" };
      };
      case null ({ ok = false; detail = "no such connection" });
    };
  };
  /// Admins: sign, fetch a token, read the first page — proves key, id and role without changing anything.
  public shared func testAbm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let _ = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let c = switch (Map.get(abmConns, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such connection" } };
    let t = await abmToken(c);
    if (not t.ok) return { ok = false; detail = t.detail };
    let p = await abmPull(c, t.token, true);
    if (not p.ok) return { ok = false; detail = p.detail };
    var known = 0;
    for (d in p.devices.vals()) switch (findBySerial(d.serial)) { case (?_) known += 1; case null {} };
    { ok = true; detail = "reached " # c.name # ": " # Nat.toText(p.devices.size()) # " devices on the first page, " # Nat.toText(known) # " already in the register" };
  };
  /// Admins: sync now (the timer does it every 6 hours).
  public shared func syncAbm(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let c = switch (Map.get(abmConns, Nat.compare, id)) { case (?c) c; case null return { ok = false; detail = "no such connection" } };
    if (abmBusy) return { ok = false; detail = "a sync is already running" };
    abmBusy := true;
    let r = try { await abmSyncOne(c, m.id) } catch (e) { ({ ok = false; detail = Error.message(e) }) };
    abmBusy := false;
    r;
  };
  /// Admins: what ABM knows, joined with the register by serial. filter: all · matched · unmatched · nomdm · sold (gone from the company but still in Apple's register — release them there); conn 0 = every connection.
  public shared query func listAbmDevices(tok : Text, filter : Text, conn : Nat) : async [AbmRow] {
    switch (admin(tok)) { case null return []; case (?_) {} };
    let out = List.empty<AbmRow>();
    for ((_, d) in Map.entries(abmDevices)) {
      if (conn == 0 or d.connId == conn) {
        let a = findBySerial(d.serial);
        let keep = switch (filter) { case "matched" a != null; case "unmatched" a == null; case "nomdm" d.mdmServer == ""; case "sold" (switch (a) { case (?x) x.status == "sold" or x.status == "scrapped" or x.status == "lost"; case null false }); case (_) true };
        if (keep and List.size(out) < 5000) List.add(out, { device = d; assetId = (switch (a) { case (?x) ?x.id; case null null }); assetTag = (switch (a) { case (?x) x.tag; case null "" }); assetStatus = (switch (a) { case (?x) x.status; case null "" }); assigneeName = (switch (a) { case (?x) (if (x.assignee == "") "" else nameOf(x.assignee)); case null "" }) });
      };
    };
    Array.sort<AbmRow>(List.toArray(out), func(x, y) = switch (Text.compare(y.device.orderDate, x.device.orderDate)) { case (#equal) Text.compare(x.device.serial, y.device.serial); case o o });
  };
  /// Admins: take ABM devices into the register — status unknown (nobody has seen them), vendor Apple, model from ABM, order details in the history. Serials already in the register are skipped; an MDM sync later links them by serial.
  public shared func abmAdopt(tok : Text, serials : [Text]) : async { ok : Bool; detail : Text; created : Nat } {
    if (migrating()) return { ok = false; detail = MIGRATING; created = 0 };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; created = 0 } };
    if (serials.size() > 2000) return { ok = false; detail = "max 2000 at a time"; created = 0 };
    var created = 0; var skipped = 0;
    for (s in serials.vals()) {
      switch (Map.get(abmDevices, Text.compare, normId(s))) {
        case (?d) {
          switch (findBySerial(d.serial)) {
            case (?_) skipped += 1;
            case null {
              let model = if (d.model != "") d.model # (if (d.capacity != "") " " # d.capacity else "") else d.productType;
              let x : AssetInput = { tag = ""; serial = d.serial; vendor = "Apple"; model = capText(model, 80); kind = abmKindOf(d.family, d.productType); note = "from " # d.connName # ", not seen by any device-management service" };
              let a = createInternal(m.id, x, "unknown", "", "", "abm:" # d.connName);
              let bits = List.empty<Text>();
              if (d.orderDate != "") List.add(bits, "ordered " # d.orderDate);
              if (d.orderNo != "") List.add(bits, "order " # d.orderNo);
              if (d.source != "") List.add(bits, "via " # lower(d.source));
              if (d.color != "") List.add(bits, d.color);
              if (List.size(bits) > 0) ignore addEvent(a.id, m.id, "note", "Apple Business Manager: " # Text.join(List.values(bits), " · "), "", 0);
              created += 1;
            };
          };
        };
        case null skipped += 1;
      };
    };
    log(m.id, "Apple Business Manager: " # Nat.toText(created) # " devices taken into the register");
    { ok = true; detail = Nat.toText(created) # " added" # (if (skipped > 0) " · " # Nat.toText(skipped) # " skipped (already in the register or unknown to ABM)" else ""); created };
  };

  // =====================================================================
  // selling devices (0.7.0): an offer to a buyer, their online acceptance of the hand-over
  // terms, a numbered invoice with a Swiss QR-bill (SIX IG 2.3, structured addresses, SCOR
  // reference), archived as issued. The register is the record and the number range; the
  // company's books stay with finance (sales export). Nothing here reconciles payments.
  // =====================================================================
  /// Company details on the invoice and the payment part. Structured address (QR-bill IG 2.3, address type S).
  public type Billing = {
    legalName : Text; street : Text; houseNo : Text; postalCode : Text; town : Text; country : Text; // ISO 3166 alpha-2, e.g. CH
    uid : Text; // e.g. CHE-123.456.789 (printed with "MWST" when VAT-registered)
    vatRegistered : Bool;
    vatRateBp : Nat; // basis points: 810 = 8.1 %
    iban : Text; // normal creditor account, CH/LI; SCOR cannot be used with a QR-IBAN
    currency : Text; // CHF | EUR
    prefix : Text; // invoice number prefix, e.g. "IT-"
    yearInNumber : Bool; // IT-2026-0001 (counter per year) instead of IT-0001
    paymentDays : Nat; // due date = issue date + days
    lang : Text; // language of the payment part: en | de | fr | it
    depreciationMonths : Nat; // pricing rule: linear over this many months …
    floorPct : Nat; // … never below this share of the purchase price …
    minPriceMinor : Nat; // … and never below this amount (minor units)
    waiverText : Text; // page 2 of the invoice — the hand-over terms the buyer accepts online
    waiverVersion : Nat; // grows whenever the text changes; an acceptance names the version it was given for
    footer : Text; // a closing line on the invoice
  };
  transient let DEFAULT_WAIVER : Text = "The buyer takes over the device named on this invoice as used equipment, in the condition inspected at hand-over. The company gives no warranty and excludes liability for defects as far as the law allows; a manufacturer's warranty that is still running is not affected by this sale. Before hand-over the device was wiped and removed from the company's device management; from now on the buyer is responsible for setting it up and for everything on it. Company software licences and accounts do not transfer with the device. The price is due by the date on the invoice. Accepting these terms online with the company sign-in counts as the buyer's signature.";
  var billing : Billing = { legalName = ""; street = ""; houseNo = ""; postalCode = ""; town = ""; country = "CH"; uid = ""; vatRegistered = true; vatRateBp = 810; iban = ""; currency = "CHF"; prefix = "IT-"; yearInNumber = true; paymentDays = 14; lang = "en"; depreciationMonths = 36; floorPct = 10; minPriceMinor = 5000; waiverText = DEFAULT_WAIVER; waiverVersion = 1; footer = "" };

  /// What the company paid for a device — the basis of the price proposal. date = YYYY-MM-DD.
  public type Purchase = { priceMinor : Nat; currency : Text; date : Text; note : Text; by : Text; at : Int };
  let purchases : Map.Map<Nat, Purchase> = Map.empty<Nat, Purchase>(); // assetId → purchase

  /// The buyer: a colleague (pid from the directory; name/e-mail follow the directory) or an outside party (pid ""). The address is on the invoice only — never in the directory.
  public type Buyer = { pid : Text; name : Text; email : Text; street : Text; houseNo : Text; postalCode : Text; town : Text; country : Text };
  /// status: draft → offered → accepted → issued → paid; cancelled from any state (after issue: with a numbered credit note).
  public type Sale = {
    id : Nat; assetId : Nat; status : Text; buyer : Buyer;
    grossMinor : Nat; vatRateBp : Nat; netMinor : Nat; vatMinor : Nat; currency : Text;
    proposedMinor : ?Nat; priceNote : Text; description : Text;
    wiped : Bool; mdmRemoved : Bool; checksBy : Text;
    waiverVersion : Nat; acceptedBy : Text; acceptedAt : Int; acceptedHow : Text; // online (buyer's own session) | paper (recorded by staff) | ""
    invoiceNo : Text; issuedAt : Int; issuedOn : Text; dueOn : Text; reference : Text; // SCOR (ISO 11649) from the invoice number
    pdfId : Nat; pdfHash : Text;
    paidAt : Int; paidNote : Text;
    creditNoteNo : Text; cancelledAt : Int; cancelReason : Text; creditPdfId : Nat;
    createdBy : Text; createdAt : Int; updatedAt : Int;
  };
  type SaleDoc = { id : Nat; saleId : Nat; kind : Text; name : Text; bytes : Blob; hash : Text; at : Int; by : Text }; // kind: invoice | creditNote
  let sales : Map.Map<Nat, Sale> = Map.empty<Nat, Sale>();
  let saleDocs : Map.Map<Nat, SaleDoc> = Map.empty<Nat, SaleDoc>();
  let invoiceCounters : Map.Map<Text, Nat> = Map.empty<Text, Nat>(); // "2026" (or "" without year) → last number handed out
  var nextSaleId : Nat = 1;
  var nextSaleDocId : Nat = 1;
  var saleDocBytes : Nat = 0;
  transient let MAX_SALE_DOC : Nat = 1_500_000;
  transient let MAX_SALE_DOC_TOTAL : Nat = 200_000_000;
  transient let _SALE_STATUSES : [Text] = ["draft", "offered", "accepted", "issued", "paid", "cancelled"];
  transient let LANGS : [Text] = ["en", "de", "fr", "it"];

  // External dealrooms: sale-scoped bearer capabilities. Raw keys are returned once, never stored.
  type Deal = { keyHash : Text; expiresAt : Int; revoked : Bool; generation : Nat; quote : Text; openedAt : Int; downloadedAt : Int; completedAt : Int; handedOverAt : Int; notifyEmail : Text };
  public type DealEvent = { at : Int; actorLabel : Text; action : Text; detail : Text };
  type DealNotice = { saleId : Nat; email : Text; title : Text; attempts : Nat; nextAt : Int; detail : Text };
  let deals : Map.Map<Nat, Deal> = Map.empty();
  let dealEvents : Map.Map<Nat, [DealEvent]> = Map.empty();
  let dealNotices : Map.Map<Text, DealNotice> = Map.empty();
  let invoiceSnapshots : Map.Map<Nat, InvoiceData> = Map.empty();
  transient var dealNoticeBusy = false;
  let dealDevices : Map.Map<Nat, { name : Text; serial : Text }> = Map.empty();
  func quoteHash(s : Sale) : Text {
    let device = switch (assets.get(s.assetId)) { case (?a) (a.id, a.serial, a.vendor, a.model, a.tag); case null (s.assetId, "", "", "", "") };
    hex(Sha256.fromBlob(#sha256, to_candid(s.buyer, s.grossMinor, s.currency, s.vatRateBp, s.description, device, billing)));
  };
  func externalLabel(s : Sale) : Text = s.buyer.name # " (external dealroom link)";
  func dealAudit(s : Sale, actorLabel : Text, action : Text, detail : Text) {
    let row : DealEvent = { at = now(); actorLabel; action; detail };
    let prior = dealsHistory(s.id);
    dealEvents.add(s.id, prior.concat([row]));
    saleEvent(s, actorLabel, detail); log(actorLabel, "sale #" # s.id.toText() # ": " # detail);
  };
  func dealsHistory(id : Nat) : [DealEvent] = dealEvents.get(id) ?? [];
  func dealKey(id : Nat, key : Text) : ?Deal {
    if (key.size() != 64) return null;
    for (c in key.chars()) if (not ((c >= '0' and c <= '9') or (c >= 'a' and c <= 'f'))) return null;
    let d = deals.get(id) ?? (return null);
    if (d.revoked or now() >= d.expiresAt or d.keyHash != hex(Sha256.fromBlob(#sha256, Text.encodeUtf8(key)))) return null;
    let s = sales.get(id) ?? (return null);
    if (s.buyer.pid != "" and not formerDealContacts.containsKey(id)) return null;
    ?d;
  };
  func invalidateDeal(s : Sale, who : Text) {
    switch (deals.get(s.id)) { case (?d) { if (not d.revoked) { deals.add(s.id, { d with revoked = true }); dealAudit(s, who, "revoked", "Dealroom access revoked") } }; case null {} };
  };
  func externalTerms() : Text = Text.replace(billing.waiverText, #text "Accepting these terms online with the company sign-in counts as the buyer's signature.", "Your acceptance through this private dealroom link is recorded with the offer, terms version and timestamp.");
  func queueDealNotice(s : Sale, kind : Text, title : Text) {
    let d = deals.get(s.id) ?? (return);
    let key = "deal-" # s.id.toText() # "-" # kind;
    dealNotices.add(key, { saleId = s.id; email = d.notifyEmail; title; attempts = 0; nextAt = 0; detail = "pending" });
  };
  func sendDealNotices() : async () {
    if (dealNoticeBusy or hubId == "") return;
    dealNoticeBusy := true;
    try {
      var sent = 0;
      for ((key, row) in Iter.toArray(Map.entries(dealNotices)).values()) {
        if (sent >= 3) break;
        if (row.nextAt <= now()) {
          sent += 1;
          let detail = await notifyPerson(row.email, row.title, appLink("sale/" # row.saleId.toText()), "assets.dealroom", key);
          if (detail == "") { dealNotices.remove(key) }
          else { dealNotices.add(key, { row with attempts = row.attempts + 1; nextAt = now() + 300_000_000_000; detail = capText(detail, 300) }) };
        };
      };
    } finally { dealNoticeBusy := false };
  };
  public type DealStatus = { exists : Bool; active : Bool; expiresAt : Int; generation : Nat; openedAt : Int; downloadedAt : Int; completedAt : Int; handedOverAt : Int; history : [DealEvent]; notification : Text };
  public shared query func dealStatus(tok : Text, id : Nat) : async ?DealStatus {
    if (admin(tok) == null) return null;
    var notice = ""; for ((_, n) in dealNotices.entries()) if (n.saleId == id) notice #= n.title # ": " # n.detail # ". ";
    switch (deals.get(id)) {
      case null ?{ exists = false; active = false; expiresAt = 0; generation = 0; openedAt = 0; downloadedAt = 0; completedAt = 0; handedOverAt = 0; history = []; notification = notice };
      case (?d) ?{ exists = true; active = not d.revoked and now() < d.expiresAt; expiresAt = d.expiresAt; generation = d.generation; openedAt = d.openedAt; downloadedAt = d.downloadedAt; completedAt = d.completedAt; handedOverAt = d.handedOverAt; history = dealsHistory(id); notification = notice };
    };
  };
  public shared query func formerBuyerStatus(tok : Text, id : Nat) : async ?{ eligible : Bool; privateEmail : Text; person : Text } {
    if (admin(tok) == null) return null;
    let s = sales.get(id) ?? (return null);
    let person = if (s.buyer.pid != "") s.buyer.pid else formerBuyer.get(id) ?? "";
    ?{ eligible = (s.buyer.pid != "" or formerDealContacts.containsKey(id)) and person != "" and not Hub.isActiveId(people, ids, person) and s.status != "cancelled"; privateEmail = formerDealContacts.get(id) ?? ""; person };
  };
  public shared func continueFormerBuyerSale(tok : Text, id : Nat, privateEmail : Text) : async { ok : Bool; detail : Text } {
    func fail(t : Text) : { ok : Bool; detail : Text } = { ok = false; detail = t };
    if (migrating()) return fail(MIGRATING);
    if (admin(tok) == null) return fail("Admins only");
    let initial = sales.get(id) ?? (return fail("Sale unavailable"));
    let p = handovers.get(initial.assetId) ?? (return fail("Confirm the offboarding in Desk first"));
    if (initial.buyer.pid != p.person and (not formerDealContacts.containsKey(id) or formerBuyer.get(id) != ?p.person)) return fail("The buyer is not the person in this offboarding");
    if (Hub.isActiveId(people, ids, p.person)) return fail("This person still has an active company account");
    let email = lower(norm(privateEmail));
    if (email.size() > 254 or not Text.contains(email, #char '@') or Text.contains(email, #char ' ') or Text.contains(email, #char '\n') or Text.contains(email, #char '\r') or email == lower(emailOfPid(p.person))) return fail("Enter a reachable private email address, not the former work address");
    if (not (await currentHardwareCase(tok, p))) return fail("The offboarding is paused, changed or unavailable");
    let m = admin(tok) ?? (return fail("Your admin session expired"));
    let s = sales.get(id) ?? (return fail("Sale unavailable"));
    if (s != initial or Hub.isActiveId(people, ids, p.person) or s.status == "cancelled" or handedOverAt(id) != 0) return fail("The sale or account changed. Refresh before continuing.");
    invalidateDeal(s, m.displayName);
    formerBuyer.add(id, p.person); formerDealContacts.add(id, email); formerContactExpires.add(id, now() + 14 * 86_400_000_000_000);
    if (s.invoiceNo == "") putSale({ s with buyer = { s.buyer with pid = ""; email }; status = "draft"; acceptedAt = 0; acceptedHow = ""; acceptedBy = "" });
    handovers.add(p.assetId, { p with choice = "sale"; saleId = id; revision = p.revision + 1; updatedAt = now() });
    dealAudit(s, m.displayName, "former_buyer", "Private access prepared for the former colleague; " # (if (s.invoiceNo == "") "fresh acceptance required" else "issued invoice and original acceptance preserved"));
    { ok = true; detail = "Private contact saved. Create a dealroom link and send it to the buyer." };
  };

  public shared func createDealLink(tok : Text, id : Nat) : async { ok : Bool; detail : Text; url : Text; expiresAt : Int } {
    func fail(t : Text) : { ok : Bool; detail : Text; url : Text; expiresAt : Int } = { ok = false; detail = t; url = ""; expiresAt = 0 };
    let m = admin(tok) ?? (return fail("admins only"));
    if (migrating()) return fail(MIGRATING);
    let s = sales.get(id) ?? (return fail("no such sale"));
    if ((s.buyer.pid != "" and not formerDealContacts.containsKey(id)) or s.status == "cancelled") return fail("a dealroom is for an outside buyer on an active sale");
    let base = Text.trimEnd(norm(appUrl), #char '/');
    if (not Text.startsWith(base, #text "https://") or Text.contains(base, #char '#') or Text.contains(base, #char '?')) return fail("set the Assets HTTPS App address first");
    let host = Text.stripStart(base, #text "https://") ?? "";
    if (host == "" or not Text.contains(host, #char '.')) return fail("App address must be an HTTPS origin");
    for (ch in host.chars()) if (not ((ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or (ch >= '0' and ch <= '9') or ch == '-' or ch == '.')) return fail("App address must be an HTTPS origin without a path or user information");
    let buyerContact = formerDealContacts.get(id) ?? s.buyer.email;
    if (buyerContact.size() > 254 or not Text.contains(buyerContact, #char '@')) return fail("enter the outside buyer's email first");
    if (s.invoiceNo == "") { switch (billingReady()) { case (?e) return fail(e); case null {} } };
    let formerContact = formerDealContacts.get(id);
    let previousDeal = deals.get(id);
    let generation = (switch (previousDeal) { case (?d) d.generation; case null 0 });
    let quoted = quoteHash(s);
    let random = try { await ic00.raw_rand() } catch (_) { return fail("could not create a secure link — retry") };
    // Authorisation, sale and existing generation must still match after randomness arrives.
    let currentAdmin = admin(tok) ?? (return fail("your admin session expired"));
    let current = sales.get(id) ?? (return fail("the sale was removed"));
    let currentGeneration = switch (deals.get(id)) { case (?d) d.generation; case null 0 };
    if (currentAdmin.id != m.id or current != s or quoteHash(current) != quoted or generation != currentGeneration or deals.get(id) != previousDeal or formerDealContacts.get(id) != formerContact) return fail("the sale changed — reopen it and retry");
    if (random.size() != 32) return fail("could not create a secure link — retry");
    let key = hex(random); let expiresAt = now() + 14 * 86_400_000_000_000;
    let prior = deals.get(id);
    let d : Deal = { keyHash = hex(Sha256.fromBlob(#sha256, Text.encodeUtf8(key))); expiresAt; revoked = false; generation = generation + 1; quote = quoted; openedAt = 0; downloadedAt = (switch (prior) { case (?p) p.downloadedAt; case null 0 }); completedAt = (switch (prior) { case (?p) p.completedAt; case null 0 }); handedOverAt = (switch (prior) { case (?p) p.handedOverAt; case null 0 }); notifyEmail = m.email };
    deals.add(id, d);
    if (formerContact != null) formerContactExpires.add(id, expiresAt);
    if (s.invoiceNo == "") putSale({ s with status = "offered"; acceptedHow = ""; acceptedBy = ""; acceptedAt = 0; waiverVersion = billing.waiverVersion });
    dealAudit(s, m.displayName, "link_created", "Private dealroom link " # (generation + 1).toText() # " created; valid for 14 days; previous link replaced");
    { ok = true; detail = "Copy the link now. Only its hash is stored; creating another link invalidates this one."; url = base # "/deal.html#" # id.toText() # "." # key; expiresAt };
  };
  public shared func revokeDealLink(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let m = admin(tok) ?? (return { ok = false; detail = "admins only" });
    let s = sales.get(id) ?? (return { ok = false; detail = "no such sale" });
    invalidateDeal(s, m.displayName); { ok = true; detail = "link revoked" };
  };
  public type DealView = { id : Nat; status : Text; buyer : Buyer; sellerName : Text; device : Text; serial : Text; description : Text; grossMinor : Nat; currency : Text; vatRate : Text; terms : Text; termsVersion : Nat; quote : Text; acceptedAt : Int; acceptedHow : Text; invoice : ?InvoiceData; pdfReady : Bool; pdfHash : Text; completedAt : Int; paidAt : Int; handedOverAt : Int; expiresAt : Int; changed : Bool };
  public shared query func getDeal(id : Nat, key : Text) : async ?DealView {
    let d = dealKey(id, key) ?? (return null); let s = sales.get(id) ?? (return null);
    let a = assets.get(s.assetId) ?? (return null);
    let inv = if (s.invoiceNo == "") null else ?invoiceData(s, "invoice");
    let device = dealDevices.get(id) ?? ({ name = deviceName(a); serial = a.serial });
    ?{ id; status = s.status; buyer = s.buyer; sellerName = (switch (inv) { case (?i) i.seller.name; case null billing.legalName }); device = device.name; serial = device.serial; description = s.description; grossMinor = s.grossMinor; currency = s.currency; vatRate = vatRateText(s.vatRateBp); terms = (switch (inv) { case (?i) i.waiverText; case null externalTerms() }); termsVersion = s.waiverVersion; quote = d.quote; acceptedAt = s.acceptedAt; acceptedHow = s.acceptedHow; invoice = inv; pdfReady = s.pdfId != 0; pdfHash = s.pdfHash; completedAt = d.completedAt; paidAt = s.paidAt; handedOverAt = d.handedOverAt; expiresAt = d.expiresAt; changed = s.invoiceNo == "" and d.quote != quoteHash(s) };
  };
  public shared func visitDeal(id : Nat, key : Text) : async Bool {
    let d = dealKey(id, key) ?? (return false); let s = sales.get(id) ?? (return false);
    if (d.openedAt == 0) { deals.add(id, { d with openedAt = now() }); dealAudit(s, externalLabel(s), "opened", "Dealroom opened using the private link") }; true;
  };
  public shared func acceptDeal(id : Nat, key : Text, quoted : Text, address : { street : Text; houseNo : Text; postalCode : Text; town : Text; country : Text }) : async { ok : Bool; detail : Text } {
    let d = dealKey(id, key) ?? (return { ok = false; detail = "this link is unavailable or expired" });
    let s = sales.get(id) ?? (return { ok = false; detail = "this link is unavailable or expired" });
    if (s.invoiceNo != "" and s.acceptedHow == "dealroom") return { ok = s.status != "cancelled"; detail = "already accepted" };
    if (s.status != "offered") return { ok = false; detail = "this offer is no longer awaiting acceptance" };
    if (d.quote != quoted or d.quote != quoteHash(s)) return { ok = false; detail = "the offer changed — ask the seller for a new link" };
    if (address.street.size() > 70 or address.houseNo.size() > 16 or address.postalCode.size() > 16 or address.town.size() > 35 or address.country.size() != 2) return { ok = false; detail = "please check the address lengths and two-letter country" };
    let buyer = cleanBuyer({ s.buyer with street = address.street; houseNo = address.houseNo; postalCode = address.postalCode; town = address.town; country = address.country });
    if (not addressComplete(buyer.name, buyer.street, buyer.postalCode, buyer.town, buyer.country)) return { ok = false; detail = "complete your postal address for the invoice" };
    let a = assets.get(s.assetId) ?? (return { ok = false; detail = "device unavailable" });
    if (a.archived or a.status == "sold" or a.status == "scrapped" or a.status == "lost") return { ok = false; detail = "device unavailable — contact the seller" };
    switch (billingReady()) { case (?e) return { ok = false; detail = e }; case null {} };
    if (saleDocBytes + MAX_SALE_DOC > MAX_SALE_DOC_TOTAL) return { ok = false; detail = "document storage is full — contact the seller" };
    // No awaits until the number, acceptance, immutable invoice and exact PDF are all committed.
    let (numberKey, numberIndex, number) = invoiceSlot(); let today = todayDays(); let at = now();
    let issued : Sale = { s with buyer; status = "issued"; acceptedBy = externalLabel(s); acceptedHow = "dealroom"; acceptedAt = at; invoiceNo = number; issuedAt = at; issuedOn = isoFromDays(today); dueOn = isoFromDays(today + billing.paymentDays); reference = scorOf(number) };
    let data = { invoiceData(issued, "invoice") with waiverText = externalTerms() };
    let pdf = InvoicePdf.render(data, deviceName(a), a.serial) ?? (return { ok = false; detail = "The invoice could not be generated. No acceptance was recorded. Ask the seller to review address lengths, characters and invoice settings." });
    if (pdf.size() > MAX_SALE_DOC) return { ok = false; detail = "The invoice exceeds the document limit. No acceptance was recorded; contact the seller." };
    invoiceCounters.add(numberKey, numberIndex);
    let hash = hex(Sha256.fromBlob(#sha256, pdf)); let docId = nextSaleDocId; nextSaleDocId += 1;
    invoiceSnapshots.add(id, data);
    dealDevices.add(id, { name = deviceName(a); serial = a.serial });
    saleDocs.add(docId, { id = docId; saleId = id; kind = "invoice"; name = number # ".pdf"; bytes = pdf; hash; at; by = "dealroom invoice service" });
    saleDocBytes += pdf.size(); putSale({ issued with pdfId = docId; pdfHash = hash });
    queueFinanceNotice(issued, "invoice");
    dealAudit(issued, externalLabel(s), "accepted", "Offer and terms v" # s.waiverVersion.toText() # " accepted using the private dealroom link; invoice " # number # " issued and archived");
    queueDealNotice(issued, "accepted", s.buyer.name # " accepted the offer — invoice " # number # " created");
    ignore sendDealNotices();
    { ok = true; detail = "Offer accepted. Your invoice is ready below." };
  };
  public shared func declineDeal(id : Nat, key : Text, quoted : Text, reason : Text) : async { ok : Bool; detail : Text } {
    let d = dealKey(id, key) ?? (return { ok = false; detail = "this link is unavailable or expired" });
    let s = sales.get(id) ?? (return { ok = false; detail = "this link is unavailable or expired" });
    if (s.status == "cancelled" and s.invoiceNo == "") return { ok = true; detail = "already declined" };
    if (s.status != "offered" or s.invoiceNo != "") return { ok = false; detail = "already accepted or invoiced — contact the seller to arrange cancellation" };
    if (quoted != d.quote or d.quote != quoteHash(s)) return { ok = false; detail = "the offer changed — ask the seller for a new link" };
    if (reason.size() > 300) return { ok = false; detail = "reason: at most 300 characters" };
    putSale({ s with status = "cancelled"; cancelledAt = now(); cancelReason = "Declined through the external dealroom" # (if (norm(reason) == "") "" else ": " # norm(reason)) });
    dealAudit(s, externalLabel(s), "declined", "Offer declined by private link; sale cancelled" # (if (norm(reason) == "") "" else ": " # norm(reason)));
    queueDealNotice(s, "declined", s.buyer.name # " declined the offer — sale cancelled"); ignore sendDealNotices();
    { ok = true; detail = "Offer declined. The seller has been informed." };
  };
  public shared func dealDocument(id : Nat, key : Text) : async ?{ name : Text; mime : Text; bytes : Blob; hash : Text } {
    let d = dealKey(id, key) ?? (return null); let s = sales.get(id) ?? (return null);
    if (s.status == "cancelled") return null;
    let doc = saleDocs.get(s.pdfId) ?? (return null);
    if (d.downloadedAt == 0) { deals.add(id, { d with downloadedAt = now() }); dealAudit(s, externalLabel(s), "invoice_requested", "Invoice PDF requested through the dealroom (delivery does not prove it was opened)") };
    ?{ name = doc.name; mime = "application/pdf"; bytes = doc.bytes; hash = doc.hash };
  };
  public shared func confirmDeal(id : Nat, key : Text, invoiceNo : Text, pdfHash : Text) : async { ok : Bool; detail : Text } {
    let d = dealKey(id, key) ?? (return { ok = false; detail = "this link is unavailable or expired" }); let s = sales.get(id) ?? (return { ok = false; detail = "unavailable" });
    if ((s.status != "issued" and s.status != "paid") or s.pdfId == 0 or d.downloadedAt == 0 or s.invoiceNo != invoiceNo or s.pdfHash != pdfHash) return { ok = false; detail = "download the current invoice before confirming receipt" };
    if (d.completedAt != 0) return { ok = true; detail = "receipt already confirmed" };
    deals.add(id, { d with completedAt = now() });
    dealAudit(s, externalLabel(s), "completed", "Buyer explicitly confirmed receipt of invoice " # s.invoiceNo # "; dealroom tasks complete (payment is not confirmed)");
    queueDealNotice(s, "completed", s.buyer.name # " completed the dealroom — confirm payment, then prepare hand-over"); ignore sendDealNotices();
    { ok = true; detail = "Receipt confirmed. The seller has been informed." };
  };
  // A physical hand-over is a separate fact from payment, also for colleague sales.
  func handedOverAt(id : Nat) : Int {
    switch (deals.get(id)) { case (?d) { if (d.handedOverAt != 0) return d.handedOverAt }; case null {} };
    for (e in dealsHistory(id).values()) if (e.action == "handed_over") return e.at;
    0;
  };
  func finishHandover(tok : Text, id : Nat, abmReleased : Bool, note : Text) : async { ok : Bool; detail : Text } {
    if (admin(tok) == null) return { ok = false; detail = "admins only" };
    let starting = sales.get(id) ?? (return { ok = false; detail = "No such sale" });
    switch (handovers.get(starting.assetId)) { case (?p) { if (hardwarePending(p.assetId) and (p.choice != "sale" or p.saleId != id or not (await currentHardwareCase(tok, p)))) return { ok = false; detail = "Review the hardware follow-up and active Desk case first" } }; case null {} };
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = admin(tok) ?? (return { ok = false; detail = "admins only" });
    let s = sales.get(id) ?? (return { ok = false; detail = "no such sale" });
    if (s.status == "cancelled") return { ok = false; detail = "the sale is cancelled" };
    if (handedOverAt(id) != 0) return { ok = true; detail = "already handed over" };
    if (s.status != "paid" or not s.wiped or not s.mdmRemoved or s.pdfId == 0) return { ok = false; detail = "confirm payment, archive the invoice, and save both preparation checks before hand-over" };
    // Receipt is a buyer assertion, independent of IT's physical hand-over.
    // Do not invent it or block a paid, prepared sale on an expired private link.
    let a = assets.get(s.assetId) ?? (return { ok = false; detail = "device unavailable" });
    if (a.archived or a.status == "lost" or a.status == "scrapped") return { ok = false; detail = "device unavailable — review its register status" };
    for ((_, other) in sales.entries()) if (other.assetId == s.assetId and other.id > s.id and other.status != "cancelled") return { ok = false; detail = "a newer sale exists for this device — review its history before recording an old hand-over" };
    if (abmHolds(?a) != "" and not abmReleased) return { ok = false; detail = "release the device in Apple Business Manager and confirm it here" };
    if (note.size() > 300) return { ok = false; detail = "note: at most 300 characters" };
    assets.add(a.id, { a with status = "sold"; assignee = ""; holder = s.buyer.name; updatedAt = now() });
    ignore addEvent(a.id, m.id, "sold", "handed over after payment; invoice " # s.invoiceNo, s.buyer.name, 0);
    switch (deals.get(id)) { case (?d) deals.add(id, { d with handedOverAt = now() }); case null {} };
    putSale(s);
    dealAudit(s, m.displayName, "handed_over", "Device handed over; payment, wipe and MDM removal confirmed" # (if (abmReleased) "; staff confirmed release from ABM" else "") # (if (norm(note) == "") "" else ": " # norm(note)));
    { ok = true; detail = "hand-over recorded" };
  };
  public shared func completeSaleHandover(tok : Text, id : Nat, abmReleased : Bool, note : Text) : async { ok : Bool; detail : Text } {
    await finishHandover(tok, id, abmReleased, note);
  };
  public shared func completeDealHandover(tok : Text, id : Nat, abmReleased : Bool, note : Text) : async { ok : Bool; detail : Text } {
    if (admin(tok) == null) return { ok = false; detail = "admins only" };
    if (deals.get(id) == null) return { ok = false; detail = "no dealroom" };
    await finishHandover(tok, id, abmReleased, note);
  };

  // ---- calendar (UTC; business dates are YYYY-MM-DD) ----
  func civilFromDays(z0 : Int) : (Int, Int, Int) {
    let z = z0 + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    (if (m <= 2) y + 1 else y, m, d);
  };
  func daysFromCivil(y : Int, m : Int, d : Int) : Int {
    let yy = if (m <= 2) y - 1 else y;
    let era = (if (yy >= 0) yy else yy - 399) / 400;
    let yoe = yy - era * 400;
    let mp = if (m > 2) m - 3 else m + 9;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468;
  };
  func pad2(n : Int) : Text = (if (n < 10) "0" else "") # Int.toText(n);
  func isoFromDays(days : Int) : Text { let (y, m, d) = civilFromDays(days); Int.toText(y) # "-" # pad2(m) # "-" # pad2(d) };
  func todayDays() : Int = now() / 1_000_000_000 / 86_400;
  func parseIso(s : Text) : ?Int {
    let parts = Text.split(norm(s), #char '-').toArray();
    if (parts.size() != 3 or parts[0].size() != 4 or parts[1].size() != 2 or parts[2].size() != 2) return null;
    switch (Nat.fromText(parts[0]), Nat.fromText(parts[1]), Nat.fromText(parts[2])) {
      case (?y, ?m, ?d) { if (y < 1900 or y > 9999 or m < 1 or m > 12 or d < 1 or d > 31 or isoFromDays(daysFromCivil(y, m, d)) != s) null else ?daysFromCivil(y, m, d) };
      case _ null;
    };
  };
  /// "650.00" from minor units
  func money(minor : Nat) : Text = Nat.toText(minor / 100) # "." # (if (minor % 100 < 10) "0" else "") # Nat.toText(minor % 100);
  /// "1'650.00" — Swiss grouping for the invoice page
  func moneyPretty(minor : Nat) : Text {
    let whole = Nat.toText(minor / 100); let cs = Text.toArray(whole); var out = ""; var i = 0;
    for (c in cs.vals()) { if (i > 0 and (cs.size() - i) % 3 == 0) out #= "'"; out #= Char.toText(c); i += 1 };
    out # "." # (if (minor % 100 < 10) "0" else "") # Nat.toText(minor % 100);
  };
  /// net + VAT out of a gross amount (the buyer sees one price): net = gross / (1 + rate), rounded half up
  func splitVat(grossMinor : Nat, rateBp : Nat) : (Nat, Nat) {
    let denom = 10_000 + rateBp;
    let net = (grossMinor * 10_000 + denom / 2) / denom;
    (net, grossMinor - net);
  };
  func alnumUpper(t : Text) : Text { var out = ""; for (c in Text.toUpper(t).chars()) if (Char.isAlphabetic(c) or Char.isDigit(c)) out #= Char.toText(c); out };
  func letterDigits(t : Text) : Text { var out = ""; for (c in t.chars()) { if (Char.isDigit(c)) out #= Char.toText(c) else out #= Nat.toText(Nat32.toNat(Char.toNat32(c)) - 55) }; out }; // A=10 … Z=35
  func mod97(digits : Text) : Nat = switch (Nat.fromText(digits)) { case (?n) n % 97; case null 99 };
  /// ISO 11649 creditor reference: RF + 2 check digits + the invoice number's letters and digits (≤ 21). Machine-readable with a normal IBAN.
  func scorOf(invoiceNo : Text) : Text {
    let body = capText(alnumUpper(invoiceNo), 21);
    let check = 98 - mod97(letterDigits(body) # "271500"); // "RF00" → 27 15 00 00
    "RF" # (if (check < 10) "0" else "") # Nat.toText(check) # body;
  };
  /// the Swiss QR Code carries a Latin character set — anything else becomes a space (the invoice page keeps the full text)
  func latin1(t : Text) : Text { var out = ""; for (c in t.chars()) { let n = Char.toNat32(c); out #= (if (n == 0x2014 or n == 0x2013) "-" else if (n == 0x00B7) "," else if (n >= 32 and n <= 0xFF) Char.toText(c) else " ") }; out };
  func groups4(t : Text) : Text { var out = ""; var i = 0; for (c in t.chars()) { if (i > 0 and i % 4 == 0) out #= " "; out #= Char.toText(c); i += 1 }; out };
  /// CH/LI IBAN: 21 characters, mod-97 check passes.
  func ibanValid(raw : Text) : Bool {
    let t = alnumUpper(raw);
    if (t.size() != 21 or not (Text.startsWith(t, #text "CH") or Text.startsWith(t, #text "LI"))) return false;
    let cs = Text.toArray(t);
    let rearranged = Text.fromArray(Array.tabulate<Char>(21, func i = cs[(i + 4) % 21]));
    mod97(letterDigits(rearranged)) == 1;
  };
  func countryOk(c : Text) : Bool { if (c.size() != 2) return false; for (ch in c.chars()) if (ch < 'A' or ch > 'Z') return false; true };
  func qrIban(iban : Text) : Bool {
    let cs = alnumUpper(iban).toArray(); if (cs.size() != 21) return false;
    let iid = Nat.fromText(Text.fromArray(Array.tabulate<Char>(5, func i = cs[i + 4]))) ?? 0;
    iid >= 30000 and iid <= 31999;
  };
  func addressComplete(name : Text, street : Text, postal : Text, town : Text, country : Text) : Bool = norm(name) != "" and norm(street) != "" and norm(postal) != "" and norm(town) != "" and countryOk(country);
  func billingReady() : ?Text {
    if (not addressComplete(billing.legalName, billing.street, billing.postalCode, billing.town, billing.country)) return ?"Settings → Billing: company name and structured address (street, postal code, town, country) are needed on the payment part";
    if (not ibanValid(billing.iban)) return ?"Settings → Billing: a valid CH/LI IBAN is needed";
    if (qrIban(billing.iban)) return ?"Invoices use SCOR: configure a normal CH/LI IBAN, not a QR-IBAN";
    if (billing.vatRegistered and billing.uid == "") return ?"Settings → Billing: the UID is needed on a VAT invoice";
    null;
  };

  /// Admins: the billing settings (the company as creditor, VAT, number range, payment terms, pricing rule, hand-over terms).
  public shared query func getBilling(tok : Text) : async ?Billing { switch (admin(tok)) { case null null; case (?_) ?billing } };
  /// Admins: save the billing settings. The IBAN must pass the mod-97 check; a changed hand-over text bumps its version (open offers are re-offered on that text).
  public shared func setBilling(tok : Text, b : Billing) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (norm(b.iban) != "" and not ibanValid(b.iban)) return { ok = false; detail = "that IBAN does not check out (CH/LI, 21 characters)" };
    if (qrIban(b.iban)) return { ok = false; detail = "Invoices use SCOR: use a normal CH/LI IBAN, not a QR-IBAN" };
    if (b.vatRateBp > 5_000) return { ok = false; detail = "VAT rate: at most 50 %" };
    if (b.currency != "CHF" and b.currency != "EUR") return { ok = false; detail = "the QR-bill takes CHF or EUR" };
    if (norm(b.prefix).size() > 12) return { ok = false; detail = "prefix: at most 12 characters" };
    for (c in norm(b.prefix).chars()) if (not (Char.isAlphabetic(c) or Char.isDigit(c) or c == '-' or c == '/')) return { ok = false; detail = "prefix: letters, digits, - and / only" };
    if (b.paymentDays > 120) return { ok = false; detail = "payment terms: at most 120 days" };
    if (not has(LANGS, b.lang)) return { ok = false; detail = "payment part language: en, de, fr or it" };
    if (b.depreciationMonths < 1 or b.depreciationMonths > 120) return { ok = false; detail = "depreciation: 1–120 months" };
    if (b.floorPct > 100) return { ok = false; detail = "floor: 0–100 %" };
    if (b.waiverText.size() > 20_000) return { ok = false; detail = "hand-over terms: at most 20 000 characters" };
    if (norm(b.waiverText) == "") return { ok = false; detail = "the hand-over terms cannot be empty — they are page 2 of every invoice" };
    if (norm(b.country) != "" and not countryOk(norm(b.country))) return { ok = false; detail = "country: two letters (CH, DE, …)" };
    let version = if (norm(b.waiverText) != billing.waiverText) billing.waiverVersion + 1 else billing.waiverVersion;
    billing := { b with legalName = capText(norm(b.legalName), 70); street = capText(norm(b.street), 70); houseNo = capText(norm(b.houseNo), 16); postalCode = capText(norm(b.postalCode), 16); town = capText(norm(b.town), 35); country = (if (norm(b.country) == "") "CH" else alnumUpper(b.country)); uid = capText(norm(b.uid), 20); iban = alnumUpper(b.iban); prefix = norm(b.prefix); waiverText = capText(norm(b.waiverText), 20_000); waiverVersion = version; footer = capText(norm(b.footer), 300) };
    log(m.email, "billing settings saved" # (if (version != b.waiverVersion) " · hand-over terms v" # Nat.toText(version) else ""));
    { ok = true; detail = (if (version != b.waiverVersion) "saved — the hand-over terms are now version " # Nat.toText(version) # "; open offers must be accepted again" else "saved") };
  };

  /// Admins: what the company paid for a device (basis of the price proposal); null price clears it.
  public shared func setPurchase(tok : Text, assetId : Nat, priceMinor : ?Nat, currency : Text, date : Text, note : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    switch (Map.get(assets, Nat.compare, assetId)) { case null return { ok = false; detail = "no such device" }; case (?_) {} };
    switch (priceMinor) {
      case null { ignore Map.delete(purchases, Nat.compare, assetId); ignore addEvent(assetId, m.id, "edited", "purchase details removed", "", 0) };
      case (?p) {
        if (date != "" and parseIso(date) == null) return { ok = false; detail = "purchase date as YYYY-MM-DD" };
        let cur = if (norm(currency) == "") billing.currency else alnumUpper(currency);
        if (cur.size() != 3) return { ok = false; detail = "currency: three letters" };
        Map.add(purchases, Nat.compare, assetId, { priceMinor = p; currency = cur; date = norm(date); note = capText(norm(note), 200); by = m.id; at = now() });
        ignore addEvent(assetId, m.id, "edited", "purchase details set: " # moneyPretty(p) # " " # cur # (if (date != "") " on " # norm(date) else ""), "", 0);
      };
    };
    financialRevisions.add(assetId, (financialRevisions.get(assetId) ?? 0) + 1);
    { ok = true; detail = "" };
  };
  /// The rule's price for a device today: linear write-down over the configured months, never below the floor (share of the purchase price) or the minimum.
  func proposal(assetId : Nat) : ?{ proposedMinor : Nat; basis : Text } {
    let p = switch (Map.get(purchases, Nat.compare, assetId)) { case (?p) p; case null return null };
    let months : Int = switch (parseIso(p.date)) { case (?d) { let elapsed = todayDays() - d; if (elapsed < 0) 0 else elapsed / 30 }; case null 0 };
    let dm : Int = billing.depreciationMonths;
    let remaining : Nat = if (months >= dm) 0 else (p.priceMinor * Int.abs(dm - months)) / billing.depreciationMonths;
    let floor = Nat.max(p.priceMinor * billing.floorPct / 100, billing.minPriceMinor);
    let raw = Nat.max(remaining, floor);
    let rounded = ((raw + 50) / 100) * 100; // whole francs
    ?{ proposedMinor = rounded; basis = "purchase price " # moneyPretty(p.priceMinor) # " " # p.currency # (if (p.date != "") " on " # p.date else "") # " · " # Int.toText(months) # " of " # Nat.toText(billing.depreciationMonths) # " months elapsed · linear write-down, floor " # Nat.toText(billing.floorPct) # " % / " # moneyPretty(billing.minPriceMinor) };
  };
  /// Admins: the rule's price proposal for a device (null when no purchase details are known).
  public shared query func priceProposal(tok : Text, assetId : Nat) : async ?{ proposedMinor : Nat; basis : Text } { switch (admin(tok)) { case null null; case (?_) proposal(assetId) } };

  func openSaleFor(assetId : Nat) : ?Sale { for ((_, s) in Map.entries(sales)) if (s.assetId == assetId and s.status != "cancelled" and handedOverAt(s.id) == 0) return ?s; null };
  func cleanBuyer(b : Buyer) : Buyer = { pid = norm(b.pid); name = capText(norm(b.name), 70); email = lower(norm(b.email)); street = capText(norm(b.street), 70); houseNo = capText(norm(b.houseNo), 16); postalCode = capText(norm(b.postalCode), 16); town = capText(norm(b.town), 35); country = (if (norm(b.country) == "") "CH" else alnumUpper(norm(b.country))) };
  /// a colleague's name and address-of-record come from the directory; only the postal address is typed
  func resolveBuyer(b0 : Buyer) : { #ok : Buyer; #err : Text } {
    let b1 = cleanBuyer(b0);
    // the picker speaks addresses (like every picker in this app); an address in `pid` is resolved to the person id
    let b = if (Text.contains(b1.pid, #char '@')) { let pid = pidOf(lower(b1.pid)); if (pid == "" or not knownPerson(lower(b1.pid))) return #err("that person is not in the directory"); { b1 with pid } } else b1;
    if (b.pid != "") {
      let p = Hub.personById(people, ids, former, b.pid);
      if (p.email == "" or not Hub.isActiveId(people, ids, b.pid)) return #err("the buyer is not an active member of the directory — for an outside buyer leave the person empty and type the name");
      return #ok({ b with name = (if (p.displayName != "") p.displayName else p.email); email = lower(p.email) });
    };
    if (b.name == "") return #err("who buys it? pick a colleague or type the buyer's name");
    if (b.country != "" and not countryOk(b.country)) return #err("buyer country: two letters");
    #ok(b);
  };
  func saleDescription(a : Asset) : Text = "Used hardware — " # deviceName(a) # (if (a.serial != "") " · serial " # a.serial else "") # (if (a.tag != "") " · " # a.tag else "");
  func putSale(s : Sale) { Map.add(sales, Nat.compare, s.id, { s with updatedAt = now() }) };
  func saleEvent(s : Sale, by : Text, what : Text) { ignore addEvent(s.assetId, by, "sale", what # " (sale #" # Nat.toText(s.id) # ")", "", 0) };

  /// Admins: start a sale of a device to a colleague or an outside buyer. Price = what the buyer pays (gross, incl. VAT); the rule's proposal is kept alongside.
  public shared func createSale(tok : Text, assetId : Nat, buyer : Buyer, grossMinor : Nat, priceNote : Text) : async { ok : Bool; id : Nat; detail : Text } {
    if (migrating()) return { ok = false; id = 0; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; id = 0; detail = "admins only" } };
    let a = switch (Map.get(assets, Nat.compare, assetId)) { case (?a) a; case null return { ok = false; id = 0; detail = "no such device" } };
    if (a.archived) return { ok = false; id = 0; detail = "this device is archived" };
    if (a.status == "sold" or a.status == "scrapped") return { ok = false; id = 0; detail = "this device is already " # a.status };
    switch (openSaleFor(assetId)) { case (?s) return { ok = false; id = s.id; detail = "there is already a sale #" # Nat.toText(s.id) # " (" # s.status # ") for this device" }; case null {} };
    let b = switch (resolveBuyer(buyer)) { case (#ok(b)) b; case (#err(e)) return { ok = false; id = 0; detail = e } };
    if (grossMinor == 0 or grossMinor > 10_000_000_000) return { ok = false; id = 0; detail = "a price above zero, please" };
    let (net, vat) = splitVat(grossMinor, if (billing.vatRegistered) billing.vatRateBp else 0);
    let id = nextSaleId; nextSaleId += 1;
    let s : Sale = { id; assetId; status = "draft"; buyer = b; grossMinor; vatRateBp = (if (billing.vatRegistered) billing.vatRateBp else 0); netMinor = net; vatMinor = vat; currency = billing.currency; proposedMinor = (switch (proposal(assetId)) { case (?p) ?p.proposedMinor; case null null }); priceNote = capText(norm(priceNote), 300); description = saleDescription(a); wiped = false; mdmRemoved = false; checksBy = ""; waiverVersion = billing.waiverVersion; acceptedBy = ""; acceptedAt = 0; acceptedHow = ""; invoiceNo = ""; issuedAt = 0; issuedOn = ""; dueOn = ""; reference = ""; pdfId = 0; pdfHash = ""; paidAt = 0; paidNote = ""; creditNoteNo = ""; cancelledAt = 0; cancelReason = ""; creditPdfId = 0; createdBy = m.id; createdAt = now(); updatedAt = now() };
    switch (handovers.get(assetId)) { case (?p) { if (hardwarePending(assetId)) { handovers.add(assetId, { p with choice = "sale"; saleId = id; revision = p.revision + 1; updatedAt = now() }); formerBuyer.add(id, p.person) } }; case null {} };
    putSale(s); saleEvent(s, m.id, "sale started: " # b.name # " · " # moneyPretty(grossMinor) # " " # s.currency);
    log(m.email, "sale #" # Nat.toText(id) # " started for " # deviceName(a) # " → " # b.name);
    { ok = true; id; detail = "" };
  };
  /// Admins: change buyer, price, note or line text while nothing is issued. A change after the buyer accepted puts the offer back to them.
  public shared func updateSale(tok : Text, id : Nat, buyer : Buyer, grossMinor : Nat, priceNote : Text, description : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such sale" } };
    if (s.status != "draft" and s.status != "offered" and s.status != "accepted") return { ok = false; detail = "an issued invoice is not edited — cancel it with a credit note and start again" };
    let b = switch (resolveBuyer(buyer)) { case (#ok(b)) b; case (#err(e)) return { ok = false; detail = e } };
    if (grossMinor == 0 or grossMinor > 10_000_000_000) return { ok = false; detail = "price must be above zero and within the supported range" };
    let (net, vat) = splitVat(grossMinor, if (billing.vatRegistered) billing.vatRateBp else 0);
    let descriptionNow = if (norm(description) == "") s.description else capText(norm(description), 200);
    let material = grossMinor != s.grossMinor or b != s.buyer or descriptionNow != s.description or s.vatRateBp != (if (billing.vatRegistered) billing.vatRateBp else 0);
    if (material) invalidateDeal(s, m.displayName);
    let status = if (s.status == "accepted" and material) "offered" else s.status;
    putSale({ s with buyer = b; grossMinor; netMinor = net; vatMinor = vat; vatRateBp = (if (billing.vatRegistered) billing.vatRateBp else 0); priceNote = capText(norm(priceNote), 300); description = descriptionNow; status; acceptedBy = (if (status == "offered" and s.status == "accepted") "" else s.acceptedBy); acceptedAt = (if (status == "offered" and s.status == "accepted") 0 else s.acceptedAt); acceptedHow = (if (status == "offered" and s.status == "accepted") "" else s.acceptedHow) });
    log(m.email, "sale #" # Nat.toText(id) # " edited" # (if (status != s.status) " — the buyer has to accept again" else ""));
    { ok = true; detail = (if (status != s.status) "saved — price or buyer changed, so the offer goes back to the buyer" else "saved") };
  };
  /// Admins: the two things that must be true before hand-over: the device is wiped, and it left the company's device management.
  public shared func setSaleChecks(tok : Text, id : Nat, wiped : Bool, mdmRemoved : Bool) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such sale" } };
    if (s.status == "cancelled" or handedOverAt(id) != 0) return { ok = false; detail = "the sale is " # s.status };
    switch (deals.get(id)) { case (?d) { if (d.handedOverAt != 0) return { ok = false; detail = "hand-over is already complete" } }; case null {} };
    putSale({ s with wiped; mdmRemoved; checksBy = m.id });
    if (deals.get(id) != null) dealAudit(s, m.displayName, "preparation", "Hand-over checks saved: wiped=" # debug_show(wiped) # ", MDM removed=" # debug_show(mdmRemoved));
    { ok = true; detail = "" };
  };
  /// Admins: put the offer to the buyer. A colleague gets a hub notification and accepts the hand-over terms online; for an outside buyer staff record the signed copy (recordWaiver).
  public shared func offerSale(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such sale" } };
    if (s.status != "draft" and s.status != "offered") return { ok = false; detail = "the sale is " # s.status };
    putSale({ s with status = "offered"; waiverVersion = billing.waiverVersion });
    saleEvent(s, m.id, "offered to " # s.buyer.name # " at " # moneyPretty(s.grossMinor) # " " # s.currency);
    var notified = "";
    if (s.buyer.pid != "" and hubId != "") {
      let link = appLink("offers/" # Nat.toText(id));
      notified := await notifyPerson(s.buyer.email, "A device is offered to you — review the price and terms", link, "assets.offer", "offer-" # Nat.toText(id) # "-" # Nat.toText(billing.waiverVersion));
    };
    { ok = true; detail = (if (s.buyer.pid == "") "offered — an outside buyer signs the terms on paper; record it here" else if (notified == "") "offered — " # s.buyer.name # " was told through the hub and accepts under Offers" else "offered — but " # s.buyer.name # " could NOT be notified: " # notified # ". Tell them yourself, or fix it under Settings → Notifications") };
  };
  /// The buyer's own offers and invoices (a colleague signed in through the hub).
  public shared query func myOffers(tok : Text) : async [SaleView] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    let out = List.empty<SaleView>();
    for ((_, s) in Map.entries(sales)) if (s.buyer.pid == m.id and s.status != "draft") List.add(out, saleView(s));
    Array.sort<SaleView>(List.toArray(out), func(a, b) = Int.compare(b.sale.updatedAt, a.sale.updatedAt));
  };
  /// The buyer accepts the hand-over terms (the version they were shown) with their own hub sign-in — this is the signature on page 2 of the invoice.
  /// The buyer also gives (or confirms) the postal address for the invoice; it lives on this sale only, never in the directory.
  public shared func acceptOffer(tok : Text, id : Nat, waiverVersion : Nat, address : ?{ street : Text; houseNo : Text; postalCode : Text; town : Text; country : Text }) : async { ok : Bool; detail : Text } {
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such offer" } };
    if (s.buyer.pid != m.id) return { ok = false; detail = "this offer is not yours" };
    if (s.status != "offered") return { ok = false; detail = "the offer is " # s.status };
    if (waiverVersion != billing.waiverVersion) return { ok = false; detail = "the terms changed since you opened this — reload and read them again" };
    let b = switch (address) { case (?a) cleanBuyer({ s.buyer with street = a.street; houseNo = a.houseNo; postalCode = a.postalCode; town = a.town; country = a.country }); case null s.buyer };
    if (not addressComplete(b.name, b.street, b.postalCode, b.town, b.country)) return { ok = false; detail = "your postal address is needed on the invoice: street, postal code, town and country" };
    putSale({ s with buyer = b; status = "accepted"; acceptedBy = m.id; acceptedAt = now(); acceptedHow = "online"; waiverVersion = billing.waiverVersion });
    saleEvent(s, m.id, "hand-over terms accepted online by " # m.displayName);
    log(m.email, "sale #" # Nat.toText(id) # ": terms v" # Nat.toText(billing.waiverVersion) # " accepted online");
    { ok = true; detail = "" };
  };
  /// The buyer declines the offer (with a word why).
  public shared func declineOffer(tok : Text, id : Nat, note : Text) : async { ok : Bool; detail : Text } {
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such offer" } };
    if (s.buyer.pid != m.id) return { ok = false; detail = "this offer is not yours" };
    if (s.status != "offered" and s.status != "accepted") return { ok = false; detail = "the offer is " # s.status };
    putSale({ s with status = "cancelled"; cancelledAt = now(); cancelReason = "declined by the buyer" # (if (norm(note) != "") ": " # capText(norm(note), 200) else "") });
    saleEvent(s, m.id, "offer declined by " # m.displayName);
    { ok = true; detail = "" };
  };
  /// Admins: an outside buyer (no hub account) signed the terms on paper — record it, so the invoice can be issued. The note says where the signed copy is.
  public shared func recordWaiver(tok : Text, id : Nat, note : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such sale" } };
    if (s.status != "offered") return { ok = false; detail = "offer the sale first (status is " # s.status # ")" };
    if (s.buyer.pid != "") return { ok = false; detail = "a colleague accepts the terms online with their own sign-in — staff cannot accept for them" };
    if (norm(note) == "") return { ok = false; detail = "say where the signed copy is (a sentence)" };
    putSale({ s with status = "accepted"; acceptedBy = m.id; acceptedAt = now(); acceptedHow = "paper: " # capText(norm(note), 200); waiverVersion = billing.waiverVersion });
    saleEvent(s, m.id, "hand-over terms signed on paper (recorded)");
    { ok = true; detail = "" };
  };
  func invoiceSlot() : (Text, Nat, Text) {
    let key = if (billing.yearInNumber) (do { let (y, _, _) = civilFromDays(todayDays()); Int.toText(y) }) else "";
    let n = (switch (Map.get(invoiceCounters, Text.compare, key)) { case (?x) x; case null 0 }) + 1;
    let pad = if (n < 10) "000" else if (n < 100) "00" else if (n < 1000) "0" else "";
    (key, n, billing.prefix # (if (key != "") key # "-" else "") # pad # Nat.toText(n));
  };
  func nextInvoiceNo() : Text { let (key, n, number) = invoiceSlot(); invoiceCounters.add(key, n); number };
  /// Admins: issue the invoice — the number comes out of the gapless range now (drafts never use one), the reference is derived from it, the device stays reserved until hand-over. Needs accepted terms and complete billing settings.
  public shared func issueInvoice(tok : Text, id : Nat) : async { ok : Bool; detail : Text; invoiceNo : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING; invoiceNo = "" };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; invoiceNo = "" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such sale"; invoiceNo = "" } };
    if (deals.get(id) != null) return { ok = false; detail = "the outside buyer accepts in the dealroom; its invoice is automatic"; invoiceNo = "" };
    if (s.status != "accepted") return { ok = false; detail = "the buyer has not accepted the terms yet (status " # s.status # ")"; invoiceNo = "" };
    switch (billingReady()) { case (?e) return { ok = false; detail = e; invoiceNo = "" }; case null {} };
    if (not addressComplete(s.buyer.name, s.buyer.street, s.buyer.postalCode, s.buyer.town, s.buyer.country)) return { ok = false; detail = "the buyer's postal address is incomplete (street, postal code, town, country) — a VAT invoice and the payment part need it"; invoiceNo = "" };
    if (s.waiverVersion != billing.waiverVersion) return { ok = false; detail = "the hand-over terms changed after the buyer accepted — offer again"; invoiceNo = "" };
    let a = switch (Map.get(assets, Nat.compare, s.assetId)) { case (?a) a; case null return { ok = false; detail = "the device is gone"; invoiceNo = "" } };
    let no = nextInvoiceNo();
    let today = todayDays();
    putSale({ s with status = "issued"; invoiceNo = no; issuedAt = now(); issuedOn = isoFromDays(today); dueOn = isoFromDays(today + billing.paymentDays); reference = scorOf(no) });
    queueFinanceNotice(sales.get(id) ?? s, "invoice");
    // Payment and physical hand-over follow the invoice; the device stays reserved.
    saleEvent(s, m.id, "invoice " # no # " issued — " # moneyPretty(s.grossMinor) # " " # s.currency # ", due " # isoFromDays(today + billing.paymentDays));
    log(m.email, "invoice " # no # " issued for " # deviceName(a) # " → " # s.buyer.name);
    var notified = "";
    if (s.buyer.pid != "" and hubId != "") {
      let link = appLink("offers/" # Nat.toText(id));
      notified := await notifyPerson(s.buyer.email, "Your invoice " # no # " is ready", link, "assets.invoice", "inv-" # no);
    };
    { ok = true; detail = (if (notified == "") "" else "issued — but " # s.buyer.name # " could NOT be notified: " # notified); invoiceNo = no };
  };
  /// Admins: archive the rendered PDF exactly as handed to the buyer (kind invoice | creditNote). Once stored it is never replaced.
  public shared func attachSaleDocument(tok : Text, id : Nat, kind : Text, bytes : Blob) : async { ok : Bool; detail : Text; docId : Nat } {
    let m = switch (finance(tok)) { case (?m) m; case null return { ok = false; detail = "Finance or Assets admins only"; docId = 0 } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such sale"; docId = 0 } };
    if (kind != "invoice" and kind != "creditNote") return { ok = false; detail = "kind: invoice or creditNote"; docId = 0 };
    if (kind == "invoice" and s.invoiceNo == "") return { ok = false; detail = "issue the invoice first"; docId = 0 };
    if (kind == "creditNote" and s.creditNoteNo == "") return { ok = false; detail = "there is no credit note on this sale"; docId = 0 };
    if ((kind == "invoice" and s.pdfId != 0) or (kind == "creditNote" and s.creditPdfId != 0)) return { ok = false; detail = "this document is already archived — it is never replaced"; docId = 0 };
    if (bytes.size() < 100 or bytes.size() > MAX_SALE_DOC) return { ok = false; detail = "the PDF must be 100 bytes – 1.5 MB"; docId = 0 };
    let head = Blob.toArray(bytes);
    if (not (head[0] == 0x25 and head[1] == 0x50 and head[2] == 0x44 and head[3] == 0x46)) return { ok = false; detail = "that is not a PDF"; docId = 0 };
    if (saleDocBytes + bytes.size() > MAX_SALE_DOC_TOTAL) return { ok = false; detail = "document storage is full — tell IT"; docId = 0 };
    let h = hex(Sha256.fromBlob(#sha256, bytes));
    let docId = nextSaleDocId; nextSaleDocId += 1;
    let name = (if (kind == "invoice") s.invoiceNo else s.creditNoteNo) # ".pdf";
    Map.add(saleDocs, Nat.compare, docId, { id = docId; saleId = id; kind; name; bytes; hash = h; at = now(); by = m.id });
    saleDocBytes += bytes.size();
    if (kind == "invoice") putSale({ s with pdfId = docId; pdfHash = h }) else putSale({ s with creditPdfId = docId });
    saleEvent(s, m.id, name # " archived (sha256 " # capText(h, 12) # "…)");
    { ok = true; detail = ""; docId };
  };
  /// The archived document — for admins and the buyer (their own). Session-gated, no public link.
  public shared query func saleDocument(tok : Text, docId : Nat) : async ?{ name : Text; mime : Text; bytes : Blob; hash : Text } {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    let d = switch (Map.get(saleDocs, Nat.compare, docId)) { case (?d) d; case null return null };
    let s = switch (Map.get(sales, Nat.compare, d.saleId)) { case (?s) s; case null return null };
    if (m.role != "admin" and m.role != "finance" and s.buyer.pid != m.id) return null;
    ?{ name = d.name; mime = "application/pdf"; bytes = d.bytes; hash = d.hash };
  };
  /// Admins: the money arrived (finance says so) — a note for the record; the books stay with finance.
  public shared func markPaid(tok : Text, id : Nat, note : Text) : async { ok : Bool; detail : Text } {
    let m = finance(tok) ?? (return { ok = false; detail = "Finance or Assets admins only" });
    let s = sales.get(id) ?? (return { ok = false; detail = "No such sale" });
    let rows = paymentRows(s);
    let paid = paymentTotal(rows);
    if (paid >= s.grossMinor) return { ok = false; detail = "Already paid" };
    recordPayment(m, s, rows.size(), { amountMinor = s.grossMinor - paid; paidOn = isoFromDays(todayDays()); reference = note; reason = ""; reverses = null; requestId = "mark-paid-" # rows.size().toText() })
  };

  /// Admins: cancel. Before the invoice: the sale just ends. After: a numbered credit note is created (the invoice number stays used — ranges are gapless) and the device goes back to stock unless it was already paid.
  public shared func cancelSale(tok : Text, id : Nat, reason : Text) : async { ok : Bool; detail : Text; creditNoteNo : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING; creditNoteNo = "" };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; creditNoteNo = "" } };
    let s = switch (Map.get(sales, Nat.compare, id)) { case (?s) s; case null return { ok = false; detail = "no such sale"; creditNoteNo = "" } };
    if (s.status == "cancelled") return { ok = false; detail = "already cancelled"; creditNoteNo = "" };
    if (norm(reason) == "") return { ok = false; detail = "a reason, please — it goes into the history"; creditNoteNo = "" };
    var cn = "";
    if (s.status == "issued" or s.status == "paid") {
      cn := nextInvoiceNo();
      switch (Map.get(assets, Nat.compare, s.assetId)) {
        case (?a) { if (s.status == "issued" and a.status == "sold" and handedOverAt(s.id) == 0) { Map.add(assets, Nat.compare, a.id, { a with status = "in_stock"; holder = ""; updatedAt = now() }); ignore addEvent(a.id, m.id, "returned", "back in stock — invoice " # s.invoiceNo # " cancelled with credit note " # cn, "", 0) } else ignore addEvent(a.id, m.id, "note", "invoice " # s.invoiceNo # " cancelled with credit note " # cn # " after payment — check where the device is and refund", "", 0) };
        case null {};
      };
    };
    putSale({ s with status = "cancelled"; cancelledAt = now(); cancelReason = capText(norm(reason), 300); creditNoteNo = cn });
    if (deals.get(id) != null) dealAudit(s, m.displayName, "cancelled_by_it", "IT cancelled the sale: " # capText(norm(reason), 300) # (if (cn != "") "; credit note " # cn else ""));
    saleEvent(s, m.id, "cancelled: " # capText(norm(reason), 100) # (if (cn != "") " · credit note " # cn else ""));
    log(m.email, "sale #" # Nat.toText(id) # " cancelled" # (if (cn != "") " — credit note " # cn else ""));
    { ok = true; detail = (if (cn != "") "cancelled — credit note " # cn # " (render and archive it, hand it to finance)" else "cancelled"); creditNoteNo = cn };
  };

  /// Everything a rendering needs — computed here, so the PDF is a picture of the record: seller, buyer, amounts, dates, reference and the complete Swiss QR Code payload (IG 2.3).
  public type InvoiceData = {
    kind : Text; // invoice | creditNote
    number : Text; issuedOn : Text; dueOn : Text; reference : Text; referencePretty : Text;
    seller : { name : Text; street : Text; houseNo : Text; postalCode : Text; town : Text; country : Text; uid : Text; vatRegistered : Bool };
    ibanPretty : Text; buyer : Buyer; description : Text;
    netMinor : Nat; vatRateBp : Nat; vatMinor : Nat; grossMinor : Nat; currency : Text;
    net : Text; vat : Text; gross : Text; vatRate : Text;
    qrPayload : Text; lang : Text; footer : Text;
    waiverText : Text; waiverVersion : Nat; acceptedLine : Text;
    creditOf : Text; // credit note: the invoice it cancels
  };
  func vatRateText(bp : Nat) : Text { let w = bp / 100; let f = bp % 100; Nat.toText(w) # (if (f == 0) "" else "." # (if (f % 10 == 0) Nat.toText(f / 10) else (if (f < 10) "0" else "") # Nat.toText(f))) };
  func qrPayload(s : Sale, number : Text, reference : Text) : Text {
    let ymd = Text.replace(s.issuedOn, #text "-", ""); let yymmdd = if (ymd.size() == 8) capText(Text.fromArray(Array.tabulate<Char>(6, func i = Text.toArray(ymd)[i + 2])), 6) else "";
    let uidDigits = do { var out = ""; for (c in billing.uid.chars()) if (Char.isDigit(c)) out #= Char.toText(c); out };
    let swico = if (uidDigits.size() == 9) "//S1/10/" # number # "/11/" # yymmdd # "/30/" # uidDigits # "/32/" # vatRateText(s.vatRateBp) # "/40/0:" # Nat.toText(billing.paymentDays) else "";
    let msg = capText(latin1("Invoice " # number # " - " # s.description), if (swico.size() < 140) Int.abs(140 - swico.size()) else 0);
    Text.join([
      "SPC", "0200", "1", billing.iban,
      "S", billing.legalName, billing.street, billing.houseNo, billing.postalCode, billing.town, billing.country,
      "", "", "", "", "", "", "",
      money(s.grossMinor), s.currency,
      "S", s.buyer.name, s.buyer.street, s.buyer.houseNo, s.buyer.postalCode, s.buyer.town, s.buyer.country,
      "SCOR", reference, msg, "EPD", swico,
    ].vals(), "\n");
  };
  func acceptedLine(s : Sale) : Text {
    if (s.acceptedHow == "online") { let (y, mo, d) = civilFromDays(s.acceptedAt / 1_000_000_000 / 86_400); "Accepted online by " # s.buyer.name # " (" # s.buyer.email # ") on " # Int.toText(y) # "-" # pad2(mo) # "-" # pad2(d) # " via the company sign-in — terms v" # Nat.toText(s.waiverVersion) # ", sale record #" # Nat.toText(s.id) # "." }
    else if (s.acceptedHow == "dealroom") "Accepted by " # s.buyer.name # " using the private external dealroom link on " # isoFromDays(s.acceptedAt / 86_400_000_000_000) # "; terms v" # s.waiverVersion.toText() # ", sale #" # s.id.toText() # ". Link possession recorded; no company sign-in or verified electronic signature asserted."
    else if (Text.startsWith(s.acceptedHow, #text "paper")) "Signed on paper — " # (switch (Text.stripStart(s.acceptedHow, #text "paper: ")) { case (?n) n; case null s.acceptedHow }) # " (recorded by " # nameOf(s.acceptedBy) # ", terms v" # Nat.toText(s.waiverVersion) # ", sale record #" # Nat.toText(s.id) # ")."
    else "";
  };
  func invoiceData(s : Sale, kind : Text) : InvoiceData {
    switch (invoiceSnapshots.get(s.id)) {
      case (?data) {
        if (kind == "invoice") return data;
        return { data with kind = "creditNote"; number = s.creditNoteNo; issuedOn = isoFromDays(s.cancelledAt / 86_400_000_000_000); dueOn = ""; reference = ""; referencePretty = ""; qrPayload = ""; creditOf = s.invoiceNo };
      }; case null {};
    };
    let number = if (kind == "creditNote") s.creditNoteNo else s.invoiceNo;
    let reference = if (kind == "creditNote") "" else s.reference;
    {
      kind; number; issuedOn = (if (kind == "creditNote") isoFromDays(s.cancelledAt / 1_000_000_000 / 86_400) else s.issuedOn); dueOn = (if (kind == "creditNote") "" else s.dueOn); reference; referencePretty = groups4(reference);
      seller = { name = billing.legalName; street = billing.street; houseNo = billing.houseNo; postalCode = billing.postalCode; town = billing.town; country = billing.country; uid = billing.uid; vatRegistered = billing.vatRegistered };
      ibanPretty = groups4(billing.iban); buyer = s.buyer; description = s.description;
      netMinor = s.netMinor; vatRateBp = s.vatRateBp; vatMinor = s.vatMinor; grossMinor = s.grossMinor; currency = s.currency;
      net = moneyPretty(s.netMinor); vat = moneyPretty(s.vatMinor); gross = moneyPretty(s.grossMinor); vatRate = vatRateText(s.vatRateBp);
      qrPayload = (if (kind == "creditNote") "" else qrPayload(s, number, reference)); lang = billing.lang; footer = billing.footer;
      waiverText = billing.waiverText; waiverVersion = s.waiverVersion; acceptedLine = acceptedLine(s);
      creditOf = (if (kind == "creditNote") s.invoiceNo else "");
    };
  };
  /// `stillInAbm`: the Apple Business Manager connection (and, after " · ", the device-management service) that still lists the device — "" once released or never there. A sold device still in ABM would force the buyer into the company's MDM at setup.
  public type SaleView = { sale : Sale; deviceName : Text; deviceTag : Text; deviceSerial : Text; createdByName : Text; acceptedByName : Text; checksByName : Text; invoice : ?InvoiceData; creditNote : ?InvoiceData; proposal : ?{ proposedMinor : Nat; basis : Text }; waiverText : Text; waiverVersion : Nat; stillInAbm : Text; handedOverAt : Int; phase : Text };
  func saleView(s : Sale) : SaleView {
    let a = Map.get(assets, Nat.compare, s.assetId);
    {
      sale = s; deviceName = (switch (a) { case (?a) deviceName(a); case null "device #" # Nat.toText(s.assetId) }); deviceTag = (switch (a) { case (?a) a.tag; case null "" }); deviceSerial = (switch (a) { case (?a) a.serial; case null "" });
      createdByName = nameOf(s.createdBy); acceptedByName = (if (s.acceptedHow == "online") s.buyer.name else nameOf(s.acceptedBy)); checksByName = nameOf(s.checksBy);
      invoice = (if (s.invoiceNo == "") null else ?invoiceData(s, "invoice")); creditNote = (if (s.creditNoteNo == "") null else ?invoiceData(s, "creditNote"));
      proposal = proposal(s.assetId); waiverText = billing.waiverText; waiverVersion = billing.waiverVersion;
      stillInAbm = abmHolds(a); handedOverAt = handedOverAt(s.id); phase = salePhase(s);
    };
  };
  func salePhase(s : Sale) : Text {
    if (s.status == "cancelled") "cancelled"
    else if (handedOverAt(s.id) != 0) "complete"
    else if (s.status == "paid") "paid"
    else if (s.status == "issued") "invoice"
    else "offer";
  };
  public type SaleSummary = {
    id : Nat; assetId : Nat; phase : Text; status : Text; buyerName : Text;
    deviceName : Text; deviceTag : Text; invoiceNo : Text; creditNoteNo : Text;
    grossMinor : Nat; currency : Text; updatedAt : Int; wiped : Bool; mdmRemoved : Bool;
    receiptPending : Bool;
  };
  // All phase counts are computed before pagination. This overview intentionally excludes
  // buyer email/address, invoice snapshots, terms and other detail-only personal data.
  public shared query func salesBoard(tok : Text, phase : Text, search : Text, offset : Nat) : async { counts : [(Text, Nat)]; total : Nat; matched : Nat; rows : [SaleSummary]; hasMore : Bool } {
    if (finance(tok) == null) return { counts = []; total = 0; matched = 0; rows = []; hasMore = false };
    let counts = Map.empty<Text, Nat>(); let rows = List.empty<SaleSummary>();
    let q = lower(capText(norm(search), 150));
    for ((_, s) in sales.entries()) {
      let p = salePhase(s); counts.add(p, (counts.get(p) ?? 0) + 1);
      let a = assets.get(s.assetId); let name = switch (a) { case (?a) deviceName(a); case null "Device" };
      let tag = switch (a) { case (?a) a.tag; case null "" };
      let serial = switch (a) { case (?a) a.serial; case null "" };
      if ((phase == "" or phase == p or (phase == "open" and p != "complete" and p != "cancelled")) and (q == "" or Text.contains(lower(name # " " # tag # " " # serial # " " # s.invoiceNo # " " # s.buyer.name), #text q))) {
        rows.add({ id = s.id; assetId = s.assetId; phase = p; status = s.status; buyerName = s.buyer.name; deviceName = name; deviceTag = tag; invoiceNo = s.invoiceNo; creditNoteNo = s.creditNoteNo; grossMinor = s.grossMinor; currency = s.currency; updatedAt = s.updatedAt; wiped = s.wiped; mdmRemoved = s.mdmRemoved; receiptPending = switch (deals.get(s.id)) { case (?d) d.completedAt == 0; case null false } });
      };
    };
    let sorted = Array.sort<SaleSummary>(rows.toArray(), func(a, b) = Int.compare(b.updatedAt, a.updatedAt));
    let start = Nat.min(offset, sorted.size()); let size = Nat.min(100, sorted.size() - start);
    { counts = counts.entries().toArray(); total = sales.size(); matched = sorted.size(); rows = Array.tabulate<SaleSummary>(size, func i = sorted[start + i]); hasMore = start + size < sorted.size() };
  };
  /// Admins: the sales, newest first; status "" = everything, else that status, "open" = draft/offered/accepted/issued.
  public shared query func listSales(tok : Text, status : Text) : async [SaleView] {
    switch (finance(tok)) { case null return []; case (?_) {} };
    let out = List.empty<SaleView>();
    for ((_, s) in Map.entries(sales)) if (status == "" or s.status == status or (status == "open" and (s.status != "cancelled" and handedOverAt(s.id) == 0))) List.add(out, saleView(s));
    let arr = Array.sort<SaleView>(List.toArray(out), func(a, b) = Int.compare(b.sale.updatedAt, a.sale.updatedAt));
    Array.tabulate<SaleView>(Nat.min(arr.size(), 500), func i = arr[i]);
  };
  /// One sale with everything the pages need — admins, or the buyer for their own.
  public shared query func getSale(tok : Text, id : Nat) : async ?SaleView {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    switch (Map.get(sales, Nat.compare, id)) { case (?s) { if (m.role == "admin" or m.role == "finance" or s.buyer.pid == m.id) ?saleView(s) else null }; case null null };
  };
  /// Admins: the device's purchase details (if any) and its open sale — for the device page.
  public shared query func saleOfDevice(tok : Text, assetId : Nat) : async { purchase : ?Purchase; sale : ?SaleView; proposal : ?{ proposedMinor : Nat; basis : Text }; billingReady : Text } {
    switch (admin(tok)) { case null return { purchase = null; sale = null; proposal = null; billingReady = "admins only" }; case (?_) {} };
    { purchase = Map.get(purchases, Nat.compare, assetId); sale = (switch (openSaleFor(assetId)) { case (?s) ?saleView(s); case null null }); proposal = proposal(assetId); billingReady = (switch (billingReady()) { case (?e) e; case null "" }) };
  };
  /// Admins: the invoices and credit notes of a year (or all) for finance — number, dates, buyer, device, net/VAT/gross, status, archived document hash.
  public shared query func salesExportCsv(tok : Text, year : Text) : async Text {
    switch (finance(tok)) { case null return ""; case (?_) {} };
    var out = "number,kind,issued,due,status,buyer,buyer e-mail,device,serial,net,vat rate,vat,gross,currency,reference,paid at,credit note,cancel reason,pdf sha256\n";
    let rows = List.empty<(Text, Text)>();
    let yr = norm(year);
    for ((_, s) in Map.entries(sales)) if (s.invoiceNo != "" and (yr == "" or Text.startsWith(s.issuedOn, #text yr))) {
      let a = Map.get(assets, Nat.compare, s.assetId);
      let dev = switch (a) { case (?a) deviceName(a); case null "" }; let ser = switch (a) { case (?a) a.serial; case null "" };
      let (paidY, paidM, paidD) = civilFromDays(s.paidAt / 1_000_000_000 / 86_400);
      List.add(rows, (s.invoiceNo, Text.join([csv(s.invoiceNo), "invoice", csv(s.issuedOn), csv(s.dueOn), csv(s.status), csv(s.buyer.name), csv(s.buyer.email), csv(dev), csv(ser), money(s.netMinor), vatRateText(s.vatRateBp), money(s.vatMinor), money(s.grossMinor), csv(s.currency), csv(s.reference), csv(if (s.paidAt == 0) "" else Int.toText(paidY) # "-" # pad2(paidM) # "-" # pad2(paidD)), csv(s.creditNoteNo), csv(s.cancelReason), csv(s.pdfHash)].vals(), ",")));
      if (s.creditNoteNo != "") List.add(rows, (s.creditNoteNo, Text.join([csv(s.creditNoteNo), "credit note", csv(isoFromDays(s.cancelledAt / 1_000_000_000 / 86_400)), "", "cancelled", csv(s.buyer.name), csv(s.buyer.email), csv(dev), csv(ser), "-" # money(s.netMinor), vatRateText(s.vatRateBp), "-" # money(s.vatMinor), "-" # money(s.grossMinor), csv(s.currency), "", "", csv("cancels " # s.invoiceNo), csv(s.cancelReason), ""].vals(), ",")));
    };
    for ((_, line) in Array.sort<(Text, Text)>(List.toArray(rows), func(a, b) = Text.compare(a.0, b.0)).vals()) out #= line # "\n";
    out;
  };


  // ---- Finance: central role, financial projections and append-only payments ----
  public type PaymentInput = { amountMinor : Nat; paidOn : Text; reference : Text; reason : Text; reverses : ?Nat; requestId : Text };
  public type PaymentEntry = { id : Nat; amountMinor : Nat; paidOn : Text; reference : Text; reason : Text; reverses : ?Nat; requestId : Text; by : Text; at : Int };
  let salePayments = Map.empty<Nat, [PaymentEntry]>();
  func paymentRows(s : Sale) : [PaymentEntry] {
    salePayments.get(s.id) ?? (if (s.paidAt == 0) [] else [{ id = 1; amountMinor = s.grossMinor; paidOn = isoFromDays(s.paidAt / 86_400_000_000_000); reference = s.paidNote; reason = "Payment confirmed before the Finance ledger was introduced"; reverses = null; requestId = "legacy-payment"; by = "Legacy record"; at = s.paidAt }])
  };
  func paymentTotal(rows : [PaymentEntry]) : Nat {
    var amount : Int = 0;
    for (p in rows.values()) { if (p.reverses == null) amount += p.amountMinor else amount -= p.amountMinor };
    if (amount < 0) 0 else Int.abs(amount)
  };
  func ownPurchase(m : Me, s : Sale) : Bool = s.buyer.pid == m.id or (norm(s.buyer.email) != "" and lower(norm(s.buyer.email)) == lower(norm(m.email)));
  func recordPayment(m : Me, s : Sale, revision : Nat, input : PaymentInput) : { ok : Bool; detail : Text } {
    if (ownPurchase(m, s)) return { ok = false; detail = "Another Finance member or Assets admin must confirm your own purchase" };
    if (s.invoiceNo == "" or s.status == "cancelled") return { ok = false; detail = "Payments require an active issued invoice" };
    let rows = paymentRows(s);
    if (input.requestId.size() < 8 or input.requestId.size() > 100 or input.reference.size() > 200 or input.reason.size() > 500) return { ok = false; detail = "Check the payment reference, reason and request identifier" };
    switch (rows.find(func p = p.requestId == input.requestId)) {
      case (?p) return { ok = p.by == m.id and p.amountMinor == input.amountMinor and p.paidOn == input.paidOn and p.reference == input.reference and p.reason == input.reason and p.reverses == input.reverses; detail = "This payment request was already processed; refresh the ledger" };
      case null {};
    };
    if (rows.size() != revision) return { ok = false; detail = "Payments changed. Refresh before recording another entry" };
    if (rows.size() >= 1000) return { ok = false; detail = "Payment history limit reached; contact IT" };
    let date = parseIso(input.paidOn) ?? (return { ok = false; detail = "Use a valid payment date" });
    if (date > todayDays() or input.amountMinor == 0) return { ok = false; detail = "Use a positive amount and a payment date that is not in the future" };
    let total = paymentTotal(rows);
    switch (input.reverses) {
      case (?id) {
        let original = rows.find(func p = p.id == id) ?? (return { ok = false; detail = "Original payment not found" });
        if (original.reverses != null or rows.any(func p = p.reverses == ?id) or original.amountMinor != input.amountMinor or norm(input.reason) == "" or input.paidOn != original.paidOn) return { ok = false; detail = "Reverse an unreversed payment in full, keep its date and give a correction reason" };
      };
      case null { if (total + input.amountMinor > s.grossMinor) return { ok = false; detail = "This exceeds the outstanding invoice amount" } };
    };
    let entry : PaymentEntry = { input with id = rows.size() + 1; by = m.id; at = now() };
    let next = rows.concat([entry]); salePayments.add(s.id, next);
    let paid = paymentTotal(next) == s.grossMinor;
    putSale({ s with status = if (paid) "paid" else "issued"; paidAt = if (paid) now() else 0; paidNote = "Recorded in Finance ledger" });
    saleEvent(s, m.id, (if (input.reverses == null) "Payment recorded: " else "Payment corrected: ") # money(input.amountMinor) # " " # s.currency # " · " # input.paidOn);
    if (paid and total < s.grossMinor) queueFinanceNotice(s, "paid");
    { ok = true; detail = if (paid) "Invoice fully paid. IT can prepare the hand-over." else "Payment history saved. The outstanding balance remains visible." }
  };
  public shared func recordSalePayment(tok : Text, id : Nat, revision : Nat, input : PaymentInput) : async { ok : Bool; detail : Text } {
    let m = finance(tok) ?? (return { ok = false; detail = "Finance or Assets admins only" });
    let s = sales.get(id) ?? (return { ok = false; detail = "No such sale" });
    recordPayment(m, s, revision, input)
  };
  public shared query func salePaymentHistory(tok : Text, id : Nat) : async ?{ entries : [PaymentEntry]; revision : Nat; paidMinor : Nat; outstandingMinor : Nat; canRecord : Bool } {
    let m = finance(tok) ?? (return null);
    let s = sales.get(id) ?? (return null); let rows = paymentRows(s); let paid = paymentTotal(rows);
    ?{ entries = rows.map(func p = { p with by = nameOf(p.by) }); revision = rows.size(); paidMinor = paid; outstandingMinor = if (paid >= s.grossMinor) 0 else s.grossMinor - paid; canRecord = s.invoiceNo != "" and s.status != "cancelled" and not ownPurchase(m, s) }
  };
  public shared query func financePayments(tok : Text, overdueOnly : Bool, offset : Nat) : async ?{ open : Nat; overdue : Nat; totals : [(Text, Nat)]; matched : Nat; rows : [{ id : Nat; number : Text; buyer : Text; device : Text; dueOn : Text; currency : Text; outstandingMinor : Nat }] } {
    if (finance(tok) == null) return null;
    let rows = List.empty<{ id : Nat; number : Text; buyer : Text; device : Text; dueOn : Text; currency : Text; outstandingMinor : Nat }>();
    let totals = Map.empty<Text, Nat>(); var open = 0; var overdue = 0;
    for ((_, s) in sales.entries()) if (s.invoiceNo != "" and s.status != "cancelled") {
      let paid = paymentTotal(paymentRows(s));
      if (paid < s.grossMinor) {
        open += 1; let due = (parseIso(s.dueOn) ?? todayDays()) < todayDays(); if (due) overdue += 1;
        let outstandingMinor = s.grossMinor - paid; totals.add(s.currency, (totals.get(s.currency) ?? 0) + outstandingMinor);
        if (not overdueOnly or due) rows.add({ id = s.id; number = s.invoiceNo; buyer = s.buyer.name; device = assets.get(s.assetId).map(deviceName) ?? "Device"; dueOn = s.dueOn; currency = s.currency; outstandingMinor });
      };
    };
    let sorted = rows.toArray().sort(func(a, b) = Text.compare(a.dueOn, b.dueOn)); let start = Nat.min(offset, sorted.size()); let size = Nat.min(100, sorted.size() - start);
    ?{ open; overdue; totals = totals.entries().toArray(); matched = sorted.size(); rows = Array.tabulate(size, func i = sorted[start + i]) }
  };
  public shared query func paymentsExportCsv(tok : Text) : async Text {
    if (finance(tok) == null) return "";
    var out = "invoice,payment id,kind,date,amount,currency,reference,reason,recorded by,recorded at,reverses\n";
    for ((_, s) in sales.entries()) for (p in paymentRows(s).values()) {
      out #= Text.join([csv(s.invoiceNo), p.id.toText(), if (p.reverses == null) "payment" else "correction", csv(p.paidOn), (if (p.reverses == null) "" else "-") # money(p.amountMinor), csv(s.currency), csv(p.reference), csv(p.reason), csv(nameOf(p.by)), p.at.toText(), p.reverses.map(func id = id.toText()) ?? ""].values(), ",") # "\n";
    }; out
  };
  public type ValuationInput = { priceMinor : Nat; currency : Text; purchasedOn : Text; inServiceOn : Text; months : Nat; residualMinor : Nat; reason : Text };
  public type Valuation = { input : ValuationInput; revision : Nat; by : Text; at : Int };
  let valuations = Map.empty<Nat, Valuation>();
  let valuationHistory = Map.empty<Nat, [Valuation]>();
  let financialRevisions = Map.empty<Nat, Nat>();
  var valuationDefaults : [{ kind : Text; months : Nat }] = [];
  var valuationDefaultsRevision : Nat = 0;
  public type FinanceAsset = { id : Nat; tag : Text; serial : Text; name : Text; kind : Text; status : Text; assignee : Text; archived : Bool; purchase : ?Purchase; valuation : ?Valuation; bookMinor : ?Nat; revision : Nat };
  func bookValue(v : ValuationInput, asOf : Int) : ?Nat {
    let start = parseIso(v.inServiceOn) ?? (return null);
    if (asOf < start) return null;
    let (sy, sm, _) = civilFromDays(start); let (ey, em, _) = civilFromDays(asOf);
    // Calendar-month boundaries: depreciation starts in the month AFTER commissioning.
    let elapsed = Nat.min(v.months, Int.abs((ey - sy) * 12 + em - sm));
    if (v.months == 0 or v.residualMinor > v.priceMinor) return null;
    ?(v.priceMinor - (v.priceMinor - v.residualMinor) * elapsed / v.months)
  };
  func financeAssetRow(a : Asset, asOf : Int) : FinanceAsset {
    let v = valuations.get(a.id); let p = purchases.get(a.id);
    let consistent = switch (v, p) { case (?v, ?p) v.input.priceMinor == p.priceMinor and v.input.currency == p.currency and v.input.purchasedOn == p.date; case _ false };
    { id = a.id; tag = a.tag; serial = a.serial; name = deviceName(a); kind = a.kind; status = a.status; assignee = nameOf(a.assignee); archived = a.archived; purchase = p.map(func p = { p with note = ""; by = nameOf(p.by) }); valuation = v.map(func v = { v with by = nameOf(v.by) }); bookMinor = if (consistent) (switch (v) { case (?v) bookValue(v.input, asOf); case null null }) else null; revision = financialRevisions.get(a.id) ?? 0 }
  };
  public shared query func financeInventory(tok : Text, asOf : Text, search : Text, offset : Nat) : async ?{ rows : [FinanceAsset]; matched : Nat; missing : Nat; totals : [(Text, Nat)]; defaults : [{ kind : Text; months : Nat }]; defaultsRevision : Nat } {
    if (finance(tok) == null) return null;
    let date = parseIso(asOf) ?? (return null); let q = lower(capText(norm(search), 150));
    let rows = List.empty<FinanceAsset>(); let totals = Map.empty<Text, Nat>(); var missing = 0;
    for ((_, a) in assets.entries()) {
      let row = financeAssetRow(a, date);
      if (not a.archived and a.status != "sold" and a.status != "scrapped") switch (row.bookMinor, row.purchase) { case (?n, ?p) totals.add(p.currency, (totals.get(p.currency) ?? 0) + n); case _ missing += 1 };
      if (q == "" or Text.contains(lower(row.name # " " # row.tag # " " # row.serial # " " # row.assignee # " " # row.kind), #text q)) rows.add(row);
    };
    let all = rows.toArray(); let start = Nat.min(offset, all.size()); let size = Nat.min(100, all.size() - start);
    ?{ rows = Array.tabulate<FinanceAsset>(size, func i = all[start + i]); matched = all.size(); missing; totals = totals.entries().toArray(); defaults = valuationDefaults; defaultsRevision = valuationDefaultsRevision }
  };
  public shared query func financeAsset(tok : Text, id : Nat, asOf : Text) : async ?{ asset : FinanceAsset; history : [Valuation] } {
    if (finance(tok) == null) return null;
    let a = assets.get(id) ?? (return null); let date = parseIso(asOf) ?? (return null);
    ?{ asset = financeAssetRow(a, date); history = (valuationHistory.get(id) ?? []).map(func v = { v with by = nameOf(v.by) }) }
  };
  public shared func saveAssetValuation(tok : Text, id : Nat, revision : Nat, input : ValuationInput) : async { ok : Bool; detail : Text } {
    let m = finance(tok) ?? (return { ok = false; detail = "Finance or Assets admins only" });
    if (not assets.containsKey(id)) return { ok = false; detail = "No such asset" };
    if ((financialRevisions.get(id) ?? 0) != revision) return { ok = false; detail = "Valuation changed. Reload before saving" };
    let purchaseDate = parseIso(input.purchasedOn) ?? (return { ok = false; detail = "Use a valid purchase date" });
    let serviceDate = parseIso(input.inServiceOn) ?? (return { ok = false; detail = "Use a valid in-service date" });
    if (purchaseDate > todayDays() or serviceDate < purchaseDate or serviceDate > todayDays() or input.months < 1 or input.months > 600 or input.residualMinor > input.priceMinor or input.priceMinor > 1_000_000_000_000 or input.currency.size() != 3 or not input.currency.chars().all(func c = c >= 'A' and c <= 'Z') or norm(input.reason) == "" or input.reason.size() > 500) return { ok = false; detail = "Check dates, currency, useful life (1–600 months), residual value and change reason" };
    let history = valuationHistory.get(id) ?? [];
    if (history.size() >= 1000) return { ok = false; detail = "Valuation history limit reached; contact IT" };
    let v = { input; revision = revision + 1; by = m.id; at = now() };
    valuations.add(id, v); valuationHistory.add(id, history.concat([v])); financialRevisions.add(id, revision + 1);
    purchases.add(id, { priceMinor = input.priceMinor; currency = input.currency; date = input.purchasedOn; note = input.reason; by = m.id; at = now() });
    log(m.email, "Financial valuation updated for asset #" # id.toText());
    { ok = true; detail = "Valuation saved. Issued invoices are unchanged." }
  };
  public shared func setValuationDefaults(tok : Text, revision : Nat, input : [{ kind : Text; months : Nat }]) : async { ok : Bool; detail : Text } {
    let m = finance(tok) ?? (return { ok = false; detail = "Finance or Assets admins only" });
    if (revision != valuationDefaultsRevision) return { ok = false; detail = "Defaults changed. Reload before saving" };
    if (input.size() > 6 or input.any(func r = not has(["laptop", "phone", "tablet", "monitor", "accessory", "other"], r.kind) or r.months < 1 or r.months > 600 or input.filter(func x = x.kind == r.kind).size() != 1)) return { ok = false; detail = "Choose one useful life (1–600 months) per hardware type" };
    valuationDefaults := input; valuationDefaultsRevision += 1;
    log(m.email, "Financial useful-life defaults updated: " # debug_show(input));
    { ok = true; detail = "Defaults saved for new valuations. Existing valuations keep their agreed useful life." }
  };
  public shared query func financeInventoryCsv(tok : Text, asOf : Text) : async Text {
    if (finance(tok) == null) return ""; let date = parseIso(asOf) ?? (return "");
    var out = "as of,tag,serial,device,type,current status,assigned to,archived,purchase cost,currency,purchased,in service,months,residual,book value\n";
    for ((_, a) in assets.entries()) {
      let r = financeAssetRow(a, date); let p = r.purchase; let v = r.valuation;
      out #= Text.join([csv(asOf), csv(a.tag), csv(a.serial), csv(r.name), csv(a.kind), csv(a.status), csv(r.assignee), if (a.archived) "yes" else "no", p.map(func p = money(p.priceMinor)) ?? "", p.map(func p = csv(p.currency)) ?? "", p.map(func p = csv(p.date)) ?? "", v.map(func v = csv(v.input.inServiceOn)) ?? "", v.map(func v = v.input.months.toText()) ?? "", v.map(func v = money(v.input.residualMinor)) ?? "", r.bookMinor.map(money) ?? ""].values(), ",") # "\n";
    }; out
  };
  type FinanceTeamStatus = { mode : Text; enabled : Bool; recipients : [Text]; revision : Nat };
  type FinanceHub = actor { hub_financeTeam : shared query () -> async FinanceTeamStatus };
  public shared func financeSetup(tok : Text) : async ?{ mode : Text; enabled : Bool; activeMembers : Nat } {
    if (finance(tok) == null or hubId == "") return null;
    let id = hubId; let hub : FinanceHub = actor (id);
    let team = try { await (with timeout = 10) hub.hub_financeTeam() } catch (_) { return null };
    if (finance(tok) == null or hubId != id) return null;
    ?{ mode = team.mode; enabled = team.enabled; activeMembers = team.recipients.size() }
  };
  type FinanceNotice = { saleId : Nat; kind : Text; attempts : Nat; nextAt : Int; detail : Text; delivered : [Text]; complete : Bool };
  let financeNotices = Map.empty<Text, FinanceNotice>();
  transient var financeNoticeBusy = false;
  func queueFinanceNotice(s : Sale, kind : Text) {
    let key = s.id.toText() # ":" # kind;
    if (not financeNotices.containsKey(key)) financeNotices.add(key, { saleId = s.id; kind; attempts = 0; nextAt = 0; detail = "Waiting for Hub delivery"; delivered = []; complete = false });
  };
  public shared query func saleFinanceNotification(tok : Text, id : Nat) : async [{ kind : Text; detail : Text; complete : Bool }] {
    if (finance(tok) == null) return [];
    financeNotices.values().filter(func n = n.saleId == id).map(func n = { kind = n.kind; detail = n.detail; complete = n.complete }).toArray()
  };
  func sendFinanceNotices() : async () {
    if (financeNoticeBusy or hubId == "" or not Hub.directoryFresh(lastDirectoryPull)) return;
    financeNoticeBusy := true;
    try {
      let configuredHub = hubId; let hub : FinanceHub = actor (configuredHub);
      let team = await (with timeout = 10) hub.hub_financeTeam();
      var count = 0;
      for ((key, n) in financeNotices.entries().toArray().values()) if (not n.complete and n.nextAt <= now() and count < 4) {
        count += 1;
        let s = sales.get(n.saleId);
        switch (s) { case (?s) {
          if (hubId != configuredHub or not Hub.directoryFresh(lastDirectoryPull)) return;
          let recipients = if (n.kind == "invoice" and team.enabled and team.recipients.size() > 0) team.recipients else people.values().filter(func u = Hub.isActive(people, u.email) and roleOf(u.email) == "admin").map(func u = u.email).toArray();
          var delivered = n.delivered; var detail = "No active recipient. Configure Finance or an Assets admin in Hub.";
          var attempted = 0;
          for (email in recipients.values()) if (not delivered.any(func e = e == email) and attempted < 10) {
            attempted += 1;
            if (Hub.isActive(people, email) and (roleOf(email) == "admin" or (n.kind == "invoice" and roleOf(email) == "finance"))) {
              let result = await notifyPerson(email, (if (n.kind == "invoice") "Invoice ready for payment review: " else "Paid — prepare hardware hand-over: ") # s.invoiceNo, appLink("sale/" # s.id.toText()), "assets.finance", "finance-" # key # "-" # email);
              if (result == "") delivered := delivered.concat([email]) else detail := result;
            } else detail := "Waiting for current Hub permissions";
          };
          let complete = recipients.size() > 0 and recipients.all(func e = delivered.any(func d = d == e));
          financeNotices.add(key, { n with delivered; attempts = n.attempts + 1; nextAt = now() + 300_000_000_000; complete; detail = if (complete) "Accepted by Hub. Slack follows each recipient’s notification settings." else detail });
        }; case null { financeNotices.remove(key) } };
      };
    } catch (_) {} finally { financeNoticeBusy := false };
  };

  // =====================================================================
  // demo seed (a sample register to try the intake on) & housekeeping
  // =====================================================================
  var demoSeeded : Bool = false;
  public shared func seedDemo(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (demoSeeded or Map.size(assets) > 0) return { ok = false; detail = "the register is not empty" };
    demoSeeded := true;
    let rows : [(Text, Text, Text, Text, Text, Text)] = [
      ("INV-0001", "C02XG2JHJGH7", "Apple", "MacBook Pro 14\" M3", "laptop", "assigned"),
      ("INV-0002", "FVFZK1ABCDEF", "Apple", "MacBook Air 13\" M2", "laptop", "in_stock"),
      ("INV-0003", "7HQK2N3", "Dell", "Latitude 7440", "laptop", "assigned"),
      ("INV-0004", "PF3A8B9C", "Lenovo", "ThinkPad X1 Carbon", "laptop", "loaned"),
      ("INV-0005", "G6TX9RQ2L7", "Apple", "iPhone 15", "phone", "assigned"),
      ("INV-0006", "DMPXQ1234567", "Apple", "iPad Air", "tablet", "in_stock"),
      ("INV-0007", "SN-M27-001", "Dell", "U2723QE 27\"", "monitor", "in_stock"),
      ("INV-0008", "C02F7ABCD3QT", "Apple", "MacBook Pro 16\" M1", "laptop", "sold"),
    ];
    var i = 0;
    for ((tag, serial, vendor, model, kind, status) in rows.vals()) {
      let a = createInternal(m.id, { tag; serial; vendor; model; kind; note = "sample device" }, status, (if (status == "assigned" or status == "loaned") m.id else ""), (if (status == "sold") "refurbisher" else ""), "sample");
      i += 1;
    };
    log(m.email, "sample register seeded (" # Nat.toText(i) # " devices)");
    { ok = true; detail = Nat.toText(i) # " sample devices" };
  };
  public shared func removeDemo(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let ids = List.empty<Nat>();
    for ((id, a) in Map.entries(assets)) if (a.note == "sample device") List.add(ids, id);
    for (id in List.values(ids)) {
      ignore Map.delete(assets, Nat.compare, id);
      let evs = List.empty<Nat>(); for ((eid, e) in Map.entries(events)) if (e.assetId == id) List.add(evs, eid);
      for (eid in List.values(evs)) ignore Map.delete(events, Nat.compare, eid);
      let phs = List.empty<Nat>(); for ((pid, p) in Map.entries(photos)) if (p.assetId == id) List.add(phs, pid);
      for (pid in List.values(phs)) { switch (Map.get(photos, Nat.compare, pid)) { case (?p) photoBytes -= Nat.min(photoBytes, p.bytes.size()); case null {} }; ignore Map.delete(photos, Nat.compare, pid) };
    };
    demoSeeded := false;
    log(m.email, "sample register removed (" # Nat.toText(List.size(ids)) # " devices)");
    { ok = true; detail = Nat.toText(List.size(ids)) # " removed" };
  };
  public shared func syncNow(tok : Text) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    let n = try { await pullDirectory() } catch (e) { return { ok = false; detail = Error.message(e) } };
    { ok = true; detail = Nat.toText(n) # " people" };
  };

  // =====================================================================
  // person ids (0.6.0): assignee, createdBy, event/photo authors and person "to" targets are the hub's
  // stable person id. This release rewrites older address-keyed records once, right after the upgrade
  // (docs/PERSON-IDS.md); writes are refused with a plain sentence until that is done, reads keep working.
  // =====================================================================
  var idMigration : Text = "pending"; // pending | done
  transient let MIGRATING : Text = "people ids are being migrated — try again in a minute";
  func migrating() : Bool = idMigration != "done";
  func isAddress(t : Text) : Bool = Text.contains(t, #char '@') and not Text.startsWith(t, #text "legacy:") and not Text.contains(t, #char ' ');
  func migrateIds() : async () {
    if (idMigration == "done") return;
    if (Map.size(assets) == 0 and Map.size(events) == 0) { idMigration := "done"; return }; // fresh install
    if (hubId == "") return;
    try { ignore await pullDirectory() } catch (_) {};
    let seen = Map.empty<Text, Bool>();
    func note(x : Text) { if (isAddress(x)) Map.add(seen, Text.compare, lower(x), true) };
    for ((_, a) in Map.entries(assets)) { note(a.assignee); note(a.createdBy) };
    for ((_, e) in Map.entries(events)) { note(e.by); if (e.kind == "handed_out" or e.kind == "loaned" or e.kind == "reassigned") note(e.to) };
    for ((_, ph) in Map.entries(photos)) note(ph.by);
    let emails = Iter.toArray(Map.keys(seen));
    let found = Map.empty<Text, Text>();
    if (emails.size() > 0) {
      let hits = try { await Hub.lookupIds(Hub.hub(hubId), emails) } catch (_) { return }; // hub unreachable: the 30-second timer retries
      for ((e, pid) in hits.vals()) Map.add(found, Text.compare, e, pid);
    };
    if (idMigration == "done") return;
    func mig(x : Text) : Text = if (isAddress(x)) Hub.migrateKey(found, x) else x;
    for ((id, a) in Iter.toArray(Map.entries(assets)).vals()) Map.add(assets, Nat.compare, id, { a with assignee = mig(a.assignee); createdBy = mig(a.createdBy) });
    for ((id, e) in Iter.toArray(Map.entries(events)).vals()) {
      let to2 = if (e.kind == "handed_out" or e.kind == "loaned" or e.kind == "reassigned") mig(e.to) else e.to;
      if (isAddress(e.by) or to2 != e.to) Map.add(events, Nat.compare, id, { e with by = mig(e.by); to = to2 });
    };
    for ((id, ph) in Iter.toArray(Map.entries(photos)).vals()) if (isAddress(ph.by)) Map.add(photos, Nat.compare, id, { ph with by = mig(ph.by) });
    idMigration := "done";
    log("system", "people references migrated to person ids: " # Nat.toText(emails.size()) # " addresses, " # Nat.toText(Map.size(found)) # " known to the hub, the rest kept as legacy:<address>");
  };
  transient let _idMigrationTimer = Timer.setTimer<system>(#seconds 0, func() : async () { await migrateIds() });

  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { try { ignore await pullDirectory() } catch (_) {}; ignore Hub.pruneSessions(sessions); pruneFormerContacts(); if (migrating()) { try { await migrateIds() } catch (_) {} } });
  ignore Timer.recurringTimer<system>(#seconds 60, func() : async () { await sendDealNotices(); await sendFinanceNotices() });
  ignore Timer.recurringTimer<system>(#seconds 21600, func() : async () { await mdmSyncAll(); await abmSyncAll() });
  /// Aggregate-only read for Hub Operations; no session or records leave this app.
  public shared query ({ caller }) func hub_operations(viewer : Text) : async Operations.Snapshot {
    assert Hub.isHub(caller, hubId);
    let email = emailOfPid(viewer);
    if (viewer == "" or pidOf(email) != viewer or not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or Hub.appRole(people, email, "assets") != "admin") return Operations.denied();
    if (migrating()) return Operations.unavailable();
    var total = 0; var stock = 0; var assigned = 0; var pending = 0; var preparing = 0; var saleOpen = 0;
    for (a in assets.values()) {
      let tracked = hardwarePending(a.id);
      if (tracked) { pending += 1; switch (handovers.get(a.id)) { case (?p) { if (p.stage == "received") preparing += 1 }; case null {} } };
      if (not a.archived) {
        total += 1;
        if (a.status == "in_stock" and a.assignee == "" and not tracked) stock += 1;
        if (a.assignee != "" and a.status != "sold" and a.status != "scrapped") assigned += 1;
      };
    };
    for (s in sales.values()) { let phase = salePhase(s); if (phase != "complete" and phase != "cancelled") saleOpen += 1 };
    Operations.ready([("total", total), ("stock", stock), ("assigned", assigned), ("handover", pending), ("preparing", preparing), ("sales", saleOpen)]);
  };

};
