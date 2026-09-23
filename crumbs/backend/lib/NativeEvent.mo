import T "../types";
import H "HttpUtil";
import V "Validation";
import Channels "Channels";
import Json "mo:json";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import List "mo:core/List";
module {
  public func bot(ua : Text) : Bool { let t=ua.toLower();["bot","spider","crawler","headlesschrome","curl/","wget/","python-requests"].values().any(func x=t.contains(#text x)) };
  public func normalize(j : H.J, site : T.Site, ua : Text, visitor : Text, now : Int, order : Nat) : T.Result<?T.Event> {
    switch j {case (#object_(_)) {};case _ return #err(#invalid("Event must be an object"))};
    if(not H.textFields(j,["id","site","domain","d","url","u","referrer","r","kind","name","n","currency"]) or not H.boolFields(j,["interactive"]))return #err(#invalid("Invalid event field type"));
    let url=H.url(H.str(j,"url",H.str(j,"u",""))) ?? (return #err(#invalid("Invalid HTTP website URL")));
    if(url.hostname!=site.domain)return #err(#invalid("URL does not match the registered website"));
    let path=H.path(url.path) ?? (return #err(#invalid("Invalid URL encoding")));
    if(site.excludedPaths.values().any(func p=path.startsWith(#text p)))return #ok(null);
    let name=H.str(j,"name",H.str(j,"n",""));let kind=H.str(j,"kind",if(name=="pageview")"pageview" else "event");
    let k : {#pageview;#event;#engagement}=switch kind {case "pageview" #pageview;case "event" #event;case "engagement" #engagement;case _ return #err(#invalid("Unknown event kind"))};
    let id=H.str(j,"id","");if(not V.identifier(id))return #err(#invalid("A stable event id is required"));
    let props=List.empty<(Text,Text)>();
    switch(H.field(j,"props") ?? H.field(j,"p") ?? #object_([])){
      case (#object_(xs)) {
        if(xs.size() > 20)return #err(#invalid("Maximum 20 properties"));
        for((key,value)in xs.values()){
          if(not site.allowedProperties.values().any(func x=x==key) or props.values().any(func(x,_)=x==key))return #err(#invalid("Property not allowed or repeated"));
          let text=switch value {case (#string(t))t;case (#bool(v))if(v)"true" else "false";case (#number(_))Json.stringify(value,null);case _ return #err(#invalid("Property must be a string, number or boolean"))};props.add((key,H.clean(text,160)))
        }
      };case _ return #err(#invalid("Invalid properties"))
    };
    let revenue=H.num(j,"revenueMinor",0);let engagement=H.num(j,"engagementMs",0);let scroll=H.num(j,"scrollDepth",0);
    if(revenue < 0 or revenue > 1_000_000_000_000 or engagement < 0 or engagement > 3_600_000 or scroll < 0 or scroll > 100)return #err(#invalid("Invalid measurement"));
    var source="";switch(H.url(H.str(j,"referrer",H.str(j,"r","")))){case (?r){if(r.hostname!=site.domain)source:=r.hostname};case null {}};
    for(key in ["source","ref","utm_source"].values()){let value=H.clean(H.param(url.queryString,key),160);if(value!="")source:=value};
    if(Channels.spam(source))return #ok(null);
    let browser=if(ua.contains(#text "Edg/"))"Edge" else if(ua.contains(#text "OPR/"))"Opera" else if(ua.contains(#text "Firefox/"))"Firefox" else if(ua.contains(#text "Chrome/") or ua.contains(#text "CriOS/"))"Chrome" else if(ua.contains(#text "Safari/"))"Safari" else "Other";
    let os=if(ua.contains(#text "Android"))"Android" else if(["iPhone","iPad","iPod"].values().any(func x=ua.contains(#text x)))"iOS" else if(ua.contains(#text "Windows"))"Windows" else if(ua.contains(#text "Macintosh"))"macOS" else if(ua.contains(#text "Linux"))"Linux" else "Other";
    let device=if(ua.contains(#text "iPad") or ua.contains(#text "Tablet"))"Tablet" else if(["Mobi","iPhone","Android"].values().any(func x=ua.contains(#text x)))"Mobile" else "Desktop";
    let event : T.Event={id;site=site.id;visitor;at=now;order;kind=k;path;hostname=url.hostname;source;medium=H.clean(H.param(url.queryString,"utm_medium"),160);campaign=H.clean(H.param(url.queryString,"utm_campaign"),160);content=H.clean(H.param(url.queryString,"utm_content"),160);term=H.clean(H.param(url.queryString,"utm_term"),160);country="";region="";city="";browser;os;device;name=if(k== #event)H.clean(name,160) else "";props=props.toArray();interactive=H.bool(j,"interactive",true);revenueMinor=if(k== #event)revenue else 0;currency=if(k== #event)H.str(j,"currency","") else "";engagementMs=if(k== #engagement)Int.abs(engagement) else 0;scrollDepth=if(k== #engagement)Int.abs(scroll) else 0};
    switch(V.event(event,site,now)){case (?e)#err(#invalid(e));case null #ok(?event)}
  };
};
