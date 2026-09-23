import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {normalize,clientIp,pathOnly} from '../collector/privacy.mjs';
import {Store,flush} from '../collector/store.mjs';
import {createCollector} from '../collector/server.mjs';
import {api} from '../collector/api.mjs';
const site={id:'main',domain:'example.test',enabled:true,allowedProperties:['plan'],excludedPaths:['/private']};
const context={ip:'192.0.2.1',ua:'Mozilla/5.0 Firefox/123.0',salt:Buffer.alloc(32,1),now:1789819200};
const event=(id='event-one',extra={})=>normalize({id,site:'main',url:'https://example.test/pricing?email=secret@example.test&utm_source=google',kind:'pageview',...extra},site,context);
test('privacy: site/day isolation, redaction, property allowlist and trusted proxy boundary',()=>{
 const e=event();assert.equal(e.path,'/pricing');assert.equal(e.source,'google');assert.equal(e.visitor.length,64);assert.ok(!JSON.stringify(e).includes('192.0.2.1'));assert.ok(!JSON.stringify(e).includes('secret@example.test'));assert.ok(!JSON.stringify(e).includes(context.ua));
 assert.notEqual(e.visitor,normalize({id:'two',url:'https://other.test/',kind:'pageview'},{...site,id:'other',domain:'other.test'},context).visitor);
 assert.notEqual(e.visitor,normalize({id:'three',url:'https://example.test/',kind:'pageview'},site,{...context,salt:Buffer.alloc(32,2)}).visitor);
 assert.equal(pathOnly(new URL('https://example.test/u/me@example.test/123456?secret=token#secret')),'/u/:email/:id');
 assert.throws(()=>event('bad',{props:{email:'a@example.test'}}),/not allowed/);assert.equal(event('excluded',{url:'https://example.test/private/profile'}),null);
 assert.throws(()=>event('wrong',{url:'https://attacker.test/'}),/registered/);
 const req={socket:{remoteAddress:'192.0.2.10'},headers:{'x-forwarded-for':'198.51.100.1','x-crumbs-client-ip':'198.51.100.2'}};
 assert.equal(clientIp(req), '192.0.2.10');assert.equal(clientIp(req,['192.0.2.10']),'198.51.100.2');delete req.headers['x-crumbs-client-ip'];assert.throws(()=>clientIp(req,['192.0.2.10']),/overwrite/);
});
test('durable queue: restart, transient failure, same-ID retry, midnight salt rotation and poison-event isolation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'crumbs-store-'));let store;
 try{store=new Store(dir);const salt=Buffer.from(store.salt(context.now));store.put(event());const first=store.pending()[0];store.close();store=new Store(dir);assert.equal(store.pending().length,1);assert.deepEqual(Buffer.from(store.salt(context.now)),salt);
 assert.equal(store.put({...event(),source:'different'}),'pending');assert.equal(store.pending()[0].source,'google','retry keeps the originally normalized payload');
 await assert.rejects(flush(store,{ingestBatch:async()=>{throw new Error('offline')}}));assert.equal(store.count('pending'),1);
 let sent;await flush(store,{ingestBatch:async batch=>{sent=batch;return {ok:{accepted:1n,duplicates:0n}};}});assert.equal(sent[0].order,BigInt(first.order));assert.equal(store.count('accepted'),1);
 const next=store.salt(context.now+86400);assert.notDeepEqual(Buffer.from(next),salt);assert.equal(store.db.prepare('SELECT count(*) n FROM salts').get().n,1);
 store.put(event('good'));store.put(event('poison'));await flush(store,{ingestBatch:async batch=>batch.some(e=>e.id==='poison')?{err:{invalid:'Excluded page'}}:{ok:{accepted:BigInt(batch.length),duplicates:0n}}});assert.equal(store.count('pending'),0);assert.equal(store.count('rejected'),1);assert.equal(store.count('accepted'),2);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('collector HTTP: fake IP ignored, bot filter, CORS, malformed payload and durable delivery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'crumbs-http-')),store=new Store(dir);let delivered=[];
 const actor={collectorSites:async()=>[site],ingestBatch:async batch=>{delivered.push(...batch);return {ok:{accepted:BigInt(batch.length),duplicates:0n}};},report:async(token)=>{if(token==='explode')throw Object.assign(new Error('private signing context'),{code:{requestContext:'secret'}});return token==='valid'?{ok:{totals:{pageviews:1n}}}:{err:{unauthorized:null}};}};
 const {server,drain}=createCollector({actor,store,now:()=>context.now});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{const send=(data,headers={})=>fetch(base+'/api/v1/events',{method:'POST',headers:{'content-type':'application/json','user-agent':context.ua,...headers},body:JSON.stringify(data)});
 const r=await send({id:'http-one',site:'main',url:'https://example.test/',kind:'pageview'},{origin:'https://example.test','x-crumbs-client-ip':'198.51.100.1'});assert.equal(r.status,202,await r.clone().text());assert.equal(r.headers.get('access-control-allow-origin'),'https://example.test');assert.equal((await r.json()).durability,'collector');
 await drain();await new Promise(resolve=>setTimeout(resolve,50));assert.ok(delivered.length);const expected=normalize({id:'http-one',url:'https://example.test/',kind:'pageview'},site,{...context,ip:'127.0.0.1',salt:store.salt(context.now)});assert.equal(delivered[0].visitor,expected.visitor);
 assert.equal((await send({id:'other',site:'main',url:'https://evil.test/',kind:'pageview'})).status,400);
 assert.equal((await send({id:'evil',site:'main',url:'https://example.test/',kind:'pageview'},{origin:'https://evil.test'})).status,403);
 assert.equal((await send({id:'bot',site:'main',url:'https://example.test/',kind:'pageview'},{'user-agent':'Googlebot'})).status,202);assert.equal(store.get('main','bot'),undefined);
 const report=await fetch(base+'/api/v1/query',{method:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify({site:'main',from:1,until:2})});assert.equal(report.status,200);assert.equal((await report.json()).totals.pageviews,'1');
 assert.equal((await fetch(base+'/api/v1/query',{method:'POST',body:'{}'})).status,401);
 const failed=await fetch(base+'/api/v1/query',{method:'POST',headers:{authorization:'Bearer explode'},body:JSON.stringify({site:'main',from:1,until:2})});assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'service_unavailable',message:'Service unavailable; retry with the same event id'});
 }finally{await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true});}
});
test('OpenAPI paths have executable routes and no public report credential',async()=>{
 const spec=JSON.parse(readFileSync(new URL('../dist/openapi.json',import.meta.url)));assert.equal(spec.openapi,'3.1.0');assert.deepEqual(spec.paths['/api/v1/events'].post.security,[]);
 for(const [path,methods]of Object.entries(spec.paths))if(path!=='/api/v1/events')for(const op of Object.values(methods))assert.deepEqual(op.security,[{bearer:[]}]);
 await assert.rejects(api({},'GET','/api/v1/sites','',null,new URLSearchParams()),e=>e.status===401);
});

test('collector bounds an entire backend call and aborts continuing transport retries',async()=>{
 const {deadlineActor,rpcFetch}=await import('../collector/transport.mjs');let cancelled;
 const actor=deadlineActor({report:async()=>{await new Promise(r=>setTimeout(r,30));try{await rpcFetch('http://127.0.0.1:1/');}catch(e){cancelled=e;throw e;}}},10);
 await assert.rejects(actor.report(),e=>e.status===503);await new Promise(r=>setTimeout(r,40));assert.match(cancelled.message,/deadline exceeded/);
 assert.equal(await deadlineActor({ok:async()=>42},100).ok(),42);
});

test('optional local datacenter filter ignores hosting ranges without storing IP classification or blocking all VPNs',async()=>{
 const {networkLookup,loadNetworkLookup}=await import('../collector/network.mjs');
 const lookup=networkLookup({network:{get:ip=>ip==='192.0.2.1'?{is_hosting_provider:true}:{is_anonymous_vpn:true}},geo:{get:()=>({country:{iso_code:'CH'}})}});
 const input={id:'hosting',url:'https://example.test/',kind:'pageview'};
 assert.equal(normalize(input,site,{...context,geo:lookup('192.0.2.1')}),null);
 const accepted=normalize(input,site,{...context,geo:lookup('198.51.100.1')});assert.equal(accepted.country,'CH');assert.equal('isHostingProvider'in accepted,false);
 assert.ok(normalize(input,site,{...context,geo:(await loadNetworkLookup())('192.0.2.1')}));
 assert.equal(normalize({...input,referrer:'https://sub.semalt.com/'},site,context),null);
 assert.ok(normalize({...input,referrer:'https://notsemalt.com/'},site,context));
});
