import T "../types";
import A "../lib/Auth";
import Hub "mo:motoko";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Time "mo:core/Time";

mixin (auth : T.AuthState, lease : T.Lease, db : T.Store, access : Map.Map<Text, T.SiteAccess>) {
  func accessManager(token : Text, site : Text) : ?T.User {
    let u = A.user(auth, lease, token) ??(return null);
    if (not A.manages(A.personRole(auth, db, access, u.id, site))) return null;
    ?u;
  };
  func accessView(site : Text) : T.AccessView {
    let old = db.sites.get(site);
    let p = access.get(site);
    let saved = p ?? ({revision = 0; readers = switch old {case (?s) s.viewers; case null []}; managers = []; updatedBy = ""; updatedAt = 0});
    ({site; revision = saved.revision; readers = saved.readers.map(func id = A.person(auth, id)); managers = saved.managers.map(func id = A.person(auth, id)); legacyAllReaders = p == null and saved.readers.size() == 0; updatedBy = saved.updatedBy; updatedAt = saved.updatedAt});
  };
  public query func getSiteAccess(token : Text, site : Text) : async T.Result<T.AccessView> {
    ignore accessManager(token, site) ??(return #err(#unauthorized));
    #ok(accessView(site));
  };
  public query func accessPeople(token : Text, site : Text, search : Text) : async T.Result<{people : [T.AccessPerson]; truncated : Bool}> {
    ignore accessManager(token, site) ??(return #err(#unauthorized));
    if (search.size() > 100) return #err(#invalid("Search is limited to 100 characters"));
    let q = search.toLower();
    let rows = auth.people.values().filter(func p = p.active and (q == "" or p.email.toLower().contains(#text q) or p.displayName.toLower().contains(#text q))).take(101).map(func p = A.person(auth, Hub.pidOf(auth.ids, p.email))).toArray();
    #ok({people = rows.values().take(100).toArray(); truncated = rows.size() > 100});
  };
  public shared func setSiteAccess(token : Text, site : Text, expectedRevision : Nat, readers : [Text], managers : [Text]) : async T.Result<T.AccessView> {
    let u = accessManager(token, site) ??(return #err(#unauthorized));
    let current = accessView(site);
    if (current.revision != expectedRevision) return #err(#conflict("Website access changed. Reload before saving."));
    if (readers.size() + managers.size() > 200) return #err(#invalid("At most 200 named website members"));
    let seen = Map.empty<Text, Bool>();
    for (id in readers.concat(managers).values()) {
      if (seen.containsKey(id)) return #err(#invalid("A person can have only one website role"));
      let p = A.person(auth, id);
      if (not p.eligible or p.automatic) return #err(#invalid("Choose an active Hub user with Crumbs Analyst access. Admins have automatic access."));
      seen.add(id, true);
    };
    access.add(site, {revision = current.revision + 1; readers; managers; updatedBy = u.id; updatedAt = Time.now() / 1_000_000_000});
    let config = db.sites.get(site) ??(return #err(#notFound));
    db.sites.add(site, {config with viewers = []});
    A.revokeUnmanagedKeys(auth, db, access);
    #ok(accessView(site));
  };
};
