import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const scenario=process.argv[2]||'accept';
const root=resolve('assets/dist'), temp=mkdtempSync(join(tmpdir(),'assets-deal-ui-'));
const key='ab'.repeat(32), pdf=Buffer.from('%PDF-1.4\n'+'fixture '.repeat(25)), hash=createHash('sha256').update(pdf).digest('hex');
const calls=[]; let invalid=false;
const d={id:4n,status:'offered',buyer:{name:'Alex <script>unsafe</script>',email:'buyer@example.test',street:'Seestrasse',houseNo:'2',postalCode:'8002',town:'Zürich',country:'CH'},sellerName:'Test company',device:'MacBook Pro',serial:'TEST123',description:'Used equipment',grossMinor:50000n,currency:'CHF',vatRate:'8.1',terms:'Keep every clause. <img src=x onerror=alert(1)>',termsVersion:2n,quote:'quote1',acceptedAt:0n,invoice:[],pdfReady:false,pdfHash:'',completedAt:0n,paidAt:0n,handedOverAt:0n,expiresAt:BigInt(Date.now()+14*86400000)*1000000n,changed:false};
globalThis.__fakeBackend={
  getDeal:async(id,k)=>{calls.push('getDeal');assert.equal(id,4n);assert.equal(k,key);return invalid?[]:[structuredClone(d)];},
  visitDeal:async()=>{calls.push('visitDeal');return true;},
  acceptDeal:async(id,k,q,a)=>{calls.push('acceptDeal');assert.equal(q,d.quote);assert.equal(a.country,'CH');d.status='issued';d.acceptedAt=1n;d.pdfReady=true;d.pdfHash=hash;d.invoice=[{number:'IT-2026-0001',seller:{name:d.sellerName},dueOn:'2026-09-22',acceptedLine:'Accepted by private link'}];return {ok:true,detail:'accepted'};},
  declineDeal:async(id,k,q,r)=>{calls.push('declineDeal');assert.equal(q,d.quote);assert.equal(r,'No thanks');d.status='cancelled';return{ok:true,detail:'cancelled'};},
  dealDocument:async()=>{calls.push('dealDocument');return [{name:'IT-2026-0001.pdf',bytes:pdf,hash}];},
  confirmDeal:async(id,k,no,h)=>{calls.push('confirmDeal');assert.equal(no,'IT-2026-0001');assert.equal(h,hash);d.completedAt=BigInt(Date.now())*1000000n;return {ok:true,detail:'receipt confirmed'};}
};
const dom=new JSDOM(readFileSync(join(root,'deal.html'),'utf8'),{url:'https://assets.example.test/deal.html#4.'+key,pretendToBeVisual:true});
for(const k of ['window','document','location','history','sessionStorage']) globalThis[k]=dom.window[k];
const originalTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms,...args)=>{const t=originalTimeout(fn,ms,...args);if(ms===60000)t.unref();return t;};
dom.window.HTMLAnchorElement.prototype.click=function(){calls.push('downloadAnchor');assert.equal(this.download,'IT-2026-0001.pdf');};
const $=id=>document.getElementById(id);
const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>originalTimeout(r,5));}throw Error('UI timed out: '+document.body.textContent.slice(-500));};
try {
  for(const f of ['deal.js','idl.js'])copyFileSync(join(root,f),join(temp,f));
  copyFileSync(resolve('assets/test/agent-bundle.stub.js'),join(temp,'agent-bundle.js'));writeFileSync(join(temp,'package.json'),'{"type":"module"}');
  await import(pathToFileURL(join(temp,'deal.js')));
  await until(()=>$('acceptForm'));
  assert.equal(location.hash,'');assert.equal(sessionStorage.getItem('ks-assets-deal'),'4.'+key);
  assert.equal(document.querySelectorAll('main script,main img').length,0,'untrusted fields remain text');
  assert.equal(calls.filter(c=>c==='acceptDeal').length,0,'opening a link never accepts');
  assert.equal(document.querySelectorAll('#topbar,#login').length,0,'no Hub login needed');
  if(scenario==='decline'){
    $('declineReason').value='No thanks';$('decline').click();await until(()=>document.body.textContent.includes('This sale is cancelled.'));assert.ok(!calls.includes('acceptDeal'));
  }else{
    $('acceptTerms').checked=true;$('country').value='ch';
    $('acceptForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));$('acceptForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    await until(()=>$('downloadInvoice'));assert.equal(calls.filter(c=>c==='acceptDeal').length,1,'double submit only makes one request');
    assert.equal($('confirmReceipt').disabled,true);$('downloadInvoice').click();await until(()=>calls.includes('downloadAnchor'));await until(()=>!$('confirmReceipt').disabled);
    $('confirmReceipt').click();assert.ok(!calls.includes('confirmDeal'),'explicit receipt checkbox required');
    $('receiptCheck').checked=true;$('confirmReceipt').click();await until(()=>document.body.textContent.includes('You’re all set.'));
    assert.equal(calls.filter(c=>c==='confirmDeal').length,1);assert.equal(d.paidAt,0n);
    invalid=true;$('refreshRoom').click();await until(()=>document.body.textContent.includes('This link is unavailable.'));assert.equal($('acceptForm'),null);
  }
  console.log('DEALROOM UI OK:',scenario);
}finally{dom.window.close();rmSync(temp,{recursive:true,force:true});globalThis.setTimeout=originalTimeout;}
