import Array "mo:core/Array";
import Nat "mo:core/Nat";
module {
  public type Override = { typeId : Nat; assignee : Text };
  public type Config = { revision : Nat; defaultAssignee : Text; overrides : [Override] };
  public type Decision = { assignee : Text; reason : Text };
  public let empty : Config = { revision = 0; defaultAssignee = ""; overrides = [] };
  // A configured empty override deliberately keeps this type unassigned.
  public func decide(config : Config, typeId : Nat, available : Text -> Bool) : Decision {
    let special = config.overrides.find(func r = r.typeId == typeId);
    let target = switch (special) { case (?r) r.assignee; case null config.defaultAssignee };
    if (target == "") return { assignee = ""; reason = "" };
    if (available(target)) return { assignee = target; reason = if (special == null) "Desk default" else "request type override" };
    if (special != null and config.defaultAssignee != "" and available(config.defaultAssignee)) {
      { assignee = config.defaultAssignee; reason = "request type owner unavailable; using Desk default" }
    } else ({ assignee = ""; reason = "configured owner unavailable; left unassigned for the support team" })
  };
  public func validate(input : Config, available : Text -> Bool, internalType : Nat -> Bool) : ?Text {
    if (input.overrides.size() > 200) return ?"Use at most 200 request type exceptions";
    if (input.defaultAssignee != "" and not available(input.defaultAssignee)) return ?"Choose an active Desk agent or admin for the default";
    var seen : [Nat] = [];
    for (r in input.overrides.values()) {
      if (not internalType(r.typeId)) return ?"An exception refers to a request type that is no longer available";
      if (seen.contains(r.typeId)) return ?"Each request type can have only one exception";
      seen := seen.concat([r.typeId]);
      if (r.assignee != "" and not available(r.assignee)) return ?"Choose an active Desk agent or admin for each exception";
    };
    null
  };
}
