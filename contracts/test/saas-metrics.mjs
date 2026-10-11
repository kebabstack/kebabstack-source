import assert from 'node:assert/strict';
import {summarize,annualMinor,csvCell,portfolioCsv,discountOf,headline} from '../dist/saas-metrics.js';
const t=(a=120000n,currency='EUR',start='2025-01-01',end='2025-12-31')=>({amountMinor:[a],currency,interval:'year',start,end,renewalDate:'',noticeDate:'',taxBasis:'net'});
const row=(terms,extra={})=>({contract:{title:'Tool',vendor:'Vendor',product:'Tool',responsible:'owner',status:'active',tags:[],seats:[10n],terms,...extra},ownerName:'Owner',groups:[],assigned:8n,history:[]});
let rows=[row(t()),row({...t(10000n,'USD'),interval:'month'}),row({...t(),amountMinor:[]}),row(t(9900n),{tags:['document-type:receipt']}),row(t(123000n),{tags:['document-type:license-key']}),row(t(12000000n),{status:'draft'})];
let s=summarize(rows,2025,new Date('2026-01-01T00:00:00Z'));
assert.equal(s.currencies.find(b=>b.currency==='EUR').annual,120000);assert.equal(s.currencies.find(b=>b.currency==='USD').annual,120000);assert.equal(s.missing,1);assert.equal(s.currencies.find(b=>b.currency==='EUR').documents,9900);
assert.equal(s.currencies.find(b=>b.currency==='EUR').accrued,120000,'receipts, keys and drafts do not double count SaaS accrual');
const historical=row(t(240000n));historical.history=[{at:BigInt(Date.parse('2025-07-01'))*1000000n,terms:{...t(),amountMinor:[]}},{at:BigInt(Date.parse('2025-07-01'))*1000000n,terms:t()},{at:BigInt(Date.parse('2025-07-02'))*1000000n,terms:t(240000n)}];
s=summarize([historical],2025,new Date('2026-01-01T00:00:00Z'));
assert.equal(Math.round(s.currencies[0].accrued),Math.round((182*120000+183*240000)/365),'first known terms apply from contract start; later prices apply from recorded change');
historical.contract.status='archived';assert.equal(Math.round(summarize([historical],2025,new Date('2026-01-01')).currencies[0].accrued),Math.round(s.currencies[0].accrued),'archiving preserves historical cost');
assert.equal(summarize([row(t())],2025,new Date('2025-07-01')).currencies[0].accrued,120000*181/365,'current year accrual stops at today');
assert.equal(annualMinor({...t(),interval:'once'}),null);assert.equal(csvCell('=HYPERLINK("evil")'),'"\'=HYPERLINK(""evil"")"');assert.ok(!portfolioCsv([row(t(),{tags:['document-type:license-key'],title:'HIDDEN KEY RECORD'})]).includes('HIDDEN KEY RECORD'));
const mixed=summarize([row(t()),row({...t(),taxBasis:'gross'})]);assert.equal(mixed.currencies.length,2,'net and gross prices are not silently totalled together');
assert.deepEqual(summarize([row({...t(),currency:'',amountMinor:[]},{tags:['document-type:license-key']})]).currencies,[],'key inventory does not create empty spend currencies');
// 0.18.0 · one headline in the reporting currency; unconverted currencies are named, never silently dropped
const reporting={currency:'CHF',rates:[['USD',8800n]],updatedAt:0n,updatedBy:'me'};
const h=summarize([row(t(100000n,'CHF')),row({...t(10000n,'USD'),interval:'month'}),row({...t(50000n,'CHF'),taxBasis:'gross'}),row(t(30000n,'EUR'))],2025,new Date('2026-01-01'),reporting).headline;
assert.equal(h.currency,'CHF');assert.equal(h.total,100000+Math.round(120000*0.88)+50000,'CHF as is, USD at the rate, EUR left out');assert.deepEqual(h.unconverted,['EUR']);assert.equal(h.net,3);assert.equal(h.gross,1);
assert.equal(h.lines.find(l=>l.currency==='USD').converted,105600);assert.equal(summarize([row(t())]).headline,null,'no reporting settings, no headline');
assert.equal(headline([{currency:'CHF',taxBasis:'net',annual:0,count:0}],reporting).total,0);
// discounts come from the commercial details and are annualised like the amount
const disc=row({...t(60000n,'CHF'),interval:'month'});disc.commercial=[{field:'listPrice',value:'1000.00'},{field:'discountNote',value:'non-profit'}];
const d=discountOf(disc);assert.equal(d.percent,40,'percent derived from list vs amount when not stated');assert.equal(d.savedAnnual,(100000-60000)*12);assert.equal(d.note,'non-profit');
const stated=row(t(100000n,'CHF'));stated.commercial=[{field:'discountPercent',value:'12.5'}];assert.equal(discountOf(stated).percent,12.5);assert.equal(discountOf(stated).savedAnnual,null,'no list price, no saving figure');
assert.equal(discountOf(row(t())),null);
const ds=summarize([disc,stated],2025,new Date('2026-01-01'),reporting).discounts;assert.equal(ds.count,2);assert.equal(ds.savedConverted,480000);assert.equal(ds.byCurrency[0].saved,480000);
console.log('SaaS metrics: currencies, annualization, dated history, archived costs, missing fields and safe export passed.');
