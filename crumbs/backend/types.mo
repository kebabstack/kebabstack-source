import Map "mo:core/Map";
import Hub "mo:motoko";

module {
  public type Error = {
    #unauthorized;
    #notFound;
    #invalid : Text;
    #conflict : Text;
    #capacity : Text;
  };
  public type Result<T> = { #ok : T; #err : Error };
  public type Site = {
    id : Text;
    name : Text;
    domain : Text;
    timezone : Text;
    retentionDays : Nat;
    enabled : Bool;
    allowedProperties : [Text];
    excludedPaths : [Text];
    viewers : [Text];
  };
  public type SiteRole = { #none; #read; #manage; #admin };
  public type SiteView = Site and { accessRole : SiteRole };
  public type SiteAccess = { revision : Nat; readers : [Text]; managers : [Text]; updatedBy : Text; updatedAt : Int };
  public type AccessPerson = { id : Text; email : Text; displayName : Text; active : Bool; eligible : Bool; automatic : Bool };
  public type AccessView = { site : Text; revision : Nat; readers : [AccessPerson]; managers : [AccessPerson]; legacyAllReaders : Bool; updatedBy : Text; updatedAt : Int };
  public type Event = {
    id : Text;
    site : Text;
    visitor : Text;
    at : Int;
    order : Nat;
    kind : { #pageview; #event; #engagement };
    path : Text;
    hostname : Text;
    source : Text;
    medium : Text;
    campaign : Text;
    content : Text;
    term : Text;
    country : Text;
    region : Text;
    city : Text;
    device : Text;
    browser : Text;
    os : Text;
    name : Text;
    props : [(Text, Text)];
    interactive : Bool;
    revenueMinor : Int;
    currency : Text;
    engagementMs : Nat;
    scrollDepth : Nat;
  };
  public type Filter = { dimension : Text; values : [Text]; exclude : Bool };
  public type ReportRequest = {
    site : Text;
    from : Int;
    until : Int;
    filters : [Filter];
    dimension : Text;
    limit : Nat;
  };
  public type Metrics = {
    visitors : Nat;
    visits : Nat;
    pageviews : Nat;
    events : Nat;
    bounces : Nat;
    durationSeconds : Nat;
    engagementMs : Nat;
    scrollDepthSum : Nat;
    scrollSamples : Nat;
    revenue : [(Text, Int)];
  };
  public type Row = { value : Text; metrics : Metrics };
  public type Report = {
    totals : Metrics;
    rows : [Row];
    scanned : Nat;
    truncated : Bool;
  };
  public type Goal = {
    id : Text;
    site : Text;
    name : Text;
    kind : { #event; #page; #scroll : Nat };
    value : Text;
  };
  public type FunnelStep = { kind : { #event; #page }; value : Text };
  public type Key = {
    id : Text;
    owner : Text;
    site : Text;
    name : Text;
    scope : { #read; #manage; #share };
    expiresAt : Int;
  };
  public type Annotation = { id : Text; site : Text; at : Int; text : Text };
  public type ImportRow = {
    id : Text;
    site : Text;
    day : Int;
    dimension : Text;
    value : Text;
    metrics : Metrics;
  };
  public type AuthState = {
    var hubId : Text;
    sessions : Map.Map<Text, Hub.Session>;
    people : Map.Map<Text, Hub.ConnectorUser>;
    ids : Map.Map<Text, Text>;
    former : Map.Map<Text, Hub.ConnectorUser>;
  };
  public type Lease = { var at : Int; var epoch : Nat; var pulling : Bool };
  public type User = {
    id : Text;
    email : Text;
    displayName : Text;
    role : Text;
  };
  public type Store = {
    sites : Map.Map<Text, Site>;
    retired : Map.Map<Text, Bool>;
    events : Map.Map<Text, Event>;
    eventIds : Map.Map<Text, Text>;
    goals : Map.Map<Text, Goal>;
    keys : Map.Map<Text, Key>;
    annotations : Map.Map<Text, Annotation>;
    imports : Map.Map<Text, ImportRow>;
    var collectors : [Principal];
    var accepted : Nat;
    var duplicates : Nat;
    var rejected : Nat;
    var cleanupAfter : ?Text;
    var importCleanupAfter : ?Text;
    var eventBytes : Nat;
  };
  public type NativeState = { var saltDay : Int; var salt : Blob; var nextOrder : Nat; var rateMinute : Int; rates : Map.Map<Text,Nat>; var rateTotal : Nat; var lastAccepted : Int };
  public type HttpRequest = { method : Text; url : Text; headers : [(Text,Text)]; body : Blob; certificate_version : ?Nat16 };
  public type HttpResponse = { status_code : Nat16; headers : [(Text,Text)]; body : Blob; upgrade : ?Bool; streaming_strategy : ?{ #Callback : { callback : shared query Text -> async { body : Blob; token : ?Text }; token : Text } } };

};
