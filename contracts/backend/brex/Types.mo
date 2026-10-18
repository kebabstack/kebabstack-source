import Map "mo:core/Map";
import List "mo:core/List";
module {
  public type Result = { ok : Bool; detail : Text };
  public type Access = { space : Text; person : Text };
  public type Card = { id : Text; name : Text; lastFour : Text; status : Text };
  public type Config = {
    generation : Nat; key : Text; configuredBy : Text; testedAt : Int; cards : [Card]; cardsCursor : Text;
    selected : [Text]; enabled : Bool; aiEnabled : Bool; since : Text; cursor : Text;
    scanning : Bool; nextAt : Int; lastSuccess : Int; lastAttempt : Int; error : Text; pages : Nat;
  };
  public type Status = {
    configured : Bool; testedAt : Int; selected : [Text]; enabled : Bool; aiEnabled : Bool;
    since : Text; scanning : Bool; nextAt : Int; lastSuccess : Int; error : Text; pages : Nat;
    cards : [Card]; moreCards : Bool; payments : Nat; groups : Nat;
  };
  public type Payment = { id : Text; cardId : Text; merchant : Text; description : Text; date : Text; amountMinor : Int; currency : Text; kind : Text };
  public type Classification = { #unknown; #subscription; #oneTime; #other };
  public type ReviewState = { #pending; #linked : Nat; #ignored };
  public type Sample = { date : Text; amountMinor : Int; kind : Text };
  public type Group = {
    id : Nat; space : Text; cardId : Text; merchant : Text; currency : Text; descriptor : Text;
    count : Nat; totalMinor : Int; samples : [Sample]; latestDate : Text; latestAmount : Int;
    classification : Classification; reason : Text; candidates : [Nat]; aiAt : Int; aiError : Text;
    state : ReviewState; revision : Nat; autoLink : Bool; approvedAmount : ?Int;
    decidedBy : Text; decidedAt : Int;
  };
  public type Assignment = {state : ReviewState; person : Text; at : Int};
  public type PaymentReview = {id : Text; assignment : Assignment; history : [DecisionEvent]};
  public type SplitState = {defaults : Map.Map<Nat, Assignment>; assignments : Map.Map<Text, Assignment>; history : Map.Map<Text, [DecisionEvent]>};
  public type Summary = {pending : Nat; linked : Nat; ignored : Nat; split : Bool};
  public type ReviewGroup = Group and {summary : Summary};
  public type Field = { name : Text; value : Text };
  public type Contract = { id : Nat; title : Text; vendor : Text; status : Text; revision : Nat; fields : [Field] };
  public type DecisionEvent = {at : Int; person : Text; before : ReviewState; after : ReviewState; automatic : Bool};
  public type Decision = { #link : Nat; #create : Text; #dismiss; #reopen };
  public type DecisionResult = { ok : Bool; detail : Text; contractId : ?Nat };
  public type Answer = { ok : Bool; detail : Text; field : Text; before : Text; value : Text; revision : Nat };
  public type State = {
    decisions : Map.Map<Nat, [DecisionEvent]>;
    configs : Map.Map<Text, Config>; payments : Map.Map<Text, Payment>; groups : Map.Map<Nat, Group>;
    groupKeys : Map.Map<Text, Nat>; spaceGroups : Map.Map<Text, List.List<Nat>>;
    groupPayments : Map.Map<Nat, List.List<Text>>; counts : Map.Map<Text, Nat>; var nextGroup : Nat;
  };
}
