import {renderVendorTerms} from "./vendor-terms.js";
import { analysisFeedback, analysisPending, busyButton } from "./analysis-progress.js";
import { commercialFields } from "./commercial-details.js";
const escape = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields = [
 ...commercialFields, ['recordType','Document type',{contract:'Contract / agreement',subscription:'Subscription',invoice:'Invoice',receipt:'Receipt / payment confirmation',other:'Other document'}],['title','Title','text'],['vendor','Vendor','text'],['product','Tool / product name','text'],['customerRef','Customer reference','text'],
 ['amountMinor','Amount per billing period','money'],['currency','Currency','text'],['interval','Billing frequency',{ '':'Not stated',month:'Monthly',quarter:'Quarterly',year:'Yearly',once:'One-off',none:'No payment',other:'Other'}],['taxBasis','Tax basis',{unknown:'Not stated',net:'Excluding tax',gross:'Including tax'}],
 ['start','Start date','date'],['end','End date','date'],['renewalRule','Renewal',{ '':'Not stated',auto:'Automatic',manual:'Only when renewed',none:'No renewal',indefinite:'No fixed expiry'}],['renewalDate','Next renewal','date'],
 ['noticeMonths','Notice period (months)','number'],['noticeDays','Notice period (days)','number'],['noticeDate','Cancellation deadline','date'],['seats','License seats','number'],['quantity','Quantity','number'],['unitMinor','Unit price','money'],['note','Notes and contract stage','textarea']
];
const decimal = v => /^\d+$/.test(String(v)) ? (BigInt(v)/100n)+'.'+(BigInt(v)%100n).toString().padStart(2,'0') : String(v||'');
export function renderIntakeReview(root, ctx) {
  const {view,spaces,currentSpace,canEdit,canTransfer,save,move,download,retry,remove,stale,api,token,me}=ctx;
  const source=view.source, proposals=view.proposals.filter(p=>p.status==='open');
  if(source.contractId.length || proposals.some(p=>p.contractId.length)) {
    root.innerHTML=`<div class="empty"><strong>This document already belongs to a contract.</strong>Review suggested updates alongside the existing terms.<div class="btnrow"><a class="pill primary" href="#/inbox/${source.id}">Review existing contract</a></div></div>`;return;
  }
  const destinations=spaces.filter(s=>!s.archived&&(s.id===currentSpace.id || canTransfer&&Object.keys(s.role)[0]==='owner'));
  let proposal=proposals[0] || null;
  root.innerHTML=`<div class="intake-columns"><aside class="intake-original"><div class="scard"><span class="review-eyebrow">Original source</span><h3>${escape(source.subject||'Uploaded document')}</h3><p class="kv">${escape(source.fromName||source.fromAddr||'Uploaded by you')}</p><div class="intake-files">${view.documents.map(d=>`<button class="document-link" data-doc="${d.id}"><span aria-hidden="true">▤</span><span>${escape(d.name)}<small>${(Number(d.size)/1000).toFixed(0)} KB · ${d.hasText?'Text and original retained':'Original retained · visual analysis'}</small></span><span aria-hidden="true">↓</span></button>`).join('') || '<p>No attachment. The email text is retained as evidence.</p>'}</div><p class="kv">The original stays attached to the saved contract.</p></div><div class="review-note"><strong>Check before you confirm</strong><p>AI reads original pages and images, including scans. Visual readings and signature marks need your review; they do not verify a digital signature or prove an agreement is final.</p></div>${view.text?`<details class="scard"><summary>Email / source text</summary><div class="msgtext">${escape(view.text)}</div></details>`:''}</aside><form class="scard intake-form"><div class="review-form-head"><span class="review-eyebrow">Review & file</span><h3>${analysisPending(view)?'Your original is saved.':proposal?'Your document, made useful.':'Complete the document details.'}</h3><p>${analysisPending(view)?'AI is preparing the latest details. You can keep working here while it reads.':proposal?'Check the extracted details below. Correct or complete anything before saving.':'The original is saved, but no usable AI suggestion is available. Enter what you know; unknown details can stay empty.'}</p></div>${proposals.length>1?`<label>Suggestion to use<select data-proposal>${proposals.map(p=>`<option value="${p.id}">${escape(p.summary||p.kind)}</option>`).join('')}</select></label><p class="kv">This source contains ${proposals.length} suggestions. Choose one; the others remain available for review.</p>`:''}${canEdit?`<div class="intake-item-actions"><button type="button" class="pill outline sm" data-retry>Read again with AI</button><button type="button" class="pill outline sm" data-evidence aria-pressed="false">Show source evidence</button><button type="button" class="linkbtn danger" data-delete>Delete item</button></div>`:""}<div data-analysis-progress hidden></div><div data-summary></div><div class="review-fields" data-fields></div><div class="filing-destination"><label>Save in<select data-destination>${destinations.map(s=>`<option value="${escape(s.id)}" ${s.id===currentSpace.id?'selected':''}>${escape(s.name)}${s.kind==='personal'?' · only you':''}</option>`).join('')}</select></label><p data-access class="kv"></p>${canTransfer&&destinations.length>1?`<details class="review-move"><summary>Move the original for a separate review</summary><button class="linkbtn" type="button" data-move>Move document there for review</button><p class="kv">For an update to an existing contract: move the document first, then match it in that workspace. This does not create a new contract.</p></details>`:""}</div><p class="kv">Saving tracks the subscription and its deadlines. It does not sign, pay or renew anything.</p><div class="review-save"><button class="pill primary" type="submit" ${canEdit?'':'disabled'}>Save record & original</button><details><summary>Other filing options</summary><a href="#/inbox/${source.id}">Add to an existing contract</a></details><a href="#/inbox">Review later</a></div><div class="status" data-result role="status" aria-live="polite"></div></form></div>`;
  const form=root.querySelector('form'), result=root.querySelector('[data-result]');
  const evidenceToggle=root.querySelector("[data-evidence]");if(evidenceToggle)evidenceToggle.onclick=()=>{const shown=form.classList.toggle("show-evidence");evidenceToggle.textContent=shown?"Hide source evidence":"Show source evidence";evidenceToggle.setAttribute("aria-pressed",String(shown));};
  const progress=root.querySelector('[data-analysis-progress]');
  if(source.note&&!analysisPending(view))analysisFeedback(progress,{phase:'attention',title:'Analysis needs your review',detail:source.note});
  let dirty=false, analysing=false;
  form.addEventListener('input',()=>{dirty=true;});form.addEventListener('change',()=>{dirty=true;});
  const retryButton=root.querySelector('[data-retry]');
  if(retryButton)retryButton.onclick=async()=>{
    if(retryButton.disabled||analysing||busy||stale())return;
    const restore=busyButton(retryButton,'Starting analysis…');
    analysisFeedback(progress,{title:'Starting a new AI reading…',detail:'Sending the request. Your original and previous suggestions are kept.'});
    try{const r=await retry();if(!stale()&&r?.ok===false)analysisFeedback(progress,{phase:'attention',title:'Analysis could not be started',detail:r.detail});}
    catch(_){if(!stale())analysisFeedback(progress,{phase:'attention',title:'Could not confirm the analysis request',detail:'Reload this document to check whether analysis started before trying again.'});}
    finally{if(!stale()){restore();retryButton.disabled=analysing;}}
  };
  const deleteButton=root.querySelector('[data-delete]');if(deleteButton)deleteButton.onclick=()=>remove();
  const fill=()=>{
    root.querySelector('[data-summary]').innerHTML=proposal?`<div class="review-summary-compact"><strong>AI reading · ${escape(proposal.kind.replaceAll('_',' '))}</strong><p>${escape(proposal.summary)}</p>${proposal.uncertainties.length?`<details><summary>${proposal.uncertainties.length} points to review</summary><ul>${proposal.uncertainties.map(x=>`<li>${escape(x)}</li>`).join('')}</ul></details>`:''}</div>`:'';
    root.querySelector('[data-fields]').innerHTML=fields.map(([key,label,type])=>{
      const change=proposal?.changes.find(c=>c.field===key);
      const value=change ? type==='money'?decimal(change.newValue):change.newValue : key==='recordType'?(['receipt','invoice','subscription'].includes(proposal?.kind)?proposal.kind:'contract'):key==='title'?source.subject: key==='taxBasis'?'unknown':'';
      const evidence=change?.evidence || [];
      const control=type==='textarea'?`<textarea rows="4" name="${key}" id="review-${key}">${escape(value)}</textarea>`:typeof type==='object'?`<select name="${key}" id="review-${key}">${Object.entries(type).map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select>`:`<input id="review-${key}" name="${key}" value="${escape(value)}" type="${type==='money'?'text':type}" ${type==='number'?'min="0" step="1"':type==='money'?'inputmode="decimal" placeholder="e.g. 1200.00"':''} ${key==='title'?'maxlength="200"':''}>`;
      return `<div class="review-field ${type==='textarea'?'wide':''} ${change?.basis==='ambiguous'?'needs-review':''}"><label for="review-${key}">${label}${change?`<span class="field-origin">${change.basis==='ambiguous'?'Check original':change.evidence.some(e=>e.partId.startsWith('visual:'))?'Read from image':change.basis==='derived'?'Suggested':'From document'}</span>`:''}</label>${control}${evidence.length?`<details class="field-evidence"><summary>View evidence</summary>${evidence.map(e=>`<blockquote>${escape(e.quote)}<small>${e.partId.startsWith('visual:')?'Visual reading · compare with the original':'Matched source text'}</small></blockquote>`).join('')}</details>`:''}</div>`;
    }).join('');
    const typeControl=form.elements.namedItem('recordType');
    const adapt=()=>{
      const receipt=['receipt','invoice'].includes(typeControl.value);
      const keptOwner=form.elements.ownerId?.value,keptName=form.querySelector('#review-owner')?.value,keptTrack=form.elements.trackStatus?.checked;
      const amount=root.querySelector('label[for="review-amountMinor"]');
      amount.firstChild.textContent=receipt?'Document total':'Amount per billing period';
      root.querySelector('[type=submit]').textContent=receipt?'Save '+typeControl.value+' & original':'Save record & original';
      const existing=root.querySelector('[data-extra-details]');if(existing)existing.replaceWith(...existing.querySelector('[data-extra-fields]').children);
      const purchase=root.querySelector('[data-purchase-details]');if(purchase)purchase.replaceWith(...purchase.querySelector('[data-purchase-fields]').children);
      const host=root.querySelector('[data-fields]');
      const oldSections=[...host.querySelectorAll('[data-essential-section]')];for(const el of oldSections)el.replaceWith(...el.querySelector('[data-section-fields]').children);
      const oldOwner=host.querySelector('[data-owner-field]');oldOwner?.remove();host.querySelector('[data-track-status]')?.remove();host.querySelector('[data-vendor-check]')?.remove();
      const owner=document.createElement('div');owner.className='review-field';owner.dataset.ownerField='';owner.innerHTML='<label for="review-owner">Owner</label><input id="review-owner" placeholder="Search Hub people…" autocomplete="off"><input type="hidden" name="ownerId"><div class="saas-person-results" data-owner-results></div>';
      host.append(owner);owner.querySelector('input').value=keptName??me?.displayName??'';owner.querySelector('[name=ownerId]').value=keptOwner??me?.id??'';
      if(api){let serial=0,timer;owner.querySelector('input').oninput=e=>{owner.querySelector('[name=ownerId]').value='';const n=++serial;clearTimeout(timer);timer=setTimeout(async()=>{try{const people=await api.directory(token,e.target.value);if(stale()||n!==serial)return;const list=owner.querySelector('[data-owner-results]');list.innerHTML=people.map(p=>'<button type="button" data-owner="'+escape(p.id)+'">'+escape(p.displayName)+'<small>'+escape(p.email)+'</small></button>').join('');list.querySelectorAll('button').forEach(b=>b.onclick=()=>{const p=people.find(p=>p.id===b.dataset.owner);owner.querySelector('input').value=p.displayName;owner.querySelector('[name=ownerId]').value=p.id;list.innerHTML='';dirty=true;});}catch(_){owner.querySelector('[data-owner-results]').textContent='Hub directory unavailable';}},160);};}
      const sections=receipt?[['Document',['product','vendor','amountMinor','currency','start']]]:[['Software',['product','vendor','ownerId','seats']],['Cost',['amountMinor','currency','interval']],['Renewal & cancellation',['start','end','renewalRule',form.elements.noticeMonths.value?'noticeMonths':'noticeDays','noticeDate']]];
      for(const [title,keys] of sections){const section=document.createElement('section');section.className='review-essentials wide';section.dataset.essentialSection='';section.innerHTML='<h4>'+title+'</h4><div class="review-fields" data-section-fields></div>';host.append(section);for(const key of keys){const field=form.elements.namedItem(key)?.closest('.review-field');if(field)section.querySelector('[data-section-fields]').append(field);}}
      const details=document.createElement('details');details.dataset.extraDetails='';details.className='review-additional wide';details.innerHTML='<summary>Additional details & original evidence</summary><div class="review-fields" data-extra-fields></div>';host.append(details);
      for(const field of [...host.children])if(field.classList.contains('review-field'))details.querySelector('[data-extra-fields]').append(field);
      const track=document.createElement('label');track.dataset.trackStatus='';track.className='saas-check wide';track.innerHTML='<input name="trackStatus" type="checkbox" '+((keptTrack??!receipt)?'checked':'')+'> '+(receipt?'Record as confirmed billing document':'Track as an active subscription')+'<small> Uncheck for an offer or draft.</small>';host.append(track);
      if(!receipt&&api&&canEdit&&(!form.elements.renewalRule.value||(form.elements.renewalRule.value==='auto'&&!form.elements.noticeDays.value&&!form.elements.noticeMonths.value&&!form.elements.noticeDate.value))){const web=document.createElement('div');web.dataset.vendorCheck='';web.className='vendor-terms-panel wide';host.append(web);renderVendorTerms(web,{api,token,sourceId:source.id,form,stale,auto:!analysisPending(view)&&!!proposal});}
      root.querySelector('[type=submit]').textContent=receipt?'Save document':'Save SaaS contract';

    };typeControl.onchange=adapt;adapt();
    if(!canEdit)form.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);
  };fill();
  const selector=root.querySelector('[data-proposal]');if(selector)selector.onchange=()=>{proposal=proposals.find(p=>String(p.id)===selector.value);fill();};
  const dest=root.querySelector('[data-destination]');
  const access=()=>{const target=destinations.find(s=>s.id===dest.value);root.querySelector('[data-access]').textContent=target?.id!==currentSpace.id?`The original email, attachments and suggestions move with the contract. Members of ${currentSpace.name} lose access here. Previously read or downloaded copies cannot be recalled.`:target?.kind==='personal'?'Only you can access this contract.':target?.kind==='intake'?'Visible to Hub admins and owners in the shared intake.':'Visible to the members of this teamspace.';const b=root.querySelector('[data-move]');if(b)b.disabled=target?.id===currentSpace.id;};dest.onchange=access;access();
  root.querySelectorAll('[data-doc]').forEach(b=>b.onclick=async()=>{if(b.disabled)return;const restore=busyButton(b,'Preparing download…');try{await download(BigInt(b.dataset.doc));}catch(_){if(!stale()){result.className='status err';result.textContent='The original could not be downloaded. Please try again.';}}finally{if(!stale())restore();}});
  let busy=false;
  const moveButton=root.querySelector('[data-move]');
  if(moveButton)moveButton.onclick=async()=>{
    if(busy||!canEdit||stale()||dest.value===currentSpace.id)return;
    busy=true;const restore=busyButton(moveButton,'Moving document…');result.className='status';result.textContent='Moving the original for review…';
    try{const r=await move(dest.value);if(!stale()&&!r.ok){result.className='status err';result.textContent=r.detail;}}
    catch(_){if(!stale()){result.className='status err';result.textContent='The move could not be confirmed. Check the destination inbox before retrying.';}}
    finally{busy=false;if(!stale()){restore();access();}}
  };
  form.onsubmit=async e=>{
    e.preventDefault();if(busy||!canEdit||stale())return;
    const values=[];
    for(const [key,,type] of fields){const el=form.elements.namedItem(key);let value=el.value.trim();if(!value)continue;
      if(type==='number'&&!/^\d+$/.test(value)){result.className='status err';result.textContent='Use a whole number for seats, quantity and notice periods.';el.focus();return;}
      if(type==='money') {if(!/^\d+(?:[.,]\d{1,2})?$/.test(value)){result.className='status err';result.textContent='Use an amount such as 1200.00, without thousands separators.';el.focus();return;} const [a,b='']=value.replace(',','.').split('.');value=(BigInt(a)*100n+BigInt(b.padEnd(2,'0'))).toString();}
      values.push({field:key,value});}
    if(form.elements.ownerId?.value)values.push({field:'ownerId',value:form.elements.ownerId.value});
    values.push({field:'trackStatus',value:form.elements.trackStatus?.checked?'active':'draft'});
    const tool=values.find(f=>f.field==='product')?.value;if(tool&&!values.some(f=>f.field==='title'&&f.value))values.push({field:'title',value:tool});
    if(values.some(f=>f.field==='noticeMonths')&&values.some(f=>f.field==='noticeDays')){result.className='status err';result.textContent='Choose a notice period in months or days, not both.';return;}
    busy=true;const button=form.querySelector('[type=submit]'),restore=busyButton(button,'Saving record…');result.className='status';result.textContent='Saving your record and original…';
    try{const r=await save({proposalId:proposal?[proposal.id]:[],destination:dest.value,fields:values});if(stale())return;if(!r.ok){result.className='status err';result.textContent=r.detail;if(r.contractId){const a=document.createElement('a');a.href='#/c/'+r.contractId;a.textContent=' Open saved contract';result.append(a);}return;}}
    catch(_){if(!stale()){result.className='status err';result.textContent='The save could not be confirmed. Retry safely; the original is kept in your inbox.';}}
    finally{busy=false;if(!stale())restore();}
  };
  return {progress,isDirty:()=>dirty||busy,keepEdits:next=>{if(proposal&&!next.proposals.some(p=>p.id===proposal.id&&p.status==='open')){proposal=null;if(selector)selector.disabled=true;}},setAnalysing:value=>{analysing=value;if(retryButton)retryButton.disabled=value;}};
}
