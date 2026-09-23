import {createWorkspaceStatus} from "./service-status.js";
import { createReporting } from "./reporting.js";
import { createOncall } from "./oncall.js";
import { createCustomerProjects } from "./customer-projects.js";
import { idlFactory } from "./idl.js";
import { createProfilePictures } from "./profile-pictures.js";
import { createTicketView, statusPill, typeLabel } from "./ticket-view.js";
import { plainMessage } from "./message-format.js";
import { canonicalDestination } from "./canonical-url.js";
import { appSignIn, takeHubTicket, session, initials, mountTopbar, topbarIdlFactory } from "./hub-client.js";

// deploy-time constants (INSTALL.md: sed the placeholders)
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const HUB_URL = "__HUB_URL__"; // hub FRONTEND url, e.g. https://xxxxx.icp.net
const IC_HOST = "https://icp0.io";
session.key = "ks-desk-session";

const signIn = appSignIn({ name: "Desk", hubUrl: HUB_URL });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (o) => (o && o.length ? o[0] : null);
const nsToMs = (ns) => Number(BigInt(ns) / 1000000n);
const fmt = (ns) => new Date(nsToMs(ns)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const fmtD = (ns) => new Date(nsToMs(ns)).toLocaleDateString([], { dateStyle: "medium" });
const ago = (ns) => {
  const minutes = Math.max(0, Math.round((Date.now() - nsToMs(ns)) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return fmtD(ns);
};
const due = (ns) => ns ? `<span class="${nsToMs(ns) < Date.now() ? 'due-overdue' : 'due-date'}">${nsToMs(ns) < Date.now() ? 'Overdue · ' : ''}${fmtD(ns)}</span>` : '<span class="kv">No target date</span>';
const setStatus = (id, cls, text) => { if (id === "loginStatus") signIn.status(cls, text); const el = $(id); if (!el) return; el.className = "status " + (cls || ""); el.textContent = text || ""; };
const bigint = (x) => BigInt(Number(x) || 0);

let backend, hubActor = null, topbar = null, me = null, catalogCache = [], agentsCache = [], settingsCache = null, lastList = "#/me";

// ---------- the shared topbar (brand · app · menu · bell · theme · person) — one component for the whole suite ----------
function mountBar() {
  if (!me) return;
  const person = { email: me.email, displayName: me.displayName, role: me.role };
  if (topbar) { topbar.setPerson(person); topbar.setApp({ eyebrow: me.orgName || "" }); return; }
  topbar = mountTopbar($("topbar"), {
    hub: { actor: () => hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
    app: { id: "desk", name: "Desk", eyebrow: me.orgName || "" },
    person,
    onSignOut: signOut,
  });
}

// ---------- routing ----------
// #/me · #/new · #/new/<typeId> · #/queue · #/agent-new · #/t/<id> · #/settings/<tab> · #/docs
const STAFF_VIEWS = ["queue", "agent-new", "offboarding", "customers", "oncall"];
let routeGeneration = 0;
async function route() {
  const stamp = ++routeGeneration;
  if (!me) return;
  const h = location.hash.replace(/^#\/?/, "");
  const [view, arg, mode] = h.split("/");
  let v = (view === "offboarding" ? "agent-new" : view) || (me.role === "requester" ? "me" : "queue");
  if (STAFF_VIEWS.includes(v) && me.role === "requester") v = "me";
  if (v === "settings" && me.role !== "admin") v = me.role === "requester" ? "me" : "queue";
  const known = ["me", "new", "queue", "agent-new", "t", "settings", "docs", "customers", "oncall", "reporting", "service-status"];
  if (!known.includes(v)) v = me.role === "requester" ? "me" : "queue";
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "v-" + (v === "t" ? "ticket" : v)));
  document.querySelectorAll("#nav .navstep").forEach((el) => el.classList.toggle("active", el.dataset.view === v || (v === "t" && el.dataset.view === lastListView())));
  if (v !== 't') ticketView.leave();
  if (v !== 'customers') customerProjects.clear();
  if (v !== 'oncall') oncall.clear();
  if (v !== 'reporting') reporting.clear();
  if(v !== 'service-status') serviceStatus.clear();
  if (v === 'customers') lastList = '#/customers' + (arg && arg !== 'new' ? '/' + arg : '');
  if (['me','queue'].includes(v)) lastList = '#/' + v;
  $('tBack').textContent = lastList.startsWith('#/customers') ? '← Customer project' : lastList === '#/queue' ? '← Back to workspace' : '← My requests';
  $('pageError').classList.add('hidden');
  try {
  if (v === "me") await loadMe();
  if (v === "new") await showNew(arg);
  if (v === "queue") await loadQueue();
  if(v === "service-status") await serviceStatus.show();
  if (v === "reporting") await reporting.show(arg || "");
  if (v === "oncall") await oncall.show(arg || "", mode || "");
  if (v === "customers") await customerProjects.show(arg || "", mode || "");
  if (v === "agent-new") await showAgentNew(view === "offboarding" ? arg : null);
  if (v === "t") await ticketView.load(arg);
  if (v === "settings") await showSettings(arg || "general");
  } catch (_) {
    if (stamp === routeGeneration) { $('pageError').textContent = 'This view could not be loaded. Check your connection and try opening it again.'; $('pageError').classList.remove('hidden'); }
  }
  if (stamp === routeGeneration) window.scrollTo(0, 0);
}
const lastListView = () => lastList.replace(/^#\//, "").split("/")[0] || "me";
window.addEventListener("hashchange", route);
$("tBack").onclick = (e) => { e.preventDefault(); location.hash = lastList; };

function renderNav() {
  const items = [];
  if (me.role !== "requester") items.push(["queue", "Internal support", "qCount"], ["customers", "Customer projects", ""], ["oncall", "On-call", ""]);
  items.push(["service-status", "Service status", ""]);
  if (me.reporting || me.role !== "requester") items.push(["reporting", "Time &amp; compensation", ""]);
  items.push(["me", "My requests", ""], ["new", "New request", ""]);
  if (me.role === "admin") items.push(["settings", "Settings", ""]);
  $('layout').dataset.role = me.role;
  $('navCaption').textContent = me.role === 'requester' ? 'YOUR SUPPORT' : 'SUPPORT DESK';
  const previousCount = $('qCount')?.textContent || '';
  const symbols = {"service-status":"◉",reporting:"≡",oncall:'◷',customers:'◫',queue:'▤',me:'◫',new:'＋',settings:'⚙'};
  $("nav").innerHTML = items.map(([v, l, n]) => `<button type="button" class="navstep" data-view="${v}"><span class="nav-icon" aria-hidden="true">${symbols[v]}</span><span class="nav-label">${l}</span>${n ? `<span class="n" id="${n}">${previousCount}</span>` : ""}</button>`).join("");
  $("nav").onclick = (e) => { const el = e.target.closest(".navstep"); if (el) location.hash = "#/" + el.dataset.view; };

  document.querySelectorAll('#nav .navstep').forEach(el => { const active = location.hash.startsWith('#/t/') ? lastListView() : location.hash.replace(/^#\//,'').split('/')[0]; el.classList.toggle('active', el.dataset.view === active); });
  mountBar();
}

// ---------- boot / session ----------
async function refreshMe() {
  const w = opt(await backend.whoami(session.load()));
  if (!w) return false;
  const changed = me && (me.id !== w.id || me.role !== w.role || me.reporting !== w.reporting || JSON.stringify(me.groups) !== JSON.stringify(w.groups));
  if (changed) { customerProjects.clear(); oncall.clear(); reporting.clear(); serviceStatus.clear(); ticketView.reset(); profilePictures.reset(); agentsAt = 0; catalogCache = []; agentsCache = []; }
  if (!me) lastList = w.role === "requester" ? "#/me" : "#/queue";
  me = w;
  renderNav();
  profilePictures.load();
  if (changed) route();
  return true;
}
async function boot() {
  const { HttpAgent, Actor } = await import("./agent-bundle.js");
  const agent = await HttpAgent.create({ host: IC_HOST });
  backend = Actor.createActor(idlFactory, { agent, canisterId: BACKEND_CANISTER_ID });
  try {
    const info = await backend.info();
    if (canonicalDestination(info.appUrl, location.href)) {
      // Restore any route saved before a Hub return, discard its old-origin ticket,
      // then obtain a fresh session on the configured origin when signing in.
      takeHubTicket();
      location.replace(canonicalDestination(info.appUrl, location.href));
      return;
    }
    if (info.hubId) hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId });
    if (info.orgName) $("loginSub").textContent = `${info.orgName} · desk`;
    if (!info.hubSet) $("loginWarn").classList.remove("hidden"), ($("loginWarn").textContent = "This app is not connected to your company Hub yet. Contact your IT team.");
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
    loadGroupsDatalist();
    if (!location.hash || location.hash === "#/" || location.hash === "#") location.hash = me.role === "requester" ? "#/me" : "#/queue";
    else route();
    setInterval(async () => { try { if (await refreshMe()) return; } catch (_) {} signOut(); setStatus("loginStatus", "err", "Your access could not be confirmed. Check the Hub connection and sign in again from the Hub."); }, 30000);
  } else {
    session.clear();
  }
}
function signOut() {
  customerProjects.clear(); oncall.clear(); reporting.clear(); serviceStatus.clear(); ticketView.reset(); profilePictures.reset(); knownQueues.clear(); routeGeneration++; agentsAt = 0; agentsCache = []; catalogCache = [];
  const t = session.load();
  session.clear();
  if (t) backend.signOut(t).catch(() => {});
  me = null;
  if (topbar) { topbar.destroy(); topbar = null; }
  $("layout").classList.remove("on");
  $("login").style.display = "grid";
  setStatus("loginStatus", "", "signed out");
}
$("loginBtn").onclick = () => signIn.continue();

// ---------- shared: catalog + agents ----------
async function loadCatalog() { catalogCache = await backend.catalog(session.load()); return catalogCache; }
let agentsAt = 0, agentsPending = null;
async function loadAgents() {
  if (!me || me.role === 'requester') return [];
  if (Date.now() - agentsAt < 30000) return agentsCache;
  if (agentsPending) return agentsPending;
  const person = me.id;
  agentsPending = backend.agents(session.load()).then(rows => {
    if (me?.id === person && me.role !== 'requester') { agentsCache = rows; agentsAt = Date.now(); return rows; }
    return [];
  }).finally(() => { agentsPending = null; });
  return agentsPending;
}
async function loadGroupsDatalist() {
  // group suggestions = groups we see on people + configured ones
  const set = new Set(me.groups || []);

  $("groupList").innerHTML = [...set].map((g) => `<option value="${esc(g)}">`).join("");
}
let dirTimer = null;
async function dirSuggest(q) {
  clearTimeout(dirTimer);
  dirTimer = setTimeout(async () => {
    let rows; try { rows = await backend.directory(session.load(), q || ""); } catch (_) { return; }
    $("dirList").innerHTML = rows.map((r) => `<option value="${esc(r.email)}">${esc(r.displayName)}${r.department ? " · " + esc(r.department) : ""}</option>`).join("");
  }, 180);
}

// ---------- field renderer (catalog forms) ----------
function renderFields(container, fields, values) {
  const v = (k) => (values ? (values.find((x) => x[0] === k) || [])[1] || "" : "");
  container.innerHTML = fields.map((f, index) => {
    const req = f.required ? " *" : "";
    let input = "";
    if (f.kind === "textarea") input = `<textarea data-key="${esc(f.key)}">${esc(v(f.key))}</textarea>`;
    else if (f.kind === "date") input = `<input type="date" data-key="${esc(f.key)}" value="${esc(v(f.key))}">`;
    else if (f.kind === "select") input = `<select data-key="${esc(f.key)}"><option value="">—</option>${f.options.map((o) => `<option${o === v(f.key) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    else if (f.kind === "bool") input = `<select data-key="${esc(f.key)}"><option value="">—</option><option${v(f.key) === "yes" ? " selected" : ""}>yes</option><option${v(f.key) === "no" ? " selected" : ""}>no</option></select>`;
    else if (f.kind === "person") input = `<input type="text" data-key="${esc(f.key)}" list="dirList" class="person" placeholder="name or e-mail" value="${esc(v(f.key))}">`;
    else input = `<input type="text" data-key="${esc(f.key)}" value="${esc(v(f.key))}" maxlength="2000">`;
    const inputId = `${container.id}-field-${index}`;
    input = input.replace(/<(input|textarea|select) /, `<$1 id="${inputId}" ${f.required ? 'required ' : ''}`);
    return `<div><label for="${inputId}">${esc(f.title)}${req}${f.sensitive ? ' <span class="pill" title="collected only here, never in chat">private</span>' : ""}</label>${input}</div>`;
  }).join("");
  container.querySelectorAll("input.person").forEach((el) => el.addEventListener("input", () => dirSuggest(el.value)));
}
function collectFields(container) {
  return [...container.querySelectorAll("[data-key]")].map((el) => [el.dataset.key, el.value.trim()]);
}

// ---------- my requests ----------
let meGeneration = 0;
async function loadMe() {
  const stamp = ++meGeneration, person = me.id;
  setStatus('meStatus','','Loading your requests…');
  try {
    const [rows, aps] = await Promise.all([backend.myTickets(session.load()), backend.myApprovals(session.load())]);
    if (stamp !== meGeneration || me?.id !== person) return;
    $('meGreeting').textContent = `Hi ${(me.displayName || '').split(' ')[0] || 'there'}, welcome to your support space`;
    const active = rows.filter(r => !['closed','resolved'].includes(r.status));
    $('meOverview').innerHTML = [[active.length,'Open requests'],[active.filter(r => r.status === 'waiting' && r.waitingOn === 'requester').length,'Waiting for your reply'],[rows.length - active.length,'Resolved requests']].map(([n,label]) => `<div><strong>${n}</strong><span>${label}</span></div>`).join('');
    $('meRows').innerHTML = rows.map(r => `<tr data-id="${r.id}"><td data-label="Request" class="request-key">${esc(r.key)}</td><td><a class="request-title" href="#/t/${r.id}">${esc(plainMessage(r.subject))}</a><div class="rowsub">${esc(typeLabel(r.typeName))}</div></td><td data-label="Progress">${statusPill(r)}</td><td data-label="Updated" class="kv">${ago(r.updatedAt)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty"><strong>You’re all caught up.</strong><p>Need a hand? Create your first request and we’ll help you from here.</p><a href="#/new" class="button primary">Get help</a></td></tr>';
    $('meApprovals').classList.toggle('hidden', aps.length === 0);
    $('meApprovalRows').innerHTML = aps.map(r => `<tr data-id="${r.id}"><td class="request-key">${esc(r.key)}</td><td><a class="request-title" href="#/t/${r.id}">${esc(plainMessage(r.subject))}</a></td><td>${esc(r.requesterName)}</td><td class="kv">${ago(r.createdAt)}</td></tr>`).join('');
    setStatus('meStatus','','');
  } catch (_) { if (stamp === meGeneration) setStatus('meStatus','err','We couldn’t refresh your requests. Please try opening this page again.'); }
}
const rowClick = e => { if (e.target.closest('a,button,input,select')) return; const row = e.target.closest('tr[data-id]'); if (row) location.hash = '#/t/' + row.dataset.id; };
$('meRows').onclick = rowClick; $('meApprovalRows').onclick = rowClick; $('qRows').onclick = rowClick;

// ---------- new request ----------
let nfType = null;
async function showNew(typeId) {
  const stamp = routeGeneration; await loadCatalog(); if (stamp !== routeGeneration) return;
  $("catGrid").innerHTML = catalogCache.map((t) => `<button type="button" class="cat" data-id="${t.id}"><div class="ic">${esc(t.icon)}</div><div class="nm">${esc(typeLabel(t.name))}</div><div class="ds">${esc(t.description)}</div><div class="mt">${t.approval !== "none" ? '<span class="pill">approval</span>' : ""}${Number(t.respondH) ? `<span class="pill">Reply target: ${t.respondH} hours</span>` : ""}</div></button>`).join("") || '<div class="empty">The catalog is empty — an admin needs to add request types.</div>';
  $("catGrid").onclick = (e) => { const c = e.target.closest(".cat"); if (c) location.hash = "#/new/" + c.dataset.id; };
  nfType = typeId ? catalogCache.find((t) => Number(t.id) === Number(typeId)) : null;
  $("catGrid").classList.toggle("hidden", !!nfType);
  $("newForm").classList.toggle("hidden", !nfType);
  if (!nfType) return;
  $("nfIcon").textContent = nfType.icon; $("nfName").textContent = typeLabel(nfType.name); $("nfDesc").textContent = nfType.description;
  const bits = [];
  if (nfType.approval === "manager") bits.push("Needs your manager's approval first.");
  else if (nfType.approval.startsWith("group:")) bits.push(`Needs approval from ${nfType.approval.slice(6)}.`);
  if (Number(nfType.respondH)) bits.push(`Our target is to reply within ${nfType.respondH} hours.`);
  $("nfNotice").textContent = bits.join(" ");
  $("nfSubject").value = ""; $("nfBody").value = ""; setStatus("nfStatus", "", "");
  renderFields($("nfFields"), nfType.fields, null);
  $("nfSubject").focus();
}
$("nfSubmit").onclick = async () => {
  if (!nfType || $("nfSubmit").disabled) return;
  for (const el of $("newForm").querySelectorAll("input,select,textarea")) if (!el.reportValidity()) return;
  setStatus("nfStatus", "", "Sending request…");
  $("nfSubmit").disabled = true;
  try {
    const r = await backend.createRequest(session.load(), bigint(nfType.id), $("nfSubject").value.trim(), $("nfBody").value, collectFields($("nfFields")));
    if (r.ok) { lastList = "#/me"; location.hash = "#/t/" + r.id; } else setStatus("nfStatus", "err", r.detail);
  } catch (e) { setStatus("nfStatus", "err", "We couldn’t confirm your request was saved. Your text is still here; please try again."); }
  $("nfSubmit").disabled = false;
};

// ---------- queue ----------
let qView = "open";
$("viewSeg").onclick = (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; qView = b.dataset.v; $("viewSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); loadQueue(); };
["fQueue", "fStatus"].forEach((id) => ($(id).onchange = loadQueue));
let qTimer = null; $("fQ").oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(loadQueue, 200); };
let queueGeneration = 0; const knownQueues = new Set();
async function loadQueue() {
  if (!me || me.role === 'requester') return;
  const stamp = ++queueGeneration, person = me.id;
  setStatus('qStatus','','Loading requests…');
  try {
    const [rows, st] = await Promise.all([
      backend.listTickets(session.load(), {view:qView,status:$('fStatus').value,queue:$('fQueue').value,assignee:'',q:$('fQ').value}), backend.stats(session.load())
    ]);
    if (stamp !== queueGeneration || me?.id !== person || me.role === 'requester') return;
    const cards = [['open','Active requests',Number(st.new)+Number(st.open)+Number(st.waiting)],['mine','Assigned to me',st.mine],['unassigned','Need an owner',st.unassigned],['breached','Past their target',st.breached]];
    $('statGrid').innerHTML = cards.map(([v,l,n]) => `<button class="stat${qView === v ? ' active' : ''}" data-v="${v}" aria-pressed="${qView === v}"><span class="n">${n}</span><span class="l">${l}</span></button>`).join('');
    $('statGrid').onclick = e => { const el=e.target.closest('.stat'); if (!el) return; qView=el.dataset.v; $('viewSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active',b.dataset.v===qView)); loadQueue(); };
    if ($('qCount')) $('qCount').textContent = Number(st.new)+Number(st.open)+Number(st.waiting) || '';
    const selected = $('fQueue').value; if (selected) knownQueues.add(selected); rows.forEach(r => {if(r.queue) knownQueues.add(r.queue);});
    $('fQueue').innerHTML = '<option value="">All teams</option>' + [...knownQueues].sort().map(q => `<option value="${esc(q)}"${q===selected?' selected':''}>${esc(q)}</option>`).join('');
    $('qRows').innerHTML = rows.map(r => `<tr data-id="${r.id}"><td class="queue-subject"><div class="request-row-kicker"><span class="request-key">${esc(r.key)}</span><span class="priority-dot p-${esc(r.priority)}">${esc(r.priority)} priority</span></div><a class="request-title" href="#/t/${r.id}">${esc(plainMessage(r.subject))}</a><div class="rowsub">${esc(typeLabel(r.typeName))}${r.approval==='pending'?' · Approval needed':''}${Number(r.totalTasks)?` · ${r.openTasks} of ${r.totalTasks} tasks remaining`:''}</div></td><td data-label="Requested by">${esc(r.requesterName)}</td><td data-label="Status">${statusPill(r,true)}</td><td data-label="Assigned to">${esc(r.assigneeName || 'Not assigned')}<span class="rowsub">${esc(r.queue)}</span></td><td data-label="Target date">${due(opt(r.dueAt))}${r.breached && !opt(r.dueAt)?'<div class="due-overdue">Response overdue</div>':''}<span class="rowsub">Updated ${ago(r.updatedAt)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty"><strong>No requests match this view.</strong><p>Try another filter or search term.</p></td></tr>';
    setStatus('qStatus','','');
    if (backend.lifecycleHealth) {
      void backend.lifecycleHealth(session.load()).then(value => {
        if(stamp !== queueGeneration || me?.id !== person || me.role === 'requester') return;
        const health=value[0], box=$('directoryFollowupHealth');
        const message=health?.gap ? 'Some directory events are outside the retained history. Review inactive people in Hub for missing follow-up.' : health?.detail || '';
        box.textContent=message; box.classList.toggle('hidden',!message);
      }).catch(()=>{
        if(stamp !== queueGeneration || me?.id !== person || me.role === 'requester') return;
        const box=$('directoryFollowupHealth');box.textContent='Directory follow-up status is unavailable. Check Hub and Desk connectivity.';box.classList.remove('hidden');
      });
    }

  } catch (_) { if(stamp===queueGeneration) setStatus('qStatus','err','We couldn’t refresh the workspace. Change a filter to try again.'); }
}

// ---------- agent: file for someone ----------
async function showAgentNew(personId = null) {
  const stamp = routeGeneration;
  await loadCatalog();
  if (stamp !== routeGeneration) return;
  $("anType").innerHTML = catalogCache.map((t) => `<option value="${t.id}">${esc(t.icon)} ${esc(t.name)}</option>`).join("");
  const paint = () => { const t = catalogCache.find((x) => Number(x.id) === Number($("anType").value)); renderFields($("anFields"), t ? t.fields : [], null); if (t) $("anPrio").value = t.defaultPriority; };
  $("anType").onchange = paint; paint();
  if (personId) {
    const entry=(await backend.offboardingEntry(session.load(),decodeURIComponent(personId)))[0];
    if (stamp !== routeGeneration) return;
    if (!entry) { setStatus('anStatus','err','This person is unavailable.'); return; }
    if (entry.ticketId.length) { location.hash='#/t/'+entry.ticketId[0]; return; }
    const type=catalogCache.find(t=>t.id === entry.typeId?.[0]);
    if (!type) { setStatus('anStatus','err','Enable the Offboarding request type first.'); return; }
    $('anType').value=String(type.id);paint();
    $('anReq').value=me.email;$('anSubject').value='Offboarding · '+entry.person.displayName;
    renderFields($('anFields'),type.fields,[['person',entry.person.email]]);
  }

  $("anReq").oninput = () => dirSuggest($("anReq").value);
  dirSuggest("");
}
$("anSubmit").onclick = async () => {
  if ($('anSubmit').disabled) return;
  for (const el of $('v-agent-new').querySelectorAll('input,select,textarea')) if (!el.reportValidity()) return;
  $('anSubmit').disabled = true;
  setStatus("anStatus", "", "Sending request…");
  try {
  const r = await backend.agentCreate(session.load(), { typeId: bigint($("anType").value), subject: $("anSubject").value.trim(), body: $("anBody").value, fields: collectFields($("anFields")), requester: $("anReq").value.trim(), priority: $("anPrio").value, channel: $("anChannel").value });
  if (r.ok) { $("anSubject").value = $("anBody").value = ""; lastList = "#/queue"; location.hash = "#/t/" + r.id; } else setStatus("anStatus", "err", r.detail);
  } catch (_) { setStatus('anStatus','err','We couldn’t confirm the request was saved. Your text is still here.'); }
  finally { $('anSubmit').disabled = false; }
};

// ---------- ticket ----------
const profilePictures = createProfilePictures({getBackend:()=>backend,getMe:()=>me,session,onOwn:url=>topbar?.setPerson({avatarUrl:url})});
const serviceStatus=createWorkspaceStatus({root:$("v-service-status"),api:()=>backend,session,getMe:()=>me});
const reporting = createReporting({root: $("v-reporting"), api:()=>backend, session, getMe:()=>me});
const oncall = createOncall({root: $("v-oncall"), api:()=>backend, session, getMe:()=>me, backendId:BACKEND_CANISTER_ID});
const customerProjects = createCustomerProjects({root: $("v-customers"), api:()=>backend, session, getMe:()=>me, backendId:BACKEND_CANISTER_ID});
const ticketView = createTicketView({profilePictures,$, getBackend:()=>backend, getMe:()=>me, session, loadAgents, renderFields, collectFields, setStatus});

// ---------- settings ----------
function showSettings(tab) {
  document.querySelectorAll(".stab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".spane").forEach((p) => p.classList.toggle("active", p.id === "sp-" + tab));
  if (tab === "general") loadGeneral();
  if (tab === "catalog") loadCatalogAdmin();
  if (tab === "ai") loadAi();
  if (tab === "slack") loadSlack();
  if (tab === "log") loadLog();
}
$("stabs").onclick = (e) => { const b = e.target.closest(".stab"); if (b) location.hash = "#/settings/" + b.dataset.tab; };
async function loadGeneral() {
  const s = opt(await backend.getSettings(session.load())); if (!s) return;
  settingsCache = s; loadGroupsDatalist();
  $("sgInfo").innerHTML = `<div>Hub backend</div><div class="mono">${esc(s.hubId) || "<i>not set</i>"}</div><div>Directory</div><div>${s.peopleCount} people${Number(s.lastDirectoryPull) ? ` · pulled ${ago(s.lastDirectoryPull)}` : " · never pulled"}</div><div>Attachments</div><div>${Math.round(Number(s.fileBytes) / 1048576)} MB of 953 MB used</div>`;
  $("sgOrg").value = s.orgName; $("sgUrl").value = s.appUrl; $("sgPrefix").value = s.keyPrefix; $("sgAutoClose").value = Number(s.autoCloseDays);

  $("sgRoleCounts").innerHTML = `Right now: <b>${s.adminCount}</b> admin(s), <b>${s.agentCount}</b> agent(s). You are <b>${esc(me.role)}</b> via ${esc(me.roleSource || "directory")}.${Number(s.agentCount) + Number(s.adminCount) === 0 ? ' <span class="pill off">nobody is staff yet</span>' : ""}`;
  $("sgSeed").disabled = s.demoSeeded; setStatus("sgSeedStatus", "", s.demoSeeded ? "already seeded" : "");
}
$("sgSave").onclick = async () => { const r = await backend.updateSettings(session.load(), { appUrl: $("sgUrl").value.trim(), orgName: $("sgOrg").value.trim(), agentGroup: "", adminGroup: "", keyPrefix: $("sgPrefix").value.trim(), autoCloseDays: bigint($("sgAutoClose").value) }); setStatus("sgStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail); if (r.ok) { await refreshMe(); loadGeneral(); } };
$("sgSync").onclick = async () => { setStatus("sgStatus", "", "syncing…"); const r = await backend.syncNow(session.load()); setStatus("sgStatus", r.ok ? "ok" : "err", r.detail); loadGeneral(); };
$("sgSeed").onclick = async () => { if (!confirm("Seed ~13 demo requests? This cannot be undone.")) return; setStatus("sgSeedStatus", "", "seeding…"); const r = await backend.seedDemo(session.load()); setStatus("sgSeedStatus", r.ok ? "ok" : "err", r.detail); loadGeneral(); };

// catalog admin
let ctEditId = 0;
async function loadCatalogAdmin() {
  const rows = await backend.adminCatalog(session.load());
  $("ctRows").innerHTML = rows.map((t, i) => `<tr data-id="${t.id}"><td>${esc(t.icon)}</td><td><b>${esc(t.name)}</b><div class="rowsub">${esc(t.description)}</div></td><td class="kv">${esc(t.queue) || "<i>agents</i>"}</td><td class="kv">${esc(t.approval)}</td><td class="kv">${Number(t.respondH) ? t.respondH + "h" : "–"} / ${Number(t.resolveH) ? t.resolveH + "h" : t.dueField ? "field " + esc(t.dueField) : "–"}</td><td class="kv">${t.fields.length} · ${t.checklist.length} tasks</td><td>${t.enabled ? '<span class="pill on">on</span>' : '<span class="pill">off</span>'}${t.visibility === "agents" ? ' <span class="pill">agents</span>' : ""}</td><td style="white-space:nowrap"><button class="sm" data-act="up" ${i === 0 ? "disabled" : ""}>▲</button> <button class="sm" data-act="down" ${i === rows.length - 1 ? "disabled" : ""}>▼</button> <button class="sm" data-act="edit">Edit</button></td></tr>`).join("") || '<tr><td colspan="8" class="empty">Empty catalog.</td></tr>';
  $("ctRows").onclick = async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return; const tr = b.closest("tr"); const id = Number(tr.dataset.id);
    if (b.dataset.act === "edit") { openTypeForm(rows.find((t) => Number(t.id) === id)); return; }
    const ids = rows.map((t) => Number(t.id)); const i = ids.indexOf(id); const j = b.dataset.act === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]];
    await backend.setTypeOrder(session.load(), ids.map(bigint)); loadCatalogAdmin();
  };
}
function fieldRowHtml(f) {
  f = f || { key: "", title: "", kind: "text", options: [], required: false, sensitive: false };
  return `<div class="fieldrow"><input type="text" class="fk" value="${esc(f.key)}" placeholder="key"><input type="text" class="ft" value="${esc(f.title)}" placeholder="Label"><select class="fkind">${["text", "textarea", "date", "select", "person", "bool"].map((k) => `<option${k === f.kind ? " selected" : ""}>${k}</option>`).join("")}</select><input type="text" class="fo" value="${esc(f.options.join("|"))}" placeholder="a|b|c"><span class="cb"><input type="checkbox" class="fr"${f.required ? " checked" : ""}></span><span class="cb"><input type="checkbox" class="fs"${f.sensitive ? " checked" : ""}></span><button class="sm frm" style="padding:2px 7px">×</button></div>`;
}
function openTypeForm(t) {
  ctEditId = t ? Number(t.id) : 0;
  $("ctForm").classList.remove("hidden");
  $("ctFormTitle").textContent = t ? `Edit: ${t.name}` : "New request type";
  $("ctName").value = t ? t.name : ""; $("ctIcon").value = t ? t.icon : ""; $("ctQueue").value = t ? t.queue : ""; $("ctDesc").value = t ? t.description : "";
  const ap = t ? t.approval : "none";
  $("ctApproval").value = ap.startsWith("group:") ? "group" : ap; $("ctApprovalGroup").value = ap.startsWith("group:") ? ap.slice(6) : "";
  $("ctPrio").value = t ? t.defaultPriority : "normal"; $("ctRespond").value = t ? Number(t.respondH) : 8; $("ctResolve").value = t ? Number(t.resolveH) : 48; $("ctDueField").value = t ? t.dueField : "";
  $("ctVis").value = t ? t.visibility : "all"; $("ctEnabled").checked = t ? t.enabled : true;
  $("ctFields").innerHTML = (t ? t.fields : []).map(fieldRowHtml).join("");
  $("ctChecklist").value = t ? t.checklist.join("\n") : "";
  $("ctDelete").classList.toggle("hidden", !t);
  setStatus("ctFormStatus", "", "");
  if ($("ctForm").scrollIntoView) $("ctForm").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("ctNew").onclick = () => openTypeForm(null);
$("ctCancel").onclick = () => $("ctForm").classList.add("hidden");
$("ctFieldAdd").onclick = () => $("ctFields").insertAdjacentHTML("beforeend", fieldRowHtml(null));
$("ctFields").onclick = (e) => { const b = e.target.closest("button.frm"); if (b) b.closest(".fieldrow").remove(); };
$("ctSave").onclick = async () => {
  const fields = [...$("ctFields").querySelectorAll(".fieldrow")].map((r) => ({ key: r.querySelector(".fk").value.trim(), title: r.querySelector(".ft").value.trim(), kind: r.querySelector(".fkind").value, options: r.querySelector(".fo").value.split("|").map((x) => x.trim()).filter(Boolean), required: r.querySelector(".fr").checked, sensitive: r.querySelector(".fs").checked }));
  const apSel = $("ctApproval").value; const approval = apSel === "group" ? "group:" + $("ctApprovalGroup").value.trim() : apSel;
  const a = { name: $("ctName").value, icon: $("ctIcon").value, description: $("ctDesc").value, fields, checklist: $("ctChecklist").value.split("\n").map((x) => x.trim()).filter(Boolean), queue: $("ctQueue").value, approval, defaultPriority: $("ctPrio").value, respondH: bigint($("ctRespond").value), resolveH: bigint($("ctResolve").value), dueField: $("ctDueField").value.trim(), visibility: $("ctVis").value, enabled: $("ctEnabled").checked };
  setStatus("ctFormStatus", "", "saving…");
  const r = await backend.upsertType(session.load(), bigint(ctEditId), a);
  setStatus("ctFormStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail);
  if (r.ok) { $("ctForm").classList.add("hidden"); loadCatalogAdmin(); }
};
$("ctDelete").onclick = async () => { if (!ctEditId || !confirm("Delete this request type?")) return; const r = await backend.removeType(session.load(), bigint(ctEditId)); setStatus("ctFormStatus", r.ok ? "ok" : "err", r.ok ? "deleted" : r.detail); if (r.ok) { $("ctForm").classList.add("hidden"); loadCatalogAdmin(); } };
$("ctDefaults").onclick = async () => { const r = await backend.resetCatalogDefaults(session.load()); setStatus("ctStatus", r.ok ? "ok" : "err", r.detail); loadCatalogAdmin(); };

// ai
async function loadAi() {
  const s = opt(await backend.getSettings(session.load())); if (!s) return;
  $("aiProvider").value = s.aiProvider; $("aiUrl").value = s.aiUrl; $("aiModel").value = s.aiModel; $("aiKey").value = "";
  $("aiKey").placeholder = s.aiKeySet ? "•••••••• (set)" : "not set";
  $("aiTriageOn").checked = !!s.aiTriage;
  const hubSettings = HUB_URL.startsWith("https://") ? `${HUB_URL}/#/settings/ai` : "#";
  $("aiSourceLine").innerHTML = s.aiSource === "hub" ? `<span class="pill on">from the hub</span> ${esc(s.aiHubModel)} — managed under <a href="${hubSettings}" target="_blank" rel="noopener">the hub's Settings → AI</a>`
    : s.aiSource === "local" ? `<span class="pill">local fallback</span> no key in the hub (or this app lacks the <i>AI</i> lane) — <a href="${hubSettings}" target="_blank" rel="noopener">set one in the hub</a> to share it across apps`
    : `<span class="pill off">off</span> no AI key anywhere — an owner sets one under <a href="${hubSettings}" target="_blank" rel="noopener">the hub's Settings → AI</a> and grants this app the <i>AI</i> lane (Apps → Edit → What it may know)`;
}
$("aiRefresh").onclick = async () => { setStatus("aiStatus", "", "asking the hub…"); const r = await backend.refreshAi(session.load()); setStatus("aiStatus", r.ok ? "ok" : "err", r.detail); loadAi(); };
$("aiTriageOn").onchange = async () => { await backend.setAiTriage(session.load(), $("aiTriageOn").checked); setStatus("aiStatus", "ok", $("aiTriageOn").checked ? "auto-triage on" : "auto-triage off"); };
$("aiSave").onclick = async () => { const r = await backend.setAi(session.load(), { provider: $("aiProvider").value, url: $("aiUrl").value.trim(), key: $("aiKey").value.trim(), model: $("aiModel").value.trim() }); setStatus("aiStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail); if (r.ok) { await refreshMe(); loadAi(); } };
$("aiTestBtn").onclick = async () => { setStatus("aiStatus", "", "testing…"); const r = await backend.aiTest(session.load()); setStatus("aiStatus", r.ok ? "ok" : "err", r.detail); };
$("aiClear").onclick = async () => { await backend.clearAiKey(session.load()); setStatus("aiStatus", "ok", "key cleared"); await refreshMe(); loadAi(); };

// slack intake
let skStatusCache = null, skTypes = [];
async function loadSlack() {
  const st = opt(await backend.slackStatus(session.load())); if (!st) return;
  skStatusCache = st;
  try { skTypes = await backend.adminCatalog(session.load()); } catch (e) { skTypes = []; }
  const bots = st.bots;
  const on = st.intakes.some((i) => i.enabled) && bots.length > 0;
  $("skPill").textContent = bots.length === 0 ? "no bot yet" : on ? "on" : "ready"; $("skPill").className = "pill " + (on ? "on" : bots.length === 0 ? "off" : "");
  $("skInfo").innerHTML = `<div>Bots from the hub</div><div>${bots.length ? bots.map((b) => `<b>${esc(b.name)}</b>${b.teamName ? " · " + esc(b.teamName) : ""}${b.hasSigning ? "" : ' <span class="pill off">no signing secret</span>'}`).join("<br>") : '<i>none — assign one to desk in the hub (Settings → Slack), then refresh</i>'}</div><div>Credentials</div><div>${Number(st.credsAt) ? "refreshed " + ago(st.credsAt) : "never fetched"}${st.credsError ? ` · <span class="pill off">${esc(st.credsError)}</span>` : ""}${Number(st.outbox) ? ` · ${Number(st.outbox)} message(s) waiting to go out` : ""}</div><div>Events URL</div><div class="mono">${esc(st.eventsUrl)}</div>`;
  $("skUrl").textContent = st.eventsUrl; $("skGateway").value = st.gateway;
  const typeName = (id) => (skTypes.find((t) => Number(t.id) === Number(id)) || {}).name || "?";
  const botName = (id) => { const b = bots.find((x) => Number(x.id) === Number(id)); return b ? (b.teamName || b.name) : "bot #" + id; };
  $("skRows").innerHTML = st.intakes.map((i) => `<tr data-id="${i.id}"><td><b>${esc(i.name)}</b><br><span class="kv mono">${esc(i.channel)}</span></td><td>${esc(botName(i.hubBotId))}</td><td><select data-type="${i.id}" style="min-width:150px">${skTypes.map((t) => `<option value="${t.id}"${Number(t.id) === Number(i.typeId) ? " selected" : ""}>${esc(t.icon)} ${esc(t.name)}</option>`).join("")}</select></td><td class="kv">${Number(i.lastEventAt) ? ago(i.lastEventAt) + (i.lastResult ? " · " + esc(i.lastResult) : "") : "nothing yet"}</td><td style="white-space:nowrap"><button class="sm" data-hello="${i.id}">Say hello</button> <button class="sm" data-toggle="${i.id}">${i.enabled ? "Pause" : "Resume"}</button> <button class="sm" data-rm="${i.id}">Remove</button></td></tr>`).join("") || '<tr><td colspan="5" class="kv">none yet — add a channel below</td></tr>';
  $("skRows").querySelectorAll("[data-type]").forEach((sel) => (sel.onchange = async () => { const i = st.intakes.find((x) => Number(x.id) === Number(sel.dataset.type)); const r = await backend.updateSlackIntake(session.load(), i.id, { name: i.name, typeId: bigint(sel.value), enabled: i.enabled }); setStatus("skStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail); }));
  $("skRows").querySelectorAll("[data-hello]").forEach((b) => (b.onclick = async () => { setStatus("skStatus", "", "posting…"); const r = await backend.slackSayHello(session.load(), bigint(b.dataset.hello)); setStatus("skStatus", r.ok ? "ok" : "err", r.detail); loadSlack(); }));
  $("skRows").querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => { const i = st.intakes.find((x) => Number(x.id) === Number(b.dataset.toggle)); const r = await backend.updateSlackIntake(session.load(), i.id, { name: i.name, typeId: i.typeId, enabled: !i.enabled }); setStatus("skStatus", r.ok ? "ok" : "err", r.ok ? (i.enabled ? "paused" : "resumed") : r.detail); loadSlack(); }));
  $("skRows").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => { if (!confirm("Stop listening in this channel? Existing requests and their threads stay.")) return; const r = await backend.removeSlackIntake(session.load(), bigint(b.dataset.rm)); setStatus("skStatus", r.ok ? "ok" : "err", r.ok ? "removed" : r.detail); loadSlack(); }));
  $("skBot").innerHTML = bots.map((b) => `<option value="${b.id}">${esc(b.teamName || b.name)}</option>`).join("") || '<option value="">no bot assigned yet</option>';
  $("skType").innerHTML = skTypes.filter((t) => t.enabled).map((t) => `<option value="${t.id}">${esc(t.icon)} ${esc(t.name)}</option>`).join("");
  $("skAddBtn").disabled = bots.length === 0;
}
$("skRefresh").onclick = async () => { setStatus("skStatus", "", "asking the hub…"); const r = await backend.slackRefresh(session.load()); setStatus("skStatus", r.ok ? "ok" : "err", r.ok ? `${Number(r.count)} bot(s)${r.detail ? " · " + r.detail : ""}` : r.detail); loadSlack(); };
$("skLoad").onclick = async () => {
  const bot = $("skBot").value; if (!bot) return setStatus("skAddStatus", "err", "assign a bot in the hub first");
  setStatus("skAddStatus", "", "loading channels…");
  const r = await backend.slackChannels(session.load(), bigint(bot));
  if (!r.ok) return setStatus("skAddStatus", "err", r.detail);
  $("skChannel").innerHTML = r.channels.map(([id, name]) => `<option value="${esc(id)}" data-name="${esc(name)}">#${esc(name)}</option>`).join("") || '<option value="">no channel — invite the bot first</option>';
  $("skChanHint").textContent = r.detail || `${r.channels.length} channel(s) the bot is in`;
  setStatus("skAddStatus", "", "");
};
$("skAddBtn").onclick = async () => {
  const sel = $("skChannel"); const ch = sel.value; if (!ch) return setStatus("skAddStatus", "err", "load and pick a channel");
  const name = (sel.selectedOptions[0] || {}).dataset ? sel.selectedOptions[0].dataset.name || "" : "";
  setStatus("skAddStatus", "", "adding…");
  const r = await backend.addSlackIntake(session.load(), { name: name ? "#" + name : "", hubBotId: bigint($("skBot").value), channel: ch, channelName: name, typeId: bigint($("skType").value) });
  setStatus("skAddStatus", r.ok ? "ok" : "err", r.ok ? "added — try Say hello" : r.detail);
  if (r.ok) loadSlack();
};
$("skUrlCopy").onclick = async () => { try { await navigator.clipboard.writeText($("skUrl").textContent); setStatus("skStatus", "ok", "copied"); } catch (e) { setStatus("skStatus", "err", "select and copy by hand"); } };
$("skGatewaySave").onclick = async () => { const r = await backend.setSlackGateway(session.load(), $("skGateway").value.trim() || "icp.net"); setStatus("skStatus", r.ok ? "ok" : "err", r.ok ? "saved — the events URL changed, update it in Slack" : r.detail); loadSlack(); };

// log
async function loadLog() {
  const rows = await backend.adminLogRows(session.load());
  $("logRows").innerHTML = rows.map((r) => `<tr><td class="kv" style="white-space:nowrap">${fmt(r.at)}</td><td class="mono">${esc(r.who)}</td><td>${esc(r.what)}</td></tr>`).join("") || '<tr><td colspan="3" class="empty">Nothing yet.</td></tr>';
}

boot().finally(() => signIn.ready()).catch((e) => { console.error(e); setStatus("loginStatus", "err", "We couldn’t connect to Desk. Check your connection and try signing in again."); });

// Roles are configured in the Hub; the app exposes no local privilege controls.
for (const link of document.querySelectorAll("[data-hub-permissions-link]")) link.href = HUB_URL.replace(/\/$/, "") + "/#/permissions";
