import {busyButton} from './analysis-progress.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderVendorTerms(root,{api,token,sourceId,form,stale,auto=false}){
 let running=false;
 function draw(s){
  if(stale())return;
  const ready=s?.status==='ready';
  root.innerHTML=`<strong>Renewal terms · vendor cross-check</strong><p>${ready?'These are current public terms. They may differ from the agreement or plan you purchased.':esc(s?.detail||'If the document does not state renewal conditions, AI can check the vendor’s public terms.')}</p>${s?.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Read the vendor page ↗</a>`:''}${ready?`<blockquote>${esc(s.quote)}</blockquote><p>Auto-renewal: ${esc({auto:'Yes',manual:'Manual renewal',none:'No',indefinite:'No fixed expiry'}[s.renewalRule])}${s.noticeDays?.length?' · '+Number(s.noticeDays[0])+' days’ notice':s.noticeMonths?.length?' · '+Number(s.noticeMonths[0])+' months’ notice':''}</p><button type="button" class="pill outline sm" data-use-terms>Use as a reviewed suggestion</button>`:''}<details><summary>Check another official terms page</summary><input type="url" data-terms-url placeholder="https://vendor.com/terms" aria-label="Vendor terms URL" value="${esc(s?.url||'')}"><button type="button" class="pill outline sm" data-terms-check>Check vendor terms</button></details><p data-web-status role="status"></p>`;
  root.querySelector('[data-terms-check]').onclick=()=>check(root.querySelector('[data-terms-url]').value);
  root.querySelector('[data-use-terms]')?.addEventListener('click',()=>{
   form.elements.renewalRule.value=s.renewalRule;
   if(s.noticeDays?.length){form.elements.noticeDays.value=String(s.noticeDays[0]);form.elements.noticeMonths.value='';}else if(s.noticeMonths?.length){form.elements.noticeMonths.value=String(s.noticeMonths[0]);form.elements.noticeDays.value='';}
   const note=form.elements.commercialNotes;note.value=[note.value,'Supplementary vendor terms, reviewed '+new Date(Number(s.checkedAt)/1e6).toISOString().slice(0,10)+': '+s.url+' — '+s.quote].filter(Boolean).join('\n').slice(0,1200);
   form.dispatchEvent(new Event('input',{bubbles:true}));root.querySelector('[data-web-status]').textContent='Added as a reviewed suggestion. Check the dates before saving.';
  });
 }
 async function check(url=''){
  if(running||stale())return;running=true;
  const b=root.querySelector('[data-terms-check]'),restore=b?busyButton(b,'Reading vendor terms…'):()=>{};
  root.querySelector('[data-web-status]').textContent='Finding and reading the official vendor terms… Your contract details remain editable.';
  try{const r=await api.lookupVendorTerms(token,sourceId,url);if(stale())return;const s=(await api.vendorTermsStatus(token,sourceId))[0];if(stale())return;draw(s);if(!r.ok)root.querySelector('[data-web-status]').textContent=r.detail;}
  catch(_){if(!stale())root.querySelector('[data-web-status]').textContent='The web check could not finish. Keep reviewing your document or try a direct terms URL.';}
  finally{running=false;if(!stale())restore();}
 }
 try{const s=(await api.vendorTermsStatus(token,sourceId))[0];if(stale())return;draw(s);if(auto&&!s)check();}catch(_){if(!stale())draw();}
}
