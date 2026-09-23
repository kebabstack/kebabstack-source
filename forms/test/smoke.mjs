// forms frontend smoke: boots dist/ in jsdom against a scripted fake backend and
// walks dashboard, workspace (build · submissions · insights), sharing, trash,
// settings and docs as admin and member — plus the public fill page as an
// anonymous respondent (no session, no topbar). Catches the blank-page class.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const html = fs.readFileSync("index.html", "utf8").replace('<script type="module" src="./app.js"></script>', "");
const now = BigInt(Date.now()) * 1000000n;
const mode = process.argv[2] || "admin"; // admin | member | public
const role = mode === "member" ? "member" : "admin";
const schema = JSON.stringify({ v: 1, askName: "optional", askEmail: "off", sections: [{ id: 1, title: "About the idea", desc: "", questions: [{ id: 1, type: "short", title: "Name of the idea", req: true }, { id: 2, type: "choice", title: "Who benefits?", opts: ["Customers", "Team"], routes: {}, req: true }, { id: 3, type: "scale", title: "Ready?", min: 1, max: 5, req: false }] }] });
const ANA = "p_00000000000000a1", ME = "p_00000000000000ee"; // forms 0.2.0: people are hub person ids
const form = { id: 1n, slug: "abcdef0123456789", title: "Idea box", description: "Tell us", schema, status: { open: null }, allowEdit: true, cap: 0n, createdBy: ME, createdAt: now, updatedAt: now, nextNum: 3n };
const meta = (over = {}) => ({ id: 1n, slug: form.slug, title: form.title, status: { open: null }, allowEdit: true, cap: 0n, createdBy: ME, createdByName: "Me Myself", createdAt: now, updatedAt: now, subs: 2n, subsReceived: 1n, subsInReview: 0n, subsAccepted: 1n, subsDeclined: 0n, myRole: role === "admin" ? "owner" : "viewer", closesAt: 0n, ...over });
const sub = (id, over = {}) => ({ id: BigInt(id), formId: 1n, num: BigInt(id), answers: JSON.stringify({ 1: "Lunch roulette", 2: "Team", 3: 4 }), submitterName: "Ada", submitterEmail: "", submittedAt: now, updatedAt: now, status: { received: null }, assignee: "", assigneeName: "", reviews: [], notes: [], people: [], ...over });
const calls = [];
globalThis.__fakeBackend = new Proxy({}, { get: (_, m) => async (...a) => {
  calls.push(m);
  switch (m) {
    case "info": return { orgName: "Acme", hubId: "aaaaa-aa", hubSet: true, appUrl: "https://forms.test", version: "0.1.0" };
    case "suiteState": return [{ email: "me@example.com", displayName: "Me Myself", unread: 2n, expiresAt: now + 3600n * 1000000000n, active: true, provider: "suite" }];
    case "myNotifications": return { total: 1n, unread: 1n, slackDm: false, items: [{ id: 3n, email: "me@example.com", fromApp: "forms", title: "New submission #2 · Idea box", url: "https://forms.test/#/form/1/subs", kind: "forms.submission", at: now, read: false, slack: "off" }] };
    case "markNotificationsRead": return 1n;
    case "portalApps": return [{ id: 1n, name: "forms", url: "https://forms.test/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: false }];
    case "myAvatarPortal": case "getCompanyLogo": case "tileIcon": return [];
    case "whoami": return [{ id: ME, email: "me@example.com", displayName: "Me Myself", role, roleSource: "hub owner", orgName: "Acme", hubId: "aaaaa-aa", needsClaim: false }];
    case "loginWithTicket": return [{ token: "t0k", email: "me@example.com", displayName: "Me", role, suiteToken: "su1te" }];
    case "listForms": return [meta(), meta({ id: 2n, slug: "ffffff0123456789", title: "Shared survey", createdBy: ANA, createdByName: "Ana Ruiz", myRole: "editor", subs: 0n, subsReceived: 0n, subsAccepted: 0n })];
    case "getForm": return [{ form, meta: meta(), shares: [["ana@example.com", "editor", "Ana Ruiz"]] }];
    case "listSubmissions": return [sub(1, { status: { accepted: null }, reviews: [{ reviewer: ME, rating: 5n, at: now }], people: [[ME, "me@example.com", "Me Myself"]] }), sub(2, { assignee: ANA, assigneeName: "Ana Ruiz", notes: [{ author: ANA, text: "nice", at: now }], people: [[ANA, "ana@example.com", "Ana Ruiz"]] })];
    case "listTrash": return [{ id: 9n, title: "Old form", deletedAt: now, purgeAt: now + 86400n * 1000000000n * 80n, subs: 3n }];
    case "directory": return [{ email: "ana@example.com", displayName: "Ana Ruiz", department: "Ops" }, { email: "ben@example.com", displayName: "Ben Ko", department: "IT" }];
    case "createForm": case "duplicateForm": return [meta({ id: 3n, slug: "0123456789abcdef", title: "Untitled form", status: { draft: null }, subs: 0n, subsReceived: 0n, subsAccepted: 0n })];
    case "publicForm": return [{ title: "Idea box", description: "Tell us", schema, allowEdit: true, open: true, capReached: false, closesAt: 0n, orgName: "Acme" }];
    case "previewForm": return [{ id: 1n, title: "Idea box", description: "Tell us", schema, allowEdit: true, status: { open: null }, myRole: "owner", closesAt: 0n }];
    case "submitPublic": return { ok: true, num: 7n, detail: "" };
    case "mySubmission": return [];
    case "getSettings": return [{ hubId: "aaaaa-aa", appUrl: "https://forms.test", orgName: "Acme", adminGroup: "forms-admins", adminEmails: ["me@example.com"], peopleCount: 12n, lastDirectoryPull: now, adminCount: 1n, forms: 2n, submissions: 2n, trashed: 1n, demoSeeded: false }];
    case "adminLogRows": return [{ at: now, who: "me@example.com", what: "x" }];
    default: return { ok: true, detail: "" };
  }
} });
const startUrl = mode === "public" ? "https://forms.test/#/f/abcdef0123456789" : "https://forms.test/#uht=" + "ab".repeat(20);
const dom = new JSDOM(html, { url: startUrl, runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document; globalThis.location = window.location; globalThis.history = window.history; globalThis.localStorage = window.localStorage;
globalThis.setInterval = () => 0; window.scrollTo = () => {}; window.Element.prototype.scrollIntoView = () => {}; globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error("alert: " + m) };
globalThis.Blob = window.Blob; globalThis.URL = window.URL; window.URL.createObjectURL = () => "blob:smoke"; globalThis.URL.createObjectURL = () => "blob:smoke"; window.URL.revokeObjectURL = () => {};
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.matchMedia = () => ({ matches: false });
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
process.on("unhandledRejection", (e) => errors.push("unhandled: " + (e && e.message)));
await import(pathToFileURL(path.resolve("app.js")).href);
const tick = () => new Promise((r) => setTimeout(r, 30));
for (let i = 0; i < 6; i++) await tick();
const check = (cond, msg) => { if (!cond) errors.push("ASSERT " + msg) };
const $ = (id) => document.getElementById(id);
const go = async (h) => { window.location.hash = h; window.dispatchEvent(new window.Event("hashchange")); for (let i = 0; i < 6; i++) await tick(); };
if (mode === "public") {
  check($("login").style.display === "none" && !$("layout").classList.contains("on") && !$("fillShell").classList.contains("hidden"), "public fill page shows without login or layout");
  check(!document.querySelector("#topbar .ks-topbar"), "no topbar for respondents");
  check(!calls.includes("whoami") && !calls.includes("loginWithTicket"), "respondents never touch the session lane: " + calls.join(","));
  check(/Idea box/.test($("fillWrap").textContent) && document.querySelectorAll("#fillWrap .fq").length >= 3, "fill page rendered questions: " + document.querySelectorAll("#fillWrap .fq").length);
  check($("fillOrg").textContent === "Acme", "org name on the fill brand line");
  $("fNext").click(); await tick(); check(document.querySelectorAll("#fillWrap .fq.err").length >= 1 && !calls.includes("submitPublic"), "required validation blocks submit");
  const short = document.querySelector('#fillWrap [data-q="1"]'); short.value = "Lunch roulette"; short.dispatchEvent(new window.Event("input"));
  const radio = document.querySelector('#fillWrap input[name="q2"]'); radio.checked = true; radio.dispatchEvent(new window.Event("change"));
  $("fNext").click(); for (let i = 0; i < 6; i++) await tick();
  check(calls.includes("submitPublic") && /Submission received/.test($("fillWrap").textContent) && /#7/.test($("fillWrap").textContent), "submitted + thank-you with number: " + $("fillWrap").textContent.slice(0, 80));
  check(window.localStorage.getItem("ks-forms-sub-abcdef0123456789"), "edit token kept on the device");
} else {
  check($("layout").classList.contains("on") && $("login").style.display === "none", "layout shown after ticket login");
  check(!!document.querySelector("#topbar .ks-topbar") && /Forms/.test($("ks-appName").textContent) && $("ks-badge").textContent === "2", "shared topbar with bell count");
  check(!window.location.hash.includes("uht="), "ticket stripped");
  check($("viewDash").classList.contains("on") && document.querySelectorAll("#formList .formrow").length === 2, "dashboard rows: " + document.querySelectorAll("#formList .formrow").length);
  check(/SHARED BY ANA RUIZ · EDITOR/.test($("formList").textContent), "shared badge with the person's name");
  check($("settingsBtn").classList.contains("hidden") === (role !== "admin"), "settings button only for admins");
  // workspace
  await go("#/form/1"); for (let i = 0; i < 4; i++) await tick();
  check($("viewForm").classList.contains("on") && $("fwTitle").textContent === "Idea box", "workspace opened");
  if (role === "admin") {
    check(!!$("shareBtn") && /SHARE \(1\)/.test($("shareBtn").textContent), "owner sees share with count");
    check(document.querySelectorAll("#tabBuild .sect").length === 1 && document.querySelectorAll("#tabBuild .q[data-qi]").length === 3, "builder rendered");
    $("shareBtn").click(); await tick(); check($("shareModal").classList.contains("on") && /Ana Ruiz/.test($("shList").textContent), "share modal lists current people by name");
    $("shSearch").value = "be"; $("shSearch").dispatchEvent(new window.Event("input")); for (let i = 0; i < 10; i++) await tick();
    check(document.querySelectorAll("#shResults [data-e]").length === 1 && /Ben Ko/.test($("shResults").textContent), "directory search hits (owner and existing shares excluded): " + $("shResults").textContent);
    document.querySelector("#shResults [data-e]").click(); await tick(); check(/Ben Ko/.test($("shList").textContent), "added from picker");
    $("shSave").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("setShares") && !$("shareModal").classList.contains("on"), "shares saved");
    await go("#/form/1/subs"); for (let i = 0; i < 4; i++) await tick();
    check(document.querySelectorAll("#tabSubs tr.rowlink").length === 2 && /Ana Ruiz/.test($("tabSubs").textContent), "submissions table with assignee name");
    document.querySelector("#tabSubs tr.rowlink").click(); await tick();
    check($("subDrawer").classList.contains("on") && /Lunch roulette/.test($("dBody").textContent) && !!$("dAssignIn"), "drawer with answers + assignee picker");
    check(!/p_0000/.test($("dBody").textContent), "drawer never shows raw person ids: " + $("dBody").textContent.slice(0, 100));
    document.querySelectorAll("#tabSubs tr.rowlink")[1].click(); await tick();
    check(/Ana Ruiz/.test($("dBody").textContent) && !/p_0000/.test($("dBody").textContent), "note author resolved by id from the submission's people list: " + $("dBody").textContent.slice(0, 160));
    document.querySelectorAll("#tabSubs tr.rowlink")[0].click(); await tick();
    $("dAssignIn").value = "an"; $("dAssignIn").dispatchEvent(new window.Event("input")); for (let i = 0; i < 10; i++) await tick();
    check(document.querySelectorAll("#dAssignList [data-email]").length === 2, "assignee picker rows");
    document.querySelector("#dAssignList [data-email]").click(); for (let i = 0; i < 6; i++) await tick(); check(calls.includes("assignSubmission"), "assigned via picker");
    document.querySelector("#dStars button[data-n='4']").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("rateSubmission"), "rated");
    $("dClose").click();
    await go("#/form/1/insights"); for (let i = 0; i < 4; i++) await tick(); check(document.querySelectorAll("#tabInsights .insq").length >= 1, "insights");
    await go("#/trash"); check($("viewTrash").classList.contains("on") && document.querySelectorAll("#trashList .formrow").length === 1 && /purges in/.test($("trashList").textContent), "trash");
    await go("#/settings"); check($("viewSettings").classList.contains("on") && !$("sGroup") && !!document.querySelector("[data-hub-permissions-link]") && /2 forms/.test($("sMeta").textContent), "settings loaded");
    check(document.querySelectorAll("#logRows tr").length === 1, "admin log");
    await go("#/docs"); check($("viewDocs").classList.contains("on"), "docs");
    await go(""); $("newFormBtn").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("createForm") && window.location.hash === "#/form/3", "new form → workspace: " + window.location.hash);
  } else {
    check(!$("shareBtn") && !$("delFormBtn"), "viewer sees no share/delete");
    check($("tabBuild").style.display === "none" || $("viewForm").classList.contains("on"), "viewer lands on submissions");
    await go("#/form/1/subs"); for (let i = 0; i < 4; i++) await tick(); document.querySelector("#tabSubs tr.rowlink").click(); await tick();
    check($("subDrawer").classList.contains("on") && !$("dAssignIn") && !$("dNoteAdd") && !$("dDelete"), "read-only drawer for viewers");
    await go("#/settings"); check(!$("viewSettings").classList.contains("on") && $("viewDash").classList.contains("on"), "member cannot open settings");
  }
}
console.log(mode.toUpperCase(), errors.length ? "FAIL\n" + errors.join("\n") : "SMOKE OK", "| calls:", [...new Set(calls)].length, "distinct backend methods");
process.exit(errors.length ? 1 : 0);
