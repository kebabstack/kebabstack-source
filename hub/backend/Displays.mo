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
  public type View = { id : Nat; name : Text; createdAt : Int; expiresAt : Int; sources : [Source]; active : Bool; personalEmail : ?Text };
  public type State = { #pending : Int; #ready : { id : Nat; name : Text; expiresAt : Int; checkedAt : Int; sources : [Source] }; #ended };
  public type PairResult = { #ok : Int; #invalid; #busy };
  public type Approval = { #ok : Nat; #denied; #invalid; #missing; #limit };

  public func hex(value : Text, size : Nat) : Bool {
    value.size() == size and value.chars().all(func c = (c >= '0' and c <= '9') or (c >= 'a' and c <= 'f'));
  };
  public func sources(grant : Grant) : [Source] { grant.scopes.map(func s = { cid = s.cid; app = s.app }) };
  public type Options = { workboard : Bool; lifecycle : Bool; sales : Bool; personal : Bool; personalEmail : ?Text };
  public let defaults : Options = { workboard = false; lifecycle = false; sales = false; personal = false; personalEmail = null };
  let deskModes = ["desk", "desk-workboard", "desk-lifecycle", "desk-workboard-lifecycle", "desk-workboard-personal", "desk-workboard-lifecycle-personal"];
  public func sourceApp(app : Text) : Text {
    if (deskModes.any(func a = a == app)) "desk" else if (app == "assets-sales") "assets" else app
  };
  public func scopeApp(app : Text, options : Options) : Text {
    if (app == "desk") "desk" # (if (options.workboard) "-workboard" else "") # (if (options.lifecycle) "-lifecycle" else "") # (if (options.personal) "-personal" else "")
    else if (app == "assets" and options.sales) "assets-sales" else app
  };
  // Fixed keys and explicit per-screen scope. Existing approvals never gain new details.
  public func keys(app : Text) : [Text] {
    switch (sourceApp(app)) {
      case "desk" {
        let base = ["active", "unassigned", "breached"];
        if (Text.contains(app, #text "-workboard")) Array.concat(base, ["workProjects", "workOpen", "workWaiting", "workOverdue", "workUnowned", "workSteps", "workStepsDone"]) else base
      };
      case "trust" ["total", "passing", "attention", "unverified", "assessed", "score"];
      case "assets" ["total", "stock", "assigned", "preparing"];
      case "contracts" ["total", "due", "overdue", "unknown", "unowned"];
      case "watch" ["enabled", "alerts", "warnings", "stale", "expiring", "unknown", "expiryDays"];
      case _ [];
    };
  };
  // New source fields are optional: absent means unavailable, never a fabricated zero.
  public func optional(app : Text) : [Text] {
    if (sourceApp(app) == "desk") {
      let lifecycle = if (Text.contains(app, #text "-lifecycle")) ["onboarding", "offboardingOpen"] else [];
      let personal = if (Text.contains(app, #text "-personal")) ["personalOpen", "personalWaiting", "personalOverdue", "personalUnowned", "personalSteps", "personalStepsDone"] else [];
      return Array.concat(lifecycle, personal);
    };
    switch (app) {
      case "assets-sales" ["deployed", "sales", "salesPaid", "salesArchive", "salesPreparation", "salesHandover", "salesInvoice", "salesOverdue", "salesBuyer", "salesDraft", "salesAccepted"];
      case "assets" ["deployed"];
      case "contracts" ["seatsHeld"];
      case _ [];
    };
  };
  public func filter(app : Text, snapshot : Operations.Snapshot) : Operations.Snapshot {
    if (snapshot.state != #ready) return { snapshot with metrics = [] };
    let allowed = keys(app);
    if (allowed.size() == 0 or allowed.any(func key = snapshot.metrics.filter(func (k, _) = k == key).size() != 1)) return Operations.unavailable();
    let extra = optional(app);
    { snapshot with metrics = snapshot.metrics.filter(func (key, _) = allowed.any(func k = k == key) or extra.any(func k = k == key)) };
  };
};
