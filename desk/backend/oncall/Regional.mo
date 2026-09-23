import O "Types";
import Zones "Timezones";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
module {
 public type Region = { name : Text; timezone : Text; startMinute : Nat; endMinute : Nat; days : [Nat]; holidays : [Text]; primary : [Text]; backup : [Text]; backupMode : {#none;#always;#nonworking} };
 public type Recipe = { startDate : Text; weeks : Nat; timezone : Text; rotationDays : Nat; requirement : {#continuous;#regional}; regions : [Region] };
 public type Saved = { recipe : Recipe; edited : Bool };
 public type State = { recipes : Map.Map<Nat,Saved> };
 public func empty() : State = { recipes=Map.empty() };
 public func error(r : Recipe,p : O.PlanInput) : ?Text {
  if(r.startDate.size()!=10 or r.weeks < 1 or r.weeks > 12 or (r.rotationDays!=1 and r.rotationDays!=7) or r.timezone!=p.timezone or r.regions.size() < 1 or r.regions.size() > 3)return ?"Choose 1–3 regions, 1–12 weeks and daily or weekly rotation";
  for(region in r.regions.values()){
   if(region.name.trim(#char ' ').size()==0 or region.name.size() > 40 or not Zones.names.contains(region.timezone) or region.startMinute >= 1440 or region.endMinute > 1440 or region.startMinute==region.endMinute or region.days.size()==0 or region.days.size() > 7 or region.days.any(func d=d > 6))return ?"Choose a region name, timezone, hours and weekdays";
   if(region.holidays.size() > 93 or region.holidays.any(func d=d.size()!=10) or region.primary.size()==0 or region.primary.size() > 50 or region.backup.size() > 50 or (region.backupMode!=#none and region.backup.size()==0))return ?"Choose responders and at most 93 holiday dates per region";
   for(members in [region.primary,region.backup].values())for(i in members.keys())if(members[i].size()==0 or members[i].size() > 120 or members.keys().any(func j=j < i and members[i]==members[j]))return ?"Select each responder once in each rotation";
  };null
 };
}
