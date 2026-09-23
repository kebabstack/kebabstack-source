export function unwrap(result) {
  if(result&&'err'in result){const code=Object.keys(result.err)[0];throw Object.assign(new Error(typeof result.err[code]==='string'?result.err[code]:code),{status:{unauthorized:403,notFound:404,invalid:400,conflict:409,capacity:422}[code]??500,code});}
  return result&&'ok'in result?result.ok:result;
}
export function reportRequest(body){
  if(!body||typeof body.site!=='string')throw new TypeError('site is required');
  const from=Number(body.from),until=Number(body.until);if(!Number.isSafeInteger(from)||!Number.isSafeInteger(until))throw new TypeError('from/until must be integer Unix seconds');
  return {site:body.site,from:BigInt(from),until:BigInt(until),filters:body.filters??[],dimension:body.dimension??'',limit:BigInt(body.limit??100)};
}
export async function api(actor,method,path,token,body,search) {
  if(!token)throw Object.assign(new Error('Bearer token required'),{status:401});
  if(path==='/api/v1/sites'&&method==='GET')return (await actor.listSites(token)).map(site=>({...site,accessRole:Object.keys(site.accessRole)[0]}));
  if(path==='/api/v1/sites'&&method==='POST'){
    new Intl.DateTimeFormat('en',{timeZone:body.timezone??'UTC'}).format();
    return unwrap(await actor.saveSite(token,{...body,timezone:body.timezone??'UTC',retentionDays:BigInt(body.retentionDays??365),enabled:body.enabled!==false,allowedProperties:body.allowedProperties??[],excludedPaths:body.excludedPaths??[],viewers:body.viewers??[]}));
  }
  const members=/^\/api\/v1\/sites\/([^/]+)\/(access|people)$/.exec(path);
  if(members){const site=decodeURIComponent(members[1]);
    if(members[2]==='access'&&method==='GET')return unwrap(await actor.getSiteAccess(token,site));
    if(members[2]==='access'&&method==='PUT')return unwrap(await actor.setSiteAccess(token,site,BigInt(body.revision),body.readers,body.managers));
    if(members[2]==='people'&&method==='GET')return unwrap(await actor.accessPeople(token,site,search.get('search')??''));
  }
  if(/^\/api\/v1\/sites\/[^/]+$/.test(path)&&method==='DELETE')return unwrap(await actor.deleteSite(token,decodeURIComponent(path.split('/').at(-1))));
  if(path==='/api/v1/query'&&method==='POST')return unwrap(await actor.report(token,reportRequest(body)));
  if(path==='/api/v1/funnels'&&method==='POST')return unwrap(await actor.funnel(token,reportRequest(body),body.steps.map(s=>({kind:{[s.kind]:null},value:s.value}))));
  if(path==='/api/v1/journeys'&&method==='POST')return unwrap(await actor.journeys(token,reportRequest(body)));
  if(path==='/api/v1/goals/report'&&method==='POST')return unwrap(await actor.goalReport(token,reportRequest(body),body.id));
  if(path==='/api/v1/goals'&&method==='GET')return unwrap(await actor.goals(token,search.get('site')??'')).map(g=>({...g,kind:Object.keys(g.kind)[0],scrollDepth:g.kind.scroll===undefined?null:String(g.kind.scroll)}));
  if(path==='/api/v1/goals'&&method==='POST')return unwrap(await actor.saveGoal(token,{...body,kind:{[body.kind]:body.kind==='scroll'?BigInt(body.scrollDepth):null}}));
  if(path==='/api/v1/goals'&&method==='DELETE')return unwrap(await actor.deleteGoal(token,search.get('site')??'',search.get('id')??''));
  if(path==='/api/v1/keys'&&method==='GET')return unwrap(await actor.listKeys(token)).map(k=>({...k,scope:Object.keys(k.scope)[0]}));
  if(path==='/api/v1/keys'&&method==='POST'){const r=unwrap(await actor.createKey(token,body.site,body.name,{[body.scope]:null},BigInt(body.days)));return {...r,key:{...r.key,scope:Object.keys(r.key.scope)[0]}};}
  if(path==='/api/v1/keys'&&method==='DELETE')return unwrap(await actor.revokeKey(token,search.get('id')??''));
  if(path==='/api/v1/annotations'&&method==='GET')return unwrap(await actor.annotations(token,search.get('site')??''));
  if(path==='/api/v1/annotations'&&method==='POST')return unwrap(await actor.saveAnnotation(token,{...body,at:BigInt(body.at)}));
  if(path==='/api/v1/export'&&method==='GET')return unwrap(await actor.exportEvents(token,search.get('site')??'',search.get('cursor')??'',BigInt(search.get('limit')??100)));
  if(path==='/api/v1/health'&&method==='GET')return unwrap(await actor.health(token));
  if(path==='/api/v1/imports'&&method==='GET')return unwrap(await actor.imported(token,search.get('site')??'',BigInt(search.get('from')??0),BigInt(search.get('until')??Math.floor(Date.now()/1000))));
  if(path==='/api/v1/imports'&&method==='POST')return unwrap(await actor.importAggregates(token,body.map(row=>({...row,day:BigInt(row.day),metrics:Object.fromEntries(Object.entries(row.metrics).map(([k,v])=>[k,k==='revenue'?v.map(([c,n])=>[c,BigInt(n)]):BigInt(v)]))}))));
  throw Object.assign(new Error('Endpoint not found'),{status:404});
}
