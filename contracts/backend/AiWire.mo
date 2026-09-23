import Json "mo:json";
import List "mo:core/List";

/// Compact provider output avoids repeating JSON property names for every fact.
/// Expansion only changes the wire shape; main's evidence/access validation still applies.
module {
  public func fields(event : Json.Json, compact : Bool) : { #ok : [Json.Json]; #err : Text } {
    if (not compact) return #ok(switch (Json.get(event, "proposedFields")) { case (?#array(a)) a; case (_) [] });
    let rows = switch (Json.get(event, "fields")) { case (?#array(a)) a; case (_) return #err("compact fields must be an array") };
    if (rows.size() > 40) return #err("too many fields in one event");
    let out = List.empty<Json.Json>();
    for (row in rows.vals()) {
      let a = switch (row) { case (#array(a)) a; case (_) return #err("compact field must be a tuple") };
      if (a.size() != 4) return #err("compact field needs name, value, basis and evidence");
      let evidence = switch (a[3]) { case (#array(e)) e; case (_) return #err("compact evidence must be an array") };
      if (evidence.size() > 6) return #err("too many quotes for one field");
      let quotes = List.empty<Json.Json>();
      for (e in evidence.vals()) {
        let pair = switch (e) { case (#array(p)) p; case (_) return #err("compact quote must be a pair") };
        if (pair.size() != 2) return #err("compact quote needs part and text");
        quotes.add(#object_([("partId", pair[0]), ("quote", pair[1])]));
      };
      // Provider-facing names express decimal currency, never our internal cents storage.
      let field = switch (a[0]) { case (#string("amountDecimal")) #string("amountMinor"); case (#string("unitPriceDecimal")) #string("unitMinor"); case (_) a[0] };
      out.add(#object_([("field", field), ("value", a[1]), ("basis", a[2]), ("evidence", #array(quotes.toArray()))]));
    };
    #ok(out.toArray());
  };
}
