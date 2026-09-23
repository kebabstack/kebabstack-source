import T "Types";
import A "../alerts/Types";
import O "../oncall/Types";
import Planning "../oncall/Planning";
import Calendar "../oncall/Calendar";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Time "mo:core/Time";

// Persistent state is supplied by the host. No local accounts or permission grants.
mixin (state : T.State, planning : O.State, calendar : Calendar.State, authenticate : Text -> ?O.Actor,
  access : (O.Actor, O.Project) -> Bool, eligible : (O.Project, Text) -> Bool,
  roster : O.Project -> [O.Person], fresh : () -> Bool, ready : () -> Bool,
  send : (Nat, Nat, Text, Text) -> async { ok : Bool; detail : Text }, monitoring : Nat -> ?A.Monitoring, workVoided : Nat -> ()) {
  func projectFor(tok : Text, id : Nat) : ?(O.Actor, O.Project) {
    let user = authenticate(tok) ?? (return null);
    let project = planning.projects.get(id) ?? (return null);
    if (not access(user, project)) return null;
    ?(user, project)
  };
  func expired(i : T.Incident) : Bool = Time.now() >= (if (i.resolvedAt > 0) i.resolvedAt + i.retentionDays * Planning.day else i.openedAt + 365 * Planning.day);
  func read(tok : Text, id : Nat) : ?(O.Actor, O.Project, T.Incident) {
    let i = state.incidents.get(id) ?? (return null);
    if (expired(i)) return null;
    let (user, p) = projectFor(tok, i.projectId) ?? (return null);
    ?(user, p, i)
  };
  func person(p : O.Project, id : Text) : Text = (roster(p).find(func x = x.id == id) ?? ({ id; name = "Former responder" })).name;
  func event(i : Nat, by : Text, name : Text, kind : Text, text : Text) {
    let prior = state.events.get(i) ?? [];
    if (prior.size() < 220) state.events.add(i, prior.concat([{ at = Time.now(); by; name; kind; text }]))
  };
  func cancelPending(id : Nat) {
    for ((key, d) in state.deliveries.entries().toArray().values()) if (d.incidentId == id and d.status == #pending) state.deliveries.add(key, { d with status = #cancelled; detail = "Response already accepted or closed" });
  };
  func covering(projectId : Nat) : ?O.Plan = planning.plans.values().toArray().find(func p = p.input.projectId == projectId and p.publication != null and p.input.startAt <= Time.now() and Calendar.end(calendar,p) > Time.now());
  func target(i : T.Incident, p : O.Project) : Text {
    if (i.stage >= i.stageCount) return if (eligible(p, i.fallback) and not Calendar.unavailable(calendar,p.id,i.fallback,Time.now(),Time.now()+1)) i.fallback else "";
    let plan = covering(p.id) ?? (return "");
    let swaps = planning.swaps.get(plan.id) ?? [];
    for (shift in Calendar.segments(calendar,plan,swaps).values()) {
      if (shift.layer == i.stage and shift.startAt <= Time.now() and shift.endAt > Time.now() and eligible(p,shift.personId) and not Calendar.unavailable(calendar,p.id,shift.personId,Time.now(),Time.now()+1)) return shift.personId
    };
    ""
  };
  func route(i : T.Incident, p : O.Project) {
    if (state.deliveries.size() >= 5000 or state.deliveries.values().toArray().filter(func d = d.incidentId == i.id).size() >= 100) {
      state.incidents.add(i.id, { i with nextEscalation = 0; routeIssue = "Notification history limit reached. Manual response required." });return
    };
    let id = target(i, p);
    if (id == "") {
      state.incidents.add(i.id, { i with routeIssue = if (i.stage >= i.stageCount) "Fallback is unavailable. Manual response required." else "No eligible responder in this coverage layer."; nextEscalation = if (i.stage < i.stageCount) Time.now() else 0 });
      event(i.id, "", "Desk", "coverage", "No eligible recipient for response stage " # (i.stage + 1).toText());
      return
    };
    let did = state.nextDelivery; state.nextDelivery += 1;
    state.deliveries.add(did, { id = did; incidentId = i.id; stage = i.stage; purpose = #response; recipient = id; name = person(p, id); status = #pending; attempts = 0; nextAttempt = Time.now(); leaseUntil = 0; acceptedAt = 0; detail = "Waiting for Hub" });
    state.incidents.add(i.id, { i with routeIssue = ""; nextEscalation = Time.now() + i.ackMinutes * 60_000_000_000 });
    event(i.id, "", "Desk", "routed", "Response stage " # (i.stage + 1).toText() # " requested from " # person(p, id));
  };
  public query func oncallResponse(tok : Text, projectId : Nat) : async ?T.Overview {
    let (user, _) = projectFor(tok, projectId) ?? (return null);
    ?{ policy = state.policies.get(projectId); canManage = user.role == "admin"; deliveryReady = ready();
      incidents = state.incidents.values().toArray().filter(func i = i.projectId == projectId and not expired(i)).sort(func(a, b) = Int.compare(b.updatedAt, a.updatedAt)) }
  };
  public func setOncallResponse(tok : Text, projectId : Nat, revision : Nat, input : T.PolicyInput) : async O.Result {
    let (user, p) = projectFor(tok, projectId) ?? (return #err(#denied));
    if (user.role != "admin") return #err(#denied);
    let old = state.policies.get(projectId);
    if ((switch old { case (?x) x.revision; case null 0 }) != revision) return #err(#stale);
    if (input.ackMinutes < 1 or input.ackMinutes > 60 or input.retentionDays < 30 or input.retentionDays > 365) return #err(#invalid("Choose 1–60 minutes and 30–365 retention days"));
    if (not eligible(p, input.fallback)) return #err(#invalid("Choose an eligible fallback responder"));
    if(input.enabled and not Calendar.active(calendar,projectId))return #err(#invalid("Restore the archived project first"));
    if (input.enabled and not ready()) return #err(#invalid("Configure the canonical Desk HTTPS URL and Hub connection first"));
    state.policies.add(projectId, { input with projectId; revision = revision + 1; by = user.id; at = Time.now() });
    #ok({ id = projectId; revision = revision + 1 })
  };
  public func openOncallIncident(tok : Text, key : Text, input : T.Input) : async O.Result {
    let (user, p) = projectFor(tok, input.projectId) ?? (return #err(#denied));
    if (not Planning.validKey(key)) return #err(#invalid("Invalid request identifier"));
    for (i in state.incidents.values()) if (i.openedBy == user.id and i.requestKey == key) {
      let original : T.Input = i;
      if (original != input or expired(i)) return #err(#stale);
      return #ok({ id = i.id; revision = i.revision })
    };
    createResponseIncident(p, user.id, person(p, user.id), key, input)
  };
  // Only composition-root code can call this synchronous helper. HTTP intake
  // authenticates its source before reaching the same validation/queue path.
  func createResponseIncident(p : O.Project, by : Text, name : Text, key : Text, input : T.Input) : O.Result {
    if(not Calendar.active(calendar,p.id))return #err(#invalid("Project archived"));
    let policy = state.policies.get(p.id) ?? (return #err(#invalid("Set up incident response for this project first")));
    if (not policy.enabled) return #err(#invalid("New incident response is paused for this project"));
    if (not p.services.contains(input.service) or input.title.trim(#char ' ').size() < 3 or input.title.size() > 160 or input.detail.size() > 2000) return #err(#invalid("Choose a project service, a title of 3–160 characters and details up to 2000 characters"));
    if (state.incidents.size() >= 1000 or state.incidents.values().toArray().filter(func i = i.projectId == p.id).size() >= 200) return #err(#limit("Incident history is full. Existing records remain available until retention removes them"));
    let id = state.nextIncident; state.nextIncident += 1;
    let i : T.Incident = { input with id; revision = 1; requestKey = key; openedBy = by; openedAt = Time.now(); updatedAt = Time.now(); status = #open; owner = ""; ownerName = ""; acknowledgedAt = 0; resolvedAt = 0; resolution = ""; stage = 0; stageCount = (switch (covering(p.id)) { case (?plan) plan.input.layers.size(); case null 0 }); nextEscalation = 0; ackMinutes = policy.ackMinutes; fallback = policy.fallback; retentionDays = policy.retentionDays; routeIssue = "" };
    state.incidents.add(id, i);event(id, by, name, "opened", input.detail);route(i, p);
    #ok({ id; revision = 1 })
  };
  func responseMonitoringEvent(id : Nat, condition : Text) {
    let i = state.incidents.get(id) ?? (return);
    if (expired(i)) return;
    event(id, "", "Monitoring", "monitoring_" # condition, if (condition == "recovered") "The source reports recovery. The response team must verify and resolve the incident." else "The source reports that the condition is firing again. Existing ownership and escalation remain unchanged.");
    state.incidents.add(id, { i with revision = i.revision + 1; updatedAt = Time.now() });
  };
  public query func oncallIncident(tok : Text, id : Nat) : async ?T.View {
    let (_, _, i) = read(tok, id) ?? (return null);
    ?{ incident = i; monitoring = monitoring(id); events = state.events.get(id) ?? []; deliveries = state.deliveries.values().toArray().filter(func d = d.incidentId == id); handoff = state.handoffs.get(id); work = state.work.values().toArray().filter(func w = w.incidentId == id) }
  };
  public func acknowledgeOncallIncident(tok : Text, id : Nat, revision : Nat) : async O.Result {
    let (user, p, i) = read(tok, id) ?? (return #err(#denied));
    if (i.revision != revision) return #err(#stale);
    if (i.status != #open) return #err(#invalid("This incident already has an owner or is resolved"));
    state.incidents.add(id, { i with status = #acknowledged; owner = user.id; ownerName = person(p, user.id); acknowledgedAt = Time.now(); nextEscalation = 0; updatedAt = Time.now(); revision = revision + 1; routeIssue = "" });
    cancelPending(id);event(id, user.id, person(p, user.id), "acknowledged", "Accepted responsibility");
    #ok({ id; revision = revision + 1 })
  };
  public func resolveOncallIncident(tok : Text, id : Nat, revision : Nat, resolution : Text) : async O.Result {
    let (user, p, i) = read(tok, id) ?? (return #err(#denied));
    if (i.revision != revision) return #err(#stale);
    if (i.owner != user.id and user.role != "admin") return #err(#denied);
    if (i.status != #acknowledged or resolution.trim(#char ' ').size() < 3 or resolution.size() > 2000) return #err(#invalid("Accept responsibility first, then record the verified outcome"));
    state.incidents.add(id, { i with status = #resolved; resolvedAt = Time.now(); resolution; nextEscalation = 0; updatedAt = Time.now(); revision = revision + 1 });
    switch (state.handoffs.get(id)) { case (?h) { if (h.status == #pending) state.handoffs.add(id, { h with status = #cancelled; decidedAt = Time.now() }) }; case null {} };
    cancelPending(id);event(id, user.id, person(p, user.id), "resolved", resolution);
    #ok({ id; revision = revision + 1 })
  };
  public func noteOncallIncident(tok : Text, id : Nat, revision : Nat, text : Text) : async O.Result {
    let (user, p, i) = read(tok, id) ?? (return #err(#denied));
    if (i.revision != revision) return #err(#stale);
    if (text.trim(#char ' ').size() == 0 or text.size() > 2000 or (state.events.get(id) ?? []).size() >= 180) return #err(#invalid("Add a note up to 2000 characters; timeline limit is 180 user events"));
    state.incidents.add(id, { i with updatedAt = Time.now(); revision = revision + 1 });event(id, user.id, person(p, user.id), "note", text);
    #ok({ id; revision = revision + 1 })
  };
  public func handoffOncallIncident(tok : Text, id : Nat, revision : Nat, to : Text, summary : Text) : async O.Result {
    let (user, p, i) = read(tok, id) ?? (return #err(#denied));
    if (i.revision != revision) return #err(#stale);
    if (i.owner != user.id and user.role != "admin") return #err(#denied);
    if (state.deliveries.size() >= 5000 or state.deliveries.values().toArray().filter(func d = d.incidentId == id).size() >= 100) return #err(#limit("Notification history limit reached"));
    if (i.status != #acknowledged or to == i.owner or not eligible(p, to) or summary.trim(#char ' ').size() == 0 or summary.size() > 2000 or (state.events.get(id) ?? []).size() >= 180) return #err(#invalid("Choose another eligible responder and explain what remains to do"));
    switch (state.handoffs.get(id)) { case (?h) { if (h.status == #pending) return #err(#invalid("A handoff is already awaiting acceptance")) }; case null {} };
    let did = state.nextDelivery;state.nextDelivery += 1;
    state.deliveries.add(did, { id = did; incidentId = id; stage = i.stage; purpose = #handoff; recipient = to; name = person(p, to); status = #pending; attempts = 0; nextAttempt = Time.now(); leaseUntil = 0; acceptedAt = 0; detail = "Waiting for Hub" });
    state.handoffs.add(id, { from = i.owner; to; toName = person(p, to); summary; at = Time.now(); status = #pending; decidedAt = 0 });
    state.incidents.add(id, { i with updatedAt = Time.now(); revision = revision + 1 });
    event(id, user.id, person(p, user.id), "handoff_requested", "To " # person(p, to) # ": " # summary);
    #ok({ id; revision = revision + 1 })
  };
  public func decideOncallHandoff(tok : Text, id : Nat, revision : Nat, decision : { #accept; #decline; #cancel }) : async O.Result {
    let (user, p, i) = read(tok, id) ?? (return #err(#denied));
    if (i.revision != revision) return #err(#stale);
    let h = state.handoffs.get(id) ?? (return #err(#missing));
    if (h.status != #pending or i.status != #acknowledged or i.owner != h.from) return #err(#invalid("This handoff is no longer pending"));
    let next = switch decision {
      case (#cancel) { if (user.id != h.from and user.role != "admin") return #err(#denied); #cancelled };
      case (#decline) { if (user.id != h.to) return #err(#denied); #declined };
      case (#accept) { if (user.id != h.to or not eligible(p, user.id)) return #err(#denied); #accepted }
    };
    cancelPending(id);
    state.handoffs.add(id, { h with status = next; decidedAt = Time.now() });
    state.incidents.add(id, { i with owner = if (next == #accepted) user.id else i.owner; ownerName = if (next == #accepted) person(p, user.id) else i.ownerName; updatedAt = Time.now(); revision = revision + 1 });
    event(id, user.id, person(p, user.id), "handoff_decided", if (next == #accepted) "Accepted responsibility from " # i.ownerName else if (next == #declined) "Declined handoff; original owner remains responsible" else "Cancelled handoff");
    #ok({ id; revision = revision + 1 })
  };
  public func recordOncallWork(tok : Text, id : Nat, key : Text, input : T.WorkInput) : async O.Result {
    let (user, p, i) = read(tok, id) ?? (return #err(#denied));
    if (not Planning.validKey(key)) return #err(#invalid("Invalid request identifier"));
    for (w in state.work.values()) if (w.personId == user.id and w.requestKey == key) {
      let original : T.WorkInput = w;
      if (w.incidentId != id or original != input or w.voidedAt > 0) return #err(#stale);
      return #ok({ id = w.id; revision = i.revision })
    };
    if (input.startAt < i.openedAt or input.endAt > Time.now() or input.endAt <= input.startAt or input.endAt - input.startAt > Planning.day or input.breakMinutes * 60_000_000_000 >= input.endAt - input.startAt or input.note.trim(#char ' ').size() == 0 or input.note.size() > 500) return #err(#invalid("Record actual work after incident creation, up to 24 hours per entry, with valid breaks and a short description"));
    if (state.work.size() >= 5000 or state.work.values().toArray().filter(func w = w.incidentId == id).size() >= 100) return #err(#limit("Work record limit reached"));
    for (w in state.work.values()) if (w.personId == user.id and w.voidedAt == 0 and input.startAt < w.endAt and w.startAt < input.endAt) return #err(#invalid("This overlaps another work record of yours. Correct that record first"));
    let wid = state.nextWork; state.nextWork += 1;
    state.work.add(wid, { input with id = wid; incidentId = id; projectId = p.id; personId = user.id; name = person(p, user.id); at = Time.now(); requestKey = key; voidedAt = 0; voidReason = "" });
    state.incidents.add(id, { i with updatedAt = Time.now(); revision = i.revision + 1 });
    #ok({ id = wid; revision = i.revision + 1 })
  };
  public func voidOncallWork(tok : Text, id : Nat, reason : Text) : async O.Result {
    let w = state.work.get(id) ?? (return #err(#missing));
    let (user, _, i) = read(tok, w.incidentId) ?? (return #err(#denied));
    if (user.id != w.personId) return #err(#denied);
    if (reason.trim(#char ' ').size() == 0 or reason.size() > 500) return #err(#invalid("Explain the correction"));
    if (w.voidedAt > 0) return #err(#stale);
    state.work.add(id, { w with voidedAt = Time.now(); voidReason = reason });
    workVoided(id);
    state.incidents.add(i.id, { i with updatedAt = Time.now(); revision = i.revision + 1 });
    #ok({ id; revision = i.revision + 1 })
  };
  func sweepResponse() : async () {
    // Work and payload retention follow each incident's policy snapshot. IDs are
    // monotonic and never reused. No public payroll or incident download exists.
    var removed = 0;
    for ((id, i) in state.incidents.entries().toArray().values()) if (removed < 10 and expired(i)) {
      state.incidents.remove(id);state.events.remove(id);state.handoffs.remove(id);
      for ((did, d) in state.deliveries.entries().toArray().values()) if (d.incidentId == id) state.deliveries.remove(did);
      for ((wid, w) in state.work.entries().toArray().values()) if (w.incidentId == id) state.work.remove(wid);
      removed += 1
    };
    if (not fresh()) return;
    for ((id, old) in state.incidents.entries().toArray().values()) {
      if (expired(old) or old.status == #resolved) continue;
      let p = planning.projects.get(old.projectId) ?? (continue);
      if (old.status == #acknowledged and not eligible(p, old.owner)) {
        let i = { old with status = #open; owner = ""; ownerName = ""; stage = 0; nextEscalation = 0; revision = old.revision + 1; updatedAt = Time.now() };
        switch (state.handoffs.get(id)) { case (?h) { if (h.status == #pending) state.handoffs.add(id, { h with status = #cancelled; decidedAt = Time.now() }) }; case null {} };
        state.incidents.add(id, i);event(id, "", "Desk", "owner_unavailable", old.ownerName # " no longer has project access. Response reopened.");route(i, p)
      } else if (old.status == #open and old.nextEscalation > 0 and old.nextEscalation <= Time.now()) {
        if (old.stage < old.stageCount) { cancelPending(id);let i = { old with stage = old.stage + 1; revision = old.revision + 1; updatedAt = Time.now() };state.incidents.add(id, i);route(i, p) }
        else { state.incidents.add(id, { old with nextEscalation = 0; routeIssue = "All response stages exhausted. Manual response required."; revision = old.revision + 1 });event(id, "", "Desk", "escalation_exhausted", "No responder has accepted responsibility") }
      }
    };
    var sent = 0;
    for (id in state.deliveries.keys().toArray().values()) {
      if (not fresh()) break;
      let d = state.deliveries.get(id) ?? (continue);
      if (sent >= 8 or d.status != #pending or d.nextAttempt > Time.now() or d.leaseUntil > Time.now()) continue;
      let i = state.incidents.get(d.incidentId) ?? (continue);
      let p = planning.projects.get(i.projectId) ?? (continue);
      let pending = if (d.purpose == #response) i.status == #open else switch (state.handoffs.get(i.id)) { case (?h) i.status == #acknowledged and h.status == #pending and h.to == d.recipient; case null false };
      if (expired(i) or not pending or not eligible(p, d.recipient)) {
        state.deliveries.add(id, { d with status = #cancelled; detail = "Recipient unavailable or response no longer pending" });continue
      };
      if(d.purpose==#response and target(i,p)!=d.recipient){state.deliveries.add(id,{d with status=#cancelled;detail="Published coverage or availability changed before delivery"});route(i,p);continue};
      let attempt = d.attempts + 1;
      state.deliveries.add(id, { d with attempts = attempt; leaseUntil = Time.now() + 120_000_000_000 });sent += 1;
      let receipt = try { await send(i.projectId, i.id, d.recipient, "oncall:" # i.id.toText() # ":delivery:" # id.toText()) } catch (_) { { ok = false; detail = "Call interrupted; a delayed notification may still arrive" } };
      let latest = state.deliveries.get(id) ?? (continue);
      if (latest.attempts != attempt) continue;
      // An acknowledgement may race an already dispatched call. Record the real
      // Hub result, but never reopen the incident or start another escalation.
      if (receipt.ok) state.deliveries.add(id, { latest with status = #accepted; acceptedAt = Time.now(); leaseUntil = 0; detail = "Hub accepted the notification; human acknowledgement is separate" })
      else if (latest.status == #pending) state.deliveries.add(id, { latest with status = if (attempt >= 3) #failed else #pending; leaseUntil = 0; nextAttempt = Time.now() + attempt * 20_000_000_000; detail = if (attempt >= 3) "Hub acceptance not confirmed after three attempts: " # receipt.detail else "Retry scheduled: " # receipt.detail });
    }
  };
}
