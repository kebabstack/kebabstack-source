import T "Types";
import O "../oncall/Types";
import P "../oncall/Planning";
import R "../response/Types";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Json "mo:json";
mixin (statusState:T.State,statusPlanning:O.State,statusResponse:R.State,statusAuth:Text->?O.Actor,statusMember:Text->Bool,statusAccess:(O.Actor,O.Project)->Bool,statusActive:Nat->Bool) {
 func statusStaff(tok:Text,id:Nat):?O.Actor {let a=statusAuth(tok)??(return null);let p=statusPlanning.projects.get(id)??(return null);if(not statusAccess(a,p))return null;?a};
 func statusCheckKey(id:Nat,service:Text):Text=id.toText()#":"#service;
 func statusExpiry(c:T.Config,n:T.Notice):Int=(if(n.phase==#scheduled or n.phase==#maintenance)Int.max(n.updatedAt,n.endsAt)else n.updatedAt)+c.retentionDays*P.day;
 func statusCurrent(c:T.Config,n:T.Notice):Bool=n.projectId==c.projectId and n.generation==c.generation and n.withdrawnAt==0 and statusExpiry(c,n) > Time.now();
 func statusPriority(n:T.PublicNotice):Nat=if(n.phase==#resolved)2 else if(n.phase==#scheduled and n.startsAt > Time.now())1 else 0;
 func statusPage(c:T.Config):T.Page {
  let notices=statusState.notices.values().toArray().filter(func n=statusCurrent(c,n)).sort(func(a,b)=Int.compare(b.updatedAt,a.updatedAt));
  let services=c.services.map(func name {
   let check=statusState.checks.get(statusCheckKey(c.projectId,name));var state=switch(check){case(?x)if(x.until > Time.now())"operational"else"unknown";case null "unknown"};
   for(n in notices.values())if(n.services.contains(name) and n.phase!=#resolved and (n.phase!=#scheduled or n.startsAt <= Time.now())){let impact=switch(n.impact){case(#outage)"outage";case(#degraded)"degraded";case(#maintenance)"maintenance"};if(state!="outage" and (state!="degraded" or impact=="outage"))state:=impact};
   {name;state;checkedAt=switch(check){case(?x)x.at;case null 0};validUntil=switch(check){case(?x)x.until;case null 0}}
  });
  {title=c.title;description=c.description;slug=c.slug;audience=c.audience;checkedAt=Time.now();services;notices=notices.map(func n:T.PublicNotice={id=n.id;title=n.title;services=n.services;phase=n.phase;impact=n.impact;startsAt=n.startsAt;endsAt=n.endsAt;updatedAt=n.updatedAt;updates=n.updates}).sort(func(a,b){let order=Nat.compare(statusPriority(a),statusPriority(b));if(order==#equal)Int.compare(b.updatedAt,a.updatedAt)else order})}
 };
 func statusPublic(slug:Text):?T.Page {let c=statusState.configs.values().toArray().find(func c=c.slug==slug and c.enabled and c.audience==#public_)??(return null);?statusPage(c)};
 public query func publicServiceStatus(slug:Text):async ?T.Page {statusPublic(slug)};
 public query func workspaceServiceStatus(tok:Text):async [T.Page] {if(not statusMember(tok))return [];statusState.configs.values().toArray().filter(func c=c.enabled).map(func c {let p=statusPage(c);{p with notices=p.notices.values().take(3).toArray().map(func n={n with updates=[n.updates[n.updates.size()-1]]})}})};
 public query func oncallStatus(tok:Text,id:Nat):async ?{config:?T.Config;notices:[T.Notice];page:?T.Page} {
  ignore statusStaff(tok,id)??(return null);let c=statusState.configs.get(id);?{config=c;notices=statusState.notices.values().toArray().filter(func n=n.projectId==id).sort(func(a,b)=Int.compare(b.updatedAt,a.updatedAt));page=switch(c){case(?x)?statusPage(x);case null null}}
 };
 public func setOncallStatus(tok:Text,id:Nat,revision:Nat,input:T.ConfigInput):async O.Result {
  let a=statusStaff(tok,id)??(return #err(#denied));if(a.role!="admin")return #err(#denied);let p=statusPlanning.projects.get(id)??(return #err(#missing));let old=statusState.configs.get(id);
  if((switch(old){case(?c)c.revision;case null 0})!=revision)return #err(#stale);
  if(input.enabled and not statusActive(id))return #err(#invalid("Restore the archived project first"));
  if(input.title.trim(#char ' ').size() < 2 or input.title.size() > 80 or input.description.size() > 300 or input.slug.size() < 3 or input.slug.size() > 60 or input.slug.chars().any(func c=not((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c=='-')) or input.retentionDays < 30 or input.retentionDays > 365 or input.services.size()==0 or input.services.size() > 12 or input.services.any(func s=not p.services.contains(s)))return #err(#invalid("Choose a title, a lowercase slug, existing services and 30–365 days of notice history"));
  if(statusState.configs.values().any(func c=c.projectId!=id and c.slug==input.slug))return #err(#invalid("This address is reserved by another project"));
  let changed=switch(old){case(?c)c.audience!=input.audience;case null true};let generation=(switch(old){case(?c)c.generation;case null 0})+(if(changed)1 else 0);
  if(changed)for(service in p.services.values())statusState.checks.remove(statusCheckKey(id,service));
  statusState.configs.add(id,{input with projectId=id;revision=revision+1;generation;by=a.id;at=Time.now()});#ok({id;revision=revision+1})
 };
 public func confirmServiceStatus(tok:Text,id:Nat,revision:Nat,services:[Text],hours:Nat):async O.Result {
  let a=statusStaff(tok,id)??(return #err(#denied));let c=statusState.configs.get(id)??(return #err(#missing));if(c.revision!=revision)return #err(#stale);
  if(not c.enabled or not statusActive(id) or hours < 1 or hours > 168 or services.size()==0 or services.size() > 12 or services.any(func s=not c.services.contains(s)))return #err(#invalid("Select listed services and a confirmation period of 1–168 hours"));
  for(service in services.values())statusState.checks.add(statusCheckKey(id,service),{at=Time.now();until=Time.now()+hours*3_600_000_000_000;by=a.id});statusState.configs.add(id,{c with revision=revision+1});#ok({id;revision=revision+1})
 };
 public func publishServiceNotice(tok:Text,key:Text,id:Nat,revision:Nat,input:T.Input):async O.Result {
  let a=statusStaff(tok,input.projectId)??(return #err(#denied));let c=statusState.configs.get(input.projectId)??(return #err(#invalid("Configure the status page first")));
  if(not c.enabled or not statusActive(c.projectId))return #err(#invalid("The status page is not enabled"));
  if(input.title.trim(#char ' ').size() < 3 or input.title.size() > 120 or input.message.trim(#char ' ').size() < 3 or input.message.size() > 1000 or input.services.size()==0 or input.services.size() > 12 or input.services.any(func s=not c.services.contains(s)))return #err(#invalid("Choose services, a title up to 120 characters and an audience-safe update up to 1000 characters"));
  if(input.incidentId!=0){let incident=statusResponse.incidents.get(input.incidentId)??(return #err(#missing));if(incident.projectId!=input.projectId)return #err(#denied)};
  if(input.phase==#scheduled or input.phase==#maintenance){if(input.startsAt <= 0 or input.endsAt <= input.startsAt or input.endsAt-input.startsAt > 7*P.day or input.startsAt > Time.now()+366*P.day or (input.phase==#scheduled and input.startsAt <= Time.now()))return #err(#invalid("Set a maintenance window of up to 7 days, within the next year"))};
  let now=Time.now();
  if(id==0){
   if(not P.validKey(key))return #err(#invalid("Invalid request identifier"));
   for(n in statusState.notices.values())if(n.by==a.id and n.requestKey==key){let prior:T.Input=n;if(prior!=input or n.generation!=c.generation)return #err(#stale);return #ok({id=n.id;revision=n.revision})};
   if(statusState.notices.size() >= 1500 or statusState.notices.values().toArray().filter(func n=n.projectId==c.projectId).size() >= 50)return #err(#limit("Notice history is full; retention removes old notices"));
   let nid=statusState.nextNotice;statusState.nextNotice+=1;statusState.notices.add(nid,{input with id=nid;revision=1;generation=c.generation;by=a.id;at=now;updatedAt=now;withdrawnAt=0;updates=[{at=now;phase=input.phase;message=input.message}];requestKey=key});return #ok({id=nid;revision=1})
  };
  let n=statusState.notices.get(id)??(return #err(#missing));if(n.projectId!=input.projectId)return #err(#denied);if(n.revision!=revision or n.generation!=c.generation or n.withdrawnAt!=0)return #err(#stale);
  if(n.phase==#resolved or n.updates.size() >= 12)return #err(#invalid("This notice is complete. Publish a new notice if needed"));
  // Preserve the original service/incident/schedule context; later entries are an append-only timeline.
  if(input.services!=n.services or input.title!=n.title or input.incidentId!=n.incidentId or input.startsAt!=n.startsAt or input.endsAt!=n.endsAt)return #err(#invalid("Keep the original notice context; publish an update or withdraw it"));
  statusState.notices.add(id,{n with phase=input.phase;impact=input.impact;message=input.message;revision=revision+1;updatedAt=now;updates=n.updates.concat([{at=now;phase=input.phase;message=input.message}])});#ok({id;revision=revision+1})
 };
 public func withdrawServiceNotice(tok:Text,id:Nat,revision:Nat):async O.Result {
  let n=statusState.notices.get(id)??(return #err(#missing));ignore statusStaff(tok,n.projectId)??(return #err(#denied));if(n.revision!=revision)return #err(#stale);statusState.notices.add(id,{n with revision=revision+1;withdrawnAt=Time.now()});#ok({id;revision=revision+1})
 };
 func statusJson(page:T.Page):Json.Json {
  func phase(p:T.Phase):Text=switch(p){case(#investigating)"investigating";case(#identified)"identified";case(#monitoring)"monitoring";case(#resolved)"resolved";case(#scheduled)"scheduled";case(#maintenance)"maintenance"};
  Json.obj([("title",#string(page.title)),("description",#string(page.description)),("slug",#string(page.slug)),("checkedAt",#string((page.checkedAt/1_000_000).toText())),("services",#array(page.services.map(func s=Json.obj([("name",#string(s.name)),("state",#string(s.state)),("checkedAt",#string((s.checkedAt/1_000_000).toText())),("validUntil",#string((s.validUntil/1_000_000).toText()))])))),("notices",#array(page.notices.map(func n=Json.obj([("id",#string(n.id.toText())),("title",#string(n.title)),("services",#array(n.services.map(func s=#string(s)))),("phase",#string(phase(n.phase))),("startsAt",#string((n.startsAt/1_000_000).toText())),("endsAt",#string((n.endsAt/1_000_000).toText())),("updates",#array(n.updates.map(func u=Json.obj([("at",#string((u.at/1_000_000).toText())),("phase",#string(phase(u.phase))),("message",#string(u.message))]))))]))))])
 };
 func statusCustomerJson(id:Nat):Json.Json {
  let p=statusPlanning.projects.values().toArray().find(func p=p.scope==#customer(id))??(return #null_);let c=statusState.configs.get(p.id)??(return #null_);if(not c.enabled or c.audience!=#public_)return #null_;let page=statusPage(c);Json.obj([("title",#string(c.title)),("slug",#string(c.slug)),("hasActiveNotice",#bool(page.notices.any(func n=n.phase!=#resolved and (n.phase!=#scheduled or n.startsAt <= Time.now()))))])
 };
 func statusHttp(url:Text,method:Text):{status_code:Nat16;headers:[(Text,Text)];body:Blob;upgrade:?Bool} {
  let slug=url.trimStart(#text "/status/v1/");let page=if(method=="GET" and slug.size() <= 60)statusPublic(slug)else null;
  {status_code=if(page==null)404 else 200;headers=[("Content-Type","application/json; charset=utf-8"),("Cache-Control","no-store"),("X-Content-Type-Options","nosniff"),("Access-Control-Allow-Origin","*")];body=Text.encodeUtf8(Json.stringify(switch(page){case(?p)statusJson(p);case null Json.obj([("error",#string("Status page unavailable"))])},null));upgrade=null}
 };
 func sweepServiceStatus(){for((id,n)in statusState.notices.entries().toArray().values()){let c=statusState.configs.get(n.projectId)??(continue);if(statusExpiry(c,n) <= Time.now() and c.at+7*P.day <= Time.now())statusState.notices.remove(id)}};
}
