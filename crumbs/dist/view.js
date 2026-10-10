export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num=value=>Number(value).toLocaleString('en-US');
export const dimensionLabel=value=>({channel:'Channel',aiSource:'AI assistant',path:'Page',source:'Source',campaign:'Campaign',entryPath:'Entry page',exitPath:'Exit page',medium:'Medium',device:'Device',country:'Country',region:'Region',city:'City',browser:'Browser',os:'Operating system',event:'Event',hostname:'Hostname',content:'Campaign content',term:'Campaign term'}[value]??String(value).replace(/^prop:/,'Property: '));
export function money(currency,minor){try{const format=new Intl.NumberFormat('en-US',{style:'currency',currency});return format.format(Number(minor)/10**format.resolvedOptions().maximumFractionDigits);}catch{return currency+' '+num(minor)+' minor units';}}
/** One wording for the unknown group everywhere; country codes become names with a flag. */
let regionNames=null;try{regionNames=new Intl.DisplayNames(['en'],{type:'region'});}catch{}
export function valueLabel(value,dimension){
 if(!value)return dimension==='event'?'Pageviews':['source','channel','medium','campaign','aiSource','content','term'].includes(dimension)?'Direct / unknown':'Unknown';
 if(dimension==='country'&&/^[A-Z]{2}$/.test(value)){const flag=String.fromCodePoint(...[...value].map(c=>0x1F1E6+c.charCodeAt(0)-65));let name=value;try{name=regionNames?.of(value)||value;}catch{}return flag+' '+name;}
 if(dimension==='entryPath'||dimension==='exitPath'||dimension==='path'){if(value==='(entry)')return 'Entry';if(value==='(exit)')return 'Exit';}
 return value;
}
export const journeyLabel=value=>value==='(entry)'?'Entry':value==='(exit)'?'Exit':value==='/'?'Home (/)':value;
export function metricCards(m,previous){
 const pct=(a,b)=>b?100*a/b:0,duration=v=>{const seconds=Math.round(v);return Math.floor(seconds/60)+'m '+seconds%60+'s';};
 const scroll=d=>Number(d.scrollSamples)?Number(d.scrollDepthSum)/Number(d.scrollSamples):0;
 const values=[['Visitors','visitors',num,'Daily estimates, not identified people'],['Visits','visits',num,'A new visit starts after 30 minutes without a pageview or custom event'],['Pageviews','pageviews',num,'Repeat page loads count; the visitor count stays unchanged'],['Bounce rate','bounce',v=>v.toFixed(1)+'%','Visits with one page and no interactive event'],['Visit duration','duration',duration,'Average time between the first and last pageview or event of a visit'],['Events','events',num,'Custom events sent by your pages'],['Scroll depth','scroll',v=>v?v.toFixed(0)+'%':'—','Average maximum scroll depth of measured pages'],['Revenue','revenue',null,'Recorded purchase events; currencies stay separate']];
 const value=(data,key)=>key==='bounce'?pct(Number(data.bounces),Number(data.visits)):key==='duration'?(Number(data.visits)?Number(data.durationSeconds)/Number(data.visits):0):key==='scroll'?scroll(data):Number(data[key]);
 return values.map(([label,key,format,hint])=>{
  if(key==='revenue'){const list=m.revenue||[];const shown=list.length?list.map(([c,n])=>money(c,n)).join(' · '):'—';const prev=previous?.revenue||[];let change='';if(previous&&list.length===1&&prev.length===1&&prev[0][0]===list[0][0]&&Number(prev[0][1])){const delta=(Number(list[0][1])-Number(prev[0][1]))/Number(prev[0][1])*100;change=arrow(delta,false);}return card(label,shown,change,hint);}
  const n=value(m,key),old=previous?value(previous,key):null;let change='';
  if(previous){if(key==='bounce'){if(Number(previous.visits)){const delta=n-old;change=arrow(delta,true,delta.toFixed(1)+' pp');}}else if(old){change=arrow((n-old)/old*100,false);}else change=n===0?'<span class="change flat">no change</span>':'<span class="change flat">no previous data</span>';}
  return card(label,format(n),change,hint);
 }).join('');
 function arrow(delta,inverse,text){const t=text??(Math.abs(delta).toFixed(1)+'%');const cls=Math.abs(delta)<0.05?'flat':((delta>0)!==inverse)?'up':'down';const mark=Math.abs(delta)<0.05?'●':delta>0?'▲':'▼';return `<span class="change ${cls}" title="Compared with the previous period of the same length">${mark} ${t} vs prev.</span>`;}
 function card(label,shown,change,hint){return `<div class="metric" title="${esc(hint)}"><div class="subtle">${label}</div><div class="value">${shown}</div>${change}</div>`;}
}
export function table(rows,dimension){
  if(!rows.length)return '<div class="empty-report">No data in this period.</div>';
  const max=Math.max(1,...rows.map(r=>Number(r.metrics.visitors)));
  return rows.map(r=>`<button class="data-row" data-filter="${esc(dimension)}" data-value="${esc(r.value)}" title="Filter the report by ${esc(dimensionLabel(dimension))}: ${esc(valueLabel(r.value,dimension))}" style="--bar:${Number(r.metrics.visitors)/max*100}%"><span class="name">${esc(valueLabel(r.value,dimension))}</span><span class="number">${num(r.metrics.visitors)}</span></button>`).join('');
}
/** Chart with a date axis, hover values and the previous period as a dashed line. `labels` names each bucket in the website's time zone. */
export function chart(rows,from,until,{metric="visitors",interval=86400,labels=null,previous=null,previousOffset=0}={}){
  const points=[];const byDay=new Map(rows.map(r=>[Number(r.value),Number(r.metrics[metric]??0)]));
  const starts=labels?labels.map(l=>l.at):null;
  if(starts&&starts.length){for(let i=0;i<starts.length;i++)points.push([starts[i],byDay.get(starts[i])??0]);}
  else for(let t=Math.floor(from/interval)*interval;t<until;t+=interval)points.push([t,byDay.get(t)??0]);
  if(!points.length)return '';
  const prevPoints=previous?points.map(([t],i)=>{const key=previous.starts?previous.starts[i]:t-previousOffset;return key===undefined?0:Number(previous.byKey.get(key)??0);}):null;
  const max=Math.max(1,...points.map(p=>p[1]),...(prevPoints||[])),w=1050,h=180,left=45,top=15;
  const x=i=>left+i*w/Math.max(1,points.length-1),y=v=>top+h-v/max*h;
  const xy=points.map(([_,v],i)=>`${x(i)},${y(v)}`);
  const guides=[0,.25,.5,.75,1].map(f=>`<line x1="${left}" x2="${left+w}" y1="${top+h-h*f}" y2="${top+h-h*f}" stroke="currentColor" opacity=".08"/><text x="${left-9}" y="${top+h-h*f+4}" text-anchor="end" font-size="10" fill="currentColor" opacity=".55">${num(Math.round(max*f))}</text>`).join('');
  const name=i=>labels?labels[i].text:new Date(points[i][0]*1000).toISOString().replace('T',' ').slice(0,interval<86400?16:10);
  const step=Math.max(1,Math.ceil(points.length/8));
  const axis=points.map((_,i)=>i%step===0||i===points.length-1?`<text x="${x(i)}" y="${top+h+16}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}" font-size="10" fill="currentColor" opacity=".6">${esc(labels?labels[i].short:name(i))}</text>`:'').join('');
  const dots=points.map(([_,v],i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="6" fill="transparent" stroke="none"><title>${esc(name(i))}: ${num(v)} ${esc(metric)}${prevPoints?' · previous '+num(prevPoints[i]):''}</title></circle>`).join('');
  const prevLine=prevPoints?`<polyline points="${prevPoints.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="var(--chart)" stroke-width="1.5" stroke-dasharray="4 4" opacity=".55"/>`:'';
  return `<svg viewBox="0 0 1110 240" role="img" aria-label="${esc(metric)} over the selected period"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart)" stop-opacity=".20"/><stop offset="1" stop-color="var(--chart)" stop-opacity=".01"/></linearGradient></defs>${guides}<path d="M${left},${top+h} L${xy.join(' L')} L${left+w},${top+h} Z" fill="url(#fill)"/>${prevLine}<polyline points="${xy.join(' ')}" fill="none" stroke="var(--chart)" stroke-width="2.5" stroke-linejoin="round"/>${points.length===1?`<circle cx="${left}" cy="${y(points[0][1])}" r="4" fill="var(--chart)"/>`:''}${dots}${axis}</svg>${prevPoints?'<div class="chart-legend"><span><i></i>This period</span><span><i class="prev"></i>Previous period</span></div>':''}<details class="chart-data"><summary>View chart data</summary><div class="table-scroll"><table class="analytics-table"><caption>${labels?'Days in the website\'s time zone':'UTC buckets'} · ${esc(metric)} · no recorded events appear as zero, which does not prove collection was available</caption><thead><tr><th>Time</th><th>${esc(metric)}</th>${prevPoints?'<th>Previous</th>':''}</tr></thead><tbody>${points.map(([at,value],i)=>`<tr><td>${esc(name(i))}</td><td>${num(value)}</td>${prevPoints?`<td>${num(prevPoints[i])}</td>`:''}</tr>`).join('')}</tbody></table></div></details>`;
}
