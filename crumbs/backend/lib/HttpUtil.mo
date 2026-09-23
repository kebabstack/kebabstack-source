import T "../types";
import Hub "mo:motoko";
import Nat32 "mo:core/Nat32";
import Json "mo:json";
import Text "mo:core/Text";
import Char "mo:core/Char";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Blob "mo:core/Blob";
module {
  public type J = Json.Json;
  public func field(j : J, k : Text) : ?J { switch j { case (#object_(xs)) { for ((name,v) in xs.values()) if (name == k) return ?v; null }; case _ null } };
  public func str(j : J, k : Text, fallback : Text) : Text { switch (field(j,k)) { case (?#string(t)) t; case _ fallback } };
  public func num(j : J, k : Text, fallback : Int) : Int { switch(field(j,k)) { case (?#number(#int(n))) n; case (?#string(t)) Int.fromText(t) ?? -1; case null fallback; case _ -1 } };
  public func bool(j : J, k : Text, fallback : Bool) : Bool { switch(field(j,k)) {case (?#bool(v)) v; case _ fallback} };
  public func array(j : J, k : Text) : [J] { switch(field(j,k)) {case (?#array(v)) v;case _ []} };
  public func strings(j : J, k : Text) : [Text] { array(j,k).map(func(v : J) : Text {switch v {case (#string(t)) t;case _ ""}}) };
  public func jText(t : Text) : J { #string(t) };
  public func jInt(n : Int) : J { #string(n.toText()) };
  public func textFields(j:J,keys:[Text]):Bool {
    for(key in keys.values())switch(field(j,key)){case null {};case (?#string(_)) {};case _ return false};true
  };
  public func textArrays(j:J,keys:[Text]):Bool {
    for(key in keys.values())switch(field(j,key)){case null {};case (?#array(xs)){if(not xs.values().all(func(v:J):Bool{switch v {case (#string(_))true;case _ false}}))return false};case _ return false};true
  };
  public func boolFields(j:J,keys:[Text]):Bool {
    for(key in keys.values())switch(field(j,key)){case null {};case (?#bool(_)) {};case _ return false};true
  };
  public func serialize(j : J) : Text { Json.stringify(j,null) };
  public func parse(t : Text) : ?J {
    if(t.size() > 49_152)return null;
    var depth : Int=0;var quoted=false;var escape=false;
    for(c in t.chars()) {if(quoted){if(escape)escape:=false else if(c=='\\')escape:=true else if(c=='\"')quoted:=false} else {if(c=='\"')quoted:=true else if(c=='[' or c=='{'){depth+=1;if(depth > 16)return null} else if(c==']' or c=='}'){depth-=1;if(depth < 0)return null}}};
    if(depth!=0 or quoted)return null;
    switch(Json.parse(Hub.sanitizeSurrogates(t))){case (#ok(j)) ?j;case _ null}
  };
  public func clean(t : Text, limit : Nat) : Text {
    let value=Text.fromIter(t.chars().filter(func c = c >= ' ' and c != '\u{7f}').take(limit));
    if(value.contains(#char '@') or (value.size() > 18 and value.contains(#text "eyJ"))) "(redacted)" else value
  };
  func hex(c : Char) : ?Nat8 {let n=c.toNat32();if(n>=48 and n<=57)?Nat8.fromNat((n-48).toNat()) else if(n>=65 and n<=70)?Nat8.fromNat((n-55).toNat()) else if(n>=97 and n<=102)?Nat8.fromNat((n-87).toNat()) else null};
  public func decode(t : Text, plus : Bool) : ?Text {
    let input=t.encodeUtf8().toArray();let out=List.empty<Nat8>();var i=0;
    while(i < input.size()){if(input[i]==37){if(i+2>=input.size())return null;let a=hex(input[i+1].toNat().toNat32().toChar()) ?? (return null);let b=hex(input[i+2].toNat().toNat32().toChar()) ?? (return null);out.add(a*16+b);i+=3} else {out.add(if(plus and input[i]==43)(32 : Nat8) else input[i]);i+=1}};
    Blob.fromArray(out.toArray()).decodeUtf8()
  };
  public func path(raw : Text) : ?Text {
    let decoded=decode(raw,false) ?? (return null);
    let parts=decoded.split(#char '/').map(func(segment : Text) : Text {
      let digits=segment.size()>=5 and segment.chars().all(func c=c>='0' and c<='9');
      let uuid=segment.size()==36 and segment.chars().all(func c=hex(c)!=null or c=='-');
      if(segment.contains(#char '@')) ":email" else if(digits or uuid or (segment.size() > 18 and segment.contains(#text "eyJ"))) ":id" else segment
    });
    ?clean(parts.join("/").replace(#char '?',"_").replace(#char '#',"_"),512)
  };
  public type Url = { hostname : Text; path : Text; queryString : Text };
  public func url(value : Text) : ?Url {
    if(value.size() > 4096)return null;
    let rest= switch(value.stripStart(#text "https://")){case (?t)t;case null value.stripStart(#text "http://") ?? (return null)};
    let chars=rest.toArray();var at=0;while(at < chars.size() and chars[at]!='/' and chars[at]!='?' and chars[at]!='#')at+=1;
    let authority=Text.fromArray(chars.sliceToArray(0,at));if(authority.contains(#char '@') or authority=="")return null;
    let hp=authority.split(#char ':').toArray();if(hp.size() > 2 or (hp.size()==2 and Nat.fromText(hp[1])==null))return null;
    let hostname=hp[0].toLower();if(not hostname.chars().all(func c=(c>='a' and c<='z') or (c>='0' and c<='9') or c=='.' or c=='-'))return null;
    let tail=Text.fromArray(chars.sliceToArray(at,chars.size())).split(#char '#').next() ?? "";
    let pieces=tail.split(#char '?');let pathname=pieces.next() ?? "";
    ?{hostname;path=if(pathname=="")"/" else pathname;queryString=pieces.join("?")}
  };
  public func param(queryString : Text, key : Text) : Text {
    for(item in queryString.split(#char '&')){let pairs=item.split(#char '=');if((decode(pairs.next() ?? "",true) ?? "")==key)return decode(pairs.join("="),true) ?? ""};""
  };
  public func ip(value : Text) : Bool {
    if(value.size()==0 or value.size() > 45)return false;
    if(value.contains(#char ':'))return value.chars().all(func c=hex(c)!=null or c==':' or c=='.') and value.chars().filter(func c=c==':').size()>=2;
    let parts=value.split(#char '.').toArray();parts.size()==4 and parts.values().all(func p {switch(Nat.fromText(p)){case (?n)n<=255 and p.size() > 0 and p.size()<=3;case _ false}})
  };
  public func header(xs : [(Text,Text)], name : Text) : ?Text {
    var found : ?Text=null;for((k,v)in xs.values())if(k.toLower()==name){if(found!=null)return null;found:=?v};found
  };
  public func error(e : T.Error) : (Nat16,J) {
    let (status,code,message) : (Nat16,Text,Text)=switch e {case (#unauthorized)(403,"unauthorized","Access denied");case (#notFound)(404,"notFound","Not found");case (#invalid(t))(400,"invalid",t);case (#conflict(t))(409,"conflict",t);case (#capacity(t))(422,"capacity",t)};
    (status,#object_([("error",#string(code)),("message",#string(message))]))
  };
};
