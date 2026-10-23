import Hub "mo:kebab-hub";
import K "mo:kebab-hub/Knowledge";
import T "types";
import Documents "mixins/Documents";
import Sharing "mixins/Sharing";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Principal "mo:core/Principal";
import Timer "mo:core/Timer";
import Time "mo:core/Time";

persistent actor Knowledge {
  transient let BUILD_VERSION : Text = "0.2.0";
  var hubId : Text = "";
  let sessions : Map.Map<Text, Hub.Session> = Map.empty();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty();
  let ids : Map.Map<Text, Text> = Map.empty();
  let former : Map.Map<Text, Hub.ConnectorUser> = Map.empty();
  let state : T.State = { articles = Map.empty(); versions = Map.empty(); proposals = Map.empty(); requests = Map.empty(); var nextArticle = 1; var nextProposal = 1 };
  let manualProposals : Map.Map<Nat, Bool> = Map.empty();
  let sharing : T.ShareState = { links = Map.empty(); byArticle = Map.empty(); byHash = Map.empty(); requests = Map.empty(); failures = Map.empty(); var next = 1 };
  var seed : ?Blob = null;
  var sequence = 0;
  transient var pulledAt : Int = 0;
  transient var epoch = 0;
  transient var pulling = false;
  transient let ic : actor { raw_rand : () -> async Blob } = actor "aaaaa-aa";
  func user(tok : Text) : ?T.User {
    if (not Hub.directoryFresh(pulledAt)) return null;
    let s = Hub.session(sessions, tok) ?? (return null);
    let role = Hub.appRole(people, s.email, "knowledge");
    if (not Hub.isActive(people, s.email) or role == "none") return null;
    ?{ id = Hub.pidOf(ids, s.email); email = s.email; displayName = s.displayName; role }
  };
  public shared ({ caller }) func setHub(id : Text) : async Bool {
    assert Principal.isController(caller);
    let p = Principal.fromText(id); assert not p.isAnonymous();
    // Existing content belongs to this directory. Never silently reassign it to another company.
    assert hubId == "" or hubId == p.toText();
    hubId := p.toText(); epoch += 1; pulledAt := 0; sessions.clear(); people.clear(); ids.clear(); former.clear(); true
  };
  func pullDirectory() : async Nat {
    if (hubId == "" or pulling) return 0;
    pulling := true;
    let expected = hubId; let start = Time.now(); let before = epoch;
    try {
      let rows = await (with timeout = 30) Hub.hub(expected).connectorDirectory();
      if (hubId != expected or epoch != before) return 0;
      let n = Hub.syncDirectory(people, ids, former, sessions, rows); pulledAt := start; n
    } finally { pulling := false }
  };
  type Login = { token : Text; suiteToken : Text };
  func establish(expected : Text, r : Hub.RedeemResult) : async ?Login {
    if (not r.ok or hubId != expected) return null;
    if (not Hub.directoryFresh(pulledAt) or not Hub.isActive(people, r.email) or Hub.appRole(people, r.email, "knowledge") == "none") { try { ignore await pullDirectory() } catch (_) {} };
    if (seed == null) { let value = await ic.raw_rand(); if (seed == null) seed := ?value };
    if (hubId != expected or not Hub.directoryFresh(pulledAt) or not Hub.isActive(people, r.email) or Hub.appRole(people, r.email, "knowledge") == "none") return null;
    sequence += 1; let token = Hub.deriveToken(seed ?? Blob.fromArray([]), sequence, Time.now());
    ignore Hub.mintSession(sessions, token, r.email, r.displayName, 8 * 3_600_000_000_000);
    ?{ token; suiteToken = r.suiteToken ?? "" }
  };
  public shared func loginWithTicket(ticket : Text) : async ?Login {
    if (hubId == "" or not Hub.ticketLooksValid(ticket)) return null;
    let expected = hubId; await establish(expected, await Hub.hub(expected).redeemTicket(ticket))
  };
  public shared func loginWithSuite(token : Text) : async ?Login {
    if (hubId == "" or not Hub.ticketLooksValid(token)) return null;
    let expected = hubId; await establish(expected, await Hub.hub(expected).redeemSuiteLogin(token))
  };
  public shared query func whoami(tok : Text) : async ?{ user : T.User; hubId : Text; version : Text } {
    let u = user(tok) ?? (return null); ?{ user = u; hubId; version = BUILD_VERSION }
  };
  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };
  public shared ({ caller }) func hub_upsert(rows : [Hub.DirectoryRow]) : async Nat {
    assert Hub.isHub(caller, hubId); epoch += 1; Hub.upsertRows(people, ids, former, sessions, rows)
  };
  public shared ({ caller }) func hub_deactivate(emails : [Text]) : async Nat {
    assert Hub.isHub(caller, hubId); epoch += 1; ignore Hub.endSessionsOf(sessions, emails); Hub.deactivate(people, emails)
  };
  public shared query func hub_ping() : async Text { "knowledge" };
  public shared query func hub_manifest() : async Hub.Manifest {
    { name = "knowledge"; version = BUILD_VERSION; description = "Doku: reviewed documentation with manual authoring and external version sharing"; needs = ["identity", "profile", "roles"]; wants = ["push", "avatars"] }
  };
  public shared ({ caller }) func hub_permissionStatus() : async Hub.PermissionStatus {
    assert Hub.isHub(caller, hubId); let expected = hubId;
    try { ignore await pullDirectory() } catch (_) {};
    assert hubId == expected and Hub.isHub(caller, hubId);
    { app = "knowledge"; model = 1; revision = Hub.permissionRevision(people, "knowledge"); directoryAt = pulledAt; legacy = []; legacyGroups = [] }
  };
  func evidence(tok : Text, desk : Nat, ticket : Nat) : async K.Result {
    let u = user(tok) ?? (return #err("Sign in again")); let expected = hubId;
    let broker : K.Broker = actor (expected);
    let result = try { await (with timeout = 20) broker.hub_knowledgeEvidence(u.id, desk, ticket) } catch (_) { return #err("Desk evidence unavailable. Please retry.") };
    if (hubId != expected or user(tok) != ?u) return #err("Access changed. Sign in again."); result
  };
  // A separate derivation domain prevents reuse of company session tokens.
  func shareCode(id : Nat, createdAt : Int) : Text {
    let raw = seed ?? (return "");
    let secret = Blob.fromArray(raw.toArray().concat(Text.encodeUtf8("doku-share-v1").toArray()));
    Text.fromIter(Hub.deriveToken(secret, id, createdAt).chars().take(32))
  };
  include Documents(state, manualProposals, user, evidence);
  include Sharing(state, sharing, user, shareCode);
  ignore Timer.recurringTimer<system>(#seconds 30, func () : async () { try { ignore await pullDirectory() } catch (_) {}; ignore Hub.pruneSessions(sessions) });
};
