/// Versioned, aggregate-only Operations contract. No record IDs, free text,
/// personal data or credentials belong in this response.
import Time "mo:core/Time";
module {
  public type Snapshot = {
    schema : Nat;
    state : { #ready; #denied; #unavailable };
    checkedAt : Int;
    metrics : [(Text, Nat)];
  };
  public func ready(metrics : [(Text, Nat)]) : Snapshot {
    { schema = 1; state = #ready; checkedAt = Time.now(); metrics };
  };
  public func denied() : Snapshot {
    { schema = 1; state = #denied; checkedAt = Time.now(); metrics = [] };
  };
  public func unavailable() : Snapshot {
    { schema = 1; state = #unavailable; checkedAt = Time.now(); metrics = [] };
  };
  public func supported(app : Text) : Bool {
    app == "desk" or app == "assets" or app == "trust" or app == "contracts" or app == "watch";
  };
}
