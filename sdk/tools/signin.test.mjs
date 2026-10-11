import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';import {test} from 'node:test';import assert from 'node:assert/strict';
const src=readFileSync(new URL('../js/hub-client.js',import.meta.url),'utf8').replace(/^export (const|function) /gm,'$1 ');
const markup=readFileSync(new URL('../ui/signin.html',import.meta.url),'utf8');
function fixture(){const dom=new JSDOM(markup,{url:'https://assets.test/#/sale/42',runScripts:'outside-only'});dom.window.eval(src);return dom;}
test('app login waits for session check, locks duplicate clicks and preserves the deep link',()=>{const dom=fixture(),w=dom.window;let urls=[];const ui=w.appSignIn({name:'Assets',hubUrl:'https://hub.test/#/home',navigate:u=>urls.push(u)});assert.equal(ui.continue(),false);ui.ready();assert.equal(ui.continue(),true);assert.equal(ui.continue(),false);assert.equal(urls.length,1);assert.equal(new URL(urls[0]).hash,'');assert.equal(new URL(urls[0]).searchParams.get('jump'),'https://assets.test/');assert.equal(w.sessionStorage.getItem('ks-return'),'#/sale/42');assert.equal(w.document.getElementById('loginBtn').disabled,true);dom.window.close();});
test('failed ticket state unlocks retry; invalid Hub URLs cannot navigate',()=>{const dom=fixture(),w=dom.window;const ui=w.appSignIn({name:'Assets',hubUrl:'javascript:alert(1)',navigate:()=>{throw Error('unsafe navigation')}});ui.status('err','rejected');ui.ready();assert.equal(ui.continue(),false);assert.match(w.document.getElementById('loginStatus').textContent,/couldn’t open/);assert.equal(w.document.getElementById('loginBtn').disabled,false);dom.window.close();});
test('a one-use ticket is scrubbed while the saved deep link and theme return',()=>{const dom=fixture(),w=dom.window;w.sessionStorage.setItem('ks-return','#/sale/42');w.location.hash='uht='+'a'.repeat(64)+'&th=dark';assert.equal(w.takeHubTicket(),'a'.repeat(64));assert.equal(w.location.hash,'#/sale/42');assert.equal(w.document.documentElement.getAttribute('data-theme'),'dark');assert.equal(w.takeHubTicket(),null);dom.window.close();});

test('session and ticket checks show progress without a second company sign-in form, then reveal retry on failure',()=>{
 const dom=fixture(),w=dom.window;
 const style=w.document.createElement('style');style.textContent=readFileSync(new URL('../../hub/dist/signin.css',import.meta.url),'utf8');w.document.head.append(style);
 const ui=w.appSignIn({name:'Assets',hubUrl:'https://hub.test/'}),visible=selector=>w.getComputedStyle(w.document.querySelector(selector)).display!=='none';
 assert.equal(visible('#loginBtn'),false);assert.equal(visible('.auth-ready'),false);assert.equal(visible('.auth-waiting'),true);
 ui.status('','signing in…');assert.equal(visible('#loginBtn'),false);assert.match(w.document.getElementById('authProgress').textContent,/Confirming your access/);
 ui.status('err','Ticket expired');assert.equal(visible('#loginBtn'),true);assert.equal(visible('.auth-ready'),true);assert.equal(w.document.getElementById('loginBtn').disabled,false);
 dom.window.close();
});

test('suite cookie: shared only on a company parent domain, never on gateway suffixes, bare hosts or IPs',()=>{
 const dom=new JSDOM(markup,{url:'https://assets.test/',runScripts:'outside-only'}),w=dom.window;w.eval(src+';window.suiteCookie=suiteCookie;');const c=w.suiteCookie;
 assert.equal(c.domainFor('hub.example-suite.test'),'example-suite.test');assert.equal(c.domainFor('assets.example-suite.test'),'example-suite.test');assert.equal(c.domainFor('hub.intra.company.ch'),'intra.company.ch');assert.equal(c.domainFor('hub.company.ch'),'company.ch');
 for(const h of ['abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io','abcde-cai.raw.icp0.io','abcde-cai.ic0.app','abcde-cai.icp.net','x.icp1.io','company.ch','localhost','app.localhost','127.0.0.1','[::1]',''])assert.equal(c.domainFor(h),'',h);
 dom.window.close();
});
test('suite cookie: write, read and clear on the parent domain; rejects malformed tokens',()=>{
 const dom=new JSDOM(markup,{url:'https://hub.example-suite.test/',runScripts:'outside-only'}),w=dom.window;w.eval(src+';window.suiteCookie=suiteCookie;');const c=w.suiteCookie;
 assert.equal(c.read(),'');assert.equal(c.write('zz',3600),false);assert.equal(c.write('a'.repeat(64),3600),true);assert.equal(c.read(),'a'.repeat(64));
 const other=new JSDOM(markup,{url:'https://assets.example-suite.test/',runScripts:'outside-only',cookieJar:dom.cookieJar});other.window.eval(src+';window.suiteCookie=suiteCookie;');assert.equal(other.window.suiteCookie.read(),'a'.repeat(64),'every tool on the parent domain sees it');
 c.clear();assert.equal(c.read(),'');assert.equal(other.window.suiteCookie.read(),'');
 const gateway=new JSDOM(markup,{url:'https://abcde-cai.icp0.io/',runScripts:'outside-only'});gateway.window.eval(src+';window.suiteCookie=suiteCookie;');assert.equal(gateway.window.suiteCookie.write('a'.repeat(64),3600),false,'no cookie on a public gateway suffix');
 dom.window.close();other.window.close();gateway.window.close();
});
