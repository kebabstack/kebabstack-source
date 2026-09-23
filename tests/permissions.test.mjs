import {candidateBackend} from './packaged-wasm.mjs';
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';
const apps = ['assets','contracts','desk','forms','trust','watch'];
const principals = Object.fromEntries(['controller','owner','global','appadmin','alice','bob'].map(n=>[n,createIdentity('permissions-'+n).getPrincipal()]));
const code='cd'.repeat(32);
let server;
before(async()=>{server=await PocketIcServer.start();});
after(async()=>{await server?.stop();});
async function install(pic,name,baseline=false) {
  const path=name==='crumbs'&&process.env.KEBAB_CRUMBS_BASELINE?process.env.KEBAB_CRUMBS_BASELINE:baseline?resolve(process.env.KEBAB_PERMISSIONS_BASELINE,name):resolve(name,'backend/dist');
  const js=execFileSync('python3',['sdk/tools/did2idl.py',path+'/backend.did'],{encoding:'utf8'});
  const {idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  return {...await pic.setupCanister({sender:principals.controller,controllers:[principals.controller],wasm:baseline||name==='crumbs'&&process.env.KEBAB_CRUMBS_BASELINE?path+'/backend.wasm':name==='hub'&&process.env.KEBAB_REPORTING_HUB_WASM?process.env.KEBAB_REPORTING_HUB_WASM:candidateBackend(name),idlFactory,environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:code}]:[]}),idlFactory};
}
async function setup(pic,baseline=false) {
  const h=await install(pic,'hub',baseline), hub=h.actor;
  hub.setPrincipal(principals.owner);
  assert.equal((await hub.claimHubWithCode(code,{email:'owner@permissions.test',displayName:'Owner',orgName:'Permissions test'})).ok,true);
  for(const name of ['global','appadmin','alice','bob']) {
    hub.setPrincipal(principals.owner);
    assert.equal(await hub.addLocalUser(name+'@permissions.test',name,'',''),true);
    const [invite]=await hub.createInvite(name+'@permissions.test');hub.setPrincipal(principals[name]);assert.equal(await hub.claimInvite(invite),true);
  }
  hub.setPrincipal(principals.owner);assert.equal((await hub.setPersonRole('global@permissions.test','admin')).ok,true);
  await pic.tick(3);
  const ids={};for(const name of Object.keys(principals).filter(x=>x!=='controller'))ids[name]=(await hub.personCard(name+'@permissions.test'))[0].pid;
  return {...h,hub,ids};
}
async function connect(pic,h,name,baseline=false) {
  const f=await install(pic,name,baseline);const app=f.actor;app.setPrincipal(principals.controller);await app.setHub(h.canisterId.toText());
  h.hub.setPrincipal(principals.owner);
  const c=await h.hub.connectApp({name,canisterId:f.canisterId.toText(),note:'',lanes:baseline?['identity','roles']:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name,kind:'app',url:`https://${name}.permissions.test`}]});assert.equal(c.ok,true,c.detail);
  const login=async who=>{h.hub.setPrincipal(principals[who]);const t=await h.hub.mintAppTicket('',c.tileId);return t.ok?(await app.loginWithTicket(t.ticket))[0]:undefined;};
  return {...f,app,c,login};
}
async function save(h,f,policy) {
  h.hub.setPrincipal(principals.owner);const [v]=await h.hub.getAppPermissions(f.c.id);
  const r=await h.hub.setAppPermissions(f.c.id,v.revision,policy);assert.equal(r.ok,true,r.detail);
}
const policy=(app,people=[])=>({app,defaultRole:app==='watch'?'none':'member',people,groups:[]});

test('lunch team-directory keeps its roster, filters and legacy access across Hub upgrade and six-app centralization', {skip:!process.env.KEBAB_PERMISSIONS_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic,true), lunch=createIdentity('lunch-connector').getPrincipal();
  h.hub.setPrincipal(principals.owner);
  const token=await h.hub.genScimToken();
  for(const [name,city,entity,active] of [['onsite','Zurich','AG',true],['llc','Zurich','LLC',true],['remote','Remote - CH','AG',true],['departed','Zurich','AG',false]]) {
   const r=await h.hub.http_request_update({method:'POST',url:'/scim/v2/Users',headers:[['Authorization','Bearer '+token]],body:Buffer.from(JSON.stringify({userName:name+'@lunch.test',name:{givenName:name,familyName:'Fixture'},displayName:name,active,addresses:[{type:'work',locality:city}],'urn:okta:fixture:1.0:user:custom':{entity}}))});assert.equal(r.status_code,201);
  }
  const c=await h.hub.connectApp({name:'Lunch Check-in',canisterId:lunch.toText(),note:'existing roster consumer',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]});assert.equal(c.ok,true);
  assert.equal(await h.hub.setConnectorFilters(c.id,['entity=LLC','city^=Remote']),true);
  const read=async()=>{h.hub.setPrincipal(lunch);return {members:await h.hub.team_members(),info:await h.hub.team_info(),directory:await h.hub.connectorDirectory()};};
  const before=await read();const active=before.members.filter(m=>m.active[0]!==false).map(m=>m.email);
  assert.ok(active.includes('onsite@lunch.test'));for(const n of ['llc','remote','departed'])assert.ok(!active.includes(n+'@lunch.test'));
  await pic.upgradeCanister({sender:principals.controller,canisterId:h.canisterId,wasm:process.env.KEBAB_REPORTING_HUB_WASM||candidateBackend('hub'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  const js=execFileSync('python3',['sdk/tools/did2idl.py','hub/backend/dist/backend.did'],{encoding:'utf8'});
  const {idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));h.hub=pic.createActor(idlFactory,h.canisterId);
  assert.deepEqual(await read(),before,'upgrade preserves the complete Lunch contract');
  for(const name of apps){const f=await connect(pic,h,name);await save(h,f,policy(name,[{id:h.ids.alice,role:'none'}]));}
  assert.deepEqual(await read(),before,'six central policies cannot change Lunch roster or attributes');
  h.hub.setPrincipal(principals.owner);
  const conn=(await h.hub.listConnectors()).find(x=>x.id===c.id);assert.equal(conn.permissionsManaged,false);assert.deepEqual(conn.filters,['entity=LLC','city^=Remote']);
  assert.equal((await h.hub.setAppPermissions(c.id,0n,policy('lunch'))).ok,false,'Lunch cannot accidentally enter the six-app protocol');
  assert.equal(await h.hub.setConnectorFilters(c.id,['entity=LLC']),true,'existing Lunch controls still work');
  assert.ok((await read()).members.some(m=>m.email==='remote@lunch.test'&&m.active[0]!==false));
 }finally{await pic.tearDown();}
});
async function check(h,f) {h.hub.setPrincipal(principals.owner);const r=await h.hub.checkAppPermissions(f.c.id);assert.equal(r.ok,true,r.detail);return (await h.hub.getAppPermissions(f.c.id))[0];}
async function content(app,name,tok) {
  switch(name) {
    case 'assets':return app.listAssets(tok,'','',false);
    case 'desk':return app.listTickets(tok,{view:'all',status:'',queue:'',assignee:'',q:''});
    case 'forms':return app.listForms(tok);
    case 'contracts':return app.listContracts(tok,{q:'',status:'',responsible:'',onlyIncomplete:false,onlyDue:false,includeArchived:false});
    case 'trust':return app.devices(tok);
    case 'watch':return app.listDomains(tok);
  }
}
for(const name of apps) test(`${name}: Hub role authority, all/own access, local overrides refused and open-session revocation`,async()=>{
  const pic=await PocketIc.create(server.getUrl());
  try {
    const h=await setup(pic), f=await connect(pic,h,name), {app}=f;
    assert.equal(await f.login('owner'),undefined,'missing policy fails closed even for a global owner');
    await save(h,f,policy(name,[{id:h.ids.appadmin,role:'admin'}]));
    const owner=await f.login('owner'),global=await f.login('global'),admin=await f.login('appadmin');
    for(const s of [owner,global,admin]){assert.ok(s);assert.equal((await app.whoami(s.token))[0].role,'admin');assert.equal((await app.getSettings(s.token)).length,1);}
    assert.equal((await app.claimAdmin(owner.token)).ok,false);
    assert.equal((await app.setAdminEmails(owner.token,['bob@permissions.test'])).ok,false);
    const settings=(await app.getSettings(owner.token))[0];const obsolete={...settings,adminGroup:'attempted-local-admins'};
    if(name==='watch')obsolete.trustedOperators=[settings.trustedOperators];
    assert.equal((await (name==='desk'?app.updateSettings(owner.token,obsolete):app.setSettings(owner.token,obsolete))).ok,false,'retired role fields cannot be changed via the API');

    app.setPrincipal(principals.controller);assert.equal(await app.addAdminEmail('bob@permissions.test'),false);
    assert.equal((await check(h,f)).enforced,true,'confirmed without the optional global roles lane');
    const p=policy(name,[{id:h.ids.appadmin,role:'admin'}]);
    if(name==='watch') {assert.equal(await f.login('alice'),undefined,'watch has no employee data area');p.people.push({id:h.ids.alice,role:'viewer'});await save(h,f,p);await check(h,f);}
    const alice=await f.login('alice'),bob=await f.login('bob');assert.ok(alice);if(name!=='watch')assert.ok(bob);
    assert.equal((await app.getSettings(alice.token)).length,0);
    if(name==='forms') {
      const mine=(await app.createForm(alice.token,'Alice confidential'))[0];const other=(await app.createForm(bob.token,'Bob confidential'))[0];
      assert.deepEqual((await app.listForms(alice.token)).map(x=>x.id),[mine.id]);assert.deepEqual(await app.getForm(alice.token,other.id),[]);
      for(const s of [owner,global,admin])assert.equal((await app.getForm(s.token,other.id)).length,1);
      assert.equal((await app.deleteForm(alice.token,other.id)).ok,false);
      assert.equal((await app.deleteForm(admin.token,other.id)).ok,true);
      assert.equal((await app.restoreForm(admin.token,other.id)).ok,true);
    } else if(name==='contracts') {
      const sp=await app.createSpace(alice.token,'Alice team','');assert.equal(sp.ok,true);
      assert.equal((await app.openSpace(bob.token,sp.id)).ok,false);
      for(const s of [owner,global,admin])assert.equal((await app.openSpace(s.token,sp.id)).ok,true);
      assert.equal((await app.openSpace(bob.token,'personal:'+h.ids.alice)).ok,false);
      for(const s of [owner,global,admin])assert.equal((await app.openSpace(s.token,'personal:'+h.ids.alice)).ok,true);
      const fields={title:'Alice agreement',vendor:'Example',product:'',customerRef:'',responsible:'',deputy:'',visibility:'team',viewers:[],seats:[],holders:[],tags:[]};
      const own=await app.createContract(alice.token,fields);assert.equal(own.ok,true,own.detail);
      assert.deepEqual(await app.getContract(bob.token,own.id),[]);
      const adminInAlice=(await app.openSpace(admin.token,'personal:'+h.ids.alice)).token;
      assert.equal((await app.getContract(adminInAlice,own.id))[0].contract.responsible,h.ids.alice);
      const onBehalf=await app.createContract(adminInAlice,{...fields,title:'Created by administrator'});assert.equal(onBehalf.ok,true,onBehalf.detail);
      assert.equal((await app.getContract(alice.token,onBehalf.id))[0].contract.responsible,h.ids.alice,'admin does not take over personal ownership');
      assert.equal((await app.moveContract(adminInAlice,onBehalf.id,1n,'personal:'+h.ids.bob)).ok,true);
      assert.equal((await app.getContract(bob.token,onBehalf.id))[0].contract.responsible,h.ids.bob,'personal destination owner gets responsibility');
      assert.deepEqual(await app.getContract(alice.token,onBehalf.id),[],'former owner loses employee access after transfer');

    } else {
      if(name==='watch')assert.equal((await app.addDomain(owner.token,{name:'permissions.test',types:['A'],watchers:[],note:'fixture'})).ok,true);
      else assert.equal((await app.seedDemo(owner.token)).ok,true);
      const rows=await content(app,name,owner.token);assert.ok(rows.length>0);
      assert.equal((await content(app,name,admin.token)).length,rows.length);
      const own=await content(app,name,alice.token);if(name==='watch')assert.equal(own.length,rows.length);else assert.ok(own.length<rows.length,'employee cannot browse the whole inventory');
    }
    h.hub.setPrincipal(principals.global);assert.equal((await h.hub.setAppPermissions(f.c.id,1n,p)).ok,false,'global admins cannot delegate privileges');
    h.hub.setPrincipal(principals.owner);const prior=(await h.hub.getAppPermissions(f.c.id))[0];
    assert.equal((await h.hub.setAppPermissions(f.c.id,0n,p)).ok,false,'stale revision is rejected');
    assert.equal((await h.hub.setConnectorAccess(f.c.id,{mode:'everyone',people:[],groups:[],roles:[]})).ok,false);
    const next=policy(name,[{id:h.ids.appadmin,role:'none'}]);await save(h,f,next);
    assert.equal((await h.hub.getAppPermissions(f.c.id))[0].enforced,false,'saved changes are not claimed to be applied');
    assert.equal((await check(h,f)).revision,prior.revision+1n);
    assert.deepEqual(await app.whoami(admin.token),[],'existing app admin session is revoked without re-login');
    assert.deepEqual(await content(app,name,admin.token),[]);
    assert.equal((await app.whoami(owner.token))[0].role,'admin');
    await pic.stopCanister({sender:principals.controller,canisterId:h.canisterId});await pic.advanceTime(60_000);await pic.tick(2);
    assert.deepEqual(await app.whoami(owner.token),[],'even owners lose protected access when their directory lease expires');
  } finally {await pic.tearDown();}
});

test('precedence, stable IDs, audit provenance and central policy survive Hub upgrade',async()=>{
 const pic=await PocketIc.create(server.getUrl());try {
  const h=await setup(pic),f=await connect(pic,h,'forms');h.hub.setPrincipal(principals.owner);
  const g=await h.hub.addGroup('IT','');assert.equal(g.ok,true);assert.equal((await h.hub.setGroupMembers(g.id,['alice@permissions.test','bob@permissions.test'],[])).ok,true);
  const p={...policy('forms'),groups:[{id:g.id,role:'admin'}],people:[{id:h.ids.alice,role:'none'},{id:h.ids.owner,role:'none'}]};await save(h,f,p);
  let v=(await h.hub.getAppPermissions(f.c.id))[0];const role=id=>v.people.find(x=>x.id===h.ids[id]);
  h.hub.setPrincipal(principals.global);
  assert.equal((await h.hub.setGroupMembers(g.id,['appadmin@permissions.test'],[])).ok,false,'group membership cannot bypass owner-only role grants');
  assert.equal((await h.hub.grantAccess({email:'appadmin@permissions.test',target:'group:'+g.id,hours:1n,reason:'attempted bypass'})).ok,false);
  assert.equal((await h.hub.removeGroup(g.id)).ok,false);
  h.hub.setPrincipal(principals.owner);

  assert.equal(role('alice').role,'none');assert.equal(role('bob').role,'admin');assert.equal(role('owner').role,'admin');assert.match(role('bob').source,/Group: IT/);
  assert.equal(await f.login('alice'),undefined);assert.equal((await f.login('bob')).role,'admin');
  h.hub.setPrincipal(principals.owner);assert.equal((await h.hub.renameLocalUser('bob@permissions.test','renamed@permissions.test')).ok,true);
  assert.equal((await h.hub.getAppPermissions(f.c.id))[0].enforced,false,'identity change invalidates a matching policy revision');
  await check(h,f);v=(await h.hub.getAppPermissions(f.c.id))[0];assert.equal(role('bob').role,'admin');
  assert.equal((await h.hub.personAppPermissions(h.ids.bob)).find(x=>x.cid===f.c.id).role,'admin');
  const {items}=await h.hub.listUsers({activeOnly:false,conn:[],limit:100n,offset:0n,search:''});
  assert.equal(await h.hub.deactivateUser(items.find(x=>x.email==='renamed@permissions.test').key,'fixture'),true);
  await check(h,f);v=(await h.hub.getAppPermissions(f.c.id))[0];assert.equal(role('bob').role,'none','inactive wins over group grants');
  await pic.upgradeCanister({sender:principals.controller,canisterId:h.canisterId,wasm:process.env.KEBAB_REPORTING_HUB_WASM||candidateBackend('hub'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  v=(await h.hub.getAppPermissions(f.c.id))[0];assert.equal(v.revision,1n);assert.deepEqual(v.policy,p);
  h.hub.setPrincipal(principals.alice);await assert.rejects(h.hub.getAppPermissions(f.c.id));
 }finally{await pic.tearDown();}
});

test('populated deployed baselines upgrade with records intact and historical local admins inert', {skip:!process.env.KEBAB_PERMISSIONS_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try {
  const h=await setup(pic,true),fixtures=[];
  for(const name of apps) {
   const f=await connect(pic,h,name,true),s=await f.login('owner');assert.ok(s,'baseline owner login '+name);
   // Preserve a real historical local grant; it must not survive as authority.
   f.app.setPrincipal(principals.controller);assert.equal(await f.app.addAdminEmail('appadmin@permissions.test'),true);
   if(name==='watch')assert.equal((await f.app.addDomain(s.token,{name:'before-upgrade.test',types:['A'],watchers:[],note:'saved before upgrade'})).ok,true);
   else assert.equal((await f.app.seedDemo(s.token)).ok,true);
   const rows=await content(f.app,name,s.token);assert.ok(rows.length>0,name+' populated');fixtures.push({...f,name,count:rows.length});
  }
  const upgrade=async(f,name)=>{
   await pic.upgradeCanister({sender:principals.controller,canisterId:f.canisterId,wasm:candidateBackend(name),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
   const js=execFileSync('python3',['sdk/tools/did2idl.py',name+'/backend/dist/backend.did'],{encoding:'utf8'});
   const {idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));return pic.createActor(idlFactory,f.canisterId);
  };
  h.hub=await upgrade(h,'hub');h.hub.setPrincipal(principals.owner);
  for(const f of fixtures) {
   await save(h,f,policy(f.name));
   f.app=await upgrade(f,f.name);
   const login=async who=>{h.hub.setPrincipal(principals[who]);const t=await h.hub.mintAppTicket('',f.c.tileId);return t.ok?(await f.app.loginWithTicket(t.ticket))[0]:undefined;};
   const s=await login('owner');assert.ok(s,'upgraded owner login '+f.name);
   assert.equal((await content(f.app,f.name,s.token)).length,f.count,f.name+' records survived');
   const old=await login('appadmin');
   if(f.name==='watch')assert.equal(old,undefined);else {assert.ok(old);assert.notEqual((await f.app.whoami(old.token))[0].role,'admin');assert.equal((await f.app.getSettings(old.token)).length,0);}
   const view=await check(h,f);assert.equal(view.enforced,true);assert.ok(view.status[0].legacy.some(x=>x.email==='appadmin@permissions.test'),'migration reference retained');
   // A second candidate upgrade also retains the central policy and records.
   f.app=await upgrade(f,f.name);await pic.tick(4);const again=await login('owner');assert.ok(again);assert.equal((await content(f.app,f.name,again.token)).length,f.count);
  }
 }finally{await pic.tearDown();}
});

for(const [name,grant,internal] of [['desk','agent','agent'],['trust','viewer','helpdesk']])test(`${name}: explicit specialist role reads all data without app administration`,async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),f=await connect(pic,h,name);await save(h,f,policy(name,[{id:h.ids.alice,role:grant}]));
  const a=await f.login('owner'),v=await f.login('alice');assert.equal(v.role,internal);assert.equal((await f.app.seedDemo(a.token)).ok,true);
  assert.equal((await content(f.app,name,v.token)).length,(await content(f.app,name,a.token)).length);assert.equal((await f.app.getSettings(v.token)).length,0);
 }finally{await pic.tearDown();}
});

test('an individual admin assignment follows a rename but never a re-issued email; concurrent saves cannot overwrite',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),f=await connect(pic,h,'forms');const p=policy('forms',[{id:h.ids.appadmin,role:'admin'}]);await save(h,f,p);await check(h,f);
  h.hub.setPrincipal(principals.owner);assert.equal((await h.hub.renameLocalUser('appadmin@permissions.test','renamed-admin@permissions.test')).ok,true);
  assert.equal((await h.hub.getAppPermissions(f.c.id))[0].people.find(x=>x.id===h.ids.appadmin).role,'admin');
  assert.equal(await h.hub.setLocalUserActive('renamed-admin@permissions.test',false),true);
  const token=await h.hub.genScimToken();const res=await h.hub.http_request_update({method:'POST',url:'/scim/v2/Users',headers:[['Authorization','Bearer '+token]],body:Buffer.from(JSON.stringify({userName:'renamed-admin@permissions.test',displayName:'New holder',active:true}))});assert.equal(res.status_code,201);
  await pic.tick(3);const replacement=(await h.hub.personCard('renamed-admin@permissions.test'))[0].pid;assert.notEqual(replacement,h.ids.appadmin);
  const view=(await h.hub.getAppPermissions(f.c.id))[0];assert.equal(view.people.find(x=>x.id===replacement).role,'member');assert.equal(view.people.find(x=>x.id===h.ids.appadmin).role,'none');
  assert.equal((await h.hub.setAppPermissions(f.c.id,1n,p)).ok,false,'former identity assignment must be explicitly removed');
  const outcomes=await Promise.all([h.hub.setAppPermissions(f.c.id,1n,policy('forms')),h.hub.setAppPermissions(f.c.id,1n,{...policy('forms'),defaultRole:'none'})]);assert.equal(outcomes.filter(x=>x.ok).length,1);
  assert.equal((await h.hub.getAppPermissions(f.c.id))[0].revision,2n);
 }finally{await pic.tearDown();}
});

test('deployed Crumbs policy survives the Hub reporting upgrade with deny-by-default and scoped Analyst access', {skip:!process.env.KEBAB_CRUMBS_BASELINE||!process.env.KEBAB_PERMISSIONS_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic,true),f=await connect(pic,h,'crumbs');
  const p={app:'crumbs',defaultRole:'none',people:[{id:h.ids.alice,role:'viewer'}],groups:[]};await save(h,f,p);await check(h,f);
  const before=(await h.hub.getAppPermissions(f.c.id))[0];
  assert.equal((await f.login('owner')).role,'admin');assert.equal(await f.login('bob'),undefined);assert.equal((await f.login('alice')).role,'viewer');
  await pic.upgradeCanister({sender:principals.controller,canisterId:h.canisterId,wasm:process.env.KEBAB_REPORTING_HUB_WASM||candidateBackend('hub'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  const after=await check(h,f);assert.deepEqual(after.policy,before.policy);assert.deepEqual(after.people.map(x=>[x.id,x.role]),before.people.map(x=>[x.id,x.role]));
  assert.equal((await f.login('owner')).role,'admin');assert.equal(await f.login('bob'),undefined);assert.equal((await f.login('alice')).role,'viewer');
  assert.deepEqual(await f.app.listSites((await f.login('alice')).token),[],'Analyst has no unshared site access');
 }finally{await pic.tearDown();}
});

test('canonical product logos follow validated identity; external pictures and authorization remain independent',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic), f=await connect(pic,h,'assets');
  h.hub.setPrincipal(principals.owner);
  const external=await h.hub.addAppLink({name:'Assets',url:'https://external.permissions.test',note:'external naming collision',kind:'link'});
  assert.equal(external.ok,true);
  const picture=Uint8Array.from([137,80,78,71]);
  assert.equal((await h.hub.setTileIcon(external.id,picture,'image/png')).ok,true);
  await save(h,f,policy('assets'));
  h.hub.setPrincipal(principals.owner);
  assert.equal((await h.hub.setTileIcon(f.c.tileId,picture,'image/png')).ok,false,'canonical logo cannot be replaced');
  assert.equal((await h.hub.clearTileIcon(f.c.tileId)).ok,false,'canonical logo cannot be removed');
  assert.equal((await h.hub.updateAppLink(f.c.tileId,{name:'Company hardware',url:'https://assets.permissions.test',note:'renamed',kind:'app'})).ok,true);
  const [mark]=await h.hub.tileIcon(f.c.tileId);
  assert.equal(mark.mime,'image/svg+xml');
  assert.match(Buffer.from(mark.img).toString(),/M4 4h16v12H4zM2 20h20M8 16l-1 4m9-4 1 4/);
  assert.equal((await h.hub.listAppLinks()).find(x=>x.id===f.c.tileId).hasIcon,true);
  assert.deepEqual((await h.hub.tileIcon(external.id))[0].img,picture,'same display name does not select a product mark');
  h.hub.setPrincipal(principals.alice);
  assert.equal((await h.hub.setTileIcon(external.id,picture,'image/png')).ok,false,'employee cannot edit external branding');
  assert.equal((await h.hub.clearTileIcon(external.id)).ok,false);
  h.hub.setPrincipal(principals.owner);
  assert.equal((await h.hub.clearTileIcon(external.id)).ok,true,'external logo management stays available');
 }finally{await pic.tearDown();}
});

test('branding release upgrades populated current apps without changing records, policies or external pictures', {skip:!process.env.KEBAB_BRAND_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  // SLA breach is a time-derived display value; stored deadlines and all other fields must survive.
  const storedRows=(name,rows)=>name==='desk'?rows.map(({breached,...row})=>row):rows;
  const h=await setup(pic,true),fixtures=[];
  for(const name of apps){
   const f=await connect(pic,h,name,true);await save(h,f,policy(name));
   const s=await f.login('owner');assert.ok(s,'existing owner login');
   if(name==='watch')assert.equal((await f.app.addDomain(s.token,{name:'brand-upgrade.test',types:['A'],watchers:[],note:'retained'})).ok,true);
   else assert.equal((await f.app.seedDemo(s.token)).ok,true);
   const rows=await content(f.app,name,s.token);assert.ok(rows.length);
   h.hub.setPrincipal(principals.owner);
   const p=(await h.hub.getAppPermissions(f.c.id))[0];
   fixtures.push({...f,name,rows,policy:p.policy,revision:p.revision});
  }
  h.hub.setPrincipal(principals.owner);
  const outside=await h.hub.addAppLink({name:'Lunch',url:'https://lunch.brand.test',kind:'link',note:'external'});
  const png=Uint8Array.from([137,80,78,71]);assert.equal((await h.hub.setTileIcon(outside.id,png,'image/png')).ok,true);
  for(const [f,name] of [[h,'hub'],...fixtures.map(f=>[f,f.name])])await pic.upgradeCanister({sender:principals.controller,canisterId:f.canisterId,wasm:candidateBackend(name),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  await pic.tick(5);
  h.hub.setPrincipal(principals.owner);
  assert.deepEqual((await h.hub.tileIcon(outside.id))[0].img,png,'external branding retained');
  for(const f of fixtures){
   const p=(await h.hub.getAppPermissions(f.c.id))[0];assert.deepEqual(p.policy,f.policy);assert.equal(p.revision,f.revision);
   const s=await f.login('owner');assert.ok(s);assert.deepEqual(storedRows(f.name,await content(f.app,f.name,s.token)),storedRows(f.name,f.rows),f.name+' business records retained');
   const [mark]=await h.hub.tileIcon(f.c.tileId);assert.equal(mark.mime,'image/svg+xml');assert.ok((await check(h,f)).enforced);
  }
 }finally{await pic.tearDown();}
});
