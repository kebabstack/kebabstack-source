import Map "mo:core/Map";

module {
  type Session = {
    email : Text;
    displayName : Text;
    createdAt : Int;
    expiresAt : Int;
  };
  type ConnectorUser = {
    active : Bool;
    attributes : [(Text, Text)];
    displayName : Text;
    email : Text;
    externalId : Text;
    firstName : Text;
    lastName : Text;
    source : Text;
  };


  type Error = {
    #unauthorized;
    #notFound;
    #invalid : Text;
    #conflict : Text;
    #capacity : Text;
  };
  type Result<T> = { #ok : T; #err : Error };
  type Site = {
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
  type Event = {
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
  type Filter = { dimension : Text; values : [Text]; exclude : Bool };
  type ReportRequest = {
    site : Text;
    from : Int;
    until : Int;
    filters : [Filter];
    dimension : Text;
    limit : Nat;
  };
  type Metrics = {
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
  type Row = { value : Text; metrics : Metrics };
  type Report = {
    totals : Metrics;
    rows : [Row];
    scanned : Nat;
    truncated : Bool;
  };
  type Goal = {
    id : Text;
    site : Text;
    name : Text;
    kind : { #event; #page };
    value : Text;
  };
  type FunnelStep = { kind : { #event; #page }; value : Text };
  type Key = {
    id : Text;
    owner : Text;
    site : Text;
    name : Text;
    scope : { #read; #manage; #share };
    expiresAt : Int;
  };
  type Annotation = { id : Text; site : Text; at : Int; text : Text };
  type ImportRow = {
    id : Text;
    site : Text;
    day : Int;
    dimension : Text;
    value : Text;
    metrics : Metrics;
  };
  type AuthState = {
    var hubId : Text;
    sessions : Map.Map<Text, Session>;
    people : Map.Map<Text, ConnectorUser>;
    ids : Map.Map<Text, Text>;
    former : Map.Map<Text, ConnectorUser>;
  };
  type Lease = { var at : Int; var epoch : Nat; var pulling : Bool };
  type User = {
    id : Text;
    email : Text;
    displayName : Text;
    role : Text;
  };
  type Store = {
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
  type SiteAccess = { revision : Nat; readers : [Text]; managers : [Text]; updatedBy : Text; updatedAt : Int };
  type OldActor = { auth : AuthState; db : Store };
  type NewActor = { auth : AuthState; db : Store; siteAccess : Map.Map<Text, SiteAccess> };
  public func migration(old : OldActor) : NewActor {
    // Existing site visibility remains explicit legacy state until reviewed.
    { auth = old.auth; db = old.db; siteAccess = Map.empty() };
  };
};
