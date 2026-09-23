import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture,person} from './fixture.mjs';
const role=process.argv[2]??'admin',empty=process.argv.includes('empty'),dir=mkdtempSync(join(tmpdir(),'crumbs-ui-'));
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://crumbs.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
for(const k of ['window','document','location','history','localStorage'])globalThis[k]=k==='window'?w:w[k];
Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});let interval;globalThis.setInterval=fn=>{interval=fn;return 1;};globalThis.clearInterval=()=>{};globalThis.confirm=()=>true;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(value=''){this.returnValue=value;this.open=false;this.dispatchEvent(new w.Event('close'));};
const $=id=>document.getElementById(id),settle=()=>new Promise(r=>setTimeout(r,30)),go=async v=>{location.hash='#/'+v;await settle();};
try{
 for(const file of ['idl.js','hub-client.js','view.js','access.js','business.js','search-console.js'])copyFileSync(new URL('../dist/'+file,import.meta.url),join(dir,file));
 writeFileSync(join(dir,'package.json'),'{"type":"module"}');writeFileSync(join(dir,'app.js'),readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace('void boot();','').replace('__BACKEND_CANISTER_ID__','aaaaa-aa'));
 const {start}=await import(pathToFileURL(join(dir,'app.js')));const f=fixture({role,empty,unsafe:true});await start(f.actor,{...person,role:role==='manager'?'viewer':role},{version:'0.6.1',hubId:''});
 assert.equal($('layout').hidden,false);assert.equal($('newSite').hidden,true);
 if(empty){assert.equal($('empty').hidden,false);assert.equal($('nav').hidden,true);assert.equal($('reportTools').hidden,true);assert.equal($('websiteControls').hidden,true);if(role!=='admin'){assert.equal($('emptyAdd').hidden,true);assert.match($('emptyCopy').textContent,/website manager/);}else{$('emptyAdd').click();await settle();assert.equal($('v-settings').hidden,false);assert.equal($('empty').hidden,true);assert.equal($('siteForm').elements.id.value,'');}}
 else{
 assert.equal(document.querySelectorAll('.metric').length,5);assert.doesNotMatch($('activity').textContent,/minor units/);$('period').value='7';$('period').dispatchEvent(new w.Event('change'));await settle();assert.ok(f.calls.some(([m,r])=>m==='report'&&r.until-r.from===7n*86400n));$('period').value='custom';$('period').dispatchEvent(new w.Event('change'));const callsBefore=f.calls.length;$('fromDate').value='2026-09-20';$('toDate').value='2026-09-01';$('dateRange').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(f.calls.length,callsBefore);assert.match($('notice').textContent,/start date/);$('period').value='30';$('period').dispatchEvent(new w.Event('change'));await settle();assert.match($('metrics').textContent,/4,286/);assert.equal($('pages').querySelector('img'),null,'untrusted page path escaped');
 $('pages').querySelector('[data-filter]').click();await settle();assert.ok(f.calls.some(([m,r])=>m==='report'&&r.filters.some(x=>x.dimension==='path')));
 await go('goals');assert.match($('goals').textContent,/Signup/);if(role!=='viewer'){$('addGoal').click();const goal=$('goalForm');goal.elements.name.value='Thank you';goal.elements.value.value='/thank-you';goal.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.ok(f.calls.some(([m,g])=>m==='saveGoal'&&g.value==='/thank-you'));assert.equal(goal.hidden,true);}$('runFunnel').click();await settle();assert.match($('funnel').textContent,/42/,$('notice').textContent);const oldFunnel=f.actor.funnel;let finishFunnel;f.actor.funnel=async(...args)=>{await new Promise(resolve=>{finishFunnel=resolve;});return oldFunnel(...args);};$('runFunnel').click();const step=$('funnelSteps').querySelector('[data-step="0"][data-field="value"]');step.value='/changed';step.dispatchEvent(new w.Event('input',{bubbles:true}));finishFunnel();await settle();assert.equal($('funnel').textContent,'','changed funnel inputs invalidate a pending response');f.actor.funnel=oldFunnel;
 $('period').value='7';$('period').dispatchEvent(new w.Event('change'));await settle();assert.equal($('funnel').textContent,'','period changes clear stale funnel results');
 await go('acquisition');assert.match($('acquisitionRows').textContent,/AI assistants/);
 $('savedTools').querySelector('summary').click();assert.equal($('savedTools').open,true);await interval();assert.equal($('savedTools').open,true,'report refresh must not close an active disclosure');document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal($('savedTools').open,false);assert.equal(document.activeElement,$('savedTools').querySelector('summary'));
 assert.equal($('filters').hidden,false,'active filters are visible in Acquisition');
 $('acquisitionDimension').value='aiSource';$('acquisitionDimension').dispatchEvent(new w.Event('change'));await settle();assert.match($('acquisitionRows').textContent,/ChatGPT/);
 await go('all');assert.equal($('newSite').hidden,role!=='admin');assert.match($('allSitesMetrics').textContent,/Site visitor estimates/);
 if(role!=='viewer'){
  await go('goals');$('addGoal').click();const scrollGoal=$('goalForm');scrollGoal.elements.kind.value='scroll';scrollGoal.elements.kind.dispatchEvent(new w.Event('change'));assert.equal($('goalDepthLabel').hidden,false);scrollGoal.elements.name.value='Read article';scrollGoal.elements.value.value='/article';scrollGoal.elements.scrollDepth.value='60';scrollGoal.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.ok(f.calls.some(([m,g])=>m==='saveGoal'&&g.kind.scroll===60n));
  $('saveView').click();$('savedName').value='Campaign funnel';$('saveFunnel').checked=true;const form=$('saveReportForm');form.dispatchEvent(new w.SubmitEvent('submit',{cancelable:true,submitter:form.querySelector('[type=submit]')}));await settle();assert.equal(form.hidden,true);assert.ok(f.calls.some(([m,r])=>m==='saveReport'&&r.steps.length===2));
  await go('settings/search');assert.match($('googleOrigin').textContent,/https:\/\/crumbs.test/);$('googleClientId').value='123-test.apps.googleusercontent.com';const google=$('googleConnectionForm');google.dispatchEvent(new w.SubmitEvent('submit',{cancelable:true,submitter:google.querySelector('[type=submit]')}));await settle();assert.match($('googleConnectionStatus').textContent,/Saved/);
 }
 await go('journeys');assert.match($('journeys').textContent,/pricing/);await go('history');assert.match($('historyRows').textContent,/No imported/);
 await go('api');assert.equal($('v-api').hidden,role==='viewer');
 if(role==='admin'||role==='manager'){
  await go('settings/tracking');assert.equal($('reportTools').hidden,true);assert.equal($('filters').hidden,true);assert.equal($('v-settings').hidden,false);assert.equal($('collectorUrl').value,'https://aaaaa-aa.icp.net');assert.match($('snippet').textContent,/src="https:\/\/crumbs.test\/tracker.js"/);assert.match($('snippet').textContent,/data-endpoint="https:\/\/aaaaa-aa.icp.net\/api\/v1\/events"/);await go('settings/access');assert.match($('accessPanel').textContent,/Hub owners/);$('accessSearch').value='casey';$('accessSearch').dispatchEvent(new w.Event('input'));await new Promise(r=>setTimeout(r,300));assert.equal($('accessPanel').querySelector('img'),null);
  const choose=$('accessCandidates').querySelector('[data-person="p_casey"]');choose.value='manage';choose.dispatchEvent(new w.Event('change',{bubbles:true}));assert.match($('accessMembers').textContent,/casey@example.test/);assert.equal($('accessCandidates').querySelector('[data-person="p_casey"]'),null,'members are not duplicated in search results');
  $('accessForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.ok(f.calls.some(([m,v])=>m==='setSiteAccess'&&v.managers.includes('p_casey')));
  if(role==='manager'){assert.equal($('dangerZone').hidden,true);await go('api');assert.equal($('v-api').hidden,false);f.demote();await interval();assert.equal($('v-api').hidden,true);await go('settings');assert.equal($('v-settings').hidden,true);assert.equal($('accessPanel').textContent,'');}
 }
 if(role==='admin'){await go('settings/general');$('siteForm').elements.name.value='Unsaved website name';$('siteForm').dispatchEvent(new w.Event('input'));await interval();assert.equal($('siteForm').elements.name.value,'Unsaved website name','permission refresh preserves unsaved input');await go('new');assert.equal($('confirmDialog').open,true,'direct navigation protects unsaved changes');$('confirmDialog').close('cancel');await settle();assert.equal(location.hash,'#/settings/general');assert.equal($('siteForm').elements.name.value,'Unsaved website name');await go('new');$('confirmDialog').close('confirm');await settle();assert.equal($('siteForm').elements.id.readOnly,false);const form=$('siteForm');for(const [k,v]of Object.entries({name:'Second',domain:'https://second.example.test/'}))form.elements[k].value=v;const saveSite=f.actor.saveSite;let finishSave;f.actor.saveSite=async(...args)=>{await new Promise(resolve=>{finishSave=resolve;});return saveSite(...args);};form.dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(form.elements.domain.disabled,true,'pending save locks editable fields');form.dispatchEvent(new w.Event('submit',{cancelable:true}));finishSave();await settle();f.actor.saveSite=saveSite;assert.equal(form.elements.domain.disabled,false);assert.equal(f.calls.filter(([m,s])=>m==='saveSite'&&s.id==='second-example-test').length,1);assert.equal($('sitePicker').value,'second-example-test');assert.equal(location.hash,'#/settings/tracking');assert.match($('snippet').textContent,/data-site="second-example-test"/);assert.doesNotMatch($('snippet').textContent,/data-site="example"/);await go('new');form.elements.name.value='Similar domain';form.elements.domain.value='second-example.test';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.ok(f.calls.some(([m,s])=>m==='saveSite'&&s.id==='second-example-test-2'&&s.domain==='second-example.test'),'distinct domains retain distinct website IDs');}
 else if(role==='viewer'){await go('settings');assert.equal($('v-settings').hidden,true);}
 // Release responses that were authorized before the final website grant disappeared.
 async function revokedResponse(method,begin,check){
  const original=f.actor[method],listSites=f.actor.listSites;let release,pending=0;
  const gate=new Promise(resolve=>{release=resolve;});
  f.actor[method]=async(...args)=>{pending++;const result=await original(...args);await gate;return result;};
  await begin();await settle();assert.ok(pending>0,method+' request started');
  f.actor.listSites=async()=>[];await interval();assert.equal($('empty').hidden,false);
  release();await settle();check();assert.ok([...document.querySelectorAll('.view')].every(el=>el.hidden),'no protected view after website access disappears');
  f.actor[method]=original;f.actor.listSites=listSites;await interval();
 }
 await revokedResponse('report',()=>go('overview'),()=>assert.equal($('metrics').textContent,'','late report must not repaint revoked website'));
 await go('goals');
 await revokedResponse('funnel',()=>{$('runFunnel').click();},()=>assert.equal($('funnel').textContent,'','late funnel must not repaint revoked website'));
 if(role==='admin'){
  await revokedResponse('getSiteAccess',()=>go('settings/access'),()=>assert.equal($('accessPanel').textContent,'','late directory must not repaint revoked website'));
  await go('api');
  await revokedResponse('createKey',()=>{$('keyForm').dispatchEvent(new w.Event('submit',{cancelable:true}));},()=>assert.equal($('newKey').textContent,'','late key must not repaint revoked website'));
  const previousCreate=URL.createObjectURL;let downloaded=false;URL.createObjectURL=()=>{downloaded=true;return 'blob:test';};
  await revokedResponse('exportEvents',()=>{$('export').click();},()=>{assert.equal(downloaded,false,'late export must not download revoked website');assert.equal($('exportStatus').textContent,'');});
  URL.createObjectURL=previousCreate;
 }
 f.fail();await go('overview');assert.match($('notice').textContent,/capacity/);assert.equal($('metrics').textContent,'','failed reports never leave misleading cached totals visible');f.invalidate();await interval();assert.equal($('layout').hidden,true,'revocation hides protected content');
 }
 console.log('Crumbs UI smoke passed: '+role+(empty?' empty state':''));
}finally{dom.window.close();rmSync(dir,{recursive:true,force:true});}
