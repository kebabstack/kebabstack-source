import Operations "mo:kebab-hub/Operations";
/// kebab-stack desk — service management on the skewer.
///
/// Requests from a catalog (typed fields, checklist, queue, approval, SLA),
/// an append-only event log per ticket, roles from hub groups, notifications
/// through the hub. First app built on mo:kebab-hub. See CONCEPT.md.
///
/// Stable-state rules: every top-level let/var is stable and append-only —
/// never remove or rename one; new data goes into new side tables.

import Hub "mo:kebab-hub";
import Customers "Customers";
import OncallTypes "oncall/Types";
import OncallPlanning "oncall/Planning";
import OncallApi "oncall/Api";
import OncallCalendar "oncall/Calendar";
import OncallRegional "oncall/Regional";
import OncallReminders "oncall/Reminders";
import OncallRemindersApi "oncall/RemindersApi";
import OncallCalendarApi "oncall/CalendarApi";
import ResponseTypes "response/Types";
import ResponseApi "response/Api";
import AlertTypes "alerts/Types";
import AlertApi "alerts/Api";
import ReportingTypes "reporting/Types";
import ReportingApi "reporting/Api";
import Compensation "reporting/Compensation";
import StatusTypes "status/Types";
import StatusApi "status/Api";
import Permissions "mo:kebab-hub/Permissions";
import Workflows "Workflows";
import Privacy "Privacy";
import Support "mo:kebab-hub/Support";
import Hardware "mo:kebab-hub/Hardware";
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
import Sha256 "mo:sha2/Sha256";
import Json "mo:json";

persistent actor Desk {
  // =====================================================================
  // config
  // =====================================================================
  var hubId : Text = ""; // hub BACKEND canister id
  transient let BUILD_VERSION : Text = "0.24.1"; // = mops.toml version = CHANGELOG section
  var owner : ?Principal = null; // controller who ran setHub (CLI bootstrap)
  var appUrl : Text = ""; // this desk's frontend URL (deep links in notifications)
  var orgName : Text = "";
  var agentGroup : Text = "desk-agents"; // hub group → agents (default queue)
  var adminGroup : Text = "desk-admins"; // hub group → desk admins
  var adminEmails : [Text] = []; // bootstrap admins (claimAdmin / setAdminEmails)
  var keyPrefix : Text = "DSK";
  var autoCloseDays : Nat = 7;
  var aiProvider : Text = "openai"; // "openai" (chat/completions-compatible) | "anthropic"
  var aiUrl : Text = "";
  var aiKey : Text = "";
  var aiModel : Text = "";
  var demoSeeded : Bool = false;
  var adminClaimed : Bool = false; // claimAdmin is one-shot
  var aiTriage : Bool = true; // auto triage note on new requests
  var fileBytes : Nat = 0; // total attachment bytes held
  let MAX_FILE_BYTES_TOTAL : Nat = 1_000_000_000;
  let ticketFiles : Map.Map<Nat, [Nat]> = Map.empty<Nat, [Nat]>(); // ticket -> file ids
  let lastCreateAt : Map.Map<Text, Int> = Map.empty<Text, Int>(); // requester -> last create (rate limit)

  let H : Int = 3_600_000_000_000; // one hour in ns
  let D : Int = 24 * 3_600_000_000_000;

  // =====================================================================
  // hub SDK state
  // =====================================================================
  let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
  let ids : Map.Map<Text, Text> = Map.empty<Text, Text>(); // address -> hub person id (0.6.0) — YOUR data stores the id, never the address
  let former : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // id -> last row of a person whose address moved on
  let groupsCache : Map.Map<Text, [Text]> = Map.empty<Text, [Text]>(); // email -> hub groups (sign-in refresh)
  var lastDirectoryPull : Int = 0;
  transient var directoryEpoch : Nat = 0;
  transient var directoryPullRunning : Bool = false;
  var lastDirectoryCount : Nat = 0;

  type IC = actor { raw_rand : () -> async Blob };
  transient let ic00 : IC = actor "aaaaa-aa";

  // =====================================================================
  // catalog
  // =====================================================================
  public type FieldDef = {
    key : Text;
    title : Text;
    kind : Text; // text | textarea | date | select | person | bool
    options : [Text]; // for select
    required : Bool;
    sensitive : Bool; // never collected outside the portal (chat intake links here)
  };
  public type RequestType = {
    id : Nat;
    name : Text;
    icon : Text; // short emoji or 1-2 chars
    description : Text;
    fields : [FieldDef];
    checklist : [Text]; // task template; open items block "resolved"
    queue : Text; // optional Hub routing group; empty = all centrally assigned staff
    approval : Text; // "none" | "manager" | "group:<name>"
    defaultPriority : Text; // low | normal | high | urgent
    respondH : Nat; // SLA: first visible agent reply within
    resolveH : Nat; // SLA: resolved within (0 = none)
    dueField : Text; // field key of kind date that overrides the due date ("" = none)
    visibility : Text; // "all" | "agents"
    enabled : Bool;
    sortOrder : Nat;
  };
  let types : Map.Map<Nat, RequestType> = Map.empty<Nat, RequestType>();
  var nextTypeId : Nat = 1;

  // =====================================================================
  // tickets, events, side tables
  // =====================================================================
  public type Ticket = {
    id : Nat;
    key : Text; // "DSK-42"
    typeId : Nat;
    subject : Text;
    body : Text;
    status : Text; // new | open | waiting | resolved | closed
    waitingOn : Text; // "" | requester | third-party | approval
    priority : Text; // low | normal | high | urgent
    requester : Text; // e-mail
    assignee : Text; // e-mail, "" = unassigned
    queue : Text; // hub group name
    channel : Text; // portal | agent | api | seed | <plugin>
    fields : [(Text, Text)];
    links : [(Text, Text)]; // (kind, ref) e.g. ("asset", "MBP-0042")
    createdAt : Int;
    updatedAt : Int;
    dueAt : ?Int;
    respondBy : ?Int;
    firstResponseAt : ?Int;
    resolvedAt : ?Int;
    closedAt : ?Int;
  };
  let tickets : Map.Map<Nat, Ticket> = Map.empty<Nat, Ticket>();
  var nextTicketId : Nat = 1;

  public type Event = {
    id : Nat;
    ticketId : Nat;
    at : Int;
    who : Text; // e-mail | "system" | "ai"
    actorKind : Text; // requester | agent | system | ai
    kind : Text; // created | comment | note | status | assign | queue | priority | field | file | approval | task | link | ai
    body : Text;
    meta : [(Text, Text)];
  };
  let events : Map.Map<Nat, Event> = Map.empty<Nat, Event>();
  var nextEventId : Nat = 1;
  let ticketEvents : Map.Map<Nat, [Nat]> = Map.empty<Nat, [Nat]>();

  public type Task = { title : Text; state : Text; by : Text; at : Int }; // open | done | na
  let ticketTasks : Map.Map<Nat, [Task]> = Map.empty<Nat, [Task]>();

  public type Approval = {
    approver : Text; // e-mail | "group:<name>"
    state : Text; // pending | approved | rejected
    decidedBy : Text;
    at : Int;
    note : Text;
  };
  let approvals : Map.Map<Nat, Approval> = Map.empty<Nat, Approval>();

  public type File = { id : Nat; ticketId : Nat; name : Text; mime : Text; size : Nat; data : Blob; by : Text; at : Int };
  let files : Map.Map<Nat, File> = Map.empty<Nat, File>();
  var nextFileId : Nat = 1;
  let MAX_FILE : Nat = 1_500_000;
  let MAX_FILES_PER_TICKET : Nat = 20;

  let nudged : Map.Map<Text, Int> = Map.empty<Text, Int>(); // "<id>:respond" | "<id>:resolve" -> at

  type LogRow = { at : Int; who : Text; what : Text };
  let adminLog : Map.Map<Nat, LogRow> = Map.empty<Nat, LogRow>();
  var nextLogId : Nat = 1;


  // ---- Customer privacy: bounded retention, erasure and restore journal ----
  public type CustomerPrivacyInput = Privacy.Input;
  public type CustomerErasure = Privacy.Erasure;
  let customerPolicies = Map.empty<Nat, Privacy.Policy>();
  let customerHolds = Map.empty<Nat, Privacy.Hold>();
  let customerCosts = Map.empty<Nat, Nat>();
  let customerErasures = Map.empty<Nat, Privacy.Erasure>();
  let customerErasedRetries = Map.empty<Text, Int>();
  // Persist this once. An upgrade must never restart the transition grace period.
  let customerPrivacyIntroducedAt : Int = Time.now();
  var customerPrivacyCursor : Nat = 0;
  var customerPrivacyLastSweep : Int = 0;
  var customerAccountingReady : Bool = false;
  var customerJournalRevision : Nat = 0;
  var customerJournalCursor : Nat = 0;
  var customerRetryCursor : Text = "";
  func privacyPolicy(id : Nat) : Privacy.Policy = customerPolicies.get(id) ?? ({ revision = 0; completedDays = 90; inactiveDays = 365; noticeUrl = ""; graceUntil = customerPrivacyIntroducedAt + 7 * D });
  func retentionAt(t : Ticket, p : Privacy.Policy) : Int {
    let deadline = if (t.status == "resolved" or t.status == "closed") (t.resolvedAt ?? t.closedAt ?? t.updatedAt) + p.completedDays * D else t.updatedAt + p.inactiveDays * D;
    let held = switch (customerHolds.get(t.id)) { case (?h) h.until; case null 0 };
    Int.max(Int.max(deadline, p.graceUntil), held);
  };
  func customerDue(t : Ticket) : Bool = projectOf(t.id) != 0 and now() >= retentionAt(t, privacyPolicy(projectOf(t.id)));
  func privacyJson(projectId : Nat) : Json.Json {
    let p = privacyPolicy(projectId);
    Json.obj([("completedDays", Json.int(p.completedDays)), ("inactiveDays", Json.int(p.inactiveDays)), ("noticeUrl", #string(p.noticeUrl))]);
  };
  func customerSchema(p : CustomerProject) : Json.Json {
    switch (Customers.schema(p)) { case (#object_(xs)) #object_(Array.concat(xs, [("serviceStatus", statusCustomerJson(p.id)), ("privacy", privacyJson(p.id)), ("defaultTypeId", Json.int(p.typeId)), ("requestTypes", #array(projectTypes(p).filter(func t = t.enabled).map(Workflows.publicType)))])); case x x };
  };
  public shared query func customerPrivacy(tok : Text, id : Nat) : async ?{ policy : Privacy.Policy; tickets : Nat; due : Nat; held : Nat; nextDeletion : Int; lastSweep : Int; journalEntries : Nat } {
    let _ = admin(tok) ?? (return null);
    if (customerProjects.get(id) == null) return null;
    let p = privacyPolicy(id); var count = 0; var due = 0; var held = 0; var next : Int = 0;
    for ((tid, c) in customerContacts.entries()) if (c.projectId == id) {
      switch (tickets.get(tid)) { case (?t) {
        count += 1; let at = retentionAt(t, p); if (at <= now()) due += 1;
        if (next == 0 or at < next) next := at;
        switch (customerHolds.get(tid)) { case (?h) { if (h.until > now()) held += 1 }; case null {} };
      }; case null {} };
    };
    ?{ policy = p; tickets = count; due; held; nextDeletion = next; lastSweep = customerPrivacyLastSweep; journalEntries = customerErasures.values().filter(func x = x.projectId == id).size() };
  };
  public shared func saveCustomerPrivacy(tok : Text, id : Nat, revision : Nat, input : CustomerPrivacyInput, confirmShorter : Bool) : async { ok : Bool; detail : Text } {
    let m = admin(tok) ?? (return { ok = false; detail = "Hub admin permission required" });
    let project = customerProjects.get(id) ?? (return { ok = false; detail = "Project not found" });
    let previous = privacyPolicy(id);
    if (previous.revision != revision) return { ok = false; detail = "Privacy settings changed. Reload before saving." };
    let invalid = Privacy.valid(input); if (invalid != "") return { ok = false; detail = invalid };
    let shorter = input.completedDays < previous.completedDays or input.inactiveDays < previous.inactiveDays;
    if (shorter and not confirmShorter) return { ok = false; detail = "Confirm that shorter periods also apply to existing tickets. A 24-hour grace period applies." };
    let graceUntil = if (shorter) Int.max(previous.graceUntil, now() + D) else previous.graceUntil;
    customerPolicies.add(id, { input with revision = revision + 1; graceUntil });
    // Privacy changes invalidate cached forms so customers see the current notice before submitting.
    customerProjects.add(id, { project with revision = project.revision + 1 });
    log(m.email, "Updated retention for customer project " # Nat.toText(id));
    { ok = true; detail = "Retention saved. Existing and future tickets follow these periods." };
  };
  public shared func holdCustomerTicket(tok : Text, id : Nat, days : Nat, reason : Text) : async { ok : Bool; detail : Text } {
    let m = admin(tok) ?? (return { ok = false; detail = "Hub admin permission required" });
    let t = tickets.get(id) ?? (return { ok = false; detail = "Ticket not found" });
    if (projectOf(id) == 0 or customerDue(t)) return { ok = false; detail = "Customer ticket unavailable" };
    if (days > 365 or (days > 0 and (norm(reason).size() < 5 or reason.size() > 200))) return { ok = false; detail = "Use 1–365 days and a short justification (5–200 characters)" };
    if (days == 0) customerHolds.remove(id) else customerHolds.add(id, { until = now() + days * D; reason = norm(reason) });
    log(m.email, "Changed time-limited retention hold for ticket " # Nat.toText(id));
    { ok = true; detail = if (days == 0) "Hold removed; the normal deletion deadline applies immediately" else "Hold saved; it expires automatically" };
  };
  func legacyCustomerCost(id : Nat) : Nat {
    let c = customerContacts.get(id) ?? (return 0); let t = tickets.get(id) ?? (return 0);
    var size = Text.encodeUtf8(c.name # c.email # t.subject # t.body).size();
    for ((k, v) in t.fields.vals()) size += Text.encodeUtf8(k # v).size();
    for (f in c.schema.vals()) size += Text.encodeUtf8(f.key # f.title # Text.join(f.options.vals(), ",")).size();
    for (eid in (ticketEvents.get(id) ?? []).vals()) switch (events.get(eid)) { case (?e) { if (e.kind == "comment") size += Text.encodeUtf8(e.body).size() }; case null {} };
    size;
  };
  func accountCustomer(id : Nat, bytes : Nat) {
    let before = customerCosts.get(id) ?? legacyCustomerCost(id);
    customerCosts.add(id, before + bytes); customerStoredBytes += bytes;
  };
  // Single-message mutation: no awaits, no partially erased ticket visible to another call.
  func eraseCustomer(id : Nat, reason : Text) : Bool {
    let c = customerContacts.get(id) ?? (return false); let t = tickets.get(id) ?? (return false);
    let cost = customerCosts.get(id) ?? legacyCustomerCost(id);
    for (eid in (ticketEvents.get(id) ?? []).vals()) events.remove(eid);
    for (fid in (ticketFiles.get(id) ?? []).vals()) { switch (files.get(fid)) { case (?f) { fileBytes := Nat.sub(fileBytes, Nat.min(fileBytes, f.size)) }; case null {} }; files.remove(fid) };
    // Retry tombstones contain only a random-token digest and expiry, never the request.
    for ((key, tid) in customerRetries.entries().toArray().vals()) if (tid == id) { customerRetries.remove(key); customerErasedRetries.add(key, now() + 365 * D) };
    let prefix = Nat.toText(id) # ":";
    for (key in customerReplyRetries.keys().toArray().vals()) if (key.startsWith(#text prefix)) customerReplyRetries.remove(key);
    for (key in nudged.keys().toArray().vals()) if (key.startsWith(#text prefix)) nudged.remove(key);
    ticketEvents.remove(id); ticketTasks.remove(id); approvals.remove(id); ticketFiles.remove(id);
    customerWorkflows.remove(id); customerContacts.remove(id); customerReplyAt.remove(id); customerLinkRevisions.remove(id); customerHolds.remove(id); customerCosts.remove(id);
    lastCreateAt.remove(t.requester); tickets.remove(id);
    customerStoredBytes := Nat.sub(customerStoredBytes, Nat.min(customerStoredBytes, cost));
    if (customerContacts.size() == 0) customerStoredBytes := 0;
    customerJournalRevision += 1;
    customerErasures.add(id, { ticketId = id; projectId = c.projectId; createdAt = t.createdAt; deletedAt = now(); reason });
    true;
  };
  public shared func eraseCustomerTicket(tok : Text, id : Nat, expectedUpdatedAt : Int, confirmation : Text) : async { ok : Bool; detail : Text } {
    let _ = admin(tok) ?? (return { ok = false; detail = "Hub admin permission required" });
    let t = tickets.get(id) ?? (return { ok = false; detail = "Ticket unavailable or already deleted" });
    if (projectOf(id) == 0 or confirmation != t.key or expectedUpdatedAt != t.updatedAt) return { ok = false; detail = "Ticket changed or confirmation is incorrect. Reload and review it." };
    switch (customerHolds.get(id)) { case (?h) { if (h.until > now()) return { ok = false; detail = "Remove the retention hold only after reviewing its justification" } }; case null {} };
    ignore eraseCustomer(id, "request");
    { ok = true; detail = "Customer ticket and its content deleted from the active Desk. Reconcile backup copies using the deletion journal." };
  };
  public shared query func exportCustomerTicket(tok : Text, id : Nat) : async ?Text {
    let _ = admin(tok) ?? (return null);
    let t = tickets.get(id) ?? (return null); let c = customerContacts.get(id) ?? (return null);
    if (customerDue(t)) return null;
    // This is an operator review package. Internal notes may contain other people's data.
    let evs = (ticketEvents.get(id) ?? []).values().filterMap(func eid = events.get(eid)).map(func e = Json.obj([("at", #string(Int.toText(e.at))), ("kind", #string(e.kind)), ("body", #string(e.body)), ("meta", Json.obj(e.meta.map(func (k,v) = (k,#string(v)))))] )).toArray();
    ?Json.stringify(Json.obj([("format", #string("desk-customer-review-v1")), ("contact", Json.obj([("name", #string(c.name)), ("email", #string(c.email))])), ("conversation", customerJson(t)), ("links", #array(t.links.map(func (k,v) = Json.obj([("kind", #string(k)), ("value", #string(v))])))), ("tasks", #array((ticketTasks.get(id) ?? []).map(func x = Json.obj([("title", #string(x.title)), ("state", #string(x.state))])))), ("retentionHold", switch (customerHolds.get(id)) { case (?h) Json.obj([("until", #string(Int.toText(h.until))), ("reason", #string(h.reason))]); case null #null_ }), ("workflow", switch (customerWorkflows.get(id)) { case (?w) Workflows.review(w); case null #null_ }), ("internalReviewOnly", #array(evs))]), null);
  };
  public shared query func customerErasureJournal(tok : Text, projectId : Nat, after : Nat, expectedRevision : Nat) : async ?Text {
    let _ = admin(tok) ?? (return null);
    if (customerProjects.get(projectId) == null or (after > 0 and expectedRevision != customerJournalRevision)) return null;
    let batch = customerErasures.entriesFrom(after).take(500).toArray();
    let rows = batch.values().filter(func (_, x) = x.projectId == projectId).map(func (_, x) = Json.obj([("ticketId", #string(Nat.toText(x.ticketId))), ("projectId", #string(Nat.toText(x.projectId))), ("createdAt", #string(Int.toText(x.createdAt))), ("deletedAt", #string(Int.toText(x.deletedAt))), ("reason", #string(x.reason))])).toArray();
    let next = if (batch.size() == 500) batch[499].0 + 1 else 0;
    ?Json.stringify(Json.obj([("format", #string("desk-erasure-journal-v1")), ("canister", #string(Principal.toText(Principal.fromActor(Desk)))), ("projectId", #string(Nat.toText(projectId))), ("entries", #array(rows)), ("next", #string(Nat.toText(next))), ("revision", #string(Nat.toText(customerJournalRevision)))]), null);
  };
  public shared func replayCustomerErasures(tok : Text, canister : Text, projectId : Nat, rows : [CustomerErasure]) : async { ok : Bool; detail : Text } {
    let _ = admin(tok) ?? (return { ok = false; detail = "Hub admin permission required" });
    if (canister != Principal.toText(Principal.fromActor(Desk)) or rows.size() > 100 or customerProjects.get(projectId) == null) return { ok = false; detail = "Journal must belong to this Desk/project; maximum 100 entries per batch" };
    // Validate the entire batch before changing anything. IDs alone are not restore identity.
    for (r in rows.vals()) {
      if (r.projectId != projectId) return { ok = false; detail = "Wrong project in journal" };
      switch (tickets.get(r.ticketId)) { case (?t) { if (t.createdAt != r.createdAt or projectOf(t.id) != projectId) return { ok = false; detail = "Journal does not match restored ticket identity" } }; case null {} };
    };
    var count = 0; for (r in rows.vals()) if (eraseCustomer(r.ticketId, "restore")) count += 1;
    { ok = true; detail = Nat.toText(count) # " restored tickets erased" };
  };
  func sweepCustomerPrivacy() {
    let batch = customerContacts.entriesFrom(customerPrivacyCursor).take(250).toArray();
    var erased = 0;
    label scan for ((id, _) in batch.vals()) {
      customerPrivacyCursor := id + 1;
      if (customerCosts.get(id) == null) customerCosts.add(id, legacyCustomerCost(id));
      switch (tickets.get(id)) { case (?t) { if (customerDue(t)) { ignore eraseCustomer(id, "retention"); erased += 1 } }; case null {} };
      if (erased >= 50) break scan;
    };
    if (batch.size() == 0) {
      customerPrivacyCursor := 0;
      if (not customerAccountingReady) {
        customerStoredBytes := 0; for (cost in customerCosts.values()) customerStoredBytes += cost;
        customerAccountingReady := true;
      };
    };
    customerPrivacyLastSweep := now();
    let journalBatch = customerErasures.entriesFrom(customerJournalCursor).take(250).toArray();
    for ((id, e) in journalBatch.vals()) { customerJournalCursor := id + 1; if (e.deletedAt + 365 * D <= now()) { customerErasures.remove(id); customerJournalRevision += 1 } };
    if (journalBatch.size() == 0) customerJournalCursor := 0;
    let retryBatch = customerErasedRetries.entriesFrom(customerRetryCursor).take(250).toArray();
    for ((key, until) in retryBatch.vals()) { customerRetryCursor := key # "!"; if (until <= now()) customerErasedRetries.remove(key) };
    if (retryBatch.size() == 0) customerRetryCursor := "";
  };

  // Additive planning state: retain the deployed persistence contract and old
  // side tables. The populated upgrade test covers old tickets and these plans.
  let oncallState : OncallTypes.State = OncallPlanning.empty();
  let oncallReminderState : OncallReminders.State = OncallReminders.empty();
  let oncallRegionalState : OncallRegional.State = OncallRegional.empty();
  let oncallCalendarState : OncallCalendar.State = OncallCalendar.empty();
  let responseState : ResponseTypes.State = ResponseTypes.empty();
  let alertState : AlertTypes.State = AlertTypes.empty();
  let serviceStatusState : StatusTypes.State = StatusTypes.empty();
  let compensationState : Compensation.State = Compensation.empty();
  let reportingState : ReportingTypes.State = ReportingTypes.empty();
  func reportingActor(tok : Text) : ?OncallTypes.Actor { let m=me(tok)??(return null);?{id=m.id;role=m.role} };
  func reportingCapability(a : OncallTypes.Actor,projectId : Nat,cap : Text) : Bool {
    if(a.role=="admin")return true;let u=people.get(emailOfPid(a.id))??(return false);
    Hub.attribute(u,"deskReportingModel")=="1" and Permissions.reportingHas(Hub.attribute(u,"deskReporting"),projectId,cap)
  };
  func reportingPersonActive(id : Text) : Bool = Hub.isActive(people,emailOfPid(id));
  public shared ({caller}) func hub_reportingScopes() : async [Permissions.ReportingScope] {
    assert Hub.isHub(caller,hubId);oncallState.projects.values().toArray().map(func p={id=p.id;name=p.name})
  };
  func oncallActor(tok : Text) : ?OncallTypes.Actor {
    let m = staff(tok) ?? (return null); ?{ id = m.id; role = m.role }
  };
  func oncallAccess(a : OncallTypes.Actor, p : OncallTypes.Project) : Bool {
    if (a.role == "admin") return true;
    let email = emailOfPid(a.id);
    switch (p.scope) {
      case (#internal group) a.role == "agent" and inGroup(email, group);
      case (#customer id) projectEmailAccess(email, id);
    }
  };
  func oncallEligible(p : OncallTypes.Project, id : Text) : Bool {
    let email = emailOfPid(id);
    email != "" and Hub.isActive(people, email) and isStaff(roleOf(email)) and oncallAccess({ id; role = roleOf(email) }, p)
  };
  func oncallRoster(p : OncallTypes.Project) : [OncallTypes.Person] {
    staffEmails().filter(func email = oncallEligible(p, pidOf(email))).map(func email = { id = pidOf(email); name = personName(pidOf(email)) })
  };
  func oncallScopeValid(scope : OncallTypes.Scope) : Bool {
    switch (scope) {
      case (#customer id) customerProjects.containsKey(id);
      case (#internal group) group == "" or people.entries().toArray().any(func (email, _) = inGroup(email, group));
    }
  };

  // ---- Customer projects: separate identities and immutable ticket scope ----
  public type CustomerProject = Customers.Project;
  public type CustomerProjectInput = Customers.Input;
  public type CustomerKeyView = { id : Nat; projectId : Nat; name : Text; scopes : [Text]; createdAt : Int; expiresAt : Int; revoked : Bool };
  let customerProjects = Map.empty<Nat, Customers.Project>();
  let customerContacts = Map.empty<Nat, Customers.Contact>();
  let customerKeys = Map.empty<Nat, Customers.Key>();
  let customerRetries = Map.empty<Text, Nat>();
  let customerQuotas = Map.empty<Nat, { hour : Int; hourly : Nat; day : Int; daily : Nat }>();
  let customerLinkRevisions = Map.empty<Nat, Nat>();
  let customerReplyAt = Map.empty<Nat, Int>();
  let customerReplyRetries = Map.empty<Text, Text>();
  var customerStoredBytes : Nat = 0;
  let MAX_CUSTOMER_BYTES : Nat = 100_000_000;
  var nextCustomerProject : Nat = 1;
  var nextCustomerKey : Nat = 1;
  func projectOf(id : Nat) : Nat = switch (customerContacts.get(id)) { case (?c) c.projectId; case null 0 };
  func projectAccess(m : Me, id : Nat) : Bool {
    if (id == 0) return isStaff(m.role);
    let p = customerProjects.get(id) ?? (return false);
    m.role == "admin" or (m.role == "agent" and inGroup(m.email, p.group));
  };
  func projectEmailAccess(e : Text, id : Nat) : Bool = Hub.directoryFresh(lastDirectoryPull) and Hub.isActive(people, e) and projectAccess({ id = pidOf(e); email = e; displayName = ""; role = roleOf(e) }, id);
  func digest(t : Text) : Text = hex(Sha256.fromArray(#sha256, Blob.toArray(Text.encodeUtf8(t))));
  func keyView(k : Customers.Key) : CustomerKeyView = { id = k.id; projectId = k.projectId; name = k.name; scopes = k.scopes; createdAt = k.createdAt; expiresAt = k.expiresAt; revoked = k.revoked };
  func customerType(p : CustomerProject) : RequestType = { id = p.typeId; name = p.name; icon = "◫"; description = p.description; fields = p.fields; checklist = []; queue = p.group; approval = "none"; defaultPriority = "normal"; respondH = 24; resolveH = 0; dueField = ""; visibility = "agents"; enabled = false; sortOrder = 9999 };
  let customerTypes = Map.empty<Nat, Workflows.Type>();
  let customerWorkflows = Map.empty<Nat, Workflows.Run>();
  func customerTypeId(id : Nat) : Bool = customerTypes.containsKey(id) or customerProjects.values().find(func p = p.typeId == id) != null;
  func projectTypes(p : CustomerProject) : [Workflows.Type] {
    let fallback : Workflows.Type = { id = p.typeId; projectId = p.id; revision = 0; name = "General support"; description = "Questions and help with this product"; enabled = true; fields = p.fields; priority = "normal"; respondH = 24; resolveH = 0; steps = [] };
    Array.concat([customerTypes.get(p.typeId) ?? fallback], customerTypes.values().toArray().filter(func t = t.projectId == p.id and t.id != p.typeId));
  };
  func workflowType(p : CustomerProject, w : Workflows.Type) : RequestType = { customerType(p) with id = w.id; name = w.name; description = w.description; fields = w.fields; defaultPriority = w.priority; respondH = w.respondH; resolveH = w.resolveH };
  func workflowAllowed(m : Me, r : Workflows.Run) : Bool = projectAccess(m, r.definition.projectId) and (m.role == "admin" or r.definition.steps[r.step].group == "" or inGroup(m.email, r.definition.steps[r.step].group));
  public shared query func listCustomerTypes(tok : Text, projectId : Nat) : async [Workflows.Type] {
    let m = staff(tok) ?? (return []); let p = customerProjects.get(projectId) ?? (return []);
    if (not projectAccess(m, projectId)) return []; projectTypes(p);
  };
  public shared query func customerWorkflowTeams(tok : Text, projectId : Nat) : async [{ name : Text; eligible : Nat }] {
    ignore admin(tok) ?? (return []);
    if (customerProjects.get(projectId) == null) return [];
    let groups = Map.empty<Text, Nat>();
    for ((email, person) in people.entries()) if (person.active) for (name in groupsOfEmail(email).vals()) {
      groups.add(name, (groups.get(name) ?? 0) + (if (projectEmailAccess(email, projectId) and roleOf(email) == "agent") 1 else 0));
    };
    groups.entries().toArray().map(func (name, eligible) = { name; eligible });
  };
  public shared func saveCustomerType(tok : Text, projectId : Nat, projectRevision : Nat, id : Nat, input : Workflows.Input) : async { ok : Bool; id : Nat; detail : Text } {
    let m = admin(tok) ?? (return { ok = false; id; detail = "Hub admins only" });
    let p = customerProjects.get(projectId) ?? (return { ok = false; id; detail = "Project not found" });
    if (p.revision != projectRevision) return { ok = false; id; detail = "Project changed. Reload before saving." };
    let error = Workflows.validate(input); if (error != "") return { ok = false; id; detail = error };
    let existing = projectTypes(p);
    if (existing.find(func x = x.id != id and lower(norm(x.name)) == lower(norm(input.name))) != null) return { ok = false; id; detail = "A request type with this name already exists" };
    if (id != 0 and existing.find(func x = x.id == id) == null) return { ok = false; id; detail = "Request type not found in this project" };
    if (id == 0 and existing.size() >= 20) return { ok = false; id; detail = "Maximum 20 request types per project" };
    if (id == p.typeId and not input.enabled) return { ok = false; id; detail = "Keep the default type available for existing integrations. Pause the project to stop all intake." };
    let typeId = if (id == 0) { let n = nextTypeId; nextTypeId += 1; n } else id;
    let previousRevision = switch (customerTypes.get(typeId)) { case (?t) t.revision; case null 0 };
    let w : Workflows.Type = { input with name = norm(input.name); steps = input.steps.map(func s = { s with name = norm(s.name); group = norm(s.group); instructions = norm(s.instructions); checklist = s.checklist.map(norm) }); id = typeId; projectId; revision = previousRevision + 1 };
    customerTypes.add(typeId, w); types.add(typeId, workflowType(p, w));
    customerProjects.add(projectId, { p with revision = p.revision + 1; fields = if (typeId == p.typeId) input.fields else p.fields });
    log(m.email, "Updated request type " # Nat.toText(typeId) # " for customer project " # Nat.toText(projectId));
    { ok = true; id = typeId; detail = "Saved. Existing tickets keep their original workflow." };
  };
  public shared func checkCustomerStep(tok : Text, id : Nat, revision : Nat, index : Nat, checked : Bool) : async { ok : Bool; detail : Text } {
    let m = staff(tok) ?? (return { ok = false; detail = "Agents only" });
    let t = tickets.get(id) ?? (return { ok = false; detail = "Ticket unavailable" });
    if (not canSee(m, t)) return { ok = false; detail = "Ticket unavailable" };
    let r = customerWorkflows.get(id) ?? (return { ok = false; detail = "No workflow" });
    if (r.definition.steps.size() == 0 or r.outcome != "" or r.revision != revision or index >= r.checked.size()) return { ok = false; detail = "Workflow changed. Reload before continuing." };
    if (not workflowAllowed(m, r)) return { ok = false; detail = "This step belongs to another Hub team" };
    if (not customerMessageRoom(id)) return { ok = false; detail = "Ticket activity limit reached" };
    if (r.checked[index] == checked) return { ok = true; detail = "" };
    customerWorkflows.add(id, { r with revision = revision + 1; checked = Array.tabulate<Bool>(r.checked.size(), func i = if (i == index) checked else r.checked[i]) });
    ignore addEvent(id, m.id, "agent", "workflow", (if (checked) "Checked: " else "Unchecked: ") # r.definition.steps[r.step].checklist[index], []);
    put(t); { ok = true; detail = "" };
  };
  public shared func moveCustomerStep(tok : Text, id : Nat, revision : Nat, action : Text, reason : Text) : async { ok : Bool; detail : Text } {
    let m = staff(tok) ?? (return { ok = false; detail = "Agents only" });
    let t = tickets.get(id) ?? (return { ok = false; detail = "Ticket unavailable" });
    if (not canSee(m, t)) return { ok = false; detail = "Ticket unavailable" };
    let r = customerWorkflows.get(id) ?? (return { ok = false; detail = "No workflow" });
    if (r.definition.steps.size() == 0 or r.revision != revision) return { ok = false; detail = "Workflow changed. Reload before continuing." };
    if (not workflowAllowed(m, r)) return { ok = false; detail = "This step belongs to another Hub team" };
    if (not has(["advance", "approve", "back", "cancel", "reopen"], action)) return { ok = false; detail = "Unknown workflow action" };
    if ((r.outcome != "") != (action == "reopen")) return { ok = false; detail = "This action is not available" };
    if (reason.size() > 500 or ((action == "back" or action == "cancel" or action == "reopen") and norm(reason).size() < 5)) return { ok = false; detail = "Add a reason (5–500 characters)" };
    if (action == "back" and r.step == 0) return { ok = false; detail = "Already at the first step. Cancel if the request cannot proceed." };
    if (action == "advance" or action == "approve") {
      if (r.definition.steps[r.step].approval != (action == "approve")) return { ok = false; detail = "This step requires an explicit approval" };
      if (r.checked.find(func x = not x) != null or openTasks(id) > 0) return { ok = false; detail = "Complete the required checks and additional checklist first" };
    };
    if (not customerMessageRoom(id)) return { ok = false; detail = "Ticket activity limit reached" };
    let finished = (action == "advance" or action == "approve") and r.step + 1 == r.definition.steps.size();
    let step = if (action == "reopen") 0 else if (action == "back") Nat.sub(r.step, 1) else if (action == "advance" or action == "approve") { if (finished) r.step else r.step + 1 } else r.step;
    let outcome = if (action == "cancel") "cancelled" else if (finished) "completed" else "";
    let next = r.definition.steps[step];
    customerWorkflows.add(id, { r with revision = revision + 1; step; outcome; checked = if (outcome != "") r.checked else next.checklist.map(func _ = false) });
    let queue = if (next.group == "") (customerProjects.get(r.definition.projectId) ?? (return { ok = false; detail = "Project unavailable" })).group else next.group;
    let status = if (outcome == "cancelled") "closed" else if (finished) "resolved" else "open";
    let assignee = if (t.assignee != "" and (next.group == "" or inGroup(emailOfPid(t.assignee), next.group) or roleOf(emailOfPid(t.assignee)) == "admin")) t.assignee else "";
    put({ t with status; waitingOn = ""; queue; assignee; resolvedAt = if (outcome != "") ?now() else null; closedAt = if (outcome == "cancelled") ?now() else null });
    accountCustomer(id, Text.encodeUtf8(reason).size());
    ignore addEvent(id, m.id, "agent", "workflow", action # " · " # r.definition.steps[r.step].name # (if (reason == "") "" else " · " # reason), [("step", Nat.toText(step)), ("outcome", outcome)]);
    notifyQueue<system>(tickets.get(id) ?? t, "Customer workflow activity", t.key # ":workflow:" # Nat.toText(revision + 1));
    { ok = true; detail = "" };
  };
  public shared query func listCustomerProjects(tok : Text) : async [CustomerProject] {
    let m = staff(tok) ?? (return []);
    customerProjects.values().toArray().filter(func p = projectAccess(m, p.id));
  };
  public shared func saveCustomerProject(tok : Text, id : Nat, revision : Nat, input : CustomerProjectInput) : async { ok : Bool; id : Nat; detail : Text } {
    let before = admin(tok) ?? (return { ok = false; id = 0; detail = "Hub admins only" });
    let err = Customers.validate(input);
    if (err != "") return { ok = false; id = 0; detail = err };
    if (id == 0) {
      if (customerProjects.size() >= 30) return { ok = false; id = 0; detail = "Maximum 30 projects" };
      let entropy = hex(await ic00.raw_rand());
      let after = admin(tok) ?? (return { ok = false; id = 0; detail = "Access changed" });
      if (before.id != after.id or customerProjects.size() >= 30) return { ok = false; id = 0; detail = "Please retry" };
      let pid = nextCustomerProject; nextCustomerProject += 1;
      let typeId = nextTypeId; nextTypeId += 1;
      let p : CustomerProject = { input with id = pid; revision = 1; widgetId = entropy; typeId };
      customerProjects.add(pid, p); types.add(typeId, customerType(p));
      customerPolicies.add(pid, { revision = 0; completedDays = 90; inactiveDays = 365; noticeUrl = ""; graceUntil = 0 });
      log(after.email, "Created customer project " # input.name);
      return { ok = true; id = pid; detail = "" };
    };
    let previous = customerProjects.get(id) ?? (return { ok = false; id = 0; detail = "Project not found" });
    if (previous.revision != revision) return { ok = false; id; detail = "Project changed. Reload before saving." };
    let p : CustomerProject = { input with fields = switch (customerTypes.get(previous.typeId)) { case (?w) w.fields; case null input.fields }; id; revision = revision + 1; widgetId = previous.widgetId; typeId = previous.typeId };
    customerProjects.add(id, p);
    types.add(p.typeId, switch (customerTypes.get(p.typeId)) { case (?w) workflowType(p, w); case null customerType(p) });
    // Queue mirrors the project team. The project boundary never follows a ticket queue.
    for ((tid, t) in tickets.entries()) if (projectOf(tid) == id) tickets.add(tid, { t with queue = switch (customerWorkflows.get(tid)) { case (?w) { if (w.definition.steps.size() > 0 and w.definition.steps[w.step].group != "") w.definition.steps[w.step].group else p.group }; case null p.group }; assignee = if (t.assignee != "" and projectEmailAccess(emailOfPid(t.assignee), id)) t.assignee else "" });
    log(before.email, "Updated customer project " # input.name);
    { ok = true; id; detail = "" };
  };
  public shared func rotateCustomerWidget(tok : Text, id : Nat) : async Bool {
    let m = admin(tok) ?? (return false);
    let p = customerProjects.get(id) ?? (return false);
    let widgetId = hex(await ic00.raw_rand());
    let current = customerProjects.get(id) ?? (return false);
    let currentAdmin = admin(tok) ?? (return false);
    if (m.id != currentAdmin.id or p.revision != current.revision) return false;
    customerProjects.add(id, { current with widgetId; revision = current.revision + 1 });
    log(m.email, "Rotated widget for " # p.name); true;
  };
  public shared query func customerProjectKeys(tok : Text, id : Nat) : async [CustomerKeyView] {
    ignore admin(tok) ?? (return []);
    customerKeys.values().toArray().filter(func k = k.projectId == id).map(keyView);
  };
  public shared func createCustomerKey(tok : Text, projectId : Nat, name : Text, scopes : [Text], days : Nat) : async { ok : Bool; secret : Text; detail : Text } {
    let m = admin(tok) ?? (return { ok = false; secret = ""; detail = "Hub admins only" });
    let p = customerProjects.get(projectId) ?? (return { ok = false; secret = ""; detail = "Project not found" });
    if (norm(name) == "" or name.size() > 60 or days < 1 or days > 365 or scopes.size() == 0 or scopes.size() > 3) return { ok = false; secret = ""; detail = "Name, 1–365 days and at least one permission required" };
    for (scope in scopes.vals()) if (not has(["tickets:create", "tickets:read", "tickets:reply"], scope)) return { ok = false; secret = ""; detail = "Unsupported permission" };
    let secret = hex(await ic00.raw_rand());
    let current = customerProjects.get(projectId) ?? (return { ok = false; secret = ""; detail = "Project not found" });
    let currentAdmin = admin(tok) ?? (return { ok = false; secret = ""; detail = "Access changed" });
    if (m.id != currentAdmin.id or p.revision != current.revision) return { ok = false; secret = ""; detail = "Project changed. Retry." };
    // Expired and revoked key hashes need not occupy unbounded storage.
    for ((id, k) in customerKeys.entries()) if (k.expiresAt <= now() or k.revoked) customerKeys.remove(id);
    if (customerKeys.size() >= 300 or customerKeys.values().toArray().filter(func k = k.projectId == projectId).size() >= 10) return { ok = false; secret = ""; detail = "Maximum 10 active keys per project" };
    let id = nextCustomerKey; nextCustomerKey += 1;
    customerKeys.add(id, { id; projectId; name = norm(name); scopes; hash = digest(secret); createdAt = now(); expiresAt = now() + days * D; revoked = false });
    log(m.email, "Created customer API key " # name # " for " # p.name);
    { ok = true; secret; detail = "Copy once. Store only in your product backend." };
  };
  public shared func revokeCustomerKey(tok : Text, id : Nat) : async Bool {
    let m = admin(tok) ?? (return false);
    let k = customerKeys.get(id) ?? (return false);
    customerKeys.add(id, { k with revoked = true }); log(m.email, "Revoked customer API key " # k.name); true;
  };
  public shared query func customerProjectAgents(tok : Text, id : Nat) : async [{ id : Text; email : Text; displayName : Text }] {
    let m = staff(tok) ?? (return []);
    if (not projectAccess(m, id)) return [];
    staffEmails().filter(func e = projectEmailAccess(e, id)).map(func e = { id = pidOf(e); email = e; displayName = personName(pidOf(e)) });
  };
  public shared func customerTicketLink(tok : Text, id : Nat, revoke : Bool) : async { ok : Bool; url : Text; detail : Text } {
    let m = staff(tok) ?? (return { ok = false; url = ""; detail = "Agents only" });
    let c = customerContacts.get(id) ?? (return { ok = false; url = ""; detail = "Customer ticket not found" });
    if (customerDue(tickets.get(id) ?? (return { ok = false; url = ""; detail = "Ticket unavailable" })) or not projectAccess(m, c.projectId)) return { ok = false; url = ""; detail = "No access" };
    let linkRevision = customerLinkRevisions.get(id) ?? 0;
    if (revoke) { customerLinkRevisions.add(id, linkRevision + 1); customerContacts.add(id, { c with tokenHash = ""; expiresAt = 0 }); return { ok = true; url = ""; detail = "Previous link revoked" } };
    let secret = hex(await ic00.raw_rand());
    let current = customerContacts.get(id) ?? (return { ok = false; url = ""; detail = "Ticket not found" });
    let after = staff(tok) ?? (return { ok = false; url = ""; detail = "Access changed" });
    if (m.id != after.id or customerDue(tickets.get(id) ?? (return { ok = false; url = ""; detail = "Ticket unavailable" })) or not projectAccess(after, c.projectId) or c.tokenHash != current.tokenHash or (customerLinkRevisions.get(id) ?? 0) != linkRevision) return { ok = false; url = ""; detail = "Ticket or access changed. Retry." };
    customerLinkRevisions.add(id, linkRevision + 1);
    customerContacts.add(id, { current with tokenHash = digest(secret); expiresAt = now() + 90 * D });
    log(m.email, "Replaced private customer link for ticket " # Nat.toText(id));
    { ok = true; url = customerUrl(id, secret); detail = "Previous link revoked. New link expires in 90 days." };
  };
  func customerUrl(id : Nat, secret : Text) : Text = Text.trimEnd(appUrl, #char '/') # "/support.html#ticket/" # Nat.toText(id) # "/" # secret;
  func customerQuota(id : Nat) : Bool {
    let hour = now() / H; let day = now() / D;
    let q = customerQuotas.get(id) ?? ({ hour; hourly = 0; day; daily = 0 });
    let hourly = if (q.hour == hour) q.hourly else 0; let daily = if (q.day == day) q.daily else 0;
    if (hourly >= 30 or daily >= 200) return false;
    customerQuotas.add(id, { hour; day; hourly = hourly + 1; daily = daily + 1 }); true;
  };
  func customerJson(t : Ticket) : Json.Json {
    let c = customerContacts.get(t.id) ?? (return #null_);
    let p = customerProjects.get(c.projectId) ?? (return #null_);
    let comments = List.empty<Json.Json>();
    for (eid in (ticketEvents.get(t.id) ?? []).vals()) {
      switch (events.get(eid)) { case (?e) { if (e.kind == "comment") comments.add(Json.obj([("id", Json.int(e.id)), ("at", #string(Int.toText(e.at / 1_000_000))), ("author", #string(if (e.actorKind == "agent") "Support team" else c.name)), ("body", #string(e.body))])) }; case null {} };
    };
    Json.obj([("id", Json.int(t.id)), ("key", #string(t.key)), ("project", #string(p.name)), ("subject", #string(t.subject)), ("body", #string(t.body)), ("status", #string(t.status)), ("waitingOn", #string(t.waitingOn)), ("requestType", switch (customerWorkflows.get(t.id)) { case (?w) Json.obj([("id", Json.int(w.definition.id)), ("name", #string(w.definition.name))]); case null #null_ }), ("outcome", #string(switch (customerWorkflows.get(t.id)) { case (?w) w.outcome; case null "" })), ("fields", Json.obj(t.fields.map(func (k, v) = (k, #string(v))))), ("comments", #array(comments.toArray())), ("linkExpiresAt", #string(Int.toText(c.expiresAt / 1_000_000))), ("deleteAt", #string(Int.toText(retentionAt(t, privacyPolicy(c.projectId)) / 1_000_000))), ("privacy", privacyJson(c.projectId))]);
  };
  func customerMessageRoom(id : Nat) : Bool = (ticketEvents.get(id) ?? []).size() < 100 and customerStoredBytes < MAX_CUSTOMER_BYTES;
  func customerResponse(code : Nat16, body : Json.Json, origin : Text) : HttpGwResponse = {
    status_code = code; upgrade = null; body = Text.encodeUtf8(Json.stringify(body, null));
    headers = Array.concat([("Content-Type", "application/json; charset=utf-8"), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer"), ("Vary", "Origin")], if (origin == "") [] else [("Access-Control-Allow-Origin", origin), ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"), ("Access-Control-Allow-Headers", "Authorization, Content-Type"), ("Access-Control-Max-Age", "600")]);
  };
  func customerHttp<system>(req : HttpGwRequest) : HttpGwResponse {
    let origin = headerOf(req.headers, "origin");
    let appOrigin = Text.trimEnd(appUrl, #char '/');
    var allowedOrigin = if (origin == appOrigin and Customers.origin(origin)) origin else "";
    func err(code : Nat16, text : Text) : HttpGwResponse = customerResponse(code, Json.obj([("error", #string(text))]), allowedOrigin);
    if (req.url.size() > 400 or req.headers.size() > 40 or req.body.size() > 32_000) return err(413, "Request too large");
    let parts = Text.split(req.url, #char '/').toArray();
    if (parts.size() < 6 or parts[0] != "" or parts[1] != "support" or parts[2] != "v1") return err(404, "Not found");
    let mode = parts[3];
    let bearer = Text.stripStart(headerOf(req.headers, "authorization"), #text "Bearer ") ?? "";
    var p : ?CustomerProject = null;
    var key : ?Customers.Key = null;
    var ticketId : Nat = 0;
    if (mode == "widgets") {
      p := customerProjects.values().find(func x = x.widgetId == parts[4] and x.widgetEnabled and x.enabled);
      let project = p ?? (return err(404, "This support form is unavailable"));
      if (has(project.origins, origin)) allowedOrigin := origin;
      // Origin limits browser integrations. It is not authentication; public intake is deliberately public.
      if (origin != "" and allowedOrigin == "") return err(403, "Website origin is not enabled");
    } else if (mode == "projects") {
      p := customerProjects.get(Nat.fromText(parts[4]) ?? 0);
      let project = p ?? (return err(404, "Project not found"));
      if (origin != "") return err(403, "Secret API keys are for server-to-server use only");
      if (Customers.token(bearer)) key := customerKeys.values().find(func k = k.projectId == project.id and not k.revoked and k.expiresAt > now() and k.hash == digest(bearer));
      if (key == null) return err(401, "Invalid or expired API key");
    } else if (mode == "customer" and parts[4] == "tickets") {
      ticketId := Nat.fromText(parts[5]) ?? 0;
      let c = customerContacts.get(ticketId) ?? (return err(404, "Ticket link is invalid or expired"));
      if (origin != "" and allowedOrigin == "") return err(403, "Open your private link in Desk");
      // Preflight has no bearer. It does not return ticket data.
      if (req.method == "OPTIONS") return customerResponse(204, #null_, allowedOrigin);
      if (not Customers.token(bearer) or c.expiresAt <= now() or c.tokenHash != digest(bearer)) return err(404, "Ticket link is invalid or expired");
      p := customerProjects.get(c.projectId);
    } else return err(404, "Not found");
    let project = p ?? (return err(404, "Project not found"));
    if (req.method == "OPTIONS") return customerResponse(204, #null_, allowedOrigin);
    func permits(scope : Text) : Bool = switch (key) { case (?k) has(k.scopes, scope); case null false };
    if ((mode == "widgets" or mode == "projects") and parts.size() == 6 and parts[5] == "schema" and req.method == "GET") return customerResponse(200, customerSchema(project), allowedOrigin);
    if (mode == "projects" and parts.size() >= 7 and parts[5] == "tickets") ticketId := Nat.fromText(parts[6]) ?? 0;
    if (ticketId > 0) {
      let t = tickets.get(ticketId) ?? (return err(404, "Ticket not found"));
      if (projectOf(ticketId) != project.id or customerDue(t)) return err(404, "Ticket not found");
      let baseSize = if (mode == "customer") 6 else 7;
      if (mode == "customer" and parts.size() == baseSize + 1 and parts[baseSize] == "export" and req.method == "GET") {
        let c = customerContacts.get(ticketId) ?? (return err(404, "Ticket unavailable"));
        return customerResponse(200, Json.obj([("contact", Json.obj([("name", #string(c.name)), ("email", #string(c.email))])), ("conversation", customerJson(t))]), allowedOrigin);
      };
      if (parts.size() == baseSize and req.method == "GET") {
        if (mode != "customer" and not permits("tickets:read")) return err(403, "Requires tickets:read");
        return customerResponse(200, customerJson(t), allowedOrigin);
      };
      if (parts.size() == baseSize + 1 and parts[baseSize] == "replies" and req.method == "POST") {
        if (mode != "customer" and not permits("tickets:reply")) return err(403, "Requires tickets:reply");
        let raw = Text.decodeUtf8(req.body) ?? (return err(400, "Invalid UTF-8"));
        if (not Customers.shallow(raw)) return err(400, "Invalid JSON");
        let j = switch (Json.parse(Hub.sanitizeSurrogates(raw))) { case (#ok(j)) j; case _ return err(400, "Invalid JSON") };
        let b = norm(jStr(j, "body"));
        let requestId = jStr(j, "requestId");
        if (not Customers.token(requestId)) return err(400, "requestId must be 32 random bytes encoded as 64 lowercase hex characters");
        let replyKey = Nat.toText(ticketId) # ":" # digest(requestId);
        switch (customerReplyRetries.get(replyKey)) { case (?previous) {
          if (previous != digest(b)) return err(409, "requestId already used for another reply");
          return customerResponse(200, customerJson(t), allowedOrigin);
        }; case null {} };
        if (not customerMessageRoom(ticketId)) return err(429, "Conversation limit reached. Please contact support with a new request.");
        if (now() - (customerReplyAt.get(ticketId) ?? 0) < 10_000_000_000) return err(429, "Please wait 10 seconds before replying again");

        if (b.size() == 0 or b.size() > 2000) return err(400, "Reply: 1–2000 characters");
        if (t.status == "closed") return err(409, "This ticket is closed. Please create a new request.");
        customerReplyRetries.add(replyKey, digest(b));
        accountCustomer(ticketId, Text.encodeUtf8(b).size());
        customerReplyAt.add(ticketId, now());
        addCommentInternal<system>(t, t.requester, b, false, false);
        return customerResponse(201, customerJson(tickets.get(ticketId) ?? t), allowedOrigin);
      };
      return err(404, "Not found");
    };
    if (parts.size() != 6 or parts[5] != "tickets" or req.method != "POST" or mode == "customer") return err(404, "Not found");
    if (mode == "projects" and not permits("tickets:create")) return err(403, "Requires tickets:create");
    if (not project.enabled) return err(409, "New requests are paused");
    if (appUrl == "" or not Customers.origin(appOrigin)) return err(503, "Desk needs a canonical HTTPS address before accepting customers");
    let raw = Text.decodeUtf8(req.body) ?? (return err(400, "Invalid UTF-8"));
    if (not Customers.shallow(raw)) return err(400, "Invalid JSON");
    let j = switch (Json.parse(Hub.sanitizeSurrogates(raw))) { case (#ok(j)) j; case _ return err(400, "Invalid JSON") };
    let entries = switch (j) { case (#object_(xs)) xs; case _ return err(400, "Expected a JSON object") };
    var seen : [Text] = [];
    for ((k, _) in entries.vals()) {
      if (not has(["name", "email", "subject", "body", "fields", "revision", "clientToken", "typeId"], k) or has(seen, k)) return err(400, "Unknown or duplicate property: " # k);
      seen := Array.concat(seen, [k]);
    };
    let secret = jStr(j, "clientToken");
    if (not Customers.token(secret)) return err(400, "clientToken must be 32 random bytes encoded as 64 lowercase hex characters");
    let retryKey = Nat.toText(project.id) # ":" # digest(secret);
    switch (customerErasedRetries.get(retryKey)) { case (?until) { if (until > now()) return err(409, "This request was deleted. Do not retry this submission.") }; case null {} };
    let fingerprint = digest(Json.stringify(j, null));
    func created(id : Nat, code : Nat16) : HttpGwResponse = customerResponse(code, Json.obj([("id", Json.int(id)), ("key", #string(nextKey(id))), ("url", #string(customerUrl(id, secret))), ("expiresInDays", Json.int(90))]), allowedOrigin);
    switch (customerRetries.get(retryKey)) { case (?id) {
      let c = customerContacts.get(id) ?? (return err(409, "Request no longer available"));
      if (customerDue(tickets.get(id) ?? (return err(409, "Request unavailable"))) or c.fingerprint != fingerprint or c.tokenHash != digest(secret) or c.expiresAt <= now()) return err(409, "This clientToken was already used. Do not reuse it for a different request.");
      return created(id, 200);
    }; case null {} };
    let revision = switch (Json.getAsNat(j, "revision")) { case (#ok(n)) n; case _ 0 };
    if (revision != project.revision) return err(409, "The form changed. Reload the schema before submitting.");
    let name = norm(jStr(j, "name")); let email = lower(norm(jStr(j, "email"))); let subject = norm(jStr(j, "subject")); let body = norm(jStr(j, "body"));
    if (name.size() == 0 or name.size() > 100 or email.size() > 254 or email.size() < 3 or not Text.contains(email, #char '@') or Text.contains(email, #char ' ') or Text.contains(email, #char '\n')) return err(400, "Name and a valid contact email are required");
    if (subject.size() == 0 or subject.size() > 160 or body.size() == 0 or body.size() > 8_000) return err(400, "Subject: 1–160 characters; message: 1–8000 characters");
    let values = List.empty<(Text, Text)>();
    switch (Json.get(j, "fields")) { case (?#object_(xs)) { for ((k, v) in xs.vals()) { switch (v) { case (#string(s)) values.add((k, s)); case _ return err(400, "Field values must be strings") } } }; case null {}; case _ return err(400, "fields must be an object") };
    let selectedId = switch (Json.get(j, "typeId")) { case null project.typeId; case (_) switch (Json.getAsNat(j, "typeId")) { case (#ok(n)) n; case _ return err(400, "typeId must be a request type ID from this project") } };
    let selected = projectTypes(project).find(func w = w.id == selectedId and w.enabled) ?? (return err(400, "Request type is unavailable in this project"));
    let validation = Customers.fields(selected.fields, values.toArray());
    if (validation != "") return err(400, validation);
    let storageCost = req.body.size() + Text.encodeUtf8(Json.stringify(Workflows.review(Workflows.start(selected)), null)).size();
    if (customerStoredBytes + storageCost > MAX_CUSTOMER_BYTES) return err(503, "Customer storage limit reached. Contact the support operator.");
    if (customerErasures.size() >= 50_000) return err(503, "Deletion journal capacity reached. Contact the support operator.");
    if (customerContacts.size() >= 10_000) return err(503, "Customer ticket storage limit reached. Contact the support operator.");
    if (not customerQuota(project.id)) return err(429, "This project reached its intake limit. Please try again later.");
    // No Hub identity lookup, AI triage, lifecycle matching or email notification.
    let id = createInternal<system>(workflowType(project, selected), "customer:" # Nat.toText(nextTicketId), subject, body, values.toArray(), selected.priority, if (mode == "widgets") "widget" else "customer-api", "customer:" # Nat.toText(nextTicketId), "requester", true);
    customerContacts.add(id, { projectId = project.id; name; email; tokenHash = digest(secret); expiresAt = now() + 90 * D; fingerprint; schema = selected.fields });
    customerWorkflows.add(id, Workflows.start(selected));
    if (selected.steps.size() > 0 and selected.steps[0].group != "") { let t = tickets.get(id) ?? (return err(500, "Ticket unavailable")); tickets.add(id, { t with queue = selected.steps[0].group }) };
    customerCosts.add(id, storageCost); customerStoredBytes += storageCost;
    customerRetries.add(retryKey, id);
    notifyQueue<system>(tickets.get(id) ?? (return err(500, "Ticket could not be created")), "Customer request · " # nextKey(id) # " " # subject, nextKey(id) # ":new");
    created(id, 201);
  };

  // ---- Directory follow-up: private, durable cases linked to stable people ----
  public type LifecycleCase = {
    personId : Text; name : Text; email : Text; lastEvent : Nat; detectedAt : Int;
    source : Text; effectiveActive : Bool;
    state : { #review; #offboarding; #notDeparture; #reactivated };
    decidedBy : Text; note : Text;
  };
  let lifecycleCases = Map.empty<Nat, LifecycleCase>();
  let internalTickets = Map.empty<Nat, Bool>();
  var lifecycleCursor : Nat = 0;
  var lifecycleCheckedAt : Int = 0;
  var lifecycleError : Text = "";
  var lifecycleGap : Bool = false;
  transient var lifecycleRunning = false;
  // Capture the installed template once; display-name changes must not break routing.
  var offboardingTemplateId : ?Nat = switch (types.values().find(func t = Text.toLower(Text.trim(t.name, #char ' ')) == "offboarding")) { case (?t) ?t.id; case null null };
  func isInternal(id : Nat) : Bool = internalTickets.get(id) ?? false;
  func ticketSubject(t : Ticket) : Text {
    switch (lifecycleCases.get(t.id)) { case (?c) return c.personId; case null {} };
    let person = fieldValue(t.fields, "person");
    if (person != "" and Hub.personById(people, ids, former, person).known) return person;
    t.requester;
  };
  func offboardingType() : ?RequestType {
    switch (offboardingTemplateId) { case (?id) typeOf(id); case null types.values().find(func t = lower(norm(t.name)) == "offboarding") };
  };
  func isOffboardingType(rt : RequestType) : Bool = switch (offboardingType()) { case (?t) t.id == rt.id; case null false };
  func lifecycleTicket(person : Text, includeDone : Bool) : ?Ticket {
    for ((id, t) in tickets.reverseEntries()) {
      let isOffboarding = switch (typeOf(t.typeId)) { case (?rt) isOffboardingType(rt); case null false };
      if ((includeDone or (t.status != "closed" and t.status != "resolved")) and (lifecycleCases.containsKey(id) or isOffboarding) and ticketSubject(t) == person) return ?t;
    };
    null;
  };
  func reviewType() : RequestType {
    switch (types.values().find(func rt = rt.name == "Account review" and not rt.enabled)) { case (?rt) return rt; case null {} };
    let id = nextTypeId; nextTypeId += 1;
    let rt : RequestType = { id; name = "Account review"; icon = "◉"; description = "Internal follow-up for a directory change"; fields = []; checklist = []; queue = switch (offboardingType()) { case (?t) t.queue; case null "" }; approval = "none"; defaultPriority = "high"; respondH = 0; resolveH = 0; dueField = ""; visibility = "agents"; enabled = false; sortOrder = 999 };
    types.add(id, rt); rt;
  };
  func receiveLifecycle<system>(event : Support.Event) {
    let existing = lifecycleTicket(event.personId, event.kind == #reactivated);
    if (event.kind == #reactivated and existing == null) return;
    let id = switch (existing) {
      case (?t) t.id;
      case null {
        let id = createInternal<system>(reviewType(), "system", "Account deactivated · " # event.name, "A directory account was deactivated without an open offboarding request. Confirm whether this is a departure before arranging handovers or removing data.", [], "high", "directory", "system", "system", true);
        internalTickets.add(id, true); id;
      };
    };
    let previous = lifecycleCases.get(id);
    if (switch (previous) { case (?c) c.lastEvent >= event.seq; case null false }) return;
    let state = if (event.kind == #reactivated) { switch (previous) { case (?c) if (c.state == #notDeparture) #notDeparture else #reactivated; case null #reactivated } } else switch (previous) { case (?c) if (c.state == #offboarding) #offboarding else #review; case null if (existing != null) #offboarding else #review };
    lifecycleCases.add(id, { personId = event.personId; name = event.name; email = event.email; lastEvent = event.seq; detectedAt = event.at; source = event.source; effectiveActive = event.effectiveActive; state; decidedBy = switch(previous) {case (?c) c.decidedBy;case null ""}; note = switch(previous) {case (?c) c.note;case null ""} });
    ignore addEvent(id, "system", "system", "lifecycle", (if (event.kind == #reactivated) "Account reactivated; review remaining offboarding work." else "Account deactivation received.") # " " # event.source # (if (event.effectiveActive) " Hub access remains active — check other sources or overrides." else " Hub access is inactive. External app sessions require their own verification."), []);
    switch (tickets.get(id)) {
      case (?t) {
        let waiting = state == #reactivated;
        let updated = { t with updatedAt = nextTicketRevision(t.id); status = if (waiting) "waiting" else t.status; waitingOn = if (waiting) "third-party" else t.waitingOn; resolvedAt = if (waiting) null else t.resolvedAt; closedAt = if (waiting) null else t.closedAt };
        tickets.add(id, updated);
        notifyOwners<system>(updated, (if (event.kind == #reactivated) "Account reactivated · " else "Account deactivated · ") # event.name, "lifecycle:" # event.seq.toText());
      };
      case null {};
    };
  };
  type SupportHub = actor {
    hub_lifecycleEvents : shared query Nat -> async Support.Batch;
    hub_supportSources : shared query Text -> async [Support.Source];
    hub_supportContext : shared (Text, Text, Nat) -> async Support.Context;
  };
  func pollLifecycle() : async () {
    if (hubId == "" or lifecycleRunning or not Hub.directoryFresh(lastDirectoryPull)) return;
    lifecycleRunning := true;
    let expectedHub = hubId;
    try {
      let hub : SupportHub = actor (expectedHub);
      let batch = await (with timeout = 15) hub.hub_lifecycleEvents(lifecycleCursor);
      if (hubId != expectedHub) return;
      if (batch.gap) lifecycleGap := true;
      for (event in batch.events.vals()) if (event.seq > lifecycleCursor) {
        receiveLifecycle<system>(event);
        lifecycleCursor := event.seq;
      };
      lifecycleCursor := Nat.max(lifecycleCursor, batch.cursor);
      lifecycleCheckedAt := now(); lifecycleError := "";
    } catch (_) { lifecycleError := "Directory follow-up is unavailable. Events will be retried automatically; check Hub and Desk versions if this persists." }
    finally { lifecycleRunning := false };
  };
  public shared func syncLifecycle(tok : Text) : async Bool {
    if (staff(tok) == null) return false;
    try { ignore await pullDirectory() } catch (_) {};
    await pollLifecycle(); lifecycleError == "";
  };
  public shared query func lifecycleHealth(tok : Text) : async ?{ checkedAt : Int; detail : Text; gap : Bool } {
    if (staff(tok) == null) return null;
    ?{ checkedAt = lifecycleCheckedAt; detail = lifecycleError; gap = lifecycleGap };
  };
  public shared func decideLifecycle(tok : Text, id : Nat, expectedEvent : Nat, departure : Bool, note : Text) : async { ok : Bool; detail : Text } {
    let m = staff(tok) ?? (return { ok = false; detail = "Agents only" });
    let c = lifecycleCases.get(id) ?? (return { ok = false; detail = "No directory follow-up on this ticket" });
    let t = tickets.get(id) ?? (return { ok = false; detail = "Ticket unavailable" });
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    if (c.lastEvent != expectedEvent or (c.state != #review and c.state != #reactivated)) return { ok = false; detail = "This review changed. Refresh the ticket before deciding." };
    if (note.size() > 1000 or (not departure and norm(note) == "")) return { ok = false; detail = "Add a short reason (up to 1,000 characters)" };
    if (departure) {
      let rt = offboardingType() ?? (return { ok = false; detail = "Create or enable the Offboarding request type first" });
      if (not rt.enabled) return { ok = false; detail = "Enable the Offboarding request type first" };
      let prepared = prepareOffboarding<system>(t, rt, c.personId);
      let pending = switch (approvals.get(id)) { case (?a) a.state == "pending"; case null false };
      tickets.add(id, { prepared with subject = if (isInternal(id)) "Offboarding · " # c.name else t.subject; status = if (pending) "waiting" else "open"; waitingOn = if (pending) "approval" else ""; resolvedAt = null; closedAt = null; updatedAt = nextTicketRevision(id) });
      // Keep existing work; add the existing template only for an unplanned case.
      if (not ticketTasks.containsKey(id)) ticketTasks.add(id, rt.checklist.map(func title = { title; state = "open"; by = ""; at = 0 }));
    } else {
      // Never discard an existing HR request or outstanding work silently.
      let canClose = isInternal(id) and openTasks(id) == 0;
      tickets.add(id, { t with status = if (canClose) "resolved" else "waiting"; waitingOn = if (canClose) "" else "third-party"; resolvedAt = if (canClose) ?now() else null; updatedAt = nextTicketRevision(id) });
    };
    switch (tickets.get(id)) { case (?current) tickets.add(id, { current with updatedAt = nextTicketRevision(id) }); case null {} };
    lifecycleCases.add(id, { c with state = if (departure) #offboarding else #notDeparture; decidedBy = m.id; note = norm(note) });
    ignore addEvent(id, m.id, "agent", "lifecycle", (if (departure) "Departure confirmed. " else "Not a departure. ") # norm(note), []);
    { ok = true; detail = "" };
  };
  public shared query func offboardingEntry(tok : Text, personId : Text) : async ?{ person : PersonCard; ticketId : ?Nat; typeId : ?Nat } {
    if (staff(tok) == null) return null;
    let person = card(personId);
    if (not person.known) return null;
    ?{ person; typeId = switch (offboardingType()) { case (?rt) ?rt.id; case null null }; ticketId = switch (lifecycleTicket(personId, false)) { case (?t) ?t.id; case null null } };
  };
  func mergeOffboarding<system>(rt : RequestType, requester : Text, subject : Text, body : Text, fields : [(Text, Text)], by : Text) : ?Nat {
    if (not isOffboardingType(rt)) return null;
    let converted = personFieldsToIds(rt, knownFields(rt, fields));
    let person = fieldValue(converted, "person");
    if (person == "") return null;
    let existing = lifecycleTicket(person, false) ?? (return null);
    if (isInternal(existing.id)) {
      // A real request can join an automatic review. Only that requester gains
      // its normal portal view; directory events/context remain staff-only.
      internalTickets.remove(existing.id);
      let updated = prepareOffboarding<system>({ existing with requester; subject = capText(norm(subject), 160); body = capText(body, 20_000); fields = converted }, rt, person);
      tickets.add(existing.id, { updated with updatedAt = nextTicketRevision(existing.id) });
    };
    ignore addEvent(existing.id, by, "agent", "note", "Offboarding request linked to this existing case. " # body, []);
    notifyOwners<system>(existing, "Offboarding request received · " # existing.key, "offboarding-linked:" # existing.id.toText() # ":" # nextEventId.toText());
    ?existing.id;
  };
  func prepareOffboarding<system>(t : Ticket, rt : RequestType, person : Text) : Ticket {
    let fields = if (fieldValue(t.fields, "person") == "") t.fields.concat([("person", person)]) else t.fields;
    var dueAt = t.dueAt;
    if (rt.dueField != "") { switch (parseIsoNs(fieldValue(fields, rt.dueField))) { case (?at) dueAt := ?at; case null {} } };
    var updated = { t with typeId = rt.id; fields; queue = rt.queue; dueAt; respondBy = if (t.respondBy == null and rt.respondH > 0) ?(now() + rt.respondH * H) else t.respondBy };
    if (not approvals.containsKey(t.id) and rt.approval != "none") {
      let approver = if (rt.approval == "manager") { switch (managerOf(emailOfPid(person))) { case (?m) pidOf(m); case null "role:admin" } } else rt.approval;
      approvals.add(t.id, { approver; state = "pending"; decidedBy = ""; at = now(); note = "" });
      updated := { updated with status = "waiting"; waitingOn = "approval" };
      ignore addEvent(t.id, "system", "system", "approval", "approval requested from " # approverLabel(approver), [("approver", approver)]);
      let who = if (approver == "role:admin") staffEmails().filter(func email = roleOf(email) == "admin") else if (Text.startsWith(approver, #text "group:")) membersOf(groupName(approver)) else [approver];
      notify<system>(who, "Approval needed · " # t.key # " " # t.subject, t.id, "approval", t.key # ":approval");
    };
    updated;
  };
  public shared query func personOverview(tok : Text, id : Nat) : async ?{ person : PersonCard; related : [TicketRow]; lifecycle : ?LifecycleCase } {
    let m = staff(tok) ?? (return null);
    let t = tickets.get(id) ?? (return null);
    if (not canSee(m, t) or projectOf(id) != 0) return null;
    let pid = ticketSubject(t);
    let related = List.empty<TicketRow>();
    for ((tid, other) in tickets.reverseEntries()) if (projectOf(tid) == 0 and tid != id and (ticketSubject(other) == pid or other.requester == pid or other.assignee == pid) and canSee(m, other) and related.size() < 30) related.add(row(other));
    var person = card(pid);
    switch (lifecycleCases.get(id)) { case (?c) { if (not person.known) person := { person with id = pid; displayName = c.name; email = c.email; active = c.effectiveActive; known = true } }; case null {} };
    ?{ person; related = related.toArray(); lifecycle = lifecycleCases.get(id) };
  };
  public shared func personContextSources(tok : Text, id : Nat) : async [Support.Source] {
    let m = staff(tok) ?? (return []);
    let t = tickets.get(id) ?? (return []);
    if (not canSee(m, t) or projectOf(id) != 0 or hubId == "") return [];
    let expectedHub = hubId;
    let hub : SupportHub = actor (expectedHub);
    let sources = await (with timeout = 15) hub.hub_supportSources(m.id);
    if (hubId != expectedHub or staff(tok) == null) return [];
    sources;
  };
  public shared func personContext(tok : Text, id : Nat, cid : Nat) : async Support.Context {
    let m = staff(tok) ?? (return Support.denied());
    let t = tickets.get(id) ?? (return Support.denied());
    if (not canSee(m, t) or projectOf(id) != 0 or hubId == "") return Support.denied();
    let subject = ticketSubject(t); let expectedHub = hubId;
    let hub : SupportHub = actor (expectedHub);
    let result = try { await (with timeout = 20) hub.hub_supportContext(m.id, subject, cid) } catch (_) { Support.unavailable() };
    let current = tickets.get(id) ?? (return Support.denied());
    if (hubId != expectedHub or staff(tok) == null or ticketSubject(current) != subject) return Support.denied();
    result;
  };

  let hardwareProgress = Map.empty<Nat, { context : Hardware.Case; progress : Hardware.Progress }>();
  transient var hardwareRunning = false;
  var hardwareSweepAfter : Nat = 0;
  func hardwareCaseOf(t : Ticket) : ?Hardware.Case {
    if (projectOf(t.id) != 0) return null;
    let lifecycle = lifecycleCases.get(t.id);
    let offboarding = switch (typeOf(t.typeId)) { case (?rt) isOffboardingType(rt); case null false };
    if (not offboarding and lifecycle == null) return null;
    let person = ticketSubject(t);
    if (person == "") return null;
    var state = if (offboarding) "active" else "review";
    switch (lifecycle) {
      case (?c) { state := switch (c.state) { case (#offboarding) "active"; case (#notDeparture) "cancelled"; case (#reactivated) "paused"; case (#review) "review" } };
      case null {};
    };
    switch (approvals.get(t.id)) { case (?a) { if (a.state == "pending") state := "paused"; if (a.state == "rejected" or a.state == "cancelled") state := "cancelled" }; case null {} };
    if ((t.status == "resolved" or t.status == "closed") and state == "active") state := "closed";
    ?{ desk = Principal.fromActor(Desk).toText(); ticket = t.id; key = t.key; url = ""; person; state; revision = t.updatedAt; dueAt = t.dueAt };
  };
  public shared query ({ caller }) func hub_hardwareCase(id : Nat) : async ?Hardware.Case {
    assert Hub.isHub(caller, hubId);
    hardwareCaseOf(tickets.get(id) ?? (return null));
  };
  type HardwareHub = actor { hub_syncHardware : shared Hardware.Case -> async Hardware.Progress };
  func syncHardware(id : Nat) : async Hardware.Progress {
    let t = tickets.get(id) ?? (return Hardware.unavailable());
    let c = hardwareCaseOf(t) ?? (return Hardware.unavailable());
    let expectedHub = hubId;
    if (expectedHub == "") return Hardware.unavailable();
    let h : HardwareHub = actor (expectedHub);
    let progress = try { await (with timeout = 30) h.hub_syncHardware(c) } catch (_) { Hardware.unavailable() };
    let current = tickets.get(id) ?? (return Hardware.unavailable());
    if (hubId != expectedHub or hardwareCaseOf(current) != ?c) return Hardware.unavailable();
    // A removed connector must not turn a previously populated case into zero work.
    let previousSources = switch (hardwareProgress.get(id)) { case (?p) p.progress.sources; case null 0 };
    let bindings = switch (hardwareProgress.get(id)) { case (?p) p.progress.bindings; case null [] };
    let verified = if (progress.state == "ready" and progress.sources >= previousSources and bindings.all(func key = progress.bindings.any(func current = current == key))) progress else ({ state = "unavailable"; sources = previousSources; bindings; total = 0; open = 0; checkedAt = 0 });
    hardwareProgress.add(id, { context = c; progress = verified });
    // Bind only the shipped hardware task; custom operator checklists retain their meaning.
    if (verified.sources > 0) switch (ticketTasks.get(id)) {
      case (?tasks) {
        var changed = false;
        let updated = tasks.map(func task {
          if (task.title != "Reclaim devices") return task;
          let state = if (c.state == "cancelled") "na" else if (verified.state == "ready" and verified.open == 0 and (c.state == "active" or c.state == "closed")) "done" else "open";
          if (task.state == state and task.by == "system:assets") return task;
          changed := true; { task with state; by = "system:assets"; at = now() };
        });
        if (changed) {
          ticketTasks.add(id, updated);
          ignore addEvent(id, "system", "system", "task", "Hardware checklist synchronized from Assets; physical custody is recorded on each device.", []);
        };
      };
      case null {};
    };

    verified;
  };
  func hardwareBlock(t : Ticket) : Text {
    let c = hardwareCaseOf(t) ?? (return "");
    if (c.state == "cancelled") return "";
    if (c.state == "paused" or c.state == "review") return "Review the account change or approval before closing this offboarding";
    let p = hardwareProgress.get(t.id) ?? (return "Check hardware in the person panel before closing this offboarding");
    if (p.context.person != c.person or p.context.revision != c.revision or p.progress.state != "ready" or now() - p.progress.checkedAt > 60_000_000_000) return "Hardware could not be verified. Refresh the person panel and retry.";
    if (p.progress.open > 0) return p.progress.open.toText() # " hardware position(s) still need a confirmed return, handover, completed sale or documented exception in Assets";
    "";
  };
  public shared func offboardingHardware(tok : Text, id : Nat) : async ?{ context : Hardware.Case; progress : Hardware.Progress } {
    let m = staff(tok) ?? (return null);
    let t = tickets.get(id) ?? (return null);
    if (not canSee(m, t) or hardwareCaseOf(t) == null) return null;
    let result = await syncHardware(id);
    let current = tickets.get(id) ?? (return null);
    let viewer = staff(tok) ?? (return null);
    if (viewer.id != m.id or not canSee(viewer, current) or ticketSubject(current) != ticketSubject(t)) return null;
    ?{ context = hardwareCaseOf(current) ?? (return null); progress = result };
  };
  public shared func cancelOffboarding(tok : Text, id : Nat, revision : Int, note : Text) : async { ok : Bool; detail : Text } {
    let m = staff(tok) ?? (return { ok = false; detail = "Agents only" });
    if (migrating()) return { ok = false; detail = MIGRATING };
    let t = tickets.get(id) ?? (return { ok = false; detail = "Ticket unavailable" });
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    let c = hardwareCaseOf(t) ?? (return { ok = false; detail = "Not an internal offboarding" });
    if (c.revision != revision or c.state == "closed" or c.state == "cancelled") return { ok = false; detail = "This case changed. Refresh before cancelling." };
    if (norm(note).size() < 10 or note.size() > 1000) return { ok = false; detail = "Explain why the departure is cancelled (10–1,000 characters)" };
    let p = card(c.person);
    let fallback : LifecycleCase = { personId = c.person; name = p.displayName; email = p.email; lastEvent = 0; detectedAt = now(); source = "Desk request"; effectiveActive = p.active; state = #offboarding; decidedBy = ""; note = "" };
    let previous = lifecycleCases.get(id) ?? fallback;
    lifecycleCases.add(id, { previous with state = #notDeparture; decidedBy = m.id; note = norm(note) });
    switch (approvals.get(id)) { case (?a) { if (a.state == "pending") approvals.add(id, { a with state = "cancelled"; decidedBy = m.id; at = now(); note = norm(note) }) }; case null {} };
    put({ t with status = "closed"; waitingOn = ""; closedAt = ?now() });
    ignore addEvent(id, m.id, "agent", "lifecycle", "Offboarding cancelled: " # norm(note) # ". Recorded physical handovers remain unchanged.", []);
    // Persist the decision before attempting delivery; the timer retries outages.
    ignore syncHardware(id);
    { ok = true; detail = "Offboarding cancelled. Existing physical handovers are preserved." };
  };

  func sweepHardware() : async () {
    if (hardwareRunning or hubId == "" or not Hub.directoryFresh(lastDirectoryPull)) return;
    hardwareRunning := true;
    try {
      let selected = List.empty<Nat>();
      for ((id, t) in tickets.entries()) if (id > hardwareSweepAfter and hardwareCaseOf(t) != null and ((t.status != "closed" and t.status != "resolved") or (switch (hardwareProgress.get(id)) { case (?p) (p.context.state != "closed" and p.context.state != "cancelled") or p.progress.state != "ready"; case null false })) and selected.size() < 10) selected.add(id);
      if (selected.size() == 0) hardwareSweepAfter := 0;
      for (id in selected.values()) { hardwareSweepAfter := id; ignore await syncHardware(id) };
    } finally { hardwareRunning := false };
  };

  // =====================================================================
  // helpers
  // =====================================================================
  func lower(t : Text) : Text = Text.toLower(t);
  func norm(t : Text) : Text = Text.trim(t, #char ' ');
  func now() : Int = Time.now();

  func hex(b : Blob) : Text {
    func digit(n : Nat) : Text = Char.toText(Nat32.toChar(Nat.toNat32(if (n < 10) 48 + n else 87 + n)));
    var t = "";
    for (x in Blob.toArray(b).vals()) { let n = Nat8.toNat(x); t #= digit(n / 16) # digit(n % 16) };
    t;
  };

  func has(xs : [Text], x : Text) : Bool { for (y in xs.vals()) if (y == x) return true; false };

  func log(who : Text, what : Text) {
    Map.add(adminLog, Nat.compare, nextLogId, { at = now(); who; what });
    nextLogId += 1;
    if (nextLogId > 2000) ignore Map.delete(adminLog, Nat.compare, nextLogId - 2000 : Nat);
  };

  func capText(t : Text, n : Nat) : Text {
    if (t.size() <= n) return t;
    var out = "";
    var i = 0;
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

  /// ISO yyyy-mm-dd → ns since epoch (midnight UTC); null when unparseable.
  func parseIsoNs(iso : Text) : ?Int {
    let s = norm(iso);
    if (s.size() != 10) return null;
    let parts = Text.split(s, #char '-').toArray();
    if (parts.size() != 3) return null;
    func num(t : Text) : ?Nat {
      var n = 0;
      if (t.size() == 0) return null;
      for (c in t.chars()) { if (c < '0' or c > '9') return null; n := n * 10 + Nat32.toNat(Char.toNat32(c) - 48) };
      ?n;
    };
    let y = switch (num(parts[0])) { case (?v) v; case null return null };
    let m = switch (num(parts[1])) { case (?v) v; case null return null };
    let d = switch (num(parts[2])) { case (?v) v; case null return null };
    if (m < 1 or m > 12 or d < 1 or d > 31 or y < 1970 or y > 2200) return null;
    // days from civil (Howard Hinnant)
    let yy : Int = if (m <= 2) y - 1 else y;
    let era : Int = yy / 400;
    let yoe : Int = yy - era * 400;
    let mp : Int = (m + 9) % 12;
    let doy : Int = (153 * mp + 2) / 5 + d - 1;
    let doe : Int = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days : Int = era * 146097 + doe - 719468;
    ?(days * D);
  };

  /// Display name for a stored person id. Tolerates what older data may still hold: an address (pre-0.6.0
  /// records in the seconds before the migration ran) and "slack:<user>" pseudo-requesters without a hub account.
  func personName(pid : Text) : Text {
    if (pid == "") return "";
    switch (Text.stripStart(pid, #text "customer:")) { case (?id) { switch (customerContacts.get(Nat.fromText(id) ?? 0)) { case (?c) return c.name; case null return "Customer" } }; case null {} };
    switch (Text.stripStart(pid, #text "slack:")) { case (?u) return "Slack user " # u; case null {} };
    if (Text.contains(pid, #char '@') and not Text.startsWith(pid, #text "legacy:")) {
      return switch (Map.get(people, Text.compare, lower(pid))) { case (?u) { if (u.displayName != "") u.displayName else pid }; case null pid };
    };
    let p = Hub.personById(people, ids, former, pid);
    if (p.displayName != "") p.displayName else if (p.email != "") p.email else pid;
  };
  func pidOf(email : Text) : Text = Hub.pidOf(ids, email);
  /// current address of a stored id ("" when the person left and the address moved on)
  func emailOfPid(pid : Text) : Text = if (Text.contains(pid, #char '@') and not Text.startsWith(pid, #text "legacy:")) lower(pid) else Hub.emailOf(ids, pid);

  func groupsOfEmail(email : Text) : [Text] {
    let e = lower(email);
    let fromDir = switch (Map.get(people, Text.compare, e)) {
      case (?u) {
        let g = Hub.attribute(u, "groups");
        if (g == "") [] else Text.split(g, #char ';').toArray();
      };
      case null [];
    };
    // the directory (lease below 60 seconds) is authoritative for everyone it lists;
    // the sign-in cache only fills in for people it does not know
    if (Map.containsKey(people, Text.compare, e)) return fromDir;
    switch (Map.get(groupsCache, Text.compare, e)) { case (?c) c; case null [] };
  };

  func inGroup(email : Text, group : Text) : Bool = group != "" and has(groupsOfEmail(email), group);
  func groupName(approver : Text) : Text = switch (Text.stripStart(approver, #text "group:")) { case (?g) g; case null approver };

  /// Members of a hub group we know about (directory pseudo-attribute + sign-in cache).
  func membersOf(group : Text) : [Text] {
    let out = List.empty<Text>();
    for ((e, u) in Map.entries(people)) if (u.active and inGroup(e, group)) List.add(out, e);
    List.toArray(out);
  };

  /// manager attribute → e-mail: direct e-mail, or display-name match in the directory.
  func managerOf(email : Text) : ?Text {
    let u = switch (Map.get(people, Text.compare, lower(email))) { case (?u) u; case null return null };
    let m = norm(Hub.attribute(u, "manager"));
    if (m == "") return null;
    if (Text.contains(m, #char '@')) return ?lower(m);
    var hit : ?Text = null;
    for ((e, p) in Map.entries(people)) if (lower(p.displayName) == lower(m)) { if (hit != null) return null; hit := ?e }; // ambiguous name → fall back
    hit;
  };

  // =====================================================================
  // roles & sessions
  // =====================================================================

  /// Hub staff role of a person, as the hub reports it in the directory
  /// ("hubRole" = owner | admin | helpdesk, "" = none).
  func hubRoleOf(email : Text) : Text = switch (Map.get(people, Text.compare, lower(email))) { case (?u) Hub.attribute(u, "hubRole"); case null "" };

  /// Precedence: bootstrap list · admins group · hub owner/admin → admin;
  /// agents group · hub helpdesk → agent; everyone else in the directory → requester.
  /// Whoever runs the hub is staff here by default — no second admin list to forget.
  // Historical migration evidence only. Never use this to authorize a request.
  func legacyRoleOf(email : Text) : Text {
    let e = lower(email);
    let hr = hubRoleOf(e);
    if (has(adminEmails, e) or inGroup(e, adminGroup) or hr == "owner" or hr == "admin") return "admin";
    if (inGroup(e, agentGroup) or hr == "helpdesk") return "agent";
    "requester";
  };
  func roleOf(email : Text) : Text {
    let role = Hub.appRole(people, lower(email), "desk");
    if (role == "member") return "requester";
    role;
  };
  /// Why someone has their role — shown in the UI so "who is admin" is never a guess.
  func legacyRoleSourceOf(email : Text) : Text {
    let e = lower(email);
    if (has(adminEmails, e)) return "bootstrap admin list";
    if (inGroup(e, adminGroup)) return "hub group " # adminGroup;
    let hr = hubRoleOf(e);
    if (hr == "owner" or hr == "admin") return "hub " # hr;
    if (inGroup(e, agentGroup)) return "hub group " # agentGroup;
    if (hr == "helpdesk") return "hub helpdesk";
    "directory member";
  };
  func roleSourceOf(email : Text) : Text = Hub.appRoleSource(people, lower(email));
  /// Everyone who is staff here, whatever the reason.
  func staffEmails() : [Text] {
    let out = List.empty<Text>();
    for ((e, u) in Map.entries(people)) if (u.active and isStaff(roleOf(e))) List.add(out, e);
    List.toArray(out);
  };
  func isStaff(role : Text) : Bool = role == "admin" or role == "agent";

  /// id = the hub's stable person id — what every ticket, event, task, approval and file stores. email = the current address (roles, groups, display).
  type Me = { id : Text; email : Text; displayName : Text; role : Text };

  func me(tok : Text) : ?Me {
    if (not Hub.directoryFresh(lastDirectoryPull)) return null;
    switch (Hub.session(sessions, tok)) {
      case (?s) {
        if (not Hub.isActive(people, s.email) or roleOf(s.email) == "none") return null;
        ?{ id = pidOf(s.email); email = s.email; displayName = s.displayName; role = roleOf(s.email) };
      };
      case null null;
    };
  };
  func staff(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (isStaff(m.role)) ?m else null }; case null null };
  func admin(tok : Text) : ?Me = switch (me(tok)) { case (?m) { if (m.role == "admin") ?m else null }; case null null };

  // =====================================================================
  // bootstrap (CLI) & settings
  // =====================================================================
  public shared ({ caller }) func setHub(id : Text) : async Bool {
    assert Principal.isController(caller); // CLI identity that installed the canister
    let configured = Principal.fromText(norm(id));
    assert not configured.isAnonymous();
    directoryEpoch += 1;
    sessions.clear(); people.clear(); ids.clear(); former.clear(); groupsCache.clear(); lastDirectoryPull := 0;
    owner := ?caller;
    if (hubId != norm(id)) { lifecycleCursor := 0; lifecycleCheckedAt := 0; lifecycleError := ""; lifecycleGap := false };
    hubId := norm(id);
    ensureCatalog();
    log(Principal.toText(caller), "hub set to " # hubId);
    true;
  };

  /// CLI bootstrap: name the first desk admin by e-mail (controller only).
  public shared ({ caller }) func addAdminEmail(email : Text) : async Bool {
    assert Principal.isController(caller);
    false;
  };

  /// First-run claim: while nobody is admin yet, the signed-in person becomes one.
  public shared func claimAdmin(tok : Text) : async { ok : Bool; detail : Text } {
    { ok = false; detail = "App permissions are managed only in the Hub" };
  };

  public type Settings = {
    hubId : Text; appUrl : Text; orgName : Text; agentGroup : Text; adminGroup : Text; adminEmails : [Text];
    keyPrefix : Text; autoCloseDays : Nat; aiProvider : Text; aiUrl : Text; aiModel : Text; aiKeySet : Bool; aiTriage : Bool; aiSource : Text; aiHubModel : Text;
    demoSeeded : Bool; peopleCount : Nat; lastDirectoryPull : Int; agentCount : Nat; adminCount : Nat; fileBytes : Nat;
  };
  func settingsView() : Settings = {
    hubId; appUrl; orgName; agentGroup = ""; adminGroup = ""; adminEmails = []; keyPrefix; autoCloseDays; aiProvider; aiUrl; aiModel;
    aiKeySet = aiKey != ""; aiTriage; aiSource = aiSource(); aiHubModel = (switch (hubAi) { case (?c) c.provider # " · " # c.model; case null "" }); demoSeeded; peopleCount = Map.size(people); lastDirectoryPull; fileBytes;
    agentCount = Array.filter<Text>(staffEmails(), func(e) = roleOf(e) == "agent").size(); adminCount = Array.filter<Text>(staffEmails(), func(e) = roleOf(e) == "admin").size();
  };
  public shared query func getSettings(tok : Text) : async ?Settings {
    switch (admin(tok)) { case (?_) ?settingsView(); case null null };
  };
  public shared func updateSettings(tok : Text, args : { appUrl : Text; orgName : Text; agentGroup : Text; adminGroup : Text; keyPrefix : Text; autoCloseDays : Nat }) : async { ok : Bool; detail : Text } {
    if (norm(args.adminGroup) != "" or norm(args.agentGroup) != "") return { ok = false; detail = "Role settings have moved to Hub Permissions" };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (args.appUrl != "" and not Text.startsWith(args.appUrl, #text "https://")) return { ok = false; detail = "app URL must start with https://" };
    if (norm(args.keyPrefix) == "" or args.keyPrefix.size() > 6) return { ok = false; detail = "key prefix: 1-6 characters" };
    appUrl := norm(args.appUrl); orgName := norm(args.orgName);
    keyPrefix := norm(args.keyPrefix); autoCloseDays := args.autoCloseDays;
    log(m.email, "settings updated");
    { ok = true; detail = "" };
  };
  public shared func setAdminEmails(tok : Text, emails : [Text]) : async { ok : Bool; detail : Text } {
    { ok = false; detail = "App permissions are managed only in the Hub" };
  };
  public shared func setAiTriage(tok : Text, on : Bool) : async Bool {
    switch (admin(tok)) { case (?m) { aiTriage := on; log(m.email, "AI auto-triage " # (if (on) "on" else "off")); true }; case null false };
  };
  public shared func setAi(tok : Text, args : { provider : Text; url : Text; key : Text; model : Text }) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (args.provider != "openai" and args.provider != "anthropic") return { ok = false; detail = "provider must be openai or anthropic" };
    if (args.url != "" and not Text.startsWith(args.url, #text "https://")) return { ok = false; detail = "url must start with https://" };
    aiProvider := args.provider; aiUrl := norm(args.url); aiModel := norm(args.model);
    if (args.key != "") aiKey := norm(args.key); // empty = keep
    log(m.email, "AI config updated (" # aiProvider # ", " # aiModel # ")");
    { ok = true; detail = "" };
  };
  /// Settings page: ask the hub again right now (after an owner set or rotated the key there).
  public shared func refreshAi(tok : Text) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    hubAiTried := false;
    await refreshHubAi();
    switch (hubAi) { case (?c) ({ ok = true; detail = "from the hub: " # c.provider # " · " # c.model }); case null ({ ok = true; detail = (if (aiUrl != "" and aiKey != "") "no key in the hub — using the local fallback" else "no key in the hub and no local fallback") }) };
  };
  public shared func clearAiKey(tok : Text) : async Bool {
    switch (admin(tok)) { case (?m) { aiKey := ""; log(m.email, "AI key cleared"); true }; case null false };
  };
  public shared query func adminLogRows(tok : Text) : async [LogRow] {
    switch (admin(tok)) {
      case null [];
      case (?_) {
        let out = List.empty<LogRow>();
        for ((_, r) in Map.reverseEntries(adminLog)) { if (List.size(out) < 200) List.add(out, r) };
        List.toArray(out);
      };
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
  public shared query func hub_ping() : async Text { "desk" };

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

    { app = "desk"; model = 1; revision = Hub.permissionRevision(people, "desk"); directoryAt = lastDirectoryPull; legacy = legacy.toArray(); legacyGroups = [{ name = adminGroup; role = "admin" } , { name = agentGroup; role = "agent" }] };
  };
  public shared query func hub_manifest() : async Hub.Manifest {
    {
      name = "desk"; version = BUILD_VERSION; description = "Service management: request catalog, queues, approvals, SLA";
      needs = ["identity", "profile", "groups", "roles", "notify"]; // manager for approvals, groups for queues/roles, notify for the return lane
      wants = ["avatars", "push", "ai"]; // ai: triage notes, summaries and drafts with the company's key from the hub
    };
  };

  /// Optional contract: where this app uses a hub group — the hub shows it on
  /// the group ("used by desk: queue of 4 open requests …"). Query, no auth:
  /// group names are not secrets, and the hub calls it from an update.
  public shared query func hub_usesGroup(name : Text) : async [Text] {
    let n = lower(norm(name));
    if (n == "") return [];
    let out = List.empty<Text>();
    let customerTeams = customerProjects.values().toArray().filter(func p = lower(p.group) == n).size();
    if (customerTeams > 0) out.add("support team of " # Nat.toText(customerTeams) # " customer project(s)");
    let oncallTeams = oncallState.projects.values().toArray().filter(func p = switch (p.scope) { case (#internal group) lower(group) == n; case (#customer _) false }).size();
    if (oncallTeams > 0) out.add("on-call team of " # oncallTeams.toText() # " project(s)");
    var asQueue = 0; var asApprover = 0;
    for ((_, rt) in Map.entries(types)) {
      if (rt.enabled and lower(rt.queue) == n) asQueue += 1;
      if (rt.enabled and lower(rt.approval) == "group:" # n) asApprover += 1;
    };
    if (asQueue > 0) List.add(out, "default queue of " # Nat.toText(asQueue) # " request type" # (if (asQueue == 1) "" else "s"));
    if (asApprover > 0) List.add(out, "approver group of " # Nat.toText(asApprover) # " request type" # (if (asApprover == 1) "" else "s"));
    var openInQueue = 0; var pendingApprovals = 0;
    for ((id, t) in Map.entries(tickets)) {
      if (lower(t.queue) == n and t.status != "resolved" and t.status != "closed") openInQueue += 1;
      switch (Map.get(approvals, Nat.compare, id)) { case (?a) { if (a.state == "pending" and lower(a.approver) == "group:" # n) pendingApprovals += 1 }; case null {} };
    };
    if (openInQueue > 0) List.add(out, Nat.toText(openInQueue) # " open request" # (if (openInQueue == 1) "" else "s") # " in this queue");
    if (pendingApprovals > 0) List.add(out, Nat.toText(pendingApprovals) # " approval" # (if (pendingApprovals == 1) "" else "s") # " waiting on this group");
    List.toArray(out);
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
      lastDirectoryCount := n;
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
    // fresh directory at sign-in (roles, groups, hub staff) unless pulled in the last 2 minutes
    if (not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull) or roleOf(r.email) == "none") { try { ignore await pullDirectory() } catch (_) {} };
    if (hubId != expectedHub or not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull) or roleOf(r.email) == "none") return null; // hub said ok but directory scope disagrees
    // fresh groups for this person (routing/roles)
    try { Map.add(groupsCache, Text.compare, lower(r.email), await Hub.hub(hubId).groupsOf(r.email)) } catch (_) {};
    await refreshHubAi(); // cheap: at most once per 5 minutes
    let tok = hex(await ic00.raw_rand());
    if (hubId != expectedHub or not Hub.isActive(people, r.email) or not Hub.directoryFresh(lastDirectoryPull) or roleOf(r.email) == "none") return null;
    ignore Hub.mintSession(sessions, tok, r.email, r.displayName, 10 * H);
    // suiteToken: the hub's read-only token for the shared topbar (bell, menu, name, picture) — passed through, never stored
    ?{ token = tok; email = lower(r.email); displayName = r.displayName; role = roleOf(r.email); suiteToken = (switch (r.suiteToken) { case (?t) t; case null "" }) };
  };

  public shared query func whoami(tok : Text) : async ?{ id : Text; email : Text; displayName : Text; role : Text; roleSource : Text; groups : [Text]; orgName : Text; hubId : Text; needsClaim : Bool; aiOn : Bool; reporting : Bool } {
    switch (me(tok)) {
      case null null;
      case (?m) ?{
        id = m.id; email = m.email; displayName = m.displayName; role = m.role; roleSource = roleSourceOf(m.email); groups = groupsOfEmail(m.email); orgName; hubId;
        needsClaim = (hubRoleOf(m.email) == "owner" or hubRoleOf(m.email) == "admin") and not adminClaimed and Array.filter<Text>(staffEmails(), func(e) = roleOf(e) == "admin").size() == 0 and Map.size(tickets) == 0;
        aiOn = aiSource() != "";
        reporting = isStaff(m.role) or (switch(people.get(m.email)){case(?u)Hub.attribute(u,"deskReporting")!="" and Hub.attribute(u,"deskReporting")!=";";case null false}) or reportingState.records.values().any(func r=r.personId==m.id);
      };
    };
  };
  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };

  /// Requester card for the side panel (agents) — from the hub directory cache.
  public type PersonCard = { id : Text; email : Text; displayName : Text; title : Text; department : Text; location : Text; manager : Text; groups : [Text]; active : Bool; known : Bool };
  /// the card of a stored person id (a former colleague keeps name + address, nothing else)
  func card(pid : Text) : PersonCard {
    let e = emailOfPid(pid);
    if (e == "") { let p = Hub.personById(people, ids, former, pid); return { id = pid; email = p.email; displayName = personName(pid); title = ""; department = ""; location = ""; manager = ""; groups = []; active = false; known = p.known } };
    switch (Map.get(people, Text.compare, e)) {
      case (?u) ({ id = pid; email = e; displayName = u.displayName; title = Hub.attribute(u, "title"); department = Hub.attribute(u, "department"); location = Hub.attribute(u, "location"); manager = Hub.attribute(u, "manager"); groups = groupsOfEmail(e); active = u.active; known = true });
      case null ({ id = pid; email = e; displayName = personName(pid); title = ""; department = ""; location = ""; manager = ""; groups = []; active = false; known = false });
    };
  };
  public shared query func directory(tok : Text, q : Text) : async [{ email : Text; displayName : Text; department : Text }] {
    switch (me(tok)) {
      case null [];
      case (?_) {
        let needle = lower(norm(q));
        let out = List.empty<{ email : Text; displayName : Text; department : Text }>();
        for ((e, u) in Map.entries(people)) {
          if (u.active and (needle == "" or Text.contains(lower(u.displayName), #text needle) or Text.contains(e, #text needle))) {
            if (List.size(out) < 50) List.add(out, { email = e; displayName = u.displayName; department = Hub.attribute(u, "department") });
          };
        };
        List.toArray(out);
      };
    };
  };
  public shared query func agents(tok : Text) : async [{ id : Text; email : Text; displayName : Text }] {
    switch (staff(tok)) {
      case null [];
      case (?_) {
        let out = List.empty<{ id : Text; email : Text; displayName : Text }>();
        for (e in staffEmails().vals()) List.add(out, { id = pidOf(e); email = e; displayName = personName(pidOf(e)) });
        List.toArray(out);
      };
    };
  };

  // =====================================================================
  // notifications (through the hub, fire-and-forget)
  // =====================================================================
  func ticketUrl(id : Nat) : Text = if (appUrl == "") "" else appUrl # "#/t/" # Nat.toText(id);

  /// targets = person ids or addresses (group members come as addresses); a former colleague (no current address) is skipped
  func notify<system>(who : [Text], title : Text, id : Nat, kind : Text, dedupe : Text) {
    if (hubId == "" or who.size() == 0) return;
    let resolved = List.empty<Text>();
    for (w in who.vals()) { let e = emailOfPid(w); if (e != "" and not has(List.toArray(resolved), e)) List.add(resolved, e) };
    let emails = List.toArray(resolved);
    if (emails.size() == 0) return;
    let targets = Array.sliceToArray<Text>(emails, 0, Nat.min(emails.size(), 25));
    let pid = projectOf(id);
    let safeTitle = if (pid == 0) title else "Customer support · New activity";
    let url = if (pid == 0) ticketUrl(id) else appUrl # "#/customers/" # Nat.toText(pid);
    ignore Timer.setTimer<system>(#seconds 0, func() : async () {
      let hub = Hub.hub(hubId);
      for (e in targets.vals()) {
        let allowed = switch (tickets.get(id)) { case (?t) not customerDue(t) and (pid == 0 or projectEmailAccess(e, pid)); case null false };
        if (allowed) try { ignore await hub.hub_notify({ email = e; title = capText(safeTitle, 180); url; kind; dedupeKey = dedupe # ":" # e }) } catch (_) {};
      };
    });
  };

  func notifyQueue<system>(t : Ticket, title : Text, dedupe : Text) {
    var members = if (t.queue == "") [] else membersOf(t.queue).filter(func email = isStaff(roleOf(email)));
    if (members.size() == 0) members := staffEmails();
    if (projectOf(t.id) != 0) {
      let group = switch (customerWorkflows.get(t.id)) { case (?w) { if (w.definition.steps.size() > 0) w.definition.steps[w.step].group else "" }; case null "" };
      members := staffEmails().filter(func e = projectEmailAccess(e, projectOf(t.id)) and (group == "" or inGroup(e, group) or roleOf(e) == "admin"));
    };
    notify<system>(members, title, t.id, "desk", dedupe);
  };

  func notifyOwners<system>(t : Ticket, title : Text, dedupe : Text) {
    if (t.assignee != "") notify<system>([t.assignee], title, t.id, "desk", dedupe) else notifyQueue<system>(t, title, dedupe);
  };

  // =====================================================================
  // events & ticket mutation helpers
  // =====================================================================
  func addEvent(ticketId : Nat, who : Text, actorKind : Text, kind : Text, body : Text, meta : [(Text, Text)]) : Nat {
    let id = nextEventId;
    nextEventId += 1;
    Map.add(events, Nat.compare, id, { id; ticketId; at = now(); who; actorKind; kind; body; meta });
    let cur = switch (Map.get(ticketEvents, Nat.compare, ticketId)) { case (?xs) xs; case null [] };
    Map.add(ticketEvents, Nat.compare, ticketId, Array.concat(cur, [id]));
    id;
  };

  // Multiple updates can share one replica timestamp; revisions must still order case decisions.
  func nextTicketRevision(id : Nat) : Int = Int.max(now(), switch (tickets.get(id)) { case (?t) t.updatedAt + 1; case null 0 });
  func touch(t : Ticket) : Ticket = { t with updatedAt = nextTicketRevision(t.id) };
  func put(t : Ticket) { Map.add(tickets, Nat.compare, t.id, touch(t)) };

  func validStatus(s : Text) : Bool = s == "new" or s == "open" or s == "waiting" or s == "resolved" or s == "closed";
  func validPriority(p : Text) : Bool = p == "low" or p == "normal" or p == "high" or p == "urgent";
  func validWaiting(w : Text) : Bool = w == "" or w == "requester" or w == "third-party" or w == "approval";

  func openTasks(id : Nat) : Nat {
    switch (Map.get(ticketTasks, Nat.compare, id)) {
      case null 0;
      case (?ts) { var n = 0; for (t in ts.vals()) if (t.state == "open") n += 1; n };
    };
  };

  func typeOf(id : Nat) : ?RequestType = Map.get(types, Nat.compare, id);

  func canSee(m : Me, t : Ticket) : Bool = if (projectOf(t.id) != 0) not customerDue(t) and projectAccess(m, projectOf(t.id)) else isStaff(m.role) or isApprover(m, t.id) or (not isInternal(t.id) and t.requester == m.id);

  func isApprover(m : Me, ticketId : Nat) : Bool {
    if (projectOf(ticketId) != 0) return false;
    switch (Map.get(approvals, Nat.compare, ticketId)) {
      case (?a) {
        if (a.state != "pending") return false; // access ends with the decision
        if (a.approver == "role:admin") return m.role == "admin";
        if (a.approver == m.id) return true;
        if (Text.startsWith(a.approver, #text "group:")) return inGroup(m.email, groupName(a.approver));
        false;
      };
      case null false;
    };
  };

  // =====================================================================
  // catalog API
  // =====================================================================
  public type TypeView = RequestType;

  func orderedTypes() : [RequestType] {
    let arr = Iter.toArray(Map.values(types));
    Array.sort<RequestType>(arr, func(a, b) = if (a.sortOrder == b.sortOrder) Nat.compare(a.id, b.id) else Nat.compare(a.sortOrder, b.sortOrder));
  };

  public shared query func catalog(tok : Text) : async [TypeView] {
    switch (me(tok)) {
      case null [];
      case (?m) Array.filter<RequestType>(orderedTypes(), func(t) = t.enabled and (t.visibility == "all" or isStaff(m.role)));
    };
  };
  public shared query func adminCatalog(tok : Text) : async [TypeView] {
    switch (admin(tok)) { case null []; case (?_) orderedTypes().filter(func t = not customerTypeId(t.id)) };
  };

  public type TypeInput = {
    name : Text; icon : Text; description : Text; fields : [FieldDef]; checklist : [Text]; queue : Text; approval : Text;
    defaultPriority : Text; respondH : Nat; resolveH : Nat; dueField : Text; visibility : Text; enabled : Bool;
  };
  func validateType(a : TypeInput) : Text {
    if (norm(a.name) == "") return "name is required";
    if (a.name.size() > 60) return "name too long";
    if (a.approval == "group:") return "approval group name is missing";
    if (a.fields.size() > 20) return "max 20 fields";
    if (a.checklist.size() > 40) return "max 40 checklist items";
    if (not validPriority(a.defaultPriority)) return "bad default priority";
    if (not (a.approval == "none" or a.approval == "manager" or Text.startsWith(a.approval, #text "group:"))) return "approval must be none, manager or group:<name>";
    if (a.visibility != "all" and a.visibility != "agents") return "visibility must be all or agents";
    let seen = Map.empty<Text, Bool>();
    for (f in a.fields.vals()) {
      if (norm(f.key) == "" or Text.contains(f.key, #char ' ')) return "field keys: no spaces, not empty";
      if (Map.containsKey(seen, Text.compare, f.key)) return "duplicate field key " # f.key;
      Map.add(seen, Text.compare, f.key, true);
      if (not (f.kind == "text" or f.kind == "textarea" or f.kind == "date" or f.kind == "select" or f.kind == "person" or f.kind == "bool")) return "bad field kind " # f.kind;
      if (f.kind == "select" and f.options.size() == 0) return "select field " # f.key # " needs options";
    };
    if (a.dueField != "" and not Map.containsKey(seen, Text.compare, a.dueField)) return "dueField must be one of the field keys";
    "";
  };
  public shared func upsertType(tok : Text, id : Nat, a : TypeInput) : async { ok : Bool; id : Nat; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; id = 0; detail = "admins only" } };
    if (customerTypeId(id)) return { ok = false; id; detail = "Manage this form in Customer projects" };
    let err = validateType(a);
    if (err != "") return { ok = false; id = 0; detail = err };
    let (tid, order) = if (id == 0) { let n = nextTypeId; nextTypeId += 1; (n, n) } else {
      switch (typeOf(id)) { case (?t) (id, t.sortOrder); case null return { ok = false; id = 0; detail = "no such type" } };
    };
    Map.add(types, Nat.compare, tid, {
      id = tid; name = norm(a.name); icon = capText(norm(a.icon), 4); description = norm(a.description); fields = a.fields; checklist = Array.filter<Text>(a.checklist, func(x) = norm(x) != "");
      queue = norm(a.queue); approval = a.approval; defaultPriority = a.defaultPriority; respondH = a.respondH; resolveH = a.resolveH; dueField = a.dueField;
      visibility = a.visibility; enabled = a.enabled; sortOrder = order;
    });
    log(m.email, (if (id == 0) "created" else "updated") # " request type #" # Nat.toText(tid) # " " # norm(a.name));
    if (offboardingTemplateId == null and lower(norm(a.name)) == "offboarding") offboardingTemplateId := ?tid;
    { ok = true; id = tid; detail = "" };
  };
  public shared func removeType(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (customerTypeId(id)) return { ok = false; detail = "Manage this form in Customer projects" };
    for ((_, t) in Map.entries(tickets)) if (t.typeId == id) return { ok = false; detail = "tickets reference this type — disable it instead" };
    ignore Map.delete(types, Nat.compare, id);
    if (offboardingTemplateId == ?id) offboardingTemplateId := null;
    log(m.email, "removed request type #" # Nat.toText(id));
    { ok = true; detail = "" };
  };
  public shared func setTypeOrder(tok : Text, ids : [Nat]) : async Bool {
    switch (admin(tok)) {
      case null false;
      case (?_) {
        var i = 1;
        for (id in ids.vals()) { switch (typeOf(id)) { case (?t) { Map.add(types, Nat.compare, id, { t with sortOrder = i }); i += 1 }; case null {} } };
        true;
      };
    };
  };

  // =====================================================================
  // ticket creation
  // =====================================================================
  func nextKey(id : Nat) : Text = keyPrefix # "-" # Nat.toText(id);

  func fieldValue(fields : [(Text, Text)], key : Text) : Text { for ((k, v) in fields.vals()) if (k == key) return v; "" };

  /// keep only pairs whose key the type defines, trimmed and non-empty
  func knownFields(rt : RequestType, fields : [(Text, Text)]) : [(Text, Text)] {
    Array.filter<(Text, Text)>(Array.map<(Text, Text), (Text, Text)>(fields, func(kv) = (kv.0, norm(kv.1))), func(kv) {
      if (kv.1 == "") return false;
      for (f in rt.fields.vals()) if (f.key == kv.0) return true;
      false;
    });
  };
  func validateFields(rt : RequestType, fields : [(Text, Text)]) : Text {
    if (fields.size() > 60) return "too many fields";
    if (isOffboardingType(rt)) {
      let person = fieldValue(fields, "person");
      let pid = if (Text.contains(person, #char '@')) pidOf(person) else person;
      if (not Hub.personById(people, ids, former, pid).known) return "Choose a known Hub person for offboarding";
    };
    for (f in rt.fields.vals()) {
      let v = norm(fieldValue(fields, f.key));
      if (f.required and v == "") return "missing: " # f.title;
      if (v != "" and f.kind == "date" and parseIsoNs(v) == null) return f.title # ": use yyyy-mm-dd";
      if (v != "" and f.kind == "select" and not has(f.options, v)) return f.title # ": not an option";
      if (v.size() > 2000) return f.title # ": too long";
    };
    "";
  };

  /// requester / by = person ids (or "slack:<user>" for a Slack author without a hub account)
  func createInternal<system>(rt : RequestType, requester : Text, subject : Text, body : Text, fields : [(Text, Text)], priority : Text, channel : Text, byEmail : Text, byKind : Text, quiet : Bool) : Nat {
    let id = nextTicketId;
    nextTicketId += 1;
    let t0 = now();
    let q = rt.queue;
    // due: field override, else SLA
    var dueAt : ?Int = if (rt.resolveH > 0) ?(t0 + rt.resolveH * H) else null;
    if (rt.dueField != "") { switch (parseIsoNs(fieldValue(fields, rt.dueField))) { case (?ns) dueAt := ?ns; case null {} } };
    // approval
    var status = "new";
    var waitingOn = "";
    var approver = "";
    if (rt.approval == "manager") {
      approver := switch (managerOf(emailOfPid(requester))) { case (?m) pidOf(m); case null "role:admin" };
    } else if (Text.startsWith(rt.approval, #text "group:")) approver := rt.approval;
    if (approver != "") { status := "waiting"; waitingOn := "approval" };
    let t : Ticket = {
      id; key = nextKey(id); typeId = rt.id; subject = capText(norm(subject), 160); body = capText(body, 20_000); status; waitingOn;
      priority = if (validPriority(priority)) priority else rt.defaultPriority; requester; assignee = ""; queue = q; channel;
      fields = personFieldsToIds(rt, knownFields(rt, fields)); links = []; createdAt = t0; updatedAt = t0; dueAt;
      respondBy = if (rt.respondH > 0) ?(t0 + rt.respondH * H) else null; firstResponseAt = null; resolvedAt = null; closedAt = null;
    };
    Map.add(tickets, Nat.compare, id, t);
    ignore addEvent(id, byEmail, byKind, "created", "via " # channel # " · " # rt.name, [("type", rt.name), ("queue", q)]);
    if (rt.checklist.size() > 0) Map.add(ticketTasks, Nat.compare, id, Array.map<Text, Task>(rt.checklist, func(x) = ({ title = x; state = "open"; by = ""; at = 0 })));
    if (approver != "") {
      Map.add(approvals, Nat.compare, id, { approver; state = "pending"; decidedBy = ""; at = t0; note = "" });
      ignore addEvent(id, "system", "system", "approval", "approval requested from " # approverLabel(approver), [("approver", approver)]);
      let who = if (approver == "role:admin") staffEmails().filter(func email = roleOf(email) == "admin") else if (Text.startsWith(approver, #text "group:")) membersOf(groupName(approver)) else [approver];
      if (not quiet) notify<system>(who, "Approval needed · " # t.key # " " # t.subject, id, "approval", t.key # ":approval");
    } else {
      if (not quiet) notifyQueue<system>(t, "New request · " # t.key # " " # t.subject, t.key # ":new");
    };
    if (not quiet and aiTriage) scheduleTriage<system>(id); // triage() itself gives up quietly when no key (hub or local) answers
    id;
  };

  func approverLabel(a : Text) : Text = if (a == "role:admin") "App admins (Hub)" else if (Text.startsWith(a, #text "group:")) "group " # groupName(a) else personName(a);
  /// fields of kind "person" arrive as addresses from the picker and are stored as ids
  func personFieldsToIds(rt : RequestType, fields : [(Text, Text)]) : [(Text, Text)] {
    Array.map<(Text, Text), (Text, Text)>(fields, func(kv) { for (f in rt.fields.vals()) if (f.key == kv.0 and f.kind == "person" and Text.contains(kv.1, #char '@')) return (kv.0, pidOf(kv.1)); kv });
  };
  func fieldIsPerson(typeId : Nat, key : Text) : Bool { switch (typeOf(typeId)) { case (?rt) { for (f in rt.fields.vals()) if (f.key == key) return f.kind == "person"; false }; case null false } };

  /// Requester files a request from the catalog.
  public shared func createRequest(tok : Text, typeId : Nat, subject : Text, body : Text, fields : [(Text, Text)]) : async { ok : Bool; id : Nat; key : Text; detail : Text } {
    if (migrating()) return { ok = false; id = 0; key = ""; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; id = 0; key = ""; detail = "no session" } };
    let rt = switch (typeOf(typeId)) { case (?t) t; case null return { ok = false; id = 0; key = ""; detail = "no such request type" } };
    if (not rt.enabled or (rt.visibility == "agents" and not isStaff(m.role))) return { ok = false; id = 0; key = ""; detail = "request type not available" };
    if (norm(subject) == "") return { ok = false; id = 0; key = ""; detail = "subject is required" };
    let err = validateFields(rt, fields);
    if (err != "") return { ok = false; id = 0; key = ""; detail = err };
    switch (Map.get(lastCreateAt, Text.compare, m.id)) { case (?t0) { if (now() - t0 < 10_000_000_000) return { ok = false; id = 0; key = ""; detail = "slow down — one request every 10 seconds" } }; case null {} };
    if (isOffboardingType(rt)) {
      let person = fieldValue(personFieldsToIds(rt, fields), "person");
      switch (lifecycleTicket(person, false)) {
        case (?t) {
          if (not isInternal(t.id) and not canSee(m, t)) return { ok = false; id = 0; key = ""; detail = "An offboarding is already being handled. Contact your IT team to add information." };
          switch (mergeOffboarding<system>(rt, m.id, subject, body, fields, m.id)) { case (?id) { lastCreateAt.add(m.id, now()); return { ok = true; id; key = nextKey(id); detail = "Linked to the existing offboarding" } }; case null {} };
        };
        case null {};
      };
    };
    // rate limit: one request per 10 s per person, max 30 active requests
    var active = 0;
    for ((_, t) in Map.entries(tickets)) if (t.requester == m.id and t.status != "resolved" and t.status != "closed") active += 1;
    if (active >= 30) return { ok = false; id = 0; key = ""; detail = "you have 30 open requests — resolve some first" };
    Map.add(lastCreateAt, Text.compare, m.id, now());
    let id = createInternal<system>(rt, m.id, subject, body, fields, rt.defaultPriority, "portal", m.id, "requester", false);
    { ok = true; id; key = nextKey(id); detail = "" };
  };

  /// Agent files on someone's behalf (walk-up, phone, chat).
  public shared func agentCreate(tok : Text, args : { typeId : Nat; subject : Text; body : Text; fields : [(Text, Text)]; requester : Text; priority : Text; channel : Text }) : async { ok : Bool; id : Nat; key : Text; detail : Text } {
    if (migrating()) return { ok = false; id = 0; key = ""; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; id = 0; key = ""; detail = "agents only" } };
    let rt = switch (typeOf(args.typeId)) { case (?t) t; case null return { ok = false; id = 0; key = ""; detail = "no such request type" } };
    if (not rt.enabled) return { ok = false; id = 0; key = ""; detail = "request type is disabled" };
    let req = lower(norm(args.requester));
    if (req == "" or not Text.contains(req, #char '@')) return { ok = false; id = 0; key = ""; detail = "requester e-mail required" };
    if (norm(args.subject) == "") return { ok = false; id = 0; key = ""; detail = "subject is required" };
    let err = validateFields(rt, args.fields);
    if (err != "") return { ok = false; id = 0; key = ""; detail = err };
    let ch = if (norm(args.channel) == "") "agent" else capText(norm(args.channel), 24);
    switch (mergeOffboarding<system>(rt, pidOf(req), args.subject, args.body, args.fields, m.id)) { case (?id) return { ok = true; id; key = nextKey(id); detail = "Linked to the existing offboarding" }; case null {} };
    let id = createInternal<system>(rt, pidOf(req), args.subject, args.body, args.fields, args.priority, ch, m.id, "agent", false);
    { ok = true; id; key = nextKey(id); detail = "" };
  };

  // =====================================================================
  // reading
  // =====================================================================
  public type TicketRow = {
    id : Nat; key : Text; typeId : Nat; typeName : Text; typeIcon : Text; subject : Text; status : Text; waitingOn : Text; priority : Text;
    requester : Text; requesterName : Text; assignee : Text; assigneeName : Text; queue : Text; channel : Text; createdAt : Int; updatedAt : Int;
    dueAt : ?Int; respondBy : ?Int; firstResponseAt : ?Int; openTasks : Nat; totalTasks : Nat; approval : Text; breached : Bool;
    projectId : Nat;
    workflowStep : Text;
    requesterEmail : Text; assigneeEmail : Text; // requester/assignee are person ids (0.6.0); these are their current addresses ("" for a former colleague)
  };
  func row(t : Ticket) : TicketRow {
    let (tn, ti) = switch (typeOf(t.typeId)) { case (?rt) (rt.name, rt.icon); case null ("", "") };
    let total = switch (Map.get(ticketTasks, Nat.compare, t.id)) { case (?ts) ts.size(); case null 0 };
    let ap = switch (Map.get(approvals, Nat.compare, t.id)) { case (?a) a.state; case null "" };
    let active = t.status != "resolved" and t.status != "closed";
    let n = now();
    let breached = active and ((switch (t.respondBy) { case (?r) t.firstResponseAt == null and n > r; case null false }) or (switch (t.dueAt) { case (?d) n > d; case null false }));
    {
      workflowStep = switch (customerWorkflows.get(t.id)) { case (?w) { if (w.outcome != "") w.outcome else if (w.definition.steps.size() > 0) w.definition.steps[w.step].name else "" }; case null "" };
      id = t.id; key = t.key; typeId = t.typeId; typeName = switch (customerWorkflows.get(t.id)) { case (?w) w.definition.name; case null tn }; typeIcon = ti; subject = t.subject; status = t.status; waitingOn = t.waitingOn; priority = t.priority;
      requester = t.requester; requesterName = if (projectOf(t.id) != 0) (customerContacts.get(t.id) ?? ({ projectId = 0; name = "Customer"; email = ""; tokenHash = ""; expiresAt = 0; fingerprint = ""; schema = [] })).name else if (isInternal(t.id)) { switch (lifecycleCases.get(t.id)) { case (?c) c.name # " · Directory"; case null "Directory" } } else personName(t.requester); assignee = t.assignee; assigneeName = if (t.assignee == "") "" else personName(t.assignee);
      queue = t.queue; channel = t.channel; createdAt = t.createdAt; updatedAt = t.updatedAt; dueAt = t.dueAt; respondBy = t.respondBy; firstResponseAt = t.firstResponseAt;
      openTasks = openTasks(t.id); totalTasks = total; approval = ap; breached;
      projectId = projectOf(t.id);
      requesterEmail = switch (customerContacts.get(t.id)) { case (?c) c.email; case null emailOfPid(t.requester) }; assigneeEmail = if (t.assignee == "") "" else emailOfPid(t.assignee);
    };
  };

  public type Filter = { status : Text; queue : Text; assignee : Text; q : Text; view : Text }; // view: all | mine | unassigned | waiting | breached | approvals
  public shared query func listTickets(tok : Text, f : Filter) : async [TicketRow] { scopedTickets(tok, 0, f) };
  public shared query func customerProjectTickets(tok : Text, projectId : Nat, f : Filter) : async [TicketRow] { scopedTickets(tok, projectId, f) };
  func scopedTickets(tok : Text, projectId : Nat, f : Filter) : [TicketRow] {
    let m = switch (staff(tok)) { case (?m) m; case null return [] };
    let needle = lower(norm(f.q));
    let out = List.empty<TicketRow>();
    for ((_, t) in Map.reverseEntries(tickets)) if (projectOf(t.id) == projectId and canSee(m, t)) {
      let r = row(t);
      let active = t.status != "resolved" and t.status != "closed";
      let viewOk = switch (f.view) {
        case "mine" t.assignee == m.id and active;
        case "unassigned" t.assignee == "" and active;
        case "waiting" t.status == "waiting";
        case "breached" r.breached;
        case "open" active;
        case "done" not active;
        case _ true;
      };
      let statusOk = f.status == "" or f.status == t.status;
      let queueOk = f.queue == "" or f.queue == t.queue;
      let assigneeOk = f.assignee == "" or f.assignee == t.assignee or (Text.contains(f.assignee, #char '@') and pidOf(f.assignee) == t.assignee);
      let qOk = needle == "" or Text.contains(lower(t.subject), #text needle) or Text.contains(lower(t.key), #text needle) or Text.contains(r.requesterEmail, #text needle) or Text.contains(lower(r.requesterName), #text needle);
      if (viewOk and statusOk and queueOk and assigneeOk and qOk and List.size(out) < 500) List.add(out, r);
    };
    List.toArray(out);
  };

  public shared query func myTickets(tok : Text) : async [TicketRow] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    let out = List.empty<TicketRow>();
    for ((_, t) in Map.reverseEntries(tickets)) if (projectOf(t.id) == 0 and t.requester == m.id and canSee(m, t)) List.add(out, row(t));
    List.toArray(out);
  };

  public shared query func myApprovals(tok : Text) : async [TicketRow] {
    let m = switch (me(tok)) { case (?m) m; case null return [] };
    let out = List.empty<TicketRow>();
    for ((id, a) in Map.entries(approvals)) {
      if (a.state == "pending" and isApprover(m, id)) { switch (Map.get(tickets, Nat.compare, id)) { case (?t) List.add(out, row(t)); case null {} } };
    };
    List.toArray(out);
  };

  public type FileMeta = { id : Nat; name : Text; mime : Text; size : Nat; by : Text; at : Int };
  public type TicketFull = {
    ticket : Ticket; row : TicketRow; events : [Event]; tasks : [Task]; approval : ?Approval; files : [FileMeta];
    requester : PersonCard; requestType : ?RequestType; canAct : Bool; canApprove : Bool; role : Text;
    internal : Bool;
    customerWorkflow : ?{ run : Workflows.Run; canProgress : Bool };
    customer : ?{ projectId : Nat; projectName : Text; name : Text; email : Text; linkExpiresAt : Int; deleteAt : Int; hold : ?Privacy.Hold };
    lifecycle : ?LifecycleCase; // staff only; never included in the requester/approver view
    slack : ?{ channel : Text; channelName : Text }; // set when the request came from a Slack channel — replies mirror into that thread
    people : [PersonCard]; // everyone referenced by id in this ticket (events, tasks, approval, files) — the frontend renders names from here
  };
  public shared query func getTicket(tok : Text, id : Nat) : async ?TicketFull {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return null };
    if (not canSee(m, t)) return null;
    let staffView = isStaff(m.role);
    let evs = List.empty<Event>();
    for (eid in (switch (Map.get(ticketEvents, Nat.compare, id)) { case (?xs) xs; case null [] }).vals()) {
      switch (Map.get(events, Nat.compare, eid)) {
        case (?e) { if (staffView or (e.kind == "created" or e.kind == "comment" or e.kind == "status" or e.kind == "assign" or e.kind == "approval" or e.kind == "file")) List.add(evs, e) };
        case null {};
      };
    };
    let fm = List.empty<FileMeta>();
    for (fid in (switch (Map.get(ticketFiles, Nat.compare, id)) { case (?xs) xs; case null [] }).vals()) {
      switch (Map.get(files, Nat.compare, fid)) { case (?f) List.add(fm, { id = f.id; name = f.name; mime = f.mime; size = f.size; by = f.by; at = f.at }); case null {} };
    };
    ?{
      ticket = t; row = row(t); events = List.toArray(evs); tasks = (if (staffView) (switch (Map.get(ticketTasks, Nat.compare, id)) { case (?ts) ts; case null [] }) else []);
      approval = Map.get(approvals, Nat.compare, id); files = List.toArray(fm); requester = card(t.requester); requestType = switch (customerContacts.get(id)) { case (?c) { let rt = switch (customerWorkflows.get(id)) { case (?w) workflowType(customerProjects.get(c.projectId) ?? (return null), w.definition); case null typeOf(t.typeId) ?? (return null) }; ?{ rt with fields = c.schema } }; case null typeOf(t.typeId) };
      internal = isInternal(id);
      customerWorkflow = switch (customerWorkflows.get(id)) { case (?w) { if (w.definition.steps.size() == 0) null else ?{ run = w; canProgress = workflowAllowed(m, w) } }; case null null };
      customer = switch (customerContacts.get(id)) { case (?c) ?{ projectId = c.projectId; projectName = (customerProjects.get(c.projectId) ?? (return null)).name; name = c.name; email = c.email; linkExpiresAt = c.expiresAt; deleteAt = retentionAt(t, privacyPolicy(c.projectId)); hold = customerHolds.get(id) }; case null null };
      lifecycle = if (staffView) lifecycleCases.get(id) else null;
      canAct = staffView; canApprove = (isApprover(m, id) or m.role == "admin") and t.requester != m.id; role = m.role;
      people = peopleOf(t, List.toArray(evs), List.toArray(fm));
      slack = (switch (Map.get(slackAnchor, Nat.compare, id)) { case (?a) ?{ channel = a.channel; channelName = (switch (Map.get(slackIntakes, Nat.compare, a.intakeId)) { case (?ic) ic.channelName; case null "" }) }; case null null });
    };
  };

  // Images stay in the Hub. Only the signed-in person and visible ticket participants
  // can be requested; recheck identities and permissions after the cross-canister call.
  func avatarParticipants(m : Me, ticketId : ?Nat) : [(Text, Text)] {
    let selected = Map.empty<Text, Text>();
    func add(pid : Text) {
      let email = emailOfPid(pid);
      if (email != "" and Hub.isActive(people, email) and Map.size(selected) < 32) Map.add(selected, Text.compare, pid, email);
    };
    add(m.id);
    switch (ticketId) {
      case null {};
      case (?id) {
        let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return [] };
        if (not canSee(m, t)) return [];
        add(t.requester); add(t.assignee);
        for (eid in (switch (Map.get(ticketEvents, Nat.compare, id)) { case (?xs) xs; case null [] }).vals()) {
          switch (Map.get(events, Nat.compare, eid)) {
            case (?e) { if (isStaff(m.role) or e.kind == "comment" or e.kind == "file" or e.kind == "created") add(e.who) };
            case null {};
          };
        };
      };
    };
    Iter.toArray(Map.entries(selected));
  };
  public shared func profilePictures(tok : Text, ticketId : ?Nat, personIds : [Text]) : async [(Text, Blob)] {
    if (personIds.size() > 4) return [];
    let before = switch (me(tok)) { case (?m) m; case null return [] };
    let expectedHub = hubId;
    let requested = Array.filter<(Text, Text)>(avatarParticipants(before, ticketId), func pair = Array.find<Text>(personIds, func pid = pid == pair.0) != null);
    if (expectedHub == "" or requested.size() == 0) return [];
    let photos = try { await (with timeout = 10) Hub.hub(expectedHub).connectorAvatars(Array.map<(Text, Text), Text>(requested, func pair = pair.1)) } catch (_) { return [] };
    let after = switch (me(tok)) { case (?m) m; case null return [] };
    if (hubId != expectedHub or after.id != before.id) return [];
    let allowed = avatarParticipants(after, ticketId);
    let out = List.empty<(Text, Blob)>();
    for ((pid, email) in requested.vals()) {
      if (Array.find<(Text, Text)>(allowed, func pair = pair.0 == pid and pair.1 == email) != null) {
        switch (Array.find<(Text, Blob)>(photos, func pair = pair.0 == email)) {
          case (?(_, image)) { if (image.size() <= 400_000) List.add(out, (pid, image)) };
          case null {};
        };
      };
    };
    List.toArray(out);
  };

  /// cards for every person id a ticket view mentions (no duplicates, no system/ai/group pseudo-actors)
  func peopleOf(t : Ticket, evs : [Event], fm : [FileMeta]) : [PersonCard] {
    let seen = Map.empty<Text, Bool>();
    let out = List.empty<PersonCard>();
    func add(pid : Text) {
      if (pid == "" or pid == "system" or pid == "ai" or Text.startsWith(pid, #text "group:") or Map.containsKey(seen, Text.compare, pid)) return;
      Map.add(seen, Text.compare, pid, true); List.add(out, card(pid));
    };
    add(t.requester); add(t.assignee);
    for (e in evs.vals()) add(e.who);
    for (f in fm.vals()) add(f.by);
    switch (Map.get(ticketTasks, Nat.compare, t.id)) { case (?ts) { for (x in ts.vals()) add(x.by) }; case null {} };
    switch (Map.get(approvals, Nat.compare, t.id)) { case (?a) { add(a.approver); add(a.decidedBy) }; case null {} };
    for ((k, v) in t.fields.vals()) if (fieldIsPerson(t.typeId, k)) add(v);
    List.toArray(out);
  };

  public shared query func stats(tok : Text) : async { total : Nat; new : Nat; open : Nat; waiting : Nat; resolved : Nat; closed : Nat; unassigned : Nat; breached : Nat; mine : Nat; approvals : Nat } {
    let z = { total = 0; new = 0; open = 0; waiting = 0; resolved = 0; closed = 0; unassigned = 0; breached = 0; mine = 0; approvals = 0 };
    let m = switch (staff(tok)) { case (?m) m; case null return z };
    var total = 0; var nw = 0; var op = 0; var wa = 0; var re = 0; var cl = 0; var un = 0; var br = 0; var mi = 0; var ap = 0;
    for ((_, t) in Map.entries(tickets)) if (projectOf(t.id) == 0 and canSee(m, t)) {
      total += 1;
      let active = t.status != "resolved" and t.status != "closed";
      switch (t.status) { case "new" nw += 1; case "open" op += 1; case "waiting" wa += 1; case "resolved" re += 1; case _ cl += 1 };
      if (active and t.assignee == "") un += 1;
      if (active and t.assignee == m.id) mi += 1;
      if (row(t).breached) br += 1;
    };
    for ((_, a) in Map.entries(approvals)) if (a.state == "pending") ap += 1;
    { total; new = nw; open = op; waiting = wa; resolved = re; closed = cl; unassigned = un; breached = br; mine = mi; approvals = ap };
  };

  // =====================================================================
  // actions
  // =====================================================================
  func markFirstResponse(t : Ticket) : Ticket = switch (t.firstResponseAt) { case null ({ t with firstResponseAt = ?now() }); case (?_) t };

  public shared func comment(tok : Text, id : Nat, body : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    if (not (isStaff(m.role) or t.requester == m.id)) return { ok = false; detail = "not your ticket" }; // approvers read, they do not write
    if (projectOf(id) != 0 and (not customerMessageRoom(id) or body.size() > 2000)) return { ok = false; detail = "Customer replies: maximum 2000 characters and 100 ticket events" };
    let b = norm(body);
    if (b == "" or b.size() > 20_000) return { ok = false; detail = "comment: 1-20000 characters" };
    if (t.status == "closed") return { ok = false; detail = "ticket is closed — reopen first" };
    if (projectOf(id) != 0) accountCustomer(id, Text.encodeUtf8(b).size());
    addCommentInternal<system>(t, m.id, b, isStaff(m.role) and t.requester != m.id, false);
    { ok = true; detail = "" };
  };
  /// One public comment, wherever it came from. fromSlack = it already lives in the thread; otherwise it is mirrored there.
  func addCommentInternal<system>(t0 : Ticket, who : Text, b : Text, asStaff : Bool, fromSlack : Bool) {
    var t = t0;
    ignore addEvent(t.id, who, if (asStaff) "agent" else "requester", "comment", b, if (fromSlack) [("via", "slack")] else []);
    if (asStaff) {
      t := markFirstResponse(t);
      put(t);
      notify<system>([t.requester], personName(who) # " replied · " # t.key, t.id, "desk", t.key # ":reply:" # Nat.toText(nextEventId));
    } else {
      // the one automatic transition: requester answers while we wait on them
      if (t.status == "waiting" and t.waitingOn == "requester") {
        t := { t with status = "open"; waitingOn = "" };
        ignore addEvent(t.id, "system", "system", "status", "open (requester replied)", [("status", "open")]);
      };
      put(t);
      notifyOwners<system>(t, personName(who) # " commented · " # t.key, t.key # ":comment:" # Nat.toText(nextEventId));
    };
    if (not fromSlack) slackMirrorPost(t.id, "*" # slackEsc(personName(who)) # "*: " # slackEsc(capText(b, 2_800)));
  };

  public shared func addNote(tok : Text, id : Nat, body : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    let b = norm(body);
    if (b == "" or b.size() > 20_000) return { ok = false; detail = "note: 1-20000 characters" };
    ignore addEvent(id, m.id, "agent", "note", b, []);
    put(t);
    { ok = true; detail = "" };
  };

  func applyStatus(t0 : Ticket, status : Text, waitingOn : Text, who : Text, actorKind : Text) : { ok : Bool; detail : Text; t : Ticket } {
    var t = t0;
    switch (customerWorkflows.get(t.id)) { case (?w) { if (w.definition.steps.size() > 0 and (status == "resolved" or status == "closed" or w.outcome != "")) return { ok = false; detail = "Use the project workflow to complete, cancel or reopen this request"; t } }; case null {} };
    switch (lifecycleCases.get(t.id)) { case (?c) { if ((status == "resolved" or status == "closed") and (c.state == #review or c.state == #reactivated)) return { ok = false; detail = "Review the account change before resolving this request"; t } }; case null {} };

    switch (hardwareCaseOf(t)) { case (?c) { if (c.state == "cancelled" and status != "closed" and status != "resolved") return { ok = false; detail = "Create a new offboarding if departure is planned again; this cancelled case preserves the previous decision"; t } }; case null {} };
    if ((status == "resolved" or status == "closed") and hardwareCaseOf(t) != null) {
      if (actorKind == "requester") return { ok = false; detail = "An agent must complete the offboarding"; t };
      let blocked = hardwareBlock(t); if (blocked != "") return { ok = false; detail = blocked; t };
    };
    if (not validStatus(status) or not validWaiting(waitingOn)) return { ok = false; detail = "bad status"; t };
    if (status == "waiting" and waitingOn == "") return { ok = false; detail = "waiting needs a reason (requester / third-party)"; t };
    if (waitingOn == "approval") return { ok = false; detail = "approval is set by the request type, not by hand"; t };
    if (status == "resolved" and openTasks(t.id) > 0) return { ok = false; detail = Nat.toText(openTasks(t.id)) # " checklist item(s) still open"; t };
    switch (Map.get(approvals, Nat.compare, t.id)) {
      case (?a) {
        if (a.state == "pending" and status != "closed") return { ok = false; detail = "approval pending — decide it first"; t };
        if (a.state == "rejected" and status != "closed") return { ok = false; detail = "this request was rejected — file a new one"; t };
        if (a.state == "pending" and status == "closed") { // closing cancels the approval
          Map.add(approvals, Nat.compare, t.id, { a with state = "cancelled"; decidedBy = who; at = now() });
          ignore addEvent(t.id, "system", "system", "approval", "approval cancelled (ticket closed)", [("decision", "cancelled")]);
        };
      };
      case null {};
    };
    if (t.status == status and t.waitingOn == waitingOn) return { ok = false; detail = "already " # status; t };
    t := { t with status; waitingOn = if (status == "waiting") waitingOn else "" };
    if (status == "resolved") t := { t with resolvedAt = ?now(); closedAt = null };
    if (status == "closed") t := { t with closedAt = ?now(); resolvedAt = (switch (t.resolvedAt) { case (?r) ?r; case null ?now() }) };
    if (status == "open" or status == "new" or status == "waiting") t := { t with resolvedAt = null; closedAt = null };
    ignore addEvent(t.id, who, actorKind, "status", status # (if (status == "waiting") " on " # waitingOn else ""), [("status", status), ("waitingOn", waitingOn)]);
    { ok = true; detail = ""; t };
  };

  public shared func setStatus(tok : Text, id : Nat, status : Text, waitingOn : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    switch (lifecycleCases.get(id)) { case (?c) { if ((status == "resolved" or status == "closed") and (c.state == #review or c.state == #reactivated)) return { ok = false; detail = "Review the account change before resolving this request" } }; case null {} };
    if ((status == "resolved" or status == "closed") and hardwareCaseOf(t) != null) ignore await syncHardware(id);
    let current = tickets.get(id) ?? (return { ok = false; detail = "Ticket unavailable" });
    let viewer = staff(tok) ?? (return { ok = false; detail = "Session expired" });
    if (viewer.id != m.id or not canSee(viewer, current) or current != t) return { ok = false; detail = "The ticket changed. Refresh before updating its status." };
    let r = applyStatus(t, status, waitingOn, m.id, "agent");
    if (not r.ok) return { ok = false; detail = r.detail };
    var nt = r.t;
    if (status == "resolved" or status == "waiting") nt := markFirstResponse(nt);
    put(nt);
    if (status == "resolved") notify<system>([nt.requester], "Resolved · " # nt.key # " " # nt.subject, id, "desk", nt.key # ":resolved:" # Nat.toText(nextEventId));
    if (status == "waiting" and waitingOn == "requester") notify<system>([nt.requester], "We need your input · " # nt.key, id, "desk", nt.key # ":waiting:" # Nat.toText(nextEventId));
    slackMirrorStatus(nt, t.status, personName(m.id), false);
    { ok = true; detail = "" };
  };

  /// Requester: self-resolve or reopen own ticket.
  public shared func requesterSetStatus(tok : Text, id : Nat, status : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    if (t.requester != m.id) return { ok = false; detail = "not your ticket" };
    if (status != "resolved" and status != "open") return { ok = false; detail = "you can resolve or reopen" };
    let r = applyStatus(t, status, "", m.id, "requester");
    if (not r.ok) return { ok = false; detail = r.detail };
    put(r.t);
    notifyOwners<system>(r.t, personName(m.id) # " " # (if (status == "open") "reopened" else "resolved") # " · " # t.key, t.key # ":rq:" # Nat.toText(nextEventId));
    slackMirrorStatus(r.t, t.status, personName(m.id), false);
    { ok = true; detail = "" };
  };

  public shared func assign(tok : Text, id : Nat, email : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    var t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    let e = lower(norm(email)); // the picker hands over an address (or an id); stored is the person id
    let pid = if (e == "") "" else if (Text.contains(e, #char '@')) pidOf(e) else e;
    let em = if (pid == "") "" else emailOfPid(pid);
    if (pid != "" and (em == "" or not isStaff(roleOf(em)))) return { ok = false; detail = e # " needs Agent or Admin in Hub Permissions" };
    if (pid != "" and projectOf(id) != 0 and not projectEmailAccess(em, projectOf(id))) return { ok = false; detail = "Choose an agent from this project team" };
    if (pid == t.assignee) return { ok = false; detail = "unchanged" };
    t := { t with assignee = pid };
    if (t.status == "new" and pid != "") t := { t with status = "open" };
    put(t);
    ignore addEvent(id, m.id, "agent", "assign", if (pid == "") "unassigned" else "assigned to " # personName(pid), [("assignee", pid)]);
    if (pid != "" and pid != m.id) notify<system>([pid], "Assigned to you · " # t.key # " " # t.subject, id, "desk", t.key # ":assign:" # pid);
    { ok = true; detail = "" };
  };

  public shared func setQueue(tok : Text, id : Nat, queue : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    var t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (projectOf(id) != 0) return { ok = false; detail = "Customer project and submitted fields are fixed. Manage the team in Customer projects." };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    let q = capText(norm(queue), 80);
    if (q == "" or q == t.queue) return { ok = false; detail = "unchanged" };
    t := { t with queue = q };
    put(t);
    ignore addEvent(id, m.id, "agent", "queue", "moved to " # q, [("queue", q)]);
    if (t.assignee == "") notifyQueue<system>(t, "Moved to your queue · " # t.key # " " # t.subject, t.key # ":queue:" # q);
    { ok = true; detail = "" };
  };

  public shared func setPriority(tok : Text, id : Nat, priority : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    if (not validPriority(priority)) return { ok = false; detail = "bad priority" };
    if (priority == t.priority) return { ok = false; detail = "unchanged" };
    put({ t with priority });
    ignore addEvent(id, m.id, "agent", "priority", priority, [("priority", priority)]);
    { ok = true; detail = "" };
  };

  public shared func setSubject(tok : Text, id : Nat, subject : Text, body : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    if (not (isStaff(m.role) or t.requester == m.id)) return { ok = false; detail = "not your ticket" };
    if (t.status == "closed") return { ok = false; detail = "ticket is closed" };
    if (norm(subject) == "") return { ok = false; detail = "subject is required" };
    put({ t with subject = capText(norm(subject), 160); body = capText(body, 20_000) });
    ignore addEvent(id, m.id, if (isStaff(m.role)) "agent" else "requester", "field", "subject/description edited", []);
    { ok = true; detail = "" };
  };

  public shared func setFields(tok : Text, id : Nat, fields : [(Text, Text)]) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    var t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (projectOf(id) != 0) return { ok = false; detail = "Customer project and submitted fields are fixed. Manage the team in Customer projects." };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    let rt = switch (typeOf(t.typeId)) { case (?r) r; case null return { ok = false; detail = "type missing" } };
    let err = validateFields(rt, fields);
    if (err != "") return { ok = false; detail = err };
    let converted = personFieldsToIds(rt, knownFields(rt, fields));
    if (hardwareProgress.containsKey(id) and fieldValue(converted, "person") != ticketSubject(t)) return { ok = false; detail = "This hardware case stays linked to its original person. Create a separate offboarding for someone else." };
    switch (lifecycleCases.get(id)) { case (?c) { if (fieldValue(converted, "person") != c.personId) return { ok = false; detail = "A directory follow-up stays linked to its original person. Create a separate request for someone else." } }; case null {} };
    t := { t with fields = converted };
    if (rt.dueField != "") { switch (parseIsoNs(fieldValue(fields, rt.dueField))) { case (?ns) t := { t with dueAt = ?ns }; case null {} } };
    put(t);
    ignore addEvent(id, m.id, "agent", "field", "fields updated", []);
    { ok = true; detail = "" };
  };

  public shared func setDue(tok : Text, id : Nat, dueAt : ?Int) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    put({ t with dueAt });
    ignore addEvent(id, m.id, "agent", "field", switch (dueAt) { case (?d) "due date set (" # Int.toText(d / D) # " d since epoch)"; case null "due date cleared" }, []);
    { ok = true; detail = "" };
  };

  public shared func addLink(tok : Text, id : Nat, kind : Text, ref : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    let k = capText(lower(norm(kind)), 40); let r = capText(norm(ref), 500);
    if (k == "" or r == "" or t.links.size() >= 30) return { ok = false; detail = "kind + ref required (max 30 links)" };
    put({ t with links = Array.concat(t.links, [(k, r)]) });
    ignore addEvent(id, m.id, "agent", "link", k # ":" # r, [("kind", k), ("ref", r)]);
    { ok = true; detail = "" };
  };
  public shared func removeLink(tok : Text, id : Nat, kind : Text, ref : Text) : async Bool {
    if (migrating()) return false;
    switch (staff(tok)) {
      case null false;
      case (?m) {
        switch (Map.get(tickets, Nat.compare, id)) {
          case null false;
          case (?t) {
            if (not canSee(m, t)) return false;
            put({ t with links = Array.filter<(Text, Text)>(t.links, func(l) = not (l.0 == kind and l.1 == ref)) });
            ignore addEvent(id, m.id, "agent", "link", "removed " # kind # ":" # ref, []);
            true;
          };
        };
      };
    };
  };

  public shared func setTask(tok : Text, id : Nat, idx : Nat, state : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    if (state != "open" and state != "done" and state != "na") return { ok = false; detail = "state must be open, done or na" };
    switch (lifecycleCases.get(id)) { case (?c) { if (state != "open" and (c.state == #review or c.state == #reactivated)) return { ok = false; detail = "Review the account change before continuing the checklist" } }; case null {} };
    let ts = switch (Map.get(ticketTasks, Nat.compare, id)) { case (?ts) ts; case null return { ok = false; detail = "no checklist" } };
    if (idx >= ts.size()) return { ok = false; detail = "no such item" };
    if (ts[idx].by == "system:assets") return { ok = false; detail = "Hardware progress is managed in Assets. Use the person panel to refresh it." };
    let upd = Array.tabulate<Task>(ts.size(), func(i) = if (i == idx) ({ title = ts[i].title; state; by = m.id; at = now() }) else ts[i]);
    Map.add(ticketTasks, Nat.compare, id, upd);
    put(t);
    ignore addEvent(id, m.id, "agent", "task", ts[idx].title # " → " # state, [("idx", Nat.toText(idx)), ("state", state)]);
    { ok = true; detail = "" };
  };
  public shared func addTask(tok : Text, id : Nat, title : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; detail = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    if (norm(title) == "") return { ok = false; detail = "title required" };
    let ts = switch (Map.get(ticketTasks, Nat.compare, id)) { case (?ts) ts; case null [] };
    if (ts.size() >= 60) return { ok = false; detail = "max 60 items" };
    Map.add(ticketTasks, Nat.compare, id, Array.concat(ts, [{ title = capText(norm(title), 200); state = "open"; by = ""; at = 0 }]));
    put(t);
    ignore addEvent(id, m.id, "agent", "task", "added: " # norm(title), []);
    { ok = true; detail = "" };
  };

  public shared func decideApproval(tok : Text, id : Nat, approve : Bool, note : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; detail = "no session" } };
    var t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; detail = "no such ticket" } };
    if (not canSee(m, t)) return { ok = false; detail = "No access to this ticket" };
    let a = switch (Map.get(approvals, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "nothing to approve" } };
    if (a.state != "pending") return { ok = false; detail = "already " # a.state };
    if (not (t.status == "waiting" and t.waitingOn == "approval")) return { ok = false; detail = "ticket is no longer waiting for approval" };
    if (not (isApprover(m, id) or m.role == "admin")) return { ok = false; detail = "you are not the approver" };
    if (m.id == t.requester) return { ok = false; detail = "you cannot approve your own request — an admin can re-route it" };
    Map.add(approvals, Nat.compare, id, { a with state = if (approve) "approved" else "rejected"; decidedBy = m.id; at = now(); note = capText(norm(note), 1000) });
    ignore addEvent(id, m.id, if (isStaff(m.role)) "agent" else "requester", "approval", (if (approve) "approved" else "rejected") # (if (norm(note) == "") "" else " — " # norm(note)), [("decision", if (approve) "approved" else "rejected")]);
    if (approve) {
      // SLA clocks start now — nobody could work the ticket while it waited
      let rt = typeOf(t.typeId);
      let respondBy : ?Int = switch (rt) { case (?r) { if (r.respondH > 0) ?(now() + r.respondH * H) else null }; case null t.respondBy };
      let dueAt : ?Int = switch (rt) { case (?r) { if (r.dueField != "" or r.resolveH == 0) t.dueAt else ?(now() + r.resolveH * H) }; case null t.dueAt };
      t := { t with status = "new"; waitingOn = ""; closedAt = null; resolvedAt = null; respondBy; dueAt };
      put(t);
      ignore addEvent(id, "system", "system", "status", "new (approved)", [("status", "new")]);
      notifyQueue<system>(t, "Approved, ready to work · " # t.key # " " # t.subject, t.key # ":approved");
      notify<system>([t.requester], "Approved · " # t.key # " " # t.subject, id, "desk", t.key # ":approved:req");
    } else {
      t := { t with status = "closed"; waitingOn = ""; closedAt = ?now() };
      put(t);
      ignore addEvent(id, "system", "system", "status", "closed (rejected)", [("status", "closed")]);
      notify<system>([t.requester], "Not approved · " # t.key # " " # t.subject, id, "desk", t.key # ":rejected");
    };
    { ok = true; detail = "" };
  };

  /// Re-route a pending approval (admin), e.g. when the manager attribute is wrong.
  public shared func setApprover(tok : Text, id : Nat, approver : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let a = switch (Map.get(approvals, Nat.compare, id)) { case (?a) a; case null return { ok = false; detail = "no approval on this ticket" } };
    if (a.state != "pending") return { ok = false; detail = "already decided" };
    let ap = norm(approver);
    if (ap == "" or ap == "group:") return { ok = false; detail = "approver required (e-mail or group:<name>)" };
    let target = if (Text.startsWith(ap, #text "group:")) ap else if (Text.contains(ap, #char '@')) pidOf(lower(ap)) else ap; // address from the picker → person id
    Map.add(approvals, Nat.compare, id, { a with approver = target });
    ignore addEvent(id, m.id, "agent", "approval", "approver changed to " # approverLabel(target), [("approver", target)]);
    let who = if (Text.startsWith(ap, #text "group:")) membersOf(groupName(ap)) else [target];
    notify<system>(who, "Approval needed · " # nextKey(id), id, "approval", nextKey(id) # ":approval2");
    { ok = true; detail = "" };
  };

  // ---- files ----
  public shared func addFile(tok : Text, id : Nat, name : Text, mime : Text, data : Blob) : async { ok : Bool; id : Nat; detail : Text } {
    if (migrating()) return { ok = false; id = 0; detail = MIGRATING };
    let m = switch (me(tok)) { case (?m) m; case null return { ok = false; id = 0; detail = "no session" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; id = 0; detail = "no such ticket" } };
    if (projectOf(id) != 0 or not canSee(m, t) or not (isStaff(m.role) or t.requester == m.id)) return { ok = false; id = 0; detail = "not your ticket" };
    if (t.status == "closed") return { ok = false; id = 0; detail = "ticket is closed" };
    if (data.size() == 0 or data.size() > MAX_FILE) return { ok = false; id = 0; detail = "file must be 1 byte – 1.5 MB" };
    if (fileBytes + data.size() > MAX_FILE_BYTES_TOTAL) return { ok = false; id = 0; detail = "attachment storage is full — ask an admin" };
    let cur = switch (Map.get(ticketFiles, Nat.compare, id)) { case (?xs) xs; case null [] };
    if (cur.size() >= MAX_FILES_PER_TICKET) return { ok = false; id = 0; detail = "max 20 files per ticket" };
    let fid = nextFileId;
    nextFileId += 1;
    Map.add(files, Nat.compare, fid, { id = fid; ticketId = id; name = capText(norm(name), 120); mime = capText(norm(mime), 60); size = data.size(); data; by = m.id; at = now() });
    Map.add(ticketFiles, Nat.compare, id, Array.concat(cur, [fid]));
    fileBytes += data.size();
    put(t);
    ignore addEvent(id, m.id, if (isStaff(m.role) and t.requester != m.id) "agent" else "requester", "file", norm(name), [("fileId", Nat.toText(fid))]);
    { ok = true; id = fid; detail = "" };
  };
  public shared query func fileData(tok : Text, fid : Nat) : async ?{ name : Text; mime : Text; data : Blob } {
    let m = switch (me(tok)) { case (?m) m; case null return null };
    let f = switch (Map.get(files, Nat.compare, fid)) { case (?f) f; case null return null };
    let t = switch (Map.get(tickets, Nat.compare, f.ticketId)) { case (?t) t; case null return null };
    if (not canSee(m, t)) return null;
    ?{ name = f.name; mime = f.mime; data = f.data };
  };

  // =====================================================================
  // AI (assistive only: notes, summaries, drafts — never silent changes)
  // =====================================================================
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
    is_replicated : ?Bool; // false: single node, no consensus — right for non-deterministic APIs
  };
  transient let icHttp : actor { http_request : HttpRequestArgs -> async HttpResponsePayload } = actor ("aaaaa-aa");

  func jStr(j : Json.Json, path : Text) : Text { switch (Json.getAsText(j, path)) { case (#ok(t)) t; case (_) "" } };

  func stripFences(t : Text) : Text {
    var s = Text.trim(t, #char ' ');
    s := Text.trim(s, #char '\n');
    s := Text.replace(s, #text "```json", "");
    s := Text.replace(s, #text "```", "");
    Text.trim(s, #char '\n');
  };

  // ---- where the AI key comes from: the hub first (lane "ai", one key for the suite), the local fields as fallback ----
  transient var hubAi : ?Hub.AiCredentials = null;
  transient var hubAiAt : Int = 0;
  transient var hubAiTried : Bool = false;
  /// Refresh the hub's credentials when the cache is older than 5 minutes (or after an upgrade). Never throws.
  func refreshHubAi() : async () {
    if (hubId == "") return;
    if (hubAiTried and now() - hubAiAt < 5 * 60_000_000_000) return;
    hubAiTried := true; hubAiAt := now();
    hubAi := try { await Hub.hub(hubId).hub_aiCredentials() } catch (_) { null };
  };
  type AiCreds = { provider : Text; url : Text; model : Text; key : Text; source : Text };
  func aiCreds() : async ?AiCreds {
    await refreshHubAi();
    switch (hubAi) {
      case (?c) ?{ provider = c.provider; url = c.url; model = c.model; key = c.key; source = "hub" };
      case null { if (aiUrl != "" and aiKey != "") ?{ provider = aiProvider; url = aiUrl; model = aiModel; key = aiKey; source = "local" } else null };
    };
  };
  /// "hub" | "local" | "" — from the cache (queries cannot ask the hub)
  func aiSource() : Text = switch (hubAi) { case (?_) "hub"; case null { if (aiUrl != "" and aiKey != "") "local" else "" } };

  /// One completion. Returns "" on any failure — callers fall back gracefully.
  func aiComplete(sysPrompt : Text, user : Text, maxTokens : Nat) : async Text {
    let cr = switch (await aiCreds()) { case (?c) c; case null return "" };
    let aiProvider = cr.provider; let aiUrl = cr.url; let aiModel = cr.model; let aiKey = cr.key;
    let anthropic = aiProvider == "anthropic";
    let body = if (anthropic)
      "{\"model\":\"" # jsonEsc(aiModel) # "\",\"max_tokens\":" # Nat.toText(maxTokens) # ",\"system\":\"" # jsonEsc(sysPrompt) # "\",\"messages\":[{\"role\":\"user\",\"content\":\"" # jsonEsc(capText(user, 12_000)) # "\"}]}"
    else
      "{\"model\":\"" # jsonEsc(aiModel) # "\",\"temperature\":0.2,\"max_tokens\":" # Nat.toText(maxTokens) # ",\"messages\":[{\"role\":\"system\",\"content\":\"" # jsonEsc(sysPrompt) # "\"},{\"role\":\"user\",\"content\":\"" # jsonEsc(capText(user, 12_000)) # "\"}]}";
    let headers = if (anthropic) [
      { name = "x-api-key"; value = aiKey }, { name = "anthropic-version"; value = "2023-06-01" }, { name = "Content-Type"; value = "application/json" },
    ] else [
      { name = "Authorization"; value = "Bearer " # aiKey }, { name = "Content-Type"; value = "application/json" },
    ];
    let req : HttpRequestArgs = { url = aiUrl; max_response_bytes = ?200_000; headers; body = ?Text.encodeUtf8(body); method = #post; transform = null; is_replicated = ?false };
    let res = try { await (with timeout = 60) icHttp.http_request(req) } catch (_) { return "" };
    if (cr.source == "hub") { try { await Hub.hub(hubId).hub_aiUsed(1) } catch (_) {} }; // the owner sees who uses the company key
    if (res.status != 200) return "";
    let txt = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null return "" };
    let outer = switch (Json.parse(Hub.sanitizeSurrogates(txt))) { case (#ok(j)) j; case (#err(_)) return "" };
    if (anthropic) {
      switch (Json.get(outer, "content")) {
        case (?#array(items)) { for (it in items.vals()) if (jStr(it, "type") == "text") return jStr(it, "text"); "" };
        case (_) "";
      };
    } else jStr(outer, "choices[0].message.content");
  };

  /// What the model may see: sensitive fields redacted, internal notes never included.
  func ticketText(t : Ticket, withEvents : Bool) : Text {
    var s = "Ticket " # t.key # "\nSubject: " # t.subject # "\nStatus: " # t.status # " " # t.waitingOn # "\nPriority: " # t.priority # "\nRequester: " # personName(t.requester);
    let rt = typeOf(t.typeId);
    switch (rt) { case (?r) s #= "\nType: " # r.name; case null {} };
    for ((k, v) in t.fields.vals()) {
      var sensitive = false;
      switch (rt) { case (?r) { for (f in r.fields.vals()) if (f.key == k and f.sensitive) sensitive := true }; case null {} };
      s #= "\n" # k # ": " # (if (sensitive) "[redacted]" else v);
    };
    s #= "\n\nDescription:\n" # t.body;
    if (withEvents) {
      s #= "\n\nTimeline:";
      for (eid in (switch (Map.get(ticketEvents, Nat.compare, t.id)) { case (?xs) xs; case null [] }).vals()) {
        switch (Map.get(events, Nat.compare, eid)) {
          case (?e) { if (e.kind == "comment" or e.kind == "status" or e.kind == "approval") s #= "\n[" # e.actorKind # " " # e.kind # "] " # capText(e.body, 600) };
          case null {};
        };
      };
    };
    s;
  };

  func scheduleTriage<system>(id : Nat) {
    ignore Timer.setTimer<system>(#seconds 0, func() : async () { await triage(id) });
  };

  func triage(id : Nat) : async () {
    if (projectOf(id) != 0) return;
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return };
    var names = "";
    for (rt in orderedTypes().vals()) if (rt.enabled) names #= (if (names == "") "" else "|") # rt.name;
    let sys = "You triage internal IT/service requests for an IT team. Reply with ONLY a JSON object, no prose, no code fences, keys exactly: summary (1-2 sentences, what is needed), priority (low|normal|high|urgent; urgent only for outages, security incidents or many people blocked), suggestedType (one of: " # names # "), questions (array of up to 3 short clarifying questions the agent should ask, may be empty), sensitive (true if the text contains personal data that should not be shared widely).";
    let out = await aiComplete(sys, ticketText(t, false), 400);
    if (out == "") return;
    let obj = switch (Json.parse(stripFences(out))) { case (#ok(j)) j; case (#err(_)) return };
    let summary = jStr(obj, "summary");
    let prio = jStr(obj, "priority");
    let sugg = jStr(obj, "suggestedType");
    var qs = "";
    switch (Json.get(obj, "questions")) {
      case (?#array(items)) { for (it in items.vals()) { switch (it) { case (#string(q)) qs #= "\n• " # q; case (_) {} } } };
      case (_) {};
    };
    let tn = switch (typeOf(t.typeId)) { case (?rt) rt.name; case null "" };
    var body = (if (summary == "") "triage" else summary);
    if (validPriority(prio) and prio != t.priority) body #= "\nSuggested priority: " # prio # " (current " # t.priority # ")";
    if (sugg != "" and sugg != tn) body #= "\nLooks more like: " # sugg;
    if (qs != "") body #= "\nWorth asking:" # qs;
    ignore addEvent(id, "ai", "ai", "ai", body, [("priority", prio), ("suggestedType", sugg)]);
    // keep updatedAt untouched: AI notes are not "activity" on the ticket
  };

  public shared func aiSummary(tok : Text, id : Nat) : async { ok : Bool; text : Text } {
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; text = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; text = "no such ticket" } };
    if (not canSee(m, t) or projectOf(id) != 0) return { ok = false; text = "AI assistance is available for internal support only" };
    if ((await aiCreds()) == null) return { ok = false; text = "AI is not configured — the hub has no key for this app and there is no local fallback (Settings → AI)" };
    let out = await aiComplete("You summarise an internal service ticket for an agent who is picking it up. Plain text, max 6 lines: what is asked, what happened so far, what is blocking, the next concrete step. No preamble.", ticketText(t, true), 350);
    if (staff(tok) == null) return { ok = false; text = "Access changed" };
    if (out == "") return { ok = false; text = "AI call failed" };
    ignore addEvent(id, "ai", "ai", "ai", "Summary (requested by " # personName(m.id) # "):\n" # out, [("kind", "summary")]);
    { ok = true; text = out };
  };

  public shared func aiDraft(tok : Text, id : Nat, intent : Text) : async { ok : Bool; text : Text } {
    let m = switch (staff(tok)) { case (?m) m; case null return { ok = false; text = "agents only" } };
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return { ok = false; text = "no such ticket" } };
    if (not canSee(m, t) or projectOf(id) != 0) return { ok = false; text = "AI assistance is available for internal support only" };
    if ((await aiCreds()) == null) return { ok = false; text = "AI is not configured — the hub has no key for this app and there is no local fallback (Settings → AI)" };
    let sys = "You draft a reply from an IT support agent to the requester of an internal service ticket. Friendly, concise, plain text, no subject line, no sign-off name. Never invent facts or promises; if information is missing, ask for it. Address the requester by first name if known." # (if (norm(intent) == "") "" else " The agent wants to: " # capText(norm(intent), 400));
    let out = await aiComplete(sys, ticketText(t, true), 400);
    if (staff(tok) == null) return { ok = false; text = "Access changed" };
    if (out == "") return { ok = false; text = "AI call failed" };
    { ok = true; text = out }; // a draft: never stored, never sent
  };

  public shared func aiTest(tok : Text) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    let out = await aiComplete("Reply with the single word: pong", "ping", 10);
    if (out == "") ({ ok = false; detail = "no answer — check URL, key, model, and that the provider matches the endpoint" }) else ({ ok = true; detail = capText(out, 60) });
  };

  // =====================================================================
  // Slack intake — a support channel becomes a queue
  // =====================================================================
  // The Slack app ("bot") lives in the hub (Settings → Slack). An admin assigns
  // it to this desk there; desk fetches token + signing secret with
  // hub_slackCredentials (kept write-only here, never sent to a browser). A
  // message from a person in a configured channel becomes a request; the bot
  // answers in the thread with the key. Replies in the thread land on the
  // request, replies from desk land in the thread. A ✅ on the first message
  // resolves; removing it reopens. Slack posts to
  // https://<backend>.<gateway>/slack/events (Events API), signed with the
  // secret; we verify, dedupe and ack fast — the work happens after the ack's
  // state commit, so Slack's retries turn into no-ops.
  public type SlackIntake = { id : Nat; name : Text; hubBotId : Nat; channel : Text; channelName : Text; typeId : Nat; enabled : Bool; createdAt : Int; lastEventAt : Int; lastResult : Text };
  let slackIntakes : Map.Map<Nat, SlackIntake> = Map.empty<Nat, SlackIntake>();
  var nextSlackIntakeId : Nat = 1;
  type SlackCred = { name : Text; teamName : Text; token : Text; signing : Text; botUserId : Text };
  let slackCreds : Map.Map<Nat, SlackCred> = Map.empty<Nat, SlackCred>(); // hub bot id -> credentials (write-only)
  var slackCredsAt : Int = 0;
  var slackCredsError : Text = "";
  var slackGateway : Text = "icp.net"; // the HTTP gateway Slack reaches this backend through
  type SlackAnchor = { intakeId : Nat; channel : Text; ts : Text }; // the first message of a request's thread
  let slackAnchor : Map.Map<Nat, SlackAnchor> = Map.empty<Nat, SlackAnchor>(); // ticket id -> anchor
  let slackByTs : Map.Map<Text, Nat> = Map.empty<Text, Nat>(); // "<channel>#<ts>" -> ticket id (0 = being created)
  let slackSeen : Map.Map<Text, Int> = Map.empty<Text, Int>(); // event id -> at (Slack retries while we work)
  let slackUserEmail : Map.Map<Text, Text> = Map.empty<Text, Text>(); // slack user id -> e-mail
  type SlackOut = { ticketId : Nat; kind : Text; text : Text; emoji : Text; add : Bool }; // kind: post | react
  let slackOutbox = List.empty<SlackOut>();
  transient var slackFlushing : Bool = false;
  transient var slackCredsRunning : Bool = false;
  type HubSlack = actor { hub_slackCredentials : shared query () -> async [{ id : Nat; name : Text; teamName : Text; token : Text; signingSecret : Text }] };

  func selfHost() : Text = Principal.toText(Principal.fromActor(Desk)) # "." # slackGateway;
  func slackEventsUrl() : Text = "https://" # selfHost() # "/slack/events";
  func intakeByChannel(ch : Text) : ?SlackIntake { for ((_, ic) in Map.entries(slackIntakes)) if (ic.channel == ch) return ?ic; null };
  func touchIntake(id : Nat, result : Text) {
    switch (Map.get(slackIntakes, Nat.compare, id)) { case (?ic) Map.add(slackIntakes, Nat.compare, id, { ic with lastEventAt = now(); lastResult = capText(result, 200) }); case null {} };
  };
  func firstLine(t : Text, max : Nat) : Text {
    var out = ""; var i = 0;
    label walk for (c in t.chars()) { if (c == '\n' or i >= max) break walk; out #= Char.toText(c); i += 1 };
    let o = norm(out);
    if (o == "") "(message without text)" else if (i >= max) o # "…" else o;
  };

  // ---- Slack Web API (bot token; single-node outcalls) ----
  func slackApi(token : Text, method : Text, jsonBody : ?Text) : async HttpResponsePayload {
    let req : HttpRequestArgs = {
      url = "https://slack.com/api/" # method; max_response_bytes = ?200_000;
      headers = [{ name = "Authorization"; value = "Bearer " # token }, { name = "Content-Type"; value = "application/json; charset=utf-8" }];
      body = (switch (jsonBody) { case (?b) ?Text.encodeUtf8(b); case null null }); method = (switch (jsonBody) { case (?_) #post; case null #get }); transform = null; is_replicated = ?false;
    };
    try { await (with timeout = 30) icHttp.http_request(req) } catch (_) { { status = 599; headers = []; body = Text.encodeUtf8("") } };
  };
  func parseSlack(res : HttpResponsePayload) : { ok : Bool; json : Json.Json; detail : Text } {
    let txt = switch (Text.decodeUtf8(res.body)) { case (?t) t; case null "" };
    if (res.status != 200) return { ok = false; json = #null_; detail = "HTTP " # Nat.toText(res.status) # (if (res.status == 599) " (outcall failed)" else ": " # capText(txt, 160)) };
    switch (Json.parse(Hub.sanitizeSurrogates(txt))) {
      case (#err(_)) ({ ok = false; json = #null_; detail = "unreadable Slack reply" });
      case (#ok(j)) { switch (Json.get(j, "ok")) { case (?#bool(true)) ({ ok = true; json = j; detail = "" }); case (_) ({ ok = false; json = j; detail = "Slack says: " # jStr(j, "error") }) } };
    };
  };
  func credOf(hubBotId : Nat) : ?SlackCred = Map.get(slackCreds, Nat.compare, hubBotId);

  /// Pull bot token + signing secret for every bot the hub assigned to this desk; resolve the bot's own user id once.
  func refreshSlackCreds() : async { ok : Bool; count : Nat; detail : Text } {
    if (hubId == "") return { ok = false; count = 0; detail = "hub not set" };
    if (slackCredsRunning) return { ok = false; count = Map.size(slackCreds); detail = "already refreshing" };
    slackCredsRunning := true;
    try {
      let hub : HubSlack = actor (hubId);
      let rows = try { await (with timeout = 30) hub.hub_slackCredentials() } catch (e) {
        slackCredsError := capText(Error.message(e), 160);
        return { ok = false; count = Map.size(slackCreds); detail = "the hub did not answer: " # slackCredsError };
      };
      let fresh = Map.empty<Nat, SlackCred>();
      for (r in rows.vals()) {
        let prevBot = switch (Map.get(slackCreds, Nat.compare, r.id)) { case (?p) p.botUserId; case null "" };
        Map.add(fresh, Nat.compare, r.id, { name = r.name; teamName = r.teamName; token = r.token; signing = r.signingSecret; botUserId = prevBot });
      };
      slackCreds.clear();
      for ((k, v) in Map.entries(fresh)) Map.add(slackCreds, Nat.compare, k, v);
      for ((k, v) in Map.entries(fresh)) {
        if (v.botUserId == "" and v.token != "") {
          let p = parseSlack(await slackApi(v.token, "auth.test", ?"{}"));
          if (p.ok) Map.add(slackCreds, Nat.compare, k, { v with botUserId = jStr(p.json, "user_id"); teamName = (if (v.teamName == "") jStr(p.json, "team") else v.teamName) });
        };
      };
      slackCredsAt := now(); slackCredsError := "";
      { ok = true; count = Map.size(slackCreds); detail = (if (Map.size(slackCreds) == 0) "the hub assigned no Slack bot to this desk yet — Hub → Settings → Slack → assign to desk" else "") };
    } finally { slackCredsRunning := false };
  };

  /// Slack user id → e-mail (cached; users.info needs users:read.email).
  func slackEmail(cred : SlackCred, userId : Text) : async Text {
    if (userId == "") return "";
    switch (Map.get(slackUserEmail, Text.compare, userId)) { case (?e) return e; case null {} };
    let p = parseSlack(await slackApi(cred.token, "users.info?user=" # userId, null));
    if (not p.ok) return "";
    let email = lower(norm(jStr(p.json, "user.profile.email")));
    if (email != "" and Text.contains(email, #char '@')) Map.add(slackUserEmail, Text.compare, userId, email);
    email;
  };

  // ---- outbox: what desk says back into Slack, flushed by a timer (never blocks a button) ----
  func slackMirrorPost(ticketId : Nat, text : Text) {
    if (not Map.containsKey(slackAnchor, Nat.compare, ticketId)) return;
    List.add(slackOutbox, { ticketId; kind = "post"; text; emoji = ""; add = true });
  };
  func slackMirrorReact(ticketId : Nat, emoji : Text, add : Bool) {
    if (not Map.containsKey(slackAnchor, Nat.compare, ticketId)) return;
    List.add(slackOutbox, { ticketId; kind = "react"; text = ""; emoji; add });
  };
  /// A status change seen from Slack's side. fromSlack = the ✅ is already there (a person set it).
  func slackMirrorStatus(t : Ticket, oldStatus : Text, who : Text, fromSlack : Bool) {
    if (not Map.containsKey(slackAnchor, Nat.compare, t.id)) return;
    let link = ticketUrl(t.id);
    let view = if (link == "") "" else " <" # link # "|Open request>";
    if (t.status == "resolved" and oldStatus != "resolved") {
      if (not fromSlack) slackMirrorReact(t.id, "white_check_mark", true);
      slackMirrorPost(t.id, ":white_check_mark: *" # t.key # "* resolved" # (if (who == "") "" else " by " # slackEsc(who)) # ". Not fixed after all? Remove the :white_check_mark: from the first message (or reopen it in desk) and the team takes another look." # view);
    } else if ((t.status == "open" or t.status == "new") and (oldStatus == "resolved" or oldStatus == "closed")) {
      if (not fromSlack) slackMirrorReact(t.id, "white_check_mark", false);
      slackMirrorPost(t.id, ":leftwards_arrow_with_hook: *" # t.key # "* reopened" # (if (who == "") "" else " by " # slackEsc(who)) # "." # view);
    } else if (t.status == "waiting" and t.waitingOn == "requester") {
      slackMirrorPost(t.id, ":hourglass_flowing_sand: *" # t.key # "* — the team needs your input. Reply in this thread." # view);
    } else if (t.status == "closed" and oldStatus != "closed" and oldStatus != "resolved") {
      slackMirrorPost(t.id, ":lock: *" # t.key # "* closed" # (if (who == "") "" else " by " # slackEsc(who)) # "." # view);
    };
  };
  func flushSlackOutbox() : async () {
    if (slackFlushing or List.size(slackOutbox) == 0) return;
    slackFlushing := true;
    try {
      var n = 0;
      label flush while (n < 6 and List.size(slackOutbox) > 0) {
        let item = switch (List.removeLast(slackOutbox)) { case (?x) x; case null return }; // LIFO is fine: items are independent per ticket
        n += 1;
        let a = switch (Map.get(slackAnchor, Nat.compare, item.ticketId)) { case (?a) a; case null continue flush };
        let ic = switch (Map.get(slackIntakes, Nat.compare, a.intakeId)) { case (?ic) ic; case null continue flush };
        let cred = switch (credOf(ic.hubBotId)) { case (?c) c; case null { touchIntake(ic.id, "no credentials for bot #" # Nat.toText(ic.hubBotId) # " — refresh from the hub"); continue flush } };
        let p = if (item.kind == "post")
          parseSlack(await slackApi(cred.token, "chat.postMessage", ?("{\"channel\":\"" # jsonEsc(a.channel) # "\",\"thread_ts\":\"" # jsonEsc(a.ts) # "\",\"text\":\"" # jsonEsc(item.text) # "\",\"unfurl_links\":false}")))
        else
          parseSlack(await slackApi(cred.token, (if (item.add) "reactions.add" else "reactions.remove"), ?("{\"channel\":\"" # jsonEsc(a.channel) # "\",\"timestamp\":\"" # jsonEsc(a.ts) # "\",\"name\":\"" # jsonEsc(item.emoji) # "\"}")));
        let benign = Text.contains(p.detail, #text "already_reacted") or Text.contains(p.detail, #text "no_reaction");
        if (not p.ok and not benign) touchIntake(ic.id, "could not " # item.kind # " into Slack: " # p.detail);
      };
    } finally { slackFlushing := false };
  };

  // ---- inbound: the Events API ----
  public type HttpGwRequest = { method : Text; url : Text; headers : [(Text, Text)]; body : Blob };
  public type HttpGwResponse = { status_code : Nat16; headers : [(Text, Text)]; body : Blob; upgrade : ?Bool };
  func plainRes(code : Nat16, body : Text) : HttpGwResponse = { status_code = code; headers = [("Content-Type", "text/plain")]; body = Text.encodeUtf8(body); upgrade = null };
  func headerOf(headers : [(Text, Text)], name : Text) : Text { for ((k, v) in headers.vals()) if (lower(k) == name) return v; "" };
  /// HMAC-SHA256 (RFC 2104) — Slack request signing.
  func hmacSha256(key : Text, msg : [Nat8]) : Blob {
    let bs = 64;
    var k = Blob.toArray(Text.encodeUtf8(key));
    if (k.size() > bs) k := Blob.toArray(Sha256.fromArray(#sha256, k));
    let kf = k;
    let k0 = Array.tabulate<Nat8>(bs, func(i) = if (i < kf.size()) kf[i] else 0);
    let ipad = Array.tabulate<Nat8>(bs, func(i) = k0[i] ^ 0x36);
    let opad = Array.tabulate<Nat8>(bs, func(i) = k0[i] ^ 0x5c);
    let inner = Sha256.fromArray(#sha256, Array.concat(ipad, msg));
    Sha256.fromArray(#sha256, Array.concat(opad, Blob.toArray(inner)));
  };

  public shared query func http_request(req : HttpGwRequest) : async HttpGwResponse {
    if (Text.startsWith(req.url, #text "/status/v1/") or Text.startsWith(req.url, #text "/oncall/v1/") or Text.startsWith(req.url, #text "/support/v1/") or Text.startsWith(req.url, #text "/slack/events")) return { status_code = 200; headers = []; body = Text.encodeUtf8(""); upgrade = ?true };
    plainRes(404, "kebab-stack desk — Slack Events API endpoint: /slack/events");
  };
  public shared func http_request_update(req : HttpGwRequest) : async HttpGwResponse {
    if (Text.startsWith(req.url, #text "/status/v1/")) return statusHttp(req.url,req.method);
    if (Text.startsWith(req.url, #text "/oncall/v1/")) return alertHttp(req);
    if (Text.startsWith(req.url, #text "/support/v1/")) return customerHttp<system>(req);
    if (Text.startsWith(req.url, #text "/slack/events")) return await slackEventsRoute<system>(req);
    plainRes(404, "not found");
  };

  func slackEventsRoute<system>(req : HttpGwRequest) : async HttpGwResponse {
    let bodyText = switch (Text.decodeUtf8(req.body)) { case (?t) t; case null "" };
    if (bodyText.size() > 200_000) return plainRes(413, "too large");
    // signature FIRST, over the raw body: nothing from an unverified caller is parsed (mo:json can trap on hostile input)
    let ts = headerOf(req.headers, "x-slack-request-timestamp");
    let sig = headerOf(req.headers, "x-slack-signature");
    var anySigning = false;
    var verified : [Nat] = [];
    switch (Nat.fromText(ts)) {
      case (?n) {
        let nowS = Int.abs(now() / 1_000_000_000);
        let fresh = (if (nowS >= n) (nowS - n : Nat) else (n - nowS : Nat)) <= 300;
        if (fresh) {
          let base = Array.concat(Blob.toArray(Text.encodeUtf8("v0:" # ts # ":")), Blob.toArray(req.body));
          for ((bid, c) in Map.entries(slackCreds)) {
            if (c.signing != "") { anySigning := true; if (sig == "v0=" # hex(hmacSha256(c.signing, base))) verified := Array.concat(verified, [bid]) };
          };
        };
      };
      case null {};
    };
    func verifiedFor(bid : Nat) : Bool { for (x in verified.vals()) if (x == bid) return true; false };
    if (anySigning and verified.size() == 0) return plainRes(401, "bad signature"); // not logged: the admin log must not be floodable from outside
    let j = switch (Json.parse(Hub.sanitizeSurrogates(bodyText))) { case (#ok(x)) x; case (#err(_)) return plainRes(400, "bad json") };
    if (jStr(j, "type") == "url_verification") {
      log("slack", "url_verification answered — the events URL is verified in Slack");
      return plainRes(200, jStr(j, "challenge"));
    };
    if (verified.size() == 0) return plainRes(401, "bad signature");
    if (jStr(j, "type") != "event_callback") return plainRes(200, "ignored");
    // dedupe FIRST: the entry commits at the first await below, so Slack's retries become no-ops
    let eventId = jStr(j, "event_id");
    if (eventId != "" and Map.containsKey(slackSeen, Text.compare, eventId)) return plainRes(200, "duplicate");
    if (eventId != "") Map.add(slackSeen, Text.compare, eventId, now());
    if (Map.size(slackSeen) > 2000) {
      let cutoff = now() - H;
      let drop = List.empty<Text>();
      for ((k, at) in Map.entries(slackSeen)) if (at < cutoff) List.add(drop, k);
      for (k in List.values(drop)) ignore Map.delete(slackSeen, Text.compare, k);
    };
    let ev = switch (Json.get(j, "event")) { case (?x) x; case null return plainRes(200, "no event") };
    let evType = jStr(ev, "type");
    if (evType == "reaction_added" or evType == "reaction_removed") {
      if (jStr(ev, "reaction") != "white_check_mark") return plainRes(200, "ignored");
      let channel = jStr(ev, "item.channel");
      let ic = switch (intakeByChannel(channel)) { case (?ic) ic; case null return plainRes(200, "ignored") };
      let cred = switch (credOf(ic.hubBotId)) { case (?c) c; case null return plainRes(200, "ignored") };
      if (not ic.enabled or not verifiedFor(ic.hubBotId) or jStr(ev, "user") == cred.botUserId) return plainRes(200, "ignored");
      let tid = switch (Map.get(slackByTs, Text.compare, channel # "#" # jStr(ev, "item.ts"))) { case (?n) n; case null return plainRes(200, "ignored") };
      if (tid == 0) return plainRes(200, "ignored");
      ignore slackReaction<system>(ic, cred, tid, jStr(ev, "user"), evType == "reaction_added"); // detached: Slack wants its 200 within 3 s, the work needs outcalls
      return plainRes(200, "ok");
    };
    if (evType != "message") return plainRes(200, "ignored");
    let subtype = jStr(ev, "subtype");
    let user = jStr(ev, "user");
    let channel = jStr(ev, "channel");
    let ic = switch (intakeByChannel(channel)) { case (?ic) ic; case null return plainRes(200, "ignored") };
    let cred = switch (credOf(ic.hubBotId)) { case (?c) c; case null return plainRes(200, "ignored") };
    if (not ic.enabled or not verifiedFor(ic.hubBotId)) return plainRes(200, "ignored");
    if (user == "" or user == cred.botUserId or jStr(ev, "bot_id") != "" or (subtype != "" and subtype != "file_share")) return plainRes(200, "ignored");
    let msgTs = jStr(ev, "ts");
    let threadTs = jStr(ev, "thread_ts");
    var text = norm(jStr(ev, "text"));
    let hasFiles = switch (Json.get(ev, "files")) { case (?#array(a)) a.size() > 0; case (_) false };
    if (text == "" and hasFiles) text := "(a file was shared in Slack — open the thread to see it)";
    if (text == "") return plainRes(200, "ignored");
    // detached: the 200 goes back at once (Slack retries after 3 s and disables the subscription after repeated failures); the dedupe above already committed
    if (threadTs == "" or threadTs == msgTs) ignore slackNewRequest<system>(ic, cred, user, text, channel, msgTs)
    else {
      switch (Map.get(slackByTs, Text.compare, channel # "#" # threadTs)) {
        case (?tid) { if (tid != 0) ignore slackThreadReply<system>(ic, cred, tid, user, text) };
        case null {}; // a thread we did not start — not ours
      };
    };
    plainRes(200, "ok");
  };

  /// A person's top-level message → a request of the intake's type; the bot answers in the thread.
  func slackNewRequest<system>(ic : SlackIntake, cred : SlackCred, user : Text, text : Text, channel : Text, ts : Text) : async () {
    let key = channel # "#" # ts;
    if (Map.containsKey(slackByTs, Text.compare, key)) return; // one request per message, whatever Slack retries
    Map.add(slackByTs, Text.compare, key, 0); // claim before the awaits
    let email = await slackEmail(cred, user);
    switch (Map.get(slackByTs, Text.compare, key)) { case (?n) { if (n != 0) return }; case null {} };
    let rt = switch (typeOf(ic.typeId)) {
      case (?t) t;
      case null { switch (Array.find<RequestType>(orderedTypes(), func(x) = x.enabled)) { case (?t) t; case null { ignore Map.delete(slackByTs, Text.compare, key); touchIntake(ic.id, "no request type — pick one for this channel"); return } } };
    };
    if (customerTypeId(rt.id)) { ignore Map.delete(slackByTs, Text.compare, key); return };
    let requester = if (email == "") "slack:" # user else pidOf(email);
    let subject = firstLine(text, 120);
    let id = createInternal<system>(rt, requester, subject, capText(text, 20_000), [], rt.defaultPriority, "slack", requester, "requester", false);
    Map.add(slackByTs, Text.compare, key, id);
    Map.add(slackAnchor, Nat.compare, id, { intakeId = ic.id; channel; ts });
    let t = switch (Map.get(tickets, Nat.compare, id)) { case (?t) t; case null return };
    var sensitive = false;
    for (f in rt.fields.vals()) if (f.sensitive) sensitive := true;
    let link = ticketUrl(id);
    let ack = "Got it — *" # t.key # "* created: _" # jsonSafeText(subject) # "_." #
      (if (sensitive) "\n:lock: This kind of request needs details we do not collect in a channel — please also fill the form" # (if (link == "") "." else ": <" # link # "|open the form>.") else "") #
      "\nThe team follows up in this thread." # (if (link == "" or sensitive) "" else " <" # link # "|Open request>") #
      (if (email == "") "\n_Your Slack profile shows no e-mail we know, so this request is not linked to you in desk._" else "");
    List.add(slackOutbox, { ticketId = id; kind = "post"; text = ack; emoji = ""; add = true });
    List.add(slackOutbox, { ticketId = id; kind = "react"; text = ""; emoji = "eyes"; add = true });
    touchIntake(ic.id, t.key # " created from a message" # (if (email == "") "" else " by " # email));
    log("slack", t.key # " created from #" # (if (ic.channelName == "") channel else ic.channelName));
  };
  func jsonSafeText(t : Text) : Text = slackEsc(Text.replace(Text.replace(t, #char '*', ""), #char '_', " "));
  /// Slack reads `<!channel>`, `<!here>`, `<@U…>` and `<url|label>` inside message text — a requester's comment must never carry them into the channel
  func slackEsc(t : Text) : Text = Text.replace(Text.replace(Text.replace(t, #char '&', "&amp;"), #char '<', "&lt;"), #char '>', "&gt;");

  /// A reply in a request's thread → a public comment (agent when the person is staff here).
  func slackThreadReply<system>(ic : SlackIntake, cred : SlackCred, tid : Nat, user : Text, text : Text) : async () {
    let email = await slackEmail(cred, user);
    let t = switch (Map.get(tickets, Nat.compare, tid)) { case (?t) t; case null return };
    if (t.status == "closed") { touchIntake(ic.id, "reply on closed " # t.key # " ignored"); return };
    if (projectOf(tid) != 0) return;
    let who = if (email == "") "slack:" # user else pidOf(email);
    let asStaff = email != "" and isStaff(roleOf(email)) and t.requester != who;
    addCommentInternal<system>(t, who, capText(text, 20_000), asStaff, true);
    touchIntake(ic.id, "reply on " # t.key);
  };

  /// ✅ added on the first message → resolved; ✅ removed → reopened.
  func slackReaction<system>(ic : SlackIntake, cred : SlackCred, tid : Nat, user : Text, added : Bool) : async () {
    let email = await slackEmail(cred, user);
    let t = switch (Map.get(tickets, Nat.compare, tid)) { case (?t) t; case null return };
    if (projectOf(tid) != 0) return;
    let who = if (email == "") "slack:" # user else pidOf(email);
    let kind = if (email != "" and isStaff(roleOf(email))) "agent" else "requester";
    if (added) {
      if (t.status == "resolved" or t.status == "closed") return;
      let r = applyStatus(t, "resolved", "", who, kind);
      if (not r.ok) { slackMirrorPost(tid, ":warning: Can't resolve *" # t.key # "* yet — " # slackEsc(r.detail) # "."); touchIntake(ic.id, "✅ on " # t.key # " refused: " # r.detail); return };
      let nt = markFirstResponse(r.t);
      put(nt);
      notify<system>([nt.requester], "Resolved · " # nt.key # " " # nt.subject, tid, "desk", nt.key # ":resolved:" # Nat.toText(nextEventId));
      slackMirrorStatus(nt, t.status, personName(who), true);
      touchIntake(ic.id, t.key # " resolved with ✅");
    } else {
      if (t.status != "resolved" and t.status != "closed") return;
      let r = applyStatus(t, "open", "", who, kind);
      if (not r.ok) return;
      put(r.t);
      notifyOwners<system>(r.t, personName(who) # " reopened · " # t.key, t.key # ":reopen:" # Nat.toText(nextEventId));
      slackMirrorStatus(r.t, t.status, personName(who), true);
      touchIntake(ic.id, t.key # " reopened (✅ removed)");
    };
  };

  // ---- admin API ----
  public type SlackBotView = { id : Nat; name : Text; teamName : Text; hasSigning : Bool; botKnown : Bool };
  public type SlackStatus = { eventsUrl : Text; gateway : Text; bots : [SlackBotView]; credsAt : Int; credsError : Text; intakes : [SlackIntake]; outbox : Nat };
  public shared query func slackStatus(tok : Text) : async ?SlackStatus {
    switch (admin(tok)) { case null return null; case (?_) {} };
    let bots = List.empty<SlackBotView>();
    for ((id, c) in Map.entries(slackCreds)) List.add(bots, { id; name = c.name; teamName = c.teamName; hasSigning = c.signing != ""; botKnown = c.botUserId != "" });
    let ics = List.empty<SlackIntake>();
    for ((_, ic) in Map.entries(slackIntakes)) List.add(ics, ic);
    ?{ eventsUrl = slackEventsUrl(); gateway = slackGateway; bots = List.toArray(bots); credsAt = slackCredsAt; credsError = slackCredsError; intakes = List.toArray(ics); outbox = List.size(slackOutbox) };
  };
  public shared func slackRefresh(tok : Text) : async { ok : Bool; count : Nat; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; count = 0; detail = "admins only" }; case (?_) {} };
    await refreshSlackCreds();
  };
  /// Channels the bot was invited to — the picker for a new intake.
  public shared func slackChannels(tok : Text, hubBotId : Nat) : async { ok : Bool; detail : Text; channels : [(Text, Text)] } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only"; channels = [] }; case (?_) {} };
    let cred = switch (credOf(hubBotId)) { case (?c) c; case null return { ok = false; detail = "no such bot here — refresh from the hub"; channels = [] } };
    let p = parseSlack(await slackApi(cred.token, "users.conversations?types=public_channel,private_channel&exclude_archived=true&limit=200", null));
    if (not p.ok) return { ok = false; detail = p.detail # " — does the app have channels:read and groups:read?"; channels = [] };
    let out = List.empty<(Text, Text)>();
    switch (Json.get(p.json, "channels")) { case (?#array(a)) { for (c in a.vals()) List.add(out, (jStr(c, "id"), jStr(c, "name"))) }; case (_) {} };
    { ok = true; detail = (if (List.size(out) == 0) "the bot is in no channel yet — invite it (/invite @bot) in Slack" else ""); channels = List.toArray(out) };
  };
  func channelIdOk(t : Text) : Bool {
    if (t.size() < 9 or t.size() > 20) return false;
    var first = true;
    for (c in t.chars()) { if (first) { if (c != 'C' and c != 'G') return false; first := false } else if (not ((c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9'))) return false };
    true;
  };
  public shared func addSlackIntake(tok : Text, args : { name : Text; hubBotId : Nat; channel : Text; channelName : Text; typeId : Nat }) : async { ok : Bool; id : Nat; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; id = 0; detail = "admins only" } };
    let cred = switch (credOf(args.hubBotId)) { case (?c) c; case null return { ok = false; id = 0; detail = "pick a bot the hub assigned to this desk (refresh from the hub first)" } };
    let ch = norm(args.channel);
    if (not channelIdOk(ch)) return { ok = false; id = 0; detail = "pick a channel (its id looks like C0123ABCDEF)" };
    if (intakeByChannel(ch) != null) return { ok = false; id = 0; detail = "this channel is already an intake" };
    switch (typeOf(args.typeId)) { case null return { ok = false; id = 0; detail = "pick the request type messages become" }; case (?_) {} };
    var chName = norm(args.channelName);
    if (chName == "") { let p = parseSlack(await slackApi(cred.token, "conversations.info?channel=" # ch, null)); if (p.ok) chName := jStr(p.json, "channel.name") };
    let id = nextSlackIntakeId; nextSlackIntakeId += 1;
    let name = if (norm(args.name) == "") (if (chName == "") ch else "#" # chName) else capText(norm(args.name), 60);
    Map.add(slackIntakes, Nat.compare, id, { id; name; hubBotId = args.hubBotId; channel = ch; channelName = chName; typeId = args.typeId; enabled = true; createdAt = now(); lastEventAt = 0; lastResult = "" });
    log(m.email, "Slack intake added: " # name # " (" # cred.teamName # ")");
    { ok = true; id; detail = "" };
  };
  public shared func updateSlackIntake(tok : Text, id : Nat, args : { name : Text; typeId : Nat; enabled : Bool }) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let ic = switch (Map.get(slackIntakes, Nat.compare, id)) { case (?ic) ic; case null return { ok = false; detail = "no such intake" } };
    switch (typeOf(args.typeId)) { case null return { ok = false; detail = "pick the request type messages become" }; case (?_) {} };
    Map.add(slackIntakes, Nat.compare, id, { ic with name = (if (norm(args.name) == "") ic.name else capText(norm(args.name), 60)); typeId = args.typeId; enabled = args.enabled });
    log(m.email, "Slack intake " # ic.name # (if (args.enabled) " updated" else " paused"));
    { ok = true; detail = "" };
  };
  public shared func removeSlackIntake(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    switch (Map.get(slackIntakes, Nat.compare, id)) {
      case (?ic) { ignore Map.delete(slackIntakes, Nat.compare, id); log(m.email, "Slack intake removed: " # ic.name); { ok = true; detail = "" } }; // requests and their threads stay; the bot just stops listening there
      case null ({ ok = false; detail = "no such intake" });
    };
  };
  /// Posts one line into the channel — proves token, channel membership and chat:write in one click.
  public shared func slackSayHello(tok : Text, id : Nat) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let ic = switch (Map.get(slackIntakes, Nat.compare, id)) { case (?ic) ic; case null return { ok = false; detail = "no such intake" } };
    let cred = switch (credOf(ic.hubBotId)) { case (?c) c; case null return { ok = false; detail = "no credentials — refresh from the hub" } };
    let tn = switch (typeOf(ic.typeId)) { case (?t) t.name; case null "request" };
    let p = parseSlack(await slackApi(cred.token, "chat.postMessage", ?("{\"channel\":\"" # jsonEsc(ic.channel) # "\",\"text\":\"" # jsonEsc(":wave: desk is listening here. A message in this channel becomes a request (" # tn # "); the team answers in the thread; a :white_check_mark: on your message marks it resolved.") # "\",\"unfurl_links\":false}")));
    touchIntake(ic.id, if (p.ok) "hello posted by " # m.email else "hello failed: " # p.detail);
    if (p.ok) ({ ok = true; detail = "posted — check the channel" }) else ({ ok = false; detail = p.detail # (if (Text.contains(p.detail, #text "not_in_channel")) " — invite the bot: /invite @<bot> in that channel" else "") });
  };
  public shared func setSlackGateway(tok : Text, domain : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    let d = lower(norm(domain));
    if (d.size() < 3 or d.size() > 80 or not Text.contains(d, #char '.')) return { ok = false; detail = "a domain like icp.net" };
    for (c in d.chars()) { let ok = (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '.' or c == '-'; if (not ok) return { ok = false; detail = "a domain like icp.net" } };
    slackGateway := d; log(m.email, "Slack gateway domain set to " # d);
    { ok = true; detail = "" };
  };

  // =====================================================================
  // timers: directory pull, SLA sweep, auto-close
  // =====================================================================
  func sweep<system>() {
    let n = now();
    let snapshot = Iter.toArray(Map.entries(tickets)); // never mutate while iterating
    label sweepTickets for ((id, t) in snapshot.vals()) {
      if (customerDue(t)) continue sweepTickets;
      let active = t.status != "resolved" and t.status != "closed";
      if (active) {
        switch (t.respondBy) {
          case (?rb) { if (t.firstResponseAt == null and n > rb and not Map.containsKey(nudged, Text.compare, Nat.toText(id) # ":respond")) {
            Map.add(nudged, Text.compare, Nat.toText(id) # ":respond", n);
            notifyOwners<system>(t, "First response overdue · " # t.key # " " # t.subject, t.key # ":sla-respond");
            ignore addEvent(id, "system", "system", "note", "SLA: first response overdue", [("sla", "respond")]);
          } };
          case null {};
        };
        switch (t.dueAt) {
          case (?d) { if (n > d and not Map.containsKey(nudged, Text.compare, Nat.toText(id) # ":resolve")) {
            Map.add(nudged, Text.compare, Nat.toText(id) # ":resolve", n);
            notifyOwners<system>(t, "Due date passed · " # t.key # " " # t.subject, t.key # ":sla-resolve");
            ignore addEvent(id, "system", "system", "note", "SLA: due date passed", [("sla", "resolve")]);
          } };
          case null {};
        };
      } else if (t.status == "resolved" and autoCloseDays > 0 and hardwareCaseOf(t) == null) {
        switch (t.resolvedAt) {
          case (?r) { if (n > r + autoCloseDays * D) {
            Map.add(tickets, Nat.compare, id, { t with status = "closed"; closedAt = ?n });
            ignore addEvent(id, "system", "system", "status", "closed (auto, " # Nat.toText(autoCloseDays) # " days after resolved)", [("status", "closed")]);
          } };
          case null {};
        };
      };
    };
  };

  // =====================================================================
  // person ids (0.6.0): tickets, events, tasks, approvals and files reference people by the hub's
  // stable id. The release that introduced this rewrites older address-keyed records once, right
  // after the upgrade, asking the hub which id each address belongs to (docs/PERSON-IDS.md).
  // Until that is done, writes are refused with a plain sentence; reads keep working.
  // =====================================================================
  var idMigration : Text = "pending"; // pending | done
  transient let MIGRATING : Text = "people ids are being migrated — try again in a minute";
  func migrating() : Bool = idMigration != "done";
  func isAddress(t : Text) : Bool = Text.contains(t, #char '@') and not Text.startsWith(t, #text "legacy:");
  func migrateIds() : async () {
    if (idMigration == "done") return;
    if (Map.size(tickets) == 0 and Map.size(events) == 0) { idMigration := "done"; return }; // fresh install: nothing to rewrite
    if (hubId == "") return;
    try { ignore await pullDirectory() } catch (_) {}; // ids table first, so new writes after the switch carry real ids
    let seen = Map.empty<Text, Bool>();
    func note(x : Text) { if (isAddress(x)) Map.add(seen, Text.compare, lower(x), true) };
    for ((_, t) in Map.entries(tickets)) { note(t.requester); note(t.assignee); for ((k, v) in t.fields.vals()) if (fieldIsPerson(t.typeId, k)) note(v) };
    for ((_, e) in Map.entries(events)) note(e.who);
    for ((_, ts) in Map.entries(ticketTasks)) for (x in ts.vals()) note(x.by);
    for ((_, a) in Map.entries(approvals)) { note(a.approver); note(a.decidedBy) };
    for ((_, f) in Map.entries(files)) note(f.by);
    let emails = Iter.toArray(Map.keys(seen));
    let found = Map.empty<Text, Text>();
    if (emails.size() > 0) {
      let hits = try { await Hub.lookupIds(Hub.hub(hubId), emails) } catch (_) { return }; // hub unreachable: the 30-second timer retries
      for ((e, pid) in hits.vals()) Map.add(found, Text.compare, e, pid);
    };
    if (idMigration == "done") return; // a parallel run finished while we awaited
    func mig(x : Text) : Text = if (isAddress(x)) Hub.migrateKey(found, x) else x;
    for ((id, t) in Iter.toArray(Map.entries(tickets)).vals()) {
      Map.add(tickets, Nat.compare, id, { t with requester = mig(t.requester); assignee = mig(t.assignee); fields = Array.map<(Text, Text), (Text, Text)>(t.fields, func(kv) = if (fieldIsPerson(t.typeId, kv.0)) (kv.0, mig(kv.1)) else kv) });
    };
    for ((id, e) in Iter.toArray(Map.entries(events)).vals()) if (isAddress(e.who)) Map.add(events, Nat.compare, id, { e with who = mig(e.who) });
    for ((id, ts) in Iter.toArray(Map.entries(ticketTasks)).vals()) Map.add(ticketTasks, Nat.compare, id, Array.map<Task, Task>(ts, func(x) = { x with by = mig(x.by) }));
    for ((id, a) in Iter.toArray(Map.entries(approvals)).vals()) Map.add(approvals, Nat.compare, id, { a with approver = mig(a.approver); decidedBy = mig(a.decidedBy) });
    for ((id, f) in Iter.toArray(Map.entries(files)).vals()) if (isAddress(f.by)) Map.add(files, Nat.compare, id, { f with by = mig(f.by) });
    idMigration := "done";
    log("system", "people references migrated to person ids: " # Nat.toText(emails.size()) # " addresses, " # Nat.toText(Map.size(found)) # " known to the hub, the rest kept as legacy:<address>");
  };
  transient let _idMigrationTimer = Timer.setTimer<system>(#seconds 0, func() : async () { await migrateIds() });

  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { try { ignore await pullDirectory() } catch (_) {}; try { await pollLifecycle() } catch (_) {}; try { await sweepHardware() } catch (_) {}; ignore Hub.pruneSessions(sessions); if (migrating()) { try { await migrateIds() } catch (_) {} } });
  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { sweepCustomerPrivacy() });
  ignore Timer.recurringTimer<system>(#seconds 3600, func() : async () { sweep<system>() });
  ignore Timer.recurringTimer<system>(#seconds 10, func() : async () { try { await flushSlackOutbox() } catch (_) {} });
  ignore Timer.recurringTimer<system>(#seconds 900, func() : async () { if (Map.size(slackIntakes) > 0 or Map.size(slackCreds) > 0) { try { ignore await refreshSlackCreds() } catch (_) {} } });

  public shared func syncNow(tok : Text) : async { ok : Bool; detail : Text } {
    switch (admin(tok)) { case null return { ok = false; detail = "admins only" }; case (?_) {} };
    if (hubId == "") return { ok = false; detail = "hub not set" };
    try { let n = await pullDirectory(); { ok = true; detail = Nat.toText(n) # " people" } } catch (e) { { ok = false; detail = "hub call failed — is this canister registered as connector?" } };
  };

  // =====================================================================
  // catalog defaults & demo seed
  // =====================================================================
  func fld(key : Text, title : Text, kind : Text, options : [Text], required : Bool, sensitive : Bool) : FieldDef = { key; title; kind; options; required; sensitive };

  func ensureCatalog() {
    if (Map.size(types) > 0) return;
    let defs : [TypeInput] = [
      { name = "Something is broken"; icon = "🔧"; description = "Laptop, wifi, printer, an app that stopped working."; fields = [fld("where", "Where does it happen?", "select", ["My device", "Office", "A web app", "Somewhere else"], false, false)]; checklist = []; queue = ""; approval = "none"; defaultPriority = "normal"; respondH = 4; resolveH = 24; dueField = ""; visibility = "all"; enabled = true },
      { name = "Question / how do I…"; icon = "💬"; description = "You are not blocked, you just need to know."; fields = []; checklist = []; queue = ""; approval = "none"; defaultPriority = "low"; respondH = 8; resolveH = 48; dueField = ""; visibility = "all"; enabled = true },
      { name = "Access request"; icon = "🔑"; description = "Access to a system, group, folder or tool."; fields = [fld("system", "System / tool", "text", [], true, false), fld("level", "Access level", "select", ["Read", "Write", "Admin"], true, false), fld("reason", "Business reason", "textarea", [], true, false)]; checklist = ["Grant access", "Confirm with requester"]; queue = ""; approval = "manager"; defaultPriority = "normal"; respondH = 8; resolveH = 48; dueField = ""; visibility = "all"; enabled = true },
      { name = "Software / license"; icon = "📦"; description = "A new tool or an extra seat."; fields = [fld("software", "Software", "text", [], true, false), fld("reason", "What for?", "textarea", [], true, false), fld("cost", "Estimated cost per year", "text", [], false, false)]; checklist = ["Check existing licenses", "Procure / assign seat", "Hand over"]; queue = ""; approval = "manager"; defaultPriority = "normal"; respondH = 8; resolveH = 72; dueField = ""; visibility = "all"; enabled = true },
      { name = "Hardware request"; icon = "💻"; description = "New device, monitor, peripherals, replacement."; fields = [fld("device", "Device type", "select", ["Laptop", "Monitor", "Peripheral", "Phone", "Other"], true, false), fld("model", "Preferred model (optional)", "text", [], false, false), fld("reason", "Why?", "textarea", [], true, false)]; checklist = ["Order", "Register in assets", "Hand over & confirm"]; queue = ""; approval = "manager"; defaultPriority = "normal"; respondH = 8; resolveH = 120; dueField = ""; visibility = "all"; enabled = true },
      { name = "Onboarding"; icon = "🌱"; description = "A new colleague starts. Filed by HR or the manager."; fields = [fld("firstName", "First name", "text", [], true, true), fld("lastName", "Last name", "text", [], true, true), fld("startDate", "Start date", "date", [], true, false), fld("privateEmail", "Private e-mail (for day-1 credentials)", "text", [], false, true), fld("department", "Department", "text", [], true, false), fld("manager", "Manager", "person", [], true, false), fld("hardware", "Hardware", "select", ["Laptop (standard)", "Laptop (performance)", "None"], true, false)]; checklist = ["Create accounts & groups", "Order / assign hardware", "Licenses & seats", "E-mail, chat, calendar", "Device enrollment", "Day-1 intro & handover"]; queue = ""; approval = "none"; defaultPriority = "normal"; respondH = 24; resolveH = 0; dueField = "startDate"; visibility = "all"; enabled = true },
      { name = "Offboarding"; icon = "🍂"; description = "A colleague leaves. Filed by HR or the manager."; fields = [fld("person", "Who", "person", [], true, true), fld("lastDay", "Last day", "date", [], true, false), fld("manager", "Manager", "person", [], true, false), fld("notes", "Notes (handover, special cases)", "textarea", [], false, true)]; checklist = ["Agree deactivation time with HR", "Reclaim devices", "Revoke licenses & seats", "Deactivate in the hub", "Mail forwarding / archive per policy", "Transfer owned work"]; queue = ""; approval = "none"; defaultPriority = "high"; respondH = 24; resolveH = 0; dueField = "lastDay"; visibility = "all"; enabled = true },
      { name = "Security incident"; icon = "🚨"; description = "Phishing, lost device, suspicious login, leaked secret."; fields = [fld("what", "What happened?", "select", ["Phishing / suspicious message", "Lost or stolen device", "Suspicious login", "Leaked credential or secret", "Other"], true, false), fld("when", "When (date)", "date", [], false, false)]; checklist = ["Contain", "Assess impact", "Notify affected people", "Write incident note"]; queue = ""; approval = "none"; defaultPriority = "urgent"; respondH = 1; resolveH = 24; dueField = ""; visibility = "all"; enabled = true },
    ];
    for (d in defs.vals()) {
      let id = nextTypeId;
      nextTypeId += 1;
      Map.add(types, Nat.compare, id, { id; name = d.name; icon = d.icon; description = d.description; fields = d.fields; checklist = d.checklist; queue = d.queue; approval = d.approval; defaultPriority = d.defaultPriority; respondH = d.respondH; resolveH = d.resolveH; dueField = d.dueField; visibility = d.visibility; enabled = d.enabled; sortOrder = id });
      if (d.name == "Offboarding") offboardingTemplateId := ?id;
    };
  };

  public shared func resetCatalogDefaults(tok : Text) : async { ok : Bool; detail : Text } {
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (Map.size(types) > 0) return { ok = false; detail = "catalog is not empty — remove or disable types instead" };
    ensureCatalog();
    log(m.email, "catalog defaults restored");
    { ok = true; detail = Nat.toText(Map.size(types)) # " types" };
  };

  /// Demo data for evaluation instances: ~12 requests across all states,
  /// requesters from the directory when present (otherwise demo people).
  public shared func seedDemo(tok : Text) : async { ok : Bool; detail : Text } {
    if (migrating()) return { ok = false; detail = MIGRATING };
    let m = switch (admin(tok)) { case (?m) m; case null return { ok = false; detail = "admins only" } };
    if (demoSeeded) return { ok = false; detail = "demo data already seeded" };
    ensureCatalog();
    // demo people only — never attribute fake requests or decisions to real colleagues
    let ppl : [Text] = ["ana.ruiz@example.com", "ben.okafor@example.com", "chloe.martin@example.com", "dev.patel@example.com", "emma.lund@example.com"];
    func p(i : Nat) : Text = ppl[i % ppl.size()];
    func byName(n : Text) : ?RequestType { for (rt in orderedTypes().vals()) if (rt.name == n) return ?rt; null };
    let agent = m.id;
    let n0 = now();
    var made = 0;
    func mk<system>(typeName : Text, req : Text, subject : Text, body : Text, fields : [(Text, Text)], prio : Text, ageH : Int) : ?Nat {
      let rt = switch (byName(typeName)) { case (?r) r; case null return null };
      let id = createInternal<system>(rt, pidOf(req), subject, body, fields, prio, "seed", pidOf(req), "requester", true);
      // backdate
      switch (Map.get(tickets, Nat.compare, id)) {
        case (?t) Map.add(tickets, Nat.compare, id, { t with createdAt = n0 - ageH * H; updatedAt = n0 - ageH * H; respondBy = (switch (t.respondBy) { case (?r) ?(r - ageH * H); case null null }); dueAt = (switch (t.dueAt) { case (?d) { if (rt.dueField == "") ?(d - ageH * H) else ?d }; case null null }) });
        case null {};
      };
      made += 1;
      ?id;
    };
    func agentReply(id : Nat, txt : Text) { ignore addEvent(id, agent, "agent", "comment", txt, []); switch (Map.get(tickets, Nat.compare, id)) { case (?t) Map.add(tickets, Nat.compare, id, markFirstResponse({ t with assignee = agent; status = if (t.status == "new") "open" else t.status })); case null {} } };
    func status(id : Nat, s : Text, w : Text) { switch (Map.get(tickets, Nat.compare, id)) { case (?t) { let r = applyStatus(t, s, w, agent, "agent"); if (r.ok) put(r.t) }; case null {} } };
    func doneTasks(id : Nat) { switch (Map.get(ticketTasks, Nat.compare, id)) { case (?ts) Map.add(ticketTasks, Nat.compare, id, Array.map<Task, Task>(ts, func(x) = ({ x with state = "done"; by = agent; at = n0 }))); case null {} } };

    switch (mk<system>("Something is broken", p(0), "Wifi drops every few minutes in the 3rd floor meeting room", "Since Monday the wifi in Aurora disconnects roughly every 5 minutes. Three of us saw it during the same call.", [("where", "Office")], "high", 30)) {
      case (?id) { agentReply(id, "Thanks — I can see the AP in Aurora rebooting in the controller logs. Swapping it this afternoon."); status(id, "waiting", "third-party") }; case null {} };
    switch (mk<system>("Access request", p(1), "Write access to the finance shared drive", "", [("system", "Finance shared drive"), ("level", "Write"), ("reason", "Taking over monthly reporting from Priya.")], "normal", 20)) { case (?_) {}; case null {} };
    switch (mk<system>("Software / license", p(2), "Figma seat for the new designer", "", [("software", "Figma Professional"), ("reason", "Design handoff for the mobile app."), ("cost", "≈ 180 / year")], "normal", 48)) {
      case (?id) { ignore id }; case null {} };
    switch (mk<system>("Hardware request", p(3), "Second monitor for home office", "", [("device", "Monitor"), ("reason", "Two-screen setup for code review + calls.")], "low", 72)) {
      case (?id) { switch (Map.get(approvals, Nat.compare, id)) { case (?a) { Map.add(approvals, Nat.compare, id, { a with state = "approved"; decidedBy = pidOf(p(4)); at = n0 - 60 * H; note = "ok" }); ignore addEvent(id, p(4), "requester", "approval", "approved — ok", [("decision", "approved")]); switch (Map.get(tickets, Nat.compare, id)) { case (?t) put({ t with status = "new"; waitingOn = "" }); case null {} } }; case null {} }; agentReply(id, "Approved by your manager — ordering the 27\" model we standardise on. ETA 3 working days.") }; case null {} };
    switch (mk<system>("Onboarding", p(4), "Onboarding: new engineer starts in 10 days", "", [("firstName", "Sam"), ("lastName", "Rivera"), ("startDate", isoInDays(10)), ("department", "Engineering"), ("manager", p(1)), ("hardware", "Laptop (performance)")], "normal", 12)) {
      case (?id) { agentReply(id, "Got it. Accounts will be created the day before; laptop is in stock."); ignore setTaskInternal(id, 0, "done", agent) }; case null {} };
    switch (mk<system>("Offboarding", p(1), "Offboarding: contractor ends this Friday", "Contractor engagement ends; hardware is a loaner.", [("person", p(2)), ("lastDay", isoInDays(3)), ("manager", p(1)), ("notes", "Return the loaner laptop to IT before noon.")], "high", 6)) { case (?_) {}; case null {} };
    switch (mk<system>("Security incident", p(0), "Phishing mail impersonating the CEO", "Got a 'quick favour' mail from a gmail address using our CEO's name. Did not click. Screenshot attached.", [("what", "Phishing / suspicious message"), ("when", isoInDays(0))], "urgent", 3)) {
      case (?id) { agentReply(id, "Well spotted. Reported to the mail provider and blocked the sender for everyone. Please forward the original as attachment if you still have it."); status(id, "waiting", "requester") }; case null {} };
    switch (mk<system>("Question / how do I…", p(3), "How do I share my calendar with an external partner?", "", [], "low", 100)) {
      case (?id) { agentReply(id, "Settings → Calendar → Share with specific people → enter their address and pick 'See only free/busy'. Full guide linked in the portal FAQ."); status(id, "resolved", "") }; case null {} };
    switch (mk<system>("Something is broken", p(2), "Printer on floor 2 says 'toner low' but prints fine", "", [("where", "Office")], "low", 200)) {
      case (?id) { agentReply(id, "Cartridge swapped, message gone."); status(id, "resolved", ""); status(id, "closed", "") }; case null {} };
    switch (mk<system>("Access request", p(4), "Admin on the analytics workspace", "", [("system", "Analytics workspace"), ("level", "Admin"), ("reason", "Need to manage dashboards for the team.")], "normal", 90)) {
      case (?id) { switch (Map.get(approvals, Nat.compare, id)) { case (?a) { Map.add(approvals, Nat.compare, id, { a with state = "rejected"; decidedBy = pidOf(p(1)); at = n0 - 80 * H; note = "Editor is enough for dashboards." }); ignore addEvent(id, p(1), "requester", "approval", "rejected — Editor is enough for dashboards.", [("decision", "rejected")]); switch (Map.get(tickets, Nat.compare, id)) { case (?t) put({ t with status = "closed"; waitingOn = ""; closedAt = ?(n0 - 80 * H) }); case null {} } }; case null {} } }; case null {} };
    switch (mk<system>("Something is broken", p(1), "Laptop fan is loud and battery drains in 2 hours", "Started after the last OS update.", [("where", "My device")], "normal", 50)) {
      case (?id) { agentReply(id, "Please run the diagnostics from the self-service app and paste the report id here."); status(id, "waiting", "requester") }; case null {} };
    switch (mk<system>("Hardware request", p(0), "Replacement charger", "Cable is frayed.", [("device", "Peripheral"), ("reason", "Current charger is frayed — safety.")], "normal", 8)) { case (?_) {}; case null {} };
    switch (mk<system>("Software / license", p(3), "Password manager for the whole team", "", [("software", "Team password manager"), ("reason", "Shared credentials live in a spreadsheet today."), ("cost", "≈ 60 / user / year")], "high", 130)) {
      case (?id) { switch (Map.get(approvals, Nat.compare, id)) { case (?a) { Map.add(approvals, Nat.compare, id, { a with state = "approved"; decidedBy = pidOf(p(2)); at = n0 - 120 * H; note = "" }); ignore addEvent(id, p(2), "requester", "approval", "approved", [("decision", "approved")]); switch (Map.get(tickets, Nat.compare, id)) { case (?t) put({ t with status = "new"; waitingOn = "" }); case null {} } }; case null {} }; agentReply(id, "Rolled out to the team, invites sent. Migration guide in the portal."); doneTasks(id); status(id, "resolved", "") }; case null {} };

    demoSeeded := true;
    log(m.email, "demo data seeded (" # Nat.toText(made) # " requests)");
    { ok = true; detail = Nat.toText(made) # " requests created" };
  };

  func setTaskInternal(id : Nat, idx : Nat, state : Text, by : Text) : Bool {
    let ts = switch (Map.get(ticketTasks, Nat.compare, id)) { case (?ts) ts; case null return false };
    if (idx >= ts.size()) return false;
    Map.add(ticketTasks, Nat.compare, id, Array.tabulate<Task>(ts.size(), func(i) = if (i == idx) ({ title = ts[i].title; state; by; at = now() }) else ts[i]));
    ignore addEvent(id, by, "agent", "task", ts[idx].title # " → " # state, [("idx", Nat.toText(idx)), ("state", state)]);
    true;
  };

  func isoInDays(d : Int) : Text {
    // civil from days (Howard Hinnant), UTC
    let days : Int = (now() / D) + d;
    let z = days + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let dd = doy - (153 * mp + 2) / 5 + 1;
    let mm = if (mp < 10) mp + 3 else mp - 9;
    let yy = if (mm <= 2) y + 1 else y;
    func two(n : Int) : Text = (if (n < 10) "0" else "") # Int.toText(n);
    Int.toText(yy) # "-" # two(mm) # "-" # two(dd);
  };

  // =====================================================================
  // public info (no session) — the sign-in screen needs these
  // =====================================================================
  public shared query func info() : async { orgName : Text; hubId : Text; hubSet : Bool; appUrl : Text; version : Text } {
    { orgName; hubId; hubSet = hubId != ""; appUrl; version = BUILD_VERSION };
  };
  /// Aggregate-only read for Hub Operations; no session or records leave this app.
  public shared query ({ caller }) func hub_operations(viewer : Text) : async Operations.Snapshot {
    assert Hub.isHub(caller, hubId);
    let email = emailOfPid(viewer);
    if (viewer == "" or pidOf(email) != viewer or not Hub.directoryFresh(lastDirectoryPull) or not Hub.isActive(people, email) or Hub.appRole(people, email, "desk") != "admin") return Operations.denied();
    if (migrating()) return Operations.unavailable();
    var active = 0; var unassigned = 0; var breached = 0; var review = 0; var departing = 0;
    for (t in tickets.values()) if (projectOf(t.id) == 0 and t.status != "resolved" and t.status != "closed") {
      active += 1;
      if (t.assignee == "") unassigned += 1;
      if ((switch (t.respondBy) { case (?at) t.firstResponseAt == null and now() > at; case null false }) or (switch (t.dueAt) { case (?at) now() > at; case null false })) breached += 1;
      switch (lifecycleCases.get(t.id)) {
        case (?c) { if (c.state == #review or c.state == #reactivated) review += 1 else if (c.state == #offboarding) departing += 1 };
        case null { switch (typeOf(t.typeId)) { case (?rt) { if (isOffboardingType(rt)) review += 1 }; case null {} } };
      };
    };
    Operations.ready([("active", active), ("unassigned", unassigned), ("breached", breached), ("departureReview", review), ("offboarding", departing), ("lifecycleUnverified", if (lifecycleCheckedAt == 0 or now() - lifecycleCheckedAt > 120_000_000_000 or lifecycleError != "" or lifecycleGap) 1 else 0)]);
  };

  func responseFresh() : Bool = Hub.directoryFresh(lastDirectoryPull);
  func responseReady() : Bool = hubId != "" and Text.startsWith(appUrl, #text "https://");
  func sendResponse(projectId : Nat, incidentId : Nat, personId : Text, dedupeKey : Text) : async { ok : Bool; detail : Text } {
    let project = oncallState.projects.get(projectId) ?? (return { ok = false; detail = "Project unavailable" });
    if (not responseFresh() or not oncallEligible(project, personId)) return { ok = false; detail = "Recipient access could not be verified" };
    if (not responseReady()) return { ok = false; detail = "Configure the canonical HTTPS Desk URL and Hub connection" };
    let receipt = await Hub.hub(hubId).hub_notify({ email = emailOfPid(personId); title = "On-call · OC-" # incidentId.toText() # " needs your attention"; url = appUrl # "#/oncall/" # projectId.toText() # "/incident-" # incidentId.toText(); kind = "desk.oncall"; dedupeKey });
    { ok = receipt.ok; detail = capText(receipt.detail, 180) }
  };
  func sendPlanningReminder(projectId : Nat,personId : Text,title : Text,path : Text,dedupeKey : Text) : async {ok : Bool;detail : Text} {
    let p=oncallState.projects.get(projectId) ?? (return {ok=false;detail="Project unavailable"});
    if(not responseFresh() or not oncallEligible(p,personId))return {ok=false;detail="Recipient access could not be verified"};
    let receipt=await Hub.hub(hubId).hub_notify({email=emailOfPid(personId);title;url=appUrl#path;kind="desk.oncall.planning";dedupeKey});
    {ok=receipt.ok;detail=capText(receipt.detail,180)}
  };
  include OncallRemindersApi(oncallReminderState,oncallState,oncallCalendarState,oncallActor,oncallAccess,oncallEligible,responseFresh,responseReady,sendPlanningReminder);
  include OncallApi(oncallState, oncallCalendarState, oncallRegionalState, oncallActor, oncallAccess, oncallEligible, oncallRoster, oncallScopeValid);
  include ResponseApi(responseState, oncallState, oncallCalendarState, oncallActor, oncallAccess, oncallEligible, oncallRoster, responseFresh, responseReady, sendResponse, alertMonitoring, reportingWorkVoided);
  func oncallBusy(id : Nat) : Bool = (switch(serviceStatusState.configs.get(id)){case(?c)c.enabled;case null false}) or responseState.incidents.values().any(func i=i.projectId==id and i.resolvedAt==0 and i.openedAt+365*OncallPlanning.day > Time.now()) or alertState.sources.values().any(func x=x.projectId==id and x.enabled and x.revokedAt==0);
  func oncallProtected(p : OncallTypes.Plan) : Bool = reportingState.periods.values().any(func r=r.projectId==p.input.projectId and r.approvedAt==0 and r.startAt < p.input.endAt and p.input.startAt < r.endAt and r.endAt+r.policy.retentionDays*OncallPlanning.day > Time.now());
  include OncallCalendarApi(oncallCalendarState,oncallState,oncallActor,oncallAccess,oncallEligible,oncallRoster,oncallBusy,oncallProtected);
  func alertRandom() : async Text { hex(await ic00.raw_rand()) };
  include AlertApi(func id = OncallCalendar.active(oncallCalendarState,id), alertState, oncallState, responseState, oncallActor, oncallAccess, digest, alertRandom, createResponseIncident, responseMonitoringEvent);
  include ReportingApi(reportingState,compensationState,oncallState,oncallCalendarState,responseState,reportingActor,reportingCapability,oncallEligible,reportingPersonActive,personName);
  include StatusApi(serviceStatusState,oncallState,responseState,oncallActor,func tok = me(tok)!=null,oncallAccess,func id = OncallCalendar.active(oncallCalendarState,id));
  ignore Timer.recurringTimer<system>(#seconds 10, func() : async () { sweepAlerts(); sweepReporting(); sweepOncallCalendar(); sweepServiceStatus(); for(id in oncallRegionalState.recipes.keys().toArray().values())if(not oncallState.plans.containsKey(id))oncallRegionalState.recipes.remove(id); await sweepResponse(); await sweepOncallReminders() });
};
