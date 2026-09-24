// Synthetic interoperability fixture. No upstream implementation or real company data.
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
persistent actor {
  public type Member = { memberId : Text; firstName : Text; lastName : Text; email : Text; title : Text; departmentId : ?Text; managerId : ?Text; active : ?Bool; protected : ?Bool; version : ?Nat; erased : ?Bool; locale : ?Text; kind : ?Text; avatarHash : ?Text };
  // Extra test-only endpoint lets this local fixture receive the Hub lifecycle
  // feed as a registered Desk consumer. It is not part of the OpenTeam contract.
  public query func hub_manifest() : async { name : Text; version : Text; description : Text; needs : [Text]; wants : [Text] } {
    { name = "desk"; version = "test"; description = "Synthetic lifecycle consumer"; needs = ["identity"]; wants = [] };
  };
  var members : [Member] = [];
  var seq = 1;
  var mode = "ok";
  public shared ({ caller }) func configure(rows : [Member], behavior : Text) : async () { assert Principal.isController(caller); members := rows; mode := behavior; seq += 1 };
  public query func team_info() : async { name : Text; standard : Text; version : Text; memberCount : Nat; changeSeq : ?Nat; configSeq : ?Nat; leaseSeq : ?Nat } {
    if (mode == "offline") Runtime.trap("fixture unavailable");
    { name = "Synthetic OpenTeam"; standard = if (mode == "wrong") "other-directory" else "team-directory"; version = if (mode == "future") "3.0.0" else "2.35.0"; memberCount = members.size(); changeSeq = ?seq; configSeq = ?0; leaseSeq = ?0 };
  };
  public shared ({ caller }) func team_members_page(cursor : Nat, limit : Nat) : async { members : [Member]; next : ?Nat; total : Nat } {
    assert not Principal.isAnonymous(caller);
    if (mode == "changed") seq += 1;
    if (mode == "offline") Runtime.trap("fixture unavailable");
    let end = Nat.min(members.size(), cursor + Nat.min(limit, 200));
    let rows = if (cursor >= end or mode == "truncated") [] else Array.tabulate<Member>(end - cursor, func(i) { members[cursor + i] });
    { members = rows; next = if (mode == "cursor") ?cursor else if (mode == "truncated" or end == members.size()) null else ?end; total = members.size() };
  };
}
