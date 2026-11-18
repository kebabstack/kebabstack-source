import Response "FalconResponse";
import Array "mo:core/Array";
import Json "mo:json";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Error "mo:core/Error";
import Nat "mo:core/Nat";
import Int "mo:core/Int";

module {
  public type Alert = { compositeId : Text; updated : Text; title : Text; host : Text; severity : Text; providerStatus : Text; url : Text; identity : ?Identity; resolutions : ?[Text] };
  public type Identity = { person : Text; serial : Text; basis : Text };
  public type Device = { id : Nat; title : Text; serial : Text; owner : Text; ownerName : Text };
  public type DeviceView = { device : ?Device; state : Text; url : Text };
  public type Desk = actor {
    hub_falconIntake : (Alert) -> async Nat;
    hub_falconEdits : shared query Nat -> async [(Nat,Edit)];
    hub_falconEdited : (Nat,Int,Text,[Text],Bool) -> async ();
    hub_falconLegacy : shared query Nat -> async [(Nat,Text)];
    hub_falconPending : shared query (Nat) -> async [(Nat, Text)];
    hub_falconResult : (Nat, Text, Text) -> async ();
  };
  public type Edit = { revision:Int; key:Text; status:Text; reason:Text; priorStatus:Text; priorReasons:[Text]; by:Text };
  public func reasons(j : Json.Json) : [Text] {
    let tags = switch (Json.get(j,"tags")) { case (?#array(a)) a; case _ [] };
    ["true_positive","false_positive","ignored"].filter(func r = tags.any(func t = t == #string(r)))
  };
  public type Config = { region : Text; clientId : Text; secret : Text; cid : Text; desk : Principal; connector : Nat };
  // UTC Gregorian date from Unix days (same civil-from-days algorithm as Desk).
  public func utcSecond(ns : Int) : Text {
    let sec = ns / 1_000_000_000;
    let z = sec / 86_400 + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe/1460 + doe/36524 - doe/146096) / 365;
    let doy = doe - (365*yoe + yoe/4 - yoe/100);
    let mp = (5*doy + 2)/153;
    let day = doy - (153*mp+2)/5 + 1;
    let month = if (mp < 10) mp+3 else mp-9;
    let year = yoe + era*400 + (if (month <= 2) 1 else 0);
    func two(n : Int) : Text = (if (n < 10) "0" else "") # Int.toText(n);
    Int.toText(year) # "-" # two(month) # "-" # two(day) # "T" # two(sec/3600%24) # ":" # two(sec/60%60) # ":" # two(sec%60) # "Z"
  };
  public func api(region : Text) : Text = switch (region) {
    case "us-1" "https://api.crowdstrike.com";
    case "us-2" "https://api.us-2.crowdstrike.com";
    case "eu-1" "https://api.eu-1.crowdstrike.com";
    case _ "";
  };
  public func hexId(s : Text) : Bool = s.size() == 32 and s.chars().all(func c = (c >= '0' and c <= '9') or (c >= 'a' and c <= 'f'));
  public func timestamp(s : Text) : Bool = s.size() >= 20 and s.size() <= 35 and s.chars().all(func c = (c >= '0' and c <= '9') or c == 'T' or c == 'Z' or c == '-' or c == ':' or c == '.');
  public func field(j : Json.Json, path : Text) : Text = switch (Json.get(j,path)) { case (?#string(v)) v; case _ "" };
  public func items(j : Json.Json) : async* [Json.Json] { switch (Json.get(j,"resources")) { case (?#array(a)) a; case _ throw Error.reject("Falcon returned no resources list") } };
  public func decode(status : Nat, body : Blob) : async* Json.Json {
    if (status < 200 or status >= 300) throw Error.reject("Falcon HTTP " # Nat.toText(status));
    let j = switch (Response.parse(body)) { case (?v) v; case _ throw Error.reject("Invalid Falcon response") };
    switch (Json.get(j,"errors")) { case (?#array(a)) { if (a.size() > 0) throw Error.reject("Falcon returned an application error") }; case _ {} };
    j
  };
  public func alert(j : Json.Json, cid : Text) : async* Alert {
    let compositeId = field(j,"composite_id");
    let updated = field(j,"updated_timestamp");
    if (field(j,"cid") != cid or compositeId == "" or not timestamp(updated)) throw Error.reject("Unexpected Falcon alert identity or timestamp");
    let title = field(j,"display_name");
    { compositeId; updated; title = if (title == "") field(j,"name") else title; host = field(j,"device.hostname"); severity = field(j,"severity_name"); providerStatus = field(j,"status"); identity = null; resolutions=?reasons(j); url = field(j,"falcon_host_link") }
  };
}
