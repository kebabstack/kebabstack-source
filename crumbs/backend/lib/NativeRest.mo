import T "../types";
import H "HttpUtil";
import J "HttpJson";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Analytics "Analytics";
module {
  type Json=H.J;
  type Response=(Nat16,Json);
  public type Health={accepted:Nat;duplicates:Nat;rejected:Nat;storedEvents:Nat;storageChargeBytes:Nat;collectors:[Text];directoryAt:Int};
  public type Api=actor {
    listSites : shared query Text -> async [T.SiteView];
    saveSite : shared (Text,T.Site) -> async T.Result<T.Site>;
    deleteSite : shared (Text,Text) -> async T.Result<()>;
    getSiteAccess : shared query (Text,Text) -> async T.Result<T.AccessView>;
    accessPeople : shared query (Text,Text,Text) -> async T.Result<{people:[T.AccessPerson];truncated:Bool}>;
    setSiteAccess : shared (Text,Text,Nat,[Text],[Text]) -> async T.Result<T.AccessView>;
    report : shared query (Text,T.ReportRequest) -> async T.Result<T.Report>;
    funnel : shared query (Text,T.ReportRequest,[T.FunnelStep]) -> async T.Result<[Nat]>;
    journeys : shared query (Text,T.ReportRequest) -> async T.Result<[(Text,Text,Nat)]>;
    goalReport : shared query (Text,T.ReportRequest,Text) -> async T.Result<{visitors:Nat;completions:Nat;revenue:[(Text,Int)]}>;
    goals : shared query (Text,Text) -> async T.Result<[T.Goal]>;
    saveGoal : shared (Text,T.Goal) -> async T.Result<()>;
    deleteGoal : shared (Text,Text,Text) -> async T.Result<()>;
    listKeys : shared query Text -> async T.Result<[T.Key]>;
    createKey : shared (Text,Text,Text,{#read;#manage;#share},Nat) -> async T.Result<{token:Text;key:T.Key}>;
    revokeKey : shared (Text,Text) -> async T.Result<()>;
    annotations : shared query (Text,Text) -> async T.Result<[T.Annotation]>;
    saveAnnotation : shared (Text,T.Annotation) -> async T.Result<()>;
    exportEvents : shared query (Text,Text,Text,Nat) -> async T.Result<{events:[T.Event];cursor:Text}>;
    health : shared query Text -> async T.Result<Health>;
    imported : shared query (Text,Text,Int,Int) -> async T.Result<[T.ImportRow]>;
    importAggregates : shared (Text,[T.ImportRow]) -> async T.Result<Nat>;
  };
  func invalid(message:Text):Response {H.error(#invalid(message))};
  func wrap<V>(r:T.Result<V>, encode:V->Json):Response {switch r {case (#ok(v))(200,encode(v));case (#err(e))H.error(e)}};
  func unit(_:()):Json {#null_};
  func request(j:Json):?T.ReportRequest {
    let from=H.num(j,"from",-1);let until=H.num(j,"until",-1);let limit=H.num(j,"limit",100);
    if(from < 0 or until<=from or limit < 1 or limit > 1000)return null;
    switch(H.field(j,"filters")){case null {};case (?#array(_)) {};case _ return null};
    let filters=List.empty<T.Filter>();for(f in H.array(j,"filters").values()){
      if(H.field(f,"values")==null or not H.textFields(f,["dimension"]) or not H.textArrays(f,["values"]) or not H.boolFields(f,["exclude"]))return null;
      filters.add({dimension=H.str(f,"dimension","");values=H.strings(f,"values");exclude=H.bool(f,"exclude",false)})
    };
    ?{site=H.str(j,"site","");from;until;limit=Int.abs(limit);dimension=H.str(j,"dimension","");filters=filters.toArray()}
  };
  func natField(j:Json,key:Text):?Nat {let n=H.num(j,key,-1);if(n < 0)null else ?Int.abs(n)};
  func metric(j:Json):?T.Metrics {
    let rev=List.empty<(Text,Int)>();for(v in H.array(j,"revenue").values()){switch v {case (#array(xs)){if(xs.size()!=2)return null;let c=switch(xs[0]){case (#string(s))s;case _ return null};let amount=H.num(#object_([("v",xs[1])]),"v",-1);if(amount < 0)return null;rev.add((c,amount))};case _ return null}};
    ?{visitors=natField(j,"visitors") ?? (return null);visits=natField(j,"visits") ?? (return null);pageviews=natField(j,"pageviews") ?? (return null);events=natField(j,"events") ?? (return null);bounces=natField(j,"bounces") ?? (return null);durationSeconds=natField(j,"durationSeconds") ?? (return null);engagementMs=natField(j,"engagementMs") ?? (return null);scrollDepthSum=natField(j,"scrollDepthSum") ?? (return null);scrollSamples=natField(j,"scrollSamples") ?? (return null);revenue=rev.toArray()}
  };
  public func route(api:Api,method:Text,path:Text,queryString:Text,token:Text,body:Json):async Response {
    if(method=="POST" or method=="PUT"){
      if(path!="/api/v1/imports"){
        switch body {case (#object_(_)) {};case _ return invalid("Expected a JSON object")};
        if(not H.textFields(body,["id","site","name","domain","timezone","dimension","scope","kind","value","text"]) or not H.textArrays(body,["allowedProperties","excludedPaths","viewers","readers","managers"]) or not H.boolFields(body,["enabled"]))return invalid("Invalid request field type")
      }
    };
    if(token=="")return (401,#object_([("error",#string("Bearer token required"))]));
    if(path=="/api/v1/sites" and method=="GET")return (200,#array((await api.listSites(token)).map(J.siteView)));
    if(path=="/api/v1/sites" and method=="POST"){
      let days=natField(body,"retentionDays") ?? (if(H.field(body,"retentionDays")==null)365 else return invalid("Invalid retentionDays"));
      let site:T.Site={id=H.str(body,"id","");name=H.str(body,"name","");domain=H.str(body,"domain","");timezone=H.str(body,"timezone","UTC");retentionDays=days;enabled=H.bool(body,"enabled",true);allowedProperties=H.strings(body,"allowedProperties");excludedPaths=H.strings(body,"excludedPaths");viewers=H.strings(body,"viewers")};return wrap(await api.saveSite(token,site),J.site)
    };
    let parts=path.split(#char '/').toArray();
    if(parts.size()>=5 and parts[1]=="api" and parts[2]=="v1" and parts[3]=="sites"){
      let site=H.decode(parts[4],false) ?? (return invalid("Invalid site id"));
      if(parts.size()==5 and method=="DELETE")return wrap(await api.deleteSite(token,site),unit);
      if(parts.size()==6){
        if(parts[5]=="access" and method=="GET")return wrap(await api.getSiteAccess(token,site),J.access);
        if(parts[5]=="people" and method=="GET")return wrap(await api.accessPeople(token,site,H.param(queryString,"search")),func(v:{people:[T.AccessPerson];truncated:Bool}):Json{#object_([("people",#array(v.people.map(J.person))),("truncated",#bool(v.truncated))])});
        if(parts[5]=="access" and method=="PUT"){
          let revision=natField(body,"revision") ?? (return invalid("revision is required"));
          for(k in ["readers","managers"].values())switch(H.field(body,k)){case (?#array(xs)){if(not xs.values().all(func(v:Json):Bool{switch v {case (#string(_))true;case _ false}}))return invalid("Member IDs must be strings")};case _ return invalid("readers and managers arrays are required")};
          return wrap(await api.setSiteAccess(token,site,revision,H.strings(body,"readers"),H.strings(body,"managers")),J.access)
        }
      }
    };
    if(method=="POST" and ["/api/v1/query","/api/v1/funnels","/api/v1/journeys"].values().any(func p=p==path)){
      let r=request(body) ?? (return invalid("Invalid report interval or filters"));
      if(path=="/api/v1/query")return wrap(await api.report(token,r),J.report);
      if(path=="/api/v1/journeys")return wrap(await api.journeys(token,r),func(xs:[(Text,Text,Nat)]):Json{#array(xs.map(func(a,b,n):Json{#array([#string(a),#string(b),H.jInt(n)])}))});
      let steps=List.empty<T.FunnelStep>();for(s in H.array(body,"steps").values()){let kind=switch(H.str(s,"kind","")){case "page" #page;case "event" #event;case _ return invalid("Invalid funnel step")};steps.add({kind;value=H.str(s,"value","")})};
      return wrap(await api.funnel(token,r,steps.toArray()),func(xs:[Nat]):Json{#array(xs.map(func(n:Nat):Json{H.jInt(n)}))})
    };
    if(path=="/api/v1/goals/report" and method=="POST"){
      let r=request(body) ?? (return invalid("Invalid report interval or filters"));
      return wrap(await api.goalReport(token,r,H.str(body,"id","")),func(x:{visitors:Nat;completions:Nat;revenue:[(Text,Int)]}):Json{#object_([("visitors",H.jInt(x.visitors)),("completions",H.jInt(x.completions)),("revenue",#array(x.revenue.map(func(c,v):Json{#array([#string(c),H.jInt(v)])})))])})
    };
    let site=H.param(queryString,"site");let id=H.param(queryString,"id");
    if(path=="/api/v1/goals"){
      if(method=="GET")return wrap(await api.goals(token,site),func(xs:[T.Goal]):Json{#array(xs.map(J.goal))});
      if(method=="DELETE")return wrap(await api.deleteGoal(token,site,id),unit);
      if(method=="POST"){let kind=switch(H.str(body,"kind","")){case "page" #page;case "event" #event;case "scroll" #scroll(natField(body,"scrollDepth") ?? (return invalid("scrollDepth is required")));case _ return invalid("Invalid goal kind")};return wrap(await api.saveGoal(token,{id=H.str(body,"id","");site=H.str(body,"site","");name=H.str(body,"name","");value=H.str(body,"value","");kind}),unit)}
    };
    if(path=="/api/v1/keys"){
      if(method=="GET")return wrap(await api.listKeys(token),func(xs:[T.Key]):Json{#array(xs.map(J.key))});
      if(method=="DELETE")return wrap(await api.revokeKey(token,id),unit);
      if(method=="POST"){
        let scope=switch(H.str(body,"scope","")){case "read" #read;case "manage" #manage;case "share" #share;case _ return invalid("Invalid key scope")};let days=natField(body,"days") ?? (return invalid("Invalid days"));
        return wrap(await api.createKey(token,H.str(body,"site",""),H.str(body,"name",""),scope,days),func(x:{token:Text;key:T.Key}):Json{#object_([("token",#string(x.token)),("key",J.key(x.key))])})
      }
    };
    if(path=="/api/v1/annotations"){
      if(method=="GET")return wrap(await api.annotations(token,site),func(xs:[T.Annotation]):Json{#array(xs.map(J.annotation))});
      if(method=="POST")return wrap(await api.saveAnnotation(token,{id=H.str(body,"id","");site=H.str(body,"site","");text=H.str(body,"text","");at=H.num(body,"at",-1)}),unit)
    };
    if(path=="/api/v1/export" and method=="GET"){
      let raw=H.param(queryString,"limit");let limit=if(raw=="")100 else Nat.fromText(raw) ?? (return invalid("Invalid limit"));
      return wrap(await api.exportEvents(token,site,H.param(queryString,"cursor"),limit),func(x:{events:[T.Event];cursor:Text}):Json{#object_([("events",#array(x.events.map(J.event))),("cursor",#string(x.cursor))])})
    };
    if(path=="/api/v1/health" and method=="GET")return wrap(await api.health(token),func(x:Health):Json{#object_([("accepted",H.jInt(x.accepted)),("duplicates",H.jInt(x.duplicates)),("rejected",H.jInt(x.rejected)),("storedEvents",H.jInt(x.storedEvents)),("storageChargeBytes",H.jInt(x.storageChargeBytes)),("collectors",#array(x.collectors.map(H.jText))),("directoryAt",H.jInt(x.directoryAt))])});
    if(path=="/api/v1/imports"){
      if(method=="GET")return wrap(await api.imported(token,site,Int.fromText(H.param(queryString,"from")) ?? 0,Int.fromText(H.param(queryString,"until")) ?? Analytics.now()),func(xs:[T.ImportRow]):Json{#array(xs.map(J.importRow))});
      if(method=="POST"){
        let rows=switch body {case (#array(xs))xs;case _ return invalid("Expected import rows")};let out=List.empty<T.ImportRow>();
        for(row in rows.values()){let metrics=metric(H.field(row,"metrics") ?? #null_) ?? (return invalid("Invalid metrics"));out.add({id=H.str(row,"id","");site=H.str(row,"site","");dimension=H.str(row,"dimension","");value=H.str(row,"value","");day=H.num(row,"day",-1);metrics})};
        return wrap(await api.importAggregates(token,out.toArray()),func(n:Nat):Json{H.jInt(n)})
      }
    };
    H.error(#notFound)
  }
};
