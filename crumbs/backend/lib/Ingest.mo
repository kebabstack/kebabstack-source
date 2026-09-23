import Text "mo:core/Text";
import T "../types";
import Map "mo:core/Map";
import V "Validation";
import Analytics "Analytics";

module {
  public func commit(db : T.Store, batch : [T.Event]) : T.Result<{ accepted : Nat; duplicates : Nat }> {
    if (batch.size() == 0 or batch.size() > 50) return #err(#invalid("Send 1–50 events"));
    let pending = Map.empty<Text, T.Event>();
    var duplicates = 0;
    let now = Analytics.now();
    for (e in batch.values()) {
      let site = db.sites.get(e.site) ??(return #err(#notFound));
      switch (V.event(e, site, now)) {
        case (?message) { db.rejected += 1; return #err(#invalid(message)) };
        case null {};
      };
      let id = e.site # ":" # e.id;
      let existing = switch (db.eventIds.get(id)) {
        case (?k) db.events.get(k);
        case null pending.get(id);
      };
      switch existing {
        case (?old) {
          if (old != e) return #err(#conflict("Event id already used with different data"));
          duplicates += 1;
        };
        case null pending.add(id, e);
      };
    };
    if (db.events.size() +pending.size() > 2_000_000) return #err(#capacity("Retention storage is full. Shorten retention or allocate another collector/backend."));
    var bytes = 0;
    for (e in pending.values()) bytes += Analytics.eventBytes(e);
    if (db.eventBytes + bytes > 268_435_456) return #err(#capacity("Event storage budget reached; shorten retention or partition websites"));
    db.eventBytes += bytes;
    for ((id, e) in pending.entries()) {
      let k = Analytics.key(e.site, e.at, Analytics.key("",e.order,e.id));
      db.events.add(k, e);
      db.eventIds.add(id, k);
    };
    db.accepted += pending.size();
    db.duplicates += duplicates;
    #ok({ accepted = pending.size(); duplicates });
  };
};
