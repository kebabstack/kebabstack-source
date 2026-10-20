import G "../trafficTypes";
import T "../types";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Char "mo:core/Char";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Blob "mo:core/Blob";
module {
 public let maximum:Nat=340282366920938463463374607431768211455;
 public func kind(k:G.Kind):Text{switch k{case(#geo)"geo";case(#network)"network";case(#hosting)"hosting"}};
 func v4(t:Text):?Nat{let parts=t.split(#char '.').toArray();if(parts.size()!=4)return null;var n=0;for(p in parts.values()){if(p.size()==0 or p.size() > 3 or not p.chars().all(func c=c>='0' and c<='9'))return null;let v=p.toNat() ?? (return null);if(v > 255)return null;n:=n*256+v};?n};
 func hex(n:Nat):Text{if(n < 16)return ["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"][n];hex(n/16)#hex(n%16)};
 func groups(t:Text):?[Nat]{if(t=="")return ?[];let ps=t.split(#char ':').toArray();var out:[Nat]=[];for(p in ps.values()){if(p.size()==0 or p.size() > 4)return null;var n=0;for(c in p.chars()){let d=if(c>='0' and c<='9')c.toNat32()-48 else if(c>='a' and c<='f')c.toNat32()-87 else return null;n:=n*16+d.toNat()};out:=out.concat([n])};?out};
 func ipv6(t:Text):?Nat{let halves=t.split(#text "::").toArray();if(halves.size() > 2)return null;let left=groups(halves[0]) ?? (return null);let right=if(halves.size()==2)groups(halves[1]) ?? (return null) else [];if((halves.size()==1 and left.size()!=8) or (halves.size()==2 and left.size()+right.size()>=8))return null;var n=0;for(v in left.values())n:=n*65536+v;if(halves.size()==2){var missing=8-left.size()-right.size();while(missing > 0){n*=65536;missing-=1}};for(v in right.values())n:=n*65536+v;?n};
 public func address(t:Text):?Nat{if(not t.contains(#char ':'))return do ? {281470681743360+v4(t)!};if(t.size() > 45)return null;let value=t.toLower();if(value.contains(#char '.')){let parts=value.split(#char ':').toArray();let n=v4(parts[parts.size()-1]) ?? (return null);let prefix=parts.values().take(parts.size()-1).join(":");return ipv6(prefix#":"#hex(n/65536)#":"#hex(n%65536))};ipv6(value)};
 public func number(bytes:[Nat8],offset:Nat,length:Nat):Nat{var n=0;var i=offset;while(i < offset+length){n:=n*256+bytes[i].toNat();i+=1};n};
 public func lookup(state:G.State,k:G.Kind,ip:Nat,now:Int):?(G.Value,Text){let d=state.active.get(kind(k)) ?? (return null);if(now>=d.manifest.expiresAt)return null;let (_,chunk)=d.chunks.entriesFrom(maximum-ip).next() ?? (return null);if(ip > chunk.last)return null;let bytes=chunk.data.toArray();var lo=0;var hi=bytes.size()/36;while(lo < hi){let mid=(lo+hi)/2;if(number(bytes,mid*36,16)<=ip)lo:=mid+1 else hi:=mid};if(lo==0)return null;let offset=(lo-1)*36;if(ip > number(bytes,offset+16,16))return null;let v=d.values.get(number(bytes,offset+32,4)) ?? (return null);?(v,d.manifest.source#" · "#d.manifest.id)};
 public func enrich(state:G.State,e:T.Event,ip:Text,now:Int):T.Event{
 let n=address(ip) ?? (return e);let geo=lookup(state,#geo,n,now);let net=lookup(state,#network,n,now);let host=lookup(state,#hosting,n,now);
 let old=e.context ?? ({screen="";automation=false;asn="";network="";hosting=false;geoSource="";networkSource="";hostingSource=""});
 {e with country=switch geo{case(?(v,_))v.country;case null ""};region=switch geo{case(?(v,_))v.region;case null ""};city=switch geo{case(?(v,_))v.city;case null ""};context=?{old with asn=switch net{case(?(v,_))v.asn;case null ""};network=switch net{case(?(v,_))v.network;case null ""};hosting=host!=null;geoSource=switch geo{case(?(_,s))s;case null ""};networkSource=switch net{case(?(_,s))s;case null ""};hostingSource=switch host{case(?(_,s))s;case null ""}}}
 };
};
