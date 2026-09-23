import T "../types";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Char "mo:core/Char";

module {
  public func identifier(t : Text) : Bool {
    t.size() > 0 and t.size() <= 80 and t.chars().all(func c = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_' or c == '-')
  };
  public func hex(t : Text) : Bool {
    t.size() == 64 and t.chars().all(func c = (c >= 'a' and c <= 'f') or (c >= '0' and c <= '9'))
  };
  func safe(t : Text, n : Nat) : Bool {
    t.size() <= n and t.chars().all(func c = c >= ' ' and c != '\u{7f}')
  };
  public func site(s : T.Site) : ?Text {
    if (not identifier(s.id) or not safe(s.name, 100) or s.name == "") return ?"Invalid site id or name";
    if (s.domain.size() == 0 or s.domain.size() > 253 or s.domain != s.domain.toLower() or not s.domain.chars().all(func c = (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '.' or c == '-')) return ?"Use a lowercase hostname without protocol or port";
    if (s.retentionDays < 1 or s.retentionDays > 1827 or s.allowedProperties.size() > 20 or s.excludedPaths.size() > 50 or s.viewers.size() > 200 or s.timezone != "UTC") return ?"Use UTC; retention must be 1–1827 days and configuration within bounds";
    if (s.allowedProperties.values().any(func p = not identifier(p)) or s.excludedPaths.values().any(func p = not p.startsWith(#text "/") or not safe(p, 512))) return ?"Invalid property or exclusion";
    null;
  };
  public func event(e : T.Event, s : T.Site, now : Int) : ?Text {
    if (not s.enabled) return ?"Site is paused";
    if (not identifier(e.id) or not hex(e.visitor)) return ?"Invalid event or visitor id";
    if (e.at < now - 7 * 86400 or e.at > now + 60 or e.at < now - s.retentionDays * 86400) return ?"Event outside accepted time window";
    if (e.hostname != s.domain or not e.path.startsWith(#text "/") or not safe(e.path, 512) or e.path.contains(#char '?') or e.path.contains(#char '#')) return ?"Invalid hostname or unsanitized path";
    if (s.excludedPaths.values().any(func p = e.path.startsWith(#text p))) return ?"Excluded page";
    for (t in [e.source, e.medium, e.campaign, e.content, e.term, e.region, e.city, e.device, e.browser, e.os, e.name].values()) if (not safe(t, 160)) return ?"Invalid dimension";
    if (e.props.size() > 20 or e.props.values().any(func(k, v) = not s.allowedProperties.values().any(func p = k == p) or not safe(v, 160))) return ?"Property not allowed";
    if (e.country != "" and (e.country.size() != 2 or not e.country.chars().all(func c = c >= 'A' and c <= 'Z'))) return ?"Invalid country";
    if (e.currency != "" and (e.currency.size() != 3 or not e.currency.chars().all(func c = c >= 'A' and c <= 'Z'))) return ?"Invalid currency";
    if (e.order > 18_446_744_073_709_551_615 or e.revenueMinor < 0 or e.revenueMinor > 1_000_000_000_000 or (e.revenueMinor > 0 and e.currency == "") or e.engagementMs > 3_600_000 or e.scrollDepth > 100) return ?"Invalid measurement";
    if ((e.kind == #event and e.name == "") or (e.kind != #event and (e.revenueMinor != 0 or e.name != ""))) return ?"Invalid event kind";
    null;
  };
};
