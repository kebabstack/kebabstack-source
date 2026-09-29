import T "Types";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Char "mo:core/Char";
import Int "mo:core/Int";
import Time "mo:core/Time";
module {
  public let maxProjects = 100;
  public let maxTasks = 5000;
  public let maxLinks = 100;
  public let pageSize = 100;
  public let defaults : T.Preferences = { projectId = null; mine = true; tickets = true; sales = false; completed = false };
  public func trim(t : Text) : Text = t.trim(#predicate (Char.isWhitespace));
  public func validKey(key : Text) : Bool = key.size() >= 16 and key.size() <= 80 and key.chars().all(func c = Char.isAlphabetic(c) or Char.isDigit(c) or c == '-');
  // Calendar date only, deliberately not a guessed local midnight/timezone.
  public func validDate(day : Text) : Bool {
    if (day == "") return true;
    let parts = day.split(#char '-').toArray();
    if (parts.size() != 3 or parts[0].size() != 4 or parts[1].size() != 2 or parts[2].size() != 2) return false;
    let y = parts[0].toNat() ?? (return false);
    let m = parts[1].toNat() ?? (return false);
    let d = parts[2].toNat() ?? (return false);
    if (y < 2000 or y > 2199 or m < 1 or m > 12 or d < 1) return false;
    let leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0);
    let days = [31, if (leap) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    d <= days[m - 1]
  };
  public func projectError(x : T.ProjectInput) : ?Text {
    if (trim(x.name) == "" or x.name.size() > 100) return ?"Use a project name of 1–100 characters";
    if (x.description.size() > 2000) return ?"Keep the project description within 2,000 characters";
    if (not validDate(x.dueOn)) return ?"Choose a valid target date";
    switch (x.scope) { case (#personal) {}; case (#group g) { if (trim(g) == "" or g.size() > 200) return ?"Choose a Hub group" } };
    null
  };
  public func taskError(x : T.TaskInput) : ?Text {
    if (trim(x.title) == "" or x.title.size() > 180) return ?"Use a task title of 1–180 characters";
    if (x.note.size() > 4000) return ?"Keep task notes within 4,000 characters";
    if (x.waitingFor.size() > 120) return ?"Keep the waiting reason within 120 characters";
    if (not validDate(x.dueOn)) return ?"Choose a valid target date";
    switch (x.column) {
      case (#waiting) { if (trim(x.waitingFor) == "") return ?"Say who or what this task is waiting for" };
      case (#planned or #active or #done) { if (x.waitingFor != "") return ?"A waiting reason belongs to a waiting task" };
    };
    null
  };
  public func record(state : T.State, key : Text, by : Text, action : Text) {
    let old = state.audit.get(key) ?? [];
    state.audit.add(key, [{ at = Time.now(); by; action }].concat(old.values().take(49).toArray()));
  };
  public func slice<X>(rows : [X], offset : Nat) : [X] = rows.values().drop(offset).take(pageSize).toArray();
  public func matches(text : Text, search : Text) : Bool = text.toLower().contains(#text (trim(search).toLower()));
  public func taskOrder(a : T.Task, b : T.Task) : { #less; #equal; #greater } {
    if (a.dueOn != b.dueOn) {
      if (a.dueOn == "") return #greater;
      if (b.dueOn == "") return #less;
      return Text.compare(a.dueOn, b.dueOn)
    };
    if (a.updatedAt != b.updatedAt) Int.compare(b.updatedAt, a.updatedAt) else Nat.compare(a.id, b.id)
  };
}
