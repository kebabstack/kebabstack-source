#!/usr/bin/env node
/** Reconcile only product icon metadata after a verified logo release. Defaults to read-only. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {client,json,sha} from './release.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i++){if(args[i]==='--apply')opts.apply=true;else if(['--kitchen','--identity','--out'].includes(args[i]))opts[args[i].slice(2)]=args[++i];else throw Error('Unknown argument '+args[i]);}
if(!opts.kitchen||!opts.identity)throw Error('Usage: sync-console-brand.mjs --kitchen ID --identity NAME [--apply] [--out report.json]');
const registry=JSON.parse(await readFile(resolve(root,'design/logos/registry.json'),'utf8'));
const api=await client({kitchen:opts.kitchen,identity:opts.identity});
const envOf=s=>Object.fromEntries(s.settings.environment_variables.map(e=>[e.name,e.value]));
const safeOrigin=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.origin:null;}catch{return null;}};
try{
 assert(!(await api.call(api.kitchen,'listJobs')).some(j=>j.state==='running'),'Wait for the active update job');
 const info=await api.call(api.kitchen,'info');
 const config=await api.call(info.hubId,'kitchenConfig',[],resolve(root,'hub/backend/backend.did'));
 const installed=await api.call(api.kitchen,'listInstalled');
 const hubStatus=JSON.parse(await api.cli(['canister','status',config.frontendId,'--json']));
 const hubOrigin=safeOrigin(envOf(hubStatus).__META_BASE_URL)||`https://${config.frontendId}.icp.net`;
 const targets=[{app:'hub',id:config.frontendId},{app:'kitchen',id:info.pantryId},{app:'vault',id:config.vaultId,base:hubOrigin,path:'/brand/vault.svg'},...installed.filter(i=>i.frontend&&registry.apps[i.recipeId]&&!['hub','kitchen','vault'].includes(i.recipeId)).map(i=>({app:i.recipeId,id:i.frontend}))];
 const plans=[];
 // Finish the complete read/verification plan before making any settings change.
 for(const target of targets){
  const before=JSON.parse(await api.cli(['canister','status',target.id,'--json'])),env=envOf(before);
  const base=target.base||safeOrigin(env.__META_BASE_URL)||`https://${target.id}.icp.net`,iconPath=target.path||'/favicon.svg';
  const url=new URL(iconPath,base).href,res=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error(`${target.app}: cannot load ${url} (${res.status})`);
  const actual=Buffer.from(await res.arrayBuffer()),expected=await readFile(resolve(root,`design/logos/svg/${target.app}.svg`));
  assert.equal(sha(actual),sha(expected),`${target.app}: deploy the canonical favicon before changing console metadata`);
  const desired={__META_BASE_URL:base,__META_ICON_PATH:iconPath,__META_MAIN_CANISTER:'true'};
  const changes=Object.entries(desired).filter(([name,value])=>env[name]!==value);
  plans.push({...target,before,changes,url,sha256:sha(actual)});
 }
 for(const p of plans){
  if(opts.apply&&p.changes.length){
   await api.cli(['canister','settings','update',p.id,...p.changes.flatMap(([k,v])=>['--add-environment-variable',k+'='+v])]);
   const after=JSON.parse(await api.cli(['canister','status',p.id,'--json'])),env=envOf(after);
   for(const [key,value] of p.changes)assert.equal(env[key],value,p.app+' metadata read-back');
   const retained=s=>({...s.settings,environment_variables:s.settings.environment_variables.filter(e=>!p.changes.some(([k])=>k===e.name)).sort((a,b)=>a.name.localeCompare(b.name))});
   assert.deepEqual(retained(after),retained(p.before),p.app+' unrelated settings changed');
  }
 }
 const report={applied:!!opts.apply,checkedAt:new Date().toISOString(),logos:plans.map(({app,id,changes,url,sha256})=>({app,id,changes,url,sha256}))};
 if(opts.out)await writeFile(opts.out,json(report),{mode:0o600});
 console.log(json(report));
}finally{await api.close();}
