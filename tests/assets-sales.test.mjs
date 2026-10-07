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
  // 2 · accepting issues the invoice at once in the canister; Finance/IT are told through the Hub
  const acceptedReply=unwrap(await a.acceptOffer(alpha,sale.id,offers[0].waiverVersion,[address]));
  assert.match(acceptedReply.detail,/invoice TEST-/,'the buyer is told the invoice number');
  let view=(await a.getSale(alpha,sale.id))[0];
  assert.equal(view.sale.status,'issued');assert.ok(view.sale.pdfId>0n,'PDF archived by the canister');assert.match(view.sale.invoiceNo,/^TEST-/);
  const doc=(await a.saleDocument(alpha,view.sale.pdfId))[0];
  assert.ok(doc&&doc.bytes.length>1000&&Buffer.from(doc.bytes.slice(0,5)).toString()==='%PDF-','the buyer can download a real PDF');
  assert.deepEqual(view.proposal,[],'still no pricing rule for the buyer after the invoice');
  let notices=await a.saleFinanceNotification(admin,sale.id);
  assert.ok(notices.some(n=>n.kind==='invoice'),'an invoice notice is queued');
  await settle(x.pic);
  assert.equal((await a.saleFinanceNotification(admin,sale.id)).find(n=>n.kind==='invoice').complete,true);
  assert.match((await a.issueInvoice(admin,sale.id)).detail,/status issued/,'nothing to issue twice');
  // 3 · the terms change before acceptance: the old version is refused, the new one is accepted and invoiced
  const second=unwrap(await a.createSale(admin,await device(x),colleague(x,'employee'),40000n,''));
  unwrap(await a.offerSale(admin,second.id));
  const [billing]=await a.getBilling(admin);
  unwrap(await a.setBilling(admin,{...billing,waiverText:billing.waiverText+' Updated clause.',waiverVersion:billing.waiverVersion+1n}));
  const old=await a.acceptOffer(alpha,second.id,billing.waiverVersion,[address]);
  assert.equal(old.ok,false,'accepting the old version is refused');
  const [fresh]=(await a.myOffers(alpha)).filter(v=>v.sale.id===second.id);
  assert.equal(fresh.waiverVersion,billing.waiverVersion+1n);
  unwrap(await a.acceptOffer(alpha,second.id,fresh.waiverVersion,[address]));
  view=(await a.getSale(admin,second.id))[0];
  assert.equal(view.sale.status,'issued');assert.equal(view.sale.waiverVersion,billing.waiverVersion+1n);
  // 4 · without complete billing settings the acceptance still counts; IT is told and issues later
  unwrap(await a.setBilling(admin,{...billing,waiverVersion:billing.waiverVersion+1n,waiverText:billing.waiverText+' Updated clause.',iban:''}));
  const third0=unwrap(await a.createSale(admin,await device(x),colleague(x,'employee'),35000n,''));
  unwrap(await a.offerSale(admin,third0.id));
  const [pend]=(await a.myOffers(alpha)).filter(v=>v.sale.id===third0.id);
  const pendingReply=unwrap(await a.acceptOffer(alpha,third0.id,pend.waiverVersion,[address]));
  assert.match(pendingReply.detail,/IT issues your invoice/);
  view=(await a.getSale(admin,third0.id))[0];assert.equal(view.sale.status,'accepted');assert.equal(view.sale.pdfId,0n);
  assert.ok((await a.saleFinanceNotification(admin,third0.id)).some(n=>n.kind==='accepted'),'IT is told to issue');
  unwrap(await a.setBilling(admin,{...billing,waiverVersion:billing.waiverVersion+1n,waiverText:billing.waiverText+' Updated clause.'}));
  const issued=await a.issueInvoice(admin,third0.id);
  assert.equal(issued.ok,true,issued.detail);
  view=(await a.getSale(admin,third0.id))[0];assert.equal(view.sale.status,'issued');assert.ok(view.sale.pdfId>0n,'issuing later also archives in the canister');
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

test('device labels: the default layout is an admin setting with a fixed vocabulary; members cannot read or change it',async()=>{
 const x=await setup(server.getUrl());
 try{
  const a=x.apps.assets.app,admin=x.assetToken,employee=await x.login('assets','employee');
  assert.deepEqual(await a.getLabelLayout(employee),[],'members have no label settings');
  const [initial]=await a.getLabelLayout(admin);assert.equal(initial.size,'62x29');assert.ok(initial.fields.includes('qr'));
  assert.equal((await a.setLabelLayout(employee,{size:'62x29',fields:['qr','tag'],note:''})).ok,false);
  assert.equal((await a.setLabelLayout(admin,{size:'a4',fields:['qr','tag'],note:''})).ok,false,'unknown media is refused');
  assert.equal((await a.setLabelLayout(admin,{size:'62x29',fields:['qr','secret'],note:''})).ok,false,'unknown field is refused');
  assert.equal((await a.setLabelLayout(admin,{size:'62x29',fields:['qr'],note:'x'.repeat(161)})).ok,false,'footer text is bounded');
  unwrap(await a.setLabelLayout(admin,{size:'23x23',fields:['qr','tag','logo','note'],note:' If found, please contact it@example.test '}));
  assert.deepEqual((await a.getLabelLayout(admin))[0],{size:'23x23',fields:['qr','tag','logo','note'],note:'If found, please contact it@example.test'});
 }finally{await x.pic.tearDown();}
});

test('registering a device: automatic tags continue the register, locations are admin-defined, a person is handed the device in the same step',async()=>{
 const x=await setup(server.getUrl());
 try{
  const a=x.apps.assets.app,admin=x.assetToken,employee=await x.login('assets','employee');
  assert.deepEqual(await a.registerOptions(employee),[]);
  let [o]=await a.registerOptions(admin);const initial=o.nextTag;assert.match(initial,/^\d{6}$/,'six padded digits, continuing from the fixture devices');assert.deepEqual(o.locations,[]);
  assert.equal((await a.registerDevice(admin,{create:{tag:'',serial:'',vendor:'',model:'',kind:'laptop',note:''},assignee:'',location:'',photo:[],mime:''})).ok,false,'needs a serial or a model');
  assert.equal((await a.registerDevice(admin,{create:{tag:'',serial:'S-1',vendor:'Apple',model:'MacBook Air',kind:'laptop',note:''},assignee:'',location:'Nowhere',photo:[],mime:''})).ok,false,'unknown location is refused');
  assert.equal((await a.setLocations(employee,['Desk 1'])).ok,false);
  unwrap(await a.setLocations(admin,[' Zürich office · 3rd floor ','Storage room','Storage room','']));
  [o]=await a.registerOptions(admin);assert.deepEqual(o.locations,['Zürich office · 3rd floor','Storage room']);
  const first=unwrap(await a.registerDevice(admin,{create:{tag:'',serial:'S-1',vendor:'Apple',model:'MacBook Air',kind:'laptop',note:''},assignee:'',location:'Storage room',photo:[],mime:''}));
  assert.equal(first.tag,initial);const [v1]=await a.getAsset(admin,first.assetId);assert.equal(v1.location,'Storage room');assert.equal(v1.asset.status,'in_stock');
  unwrap(await a.createAsset(admin,{tag:'DFN-000433',serial:'S-433',vendor:'Apple',model:'MacBook Pro',kind:'laptop',note:''}));
  [o]=await a.registerOptions(admin);assert.equal(o.nextTag,'000434','the number continues from the highest numeric tail, whatever the prefix');
  unwrap(await a.setTagScheme(admin,{prefix:'DFN-',digits:6n}));
  assert.equal((await a.setTagScheme(admin,{prefix:'TOO-LONG-PREFIX',digits:6n})).ok,false);
  const second=unwrap(await a.registerDevice(admin,{create:{tag:'',serial:'S-2',vendor:'Samsung',model:'Galaxy S24',kind:'phone',note:''},assignee:'employee@workboard.test',location:'',photo:[],mime:''}));
  assert.equal(second.tag,'DFN-000434');const [v2]=await a.getAsset(admin,second.assetId);assert.equal(v2.asset.status,'assigned');assert.equal(v2.asset.assignee,x.ids.employee);assert.equal(v2.location,'');
  assert.equal((await a.registerDevice(admin,{create:{tag:'',serial:'S-2',vendor:'',model:'',kind:'phone',note:''},assignee:'',location:'',photo:[],mime:''})).ok,false,'duplicate serial is refused');
  assert.equal((await a.registerDevice(admin,{create:{tag:'',serial:'S-3',vendor:'',model:'Dock',kind:'accessory',note:''},assignee:'nobody@workboard.test',location:'',photo:[],mime:''})).ok,false,'unknown person is refused');
  unwrap(await a.setAssetLocation(admin,first.assetId,'Zürich office · 3rd floor'));assert.equal((await a.getAsset(admin,first.assetId))[0].location,'Zürich office · 3rd floor');
  assert.equal((await a.setAssetLocation(admin,first.assetId,'Mars')).ok,false);
  assert.ok((await a.listAssets(admin,'3rd floor','',false)).some(r=>r.asset.id===first.assetId),'search finds a device by its location');
  assert.equal((await a.setAssetLocation(employee,first.assetId,'')).ok,false);
 }finally{await x.pic.tearDown();}
});
