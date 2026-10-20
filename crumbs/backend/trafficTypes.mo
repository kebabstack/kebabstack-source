import Map "mo:core/Map";
module {
 public type Kind={#geo;#network;#hosting};
 public type Value={country:Text;region:Text;city:Text;asn:Text;network:Text};
 public type Manifest={id:Text;kind:Kind;source:Text;publishedAt:Int;expiresAt:Int;rows:Nat;values:Nat};
 public type Chunk={last:Nat;data:Blob};
 public type Dataset={manifest:Manifest;chunks:Map.Map<Nat,Chunk>;values:Map.Map<Nat,Value>;var rows:Nat;var valueCount:Nat;var metadataBytes:Nat;var last:?Nat};
 public type State={active:Map.Map<Text,Dataset>;var pending:?Dataset};
 public type Context={screen:Text;automation:Bool;asn:Text;network:Text;hosting:Bool;geoSource:Text;networkSource:Text;hostingSource:Text};
};
