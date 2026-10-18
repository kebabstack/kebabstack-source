// Contract type details: the fields an admin defined for this contract's type, shown and edited on the record.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const KIND_LABEL={text:'Text',number:'Number',date:'Date',select:'Choice',amount:'Amount',bool:'Yes / no',person:'Person'};
export function fieldDisplay(f,value,names={}){
  if(!value)return '';
  if(f.kind==='person')return names[value]||value;
  if(f.kind==='bool')return value==='yes'?'Yes':'No';
  return value;
}
export function renderTypeFields(root,{record,types,names,save,setType,pickPerson,done,stale}){
  const type=record.contractType,values=Object.fromEntries(record.typeValues||[]);
  const view=()=>{
    const filled=type.fields.filter(f=>values[f.key]);
    root.innerHTML='<h3>'+esc(type.icon)+' '+esc(type.name)+' details</h3>'+
      (type.fields.length?'<div class="kvgrid">'+type.fields.map(f=>'<div><span>'+esc(f.title)+(f.required&&!values[f.key]?' <em class="muted">required</em>':'')+'</span><b>'+(values[f.key]?esc(fieldDisplay(f,values[f.key],names)):'<span class="unk">—</span>')+'</b></div>').join('')+'</div>':'<p class="kv">'+esc(type.description||'This type has no extra fields.')+'</p>')+
      (record.canEdit?'<div class="btnrow">'+(type.fields.length?'<button type="button" class="pill outline sm" data-edit-type>Edit details</button>':'')+'<label class="kv" style="display:flex;align-items:center;gap:6px">Type <select data-type-select>'+types.filter(t=>t.enabled||t.id===type.id).map(t=>`<option value="${t.id}" ${Number(t.id)===Number(type.id)?'selected':''}>${esc(t.icon)} ${esc(t.name)}</option>`).join('')+'</select></label></div>':'');
    const b=root.querySelector('[data-edit-type]');if(b)b.onclick=edit;
    const sel=root.querySelector('[data-type-select]');if(sel)sel.onchange=async()=>{sel.disabled=true;const r=await setType(BigInt(sel.value));if(stale())return;if(!r.ok){sel.disabled=false;alert(r.detail);return;}done();};
  };
  const edit=()=>{
    root.innerHTML='<h3>'+esc(type.icon)+' '+esc(type.name)+' details</h3><form><div class="review-fields">'+type.fields.map(f=>{
      const val=values[f.key]||'',id='tf-'+f.key;let control;
      if(f.kind==='select')control=`<select id="${id}" name="${esc(f.key)}"><option value="">—</option>${f.options.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
      else if(f.kind==='bool')control=`<select id="${id}" name="${esc(f.key)}"><option value="">—</option><option value="yes" ${val==='yes'?'selected':''}>Yes</option><option value="no" ${val==='no'?'selected':''}>No</option></select>`;
      else if(f.kind==='date')control=`<input id="${id}" name="${esc(f.key)}" type="date" value="${esc(val)}">`;
      else if(f.kind==='number'||f.kind==='amount')control=`<input id="${id}" name="${esc(f.key)}" type="text" inputmode="decimal" value="${esc(val)}" placeholder="${f.kind==='amount'?'e.g. 1200.00':''}">`;
      else if(f.kind==='person')control=`<div class="pick"><input id="${id}" name="${esc(f.key)}" type="text" value="${esc(val)}" data-person placeholder="Search the directory…" autocomplete="off"><div class="list hidden" data-person-list></div></div><small class="kv">${val?esc(names[val]||val):''}</small>`;
      else control=`<input id="${id}" name="${esc(f.key)}" type="text" value="${esc(val)}" maxlength="1000">`;
      return `<div class="review-field"><label for="${id}">${esc(f.title)}${f.required?' *':''}</label>${control}</div>`;
    }).join('')+'</div><div class="btnrow"><button type="submit" class="pill primary">Save details</button><button type="button" class="pill outline" data-cancel>Cancel</button></div><p role="status" data-result></p></form>';
    root.querySelectorAll('[data-person]').forEach(inp=>pickPerson?.(inp,inp.parentElement.querySelector('[data-person-list]')));
    const form=root.querySelector('form'),status=root.querySelector('[data-result]');let busy=false;
    root.querySelector('[data-cancel]').onclick=view;
    form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;status.textContent='saving…';
      const out=[];for(const f of type.fields){const el=form.elements[f.key];if(!el)continue;let v=String(el.value||'').trim();if(f.kind==='person')v=el.dataset.pid||v;if(f.required&&!v){status.textContent=f.title+' is required';busy=false;return;}out.push([f.key,v]);}
      try{const r=await save(out);if(stale())return;if(!r.ok){status.textContent=r.detail;busy=false;return;}done();}catch(err){status.textContent=String(err?.message||err);busy=false;}
    };
  };
  view();
}
// Settings: the admin's list of contract types and the editor for one type (name, icon, fields).
export function renderTypeAdmin(root,{types,save,remove,reload}){
  const view=()=>{
    root.innerHTML='<h3>Contract types</h3><p class="kv">Every contract shares the core (parties, responsibility, term, money, renewal, notice). A type adds its own fields; the document assistant classifies new contracts into these types and fills their fields.</p>'+
      '<table class="plain"><thead><tr><th>Type</th><th>Fields</th><th>Seats</th><th>State</th><th></th></tr></thead><tbody>'+types.map(t=>`<tr><td>${esc(t.icon)} <b>${esc(t.name)}</b><div class="kv">${esc(t.description)}</div></td><td>${t.fields.map(f=>esc(f.title)).join(', ')||'—'}</td><td>${t.hasSeats?'yes':'—'}</td><td>${t.enabled?'enabled':'disabled'}${t.builtin?' · built-in':''}</td><td><button type="button" class="pill outline sm" data-edit="${t.id}">Edit</button>${t.builtin?'':` <button type="button" class="pill outline sm" data-remove="${t.id}">Delete</button>`}</td></tr>`).join('')+'</tbody></table>'+
      '<div class="btnrow"><button type="button" class="pill outline sm" data-new>New type</button><span class="status" data-status></span></div>';
    root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(types.find(t=>String(t.id)===b.dataset.edit)));
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this type? Contracts must not use it any more.'))return;const r=await remove(BigInt(b.dataset.remove));root.querySelector('[data-status]').textContent=r.ok?'deleted':r.detail;if(r.ok)reload();});
    root.querySelector('[data-new]').onclick=()=>edit(null);
  };
  const fieldRow=(f={})=>`<tr><td><input name="key" value="${esc(f.key||'')}" placeholder="site" maxlength="40" pattern="[A-Za-z0-9_]+"></td><td><input name="title" value="${esc(f.title||'')}" placeholder="Site / address" maxlength="80"></td><td><select name="kind">${Object.entries(KIND_LABEL).map(([k,l])=>`<option value="${k}" ${f.kind===k?'selected':''}>${l}</option>`).join('')}</select></td><td><input name="options" value="${esc((f.options||[]).join(' | '))}" placeholder="a | b | c"></td><td><input type="checkbox" name="required" ${f.required?'checked':''}></td><td><input type="checkbox" name="inList" ${f.inList?'checked':''}></td><td><input type="checkbox" name="remind" ${f.remind?'checked':''}></td><td><button type="button" class="linkbtn" data-rm>×</button></td></tr>`;
  const edit=t=>{
    root.innerHTML='<h3>'+(t?'Edit type':'New contract type')+'</h3><form><div class="row"><div><label>Name</label><input name="name" value="'+esc(t?.name||'')+'" maxlength="60" required></div><div><label>Icon (emoji)</label><input name="icon" value="'+esc(t?.icon||'')+'" maxlength="8"></div></div>'+
      '<label>Description</label><input name="description" value="'+esc(t?.description||'')+'" maxlength="300">'+
      '<div class="row"><div><label class="check"><input type="checkbox" name="hasSeats" '+(t?.hasSeats?'checked':'')+'> Has seats and license holders (offboarding asks to release them)</label></div><div><label class="check"><input type="checkbox" name="enabled" '+(t?.enabled!==false?'checked':'')+'> Enabled</label></div></div>'+
      '<div class="tblwrap"><table class="plain type-fields"><thead><tr><th>Key</th><th>Label</th><th>Kind</th><th>Choices (for Choice)</th><th>Req.</th><th>In list</th><th>Remind (dates)</th><th></th></tr></thead><tbody data-rows>'+(t?.fields||[]).map(fieldRow).join('')+'</tbody></table></div>'+
      '<div class="btnrow"><button type="button" class="pill outline sm" data-add>Add field</button></div>'+
      '<div class="btnrow"><button type="submit" class="pill primary sm">Save type</button><button type="button" class="pill outline sm" data-cancel>Cancel</button><span class="status" data-status></span></div></form>';
    const rows=root.querySelector('[data-rows]');
    root.querySelector('[data-add]').onclick=()=>rows.insertAdjacentHTML('beforeend',fieldRow());
    rows.onclick=e=>{const b=e.target.closest('[data-rm]');if(b)b.closest('tr').remove();};
    root.querySelector('[data-cancel]').onclick=view;
    root.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,status=root.querySelector('[data-status]');
      const fields=[...rows.querySelectorAll('tr')].map(tr=>({key:tr.querySelector('[name=key]').value.trim(),title:tr.querySelector('[name=title]').value.trim(),kind:tr.querySelector('[name=kind]').value,options:tr.querySelector('[name=options]').value.split('|').map(x=>x.trim()).filter(Boolean),required:tr.querySelector('[name=required]').checked,inList:tr.querySelector('[name=inList]').checked,remind:tr.querySelector('[name=remind]').checked}));
      status.textContent='saving…';
      const r=await save({id:t?[t.id]:[],name:form.elements.name.value.trim(),icon:form.elements.icon.value.trim(),description:form.elements.description.value.trim(),fields,hasSeats:form.elements.hasSeats.checked,enabled:form.elements.enabled.checked});
      status.textContent=r.ok?'saved':r.detail;if(r.ok)reload();
    };
  };
  view();
}
