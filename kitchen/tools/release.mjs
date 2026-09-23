#!/usr/bin/env node
// One publication source and one executor for browser and terminal updates.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {IDL} from '@icp-sdk/core/candid';
import {Principal} from '@icp-sdk/core/principal';
const exec=promisify(execFile),root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const types=new Map();
export async function client({network='ic',identity,kitchen}) {
  if(!identity)throw Error('Choose an explicit --identity');
  Principal.fromText(kitchen);
  const work=await mkdtemp(resolve(tmpdir(),'kebab-release-'));
  let n=0;
  const cli=async args=>(await exec('icp',[...args,...(args[0]==='identity'?[]:['-n',network]),'--identity',identity],{cwd:root,maxBuffer:64*1024*1024,timeout:300000})).stdout;
  const call=async(id,method,args=[],did=resolve(root,'kitchen/backend/backend.did'))=>{
    let service=types.get(did);
    if(!service){const generated=(await exec('python3',[resolve(root,'sdk/tools/did2idl.py'),did])).stdout;const {idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(generated).toString('base64'));service=idlFactory({IDL});types.set(did,service);}
    const fn=service._fields.find(([name])=>name===method)?.[1];if(!fn)throw Error('Unknown method '+method);
    const path=resolve(work,`${++n}.bin`);await writeFile(path,Buffer.from(IDL.encode(fn.argTypes,args)),{mode:0o600});
    try {const response=JSON.parse(await cli(['canister','call',id,method,'--args-file',path,'--args-format','bin','--candid',did,'--json']));return IDL.decode(fn.retTypes,Uint8Array.from(Buffer.from(response.response_bytes,'hex')))[0];}
    finally {await rm(path,{force:true});}
  };
  return {cli,call,kitchen,close:()=>rm(work,{recursive:true,force:true})};
}
export async function bundleFiles(directory) {
  const indexBytes=await readFile(resolve(directory,'index.json')),index=JSON.parse(indexBytes);
  if(index.format!==2||!index.recipes?.length||indexBytes.toString().includes('\\u'))throw Error('Expected a nonempty format 2 release catalogue with literal UTF-8');
  const result=new Map(),ids=new Set();
  async function add(key,hash,size,type) {
    if(!/^recipes\/[A-Za-z0-9_./-]+$/.test(key)||key.includes('..'))throw Error('Unsafe package path: '+key);
    if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Missing checksum: '+key);
    const content=await readFile(resolve(directory,key.slice('recipes/'.length)));
    if(sha(content)!==hash||(size!==undefined&&content.length!==size))throw Error('Package checksum/length mismatch: '+key);
    const file={key:'/'+key,content,type,hash};
    if(result.has(file.key)&&result.get(file.key).hash!==hash)throw Error('Conflicting package file');result.set(file.key,file);
  }
  for(const r of index.recipes) {
    if(ids.has(r.id)||!/^[a-z0-9-]+$/.test(r.id)||!/^\d+\.\d+\.\d+$/.test(r.version)||!/^[a-f0-9]{64}$/.test(r.releaseId)||!/^[a-f0-9]{40}$/.test(r.sourceCommit))throw Error('Invalid release identity');ids.add(r.id);
    const prefix=`recipes/${r.id}/${r.version}/${r.releaseId}/`;
    if(!r.backend.path.startsWith(prefix))throw Error('Backend path is not immutable');
    await add(r.backend.path,r.backend.sha256,r.backend.size,'application/wasm');
    if(r.frontend.files.length) {
      if(r.frontend.dir!==prefix+'frontend'||r.frontend.files.length>512)throw Error('Invalid frontend manifest');
      await add(r.frontend.wasm,r.frontend.sha256,undefined,'application/wasm');
      const keys=new Set();
      for(const f of r.frontend.files){if(!f.key.startsWith('/')||keys.has(f.key))throw Error('Duplicate/invalid frontend file');keys.add(f.key);await add(r.frontend.dir+f.key,f.sha256,f.size,f.type);
        if(f.gzip){
          if(r.frontend.patch.some(p=>p.file===f.key))throw Error('Compressed deployment templates are not supported');
          await add(r.frontend.dir+'.gzip'+f.key,f.gzip.sha256,f.gzip.size,'application/gzip');
          const decoded=gunzipSync(result.get('/'+r.frontend.dir+'.gzip'+f.key).content,{maxOutputLength:32*1024*1024});
          if(sha(decoded)!==f.sha256||decoded.length!==f.size)throw Error('Compressed representation does not match the release: '+f.key);
        }
      }
      for(const p of r.frontend.patch){const file=result.get('/'+r.frontend.dir+p.file);if(!p.from||!file?.content.includes(Buffer.from(p.from)))throw Error('Missing deployment placeholder');}
    }
    if(r.image){if(!r.image.startsWith(prefix))throw Error('Image path is not immutable');await add(r.image,r.imageSha256,undefined,'image/png');}
  }
  result.set('/recipes/index.json',{key:'/recipes/index.json',content:indexBytes,type:'application/json',hash:sha(indexBytes)});
  return {index,files:[...result.values()]};
}
const assetDid=resolve(root,'kitchen/tools/asset.did');
export async function listAssets(call) {
  const files=[],seen=new Set();
  for (;;) {
    const page=await call('list',[{start:[BigInt(files.length)],length:[100n]}]);
    for(const asset of page){if(seen.has(asset.key))throw Error('Asset inventory changed during pagination; retry the check');seen.add(asset.key);files.push(asset);}
    if(page.length<100)return files;
    if(files.length>=100000)throw Error('Asset inventory exceeds the supported size');
  }
}
export async function publish(api,directory,{log=console.log}={}) {
  const {index,files}=await bundleFiles(directory),info=await api.call(api.kitchen,'info');
  if(!info.pantryId)throw Error('The update service has no configured release source');
  const call=(method,args)=>api.call(info.pantryId,method,args,assetDid);
  const before=await listAssets(call),byKey=new Map(before.map(a=>[a.key,a]));
  const identityHash=a=>a?.encodings.find(e=>e.content_encoding==='identity')?.sha256?.[0];
  const hashOf=a=>identityHash(a)?Buffer.from(identityHash(a)).toString('hex'):null;
  const pending=[];
  for(const f of files){const old=byKey.get(f.key);if(old&&old.content_type!==f.type)throw Error('Package content type changed: '+f.key);if(hashOf(old)===f.hash&&old.encodings.length===1)continue;if(old&&f.key!=='/recipes/index.json')throw Error('Immutable release already exists with different content/encoding: '+f.key);pending.push(f);}
  if(!pending.length){log('Published bundle already matches.');return {published:false,versions:index.recipes.map(r=>({id:r.id,version:r.version,releaseId:r.releaseId}))};}
  if((await api.call(api.kitchen,'listJobs')).some(j=>j.state==='running'))throw Error('Wait for the active update before publishing a catalogue');
  const operator=Principal.fromText((await api.cli(['identity','principal'])).trim()),added=[];let batch;
  try {
    for(const permission of ['Prepare','Commit']){const ps=await call('list_permitted',[{permission:{[permission]:null}}]);if(!ps.some(p=>p.toText()===operator.toText())){await call('grant_permission',[{permission:{[permission]:null},to_principal:operator}]);added.push(permission);}}
    batch=(await call('create_batch',[{}])).batch_id;
    const staged=new Array(pending.length);let nextFile=0,uploadError;
    // Files are independent inside an unpublished batch. Bound concurrency and
    // await every in-flight request before cleanup after a failed upload.
    const worker=async()=>{
      while(!uploadError&&nextFile<pending.length){
        const index=nextFile++,f=pending[index],operations=[];
        try{
          log('Stage '+f.key);
          const old=byKey.get(f.key);
          if(!old)operations.push({CreateAsset:{key:f.key,content_type:f.type,max_age:[f.key==='/recipes/index.json'?0n:31536000n],headers:[],enable_aliasing:[],allow_raw_access:[false]}});
          else for(const e of old.encodings)if(e.content_encoding!=='identity')operations.push({UnsetAssetContent:{key:f.key,content_encoding:e.content_encoding}});
          const chunks=[];for(let offset=0;offset<f.content.length;offset+=1000000)chunks.push((await call('create_chunk',[{batch_id:batch,content:f.content.subarray(offset,offset+1000000)}])).chunk_id);
          operations.push({SetAssetContent:{key:f.key,content_encoding:'identity',chunk_ids:chunks,last_chunk:f.content.length?[]:[Buffer.alloc(0)],sha256:[Buffer.from(f.hash,'hex')]}});
          staged[index]=operations;
        }catch(e){uploadError=e;}
      }
    };
    const uploaded=await Promise.allSettled(Array.from({length:Math.min(4,pending.length)},worker));
    for(const result of uploaded)if(result.status==='rejected')uploadError ||= result.reason;
    if(uploadError)throw uploadError;
    const operations=staged.flat();
    const now=await listAssets(call);
    for(const f of pending)if(hashOf(now.find(x=>x.key===f.key))!==hashOf(byKey.get(f.key)))throw Error('Release source changed during publication; retry after reviewing');
    if((await api.call(api.kitchen,'listJobs')).some(j=>j.state==='running'))throw Error('An update started during publication; retry afterwards');
    await call('commit_batch',[{batch_id:batch,operations}]);batch=undefined;
    const actual=new Map((await listAssets(call)).map(a=>[a.key,a]));
    for(const f of files)if(hashOf(actual.get(f.key))!==f.hash)throw Error('Published package verification failed: '+f.key);
    log('Catalogue and all package files verified. Previous releases retained.');
    return {published:true,source:info.pantryId,catalogueSha256:sha(await readFile(resolve(directory,'index.json'))),versions:index.recipes.map(r=>({id:r.id,version:r.version,releaseId:r.releaseId}))};
  } finally {
    if(batch!==undefined)try{await call('delete_batch',[{batch_id:batch}]);}catch(e){log('Batch cleanup needed: '+e.message);}
    const failures=[];for(const permission of added.reverse())try{await call('revoke_permission',[{permission:{[permission]:null},of_principal:operator}]);}catch(e){failures.push(permission+': '+e.message);}
    if(failures.length)throw Error('Publication may have completed; restore temporary upload permissions: '+failures.join('; '));
  }
}
export async function runJob(api,command,app,{log=console.log}={}) {
  const rs=await api.call(api.kitchen,'checkForUpdates'),r=rs.find(r=>r.id===app);if(!r)throw Error('Release not found: '+app);
  log(`${r.name}: ${r.runningVersion||'not installed'} → ${r.version} (${r.releaseId})`);
  const result=await api.call(api.kitchen,command==='verify'?'verifyInstalled':'applyRelease',command==='verify'?[app]:[{id:app,releaseId:r.releaseId,install:command==='install'}]);
  if(!result.ok)throw Error(result.detail);
  const deadline=Date.now()+32*60000;let previous='';
  while(Date.now()<deadline){const [job]=await api.call(api.kitchen,'job',[result.jobId]);if(!job)throw Error('Operation missing');const status=job.steps.map(s=>`${s.status}: ${s.name}${s.detail?' — '+s.detail:''}`).join('\n');if(status!==previous){log(status);previous=status;}if(job.state!=='running'){if(job.state!=='done')throw Error('Operation '+job.id+' needs attention. See Hub → Apps → History.');return job;}await new Promise(r=>setTimeout(r,2000));}
  throw Error('Progress timed out; inspect the existing operation in Hub before retrying');
}
export async function upgradeInstaller(api,directory) {
  const {index,files}=await bundleFiles(directory),r=index.recipes.find(r=>r.kind==='installer');if(!r)throw Error('Bundle has no installer');
  if((await api.call(api.kitchen,'listJobs')).some(j=>j.state==='running'))throw Error('Wait for active operations before updating the installer');
  const before=JSON.parse(await api.cli(['canister','status',api.kitchen,'--json']));
  if(before.module_hash?.replace(/^0x/,'')===r.backend.sha256)return {current:true,version:r.version};
  const old=await api.call(api.kitchen,'info');
  const semver=v=>v.split('.').map(Number);const a=semver(old.version),b=semver(r.version);for(let i=0;i<3;i++){if(b[i]>a[i])break;if(b[i]<a[i])throw Error('Installer downgrade refused');}
  const snapshots=JSON.parse(await api.cli(['canister','snapshot','list',api.kitchen,'--json'])).snapshots;
  const args=['canister','snapshot','create',api.kitchen,'--json'];if(snapshots.length>=10)args.push('--replace',[...snapshots].sort((a,b)=>BigInt(a.taken_at_timestamp)<BigInt(b.taken_at_timestamp)?-1:1)[0].snapshot_id);
  await api.cli(['canister','stop',api.kitchen]);let snapshot;
  try{snapshot=JSON.parse(await api.cli(args));}finally{await api.cli(['canister','start',api.kitchen]);}
  const wasm=resolve(directory,r.backend.path.slice('recipes/'.length));
  if(sha(await readFile(wasm))!==files.find(f=>f.key==='/'+r.backend.path).hash)throw Error('Installer artifact changed');
  await api.cli(['canister','install',api.kitchen,'--mode','upgrade','--wasm-memory-persistence','keep','--wasm',wasm,'--args','()']);
  const after=JSON.parse(await api.cli(['canister','status',api.kitchen,'--json'])),info=await api.call(api.kitchen,'info');
  if(after.module_hash?.replace(/^0x/,'')!==r.backend.sha256||info.version!==r.version||json(before.settings)!==json(after.settings)||info.hubId!==old.hubId||info.pantryId!==old.pantryId)throw Error('Installer verification failed; inspect the snapshot before any recovery');
  return {version:r.version,sha256:r.backend.sha256,snapshot};
}
async function main(){
  const [command,...args]=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected --option value');opts[args[i].slice(2)]=args[i+1];}
  if(!['publish','update','install','verify','upgrade-installer','check'].includes(command)||!opts.kitchen||!opts.identity)throw Error('Usage: node kitchen/tools/release.mjs publish|update|install|verify|check|upgrade-installer --kitchen ID --identity NAME [--network ic] [--bundle /path/recipes] [--app assets]');
  const api=await client(opts);try {const result=command==='publish'?await publish(api,opts.bundle):command==='upgrade-installer'?await upgradeInstaller(api,opts.bundle):command==='check'?await api.call(api.kitchen,'checkForUpdates'):await runJob(api,command,opts.app);console.log(json(result));}finally{await api.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
