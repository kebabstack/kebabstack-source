import T "../types";
import A "../lib/Auth";
import Hub "mo:motoko";
import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import Blob "mo:core/Blob";

mixin (a : T.AuthState, lease : T.Lease, db : T.Store, siteAccess : Map.Map<Text, T.SiteAccess>, version : Text) {
  public shared ({ caller }) func setHub(id : Text) : async () {
    assert caller.isController();
    let p = Principal.fromText(id);
    assert not p.isAnonymous();
    a.hubId := p.toText();
    lease.epoch += 1;
    lease.at := 0;
    a.sessions.clear();
    db.keys.clear();
    // Local person IDs belong to one Hub trust domain. Rebinding closes all site grants.
    for ((id, _) in db.sites.entries()) siteAccess.add(id, {revision = (siteAccess.get(id) ?? ({revision = 0; readers = []; managers = []; updatedBy = ""; updatedAt = 0})).revision + 1; readers = []; managers = []; updatedBy = ""; updatedAt = Time.now() / 1_000_000_000});
    a.people.clear();
    a.ids.clear();
    a.former.clear();
  };
  public query func info() : async {
    name : Text;
    version : Text;
    hubId : Text;
    hubSet : Bool;
    orgName : Text;
  } {
    {
      name = "Crumbs";
      version;
      hubId = a.hubId;
      hubSet = a.hubId != "";
      orgName = "Website analytics";
    };
  };
  func pull() : async Nat {
    if (a.hubId == "" or lease.pulling) return 0;
    lease.pulling := true;
    let expected = a.hubId;
    let epoch = lease.epoch;
    let started = Time.now();
    try {
      let rows = await (with timeout = 30) Hub.hub(expected).connectorDirectory();
      if (a.hubId != expected or epoch != lease.epoch) return 0;
      let n = Hub.syncDirectory(a.people, a.ids, a.former, a.sessions, rows);
      lease.at := started;
      A.revokeUnmanagedKeys(a, db, siteAccess);
      n;
    } finally { lease.pulling := false };
  };
  public shared func loginWithTicket(ticket : Text) : async ?{
    token : Text;
    suiteToken : Text;
    role : Text;
    email : Text;
    displayName : Text;
  } {
    if (a.hubId == "" or not Hub.ticketLooksValid(ticket)) return null;
    let expected = a.hubId;
    let r = await (with timeout = 30) Hub.hub(expected).redeemTicket(ticket);
    if (not r.ok or expected != a.hubId) return null;
    if (not Hub.directoryFresh(lease.at) or Hub.appRole(a.people, r.email, "crumbs") == "none") {
      try { ignore await pull() } catch (_) {};
    };
    let ic : actor { raw_rand : () -> async Blob } = actor "aaaaa-aa";
    let token = A.hex(await (with timeout = 30) ic.raw_rand());
    let role = Hub.appRole(a.people, r.email, "crumbs");
    if (expected != a.hubId or not Hub.directoryFresh(lease.at) or role == "none") return null;
    ignore Hub.mintSession(a.sessions, token, r.email, r.displayName, 8 * 3_600_000_000_000);
    ?{
      token;
      suiteToken = r.suiteToken ??"";
      role;
      email = r.email;
      displayName = r.displayName;
    };
  };
  public query func whoami(token : Text) : async ?T.User {
    A.user(a, lease, token);
  };
  public shared func signOut(token : Text) : async () {
    Hub.endSession(a.sessions, token);
  };
  public shared ({ caller }) func hub_upsert(rows : [Hub.DirectoryRow]) : async Nat {
    assert a.hubId != "" and Hub.isHub(caller, a.hubId);
    lease.epoch += 1;
    let count = Hub.upsertRows(a.people, a.ids, a.former, a.sessions, rows);
    A.revokeUnmanagedKeys(a, db, siteAccess);
    count;
  };
  public shared ({ caller }) func hub_deactivate(emails : [Text]) : async Nat {
    assert a.hubId != "" and Hub.isHub(caller, a.hubId);
    lease.epoch += 1;
    ignore Hub.endSessionsOf(a.sessions, emails);
    let count = Hub.deactivate(a.people, emails);
    A.revokeUnmanagedKeys(a, db, siteAccess);
    count;
  };
  public query func hub_ping() : async Text { "crumbs" };
  public query func hub_manifest() : async Hub.Manifest {
    {
      name = "Crumbs";
      version;
      description = "Cookieless website analytics, events and reports";
      needs = ["identity"];
      wants = ["notify"];
    };
  };
  public shared ({ caller }) func hub_permissionStatus() : async Hub.PermissionStatus {
    assert a.hubId != "" and Hub.isHub(caller, a.hubId);
    try { ignore await pull() } catch (_) {};
    assert a.hubId != "" and Hub.isHub(caller, a.hubId);
    {
      app = "crumbs";
      model = 1;
      revision = Hub.permissionRevision(a.people, "crumbs");
      directoryAt = lease.at;
      legacy = [];
      legacyGroups = [];
    };
  };
  func startAuth<system>() {
  ignore Timer.recurringTimer<system>(
    #seconds 30,
    func() : async () {
      try { ignore await pull() } catch (_) {};
      ignore Hub.pruneSessions(a.sessions);
    },
  );
  };
};
