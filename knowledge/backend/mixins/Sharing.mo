import T "../types";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Char "mo:core/Char";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Blob "mo:core/Blob";
import Sha256 "mo:sha2/Sha256";

mixin (documents : T.State, shares : T.ShareState, user : Text -> ?T.User, codeFor : (Nat, Int) -> Text) {
  func mayShare(tok : Text) : ?T.User {
    let u = user(tok) ?? (return null);
    if (u.role == "reviewer" or u.role == "admin") ?u else null
  };
  func hash(b : Blob) : Blob = Sha256.fromBlob(#sha256, b);
  func active(s : T.Share) : Bool = s.revokedAt == null and (switch (s.expiresAt) { case null true; case (?at) Time.now() < at });
  func lookup(code : Text) : ?T.Share {
    if (code.size() != 32) return null;
    let id = shares.byHash.get(hash(Text.encodeUtf8(code))) ?? (return null);
    let s = shares.links.get(id) ?? (return null);
    if (active(s)) ?s else null
  };
  func shareView(s : T.Share) : T.ShareView = { id = s.id; article = s.article; revision = s.revision; name = s.name; passwordProtected = s.password != null; createdAt = s.createdAt; expiresAt = s.expiresAt; revokedAt = s.revokedAt; code = codeFor(s.id, s.createdAt) };
  public shared query func shareLinks(tok : Text, article : Nat) : async [T.ShareView] {
    if (mayShare(tok) == null) return [];
    (shares.byArticle.get(article) ?? []).filterMap(func id = shares.links.get(id)).map(shareView)
  };
  public shared func createShare(tok : Text, input : T.ShareInput) : async { #ok : T.ShareView; #err : Text } {
    let u = mayShare(tok) ?? (return #err("Reviewer access required"));
    if (input.requestId.size() < 16 or input.requestId.size() > 100) return #err("Invalid request identifier");
    let name = Text.trim(input.name, #predicate(Char.isWhitespace));
    if (name.size() < 1 or name.size() > 80) return #err("Name this link using 1–80 characters");
    switch (input.days) { case (?days) if (days < 1 or days > 3650) return #err("Choose 1–3,650 days or no expiry"); case null {} };
    switch (input.password) { case (?p) if (p.salt.size() != 16 or p.verifier.size() != 32) return #err("Invalid password protection"); case null {} };
    let key = u.id # ":" # input.requestId;
    switch (shares.requests.get(key)) {
      case (?id) {
        let s = shares.links.get(id) ?? (return #err("Stored link unavailable"));
        if (s.article != input.article or s.revision != input.revision or s.name != name or s.days != input.days or s.password != input.password) return #err("Request identifier was already used for another link");
        return #ok(shareView(s))
      };
      case null {}
    };
    if ((documents.versions.get(input.article) ?? []).find(func v = v.revision == input.revision) == null) return #err("Published version unavailable");
    let previous = shares.byArticle.get(input.article) ?? [];
    if (previous.size() >= 100 or shares.links.size() >= 10000) return #err("Sharing pilot limit reached: 100 links per article, 10,000 in total");
    let now = Time.now(); let id = shares.next; let code = codeFor(id, now);
    if (code.size() != 32 or shares.byHash.containsKey(hash(Text.encodeUtf8(code)))) return #err("Could not prepare a unique link. Retry.");
    let s : T.Share = { id; article = input.article; revision = input.revision; name; days = input.days; password = input.password; createdBy = u.id; createdAt = now; expiresAt = switch (input.days) { case (?days) ?(now + days * 86_400_000_000_000); case null null }; revokedAt = null };
    shares.next += 1; shares.links.add(id, s); shares.byArticle.add(input.article, previous.concat([id]));
    shares.byHash.add(hash(Text.encodeUtf8(code)), id); shares.requests.add(key, id);
    #ok(shareView(s))
  };
  public shared func revokeShare(tok : Text, id : Nat) : async T.Outcome {
    if (mayShare(tok) == null) return #err("Reviewer access required");
    let s = shares.links.get(id) ?? (return #err("Link unavailable"));
    if (s.revokedAt == null) shares.links.add(id, { s with revokedAt = ?Time.now() });
    shares.failures.remove(id); #ok(id)
  };
  // Intentionally anonymous, capability-scoped update methods. No company session
  // is accepted here, and protected titles/body/history/source are never metadata.
  public shared func sharedInfo(code : Text) : async ?{ salt : ?Blob; iterations : Nat; expiresAt : ?Int } {
    let s = lookup(code) ?? (return null);
    ?{ salt = switch (s.password) { case (?p) ?p.salt; case null null }; iterations = 600000; expiresAt = s.expiresAt }
  };
  public shared func readShared(code : Text, proof : Blob) : async {
    #ok : { title : Text; document : Text; revision : Nat; publishedAt : Int; expiresAt : ?Int };
    #err : { kind : Text; retryAfterSeconds : Nat }
  } {
    let s = lookup(code) ?? (return #err({ kind = "unavailable"; retryAfterSeconds = 0 }));
    if (proof.size() > 32) return #err({ kind = "password"; retryAfterSeconds = 0 });
    switch (s.password) {
      case (?p) {
        let now = Time.now(); let minute = 60_000_000_000;
        let f = switch (shares.failures.get(s.id)) { case (?f) if (now < f.since + minute) f else ({ since = now; count = 0 }); case null ({ since = now; count = 0 }) };
        if (f.count >= 10) return #err({ kind = "rateLimited"; retryAfterSeconds = Int.abs((f.since + minute - now) / 1_000_000_000) + 1 });
        if (proof.size() != 32 or hash(proof) != p.verifier) {
          shares.failures.add(s.id, { f with count = f.count + 1 });
          return #err({ kind = "password"; retryAfterSeconds = 0 })
        };
        shares.failures.remove(s.id)
      };
      case null {}
    };
    let v = (documents.versions.get(s.article) ?? []).find(func v = v.revision == s.revision) ?? (return #err({ kind = "unavailable"; retryAfterSeconds = 0 }));
    #ok({ title = v.title; document = v.document; revision = v.revision; publishedAt = v.publishedAt; expiresAt = s.expiresAt })
  };
};
