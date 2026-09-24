import {candidateBackend} from './packaged-wasm.mjs';
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';import {IDL} from '@icp-sdk/core/candid';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';import{gzipSync,gunzipSync}from'node:zlib';import {tmpdir} from 'node:os';import {sha,listAssets} from '../kitchen/tools/release.mjs';
let server,temp;const owner=createIdentity('release-owner').getPrincipal(),stranger=createIdentity('release-stranger').getPrincipal();
const assetWasm=process.env.KEBAB_ASSET_WASM||resolve('hub/.icp/cache/artifacts/frontend');
async function idl(file){const js=execFileSync('python3',['sdk/tools/did2idl.py',file],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
before(async()=>{server=await PocketIcServer.start();temp=mkdtempSync(resolve(tmpdir(),'kebab-release-test-'));});
after(async()=>{await server?.stop();if(temp)rmSync(temp,{recursive:true,force:true});});
async function fixture(baseline=false,hubBaseline=false){
 const pic=await PocketIc.create(server.getUrl()),assetIdl=await idl('kitchen/tools/asset.did');
 const assets=()=>pic.setupCanister({sender:owner,controllers:[owner],wasm:assetWasm,arg:IDL.encode([],[]),idlFactory:assetIdl});
 const source=await assets(),frontend=await assets(),hubFront=await assets();
 for(const a of [source,frontend,hubFront])a.actor.setPrincipal(owner);
 const install=async(name,opts={})=>{const x=await pic.setupCanister({sender:owner,controllers:[owner],wasm:candidateBackend(name),idlFactory:await idl(name+'/backend/dist/backend.did'),...opts});x.actor.setPrincipal(owner);return x;};
 const h=await install('hub',{...(hubBaseline?{wasm:process.env.KEBAB_HUB_BASELINE}:{}),environmentVariables:[{name:'PUBLIC_CANISTER_ID:frontend',value:hubFront.canisterId.toText()},{name:'KEBAB_CLAIM_CODE',value:'aa'.repeat(32)}]});
 assert.equal((await h.actor.claimHubWithCode('aa'.repeat(32),{email:'owner@release.test',displayName:'Owner',orgName:'Release tests'})).ok,true);
 const v=await install('vault'),k=await install('kitchen',baseline?{wasm:process.env.KEBAB_KITCHEN_BASELINE}:{});
 await h.actor.setKitchen(k.canisterId.toText());await h.actor.setVault(v.canisterId.toText());await v.actor.setHub(h.canisterId.toText());await v.actor.setKitchen(k.canisterId.toText());await k.actor.setHub(h.canisterId.toText());await k.actor.setPantry(source.canisterId.toText());
 const moc=execFileSync(resolve('node_modules/.bin/mops'),['toolchain','bin','moc'],{cwd:resolve('kitchen'),encoding:'utf8'}).trim();
 for(const [name,version] of [['old','1.0.0'],['new','1.1.0']]){writeFileSync(temp+'/'+name+'.mo',readFileSync('tests/fixtures/release/app.mo','utf8').replace('1.0.0',version));execFileSync(moc,['--enhanced-orthogonal-persistence','--idl','-o',temp+'/'+name+'.wasm',temp+'/'+name+'.mo']);}
 const app=await pic.setupCanister({sender:owner,controllers:[owner,k.canisterId,v.canisterId],wasm:temp+'/old.wasm',idlFactory:await idl(temp+'/old.did')});app.actor.setPrincipal(owner);await app.actor.put('Existing company data');
 await pic.updateCanisterSettings({sender:owner,canisterId:frontend.canisterId,controllers:[owner,k.canisterId,v.canisterId]});
 const store=async(a,key,content,type='text/plain')=>{
  content=Buffer.from(content);const hash=Buffer.from(sha(content),'hex');
  if(content.length<=1000000){await a.actor.store({key,content_type:type,content_encoding:'identity',content,sha256:[hash]});return;}
  // Real release publishing chunks large Wasm/files; keep fixtures within ingress limits too.
  const exists=(await listAssets((method,args)=>a.actor[method](...args))).some(file=>file.key===key);
  const batch=(await a.actor.create_batch({})).batch_id,chunks=[];
  for(let offset=0;offset<content.length;offset+=1000000)chunks.push((await a.actor.create_chunk({batch_id:batch,content:content.subarray(offset,offset+1000000)})).chunk_id);
  await a.actor.commit_batch({batch_id:batch,operations:[...(!exists?[{CreateAsset:{key,content_type:type,max_age:[],headers:[],enable_aliasing:[],allow_raw_access:[]}}]:[]),{SetAssetContent:{key,content_encoding:'identity',chunk_ids:chunks,last_chunk:[],sha256:[hash]}}]});
 };
 const original='const BACKEND_CANISTER_ID = "'+app.canisterId+'"; const HUB_URL = "https://company.example.test"; // old';
 await store(frontend,'/app.js',original,'text/javascript');await store(frontend,'/.well-known/ic-domains','company.example.test');
 await frontend.actor.set_asset_properties({key:'/app.js',max_age:[[93n]],headers:[[[["X-Company","preserve"]]]],allow_raw_access:[[false]],is_aliased:[]});
 const wasm=readFileSync(temp+'/new.wasm'),template=Buffer.from('const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__"; const HUB_URL = "__HUB_URL__"; // new');
 const manifest={format:2,recipes:[{id:'fixture',name:'Fixture',kind:'app',version:'1.1.0',description:'Test',releaseId:'a'.repeat(64),sourceCommit:'b'.repeat(40),requires:[],notes:'test release',backend:{path:'recipes/fixture/backend.wasm',sha256:sha(wasm),size:wasm.length},frontend:{wasm:'recipes/base.wasm',sha256:'c'.repeat(64),dir:'recipes/fixture/frontend',files:[{key:'/app.js',type:'text/javascript',sha256:sha(template),size:template.length}],patch:[{file:'/app.js',from:'__BACKEND_CANISTER_ID__',to:'${backend}'},{file:'/app.js',from:'__HUB_URL__',to:'${hubUrl}'}]},post:[],tile:{kind:'app',note:''}}]};
 const staticFile=Buffer.from('Static shared login code. '.repeat(300)),compressed=gzipSync(staticFile);
 manifest.recipes[0].frontend.files.push({key:'/shared.js',type:'text/javascript',sha256:sha(staticFile),size:staticFile.length,gzip:{sha256:sha(compressed),size:compressed.length}});
 await store(source,'/recipes/fixture/frontend/shared.js',staticFile,'text/javascript');await store(source,'/recipes/fixture/frontend.gzip/shared.js',compressed,'application/gzip');
 const catalogue=()=>store(source,'/recipes/index.json',JSON.stringify(manifest),'application/json');
 await catalogue();await store(source,'/recipes/fixture/backend.wasm',wasm,'application/wasm');await store(source,'/recipes/fixture/frontend/app.js',template,'text/javascript');
 assert.equal((await k.actor.adopt('fixture',app.canisterId.toText(),frontend.canisterId.toText(),'1.0.0')).ok,true);
 const start=()=>k.actor.applyRelease({id:'fixture',releaseId:manifest.recipes[0].releaseId,install:false});
 const wait=async id=>{for(let n=0;n<350;n++){await pic.tick(3);const [j]=await k.actor.job(id);if(j.state!=='running')return j;}throw Error('test job did not finish');};
 const text=async key=>Buffer.from((await frontend.actor.get({key,accept_encodings:['identity']})).content).toString();
 return {pic,h,v,k,source,frontend,hubFront,app,manifest,catalogue,store,start,wait,text,original};
}
test('release update preserves populated backend, custom sign-in origin, asset settings and upload grants',async()=>{const f=await fixture();try{
 // Put the deployed app behind the asset API's default 100-entry page.
 for(let i=0;i<115;i++)await f.store(f.frontend,'/000-retained/'+String(i).padStart(3,'0'),'Retained company file '+i);
 assert.equal((await f.frontend.actor.list({start:[],length:[]})).some(a=>a.key==='/app.js'),false);
 const permissions=await f.frontend.actor.list_permitted({permission:{Commit:null}});
 const r=await f.start();assert.equal(r.ok,true,r.detail);const j=await f.wait(r.jobId);assert.equal(j.state,'done',JSON.stringify(j,(_,v)=>typeof v==='bigint'?String(v):v));
 assert.equal(await f.app.actor.get(),'Existing company data');assert.equal((await f.app.actor.hub_manifest()).version,'1.1.0');
 const gz=await f.frontend.actor.get({key:'/shared.js',accept_encodings:['gzip']});assert.equal(gz.content_encoding,'gzip');assert.equal(gunzipSync(gz.content).toString(),await f.text('/shared.js'));
 assert.match(await f.text('/app.js'),/https:\/\/company.example.test/);assert.match(await f.text('/app.js'),/new$/);assert.equal(await f.text('/.well-known/ic-domains'),'company.example.test');
 const a=(await listAssets((method,args)=>f.frontend.actor[method](...args))).find(x=>x.key==='/app.js');assert.deepEqual(a.max_age,[93n]);assert.deepEqual(a.headers,[[['X-Company','preserve']]]);
 assert.equal(await f.text('/000-retained/114'),'Retained company file 114');
 assert.deepEqual(await f.frontend.actor.list_permitted({permission:{Commit:null}}),permissions);
 assert.equal((await f.k.actor.checkForUpdates())[0].state,'current');
 await f.store(f.frontend,'/app.js',(await f.text('/app.js'))+' // incomplete frontend','text/javascript');assert.equal((await f.k.actor.checkForUpdates())[0].state,'repair');
 const repair=await f.start();const repaired=await f.wait(repair.jobId);assert.equal(repaired.state,'done');assert.equal(repaired.steps.find(s=>s.name==='upgrade backend').detail,'Matching backend retained');assert.equal(await f.app.actor.get(),'Existing company data');
 assert.equal((await f.k.actor.checkForUpdates())[0].state,'current');
 const again=await f.k.actor.verifyInstalled('fixture');assert.equal((await f.wait(again.jobId)).state,'done');
 f.k.actor.setPrincipal(stranger);assert.equal((await f.start()).ok,false);
 }finally{await f.pic.tearDown();}});
test('changed review and corrupt package fail before altering either component',async()=>{const f=await fixture();try{
 assert.equal((await f.k.actor.applyRelease({id:'fixture',releaseId:'stale',install:false})).ok,false);
 await f.store(f.source,'/recipes/fixture/frontend/app.js','tampered','text/javascript');const r=await f.start();assert.equal(r.ok,true);const j=await f.wait(r.jobId);assert.equal(j.state,'failed');assert.match(j.steps.find(s=>s.name==='verify release').detail,/checksum/);
 assert.equal((await f.app.actor.hub_manifest()).version,'1.0.0');assert.equal(await f.text('/app.js'),f.original);assert.equal(await f.app.actor.get(),'Existing company data');
 }finally{await f.pic.tearDown();}});
test('missing backups and failed staging refuse backend upgrade; failed jobs are never current',async()=>{const f=await fixture();try{
 await f.h.actor.setVault('');let r=await f.start();let j=await f.wait(r.jobId);assert.equal(j.state,'failed');assert.match(j.steps.find(s=>s.name==='verify release').detail,/backup service/);
 await f.h.actor.setVault(f.v.canisterId.toText());await f.frontend.actor.configure({max_batches:[[0n]],max_chunks:[],max_bytes:[]});r=await f.start();j=await f.wait(r.jobId);assert.equal(j.state,'failed');assert.equal(j.steps.find(s=>s.name==='stage frontend').status,'fail');
 assert.equal((await f.app.actor.hub_manifest()).version,'1.0.0');assert.equal(await f.text('/app.js'),f.original);assert.notEqual((await f.k.actor.checkForUpdates())[0].state,'current');
 assert.ok(!(await f.frontend.actor.list_permitted({permission:{Commit:null}})).some(p=>p.toText()===f.k.canisterId.toText()));
 }finally{await f.pic.tearDown();}});

test('WebP release metadata preserves existing images and refuses a generic binary downgrade',async()=>{const f=await fixture();try{
 const key='/assets/two-d/deep-field.webp',content=readFileSync('bug/dist'+key),hash=sha(content);
 const readImage=async()=>{const image=await f.frontend.actor.get({key,accept_encodings:['identity']}),chunks=[Buffer.from(image.content)];let size=chunks[0].length,index=1n;while(BigInt(size)<image.total_length){const part=await f.frontend.actor.get_chunk({key,content_encoding:image.content_encoding,index:index++,sha256:image.sha256});chunks.push(Buffer.from(part.content));size+=part.content.length;}assert.equal(BigInt(size),image.total_length);return {...image,content:Buffer.concat(chunks)};};
 await f.store(f.frontend,key,content,'image/webp');await f.store(f.source,'/recipes/fixture/frontend'+key,content,'application/octet-stream');
 const file={key,type:'application/octet-stream',sha256:hash,size:content.length};f.manifest.recipes[0].frontend.files.push(file);await f.catalogue();
 const permissions=await f.frontend.actor.list_permitted({permission:{Commit:null}});
 let started=await f.start(),job=await f.wait(started.jobId);assert.equal(job.state,'failed');assert.match(job.steps.find(s=>s.name==='stage frontend').detail,/Content type changed/);
 assert.equal((await f.app.actor.hub_manifest()).version,'1.0.0');assert.equal(await f.app.actor.get(),'Existing company data');
 let image=await readImage();assert.equal(image.content_type,'image/webp');assert.equal(sha(image.content),hash);
 file.type='image/webp';await f.catalogue();started=await f.start();job=await f.wait(started.jobId);assert.equal(job.state,'done');
 image=await readImage();assert.equal(image.content_type,'image/webp');assert.equal(sha(image.content),hash);
 assert.equal(await f.app.actor.get(),'Existing company data');assert.deepEqual(await f.frontend.actor.list_permitted({permission:{Commit:null}}),permissions);
 }finally{await f.pic.tearDown();}});

test('populated installer upgrade keeps bindings, adoption records and journal', {skip:!process.env.KEBAB_KITCHEN_BASELINE},async()=>{const f=await fixture(true);try{
 const before={info:await f.k.actor.info(),installed:await f.k.actor.listInstalled(),journal:await f.k.actor.listJournal()};
 await f.pic.upgradeCanister({sender:owner,canisterId:f.k.canisterId,wasm:candidateBackend('kitchen'),arg:IDL.encode([],[]),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 const info=await f.k.actor.info();assert.equal(info.version,readFileSync('kitchen/mops.toml','utf8').match(/^version\s*=\s*"([^"]+)"/m)[1]);assert.equal(info.hubId,before.info.hubId);assert.equal(info.pantryId,before.info.pantryId);assert.deepEqual(await f.k.actor.listInstalled(),before.installed);assert.deepEqual(await f.k.actor.listJournal(),before.journal);
 const r=await f.start();assert.equal(r.ok,true);assert.equal((await f.wait(r.jobId)).state,'done');assert.equal(await f.app.actor.get(),'Existing company data');
 }finally{await f.pic.tearDown();}});

test('Hub itself upgrades through the shared executor without changing owners or external connector configuration', {skip:!process.env.KEBAB_HUB_BASELINE},async()=>{const f=await fixture(false,true);try{
 for(const canisterId of [f.h.canisterId,f.hubFront.canisterId])await f.pic.updateCanisterSettings({sender:owner,canisterId,controllers:[owner,f.k.canisterId,f.v.canisterId]});
 const connected=await f.h.actor.connectApp({name:'Lunch fixture',canisterId:stranger.toText(),note:'directory',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]});assert.equal(connected.ok,true,connected.detail);
 assert.equal(await f.h.actor.setConnectorFilters(connected.id,['entity=LLC','city^=Remote']),true);
 const before=await f.h.actor.listConnectors();
 const wasm=readFileSync(candidateBackend('hub')),html=Buffer.from('const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__"; const CANONICAL_ORIGIN = ""; // updated');
 await f.store(f.hubFront,'/index.html','const BACKEND_CANISTER_ID = "'+f.h.canisterId+'"; const CANONICAL_ORIGIN = "https://hub.company.test"; // original','text/html');
 const version=readFileSync('hub/mops.toml','utf8').match(/^version\s*=\s*"([^"]+)"/m)[1];
 const r={...f.manifest.recipes[0],id:'hub',kind:'hub',version,backend:{path:'recipes/hub/backend.wasm',sha256:sha(wasm),size:wasm.length},frontend:{...f.manifest.recipes[0].frontend,dir:'recipes/hub/frontend',files:[{key:'/index.html',type:'text/html',sha256:sha(html),size:html.length}],patch:[{file:'/index.html',from:'__BACKEND_CANISTER_ID__',to:'${backend}'},{file:'/index.html',from:'CANONICAL_ORIGIN = ""',to:'CANONICAL_ORIGIN = "${frontendUrl}"'}]}};
 f.manifest.recipes.push(r);await f.catalogue();await f.store(f.source,'/recipes/hub/backend.wasm',wasm,'application/wasm');await f.store(f.source,'/recipes/hub/frontend/index.html',html,'text/html');
 const assetsBefore=await f.hubFront.actor.list({start:[],length:[]});
 const started=await f.k.actor.applyRelease({id:'hub',releaseId:r.releaseId,install:false});assert.equal(started.ok,true,started.detail);const j=await f.wait(started.jobId);assert.equal(j.state,'done',JSON.stringify({j,assetsBefore,assetsAfter:await f.hubFront.actor.list({start:[],length:[]})},(_,v)=>typeof v==='bigint'?String(v):v));
 assert.equal(await f.h.actor.version(),version);assert.deepEqual(await f.h.actor.listConnectors(),before);assert.equal((await f.h.actor.listPersonRoles()).find(p=>p.email==='owner@release.test').role,'owner');
 const live=Buffer.from((await f.hubFront.actor.get({key:'/index.html',accept_encodings:['identity']})).content).toString();assert.match(live,/https:\/\/hub.company.test/);
 }finally{await f.pic.tearDown();}});

test('large release files and combined frontend payloads stay local across preflight, staging and repair',async()=>{const f=await fixture();try{
 const key='/large-runtime.js',content=Buffer.alloc(3100000,65),hash=Buffer.from(sha(content),'hex'),sourceKey='/recipes/fixture/frontend'+key;
 const batch=(await f.source.actor.create_batch({})).batch_id,chunks=[];
 for(let offset=0;offset<content.length;offset+=1000000)chunks.push((await f.source.actor.create_chunk({batch_id:batch,content:content.subarray(offset,offset+1000000)})).chunk_id);
 await f.source.actor.commit_batch({batch_id:batch,operations:[{CreateAsset:{key:sourceKey,content_type:'text/javascript',max_age:[],headers:[],enable_aliasing:[],allow_raw_access:[]}},{SetAssetContent:{key:sourceKey,content_encoding:'identity',chunk_ids:chunks,last_chunk:[],sha256:[hash]}}]});
 f.manifest.recipes[0].frontend.files.push({key,type:'text/javascript',sha256:sha(content),size:content.length});await f.catalogue();
 const started=await f.start();assert.equal(started.ok,true,started.detail);const job=await f.wait(started.jobId);assert.equal(job.state,'done',JSON.stringify(job,(_,v)=>typeof v==='bigint'?String(v):v));
 assert.equal(await f.app.actor.get(),'Existing company data');const installed=(await listAssets((m,a)=>f.frontend.actor[m](...a))).find(a=>a.key===key);assert.equal(installed.encodings[0].length,BigInt(content.length));assert.equal(Buffer.from(installed.encodings[0].sha256[0]).toString('hex'),sha(content));
 assert.equal((await f.k.actor.checkForUpdates())[0].state,'current');await f.store(f.frontend,key,'incomplete','text/javascript');assert.equal((await f.k.actor.checkForUpdates())[0].state,'repair');const retry=await f.start();assert.equal((await f.wait(retry.jobId)).state,'done');assert.equal((await f.k.actor.checkForUpdates())[0].state,'current');
 }finally{await f.pic.tearDown();}});
