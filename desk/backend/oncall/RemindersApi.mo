import R "Reminders";
import O "Types";
import P "Planning";
import C "Calendar";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Time "mo:core/Time";
mixin (reminders : R.State,planning : O.State,calendar : C.State,auth : Text -> ?O.Actor,access : (O.Actor,O.Project)->Bool,eligible : (O.Project,Text)->Bool,fresh : ()->Bool,ready : ()->Bool,send : (Nat,Text,Text,Text,Text)->async {ok : Bool;detail : Text}) {
 func reminderViewer(tok : Text,id : Nat) : ?(O.Actor,O.Project){let a=auth(tok) ?? (return null);let p=planning.projects.get(id) ?? (return null);if(not access(a,p))return null;?(a,p)};
 public query func oncallReminders(tok : Text,id : Nat) : async ?{policy : ?R.Policy;jobs : [R.Job];ready : Bool;full : Bool} {
  let(a,_)=reminderViewer(tok,id) ?? (return null);
  let visible=reminders.jobs.values().toArray().filter(func j=j.projectId==id and j.expiresAt+7*P.day > Time.now() and (a.role=="admin" or j.recipient==a.id)).sort(func(a,b)=Int.compare(b.createdAt,a.createdAt));
  ?{policy=reminders.policies.get(id);jobs=visible.values().take(50).toArray();ready=ready();full=reminders.jobs.size() >= 5000}
 };
 public func setOncallReminders(tok : Text,id : Nat,revision : Nat,input : R.PolicyInput) : async O.Result {
  let(a,p)=reminderViewer(tok,id) ?? (return #err(#denied));if(a.role!="admin")return #err(#denied);
  let old=reminders.policies.get(id);if((switch old{case(?x)x.revision;case null 0})!=revision)return #err(#stale);
  if(input.coordinators.size() > 3 or (input.enabled and input.coordinators.size()==0))return #err(#invalid("Choose 1–3 planning contacts"));
  for(i in input.coordinators.keys())if(not eligible(p,input.coordinators[i]) or input.coordinators.keys().any(func j=j < i and input.coordinators[i]==input.coordinators[j]))return #err(#invalid("Choose distinct people with access to this project"));
  if(input.enabled and (not C.active(calendar,id) or not ready()))return #err(#invalid("Restore this project and configure Desk’s HTTPS address and Hub connection first"));
  reminders.policies.add(id,{input with revision=revision+1;by=a.id;at=Time.now()});reminders.scanned.remove(id);
  // Disabling is immediate for queued jobs; a dispatched Hub call may finish.
  if(not input.enabled)for((key,j) in reminders.jobs.entries().toArray().values())if(j.projectId==id and j.status==#pending)reminders.jobs.add(key,{j with status=#cancelled;detail="Reminders paused"});
  #ok({id;revision=revision+1})
 };
 func reminderPlanningAttention(p : O.Project) : Bool {
  let now=Time.now();let future=planning.plans.values().toArray().filter(func x=x.input.projectId==p.id and x.publication!=null and C.end(calendar,x) > now).sort(func(a,b)=Int.compare(a.input.startAt,b.input.startAt));
  var until=now;
  for(plan in future.values()){
   if(plan.input.startAt > until)break;
   until:=Int.max(until,C.end(calendar,plan));
   if(C.issues(calendar,plan,planning.swaps.get(plan.id) ?? [],func person=eligible(p,person),now).any(func i=i.endAt > now and i.startAt < now+7*P.day))return true;
   if(until >= now+7*P.day)return false
  };true
 };
 func reminderCover(source : R.Source) : ?{recipient : Text;startAt : Int;endAt : Int;projectId : Nat} {
  switch source{case(#planning _)null;case(#cover c){
   let p=planning.plans.get(c.planId) ?? (return null);if(p.publication==null)return null;
   let old=if(c.interval)(calendar.covers.get(c.planId) ?? []).find(func s=s.id==c.coverId) else (planning.swaps.get(c.planId) ?? []).find(func s=s.id==c.coverId);
   let swap=old ?? (return null);if(swap.state!=#pending or swap.shift >= p.input.shifts.size())return null;
   let shift=p.input.shifts[swap.shift];var startAt=shift.startAt;var endAt=shift.endAt;
   if(c.interval){let part=(calendar.covers.get(c.planId) ?? []).find(func s=s.id==c.coverId) ?? (return null);startAt:=part.startAt;endAt:=part.endAt};
   if(startAt <= Time.now() or endAt > C.end(calendar,p))return null;
   if(C.segments(calendar,p,planning.swaps.get(p.id) ?? []).any(func s=s.shift==swap.shift and P.overlap(s,{startAt;endAt}) and s.personId!=swap.fromPersonId))return null;
   ?{recipient=swap.toPersonId;startAt;endAt;projectId=p.input.projectId}
  }}
 };
 func reminderValid(j : R.Job,p : O.Project,policy : R.Policy) : Bool {
  if(not policy.enabled or not C.active(calendar,p.id) or j.expiresAt <= Time.now() or not eligible(p,j.recipient))return false;
  switch(j.source){case(#planning s)s.day==Time.now()/P.day and policy.coordinators.contains(j.recipient) and reminderPlanningAttention(p);case(#cover c){let request=reminderCover(j.source) ?? (return false);request.projectId==p.id and request.recipient==j.recipient and (not c.urgent or request.startAt <= Time.now()+P.day)}}
 };
 func reminderQueue(projectId : Nat,recipient : Text,source : R.Source,key : Text,title : Text,path : Text,expiresAt : Int) {
  if(reminders.jobs.size() >= 5000 or reminders.jobs.containsKey(key))return;
  reminders.jobs.add(key,{key;projectId;recipient;source;title;path;createdAt=Time.now();expiresAt;status=#pending;attempts=0;nextAttempt=Time.now();leaseUntil=0;detail="Waiting for Hub"})
 };
 func reminderScan(p : O.Project,policy : R.Policy) {
  if(not policy.enabled or not C.active(calendar,p.id))return;
  let today=Time.now()/P.day;
  if(reminderPlanningAttention(p))for(person in policy.coordinators.values())if(eligible(p,person))reminderQueue(p.id,person,#planning({day=today}),"plan:"#p.id.toText()#":"#today.toText()#":"#person,"On-call · review the next seven days","#/oncall/"#p.id.toText(),(today+1)*P.day);
  for(plan in planning.plans.values())if(plan.input.projectId==p.id and plan.publication!=null){
   for(interval in [false,true].values()){
    let swaps : [O.Swap]=if(interval)calendar.covers.get(plan.id) ?? [] else planning.swaps.get(plan.id) ?? [];
    for(swap in swaps.values())if(swap.state==#pending){
     let source=#cover({planId=plan.id;coverId=swap.id;interval;urgent=false});
     switch(reminderCover(source)){case null{};case(?r){
      if(eligible(p,r.recipient)){
       let urgent=r.startAt <= Time.now()+P.day;let prefix=if(interval)"part:" else "whole:";let stem=prefix#plan.id.toText()#":"#swap.id.toText();
       // A near-term request receives one message, not immediate + reminder together.
       let first=reminders.jobs.get(stem);let due=urgent and first!=null and (switch first{case(?j)j.createdAt+60*60_000_000_000 <= Time.now();case null false});
       if(first==null or due)reminderQueue(p.id,r.recipient,#cover({planId=plan.id;coverId=swap.id;interval;urgent=due}),stem#(if(due)":due" else ""),if(due)"On-call · cover starts within 24 hours" else "On-call · a teammate requested cover","#/oncall/"#p.id.toText()#"/"#plan.id.toText(),r.startAt)
      }
     }}
    }
   }
  }
 };
 func sweepOncallReminders() : async () {
  for((key,j) in reminders.jobs.entries().toArray().values())if(j.expiresAt+7*P.day <= Time.now())reminders.jobs.remove(key);
  if(not fresh() or not ready())return;
  let projects=planning.projects.values().toArray();
  if(projects.size() > 0){let p=projects[reminders.cursor%projects.size()];reminders.cursor+=1;if((reminders.scanned.get(p.id) ?? 0)+60_000_000_000 <= Time.now()){
   reminders.scanned.add(p.id,Time.now());switch(reminders.policies.get(p.id)){case(?policy)reminderScan(p,policy);case null{}}
  }};
  var sent=0;
  for(key in reminders.jobs.keys().toArray().values()){
   let job=reminders.jobs.get(key) ?? (continue);
   if(sent >= 4)return;if(job.status!=#pending or job.nextAttempt > Time.now() or job.leaseUntil > Time.now())continue;
   let p=planning.projects.get(job.projectId) ?? (continue);let policy=reminders.policies.get(p.id) ?? (continue);
   if(not reminderValid(job,p,policy)){reminders.jobs.add(key,{job with status=#cancelled;detail="Request, coverage or recipient access changed"});continue};
   if(not fresh() or not ready())return;
   if(job.attempts >= 3){reminders.jobs.add(key,{job with status=#failed;detail="Hub acceptance not confirmed after three attempts"});continue};
   let attempts=job.attempts+1;reminders.jobs.add(key,{job with attempts;leaseUntil=Time.now()+60_000_000_000});sent+=1;
   let receipt=try {await send(p.id,job.recipient,job.title,job.path,"desk:planning:"#key)}catch _{{ok=false;detail="Hub request failed"}};
   let current=reminders.jobs.get(key) ?? (continue);
   if(current.attempts==attempts and (receipt.ok or current.status==#pending))reminders.jobs.add(key,{current with status=if(receipt.ok)#accepted else if(attempts >= 3)#failed else #pending;nextAttempt=Time.now()+attempts*60_000_000_000;leaseUntil=0;detail=if(receipt.ok)"Accepted by Hub; human acknowledgement is not implied" else receipt.detail})
  }
 };
}
