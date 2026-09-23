import Ingest "../lib/Ingest";
import T "../types";
import A "../lib/Auth";
import V "../lib/Validation";
import Analytics "../lib/Analytics";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Timer "mo:core/Timer";
import Principal "mo:core/Principal";
import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Nat "mo:core/Nat";

mixin (auth : T.AuthState, lease : T.Lease, db : T.Store, siteAccess : Map.Map<Text, T.SiteAccess>, cleanExtras : () -> ()) {
  func admin(token : Text) : Bool {
    switch (A.user(auth, lease, token)) {
      case (?u) u.role == "admin";
      case null false;
    };
  };
  public query func listSites(token : Text) : async [T.SiteView] {
    db.sites.values().filter(func s = A.permit(auth, lease, db, siteAccess, token, s.id, false)).map(func s = { s with viewers = []; accessRole = A.role(auth, lease, db, siteAccess, token, s.id) }).toArray();
  };
  public shared func saveSite(token : Text, site : T.Site) : async T.Result<T.Site> {
    let existing = db.sites.get(site.id);
    if (if (existing == null) not admin(token) else not A.permit(auth, lease, db, siteAccess, token, site.id, true)) return #err(#unauthorized);
    if (site.viewers.size() != 0) return #err(#invalid("Use setSiteAccess for website members; viewers is a deprecated field"));
    if (db.retired.containsKey(site.id)) return #err(#conflict("Deleted website IDs cannot be reused"));
    switch (V.site(site)) { case (?e) return #err(#invalid(e)); case null {} };
    if (not db.sites.containsKey(site.id) and db.retired.size() >= 10000) return #err(#capacity("Site lifecycle limit reached"));
    if (not db.sites.containsKey(site.id) and db.sites.size() >= 100) return #err(#capacity("100 sites per canister"));
    if (db.sites.values().any(func s = s.id != site.id and s.domain == site.domain)) return #err(#conflict("Domain already registered"));
    // The legacy field is kept internally until the website's access is reviewed.
    let stored = {site with viewers = switch existing {case (?old) old.viewers; case null []}};
    db.sites.add(site.id, stored);
    if (existing == null) siteAccess.add(site.id, {revision = 1; readers = []; managers = []; updatedBy = (A.user(auth, lease, token) ??(return #err(#unauthorized))).id; updatedAt = Analytics.now()});
    #ok({stored with viewers = []});
  };
  public shared func deleteSite(token : Text, id : Text) : async T.Result<()> {
    if (not admin(token)) return #err(#unauthorized);
    if (not db.sites.containsKey(id)) return #err(#notFound);
    db.sites.remove(id);
    siteAccess.remove(id);
    db.retired.add(id,true);
    // Revoke credentials atomically; unreachable data is physically swept in bounded slices.
    for ((h, k) in db.keys.toArray().values()) if (k.site == id) db.keys.remove(h);
    for ((h, g) in db.goals.toArray().values()) if (g.site == id) db.goals.remove(h);
    for ((h, a) in db.annotations.toArray().values()) if (a.site == id) db.annotations.remove(h);
    for ((h, i) in db.imports.toArray().values()) if (i.site == id) db.imports.remove(h);
    #ok;
  };
  public shared ({ caller }) func configureCollectors(collectors : [Principal]) : async () {
    assert caller.isController();
    assert collectors.size() <= 10;
    assert collectors.values().all(func p = not p.isAnonymous());
    db.collectors := collectors;
  };
  public query ({ caller }) func collectorSites() : async [T.Site] {
    assert db.collectors.values().any(func p = p == caller);
    db.sites.values().map(func s = { s with viewers = [] }).toArray();
  };
  public shared ({ caller }) func ingestBatch(batch : [T.Event]) : async T.Result<{ accepted : Nat; duplicates : Nat }> {
    if (not db.collectors.values().any(func p = p == caller)) return #err(#unauthorized);
    Ingest.commit(db, batch);
  };

  public query func report(token : Text, request : T.ReportRequest) : async T.Result<T.Report> {
    if (not A.permit(auth, lease, db, siteAccess, token, request.site, false)) return #err(#unauthorized);
    Analytics.report(db, request);
  };
  public query func funnel(token : Text, request : T.ReportRequest, steps : [T.FunnelStep]) : async T.Result<[Nat]> {
    if (not A.permit(auth, lease, db, siteAccess, token, request.site, false)) return #err(#unauthorized);
    Analytics.funnel(db, request, steps);
  };
  public query func journeys(token : Text, request : T.ReportRequest) : async T.Result<[(Text, Text, Nat)]> {
    if (not A.permit(auth, lease, db, siteAccess, token, request.site, false)) return #err(#unauthorized);
    Analytics.journeys(db, request);
  };
  public query func exportEvents(token : Text, site : Text, after : Text, limit : Nat) : async T.Result<{ events : [T.Event]; cursor : Text }> {
    if (not A.permit(auth, lease, db, siteAccess, token, site, true)) return #err(#unauthorized);
    if (limit == 0 or limit > 500 or (after != "" and not after.startsWith(#text(site # ":")))) return #err(#invalid("Invalid cursor or limit (1–500)"));
    let s = db.sites.get(site) ??(return #err(#notFound));
    let cutoff = Analytics.now() -s.retentionDays * 86400;
    let start = if (after == "") Analytics.key(site, Int.max(0, cutoff), "") else after;
    let out = List.empty<T.Event>();
    var cursor = "";
    for ((k, e) in db.events.entriesFrom(start)) {
      if (e.site != site) break;
      if (k == after or e.at < cutoff) continue;
      if (out.size() >= limit) break;
      out.add(e);
      cursor := k;
    };
    #ok({ events = out.toArray(); cursor });
  };
  public query func goals(token : Text, site : Text) : async T.Result<[T.Goal]> {
    if (not A.permit(auth, lease, db, siteAccess, token, site, false)) return #err(#unauthorized);
    #ok(db.goals.values().filter(func g = g.site == site).toArray());
  };
  public shared func saveGoal(token : Text, goal : T.Goal) : async T.Result<()> {
    if (not A.permit(auth, lease, db, siteAccess, token, goal.site, true)) return #err(#unauthorized);
    if (not db.sites.containsKey(goal.site)) return #err(#notFound);
    if (not V.identifier(goal.id) or goal.name.size() == 0 or goal.name.size() > 100 or goal.value.size() == 0 or goal.value.size() > 512) return #err(#invalid("Invalid goal"));
    switch(goal.kind) {case (#scroll n) {if(n < 1 or n > 100 or not goal.value.startsWith(#text "/")) return #err(#invalid("Scroll goals need a page path and depth from 1 to 100"))};case (#page) {if(not goal.value.startsWith(#text "/")) return #err(#invalid("Page goals need a path starting with /"))};case (#event) {}};
    let k = goal.site # ":" # goal.id;
    if (db.goals.size() >= 5000 and not db.goals.containsKey(k)) return #err(#capacity("Goal limit reached"));
    db.goals.add(k, goal);
    #ok;
  };
  public query func goalReport(token : Text, request : T.ReportRequest, id : Text) : async T.Result<{visitors : Nat; completions : Nat; revenue : [(Text,Int)]}> {
    if (not A.permit(auth, lease, db, siteAccess, token, request.site, false)) return #err(#unauthorized);
    let goal = db.goals.get(request.site # ":" # id) ?? (return #err(#notFound));
    Analytics.goalReport(db,request,goal);
  };
  public shared func deleteGoal(token : Text, site : Text, id : Text) : async T.Result<()> {
    if (not A.permit(auth, lease, db, siteAccess, token, site, true)) return #err(#unauthorized);
    db.goals.remove(site # ":" # id);
    #ok;
  };
  public shared func createKey(token : Text, site : Text, name : Text, scope : { #read; #manage; #share }, days : Nat) : async T.Result<{ token : Text; key : T.Key }> {
    let u = A.user(auth, lease, token) ??(return #err(#unauthorized));
    if (not A.manages(A.personRole(auth, db, siteAccess, u.id, site))) return #err(#unauthorized);
    if (days < 1 or days > 365 or name.size() > 100 or db.keys.size() >= 2000) return #err(#invalid("Key name, expiry or key limit invalid"));
    let hub = auth.hubId;
    let ic : actor { raw_rand : () -> async Blob } = actor "aaaaa-aa";
    let secret = A.hex(await (with timeout = 30) ic.raw_rand());
    if (hub != auth.hubId or not A.permit(auth, lease, db, siteAccess, token, site, true)) return #err(#unauthorized);
    if (not db.sites.containsKey(site)) return #err(#notFound);
    if (db.keys.size() >= 2000) return #err(#capacity("Key limit reached"));
    let hash = A.hash(secret);
    let key : T.Key = {
      id = hash;
      owner = u.id;
      site;
      name;
      scope;
      expiresAt = Analytics.now() +days * 86400;
    };
    db.keys.add(hash, key);
    #ok({ token = secret; key });
  };
  public query func listKeys(token : Text) : async T.Result<[T.Key]> {
    let u = A.user(auth, lease, token) ??(return #err(#unauthorized));
    #ok(db.keys.values().filter(func k = A.manages(A.personRole(auth, db, siteAccess, u.id, k.site))).toArray());
  };
  public shared func revokeKey(token : Text, id : Text) : async T.Result<()> {
    let u = A.user(auth, lease, token) ??(return #err(#unauthorized));
    let key = db.keys.get(id) ??(return #err(#notFound));
    if (not A.manages(A.personRole(auth, db, siteAccess, u.id, key.site))) return #err(#unauthorized);
    db.keys.remove(id);
    #ok;
  };
  public query func annotations(token : Text, site : Text) : async T.Result<[T.Annotation]> {
    if (not A.permit(auth, lease, db, siteAccess, token, site, false)) return #err(#unauthorized);
    #ok(db.annotations.values().filter(func a = a.site == site).toArray());
  };
  public shared func saveAnnotation(token : Text, item : T.Annotation) : async T.Result<()> {
    if (not A.permit(auth, lease, db, siteAccess, token, item.site, true)) return #err(#unauthorized);
    if (not db.sites.containsKey(item.site)) return #err(#notFound);
    if (not V.identifier(item.id) or item.text.size() > 500 or item.at < 0 or (db.annotations.size() >= 10000 and not db.annotations.containsKey(item.site # ":" # item.id))) return #err(#invalid("Invalid annotation or capacity reached"));
    db.annotations.add(item.site # ":" # item.id, item);
    #ok;
  };
  public shared func importAggregates(token : Text, rows : [T.ImportRow]) : async T.Result<Nat> {
    if (rows.size() == 0 or rows.size() > 100) return #err(#invalid("Send 1–100 rows"));
    let pending = Map.empty<Text,T.ImportRow>();
    for (row in rows.values()) {
      if (not A.permit(auth, lease, db, siteAccess, token, row.site, true)) return #err(#unauthorized);
      let site = db.sites.get(row.site) ??(return #err(#notFound));
      if (not V.identifier(row.id) or row.day < Int.max(0, Analytics.now() - site.retentionDays * 86400) or row.day > Analytics.now() or row.day % 86400 != 0 or (not Analytics.validDimension(row.dimension, site) and not Analytics.importDimension(row.dimension)) or row.value.size() > 2048) return #err(#invalid("Invalid aggregate row or outside site retention"));
      let m = row.metrics;
      if ([m.visitors,m.visits,m.pageviews,m.events,m.bounces,m.durationSeconds,m.engagementMs,m.scrollDepthSum,m.scrollSamples].values().any(func n = n > 18_446_744_073_709_551_615) or m.revenue.size() > 100 or m.revenue.values().any(func(c,n) = c.size() != 3 or n < 0 or n > 18_446_744_073_709_551_615)) return #err(#invalid("Aggregate metrics exceed bounds"));
      let key = row.site # ":" # row.id;
      let existing = switch(db.imports.get(key)) { case (?r) ?r; case null pending.get(key) };
      if (existing != null and existing != ?row) return #err(#conflict("Import id already used"));
      if (existing == null) pending.add(key,row);
    };
    if (db.imports.size() + pending.size() > 100000) return #err(#capacity("Import row capacity reached"));
    for ((key,row) in pending.entries()) db.imports.add(key,row);
    #ok(pending.size());
  };
  public query func imported(token : Text, site : Text, from : Int, until : Int) : async T.Result<[T.ImportRow]> {
    if (not A.permit(auth, lease, db, siteAccess, token, site, false)) return #err(#unauthorized);
    let config = db.sites.get(site) ??(return #err(#notFound));
    if (from < 0 or until <= from) return #err(#invalid("Invalid interval"));
    let cutoff = Analytics.now() - config.retentionDays * 86400;
    let out = db.imports.values().filter(func r = r.site == site and r.day >= Int.max(from,cutoff) and r.day < until).take(5001).toArray();
    if (out.size() > 5000) return #err(#capacity("Narrow the historical interval"));
    #ok(out);
  };
  public query func health(token : Text) : async T.Result<{ accepted : Nat; duplicates : Nat; rejected : Nat; storedEvents : Nat; storageChargeBytes : Nat; collectors : [Text]; directoryAt : Int }> {
    if (not admin(token)) return #err(#unauthorized);
    #ok({
      accepted = db.accepted;
      duplicates = db.duplicates;
      rejected = db.rejected;
      storedEvents = db.events.size();
      storageChargeBytes = db.eventBytes;
      collectors = db.collectors.map(func p = p.toText());
      directoryAt = lease.at;
    });
  };
  func cleanup() {
    cleanExtras();
    let start = db.cleanupAfter ??"";
    var visited = 0;
    var last : ?Text = null;
    let expired = List.empty<(Text, T.Event)> ();
    for ((k, e) in db.events.entriesFrom(start)) {
      if (?k == db.cleanupAfter) continue;
      visited += 1;
      last := ?k;
      let remove = switch (db.sites.get(e.site)) {
        case null true;
        case (?s) e.at < Analytics.now() -s.retentionDays * 86400;
      };
      if (remove) expired.add((k, e));
      if (visited >= 1000) break;
    };
    for ((k, e) in expired.values()) {
      db.eventBytes -= Analytics.eventBytes(e);
      db.events.remove(k);
      db.eventIds.remove(e.site # ":" # e.id);
    };
    db.cleanupAfter := if (visited < 1000) null else last;
    var importVisited = 0;
    var importLast : ?Text = null;
    let oldImports = List.empty<Text>();
    for ((k,r) in db.imports.entriesFrom(db.importCleanupAfter ?? "")) {
      if (?k == db.importCleanupAfter) continue;
      importVisited += 1; importLast := ?k;
      let expired = switch(db.sites.get(r.site)) { case null true; case (?s) r.day < Analytics.now() - s.retentionDays * 86400 };
      if (expired) oldImports.add(k);
      if (importVisited >= 1000) break;
    };
    for (k in oldImports.values()) db.imports.remove(k);
    db.importCleanupAfter := if (importVisited < 1000) null else importLast;
    for ((h, k) in db.keys.toArray().values()) if (k.expiresAt <= Analytics.now()) db.keys.remove(h);
  };
  func startAnalytics<system>() {
  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { cleanup() });
  };
};
