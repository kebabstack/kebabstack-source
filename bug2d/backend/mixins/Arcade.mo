import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import T "../types";
import Rules "../lib/Rules";

mixin (profiles : T.Profiles, aliases : Map.Map<Text, Text>, links : T.Links, runs : T.Runs, scores : T.Scores, counters : T.Counters,
  configuredHub : () -> Text, identify : Text -> ?Text, login : Text -> async ?T.Login,
  endSession : Text -> (), legacyName : Text -> Text, legacyAlias : Text -> ?Text) {
  transient let lastCalls = Map.empty<Text, Int>();
  transient let pendingLogin = Map.empty<Principal, Nat>();
  transient var budgetAt : Int = 0;
  transient var budgetUsed : Nat = 0;
  func pilot(key : Text, caller : Principal) : T.Pilot {
    let link = links.get(caller);
    { name = (profiles.get(key) ?? ({ name = "" })).name; hub = link != null;
      hubId = configuredHub(); suiteToken = switch (link) { case (?l) l.suiteToken; case null "" } }
  };
  func allowed(caller : Principal, action : Text) : Bool {
    if (caller.isAnonymous()) return false;
    let now = Time.now();
    let bucket = caller.toText() # ":" # action;
    if (now - budgetAt > 60_000_000_000) { budgetAt := now; budgetUsed := 0; lastCalls.clear() };
    if (budgetUsed >= 600 or now < (lastCalls.get(bucket) ?? 0) + 500_000_000) return false;
    budgetUsed += 1; lastCalls.add(bucket, now); true
  };
  func arcadeOwner(caller : Principal) : T.Reply<Text> {
    if (caller.isAnonymous()) return #err("A browser identity is required.");
    switch (links.get(caller)) {
      case null #ok("g:" # caller.toText());
      case (?link) {
        if (link.hub != configuredHub() or Time.now() >= link.expiresAt) return #err("Kebapstack session expired. Sign in again or sign out to play publicly.");
        let pid = identify(link.token) ?? (return #err("Cannot verify Kebapstack access. Sign in again or sign out to play publicly."));
        #ok("h:" # link.hub # ":" # pid)
      };
    }
  };
  public shared ({ caller }) func arcadeProfile() : async T.Reply<T.Pilot> {
    if (not allowed(caller, "profile")) return #err("Please wait a moment and try again.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    #ok(pilot(key, caller))
  };
  public shared ({ caller }) func arcadeSetName(name : Text) : async T.Reply<T.Pilot> {
    if (not allowed(caller, "name")) return #err("Please wait a moment and try again.");
    if (not Rules.validName(name)) return #err("Use 3–20 letters, numbers, spaces, dots, hyphens or underscores.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    let alias = name.toLower();
    switch (legacyAlias(alias)) { case (?pid) { if (key != "h:" # configuredHub() # ":" # pid) return #err("That callsign belongs to an existing Kebapstack player.") }; case null {} };
    switch (aliases.get(alias)) { case (?other) { if (other != key) return #err("That callsign is already taken.") }; case null {} };
    if (not profiles.containsKey(key) and profiles.size() >= Rules.maxProfiles) return #err("The crew registry is full. Please contact mission control.");
    switch (profiles.get(key)) { case (?old) { aliases.remove(old.name.toLower()) }; case null {} };
    profiles.add(key, { name }); aliases.add(alias, key);
    #ok(pilot(key, caller))
  };
  public shared ({ caller }) func arcadeLogin(ticket : Text) : async T.Reply<T.Pilot> {
    if (not allowed(caller, "login")) return #err("Please wait a moment and try again.");
    let id = configuredHub();
    if (id == "") return #err("Kebapstack is not configured.");
    if (ticket.size() < 16 or ticket.size() > 160) return #err("Invalid login ticket.");
    let expired = List.empty<Principal>();
    for ((p, link) in links.entries()) if (Time.now() >= link.expiresAt) expired.add(p);
    for (p in expired.values()) links.remove(p);
    if (links.size() >= Rules.maxProfiles) return #err("Sign-in capacity reached. Retry later.");
    counters.nextId += 1; let nonce = counters.nextId; pendingLogin.add(caller, nonce);
    try {
      let result = await login(ticket);
      if (pendingLogin.get(caller) != ?nonce or configuredHub() != id) {
        switch (result) { case (?r) endSession(r.token); case null {} };
        return #err("Sign-in was cancelled or replaced.");
      };
      pendingLogin.remove(caller);
      let r = result ?? (return #err("Kebapstack rejected the ticket. Start sign-in again from the Hub."));
      let pid = identify(r.token) ?? (return #err("Kebapstack access could not be verified."));
      switch (links.get(caller)) { case (?old) endSession(old.token); case null {} };
      links.add(caller, { token = r.token; suiteToken = r.suiteToken; hub = id; expiresAt = Time.now() + 36_000_000_000_000 });
      let key = "h:" # id # ":" # pid;
      let name = legacyName(pid);
      if (not profiles.containsKey(key) and Rules.validName(name) and not aliases.containsKey(name.toLower()) and profiles.size() < Rules.maxProfiles) {
        profiles.add(key, { name }); aliases.add(name.toLower(), key);
      };
      #ok(pilot(key, caller))
    } catch (_) { if (pendingLogin.get(caller) == ?nonce) pendingLogin.remove(caller); #err("Kebapstack could not be reached. Please retry sign-in.") }
  };
  public shared ({ caller }) func arcadeLogout() : async () {
    if (caller.isAnonymous()) return;
    switch (links.get(caller)) { case (?l) endSession(l.token); case null {} };
    links.remove(caller); pendingLogin.remove(caller)
  };
  // Prefix only storage keys: preserve pre-0.4 public results without changing stable types.
  func seasonKey(key : Text) : Text { "s2:" # key };
  public shared ({ caller }) func arcadeBegin() : async T.Reply<T.Run> {
    if (not allowed(caller, "flight")) return #err("Flight control is busy. You can still fly; ranking will be unavailable for this run.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    let now = Time.now();
    let expired = List.empty<Text>();
    for ((k, r) in runs.entries()) if (not k.startsWith(#text "s2:") or now > r.startedAt + Rules.runTtl) expired.add(k);
    for (k in expired.values()) runs.remove(k);
    if (not runs.containsKey(seasonKey(key)) and runs.size() >= Rules.maxRuns) return #err("Ranked flights are full. Try again later.");
    counters.nextId += 1;
    let run = { id = counters.nextId; day = (now / 86_400_000_000_000).toNat(); startedAt = now };
    runs.add(seasonKey(key), run); #ok(run)
  };
  public shared ({ caller }) func arcadeSubmit(s : T.Submission) : async T.Reply<T.Row> {
    if (not allowed(caller, "submit")) return #err("Please wait a moment and try again.");
    if (s.coins.size() > 4000 or s.version.size() > 40) return #err("Flight payload is too large.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    let pilot = profiles.get(key) ?? (return #err("Choose a callsign before publishing."));
    let run = runs.get(seasonKey(key)) ?? (return #err("This flight is missing or was already published."));
    switch (Rules.validate(run, s, Time.now())) { case (?e) return #err(e); case null {} };
    let row : T.Score = { owner = key; meters = s.meters; coins = s.coins.size(); score = Rules.points(s.meters, s.coins.size()); at = Time.now() };
    runs.remove(seasonKey(key));
    let previous = scores.get(seasonKey(key));
    if (row.score > (switch (previous) { case (?v) v.score; case null 0 }) or previous == null) scores.add(seasonKey(key), row);
    #ok({ name = pilot.name; meters = row.meters; coins = row.coins; score = row.score; at = row.at })
  };
  func arcadeBoard(archive : Bool) : [T.Row] {
    let rows = List.empty<T.Score>();
    for ((key, s) in scores.entries()) {
      if (key.startsWith(#text "s2:") != archive) rows.add(s);
    };
    rows.toArray().sort(func (a, b) = if (a.score == b.score) Int.compare(a.at, b.at) else Nat.compare(b.score, a.score)).sliceToArray(0, Nat.min(100, rows.size())).map(func s = {
      name = (profiles.get(s.owner) ?? ({ name = "Pilot" })).name; meters = s.meters; coins = s.coins; score = s.score; at = s.at
    })
  };
  public query func arcadeLeaderboard() : async [T.Row] { arcadeBoard(false) };
  public query func arcadeArchive() : async [T.Row] { arcadeBoard(true) };
  public shared ({ caller }) func arcadeRemove() : async T.Reply<Bool> {
    if (not allowed(caller, "remove")) return #err("Please wait a moment and try again.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    scores.remove(key); scores.remove(seasonKey(key)); #ok(true)
  };
}
