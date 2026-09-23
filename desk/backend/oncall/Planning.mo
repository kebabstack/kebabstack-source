import T "Types";
import Zones "Timezones";
import Map "mo:core/Map";
import Array "mo:core/Array";
import List "mo:core/List";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
module {
  public let day : Int = 86_400_000_000_000;
  public func empty() : T.State = { projects = Map.empty(); plans = Map.empty(); swaps = Map.empty(); var nextProject = 1; var nextPlan = 1; var nextSwap = 1 };
  public func overlap(a : {startAt : Int; endAt : Int}, b : {startAt : Int; endAt : Int}) : Bool = a.startAt < b.endAt and b.startAt < a.endAt;
  public func validKey(key : Text) : Bool = key.size() == 32 and key.chars().all(func c = (c >= '0' and c <= '9') or (c >= 'a' and c <= 'f'));
  public func projectError(input : T.ProjectInput) : ?Text {
    if (input.name.trim(#char ' ').size() < 2 or input.name.size() > 80 or input.description.size() > 300) return ?"Use a project name of 2–80 characters and a description up to 300 characters";
    if (input.services.size() == 0 or input.services.size() > 12 or input.services.any(func s = s.size() == 0 or s.size() > 80)) return ?"Add 1–12 services, each up to 80 characters";
    switch (input.scope) { case (#internal group) { if (group.size() > 80) return ?"Invalid Hub group" }; case (#customer id) { if (id == 0) return ?"Choose a customer project" } };
    null
  };
  public func planError(p : T.PlanInput) : ?Text {
    if (p.startAt < 0 or p.endAt <= p.startAt or p.endAt - p.startAt > 93 * day) return ?"Plan a period of up to 93 days";
    if (not Zones.names.contains(p.timezone) or p.template.size() > 80) return ?"Choose a timezone and template";
    if (p.layers.size() == 0 or p.layers.size() > 6 or p.layers.any(func n = n.size() == 0 or n.size() > 40)) return ?"Add 1–6 named response layers";
    if (p.windows.size() == 0 or p.windows.size() > 400 or p.shifts.size() > 400) return ?"A plan needs 1–400 coverage windows and at most 400 shifts";
    func valid(w : T.Window) : Bool = w.startAt >= p.startAt and w.endAt <= p.endAt and w.endAt > w.startAt and w.layer < p.layers.size();
    for (w in p.windows.values()) if (not valid(w)) return ?"Coverage windows must lie within the plan and refer to a response layer";
    var i = 0;
    for (w in p.windows.values()) {
      var j = 0;
      for (other in p.windows.values()) { if (j < i and w.layer == other.layer and overlap(w, other)) return ?"Coverage windows in one layer must not overlap"; j += 1 };
      i += 1
    };
    i := 0;
    for (s in p.shifts.values()) {
      if (not valid(s) or s.personId.size() > 120) return ?"Invalid shift";
      if (not p.windows.any(func w = s.layer == w.layer and s.startAt >= w.startAt and s.endAt <= w.endAt)) return ?"Each shift must fit within a required coverage window";
      var j = 0;
      for (other in p.shifts.values()) {
        if (j < i and overlap(s, other) and (s.layer == other.layer or (s.personId != "" and s.personId == other.personId))) return ?"Overlapping shifts: one responder cannot cover two response layers at once";
        j += 1
      };
      i += 1
    };
    null
  };
  public func effectivePerson(p : T.Plan, swaps : [T.Swap], index : Nat) : Text {
    var person = p.input.shifts[index].personId;
    for (s in swaps.values()) if (s.shift == index and s.state == #accepted) person := s.toPersonId;
    person
  };
  public func issues(p : T.Plan, swaps : [T.Swap], eligible : Text -> Bool, at : Int) : [T.Issue] {
    let out = List.empty<T.Issue>();
    for (w in p.input.windows.values()) {
      let selected = p.input.shifts.keys().toArray().filter(func i = p.input.shifts[i].layer == w.layer and overlap(p.input.shifts[i], w)).sort(func (a, b) = Int.compare(p.input.shifts[a].startAt, p.input.shifts[b].startAt));
      var cursor = w.startAt;
      for (index in selected.values()) {
        let s = p.input.shifts[index];
        if (cursor < s.startAt) out.add({ startAt = cursor; endAt = s.startAt; layer = w.layer; kind = #gap });
        let person = effectivePerson(p, swaps, index);
        if (person == "") out.add({ startAt = s.startAt; endAt = s.endAt; layer = w.layer; kind = #gap })
        else if (s.endAt > at and not eligible(person)) out.add({ startAt = Int.max(s.startAt, at); endAt = s.endAt; layer = w.layer; kind = #unavailable });
        cursor := s.endAt
      };
      if (cursor < w.endAt) out.add({ startAt = cursor; endAt = w.endAt; layer = w.layer; kind = #gap })
    };
    out.toArray()
  };
  public func summary(p : T.Plan) : T.Summary = { id = p.id; revision = p.revision; startAt = p.input.startAt; endAt = p.input.endAt; timezone = p.input.timezone; published = p.publication != null };
}
