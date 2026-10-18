/* Operations screens: a separate aggregate capability, never a Hub login. */
(() => {
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={'desk-workboard':'Desk + Workboard',workboard:'Workboard',desk:'Desk',trust:'Trust',assets:'Assets',contracts:'Contracts',watch:'Watch'};
  const descriptions={desk:'Internal ticket counts and service targets',trust:'Fleet scores and reporting coverage',assets:'Inventory, stock and preparation',contracts:'Decision dates and ownership coverage',watch:'Domain alerts and monitoring coverage'};
  const ns=n=>Number(n/1000000n), date=n=>new Date(ns(n)).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
  const number=n=>n>=100000?new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(n):n.toLocaleString();
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const storageKey='ks-operations-display-v1';
  const tvURL=()=>new URL('./#/tv',location.href).href;
  function createManager(root,getAPI){
    let active=false,epoch=0;
    const $=s=>root.querySelector(s);
    async function load(){
      active=true;const run=++epoch;
      root.innerHTML='<p role="status">Checking screen management…</p>';
      try{
        const admin=await getAPI().operationsDisplayAdmin();if(!active||run!==epoch)return;
        if(!admin.canManage){root.innerHTML='<a href="#/operations">← Operations</a><h2>Screens are managed by Hub owners.</h2><p>Use Operations for the sources available to your account.</p>';return;}
        const sources=(await getAPI().operationsSources()).filter(s=>names[s.app]);if(!active||run!==epoch)return;
        root.innerHTML=`<a href="#/operations" class="screen-back">← Operations</a><header class="ops-heading"><div><div class="ops-eyebrow">SHARED SCREENS</div><h2>The big picture. Safely shared.</h2><p class="lead">Choose what a screen can show, and for how long.</p></div><a class="screen-button" href="${esc(tvURL())}" target="_blank" rel="noopener noreferrer">Open TV view ↗</a></header>
        <div class="screen-setup"><div><h3>Pair a screen</h3><ol><li>Open <strong>${esc(tvURL())}</strong> on the TV.</li><li>Enter the code shown on that screen.</li><li>Choose the areas safe to share in this room.</li></ol><p class="screen-note">A screen gets a separate read-only key, never your Hub session. Names, ticket text, device serials, departures and employee sales stay off the TV. Small counts can still be sensitive.</p></div>
        <form data-pair><label>Screen code<input name="code" autocomplete="off" spellcheck="false" placeholder="ABCDE · 12345" required maxlength="13"></label><label>Screen name<input name="screenName" placeholder="IT team room" required maxlength="60"></label><fieldset><legend>Show these areas</legend>${sources.map(s=>`<label class="screen-scope"><input type="checkbox" name="scope" value="${s.cid}"><span><strong>${names[s.app]}</strong><small>${descriptions[s.app]}</small></span></label>`).join('')||'<p>No supported sources. Connect your apps first.</p>'}${sources.some(s=>s.app==='desk')?'<label class="screen-scope"><input type="checkbox" name="workboard"><span><strong>Include Workboard with Desk</strong><small>Shared project totals only. Personal tasks stay private.</small></span></label>':''}</fieldset><label>Allow access for<select name="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label><button type="submit" ${sources.length?'':'disabled'}>Approve this screen</button><p data-message role="status"></p></form></div>
        <section class="screen-list"><div class="ops-section-heading"><h3>Approved screens</h3><button data-reload type="button">Refresh</button></div><p class="screen-note">Revocation blocks new reads immediately. An online screen checks access every 15 seconds and clears its display within 30 seconds without confirmation. Expired screens must be paired again.</p>${admin.displays.length?admin.displays.map(d=>`<article><div><strong>${esc(d.name)}</strong><p>${d.sources.map(s=>names[s.app]||'Unavailable source').join(' · ')}</p><small>${d.active?'Expires':'Inactive · expiry'} ${date(d.expiresAt)}</small></div><button type="button" data-revoke="${d.id}">${d.active?'Revoke':'Remove'}</button></article>`).join(''):'<div class="screen-empty">No screens approved yet.</div>'}</section>`;
        $('[data-reload]').onclick=load;
        $('[data-pair]').onsubmit=async e=>{
          e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]'),message=$('[data-message]');
          const code=form.elements.code.value.replace(/[\s·-]/g,'').toLowerCase(),label=form.elements.screenName.value.trim();
          const cids=Array.from(form.querySelectorAll('[name=scope]:checked'),x=>BigInt(x.value));
          if(!/^[0-9a-f]{10}$/.test(code)||!label||!cids.length){message.textContent='Enter the code from the TV, a name and at least one area.';return;}
          const workboard=Boolean(form.elements.workboard?.checked);
          if(workboard&&!sources.some(s=>s.app==='desk'&&cids.includes(s.cid))){message.textContent='Select Desk to include its Workboard.';return;}
          button.disabled=true;message.textContent='Approving this screen…';
          try{
            const result=workboard?await getAPI().operationsDisplayApproveWithWorkboard(code,label,cids,BigInt(form.elements.days.value),true):await getAPI().operationsDisplayApprove(code,label,cids,BigInt(form.elements.days.value));if(!active||epoch!==run)return;
            if('ok' in result){await load();$('[data-message]').textContent='Screen approved. It will connect automatically.';}
            else message.textContent=({denied:'Your Owner access or source permissions changed. Refresh this page.',missing:'This code expired or was already used. Generate a new code on the TV.',limit:'Remove an unused screen before pairing another.',invalid:'Check the code, name and selected areas.'})[Object.keys(result)[0]]||'Approval was not completed. Refresh to check the screen list.';
          }catch{if(active&&epoch===run)message.textContent='Could not confirm approval. Refresh the screen list before trying again.';}
          finally{button.disabled=false;}
        };
        root.querySelectorAll('[data-revoke]').forEach(button=>button.onclick=async()=>{
          button.disabled=true;
          try{if(!await getAPI().operationsDisplayRevoke(BigInt(button.dataset.revoke)))throw Error();if(active&&run===epoch)await load();}
          catch{if(active&&run===epoch){button.disabled=false;button.textContent='Retry revoke';}}
        });
      }catch{if(active&&epoch===run)root.innerHTML='<a href="#/operations">← Operations</a><p role="status">Screen management could not load. Check the connection and reopen this page.</p>';}
    }
    return {load,stop(){active=false;epoch++;root.replaceChildren();}};
  }
  const expected={desk:['active','unassigned','breached'],trust:['total','passing','attention','unverified','assessed','score'],assets:['total','stock','assigned','preparing'],contracts:['total','due','overdue','unknown','unowned'],watch:['enabled','alerts','warnings','stale','expiring','unknown','expiryDays']};
  // Counts newer app releases add; an older app without them is still a valid source (treated as 0).
  const optional={assets:['deployed'],contracts:['seatsHeld']};
  expected['desk-workboard']=[...expected.desk,'workProjects','workOpen','workWaiting','workOverdue','workUnowned','workSteps','workStepsDone'];
  function parsed(app,result,now){
    if(result?.schema!==1n||!result.state||!('ready' in result.state))return null;
    const at=ns(result.checkedAt);if(!Number.isFinite(at)||at>now+5000||now-at>90000)return null;
    const base=app==='desk-workboard'?'desk':app,extra=optional[base]||[];
    const m=Object.create(null);for(const[k,v]of result.metrics||[]){if((!expected[app].includes(k)&&!extra.includes(k))||k in m)return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0)return null;m[k]=n;}
    if(expected[app].some(k=>!(k in m)))return null;
    for(const k of extra)if(!(k in m))m[k]=0;
    return {at,m};
  }
  function summary(app,m){
    switch(app){
      case 'desk':return {value:m.active,unit:'open requests',detail:'Internal support',rows:[[m.breached,'past their service target'],[m.unassigned,'without an agent']],flag:m.breached+m.unassigned,focus:'requests need an owner or response'};
      case 'workboard':return {value:m.workOpen,unit:'open project tasks',detail:`${m.workProjects} shared projects · own tasks only`,rows:[[m.workOverdue,'past their target date'],[m.workWaiting,'waiting on something'],[m.workUnowned,'without an available owner']],flag:m.workOverdue+m.workWaiting+m.workUnowned,focus:'review project dates, blockers and ownership',note:`${m.workStepsDone} of ${m.workSteps} subtasks complete · dates use UTC`};
      case 'trust':return {value:m.assessed?m.score:'—',unit:'verified device score',detail:m.total?`${m.assessed} of ${m.total} devices fully assessed`:'No devices enrolled yet',rows:[[m.attention,'with failing checks'],[m.unverified,'not fully verified']],flag:m.attention+m.unverified,focus:'check failures and missing evidence',bar:m.total?m.assessed/m.total:0};
      case 'assets':return {value:m.stock,unit:'devices ready in stock',detail:`${m.total} registered · ${m.assigned} assigned${m.deployed?` · ${m.deployed} deployed`:''}`,rows:[[m.preparing,'received, still being prepared']],flag:m.preparing,focus:'hardware needs preparation'};
      case 'contracts':return {value:m.due,unit:'decisions in the next 30 days',detail:`${m.total} active or cancelling contracts`,rows:[[m.overdue,'decision dates passed'],[m.unowned,'without an active owner'],[m.unknown,'decision dates unknown'],[m.seatsHeld,'with seats held by departed people']],flag:m.overdue+m.unowned+m.unknown+m.seatsHeld,focus:'review decisions, ownership and leftover seats'};
      case 'watch':return {value:m.alerts,unit:'domains with alerts',detail:`${m.enabled} domains monitored`,rows:[[m.warnings,'monitoring warnings'],[m.stale,'checks late or unsuccessful'],[m.unknown,'expiry dates unverified']],flag:m.alerts+m.warnings+m.stale+m.unknown+m.expiring,focus:'review domain evidence and expiry',note:`${m.expiring} expiring within ${m.expiryDays} days`};
    }
  }
  // Quiet backdrop for the wall screen: a sparse rain of glyphs and a few soft sparks, drawn at ~24 fps
  // on a canvas behind the cards. Off entirely with reduced motion, while hidden, and without canvas support.
  function createBackdrop(canvas){
    if(reducedMotion()||typeof requestAnimationFrame!=='function'||typeof canvas.getContext!=='function')return ()=>{};
    const ctx=canvas.getContext('2d');if(!ctx)return ()=>{};
    const glyphs='0123456789ABCDEF<>=+/·|';
    let w=0,h=0,cell=24,columns=[],sparks=[],last=0,frame=0,stopped=false;
    const rand=(a,b)=>a+Math.random()*(b-a);
    const column=(x,fresh)=>({x,head:fresh?rand(-h,h):-rand(0,h),speed:rand(.3,.8)*cell,len:Math.round(rand(8,22)),seed:Math.floor(rand(0,1000)),wait:fresh?0:rand(2000,14000)});
    const spark=()=>({x:rand(0,w),y:rand(0,h),r:rand(.6,2.2),t:rand(0,8000),life:rand(5000,11000)});
    function size(){
      const box=canvas.parentElement.getBoundingClientRect();
      w=canvas.width=Math.max(1,Math.round(box.width));h=canvas.height=Math.max(1,Math.round(box.height));
      cell=Math.max(18,Math.round(w/80));
      columns=Array.from({length:Math.floor(w/cell)},(_,i)=>column(i*cell+cell/2,true)).filter(()=>Math.random()<.45);
      sparks=Array.from({length:Math.round(w/60)},spark);
      ctx.font=`${Math.round(cell*.62)}px ${getComputedStyle(canvas).getPropertyValue('--ks-mono')||'monospace'}`;ctx.textAlign='center';ctx.textBaseline='middle';
    }
    function draw(now){
      if(stopped)return;frame=requestAnimationFrame(draw);
      if(document.hidden){last=0;return;}
      const dt=last?Math.min(120,now-last):0;if(last&&dt<40)return;last=now;
      ctx.clearRect(0,0,w,h);
      for(const c of columns){
        if(c.wait>0){c.wait-=dt;continue;}
        c.head+=c.speed*dt/1000;
        if(c.head-c.len*cell>h){Object.assign(c,column(c.x,false));continue;}
        for(let i=0;i<c.len;i++){
          const y=c.head-i*cell;if(y<-cell||y>h+cell)continue;
          const a=i===0?.5:.3*(1-i/c.len);
          ctx.fillStyle=`rgba(143,211,167,${a.toFixed(3)})`;
          ctx.fillText(glyphs[(c.seed+Math.floor(y/cell)*7+i*3)%glyphs.length],c.x,y);
        }
      }
      for(const s of sparks){
        s.t+=dt;if(s.t>s.life)Object.assign(s,spark(),{t:0});
        const k=Math.sin(Math.PI*s.t/s.life),a=.7*k;if(a<=0)continue;
        s.y-=dt*.004;
        const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*4);g.addColorStop(0,`rgba(214,231,206,${a.toFixed(3)})`);g.addColorStop(1,'rgba(214,231,206,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.x,s.y,s.r*4,0,Math.PI*2);ctx.fill();
      }
    }
    size();window.addEventListener('resize',size);frame=requestAnimationFrame(draw);
    return ()=>{stopped=true;cancelAnimationFrame(frame);window.removeEventListener('resize',size);};
  }
  const reducedMotion=()=>{try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return true;}};
  function createTV(root,api,options={}){
    const now=options.now||Date.now,storage=options.storage||localStorage;
    let secret='',code='',pairExpires=0,state=null,entries=[],generation=0,closed=false,stateBusy=false,metricBusy=false,lastCheck=0,lastMetrics=0,lastCards=new Map(),poll,aging,idle;
    const $=s=>root.querySelector(s);
    root.className='tv-surface';
    root.innerHTML='<canvas class="tv-backdrop" aria-hidden="true"></canvas><header class="tv-header"><div><span class="tv-brand">kebabstack / operations</span><h1 data-title>One screen. Your stack.</h1></div><div class="tv-clock"><time data-clock></time><span data-date></span><span data-expiry></span></div></header><section data-stage></section><footer class="tv-footer"><div class="tv-status"><span class="tv-live" aria-hidden="true"></span><span data-status role="status">Preparing this screen…</span></div><div class="tv-controls"><button type="button" data-fullscreen>Full screen</button><button type="button" data-forget>Disconnect</button></div></footer>';
    $('[data-fullscreen]').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}catch{$('[data-status]').textContent='Full screen is unavailable. Use your browser’s full-screen control.';}};
    $('[data-forget]').onclick=()=>forget();
    // Controls stay out of the way on a wall screen; a touch, pointer or key brings them back for a moment.
    function wake(){root.classList.add('tv-awake');clearTimeout(idle);idle=setTimeout(()=>root.classList.remove('tv-awake'),6000);}
    root.addEventListener('pointermove',wake);root.addEventListener('pointerdown',wake);root.addEventListener('keydown',wake);wake();
    const stopBackdrop=createBackdrop($('.tv-backdrop'));
    function readStorage(){try{const s=JSON.parse(storage.getItem(storageKey)||'null');if(/^[0-9a-f]{64}$/.test(s?.secret)){secret=s.secret;code=/^[0-9a-f]{10}$/.test(s.code)?s.code:'';}}catch{}}
    function save(){storage.setItem(storageKey,JSON.stringify({secret,code}));}
    function clock(){const t=new Date(now());$('[data-clock]').textContent=t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});$('[data-date]').textContent=t.toLocaleDateString([], {weekday:'long',day:'numeric',month:'long'});}
    function reset(message,canPair=false){
      state=null;entries=[];generation++;metricBusy=false;lastMetrics=0;lastCards=new Map();root.dataset.live='';
      $('[data-title]').textContent='One screen. Your stack.';$('[data-expiry]').textContent='';
      $('[data-stage]').innerHTML=`<div class="tv-pair"><span class="tv-kicker">OPERATIONS DISPLAY</span><h2>${esc(message)}</h2><p>No company data is shown until this screen has current approval.</p>${canPair?'<button type="button" data-new>Generate pairing code</button>':''}</div>`;
      $('[data-status]').textContent='Read-only screen · no Hub session';
      if(canPair)$('[data-new]').onclick=pair;
    }
    function pairing(expires){
      pairExpires=expires;state=null;entries=[];lastCards=new Map();root.dataset.live='';
      const printed=code?code.toUpperCase().slice(0,5)+' · '+code.toUpperCase().slice(5):'New code needed';
      $('[data-stage]').innerHTML=`<div class="tv-pair"><span class="tv-kicker">PAIR THIS SCREEN</span><h2>Your IT, at a glance.</h2><p>On your own computer, open Hub → Operations → Screens.</p><strong class="tv-code">${esc(printed)}</strong><p>Enter this code and choose what this room may see.</p><small data-countdown></small></div>`;
      $('[data-status]').textContent='Waiting for a Hub Owner to approve this screen';
    }
    async function pair(){
      if(closed||stateBusy)return;
      generation++;stateBusy=true;reset('Creating a pairing code…');const next=generation;
      try{
        secret=hex(crypto.getRandomValues(new Uint8Array(32)));code=hex(crypto.getRandomValues(new Uint8Array(5)));
        // Verify persistent storage before requesting approval; no key is ever put in a URL.
        save();const hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))));
        const result=await bounded(api.operationsDisplayPair(code,hash));if(closed||next!==generation)return;
        if('ok' in result)pairing(ns(result.ok));else reset('Pairing is busy. Try again shortly.',true);
      }catch{if(!closed&&next===generation)reset('Pairing could not start. Check browser storage and connection.',true);}
      finally{stateBusy=false;}
    }
    function bounded(promise){let timeout;return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),20000);})]).finally(()=>clearTimeout(timeout));}
    function card(e){
      const head=`<span class="tv-kicker">${names[e.app]}</span>`;
      if(!e.data)return {cls:'tv-card tv-unverified',flag:false,value:null,html:`${head}<strong class="tv-number">—</strong><h2>${e.waiting?'Checking source':'Source unverified'}</h2><p>${e.waiting?'Reading current totals…':'No current totals. Check this app in Hub.'}</p>`};
      const p=summary(e.app,e.data.m),n=typeof p.value==='number'?number(p.value):p.value;
      return {cls:'tv-card',flag:p.flag>0,value:typeof p.value==='number'?p.value:null,html:`${head}<strong class="tv-number">${n}</strong><h2>${p.unit}</h2><p>${p.detail}</p>${p.bar===undefined?'':`<div class="tv-bar" aria-label="Assessment coverage ${Math.round(p.bar*100)}%"><span style="width:${Math.max(0,Math.min(100,p.bar*100))}%"></span></div>`}<div class="tv-rows">${p.rows.map(([n,t])=>`<div><strong class="${n?'tv-flag':''}">${number(n)}</strong><span>${t}</span></div>`).join('')}</div>${p.note?`<small>${p.note}</small>`:''}<time class="tv-checked">Checked ${new Date(e.data.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time>`};
    }
    function focusCard(views,checked){
      const focus=views.filter(e=>e.data&&summary(e.app,e.data.m).flag>0),complete=checked===entries.length;
      const clear=!focus.length&&complete;
      return {cls:'tv-card tv-focus'+(clear?' tv-clear':''),flag:false,value:null,html:`<span class="tv-kicker">THE NEXT CONVERSATION</span><h2>${clear?'All clear':'Where to focus'}</h2>${focus.length?`<div class="tv-signals">${focus.map(e=>`<div class="tv-signal"><strong>${names[e.app]}</strong><span>${summary(e.app,e.data.m).focus}</span></div>`).join('')}</div>`:`<p>${complete?'No follow-up flags in the approved sources.':'Check source coverage before drawing conclusions.'}</p>`}<small>Current snapshots · overlapping counts are not added up</small>`};
    }
    // Numbers glide to their new value instead of jumping; the first paint shows the final value at once.
    function tween(el,from,to){
      const n=el.querySelector('.tv-number');if(!n||typeof to!=='number'||typeof from!=='number'||from===to||to>=100000||reducedMotion()||typeof requestAnimationFrame!=='function')return;
      const start=performance.now(),duration=700;
      const step=t=>{if(closed||!n.isConnected)return;const k=Math.min(1,(t-start)/duration),v=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));n.textContent=number(v);if(k<1)requestAnimationFrame(step);else n.textContent=number(to);};
      requestAnimationFrame(step);
    }
    function paint(){
      if(!state||closed||document.hidden)return;
      $('[data-title]').textContent=state.name;$('[data-expiry]').textContent='Access ends '+date(state.expiresAt);root.dataset.live='on';
      const checked=entries.filter(e=>e.data).length;
      const views=entries.flatMap(e=>e.app==='desk-workboard'?[{...e,app:'desk'},{...e,app:'workboard'}]:[e]);
      const cards=views.map(e=>({key:`${e.cid}:${e.app}`,...card(e)}));
      cards.push({key:'focus',...focusCard(views,checked)});
      const grid=$('[data-stage] .tv-grid');
      const sameShape=grid&&grid.children.length===cards.length&&cards.every((c,i)=>grid.children[i].dataset.key===c.key);
      if(!sameShape){
        lastCards=new Map(cards.map(c=>[c.key,c]));
        $('[data-stage]').innerHTML=`<div class="tv-grid" data-count="${cards.length}">${cards.map(c=>`<article class="${c.cls}" data-key="${c.key}" data-flag="${c.flag}">${c.html}</article>`).join('')}</div>`;
      }else cards.forEach((c,i)=>{
        const previous=lastCards.get(c.key);if(previous&&previous.html===c.html&&previous.cls===c.cls)return;
        const el=grid.children[i];el.className=c.cls;el.dataset.flag=String(c.flag);el.innerHTML=c.html;lastCards.set(c.key,c);
        if(previous&&previous.value!==c.value){el.classList.remove('tv-changed');void el.offsetWidth;el.classList.add('tv-changed');tween(el,previous.value,c.value);}
      });
      $('[data-status]').textContent=`${checked} of ${entries.length} approved sources checked · read only`;
    }
    async function metrics(){
      if(!state||metricBusy||closed||document.hidden)return;
      metricBusy=true;lastMetrics=now();const run=generation;
      await Promise.all(entries.map(async e=>{
        let result=null;try{result=parsed(e.app,await bounded(api.operationsDisplaySnapshot(secret,e.cid)),now());}catch{}
        if(run!==generation||!state||closed||document.hidden)return;
        e.data=result;e.waiting=false;paint();
      }));
      if(run===generation)metricBusy=false;
    }
    async function check(){
      if(closed||document.hidden||stateBusy||!secret)return;
      stateBusy=true;const run=generation;
      try{
        const result=await bounded(api.operationsDisplayState(secret));if(closed||run!==generation||document.hidden)return;
        if('pending' in result){pairing(ns(result.pending));return;}
        if(!result.ready){reset('This screen is no longer approved.',true);return;}
        const value=result.ready,at=ns(value.checkedAt);
        if(!Number.isFinite(at)||at>now()+5000||now()-at>=30000||ns(value.expiresAt)<=now()||!value.sources.length||value.sources.length>5||value.sources.some(s=>!expected[s.app])||new Set(value.sources.map(s=>String(s.cid))).size!==value.sources.length)throw Error('invalid state');
        lastCheck=at;pairExpires=0;
        const changed=!state||state.id!==value.id||JSON.stringify(state.sources,(_,v)=>typeof v==='bigint'?String(v):v)!==JSON.stringify(value.sources,(_,v)=>typeof v==='bigint'?String(v):v);
        if(changed){generation++;metricBusy=false;entries=value.sources.map(s=>({...s,data:null,waiting:true}));lastMetrics=0;}
        state=value;paint();if(now()-lastMetrics>=60000)void metrics();
      }catch{if(!closed&&run===generation)reset('Connection paused. Rechecking access…');}
      finally{stateBusy=false;}
    }
    function age(){
      clock();if(state&&(now()-lastCheck>=30000||ns(state.expiresAt)<=now())){reset('Access confirmation expired. Reconnecting…');void check();}
      if(state){let changed=false;for(const e of entries)if(e.data&&now()-e.data.at>90000){e.data=null;e.waiting=false;changed=true;}if(changed)paint();}
      if(pairExpires){const left=Math.max(0,Math.ceil((pairExpires-now())/1000));if($('[data-countdown]'))$('[data-countdown]').textContent=`Code expires in ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;if(left===0){pairExpires=0;reset('This pairing code expired.',true);}}
    }
    async function forget(){const old=secret;secret='';code='';pairExpires=0;try{storage.removeItem(storageKey);}catch{}reset('This screen is disconnected.',true);if(old)try{await bounded(api.operationsDisplayForget(old));}catch{$('[data-status]').textContent='Key removed here. Revoke the screen in Hub to confirm removal while offline.';}}
    function visibility(){if(document.hidden){reset('Display paused while hidden.');}else void check();}
    document.addEventListener('visibilitychange',visibility);
    readStorage();clock();reset('Checking this screen’s access…',!secret);
    if(secret)void check();else reset('A clear view for your team.',true);
    poll=setInterval(check,options.pollInterval??15000);aging=setInterval(age,1000);
    return {check,forget,destroy(){closed=true;generation++;clearInterval(poll);clearInterval(aging);clearTimeout(idle);stopBackdrop();document.removeEventListener('visibilitychange',visibility);root.replaceChildren();}};
  }
  window.KebabDisplays={createManager,createTV};
})();
