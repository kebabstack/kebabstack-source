import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IDL } from '@dfinity/candid';
import { createRuntime, loadConfig, saveConfig } from '../lib/runtime.mjs';
import { toCandid, fromCandid } from '../lib/candid-json.mjs';
import { didToIdlFactory } from '../lib/did-parse.mjs';
const HUB='rwlgt-iiaaa-aaaaa-aaaaa-cai';
const factory=({IDL})=>IDL.Service({read:IDL.Func([IDL.Text],[IDL.Vec(IDL.Nat)],['query']),write:IDL.Func([IDL.Text,IDL.Nat,IDL.Bool],[IDL.Opt(IDL.Nat)],[]),whoami:IDL.Func([IDL.Text],[IDL.Opt(IDL.Text)],['query'])});
function fixture() {
  const state={active:true,items:[{tileId:1n,name:'Desk',canisterId:'first',url:'https://desk.example.test',note:''}],log:[],tickets:0,fail:false};
  const hub={assistantWhoami:async()=>{if(state.fail)throw Error('Hub unavailable');return state.active?[{expiresAt:1n}]:[];},assistantApps:async()=>state.items,assistantTicket:async(_,id)=>{state.tickets++;return{ok:true,ticket:String(id)};},assistantDisconnect:async()=>{state.active=false;return{ok:true};},assistantPeople:async()=>[]};
  const actor=cid=>({hub_ping:async()=>'desk',loginWithTicket:async()=>[{token:cid+'-token'}],read:async t=>{state.log.push([cid,'read',t]);return state.empty?[]:[1n];},write:async(...a)=>{state.log.push([cid,'write',...a]);return [];},whoami:async()=>{state.log.push([cid,'probe']);return[];}});
  const rt=createRuntime({config:{hubCanisterId:HUB,token:'token'},deps:{actor:async(_,cid)=>cid===HUB?hub:actor(cid),idlFactoryFor:async()=>state.probeUpdate?({IDL})=>IDL.Service({read:IDL.Func([IDL.Text],[IDL.Vec(IDL.Nat)],["query"]),whoami:IDL.Func([IDL.Text],[IDL.Opt(IDL.Text)],[])}):factory},removeConfig:()=>state.removed=true});
  return{state,rt};
}
test('cached app sessions stop on revocation, switch-off and Hub failure, including mutations',async()=>{
  const {state,rt}=fixture();
  await rt.query('desk','read',[]); assert.equal(state.log.length,1);
  state.active=false;
  await assert.rejects(rt.query('desk','read',[]),/no longer accepts/);
  await assert.rejects(rt.call('desk','write',[1,true]),/no longer accepts/);
  await assert.rejects(rt.people(''),/no longer accepts/);
  assert.equal(state.log.length,1);
  state.active=true; await rt.query('desk','read',[]);
  state.fail=true; await assert.rejects(rt.query('desk','read',[]),/Hub unavailable/);
  assert.equal(state.log.length,2);
});
test('query guard and strict arguments stop writes before a session or action',async()=>{
  const {state,rt}=fixture();
  await assert.rejects(rt.query('desk','write',[1,true]),/changes state/);
  await assert.rejects(rt.call('desk','write',[1.1,true]),/exact integer/);
  await assert.rejects(rt.call('desk','write',[1,'maybe']),/true or false/);
  assert.equal(state.tickets,0);assert.deepEqual(state.log,[]);
  assert.equal(await rt.call('desk','write',['1500000000000000000',true]),null);
  assert.equal(state.log.length,1,'an empty successful update is never repeated');
  assert.equal(state.log[0][3],1500000000000000000n);
});
test('exact selectors, duplicate slugs, changed backend and removed tiles never reuse the wrong session',async()=>{
  const {state,rt}=fixture();
  await assert.rejects(rt.query('','read',[]),/exact app/);
  await assert.rejects(rt.query('de','read',[]),/no app/);
  await rt.query('desk','read',[]);
  state.items.push({...state.items[0],tileId:2n,canisterId:'second'});
  await assert.rejects(rt.query('desk','read',[]),/ambiguous/);
  await rt.query('tile:2','read',[]);
  assert.deepEqual(state.log.at(-1),['second','read','second-token']);
  state.items[1].canisterId='third';await rt.query('tile:2','read',[]);
  assert.deepEqual(state.log.at(-1),['third','read','third-token']);
  state.items=[];await assert.rejects(rt.query('tile:1','read',[]),/no app/);
});
test('concurrent reads open one session and disconnect clears its state',async()=>{
  const {state,rt}=fixture();
  await Promise.all([rt.query('desk','read',[]),rt.query('desk','read',[])]);
  assert.equal(state.tickets,1);
  await rt.disconnect(); assert.equal(state.removed,true);
  await assert.rejects(rt.query('desk','read',[]),/not connected/);
});
test('credentials are atomic, private and never silently replaced through a symlink',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-config-'));
  try{
    const file=path.join(dir,'config.json'), cfg={hubCanisterId:HUB,token:'synthetic-test-only'};
    saveConfig(cfg,file);fs.chmodSync(file,0o644);saveConfig(cfg,file);
    assert.deepEqual(loadConfig(file),cfg);
    if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
    const link=path.join(dir,'link');fs.symlinkSync(file,link);
    assert.throws(()=>saveConfig(cfg,link),/symbolic link/);assert.throws(()=>loadConfig(link),/symbolic link/);
    fs.writeFileSync(file,'{broken');assert.throws(()=>loadConfig(file),/cannot read/);
    assert.equal(loadConfig(path.join(dir,'missing')),null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('integer, record and blob conversion cannot silently corrupt a requested action',()=>{
  for(const value of [1.5,Number.MAX_SAFE_INTEGER+1,'',true,undefined])assert.throws(()=>toCandid(IDL.Nat,value));
  assert.throws(()=>toCandid(IDL.Nat,-1));assert.throws(()=>toCandid(IDL.Nat8,256));assert.throws(()=>toCandid(IDL.Int8,-129));
  assert.throws(()=>toCandid(IDL.Vec(IDL.Nat8),[256]));assert.throws(()=>toCandid(IDL.Vec(IDL.Nat8),'bad$'));
  assert.throws(()=>toCandid(IDL.Record({name:IDL.Text}),{}));assert.throws(()=>toCandid(IDL.Record({name:IDL.Text}),{name:'x',wrong:1}));
  assert.throws(()=>toCandid(IDL.Tuple(IDL.Nat),[1,2]));
  assert.equal(fromCandid(1500000000000000000n),'1500000000000000000','large IDs must never become inferred timestamps');
});
test('untrusted interfaces reject pathological depth, duplicate methods and invalid recursive aliases',()=>{
  for(const did of ['service:{ x:('+ 'opt '.repeat(100)+'nat)->(); }','type A=A; service:{x:(A)->();}','service:{x:()->();x:()->();}','service:{x:(record{2:nat;0:text})->();}'])assert.throws(()=>didToIdlFactory(did));
  const service=didToIdlFactory('service:{x:(record{1:nat;0:text})->();}')({IDL});
  assert.equal(service._fields[0][1].argTypes[0].display(),'record {text; nat}');
});

test('a lookalike whoami update is never executed as an expired-session probe',async()=>{
  const {state,rt}=fixture();state.probeUpdate=true;
  const original=Date.now;let time=original();Date.now=()=>time;
  try{
    await rt.query('desk','read',[]);time+=120000;state.empty=true;
    assert.deepEqual(await rt.query('desk','read',[]),[]);
    assert.equal(state.tickets,1,'interface refresh keeps the same valid app session');
    assert.equal(state.log.filter(x=>x[1]==='probe').length,0,'read tool cannot call an update-shaped probe');
  }finally{Date.now=original;}
});
