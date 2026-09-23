import Map "mo:core/Map";
module {
 public type PolicyInput = { enabled : Bool; coordinators : [Text] };
 public type Policy = PolicyInput and { revision : Nat; by : Text; at : Int };
 public type Source = {#cover : {planId : Nat;coverId : Nat;interval : Bool;urgent : Bool};#planning : {day : Int}};
 public type Job = { key : Text;projectId : Nat;recipient : Text;source : Source;title : Text;path : Text;createdAt : Int;expiresAt : Int;status : {#pending;#accepted;#failed;#cancelled};attempts : Nat;nextAttempt : Int;leaseUntil : Int;detail : Text };
 public type State = {policies : Map.Map<Nat,Policy>;jobs : Map.Map<Text,Job>;scanned : Map.Map<Nat,Int>;var cursor : Nat};
 public func empty() : State = {policies=Map.empty();jobs=Map.empty();scanned=Map.empty();var cursor=0};
}
