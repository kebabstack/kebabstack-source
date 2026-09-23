import {esc} from './view.js';
const unwrap=r=>{if('err'in r){const [code,message]=Object.entries(r.err)[0];throw new Error(typeof message==='string'?message:code);}return r.ok;};
/** Site membership is distinct from admission to Crumbs in the Hub. */
export async function websiteAccess({actor,token,site,mount,isCurrent,onSaved,onDirty=()=>{}}){
 const policy=unwrap(await actor.getSiteAccess(token(),site));if(!isCurrent())return;
 const members=new Map([...policy.readers.map(p=>[p.id,{...p,role:'read'}]),...policy.managers.map(p=>[p.id,{...p,role:'manage'}])]);
 mount.innerHTML=`<h2>People & access</h2><p class="subtle">Hub owners, Hub admins and Crumbs admins always have full access.</p>${policy.legacyAllReaders?'<p class="access-legacy">All Crumbs Analysts can currently read this website. Saving replaces this legacy rule with the named people below.</p>':''}<form id="accessForm"><div id="accessMembers" class="access-people"></div><label>Find a Hub user<input id="accessSearch" type="search" maxlength="100" placeholder="Type a name or email to add someone" autocomplete="off"></label><p id="accessSearchStatus" class="subtle">Enter at least two characters.</p><div id="accessCandidates" class="access-people"></div><p class="subtle access-help"><strong>Read</strong> — view reports. <strong>Manage</strong> — also change settings, goals, people and API keys for this website. People must have Crumbs access in the Hub.</p><div class="form-actions"><button id="saveAccess" class="primary" disabled>Save access</button><span id="accessStatus" role="status" class="form-status"></span></div></form>`;
 const $=id=>mount.querySelector('#'+id),status=$('accessStatus');let sequence=0,saving=false,changed=false,visible=[],timer;
 const personLabel=p=>`<span class="access-name"><strong>${esc(p.displayName||p.email||'Former Hub user')}</strong><span class="subtle">${esc(p.email)}${!p.active?' · inactive':!p.eligible?' · enable Crumbs in Hub first':''}</span></span>`;
 const selector=(p,role)=>`<select data-person="${esc(p.id)}" aria-label="Website access for ${esc(p.displayName||p.email)}"><option value="none"${role==='none'?' selected':''}>${role==='none'?'Choose access…':'Remove access'}</option>${p.eligible&&!p.automatic?`<option value="read"${role==='read'?' selected':''}>Read</option><option value="manage"${role==='manage'?' selected':''}>Manage</option>`:role!=='none'?`<option value="${esc(role)}" selected disabled>${esc(role)} (unavailable)</option>`:''}</select>`;
 function render(){
  $('accessMembers').innerHTML=members.size?[...members.values()].map(p=>`<div class="access-row">${personLabel(p)}${selector(p,p.role)}</div>`).join(''):'<p class="empty-report">No additional people. Only administrators can access this website.</p>';
  const candidates=visible.filter(p=>!members.has(p.id));
  $('accessCandidates').innerHTML=candidates.map(p=>`<div class="access-row">${personLabel(p)}${p.automatic?'<span class="access-inherited">Administrator · automatic access</span>':p.eligible?selector(p,'none'):'<span class="subtle">No Crumbs access</span>'}</div>`).join('');
  mount.querySelectorAll('select,input').forEach(e=>e.disabled=saving);$('saveAccess').disabled=saving||!changed;
 }
 render();
 mount.onchange=e=>{const id=e.target.dataset.person;if(!id||saving)return;const person=members.get(id)??visible.find(p=>p.id===id);if(!person)return;if(e.target.value==='none')members.delete(id);else members.set(id,{...person,role:e.target.value});changed=true;onDirty(true);status.textContent='Unsaved changes';render();};
 $('accessSearch').oninput=()=>{
  clearTimeout(timer);const attempt=++sequence,q=$('accessSearch').value.trim();visible=[];render();
  if(q.length<2){$('accessSearchStatus').textContent='Enter at least two characters.';return;}
  $('accessSearchStatus').textContent='Searching…';
  timer=setTimeout(async()=>{if(!isCurrent())return;try{const result=unwrap(await actor.accessPeople(token(),site,q));if(isCurrent()&&attempt===sequence&&!saving){visible=result.people;$('accessSearchStatus').textContent=result.truncated?'Showing the first 100 matches. Narrow your search.':!visible.length?'No matching Hub users.':visible.every(p=>members.has(p.id))?'Already added to this website.':'';render();}}catch(e){if(isCurrent()&&attempt===sequence)$('accessSearchStatus').textContent=e.message;}},250);
 };
 $('accessForm').onsubmit=async e=>{e.preventDefault();if(saving||!changed)return;saving=true;render();status.textContent='Saving…';try{const readers=[],managers=[];for(const p of members.values())(p.role==='manage'?managers:readers).push(p.id);unwrap(await actor.setSiteAccess(token(),site,policy.revision,readers,managers));if(isCurrent()){onDirty(false);await onSaved();}}catch(e){if(isCurrent()){status.textContent=e.message;saving=false;render();}}};
}
