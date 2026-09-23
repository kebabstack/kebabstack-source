/// Service-to-service hardware follow-up. Hub authenticates both app bindings;
/// device details and actions remain subject to the Assets admin permission.
module {
  public type Case = {
    desk : Text; ticket : Nat; key : Text; url : Text; person : Text;
    state : Text; revision : Int; dueAt : ?Int;
  };
  public type Progress = { state : Text; sources : Nat; bindings : [Text]; total : Nat; open : Nat; checkedAt : Int };
  public func unavailable() : Progress = { state = "unavailable"; sources = 0; bindings = []; total = 0; open = 0; checkedAt = 0 };
};
