persistent actor {
  var data : Text = "";
  public shared func put(value : Text) : async () { data := value };
  public query func get() : async Text { data };
  public query func hub_ping() : async Text { "fixture" };
  public query func hub_manifest() : async { version : Text } { { version = "1.0.0" } };
}
