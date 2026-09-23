/* Central permissions UI. The backend supplies both effective roles and their meaning. */
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const opt = xs => xs?.[0] ?? null;
  const apps = ["assets", "contracts", "desk", "forms", "trust", "watch", "crumbs"];
  const title = s => s ? s[0].toUpperCase() + s.slice(1) : "App";
  const clone = p => ({app:p.app, defaultRole:p.defaultRole, people:p.people.map(x=>({...x})), groups:p.groups.map(x=>({...x}))});
  const key = p => JSON.stringify(p, (_, v) => typeof v === "bigint" ? String(v) : v);
  function mountReporting(root,api,{cid,owner,people,groups,onSaved}) {
    let alive=true,value=null,draft=[],pending=false;
    const $=s=>root.querySelector(s),message=t=>{if($('[data-r-message]'))$('[data-r-message]').textContent=t;};
    root.innerHTML='<section class="card"><div class="perm-section-head"><div><h2>Desk reporting access</h2><p class="kv">Give HR and Finance access to selected on-call projects without making them support agents.</p></div><button data-r-open>Manage reporting access</button></div><div data-r-content></div><p data-r-message role="status"></p></section>';
    const personName=id=>people.find(p=>p.id===id)?.name||id;
    const subjectName=g=>g.subject.person!==undefined?personName(g.subject.person):'Group: '+(groups.find(x=>x.id===g.subject.group)?.name||g.subject.group);
    function draw(){
      const box=$('[data-r-content]');
      box.innerHTML=`<p class="kv">Hub Owners and Admins already have full access. Other people keep their Desk role; “No access” still denies entry. Reporting permissions never grant incident or ticket access. Changes use the same directory freshness checks as app roles.</p><div class="table-scroll"><table class="perm-table"><thead><tr><th>Person or group</th><th>On-call project</th><th>Allowed actions</th><th></th></tr></thead><tbody>${draft.map((g,i)=>`<tr><td>${esc(subjectName(g))}</td><td>${esc(value.scopes.find(p=>p.id===g.projectId)?.name||'Unavailable project')}</td><td>${g.capabilities.map(c=>esc(value.capabilities.find(x=>x.id===c)?.name||c)).join(' · ')}</td><td>${owner?`<button type="button" data-r-remove="${i}">Remove</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4">No supplemental assignments.</td></tr>'}</tbody></table></div>${owner&&value.scopes.length?`<form data-r-add class="perm-report-form"><div class="row"><label>Person or group<select name="subject" required><option value="">Choose…</option><optgroup label="People">${people.filter(p=>p.active&&!p.source.startsWith('Global Hub ')).map(p=>`<option value="p:${esc(p.id)}">${esc(p.name)} · ${esc(p.role)}</option>`).join('')}</optgroup><optgroup label="Groups">${groups.map(g=>`<option value="g:${g.id}">${esc(g.name)}</option>`).join('')}</optgroup></select></label><label>Project<select name="project">${value.scopes.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label></div><fieldset><legend>Reporting capabilities</legend>${value.capabilities.map(c=>`<label class="perm-report-cap"><input type="checkbox" name="cap" value="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.can.join(' · '))}</small></span></label>`).join('')}</fieldset><button>Add assignment to review</button></form><div class="btnrow"><button class="primary" data-r-review>Review reporting changes</button><button data-r-reload>Discard & reload</button></div>`:value.scopes.length?'':'<p>Create an on-call project in Desk first.</p>'}<details><summary>Separation of duties</summary><p>Participants confirm their own service; time reviewers approve another person’s evidence. Compensation preparers set rules and payroll identifiers. Statement releasers cannot release their own claims, attestations, rules or a period they prepared. Exports require a separate grant and only include released statements. These restrictions also apply to Admins.</p><p>Group grants follow current Hub membership. Manually managed groups carrying these permissions become owner-managed. Trusted IdP groups follow SCIM.</p></details><div data-r-confirm></div>`;
      root.querySelectorAll('[data-r-remove]').forEach(b=>b.onclick=()=>{draft.splice(Number(b.dataset.rRemove),1);draw();message('Unsaved reporting changes.');});
      if($('[data-r-add]'))$('[data-r-add]').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),caps=f.getAll('cap');if(!caps.length){message('Choose at least one capability.');return;}const v=f.get('subject'),subject=v.startsWith('p:')?{person:v.slice(2)}:{group:BigInt(v.slice(2))},projectId=BigInt(f.get('project')),prior=draft.find(g=>key(g.subject)===key(subject)&&g.projectId===projectId);if(prior)prior.capabilities=[...new Set([...prior.capabilities,...caps])];else draft.push({subject,projectId,capabilities:caps});draw();message('Assignment added to the unsaved review.');};
      if($('[data-r-reload]'))$('[data-r-reload]').onclick=load;
      if($('[data-r-review]'))$('[data-r-review]').onclick=()=>{const snapshot=key(draft);$('[data-r-confirm]').innerHTML=`<section class="perm-review"><h3>Save these ${draft.length} scoped assignments?</h3><p>The table above replaces the existing reporting grants. Base Desk roles stay unchanged. Removing a grant withdraws that capability unless it is still inherited through another assignment.</p><label class="perm-confirm"><input type="checkbox" data-r-accept> I reviewed the people, projects and allowed actions.</label><button class="primary" data-r-save disabled>Save reporting permissions</button></section>`;$('[data-r-accept]').onchange=e=>$('[data-r-save]').disabled=!e.target.checked;$('[data-r-save]').onclick=async()=>{if(pending||key(draft)!==snapshot||!$('[data-r-accept]').checked)return;pending=true;root.querySelectorAll('button,input,select').forEach(x=>x.disabled=true);try{const result=await api().setDeskReportingAccess(cid,value.revision,draft);if(!alive)return;if(!result.ok)throw Error(result.detail);await load();if(alive){message(result.detail);onSaved();}}catch(e){if(alive)message(e.message);}finally{pending=false;if(alive){root.querySelectorAll('button,input,select').forEach(x=>x.disabled=false);$('[data-r-confirm]')?.replaceChildren();}}};};
    }
    async function load(){message('Checking reporting projects in Desk…');try{const r=await api().getDeskReportingAccess(cid);if(!alive)return;if(!r.ok)throw Error(r.detail);value=r;draft=r.grants.map(g=>({...g,subject:{...g.subject},capabilities:[...g.capabilities]}));draw();message('');$('[data-r-open]').hidden=true;}catch(e){if(alive)message(e.message||'Reporting access could not be loaded.');}}
    $('[data-r-open]').onclick=load;
    return()=>{alive=false;};
  }
  window.KebabPermissions = {
    create(root, api, {role = () => "", onActivity = () => {}} = {}) {
      let connectors=[], groups=[], current=null, draft=null, cid=0n, generation=0, search="", reviewed="", busy=false, personGeneration=0, baseRevision=0n, savedPolicy=null, reportContext="", reportDestroy=()=>{};
      root.innerHTML = `<div class="perm-heading"><div><span class="perm-eyebrow">Hub / Permissions</span><h1>Who can do what</h1><p class="lead">One role per person and app. Global Hub owners and admins inherit Admin everywhere.</p></div></div>
        <div class="perm-toolbar"><label>App<select data-p="app" aria-label="Choose an app"></select></label><label class="perm-search">Find a person<input data-p="search" type="search" placeholder="Name or email" aria-label="Find a person"></label><button data-p="reload">Refresh</button></div>
        <p data-p="message" role="status" aria-live="polite"></p><div data-p="body"></div><div data-p="reporting"></div><aside data-p="person" class="card hidden" aria-label="This person's app permissions"></aside>`;
      const $ = name => root.querySelector(`[data-p="${name}"]`);
      const message = (text, error=false) => { $("message").textContent=text; $("message").className=error?"status err":"status"; };
      const options = (selected, inherit=false) => `${inherit?'<option value="">Use inherited role</option>':""}${(current?.roles||[]).map(r=>`<option value="${esc(r.id)}" ${r.id===selected?"selected":""}>${esc(r.name)}</option>`).join("")}`;
      const changed = () => { reviewed=""; $("review")?.remove(); message("Unsaved changes — review the effective permissions before saving."); };
      const disable = value => { busy=value; root.querySelectorAll("button, select").forEach(el=>{el.disabled=value||el.dataset.locked==="true";}); };
      function render() {
        if (!current || !draft) return;
        const owner = current.canManage && role()==="owner";
        const configured = current.configured;
        const status = opt(current.status);
        const dirty = !savedPolicy || key(savedPolicy)!==key(draft);
        const verified = configured && current.enforced && !dirty && status && Number(status.directoryAt / 1000000n) + 60000 > Date.now() && Number(current.checkedAt / 1000000n) + 60000 > Date.now();
        const selected = current.roles.find(r=>r.id===draft.defaultRole);
        const counts = current.people.reduce((a,p)=>(a[p.role]=(a[p.role]||0)+1,a),{});
        $("body").innerHTML = `<section class="card perm-summary">
          <div class="perm-summary-top"><div><h2>${esc(current.name)}</h2><span class="pill ${verified?"ok":"off"}">${dirty&&configured?"Unsaved preview":verified?"Confirmed by app":configured?"Confirmation needed":"Not centralized yet"}</span></div><button data-p="verify">Check app enforcement</button></div>
          <p>${configured?`${verified?"The app confirmed these permissions.":"Saved in Hub. Check the app to confirm these permissions are in effect."}`:"This app may still use local admin lists. Review its previous assignments, then save the central policy."}</p>
          <p class="kv">${current.checkedAt?`Last checked ${esc(new Date(Number(current.checkedAt/1000000n)).toLocaleString())}. `:""}Changes can take up to 60 seconds to take effect.</p><details class="perm-verification"><summary>About this confirmation</summary><p class="kv">Hub policy revision ${current.revision}. Confirmation covers the effective role snapshot and expires after 60 seconds. Apps refresh every 30 seconds and reject protected requests when their directory is 60 seconds old. Already downloaded information cannot be withdrawn.</p></details>
          <div class="perm-counts">${current.roles.map(r=>`<span><b>${counts[r.id]||0}</b> ${esc(r.name)}</span>`).join("")}</div>
          ${["forms","contracts"].includes(draft.app)?'<p class="perm-note">Admins can access all content, including other people’s personal and shared areas. Employees keep their own and explicitly shared content.</p>':""}
        </section>
        <section class="card"><div class="perm-section-head"><div><h2>Default for employees</h2></div><select data-p="default" aria-label="Default employee role" ${owner?"":"disabled data-locked=true"}>${current.roles.filter(r=>!["admin","agent"].includes(r.id)).map(r=>`<option value="${esc(r.id)}" ${draft.defaultRole===r.id?"selected":""}>${esc(r.name)}</option>`).join("")}</select></div><p data-p="default-description">${esc(selected?.can.join(" · ") || "No protected access to this app.")}</p></section>
        <section class="card"><div class="perm-section-head"><h2>People</h2><span class="kv">${owner?"Only Hub owners can change roles.":"Read only. A Hub owner can change roles."}</span></div><div class="table-scroll" role="region" tabindex="0" aria-label="Effective permissions"><table class="perm-table"><thead><tr><th>Person</th><th>Effective role</th><th>Why</th><th>Individual assignment</th></tr></thead><tbody data-p="rows"></tbody></table></div></section>
        <details class="card" data-p="group-details"><summary>Group assignments <span class="kv">${draft.groups.length} configured</span></summary><p class="kv">The highest group role wins. An individual assignment takes precedence. Role-bearing manual groups are owner-managed in Hub People. IdP-managed groups follow their trusted SCIM source.</p><div class="perm-groups">${[...groups,...draft.groups.filter(x=>!groups.some(g=>g.id===x.id)).map(x=>({id:x.id,name:`Deleted group #${x.id} — remove assignment`}))].map(g=>{const grant=draft.groups.find(x=>x.id===g.id);return `<label>${esc(g.name)}<select data-group="${g.id}" aria-label="Role for group ${esc(g.name)}" ${owner?"":"disabled data-locked=true"}><option value="">No group assignment</option>${current.roles.filter(r=>r.id!=="none").map(r=>`<option value="${r.id}" ${grant?.role===r.id?"selected":""}>${esc(r.name)}</option>`).join("")}</select></label>`;}).join("")||'<p class="kv">No Hub groups.</p>'}</div></details>
        <details class="card perm-meaning"><summary>What each role allows</summary><p class="kv">Inactive accounts have no access. For active accounts: global Hub Owner/Admin comes first, then individual assignments, then the highest group role, then the app default.</p>${current.roles.map(r=>`<div><h3>${esc(r.name)}</h3><p>${esc(r.can.join(" · ")||"No protected app access")}</p><p class="kv">${esc(r.cannot.join(" · "))}</p></div>`).join("")}</details>
        <details class="card"><summary>Previous local rules · migration reference</summary><p class="kv">These are historical settings, not permissions in the central model. They are never imported automatically. A former technical admin in Forms or Contracts would gain broader content access if assigned Admin here.</p>${status?`<ul>${status.legacy.map(x=>`<li>${esc(x.email)} — ${esc(x.role)} · ${esc(x.source)}</li>`).join("")}${(status.legacyGroups||[]).filter(x=>x.name).map(x=>`<li>Group ${esc(x.name)} — ${esc(x.role)}</li>`).join("")}</ul>`:'<p>Check app enforcement to read the upgraded app’s migration reference.</p>'}</details>
        ${owner?'<div class="perm-actions"><button data-p="review-button" class="primary">Review changes</button><span class="kv">Changes are saved centrally and recorded in Hub Activity.</span></div>':""}`;
        const reportKey=String(cid)+":"+owner+":"+configured+":"+dirty+":"+draft.app;
        if(reportKey!==reportContext){reportContext=reportKey;reportDestroy();$("reporting").replaceChildren();if(draft.app==="desk"&&configured&&!dirty)reportDestroy=mountReporting($("reporting"),api,{cid,owner,people:current.people,groups,onSaved:()=>{onActivity();current.enforced=false;render();}});}
        paintRows();
        $("verify").onclick=verify;
        $("default").onchange=async e=>{draft.defaultRole=e.target.value;changed();await preview();};
        root.querySelectorAll("[data-group]").forEach(el=>el.onchange=async()=>{const id=BigInt(el.dataset.group);draft.groups=draft.groups.filter(x=>x.id!==id);if(el.value)draft.groups.push({id,role:el.value});changed();await preview();});
        if($("review-button"))$("review-button").onclick=review;
      }
      function paintRows() {
        if (!$("rows")) return;
        const owner=current.canManage&&role()==="owner";
        const rows=current.people.filter(p=>`${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
        $("rows").innerHTML=rows.map(p=>{const inherited=p.source.startsWith("Global Hub ");const grant=draft.people.find(g=>g.id===p.id);const label=current.roles.find(r=>r.id===p.role)?.name||p.role;return `<tr><td><button class="perm-person-link" data-person="${esc(p.id)}">${esc(p.name||p.email)}</button><small>${esc(p.email)}${p.active?"":" · inactive"}</small></td><td><span class="pill ${p.role==="admin"?"ok":""}">${esc(label)}</span></td><td>${esc(p.source)}</td><td>${inherited?'<span class="kv">Inherited · cannot be lowered</span>':`<select data-grant="${esc(p.id)}" aria-label="Role for ${esc(p.email)}" ${owner?"":"disabled data-locked=true"}>${options(grant?.role??"",true)}</select>`}</td></tr>`;}).join("")||'<tr><td colspan="4">No people match this search.</td></tr>';
        root.querySelectorAll("[data-grant]").forEach(el=>el.onchange=async()=>{const id=el.dataset.grant;draft.people=draft.people.filter(g=>g.id!==id);if(el.value)draft.people.push({id,role:el.value});changed();await preview();});
        root.querySelectorAll("[data-person]").forEach(el=>el.onclick=()=>showPerson(el.dataset.person));
        if (busy) root.querySelectorAll("[data-grant], [data-person]").forEach(el=>el.disabled=true);
      }
      async function preview() {
        const gen=++generation, snapshot=clone(draft), selectedCid=cid;
        disable(true);
        try {const v=opt(await api().previewAppPermissions(selectedCid,snapshot));if(gen!==generation)return;if(!v)throw Error("The policy could not be evaluated. Reload and check the assignments.");if(v.revision!==baseRevision)throw Error("Someone changed this policy. Refresh before editing further.");current=v;render();return true;}
        catch(e){if(gen===generation)message(e.message,true);return false;}
        finally {if(gen===generation)disable(false);}
      }
      async function verify() {
        const gen=++generation, selectedCid=cid;
        disable(true);message("Checking the app and refreshing its permission directory…");
        try {const r=await api().checkAppPermissions(selectedCid);if(gen!==generation)return;message(r.detail,!r.ok);if(r.ok){const v=opt(await api().getAppPermissions(selectedCid));if(gen!==generation)return;if(v){current={...current,status:v.status,checkedAt:v.checkedAt,enforced:v.enforced};render();}}}
        catch(e){if(gen===generation)message(e.message,true);}
        finally {if(gen===generation)disable(false);}
      }
      async function review() {
        reviewed="";if(!await preview()||busy||!current)return;
        const snapshot=key(draft);reviewed=snapshot;
        $("review")?.remove();const box=document.createElement("section");box.className="card perm-review";box.dataset.p="review";
        const explicit=draft.people.map(g=>{const p=current.people.find(x=>x.id===g.id);return `${p?.name||g.id}: ${current.roles.find(r=>r.id===g.role)?.name||g.role}`;});
        box.innerHTML=`<h2>Apply this policy to ${esc(current.name)}?</h2><p>Default: <b>${esc(current.roles.find(r=>r.id===draft.defaultRole)?.name||draft.defaultRole)}</b>. ${draft.people.length} individual and ${draft.groups.length} group assignments. Global Hub owners and admins remain Admin.</p><p>${esc(explicit.join(" · ")||"No individual overrides.")}</p><p class="kv">${current.configured?"The effective roles above are the proposed result.":"This replaces the app's old access policy and source filters. Local app rules stop granting rights after the app upgrade. The migration reference is not imported."}</p><label class="perm-confirm"><input type="checkbox" data-p="confirm"> I have reviewed the effective roles, including Admin access to all content.</label><div class="btnrow"><button class="primary" data-p="save" disabled data-locked="true">Save Hub permissions</button><button data-p="cancel-review">Keep editing</button></div>`;
        $("body").appendChild(box);box.scrollIntoView({block:"nearest",behavior:"smooth"});
        $("confirm").onchange=e=>{$("save").disabled=!e.target.checked;$("save").dataset.locked=String(!e.target.checked);};
        $("cancel-review").onclick=()=>{reviewed="";box.remove();};
        $("save").onclick=save;
      }
      async function save() {
        if(busy||reviewed!==key(draft)||!$("confirm")?.checked)return;
        const gen=++generation, selectedCid=cid, snapshot=clone(draft), rev=baseRevision;
        disable(true);message("Saving central permissions…");
        try {const r=await api().setAppPermissions(selectedCid,rev,snapshot);if(gen!==generation)return;if(!r.ok)throw Error(r.detail);reviewed="";onActivity();await open(selectedCid);message(r.detail);}
        catch(e){if(gen===generation){message(e.message,true);reviewed="";$("review")?.remove();}}
        finally {disable(false);}
      }
      async function showPerson(pid) {
        const gen=++personGeneration;
        $("person").classList.remove("hidden");$("person").textContent="Loading effective permissions across apps…";
        try {const rows=await api().personAppPermissions(pid);if(gen!==personGeneration)return;const person=current.people.find(p=>p.id===pid);$("person").innerHTML=`<div class="perm-section-head"><h2>${esc(person?.name||"Person")} · all apps</h2><button data-p="close-person">Close</button></div><p class="kv">Saved Hub policy. Unsaved changes in the editor are not included.</p>${rows.filter(r=>r.configured||apps.includes(r.name.toLowerCase())).map(r=>`<div class="perm-person-app"><h3>${esc(r.name)} <span class="pill">${esc(r.roleLabel||title(r.role))}</span></h3><p>${esc(r.source)}</p><p>${esc(r.can.join(" · "))}</p><p class="kv">${esc(r.cannot.join(" · "))}</p></div>`).join("")}`;$("close-person").onclick=()=>{personGeneration++;$("person").classList.add("hidden");};$("person").scrollIntoView({block:"start",behavior:"smooth"});}
        catch(e){if(gen===personGeneration)$("person").textContent=e.message;}
      }
      async function open(id) {
        reportDestroy();reportContext="";$("reporting").replaceChildren();const gen=++generation;cid=BigInt(id);reviewed="";personGeneration++;$("person").classList.add("hidden");disable(true);$("body").textContent="Loading permissions…";
        try {const v=opt(await api().getAppPermissions(cid));if(gen!==generation)return;if(!v)throw Error("This app is no longer connected.");current=v;baseRevision=v.revision;savedPolicy=v.configured?clone(v.policy):null;
          let app=v.policy.app||connectors.find(c=>c.id===cid)?.permissionApp||connectors.find(c=>c.id===cid)?.name.toLowerCase();
          if(!apps.includes(app)){const c=connectors.find(c=>c.id===cid);const probe=await api().probeApp(c.canisterId);if(gen!==generation)return;app=opt(probe.manifest)?.name?.toLowerCase();}
          if(!apps.includes(app))throw Error("Central permissions support Assets, Contracts, Desk, Forms, Trust, Watch and Crumbs. This connected app uses its own model.");
          draft=v.configured?clone(v.policy):{app,defaultRole:["watch","crumbs"].includes(app)?"none":"member",people:[],groups:[]};
          if(!v.configured){const proposed=opt(await api().previewAppPermissions(cid,draft));if(gen!==generation)return;if(!proposed)throw Error("Permission preview unavailable.");current=proposed;}
          $("app").value=String(cid);render();message("");
        }catch(e){if(gen===generation){$("body").textContent="";message(e.message,true);}}
        finally {if(gen===generation)disable(false);}
      }
      async function load(selected) {
        const gen=++generation;disable(true);message("Loading connected apps…");
        try {const [cs,gs]=await Promise.all([api().listConnectors(),api().listGroups()]);if(gen!==generation)return;connectors=[...cs].sort((a,b)=>Number(apps.includes(b.name.toLowerCase()))-Number(apps.includes(a.name.toLowerCase()))||a.name.localeCompare(b.name));groups=gs;
          $("app").innerHTML=connectors.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
          if(!connectors.length){$("body").textContent="Connect Assets, Contracts, Desk, Forms, Trust or Watch to manage permissions here.";message("");disable(false);return;}
          await open(selected&&connectors.some(c=>String(c.id)===String(selected))?selected:(cid&&connectors.some(c=>c.id===cid)?cid:connectors[0].id));
        }catch(e){if(gen===generation){message(e.message,true);disable(false);}}
      }
      $("app").onchange=e=>open(e.target.value);$("reload").onclick=()=>load(cid);$("search").oninput=e=>{search=e.target.value;paintRows();};
      const expiryTimer = setInterval(() => {
        const status=opt(current?.status);
        if (current?.enforced && status && (Number(status.directoryAt/1000000n)+60000<=Date.now() || Number(current.checkedAt/1000000n)+60000<=Date.now())) {
          current={...current,enforced:false};
          if (!busy && !$("review")) render();
        }
      },1000);
      return {load,open,destroy:()=>{clearInterval(expiryTimer);reportDestroy();},getState:()=>({current,draft,cid,busy})};
    }
  };
})();
