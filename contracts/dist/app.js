import {renderAssignments} from "./license-assignment.js";
import {renderSaas} from "./saas-workspace.js";
import { analysisPending, proposalIds, watchAnalysis, analysisFeedback, busyButton } from "./analysis-progress.js";
import { commercialFields, renderCommercialDetails } from "./commercial-details.js";
import { uploadDocument } from "./document-upload.js";
import { renderIntakeReview } from "./intake-review.js";
import { idlFactory } from "./idl.js";
import { appSignIn, takeHubTicket, session, mountTopbar, topbarIdlFactory } from "./hub-client.js";

// deploy-time constants (INSTALL.md: sed the placeholders; the kitchen patches them on install)
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const HUB_URL = "__HUB_URL__"; // hub FRONTEND url, e.g. https://xxxxx.icp.net
const IC_HOST = "https://icp0.io";
session.key = "ks-contracts-session";

const signIn = appSignIn({ name: "Contracts", hubUrl: HUB_URL });

const $ = (id) => document.getElementById(id);
const opt = (o) => (o && o.length ? o[0] : null); // candid opt unwrap
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtD = (ns) => { if (!ns) return "—"; const d = new Date(Number(BigInt(ns) / 1000000n)); return d.toLocaleDateString("en-CH", { day: "2-digit", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("en-CH", { hour: "2-digit", minute: "2-digit" }); };
const fmtDay = (iso) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "—"; return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
const fmtDate = (ns) => ns ? new Date(Number(BigInt(ns) / 1000000n)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No messages yet";
const N = (x) => (typeof x === "bigint" ? Number(x) : Number(x ?? 0));
const toDec = (minorText) => { const s = String(minorText ?? "").trim(); if (!/^-?\d+$/.test(s)) return s; const neg = s.startsWith("-"); const d = s.replace("-", "").padStart(3, "0"); return (neg ? "-" : "") + d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + d.slice(-2); };
const money = (minor, cur) => (minor === null || minor === undefined ? "" : toDec(String(minor)) + (cur ? " " + cur : ""));
const MONEY_FIELDS = ["amountMinor", "unitMinor"];
const FIELD_LBL = { recordType: "Document type", title: "Title", vendor: "Vendor", product: "Product", customerRef: "Customer reference", amountMinor: "Amount", currency: "Currency", taxBasis: "Tax basis", interval: "Billed", quantity: "Quantity", unitMinor: "Unit price", start: "Start", end: "End", renewalRule: "Renewal", renewalDate: "Renewal date", noticeDays: "Notice (days)", noticeMonths: "Notice (months)", noticeDate: "Last cancellation date", seats: "Seats", note: "Note" };
const INTERVAL_LBL = { "": "unknown", month: "monthly", quarter: "quarterly", year: "yearly", once: "once", other: "other", none: "no payment" };
const RENEWAL_LBL = { "": "unknown", auto: "renews automatically", manual: "renews only if we act", none: "does not renew", indefinite: "no fixed expiry" };
const CSTATUS_LBL = { draft: "DRAFT", active: "ACTIVE", cancelling: "CANCELLING", endConfirmed: "END CONFIRMED", ended: "ENDED", archived: "ARCHIVED" };
const SSTATUS_LBL = { received: "RECEIVED", processing: "PROCESSING", review: "READY FOR REVIEW", filed: "FILED", ignored: "IGNORED", failed: "FAILED" };
const RULE_LBL = { senderAddress: "sender address", senderDomain: "sender domain", customerRef: "customer reference", subjectContains: "subject contains" };
const KIND_LBL = { offer: "offer", negotiation: "negotiation", order_confirmation: "order confirmation", invoice: "invoice", renewal_notice: "renewal notice", price_change: "price change", cancellation_request: "cancellation request", cancellation_confirmation: "cancellation confirmation", amendment: "amendment", signature_request: "awaiting signature", execution_reported: "signing reported — unverified", other: "other", unclear: "unclear" };
for (const [key,label] of commercialFields) FIELD_LBL[key]=label;
const tag = (st, lbl) => `<span class="tag ${esc(st)}"><span class="dot"></span>${esc(lbl || st)}</span>`;
const days = (d) => (d === null || d === undefined ? "" : (N(d) < 0 ? `${-N(d)} days ago` : N(d) === 0 ? "today" : `in ${N(d)} days`));
let toastT = null;
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2800); }
function confirmBox(text, cb, {confirmLabel="Confirm", pendingLabel="Working…"} = {}) {
  const yes=$("cmYes"), no=$("cmNo");
  $("cmText").textContent = text; $("confirmModal").classList.add("on"); yes.textContent=confirmLabel;
  yes.onclick = async () => {
    if (yes.disabled) return;
    yes.disabled=true; no.disabled=true; yes.textContent=pendingLabel; yes.setAttribute("aria-busy","true");
    try { if (await cb() !== false) $("confirmModal").classList.remove("on"); }
    catch (_) { $("cmText").textContent = "The change could not be confirmed. Check your connection and refresh before retrying."; }
    finally { yes.disabled=false; no.disabled=false; yes.textContent=confirmLabel; yes.removeAttribute("aria-busy"); }
  };
  no.onclick = () => $("confirmModal").classList.remove("on");
}
function setStatus(id, cls, text) { if (id === "loginStatus") signIn.status(cls, text); const el = $(id); if (!el) return; el.className = "status " + (cls || ""); el.textContent = text || ""; }
function download(name, text, mime) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime || "text/plain" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const jsonSafe = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x instanceof Uint8Array ? Array.from(x) : x), 2);
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/* ============================== the shared topbar · session · routing ============================== */
let backend = null, hubActor = null, topbar = null, me = null, info = null;
let hubTok = "", spaces = [], currentSpace = null, switchingSpace = false;
let routeEpoch = 0;
const readVersions = new Map();
function viewGuard(key) {
  const token = hubTok, epoch = routeEpoch, hash = location.hash, version = (readVersions.get(key) || 0) + 1;
  readVersions.set(key, version);
  return () => token !== hubTok || epoch !== routeEpoch || hash !== location.hash || switchingSpace || readVersions.get(key) !== version;
}
async function withAction(button, statusId, action) {
  if (button.disabled) return;
  const token = hubTok;
  const restore = busyButton(button, "Working…");
  try { await action(token); }
  catch (_) { if (token === hubTok) { setStatus(statusId, "err", "Could not save. Check your connection and try again."); toast("The change could not be confirmed. Please check before retrying."); } }
  finally { if (token === hubTok && button.isConnected) { restore(); button.disabled = !isStaff(); } }
}
const hubSignedIn = () => !!(hubTok && me);
const spaceRoleName = () => Object.keys(opt(me?.spaceRole) || {})[0] || "viewer";
const isStaff = () => !!me && ["owner", "editor"].includes(spaceRoleName()) && !currentSpace?.archived;
const isAdmin = () => !!me && me.role === "admin";

function mountBar() {
  if (!me) return;
  const person = { email: me.email, displayName: me.displayName, role: me.role };
  if (topbar) { topbar.setPerson(person); topbar.setApp({ eyebrow: me.orgName || "" }); return; }
  topbar = mountTopbar($("topbar"), {
    hub: { actor: () => hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
    app: { id: "contracts", name: "Contracts", eyebrow: me.orgName || "" },
    person,
    onSignOut: signOut,
  });
}
async function refreshMe() {
  const token = hubTok || session.load();
  const w = opt(await backend.whoami(token));
  if (token !== (hubTok || session.load())) return !!me;
  if (!w) return false;
  me = w; hubTok ||= session.load(); mountBar();

  $("aiBox").classList.toggle("hidden", me.aiOn || me.aiChecked === false || !isStaff());
  $("navConn").classList.remove("hidden");
  document.querySelectorAll(".spacewriter").forEach(el => el.classList.toggle("hidden", !isStaff()));
  ["cNew", "ibPaste", "ibEml"].forEach(id => { $(id).disabled = !isStaff(); });
  const uploadLabel = $("ibAdd"); if (uploadLabel) uploadLabel.classList.toggle("hidden", !isStaff());
  document.querySelectorAll("#viewConn .tabs .adm, #viewConn .adm").forEach((b) => b.classList.toggle("hidden", !isAdmin()));
  return true;
}
function signOut() {
  routeEpoch++;
  const t = session.load(); session.clear();
  if (t) backend.signOut(t).catch(() => {});
  me = null; hubTok = ""; if (topbar) { topbar.destroy(); topbar = null; }
  $("layout").classList.remove("on"); $("login").style.display = "grid"; setStatus("loginStatus", "", "signed out");
}
$("loginBtn").onclick = () => signIn.continue();

function show(id) {
  $("workspaceState").classList.add("hidden");
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("on"));
  $(id).classList.add("on");
  window.scrollTo(0, 0);
}
function setNav(key) { document.querySelectorAll(".mainnav button").forEach((b) => b.classList.toggle("on", b.dataset.nav === key)); }
document.querySelectorAll(".mainnav button").forEach((b) => { b.onclick = () => { location.hash = "#/" + b.dataset.nav; }; });
// tabs with hash deep links: <div class="tabs"><button data-tab=x> … panes are #<prefix><Tab>
function showTab(sectionId, prefix, name, panes) {
  const sec = $(sectionId);
  sec.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  panes.forEach((p) => $(prefix + p[0].toUpperCase() + p.slice(1)).classList.toggle("hidden", p !== name));
}
async function routeView() {
  if (switchingSpace) return;
  routeEpoch++;
  const h = location.hash || "";
  if (!hubSignedIn()) { $("layout").classList.remove("on"); $("login").style.display = "grid"; return; }
  $("login").style.display = "none"; $("layout").classList.add("on");
  let m;
  if ((m = h.match(/^#\/s\/([^/]+)\/(.*)$/))) {
    if (switchingSpace) return;
    if (!(await chooseSpace(m[1], false))) return;
    history.replaceState(null, "", "#/" + m[2]); return route();
  }
  if(h === "#/tasks"){setNav("today");return enterToday();}
  if(h === "#/contracts/advanced"){setNav("contracts");return enterContracts();}
  if(h === "#/settings") {setNav("settings");return enterSaas("settings");}
  if(h === "#/reports") {setNav("today");return enterSaas("reports");}
  if((m=h.match(/^#\/keys(?:\/(new|\d+))?$/))){setNav("keys");return enterSaas("keys",m[1]||null);}
  if (h === "#/add") { setNav("contracts"); return enterIntake(); }
  if ((m = h.match(/^#\/intake\/(\d+)$/))) { setNav("inbox"); return enterIntake(Number(m[1])); }
  if (h.startsWith("#/space")) { setNav(""); return enterSpace(); }
  if ((m = h.match(/^#\/inbox\/(\d+)(?:\/(\w+))?/))) { setNav("inbox"); return enterSource(Number(m[1]), m[2] || "proposals"); }
  if (h === "#/trash") { setNav("trash"); return enterTrash(); }
  if (h.startsWith("#/inbox")) { setNav("inbox"); return enterInbox(); }
  if ((m = h.match(/^#\/c\/(\d+)(?:\/(\w+))?/))) { setNav("contracts"); return enterRecord(Number(m[1]), m[2] || "terms"); }
  if (h.startsWith("#/contracts")) { setNav("contracts"); return enterSaas("subscriptions",h === "#/contracts/due"?"soon":null); }
  if ((m = h.match(/^#\/connection(?:\/(\w+))?/))) { setNav("connection"); return enterConn(m[1] || "status"); }
  if (h === "#/mail-setup") { setNav("docs"); show("viewMailSetup"); return; }
  if (h.startsWith("#/docs")) { setNav("docs"); show("viewDocs"); return; }
  setNav("today"); return enterSaas("overview");
}
async function enterSaas(page,id=null){show("viewSaas");return renderSaas($("saasBody"),{api:backend,token:hubTok,stale:viewGuard("saas"),space:currentSpace,me,canWrite:isStaff(),download,toast},page,id);}
async function route() {
  const token = hubTok, hash = location.hash;
  try { return await routeView(); }
  catch (_) {
    if (token !== hubTok || hash !== location.hash || switchingSpace) return;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("on"));
    $("workspaceState").innerHTML = 'This view could not be loaded. <button class="pill outline sm" id="retryView">Try again</button>';
    $("workspaceState").classList.remove("hidden"); $("retryView").onclick = route;
  }
}
window.addEventListener("hashchange", route);

async function boot() {
  const { HttpAgent, Actor } = await import("./agent-bundle.js");
  const agent = await HttpAgent.create({ host: IC_HOST });
  backend = Actor.createActor(idlFactory, { agent, canisterId: BACKEND_CANISTER_ID });
  try { info = await backend.info(); if (info.hubId) hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId }); if (info.orgName) $("loginSub").textContent = `${info.orgName} · contracts`; if (!info.hubSet) { $("loginWarn").classList.remove("hidden"); $("loginWarn").textContent = "This app is not connected to your company Hub yet. Contact your IT team."; } } catch (e) {}
  const ticket = takeHubTicket();
  if (ticket) {
    session.clear(); // A rejected new ticket must never fall back to another account’s old session.
    setStatus("loginStatus", "", "signing in…");
    const r = opt(await backend.loginWithTicket(ticket));
    if (r) { session.save(r.token); session.saveSuite(r.suiteToken || ""); } else setStatus("loginStatus", "err", "the hub ticket was not accepted — try again from the hub");
  }
  if (session.load() && (await refreshMe())) {
    await loadSpaces();
    let preferred = ""; try { preferred = localStorage.getItem("ks-contracts-space") || ""; } catch (_) {}
    if (!location.hash.startsWith("#/s/")) { if (await chooseSpace(spaces.some(s => s.id === preferred) ? preferred : spaces[0]?.id, false)) route(); } else route();
    setInterval(async () => { if (switchingSpace) return; try { if (await refreshMe()) { await loadSpaces(); return; } } catch (_) {} signOut(); setStatus("loginStatus", "err", "Your access could not be confirmed. Check the hub connection and sign in again from the hub."); }, 30000);
  } else { session.clear(); route(); }
}

/* A space token is kept in this tab only; all server reads and writes use that boundary. */
async function loadSpaces() {
  spaces = await backend.listSpaces(session.load());
  if (me?.space) currentSpace = spaces.find(s => s.id === me.space) || null;
  $("spaceSelect").innerHTML = spaces.map(s => `<option value="${esc(s.id)}">${s.kind === "personal" ? "◉ " : "▦ "}${esc(s.name)}${s.archived ? " · archived" : ""}</option>`).join("");
  if (currentSpace) $("spaceSelect").value = currentSpace.id;
  $("spaceAccess").textContent = currentSpace?.archived ? "Archived · read-only" : currentSpace?.kind === "personal" ? "Owner and app admins" : currentSpace?.kind === "intake" ? "App admins (Hub)" : ({owner:"Space owner",editor:"Can edit",viewer:"Read-only"}[spaceRoleName()] || "Read-only");
  $("spaceManage").textContent = currentSpace?.kind === "team" ? "Members & settings" : currentSpace?.kind === "intake" ? "Access & mail setup" : "About this space";
}
async function chooseSpace(id, navigate = true) {
  if (!id || switchingSpace) return false;
  switchingSpace = true; routeEpoch++;
  const previous = { token: hubTok, space: currentSpace, person: me, hash: location.hash };
  let opened = false, denied = false;
  document.querySelectorAll(".modal.on,.drawer.on").forEach(el => el.classList.remove("on"));
  document.querySelectorAll(".view").forEach(el => el.classList.remove("on"));
  $("workspaceState").textContent = "Opening workspace…"; $("workspaceState").classList.remove("hidden");
  $("spaceSelect").disabled = true;
  try {
    const r = await backend.openSpace(session.load(), id);
    if (!r.ok) { toast(r.detail || "This workspace could not be opened."); return false; }
    hubTok = r.token; currentSpace = spaces.find(s => s.id === id) || null;
    cur = null; curSrc = null; contractTitleCache.clear();
    if (!(await refreshMe())) { denied = true; signOut(); return false; }
    await loadSpaces();
    try { localStorage.setItem("ks-contracts-space", id); } catch (_) {}
    opened = true;
    return true;
  } catch (_) { toast("Could not open this workspace. Your previous workspace is still available."); return false; }
  finally {
    switchingSpace = false; $("spaceSelect").disabled = false;
    if (opened) {
      $("ibUpload").classList.add("hidden"); $("ibUpload").textContent = "";
      if (navigate) { history.replaceState(null, "", "#/today"); route(); }
    } else if (!denied) {
      hubTok = previous.token; currentSpace = previous.space; me = previous.person;
      if (previous.space) {
        $("spaceSelect").value = previous.space.id;
        history.replaceState(null, "", previous.hash.startsWith("#/s/") ? "#/today" : previous.hash || "#/today");
        route();
      } else $("workspaceState").textContent = "Workspace unavailable. Choose another workspace above or reload to try again.";
    }
  }
}
$("spaceSelect").onchange = () => chooseSpace($("spaceSelect").value);
$("spaceManage").onclick = () => { location.hash = "#/space"; };
$("spBack").onclick = () => { location.hash = "#/contracts"; };
$("spaceCreate").onclick = () => { $("spNewName").value = ""; $("spNewDescription").value = ""; setStatus("spNewStatus", "", ""); $("spaceModal").classList.add("on"); $("spNewName").focus(); };
$("spNewCancel").onclick = () => $("spaceModal").classList.remove("on");
$("spNewSave").onclick = async () => {
  $("spNewSave").disabled = true;
  try {
    const r = await backend.createSpace(session.load(), $("spNewName").value.trim(), $("spNewDescription").value.trim());
    if (!r.ok) { setStatus("spNewStatus", "err", r.detail); return; }
    $("spaceModal").classList.remove("on"); await loadSpaces(); await chooseSpace(r.id, false); location.hash = "#/space"; await enterSpace(); toast("Teamspace created — add your colleagues");
  } catch (e) { setStatus("spNewStatus", "err", "Could not create the teamspace. Please retry."); }
  finally { $("spNewSave").disabled = false; }
};
async function enterSpace() {
  const viewToken = hubTok, staleView = viewGuard("enterSpace");
  show("viewSpace"); const box = $("spContent"); box.innerHTML = '<div class="empty">Loading…</div>';
  $("spHeading").textContent = currentSpace?.name || "Workspace";
  $("spIntro").textContent = currentSpace?.kind === "intake" ? "A shared inbox for Hub-assigned app admins to review and distribute incoming documents." : "Members share this space’s contracts, inbox and deadlines. Hub-assigned app admins can access personal and teamspaces.";
  if (currentSpace?.kind === "intake") {
    const v = opt(await backend.getSpace(viewToken)); if (staleView()) return;
    if (!v) { box.innerHTML = '<div class="empty">This space is no longer available.</div>'; return; }
    box.innerHTML = `<div class="scard"><h3>Access follows your Hub roles</h3><p class="spacehelp">Hub-assigned app admins can review this inbox and file documents. Everyone may submit by email; this does not give them access. Admins assigned to Contracts in Hub also have access.</p><div class="spacepeople">${v.members.map(m => `<div class="spacemember"><span>${esc(m.name || m.pid)}</span><span class="spacehelp">App admin (Hub)</span></div>`).join("")}</div><p class="spacehelp">Manage these roles in the Hub. Role and account changes take effect within the Hub’s 60-second access lease. Employees keep workspace membership rules; app admins can access all workspaces.</p></div><div class="scard"><h3>Connect the shared email inbox</h3><p class="spacehelp">Follow the <a href="#/mail-setup">Google Workspace mail setup guide</a>. First trust the relay’s public principal in <a href="#/connection/relay">Workspace tools → Mail setup</a>, then connect it here. Email addresses and subjects cannot choose another workspace.</p><div class="btnrow"><input id="spRelay" aria-label="Trusted relay principal" placeholder="Trusted relay principal"><button class="pill outline sm" id="spRelayConnect">Connect relay</button><button class="linkbtn" id="spRelayDisconnect">Disconnect</button></div><div class="status" id="spRelayStatus" role="status"></div></div>`;
    bindSpaceRelay(viewToken, staleView); return;
  }
  if (currentSpace?.kind !== "team") {
    box.innerHTML = `<div class="scard"><h3>${currentSpace?.kind === "personal" ? "Your own contract store" : "Your existing contracts"}</h3><p class="spacehelp">${currentSpace?.kind === "personal" ? "Keep your own agreements, licences and subscriptions here. Your account and Hub-assigned app admins can open this workspace. To collaborate, create a teamspace and add its members." : "Existing content stays in place. App admins have access; employees need explicit responsibility or record access."}</p><p class="spacehelp">AI suggestions always need your review. This is access control inside Kebabstack; documents are not end-to-end encrypted. Your organisation’s hosting operators and configured AI service remain part of the processing environment.</p></div>`;
    return;
  }
  const token = hubTok, v = opt(await backend.getSpace(token)); if (token !== hubTok) return;
  if (staleView()) return;
  if (!v) { box.innerHTML = '<div class="empty">This space is no longer available.</div>'; return; }
  const owner = spaceRoleName() === "owner"; let members = v.members.map(x => ({...x}));
  box.innerHTML = `<div class="scard"><div class="spacefields"><label>Name<input id="spName" maxlength="80" value="${esc(v.space.name)}" ${owner ? "" : "disabled"}></label><label>Description<textarea id="spDescription" maxlength="500" ${owner ? "" : "disabled"}>${esc(v.space.description)}</textarea></label></div><div class="dsec">Members</div><p class="spacehelp">Owners manage membership. Editors manage records and incoming documents. Viewers can read and export. Removing someone ends access to this space immediately.</p><div id="spMembers" class="spacepeople"></div>${owner ? `<div class="pick"><input id="spPerson" placeholder="Add a colleague from the Hub" autocomplete="off"><div id="spPersonList" class="list hidden"></div></div><label class="spacehelp"><input type="checkbox" id="spArchived" ${v.space.archived ? "checked" : ""}> Archive this space (keep its contents readable)</label><div class="btnrow"><button id="spSave" class="pill primary">SAVE SPACE</button><span class="status" id="spStatus"></span></div><div class="dsec">Mail intake</div><p class="spacehelp">Use a separate relay identity for this workspace. The operator first trusts it under Workspace tools → Relay; you then authorize it here. Sender names and email subjects never choose a workspace.</p><div class="btnrow"><input id="spRelay" placeholder="Trusted relay principal"><button class="pill outline sm" id="spRelayConnect">CONNECT RELAY</button><button class="linkbtn" id="spRelayDisconnect">DISCONNECT</button></div><div class="status" id="spRelayStatus"></div>` : ""}</div>`;
  function renderMembers() {
    $("spMembers").innerHTML = members.map((m,i) => `<div class="spacemember"><span>${esc(m.name || m.pid)}${m.active === false ? " · inactive" : ""}</span><select data-role="${i}" aria-label="Role for ${esc(m.name || m.pid)}" ${owner ? "" : "disabled"}>${["owner","editor","viewer"].map(r => `<option value="${r}" ${Object.keys(m.role)[0] === r ? "selected" : ""}>${r}</option>`).join("")}</select>${owner ? `<button class="linkbtn" data-remove="${i}">Remove</button>` : ""}</div>`).join("");
    box.querySelectorAll("[data-role]").forEach(el => el.onchange = () => { members[Number(el.dataset.role)].role = {[el.value]:null}; });
    box.querySelectorAll("[data-remove]").forEach(el => el.onclick = () => { members.splice(Number(el.dataset.remove),1); renderMembers(); });
  }
  renderMembers(); if (!owner) return;
  attachPicker("spPerson", "spPersonList", p => { members.push({pid:p.id,name:p.displayName,role:{editor:null},active:true}); renderMembers(); }, () => members.map(m => m.pid));
  $("spSave").onclick = async () => {
    $("spSave").disabled = true;
    try {
      const r = await backend.updateSpace(token, v.space.revision, $("spName").value.trim(), $("spDescription").value.trim(), members.map(m => ({pid:m.pid,role:m.role})), $("spArchived").checked);
      if (!r.ok) { setStatus("spStatus", "err", r.detail); return; }
      await loadSpaces();
      if (!(await refreshMe())) { hubTok = session.load(); await refreshMe(); await chooseSpace(spaces[0]?.id); }
      else { await enterSpace(); toast("Space updated"); }
    } catch (_) { setStatus("spStatus", "err", "Could not save. Reload and try again."); }
    finally { if ($("spSave")) $("spSave").disabled = false; }
  };
  bindSpaceRelay(token, staleView);
}
function bindSpaceRelay(token, staleView) {
  let saving = false;
  for (const [id, enabled] of [["spRelayConnect", true],["spRelayDisconnect",false]]) $(id).onclick = async () => {
    if (saving || staleView()) return;
    saving = true; $("spRelayConnect").disabled = $("spRelayDisconnect").disabled = true;
    try {
      const r = await backend.setSpaceRelay(token, $("spRelay").value.trim(), enabled);
      if (!staleView()) setStatus("spRelayStatus", r.ok ? "ok" : "err", r.ok ? (enabled ? "Relay connected to this workspace" : "Relay disconnected") : r.detail);
    } catch (_) { if (!staleView()) setStatus("spRelayStatus", "err", "Connection could not be saved. Please retry."); }
    finally { saving = false; if (!staleView()) $("spRelayConnect").disabled = $("spRelayDisconnect").disabled = false; }
  };
}

/* ============================== pickers (hub directory · contracts) ============================== */
// people: onPick({ id, email, displayName }) — ids are hub person ids, the only thing the backend stores
function attachPicker(inputId, listId, onPick, exclude) {
  const input = $(inputId), list = $(listId);
  let timer = 0;
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => {
    const q = input.value.trim();
    if (q.length < 1) { list.classList.add("hidden"); return; }
    if (input.dataset.allowGroup === "1" && /^group:/i.test(q)) { list.innerHTML = `<div data-id="${esc(q)}" data-name="${esc(q)}">${esc(q)}<small>a hub group as deputy</small></div>`; list.classList.remove("hidden"); return; }
    let rows = [];
    try { rows = await backend.directory(hubTok, q); } catch (_) {}
    rows = rows.filter((r) => !(exclude && exclude().includes(r.id)));
    list.innerHTML = rows.map((r) => `<div data-id="${esc(r.id)}" data-email="${esc(r.email)}" data-name="${esc(r.displayName)}">${esc(r.displayName || r.email)}<small>${esc(r.email)}${r.department ? " · " + esc(r.department) : ""}</small></div>`).join("") || '<div style="cursor:default;color:var(--ks-fg-muted)">nobody in the directory matches</div>';
    list.classList.remove("hidden");
  }, 180); };
  list.onclick = (e) => { const d = e.target.closest("[data-id]"); if (!d) return; input.value = ""; list.classList.add("hidden"); onPick({ id: d.dataset.id, email: d.dataset.email || "", displayName: d.dataset.name || d.dataset.email || d.dataset.id }); };
  input.onblur = () => setTimeout(() => list.classList.add("hidden"), 200);
}
const chip = (name, id, gone) => `<span class="chipp${gone ? " gone" : ""}" data-id="${esc(id)}">${esc(name)}<button title="Remove" data-rm="${esc(id)}">×</button></span>`;
function attachContractPicker(inputId, listId, onPick) {
  const input = $(inputId), list = $(listId);
  let timer = 0;
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => {
    const q = input.value.trim();
    if (q.length < 1) { list.classList.add("hidden"); return; }
    let rows = [];
    try { rows = await backend.listContracts(hubTok, { q, status: "", responsible: "", onlyIncomplete: false, onlyDue: false, includeArchived: false }); } catch (_) {}
    list.innerHTML = rows.slice(0, 12).map((r) => `<div data-cid="${r.id}" data-name="${esc(r.title)}">${esc(r.title)}<small>${esc(r.vendor)}${r.product ? " · " + esc(r.product) : ""} · ${esc(CSTATUS_LBL[r.status] || r.status)}</small></div>`).join("") || '<div style="cursor:default;color:var(--ks-fg-muted)">no contract matches</div>';
    list.classList.remove("hidden");
  }, 180); };
  list.onclick = (e) => { const d = e.target.closest("[data-cid]"); if (!d) return; input.value = ""; list.classList.add("hidden"); onPick(Number(d.dataset.cid), d.dataset.name); };
  input.onblur = () => setTimeout(() => list.classList.add("hidden"), 200);
}
// one-person modal (assign a proposal or task)
let ppPicked = null, ppCb = null;
attachPicker("ppIn", "ppList", (p) => { ppPicked = p; $("ppChip").innerHTML = chip(p.displayName, p.id); });
$("ppChip").onclick = (e) => { if (e.target.dataset.rm) { ppPicked = null; $("ppChip").innerHTML = ""; } };
// snooze picker (tasks and proposals share it)
let snCb = null;
function snooze(cb) { snCb = cb; $("snSel").value = "7"; setStatus("snStatus", "", ""); $("snoozeModal").classList.add("on"); }
$("snCancel").onclick = () => $("snoozeModal").classList.remove("on");
$("snSave").onclick = async () => { const r = await snCb(Number($("snSel").value)); if (r && r.ok === false) { setStatus("snStatus", "err", r.detail); return; } $("snoozeModal").classList.remove("on"); };
function pickPerson(title, cb) { ppPicked = null; ppCb = cb; $("ppTitle").textContent = title; $("ppChip").innerHTML = ""; $("ppIn").value = ""; setStatus("ppStatus", "", ""); $("pickPersonModal").classList.add("on"); $("ppIn").focus(); }
$("ppCancel").onclick = () => $("pickPersonModal").classList.remove("on");
$("ppSave").onclick = async () => { if (!ppPicked) { setStatus("ppStatus", "err", "pick a person"); return; } const r = await ppCb(ppPicked); if (r && r.ok === false) { setStatus("ppStatus", "err", r.detail); return; } $("pickPersonModal").classList.remove("on"); };

async function trashItem(kind,id,title) {
  const token=hubTok, stale=viewGuard("trashItem");
  confirmBox('Delete “'+(title||'this item')+'”? It moves to Trash and can be restored. '+(kind==='contract'?'Its linked documents and reminders leave the active workspace too.':''),async()=>{
    try{const r=await backend.setTrashed(token,kind,id,true);if(stale())return;toast(r.ok?'Moved to Trash':r.detail);if(r.ok){cur=null;curSrc=null;location.hash='#/trash';}}
    catch(_){if(!stale())toast('Could not confirm deletion. Reload before retrying.');}
  });
}
async function enterTrash() {
  show('viewTrash');const token=hubTok,stale=viewGuard('trashView'),box=$('trashList');box.innerHTML='<div class="empty">Opening Trash…</div>';
  try{
    const rows=await backend.listTrash(token);if(stale())return;
    box.innerHTML=rows.length?rows.map(r=>'<div class="trash-row"><div><strong>'+esc(r.title||'Untitled document')+'</strong><p>'+esc(r.kind==='source'?'Inbox document':'Saved record')+' · Deleted '+esc(fmtD(r.deletedAt))+' by '+esc(r.deletedBy)+'</p></div><div class="trash-actions"><button class="pill outline sm" data-restore="'+r.kind+':'+r.id+'" '+(r.canRestore?'':'disabled')+'>Restore</button><button class="pill outline sm permanent-delete" data-purge="'+r.kind+':'+r.id+'" '+(r.canRestore?'':'disabled')+'>Delete permanently</button></div></div>').join(''):'<div class="empty"><strong>Trash is empty.</strong>Deleted records and inbox documents appear here until you restore or permanently delete them.</div>';
    box.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{b.disabled=true;const[k,id]=b.dataset.restore.split(':');try{const r=await backend.setTrashed(token,k,BigInt(id),false);if(stale())return;toast(r.ok?'Restored':r.detail);if(r.ok)await enterTrash();else b.disabled=false;}catch(_){if(!stale()){toast('Could not restore. Please retry.');b.disabled=false;}}});
    box.querySelectorAll('[data-purge]').forEach(b=>b.onclick=()=>{
      const [kind,id]=b.dataset.purge.split(':'),row=rows.find(r=>r.kind===kind&&String(r.id)===id);
      if (!row?.canRestore || stale()) return;
      const scope=kind==='contract'?'The record, linked documents, license key and stored cost history will be removed.':'The inbox document, its files and AI readings will be removed. Saved contract details will be kept.';
      confirmBox('Permanently delete “'+(row.title||'this item')+'”? '+scope+' Files used by other documents are kept. This cannot be undone in Contracts.',async()=>{
        if (stale()) return;
        const result=await backend.deletePermanently(token,kind,BigInt(id));
        if (stale()) return;
        if (!result.ok) {toast(result.detail||'Could not delete this item. Refresh Trash and try again.');return false;}
        toast('Permanently deleted');cur=null;curSrc=null;await enterTrash();
      },{confirmLabel:'Delete permanently',pendingLabel:'Deleting…'});
    });
  }catch(_){if(!stale())box.innerHTML='<div class="empty">Trash could not be loaded. <a href="#/inbox">Return to inbox</a></div>';}
}
/* ============================== today ============================== */
$("ibAdd").onclick = () => { if (isStaff()) location.hash = "#/add"; };
$("tAdd").onclick = () => { if (isStaff()) location.hash = "#/add"; };
$("tRefresh").onclick = () => enterToday();
async function enterToday() {
  const viewToken = hubTok, staleView = viewGuard("enterToday");
  show("viewToday");
  $("tBody").innerHTML = `<div class="empty">Loading…</div>`;
  let t = null;
  try { t = opt(await backend.today(hubTok)); } catch (e) { if (staleView()) return; $("tBody").innerHTML = `<div class="empty">Could not load: ${esc(String(e).slice(0, 160))}</div>`; return; }
  if (staleView()) return;
  if (!t) { $("tBody").innerHTML = `<div class="empty">No session — sign in again from the hub.</div>`; return; }
  const open = t.proposals.length + t.tasks.length;
  $("nToday").textContent = open; $("nToday").classList.toggle("hidden", !open);
  $("nInbox").textContent = N(t.inboxOpen); $("nInbox").classList.toggle("hidden", !N(t.inboxOpen));
  $("tContext").textContent = currentSpace?.kind === "personal" ? "Personal workspace. Its owner and Hub-assigned app admins can access its agreements and documents." : currentSpace?.kind === "intake" ? "Incoming documents for Hub-assigned app admins. Review the facts, then choose where each agreement belongs." : `Everything below belongs to ${currentSpace?.name || "this workspace"}. Shared with this team’s members${currentSpace?.archived ? " · archived, read-only" : ""}.`;
  const stat = (value, label, note, href, cls = "") => `<a class="tstat ${cls}" href="${href}"><div class="l">${label}</div><div class="v${typeof value === "string" ? " date-value" : ""}">${esc(value)}</div><div class="stat-note">${note}</div></a>`;
  $("tStats").innerHTML = stat(N(t.contracts), "Contracts", "View your contract library →", "#/contracts") + stat(N(t.dueSoon), "Upcoming decisions", "Within the next 60 days", "#/contracts/due", N(t.dueSoon) ? "is-action" : "") + stat(N(t.inboxOpen), "Inbox to review", "Open documents & messages →", "#/inbox", N(t.inboxOpen) ? "is-action" : "") + stat(fmtDate(t.lastReceivedAt), "Latest arrival", "In this workspace", "#/inbox");
  const waiting = N(t.inboxOpen) > 0;
  $("tNext").innerHTML = `<div class="next-step"><span class="step-icon" aria-hidden="true">${waiting ? "⇥" : "▤"}</span><div class="step-copy"><h3>${waiting ? `${N(t.inboxOpen)} incoming item${N(t.inboxOpen) === 1 ? " is" : "s are"} waiting.` : N(t.contracts) ? "Your agreements, organised." : "Start with one agreement."}</h3><p>${waiting ? "Open the inbox to review suggested details, read the source and decide where it belongs." : N(t.contracts) ? "Add new documents to keep the record up to date. Upcoming tasks and decisions appear below." : "Upload a document or saved email, then review its details. Complete any missing details on the review page, then save it with its original."}</p></div><a class="pill ${waiting ? "primary" : "outline"} sm" href="${waiting ? "#/inbox" : "#/contracts"}">${waiting ? "Review inbox →" : "Open contracts →"}</a></div>`;
  let h = "";
  h += `<div class="dsec">Proposals to decide (${t.proposals.length})</div>`;
  h += t.proposals.length ? t.proposals.map(propItem).join("") : `<div class="empty">No proposals need a decision right now.${me.aiOn || me.aiChecked === false || !isStaff() ? "" : " AI access could not be confirmed — see the notice above."}</div>`;
  h += `<div class="dsec">Tasks due (${t.tasks.length})</div>`;
  h += t.tasks.length ? t.tasks.map(taskItem).join("") : `<div class="empty">No tasks are due. Saved deadlines appear here 30 days ahead.</div>`;
  if (isStaff() && t.unassigned.length) { h += `<div class="dsec">Contracts without a responsible person (${t.unassigned.length})</div>` + t.unassigned.map((c) => `<div class="item link" data-c="${c.id}"><div class="ttl">${esc(c.title)}<small>${esc(c.vendor)}${c.product ? " · " + esc(c.product) : ""}</small></div>${tag(c.status, CSTATUS_LBL[c.status])}<span class="meta">open the record to assign</span></div>`).join(""); }
  if (isStaff() && t.failed.length) { h += `<div class="dsec">Messages that could not be processed (${t.failed.length})</div>` + t.failed.map((s) => `<div class="item link" data-s="${s.id}"><div class="ttl">${esc(s.subject || "(no subject)")}<small>${esc(s.fromName || s.fromAddr)} · ${esc(s.note)}</small></div>${tag("failed", "FAILED")}<span class="meta">${fmtD(s.receivedAt)}</span></div>`).join(""); }
  $("tBody").innerHTML = h;
  wireItems($("tBody"));
}
function propItem(p) {
  const where = p.contractId.length ? esc(p.contractTitle) : p.candidates.length ? `${p.candidates.length} possible contracts` : "no contract yet";
  return `<div class="item link" data-s="${p.sourceId}"><div class="ttl">${esc(p.summary || p.sourceSubject || "Proposal")}<small>${esc(KIND_LBL[p.kind] || p.kind)} · ${where} · ${p.changes.length} field${p.changes.length === 1 ? "" : "s"}${p.assigneeName ? " · for " + esc(p.assigneeName) : ""}</small></div>${tag("open", "OPEN")}<span class="meta">${fmtD(p.createdAt)}</span><button class="linkbtn" data-s="${p.sourceId}">REVIEW</button></div>`;
}
function taskItem(t) {
  const dl = t.daysLeft.length ? N(t.daysLeft[0]) : null;
  return `<div class="item" data-task="${t.id}"><div class="ttl">${esc(t.title)}<small><a href="#/c/${t.contractId}">${esc(t.contractTitle)}</a>${t.assigneeName ? " · " + esc(t.assigneeName) : " · nobody assigned"}${t.dueOn ? " · due " + esc(fmtDay(t.dueOn)) : ""}</small></div>${t.overdue ? tag("overdue", "OVERDUE") : dl !== null && dl <= 7 ? tag("due", days(dl)) : `<span class="meta">${esc(days(dl))}</span>`}<button class="linkbtn" data-done="${t.id}" data-kind="${esc(t.kind)}" data-title="${esc(t.title)}">Done</button><button class="linkbtn" data-snooze="${t.id}">LATER</button>${isStaff() ? `<button class="linkbtn" data-assign="${t.id}">ASSIGN</button>` : ""}</div>`;
}
function wireItems(root) {
  root.querySelectorAll("[data-done],[data-snooze],[data-assign]").forEach(el => el.classList.toggle("hidden", !isStaff()));
  root.querySelectorAll(".item.link[data-s], .item [data-s]").forEach((el) => { el.onclick = (e) => { e.stopPropagation(); location.hash = "#/inbox/" + el.dataset.s; }; });
  root.querySelectorAll(".item.link[data-c]").forEach((el) => { el.onclick = () => { location.hash = "#/c/" + el.dataset.c; }; });
  root.querySelectorAll("[data-done]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); completeTask(Number(b.dataset.done), b.dataset.kind, b.dataset.title); }; });
  root.querySelectorAll("[data-snooze]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); snooze(async (d) => { const r = await backend.snoozeTask(hubTok, BigInt(b.dataset.snooze), BigInt(d)); if (r.ok) { toast(`Snoozed ${d} days — the deadline itself does not move`); route(); } return r; }); }; });
  root.querySelectorAll("[data-assign]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); pickPerson("ASSIGN THIS TASK TO", async (p) => { const r = await backend.assignTask(hubTok, BigInt(b.dataset.assign), p.id); if (r.ok) { toast("Assigned to " + p.displayName); route(); } return r; }); }; });
}
let dnTask = null;
function completeTask(id, kind, title) {
  dnTask = id; $("dnTitle").textContent = "Complete: " + (title || "task"); $("dnNote").value = ""; setStatus("dnStatus", "", "");
  $("dnDecision").classList.toggle("hidden", kind !== "decide"); $("dnSel").value = kind === "decide" ? "continue" : "";
  $("doneModal").classList.add("on");
}
$("dnCancel").onclick = () => $("doneModal").classList.remove("on");
$("dnSave").onclick = async () => {
  const r = await backend.completeTask(hubTok, BigInt(dnTask), $("dnDecision").classList.contains("hidden") ? "" : $("dnSel").value, $("dnNote").value.trim());
  if (!r.ok) { setStatus("dnStatus", "err", r.detail); return; }
  $("doneModal").classList.remove("on"); toast(r.detail || "Done"); route();
};

/* ============================== inbox ============================== */
let ibStatus = "";
$("ibFilters").onclick = (e) => { const t = e.target.closest("[data-st]"); if (!t) return; ibStatus = t.dataset.st; document.querySelectorAll("#ibFilters .tag").forEach((x) => x.classList.toggle("sel", x === t)); loadInbox(); };
function enterInbox() { show("viewInbox"); return loadInbox(); }
async function loadInbox() {
  const viewToken = hubTok, staleView = viewGuard("loadInbox");
  $("ibList").innerHTML = `<div class="empty">Loading…</div>`;
  let rows = [];
  try { rows = await backend.listSources(hubTok, ibStatus, []); } catch (e) { if (staleView()) return; $("ibList").innerHTML = `<div class="empty">Could not load: ${esc(String(e).slice(0, 160))}</div>`; return; }
  if (staleView()) return;
  if (!rows.length) { $("ibList").innerHTML = `<div class="empty">${ibStatus === "" ? "Nothing waits here. Put the contracts address in CC, forward a thread, or upload a saved .eml file." : "No messages with this status."}</div>`; return; }
  $("ibList").innerHTML = `<div class="tblwrap"><table class="plain"><thead><tr><th>Message</th><th>From</th><th>Contract</th><th>Files</th><th>Proposals</th><th>Status</th><th>Received</th></tr></thead><tbody>` +
    rows.map((s) => `<tr class="rowlink" data-s="${s.id}"><td><b style="font-weight:500">${esc(s.subject || "(no subject)")}</b>${s.note ? `<div class="kv">${esc(s.note)}</div>` : ""}<div class="kv mono">${esc(s.kind)}${s.handedInByName ? " · by " + esc(s.handedInByName) : ""}</div></td><td>${esc(s.fromName || s.fromAddr)}${s.fromName ? `<div class="kv mono">${esc(s.fromAddr)}</div>` : ""}</td><td>${s.contractId.length ? `<a href="#/c/${s.contractId[0]}">${esc(s.contractTitle)}</a>` : '<span class="muted">—</span>'}</td><td class="num">${N(s.documents) || ""}</td><td class="num">${N(s.proposals) || ""}</td><td>${tag(s.status, SSTATUS_LBL[s.status] || s.status)}</td><td class="mono">${fmtD(s.receivedAt)}</td></tr>`).join("") + `</tbody></table></div>`;
  $("ibList").querySelectorAll("tr[data-s]").forEach((r) => { r.onclick = (e) => { if (e.target.closest("a")) return; location.hash = (rows.find(s => String(s.id) === r.dataset.s)?.contractId.length ? "#/inbox/" : "#/intake/") + r.dataset.s; }; });
}
// .eml upload — parsed in the browser, handed in through the same intake lane as the relay
$("ibEml").onchange = async () => { const files = [...$("ibEml").files]; $("ibEml").value = ""; if (files.length) await uploadEml(files); };
async function uploadEml(files) {
  const token = hubTok, stale = viewGuard("uploadEml"), box = $("ibUpload"), lines = [];
  box.classList.remove("hidden");
  for (const file of files) {
    try {
      const r = await uploadDocument(file, backend, token, msg => { if(!stale()) box.textContent = msg; }, stale);
      if(stale()) return;
      if(files.length === 1) { location.hash = "#/intake/" + r.sourceId; return; }
      lines.push(`<b>${esc(file.name)}</b> · <a href="#/intake/${r.sourceId}">Review & file</a>`);
    } catch(e) { if(stale())return; lines.push(`<b>${esc(file.name)}</b> — ${esc(e.message)}`); }
    box.innerHTML = lines.join("<br>");
  }
  if(!stale()) loadInbox();
}
let uploadingDocument = false;
async function beginDocumentUpload(file) {
  if (!file || uploadingDocument || !isStaff()) return;
  uploadingDocument = true;
  const token = hubTok, stale = viewGuard("documentUpload"), body = $("intakeBody");
  body.innerHTML = '<div class="intake-progress" role="status"><span class="reading-orbit" aria-hidden="true">▤</span><h3>Reading your document…</h3><p>The original will stay attached to the contract.</p></div>';
  try {
    const r = await uploadDocument(file, backend, token, text => { if(!stale()) body.querySelector("h3").textContent=text; }, stale);
    if(!stale()) location.hash = "#/intake/" + r.sourceId;
  } catch(e) { if(!stale()) { body.innerHTML=`<div class="empty"><strong>Upload not completed</strong>${esc(e.message)}<div class="btnrow"><button id="uploadRetry" class="pill primary">Choose a file</button></div></div>`; $("uploadRetry").onclick=()=>$("intakeFile").click(); } }
  finally { uploadingDocument = false; }
}
$("intakeFile").onchange = () => { const file = $("intakeFile").files[0]; $("intakeFile").value=""; beginDocumentUpload(file); };
async function enterIntake(id, analysis = null) {
  const token = hubTok, stale = viewGuard("intakeView"), body = $("intakeBody");
  show("viewIntake"); $("intakeTitle").textContent = id ? "Review your document" : "Add a document";
  $("intakeSubtitle").textContent = id ? "Your original and its details, together. Check, complete and save." : "Start with the document. AI helps you fill in the details.";
  if(!id) {
    body.innerHTML=`<div class="upload-landing"><span class="upload-mark" aria-hidden="true">▤</span><h3>From document to useful details.</h3><p>Drop a contract, receipt, invoice or purchase screenshot here. AI reads the original pages and prepares the details for you.</p><button id="chooseContract" class="pill primary" ${isStaff()?"":"disabled"}>Choose a document</button><p class="kv">PDF, text, saved email (.eml), PNG, JPEG, GIF or WebP · below 1.4 MB for AI · 1.5 MB storage limit<br>Scanned PDFs and screenshots are read with AI vision. Nothing is filed until you confirm.</p><div class="intake-steps"><span>01 · Upload original</span><span>02 · Review AI details</span><span>03 · Save to your space</span></div></div>`;
    $("chooseContract").onclick=()=>$("intakeFile").click();
    const drop=body.firstElementChild; drop.ondragover=e=>{e.preventDefault();drop.classList.add("dragover");};drop.ondragleave=()=>drop.classList.remove("dragover");drop.ondrop=e=>{e.preventDefault();drop.classList.remove("dragover"); if(e.dataTransfer.files.length!==1){toast("Add one document or saved email at a time.");return;}beginDocumentUpload(e.dataTransfer.files[0]);};
    return;
  }
  body.innerHTML='<div class="intake-progress" role="status"><span class="reading-orbit" aria-hidden="true">▤</span><h3>Opening the original…</h3></div>';
  let monitor;
  const render = (view, outcome = null) => {
    monitor?.stop();
    const ui = renderIntakeReview(body, {view, spaces, currentSpace, canEdit:isStaff(), canTransfer:spaceRoleName()==="owner", stale, api:backend, token, me,
      remove:()=>trashItem("source",BigInt(id),view.source.subject),
      retry:async()=>{const r=await backend.reprocessSource(token,BigInt(id));if(stale())return r;if(r.ok)startWatch({...view,source:{...view.source,status:"received",note:""}},{requested:true,baseline:proposalIds(monitor?.latest()||view)});return r;},
      download:async did=>{const d=opt(await backend.documentData(token,did));if(!stale()&&d) download(d.name,d.bytes instanceof Uint8Array?d.bytes:new Uint8Array(d.bytes),d.mime);},
      move:async destination=>{const r=await backend.moveIncomingSource(token,BigInt(id),destination);if(stale())return r;if(r.ok){curSrc=null;toast("Document moved for review");if(await chooseSpace(destination,false)){location.hash="#/intake/"+id;await enterIntake(id);}else toast("Open the destination inbox to continue reviewing.");}return r;},
      save:async input=>{const r=await backend.createContractFromSource(token,BigInt(id),input);if(stale())return r;if(r.ok){curSrc=null;toast("Contract and original saved"); if(input.destination!==currentSpace.id){const opened=await chooseSpace(input.destination,false);if(!opened){toast("Saved in the destination workspace. Open it to view your contract.");return r;}}location.hash="#/contracts";}return r;}
    });
    if(!ui)return;
    if(outcome)analysisFeedback(ui.progress,{phase:outcome,title:outcome==='ready'?'AI reading complete':'Analysis needs your review',detail:outcome==='ready'?'The latest suggestions are shown below. Check them before saving.':view.source.note||'No new suggestions were returned. You can complete the details or try again.'});
    const startWatch=(initial,options=analysis||{})=>{
      monitor?.stop();ui.setAnalysing(true);
      monitor=watchAnalysis(ui.progress,{initial,load:async()=>opt(await backend.getSource(token,BigInt(id))),stale,...options,onComplete:(next,phase)=>{
        if(stale())return;ui.setAnalysing(false);analysis=null;
        if(!next)return;
        if(!ui.isDirty())render(next,phase);
        else {ui.keepEdits(next);if(phase==='ready')analysisFeedback(ui.progress,{phase:'ready',title:'A new AI reading is ready',detail:'Your edits have been kept. You can save them or replace the form with the new suggestions.',actionLabel:'Use new AI suggestions',action:()=>render(next,'ready')});}
      }});
    };
    if(analysisPending(view)||analysis?.requested)startWatch(view);
  };
  try {
    const view=opt(await backend.getSource(token,BigInt(id)));if(stale())return;
    if(!view){body.innerHTML='<div class="empty">This document is not available in this workspace.</div>';return;}
    render(view);
  } catch(_) {if(!stale()){body.innerHTML='<div class="empty">The original is saved, but its details could not be loaded. <button class="pill outline" id="intakeReload">Try again</button></div>';$("intakeReload").onclick=()=>enterIntake(id,analysis);}}

}
// paste a message (kind manual)
$("ibPaste").onclick = () => { ["pmFrom", "pmSubject", "pmText"].forEach((i) => { $(i).value = ""; }); $("pmDate").value = new Date().toISOString().slice(0, 10); setStatus("pmStatus", "", ""); $("pasteModal").classList.add("on"); };
$("pmCancel").onclick = () => $("pasteModal").classList.remove("on");
$("pmSend").onclick = () => withAction($("pmSend"), "pmStatus", async (token) => {
  const text = $("pmText").value.trim(); if (!text) { setStatus("pmStatus", "err", "paste the text"); return; }
  const meta = { kind: "manual", mailbox: "", providerId: "", messageId: "", inReplyTo: "", references: "", fromAddr: $("pmFrom").value.trim(), fromName: "", to: [], cc: [], subject: $("pmSubject").value.trim() || "(pasted message)", sentAt: $("pmDate").value ? $("pmDate").value + "T00:00:00Z" : "", text: text.slice(0, 190000), html: "", attachments: [] };
  const b = await backend.intakeBegin(token, meta); if (!b.ok) { setStatus("pmStatus", "err", b.detail); return; }
  const c = await backend.intakeCommit(token, b.id); if (!c.ok) { setStatus("pmStatus", "err", c.detail); return; }
  if (token !== hubTok) return;
  $("pasteModal").classList.remove("on"); toast("Handed in — " + (c.status || "")); location.hash = "#/inbox/" + c.sourceId;
});

/* ============================== one message (source) ============================== */
const SRC_TABS = ["proposals", "message", "documents", "filing"];
let curSrc = null;
$("srcBack").onclick = () => { location.hash = "#/inbox"; };
$("viewSource").querySelectorAll(".tabs button").forEach((b) => { b.onclick = () => { if (curSrc) location.hash = `#/inbox/${curSrc.source.id}/${b.dataset.tab}`; }; });
async function enterSource(id, tabName, analysis = null) {
  const oldProgress=$("sourceAnalysisProgress");if(oldProgress){oldProgress.hidden=true;oldProgress.replaceChildren();}
  const viewToken = hubTok, staleView = viewGuard("enterSource");
  show("viewSource");
  $("srcDelete").classList.add("hidden");
  if (!SRC_TABS.includes(tabName)) tabName = "proposals";
  showTab("viewSource", "src", tabName, SRC_TABS);
  if (!curSrc || N(curSrc.source.id) !== id) { curSrc = null; $("srcTitle").textContent = "Loading…"; $("srcMeta").textContent = ""; $("srcStatus").innerHTML = ""; ["srcProposals", "srcMessage", "srcDocuments", "srcFiling"].forEach((i) => { $(i).innerHTML = ""; }); }
  let v = null;
  try { v = opt(await backend.getSource(hubTok, BigInt(id))); } catch (e) { if (staleView()) return; $("srcTitle").textContent = "Could not load"; $("srcMeta").textContent = String(e).slice(0, 160); return; }
  if (staleView()) return;
  if (!v) { $("srcTitle").textContent = "No such message — or not yours to see"; return; }
  curSrc = v; const s = v.source;
  $("srcTitle").textContent = s.subject || "(no subject)"; $("srcDelete").classList.toggle("hidden",!isStaff()); $("srcDelete").onclick=()=>trashItem("source",s.id,s.subject);
  $("srcStatus").innerHTML = tag(s.status, SSTATUS_LBL[s.status] || s.status);
  $("srcMeta").innerHTML = `From <b>${esc(s.fromName || s.fromAddr)}</b>${s.fromName ? ` &lt;${esc(s.fromAddr)}&gt;` : ""}${v.to.length ? " · to " + esc(v.to.join(", ")) : ""}${v.cc.length ? " · cc " + esc(v.cc.join(", ")) : ""}${s.sentAt ? " · sent " + esc(s.sentAt.slice(0, 16).replace("T", " ")) : ""} · received ${fmtD(s.receivedAt)} · ${esc(s.kind)}${s.handedInByName ? " by " + esc(s.handedInByName) : ""}${s.contractId.length ? ` · filed to <a href="#/c/${s.contractId[0]}">${esc(s.contractTitle)}</a>` : ""}${s.note ? `<div>${esc(s.note)}</div>` : ""}`;
  const openProps = v.proposals.filter((p) => p.status === "open");
  $("srcPropCount").textContent = openProps.length ? `(${openProps.length})` : ""; $("srcDocCount").textContent = v.documents.length ? `(${v.documents.length})` : "";
  // proposals
  await renderProposals($("srcProposals"), v.proposals, { candidates: v.candidates, source: s, onDone: () => enterSource(id, tabName) });
  if (staleView()) return;
  if (!s.contractId.length && isStaff()) $("srcProposals").insertAdjacentHTML("afterbegin", `<div class="source-guide"><a class="pill primary" href="#/intake/${s.id}">Review & file document</a> Complete missing details and choose the destination in one step.</div>`);
  // message
  $("srcMessage").innerHTML = `${v.forwardComment ? `<div class="dsec">Forwarder's comment</div><div class="msgtext">${esc(v.forwardComment)}</div>` : ""}<div class="dsec">Message text</div><div class="msgtext">${esc(v.text || "(no text — see the documents)")}</div>${v.messageId ? `<div class="kv mono" style="margin-top:8px">message id ${esc(v.messageId)}</div>` : ""}`;
  // documents
  if (staleView()) return;
  $("srcDocuments").innerHTML = v.documents.length ? docTable(v.documents) : `<div class="empty">No files came with this message.</div>`;
  wireDocs($("srcDocuments"));
  // filing (staff)
  $("srcFiling").innerHTML = isStaff() ? `<div class="scard"><h3>Where does this belong?</h3><div class="kv">Filing links the message to a contract without changing any terms. Confirm proposals under the first tab to change terms. Ignore takes a message out of the review queue. Delete moves it to Trash, where you can restore it.</div>
    <div class="btnrow"><button class="pill primary sm" id="sfLink">Choose existing contract</button><button class="pill outline sm" id="sfCreate">Create a contract</button>${s.status === "ignored" ? `<button class="pill outline sm" id="sfBack">Return to review</button>` : `<button class="pill outline sm" id="sfIgnore">Ignore item</button>`}${me.aiOn ? `<button class="pill outline sm" id="sfRerun">Read again with AI</button>` : ""}<span id="sfStatus" class="status"></span></div></div>` : `<div class="notice soft">Workspace owners and editors can file messages and set matching rules.</div>`;
  let progress=$("sourceAnalysisProgress");if(!progress){progress=document.createElement("div");progress.id="sourceAnalysisProgress";$("srcMeta").after(progress);}progress.hidden=true;progress.replaceChildren();
  if(analysisPending(v)||analysis?.requested){
    const rerun=$("sfRerun");if(rerun)rerun.disabled=true;
    watchAnalysis(progress,{initial:v,load:async()=>opt(await backend.getSource(viewToken,s.id)),stale:staleView,...(analysis||{}),onComplete:(next,phase)=>{
      if(staleView())return;if(rerun)rerun.disabled=false;
      if(next){$("srcStatus").innerHTML=tag(next.source.status,SSTATUS_LBL[next.source.status]||next.source.status);
        if(phase==='ready')analysisFeedback(progress,{phase:'ready',title:'A new AI reading is ready',detail:'Open the latest suggestions when you are ready. Your current edits are kept until then.',actionLabel:'Review new suggestions',action:()=>enterSource(id,'proposals')});}
    }});
  }
  if (isStaff()) {
    $("sfLink").onclick = () => openLink(s);
    $("sfCreate").onclick = () => { location.hash = "#/intake/" + s.id; };
    const ig = $("sfIgnore"); if (ig) ig.onclick = () => confirmBox("Ignore this message? It stays here under Ignored.", async () => { const r = await backend.setSourceStatus(hubTok, s.id, "ignored", ""); toast(r.ok ? "Ignored" : r.detail); if (r.ok) enterSource(id, tabName); });
    const bk = $("sfBack"); if (bk) bk.onclick = async () => { const r = await backend.setSourceStatus(hubTok, s.id, "review", ""); toast(r.ok ? "Back in review" : r.detail); if (r.ok) enterSource(id, tabName); };
    const rr = $("sfRerun"); if (rr) rr.onclick = async () => {
      if(rr.disabled)return;const restore=busyButton(rr,"Starting analysis…");
      analysisFeedback(progress,{title:"Starting a new AI reading…",detail:"Your original and previous suggestions are kept."});
      try{const r=await backend.reprocessSource(viewToken,s.id);if(staleView())return;if(r.ok)await enterSource(id,tabName,{requested:true,baseline:proposalIds(v)});else analysisFeedback(progress,{phase:"attention",title:"Analysis could not be started",detail:r.detail});}
      catch(_){if(!staleView())analysisFeedback(progress,{phase:"attention",title:"Could not confirm the analysis request",detail:"Reload this document to check whether analysis started before trying again."});}
      finally{if(!staleView())restore();}
    };
  }
}
function docTable(docs) {
  return `<div class="tblwrap"><table class="plain"><thead><tr><th>File</th><th>Type</th><th>Size</th><th>Read</th><th></th></tr></thead><tbody>` + docs.map((d) => `<tr><td>${esc(d.name)}${d.link ? `<div class="kv mono">${esc(d.link)}</div>` : ""}</td><td class="mono">${esc(d.mime)}</td><td class="num">${(N(d.size) / 1000).toFixed(0)} KB</td><td>${esc(d.status === "stored" ? (d.hasText ? "text extracted" : "stored") : d.status)}</td><td style="white-space:nowrap">${N(d.size) ? `<button class="linkbtn" data-dl="${d.id}">Download</button>` : ""} ${d.hasText ? `<button class="linkbtn" data-txt="${d.id}">TEXT</button>` : ""}</td></tr>`).join("") + `</tbody></table></div>`;
}
function wireDocs(root) {
  root.querySelectorAll("[data-dl]").forEach((b) => { b.onclick = async () => { const d = opt(await backend.documentData(hubTok, BigInt(b.dataset.dl))); if (!d) { toast("Not available"); return; } const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([d.bytes instanceof Uint8Array ? d.bytes : new Uint8Array(d.bytes)], { type: d.mime })); a.download = d.name || "document"; document.body.appendChild(a); a.click(); a.remove(); }; });
  root.querySelectorAll("[data-txt]").forEach((b) => { b.onclick = async () => { const t = opt(await backend.documentText(hubTok, BigInt(b.dataset.txt))); $("txTitle").textContent = "WHAT THE AI READ"; $("txBody").textContent = t || "(no text)"; $("textModal").classList.add("on"); }; });
}
$("txClose").onclick = () => $("textModal").classList.remove("on");
// filing modal
let lkSrc = null, lkPicked = null;
attachContractPicker("lkIn", "lkList", (cid, name) => { lkPicked = cid; $("lkChip").innerHTML = `<span class="chipp" data-id="${cid}">${esc(name)}<button data-rm="1">×</button></span>`; });
$("lkChip").onclick = (e) => { if (e.target.dataset.rm) { lkPicked = null; $("lkChip").innerHTML = ""; } };
function openLink(s) { lkSrc = s; lkPicked = null; $("lkChip").innerHTML = ""; $("lkIn").value = ""; $("lkRule").checked = false; setStatus("lkStatus", "", ""); $("lkUnlink").classList.toggle("hidden", !s.contractId.length); $("linkModal").classList.add("on"); $("lkIn").focus(); }
$("lkCancel").onclick = () => $("linkModal").classList.remove("on");
$("lkSave").onclick = async () => { if (!lkPicked) { setStatus("lkStatus", "err", "pick a contract"); return; } const rule = $("lkRule").checked && lkSrc.fromAddr ? [{ kind: "senderAddress", value: lkSrc.fromAddr }] : []; const r = await backend.linkSource(hubTok, lkSrc.id, [BigInt(lkPicked)], rule); if (!r.ok) { setStatus("lkStatus", "err", r.detail); return; } $("linkModal").classList.remove("on"); toast("Filed"); curSrc = null; route(); };
$("lkUnlink").onclick = async () => { const r = await backend.linkSource(hubTok, lkSrc.id, [], []); if (!r.ok) { setStatus("lkStatus", "err", r.detail); return; } $("linkModal").classList.remove("on"); toast("Unlinked"); curSrc = null; route(); };

/* ============================== proposals — the decision UI (inbox + record) ============================== */
const contractTitleCache = new Map();
async function titleOf(cid) {
  const cacheKey = hubTok + ":" + cid;
  if (contractTitleCache.has(cacheKey)) return contractTitleCache.get(cacheKey);
  try { const r = opt(await backend.getContract(hubTok, BigInt(cid))); if (r) { contractTitleCache.set(cacheKey, { title: r.contract.title, revision: N(r.contract.revision) }); return contractTitleCache.get(cacheKey); } } catch (_) {}
  return { title: "#" + cid, revision: 0 };
}
async function renderProposals(root, proposals, ctx) {
  const viewToken = hubTok, staleView = viewGuard("renderProposals");
  const open = proposals.filter((p) => p.status === "open"), done = proposals.filter((p) => p.status !== "open");
  if (!proposals.length) {
    const pending = ctx.source && ["received", "processing"].includes(ctx.source.status);
    root.innerHTML = `<div class="empty"><strong>${pending ? "This item is waiting to be read." : "Ready for a manual review."}</strong>${pending ? "Processing runs in the background. Refresh to check for suggestions, or open the document now." : ctx.source ? "There are no suggested changes to confirm. Read the original and file it to a contract, or create a record manually." : "New suggestions will appear here when incoming documents are linked to this contract."}${ctx.source ? `<div class="btnrow"><button class="pill outline sm" data-source-refresh>Refresh</button><a class="pill outline sm" href="#/inbox/${ctx.source.id}/documents">Open documents</a>${isStaff() ? `<a class="pill primary sm" href="#/inbox/${ctx.source.id}/filing">File this item →</a>` : ""}</div>` : ""}</div>`;
    const refresh = root.querySelector("[data-source-refresh]"); if (refresh) refresh.onclick = ctx.onDone;
    return;
  }
  let h = open.length ? `<div class="source-guide"><strong>Review, then confirm.</strong>Check the source evidence and edit anything that needs correcting. Only selected fields are saved. An offer creates a draft; it does not become an accepted agreement automatically.</div>` : "";
  for (const p of open) {
    const targets = [];
    if (p.contractId.length) targets.push({ id: N(p.contractId[0]), title: p.contractTitle, rev: N(p.currentRevision) });
    for (const c of p.candidates) { const cid = N(c); if (!targets.some((t) => t.id === cid)) { const t = await titleOf(cid); targets.push({ id: cid, title: t.title, rev: t.revision }); } }
    // staff may also file to the message's own candidates (the backend lets members choose among the proposal's only)
    if (isStaff()) for (const c of ctx.candidates || []) { const cid = N(c.id); if (!targets.some((t) => t.id === cid)) { const t = await titleOf(cid); targets.push({ id: cid, title: c.title || t.title, rev: t.revision }); } }
    const rows = p.changes.map((c, i) => {
      const isMoney = MONEY_FIELDS.includes(c.field);
      const shown = isMoney ? toDec(c.newValue) : c.newValue;
      const oldShown = isMoney ? toDec(c.oldValue) : c.oldValue;
      const ev = c.evidence.map((e) => `<q>${esc(e.quote)}</q>${e.partId && e.partId !== "body" ? `<span class="kv mono">${esc(e.partId)}</span>` : ""}`).join("");
      const accept = c.basis === "explicit" || c.basis === "derived";
      return `<tr><td><input type="checkbox" aria-label="Confirm ${esc(FIELD_LBL[c.field] || c.field)}" data-i="${i}" ${accept ? "checked" : ""}></td><td><b style="font-weight:500">${esc(FIELD_LBL[c.field] || c.field)}</b><div class="basis ${esc(c.basis)}">${esc(c.basis)}</div></td><td>${oldShown ? esc(oldShown) : '<span class="muted">—</span>'}</td><td><input type="text" aria-label="Proposed ${esc(FIELD_LBL[c.field] || c.field)}" data-v="${i}" data-orig="${esc(c.newValue)}" data-field="${esc(c.field)}" value="${esc(shown)}"></td><td class="ev">${ev || '<span class="muted">no quote</span>'}</td></tr>`;
    }).join("");
    h += `<div class="prop" data-p="${p.id}">
      <div class="ph"><div class="t">${esc(p.summary || KIND_LBL[p.kind] || "Proposal")}<small>${esc(KIND_LBL[p.kind] || p.kind)} · from <a href="#/inbox/${p.sourceId}">${esc(p.sourceSubject || "message #" + p.sourceId)}</a> · ${fmtD(p.createdAt)}${p.assigneeName ? " · for " + esc(p.assigneeName) : ""}${p.snoozedUntil ? " · snoozed until " + fmtDate(p.snoozedUntil) : ""}</small></div>${tag("open", "OPEN")}</div>
      <div class="pb">
        <div class="target">Applies to
          ${targets.length ? `<select data-target>${targets.map((t) => `<option value="${t.id}" data-rev="${t.rev}">${esc(t.title)}</option>`).join("")}${isStaff() ? `<option value="other">another contract…</option><option value="new">a new contract (draft)</option>` : ""}</select>` : isStaff() ? `<select data-target><option value="new">a new contract (draft)</option><option value="other">an existing contract…</option></select>` : `<span class="muted">no contract could be matched — an editor files it</span>`}
          <span data-other class="hidden pick" style="min-width:240px"><input type="text" data-other-in placeholder="Search contracts…" autocomplete="off"><div class="list hidden" data-other-list></div></span><span data-other-chip></span>
          ${p.candidates.length > 1 ? `<span class="kv">${p.candidates.length} contracts matched — pick the right one</span>` : ""}
        </div>
        <div class="tblwrap"><table class="plain"><thead><tr><th></th><th>Field</th><th>Today</th><th>Proposed (edit to correct)</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${p.uncertainties.length ? `<div class="unc">The AI was unsure about:<ul>${p.uncertainties.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></div>` : ""}
        <div class="btnrow"><input type="text" data-note placeholder="Note for the history (optional)" style="flex:1;min-width:200px;padding:8px 12px;font-size:13.5px"><button class="pill primary sm" data-confirm>Save selected changes</button><button class="pill outline sm" data-reject>Reject proposal</button>${isStaff() ? `<button class="linkbtn" data-assign>HAND TO…</button>` : ""}<button class="linkbtn" data-snooze>LATER</button><span class="status" data-status></span></div>
      </div></div>`;
  }
  if (done.length) h += `<div class="dsec">Decided (${done.length})</div>` + done.map((p) => `<div class="item"><div class="ttl" style="font-size:15px">${esc(p.summary || KIND_LBL[p.kind] || "Proposal")}<small>${esc(KIND_LBL[p.kind] || p.kind)} · ${p.changes.length} field${p.changes.length === 1 ? "" : "s"} · ${esc(p.status)} by ${esc(p.decidedByName || "—")} ${fmtD(p.decidedAt)}${p.note ? " · " + esc(p.note) : ""}${p.contractId.length ? ` · <a href="#/c/${p.contractId[0]}">${esc(p.contractTitle)}</a>` : ""}</small></div>${tag(p.status, p.status.toUpperCase())}</div>`).join("");
  if (staleView()) return;
  root.innerHTML = h;
  if (!isStaff()) {
    root.querySelectorAll(".prop input,.prop select").forEach(el => el.disabled = true);
    root.querySelectorAll(".prop .btnrow").forEach(el => { el.innerHTML = "<span class=kv>Read-only — a space editor reviews these suggestions.</span>"; });
    return;
  }
  root.querySelectorAll(".prop[data-p]").forEach((box) => {
    const pid = BigInt(box.dataset.p); const p = open.find((x) => x.id === pid);
    const sel = box.querySelector("[data-target]"); const other = box.querySelector("[data-other]"); let otherPicked = null;
    if (sel) sel.onchange = () => { other.classList.toggle("hidden", sel.value !== "other"); };
    if (other) {
      const inp = other.querySelector("[data-other-in]"), list = other.querySelector("[data-other-list]"), chipEl = box.querySelector("[data-other-chip]");
      let timer = 0;
      inp.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => { const q = inp.value.trim(); if (!q) { list.classList.add("hidden"); return; } let rows = []; try { rows = await backend.listContracts(hubTok, { q, status: "", responsible: "", onlyIncomplete: false, onlyDue: false, includeArchived: false }); } catch (_) {} list.innerHTML = rows.slice(0, 12).map((r) => `<div data-cid="${r.id}" data-name="${esc(r.title)}">${esc(r.title)}<small>${esc(r.vendor)} · ${esc(CSTATUS_LBL[r.status] || r.status)}</small></div>`).join("") || '<div style="cursor:default;color:var(--ks-fg-muted)">no contract matches</div>'; list.classList.remove("hidden"); }, 180); };
      list.onclick = (e) => { const d = e.target.closest("[data-cid]"); if (!d) return; otherPicked = Number(d.dataset.cid); chipEl.innerHTML = `<span class="chipp">${esc(d.dataset.name)}</span>`; inp.value = ""; list.classList.add("hidden"); };
      inp.onblur = () => setTimeout(() => list.classList.add("hidden"), 200);
    }
    const st = box.querySelector("[data-status]");
    const decide = async (acceptAll) => {
      const accept = [];
      if (acceptAll) box.querySelectorAll("input[data-i]:checked").forEach((ck) => { const v = box.querySelector(`input[data-v="${ck.dataset.i}"]`); accept.push({ field: v.dataset.field, value: sendValue(v) }); });
      let target = [], newContract = false, expectedRevision = N(p.currentRevision);
      if (acceptAll && sel) {
        if (sel.value === "new") newContract = true;
        else if (sel.value === "other") { if (!otherPicked) { st.className = "status err"; st.textContent = "pick the contract"; return; } target = [BigInt(otherPicked)]; expectedRevision = (await titleOf(otherPicked)).revision; }
        else { const o = sel.selectedOptions[0]; target = [BigInt(o.value)]; expectedRevision = Number(o.dataset.rev); if (p.contractId.length && N(p.contractId[0]) === Number(o.value)) target = []; }
      }
      if (acceptAll && !accept.length) { st.className = "status err"; st.textContent = "nothing ticked — use Reject proposal to close without changes"; return; }
      st.className = "status"; st.textContent = "saving…";
      const r = await backend.decideProposal(viewToken, pid, { expectedRevision: BigInt(expectedRevision), target, newContract, accept, note: box.querySelector("[data-note]").value.trim() });
      if (staleView()) return;
      if (!r.ok) { st.className = "status err"; st.textContent = r.detail; contractTitleCache.clear(); return; }
      contractTitleCache.clear();
      toast(accept.length ? `Confirmed ${accept.length} field${accept.length === 1 ? "" : "s"} — revision ${N(r.revision)}` : "Rejected — nothing changed");
      if (newContract && acceptAll) location.hash = "#/c/" + r.contractId; else ctx.onDone();
    };
    box.querySelector("[data-confirm]").onclick = () => withAction(box.querySelector("[data-confirm]"), null, () => decide(true));
    box.querySelector("[data-reject]").onclick = () => confirmBox("Reject the whole proposal? The message stays, the contract does not change.", () => decide(false));
    const as = box.querySelector("[data-assign]"); if (as) as.onclick = () => pickPerson("HAND THIS PROPOSAL TO", async (person) => { const r = await backend.assignProposal(hubTok, pid, person.id); if (r.ok) { toast("Handed to " + person.displayName); ctx.onDone(); } return r; });
    box.querySelector("[data-snooze]").onclick = () => snooze(async (d) => { const r = await backend.snoozeProposal(hubTok, pid, BigInt(d)); if (r.ok) { toast("Snoozed — the deadlines do not move"); ctx.onDone(); } return r; });
  });
}
// what to send for a proposal value: untouched → the original (minor units for money); edited money → a decimal text the backend parses
function sendValue(inp) {
  const field = inp.dataset.field, orig = inp.dataset.orig, v = inp.value.trim();
  if (!MONEY_FIELDS.includes(field)) return v;
  if (v === toDec(orig)) return orig;
  return /^-?\d+$/.test(v) ? v + ".00" : v;
}

/* ============================== contracts ============================== */
let cTimer = 0;
["cQ", "cStatus", "cDue", "cIncomplete", "cArchived"].forEach((id) => { $(id).oninput = $(id).onchange = () => { clearTimeout(cTimer); cTimer = setTimeout(loadContracts, 150); }; });
function enterContracts() { show("viewContracts"); return loadContracts(); }
async function loadContracts() {
  const viewToken = hubTok, staleView = viewGuard("loadContracts");
  $("cList").innerHTML = `<div class="empty">Loading…</div>`;
  let rows = [];
  try { rows = await backend.listContracts(hubTok, { q: $("cQ").value.trim(), status: $("cStatus").value, responsible: "", onlyIncomplete: $("cIncomplete").checked, onlyDue: $("cDue").checked, includeArchived: $("cArchived").checked }); } catch (e) { if (staleView()) return; $("cList").innerHTML = `<div class="empty">Could not load: ${esc(String(e).slice(0, 160))}</div>`; return; }
  if (staleView()) return;
  if (!rows.length) { $("cList").innerHTML = `<div class="empty">${$("cQ").value || $("cStatus").value || $("cDue").checked || $("cIncomplete").checked ? "No contract matches these filters." : "No contracts yet. Create one, import your sheet under Workspace tools → Import, or let the first message create a draft."}</div>`; return; }
  $("cList").innerHTML = `<div class="tblwrap"><table class="plain"><thead><tr><th>Contract</th><th>Status</th><th>Amount</th><th>Cancel by</th><th>Decide by</th><th>Responsible</th><th>Seats</th><th>Open</th></tr></thead><tbody>` + rows.map((c) => {
    const dd = c.daysToDecide.length ? N(c.daysToDecide[0]) : null;
    return `<tr class="rowlink" data-c="${c.id}"><td><b style="font-weight:500">${esc(c.title)}</b><div class="kv">${esc(c.vendor)}${c.product ? " · " + esc(c.product) : ""}${c.complete ? "" : ' · <span style="color:var(--ks-accent)">terms incomplete</span>'}</div></td><td>${tag(c.status, CSTATUS_LBL[c.status] || c.status)}</td><td class="num">${esc(c.amount)}${c.interval ? `<div class="kv">${esc(INTERVAL_LBL[c.interval] || c.interval)}</div>` : ""}</td><td class="mono">${fmtDay(c.noticeDate)}</td><td class="mono">${fmtDay(c.decideBy)}${dd !== null ? `<div class="kv" ${dd <= 14 ? 'style="color:var(--ks-accent)"' : ""}>${esc(days(dd))}</div>` : ""}</td><td>${esc(c.responsibleName || (c.responsible ? c.responsible : "—"))}</td><td class="num">${c.seats.length ? `${N(c.holders)}/${N(c.seats[0])}${c.unusedSeats.length && N(c.unusedSeats[0]) > 0 ? `<div class="kv">${N(c.unusedSeats[0])} unused</div>` : ""}` : ""}</td><td class="num">${N(c.openProposals) ? `${N(c.openProposals)} proposal${N(c.openProposals) === 1 ? "" : "s"}` : ""}${N(c.openTasks) ? `<div>${N(c.openTasks)} task${N(c.openTasks) === 1 ? "" : "s"}</div>` : ""}</td></tr>`;
  }).join("") + `</tbody></table></div>`;
  $("cList").querySelectorAll("tr[data-c]").forEach((r) => { r.onclick = () => { location.hash = "#/c/" + r.dataset.c; }; });
}
$("cExport").onclick = () => exportCsv("exStatus");
async function exportCsv(statusId) { try { const csv = await backend.exportCsv(hubTok); download("contracts.csv", csv, "text/csv"); setStatus(statusId, "ok", "downloaded"); } catch (e) { setStatus(statusId, "err", String(e).slice(0, 120)); toast("Export failed"); } }
$("cNew").onclick = () => { if (isStaff()) location.hash = "#/add"; };

/* ============================== the record ============================== */
const REC_TABS = ["terms", "proposals", "tasks", "messages", "documents", "seats", "history"];
let cur = null; // Record
$("rBack").onclick = () => { location.hash = "#/contracts"; };
$("viewRecord").querySelectorAll(".tabs button").forEach((b) => { b.onclick = () => { if (cur) location.hash = `#/c/${cur.contract.id}/${b.dataset.tab}`; }; });
async function enterRecord(id, tabName) {
  const viewToken = hubTok, staleView = viewGuard("enterRecord");
  show("viewRecord");
  $("rDelete").classList.add("hidden");
  if (!REC_TABS.includes(tabName)) tabName = "terms";
  showTab("viewRecord", "r", tabName, REC_TABS);
  if (!cur || N(cur.contract.id) !== id) { cur = null; $("rTitle").textContent = "Loading…"; $("rSub").textContent = ""; $("rStatusTag").innerHTML = ""; REC_TABS.forEach((t) => { $("r" + t[0].toUpperCase() + t.slice(1)).innerHTML = ""; }); }
  let r = null;
  try { r = opt(await backend.getContract(hubTok, BigInt(id))); } catch (e) { if (staleView()) return; $("rTitle").textContent = "Could not load"; $("rSub").textContent = String(e).slice(0, 160); return; }
  if (staleView()) return;
  if (!r) { $("rTitle").textContent = "No such contract — or not yours to see"; $("rEdit").classList.add("hidden"); $("rSetStatus").classList.add("hidden"); return; }
  cur = r; const c = r.contract, t = c.terms;
  if(c.tags.includes("document-type:license-key") && tabName === "terms"){setNav("keys");return enterSaas("keys",String(c.id));}
  $("rTitle").textContent = c.title; $("rStatusTag").innerHTML = tag(c.status, CSTATUS_LBL[c.status] || c.status);
  $("rSub").innerHTML = `${esc(c.tags.find(t=>t.startsWith("document-type:"))?.slice(14)||"contract")} · ${esc(c.vendor)}${c.product ? " · " + esc(c.product) : ""}${c.customerRef ? ` · ref <span class="mono">${esc(c.customerRef)}</span>` : ""} · responsible <b>${esc(r.responsibleName || "nobody")}</b>${c.deputy ? " · deputy " + esc(r.deputyName || c.deputy) : ""} · ${esc(c.visibility)}${c.tags.length ? " · " + c.tags.filter(t=>!t.startsWith("document-type:")).map(esc).join(", ") : ""} · revision ${N(c.revision)}${c.origin ? ` · <span class="mono">${esc(c.origin)}</span>` : ""}`;
  $("rDelete").classList.toggle("hidden",!r.canEdit); $("rDelete").onclick=()=>trashItem("contract",c.id,c.title); $("rEdit").classList.toggle("hidden", !r.canEdit); $("rSetStatus").classList.toggle("hidden", !r.canEdit);
  $("rSub").innerHTML = `${esc(c.vendor)} · Owner: <b>${esc(r.responsibleName||"Not assigned")}</b>`;
  const recordTabs=$("viewRecord").querySelector('.tabs');
  recordTabs.querySelectorAll('button').forEach(b=>{b.hidden=!['terms','seats','documents',tabName].includes(b.dataset.tab);if(b.dataset.tab==='terms')b.firstChild.textContent='Overview';if(b.dataset.tab==='seats')b.firstChild.textContent='People & licenses';});
  recordTabs.querySelector('[data-record-more]')?.remove();
  const more=document.createElement('select');more.dataset.recordMore='';more.setAttribute('aria-label','More contract details');more.innerHTML='<option value="">Activity & more</option><option value="proposals">AI suggestions</option><option value="tasks">Tasks & decisions</option><option value="messages">Email history</option><option value="history">Audit history</option>';more.onchange=()=>{if(more.value)location.hash=`#/c/${c.id}/${more.value}`;};recordTabs.append(more);
  const openP = r.proposals.filter((p) => p.status === "open").length, openT = r.tasks.filter((x) => !N(x.doneAt)).length;
  $("rPropCount").textContent = openP ? `(${openP})` : ""; $("rTaskCount").textContent = openT ? `(${openT})` : ""; $("rSrcCount").textContent = r.sources.length ? `(${r.sources.length})` : ""; $("rDocCount").textContent = r.documents.length ? `(${r.documents.length})` : "";
  // terms
  const kv = (k, v, unk) => `<div><div class="k">${k}</div><div class="v${v ? "" : " unk"}">${v ? esc(v) : unk || "unknown"}</div></div>`;
  const noticeRule = t.noticeMonths.length ? `${N(t.noticeMonths[0])} months before` : t.noticeDays.length ? `${N(t.noticeDays[0])} days before` : "";
  const missing = [];
  if (!t.amountMinor.length && t.interval !== "none") missing.push("amount"); if (!t.interval) missing.push("billing interval"); if (!t.renewalDate && !t.end && t.renewalRule !== "indefinite") missing.push("renewal or end date"); if (!t.noticeDate && !noticeRule && t.renewalRule !== "none" && t.renewalRule !== "indefinite") missing.push("notice rule");
  const dTo = (iso) => { if (!iso) return null; const d = Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.now()) / 86400000); return d; };
  const dl = (label, iso) => { const d = dTo(iso); return `<div class="dl${d !== null && d <= 14 ? " hot" : ""}"><div class="d">${iso ? esc(iso) : "—"}</div><div class="l">${label}${d !== null ? " · " + esc(days(d)) : ""}</div></div>`; };
  $("rTerms").innerHTML = `${missing.length ? `<div class="notice">Still missing on this record: ${missing.join(", ")}. Confirm a proposal or enter what you know under EDIT TERMS.</div>` : ""}
    <div class="scard"><h3 style="display:flex;align-items:center;gap:12px">Confirmed terms<span style="flex:1"></span>${r.canEdit ? `<button class="linkbtn" id="rEditTerms">EDIT TERMS</button>` : ""}</h3>
      <div class="kvgrid">${kv("Amount", money(t.amountMinor.length ? t.amountMinor[0] : null, t.currency))}${kv("Tax basis", t.taxBasis === "unknown" ? "" : t.taxBasis)}${kv("Billed", INTERVAL_LBL[t.interval] || t.interval, "unknown")}${kv("Quantity", t.quantity.length ? `${N(t.quantity[0])} units` : "", "—")}${kv("Unit price", money(t.unitMinor.length ? t.unitMinor[0] : null, t.currency), "—")}${kv("Start", t.start)}${kv("End", t.end, "open-ended / unknown")}${kv("Renewal", RENEWAL_LBL[t.renewalRule] || t.renewalRule)}${kv("Renewal date", t.renewalDate)}${kv("Notice period", noticeRule)}${kv("Note", t.note, "—")}</div>
      <div class="deadline">${dl("Last cancellation date", t.noticeDate)}${dl("Decide by (internal)", t.decideBy)}${dl("Renews / ends", t.renewalDate || t.end)}</div></div>
    <div class="scard"><h3 style="display:flex;align-items:center;gap:12px">Future terms<span style="flex:1"></span>${r.canEdit ? `<button class="linkbtn" id="rEditFuture">${c.futureTerms.length ? "EDIT" : "ADD"}</button>` : ""}</h3>${c.futureTerms.length ? (() => { const f = c.futureTerms[0]; return `<div class="kvgrid">${kv("Amount", money(f.amountMinor.length ? f.amountMinor[0] : null, f.currency))}${kv("Billed", INTERVAL_LBL[f.interval] || f.interval)}${kv("From", f.start)}${kv("Renewal", RENEWAL_LBL[f.renewalRule] || f.renewalRule)}${kv("Note", f.note, "—")}</div>`; })() : `<div class="kv">An agreed change that starts later — a new price from January, say. Confirmed terms stay as they are until then.</div>`}</div>`;
  if(c.tags.some(tag=>['document-type:receipt','document-type:invoice'].includes(tag))){
    $('rTerms').innerHTML='<div class="scard"><h3>Document details</h3><div class="kvgrid">'+kv('Supplier',c.vendor)+kv('Product or service',c.product)+kv('Document total',money(t.amountMinor.length?t.amountMinor[0]:null,t.currency))+kv('Tax basis',t.taxBasis==='unknown'?'':t.taxBasis)+(t.interval?kv('Billing frequency shown',INTERVAL_LBL[t.interval]||t.interval):'')+kv('Notes and payment details',t.note,'Not stated')+'</div>'+(r.canEdit?'<div class="btnrow"><button class="pill outline sm" id="rEditTerms">Edit details</button></div>':'')+'</div><div class="notice soft">This record keeps the billing document. It does not itself create renewal obligations or verify payment. The original is available in Documents.</div>';
  }
  const commercialHost=document.createElement('section');commercialHost.className='scard commercial-details';$('rTerms').append(commercialHost);
  const commercialToken=hubTok;
  renderCommercialDetails(commercialHost,{record:r,save:fields=>backend.setCommercialDetails(commercialToken,c.id,c.revision,fields),done:()=>enterRecord(id,tabName),stale:staleView});
  const et = $("rEditTerms"); if (et) et.onclick = () => openTerms(false);
  const ef = $("rEditFuture"); if (ef) ef.onclick = () => openTerms(true);
  if(tabName==='terms'){
    const cards=[...$('rTerms').querySelectorAll(':scope > .scard')];
    for(const card of cards.slice(1)){const details=document.createElement('details');details.className='scard';const title=card.querySelector('h3')?.textContent||'More details';details.innerHTML='<summary>'+esc(title.replace(/ADD|EDIT/g,''))+'</summary>';card.replaceWith(details);details.append(card);}
  }
  // proposals
  await renderProposals($("rProposals"), r.proposals, { candidates: [], onDone: () => enterRecord(id, tabName) });
  if (staleView()) return;
  if (r.canEdit) { const d = document.createElement("div"); d.className = "btnrow"; d.innerHTML = `<button class="pill outline sm" id="rPropose">PROPOSE A CHANGE</button>`; $("rProposals").prepend(d); $("rPropose").onclick = () => openPropose(); }
  // tasks
  const openTasks = r.tasks.filter((x) => !N(x.doneAt)), doneTasks = r.tasks.filter((x) => N(x.doneAt));
  if (staleView()) return;
  $("rTasks").innerHTML = (r.canEdit ? `<div class="btnrow" style="margin:0 0 12px"><button class="pill outline sm" id="rAddTask">ADD A TASK</button></div>` : "") + (openTasks.length ? openTasks.map(taskItem).join("") : `<div class="empty">No open task. Deadline tasks appear on their own once the terms are confirmed.</div>`) + (doneTasks.length ? `<div class="dsec">Done (${doneTasks.length})</div>` + doneTasks.map((x) => `<div class="item"><div class="ttl" style="font-size:15px">${esc(x.title)}<small>${x.dueOn ? "due " + esc(x.dueOn) + " · " : ""}done ${fmtD(x.doneAt)}</small></div></div>`).join("") : "");
  wireItems($("rTasks"));
  const at = $("rAddTask"); if (at) at.onclick = () => openTask();
  // messages + rules
  $("rMessages").innerHTML = (r.sources.length ? `<div class="tblwrap"><table class="plain"><thead><tr><th>Message</th><th>From</th><th>Status</th><th>Received</th></tr></thead><tbody>${r.sources.map((s) => `<tr class="rowlink" data-s="${s.id}"><td>${esc(s.subject || "(no subject)")}</td><td>${esc(s.fromName || s.fromAddr)}</td><td>${tag(s.status, SSTATUS_LBL[s.status] || s.status)}</td><td class="mono">${fmtD(s.receivedAt)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No message is filed to this contract yet. Put the contracts address in CC when you write to the vendor.</div>`) +
    (isStaff() ? `<div class="dsec">Matching rules</div><div class="kv" style="margin-bottom:8px">Mail that matches one of these is filed here without asking.</div>${r.rules.length ? `<table class="plain"><tbody>${r.rules.map((ru) => `<tr><td>${esc(RULE_LBL[ru.kind] || ru.kind)}</td><td class="mono">${esc(ru.value)}</td><td>${ru.confirmed ? "confirmed" : "learned"}</td><td style="text-align:right"><button class="linkbtn" data-rmrule="${ru.id}">Remove</button></td></tr>`).join("")}</tbody></table>` : `<div class="kv muted">none yet — the FILE dialog on a message can remember its sender</div>`}<div class="btnrow"><input type="text" id="rRuleVal" placeholder="billing@vendor.example · vendor.example · SC-4471 · a subject fragment" style="flex:1;min-width:220px"><select id="rRuleKind"><option value="senderAddress">sender address</option><option value="senderDomain">sender domain</option><option value="customerRef">customer reference</option><option value="subjectContains">subject contains</option></select><button class="linkbtn" id="rRuleAdd">ADD RULE</button></div>` : "");
  $("rMessages").querySelectorAll("tr[data-s]").forEach((row) => { row.onclick = () => { location.hash = "#/inbox/" + row.dataset.s; }; });
  $("rMessages").querySelectorAll("[data-rmrule]").forEach((b) => { b.onclick = async () => { const x = await backend.removeRule(hubTok, BigInt(b.dataset.rmrule)); toast(x.ok ? "Rule removed" : x.detail); if (x.ok) enterRecord(id, tabName); }; });
  const ra = $("rRuleAdd"); if (ra) ra.onclick = async () => { const v = $("rRuleVal").value.trim(); if (!v) return; const x = await backend.addRule(hubTok, $("rRuleKind").value, v, c.id); toast(x.ok ? "Rule added" : x.detail); if (x.ok) enterRecord(id, tabName); };
  // documents
  $("rDocuments").innerHTML = r.documents.length ? docTable(r.documents) : `<div class="empty">No files yet — attachments of filed messages appear here.</div>`;
  wireDocs($("rDocuments"));
  // seats
  const active = N(r.row.holders), seats = c.seats.length ? N(c.seats[0]) : null;
  $("rSeats").innerHTML = `<div class="tgrid"><div class="tstat"><div class="v">${seats === null ? "—" : seats}</div><div class="l">seats bought</div></div><div class="tstat"><div class="v">${active}</div><div class="l">active holders</div></div><div class="tstat"><div class="v">${seats === null ? "—" : Math.max(0, seats - active)}</div><div class="l">unused</div></div><div class="tstat"><div class="v">${r.holderNames.filter(h=>!h[2]).length}</div><div class="l">holders who left</div></div></div>
    <div class="scard"><h3>Seat holders</h3><div class="kv">Who uses a seat, from the hub directory. People who left the company stay listed and struck through until you remove them — that is your signal to free the seat before the renewal.${seats === null ? " Set the seats bought under EDIT." : ""}</div>
    <div class="chips" id="rHolders">${r.holderNames.map((h) => chip(h[1] || h[0], h[0], !h[2])).join("") || '<span class="kv muted">nobody yet</span>'}</div>
    ${r.canEdit ? `<label class="flabel">Add a holder</label><div class="pick"><input type="text" id="rHolderIn" placeholder="Search the directory…" autocomplete="off"><div class="list hidden" id="rHolderList"></div></div>` : ""}</div>`;
  if (r.canEdit) {
    attachPicker("rHolderIn", "rHolderList", async (p) => { await saveInput({ holders: [...c.holders, p.id] }, id, tabName); }, () => c.holders);
    $("rHolders").onclick = async (e) => { if (!e.target.dataset.rm) return; await saveInput({ holders: c.holders.filter((h) => h !== e.target.dataset.rm) }, id, tabName); };
  } else $("rHolders").querySelectorAll("button").forEach((b) => b.remove());
  const groupHost=document.createElement("section");groupHost.className="scard assignment-groups";$("rSeats").append(groupHost);
  await renderAssignments(groupHost,{api:backend,token:viewToken,record:r,stale:staleView,done:()=>enterRecord(id,tabName)});
  if(staleView())return;
  // history
  $("rHistory").innerHTML = r.audit.length ? `<div class="tblwrap"><table class="plain"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Before</th><th>After</th></tr></thead><tbody>${r.audit.map((a) => `<tr><td class="mono">${fmtD(a.at)}</td><td>${esc(a.who)}</td><td>${esc(a.what)}${a.sourceId.length ? ` · <a href="#/inbox/${a.sourceId[0]}">message</a>` : ""}</td><td class="kv">${esc(a.before)}</td><td class="kv">${esc(a.after)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No history yet.</div>`;
  document.getElementById("rMoveSpace")?.remove();
  if (r.canEdit && (currentSpace?.role?.owner !== undefined || (currentSpace?.kind === "legacy" && c.responsible === me.id)) && spaces.some(s => s.id !== me.space && !s.archived && Object.keys(s.role)[0] === "owner")) {
    const button = document.createElement("button"); button.id = "rMoveSpace"; button.className = "linkbtn"; button.textContent = "MOVE TO WORKSPACE…";
    $("rSub").appendChild(button);
    button.onclick = () => {
      const destinations = spaces.filter(s => s.id !== me.space && !s.archived && Object.keys(s.role)[0] === "owner");
      $("cmText").textContent = "Move this contract and its related documents? Members of the destination workspace will gain access under its rules.";
      const select = document.createElement("select"); select.id = "moveSpaceTarget"; select.setAttribute("aria-label", "Destination workspace"); select.innerHTML = destinations.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join(""); $("cmText").appendChild(select);
      $("confirmModal").classList.add("on");
      $("cmNo").onclick = () => $("confirmModal").classList.remove("on");
      $("cmYes").onclick = async () => {
        const dest = select.value, token = hubTok;
        $("cmYes").disabled = true;
        try {
          const result = await backend.moveContract(token, c.id, c.revision, dest);
          if (!result.ok) { toast(result.detail); return; }
          $("confirmModal").classList.remove("on"); await chooseSpace(dest, false); location.hash = "#/c/" + c.id; await enterRecord(Number(c.id), "terms"); toast("Contract moved");
        } finally { $("cmYes").disabled = false; }
      };
    };
  }

}
function inputOf(c) { return { title: c.title, vendor: c.vendor, product: c.product, customerRef: c.customerRef, responsible: c.responsible, deputy: c.deputy, visibility: c.visibility, viewers: [...c.viewers], seats: c.seats, holders: [...c.holders], tags: [...c.tags] }; }
async function saveInput(patch, id, tabName) {
  const c = cur.contract; const r = await backend.updateContract(hubTok, c.id, c.revision, { ...inputOf(c), ...patch });
  if (!r.ok) { toast(r.detail); cur = null; } else toast("Saved");
  enterRecord(id, tabName);
}
// change status
$("rSetStatus").onclick = () => { $("stSel").value = cur.contract.status; $("stNote").value = ""; setStatus("stStatus", "", ""); $("statusModal").classList.add("on"); };
$("stCancel").onclick = () => $("statusModal").classList.remove("on");
$("stSave").onclick = async () => { const c = cur.contract; const r = await backend.setStatus(hubTok, c.id, c.revision, $("stSel").value, $("stNote").value.trim()); if (!r.ok) { setStatus("stStatus", "err", r.detail); return; } $("statusModal").classList.remove("on"); toast("Status changed"); cur = null; route(); };
// add task
let tkAss = null;
attachPicker("tkAssIn", "tkAssList", (p) => { tkAss = p; $("tkAssChip").innerHTML = chip(p.displayName, p.id); });
$("tkAssChip").onclick = (e) => { if (e.target.dataset.rm) { tkAss = null; $("tkAssChip").innerHTML = ""; } };
function openTask() { tkAss = null; $("tkText").value = ""; $("tkDue").value = ""; $("tkAssChip").innerHTML = ""; setStatus("tkStatus", "", ""); $("taskModal").classList.add("on"); $("tkText").focus(); }
$("tkCancel").onclick = () => $("taskModal").classList.remove("on");
$("tkSave").onclick = async () => { const title = $("tkText").value.trim(); if (!title) { setStatus("tkStatus", "err", "say what needs doing"); return; } const r = await backend.addTask(hubTok, cur.contract.id, title, $("tkDue").value, tkAss ? tkAss.id : ""); if (!r.ok) { setStatus("tkStatus", "err", r.detail); return; } $("taskModal").classList.remove("on"); toast("Task added"); cur = null; route(); };
// propose a change
const PROPOSABLE = [...commercialFields.map(([key])=>key),"amountMinor", "currency", "taxBasis", "interval", "quantity", "unitMinor", "start", "end", "renewalRule", "renewalDate", "noticeMonths", "noticeDays", "noticeDate", "seats", "vendor", "product", "customerRef", "title", "note"];
function prRow() { return `<div class="row" style="margin-top:8px"><div><select data-pf>${PROPOSABLE.map((f) => `<option value="${f}">${esc(FIELD_LBL[f])}</option>`).join("")}</select></div><div class="w2"><input type="text" data-pv placeholder="new value (amounts as 1500.00, dates as YYYY-MM-DD)"></div></div>`; }
function openPropose() { $("prRows").innerHTML = prRow(); $("prSummary").value = ""; setStatus("prStatus", "", ""); $("proposeModal").classList.add("on"); }
$("prAdd").onclick = () => $("prRows").insertAdjacentHTML("beforeend", prRow());
$("prCancel").onclick = () => $("proposeModal").classList.remove("on");
$("prSave").onclick = async () => {
  const changes = [...$("prRows").querySelectorAll(".row")].map((r) => { const f = r.querySelector("[data-pf]").value; let v = r.querySelector("[data-pv]").value.trim(); if (MONEY_FIELDS.includes(f) && /^-?\d+$/.test(v)) v += ".00"; return { field: f, value: v }; }).filter((x) => x.value !== "");
  if (!changes.length) { setStatus("prStatus", "err", "enter at least one value"); return; }
  const r = await backend.proposeChange(hubTok, cur.contract.id, [], changes, $("prSummary").value.trim());
  if (!r.ok) { setStatus("prStatus", "err", r.detail); return; }
  const cid = cur.contract.id; cur = null;
  $("proposeModal").classList.remove("on"); toast("Proposed — confirm it under Proposals");
  if (location.hash === `#/c/${cid}/proposals`) route(); else location.hash = `#/c/${cid}/proposals`;
};

/* ============================== edit drawer (record fields, not terms) ============================== */
let ed = null; // { id (null = new), revision, input }
attachPicker("edRespIn", "edRespList", (p) => { ed.input.responsible = p.id; ed.names[p.id] = p.displayName; $("edRespChip").innerHTML = chip(p.displayName, p.id); });
$("edRespChip").onclick = (e) => { if (e.target.dataset.rm) { ed.input.responsible = ""; $("edRespChip").innerHTML = ""; } };
$("edDepIn").dataset.allowGroup = "0";
attachPicker("edDepIn", "edDepList", (p) => { ed.input.deputy = p.id; ed.names[p.id] = p.displayName; $("edDepChip").innerHTML = chip(p.displayName, p.id); });
$("edDepChip").onclick = (e) => { if (e.target.dataset.rm) { ed.input.deputy = ""; $("edDepChip").innerHTML = ""; } };
attachPicker("edViewIn", "edViewList", (p) => { if (!ed.input.viewers.includes(p.id)) ed.input.viewers.push(p.id); ed.names[p.id] = p.displayName; renderViewers(); }, () => ed.input.viewers);
$("edViewChips").onclick = (e) => { if (e.target.dataset.rm) { ed.input.viewers = ed.input.viewers.filter((v) => v !== e.target.dataset.rm); renderViewers(); } };
function renderViewers() { $("edViewChips").innerHTML = ed.input.viewers.map((v) => chip(ed.names[v] || v, v)).join("") || '<span class="kv muted">nobody besides the responsible person and the deputy</span>'; }
function openEdit(rec) {
  const c = rec ? rec.contract : null;
  ed = { id: c ? c.id : null, revision: c ? c.revision : 0n, input: c ? inputOf(c) : { title: "", vendor: "", product: "", customerRef: "", responsible: currentSpace?.kind === "personal" ? me.id : "", deputy: "", visibility: "team", viewers: [], seats: [], holders: [], tags: [] }, names: {} };
  if (rec) { ed.names[c.responsible] = rec.responsibleName; ed.names[c.deputy] = rec.deputyName; rec.viewerNames.forEach((v) => { ed.names[v[0]] = v[1]; }); }
  if (!rec && currentSpace?.kind === "personal") ed.names[me.id] = me.displayName;
  $("edTitle").textContent = c ? "Edit the record" : "New contract";
  $("edTitleIn").value = ed.input.title; $("edVendor").value = ed.input.vendor; $("edProduct").value = ed.input.product; $("edRef").value = ed.input.customerRef; $("edVis").value = ed.input.visibility; $("edSeats").value = ed.input.seats.length ? N(ed.input.seats[0]) : ""; $("edTags").value = ed.input.tags.join(", ");
  $("edRespChip").innerHTML = ed.input.responsible ? chip(ed.names[ed.input.responsible] || ed.input.responsible, ed.input.responsible) : ""; $("edDepChip").innerHTML = ed.input.deputy ? chip(ed.names[ed.input.deputy] || ed.input.deputy, ed.input.deputy) : ""; renderViewers();
  ["edRespIn", "edDepIn", "edViewIn"].forEach((i) => { $(i).value = ""; }); $("edRespIn").disabled = !isStaff() || currentSpace?.kind === "personal"; $("edDepIn").disabled = currentSpace?.kind === "personal"; $("edViewIn").disabled = currentSpace?.kind === "personal"; setStatus("edStatus", "", "");
  $("editDrawer").classList.add("on"); $("edTitleIn").focus();
}
$("rEdit").onclick = () => openEdit(cur);
$("edClose").onclick = () => $("editDrawer").classList.remove("on");
$("edSave").onclick = () => withAction($("edSave"), "edStatus", async (token) => {
  const editor = ed, wasNew = ed.id === null;
  const seats = $("edSeats").value.trim();
  if (seats && !/^\d+$/.test(seats)) { setStatus("edStatus", "err", "Seats must be a whole number, zero or more."); return; }
  const input = { ...ed.input, title: $("edTitleIn").value.trim(), vendor: $("edVendor").value.trim(), product: $("edProduct").value.trim(), customerRef: $("edRef").value.trim(), visibility: $("edVis").value, seats: seats === "" ? [] : [BigInt(seats)], tags: $("edTags").value.split(",").map((s) => s.trim()).filter(Boolean) };
  if (!input.title && !input.vendor) { setStatus("edStatus", "err", "a title or a vendor, at least"); return; }
  if (!input.title) input.title = input.vendor + (input.product ? " · " + input.product : "");
  setStatus("edStatus", "", "saving…");
  const r = ed.id === null ? await backend.createContract(token, input) : await backend.updateContract(token, ed.id, ed.revision, input);
  if (token !== hubTok) return;
  if (!r.ok) { setStatus("edStatus", "err", r.detail); return; }
  if (wasNew) { editor.id = r.id; editor.revision = r.revision || 1n; }
  if (editor.sourceId) {
    const linked = await backend.linkSource(token, editor.sourceId, [editor.id], []);
    if (token !== hubTok) return;
    if (!linked.ok) { setStatus("edStatus", "err", "Contract created, but the document could not be filed. Open the inbox and file it to this new contract."); return; }
  }
  $("editDrawer").classList.remove("on"); toast(wasNew ? "Contract created as a draft" : "Saved"); cur = null;
  if (wasNew || editor.sourceId) location.hash = "#/c/" + editor.id; else route();
});

/* ============================== terms drawer ============================== */
let tdFuture = false;
const decOf = (o) => (o.length ? toDec(String(o[0])).replace(/,/g, "") : "");
function openTerms(future) {
  tdFuture = future; const c = cur.contract; const t = future ? (c.futureTerms.length ? c.futureTerms[0] : c.terms) : c.terms;
  $("tdTitle").textContent = future ? "Future terms" : "Confirmed terms";
  $("tdHint").textContent = future ? "An agreed change that starts later. Set the date it starts under Start; the confirmed terms stay until then." : "What you know for sure. Leave a field empty when you do not know — the record will show it as missing rather than guess.";
  $("tdAmount").value = decOf(t.amountMinor); $("tdCurrency").value = t.currency; $("tdTax").value = t.taxBasis || "unknown"; $("tdInterval").value = t.interval; $("tdQty").value = t.quantity.length ? N(t.quantity[0]) : ""; $("tdUnit").value = decOf(t.unitMinor);
  $("tdStart").value = t.start; $("tdEnd").value = t.end; $("tdRenewal").value = t.renewalRule; $("tdRenewalDate").value = t.renewalDate; $("tdNoticeM").value = t.noticeMonths.length ? N(t.noticeMonths[0]) : ""; $("tdNoticeD").value = t.noticeDays.length ? N(t.noticeDays[0]) : ""; $("tdNoticeDate").value = t.noticeDate; $("tdNote").value = t.note; $("tdWhy").value = "";
  $("tdClear").classList.toggle("hidden", !(future && c.futureTerms.length)); setStatus("tdStatus", "", "");
  $("termsDrawer").classList.add("on");
}
$("tdClose").onclick = () => $("termsDrawer").classList.remove("on");
// a typed amount → minor units (Int); accepts 1500, 1500.5, 1,500.00, 1.500,00
function minorOf(text) {
  let s = String(text).trim().replace(/[^\d.,'’-]/g, "").replace(/['’]/g, ""); if (!s) return [];
  const neg = s.startsWith("-"); s = s.replace("-", "");
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let whole = s, frac = "";
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) { whole = s.slice(0, lastSep); frac = s.slice(lastSep + 1); }
  whole = whole.replace(/[.,]/g, ""); frac = (frac + "00").slice(0, 2);
  if (!/^\d*$/.test(whole) || !/^\d{2}$/.test(frac)) return null;
  return [BigInt((neg ? "-" : "") + (whole || "0") + frac)];
}
$("tdSave").onclick = async () => {
  const amount = minorOf($("tdAmount").value), unit = minorOf($("tdUnit").value);
  if (amount === null || unit === null) { setStatus("tdStatus", "err", "that is not an amount"); return; }
  const nm = $("tdNoticeM").value.trim(), nd = $("tdNoticeD").value.trim();
  if (nm && nd) { setStatus("tdStatus", "err", "notice period: months or days, not both"); return; }
  const t = { amountMinor: amount, currency: $("tdCurrency").value.trim().toUpperCase(), taxBasis: $("tdTax").value, interval: $("tdInterval").value, quantity: $("tdQty").value.trim() ? [BigInt($("tdQty").value.trim())] : [], unitMinor: unit, start: $("tdStart").value, end: $("tdEnd").value, renewalRule: $("tdRenewal").value, renewalDate: $("tdRenewalDate").value, noticeDays: nd ? [BigInt(nd)] : [], noticeMonths: nm ? [BigInt(nm)] : [], noticeDate: $("tdNoticeDate").value, decideBy: "", note: $("tdNote").value.trim() };
  const c = cur.contract; setStatus("tdStatus", "", "saving…");
  const r = tdFuture ? await backend.setFutureTerms(hubTok, c.id, c.revision, [t]) : await backend.setTerms(hubTok, c.id, c.revision, t, $("tdWhy").value.trim());
  if (!r.ok) { setStatus("tdStatus", "err", r.detail); if (/revision/.test(r.detail)) cur = null; return; }
  $("termsDrawer").classList.remove("on"); toast(`Saved — revision ${N(r.revision)}`); cur = null; route();
};
$("tdClear").onclick = async () => { const c = cur.contract; const r = await backend.setFutureTerms(hubTok, c.id, c.revision, []); if (!r.ok) { setStatus("tdStatus", "err", r.detail); return; } $("termsDrawer").classList.remove("on"); toast("Future terms cleared"); cur = null; route(); };

/* ============================== connection (staff) ============================== */
const CN_TABS = ["status", "ai", "relay", "settings", "import", "export", "log"];
$("viewConn").querySelectorAll(".tabs button").forEach((b) => { b.onclick = () => { location.hash = "#/connection/" + b.dataset.tab; }; });
async function enterConn(tabName) {
  show("viewConn");
  if (!isStaff() && !isAdmin() && tabName !== "ai") tabName = "export";
  if (!CN_TABS.includes(tabName) || (!isAdmin() && ["relay", "settings", "log"].includes(tabName)) || (tabName === "import" && !isStaff())) tabName = "status";
  showTab("viewConn", "cn", tabName, CN_TABS);
  if (tabName === "status") await loadConnStatus();
  if (tabName === "ai") await loadAiStatus();
  if ((tabName === "relay" || tabName === "settings") && isAdmin()) await loadSettings();
  if (tabName === "log" && isAdmin()) { const rows = await backend.adminLogRows(hubTok); $("logRows").innerHTML = rows.map((l) => `<tr><td class="mono">${fmtD(l.at)}</td><td>${esc(l.who)}</td><td>${esc(l.what)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">nothing yet</td></tr>`; }
}
let aiPanelState = null;
let aiPanelBusy = false;
function renderAiStatus(s) {
  aiPanelState = s;
  const state = (ready) => s.checked ? (ready ? "Ready" : "Needs attention") : "Checking";
  $("aiConnection").innerHTML = `<div class="ai-connection-steps">${[["Hub registration", s.registered], ["Contracts AI lane", s.laneGranted], ["Provider key", s.keySet]].map(([name, ready]) => `<div class="ai-connection-step"><span class="ai-step-icon ${s.checked && ready ? "ready" : ""}" aria-hidden="true">${s.checked && ready ? "✓" : "○"}</span><div><strong>${esc(name)}</strong><span>${state(ready)}</span></div></div>`).join("")}</div><p class="ai-connection-detail">${esc(s.detail)}</p><dl class="ai-connection-meta"><div><dt>Provider</dt><dd>${esc(s.provider || "Not configured")}</dd></div><div><dt>Model</dt><dd>${esc(s.model || "Not configured")}</dd></div><div><dt>Daily budget</dt><dd>${N(s.callsToday)} / ${N(s.dailyBudget)} requests used</dd></div><div><dt>Last Hub check</dt><dd>${fmtD(s.checkedAt)}</dd></div></dl>`;
  const result = opt(s.lastTest);
  $("aiTestResult").innerHTML = result ? `<div class="ai-test-report ${result.ok ? "ok" : "err"}"><strong>${result.ok ? "Model test passed" : "Model test failed"}</strong><p>${esc(result.detail)}</p><span class="kv">${fmtD(result.at)} · ${esc(result.model || s.model)}</span></div>` : `<p class="kv">${s.testRunning ? "A connection test is running…" : "The provider has not been tested with the current configuration since this restart."}</p>`;
  if (!s.canTest) $("aiTestResult").insertAdjacentHTML("beforeend", '<p class="kv">A Contracts administrator can run this test for you.</p>');
  $("aiTest").disabled = aiPanelBusy || !s.canTest || !s.credentialsReady || s.testRunning || N(s.callsToday) >= N(s.dailyBudget);
  $("aiRefresh").disabled = aiPanelBusy;
  $("aiHubSettings").href = HUB_URL.replace(/\/$/, "") + "/#/settings/ai";
}
async function loadAiStatus() {
  const stale = viewGuard("loadAiStatus"), token = hubTok;
  aiPanelState = null;
  $("aiTest").disabled = true;
  $("aiTestResult").textContent = "";
  setStatus("aiActionStatus", "", "");
  $("aiConnection").innerHTML = '<p class="kv">Loading the AI connection…</p>';
  try {
    const s = opt(await backend.getAiStatus(token));
    if (stale()) return;
    if (!s) { $("aiConnection").textContent = "Sign in again from the Hub to check this connection."; $("aiTest").disabled = true; return; }
    renderAiStatus(s);
  } catch (_) { if (!stale()) { $("aiConnection").textContent = "Could not load the AI status. Please refresh the connection."; $("aiTest").disabled = true; } }
}
async function runAiAction(testModel) {
  if (aiPanelBusy || (testModel && (!aiPanelState?.canTest || $("aiTest").disabled))) return;
  const stale = viewGuard("runAiAction"), token = hubTok;
  aiPanelBusy = true; $("aiRefresh").disabled = true; $("aiTest").disabled = true;
  setStatus("aiActionStatus", "", testModel ? "Testing the configured model…" : "Checking the Hub…");
  try {
    if (testModel) {
      const r = await backend.testAiConnection(token);
      if (stale()) return;
      setStatus("aiActionStatus", r.ok ? "ok" : "err", r.detail);
      const s = opt(await backend.getAiStatus(token));
      if (!stale() && s) renderAiStatus(s);
    } else {
      const s = opt(await backend.refreshAiStatus(token));
      if (stale()) return;
      if (s) { renderAiStatus(s); setStatus("aiActionStatus", s.credentialsReady ? "ok" : "err", s.detail); }
      else setStatus("aiActionStatus", "err", "Your session could not be confirmed. Reopen Contracts from the Hub.");
    }
  } catch (_) { if (!stale()) setStatus("aiActionStatus", "err", "The check could not finish. Refresh the status before starting another test."); }
  finally {
    aiPanelBusy = false;
    if (!$("cnAi").classList.contains("hidden") && $("viewConn").classList.contains("on")) {
      if (aiPanelState) renderAiStatus(aiPanelState);
      else $("aiRefresh").disabled = false;
    }
  }
}
$("aiRefresh").onclick = () => runAiAction(false);
$("aiTest").onclick = () => runAiAction(true);
async function loadConnStatus() {
  const viewToken = hubTok, staleView = viewGuard("loadConnStatus");
  $("cnStatus").innerHTML = `<div class="empty">Loading…</div>`;
  let s = null;
  try { s = opt(await backend.connectionStatus(hubTok)); } catch (e) { if (staleView()) return; $("cnStatus").innerHTML = `<div class="empty">Could not load: ${esc(String(e).slice(0, 160))}</div>`; return; }
  if (staleView()) return;
  if (!s) { $("cnStatus").innerHTML = `<div class="empty">Space owners and editors see intake diagnostics. You can export the records available to you.</div>`; return; }
  const jobs = s.jobs.filter((j) => !N(j.doneAt));
  $("cnStatus").innerHTML = `<div class="tgrid">
      <div class="tstat"><div class="v">${s.lastReceivedAt ? fmtDate(s.lastReceivedAt) : "—"}</div><div class="l">last message</div></div>
      <div class="tstat"><div class="v">${N(s.sourcesToday)}</div><div class="l">messages today</div></div>
      <div class="tstat"><div class="v">${N(s.openJobs)}</div><div class="l">in processing</div></div>
      <div class="tstat"><div class="v" ${N(s.failedJobs) + N(s.failedSources) ? 'style="color:var(--ks-accent)"' : ""}>${N(s.failedJobs) + N(s.failedSources)}</div><div class="l">failed</div></div>
      <div class="tstat"><div class="v">${N(s.aiCallsToday)}<span class="kv">/${N(s.aiDailyBudget)}</span></div><div class="l">AI reads today</div></div>
      <div class="tstat"><div class="v" ${N(s.outboxFailed) ? 'style="color:var(--ks-accent)"' : ""}>${N(s.outboxPending)}<span class="kv">${N(s.outboxFailed) ? ` · ${N(s.outboxFailed)} failed` : ""}</span></div><div class="l">reminders queued</div></div>
    </div>
    <div class="scard"><h3>How mail gets here</h3><div class="kvgrid">${[["Contracts address", s.mailboxAddress || "not set — Relay tab"], ["Relay identities", N(s.relayCount) ? `${N(s.relayCount)} trusted` : "none — only .eml uploads work"], ["AI", s.aiSource ? "Hub access available; model test separate" : me.aiChecked === false ? "checking the Hub…" : "not available"], ["Directory refresh", fmtD(s.lastDirectoryPull)], ["Files stored", (N(s.blobBytes) / 1e6).toFixed(1) + " MB of 400 MB"], ["Oldest open job", s.oldestOpenJobAt ? fmtD(s.oldestOpenJobAt) : "—"]].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join("")}</div><p class="kv" style="margin-top:16px"><a href="#/connection/ai">AI connection and model test →</a></p></div>
    ${jobs.length ? `<div class="scard"><h3>Processing queue</h3><div class="tblwrap"><table class="plain"><thead><tr><th>Step</th><th>Message</th><th>Attempts</th><th>Next try</th><th>Last error</th></tr></thead><tbody>${jobs.slice(0, 50).map((j) => `<tr><td class="mono">${esc(j.step)}</td><td><a href="#/inbox/${j.ref}">#${j.ref}</a></td><td class="num">${N(j.attempts)}</td><td class="mono">${fmtD(j.nextAt)}</td><td class="kv">${esc(j.lastError)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
    ${s.outboxFailures.length ? `<div class="scard"><h3>Reminders that could not be delivered</h3><div class="kv">The hub did not accept these. Retry once the hub is reachable again.</div><table class="plain"><tbody>${s.outboxFailures.map((f) => `<tr><td>${esc(f.title)}</td><td class="num">${N(f.attempts)} tries</td><td class="kv">${esc(f.lastError)}</td><td style="text-align:right"><button class="linkbtn" data-retry="${f.id}">RETRY</button></td></tr>`).join("")}</tbody></table></div>` : ""}`;
  $("cnStatus").querySelectorAll("[data-retry]").forEach((b) => { b.onclick = async () => { const r = await backend.retryNotification(hubTok, BigInt(b.dataset.retry)); toast(r.ok ? "Retried" : r.detail); loadConnStatus(); }; });
}
let settings = null;
async function loadSettings() {
  const staleView = viewGuard("loadSettings");
  const s = opt(await backend.getSettings(hubTok)); if (staleView() || !s) return;
  settings = s;
  $("rlMailbox").value = s.mailboxAddress; $("rlPrincipals").value = s.relayPrincipals.join("\n");
  $("sOrg").value = s.orgName; $("sAppUrl").value = s.appUrl;
  $("sLead").value = N(s.leadDays); $("sReminders").value = s.reminderDays.map(N).join(", "); $("sTz").value = s.tzName; $("sTzOff").value = N(s.tzOffsetMinutes); $("sAiBudget").value = N(s.aiDailyBudget);
  $("sMeta").innerHTML = `contracts ${esc(s.version)} · ${N(s.contracts)} contracts · ${N(s.sources)} messages · ${N(s.openProposals)} open proposals · ${N(s.openTasks)} open tasks · ${N(s.peopleCount)} people in the directory (refreshed ${fmtD(s.lastDirectoryPull)}) · ${N(s.adminCount)} admins · AI ${esc(s.aiSource || (me.aiChecked === false ? "checking" : "not available"))} (${N(s.aiCallsToday)}/${N(s.aiDailyBudget)} today) · hub <span class="mono">${esc(s.hubId || "not set")}</span>`;
}
function settingsArgs() { return { orgName: $("sOrg").value.trim(), appUrl: $("sAppUrl").value.trim(), editorGroup: "", adminGroup: "", mailboxAddress: $("rlMailbox").value.trim(), tzName: $("sTz").value.trim(), tzOffsetMinutes: BigInt(Number($("sTzOff").value) || 0), leadDays: BigInt(Math.max(0, Number($("sLead").value) || 0)), reminderDays: $("sReminders").value.split(",").map((x) => Number(x.trim())).filter((x) => x > 0).map(BigInt), aiDailyBudget: BigInt(Math.max(0, Number($("sAiBudget").value) || 0)) }; }
$("sSave").onclick = async () => {
  setStatus("sStatus", "", "saving…");
  const r = await backend.setSettings(hubTok, settingsArgs()); if (!r.ok) { setStatus("sStatus", "err", r.detail); return; }
  setStatus("sStatus", "ok", "saved"); await loadSettings(); await refreshMe();
};
$("rlSave").onclick = async () => {
  setStatus("rlStatus", "", "saving…");
  const r = await backend.setSettings(hubTok, settingsArgs()); if (!r.ok) { setStatus("rlStatus", "err", r.detail); return; }
  const p = await backend.setRelayPrincipals(hubTok, $("rlPrincipals").value.split(/\s+/).map((x) => x.trim()).filter(Boolean)); if (!p.ok) { setStatus("rlStatus", "err", p.detail); return; }
  setStatus("rlStatus", "ok", "saved"); await loadSettings();
};
$("sSeed").onclick = async () => { const r = await backend.seedDemo(hubTok); setStatus("sSeedStatus", r.ok ? "ok" : "err", r.ok ? "sample data added" : r.detail); loadSettings(); };
$("sUnseed").onclick = () => confirmBox("Remove the sample data? Contracts, messages and proposals marked as samples go away.", async () => { const r = await backend.removeDemo(hubTok); setStatus("sSeedStatus", r.ok ? "ok" : "err", r.ok ? "sample data removed" : r.detail); loadSettings(); });
// export
$("exCsv").onclick = () => exportCsv("exStatus");
$("exAll").onclick = async () => { try { const d = opt(await backend.exportAll(hubTok)); if (!d) { setStatus("exStatus", "err", "This workspace is not available"); return; } download(`contracts-export-${new Date().toISOString().slice(0, 10)}.json`, jsonSafe(d), "application/json"); setStatus("exStatus", "ok", "downloaded"); } catch (e) { setStatus("exStatus", "err", String(e).slice(0, 120)); } };
// import
const IMPORT_FIELDS = ["ignore", "title", "vendor", "product", "customerRef", "responsibleEmail", "status", "amount", "currency", "taxBasis", "interval", "quantity", "start", "end", "renewalRule", "renewalDate", "noticeDays", "noticeMonths", "noticeDate", "seats", "note", "tags"];
const IMPORT_LBL = { ignore: "— ignore this column —", title: "Title", vendor: "Vendor", product: "Product / plan", customerRef: "Customer reference", responsibleEmail: "Responsible (e-mail)", status: "Status", amount: "Amount", currency: "Currency", taxBasis: "Tax basis (net/gross)", interval: "Billed (month/quarter/year/once)", quantity: "Quantity", start: "Start date", end: "End date", renewalRule: "Renewal (auto/manual/none)", renewalDate: "Renewal date", noticeDays: "Notice days", noticeMonths: "Notice months", noticeDate: "Last cancellation date", seats: "Seats", note: "Note", tags: "Tags" };
const GUESS = [[/^(title|name|contract)$/i, "title"], [/vendor|supplier|provider|lieferant|anbieter/i, "vendor"], [/product|plan|service|produkt/i, "product"], [/ref|account|kunden|customer/i, "customerRef"], [/owner|responsible|verantwort|mail/i, "responsibleEmail"], [/status/i, "status"], [/amount|price|cost|betrag|preis|kosten/i, "amount"], [/currency|währung|waehrung/i, "currency"], [/tax|mwst|vat|net|gross/i, "taxBasis"], [/interval|cycle|billing|zyklus|rhythm/i, "interval"], [/quantity|qty|menge|units/i, "quantity"], [/start|begin|beginn/i, "start"], [/^end|ende|laufzeitende/i, "end"], [/renew(al)? ?(rule|type)|auto|verläng/i, "renewalRule"], [/renew|verlängerung/i, "renewalDate"], [/notice.*day|kündigungsfrist.*tag/i, "noticeDays"], [/notice|kündigungsfrist|frist/i, "noticeMonths"], [/cancel.*(date|by)|kündig.*(bis|datum)/i, "noticeDate"], [/seat|licen[cs]e|lizenz|user/i, "seats"], [/note|comment|bemerk|notiz/i, "note"], [/tag|categor|kategorie/i, "tags"]];
let imDelim = ",";
$("imFile").onchange = async () => { const f = $("imFile").files[0]; if (!f) return; $("imCsv").value = await f.text(); $("imHeaders").click(); };
$("imHeaders").onclick = () => {
  const csv = $("imCsv").value; if (!csv.trim()) { setStatus("imStatus", "err", "paste the CSV first"); return; }
  const first = csv.split(/\r?\n/)[0];
  imDelim = $("imDelim").value || ([";", ",", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0]);
  const headers = first.split(imDelim).map((h) => h.trim().replace(/^"|"$/g, ""));
  const used = new Set();
  $("imMap").innerHTML = `<table class="plain"><thead><tr><th>Column in your sheet</th><th>Means</th></tr></thead><tbody>${headers.map((h, i) => { let g = "ignore"; for (const [re, f] of GUESS) if (re.test(h) && !used.has(f)) { g = f; break; } if (g !== "ignore") used.add(g); return `<tr><td>${esc(h) || `<span class="muted">(column ${i + 1})</span>`}</td><td><select data-h="${esc(h)}">${IMPORT_FIELDS.map((f) => `<option value="${f}" ${f === g ? "selected" : ""}>${esc(IMPORT_LBL[f])}</option>`).join("")}</select></td></tr>`; }).join("")}</tbody></table>`;
  $("imPreview").classList.remove("hidden"); $("imCommit").classList.remove("hidden"); $("imCommit").disabled = true; $("imReport").innerHTML = "";
  setStatus("imStatus", "ok", `${headers.length} columns · delimiter ${imDelim === "\t" ? "tab" : JSON.stringify(imDelim)}`);
};
const imMapping = () => [...$("imMap").querySelectorAll("select[data-h]")].map((s) => [s.dataset.h, s.value]);
$("imPreview").onclick = async () => {
  setStatus("imStatus", "", "checking…");
  const r = await backend.importPreview(hubTok, $("imCsv").value, imDelim, imMapping());
  if (!r.ok) { setStatus("imStatus", "err", r.detail); $("imCommit").disabled = true; return; }
  const good = r.rows.filter((x) => x.ok && !x.exists.length).length, skip = r.rows.filter((x) => x.exists.length).length, bad = r.rows.filter((x) => !x.ok).length;
  $("imReport").innerHTML = `<div class="kv" style="margin-bottom:8px"><b>${good}</b> would be created · <b>${skip}</b> already exist (skipped) · <b>${bad}</b> with problems${r.unmapped.length ? ` · unmapped: ${esc(r.unmapped.join(", "))}` : ""}</div><div class="tblwrap" style="max-height:320px;overflow:auto"><table class="plain"><thead><tr><th>Line</th><th>Contract</th><th>Result</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td class="num">${N(x.line)}</td><td>${esc(x.title || x.vendor)}</td><td class="kv">${x.exists.length ? `exists as <a href="#/c/${x.exists[0]}">#${x.exists[0]}</a> — skipped` : x.ok ? "ok" : `<span style="color:var(--ks-accent)">${esc(x.problems.join("; "))}</span>`}</td></tr>`).join("")}</tbody></table></div>`;
  $("imCommit").disabled = good === 0; setStatus("imStatus", good ? "ok" : "err", good ? "preview ready — nothing written yet" : "nothing to import");
};
$("imCommit").onclick = () => confirmBox("Write the rows that passed the preview? Existing contracts are never overwritten.", async () => {
  const r = await backend.importCommit(hubTok, $("imCsv").value, imDelim, imMapping(), $("imBatch").value.trim() || new Date().toISOString().slice(0, 10));
  setStatus("imStatus", r.ok ? "ok" : "err", r.ok ? `${N(r.created)} created · ${N(r.skipped)} skipped · ${N(r.problems)} problems` : r.detail);
  if (r.ok) { $("imCommit").disabled = true; toast(`${N(r.created)} contracts imported as drafts`); }
});

boot().finally(() => signIn.ready()).catch(() => { $("layout").classList.remove("on"); $("login").style.display = "grid"; setStatus("loginStatus", "err", "Could not connect to Contracts. Please reload or sign in again."); });

// Roles are configured in the Hub; the app exposes no local privilege controls.
for (const link of document.querySelectorAll("[data-hub-permissions-link]")) link.href = HUB_URL.replace(/\/$/, "") + "/#/permissions";
