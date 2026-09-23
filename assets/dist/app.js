import { createHandoverPanel, renderFormerBuyer } from "./handover.js";
import { PHASES, phaseOf, nextStep } from "./workflow.js";
import { idlFactory } from "./idl.js";
import { canonicalDestination } from "./canonical-url.js";
import { appSignIn, takeHubTicket, session, mountTopbar, topbarIdlFactory } from "./hub-client.js";

// deploy-time constants (INSTALL.md: sed the placeholders; the kitchen patches them on install)
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const HUB_URL = "__HUB_URL__"; // hub FRONTEND url, e.g. https://xxxxx.icp.net
const IC_HOST = "https://icp0.io";
session.key = "ks-assets-session";

const signIn = appSignIn({ name: "Assets", hubUrl: HUB_URL });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (o) => (o && o.length ? o[0] : null);
const nsToMs = (ns) => Number(BigInt(ns) / 1000000n);
const fmt = (ns) => new Date(nsToMs(ns)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const ago = (ns) => {
  const s = Math.round((Date.now() - nsToMs(ns)) / 1000);
  if (Math.abs(s) < 60) return "just now";
  const m = Math.round(s / 60); if (Math.abs(m) < 60) return m + " min ago";
  const h = Math.round(m / 60); if (Math.abs(h) < 48) return h + " h ago";
  return Math.round(h / 24) + " d ago";
};
const setStatus = (id, cls, text) => { if (id === "loginStatus") signIn.status(cls, text); const el = $(id); if (!el) return; el.className = "status " + (cls || ""); el.textContent = text || ""; };
const bigint = (x) => BigInt(Number(x) || 0);
const KIND_ICON = { laptop: "💻", phone: "📱", tablet: "📱", monitor: "🖥", accessory: "🎧", other: "📦" };
const STATUS_WORD = { in_stock: "in stock", preparing: "with IT · preparing", assigned: "assigned", loaned: "loaned", sold: "sold", scrapped: "scrapped", lost: "lost", unknown: "unknown" };
const ACT_WORD = { handed_out: "handed out", returned: "returned", loaned: "loaned", sold: "sold", scrapped: "scrapped", lost: "lost", note: "note", photo: "photo", created: "created", edited: "edited", imported: "imported", reassigned: "reassigned", sale: "sale" };
const SALE_WORD = { draft: "draft", offered: "offered", accepted: "accepted", issued: "invoiced", paid: "paid", cancelled: "cancelled" };
const fmtMoney = (minor, cur) => { const n = Number(minor); return Math.floor(n / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'") + "." + String(n % 100).padStart(2, "0") + (cur ? " " + cur : ""); };
// "1500", "1500.5", "1'650.00", "1.650,00" → minor units (BigInt); null when unreadable
const toMinor = (text) => { let t = String(text || "").trim().replace(/[^\d.,'’-]/g, "").replace(/['’]/g, ""); if (!t) return null; const sep = Math.max(t.lastIndexOf("."), t.lastIndexOf(",")); let whole = t, frac = ""; if (sep >= 0 && t.length - sep - 1 <= 2) { whole = t.slice(0, sep); frac = t.slice(sep + 1); } whole = whole.replace(/[.,]/g, ""); frac = (frac + "00").slice(0, 2); if (!/^\d*$/.test(whole) || !/^\d{2}$/.test(frac)) return null; return BigInt((whole || "0") + frac); };
const hubSettingsAi = () => (HUB_URL.startsWith("https://") ? `${HUB_URL}/#/settings/ai` : "#");
const deviceName = (a) => (`${a.vendor} ${a.model}`.trim() || a.tag || a.serial || `device #${a.id}`);

let backend, hubActor = null, topbar = null, me = null, curId = 0, curAsset = null, curAssigneeEmail = "";

// ---------- the shared topbar (brand · app · menu · bell · theme · person) — one component for the whole suite ----------
function mountBar() {
  if (!me) return;
  const person = { email: me.email, displayName: me.displayName, role: me.role };
  if (topbar) { topbar.setPerson(person); topbar.setApp({ eyebrow: me.orgName || "" }); return; }
  topbar = mountTopbar($("topbar"), {
    hub: { actor: () => hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
    app: { id: "assets", name: "Assets", eyebrow: me.orgName || "" },
    person,
    onSignOut: signOut,
  });
}

// ---------- routing: #/intake · #/devices · #/d/<id> · #/import · #/settings · #/docs ----------
function route() {
  if (!me) return;
  clearPin();
  const h = location.hash.replace(/^#\/?/, "");
  const [view, arg] = h.split("/");
  const admin = me.role === "admin";
  let v = view || "devices";
  const known = admin ? ["intake", "devices", "d", "apple", "sales", "sale", "offers", "import", "settings", "docs"] : ["devices", "d", "offers", "sale", "docs"];
  if (!known.includes(v)) v = "devices";
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "v-" + (v === "d" ? "device" : v)));
  document.querySelectorAll("#nav .tab").forEach((el) => el.classList.toggle("active", el.dataset.view === v || (v === "d" && el.dataset.view === "devices") || (v === "sale" && el.dataset.view === (admin ? "sales" : "offers"))));
  if (v === "intake") loadRecent();
  if (v === "devices") loadDevices();
  if (v === "d") loadDevice(Number(arg));
  if (v === "apple") loadApple();
  if (v === "import") {}
  if (v === "sales") loadSales();
  if (v === "sale") loadSale(Number(arg));
  if (v === "offers") loadOffers(arg);
  if (v === "settings") { selectSettings(arg); loadSettings(); }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function renderNav() {
  const items = me.role === "admin" ? [["devices", "Devices"], ["intake", "Scan & update"], ["sales", "Sales"], ["apple", "Apple inventory"], ["settings", "Settings"], ["import", "Import / export"], ["docs", "Help"]] : [["devices", "My devices"], ["offers", "Offers & invoices"], ["docs", "How it works"]];
  $("nav").innerHTML = items.map(([v, l]) => `<button class="tab ${["import", "docs"].includes(v) ? "utility" : ""}" data-view="${v}">${l}</button>`).join("");
  $("nav").onclick = (e) => { const el = e.target.closest(".tab"); if (el) location.hash = "#/" + el.dataset.view; };

  const navView = location.hash.split("/")[1] || "devices";
  $("nav").querySelectorAll(".tab").forEach(e => e.classList.toggle("active", e.dataset.view === ({d:"devices",sale:me.role === "admin" ? "sales" : "offers"}[navView] || navView)));
  mountBar();
  $("devTitle").textContent = me.role === "admin" ? "Devices" : "My devices";
  $("devLead").textContent = me.role === "admin" ? "Find a device, see who has it, and keep its next move clear." : "The devices assigned to you, with their history.";
  $("devAdd").classList.toggle("hidden", me.role !== "admin");
  $("devScan").classList.toggle("hidden", me.role !== "admin");
  paintAiBanner();
}
const hubLaneLink = (st) => (HUB_URL.startsWith("https://") && st && Number(st.connectorId) ? `${HUB_URL}/#/apps/${Number(st.connectorId)}/know` : hubSettingsAi());
/** One sentence that says precisely what is missing — the hub told us (hub_aiStatus). */
function aiReason(st) {
  if (!st) return `no AI key from the hub — an owner sets one under <a href="${hubSettingsAi()}" target="_blank" rel="noopener">the hub's Settings → AI</a>`;
  if (!st.keySet) return `no AI key in the hub yet — an owner sets one under <a href="${hubSettingsAi()}" target="_blank" rel="noopener">the hub's Settings → AI</a>`;
  if (!st.laneGranted) return `the hub has a key, but this app was not granted the <i>AI</i> lane — <a href="${hubLaneLink(st)}" target="_blank" rel="noopener">grant it in the hub</a> (Apps → Assets → Edit → What it may know), then <i>Ask the hub again</i>`;
  return `the hub has a key and this app has the lane, but the key did not arrive yet — <i>Ask the hub again</i>`;
}
function paintAiBanner() {
  const off = !me.aiOn;
  $("aiOff").classList.toggle("hidden", !off);
  if (off) $("aiOff").innerHTML = `<b>Photo recognition is off.</b> Find devices by tag or serial. Photos still save as evidence. <a href="#/settings/connections">Manage photo recognition →</a>`;
}

// ---------- boot / session ----------
async function refreshMe() {
  const w = opt(await backend.whoami(session.load()));
  if (!w) return false;
  me = w; renderNav(); return true;
}
async function boot() {
  const { HttpAgent, Actor } = await import("./agent-bundle.js");
  const agent = await HttpAgent.create({ host: IC_HOST });
  backend = Actor.createActor(idlFactory, { agent, canisterId: BACKEND_CANISTER_ID });
  try {
    const info = await backend.info();
    if (canonicalDestination(info.appUrl, location.href)) {
      // A ticket might have returned to the old origin during the domain switch.
      // Discard it locally, restoring its saved route; sign in afresh on the new origin.
      takeHubTicket();
      location.replace(canonicalDestination(info.appUrl, location.href));
      return;
    }
    if (info.hubId) hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId });
    if (info.orgName) $("loginSub").textContent = `${info.orgName} · assets`;
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
    try { sessionStorage.removeItem("ks-assets-offer-login"); } catch (_) {}
    $("login").style.display = "none";
    $("layout").classList.add("on");
    if (!location.hash || location.hash === "#/" || location.hash === "#") location.hash = "#/devices"; else route();
    setInterval(async () => { try { if (await refreshMe()) return; } catch (_) {} signOut(); setStatus("loginStatus", "err", "Your access could not be confirmed. Check the Hub connection and sign in again from the Hub."); }, 30000);
  } else {
    session.clear();
    // A notification is already an explicit request to open this offer. Skip the
    // extra sign-in button; the shared SDK keeps its hash through the Hub/Okta trip.
    // Never loop on a rejected ticket, denied storage, or a rapid failed return.
    if (!ticket && /^#\/offers\/[1-9][0-9]*$/.test(location.hash) && HUB_URL.startsWith("https://")) {
      try {
        const last = Number(sessionStorage.getItem("ks-assets-offer-login") || 0);
        if (Date.now() - last > 60000) {
          sessionStorage.setItem("ks-assets-offer-login", String(Date.now()));
          signIn.ready(); signIn.continue();
        }
      } catch (_) {}
    }
  }
}
function signOut() {
  clearPin();
  const t = session.load(); session.clear();
  if (t) backend.signOut(t).catch(() => {});
  me = null; if (topbar) { topbar.destroy(); topbar = null; } $("layout").classList.remove("on"); $("login").style.display = "grid"; setStatus("loginStatus", "", "signed out");
}
$("loginBtn").onclick = () => signIn.continue();

// ---------- pictures: scale on the phone before anything leaves it ----------
async function shrink(file, maxSide = 1280) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(bmp.width * scale)); cv.height = Math.max(1, Math.round(bmp.height * scale));
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  let q = 0.82, blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", q));
  while (blob && blob.size > 850000 && q > 0.4) { q -= 0.12; blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", q)); }
  if (!blob || blob.size > 850000) throw new Error("could not shrink the picture below 850 KB");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg", url: URL.createObjectURL(blob) };
}
const photoUrls = {};
async function photoUrl(id) {
  id = Number(id);
  if (photoUrls[id]) return photoUrls[id];
  const r = opt(await backend.photo(session.load(), BigInt(id)));
  if (!r) return "";
  photoUrls[id] = URL.createObjectURL(new Blob([new Uint8Array(r.bytes)], { type: r.mime }));
  return photoUrls[id];
}
$("zoom").onclick = () => $("zoom").classList.remove("on");
function zoom(url) { $("zoomImg").src = url; $("zoom").classList.add("on"); }

// ---------- person picker (hub directory) ----------
function attachPicker(inputId, listId, onPick) {
  const input = $(inputId), list = $(listId);
  let timer = 0;
  input.oninput = () => { clearTimeout(timer); input.dataset.email = ""; timer = setTimeout(async () => {
    const q = input.value.trim();
    if (q.length < 1) { list.classList.add("hidden"); return; }
    const rows = await backend.directory(session.load(), q);
    list.innerHTML = rows.map((r) => `<div data-email="${esc(r.email)}" data-name="${esc(r.displayName)}">${esc(r.displayName || r.email)}<small>${esc(r.email)}${r.department ? " · " + esc(r.department) : ""}</small></div>`).join("") || '<div class="kv" style="cursor:default">nobody in the directory matches — external? type the name and keep going</div>';
    list.classList.remove("hidden");
  }, 180); };
  list.onclick = (e) => { const d = e.target.closest("[data-email]"); if (!d) return; input.value = d.dataset.name || d.dataset.email; input.dataset.email = d.dataset.email; list.classList.add("hidden"); if (onPick) onPick(d.dataset.email); };
  input.onblur = () => setTimeout(() => list.classList.add("hidden"), 200);
}
const pickedTo = (inputId) => ($(inputId).dataset.email || $(inputId).value.trim());
function chipRow(rootId, onChange) {
  $(rootId).onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; $(rootId).querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); onChange(c.dataset.act); };
}
const NEEDS_TO = { handed_out: "To whom (from the directory)", loaned: "To whom (a person, or an external name)", sold: "Buyer (optional)" };
function toRowFor(act, rowId, labelId) { $(rowId).classList.toggle("hidden", !NEEDS_TO[act]); if (NEEDS_TO[act]) $(labelId).textContent = NEEDS_TO[act]; }

// ---------- intake ----------
let ik = null; // { photo:{bytes,mime,url}|null, reads:[], chosen: asset|null, create: input|null, action }
function ikReset() {
  ik = { photo: null, reads: [], chosen: null, create: null, action: "handed_out" };
  for (const id of ["ik1", "ik2", "ik3", "ikNewCard"]) $(id).classList.add("hidden");
  $("ik0").classList.remove("hidden"); $("recentCard").classList.remove("hidden");
  $("shotImg").classList.add("hidden"); $("reads").innerHTML = ""; $("readNotes").textContent = ""; $("ikQuery").value = "";
  $("cands").innerHTML = '<div class="empty">nothing searched yet</div>'; setStatus("candStatus", "", ""); setStatus("saveStatus", "", "");
  for (const id of ["nTag", "nSerial", "nVendor", "nModel", "nNote", "ikTo", "ikNote"]) $(id).value = "";
  $("ikTo").dataset.email = "";
  $("actChips").querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.dataset.act === "handed_out")); toRowFor("handed_out", "toRow", "toLabel");
}
$("camBtn").onclick = () => $("camFile").click();
$("galBtn").onclick = () => $("galFile").click();
$("camFile").onchange = () => ikPhoto($("camFile").files[0]);
$("galFile").onchange = () => ikPhoto($("galFile").files[0]);
$("handBtn").onclick = () => { ikReset(); ikStep1(); $("readStatus").textContent = "no photo — search by tag or serial, or add a new device"; setTimeout(() => $("ikQuery").focus(), 50); };
function ikStep1() { $("ik0").classList.add("hidden"); $("recentCard").classList.add("hidden"); $("ik1").classList.remove("hidden"); }
async function ikPhoto(file) {
  if (!file) return;
  ikReset(); ikStep1();
  $("camFile").value = ""; $("galFile").value = "";
  $("readStatus").textContent = "preparing the picture…";
  try { ik.photo = await shrink(file); } catch (e) { $("readStatus").textContent = String(e.message || e); return; }
  $("shotImg").src = ik.photo.url; $("shotImg").classList.remove("hidden");
  if (!me.aiOn) { $("readStatus").textContent = "photo kept · reading is off — search below or add by hand"; return; }
  $("readStatus").textContent = "reading the photo…";
  let r;
  try { r = await backend.intakeRead(session.load(), [...ik.photo.bytes], ik.photo.mime); } catch (e) { $("readStatus").textContent = "reading failed: " + String(e.message || e).slice(0, 140); return; }
  if (!r.ok) { $("readStatus").textContent = r.detail; return; }
  ik.reads = r.reads;
  const vendorModel = [r.vendor, r.model].filter(Boolean).join(" ");
  $("readStatus").textContent = r.reads.length ? `read ${r.reads.length} code${r.reads.length === 1 ? "" : "s"}${vendorModel ? " · " + vendorModel : ""}${r.sticker && r.sticker !== "unsure" ? " · sticker: " + r.sticker : ""}` : "no code could be read — search by hand or add the device" + (vendorModel ? ` (looks like ${vendorModel})` : "");
  $("reads").innerHTML = r.reads.map((x, i) => `<button class="read ${x.confidence < 0.6 ? "low" : ""}" data-i="${i}" title="tap to search for this reading"><span class="k">${esc(x.kind.replace("_", " "))}</span>${esc(x.value)}<span class="c">${Math.round(x.confidence * 100)}%</span></button>`).join("");
  $("readNotes").textContent = r.notes || "";
  // prefill the new-device form from the reading
  $("nSerial").value = (r.reads.find((x) => x.kind === "serial") || {}).value || "";
  $("nTag").value = (r.reads.find((x) => x.kind === "asset_tag") || {}).value || "";
  $("nVendor").value = r.vendor || ""; $("nModel").value = r.model || ""; if (r.kind && [...$("nKind").options].some((o) => o.value === r.kind)) $("nKind").value = r.kind;
  if (r.reads.length) ikSearch(r.reads.map((x) => x.value));
}
$("reads").onclick = (e) => { const b = e.target.closest(".read"); if (!b) return; const v = ik.reads[Number(b.dataset.i)].value; $("ikQuery").value = v; ikSearch([v]); };
let qTimer = 0;
$("ikQuery").oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(() => { const v = $("ikQuery").value.trim(); if (v.length >= 3) ikSearch([v]); }, 250); };
async function ikSearch(values) {
  setStatus("candStatus", "", "searching…");
  let c = [];
  try { c = await backend.intakeMatch(session.load(), values); } catch (e) { setStatus("candStatus", "err", String(e.message || e).slice(0, 120)); return; }
  setStatus("candStatus", "", "");
  $("cands").innerHTML = c.length ? c.map((x) => { const a = x.row.asset; return `<div class="cand"><span class="sc">${x.score}%</span><div class="t"><b>${esc(deviceName(a))}</b><span>${esc([a.tag, a.serial].filter(Boolean).join(" · "))} · ${esc(STATUS_WORD[a.status] || a.status)}${x.row.assigneeName ? " · " + esc(x.row.assigneeName) : ""}<br>${esc(x.why)}</span></div><button class="sm primary" data-pick="${a.id}">This one</button></div>`; }).join("") : `<div class="empty">no device matches ${esc(values.join(", "))} — add it below, or fix the reading and search again</div>`;
  $("cands").querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => { const x = c.find((y) => Number(y.row.asset.id) === Number(b.dataset.pick)); ik.chosen = x.row.asset; ik.create = null; ikStep2(); }));
}
$("ikNew").onclick = () => { $("ikNewCard").classList.remove("hidden"); $("ikNewCard").scrollIntoView({ behavior: "smooth", block: "start" }); };
$("ikRestart").onclick = () => ikReset();
$("ikUseNew").onclick = () => {
  const x = { tag: $("nTag").value.trim(), serial: $("nSerial").value.trim(), vendor: $("nVendor").value.trim(), model: $("nModel").value.trim(), kind: $("nKind").value, note: $("nNote").value.trim() };
  if (!x.tag && !x.serial && !x.model) return setStatus("newStatus", "err", "at least a tag, a serial or a model");
  ik.create = x; ik.chosen = null; ikStep2();
};
function ikStep2() {
  $("ik1").classList.add("hidden"); $("ik2").classList.remove("hidden");
  const a = ik.chosen || { ...ik.create, id: 0, status: "new", assignee: "" };
  $("ikDevName").textContent = ik.chosen ? deviceName(a) : `${deviceName(a)} (new)`;
  $("ikDevMeta").textContent = [a.tag, a.serial, ik.chosen ? STATUS_WORD[a.status] : "will be created"].filter(Boolean).join(" · ");
  // sensible default action from the current status
  const def = ik.chosen && (a.status === "assigned" || a.status === "loaned") ? "returned" : "handed_out";
  ik.action = def; $("actChips").querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.dataset.act === def)); toRowFor(def, "toRow", "toLabel");
  window.scrollTo(0, 0);
}
chipRow("actChips", (act) => { ik.action = act; toRowFor(act, "toRow", "toLabel"); });
attachPicker("ikTo", "toList");
$("ikBack").onclick = () => { $("ik2").classList.add("hidden"); $("ik1").classList.remove("hidden"); };
$("ikSave").onclick = async () => {
  const to = pickedTo("ikTo");
  if (ik.action === "handed_out" && !$("ikTo").dataset.email) return setStatus("saveStatus", "err", "pick the person from the directory");
  if (ik.action === "loaned" && !to) return setStatus("saveStatus", "err", "say who has it");
  setStatus("saveStatus", "", "saving…");
  $("ikSave").disabled = true;
  try {
    const r = await backend.intakeCommit(session.load(), { assetId: ik.chosen ? [BigInt(ik.chosen.id)] : [], create: ik.create ? [ik.create] : [], action: ik.action, to, note: $("ikNote").value.trim(), photo: ik.photo ? [[...ik.photo.bytes]] : [], mime: ik.photo ? ik.photo.mime : "" });
    if (!r.ok) { setStatus("saveStatus", "err", r.detail); return; }
    $("ik2").classList.add("hidden"); $("ik3").classList.remove("hidden");
    $("doneTitle").textContent = `${ik.chosen ? deviceName(ik.chosen) : deviceName(ik.create)} — ${r.detail}`;
    $("doneSub").textContent = ik.photo ? "photo kept as evidence on this event" : "no photo attached";
    $("doneOpen").onclick = () => { location.hash = "#/d/" + Number(r.assetId); };
  } catch (e) { setStatus("saveStatus", "err", String(e.message || e).slice(0, 140)); }
  finally { $("ikSave").disabled = false; }
};
$("doneNext").onclick = () => { ikReset(); loadRecent(); $("camBtn").focus(); };
async function loadRecent() {
  let s; try { s = await backend.stats(session.load()); } catch (e) { return; }
  $("recentRows").innerHTML = s.recent.length ? s.recent.map((x) => `<div class="ev ${["handed_out", "returned", "loaned", "sold", "scrapped", "lost"].includes(x.event.kind) ? "act" : ""}"><span class="dot"></span><div><div class="what"><a href="#/d/${Number(x.event.assetId)}" style="color:inherit;text-decoration:none"><b>${esc(x.name)}</b></a> — ${esc(x.event.detail)}</div><div class="meta">${esc(ago(x.event.at))} · ${esc(x.event.by)}${Number(x.event.photoId) ? " · 📷" : ""}</div></div></div>`).join("") : '<div class="empty">nothing yet — the first photo starts the history</div>';
}

// ---------- devices ----------
let devFilter = "";
async function loadDevices() {
  const q = $("devQ").value.trim(), st = $("devStatus").value;
  let rows = [], s = null, pending = null;
  $("devStatus").querySelector('[value="offboarding"]').hidden = me.role !== "admin";
  try { [rows, s, pending] = await Promise.all([backend.listAssets(session.load(), q, st, false), backend.stats(session.load()), me.role === "admin" ? backend.pendingHandoverCount(session.load()).catch(()=>null) : null]); } catch (e) { $("devRows").innerHTML = `<div class="empty">${esc(String(e.message || e).slice(0, 120))}</div>`; return; }
  $("stats").innerHTML = `<button class="stat ${!st ? "active" : ""}" aria-pressed="${!st}" data-st=""><div class="n">${Number(s.total)}</div><div class="l">All devices</div></button>` + s.byStatus.filter(([k]) => ["assigned", "in_stock", "loaned", "unknown"].includes(k)).map(([k, n]) => `<button class="stat ${st === k ? "active" : ""}" aria-pressed="${st === k}" data-st="${esc(k)}"><div class="n">${Number(n)}</div><div class="l">${esc(STATUS_WORD[k] || k)}</div></button>`).join("");
  if ((typeof pending === "bigint" || typeof pending === "number") && Number(pending) > 0) $("stats").insertAdjacentHTML("beforeend", `<button class="stat ${st === "offboarding" ? "active" : ""}" aria-pressed="${st === "offboarding"}" data-st="offboarding"><div class="n">${pending}</div><div class="l">Offboarding</div></button>`);
  $("stats").style.gridTemplateColumns = `repeat(${$("stats").children.length}, minmax(0, 1fr))`;
  $("stats").querySelectorAll(".stat").forEach((el) => (el.onclick = () => { $("devStatus").value = el.dataset.st; loadDevices(); }));
  $("devRows").innerHTML = rows.length ? rows.map((r) => { const a = r.asset; return `<a class="dev" href="#/d/${a.id}" data-id="${a.id}"><div class="ic">${KIND_ICON[a.kind] || "📦"}</div><div class="t"><b>${esc(deviceName(a))}</b><span>${esc([a.tag, a.serial].filter(Boolean).join(" · ") || "no tag, no serial")}</span></div><div class="r"><span class="pill s-${esc(a.status)}">${esc(STATUS_WORD[a.status] || a.status)}</span><span class="kv">${esc(r.assigneeName || a.holder || "")}${r.lastEvent ? (r.assigneeName || a.holder ? " · " : "") + esc(ago(r.lastAt)) : ""}${r.mdmMismatch ? ` · <span class="pill warn" title="The register and MDM disagree. Open the device to compare.">Review MDM</span>` : ""}</span></div></a>`; }).join("") : '<div class="empty">no devices match</div>';
  $("devRows").querySelectorAll(".dev").forEach((el) => (el.onclick = () => { location.hash = "#/d/" + el.dataset.id; }));
}
let devTimer = 0;
$("devQ").oninput = () => { clearTimeout(devTimer); devTimer = setTimeout(loadDevices, 220); };
$("devStatus").onchange = loadDevices;
$("devAdd").onclick = () => { location.hash = "#/intake"; setTimeout(() => $("handBtn").click(), 50); setTimeout(() => $("ikNew").click(), 120); };

const hardwarePanel = createHandoverPanel({root:$("dHardware"), api:()=>backend, token:()=>session.load(), viewer:()=>me, reload:()=>loadDevice(curId), startSale:async v=>{
  if (!curAsset || curAsset.id !== v.plan.assetId) return;
  await loadDeviceSale(curAsset);
  $("dSellBtn").click();
  $("buyerKind").querySelector('[data-act="external"]')?.click();
  buyerKindSel="external";
  $("bPersonRow").classList.add('hidden');$("bExtRow").classList.remove('hidden');$("bName").value=v.personName;$("bEmail").value='';$("bEmail").focus();
}});
// ---------- one device ----------
async function loadDevice(id) {
  curId = id; hardwarePanel.reset();
  let d; try { d = opt(await backend.getAsset(session.load(), BigInt(id))); } catch (e) { d = null; }
  if (!d) { $("dName").textContent = "not found"; $("dKv").innerHTML = ""; $("dEvents").innerHTML = '<div class="empty">this device does not exist, or is not yours</div>'; return; }
  curAsset = d.asset; curAssigneeEmail = d.assigneeEmail || ""; const a = d.asset; const admin = me.role === "admin";
  $("dName").textContent = deviceName(a);
  $("dPills").innerHTML = `<span class="pill s-${esc(a.status)}">${esc(STATUS_WORD[a.status] || a.status)}</span> ${a.archived ? '<span class="pill off">archived</span>' : ""} <span class="pill">${esc(a.kind)}</span>`;
  $("dKv").innerHTML = [["Tag", a.tag], ["Serial", a.serial], ["Who has it", d.assigneeName ? `${esc(d.assigneeName)} <span class="kv mono">${esc(d.assigneeEmail || "")}</span>` : (a.holder ? esc(a.holder) + ' <span class="kv">(external)</span>' : "nobody")], ["Note", a.note], ["Registered", fmt(a.createdAt) + (d.createdByName ? ` · ${esc(d.createdByName)}` : "")]].filter(([, v]) => v).map(([k, v]) => `<div>${k}</div><div>${k === "Who has it" ? v : esc(v)}</div>`).join("");
  const md = opt(d.mdm);
  $("dMdm").classList.toggle("hidden", !md);
  if (md) $("dMdm").innerHTML = `<details ${d.mdmMismatch ? "open" : ""}><summary><b>${esc(md.connName)}</b> · Device management${d.mdmMismatch ? ' <span class="pill warn">mismatch</span>' : ""}</summary><div class="kvl">${[["Device name", md.deviceName], ["OS", md.osVersion], ["Last seen", md.lastSeen], ["Logged-in user", md.userEmail ? `${md.userName ? esc(md.userName) + " · " : ""}<span class="mono">${esc(md.userEmail)}</span>` : (md.userName || "")], ["Compliance", md.compliance], ["Synced", ago(md.syncedAt)]].filter(([, v]) => v).map(([k, v]) => `<div>${k}</div><div>${k === "Logged-in user" ? v : esc(v)}</div>`).join("")}</div>${d.mdmMismatch ? `<div class="kv" style="margin-top:6px">${a.status === "sold" || a.status === "scrapped" || a.status === "lost" ? `The register says <b>${esc(STATUS_WORD[a.status])}</b>, but the MDM still sees this device. Verify the device and its MDM enrolment, then resolve the mismatch.` : `The register says <b>${esc(d.assigneeName || "nobody")}</b>, the MDM sees <b>${esc(md.userName || md.userEmail)}</b>. Record the hand-over here if the MDM is right.`}</div>` : ""}</details>`;
  const ab = opt(d.abm);
  $("dAbm").classList.toggle("hidden", !ab);
  if (ab) $("dAbm").innerHTML = `<details ${!ab.mdmServer || ["sold", "scrapped", "lost"].includes(a.status) ? "open" : ""}><summary><b>${esc(ab.connName)}</b>${ab.mdmServer ? "" : ' <span class="pill warn">no device management</span>'}${["sold", "scrapped", "lost"].includes(a.status) ? ` <span class="pill warn">still in ABM — release it there</span>` : ""}</summary><div class="kvl">${[["Managed by", ab.mdmServer || "no device-management service holds it"], ["Model", [ab.model, ab.capacity, ab.color].filter(Boolean).join(" · ")], ["Ordered", [ab.orderDate, ab.orderNo ? "order " + ab.orderNo : "", ab.source ? "via " + ab.source.toLowerCase().replace("_", " ") : ""].filter(Boolean).join(" · ")], ["In Apple's register since", ab.addedAt], ["Synced", ago(ab.syncedAt)]].filter(([, v]) => v).map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join("")}</div></details>`;
  $("dActions").innerHTML = admin ? `<button id="dDoAct" class="primary sm">What happened?</button>` : "";
  if (admin) $("dDoAct").onclick = () => { $("dActCard").classList.remove("hidden"); const def = a.status === "assigned" || a.status === "loaned" ? "returned" : "handed_out"; dAct = def; $("dActChips").querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.dataset.act === def)); toRowFor(def, "dToRow", "dToLabel"); $("dActCard").scrollIntoView({ behavior: "smooth" }); };
  $("dAdminRow").classList.toggle("hidden", !admin);
  $("dSaleCard").classList.toggle("hidden", !admin);
  if (admin) { loadDeviceSale(a); hardwarePanel.load(a); }
  $("dArchive").textContent = a.archived ? "Restore" : "Archive";
  $("dEditCard").classList.add("hidden"); $("dActCard").classList.add("hidden");
  $("dPhotos").innerHTML = d.photos.map((p) => `<img data-photo="${p.id}" alt="" title="${esc(fmt(p.at))}">`).join("");
  for (const img of $("dPhotos").querySelectorAll("img")) { photoUrl(img.dataset.photo).then((u) => { if (u) img.src = u; }); img.onclick = () => photoUrl(img.dataset.photo).then(zoom); }
  $("dEvents").innerHTML = d.events.length ? d.events.map((e) => `<div class="ev ${["handed_out", "returned", "loaned", "sold", "scrapped", "lost"].includes(e.kind) ? "act" : ""}"><span class="dot"></span><div><div class="what">${esc(e.detail)}</div><div class="meta">${esc(fmt(e.at))} · ${esc(e.by)}</div>${Number(e.photoId) ? `<img data-photo="${Number(e.photoId)}" alt="">` : ""}</div></div>`).join("") : '<div class="empty">no history yet</div>';
  for (const img of $("dEvents").querySelectorAll("img")) { photoUrl(img.dataset.photo).then((u) => { if (u) img.src = u; else img.remove(); }); img.onclick = () => photoUrl(img.dataset.photo).then(zoom); }
}
$("dEdit").onclick = () => { const a = curAsset; if (!a) return; $("eTag").value = a.tag; $("eSerial").value = a.serial; $("eVendor").value = a.vendor; $("eModel").value = a.model; $("eKind").value = a.kind; $("eNote").value = a.note; $("dEditCard").classList.remove("hidden"); };
$("eCancel").onclick = () => $("dEditCard").classList.add("hidden");
$("eSave").onclick = async () => {
  setStatus("eStatus", "", "saving…");
  const r = await backend.updateAsset(session.load(), BigInt(curId), { tag: $("eTag").value.trim(), serial: $("eSerial").value.trim(), vendor: $("eVendor").value.trim(), model: $("eModel").value.trim(), kind: $("eKind").value, note: $("eNote").value.trim() });
  setStatus("eStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail);
  if (r.ok) loadDevice(curId);
};
$("dArchive").onclick = async () => { const r = await backend.archiveAsset(session.load(), BigInt(curId), !curAsset.archived); setStatus("dStatus", r.ok ? "ok" : "err", r.ok ? "done" : r.detail); if (r.ok) loadDevice(curId); };
$("dPhotoBtn").onclick = () => $("dPhotoFile").click();
$("dPhotoFile").onchange = async () => {
  const f = $("dPhotoFile").files[0]; $("dPhotoFile").value = ""; if (!f) return;
  setStatus("dStatus", "", "uploading…");
  try { const p = await shrink(f); const r = await backend.addPhoto(session.load(), BigInt(curId), [...p.bytes], p.mime, ""); setStatus("dStatus", r.ok ? "ok" : "err", r.ok ? "photo added" : r.detail); if (r.ok) loadDevice(curId); }
  catch (e) { setStatus("dStatus", "err", String(e.message || e).slice(0, 120)); }
};
let dAct = "handed_out";
chipRow("dActChips", (act) => { dAct = act; toRowFor(act, "dToRow", "dToLabel"); });
attachPicker("dTo", "dToList");
$("dActCancel").onclick = () => $("dActCard").classList.add("hidden");
$("dActSave").onclick = async () => {
  const to = pickedTo("dTo");
  if (dAct === "handed_out" && !$("dTo").dataset.email) return setStatus("dActStatus", "err", "pick the person from the directory");
  setStatus("dActStatus", "", "saving…");
  const r = await backend.addEventTo(session.load(), BigInt(curId), dAct, to, $("dNote").value.trim());
  setStatus("dActStatus", r.ok ? "ok" : "err", r.ok ? r.detail : r.detail);
  if (r.ok) { $("dTo").value = ""; $("dTo").dataset.email = ""; $("dNote").value = ""; loadDevice(curId); }
};

// ---------- import / export ----------
$("impPick").onclick = () => $("impFile").click();
$("impFile").onchange = async () => { const f = $("impFile").files[0]; if (!f) return; $("impName").textContent = `${f.name} · ${Math.round(f.size / 1024)} KB`; $("impText").value = await f.text(); };
$("impRun").onclick = async () => {
  const t = $("impText").value; if (!t.trim()) return setStatus("impStatus", "err", "nothing to import");
  setStatus("impStatus", "", "importing…");
  try { const r = await backend.importCsv(session.load(), t); setStatus("impStatus", r.ok ? "ok" : "err", r.ok ? `${Number(r.created)} created · ${Number(r.updated)} updated · ${Number(r.skipped)} skipped` : r.detail); if (r.ok) { $("impText").value = ""; $("impName").textContent = ""; } }
  catch (e) { setStatus("impStatus", "err", String(e.message || e).slice(0, 140)); }
};
$("expRun").onclick = async () => {
  setStatus("expStatus", "", "preparing…");
  try { const csv = await backend.exportCsv(session.load()); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `devices-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setStatus("expStatus", "ok", "downloaded"); }
  catch (e) { setStatus("expStatus", "err", String(e.message || e).slice(0, 140)); }
};

function selectSettings(section = "general") {
  const active = ["general", "connections", "sales", "privacy", "maintenance"].includes(section) ? section : "general";
  document.querySelectorAll('.settings-group').forEach(e => e.classList.toggle('hidden', e.id !== 'settings-' + active));
  document.querySelectorAll('[data-settings]').forEach(e => { e.classList.toggle('on', e.dataset.settings === active); e.setAttribute('aria-pressed', e.dataset.settings === active); });
}
$("settingsNav").onclick = e => { const b = e.target.closest('[data-settings]'); if (b) location.hash = '#/settings/' + b.dataset.settings; };
let pinTimer = 0, pinGeneration = 0;
function clearPin() { ++pinGeneration; clearTimeout(pinTimer); $("pinValue").textContent = ''; $("pinValue").classList.add('hidden'); $("pinHide").classList.add('hidden'); setStatus('pinStatus','',''); }
$("pinHide").onclick = clearPin;
document.addEventListener('visibilitychange', () => { if (document.hidden) clearPin(); });
$("pinRead").onclick = async () => {
  clearPin(); const request = pinGeneration, id = curSale?.sale.assetId; if (!id || me?.role !== 'admin') return;
  const b = $("pinRead"); b.disabled = true; setStatus('pinStatus','','Checking Kandji / Iru…');
  try { const r = await backend.deviceUnlockPin(tok(), id); if (request !== pinGeneration || !me || curSale?.sale.assetId !== id) return;
    setStatus('pinStatus',r.ok ? '' : 'err',r.detail);
    if (r.ok && r.pin) { $("pinValue").textContent = r.pin; $("pinValue").classList.remove('hidden'); $("pinHide").classList.remove('hidden'); pinTimer = setTimeout(clearPin,30000); }
  } catch (_) { if (request === pinGeneration) setStatus('pinStatus','err','PIN lookup interrupted. Check Kandji / Iru directly.'); }
  finally { b.disabled = false; }
};
function renderSaleWorkflow(v, deal) {
  const s = v.sale, phase = phaseOf({...v, handedOverAt:v.handedOverAt || deal?.handedOverAt});
  const index = PHASES.findIndex(([p]) => p === phase);
  $("saleProgress").innerHTML = PHASES.slice(0,4).map(([p,name], i) => `<li class="${phase !== 'cancelled' && i < index ? 'past' : ''} ${p === phase ? 'current' : ''}" ${p === phase ? 'aria-current="step"' : ''}>0${i+1} · ${name}</li>`).join('');
  const admin = me.role === 'admin';
  const columns = $("v-sale").querySelector('.detail-columns');
  if (phase === 'complete' || phase === 'cancelled') {
    columns.firstElementChild.prepend($("sDocCard")); columns.firstElementChild.prepend($("sSummaryCard"));
    columns.lastElementChild.prepend($("sDealCard"));
  } else {
    columns.firstElementChild.prepend($("sDealCard"));
    columns.lastElementChild.prepend($("sDocCard")); columns.lastElementChild.prepend($("sSummaryCard"));
  }
  const primaryAction = phase === 'invoice' || (phase === 'offer' && !!s.buyer.pid);
  if (primaryAction) columns.firstElementChild.prepend($("sAdminCard")); else columns.lastElementChild.append($("sAdminCard"));
  $("sAdminCard").querySelector('h3').textContent = primaryAction ? 'Next action' : 'Sale actions';
  $("saleNext").classList.toggle('hidden', !admin);
  const needsPdf = phase === 'paid' && !Number(s.pdfId);
  const action = needsPdf ? 'Archive the invoice PDF' : nextStep({...v,phase,receiptPending:!!deal?.exists && !Number(deal.completedAt)});
  const help = {offer:'Agree the offer with the buyer before invoicing.',invoice:'Use the bank record to confirm payment. Downloading an invoice is not payment.',paid:'Payment is recorded. Finish preparation and record the physical hand-over.',complete:'Payment and physical hand-over are recorded. The invoice remains available.',cancelled:s.creditNoteNo ? 'Keep the credit note with the invoice. Handle any refund with finance.' : 'This offer is closed. Its record is retained.'}[phase];
  const target = needsPdf ? 'sDocCard' : phase === 'paid' ? (!s.wiped || !s.mdmRemoved ? 'sChecksCard' : 'handoverCard') : phase === 'offer' && !s.buyer.pid ? 'sDealCard' : 'sAdminCard';
  $("saleNext").innerHTML = `<div><div class="eyebrow">${phase === 'complete' || phase === 'cancelled' ? 'Sale closed' : 'Next step'}</div><strong>${esc(action)}</strong><p>${esc(help)}</p></div>${['offer','invoice','paid'].includes(phase) ? '<button class="sm" id="jumpNext">Go to task ↓</button>' : ''}`;
  if ($("jumpNext")) $("jumpNext").onclick = () => $(target).scrollIntoView({behavior:'smooth',block:'center'});
  $("handoverCard").classList.toggle('hidden',!admin || phase !== 'paid');
  $("handoverAbmRow").classList.toggle('hidden',!v.stillInAbm); $("handoverAbm").checked = false;
  const blockers = [!s.wiped && 'Save the wipe & setup check.', !s.mdmRemoved && 'Save the company management release check.', needsPdf && 'Archive the invoice PDF under Documents.'].filter(Boolean);
  $("handoverHelp").textContent = blockers.length ? blockers.join(' ') : 'Record this only when the buyer actually receives the device.' + (deal?.exists && !Number(deal.completedAt) ? ' Invoice receipt is still unconfirmed; it does not block hand-over.' : ' This moves the sale to Complete.');
  $("handoverGo").disabled = blockers.length > 0;
  setStatus('handoverStatus','','');
  $("handoverGo").onclick = async () => {
    const b = $("handoverGo"); b.disabled = true;
    try { const r = await backend.completeSaleHandover(tok(),s.id,$("handoverAbm").checked,$("handoverNote").value.trim());
      if (r.ok) { $("handoverNote").value = ''; await loadSale(Number(s.id)); }
      else { setStatus('handoverStatus','err',r.detail); b.disabled = false; }
    } catch (_) { setStatus('handoverStatus','err','Connection interrupted. Reopen the sale to check whether hand-over was saved.'); b.disabled = false; }
  };
}

// ---------- settings ----------
async function loadSettings() {
  const s = opt(await backend.getSettings(session.load())); if (!s) return;
  $("sAppUrl").value = s.appUrl; $("sPrefix").value = s.tagPrefix; $("sOrg").value = s.orgName;
  $("sMeta").textContent = `${Number(s.peopleCount)} people from the hub${Number(s.lastDirectoryPull) ? " · synced " + ago(s.lastDirectoryPull) : ""} · ${Number(s.adminCount)} admin${Number(s.adminCount) === 1 ? "" : "s"} · photos ${Math.round(Number(s.photoBytes) / 1048576)} MB`;
  $("sTrust").value = s.trustId || "";
  $("sAppUrlHint").textContent = s.appUrl ? "Slack and Hub notifications open the matching device, offer or invoice." : "App address is missing: Slack and Hub notifications have no link. Enter this Assets app's HTTPS address above and save.";
  $("sTrustMeta").textContent = !s.trustId ? "not allowed yet" : Number(s.trustLastPull) ? `trust last read the list ${ago(s.trustLastPull)}` : "allowed — trust has not read the list yet (it pulls every 15 minutes, or on Sync now there)";
  const on = s.aiSource === "hub";
  $("sAiPill").textContent = on ? "on" : "off"; $("sAiPill").className = "pill " + (on ? "on" : "off");
  $("sAiLine").innerHTML = on ? `Photos are sent to ${esc(s.aiModel)} for recognition. Keep people and personal information out of the frame. Managed under <a href="${hubSettingsAi()}" target="_blank" rel="noopener">the hub's Settings → AI</a>.`
    : `Reading photos is off: ${aiReason(s.ai)}. Everything else works without it.`;
  loadMdm(); loadAbm(); loadBilling(); loadNotifyStatus();
  try { const log = await backend.adminLogRows(session.load()); $("logRows").innerHTML = log.map((r) => `<tr><td class="kv">${esc(fmt(r.at))}</td><td class="kv">${esc(r.who)}</td><td>${esc(r.what)}</td></tr>`).join("") || '<tr><td colspan="3" class="kv">nothing yet</td></tr>'; } catch (e) {}
}
$("sAiRefresh").onclick = async () => { setStatus("sAiStatus", "", "asking the hub…"); const r = await backend.refreshAi(session.load()); setStatus("sAiStatus", r.ok ? "ok" : "err", r.detail); await refreshMe(); loadSettings(); };

// ---------- notifications through the hub: the last attempt, and how to fix a refused one ----------
async function loadNotifyStatus() {
  let nt = null; try { nt = opt(await backend.notifyStatus(session.load())); } catch (e) { nt = null; }
  const pill = $("sNtPill"), line = $("sNtLine");
  if (!nt) { pill.textContent = "none yet"; pill.className = "pill"; line.innerHTML = "Hand-overs, offers and invoices reach people through the hub's bell (and Slack, if the hub has it). Nothing has been sent yet. This app asks the hub for the <b>notifications</b> lane; the kitchen grants it on install and update."; return; }
  pill.textContent = nt.ok ? "working" : "failing"; pill.className = "pill " + (nt.ok ? "on" : "off");
  const fix = /notify lane/i.test(nt.detail) ? `<div style="margin-top:6px">Fix: in the hub, Apps → this app → <b>What it may know</b> → put <b>notifications</b> on the skewer — or Kitchen → Update this app, which re-grants what it needs.</div>` : /not a registered connector|unknown/i.test(nt.detail) ? `<div style="margin-top:6px">Fix: the hub does not know this app as a connected app — reconnect it under Apps.</div>` : "";
  line.innerHTML = `Last: “${esc(nt.title)}” to <span class="mono">${esc(nt.to)}</span> · ${esc(ago(nt.at))} · ${nt.ok ? "delivered to the hub" : `<b>not delivered</b> — the hub says: ${esc(nt.detail)}`}${nt.ok ? "" : fix}`;
}

// ---------- device management (MDM) ----------
const MDM_LABEL = { iru: "Iru", jamf: "Jamf Pro", intune: "Intune" };
const MDM_UI = {
  iru: { url: "API address", urlPh: "https://yourcompany.api.kandji.io (EU: .api.eu.kandji.io)", secret: "API token", client: false, hint: "Use your Kandji / Iru API address and token. Inventory sync needs device read access; unlock PIN lookup also needs access to device secrets. No write permission is required." },
  jamf: { url: "Jamf Pro address", urlPh: "https://yourcompany.jamfcloud.com", secret: "Client secret", client: true, hint: "Jamf Pro → Settings → API Roles and Clients: a role with Read Computers and Read Mobile Devices, then a client with that role. The client secret is shown once." },
  intune: { url: "Tenant id (or domain)", urlPh: "contoso.onmicrosoft.com", secret: "Client secret", client: true, hint: "Entra → App registrations: an app with the application permission DeviceManagementManagedDevices.Read.All (admin consent), a client secret, and the tenant id." },
};
let mdEdit = 0;
function mdPaintForm() {
  const k = $("mdKind").value, u = MDM_UI[k];
  $("mdUrlLabel").textContent = u.url; $("mdUrl").placeholder = u.urlPh; $("mdSecretLabel").textContent = u.secret + (mdEdit ? " (leave empty to keep)" : ""); $("mdClientRow").classList.toggle("hidden", !u.client); $("mdHint").textContent = u.hint;
}
$("mdKind").onchange = mdPaintForm;
async function loadMdm() {
  let rows = []; try { rows = await backend.listMdm(session.load()); } catch (e) { return; }
  $("mdmRows").innerHTML = rows.length ? rows.map((c) => `<tr><td><b>${esc(c.name)}</b> <span class="pill">${esc(MDM_LABEL[c.kind] || c.kind)}</span>${c.enabled ? "" : ' <span class="pill off">paused</span>'}<div class="kv mono" style="font-size:11px">${esc(c.url)}</div></td><td class="kv">${Number(c.lastSync) ? esc(ago(c.lastSync)) : "never"}</td><td class="kv" style="max-width:260px">${c.lastResult ? `<span class="${/^FAILED/.test(c.lastResult) ? "pill off" : ""}">${esc(c.lastResult)}</span>` : "—"}</td><td style="white-space:nowrap"><button class="sm" data-md-test="${c.id}">Test</button> <button class="sm primary" data-md-sync="${c.id}">Sync now</button> <button class="sm" data-md-edit="${c.id}">Edit</button> <button class="sm" data-md-toggle="${c.id}" data-on="${c.enabled ? 1 : 0}">${c.enabled ? "Pause" : "Resume"}</button> <button class="sm" data-md-remove="${c.id}">Remove</button></td></tr>`).join("") : '<tr><td colspan="4" class="kv">none yet — add Iru, Jamf Pro or Intune below</td></tr>';
  window._mdm = rows;
}
$("mdmRows").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.mdTest || b.dataset.mdSync || b.dataset.mdEdit || b.dataset.mdToggle || b.dataset.mdRemove; if (!id) return;
  if (b.dataset.mdTest) { setStatus("mdStatus", "", "reaching the MDM…"); const r = await backend.testMdm(session.load(), BigInt(id)); setStatus("mdStatus", r.ok ? "ok" : "err", r.detail); }
  if (b.dataset.mdSync) { setStatus("mdStatus", "", "syncing — this can take a minute…"); b.disabled = true; try { const r = await backend.syncMdm(session.load(), BigInt(id)); setStatus("mdStatus", r.ok ? "ok" : "err", r.detail); } finally { b.disabled = false; } loadMdm(); }
  if (b.dataset.mdEdit) { const c = (window._mdm || []).find((x) => Number(x.id) === Number(id)); if (!c) return; mdEdit = Number(id); $("mdKind").value = c.kind; $("mdKind").disabled = true; $("mdName").value = c.name; $("mdUrl").value = c.url; $("mdClient").value = c.clientId; $("mdSecret").value = ""; $("mdAdd").textContent = "Save connection"; $("mdCancel").classList.remove("hidden"); mdPaintForm(); $("mdForm").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  if (b.dataset.mdToggle) { const c = (window._mdm || []).find((x) => Number(x.id) === Number(id)); if (!c) return; const r = await backend.updateMdm(session.load(), BigInt(id), { name: c.name, url: c.url, clientId: c.clientId, secret: "", enabled: b.dataset.on !== "1" }); setStatus("mdStatus", r.ok ? "ok" : "err", r.ok ? (b.dataset.on === "1" ? "paused" : "resumed") : r.detail); loadMdm(); }
  if (b.dataset.mdRemove) { if (!confirm("Remove this connection? Devices keep their last MDM note.")) return; const r = await backend.removeMdm(session.load(), BigInt(id)); setStatus("mdStatus", r.ok ? "ok" : "err", r.detail || "removed"); loadMdm(); }
});
function mdReset() { mdEdit = 0; $("mdKind").disabled = false; $("mdName").value = ""; $("mdUrl").value = ""; $("mdClient").value = ""; $("mdSecret").value = ""; $("mdAdd").textContent = "Add connection"; $("mdCancel").classList.add("hidden"); mdPaintForm(); }
$("mdCancel").onclick = mdReset;
$("mdAdd").onclick = async () => {
  setStatus("mdStatus", "", "saving…");
  const args = { name: $("mdName").value.trim(), url: $("mdUrl").value.trim(), clientId: $("mdClient").value.trim(), secret: $("mdSecret").value.trim() };
  const r = mdEdit ? await backend.updateMdm(session.load(), BigInt(mdEdit), { ...args, enabled: true }) : await backend.addMdm(session.load(), { kind: $("mdKind").value, ...args });
  setStatus("mdStatus", r.ok ? "ok" : "err", r.ok ? (mdEdit ? "saved" : "added — press Test to check the connection") : r.detail);
  if (r.ok) { mdReset(); loadMdm(); }
};
mdPaintForm();
// ---------- Apple Business Manager ----------
// The private key Apple issued never leaves this browser: WebCrypto signs a client assertion
// (ES256, up to 180 days — Apple's maximum) and only that assertion goes to the canister.
const ABM_AUD = "https://account.apple.com/auth/oauth2/v2/token", ABM_DAYS = 180;
let abEdit = 0, abKey = null, abKeyLabel = "";
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function pemToDer(pem) { const body = pem.replace(/-----(BEGIN|END)[^-]*-----/g, "").replace(/\s+/g, ""); const bin = atob(body); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function derLen(n) { return n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]; }
// SEC1 "EC PRIVATE KEY" → PKCS#8 (WebCrypto imports only PKCS#8): SEQ { INT 0, SEQ { id-ecPublicKey, prime256v1 }, OCTET STRING sec1 }
function sec1ToPkcs8(sec1) {
  const alg = [0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
  const octet = [0x04, ...derLen(sec1.length), ...sec1];
  const body = [0x02, 0x01, 0x00, ...alg, ...octet];
  return new Uint8Array([0x30, ...derLen(body.length), ...body]);
}
async function importPem(text) {
  const der = pemToDer(text);
  const pkcs8 = /BEGIN EC PRIVATE KEY/.test(text) ? sec1ToPkcs8(der) : der;
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
async function signAssertion(key, clientId, keyId) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })));
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ iss: clientId, sub: clientId, aud: ABM_AUD, iat: now, exp: now + ABM_DAYS * 86400 - 3600, jti: crypto.randomUUID() })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64u(sig)}`;
}
const signedLine = (c) => { const until = Number(c.signedUntil); if (!until) return '<span class="pill off">no signed key</span>'; const d = new Date(until / 1e6), days = Math.round((d - Date.now()) / 86400000); return days < 0 ? `<span class="pill off">signature expired ${d.toISOString().slice(0, 10)}</span>` : days < 14 ? `<span class="pill warn">signature ends ${d.toISOString().slice(0, 10)} — drop the .pem again</span>` : `<span class="kv">signed until ${d.toISOString().slice(0, 10)}</span>`; };
async function loadAbm() {
  const rows = await backend.listAbm(session.load()); window._abm = rows;
  $("abmRows").innerHTML = rows.length ? rows.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.enabled ? "" : ' <span class="pill off">paused</span>'}${c.scope === "school.api" ? ' <span class="pill">school</span>' : ""}<div class="kv mono" style="font-size:11px">${esc(c.clientId)} · key ${esc(c.keyId)}</div><div style="margin-top:4px">${signedLine(c)}</div></td><td class="kv">${Number(c.lastSync) ? esc(ago(c.lastSync)) : "never"}</td><td class="kv" style="max-width:260px">${c.lastResult ? `<span class="${/^FAILED/.test(c.lastResult) ? "pill off" : ""}">${esc(c.lastResult)}</span>` : "—"}</td><td style="white-space:nowrap"><button class="sm" data-ab-test="${c.id}">Test</button> <button class="sm primary" data-ab-sync="${c.id}">Sync now</button> <button class="sm" data-ab-edit="${c.id}">Edit</button> <button class="sm" data-ab-toggle="${c.id}" data-on="${c.enabled ? 1 : 0}">${c.enabled ? "Pause" : "Resume"}</button> <button class="sm" data-ab-remove="${c.id}">Remove</button></td></tr>`).join("") : '<tr><td colspan="4" class="kv">none yet — connect your Apple Business Manager below</td></tr>';
}
const abFail = (e) => setStatus("abStatus", "err", "the app did not answer: " + String(e && e.message || e).replace(/\s+/g, " ").slice(0, 220));
$("abmRows").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.abTest || b.dataset.abSync || b.dataset.abEdit || b.dataset.abToggle || b.dataset.abRemove;
  try {
    if (b.dataset.abTest) { setStatus("abStatus", "", "signing in at Apple…"); const r = await backend.testAbm(session.load(), BigInt(id)); setStatus("abStatus", r.ok ? "ok" : "err", r.detail); }
    if (b.dataset.abSync) { setStatus("abStatus", "", "syncing — this can take a minute…"); b.disabled = true; try { const r = await backend.syncAbm(session.load(), BigInt(id)); setStatus("abStatus", r.ok ? "ok" : "err", r.detail); } finally { b.disabled = false; } loadAbm(); }
    if (b.dataset.abEdit) { const c = (window._abm || []).find((x) => Number(x.id) === Number(id)); if (!c) return; abEdit = Number(id); abKey = null; abKeyLabel = ""; $("abName").value = c.name; $("abClient").value = c.clientId; $("abKeyId").value = c.keyId; $("abKeyInfo").textContent = "the signed key stays as it is — drop the .pem again to renew it"; $("abAdd").textContent = "Save connection"; $("abCancel").classList.remove("hidden"); $("abmForm").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    if (b.dataset.abToggle) { const c = (window._abm || []).find((x) => Number(x.id) === Number(id)); if (!c) return; const r = await backend.updateAbm(session.load(), BigInt(id), { name: "", clientId: "", keyId: "", assertion: [], enabled: b.dataset.on !== "1" }); setStatus("abStatus", r.ok ? "ok" : "err", r.ok ? (b.dataset.on === "1" ? "paused" : "resumed") : r.detail); loadAbm(); }
    if (b.dataset.abRemove) { if (!confirm("Remove this connection? Devices already in the register stay; the Apple list disappears.")) return; const r = await backend.removeAbm(session.load(), BigInt(id)); setStatus("abStatus", r.ok ? "ok" : "err", r.detail || "removed"); loadAbm(); }
  } catch (err) { abFail(err); }
});
function abReset() { abEdit = 0; abKey = null; abKeyLabel = ""; $("abName").value = ""; $("abClient").value = ""; $("abKeyId").value = ""; $("abKeyInfo").textContent = "Apple Business Manager → Preferences → API → your key → Download. The key never leaves this browser."; $("abAdd").textContent = "Add connection"; $("abCancel").classList.add("hidden"); $("abDrop").classList.remove("over"); }
$("abCancel").onclick = abReset;
async function abTakeFile(file) {
  if (!file) return;
  let text = ""; try { text = String(await file.text()); } catch (e) { text = ""; }
  if (!/-----BEGIN (EC )?PRIVATE KEY-----/.test(text)) { abKey = null; setStatus("abStatus", "err", "that file is not a PEM private key (expected -----BEGIN PRIVATE KEY-----)"); $("abKeyInfo").textContent = "no key loaded"; return; }
  try { abKey = await importPem(text); } catch (e) { abKey = null; setStatus("abStatus", "err", "the key could not be read — is it the EC P-256 key Apple issued? (" + String(e && e.message || e) + ")"); $("abKeyInfo").textContent = "no key loaded"; return; }
  abKeyLabel = `${file.name} · ${/BEGIN EC PRIVATE KEY/.test(text) ? "SEC1" : "PKCS#8"}`;
  setStatus("abStatus", "ok", "key loaded — it stays in this browser; a signed assertion is sent when you save");
  $("abKeyInfo").textContent = `${abKeyLabel} — ready to sign ${ABM_DAYS} days`;
  // a UUID in the file name is usually the key id Apple shows next to the key
  const m = file.name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (m && !$("abKeyId").value) $("abKeyId").value = m[0];
}
$("abDrop").onclick = () => $("abFile").click();
$("abDrop").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("abFile").click(); } };
$("abFile").onchange = () => { abTakeFile($("abFile").files[0]); $("abFile").value = ""; };
["dragenter", "dragover"].forEach((ev) => $("abDrop").addEventListener(ev, (e) => { e.preventDefault(); $("abDrop").classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => $("abDrop").addEventListener(ev, (e) => { e.preventDefault(); $("abDrop").classList.remove("over"); }));
$("abDrop").addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; abTakeFile(f); });
$("abAdd").onclick = async () => {
  const name = $("abName").value.trim(), clientId = $("abClient").value.trim(), keyId = $("abKeyId").value.trim();
  if (!abEdit && !abKey) { setStatus("abStatus", "err", "drop the .pem private key first"); return; }
  if (!/^(BUSINESSAPI|SCHOOLAPI)\./i.test(clientId)) { setStatus("abStatus", "err", "the client id starts with BUSINESSAPI. — copy it from Apple Business Manager → Preferences → API"); return; }
  if (!keyId) { setStatus("abStatus", "err", "the key id is shown next to the key in Apple Business Manager"); return; }
  try {
    let assertion = [];
    if (abKey) { setStatus("abStatus", "", "signing…"); assertion = [await signAssertion(abKey, clientId, keyId)]; }
    setStatus("abStatus", "", "saving…");
    const r = abEdit ? await backend.updateAbm(session.load(), BigInt(abEdit), { name, clientId, keyId, assertion, enabled: true }) : await backend.addAbm(session.load(), { name, clientId, keyId, assertion });
    setStatus("abStatus", r.ok ? "ok" : "err", r.ok ? (abEdit ? "saved" : "added — press Test, then Sync now") : r.detail);
    if (r.ok) { abReset(); loadAbm(); }
  } catch (err) { abFail(err); }
};

// ---------- the Apple page: what Apple says the company owns, next to the register ----------
let apFilter = "all", apRows = [];
async function loadApple() {
  let conns = []; try { conns = await backend.listAbm(session.load()); } catch (e) { conns = []; }
  const sel = $("apConn"); const cur = sel.value || "0";
  sel.innerHTML = `<option value="0">every connection</option>` + conns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "0";
  if (!conns.length) { apRows = []; $("apRows").innerHTML = '<tr><td colspan="6" class="kv">no Apple Business Manager connection yet — add one under <a href="#/settings">Settings</a></td></tr>'; $("apCount").textContent = ""; $("apAddAll").classList.add("hidden"); return; }
  apRows = await backend.listAbmDevices(session.load(), apFilter, BigInt(Number(sel.value) || 0));
  const total = conns.reduce((n, c) => n + Number(c.devices), 0), gap = conns.reduce((n, c) => n + Number(c.unmatched), 0), nomdm = conns.reduce((n, c) => n + Number(c.noMdm), 0);
  $("apLead").textContent = `${total} Apple device${total === 1 ? "" : "s"} known to ${conns.length === 1 ? conns[0].name : conns.length + " connections"} · ${gap} not in the register · ${nomdm} without a device-management service.` + (conns.some((c) => !Number(c.lastSync)) ? " Some connections have not synced yet — Settings → Sync now." : "");
  const addable = apRows.filter((r) => !opt(r.assetId)).length;
  $("apCount").textContent = `${apRows.length} shown` + (addable ? ` · ${addable} not in the register` : "");
  $("apAddAll").classList.toggle("hidden", addable < 2); $("apAddAll").textContent = `Add all ${addable} to the register`;
  $("apRows").innerHTML = apRows.length ? apRows.map((r) => { const d = r.device, aid = opt(r.assetId); return `<tr><td class="mono">${esc(d.serial)}</td><td><b>${esc(d.model || d.productType)}</b><div class="kv">${esc([d.capacity, d.color, d.family].filter(Boolean).join(" · "))}</div></td><td class="kv">${esc(d.orderDate || "—")}${d.source ? `<div class="kv">${esc(d.source.toLowerCase().replace("_", " "))}</div>` : ""}</td><td>${d.mdmServer ? esc(d.mdmServer) : '<span class="pill warn">none</span>'}</td><td>${aid !== null ? `<a href="#/d/${aid}">${esc(r.assetTag || "open")}</a> <span class="pill s-${esc(r.assetStatus)}">${esc(STATUS_WORD[r.assetStatus] || r.assetStatus)}</span>${r.assigneeName ? ` <span class="kv">${esc(r.assigneeName)}</span>` : ""}` : '<span class="kv">not in the register</span>'}</td><td>${aid === null ? `<button class="sm primary" data-ap-add="${esc(d.serial)}">Add</button>` : ""}</td></tr>`; }).join("") : '<tr><td colspan="6" class="kv">nothing matches this filter</td></tr>';
}
$("apFilters").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return; apFilter = c.dataset.f; $("apFilters").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); loadApple(); });
$("apConn").onchange = loadApple;
async function apAdopt(serials) {
  setStatus("apStatus", "", `adding ${serials.length}…`);
  try { const r = await backend.abmAdopt(session.load(), serials); setStatus("apStatus", r.ok ? "ok" : "err", r.detail); } catch (e) { setStatus("apStatus", "err", "the app did not answer: " + String(e && e.message || e).slice(0, 220)); }
  loadApple();
}
$("apRows").addEventListener("click", (e) => { const b = e.target.closest("button[data-ap-add]"); if (b) apAdopt([b.dataset.apAdd]); });
$("apAddAll").onclick = () => { const ss = apRows.filter((r) => !opt(r.assetId)).map((r) => r.device.serial); if (ss.length && confirm(`Take ${ss.length} devices into the register as "unknown"? You can archive any of them later.`)) apAdopt(ss); };

$("sSave").onclick = async () => {
  setStatus("sStatus", "", "saving…");
  const r = await backend.setSettings(session.load(), { adminGroup: "", appUrl: $("sAppUrl").value.trim(), tagPrefix: $("sPrefix").value.trim(), orgName: $("sOrg").value.trim() });
  setStatus("sStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail);
  await refreshMe(); loadSettings();
};
$("sTrustSave").onclick = async () => {
  setStatus("sTrustStatus", "", "saving…");
  const r = await backend.setTrustCanister(session.load(), $("sTrust").value.trim());
  setStatus("sTrustStatus", r.ok ? "ok" : "err", r.ok ? ($("sTrust").value.trim() ? "allowed" : "switched off") : r.detail);
  loadSettings();
};
$("sSeed").onclick = async () => { const r = await backend.seedDemo(session.load()); setStatus("sSeedStatus", r.ok ? "ok" : "err", r.detail); };
$("sUnseed").onclick = async () => { if (!confirm("Remove the sample devices and their history?")) return; const r = await backend.removeDemo(session.load()); setStatus("sSeedStatus", r.ok ? "ok" : "err", r.detail); };
$("sSync").onclick = async () => { const r = await backend.syncNow(session.load()); setStatus("sSeedStatus", r.ok ? "ok" : "err", r.detail); loadSettings(); };

// ---------- selling devices: purchase details · offer · acceptance · invoice with Swiss QR-bill · archive ----------
const tok = () => session.load();
const fmtDay = (iso) => iso || "—";
const buyerLines = (b) => [b.name, [b.street, b.houseNo].filter(Boolean).join(" "), [b.postalCode, b.town].filter(Boolean).join(" "), b.country && b.country !== "CH" ? b.country : "", b.email].filter(Boolean);
// vendor libraries are loaded only when a PDF is rendered
function loadScript(src, globalName) {
  return new Promise((res, rej) => { if (globalThis[globalName]) return res(); const el = document.createElement("script"); el.src = src; el.onload = () => (globalThis[globalName] ? res() : rej(new Error(globalName + " did not load"))); el.onerror = () => rej(new Error("could not load " + src)); document.head.appendChild(el); });
}
async function renderPdf(data, meta) {
  await loadScript("./vendor/pdf-lib.min.js", "PDFLib"); await loadScript("./vendor/qrcode.js", "qrcode");
  const { renderSalePdf } = await import("./invoice-pdf.js");
  return renderSalePdf(data, meta);
}
function downloadBytes(name, bytes, mime) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

// ----- device page: purchase details + start a sale
let dSaleInfo = null, buyerKindSel = "person", bPicked = null;
async function loadDeviceSale(a) {
  let info; try { info = await backend.saleOfDevice(tok(), BigInt(a.id)); } catch (e) { return; }
  dSaleInfo = info;
  const pu = opt(info.purchase);
  $("pPrice").value = pu ? fmtMoney(pu.priceMinor).replace(/'/g, "") : ""; $("pCur").value = pu ? pu.currency : ""; $("pDate").value = pu ? pu.date : ""; $("pNote").value = pu ? pu.note : "";
  $("dPurchaseLine").textContent = pu ? `The company paid ${fmtMoney(pu.priceMinor, pu.currency)}${pu.date ? " on " + pu.date : ""}${pu.note ? " · " + pu.note : ""}.` : "No purchase details yet — with price and date the rule can propose a selling price.";
  const sv = opt(info.sale);
  $("dSaleOpen").classList.toggle("hidden", !sv); $("dSaleStart").classList.toggle("hidden", !!sv || a.status === "sold" || a.status === "scrapped"); $("dSellForm").classList.add("hidden");
  if (sv) { const s = sv.sale; $("dSaleOpen").innerHTML = `<div class="kv">Sale <b>#${Number(s.id)}</b> · <span class="pill st-${esc(s.status)}">${esc(SALE_WORD[s.status] || s.status)}</span> · ${esc(s.buyer.name)} · ${esc(fmtMoney(s.grossMinor, s.currency))}${s.invoiceNo ? " · " + esc(s.invoiceNo) : ""}</div><div class="btnrow"><a href="#/sale/${Number(s.id)}"><button class="primary sm">Open the sale</button></a></div>`; }
  else {
    const pr = opt(info.proposal);
    $("dProposal").innerHTML = info.billingReady ? `<span class="pill off">not ready</span> ${esc(info.billingReady)}` : pr ? `Rule price today: <b>${esc(fmtMoney(pr.proposedMinor, "CHF"))}</b> <span class="kv">(${esc(pr.basis)})</span>` : "No rule price without purchase details — you type the price.";
    $("dSellBtn").disabled = !!info.billingReady;
  }
}
$("pSave").onclick = async () => {
  const m = toMinor($("pPrice").value); if (m === null) return setStatus("pStatus", "err", "price as 1234.50");
  setStatus("pStatus", "", "saving…");
  const r = await backend.setPurchase(tok(), BigInt(curId), [m], $("pCur").value.trim(), $("pDate").value, $("pNote").value.trim());
  setStatus("pStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail); if (r.ok) loadDevice(curId);
};
$("pClear").onclick = async () => { const r = await backend.setPurchase(tok(), BigInt(curId), [], "", "", ""); setStatus("pStatus", r.ok ? "ok" : "err", r.ok ? "cleared" : r.detail); if (r.ok) loadDevice(curId); };
$("dSellBtn").onclick = () => {
  $("dSellForm").classList.remove("hidden"); bPicked = null; $("bPerson").value = ""; $("bName").value = ""; $("bEmail").value = "";
  for (const id of ["bStreet", "bHouse", "bPostal", "bTown", "bPriceNote"]) $(id).value = ""; $("bCountry").value = "CH";
  const pr = dSaleInfo && opt(dSaleInfo.proposal); $("bPrice").value = pr ? fmtMoney(pr.proposedMinor).replace(/'/g, "") : "";
  // a device that is with a colleague: propose them as the buyer
  if (curAssigneeEmail) { $("bPerson").value = curAssigneeEmail; $("bPerson").dataset.email = curAssigneeEmail; bPicked = curAssigneeEmail; }
  setStatus("bStatus", "", ""); $("dSellForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
};
chipRow("buyerKind", (k) => { buyerKindSel = k; $("bPersonRow").classList.toggle("hidden", k !== "person"); $("bExtRow").classList.toggle("hidden", k !== "external"); });
attachPicker("bPerson", "bPersonList", (email) => { bPicked = email; });
$("bCancel").onclick = () => $("dSellForm").classList.add("hidden");
$("bCreate").onclick = async () => {
  const price = toMinor($("bPrice").value); if (price === null || price === 0n) return setStatus("bStatus", "err", "a price incl. VAT, e.g. 650.00");
  let buyer;
  if (buyerKindSel === "person") {
    const email = $("bPerson").dataset.email || bPicked; if (!email) return setStatus("bStatus", "err", "pick the colleague from the directory");
    // the picker speaks addresses; the register resolves the person id (pid = address is understood)
    buyer = { pid: email, name: "", email, street: $("bStreet").value.trim(), houseNo: $("bHouse").value.trim(), postalCode: $("bPostal").value.trim(), town: $("bTown").value.trim(), country: $("bCountry").value.trim() || "CH" };
  } else {
    if (!$("bName").value.trim()) return setStatus("bStatus", "err", "the buyer's name");
    buyer = { pid: "", name: $("bName").value.trim(), email: $("bEmail").value.trim(), street: $("bStreet").value.trim(), houseNo: $("bHouse").value.trim(), postalCode: $("bPostal").value.trim(), town: $("bTown").value.trim(), country: $("bCountry").value.trim() || "CH" };
  }
  setStatus("bStatus", "", "starting…");
  const r = await backend.createSale(tok(), BigInt(curId), buyer, price, $("bPriceNote").value.trim());
  if (!r.ok) return setStatus("bStatus", "err", r.detail);
  location.hash = "#/sale/" + Number(r.id);
};

// ----- sales list (admins)
let saleFilter = "open", salesOffset = 0, salesGeneration = 0;
const changeSalesFilter = (phase) => { saleFilter = phase; salesOffset = 0; loadSales(); };
$("saleFilters").onclick = (e) => { const p = e.target.closest("[data-st]"); if (p) changeSalesFilter(p.dataset.st); };
$("salesOpen").onclick = () => changeSalesFilter("open");
$("salesAll").onclick = () => changeSalesFilter("");
$("salesNext").onclick = () => { salesOffset += 100; loadSales(); };
$("salesPrev").onclick = () => { salesOffset = Math.max(0, salesOffset - 100); loadSales(); };
let salesTimer;
$("salesQ").oninput = () => { clearTimeout(salesTimer); salesTimer = setTimeout(() => { salesOffset = 0; loadSales(); }, 200); };
async function loadSales() {
  const generation = ++salesGeneration;
  $("salesOpen").classList.toggle("on", saleFilter === "open"); $("salesOpen").setAttribute("aria-pressed", saleFilter === "open");
  $("salesAll").classList.toggle("on", saleFilter === ""); $("salesAll").setAttribute("aria-pressed", saleFilter === "");
  $("saleRows").setAttribute("aria-busy", "true");
  try {
    const board = await backend.salesBoard(tok(), saleFilter, $("salesQ").value.trim(), BigInt(salesOffset));
    if (generation !== salesGeneration) return;
    const counts = Object.fromEntries(board.counts.map(([p,n]) => [p, Number(n)]));
    $("saleFilters").innerHTML = PHASES.map(([phase, title, hint], i) => `<button data-st="${phase}" class="${phase === saleFilter ? 'on' : ''}" aria-pressed="${phase === saleFilter}"><span class="phase">${i < 4 ? '0' + (i + 1) + ' · ' : ''}${title}</span><span class="count">${counts[phase] || 0}</span><small>${hint}</small></button>`).join("");
    const rows = board.rows;
    const count = Number(board.matched), countLabel = count === 1 ? 'sale' : 'sales';
    $("salesCount").textContent = `${count} ${countLabel}${saleFilter === 'open' ? count === 1 ? ' needs attention' : ' need attention' : ''}${$("salesQ").value.trim() ? ' matching your search' : ''}${(salesOffset || board.hasMore) && rows.length ? ` · showing ${salesOffset + 1}–${salesOffset + rows.length}` : ''}`;
    $("salesPrev").classList.toggle("hidden", !salesOffset); $("salesNext").classList.toggle("hidden", !board.hasMore);
    $("saleRows").innerHTML = rows.length ? rows.map(r => `<a class="dev" href="#/sale/${Number(r.id)}"><div class="ic" aria-hidden="true">${r.phase === 'complete' ? '✓' : '↗'}</div><div class="t"><b>${esc(r.deviceName)}</b><span>${esc(r.buyerName)}${r.deviceTag ? ' · ' + esc(r.deviceTag) : ''}${r.invoiceNo ? ' · ' + esc(r.invoiceNo) : ''}</span></div><div class="r"><span class="next">${esc(nextStep({...r, sale:r}))}</span><span class="kv">${esc(fmtMoney(r.grossMinor,r.currency))} · ${esc(ago(r.updatedAt))}</span></div></a>`).join('') : `<div class="empty">${$("salesQ").value.trim() ? 'No sales match this search. Try a device, buyer name or invoice number.' : saleFilter === 'open' ? 'Nothing needs attention. Completed and cancelled sales stay available above.' : 'No sales in this phase yet.'}</div>`;
    $("salesReady").textContent = '';
    const b = opt(await backend.getBilling(tok()));
    if (generation === salesGeneration && b && (!b.legalName || !b.iban)) $("salesReady").innerHTML = '<a href="#/settings/sales">Finish invoice settings before the first sale →</a>';
  } catch (_) { if (generation === salesGeneration) { $("saleRows").innerHTML = '<div class="empty">Sales could not be loaded. <button id="salesRetry" class="sm">Try again</button></div>'; $("salesRetry").onclick = loadSales; $("salesCount").textContent = 'Sales unavailable'; } }
  finally { if (generation === salesGeneration) $("saleRows").removeAttribute("aria-busy"); }
}
$("salesCsv").onclick = async () => { const csv = await backend.salesExportCsv(tok(), $("salesYear").value.trim()); downloadBytes(`sales-${$("salesYear").value.trim() || "all"}.csv`, new TextEncoder().encode(csv), "text/csv"); };

// ----- one sale (admins, and the buyer for their own)
let curSale = null, lastSaleId = 0, saleLoadGeneration = 0;
async function loadSale(id) {
  clearPin();
  curSale = null;
  $("saleNext").classList.add("hidden"); $("handoverCard").classList.add("hidden");
  $("saleProgress").innerHTML = ""; $("sFormerBuyer").replaceChildren(); $("sFormerBuyer").classList.add("hidden");
  const generation = ++saleLoadGeneration;
  let v; try { v = opt(await backend.getSale(tok(), BigInt(id))); } catch (e) { v = null; }
  if (generation !== saleLoadGeneration) return;
  const admin = me.role === "admin";
  $("sBack").href = admin ? "#/sales" : "#/offers"; $("sBack").textContent = admin ? "‹ Sales" : "‹ Offers & invoices";
  if (!v) { $("sTitle").textContent = "not found"; $("sPills").innerHTML = ""; $("sKv").innerHTML = ""; $("sMoney").textContent = ""; for (const c of ["sChecksCard", "sTermsCard", "sEditCard", "sDocCard", "sAdminCard", "sDealCard", "sSummaryCard", "handoverCard"]) $(c).classList.add("hidden"); return; }
  $("sSummaryCard").classList.remove("hidden"); $("sTermsCard").classList.remove("hidden");
  curSale = v; const s = v.sale; const inv = opt(v.invoice), cn = opt(v.creditNote), pr = opt(v.proposal);
  const editable = ["draft", "offered", "accepted"].includes(s.status);
  let former = null; if (admin) { try { former = opt(await backend.formerBuyerStatus(tok(), s.id)); } catch (_) {} }
  if (generation !== saleLoadGeneration) return;
  renderFormerBuyer({root:$("sFormerBuyer"),info:former,sale:s,api:()=>backend,token:tok,reload:()=>loadSale(id)});
  let deal = null; if (admin && (!s.buyer.pid || former?.privateEmail)) { try { deal = opt(await backend.dealStatus(tok(), s.id)); } catch (_) {} }
  if (generation !== saleLoadGeneration) return;
  renderDealAdmin(s, deal, id, v, former);
  renderSaleWorkflow(v, deal);
  $("sTitle").textContent = v.deviceName;
  $("sPills").innerHTML = `<span class="pill st-${esc(s.status)}">${esc(Number(v.handedOverAt || deal?.handedOverAt) && s.status !== "cancelled" ? "complete" : SALE_WORD[s.status] || s.status)}</span> <a href="#/d/${Number(s.assetId)}" class="pill" style="text-decoration:none">device</a>${s.creditNoteNo ? ` <span class="pill off">credit note ${esc(s.creditNoteNo)}</span>` : ""}${v.stillInAbm ? ` <span class="pill warn" title="Apple Business Manager still lists this device">still in ABM · ${esc(v.stillInAbm)}</span>` : ""}`;

  $("sMoney").textContent = fmtMoney(s.grossMinor, s.currency);
  $("sKv").innerHTML = [["Buyer", esc(s.buyer.name) + `<details><summary>Billing contact</summary>${buyerLines(s.buyer).slice(1).map(esc).join("<br>")}</details>` + (s.buyer.pid ? ' <span class="kv">(colleague)</span>' : ' <span class="kv">(outside buyer)</span>')], ["Device", `${esc(v.deviceName)}${v.deviceSerial ? ` · <span class="mono">${esc(v.deviceSerial)}</span>` : ""}${v.deviceTag ? " · " + esc(v.deviceTag) : ""}`], ["Price", `${esc(fmtMoney(s.grossMinor, s.currency))} incl. VAT ${esc((Number(s.vatRateBp) / 100).toString())}% · net ${esc(fmtMoney(s.netMinor))} · VAT ${esc(fmtMoney(s.vatMinor))}${s.priceNote ? `<br><span class="kv">${esc(s.priceNote)}</span>` : ""}`], ["Invoice", s.invoiceNo ? `${esc(s.invoiceNo)} · issued ${esc(s.issuedOn)} · due ${esc(s.dueOn)} · reference <span class="mono">${esc(inv ? inv.referencePretty : s.reference)}</span>` : "not issued yet"], ["Paid", s.paidAt && Number(s.paidAt) ? `${esc(fmt(s.paidAt))}${s.paidNote ? " · " + esc(s.paidNote) : ""}` : ""], ["Handed over", Number(v.handedOverAt || deal?.handedOverAt) ? esc(fmt(v.handedOverAt || deal.handedOverAt)) : ""], ["Cancelled", s.cancelledAt && Number(s.cancelledAt) ? `${esc(fmt(s.cancelledAt))} · ${esc(s.cancelReason)}` : ""], ["Started", `${esc(fmt(s.createdAt))}${v.createdByName ? " · " + esc(v.createdByName) : ""}`]].filter(([, val]) => val).map(([k, val]) => `<div>${k}</div><div>${val}</div>`).join("");
  $("sProposal").innerHTML = pr ? `Rule price today: <b>${esc(fmtMoney(pr.proposedMinor, s.currency))}</b> — ${esc(pr.basis)}${Number(pr.proposedMinor) !== Number(s.grossMinor) ? ` · <b>this sale differs</b>${s.priceNote ? "" : " (no note on why)"}` : ""}` : "";
  // checks
  const checksEditable = s.status !== "cancelled" && !Number(v.handedOverAt || deal?.handedOverAt);
  $("sChecksTitle").textContent = "Prepare for hand-over";
  $("sChecksCard").classList.toggle("hidden", !admin || s.status === "cancelled" || Number(v.handedOverAt || deal?.handedOverAt) > 0);
  $("ckWiped").checked = s.wiped; $("ckMdm").checked = s.mdmRemoved; $("ckWiped").disabled = $("ckMdm").disabled = !checksEditable; $("ckSave").classList.toggle("hidden", !checksEditable);
  setStatus("ckStatus", "", s.checksBy ? `last saved by ${v.checksByName}` : "");
  // terms
  $("sTermsLine").innerHTML = s.acceptedHow ? `<span class="pill on">accepted</span> ${esc(s.acceptedHow === "online" ? `Accepted online by ${s.buyer.name} on ${fmt(s.acceptedAt)} (terms v${Number(s.waiverVersion)})` : `${s.acceptedHow} — recorded by ${v.acceptedByName} on ${fmt(s.acceptedAt)}`)}` : s.status === "offered" ? (s.buyer.pid ? `<span class="pill warn">waiting</span> ${esc(s.buyer.name)} was asked to accept under Offers & invoices.` : `<span class="pill warn">waiting</span> The outside buyer accepts through their private dealroom link.`) : `Version ${Number(v.waiverVersion)} — the buyer accepts these when the offer goes out.`;
  $("sTermsText").textContent = inv ? inv.waiverText : v.waiverText;
  if (s.acceptedHow === "dealroom") $("sTermsLine").textContent = `Accepted by ${s.buyer.name} using the private dealroom link on ${fmt(s.acceptedAt)} (terms v${Number(s.waiverVersion)})`;
  $("sTermsActions").innerHTML = "";
  // edit
  $("sEditCard").classList.toggle("hidden", !admin || !editable);
  if (admin && editable) { $("seName").value = s.buyer.name; $("seName").disabled = !!s.buyer.pid; $("seEmail").value = s.buyer.email; $("seEmail").disabled = !!s.buyer.pid; $("seStreet").value = s.buyer.street; $("seHouse").value = s.buyer.houseNo; $("sePostal").value = s.buyer.postalCode; $("seTown").value = s.buyer.town; $("seCountry").value = s.buyer.country; $("sePrice").value = fmtMoney(s.grossMinor).replace(/'/g, ""); $("sePriceNote").value = s.priceNote; $("seDesc").value = s.description; setStatus("seStatus", "", ""); }
  // documents
  const docs = [];
  if (s.pdfId && Number(s.pdfId)) docs.push({ id: s.pdfId, name: s.invoiceNo + ".pdf", hash: s.pdfHash }); else if (inv) docs.push({ id: 0n, name: s.invoiceNo + ".pdf", missing: true });
  if (s.creditPdfId && Number(s.creditPdfId)) docs.push({ id: s.creditPdfId, name: s.creditNoteNo + ".pdf" }); else if (cn) docs.push({ id: 0n, name: s.creditNoteNo + ".pdf", missing: true, credit: true });
  $("sDocCard").classList.toggle("hidden", !docs.length);
  $("sDocs").innerHTML = docs.map((d) => `<div class="ev"><span class="dot"></span><div><div class="what"><b>${esc(d.name)}</b>${d.missing ? ' <span class="pill warn">not archived yet</span>' : ` <button class="sm" data-dl="${Number(d.id)}">Download</button>`}</div>${d.hash ? `<details><summary>Document integrity</summary><div class="meta">SHA-256 ${esc(d.hash)}</div></details>` : ""}</div></div>`).join("");
  $("sDocs").querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => { const d = opt(await backend.saleDocument(tok(), BigInt(b.dataset.dl))); if (!d) return setStatus("sDocStatus", "err", "not available"); downloadBytes(d.name, new Uint8Array(d.bytes), d.mime); }));
  $("sDocActions").innerHTML = admin ? docs.filter((d) => d.missing).map((d) => `<button class="primary sm" data-render="${d.credit ? "creditNote" : "invoice"}">Render and archive the ${d.credit ? "credit note" : "invoice"} PDF</button>`).join("") : "";
  $("sDocActions").querySelectorAll("[data-render]").forEach((b) => (b.onclick = () => renderAndArchive(v, b.dataset.render)));
  if (lastSaleId !== id) setStatus("sDocStatus", "", ""); lastSaleId = id;
  // actions
  $("sAdminCard").classList.toggle("hidden", !admin);
  const acts = [];
  if (s.status === "draft" && s.buyer.pid) acts.push(`<button class="primary sm" data-act="offer">Offer to the buyer</button>`);
  if (s.status === "offered" && s.buyer.pid) acts.push(`<button class="sm" data-act="offer">Offer again (re-notify)</button>`);
  if (s.status === "accepted" && !deal?.exists) acts.push(`<button class="primary sm" data-act="issue">Issue the invoice</button>`);
  if (s.status === "issued") acts.push(`<button class="primary sm" data-act="paid">Confirm payment…</button>`);
  if (s.status !== "cancelled") acts.push(`<button class="sm" data-act="cancel">${["issued", "paid"].includes(s.status) ? "Cancel with credit note…" : "Cancel the sale…"}</button>`);
  $("sActions").innerHTML = acts.join("");
  const cancelButton = $("sActions").querySelector('[data-act="cancel"]'); if (cancelButton) { const more = document.createElement("details"); more.innerHTML = "<summary>More actions</summary>"; $("sActions").append(more); more.append(cancelButton); } $("sCancelRow").classList.add("hidden"); setStatus("sActStatus", "", "");
  $("sActions").querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const act = b.dataset.act;
    if (act === "cancel") { $("sCancelRow").classList.remove("hidden"); $("sCancelReason").focus(); return; }
    setStatus("sActStatus", "", "working…"); b.disabled = true;
    try {
      if (act === "offer") { const r = await backend.offerSale(tok(), s.id); setStatus("sActStatus", r.ok ? (/NOT be notified/.test(r.detail) ? "err" : "ok") : "err", r.detail || "offered"); if (r.ok) loadSale(id); }
      if (act === "paid") { $("sPaidRow").classList.remove("hidden"); $("sPaidNote").focus(); setStatus("sActStatus", "", ""); }
      if (act === "issue") {
        const r = await backend.issueInvoice(tok(), s.id);
        if (!r.ok) { setStatus("sActStatus", "err", r.detail); return; }
        setStatus("sActStatus", "ok", `invoice ${r.invoiceNo} issued — rendering the PDF…`);
        const fresh = opt(await backend.getSale(tok(), BigInt(id)));
        if (fresh) await renderAndArchive(fresh, "invoice");
        if (r.detail && /NOT be notified/.test(r.detail)) setStatus("sActStatus", "err", r.detail);
        loadSale(id);
      }
    } finally { b.disabled = false; }
  }));
  $("sPaidRow").classList.add("hidden");
  $("sPaidGo").onclick = async () => { const r = await backend.markPaid(tok(), s.id, $("sPaidNote").value.trim()); setStatus("sActStatus", r.ok ? "ok" : "err", r.ok ? "marked paid" : r.detail); if (r.ok) loadSale(id); };
  $("sCancelGo").onclick = async () => {
    const reason = $("sCancelReason").value.trim(); if (!reason) return setStatus("sActStatus", "err", "a reason, please");
    if (!confirm(["issued", "paid"].includes(s.status) ? "Cancel this invoice with a numbered credit note?" : "Cancel this sale?")) return;
    const r = await backend.cancelSale(tok(), s.id, reason); setStatus("sActStatus", r.ok ? "ok" : "err", r.detail);
    if (r.ok) { const fresh = opt(await backend.getSale(tok(), BigInt(id))); if (fresh && r.creditNoteNo) await renderAndArchive(fresh, "creditNote"); loadSale(id); }
  };
}
// External sales share a private buyer room; staff retain payment and hand-over.
function renderDealAdmin(s, deal, id, v, former) {
  const card = $("sDealCard"); card.classList.toggle("hidden", me.role !== "admin" || (!!s.buyer.pid && !former?.privateEmail));
  if (me.role !== "admin" || (s.buyer.pid && !former?.privateEmail)) return;
  if (!deal) { card.innerHTML = '<h3>External dealroom</h3><p class="kv">Could not load dealroom status. Reopen the sale to retry.</p>'; return; }
  const milestones = [["Offer accepted", s.acceptedAt], ["Invoice receipt", deal.completedAt]];
  card.innerHTML = `<details class="room-details" ${!s.invoiceNo || !Number(deal.completedAt) ? "open" : ""}><summary>Buyer’s dealroom <span class="pill ${Number(deal.completedAt) ? "on" : "warn"}">${Number(deal.completedAt) ? "Receipt confirmed" : s.invoiceNo ? "Receipt pending" : "Awaiting buyer"}</span></summary><p class="kv">The buyer accepts the offer and receives their invoice here.</p>
    <div class="kvl">${milestones.map(([label, at]) => `<div>${esc(label)}</div><div>${Number(at) ? '✓ ' + esc(fmt(at)) : 'Pending'}</div>`).join("")}</div>
    <p class="kv">${deal.exists ? (deal.active ? `Link active until ${esc(fmt(deal.expiresAt))}.` : "Link expired or revoked.") : "No link created yet."} ${Number(deal.openedAt) ? `First opened ${esc(fmt(deal.openedAt))}.` : ""}</p>
    <div class="btnrow">${s.status !== "cancelled" ? `<button class="primary sm" id="dealCreate">${deal.exists ? "Replace private link" : "Create private link"}</button>` : ""}${deal.active ? '<button class="sm" id="dealRevoke">Revoke access</button>' : ""}<button class="sm" id="dealRefresh">Refresh status</button></div>
    <div id="dealLinkBox" class="hidden"><label for="dealLink">Private link — copy now, it is not stored in recoverable form</label><div class="row"><input id="dealLink" type="text" readonly autocomplete="off" spellcheck="false"><button id="dealCopy" class="sm">Copy link</button></div><p class="kv">Anyone with this link can respond as this buyer. Valid for 14 days. Creating a replacement invalidates the previous link.</p></div><p class="status" id="dealStatusMsg" role="status"></p>
    ${deal.notification ? `<p class="status err">Notification pending: ${esc(deal.notification)} Delivery will be retried automatically.</p>` : ""}
    ${deal.history.length ? `<details><summary>Dealroom activity · ${deal.history.length} events</summary><div class="deal-timeline">${[...deal.history].reverse().map(e => `<div class="ev"><span class="dot"></span><div><div class="what">${esc(e.detail)}</div><div class="meta">${esc(fmt(e.at))} · ${esc(e.actorLabel)}</div></div></div>`).join("")}</div></details>` : ""}</details>`;
  const act = async (button, fn) => { button.disabled = true; setStatus("dealStatusMsg", "", "working…"); try { await fn(); } catch (_) { setStatus("dealStatusMsg", "err", "Connection interrupted. Refresh status before retrying."); } finally { button.disabled = false; } };
  $("dealRefresh").onclick = () => loadSale(id);
  if ($("dealCreate")) $("dealCreate").onclick = e => {
    if (deal.active && !confirm("Replace this private link? The buyer's previous link will stop working.")) return;
    act(e.currentTarget, async () => { const r = await backend.createDealLink(tok(), s.id); if (!r.ok) return setStatus("dealStatusMsg", "err", r.detail); await loadSale(id); $("dealLink").value = r.url; $("dealLinkBox").classList.remove("hidden"); setStatus("dealStatusMsg", "ok", "Link ready. Copy and send it to the buyer."); });
  };
  $("dealCopy").onclick = async () => { try { await navigator.clipboard.writeText($("dealLink").value); setStatus("dealStatusMsg", "ok", "Copied. Send this link only to the buyer."); } catch (_) { $("dealLink").focus(); $("dealLink").select(); setStatus("dealStatusMsg", "", "Select and copy the link above."); } };
  if ($("dealRevoke")) $("dealRevoke").onclick = e => { if (!confirm("Revoke the buyer's access? Their acceptance and archived invoice remain recorded.")) return; act(e.currentTarget, async () => { const r = await backend.revokeDealLink(tok(), s.id); if (r.ok) await loadSale(id); setStatus("dealStatusMsg", r.ok ? "ok" : "err", r.detail); }); };

}
/** Render the PDF from the backend's InvoiceData and archive it exactly as rendered; then hand it to the person. */
async function renderAndArchive(v, kind) {
  const data = opt(kind === "creditNote" ? v.creditNote : v.invoice); if (!data) return;
  setStatus("sDocStatus", "", "rendering the PDF…");
  try {
    const bytes = await renderPdf(data, { device: v.deviceName, serial: v.deviceSerial, cancelReason: v.sale.cancelReason });
    const r = await backend.attachSaleDocument(tok(), v.sale.id, kind, bytes);
    if (!r.ok && !/already archived/.test(r.detail)) { setStatus("sDocStatus", "err", r.detail); return; }
    setStatus("sDocStatus", "ok", r.ok ? `archived as ${data.number}.pdf` : "already archived");
    downloadBytes(`${data.number}.pdf`, bytes, "application/pdf");
  } catch (e) { setStatus("sDocStatus", "err", "PDF: " + String(e.message || e).slice(0, 140)); }
}
$("ckSave").onclick = async () => { if (!curSale) return; const r = await backend.setSaleChecks(tok(), curSale.sale.id, $("ckWiped").checked, $("ckMdm").checked); setStatus("ckStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail); if (r.ok) loadSale(Number(curSale.sale.id)); };
$("seSave").onclick = async () => {
  if (!curSale) return; const s = curSale.sale;
  const price = toMinor($("sePrice").value); if (price === null || price === 0n) return setStatus("seStatus", "err", "a price incl. VAT");
  const buyer = { ...s.buyer, name: s.buyer.pid ? s.buyer.name : $("seName").value.trim(), email: s.buyer.pid ? s.buyer.email : $("seEmail").value.trim(), street: $("seStreet").value.trim(), houseNo: $("seHouse").value.trim(), postalCode: $("sePostal").value.trim(), town: $("seTown").value.trim(), country: $("seCountry").value.trim() || "CH" };
  setStatus("seStatus", "", "saving…");
  const r = await backend.updateSale(tok(), s.id, buyer, price, $("sePriceNote").value.trim(), $("seDesc").value.trim());
  setStatus("seStatus", r.ok ? "ok" : "err", r.detail || (r.ok ? "saved" : "")); if (r.ok) loadSale(Number(s.id));
};

// ----- offers & invoices (the buyer)
async function loadOffers(id) {
  const detail = id !== undefined, requestedHash = location.hash;
  $("offersBack").classList.toggle("hidden", !detail);
  $("offersTitle").textContent = detail ? "Your offer & invoice" : "Offers & invoices";
  $("offerRows").innerHTML = '<div class="empty">loading…</div>';
  let rows = []; try { rows = await backend.myOffers(tok()); } catch (e) { if (location.hash === requestedHash) $("offerRows").innerHTML = `<div class="empty">Could not load your offers. Please reload and try again.</div>`; return; }
  if (location.hash !== requestedHash) return;
  // Keep the buyer-scoped API: even an app admin must not review/accept another buyer's offer here.
  if (detail) rows = /^[1-9][0-9]*$/.test(id) ? rows.filter((v) => String(v.sale.id) === id) : [];
  if (!rows.length) { $("offerRows").innerHTML = `<div class="empty">${detail ? "This offer is not available for your signed-in account. Use the account that received the notification, or ask IT to check the offer." : "nothing offered to you at the moment"}</div>`; return; }
  $("offerRows").innerHTML = rows.map((v) => {
    const s = v.sale; const open = s.status === "offered"; const complete = s.buyer.street && s.buyer.postalCode && s.buyer.town;
    return `<div class="card ${open ? "" : "flat"}" data-offer="${Number(s.id)}">
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:200px"><h3 style="margin-bottom:2px">${esc(v.deviceName)}</h3><div class="kv">${v.deviceSerial ? "serial " + esc(v.deviceSerial) + " · " : ""}<span class="pill st-${esc(s.status)}">${esc(SALE_WORD[s.status] || s.status)}</span>${s.invoiceNo ? " · " + esc(s.invoiceNo) + " · due " + esc(s.dueOn) : ""}</div></div><div class="money">${esc(fmtMoney(s.grossMinor, s.currency))}</div></div>
      <div class="kv" style="margin:6px 0">${esc(s.description)} · price incl. VAT ${esc((Number(s.vatRateBp) / 100).toString())}%</div>
      ${open ? `<label>Hand-over terms (version ${Number(v.waiverVersion)})</label><div class="terms">${esc(v.waiverText)}</div>
        <label>Your postal address for the invoice</label>
        <div class="row"><div style="flex:2"><input type="text" data-f="street" placeholder="Street" value="${esc(s.buyer.street)}"></div><div><input type="text" data-f="houseNo" placeholder="No." value="${esc(s.buyer.houseNo)}"></div></div>
        <div class="row"><div><input type="text" data-f="postalCode" placeholder="Postal code" value="${esc(s.buyer.postalCode)}"></div><div style="flex:2"><input type="text" data-f="town" placeholder="Town" value="${esc(s.buyer.town)}"></div><div><input type="text" data-f="country" placeholder="CH" maxlength="2" value="${esc(s.buyer.country || "CH")}"></div></div>
        <div class="kv" style="margin-top:6px">The address goes on this invoice only — not into the company directory.</div>
        <div class="btnrow"><button class="primary" data-accept="${Number(s.id)}" data-v="${Number(v.waiverVersion)}">I accept the terms and buy it</button><button class="sm" data-decline="${Number(s.id)}">Decline</button><span class="status" data-status></span></div>` : ""}
      ${s.acceptedHow === "online" ? `<div class="kv" style="margin-top:8px">You accepted the terms on ${esc(fmt(s.acceptedAt))}.</div>` : ""}
      ${s.pdfId && Number(s.pdfId) ? `<div class="btnrow"><button class="sm" data-dl="${Number(s.pdfId)}">Download invoice ${esc(s.invoiceNo)}</button>${s.creditPdfId && Number(s.creditPdfId) ? `<button class="sm" data-dl="${Number(s.creditPdfId)}">Credit note ${esc(s.creditNoteNo)}</button>` : ""}</div>` : s.status === "issued" || s.status === "paid" ? `<div class="kv" style="margin-top:8px">Invoice ${esc(s.invoiceNo)} — the PDF is being prepared by IT.</div>` : ""}
      ${s.status === "cancelled" ? `<div class="kv" style="margin-top:8px">${esc(s.cancelReason)}</div>` : ""}
    </div>`;
  }).join("");
  $("offerRows").querySelectorAll("[data-accept]").forEach((b) => (b.onclick = async () => {
    const card = b.closest("[data-offer]"); const f = (k) => card.querySelector(`[data-f="${k}"]`).value.trim(); const st = card.querySelector("[data-status]");
    st.className = "status"; st.textContent = "saving…";
    const r = await backend.acceptOffer(tok(), BigInt(b.dataset.accept), BigInt(b.dataset.v), [{ street: f("street"), houseNo: f("houseNo"), postalCode: f("postalCode"), town: f("town"), country: f("country") || "CH" }]);
    st.className = "status " + (r.ok ? "ok" : "err"); st.textContent = r.ok ? "accepted — IT issues the invoice" : r.detail;
    if (r.ok) loadOffers(id);
  }));
  $("offerRows").querySelectorAll("[data-decline]").forEach((b) => (b.onclick = async () => { if (!confirm("Decline this offer? IT is told.")) return; const r = await backend.declineOffer(tok(), BigInt(b.dataset.decline), ""); if (!r.ok) alert(r.detail); loadOffers(id); }));
  $("offerRows").querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => { const d = opt(await backend.saleDocument(tok(), BigInt(b.dataset.dl))); if (d) downloadBytes(d.name, new Uint8Array(d.bytes), d.mime); }));
}

// ----- invoice settings (admins)
async function loadBilling() {
  let b; try { b = opt(await backend.getBilling(tok())); } catch (e) { return; }
  if (!b) return;
  $("blName").value = b.legalName; $("blUid").value = b.uid; $("blStreet").value = b.street; $("blHouse").value = b.houseNo; $("blPostal").value = b.postalCode; $("blTown").value = b.town; $("blCountry").value = b.country;
  $("blIban").value = b.iban.replace(/(.{4})/g, "$1 ").trim(); $("blCur").value = b.currency; $("blLang").value = b.lang; $("blVat").value = b.vatRegistered ? "1" : "0"; $("blVatRate").value = (Number(b.vatRateBp) / 100).toString(); $("blPrefix").value = b.prefix; $("blYear").value = b.yearInNumber ? "1" : "0"; $("blDays").value = Number(b.paymentDays);
  $("blMonths").value = Number(b.depreciationMonths); $("blFloor").value = Number(b.floorPct); $("blMin").value = fmtMoney(b.minPriceMinor).replace(/'/g, ""); $("blWaiver").value = b.waiverText; $("blWaiverVersion").textContent = "v" + Number(b.waiverVersion); $("blFooter").value = b.footer;
  window._billing = b;
}
$("blSave").onclick = async () => {
  const b0 = window._billing || {}; const rate = Math.round(parseFloat(($("blVatRate").value || "0").replace(",", ".")) * 100); const minP = toMinor($("blMin").value);
  if (isNaN(rate)) return setStatus("blStatus", "err", "VAT rate as 8.1"); if (minP === null) return setStatus("blStatus", "err", "minimum price as 50.00");
  const b = { legalName: $("blName").value.trim(), street: $("blStreet").value.trim(), houseNo: $("blHouse").value.trim(), postalCode: $("blPostal").value.trim(), town: $("blTown").value.trim(), country: $("blCountry").value.trim() || "CH", uid: $("blUid").value.trim(), vatRegistered: $("blVat").value === "1", vatRateBp: BigInt(rate), iban: $("blIban").value.trim(), currency: $("blCur").value, prefix: $("blPrefix").value.trim(), yearInNumber: $("blYear").value === "1", paymentDays: BigInt(Math.max(0, Number($("blDays").value) || 0)), lang: $("blLang").value, depreciationMonths: BigInt(Math.max(1, Number($("blMonths").value) || 36)), floorPct: BigInt(Math.max(0, Number($("blFloor").value) || 0)), minPriceMinor: minP, waiverText: $("blWaiver").value, waiverVersion: b0.waiverVersion || 1n, footer: $("blFooter").value.trim() };
  setStatus("blStatus", "", "saving…");
  const r = await backend.setBilling(tok(), b); setStatus("blStatus", r.ok ? "ok" : "err", r.detail || (r.ok ? "saved" : "")); if (r.ok) loadBilling();
};

ikReset();
boot().finally(() => signIn.ready()).catch(() => setStatus("loginStatus", "err", "Could not load the app. Check your connection and retry from the Hub."));

// Roles are configured in the Hub; the app exposes no local privilege controls.
for (const link of document.querySelectorAll("[data-hub-permissions-link]")) link.href = HUB_URL.replace(/\/$/, "") + "/#/permissions";
