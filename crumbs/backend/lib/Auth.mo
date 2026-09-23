import Iter "mo:core/Iter";
import Array "mo:core/Array";
import T "../types";
import Hub "mo:motoko";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Map "mo:core/Map";
import SHA256 "mo:sha2/Sha256";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Nat "mo:core/Nat";
import Char "mo:core/Char";
import Nat32 "mo:core/Nat32";

module {
  public func hex(b : Blob) : Text {
    var out = "";
    for (v in b.toArray().values()) {
      let n = v.toNat();
      out #= digit(n / 16) # digit(n % 16);
    };
    out;
  };
  func digit(n : Nat) : Text {
    (if (n < 10) 48 + n else 87 + n).toNat32().toChar().toText();
  };
  public func hash(t : Text) : Text {
    hex(SHA256.fromBlob(#sha256, t.encodeUtf8()));
  };
  public func user(a : T.AuthState, l : T.Lease, token : Text) : ?T.User {
    if (not Hub.directoryFresh(l.at)) return null;
    let s = Hub.session(a.sessions, token) ??(return null);
    let role = Hub.appRole(a.people, s.email, "crumbs");
    if (role == "none") return null;
    ?{
      id = Hub.pidOf(a.ids, s.email);
      email = s.email;
      displayName = s.displayName;
      role;
    };
  };
  public func personRole(a : T.AuthState, db : T.Store, access : Map.Map<Text, T.SiteAccess>, id : Text, site : Text) : T.SiteRole {
    let s = db.sites.get(site) ??(return #none);
    let email = Hub.currentEmailOf(a.people, a.ids, id);
    // Check the stable ID as well: a reused email must not inherit old grants.
    if (email == "" or Hub.pidOf(a.ids, email) != id) return #none;
    let appRole = Hub.appRole(a.people, email, "crumbs");
    if (appRole == "admin") return #admin;
    if (appRole != "viewer") return #none;
    switch (access.get(site)) {
      case (?p) {
        if (p.managers.values().any(func x = x == id)) return #manage;
        if (p.readers.values().any(func x = x == id)) return #read;
      };
      case null { if (s.viewers.size() == 0 or s.viewers.values().any(func x = x == id)) return #read };
    };
    #none;
  };
  public func manages(role : T.SiteRole) : Bool { role == #manage or role == #admin };
  public func role(a : T.AuthState, l : T.Lease, db : T.Store, access : Map.Map<Text, T.SiteAccess>, token : Text, site : Text) : T.SiteRole {
    if (not Hub.directoryFresh(l.at)) return #none;
    switch (user(a, l, token)) {
      case (?u) return personRole(a, db, access, u.id, site);
      case null {};
    };
    if (token.size() != 64) return #none;
    let k = db.keys.get(hash(token)) ??(return #none);
    if (k.expiresAt <= Time.now() / 1_000_000_000 or k.site != site or not manages(personRole(a, db, access, k.owner, site))) return #none;
    if (k.scope == #manage) #manage else #read;
  };
  public func permit(a : T.AuthState, l : T.Lease, db : T.Store, access : Map.Map<Text, T.SiteAccess>, token : Text, site : Text, write : Bool) : Bool {
    let r = role(a, l, db, access, token, site);
    if (write) manages(r) else r != #none;
  };
  public func person(a : T.AuthState, id : Text) : T.AccessPerson {
    let p = Hub.personById(a.people, a.ids, a.former, id);
    let r = Hub.appRole(a.people, p.email, "crumbs");
    let eligible = p.active and Hub.pidOf(a.ids, p.email) == id and r != "none";
    ({ id; email = p.email; displayName = p.displayName; active = p.active; eligible; automatic = eligible and r == "admin" });
  };
  public func revokeUnmanagedKeys(a : T.AuthState, db : T.Store, access : Map.Map<Text, T.SiteAccess>) {
    for ((hash, k) in db.keys.toArray().values()) if (not manages(personRole(a, db, access, k.owner, k.site))) db.keys.remove(hash);
  };
};
