import Hub "mo:kebab-hub";
import Json "mo:json";
persistent actor {
  public query func sanitize(body : Text) : async Text { Hub.sanitizeSurrogates(body) };
  public query func parseRows(body : Text) : async ?Nat {
    switch (Json.parse(Hub.sanitizeSurrogates(body))) {
      case (#ok(#array(rows))) ?rows.size();
      case _ null;
    };
  };
};
