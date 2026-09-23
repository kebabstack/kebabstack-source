import A "../alerts/Types";
import Map "mo:core/Map";
module {
  public type PolicyInput = { enabled : Bool; ackMinutes : Nat; fallback : Text; retentionDays : Nat };
  public type Policy = PolicyInput and { projectId : Nat; revision : Nat; by : Text; at : Int };
  public type Input = { projectId : Nat; service : Text; title : Text; detail : Text; severity : { #critical; #major; #minor } };
  public type Incident = Input and {
    id : Nat; revision : Nat; requestKey : Text; openedBy : Text; openedAt : Int; updatedAt : Int;
    status : { #open; #acknowledged; #resolved }; owner : Text; ownerName : Text; acknowledgedAt : Int;
    resolvedAt : Int; resolution : Text; stage : Nat; stageCount : Nat; nextEscalation : Int;
    ackMinutes : Nat; fallback : Text; retentionDays : Nat; routeIssue : Text;
  };
  public type Event = { at : Int; by : Text; name : Text; kind : Text; text : Text };
  public type Delivery = { id : Nat; incidentId : Nat; stage : Nat; purpose : { #response; #handoff }; recipient : Text; name : Text;
    status : { #pending; #accepted; #failed; #cancelled }; attempts : Nat; nextAttempt : Int;
    leaseUntil : Int; acceptedAt : Int; detail : Text };
  public type Handoff = { from : Text; to : Text; toName : Text; summary : Text; at : Int;
    status : { #pending; #accepted; #declined; #cancelled }; decidedAt : Int };
  public type WorkInput = { startAt : Int; endAt : Int; breakMinutes : Nat; note : Text };
  public type Work = WorkInput and { id : Nat; incidentId : Nat; projectId : Nat; personId : Text;
    name : Text; at : Int; requestKey : Text; voidedAt : Int; voidReason : Text };
  public type View = { incident : Incident; monitoring : ?A.Monitoring; events : [Event]; deliveries : [Delivery]; handoff : ?Handoff; work : [Work] };
  public type Overview = { policy : ?Policy; incidents : [Incident]; canManage : Bool; deliveryReady : Bool };
  public type State = { policies : Map.Map<Nat, Policy>; incidents : Map.Map<Nat, Incident>;
    events : Map.Map<Nat, [Event]>; deliveries : Map.Map<Nat, Delivery>; handoffs : Map.Map<Nat, Handoff>;
    work : Map.Map<Nat, Work>; var nextIncident : Nat; var nextDelivery : Nat; var nextWork : Nat };
  public func empty() : State = { policies = Map.empty(); incidents = Map.empty(); events = Map.empty();
    deliveries = Map.empty(); handoffs = Map.empty(); work = Map.empty(); var nextIncident = 1; var nextDelivery = 1; var nextWork = 1 };
}
