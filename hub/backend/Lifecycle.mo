/// Pure transition detection: imports and source removal are not employee departures.
import Array "mo:core/Array";
module {
  public type Account = { key : Text; active : Bool; source : Text };
  public type Observation = { accounts : [Account]; active : Bool; name : Text; email : Text };
  public type Change = { kind : { #deactivated; #reactivated }; source : Text };
  public func change(before : Observation, after : Observation) : ?Change {
    if (after.accounts.size() == 0) return null;
    let disabled = after.accounts.filter(func a = not a.active and before.accounts.any(func b = b.key == a.key and b.active));
    if (disabled.size() > 0) return ?{ kind = #deactivated; source = disabled[0].source };
    let enabled = after.accounts.filter(func a = a.active and before.accounts.any(func b = b.key == a.key and not b.active));
    if (enabled.size() > 0) return ?{ kind = #reactivated; source = enabled[0].source };
    // Manual lock-outs/overrides change effective access without changing IdP state.
    // Removing a source changes membership: do not mistake that for an HR event.
    let sameAccounts = before.accounts.size() == after.accounts.size() and before.accounts.all(func a = after.accounts.any(func b = a.key == b.key));
    if (sameAccounts and before.active != after.active) return ?{ kind = if (after.active) #reactivated else #deactivated; source = "Hub access change" };
    null;
  };
};
