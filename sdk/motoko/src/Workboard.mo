/// Read-only source projection for Desk Workboard. Never a workflow write API.
import Time "mo:core/Time";
module {
  public type Column = { #planned; #active; #waiting; #done };
  public type Card = {
    id : Nat; title : Text; reference : Text; column : Column; status : Text;
    next : Text; owner : Text; updatedAt : Int; dueOn : Text; path : Text;
  };
  public type Page = {
    state : { #ready; #denied; #unavailable }; rows : [Card]; total : Nat;
    checkedAt : Int;
  };
  public type Selection = { #all; #ids : [Nat] };
  public type SalesFilter = { selection : Selection; completed : Bool; mine : Bool; offset : Nat };
  public func denied() : Page = { state = #denied; rows = []; total = 0; checkedAt = Time.now() };
  public func unavailable() : Page = { state = #unavailable; rows = []; total = 0; checkedAt = Time.now() };
}
