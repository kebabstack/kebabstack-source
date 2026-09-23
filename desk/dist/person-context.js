import { escapeHtml as esc } from './message-format.js';
const opt = value => value?.[0] ?? null;
const variant = value => Object.keys(value || {})[0];
const when = value => new Date(Number(BigInt(value) / 1000000n)).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
const words = value => String(value || '').replaceAll('_',' ');
export function contextLink(base, path) {
  try { const url = new URL(base); if (url.protocol !== 'https:' || url.username || url.password || !String(path).startsWith('#/')) return ''; url.hash = path; return url.href; } catch { return ''; }
}

// Context is transient and viewer-bound. Never copy it into public ticket text or AI prompts.
export function createPersonContext({root, lifecycleRoot, api, getMe, session, reload}) {
  let generation = 0, key = '', full = null, checked = 0, busy = false;
  const reset = () => { generation++; key=''; full=null; checked=0; busy=false; root.replaceChildren(); lifecycleRoot.replaceChildren(); root.classList.add('hidden'); lifecycleRoot.classList.add('hidden'); };
  async function load(ticket, force=false) {
    if (!ticket?.canAct || !getMe() || getMe().role === 'requester') { reset(); return; }
    const next = `${getMe().id}:${getMe().role}:${ticket.ticket.id}:${JSON.stringify(ticket.ticket.fields)}`;
    if (!force && next === key && (busy || Date.now()-checked < 30000)) return;
    if (next !== key) { reset(); key=next; }
    const stamp = ++generation, viewer = getMe().id, viewerRole = getMe().role, id = ticket.ticket.id;
    const valid = () => stamp === generation && getMe()?.id === viewer && getMe()?.role === viewerRole;
    busy=true; root.classList.remove('hidden');
    if (!full) root.innerHTML='<h3>Person &amp; related work</h3><p class="kv" role="status">Finding the person and connected apps…</p>';
    try {
      const data = opt(await api().personOverview(session.load(),id));
      if (!valid()) return;
      if (!data) { reset(); return; }
      full=data;
      const p=data.person;
      const open=[...root.querySelectorAll('details[open][data-source]')].map(x=>x.dataset.source);
      root.innerHTML=`<div class="field-heading"><h3>${p.id === ticket.requester.id ? 'Person & related work' : 'Affected person'}</h3><button type="button" class="text-button" data-refresh-context aria-label="Refresh person context">Refresh</button></div><div class="context-person"><strong>${esc(p.displayName || p.email || 'Unknown person')}</strong><span>${esc(p.email)}</span>${p.department ? `<span>${esc(p.department)}</span>` : ''}<span class="pill ${p.active ? '' : 'off'}">${p.active ? 'Active in Desk directory' : 'Inactive in Desk directory'}</span></div><p class="context-caption">Live summaries · your app permissions apply</p><div data-hardware></div><div data-context-sources></div><div data-context-tickets></div><p class="context-caption" data-context-status role="status">Checking connected apps…</p>`;
      root.querySelector('[data-refresh-context]').onclick=()=>load(ticket,true);
      renderLifecycle(data.lifecycle, id, valid);
      const hardware=root.querySelector('[data-hardware]');
      if(typeof api().offboardingHardware === 'function') {
        hardware.innerHTML='<p class="context-caption" role="status">Checking hardware follow-up…</p>';
        api().offboardingHardware(session.load(),id).then(optional=>{
          if(!valid())return;
          const h=opt(optional); if(!h){hardware.replaceChildren();return;}
          const p=h.progress,c=h.context,ready=p.state==='ready',active=c.state==='active';
          hardware.innerHTML=`<div class="hardware-summary"><div class="field-heading"><h3>Hardware</h3><span class="pill ${ready&&Number(p.open)===0?'':'off'}">${c.state==='cancelled'?'Cancelled':ready?`${Number(p.total)-Number(p.open)} of ${p.total} complete`:'Not verified'}</span></div><p class="context-caption">${c.state==='cancelled'?'Departure cancelled. Recorded handovers remain in Assets.':!ready?'Assets could not be checked. Completion remains blocked until verification succeeds.':c.state==='review'?'Confirm departure to prepare hardware follow-up.':c.state==='paused'?'Paused while the account change or approval is reviewed.':c.state==='cancelled'?'Departure cancelled. Recorded handovers remain in Assets.':Number(p.total)===0?(Number(p.sources)?'No hardware assigned at the last check.':'No Assets app is connected.'):'Returns, handovers and sales are confirmed in Assets and checked here automatically.'}</p>${active&&Number(p.open)>0?'<p class="context-caption">Open Assets below to arrange each device. No duplicate checklist needed.</p>':''}</div>`;
          if((c.state==='active'||c.state==='paused')&&typeof api().cancelOffboarding==='function') {
            hardware.insertAdjacentHTML('beforeend','<details class="context-more"><summary>Cancel this offboarding</summary><form data-cancel-offboarding><p class="context-caption">Use this when the departure was cancelled or entered by mistake. Recorded handovers remain; outstanding plans stop.</p><label>Reason<textarea name="reason" required minlength="10" maxlength="1000" rows="2"></textarea></label><button type="submit">Cancel offboarding</button><p role="status"></p></form></details>');
            const form=hardware.querySelector('[data-cancel-offboarding]');
            form.onsubmit=async e=>{e.preventDefault();if(!valid())return;const button=form.querySelector('button'),status=form.querySelector('[role=status]');button.disabled=true;try{const r=await api().cancelOffboarding(session.load(),id,c.revision,form.elements.reason.value);if(!valid())return;status.textContent=r.detail;if(r.ok){checked=0;await reload(id);}}catch{if(valid())status.textContent='Could not confirm cancellation. Refresh the case before retrying.';}finally{button.disabled=false;}};
          }
        }).catch(()=>{if(valid())hardware.innerHTML='<p class="context-caption" role="status">Hardware follow-up is unavailable. Refresh before completing this offboarding.</p>';});
      }

      const related=root.querySelector('[data-context-tickets]');
      if (data.related.length) related.innerHTML=`<details class="context-source"><summary>Related requests <span class="count">${data.related.length}${data.related.length===30 ? '+' : ''}</span></summary>${data.related.map(t=>`<a class="context-item" href="#/t/${t.id}"><strong>${esc(t.key)} · ${esc(t.subject)}</strong><span>${esc(words(t.status))}${t.assigneeName ? ' · '+esc(t.assigneeName) : ''}</span></a>`).join('')}</details>`;
      const sources=await api().personContextSources(session.load(),id);
      if (!valid()) return;
      const container=root.querySelector('[data-context-sources]');
      container.innerHTML=sources.map(s=>`<details class="context-source" data-source="${s.cid}"${open.includes(String(s.cid)) ? ' open' : ''}><summary>${esc(s.name)} <span class="count" data-count>…</span></summary><div data-items><p class="kv">Loading…</p></div></details>`).join('');
      // Independent sources fail separately; a slow app never hides the other results.
      const queue=[...sources];
      async function worker() {
        while(queue.length && valid()) {
          const source=queue.shift();
          let result;
          try { result=await api().personContext(session.load(),id,source.cid); }
          catch { result={state:{unavailable:null},items:[],total:0}; }
          if (!valid()) return;
          const section=container.querySelector(`[data-source="${source.cid}"]`);
          if (!section) return;
          const state=variant(result.state), count=section.querySelector('[data-count]'), body=section.querySelector('[data-items]');
          if (state !== 'ready') {
            count.textContent=state==='denied'?'Restricted':'Unavailable';
            body.innerHTML=`<p class="kv">${state==='denied' ? 'Your current permissions do not allow this view. Roles are managed in Hub.' : 'Could not check this app. Refresh to retry; it may need an update.'}</p>`;
            continue;
          }
          const active=result.items.filter(x=>!x.historical), historical=result.items.filter(x=>x.historical);
          count.textContent=String(result.total);
          const row=item=>{
            const url=contextLink(source.url,item.path);
            return `<div class="context-item"><span class="context-kind">${esc(words(item.kind))} · ${esc(words(item.status))}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(item.title)}</strong> ↗</a>` : `<strong>${esc(item.title)}</strong>`}<span>${esc(item.detail)}</span></div>`;
          };
          body.innerHTML=active.slice(0,5).map(row).join('')+(active.length>5?`<details class="context-more"><summary>${active.length-5} more current items</summary>${active.slice(5).map(row).join('')}</details>`:'')+(historical.length?`<details class="context-more"><summary>Previous & completed (${historical.length})</summary>${historical.map(row).join('')}</details>`:'')+(!result.items.length?'<p class="kv">No related records visible to you.</p>':'')+(Number(result.total)>result.items.length?`<p class="kv">Showing ${result.items.length} of ${result.total}. Open the app for the complete list.</p>`:'')+`<p class="context-caption">Checked ${esc(when(result.checkedAt))}</p>`;
        }
      }
      await Promise.all([worker(),worker(),worker()]);
      if (valid()) { checked=Date.now(); root.querySelector('[data-context-status]').textContent=sources.length ? 'Summaries exclude documents, messages and secrets.' : 'No connected apps are available for this view.'; }
    } catch {
      if (valid()) { const status=root.querySelector('[data-context-status]'); if(status)status.textContent='Context could not be refreshed. Use Refresh to retry.'; else root.innerHTML='<h3>Person &amp; related work</h3><p class="kv">Context is unavailable. Refresh the ticket to retry.</p>'; }
    } finally { if(valid())busy=false; }
  }
  function renderLifecycle(optional, id, valid) {
    const c=opt(optional);
    lifecycleRoot.classList.toggle('hidden',!c);
    if(!c){lifecycleRoot.replaceChildren();return;}
    const state=variant(c.state), review=state==='review'||state==='reactivated';
    const titles={review:'Account deactivated · confirm next steps',reactivated:'Account reactivated · review the offboarding',offboarding:'Offboarding confirmed',notDeparture:'Reviewed · not a departure'};
    // Preserve the decision draft across background refreshes.
    const draft=lifecycleRoot.querySelector('textarea')?.value||'';
    lifecycleRoot.innerHTML=`<span class="eyebrow">DIRECTORY FOLLOW-UP · INTERNAL</span><h3>${titles[state]||'Directory change'}</h3><p><strong>${esc(c.name||c.email)}</strong> · ${esc(c.source)} · ${esc(when(c.detectedAt))}</p><p>${c.effectiveActive ? 'Hub access remains active. Check other sources or manual overrides.' : 'Hub access is inactive. External sessions and accounts need their own verification.'}</p>${review?'<label for="lifecycleReason">Decision note <span class="kv">(required when this is not a departure)</span></label><textarea id="lifecycleReason" rows="2" maxlength="1000" placeholder="Add context for the IT team"></textarea><div class="btnrow"><button type="button" class="primary" data-lifecycle="yes">Confirm departure</button><button type="button" data-lifecycle="no">Not a departure</button></div><p class="context-caption">Confirmation prepares the checklist. It does not wipe devices or delete data.</p>':c.note?`<p>${esc(c.note)}</p>`:''}<div class="status" role="status" data-lifecycle-status></div>`;
    const input=lifecycleRoot.querySelector('textarea');if(input)input.value=draft;
    lifecycleRoot.querySelectorAll('[data-lifecycle]').forEach(button=>button.onclick=async()=>{
      const departure=button.dataset.lifecycle==='yes',note=input.value.trim(),status=lifecycleRoot.querySelector('[data-lifecycle-status]');
      if(!departure&&!note){status.textContent='Add a reason before closing this review.';input.focus();return;}
      lifecycleRoot.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Saving decision…';
      try {const result=await api().decideLifecycle(session.load(),id,c.lastEvent,departure,note);if(!valid())return;if(!result.ok)throw new Error(result.detail);checked=0;await reload(id);}
      catch(e){if(valid()){status.textContent=e.message||'Could not save. Please retry.';lifecycleRoot.querySelectorAll('button').forEach(b=>b.disabled=false);}}
    });
  }
  return {load,reset};
}
