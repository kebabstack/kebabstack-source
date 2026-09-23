import Map "mo:core/Map";
module {
  public type PolicyInput = { currency : Text; decimals : Nat; readinessRates : [Nat]; workRate : Nat; readinessCode : Text; workCode : Text; costCenter : Text; retentionDays : Nat };
  public type Policy = PolicyInput and { revision : Nat; by : Text; at : Int };
  public type PeriodInput = { projectId : Nat; title : Text; startAt : Int; endAt : Int; timezone : Text };
  public type Kind = { #readiness; #work; #adjustment };
  public type RecordState = { #pending; #confirmed; #disputed; #approved; #excluded };
  public type Record = { id : Nat; periodId : Nat; personId : Text; name : Text; kind : Kind; layer : Nat;
    startAt : Int; endAt : Int; breakMinutes : Nat; sourceKey : Text; note : Text; delta : Int;
    state : RecordState; confirmedBy : Text; confirmedAt : Int; reviewedBy : Text; reviewedAt : Int; reason : Text };
  public type Mapping = { personId : Text; payrollId : Text };
  public type Line = { recordId : Nat; personId : Text; name : Text; payrollId : Text; code : Text; kind : Kind;
    startAt : Int; endAt : Int; seconds : Nat; rate : Nat; amount : Int; currency : Text; decimals : Nat; costCenter : Text };
  public type Audit = { at : Int; by : Text; action : Text; recordId : Nat; reason : Text };
  public type Period = PeriodInput and { id : Nat; revision : Nat; createdAt : Int; createdBy : Text;
    policy : Policy; approvedAt : Int; approvedBy : Text; batchId : Text; lines : [Line];
    adjustmentOf : Nat; coverageIssues : Nat; coverageNote : Text; sourceChanged : Bool; requestKey : Text };
  public type Header = PeriodInput and { id : Nat; revision : Nat; createdAt : Int; createdBy : Text; approvedAt : Int; approvedBy : Text;
    batchId : Text; adjustmentOf : Nat; coverageIssues : Nat; coverageNote : Text; sourceChanged : Bool; deleteAt : Int };
  public type Capabilities = { prepare : Bool; review : Bool; release : Bool; export : Bool };
  public type Project = { id : Nat; name : Text; capabilities : Capabilities; policy : ?Policy };
  public type View = { period : Header; capabilities : Capabilities; policy : ?Policy; records : [Record]; lines : [Line]; mappings : [Mapping]; departed : [Text]; adjustmentPeople : [{id : Text; name : Text}]; audit : [Audit]; blockers : [Text] };
  public type WorkInput = { startAt : Int; endAt : Int; breakMinutes : Nat; note : Text };
  public type Export = { #ok : { batchId : Text; filename : Text; csv : Text }; #err : Text };
  public type ClosedRange = { projectId : Nat; startAt : Int; endAt : Int };
  public type State = { closed : Map.Map<Nat, ClosedRange>; policies : Map.Map<Nat, Policy>; periods : Map.Map<Nat, Period>; records : Map.Map<Nat, Record>;
    mappings : Map.Map<Text, Mapping>; audit : Map.Map<Nat, [Audit]>; var nextPeriod : Nat; var nextRecord : Nat };
  public func empty() : State = { closed = Map.empty(); policies = Map.empty(); periods = Map.empty(); records = Map.empty(); mappings = Map.empty(); audit = Map.empty(); var nextPeriod = 1; var nextRecord = 1 };
}
