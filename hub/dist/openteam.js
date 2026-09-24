/* OpenTeam is a directory source. Hub remains the authority for login and roles. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = value => value ? new Date(Number(value / 1000000n)).toLocaleString() : 'Not synced yet';
  async function mount(root, api, principalFromText, canManage) {
    if (!root) return;
    const generation = (root._openTeamGeneration || 0) + 1;
    root._openTeamGeneration = generation;
    const current = () => root._openTeamGeneration === generation;
    let sources, details;
    try { [sources, details] = await Promise.all([api().listConnections(), api().listOpenTeamSources()]); }
    catch (_) { if (current()) root.innerHTML = '<p role="alert">OpenTeam sources could not be loaded. Reopen Directory sync to retry.</p>'; return; }
    if (!current()) return;
    sources = sources.filter(c => c.kind === 'openteam');
    root.innerHTML = `<p class="kv">Import people from OpenTeam. Hub keeps app roles, Finance and sign-in. <a href="./openteam-guide.html" target="_blank" rel="noopener">Setup guide ↗</a></p><div data-ot-sources></div>${canManage ? `<details class="card disclosure" ${sources.length ? '' : 'open'}><summary>Add an OpenTeam source</summary><form data-ot-add><div class="row"><label>Source name<input name="sourceName" maxlength="60" required placeholder="Company OpenTeam"></label><label>Backend canister ID<input name="provider" required spellcheck="false" autocomplete="off" placeholder="Copy from your OpenTeam deployment"></label></div><p class="kv">Use the backend ID, not the website address. Hub reads the directory; it does not change OpenTeam.</p>${scopeFields()}<div class="btnrow"><button class="primary" type="submit">Save &amp; preview</button></div><p data-ot-message role="status" aria-live="polite"></p></form></details>` : '<p class="kv">A Hub owner can add, review or pause a directory source.</p>'}`;
    function scopeFields(cfg = {includeExternal:false,excludeIds:[]}) {
      return `<details><summary>Import scope</summary><label class="ck"><input type="checkbox" name="includeExternal" ${cfg.includeExternal ? 'checked' : ''}> Include contractors and partners</label><p class="kv">Employees are included by default. AI agents are always excluded.</p><label>Excluded member IDs<textarea name="excludeIds" rows="2" placeholder="One stable member ID per line">${esc(cfg.excludeIds.join('\n'))}</textarea></label><p class="kv">Use this for people already managed by another source. Hub never merges identities by email.</p></details>`;
    }
    function scopeFrom(form) { return {includeExternal:form.elements.includeExternal.checked,excludeIds:[...new Set(form.elements.excludeIds.value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean))]}; }
    async function action(container, operation) {
      const buttons = [...container.querySelectorAll('button,input,textarea')];
      const disabled = buttons.map(el=>el.disabled);
      buttons.forEach(el=>el.disabled=true);
      const message = container.querySelector('[data-ot-message]');
      if (message) message.textContent = 'Reading the source…';
      try { await operation(); }
      catch (error) { if (current() && message) message.textContent = error.message || 'Could not complete the action. Your entries are retained.'; }
      finally { if (current()) buttons.forEach((el,i)=>el.disabled=disabled[i]); }
    }
    function showReview(card, id, r) {
      if (!current()) return;
      card.querySelector('[data-ot-message]').textContent = r.detail;
      card.querySelector('[data-ot-preview]')?.classList.remove('primary');
      const area = card.querySelector('[data-ot-review]');
      area.innerHTML = `<section aria-label="Import preview"><h4>Preview · ${Number(r.fetched)} source records</h4><p>${Number(r.created)} new · ${Number(r.updated)} updates · ${Number(r.deactivated)} source deactivations · ${Number(r.skipped)} excluded</p>${r.conflicts.length ? `<div role="alert"><ul>${r.conflicts.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><p>Edit Import scope below to exclude members whose identities are already managed in Hub.</p></div>` : ''}${r.rows.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Import changes"><table><thead><tr><th>Person</th><th>Member ID</th><th>Change</th></tr></thead><tbody>${r.rows.map(row=>`<tr><td>${esc(row.name || row.email || 'Erased member')}<small class="kv"> ${esc(row.email)}</small></td><td>${esc(row.memberId)}</td><td>${esc(row.action)}</td></tr>`).join('')}</tbody></table></div><p class="kv">Up to 50 changed records shown. Counts include all records.</p>` : ''}${r.ok ? '<p>Applies this snapshot and enables a refresh every five minutes. Deactivation removes this source’s active status; other active sources and audited Hub overrides may retain access.</p><button type="button" class="primary" data-ot-apply>Apply &amp; enable sync</button>' : ''}</section>`;
      const apply = area.querySelector('[data-ot-apply]');
      if (apply) apply.onclick = () => action(card, async()=>{
        const result = await api().applyOpenTeamSource(id,r.token);
        if (!result.ok) { area.replaceChildren(); throw Error(result.detail); }
        await mount(root,api,principalFromText,canManage);
      });
    }
    for (const c of sources) {
      const d = details.find(d=>d.id===c.id), cfg = d?.config || {includeExternal:false,excludeIds:[]};
      const success = d?.lastSuccess?.[0], attempt = c.lastSync[0];
      const stale = c.enabled && success && Date.now()-Number(success.at/1000000n)>15*60*1000;
      const card = document.createElement('section'); card.className='card';
      card.innerHTML = `<div class="page-heading"><div><h3>${esc(c.name)}</h3><p class="kv">${esc(c.baseUrl)}</p></div><span class="pill">${!c.enabled ? (success ? 'Paused' : 'Awaiting review') : attempt && !attempt.ok ? 'Needs attention' : stale ? 'Sync overdue' : 'Sync enabled'}</span></div><p>${Number(c.userCount)} people · ${Number(c.activeCount)} active in Hub</p><p class="kv">Last successful sync: ${esc(time(success?.at))}${success ? ' · team-directory '+esc(success.version) : ''}</p>${attempt && !attempt.ok ? `<p role="alert">${esc(attempt.detail)} Last successful directory retained.</p>` : ''}${stale ? '<p role="alert">Sync is overdue. Changes in OpenTeam may not yet be reflected here.</p>' : ''}${!c.enabled && success ? '<p>Automatic updates are paused. Existing accounts and access remain until changed in Hub.</p>' : ''}${canManage ? '<div class="btnrow"><button type="button" class="'+(!c.enabled?'primary':'')+'" data-ot-preview>Preview changes</button>'+ (c.enabled?'<button type="button" data-ot-pause>Pause sync</button>':'')+'</div>' : ''}<p data-ot-message role="status" aria-live="polite"></p><div data-ot-review></div>${canManage?`<details class="disclosure"><summary>Edit import scope</summary><form data-ot-scope>${scopeFields(cfg).replace('<details><summary>Import scope</summary>','').replace('</details>','')}<p class="kv">Saving pauses sync. Review the next import to apply this scope; current people remain until then.</p><button type="submit">Save scope &amp; preview</button></form></details>`:''}`;
      root.querySelector('[data-ot-sources]').append(card);
      const preview = card.querySelector('[data-ot-preview]');
      if (preview) preview.onclick=()=>action(card,async()=>showReview(card,c.id,await api().previewOpenTeamSource(c.id)));
      const pause = card.querySelector('[data-ot-pause]');
      if (pause) pause.onclick=()=>action(card,async()=>{if (!await api().pauseOpenTeamSource(c.id)) throw Error('Source changed. Reopen it to retry.');await mount(root,api,principalFromText,canManage);});
      if (canManage && !c.enabled && c.userCount===0n) {
        const remove=document.createElement('button');remove.type='button';remove.textContent='Remove unused source';
        remove.onclick=()=>action(card,async()=>{const result=await api().discardOpenTeamSource(c.id);if(!result.ok)throw Error(result.detail);await mount(root,api,principalFromText,canManage);});
        card.querySelector('[data-ot-scope]').append(remove);
      }
      const form=card.querySelector('[data-ot-scope]');
      if(form)form.onsubmit=e=>{e.preventDefault();action(card,async()=>{const result=await api().setOpenTeamScope(c.id,cfg,scopeFrom(form));if(!result.ok)throw Error(result.detail);await mount(root,api,principalFromText,canManage);const cards=[...root.querySelectorAll('[data-ot-preview]')];const index=sources.findIndex(s=>s.id===c.id);cards[index]?.click();});};
    }
    const add=root.querySelector('[data-ot-add]');
    if(add)add.onsubmit=e=>{e.preventDefault();action(add,async()=>{
      let provider;try{provider=principalFromText(add.elements.provider.value.trim());}catch(_){throw Error('Enter the valid backend canister ID from your OpenTeam deployment.');}
      const result=await api().addOpenTeamSource({name:add.elements.sourceName.value.trim(),provider,...scopeFrom(add)});
      if(!result.ok)throw Error(result.detail);
      await mount(root,api,principalFromText,canManage);
      [...root.querySelectorAll('[data-ot-preview]')].at(-1)?.click();
    });};
  }
  window.KebabOpenTeam={mount};
})();
