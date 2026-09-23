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

mixin (profiles : T.Profiles, aliases : Map.Map<Text, Text>, links : T.Links, runs : T.Runs, scores : T.Scores, counters : T.Counters, publicOwners : Map.Map<Principal, Text>,
  configuredHub : () -> Text, identify : Text -> ?Text, login : Text -> async ?T.Login,
  endSession : Text -> (), legacyPilot : Text -> ?Text, legacyName : Text -> Text, legacyAlias : Text -> ?Text) {
  // A bounded retry cache; public bests remain in the existing persistent scores map.
  transient let receipts = Map.empty<Text, { submission : T.Submission; result : T.Publication }>();
  transient let lastCalls = Map.empty<Text, Int>();
  transient let pendingLogin = Map.empty<Principal, Nat>();
  transient var budgetAt : Int = 0;
  transient var budgetUsed : Nat = 0;
  func pilot(key : Text, caller : Principal) : T.Pilot {
    let link = links.get(caller);
    let active = switch (link) {
      case (?l) l.hub == configuredHub() and Time.now() < l.expiresAt and identify(l.token) != null;
      case null false;
    };
    { name = (profiles.get(key) ?? ({ name = "" })).name; hub = active;
      hubId = configuredHub(); suiteToken = switch (link) { case (?l) { if (active) l.suiteToken else "" }; case null "" } }
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
    // A public arcade profile is a browser-bound identity, not a Hub capability.
    // Keep the verified association after expiry/outage so names, in-flight
    // tickets and bests remain owned by the same player in both modes.
    switch (publicOwners.get(caller)) { case (?key) return #ok(key); case null {} };
    switch (links.get(caller)) {
      case (?link) {
        if (link.hub == configuredHub() and publicOwners.size() < Rules.maxProfiles) {
          switch (legacyPilot(link.token)) {
            case (?pid) {
              let key = "h:" # link.hub # ":" # pid;
              publicOwners.add(caller, key); return #ok(key);
            };
            case null {};
          };
        };
        // An old, already-pruned session cannot prove a Hub profile. Restore
        // this browser's own guest instead; do not block public play or take a name.
        endSession(link.token); links.remove(caller);
      };
      case null {};
    };
    #ok("g:" # caller.toText())
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
    if ((not publicOwners.containsKey(caller) and publicOwners.size() >= Rules.maxProfiles) or links.size() >= Rules.maxProfiles) return #err("Sign-in capacity reached. Retry later.");
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
      if (not publicOwners.containsKey(caller) and publicOwners.size() >= Rules.maxProfiles) {
        endSession(r.token); return #err("Player capacity reached. Public guest play is still available.");
      };
      switch (links.get(caller)) { case (?old) endSession(old.token); case null {} };
      links.add(caller, { token = r.token; suiteToken = r.suiteToken; hub = id; expiresAt = Time.now() + 36_000_000_000_000 });
      let key = "h:" # id # ":" # pid;
      publicOwners.add(caller, key);
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
    links.remove(caller); publicOwners.remove(caller); pendingLogin.remove(caller)
  };
  // Prefix only storage keys: preserve pre-0.4 public results without changing stable types.
  func modePrefix(mode : T.Mode) : Text { switch mode { case (#twoD) "2d:s1:"; case (#threeD) "s2:" } };
  func seasonKey(key : Text, mode : T.Mode) : Text { modePrefix(mode) # key };
  func beginMode(caller : Principal, mode : T.Mode) : T.Reply<T.Run> {
    if (not allowed(caller, "flight")) return #err("Flight control is busy. You can still fly; ranking will be unavailable for this run.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    let now = Time.now();
    let expired = List.empty<Text>();
    for ((k, r) in runs.entries()) if ((not k.startsWith(#text "s2:") and not k.startsWith(#text "2d:s1:")) or now > r.startedAt + Rules.runTtl) expired.add(k);
    for (k in expired.values()) runs.remove(k);
    if (not runs.containsKey(seasonKey(key, mode)) and runs.size() >= Rules.maxRuns) return #err("Ranked flights are full. Try again later.");
    counters.nextId += 1;
    let run = { id = counters.nextId; day = (now / 86_400_000_000_000).toNat(); startedAt = now };
    runs.add(seasonKey(key, mode), run); #ok(run)
  };
  func submitMode(caller : Principal, mode : T.Mode, s : T.Submission, retry : Bool) : T.Reply<T.Publication> {
    if (not allowed(caller, "submit")) return #err("Please wait a moment and try again.");
    if (s.coins.size() > 4000 or s.version.size() > 40) return #err("Flight payload is too large.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    let pilot = profiles.get(key) ?? (return #err("Choose a callsign before publishing."));
    let storageKey = seasonKey(key, mode);
    if (retry and scores.containsKey(storageKey)) switch (receipts.get(storageKey)) {
      case (?saved) {
        let current = scores.get(storageKey) ?? (return #err("This score was removed. Start a new flight."));
        if (saved.submission == s and current.at == saved.result.best.at and current.score == saved.result.best.score and Time.now() < saved.result.flight.at + Rules.runTtl) {
          return #ok({ saved.result with flight = { saved.result.flight with name = pilot.name }; best = { saved.result.best with name = pilot.name } });
        }
      };
      case null {};
    };
    let run = runs.get(seasonKey(key, mode)) ?? (return #err("This flight is missing or was already published."));
    switch (Rules.validate(run, s, Time.now())) { case (?e) return #err(e); case null {} };
    let row : T.Score = { owner = key; meters = s.meters; coins = s.coins.size(); score = Rules.points(s.meters, s.coins.size()); at = Time.now() };
    runs.remove(seasonKey(key, mode));
    let previous = scores.get(storageKey);
    let improved = switch previous { case (?v) row.score > v.score; case null true };
    if (improved) scores.add(storageKey, row);
    let best = scores.get(storageKey) ?? row;
    func publicRow(value : T.Score) : T.Row { { name = pilot.name; meters = value.meters; coins = value.coins; score = value.score; at = value.at } };
    let result = { flight = publicRow(row); best = publicRow(best); improved; mode };
    if (retry) {
      if (receipts.size() >= 512 and not receipts.containsKey(storageKey)) {
        var oldestKey = ""; var oldestAt = Time.now();
        for ((k, v) in receipts.entries()) if (v.result.flight.at <= oldestAt) { oldestKey := k; oldestAt := v.result.flight.at };
        receipts.remove(oldestKey);
      };
      receipts.add(storageKey, { submission = s; result });
    };
    #ok(result)
  };
  func legacySubmit(caller : Principal, mode : T.Mode, s : T.Submission) : T.Reply<T.Row> {
    switch (submitMode(caller, mode, s, false)) { case (#ok r) #ok(r.flight); case (#err e) #err(e) }
  };

  func arcadeBoard(mode : T.Mode, archive : Bool) : [T.Row] {
    let rows = List.empty<T.Score>();
    for ((key, s) in scores.entries()) {
      let matches = if (archive) not key.startsWith(#text "s2:") and not key.startsWith(#text "2d:s1:")
        else key.startsWith(#text (modePrefix(mode)));
      if (matches) rows.add(s);
    };
    rows.toArray().sort(func (a, b) = if (a.score == b.score) Int.compare(a.at, b.at) else Nat.compare(b.score, a.score)).sliceToArray(0, Nat.min(100, rows.size())).map(func s = {
      name = (profiles.get(s.owner) ?? ({ name = "Pilot" })).name; meters = s.meters; coins = s.coins; score = s.score; at = s.at
    })
  };
  // Legacy public methods stay bound to 3D. New methods bind ticket and storage
  // keys to a closed mode variant; a 2D ticket cannot publish into the 3D board.
  public shared ({ caller }) func arcadeBegin() : async T.Reply<T.Run> { beginMode(caller, #threeD) };
  public shared ({ caller }) func arcadeBeginMode(mode : T.Mode) : async T.Reply<T.Run> { beginMode(caller, mode) };
  public shared ({ caller }) func arcadeSubmit(s : T.Submission) : async T.Reply<T.Row> { legacySubmit(caller, #threeD, s) };
  public shared ({ caller }) func arcadeSubmitMode(mode : T.Mode, s : T.Submission) : async T.Reply<T.Row> { legacySubmit(caller, mode, s) };
  public shared ({ caller }) func arcadePublish(mode : T.Mode, s : T.Submission) : async T.Reply<T.Publication> { submitMode(caller, mode, s, true) };
  public query func arcadeLeaderboard() : async [T.Row] { arcadeBoard(#threeD, false) };
  public query func arcadeLeaderboardMode(mode : T.Mode) : async [T.Row] { arcadeBoard(mode, false) };
  public query func arcadeArchive() : async [T.Row] { arcadeBoard(#threeD, true) };
  func removeMode(caller : Principal, mode : T.Mode) : T.Reply<Bool> {
    if (not allowed(caller, "remove")) return #err("Please wait a moment and try again.");
    let key = switch (arcadeOwner(caller)) { case (#ok k) k; case (#err e) return #err(e) };
    if (mode == #threeD) scores.remove(key);
    scores.remove(seasonKey(key, mode)); receipts.remove(seasonKey(key, mode)); #ok(true)
  };
  public shared ({ caller }) func arcadeRemove() : async T.Reply<Bool> { removeMode(caller, #threeD) };
  public shared ({ caller }) func arcadeRemoveMode(mode : T.Mode) : async T.Reply<Bool> { removeMode(caller, mode) };
}
