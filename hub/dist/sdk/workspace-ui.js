// Shared, opt-in workspace controls. No requests, credentials or persistent storage.
const states = new WeakMap();
const collator = new Intl.Collator(undefined, {numeric:true,sensitivity:'base'});
const element = (tag, attrs={}, text='') => {const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);el.textContent=text;return el;};
export function enhanceTable(table) {
 if(states.has(table))return states.get(table);
 const header=table.tHead?.rows;
 if(header?.length!==1||table.tBodies.length!==1)return;
 const heads=[...header[0].cells];
 if(heads.some(h=>h.colSpan!==1||h.rowSpan!==1||h.querySelector('button,a,input,select')))return;
 // Editable grids and grouped rows retain their app-owned order/selection semantics.
 if(table.tBodies[0].querySelector('input,select,textarea,[contenteditable=true]'))return;
 const host=table.closest('.table-scroll,.tblwrap,.saas-table-scroll')||table;
 const bar=element('div',{class:'ks-table-tools'}), status=element('span',{'role':'status','aria-live':'polite'});
 const details=element('details'), summary=element('summary',{},'Table options');details.append(summary);
 const panel=element('div',{class:'ks-table-options'}), label=element('label',{},'Find in loaded rows');
 const search=element('input',{type:'search','aria-label':'Find in loaded rows',autocomplete:'off'});label.append(search);panel.append(label);
 const note=element('small',{},'This view only. App filters, totals and exports are unchanged.');panel.append(note);
 const columns=element('fieldset'), legend=element('legend',{},'Visible columns');columns.append(legend);panel.append(columns);
 const reset=element('button',{type:'button'},'Reset table view');panel.append(reset);details.append(panel);bar.append(status,details);host.before(bar);
 table.classList.add('ks-data-table');const hidden=new Set();let sort=-1,direction=1,working=false;
 const original=new WeakMap();let next=0;
 function rows(){return [...table.tBodies[0].rows];}
 function apply(){
  if(working)return;working=true;observer?.disconnect();
  if(table.tBodies.length!==1){working=false;observer?.observe(table,{childList:true,subtree:true});return;}
  const all=rows(), term=search.value.trim().toLocaleLowerCase();let shown=0;
  if(table.tBodies[0].querySelector('input,select,textarea,[contenteditable=true]')){bar.hidden=true;hidden.clear();search.value='';sort=-1;columns.querySelectorAll('input').forEach(c=>c.checked=true);all.forEach(r=>{r.hidden=false;[...r.cells].forEach(c=>c.hidden=false);});heads.forEach(h=>{h.hidden=false;h.removeAttribute('aria-sort');});heads.forEach(h=>{const b=h.querySelector('button');if(b)b.disabled=true;});observer?.observe(table,{childList:true,subtree:true});working=false;return;}
  bar.hidden=false;heads.forEach(h=>{const b=h.querySelector('button');if(b)b.disabled=false;});
  for(const row of all){if(!original.has(row))original.set(row,next++);const regular=row.cells.length===heads.length&&[...row.cells].every(c=>c.colSpan===1);row.hidden=!!term&&regular&&!row.textContent.toLocaleLowerCase().includes(term);if(!row.hidden&&regular)shown++;if(regular)[...row.cells].forEach((c,i)=>{c.hidden=hidden.has(i);});}
  if(sort>=0&&all.every(r=>r.cells.length===heads.length&&[...r.cells].every(c=>c.colSpan===1))){
   const type=heads[sort].dataset.ksSort||'text';
   const value=row=>{const c=row.cells[sort],v=c.dataset.sortValue??c.textContent.trim();if(!v||v==='—')return null;if(type==='number')return /^-?\d+(\.\d+)?$/.test(v)&&Number.isFinite(Number(v))?Number(v):null;return v;};
   all.sort((a,b)=>{const av=value(a),bv=value(b);if(av===null||bv===null)return av===bv?original.get(a)-original.get(b):av===null?1:-1;const c=type==='number'?av-bv:collator.compare(av,bv);return direction*c||original.get(a)-original.get(b);});
   all.forEach(r=>table.tBodies[0].append(r));
  }
  heads.forEach((h,i)=>{h.hidden=hidden.has(i);if(h.dataset.ksSort!=='none')h.setAttribute('aria-sort',sort===i?(direction===1?'ascending':'descending'):'none');});
  status.textContent=`${shown} of ${all.filter(r=>r.cells.length===heads.length&&[...r.cells].every(c=>c.colSpan===1)).length} loaded rows`;
  observer?.observe(table,{childList:true,subtree:true,characterData:true});working=false;
 }
 const observer=typeof MutationObserver==='undefined'?null:new MutationObserver(()=>{if(table.contains(document.activeElement))return;apply();});
 heads.forEach((h,i)=>{
  const name=h.textContent.trim();if(!name)return;h.scope='col';
  if(h.dataset.ksSort!=='none') {const button=element('button',{type:'button',class:'ks-sort','aria-label':`Sort ${name}${h.dataset.ksSort==='number'?' numerically':' as text'}`},name);h.replaceChildren(button);button.onclick=()=>{direction=sort===i?-direction:1;sort=i;apply();};}
  // Keep the first identifier and action column reachable.
  if(i===0||h.dataset.ksSort==='none')return;
  const l=element('label'), cb=element('input',{type:'checkbox'});cb.checked=true;l.append(cb,document.createTextNode(name));columns.append(l);cb.onchange=()=>{cb.checked?hidden.delete(i):hidden.add(i);apply();};
 });
 search.oninput=apply;search.onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};reset.onclick=()=>{search.value='';hidden.clear();columns.querySelectorAll('input').forEach(c=>c.checked=true);sort=-1;observer?.disconnect();rows().sort((a,b)=>original.get(a)-original.get(b)).forEach(r=>table.tBodies[0].append(r));apply();};
 table.addEventListener('focusout',()=>queueMicrotask(()=>{if(!table.contains(document.activeElement)&&table.isConnected)apply();}));
 const state={refresh:apply,destroy(){observer?.disconnect();bar.remove();states.delete(table);}};states.set(table,state);apply();return state;
}
function fieldLabel(control){const label=control.labels?.[0]?.cloneNode(true);if(label)label.querySelectorAll('input,select,textarea,button').forEach(el=>el.remove());return label?.textContent.trim()||control.getAttribute('aria-label')||control.name||'Field';}
let fieldSequence=0;
const formStates=new WeakSet();
export function enhanceForm(form){
 if(formStates.has(form))return;formStates.add(form);
 const summary=element('div',{class:'ks-form-errors',role:'alert'});form.prepend(summary);const invalid=new Set();
 const paint=()=>{summary.replaceChildren();for(const input of invalid){if(!input.isConnected||input.validity.valid){invalid.delete(input);input.removeAttribute('aria-invalid');continue;}if(!input.id)input.id='ks-field-'+(++fieldSequence);const link=element('a',{href:'#'+input.id},fieldLabel(input)+': '+input.validationMessage);link.onclick=e=>{e.preventDefault();input.focus();};summary.append(link,element('br'));}};
 form.addEventListener('invalid',e=>{invalid.add(e.target);e.target.setAttribute('aria-invalid','true');paint();},true);
 form.addEventListener('input',paint);form.addEventListener('change',paint);
}
const selectStates=new WeakSet();
export function enhanceSelect(select){
 if(selectStates.has(select)||select.multiple||select.size>1||select.options.length<20)return;
 selectStates.add(select);const wrapper=element('div',{class:'ks-select-search'}), label=fieldLabel(select);
 const input=element('input',{type:'search',placeholder:'Find an option…','aria-label':`Find ${label}`,autocomplete:'off'});
 // Keep the native select, value, events, validation and keyboard interaction.
 const selected=()=>[...select.options].forEach(o=>{o.hidden=!!input.value&&!o.selected&&!o.text.toLocaleLowerCase().includes(input.value.toLocaleLowerCase());});
 wrapper.append(input);select.before(wrapper);input.disabled=select.matches(':disabled');input.oninput=selected;
 const optionsObserver=new MutationObserver(()=>{input.disabled=select.matches(':disabled');selected();});optionsObserver.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();select.focus();}if(e.key==='Escape'){input.value='';selected();select.focus();}});
 select.addEventListener('change',()=>{input.value='';selected();});
}
export function observeWorkspace(root=document){
 const scan=()=>{root.querySelectorAll('table[data-ks-table]').forEach(enhanceTable);root.querySelectorAll('select[data-ks-search]').forEach(enhanceSelect);root.querySelectorAll('form[data-ks-form]').forEach(enhanceForm);};
 scan();let queued=false;const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;scan();});}});observer.observe(root.body||root,{childList:true,subtree:true});return ()=>observer.disconnect();
}
// Entry point is loaded only by official operational workspaces, not games/public embeds.
if(typeof document!=='undefined'&&document.body?.classList.contains('ks-workspace'))observeWorkspace();
