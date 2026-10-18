// Shared evidence review: native modal focus containment, editable proposals and explicit save.
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openPhotoReview({url, title = 'Review label photo', values, current, locations, onSave}) {
  const previous = document.activeElement, dialog = document.createElement('dialog');
  dialog.className = 'photo-review';
  dialog.setAttribute('aria-labelledby','photoReviewTitle');
  const fields = [['serial','Serial / Dell Service Tag'],['vendor','Vendor'],['model','Model'],['kind','Kind'],['note','Note'],...(locations ? [['location','Location'],['status','Status']] : [])];
  dialog.innerHTML = `<header><div><h2 id="photoReviewTitle">${esc(title)}</h2><p>Compare the label with the reading. Changes stay in the review until you save the assets.</p></div><button type="button" data-close aria-label="Close photo review">Close</button></header><div class="photo-review-body"><section class="photo-evidence" aria-label="Label photo"><div class="photo-controls"><button type="button" data-out aria-label="Zoom out">−</button><button type="button" data-in aria-label="Zoom in">+</button><button type="button" data-fit>Fit photo</button><span>Zoom, then scroll to inspect</span></div><div class="photo-viewport" tabindex="0"><img src="${esc(url)}" alt="Label photo being reviewed"></div></section><form id="photoReviewFields"><p class="kv">${current ? 'Current values are shown below each proposal. Only your confirmed changes will be applied.' : 'Check ambiguous characters such as 0/O and 1/I. Dell Service Tags take priority over the long S/N.'}</p>${fields.map(([key,label])=>`<label>${label}${['kind','location','status'].includes(key)?`<select name="${key}">${(key==='kind'?['laptop','phone','tablet','monitor','accessory','other']:key==='status'?['in_stock','deployed']:['',...new Set([...locations,...(values.location?[values.location]:[])])]).map(k=>`<option value="${esc(k)}"${k===(values[key] || (key==='status'?'in_stock':''))?' selected':''}>${esc(k || 'No location')}</option>`).join('')}</select>`:`<input type="text" name="${key}" value="${esc(values[key])}" autocomplete="off" spellcheck="false">`}${current?`<small>Current: ${esc(current[key] || 'Empty')}</small>`:''}</label>`).join('')}</form></div><footer><button class="primary" type="submit" form="photoReviewFields">Keep corrections</button></footer>`;
  document.body.append(dialog);
  let scale = 1;
  const img = dialog.querySelector('img'), viewport = dialog.querySelector('.photo-viewport');
  const zoom = n => {scale=Math.max(1,Math.min(4,n)); img.style.width=`${scale*100}%`; img.style.maxHeight=scale===1?'100%':'none';};
  dialog.querySelector('[data-in]').onclick=()=>zoom(scale+.5);
  dialog.querySelector('[data-out]').onclick=()=>zoom(scale-.5);
  dialog.querySelector('[data-fit]').onclick=()=>{zoom(1);viewport.scrollTop=viewport.scrollLeft=0;};
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.onclose=()=>{dialog.remove();previous?.focus();};
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); for(const key in data)data[key]=data[key].trim(); onSave(data); dialog.close();};
  dialog.showModal();
}
