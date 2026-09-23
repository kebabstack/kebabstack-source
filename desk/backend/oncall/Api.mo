import T "Types";
import Planning "Planning";
import Calendar "Calendar";
import Regional "Regional";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";

// The host supplies its existing token/Hub-directory authorization. No new login
// or app-local grants; all mutations below execute without an await boundary.
mixin (state : T.State, calendar : Calendar.State, regional : Regional.State, authenticate : Text -> ?T.Actor, access : (T.Actor, T.Project) -> Bool, eligible : (T.Project, Text) -> Bool, roster : T.Project -> [T.Person], scopeValid : T.Scope -> Bool) {
  func viewer(tok : Text, projectId : Nat) : ?(T.Actor, T.Project) {
    let user = authenticate(tok) ?? (return null);
    let project = state.projects.get(projectId) ?? (return null);
    if (not access(user, project)) return null;
    ?(user, project)
  };
  func bump(p : T.Plan) { state.plans.add(p.id, { p with revision = p.revision + 1 }) };
  public query func oncallProjects(tok : Text) : async [T.Project and {archived:Bool}] {
    let user = authenticate(tok) ?? (return []);
    state.projects.values().toArray().filter(func p = access(user, p)).map(func p={p with archived=not Calendar.active(calendar,p.id)})
  };
  public query func oncallWorkspace(tok : Text, id : Nat) : async ?T.Workspace {
    let (user, project) = viewer(tok, id) ?? (return null);
    ?{ project; members = roster(project); canManage = user.role == "admin";
      plans = state.plans.values().toArray().filter(func p = p.input.projectId == id and (p.publication != null or user.role == "admin")).map(func p={Planning.summary(p) with endAt=Calendar.end(calendar,p)}).sort(func (a, b) = Int.compare(b.startAt, a.startAt)) }
  };
  public query func oncallPlan(tok : Text, id : Nat) : async ?T.PlanView {
    let p = state.plans.get(id) ?? (return null);
    let (user, project) = viewer(tok, p.input.projectId) ?? (return null);
    if (p.publication == null and user.role != "admin") return null;
    let swaps = state.swaps.get(id) ?? [];
    ?{ plan = p; swaps; issues = Calendar.issues(calendar, p, swaps, func person = eligible(project, person), Time.now()) }
  };
  public func createOncallProject(tok : Text, key : Text, input : T.ProjectInput) : async T.Result {
    let user = authenticate(tok) ?? (return #err(#denied));
    if (user.role != "admin") return #err(#denied);
    if (not Planning.validKey(key)) return #err(#invalid("Invalid request identifier"));
    switch (Planning.projectError(input)) { case (?error) return #err(#invalid(error)); case null {} };
    if (not scopeValid(input.scope)) return #err(#invalid("Choose an existing Hub group or customer project"));
    for (p in state.projects.values()) {
      if (p.createdBy == user.id and p.requestKey == key) {
        let original : T.ProjectInput = p;
        if (original != input) return #err(#stale);
        return #ok({ id = p.id; revision = 1 })
      };
      switch (input.scope, p.scope) { case (#customer a, #customer b) { if (a == b) return #err(#invalid("This customer project already has On-call enabled")) }; case _ {} }
    };
    if (state.projects.size() >= 30) return #err(#limit("Maximum 30 on-call projects"));
    let id = state.nextProject; state.nextProject += 1;
    state.projects.add(id, { input with id; createdAt = Time.now(); createdBy = user.id; requestKey = key });
    #ok({ id; revision = 1 })
  };
  public query func oncallRegionalRecipe(tok : Text,id : Nat) : async ?Regional.Saved {
    let p=state.plans.get(id) ?? (return null);let(a,_)=viewer(tok,p.input.projectId) ?? (return null);
    if(p.publication==null and a.role!="admin")return null;regional.recipes.get(id)
  };
  public func saveOncallRegionalPlan(tok : Text,id : Nat,revision : Nat,key : Text,input : T.PlanInput,recipe : Regional.Recipe) : async T.Result {
    let(a,project)=viewer(tok,input.projectId) ?? (return #err(#denied));if(a.role!="admin")return #err(#denied);
    switch(Regional.error(recipe,input)){case(?e)return #err(#invalid(e));case null{}};
    for(r in recipe.regions.values())for(person in r.primary.concat(r.backup).values())if(not eligible(project,person))return #err(#invalid("A regional responder no longer has access. Review the rotation in Hub"));
    if(id==0)for(p in state.plans.values())if(p.createdBy==a.id and p.requestKey==key){
      if((regional.recipes.get(p.id) ?? (return #err(#stale))).recipe!=recipe)return #err(#stale)
    };
    let result=oncallSavePlan(tok,id,revision,key,input);
    switch result{case(#ok saved)regional.recipes.add(saved.id,{recipe;edited=false});case _{}};result
  };
  public func saveOncallPlan(tok : Text,id : Nat,revision : Nat,key : Text,input : T.PlanInput) : async T.Result {
    let result=oncallSavePlan(tok,id,revision,key,input);
    switch result{case(#ok saved){switch(regional.recipes.get(saved.id)){case(?r)regional.recipes.add(saved.id,{r with edited=true});case null{}}};case _{}};result
  };
  func oncallSavePlan(tok : Text, id : Nat, revision : Nat, key : Text, input : T.PlanInput) : T.Result {
    let (user, project) = viewer(tok, input.projectId) ?? (return #err(#denied));
    if (user.role != "admin" or not Calendar.active(calendar, project.id)) return #err(#denied);
    switch (Planning.planError(input)) { case (?error) return #err(#invalid(error)); case null {} };
    if (input.endAt <= Time.now() or input.startAt > Time.now() + 366 * Planning.day) return #err(#invalid("Choose a future planning period within the next year"));
    for (s in input.shifts.values()) if (s.personId != "" and not eligible(project, s.personId)) return #err(#invalid("A selected responder is no longer eligible for this project"));
    if (id == 0) {
      if (not Planning.validKey(key)) return #err(#invalid("Invalid request identifier"));
      for (p in state.plans.values()) if (p.createdBy == user.id and p.requestKey == key) {
        if (p.input != input) return #err(#stale);
        return #ok({ id = p.id; revision = p.revision })
      };
      if (state.plans.size() >= 512 or state.plans.values().toArray().filter(func p = p.input.projectId == input.projectId).size() >= 128) return #err(#limit("Planning history is full. Discard unused drafts or wait for configured retention"));
      let pid = state.nextPlan; state.nextPlan += 1;
      state.plans.add(pid, { id = pid; revision = 1; input; publication = null; createdAt = Time.now(); createdBy = user.id; requestKey = key });
      return #ok({ id = pid; revision = 1 })
    };
    let old = state.plans.get(id) ?? (return #err(#missing));
    if (old.input.projectId != input.projectId) return #err(#denied);
    if (old.revision != revision) return #err(#stale);
    if (old.publication != null or calendar.cancellations.containsKey(id)) return #err(#invalid("Published plans are preserved. Request a replacement or plan the next period"));
    state.plans.add(id, { old with revision = revision + 1; input });
    #ok({ id; revision = revision + 1 })
  };
  public func publishOncallPlan(tok : Text, id : Nat, revision : Nat, acceptGaps : Bool) : async T.Result {
    let p = state.plans.get(id) ?? (return #err(#missing));
    let (user, project) = viewer(tok, p.input.projectId) ?? (return #err(#denied));
    if (user.role != "admin") return #err(#denied);
    if (p.revision != revision) return #err(#stale);
    if (not Calendar.active(calendar, project.id) or calendar.cancellations.containsKey(id)) return #err(#invalid("This project or plan is no longer active"));
    if (p.publication != null) return #err(#invalid("Already published"));
    if (p.input.startAt <= Time.now()) return #err(#invalid("Publication must precede the planning period; regenerate future dates"));
    for (s in p.input.shifts.values()) if (s.personId != "" and not eligible(project, s.personId)) return #err(#invalid("A selected responder is no longer eligible. Update the draft"));
    for (other in state.plans.values()) if (other.id != id and other.input.projectId == project.id and other.publication != null and p.input.startAt < Calendar.end(calendar, other) and other.input.startAt < p.input.endAt) return #err(#invalid("A published period already covers these dates"));
    for(other in state.plans.values())if(other.id!=id and other.publication!=null)for(s in Calendar.segments(calendar,other,state.swaps.get(other.id) ?? []).values())if(s.personId!="" and p.input.shifts.any(func x=x.personId==s.personId and Planning.overlap(x,s)))return #err(#invalid("A responder already covers another published interval. Other project details remain private"));
    let issues = Calendar.issues(calendar, p, [], func person = eligible(project, person), Time.now());
    if (issues.size() > 0 and not acceptGaps) return #err(#invalid("Review and explicitly accept uncovered intervals before publishing"));
    let names = roster(project).filter(func person = p.input.shifts.any(func s = s.personId == person.id));
    state.plans.add(id, { p with revision = revision + 1; publication = ?{ at = Time.now(); by = user.id; names; acceptedGaps = acceptGaps } });
    #ok({ id; revision = revision + 1 })
  };
  public func requestOncallCover(tok : Text, id : Nat, revision : Nat, shift : Nat, toPersonId : Text, reason : Text) : async T.Result {
    let p = state.plans.get(id) ?? (return #err(#missing));
    let (user, project) = viewer(tok, p.input.projectId) ?? (return #err(#denied));
    if (p.revision != revision) return #err(#stale);
    if (not Calendar.active(calendar,project.id) or calendar.cancellations.containsKey(id) or (calendar.covers.get(id) ?? []).any(func x=x.shift==shift and (x.state==#accepted or x.state==#pending)))return #err(#invalid("Use interval cover for a changed shift"));
    if (p.publication == null or shift >= p.input.shifts.size()) return #err(#invalid("Choose a published shift"));
    if (p.input.shifts[shift].startAt <= Time.now()) return #err(#invalid("Only future shifts can be transferred in this planning release"));
    let swaps = state.swaps.get(id) ?? [];
    let fromPersonId = Planning.effectivePerson(p, swaps, shift);
    if (user.role != "admin" and user.id != fromPersonId) return #err(#denied);
    if (not eligible(project, toPersonId) or toPersonId == fromPersonId or reason.size() == 0 or reason.size() > 240) return #err(#invalid("Choose an eligible replacement and add a brief reason"));
    if (swaps.size() >= 200) return #err(#limit("Maximum 200 replacement records per plan"));
    if (swaps.any(func s = s.shift == shift and s.state == #pending)) return #err(#invalid("A replacement request is already pending for this shift"));
    let sid = state.nextSwap; state.nextSwap += 1;
    let swap : T.Swap = { id = sid; planId = id; shift; fromPersonId; toPersonId; toName = (roster(project).find(func m = m.id == toPersonId) ?? (return #err(#denied))).name; reason; requestedBy = user.id; requestedAt = Time.now(); state = #pending; decidedAt = 0; decidedBy = "" };
    state.swaps.add(id, swaps.concat([swap])); bump(p);
    #ok({ id = sid; revision = revision + 1 })
  };
  public func decideOncallCover(tok : Text, id : Nat, revision : Nat, swapId : Nat, decision : { #accept; #decline; #cancel }) : async T.Result {
    let p = state.plans.get(id) ?? (return #err(#missing));
    let (user, project) = viewer(tok, p.input.projectId) ?? (return #err(#denied));
    if (p.revision != revision) return #err(#stale);
    let swaps = state.swaps.get(id) ?? [];
    let swap = swaps.find(func s = s.id == swapId) ?? (return #err(#missing));
    if (swap.state != #pending) return #err(#invalid("This request has already been decided"));
    let next : T.SwapState = switch (decision) {
      case (#cancel) { if (user.id != swap.requestedBy and user.role != "admin") return #err(#denied); #cancelled };
      case (#decline) { if (user.id != swap.toPersonId) return #err(#denied); #declined };
      case (#accept) {
        if (user.id != swap.toPersonId or not eligible(project, user.id)) return #err(#denied);
        let shift = p.input.shifts[swap.shift];
        if(not Calendar.active(calendar,project.id) or Calendar.end(calendar,p) < shift.endAt or Calendar.unavailable(calendar,project.id,user.id,shift.startAt,shift.endAt) or (calendar.covers.get(id) ?? []).any(func x=x.shift==swap.shift and x.state==#accepted))return #err(#invalid("Coverage or availability changed; request the remaining interval"));
        for(other in state.plans.values())if(other.publication!=null)for(s in Calendar.segments(calendar,other,state.swaps.get(other.id) ?? []).values())if(s.personId==user.id and Planning.overlap(s,shift))return #err(#invalid("You already cover another published interval"));
        if (shift.startAt <= Time.now()) return #err(#invalid("The shift has started; this request can no longer change it"));
        if (Planning.effectivePerson(p, swaps, swap.shift) != swap.fromPersonId) return #err(#stale);
        for (i in p.input.shifts.keys()) if (i != swap.shift and Planning.effectivePerson(p, swaps, i) == user.id and Planning.overlap(shift, p.input.shifts[i])) return #err(#invalid("You already cover another response layer during this shift"));
        #accepted
      }
    };
    state.swaps.add(id, swaps.map(func s = if (s.id == swapId) ({ s with state = next; decidedAt = Time.now(); decidedBy = user.id }) else s)); bump(p);
    #ok({ id = swapId; revision = revision + 1 })
  };
}
