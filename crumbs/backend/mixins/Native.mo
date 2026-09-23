import T "../types";
import H "../lib/HttpUtil";
import E "../lib/NativeEvent";
import Hash "../lib/NativeHash";
import Ingest "../lib/Ingest";
import Analytics "../lib/Analytics";
import Rest "../lib/NativeRest";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Int "mo:core/Int";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Timer "mo:core/Timer";
import Principal "mo:core/Principal";
mixin(db:T.Store,native:T.NativeState,self:()->Principal) {
  transient var preparingSalt=false;
  func response(status:Nat16,body:H.J):T.HttpResponse {
    {status_code=status;body=if(status==204) "" else H.serialize(body).encodeUtf8();headers=(if(status==429 or status==503)[("Retry-After","60")] else []).concat([("Content-Type","application/json; charset=utf-8"),("Cache-Control","no-store"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Methods","GET, POST, PUT, DELETE, OPTIONS"),("Access-Control-Allow-Headers","Authorization, Content-Type"),("X-Content-Type-Options","nosniff")]);upgrade=null;streaming_strategy=null}
  };
  func accepted(count:Nat,duplicates:Nat,ignored:Nat):T.HttpResponse {
    response(202,#object_([("accepted",#number(#int(count))),("duplicates",#number(#int(duplicates))),("ignored",#number(#int(ignored))),("durability",#string("canister")),("delivery",#string("committed"))]))
  };
  func failure(e:T.Error):T.HttpResponse {let (status,body)=H.error(e);response(status,body)};
  func unavailable():T.HttpResponse {response(503,#object_([("error",#string("Collection temporarily unavailable; retry the same event IDs"))]))};
  func saltReady():Bool {native.saltDay==Analytics.now()/86400 and native.salt.size()==32};
  func prepareSalt():async () {
    if(saltReady() or preparingSalt)return;preparingSalt:=true;
    try{let ic:actor{raw_rand:()->async Blob}=actor "aaaaa-aa";let salt=await (with timeout=15) ic.raw_rand();if(salt.size()==32){native.salt:=salt;native.saltDay:=Analytics.now()/86400}}catch(_){};preparingSalt:=false
  };
  func startNative<system>() {
    ignore Timer.setTimer<system>(#seconds 0,prepareSalt);
    ignore Timer.recurringTimer<system>(#seconds 30,func():async(){
      if(native.rateMinute!=Analytics.now()/60){native.rates.clear();native.rateTotal:=0;native.rateMinute:=Analytics.now()/60};
      await prepareSalt()
    })
  };
  public query func http_request(_req:T.HttpRequest):async T.HttpResponse {
    // Dynamic responses take the verified update path; no raw-domain bypass is needed.
    {status_code=200;headers=[];body="";upgrade=?true;streaming_strategy=null}
  };
  public shared func http_request_update(req:T.HttpRequest):async T.HttpResponse {
    if(req.url.size() > 4096 or req.headers.size() > 64)return response(431,#object_([("error",#string("Request headers too large"))]));
    var headerSize=0;for((k,v)in req.headers.values())headerSize+=k.size()+v.size();if(headerSize > 16_384)return response(431,#object_([("error",#string("Request headers too large"))]));
    if(req.body.size() > 49_152)return response(413,#object_([("error",#string("Maximum body size is 48 KiB"))]));
    let pieces=req.url.split(#char '?');let path=pieces.next() ?? "";let queryString=pieces.join("?");
    if(req.method=="OPTIONS")return response(204,#null_);
    if(path=="/healthz" and req.method=="GET")return response(if(saltReady())200 else 503,#object_([("ok",#bool(saltReady())),("mode",#string("canister"))]));
    let body=if(req.body.size()==0)#object_([]) else H.parse(req.body.decodeUtf8() ?? (return failure(#invalid("Expected UTF-8 JSON")))) ?? (return failure(#invalid("Invalid JSON or nesting exceeds 16 levels")));
    if((path=="/api/v1/events" or path=="/api/event") and req.method=="POST"){
      let batch=switch body {case (#array(xs))xs;case (#object_(_))[body];case _ return failure(#invalid("Expected event or event array"))};
      if(batch.size()==0 or batch.size() > 50)return failure(#invalid("Send 1–50 events"));
      if(H.header(req.headers,"sec-gpc")== ?"1" or H.header(req.headers,"dnt")== ?"1")return accepted(0,0,batch.size());
      let ua=H.header(req.headers,"user-agent") ?? "";if(ua.size() > 1024)return failure(#invalid("User-Agent too long"));
      if(E.bot(ua))return accepted(0,0,batch.size());
      let ip=H.header(req.headers,"x-real-ip") ?? (return failure(#invalid("Gateway X-Real-IP is required")));
      if(not H.ip(ip))return failure(#invalid("Invalid gateway address"));
      if(not saltReady())await prepareSalt();if(not saltReady())return unavailable();
      let now=Analytics.now();let minute=now/60;if(native.rateMinute!=minute){native.rates.clear();native.rateMinute:=minute;native.rateTotal:=0};
      let rateKey=Hash.hmac(native.salt,"rate:"#ip);let prior=native.rates.get(rateKey) ?? 0;
      if(prior+batch.size() > 300 or native.rateTotal+batch.size() > 30_000 or (prior==0 and native.rates.size()>=5000))return response(429,#object_([("error",#string("Collection rate limit reached; retry later"))]));
      native.rates.add(rateKey,prior+batch.size());native.rateTotal+=batch.size();
      let pending=Map.empty<Text,T.Event>();let events=List.empty<T.Event>();var order=native.nextOrder;var ignored=0;
      for(raw in batch.values()){
        let id=H.str(raw,"site","");let domain=H.str(raw,"domain",H.str(raw,"d",""));
        let site=if(id!="")db.sites.get(id) ?? (return failure(#notFound)) else db.sites.values().find(func s=s.domain==domain) ?? (return failure(#notFound));
        if(not site.enabled)return failure(#invalid("Site is paused"));
        switch(H.header(req.headers,"origin")){case (?origin){let o=H.url(origin) ?? (return failure(#invalid("Invalid Origin")));if(o.hostname!=site.domain)return failure(#invalid("Origin does not match the website"))};case null {}};
        order+=1;let visitor=Hash.hmac(native.salt,H.serialize(#array([#string(site.id),#string(ip),#string(ua)])));
        let normalized=switch(E.normalize(raw,site,ua,visitor,now,order)){case (#err(e))return failure(e);case (#ok(null)){ignored+=1;continue};case (#ok(?e))e};
        let key=site.id#":"#normalized.id;
        let old=switch(pending.get(key)){case (?e)?e;case null switch(db.eventIds.get(key)){case (?k)db.events.get(k);case null null}};
        // Retries retain the first timestamp/order/visitor, including across midnight or IP changes.
        let event=switch old {case (?e){let retried={normalized with at=e.at;order=e.order;visitor=e.visitor};if(retried!=e)return failure(#conflict("Event id already used with different data"));e};case null normalized};
        pending.add(key,event);events.add(event)
      };
      if(events.size()==0)return accepted(0,0,ignored);
      switch(Ingest.commit(db,events.toArray())){
        case (#err(e))failure(e);
        case (#ok(r)){native.nextOrder:=order;if(r.accepted > 0)native.lastAccepted:=now;accepted(r.accepted,r.duplicates,ignored)}
      }
    } else {
      let auth=H.header(req.headers,"authorization") ?? "";let token=auth.stripStart(#text "Bearer ") ?? "";
      let api:Rest.Api=actor(self().toText());
      try{
        if(path=="/api/v1/collector-health" and req.method=="GET"){
          if(token=="")return response(401,#object_([("error",#string("Bearer token required"))]));
          switch(await api.health(token)){
            case (#err(e))return failure(e);
            case (#ok(_))return response(200,#object_([("mode",#string("canister")),("pending",#number(#int(0))),("rejected",#number(#int(db.rejected))),("oldestPendingAt",#null_),("lastSuccess",#number(#int(native.lastAccepted))),("lastError",#string(if(saltReady())"" else "Waiting for daily randomness"))]))
          }
        };
        let (status,json)=await Rest.route(api,req.method,path,queryString,token,body);response(status,json)}catch(_){unavailable()}
    }
  }
};
