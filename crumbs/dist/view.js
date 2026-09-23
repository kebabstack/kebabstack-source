export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num=value=>Number(value).toLocaleString('en-US');
export const dimensionLabel=value=>({channel:'Channel',aiSource:'AI assistant',path:'Page',source:'Source',campaign:'Campaign',entryPath:'Entry page',exitPath:'Exit page',medium:'Medium',device:'Device',country:'Country',region:'Region',city:'City',browser:'Browser',os:'Operating system',event:'Event',hostname:'Hostname',content:'Campaign content',term:'Campaign term'}[value]??String(value).replace(/^prop:/,'Property: '));
export function money(currency,minor){try{const format=new Intl.NumberFormat('en-US',{style:'currency',currency});return format.format(Number(minor)/10**format.resolvedOptions().maximumFractionDigits);}catch{return currency+' '+num(minor)+' minor units';}}
export function metricCards(m,previous){
 const pct=(a,b)=>b?100*a/b:0,duration=v=>{const seconds=Math.round(v);return Math.floor(seconds/60)+'m '+seconds%60+'s';};
 const values=[['Visitors','visitors',num],['Visits','visits',num],['Pageviews','pageviews',num],['Bounce rate','bounce',v=>v.toFixed(1)+'%'],['Visit duration','duration',duration]];
 const value=(data,key)=>key==='bounce'?pct(Number(data.bounces),Number(data.visits)):key==='duration'?(Number(data.visits)?Number(data.durationSeconds)/Number(data.visits):0):Number(data[key]);
 return values.map(([label,key,format])=>{const n=value(m,key),old=previous?value(previous,key):null;let change='';
  if(previous){if(key==='bounce'&&Number(previous.visits)){const delta=n-old;change=(delta>0?'+':'')+delta.toFixed(1)+' pp';}
  else if(old){const delta=(n-old)/old*100;change=(delta>0?'+':'')+delta.toFixed(1)+'%';}
  else change=n===0?'No change':'No previous data';}
  return `<div class="metric"><div class="subtle">${label}</div><div class="value">${format(n)}</div>${previous?`<div class="change" title="Compared with the previous period of the same length">${change} vs previous period</div>`:''}</div>`;
 }).join('');
}
export function table(rows,dimension){
  if(!rows.length)return '<div class="empty-report">No data in this period.</div>';
  const max=Math.max(1,...rows.map(r=>Number(r.metrics.visitors)));
  return rows.map(r=>`<button class="data-row" data-filter="${esc(dimension)}" data-value="${esc(r.value)}" style="--bar:${Number(r.metrics.visitors)/max*100}%"><span class="name">${esc(r.value||(dimension==='source'?'Direct / none':dimension==='event'?'Pageviews':'Unknown'))}</span><span class="number">${num(r.metrics.visitors)}</span></button>`).join('');
}
export function chart(rows,from,until,{metric="visitors",interval=86400}={}){
  const points=[];const byDay=new Map(rows.map(r=>[Number(r.value),Number(r.metrics[metric]??0)]));
  for(let t=Math.floor(from/interval)*interval;t<until;t+=interval)points.push([t,byDay.get(t)??0]);
  if(!points.length)return '';
  const max=Math.max(1,...points.map(p=>p[1])),w=1050,h=180,left=45,top=15;
  const xy=points.map(([_,v],i)=>`${left+i*w/Math.max(1,points.length-1)},${top+h-v/max*h}`);
  const guides=[0,.25,.5,.75,1].map(f=>`<line x1="${left}" x2="${left+w}" y1="${top+h-h*f}" y2="${top+h-h*f}" stroke="currentColor" opacity=".08"/><text x="${left-9}" y="${top+h-h*f+4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".55">${num(Math.round(max*f))}</text>`).join('');
  return `<svg viewBox="0 0 1110 220" role="img" aria-label="${esc(metric)} over the selected period"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart)" stop-opacity=".20"/><stop offset="1" stop-color="var(--chart)" stop-opacity=".01"/></linearGradient></defs>${guides}<path d="M${left},${top+h} L${xy.join(' L')} L${left+w},${top+h} Z" fill="url(#fill)"/><polyline points="${xy.join(' ')}" fill="none" stroke="var(--chart)" stroke-width="2.5" stroke-linejoin="round"/>${points.length===1?`<circle cx="${left}" cy="${top+h-points[0][1]/max*h}" r="4" fill="var(--chart)"/>`:''}</svg><details class="chart-data"><summary>View chart data</summary><div class="table-scroll"><table class="analytics-table"><caption>UTC buckets · ${esc(metric)} · no recorded events appear as zero, which does not prove collection was available</caption><thead><tr><th>Time (UTC)</th><th>${esc(metric)}</th></tr></thead><tbody>${points.map(([at,value])=>`<tr><td>${new Date(at*1000).toISOString().replace('T',' ').slice(0,interval<86400?16:10)}</td><td>${num(value)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
