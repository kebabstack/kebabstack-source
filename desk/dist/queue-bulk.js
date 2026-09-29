const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = row => String(row.id);
export function createQueueBulk({root, table, selectAll, api, session, getMe, loadAgents, refresh, freeze}) {
  let observer=null, epoch=0, rows=[], selected=new Map(), page=null, filter=null, busy=false, resultText='';
  const doc=root.ownerDocument;
  const valid=n=>n===epoch && getMe() && getMe().role!=='requester';
  function checks() {
    const count=rows.filter(r=>selected.has(id(r))).length;
    selectAll.checked=rows.length>0&&count===rows.length; selectAll.indeterminate=count>0&&count<rows.length;
    selectAll.disabled=busy||!rows.length;
    table.querySelectorAll('[data-select-ticket]').forEach(el=>{el.checked=selected.has(el.dataset.selectTicket);el.disabled=busy;el.closest('tr').classList.toggle('is-selected',el.checked);});
  }
  function clear() { observer?.disconnect();epoch++; busy=false; rows=[];selected.clear();page=null;filter=null;resultText='';root.replaceChildren();selectAll.checked=false;selectAll.indeterminate=false;freeze(false);checks(); }
  function setRows(value, data, f) { rows=value;page=data;filter={...f};checks();render(); }
  function selectedRow(r,on) { resultText='';if(on)selected.set(id(r),r);else selected.delete(id(r));checks();render(); }
  table.addEventListener('change', e=>{const el=e.target.closest('[data-select-ticket]');if(!el||busy)return;const row=rows.find(r=>id(r)===el.dataset.selectTicket);if(row)selectedRow(row,el.checked);});
  selectAll.addEventListener('change',()=>{if(busy)return;resultText='';for(const r of rows){if(selectAll.checked)selected.set(id(r),r);else selected.delete(id(r));}checks();render();});
  function render() {
    if(busy)return;
    observer?.disconnect();
    const previousAction=root.querySelector('#bulk-action')?.value, previousValue=root.querySelector('[data-input] select,[data-input] input')?.value;
    root.replaceChildren();
    if(resultText){const p=doc.createElement('p');p.className='bulk-receipt';p.setAttribute('role','status');p.textContent=resultText;root.append(p);}
    if(!selected.size)return;
    const panel=doc.createElement('div');panel.className='queue-bulk-panel';
    panel.innerHTML=`<div class="bulk-selection"><strong>${selected.size} selected</strong>${page && selected.size<Number(page.total)?`<button type="button" class="sm" data-all>Select all ${page.total} matching requests</button>`:''}<button type="button" class="sm" data-clear>Clear selection</button></div>
      <form class="bulk-form"><div><label for="bulk-action">Action</label><select id="bulk-action"><option value="me">Assign to me</option><option value="assign">Assign to someone…</option><option value="unassign">Remove assignment</option><option value="status">Change status…</option><option value="due">Set target date…</option><option value="clearDue">Remove target date</option></select></div><div data-input></div><button class="primary" type="submit">Apply to ${selected.size} ${selected.size===1?'request':'requests'}</button><p class="bulk-explanation kv" data-explanation></p><p class="bulk-progress" role="status" aria-live="polite"></p></form>`;
    root.append(panel);
    if(doc.defaultView.IntersectionObserver){
      const jump=doc.createElement('button');jump.type='button';jump.className='bulk-jump primary';jump.textContent=`Edit ${selected.size} selected ${selected.size===1?'request':'requests'} ↑`;jump.hidden=true;root.append(jump);
      jump.onclick=()=>{panel.scrollIntoView({block:'start'});panel.querySelector('#bulk-action')?.focus({preventScroll:true});};
      observer=new doc.defaultView.IntersectionObserver(entries=>{jump.hidden=busy||entries[0].isIntersecting;},{rootMargin:'-70px 0px 0px 0px'});observer.observe(panel);
    }
    panel.querySelector('[data-clear]').onclick=()=>{selected.clear();checks();render();selectAll.focus();};
    panel.querySelector('[data-all]')?.addEventListener('click',selectMatching);
    const form=panel.querySelector('form'), action=panel.querySelector('#bulk-action'), input=panel.querySelector('[data-input]'), hint=panel.querySelector('[data-explanation]');
    let actionEpoch=0;
    async function choose(restore=false) {
      const n=epoch, a=++actionEpoch;input.replaceChildren();const apply=form.querySelector('[type=submit]');apply.disabled=false;
      hint.textContent='Only selected internal requests change. Each change appears in the request’s activity.';
      if(action.value==='assign'){
        apply.disabled=true;input.textContent='Loading available agents…';
        try {const people=await loadAgents();if(!valid(n)||a!==actionEpoch)return;
          input.innerHTML=`<label for="bulk-owner">Assign to</label><select id="bulk-owner" required><option value="">Choose an agent</option>${people.map(p=>`<option value="${esc(p.id)}">${esc(p.displayName||p.email)}</option>`).join('')}</select>`;apply.disabled=!people.length;
          if(!people.length)hint.textContent='No available Desk agents. Check Hub permissions.';
        }catch{if(valid(n)&&a===actionEpoch){input.textContent='Agents could not be loaded. Choose the action again to retry.';}}
      }
      if(action.value==='status'){
        input.innerHTML='<label for="bulk-state">Status</label><select id="bulk-state"><option value="open">In progress</option><option value="new">Received</option><option value="waiting:requester">Waiting for requester</option><option value="waiting:third-party">Waiting for third party</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>';
        const explain=()=>{hint.textContent=input.querySelector('select').value==='closed'?'Closing cancels pending approvals. Offboarding checks still apply; review skipped requests below.':'Approvals, checklists and offboarding checks still apply. Requests that cannot change are listed below.';};input.querySelector('select').onchange=explain;explain();
      }
      if(action.value==='due'){input.innerHTML='<label for="bulk-date">Target date</label><input id="bulk-date" type="date" required min="1970-01-01" max="9999-12-31">';hint.textContent='Uses 00:00 UTC on the selected date, the same target as individual requests.';}
      if(restore&&previousValue!==undefined&&action.value===previousAction){const field=input.querySelector('select,input');if(field){field.value=previousValue;field.dispatchEvent(new doc.defaultView.Event('change'));}}
    }
    if(previousAction)action.value=previousAction;action.onchange=()=>choose();void choose(true);
    form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;
      let change;
      if(action.value==='me')change={assign:getMe().id};
      if(action.value==='assign')change={assign:input.querySelector('select').value};
      if(action.value==='unassign')change={assign:''};
      if(action.value==='status'){const [status,waitingOn='']=input.querySelector('select').value.split(':');change={status:{status,waitingOn}};}
      if(action.value==='clearDue')change={due:[]};
      if(action.value==='due'){const date=Date.parse(input.querySelector('input').value+'T00:00:00Z');if(!Number.isFinite(date))return;change={due:[BigInt(date)*1000000n]};}
      if(change)await applySelection(change,form);
    };
  }
  async function selectMatching() {
    if(busy)return;const n=epoch, actor=getMe().id;busy=true;freeze(true);checks();root.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
    const progress=root.querySelector('.bulk-progress');progress.textContent='Selecting matching requests…';
    const chosen=new Map(rows.map(r=>[id(r),r]));let cursor=page.next;
    try{
      while(cursor.length){const [next]=await api().internalQueuePage(session.load(),filter,cursor);if(!valid(n)||getMe().id!==actor)return;if(!next)throw Error('Access could not be confirmed.');
        for(const r of next.rows)chosen.set(id(r),r);
        if(next.next.length&&String(next.next[0])===String(cursor[0]))throw Error('The queue could not be read completely.');cursor=next.next;
        progress.textContent=`Selecting matching requests… ${chosen.size} found`;
      }
      selected=chosen;resultText='';
    }catch{if(valid(n))resultText='Could not select all matches. Your previous selection is unchanged; try again.';}
    finally{if(valid(n)){busy=false;freeze(false);checks();render();root.querySelector('#bulk-action')?.focus();}}
  }
  async function applySelection(action, form) {
    const n=epoch, actor=getMe().id, targets=[...selected.values()];busy=true;freeze(true);checks();root.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
    const progress=form.querySelector('.bulk-progress'), failures=[];let updated=0,unchanged=0,handled=0;
    try {
      for(let start=0;start<targets.length;start+=50){
        if(!valid(n)||getMe().id!==actor)return;
        progress.textContent=`Updating ${handled} of ${targets.length} requests…`;
        const batch=targets.slice(start,start+50), reply=await api().bulkInternalTickets(session.load(),batch.map(r=>({id:r.id,updatedAt:r.updatedAt})),action);
        if(!valid(n)||getMe().id!==actor)return;
        if(!reply.ok){
          const reason=reply.invalid||('denied'in reply?'Desk access is unavailable. Sign in again or check Hub permissions.':'');
          if(!reason)throw Error('Unexpected result');
          for(const r of targets.slice(handled))failures.push({row:r,detail:reason});handled=targets.length;break;
        }
        const byId=new Map(reply.ok.map(r=>[String(r.id),r.result]));
        for(const r of batch){const result=byId.get(id(r));if(result&&'updated'in result)updated++;else if(result&&'unchanged'in result)unchanged++;else failures.push({row:r,detail:result?.skipped||'Result not confirmed. Open the request before retrying.'});handled++;}
      }
    }catch{if(!valid(n))return;for(const r of targets.slice(handled))failures.push({row:r,detail:'Result not confirmed. Open the request before retrying.'});}
    finally{if(valid(n)){busy=false;freeze(false);selected.clear();resultText=`${updated} updated · ${unchanged} already matched${failures.length?` · ${failures.length} need review`:''}.`;checks();render();
      await refresh();if(!valid(n))return;
      if(failures.length){const details=doc.createElement('details');details.className='bulk-failures';details.open=true;details.innerHTML=`<summary>${failures.length} requests need review</summary><ul>${failures.map(f=>`<li><a href="#/t/${f.row.id}">${esc(f.row.key)}</a> — ${esc(f.detail)}</li>`).join('')}</ul>`;root.append(details);}
      const receipt=root.querySelector('.bulk-receipt');if(receipt){receipt.tabIndex=-1;receipt.focus();}
    }}
  }
  doc.defaultView.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
  function loading(value){busy=value;freeze(value);checks();root.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);if(!value)render();}
  return {setRows,clear,loading,get busy(){return busy;}};
}
