const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const commercialFields=[
 ['orderReference','Quote, order or invoice reference','text'],
 ['purchaseOrder','Purchase order (PO)','text'],
 ['paymentTerms','Payment terms & method','text'],
 ['billingContact','Billing contact','text'],
 ['unitInterval','Unit price period',{'':'Not stated',month:'Per month',quarter:'Per quarter',year:'Per year',once:'One-off',other:'Other',none:'No payment'}],
 ['renewalTermMonths','Renewal term (months)','number'],
 ['commercialNotes','True-up, renewal pricing & other conditions','textarea']
];
export function renderCommercialDetails(root,{record,save,done,stale}) {
 const values=Object.fromEntries((record.commercialDetails||[]).map(x=>[x.field,x.value]));
 const view=()=>{
  root.innerHTML='<h3>Purchase & billing details</h3><div class="kvgrid">'+commercialFields.filter(([key])=>values[key]).map(([key,label,type])=>'<div><span>'+esc(label)+'</span><b>'+esc(typeof type==='object'?type[values[key]]||values[key]:values[key])+'</b></div>').join('')+'</div>'+
   (!Object.keys(values).length?'<p class="kv">Keep order references, payment terms and pricing conditions with this record.</p>':'')+
   (record.canEdit?'<button type="button" class="pill outline sm" data-edit-commercial>Edit purchase details</button>':'');
  const button=root.querySelector('[data-edit-commercial]');if(button)button.onclick=edit;
 };
 const edit=()=>{
  root.innerHTML='<h3>Purchase & billing details</h3><form><div class="review-fields">'+commercialFields.map(([key,label,type])=>{
   const val=values[key]||'',id='commercial-'+key;
   const control=typeof type==='object'?`<select id="${id}" name="${key}">${Object.entries(type).map(([k,v])=>`<option value="${k}" ${k===val?'selected':''}>${esc(v)}</option>`).join('')}</select>`:type==='textarea'?`<textarea id="${id}" name="${key}" maxlength="1200" rows="4">${esc(val)}</textarea>`:`<input id="${id}" name="${key}" value="${esc(val)}" type="${type}" ${type==='number'?'min="1" max="1200" step="1"':'maxlength="200"'}>`;
   return `<div class="review-field ${type==='textarea'?'wide':''}"><label for="${id}">${esc(label)}</label>${control}</div>`;
  }).join('')+'</div><div class="btnrow"><button type="submit" class="pill primary">Save details</button><button type="button" class="pill outline" data-cancel>Cancel</button></div><p role="status" data-result></p></form>';
  let busy=false;const form=root.querySelector('form'),status=root.querySelector('[data-result]');
  root.querySelector('[data-cancel]').onclick=()=>{if(!busy)view();};
  form.onsubmit=async e=>{e.preventDefault();if(busy||stale())return;busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Saving…';
   try{const r=await save(commercialFields.map(([field])=>({field,value:form.elements.namedItem(field).value.trim()})));if(stale())return;if(r.ok){await done();return;}status.textContent=r.detail;}
   catch(_){if(!stale())status.textContent='Could not confirm the save. Reload this record before retrying.';}
   finally{busy=false;if(!stale())form.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
 };view();
}
