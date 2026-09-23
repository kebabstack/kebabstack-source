import { domainState, domainCounts, groupEvents, eventCategory, first } from "./workspace.js";
import { canonicalDestination } from "./canonical-url.js";
import { idlFactory } from "./idl.js";
import { appSignIn, takeHubTicket, session, mountTopbar, topbarIdlFactory } from "./hub-client.js";

// deploy-time constants (the kitchen patches them on install; INSTALL.md for the CLI path)
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const HUB_URL = "__HUB_URL__";
const IC_HOST = "https://icp0.io";
session.key = "ks-watch-session";

const signIn = appSignIn({ name: "Watch", hubUrl: HUB_URL });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (o) => (o && o.length ? o[0] : null);
const nsToMs = (ns) => Number(BigInt(ns) / 1000000n);
const fmt = (ns) => new Date(nsToMs(ns)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00Z"); return isNaN(d) ? iso : d.toLocaleDateString([], { dateStyle: "medium", timeZone: "UTC" }); };
const daysTo = (iso) => { const d = new Date(iso + "T00:00:00Z"); return isNaN(d) ? null : Math.round((d - Date.now()) / 86400000); };
const ago = (ns) => {
  if (!Number(ns)) return "never";
  const s = Math.round((Date.now() - nsToMs(ns)) / 1000);
  if (Math.abs(s) < 60) return "just now";
  const m = Math.round(s / 60); if (Math.abs(m) < 60) return m + " min ago";
  const h = Math.round(m / 60); if (Math.abs(h) < 48) return h + " h ago";
  return Math.round(h / 24) + " d ago";
};
const n1 = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
const setStatus = (id, cls, text) => { if (id === "loginStatus") signIn.status(cls, text); const el = $(id); if (!el) return; el.className = "status " + (cls || ""); el.textContent = text || ""; };
const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"];
// working-page words: plain, no DNS vocabulary (that lives in "How it works")
const STATUS_WORD = { ok: "as expected", changed: "changed", disagree: "answers still differ (settling)", unresolved: "no answer", nxdomain: "name not found", dangling: "points to a name that no longer exists", baseline: "first check pending" };
const KIND_WORD = { baseline: "first check", learned: "new address learned", accepted: "accepted", resolved: "settled", improved: "protection improved", posture: "protection weakened", cert: "certificate", names: "names seen in certificates", lookalike: "similar name registered", expiry: "expiry warning", error: "problem", changed: "changed", dangling: "broken link", added: "added", edited: "edited", removed: "removed", alert: "alert sent", test: "test alert", report: "monthly report" };
const kindWord = (k) => KIND_WORD[k] || k;

let backend, hubActor = null, hubInfo = null, topbar = null, me = null, curId = 0, curRow = null, boardCache = [];

// ---------- the shared topbar (brand · app · menu · bell · theme · person) — one component for the whole suite ----------
function mountBar() {
  if (!me) return;
  const person = { email: me.email, displayName: me.displayName, role: me.role };
  if (topbar) { topbar.setPerson(person); topbar.setApp({ eyebrow: me.orgName || "" }); return; }
  topbar = mountTopbar($("topbar"), {
    hub: { actor: () => hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
    app: { id: "watch", name: "Watch", eyebrow: me.orgName || "" },
    person,
    onSignOut: signOut,
  });
}

// ---------- routing: #/overview · #/add · #/d/<id> · #/evidence · #/settings · #/docs ----------
function route() {
  if (!me) return;
  const h = location.hash.replace(/^#\/?/, "");
  const [view, arg] = h.split("/");
  const admin = me.role === "admin";
  let v = view || "overview";
  if (currentView === 'settings' && v !== 'settings' && settingsDirty()) {
    if (!confirm('Discard your unsaved settings?')) { history.replaceState(null,'','#/settings'); return; }
    settingsReady=false;
  }
  viewEpoch++; currentView=v;
  const known = admin ? ["overview", "activity", "add", "d", "evidence", "settings", "docs"] : ["overview", "activity", "d", "evidence", "docs"];
  if (!known.includes(v)) v = "overview";
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "v-" + (v === "d" ? "domain" : v)));
  document.querySelectorAll("#nav .tab").forEach((el) => el.classList.toggle("active", el.dataset.view === v || (v === "d" && el.dataset.view === "overview")));
  if (v === "overview") loadOverview();
  if (v === "activity") loadActivity();
  if (v === "add") { setStatus("aStatus", "", ""); paintTypeChips("aTypes", TYPES); aWatchers = []; paintTags("aWatchTags", aWatchers); }
  if (v === "d") loadDomain(Number(arg));
  if (v === "evidence") loadEvidence();
  if (v === "settings") loadSettings();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
const navIcons={overview:'<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c4 5 4 11 0 16-4-5-4-11 0-16Z"/>',activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',evidence:'<path d="M6 3h8l4 4v14H6zM9 11h6M9 15h6"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',docs:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3M12 17h.01"/>'};
function renderNav() {
  const items=[['overview','Domains'],['activity','Activity'],['evidence','Reports'],...(me.role==='admin'?[['settings','Settings']]:[])];
  const link=([v,l])=>`<a class="tab" href="#/${v}" data-view="${v}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${navIcons[v]}</svg>${l}</a>`;
  $('nav').innerHTML='<p class="nav-label">WORKSPACE</p>'+items.map(link).join('')+'<div class="nav-help">'+link(['docs','How Watch works'])+'</div>';
  mountBar();
}

// ---------- boot / session ----------
async function refreshMe() { const w = opt(await backend.whoami(session.load())); if (!w) return false; const changed = !me || me.role !== w.role; if (me && w.role !== 'admin') settingsReady = false; me = w; if (changed) { renderNav(); if (currentView) route(); } else mountBar(); return true; }
async function boot() {
  const { HttpAgent, Actor } = await import("./agent-bundle.js");
  const agent = await HttpAgent.create({ host: IC_HOST });
  backend = Actor.createActor(idlFactory, { agent, canisterId: BACKEND_CANISTER_ID });
  try { const info = await backend.info(); hubInfo = info; const destination = canonicalDestination(info.appUrl, location.href); if (destination) { session.clear(); location.replace(destination); return; } if (info.hubId) hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId }); if (info.orgName) $("loginSub").textContent = `${info.orgName} · watch`; if (!info.hubSet) { $("loginWarn").classList.remove("hidden"); $("loginWarn").textContent = "This app is not connected to your company Hub yet. Contact your IT team."; } } catch (e) {}
  const ticket = takeHubTicket();
  if (ticket) { session.clear(); setStatus("loginStatus", "", "signing in…"); const r = opt(await backend.loginWithTicket(ticket)); if (r) { session.save(r.token); session.saveSuite(r.suiteToken || ""); } else setStatus("loginStatus", "err", "the hub ticket was not accepted — try again from the hub"); }
  if (session.load() && (await refreshMe())) {
    $("login").style.display = "none"; $("layout").classList.add("on");
    if (!location.hash || location.hash === "#/" || location.hash === "#") location.hash = "#/overview"; else route();
    setInterval(async () => { try { if (await refreshMe()) return; } catch (_) {} signOut(); setStatus("loginStatus", "err", "Your access could not be confirmed. Check the Hub connection and sign in again from the Hub."); }, 30000);
  } else session.clear();
}
function signOut() { const t = session.load(); session.clear(); if (t) backend.signOut(t).catch(() => {}); me = null; viewEpoch++; domainRequest++; settingsReady=false; if (topbar) { topbar.destroy(); topbar = null; } $("layout").classList.remove("on"); $("login").style.display = "grid"; setStatus("loginStatus", "", "signed out"); }
$("loginBtn").onclick = () => signIn.continue();

// ---------- shared bits ----------
function typeSummary(rootId) { const on = chipsOn(rootId); const sum = document.querySelector(`[data-sum="${rootId}"]`); if (sum) sum.textContent = `Record types: ${on.length === TYPES.length ? "all 7" : on.length ? on.join(", ") : "none"} · change`; }
function paintTypeChips(rootId, on) { $(rootId).innerHTML = TYPES.map((t) => `<button class="chip ${on.includes(t) ? "on" : ""}" data-t="${t}">${t}</button>`).join(""); $(rootId).onclick = (e) => { const c = e.target.closest(".chip"); if (c) { c.classList.toggle("on"); typeSummary(rootId); } }; typeSummary(rootId); }
const chipsOn = (rootId) => [...$(rootId).querySelectorAll(".chip.on")].map((c) => c.dataset.t);
function attachPicker(inputId, listId, onPick) {
  const input=$(inputId),list=$(listId);let timer=0,revision=0;
  input.oninput=()=>{clearTimeout(timer);const request=++revision,q=input.value.trim(),epoch=viewEpoch;list.classList.add('hidden');if(!q)return;
    timer=setTimeout(async()=>{try{const rows=await backend.directory(session.load(),q);if(request!==revision||epoch!==viewEpoch)return;list.innerHTML=rows.map(r=>`<button type="button" data-email="${esc(r.email)}">${esc(r.displayName||r.email)}<small>${esc(r.email)}${r.department?' · '+esc(r.department):''}</small></button>`).join('')||'<p class="kv">No matching colleagues.</p>';list.classList.remove('hidden');}catch(e){if(request===revision&&epoch===viewEpoch){list.textContent='Directory unavailable. Try again.';list.classList.remove('hidden');}}},180);
  };
  list.onclick=e=>{const b=e.target.closest('[data-email]');if(!b)return;input.value='';list.classList.add('hidden');onPick(b.dataset.email);input.focus();};
  input.onkeydown=e=>{if(e.key==='ArrowDown'){list.querySelector('button')?.focus();e.preventDefault();}if(e.key==='Escape')list.classList.add('hidden');};
  list.onkeydown=e=>{if(e.key==='Escape'){list.classList.add('hidden');input.focus();}};
  document.addEventListener('click',e=>{if(e.target!==input&&!list.contains(e.target))list.classList.add('hidden');});
}
function paintTags(rootId, list, onChange) { $(rootId).innerHTML = list.map((e) => `<span class="tag">${esc(e)}<button type="button" data-rm="${esc(e)}" aria-label="Remove ${esc(e)}" title="remove">×</button></span>`).join(""); $(rootId).onclick = (ev) => { const b = ev.target.closest("[data-rm]"); if (!b) return; const i = list.indexOf(b.dataset.rm); if (i >= 0) list.splice(i, 1); paintTags(rootId, list, onChange); if (onChange) onChange(); }; }
const onEnter = (inputId, fn) => { $(inputId).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fn(); } }); };
const evClass = (k) => (["changed", "dangling", "expiry", "error", "posture", "cert", "lookalike"].includes(k) ? "alert" : ["accepted", "resolved", "baseline", "learned", "improved"].includes(k) ? "good" : "");
const SET_TYPES = ["A", "AAAA"]; // known-address sets: geo/anycast answers differ per resolver
const vals = (xs) => (xs.length ? xs.map(esc).join("<br>") : "<i>(none)</i>");
let ownerMap = {}; // ip -> operator name, for the open domain
const withOwner = (v, bold) => { const o = ownerMap[v]; return `${bold ? `<b>${esc(v)}</b>` : esc(v)}${o ? ` <span class="own">${esc(o)}</span>` : ""}`; };
const valsOwned = (xs, expected) => (xs.length ? xs.map((v) => withOwner(v, expected && !expected.includes(v))).join("<br>") : "<i>(none)</i>");

// ---------- overview & activity ----------
let summaryCache = {}, boardFilter = 'all', activityCache = [], viewEpoch = 0, currentView = '';
const errorText = e => String(e?.message || e).slice(0, 240);
const pill = state => `<span class="pill ${state.state === 'alert' ? 'off' : state.state === 'warn' ? 'warn' : state.state === 'ok' ? 'on' : ''}">${esc(state.label)}</span>`;
async function action(button, statusId, operation, done) {
  if (button.disabled) return;
  button.disabled = true; const epoch = viewEpoch;
  setStatus(statusId, '', 'Working…');
  try {
    const r = await operation();
    if (epoch !== viewEpoch || !me) return;
    setStatus(statusId, r.ok ? 'ok' : 'err', r.detail || (r.ok ? 'Saved.' : 'Could not complete this action.'));
    if (r.ok && done) await done(r);
  } catch (e) { if (epoch === viewEpoch) setStatus(statusId, 'err', errorText(e)); }
  finally { button.disabled = false; }
}
function paintBoard() {
  const counts=domainCounts(boardCache,summaryCache), q=$('domainSearch').value.toLowerCase().trim();
  $('compFacts').innerHTML = [['all','All domains'],['attention','Need attention'],['expiring','Expiring soon'],['paused','Paused']].map(([key,label])=>`<button class="fact ${key}" data-filter="${key}" aria-pressed="${boardFilter===key}"><span class="n">${counts[key]}</span><span class="l">${label}</span></button>`).join('');
  $('compFacts').querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{boardFilter=b.dataset.filter;paintBoard();$('compFacts').querySelector(`[data-filter="${boardFilter}"]`).focus();});
  const order={alert:0,warn:1,pending:2,ok:3,paused:4};
  const rows=boardCache.map(row=>({row,s:domainState(row,summaryCache)})).filter(({row,s})=>(boardFilter==='all'||boardFilter==='paused'&&!row.domain.enabled||boardFilter==='attention'&&s.attention||boardFilter==='expiring'&&s.expiring)&&`${row.domain.name} ${row.domain.note}`.toLowerCase().includes(q)).sort((a,b)=>order[a.s.state]-order[b.s.state]||a.row.domain.name.localeCompare(b.row.domain.name));
  $('boardCount').textContent=`${rows.length} of ${boardCache.length} domains`;
  $('board').innerHTML=rows.length?rows.map(({row:r,s})=>`<a class="dom w-${s.state}" href="#/d/${r.domain.id}" data-id="${r.domain.id}"><span class="state-dot" aria-hidden="true"></span><div><div class="nm">${esc(r.domain.name)}</div><div class="ln">${esc(s.title)}${s.state!=='paused'&&s.issues.length>1?` · +${s.issues.length-1} more`:''}</div></div><div class="side">${pill(s)}<div>Last DNS check ${esc(ago(r.domain.lastCheck))}</div></div><span class="chevron" aria-hidden="true">›</span></a>`).join(''):`<div class="empty"><b>${boardCache.length?'No matching domains':'Your watch starts here'}</b>${boardCache.length?'Try another filter or search.':`Add your first domain to start monitoring.${me.role==='admin'?' <a href="#/add">Watch a domain →</a>':''}`}</div>`;
}
$('domainSearch').oninput=paintBoard;
async function loadOverview() {
  const epoch=viewEpoch;
  $('board').innerHTML='<div class="empty">Loading domains…</div>';
  $('ovActions').innerHTML=me.role==='admin'?'<button id="ovCheck">Check all now</button><a href="#/add" class="button primary">+ Watch a domain</a><span id="ovStatus" class="status" role="status"></span>':'';
  try {
    const [rows,result]=await Promise.all([backend.listDomains(session.load()),backend.summary(session.load())]);
    if(epoch!==viewEpoch)return;
    const s=opt(result);if(!s)throw Error('Monitoring status is unavailable. Refresh the page to retry.');
    boardCache=rows;summaryCache=s;paintBoard();
    const last=opt(s.lastRun), stale=!last||Date.now()-nsToMs(last.at)>Math.max(Number(s.intervalMins)*3,30)*60000;
    $('compCard').className='monitor'+(!Number(s.enabled)?' off':stale?' warn':'');
    $('compHead').textContent=!rows.length?'Ready for your first domain':!Number(s.enabled)?'Monitoring paused':s.busy?'A check is running':stale?'Monitoring needs a check':'Scheduled monitoring is on';
    $('compSub').textContent=rows.length?`${Number(s.enabled)} active · DNS every ${s.intervalMins} min · last run ${last?ago(last.at):'not yet completed'}`:'DNS, registry and security checks in one place.';
    if($('ovCheck')){$('ovCheck').disabled=!Number(s.enabled)||s.busy;$('ovCheck').onclick=()=>action($('ovCheck'),'ovStatus',()=>backend.checkNow(session.load(),[]),async r=>{await loadOverview();setStatus('ovStatus',Number(r.run?.problems)?'err':'ok',r.detail);});}
  } catch(e){if(epoch!==viewEpoch)return;boardCache=[];$('compFacts').innerHTML='';$('boardCount').textContent='';$('compHead').textContent='Could not load monitoring';$('compSub').textContent='';$('board').innerHTML=`<div class="empty">${esc(errorText(e))}<div class="btnrow"><button id="ovRetry">Try again</button></div></div>`;$('ovRetry').onclick=loadOverview;}
}
function eventRows(rows) {
  return groupEvents(rows).map(({event:e,domain,count,firstAt})=>`<article class="ev ${evClass(e.kind)}"><span class="dot" aria-hidden="true"></span><div><div class="what">${domain?`<a href="#/d/${e.domainId}">${esc(domain)}</a> · `:''}<b>${esc(kindWord(e.kind))}</b>${e.rtype?` · ${esc(e.rtype)}`:''}${count>1?` <span class="pill">${count} occurrences</span>`:''}</div>${e.detail||e.before.length||e.after.length?`<details><summary>${e.kind==='error'?'Check diagnostics':'Event details'}</summary><div class="diagnostic">${esc(e.detail)}</div>${e.before.length||e.after.length?`<div class="row"><div><label>Before</label><div class="vals">${vals(e.before)}</div></div><div><label>After</label><div class="vals">${vals(e.after)}</div></div></div>`:''}</details>`:''}<div class="meta">${esc(fmt(e.at))}${count>1?` · first ${esc(fmt(firstAt))}`:''}${e.by?` · ${esc(e.by)}`:''}</div></div></article>`).join('')||'<div class="empty">No activity in this view.</div>';
}
function paintActivity(){const q=$('activitySearch').value.toLowerCase().trim(), filter=$('activityFilter').value;const rows=activityCache.filter(({event:e,domain})=>(filter==='all'||eventCategory(e.kind)===filter)&&`${domain} ${e.detail} ${kindWord(e.kind)} ${e.rtype}`.toLowerCase().includes(q));$('activityRows').innerHTML=eventRows(rows);$('activityCount').textContent=`Showing ${rows.length} of the latest ${activityCache.length} events. Identical consecutive check failures are grouped.`;}
$('activitySearch').oninput=paintActivity;$('activityFilter').onchange=paintActivity;$('actRefresh').onclick=()=>loadActivity();
async function loadActivity(){const epoch=viewEpoch;$('activityRows').innerHTML='<div class="empty">Loading activity…</div>';try{const rows=await backend.recentEvents(session.load(),500n);if(epoch!==viewEpoch)return;activityCache=rows;paintActivity();}catch(e){if(epoch===viewEpoch){$('activityRows').textContent=errorText(e);$('activityCount').textContent='Refresh to retry.';}}}

// ---------- add ----------
let aWatchers = []; const firstCheckNotes = new Map();
attachPicker("aWatch", "aWatchList", (email) => { if (!aWatchers.includes(email)) aWatchers.push(email); paintTags("aWatchTags", aWatchers); });
onEnter("aName", () => $("aSave").click());
$("aSave").onclick = async () => {
  const name = $("aName").value.trim().toLowerCase();
  if (!name) return setStatus("aStatus", "err", "a domain name is needed");
  setStatus("aStatus", "", "adding…"); $("aSave").disabled = true;
  try {
    const r = await backend.addDomain(session.load(), { name, types: chipsOn("aTypes"), watchers: aWatchers, note: $("aNote").value.trim() });
    if (!r.ok) { setStatus("aStatus", "err", r.detail); return; }
    setStatus("aStatus", "", "Domain added. Recording the first DNS answers…");
    let firstCheck = ''; try { const check = await backend.checkNow(session.load(), [BigInt(r.id)]); if (!check.ok) firstCheck = check.detail; } catch (e) { firstCheck = errorText(e); }
    if (firstCheck) firstCheckNotes.set(Number(r.id), firstCheck);
    $("aName").value = ""; $("aNote").value = ""; aWatchers = []; paintTags("aWatchTags", aWatchers);
    if (currentView === "add") location.hash = "#/d/" + Number(r.id);
  } catch (e) { setStatus("aStatus", "err", String(e.message || e).slice(0, 140)); }
  finally { $("aSave").disabled = false; }
};

// ---------- domain ----------
let eWatchers=[],domainRequest=0;
attachPicker('eWatch','eWatchList',email=>{if(!eWatchers.includes(email))eWatchers.push(email);paintTags('eWatchTags',eWatchers);});
async function loadDomain(id, opts={}) {
  const request=++domainRequest,epoch=viewEpoch,keep=opts.keepEdit&&curId===id;curId=id;
  if(!keep){curRow=null;$('dName').textContent='Loading…';$('dPills').innerHTML='';$('dActions').innerHTML='<span id="dStatus" class="status" role="status"></span>';$('dContent').classList.add('hidden');$('dNext').classList.add('hidden');$('dEditCard').classList.add('hidden');}
  try {
    if(!Number.isSafeInteger(id)||id<1)throw Error('This domain could not be found.');
    const [result,s]=await Promise.all([backend.getDomain(session.load(),BigInt(id)),backend.summary(session.load())]);
    if(request!==domainRequest||epoch!==viewEpoch||!me)return;
    const d=opt(result);if(!d)throw Error('This domain is no longer watched, or your access has changed.');
    summaryCache=opt(s)||summaryCache;curRow=d.row;const dom=d.row.domain,admin=me.role==='admin',state=domainState(d.row,summaryCache);
    ownerMap={};for(const o of d.owners||[])ownerMap[o.ip]=o.org||o.owner;
    if(firstCheckNotes.has(id)){setStatus('dStatus','err','Domain added. First check needs attention: '+firstCheckNotes.get(id));firstCheckNotes.delete(id);}
    $('dName').textContent=dom.name;$('dPills').innerHTML=pill(state);$('dContent').classList.remove('hidden');
    const notice=$('dStatus').textContent,noticeClass=$('dStatus').className;
    $('dActions').innerHTML=(admin?`<button id="dCheck" ${!dom.enabled?'disabled':''}>Check now</button><button id="dEdit">Edit domain</button>`:'')+`<span id="dStatus" class="${esc(noticeClass)}" role="status">${esc(notice)}</span>`;
    const issue=dom.enabled?state.issues[0]:null;
    $('dNext').classList.toggle('hidden',state.state==='ok');$('dNext').classList.toggle('warn',state.attention);
    $('dNext').innerHTML=`<p class="eyebrow">${dom.enabled?'NEXT STEP':'MONITORING PAUSED'}</p><b>${esc(state.title)}</b><p>${esc(issue?.detail||(!dom.enabled?'Previous findings are retained. Resume monitoring in Edit domain to receive fresh checks.':'The first run establishes your baseline. Daily security checks follow automatically.'))}</p>${issue?`<button id="dGo">${esc(issue.action)} ↓</button>`:''}`;
    if($('dGo'))$('dGo').onclick=()=>{const el=$(issue.target);el.scrollIntoView?.({behavior:'smooth',block:'start'});el.tabIndex=-1;el.focus({preventScroll:true});};
    const meta=(label,value)=>`<div class="meta-item"><small>${label}</small>${value}</div>`;
    $('dMeta').innerHTML=meta('Last DNS check',esc(ago(dom.lastCheck)))+meta('Domain registration',dom.expiresAt?`Expires ${esc(fmtDay(dom.expiresAt))}`:'Expiry not available')+meta('Also notified',d.watcherNames.length?esc(d.watcherNames.join(', ')):'No additional watchers')+(dom.note?meta('Note',esc(dom.note)):'')+`<details class="section-detail"><summary>Monitoring details</summary>${meta('Record types',esc(dom.types.join(', ')))}${meta('Added',esc(fmt(dom.createdAt))+' · '+esc(dom.createdBy))}${dom.expiryDetail?meta('Registry response',esc(dom.expiryDetail)):''}<p class="kv">Administrator alerts follow Watch settings. Domain dates and checks can be incomplete.</p></details>`;
    if(admin){
      $('dCheck').onclick=()=>action($('dCheck'),'dStatus',()=>backend.checkNow(session.load(),[BigInt(id)]),async r=>{await loadDomain(id,{keepEdit:true});setStatus('dStatus',Number(r.run?.problems)?'err':'ok',r.detail);});
      $('dEdit').onclick=()=>{paintTypeChips('eTypes',dom.types);eWatchers=[...(d.watcherEmails||[])].filter(Boolean);paintTags('eWatchTags',eWatchers);$('eNote').value=dom.note;$('eEnabled').checked=dom.enabled;$('dEditCard').classList.remove('hidden');setStatus('eStatus','','');$('eNote').focus();};
    }
    $('dRecords').innerHTML=d.row.records.length?d.row.records.map(r=>{
      const setMode=SET_TYPES.includes(r.rtype),extra=setMode?r.expected.filter(x=>!r.values.includes(x)):[],failed=/resolvers unreachable|resolver check unavailable|resolvers disagree/i.test(r.detail),review=r.status!=='ok'||failed;
      return `<details class="rec ${esc(r.status)}" ${review?'open':''}><summary><span class="rt">${esc(r.rtype)}</span><span>${esc(failed?'Check unavailable · last-known answers':STATUS_WORD[r.status]||r.status)}</span></summary><div class="record-body">${r.status==='changed'?`<div class="row"><div><label>${setMode?'Known addresses':'Accepted answer'}</label><div class="vals">${valsOwned(r.expected)}</div></div><div><label>Current answer</label><div class="vals">${valsOwned(r.values,r.expected)}</div></div></div>`:`<div class="vals">${valsOwned(r.values)}</div>`}${extra.length?`<p class="kv">Other known addresses: ${esc(extra.join(', '))}</p>`:''}${r.status==='dangling'?'<p class="kv">Fix the missing target with your DNS provider, then check again. A broken target cannot be accepted as healthy.</p>':''}${r.detail?`<details class="section-detail"><summary>Check diagnostics</summary><p class="diagnostic">${esc(r.detail)}</p></details>`:''}<p class="footnote">Last attempt ${esc(ago(r.lastSeen))}</p>${admin&&dom.enabled&&!failed&&r.status==='changed'?`<button class="primary" data-accept="${esc(r.rtype)}">Accept expected change</button>`:''}${admin&&dom.enabled&&!failed&&setMode&&r.status==='ok'&&extra.length?`<button data-trim="${esc(r.rtype)}">Forget unused addresses</button>`:''}</div></details>`;
    }).join(''):'<div class="empty">No DNS answers yet. The first check will establish the baseline.</div>';
    for(const b of $('dRecords').querySelectorAll('[data-accept]'))b.onclick=()=>action(b,'dStatus',()=>backend.acceptChange(session.load(),BigInt(id),b.dataset.accept),()=>loadDomain(id,{keepEdit:true}));
    for(const b of $('dRecords').querySelectorAll('[data-trim]'))b.onclick=()=>{if(confirm('Forget known addresses that are not currently returned? If they return later, Watch may flag them as new.'))action(b,'dStatus',()=>backend.trimKnown(session.load(),BigInt(id),b.dataset.trim),()=>loadDomain(id,{keepEdit:true}));};
    paintPosture(d,admin);$('dEvents').innerHTML=eventRows(d.events.slice(0,4).map(event=>({event,domain:''})));
    $('dHistoryLink').onclick=()=>{$('activitySearch').value=dom.name;$('activityFilter').value='all';};
  } catch(e){if(request!==domainRequest||epoch!==viewEpoch)return;curRow=null;$('dName').textContent='Domain unavailable';$('dActions').innerHTML='';$('dPills').innerHTML='';$('dContent').classList.add('hidden');$('dEditCard').classList.add('hidden');$('dNext').classList.remove('hidden');$('dNext').innerHTML=`<p>${esc(errorText(e))}</p><button id="dRetry">Try again</button>`;$('dRetry').onclick=()=>loadDomain(id);}
}
function paintPosture(d,admin) {
  const p=opt(d.posture),c=opt(d.cert),looks=d.lookalikes||[],dom=d.row.domain,checks=first(d.row.checks)||{};
  const item=(name,status,text,extra='')=>`<div class="security-check"><h3>${name}<span class="pill ${status==='Review'?'warn':''}">${esc(status)}</span></h3><p>${text}</p>${extra}</div>`;
  let html='';
  if(p&&Number(p.checkedAt)){
    const mailNa=p.dmarc==='n/a'&&p.spf==='n/a',weak=['none','missing'].includes(p.dmarc)||['open','missing'].includes(p.spf);
    const dm={reject:'DMARC requests rejection of unauthenticated mail.',quarantine:'DMARC requests quarantine of unauthenticated mail.',none:'DMARC monitors mail but does not request blocking.',missing:'No DMARC policy was found.'};
    html+=item('Email policy',mailNa?'Not applicable':weak?'Review':'Checked',mailNa?'This name is not configured for email.':esc(dm[p.dmarc]||'Mail policy could not be determined.'),`<details><summary>Policy details</summary><p class="diagnostic">${esc(`DMARC: ${p.dmarc} · SPF: ${p.spf} · MTA-STS: ${p.mtaSts}`)}</p><p class="kv">Policies guide receiving mail servers; they do not guarantee that all forged mail is blocked.</p></details>`);
    html+=item('Transfer lock',p.lock==='locked'?'On':p.lock==='unlocked'?'Review':'Unknown',p.lock==='locked'?`The registry reports a transfer lock${d.apex?'':` for ${esc(d.registrable)}`}.`:p.lock==='unlocked'?'Enable the transfer lock with your registrar.':'The registry did not provide enough information.');
    html+=item('DNS signing',p.dnssec==='signed'?'Signed':p.dnssec==='unsigned'?'Not detected':'Unknown',p.dnssec==='signed'?'A resolver reported DNSSEC validation.':'Check DNSSEC support with your DNS provider.');
    html+=item('Certificate issuers',p.caa==='set'?'Restricted':p.caa==='missing'?'Unrestricted':'Unknown',p.caa==='set'?'A CAA policy was found.':p.caa==='missing'?'No CAA restriction was found. Consider limiting authorized issuers.':'Issuer restrictions could not be determined.');
    html+=`<p class="footnote">Security checks updated ${esc(ago(p.checkedAt))}</p>`;
  }else html+='<p class="kv">Daily security checks are pending.</p>';
  const failed=!!c?.detail&&/failed|unavailable|error|retry|trapped|could not/i.test(c.detail),success=c&&Number(c.checkedAt);
  const others=(c?.names||[]).filter(n=>n!==dom.name);
  const retry=Number(checks.certificateRetryAt)>Date.now()*1e6?` Next eligible attempt after ${fmt(checks.certificateRetryAt)}.`:'';
  html+=item('Certificate logs',failed?'Review':success?'Checked':'Pending',failed?`The last attempt failed. ${success?`Last successful evidence: ${esc(fmt(c.checkedAt))}.`:'No successful evidence yet.'}${esc(retry)}`:success?`${c.issuers.length?`Issued by ${esc(c.issuers.join(', '))}.`:'No certificates found in the checked logs.'}${c.certEnds?` Newest logged certificate ends ${esc(fmtDay(c.certEnds))}.`:''}`:'Awaiting the first certificate-log check.',`<p class="kv">Public-log evidence does not verify the certificate currently served by your website.</p>${c?.detail?`<details><summary>Check diagnostics</summary><p class="diagnostic">${esc(c.detail)}</p></details>`:''}${others.length?`<details class="names"><summary>${others.length} other names discovered</summary><div class="tags" id="dNames">${others.map(n=>`<span class="tag">${esc(n)}${admin?`<button data-watch="${esc(n)}">Watch</button>`:''}</span>`).join('')}</div></details>`:''}`);
  if(d.apex)html+=item('Similar names',looks.length?'Review':'No findings',looks.length?'Review registered names that resemble your domain.':'No registered lookalikes recorded. Weekly checks cover selected names only.',looks.length?`<div class="tags">${looks.map(l=>`<span class="tag">${esc(l.name)}${admin?`<button data-ignore="${esc(l.name)}" aria-label="Ignore ${esc(l.name)}">Ignore</button>`:''}</span>`).join('')}</div>`:'');
  $('dPosture').innerHTML=html;
  for(const b of $('dPosture').querySelectorAll('[data-watch]'))b.onclick=()=>action(b,'dStatus',()=>backend.addDomain(session.load(),{name:b.dataset.watch,types:TYPES,watchers:[],note:`Discovered in certificates of ${dom.name}`}),r=>{location.hash='#/d/'+r.id;});
  for(const b of $('dPosture').querySelectorAll('[data-ignore]'))b.onclick=()=>{if(confirm(`Ignore ${b.dataset.ignore}? Watch will stop checking this similar name.`))action(b,'dStatus',()=>backend.ignoreLookalike(session.load(),b.dataset.ignore),()=>loadDomain(Number(dom.id),{keepEdit:true}));};
}
$('eCancel').onclick=()=>$('dEditCard').classList.add('hidden');
$('eSave').onclick=()=>{if(!curRow)return;const id=curId;action($('eSave'),'eStatus',()=>backend.updateDomain(session.load(),BigInt(id),{types:chipsOn('eTypes'),watchers:eWatchers,note:$('eNote').value.trim(),enabled:$('eEnabled').checked}),async()=>{await loadDomain(id);setStatus('dStatus','ok','Changes saved.');});};
$('eRemove').onclick=()=>{if(!curRow||!confirm(`Remove ${curRow.domain.name}? Monitoring stops. Historical events are retained.`))return;action($('eRemove'),'eStatus',()=>backend.removeDomain(session.load(),BigInt(curId)),()=>{location.hash='#/overview';});};

// ---------- evidence ----------
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return y && m ? new Date(y, m - 1, 1).toLocaleDateString([], { month: "long", year: "numeric" }) : ym; };
let runsAll = [];
function paintRuns(all) {
  const rows = all ? runsAll : runsAll.slice(0, 20);
  $("runRows").innerHTML = rows.length ? rows.map((r) => `<tr><td class="kv">${esc(fmt(r.at))}</td><td>${Number(r.domains)}</td><td>${Number(r.changes) ? `<span class="pill off">${Number(r.changes)}</span>` : "0"}</td><td>${Number(r.problems) ? `<span class="pill warn">${Number(r.problems)}</span>` : "0"}${r.detail ? ` <span class="kv">${esc(r.detail)}</span>` : ""}</td><td class="kv">${esc(r.by)}</td></tr>`).join("") : '<tr><td colspan="5" class="kv">no checks yet</td></tr>';
  $("runMore").classList.toggle("hidden", all || runsAll.length <= 20);
}
$("runMore").onclick = () => paintRuns(true);
async function loadEvidence() {
  const epoch=viewEpoch; $("repActions").innerHTML=''; $("repRows").textContent="Loading reports…"; $("runRows").innerHTML=""; $("evStatement").textContent="";
  let s = null, runs = [], reports = [];
  try { [s, runs, reports] = await Promise.all([backend.summary(session.load()), backend.listRuns(session.load(), 200n), backend.listReports(session.load())]); } catch (e) { if(epoch===viewEpoch) $("repRows").textContent=errorText(e); return; }
  if(epoch!==viewEpoch)return;
  s = opt(s) || s; if (!s) return;
  const admin = me.role === "admin";
  const since = Number(s.monitoringSince) ? new Date(nsToMs(s.monitoringSince)).toLocaleDateString() : null;
  const lr = opt(s.lastRun);
  const txt = `${me.orgName || 'Your company'} currently has ${s.enabled} active domains out of ${s.domains}, with DNS checks scheduled every ${s.intervalMins} minutes. ${since ? `Monitoring evidence starts ${since}.` : 'No completed checks are recorded yet.'} ${s.runs} runs are logged; the last ran ${lr ? fmt(lr.at) : 'not yet'}. The registry expiry warning is set to ${s.expiryWarnDays} days. Recorded evidence may include gaps or failed checks; review check history alongside the reports.`;
  $("evStatement").textContent = txt;
  $("evCopy").onclick = async () => { try { await navigator.clipboard.writeText(txt); setStatus("evStatus", "ok", "copied"); } catch (e) { setStatus("evStatus", "err", "copy failed — select the text"); } };
  $("evExport").classList.toggle("hidden", !admin); $("evDays").classList.toggle("hidden", !admin); $("evReadOnly").classList.toggle("hidden", admin);
  $("repActions").innerHTML = admin ? `<button id="repNow" class="sm">Create &amp; notify admins</button><span id="repStatus" class="status"></span>` : "";
  if (admin) $("repNow").onclick = () => { if(confirm("Create this month’s report and notify the Watch admins?")) action($("repNow"),'repStatus',()=>backend.reportNow(session.load()),async r=>{await loadEvidence();setStatus('repStatus','ok',r.detail);}); };
  $("repRows").innerHTML = reports.length ? reports.map((r) => `<details class="rep"><summary><b>${esc(monthLabel(r.month))}</b> <span class="kv">· ${n1(Number(r.alerts), "alert", "alerts")} · ${n1(Number(r.accepted), "decision", "decisions")} · ${n1(Number(r.problems), "problem", "problems")} · ${n1(Number(r.runs), "check", "checks")}</span></summary><div class="kv" style="white-space:pre-wrap;line-height:1.65;margin-top:8px">${esc(r.text)}</div><div class="btnrow" style="margin-top:8px"><button class="sm" data-copy="${Number(r.id)}">Copy</button><span class="status" id="repCopy${Number(r.id)}"></span></div></details>`).join("") : `<div class="kv">The first report is written on the first day of next month.${admin ? " You can write one for the month so far." : ""}</div>`;
  $("repRows").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => { const r = reports.find((x) => Number(x.id) === Number(b.dataset.copy)); try { await navigator.clipboard.writeText(r.text); setStatus("repCopy" + b.dataset.copy, "ok", "copied"); } catch (e) { setStatus("repCopy" + b.dataset.copy, "err", "copy failed — select the text"); } }));
  runsAll = runs; paintRuns(false);
}
$("evExport").onclick = async () => {
  setStatus("evStatus", "", "preparing…");
  try { const csv = await backend.exportEvidence(session.load(), BigInt($("evDays").value)); if (!csv) return setStatus("evStatus", "err", "admins only"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `domain-watch-evidence-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); setStatus("evStatus", "ok", "downloaded"); }
  catch (e) { setStatus("evStatus", "err", String(e.message || e).slice(0, 140)); }
};

// ---------- settings: one draft and one save ----------
let sTrusted=[],sSeenAll=[],settingsSnapshot='',settingsReady=false,settingsSaving=false;
const draftSettings=()=>({adminGroup:'',appUrl:$('sAppUrl').value.trim(),orgName:$('sOrg').value.trim(),intervalMins:$('sInterval').value,expiryWarnDays:$('sExpiry').value,notifyAdmins:$('sNotifyAdmins').checked,trustedOperators:[[...sTrusted]]});
function settingsDirty(){return settingsReady&&JSON.stringify(draftSettings())!==settingsSnapshot;}
function paintDirty(){const dirty=settingsDirty();$('sSave').disabled=!dirty||settingsSaving;$('sReset').disabled=!dirty||settingsSaving;setStatus('sStatus','',dirty?'Unsaved changes':'All changes saved');}
function paintTrusted(){paintTags('sTrustedTags',sTrusted,()=>{paintSeen();paintDirty();});}
function stageTrusted(v){v=v.trim();if(v&&!sTrusted.includes(v))sTrusted.push(v);paintTrusted();paintSeen();paintDirty();}
$('sTrustedAdd').onclick=()=>{stageTrusted($('sTrusted').value);$('sTrusted').value='';};onEnter('sTrusted',()=>$('sTrustedAdd').click());
function paintSeen(){const seen=sSeenAll.filter(o=>!sTrusted.some(t=>o.toLowerCase().includes(t.toLowerCase())));$('sSeen').innerHTML=seen.length?'<p class="kv">Recently seen operators · select to add to your draft</p>'+seen.map(o=>`<button type="button" class="chip" data-op="${esc(o)}">${esc(o)}</button>`).join(''):'';for(const b of $('sSeen').querySelectorAll('[data-op]'))b.onclick=()=>stageTrusted(b.dataset.op);}
$('settingsForm').oninput=paintDirty;$('settingsForm').onchange=paintDirty;
window.addEventListener('beforeunload',e=>{if(settingsDirty()){e.preventDefault();e.returnValue='';}});
async function loadSettings(){const epoch=viewEpoch;settingsReady=false;$('settingsFields').disabled=true;$('sSave').disabled=true;$('sReset').disabled=true;setStatus('sStatus','','Loading settings…');
  try{const result=await backend.getSettings(session.load());if(epoch!==viewEpoch)return;const s=opt(result);if(!s)throw Error('Settings are unavailable. Check your Hub access.');
    $('sInterval').value=String(s.intervalMins);$('sExpiry').value=String(s.expiryWarnDays);$('sNotifyAdmins').checked=s.notifyAdmins;$('sAppUrl').value=s.appUrl;$('sOrg').value=s.orgName;sTrusted=[...(s.trustedOperators||[])];sSeenAll=s.operatorsSeen||[];paintTrusted();paintSeen();
    $('sMeta').textContent=`${s.peopleCount} people · ${n1(Number(s.adminCount), "admin", "admins")} · last directory refresh ${ago(s.lastDirectoryPull)}`;
    settingsSnapshot=JSON.stringify(draftSettings());settingsReady=true;$('settingsFields').disabled=false;paintDirty();
    try{const log=await backend.adminLogRows(session.load());if(epoch===viewEpoch)$('logRows').innerHTML=log.map(r=>`<tr><td>${esc(fmt(r.at))}</td><td>${esc(r.who)}</td><td>${esc(r.what)}</td></tr>`).join('')||'<tr><td colspan="3">No admin activity yet.</td></tr>';}catch(e){if(epoch===viewEpoch)$('logRows').innerHTML='<tr><td colspan="3">Admin activity could not be loaded.</td></tr>';}
  }catch(e){if(epoch===viewEpoch){setStatus('sStatus','err',errorText(e));$('sReset').disabled=false;$('sReset').textContent='Try again';}}
}
$('sReset').onclick=()=>{if(!settingsDirty()||confirm('Discard your unsaved settings?')){$('sReset').textContent='Discard changes';loadSettings();}};
$('settingsForm').onsubmit=async e=>{e.preventDefault();if(!settingsReady||settingsSaving||!$('settingsForm').reportValidity())return;const draft=draftSettings(),epoch=viewEpoch; if(draft.appUrl){try{const u=new URL(draft.appUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error();draft.appUrl=u.origin;}catch(_){setStatus('sStatus','err','Enter an HTTPS app origin, such as https://watch.example.com, without a path or sign-in link.');return;}} settingsSaving=true;$('settingsFields').disabled=true;$('sSave').disabled=true;$('sReset').disabled=true;setStatus('sStatus','','Saving…');
  try{const r=await backend.setSettings(session.load(),{...draft,intervalMins:BigInt(draft.intervalMins),expiryWarnDays:BigInt(draft.expiryWarnDays)});if(epoch!==viewEpoch)return;if(r.ok){$('sAppUrl').value=draft.appUrl;settingsSnapshot=JSON.stringify(draft);setStatus('sStatus','ok','Changes saved.');}else setStatus('sStatus','err',r.detail);}
  catch(e){if(epoch===viewEpoch)setStatus('sStatus','err',errorText(e));}
  finally{settingsSaving=false;if(epoch===viewEpoch){$('settingsFields').disabled=false;$('sSave').disabled=!settingsDirty();$('sReset').disabled=!settingsDirty();}}
};
$('sTest').onclick=()=>action($('sTest'),'sTestStatus',()=>backend.testAlert(session.load()));
$('sSync').onclick=()=>action($('sSync'),'sTestStatus',()=>backend.syncNow(session.load()));

boot().finally(() => signIn.ready()).catch(() => setStatus("loginStatus", "err", "Could not load the app. Check your connection and retry from the Hub."));

// Roles are configured in the Hub; the app exposes no local privilege controls.
for (const link of document.querySelectorAll("[data-hub-permissions-link]")) link.href = HUB_URL.replace(/\/$/, "") + "/#/permissions";
