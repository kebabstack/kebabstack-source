import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {PocketIc, PocketIcServer, SubnetStateType, CanisterCyclesCostSchedule} from '@dfinity/pic';
import {setup, identity, idl} from './helpers/oncall.mjs';
import {candidateBackend} from './packaged-wasm.mjs';

test('Falcon alert reaches internal support once and survives a failed acknowledgement', {timeout:480000},async()=>{
  const mops=fileURLToPath(new URL('../node_modules/.bin/mops',import.meta.url));
  const runtime=fileURLToPath(new URL('./falcon-runtime/',import.meta.url));
  const binPath=process.env.FALCON_POCKET_IC_BIN || execFileSync(mops,['toolchain','bin','pocket-ic'],{cwd:runtime,encoding:'utf8'}).trim();
  const server=await PocketIcServer.start({binPath});
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const c=await setup(pic,!!process.env.KEBAB_CUSTOMER_BASELINE);
    const rt=(await c.desk.catalog(c.tokens.owner)).find(t=>!t.fields.length);
    const original=await c.desk.agentCreate(c.tokens.owner,{typeId:rt.id,subject:'Existing support request',body:'Keep this note',fields:[],requester:'employee@customer.test',priority:'normal',channel:'agent'});
    assert.ok(original.ok);
    const serial='MAC012345678';
    const assetBase=process.env.FALCON_ASSETS_BASELINE;
    const assets=await pic.setupCanister({sender:identity.controller,controllers:[identity.controller],wasm:assetBase?assetBase+'/backend.wasm':candidateBackend('assets'),idlFactory:await idl(assetBase?assetBase+'/backend.did':'assets/backend/dist/backend.did')});
    assets.actor.setPrincipal(identity.controller);
    await assets.actor.setHub(c.h.canisterId.toText());
    c.hub.setPrincipal(identity.owner);
    const inventory=await c.hub.connectApp({name:'assets',canisterId:assets.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Assets',kind:'app',url:'https://assets.customer.test'}]});
    assert.ok(inventory.ok,inventory.detail);
    const [policy]=await c.hub.getAppPermissions(inventory.id);
    assert.ok((await c.hub.setAppPermissions(inventory.id,policy.revision,{app:'assets',defaultRole:'member',people:[],groups:[]})).ok);
    const ticket=await c.hub.mintAppTicket('',inventory.tileId);
    const [admin]=await assets.actor.loginWithTicket(ticket.ticket);
    const mac=await assets.actor.createAsset(admin.token,{tag:'TEST-MAC',serial,vendor:'Apple',model:'MacBook',kind:'laptop',note:''});
    assert.ok(mac.ok);assert.ok((await assets.actor.addEventTo(admin.token,mac.id,'handed_out','beta@customer.test','Fixture')).ok);
    const tenant='a'.repeat(32), client='b'.repeat(32), start='2026-11-17T10:00:00Z';
    const config=['eu-1',tenant,client,'test-client-secret',c.conn.id,start];
    c.hub.setPrincipal(identity.employee);
    await assert.rejects(c.hub.connectFalcon(...config));
    c.hub.setPrincipal(identity.owner);
    assert.ok(await c.hub.connectFalcon(...config));
    assert.ok(!await c.hub.connectFalcon(...config));
    const legacyKey='a'.repeat(32)+':alert:123';
    c.desk.setPrincipal(c.h.canisterId);
    const legacyId=await c.desk.hub_falconIntake({compositeId:legacyKey,updated:'2026-11-17T10:01:00Z',title:'Synthetic endpoint alert',host:'managed-'+serial,severity:'Critical',providerStatus:'new',url:'',identity:[],resolutions:[]});
    for(const [name,instance] of [['hub',c.h],['desk',c.b],['assets',assets]]) {
      await pic.upgradeCanister({sender:identity.controller,canisterId:instance.canisterId,wasm:candidateBackend(name),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
      c[name]=pic.createActor(await idl(name+'/backend/dist/backend.did'),instance.canisterId);
    }
    c.hub.setPrincipal(identity.owner);
    await c.refresh();
    assert.equal((await c.desk.getTicket(c.tokens.owner,original.id))[0].ticket.body,'Keep this note');
    assert.ok((await c.hub.falconSettings()).connected,'Existing Falcon credentials and Desk binding survive the upgrade');
    assert.ok(!await c.hub.connectFalcon(...config));
    const alert={cid:tenant,composite_id:tenant+':alert:123',updated_timestamp:'2026-11-17T10:01:00Z',display_name:'Synthetic endpoint alert',device:{hostname:'managed-'+serial},user_principal:'employee@customer.test',severity_name:'Critical',status:'new'};
    const deferred=pic.createDeferredActor(await idl('hub/backend/dist/backend.did'),c.h.canisterId);
    deferred.setPrincipal(identity.owner);
    const filter={view:'falcon',q:'',status:'',queue:'',assignee:''};
    let writeMode='fail',patches=0;
    const volume=1001;
    const pages=[];
    for(let i=0;i<volume;i++) pages.push({...alert,composite_id:tenant+':alert:'+String(i).padStart(5,'0'),display_name:'Endpoint alert '+i});
    let bulk=false, requested=[];
    let richTelemetry = { samples: Array(6000).fill({ enabled: false, child: null, message: 'unrelated telemetry' }) };

    async function run(){
      const finish=await deferred.syncFalcon();
      for(let i=0;i<200;i++){
        await pic.tick(4);
        // The pinned PocketIC client omits PATCH from its request decoder.
        const rows=await pic.client.get('/read/get_canister_http');
        for(const req of rows){
          const url=new URL(req.url);
          assert.equal(url.origin,'https://api.eu-1.crowdstrike.com');
          let body, status=200;
          switch(url.pathname){
            case '/oauth2/token': body={access_token:'test-token'};break;
            case '/alerts/combined/alerts/v1':
              if(!bulk) {body={resources:[{...alert, telemetry: richTelemetry},alert]}; richTelemetry = {};break;}
              const query=JSON.parse(Buffer.from(req.body,'base64'));
              assert.equal(query.sort,'composite_id|asc');
              assert.match(query.filter,/updated_timestamp:<=/);
              const offset=Number(query.after||0);requested.push(offset);
              body={resources:pages.slice(offset,offset+20),meta:{pagination:offset+20<volume?{after:String(offset+20)}:{}}};
              break;
            case '/alerts/entities/alerts/v2': body={resources:[alert]};break;
            case '/alerts/entities/alerts/v3':
              assert.equal(req.http_method,'PATCH');patches++;
              assert.deepEqual(JSON.parse(Buffer.from(req.body,'base64')).composite_ids,[alert.composite_id]);
              if(writeMode==='fail')status=503;
              else if(writeMode!=='unconfirmed'){
                for(const {name,value} of JSON.parse(Buffer.from(req.body,'base64')).action_parameters){
                  if(name==='update_status')alert.status=value;
                  else if(name==='add_tag')alert.tags=[...new Set([...(alert.tags||[]),value])];
                  else if(name==='remove_tag')alert.tags=alert.tags.filter(t=>t!==value);
                  else assert.fail(name);
                }
              }
              body={};break;
            default: assert.fail(url.pathname);
          }
          await pic.mockPendingHttpsOutcall({requestId:req.request_id,subnetId:identity.owner.constructor.fromUint8Array(Buffer.from(req.subnet_id.subnet_id,'base64')),response:{type:'success',statusCode:status,headers:[],body:Buffer.from(JSON.stringify(body))}});
        }
        if(!(await c.hub.falconSettings()).running && i>2){await finish();return;}
      }
      assert.fail('Sync did not finish');
    }
    await run();
    const [page]=await c.desk.internalQueuePage(c.tokens.alpha,filter,[]);
    assert.equal(page.total,1n); const id=page.rows[0].id;
    assert.equal(id,legacyId);
    const device=await c.desk.falconDeviceView(c.tokens.owner,id);
    assert.equal(device.device[0].id,mac.id);
    assert.equal(device.device[0].owner,c.ids.beta);
    assert.equal(device.url,'https://assets.customer.test');
    assert.equal((await c.desk.falconDeviceView(c.tokens.alpha,id)).device.length,0);
    assert.equal((await c.desk.getTicket(c.tokens.alpha,id))[0].requester.email,'employee@customer.test');
    assert.equal((await c.desk.personOverview(c.tokens.alpha,id))[0].person.email,'employee@customer.test');
    assert.equal((await c.desk.falconDeviceView(c.tokens.employee,id)).state,'unavailable');
    assert.deepEqual(await c.desk.getTicket(c.tokens.employee,id),[]);
    assert.ok(!(await c.desk.takeFalconTicket(c.tokens.employee,id)).ok);
    assert.ok((await c.desk.takeFalconTicket(c.tokens.alpha,id)).ok);
    const record=async()=>(await c.desk.getTicket(c.tokens.alpha,id))[0].falcon[0];
    await run();assert.equal((await record()).pending,true);assert.equal(patches,1);
    writeMode='ok';await run();assert.equal((await record()).pending,false);assert.equal((await record()).alert.providerStatus,'in_progress');assert.equal(patches,2);
    await run();assert.equal(patches,2);assert.equal((await c.desk.internalQueuePage(c.tokens.owner,filter,[]))[0].total,1n);
    const edit=async(status,reason='',token=c.tokens.alpha)=>c.desk.setFalconStatus(token,id,status,reason,(await c.desk.getTicket(c.tokens.alpha,id))[0].ticket.updatedAt);
    const deskState=async()=>(await c.desk.getTicket(c.tokens.alpha,id))[0].ticket.status;
    const finish=async(reason,token=c.tokens.alpha)=>c.desk.bulkInternalTickets(token,[{id,updatedAt:(await c.desk.getTicket(c.tokens.alpha,id))[0].ticket.updatedAt}],{finish:{status:'resolved',falconResolution:reason}});
    assert.ok('denied' in await finish('ignored',c.tokens.employee));
    assert.ok('invalid' in await finish('invented'));
    assert.match((await finish('')).ok[0].result.skipped,/Still open/);
    alert.tags=['keep_custom_tag'];
    assert.equal((await c.desk.setStatus(c.tokens.alpha,id,'resolved','')).ok,false);
    assert.equal((await edit('closed','invented')).ok,false);
    assert.equal((await edit('closed','false_positive',c.tokens.employee)).ok,false);
    assert.ok('updated' in (await finish('false_positive')).ok[0].result);
    assert.equal((await edit('closed','true_positive')).ok,false);
    writeMode='unconfirmed';await run();
    assert.equal((await record()).edit.length,1);
    assert.notEqual(await deskState(),'resolved');
    writeMode='ok';await run();
    assert.deepEqual(alert.tags,['keep_custom_tag','false_positive']);assert.equal(alert.status,'closed');
    assert.equal(await deskState(),'resolved');assert.equal((await record()).edit.length,0);
    for(const reason of ['true_positive','ignored']){
      assert.ok((await edit('closed',reason)).ok);await run();
      assert.deepEqual(alert.tags,['keep_custom_tag',reason]);assert.equal((await record()).alert.resolutions[0][0],reason);
    }
    assert.ok((await edit('reopened')).ok);await run();assert.equal(await deskState(),'open');
    assert.ok((await edit('new')).ok);await run();assert.equal(await deskState(),'new');
    assert.ok((await edit('closed','false_positive')).ok);
    alert.status='closed';alert.tags=['keep_custom_tag','true_positive'];
    const beforeConflict=patches;await run();assert.equal(patches,beforeConflict);assert.equal(await deskState(),'new');
    assert.equal((await c.desk.internalQueuePage(c.tokens.owner,filter,[]))[0].total,0n);
    assert.equal((await record()).edit.length,0);
    assert.ok('updated' in (await finish('ignored')).ok[0].result);await run();assert.equal(await deskState(),'resolved');assert.equal(patches,beforeConflict);
    // A later console reopen is actionable even while the Desk workflow is resolved.
    alert.status='reopened';alert.updated_timestamp='2026-11-17T10:02:00Z';
    await run();assert.equal(await deskState(),'resolved');
    assert.equal((await c.desk.internalQueuePage(c.tokens.owner,filter,[]))[0].total,1n);
    alert.status='closed';alert.updated_timestamp='2026-11-17T10:03:00Z';
    await run();assert.equal((await c.desk.internalQueuePage(c.tokens.owner,filter,[]))[0].total,0n);
    bulk=true;
    for(let k=0;k<Math.ceil(volume/20);k++)await run();
    assert.deepEqual(requested,Array.from({length:51},(_,i)=>i*20));
    const [many]=await c.desk.internalQueuePage(c.tokens.owner,filter,[]);
    assert.equal(many.total,BigInt(volume));assert.equal(many.rows.length,100);
    assert.equal((await c.desk.internalQueuePage(c.tokens.employee,filter,[])).length,0);
    bulk=false;
    alert.status='new';
    delete alert.user_principal;
    alert.composite_id=tenant+':alert:asset-owner';
    await run();
    const findTicket=async(subject)=>(await c.desk.internalQueuePage(c.tokens.owner,{...filter,q:subject},[]))[0].rows[0];
    const ownerTicket=await findTicket('beta@customer.test');
    assert.equal((await c.desk.getTicket(c.tokens.owner,ownerTicket.id))[0].requester.id,c.ids.beta);
    assert.deepEqual(await c.desk.getTicket(c.tokens.employee,ownerTicket.id),[]);
    assert.ok((await c.assets.addEventTo(admin.token,mac.id,'returned','','Back in stock')).ok);
    assert.ok((await c.assets.addEventTo(admin.token,mac.id,'handed_out','alpha@customer.test','Reassigned')).ok);
    assert.equal((await c.desk.falconDeviceView(c.tokens.owner,ownerTicket.id)).device[0].owner,c.ids.alpha);
    assert.equal((await c.desk.getTicket(c.tokens.owner,ownerTicket.id))[0].requester.id,c.ids.beta);
    alert.device.hostname='unknown-unassigned';
    alert.composite_id=tenant+':alert:unknown';alert.display_name='Unknown device fixture';
    await run();
    const unknown=await findTicket('Unknown device fixture');
    assert.equal(unknown.requesterName,'Affected employee not identified');
    assert.deepEqual(await c.desk.personOverview(c.tokens.owner,unknown.id),[]);
    assert.equal(await c.hub.disconnectFalcon(),true);
  } finally {await pic.tearDown();await server.stop();}
});
