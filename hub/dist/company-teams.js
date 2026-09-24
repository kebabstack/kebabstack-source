/* Company teams define membership once; explicit app bindings define its reach. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const alive = new WeakMap();
  function warning(v) {
    if (!v.apps.length || v.config.mode === 'it') return '';
    if (v.config.mode === 'unconfigured') return 'No Finance team is set. Assign who reviews hardware invoices and records payments, or keep this work with IT.';
    if (v.apps.some(a => !a.enabled || !Number(a.recipients))) return 'Finance needs attention. An Assets connection has no active Finance recipients. Its admins still manage payments.';
    return '';
  }
  async function banner(root, api) {
    if (!root) return;
    try { const v=await api().getFinanceTeam(), text=warning(v);root.innerHTML=text?`<aside class="card"><strong>Who handles hardware payments?</strong><p>${esc(text)}</p><a href="#/settings/teams">${v.canManage?'Set up Finance or manage through IT':'View company teams'} →</a></aside>`:''; }
    catch { root.innerHTML='<p class="kv">Finance setup could not be checked. <a href="#/settings/teams">Review company teams</a>.</p>'; }
  }
  async function mount(root, api) {
    const generation={};alive.set(root,generation);
    root.innerHTML='<p role="status">Loading company teams…</p>';
    let v;
    const current=()=>alive.get(root)===generation;
    try { v=await api().getFinanceTeam(); if(!current())return; }
    catch { if(current())root.innerHTML='<p role="alert">Company teams could not be loaded. Reopen this tab to retry.</p>';return; }
    const draft={...v.config,people:[...v.config.people],groups:[...v.config.groups],apps:v.config.apps.map(a=>({...a}))};
    const $=s=>root.querySelector(s);
    let busy=false;
    const message=text=>$('[data-team-message]').textContent=text;
    function render() {
      root.innerHTML=`<section class="card"><div class="page-heading"><div><h3>Finance</h3><p class="kv">One team for invoice review and hardware valuation. App access stays explicit.</p></div><span class="pill">${draft.mode==='it'?'Managed by IT':draft.mode==='team'?'Finance team':'Not configured'}</span></div>${warning(v)?`<p role="status">${esc(warning(v))}</p>`:''}
      <form data-team-form><fieldset ${v.canManage?'':'disabled'}><legend>How do you manage hardware payments?</legend><label class="ck"><input type="radio" name="mode" value="team" ${draft.mode!=='it'?'checked':''}> Finance team</label><label class="ck"><input type="radio" name="mode" value="it" ${draft.mode==='it'?'checked':''}> We manage this through IT</label></fieldset>
      <div data-team-members ${draft.mode==='it'?'hidden':''}><h4>People &amp; groups</h4><p class="kv">Group membership follows the Hub directory. Inactive people never receive access.</p><div data-team-list>${draft.people.map(id=>{const p=v.people.find(p=>p.id===id);return `<p>${esc(p?.name||'Former person')} <span class="kv">${esc(p?.email||'Remove this assignment')}${p&&!p.active?' · inactive':''}</span> ${v.canManage?`<button type="button" class="sm" data-remove-person="${esc(id)}">Remove</button>`:''}</p>`;}).join('')}${draft.groups.map(id=>`<p>Group: ${esc(v.groups.find(g=>g.id===id)?.name||'Deleted group')} ${v.canManage?`<button type="button" class="sm" data-remove-group="${id}">Remove</button>`:''}</p>`).join('')||'<p class="kv">Choose a person or a group below.</p>'}</div>
      ${v.canManage?`<div class="row"><label>Person or group<select data-team-subject><option value="">Choose…</option><optgroup label="People">${v.people.filter(p=>p.active&&!draft.people.includes(p.id)).map(p=>`<option value="p:${esc(p.id)}">${esc(p.name)} · ${esc(p.email)}</option>`).join('')}</optgroup><optgroup label="Groups">${v.groups.filter(g=>!draft.groups.includes(g.id)).map(g=>`<option value="g:${g.id}">${esc(g.name)}</option>`).join('')}</optgroup></select></label><button type="button" data-team-add>Add</button></div>`:''}
      <h4>Connected tools</h4><p class="kv">Finance reviews invoices, records payments and sets hardware values. Technical management stays with IT.</p>${v.apps.map(a=>`<label class="ck"><input type="checkbox" data-team-app="${a.cid}" ${draft.apps.some(b=>b.cid===a.cid&&b.canisterId.toText()===a.canisterId.toText())?'checked':''} ${v.canManage?'':'disabled'}><span>${esc(a.name)} <small class="kv">${a.enabled?`${Number(a.recipients)} active recipients`:'Not enabled'}</small></span></label>`).join('')||'<p>Connect Assets and configure its central permissions first.</p>'}<details><summary>What Finance can do</summary><p>Read every hardware financial record and sale, download invoices and exports, record payments and corrections, and set valuation. Technical settings, device secrets, preparation and custody remain with IT. Nobody can confirm their own purchase.</p><p>An individual “No access” still blocks entry. Existing Admin access remains Admin. Only Hub owners can change these assignments.</p></details></div>
      <p data-team-it ${draft.mode==='it'?'':'hidden'} class="kv">Assets admins handle invoices and valuation. The setup reminder is dismissed company-wide. You can enable Finance here later.</p>
      ${v.canManage?'<div class="btnrow"><button class="primary" type="submit">Review changes</button><button type="button" data-team-reload>Discard &amp; reload</button></div>':'<p>Ask a Hub owner to change the team.</p>'}<p data-team-message role="status" aria-live="polite"></p><div data-team-review></div></form></section>`;
      root.querySelectorAll('[name=mode]').forEach(el=>el.onchange=()=>{draft.mode=el.value;render();});
      root.querySelectorAll('[data-remove-person]').forEach(el=>el.onclick=()=>{draft.people=draft.people.filter(id=>id!==el.dataset.removePerson);render();});
      root.querySelectorAll('[data-remove-group]').forEach(el=>el.onclick=()=>{draft.groups=draft.groups.filter(id=>id!==BigInt(el.dataset.removeGroup));render();});
      root.querySelectorAll('[data-team-app]').forEach(el=>el.onchange=()=>{const id=BigInt(el.dataset.teamApp),a=v.apps.find(a=>a.cid===id);draft.apps=draft.apps.filter(b=>b.cid!==id);if(el.checked)draft.apps.push({cid:id,canisterId:a.canisterId});$('[data-team-review]').replaceChildren();});
      if($('[data-team-add]'))$('[data-team-add]').onclick=()=>{const value=$('[data-team-subject]').value;if(!value)return;if(value.startsWith('p:'))draft.people.push(value.slice(2));else draft.groups.push(BigInt(value.slice(2)));render();};
      if($('[data-team-reload]'))$('[data-team-reload]').onclick=()=>mount(root,api);
      $('[data-team-form]').onsubmit=e=>{e.preventDefault();if(!v.canManage||busy)return;draft.mode=$('[name=mode]:checked').value;
        $('[data-team-review]').innerHTML=`<div class="card"><h4>${draft.mode==='it'?'Keep payments with IT?':'Apply this Finance team?'}</h4><p>${draft.mode==='it'?'Finance team access is disabled for all its connected tools. Existing app admins keep access.':`${draft.people.length} direct people and ${draft.groups.length} groups receive Finance in ${draft.apps.length} selected Assets connection(s), subject to their active account and explicit access restrictions.`}</p><button class="primary" type="button" data-team-save>Save company team</button></div>`;
        $('[data-team-save]').onclick=async()=>{busy=true;root.querySelectorAll('input,button,select').forEach(el=>el.disabled=true);try{const result=await api().setFinanceTeam(draft);if(!current())return;if(!result.ok)throw Error(result.detail);await mount(root,api);root.querySelector('[data-team-message]').textContent=result.detail;}catch(error){if(current()){message(error.message||'Save failed. Your draft is retained.');root.querySelectorAll('input,button,select').forEach(el=>el.disabled=false);}}finally{busy=false;}};
      };
    }
    render();
  }
  window.KebabCompanyTeams={mount,banner};
})();
