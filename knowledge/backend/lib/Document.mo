import Array "mo:core/Array";
import Json "mo:json";
import Text "mo:core/Text";
import Char "mo:core/Char";
module {
  func str(j : Json.Json, key : Text) : Text { switch (Json.get(j, key)) { case (?#string s) s; case _ "" } };
  public func valid(raw : Text) : ?Text {
    if (raw.size() > 100000) return null;
    // Bound nesting before parsing (including malicious input), respecting JSON strings.
    var depth = 0; var quoted = false; var escaped = false;
    for (c in raw.chars()) { if (quoted) { if (escaped) escaped := false else if (c == '\\') escaped := true else if (c == '\"') quoted := false } else if (c == '\"') quoted := true else if (c == '{' or c == '[') { depth += 1; if (depth > 30) return null } else if (c == '}' or c == ']') { if (depth == 0) return null; depth -= 1 } };
    let root = switch (Json.parse(raw)) { case (#ok j) j; case _ return null };
    var nodes = 0; var plain = "";
    func visit(j : Json.Json, parent : Text, level : Nat) : Bool {
      nodes += 1; if (nodes > 2000 or level > 12) return false;
      let kind = str(j, "type");
      func block() : Bool = kind == "paragraph" or kind == "heading" or kind == "bulletList" or kind == "orderedList" or kind == "blockquote" or kind == "codeBlock" or kind == "horizontalRule";
      let validChild = switch (parent) {
        case "" kind == "doc";
        case "doc" kind == "paragraph" or kind == "heading" or kind == "bulletList" or kind == "orderedList" or kind == "blockquote" or kind == "codeBlock" or kind == "horizontalRule";
        case "bulletList" kind == "listItem"; case "orderedList" kind == "listItem";
        case "listItem" block();
        case "blockquote" block();
        case "codeBlock" kind == "text";
        case _ kind == "text" or kind == "hardBreak";
      };
      if (not validChild) return false;
      let entries = switch (j) { case (#object_ xs) xs; case _ return false };
      for ((k, _) in entries.vals()) if (entries.filter(func (key, _) = key == k).size() != 1 or (k != "type" and k != "content" and k != "text" and k != "marks" and k != "attrs")) return false;
      if (kind == "text") { let s = str(j, "text"); if (s == "") return false; plain #= s };
      switch (Json.get(j, "attrs")) {
        case null {};
        case (?#object_ attrs) {
          for ((k, v) in attrs.vals()) {
            if (attrs.filter(func (key, _) = key == k).size() != 1) return false;
            if (kind == "heading" and k == "level") { switch (v) { case (#number n) { if (n != #int(2) and n != #int(3)) return false }; case _ return false } }
            else if (kind == "orderedList" and k == "start") { switch (v) { case (#number(#int n)) { if (n < 1 or n > 10000) return false }; case _ return false } }
            else if (kind == "orderedList" and k == "type") { if (v != #null_ and v != #string("1") and v != #string("a") and v != #string("A") and v != #string("i") and v != #string("I")) return false }
            else if (kind == "codeBlock" and k == "language" and v == #null_) {} else return false;
          };
        };
        case _ return false;
      };
      switch (Json.get(j, "marks")) {
        case null {};
        case (?#array marks) {
          if (kind != "text" or marks.size() > 5) return false;
          for (mark in marks.vals()) {
            let m = str(mark, "type");
            if (m != "bold" and m != "italic" and m != "strike" and m != "code") return false;
            switch (mark) { case (#object_ xs) { if (xs.size() != 1) return false }; case _ return false };
          }
        };
        case _ return false;
      };
      switch (Json.get(j, "content")) {
        case null {};
        case (?#array children) {
          if (kind == "text" or kind == "hardBreak" or kind == "horizontalRule") return false;
          for (child in children.vals()) if (not visit(child, kind, level + 1)) return false;
        };
        case _ return false;
      };
      if (kind != "text") plain #= "\n";
      plain.size() <= 50000
    };
    if (not visit(root, "", 0) or Text.trim(plain, #predicate(Char.isWhitespace)) == "") return null;
    ?plain
  };
  public func fromText(text : Text) : Text {
    let leaf = Json.obj([("type", #string("text")), ("text", #string(text))]);
    let paragraph = Json.obj([("type", #string("paragraph")), ("content", #array([leaf]))]);
    Json.stringify(Json.obj([("type", #string("doc")), ("content", #array([paragraph]))]), null)
  };
};
