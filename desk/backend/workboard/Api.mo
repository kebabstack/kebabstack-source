import T "Types";
import L "Logic";
import Source "mo:kebab-hub/Workboard";
import Support "mo:kebab-hub/Support";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Time "mo:core/Time";

// The host's bearer session and fresh Hub directory remain the authority.
// New durable state lives only in the host, passed by reference here.
mixin (
  state : T.State,
  subtasks : Map.Map<Nat, [T.Subtask]>,
  authenticate : Text -> ?T.Actor,
  access : (T.Actor, T.Project) -> Bool,
  groups : T.Actor -> [Text],
  eligible : (T.Project, Text) -> Bool,
  personActive : Text -> Bool,
  roster : T.Project -> [T.Person],
  name : Text -> Text,
  ticket : (T.Actor, Nat) -> ?Source.Card,
  ticketPage : (T.Actor, T.Filter, ?[Nat]) -> Source.Page,
  sources : Text -> async [Support.Source],
  sales : (Text, Nat, Source.SalesFilter) -> async Source.Page
) {
  func wbProjectFor(a : T.Actor, id : Nat) : ?T.Project {
    let p = state.projects.get(id) ?? (return null);
    if (not access(a, p)) return null;
    ?p
  };
  func wbScopeFor(a : T.Actor, id : ?Nat) : Bool {
    switch (id) { case null true; case (?id) wbProjectFor(a, id) != null }
  };
  func wbTaskAccess(a : T.Actor, t : T.Task) : Bool {
    switch (t.projectId) { case null a.role == "admin" or t.createdBy == a.id; case (?id) wbProjectFor(a, id) != null }
  };
  func wbActive(id : ?Nat) : Bool {
    switch (id) { case null true; case (?id) { let p = state.projects.get(id) ?? (return false); not p.archived } }
  };
  func wbCanManage(a : T.Actor, p : T.Project) : Bool = access(a, p) and (a.role == "admin" or p.createdBy == a.id);
  func wbPersonEligible(a : T.Actor, input : T.TaskInput, creator : Text) : Bool {
    if (input.assignee == "") return input.projectId != null;
    switch (input.projectId) {
      case null input.assignee == creator and personActive(creator);
      case (?id) { let p = wbProjectFor(a, id) ?? (return false); eligible(p, input.assignee) };
    }
  };
  func wbTaskPeople(a : T.Actor, t : T.Task) : [T.Person] {
    switch (t.projectId) { case null [{ id = t.createdBy; name = name(t.createdBy) }]; case (?id) { let p = wbProjectFor(a, id) ?? (return []); roster(p) } }
  };
  func wbTaskView(a : T.Actor, t : T.Task) : T.TaskView = {
    t with subtaskCount = (subtasks.get(t.id) ?? []).size(); subtasksDone = (subtasks.get(t.id) ?? []).filter(func s = s.done).size(); assigneeName = if (t.assignee == "") "" else name(t.assignee);
    assigneeAvailable = t.assignee == "" or wbPersonEligible(a, t, t.createdBy);
    projectName = switch (t.projectId) { case null "Personal tasks"; case (?id) switch (state.projects.get(id)) { case (?p) p.name; case null "Unavailable project" } };
  };
  func wbProjectView(a : T.Actor, p : T.Project) : T.ProjectView {
    var openTasks = 0; var doneTasks = 0;
    for (t in state.tasks.values()) if (t.projectId == ?p.id and not t.archived) {
      if (t.column == #done) doneTasks += 1 else openTasks += 1
    };
    { p with canManage = wbCanManage(a, p); openTasks; doneTasks }
  };
  func wbHistory(key : Text) : [{ at : Int; by : Text; action : Text }] = (state.audit.get(key) ?? []).map(func e = { e with by = name(e.by) });
  public query func workboardHome(tok : Text) : async ?{
    projects : [T.ProjectView]; preferences : T.Preferences; groups : [Text]
  } {
    let a = authenticate(tok) ?? (return null);
    let saved = state.preferences.get(a.id) ?? L.defaults;
    let preferences = if (wbScopeFor(a, saved.projectId) and wbActive(saved.projectId)) saved else ({ saved with projectId = null });
    ?{ projects = state.projects.values().toArray().filter(func p = access(a, p)).map(func p = wbProjectView(a, p)); preferences; groups = groups(a) }
  };
  public func saveWorkboardPreferences(tok : Text, input : T.Preferences) : async Bool {
    let a = authenticate(tok) ?? (return false);
    if (not wbScopeFor(a, input.projectId) or not wbActive(input.projectId)) return false;
    if (not state.preferences.containsKey(a.id) and state.preferences.size() >= 10000) return false;
    state.preferences.add(a.id, input); true
  };
  public query func workboardProject(tok : Text, id : Nat) : async ?{
    project : T.ProjectView; people : [T.Person]; history : [T.Audit]
  } {
    let a = authenticate(tok) ?? (return null);
    let p = wbProjectFor(a, id) ?? (return null);
    ?{ project = wbProjectView(a, p); people = roster(p); history = wbHistory("p:" # id.toText()) }
  };
  public func saveWorkProject(tok : Text, id : Nat, revision : Nat, key : Text, input : T.ProjectInput) : async T.Result {
    let a = authenticate(tok) ?? (return #err(#denied));
    switch (L.projectError(input)) { case (?e) return #err(#invalid(e)); case null {} };
    if (id == 0) {
      if (not L.validKey(key)) return #err(#invalid("Invalid request identifier"));
      let k = a.id # ":project:" # key;
      switch (state.requests.get(k)) { case (?r) {
        if (r.input != to_candid(input)) return #err(#stale);
        let p = wbProjectFor(a, r.id) ?? (return #err(#denied));
        return #ok({ id = p.id; revision = p.revision })
      }; case null {} };
      switch (input.scope) { case (#personal) {}; case (#group g) { if (not groups(a).contains(g)) return #err(#denied) } };
      if (state.projects.size() >= L.maxProjects) return #err(#limit("Maximum 100 projects"));
      let id = state.nextProject; state.nextProject += 1;
      let p : T.Project = { input with id; revision = 1; createdBy = a.id; createdAt = Time.now(); updatedAt = Time.now(); archived = false };
      state.projects.add(id, p); state.requests.add(k, { id; input = to_candid(input) });
      L.record(state, "p:" # id.toText(), a.id, "Project created");
      #ok({ id; revision = 1 })
    } else {
      let p = wbProjectFor(a, id) ?? (return #err(#denied));
      if (not wbCanManage(a, p)) return #err(#denied);
      if (p.revision != revision) return #err(#stale);
      if (input.scope != p.scope) return #err(#invalid("Project audience is fixed. Create another project for a different audience"));
      if (p.archived) return #err(#invalid("Restore the project before editing"));
      let updated = { p with name = input.name; description = input.description; dueOn = input.dueOn; revision = revision + 1; updatedAt = Time.now() };
      state.projects.add(id, updated); L.record(state, "p:" # id.toText(), a.id, "Project details updated");
      #ok({ id; revision = updated.revision })
    }
  };
  public func archiveWorkProject(tok : Text, id : Nat, revision : Nat, archived : Bool) : async T.Result {
    let a = authenticate(tok) ?? (return #err(#denied));
    let p = wbProjectFor(a, id) ?? (return #err(#denied));
    if (not wbCanManage(a, p)) return #err(#denied);
    if (p.revision != revision) return #err(#stale);
    let updated = { p with archived; revision = revision + 1; updatedAt = Time.now() };
    state.projects.add(id, updated); L.record(state, "p:" # id.toText(), a.id, if (archived) "Project archived; source work unchanged" else "Project restored");
    #ok({ id; revision = updated.revision })
  };
  public query func workboardTasks(tok : Text, f : T.Filter, archived : Bool) : async ?{ rows : [T.TaskView]; total : Nat; checkedAt : Int } {
    let a = authenticate(tok) ?? (return null);
    if (not wbScopeFor(a, f.projectId) or f.search.size() > 150) return null;
    let rows = state.tasks.values().toArray().filter(func t = wbTaskAccess(a, t) and t.archived == archived and wbActive(t.projectId) and
      (f.projectId == null or t.projectId == f.projectId) and (not f.mine or t.assignee == a.id) and
      (f.completed or t.column != #done) and L.matches(t.title, f.search)).sort(L.taskOrder);
    ?{ rows = L.slice(rows, f.offset).map(func t = wbTaskView(a, t)); total = rows.size(); checkedAt = Time.now() }
  };
  public query func workboardTask(tok : Text, id : Nat) : async ?{ task : T.TaskView; subtasks : [T.Subtask]; people : [T.Person]; history : [T.Audit]; readOnly : Bool } {
    let a = authenticate(tok) ?? (return null);
    let t = state.tasks.get(id) ?? (return null);
    if (not wbTaskAccess(a, t)) return null;
    ?{ task = wbTaskView(a, t); subtasks = subtasks.get(id) ?? []; people = wbTaskPeople(a, t); history = wbHistory("t:" # id.toText()); readOnly = not wbActive(t.projectId) }
  };
  public func saveWorkTask(tok : Text, id : Nat, revision : Nat, key : Text, input : T.TaskInput) : async T.Result {
    wbSaveTask(tok, id, revision, key, input, null)
  };
  public func saveWorkTaskWithSubtasks(tok : Text, id : Nat, revision : Nat, key : Text, input : T.TaskInput, items : [T.Subtask]) : async T.Result {
    wbSaveTask(tok, id, revision, key, input, ?items)
  };
  func wbSubtaskError(items : [T.Subtask], old : [T.Subtask], input : T.TaskInput) : ?Text {
    if (items.size() > 50) return ?"Use at most 50 subtasks per task";
    var seen : [Nat] = [];
    for (item in items.values()) {
      if (L.trim(item.title) == "" or item.title.size() > 180) return ?"Give every subtask a title of 1–180 characters";
      if (item.id != 0) {
        if (seen.contains(item.id) or not old.any(func row = row.id == item.id)) return ?"Subtasks changed. Reopen this task before saving.";
        seen := seen.concat([item.id]);
      };
    };
    if (input.column == #done and items.any(func item = not item.done)) return ?"Complete the remaining subtasks before marking this task done";
    null
  };
  func wbSaveSubtasks(id : Nat, revision : Nat, items : [T.Subtask]) {
    // At most 50 children: each parent revision reserves 100 IDs, never reusing a removed ID.
    var i = 0;
    subtasks.add(id, items.map(func row { i += 1; { row with id = if (row.id == 0) revision * 100 + i else row.id; title = L.trim(row.title) } }))
  };
  func wbSaveTask(tok : Text, id : Nat, revision : Nat, key : Text, input : T.TaskInput, children : ?[T.Subtask]) : T.Result {
    let a = authenticate(tok) ?? (return #err(#denied));
    switch (L.taskError(input)) { case (?e) return #err(#invalid(e)); case null {} };
    if (not wbScopeFor(a, input.projectId)) return #err(#denied);
    if (not wbActive(input.projectId)) return #err(#invalid("Restore the project before changing its tasks"));
    let encoded = switch (children) { case null to_candid(input); case (?items) to_candid(input, items) };
    if (id == 0) {
      if (not L.validKey(key)) return #err(#invalid("Invalid request identifier"));
      let k = a.id # ":task:" # key;
      switch (state.requests.get(k)) { case (?r) {
        if (r.input != encoded) return #err(#stale);
        let t = state.tasks.get(r.id) ?? (return #err(#missing));
        if (not wbTaskAccess(a, t)) return #err(#denied);
        return #ok({ id = t.id; revision = t.revision })
      }; case null {} };
      let items = children ?? [];
      switch (wbSubtaskError(items, [], input)) { case (?e) return #err(#invalid(e)); case null {} };
      if (not wbPersonEligible(a, input, a.id)) return #err(#invalid("Choose an active Desk colleague in this project's audience"));
      if (state.tasks.size() >= L.maxTasks) return #err(#limit("Maximum 5,000 tasks"));
      let id = state.nextTask; state.nextTask += 1;
      state.tasks.add(id, { input with id; revision = 1; createdBy = a.id; createdAt = Time.now(); updatedAt = Time.now(); archived = false });
      wbSaveSubtasks(id, 1, items);
      state.requests.add(k, { id; input = encoded }); L.record(state, "t:" # id.toText(), a.id, "Task created");
      #ok({ id; revision = 1 })
    } else {
      let t = state.tasks.get(id) ?? (return #err(#missing));
      if (not wbTaskAccess(a, t)) return #err(#denied);
      if (t.revision != revision) return #err(#stale);
      if (input.projectId != t.projectId) return #err(#invalid("A task keeps its original project and audience"));
      if (t.archived) return #err(#invalid("Restore the task before editing"));
      if (not wbPersonEligible(a, input, t.createdBy)) return #err(#invalid("Choose an active Desk colleague in this project's audience"));
      let oldItems = subtasks.get(id) ?? [];
      let items = children ?? oldItems;
      switch (wbSubtaskError(items, oldItems, input)) { case (?e) return #err(#invalid(e)); case null {} };
      let updated : T.Task = { input with id; revision = revision + 1; createdBy = t.createdBy; createdAt = t.createdAt; updatedAt = Time.now(); archived = false };
      state.tasks.add(id, updated);
      wbSaveSubtasks(id, updated.revision, items);
      if (items != oldItems) L.record(state, "t:" # id.toText(), a.id, "Subtasks updated · " # items.filter(func row = row.done).size().toText() # " of " # items.size().toText() # " complete");
      L.record(state, "t:" # id.toText(), a.id, if (input.column != t.column) "Task state updated" else "Task details updated");
      #ok({ id; revision = updated.revision })
    }
  };
  public func archiveWorkTask(tok : Text, id : Nat, revision : Nat, archived : Bool) : async T.Result {
    let a = authenticate(tok) ?? (return #err(#denied));
    let t = state.tasks.get(id) ?? (return #err(#missing));
    if (not wbTaskAccess(a, t)) return #err(#denied);
    if (not wbActive(t.projectId)) return #err(#invalid("Restore the project first"));
    if (t.revision != revision) return #err(#stale);
    state.tasks.add(id, { t with archived; revision = revision + 1; updatedAt = Time.now() });
    L.record(state, "t:" # id.toText(), a.id, if (archived) "Task archived" else "Task restored");
    #ok({ id; revision = revision + 1 })
  };
  public query func workboardTickets(tok : Text, f : T.Filter) : async Source.Page {
    let a = authenticate(tok) ?? (return Source.denied());
    if (not wbScopeFor(a, f.projectId) or not wbActive(f.projectId) or f.search.size() > 150) return Source.denied();
    let selection = switch (f.projectId) {
      case null null;
      case (?id) ?(state.links.get(id) ?? []).filterMap(func ref = switch (ref) { case (#ticket id) ?id; case (#sale _) null });
    };
    ticketPage(a, f, selection)
  };
  public func workboardSources(tok : Text) : async [Support.Source] {
    ignore authenticate(tok) ?? (return []);
    await sources(tok)
  };
  public func workboardSales(tok : Text, cid : Nat, projectId : ?Nat, completed : Bool, mine : Bool, offset : Nat) : async Source.Page {
    let a = authenticate(tok) ?? (return Source.denied());
    if (not wbScopeFor(a, projectId) or not wbActive(projectId)) return Source.denied();
    let links = switch (projectId) { case null []; case (?id) state.links.get(id) ?? [] };
    let selection : Source.Selection = switch (projectId) {
      case null #all;
      case (?_) #ids(links.filterMap(func ref = switch (ref) { case (#sale s) { if (s.cid == cid) ?s.id else null }; case (#ticket _) null }));
    };
    let result = await sales(tok, cid, { selection; completed; mine; offset });
    let fresh = authenticate(tok) ?? (return Source.denied());
    if (fresh != a or not wbScopeFor(fresh, projectId) or not wbActive(projectId)) return Source.denied();
    switch (projectId) { case (?id) { if ((state.links.get(id) ?? []) != links) return Source.unavailable() }; case null {} };
    result
  };
  public func linkWorkItem(tok : Text, projectId : Nat, revision : Nat, ref : T.Link, attach : Bool) : async T.Result {
    let a = authenticate(tok) ?? (return #err(#denied));
    let p = wbProjectFor(a, projectId) ?? (return #err(#denied));
    if (p.archived) return #err(#invalid("Restore the project first"));
    if (p.revision != revision) return #err(#stale);
    let refs = state.links.get(projectId) ?? [];
    if (attach) {
      if (refs.any(func x = x == ref)) return #ok({ id = projectId; revision });
      if (refs.size() >= L.maxLinks) return #err(#limit("Maximum 100 linked records per project"));
      switch (ref) {
        case (#ticket id) { if (ticket(a, id) == null) return #err(#denied) };
        case (#sale s) {
          let result = await sales(tok, s.cid, { selection = #ids([s.id]); completed = true; mine = false; offset = 0 });
          switch (result.state) { case (#denied) return #err(#denied); case (#unavailable) return #err(#unavailable); case (#ready) {} };
          if (not result.rows.any(func row = row.id == s.id)) return #err(#missing);
        };
      };
    };
    let fresh = authenticate(tok) ?? (return #err(#denied));
    let current = wbProjectFor(fresh, projectId) ?? (return #err(#denied));
    if (fresh != a or current != p) return #err(#stale);
    state.links.add(projectId, if (attach) refs.concat([ref]) else refs.filter(func x = x != ref));
    state.projects.add(projectId, { p with revision = revision + 1; updatedAt = Time.now() });
    L.record(state, "p:" # projectId.toText(), a.id, if (attach) "Source record linked; original permissions retained" else "Source record unlinked; original unchanged");
    #ok({ id = projectId; revision = revision + 1 })
  };
}
