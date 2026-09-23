/// Customer support's public contract. No Hub identities or internal ticket data.
import Text "mo:core/Text";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Json "mo:json";

module {
  public type Field = { key : Text; title : Text; kind : Text; options : [Text]; required : Bool; sensitive : Bool };
  public type Input = { name : Text; description : Text; group : Text; enabled : Bool; widgetEnabled : Bool; origins : [Text]; fields : [Field] };
  public type Project = Input and { id : Nat; revision : Nat; widgetId : Text; typeId : Nat };
  public type Key = { id : Nat; projectId : Nat; name : Text; scopes : [Text]; hash : Text; createdAt : Int; expiresAt : Int; revoked : Bool };
  public type Contact = { projectId : Nat; name : Text; email : Text; tokenHash : Text; expiresAt : Int; fingerprint : Text; schema : [Field] };
  public func token(t : Text) : Bool {
    if (t.size() != 64) return false;
    for (c in t.chars()) if (not ((c >= '0' and c <= '9') or (c >= 'a' and c <= 'f'))) return false;
    true;
  };
  public func origin(t : Text) : Bool {
    let host = switch (Text.stripStart(t, #text "https://")) { case (?h) h; case null return false };
    if (host.size() == 0 or host.size() > 200) return false;
    for (c in host.chars()) if (not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '.' or c == '-' or c == ':')) return false;
    not Text.startsWith(host, #text ":");
  };
  public func validate(a : Input) : Text {
    if (Text.trim(a.name, #char ' ').size() == 0 or a.name.size() > 60) return "Project name: 1–60 characters";
    if (a.description.size() > 300 or a.group.size() > 80) return "Description or group is too long";
    if (a.origins.size() > 10) return "Maximum 10 website origins";
    for (o in a.origins.vals()) if (not origin(o)) return "Use exact HTTPS origins, such as https://product.example.com (no path or trailing slash)";
    if (a.fields.size() > 12) return "Maximum 12 custom fields";
    var keys : [Text] = [];
    for (f in a.fields.vals()) {
      if (f.key.size() == 0 or f.key.size() > 40 or f.title.size() == 0 or f.title.size() > 80) return "Every field needs a short key and label";
      for (c in f.key.chars()) if (not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '_')) return "Field keys use lowercase letters, numbers and underscores";
      if (Array.find<Text>(keys, func k = k == f.key) != null) return "Duplicate field key";
      keys := Array.concat(keys, [f.key]);
      if (not (f.kind == "text" or f.kind == "textarea" or f.kind == "select" or f.kind == "date" or f.kind == "bool")) return "Unsupported customer field type";
      if (f.sensitive) return "Customer forms cannot request sensitive fields";
      if (f.options.size() > 20 or (f.kind == "select" and f.options.size() == 0)) return "Select fields need 1–20 options";
      for (v in f.options.vals()) if (v.size() == 0 or v.size() > 100) return "Options: 1–100 characters";
    };
    "";
  };
  public func fields(schema : [Field], values : [(Text, Text)]) : Text {
    if (values.size() > 12) return "Too many fields";
    var seen : [Text] = [];
    for ((k, v) in values.vals()) {
      let f = switch (schema.find(func f = f.key == k)) { case (?f) f; case null return "Unknown field: " # k };
      if (seen.find(func x = x == k) != null) return "Duplicate field: " # k;
      seen := Array.concat(seen, [k]);
      if (v.size() > 2_000) return "Field value is too long";
      if (v != "" and f.kind == "select" and f.options.find(func x = x == v) == null) return "Invalid option: " # k;
      if (v != "" and f.kind == "bool" and v != "true" and v != "false") return "Boolean fields use true or false";
      if (v != "" and f.kind == "date") {
        let parts = Text.split(v, #char '-').toArray();
        if (parts.size() != 3) return "Dates use YYYY-MM-DD";
        if (parts[0].size() != 4 or parts[1].size() != 2 or parts[2].size() != 2) return "Dates use YYYY-MM-DD";
        let y = Nat.fromText(parts[0]) ?? 0; let m = Nat.fromText(parts[1]) ?? 0; let d = Nat.fromText(parts[2]) ?? 0;
        let days = if (m == 2) { if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) 29 else 28 } else if (m == 4 or m == 6 or m == 9 or m == 11) 30 else 31;
        if (y < 1900 or y > 2200 or m < 1 or m > 12 or d < 1 or d > days) return "Invalid date";
      };
    };
    for (f in schema.vals()) if (f.required and values.find(func (k, v) = k == f.key and Text.trim(v, #char ' ') != "") == null) return "Required field: " # f.title;
    "";
  };
  public func schema(p : Project) : Json.Json = Json.obj([
    ("id", Json.int(p.id)), ("name", #string(p.name)), ("description", #string(p.description)), ("revision", Json.int(p.revision)),
    ("fields", #array(p.fields.map(func f = Json.obj([("key", #string(f.key)), ("title", #string(f.title)), ("kind", #string(f.kind)), ("required", #bool(f.required)), ("options", #array(f.options.map(func x = #string(x))))]))))
  ]);
  /// Bound recursion before calling the JSON library on unauthenticated input.
  public func shallow(t : Text) : Bool {
    var depth = 0; var quoted = false; var escaped = false;
    for (c in t.chars()) {
      if (quoted) { if (escaped) escaped := false else if (c == '\\') escaped := true else if (c == '\"') quoted := false }
      else if (c == '\"') quoted := true
      else if (c == '[' or c == '{') { depth += 1; if (depth > 8) return false }
      else if (c == ']' or c == '}') { if (depth == 0) return false; depth -= 1 };
    };
    depth == 0 and not quoted;
  };
}
