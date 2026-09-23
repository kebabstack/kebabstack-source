import Map "mo:core/Map";
module {
  public type Input = { projectId : Nat; name : Text; service : Text; days : Nat };
  public type Source = { id : Nat; projectId : Nat; name : Text; service : Text; revision : Nat;
    requestKey : Text; createdBy : Text; createdAt : Int; enabled : Bool; revokedAt : Int;
    hash : Text; expiresAt : Int; previousHash : Text; previousUntil : Int;
    testedAt : Int; receivedAt : Int; accepted : Nat; rejected : Nat; lastError : Text };
  public type SourceView = { id : Nat; projectId : Nat; name : Text; service : Text; revision : Nat;
    createdAt : Int; enabled : Bool; revokedAt : Int; expiresAt : Int; previousUntil : Int;
    testedAt : Int; receivedAt : Int; accepted : Nat; rejected : Nat; lastError : Text };
  // No alert identifiers or event bodies are retained here. Digests outlive payload retention.
  public type Signal = { sourceId : Nat; incidentId : Nat; sequence : Nat; payloadHash : Text;
    condition : Text; occurredAt : Int; receivedAt : Int; expiresAt : Int; transitions : Nat };
  public type Monitoring = { sourceName : Text; condition : Text; occurredAt : Int; receivedAt : Int };
  public type Bucket = { at : Int; count : Nat };
  public type State = { sources : Map.Map<Nat, Source>; signals : Map.Map<Text, Signal>;
    rates : Map.Map<Nat, Bucket>; var nextSource : Nat };
  public type SecretResult = { #ok : { id : Nat; revision : Nat; secret : Text }; #err : Text };
  public type Request = { method : Text; url : Text; headers : [(Text, Text)]; body : Blob };
  public type Response = { status_code : Nat16; headers : [(Text, Text)]; body : Blob; upgrade : ?Bool };
  public func empty() : State = { sources = Map.empty(); signals = Map.empty(); rates = Map.empty(); var nextSource = 1 };
}
