import T "../types";
import B "../businessTypes";
import A "../lib/Auth";
import Analytics "../lib/Analytics";
import V "../lib/Validation";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";

mixin(auth : T.AuthState, lease : T.Lease, db : T.Store, siteAccess : Map.Map<Text,T.SiteAccess>, business : B.State) {
  public query func savedReports(token : Text, site : Text) : async T.Result<[B.SavedReport]> {
    if(not A.permit(auth,lease,db,siteAccess,token,site,false)) return #err(#unauthorized);
    #ok(business.reports.values().filter(func r = r.site == site).toArray());
  };
  public shared func saveReport(token : Text, item : B.SavedReport) : async T.Result<B.SavedReport> {
    if(not A.permit(auth,lease,db,siteAccess,token,item.site,true)) return #err(#unauthorized);
    let site = db.sites.get(item.site) ?? (return #err(#notFound));
    if(not V.identifier(item.id) or item.name == "" or item.name.size() > 100 or item.filters.size() > 10 or item.steps.size() > 10 or item.steps.size() == 1) return #err(#invalid("Name, filters or funnel steps are invalid"));
    var filterChars = 0;
    for(f in item.filters.values()) for(v in f.values.values()) filterChars += v.size();
    if(filterChars > 8192) return #err(#capacity("Saved filters exceed 8192 characters"));
    for(f in item.filters.values()) if(not Analytics.validDimension(f.dimension,site) or f.values.size() == 0 or f.values.size() > 50 or f.values.values().any(func v = v.size() > 512)) return #err(#invalid("Invalid saved filter"));
    for(s in item.steps.values()) if(s.value == "" or s.value.size() > 512 or (s.kind == #page and not s.value.startsWith(#text "/"))) return #err(#invalid("Invalid funnel step"));
    let key = item.site # ":" # item.id;
    let revision = switch(business.reports.get(key)){case (?r) r.revision;case null 0};
    if(revision != item.revision) return #err(#conflict("This saved report changed. Reload and try again."));
    if(revision == 0 and business.reports.size() >= 2000) return #err(#capacity("2000 saved reports per deployment"));
    if(revision == 0 and business.reports.values().filter(func r = r.site == item.site).size() >= 100) return #err(#capacity("100 saved reports per website"));
    let saved = {item with revision=revision+1; updatedAt=Analytics.now()}; business.reports.add(key,saved); #ok(saved);
  };
  public shared func deleteReport(token : Text, site : Text, id : Text, revision : Nat) : async T.Result<()> {
    if(not A.permit(auth,lease,db,siteAccess,token,site,true)) return #err(#unauthorized);
    let key=site # ":" # id; let item=business.reports.get(key) ?? (return #err(#notFound));
    if(item.revision != revision) return #err(#conflict("This saved report changed. Reload first."));
    business.reports.remove(key); #ok;
  };
  public query func searchConnection(token : Text, site : Text) : async T.Result<B.Connection> {
    if(not A.permit(auth,lease,db,siteAccess,token,site,true)) return #err(#unauthorized);
    #ok(business.connections.get(site) ?? ({clientId="";property="";revision=0}));
  };
  public shared func saveSearchConnection(token : Text, site : Text, config : B.Connection) : async T.Result<B.Connection> {
    if(not A.permit(auth,lease,db,siteAccess,token,site,true)) return #err(#unauthorized);
    let s=db.sites.get(site) ?? (return #err(#notFound));
    let revision=switch(business.connections.get(site)){case (?c)c.revision;case null 0};
    if(config.revision != revision) return #err(#conflict("Connection changed. Reload first."));
    if(config.clientId != "" and (config.clientId.size() > 200 or not config.clientId.endsWith(#text ".apps.googleusercontent.com") or not config.clientId.chars().all(func c = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '.' or c == '-'))) return #err(#invalid("Use a Google web application client ID"));
    if(config.property != "" and config.property != "sc-domain:" # s.domain and config.property != "https://" # s.domain # "/") return #err(#invalid("Choose the exact website domain or HTTPS URL-prefix property"));
    if((config.clientId == "") != (config.property == "")) return #err(#invalid("Set both a client ID and property, or clear both to disconnect"));
    let saved={config with revision=revision+1}; business.connections.add(site,saved);
    business.search.remove(site); #ok(saved);
  };
  public query func searchSnapshot(token : Text, site : Text) : async T.Result<?B.SearchSnapshot> {
    if(not A.permit(auth,lease,db,siteAccess,token,site,false)) return #err(#unauthorized);
    let s=db.sites.get(site) ?? (return #err(#notFound));
    let snapshot=business.search.get(site);
    switch(snapshot){case (?r) {if(r.from < Analytics.now()-s.retentionDays*86400) #ok(null) else #ok(?r)};case null #ok(null)};
  };
  public shared func saveSearchSnapshot(token : Text, revision : Nat, snapshot : B.SearchSnapshot) : async T.Result<()> {
    if(not A.permit(auth,lease,db,siteAccess,token,snapshot.site,true)) return #err(#unauthorized);
    let site=db.sites.get(snapshot.site) ?? (return #err(#notFound));
    let config=business.connections.get(snapshot.site) ?? (return #err(#invalid("Connect Search Console first")));
    if(config.revision != revision or config.clientId == "" or config.property == "" or config.property != snapshot.property) return #err(#conflict("The Search Console connection changed"));
    if(snapshot.from < Analytics.now()-site.retentionDays*86400 or snapshot.until <= snapshot.from or snapshot.until-snapshot.from > 366*86400 or snapshot.until > Analytics.now()+86400 or snapshot.queries.size() > 1000 or snapshot.pages.size() > 1000) return #err(#invalid("Search report interval or size is invalid"));
    for(row in [snapshot.totals].values().concat(snapshot.queries.values()).concat(snapshot.pages.values())) {
      if(row.value.size() > 512 or row.value.contains(#char '@') or row.clicks > 1_000_000_000_000 or row.impressions > 1_000_000_000_000 or row.positionMilli > 1_000_000_000 or not row.value.chars().all(func c = c >= ' ' and c != '\u{7f}')) return #err(#invalid("Search data exceeds bounds or contains a personal identifier"));
    };
    for(row in snapshot.pages.values()) if(not row.value.startsWith(#text "/") or row.value.contains(#char '?') or row.value.contains(#char '#')) return #err(#invalid("Search page paths must be normalized"));
    business.search.add(snapshot.site,{snapshot with fetchedAt=Analytics.now()}); #ok;
  };
  func cleanBusiness() {
    for((key,r) in business.reports.toArray().values()) if(not db.sites.containsKey(r.site)) business.reports.remove(key);
    for((key,_) in business.connections.toArray().values()) if(not db.sites.containsKey(key)) business.connections.remove(key);
    for((key,r) in business.search.toArray().values()) switch(db.sites.get(key)){case null business.search.remove(key);case (?s) if(r.from < Analytics.now()-s.retentionDays*86400) business.search.remove(key)};
  };
};
