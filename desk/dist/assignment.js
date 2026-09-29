const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createAssignment({root, api, session, getMe}) {
  let epoch = 0;
  const valid = n => n === epoch && getMe()?.role === 'admin';
  function clear() { epoch++; root.replaceChildren(); }
  async function show() {
    clear(); const n = epoch;
    if (!valid(n)) return;
    root.innerHTML = '<p role="status">Loading assignment rules…</p>';
    try {
      const [data] = await api().getAutoAssignment(session.load());
      if (!valid(n)) return;
      if (!data) throw Error('Your administrator access could not be confirmed.');
      let revision = data.config.revision, busy = false;
      const options = (chosen, inherit = false) => `${inherit?'<option value="@default">Use Desk default</option>':''}<option value="">Keep unassigned</option>${data.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}${chosen && chosen !== '@default' && !data.people.some(p => p.id === chosen)?`<option value="${esc(chosen)}" disabled>Previous owner unavailable — choose a replacement</option>`:''}`;
      root.innerHTML = `<div class="assignment-settings"><h3>Automatic assignment</h3><p class="kv">Give new internal requests an owner. Existing and manually changed assignments stay as they are.</p>
        <div data-assignment-warnings role="status">${data.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>
        <form><div class="assignment-default"><label for="assignment-default">Default owner</label><select id="assignment-default" name="defaultOwner">${options(data.config.defaultAssignee)}</select></div>
        <details class="assignment-exceptions" ${data.config.overrides.length?'open':''}><summary>Exceptions by request type</summary><p class="kv">Override the default for a specific type, or keep it unassigned.</p><div class="assignment-rules">${data.requestTypes.map(t=>{
          const selected=data.config.overrides.find(r=>r.typeId===t.id)?.assignee ?? '@default';
          return `<div><label for="assignment-type-${t.id}">${esc(t.name)}${t.enabled?'':' · not in employee catalog'}</label><select id="assignment-type-${t.id}" data-type="${t.id}" data-chosen="${esc(selected)}">${options(selected,true)}</select></div>`;
        }).join('')}</div></details>
        <p class="kv">An unavailable type owner falls back to the active default owner. If neither is available, the request stays visible in the unassigned queue. Customer projects keep their own routing.</p>
        <div class="btnrow"><button class="primary" type="submit">Save assignment rules</button><span data-assignment-status role="status" aria-live="polite"></span></div></form></div>`;
      const form=root.querySelector('form'), status=root.querySelector('[data-assignment-status]');
      form.elements.defaultOwner.value=data.config.defaultAssignee;
      form.querySelectorAll('[data-type]').forEach(el=>el.value=el.dataset.chosen);
      form.onsubmit=async e=>{
        e.preventDefault(); if(busy || !form.reportValidity())return;
        if ([...form.querySelectorAll('select')].some(el=>el.selectedOptions[0]?.disabled)) { status.textContent='Replace unavailable owners before saving.'; return; }
        const input={revision, defaultAssignee:form.elements.defaultOwner.value, overrides:[...form.querySelectorAll('[data-type]')].filter(el=>el.value!=='@default').map(el=>({typeId:BigInt(el.dataset.type),assignee:el.value}))};
        busy=true; const button=form.querySelector('button');button.disabled=true;form.querySelectorAll('select').forEach(el=>el.disabled=true);status.textContent='Saving…';
        try {
          const result=await api().saveAutoAssignment(session.load(),input); if(!valid(n))return;
          status.textContent=result.detail; if(result.ok){revision++;root.querySelector('[data-assignment-warnings]').replaceChildren();}
        }catch{if(valid(n))status.textContent='The save could not be confirmed. Your choices are still here. Reopen these settings to check the saved rules.';}
        finally{if(valid(n)){busy=false;button.disabled=false;form.querySelectorAll('select').forEach(el=>el.disabled=false);}}
      };
    }catch(e){if(valid(n)){root.replaceChildren();const p=root.ownerDocument.createElement('p');p.setAttribute('role','alert');p.textContent=e.message||'Assignment rules could not be loaded. Reopen these settings to retry.';root.append(p);}}
  }
  return {show,clear};
}
