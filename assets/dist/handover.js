const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function caseLink(context) {
  try { const url = new URL(context.url); if (url.protocol !== 'https:' || url.username || url.password) return ''; url.hash = '#/t/' + context.ticket; return url.href; } catch { return ''; }
}
export function createHandoverPanel({root, api, token, viewer, reload, startSale}) {
  let generation = 0;
  function reset() { generation++; root.replaceChildren(); root.classList.add('hidden'); }
  async function load(asset) {
    reset();
    if (viewer()?.role !== 'admin') return;
    const stamp = generation, who = viewer().id;
    const valid = () => generation === stamp && viewer()?.id === who && viewer()?.role === 'admin';
    try {
      const [v] = await api().handoverOf(token(), asset.id);
      if (!valid() || !v) return;
      const p = v.plan, c = v.context, active = c.state === 'active' && !v.done, url = caseLink(c);
      const paused = c.state === 'paused' || c.state === 'review';
      root.classList.remove('hidden');
      root.innerHTML = `<div class="hardware-heading"><div><span class="eyebrow">OFFBOARDING</span><h3>${esc(v.personName)}</h3></div><span class="pill ${v.done ? 'on' : 'warn'}">${esc(paused ? 'Awaiting review' : c.state === 'cancelled' ? 'Cancelled' : v.progress)}</span></div>
        <p class="kv">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(c.key)} in Desk ↗</a>` : esc(c.key)}${p.dueOn ? ' · Due '+esc(p.dueOn) : ''}${v.ownerName ? ' · '+esc(v.ownerName) : ''}</p>
        ${paused ? '<p>Review the account change or approval in Desk before continuing.</p>' : ''}
        ${v.done ? `<p class="kv">${esc(p.note)}</p>` : `<details data-plan><summary>Plan ${p.choice === 'sale' ? 'sale' : p.choice === 'transfer' ? 'handover' : 'return'}</summary><form data-plan-form><div class="hardware-grid">
          <label>Next step<select name="choice"><option value="return">Return to IT</option><option value="transfer">Hand over to a colleague</option><option value="sale">Sell the device</option></select></label>
          <label>Responsible<select name="owner"><option value="${esc(p.owner || who)}">${esc(v.ownerName || 'Me')}</option></select></label>
          <label>Due date<input type="date" name="dueOn" value="${esc(p.dueOn)}"></label>
          <label data-recipient>Recipient’s work email<input name="recipient" type="text" value="${esc(v.recipientEmail || p.recipient)}" autocomplete="off" list="hardware-recipients"><datalist id="hardware-recipients"></datalist></label>
        </div><label>Note<textarea name="note" rows="2" maxlength="1000">${esc(p.note)}</textarea></label><button class="sm" type="submit" ${active ? '' : 'disabled'}>Save plan</button></form></details>
        ${active && p.choice !== 'sale' ? `<form data-confirm-form><p>${p.stage === 'received' ? 'Check data removal, device management and condition before returning this device to stock.' : p.choice === 'transfer' ? 'Confirm only after the new recipient has received the device.' : 'Confirm only when IT has physically received the device.'}</p><div class="hardware-grid"><label>Confirm serial / tag: <strong>${esc(v.identifier)}</strong><input name="confirmation" autocomplete="off" required placeholder="Type the identifier above"></label><label>${p.stage === 'received' ? 'Preparation checks performed' : 'Handover note'}<input name="note" maxlength="1000" ${p.stage === 'received' ? 'required' : ''}></label></div><button class="primary sm" type="submit">${p.stage === 'received' ? 'Ready for reuse' : p.choice === 'transfer' ? 'Confirm physical handover' : 'Received by IT'}</button></form>` : ''}
        ${active && p.choice === 'sale' ? `<p class="kv">The assignment stays until payment, preparation and handover are complete. A former colleague can use a private dealroom without company access.</p><div class="btnrow">${Number(p.saleId) ? `<a class="button-link" href="#/sale/${p.saleId}">Open sale ↗</a>` : '<button type="button" class="primary sm" data-start-sale>Start sale</button>'}</div>` : ''}
        ${active ? '<details class="hardware-exception"><summary>Cannot complete this handover?</summary><form data-exception><p class="kv">Record a loss or another approved exception with its follow-up owner. This does not mark the device as returned.</p><label>Reason and follow-up<textarea name="note" rows="2" required minlength="10" maxlength="1000"></textarea></label><label>Confirm serial / tag<input name="confirmation" required autocomplete="off"></label><button type="submit" class="sm">Record exception</button></form></details>' : ''}`}
        <p data-hardware-status class="status" role="status"></p>`;
      const status = root.querySelector('[data-hardware-status]');
      const input = changes => ({choice:p.choice, owner:p.owner || who, dueOn:p.dueOn, recipient:p.recipient, note:p.note, ...changes});
      async function send(form, action, data, confirmation='') {
        form.querySelectorAll('button').forEach(b=>b.disabled=true); status.textContent='Saving…';
        try { const r=await api().updateHandover(token(),asset.id,p.revision,action,data,confirmation); if (!valid()) return; status.textContent=r.detail; if(r.ok) await reload(); }
        catch { if(valid()) status.textContent='Could not confirm the result. Refresh the device before retrying.'; }
        finally { if(valid()) form.querySelectorAll('button').forEach(b=>b.disabled=false); }
      }
      const plan=root.querySelector('[data-plan-form]');
      if(plan){
        plan.elements.choice.value=p.choice;
        const toggle=()=>root.querySelector('[data-recipient]').classList.toggle('hidden',plan.elements.choice.value!=='transfer'); toggle(); plan.elements.choice.onchange=toggle;
        plan.onsubmit=e=>{e.preventDefault();if(active)send(plan,'plan',input(Object.fromEntries(new FormData(plan))));};
        api().handoverOwners(token()).then(owners=>{if(!valid())return;const selected=p.owner||who;plan.elements.owner.innerHTML=owners.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');plan.elements.owner.value=selected;}).catch(()=>{});
        let search=0;
        plan.elements.recipient.oninput=async()=>{const seq=++search;try{const rows=await api().directory(token(),plan.elements.recipient.value);if(valid()&&seq===search)root.querySelector('datalist').innerHTML=rows.map(x=>`<option value="${esc(x.email)}">${esc(x.displayName)}</option>`).join('');}catch{}};
      }
      const confirm=root.querySelector('[data-confirm-form]');
      if(confirm)confirm.onsubmit=e=>{e.preventDefault();send(confirm,p.stage==='received'?'ready':p.choice==='transfer'?'transfer':'receive',input({note:confirm.elements.note.value}),confirm.elements.confirmation.value);};
      const exception=root.querySelector('[data-exception]');
      if(exception)exception.onsubmit=e=>{e.preventDefault();send(exception,'exception',input({note:exception.elements.note.value}),exception.elements.confirmation.value);};
      root.querySelector('[data-start-sale]')?.addEventListener('click',()=>startSale(v));
    } catch { if(valid()){root.classList.remove('hidden');root.innerHTML='<h3>Hardware follow-up</h3><p class="kv">Could not check the offboarding. Refresh this device to retry.</p>';}}
  }
  return {load,reset};
}

export function renderFormerBuyer({root, info, sale, api, token, reload}) {
  root.replaceChildren(); root.classList.toggle('hidden', !info?.eligible && !info?.privateEmail);
  if(!info?.eligible && !info?.privateEmail)return;
  root.innerHTML=`<h3>Continue after departure</h3><p class="kv">Use a reachable private address and share a dealroom link. ${sale.invoiceNo ? 'The issued invoice, original buyer and acceptance stay unchanged.' : 'The buyer will accept the offer again in the dealroom.'}</p><form><label>Private contact email<input name="email" type="email" required maxlength="254" value="${esc(info.privateEmail)}" autocomplete="off"></label><button class="sm" type="submit">Save private contact</button></form><p class="status" role="status"></p>`;
  const form=root.querySelector('form'),status=root.querySelector('[role=status]');
  form.onsubmit=async e=>{e.preventDefault();form.querySelector('button').disabled=true;try{const r=await api().continueFormerBuyerSale(token(),sale.id,form.elements.email.value);status.textContent=r.detail;if(r.ok)await reload();}catch{status.textContent='Could not confirm the result. Refresh before retrying.';}finally{form.querySelector('button').disabled=false;}};
}
