import G "../trafficTypes";
import T "../types";
import L "../lib/Traffic";
import V "../lib/Validation";
import Analytics "../lib/Analytics";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Blob "mo:core/Blob";
import Array "mo:core/Array";
import Nat8 "mo:core/Nat8";
import Principal "mo:core/Principal";
mixin(state:G.State){
 public shared({caller}) func beginTrafficDataset(m:G.Manifest):async T.Result<()>{
 if(not caller.isController())return #err(#unauthorized);
 if(not V.identifier(m.id) or m.source.size()==0 or m.source.size() > 160 or not m.source.chars().all(func c=c>=' ' and c!='\u{7f}') or m.rows==0 or m.rows > 10_000_000 or m.values==0 or m.values > 500_000 or m.publishedAt > Analytics.now() or m.expiresAt<=Analytics.now() or m.expiresAt-m.publishedAt > 93*86400)return #err(#invalid("Invalid dataset manifest or expired data"));
 switch(state.pending){case (?_)return #err(#conflict("Finish or cancel the pending dataset first"));case null {}};
 state.pending:=?{manifest=m;chunks=Map.empty();values=Map.empty();var rows=0;var valueCount=0;var metadataBytes=0;var last=null};#ok
 };
 public shared({caller}) func trafficDatasetValues(id:Text,offset:Nat,values:[G.Value]):async T.Result<Nat>{
 if(not caller.isController())return #err(#unauthorized);let d=state.pending ?? (return #err(#notFound));if(d.manifest.id!=id or offset!=d.valueCount)return #err(#conflict("Dataset or offset changed"));
 if(values.size()==0 or values.size() > 500 or offset+values.size() > d.manifest.values)return #err(#invalid("Invalid value batch"));
 var bytes=0;for(v in values.values()){bytes+=256;for(t in [v.country,v.region,v.city,v.asn,v.network].values())bytes+=4*t.size()};if(d.metadataBytes+bytes > 96_000_000)return #err(#capacity("Metadata storage budget exceeded"));
 for(v in values.values()){if(v.country!="" and (v.country.size()!=2 or not v.country.chars().all(func c=c>='A' and c<='Z')))return #err(#invalid("Invalid country"));for(t in [v.region,v.city,v.asn,v.network].values())if(t.size() > 160 or not t.chars().all(func c=c>=' ' and c!='\u{7f}'))return #err(#invalid("Invalid metadata"))};
 d.metadataBytes+=bytes;for(v in values.values()){d.values.add(d.valueCount,v);d.valueCount+=1};#ok(d.valueCount)
 };
 public shared({caller}) func trafficDatasetChunk(id:Text,offset:Nat,data:Blob):async T.Result<Nat>{
 if(not caller.isController())return #err(#unauthorized);let d=state.pending ?? (return #err(#notFound));if(d.manifest.id!=id or offset!=d.rows)return #err(#conflict("Dataset or offset changed"));
 if(d.valueCount!=d.manifest.values or data.size()==0 or data.size() > 36*16384 or data.size()%36!=0 or offset+data.size()/36 > d.manifest.rows)return #err(#invalid("Invalid chunk or incomplete metadata"));
 let bytes=data.toArray();var last=d.last;var i=0;while(i < bytes.size()){let start=L.number(bytes,i,16);let end=L.number(bytes,i+16,16);if(start > end or L.number(bytes,i+32,4)>=d.valueCount)return #err(#invalid("Invalid range or metadata index"));switch last{case(?v)if(start<=v)return #err(#invalid("Ranges must be sorted and disjoint"));case null {}};last:=?end;i+=36};
 // Validate the entire upload before committing any of its bounded lookup chunks.
 var pos=0;while(pos < bytes.size()){let size=Nat.min(36*1024,bytes.size()-pos);let packed=Blob.fromArray(Array.tabulate(size,func j {bytes[pos+j]}));d.chunks.add(L.maximum-L.number(bytes,pos,16),{last=L.number(bytes,pos+size-20,16);data=packed});pos+=size};d.last:=last;d.rows+=data.size()/36;#ok(d.rows)
 };
 public shared({caller}) func activateTrafficDataset(id:Text):async T.Result<()>{if(not caller.isController())return #err(#unauthorized);let d=state.pending ?? (return #err(#notFound));if(d.manifest.id!=id or d.rows!=d.manifest.rows or d.valueCount!=d.manifest.values or d.manifest.expiresAt<=Analytics.now())return #err(#invalid("Incomplete or expired dataset"));state.active.add(L.kind(d.manifest.kind),d);state.pending:=null;#ok};
 public shared({caller}) func cancelTrafficDataset(id:Text):async T.Result<()>{if(not caller.isController())return #err(#unauthorized);let d=state.pending ?? (return #err(#notFound));if(d.manifest.id!=id)return #err(#conflict("Dataset changed"));state.pending:=null;#ok};
 public query func trafficDatasets():async [G.Manifest]{state.active.values().map(func d=d.manifest).toArray()};
};
