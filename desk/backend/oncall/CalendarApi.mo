import T "Types";
import C "Calendar";
import P "Planning";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Time "mo:core/Time";
mixin (cal : C.State, plans : T.State, auth : Text -> ?T.Actor, canRead : (T.Actor,T.Project)->Bool, eligible : (T.Project,Text)->Bool, roster : T.Project->[T.Person], busy : Nat -> Bool, protectedPlan : T.Plan -> Bool) {
 func calendarViewer(tok : Text,id : Nat) : ?(T.Actor,T.Project) {let a=auth(tok) ?? (return null);let p=plans.projects.get(id) ?? (return null);if(not canRead(a,p))return null;?(a,p)};
 public query func oncallCalendar(tok : Text,id : Nat) : async ?{settings : C.ProjectSettings;absences : [C.Absence]} {let _=calendarViewer(tok,id) ?? (return null);?{settings=C.settings(cal,id);absences=cal.absences.values().toArray().filter(func a=a.projectId==id and a.endAt > Time.now()-93*P.day)}};
 public query func oncallEffectivePlan(tok : Text,id : Nat) : async ?{segments : [C.Segment];covers : [C.Cover];cancellation : ?C.Cancellation} {let p=plans.plans.get(id) ?? (return null);let(a,_)=calendarViewer(tok,p.input.projectId) ?? (return null);if(p.publication==null and a.role!="admin")return null;?{segments=C.segments(cal,p,plans.swaps.get(id) ?? []);covers=cal.covers.get(id) ?? [];cancellation=cal.cancellations.get(id)}};
 public func updateOncallProject(tok : Text,id : Nat,revision : Nat,name : Text,description : Text,services : [Text],retentionDays : Nat) : async T.Result {
  let(a,p)=calendarViewer(tok,id) ?? (return #err(#denied));if(a.role!="admin")return #err(#denied);let old=C.settings(cal,id);if(old.revision!=revision)return #err(#stale);
  let input={p with name;description;services};switch(P.projectError(input)){case(?e)return #err(#invalid(e));case null{}};
  if(retentionDays < 400 or retentionDays > 3650)return #err(#invalid("Keep planning history for 400–3650 days after the period ends"));
  if(p.services.any(func service=not services.contains(service)))return #err(#invalid("Existing services remain attached to history. Add services without removing or renaming existing ones"));
  for(i in services.keys())for(j in services.keys())if(j < i and services[i]==services[j])return #err(#invalid("Service names must be unique"));
  plans.projects.add(id,input);cal.settings.add(id,{old with revision=revision+1;retentionDays;retentionChangedAt=if(retentionDays!=old.retentionDays)Time.now() else old.retentionChangedAt});#ok({id;revision=revision+1})
 };
 public func archiveOncallProject(tok : Text,id : Nat,revision : Nat,archived : Bool) : async T.Result {
  let(a,_)=calendarViewer(tok,id) ?? (return #err(#denied));if(a.role!="admin")return #err(#denied);let old=C.settings(cal,id);if(old.revision!=revision)return #err(#stale);
  if(archived and (busy(id) or plans.plans.values().any(func p=p.input.projectId==id and (if(p.publication==null)cal.cancellations.get(p.id)==null and p.input.endAt > Time.now() else C.end(cal,p) > Int.max(Time.now(),p.input.startAt)))))return #err(#invalid("Resolve incidents, pause alert sources, unpublish status and end or cancel remaining plans first"));
  cal.settings.add(id,{old with revision=revision+1;archivedAt=if(archived)Time.now() else 0});#ok({id;revision=revision+1})
 };
 public func cancelOncallPlan(tok : Text,id : Nat,revision : Nat,from : Int,reason : Text) : async T.Result {
  let p=plans.plans.get(id) ?? (return #err(#missing));let(a,_)=calendarViewer(tok,p.input.projectId) ?? (return #err(#denied));if(a.role!="admin")return #err(#denied);
  if(p.revision!=revision or cal.cancellations.containsKey(id))return #err(#stale);
  if(from < Time.now() or from >= p.input.endAt or reason.trim(#char ' ').size() < 3 or reason.size() > 240)return #err(#invalid("Choose a future cutoff before the plan ends and a reason. Past service stays unchanged"));
  cal.cancellations.add(id,{from;at=Time.now();by=a.id;reason});plans.plans.add(id,{p with revision=revision+1});#ok({id;revision=revision+1})
 };
 public func setOncallAbsence(tok : Text,projectId : Nat,personId : Text,startAt : Int,endAt : Int) : async T.Result {
  let(a,p)=calendarViewer(tok,projectId) ?? (return #err(#denied));if(not C.active(cal,projectId) or (a.role!="admin" and a.id!=personId))return #err(#denied);
  if(not eligible(p,personId) or startAt < Time.now() or endAt <= startAt or endAt-startAt > 93*P.day or endAt > Time.now()+366*P.day)return #err(#invalid("Choose an eligible person and a future absence up to 93 days within the next year"));
  for(existing in cal.absences.values())if(existing.projectId==projectId and existing.personId==personId and existing.startAt==startAt and existing.endAt==endAt and existing.cancelledAt==0)return #ok({id=existing.id;revision=1});
  if(cal.absences.size() >= 2000)return #err(#limit("Absence storage full"));if(C.unavailable(cal,projectId,personId,startAt,endAt))return #err(#invalid("An absence already overlaps these dates"));
  let id=cal.nextAbsence;cal.nextAbsence+=1;cal.absences.add(id,{id;projectId;personId;name=(roster(p).find(func x=x.id==personId) ?? ({id=personId;name="Responder"})).name;startAt;endAt;by=a.id;at=Time.now();cancelledAt=0});#ok({id;revision=1})
 };
 public func cancelOncallAbsence(tok : Text,id : Nat) : async T.Result {
  let absence=cal.absences.get(id) ?? (return #err(#missing));let(a,_)=calendarViewer(tok,absence.projectId) ?? (return #err(#denied));if(a.role!="admin" and a.id!=absence.personId)return #err(#denied);
  if(absence.startAt <= Time.now())return #err(#invalid("Started absence remains historical evidence"));if(absence.cancelledAt==0)cal.absences.add(id,{absence with cancelledAt=Time.now()});#ok({id;revision=1})
 };
 public func requestOncallInterval(tok : Text,id : Nat,revision : Nat,shift : Nat,startAt : Int,endAt : Int,toPersonId : Text,reason : Text) : async T.Result {
  let p=plans.plans.get(id) ?? (return #err(#missing));let(a,project)=calendarViewer(tok,p.input.projectId) ?? (return #err(#denied));if(not C.active(cal,project.id))return #err(#denied);
  if(p.revision!=revision)return #err(#stale);if(p.publication==null or shift >= p.input.shifts.size())return #err(#invalid("Choose a published shift"));
  let s=p.input.shifts[shift];if(startAt < Time.now() or startAt < s.startAt or endAt > Int.min(s.endAt,C.end(cal,p)) or endAt <= startAt)return #err(#invalid("Choose a future interval within this shift"));
  let effective=C.segments(cal,p,plans.swaps.get(id) ?? []).filter(func x=x.shift==shift and P.overlap(x,{startAt;endAt}));
  if(effective.size()==0)return #err(#invalid("No service remains in this interval"));let fromPersonId=effective[0].personId;if(effective.any(func x=x.personId!=fromPersonId))return #err(#invalid("Select an interval with one current responder"));
  if(a.role!="admin" and a.id!=fromPersonId)return #err(#denied);
  if(not eligible(project,toPersonId) or toPersonId==fromPersonId or C.unavailable(cal,project.id,toPersonId,startAt,endAt) or reason.trim(#char ' ').size()==0 or reason.size() > 240)return #err(#invalid("Choose an available replacement and a brief reason"));
  let covers=cal.covers.get(id) ?? [];if(covers.size() >= 200)return #err(#limit("Cover history full"));
  if(covers.any(func c=c.state==#pending and c.shift==shift and P.overlap(c,{startAt;endAt})) or (plans.swaps.get(id) ?? []).any(func x=x.shift==shift and x.state==#pending))return #err(#invalid("A cover request already overlaps this interval"));
  let sid=cal.nextCover;cal.nextCover+=1;cal.covers.add(id,covers.concat([{id=sid;planId=id;shift;startAt;endAt;fromPersonId;toPersonId;toName=(roster(project).find(func x=x.id==toPersonId) ?? (return #err(#denied))).name;reason;requestedBy=a.id;requestedAt=Time.now();state=#pending;decidedAt=0;decidedBy=""}]));plans.plans.add(id,{p with revision=revision+1});#ok({id=sid;revision=revision+1})
 };
 public func decideOncallInterval(tok : Text,id : Nat,revision : Nat,coverId : Nat,decision : {#accept;#decline;#cancel}) : async T.Result {
  let p=plans.plans.get(id) ?? (return #err(#missing));let(a,project)=calendarViewer(tok,p.input.projectId) ?? (return #err(#denied));let covers=cal.covers.get(id) ?? [];let c=covers.find(func x=x.id==coverId) ?? (return #err(#missing));if(p.revision!=revision or c.state!=#pending)return #err(#stale);
  let next:T.SwapState=switch decision{
   case(#cancel){if(a.role!="admin" and a.id!=c.requestedBy)return #err(#denied);#cancelled};
   case(#decline){if(a.id!=c.toPersonId)return #err(#denied);#declined};
   case(#accept){
    if(a.id!=c.toPersonId or not eligible(project,a.id) or not C.active(cal,project.id))return #err(#denied);
    if(c.startAt <= Time.now() or c.endAt > C.end(cal,p) or C.unavailable(cal,project.id,a.id,c.startAt,c.endAt))return #err(#invalid("The interval has started, ended or the replacement is unavailable"));
    let effective=C.segments(cal,p,plans.swaps.get(id) ?? []);if(effective.any(func s=s.shift==c.shift and P.overlap(s,c) and s.personId!=c.fromPersonId))return #err(#stale);
    for(other in plans.plans.values())if(other.publication!=null)for(s in C.segments(cal,other,plans.swaps.get(other.id) ?? []).values())if(s.personId==a.id and P.overlap(s,c))return #err(#invalid("You already cover another interval. Other project details remain private"));#accepted
   }
  };
  cal.covers.add(id,covers.map(func x=if(x.id==coverId)({x with state=next;decidedAt=Time.now();decidedBy=a.id})else x));plans.plans.add(id,{p with revision=revision+1});#ok({id=coverId;revision=revision+1})
 };
 public func discardOncallDraft(tok : Text,id : Nat,revision : Nat) : async T.Result {
  let p=plans.plans.get(id) ?? (return #err(#missing));let(a,_)=calendarViewer(tok,p.input.projectId) ?? (return #err(#denied));if(a.role!="admin")return #err(#denied);
  if(p.revision!=revision)return #err(#stale);if(p.publication!=null)return #err(#invalid("Published history cannot be discarded"));plans.plans.remove(id);cal.cancellations.remove(id);#ok({id;revision=revision+1})
 };
 func sweepOncallCalendar() {
  var count=0;for((id,p) in plans.plans.entries().toArray().values())if(count < 10 and p.input.endAt+C.settings(cal,p.input.projectId).retentionDays*P.day <= Time.now() and C.settings(cal,p.input.projectId).retentionChangedAt+7*P.day <= Time.now() and not protectedPlan(p)){plans.plans.remove(id);plans.swaps.remove(id);cal.covers.remove(id);cal.cancellations.remove(id);count+=1};
  for((id,a) in cal.absences.entries().toArray().values())if(a.endAt+93*P.day <= Time.now())cal.absences.remove(id)
 };
}
