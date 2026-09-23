/// Project-local intake types and immutable workflow snapshots. No Hub role grants.
import Customers "Customers";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Json "mo:json";
module {
  public type Step = { name : Text; instructions : Text; group : Text; approval : Bool; checklist : [Text] };
  public type Input = { name : Text; description : Text; enabled : Bool; fields : [Customers.Field]; priority : Text; respondH : Nat; resolveH : Nat; steps : [Step] };
  public type Type = Input and { id : Nat; projectId : Nat; revision : Nat };
  public type Run = { definition : Type; step : Nat; checked : [Bool]; revision : Nat; outcome : Text };
  public func validate(a : Input) : Text {
    let fields = Customers.validate({ name = a.name; description = a.description; fields = a.fields; group = ""; enabled = true; widgetEnabled = false; origins = [] });
    if (fields != "") return fields;
    if (not ["low", "normal", "high", "urgent"].contains(a.priority)) return "Choose a valid priority";
    if (a.respondH > 8760 or a.resolveH > 8760) return "Targets: 0–8760 hours (0 means no target)";
    if (a.steps.size() > 8) return "Maximum 8 workflow steps";
    var names : [Text] = [];
    for (s in a.steps.vals()) {
      if (Text.trim(s.name, #char ' ') == "" or s.name.size() > 60 or s.instructions.size() > 500 or s.group.size() > 80) return "Steps need a name (up to 60 characters), instructions up to 500 and a short Hub group";
      let name = Text.toLower(Text.trim(s.name, #char ' '));
      if (names.contains(name)) return "Step names must be unique";
      names := Array.concat(names, [name]);
      if (s.checklist.size() > 8) return "Maximum 8 required checks per step";
      for (item in s.checklist.vals()) if (Text.trim(item, #char ' ') == "" or item.size() > 160) return "Required checks: 1–160 characters each";
    };
    "";
  };
  public func start(t : Type) : Run = { definition = t; step = 0; checked = if (t.steps.size() > 0) t.steps[0].checklist.map(func _ = false) else []; revision = 0; outcome = "" };
  public func publicType(t : Type) : Json.Json {
    Json.obj([("id", Json.int(t.id)), ("name", #string(t.name)), ("description", #string(t.description)), ("fields", #array(t.fields.map(func f = Json.obj([("key", #string(f.key)), ("title", #string(f.title)), ("kind", #string(f.kind)), ("required", #bool(f.required)), ("options", #array(f.options.map(func x = #string(x))))]))))]);
  };
  public func review(r : Run) : Json.Json = Json.obj([("requestType", publicType(r.definition)), ("typeRevision", Json.int(r.definition.revision)), ("step", Json.int(r.step)), ("outcome", #string(r.outcome)), ("checked", #array(r.checked.map(func x = #bool(x)))), ("steps", #array(r.definition.steps.map(func s = Json.obj([("name", #string(s.name)), ("instructions", #string(s.instructions)), ("group", #string(s.group)), ("approval", #bool(s.approval)), ("checklist", #array(s.checklist.map(func x = #string(x))))]))))]);
}
