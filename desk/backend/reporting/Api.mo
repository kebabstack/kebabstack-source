import T "Types";
import K "Compensation";
import C "Calc";
import O "../oncall/Types";
import P "../oncall/Planning";
import Calendar "../oncall/Calendar";
import Z "../oncall/Timezones";
import R "../response/Types";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Time "mo:core/Time";

mixin (state : T.State, compensation : K.State, planning : O.State, calendar : Calendar.State, response : R.State, authenticate : Text -> ?O.Actor,
  capability : (O.Actor, Nat, Text) -> Bool, eligible : (O.Project, Text) -> Bool,
  personActive : Text -> Bool, personName : Text -> Text) {
  func reportCaps(a : O.Actor, id : Nat) : T.Capabilities = { prepare = capability(a,id,"compensation"); review = capability(a,id,"time_review"); release = capability(a,id,"release"); export = capability(a,id,"export") };
  func reportAny(c : T.Capabilities) : Bool = c.prepare or c.review or c.release or c.export;
  func reportFinancial(c : T.Capabilities) : Bool = c.prepare or c.release;
  func reportRecords(id : Nat) : [T.Record] = state.records.values().toArray().filter(func r = r.periodId == id);
  func reportExpired(p : T.Period) : Bool = Time.now() >= p.endAt + p.policy.retentionDays * P.day;
  func reportHeader(p : T.Period) : T.Header = { p with sourceChanged = p.sourceChanged or (p.approvedAt > 0 and reportMissingSources(p, reportRecords(p.id))); deleteAt = p.endAt + p.policy.retentionDays * P.day };
  func reportCanRead(a : O.Actor, p : T.Period) : Bool {
    let c = reportCaps(a,p.projectId);
    c.prepare or (c.review and p.adjustmentOf == 0) or c.release or (c.export and p.approvedAt > 0) or reportRecords(p.id).any(func r = r.personId == a.id) or (switch(planning.projects.get(p.projectId)){case(?project)eligible(project,a.id);case null false})
  };
  func reportRead(tok : Text, id : Nat) : ?(O.Actor,T.Period) {
    let a = authenticate(tok) ?? (return null);let p = state.periods.get(id) ?? (return null);
    if (reportExpired(p) or not reportCanRead(a,p)) return null;?(a,p)
  };
  func reportLog(id : Nat, a : O.Actor, action : Text, recordId : Nat, reason : Text) {
    let entries = state.audit.get(id) ?? [];
    // A full journal blocks further financial mutation rather than dropping evidence.
    state.audit.add(id, entries.concat([{ at = Time.now(); by = a.id; action; recordId; reason }]))
  };
  func reportMutable(p : T.Period, revision : Nat) : Bool = p.approvedAt == 0 and p.revision == revision and (state.audit.get(p.id) ?? []).size() < 1000;
  func reportTouch(p : T.Period) { state.periods.add(p.id,{p with revision = p.revision + 1}) };
  func reportMapped(project : Nat, person : Text) : ?T.Mapping = state.mappings.get(project.toText() # ":" # person);
  func reportName(plan : O.Plan, id : Text, swaps : [O.Swap]) : Text {
    let replaced = swaps.find(func s = s.state == #accepted and s.toPersonId == id);
    switch replaced {case (?s) s.toName;case null switch (plan.publication) {case (?p) (p.names.find(func n = n.id == id) ?? ({id;name="Former participant"})).name;case null "Former participant"}}
  };
  func reportAdd(p : T.Period, person : Text, display : Text, kind : T.Kind, layer : Nat, start : Int, end : Int, breaks : Nat, source : Text, note : Text, delta : Int, by : Text, at : Int) {
    if (reportRecords(p.id).any(func r = r.sourceKey == source)) return;
    let id = state.nextRecord;state.nextRecord += 1;
    state.records.add(id,{id;periodId=p.id;personId=person;name=display;kind;layer;startAt=start;endAt=end;breakMinutes=breaks;sourceKey=source;note;delta;state=if(by=="")#pending else #confirmed;confirmedBy=by;confirmedAt=at;reviewedBy="";reviewedAt=0;reason=""})
  };
  // Import only service evidence. No incident title, conversation, customer data or work note is copied.
  func reportCandidates(p : T.Period) : [T.Record] {
    let out = List.empty<T.Record>();
    func row(person : Text, display : Text, kind : T.Kind, layer : Nat, start : Int, end : Int, breaks : Nat, source : Text, by : Text, at : Int) {
      out.add({id=0;periodId=p.id;personId=person;name=display;kind;layer;startAt=start;endAt=end;breakMinutes=breaks;sourceKey=source;note="";delta=0;state=if(by=="")#pending else #confirmed;confirmedBy=by;confirmedAt=at;reviewedBy="";reviewedAt=0;reason=""})
    };
    if (p.policy.readinessRates.size() > 0) for (plan in planning.plans.values()) if (plan.input.projectId == p.projectId and plan.publication != null) {
      let swaps = planning.swaps.get(plan.id) ?? [];
      for (segment in Calendar.segments(calendar,plan,swaps).values()) if(segment.startAt < p.endAt and segment.endAt > p.startAt and segment.personId!="") {
        let start=Int.max(segment.startAt,p.startAt);let finish=Int.min(segment.endAt,p.endAt);let original=plan.input.shifts[segment.shift];
        let base="shift:"#plan.id.toText()#":"#segment.shift.toText();
        let source=if(start==Int.max(original.startAt,p.startAt) and finish==Int.min(original.endAt,p.endAt) and segment.personId==P.effectivePerson(plan,swaps,segment.shift))base else base#":"#start.toText()#":"#finish.toText()#":"#segment.personId;
        let name=(calendar.covers.get(plan.id) ?? []).find(func c=c.state==#accepted and c.toPersonId==segment.personId);
        row(segment.personId,switch(name){case(?c)c.toName;case null reportName(plan,segment.personId,swaps)},#readiness,segment.layer,start,finish,0,source,"",0)
      }
    };
    for (w in response.work.values()) if (w.projectId == p.projectId and w.voidedAt == 0 and w.startAt < p.endAt and w.endAt > p.startAt) row(w.personId,w.name,#work,0,w.startAt,w.endAt,w.breakMinutes,"work:"#w.id.toText(),w.personId,w.at);
    out.toArray()
  };
  func reportCoverage(p : T.Period) : Nat {
    if(p.policy.readinessRates.size()==0)return 0;
    var cursor=p.startAt;var gaps=0;
    let plans=planning.plans.values().toArray().filter(func x=x.input.projectId==p.projectId and x.publication!=null and x.input.startAt < p.endAt and Calendar.end(calendar,x) > p.startAt).sort(func(a,b)=Int.compare(a.input.startAt,b.input.startAt));
    for(plan in plans.values()) {if(plan.input.startAt > cursor)gaps+=1;cursor:=Int.max(cursor,Calendar.end(calendar,plan));gaps+=Calendar.issues(calendar,plan,planning.swaps.get(plan.id)??[],func _=true,plan.input.startAt).size()};
    if(cursor < p.endAt)gaps+=1;gaps
  };
  func reportSameEvidence(a : T.Record,b : T.Record) : Bool = a.sourceKey==b.sourceKey and a.personId==b.personId and a.startAt==b.startAt and a.endAt==b.endAt;
  func reportMissingSources(p : T.Period, rs : [T.Record]) : Bool {
    if(p.adjustmentOf!=0)return false;let found=reportCandidates(p);
    found.any(func x=not rs.any(func r=reportSameEvidence(r,x))) or rs.any(func r=r.kind==#readiness and r.state!=#excluded and not found.any(func x=reportSameEvidence(r,x)))
  };
  func reportBlockers(p : T.Period, rs : [T.Record]) : [Text] {
    if(p.approvedAt > 0)return if(p.sourceChanged or reportMissingSources(p,rs))["Source work was added or corrected after approval. Review a linked adjustment; the exported snapshot is unchanged."]else[];
    let out=List.empty<Text>();
    if(Time.now() < p.endAt)out.add("The reporting period has not ended");
    if(rs.size()==0)out.add("No service records or adjustments yet");
    if(rs.any(func r=r.state!=#approved and r.state!=#excluded))out.add("Confirm and review every record, or exclude it with a reason");
    if(reportMissingSources(p,rs))out.add("New service evidence is available. Refresh records before release");
    if(reportCoverage(p) > 0 and p.coverageNote=="" and p.adjustmentOf==0)out.add("Explain the uncovered or unplanned hours before release");
    for(r in rs.values())if(r.state==#approved){
      if(reportMapped(p.id,r.personId)==null)out.add("Missing payroll identifier for "#r.name);
      if(r.kind==#readiness and r.layer >= p.policy.readinessRates.size())out.add("Missing readiness rate for response layer "#(r.layer+1).toText());
      if(r.kind!=#adjustment and (r.startAt < p.startAt or r.endAt > p.endAt))out.add("A work interval crosses the period boundary. Exclude it and submit separate intervals with explicit breaks");
      if(r.kind!=#adjustment)for(other in state.records.values())if(other.id!=r.id and other.personId==r.personId and other.kind==r.kind and other.state!=#excluded and other.startAt < r.endAt and r.startAt < other.endAt){
        let op=state.periods.get(other.periodId)??(continue);if(not reportExpired(op)) {out.add("Overlapping service records for "#r.name#" need reconciliation. Other project details stay scoped.");break}
      }
    };switch(compensation.snapshots.get(p.id)){case(?snapshot)for(message in K.blockers(snapshot,rs).values())out.add(message);case null {}};out.toArray()
  };
  func reportCompLines(p : T.Period,rs : [T.Record]) : [K.Line] {
    let snapshot=compensation.snapshots.get(p.id)??(return []);
    if(p.approvedAt > 0)return snapshot.lines;
    K.lines(snapshot,rs,func person=(reportMapped(p.id,person)??({personId=person;payrollId=""})).payrollId,compensation.units)
  };
  func reportAllParentLines(p : T.Period) : [T.Line] {
    switch(compensation.snapshots.get(p.id)){case(?snapshot)snapshot.lines.map(func l : T.Line = l);case null p.lines}
  };
  func reportLines(p : T.Period, rs : [T.Record]) : [T.Line] {
    if(compensation.snapshots.containsKey(p.id))return reportCompLines(p,rs).filter(func l=l.unit==#money).map(func l : T.Line = l);
    rs.filter(func r=r.state==#approved).map(func r {
      let rate=if(r.kind==#readiness){if(r.layer < p.policy.readinessRates.size())p.policy.readinessRates[r.layer]else 0}else if(r.kind==#work)p.policy.workRate else 0;
      let seconds=C.seconds(r);
      {recordId=r.id;personId=r.personId;name=r.name;payrollId=(reportMapped(p.id,r.personId)??({personId=r.personId;payrollId=""})).payrollId;code=if(r.kind==#readiness)p.policy.readinessCode else if(r.kind==#work)p.policy.workCode else "ADJUSTMENT";kind=r.kind;startAt=r.startAt;endAt=r.endAt;seconds;rate;amount=if(r.kind==#adjustment)r.delta else C.amount(seconds,rate);currency=p.policy.currency;decimals=p.policy.decimals;costCenter=p.policy.costCenter}
    })
  };
  public query func reportingProjects(tok : Text) : async [T.Project] {
    let a=authenticate(tok)??(return []);
    planning.projects.values().toArray().filter(func p=reportAny(reportCaps(a,p.id)) or eligible(p,a.id) or state.periods.values().any(func r=r.projectId==p.id and not reportExpired(r) and reportRecords(r.id).any(func x=x.personId==a.id))).map(func p={id=p.id;name=p.name;capabilities=reportCaps(a,p.id);policy=if(reportFinancial(reportCaps(a,p.id)))state.policies.get(p.id)else null})
  };
  public query func reportingPeriods(tok : Text) : async [T.Header] {let a=authenticate(tok)??(return []);state.periods.values().toArray().filter(func p=not reportExpired(p) and reportCanRead(a,p)).map(reportHeader)};
  public query func reportingPeriod(tok : Text,id : Nat) : async ?(T.View and {calculation : ?K.View}) {
    let(a,p)=reportRead(tok,id)??(return null);let c=reportCaps(a,p.projectId);let all=c.prepare or (c.review and p.adjustmentOf==0) or c.release or (c.export and p.approvedAt > 0);let money=reportFinancial(c) or (c.export and p.approvedAt > 0);let rs=reportRecords(id);
    let visible=if(all)rs else rs.filter(func r=r.personId==a.id);
    let ls=if(p.approvedAt > 0)p.lines else if(money)reportLines(p,rs)else[];
    ?{calculation=switch(compensation.snapshots.get(id)){case(?snapshot)?{rule=if(money)?snapshot.rule else null;lines=if(money)reportCompLines(p,rs)else if(p.approvedAt > 0)reportCompLines(p,rs).filter(func l=l.personId==a.id)else[];adjustmentUnits=visible.filter(func r=r.kind==#adjustment).map(func r=(r.id,compensation.units.get(r.id)??#money))};case null null};period=reportHeader(p);capabilities=c;policy=if(money)?p.policy else null;records=visible;lines=if(money)ls else if(p.approvedAt > 0)ls.filter(func l=l.personId==a.id)else[];adjustmentPeople=if(c.prepare and p.adjustmentOf > 0) { switch(state.periods.get(p.adjustmentOf)){case(?parent)reportAllParentLines(parent).map(func l = {id=l.personId;name=l.name});case null []} } else [];departed=visible.filter(func r = not personActive(r.personId)).map(func r = r.personId);mappings=if(reportFinancial(c))rs.map(func r=reportMapped(p.id,r.personId)??({personId=r.personId;payrollId=""}))else[];audit=if(all)state.audit.get(id)??[]else[];blockers=if(all and (c.prepare or c.review or c.release))reportBlockers(p,rs)else[]}
  };
  public func setReportingPolicy(tok : Text,projectId : Nat,revision : Nat,input : T.PolicyInput) : async O.Result {
    let a=authenticate(tok)??(return #err(#denied));if(not capability(a,projectId,"compensation"))return #err(#denied);
    if(not planning.projects.containsKey(projectId))return #err(#missing);
    if(K.history(compensation,projectId).rules.any(func r=r.withdrawnAt==0))return #err(#invalid("Use dated compensation rules for this project"));
    if((switch(state.policies.get(projectId)){case(?p)p.revision;case null 0})!=revision)return #err(#stale);
    if(input.currency.size()!=3 or input.currency.chars().any(func c=c < 'A' or c > 'Z') or input.decimals > 3 or input.readinessRates.size() > 6 or input.readinessRates.any(func n=n > 1_000_000_000) or input.workRate > 1_000_000_000 or input.retentionDays < 30 or input.retentionDays > 3650 or input.readinessCode.size()==0 or input.readinessCode.size() > 40 or input.workCode.size()==0 or input.workCode.size() > 40 or input.costCenter.size() > 80)return #err(#invalid("Check currency, rates, pay codes and 30–3650 retention days"));
    state.policies.add(projectId,{input with revision=revision+1;by=a.id;at=Time.now()});#ok({id=projectId;revision=revision+1})
  };
  public query func reportingCompensationRules(tok : Text,projectId : Nat) : async ?K.History {
    let a=authenticate(tok)??(return null);if(not reportFinancial(reportCaps(a,projectId)))return null;
    ?K.history(compensation,projectId)
  };
  public query func previewReportingCompensation(tok : Text,projectId : Nat,input : K.Input) : async {#ok : [K.Example];#err : Text} {
    let a=authenticate(tok)??(return #err("Access denied"));if(not capability(a,projectId,"compensation"))return #err("Access denied");
    switch(K.valid(input)){case(?error)return #err(error);case null {}};#ok(K.examples(input))
  };
  public func activateReportingCompensation(tok : Text,projectId : Nat,revision : Nat,input : K.Input) : async O.Result {
    let a=authenticate(tok)??(return #err(#denied));if(not capability(a,projectId,"compensation"))return #err(#denied);
    if(not planning.projects.containsKey(projectId))return #err(#missing);
    let history=K.history(compensation,projectId);if(history.revision!=revision)return #err(#stale);
    switch(K.valid(input)){case(?error)return #err(#invalid(error));case null {}};
    if(history.rules.size() >= 64)return #err(#limit("64 retained rule versions per project; archive completed projects"));
    let active=history.rules.filter(func r=r.withdrawnAt==0);
    if(input.effectiveAt < Time.now()-365*P.day or input.effectiveAt > Time.now()+366*P.day)return #err(#invalid("Choose an effective date within one year"));
    if(active.size() > 0 and (input.effectiveAt <= Time.now() or active.any(func r=r.effectiveAt >= input.effectiveAt)))return #err(#invalid("A new rule starts in the future, after the latest rule. Withdraw an unused future rule to replace it."));
    if(state.periods.values().any(func p=p.projectId==projectId and p.endAt > input.effectiveAt and not reportExpired(p)))return #err(#invalid("Existing statements extend beyond this date. Their rules stay fixed; choose a date after those periods."));
    if(history.rules.size()==0){switch(state.policies.get(projectId)){case(?policy)compensation.legacy.add(projectId,policy);case null {}}};
    let rule:K.Rule={input with revision=revision+1;by=a.id;at=Time.now();withdrawnAt=0};
    compensation.histories.add(projectId,{revision=revision+1;rules=history.rules.concat([rule])});
    state.policies.add(projectId,{input.policy with revision=revision+1;by=a.id;at=Time.now()});#ok({id=projectId;revision=revision+1})
  };
  public func withdrawReportingCompensation(tok : Text,projectId : Nat,revision : Nat,ruleRevision : Nat) : async O.Result {
    let a=authenticate(tok)??(return #err(#denied));if(not capability(a,projectId,"compensation"))return #err(#denied);
    let history=K.history(compensation,projectId);if(history.revision!=revision)return #err(#stale);
    let rule=history.rules.find(func r=r.revision==ruleRevision and r.withdrawnAt==0)??(return #err(#missing));
    if(rule.effectiveAt <= Time.now() or compensation.snapshots.values().any(func s=s.rule==rule))return #err(#invalid("Only future rules not used by a statement can be withdrawn"));
    let rules=history.rules.map(func r=if(r.revision==ruleRevision)({r with withdrawnAt=Time.now()})else r);
    compensation.histories.add(projectId,{revision=revision+1;rules});
    state.policies.remove(projectId);switch(compensation.legacy.get(projectId)){case(?p)state.policies.add(projectId,p);case null {}};
    for(r in rules.values())if(r.withdrawnAt==0)state.policies.add(projectId,{r.policy with revision=r.revision;by=r.by;at=r.at});
    #ok({id=projectId;revision=revision+1})
  };
  public func prepareReportingPeriod(tok : Text,key : Text,input : T.PeriodInput) : async O.Result {
    let a=authenticate(tok)??(return #err(#denied));if(not capability(a,input.projectId,"compensation"))return #err(#denied);
    if(not P.validKey(key))return #err(#invalid("Invalid request identifier"));
    for(p in state.periods.values())if(p.createdBy==a.id and p.requestKey==key){let prior:T.PeriodInput=p;if(prior!=input or reportExpired(p))return #err(#stale);return #ok({id=p.id;revision=p.revision})};
    let rules=K.history(compensation,input.projectId).rules.filter(func r=r.withdrawnAt==0);
    var chosen : ?K.Rule=null;
    for(r in rules.values())if(r.effectiveAt <= input.startAt)chosen:=?r;
    if(rules.size() > 0 and chosen==null)return #err(#invalid("The first dated rule starts after this period. Choose a covered period."));
    if(rules.any(func r=r.effectiveAt > input.startAt and r.effectiveAt < input.endAt))return #err(#invalid("A rule changes within this period. Prepare separate statements at the rule's effective date."));
    var snapshot : ?K.Snapshot=null;
    let policy=switch chosen {
      case(?rule){
        let days=K.days(rule,input.startAt,input.endAt)??(return #err(#invalid("Period is outside the supported calendar")));
        if(input.timezone!=rule.timezone or days.size()==0 or days[0].startAt!=input.startAt or days[days.size()-1].endAt!=input.endAt)return #err(#invalid("Use whole local days in the compensation rule's timezone"));
        snapshot:=?{rule;days;lines=[]};({rule.policy with revision=rule.revision;by=rule.by;at=rule.at})
      };
      case null state.policies.get(input.projectId)??(return #err(#invalid("Set compensation rules first")))
    };
    if(input.title.size()==0 or input.title.size() > 60 or not Z.names.contains(input.timezone) or input.startAt < Time.now() - 365 * P.day or input.endAt <= input.startAt or input.endAt-input.startAt > 32*P.day or input.endAt+policy.retentionDays*P.day <= Time.now())return #err(#invalid("Choose a named period up to 32 days within reporting retention"));
    if(state.periods.size() >= 200)return #err(#limit("Reporting period storage is full"));
    if(state.periods.values().any(func p=p.projectId==input.projectId and p.adjustmentOf==0 and not reportExpired(p) and p.startAt < input.endAt and input.startAt < p.endAt))return #err(#invalid("This project already has an overlapping reporting period"));
    if (state.closed.values().any(func r = r.projectId == input.projectId and r.startAt < input.endAt and input.startAt < r.endAt)) return #err(#invalid("This range was already released, including statements deleted under retention. Use a linked adjustment while the original is retained."));
    let id=state.nextPeriod;
    let p:T.Period={input with id;revision=1;createdAt=Time.now();createdBy=a.id;policy;approvedAt=0;approvedBy="";batchId="";lines=[];adjustmentOf=0;coverageIssues=0;coverageNote="";sourceChanged=false;requestKey=key};
    let found=reportCandidates(p);if(found.size() > 200 or state.records.size()+found.size() > 5000)return #err(#limit("Maximum 200 records per period and 5000 retained records"));
    state.nextPeriod+=1;state.periods.add(id,{p with coverageIssues=reportCoverage(p)});
    switch snapshot {case(?s)compensation.snapshots.add(id,s);case null {}};
    for(r in found.values())reportAdd(p,r.personId,r.name,r.kind,r.layer,r.startAt,r.endAt,r.breakMinutes,r.sourceKey,"",0,r.confirmedBy,r.confirmedAt);
    reportLog(id,a,"prepared",0,"Policy revision "#policy.revision.toText());#ok({id;revision=1})
  };
  public func refreshReportingPeriod(tok : Text,id : Nat,revision : Nat) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));let c=reportCaps(a,p.projectId);if(not(c.prepare or c.review))return #err(#denied);
    if(not reportMutable(p,revision) or p.adjustmentOf > 0)return #err(#stale);
    let found=reportCandidates(p);let old=reportRecords(id);let additions=found.filter(func r=not old.any(func x=reportSameEvidence(x,r)));
    if(old.size()+additions.size() > 200 or state.records.size()+additions.size() > 5000)return #err(#limit("Record storage is full"));
    for(r in old.values())if(r.kind==#readiness and not r.sourceKey.startsWith(#text "superseded:") and not found.any(func x=reportSameEvidence(r,x)))state.records.add(r.id,{r with sourceKey="superseded:"#r.id.toText()#":"#r.sourceKey;state=#excluded;reviewedBy=a.id;reviewedAt=Time.now();reason="Published coverage changed; replaced by the effective intervals"});
    for(r in additions.values())reportAdd(p,r.personId,r.name,r.kind,r.layer,r.startAt,r.endAt,r.breakMinutes,r.sourceKey,"",0,r.confirmedBy,r.confirmedAt);
    state.periods.add(id,{p with revision=revision+1;coverageIssues=reportCoverage(p)});reportLog(id,a,"refreshed",0,"");#ok({id;revision=revision+1})
  };
  public func confirmReportingRecord(tok : Text,id : Nat,recordId : Nat,revision : Nat,confirm : Bool,reason : Text) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));let r=state.records.get(recordId)??(return #err(#missing));
    if(r.kind==#adjustment or r.periodId!=id or r.personId!=a.id)return #err(#denied);
    if(not reportMutable(p,revision) or r.state==#approved or r.state==#excluded)return #err(#stale);
    if(r.sourceKey.startsWith(#text "voided:") or r.endAt > Time.now() or reason.size() > 240 or (not confirm and reason.trim(#char ' ').size()==0))return #err(#invalid("Confirm only completed service; explain disputed records"));
    state.records.add(recordId,{r with state=if(confirm)#confirmed else #disputed;confirmedBy=a.id;confirmedAt=Time.now();reason});reportTouch(p);reportLog(id,a,if(confirm)"confirmed"else"disputed",recordId,reason);#ok({id;revision=revision+1})
  };
  public func attestDepartedService(tok : Text,id : Nat,recordId : Nat,revision : Nat,reason : Text) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));let r=state.records.get(recordId)??(return #err(#missing));
    if(r.kind==#adjustment or r.periodId!=id or not capability(a,p.projectId,"time_review") or r.personId==a.id or personActive(r.personId))return #err(#denied);
    if(not reportMutable(p,revision) or r.state==#approved or r.state==#excluded)return #err(#stale);
    if(r.sourceKey.startsWith(#text "voided:") or r.endAt > Time.now() or reason.trim(#char ' ').size() < 3 or reason.size() > 240)return #err(#invalid("Explain the evidence for service provided by the departed participant"));
    state.records.add(recordId,{r with state=#confirmed;confirmedBy=a.id;confirmedAt=Time.now();reason});reportTouch(p);reportLog(id,a,"attested_for_departed_person",recordId,reason);#ok({id;revision=revision+1})
  };
  public func reviewReportingRecord(tok : Text,id : Nat,recordId : Nat,revision : Nat,approve : Bool,reason : Text) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));let r=state.records.get(recordId)??(return #err(#missing));
    if(r.periodId!=id or not capability(a,p.projectId,if(r.kind==#adjustment)"compensation"else"time_review") or r.personId==a.id or (approve and r.confirmedBy==a.id))return #err(#denied);
    if(not reportMutable(p,revision))return #err(#stale);
    if((approve and (r.state!=#confirmed or r.sourceKey.startsWith(#text "voided:"))) or reason.size() > 240 or (not approve and reason.trim(#char ' ').size() < 3))return #err(#invalid("Approve confirmed evidence or exclude with a reason"));
    state.records.add(recordId,{r with state=if(approve)#approved else #excluded;reviewedBy=a.id;reviewedAt=Time.now();reason});reportTouch(p);reportLog(id,a,if(approve)"record_approved"else"record_excluded",recordId,reason);#ok({id;revision=revision+1})
  };
  public func addReportingWork(tok : Text,id : Nat,revision : Nat,key : Text,input : T.WorkInput) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));let project=planning.projects.get(p.projectId)??(return #err(#missing));
    if(not eligible(project,a.id))return #err(#denied);
    let source="manual:"#a.id#":"#key;
    switch(reportRecords(id).find(func r=r.sourceKey==source)){case(?r){if(r.startAt!=input.startAt or r.endAt!=input.endAt or r.breakMinutes!=input.breakMinutes or r.note!=input.note)return #err(#stale);return #ok({id;revision=p.revision})};case null {}};
    if(not reportMutable(p,revision) or p.adjustmentOf > 0)return #err(#stale);
    if(not P.validKey(key) or input.startAt < p.startAt or input.endAt > p.endAt or input.endAt > Time.now() or input.endAt <= input.startAt or input.endAt-input.startAt > P.day or input.breakMinutes*60_000_000_000 >= input.endAt-input.startAt or input.note.trim(#char ' ').size() < 3 or input.note.size() > 240)return #err(#invalid("Record completed work within this period, up to 24 hours, valid breaks and a payroll-safe explanation"));
    if(reportRecords(id).size() >= 200 or state.records.size() >= 5000)return #err(#limit("Record storage full"));
    reportAdd(p,a.id,personName(a.id),#work,0,input.startAt,input.endAt,input.breakMinutes,source,input.note,0,a.id,Time.now());reportTouch(p);reportLog(id,a,"work_submitted",0,"");#ok({id;revision=revision+1})
  };
  public func setReportingMapping(tok : Text,id : Nat,revision : Nat,person : Text,payrollId : Text) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));if(not capability(a,p.projectId,"compensation"))return #err(#denied);
    if(not reportMutable(p,revision))return #err(#stale);
    if(not reportRecords(id).any(func r=r.personId==person) or payrollId.trim(#char ' ').size()==0 or payrollId.size() > 80)return #err(#invalid("Choose a participant and a payroll identifier up to 80 characters"));
    if(state.mappings.values().any(func m=m.personId!=person and m.payrollId==payrollId))return #err(#invalid("This payroll identifier belongs to another person"));
    state.mappings.add(p.id.toText()#":"#person,{personId=person;payrollId});reportTouch(p);reportLog(id,a,"payroll_mapping",0,person);#ok({id;revision=revision+1})
  };
  public func explainReportingCoverage(tok : Text,id : Nat,revision : Nat,note : Text) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));if(not capability(a,p.projectId,"time_review"))return #err(#denied);if(not reportMutable(p,revision))return #err(#stale);
    if(note.trim(#char ' ').size() < 3 or note.size() > 240)return #err(#invalid("Explain the reviewed coverage gaps"));
    state.periods.add(id,{p with revision=revision+1;coverageNote=note});reportLog(id,a,"coverage_reviewed",0,note);#ok({id;revision=revision+1})
  };
  public func releaseReportingPeriod(tok : Text,id : Nat,revision : Nat) : async O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));if(not capability(a,p.projectId,"release") or a.id==p.createdBy or a.id==p.policy.by)return #err(#denied);
    if(not reportMutable(p,revision))return #err(#stale);let rs=reportRecords(id);
    if(rs.any(func r=r.state==#approved and (r.personId==a.id or r.confirmedBy==a.id)))return #err(#invalid("Another authorized person must release your own claims or attestations"));
    if (p.adjustmentOf == 0 and state.closed.size() >= 2400) return #err(#limit("Reporting range ledger is full; wait for older range markers to expire"));
    let issues=reportBlockers(p,rs);if(issues.size() > 0)return #err(#invalid(issues[0]));
    if (p.adjustmentOf == 0) state.closed.add(p.id, {projectId=p.projectId;startAt=p.startAt;endAt=p.endAt});
    switch(compensation.snapshots.get(id)){case(?snapshot)compensation.snapshots.add(id,{snapshot with lines=reportCompLines(p,rs)});case null {}};
    let batchId="DESK-"#id.toText()#"-"#(revision+1).toText();
    state.periods.add(id,{p with revision=revision+1;approvedAt=Time.now();approvedBy=a.id;batchId;lines=reportLines(p,rs)});reportLog(id,a,"period_released",0,batchId);#ok({id;revision=revision+1})
  };
  public func exportReportingPeriod(tok : Text,id : Nat) : async T.Export {
    let(a,p)=reportRead(tok,id)??(return #err("Access denied"));if(not capability(a,p.projectId,"export") or p.approvedAt==0)return #err("Only authorized exports of approved statements are available");
    if((state.audit.get(id)??[]).size() >= 1000)return #err("Export journal limit reached");
    reportLog(id,a,"export_downloaded",0,p.batchId);#ok({batchId=p.batchId;filename=p.batchId#".csv";csv=switch(compensation.snapshots.get(id)){case(?snapshot)K.csv(p,snapshot.lines);case null C.csv(p)}})
  };
  public func prepareReportingAdjustment(tok : Text,parentId : Nat,key : Text,reason : Text) : async O.Result {
    let(a,parent)=reportRead(tok,parentId)??(return #err(#denied));if(not capability(a,parent.projectId,"compensation"))return #err(#denied);
    if(parent.approvedAt==0 or parent.adjustmentOf > 0 or not P.validKey(key) or reason.trim(#char ' ').size() < 3 or reason.size() > 240)return #err(#invalid("Choose a released original period and explain the adjustment"));
    for(p in state.periods.values())if(p.createdBy==a.id and p.requestKey==key){if(p.adjustmentOf!=parentId or p.coverageNote!=reason or reportExpired(p))return #err(#stale);return #ok({id=p.id;revision=p.revision})};
    if(state.periods.size() >= 200)return #err(#limit("Reporting period storage full"));
    let id=state.nextPeriod;state.nextPeriod+=1;
    switch(compensation.snapshots.get(parentId)){case(?snapshot)compensation.snapshots.add(id,{snapshot with lines=[]});case null {}};
    state.periods.add(id,{parent with id;title="Adjustment · "#parent.title;revision=1;createdAt=Time.now();createdBy=a.id;approvedAt=0;approvedBy="";batchId="";lines=[];adjustmentOf=parentId;coverageIssues=0;coverageNote=reason;sourceChanged=false;requestKey=key});reportLog(id,a,"adjustment_prepared",0,reason);#ok({id;revision=1})
  };
  public func addReportingAdjustment(tok : Text,id : Nat,revision : Nat,key : Text,person : Text,delta : Int,reason : Text) : async O.Result { reportAdjustment(tok,id,revision,key,person,delta,#money,reason) };
  public func addReportingAdjustmentWithUnit(tok : Text,id : Nat,revision : Nat,key : Text,person : Text,delta : Int,unit : K.Unit,reason : Text) : async O.Result { reportAdjustment(tok,id,revision,key,person,delta,unit,reason) };
  func reportAdjustment(tok : Text,id : Nat,revision : Nat,key : Text,person : Text,delta : Int,unit : K.Unit,reason : Text) : O.Result {
    let(a,p)=reportRead(tok,id)??(return #err(#denied));if(not capability(a,p.projectId,"compensation"))return #err(#denied);
    if(not P.validKey(key))return #err(#invalid("Invalid request identifier"));
    let source="adjustment:"#a.id#":"#key;
    switch(reportRecords(id).find(func r=r.sourceKey==source)){case(?r){if(r.personId!=person or r.delta!=delta or r.note!=reason or (compensation.units.get(r.id)??#money)!=unit)return #err(#stale);return #ok({id;revision=p.revision})};case null {}};
    if(not reportMutable(p,revision) or p.adjustmentOf==0)return #err(#stale);
    let parent=state.periods.get(p.adjustmentOf)??(return #err(#missing));let line=reportAllParentLines(parent).find(func l=l.personId==person and (if(unit==#money)l.currency!=""else l.currency==""))??(return #err(#invalid("Choose a participant and unit from the original statement")));
    if(delta==0 or Int.abs(delta) > 1_000_000_000 or reason.trim(#char ' ').size() < 3 or reason.size() > 240)return #err(#invalid("Enter a nonzero signed amount and the correction reason"));
    if(reportRecords(id).size() >= 200 or state.records.size() >= 5000)return #err(#limit("Record storage full"));
    if (reportMapped(p.id, person) == null) state.mappings.add(p.id.toText()#":"#person,{personId=person;payrollId=line.payrollId});
    let recordId=state.nextRecord;compensation.units.add(recordId,unit);
    reportAdd(p,person,line.name,#adjustment,0,p.startAt,p.endAt,0,source,reason,delta,a.id,Time.now());reportTouch(p);reportLog(id,a,"adjustment_submitted",0,reason);#ok({id;revision=revision+1})
  };
  func reportingWorkVoided(workId : Nat) {
    for((id,r) in state.records.entries().toArray().values())if(r.sourceKey=="work:"#workId.toText()){
      let p=state.periods.get(r.periodId)??(continue);
      if(p.approvedAt==0)state.records.add(id,{r with sourceKey="voided:"#r.sourceKey;state=#disputed;confirmedBy="";confirmedAt=0;reviewedBy="";reviewedAt=0;reason="Source work entry was voided. Exclude and replace this record."});
      state.periods.add(p.id,{p with sourceChanged=true;revision=if(p.approvedAt > 0)p.revision else p.revision+1});
      if((state.audit.get(p.id)??[]).size() < 1000)reportLog(p.id,{id="system";role=""},"source_work_voided",id,"")
    }
  };
  func sweepReporting() {
    for ((id,r) in state.closed.entries().toArray().values()) if (Time.now() > r.endAt + 366 * P.day) state.closed.remove(id);
    var removed=0;for((id,p)in state.periods.entries().toArray().values())if(removed < 10 and reportExpired(p)){
      for((rid,r)in state.records.entries().toArray().values())if(r.periodId==id){state.records.remove(rid);compensation.units.remove(rid)};
      state.periods.remove(id);state.audit.remove(id);compensation.snapshots.remove(id);removed+=1
    };
    // Mapping lifetime follows the last retained statement for that project/person.
    for((key,m)in state.mappings.entries().toArray().values())if(not state.records.values().any(func r=r.personId==m.personId and key==(switch(state.periods.get(r.periodId)){case(?p)p.id.toText()#":"#m.personId;case null ""})))state.mappings.remove(key)
  };
}
