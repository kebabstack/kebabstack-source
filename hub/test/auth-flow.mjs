import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const auth=section('// Authentication controls share one state;','async function consoleSignOut()');
const sso=section('const REDIRECT_URI =','// ---------- portal avatar');
const consoleEntry=section('const consoleRequested =','async function afterLogin()');
const bootstrap=html.slice(html.lastIndexOf('(async () => {'),html.lastIndexOf('</script>')).trim();
function fixture(url='https://hub.test/'){
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window; Object.defineProperty(w,'crypto',{value:webcrypto});
 w.eval(`var authClient={isAuthenticated:async()=>false,logout:async()=>{window.loggedOut=true}}, anonBackend, backend;
 var $=id=>document.getElementById(id);var opt=x=>x?.length?x[0]:null;var esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 var II_URL='https://identity.ic0.app',CANONICAL_ORIGIN='',IC_HOST='https://icp0.io',BACKEND_CANISTER_ID='aaaaa-aa',idlFactory={};
 function setStatus(id,cls,msg){$(id).className='status '+cls;$(id).textContent=msg}
 function showPortal(){window.portalOpened=true}
 function oidcPending(){return false}function oidcParamsFromHash(){return null}
 async function loadLibs(){}async function loadPortalLogo(){}async function afterLogin(){window.consoleOpened=true}
 async function ssoResume(){window.resumed=true;return false}
 var HttpAgent={create:async()=>({})},Actor={createActor:()=>anonBackend},AuthClient={create:async()=>authClient};
 `+section('async function handoffCall(', 'let handoffBusy')+auth+sso+consoleEntry.replace("const consoleRequested", "var consoleRequested"));
 w.kebabHub={suiteCookie:{clear(){},domainFor(){return '';},read(){return '';}}};
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
test('a successful provider return reaches the verified workspace with passkey storage and sign-in discovery unavailable', async () => {
 const {w, dom} = fixture('https://hub.test/?code=once&state=match');
 const calls = [];
 w.sessionStorage.setItem('uh-pkce', JSON.stringify({id:1, state:'match', verifier:'v'.repeat(96)}));
 w.AuthClient.create = async () => { calls.push('passkey'); throw Error('offline'); };
 w.anonBackend.listSsoProvidersPublic = async () => { calls.push('providers'); throw Error('offline'); };
 w.anonBackend.ssoExchange = async () => { calls.push('exchange'); return {ok:true, token:'company-session', email:'me@example.test', displayName:'Me'}; };
 try {
  await w.eval(bootstrap);
  assert.deepEqual(calls, ['exchange']);
  assert.equal(w.portalOpened, true);
  assert.equal(w.localStorage.getItem('uh-sso-token'), 'company-session');
  assert.equal(w.sessionStorage.getItem('uh-pkce'), null);
  assert.equal(w.location.search, '');
 } finally { dom.window.close(); }
});
test('a returning tool jump checks its session before preparing sign-in, and an expired session can choose another method', async () => {
 for (const valid of [true, false]) {
  const {w, dom} = fixture('https://hub.test/?jump=7');
  const calls = [];
  w.localStorage.setItem('uh-sso-token', 'session');
  w.eval(section('async function ssoResume(', '// ---------- branding'));
  w.anonBackend.ssoWhoami = async token => { assert.equal(token, 'session'); calls.push('whoami'); return valid ? [{active:true}] : []; };
  w.anonBackend.getSetup = async () => { calls.push('setup'); return {setupDone:true}; };
  w.anonBackend.listSsoProvidersPublic = async () => { calls.push('providers'); return []; };
  w.AuthClient.create = async () => { calls.push('passkey'); return w.authClient; };
  try {
   await w.eval(bootstrap);
   assert.equal(calls[0], 'whoami');
   assert.equal(calls.filter(call => call === 'whoami').length, 1);
   assert.equal(w.sessionStorage.getItem('uh-jump'), '7');
   if (valid) {
    assert.deepEqual(calls, ['whoami']);
    assert.equal(w.portalOpened, true);
   } else {
    assert.equal(w.localStorage.getItem('uh-sso-token'), null);
    assert.equal(w.portalOpened, undefined);
    assert.ok(calls.includes('setup') && calls.includes('providers') && calls.includes('passkey'));
    assert.equal(w.document.getElementById('loginBtn').disabled, false);
   }
  } finally { dom.window.close(); }
 }
});
test('a failed callback consumes its one-time state once and restores the available sign-in methods', async () => {
 const {w, dom} = fixture('https://hub.test/?code=once&state=match');
 w.sessionStorage.setItem('uh-pkce', JSON.stringify({id:1, state:'match', verifier:'v'.repeat(96)}));
 let exchanges = 0;
 w.anonBackend.ssoExchange = async () => { exchanges++; return {ok:false, detail:'Please choose your account again.'}; };
 try {
  await w.eval(bootstrap);
  assert.equal(exchanges, 1);
  assert.equal(w.portalOpened, undefined);
  assert.equal(w.resumed, undefined);
  assert.equal(w.document.getElementById('loginBtn').disabled, false);
  assert.equal(w.document.querySelector('#ssoButtons button').disabled, false);
  assert.match(w.document.getElementById('loginStatus').textContent, /choose your account/);
 } finally { dom.window.close(); }
});
test('a slow provider lookup leaves passkey available and a slow passkey store leaves a ready company provider available', async () => {
 for (const slow of ['providers','passkey']) {
  const {w,dom}=fixture();
  let release;
  const client=w.authClient;
  w.authClient=null;
  if (slow==='providers') {
   w.AuthClient.create=async()=>client;
   w.anonBackend.listSsoProvidersPublic=()=>new Promise(resolve=>{release=()=>resolve([]);});
  } else {
   w.AuthClient.create=()=>new Promise(resolve=>{release=()=>resolve(client);});
  }
  try {
   const boot=w.eval(bootstrap); await new Promise(resolve=>setImmediate(resolve));
   const control=slow==='providers'?w.document.getElementById('loginBtn'):w.document.querySelector('#ssoButtons button');
   assert.ok(control); assert.equal(control.disabled,false);
   release(); await boot; await new Promise(resolve=>setImmediate(resolve));
  } finally {dom.window.close();}
 }
});
test('timed-out provider verification and warm session checks do not apply late responses', async () => {
 for(const callback of [true,false]) {
  const {w,dom}=fixture(callback?'https://hub.test/?code=once&state=match':'https://hub.test/?jump=3');
  let resolveCall;
  w.setTimeout=fn=>setTimeout(fn,2); w.clearTimeout=clearTimeout;
  try {
   if(callback){
    w.sessionStorage.setItem('uh-pkce',JSON.stringify({id:1,state:'match',verifier:'v'.repeat(96)}));
    w.anonBackend.ssoExchange=()=>new Promise(r=>{resolveCall=r;});
    assert.equal(await w.ssoHandleRedirect(),false);
    resolveCall({ok:true,token:'expired-attempt',email:'sample@example.test',displayName:'Sample'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(w.localStorage.getItem('uh-sso-token'),null);
   }else{
    w.localStorage.setItem('uh-sso-token','retained');
    w.anonBackend.ssoWhoami=()=>new Promise(r=>{resolveCall=r;});
    w.handoffRetry=null;
    w.handoffScreen=(message,failed)=>{assert.ok(failed);w.recovery=message;};
    w.eval(section('async function ssoResume(', '// ---------- branding'));
    assert.equal(await w.ssoResume(true),true);
    assert.equal(typeof w.handoffRetry,'function');assert.match(w.recovery,/try again/i);
    resolveCall([]); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(w.localStorage.getItem('uh-sso-token'),'retained');
   }
   assert.equal(w.portalOpened,undefined);
  }finally{dom.window.close();}
 }
});
test('a freshly verified company session replaces an old cookie; a session change during issuance discards the result', async () => {
 for(const changed of [false,true]){
  const {w,dom}=fixture();let cookie='previous',issue;
  w.kebabHub={suiteCookie:{read:()=>cookie,clear:()=>{cookie='';},write:value=>{cookie=value;},domainFor:()=> 'example.test'}};
  w.pActor=()=>w.anonBackend;w.pTok=()=>w.localStorage.getItem('uh-sso-token');
  w.localStorage.setItem('uh-sso-token','current');
  w.anonBackend.mintSuiteLogin=token=>{assert.equal(token,'current');return new Promise(r=>{issue=r;});};
  try{
   const ready=w.ensureSuiteLogin(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(cookie,'');
   if(changed)w.localStorage.setItem('uh-sso-token','next');
   issue({ok:true,token:'replacement',expiresAt:BigInt(Date.now()+3600000)*1000000n});await ready;
   assert.equal(cookie,changed?'':'replacement');
  }finally{dom.window.close();}
 }
});
test('sign-out retries the original credentials, leaves another tab’s new account intact, and clears the cookie before Hub startup', async () => {
 const {w,dom}=fixture('https://hub.test/?signout=1');
 const log=[];let deny=true,current='original';
 w.localStorage.setItem('uh-sso-token','previous');
 w.kebabHub.suiteCookie.clear=()=>{log.push('clear');};
 w.loadLibs=async()=>{log.push('init');};
 w.AuthClient.create=async()=>{const key=current;return {isAuthenticated:async()=>true,getIdentity:()=>({getPrincipal:()=>({toText:()=>key})}),logout:async()=>{log.push('logout:'+key);}};};
 w.anonBackend.ssoLogout=async token=>{log.push('sso:'+token);if(deny)throw Error('offline');return true;};
 const publicApi=w.anonBackend;
 w.Actor.createActor=(_idl,{agent})=>agent.identity?{revokeSuiteLogin:async token=>{assert.equal(token,'');log.push('passkey:'+agent.identity.getPrincipal().toText());current='new';return true;}}:publicApi;
 w.HttpAgent.create=async args=>args;
 try{
  await w.eval(bootstrap);
  assert.deepEqual(log,['clear','init','sso:previous']);
  assert.equal(w.localStorage.getItem('uh-sso-token'),null);
  assert.equal(w.sessionStorage.getItem('ks-signout'),'1');
  assert.equal(w.document.getElementById('loginBtn').disabled,true);
  assert.equal(w.document.getElementById('loginRetry').classList.contains('hidden'),false);
  w.localStorage.setItem('uh-sso-token','new');
  deny=false;await w.eval(bootstrap);
  assert.deepEqual(log,['clear','init','sso:previous','init','sso:previous','passkey:original']);
  assert.equal(w.localStorage.getItem('uh-sso-token'),'new');
  assert.equal(w.sessionStorage.getItem('ks-signout'),null);
  assert.equal(w.sessionStorage.getItem('ks-signout-sso'),null);
 }finally{dom.window.close();}
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
test('an expired original delegation allows explicit fresh sign-in without signing out the replacement', async () => {
 for(const replacement of ['', 'new-passkey']){
  const {w,dom}=fixture('https://hub.test/?signout=1');
  w.sessionStorage.setItem('ks-signout','1');w.sessionStorage.setItem('ks-signout-sso','');
  w.sessionStorage.setItem('ks-signout-key','previous-passkey');w.sessionStorage.setItem('ks-signout-cookie-cleared','1');
  w.localStorage.setItem('uh-sso-token','new-company');
  let revoked=0,loggedOut=0;
  w.AuthClient.create=async()=>({isAuthenticated:async()=>!!replacement,getIdentity:()=>({getPrincipal:()=>({toText:()=>replacement})}),logout:async()=>{loggedOut++;}});
  w.anonBackend.revokeSuiteLogin=async()=>{revoked++;return true;};
  try{
   await w.eval(bootstrap);
   assert.equal(w.sessionStorage.getItem('ks-signout'),'1');
   assert.match(w.document.getElementById('loginStatus').textContent,/could not confirm revocation/);
   const button=w.document.getElementById('loginRetry');assert.match(button.textContent,/Continue to sign-in/);button.click();await new Promise(resolve=>setImmediate(resolve));
   assert.equal(w.sessionStorage.getItem('ks-signout'),null);
   assert.equal(w.localStorage.getItem('uh-sso-token'),'new-company');
   assert.equal(w.document.getElementById('loginBtn').disabled,false);
   assert.equal(revoked,0);assert.equal(loggedOut,0);
  }finally{dom.window.close();}
 }
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

test('explicit Hub console entry cannot resume into the employee menu',async()=>{
 for(const authenticated of [false,true]){const {w,dom}=fixture('https://hub.test/?console=1#/home');w.authClient.isAuthenticated=async()=>authenticated;w.localStorage.setItem('uh-sso-token','company-session');w.anonBackend.ssoWhoami=async()=>[{active:true,email:'owner@example.test'}];
 try{await w.eval(bootstrap);assert.equal(w.resumed,undefined);assert.equal(w.portalOpened,undefined);assert.equal(w.document.getElementById('ssoButtons').hidden,true);assert.match(w.document.getElementById('loginRole').textContent,/requires a passkey/);assert.equal(w.consoleOpened,authenticated?true:undefined);assert.equal(w.localStorage.getItem('uh-sso-token'),'company-session');assert.equal(w.location.search,'');}finally{dom.window.close()}}
});
test('app handoff takes precedence over an earlier console-entry request',async()=>{
 const {w,dom}=fixture('https://hub.test/?jump=7');w.sessionStorage.setItem('ks-console-entry','1');w.ssoResume=async()=>{w.resumed=true;return true};try{await w.eval(bootstrap);assert.equal(w.resumed,true);assert.equal(w.consoleOpened,undefined);assert.equal(w.document.getElementById('ssoButtons').hidden,false)}finally{dom.window.close()}
});

test('console uses the matching authorized passkey; mismatched accounts and ordinary members stay out',async()=>{
 for(const scenario of ['matching owner','different account','ordinary member']){
  const {w,dom}=fixture('https://hub.test/?console=1#/home');w.sessionStorage.setItem('ks-console-entry','1');w.localStorage.setItem('uh-sso-token','company');
  w.anonBackend.ssoWhoami=async()=>[{email:'owner@example.test',active:true}];
  w.authClient.isAuthenticated=async()=>true;w.authClient.getIdentity=()=>({getPrincipal:()=>({toText:()=> 'test-passkey'})});
  let adminChecks=0;const api={myAccess:async()=>({email:[scenario==='different account'?'someone@example.test':'owner@example.test']}),amIAdmin:async()=>{adminChecks++;return scenario!=='ordinary member'},myRole:async()=> 'owner'};w.Actor.createActor=()=>api;
  w.eval(`async function loadYou(){} async function mountConsoleTopbar(){}function checkVersions(){}async function refreshConns(){}function applyRoute(){return false}function go(){window.openedConsole=true}`+section('const consoleRequested =','(async () => {'));
  try{await w.prepareConsoleEntry();assert.equal(w.openedConsole,scenario==='matching owner'?true:undefined);assert.equal(w.portalOpened,undefined);if(scenario==='different account'){assert.equal(adminChecks,0);assert.equal(w.loggedOut,true);assert.match(w.document.getElementById('loginStatus').textContent,/owner@example.test/)}if(scenario==='ordinary member')assert.match(w.document.getElementById('loginStatus').textContent,/no Hub console access/);if(scenario==='matching owner')assert.equal(w.sessionStorage.getItem('ks-console-entry'),null);}finally{dom.window.close()}
 }
});
