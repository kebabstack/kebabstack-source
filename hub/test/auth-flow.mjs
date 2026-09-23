import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const auth=section('// Authentication controls share one state;','async function consoleSignOut()');
const sso=section('const REDIRECT_URI =','// ---------- portal avatar');
const bootstrap=html.slice(html.lastIndexOf('(async () => {'),html.lastIndexOf('</script>')).trim();
function fixture(url='https://hub.test/'){
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window; Object.defineProperty(w,'crypto',{value:webcrypto});
 w.eval(`var authClient={isAuthenticated:async()=>false,logout:async()=>{window.loggedOut=true}}, anonBackend, backend;
 var $=id=>document.getElementById(id);var esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 var II_URL='https://identity.ic0.app',CANONICAL_ORIGIN='',IC_HOST='https://icp0.io',BACKEND_CANISTER_ID='aaaaa-aa',idlFactory={};
 function setStatus(id,cls,msg){$(id).className='status '+cls;$(id).textContent=msg}
 function showPortal(){window.portalOpened=true}
 function oidcPending(){return false}function oidcParamsFromHash(){return null}
 async function loadLibs(){}async function loadPortalLogo(){}async function afterLogin(){}
 async function ssoResume(){window.resumed=true;return false}
 var HttpAgent={create:async()=>({})},Actor={createActor:()=>anonBackend},AuthClient={create:async()=>authClient};
 `+auth+sso);
 w.anonBackend={listSsoProvidersPublic:async()=>[{id:1n,name:'Company Okta'}],getSetup:async()=>({setupDone:true,orgName:'Example'})};
 w.eval('loginSettle()');return{w,dom};
}
test('SSO callback waits for server verification; no success animation delay',async()=>{
 const {w,dom}=fixture('https://hub.test/?code=one-use&state=match');
 w.sessionStorage.setItem('uh-pkce',JSON.stringify({id:1,state:'match',verifier:'v'.repeat(96)}));
 let finish;w.anonBackend.ssoExchange=()=>new Promise(r=>finish=r);
 const running=w.ssoHandleRedirect();
 assert.equal(w.portalOpened,undefined);assert.match(w.document.getElementById('authProgress').textContent,/Verifying/);
 assert.equal(w.document.getElementById('loginBtn').disabled,true);
 finish({ok:true,token:'test-session',email:'me@example.test',displayName:'Me'});
 assert.equal(await running,true);assert.equal(w.portalOpened,true);assert.equal(w.location.search,'');
 dom.window.close();
});
test('bad state, corrupt storage and provider cancellation recover without exchanging a code',async()=>{
 for(const variant of ['state','storage','cancel']){
  const {w,dom}=fixture('https://hub.test/?'+(variant==='cancel'?'error=access_denied':'code=x')+'&state=match');
  w.sessionStorage.setItem('uh-pkce',variant==='storage'?'{broken':JSON.stringify({id:1,state:variant==='state'?'wrong':'match',verifier:'v'.repeat(96)}));
  w.anonBackend.ssoExchange=()=>{throw new Error('must not exchange')};
  assert.equal(await w.ssoHandleRedirect(),false);assert.equal(w.portalOpened,undefined);assert.equal(w.document.getElementById('loginBtn').disabled,false);assert.ok(w.document.getElementById('loginStatus').textContent.length>20);
  dom.window.close();
 }
});
test('all provider controls lock together and failed exchange can be retried',async()=>{
 const {w,dom}=fixture('https://hub.test/?code=x&state=match');await w.renderSsoButtons();w.loginWait();
 assert.ok([...w.document.querySelectorAll('#ssoButtons button,#loginBtn')].every(b=>b.disabled));
 w.sessionStorage.setItem('uh-pkce',JSON.stringify({id:1,state:'match',verifier:'v'.repeat(96)}));w.anonBackend.ssoExchange=async()=>({ok:false,detail:'Sign-in refused'});
 assert.equal(await w.ssoHandleRedirect(),false);assert.ok([...w.document.querySelectorAll('#ssoButtons button,#loginBtn')].every(b=>!b.disabled));
 dom.window.close();
});
test('signout takes precedence over resuming a stored SSO session',async()=>{
 const {w,dom}=fixture('https://hub.test/?jump=7&signout=1');w.localStorage.setItem('uh-sso-token','old-session');w.anonBackend.ssoLogout=async()=>true;
 await w.eval(bootstrap);assert.equal(w.loggedOut,true);assert.equal(w.resumed,undefined);assert.equal(w.localStorage.getItem('uh-sso-token'),null);assert.equal(w.sessionStorage.getItem('uh-jump'),null);
 dom.window.close();
});
test('Okta initiated login retains both the provider and the app jump',async()=>{
 const {w,dom}=fixture('https://hub.test/?jump=7&ssostart=1');w.ssoStart=async id=>{w.startedProvider=id};
 await w.eval(bootstrap);assert.equal(w.startedProvider,1);assert.equal(w.sessionStorage.getItem('uh-jump'),'7');assert.equal(w.location.search,'');
 dom.window.close();
});
test('a failed startup retains signout intent for the reload',async()=>{
 const {w,dom}=fixture('https://hub.test/?signout=1');
 w.localStorage.setItem('uh-sso-token','old-session'); w.anonBackend.ssoLogout=async()=>true;
 w.loadLibs=async()=>{throw new Error('temporary network failure')};
 await w.eval(bootstrap);
 assert.equal(w.location.search,'');assert.equal(w.sessionStorage.getItem('ks-signout'),'1');assert.equal(w.resumed,undefined);
 w.loadLibs=async()=>{};await w.eval(bootstrap);
 assert.equal(w.loggedOut,true);assert.equal(w.localStorage.getItem('uh-sso-token'),null);assert.equal(w.resumed,undefined);
 dom.window.close();
});

test('TV startup never resumes an Owner login or SSO session',async()=>{
 const {w,dom}=fixture('https://hub.test/#/tv');
 w.localStorage.setItem('uh-sso-token','private-owner-session');
 w.AuthClient.create=()=>{throw Error('must not open AuthClient')};
 w.HttpAgent.create=async options=>{assert.equal(options.identity,undefined);return {anonymous:true}};
 let opened=false;w.KebabDisplays={createTV:(root,api)=>{opened=true;assert.equal(root.id,'tv');assert.equal(api,w.anonBackend)}};
 await w.eval(bootstrap);assert.equal(opened,true);assert.equal(w.resumed,undefined);assert.equal(w.localStorage.getItem('uh-sso-token'),'private-owner-session');assert.equal(w.document.documentElement.dataset.surface,'display');
 dom.window.close();
});
