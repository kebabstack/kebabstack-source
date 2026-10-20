#!/usr/bin/env node
// Uses an explicitly named ICP CLI identity; never reads/exports private keys.
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {IDL} from '@icp-sdk/core/candid';
import {idlFactory} from '../dist/idl.js';
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+k);return args[i+1];};
const dir=resolve(get('--dir')),canister=get('--canister'),identity=get('--identity'),network=get('--network');
const packageData=JSON.parse(readFileSync(join(dir,'manifest.json'))),m=packageData.manifest;
const valuesBytes=readFileSync(join(dir,'values.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(valuesBytes)!==packageData.valuesSha256)throw Error('Metadata checksum mismatch');
const values=JSON.parse(valuesBytes);if(values.length!==m.values)throw Error('Metadata count mismatch');
let rows=0;for(const c of packageData.chunks){if(!/^\d{5}\.bin$/.test(c.file))throw Error('Invalid chunk name');const data=readFileSync(join(dir,c.file));if(hash(data)!==c.sha256||data.length!==c.rows*36)throw Error('Chunk checksum mismatch');rows+=c.rows;}if(rows!==m.rows)throw Error('Row count mismatch');
if(!args.includes('--send')){console.log(JSON.stringify({mode:'validation only',...m}));process.exit(0);}
const temp=mkdtempSync(join(tmpdir(),'crumbs-dataset-')),methods=new Map(idlFactory({IDL})._fields);
function call(method,input) {
  const spec=methods.get(method),path=join(temp,'args.bin');
  writeFileSync(path,Buffer.from(IDL.encode(spec.argTypes,input)),{mode:0o600});
  const cli=['canister','call',canister,method,
    '--candid',fileURLToPath(new URL('../backend/backend.did',import.meta.url)),
    '--args-file',path,'--args-format','bin','--json','--identity',identity,'--network',network];
  if(/^https?:/.test(network))cli.push('--root-key',get('--root-key'));
  const output=execFileSync('icp',cli,{encoding:'utf8',maxBuffer:1024*1024});
  const response=JSON.parse(output);
  // Copy out of Node's pooled Buffer: Candid decoding requires an exact backing buffer.
  const bytes=Uint8Array.from(Buffer.from(response.response_bytes,'hex'));
  const [result]=IDL.decode(spec.retTypes,bytes);
  if(result?.err)throw Error(method+' rejected: '+JSON.stringify(result.err));
  return result?.ok;
}
try {
  call('beginTrafficDataset',[{...m,kind:{[m.kind]:null},rows:BigInt(m.rows),values:BigInt(m.values),publishedAt:BigInt(m.publishedAt),expiresAt:BigInt(m.expiresAt)}]);
  for(let i=0;i<values.length;i+=500)call('trafficDatasetValues',[m.id,BigInt(i),values.slice(i,i+500)]);
  console.log('Metadata uploaded: '+m.id+' ('+values.length+' values)');
  let offset=0;
  for(let i=0;i<packageData.chunks.length;i+=16){
    const batch=packageData.chunks.slice(i,i+16);
    const data=Buffer.concat(batch.map(c=>readFileSync(join(dir,c.file))));
    const next=offset+batch.reduce((sum,c)=>sum+c.rows,0);
    const acknowledged=call('trafficDatasetChunk',[m.id,BigInt(offset),Uint8Array.from(data)]);
    if(acknowledged!==BigInt(next))throw Error('Unexpected dataset acknowledgement; activation refused');
    offset=next;
    console.log('Ranges uploaded: '+m.id+' '+offset+'/'+m.rows);
  }
  call('activateTrafficDataset',[m.id]);
  console.log('Dataset activated: '+m.id);
}finally{rmSync(temp,{recursive:true,force:true});}
