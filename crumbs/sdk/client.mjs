/** Crumbs v1 client. Report credentials belong on trusted servers, never in tracking snippets. */
export class CrumbsError extends Error {constructor(status,body){super(body.message??body.error??'Crumbs request failed');this.status=status;this.code=body.error;}}
export class Crumbs {
  constructor({baseUrl,token,fetch:fetchImpl=globalThis.fetch}){this.baseUrl=baseUrl.replace(/\/$/,'');this.token=token;this.fetch=fetchImpl;}
  async request(path,{method='GET',body}={}){const response=await this.fetch(this.baseUrl+'/api/v1'+path,{method,headers:{...(this.token?{Authorization:'Bearer '+this.token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new CrumbsError(response.status,data);return data;}
  sites(){return this.request('/sites');}
  saveSite(site){return this.request('/sites',{method:'POST',body:site});}
  siteAccess(site){return this.request('/sites/'+encodeURIComponent(site)+'/access');}
  saveSiteAccess(site,policy){return this.request('/sites/'+encodeURIComponent(site)+'/access',{method:'PUT',body:policy});}
  accessPeople(site,search=''){return this.request('/sites/'+encodeURIComponent(site)+'/people?'+new URLSearchParams({search}));}
  deleteSite(id){return this.request('/sites/'+encodeURIComponent(id),{method:'DELETE'});}
  deleteGoal(site,id){return this.request('/goals?'+new URLSearchParams({site,id}),{method:'DELETE'});}
  keys(){return this.request('/keys');}
  createKey(input){return this.request('/keys',{method:'POST',body:input});}
  revokeKey(id){return this.request('/keys?'+new URLSearchParams({id}),{method:'DELETE'});}
  annotations(site){return this.request('/annotations?'+new URLSearchParams({site}));}
  saveAnnotation(item){return this.request('/annotations',{method:'POST',body:item});}
  importAggregates(rows){return this.request('/imports',{method:'POST',body:rows});}
  imported(site,from,until){return this.request('/imports?'+new URLSearchParams({site,from,until}));}
  health(){return this.request('/health');}
  collectorHealth(){return this.request('/collector-health');}
  query(request){return this.request('/query',{method:'POST',body:request});}
  events(events){return this.request('/events',{method:'POST',body:events});}
  funnels(request){return this.request('/funnels',{method:'POST',body:request});}
  journeys(request){return this.request('/journeys',{method:'POST',body:request});}
  goalReport(request){return this.request('/goals/report',{method:'POST',body:request});}
  goals(site){return this.request('/goals?site='+encodeURIComponent(site));}
  saveGoal(goal){return this.request('/goals',{method:'POST',body:goal});}
  async *exportEvents(site,{limit=500}={}){let cursor='';do{const page=await this.request('/export?'+new URLSearchParams({site,limit:String(limit),cursor}));for(const event of page.events)yield event;cursor=page.events.length===limit?page.cursor:'';}while(cursor);}
}
