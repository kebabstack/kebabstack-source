import T "../types";
import Channels "Channels";
import Map "mo:core/Map";
import Set "mo:core/Set";
import List "mo:core/List";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";

module {
  public let scanLimit : Nat = 100_000;
  public func now() : Int { Time.now() / 1_000_000_000 };
  public func key(site : Text, at : Int, id : Text) : Text {
    var t = at.toText();
    while (t.size() < 16) t := "0" # t;
    site # ":" # t # ":" # id;
  };
  public func dimension(e : T.Event, d : Text) : Text {
    switch d {
      case "" "all";
      case "path" e.path;
      case "hostname" e.hostname;
      case "source" e.source;
      case "channel" Channels.channel(e.source, e.medium);
      case "aiSource" Channels.ai(e.source);
      case "minute" ((e.at / 60) * 60).toText();
      case "medium" e.medium;
      case "campaign" e.campaign;
      case "content" e.content;
      case "term" e.term;
      case "country" e.country;
      case "region" e.region;
      case "city" e.city;
      case "device" e.device;
      case "browser" e.browser;
      case "os" e.os;
      case "event" e.name;
      case "day" ((e.at / 86400) * 86400).toText();
      case "hour" ((e.at / 3600) * 3600).toText();
      case _ {
        if (d.startsWith(#text "prop:")) {
          let p = d.split(#char ':').drop(1).join(":");
          for ((k, v) in e.props.values()) if (k == p) return v;
        };
        "";
      };
    };
  };
  public func validDimension(d : Text, site : T.Site) : Bool {
    if (["", "channel", "aiSource", "minute", "path", "hostname", "source", "medium", "campaign", "content", "term", "country", "region", "city", "device", "browser", "os", "event", "day", "hour", "entryPath", "exitPath"].values().any(func x = x == d)) return true;
    site.allowedProperties.values().any(func p = d == "prop:" # p);
  };
  public func matches(e : T.Event, filters : [T.Filter]) : Bool {
    filters.values().all(func f { let yes = f.values.values().any(func v = dimension(e, f.dimension) == v); if (f.exclude) not yes else yes });
  };
  public func load(db : T.Store, r : T.ReportRequest) : T.Result<[T.Event]> {
    let site = db.sites.get(r.site) ??(return #err(#notFound));
    if (r.from < 0 or r.until <= r.from or r.until - r.from > 1827 * 86400 or r.filters.size() > 10 or r.limit == 0 or r.limit > 1000) return #err(#invalid("Use a positive interval up to 1827 days, at most 10 filters and limit <= 1000"));
    if (not validDimension(r.dimension, site) or r.filters.values().any(func f = not validDimension(f.dimension, site) or f.values.size() == 0 or f.values.size() > 50)) return #err(#invalid("Unknown dimension or invalid filter"));
    let cutoff = now() - site.retentionDays * 86400;
    let start = Int.max(0, Int.max(cutoff, (r.from / 86400) * 86400));
    let out = List.empty<T.Event>();
    for ((_, e) in db.events.entriesFrom(key(r.site, start, ""))) {
      if (e.site != r.site or e.at >= r.until) break;
      if (out.size() >= scanLimit) return #err(#capacity("Report exceeds 100000 events. Narrow the interval; totals were not sampled."));
      out.add(e);
    };
    #ok(out.toArray());
  };
  type Session = {
    id : Nat;
    visitor : Text;
    first : T.Event;
    var last : Int;
    var views : Nat;
    var engaged : Bool;
    var entryPath : Text;
    var exitPath : Text;
    items : List.List<T.Event>;
  };
  func sessions(events : [T.Event]) : [Session] {
    let latest = Map.empty<Text, Session>();
    let out = List.empty<Session>();
    for (e in events.values()) {
      let previous = latest.get(e.visitor);
      if (e.kind == #engagement) {
        switch previous { case null continue; case (?s) { if (e.at - s.last >= 1800) continue } };
      };
      let s = switch previous {
        case (?s) {
          if (e.at - s.last < 1800) s else {
            let s : Session = {
              id = out.size();
              visitor = e.visitor;
              first = e;
              var last = e.at;
              var views = 0;
              var engaged = false;
              var entryPath = "";
              var exitPath = "";
              items = List.empty();
            };
            out.add(s);
            latest.add(e.visitor, s);
            s;
          };
        };
        case null {
          let s : Session = {
            id = out.size();
            visitor = e.visitor;
            first = e;
            var last = e.at;
            var views = 0;
            var engaged = false;
              var entryPath = "";
              var exitPath = "";
            items = List.empty();
          };
          out.add(s);
          latest.add(e.visitor, s);
          s;
        };
      };
      // Engagement does not extend sessions. It measures active time separately.
      if (e.kind != #engagement) s.last := e.at;
      if (e.kind == #pageview) { s.views += 1; if (s.entryPath == "") s.entryPath := e.path; s.exitPath := e.path };
      if (e.kind == #event and e.interactive) s.engaged := true;
      s.items.add(e);
    };
    out.toArray();
  };
  func sessionDimension(e : T.Event, s : Session, d : Text) : Text {
    if (d == "entryPath") return s.entryPath;
    if (d == "exitPath") return s.exitPath;
    if (["channel", "aiSource", "source", "medium", "campaign", "content", "term"].values().any(func x = x == d)) return dimension(s.first, d);
    dimension(e, d);
  };
  func sessionMatches(e : T.Event, s : Session, filters : [T.Filter]) : Bool {
    filters.values().all(func f { let yes = f.values.values().any(func v = sessionDimension(e, s, f.dimension) == v); if (f.exclude) not yes else yes });
  };
  // Conservative logical charge, not a measurement of Motoko heap usage.
  public func eventBytes(e : T.Event) : Nat {
    var size = 2048;
    for (t in [e.id,e.site,e.visitor,e.path,e.hostname,e.source,e.medium,e.campaign,e.content,e.term,e.country,e.region,e.city,e.device,e.browser,e.os,e.name,e.currency].values()) size += 4 * t.size();
    for ((k,v) in e.props.values()) size += 128 + 4 * (k.size() + v.size());
    size;
  };
  public func importDimension(d : Text) : Bool {
    ["visitors","sources","pages","entry_pages","exit_pages","custom_events","locations","devices","browsers","operating_systems"].values().any(func t = d == "import:" # t);
  };
  type Acc = {
    visitors : Set.Set<Text>;
    visits : Set.Set<Nat>;
    var views : Nat;
    var events : Nat;
    var bounces : Nat;
    var duration : Nat;
    var engagement : Nat;
    scroll : Map.Map<Text, Nat>;
    revenue : Map.Map<Text, Int>;
  };
  func empty() : Acc {
    {
      visitors = Set.empty();
      visits = Set.empty();
      var views = 0;
      var events = 0;
      var bounces = 0;
      var duration = 0;
      var engagement = 0;
      scroll = Map.empty();
      revenue = Map.empty();
    };
  };
  func add(a : Acc, e : T.Event, s : Session) {
    if (e.kind != #engagement) {
      a.visitors.add(e.visitor);
      if (not a.visits.contains(s.id)) {
        a.visits.add(s.id);
        if (s.views <= 1 and not s.engaged) a.bounces += 1;
        a.duration += (s.last - s.first.at).toNat();
      };
    };
    if (e.kind == #pageview) a.views += 1;
    if (e.kind == #event) a.events += 1;
    a.engagement += e.engagementMs;
    if (e.kind == #engagement) {
      let k = s.id.toText() # ":" # e.path;
      a.scroll.add(k, Nat.max(a.scroll.get(k) ??0, e.scrollDepth));
    };
    if (e.currency != "" and e.revenueMinor != 0) a.revenue.add(e.currency, (a.revenue.get(e.currency) ??0) + e.revenueMinor);
  };
  func freeze(a : Acc) : T.Metrics {
    var sum = 0;
    for (v in a.scroll.values()) sum += v;
    {
      visitors = a.visitors.size();
      visits = a.visits.size();
      pageviews = a.views;
      events = a.events;
      bounces = a.bounces;
      durationSeconds = a.duration;
      engagementMs = a.engagement;
      scrollDepthSum = sum;
      scrollSamples = a.scroll.size();
      revenue = a.revenue.toArray();
    };
  };
  public func report(db : T.Store, r : T.ReportRequest) : T.Result<T.Report> {
    let events = switch (load(db, r)) {
      case (#ok e) e;
      case (#err e) return #err(e);
    };
    let total = empty();
    let groups = Map.empty<Text, Acc>();
    for (s in sessions(events).values()) for (e in s.items.values()) {
      if (e.at < r.from or e.at >= r.until or not sessionMatches(e, s, r.filters)) continue;
      add(total, e, s);
      if (r.dimension != "") {
        let v = sessionDimension(e, s, r.dimension);
        let g = groups.get(v) ??{ let a = empty(); groups.add(v, a); a };
        add(g, e, s);
      };
    };
    let all : [T.Row] = groups.entries().map(func(v, a) { { value = v; metrics = freeze(a) } }).toArray();
    let sorted = all.sort(func(a, b) { if (r.dimension == "day" or r.dimension == "hour" or r.dimension == "minute") Text.compare(a.value, b.value) else if (a.metrics.visitors == b.metrics.visitors) Text.compare(a.value, b.value) else Nat.compare(b.metrics.visitors, a.metrics.visitors) });
    #ok({
      totals = freeze(total);
      rows = sorted.values().take(r.limit).toArray();
      scanned = events.size();
      truncated = sorted.size() > r.limit;
    });
  };
  public func goalReport(db : T.Store, r : T.ReportRequest, goal : T.Goal) : T.Result<{visitors : Nat; completions : Nat; revenue : [(Text,Int)]}> {
    if(goal.site != r.site) return #err(#invalid("Goal belongs to a different website"));
    let events = switch(load(db,r)) {case (#ok e) e; case (#err e) return #err(e)};
    let visitors = Set.empty<Text>(); let scrollVisits = Set.empty<Nat>(); let revenue = Map.empty<Text,Int>(); var completions = 0;
    for(s in sessions(events).values()) for(e in s.items.values()) {
      if(e.at < r.from or not sessionMatches(e,s,r.filters)) continue;
      let hit = switch(goal.kind) {
        case (#page) e.kind == #pageview and e.path == goal.value;
        case (#event) e.kind == #event and e.name == goal.value;
        case (#scroll threshold) e.kind == #engagement and e.path == goal.value and e.scrollDepth >= threshold and not scrollVisits.contains(s.id);
      };
      if(hit) {visitors.add(e.visitor); completions += 1; switch(goal.kind){case (#scroll _) scrollVisits.add(s.id);case _ {}}; if(e.revenueMinor != 0 and e.currency != "") revenue.add(e.currency,(revenue.get(e.currency) ?? 0)+e.revenueMinor)};
    };
    #ok({visitors=visitors.size();completions;revenue=revenue.toArray()});
  };
  public func funnel(db : T.Store, r : T.ReportRequest, steps : [T.FunnelStep]) : T.Result<[Nat]> {
    if (steps.size() < 2 or steps.size() > 10) return #err(#invalid("A funnel needs 2–10 steps"));
    let events = switch (load(db, r)) {
      case (#ok e) e;
      case (#err e) return #err(e);
    };
    let counts = Array.tabulate<Set.Set<Text>>(steps.size(), func _ = Set.empty());
    for (s in sessions(events).values()) {
      var pos = 0;
      for (e in s.items.values()) {
        if (e.at < r.from or not sessionMatches(e, s, r.filters) or pos >= steps.size()) continue;
        let step = steps[pos];
        if ((step.kind == #page and e.kind == #pageview and e.path == step.value) or (step.kind == #event and e.kind == #event and e.name == step.value)) {
          counts[pos].add(s.visitor);
          pos += 1;
        };
      };
    };
    #ok(counts.map(func c = c.size()));
  };
  public func journeys(db : T.Store, r : T.ReportRequest) : T.Result<[(Text, Text, Nat)]> {
    let events = switch (load(db, r)) {
      case (#ok e) e;
      case (#err e) return #err(e);
    };
    let links = Map.empty<Text, (Text, Text, Nat)>();
    for (s in sessions(events).values()) {
      var previous = "(entry)";
      for (e in s.items.values()) if (e.kind == #pageview and e.at >= r.from and sessionMatches(e, s, r.filters)) {
        let k = previous # "\u{1f}" # e.path;
        let n = switch (links.get(k)) { case (?(_, _, n)) n; case null 0 };
        links.add(k, (previous, e.path, n + 1));
        previous := e.path;
      };
      if (previous != "(entry)") {
        let k = previous # "\u{1f}(exit)";
        let n = switch (links.get(k)) { case (?(_, _, n)) n; case null 0 };
        links.add(k, (previous, "(exit)", n + 1));
      };
    };
    #ok(links.values().toArray().sort(func(a, b) = Nat.compare(b.2, a.2)).values().take(r.limit).toArray());
  };
};
