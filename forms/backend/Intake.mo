import Text "mo:core/Text";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Json "mo:json";
import Hub "mo:kebab-hub";
module {
  public type Policy = { revision : Nat; origins : [Text]; contextKeys : [Text]; privacyUrl : Text; retentionDays : Nat; graceUntil : Int };
  public type Receipt = { num : Nat; fingerprint : Text; until : Int };
  public func shallow(t : Text) : Bool {
    var depth = 0; var quoted = false; var escaped = false;
    for (c in t.chars()) { if (quoted) { if (escaped) escaped := false else if (c == '\\') escaped := true else if (c == '\"') quoted := false }
      else if (c == '\"') quoted := true else if (c == '[' or c == '{') { depth += 1; if (depth > 12) return false } else if (c == ']' or c == '}') { if (depth == 0) return false; depth -= 1 } };
    depth == 0 and not quoted;
  };
  public func parse(t : Text) : ?Json.Json { if (not shallow(t)) return null; switch (Json.parse(Hub.sanitizeSurrogates(t))) { case (#ok j) ?j; case _ null } };
  public func str(j : Json.Json, key : Text) : Text { switch (Json.get(j,key)) { case (?#string v) v; case _ "" } };
  public func arr(j : Json.Json,key : Text) : [Json.Json] { switch(Json.get(j,key)){case (?#array v) v;case _ []} };
  public func origin(t : Text) : Bool {
    let host = Text.stripStart(t,#text "https://") ?? (return false);
    if (host.size() == 0 or host.size() > 200) return false;
    for(c in host.chars()) if(not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '.' or c == '-' or c == ':')) return false;
    true;
  };
  public func key(t : Text) : Bool { if(t.size() == 0 or t.size() > 40)return false; for(c in t.chars()) if(not ((c>='a' and c<='z') or (c>='0' and c<='9') or c=='_'))return false; true };
  public func token(t : Text) : Bool { if(t.size() != 64)return false; for(c in t.chars()) if(not ((c>='a' and c<='f') or (c>='0' and c<='9')))return false; true };
  public func email(t : Text) : Bool { t.size() >= 3 and t.size() <= 200 and Text.contains(t,#char '@') and not Text.contains(t,#char ' ') and not Text.contains(t,#char '\n') and not Text.contains(t,#char '\r') };
  func date(t : Text) : Bool {
    let xs=t.split(#char '-').toArray();if(xs.size() != 3 or xs[0].size() != 4 or xs[1].size() != 2 or xs[2].size() != 2)return false;
    let year=Nat.fromText(xs[0]) ?? (return false);let month=Nat.fromText(xs[1]) ?? (return false);let day=Nat.fromText(xs[2]) ?? (return false);
    if(year == 0 or month == 0 or month > 12)return false;
    let days=[31,if(year%400 == 0 or (year%4 == 0 and year%100 != 0))29 else 28,31,30,31,30,31,31,30,31,30,31];day > 0 and day <= days[month-1]
  };
  public func validate(schema : Text, answers : Text, name : Text, mail : Text) : Text {
    let sc=parse(schema) ?? (return "Form definition is invalid"); let a=parse(answers) ?? (return "Invalid answers");
    let entries=switch(a){case (#object_ v) v;case _ return "Answers must be an object"};
    if(str(sc,"askName") == "required" and Text.trim(name,#char ' ') == "")return "Your name is required";
    if((str(sc,"askEmail") == "required" or mail != "") and not email(mail))return "A valid email address is required";
    let questions=Array.flatten(arr(sc,"sections").map(func s = arr(s,"questions")));
    var seen : [Text]=[];
    for((k,v) in entries.values()) {
      if(seen.find(func x=x == k) != null)return "Duplicate answer"; seen:=Array.concat(seen,[k]);
      let q=questions.find(func q = switch(Json.getAsNat(q,"id")){case (#ok n) n.toText() == k;case _ false}) ?? (return "Unknown question");
      let kind=str(q,"type");
      let options=arr(q,"opts");
      switch(v) {
        case (#string t) { if(t.size() > (if(kind == "para")10_000 else 1_000))return "Answer is too long"; if((kind == "choice" or kind == "drop") and t != "" and options.find(func o=o==#string(t)) == null)return "Invalid choice"; if(kind == "date" and t != "" and not date(t))return "Invalid date"; if(kind == "check" or kind == "scale")return "Invalid answer type" };
        case (#array vs) {if(kind != "check" or vs.size() > options.size() or not vs.all(func v=options.find(func o=o == v) != null))return "Invalid choices"};
        case (#number _) {if(kind != "scale")return "Invalid answer type"; let n=switch(Json.getAsNat(a,k)){case (#ok n)n;case _ return "Invalid scale"}; let lo=switch(Json.getAsNat(q,"min")){case (#ok n)n;case _ 1};let hi=switch(Json.getAsNat(q,"max")){case (#ok n)n;case _ 5};if(n < lo or n > hi)return "Scale is out of range"};
        case _ return "Invalid answer type";
      };
    };
    // Validate required questions only along the route taken by these answers.
    let sections=arr(sc,"sections"); var at=0; var visited : [Nat]=[];
    label path while(at < sections.size()) {
      if(visited.find(func x=x == at) != null)return "Form routing contains a loop";visited:=Array.concat(visited,[at]);
      var next=at+1;
      for(q in arr(sections[at],"questions").values()) {
        let id=switch(Json.getAsNat(q,"id")){case (#ok n)n.toText();case _ return "Invalid question"};let v=Json.get(a,id);
        if(Json.get(q,"req")==?#bool(true) and (v == null or v==?#string("") or v==?#array([])))return "Please answer all required questions";
        if(str(q,"type") == "choice" or str(q,"type") == "drop") {
          var oi=0;
          for(o in arr(q,"opts").values()) { if(?o == v) { switch(Json.get(q,"routes")){case (?routes) switch(Json.get(routes,oi.toText())) {case (?#string "s")next:=sections.size();case (?target) {let targetId=switch(target){case (#string t) Nat.fromText(t);case _ switch(Json.getAsNat(routes,oi.toText())){case (#ok n)?n;case _ null}};var si=0;for(s in sections.values()){if(switch(Json.getAsNat(s,"id")){case (#ok n)?n == targetId;case _ false})next:=si;si+=1}};case null {}};case null {}} };oi+=1 };
        };
      };at:=next;
    }; "";
  };
};
