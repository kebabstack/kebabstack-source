import Map "mo:core/Map";
import T "types";
module {
  public type SavedReport = { id : Text; site : Text; name : Text; filters : [T.Filter]; steps : [T.FunnelStep]; revision : Nat; updatedAt : Int };
  public type SearchRow = { value : Text; clicks : Nat; impressions : Nat; positionMilli : Nat };
  public type SearchSnapshot = { site : Text; property : Text; from : Int; until : Int; fetchedAt : Int; totals : SearchRow; queries : [SearchRow]; pages : [SearchRow]; truncated : Bool };
  public type Connection = { clientId : Text; property : Text; revision : Nat };
  public type State = { reports : Map.Map<Text, SavedReport>; search : Map.Map<Text,SearchSnapshot>; connections : Map.Map<Text,Connection> };
};
