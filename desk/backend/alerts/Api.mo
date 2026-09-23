import T "Types";
import O "../oncall/Types";
import P "../oncall/Planning";
import R "../response/Types";
import Customers "../Customers";
import Hub "mo:kebab-hub";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Json "mo:json";

mixin (activeProject : Nat -> Bool, state : T.State, planning : O.State, response : R.State, authenticate : Text -> ?O.Actor,
  access : (O.Actor, O.Project) -> Bool, hash : Text -> Text, random : () -> async Text,
  open : (O.Project, Text, Text, Text, R.Input) -> O.Result, changed : (Nat, Text) -> ()) {
  func adminProject(tok : Text, id : Nat) : ?O.Actor {
    let user = authenticate(tok) ?? (return null);
    let p = planning.projects.get(id) ?? (return null);
    if (user.role != "admin" or not access(user, p)) return null;
    ?user
  };
  func view(s : T.Source) : T.SourceView = s;
  public query func oncallAlertSources(tok : Text, projectId : Nat) : async ?[T.SourceView] {
    ignore adminProject(tok, projectId) ?? (return null);
    ?state.sources.values().toArray().filter(func s = s.projectId == projectId).map(view)
  };
  func sourceRoom(projectId : Nat) : Bool = state.sources.size() < 300 and state.sources.values().toArray().filter(func s = s.projectId == projectId and s.revokedAt == 0).size() < 10;
  func retry(by : Text, key : Text) : ?T.Source = state.sources.values().toArray().find(func s = s.createdBy == by and s.requestKey == key);
  public func createOncallAlertSource(tok : Text, key : Text, input : T.Input) : async T.SecretResult {
    let user = adminProject(tok, input.projectId) ?? (return #err("Access denied"));
    if(not activeProject(input.projectId))return #err("Restore the archived project first");
    let p = planning.projects.get(input.projectId) ?? (return #err("Project unavailable"));
    if (not P.validKey(key) or input.name.trim(#char ' ').size() == 0 or input.name.size() > 60 or not p.services.contains(input.service) or input.days < 1 or input.days > 365) return #err("Choose a project service, a name up to 60 characters and 1–365 key days");
    switch (retry(user.id, key)) { case (?s) { if (s.projectId != input.projectId or s.name != input.name or s.service != input.service or s.expiresAt != s.createdAt + input.days * P.day) return #err("Creation identifier already used"); return #ok({ id = s.id; revision = s.revision; secret = "" }) }; case null {} };
    if (not sourceRoom(p.id)) return #err("Source limit reached. Revoke unused sources; removed metadata is retained for 90 days");
    let secret = try { await random() } catch (_) { return #err("Could not create a key. Retry.") };
    let current = adminProject(tok, p.id) ?? (return #err("Access changed"));
    if (current.id != user.id or not activeProject(p.id)) return #err("Access changed");
    // Revalidate all capacity/idempotency conditions after randomness yields.
    switch (retry(user.id, key)) { case (?s) { if (s.projectId != input.projectId or s.name != input.name or s.service != input.service or s.expiresAt != s.createdAt + input.days * P.day) return #err("Creation identifier already used"); return #ok({ id = s.id; revision = s.revision; secret = "" }) }; case null {} };
    if (not sourceRoom(p.id)) return #err("Source limit reached");
    let id = state.nextSource; state.nextSource += 1;
    state.sources.add(id, { id; projectId = p.id; name = input.name; service = input.service; revision = 1;
      requestKey = key; createdBy = user.id; createdAt = Time.now(); enabled = false; revokedAt = 0;
      hash = hash(secret); expiresAt = Time.now() + input.days * P.day; previousHash = ""; previousUntil = 0;
      testedAt = 0; receivedAt = 0; accepted = 0; rejected = 0; lastError = "" });
    #ok({ id; revision = 1; secret })
  };
  public func rotateOncallAlertKey(tok : Text, id : Nat, revision : Nat, days : Nat) : async T.SecretResult {
    let s = state.sources.get(id) ?? (return #err("Source unavailable"));
    let user = adminProject(tok, s.projectId) ?? (return #err("Access denied"));
    if (s.revokedAt > 0 or s.revision != revision or days < 1 or days > 365) return #err("Refresh the source and choose 1–365 days");
    let secret = try { await random() } catch (_) { return #err("Could not create a key. Retry.") };
    let current = adminProject(tok, s.projectId) ?? (return #err("Access changed"));
    let latest = state.sources.get(id) ?? (return #err("Source unavailable"));
    if (current.id != user.id or latest.revision != revision or latest.revokedAt > 0) return #err("Source changed. Refresh before rotating again.");
    state.sources.add(id, { latest with revision = revision + 1; hash = hash(secret); expiresAt = Time.now() + days * P.day;
      previousHash = latest.hash; previousUntil = Int.min(latest.expiresAt, Time.now() + 900_000_000_000) });
    #ok({ id; revision = revision + 1; secret })
  };
  public func setOncallAlertSource(tok : Text, id : Nat, revision : Nat, action : { #enable; #pause; #revoke }) : async O.Result {
    let s = state.sources.get(id) ?? (return #err(#missing));
    ignore adminProject(tok, s.projectId) ?? (return #err(#denied));
    if (s.revision != revision) return #err(#stale);
    if (s.revokedAt > 0) return #err(#invalid("This source is permanently revoked"));
    if (action == #enable) {
      if(not activeProject(s.projectId))return #err(#invalid("Restore the archived project first"));
      let p = response.policies.get(s.projectId) ?? (return #err(#invalid("Configure incident response first")));
      if (not p.enabled or s.testedAt == 0 or s.expiresAt <= Time.now()) return #err(#invalid("Enable incident response, test the connection and check key expiry first"));
    };
    state.sources.add(id, { s with revision = revision + 1; enabled = action == #enable;
      revokedAt = if (action == #revoke) Time.now() else 0;
      hash = if (action == #revoke) "" else s.hash; previousHash = if (action == #revoke) "" else s.previousHash;
      previousUntil = if (action == #revoke) 0 else s.previousUntil });
    #ok({ id; revision = revision + 1 })
  };
  func alertMonitoring(id : Nat) : ?T.Monitoring {
    let i = response.incidents.get(id) ?? (return null);
    if (Time.now() >= (if (i.resolvedAt > 0) i.resolvedAt + i.retentionDays * P.day else i.openedAt + 365 * P.day)) return null;
    let signal = state.signals.values().toArray().find(func s = s.incidentId == id) ?? (return null);
    let source = state.sources.get(signal.sourceId);
    ?{ sourceName = switch source { case (?s) s.name; case null "Removed source" }; condition = signal.condition; occurredAt = signal.occurredAt; receivedAt = signal.receivedAt }
  };
  func reply(code : Nat16, outcome : Text, id : Nat) : T.Response = {
    status_code = code; upgrade = null;
    headers = [("Content-Type", "application/json; charset=utf-8"), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer")];
    body = Text.encodeUtf8(Json.stringify(Json.obj([("outcome", #string(outcome)), ("incidentId", if (id == 0) #null_ else #string(id.toText()))]), null))
  };
  func header(req : T.Request, name : Text) : Text {
    let matches = req.headers.filter(func(k, _) = k.toLower() == name);
    if (matches.size() == 1) matches[0].1 else ""
  };
  func str(j : Json.Json, key : Text) : Text = switch (Json.getAsText(j, key)) { case (#ok(v)) v; case _ "" };
  func digits(t : Text) : Bool = t.size() > 0 and t.size() <= 16 and t.chars().toArray().all(func c = c >= '0' and c <= '9');
  func rate(id : Nat, max : Nat) : Bool {
    let b = state.rates.get(id) ?? ({ at = Time.now(); count = 0 });
    let current = if (Time.now() - b.at >= 60_000_000_000) ({ at = Time.now(); count = 0 }) else b;
    if (current.count >= max) return false;
    state.rates.add(id, { current with count = current.count + 1 });true
  };
  func alertHttp(req : T.Request) : T.Response {
    if (req.url.size() > 200 or req.headers.size() > 40 or req.body.size() > 8_000 or req.headers.any(func(k, v) = k.size() + v.size() > 1000)) return reply(413, "Request too large", 0);
    if (req.method != "POST") return reply(405, "Use POST", 0);
    let parts = req.url.split(#char '/').toArray();
    if (parts.size() != 6 or parts[1] != "oncall" or parts[2] != "v1" or parts[3] != "sources" or (parts[5] != "test" and parts[5] != "events")) return reply(404, "Endpoint not found", 0);
    // No CORS or browser embeds. Origin is not a substitute for bearer authentication.
    if (req.headers.any(func(k, _) = k.toLower() == "origin")) return reply(403, "Use a server-side integration", 0);
    let s = state.sources.get(Nat.fromText(parts[4]) ?? 0) ?? (return reply(401, "Invalid or expired source key", 0));
    let bearer = header(req, "authorization").stripStart(#text "Bearer ") ?? "";
    if (not Customers.token(bearer) or s.revokedAt > 0) return reply(401, "Invalid or expired source key", 0);
    let digest = hash(bearer);
    if (not ((s.expiresAt > Time.now() and s.hash == digest) or (s.previousUntil > Time.now() and s.previousHash == digest))) return reply(401, "Invalid or expired source key", 0);
    func fail(code : Nat16, reason : Text) : T.Response {
      state.sources.add(s.id, { s with rejected = s.rejected + 1; lastError = reason });reply(code, reason, 0)
    };
    if (not rate(s.id, 60) or not rate(0, 600)) return fail(429, "Rate limit. Retry after 60 seconds with the same event");
    if ((header(req, "content-type").split(#char ';').next() ?? "").trim(#char ' ').toLower() != "application/json") return fail(415, "Use Content-Type: application/json");
    let raw = Text.decodeUtf8(req.body) ?? (return fail(400, "Invalid UTF-8"));
    if (not Customers.shallow(raw)) return fail(400, "Invalid JSON");
    let j = switch (Json.parse(Hub.sanitizeSurrogates(raw))) { case (#ok(v)) v; case _ return fail(400, "Invalid JSON") };
    let entries = switch j { case (#object_(xs)) xs; case _ return fail(400, "Expected an object") };
    if (parts[5] == "test") {
      if (entries.size() != 0) return fail(400, "The test body must be an empty object");
      state.sources.add(s.id, { s with testedAt = Time.now(); lastError = "" });
      return reply(200, "Connection verified. No incident or notification was created", 0)
    };
    if (not s.enabled) return fail(409, "Source paused. Resume it in Desk before retrying");
    let keys = ["alertId", "sequence", "occurredAt", "state", "title", "detail", "severity"];
    if (entries.size() != 7 or keys.any(func k = entries.filter(func(name, _) = name == k).size() != 1)) return fail(400, "Expected exactly alertId, sequence, occurredAt, state, title, detail and severity");
    if (entries.any(func(_, v) = switch v { case (#string(_)) false; case _ true })) return fail(400, "All event fields must be strings");
    let alertId = str(j, "alertId");let sequenceText = str(j, "sequence");let atText = str(j, "occurredAt");
    let condition = str(j, "state");let title = str(j, "title");let detail = str(j, "detail");let severity = str(j, "severity");
    if (alertId.size() == 0 or alertId.size() > 128 or alertId.chars().toArray().any(func c = not ((c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '-' or c == '_' or c == '.' or c == ':'))) return fail(400, "alertId must be a non-personal occurrence identifier of 1–128 ASCII letters, numbers, dot, dash, colon or underscore");
    if (not digits(sequenceText) or not digits(atText)) return fail(400, "sequence and occurredAt must be positive decimal strings");
    let sequence = Nat.fromText(sequenceText) ?? 0;let at : Int = (Nat.fromText(atText) ?? 0) * 1_000_000;
    if (sequence == 0 or sequence > 9_007_199_254_740_991 or at <= 0 or at < Time.now() - P.day or at > Time.now() + 300_000_000_000) return fail(400, "Use a positive sequence and an event timestamp within 24 hours past / 5 minutes future");
    if ((condition != "firing" and condition != "recovered") or title.trim(#char ' ').size() < 3 or title.size() > 160 or detail.size() > 2000 or not ["minor", "major", "critical"].contains(severity)) return fail(400, "Invalid state, title, detail or severity");
    let fingerprint = hash(Json.stringify(#array(keys.map(func k = #string(str(j, k)))), null));
    let correlation = s.id.toText() # ":" # hash(alertId);
    let prior = state.signals.get(correlation);
    func accepted(outcome : Text, id : Nat, code : Nat16) : T.Response {
      state.sources.add(s.id, { s with receivedAt = Time.now(); accepted = s.accepted + 1; lastError = "" });reply(code, outcome, id)
    };
    switch prior {
      case (?old) {
        if (sequence < old.sequence) return accepted("Ignored older sequence", old.incidentId, 200);
        if (sequence == old.sequence) {
          if (old.payloadHash != fingerprint) return fail(409, "Sequence already used with different content");
          return accepted("Duplicate accepted; no new incident", old.incidentId, 200)
        };
        if (at < old.occurredAt) return fail(409, "Event time must not move backwards");
        let incident = response.incidents.get(old.incidentId);
        let live = switch incident { case (?i) i.status != #resolved and Time.now() < i.openedAt + 365 * P.day; case null false };
        // A recovered-first occurrence or human-resolved/erased incident never
        // reopens from monitoring. Only a new occurrence ID can start a response.
        state.signals.add(correlation, { old with sequence; payloadHash = fingerprint; condition; occurredAt = at; receivedAt = Time.now(); transitions = old.transitions + (if (old.condition != condition) 1 else 0) });
        if (live and old.condition != condition and old.transitions < 20) changed(old.incidentId, condition);
        return accepted(if (live) "Monitoring updated; response ownership unchanged" else "Occurrence closed; no new incident", old.incidentId, 200)
      };
      case null {};
    };
    if (state.signals.size() >= 20_000 or state.signals.values().toArray().filter(func x = x.sourceId == s.id).size() >= 2000) return fail(429, "Occurrence history full. Existing responses continue; contact the Desk administrator");
    var incidentId = 0;
    if (condition == "firing") {
      let p = planning.projects.get(s.projectId) ?? (return fail(503, "Project unavailable"));
      let input : R.Input = { projectId = s.projectId; service = s.service; title; detail; severity = if (severity == "critical") #critical else if (severity == "minor") #minor else #major };
      switch (open(p, "source:" # s.id.toText(), s.name, correlation, input)) {
        case (#ok(result)) incidentId := result.id;
        case (#err(#limit(_))) return fail(429, "Incident history full. Existing responses continue");
        case (#err(_)) return fail(503, "Incident response unavailable or paused. Check project response settings");
      }
    };
    state.signals.add(correlation, { sourceId = s.id; incidentId; sequence; payloadHash = fingerprint; condition; occurredAt = at; receivedAt = Time.now(); expiresAt = Time.now() + 731 * P.day; transitions = 0 });
    accepted(if (incidentId == 0) "Recovery recorded before trigger; no incident created" else "Incident created", incidentId, if (incidentId == 0) 200 else 202)
  };
  func sweepAlerts() {
    // Tombstones outlive the maximum incident lifetime; timestamps additionally
    // reject all exact event replays older than 24 hours, even after cleanup.
    var removed = 0;
    for ((key, s) in state.signals.entries().toArray().values()) if (removed < 100 and s.expiresAt <= Time.now()) { state.signals.remove(key);removed += 1 };
    for ((id, s) in state.sources.entries().toArray().values()) {
      if (s.revokedAt > 0 and s.revokedAt + 90 * P.day <= Time.now()) { state.sources.remove(id);state.rates.remove(id) }
      else if (s.previousHash != "" and s.previousUntil <= Time.now()) state.sources.add(id, { s with previousHash = ""; previousUntil = 0 })
    }
  };
}
