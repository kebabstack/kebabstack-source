import { idlFactory } from "./idl.js";
import { appSignIn, takeHubTicket, session, mountTopbar, topbarIdlFactory } from "./hub-client.js";

// deploy-time constants (INSTALL.md: sed the placeholders; the kitchen patches them on install)
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const HUB_URL = "__HUB_URL__"; // hub FRONTEND url, e.g. https://xxxxx.icp.net
const IC_HOST = "https://icp0.io";
session.key = "ks-forms-session";

const signIn = appSignIn({ name: "Forms", hubUrl: HUB_URL });

const $ = (id) => document.getElementById(id);
const opt = (o) => (o && o.length ? o[0] : null); // candid opt unwrap
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtD = (ns) => { const d = new Date(Number(ns / 1000000n)); return d.toLocaleDateString("en-CH", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-CH", { hour: "2-digit", minute: "2-digit" }); };
const rndHex = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };
let toastT = null;
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
function confirmBox(text, cb) {
  $("cmText").textContent = text; $("confirmModal").classList.add("on");
  $("cmYes").onclick = () => { $("confirmModal").classList.remove("on"); cb(); };
  $("cmNo").onclick = () => $("confirmModal").classList.remove("on");
}


/* ============================== the shared topbar · session · routing ============================== */
let backend = null, hubActor = null, topbar = null, me = null, info = null;
let hubTok = ""; // the session token, mirrored from session.load() so the form code reads one variable
function hubSignedIn() { return !!(hubTok && me); }
function setStatus(id, cls, text) { if (id === "loginStatus") signIn.status(cls, text); const el = $(id); if (!el) return; el.className = "status " + (cls || ""); el.textContent = text || ""; }

function mountBar() {
  if (!me) return;
  const person = { email: me.email, displayName: me.displayName, role: me.role };
  if (topbar) { topbar.setPerson(person); topbar.setApp({ eyebrow: me.orgName || "" }); return; }
  topbar = mountTopbar($("topbar"), {
    hub: { actor: () => hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
    app: { id: "forms", name: "Forms", eyebrow: me.orgName || "" },
    person,
    onSignOut: signOut,
  });
}
async function refreshMe() {
  const w = opt(await backend.whoami(session.load()));
  if (!w) return false;
  me = w; hubTok = session.load(); mountBar();

  $("settingsBtn").classList.toggle("hidden", me.role !== "admin");
  return true;
}
function signOut() {
  const t = session.load(); session.clear();
  if (t) backend.signOut(t).catch(() => {});
  me = null; hubTok = ""; if (topbar) { topbar.destroy(); topbar = null; }
  $("layout").classList.remove("on"); $("login").style.display = "grid"; setStatus("loginStatus", "", "signed out");
}
$("loginBtn").onclick = () => signIn.continue();

function show(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("on"));
  $(id).classList.add("on");
  window.scrollTo(0, 0);
}
const isFillRoute = () => /^#\/f\//.test(location.hash || "");
function route() {
  const h = location.hash || "";
  const mf = h.match(/^#\/f\/([0-9a-f]{6,40})(\?[^#]*)?/);
  if (mf) {
    // the public fill page: no sign-in, no topbar — respondents are anonymous
    $("login").style.display = "none"; $("layout").classList.remove("on"); $("fillShell").classList.remove("hidden");
    const qs = new URLSearchParams((mf[2] || "").slice(1));
    enterFill(mf[1], qs.get("e"), qs.get("p") === "1");
    return;
  }
  $("fillShell").classList.add("hidden");
  if (!hubSignedIn()) { $("layout").classList.remove("on"); $("login").style.display = "grid"; return; }
  $("login").style.display = "none"; $("layout").classList.add("on");
  const mw = h.match(/^#\/form\/(\d+)(?:\/(\w+))?/);
  if (h.startsWith("#/trash")) { enterTrash(); return; }
  if (h.startsWith("#/settings") && me.role === "admin") { enterSettings(); return; }
  if (h.startsWith("#/docs")) { show("viewDocs"); return; }
  if (mw) { enterWorkspace(Number(mw[1]), mw[2] || "build"); return; }
  enterDash();
}
window.addEventListener("hashchange", route);

async function boot() {
  const { HttpAgent, Actor } = await import("./agent-bundle.js");
  const agent = await HttpAgent.create({ host: IC_HOST });
  backend = Actor.createActor(idlFactory, { agent, canisterId: BACKEND_CANISTER_ID });
  try { info = await backend.info(); if (info.hubId) hubActor = Actor.createActor(topbarIdlFactory, { agent, canisterId: info.hubId }); if (info.orgName) { $("loginSub").textContent = `${info.orgName} · forms`; $("fillOrg").textContent = info.orgName; } if (!info.hubSet) { $("loginWarn").classList.remove("hidden"); $("loginWarn").textContent = "This app is not connected to your company Hub yet. Contact your IT team."; } } catch (e) {}
  if (isFillRoute()) {
    // respondents never touch the hub — but an internal PREVIEW (?p=1) needs the signed-in person, without the topbar
    if (/[?&]p=1/.test(location.hash) && session.load()) { try { const w = opt(await backend.whoami(session.load())); if (w) { me = w; hubTok = session.load(); } } catch (_) {} }
    route(); return;
  }
  const ticket = takeHubTicket();
  if (ticket) {
    session.clear(); // A rejected new ticket must never fall back to another account’s old session.
    setStatus("loginStatus", "", "signing in…");
    const r = opt(await backend.loginWithTicket(ticket));
    if (r) { session.save(r.token); session.saveSuite(r.suiteToken || ""); } else setStatus("loginStatus", "err", "the hub ticket was not accepted — try again from the hub");
  }
  if (session.load() && (await refreshMe())) {
    route();
    setInterval(async () => { if (isFillRoute()) return; try { if (await refreshMe()) return; } catch (_) {} signOut(); setStatus("loginStatus", "err", "Your access could not be confirmed. Check the Hub connection and sign in again from the Hub."); }, 30000);
  } else { session.clear(); route(); }
}

/* ============================== people picker (hub directory) ============================== */
function attachPicker(inputId, listId, onPick, exclude) {
  const input = $(inputId), list = $(listId);
  let timer = 0;
  input.oninput = () => { clearTimeout(timer); input.dataset.email = ""; timer = setTimeout(async () => {
    const q = input.value.trim();
    if (q.length < 1) { list.classList.add("hidden"); return; }
    let rows = [];
    try { rows = await backend.directory(session.load(), q); } catch (_) {}
    rows = rows.filter((r) => !(exclude && exclude().includes(r.email)));
    list.innerHTML = rows.map((r) => `<div data-email="${esc(r.email)}" data-name="${esc(r.displayName)}">${esc(r.displayName || r.email)}<small>${esc(r.email)}${r.department ? " · " + esc(r.department) : ""}</small></div>`).join("") || '<div style="cursor:default;color:var(--ks-fg-muted)">nobody in the directory matches</div>';
    list.classList.remove("hidden");
  }, 180); };
  list.onclick = (e) => { const d = e.target.closest("[data-email]"); if (!d) return; input.value = ""; input.dataset.email = ""; list.classList.add("hidden"); onPick(d.dataset.email, d.dataset.name || d.dataset.email); };
  input.onblur = () => setTimeout(() => list.classList.add("hidden"), 200);
}

/* ============================== dashboard ============================== */
const STATUS_LBL = { draft: "DRAFT", open: "OPEN", closed: "CLOSED" };
const SUBSTATUS_LBL = { received: "RECEIVED", inReview: "IN REVIEW", accepted: "ACCEPTED", declined: "DECLINED" };
const vKey = (v) => Object.keys(v)[0]; // candid variant → key

async function enterDash() {
  show("viewDash");
  $("formList").innerHTML = `<div class="empty">Loading…</div>`;
  try {
    const a = backend;
    const rows = (await a.listForms(hubTok)).sort((x, y) => Number(y.updatedAt - x.updatedAt));
    if (!rows.length) { $("formList").innerHTML = `<div class="empty">No forms yet. Create the first one — it gets an anonymous public link the moment you open it.</div>`; return; }
    $("formList").innerHTML = rows.map((f) => {
      const st = vKey(f.status);
      return `<div class="formrow" data-id="${f.id}">
        <a class="ttl" href="#/form/${f.id}">${esc(f.title)}</a>
        <div class="counts">
          <span class="cnt"><b>${f.subs}</b> submissions</span>
          ${f.subsReceived ? `<span class="cnt">${f.subsReceived} received</span>` : ""}
          ${f.subsInReview ? `<span class="cnt">${f.subsInReview} in review</span>` : ""}
          ${f.subsAccepted ? `<span class="cnt">${f.subsAccepted} accepted</span>` : ""}
          ${f.subsDeclined ? `<span class="cnt">${f.subsDeclined} declined</span>` : ""}
        </div>
        <span class="tag ${st}"><span class="dot"></span>${STATUS_LBL[st]}</span>
        ${f.myRole !== "owner" ? `<span class="tag" title="Shared with you by ${esc(f.createdBy)}">SHARED BY ${esc(f.createdByName || f.createdBy.split("@")[0]).toUpperCase()} · ${f.myRole.toUpperCase()}</span>` : ""}
        <div class="meta">${f.myRole === "owner" ? "you" : esc(f.createdByName || f.createdBy.split("@")[0])} · ${fmtD(f.updatedAt)}</div>
        <button class="iconbtn" data-dup="${f.id}" title="Duplicate as a new draft">⧉</button>
      </div>`;
    }).join("");
    document.querySelectorAll(".formrow").forEach((r) => { r.onclick = () => { location.hash = "#/form/" + r.dataset.id; }; });
    document.querySelectorAll(".formrow [data-dup]").forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        b.disabled = true;
        const m = opt(await backend.duplicateForm(hubTok, Number(b.dataset.dup)));
        if (m) { toast("Copied as a new draft"); location.hash = "#/form/" + m.id; }
        else { b.disabled = false; toast("Could not duplicate"); }
      };
    });
  } catch (e) { $("formList").innerHTML = `<div class="empty">Could not load forms: ${esc(String(e).slice(0, 140))}</div>`; }
}
$("trashBtn").onclick = () => { location.hash = "#/trash"; };
$("trashBack").onclick = () => { location.hash = ""; };
async function enterTrash() {
  show("viewTrash");
  $("trashList").innerHTML = `<div class="empty">Loading…</div>`;
  try {
    const a = backend;
    const rows = (await a.listTrash(hubTok)).sort((x, y) => Number(y.deletedAt - x.deletedAt));
    if (!rows.length) { $("trashList").innerHTML = `<div class="empty">The trash is empty.</div>`; return; }
    $("trashList").innerHTML = rows.map((r) => {
      const daysLeft = Math.max(0, Math.ceil(Number((r.purgeAt - BigInt(Date.now()) * 1000000n) / 86400000000000n)));
      return `<div class="formrow" style="cursor:default">
        <div class="ttl">${esc(r.title)}</div>
        <div class="counts"><span class="cnt"><b>${r.subs}</b> subs</span></div>
        <div class="meta">deleted ${fmtD(r.deletedAt)} · purges in ${daysLeft} day${daysLeft === 1 ? "" : "s"}</div>
        <button class="pill outline sm" data-restore="${r.id}">Restore</button>
        <button class="linkbtn" data-purge="${r.id}">DELETE FOREVER</button>
      </div>`;
    }).join("");
    $("trashList").querySelectorAll("[data-restore]").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        if ((await backend.restoreForm(hubTok, Number(b.dataset.restore))).ok) { toast("Restored — exactly as it was"); location.hash = "#/form/" + b.dataset.restore; }
        else { b.disabled = false; toast("Could not restore"); }
      };
    });
    $("trashList").querySelectorAll("[data-purge]").forEach((b) => {
      b.onclick = () => confirmBox("Delete this form and all its submissions FOREVER? This really cannot be undone.", async () => {
        if ((await backend.purgeForm(hubTok, Number(b.dataset.purge))).ok) { toast("Deleted forever"); enterTrash(); }
        else toast("Could not delete");
      });
    });
  } catch (e) { $("trashList").innerHTML = `<div class="empty">Could not load the trash: ${esc(String(e).slice(0, 120))}</div>`; }
}

$("newFormBtn").onclick = async () => {
  const a = backend;
  const m = opt(await a.createForm(hubTok, "Untitled form"));
  if (!m) { toast("Could not create the form"); return; }
  location.hash = "#/form/" + m.id;
};

/* ============================== import ============================== */
let IMP = null; // analyzed result: { title, desc, schema, rep }
let impMode = "google";
$("importBtn").onclick = () => { IMP = null; $("impSrc").value = ""; $("impReport").innerHTML = ""; $("impCreate").disabled = true; $("importModal").classList.add("on"); };
$("impCancel").onclick = () => $("importModal").classList.remove("on");
$("impCopyPrompt").onclick = () => {
  const p = `Convert the attached form (PDF, document or screenshot) into this plain-text outline format, and output ONLY the outline:

# <form title>
<question text> [type] [required]
- <option>
- <option>
## <section title>   (only if the form has sections/pages)

Rules: one question per line. Type tags: [choice] (single select), [checkboxes] (multi select), [dropdown], [short] (single-line text), [paragraph] (long text), [date], [scale a-b] for rating/linear scales (e.g. [scale 1-5]). Add [required] where the form marks the question mandatory. Options go on "- " lines directly below their question. Skip images, grids and file-upload questions but list them at the very end as comment lines starting with "SKIPPED: ".`;
  navigator.clipboard.writeText(p).then(() => toast("Prompt copied — paste it into your AI assistant with your file"));
};
document.querySelectorAll("#importModal [data-imp]").forEach((t) => {
  t.onclick = () => {
    impMode = t.dataset.imp;
    document.querySelectorAll("#importModal [data-imp]").forEach((x) => x.classList.toggle("sel", x === t));
    $("impHelpG").style.display = impMode === "google" ? "" : "none";
    $("impHelpT").style.display = impMode === "text" ? "" : "none";
    $("impSrc").placeholder = impMode === "google" ? '{"formId":"…","info":{"title":"…"},"items":[…]}' : "# Offsite feedback\nHow was the venue? [scale 1-5] [required]\nWhich sessions did you attend? [checkboxes]\n- Keynote\n- Workshops\nAnything else? [paragraph]";
    IMP = null; $("impReport").innerHTML = ""; $("impCreate").disabled = true;
  };
});

function mapGoogleForm(g) {
  const rep = [];
  const sc = { v: 1, sections: [{ id: 1, title: "", desc: "", questions: [] }] };
  let nextQ = 1, nextS = 1;
  const secByItemId = {};
  if (!g || !Array.isArray(g.items)) return { err: 'This does not look like Google Forms API JSON (forms.get) — expected an "items" array at the top level.' };
  const title = (g.info && (g.info.title || g.info.documentTitle)) || "Imported form";
  const desc = (g.info && g.info.description) || "";
  for (const it of g.items) {
    if (it.pageBreakItem) {
      nextS += 1;
      sc.sections.push({ id: nextS, title: it.title || "", desc: it.description || "", questions: [] });
      if (it.itemId) secByItemId[it.itemId] = nextS;
      continue;
    }
    const cur = sc.sections[sc.sections.length - 1];
    const skip = (why) => rep.push({ ok: false, label: it.title || "(untitled item)", detail: why });
    if (it.questionGroupItem) { skip("Grid questions are not supported yet"); continue; }
    if (it.imageItem) { skip("Image items are not supported"); continue; }
    if (it.videoItem) { skip("Video items are not supported"); continue; }
    if (it.textItem !== undefined) { skip("Text/description block skipped — use the section description instead"); continue; }
    const qi = it.questionItem && it.questionItem.question;
    if (!qi) { skip("Unrecognized item type"); continue; }
    const q = { id: nextQ++, type: "short", title: it.title || "", desc: it.description || "", req: !!qi.required, opts: [], routes: {} };
    if (qi.textQuestion) q.type = qi.textQuestion.paragraph ? "para" : "short";
    else if (qi.choiceQuestion) {
      const t = qi.choiceQuestion.type;
      q.type = t === "CHECKBOX" ? "check" : t === "DROP_DOWN" ? "drop" : "choice";
      const pend = [];
      (qi.choiceQuestion.options || []).forEach((o, oi) => {
        if (o.isOther) { q.opts.push("Other"); rep.push({ ok: false, label: it.title, detail: '"Other" imported as a fixed option — free-text Other is not supported yet' }); }
        else q.opts.push(String(o.value ?? ""));
        if (o.goToAction === "SUBMIT_FORM") pend.push([oi, "s"]);
        else if (o.goToAction === "RESTART_FORM") rep.push({ ok: false, label: it.title, detail: '"Restart form" routing not supported — option keeps default routing' });
        else if (o.goToSectionId) pend.push([oi, o.goToSectionId]);
      });
      if (pend.length) {
        if (q.type === "check") rep.push({ ok: false, label: it.title, detail: "Branching on checkboxes is not supported — routing dropped" });
        else q._pend = pend;
      }
    }
    else if (qi.scaleQuestion) { q.type = "scale"; q.min = qi.scaleQuestion.low ?? 1; q.max = qi.scaleQuestion.high ?? 5; q.minL = qi.scaleQuestion.lowLabel || ""; q.maxL = qi.scaleQuestion.highLabel || ""; }
    else if (qi.ratingQuestion) { q.type = "scale"; q.min = 1; q.max = qi.ratingQuestion.ratingScaleLevel || 5; rep.push({ ok: true, label: it.title, detail: "Rating imported as a 1–" + q.max + " linear scale" }); }
    else if (qi.dateQuestion) { q.type = "date"; if (qi.dateQuestion.includeTime) rep.push({ ok: false, label: it.title, detail: "Time part of the date question dropped" }); }
    else if (qi.timeQuestion) { skip("Time questions are not supported yet"); continue; }
    else if (qi.fileUploadQuestion) { skip("File upload questions are not supported yet"); continue; }
    else { skip("Unsupported question type"); continue; }
    if (qi.grading) rep.push({ ok: false, label: it.title, detail: "Quiz grading dropped — no quiz mode" });
    cur.questions.push(q);
    rep.push({ ok: true, label: q.title || "(untitled)", detail: "→ " + QTYPE_LBL[q.type] + (q.req ? " · required" : "") });
  }
  for (const s of sc.sections) for (const q of s.questions) {
    if (q._pend) {
      for (const [oi, tgt] of q._pend) {
        if (tgt === "s") q.routes[oi] = "s";
        else if (secByItemId[tgt]) q.routes[oi] = secByItemId[tgt];
        else rep.push({ ok: false, label: q.title, detail: "Branch target section not found — default routing kept" });
      }
      delete q._pend;
    }
  }
  return { title, desc, schema: sc, rep };
}

function mapOutline(txt) {
  const rep = [];
  const sc = { v: 1, sections: [{ id: 1, title: "", desc: "", questions: [] }] };
  let title = "Imported form"; let nextQ = 1, nextS = 1; let curQ = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^skipped\s*:/i.test(line)) { rep.push({ ok: false, label: line.replace(/^skipped\s*:\s*/i, "").slice(0, 80), detail: "Skipped by the AI conversion (not supported here yet)" }); continue; }
    if (/^##/.test(line)) { nextS += 1; sc.sections.push({ id: nextS, title: line.replace(/^#+\s*/, ""), desc: "", questions: [] }); curQ = null; continue; }
    if (/^#/.test(line)) { title = line.replace(/^#+\s*/, "") || title; continue; }
    if (/^[-*•]/.test(line)) {
      const optTxt = line.replace(/^[-*•]\s*/, "");
      if (curQ && ["choice", "check", "drop"].includes(curQ.type)) curQ.opts.push(optTxt);
      else if (curQ && curQ.type === "short" && !curQ._locked) { curQ.type = "choice"; curQ.opts = [optTxt]; }
      else rep.push({ ok: false, label: optTxt.slice(0, 50), detail: "Option line without a choice question above it — skipped" });
      continue;
    }
    const tags = [];
    const t = line.replace(/\[([^\]]+)\]/g, (_, g) => { tags.push(g.trim().toLowerCase()); return ""; }).trim();
    const q = { id: nextQ++, type: "short", title: t, desc: "", req: false, opts: [], routes: {} };
    for (const tag of tags) {
      if (tag === "required" || tag === "req") q.req = true;
      else if (["choice", "radio", "multiple choice"].includes(tag)) { q.type = "choice"; q._locked = true; }
      else if (["check", "checkbox", "checkboxes"].includes(tag)) { q.type = "check"; q._locked = true; }
      else if (["drop", "dropdown", "select"].includes(tag)) { q.type = "drop"; q._locked = true; }
      else if (["para", "paragraph", "long", "textarea"].includes(tag)) { q.type = "para"; q._locked = true; }
      else if (["short", "text"].includes(tag)) { q.type = "short"; q._locked = true; }
      else if (tag === "date") { q.type = "date"; q._locked = true; }
      else if (tag.startsWith("scale")) { q.type = "scale"; q._locked = true; const m = tag.match(/(\d+)\s*-\s*(\d+)/); q.min = m ? Math.max(0, +m[1]) : 1; q.max = m ? Math.min(10, +m[2]) : 5; }
      else rep.push({ ok: false, label: t.slice(0, 50), detail: `Unknown tag [${tag}] ignored` });
    }
    sc.sections[sc.sections.length - 1].questions.push(q);
    curQ = q;
  }
  let any = false;
  for (const s of sc.sections) for (const q of s.questions) {
    delete q._locked; any = true;
    rep.push({ ok: true, label: q.title || "(untitled)", detail: "→ " + QTYPE_LBL[q.type] + (q.req ? " · required" : "") });
  }
  if (!any) return { err: "No questions found. One question per line, options as \"- option\" lines, tags like [choice] [required] [scale 1-5]." };
  return { title, desc: "", schema: sc, rep };
}

$("impAnalyze").onclick = () => {
  const src = $("impSrc").value.trim();
  if (!src) { $("impReport").innerHTML = `<div class="notice">Paste something first.</div>`; return; }
  let r;
  if (impMode === "google") {
    let g = null;
    try { g = JSON.parse(src); } catch (e) { r = { err: "Not valid JSON: " + esc(String(e.message).slice(0, 120)) }; }
    if (g) r = mapGoogleForm(g);
  } else r = mapOutline(src);
  if (r.err) { IMP = null; $("impCreate").disabled = true; $("impReport").innerHTML = `<div class="notice">${esc(r.err)}</div>`; return; }
  IMP = r;
  const okRows = r.rep.filter((x) => x.ok), badRows = r.rep.filter((x) => !x.ok);
  const nq = r.schema.sections.reduce((a, s) => a + s.questions.length, 0);
  $("impReport").innerHTML = `
    <div style="font:500 12px var(--ks-mono);letter-spacing:.06em;margin-bottom:8px">${esc(r.title).toUpperCase()} · ${nq} QUESTION${nq === 1 ? "" : "S"} · ${r.schema.sections.length} SECTION${r.schema.sections.length === 1 ? "" : "S"}${badRows.length ? ` · <span style="color:var(--ks-accent)">${badRows.length} NOT IMPORTABLE / NOTES</span>` : " · EVERYTHING MAPS"}</div>` +
    badRows.map((x) => `<div style="font:400 13px var(--ks-ui);padding:5px 0;border-bottom:1px solid var(--ks-rule)"><span style="color:var(--ks-accent)">✕</span> <b>${esc(x.label || "")}</b> · ${esc(x.detail)}</div>`).join("") +
    okRows.map((x) => `<div style="font:400 13px var(--ks-ui);color:var(--ks-fg-secondary);padding:5px 0;border-bottom:1px solid var(--ks-rule)"><span style="color:var(--ks-indicator-teal)">✓</span> ${esc(x.label)} ${esc(x.detail)}</div>`).join("");
  $("impCreate").disabled = nq === 0;
};

$("impCreate").onclick = async () => {
  if (!IMP) return;
  $("impCreate").disabled = true;
  const a = backend;
  const m = opt(await a.createForm(hubTok, IMP.title.slice(0, 300) || "Imported form"));
  if (!m) { toast("Could not create the form"); $("impCreate").disabled = false; return; }
  const ok = (await a.updateForm(hubTok, m.id, { title: IMP.title.slice(0, 300) || "Imported form", description: (IMP.desc || "").slice(0, 2000), schema: JSON.stringify(IMP.schema), allowEdit: false, cap: 0n })).ok;
  $("importModal").classList.remove("on");
  if (ok) { toast("Imported as a new draft — review it, then open it"); location.hash = "#/form/" + m.id; }
  else toast("Form created but the content could not be saved — open it and try again");
};

/* ============================== form workspace ============================== */
let FW = null; // { form, schema, tab, subs, dirty, saveTimer, nextQid }

function schemaOf(f) {
  try { const s = JSON.parse(f.schema); if (s && Array.isArray(s.sections)) return s; } catch (_) {}
  return { v: 1, sections: [{ id: 1, title: "", desc: "", questions: [] }] };
}
function maxQid(schema) { let m = 0; for (const s of schema.sections) for (const q of s.questions) m = Math.max(m, q.id || 0); return m; }
function maxSid(schema) { let m = 0; for (const s of schema.sections) m = Math.max(m, s.id || 0); return m; }

async function enterWorkspace(id, tab) {
  const a = backend;
  const full = opt(await a.getForm(hubTok, id));
  if (!full) { toast("Form not found (or not shared with you)"); location.hash = ""; return; }
  const f = full.form;
  const sh = { owner: f.createdBy, ownerName: full.meta.createdByName, myRole: full.meta.myRole, shares: full.shares.map(([e, r]) => [e, r]), names: Object.fromEntries(full.shares.map(([e, , n]) => [e, n])) };
  if (sh.myRole === "viewer" && tab === "build") tab = "subs";
  const closesAt = full.meta.closesAt;
  FW = { form: f, schema: schemaOf(f), tab, subs: null, dirty: false, saveTimer: null, myRole: sh.myRole, owner: sh.owner, ownerName: sh.ownerName, shares: sh.shares, names: sh.names, closesAt };
  FW.nextQid = maxQid(FW.schema) + 1;
  show("viewForm");
  renderWorkspaceHead();
  document.querySelectorAll(".tabs button").forEach((b) => {
    if (b.dataset.tab === "build") b.style.display = FW.myRole === "viewer" ? "none" : "";
    b.classList.toggle("on", b.dataset.tab === tab);
    b.onclick = async () => { if (FW) { if (FW.dirty) await saveForm(); FW.tab = b.dataset.tab; location.hash = `#/form/${FW.form.id}/${b.dataset.tab}`; } };
  });
  $("tabBuild").style.display = tab === "build" ? "" : "none";
  $("tabSubs").style.display = tab === "subs" ? "" : "none";
  $("tabInsights").style.display = tab === "insights" ? "" : "none";
  if (tab === "build") renderBuilder();
  else { await loadSubs(); if (tab === "subs") renderSubs(); else renderInsights(); }
}
$("backToDash").onclick = async () => { if (FW && FW.dirty) await saveForm(); location.hash = ""; };

function fillUrl(slug) { return location.origin + location.pathname + "#/f/" + slug; }

function renderWorkspaceHead() {
  const f = FW.form;
  const canEdit = FW.myRole !== "viewer";
  const isOwner = FW.myRole === "owner";
  $("fwTitle").textContent = f.title;
  $("fwLink").textContent = fillUrl(f.slug);
  $("fwCopy").onclick = () => { navigator.clipboard.writeText(fillUrl(f.slug)).then(() => toast("Public link copied")); };
  $("fwPreview").onclick = () => window.open(fillUrl(f.slug), "_blank");
  $("fwPrevBtn").onclick = () => window.open(fillUrl(f.slug) + "?p=1", "_blank");
  const st = vKey(f.status);
  $("fwStatusBar").innerHTML = ["draft", "open", "closed"].map((s) =>
    `<span class="tag ${s} ${canEdit ? "clickable" : ""} ${s === st ? "sel" : ""}" data-st="${s}"><span class="dot"></span>${STATUS_LBL[s]}</span>`).join("") +
    (!isOwner ? `<span class="tag" title="${esc(FW.owner)}">SHARED BY ${esc((FW.ownerName || FW.owner.split("@")[0])).toUpperCase()} · ${FW.myRole.toUpperCase()}</span>` : "") +
    (isOwner ? `<button class="linkbtn" id="shareBtn" style="margin-left:6px">SHARE (${FW.shares.length})</button><button class="linkbtn" id="delFormBtn">Delete</button>` : "");
  if (canEdit) {
    $("fwStatusBar").querySelectorAll(".tag[data-st]").forEach((t) => {
      t.onclick = async () => {
        const s = t.dataset.st;
        if (s === st) return;
        const a = backend;
        const ok = (await a.setFormStatus(hubTok, f.id, { [s]: null })).ok;
        if (ok) { FW.form = { ...f, status: { [s]: null } }; renderWorkspaceHead(); toast(s === "open" ? "Form is live — share the public link" : "Status updated"); }
        else toast("Could not change status");
      };
    });
  }
  if (isOwner) {
    $("shareBtn").onclick = openShareModal;
    $("delFormBtn").onclick = () => confirmBox("Move this form to the trash? It stays restorable for 90 days; the public link stops working meanwhile.", async () => {
      const a = backend;
      if ((await a.deleteForm(hubTok, f.id)).ok) { toast("Moved to the trash — restorable for 90 days"); location.hash = ""; }
      else toast("Only the form owner can delete it");
    });
  }
  $("tabSubCount").textContent = "";
}

/* ---------- sharing ---------- */
let SH = null; // working copy [(email, role)]
async function openShareModal() {
  SH = FW.shares.map(([e, r]) => [e, r]);
  $("shSearch").value = "";
  renderShareModal();
  $("shareModal").classList.add("on");
}
let shTimer = 0, shHits = [];
async function shSearchNow() {
  const q = $("shSearch").value.trim();
  const taken = new Set(SH.map(([e]) => e));
  shHits = [];
  if (q) { try { shHits = (await backend.directory(session.load(), q)).filter((d) => d.email !== me.email && !taken.has(d.email)).slice(0, 8); } catch (_) {} }
  renderShareModal();
}
function renderShareModal() {
  const q = $("shSearch").value.trim();
  const hits = q ? shHits : [];
  $("shResults").innerHTML = hits.map((d) => `<div class="opt-item" data-e="${esc(d.email)}" data-n="${esc(d.displayName)}" style="justify-content:space-between"><span>${esc(d.displayName)} <span style="color:var(--ks-fg-muted);font-size:12.5px">· ${esc(d.email)}</span></span><span class="linkbtn">ADD</span></div>`).join("") ||
    (q ? `<div style="font:400 13px var(--ks-ui);color:var(--ks-fg-muted);padding:6px 0">No matches in the directory.</div>` : "");
  $("shResults").querySelectorAll("[data-e]").forEach((r) => { r.onclick = () => { SH.push([r.dataset.e, "viewer"]); FW.names[r.dataset.e] = r.dataset.n; $("shSearch").value = ""; shHits = []; renderShareModal(); }; });
  $("shList").innerHTML = SH.length ? SH.map(([e, role], i) => {
    const nm = (FW.names || {})[e] || e;
    return `<div class="opt-item" style="justify-content:space-between;gap:10px">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nm)} <span style="color:var(--ks-fg-muted);font-size:12.5px">· ${esc(e)}</span></span>
      <span style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <select data-i="${i}" style="padding:5px 8px;font-size:12px"><option value="viewer" ${role === "viewer" ? "selected" : ""}>Viewer</option><option value="editor" ${role === "editor" ? "selected" : ""}>Editor</option></select>
        <button class="iconbtn" data-rm="${i}">✕</button>
      </span></div>`;
  }).join("") : `<div style="font:400 13px var(--ks-ui);color:var(--ks-fg-muted)">Only you have access.</div>`;
  $("shList").querySelectorAll("select[data-i]").forEach((s) => { s.onchange = () => { SH[Number(s.dataset.i)][1] = s.value; }; });
  $("shList").querySelectorAll("[data-rm]").forEach((b) => { b.onclick = () => { SH.splice(Number(b.dataset.rm), 1); renderShareModal(); }; });
}
$("shSearch").oninput = () => { clearTimeout(shTimer); shTimer = setTimeout(shSearchNow, 180); };
$("shCancel").onclick = () => $("shareModal").classList.remove("on");
$("shSave").onclick = async () => {
  const a = backend;
  const r = await a.setShares(hubTok, FW.form.id, SH);
  if (!r.ok) { toast(r.detail || "Could not save"); return; }
  FW.shares = SH.map(([e, ro]) => [e, ro]);
  $("shareModal").classList.remove("on");
  renderWorkspaceHead();
  toast("Sharing updated");
};

/* ---------- autosave ---------- */
function markDirty() {
  if (!FW) return;
  FW.dirty = true;
  $("saveState").textContent = "UNSAVED…";
  clearTimeout(FW.saveTimer);
  FW.saveTimer = setTimeout(saveForm, 1200);
}
async function saveForm() {
  if (!FW || !FW.dirty) return;
  FW.dirty = false;
  $("saveState").textContent = "SAVING…";
  const f = FW.form;
  try {
    const a = backend;
    const ok = (await a.updateForm(hubTok, f.id, { title: f.title, description: f.description, schema: JSON.stringify(FW.schema), allowEdit: f.allowEdit, cap: BigInt(f.cap) })).ok;
    $("saveState").textContent = ok ? "SAVED " + new Date().toLocaleTimeString("en-CH", { hour: "2-digit", minute: "2-digit" }) : "SAVE FAILED";
    if (!ok) { FW.dirty = true; toast("Save failed — is your session still valid? Your changes are NOT saved."); clearTimeout(FW.saveTimer); FW.saveTimer = setTimeout(saveForm, 5000); }
  } catch (e) { $("saveState").textContent = "SAVE FAILED"; FW.dirty = true; clearTimeout(FW.saveTimer); FW.saveTimer = setTimeout(saveForm, 5000); }
}
window.addEventListener("beforeunload", () => { if (FW && FW.dirty) saveForm(); });

/* ---------- builder ---------- */
const QTYPES = [["short", "Short answer"], ["para", "Paragraph"], ["choice", "Multiple choice"], ["check", "Checkboxes"], ["drop", "Dropdown"], ["scale", "Linear scale"], ["date", "Date"]];
const QTYPE_LBL = Object.fromEntries(QTYPES);

function renderBuilder() {
  const f = FW.form, sc = FW.schema;
  let html = `<div class="setgrid">
    <div><label>Form title</label><input id="bTitle" value="${esc(f.title)}" maxlength="300" style="width:100%"></div>
    <div><label>Description (shown to respondents)</label><input id="bDesc" value="${esc(f.description)}" maxlength="2000" style="width:100%"></div>
    <div><label>Submission limit (0 = unlimited)</label><input id="bCap" type="number" min="0" value="${f.cap}" style="width:120px"></div>
    <div><label>Respondents</label><label class="ck"><input type="checkbox" id="bAllowEdit" ${f.allowEdit ? "checked" : ""}> Allow respondents to edit their submission (while open)</label></div>
    <div><label>Accepting responses until (optional)</label><input id="bDeadline" type="datetime-local" value="${dlLocal(FW.closesAt)}"><div style="font:400 11.5px var(--ks-ui);color:var(--ks-fg-muted);margin-top:4px">Your local time. Past the deadline the form closes automatically, enforced on the backend.</div></div>
    <div><label>Respondent identity</label><div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="bAskName"><option value="off" ${(sc.askName || "off") === "off" ? "selected" : ""}>No name field</option><option value="optional" ${sc.askName === "optional" ? "selected" : ""}>Name optional</option><option value="required" ${sc.askName === "required" ? "selected" : ""}>Name required</option></select>
      <select id="bAskEmail"><option value="off" ${(sc.askEmail || "off") === "off" ? "selected" : ""}>No email field</option><option value="optional" ${sc.askEmail === "optional" ? "selected" : ""}>Email optional</option><option value="required" ${sc.askEmail === "required" ? "selected" : ""}>Email required</option></select>
    </div><div style="font:400 11.5px var(--ks-ui);color:var(--ks-fg-muted);margin-top:4px">Self-declared, shown in the review table. Submissions stay anonymous when off.</div></div>
  </div>`;
  sc.sections.forEach((s, si) => {
    html += `<div class="sect" data-si="${si}">
      <div class="shead">
        <span class="sno">Section ${si + 1} of ${sc.sections.length}</span>
        <input placeholder="Section title (optional)" value="${esc(s.title)}" data-act="stitle">
        ${sc.sections.length > 1 ? `<button class="iconbtn" data-act="sdel" title="Delete section">✕</button>` : ""}
      </div>`;
    s.questions.forEach((q, qi) => { html += questionHtml(q, si, qi, sc); });
    if (!s.questions.length) html += `<div class="q" style="color:var(--ks-fg-muted);font-family:var(--ks-ui);font-size:14px">No questions in this section yet.</div>`;
    html += `<div class="q" style="border-top:1px dashed var(--ks-rule);border-bottom:none"><button class="linkbtn" data-act="qadd">+ ADD QUESTION</button></div>`;
    html += `</div>`;
  });
  html += `<div class="addrow"><button class="pill outline sm" id="addSection">+ ADD SECTION</button></div>`;
  $("tabBuild").innerHTML = html;
  bindBuilder();
}

function routeOptions(sc, si) {
  let o = `<option value="n">→ Continue to next section</option>`;
  sc.sections.forEach((s, i) => { if (i !== si) o += `<option value="${s.id}">→ Go to section ${i + 1}${s.title ? " · " + esc(s.title) : ""}</option>`; });
  o += `<option value="s">→ Submit form</option>`;
  return o;
}

function questionHtml(q, si, qi, sc) {
  const branchable = q.type === "choice" || q.type === "drop";
  let body = "";
  if (["choice", "check", "drop"].includes(q.type)) {
    body = q.opts.map((o, oi) => `<div class="optline" data-oi="${oi}">
      <span style="font:400 12px var(--ks-mono);color:var(--ks-fg-muted)">${q.type === "check" ? "☐" : q.type === "drop" ? (oi + 1) + "." : "○"}</span>
      <input value="${esc(o)}" data-act="opt" placeholder="Option ${oi + 1}">
      ${branchable ? `<select data-act="route">${routeOptions(sc, si).replace(`value="${esc(String((q.routes || {})[oi] ?? "n"))}"`, `value="${esc(String((q.routes || {})[oi] ?? "n"))}" selected`)}</select>` : ""}
      <button class="iconbtn" data-act="odel" title="Remove option">✕</button>
    </div>`).join("") + `<div class="optline"><button class="linkbtn" data-act="oadd">+ OPTION</button></div>`;
  } else if (q.type === "scale") {
    body = `<div class="scalerow">
      <span>From</span><input type="number" data-act="min" value="${q.min ?? 1}" min="0" max="1"><input type="text" data-act="minL" placeholder="Low label" value="${esc(q.minL || "")}">
      <span>to</span><input type="number" data-act="max" value="${q.max ?? 5}" min="2" max="10"><input type="text" data-act="maxL" placeholder="High label" value="${esc(q.maxL || "")}">
    </div>`;
  } else if (q.type === "date") {
    body = `<div class="scalerow">Respondents pick a calendar date.</div>`;
  } else {
    body = `<div class="scalerow">${q.type === "short" ? "Single-line text answer." : "Multi-line text answer."}</div>`;
  }
  return `<div class="q" data-si="${si}" data-qi="${qi}">
    <div class="qrow">
      <input class="qtitle" placeholder="Question" value="${esc(q.title)}" data-act="qtitle">
      <select class="qtype" data-act="qtype">${QTYPES.map(([v, l]) => `<option value="${v}" ${q.type === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    </div>
    ${body}
    <div class="qfoot">
      <label><input type="checkbox" data-act="req" ${q.req ? "checked" : ""}> Required</label>
      <span style="flex:1"></span>
      <button class="iconbtn" data-act="qup" title="Move up">↑</button>
      <button class="iconbtn" data-act="qdown" title="Move down">↓</button>
      <button class="iconbtn" data-act="qdup" title="Duplicate question">⧉</button>
      <button class="iconbtn" data-act="qdel" title="Delete question">✕</button>
    </div>
  </div>`;
}

function dlLocal(ns) {
  if (!ns || Number(ns) === 0) return "";
  const d = new Date(Number(BigInt(ns) / 1000000n));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function bindBuilder() {
  const sc = FW.schema, f = FW.form;
  $("bTitle").oninput = (e) => { f.title = e.target.value; $("fwTitle").textContent = f.title; markDirty(); };
  $("bDesc").oninput = (e) => { f.description = e.target.value; markDirty(); };
  $("bCap").oninput = (e) => { f.cap = Math.max(0, Number(e.target.value) || 0); markDirty(); };
  $("bAllowEdit").onchange = (e) => { f.allowEdit = e.target.checked; markDirty(); };
  $("bDeadline").onchange = async (e) => {
    const v = e.target.value;
    const ns = v ? BigInt(new Date(v).getTime()) * 1000000n : 0n;
    const a = backend;
    if ((await a.setDeadline(hubTok, f.id, ns)).ok) { FW.closesAt = ns; toast(ns ? "Deadline set" : "Deadline removed"); }
    else toast("Could not set the deadline");
  };
  $("bAskName").onchange = (e) => { sc.askName = e.target.value; markDirty(); };
  $("bAskEmail").onchange = (e) => { sc.askEmail = e.target.value; markDirty(); };
  $("addSection").onclick = () => { sc.sections.push({ id: maxSid(sc) + 1, title: "", desc: "", questions: [] }); markDirty(); renderBuilder(); };

  $("tabBuild").querySelectorAll(".sect").forEach((sectEl) => {
    const si = Number(sectEl.dataset.si);
    const s = sc.sections[si];
    sectEl.querySelector('[data-act="stitle"]').oninput = (e) => { s.title = e.target.value; markDirty(); };
    const sdel = sectEl.querySelector('[data-act="sdel"]');
    if (sdel) sdel.onclick = () => confirmBox(`Delete section ${si + 1}${s.questions.length ? " and its " + s.questions.length + " question(s)" : ""}?`, () => { sc.sections.splice(si, 1); markDirty(); renderBuilder(); });
    sectEl.querySelector('[data-act="qadd"]').onclick = () => {
      s.questions.push({ id: FW.nextQid++, type: "choice", title: "", desc: "", req: false, opts: ["Option 1"], routes: {} });
      markDirty(); renderBuilder();
    };
    sectEl.querySelectorAll(".q[data-qi]").forEach((qEl) => {
      const qi = Number(qEl.dataset.qi);
      const q = s.questions[qi];
      const on = (sel, fn) => { const el = qEl.querySelector(sel); if (el) fn(el); };
      on('[data-act="qtitle"]', (el) => { el.oninput = (e) => { q.title = e.target.value; markDirty(); }; });
      on('[data-act="qtype"]', (el) => {
        el.onchange = (e) => {
          q.type = e.target.value;
          if (["choice", "check", "drop"].includes(q.type) && !Array.isArray(q.opts)) q.opts = ["Option 1"];
          if (!["choice", "drop"].includes(q.type)) q.routes = {};
          if (q.type === "scale") { q.min = q.min ?? 1; q.max = q.max ?? 5; }
          markDirty(); renderBuilder();
        };
      });
      on('[data-act="req"]', (el) => { el.onchange = (e) => { q.req = e.target.checked; markDirty(); }; });
      on('[data-act="qdel"]', (el) => { el.onclick = () => { s.questions.splice(qi, 1); markDirty(); renderBuilder(); }; });
      on('[data-act="qdup"]', (el) => { el.onclick = () => { const copy = JSON.parse(JSON.stringify(q)); copy.id = FW.nextQid++; s.questions.splice(qi + 1, 0, copy); markDirty(); renderBuilder(); }; });
      on('[data-act="qup"]', (el) => { el.onclick = () => { if (qi > 0) { [s.questions[qi - 1], s.questions[qi]] = [s.questions[qi], s.questions[qi - 1]]; markDirty(); renderBuilder(); } }; });
      on('[data-act="qdown"]', (el) => { el.onclick = () => { if (qi < s.questions.length - 1) { [s.questions[qi + 1], s.questions[qi]] = [s.questions[qi], s.questions[qi + 1]]; markDirty(); renderBuilder(); } }; });
      on('[data-act="oadd"]', (el) => { el.onclick = () => { q.opts.push("Option " + (q.opts.length + 1)); markDirty(); renderBuilder(); }; });
      on('[data-act="min"]', (el) => { el.oninput = (e) => { q.min = Number(e.target.value) || 0; markDirty(); }; });
      on('[data-act="max"]', (el) => { el.oninput = (e) => { q.max = Number(e.target.value) || 5; markDirty(); }; });
      on('[data-act="minL"]', (el) => { el.oninput = (e) => { q.minL = e.target.value; markDirty(); }; });
      on('[data-act="maxL"]', (el) => { el.oninput = (e) => { q.maxL = e.target.value; markDirty(); }; });
      qEl.querySelectorAll(".optline[data-oi]").forEach((ol) => {
        const oi = Number(ol.dataset.oi);
        const oin = ol.querySelector('[data-act="opt"]'); if (oin) oin.oninput = (e) => { q.opts[oi] = e.target.value; markDirty(); };
        const odel = ol.querySelector('[data-act="odel"]'); if (odel) odel.onclick = () => { q.opts.splice(oi, 1); if (q.routes) delete q.routes[oi]; markDirty(); renderBuilder(); };
        const rsel = ol.querySelector('[data-act="route"]');
        if (rsel) { rsel.value = String((q.routes || {})[oi] ?? "n"); rsel.onchange = (e) => { q.routes = q.routes || {}; if (e.target.value === "n") delete q.routes[oi]; else q.routes[oi] = e.target.value === "s" ? "s" : Number(e.target.value); markDirty(); }; }
      });
    });
  });
}

/* ---------- submissions ---------- */
async function loadSubs() {
  const a = backend;
  FW.subs = await a.listSubmissions(hubTok, FW.form.id);
  FW.subs.sort((x, y) => Number(y.submittedAt - x.submittedAt));
  $("tabSubCount").textContent = FW.subs.length ? "· " + FW.subs.length : "";
}
let subFilter = "all";
// people are ids (forms 0.2.0): every SubView carries people = [(id, address, name)] for the ids it mentions
function personName(s) { const m = new Map((s.people || []).map(([id, e, n]) => [id, n || e || id])); return (pid) => (!pid ? "" : m.get(pid) || (me && me.id === pid ? me.displayName : pid.startsWith("legacy:") ? pid.slice(7) : pid)); }
function personEmail(s) { const m = new Map((s.people || []).map(([id, e]) => [id, e || ""])); return (pid) => (!pid ? "" : m.get(pid) ?? (me && me.id === pid ? me.email : pid.startsWith("legacy:") ? pid.slice(7) : pid)); }
function avgRating(s) { if (!s.reviews.length) return null; return s.reviews.reduce((a, r) => a + Number(r.rating), 0) / s.reviews.length; }

function renderSubs() {
  const subs = FW.subs || [];
  const counts = { all: subs.length, received: 0, inReview: 0, accepted: 0, declined: 0 };
  subs.forEach((s) => counts[vKey(s.status)]++);
  const list = subFilter === "all" ? subs : subs.filter((s) => vKey(s.status) === subFilter);
  let html = `<div class="filters">` +
    ["all", "received", "inReview", "accepted", "declined"].map((k) =>
      `<span class="tag ${k === "all" ? "" : k} clickable ${subFilter === k ? "sel" : ""}" data-f="${k}">${k === "all" ? "" : '<span class="dot"></span>'}${k === "all" ? "ALL" : SUBSTATUS_LBL[k]} · ${counts[k]}</span>`).join("") +
    `<span style="flex:1"></span><button class="linkbtn" id="csvBtn">EXPORT CSV</button><button class="linkbtn" id="reloadSubs">RELOAD</button></div>`;
  if (!list.length) html += `<div class="empty">No submissions ${subFilter === "all" ? "yet — share the public link once the form is open." : "with this status."}</div>`;
  else {
    html += `<div style="overflow-x:auto"><table class="subtable"><thead><tr><th>#</th><th>Submitted</th><th>Respondent</th><th>Status</th><th>Rating</th><th>Assignee</th><th>Notes</th></tr></thead><tbody>` +
      list.map((s) => {
        const av = avgRating(s);
        return `<tr class="rowlink" data-id="${s.id}">
          <td>${s.num}</td><td style="white-space:nowrap">${fmtD(s.submittedAt)}</td>
          <td>${esc(s.submitterName || s.submitterEmail || "anonymous")}</td>
          <td><span class="tag ${vKey(s.status)}"><span class="dot"></span>${SUBSTATUS_LBL[vKey(s.status)]}</span></td>
          <td>${av ? "★ " + av.toFixed(1) : "—"}</td>
          <td>${esc(s.assignee ? (s.assigneeName || s.assignee.split("@")[0]) : "—")}</td>
          <td>${s.notes.length || "—"}</td></tr>`;
      }).join("") + `</tbody></table></div>`;
  }
  $("tabSubs").innerHTML = html;
  $("tabSubs").querySelectorAll(".filters .tag").forEach((t) => { t.onclick = () => { subFilter = t.dataset.f; renderSubs(); }; });
  $("csvBtn").onclick = exportCsv;
  $("reloadSubs").onclick = async () => { await loadSubs(); renderSubs(); };
  $("tabSubs").querySelectorAll("tr.rowlink").forEach((r) => { r.onclick = () => openDrawer(Number(r.dataset.id)); });
}

function allQuestions() {
  const out = [];
  FW.schema.sections.forEach((s, si) => s.questions.forEach((q) => out.push({ ...q, section: si + 1 })));
  return out;
}
function fmtAnswer(q, v) {
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return null;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function openDrawer(subId) {
  const s = (FW.subs || []).find((x) => Number(x.id) === subId);
  if (!s) return;
  $("dTitle").textContent = "Submission #" + s.num;
  let A = {};
  try { A = JSON.parse(s.answers) || {}; } catch (_) {}
  const qs = allQuestions();
  const myRating = s.reviews.find((r) => r.reviewer === me.id); // people are ids (forms 0.2.0)
  const who = personName(s);
  const ro = FW.myRole === "viewer"; // read-only drawer for viewers
  let html = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">` +
    ["received", "inReview", "accepted", "declined"].map((k) =>
      `<span class="tag ${k} ${ro ? "" : "clickable"} ${vKey(s.status) === k ? "sel" : ""}" data-st="${k}"><span class="dot"></span>${SUBSTATUS_LBL[k]}</span>`).join("") + `</div>
    <div style="font:400 12px var(--ks-mono);color:var(--ks-fg-muted);margin-bottom:18px">${fmtD(s.submittedAt)}${Number(s.updatedAt) !== Number(s.submittedAt) ? " · edited " + fmtD(s.updatedAt) : ""}${s.submitterName || s.submitterEmail ? " · " + esc([s.submitterName, s.submitterEmail].filter(Boolean).join(" · ")) : " · anonymous"}</div>`;
  html += qs.map((q) => {
    const v = fmtAnswer(q, A[q.id]);
    return `<div class="ansitem"><div class="al">${esc(q.title || "Question " + q.id)}</div><div class="av ${v === null ? "muted" : ""}">${v === null ? "no answer" : esc(v)}</div></div>`;
  }).join("");
  html += `<div class="dsec">Review</div>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-family:var(--ks-ui);font-size:14px">
      <span>Your rating:</span><span class="stars ${ro ? "ro" : ""}" id="dStars">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" ${ro ? "disabled" : ""} class="${myRating && Number(myRating.rating) >= n ? "on" : ""}">★</button>`).join("")}</span>
      ${s.reviews.length ? `<span style="color:var(--ks-fg-muted)">team avg ★ ${avgRating(s).toFixed(1)} (${s.reviews.length})</span>` : ""}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:14px;font-family:var(--ks-ui);font-size:14px;flex-wrap:wrap">
      <span>Assignee:</span>
      <b>${s.assignee ? esc(s.assigneeName || s.assignee) : "—"}</b>
      ${ro ? "" : `<span class="pick" style="flex:1;min-width:200px"><input id="dAssignIn" placeholder="pick a colleague…" autocomplete="off" style="width:100%"><div class="list hidden" id="dAssignList"></div></span>${s.assignee ? `<button class="linkbtn" id="dUnassign">UNASSIGN</button>` : ""}`}
    </div>`;
  html += `<div class="dsec">Notes (internal — respondents never see these)</div>` +
    s.notes.map((n) => `<div class="noteitem"><div class="nh">${esc(who(n.author))} · ${fmtD(n.at)}</div>${esc(n.text)}</div>`).join("") +
    (ro ? "" : `<div class="notebox"><input id="dNote" placeholder="Add a note for the team" maxlength="2000"><button class="pill primary sm" id="dNoteAdd">Add</button></div>`) +
    (FW.myRole === "owner" ? `<div style="margin-top:30px"><button class="linkbtn" id="dDelete">DELETE SUBMISSION</button></div>` : "");
  $("dBody").innerHTML = html;
  $("subDrawer").classList.add("on");

  if (!ro) {
    $("dBody").querySelectorAll(".tag[data-st]").forEach((t) => {
      t.onclick = async () => {
        const a = backend;
        if ((await a.setSubmissionStatus(hubTok, s.id, { [t.dataset.st]: null })).ok) { await loadSubs(); renderSubs(); openDrawer(subId); }
      };
    });
    $("dStars").querySelectorAll("button").forEach((b) => {
      b.onclick = async () => {
        const a = backend;
        if ((await a.rateSubmission(hubTok, s.id, BigInt(b.dataset.n))).ok) { await loadSubs(); renderSubs(); openDrawer(subId); }
      };
    });
    const assignTo = async (email) => {
      const a = backend;
      const r = await a.assignSubmission(hubTok, s.id, email);
      if (r.ok) { await loadSubs(); renderSubs(); openDrawer(subId); toast(email ? "Assigned" : "Unassigned"); } else toast(r.detail || "Could not assign");
    };
    attachPicker("dAssignIn", "dAssignList", (email) => assignTo(email));
    const un = $("dUnassign"); if (un) un.onclick = () => assignTo("");
    $("dNoteAdd").onclick = async () => {
      const txt = $("dNote").value.trim();
      if (!txt) return;
      const a = backend;
      if ((await a.addNote(hubTok, s.id, txt)).ok) { await loadSubs(); openDrawer(subId); }
    };
    $("dNote").onkeydown = (e) => { if (e.key === "Enter") $("dNoteAdd").click(); };
  }
  const dDel = $("dDelete");
  if (dDel) dDel.onclick = () => confirmBox("Delete this submission permanently?", async () => {
    const a = backend;
    if ((await a.deleteSubmission(hubTok, s.id)).ok) { $("subDrawer").classList.remove("on"); await loadSubs(); renderSubs(); toast("Submission deleted"); }
    else toast("Only the form owner can delete submissions");
  });
}
$("dClose").onclick = () => $("subDrawer").classList.remove("on");

function exportCsv() {
  const qs = allQuestions();
  // Quote CSV + defuse spreadsheet formula injection: anonymous respondents
  // control these cells, and Excel/Sheets execute leading =+-@ as formulas.
  const cq = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ["num", "submitted_at", "updated_at", "name", "email", "status", "assignee", "avg_rating", "ratings", "notes", ...qs.map((q) => q.title || "q" + q.id)];
  const rows = (FW.subs || []).slice().sort((a, b) => Number(a.num - b.num)).map((s) => {
    let A = {}; try { A = JSON.parse(s.answers) || {}; } catch (_) {}
    const av = avgRating(s);
    return [s.num, new Date(Number(s.submittedAt / 1000000n)).toISOString(), new Date(Number(s.updatedAt / 1000000n)).toISOString(),
      s.submitterName, s.submitterEmail, vKey(s.status), personEmail(s)(s.assignee), av ? av.toFixed(2) : "",
      s.reviews.map((r) => personEmail(s)(r.reviewer) + ":" + r.rating).join("; "),
      s.notes.map((n) => personEmail(s)(n.author) + ": " + n.text).join(" | "),
      ...qs.map((q) => fmtAnswer(q, A[q.id]) ?? "")];
  });
  const csv = [head, ...rows].map((r) => r.map(cq).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const aEl = document.createElement("a");
  aEl.href = URL.createObjectURL(blob);
  aEl.download = (FW.form.title || "form").replace(/[^\w-]+/g, "-").toLowerCase() + "-submissions.csv";
  aEl.click();
  setTimeout(() => URL.revokeObjectURL(aEl.href), 4000);
}

/* ---------- insights ---------- */
function renderInsights() {
  const subs = FW.subs || [];
  const qs = allQuestions();
  const answered = subs.map((s) => { try { return JSON.parse(s.answers) || {}; } catch (_) { return {}; } });
  let html = `<div class="setgrid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
    <div><label>Total</label><div style="font-family:var(--ks-display);font-size:34px">${subs.length}</div></div>
    ${["received", "inReview", "accepted", "declined"].map((k) => `<div><label>${SUBSTATUS_LBL[k]}</label><div style="font-family:var(--ks-display);font-size:34px">${subs.filter((s) => vKey(s.status) === k).length}</div></div>`).join("")}
  </div>`;
  if (!subs.length) html += `<div class="empty">Charts appear as soon as the first submission lands.</div>`;
  qs.forEach((q) => {
    const vals = answered.map((A) => A[q.id]).filter((v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length));
    if (!subs.length) return;
    let inner = "";
    if (["choice", "drop", "check"].includes(q.type)) {
      const counts = {};
      (q.opts || []).forEach((o) => (counts[o] = 0));
      vals.forEach((v) => (Array.isArray(v) ? v : [v]).forEach((x) => { counts[x] = (counts[x] || 0) + 1; }));
      const max = Math.max(1, ...Object.values(counts));
      inner = Object.entries(counts).map(([o, n]) => `<div class="bar"><span class="bl" title="${esc(o)}">${esc(o)}</span><span class="bt"><i style="width:${(n / max) * 100}%"></i></span><span class="bn">${n}</span></div>`).join("");
    } else if (q.type === "scale") {
      const lo = q.min ?? 1, hi = q.max ?? 5;
      const counts = {};
      for (let i = lo; i <= hi; i++) counts[i] = 0;
      let sum = 0;
      vals.forEach((v) => { const n = Number(v); if (counts[n] !== undefined) counts[n]++; sum += n; });
      const max = Math.max(1, ...Object.values(counts));
      inner = Object.entries(counts).map(([o, n]) => `<div class="bar"><span class="bl">${esc(o)}</span><span class="bt"><i style="width:${(n / max) * 100}%"></i></span><span class="bn">${n}</span></div>`).join("") +
        (vals.length ? `<div style="font:400 12px var(--ks-mono);color:var(--ks-fg-muted);margin-top:8px">average ${(sum / vals.length).toFixed(2)}</div>` : "");
    } else {
      inner = vals.slice(0, 30).map((v) => `<div class="textans">${esc(String(v))}</div>`).join("") + (vals.length > 30 ? `<div style="font:400 12px var(--ks-mono);color:var(--ks-fg-muted)">…and ${vals.length - 30} more (see CSV)</div>` : "");
    }
    html += `<div class="insq"><h4>${esc(q.title || "Question " + q.id)} <span style="color:var(--ks-fg-muted);font-weight:400">· ${vals.length} answer${vals.length === 1 ? "" : "s"}</span></h4>${inner || '<div style="font:400 13px var(--ks-ui);color:var(--ks-fg-muted)">No answers yet.</div>'}</div>`;
  });
  $("tabInsights").innerHTML = html;
}

/* ============================== public fill ============================== */
let FILL = null; // { slug, meta, schema, pageIdx, hist, A, editToken, editing }

async function enterFill(slug, urlTok, isPreview) {
  show("viewFill");
  const w = $("fillWrap");
  w.innerHTML = `<div class="notice">Loading form…</div>`;
  if (isPreview) {
    if (!hubSignedIn()) { w.innerHTML = `<div class="notice">Previews are internal. Sign in through your hub, then open the preview from the form workspace again.</div>`; return; }
    let pv = null;
    try { pv = opt(await backend.previewForm(hubTok, slug)); }
    catch (e) { w.innerHTML = `<div class="notice">Could not reach the backend. ${esc(String(e).slice(0, 120))}</div>`; return; }
    if (!pv) { w.innerHTML = `<div class="notice">This form does not exist (or is not shared with you).</div>`; return; }
    let schema;
    try { schema = JSON.parse(pv.schema); } catch (_) { schema = { sections: [] }; }
    FILL = { slug, meta: { title: pv.title, description: pv.description, allowEdit: pv.allowEdit, open: true }, schema, pageIdx: 0, hist: [], A: {}, editToken: null, editing: false, preview: { id: pv.id, status: vKey(pv.status), myRole: pv.myRole } };
    renderFillPage();
    return;
  }
  let meta = null;
  try { meta = opt(await backend.publicForm(slug)); }
  catch (e) { w.innerHTML = `<div class="notice">Could not reach the backend. ${esc(String(e).slice(0, 120))}</div>`; return; }
  if (!meta) { w.innerHTML = `<div class="notice">This form does not exist (or is still a draft).</div>`; return; }
  let schema;
  try { schema = JSON.parse(meta.schema); } catch (_) { schema = { sections: [] }; }
  FILL = { slug, meta, schema, pageIdx: 0, hist: [], A: {}, editToken: null, editing: false, preview: null };

  // edit lane: token from URL or a previous submission on this device
  const stored = localStorage.getItem("ks-forms-sub-" + slug);
  const tok = urlTok || stored;
  if (tok && meta.allowEdit) {
    try {
      const mine = opt(await backend.mySubmission(slug, tok));
      if (mine) {
        FILL.editToken = tok;
        FILL.editing = true;
        try { FILL.A = JSON.parse(mine.answers) || {}; } catch (_) {}
        if (!mine.updatable) { renderClosed(`You already submitted (#${mine.num}). This form no longer accepts changes.`); return; }
      }
    } catch (_) {}
  }
  if (!meta.open) {
    const past = meta.closesAt && Number(meta.closesAt) > 0 && BigInt(Date.now()) * 1000000n > meta.closesAt;
    renderClosed(meta.capReached ? "This form has reached its submission limit."
      : past ? "The response deadline (" + fmtD(meta.closesAt) + ") has passed."
      : "This form is not accepting submissions right now.");
    return;
  }
  renderFillPage();
}

function renderClosed(msg) {
  $("fillWrap").innerHTML = `<div class="fillhead"><h2>${esc(FILL.meta.title)}</h2>${FILL.meta.description ? `<p>${esc(FILL.meta.description)}</p>` : ""}</div><div class="notice">${esc(msg)}</div>`;
}

function visibleSections() { return FILL.schema.sections || []; }

/* ---------- preview mode ---------- */
const PV_STATUS = {
  draft: "DRAFT · respondents can't see this yet",
  open: "OPEN · the public link is live",
  closed: "CLOSED · not accepting submissions",
};
function previewBannerHtml() {
  if (!FILL.preview) return "";
  const p = FILL.preview;
  const canPublish = p.myRole !== "viewer" && p.status !== "open";
  return `<div style="border:1px solid var(--ks-rule-strong); border-left:3px solid var(--ks-accent); border-radius:var(--ks-radius-card); background:var(--ks-bg-sunk); padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap">
    <span style="font:500 11px var(--ks-mono); letter-spacing:.1em">PREVIEW · ${esc(PV_STATUS[p.status] || p.status.toUpperCase())}</span>
    <span style="font:400 13px var(--ks-ui); color:var(--ks-fg-secondary)">Nothing you enter here is saved.</span>
    <span style="flex:1"></span>
    ${canPublish ? `<button class="pill primary sm" id="pvPublish">Publish</button>` : ""}
    ${p.status === "open" ? `<button class="pill outline sm" id="pvCopy">COPY PUBLIC LINK</button>` : ""}
    <button class="pill outline sm" id="pvBack">BACK TO EDITOR</button>
  </div>`;
}
function bindPreviewBanner(rerender) {
  if (!FILL.preview) return;
  const p = FILL.preview;
  const back = $("pvBack");
  if (back) back.onclick = () => { location.hash = `#/form/${p.id}/build`; };
  const cp = $("pvCopy");
  if (cp) cp.onclick = () => navigator.clipboard.writeText(fillUrl(FILL.slug)).then(() => toast("Public link copied"));
  const pub = $("pvPublish");
  if (pub) pub.onclick = async () => {
    pub.disabled = true;
    const a = backend;
    const ok = (await a.setFormStatus(hubTok, p.id, { open: null })).ok;
    if (ok) { p.status = "open"; toast("Form is live — the public link works now"); rerender(); }
    else { pub.disabled = false; toast("Could not publish (editor access needed)"); }
  };
}
function renderPreviewDone() {
  $("fillWrap").innerHTML = previewBannerHtml() + `<div class="fillhead"><h2>End of preview.</h2>
    <p>The form behaves exactly like this for respondents. Nothing was submitted.</p></div>
    <div style="margin-top:20px; display:flex; gap:12px; flex-wrap:wrap"><button class="pill outline sm" id="pvRestart">RESTART PREVIEW</button></div>`;
  bindPreviewBanner(renderPreviewDone);
  $("pvRestart").onclick = () => { FILL.A = {}; FILL.hist = []; FILL.pageIdx = 0; renderFillPage(); };
}

function renderFillPage() {
  const secs = visibleSections();
  if (!secs.length) { renderClosed("This form has no questions yet."); return; }
  const si = FILL.pageIdx;
  const s = secs[si];
  const w = $("fillWrap");
  let html = previewBannerHtml();
  if (si === 0) html += `<div class="fillhead"><h2>${esc(FILL.meta.title)}</h2>${FILL.meta.description ? `<p>${esc(FILL.meta.description)}</p>` : ""}${FILL.meta.closesAt && Number(FILL.meta.closesAt) > 0 ? `<p style="font:500 11px var(--ks-mono);letter-spacing:.08em;color:var(--ks-fg-muted);margin-top:12px">ACCEPTING RESPONSES UNTIL ${fmtD(FILL.meta.closesAt)}</p>` : ""}${FILL.editing ? `<p style="color:var(--ks-accent);font-family:var(--ks-ui);font-size:14px;margin-top:12px">You are editing your previous submission.</p>` : ""}</div>`;
  const askN = FILL.schema.askName || "off", askE = FILL.schema.askEmail || "off";
  if (si === 0 && !FILL.editing && (askN !== "off" || askE !== "off")) {
    html += `<div class="fq" id="idCard">
      <div class="ft">About you${askN === "required" || askE === "required" ? ' <span class="req">*</span>' : ""}</div>
      <div class="fbody" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        ${askN !== "off" ? `<input type="text" id="idName" placeholder="Your name${askN === "optional" ? " (optional)" : ""}" maxlength="200" value="${esc(FILL.idName || "")}">` : ""}
        ${askE !== "off" ? `<input type="text" id="idEmail" placeholder="Your email${askE === "optional" ? " (optional)" : ""}" maxlength="200" value="${esc(FILL.idEmail || "")}">` : ""}
      </div>
      <div class="errmsg">Please fill in your details (with a valid email address).</div>
    </div>`;
  }
  if (s.title) html += `<div class="fillhead" style="border-top-width:2px;padding:18px 28px"><h2 style="font-size:24px">${esc(s.title)}</h2></div>`;
  s.questions.forEach((q) => { html += fillQuestionHtml(q); });
  if (!s.questions.length) html += `<div class="notice">Nothing to answer in this section.</div>`;
  html += `<div class="fillnav">
    ${FILL.hist.length ? `<button class="pill outline sm" id="fBack">← Back</button>` : ""}
    <span class="spacer"></span>
    <span class="progress">SECTION ${si + 1} / ${secs.length}</span>
    <button class="pill primary" id="fNext">${nextTarget(s) === "s" ? (FILL.preview ? "FINISH PREVIEW" : FILL.editing ? "SAVE CHANGES" : "SUBMIT") : "NEXT →"}</button>
  </div>
  <div style="margin-top:26px;font:400 11px var(--ks-mono);letter-spacing:.06em;color:var(--ks-fg-muted)">ANONYMOUS SUBMISSION · NOTHING BUT YOUR ANSWERS IS STORED</div>`;
  w.innerHTML = html;
  bindFillPage(s);
  bindPreviewBanner(renderFillPage);
  window.scrollTo(0, 0);
}

function fillQuestionHtml(q) {
  const v = FILL.A[q.id];
  let body = "";
  if (q.type === "short") body = `<input style="width:100%" data-q="${q.id}" maxlength="1000" value="${esc(v || "")}">`;
  else if (q.type === "para") body = `<textarea style="width:100%" data-q="${q.id}" maxlength="10000">${esc(v || "")}</textarea>`;
  else if (q.type === "date") body = `<input type="date" data-q="${q.id}" value="${esc(v || "")}">`;
  else if (q.type === "drop") body = `<select data-q="${q.id}" style="min-width:min(320px,100%)"><option value="">— choose —</option>${(q.opts || []).map((o) => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else if (q.type === "choice") body = (q.opts || []).map((o, i) => `<label class="opt-item"><input type="radio" name="q${q.id}" value="${esc(o)}" ${v === o ? "checked" : ""}> ${esc(o)}</label>`).join("");
  else if (q.type === "check") body = (q.opts || []).map((o) => `<label class="opt-item"><input type="checkbox" name="q${q.id}" value="${esc(o)}" ${Array.isArray(v) && v.includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("");
  else if (q.type === "scale") {
    const lo = q.min ?? 1, hi = Math.min(10, Math.max(lo + 1, q.max ?? 5));
    let btns = "";
    for (let i = lo; i <= hi; i++) btns += `<button class="scale-btn ${Number(v) === i ? "sel" : ""}" data-q="${q.id}" data-v="${i}">${i}</button>`;
    body = `<div class="scale-wrap">${q.minL ? `<span class="sl">${esc(q.minL)}</span>` : ""}${btns}${q.maxL ? `<span class="sl">${esc(q.maxL)}</span>` : ""}</div>`;
  }
  return `<div class="fq" data-fq="${q.id}">
    <div class="ft">${esc(q.title || "Untitled question")}${q.req ? ' <span class="req">*</span>' : ""}</div>
    ${q.desc ? `<div class="fd">${esc(q.desc)}</div>` : ""}
    <div class="fbody">${body}</div>
    <div class="errmsg">This question is required.</div>
  </div>`;
}

function bindFillPage(s) {
  const w = $("fillWrap");
  w.querySelectorAll("input[data-q],textarea[data-q],select[data-q]").forEach((el) => {
    if (el.type === "radio") return;
    el.oninput = () => { FILL.A[Number(el.dataset.q)] = el.value; };
  });
  s.questions.forEach((q) => {
    if (q.type === "choice") w.querySelectorAll(`input[name="q${q.id}"]`).forEach((r) => { r.onchange = () => { FILL.A[q.id] = r.value; }; });
    if (q.type === "check") w.querySelectorAll(`input[name="q${q.id}"]`).forEach((c) => {
      c.onchange = () => { FILL.A[q.id] = [...w.querySelectorAll(`input[name="q${q.id}"]:checked`)].map((x) => x.value); };
    });
  });
  w.querySelectorAll(".scale-btn").forEach((b) => {
    b.onclick = () => {
      FILL.A[Number(b.dataset.q)] = Number(b.dataset.v);
      w.querySelectorAll(`.scale-btn[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.toggle("sel", x === b));
    };
  });
  const idn = $("idName"); if (idn) idn.oninput = () => { FILL.idName = idn.value; };
  const ide = $("idEmail"); if (ide) ide.oninput = () => { FILL.idEmail = ide.value; };
  const back = $("fBack");
  if (back) back.onclick = () => { FILL.pageIdx = FILL.hist.pop(); renderFillPage(); };
  $("fNext").onclick = () => {
    const idOk = validateIdentity();
    const pageOk = validatePage(s);
    if (!idOk || !pageOk) {
      const first = document.querySelector(".fq.err");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const t = nextTarget(s);
    if (t === "s") { doSubmit(); return; }
    FILL.hist.push(FILL.pageIdx);
    FILL.pageIdx = t;
    renderFillPage();
  };
}

function answeredVal(q) {
  const v = FILL.A[q.id];
  if (v === undefined || v === null || v === "") return null;
  if (Array.isArray(v) && !v.length) return null;
  return v;
}
function validateIdentity() {
  const card = $("idCard");
  if (!card) return true;
  const askN = FILL.schema.askName || "off", askE = FILL.schema.askEmail || "off";
  let ok = true;
  if (askN === "required" && !(FILL.idName || "").trim()) ok = false;
  const em = (FILL.idEmail || "").trim();
  if (askE === "required" && !em) ok = false;
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) ok = false;
  card.classList.toggle("err", !ok);
  return ok;
}
function validatePage(s) {
  let ok = true;
  s.questions.forEach((q) => {
    const el = document.querySelector(`.fq[data-fq="${q.id}"]`);
    const bad = q.req && answeredVal(q) === null;
    if (el) el.classList.toggle("err", bad);
    if (bad) ok = false;
  });
  if (!ok) { const first = document.querySelector(".fq.err"); if (first) first.scrollIntoView({ behavior: "smooth", block: "center" }); }
  return ok;
}
/// Google-style branching: the LAST answered choice/dropdown in the section
/// that has a route for the chosen option decides; default = next section.
function nextTarget(s) {
  const secs = visibleSections();
  const si = FILL.pageIdx;
  let target = si + 1 >= secs.length ? "s" : si + 1;
  s.questions.forEach((q) => {
    if ((q.type === "choice" || q.type === "drop") && q.routes) {
      const v = answeredVal(q);
      if (v === null) return;
      const oi = (q.opts || []).indexOf(v);
      const r = q.routes[oi];
      if (r === undefined) return;
      if (r === "s") target = "s";
      else {
        const idx = secs.findIndex((x) => x.id === Number(r));
        if (idx >= 0) target = idx;
      }
    }
  });
  return target;
}

async function doSubmit() {
  if (FILL.preview) { renderPreviewDone(); return; }
  const btn = $("fNext");
  btn.disabled = true; btn.textContent = "SUBMITTING…";
  // answers for every visited-path question only? Keep everything the user answered.
  const payload = JSON.stringify(FILL.A);
  try {
    const a = backend;
    if (FILL.editing && FILL.editToken) {
      const r = await a.updateMySubmission(FILL.slug, FILL.editToken, payload);
      if (!r.ok) { toast(r.detail || "Update failed"); btn.disabled = false; btn.textContent = "SAVE CHANGES"; return; }
      renderDone(null, true);
      return;
    }
    const editToken = FILL.meta.allowEdit ? rndHex(24) : "";
    const r = await a.submitPublic(FILL.slug, (FILL.idName || "").trim().slice(0, 200), (FILL.idEmail || "").trim().slice(0, 200), payload, editToken);
    if (!r.ok) { toast(r.detail || "Submission failed"); btn.disabled = false; btn.textContent = "SUBMIT"; return; }
    if (editToken) { localStorage.setItem("ks-forms-sub-" + FILL.slug, editToken); FILL.editToken = editToken; }
    renderDone(r.num, false);
  } catch (e) { toast("Submission failed: " + String(e).slice(0, 100)); btn.disabled = false; btn.textContent = "SUBMIT"; }
}

function renderDone(num, wasEdit) {
  const editBit = FILL.meta.allowEdit && FILL.editToken
    ? `<p style="margin-top:14px">You can edit your submission while the form stays open — from this device via the same link, or from anywhere with this private edit link:</p>
       <div class="sharebox" style="margin-top:10px"><span class="url">${esc(fillUrl(FILL.slug) + "?e=" + FILL.editToken)}</span><button class="linkbtn" id="copyEdit">Copy</button></div>`
    : "";
  $("fillWrap").innerHTML = `<div class="fillhead"><h2>${wasEdit ? "Changes saved." : "Submission received."}</h2>
    <p>${wasEdit ? "Your submission was updated." : "Thank you — your submission" + (num ? " is #" + num : "") + " and the team can see it now."}</p>${editBit}</div>
    <div style="margin-top:20px"><button class="pill outline sm" id="fillAgain">SUBMIT ANOTHER RESPONSE</button></div>`;
  const ce = $("copyEdit");
  if (ce) ce.onclick = () => navigator.clipboard.writeText(fillUrl(FILL.slug) + "?e=" + FILL.editToken).then(() => toast("Edit link copied"));
  $("fillAgain").onclick = () => { localStorage.removeItem("ks-forms-sub-" + FILL.slug); location.reload(); };
}


/* ============================== settings (admins) ============================== */
async function enterSettings() {
  show("viewSettings");
  const s = opt(await backend.getSettings(session.load())); if (!s) return;
  $("sAppUrl").value = s.appUrl; $("sOrg").value = s.orgName;
  $("sMeta").textContent = `${Number(s.peopleCount)} people from the hub${Number(s.lastDirectoryPull) ? " · synced " + fmtD(s.lastDirectoryPull) : ""} · ${Number(s.adminCount)} admin${Number(s.adminCount) === 1 ? "" : "s"} · ${Number(s.forms)} forms · ${Number(s.submissions)} submissions · ${Number(s.trashed)} in trash`;
  $("sSeed").classList.toggle("hidden", s.demoSeeded); $("sUnseed").classList.toggle("hidden", !s.demoSeeded);
  try { const log = await backend.adminLogRows(session.load()); $("logRows").innerHTML = log.map((r) => `<tr><td class="kv">${esc(fmtD(r.at))}</td><td class="kv">${esc(r.who)}</td><td>${esc(r.what)}</td></tr>`).join("") || '<tr><td colspan="3" class="kv">nothing yet</td></tr>'; } catch (e) {}
}
$("sSave").onclick = async () => {
  setStatus("sStatus", "", "saving…");
  const r = await backend.setSettings(session.load(), { adminGroup: "", appUrl: $("sAppUrl").value.trim(), orgName: $("sOrg").value.trim() });
  setStatus("sStatus", r.ok ? "ok" : "err", r.ok ? "saved" : r.detail);
  await refreshMe(); enterSettings();
};
$("sSync").onclick = async () => { const r = await backend.syncNow(session.load()); setStatus("sStatus", r.ok ? "ok" : "err", r.detail); enterSettings(); };
$("sSeed").onclick = async () => { const r = await backend.seedDemo(session.load()); setStatus("sSeedStatus", r.ok ? "ok" : "err", r.detail); enterSettings(); };
$("sUnseed").onclick = async () => { if (!confirm("Remove the sample form and its submissions?")) return; const r = await backend.removeDemo(session.load()); setStatus("sSeedStatus", r.ok ? "ok" : "err", r.detail); enterSettings(); };
$("settingsBtn").onclick = () => { location.hash = "#/settings"; };
$("docsBtn").onclick = () => { location.hash = "#/docs"; };
$("docsBack").onclick = () => { location.hash = ""; };
$("settingsBack").onclick = () => { location.hash = ""; };

boot().finally(() => signIn.ready()).catch((e) => { console.error(e); setStatus("loginStatus", "err", "Could not load the app. Check your connection and retry from the Hub."); });

// Roles are configured in the Hub; the app exposes no local privilege controls.
for (const link of document.querySelectorAll("[data-hub-permissions-link]")) link.href = HUB_URL.replace(/\/$/, "") + "/#/permissions";
