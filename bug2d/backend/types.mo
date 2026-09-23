import Map "mo:core/Map";
module {
  public type Profile = { name : Text };
  public type Link = { token : Text; suiteToken : Text; hub : Text; expiresAt : Int };
  public type Run = { id : Nat; day : Nat; startedAt : Int };
  public type Score = { owner : Text; meters : Nat; coins : Nat; score : Nat; at : Int };
  public type Row = { name : Text; meters : Nat; coins : Nat; score : Nat; at : Int };
  public type Submission = { runId : Nat; meters : Nat; coins : [Nat]; durationMs : Nat; version : Text };
  public type Pilot = { name : Text; hub : Bool; hubId : Text; suiteToken : Text };
  public type Login = { token : Text; suiteToken : Text; email : Text; displayName : Text; role : Text };
  public type Reply<T> = { #ok : T; #err : Text };
  public type Counters = { var nextId : Nat };
  public type Profiles = Map.Map<Text, Profile>;
  public type Links = Map.Map<Principal, Link>;
  public type Runs = Map.Map<Text, Run>;
  public type Scores = Map.Map<Text, Score>;
}
