import Map "mo:core/Map";
import Text "mo:core/Text";

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

  type NativeState = { var saltDay : Int; var salt : Blob; var nextOrder : Nat; var rateMinute : Int; rates : Map.Map<Text,Nat>; var rateTotal : Nat; var lastAccepted : Int };
  type NewStore = {
    sites : Map.Map<Text, Site>;
    retired : Map.Map<Text, Bool>;
    events : Map.Map<Text, Event>;
    eventIds : Map.Map<Text, Text>;
    goals : Map.Map<Text, NewGoal>;
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

  type NewGoal = {id:Text;site:Text;name:Text;value:Text;kind:{#event;#page;#scroll:Nat}};

  type SavedReport = { id : Text; site : Text; name : Text; filters : [Filter]; steps : [FunnelStep]; revision : Nat; updatedAt : Int };
  type SearchRow = { value : Text; clicks : Nat; impressions : Nat; positionMilli : Nat };
  type SearchSnapshot = { site : Text; property : Text; from : Int; until : Int; fetchedAt : Int; totals : SearchRow; queries : [SearchRow]; pages : [SearchRow]; truncated : Bool };
  type Connection = { clientId : Text; property : Text; revision : Nat };
  type State = { reports : Map.Map<Text, SavedReport>; search : Map.Map<Text,SearchSnapshot>; connections : Map.Map<Text,Connection> };

  type OldActor = {auth:AuthState;db:Store;siteAccess:Map.Map<Text,SiteAccess>;native:NativeState};
  type NewActor = {auth:AuthState;db:NewStore;siteAccess:Map.Map<Text,SiteAccess>;native:NativeState;business:State};
  public func migration(old:OldActor):NewActor {
    let goals = Map.empty<Text,NewGoal>();
    for((key,g) in old.db.goals.entries()) goals.add(key,{g with kind=g.kind});
    {auth=old.auth;siteAccess=old.siteAccess;native=old.native;business={reports=Map.empty();search=Map.empty();connections=Map.empty()};
      db={sites=old.db.sites;retired=old.db.retired;events=old.db.events;eventIds=old.db.eventIds;goals;keys=old.db.keys;annotations=old.db.annotations;imports=old.db.imports;
          var collectors=old.db.collectors;var accepted=old.db.accepted;var duplicates=old.db.duplicates;var rejected=old.db.rejected;var cleanupAfter=old.db.cleanupAfter;var importCleanupAfter=old.db.importCleanupAfter;var eventBytes=old.db.eventBytes}}
  };
};
