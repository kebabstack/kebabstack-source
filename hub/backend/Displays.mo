import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Operations "../../sdk/motoko/src/Operations";

// Display capabilities are deliberately separate from login, directory and app tokens.
module {
  public type Scope = { cid : Nat; app : Text; canisterId : Principal };
  public type Source = { cid : Nat; app : Text };
  public type Pending = { keyHash : Text; expiresAt : Int };
  public type Grant = { id : Nat; name : Text; by : Principal; personId : Text; createdAt : Int; expiresAt : Int; scopes : [Scope] };
  public type View = { id : Nat; name : Text; createdAt : Int; expiresAt : Int; sources : [Source]; active : Bool };
  public type State = { #pending : Int; #ready : { id : Nat; name : Text; expiresAt : Int; checkedAt : Int; sources : [Source] }; #ended };
  public type PairResult = { #ok : Int; #invalid; #busy };
  public type Approval = { #ok : Nat; #denied; #invalid; #missing; #limit };

  public func hex(value : Text, size : Nat) : Bool {
    value.size() == size and value.chars().all(func c = (c >= '0' and c <= '9') or (c >= 'a' and c <= 'f'));
  };
  public func sources(grant : Grant) : [Source] { grant.scopes.map(func s = { cid = s.cid; app = s.app }) };
  // Fixed metric keys only. No future source field becomes public by accident.
  // Personnel departures and employee sales are intentionally absent from a shared screen.
  public func keys(app : Text) : [Text] {
    switch app {
      case "desk" ["active", "unassigned", "breached"];
      case "trust" ["total", "passing", "attention", "unverified", "assessed", "score"];
      case "assets" ["total", "stock", "assigned", "preparing"];
      case "contracts" ["total", "due", "overdue", "unknown", "unowned"];
      case "watch" ["enabled", "alerts", "warnings", "stale", "expiring", "unknown", "expiryDays"];
      case _ [];
    };
  };
  public func filter(app : Text, snapshot : Operations.Snapshot) : Operations.Snapshot {
    if (snapshot.state != #ready) return { snapshot with metrics = [] };
    let allowed = keys(app);
    if (allowed.size() == 0 or allowed.any(func key = snapshot.metrics.filter(func (k, _) = k == key).size() != 1)) return Operations.unavailable();
    { snapshot with metrics = snapshot.metrics.filter(func (key, _) = allowed.any(func k = k == key)) };
  };
};
