import {businessWorkspace} from './business.js';
import {websiteAccess} from './access.js';
import {idlFactory} from './idl.js';
import {appSignIn,takeHubTicket,session,mountTopbar,topbarIdlFactory} from './hub-client.js';
import {esc,num,metricCards,table,chart,money,dimensionLabel} from './view.js';
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const HUB_URL = "__HUB_URL__";
const $=id=>document.getElementById(id);
session.key='ks-crumbs-session';
let backend,user,sites=[],current,topbar,filters=[],epoch=0,view='overview',refresh,range,dirty=false,creating=false,setting='general',secret='';
let funnelRevision=0;
let steps=[{kind:'page',value:'/'},{kind:'event',value:'Signup'}];
const reportViews=['overview','acquisition','all','goals','journeys','history'];
const signIn=appSignIn({name:'Crumbs',hubUrl:HUB_URL});
function unwrap(r){if(r&&'err'in r){const code=Object.keys(r.err)[0];throw new Error(typeof r.err[code]==='string'?r.err[code]:code);}return r?.ok??r;}
const siteRole=()=>Object.keys(current?.accessRole??{})[0]??'none';
const canManage=()=>['admin','manage'].includes(siteRole());
const isCurrent=run=>run===epoch&&!!user;
function controls(){
 const admin=user?.role==='admin',hasSite=!!current;
 $('emptyTitle').textContent=admin?'Add your first website':'No websites shared with you yet';
 $('emptyCopy').textContent=admin?'Add a website, then copy its tracking script to start collecting traffic.':'Ask a website manager or Hub administrator to give you Read or Manage access.';
 document.querySelectorAll('.admin-only').forEach(e=>e.hidden=!admin);
 document.querySelectorAll('.manager-only').forEach(e=>e.hidden=!canManage());
 $('emptyHub').hidden=admin;$('emptyHub').href=HUB_URL;
 $('newSite').hidden=!admin||!hasSite||creating||view!=='all';
 $('workspaceTitle').textContent=creating?'Add website':view==='all'?'All websites':'Website analytics';
 $('websiteControls').hidden=!hasSite||creating||view==='all';$('nav').hidden=!hasSite||creating;
 $('reportTools').hidden=!hasSite||creating||!reportViews.includes(view);
 const savedVisible=hasSite&&!creating&&['overview','acquisition','goals','journeys'].includes(view);
 $('savedTools').hidden=!savedVisible;if(!savedVisible)$('savedTools').open=false;$('savedReport').hidden=!savedVisible;document.querySelector('label[for=savedReport]').hidden=!savedVisible;
 for(const id of ['saveView','manageSaved'])$(id).hidden=!savedVisible||!canManage();
 if(!savedVisible){$('saveReportForm').hidden=true;$('savedReportList').hidden=true;}
 $('siteAccessLabel').textContent=hasSite?({admin:'Administrator',manage:'Website manager',read:'Read access'}[siteRole()]??''):'';
 $('settingsNav').hidden=creating;
 $('dangerZone').hidden=creating||!admin;
 $('cancelSite').hidden=!creating&&!dirty;
}
function clearSecret(){secret='';$('newKey').textContent='';$('keyResult').hidden=true;$('keyCopyStatus').textContent='';}
function clearReports(){
 for(const id of ['metrics','activity','realtime','chartCaption','exportStatus','chart','pages','sources','countries','devices','breakdown','goals','funnel','journeys','historyRows','keys','health'])$(id).textContent='';
 clearSecret();business.clear();$('accessPanel').replaceChildren();$('siteForm').reset();resetGoal();dirty=false;
}
function notice(message,kind='error'){$('notice').textContent=message;$('notice').hidden=!message;$('notice').dataset.kind=kind;}
function setPeriod(days){const end=new Date(),begin=new Date(end.getTime()-(days-1)*86400000);setRange(begin.toISOString().slice(0,10),end.toISOString().slice(0,10));}
function setRange(from,through){
 const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(through+'T00:00:00Z')+86400000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('Choose a valid start date on or before the end date.');
 if(end-start>1827*86400000)throw new Error('Choose a period of 1827 days or less.');
 range={from:BigInt(start/1000),until:BigInt(end/1000),fromLabel:from,untilLabel:through};
 $('fromDate').value=from;$('toDate').value=through;$('rangeLabel').textContent=from===through?from:from+' – '+through;
}
function request(dimension='',limit=100){return {site:current.id,from:range.from,until:range.until,filters:[...filters],dimension,limit:BigInt(limit)};}
async function report(dimension='',custom){return unwrap(await backend.report(session.load(),custom??request(dimension)));}
async function loadSites(){
 sites=await backend.listSites(session.load());const previous=current?.id;
 current=sites.find(s=>s.id===previous)??sites[0];
 if(previous!==current?.id){filters=[];clearSecret();}
 $('sitePicker').innerHTML=sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name.toLowerCase()===s.domain.toLowerCase()?s.domain:s.name+' · '+s.domain)}</option>`).join('');
 $('sitePicker').value=current?.id??'';controls();propertyOptions();
}
function propertyOptions(){const selected=$('dimension').value;document.querySelectorAll('#dimension [data-property]').forEach(e=>e.remove());for(const name of current?.allowedProperties??[]){const option=document.createElement('option');option.value='prop:'+name;option.textContent='Property: '+name;option.dataset.property='true';$('dimension').append(option);}if([...$('dimension').options].some(o=>o.value===selected))$('dimension').value=selected;}
async function chartReport(r,dimension){
 const requests=[];for(let from=r.from;from<r.until;from+=900n*86400n)requests.push(report(dimension,{...r,dimension,limit:1000n,from,until:from+900n*86400n<r.until?from+900n*86400n:r.until}));
 const parts=await Promise.all(requests);return {rows:parts.flatMap(p=>p.rows),truncated:parts.some(p=>p.truncated)};
}
async function overview(run){
 const r=request(),length=r.until-r.from,old={...r,from:r.from-length<0n?0n:r.from-length,until:r.from};
 const realtime={...r,from:BigInt(Math.floor(Date.now()/1000)-300),until:BigInt(Math.floor(Date.now()/1000)+1),filters:[{dimension:'event',values:[''],exclude:false}]};
 const dimension=$('dimension').value,timeDimension=length<=3600n?'minute':length<=86400n?'hour':'day';
 const data=await Promise.all([report('',r),report('',old),chartReport(r,timeDimension),report('path'),report('source'),report('country'),report('device'),report(dimension),report('',realtime)]);
 if(!isCurrent(run))return;
 $('metrics').innerHTML=metricCards(data[0].totals,data[1].totals);
 const m=data[0].totals,activity=[num(m.events)+' custom events'];
 if(Number(m.scrollSamples))activity.push((Number(m.scrollDepthSum)/Number(m.scrollSamples)).toFixed(0)+'% average scroll depth');
 activity.push(...m.revenue.map(([currency,minor])=>money(currency,minor)+' revenue'));
 if(r.from<BigInt(Math.floor(Date.now()/1000))-current.retentionDays*86400n)notice('Part of this period is older than the website retention of '+current.retentionDays+' days. Deleted records cannot be included.','info');
 $('activity').textContent=activity.join(' · ');$('chart').innerHTML=chart(data[2].rows,Number(r.from),Number(r.until),{metric:$('chartMetric').value,interval:timeDimension==='minute'?60:timeDimension==='hour'?3600:86400});
 $('chartCaption').innerHTML=`<span>${esc(range.fromLabel)}</span><span>${esc(range.untilLabel)}</span>`;
 [['pages','path',3],['sources','source',4],['countries','country',5],['devices','device',6],['breakdown',dimension,7]].forEach(([id,d,i])=>{$(id).innerHTML=table(data[i].rows,d);});
 if(!data[5].rows.some(row=>row.value))$('countries').innerHTML='<p class="empty-report">No location data available.<br><span class="subtle">Native collection does not add geolocation.</span></p>';
 $('realtime').textContent=num(data[8].totals.visitors)+' visitors in the last 5 minutes';$('realtime').title='Across this website, independent of the selected dates and filters.';
 if(data.some(r=>r.truncated))notice('Showing the top results. Metric totals include the entire selected period.','info');
}
function clearFunnel(){funnelRevision++;$('funnel').textContent='';$('funnelStatus').textContent='';}
async function goals(run){
 clearFunnel();
 const list=unwrap(await backend.goals(session.load(),current.id)),base=await report();
 const rows=await Promise.all(list.map(async g=>({g,hit:unwrap(await backend.goalReport(session.load(),request(),g.id))})));
 if(!isCurrent(run))return;
 $('goals').innerHTML=rows.length?rows.map(({g,hit})=>`<div class="data-row goal-row"><span class="access-name"><strong>${esc(g.name)}</strong><span class="subtle">${'scroll'in g.kind?'Scroll '+g.kind.scroll+'%':'page'in g.kind?'Page':'Event'} · ${esc(g.value)}</span></span><span class="number">${num(hit.visitors)} visitors · ${num(hit.completions)} completions <span class="subtle">· ${Number(base.totals.visitors)?(Number(hit.visitors)/Number(base.totals.visitors)*100).toFixed(1):'0.0'}%</span></span>${canManage()?`<button data-delete-goal="${esc(g.id)}" data-name="${esc(g.name)}" aria-label="Delete goal ${esc(g.name)}">Remove</button>`:''}</div>`).join(''):`<p class="empty-report">${canManage()?'Add a goal to measure an important page visit or event.':'No goals have been configured for this website.'}</p>`;
}
async function journeys(run){const rows=unwrap(await backend.journeys(session.load(),request()));if(!isCurrent(run))return;$('journeys').innerHTML=rows.length?rows.map(([from,to,count])=>`<div class="data-row"><span class="journey-path">${esc(from)} <span aria-label="to">→</span> ${esc(to)}</span><span class="number">${num(count)}</span></div>`).join(''):'<p class="empty-report">No page transitions in this period.</p>';}
async function historyView(run){const r=request(),rows=unwrap(await backend.imported(session.load(),current.id,r.from,r.until));if(!isCurrent(run))return;$('historyRows').innerHTML=rows.length?rows.map(row=>`<div class="data-row"><span class="access-name"><strong>${esc(row.value||'Total')}</strong><span class="subtle">${new Date(Number(row.day)*1000).toISOString().slice(0,10)} · ${esc(dimensionLabel(row.dimension))}</span></span><span class="number">${num(row.metrics.visitors)} visitors · ${num(row.metrics.pageviews)} views</span></div>`).join(''):'<p class="empty-report">No imported data in this period.</p>';}
function settings(site){
 const form=$('siteForm');form.reset();dirty=false;form.elements.id.readOnly=!!site;
 for(const key of ['id','name','domain'])form.elements[key].value=site?.[key]??'';
 form.elements.retentionDays.value=Number(site?.retentionDays??365);form.elements.enabled.checked=site?.enabled??true;
 form.elements.allowedProperties.value=(site?.allowedProperties??[]).join(', ');form.elements.excludedPaths.value=(site?.excludedPaths??[]).join('\n');
 $('siteFormTitle').textContent=site?'Website details':'Add a website';$('siteFormHint').textContent=site?'Update the name, domain and collection preferences.':'Start with a name and domain. You can add people and install tracking next.';
 $('saveSite').textContent=site?'Save changes':'Create website';$('siteIdLabel').textContent=site?'Website ID: '+site.id:'A website ID is created automatically from the domain.';
 $('siteStatus').textContent='';controls();
}
function snippet(){try{const origin=new URL($('collectorUrl').value);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||!['','/'].includes(origin.pathname))throw new Error();$('snippet').textContent=`<script defer src="${new URL('./tracker.js',location.href).href}" data-endpoint="${origin.origin}/api/v1/events" data-site="${current.id}" data-outbound="true" data-downloads="true" data-forms="true"><\/script>`;$('copySnippet').disabled=false;}catch{$('snippet').textContent='Enter an HTTPS origin, for example https://analytics.example.com, without a path.';$('copySnippet').disabled=true;}}
async function apiView(run){
 if(!canManage())return;const [keys,health]=await Promise.all([backend.listKeys(session.load()),user.role==='admin'?backend.health(session.load()):null]);if(!isCurrent(run))return;
 const labels={read:'Read reports',manage:'Manage content',share:'Shared report'};
 $('keys').innerHTML=unwrap(keys).filter(k=>k.site===current.id).map(k=>`<div class="data-row"><span class="access-name"><strong>${esc(k.name)}</strong><span class="subtle">${labels[Object.keys(k.scope)[0]]??'Key'} · expires ${new Date(Number(k.expiresAt)*1000).toISOString().slice(0,10)}</span></span><button data-revoke="${esc(k.id)}" data-name="${esc(k.name)}">Revoke</button></div>`).join('')||'<p class="empty-report">No keys or shared reports for this website.</p>';
 if(health){const h=unwrap(health);$('health').textContent=`${num(h.accepted)} accepted · ${num(h.duplicates)} duplicate deliveries ignored · ${num(h.rejected)} rejected · ${num(h.storedEvents)} retained.`;}
}
function renderFilters(){const show=current&&!creating&&['overview','acquisition','goals','journeys'].includes(view)&&filters.length;$('filters').hidden=!show;$('filters').innerHTML=show?filters.map((f,i)=>`<span class="filter">${esc(dimensionLabel(f.dimension))}: ${esc(f.values.map(v=>v||'Direct / none').join(', '))}<button data-remove="${i}" aria-label="Remove ${esc(dimensionLabel(f.dimension))} filter">×</button></span>`).join('')+'<button class="text-button" id="clearFilters">Clear all</button>':'';}
async function route(){
 if(!user)return;const run=++epoch;creating=location.hash==='#/new'&&user.role==='admin';
 const path=location.hash.replace(/^#\/?/,'').split('/');view=creating?'settings':path[0]||'overview';setting=['general','tracking','access','search'].includes(path[1])?path[1]:'general';
 if(![...reportViews,'settings','api'].includes(view)||(['settings','api'].includes(view)&&!canManage()&&!creating))view='overview';
 if(reportViews.includes(view)&&$('period').value!=='custom'){if($('period').value==='realtime'){const now=Math.floor(Date.now()/1000);range={from:BigInt(now-1800),until:BigInt(now+1),fromLabel:'Last 30 minutes',untilLabel:'Now'};$('rangeLabel').textContent='Last 30 minutes';}else setPeriod(Number($('period').value));}
 $('empty').hidden=!!current||creating;controls();renderFilters();notice('');
 document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='v-'+view||(!current&&!creating));
 document.querySelectorAll('#nav button').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
 document.querySelectorAll('#settingsNav button').forEach(el=>{el.classList.toggle('active',el.dataset.setting===setting);el.setAttribute('aria-current',el.dataset.setting===setting?'page':'false');});
 document.querySelectorAll('.settings-section').forEach(el=>el.hidden=el.id!=='settings-'+(creating?'general':setting));
 if(!current&&!creating){clearReports();$('loadingStatus').hidden=true;return;}
 clearSecret();$('accessPanel').replaceChildren();$('loadingStatus').hidden=false;$('v-'+view).setAttribute('aria-busy','true');
 try{
  if(['overview','acquisition','goals','journeys'].includes(view))await business.savedControls(run);
  if(view==='overview')await overview(run);
  else if(view==='acquisition')await Promise.all([business.acquisition(run),business.searchView(run)]);
  else if(view==='all')await business.allSites(run);
  else if(view==='goals')await Promise.all([goals(run),business.revenueView(run)]);
  else if(view==='journeys')await journeys(run);
  else if(view==='history')await historyView(run);
  else if(view==='settings'){
   if(creating||setting==='general')settings(creating?null:current);
   else if(setting==='tracking'){snippet();$('copyStatus').textContent='';}
   else if(setting==='search')await business.searchSettings(run);
   else await websiteAccess({actor:backend,token:()=>session.load(),site:current.id,mount:$('accessPanel'),isCurrent:()=>isCurrent(run),onDirty:value=>{dirty=value;},onSaved:async()=>{dirty=false;await loadSites();await route();notice('Website access saved.','success');}});
  }else await apiView(run);
 }catch(e){if(isCurrent(run)){clearReports();notice('Could not load '+(reportViews.includes(view)?'this report':'this section')+': '+e.message);}}
 finally{if(isCurrent(run)){$('loadingStatus').hidden=true;$('v-'+view).setAttribute('aria-busy','false');}}
}
async function confirmAction(title,text,button='Discard changes'){
 const dialog=$('confirmDialog');if(dialog.open)return false;
 $('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmAccept').textContent=button;dialog.returnValue='';
 return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();});
}
async function navigate(hash){if(dirty&&!await confirmAction('Discard unsaved changes?','Your changes have not been saved.'))return;if(dirty){$('saveReportForm').hidden=true;resetGoal();}dirty=false;$('savedTools').open=false;if(location.hash===hash)await route();else location.hash=hash;}
async function signOut(){++epoch;clearInterval(refresh);const t=session.load();session.clear();if(t)backend.signOut(t).catch(()=>{});user=null;clearReports();topbar?.destroy();topbar=null;$('layout').hidden=true;$('login').hidden=false;}
async function action(fn,button,status){if(button?.disabled)return;const run=epoch,fields=[...(button?.form?.elements??(button?[button]:[]))].map(el=>[el,el.disabled]);notice('');fields.forEach(([el])=>{el.disabled=true;});if(status)status.textContent='Working…';try{await fn(run);}catch(e){if(isCurrent(run)){if(status)status.textContent=e.message;else notice(e.message);}}finally{fields.forEach(([el,disabled])=>{el.disabled=disabled;});}}
async function copy(text,status){try{if(!text)throw new Error();await navigator.clipboard.writeText(text);status.textContent='Copied.';}catch{status.textContent='Select and copy the text above. Your browser did not allow clipboard access.';}}
const business=businessWorkspace({actor:()=>backend,token:()=>session.load(),site:()=>current,sites:()=>sites,request,epoch:()=>epoch,isCurrent,notice,confirm:confirmAction,route,dirty:value=>{dirty=value;},
 steps:()=>steps.map(s=>({kind:{[s.kind]:null},value:s.value.trim()})),
 applySaved:r=>{$('savedTools').open=false;$('savedTools').querySelector('summary').focus();filters=r.filters.map(f=>({...f,values:[...f.values]}));if(r.steps.length){steps=r.steps.map(s=>({kind:Object.keys(s.kind)[0],value:s.value}));renderSteps();void navigate('#/goals');}else void route();},
 openSite:id=>{current=sites.find(s=>s.id===id);filters=[];clearReports();$('sitePicker').value=id;void navigate('#/overview');}
});
$('allWebsites').onclick=()=>navigate('#/all');
document.addEventListener('click',e=>{if(!$('savedTools').contains(e.target))$('savedTools').open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('savedTools').open){$('savedTools').open=false;$('savedTools').querySelector('summary').focus();}});
$('chartMetric').onchange=()=>route();
$('realtime').onclick=()=>{$('period').value='realtime';$('dateRange').hidden=true;void route();};
$('newSite').onclick=$('emptyAdd').onclick=()=>navigate('#/new');
$('sitePicker').onchange=async()=>{const id=$('sitePicker').value;if(dirty&&!await confirmAction('Discard unsaved changes?','Your changes have not been saved.')){$('sitePicker').value=current.id;return;}dirty=false;current=sites.find(s=>s.id===id);filters=[];clearReports();propertyOptions();await route();};
$('period').onchange=()=>{const custom=$('period').value==='custom';$('dateRange').hidden=!custom;if(!custom){if($('period').value!=='realtime')setPeriod(Number($('period').value));void route();}};
$('dateRange').onsubmit=e=>{e.preventDefault();try{setRange($('fromDate').value,$('toDate').value);void route();}catch(e){notice(e.message);}};
$('dimension').onchange=()=>route();
$('nav').onclick=e=>{const b=e.target.closest('[data-view]');if(b)void navigate('#/'+b.dataset.view);};
$('settingsNav').onclick=e=>{const b=e.target.closest('[data-setting]');if(b)void navigate('#/settings/'+b.dataset.setting);};
window.addEventListener('hashchange',async e=>{
 if(dirty){const target=location.hash;history.replaceState(null,'',e.oldURL);if(!await confirmAction('Discard unsaved changes?','Your changes have not been saved.'))return;dirty=false;$('saveReportForm').hidden=true;resetGoal();history.replaceState(null,'',target);}
 await route();
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
$('layout').addEventListener('click',async e=>{
 const b=e.target.closest('[data-filter]');if(b){filters=filters.filter(f=>f.dimension!==b.dataset.filter).concat({dimension:b.dataset.filter,values:[b.dataset.value],exclude:false});await route();}
 const remove=e.target.closest('[data-remove]');if(remove){filters.splice(Number(remove.dataset.remove),1);await route();}
 if(e.target.closest('#clearFilters')){filters=[];await route();}
 const revoke=e.target.closest('[data-revoke]');if(revoke&&await confirmAction('Revoke '+revoke.dataset.name+'?','Any integration or shared report using this key will stop working.','Revoke'))await action(async run=>{unwrap(await backend.revokeKey(session.load(),revoke.dataset.revoke));if(isCurrent(run))await apiView(run);},revoke);
 const preset=e.target.closest('[data-goal-preset]');if(preset){$('goalForm').hidden=false;$('goalForm').elements.name.value=preset.textContent;$('goalForm').elements.kind.value='event';$('goalForm').elements.value.value=preset.dataset.goalPreset;goalType();$('goalForm').elements.name.focus();}
 const del=e.target.closest('[data-delete-goal]');if(del&&await confirmAction('Remove '+del.dataset.name+'?','The goal is removed. Collected events remain available.','Remove goal'))await action(async run=>{unwrap(await backend.deleteGoal(session.load(),current.id,del.dataset.deleteGoal));if(isCurrent(run))await goals(run);},del);
});
$('siteForm').oninput=()=>{dirty=true;$('siteStatus').textContent='Unsaved changes';controls();};
$('cancelSite').onclick=()=>navigate(current?'#/overview':'#/');
$('siteForm').onsubmit=e=>{e.preventDefault();action(async run=>{
 const f=e.target.elements,raw=f.domain.value.trim();let domain;try{const url=new URL(raw.includes('://')?raw:'https://'+raw);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw new Error();domain=url.hostname.toLowerCase();}catch{throw new Error('Enter a valid website domain, such as example.com.');}
 if(creating&&sites.some(s=>s.domain===domain))throw new Error('This website already exists. Choose it in the website menu.');
 let id=creating?domain.replace(/[^a-z0-9_-]/g,'-').slice(0,80):f.id.value;
 if(creating&&sites.some(s=>s.id===id)){const base=id.slice(0,70);let suffix=2;while(sites.some(s=>s.id===base+'-'+suffix))suffix++;id=base+'-'+suffix;}
 const site={id,name:f.name.value.trim(),domain,timezone:'UTC',retentionDays:BigInt(f.retentionDays.value),enabled:f.enabled.checked,allowedProperties:f.allowedProperties.value.split(',').map(x=>x.trim()).filter(Boolean),viewers:[],excludedPaths:f.excludedPaths.value.split('\n').map(x=>x.trim()).filter(Boolean)};
 const wasNew=creating;unwrap(await backend.saveSite(session.load(),site));if(!isCurrent(run))return;dirty=false;await loadSites();if(!isCurrent(run))return;current=sites.find(s=>s.id===site.id);$('sitePicker').value=site.id;
 const target=wasNew?'#/settings/tracking':'#/settings/general';history.replaceState(null,'',target);await route();notice(wasNew?'Website created. Install the script below, then add people under People & access.':'Website saved.','success');
 },$('saveSite'),$('siteStatus'));};
$('deleteSite').onclick=async()=>{const site=current;if(!site||!await confirmAction('Delete '+site.name+'?','All website data, API keys and shared links will be permanently deleted. This cannot be undone.','Delete website'))return;await action(async run=>{unwrap(await backend.deleteSite(session.load(),site.id));if(!isCurrent(run))return;dirty=false;await loadSites();history.replaceState(null,'','#/overview');await route();notice('Website deleted.','success');},$('deleteSite'));};
$('collectorUrl').oninput=()=>{snippet();$('copyStatus').textContent='';};$('copySnippet').onclick=()=>copy($('snippet').textContent,$('copyStatus'));
function goalType(){const kind=$('goalForm').elements.kind.value,page=kind!=='event';$('goalDepthLabel').hidden=kind!=='scroll';$('goalValueLabel').textContent=page?'Page path':'Event name';$('goalForm').elements.value.placeholder=page?'/thank-you':'Signup';}
function resetGoal(){$('goalForm').reset();$('goalForm').hidden=true;$('goalStatus').textContent='';goalType();}
$('addGoal').onclick=()=>{$('goalForm').hidden=false;$('goalForm').elements.name.focus();};$('cancelGoal').onclick=resetGoal;
$('goalForm').elements.kind.onchange=goalType;
$('goalForm').onsubmit=e=>{e.preventDefault();action(async run=>{const f=e.target.elements,kind=f.kind.value,value=f.value.value.trim();if(kind!=='event'&&!value.startsWith('/'))throw new Error('A page path starts with /, for example /thank-you.');unwrap(await backend.saveGoal(session.load(),{id:crypto.randomUUID(),site:current.id,name:f.name.value.trim(),kind:{[kind]:kind==='scroll'?BigInt(f.scrollDepth.value):null},value}));if(!isCurrent(run))return;resetGoal();await goals(run);notice('Goal saved.','success');},e.target.querySelector('[type=submit]'),$('goalStatus'));};
function renderSteps(){
 $('funnelSteps').innerHTML=steps.map((step,i)=>`<div class="funnel-input"><span class="step-number">${i+1}</span><label><span class="sr-only">Step ${i+1} type</span><select data-step="${i}" data-field="kind"><option value="page"${step.kind==='page'?' selected':''}>Page visit</option><option value="event"${step.kind==='event'?' selected':''}>Custom event</option></select></label><label class="step-value"><span class="sr-only">Step ${i+1} value</span><input data-step="${i}" data-field="value" value="${esc(step.value)}" placeholder="${step.kind==='page'?'/pricing':'Signup'}" maxlength="500"></label><button data-remove-step="${i}" aria-label="Remove step ${i+1}"${steps.length<=2?' disabled':''}>×</button></div>`).join('');$('addFunnelStep').disabled=steps.length>=10;
}
$('funnelSteps').oninput=e=>{const i=e.target.dataset.step;if(i!==undefined){steps[Number(i)][e.target.dataset.field]=e.target.value;clearFunnel();}};
$('funnelSteps').onchange=e=>{if(e.target.dataset.field==='kind')renderSteps();};
$('funnelSteps').onclick=e=>{const b=e.target.closest('[data-remove-step]');if(b&&steps.length>2){steps.splice(Number(b.dataset.removeStep),1);renderSteps();clearFunnel();}};
$('addFunnelStep').onclick=()=>{if(steps.length<10){steps.push({kind:'page',value:''});renderSteps();clearFunnel();}};
$('runFunnel').onclick=()=>action(async run=>{const revision=funnelRevision,inputs=steps.map((step,i)=>{const value=step.value.trim();if(!value||step.kind==='page'&&!value.startsWith('/'))throw new Error('Check step '+(i+1)+': enter '+(step.kind==='page'?'a path starting with /.':'an event name.'));return {kind:{[step.kind]:null},value};});const result=unwrap(await backend.funnel(session.load(),request(),inputs));if(!isCurrent(run)||revision!==funnelRevision)return;$('funnelStatus').textContent='Visitors completing each step · percentage of the first step';$('funnel').innerHTML=result.map((n,i)=>`<div class="funnel-step"><span>${i+1}. ${esc(inputs[i].value)}</span><strong>${num(n)} · ${Number(result[0])?(Number(n)/Number(result[0])*100).toFixed(1):'0'}%</strong></div>`).join('');},$('runFunnel'),$('funnelStatus'));
$('keyForm').onsubmit=e=>{e.preventDefault();action(async run=>{const f=e.target.elements,scope=f.scope.value,site=current.id;const r=unwrap(await backend.createKey(session.load(),site,f.name.value.trim(),{[scope]:null},BigInt(f.days.value)));if(!isCurrent(run))return;secret=scope==='share'?new URL('./shared.html',location.href).href+'#site='+encodeURIComponent(site)+'&key='+encodeURIComponent(r.token):r.token;$('keyResult').hidden=false;$('newKey').textContent=secret;$('keyResultLabel').textContent=scope==='share'?'Copy this private report link now. Anyone with the link can read this website until it expires or is revoked.':'Copy this API key now. It will not be shown again. Keep it out of public website code.';$('copyKey').textContent=scope==='share'?'Copy link':'Copy key';$('keyStatus').textContent='Created.';await apiView(run);},e.target.querySelector('button'),$('keyStatus'));};
$('copyKey').onclick=()=>copy(secret,$('keyCopyStatus'));$('dismissKey').onclick=clearSecret;
$('export').onclick=()=>action(async run=>{const site=current.id;let cursor='',events=[];$('exportStatus').textContent='Preparing export…';do{const page=unwrap(await backend.exportEvents(session.load(),site,cursor,500n));if(!isCurrent(run))return;events.push(...page.events);cursor=page.events.length===500?page.cursor:'';if(events.length>100000)throw new Error('Use the paginated API for exports above 100,000 events.');}while(cursor);const blob=new Blob([JSON.stringify(events,(_,v)=>typeof v==='bigint'?v.toString():v)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=site+'-events.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('exportStatus').textContent=num(events.length)+' events exported.';},$('export'),$('exportStatus'));
$('loginBtn').onclick=()=>signIn.continue();
export async function start(actor,person,info,agent,Actor){
 backend=actor;user=person;if(!$('collectorUrl').value&&!BACKEND_CANISTER_ID.startsWith('__'))$('collectorUrl').value='https://'+BACKEND_CANISTER_ID+'.icp.net';
 $('login').hidden=true;$('layout').hidden=false;$('version').textContent=info.version;setPeriod(30);renderSteps();
 topbar=mountTopbar($('topbar'),{hub:{actor:info.hubId&&Actor?Actor.createActor(topbarIdlFactory,{agent,canisterId:info.hubId}):null,token:session.loadSuite()},hubUrl:HUB_URL,app: { id: "crumbs", name:'Crumbs',eyebrow:'Website analytics'},person:user,onSignOut:signOut});
 await loadSites();await route();refresh=setInterval(async()=>{try{
  const refreshed=(await backend.whoami(session.load()))[0];if(!refreshed){await signOut();signIn.status('err','Your access could not be confirmed. Sign in again.');return;}
  const roleChanged=user.role!==refreshed.role,siteBefore=current?.id,accessBefore=siteRole();user=refreshed;await loadSites();
  const changed=roleChanged||accessBefore!==siteRole()||siteBefore!==current?.id;if(changed)clearReports();
  if((!dirty&&!document.hidden&&(view==='overview'||($('period').value==='realtime'&&reportViews.includes(view))))||changed)await route();
 }catch{await signOut();signIn.status('err','Your access could not be confirmed.');}},30000);
}
async function boot(){try{const {HttpAgent,Actor}=await import('./agent-bundle.js');const agent=await HttpAgent.create({host:'https://icp0.io'});backend=Actor.createActor(idlFactory,{agent,canisterId:BACKEND_CANISTER_ID});const info=await backend.info();const ticket=takeHubTicket();if(ticket){session.clear();const r=(await backend.loginWithTicket(ticket))[0];if(!r)throw new Error('Sign-in was not accepted.');session.save(r.token);session.saveSuite(r.suiteToken);}if(session.load()){const person=(await backend.whoami(session.load()))[0];if(person)await start(backend,person,info,agent,Actor);else session.clear();}}catch(e){signIn.status('err',e.message);}finally{signIn.ready();}}
void boot();
