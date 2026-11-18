// Falcon returns full endpoint telemetry alongside the fields used by Desk.
// Walk the response once and decode only scalar values on supported paths.
import Array "mo:core/Array";
import Blob "mo:core/Blob";
import List "mo:core/List";
import Text "mo:core/Text";
import Json "mo:json";
import HubClient "../../sdk/motoko/src/lib";

module {
  type Scope = { #root; #resources; #alert; #device; #meta; #pagination; #tags; #errors; #string; #skip };

  func member(scope : Scope, key : Text) : Scope {
    switch (scope, key) {
      case (#root, "resources") #resources;
      case (#root, "access_token") #string;
      case (#root, "errors") #errors;
      case (#root, "meta") #meta;
      case (#meta, "pagination") #pagination;
      case (#pagination, "after") #string;
      case (#alert, "tags") #tags;
      case (#alert, "device") #device;
      case (#alert, "composite_id" or "updated_timestamp" or "display_name" or "name" or "cid" or "severity_name" or "status" or "falcon_host_link" or "user_principal" or "user_name") #string;
      case (#device, "hostname" or "serial_number") #string;
      case _ #skip;
    }
  };

  public func parse(body : Blob) : ?Json.Json {
    let bytes = Blob.toArray(body);
    let end = bytes.size();
    var pos = 0;
    func peek() : Nat8 = if (pos < end) bytes[pos] else 0;
    func space() { while (pos < end and (bytes[pos] == 32 or bytes[pos] == 9 or bytes[pos] == 10 or bytes[pos] == 13)) pos += 1 };
    func eat(c : Nat8) : Bool { if (pos == end or bytes[pos] != c) return false; pos += 1; true };
    func quoted(keep : Bool) : ?Text {
      let start = pos;
      if (not eat(34)) return null;
      var escaped = false;
      while (pos < end) {
        let c = bytes[pos]; pos += 1;
        if (c < 32) return null;
        if (escaped) escaped := false
        else if (c == 92) escaped := true
        else if (c == 34) {
          if (not keep) return ?"";
          let slice = Blob.fromArray(Array.tabulate<Nat8>(pos-start,func i = bytes[start+i]));
          let raw = switch (Text.decodeUtf8(slice)) { case (?s) s; case null return null };
          switch (Json.parse(HubClient.sanitizeSurrogates(raw))) { case (#ok(#string(s))) return ?s; case _ return null }
        }
      }; null
    };
    func value(scope : Scope, depth : Nat) : ?Json.Json {
      if (depth > 96) return null;
      space();
      switch (peek()) {
        case 123 {
          pos += 1; space();
          let fields = List.empty<(Text,Json.Json)>();
          if (eat(125)) return ?#object_([]);
          loop {
            let key = switch (quoted(scope != #skip)) { case (?s) s; case null return null };
            space(); if (not eat(58)) return null;
            let child = member(scope,key);
            let v = switch (value(child,depth+1)) { case (?v) v; case null return null };
            if (child != #skip) fields.add((key,v));
            space(); if (eat(125)) return ?#object_(fields.toArray());
            if (not eat(44)) return null; space()
          }
        };
        case 91 {
          pos += 1; space();
          let items = List.empty<Json.Json>();
          if (eat(93)) return ?#array([]);
          let child = switch scope { case (#resources) #alert; case (#tags) #string; case _ #skip };
          loop {
            let v = switch (value(child,depth+1)) { case (?v) v; case null return null };
            if (scope == #resources or (scope == #tags and (v == #string("true_positive") or v == #string("false_positive") or v == #string("ignored")))) items.add(v);
            if (scope == #errors and items.size() == 0) items.add(#null_);
            space(); if (eat(93)) return ?#array(items.toArray());
            if (not eat(44)) return null
          }
        };
        case 34 { switch (quoted(scope == #string)) { case (?s) ?#string(s); case null null } };
        case _ {
          let start = pos;
          label scalar while (pos < end) {
            switch (bytes[pos]) { case (9 or 10 or 13 or 32 or 44 or 93 or 125) break scalar; case _ pos += 1 }
          };
          if (pos == start) return null;
          // Only string scalars are consumed. Still require a valid JSON primitive.
          let raw = Blob.fromArray(Array.tabulate<Nat8>(pos-start, func i = bytes[start+i]));
          switch (Text.decodeUtf8(raw)) {
            case (?"true" or ?"false" or ?"null") ?#null_;
            case (?s) { switch (Json.parse(s)) { case (#ok(#number(_))) ?#null_; case _ null } };
            case null null
          }
        }
      }
    };
    let result = value(#root,0);
    space(); if (pos == end) result else null
  }
}
