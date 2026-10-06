// Hardware sales to colleagues and outside buyers, against the real Hub, Desk and Assets Wasm:
// what a buyer may see, who is told when they accept or decline, how a terms change is handled,
// and which settings changes may (not) void an open private dealroom link.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PocketIcServer} from '@dfinity/pic';
import {setup} from './helpers/workboard.mjs';
// Assets answers {ok:Bool; detail; …} records (not #ok variants): keep the whole record.
const unwrap=r=>{assert.ok(r.ok,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r;};

let server;
test.before(async()=>{server=await PocketIcServer.start();});
test.after(async()=>{await server?.stop();});

const settle=async(pic,ms=61000,ticks=6)=>{await pic.advanceTime(ms);for(let i=0;i<ticks;i++){await pic.tick();}};
const address={street:'Seestrasse',houseNo:'7b',postalCode:'8802',town:'Kilchberg',country:'CH'};
const colleague=(x,n)=>({pid:x.ids[n],name:'',email:n+'@workboard.test',street:'',houseNo:'',postalCode:'',town:'',country:'CH'});
let seq=200;
async function device(x){const a=await x.apps.assets.app.createAsset(x.assetToken,{tag:'HW-'+(++seq),serial:'SERIAL-'+seq,vendor:'Example',model:'Laptop '+seq,kind:'laptop',note:'PRIVATE NOTE'});assert.ok(a.ok,a.detail);return a.id;}

test('colleague sale: the buyer never sees the pricing rule, IT is told on accept/decline, and a terms change can be re-offered',async()=>{
 const x=await setup(server.getUrl());
 try{
  // alpha is on the company Finance team and may see pricing; the buyer here is a plain employee.
  const a=x.apps.assets.app,admin=x.assetToken,alpha=await x.login('assets','employee'),beta=await x.login('assets','beta');
  const assetId=await device(x);
  unwrap(await a.setPurchase(admin,assetId,[240000n],'CHF','2025-03-15','PURCHASE NOTE'));
  const sale=unwrap(await a.createSale(admin,assetId,colleague(x,'employee'),65000n,'INTERNAL PRICE NOTE'));
  unwrap(await a.offerSale(admin,sale.id));
  // 1 · the administrator sees the rule price and the note; the buyer sees neither, on both buyer paths
  const adminView=(await a.getSale(admin,sale.id))[0];
  assert.equal(adminView.proposal.length,1,'admins see the pricing proposal');assert.match(adminView.proposal[0].basis,/purchase price/);assert.equal(adminView.sale.priceNote,'INTERNAL PRICE NOTE');
  const buyerView=(await a.getSale(alpha,sale.id))[0];
  assert.deepEqual(buyerView.proposal,[],'the buyer does not see the purchase price or write-down rule');assert.equal(buyerView.sale.priceNote,'','the internal price note stays internal');
  assert.equal(buyerView.sale.grossMinor,65000n);
  const offers=await a.myOffers(alpha);
  assert.equal(offers.length,1);assert.deepEqual(offers[0].proposal,[]);assert.equal(offers[0].sale.priceNote,'');
  assert.equal((await a.getSale(beta,sale.id)).length,0,'another colleague cannot open the sale');
  // 2 · accepting notifies IT through the Hub (recorded on the sale), without the buyer doing anything else
  unwrap(await a.acceptOffer(alpha,sale.id,offers[0].waiverVersion,[address]));
  let notices=await a.saleFinanceNotification(admin,sale.id);
  assert.ok(notices.some(n=>n.kind==='accepted'),'an acceptance notice is queued for IT');
  await settle(x.pic);
  notices=await a.saleFinanceNotification(admin,sale.id);
  const accepted=notices.find(n=>n.kind==='accepted');
  assert.equal(accepted.complete,true,JSON.stringify(accepted));
  // 3 · the terms change after acceptance: the invoice is refused, but the sale can be offered again and accepted under the new version
  const [billing]=await a.getBilling(admin);
  unwrap(await a.setBilling(admin,{...billing,waiverText:billing.waiverText+' Updated clause.',waiverVersion:billing.waiverVersion+1n}));
  const stale=await a.issueInvoice(admin,sale.id);
  assert.equal(stale.ok,false);assert.match(stale.detail,/offer again/);
  const again=await a.offerSale(admin,sale.id);
  assert.equal(again.ok,true,again.detail);
  let view=(await a.getSale(admin,sale.id))[0];
  assert.equal(view.sale.status,'offered');assert.equal(view.sale.acceptedHow,'');assert.equal(view.sale.acceptedAt,0n);
  const [fresh]=await a.myOffers(alpha);
  assert.equal(fresh.waiverVersion,billing.waiverVersion+1n);
  const old=await a.acceptOffer(alpha,sale.id,billing.waiverVersion,[address]);
  assert.equal(old.ok,false,'accepting the old version is refused');
  unwrap(await a.acceptOffer(alpha,sale.id,fresh.waiverVersion,[address]));
  const issued=await a.issueInvoice(admin,sale.id);
  assert.equal(issued.ok,true,issued.detail);assert.match(issued.invoiceNo,/^TEST-/);
  view=(await a.getSale(alpha,sale.id))[0];
  assert.equal(view.sale.status,'issued');assert.deepEqual(view.proposal,[],'still no pricing rule for the buyer after the invoice');
  // 4 · editing an accepted colleague sale sends it back to the buyer and says so
  const second=unwrap(await a.createSale(admin,await device(x),colleague(x,'employee'),40000n,''));
  unwrap(await a.offerSale(admin,second.id));
  const [offer2]=(await a.myOffers(alpha)).filter(v=>v.sale.id===second.id);
  unwrap(await a.acceptOffer(alpha,second.id,offer2.waiverVersion,[address]));
  const edited=await a.updateSale(admin,second.id,{...offer2.sale.buyer},38000n,'price lowered','');
  assert.equal(edited.ok,true,edited.detail);assert.match(edited.detail,/told to accept the changed offer again/);
  assert.equal((await a.getSale(admin,second.id))[0].sale.status,'offered');
  // 5 · a decline carries the buyer's reason to IT
  const third=unwrap(await a.createSale(admin,await device(x),colleague(x,'beta'),30000n,''));
  unwrap(await a.offerSale(admin,third.id));
  unwrap(await a.declineOffer(beta,third.id,'Too expensive for me'));
  const declined=(await a.getSale(admin,third.id))[0];
  assert.equal(declined.sale.status,'cancelled');assert.match(declined.sale.cancelReason,/declined by the buyer: Too expensive for me/);
  assert.ok((await a.saleFinanceNotification(admin,third.id)).some(n=>n.kind==='declined'),'IT is told about the decline');
 }finally{await x.pic.tearDown();}
});

test('outside buyer: a private link survives payment-term, prefix and footer changes but not a change of the terms or price',async()=>{
 const x=await setup(server.getUrl());
 try{
  const a=x.apps.assets.app,admin=x.assetToken;
  const sale=unwrap(await a.createSale(admin,await device(x),{pid:'',name:'Outside Buyer',email:'outside@example.test',street:'',houseNo:'',postalCode:'',town:'',country:'CH'},50000n,''));
  const link=await a.createDealLink(admin,sale.id);assert.equal(link.ok,true,link.detail);
  const key=link.url.split('.').at(-1);
  const open=(await a.getDeal(sale.id,key))[0];
  assert.equal(open.changed,false);
  const [billing]=await a.getBilling(admin);
  // operational settings do not void the offer the buyer is looking at
  unwrap(await a.setBilling(admin,{...billing,paymentDays:30n,prefix:'INV-',footer:'New footer line',depreciationMonths:48n,floorPct:5n,minPriceMinor:1000n}));
  assert.equal((await a.getDeal(sale.id,key))[0].changed,false,'payment days, prefix, footer and pricing rule are not part of the quote');
  // what the buyer accepted does
  unwrap(await a.setBilling(admin,{...billing,paymentDays:30n,prefix:'INV-',footer:'New footer line',waiverText:billing.waiverText+' Changed.',waiverVersion:billing.waiverVersion+1n}));
  const changed=(await a.getDeal(sale.id,key))[0];
  assert.equal(changed.changed,true,'a terms change asks the seller for a new link');
  const refused=await a.acceptDeal(sale.id,key,open.quote,address);
  assert.equal(refused.ok,false);
  // a fresh link under the new terms can be accepted; the invoice uses the new prefix and payment days
  const relink=await a.createDealLink(admin,sale.id);assert.equal(relink.ok,true,relink.detail);
  const key2=relink.url.split('.').at(-1);
  const current=(await a.getDeal(sale.id,key2))[0];
  assert.equal(current.changed,false);
  const accepted=await a.acceptDeal(sale.id,key2,current.quote,address);
  assert.equal(accepted.ok,true,accepted.detail);
  const after=(await a.getDeal(sale.id,key2))[0];
  assert.equal(after.invoice.length,1);assert.match(after.invoice[0].number,/^INV-/);
  const dueDays=Math.round((Date.parse(after.invoice[0].dueOn)-Date.parse(after.invoice[0].issuedOn))/86400000);
  assert.equal(dueDays,30,'the invoice uses the payment days in force when it was issued');
 }finally{await x.pic.tearDown();}
});
