import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Set "mo:core/Set";
import T "../types";
module {
  public let version = "0.17.0";
  public let coinBonus = 50;
  public let maxProfiles = 20000;
  public let maxRuns = 5000;
  public let runTtl : Int = 7_200_000_000_000;
  public func validName(name : Text) : Bool {
    if (name.size() < 3 or name.size() > 20 or name.startsWith(#text " ") or name.endsWith(#text " ")) return false;
    for (c in name.chars()) if (not ((c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == ' ' or c == '.' or c == '_' or c == '-')) return false;
    true
  };
  public func validate(r : T.Run, s : T.Submission, now : Int) : ?Text {
    if (s.version != version and s.version != "0.16.0" and s.version != "0.16.1") return ?"This flight uses an old game version. Reload and fly again.";
    if (r.id != s.runId) return ?"This flight was replaced or already submitted.";
    if (now > r.startedAt + runTtl) return ?"Flight expired. Start a new run.";
    if (s.durationMs < 2000 or s.durationMs > 1_800_000) return ?"Flight duration is outside the arcade limits.";
    if (now + 2_500_000_000 < r.startedAt + s.durationMs * 1_000_000) return ?"Flight clock is ahead of the server.";
    if (s.meters > s.durationMs * 150 / 1000 + 2) return ?"Distance exceeds the flight speed limit.";
    if (s.coins.size() > 4000 or s.coins.size() > s.durationMs / 50) return ?"Too many coins for this flight.";
    let seen = Set.empty<Nat>();
    for (id in s.coins.values()) {
      if (seen.contains(id)) return ?"Duplicate coin.";
      seen.add(id);
      let coinDistance = (id / 21) * 200 + 50 + (id % 7) * 8;
      if (coinDistance > s.meters + 19) return ?"Coin was beyond the flight's reach.";
    };
    null
  };
  public func points(meters : Nat, coins : Nat) : Nat { meters + coins * coinBonus };
}
