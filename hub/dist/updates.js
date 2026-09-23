/* App release management. A published release and a verified installation are
   separate facts. Only owners can invoke the installer; app roles are untouched. */
(() => {
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const opt = x => x?.[0] ?? null;
  const labels = {current:'Current',update_available:'Update available',newer_installed:'Newer version installed',modified:'Build differs',repair:'Repair needed',blocked:'Update blocked',unavailable:'Check unavailable',updating:'In progress',available:'Available to install',install_failed:'Installation incomplete'};
  const actionable = new Set(['update_available','modified','repair','install_failed']);
  window.KebabUpdates = {
    labels,
    create(roots, {service,role=()=>'',onInventory=()=>{},onInstalled=()=>{},connectExisting=()=>{}}) {
      let api=null, recipes=[], jobs=[], info=null, generation=0, busy=false, loading=false, timer=null, activeJob=null, disposed=false, checkedAt=null, available=false, lastError="";
      const owner=()=>role()==='owner';
      const notice=(text,error=false)=>{ for(const root of Object.values(roots)) {const el=root.querySelector('[data-u="message"]');if(el){el.textContent=text;el.className=error?'status err':'status';}} };
      const recipeById=id=>recipes.find(r=>r.id===id);
      function shell() {
        roots.updates.innerHTML=`<div class="update-toolbar"><div><h3>Keep your workspace current</h3><p class="kv">Review a release, update it, then see the verified result.</p></div><button data-u="reload">Check for updates</button></div><p data-u="message" role="status" aria-live="polite"></p><div data-u="progress"></div><div data-u="summary"></div><div data-u="apps"></div><div data-u="system"></div><details class="update-connection"><summary>Update service &amp; recovery</summary><div data-u="connection"></div></details>`;
        roots.catalogue.innerHTML=`<div class="update-toolbar"><div><h3>Add an app</h3><p class="kv">Install a suite app or connect software you already use.</p></div><button data-u="connect">Connect an existing tool</button></div><p data-u="message" role="status" aria-live="polite"></p><div class="update-catalogue" data-u="catalogue"></div>`;
        roots.history.innerHTML='<div class="update-toolbar"><div><h3>Update history</h3><p class="kv">Installations, updates and checks performed through the update service.</p></div><button data-u="history-refresh">Refresh history</button></div><p data-u="message" role="status" aria-live="polite"></p><div data-u="history"></div>';
      }
      function action(r) {
        if(!owner() || busy || loading || !available || r.state==='updating')return '';
        if(r.kind==='installer')return r.state==='current'?'':'<span class="kv">Operator update · see service details</span>';
        if(r.state==='current')return `<button class="sm" data-u="verify" data-id="${esc(r.id)}">Verify</button>`;
        if(!r.canUpdate)return '';
        if(r.state==='available')return `<button class="sm primary" data-u="install" data-id="${esc(r.id)}">Install app</button>`;
        if(r.state==='modified')return `<button class="sm" data-u="review" data-id="${esc(r.id)}">Review build</button>`;
        if(r.state==='repair')return `<button class="sm primary" data-u="review" data-id="${esc(r.id)}">Repair release</button>`;
        if(r.state==='update_available')return `<button class="sm primary" data-u="review" data-id="${esc(r.id)}">Review update</button>`;
        return '';
      }
      function row(r) {
        const state=!available?'Not checked':labels[r.state]||'Verification required';
        return `<article class="release-row"><div class="release-icon" aria-hidden="true">${globalThis.kebabBrand?.html(r.id)||esc(r.icon||'↻')}</div><div class="release-name"><h4>${esc(r.name)}</h4><p>${r.runningVersion?`Installed ${esc(r.runningVersion)}`:'Not installed'}${r.runningVersion&&r.runningVersion!==r.version?` <span aria-hidden="true">→</span> ${esc(r.version)} published`:''}</p></div><span class="pill ${available&&r.state==='current'?'on':actionable.has(r.state)?'warn':'off'}">${esc(state)}</span><div class="release-action">${action(r)}</div><details class="release-details"><summary>Release details</summary><p>${esc(r.detail)}</p><pre class="release-notes">${esc(r.notes||'No release notes were published.')}</pre><dl><dt>Published version</dt><dd>${esc(r.version)}</dd><dt>Release</dt><dd class="mono">${esc(r.releaseId||'Unverified package')}</dd><dt>Source</dt><dd class="mono">${esc(r.sourceCommit||'Unavailable')}</dd></dl></details></article>`;
      }
      function paint() {
        if(disposed || !owner())return;
        const installed=recipes.filter(r=>opt(r.installed)), apps=installed.filter(r=>r.kind==='app'), system=installed.filter(r=>r.kind!=='app');
        const current=installed.filter(r=>r.state==='current').length, attention=installed.filter(r=>r.state!=='current'&&r.state!=='updating').length;
        roots.updates.querySelector('[data-u="summary"]').innerHTML=recipes.length&&available?`<div class="update-summary"><div><b>${current}</b><span>verified current</span></div><div><b>${attention}</b><span>need a review</span></div><div><b>${installed.length}</b><span>managed components</span></div></div>`:'';
        roots.updates.querySelector('[data-u="apps"]').innerHTML=apps.length?`<h3 class="update-section-title">Applications</h3><div class="release-list">${apps.map(row).join('')}</div>`:`<div class="card"><p>${loading?'Loading software…':available?'No applications are managed by this update service yet.':'Software inventory has not been verified.'}</p></div>`;
        roots.updates.querySelector('[data-u="system"]').innerHTML=system.length?`<h3 class="update-section-title">System</h3><div class="release-list">${system.map(row).join('')}</div>`:'';
        const installable=recipes.filter(r=>r.kind==='app'&&!opt(r.installed));
        roots.catalogue.querySelector('[data-u="catalogue"]').innerHTML=installable.length?installable.map(r=>`<article class="card"><span class="release-icon" aria-hidden="true">${globalThis.kebabBrand?.html(r.id)||esc(r.icon||'＋')}</span><h4>${esc(r.name)}</h4><p>${esc(r.description)}</p><span class="kv">Version ${esc(r.version)}</span><div class="btnrow">${action(r)}</div>${!r.canUpdate?`<p class="kv">${esc(r.detail)}</p>`:''}</article>`).join(''):available?'<div class="card"><h4>Your suite apps are already connected</h4><p>Use Updates to manage their releases, or connect another tool above.</p></div>':'<p class="kv">The app catalogue has not been verified yet.</p>';
        roots.updates.querySelector('[data-u="connection"]').innerHTML=info?`<p>Update service ${esc(info.version)} is connected. Releases come from your configured package source.</p><p class="kv">Last checked: ${checkedAt?esc(checkedAt.toLocaleString()):'Not yet checked'}. External tools, including directory-only integrations, keep their own update process.</p><details><summary>Operator details</summary><p class="kv">The installer and its package source are maintained with the release CLI. Publish a tested bundle once; Hub and CLI updates then use that same release. Initial controller setup and installer updates remain operator tasks.</p><dl><dt>Update service</dt><dd class="mono">${esc(info.me)}</dd><dt>Release source</dt><dd class="mono">${esc(info.pantryId)}</dd></dl><p><a href="./update-operations.md" target="_blank" rel="noopener">Operator instructions ↗</a></p></details>`:'<p>An operator needs to connect the update service once. Existing apps and directory sync continue to work.</p>';
        paintHistory(); paintProgress();
        for(const root of Object.values(roots))root.querySelectorAll('[data-u="reload"],[data-u="history-refresh"]').forEach(b=>b.disabled=busy||loading);
        onInventory(recipes, {available,checkedAt});
      }
      function paintHistory() {
        roots.history.querySelector('[data-u="history"]').innerHTML=jobs.length?jobs.map(j=>`<details class="release-history"><summary><span>${esc(({verify:'Verification',install:'Installation',update:'Update',cook:'Workspace setup',refresh:'Connection check'})[j.kind]||j.kind)} ${esc(recipeById(j.recipeId)?.name||j.recipeId)} · ${esc(j.version)}</span><span class="pill ${j.state==='done'?'on':j.state==='failed'?'warn':''}">${j.state==='done'?'Complete':j.state==='failed'?'Needs attention':'In progress'}</span><time>${esc(new Date(Number(j.startedAt/1000000n)).toLocaleString())}</time></summary>${steps(j)}<p class="kv">Operation ${j.id} · initiated by ${esc(j.by)}</p></details>`).join(''):'<div class="card"><h4>No operations recorded yet</h4><p>CLI and Hub operations through this update service appear here. Older direct deployments can be checked with Verify.</p></div>';
      }
      const steps=j=>`<ol class="release-steps">${j.steps.map(s=>`<li class="${esc(s.status)}"><span aria-hidden="true">${s.status==='ok'?'✓':s.status==='fail'?'!':s.status==='run'?'●':'·'}</span><div><b>${esc(s.name)}</b>${s.detail?`<p>${esc(s.detail)}</p>`:''}</div></li>`).join('')}</ol>`;
      function paintProgress() {
        roots.updates.querySelector('[data-u="progress"]').innerHTML=activeJob?`<section class="card release-progress" aria-live="polite"><div class="update-toolbar"><h3>${activeJob.state==='running'?'Working on':activeJob.state==='done'?'Complete:':'Review needed:'} ${esc(recipeById(activeJob.recipeId)?.name||activeJob.recipeId)}</h3><span class="pill">${esc(activeJob.version)}</span></div>${steps(activeJob)}</section>`:'';
      }
      async function load(force=false) {
        if(disposed || busy || !owner())return;
        const request=++generation;loading=true;available=false;paint();notice('Checking published releases and installed components…');
        try {
          const client=await service();if(request!==generation||disposed)return;
          if(!client){api=null;recipes=[];info=null;paint();notice('Updates are not connected yet. Ask the operator to connect the update service.',true);return;}
          api=client;
          const [next,history,details]=await Promise.all([force?api.checkForUpdates():api.recipes(),api.listJobs(),api.info()]);
          if(request!==generation||disposed)return;
          if(!next.length)throw Error('No published releases could be checked. Ask the operator to publish a release bundle.');
          if(next.some(r=>typeof r.state!=='string'))throw Error('Update the installer to 0.7.0 or later before using this page. Existing apps are unaffected.');
          available=true;recipes=next;jobs=history;info=details;checkedAt=new Date();
          activeJob=history.find(j=>j.state==='running')||activeJob;
          loading=false;paint();notice('');
          if(activeJob?.state==='running')watch(activeJob.id);
        } catch(e) {if(request===generation&&!disposed){available=false;paint();notice(e?.message||'The update service could not be reached. Retry the check.',true);}}
        finally {if(request===generation){loading=false;for(const root of Object.values(roots))root.querySelectorAll('[data-u="reload"],[data-u="history-refresh"]').forEach(b=>b.disabled=busy);}}
      }
      function review(r, installing=false) {
        if(busy || loading || !available || !owner())return;
        document.getElementById('releaseReview')?.remove();
        const dialog=document.createElement('dialog');dialog.id='releaseReview';dialog.className='release-review';
        const repair=r.state==='repair'||r.state==='modified';
        dialog.innerHTML=`<form method="dialog"><button class="release-close" aria-label="Close review">×</button></form><span class="perm-eyebrow">${installing?'ADD AN APP':repair?'REVIEW INSTALLED RELEASE':'SOFTWARE UPDATE'}</span><h2>${esc(r.name)}</h2><p class="lead">${installing?`Install version ${esc(r.version)}`:`${esc(r.runningVersion)} → ${esc(r.version)}`}</p>${repair?`<p>${esc(r.detail)}</p>`:''}<pre class="release-notes">${esc(r.notes||'No release notes published.')}</pre><p class="kv">${installing?'Creates the app and connects it to this Hub. Review its roles in Permissions before the first employee sign-in.':'Saves backend and frontend snapshots, preserves your sign-in configuration, then verifies the complete release. The app may pause briefly. No automatic data rollback is performed.'}</p><p data-review-status role="status"></p><div class="btnrow"><button type="button" data-review-cancel>Cancel</button><button type="button" class="primary" data-review-start>${installing?'Install app':repair?'Apply & verify release':'Update & verify'}</button></div>`;
        document.body.append(dialog);dialog.querySelector('[data-review-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
        dialog.querySelector('[data-review-start]').onclick=async()=>{if(busy)return;dialog.querySelector('[data-review-start]').disabled=true;const ok=await start(installing?'install':'update',r.id,r.releaseId);if(ok)dialog.close();else{dialog.querySelector('[data-review-start]').disabled=false;dialog.querySelector('[data-review-status]').textContent=lastError||'The operation was not started.';}};
        dialog.showModal();
      }
      async function start(kind,id,releaseId) {
        let started=false;lastError="";
        if(busy||!owner()||!api)return false;
        busy=true;++generation;paint();notice('Starting the operation…');
        try {
          const result=await (kind==='verify'?api.verifyInstalled(id):api.applyRelease({id,releaseId,install:kind==='install'}));
          if(!result.ok){lastError=result.detail||'The operation was refused.';notice(lastError,true);return false;}
          started=true;location.hash='#/apps/updates';watch(result.jobId);return true;
        }catch(e){lastError=e?.message||'Could not start the operation.';notice(lastError,true);return false;}
        finally {if(!started)busy=false;paint();}
      }
      function watch(id) {
        clearTimeout(timer);
        const tick=async()=>{
          if(disposed)return;
          try {
            const j=opt(await api.job(id));if(!j)throw Error('Operation not found. Refresh history.');
            activeJob=j;busy=j.state==='running';paint();
            if(busy){timer=setTimeout(tick,2500);return;}
            await load(true);notice(j.state==='done'?'Release verified. Reload an open app to use its latest interface.':'The operation needs attention. Review the failed step before retrying.',j.state!=='done');
            if(j.state==='done')onInstalled(j);
          }catch(e){busy=false;available=false;paint();notice(e?.message||'Progress is temporarily unavailable. Refresh history to reconnect.',true);}
        };tick();
      }
      async function click(e) {
        const b=e.target.closest('[data-u]');if(!b)return;
        const key=b.dataset.u,r=recipeById(b.dataset.id);
        if(key==='reload')await load(true);
        else if(key==='history-refresh')await load(false);
        else if(key==='connect')connectExisting();
        else if(r&&(key==='review'||key==='install'))review(r,key==='install');
        else if(r&&key==='verify')await start('verify',r.id);
      }
      shell();for(const root of Object.values(roots))root.addEventListener('click',click);
      if(!owner())for(const root of Object.values(roots))root.innerHTML='<p class="kv">Hub owners manage software releases. Your application permissions are unchanged.</p>';
      return {load, inventory:()=>recipes, dispose(){disposed=true;++generation;clearTimeout(timer);for(const root of Object.values(roots))root.removeEventListener('click',click);}};
    }
  };
})();
