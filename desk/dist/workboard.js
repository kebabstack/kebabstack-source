// Desk's workboard owns project tasks. Linked records keep their source's workflow.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const one = x => x?.[0];
const tag = x => Object.keys(x || {})[0];
const columns = {planned:'Planned', active:'In progress', waiting:'Waiting', done:'Done'};
const opt = x => x ? [BigInt(x)] : [];
const number = x => String(x ?? 0);
const date = value => value ? new Date(value + 'T12:00:00').toLocaleDateString(undefined,{dateStyle:'medium'}) : '';
const stamp = value => new Date(Number(value / 1000000n)).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
export function workLink(base, path) {
  try { const u=new URL(base); if(u.protocol!=='https:' || u.username || u.password || !/^#\/(?:sale|t)\/\d+$/.test(path)) return ''; u.hash=path.slice(1); return u.href; } catch { return ''; }
}
const failure = r => {
  if(r?.ok) return r.ok;
  const e=r?.err || {unavailable:null},k=tag(e);
  throw Error(({denied:'Your access could not be confirmed. Reopen the board to check your access.',missing:'This item is no longer available.',stale:'This item changed. Reopen it before saving again.',unavailable:'The source is unavailable. Try again shortly.'})[k] || e[k] || 'The change could not be confirmed. Try again.');
};
export function createWorkboard({root,api,session,getMe}) {
  const doc=root.ownerDocument,win=doc.defaultView;
  let epoch=0,timer=null,home=null,prefs=null,route='',mode='',project=null,sources=[],busy=false;
  let search='',rows=[],offsets={},totals={},warnings=[],accessAt=0;
  const call=(method,...args)=>api()[method](session.load(),...args);
  const valid=n=>n===epoch && getMe() && getMe().role!=='requester';
  const $=s=>root.querySelector(s);
  const locationFor=id=>`#/workboard${id?'/'+id:''}`;
  const currentId=()=>one(prefs?.projectId);
  const shell=(title,body,actions='')=>`<div class="wb-heading"><div><h2>${esc(title)}</h2></div><div class="wb-actions">${actions}</div></div><div class="wb-message" role="status" aria-live="polite"></div>${body}`;
  function message(text,error=false){const el=$('.wb-message');if(el){el.textContent=text;el.classList.toggle('wb-error',error);}}
  function clear(){epoch++;clearInterval(timer);timer=null;home=null;rows=[];sources=[];project=null;root.replaceChildren();busy=false;accessAt=0;}
  function lock(text){clear();root.innerHTML=shell('Workboard',`<div class="wb-empty"><p>${esc(text)}</p><a class="button" href="#/workboard">Reopen workboard</a></div>`);}
  async function show(arg='',detail=''){
    clear();route=arg;mode=detail;const n=epoch;
    if(!getMe() || getMe().role==='requester') return;
    root.classList.add('workboard');root.innerHTML=shell('Workboard','<p role="status">Loading your work…</p>');
    try {
      const h=one(await call('workboardHome'));if(!valid(n))return;if(!h){lock('Your Desk access could not be confirmed.');return;}
      home=h;prefs={...h.preferences};
      if(/^\d+$/.test(arg)) prefs.projectId=[BigInt(arg)];
      if(arg==='projects') await projects(n);
      else if(arg==='project') await projectEditor(n,detail);
      else if(arg==='task') await taskEditor(n,detail);
      else if(arg==='link') await linkPicker(n,detail);
      else await board(n);
      if(!valid(n))return;accessAt=Date.now();
      timer=setInterval(async()=>{
        if(!valid(n)||busy)return;
        if(doc.hidden){if(Date.now()-accessAt>60000)lock('Reopen the workboard to refresh its access and status.');return;}
        try{
          const fresh=one(await call('workboardHome'));if(!valid(n))return;if(!fresh){lock('Your Desk access could not be confirmed.');return;}
          home=fresh;accessAt=Date.now();
          if(route==='task' && detail!=='new') {if(!one(await call('workboardTask',BigInt(detail))))lock('This task is no longer available to your account.');}
          else if(['project','link'].includes(route)&&detail!=='new') {if(!one(await call('workboardProject',BigInt(detail))))lock('This project is no longer available to your account.');}
          else if(route!=='projects'&&route!=='task'&&route!=='project'&&route!=='link') await loadBoard(n,true);
        }catch{if(valid(n))lock('Access could not be refreshed. Reopen the board when the connection is available.');}
      },30000);
    }catch{if(valid(n))lock('The workboard could not be loaded. Check your connection and reopen it.');}
  }
  function projectOptions(selected,all=true){return `${all?'<option value="">All projects</option>':''}${home.projects.filter(p=>!p.archived).map(p=>`<option value="${p.id}" ${number(p.id)===number(selected)?'selected':''}>${esc(p.name)}</option>`).join('')}`;}
  function audience(p){return tag(p.scope)==='personal'?'Personal · administrators can also access':`Hub group · ${p.scope.group}`;}
  function filter(offset=0){return {projectId:prefs.projectId,mine:prefs.mine,completed:prefs.completed,search,offset:BigInt(offset)};}
  async function board(n){
    project=currentId()?one(await call('workboardProject',currentId()))?.project:null;
    if(!valid(n))return;
    if(currentId()&&(!project||project.archived)){lock('This project is unavailable or archived. Open Projects to restore it.');return;}
    await savePrefs();if(!valid(n))return;
    root.innerHTML=shell('Workboard',`
      <p class="wb-intro">Your projects, support requests and next steps in one place.</p>
      <div class="wb-toolbar"><div class="wb-field"><label for="wb-project">Project</label><select id="wb-project">${projectOptions(currentId())}</select></div>
      <div class="wb-field wb-scope"><label for="wb-mine">Show</label><select id="wb-mine"><option value="mine" ${prefs.mine?'selected':''}>My work</option><option value="team" ${!prefs.mine?'selected':''}>Team work</option></select></div>
      ${project?`<a class="button" href="#/workboard/project/${project.id}">Project details</a><a class="button" href="#/workboard/link/${project.id}">Link existing work</a>`:''}</div>
      ${project?`<p class="wb-meta">${esc(audience(project))}${project.dueOn?' · Target '+esc(date(project.dueOn)):''}</p>`:''}
      <div class="wb-filters"><span class="wb-meta">Include</span><label><input type="checkbox" data-source="tickets" ${prefs.tickets?'checked':''}>Desk tickets</label><label><input type="checkbox" data-source="sales" ${prefs.sales?'checked':''}>Hardware sales</label><label><input type="checkbox" data-source="completed" ${prefs.completed?'checked':''}>Completed</label><button type="button" data-refresh>Refresh</button></div>
      <p class="wb-meta" data-sale-help ${prefs.sales?'':'hidden'}>My work shows sales you started. Ticket and sale status comes from the original record.</p>
      <div data-board aria-busy="true"></div><div data-more class="wb-more"></div>
      <details class="wb-help"><summary>How the board works</summary><p>Tasks belong to Desk. Open a task to change its state, owner or target date. Waiting always has a reason. Tickets and sales stay linked to their original workflow; open the record to act on it.</p><p>Project membership never grants access to a linked ticket or sale. Hardware sales require Assets admin or Finance access from Hub. External customer tickets stay in Customer projects.</p><a href="#/workboard/projects">Manage projects and archived work</a></details>`,
      '<a class="button" href="#/workboard/projects">Projects</a><a class="button primary" href="#/workboard/task/new">Add task</a>');
    $('#wb-project').onchange=async()=>{const id=$('#wb-project').value;prefs.projectId=opt(id);prefs.mine=false;await savePrefs();if(!valid(n))return;if(win.location.hash===locationFor(id))show(id);else win.location.hash=locationFor(id);};
    $('#wb-mine').onchange=async()=>{prefs.mine=$('#wb-mine').value==='mine';await savePrefs();await loadBoard(n);};
    root.querySelectorAll('[data-source]').forEach(el=>el.onchange=async()=>{prefs[el.dataset.source]=el.checked;$('[data-sale-help]').hidden=!prefs.sales;await savePrefs();await loadBoard(n);});
    $('[data-refresh]').onclick=()=>loadBoard(n);
    await loadBoard(n);
  }
  async function savePrefs(){try{if(!await call('saveWorkboardPreferences',prefs))message('View preference could not be saved.',true);}catch{message('View preference could not be saved.',true);}}
  async function loadBoard(n,background=false){
    if(!valid(n)||busy)return;busy=true;const panel=$('[data-board]');if(!panel){busy=false;return;}
    panel.setAttribute('aria-busy','true');root.querySelectorAll('.wb-toolbar input,.wb-toolbar select,.wb-filters input,.wb-filters button').forEach(e=>e.disabled=true);warnings=[];rows=[];totals={};offsets={};
    try{
      const selected=currentId();
      if(selected){const p=one(await call('workboardProject',selected));if(!valid(n))return;if(!p||p.project.archived){lock('This project is no longer available.');return;}project=p.project;}
      const [tasks,tickets,sourceResult]=await Promise.allSettled([call('workboardTasks',filter(),false),prefs.tickets?call('workboardTickets',filter()):null,prefs.sales?call('workboardSources'):[]]);
      if(!valid(n))return;
      const t=tasks.status==='fulfilled'?one(tasks.value):null;
      if(!t){lock('Your tasks could not be refreshed. Reopen the workboard.');return;}
      addTasks(t);
      if(prefs.tickets) addPage('tickets',tickets.status==='fulfilled'?tickets.value:null);
      sources=sourceResult.status==='fulfilled'?sourceResult.value:[];
      if(prefs.sales){
        if(sourceResult.status==='rejected')warnings.push('Assets is unavailable. Sales could not be checked.');
        else if(!sources.length)warnings.push('No Assets source available with your current admin or Finance access.');
        const results=await Promise.allSettled(sources.map(s=>call('workboardSales',s.cid,prefs.projectId,prefs.completed,prefs.mine,0n)));
        if(!valid(n))return;results.forEach((r,i)=>addPage('sales:'+sources[i].cid,r.status==='fulfilled'?r.value:null,sources[i]));
      }
      renderBoard();accessAt=Date.now();if(!background)message('');
    }catch{if(valid(n)){rows=[];renderBoard();message('Some work could not be refreshed. Try again.',true);}}
    finally{if(valid(n)){busy=false;panel.setAttribute('aria-busy','false');root.querySelectorAll('.wb-toolbar input,.wb-toolbar select,.wb-filters input,.wb-filters button').forEach(e=>e.disabled=false);}}
  }
  function addTasks(page){totals.tasks=Number(page.total);offsets.tasks=(offsets.tasks||0)+page.rows.length;rows.push(...page.rows.map(t=>({...t,kind:'task',sourceKey:'tasks',href:`#/workboard/task/${t.id}`,owner:t.assigneeName||'Unassigned',next:tag(t.column)==='waiting'?t.waitingFor:project?'':t.projectName})));}
  function addPage(key,page,source){
    if(!page||tag(page.state)!=='ready'){warnings.push(`${source?.name||'Desk tickets'}: ${tag(page?.state)==='denied'?'access restricted':'temporarily unavailable'}.`);return;}
    totals[key]=Number(page.total);offsets[key]=(offsets[key]||0)+page.rows.length;
    rows.push(...page.rows.map(t=>({...t,kind:source?'sale':'ticket',sourceKey:key,cid:source?.cid,href:source?workLink(source.url,t.path):/^#\/t\/\d+$/.test(t.path)?t.path:''})).filter(t=>t.href));
  }
  function renderBoard(){
    rows=[...new Map(rows.map(t=>[t.sourceKey+':'+t.id,t])).values()];
    const focused=doc.activeElement?.closest('[data-card]')?.dataset.card,linkFocused=doc.activeElement?.tagName==='A';
    $('[data-board]').innerHTML=(warnings.length?`<div class="wb-notices" role="status">${warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</div>`:'')+`<div class="wb-columns">${Object.entries(columns).map(([key,label])=>{const items=rows.filter(t=>tag(t.column)===key);return `<section class="wb-column" aria-labelledby="wb-${key}"><h3 id="wb-${key}">${label}<span>${items.length}</span></h3><ul>${items.map(card).join('')}</ul>${!items.length?`<p class="wb-column-empty">${key==='done'&&!prefs.completed?'Completed work is hidden.':'Nothing here right now.'}</p>`:''}</section>`;}).join('')}</div>`;
    $('[data-more]').innerHTML=Object.keys(totals).filter(k=>totals[k]>(offsets[k]||0)).map(k=>`<button data-more-key="${esc(k)}">Load more ${k==='tasks'?'tasks':k==='tickets'?'tickets':'sales'} (${offsets[k]} of ${totals[k]})</button>`).join('');
    root.querySelectorAll('[data-more-key]').forEach(b=>b.onclick=()=>more(b.dataset.moreKey));
    root.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>unlink(b));
    if(focused){const el=[...root.querySelectorAll('[data-card]')].find(e=>e.dataset.card===focused);(linkFocused?el?.querySelector('a'):el?.querySelector('button'))?.focus({preventScroll:true});}
  }
  function card(t){const done=tag(t.column)==='done',today=[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-'),overdue=t.dueOn&&t.dueOn<today&&!done;return `<li class="wb-card" data-card="${esc(t.sourceKey+':'+t.id)}"><div class="wb-card-kind">${t.kind==='task'?'Task':t.kind==='ticket'?'Desk ticket':'Hardware sale'}${t.reference?' · '+esc(t.reference):''}</div><a class="wb-card-title" href="${esc(t.href)}" ${t.kind==='sale'?'target="_blank" rel="noopener noreferrer"':''}>${esc(t.title)}</a>${t.kind==='task'&&Number(t.subtaskCount)?`<p class="wb-progress">${t.subtasksDone} of ${t.subtaskCount} subtasks complete</p>`:''}${t.kind==='sale'&&t.status?`<p class="wb-source-state">${esc(t.status)}</p>`:''}${t.next?`<p>${esc(t.next)}</p>`:''}<div class="wb-card-foot"><span>${esc(t.owner)}</span>${t.dueOn?`<span class="${overdue?'wb-overdue':''}">${overdue?'Overdue · ':''}${esc(date(t.dueOn))}</span>`:''}${t.assigneeAvailable===false?'<span class="wb-overdue">Owner no longer available</span>':''}</div>${project&&t.kind!=='task'?`<button class="wb-unlink" data-unlink="${t.id}" data-kind="${t.kind}" data-cid="${t.cid||''}" aria-label="Unlink ${esc(t.title)} from project">Unlink</button>`:''}</li>`;}
  async function more(key){if(busy)return;busy=true;const n=epoch;try{if(key==='tasks'){const page=one(await call('workboardTasks',filter(offsets[key]),false));if(!page)throw Error();if(valid(n))addTasks(page);}else if(key==='tickets'){const p=await call('workboardTickets',filter(offsets[key]));if(valid(n))addPage(key,p);}else{const s=sources.find(s=>'sales:'+s.cid===key);const p=await call('workboardSales',s.cid,prefs.projectId,prefs.completed,prefs.mine,BigInt(offsets[key]));if(valid(n))addPage(key,p,s);}if(valid(n))renderBoard();}catch{if(valid(n))message('More work could not be loaded. Refresh to try again.',true);}finally{if(valid(n))busy=false;}}
  async function unlink(b){await action(b,async()=>{const ref=b.dataset.kind==='ticket'?{ticket:BigInt(b.dataset.unlink)}:{sale:{cid:BigInt(b.dataset.cid),id:BigInt(b.dataset.unlink)}};failure(await call('linkWorkItem',project.id,project.revision,ref,false));});if(!busy)await loadBoard(epoch);}
  async function action(button,fn){if(busy)return false;busy=true;button.disabled=true;const n=epoch;try{await fn();return valid(n);}catch(e){if(valid(n))message(e.message||'The change could not be confirmed. Your draft is still here.',true);return false;}finally{if(valid(n)){busy=false;button.disabled=false;}}}
  async function projects(n){
    if(!valid(n))return;
    const archivedTasks=one(await call('workboardTasks',{projectId:[],mine:false,completed:true,search:'',offset:0n},true));if(!valid(n))return;
    const list=archived=>home.projects.filter(p=>p.archived===archived).map(p=>`<li><div><a href="${archived?'#/workboard/project/'+p.id:locationFor(p.id)}">${esc(p.name)}</a><p>${esc(audience(p))} · ${p.openTasks} open tasks${p.dueOn?' · '+esc(date(p.dueOn)):''}</p></div><a class="button" href="#/workboard/project/${p.id}">${archived?'Details & restore':'Details'}</a></li>`).join('');
    root.innerHTML=shell('Projects',`<p class="wb-intro">Keep related work together. A Hub group defines who can contribute.</p><ul class="wb-projects">${list(false)||'<li>No projects yet. Start with one clear outcome.</li>'}</ul><details class="wb-help"><summary>Archived projects</summary><ul class="wb-projects">${list(true)||'<li>No archived projects.</li>'}</ul></details><details class="wb-help"><summary>Archived tasks</summary><ul class="wb-projects" data-archived-tasks>${(archivedTasks?.rows||[]).map(t=>`<li><a href="#/workboard/task/${t.id}">${esc(t.title)}</a><span>${esc(t.projectName)}</span></li>`).join('')||'<li>No archived tasks in active projects.</li>'}</ul><button data-archived-more ${(archivedTasks?.rows.length||0)>=Number(archivedTasks?.total||0)?'hidden':''}>Load more archived tasks</button><p><span data-archived-count>${archivedTasks?.rows.length||0}</span> of ${archivedTasks?.total||0} archived tasks shown. Restore an archived project first to access its tasks.</p></details>`, '<a class="button" href="#/workboard">Back to board</a><a class="button primary" href="#/workboard/project/new">New project</a>');
    let archiveOffset=archivedTasks?.rows.length||0;
    $('[data-archived-more]').onclick=async()=>{const b=$('[data-archived-more]');await action(b,async()=>{const page=one(await call('workboardTasks',{projectId:[],mine:false,completed:true,search:'',offset:BigInt(archiveOffset)},true));if(!page)throw Error('Archived tasks could not be loaded.');if(!valid(n))return;for(const t of page.rows){const li=doc.createElement('li');li.innerHTML=`<a href="#/workboard/task/${t.id}">${esc(t.title)}</a><span>${esc(t.projectName)}</span>`;$('[data-archived-tasks]').append(li);}archiveOffset+=page.rows.length;$('[data-archived-count]').textContent=String(archiveOffset);b.hidden=archiveOffset>=Number(page.total);});};
  }
  function field(id,label,input,help=''){return `<div class="wb-field"><label for="${id}">${esc(label)}</label>${input}${help?`<p class="wb-meta">${esc(help)}</p>`:''}</div>`;}
  const history=entries=>`<details class="wb-help"><summary>Activity</summary><ol>${entries.map(e=>`<li>${esc(e.action)} · ${esc(e.by)}<small>${esc(stamp(e.at))}</small></li>`).join('')||'<li>No activity yet.</li>'}</ol></details>`;
  async function projectEditor(n,id){
    if(id!=='new'&&!/^\d+$/.test(id))throw Error();
    const data=id==='new'?null:one(await call('workboardProject',BigInt(id)));if(!valid(n))return;if(id!=='new'&&!data){lock('This project is not available.');return;}
    const p=data?.project,editable=!p||p.canManage&&!p.archived,key=win.crypto.randomUUID();
    root.innerHTML=shell(p?p.name:'New project',`<form class="wb-editor" data-project-form><fieldset ${editable?'':'disabled'}>
      ${field('wp-name','Project name',`<input id="wp-name" name="name" required maxlength="100" value="${esc(p?.name||'')}" placeholder="e.g. Office network refresh">`)}
      ${field('wp-audience','Who can contribute',`<select id="wp-audience" name="audience" ${p?'disabled':''}><option value="">Personal</option>${[...new Set([...home.groups,...(p?.scope?.group?[p.scope.group]:[])])].map(g=>`<option ${p?.scope?.group===g?'selected':''}>${esc(g)}</option>`).join('')}</select>`,'Personal work is also accessible to Desk administrators. Group members need a Desk staff role. The audience is fixed once created.')}
      ${field('wp-note','Outcome',`<textarea id="wp-note" name="description" maxlength="2000" rows="3" placeholder="What will be different when this is done?">${esc(p?.description||'')}</textarea>`)}
      ${field('wp-due','Target date (optional)',`<input id="wp-due" name="due" type="date" min="2000-01-01" max="2199-12-31" value="${esc(p?.dueOn||'')}">`)}
      ${editable?'<button class="primary" type="submit">'+(p?'Save project':'Create project')+'</button>':''}</fieldset></form>
      ${p?.canManage?`<details class="wb-help"><summary>${p.archived?'Restore project':'Archive project'}</summary><p>${p.archived?'Restore this project and its tasks to the board.':'Hide this project and its tasks. Linked tickets and sales keep their current status. You can restore the project later.'}</p><button data-archive-project>${p.archived?'Restore':'Archive'} project</button></details>`:''}${p&&!p.canManage?'<p class="wb-meta">Only the project creator or a Desk administrator can change project details.</p>':''}${data?history(data.history):''}`,
      `<a class="button" href="${p&&!p.archived?locationFor(p.id):'#/workboard/projects'}">Back</a>`);
    const form=$('[data-project-form]');form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;const input={name:form.elements.name.value.trim(),description:form.elements.description.value.trim(),scope:p?p.scope:form.elements.audience.value?{group:form.elements.audience.value}:{personal:null},dueOn:form.elements.due.value};let result;const ok=await action(form.querySelector('[type=submit]'),async()=>{result=failure(await call('saveWorkProject',p?.id||0n,p?.revision||0n,key,input));});if(ok){await call('saveWorkboardPreferences',{...prefs,projectId:[result.id],mine:false}).catch(()=>{});if(!valid(n))return;win.location.hash=locationFor(result.id);}};
    const archive=$('[data-archive-project]');if(archive)archive.onclick=async()=>{if(await action(archive,async()=>failure(await call('archiveWorkProject',p.id,p.revision,!p.archived))))win.location.hash='#/workboard/projects';};
  }
  async function taskEditor(n,id){
    if(id!=='new'&&!/^\d+$/.test(id))throw Error();
    const data=id==='new'?null:one(await call('workboardTask',BigInt(id)));if(!valid(n))return;if(id!=='new'&&!data){lock('This task is not available.');return;}
    const t=data?.task,pid=t?one(t.projectId):currentId(),pr=pid?one(await call('workboardProject',pid)):null;if(!valid(n))return;
    let people=data?.people||pr?.people||[{id:getMe().id,name:getMe().displayName}],key=win.crypto.randomUUID();
    const unavailablePersonal=t&&!t.assigneeAvailable&&(!one(t.projectId)||tag(pr?.project.scope)==='personal');
    const readonly=data?.readOnly||t?.archived||unavailablePersonal,selected=t?tag(t.column):'planned';
    let children=(data?.subtasks||[]).map(row=>({...row}));
    root.innerHTML=shell(t?'Edit task':'Add task',`<form class="wb-editor" data-task-form><fieldset ${readonly?'disabled':''}>
      ${field('wt-title','What needs to happen?',`<input id="wt-title" name="title" required maxlength="180" value="${esc(t?.title||'')}" placeholder="e.g. Test the new Wi-Fi in meeting rooms">`)}
      ${t?`<input type="hidden" name="project" value="${pid||''}"><p class="wb-task-context">${esc(t.projectName)} · ${esc(pr?audience(pr.project):'Personal · also visible to Desk admins')}</p>`:field('wt-project','Project',`<select id="wt-project" name="project"><option value="">Personal task</option>${projectOptions(pid,false)}</select>`,'The project sets this task’s audience. It cannot be moved to a different audience later.')}
      <div class="wb-pair">${field('wt-owner','Owner',`<select id="wt-owner" name="owner"></select>`)}${field('wt-state','State',`<select id="wt-state" name="state">${Object.entries(columns).map(([k,v])=>`<option value="${k}" ${selected===k?'selected':''}>${v}</option>`).join('')}</select>`)}</div>
      <div data-waiting ${selected==='waiting'?'':'hidden'}>${field('wt-waiting','Waiting for',`<input id="wt-waiting" name="waiting" maxlength="120" ${selected==='waiting'?'required':''} value="${esc(t?.waitingFor||'')}" placeholder="e.g. Vendor delivery confirmation">`)}</div>
      <section class="wb-subtasks" aria-labelledby="wt-subtasks-title"><h3 id="wt-subtasks-title">Subtasks <span data-subtask-count></span></h3><p class="wb-meta">Small steps toward this task. Changes are saved with the task.</p><ul data-subtasks></ul>${readonly?'':'<button type="button" data-add-subtask>Add subtask</button>'}<p class="wb-meta" data-subtask-blocker role="status"></p></section>
      <details class="wb-task-details"><summary>Notes &amp; target date${t?.dueOn?` · ${esc(date(t.dueOn))}`:''}</summary>
      ${field('wt-due','Target date (optional)',`<input id="wt-due" name="due" type="date" min="2000-01-01" max="2199-12-31" value="${esc(t?.dueOn||'')}">`)}
      ${field('wt-note','Notes (optional)',`<textarea id="wt-note" name="note" maxlength="4000" rows="4">${esc(t?.note||'')}</textarea>`)}
      </details>
      ${readonly?`<p>${unavailablePersonal?'The owner is no longer available. Archive this personal task or create a replacement in a team project.':'This task is archived or belongs to an archived project.'}</p>`:'<button class="primary" type="submit">'+(t?'Save task':'Add task')+'</button>'}</fieldset></form>
      ${t&&!data.readOnly?`<details class="wb-help"><summary>${t.archived?'Restore task':'Archive task'}</summary><p>${t.archived?'Show this task on the board again.':'Remove this task from the board without deleting its history.'}</p><button data-archive-task>${t.archived?'Restore':'Archive'} task</button></details>`:''}${data?history(data.history):''}`,
      `<a class="button" href="${locationFor(pid)}">Back to board</a>`);
    const form=$('[data-task-form]');form.elements.project.value=pid?number(pid):'';
    function owners(chosen){form.elements.owner.innerHTML=(form.elements.project.value?'<option value="">Unassigned</option>':'')+people.map(p=>`<option value="${esc(p.id)}" ${p.id===chosen?'selected':''}>${esc(p.name)}</option>`).join('');if(chosen&&!people.some(p=>p.id===chosen)){form.elements.owner.innerHTML+='<option selected value="" disabled>Previous owner unavailable — choose an owner</option>';form.elements.owner.required=true;}}
    function syncChildren(){children=[...form.querySelectorAll('[data-subtask-row]')].map(el=>({id:BigInt(el.dataset.id),title:el.querySelector('input[type=text]').value,done:el.querySelector('input[type=checkbox]').checked}));}
    function progress(){const open=children.filter(s=>!s.done).length;$('[data-subtask-count]').textContent=children.length?`${children.length-open} / ${children.length}`:'';$('[data-subtask-blocker]').textContent=open&&form.elements.state.value==='done'?'Complete every subtask or choose an active state before saving.':'';form.elements.state.setCustomValidity(open&&form.elements.state.value==='done'?'Complete the remaining subtasks before marking this task done.':'');}
    function renderChildren(focus){$('[data-subtasks]').innerHTML=children.map((s,i)=>`<li data-subtask-row data-id="${s.id}"><label class="wb-subtask-check"><input type="checkbox" ${s.done?'checked':''} aria-label="Subtask ${i+1} complete"></label><input type="text" required maxlength="180" value="${esc(s.title)}" aria-label="Subtask ${i+1} title" placeholder="What is the next small step?">${readonly?'':`<button type="button" data-remove-subtask="${i}" aria-label="Remove subtask ${i+1}">Remove</button>`}</li>`).join('');const add=$('[data-add-subtask]');if(add)add.disabled=children.length>=50;progress();if(focus!==undefined)$('[data-subtasks]').children[focus]?.querySelector('input[type=text]')?.focus();}
    $('[data-subtasks]').oninput=()=>{syncChildren();progress();};
    $('[data-subtasks]').onclick=e=>{const button=e.target.closest('[data-remove-subtask]');if(!button)return;syncChildren();const i=Number(button.dataset.removeSubtask);children.splice(i,1);renderChildren(Math.min(i,children.length-1));if(!children.length)$('[data-add-subtask]')?.focus();};
    const addChild=$('[data-add-subtask]');if(addChild)addChild.onclick=()=>{syncChildren();if(children.length>=50)return;children.push({id:0n,title:'',done:false});renderChildren(children.length-1);};
    renderChildren();
    owners(t?t.assignee:getMe().id);
    form.elements.project.onchange=async()=>{const selected=form.elements.project.value,seq=(form._selection||0)+1;form._selection=seq;form.elements.owner.disabled=true;try{const p=selected?one(await call('workboardProject',BigInt(selected))):null;if(!valid(n)||form.elements.project.value!==selected||form._selection!==seq)return;people=p?.people||[{id:getMe().id,name:getMe().displayName}];owners(getMe().id);form.elements.owner.disabled=false;}catch{message('Project members could not be loaded. Try selecting the project again.',true);}};
    form.elements.state.onchange=()=>{const waiting=form.elements.state.value==='waiting';$('[data-waiting]').hidden=!waiting;form.elements.waiting.required=waiting;progress();};
    form.onsubmit=async e=>{e.preventDefault();if(busy)return;syncChildren();progress();if(!form.reportValidity()||form.elements.owner.disabled)return;const input={projectId:opt(form.elements.project.value),title:form.elements.title.value.trim(),note:form.elements.note.value.trim(),assignee:form.elements.owner.value,dueOn:form.elements.due.value,column:{[form.elements.state.value]:null},waitingFor:form.elements.state.value==='waiting'?form.elements.waiting.value.trim():''};if(await action(form.querySelector('[type=submit]'),async()=>{const fieldset=form.querySelector('fieldset');fieldset.disabled=true;try{return failure(await call('saveWorkTaskWithSubtasks',t?.id||0n,t?.revision||0n,key,input,children.map(s=>({...s,title:s.title.trim()}))));}finally{if(valid(n))fieldset.disabled=false;}}))win.location.hash=locationFor(one(input.projectId));};
    const archive=$('[data-archive-task]');if(archive)archive.onclick=async()=>{if(await action(archive,async()=>failure(await call('archiveWorkTask',t.id,t.revision,!t.archived))))win.location.hash=locationFor(pid);};
  }
  async function linkPicker(n,id){
    if(!/^\d+$/.test(id))throw Error();const data=one(await call('workboardProject',BigInt(id)));if(!valid(n))return;if(!data||data.project.archived){lock('This project is not available.');return;}project=data.project;
    root.innerHTML=shell('Link existing work',`<p class="wb-intro">Add a ticket or hardware sale to ${esc(project.name)}. Each colleague still needs permission to open the original record.</p><form class="wb-toolbar" data-find><div class="wb-field"><label for="wl-kind">Source</label><select id="wl-kind"><option value="tickets">Desk tickets</option><option value="sales">Hardware sales</option></select></div><div class="wb-field"><label for="wl-search">Search title or reference</label><input id="wl-search" maxlength="150" type="search"></div><button type="submit">Find work</button></form><ul class="wb-projects" data-results></ul><div class="wb-more" data-link-more></div>`,`<a class="button" href="${locationFor(id)}">Back to board</a>`);
    let found=[],sourceList=[],pages={};
    async function find(appendKey){const form=$('[data-find]'),button=form.querySelector('button');if(busy)return;busy=true;button.disabled=true;
      try{const kind=$('#wl-kind').value,q=$('#wl-search').value.trim().toLowerCase();if(!appendKey){found=[];pages={};$('[data-results]').replaceChildren();}
        if(kind==='tickets'){const page=await call('workboardTickets',{projectId:[],mine:false,completed:false,search:q,offset:BigInt(appendKey?pages.tickets.offset:0)});if(!valid(n))return;if(tag(page.state)!=='ready')throw Error('Tickets could not be loaded.');found.push(...page.rows.map(r=>({...r,ref:{ticket:r.id}})));pages.tickets={offset:(pages.tickets?.offset||0)+page.rows.length,total:Number(page.total)};}
        else{if(!appendKey)sourceList=await call('workboardSources');for(const s of sourceList.filter(s=>!appendKey||appendKey===number(s.cid))){const page=await call('workboardSales',s.cid,[],false,false,BigInt(pages[s.cid]?.offset||0));if(!valid(n))return;if(tag(page.state)!=='ready')throw Error(s.name+' could not be loaded.');found.push(...page.rows.map(r=>({...r,ref:{sale:{cid:s.cid,id:r.id}}})));pages[s.cid]={offset:(pages[s.cid]?.offset||0)+page.rows.length,total:Number(page.total)};}}
        if(!valid(n))return;const matching=found.filter(t=>(t.title+' '+t.reference).toLowerCase().includes(q));
        $('[data-results]').innerHTML=matching.map((t,i)=>`<li><div><strong>${esc(t.title)}</strong><p>${esc(t.reference)} · ${esc(columns[tag(t.column)])}</p></div><button data-link="${i}">Link to project</button></li>`).join('')||'<li>No matching work with your current access. Hardware sales require Assets admin or Finance access.</li>';
        $('[data-link-more]').innerHTML=Object.entries(pages).filter(([,p])=>p.offset<p.total).map(([k,p])=>`<button data-find-more="${esc(k)}">Load more (${p.offset} of ${p.total})</button>`).join('');
        root.querySelectorAll('[data-find-more]').forEach(b=>b.onclick=()=>find(b.dataset.findMore));
        root.querySelectorAll('[data-link]').forEach(b=>b.onclick=async()=>{if(await action(b,async()=>{const r=failure(await call('linkWorkItem',project.id,project.revision,matching[Number(b.dataset.link)].ref,true));project={...project,revision:r.revision};})){b.textContent='Linked';b.disabled=true;message('Linked. The original workflow and permissions remain in place.');}});
      }catch(e){if(valid(n))message(e.message||'Work could not be loaded.',true);}finally{if(valid(n)){busy=false;button.disabled=false;}}
    }
    $('[data-find]').onsubmit=e=>{e.preventDefault();find();};await find();
  }
  return {show,clear};
}
