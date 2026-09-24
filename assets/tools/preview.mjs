// Local review fixture. Reuses the frontend smoke contract; never contacts live canisters.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../');
const out = path.join(root, '.assets-preview');
fs.mkdirSync(out,{recursive:true});
fs.cpSync(path.join(root,'assets/dist'),out,{recursive:true});
fs.copyFileSync(path.join(root,'assets/test/agent-bundle.stub.js'),path.join(out,'agent-bundle.js'));
let source = fs.readFileSync(path.join(root,'assets/test/smoke.mjs'),'utf8');
source = source.slice(source.indexOf('const now ='),source.indexOf('const dom ='));
source = source.replace(/import \{ generateKeyPairSync[^\n]*\n/,'').replace(/const abmPair[^\n]*\n/,'').replace(/const abmPemPkcs8[^\n]*\n/,'').replace(/const abmPemSec1[^\n]*\n/,'');
source = source.replace(/let role = .*?;/,'let role = new URLSearchParams(location.search).get("as") === "finance" ? "finance" : "admin";').replace(/let aiOn = .*?;/,'let aiOn = true;').replace(/const flow = .*?;/,'const flow = "";');
source = source.replace(/appUrl: flow.startsWith\("canonical"\) \? "https:\/\/new.assets.test\/" : "https:\/\/assets.test\/"/,'appUrl: ""');
source = source.replaceAll('Me Myself','Demo Admin');
source = source.replace(/photos: \[\{ id: 5n,[^\]]+\}\]/,'photos: []');
source = source.replaceAll('ev(9, "handed_out", "handed out to Ana Ruiz", 5n)','ev(9, "handed_out", "handed out to Ana Ruiz")');
const fixture = `
const previewSales = [
  {id:7n,status:'paid',name:'MacBook Pro 14″',buyer:'Alex Morgan',price:65000n,wiped:false,mdmRemoved:false,invoice:'IT-2026-0014'},
  {id:8n,status:'issued',name:'MacBook Air 13″',buyer:'Sam Rivers',price:39000n,wiped:false,mdmRemoved:false,invoice:'IT-2026-0013'},
  {id:9n,status:'offered',name:'iPhone 14 Pro',buyer:'Jamie Parker',price:28000n,wiped:false,mdmRemoved:false,invoice:''},
  {id:10n,status:'accepted',name:'MacBook Pro 16″',buyer:'Taylor Reed',price:85000n,wiped:false,mdmRemoved:false,invoice:''},
  {id:11n,status:'paid',name:'iPad Air',buyer:'Casey Brooks',price:22000n,wiped:true,mdmRemoved:true,invoice:'IT-2026-0010',complete:true},
  {id:12n,status:'cancelled',name:'MacBook Pro 13″',buyer:'Jordan Ellis',price:30000n,wiped:false,mdmRemoved:false,invoice:''}
];
function previewView(id) {
 const r=previewSales.find(r=>r.id===id)||previewSales[0];
 const net=(r.price*10000n+5405n)/10810n;
 const v=saleView({id:r.id,assetId:1n,status:r.status,buyer:{...buyer,pid:r.id===10n?ANA:'',name:r.buyer,email:'buyer@example.test'},grossMinor:r.price,netMinor:net,vatMinor:r.price-net,invoiceNo:r.invoice,issuedAt:r.invoice?now:0n,issuedOn:r.invoice?'2026-09-15':'',dueOn:r.invoice?'2026-09-29':'',reference:r.invoice?'DEMO REFERENCE':'',description:'Used hardware · '+r.name,priceNote:'',proposedMinor:[],wiped:r.wiped,mdmRemoved:r.mdmRemoved,pdfId:r.invoice?3n:0n,paidAt:r.status==='paid'?now:0n,acceptedAt:r.status==='offered'?0n:now,acceptedBy:r.status==='offered'?'':ANA});
 return {...v,invoice:[],proposal:[],deviceName:r.name,deviceTag:'INV-'+String(r.id).padStart(4,'0'),acceptedByName:r.buyer,handedOverAt:r.complete?now:0n,phase:r.status==='cancelled'?'cancelled':r.complete?'complete':r.status==='paid'?'paid':r.status==='issued'?'invoice':'offer',stillInAbm:r.complete?'':'Acme · Apple Business Manager'};
}
`;
source=source.replace('globalThis.__fakeBackend =',fixture+'\nglobalThis.__fakeBackend =');
source=source.replace('  switch (m) {',`  if(m==='financeSetup')return [{mode:'team',enabled:true,activeMembers:2n}];
  if(m==='financePayments')return [{open:2n,overdue:1n,totals:[['CHF',87000n]],matched:2n,rows:[{id:8n,number:'EXAMPLE-0013',buyer:'Sam Rivers',device:'MacBook Air 13 inch',dueOn:'2026-09-15',currency:'CHF',outstandingMinor:39000n},{id:7n,number:'EXAMPLE-0014',buyer:'Alex Morgan',device:'MacBook Pro 14 inch',dueOn:'2026-10-04',currency:'CHF',outstandingMinor:48000n}]}];
  if(m==='financeInventory')return [{rows:Array.from({length:24},(_,i)=>({id:BigInt(i+1),name:i%3?'MacBook Pro 14 inch':'Dell monitor',tag:'EXAMPLE-'+(i+1),serial:'SAMPLE-'+i,kind:i%3?'laptop':'monitor',status:'assigned',assignee:['Alex Morgan','Sam Rivers','Jamie Parker'][i%3],archived:false,purchase:[{priceMinor:240000n,currency:'CHF',date:'2025-03-15',at:now,by:'Finance',note:''}],valuation:[],bookMinor:i===3?[]:[120000n],revision:0n})),matched:24n,missing:1n,totals:[['CHF',2760000n]],defaults:[{kind:'laptop',months:36n}],defaultsRevision:0n}];
  if(m==='financeAsset')return [{asset:{id:a[1],name:'MacBook Pro 14 inch',tag:'EXAMPLE-'+a[1],serial:'SAMPLE',kind:'laptop',status:'assigned',assignee:'Alex Morgan',archived:false,purchase:[{priceMinor:240000n,currency:'CHF',date:'2025-03-15',at:now,by:'Finance',note:''}],valuation:[],bookMinor:[],revision:0n},history:[]}];
  if(m==='salePaymentHistory'){const s=previewView(a[1]).sale;return [{entries:[],revision:0n,paidMinor:s.status==='paid'?s.grossMinor:0n,outstandingMinor:s.status==='paid'?0n:s.grossMinor,canRecord:true}];}
  if (m === 'getSale') return [previewView(a[1])];
  if (m === 'salesBoard') {
    const rows=previewSales.map(r=> {const v=previewView(r.id);return {...v.sale,phase:v.phase,buyerName:r.buyer,deviceName:r.name,deviceTag:'INV-'+String(r.id).padStart(4,'0'),receiptPending:false};});
    const counts=['offer','invoice','paid','complete','cancelled'].map(p=>[p,BigInt(rows.filter(r=>r.phase===p).length)]);
    const matches=rows.filter(r=>(!a[1]||r.phase===a[1]||(a[1]==='open'&&!['complete','cancelled'].includes(r.phase)))&&(!a[2]||(r.deviceName+' '+r.buyerName+' '+r.invoiceNo).toLowerCase().includes(a[2].toLowerCase())));
    return {counts,total:BigInt(rows.length),matched:BigInt(matches.length),rows:matches.slice(Number(a[3]),Number(a[3])+100),hasMore:false};
  }
  if (m === 'dealStatus') { const r=previewSales.find(r=>r.id===a[1])||previewSales[0];return [{...fakeDeal,exists:r.id!==10n,active:r.status!=='cancelled',openedAt:now,completedAt:r.invoice?now:0n,downloadedAt:r.invoice?now:0n,handedOverAt:r.complete?now:0n,history:[]}]; }
  if (m === 'notifyStatus') return [];
  if (m === 'setSaleChecks') { const r=previewSales.find(r=>r.id===a[1]);r.wiped=a[2];r.mdmRemoved=a[3];return {ok:true,detail:''}; }
  if (m === 'markPaid') {previewSales.find(r=>r.id===a[1]).status='paid';return {ok:true,detail:''};}
  if (m === 'completeSaleHandover') {previewSales.find(r=>r.id===a[1]).complete=true;return {ok:true,detail:''};}
  switch (m) {`);
source+='\nlocalStorage.setItem("ks-assets-session","preview-only");\n';
fs.writeFileSync(path.join(out,'fixture.js'),source);
let html=fs.readFileSync(path.join(out,'index.html'),'utf8').replace('<script type="module" src="./app.js"></script>','<script src="./fixture.js"></script><script type="module" src="./app.js"></script>');
html=html.replace('<body>','<body><div style="background:#255946;color:#fff;text-align:center;padding:7px;font:11px system-ui">LOCAL DESIGN PREVIEW · Fictional data · Changes affect this preview only</div>');
fs.writeFileSync(path.join(out,'index.html'),html);
console.log('Preview built in '+out+'\nServe locally: python3 -m http.server 4173 --bind 127.0.0.1 --directory '+out);
