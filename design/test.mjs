import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {JSDOM} from 'jsdom';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>readFileSync(resolve(root,file),'utf8');
const html=read('design/index.html'), script=read('design/standard.js');
const tokens=JSON.parse(read('design/tokens.json'));
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function boot(hash='',storageBlocked=false){
 const dom=new JSDOM(html,{url:'https://example.test/design/'+hash,runScripts:'outside-only'}),w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 if(storageBlocked)Object.defineProperty(w,'localStorage',{get(){throw Error('disabled');}});
 w.eval(script);return {w,d:w.document,close:()=>w.close()};
}
function change(w,element,value){element.value=value;element.dispatchEvent(new w.Event('change',{bubbles:true}));}
test('approved text and control contrast pairs work in both themes',()=>{for(const mode of ['light','dark'])for(const [fg,bg,minimum] of tokens.contrastPairs)assert.ok(ratio(tokens[mode][fg],tokens[mode][bg])>=minimum,`${mode}: ${fg}/${bg} = ${ratio(tokens[mode][fg],tokens[mode][bg]).toFixed(2)} < ${minimum}`);});
test('all source and served documentation links and fragment targets resolve',()=>{
 for(const dir of ['design','hub/dist/design']){
  const d=new JSDOM(read(dir+'/index.html')).window.document;
  const ids=[...d.querySelectorAll('[id]')].map(n=>n.id);assert.equal(ids.length,new Set(ids).size,'duplicate anchor');
  for(const el of d.querySelectorAll('a[href],link[href],script[src]')){
   const value=el.getAttribute('href')||el.getAttribute('src');if(/^https:/.test(value))continue;
   if(value.startsWith('#'))assert.ok(d.getElementById(value.slice(1)),value);
   else assert.ok(existsSync(resolve(root,dir,value.endsWith('/')?value+'index.html':value)),dir+'/'+value);
  }
 }
});
test('a deep link reveals its chapter and rule, even with browser storage unavailable',()=>{
 const {d,close}=boot('#ACCESS-04',true);assert.equal(d.querySelector('.page.is-active').id,'access');assert.equal(d.activeElement.id,'ACCESS-04');assert.equal(d.querySelector('nav [aria-current=page]').hash,'#access');close();
 const invalid=boot('#%E0%A4%A');assert.equal(invalid.d.querySelector('.page.is-active').id,'overview');invalid.close();
});
test('search preserves focus, finds rules by ID, gives an empty state and restores the route',()=>{
 const {w,d,close}=boot('#access'),search=d.querySelector('#rule-search');search.focus();search.value='ACCESS-04';search.dispatchEvent(new w.Event('input'));
 assert.equal(d.querySelector('.page.is-active').id,'search-results');assert.equal(d.querySelectorAll('.search-result').length,1);assert.match(d.querySelector('.search-result').textContent,/one journey/);assert.equal(d.activeElement,search);
 search.value='<img src=x onerror=alert(1)>';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('#results-list img').length,0);assert.equal(d.querySelector('#no-results').hidden,false);
 d.querySelector('#clear-search').click();assert.equal(d.querySelector('.page.is-active').id,'access');assert.equal(d.activeElement,search);close();
});
test('example distinguishes blocked, uncertain and complete results; confirmation is local and explicit',()=>{
 const {w,d,close}=boot(),select=d.querySelector('#demo-state'),button=d.querySelector('#demo-action');
 change(w,select,'blocked');assert.equal(button.disabled,true);assert.match(d.querySelector('#demo-description').textContent,/buyer still needs/);
 change(w,select,'pending');assert.equal(button.disabled,false);button.click();assert.match(d.querySelector('#demo-message').textContent,/Do not create a second/);
 change(w,select,'ready');button.click();assert.ok(d.querySelector('dialog').hasAttribute('open'));d.querySelector('#demo-cancel').click();assert.equal(select.value,'ready');assert.equal(d.activeElement,button);
 button.click();d.querySelector('#demo-confirm').click();assert.equal(select.value,'complete');assert.match(d.querySelector('#demo-message').textContent,/no device or sale was updated/);assert.equal(d.querySelector('#demo-steps [aria-current=step]').textContent,'04 · Complete');close();
});
test('all rules remain readable without JavaScript and docs have no remote runtime assets',()=>{
 const d=new JSDOM(html).window.document;const rules=JSON.parse(read('design/standard.json')).sections.flatMap(s=>s.rules);
 assert.equal(d.querySelectorAll('.rule').length,rules.length);assert.equal(d.querySelectorAll('.rule[hidden]').length,0);
 for(const r of rules)assert.match(d.getElementById(r.id).textContent,/Verify/);
 for(const n of d.querySelectorAll('script[src],link[rel=stylesheet],img[src]'))assert.ok(!/^(https?:)?\/\//.test(n.getAttribute('src')||n.getAttribute('href')));
});
test('domain search finds SSO and AI rules without accidental substring matches',()=>{
 const {w,d,close}=boot(),search=d.querySelector('#rule-search');search.value='SSO';search.dispatchEvent(new w.Event('input'));
 const ids=[...d.querySelectorAll('.search-result')].map(a=>a.hash);assert.ok(ids.includes('#ACCESS-04'));assert.ok(ids.includes('#ACCESS-05'));assert.ok(!ids.includes('#FORMS-01'));
 search.value='AI';search.dispatchEvent(new w.Event('input'));assert.ok([...d.querySelectorAll('.search-result')].some(a=>a.hash==='#AUTOMATION-06'));close();
});
test('mobile search clearing and dialog keyboard boundaries retain useful focus',()=>{
 const {w,d,close}=boot();d.querySelector('#nav-toggle').click();const search=d.querySelector('#rule-search');search.value='SSO';search.dispatchEvent(new w.Event('input'));assert.ok(d.querySelector('.sidebar').classList.contains('is-searching'));
 d.querySelector('#clear-search').click();assert.ok(d.querySelector('.sidebar').classList.contains('is-open'));assert.equal(d.activeElement,search);
 d.querySelector('#demo-action').click();const first=d.querySelector('#demo-cancel'),last=d.querySelector('#demo-confirm');first.focus();first.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(d.activeElement,last);
 last.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(d.activeElement,first);close();
});
test('suite mark preserves the approved website geometry and standalone downloads',()=>{
 const brand=JSON.parse(read('design/brand/registry.json'));
 assert.ok(read('website/src/build.mjs').includes('../../design/brand/registry.json') && read('website/src/build.mjs').includes('suiteBrand.geometry'), 'website imports the canonical suite geometry; website smoke checks rendered bytes');
 assert.equal(read('design/brand/favicon.svg'),read('website/public/favicon.svg'));
 for(const variant of ['light','dark'])assert.ok(read(`design/brand/mark-${variant}.svg`).includes(brand.geometry));
 assert.ok(read('design/brand/lockup.html').includes('class="suite-hyphen"'));
 assert.ok(!read('design/brand/lockup.html').includes('brand-dot'));
});
test('component search reaches the logo and measured catalogue directly',()=>{
 const {w,d,close}=boot(),search=d.querySelector('#rule-search');
 for(const [query,id] of [['logo','#brand'],['tabs','#menus'],['buttons','#buttons'],['fields','#fields']]){
  search.value=query;search.dispatchEvent(new w.Event('input'));
  assert.ok([...d.querySelectorAll('.search-result')].some(a=>a.hash===id),query);
 }
 close();
});
test('tabs support wraparound, Home/End and one focusable selected tab with matching panel',()=>{
 const {w,d,close}=boot('#menus'),tabs=[...d.querySelectorAll('.kit-tabs [role=tab]')];
 function assertSelected(index){
  assert.equal(tabs.filter(t=>t.getAttribute('aria-selected')==='true').length,1);
  assert.equal(tabs.filter(t=>t.tabIndex===0).length,1);
  tabs.forEach((tab,i)=>assert.equal(d.getElementById(tab.getAttribute('aria-controls')).hidden,i!==index));
 }
 tabs[0].focus();tabs[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(d.activeElement,tabs[2]);assertSelected(2);
 tabs[2].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(d.activeElement,tabs[0]);assertSelected(0);
 tabs[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assertSelected(2);
 tabs[2].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assertSelected(0);
 tabs[1].click();assertSelected(1);close();
});
test('pending button feedback cannot be replaced by a duplicate activation',()=>{
 const {w,d,close}=boot('#buttons'),select=d.querySelector('#button-state'),button=d.querySelector('#button-playground'),reason=d.querySelector('#button-reason');
 change(w,select,'disabled');assert.equal(button.disabled,true);assert.match(reason.textContent,/team name/);
 change(w,select,'loading');assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-disabled'),'true');assert.equal(button.getAttribute('aria-busy'),'true');
 button.focus();const pending=reason.textContent;button.click();assert.equal(reason.textContent,pending);assert.equal(d.activeElement,button);
 change(w,select,'ready');button.click();assert.match(reason.textContent,/click received/);assert.equal(button.getAttribute('aria-busy'),'false');close();
});
test('menu selection changes only the local example and retains one active destination',()=>{
 const {w,d,close}=boot('#menus'),links=[...d.querySelectorAll('[data-menu-example]')];
 links[2].click();assert.equal(w.location.hash,'#menus');assert.equal(d.querySelector('#menu-demo-title').textContent,'Contracts');
 assert.equal(links.filter(a=>a.hasAttribute('aria-current')).length,1);assert.equal(links[2].getAttribute('aria-current'),'page');close();
});
