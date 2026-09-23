import T "Types";
import C "Calc";
import Z "ZoneData";
import Map "mo:core/Map";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
module {
  public type Unit = { #money; #minutes };
  public type DayKind = { #weekday; #weekend; #holiday };
  public type Rates = { weekday : Nat; weekend : Nat; holiday : Nat };
  public type Input = {
    policy : T.PolicyInput; effectiveAt : Int; timezone : Text; holidays : [Text];
    readinessBasis : { #hour; #day }; readinessUnit : Unit; readiness : [Rates];
    workUnit : Unit; work : Rates; minimumMinutes : Nat; roundingMinutes : Nat
  };
  public type Rule = Input and { revision : Nat; by : Text; at : Int; withdrawnAt : Int };
  public type History = { revision : Nat; rules : [Rule] };
  public type Day = { date : Text; startAt : Int; endAt : Int; kind : DayKind };
  public type Line = T.Line and {
    unit : Unit; basis : { #hour; #day; #adjustment }; date : Text; dayKind : DayKind;
    payableSeconds : Nat; divisorSeconds : Nat; recordIds : [Nat]; ruleRevision : Nat
  };
  public type Snapshot = { rule : Rule; days : [Day]; lines : [Line] };
  public type View = { rule : ?Rule; lines : [Line]; adjustmentUnits : [(Nat,Unit)] };
  public type Example = { title : Text; seconds : Nat; payableSeconds : Nat; divisorSeconds : Nat; rate : Nat; amount : Nat; unit : Unit };
  public type State = {
    histories : Map.Map<Nat,History>; legacy : Map.Map<Nat,T.Policy>;
    snapshots : Map.Map<Nat,Snapshot>; units : Map.Map<Nat,Unit>
  };
  public func empty() : State = { histories=Map.empty();legacy=Map.empty();snapshots=Map.empty();units=Map.empty() };
  public func history(s : State,id : Nat) : History = s.histories.get(id) ?? ({revision=0;rules=[]});
  public func rate(r : Rates,k : DayKind) : Nat = switch k {case(#weekday)r.weekday;case(#weekend)r.weekend;case(#holiday)r.holiday};
  public func rounded(seconds : Nat, minimum : Nat, step : Nat) : Nat {
    if(seconds==0)return 0;let s=Nat.max(seconds,minimum*60);let block=Nat.max(step,1)*60;((s+block-1)/block)*block
  };
  public func amount(seconds : Nat,r : Nat,divisor : Nat) : Nat = (seconds*r+divisor/2)/divisor;
  func offset(points : [(Int,Int)],t : Int) : Int {
    var lo=0;var hi=points.size();while(lo+1 < hi){let mid=(lo+hi)/2;if(points[mid].0 <= t)lo:=mid else hi:=mid};points[lo].1
  };
  func dateNumber(points : [(Int,Int)],t : Int) : Int = (t+offset(points,t))/86400;
  func midnight(points : [(Int,Int)],day : Int) : Int {
    var lo=day*86400-86400;var hi=day*86400+86400;
    while(lo < hi){let mid=(lo+hi)/2;if(dateNumber(points,mid) < day)lo:=mid+1 else hi:=mid};lo
  };
  func pad(n : Nat) : Text = if(n < 10)"0"#n.toText()else n.toText();
  func dateText(day : Int) : Text {
    var rest=Int.abs(day);var year=1970;
    func leap(y : Nat) : Bool = y%4==0 and (y%100!=0 or y%400==0);
    loop{let n=if(leap(year))366 else 365;if(rest < n)break;rest-=n;year+=1};
    let months=[31,if(leap(year))29 else 28,31,30,31,30,31,31,30,31,30,31];var month=0;
    while(rest >= months[month]){rest-=months[month];month+=1};year.toText()#"-"#pad(month+1)#"-"#pad(rest+1)
  };
  public func dayAt(t : Int,zone : Text,holidays : [Text]) : ?Day {
    let sec=t/1_000_000_000;if(sec < Z.start+2*86400 or sec >= Z.end-2*86400)return null;
    let found=Z.names.find(func x=x.0==zone)??(return null);let points=Z.offsets[found.1];
    let day=dateNumber(points,sec);let date=dateText(day);let weekday=(day+4)%7;
    ?{date;startAt=midnight(points,day)*1_000_000_000;endAt=midnight(points,day+1)*1_000_000_000;kind=if(holidays.contains(date))#holiday else if(weekday==0 or weekday==6)#weekend else #weekday}
  };
  public func days(input : Input,start : Int,end : Int) : ?[Day] {
    let out=List.empty<Day>();var cursor=start;
    while(cursor < end){let day=dayAt(cursor,input.timezone,input.holidays)??(return null);if(day.endAt <= cursor or out.size() >= 34)return null;out.add(day);cursor:=day.endAt};?out.toArray()
  };
  public func valid(i : Input) : ?Text {
    let p=i.policy;
    if(p.currency.size()!=3 or p.currency.chars().any(func c=c < 'A' or c > 'Z') or p.decimals > 3 or p.retentionDays < 30 or p.retentionDays > 3650 or p.readinessCode.size()==0 or p.readinessCode.size() > 40 or p.workCode.size()==0 or p.workCode.size() > 40 or p.costCenter.size() > 80)return ?"Check currency, precision, payroll codes and 30–3650 retention days";
    if(i.readiness.size() > 6 or p.readinessRates!=i.readiness.map(func r=r.weekday) or p.workRate!=i.work.weekday)return ?"Rate summaries must match the selected rules";
    func invalid(r : Rates,u : Unit) : Bool {let max=if(u==#money)1_000_000_000 else 1440;r.weekday > max or r.weekend > max or r.holiday > max};
    if(i.readiness.any(func r=invalid(r,i.readinessUnit)) or invalid(i.work,i.workUnit) or i.minimumMinutes > 1440 or not [1,5,6,10,15,30,60].contains(i.roundingMinutes))return ?"Check rates, minimum (0–1440 minutes) and rounding step";
    let day=dayAt(i.effectiveAt,i.timezone,[])??(return ?"Unsupported timezone or date outside the shipped 2020–2040 calendar");
    if(day.startAt!=i.effectiveAt)return ?"Rules must begin at midnight in their reporting timezone";
    if(i.holidays.size() > 100)return ?"Maximum 100 explicit holiday dates";
    // Validate ISO dates by matching actual civil dates, including leap days.
    for(h in i.holidays.values()){
      if(h.size()!=10)return ?"Use ISO holiday dates, YYYY-MM-DD";
      let parts=h.split(#char '-').toArray();if(parts.size()!=3)return ?"Invalid holiday date";
      let y=Nat.fromText(parts[0])??(return ?"Invalid holiday year");let m=Nat.fromText(parts[1])??(return ?"Invalid holiday month");let d=Nat.fromText(parts[2])??(return ?"Invalid holiday day");
      if(y < 2020 or y > 2040 or m < 1 or m > 12 or d < 1 or d > 31)return ?"Holiday date outside supported calendar";
      var n=0;var year=1970;while(year < y){n+=if(year%4==0 and (year%100!=0 or year%400==0))366 else 365;year+=1};
      let months=[31,if(y%4==0 and(y%100!=0 or y%400==0))29 else 28,31,30,31,30,31,31,30,31,30,31];
      if(d > months[m-1])return ?"Invalid holiday day";var month=0;while(month+1 < m){n+=months[month];month+=1};n+=d-1;
      if(dateText(n)!=h)return ?"Use zero-padded ISO holiday dates"
    };null
  };
  public func examples(i : Input) : [Example] {
    let out=List.empty<Example>();
    for((k,title) in [(#weekday,"Weekday"),(#weekend,"Weekend"),(#holiday,"Holiday")].values()) {
      var layer=0;for(r in i.readiness.values()){
        let seconds=8*3600;let divisor=if(i.readinessBasis==#day)86400 else 3600;let value=rate(r,k);
        out.add({title=title#" · readiness layer "#(layer+1).toText()#" · 8 hours of a 24-hour day";seconds;payableSeconds=seconds;divisorSeconds=divisor;rate=value;amount=amount(seconds,value,divisor);unit=i.readinessUnit});layer+=1
      };
      let seconds=17*60;let payableSeconds=rounded(seconds,i.minimumMinutes,i.roundingMinutes);let value=rate(i.work,k);
      out.add({title=title#" · 17 minutes actual work in one day";seconds;payableSeconds;divisorSeconds=3600;rate=value;amount=amount(payableSeconds,value,3600);unit=i.workUnit})
    };out.toArray()
  };
  public func blockers(s : Snapshot,records : [T.Record]) : [Text] {
    let out=List.empty<Text>();
    for(r in records.values())if(r.state==#approved and r.kind==#work and r.breakMinutes > 0){
      let spans=s.days.filter(func d=r.startAt < d.endAt and r.endAt > d.startAt);
      if(spans.size() > 1)out.add("A work record with breaks crosses local midnight. Exclude it and submit one interval per day with explicit breaks.")
    };out.toArray()
  };
  public func lines(s : Snapshot,rs : [T.Record],mapping : Text -> Text,units : Map.Map<Nat,Unit>) : [Line] {
    let rule=s.rule;let p=rule.policy;let groups=Map.empty<Text,Line>();
    for(r in rs.values())if(r.state==#approved){
      if(r.kind==#adjustment){
        let unit=units.get(r.id)??#money;
        groups.add("adjustment:"#r.id.toText(),{recordId=r.id;recordIds=[r.id];personId=r.personId;name=r.name;payrollId=mapping(r.personId);code=if(unit==#minutes)"TIME_ADJUSTMENT"else"ADJUSTMENT";kind=r.kind;startAt=r.startAt;endAt=r.endAt;seconds=0;rate=0;amount=r.delta;currency=if(unit==#money)p.currency else "";decimals=if(unit==#money)p.decimals else 0;costCenter=p.costCenter;unit;basis=#adjustment;date="";dayKind=#weekday;payableSeconds=0;divisorSeconds=1;ruleRevision=rule.revision});
      } else {
        // Break placement across days is unknown; show no guessed amount while the release blocker is open.
        if(r.kind==#work and r.breakMinutes > 0 and s.days.filter(func d=r.startAt < d.endAt and r.endAt > d.startAt).size() > 1)continue;
        for(d in s.days.values())if(r.startAt < d.endAt and r.endAt > d.startAt){
        let startAt=Int.max(r.startAt,d.startAt);let endAt=Int.min(r.endAt,d.endAt);
        let elapsed=Int.abs((endAt-startAt)/1_000_000_000);let seconds=if(r.kind==#work and r.breakMinutes*60 <= elapsed)elapsed-r.breakMinutes*60 else elapsed;
        let readiness=r.kind==#readiness;let unit=if(readiness)rule.readinessUnit else rule.workUnit;
        let rateValue=if(readiness){if(r.layer < rule.readiness.size())rate(rule.readiness[r.layer],d.kind)else 0}else rate(rule.work,d.kind);
        let daily=readiness and rule.readinessBasis==#day;
        let group=r.personId#":"#(if(readiness)"R"#r.layer.toText()else"W")#":"#d.date;
        let initial:Line={recordId=r.id;recordIds=[];personId=r.personId;name=r.name;payrollId=mapping(r.personId);code=if(readiness)p.readinessCode else p.workCode;kind=r.kind;startAt;endAt;seconds=0;rate=rateValue;amount=0;currency=if(unit==#money)p.currency else "";decimals=if(unit==#money)p.decimals else 0;costCenter=p.costCenter;unit;basis=if(daily)#day else #hour;date=d.date;dayKind=d.kind;payableSeconds=0;divisorSeconds=if(daily)Int.abs((d.endAt-d.startAt)/1_000_000_000)else 3600;ruleRevision=rule.revision};
        let old=groups.get(group)??initial;
        groups.add(group,{old with startAt=Int.min(old.startAt,startAt);endAt=Int.max(old.endAt,endAt);seconds=old.seconds+seconds;recordIds=old.recordIds.concat([r.id])})
      }}
    };
    groups.values().toArray().map(func l {
      if(l.basis==#adjustment)return l;
      let payableSeconds=if(l.kind==#work)rounded(l.seconds,rule.minimumMinutes,rule.roundingMinutes)else l.seconds;
      {l with payableSeconds;amount=amount(payableSeconds,l.rate,l.divisorSeconds)}
    })
  };
  public func csv(p : T.Period,ls : [Line]) : Text {
    var out="\u{feff}batch_id,adjustment_of,period,project_id,timezone,person_id,payroll_id,name,pay_item,local_date,day_type,rule_revision,basis,recorded_seconds,payable_seconds,divisor_seconds,rate_minor_or_minutes,amount_minor,credit_minutes,currency,decimals,cost_center,record_ids,approval_revision,approved_at_ms\r\n";
    for(l in ls.values()){
      let day=switch(l.dayKind){case(#weekday)"weekday";case(#weekend)"weekend";case(#holiday)"holiday"};let basis=switch(l.basis){case(#hour)"hour";case(#day)"day";case(#adjustment)"adjustment"};
      let fields=[C.cell(p.batchId),if(p.adjustmentOf==0)""else p.adjustmentOf.toText(),C.cell(p.title),p.projectId.toText(),C.cell(p.timezone),C.cell(l.personId),C.cell(l.payrollId),C.cell(l.name),C.cell(l.code),C.cell(l.date),day,l.ruleRevision.toText(),basis,l.seconds.toText(),l.payableSeconds.toText(),l.divisorSeconds.toText(),l.rate.toText(),if(l.unit==#money)l.amount.toText()else"",if(l.unit==#minutes)l.amount.toText()else"",C.cell(l.currency),if(l.unit==#money)l.decimals.toText()else"",C.cell(l.costCenter),C.cell(Text.join(l.recordIds.values().map(func n=n.toText()),";")),p.revision.toText(),(p.approvedAt/1_000_000).toText()];
      out#=Text.join(fields.values(),",")#"\r\n"
    };out
  }
}
