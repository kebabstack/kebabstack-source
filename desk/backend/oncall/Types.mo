import Map "mo:core/Map";
module {
  public type Actor = { id : Text; role : Text };
  public type Person = { id : Text; name : Text };
  public type Scope = { #internal : Text; #customer : Nat };
  public type ProjectInput = { name : Text; description : Text; scope : Scope; services : [Text] };
  public type Project = ProjectInput and { id : Nat; createdAt : Int; createdBy : Text; requestKey : Text };
  public type Window = { startAt : Int; endAt : Int; layer : Nat };
  public type Shift = Window and { personId : Text };
  public type PlanInput = { projectId : Nat; startAt : Int; endAt : Int; timezone : Text; layers : [Text]; windows : [Window]; shifts : [Shift]; template : Text };
  public type Publication = { at : Int; by : Text; names : [Person]; acceptedGaps : Bool };
  public type Plan = { id : Nat; revision : Nat; input : PlanInput; publication : ?Publication; createdAt : Int; createdBy : Text; requestKey : Text };
  public type SwapState = { #pending; #accepted; #declined; #cancelled };
  public type Swap = { id : Nat; planId : Nat; shift : Nat; fromPersonId : Text; toPersonId : Text; toName : Text; reason : Text; requestedBy : Text; requestedAt : Int; state : SwapState; decidedAt : Int; decidedBy : Text };
  public type Issue = { startAt : Int; endAt : Int; layer : Nat; kind : { #gap; #unavailable } };
  public type PlanView = { plan : Plan; swaps : [Swap]; issues : [Issue] };
  public type Summary = { id : Nat; revision : Nat; startAt : Int; endAt : Int; timezone : Text; published : Bool };
  public type Workspace = { project : Project; members : [Person]; plans : [Summary]; canManage : Bool };
  public type Error = { #denied; #missing; #stale; #invalid : Text; #limit : Text };
  public type Result = { #ok : { id : Nat; revision : Nat }; #err : Error };
  public type State = { projects : Map.Map<Nat, Project>; plans : Map.Map<Nat, Plan>; swaps : Map.Map<Nat, [Swap]>; var nextProject : Nat; var nextPlan : Nat; var nextSwap : Nat };
}
