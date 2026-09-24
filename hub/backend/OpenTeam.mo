// Independently implemented read-only consumer of team-directory v2.
// The provider is owner-selected infrastructure, never a source of Hub roles.
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Time "mo:core/Time";

module {
  public type Info = { name : Text; standard : Text; version : Text; memberCount : Nat; changeSeq : ?Nat };
  public type Member = {
    memberId : Text; firstName : Text; lastName : Text; email : Text; title : Text;
    departmentId : ?Text; managerId : ?Text; active : ?Bool; erased : ?Bool; kind : ?Text;
  };
  public type Page = { members : [Member]; next : ?Nat; total : Nat };
  public type Provider = actor {
    team_info : shared query () -> async Info;
    team_members_page : shared query (Nat, Nat) -> async Page;
  };
  public type Snapshot = { info : Info; members : [Member] };
  public type Result = { #ok : Snapshot; #err : Text };
  public func supported(i : Info) : Bool {
    let v = Text.split(i.version, #char '.').toArray();
    if (i.name.size() > 200 or i.version.size() > 60 or i.standard != "team-directory" or v.size() != 3 or v[0] != "2" or i.changeSeq == null or i.memberCount > 10_000) return false;
    switch (Nat.fromText(v[1]), Nat.fromText(v[2])) { case (?minor, ?_) minor >= 29; case _ false };
  };
  func bounded(t : ?Text) : Bool { switch t { case null true; case (?s) s.size() <= 200 } };
  public func fetch(provider : Text) : async Result {
    let p : Provider = actor(provider);
    let started = Time.now();
    try {
      let info = await (with timeout = 30) p.team_info();
      if (not supported(info)) return #err("Requires team-directory 2.29+ (major 2), a change sequence and at most 10,000 records.");
      let rows = List.empty<Member>();
      let ids = Map.empty<Text, Bool>();
      let emails = Map.empty<Text, Bool>();
      var cursor = 0;
      var pages = 0;
      label paging loop {
        if (Time.now() - started > 120_000_000_000 or pages >= 100) return #err("Directory read exceeded its limit. No people changed; retry later.");
        let page = await (with timeout = 30) p.team_members_page(cursor, 200);
        pages += 1;
        if (page.total != info.memberCount or page.members.size() > 200 or rows.size() + page.members.size() > info.memberCount) return #err("Incomplete or changing directory. No people changed.");
        for (m in page.members.values()) {
          if (m.memberId == "" or m.memberId.size() > 200 or ids.containsKey(m.memberId)) return #err("Invalid or duplicate member ID. No people changed.");
          if (m.firstName.size() > 200 or m.lastName.size() > 200 or m.title.size() > 300 or m.email.size() > 254 or not bounded(m.departmentId) or not bounded(m.managerId)) return #err("A directory field exceeds its supported length.");
          if (m.erased != ?true) {
            if (m.active == null or (m.kind != ?"employee" and m.kind != ?"contractor" and m.kind != ?"partner" and m.kind != ?"agent")) return #err("A member has no explicit active status or a supported kind. No access was inferred.");
            // AI identities are never imported and may have no mailbox.
            if (m.kind != ?"agent") {
            let e = Text.toLower(Text.trim(m.email, #char ' '));
            let parts = Text.split(e, #char '@').toArray();
            if (parts.size() != 2 or parts[0] == "" or parts[1] == "" or Text.contains(e, #predicate(func(c) { c <= '\20' or c == '\7f' })) or emails.containsKey(e)) return #err("Invalid or duplicate email address. No people changed.");
            emails.add(e, true);
            };
          };
          ids.add(m.memberId, true);
          rows.add(m);
        };
        switch (page.next) {
          case null { if (rows.size() != info.memberCount) return #err("Directory ended before all records arrived. No people changed."); break paging };
          case (?next) { if (next <= cursor or next != rows.size() or page.members.size() == 0) return #err("Invalid directory cursor. No people changed."); cursor := next };
        };
      };
      let after = await (with timeout = 30) p.team_info();
      if (Time.now() - started > 120_000_000_000) return #err("Directory read exceeded two minutes. No people changed.");
      if (after != info) return #err("Directory changed while reading. Retry to review a consistent snapshot.");
      #ok({ info; members = rows.toArray() });
    } catch (_) { #err("OpenTeam could not be read. Check its canister ID, availability and roster-read permissions. Existing people are unchanged.") };
  };
}
