import Operations "mo:kebab-hub/Operations";
/// kebab-stack watch — the company's domains, watched.
///
/// Every 15 minutes the watch asks two public resolvers (Cloudflare and
/// Google, DNS-over-HTTPS) for the records of every domain you list — A, AAAA,
/// CNAME, MX, TXT, NS, CAA — and compares them with what you expect. A change
/// both resolvers agree on becomes an event and a notification; you accept it
/// as the new expectation or you go and fix it. CNAME targets that no longer
/// resolve (a subdomain waiting to be taken over) and domains about to expire
/// (RDAP, once a day) are flagged the same way. Every run is logged, so the
/// answer to "do you monitor your domains for anomalies?" comes with evidence.
///
/// 0.3.0 adds posture (DNSSEC, registrar lock, DMARC/SPF/MTA-STS, CAA) with
/// alerts on weakening, a certificate-log watch (new issuer, names seen,
/// certificate end), operator recognition for new addresses (RDAP netblock
/// owner + learning period + trusted operators), lookalike domains and a
/// monthly report.
///
/// Sign-in, people and notifications come from the hub (mo:kebab-hub).
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
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Timer "mo:core/Timer";
import Error "mo:core/Error";
import Json "mo:json";

persistent actor Watch {
  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = "";
  var owner : ?Principal = null;
  var appUrl : Text = "";
  var orgName : Text = "";
  var adminGroup : Text = "watch-admins";
  var adminEmails : [Text] = [];
  var adminClaimed : Bool = false;
  var intervalMins : Nat = 15; // how often the timer checks (5–120)
  var expiryWarnDays : Nat = 30;
  var notifyAdmins : Bool = true; // every admin gets alerts; watchers per domain on top
  var monitoringSince : Int = 0; // first completed run
  var trustedOperators : [Text] = []; // 0.3.0 — operators whose new addresses are learned, not alerted
  var lastReportMonth : Text = ""; // 0.3.0 — "YYYY-MM" the monthly report is up to
  transient let BUILD_VERSION : Text = "0.10.1";
  transient let LEARN_NS : Int = 48 * 3_600_000_000_000; // learning period after a domain is added
  transient let H : Int = 3_600_000_000_000;
  transient let D : Int = 24 * 3_600_000_000_000;

  // =====================================================================
  // hub SDK state
  // =====================================================================
  let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
  let ids : Map.Map<Text, Text> = Map.empty<Text, Text>(); // address -> hub person id (0.5.0) — watchers, creators and event authors store the id
  let former : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // id -> last row of a person whose address moved on
  let groupsCache : Map.Map<Text, [Text]> = Map.empty<Text, [Text]>();
  var lastDirectoryPull : Int = 0;
  transient var directoryEpoch : Nat = 0;
  transient var directoryPullRunning : Bool = false;
  type IC = actor { raw_rand : () -> async Blob };
  transient let ic00 : IC = actor "aaaaa-aa";

  // =====================================================================
  // domains, records, events, runs
  // =====================================================================
  public type Domain = {
    id : Nat;
    name : Text; // fqdn, lower-case, no trailing dot
    types : [Text]; // record types watched
    enabled : Bool;
    watchers : [Text]; // extra people to notify (e-mails from the hub directory)
    note : Text;
    createdAt : Int;
    createdBy : Text;
    lastCheck : Int;
    lastResult : Text; // "ok" | "N changes" | "error: …"
    expiresAt : Text; // ISO date from RDAP ("" = unknown)
    expiryCheckedAt : Int;
    expiryDetail : Text; // status words from the registry, or why unknown
  };
  /// status: baseline (first run pending) | ok | changed | disagree | unresolved | nxdomain | dangling
  public type RecordSet = { domainId : Nat; rtype : Text; values : [Text]; expected : [Text]; status : Text; firstSeen : Int; lastSeen : Int; lastChangedAt : Int; detail : Text };
  /// kind: added | baseline | changed | accepted | dangling | resolved | expiry | error | removed | edited | run
  public type Event = { id : Nat; domainId : Nat; at : Int; kind : Text; rtype : Text; before : [Text]; after : [Text]; detail : Text; by : Text };
  public type Run = { id : Nat; at : Int; domains : Nat; queries : Nat; changes : Nat; problems : Nat; detail : Text; by : Text };

  let domains : Map.Map<Nat, Domain> = Map.empty<Nat, Domain>();
  let records : Map.Map<Text, RecordSet> = Map.empty<Text, RecordSet>(); // "<domainId>:<TYPE>"
  let events : Map.Map<Nat, Event> = Map.empty<Nat, Event>();
  let runs : Map.Map<Nat, Run> = Map.empty<Nat, Run>();
  var nextDomainId : Nat = 1;
  var nextEventId : Nat = 1;
  var nextRunId : Nat = 1;
  let expiryWarned : Map.Map<Nat, Nat> = Map.empty<Nat, Nat>(); // domainId -> last threshold warned (days)
  type LogRow = { at : Int; who : Text; what : Text };
  let adminLog : Map.Map<Nat, LogRow> = Map.empty<Nat, LogRow>();
  var nextLogId : Nat = 1;
  transient var busy : Bool = false;
  transient var busySince : Int = 0;

  // ---- 0.3.0 side tables (append-only) ----
  /// dnssec: signed | unsigned | unknown · lock: locked | unlocked | unknown · mail: yes | no | unknown
  /// dmarc: reject | quarantine | none | missing | n/a · spf: strict | soft | open | missing | n/a · mtaSts: on | missing | n/a · caa: set | missing | unknown
  public type Posture = { domainId : Nat; checkedAt : Int; dnssec : Text; lock : Text; mail : Text; dmarc : Text; spf : Text; mtaSts : Text; caa : Text; detail : Text };
  let postures : Map.Map<Nat, Posture> = Map.empty<Nat, Posture>();
  /// certificate transparency (crt.sh): issuers seen, names seen under the domain, when the newest certificate for the watched name ends
  public type CertState = { domainId : Nat; checkedAt : Int; issuers : [Text]; names : [Text]; certEnds : Text; certIssuer : Text; detail : Text };
  let certs : Map.Map<Nat, CertState> = Map.empty<Nat, CertState>();
  // Retry scheduling is separate from the last successful evidence timestamp.
  let certRetryAfter = Map.empty<Nat, Int>();
  let certWarned : Map.Map<Nat, Nat> = Map.empty<Nat, Nat>();
  /// who operates an address (RDAP netblock: netname + registrant), cached 30 days
  public type IpOwner = { ip : Text; owner : Text; org : Text; checkedAt : Int };
  let ipOwners : Map.Map<Text, IpOwner> = Map.empty<Text, IpOwner>();
  /// registrable domain per watched domain (learned from RDAP)
  let registrableOf : Map.Map<Nat, Text> = Map.empty<Nat, Text>();
  /// lookalike domains per watched apex: registered by someone or free
  public type Lookalike = { name : Text; domainId : Nat; registered : Bool; firstSeen : Int; checkedAt : Int; registeredSince : Int; detail : Text };
  let lookalikes : Map.Map<Text, Lookalike> = Map.empty<Text, Lookalike>();
  let lookalikeCheckedAt : Map.Map<Nat, Int> = Map.empty<Nat, Int>();
  let lookalikeIgnored : Map.Map<Text, Int> = Map.empty<Text, Int>();
  /// monthly reports
  public type Report = { id : Nat; month : Text; generatedAt : Int; domains : Nat; runs : Nat; lookups : Nat; alerts : Nat; accepted : Nat; learned : Nat; problems : Nat; postureWeak : Nat; text : Text };
  let reports : Map.Map<Nat, Report> = Map.empty<Nat, Report>();
  var nextReportId : Nat = 1;
  transient let adSeen : Map.Map<Nat, Bool> = Map.empty<Nat, Bool>(); // DNSSEC AD flag from the last check per domain

  transient let TYPES : [Text] = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"];
  transient let DEFAULT_TYPES : [Text] = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"];
  func typeNum(t : Text) : Nat = switch (t) { case ("A") 1; case ("AAAA") 28; case ("CNAME") 5; case ("MX") 15; case ("TXT") 16; case ("NS") 2; case ("CAA") 257; case ("SOA") 6; case (_) 0 };

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
  func jStr(j : Json.Json, path : Text) : Text { switch (Json.getAsText(j, path)) { case (#ok(t)) t; case (_) "" } };
  func jNat(j : Json.Json, path : Text) : Nat { switch (Json.getAsNat(j, path)) { case (#ok(n)) n; case (_) 0 } };
  func jArr(j : Json.Json, path : Text) : [Json.Json] { switch (Json.get(j, path)) { case (?#array(a)) a; case (_) [] } };
  func csv(t : Text) : Text {
    let s = Text.replace(t, #text "\"", "\"\"");
    let guarded = if (Text.startsWith(s, #char '=') or Text.startsWith(s, #char '+') or Text.startsWith(s, #char '-') or Text.startsWith(s, #char '@')) "'" # s else s;
    "\"" # guarded # "\"";
  };
  func joinArr(xs : [Text], sep : Text) : Text = Text.join(xs.vals(), sep);
  func sortDedupe(xs : [Text]) : [Text] {
    let sorted = Array.sort<Text>(xs, Text.compare);
    let out = List.empty<Text>();
    for (x in sorted.vals()) { let dup = switch (List.last(out)) { case (?l) l == x; case null false }; if (x != "" and not dup) List.add(out, x) };
    List.toArray(out);
  };
  func sameSet(a : [Text], b : [Text]) : Bool {
    if (a.size() != b.size()) return false;
    var i = 0; while (i < a.size()) { if (a[i] != b[i]) return false; i += 1 };
    true;
  };
  func validDomain(n : Text) : Bool {
    if (n.size() < 3 or n.size() > 253 or not Text.contains(n, #char '.')) return false;
    for (c in n.chars()) if (not (Char.isAlphabetic(c) or Char.isDigit(c) or c == '-' or c == '.' or c == '_')) return false;
    not Text.startsWith(n, #char '.') and not Text.endsWith(n, #char '.') and not Text.contains(n, #text "..");
  };
  func pad2(n : Nat) : Text = if (n < 10) "0" # Nat.toText(n) else Nat.toText(n);
  /// (year, month, day) of a timestamp, UTC
  func civilOf(ns : Int) : (Nat, Nat, Nat) {
    let secs = Int.abs(ns / 1_000_000_000); let days = secs / 86400;
    let z = days + 719468; let era = z / 146097; let doe = z % 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1; let m = if (mp < 10) mp + 3 else mp - 9; let y = yoe + era * 400 + (if (m <= 2) 1 else 0);
    (y, m, d);
  };
  /// "2026-09-04 14:05 UTC" from ns
  func whenText(ns : Int) : Text {
    if (ns <= 0) return "";
    let (y, m, d) = civilOf(ns); let rem = Int.abs(ns / 1_000_000_000) % 86400;
    Nat.toText(y) # "-" # pad2(m) # "-" # pad2(d) # " " # pad2(rem / 3600) # ":" # pad2((rem % 3600) / 60) # " UTC";
  };
  /// "2026-09" from ns
  func monthOf(ns : Int) : Text { let (y, m, _) = civilOf(ns); Nat.toText(y) # "-" # pad2(m) };
  transient let MONTHS : [Text] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  /// "September 2026" from "2026-09"
  func monthName(ym : Text) : Text {
    let parts = Text.split(ym, #char '-').toArray();
    if (parts.size() != 2) return ym;
    let m = switch (Nat.fromText(parts[1])) { case (?n) n; case null 0 };
    if (m < 1 or m > 12) return ym;
    MONTHS[m - 1] # " " # parts[0];
  };
  func plural(n : Nat, one : Text, many : Text) : Text = Nat.toText(n) # " " # (if (n == 1) one else many);
  func labelsOf(name : Text) : [Text] = Text.split(name, #char '.').toArray();
  /// the registrable domain as far as we know (RDAP told us), else the last two labels
  func registrable(d : Domain) : Text {
    switch (Map.get(registrableOf, Nat.compare, d.id)) {
      case (?r) r;
      case null { let p = labelsOf(d.name); if (p.size() <= 2) d.name else p[p.size() - 2] # "." # p[p.size() - 1] };
    };
  };
  func isApex(d : Domain) : Bool = registrable(d) == d.name;
  /// days from now until an ISO date "YYYY-MM-DD…" (negative = past); null when unparseable
  func daysUntil(iso : Text) : ?Int {
    let s = Text.toArray(iso);
    if (s.size() < 10) return null;
    func num(a : Nat, b : Nat) : ?Nat { var v = 0; var i = a; while (i < b) { if (not Char.isDigit(s[i])) return null; v := v * 10 + (Nat32.toNat(Char.toNat32(s[i])) - 48 : Nat); i += 1 }; ?v };
    let y = switch (num(0, 4)) { case (?v) v; case null return null };
    let m = switch (num(5, 7)) { case (?v) v; case null return null };
    let d = switch (num(8, 10)) { case (?v) v; case null return null };
    if (m < 1 or m > 12 or d < 1 or d > 31) return null;
    // days-from-civil (H. Hinnant)
    let yy : Int = if (m <= 2) y - 1 else y;
    let era : Int = (if (yy >= 0) yy else yy - 399) / 400;
    let yoe : Int = yy - era * 400;
    let mp : Int = if (m > 2) m - 3 else m + 9;
    let doy : Int = (153 * mp + 2) / 5 + d - 1;
    let doe : Int = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let daysSinceEpoch : Int = era * 146097 + doe - 719468;
    let todayDays : Int = now() / D;
    ?(daysSinceEpoch - todayDays);
  };

  // =====================================================================
  // people & roles (from the hub directory)
  // =====================================================================
  func groupsOfEmail(email : Text) : [Text] {
    let e = lower(email);
    let fromDir = switch (Map.get(people, Text.compare, e)) { case (?u) { let g = Hub.attribute(u, "groups"); if (g == "") [] else Text.split(g, #char ';').toArray() }; case null [] };
    if (Map.containsKey(people, Text.compare, e)) return fromDir;
    switch (Map.get(groupsCache, Text.compare, e)) { case (?c) c; case null [] };
  };
  func inGroup(email : Text, group : Text) : Bool = group != "" and has(groupsOfEmail(email), group);
  func hubRoleOf(email : Text) : Text = switch (Map.get(people, Text.compare, lower(email))) { case (?u) Hub.attribute(u, "hubRole"); case null "" };
  // Historical migration evidence only. Never use this to authorize a request.
  func legacyRoleOf(email : Text) : Text {
    let e = lower(email); let hr = hubRoleOf(e);
    if (has(adminEmails, e) or inGroup(e, adminGroup) or hr == "owner" or hr == "admin" or hr == "helpdesk") return "admin";
    "member";
  };
  func roleOf(email : Text) : Text {
    let role = Hub.appRole(people, lower(email), "watch");
    if (role == "viewer") return "member";
    role;
  };
  func legacyRoleSourceOf(email : Text) : Text {
    let e = lower(email);
    if (has(adminEmails, e)) return "bootstrap admin list";
    if (inGroup(e, adminGroup)) return "hub group " # adminGroup;
    let hr = hubRoleOf(e); if (hr != "") return "hub " # hr;
    "directory member";
  };
  func roleSourceOf(email : Text) : Text = Hub.appRoleSource(people, lower(email));
  /// Display name for a stored person id (tolerates a bare address from records older than 0.5.0 and the "timer"/"system" pseudo-actors).
  func nameOf(pid : Text) : Text {
    if (pid == "" or pid == "timer" or pid == "system" or pid == "hub") return pid;
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
  func showEvent(e : Event) : Event = { e with by = nameOf(e.by) };
  func showRun(r : Run) : Run = { r with by = nameOf(r.by) };
  func adminList() : [Text] {
    let out = List.empty<Text>();
    for ((e, u) in Map.entries(people)) if (u.active and roleOf(e) == "admin") List.add(out, e);
    List.toArray(out);
  };
  /// id = the hub's stable person id — what watchers, creators and event authors store. email = current address (roles, display).
  type Me = { id : Text; email : Text; displayName : Text; role : Text };
  func me(tok : Text) : ?Me {
    if (not Hub.directoryFresh(lastDirectoryPull)) return null;
    switch (Hub.session(sessions, tok)) {
      case (?s) { if (not Hub.isActive(people, s.email) or roleOf(s.email) == "none") return null; ?{ id = pidOf(s.email); email = s.email; displayName = s.displayName; role = roleOf(s.email) } };
      case null null;
    };
  };
  func admin(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (m.role == "admin") ?m else null }; case null null };
  func needsClaim() : Bool = false;

  // =====================================================================
  // bootstrap & settings
  // =====================================================================
  public shared ({ caller }) func setHub(id : Text) : async Bool {
    assert Principal.isController(caller);
    let configured = Principal.fromText(norm(id));
    assert not configured.isAnonymous();
    directoryEpoch += 1;
    sessions.clear(); people.clear(); ids.clear(); former.clear(); groupsCache.clear(); lastDirectoryPull := 0;
    owner := ?caller; hubId := norm(id);
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
  public type Settings = { hubId : Text; appUrl : Text; orgName : Text; adminGroup : Text; adminEmails : [Text]; intervalMins : Nat; expiryWarnDays : Nat; notifyAdmins : Bool; peopleCount : Nat; lastDirectoryPull : Int; adminCount : Nat; monitoringSince : Int; trustedOperators : [Text]; operatorsSeen : [Text] };
  public shared query func getSettings(tok : Text) : async ?Settings {
    switch (admin(tok)) { case null null; case (?_) ?{ hubId; appUrl; orgName; adminGroup = ""; adminEmails = []; intervalMins; expiryWarnDays; notifyAdmins; peopleCount = Map.size(people); lastDirectoryPull; adminCount = adminList().size(); monitoringSince; trustedOperators; operatorsSeen = operatorsSeen() } };
  };
  public shared func setSettings(tok : Text, args : { adminGroup : Text; appUrl : Text; orgName : Text; intervalMins : Nat; expiryWarnDays : Nat; notifyAdmins : Bool; trustedOperators : ?[Text] }) : async { ok : Bool; detail : Text } {
    if (norm(args.adminGroup) != "") return { ok = false; detail = "Role settings have moved to Hub Permissions" };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (args.appUrl != "" and not Text.startsWith(args.appUrl, #text "https://")) return { ok = false; detail = "app url must start with https://" };
    if (args.intervalMins < 5 or args.intervalMins > 120) return { ok = false; detail = "interval: 5–120 minutes" };
    if (args.expiryWarnDays < 1 or args.expiryWarnDays > 120) return { ok = false; detail = "expiry warning: 1–120 days" };
    appUrl := Text.trimEnd(norm(args.appUrl), #char '/'); orgName := norm(args.orgName); intervalMins := args.intervalMins; expiryWarnDays := args.expiryWarnDays; notifyAdmins := args.notifyAdmins;
    switch (args.trustedOperators) {
      case (?ops) { let clean = List.empty<Text>(); for (o in ops.vals()) { let t = norm(o); if (t != "" and not has(List.toArray(clean), t)) List.add(clean, capText(t, 80)) }; trustedOperators := List.toArray(clean) };
      case null {};
    };
    log(m.email, "settings updated (every " # Nat.toText(intervalMins) # " min, expiry warning " # Nat.toText(expiryWarnDays) # " d)");
    { ok = true; detail = "" };
  };
  public shared func setAdminEmails(tok : Text, emails : [Text]) : async { ok : Bool; detail : Text } {
    { ok = false; detail = "App permissions are managed only in the Hub" };
  };
  public shared query func adminLogRows(tok : Text) : async [LogRow] {
    switch (admin(tok)) { case null []; case (?_) { let out = List.empty<LogRow>(); for ((_, r) in Map.reverseEntries(adminLog)) { if (List.size(out) < 200) List.add(out, r) }; List.toArray(out) } };
  };

  // =====================================================================
  // hub connector contract
  // =====================================================================
  public shared ({ caller }) func hub_upsert(rows : [Hub.DirectoryRow]) : async Nat { assert Hub.isHub(caller, hubId); directoryEpoch += 1; Hub.upsertRows(people, ids, former, sessions, rows) };
  public shared ({ caller }) func hub_deactivate(emails : [Text]) : async Nat { assert Hub.isHub(caller, hubId); directoryEpoch += 1; ignore Hub.endSessionsOf(sessions, emails); Hub.deactivate(people, emails) };
  /// The Hub brokers this read for a signed-in Desk agent. The viewer retains
  /// their ordinary app permissions; this endpoint never grants extra access.
  public shared query ({ caller }) func hub_personContext(viewer : Text, subject : Text, viewerRole : Text) : async Support.Context {
    assert Hub.isHub(caller, hubId);
    let email = emailOfPid(viewer);
    if (not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or roleOf(email) == "none" or Hub.appRole(people, email, "watch") != viewerRole) return Support.denied();
    if (viewerRole != "admin" and viewerRole != "viewer") return Support.denied();
    let out = List.empty<Support.Item>();
    for ((_, d) in domains.entries()) if (d.createdBy == subject or has(d.watchers, subject)) out.add({ id = d.id.toText(); kind = "domain"; title = d.name; detail = if (has(d.watchers, subject)) "Receives monitoring alerts" else "Added this domain"; status = if (d.enabled) d.lastResult else "paused"; path = "#/d/" # d.id.toText(); historical = not d.enabled });
    Support.ready(out.toArray());
  };

  public shared query func hub_ping() : async Text { "watch" };

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

    { app = "watch"; model = 1; revision = Hub.permissionRevision(people, "watch"); directoryAt = lastDirectoryPull; legacy = legacy.toArray(); legacyGroups = [{ name = adminGroup; role = "admin" }] };
  };
  public shared query func hub_manifest() : async Hub.Manifest {
    { name = "watch"; version = BUILD_VERSION; description = "Domains watched: DNS changes, dangling names, expiry, posture, certificates, lookalikes — with the evidence"; needs = ["identity", "roles", "notify"]; wants = ["groups"] };
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
    // suiteToken: the hub's read-only token for the shared topbar (bell, menu, name, picture) — passed through, never stored
    ?{ token = tok; email = lower(r.email); displayName = r.displayName; role = roleOf(r.email); suiteToken = (switch (r.suiteToken) { case (?t) t; case null "" }) };
  };
  public shared query func whoami(tok : Text) : async ?{ id : Text; email : Text; displayName : Text; role : Text; roleSource : Text; orgName : Text; hubId : Text; needsClaim : Bool } {
    switch (me(tok)) { case null null; case (?m) ?{ id = m.id; email = m.email; displayName = m.displayName; role = m.role; roleSource = roleSourceOf(m.email); orgName; hubId; needsClaim = needsClaim() } };
  };
  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };
  public shared query func directory(tok : Text, q : Text) : async [{ email : Text; displayName : Text; department : Text }] {
    switch (me(tok)) {
      case null [];
      case (?_) {
        let needle = lower(norm(q)); let out = List.empty<{ email : Text; displayName : Text; department : Text }>();
        for ((e, u) in Map.entries(people)) if (u.active and (needle == "" or Text.contains(e, #text needle) or Text.contains(lower(u.displayName), #text needle))) { if (List.size(out) < 12) List.add(out, { email = e; displayName = u.displayName; department = Hub.attribute(u, "department") }) };
        List.toArray(out);
      };
    };
  };
  public shared query func info() : async { orgName : Text; hubId : Text; hubSet : Bool; appUrl : Text; version : Text } { { orgName; hubId; hubSet = hubId != ""; appUrl; version = BUILD_VERSION } };
  /// Notify everyone; returns what the hub said, so the event log shows whether an alert actually went out.
  /// who = person ids or addresses (admins come as addresses, watchers as ids); a former colleague whose address moved on is skipped
  func notifyAll(who : [Text], title : Text, url : Text, kind : Text, dedupeKey : Text) : async Text {
    if (hubId == "") return "no hub wired";
    let to = sortDedupe(Array.filter<Text>(Array.map<Text, Text>(who, emailOfPid), func(e) = e != ""));
    if (to.size() == 0) return "nobody to notify — no admins known and no watchers set";
    var okN = 0; var fails = "";
    for (e in to.vals()) {
      let r = try { await Hub.hub(hubId).hub_notify({ email = e; title = capText(title, 200); url; kind; dedupeKey }) } catch (err) { { ok = false; detail = "call failed: " # capText(Error.message(err), 80) } };
      if (r.ok) okN += 1 else fails #= (if (fails == "") "" else "; ") # e # ": " # r.detail;
    };
    "alert to " # Nat.toText(okN) # " of " # Nat.toText(to.size()) # (if (fails != "") " — hub refused: " # capText(fails, 220) else "");
  };
  func alertEvent(domainId : Nat, rtype : Text, summary : Text, by : Text) { ignore addEvent(domainId, "alert", rtype, [], [], summary, by) };
  func recipients(d : Domain) : [Text] = sortDedupe(Array.concat((if (notifyAdmins) adminList() else []), d.watchers));
  func linkTo(d : Domain) : Text = if (appUrl == "") "" else appUrl # "/#/d/" # Nat.toText(d.id);

  // =====================================================================
  // HTTP (DNS-over-HTTPS, RDAP)
  // =====================================================================
  type HttpHeader = { name : Text; value : Text };
  type HttpResponsePayload = { status : Nat; headers : [HttpHeader]; body : Blob };
  type TransformArgs = { response : HttpResponsePayload; context : Blob };
  type HttpRequestArgs = { url : Text; max_response_bytes : ?Nat64; headers : [HttpHeader]; body : ?Blob; method : { #get; #post; #head }; transform : ?{ function : shared query TransformArgs -> async HttpResponsePayload; context : Blob }; is_replicated : ?Bool };
  transient let icHttp : actor { http_request : HttpRequestArgs -> async HttpResponsePayload } = actor ("aaaaa-aa");
  type Fetched = { ok : Bool; status : Nat; body : Text; location : Text; detail : Text };
  func fetch(url : Text, headers : [HttpHeader]) : async Fetched {
    let req : HttpRequestArgs = { url; max_response_bytes = ?400_000; headers; body = null; method = #get; transform = null; is_replicated = ?false };
    let res = try { await (with timeout = 30) icHttp.http_request(req) } catch (e) { return { ok = false; status = 0; body = ""; location = ""; detail = "no answer: " # capText(Error.message(e), 120) } };
    let txt = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null "" };
    var loc = "";
    for (h in res.headers.vals()) if (lower(h.name) == "location") loc := h.value;
    { ok = res.status >= 200 and res.status < 300; status = res.status; body = txt; location = loc; detail = (if (res.status >= 200 and res.status < 300) "" else "HTTP " # Nat.toText(res.status)) };
  };
  func urlEncName(n : Text) : Text = n; // domain names are already URL-safe (validated)

  /// One DoH answer: status (0 = ok, 3 = NXDOMAIN, 2 = SERVFAIL), normalised record data of the asked type.
  type DohAnswer = { ok : Bool; rcode : Nat; values : [Text]; detail : Text; ad : Bool }; // ad = the resolver validated DNSSEC
  func normValue(rtype : Text, raw : Text) : Text {
    var v = norm(raw);
    switch (rtype) {
      case ("TXT") { v := Text.replace(v, #text "\" \"", ""); v := Text.replace(v, #text "\"", "") }; // resolvers quote TXT differently — compare the bare text
      case ("A") {}; case ("AAAA") { v := lower(v) };
      case (_) { v := lower(Text.trimEnd(v, #char '.')) };
    };
    v;
  };
  func doh(resolver : Text, name : Text, rtype : Text) : async DohAnswer {
    let url = if (resolver == "cloudflare") "https://cloudflare-dns.com/dns-query?name=" # urlEncName(name) # "&type=" # rtype else "https://dns.google/resolve?name=" # urlEncName(name) # "&type=" # rtype;
    let r = await fetch(url, [{ name = "accept"; value = "application/dns-json" }]);
    if (not r.ok) return { ok = false; rcode = 0; values = []; detail = resolver # ": " # r.detail; ad = false };
    let j = switch (Json.parse(Hub.sanitizeSurrogates(r.body))) { case (#ok(j)) j; case (#err(_)) return { ok = false; rcode = 0; values = []; detail = resolver # ": not JSON"; ad = false } };
    let rcode = jNat(j, "Status");
    let ad = switch (Json.get(j, "AD")) { case (?#bool(b)) b; case (_) false };
    let want = typeNum(rtype);
    let out = List.empty<Text>();
    for (a in jArr(j, "Answer").vals()) { if (jNat(a, "type") == want) List.add(out, normValue(rtype, jStr(a, "data"))) };
    { ok = true; rcode; values = sortDedupe(List.toArray(out)); detail = ""; ad };
  };

  // =====================================================================
  // who operates an address (RDAP netblock owner, cached)
  // =====================================================================
  /// "fn" of the first registrant entity that is a name, not a maintainer handle
  func rdapRegistrant(j : Json.Json) : Text {
    for (e in jArr(j, "entities").vals()) {
      var isReg = false;
      for (r in jArr(e, "roles").vals()) switch (r) { case (#string(t)) { if (t == "registrant") isReg := true }; case (_) {} };
      if (isReg) {
        switch (Json.get(e, "vcardArray")) {
          case (?#array(v)) {
            if (v.size() >= 2) switch (v[1]) {
              case (#array(items)) for (it in items.vals()) switch (it) {
                case (#array(f)) { if (f.size() >= 4) switch (f[0], f[3]) { case (#string("fn"), #string(name)) { if (not Text.endsWith(name, #text "-MNT") and name != "") return name }; case (_) {} } };
                case (_) {};
              };
              case (_) {};
            };
          };
          case (_) {};
        };
      };
    };
    "";
  };
  func ownerOf(ip : Text) : async IpOwner {
    switch (Map.get(ipOwners, Text.compare, ip)) { case (?o) { if (now() - o.checkedAt < 30 * D) return o }; case null {} };
    var url = "https://rdap.org/ip/" # ip; var hops = 0; var body = ""; var status = 0;
    label follow while (hops < 4) {
      let r = await fetch(url, [{ name = "accept"; value = "application/rdap+json, application/json" }]);
      status := r.status;
      if (r.status >= 300 and r.status < 400 and r.location != "") { url := r.location; hops += 1 } else { body := r.body; break follow };
    };
    var owner = ""; var org = "";
    if (status == 200 and body != "") switch (Json.parse(Hub.sanitizeSurrogates(body))) { case (#ok(j)) { owner := jStr(j, "name"); org := rdapRegistrant(j) }; case (#err(_)) {} };
    let o : IpOwner = { ip; owner; org; checkedAt = now() };
    if (owner != "" or org != "") Map.add(ipOwners, Text.compare, ip, o);
    if (Map.size(ipOwners) > 5000) { let victims = List.empty<Text>(); for ((k, v) in Map.entries(ipOwners)) if (now() - v.checkedAt > 30 * D and List.size(victims) < 500) List.add(victims, k); for (k in List.values(victims)) ignore Map.delete(ipOwners, Text.compare, k) };
    o;
  };
  /// what to show next to an address: registrant, else netname
  func operatorName(o : IpOwner) : Text = if (o.org != "") o.org else o.owner;
  func ownerLabel(ip : Text) : Text {
    switch (Map.get(ipOwners, Text.compare, ip)) { case (?o) { let n = operatorName(o); if (n == "") ip else ip # " (" # n # ")" }; case null ip };
  };
  func sameOperator(a : IpOwner, b : IpOwner) : Bool = (a.org != "" and lower(a.org) == lower(b.org)) or (a.owner != "" and lower(a.owner) == lower(b.owner));
  func trustedOp(o : IpOwner) : Bool {
    for (t in trustedOperators.vals()) { let tl = lower(t); if (tl != "" and ((o.org != "" and Text.contains(lower(o.org), #text tl)) or (o.owner != "" and Text.contains(lower(o.owner), #text tl)))) return true };
    false;
  };
  func operatorsSeen() : [Text] {
    let out = List.empty<Text>();
    for ((_, o) in Map.entries(ipOwners)) { let n = operatorName(o); if (n != "" and not has(List.toArray(out), n)) List.add(out, n) };
    Array.sort<Text>(List.toArray(out), Text.compare);
  };

  // =====================================================================
  // domains
  // =====================================================================
  func addEvent(domainId : Nat, kind : Text, rtype : Text, before : [Text], after : [Text], detail : Text, by : Text) : Nat {
    let id = nextEventId; nextEventId += 1;
    Map.add(events, Nat.compare, id, { id; domainId; at = now(); kind; rtype; before; after; detail; by });
    if (nextEventId > 20_000) ignore Map.delete(events, Nat.compare, nextEventId - 20_000 : Nat);
    id;
  };
  func cleanTypes(ts : [Text]) : [Text] { let out = List.empty<Text>(); for (t in TYPES.vals()) if (has(Array.map<Text, Text>(ts, func(x) = Text.toUpper(norm(x))), t)) List.add(out, t); List.toArray(out) };
  public type DomainInput = { name : Text; types : [Text]; watchers : [Text]; note : Text };
  public shared func addDomain(tok : Text, x : DomainInput) : async { ok : Bool; detail : Text; id : Nat } {
    if (migrating()) return { ok = false; detail = MIGRATING; id = 0 };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; id = 0 } };
    let name = lower(Text.trimEnd(norm(x.name), #char '.'));
    if (not validDomain(name)) return { ok = false; detail = "that is not a domain name"; id = 0 };
    for ((_, d) in Map.entries(domains)) if (d.name == name) return { ok = false; detail = "already watched (#" # Nat.toText(d.id) # ")"; id = d.id };
    if (Map.size(domains) >= 500) return { ok = false; detail = "max 500 domains"; id = 0 };
    let types = do { let t = cleanTypes(x.types); if (t.size() == 0) DEFAULT_TYPES else t };
    let watchers = sortDedupe(Array.map<Text, Text>(Array.filter<Text>(Array.map<Text, Text>(x.watchers, func(w) = lower(norm(w))), func(w) = w != "" and knownPerson(w)), pidOf)); // pickers hand over addresses, stored are ids
    let id = nextDomainId; nextDomainId += 1;
    Map.add(domains, Nat.compare, id, { id; name; types; enabled = true; watchers; note = capText(norm(x.note), 300); createdAt = now(); createdBy = m.id; lastCheck = 0; lastResult = "not checked yet"; expiresAt = ""; expiryCheckedAt = 0; expiryDetail = "" });
    ignore addEvent(id, "added", "", [], [], "watching " # joinArr(types, ", "), m.id);
    log(m.email, "domain added: " # name);
    { ok = true; detail = ""; id };
  };
  public shared func updateDomain(tok : Text, id : Nat, x : { types : [Text]; watchers : [Text]; note : Text; enabled : Bool }) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let d = switch (Map.get(domains, Nat.compare, id)) { case (?d) d; case null return { ok = false; detail = "no such domain" } };
    let types = do { let t = cleanTypes(x.types); if (t.size() == 0) d.types else t };
    let watchers = sortDedupe(Array.map<Text, Text>(Array.filter<Text>(Array.map<Text, Text>(x.watchers, func(w) = lower(norm(w))), func(w) = w != "" and knownPerson(w)), pidOf)); // pickers hand over addresses, stored are ids
    // record sets of types no longer watched go away; new types get a baseline on the next run
    for (t in d.types.vals()) if (not has(types, t)) ignore Map.delete(records, Text.compare, Nat.toText(id) # ":" # t);
    Map.add(domains, Nat.compare, id, { d with types; watchers; note = capText(norm(x.note), 300); enabled = x.enabled });
    ignore addEvent(id, "edited", "", [], [], (if (x.enabled) "watching " # joinArr(types, ", ") else "paused"), m.id);
    { ok = true; detail = "" };
  };
  public shared func removeDomain(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let d = switch (Map.get(domains, Nat.compare, id)) { case (?d) d; case null return { ok = false; detail = "no such domain" } };
    ignore Map.delete(domains, Nat.compare, id);
    for (t in TYPES.vals()) ignore Map.delete(records, Text.compare, Nat.toText(id) # ":" # t);
    ignore Map.delete(expiryWarned, Nat.compare, id);
    ignore Map.delete(postures, Nat.compare, id); ignore Map.delete(certs, Nat.compare, id); ignore Map.delete(certWarned, Nat.compare, id);
    ignore certRetryAfter.remove(id);
    ignore Map.delete(registrableOf, Nat.compare, id); ignore Map.delete(lookalikeCheckedAt, Nat.compare, id);
    let victims = List.empty<Text>(); for ((k, l) in Map.entries(lookalikes)) if (l.domainId == id) List.add(victims, k);
    for (k in List.values(victims)) ignore Map.delete(lookalikes, Text.compare, k);
    ignore addEvent(id, "removed", "", [], [], d.name # " removed from the watch", m.id);
    log(m.email, "domain removed: " # d.name);
    { ok = true; detail = "events are kept as evidence" };
  };
  /// The current answer becomes the expectation; the change is closed.
  public shared func acceptChange(tok : Text, id : Nat, rtype : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let d = switch (Map.get(domains, Nat.compare, id)) { case (?d) d; case null return { ok = false; detail = "domain not found" } };
    if (not d.enabled) return { ok = false; detail = "resume monitoring before changing the baseline" };
    if (not has(d.types, Text.toUpper(norm(rtype)))) return { ok = false; detail = "record type is not watched" };
    let key = Nat.toText(id) # ":" # Text.toUpper(norm(rtype));
    let r = switch (Map.get(records, Text.compare, key)) { case (?r) r; case null return { ok = false; detail = "no such record set" } };
    if ((Text.contains(r.detail, #text "resolvers unreachable") or Text.contains(r.detail, #text "resolver check unavailable") or Text.contains(r.detail, #text "resolvers disagree"))) return { ok = false; detail = "check DNS again before accepting stale answers" };
    if (r.status != "changed") return { ok = false; detail = "nothing to accept — status is " # r.status };
    let exp2 = if (r.rtype == "A" or r.rtype == "AAAA") sortDedupe(Array.concat(r.expected, r.values)) else r.values;
    Map.add(records, Text.compare, key, { r with expected = exp2; status = "ok"; detail = "" });
    ignore addEvent(id, "accepted", r.rtype, r.expected, exp2, (if (r.rtype == "A" or r.rtype == "AAAA") "new addresses added to the known set" else "accepted as the new expectation"), m.id);
    log(m.email, "accepted " # r.rtype # " change on domain #" # Nat.toText(id));
    { ok = true; detail = "" };
  };
  /// A/AAAA: forget known addresses that are no longer served (the set only grows on accept; this trims it to what both resolvers see now).
  public shared func trimKnown(tok : Text, id : Nat, rtype : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let d = switch (Map.get(domains, Nat.compare, id)) { case (?d) d; case null return { ok = false; detail = "domain not found" } };
    if (not d.enabled) return { ok = false; detail = "resume monitoring before changing the baseline" };
    if (not has(d.types, Text.toUpper(norm(rtype)))) return { ok = false; detail = "record type is not watched" };
    let key = Nat.toText(id) # ":" # Text.toUpper(norm(rtype));
    let r = switch (Map.get(records, Text.compare, key)) { case (?r) r; case null return { ok = false; detail = "no such record set" } };
    if (r.rtype != "A" and r.rtype != "AAAA") return { ok = false; detail = "only A and AAAA keep a set of known addresses" };
    if (r.status != "ok" or (Text.contains(r.detail, #text "resolvers unreachable") or Text.contains(r.detail, #text "resolver check unavailable") or Text.contains(r.detail, #text "resolvers disagree"))) return { ok = false; detail = "review unresolved changes or check failures before trimming known addresses" };
    if (r.values.size() == 0) return { ok = false; detail = "nothing is served right now — not trimming to an empty set" };
    Map.add(records, Text.compare, key, { r with expected = r.values; status = "ok"; detail = "" });
    ignore addEvent(id, "accepted", r.rtype, r.expected, r.values, "known addresses trimmed to what is served now", m.id);
    { ok = true; detail = Nat.toText(r.values.size()) # " known" };
  };
  public shared func acceptAll(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let d = switch (Map.get(domains, Nat.compare, id)) { case (?d) d; case null return { ok = false; detail = "domain not found" } };
    if (not d.enabled) return { ok = false; detail = "resume monitoring before changing the baseline" };
    var n = 0;
    for (t in d.types.vals()) {
      let key = Nat.toText(id) # ":" # t;
      switch (Map.get(records, Text.compare, key)) {
        case (?r) { if (r.status == "changed" and not (Text.contains(r.detail, #text "resolvers unreachable") or Text.contains(r.detail, #text "resolver check unavailable") or Text.contains(r.detail, #text "resolvers disagree"))) { let exp2 = if (t == "A" or t == "AAAA") sortDedupe(Array.concat(r.expected, r.values)) else r.values; Map.add(records, Text.compare, key, { r with expected = exp2; status = "ok"; detail = "" }); ignore addEvent(id, "accepted", r.rtype, r.expected, exp2, "accepted as the new expectation", m.id); n += 1 } };
        case null {};
      };
    };
    { ok = true; detail = Nat.toText(n) # " accepted" };
  };

  // =====================================================================
  // the check
  // =====================================================================
  /// Check one domain: every watched type on both resolvers, in parallel. Returns (queries, changes, problems).
  func checkDomain(d : Domain, by : Text) : async (Nat, Nat, Nat) {
    var queries = 0; var changes = 0; var problems = 0;
    // fire everything for this domain at once
    let futs = List.empty<(Text, async DohAnswer, async DohAnswer)>();
    for (t in d.types.vals()) { List.add(futs, (t, doh("cloudflare", d.name, t), doh("google", d.name, t))); queries += 2 };
    let cnameTargets = List.empty<Text>();
    for ((t, fc, fg) in List.values(futs)) {
      let c = await fc; let g = await fg;
      let key = Nat.toText(d.id) # ":" # t;
      let prev = Map.get(records, Text.compare, key);
      let nowT = now();
      if (not c.ok or not g.ok) {
        // A change requires two successful independent answers. Keep old evidence on partial failure.
        problems += 1;
        switch (prev) { case (?r) Map.add(records, Text.compare, key, { r with status = (if (r.status == "baseline") "unresolved" else r.status); lastSeen = nowT; detail = "resolver check unavailable: Cloudflare " # (if (c.ok) "ok" else c.detail) # " / Google " # (if (g.ok) "ok" else g.detail) }); case null Map.add(records, Text.compare, key, { domainId = d.id; rtype = t; values = []; expected = []; status = "unresolved"; firstSeen = nowT; lastSeen = nowT; lastChangedAt = 0; detail = c.detail }) };
      } else {
        let a = if (c.ok) c else g; let b = if (g.ok) g else c;
        let nx = a.rcode == 3 and b.rcode == 3;
        if (c.ok and g.ok and not nx) Map.add(adSeen, Nat.compare, d.id, c.ad or g.ad);
        // A/AAAA: geo- and load-balanced answers legitimately differ per resolver and rotate — the expectation is a SET of known addresses;
        // only an address never seen before (on both resolvers) is a change. Every other type: exact set equality.
        let setMode = t == "A" or t == "AAAA";
        let union = sortDedupe(Array.concat(a.values, b.values));
        let agree = sameSet(a.values, b.values) and a.rcode == b.rcode;
        let vals = if (setMode) union else a.values;
        func minus(xs : [Text], known : [Text]) : [Text] = Array.filter<Text>(xs, func(x) = not has(known, x));
        switch (prev) {
          case null {
            // first look: this is the baseline (for A/AAAA the union of both resolvers)
            Map.add(records, Text.compare, key, { domainId = d.id; rtype = t; values = vals; expected = vals; status = (if (nx) "nxdomain" else "ok"); firstSeen = nowT; lastSeen = nowT; lastChangedAt = 0; detail = (if (agree or setMode) "" else "resolvers disagree — baseline from " # (if (c.ok) "cloudflare" else "google")) });
            ignore addEvent(d.id, "baseline", t, [], vals, (if (nx) "domain does not resolve (NXDOMAIN)" else if (vals.size() == 0) "no records" else Nat.toText(vals.size()) # " record" # (if (vals.size() == 1) "" else "s")), by);
            if (nx) problems += 1;
            if (setMode) for (ip in vals.vals()) { try { ignore await ownerOf(ip) } catch (_) {} };
          };
          case (?r) {
            // what would count as "different from the expectation" for this type
            let newC = if (setMode) minus(a.values, r.expected) else (if (sameSet(a.values, r.expected)) [] else a.values);
            let newG = if (setMode) minus(b.values, r.expected) else (if (sameSet(b.values, r.expected)) [] else b.values);
            let devC = newC.size() > 0; let devG = newG.size() > 0;
            let vanished = a.values.size() == 0 and b.values.size() == 0 and r.expected.size() > 0;
            // both resolvers deviate — and, for exact types, on the SAME new answer; otherwise it is still "in flight"
            let deviatesBoth = vanished or (devC and devG and (setMode or sameSet(a.values, b.values)));
            let deviatesOne = (devC or devG) and not deviatesBoth;
            if (deviatesOne and not deviatesBoth) {
              // one resolver still serves the old answer (TTL), or a rollout in progress — wait for the next run
              Map.add(records, Text.compare, key, { r with lastSeen = nowT; status = (if (r.status == "changed" or r.status == "dangling") r.status else "disagree"); detail = "resolvers disagree (" # joinArr(c.values, " | ") # " vs " # joinArr(g.values, " | ") # ")" });
            } else if (not deviatesBoth) {
              // within the expectation (A/AAAA: every address is known; others: exact match)
              if (not nx and (r.status == "changed" or r.status == "disagree" or r.status == "unresolved" or r.status == "nxdomain")) ignore addEvent(d.id, "resolved", t, r.values, vals, "back to the expected records", by);
              Map.add(records, Text.compare, key, { r with values = vals; status = (if (nx) "nxdomain" else if (r.status == "dangling") "dangling" else "ok"); lastSeen = nowT; detail = (if (nx) "domain does not resolve (NXDOMAIN)" else if (r.status == "dangling") r.detail else "") });
            } else {
              // a real change, both resolvers agree on it
              let newVals = if (setMode) sortDedupe(Array.concat(newC, newG)) else vals;
              // A/AAAA: who operates the new addresses? Same operator as the known ones, a trusted operator, or a domain in its
              // first 48 hours → learned quietly (the known set grows). Anyone else → an alert, with the operator named.
              var learnWhy = "";
              var sameOpNote = false;
              if (setMode and not vanished and not nx and newVals.size() > 0) {
                let young = nowT - d.createdAt < LEARN_NS;
                let knownOwners = List.empty<IpOwner>();
                for (ip in r.expected.vals()) { try { let o = await ownerOf(ip); if (o.owner != "" or o.org != "") List.add(knownOwners, o) } catch (_) {} };
                var allOk = true; var why = "";
                for (ip in newVals.vals()) {
                  let o = try { await ownerOf(ip) } catch (_) { { ip; owner = ""; org = ""; checkedAt = 0 } };
                  var same = false; for (k in List.values(knownOwners)) if (sameOperator(o, k)) same := true;
                  let w = if (trustedOp(o)) "trusted operator" else if (same) "same operator as the known addresses" else if (young) "learning period (first 48 hours)" else "";
                  if (w == "") allOk := false else if (why == "") why := w;
                };
                if (allOk) learnWhy := why;
                // a new address at the SAME cloud operator is still learned (Geo-DNS), but no longer silently: the same provider hosts everyone, including whoever might take the name over
                if (allOk and why == "same operator as the known addresses") sameOpNote := true;
              };
              let labelled = Array.map<Text, Text>(newVals, ownerLabel);
              if (learnWhy != "") {
                if (sameOpNote) {
                  let summary = await notifyAll(recipients(d), "New address at the known operator: " # d.name # " " # t # " → " # capText(joinArr(labelled, ", "), 120) # " (learned — check it is yours)", linkTo(d), "watch.dns", "learn-" # Nat.toText(d.id) # "-" # t);
                  alertEvent(d.id, t, summary, by);
                };
                let exp2 = sortDedupe(Array.concat(r.expected, newVals));
                Map.add(records, Text.compare, key, { r with values = vals; expected = exp2; status = (if (r.status == "dangling") "dangling" else "ok"); lastSeen = nowT; detail = (if (r.status == "dangling") r.detail else "") });
                ignore addEvent(d.id, "learned", t, r.expected, exp2, "new address" # (if (newVals.size() == 1) "" else "es") # " added to the known set: " # joinArr(labelled, ", ") # " — " # learnWhy, by);
              } else {
                let alreadyReported = (r.status == "changed" or r.status == "nxdomain") and sameSet(vals, r.values);
                Map.add(records, Text.compare, key, { r with values = vals; status = (if (nx) "nxdomain" else "changed"); lastSeen = nowT; lastChangedAt = (if (alreadyReported) r.lastChangedAt else nowT); detail = (if (nx) "domain does not resolve (NXDOMAIN)" else if (setMode and not vanished) "new address" # (if (newVals.size() == 1) "" else "es") # ": " # joinArr(labelled, ", ") else "") });
                if (not alreadyReported) {
                  changes += 1;
                  ignore addEvent(d.id, "changed", t, r.expected, vals, (if (nx) "records vanished — NXDOMAIN" else if (vals.size() == 0) "records removed" else if (setMode) "new address" # (if (newVals.size() == 1) "" else "es") # " not seen before: " # joinArr(labelled, ", ") else "records changed"), by);
                  let summary = await notifyAll(recipients(d), "DNS change: " # d.name # " " # t # " → " # (if (vals.size() == 0) "(none)" else capText(joinArr((if (setMode) labelled else vals), ", "), 120)), linkTo(d), "watch.dns", "chg-" # Nat.toText(d.id) # "-" # t # "-" # Int.toText(nowT / 1_000_000_000));
                  alertEvent(d.id, t, summary, by);
                };
              };
            };
          };
        };
        if (t == "CNAME") for (v in vals.vals()) List.add(cnameTargets, v);
      };
    };
    // dangling: a CNAME target that does not resolve is a subdomain waiting to be taken over
    for (target in List.values(cnameTargets)) {
      let a = await doh("cloudflare", target, "A");
      let key = Nat.toText(d.id) # ":CNAME";
      switch (Map.get(records, Text.compare, key)) {
        case (?r) {
          if (a.ok and a.rcode == 3) {
            if (r.status != "dangling") {
              Map.add(records, Text.compare, key, { r with status = "dangling"; detail = "target " # target # " does not exist (NXDOMAIN) — take-over risk" });
              ignore addEvent(d.id, "dangling", "CNAME", [], [target], "CNAME target does not resolve (NXDOMAIN)", by);
              problems += 1;
              alertEvent(d.id, "CNAME", await notifyAll(recipients(d), "Dangling CNAME: " # d.name # " → " # target # " no longer exists", linkTo(d), "watch.dangling", "dangling-" # Nat.toText(d.id) # "-" # target), by);
            } else problems += 1;
          } else if (a.ok and r.status == "dangling") {
            Map.add(records, Text.compare, key, { r with status = (if (sameSet(r.values, r.expected)) "ok" else "changed"); detail = "" });
            ignore addEvent(d.id, "resolved", "CNAME", [target], [target], "CNAME target resolves again", by);
          };
        };
        case null {};
      };
    };
    (queries, changes, problems);
  };
  /// Domain expiry via RDAP (rdap.org bootstraps by redirect; we follow up to 3). Once a day per domain.
  func checkExpiry(d : Domain) : async () {
    if (now() - d.expiryCheckedAt < D) return;
    var name = d.name;
    var result : ?(Text, Text) = null; // (expiresAt, detail)
    var lockNow = "";
    var attempts = 0;
    label tries while (attempts < 3 and result == null) {
      attempts += 1;
      var url = "https://rdap.org/domain/" # name;
      var hops = 0; var body = ""; var status = 0;
      label follow while (hops < 4) {
        let r = await fetch(url, [{ name = "accept"; value = "application/rdap+json, application/json" }]);
        status := r.status;
        if (r.status >= 300 and r.status < 400 and r.location != "") { url := r.location; hops += 1 } else { body := r.body; break follow };
      };
      if (status == 200 and body != "") {
        switch (Json.parse(Hub.sanitizeSurrogates(body))) {
          case (#ok(j)) {
            var exp = "";
            for (e in jArr(j, "events").vals()) if (lower(jStr(e, "eventAction")) == "expiration") exp := jStr(e, "eventDate");
            let st = List.empty<Text>();
            for (s in jArr(j, "status").vals()) switch (s) { case (#string(t)) List.add(st, t); case (_) {} };
            Map.add(registrableOf, Nat.compare, d.id, name);
            var locked = false;
            for (t in List.values(st)) if (Text.contains(Text.replace(lower(t), #char ' ', ""), #text "transferprohibited")) locked := true;
            lockNow := if (locked) "locked" else "unlocked";
            result := ?(capText(exp, 10), (if (List.size(st) > 0) joinArr(List.toArray(st), ", ") else "registered") # (if (name != d.name) " (registrable domain " # name # ")" else ""));
          };
          case (#err(_)) { result := ?("", "registry answer was not JSON") };
        };
      } else if (status == 404 or status == 400) {
        // a subdomain: try the parent (works for one-label TLDs; two-label public suffixes need the registrable domain given directly)
        let parts = Text.split(name, #char '.').toArray();
        if (parts.size() > 2) name := joinArr(Array.tabulate<Text>(parts.size() - 1, func i = parts[i + 1]), ".") else result := ?("", "no registry data (RDAP " # Nat.toText(status) # ")");
      } else result := ?("", "registry not reachable (RDAP " # Nat.toText(status) # ")");
    };
    let (exp, detail) = switch (result) { case (?x) x; case null ("", "no registry data") };
    Map.add(domains, Nat.compare, d.id, { d with expiresAt = exp; expiryCheckedAt = now(); expiryDetail = detail });
    if (lockNow != "") await updateLock(d, lockNow);
    switch (daysUntil(exp)) {
      case (?days) {
        let thresholds : [Nat] = [Nat.max(expiryWarnDays, 1), 14, 7, 1];
        var hit = 0;
        for (t in thresholds.vals()) if (days <= t) hit := t; // the smallest threshold reached
        if (days <= 0) hit := 1;
        let last = switch (Map.get(expiryWarned, Nat.compare, d.id)) { case (?n) n; case null 0 };
        if (hit > 0 and (last == 0 or hit < last)) {
          Map.add(expiryWarned, Nat.compare, d.id, hit);
          let msg = if (days <= 0) d.name # " has EXPIRED (" # exp # ")" else d.name # " expires in " # Int.toText(days) # " day" # (if (days == 1) "" else "s") # " (" # exp # ")";
          ignore addEvent(d.id, "expiry", "", [], [exp], msg, "timer");
          alertEvent(d.id, "", await notifyAll(recipients(d), "Domain expiry: " # msg, linkTo(d), "watch.expiry", "exp-" # Nat.toText(d.id) # "-" # Nat.toText(hit)), "timer");
        } else if (days > Nat.max(expiryWarnDays, 1) and last != 0) ignore Map.delete(expiryWarned, Nat.compare, d.id); // renewed
      };
      case null {};
    };
  };
  // =====================================================================
  // posture: DNSSEC, registrar lock, e-mail protection, CAA (once a day; alert when it weakens)
  // =====================================================================
  func emptyPosture(id : Nat) : Posture = { domainId = id; checkedAt = 0; dnssec = "unknown"; lock = "unknown"; mail = "unknown"; dmarc = "n/a"; spf = "n/a"; mtaSts = "n/a"; caa = "unknown"; detail = "" };
  func dmarcPolicy(vals : [Text]) : Text {
    for (v in vals.vals()) {
      let l = lower(v);
      if (Text.startsWith(l, #text "v=dmarc1")) {
        for (tok in Text.split(l, #char ';')) { let t = norm(tok); if (Text.startsWith(t, #text "p=")) { let pol = norm(Text.trimStart(t, #text "p=")); if (pol == "reject" or pol == "quarantine" or pol == "none") return pol } };
        return "none";
      };
    };
    "missing";
  };
  func spfGrade(vals : [Text]) : Text {
    for (v in vals.vals()) {
      let l = lower(v);
      if (Text.startsWith(l, #text "v=spf1")) { if (Text.endsWith(l, #text "-all")) return "strict"; if (Text.endsWith(l, #text "~all")) return "soft"; if (Text.contains(l, #text "redirect=")) return "strict"; return "open" };
    };
    "missing";
  };
  func rankOf(field : Text, v : Text) : Int {
    switch (field, v) {
      case ("dmarc", "reject") 3; case ("dmarc", "quarantine") 2; case ("dmarc", "none") 1; case ("dmarc", "missing") 0;
      case ("spf", "strict") 3; case ("spf", "soft") 2; case ("spf", "open") 1; case ("spf", "missing") 0;
      case ("dnssec", "signed") 1; case ("dnssec", "unsigned") 0;
      case ("mtaSts", "on") 1; case ("mtaSts", "missing") 0;
      case ("caa", "set") 1; case ("caa", "missing") 0;
      case ("lock", "locked") 1; case ("lock", "unlocked") 0;
      case (_) -1; // unknown / n/a — never compared
    };
  };
  transient let POSTURE_WORDS : [(Text, Text)] = [("dnssec", "DNSSEC"), ("lock", "registrar lock"), ("dmarc", "DMARC"), ("spf", "SPF"), ("mtaSts", "MTA-STS"), ("caa", "CAA")];
  func fieldOf(p : Posture, f : Text) : Text = switch (f) { case ("dnssec") p.dnssec; case ("lock") p.lock; case ("dmarc") p.dmarc; case ("spf") p.spf; case ("mtaSts") p.mtaSts; case ("caa") p.caa; case (_) "" };
  /// good | weak | missing | n/a | unknown — e-mail protection and the registrar lock are what an auditor asks about; DNSSEC and CAA are shown, not graded
  func postureGrade(p : Posture) : Text {
    if (p.checkedAt == 0) return "unknown";
    if (p.dmarc == "n/a" and p.spf == "n/a") return (if (p.lock == "unlocked") "weak" else "n/a");
    let strongMail = (p.dmarc == "reject" or p.dmarc == "quarantine") and (p.spf == "strict" or p.spf == "soft");
    if (p.dmarc == "missing" and p.spf == "missing") "missing" else if (strongMail and p.lock != "unlocked") "good" else "weak";
  };
  func postureWhyWeak(p : Posture) : Text {
    let out = List.empty<Text>();
    if (p.dmarc == "none") List.add(out, "DMARC only monitors (p=none)") else if (p.dmarc == "missing") List.add(out, "no DMARC");
    if (p.spf == "open") List.add(out, "SPF allows everyone") else if (p.spf == "missing") List.add(out, "no SPF");
    if (p.lock == "unlocked") List.add(out, "registrar lock off");
    joinArr(List.toArray(out), ", ");
  };
  func postureSummary(p : Posture) : Text {
    let g = postureGrade(p);
    let mail = if (p.dmarc == "n/a" and p.spf == "n/a") "no mail here" else "e-mail protection " # (if (g == "good") "strong" else if (g == "missing") "missing" else "weak") # " (DMARC " # p.dmarc # ", SPF " # p.spf # (if (p.mtaSts != "n/a") ", MTA-STS " # p.mtaSts else "") # ")";
    mail # " · DNSSEC " # p.dnssec # " · registrar lock " # (if (p.lock == "locked") "on" else if (p.lock == "unlocked") "OFF" else "unknown") # " · CAA " # p.caa;
  };
  /// compare two postures; returns (weakened, improved) as "DMARC reject → none" lists
  func postureDiff(a : Posture, b : Posture) : ([Text], [Text]) {
    let down = List.empty<Text>(); let up = List.empty<Text>();
    for ((f, word) in POSTURE_WORDS.vals()) {
      let ra = rankOf(f, fieldOf(a, f)); let rb = rankOf(f, fieldOf(b, f));
      if (ra >= 0 and rb >= 0 and ra != rb) { let line = word # " " # fieldOf(a, f) # " → " # fieldOf(b, f); if (rb < ra) List.add(down, line) else List.add(up, line) };
    };
    (List.toArray(down), List.toArray(up));
  };
  func savePosture(d : Domain, prev : Posture, next : Posture, by : Text) : async () {
    Map.add(postures, Nat.compare, d.id, next);
    if (prev.checkedAt == 0) { ignore addEvent(d.id, "baseline", "posture", [], [], postureSummary(next), by); return };
    let (down, up) = postureDiff(prev, next);
    if (up.size() > 0) ignore addEvent(d.id, "improved", "posture", [], up, "posture improved: " # joinArr(up, "; "), by);
    if (down.size() > 0) {
      ignore addEvent(d.id, "posture", "", [], down, "posture weakened: " # joinArr(down, "; ") # " — someone changed a protective setting", by);
      alertEvent(d.id, "posture", await notifyAll(recipients(d), "Posture weakened: " # d.name # " — " # capText(joinArr(down, "; "), 140), linkTo(d), "watch.posture", "posture-" # Nat.toText(d.id) # "-" # Int.toText(now() / 1_000_000_000)), by);
    };
  };
  /// registrar lock comes from RDAP (checkExpiry) — update that one field
  func updateLock(d : Domain, lock : Text) : async () {
    let prev = switch (Map.get(postures, Nat.compare, d.id)) { case (?p) p; case null emptyPosture(d.id) };
    if (prev.lock == lock) return;
    if (prev.checkedAt == 0) { Map.add(postures, Nat.compare, d.id, { prev with lock }); return }; // the DNS part reports the baseline
    await savePosture(d, prev, { prev with lock }, "timer");
  };
  func recordVals(id : Nat, t : Text) : ?[Text] = switch (Map.get(records, Text.compare, Nat.toText(id) # ":" # t)) { case (?r) { if (r.status == "unresolved" or r.status == "baseline") null else ?r.values }; case null null };
  func checkPosture(d : Domain) : async () {
    let prev = switch (Map.get(postures, Nat.compare, d.id)) { case (?p) p; case null emptyPosture(d.id) };
    if (now() - prev.checkedAt < D) return;
    let apex = isApex(d);
    // mail: MX from the watched records, else one lookup
    var mail = prev.mail;
    switch (recordVals(d.id, "MX")) { case (?v) mail := (if (v.size() > 0) "yes" else "no"); case null { let a = await doh("cloudflare", d.name, "MX"); if (a.ok) mail := (if (a.values.size() > 0) "yes" else "no") } };
    var dmarc = prev.dmarc; var spf = prev.spf; var mtaSts = prev.mtaSts;
    if (apex or mail == "yes") {
      let dm = await doh("cloudflare", "_dmarc." # d.name, "TXT");
      if (dm.ok) {
        var pol = dmarcPolicy(dm.values);
        if (pol == "missing" and not apex) { let up = await doh("cloudflare", "_dmarc." # registrable(d), "TXT"); if (up.ok) pol := dmarcPolicy(up.values) };
        dmarc := pol;
      };
      let sp : { ok : Bool; values : [Text] } = switch (recordVals(d.id, "TXT")) { case (?v) ({ ok = true; values = v }); case null { let a = await doh("cloudflare", d.name, "TXT"); ({ ok = a.ok; values = a.values }) } };
      if (sp.ok) spf := spfGrade(sp.values);
      let ms = await doh("cloudflare", "_mta-sts." # d.name, "TXT");
      if (ms.ok) { var on = false; for (v in ms.values.vals()) if (Text.startsWith(lower(v), #text "v=stsv1")) on := true; mtaSts := (if (on) "on" else "missing") };
    } else { dmarc := "n/a"; spf := "n/a"; mtaSts := "n/a" };
    var caa = prev.caa;
    switch (recordVals(d.id, "CAA")) { case (?v) caa := (if (v.size() > 0) "set" else "missing"); case null { let a = await doh("cloudflare", d.name, "CAA"); if (a.ok) caa := (if (a.values.size() > 0) "set" else "missing") } };
    let dnssec = switch (Map.get(adSeen, Nat.compare, d.id)) { case (?ad) (if (ad) "signed" else "unsigned"); case null prev.dnssec };
    let next : Posture = { prev with checkedAt = now(); dnssec; mail; dmarc; spf; mtaSts; caa; detail = "" };
    await savePosture(d, prev, next, "timer");
  };

  // =====================================================================
  // certificates: the public certificate logs (crt.sh), once a day
  // =====================================================================
  func issuerOrg(issuer : Text) : Text {
    for (part in Text.split(issuer, #text ", ")) { let p = norm(part); if (Text.startsWith(p, #text "O=")) return Text.trim(Text.trimStart(p, #text "O="), #text "\"") };
    issuer;
  };
  func watchedName(n : Text) : Bool { for ((_, d) in Map.entries(domains)) if (d.name == n) return true; false };
  func parseCerts(body : Text) : ?Json.Json {
    // The upstream parser is recursive for nested JSON. Certificate responses
    // are flat arrays of objects; reject excessive nesting before parsing.
    var depth = 0; var quoted = false; var escaped = false;
    for (c in body.chars()) {
      if (quoted) {
        if (escaped) escaped := false else if (c == '\\') escaped := true else if (c == '\"') quoted := false;
      } else if (c == '\"') quoted := true
      else if (c == '[' or c == '{') { depth += 1; if (depth > 16) return null }
      else if (c == ']' or c == '}') { if (depth == 0) return null; depth -= 1 };
    };
    if (depth != 0 or quoted) return null;
    switch (Json.parse(Hub.sanitizeSurrogates(body))) { case (#ok(#array(rows))) ?#array(rows); case _ null };
  };
  func certDue(id : Nat) : Bool {
    if (now() < (certRetryAfter.get(id) ?? 0)) return false;
    switch (certs.get(id)) { case (?c) c.checkedAt == 0 or now() - c.checkedAt >= D; case null true };
  };
  func certFailure(d : Domain, why : Text) {
    switch (domains.get(d.id)) { case (?current) { if (not current.enabled or current.name != d.name) return }; case null return };
    let detail = "Certificate check unavailable: " # capText(why, 160) # ". Previous evidence is unchanged; retry in 3 hours.";
    let base = certs.get(d.id) ?? ({ domainId = d.id; checkedAt = 0; issuers = []; names = []; certEnds = ""; certIssuer = ""; detail = "" } : CertState);
    certRetryAfter.add(d.id, now() + 3 * H);
    certs.add(d.id, { base with detail });
    if (base.detail != detail) ignore addEvent(d.id, "error", "cert", [], [], detail, "timer");
  };
  func runCertCheck(d : Domain) : async () {
    if (not d.enabled or not certDue(d.id)) return;
    // Commit before any outcall, so even a trapping callback cannot hot-loop.
    certRetryAfter.add(d.id, now() + 3 * H);
    try { await checkCerts(d) } catch (e) { certFailure(d, Error.message(e)) };
  };
  func checkCerts(d : Domain) : async () {
    let prev = Map.get(certs, Nat.compare, d.id);
    let apex = isApex(d);
    let hdrs = [{ name = "accept"; value = "application/json" }];
    var r = await fetch("https://crt.sh/?q=" # (if (apex) "%25." else "") # d.name # "&output=json&exclude=expired&deduplicate=Y", hdrs);
    var parsed = if (r.ok) parseCerts(r.body) else null;
    var note = "";
    if (parsed == null and apex) {
      // too many certificates (or the log is slow): the exact name only
      r := await fetch("https://crt.sh/?q=" # d.name # "&output=json&exclude=expired&deduplicate=Y", hdrs);
      parsed := if (r.ok) parseCerts(r.body) else null;
      note := "only certificates naming " # d.name # " itself — the full list under this domain was too large";
    };
    let j = switch (parsed) {
      case (?j) j;
      case null {
        certFailure(d, if (r.detail == "") "the log returned no usable certificate list" else r.detail);
        return;
      };
    };
    switch (domains.get(d.id)) { case (?current) { if (not current.enabled or current.name != d.name) return }; case null return };
    let issuers = List.empty<Text>(); let names = List.empty<Text>(); var ends = ""; var endIssuer = "";
    let parent = do { let p = labelsOf(d.name); if (p.size() > 1) "*." # joinArr(Array.tabulate<Text>(p.size() - 1, func i = p[i + 1]), ".") else "" };
    switch (j) {
      case (#array(rows)) for (row in rows.vals()) {
        let org = issuerOrg(jStr(row, "issuer_name"));
        if (org != "") List.add(issuers, org);
        var covers = false;
        for (n in Text.split(lower(jStr(row, "name_value")), #char '\n')) { let nn = norm(n); if (nn != "") { if (not Text.startsWith(nn, #text "*.")) List.add(names, nn); if (nn == d.name or (parent != "" and nn == parent)) covers := true } };
        let na = capText(jStr(row, "not_after"), 10);
        if (covers and na > ends) { ends := na; endIssuer := org };
      };
      case (_) {};
    };
    let issuersA = sortDedupe(List.toArray(issuers)); let namesA = sortDedupe(List.toArray(names));
    Map.add(certs, Nat.compare, d.id, { domainId = d.id; checkedAt = now(); issuers = issuersA; names = namesA; certEnds = ends; certIssuer = endIssuer; detail = note });
    ignore certRetryAfter.remove(d.id);
    switch (prev) { case (?c) { if (Text.startsWith(c.detail, #text "Certificate check unavailable:")) ignore addEvent(d.id, "resolved", "cert", [], [], "Certificate log checks recovered", "timer") }; case null {} };
    switch (prev) {
      case null ignore addEvent(d.id, "baseline", "cert", [], issuersA, plural(issuersA.size(), "certificate issuer", "certificate issuers") # (if (issuersA.size() > 0) ": " # joinArr(issuersA, ", ") else "") # " · " # plural(namesA.size(), "name", "names") # " seen in certificates" # (if (ends != "") " · newest certificate ends " # ends else ""), "timer");
      case (?c) {
        if (c.checkedAt > 0) {
          let newIss = Array.filter<Text>(issuersA, func(x) = not has(c.issuers, x));
          if (newIss.size() > 0) {
            ignore addEvent(d.id, "cert", "", c.issuers, issuersA, "new certificate issuer: " # joinArr(newIss, ", ") # " — a certificate for this name came from an issuer not seen before", "timer");
            alertEvent(d.id, "cert", await notifyAll(recipients(d), "New certificate issuer for " # d.name # ": " # joinArr(newIss, ", "), linkTo(d), "watch.cert", "cert-" # Nat.toText(d.id) # "-" # joinArr(newIss, "+")), "timer");
          };
          let newNames = Array.filter<Text>(namesA, func(x) = not has(c.names, x) and x != d.name and not watchedName(x));
          if (newNames.size() > 0) ignore addEvent(d.id, "names", "", [], newNames, plural(newNames.size(), "new name", "new names") # " seen in certificates, not watched: " # capText(joinArr(newNames, ", "), 200), "timer");
        };
      };
    };
    // the newest certificate's end date is the closest thing to TLS expiry a canister can see
    switch (daysUntil(ends)) {
      case (?days) {
        let thresholds : [Nat] = [14, 7, 3, 1]; var hit = 0;
        for (t in thresholds.vals()) if (days <= t) hit := t;
        if (days <= 0) hit := 1;
        let last = switch (Map.get(certWarned, Nat.compare, d.id)) { case (?n) n; case null 0 };
        if (hit > 0 and (last == 0 or hit < last)) {
          Map.add(certWarned, Nat.compare, d.id, hit);
          let msg = if (days <= 0) "the newest certificate for " # d.name # " ended " # ends # " — no renewal in the certificate logs yet" else "the newest certificate for " # d.name # " ends in " # plural(Int.abs(days), "day", "days") # " (" # ends # ") — no renewal in the certificate logs yet";
          ignore addEvent(d.id, "cert", "", [], [ends], msg, "timer");
          alertEvent(d.id, "cert", await notifyAll(recipients(d), "Certificate: " # msg, linkTo(d), "watch.cert", "certend-" # Nat.toText(d.id) # "-" # Nat.toText(hit)), "timer");
        } else if (days > 14 and last != 0) ignore Map.delete(certWarned, Nat.compare, d.id);
      };
      case null {};
    };
  };

  // =====================================================================
  // lookalike domains (apex only, once a week): is someone registering names that look like ours?
  // =====================================================================
  transient let LOOK_TLDS : [Text] = ["com", "net", "org", "co", "io", "app", "dev", "xyz", "info"];
  func lookalikeCandidates(name : Text) : [Text] {
    let p = labelsOf(name);
    if (p.size() < 2) return [];
    let lab = p[0]; let rest = joinArr(Array.tabulate<Text>(p.size() - 1, func i = p[i + 1]), ".");
    let cs = Text.toArray(lab); let n = cs.size();
    let out = List.empty<Text>();
    func add(full : Text) { if (full != name and validDomain(full) and List.size(out) < 30 and not has(List.toArray(out), full)) List.add(out, full) };
    func without(i : Nat) : Text = Text.fromArray(Array.tabulate<Char>(n - 1, func k = if (k < i) cs[k] else cs[k + 1]));
    func swapped(i : Nat) : Text = Text.fromArray(Array.tabulate<Char>(n, func k = if (k == i) cs[i + 1] else if (k == i + 1) cs[i] else cs[k]));
    func doubled(i : Nat) : Text = Text.fromArray(Array.tabulate<Char>(n + 1, func k = if (k <= i) cs[k] else cs[k - 1]));
    for (t in LOOK_TLDS.vals()) if (t != rest) add(lab # "." # t);
    if (n >= 4) { var i = 0; while (i < n and i < 8) { add(without(i) # "." # rest); i += 1 } };
    if (n >= 3) { var i = 0; while (i + 1 < n and i < 6) { if (cs[i] != cs[i + 1]) add(swapped(i) # "." # rest); i += 1 } };
    for ((from, to) in ([("o", "0"), ("l", "1"), ("i", "1"), ("e", "3"), ("a", "4"), ("s", "5"), ("m", "rn"), ("rn", "m")] : [(Text, Text)]).vals()) if (Text.contains(lab, #text from)) add(Text.replace(lab, #text from, to) # "." # rest);
    if (n >= 3) { var i = 0; while (i < n and i < 3) { add(doubled(i) # "." # rest); i += 1 } };
    List.toArray(out);
  };
  /// ?true registered · ?false free · null = no registry lookup for this ending
  func rdapRegistered(name : Text) : async ?Bool {
    var url = "https://rdap.org/domain/" # name; var hops = 0; var status = 0;
    label follow while (hops < 4) {
      let r = await fetch(url, [{ name = "accept"; value = "application/rdap+json, application/json" }]);
      status := r.status;
      if (r.status >= 300 and r.status < 400 and r.location != "") { url := r.location; hops += 1 } else break follow;
    };
    if (status == 200) ?true else if (status == 404 and hops > 0) ?false else null;
  };
  func checkLookalikes(d : Domain) : async () {
    if (not isApex(d)) return;
    let last = switch (Map.get(lookalikeCheckedAt, Nat.compare, d.id)) { case (?t) t; case null 0 };
    if (now() - last < 7 * D) return;
    Map.add(lookalikeCheckedAt, Nat.compare, d.id, now());
    var firstScan = true; for ((_, l) in Map.entries(lookalikes)) if (l.domainId == d.id) firstScan := false;
    let newlyReg = List.empty<Text>(); var regN = 0; var checked = 0;
    for (c in lookalikeCandidates(d.name).vals()) {
      if (not Map.containsKey(lookalikeIgnored, Text.compare, c) and not watchedName(c)) {
        let was = Map.get(lookalikes, Text.compare, c);
        let reg = try { await rdapRegistered(c) } catch (_) { null };
        checked += 1;
        let nowT = now();
        switch (reg) {
          case (?isReg) {
            let wasReg = switch (was) { case (?w) w.registered; case null false };
            let since = if (isReg) (switch (was) { case (?w) { if (w.registered) w.registeredSince else nowT }; case null nowT }) else 0;
            Map.add(lookalikes, Text.compare, c, { name = c; domainId = d.id; registered = isReg; firstSeen = (switch (was) { case (?w) w.firstSeen; case null nowT }); checkedAt = nowT; registeredSince = since; detail = "" });
            if (isReg) regN += 1;
            if (isReg and not wasReg and not firstScan) List.add(newlyReg, c);
          };
          case null {
            switch (was) {
              case null Map.add(lookalikes, Text.compare, c, { name = c; domainId = d.id; registered = false; firstSeen = nowT; checkedAt = nowT; registeredSince = 0; detail = "no registry lookup for this ending" });
              case (?w) Map.add(lookalikes, Text.compare, c, { w with checkedAt = nowT });
            };
          };
        };
      };
    };
    if (firstScan) ignore addEvent(d.id, "baseline", "lookalike", [], [], plural(checked, "lookalike name", "lookalike names") # " checked · " # Nat.toText(regN) # " registered by someone", "timer");
    if (List.size(newlyReg) > 0) {
      let names = List.toArray(newlyReg);
      ignore addEvent(d.id, "lookalike", "", [], names, "newly registered lookalike" # (if (names.size() == 1) "" else "s") # ": " # joinArr(names, ", ") # " — someone registered a name that looks like " # d.name, "timer");
      alertEvent(d.id, "lookalike", await notifyAll(recipients(d), "Lookalike domain registered: " # joinArr(names, ", ") # " (looks like " # d.name # ")", linkTo(d), "watch.lookalike", "look-" # Nat.toText(d.id) # "-" # Int.toText(now() / 1_000_000_000)), "timer");
    };
  };
  public shared func ignoreLookalike(tok : Text, name : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let n = lower(norm(name));
    if (not Map.containsKey(lookalikes, Text.compare, n)) return { ok = false; detail = "not on the list" };
    Map.add(lookalikeIgnored, Text.compare, n, now()); ignore Map.delete(lookalikes, Text.compare, n);
    log(m.email, "lookalike ignored: " # n);
    { ok = true; detail = "" };
  };

  // =====================================================================
  // monthly report
  // =====================================================================
  func makeReport(month : Text, toDate : Bool) : Report {
    var runsN = 0; var lookups = 0; var problems = 0;
    for ((_, r) in Map.entries(runs)) if (monthOf(r.at) == month) { runsN += 1; lookups += r.queries; problems += r.problems };
    var alerts = 0; var accepted = 0; var learned = 0; var dns = 0; var dangling = 0; var expiry = 0; var postureN = 0; var certN = 0; var look = 0;
    for ((_, e) in Map.entries(events)) if (monthOf(e.at) == month) {
      switch (e.kind) {
        case ("changed") { alerts += 1; dns += 1 }; case ("dangling") { alerts += 1; dangling += 1 }; case ("expiry") { alerts += 1; expiry += 1 };
        case ("posture") { alerts += 1; postureN += 1 }; case ("cert") { alerts += 1; certN += 1 }; case ("lookalike") { alerts += 1; look += 1 };
        case ("accepted") accepted += 1; case ("learned") learned += 1; case (_) {};
      };
    };
    let parts = List.empty<Text>();
    if (dns > 0) List.add(parts, plural(dns, "DNS change", "DNS changes")); if (dangling > 0) List.add(parts, plural(dangling, "dangling name", "dangling names")); if (expiry > 0) List.add(parts, plural(expiry, "expiry warning", "expiry warnings"));
    if (postureN > 0) List.add(parts, plural(postureN, "posture weakening", "posture weakenings")); if (certN > 0) List.add(parts, plural(certN, "certificate alert", "certificate alerts")); if (look > 0) List.add(parts, plural(look, "lookalike registration", "lookalike registrations"));
    var weakN = 0; var good = 0; var graded = 0; var unsigned = 0; var signed = 0; var unlocked = 0; var expSoon = 0; var lookReg = 0;
    let weakNames = List.empty<Text>(); let issuersAll = List.empty<Text>();
    for ((id, d) in Map.entries(domains)) {
      switch (Map.get(postures, Nat.compare, id)) {
        case (?p) {
          let g = postureGrade(p);
          if (g == "good") { good += 1; graded += 1 } else if (g == "weak" or g == "missing") { weakN += 1; graded += 1; List.add(weakNames, d.name # " (" # postureWhyWeak(p) # ")") };
          if (p.dnssec == "unsigned") unsigned += 1 else if (p.dnssec == "signed") signed += 1;
          if (p.lock == "unlocked") unlocked += 1;
        };
        case null {};
      };
      switch (Map.get(certs, Nat.compare, id)) { case (?c) for (i in c.issuers.vals()) if (not has(List.toArray(issuersAll), i)) List.add(issuersAll, i); case null {} };
      switch (daysUntil(d.expiresAt)) { case (?days) { if (days <= 30) expSoon += 1 }; case null {} };
    };
    for ((_, l) in Map.entries(lookalikes)) if (l.registered) lookReg += 1;
    let nd = Map.size(domains);
    let text = (if (orgName == "") "Domain watch" else orgName # " — domain watch") # ": report for " # monthName(month) # (if (toDate) " (so far)" else "") # ", generated " # whenText(now()) # ".\n\n"
      # plural(nd, "domain", "domains") # " watched · " # plural(runsN, "check run", "check runs") # " with " # Nat.toText(lookups) # " lookups on two independent resolvers, every " # Nat.toText(intervalMins) # " minutes · "
      # (if (alerts == 0) "no alerts" else plural(alerts, "alert", "alerts") # " (" # joinArr(List.toArray(parts), ", ") # ")") # " · " # plural(accepted, "decision", "decisions") # " taken · " # plural(learned, "address", "addresses") # " learned automatically · " # plural(problems, "problem", "problems") # " (resolvers unreachable or a check failed).\n\n"
      # "Posture: " # (if (graded == 0) "not assessed yet" else "e-mail protection strong on " # Nat.toText(good) # " of " # plural(graded, "mail domain", "mail domains") # (if (weakN > 0) "; weak: " # joinArr(List.toArray(weakNames), "; ") else "")) # " · DNSSEC signed on " # Nat.toText(signed) # " of " # Nat.toText(nd) # " · registrar lock off on " # Nat.toText(unlocked) # ".\n"
      # "Certificates: " # (if (List.size(issuersAll) == 0) "no issuer data yet" else plural(List.size(issuersAll), "issuer", "issuers") # " seen (" # joinArr(List.toArray(issuersAll), ", ") # ")") # " · " # (if (certN == 0) "no certificate alerts" else plural(certN, "certificate alert", "certificate alerts")) # ".\n"
      # "Lookalike names: " # Nat.toText(lookReg) # " registered by others · " # (if (look == 0) "none new this month" else plural(look, "newly registered", "newly registered")) # ".\n"
      # "Expiry: " # (if (expSoon == 0) "nothing due within 30 days" else plural(expSoon, "domain", "domains") # " due within 30 days") # ".";
    // one report per month: a "so far" report is replaced by the final one
    var existing : ?Nat = null;
    for ((id, r) in Map.entries(reports)) if (r.month == month) existing := ?id;
    let id = switch (existing) { case (?x) x; case null { let x = nextReportId; nextReportId += 1; x } };
    let rep : Report = { id; month; generatedAt = now(); domains = nd; runs = runsN; lookups; alerts; accepted; learned; problems; postureWeak = weakN; text };
    Map.add(reports, Nat.compare, id, rep);
    if (Map.size(reports) > 60) { var oldest : ?Nat = null; for ((k, _) in Map.entries(reports)) if (oldest == null) oldest := ?k; switch (oldest) { case (?k) ignore Map.delete(reports, Nat.compare, k); case null {} } };
    rep;
  };
  func monthlyReportTick() : async () {
    let cur = monthOf(now());
    if (lastReportMonth == "") { lastReportMonth := cur; return };
    if (lastReportMonth == cur or Map.size(runs) == 0) return;
    let prev = lastReportMonth; lastReportMonth := cur;
    let r = makeReport(prev, false);
    let line = "report for " # monthName(prev) # ": " # plural(r.alerts, "alert", "alerts") # ", " # plural(r.accepted, "decision", "decisions") # ", " # plural(r.problems, "problem", "problems");
    ignore addEvent(0, "report", "", [], [], "monthly " # line, "timer");
    alertEvent(0, "", await notifyAll((if (notifyAdmins) adminList() else []), "Domain watch — " # line, (if (appUrl == "") "" else appUrl # "/#/evidence"), "watch.report", "report-" # prev), "timer");
  };
  public shared func reportNow(tok : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let r = makeReport(monthOf(now()), true);
    log(m.email, "report generated for " # r.month # " (so far)");
    { ok = true; detail = monthName(r.month) # " so far — " # plural(r.alerts, "alert", "alerts") # ", " # plural(r.accepted, "decision", "decisions") };
  };
  public shared query func listReports(tok : Text) : async [Report] {
    switch (me(tok)) { case null return []; case (?_) {} };
    let out = List.empty<Report>();
    for ((_, r) in Map.reverseEntries(reports)) List.add(out, r);
    List.toArray(out);
  };

  transient var slowBusy : Bool = false;
  transient var slowCursor : Nat = 0;
  /// one slow job per minute, between DNS runs: certificates (daily) and lookalikes (weekly), next domain in line
  func slowLane() : async () {
    if (busy or slowBusy) return;
    let ids = List.empty<Nat>(); for ((id, d) in Map.entries(domains)) if (d.enabled) List.add(ids, id);
    let n = List.size(ids); if (n == 0) return;
    slowBusy := true;
    var i = 0; var done = false;
    while (i < n and not done) {
      let id = List.at(ids, (slowCursor + i) % n); i += 1;
      switch (Map.get(domains, Nat.compare, id)) {
        case (?d) {
          let certificateDue = certDue(id);
          let lookDue = isApex(d) and (switch (Map.get(lookalikeCheckedAt, Nat.compare, id)) { case (?t) now() - t >= 7 * D; case null true });
          if (certificateDue) { await runCertCheck(d); done := true }
          else if (lookDue) { try { await checkLookalikes(d) } catch (e) { ignore addEvent(id, "error", "lookalike", [], [], "lookalike check failed: " # capText(Error.message(e), 160), "timer") }; done := true };
        };
        case null {};
      };
    };
    slowCursor := (slowCursor + i) % n;
    slowBusy := false;
  };

  func runAll(by : Text, onlyId : ?Nat) : async Run {
    if (busy and now() - busySince < 30 * 60_000_000_000) return { id = 0; at = now(); domains = 0; queries = 0; changes = 0; problems = 0; detail = "a check is already running"; by };
    busy := true; busySince := now();
    var nd = 0; var nq = 0; var nc = 0; var np = 0; var errs = 0;
    let ids = List.empty<Nat>();
    for ((id, d) in Map.entries(domains)) if (d.enabled and (switch (onlyId) { case (?x) x == id; case null true })) List.add(ids, id);
    for (id in List.values(ids)) {
      switch (Map.get(domains, Nat.compare, id)) {
        case (?d) {
          nd += 1;
          let (q, c, p) = try { await checkDomain(d, by) } catch (e) { errs += 1; ignore addEvent(id, "error", "", [], [], "check failed: " # capText(Error.message(e), 160), by); (0, 0, 1) };
          nq += q; nc += c; np += p;
          switch (Map.get(domains, Nat.compare, id)) { case (?d2) Map.add(domains, Nat.compare, id, { d2 with lastCheck = now(); lastResult = (if (c > 0) Nat.toText(c) # " change" # (if (c == 1) "" else "s") else if (p > 0) Nat.toText(p) # " problem" # (if (p == 1) "" else "s") else "ok") }); case null {} };
          switch (Map.get(domains, Nat.compare, id)) { case (?d3) { try { await checkExpiry(d3) } catch (_) {} }; case null {} };
          switch (Map.get(domains, Nat.compare, id)) { case (?d4) { try { await checkPosture(d4) } catch (e) { ignore addEvent(id, "error", "posture", [], [], "posture check failed: " # capText(Error.message(e), 160), by) } }; case null {} };
        };
        case null {};
      };
    };
    busy := false;
    let run : Run = { id = nextRunId; at = now(); domains = nd; queries = nq; changes = nc; problems = np; detail = (if (errs > 0) Nat.toText(errs) # " check(s) failed" else ""); by };
    Map.add(runs, Nat.compare, nextRunId, run); nextRunId += 1;
    if (nextRunId > 5000) ignore Map.delete(runs, Nat.compare, nextRunId - 5000 : Nat);
    if (monitoringSince == 0 and nd > 0) monitoringSince := now();
    run;
  };
  public shared func checkNow(tok : Text, id : ?Nat) : async { ok : Bool; detail : Text; run : Run } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only"; run = { id = 0; at = 0; domains = 0; queries = 0; changes = 0; problems = 0; detail = ""; by = "" } } };
    let r = await runAll(m.id, id);
    if (r.id == 0) return { ok = false; detail = r.detail; run = r };
    switch (id) { case (?x) { switch (Map.get(domains, Nat.compare, x)) { case (?d) await runCertCheck(d); case null {} } }; case null {} };
    { ok = true; detail = Nat.toText(r.domains) # " domain" # (if (r.domains == 1) "" else "s") # " · " # Nat.toText(r.queries) # " lookups · " # Nat.toText(r.changes) # " change" # (if (r.changes == 1) "" else "s") # " · " # Nat.toText(r.problems) # " problem" # (if (r.problems == 1) "" else "s"); run = r };
  };
  transient var lastTimerRun : Int = 0;
  func timerTick() : async () {
    try { await monthlyReportTick() } catch (_) {};
    if (now() - lastTimerRun < (intervalMins : Int) * 60_000_000_000 - 30_000_000_000) { await slowLane(); return };
    lastTimerRun := now();
    ignore await runAll("timer", null);
  };

  // =====================================================================
  // reading
  // =====================================================================
  public type CheckSummary = { certificateAt : Int; certificateDetail : Text; certificateEnds : Text; certificateRetryAt : Int; postureAt : Int; lookalikes : Nat };
  public type DomainRow = { checks : ?CheckSummary; domain : Domain; records : [RecordSet]; open : Nat; worst : Text; expiryDays : ?Int; grade : Text };
  func gradeOf(id : Nat) : Text = switch (Map.get(postures, Nat.compare, id)) { case (?p) postureGrade(p); case null "unknown" };
  func worstOf(rs : [RecordSet], d : Domain) : Text {
    var w = "ok";
    for (r in rs.vals()) {
      if (r.status == "dangling" or r.status == "changed" or r.status == "nxdomain") w := "alert"
      else if ((r.status == "disagree" or r.status == "unresolved") and w == "ok") w := "warn"
      else if (r.status == "baseline" and w == "ok") w := "pending";
    };
    switch (daysUntil(d.expiresAt)) { case (?days) { if (days <= 7) w := "alert" else if (days <= (expiryWarnDays : Int) and w == "ok") w := "warn" }; case null {} };
    if (rs.size() == 0) w := "pending";
    if (not d.enabled) w := "paused";
    w;
  };
  func rowOf(d : Domain) : DomainRow {
    let rs = List.empty<RecordSet>();
    for (t in d.types.vals()) { switch (Map.get(records, Text.compare, Nat.toText(d.id) # ":" # t)) { case (?r) List.add(rs, r); case null {} } };
    let arr = List.toArray(rs);
    var open = 0; for (r in arr.vals()) if (r.status == "changed") open += 1;
    let cert = Map.get(certs, Nat.compare, d.id);
    var lookCount = 0; for ((_, l) in Map.entries(lookalikes)) if (l.domainId == d.id and l.registered) lookCount += 1;
    let checks : CheckSummary = {
      certificateAt = switch (cert) { case (?c) c.checkedAt; case null 0 };
      certificateDetail = switch (cert) { case (?c) c.detail; case null "" };
      certificateEnds = switch (cert) { case (?c) c.certEnds; case null "" };
      certificateRetryAt = switch (Map.get(certRetryAfter, Nat.compare, d.id)) { case (?at) at; case null 0 };
      postureAt = switch (Map.get(postures, Nat.compare, d.id)) { case (?p) p.checkedAt; case null 0 };
      lookalikes = lookCount;
    };
    { domain = d; records = arr; open; worst = worstOf(arr, d); expiryDays = daysUntil(d.expiresAt); grade = gradeOf(d.id); checks = ?checks };
  };
  public shared query func listDomains(tok : Text) : async [DomainRow] {
    switch (me(tok)) { case null return []; case (?_) {} };
    let out = List.empty<DomainRow>();
    for ((_, d) in Map.entries(domains)) List.add(out, rowOf(d));
    Array.sort<DomainRow>(List.toArray(out), func(a, b) = Text.compare(a.domain.name, b.domain.name));
  };
  public type DomainDetail = { row : DomainRow; events : [Event]; watcherNames : [Text]; watcherEmails : [Text]; posture : ?Posture; postureText : Text; cert : ?CertState; lookalikes : [Lookalike]; owners : [IpOwner]; registrable : Text; apex : Bool };
  public shared query func getDomain(tok : Text, id : Nat) : async ?DomainDetail {
    switch (me(tok)) { case null return null; case (?_) {} };
    switch (Map.get(domains, Nat.compare, id)) {
      case null null;
      case (?d) {
        let evs = List.empty<Event>();
        for ((_, e) in Map.reverseEntries(events)) if (e.domainId == id and List.size(evs) < 200) List.add(evs, e);
        let owners = List.empty<IpOwner>();
        for (t in ["A", "AAAA"].vals()) switch (Map.get(records, Text.compare, Nat.toText(id) # ":" # t)) {
          case (?r) for (ip in sortDedupe(Array.concat(r.expected, r.values)).vals()) switch (Map.get(ipOwners, Text.compare, ip)) { case (?o) List.add(owners, o); case null {} };
          case null {};
        };
        let looks = List.empty<Lookalike>();
        for ((_, l) in Map.entries(lookalikes)) if (l.domainId == id and l.registered) List.add(looks, l);
        let posture = Map.get(postures, Nat.compare, id);
        ?{ row = rowOf(d); events = Array.map<Event, Event>(List.toArray(evs), showEvent); watcherNames = Array.map<Text, Text>(d.watchers, nameOf); watcherEmails = Array.map<Text, Text>(d.watchers, emailOfPid); posture; postureText = (switch (posture) { case (?p) postureSummary(p); case null "" }); cert = Map.get(certs, Nat.compare, id); lookalikes = List.toArray(looks); owners = List.toArray(owners); registrable = registrable(d); apex = isApex(d) };
      };
    };
  };
  public type Summary = { domains : Nat; enabled : Nat; open : Nat; warn : Nat; recordSets : Nat; intervalMins : Nat; monitoringSince : Int; runs : Nat; lastRun : ?Run; changes30d : Nat; events30d : Nat; recipients : [Text]; expiringSoon : Nat; busy : Bool; postureWeak : Nat; postureGood : Nat; lookalikesRegistered : Nat; reports : Nat; expiryWarnDays : Nat };
  public shared query func summary(tok : Text) : async ?Summary {
    switch (me(tok)) { case null return null; case (?_) {} };
    var en = 0; var open = 0; var warn = 0; var exp = 0; var pw = 0; var pg = 0; var lr = 0;
    for ((id, _) in Map.entries(domains)) { let g = gradeOf(id); if (g == "weak" or g == "missing") pw += 1 else if (g == "good") pg += 1 };
    for ((_, l) in Map.entries(lookalikes)) if (l.registered) lr += 1;
    for ((_, d) in Map.entries(domains)) { if (d.enabled) en += 1; let r = rowOf(d); if (r.worst == "alert") open += 1 else if (r.worst == "warn") warn += 1; switch (r.expiryDays) { case (?x) { if (x <= (expiryWarnDays : Int)) exp += 1 }; case null {} } };
    var c30 = 0; var e30 = 0; let since = now() - 30 * D;
    for ((_, e) in Map.entries(events)) if (e.at >= since) { e30 += 1; if (e.kind == "changed" or e.kind == "dangling" or e.kind == "expiry") c30 += 1 };
    var lastRun : ?Run = null;
    for ((_, r) in Map.reverseEntries(runs)) { if (lastRun == null) lastRun := ?r };
    ?{ domains = Map.size(domains); enabled = en; open; warn; recordSets = Map.size(records); intervalMins; monitoringSince; runs = Map.size(runs); lastRun; changes30d = c30; events30d = e30; recipients = (if (notifyAdmins) adminList() else []); expiringSoon = exp; busy; postureWeak = pw; postureGood = pg; lookalikesRegistered = lr; reports = Map.size(reports); expiryWarnDays };
  };
  public shared query func recentEvents(tok : Text, limit : Nat) : async [{ event : Event; domain : Text }] {
    switch (me(tok)) { case null return []; case (?_) {} };
    let out = List.empty<{ event : Event; domain : Text }>();
    for ((_, e) in Map.reverseEntries(events)) { if (List.size(out) < Nat.min(limit, 500) and e.kind != "run") List.add(out, { event = showEvent(e); domain = (switch (Map.get(domains, Nat.compare, e.domainId)) { case (?d) d.name; case null (if (e.domainId == 0) "watch" else "#" # Nat.toText(e.domainId)) }) }) };
    List.toArray(out);
  };
  public shared query func listRuns(tok : Text, limit : Nat) : async [Run] {
    switch (me(tok)) { case null return []; case (?_) {} };
    let out = List.empty<Run>();
    for ((_, r) in Map.reverseEntries(runs)) { if (List.size(out) < Nat.min(limit, 500)) List.add(out, showRun(r)) };
    List.toArray(out);
  };
  /// Evidence for an auditor: what is watched, how, since when, what happened. CSV, spreadsheet-safe.
  public shared query func exportEvidence(tok : Text, days : Nat) : async Text {
    switch (admin(tok)) { case null return ""; case (?_) {} };
    let since = now() - (Nat.min(days, 365) : Int) * D;
    var out = "# " # (if (orgName == "") "domain watch" else orgName # " — domain watch") # " · evidence export · generated " # whenText(now()) # "\n";
    out #= "# monitoring since," # csv(whenText(monitoringSince)) # ",interval minutes," # Nat.toText(intervalMins) # ",resolvers,\"cloudflare-dns.com + dns.google (DNS-over-HTTPS)\",expiry and ownership source,\"RDAP (rdap.org)\",certificate source,\"crt.sh\"\n";
    out #= "section,when,domain,type,kind,before,after,detail,by\n";
    for ((_, d) in Map.entries(domains)) out #= Text.join([csv("domain"), csv(whenText(d.createdAt)), csv(d.name), csv(joinArr(d.types, " ")), csv(if (d.enabled) "watched" else "paused"), csv(""), csv(d.expiresAt), csv("last check " # whenText(d.lastCheck) # " · " # d.lastResult # (if (d.expiryDetail != "") " · registry: " # d.expiryDetail else "")), csv(d.createdBy)].vals(), ",") # "\n";
    for ((_, e) in Map.entries(events)) if (e.at >= since) out #= Text.join([csv("event"), csv(whenText(e.at)), csv(switch (Map.get(domains, Nat.compare, e.domainId)) { case (?d) d.name; case null "#" # Nat.toText(e.domainId) }), csv(e.rtype), csv(e.kind), csv(joinArr(e.before, " | ")), csv(joinArr(e.after, " | ")), csv(e.detail), csv(e.by)].vals(), ",") # "\n";
    for ((id, d) in Map.entries(domains)) switch (Map.get(postures, Nat.compare, id)) { case (?p) { if (p.checkedAt > 0) out #= Text.join([csv("posture"), csv(whenText(p.checkedAt)), csv(d.name), csv(""), csv(postureGrade(p)), csv(""), csv(""), csv(postureSummary(p) # (switch (Map.get(certs, Nat.compare, id)) { case (?c) " · certificate issuers: " # joinArr(c.issuers, ", ") # (if (c.certEnds != "") " · newest certificate ends " # c.certEnds else ""); case null "" })), csv("timer")].vals(), ",") # "\n" }; case null {} };
    for ((_, r) in Map.entries(reports)) out #= Text.join([csv("report"), csv(whenText(r.generatedAt)), csv(r.month), csv(""), csv("report"), csv(""), csv(""), csv(Text.replace(r.text, #char '\n', " ")), csv("timer")].vals(), ",") # "\n";
    for ((_, r) in Map.entries(runs)) if (r.at >= since) out #= Text.join([csv("run"), csv(whenText(r.at)), csv(Nat.toText(r.domains) # " domains"), csv(Nat.toText(r.queries) # " lookups"), csv("run"), csv(""), csv(Nat.toText(r.changes) # " changes / " # Nat.toText(r.problems) # " problems"), csv(r.detail), csv(r.by)].vals(), ",") # "\n";
    out;
  };
  /// Prove the alert chain without touching DNS: one notification to every recipient, with the hub's answer for each.
  public shared func testAlert(tok : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (hubId == "") return { ok = false; detail = "no hub wired" };
    let to = sortDedupe(Array.concat(adminList(), [m.email])); // addresses: notifyAll resolves ids and addresses alike
    var okN = 0; var fails = "";
    for (e in to.vals()) {
      let r = try { await Hub.hub(hubId).hub_notify({ email = e; title = "Test alert from the domain watch — the alert path works (sent by " # m.displayName # ")"; url = (if (appUrl == "") "" else appUrl # "/#/overview"); kind = "watch.test"; dedupeKey = "test-" # Int.toText(now() / 1_000_000_000) }) } catch (err) { { ok = false; detail = Error.message(err) } };
      if (r.ok) okN += 1 else fails #= (if (fails == "") "" else "; ") # e # ": " # r.detail;
    };
    log(m.email, "test alert sent to " # Nat.toText(okN) # " of " # Nat.toText(to.size()));
    ignore addEvent(0, "test", "", [], [], "test alert to " # Nat.toText(okN) # " recipient" # (if (okN == 1) "" else "s") # (if (fails != "") " — hub refused: " # fails else ""), m.id);
    if (okN == 0) return { ok = false; detail = "the hub refused every recipient — " # capText(fails, 220) };
    { ok = true; detail = "sent to " # Nat.toText(okN) # " of " # Nat.toText(to.size()) # " (" # joinArr(to, ", ") # ") — check the bell on the hub menu" # (if (fails != "") "; refused: " # capText(fails, 160) else "") };
  };
  public shared func syncNow(tok : Text) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    let n = try { await pullDirectory() } catch (e) { return { ok = false; detail = Error.message(e) } };
    { ok = true; detail = Nat.toText(n) # " people" };
  };

  // =====================================================================
  // person ids (0.5.0): watchers, creators and event/run authors are the hub's stable person id. This release
  // converts older address-keyed records once, right after the upgrade (docs/PERSON-IDS.md).
  // =====================================================================
  var idMigration : Text = "pending"; // pending | done
  transient let MIGRATING : Text = "people ids are being migrated — try again in a minute";
  func migrating() : Bool = idMigration != "done";
  func isAddress(t : Text) : Bool = Text.contains(t, #char '@') and not Text.startsWith(t, #text "legacy:");
  func migrateIds() : async () {
    if (idMigration == "done") return;
    if (Map.size(domains) == 0 and Map.size(events) == 0) { idMigration := "done"; return }; // fresh install
    if (hubId == "") return;
    try { ignore await pullDirectory() } catch (_) {};
    let seen = Map.empty<Text, Bool>();
    func note(x : Text) { if (isAddress(x)) Map.add(seen, Text.compare, lower(x), true) };
    for ((_, d) in Map.entries(domains)) { note(d.createdBy); for (w in d.watchers.vals()) note(w) };
    for ((_, e) in Map.entries(events)) note(e.by);
    for ((_, r) in Map.entries(runs)) note(r.by);
    let emails = Iter.toArray(Map.keys(seen));
    let found = Map.empty<Text, Text>();
    if (emails.size() > 0) {
      let hits = try { await Hub.lookupIds(Hub.hub(hubId), emails) } catch (_) { return }; // hub unreachable: the 30-second timer retries
      for ((e, pid) in hits.vals()) Map.add(found, Text.compare, e, pid);
    };
    if (idMigration == "done") return;
    func mig(x : Text) : Text = if (isAddress(x)) Hub.migrateKey(found, x) else x;
    for ((id, d) in Iter.toArray(Map.entries(domains)).vals()) Map.add(domains, Nat.compare, id, { d with createdBy = mig(d.createdBy); watchers = Array.map<Text, Text>(d.watchers, mig) });
    for ((id, e) in Iter.toArray(Map.entries(events)).vals()) if (isAddress(e.by)) Map.add(events, Nat.compare, id, { e with by = mig(e.by) });
    for ((id, r) in Iter.toArray(Map.entries(runs)).vals()) if (isAddress(r.by)) Map.add(runs, Nat.compare, id, { r with by = mig(r.by) });
    idMigration := "done";
    log("system", "people references migrated to person ids: " # Nat.toText(emails.size()) # " addresses, " # Nat.toText(Map.size(found)) # " known to the hub, the rest kept as legacy:<address>");
  };
  transient let _idMigrationTimer = Timer.setTimer<system>(#seconds 0, func() : async () { await migrateIds() });

  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { try { ignore await pullDirectory() } catch (_) {}; ignore Hub.pruneSessions(sessions); if (migrating()) { try { await migrateIds() } catch (_) {} } });
  ignore Timer.recurringTimer<system>(#seconds 60, func() : async () { await timerTick() });
  /// Aggregate-only read for Hub Operations; no session or records leave this app.
  public shared query ({ caller }) func hub_operations(viewer : Text) : async Operations.Snapshot {
    assert Hub.isHub(caller, hubId);
    let email = emailOfPid(viewer);
    if (viewer == "" or pidOf(email) != viewer or not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or Hub.appRole(people, email, "watch") != "admin") return Operations.denied();
    var enabled = 0; var alerts = 0; var warnings = 0; var stale = 0; var expiring = 0; var unknown = 0;
    for (d in domains.values()) if (d.enabled) {
      enabled += 1;
      let r = rowOf(d);
      if (r.worst == "alert") alerts += 1 else if (r.worst == "warn") warnings += 1;
      if (d.lastCheck == 0 or now() - d.lastCheck > ((Nat.max(intervalMins * 2, 30) : Nat) : Int) * 60_000_000_000 or Text.startsWith(d.lastResult, #text "error")) stale += 1;
      if (d.expiryCheckedAt == 0 or now() - d.expiryCheckedAt > 2 * D) unknown += 1
      else switch (r.expiryDays) { case (?days) { if (days <= (expiryWarnDays : Int)) expiring += 1 }; case null unknown += 1 };
    };
    Operations.ready([("enabled", enabled), ("alerts", alerts), ("warnings", warnings), ("stale", stale), ("expiring", expiring), ("unknown", unknown), ("expiryDays", expiryWarnDays)]);
  };

};
