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
export function summarize(rows,year=new Date().getUTCFullYear(),now=new Date()){
 const currencies=new Map();const bucket=(c,taxBasis='unknown')=>{const cur=c||'Unknown',key=cur+'|'+taxBasis;if(!currencies.has(key))currencies.set(key,{currency:cur,taxBasis,annual:0,accrued:0,documents:0,missing:0});return currencies.get(key);};
 let missing=0;const subs=rows.filter(r=>isSaas(r.contract)&&r.contract.status!=='archived');
 for(const r of rows){const c=r.contract,t=c.terms,a=annualMinor(t);
  if(isSaas(c)&&ongoing(c)){const b=bucket(t.currency,t.taxBasis);if(a==null||!t.currency){missing++;b.missing++;}else b.annual+=a;}
  if(['invoice','receipt'].includes(kindOf(c))&&t.start?.startsWith(String(year))&&t.amountMinor.length)bucket(t.currency,t.taxBasis).documents+=Number(t.amountMinor[0]);
  if(!isSaas(c)||c.status==='draft')continue;
  const history=(r.history?.length?r.history:[{at:0n,terms:t}]).filter(v=>annualMinor(v.terms)!=null&&v.terms.start&&v.terms.currency);
  const ys=Date.UTC(year,0,1),ye=Date.UTC(year+1,0,1),cap=Math.min(ye,now.getTime());
  history.forEach((v,i)=>{const term=v.terms,rate=annualMinor(term);if(rate==null||!term.start||!term.currency)return;
   const next=history[i+1],start=Math.max(ys,Date.parse(term.start+'T00:00:00Z'),i?Number(v.at)/1e6:0),end=Math.min(cap,term.end?Date.parse(term.end+'T00:00:00Z')+dayMs:cap,next?Number(next.at)/1e6:cap);
   if(end>start)bucket(term.currency,term.taxBasis).accrued+=rate*(end-start)/(ye-ys);
  });
 }
 return {currencies:[...currencies.values()],subs,active:subs.filter(r=>ongoing(r.contract)),missing,renewals:subs.filter(r=>ongoing(r.contract)&&daysTo(actionDate(r.contract),now)!=null&&daysTo(actionDate(r.contract),now)<=90).sort((a,b)=>actionDate(a.contract).localeCompare(actionDate(b.contract)))};
}
export const csvCell = value => '"'+String(/^[=+\-@\t\r]/.test(String(value))?'\''+value:value??'').replaceAll('"','""')+'"';
export function portfolioCsv(rows){return [['Tool','Vendor','Owner','Status','Licenses purchased','Assigned people','Hub groups','Annualized amount','Currency','Tax basis','Start','End','Next renewal','Cancel by','Auto-renewal'],...rows.filter(r=>isSaas(r.contract)).map(r=>{const c=r.contract,t=c.terms,a=annualMinor(t);return [c.product||c.title,c.vendor,r.ownerName,c.status,c.seats?.[0]??'',r.assigned,r.groups.join('; '),a==null?'':(a/100).toFixed(2),t.currency,t.taxBasis,t.start,t.end,t.renewalDate,t.noticeDate,{auto:'Yes',manual:'No — manual renewal',none:'No',indefinite:'No fixed expiry'}[t.renewalRule]||'Unknown'];})].map(row=>row.map(csvCell).join(',')).join('\r\n');}
