/* Aggregate-only workspace. Every request is independently authorized by Hub and its source. */
(() => {
  'use strict';
  const APPS = {
    desk: {name:'Desk', category:'INTERNAL SUPPORT', path:'#/queue', icon:'M3 8V4h18v4a4 4 0 0 0 0 8v4H3v-4a4 4 0 0 0 0-8m11-4v3m0 4v2m0 4v3', keys:['active','unassigned','breached','departureReview','offboarding','lifecycleUnverified']},
    trust: {name:'Trust', category:'DEVICE HEALTH', path:'#/devices', icon:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6', keys:['total','passing','attention','unverified','assessed','score']},
    assets: {name:'Assets', category:'HARDWARE', path:'#/devices', icon:'M4 4h16v12H4zM2 20h20M8 16l-1 4m9-4 1 4', keys:['total','stock','assigned','handover','preparing','sales']},
    contracts: {name:'Contracts', category:'RENEWALS & OWNERSHIP', path:'', icon:'M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8m-8 4h5', keys:['total','due','overdue','unknown','unowned']},
    watch: {name:'Watch', category:'DOMAIN MONITORING', path:'#/overview', icon:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z', keys:['enabled','alerts','warnings','stale','expiring','unknown','expiryDays']}
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = n => n.toLocaleString('en');
  function link(source, path) {
    try { const u = new URL(source.url); if(u.protocol !== 'https:' || u.username || u.password) return ''; u.search=''; u.hash=path ?? APPS[source.app].path; return u.href; } catch { return ''; }
  }
  function snapshot(result, now) {
    if(result?.schema !== 1n && result?.schema !== 1) return {state:'unavailable'};
    if(result.state && 'denied' in result.state) return {state:'denied'};
    if(!result.state || !('ready' in result.state)) return {state:'unavailable'};
    const at = Number(result.checkedAt / 1000000n);
    if(!Number.isFinite(at) || at > now + 5000 || now - at > 90000) return {state:'stale'};
    const values = Object.create(null);
    for(const [key,value] of result.metrics || []) {
      const n=Number(value); if(key in values || !Number.isSafeInteger(n) || n<0) return {state:'unavailable'};
      values[key]=n;
    }
    return {state:'ready', at, values};
  }
  function presentation(app, m) {
    switch(app) {
      case 'desk': return {value:m.active, unit:'open requests', context:'Internal tickets · customer projects stay separate', rows:[[m.breached,'past their service target'],[m.unassigned,'without an agent']], note:`${number(m.offboarding)} confirmed offboardings · ${number(m.departureReview)} to review`, work:[
        [m.breached,'Review overdue requests','Check the service target and next response.'],
        [m.departureReview,'Review account changes','Confirm departure or pause offboarding.'],
        [m.unassigned,'Assign an agent','Give incoming work a clear owner.'],
        [m.lifecycleUnverified,'Check directory follow-up','Desk has not verified recent directory changes.'] ]};
      case 'trust': return {value:m.assessed ? m.score : '—', unit:'average verified score', context:`${number(m.assessed)} of ${number(m.total)} real devices fully assessed`, rows:[[m.attention,'with failing checks'],[m.unverified,'not fully verified']], note:'Samples excluded · evidence must be current within 24h', bar:m.total ? m.assessed/m.total : null, barLabel:'Full assessment coverage', work:[
        [m.attention,'Investigate failing checks','Open Trust for evidence and the next step.'],
        [m.unverified,'Restore device reporting','Check stale, missing or failed assessments.'] ]};
      case 'assets': return {value:m.stock, unit:'devices in stock', context:`${number(m.total)} registered · ${number(m.assigned)} assigned`, rows:[[m.handover,'hardware handovers open'],[m.sales,'sales to finish']], note:`${number(m.preparing)} received by IT, still in preparation`, work:[
        [m.handover,'Complete hardware handovers','Use the Offboarding filter in Assets.'],
        [m.sales,'Finish outstanding sales','Payment alone does not confirm handover.','#/sales'] ]};
      case 'contracts': return {value:m.due, unit:'decisions in the next 30 days', context:`${number(m.total)} active or cancelling contracts`, rows:[[m.overdue,'decision dates passed'],[m.unowned,'without an active owner']], note:`${number(m.unknown)} with an unknown decision date`, work:[
        [m.overdue,'Review overdue contract decisions','Check the recorded terms before renewing.'],
        [m.due,'Plan upcoming renewals','Decide before the cancellation deadline.'],
        [m.unknown,'Complete renewal dates','Unknown terms cannot provide a reliable warning.'],
        [m.unowned,'Assign contract owners','Keep renewals moving when people leave.'] ]};
      case 'watch': return {value:m.alerts, unit:'domains with alerts', context:`${number(m.enabled)} domains actively monitored`, rows:[[m.warnings,'with monitoring warnings'],[m.stale,'checks late or unsuccessful']], note:`${number(m.expiring)} expiring within ${number(m.expiryDays)} days · ${number(m.unknown)} expiry dates unverified`, work:[
        [m.alerts,'Investigate domain alerts','Review changed records and potential exposures.'],
        [m.warnings,'Review monitoring warnings','Check resolver disagreement and missing evidence.'],
        [m.stale,'Check domain monitoring','A missed check is not a healthy result.'],
        [m.expiring,'Review expiring domains','Confirm renewal with the registrar.'],
        [m.unknown,'Verify domain expiry','Registry data is missing or older than two days.'] ]};
    }
  }
  function create(root, getAPI, options={}) {
    const now=options.now || Date.now;
    const interval=options.interval ?? 60000;
    let active=false, generation=0, timer, ageTimer, entries=[], busy=false;
    root.classList.add('ops-workspace');
    root.innerHTML=`<header class="ops-heading"><div><div class="ops-eyebrow">OPERATIONS</div><h2>Your IT, in the picture.</h2><p class="lead">A shared view of the work that needs you.</p></div><div class="ops-heading-actions">${options.manageDisplays?.()?'<a href="#/screens">Screens ↗</a>':''}<button type="button" data-refresh>Refresh</button></div></header>
      <div class="ops-coverage"><span class="ops-dot" aria-hidden="true"></span><span data-coverage role="status">Checking your connected apps…</span><span class="ops-cadence">Refreshes every minute</span></div>
      <div data-error role="status"></div><div class="ops-grid" data-grid></div>
      <section class="ops-next"><div class="ops-section-heading"><h3>Where to focus</h3><span>Continue in the app that owns the work</span></div><div data-work class="ops-work"></div></section>
      <details class="ops-explain"><summary>What these numbers cover</summary><p>Only connected apps where you have Admin access in Hub appear here. Each app calculates its own current totals; records and personal details stay in that app. Changes to your access are checked again on every refresh.</p><p>These are current snapshots, not historical trends. An unavailable app is never counted as healthy. Trust scores cover fully assessed real devices; coverage is shown separately. In-stock hardware excludes open handovers. Contract dates come from recorded terms, not a vendor billing system.</p></details>`;
    const $=s=>root.querySelector(s);
    $('[data-refresh]').onclick=()=>refresh();
    function clearTimer(){clearTimeout(timer);clearInterval(ageTimer);}
    function paint() {
      if(!active) return;
      const ready=entries.filter(e=>e.data.state==='ready');
      $('[data-coverage]').textContent=entries.length ? `${ready.length} of ${entries.length} connected sources checked${busy?' · refreshing…':''}` : busy ? 'Checking your connected apps…' : 'No Operations sources available';
      $('[data-refresh]').disabled=busy;
      root.dataset.complete=String(entries.length>0 && ready.length===entries.length);
      $('[data-grid]').innerHTML=entries.map(e=>card(e)).join('');
      const actions=[];
      for(const e of ready) {
        const first=presentation(e.source.app,e.data.values).work.find(([count])=>count>0);
        if(first) { const [count,title,detail,path]=first; actions.push({e,count,title,detail,path}); }
      }
      $('[data-work]').innerHTML=actions.length ? actions.map(({e,count,title,detail,path})=>{
        const href=link(e.source,path);const tag=href?'a':'div';
        return `<${tag} class="ops-action" ${href?`href="${esc(href)}"`:''}><span class="ops-action-count">${number(count)}</span><span><small>${esc(e.source.name)}</small><strong>${esc(title)}</strong><span>${esc(detail)}</span></span>${href?'<b aria-hidden="true">↗</b>':''}</${tag}>`;
      }).join('') : `<div class="ops-empty">${busy ? 'Checking the stack…' : ready.length===entries.length && entries.length ? 'No follow-up flags in the connected sources.' : ready.length ? 'No follow-up flags in the checked sources. Other sources are still unverified.' : 'Once a source is available, its follow-up work appears here.'}</div>`;
      if(!entries.length && !busy && !$('[data-error]').textContent) $('[data-grid]').innerHTML='<div class="ops-empty ops-setup"><strong>Connect your working stack.</strong><p>Desk, Trust, Assets, Contracts and Watch can contribute. You need Admin access in each app to see its totals.</p><a href="#/apps">Manage connected apps →</a></div>';
    }
    function card({source,data}) {
      const app=APPS[source.app], href=link(source);
      const head=`<div class="ops-card-head"><span class="ops-app-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${app.icon}"/></svg></span><div><h3>${esc(source.name)}</h3><small>${app.category}</small></div>${href?`<a href="${esc(href)}" class="ops-open" aria-label="Open ${esc(source.name)}">↗</a>`:''}</div>`;
      if(data.state!=='ready') {
        const messages={loading:['Checking source…','Confirming access and reading its current totals.'],denied:['Access needs checking','Your role changed or the app directory is not current. Check Hub Permissions.'],unavailable:['Source unavailable','The app may need an update, or could not respond. Check Apps → Updates and retry.'],stale:['Snapshot expired','Refresh to check this source again. Old values are hidden.']};
        const [title,detail]=messages[data.state]||messages.unavailable;
        return `<article class="ops-card ops-unavailable" data-source="${source.cid}">${head}<div class="ops-metric"><strong>—</strong><span>${title}</span></div><p class="ops-context">${detail}</p><div class="ops-card-footer">${data.state==='loading'?'Waiting for this app':'No current totals'}</div></article>`;
      }
      const p=presentation(source.app,data.values);
      return `<article class="ops-card" data-source="${source.cid}">${head}<div class="ops-metric"><strong>${typeof p.value==='number'?number(p.value):p.value}</strong><span>${p.unit}</span></div><p class="ops-context">${p.context}</p>${p.bar==null?'':`<div class="ops-bar" role="img" aria-label="${p.barLabel}: ${Math.round(p.bar*100)}%"><span style="width:${Math.max(0,Math.min(100,p.bar*100))}%"></span></div>`}<div class="ops-counts">${p.rows.map(([n,text])=>`<div><strong class="${n>0?'ops-flag':''}">${number(n)}</strong><span>${text}</span></div>`).join('')}</div><p class="ops-note">${p.note}</p><div class="ops-card-footer"><span>Current snapshot</span><time datetime="${new Date(data.at).toISOString()}">${new Date(data.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div></article>`;
    }
    async function refresh() {
      if(!active || busy || document.hidden) return;
      busy=true;clearTimeout(timer);const epoch=++generation;
      $('[data-error]').textContent='';
      // Never keep old privileges or metrics on a failed source inventory refresh.
      entries=[];paint();
      try {
        const sources=await getAPI().operationsSources();
        if(!active || epoch!==generation) return;
        if(!Array.isArray(sources)) throw Error('Invalid source inventory');
        entries=sources.filter(s=>APPS[s.app]).sort((a,b)=>Object.keys(APPS).indexOf(a.app)-Object.keys(APPS).indexOf(b.app)).map(source=>({source,data:{state:'loading'}}));paint();
        await Promise.all(entries.map(async e=>{
          let data;
          try { data=snapshot(await getAPI().operationsSnapshot(e.source.cid),now());
            if(data.state==='ready' && APPS[e.source.app].keys.some(k=>!(k in data.values))) data={state:'unavailable'};
          } catch {data={state:'unavailable'};}
          if(!active || epoch!==generation) return;
          e.data=data;paint();
        }));
      } catch {
        if(active && epoch===generation) {entries=[];$('[data-error]').textContent='Operations could not confirm your access. Try Refresh, or sign in again.';}
      } finally {
        if(active && epoch===generation) {busy=false;paint();timer=setTimeout(refresh,interval);}
      }
    }
    function expire(){
      let changed=false;
      for(const e of entries) if(e.data.state==='ready' && now()-e.data.at>90000){e.data={state:'stale'};changed=true;}
      if(changed) paint();
    }
    function stop(){active=false;generation++;busy=false;clearTimer();entries=[];$('[data-grid]').replaceChildren();$('[data-work]').replaceChildren();}
    function visibility(){if(!active) return;if(document.hidden){generation++;busy=false;clearTimer();entries=[];paint();}else{refresh();ageTimer=setInterval(expire,5000);}}
    document.addEventListener('visibilitychange',visibility);
    return {start(){if(active)return;active=true;ageTimer=setInterval(expire,5000);return refresh();},stop,refresh,destroy(){stop();document.removeEventListener('visibilitychange',visibility);root.replaceChildren();}};
  }
  window.KebabOperations={create};
})();
