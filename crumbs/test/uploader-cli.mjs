// Explicit local-only acceptance: node crumbs/test/uploader-cli.mjs PACKAGE_DIR WASM.
// Creates and deletes one named test identity; never reads a user's private keys.
import {PocketIc,PocketIcServer} from '@dfinity/pic';
import {Principal} from '@icp-sdk/core/principal';
import {idlFactory} from '../dist/idl.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const packageDir=resolve(process.argv[2]),wasm=resolve(process.argv[3]);
const manifest=JSON.parse(await readFile(join(packageDir,'manifest.json'),'utf8')).manifest;
const run=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'crumbs-cli-test-')),identity='crumbs-native-test-'+randomUUID();let server,pic,created=false;
try{
 await run('icp',['identity','new',identity,'--storage','plaintext','--output-seed',join(dir,'seed')]);created=true;
 const {stdout}=await run('icp',['identity','principal','--identity',identity]);const controller=Principal.fromText(stdout.trim());
 server=await PocketIcServer.start();pic=await PocketIc.create(server.getUrl(),{nns:{state:{type:'new'}},application:[{state:{type:'new'}}]});await pic.setTime(new Date());
 const app=await pic.setupCanister({sender:controller,controllers:[controller],wasm,idlFactory});
 const key=Buffer.from(await pic.getPubKey((await pic.getNnsSubnet()).id)).toString('hex'),port=await pic.makeLive();
 const result=await run(process.execPath,[new URL('../tools/upload-traffic.mjs',import.meta.url).pathname,'--dir',packageDir,'--canister',app.canisterId.toText(),'--identity',identity,'--network','http://127.0.0.1:'+port,'--root-key',key,'--send'],{timeout:120000,maxBuffer:1000000});
 assert.match(result.stdout,/Dataset activated/);const datasets=await app.actor.trafficDatasets();assert.equal(datasets.length,1);assert.equal(datasets[0].rows,BigInt(manifest.rows));assert.equal(datasets[0].id,manifest.id);console.log('PASS: real ICP CLI, isolated local identity, verified root key, packaged canister, '+manifest.rows+' ranges activated.');
}finally{if(pic){await pic.stopLive();await pic.tearDown();}await server?.stop();if(created)await run('icp',['identity','delete',identity]);await rm(dir,{recursive:true,force:true});console.log('Local test identity and seed removed.');}
