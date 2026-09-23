import { idlFactory } from "./idl.js";
import { canonicalDestination } from "./canonical-url.js";
import { appSignIn, takeHubTicket, session, mountTopbar, topbarIdlFactory } from "./hub-client.js";

// Release executor fills these placeholders in the deployed copy (see INSTALL.md).
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const HUB_URL = "__HUB_URL__"; // hub FRONTEND url, e.g. https://xxxxx.icp.net
const IC_HOST = "https://icp0.io";
session.key = "ks-trust-session";

const signIn = appSignIn({ name: "Trust", hubUrl: HUB_URL });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (o) => (o && o.length ? o[0] : null);
const nsToMs = (ns) => Number(BigInt(ns) / 1000000n);
const fmt = (ns) => new Date(nsToMs(ns)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const ago = (ns) => {
  if (!ns || Number(ns) === 0) return "never";
  const s = Math.round((Date.now() - nsToMs(ns)) / 1000);
  if (Math.abs(s) < 90) return "just now";
  const m = Math.round(s / 60); if (Math.abs(m) < 60) return m + " min ago";
  const h = Math.round(m / 60); if (Math.abs(h) < 48) return h + " h ago";
  return Math.round(h / 24) + " d ago";
};
const setStatus = (id, cls, text) => { if (id === "loginStatus") signIn.status(cls, text); const el = $(id); if (!el) return; el.className = "status " + (cls || ""); el.textContent = text || ""; };
const OS_WORD = { macos: "macOS", windows: "Windows", linux: "Linux", all: "all" };
const hubSettingsAi = () => (HUB_URL.startsWith("https://") ? `${HUB_URL.replace(/\/$/, "")}/#/settings/ai` : "#");
const cleanName = (h) => { h = String(h || "unknown device").trim(); const i = h.indexOf("."); return i > 0 ? h.slice(0, i) : h; };

let backend, hubActor = null, topbar = null, me = null;
let curNode = "", currentDeviceOs = "all", deviceRequest = 0, fleetRequest = 0, enrollRequest = 0, pollGen = 0, viewEpoch = 0, sessionEpoch = 0;
const context = () => { const epoch = viewEpoch, auth = sessionEpoch, token = session.load(); return () => !!me && epoch === viewEpoch && auth === sessionEpoch && token === session.load(); };
function clearPrivateViews() {
  pollGen++; viewEpoch++; sessionEpoch++; curNode = ""; devs = []; checkMeta = {}; chkCatalog = []; chkSel = null; insScript = ""; devFilter = failFilter = statusFilter = "";
  for (const id of ["devRows","stats","failRows","dPosture","dFacts","dRes","qRes","insBox","rmRows","logRows","dOwnerLine","dOwnerList","dActions","recentQ","chkGroups","dName","dMeta","dNext","dPills","dRing","dFactsNote","sSelfId","enrollLine","insHost","sMeta","sAiLine","sOwnMeta","verEff","tuneRows"]) $(id).replaceChildren();
  for (const id of ["dQ","dSql","qQ","qSql","enIn","dOwnerIn","devQ","devOs","devOwner","sAssets","sAppUrl","sGateway","qLabel"]) $(id).value = "";
  $("dOwnerPick").classList.add("hidden");
}
const busy = new WeakSet();
async function action(button, status, work, message = "Saving…") {
  const el = typeof button === "string" ? $(button) : button;
  if (!me || !el || el.disabled || busy.has(el)) return;
  const valid = context(); busy.add(el); el.disabled = true; if(status) setStatus(status,"",message);
  try { await work(valid); } catch { if(valid() && status) setStatus(status,"err","Could not complete this action. Check your connection and try again."); }
  finally { busy.delete(el); el.disabled = false; if(el.id === "chkSave" && me) paintChecks(); }
}
function loadView(work, status) {
  const valid=context(); work().catch(()=>{if(valid())setStatus(status,'err','Could not load this page. Open it again to retry.');});
}

// ---------- the shared topbar (brand · app · menu · bell · theme · person) — one component for the whole suite ----------
function mountBar() {
  if (!me) return;
  const person = { email: me.email, displayName: me.displayName, role: me.role };
  if (topbar) { topbar.setPerson(person); topbar.setApp({ eyebrow: me.orgName || "" }); return; }
  topbar = mountTopbar($("topbar"), {
    hub: { actor: () => hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
    app: { id: "trust", name: "Trust", eyebrow: me.orgName || "" },
    person,
    onSignOut: signOut,
  });
}

// ---------- routing: #/devices · #/d/<nodeKey> · #/checks · #/ask · #/enroll · #/settings · #/docs ----------
const isAdmin = () => me && me.role === "admin";
const isStaff = () => me && (me.role === "admin" || me.role === "helpdesk");
function knownViews() { return isAdmin() ? ["devices", "d", "checks", "ask", "enroll", "settings", "docs"] : ["devices", "d", "checks", "docs"]; }
function route() {
  if (!me) return;
  pollGen++; viewEpoch++;
  const h = location.hash.replace(/^#\/?/, "");
  const [view, arg] = h.split("/");
  let v = view || "devices";
  if (!knownViews().includes(v)) v = "devices";
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "v-" + (v === "d" ? "device" : v)));
  document.querySelectorAll("#nav .tab").forEach((el) => el.classList.toggle("active", el.dataset.view === v || (["d","enroll"].includes(v) && el.dataset.view === "devices")));
  if (v === "devices") loadDevices();
  if (v === "d") { try { loadDevice(decodeURIComponent(arg || "")); } catch { location.hash = "#/devices"; } }
  if (v === "checks") loadView(loadChecks,"chkStatus");
  if (v === "ask") paintAiBanner();
  if (v === "enroll") loadView(loadEnroll,"enStatus");
  if (v === "settings") loadView(loadSettings,"sStatus");
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function renderNav() {
  const items = isAdmin() ? [["devices", "Devices"], ["checks", "Checks"], ["ask", "Investigate"], ["settings", "Settings"], ["docs", "Guide"]]
    : isStaff() ? [["devices", "Devices"], ["checks", "Checks"], ["docs", "Guide"]] : [["devices", "My devices"], ["checks", "Checks"], ["docs", "Guide"]];
  $("nav").innerHTML = items.map(([v, l]) => `<button class="tab" data-view="${v}">${l}</button>`).join("");
  $("nav").onclick = (e) => { const el = e.target.closest(".tab"); if (el) location.hash = "#/" + el.dataset.view; };

  const active = location.hash.split("/")[1] || "devices"; $("nav").querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === active || (b.dataset.view === "devices" && ["d","enroll"].includes(active))));
  $("addDevices").classList.toggle("hidden", !isAdmin()); $("devOwner").classList.toggle("hidden", !isStaff());
  mountBar();
  $("devTitle").textContent = isStaff() ? "Devices" : "My devices";
  $("devLead").textContent = isStaff() ? "See what needs attention, verify the evidence and keep devices in good shape." : "Your work devices, their latest checks and what to do next.";
  $("chkLead").textContent = isAdmin() ? "Choose the checks that matter to your company. Everyone can see what each check reads." : "See what your IT team checks, why it matters and the exact query behind it.";
  $("chkAdminCard").classList.toggle("hidden", !isAdmin());
  $("chkAddCard").classList.toggle("hidden", !isAdmin());
  $("dAskCard").classList.toggle("hidden", !isAdmin());
  paintAiBanner();
}

// ---------- AI banner (the hub told us precisely what is missing) ----------
const hubLaneLink = (st) => (HUB_URL.startsWith("https://") && st && Number(st.connectorId) ? `${HUB_URL}/#/apps/${Number(st.connectorId)}/know` : hubSettingsAi());
function aiReason(st) {
  if (!st || !st.keySet) return `no AI key in the hub yet — an owner sets one under <a href="${hubSettingsAi()}" target="_blank" rel="noopener">the hub's Settings → AI</a>`;
  if (!st.laneGranted) return `the hub has a key, but AI assistance is not enabled for Trust — <a href="${hubLaneLink(st)}" target="_blank" rel="noopener">grant it in the hub</a> (Apps → Trust → What it may know), then use <i>Check connection</i> in Trust Settings`;
  return `the hub has a key and Trust has permission, but the key did not arrive yet — <i>Check connection</i> in Trust Settings`;
}
function paintAiBanner() {
  const off = !me.aiOn;
  $("aiOff").classList.toggle("hidden", !off);
  $("aiRow").classList.toggle("hidden", off);
  $("dAiRow").classList.toggle("hidden", off);
  $("dAiOff").classList.toggle("hidden", !off);
  if (off) { $("aiOff").innerHTML = `<b>Plain-language questions are off:</b> ${aiReason(me.ai)}. You can still write osquery SQL below.`; $("dAiOff").innerHTML = `Plain-language questions are off (${aiReason(me.ai)}) — write osquery SQL below.`; }
}

// ---------- boot / session ----------
async function refreshMe() {
  const token=session.load(),auth=sessionEpoch; const w = opt(await backend.whoami(token));
  if(token!==session.load() || auth!==sessionEpoch) return false;
  if (!w) return false;
  const changed = me && (me.role !== w.role || me.id !== w.id);
  if(changed) clearPrivateViews();
  me = w; renderNav(); if(changed) route(); return true;
}
async function boot() {
  const { HttpAgent, Actor } = await import("./agent-bundle.js");
  const agent = await HttpAgent.create({ host: IC_HOST });
  backend = Actor.createActor(idlFactory, { agent, canisterId: BACKEND_CANISTER_ID });
  try {
    const info = await backend.info();
    if (canonicalDestination(info.appUrl, location.href)) {
      takeHubTicket(); // Restore a saved public route; discard the old-origin ticket.
      location.replace(canonicalDestination(info.appUrl, location.href));
      return;
    }
    if (info.hubId) hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId });
    if (info.orgName) $("loginSub").textContent = `${info.orgName} · trust`;
    if (!info.hubSet) { $("loginWarn").classList.remove("hidden"); $("loginWarn").textContent = "This app is not connected to your company Hub yet. Contact your IT team."; }
  } catch (e) {}
  const ticket = takeHubTicket();
  if (ticket) {
    session.clear(); // A rejected new ticket must never fall back to another account’s old session.
    setStatus("loginStatus", "", "signing in…");
    const r = opt(await backend.loginWithTicket(ticket));
    if (r) { session.save(r.token); session.saveSuite(r.suiteToken || ""); } else setStatus("loginStatus", "err", "the hub ticket was not accepted — try again from the hub");
  }
  if (session.load() && (await refreshMe())) {
    $("login").style.display = "none";
    $("layout").classList.add("on");
    if (!location.hash || location.hash === "#/" || location.hash === "#") location.hash = "#/devices"; else route();
    setInterval(async () => { try { if (await refreshMe()) return; } catch (_) {} signOut(); setStatus("loginStatus", "err", "Your access could not be confirmed. Check the Hub connection and sign in again from the Hub."); }, 30000);
  } else session.clear();
}
function signOut() {
  const t = session.load(); session.clear();
  if (t) backend.signOut(t).catch(() => {});
  clearPrivateViews(); me = null; if (topbar) { topbar.destroy(); topbar = null; } $("layout").classList.remove("on"); $("login").style.display = "grid"; setStatus("loginStatus", "", "signed out");
}
$("loginBtn").onclick = () => signIn.continue();

// ---------- person picker (hub directory) ----------
function attachPicker(inputId, listId) {
  const input = $(inputId), list = $(listId);
  let timer = 0, request = 0;
  input.oninput = () => { clearTimeout(timer); input.dataset.email = ""; const sequence = ++request, valid = context(); timer = setTimeout(async () => {
    const q = input.value.trim();
    if (q.length < 1) { list.classList.add("hidden"); return; }
    let rows; try { rows = await backend.directory(session.load(), q); } catch { return; }
    if(!valid() || sequence !== request || q !== input.value.trim()) return;
    list.innerHTML = rows.map((r) => `<button type="button" data-email="${esc(r.email)}" data-name="${esc(r.displayName)}">${esc(r.displayName || r.email)}<small>${esc(r.email)}${r.department ? " · " + esc(r.department) : ""}</small></button>`).join("") || '<div class="kv" style="cursor:default">nobody in the directory matches</div>';
    list.classList.remove("hidden");
  }, 180); };
  list.onclick = (e) => { const d = e.target.closest("[data-email]"); if (!d) return; input.value = d.dataset.name || d.dataset.email; input.dataset.email = d.dataset.email; list.classList.add("hidden"); };
  input.onblur = () => setTimeout(() => list.classList.add("hidden"), 200);
}

// ---------- fleet / my devices ----------
let devs = [], devFilter = "", failFilter = "", statusFilter = "", checkMeta = {};
const STATES = {passing:["Checks passing","on"],attention:["Needs attention","off"],stale:["Out of date","warn"],pending:["Waiting for checks",""],error:["Check unavailable","warn"],no_checks:["No active checks",""]};
function assessment(d) {
  if(d.assessment) return d.assessment;
  const expected = Object.values(checkMeta).filter(c=>c.enabled && (c.os === "all" || c.os === d.os)).length;
  const old = Date.now()-nsToMs(d.lastSeen)>86400000 || (Number(d.postureAt)>0 && Date.now()-nsToMs(d.postureAt)>86400000);
  const failing = Number(d.failing), pending = Math.max(0,expected-d.posture.length), passed = d.posture.filter(p=>p[1]).length;
  return {state:!expected?'no_checks':old?'stale':failing?'attention':pending?'pending':'passing',expected,passed,failing,pending,stale:old?d.posture.length:0,errors:0};
}
const bucket = d => { const state=assessment(d).state; return state==='passing'?'passing':state==='attention'?'attention':'unverified'; };
const badge = d => {const [label,cls]=STATES[assessment(d).state]||STATES.pending;return `<span class="pill ${cls}">${label}</span>`;};
const deviceIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="3" width="16" height="13" rx="2"/><path d="M2 20h20M9 16v4m6-4v4"/></svg>';
async function loadChecksMeta() {
  if(Object.keys(checkMeta).length) return;
  const valid=context(); const catalog=await backend.checksCatalog(session.load());
  if(valid()) checkMeta=Object.fromEntries(catalog.map(c=>[c.id,c]));
}
async function loadDevices() {
  const sequence=++fleetRequest,view=context(),valid=()=>view() && sequence===fleetRequest; setStatus("devCount","","Refreshing devices…");
  try {
    const [list, stats] = await Promise.all([backend.devices(session.load()),isStaff()?backend.fleetStats(session.load()).then(opt):Promise.resolve(null),loadChecksMeta()]);
    if(!valid()) return; devs=list;
    $("stats").classList.toggle("hidden",!isStaff());
    const box=$("setupBox"); box.classList.add("hidden");
    if(isAdmin() && !stats?.enrollConfigured && !list.length) { box.classList.remove("hidden"); box.innerHTML='Start with one device. <a href="#/enroll">Prepare your installer →</a>'; }
    else if(isAdmin() && list.some(d=>!d.owner)) { box.classList.remove("hidden"); box.innerHTML=`<strong>${list.filter(d=>!d.owner).length} device${list.filter(d=>!d.owner).length===1?'':'s'} without an assigned person.</strong> <a href="#/settings">Check the Assets connection</a> or assign a person on the device.`; }
    const failures=new Map();
    for(const d of list) for(const id of (d.failingChecks||[])) failures.set(id,(failures.get(id)||0)+1);
    $("failCard").classList.toggle("hidden",!isStaff()||!failures.size);
    $("failRows").innerHTML=[...failures].sort((a,b)=>b[1]-a[1]).map(([id,n])=>`<button class="fail" data-check="${esc(id)}"><span class="t">${esc(checkMeta[id]?.title||id)}</span><span class="n">${n} device${n===1?'':'s'} →</span></button>`).join('');
    $("failRows").onclick=e=>{const b=e.target.closest('[data-check]');if(!b)return;failFilter=failFilter===b.dataset.check?'':b.dataset.check;statusFilter='';paintDevices();};
    paintDevices();
  } catch { if(valid()){$("devRows").innerHTML='<div class="empty"><strong>Devices could not be loaded.</strong>Check your connection and use Refresh to try again.</div>';setStatus('devCount','err','Latest data unavailable');} }
}
function paintDevices() {
  if(!me) return;
  const cards=[['','All devices',devs.length],['attention','Needs attention',devs.filter(d=>bucket(d)==='attention').length],['unverified','Not verified',devs.filter(d=>bucket(d)==='unverified').length],['passing','Checks passing',devs.filter(d=>bucket(d)==='passing').length]];
  $("stats").innerHTML=cards.map(([id,label,n])=>`<button class="stat ${statusFilter===id?'active':''}" data-state="${id}" aria-pressed="${statusFilter===id}"><span class="n">${n}</span><span class="l">${label}</span></button>`).join('');
  $("stats").onclick=e=>{const b=e.target.closest('[data-state]');if(b){statusFilter=b.dataset.state;failFilter='';paintDevices();}};
  const q=devFilter.toLowerCase(),os=$("devOs").value,owner=isStaff()?$("devOwner").value:'';
  let list=devs.filter(d=>(!q||[d.hostname,d.hardwareSerial,d.ownerEmail,d.ownerName,OS_WORD[d.os],d.osVersion].join(' ').toLowerCase().includes(q))&&(!os||d.os===os)&&(!owner||!d.owner)&&(!statusFilter||bucket(d)===statusFilter)&&(!failFilter||(d.failingChecks||[]).includes(failFilter)));
  const priority={attention:0,error:1,stale:2,pending:3,no_checks:4,passing:5};
  list.sort((a,b)=>(priority[assessment(a).state]-priority[assessment(b).state])||Number(assessment(b).failing)-Number(assessment(a).failing)||cleanName(a.hostname).localeCompare(cleanName(b.hostname)));
  $("devCount").className='kv';$("devCount").textContent=`${list.length} of ${devs.length} device${devs.length===1?'':'s'}${failFilter?' · failing “'+(checkMeta[failFilter]?.title||failFilter)+'”':''}`;
  $("devClear").classList.toggle('hidden',!q&&!os&&!owner&&!statusFilter&&!failFilter);
  $("devRows").innerHTML=list.map(d=>`<a class="dev" href="#/d/${encodeURIComponent(d.nodeKey)}"><span class="ic">${deviceIcon}</span><span class="t"><b>${esc(cleanName(d.hostname))}${d.demo?' <span class="pill">Sample</span>':''}</b><span>${isStaff()?esc(d.ownerName||'Unassigned')+' · ':''}${esc(OS_WORD[d.os]||d.platform)} ${esc(d.osVersion)}</span></span><span class="r">${badge(d)}<span class="kv">${Number(assessment(d).failing)?`${Number(assessment(d).failing)} to review · `:''}Last contact ${esc(ago(d.lastSeen))}</span></span></a>`).join('')||`<div class="empty"><strong>${devs.length?'No matching devices':isStaff()?'Your first device starts here':'No devices assigned yet'}</strong>${devs.length?'Adjust the filters or clear your search.':isStaff()?'Install the agent on one device and review its first checks.':'Ask your IT team to check the device’s assignment and agent installation.'}${isAdmin()&&!devs.length?'<div class="btnrow" style="justify-content:center"><a class="button-link primary" href="#/enroll">Add a device</a></div>':''}</div>`;
}
$("devQ").oninput=()=>{devFilter=$("devQ").value.trim();paintDevices();};
$("devOs").onchange=$("devOwner").onchange=paintDevices;
$("devRefresh").onclick=loadDevices;
$("devClear").onclick=()=>{devFilter=failFilter=statusFilter='';$("devQ").value=$("devOs").value=$("devOwner").value='';paintDevices();};

// ---------- one device ----------
attachPicker("dOwnerIn", "dOwnerList");
async function loadDevice(nodeKey) {
  curNode=nodeKey; currentDeviceOs="all"; const gen=++pollGen,sequence=++deviceRequest,view=context(),valid=()=>view() && sequence===deviceRequest;
  for(const id of ['dPosture','dFacts','dOwnerLine','dActions','dRes','dPills','dRing']) $(id).replaceChildren();
  $("dName").textContent='Loading device…';$("dMeta").textContent='';$("dOwnerPick").classList.add('hidden');$("dNext").textContent='Checking the latest report…';
  $("dAskCard").classList.add('hidden');$("dSql").value=$("dQ").value='';setStatus('dRunStatus','','');dSource='admin';
  try {
    await loadChecksMeta(); if(!valid()) return;
    const d=opt(await backend.deviceDetail(session.load(),nodeKey)); if(!valid())return;
    if(!d){$("dName").textContent='Device not found';$("dNext").textContent='This device is unavailable or you no longer have access.';$("dAskCard").classList.add('hidden');return;}
    paintDevice(d);$("dAskCard").classList.toggle('hidden',!isAdmin()||d.device.demo);
    if(isStaff()&&!d.device.demo) backend.refreshDeviceInfo(session.load(),nodeKey).catch(()=>{});
    if(!d.info.length&&!d.device.demo) pollFacts(nodeKey,gen);
  } catch {if(valid()){$("dName").textContent='Device unavailable';$("dNext").textContent='Could not load this device. Use Refresh to try again.';}}
}
const CHECK_HELP={Encryption:'Ask IT to verify the disk-encryption policy and recovery-key handling.',Access:'Review the screen-lock and access policy with IT.',Network:'Ask IT to verify the firewall or network setting against company policy.',Updates:'Check the device’s software-update policy and any pending updates.',Apps:'Review the required application and its version with IT.',Logging:'Ask IT to review the configured logging policy.',Security:'Ask IT to verify the applicable security policy.'};
function checkRow(c){
 const state=c.state||'current',current=state==='current',passing=current&&c.pass;
 const evidence=state==='error'?'The agent reported a query error. No verified result.':state==='pending'&&c.detail?'Previous evidence, awaiting a new report: '+c.detail:c.detail||'No evidence returned yet.';
 const label=state==='pending'?'Waiting for result':state==='stale'?'Old result':state==='error'?'Could not check':passing?'Passing':'Needs attention';
 const help=state==='pending'?'Keep the device online so its agent can report this check.':state==='stale'?'Reconnect the device and wait for a fresh check before relying on this result.':state==='error'?'IT should check query support and agent permissions. This is not a confirmed policy failure.':!passing?(CHECK_HELP[c.category]||'Review this check with IT and confirm a fresh result after any fix.'):'';
 return `<div class="check-row tile ${current&&!c.pass?'bad':passing?'ok':''}"><div class="section-heading"><h4>${esc(c.title)}</h4><span class="pill ${current&&!c.pass?'off':passing?'on':'warn'}">${label}</span></div>${help?`<p>${esc(help)}</p>`:''}<details><summary>Evidence &amp; query</summary><p>${Number(c.observedAt)?'Received '+esc(fmt(c.observedAt)):'No individually dated result yet'}</p><p>${esc(evidence)}</p><pre class="codebox">${esc(checkMeta[c.id]?.sql||'Query unavailable')}</pre></details></div>`;
}
function paintDevice(d){
 const v=d.device,a=assessment(v);currentDeviceOs=v.os;
 $("dName").textContent=cleanName(v.hostname);$("dMeta").textContent=`${OS_WORD[v.os]||v.platform} ${v.osVersion}${v.hardwareSerial?' · '+v.hardwareSerial:''}`;
 $("dRing").textContent='Last contact '+ago(v.lastSeen);
 $("dPills").innerHTML=badge(v)+(v.demo?' <span class="pill">Sample device</span>':'')+(!v.configCurrent?' <span class="pill">Agent configuration pending</span>':'');
 const next=a.state==='passing'?['All active checks have recent passing results','Trust will keep checking while this device reports.']:a.state==='attention'?[`${a.failing} check${Number(a.failing)===1?' needs':'s need'} attention`,isAdmin()?'Review the checks below, apply the fix through your normal IT process, then verify the next report.':'Review the checks below with your IT team. Trust reports the result; it does not apply fixes.']:a.state==='stale'?['A fresh report is needed','Keep the device online. One or more checks, or its last contact, are older than 24 hours.']:a.state==='no_checks'?['No active checks for this device','IT needs to select appropriate checks for this operating system.']:a.state==='error'?['Some checks could not run','IT should review query support and permissions. An unavailable check is not a passing result.']:['Waiting for the remaining checks','Keep the device online. The result stays unverified until every active check has answered.'];
 $("dNext").innerHTML=`<span class="next-mark" aria-hidden="true">${a.state==='passing'?'✓':'→'}</span><div><strong>${esc(next[0])}</strong><p>${esc(next[1])}</p></div>`;
 const pending=d.checks.filter(c=>(c.state&&c.state!=='current')||!c.pass),passed=d.checks.filter(c=>(!c.state||c.state==='current')&&c.pass);
 $("dPostureTitle").textContent=`Checks · ${a.passed} of ${a.expected} verified passing`;
 $("dPosture").innerHTML=pending.map(checkRow).join('')+(passed.length?`<details class="inset" ${pending.length?'':'open'}><summary>${passed.length} passing check${passed.length===1?'':'s'}</summary>${passed.map(checkRow).join('')}</details>`:'')+(!d.checks.length?'<p class="kv">No active checks are configured for this operating system.</p>':'');
 const src=v.ownerSource==='assets'?'Managed in Assets':v.ownerSource==='manual'?'Fallback assignment in Trust':'';
 $("dOwnerLine").innerHTML=v.owner?`<strong>${esc(v.ownerName||v.ownerEmail||'Former colleague')}</strong>${v.ownerEmail?`<div class="kv">${esc(v.ownerEmail)}</div>`:''}<p class="kv">${src}${v.ownerSource==='assets'?'. Change the assignment in Assets; Trust refreshes it every 15 minutes.':''}</p>`:`<strong>Unassigned</strong><p class="kv">${isAdmin()?'Check the Assets assignment, or set a fallback person here.':'Your IT team manages this assignment.'}</p>`;
 $("dOwnerPick").classList.toggle('hidden',!isAdmin()||v.ownerSource==='assets');$("dOwnerIn").value='';$("dOwnerIn").dataset.email='';setStatus('dOwnerStatus','','');
 $("dActions").innerHTML=isAdmin()?`<details class="card destructive"><summary>Remove from Trust</summary><p class="kv">Revokes Trust enrolment now. Remove the agent through Iru and save the audit reference afterwards. Device assignment in Assets is unchanged.</p><button id="dRemove">Remove device</button><span id="dRemoveStatus" class="status" role="status"></span></details>`:'';
 if(isAdmin()) $("dRemove").onclick=()=>action('dRemove','dRemoveStatus',async valid=>{if(!confirm(`Stop monitoring ${cleanName(v.hostname)} in Trust? Enrolment is revoked now. Remove the agent through Iru and save its audit reference afterwards.`))return;const r=await backend.removeDevices(session.load(),[v.nodeKey]);if(!valid())return;if(r.ok)location.hash='#/devices';else setStatus('dRemoveStatus','err',r.detail);});
 paintFacts(d);
}
$("dRefresh").onclick=()=>loadDevice(curNode);
function paintFacts(d) {
  const map = {}; d.info.forEach(([id, , json]) => { let rows = []; try { rows = JSON.parse(json); } catch (x) {} map[id] = rows[0] || {}; });
  const facts = [];
  const num = (x) => { const n = Number(x); return isFinite(n) ? n : null; };
  const os = map.os; if (os && (os.name || os.version)) facts.push(["Operating system", `${os.name || ""} ${os.version || ""}${os.build ? " (" + os.build + ")" : ""}`]);
  const hw = map.hardware; if (hw && (hw.hardware_model || hw.cpu_brand)) facts.push(["Hardware", `${hw.hardware_model || ""}${hw.cpu_brand ? " · " + hw.cpu_brand : ""}${hw.physical_memory ? " · " + Math.round(num(hw.physical_memory) / 1073741824) + " GB" : ""}`]);
  const disk = map.disk; if (disk && disk.total_gb != null) facts.push(["Disk", `${num(disk.free_gb)} GB free of ${num(disk.total_gb)} GB`]);
  const up = map.uptime; if (up && up.total_seconds != null) { const dd = num(up.total_seconds) / 86400; facts.push(["Uptime", `${Math.floor(dd)} days`]); }
  const bat = map.battery; if (bat && bat.percent_remaining != null) facts.push(["Battery", `${num(bat.percent_remaining)}%${bat.cycle_count != null ? " · " + num(bat.cycle_count) + " cycles" : ""}`]);
  const user = map.user; if (user && user.user) facts.push(["Logged-in user", user.user]);
  const net = map.net; if (net && net.address) facts.push(["Network (IPv4)", net.address]);
  const agent = map.agent; if (agent && agent.version) facts.push(["osquery agent", "v" + agent.version]);
  $("dFactsNote").textContent = facts.length ? "Last reported facts" : "";
  $("dFacts").innerHTML = facts.length ? `<div class="facts">${facts.map(([l, v]) => `<div class="fact"><div class="fl">${esc(l)}</div><div class="fv">${esc(v)}</div></div>`).join("")}</div>`
    : d.device.demo ? `<div class="kv">A sample device has no live facts.</div>` : `<div class="kv"><span class="livedot"></span>Waiting for the agent’s next report. Offline devices may take longer.</div>`;
}
async function pollFacts(nodeKey, gen) {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (gen !== pollGen) return;
    let d = null; try { d = opt(await backend.deviceDetail(session.load(), nodeKey)); } catch (e) {}
    if (gen !== pollGen || !d) return;
    if (d.info.length) { paintFacts(d); return; }
  }
  if (gen === pollGen) $("dFacts").innerHTML = `<div class="kv">No facts yet — the device may be off or on its first check-in.</div>`;
}
$("dOwnerSave").onclick=()=>action('dOwnerSave','dOwnerStatus',async valid=>{const id=curNode,email=$("dOwnerIn").dataset.email;if(!email)return setStatus('dOwnerStatus','err','Choose a person from the directory.');const r=await backend.setDeviceOwner(session.load(),id,email);if(!valid())return;setStatus('dOwnerStatus',r.ok?'ok':'err',r.ok?'Assignment saved':r.detail);if(r.ok)loadDevice(id);});
$("dOwnerClear").onclick=()=>action('dOwnerClear','dOwnerStatus',async valid=>{const id=curNode;const r=await backend.setDeviceOwner(session.load(),id,'');if(!valid())return;if(r.ok)loadDevice(id);else setStatus('dOwnerStatus','err',r.detail);});
$("dGen").onclick=()=>draftQuery('d');
$("dRun").onclick=()=>runQuery('d');
async function pollResults(id, wrap, gen, single) {
  const start = Date.now();
  for (;;) {
    if (gen !== pollGen) return;
    let r = null; try { r = opt(await backend.queryResults(session.load(), id)); } catch (e) {}
    if (gen !== pollGen) return;
    if (!r) { wrap.innerHTML = ""; return; }
    const ans = Number(r.answered), tot = Number(r.targeted), done = ans >= tot, late = Date.now() - start > 150000;
    const rows = r.rows.map(([, host, json]) => { let pretty = json; try { const arr = JSON.parse(json); pretty = arr.length ? JSON.stringify(arr, null, 1) : "no rows"; } catch (e) {} return `<tr>${single ? "" : `<td><b>${esc(cleanName(host))}</b></td>`}<td><div class="codebox" style="max-height:220px">${esc(pretty)}</div></td></tr>`; }).join("");
    const head = done ? `<span class="pill on">${ans} of ${tot} answered</span>` : late ? `<span class="pill warn">${ans} of ${tot} answered · a device may be off</span>` : `<span class="livedot"></span><span class="kv">waiting for answers… ${ans} of ${tot}</span>`;
    const emptyOnly = done && single && r.rows.length > 0 && (() => { try { return JSON.parse(r.rows[0][2]).length === 0; } catch (e) { return false; } })();
    const hint = emptyOnly ? '<p class="kv">No matching rows were reported. This can also mean the table is unsupported or requires additional permissions; verify before drawing a conclusion.</p>' : '';

    wrap.innerHTML = `<div class="card flat" style="margin-top:12px"><h3>${esc(r.title)}</h3>${head}<div class="table-scroll"><table><tbody>${rows || `<tr><td class="kv">${done ? "no matching rows" : "nothing yet"}</td></tr>`}</tbody></table></div>${hint}</div>`;
    if (done || late) return;
    await new Promise((res) => setTimeout(res, 4000));
  }
}

// ---------- checks ----------
let chkOs = "macos", chkSel = null, chkCatalog = [];
$("chkOs").onclick = (e) => { const b = e.target.closest("[data-os]"); if (!b) return; chkOs = b.dataset.os; paintChecks(); };
async function loadChecks() {
  const valid=context(); const catalog=await backend.checksCatalog(session.load()); if(!valid())return;chkCatalog=catalog;
  checkMeta = {}; chkCatalog.forEach((c) => (checkMeta[c.id] = c));
  paintChecks();
  try {
    const rq = await backend.recentQueries(session.load()); if(!valid())return;
    $("recentQ").innerHTML = rq.map((q) => `<div class="chk"><div class="t"><b>${esc(q.title)}</b> <span class="pill">${q.source === "ai" ? "drafted by AI" : "written by an admin"}</span> <span class="kv">${esc(ago(q.createdAt))}</span><details><summary>View query</summary><code class="sql">${esc(q.sql)}</code></details></div></div>`).join("") || '<div class="kv">none yet</div>';
  } catch (e) {}
}
function paintChecks() {
  $("chkOs").querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.os === chkOs));
  const enabledNow = new Set(chkCatalog.filter((c) => c.enabled).map((c) => c.id));
  const sel = chkSel || new Set(enabledNow);
  const dirty = chkSel && (sel.size !== enabledNow.size || [...sel].some((id) => !enabledNow.has(id)));
  const list = chkCatalog.filter((c) => c.os === chkOs || c.os === "all");
  $("chkSummary").textContent=`${list.filter(c=>sel.has(c.id)).length} of ${list.length} checks selected for ${OS_WORD[chkOs]}`;
  const cats = {}; list.forEach((c) => (cats[c.category] ||= []).push(c));
  $("chkGroups").innerHTML = Object.keys(cats).sort().map((cat) => `<div class="card flat"><h3>${esc(cat)}</h3>${cats[cat].map((c) => `<div class="chk">${isAdmin() ? `<input type="checkbox" data-chk="${esc(c.id)}" ${sel.has(c.id) ? "checked" : ""} aria-label="${esc(c.title)}">` : `<span class="dot ${c.enabled ? "ok" : ""}" title="${c.enabled ? "active" : "not active"}" style="margin-top:6px"></span>`}<div class="t"><b>${esc(c.title)}</b> <span class="pill">level ${Number(c.level)}</span>${c.custom ? ' <span class="pill">yours</span>' : ""}${!isAdmin() && !c.enabled ? ' <span class="kv">not active</span>' : ""}<details><summary>What this checks</summary><p class="kv">Pass rule: ${esc(ruleDescription(c.rule))}</p><code class="sql">${esc(c.sql)}</code></details></div>${isAdmin() && c.custom ? `<button class="sm" data-del="${esc(c.id)}">Delete</button>` : ""}</div>`).join("")}</div>`).join("") || `<div class="card flat"><div class="empty">No checks for ${OS_WORD[chkOs]} yet${isAdmin() ? " — add your own below" : ""}.</div></div>`;
  if (isAdmin()) {
    const save = $("chkSave"); save.disabled = !dirty || busy.has(save); save.textContent = dirty ? "Save changes" : "Saved";
    $("chkGroups").querySelectorAll("[data-chk]").forEach((cb) => (cb.onchange = () => { cb.checked ? sel.add(cb.dataset.chk) : sel.delete(cb.dataset.chk); chkSel = sel; paintChecks(); }));
    $("chkGroups").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>action(b,'chkStatus',async valid=>{if(!confirm("Delete this check?"))return;const r=await backend.deleteCheck(session.load(),b.dataset.del);if(!valid())return;setStatus('chkStatus',r.ok?'ok':'err',r.ok?'Check deleted':r.detail);if(r.ok){chkSel?.delete(b.dataset.del);await loadChecks();}}));
    const pick = (fn) => { chkSel = sel; list.forEach((c) => fn(c) ? sel.add(c.id) : sel.delete(c.id)); paintChecks(); };
    $("chkApply").onclick = () => pick(c => c.custom ? sel.has(c.id) : $("chkPreset").value === 'none' ? false : Number(c.level) <= Number($("chkPreset").value));
    save.onclick = () => action('chkSave','chkStatus',async valid => {
      const submitted=new Set(sel), r=await backend.setChecks(session.load(),[...submitted]);if(!valid())return;
      setStatus('chkStatus',r.ok?'ok':'err',r.detail);
      if(r.ok){chkCatalog=chkCatalog.map(c=>({...c,enabled:submitted.has(c.id)}));checkMeta=Object.fromEntries(chkCatalog.map(c=>[c.id,c]));paintChecks();}
    });
  }
}
function ruleDescription(rule) {const [op,col,...tail]=rule.split(":"),value=tail.join(":");return ({nonEmpty:"At least one row is returned",empty:"No rows are returned"})[op]||`${col} ${{eq:"equals",ne:"differs from (or has no row)",in:"matches one of",le:"is at most",ge:"is at least"}[op]||op} ${value}`;}
$("cOp").onchange = () => { const simple = ["nonEmpty", "empty"].includes($("cOp").value); $("cCol").disabled = simple; $("cVal").disabled = simple; $("cCompare").classList.toggle("hidden",simple); };
$("cSave").onclick = () => action("cSave","cStatus",async valid => {
  if(chkCatalog.some(c=>c.id === $("cId").value.trim())) return setStatus("cStatus","err","That identifier already exists. Choose a new one or leave it empty.");
  const op = $("cOp").value;
  const rule = ["nonEmpty", "empty"].includes(op) ? op : `${op}:${$("cCol").value.trim()}:${$("cVal").value.trim()}`;
  setStatus("cStatus", "", "adding…");
  const id=$("cId").value.trim() || ("custom_"+Date.now().toString(36));
  const r = await backend.addCheck(session.load(), { id, title: $("cTitle").value.trim(), category: $("cCat").value.trim(), os: $("cOs").value, level: BigInt($("cLevel").value), sql: $("cSql").value.trim(), rule });
  if(!valid())return;
  setStatus("cStatus", r.ok ? "ok" : "err", r.ok ? "added and active" : r.detail);
  if (r.ok) { chkSel?.add(id); ["cId", "cTitle", "cCat", "cSql", "cCol", "cVal"].forEach((id) => ($(id).value = "")); await loadChecks(); }
});

// ---------- ask the fleet ----------
let qSource = "admin", dSource = "admin";
$("qSql").oninput = () => { qSource = "admin"; };
$("dSql").oninput = () => { dSource = "admin"; };
async function draftQuery(prefix) {
 const button=prefix+'Gen',status=prefix==='q'?'qGenStatus':'dRunStatus',question=$(prefix+'Q').value.trim(),sqlBefore=$(prefix+'Sql').value,scope=prefix==='q'?$("qScope").value:currentDeviceOs;
 if(!question)return;
 await action(button,status,async valid=>{const r=await backend.aiToQuery(session.load(),question,scope==='all'?'':scope);if(!valid())return;
  if($(prefix+'Sql').value!==sqlBefore||$(prefix+'Q').value.trim()!==question||(prefix==='q'&&$("qScope").value!==scope))return setStatus(status,'','Your newer edits were kept. Draft again when ready.');
  if(r.ok){$(prefix+'Sql').value=r.sql;if(prefix==='q')qSource='ai';else dSource='ai';setStatus(status,'ok','Draft ready. Review the SQL before running.');}else setStatus(status,'err',r.detail);
 },'Drafting query…');
}
async function runQuery(prefix) {
 const single=prefix==='d',sql=$(prefix+'Sql').value.trim(),id=single?curNode:'',scope=single?'all':$("qScope").value;
 if(!sql)return setStatus(prefix+'RunStatus','err','Write or draft a read-only SELECT first.');
 await action(prefix+'Run',prefix+'RunStatus',async valid=>{++pollGen;$(prefix+'Res').replaceChildren();const r=await backend.createScopedQuery(session.load(),{sql,title:single?'':$("qLabel").value.trim(),source:single?dSource:qSource,nodeKey:id},scope);if(!valid())return;
  if(!r.ok)return setStatus(prefix+'RunStatus','err',r.detail);
  setStatus(prefix+'RunStatus','ok',Number(r.targeted)?`Sent to ${r.targeted} device${Number(r.targeted)===1?'':'s'}. Answers arrive as agents connect.`:'No enrolled devices match this scope. Add a device or choose a different operating system.');
  if(Number(r.targeted))pollResults(r.id,$(prefix+'Res'),++pollGen,single);
 },'Sending query…');
}
$("qGen").onclick=()=>draftQuery('q');$("qRun").onclick=()=>runQuery('q');

// ---------- enrolment ----------
let insOs = "macos", insScript = "", insFileName = "trust-macos-install.sh";
$("insOs").onclick = (e) => { const b = e.target.closest("[data-os]"); if (!b) return; insOs = b.dataset.os; loadView(loadEnroll,"enStatus"); };
function downloadText(name, body) {
  if (!body) return;
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function getDeployment(kind, os = insOs) {
  // Notification suppression is a separate, explicitly optional MDM policy.
  // Installers must never silently require it or broaden its scope to every app.
  const valid = context();
  if (!isAdmin()) return null;
  const f = opt(await backend.deploymentFile(session.load(), os, kind, false));
  return valid() && isAdmin() ? (f || null) : null;
}
async function downloadDeployment(kind, statusId) {
  try { const f=await getDeployment(kind); if(!f)return setStatus(statusId,"err","Prepare enrolment first."); downloadText(f.name,f.body); setStatus(statusId,"ok",`${f.name} downloaded`); }
  catch { setStatus(statusId,"err","Could not prepare this file."); }
}
async function loadEnroll() {
  const sequence=++enrollRequest,view=context(),requestedOs=insOs,valid=()=>view() && sequence===enrollRequest; insScript="";$("insCopy").disabled=$("insDl").disabled=true;$("insBox").textContent="Loading installer…";const s=opt(await backend.getSettings(session.load()));if(!valid()||!s)return;
  $("insOs").querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.os === insOs));
  $("st1").classList.toggle("done", s.enrollConfigured);
  $("enrollLine").innerHTML = s.enrollConfigured ? `Set (<code>${esc(s.enrollFingerprint)}</code>). Rotating it means re-issuing the installer — devices already enrolled keep working.` : `<b>Not set yet — nothing can enrol until you do this.</b> One shared password that lets a device join your fleet; it is baked into the installer in step 3.`;
  $("enGen").textContent = s.enrollConfigured ? "Rotate enrolment secret" : "Prepare installer";$("enGen").classList.toggle("primary",!s.enrollConfigured);
  $("insName").textContent = insOs === "windows" ? "trust-windows-install.ps1" : `trust-${insOs}-install.sh`;
  $("insHost").textContent = s.backendHost;
  const file = s.enrollConfigured ? await getDeployment("install", requestedOs) : null;
  const script = file?.body || ""; insFileName = file?.name || $("insName").textContent;
  if(!valid()||requestedOs!==insOs)return;insScript=script;
  $("insCopy").disabled=$("insDl").disabled=!insScript;
  $("insInstructions").textContent=insOs==="windows"?"Run once as SYSTEM through Iru. Use a pilot blueprint first; the installer checks the signed binary and SHA-256 before changing the service.":insOs==="linux"?"Run once as root through your management tool. This supports systemd on x86_64 and arm64; it does not touch unrelated osquery installations.":"Run once as root through Iru. Set the Custom Script to “install once”; a failed run retries automatically.";
  $("insBox").textContent = insScript || "Set the enrolment secret in step 1 first.";
}
$("enGen").onclick=()=>action('enGen','enStatus',async valid=>{
  if($("st1").classList.contains('done')&&!confirm('Rotate the enrolment secret? Re-issue installers for new enrolments; enrolled devices keep working.'))return;
  const r=await backend.generateEnroll(session.load());if(!valid())return;setStatus('enStatus',r.ok?'ok':'err',r.ok?'New secret active':r.detail);if(r.ok)await loadEnroll();
});
$("enSet").onclick=()=>action('enSet','enStatus',async valid=>{const v=$("enIn").value.trim();if(!v)return;const r=await backend.setEnroll(session.load(),v);if(!valid())return;setStatus('enStatus',r.ok?'ok':'err',r.ok?'Secret saved':r.detail);if(r.ok){$("enIn").value='';await loadEnroll();}});
$("insCopy").onclick=()=>action('insCopy','insStatus',async valid=>{if(!insScript)return;await navigator.clipboard.writeText(insScript);if(valid())setStatus('insStatus','ok','Copied');});
$("insDl").onclick = () => { if (!insScript) return; downloadText(insFileName, insScript); setStatus("insStatus", "ok", "downloaded"); };
$("bgProfileDl").onclick = async () => { try { const f=await getDeployment("background","macos"); if(!f)return setStatus("profileStatus","err","Prepare enrolment first."); downloadText(f.name,f.body); setStatus("profileStatus","ok","macOS profile downloaded"); } catch { setStatus("profileStatus","err","Could not prepare the profile."); } };
$("quietProfileDl").onclick = async () => { try { const f=await getDeployment("notifications","macos"); if(!f)return setStatus("profileStatus","err","Prepare enrolment first."); downloadText(f.name,f.body); setStatus("profileStatus","ok","Optional quiet profile downloaded"); } catch { setStatus("profileStatus","err","Could not prepare the profile."); } };
$("migrationDl").onclick = () => downloadDeployment("migrate", "migrationStatus");
$("preflightDl").onclick = () => downloadDeployment("preflight", "operatorStatus");
$("auditDl").onclick = () => downloadDeployment("audit", "operatorStatus");
$("uninstallDl").onclick = () => downloadDeployment("uninstall", "operatorStatus");
$("removedAuditDl").onclick = () => downloadDeployment("audit-removed", "operatorStatus");

// ---------- settings ----------
const TUNE = [
  { id: "tDist", key: "tuneDistInterval", label: "Check-in interval", unit: " s", min: 5, max: 3600, desc: "How quickly devices pick up checks and questions. Lower is snappier, with a little more chatter." },
  { id: "tUtil", key: "tuneWatchdogUtil", label: "CPU guardrail", unit: "%", min: 5, max: 100, desc: "The agent is restarted if it keeps using more than this share of one core." },
  { id: "tMem", key: "tuneWatchdogMem", label: "Memory guardrail", unit: " MB", min: 50, max: 4000, desc: "The agent is restarted if it uses more memory than this." },
  { id: "tSplay", key: "tuneScheduleSplay", label: "Spread", unit: "%", min: 0, max: 90, desc: "Randomly spreads scheduled work across devices so they do not all check in at once." },
];

function paintConnections(s) {
  const own = s.assetsId ? (s.ownersLastError ? "error" : Number(s.ownersPulledAt) ? "on" : "waiting") : "off";
  $("sOwnPill").textContent = own === "on" ? "on" : own; $("sOwnPill").className = "pill " + (own === "on" ? "on" : own === "off" ? "" : own === "error" ? "off" : "warn");
  $("sOwnMeta").textContent = !s.assetsId ? "Not wired yet — devices show no person until you do this (or name people by hand on each device)." : s.ownersLastError ? `Assets did not answer: ${s.ownersLastError} — is this app's id entered in Assets → Settings → Device trust?` : Number(s.ownersPulledAt) ? `${Number(s.ownersCount)} devices with a person from assets · pulled ${ago(s.ownersPulledAt)}${Number(s.manualOwners) ? ` · ${Number(s.manualOwners)} named here by hand` : ""}` : "Saved — pulling for the first time…";
  const on = s.ai.source === "hub";
  $("sAiPill").textContent = on ? "on" : "off"; $("sAiPill").className = "pill " + (on ? "on" : "off");
  $("sAiLine").innerHTML = on ? `The hub hands this app the company's AI key (${esc(s.ai.model)}). Questions are drafted by that model; your question is sent to the provider; device answers are not automatically included. Managed under <a href="${hubSettingsAi()}" target="_blank" rel="noopener">the hub's Settings → AI</a>.` : `Plain-language questions are off: ${aiReason(s.ai)}. Writing osquery SQL works without it.`;
}
async function refreshConnections(valid) {
  try { const s=opt(await backend.getSettings(session.load()));if(valid()&&s)paintConnections(s); } catch {}
}
async function loadSettings() {
  const valid=context(); const s=opt(await backend.getSettings(session.load()));if(!valid()||!s)return;
  $("sAppUrl").value = s.appUrl; $("sOrg").value = s.orgName; $("sGateway").value = s.gatewayDomain;
  $("sMeta").textContent = `${Number(s.peopleCount)} people from the hub${Number(s.lastDirectoryPull) ? " · synced " + ago(s.lastDirectoryPull) : ""} · ${Number(s.adminCount)} admin${Number(s.adminCount) === 1 ? "" : "s"}`;
  $("sAssets").value = s.assetsId; $("sSelfId").textContent = s.selfId;
  paintConnections(s);
  $("tuneRows").innerHTML = TUNE.map((t) => `<div class="slrow"><label class="slhead" for="${t.id}">${t.label} <span class="kv">(${t.unit.trim()})</span></label><div class="sldesc">${t.desc}</div><input type="number" id="${t.id}" min="${t.min}" max="${t.max}" value="${Number(s[t.key])}" aria-label="${t.label}"></div>`).join("");
  TUNE.forEach(t=>$(t.id).oninput=()=>setStatus('tuneStatus','','Unsaved changes'));
  try {const rm=await backend.removedList(session.load());if(!valid())return;$("rmRows").innerHTML=rm.map(([id,at])=>`<div class="chk"><div class="t"><b class="mono">${esc(id)}</b><p class="kv">Enrolment blocked · ${esc(ago(at))}</p></div><button data-allow="${esc(id)}">Allow enrolment</button></div>`).join('')||'<p class="kv">No blocked devices.</p>';$("rmRows").querySelectorAll('[data-allow]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await backend.allowAgain(session.load(),[b.dataset.allow]);if(!valid())return;if(r.ok)b.closest('.chk').remove();else{b.disabled=false;b.textContent=r.detail;}}catch{if(valid()){b.disabled=false;b.textContent='Retry';}}});const records=await backend.removalRecords(session.load());if(!valid())return;for(const r of records){const row=document.createElement('div');row.className='notice';row.innerHTML=`<b>${esc(r.hostname)}</b> · ${r.verifiedAt&&Number(r.verifiedAt)?`verified by ${esc(r.verifiedBy)} · ${esc(r.evidence)}`:'pending Iru removal'}${!r.verifiedAt||!Number(r.verifiedAt)?`<div class="copy-line"><input data-evidence="${esc(r.id)}" placeholder="Iru job reference or audit result"><button data-verify="${esc(r.id)}">Save verification</button></div>`:''}`;$("rmRows").append(row);}$("rmRows").querySelectorAll('[data-verify]').forEach(b=>b.onclick=()=>action(b,'sStatus',async ok=>{const input=[...$("rmRows").querySelectorAll('[data-evidence]')].find(x=>x.dataset.evidence===b.dataset.verify),r=await backend.verifyRemoval(session.load(),b.dataset.verify,input?.value||'');if(!ok())return;setStatus('sStatus',r.ok?'ok':'err',r.detail);if(r.ok)await loadSettings();}));}catch{}

  $("tuneMeta").textContent = `agent settings v${Number(s.configVersion)}`;
  $("sSeed").classList.toggle("hidden", s.demoSeeded); $("sUnseed").classList.toggle("hidden", !s.demoSeeded);
  try { const log = await backend.adminLogRows(session.load()); if(!valid())return; $("logRows").innerHTML = log.map((r) => `<tr><td class="kv">${esc(fmt(r.at))}</td><td class="kv">${esc(r.who)}</td><td>${esc(r.what)}</td></tr>`).join("") || '<tr><td colspan="3" class="kv">nothing yet</td></tr>'; } catch (e) {}
}
async function saveTuning(valid) {
  for(const t of TUNE)if(!$(t.id).value || !$(t.id).checkValidity()){$(t.id).reportValidity();return setStatus("tuneStatus","err",`${t.label}: enter a whole number from ${t.min} to ${t.max}.`);}
  const n = (id) => BigInt(Math.round(Number($(id).value) || 0));
  const r = await backend.setTuning(session.load(), { distInterval: n("tDist"), watchdogMem: n("tMem"), watchdogUtil: n("tUtil"), splay: n("tSplay") });
  if(!valid())return;setStatus("tuneStatus", r.ok ? "ok" : "err", r.ok ? "saved — rolling out to the fleet" : r.detail);
}
$("tuneSave").onclick=()=>action("tuneSave","tuneStatus",saveTuning);
async function saveSettings() {
  const r = await backend.setSettings(session.load(), { adminGroup: "", appUrl: $("sAppUrl").value.trim(), orgName: $("sOrg").value.trim(), assetsId: $("sAssets").value.trim(), gatewayDomain: $("sGateway").value.trim() || "icp.net" });
  return r;
}
$("sSave").onclick=()=>action('sSave','sStatus',async valid=>{const r=await saveSettings();if(!valid())return;setStatus('sStatus',r.ok?'ok':'err',r.ok?'Configuration saved':r.detail);if(r.ok){await refreshMe();if(valid())await refreshConnections(valid);}});
$("sSync").onclick=()=>action('sSync','sStatus',async valid=>{const r=await backend.syncNow(session.load());if(valid())setStatus('sStatus',r.ok?'ok':'err',r.detail);},'Refreshing directory…');
$("sOwnPull").onclick=()=>action('sOwnPull','sOwnStatus',async valid=>{const r=await backend.pullOwnersNow(session.load());if(valid())setStatus('sOwnStatus',r.ok?'ok':'err',r.ok?`${r.count} devices with a person · uses the saved Assets connection`:r.detail);if(valid()&&r.ok)await refreshConnections(valid);},'Refreshing assignments…');
$("sSelfCopy").onclick=()=>action('sSelfCopy','sOwnStatus',async valid=>{await navigator.clipboard.writeText($("sSelfId").textContent);if(valid())setStatus('sOwnStatus','ok','Copied');});
$("sAiRefresh").onclick=()=>action('sAiRefresh','sAiStatus',async valid=>{const r=await backend.refreshAi(session.load());if(!valid())return;setStatus('sAiStatus',r.ok?'ok':'err',r.detail);await refreshMe();if(valid())await refreshConnections(valid);},'Checking Hub connection…');
async function sampleAction(remove){const r=await backend[remove?'removeDemo':'seedDemo'](session.load());return r;}
for(const [id,remove] of [['sSeed',false],['sUnseed',true]])$(id).onclick=()=>action(id,'sSeedStatus',async valid=>{if(remove&&!confirm('Remove the sample fleet?'))return;const r=await sampleAction(remove);if(!valid())return;setStatus('sSeedStatus',r.ok?'ok':'err',r.detail);if(r.ok){$("sSeed").classList.toggle('hidden',!remove);$("sUnseed").classList.toggle('hidden',remove);}});

boot().finally(() => signIn.ready()).catch(() => setStatus("loginStatus", "err", "Could not load the app. Check your connection and retry from the Hub."));

// Roles are configured in the Hub; the app exposes no local privilege controls.
for (const link of document.querySelectorAll("[data-hub-permissions-link]")) link.href = HUB_URL.replace(/\/$/, "") + "/#/permissions";
