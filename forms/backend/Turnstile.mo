import Text "mo:core/Text";
import Json "mo:json";
import Intake "Intake";

module {
  public type Config = { siteKey : Text; secret : Text; hostname : Text };
  type Header = { name : Text; value : Text };
  type Response = { status : Nat; headers : [Header]; body : Blob };
  type Request = {
    url : Text; method : { #post }; headers : [Header]; body : ?Blob; max_response_bytes : ?Nat64;
    transform : ?{ function : shared query { response : Response; context : Blob } -> async Response; context : Blob };
    is_replicated : ?Bool
  };

  public func verify(config : Config, token : Text, action : Text, binding : Text) : async* Bool {
    let ic : actor { http_request : Request -> async Response } = actor "aaaaa-aa";
    let body = Json.stringify(Json.obj([("secret", #string(config.secret)), ("response", #string token)]), null);
    try {
      let reply = await (with timeout = 30) ic.http_request({
        url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"; method = #post;
        headers = [{ name = "Content-Type"; value = "application/json" }];
        body = ?Text.encodeUtf8(body); max_response_bytes = ?4096; transform = null; is_replicated = ?false
      });
      if (reply.status != 200) return false;
      let response = Intake.parse(Text.decodeUtf8(reply.body) ?? "") ?? (return false);
      Json.get(response, "success") == ?#bool(true) and Intake.str(response, "hostname") == config.hostname
        and Intake.str(response, "action") == action and Intake.str(response, "cdata") == binding
    } catch (_) { false }
  };
}
