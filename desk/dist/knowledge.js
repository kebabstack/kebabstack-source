// The ticket never sends comments, internal notes or an app session to Doku.
export function createKnowledge({root,api,session}) {
 let generation=0,id=null,dirty=false,revision=0n;
 function clear(){generation++;id=null;dirty=false;root.replaceChildren();root.classList.add('hidden');}
 async function show(full){
  if(!full.canAct||full.customer?.length){clear();return;}
  if(id===String(full.ticket.id)){if(!['resolved','closed'].includes(full.ticket.status)){root.querySelector('#knowledgeTargets')?.replaceChildren();const status=root.querySelector('#knowledgeStatus');if(status)status.textContent='Resolve this request and confirm its solution again before creating a proposal.';}return;}
  clear();id=String(full.ticket.id);const stamp=generation;
  root.classList.remove('hidden');root.innerHTML='<details><summary>Documentation</summary><p>Loading the confirmed solution…</p></details>';
  try{const response=await api().getKnowledgeSolution(session.load(),full.ticket.id);if(stamp!==generation)return;if(response.err)throw new Error(response.err);const s=response.ok;revision=s.revision;
   root.innerHTML='<details><summary>Documentation</summary><p class="muted">Keep the reusable solution, without personal details or secrets. Resolve the request before confirming it.</p><label for="knowledgeSolution">Solution for documentation</label><textarea id="knowledgeSolution" rows="6" maxlength="12000"></textarea><div class="actions"><button id="knowledgeConfirm" type="button">Confirm solution</button></div><p id="knowledgeStatus" role="status"></p><div id="knowledgeTargets"></div></details>';
   const textarea=root.querySelector('textarea'),status=root.querySelector('#knowledgeStatus'),confirm=root.querySelector('button');textarea.value=s.summary;textarea.oninput=()=>{dirty=true;root.querySelector('#knowledgeTargets').replaceChildren();status.textContent='Save this solution before opening Doku.';};
   async function targets(){const rows=await api().knowledgeTargets(session.load());if(stamp!==generation||dirty)return;const target=root.querySelector('#knowledgeTargets');target.replaceChildren();for(const row of rows){const url=new URL(row.url);if(url.protocol!=='https:')continue;url.hash=`/from-desk/${row.desk}/${full.ticket.id}`;const a=document.createElement('a');a.href=url.href;a.textContent='Create documentation proposal →';a.className='btn';target.append(a);}if(!rows.length)status.textContent+=' Connect Doku and assign Author or Reviewer access in Hub → Permissions.';}
   status.textContent=s.confirmed?'Solution confirmed. Open Doku to prepare the change.':s.revision?'The request reopened or the solution needs reconfirmation.':'No solution confirmed yet.';
   if(s.confirmed)void targets();
   confirm.onclick=async()=>{confirm.disabled=true;try{const r=await api().confirmKnowledgeSolution(session.load(),full.ticket.id,revision,textarea.value);if(stamp!==generation)return;if(r.err)throw new Error(r.err);revision=r.ok.revision;dirty=false;status.textContent='Solution confirmed. Create and review your proposal in Doku.';await targets();}catch(e){if(stamp===generation)status.textContent=e.message||'Could not confirm. Please retry.';}finally{if(stamp===generation)confirm.disabled=false;}};
  }catch(e){if(stamp===generation){root.innerHTML='<details open><summary>Documentation</summary><p></p></details>';root.querySelector('p').textContent=e.message||'Documentation is unavailable. Reopen the ticket to retry.';}}
 }
 return {show,clear};
}
