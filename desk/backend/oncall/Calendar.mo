import T "Types";
import P "Planning";
import Map "mo:core/Map";
import Array "mo:core/Array";
import List "mo:core/List";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
module {
 public type ProjectSettings = { revision : Nat; archivedAt : Int; retentionDays : Nat; retentionChangedAt : Int };
 public type Cancellation = { from : Int; at : Int; by : Text; reason : Text };
 public type Cover = T.Swap and { startAt : Int; endAt : Int };
 public type Absence = { id : Nat; projectId : Nat; personId : Text; name : Text; startAt : Int; endAt : Int; by : Text; at : Int; cancelledAt : Int };
 public type Segment = T.Shift and { shift : Nat; key : Text };
 public type State = { settings : Map.Map<Nat,ProjectSettings>; cancellations : Map.Map<Nat,Cancellation>; covers : Map.Map<Nat,[Cover]>; absences : Map.Map<Nat,Absence>; var nextCover : Nat; var nextAbsence : Nat };
 public func empty() : State = {settings=Map.empty();cancellations=Map.empty();covers=Map.empty();absences=Map.empty();var nextCover=1;var nextAbsence=1};
 public func settings(s : State,id : Nat) : ProjectSettings = s.settings.get(id) ?? ({revision=0;archivedAt=0;retentionDays=730;retentionChangedAt=0});
 public func end(s : State,p : T.Plan) : Int = Int.min(p.input.endAt,(s.cancellations.get(p.id) ?? ({from=p.input.endAt;at=0;by="";reason=""})).from);
 public func active(s : State,id : Nat) : Bool = settings(s,id).archivedAt == 0;
 public func unavailable(s : State,project : Nat,person : Text,start : Int,finish : Int) : Bool = s.absences.values().any(func a = a.projectId==project and a.personId==person and a.cancelledAt==0 and a.startAt < finish and start < a.endAt);
 public func segments(s : State,p : T.Plan,swaps : [T.Swap]) : [Segment] {
  let out=List.empty<Segment>();let until=end(s,p);
  for(i in p.input.shifts.keys()){
   let shift=p.input.shifts[i];let finish=Int.min(shift.endAt,until);
   if(finish > shift.startAt){
    var points=[shift.startAt,finish];let covers=s.covers.get(p.id) ?? [];
    for(c in covers.values())if(c.state==#accepted and c.shift==i){if(c.startAt > shift.startAt and c.startAt < finish)points:=points.concat([c.startAt]);if(c.endAt > shift.startAt and c.endAt < finish)points:=points.concat([c.endAt])};
    points:=points.sort(Int.compare);var cursor=shift.startAt;
    for(point in points.values())if(point > cursor){
     var personId=P.effectivePerson(p,swaps,i);for(c in covers.values())if(c.state==#accepted and c.shift==i and c.startAt <= cursor and c.endAt >= point)personId:=c.toPersonId;
     let base="shift:"#p.id.toText()#":"#i.toText();
     out.add({startAt=cursor;endAt=point;layer=shift.layer;personId;shift=i;key=if(cursor==shift.startAt and point==shift.endAt)base else base#":"#cursor.toText()#":"#point.toText()});cursor:=point
    }
   }
  };out.toArray()
 };
 public func issues(s : State,p : T.Plan,swaps : [T.Swap],eligible : Text -> Bool,at : Int) : [T.Issue] {
  let until=end(s,p);let effective=segments(s,p,swaps);
  let input={p.input with endAt=until;shifts=effective;windows=p.input.windows.filter(func w=w.startAt < until).map(func w={w with endAt=Int.min(w.endAt,until)})};
  let out=List.fromArray<T.Issue>(P.issues({p with input},[],eligible,at));
  for(segment in effective.values())for(a in s.absences.values())if(a.projectId==p.input.projectId and a.personId==segment.personId and a.cancelledAt==0 and a.endAt > at and segment.endAt > at and P.overlap(a,segment))out.add({startAt=Int.max(Int.max(segment.startAt,a.startAt),at);endAt=Int.min(segment.endAt,a.endAt);layer=segment.layer;kind=#unavailable});out.toArray()
 };
}
