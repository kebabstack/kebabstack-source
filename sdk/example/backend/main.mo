/// Minimal app wired to the kebab-stack hub. Copy, rename, build on.
/// Contract + sign-in + directory cache in ~90 lines; see sdk/README.md.
import Hub "mo:kebab-hub";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Principal "mo:core/Principal";
import Timer "mo:core/Timer";
import List "mo:core/List";
import Char "mo:core/Char";
import Nat32 "mo:core/Nat32";
import Nat "mo:core/Nat";
import Time "mo:core/Time";

persistent actor ExampleApp {
  // ---- persistent state: compatibility-check changes before upgrading ----
  var hubId : Text = "";                       // hub BACKEND canister id, set once via setHub
  var owner : ?Principal = null;               // controller who configured the app
  let sessions : Map.Map<Text, Hub.Session> = Map.empty<Text, Hub.Session>();
  let people : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>(); // key = current address
  let ids : Map.Map<Text, Text> = Map.empty<Text, Text>();                               // address -> person id (hub ≥ 0.17)
  let former : Map.Map<Text, Hub.ConnectorUser> = Map.empty<Text, Hub.ConnectorUser>();  // id -> last row of a person whose address moved on
  // YOUR data references people by id, never by address — e.g. notes : Map<pid, Text>
  let notes : Map.Map<Text, Text> = Map.empty<Text, Text>();

  transient var pulledAt : Int = 0;
  transient var epoch = 0;
  transient var pulling = false;

  type IC = actor { raw_rand : () -> async Blob };
  transient let ic00 : IC = actor "aaaaa-aa";

  // ---- bootstrap ----
  public shared ({ caller }) func setHub(id : Text) : async () {
    assert Principal.isController(caller);
    let p = Principal.fromText(id);
    assert not p.isAnonymous();
    owner := ?caller;
    hubId := p.toText();
    epoch += 1; pulledAt := 0; people.clear(); ids.clear(); former.clear(); sessions.clear();
  };

  // ---- sign-in lane: hub tile → #uht=<ticket> → loginWithTicket ----
  public shared func loginWithTicket(ticket : Text) : async ?Text {
    if (hubId == "" or not Hub.ticketLooksValid(ticket)) return null;
    let expectedHub = hubId;
    let r = await Hub.hub(expectedHub).redeemTicket(ticket);
    if (not r.ok or hubId != expectedHub) return null;
    if (not Hub.directoryFresh(pulledAt)) { try { ignore await pullDirectory() } catch (_) {} };
    let tok = hex(await ic00.raw_rand());     // 256 bits from the subnet's random tape
    if (hubId != expectedHub or not Hub.directoryFresh(pulledAt) or not Hub.isActive(people, r.email)) return null;
    ignore Hub.mintSession(sessions, tok, r.email, r.displayName, 8 * 3_600_000_000_000);
    ?tok;
  };

  /// Who am I — null when the session is gone OR the person was deactivated. `id` is what you store.
  public shared query func me(tok : Text) : async ?{ id : Text; email : Text; displayName : Text } {
    if (not Hub.directoryFresh(pulledAt)) return null;
    switch (Hub.session(sessions, tok)) {
      case (?s) { if (Hub.isActive(people, s.email)) ?{ id = Hub.pidOf(ids, s.email); email = s.email; displayName = s.displayName } else null };
      case null null;
    };
  };
  /// A note about a colleague — stored under their id, so it survives a rename and never lands on the address's next holder.
  public shared func setNote(tok : Text, aboutEmail : Text, text : Text) : async { ok : Bool; detail : Text } {
    if (not Hub.directoryFresh(pulledAt)) return { ok = false; detail = "directory lease expired" };
    switch (Hub.session(sessions, tok)) { case (?s) { if (not Hub.isActive(people, s.email)) return { ok = false; detail = "no session" } }; case null return { ok = false; detail = "no session" } };
    if (not Hub.isActive(people, aboutEmail)) return { ok = false; detail = "not an active colleague" };
    Map.add(notes, Text.compare, Hub.pidOf(ids, aboutEmail), text);
    { ok = true; detail = "" };
  };
  public shared query func notesView(tok : Text) : async [{ person : Hub.Person; text : Text }] {
    if (not Hub.directoryFresh(pulledAt)) return [];
    switch (Hub.session(sessions, tok)) { case null return []; case (?s) { if (not Hub.isActive(people, s.email)) return [] } };
    let out = List.empty<{ person : Hub.Person; text : Text }>();
    for ((pid, text) in Map.entries(notes)) List.add(out, { person = Hub.personById(people, ids, former, pid); text });
    List.toArray(out);
  };

  public shared func signOut(tok : Text) : async () { Hub.endSession(sessions, tok) };

  // ---- connector contract: the hub is the only caller ----
  public shared ({ caller }) func hub_upsert(rows : [Hub.DirectoryRow]) : async Nat {
    assert Hub.isHub(caller, hubId);
    epoch += 1;
    Hub.upsertRows(people, ids, former, sessions, rows); // same hand-over protection as the 30-s sync
  };
  public shared ({ caller }) func hub_deactivate(emails : [Text]) : async Nat {
    assert Hub.isHub(caller, hubId);
    epoch += 1;
    ignore Hub.endSessionsOf(sessions, emails);   // sessions die in the same call
    Hub.deactivate(people, emails);                // rows stay, flagged inactive
  };
  public shared query func hub_ping() : async Text { "example-app" };
  public shared query func hub_manifest() : async Hub.Manifest {
    { name = "Example app"; version = "0.4.0"; description = "Minimal app wired to the hub"; needs = ["identity"]; wants = ["avatars"] };
  };

  // ---- complete directory lease: absence revokes access; partial pushes do not renew it ----
  func pullDirectory() : async Nat {
    if (hubId == "" or pulling) return 0;
    pulling := true;
    let expectedHub = hubId; let started = Time.now(); let expectedEpoch = epoch;
    try {
      let rows = await (with timeout = 30) Hub.hub(expectedHub).connectorDirectory();
      if (hubId != expectedHub or epoch != expectedEpoch) return 0;
      let n = Hub.syncDirectory(people, ids, former, sessions, rows);
      pulledAt := started;
      n;
    } finally { pulling := false };
  };
  ignore Timer.recurringTimer<system>(#seconds 30, func() : async () { try { ignore await pullDirectory() } catch (_) {}; ignore Hub.pruneSessions(sessions) });

  /// Active colleagues for pickers/mentions (read-only view of the hub's truth).
  public shared query func activePeople(tok : Text) : async [Hub.ConnectorUser] {
    if (not Hub.directoryFresh(pulledAt)) return [];
    switch (Hub.session(sessions, tok)) { case null return []; case (?s) { if (not Hub.isActive(people, s.email)) return [] } };
    let out = List.empty<Hub.ConnectorUser>();
    for ((_, u) in Map.entries(people)) if (u.active) List.add(out, u);
    List.toArray(out);
  };

  // ---- helpers ----
  func hex(b : Blob) : Text {
    func digit(n : Nat) : Text = Char.toText(Nat32.toChar(Nat.toNat32(if (n < 10) 48 + n else 87 + n)));
    var t = "";
    for (x in Blob.toArray(b).vals()) { let n = Nat8.toNat(x); t #= digit(n / 16) # digit(n % 16) };
    t;
  };
};
