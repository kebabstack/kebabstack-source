export const kindOf = c => c.tags?.find(t=>t.startsWith('document-type:'))?.slice(14)||'contract';
export const isSaas = c => !['receipt','invoice','license-key'].includes(kindOf(c));
export const ongoing = c => ['active','cancelling'].includes(c.status);
export const annualMinor = t => t.amountMinor?.length && ({month:12,quarter:4,year:1}[t.interval]) ? Number(t.amountMinor[0])*({month:12,quarter:4,year:1}[t.interval]) : null;
export const taxLabel = basis => ({net:'excluding tax',gross:'including tax'}[basis]||'tax basis unknown');
export const dayMs = 86400000;
export function daysTo(iso,now=new Date()){return iso?Math.ceil((Date.parse(iso+'T00:00:00Z')-Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()))/dayMs):null;}
export const renewalDate = c => c.terms.renewalDate||c.terms.end;
export const actionDate = c => c.terms.noticeDate||renewalDate(c);
export function money(minor,currency){return minor==null?'Not recorded':new Intl.NumberFormat('en-CH',{style:'decimal',minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100)+' '+(currency||'Unknown currency');}
// 0.18.0 · discounts live in the commercial details: listPrice (same currency, period and tax basis as the amount), discountPercent, discountNote.
export function discountOf(row){
 const t=row.contract.terms,get=k=>(row.commercial||[]).find(f=>f.field===k)?.value||'',listText=get('listPrice'),pctText=get('discountPercent'),note=get('discountNote');
 const factor={month:12,quarter:4,year:1}[t.interval]||null,amount=t.amountMinor?.length?Number(t.amountMinor[0]):null;
 const list=listText?Math.round(Number(listText.replace(/'/g,'').replace(',','.'))*100):null;
 const listAnnual=list!=null&&factor?list*factor:null,annual=amount!=null&&factor?amount*factor:null;
 let percent=pctText?Number(pctText.replace(',','.')):null;if((percent==null||Number.isNaN(percent))&&list&&amount!=null&&list>amount)percent=Math.round((1-amount/list)*1000)/10;
 if(!listText&&!pctText&&!note)return null;
 return {percent:Number.isFinite(percent)?percent:null,note,listAnnual,savedAnnual:listAnnual!=null&&annual!=null&&listAnnual>annual?listAnnual-annual:null,currency:t.currency};
}
// Convert recorded buckets into the workspace's reporting currency with the maintained rates (rate = reporting units per 1 foreign unit × 10 000).
export function headline(buckets,reporting){
 if(!reporting)return null;
 const rateOf=c=>c===reporting.currency?10000:Number((reporting.rates||[]).find(([code])=>code===c)?.[1]||0);
 const lines=[],unconverted=[];let total=0,gross=0,net=0,unknown=0;
 for(const b of buckets){if(!b.annual)continue;const rate=rateOf(b.currency);const converted=rate?Math.round(b.annual*rate/10000):null;
  if(converted==null)unconverted.push(b.currency);else total+=converted;
  if(b.taxBasis==='gross')gross+=b.count||0;else if(b.taxBasis==='net')net+=b.count||0;else unknown+=b.count||0;
  lines.push({currency:b.currency,taxBasis:b.taxBasis,annual:b.annual,count:b.count||0,rate:rate||null,converted});}
 return {currency:reporting.currency,total,lines,unconverted:[...new Set(unconverted)],gross,net,unknown,updatedAt:reporting.updatedAt};
}
export function summarize(rows,year=new Date().getUTCFullYear(),now=new Date(),reporting=null){
 const currencies=new Map();const bucket=(c,taxBasis='unknown')=>{const cur=c||'Unknown',key=cur+'|'+taxBasis;if(!currencies.has(key))currencies.set(key,{currency:cur,taxBasis,annual:0,accrued:0,documents:0,missing:0,count:0});return currencies.get(key);};
 let missing=0,discountsNoted=0;const discounts=new Map();const subs=rows.filter(r=>isSaas(r.contract)&&r.contract.status!=='archived');
 for(const r of rows){const c=r.contract,t=c.terms,a=annualMinor(t);
  if(isSaas(c)&&ongoing(c)){const b=bucket(t.currency,t.taxBasis);if(a==null||!t.currency){missing++;b.missing++;}else{b.annual+=a;b.count++;}
   const d=discountOf(r);if(d&&d.savedAnnual!=null&&t.currency){const key='d:'+t.currency;discounts.set(key,{currency:t.currency,saved:(discounts.get(key)?.saved||0)+d.savedAnnual,count:(discounts.get(key)?.count||0)+1});}else if(d)discountsNoted++;}
  if(['invoice','receipt'].includes(kindOf(c))&&t.start?.startsWith(String(year))&&t.amountMinor.length)bucket(t.currency,t.taxBasis).documents+=Number(t.amountMinor[0]);
  if(!isSaas(c)||c.status==='draft')continue;
  const history=(r.history?.length?r.history:[{at:0n,terms:t}]).filter(v=>annualMinor(v.terms)!=null&&v.terms.start&&v.terms.currency);
  const ys=Date.UTC(year,0,1),ye=Date.UTC(year+1,0,1),cap=Math.min(ye,now.getTime());
  history.forEach((v,i)=>{const term=v.terms,rate=annualMinor(term);if(rate==null||!term.start||!term.currency)return;
   const next=history[i+1],start=Math.max(ys,Date.parse(term.start+'T00:00:00Z'),i?Number(v.at)/1e6:0),end=Math.min(cap,term.end?Date.parse(term.end+'T00:00:00Z')+dayMs:cap,next?Number(next.at)/1e6:cap);
   if(end>start)bucket(term.currency,term.taxBasis).accrued+=rate*(end-start)/(ye-ys);
  });
 }
 const buckets=[...currencies.values()],head=headline(buckets,reporting);
 const savedTotal=reporting?[...discounts.values()].reduce((n,d)=>{const rate=d.currency===reporting.currency?10000:Number((reporting.rates||[]).find(([c])=>c===d.currency)?.[1]||0);return rate?n+Math.round(d.saved*rate/10000):n;},0):null;
 return {currencies:buckets,headline:head,discounts:{byCurrency:[...discounts.values()],count:[...discounts.values()].reduce((n,d)=>n+d.count,0)+discountsNoted,savedConverted:savedTotal},subs,active:subs.filter(r=>ongoing(r.contract)),missing,renewals:subs.filter(r=>ongoing(r.contract)&&daysTo(actionDate(r.contract),now)!=null&&daysTo(actionDate(r.contract),now)<=90).sort((a,b)=>actionDate(a.contract).localeCompare(actionDate(b.contract)))};
}
export const csvCell = value => '"'+String(/^[=+\-@\t\r]/.test(String(value))?'\''+value:value??'').replaceAll('"','""')+'"';
export function portfolioCsv(rows){return [['Tool','Vendor','Owner','Status','Licenses purchased','Assigned people','Hub groups','Annualized amount','Currency','Tax basis','Start','End','Next renewal','Cancel by','Auto-renewal'],...rows.filter(r=>isSaas(r.contract)).map(r=>{const c=r.contract,t=c.terms,a=annualMinor(t);return [c.product||c.title,c.vendor,r.ownerName,c.status,c.seats?.[0]??'',r.assigned,r.groups.join('; '),a==null?'':(a/100).toFixed(2),t.currency,t.taxBasis,t.start,t.end,t.renewalDate,t.noticeDate,{auto:'Yes',manual:'No — manual renewal',none:'No',indefinite:'No fixed expiry'}[t.renewalRule]||'Unknown'];})].map(row=>row.map(csvCell).join(',')).join('\r\n');}
