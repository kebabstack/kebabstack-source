import test from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { PlayerSession, GUEST_KEY } from '../src/player-session.js';
function rig() {
  const data = new Map(), storage = {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  let signedIn = null, refresh;
  const auth = {getPrincipal:()=>signedIn?.getPrincipal(), getStatus:()=>signedIn?'signed-in':'signed-out',
    getIdentity:async()=>refresh ? refresh() : signedIn, signIn:async()=>signedIn=Ed25519KeyIdentity.generate(), signOut:async()=>{signedIn=null}};
  const make = () => new PlayerSession({auth,storage,createGuest:()=>Ed25519KeyIdentity.generate(),restoreGuest:s=>Ed25519KeyIdentity.fromJSON(s)});
  return {data,storage,auth,make,setRefresh:f=>{refresh=f}};
}
test('legacy browser identity and optional local name survive refresh, II login and logout', async()=>{
  const r=rig(), legacy=Ed25519KeyIdentity.generate();r.data.set(GUEST_KEY,JSON.stringify(legacy.toJSON()));
  const a=r.make(), guest=a.snapshot();assert.equal(guest.id,legacy.getPrincipal().toText());a.saveName('BrowserPilot');
  assert.equal(r.make().snapshot().name,'BrowserPilot');await a.signIn();const ii=a.snapshot();assert.equal(ii.kind,'ii');assert.notEqual(ii.id,guest.id);assert.equal(ii.name,'');
  a.saveName('IdentityPilot');assert.equal(r.make().snapshot().name,'IdentityPilot');await a.signOut();assert.equal(a.snapshot().id,guest.id);assert.equal(a.snapshot().name,'BrowserPilot');
});
test('expired or replaced II identity cannot inherit an in-flight ticket',async()=>{
  const r=rig(),a=r.make();await a.signIn();const owner=a.snapshot().id;await a.identity(owner);await a.signOut();
  await assert.rejects(()=>a.identity(owner),/belongs to the player who launched/);
  await a.signIn();await assert.rejects(()=>a.identity(owner),/player changed/);
});
test('account replacement during delegation renewal fails closed',async()=>{
  const r=rig(),a=r.make();await a.signIn();const owner=a.snapshot().id;
  let resolve;r.setRefresh(()=>new Promise(r=>resolve=r));const pending=a.identity(owner);await a.signOut();resolve(Ed25519KeyIdentity.generate());
  await assert.rejects(()=>pending,/player changed/);
});
test('disabled storage still allows a temporary local guest but cannot strand a reserved callsign',async()=>{
  const storage={getItem(){throw Error('disabled')},setItem(){throw Error('disabled')}};
  const a=new PlayerSession({storage,createGuest:()=>Ed25519KeyIdentity.generate(),restoreGuest:()=>assert.fail()});
  assert.equal(a.snapshot().kind,'guest');assert.equal(a.snapshot().id,a.snapshot().id);await assert.rejects(()=>a.identity(),/without ranking/);
});
test('a damaged guest key is replaced persistently, invalid local profiles are ignored',async()=>{
  const r=rig();r.data.set(GUEST_KEY,'broken');const a=r.make();assert.equal((await a.identity()).getPrincipal().toText(),r.make().snapshot().id);
  assert.throws(()=>a.saveName('<script>'),/3–20/);assert.throws(()=>a.saveName('Valid','other'),/player changed/);
});
