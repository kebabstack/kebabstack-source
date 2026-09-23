// contracts frontend smoke: boots dist/ in jsdom against a scripted fake backend and walks
// Today, the inbox (.eml upload through the intake lane, one message with its proposal, field-wise
// confirmation with a corrected amount), the contracts list, one record (terms drawer, status,
// tasks, seats, history), the connection page (status · settings · CSV import · export) and the
// docs — as admin, editor and member. Catches the blank-page class and wrong call shapes.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const html = fs.readFileSync("index.html", "utf8").replace('<script type="module" src="./app.js"></script>', "");
const now = BigInt(Date.now()) * 1000000n;
const mode = process.argv[2] || "admin"; // admin | editor | member
const role = mode;
const staff = role !== "member";
const ME = "p_00000000000000ee", ANA = "p_00000000000000a1";
const terms = (o = {}) => ({ amountMinor: [150000n], currency: "EUR", taxBasis: "net", interval: "year", quantity: [], unitMinor: [], start: "2025-01-01", end: "", renewalRule: "auto", renewalDate: "2027-01-01", noticeDays: [], noticeMonths: [3n], noticeDate: "2026-10-01", decideBy: "2026-09-17", note: "", ...o });
const contract = (o = {}) => ({ id: 1n, title: "Sunrise Cloud — Team plan", vendor: "Sunrise Cloud", product: "Team", customerRef: "SC-4471", responsible: ME, deputy: "", visibility: "team", viewers: [ANA], status: "active", terms: terms(), futureTerms: [], revision: 3n, seats: [25n], holders: [ME, ANA, "p_0000000000000099"], tags: ["saas"], origin: "import:sheet", createdAt: now, updatedAt: now, createdBy: ME, ...o });
const crow = (o = {}) => ({ id: 1n, title: "Sunrise Cloud — Team plan", vendor: "Sunrise Cloud", product: "Team", status: "active", responsible: ME, responsibleName: "Me Myself", amount: "1,500.00 EUR", interval: "year", renewalDate: "2027-01-01", end: "", noticeDate: "2026-10-01", decideBy: "2026-09-17", daysToDecide: [11n], seats: [25n], holders: 2n, unusedSeats: [23n], openProposals: 1n, openTasks: 1n, complete: true, updatedAt: now, ...o });
const srow = (o = {}) => ({ id: 7n, kind: "relay", subject: "Your renewal — Team plan", fromAddr: "billing@sunrise-cloud.example", fromName: "Sunrise Cloud", sentAt: "2026-09-01T08:00:00Z", receivedAt: now, status: "review", contractId: [1n], contractTitle: "Sunrise Cloud — Team plan", documents: 1n, proposals: 1n, note: "", handedInByName: "", ...o });
const change = (field, oldValue, newValue, basis = "explicit") => ({ field, oldValue, newValue, basis, evidence: [{ partId: "body", quote: `… ${field} is now ${newValue} …` }] });
const prop = (o = {}) => ({ id: 11n, sourceId: 7n, sourceSubject: "Your renewal — Team plan", kind: "renewal_notice", contractId: [1n], contractTitle: "Sunrise Cloud — Team plan", candidates: [], baseRevision: 3n, currentRevision: 3n, changes: [change("amountMinor", "150000", "165000"), change("renewalDate", "2027-01-01", "2028-01-01"), change("noticeMonths", "3", "2", "ambiguous")], uncertainties: ["the notice period might be counted from the invoice date"], summary: "Price rises to 1,650.00 EUR from January 2027", status: "open", assignee: "", assigneeName: "", snoozedUntil: 0n, decidedBy: "", decidedByName: "", decidedAt: 0n, note: "", createdAt: now, ...o });
const task = (o = {}) => ({ id: 21n, contractId: 1n, contractTitle: "Sunrise Cloud — Team plan", kind: "decide", title: "Decide: continue or cancel Sunrise Cloud — Team plan", dueOn: "2026-09-17", daysLeft: [11n], assignee: ME, assigneeName: "Me Myself", auto: true, snoozedUntil: 0n, doneAt: 0n, overdue: false, ...o });
const doc = (o = {}) => ({ id: 31n, sourceId: 7n, name: "renewal.pdf", mime: "application/pdf", size: 48000n, hash: "ab".repeat(32), status: "stored", hasText: true, link: "", createdAt: now, ...o });
const J = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() + "n" : x));
const calls = [];
const last = (m) => calls.filter((c) => c[0] === m).pop();
const overrides = {};
const aiStatus = () => ({hubSet:true,checked:true,checkedAt:now,registered:true,keySet:true,laneGranted:true,credentialsReady:true,provider:'anthropic',model:'claude-sonnet-5',detail:'Hub access is ready. Run the provider test to check the model.',callsToday:3n,dailyBudget:200n,canTest:role==='admin',testRunning:false,lastTest:[]});
let fixtureSpace = "team:1";
const trashRows = new Map();
globalThis.__fakeBackend = new Proxy({}, { get: (_, m) => async (...a) => {
  calls.push([m, a]);
  if(overrides[m]) return overrides[m](...a);
  switch (m) {
    case "listTrash": return [...trashRows.values()];
    case "deletePermanently": {const [,kind,id]=a;trashRows.delete(kind+id);return {ok:true,detail:"Permanently deleted"};}
    case "setTrashed": {const [,kind,id,deleted]=a;if(deleted)trashRows.set(kind+id,{kind,id,title:'Deleted example',deletedAt:now,deletedBy:'Me Myself',canRestore:staff});else trashRows.delete(kind+id);return {ok:true,detail:''};}
    case "getAiStatus": case "refreshAiStatus": return [aiStatus()];
    case "testAiConnection": return {ok:true,detail:'The AI model responded successfully.',at:now,model:'claude-sonnet-5'};
    case "info": return { orgName: "Acme", hubId: "aaaaa-aa", hubSet: true, appUrl: "https://contracts.test", version: "0.1.0" };
    case "suiteState": return [{ email: "me@example.com", displayName: "Me Myself", unread: 2n, expiresAt: now + 3600n * 1000000000n, active: true, provider: "suite" }];
    case "myNotifications": return { total: 1n, unread: 1n, slackDm: false, items: [{ id: 3n, email: "me@example.com", fromApp: "contracts", title: "A message proposes changes to a contract of yours", url: "https://contracts.test/#/inbox/7", kind: "contracts.review", at: now, read: false, slack: "off" }] };
    case "markNotificationsRead": return 1n;
    case "portalApps": return [{ id: 1n, name: "contracts", url: "https://contracts.test/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: false }];
    case "myAvatarPortal": case "getCompanyLogo": case "tileIcon": return [];
    case "listSpaces": return [{id:"team:1",name:"People & Operations",description:"Team agreements",kind:"team",role:{[staff ? 'owner' : 'viewer']:null},archived:false,revision:1n},...(role === "admin" ? [{id:"intake",name:"Contract intake",description:"Shared incoming documents",kind:"intake",role:{owner:null},archived:false,revision:0n}] : [])];
    case "openSpace": fixtureSpace=a[1];return {ok:true,token:"scoped-token",detail:""};
    case "getSpace": return [{space:{id:"team:1",name:"People & Operations",description:"Team agreements",revision:1n,archived:false,members:[{pid:ME,role:{owner:null}}]},members:[{pid:ME,name:"Me Myself",active:true,role:{owner:null}}]}];
    case "whoami": return [{ id: ME, email: "me@example.com", displayName: "Me Myself", role, space:fixtureSpace, spaceRole:[{[staff ? "owner" : "viewer"]:null}], roleSource: role === "admin" ? "hub owner" : role === "editor" ? "group contracts-editors" : "directory member", orgName: "Acme", hubId: "aaaaa-aa", needsClaim: false, aiOn: mode !== "editor" }];
    case "loginWithTicket": return [{ token: "t0k", email: "me@example.com", displayName: "Me", role, suiteToken: "su1te" }];
    case "today": return [{ contracts: 6n, dueSoon: 2n, inboxOpen: 3n, lastReceivedAt: now, aiOn: mode !== "editor", proposals: [prop()], tasks: [task(), task({ id: 22n, kind: "review", title: "Check the notice clause", dueOn: "2026-09-01", daysLeft: [-5n], overdue: true, auto: false })], unassigned: staff ? [crow({ id: 5n, title: "Watchtower (offer)", vendor: "Watchtower", responsible: "", responsibleName: "", status: "draft" })] : [], failed: staff ? [srow({ id: 9n, status: "failed", subject: "Scan of the framework agreement", note: "no text could be read", contractId: [], contractTitle: "" })] : [] }];
    case "listSources": return a[1] === "filed" ? [srow({ id: 8n, status: "filed", subject: "Invoice 2026-08", kind: "relay" })] : [srow(), srow({ id: 9n, status: "failed", subject: "Scan of the framework agreement", note: "no text could be read", contractId: [], contractTitle: "", documents: 1n, proposals: 0n })];
    case "getSource": if(a[1]===12n) return [{source:srow({id:12n,subject:"Sunrise Cloud licence agreement",contractId:[],contractTitle:""}),text:"Annual licence for EUR 480.00. Signing has not been confirmed.",forwardComment:"",to:[],cc:[],messageId:"upload12",documents:[doc()],proposals:[prop({id:12n,sourceId:12n,contractId:[],candidates:[],summary:"Annual licence offer; execution not confirmed",changes:[change("vendor","","Sunrise Cloud"),change("amountMinor","","48000"),change("currency","","EUR"),change("interval","","year")],uncertainties:["No evidence of signing in the supplied text."]})],candidates:[]}]; return a[1] === 7n ? [{ source: { ...srow(), mailbox: "subscriptions@acme.example", providerId: "", messageId: "<r1@sunrise>", inReplyTo: "", references: "", to: ["subscriptions@acme.example"], cc: ["me@example.com"], forwardComment: "", hash: "cd".repeat(32), textBlob: [1n], htmlBlob: [], handedInBy: "" }, to: ["subscriptions@acme.example"], cc: ["me@example.com"], messageId: "<r1@sunrise>", forwardComment: "FYI — the new price", text: "Dear customer, your Team plan renews on 2028-01-01 at EUR 1,650.00 per year. Notice period two months.", documents: [doc()], proposals: [prop(), prop({ id: 10n, status: "confirmed", decidedBy: ME, decidedByName: "Me Myself", decidedAt: now, changes: [change("seats", "20", "25")], summary: "Seats raised to 25", kind: "order_confirmation" })], candidates: [crow({ id: 2n, title: "Sunrise Cloud — Storage add-on", product: "Storage" })] }] : [];
    case "portfolio": return [{rows:[{contract:contract(),canEdit:staff,ownerName:"Me Myself",groups:[],assigned:2n,hasKey:false,commercial:[],history:[]}],policy:{enabled:true,owner:true,spaceOwners:true,hubAdmins:true,groups:[],days:[90n,60n,30n,7n]},directoryAt:now,canManage:staff,people:12n}];
    case "directoryGroups": return [{name:"IT",members:2n}];
    case "vendorTermsStatus": return [{url:"",checkedAt:now,status:"unavailable",detail:"Vendor terms not recorded",quote:"",renewalRule:"",noticeDays:[],noticeMonths:[]}];
    case "licenseAssignment": return [{groups:[],people:[]}];
    case "listContracts": return a[1].q === "zzz" ? [] : [crow(), crow({ id: 2n, title: "Sunrise Cloud — Storage add-on", product: "Storage", complete: false, daysToDecide: [], decideBy: "", noticeDate: "", openProposals: 0n, openTasks: 0n, seats: [], unusedSeats: [] }), crow({ id: 3n, title: "Rocket Mail", vendor: "Rocket Mail", product: "", status: "cancelling", daysToDecide: [-2n] })];
    case "getContract": return a[1] === 1n || a[1] === 2n || a[1] === 9n ? [{ contract: contract(a[1] === 2n ? { id: 2n, title: "Sunrise Cloud — Storage add-on", revision: 1n, terms: terms({ amountMinor: [], noticeMonths: [], noticeDate: "", decideBy: "" }) } : {}), row: crow(), responsibleName: "Me Myself", deputyName: "", viewerNames: [[ANA, "Ana Ruiz"]], holderNames: [[ME, "Me Myself", true], [ANA, "Ana Ruiz", true], ["p_0000000000000099", "Old Colleague", false]], proposals: [prop()], sources: [srow()], documents: [doc()], tasks: [task(), task({ id: 23n, title: "Ask for the signed copy", kind: "manual", auto: false, doneAt: now, daysLeft: [] })], audit: [{ id: 1n, at: now, who: ME, contractId: 1n, sourceId: [7n], what: "terms set by hand", before: "", after: "1,500.00 EUR · yearly", }], rules: [{ id: 41n, contractId: 1n, kind: "senderAddress", value: "billing@sunrise-cloud.example", confirmed: true, createdAt: now, createdBy: ME }], canEdit: staff }] : [];
    case "directory": return [{ id: ANA, email: "ana@example.com", displayName: "Ana Ruiz", department: "Ops" }, { id: "p_00000000000000b2", email: "ben@example.com", displayName: "Ben Ko", department: "IT" }];
    case "connectionStatus": return [{ mailboxAddress: "subscriptions@acme.example", relayCount: 1n, lastReceivedAt: now, sourcesToday: 4n, openJobs: 1n, oldestOpenJobAt: now, failedJobs: 0n, failedSources: 1n, aiCallsToday: 3n, aiDailyBudget: 200n, aiSource: "hub", outboxPending: 2n, outboxFailed: 1n, outboxFailures: [{ id: 51n, title: "Decide by 17 Sep: Sunrise Cloud", attempts: 3n, lastError: "hub unreachable" }], blobBytes: 4800000n, lastDirectoryPull: now, jobs: [{ id: 61n, step: "extract", ref: 9n, attempts: 2n, nextAt: now, lockedUntil: 0n, doneAt: 0n, lastError: "budget", createdAt: now }] }];
    case "getSettings": return [{ hubId: "aaaaa-aa", appUrl: "https://contracts.test", orgName: "Acme", editorGroup: "contracts-editors", adminGroup: "contracts-admins", adminEmails: ["me@example.com"], mailboxAddress: "subscriptions@acme.example", relayPrincipals: ["aaaaa-bbbbb-ccccc"], tzName: "Europe/Zurich", tzOffsetMinutes: 120n, leadDays: 14n, reminderDays: [30n, 14n, 7n], aiDailyBudget: 200n, aiSource: "hub", aiCallsToday: 3n, peopleCount: 12n, lastDirectoryPull: now, adminCount: 1n, contracts: 6n, sources: 9n, openProposals: 1n, openTasks: 2n, blobBytes: 4800000n, demoSeeded: false, version: "0.1.0" }];
    case "adminLogRows": return [{ at: now, who: "me@example.com", what: "settings saved" }];
    case "importPreview": return { ok: true, detail: "", headers: ["Vendor", "Product", "Amount", "Currency", "Interval", "Renews", "Notice months", "Owner e-mail"], unmapped: [], total: 2n, rows: [{ line: 2n, ok: true, title: "Nimbus · Pro", vendor: "Nimbus", problems: [], exists: [] }, { line: 3n, ok: true, title: "Sunrise Cloud · Team", vendor: "Sunrise Cloud", problems: [], exists: [1n] }] };
    case "importCommit": return { ok: true, detail: "", created: 1n, skipped: 1n, problems: 0n };
    case "exportCsv": return "title,vendor\nSunrise Cloud — Team plan,Sunrise Cloud\n";
    case "exportAll": return [{ schemaVersion: 1n, exportedAt: now, settings: {}, contracts: [contract()], proposals: [], observations: [], sources: [], documents: [], tasks: [], rules: [], audit: [] }];
    case "documentData": return [{ name: "renewal.pdf", mime: "application/pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }];
    case "documentText": return ["Team plan renews on 2028-01-01"];
    case "intakeBegin": return { ok: true, id: 77n, detail: "" };
    case "intakeChunk": return { ok: true, detail: "" };
    case "intakeCommit": return { ok: true, sourceId: 12n, status: "new — queued for reading", detail: "" };
    case "createContractFromSource": return {ok:true,contractId:9n,detail:"Saved"};
    case "decideProposal": return { ok: true, contractId: 1n, revision: 4n, detail: "" };
    case "setTerms": case "setFutureTerms": case "updateContract": case "setStatus": return { ok: true, revision: 4n, detail: "" };
    case "createContract": case "addTask": case "proposeChange": return { ok: true, id: 9n, detail: "" };
    default: return { ok: true, detail: "" };
  }
} });
const dom = new JSDOM(html, { url: "https://contracts.test/#uht=" + "ab".repeat(20), runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document; globalThis.location = window.location; globalThis.history = window.history; globalThis.localStorage = window.localStorage;
globalThis.setInterval = () => 0; window.scrollTo = () => {}; window.Element.prototype.scrollIntoView = () => {}; globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error("alert: " + m) }; globalThis.prompt = () => { throw new Error("prompt() used — pickers, not free text") };
globalThis.FormData = window.FormData; globalThis.Event = window.Event; globalThis.Blob = window.Blob; globalThis.File = window.File; globalThis.URL = window.URL; const downloads = []; window.URL.createObjectURL = (b) => { downloads.push(b); return "blob:smoke"; }; window.URL.revokeObjectURL = () => {};
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.matchMedia = () => ({ matches: false });
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
process.on("unhandledRejection", (e) => errors.push("unhandled: " + (e && e.stack || e)));
await import(pathToFileURL(path.resolve("app.js")).href);
const tick = () => new Promise((r) => setTimeout(r, 30));
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await tick(); };
await settle();
const check = (cond, msg) => { if (!cond) errors.push("ASSERT " + msg) };
const $ = (id) => document.getElementById(id);
const go = async (h) => { window.location.hash = h; window.dispatchEvent(new window.Event("hashchange")); await settle(); };
const click = async (el) => { el.click(); await settle(); };
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); el.dispatchEvent(new window.Event("change", { bubbles: true })); };
const on = (id) => $(id).classList.contains("on");
const hidden = (id) => $(id).classList.contains("hidden");

// ---- login · layout · topbar · today
check(on("layout") && $("login").style.display === "none", "layout shown after ticket login");
check(!!document.querySelector("#topbar .ks-topbar") && /Contracts/.test($("ks-appName").textContent) && $("ks-badge").textContent === "2", "shared topbar with bell count");
check(!window.location.hash.includes("uht="), "ticket stripped");
check(on("viewSaas") && /Annual SaaS run rate/.test($("saasBody").textContent), "SaaS overview is the landing page");
await go("#/contracts"); check(document.querySelectorAll(".saas-table tbody tr").length===1,"SaaS portfolio table renders without record-by-record queries");
await go("#/reports"); check(/Software spend/.test($("saasBody").textContent),"management report opens");
await go("#/settings"); check(/90/.test($("saasBody").textContent) && /IT/.test($("saasBody").textContent),"reminders and Hub groups available");
await go("#/tasks");
check(!hidden("navConn"), "workspace tools available for scoped exports");
check(hidden("aiBox") === !(staff && mode === "editor"), "AI-off notice only for staff when the lane is off: hidden=" + hidden("aiBox"));
check(document.querySelectorAll("#tStats .tstat").length === 4 && /6/.test($("tStats").textContent), "four stats with the contract count");
check(document.querySelectorAll("#tBody .item").length >= 3, "proposal + tasks listed: " + document.querySelectorAll("#tBody .item").length);
check(/Price rises/.test($("tBody").textContent) && /OVERDUE/.test($("tBody").textContent), "proposal summary and overdue tag");
check((/Watchtower/.test($("tBody").textContent)) === staff && (/Scan of the framework/.test($("tBody").textContent)) === staff, "unassigned + failed only for staff");
check($("nToday").textContent === "3" && $("nInbox").textContent === "3", "nav counters");
// DONE on the decide task → decision modal → completeTask with the decision
await click(document.querySelector('#tBody [data-done="21"]'));
check(on("doneModal") && !hidden("dnDecision"), "decide task asks for the decision");
$("dnSel").value = "cancel"; $("dnNote").value = "too expensive";
await click($("dnSave"));
check(last("completeTask") && last("completeTask")[1][1] === 21n && last("completeTask")[1][2] === "cancel" && last("completeTask")[1][3] === "too expensive", "completeTask(21, cancel, note)");
// LATER → snooze modal (no prompt) → snoozeTask(22, 14)
await click(document.querySelector('#tBody [data-snooze="22"]'));
check(on("snoozeModal"), "snooze modal opens"); $("snSel").value = "14"; await click($("snSave"));
check(last("snoozeTask") && last("snoozeTask")[1][1] === 22n && last("snoozeTask")[1][2] === 14n, "snoozeTask(22, 14 days)");

// ---- inbox
await go("#/inbox");
check(on("viewInbox") && document.querySelectorAll("#ibList tr[data-s]").length === 2, "inbox rows: " + document.querySelectorAll("#ibList tr[data-s]").length);
check(/READY FOR REVIEW/.test($("ibList").textContent) && /FAILED/.test($("ibList").textContent), "status tags in the inbox");
await click(document.querySelector('#ibFilters [data-st="filed"]'));
check(last("listSources")[1][1] === "filed" && /Invoice 2026-08/.test($("ibList").textContent), "filter → listSources(filed)");
// .eml upload through the intake lane
const eml = `From: Sunrise Cloud <billing@sunrise-cloud.example>\r\nTo: subscriptions@acme.example\r\nCc: me@example.com\r\nMessage-ID: <up1@sunrise>\r\nSubject: Renewal notice\r\nDate: Mon, 01 Sep 2026 10:00:00 +0200\r\nContent-Type: multipart/mixed; boundary="b1"\r\n\r\n--b1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nYour plan renews on 2027-01-01 at EUR 1,500.00 per year.\r\n--b1\r\nContent-Type: application/pdf; name="invoice.pdf"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="invoice.pdf"\r\n\r\nJVBERi0xLjQK\r\n--b1--\r\n`;
const file = new window.File([eml], "renewal.eml", { type: "message/rfc822" });
Object.defineProperty($("ibEml"), "files", { value: [file], configurable: true });
$("ibEml").dispatchEvent(new window.Event("change")); await settle(30);
const ib = last("intakeBegin");
check(!!ib, "intakeBegin called for the .eml");
if (ib) {
  const meta = ib[1][1];
  check(meta.kind === "eml" && meta.subject === "Renewal notice" && meta.messageId === "<up1@sunrise>" && meta.fromAddr === "billing@sunrise-cloud.example" && meta.fromName === "Sunrise Cloud", "intake meta from the parsed mail: " + J({ k: meta.kind, s: meta.subject, id: meta.messageId, f: meta.fromAddr }));
  check(meta.to[0] === "subscriptions@acme.example" && meta.cc[0] === "me@example.com" && /renews on 2027-01-01/.test(meta.text) && meta.sentAt.startsWith("2026-09-01T08:00"), "to/cc/text/date carried");
  check(meta.attachments.length === 1 && meta.attachments[0].name === "invoice.pdf" && meta.attachments[0].mime === "application/pdf" && /^[0-9a-f]{64}$/.test(meta.attachments[0].sha256) && meta.attachments[0].size === 9n, "attachment meta with sha256: " + J(meta.attachments[0]));
  const ch = last("intakeChunk");
  check(ch && ch[1][1] === 77n && ch[1][2] === 0n && ch[1][3] instanceof Uint8Array && ch[1][3].length === 9 && ch[1][3][0] === 0x25, "one chunk of the pdf bytes");
  check(last("intakeCommit") && last("intakeCommit")[1][1] === 77n, "intakeCommit(77)");
  check(window.location.hash === "#/intake/12" && on("viewIntake"), "upload automatically opens document review");
}
// A re-read must stay visible despite old suggestions, and never erase live edits.
if(mode === "admin") {
  await go("#/intake/12");
  const initial=(await globalThis.__fakeBackend.getSource("fixture",12n))[0];
  let current={...initial,source:{...initial.source,status:"received",note:""}},restart;
  const timers=[],realTimeout=globalThis.setTimeout;
  globalThis.setTimeout=(fn,ms,...args)=>ms===4000?(timers.push(()=>fn(...args)),0):realTimeout(fn,ms,...args);
  overrides.getSource=async()=>[current];
  overrides.reprocessSource=()=>new Promise(resolve=>{restart=resolve;});
  try {
    const retry=$("intakeBody").querySelector('[data-retry]');retry.click();
    check(retry.disabled && retry.getAttribute('aria-busy')==='true' && /Starting/.test(retry.textContent),"restart gives immediate feedback");
    restart({ok:true,detail:""});await settle();
    check(/Waiting for AI/.test($("intakeBody").textContent) && $("intakeBody").querySelector('[data-retry]').disabled,"old proposal does not stop queued feedback");
    current={...current,source:{...current.source,status:"processing",note:"Reading original pages and images · part 1 of 2"}};
    await timers.shift()();
    check(/part 1 of 2/.test($("intakeBody").textContent),"real backend reading stage is shown");
    type($("review-title"),"My edited title");
    current={...current,source:{...current.source,status:"review",note:""},proposals:[{...current.proposals[0],id:99n,changes:[change("title","","New AI title")]}]};
    await timers.shift()();
    check($("review-title").value==="My edited title" && /Your edits have been kept/.test($("intakeBody").textContent),"completed read preserves edits");
    await click($("intakeBody").querySelector('[data-analysis-action]'));
    check($("review-title").value==="New AI title" && /AI reading complete/.test($("intakeBody").textContent),"explicitly use latest suggestions and see completion");
    check(!$("intakeBody").querySelector('[data-retry]').disabled,"read button available after completion");
  } finally {globalThis.setTimeout=realTimeout;delete overrides.getSource;delete overrides.reprocessSource;}
}
if (staff) {
// paste a message (kind manual)
await click($("ibPaste")); check(on("pasteModal"), "paste modal opens");
$("pmFrom").value = "sales@nimbus.example"; $("pmSubject").value = "Quote"; $("pmText").value = "Pro plan, 12 seats, 480.00 EUR per month.";
await click($("pmSend"));
check(last("intakeBegin")[1][1].kind === "manual" && last("intakeBegin")[1][1].text.startsWith("Pro plan") && last("intakeCommit"), "manual intake begin+commit");
check(window.location.hash === "#/inbox/12", "lands on the new source: " + window.location.hash);

}
// ---- one message
await go("#/inbox/7");
check(on("viewSource") && /Your renewal/.test($("srcTitle").textContent) && /READY FOR REVIEW/.test($("srcStatus").textContent), "source head");
check(/Sunrise Cloud/.test($("srcMeta").textContent) && /cc me@example.com/.test($("srcMeta").textContent) && $("srcMeta").querySelector('a[href="#/c/1"]'), "source meta with cc and contract link");
const propBox = document.querySelector('#srcProposals .prop[data-p="11"]');
check(!!propBox && document.querySelectorAll('#srcProposals .prop[data-p="11"] tbody tr').length === 3, "open proposal with three field rows");
check(/1,650\.00/.test(propBox.textContent) && /1,500\.00/.test(propBox.textContent), "money shown as decimals (old and new)");
check(propBox.querySelector('input[data-i="0"]').checked && propBox.querySelector('input[data-i="1"]').checked && !propBox.querySelector('input[data-i="2"]').checked, "explicit fields pre-ticked, ambiguous not");
check(/might be counted from the invoice date/.test(propBox.textContent), "uncertainties listed");
check(/Seats raised to 25/.test($("srcProposals").textContent) && /CONFIRMED/.test($("srcProposals").textContent), "decided proposal listed");
const tsel = propBox.querySelector("[data-target]");
check(tsel && tsel.options.length === (staff ? 4 : 1) && tsel.options[0].value === "1" && (!staff || tsel.options[1].value === "2"), "target select: own contract" + (staff ? " + message candidate + other/new" : " only (members choose among the proposal's candidates)") + ": " + (tsel && tsel.options.length));
check(!!propBox.querySelector("[data-assign]") === staff, "hand-to only for staff");
if (staff) {
// correct the amount, untick nothing, confirm → decideProposal with normalized values
type(propBox.querySelector('input[data-v="0"]'), "1600");
propBox.querySelector("[data-note]").value = "checked with the invoice";
await click(propBox.querySelector("[data-confirm]"));
const dp = last("decideProposal");
check(!!dp && dp[1][1] === 11n, "decideProposal(11)");
if (dp) {
  const d = dp[1][2];
  check(d.expectedRevision === 3n && d.target.length === 0 && d.newContract === false && d.note === "checked with the invoice", "decision shape (revision 3, own contract, note): " + J({ r: d.expectedRevision, t: d.target.length, n: d.newContract }));
  check(d.accept.length === 2 && d.accept[0].field === "amountMinor" && d.accept[0].value === "1600.00" && d.accept[1].field === "renewalDate" && d.accept[1].value === "2028-01-01", "accepted fields: corrected money as decimal text, untouched date as is: " + J(d.accept));
}
}
// tabs with deep links
await go("#/inbox/7/documents");
check(!hidden("srcDocuments") && hidden("srcProposals") && /renewal\.pdf/.test($("srcDocuments").textContent) && /text extracted/.test($("srcDocuments").textContent), "documents tab via hash");
await click($("srcDocuments").querySelector("[data-dl]"));
check(last("documentData") && last("documentData")[1][1] === 31n && downloads.length >= 1, "download via documentData (session-gated)");
await click($("srcDocuments").querySelector("[data-txt]"));
check(on("textModal") && /renews on 2028/.test($("txBody").textContent), "extracted text modal"); await click($("txClose"));
await go("#/inbox/7/message");
check(/FYI — the new price/.test($("srcMessage").textContent) && /Dear customer/.test($("srcMessage").textContent), "message tab with the forwarder's comment");
await go("#/inbox/7/filing");
check(staff ? !!$("sfLink") : /Workspace owners and editors can file messages/.test($("srcFiling").textContent), "filing tab per role");
if (staff) {
  await click($("sfLink")); check(on("linkModal") && !hidden("lkUnlink"), "file dialog opens with unlink (already filed)");
  type($("lkIn"), "Rocket"); await settle();
  check(last("listContracts") && last("listContracts")[1][1].q === "Rocket", "contract picker searches listContracts");
  await click($("lkList").querySelector('[data-cid="3"]')); $("lkRule").checked = true; await click($("lkSave"));
  const ls = last("linkSource");
  check(ls && ls[1][1] === 7n && ls[1][2][0] === 3n && ls[1][3][0].kind === "senderAddress" && ls[1][3][0].value === "billing@sunrise-cloud.example", "linkSource(7 → 3, sender rule)");
  await settle();
  await go("#/inbox/7/filing");
  await click($("sfIgnore")); check(on("confirmModal"), "ignore asks first"); await click($("cmYes")); await settle();
  check(last("setSourceStatus") && last("setSourceStatus")[1][2] === "ignored", "ignore → setSourceStatus(ignored)");
}

// ---- contracts
await go("#/contracts/advanced");
check(on("viewContracts") && document.querySelectorAll("#cList tr[data-c]").length === 3, "contract rows: " + document.querySelectorAll("#cList tr[data-c]").length);
check(/terms incomplete/.test($("cList").textContent) && /23 unused/.test($("cList").textContent) && /in 11 days/.test($("cList").textContent) && /2 days ago/.test($("cList").textContent), "incomplete flag, unused seats, days to decide");
type($("cQ"), "zzz"); await settle();
check(last("listContracts")[1][1].q === "zzz" && /No contract matches/.test($("cList").textContent), "search → filtered empty state");
type($("cQ"), ""); $("cDue").checked = true; $("cDue").dispatchEvent(new window.Event("change")); await settle();
check(last("listContracts")[1][1].onlyDue === true, "due filter passed");
await click($("cExport")); check(last("exportCsv") && downloads.length >= 2, "CSV export downloads");
if (staff) {
// Document-first: the action opens an upload, not a blank record.
await click($("cNew")); check(on("viewIntake") && !!$("chooseContract"), "new contract starts with its document");
await go("#/intake/12");
check($("review-amountMinor").value === "480.00" && $("review-vendor").value === "Sunrise Cloud", "AI fields prefilled in human units");
$("review-title").value = "Reviewed licence"; $("review-product").value="Completed product"; $("review-amountMinor").value="1200";
const reviewForm=document.querySelector(".intake-form");reviewForm.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));await settle();
const saved=last("createContractFromSource");
check(saved && saved[1][1]===12n && saved[1][2].fields.some(f=>f.field==="product"&&f.value==="Completed product") && saved[1][2].fields.some(f=>f.field==="amountMinor"&&f.value==="120000"),"one save includes completed missing fields and whole major amounts as minor units");
check(window.location.hash==="#/contracts","saved review opens the SaaS table");
}
// ---- the record
await go("#/c/1");
check(on("viewRecord") && /Sunrise Cloud — Team plan/.test($("rTitle").textContent) && /ACTIVE/.test($("rStatusTag").textContent) && /Owner/.test($("rSub").textContent), "record head");
check(/1,500\.00 EUR/.test($("rTerms").textContent) && /yearly/.test($("rTerms").textContent) && /3 months before/.test($("rTerms").textContent) && /2026-10-01/.test($("rTerms").textContent) && /2026-09-17/.test($("rTerms").textContent), "confirmed terms and deadlines");
check(!/Still missing/.test($("rTerms").textContent), "complete record has no missing notice");
check($("rPropCount").textContent === "(1)" && $("rTaskCount").textContent === "(1)" && $("rSrcCount").textContent === "(1)", "tab counters");
check(hidden("rEdit") === !staff && hidden("rSetStatus") === !staff, "record write buttons follow backend permissions");
if (staff) {
// terms drawer → setTerms with minor units
await click($("rEditTerms")); check(on("termsDrawer") && $("tdAmount").value === "1500.00" && $("tdNoticeM").value === "3" && $("tdRenewal").value === "auto", "terms drawer prefilled: " + $("tdAmount").value);
$("tdAmount").value = "1.650,00"; $("tdNoticeM").value = "2"; $("tdWhy").value = "new order form";
await click($("tdSave"));
const st = last("setTerms");
check(st && st[1][1] === 1n && st[1][2] === 3n && st[1][3].amountMinor[0] === 165000n && st[1][3].noticeMonths[0] === 2n && st[1][3].noticeDays.length === 0 && st[1][3].currency === "EUR" && st[1][4] === "new order form", "setTerms(1, rev 3, 165000 minor, 2 months, why)");
// status modal
await settle(); await click($("rSetStatus")); $("stSel").value = "cancelling"; $("stNote").value = "we move to Nimbus"; await click($("stSave"));
check(last("setStatus") && last("setStatus")[1][3] === "cancelling" && last("setStatus")[1][4] === "we move to Nimbus", "setStatus(cancelling)");
}
// tasks tab
await go("#/c/1/tasks");
check(!hidden("rTasks") && /Decide: continue or cancel/.test($("rTasks").textContent) && /Done \(1\)/.test($("rTasks").textContent), "tasks tab with open + done");
if (staff) {
await click($("rAddTask")); $("tkText").value = "Ask for the signed copy"; $("tkDue").value = "2026-09-30"; type($("tkAssIn"), "Ben"); await settle(); await click($("tkAssList").querySelector('[data-id="p_00000000000000b2"]')); await click($("tkSave"));
check(last("addTask") && last("addTask")[1][2] === "Ask for the signed copy" && last("addTask")[1][3] === "2026-09-30" && last("addTask")[1][4] === "p_00000000000000b2", "addTask with picked assignee id");
}
// proposals tab → propose a change
await go("#/c/1/proposals");
check(!hidden("rProposals") && document.querySelector('#rProposals .prop[data-p="11"]') && (!!$("rPropose") === staff), "proposals tab with the open proposal + propose button");
if (staff) {
await click($("rPropose")); $("prRows").querySelector("[data-pf]").value = "amountMinor"; $("prRows").querySelector("[data-pv]").value = "1700"; $("prSummary").value = "vendor said so";
await click($("prSave"));
check(last("proposeChange") && last("proposeChange")[1][3][0].field === "amountMinor" && last("proposeChange")[1][3][0].value === "1700.00" && last("proposeChange")[1][4] === "vendor said so", "proposeChange normalizes money");
}
// seats tab
await go("#/c/1/seats");
check(!hidden("rSeats") && /25/.test($("rSeats").textContent) && document.querySelectorAll("#rHolders .chipp").length === 3 && document.querySelectorAll("#rHolders .chipp.gone").length === 1, "seats: 25 bought, 3 holders, one who left");
check(/23/.test(document.querySelectorAll("#rSeats .tstat")[2].textContent), "unused = seats − active holders = 23");
if (staff) {
await click($("rHolders").querySelector('[data-rm="p_0000000000000099"]'));
const up = last("updateContract");
check(up && up[1][1] === 1n && up[1][2] === 3n && up[1][3].holders.length === 2 && !up[1][3].holders.includes("p_0000000000000099") && up[1][3].responsible === ME, "removing a holder → updateContract keeps the other fields");
}
// messages + rules, documents, history
await go("#/c/1/messages");
check(/Your renewal/.test($("rMessages").textContent) && ((/billing@sunrise-cloud.example/.test($("rMessages").textContent)) === staff), "messages tab; rules only for staff");
if (staff) { $("rRuleVal").value = "sunrise-cloud.example"; $("rRuleKind").value = "senderDomain"; await click($("rRuleAdd")); check(last("addRule") && last("addRule")[1][1] === "senderDomain" && last("addRule")[1][2] === "sunrise-cloud.example" && last("addRule")[1][3] === 1n, "addRule(domain)"); }
await go("#/c/1/documents"); check(/renewal\.pdf/.test($("rDocuments").textContent), "documents tab");
await go("#/c/1/history"); check(/terms set by hand/.test($("rHistory").textContent) && $("rHistory").querySelector('a[href="#/inbox/7"]'), "history with a link to the message");
// edit drawer prefilled
if (staff) {
await click($("rEdit"));
check(on("editDrawer") && $("edTitleIn").value === "Sunrise Cloud — Team plan" && /Me Myself/.test($("edRespChip").textContent) && /Ana Ruiz/.test($("edViewChips").textContent) && $("edSeats").value === "25", "edit drawer prefilled with names from the record");
await click($("edClose"));
}
// incomplete record shows what is missing
await go("#/c/2");
check(/Still missing on this record: amount, notice rule/.test($("rTerms").textContent), "missing notice lists the gaps: " + ($("rTerms").querySelector(".notice") || {}).textContent);

// ---- connection
await go("#/connection/ai");
check(!hidden('cnAi') && /claude-sonnet-5/.test($('aiConnection').textContent),'AI model status visible to every signed-in role');
check(!last('testAiConnection'),'opening diagnostics does not call the provider');
await click($('aiRefresh')); check(last('refreshAiStatus') && !last('testAiConnection'),'configuration refresh is separate from provider test');
check($('aiTest').disabled === (role !== 'admin'),'only app administrators can run the model test');
if(role === 'admin') {
  let release;
  overrides.testAiConnection = () => new Promise(resolve=>{release=resolve;});
  $('aiTest').click(); $('aiTest').click(); await settle();
  check(calls.filter(c=>c[0]==='testAiConnection').length===1,'double-click sends only one model test');
  const result={ok:false,detail:'The AI provider rejected access.',at:now,model:'claude-sonnet-5'};
  overrides.getAiStatus=async()=>[{...aiStatus(),lastTest:[result]}];
  release(result); await settle();
  check(/Model test failed/.test($('aiTestResult').textContent) && /rejected access/.test($('aiTestResult').textContent),'provider failure shown independently of ready configuration');
  delete overrides.testAiConnection; delete overrides.getAiStatus;
}
await go("#/connection");
if (!staff) {
  check(on("viewConn") && !hidden("cnExport"), "viewers can export their current space");
  check(!document.querySelector("#srcProposals [data-confirm]"), "viewers cannot confirm proposals");
} else {
  check(on("viewConn") && document.querySelectorAll("#cnStatus .tstat").length === 6 && /subscriptions@acme.example/.test($("cnStatus").textContent) && /1 trusted/.test($("cnStatus").textContent), "connection status page");
  check(/hub unreachable/.test($("cnStatus").textContent) && /extract/.test($("cnStatus").textContent), "outbox failure + job queue shown");
  await click($("cnStatus").querySelector("[data-retry]")); check(last("retryNotification") && last("retryNotification")[1][1] === 51n, "retry a failed reminder");
  const admTabs = [...document.querySelectorAll("#viewConn .tabs .adm")];
  check(admTabs.every((b) => b.classList.contains("hidden") === (role !== "admin")), "admin-only tabs hidden for editors");
  await go("#/connection/export");
  check(!hidden("cnExport") && !hidden("exAll"), "export tab; JSON scoped to the current workspace");
  if (role === "admin") {
    await click($("exAll")); check(last("exportAll") && downloads.length >= 3 && /downloaded/.test($("exStatus").textContent), "full export downloads JSON");
    await go("#/connection/settings");
    check(!hidden("cnSettings") && $("sLead").value === "14" && $("sReminders").value === "30, 14, 7" && $("sTzOff").value === "120", "settings prefilled");
    $("sLead").value = "21"; $("sReminders").value = "45, 14"; await click($("sSave"));
    const ss = last("setSettings");
    check(ss && ss[1][1].leadDays === 21n && ss[1][1].reminderDays.length === 2 && ss[1][1].reminderDays[0] === 45n && ss[1][1].tzOffsetMinutes === 120n && ss[1][1].mailboxAddress === "subscriptions@acme.example", "setSettings with bigint fields + mailbox from the relay tab");
    check(!last("setAdminEmails") && !$("sEditorGroup") && /saved/.test($("sStatus").textContent), "settings save never writes local roles");
    await go("#/connection/relay");
    check(!hidden("cnRelay") && $("rlPrincipals").value === "aaaaa-bbbbb-ccccc", "relay tab prefilled");
    $("rlPrincipals").value = "aaaaa-bbbbb-ccccc\nddddd-eeeee"; await click($("rlSave"));
    check(last("setRelayPrincipals") && last("setRelayPrincipals")[1][1].length === 2 && last("setRelayPrincipals")[1][1][1] === "ddddd-eeeee", "setRelayPrincipals(2)");
    // import: paste → columns guessed → preview → commit
    await go("#/connection/import");
    $("imCsv").value = "Vendor;Product;Amount;Currency;Interval;Renews;Notice months;Owner e-mail\nNimbus;Pro;1.200,00;EUR;year;2027-03-01;3;ana@example.com\nSunrise Cloud;Team;1500.00;EUR;year;2027-01-01;3;me@example.com\n";
    await click($("imHeaders"));
    const sels = [...$("imMap").querySelectorAll("select[data-h]")];
    check(sels.length === 8 && sels.map((s) => s.value).join(",") === "vendor,product,amount,currency,interval,renewalDate,noticeMonths,responsibleEmail", "columns guessed: " + sels.map((s) => s.value).join(","));
    check(/delimiter ";"/.test($("imStatus").textContent), "semicolon detected");
    await click($("imPreview"));
    const ip = last("importPreview");
    check(ip && ip[1][2] === ";" && ip[1][3].length === 8 && ip[1][3][5][0] === "Renews" && ip[1][3][5][1] === "renewalDate", "importPreview(csv, ';', mapping tuples)");
    check(/1<\/b> would be created/.test($("imReport").innerHTML) && /exists as/.test($("imReport").textContent) && !$("imCommit").disabled, "preview report + import enabled");
    $("imBatch").value = "sheet 2026-09"; await click($("imCommit")); check(on("confirmModal"), "import asks first"); await click($("cmYes"));
    check(last("importCommit") && last("importCommit")[1][4] === "sheet 2026-09" && /1 created · 1 skipped/.test($("imStatus").textContent), "importCommit with batch label");
    await go("#/connection/log"); check(/settings saved/.test($("logRows").textContent), "admin log");
    // sample data
    await go("#/connection/settings"); await click($("sSeed")); check(last("seedDemo") && /sample data added/.test($("sSeedStatus").textContent), "seed sample data");
  } else {
    await go("#/connection/settings"); check(!hidden("cnStatus") && hidden("cnSettings"), "editor asking for settings lands on status");
  }
}

// ---- docs
await go("#/docs");
check(on("viewDocs") && /From a document to a decision/.test($("viewDocs").textContent) && /record’s revision/.test($("viewDocs").textContent), "docs page");

// ---- stealth + text hygiene on the served page
const served = fs.readFileSync("index.html", "utf8") + fs.readFileSync("app.js", "utf8");
check(!/dfinity|anthropic|claude|caffeine|bamboo/i.test(served), "no vendor or origin traces in the served page");

// Regression: late reads must not replace newer searches or another record.
let resolveOld;
overrides.listContracts = () => new Promise(r => { resolveOld = r; });
await go("#/contracts/advanced");
overrides.listContracts = async () => [crow({title:"Newest search result"})];
type($("cQ"), "Newest"); await settle();
resolveOld([crow({title:"Stale result"})]); await settle();
check($("cList").textContent.includes("Newest search result") && !$("cList").textContent.includes("Stale result"), "late search cannot overwrite current results");
delete overrides.listContracts;
overrides.getContract = () => new Promise(r => { resolveOld = r; });
await go("#/c/1");
overrides.getContract = async () => [];
await go("#/c/2"); resolveOld([{contract:contract(),row:crow(),responsibleName:"",deputyName:"",viewerNames:[],holderNames:[],proposals:[],sources:[],documents:[],tasks:[],audit:[],rules:[],canEdit:staff}]); await settle();
check($("rTitle").textContent.includes("No such contract"), "late record cannot replace a different ticket route");
delete overrides.getContract;
// Hub notifications select their workspace before loading the source.
await go("#/s/team:1/inbox/7");
check(last("openSpace")?.[1][1] === "team:1" && last("getSource")?.[1][1] === 7n && on("viewSource"), "notification opens the source in its workspace");
// A failed deep-link workspace switch restores a usable previous workspace.
overrides.openSpace = async () => ({ok:false,token:"",detail:"Workspace unavailable"});
await go("#/s/missing/contracts");
check(on("viewSaas") && hidden("workspaceState") && !$("spaceSelect").disabled, "failed space switch restores visible controls");
delete overrides.openSpace;
check(!/^\d{1,2}$/.test($("tStats").lastElementChild?.querySelector(".v")?.textContent || ""), "latest arrival includes an actual date");
if (staff) {
  await go("#/intake/12"); $("review-seats").value="1.5";
  const before=calls.filter(c=>c[0]==="createContractFromSource").length;
  const form=document.querySelector('.intake-form');form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  check(/whole number/.test(form.textContent)&&calls.filter(c=>c[0]==="createContractFromSource").length===before,"invalid seats rejected inline");
  $("review-seats").value="5"; let finish;
  overrides.createContractFromSource=()=>new Promise(r=>{finish=r;});
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle(2);
  check(calls.filter(c=>c[0]==="createContractFromSource").length===before+1,"double submit creates once");
  finish({ok:true,contractId:9n,detail:""});await settle();delete overrides.createContractFromSource;

}

if (role === "admin") {
  await go("#/s/intake/space");
  check(/Access follows your Hub roles/.test($("spContent").textContent), "shared intake displays explicit Hub role policy");
  check(!$("spSave")&&!$("spPerson"), "built-in intake cannot edit its membership locally");
  overrides.setSpaceRelay=async()=>{throw new Error("offline");};
  $("spRelay").value="aaaaa-bbbbb-ccccc";await click($("spRelayConnect"));
  check(/could not be saved/.test($("spRelayStatus").textContent)&&!$("spRelayConnect").disabled,"relay failure recovers controls");delete overrides.setSpaceRelay;
  await go("#/intake/12");const destination=document.querySelector('[data-destination]');destination.value="team:1";destination.dispatchEvent(new window.Event('change'));
  const saves=calls.filter(c=>c[0]==="createContractFromSource").length;
  await click(document.querySelector('[data-move]'));
  check(last("moveIncomingSource")?.[1][2]==="team:1"&&$("spaceSelect").value==="team:1", "move routes into the chosen workspace");
  check(calls.filter(c=>c[0]==="createContractFromSource").length===saves, "routing incoming mail does not create a duplicate contract");
}

if(staff){
  await go('#/intake/12');
  const kind=$('review-recordType');kind.value='receipt';kind.dispatchEvent(new window.Event('change'));await settle();
  check(!document.querySelector('[data-extra-details]').open,'receipts keep optional renewal fields collapsed');
  check(document.querySelector('label[for="review-amountMinor"]').textContent.startsWith('Document total'),'receipt labels its total clearly');
  $('review-title').value='Test receipt';document.querySelector('.intake-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  check(last('createContractFromSource')[1][2].fields.some(f=>f.field==='recordType'&&f.value==='receipt'),'review preserves chosen receipt classification');
  await go('#/intake/12');await click(document.querySelector('[data-delete]'));await click($('cmYes'));
  check(window.location.hash==='#/trash'&&on('viewTrash'),'delete opens workspace trash');
  check(last('setTrashed')[1][1]==='source'&&last('setTrashed')[1][2]===12n&&last('setTrashed')[1][3]===true,'delete targets only current source');
  await click(document.querySelector('[data-restore]'));
  check(last('setTrashed')[1][3]===false&&/Trash is empty/.test($('trashList').textContent),'restore removes the item from trash');
  await go('#/c/1');await click($('rDelete'));await click($('cmYes'));
  check(last('setTrashed')[1][1]==='contract','record delete uses contract scope');
  const purges=calls.filter(c=>c[0]==='deletePermanently').length;
  await click(document.querySelector('[data-purge]'));
  check(/cannot be undone/.test($('cmText').textContent)&&$('cmYes').textContent==='Delete permanently','permanent delete explains its irreversible scope');
  await click($('cmNo'));check(calls.filter(c=>c[0]==='deletePermanently').length===purges,'cancel has no side effects');
  await click(document.querySelector('[data-purge]'));await click($('cmYes'));
  check(last('deletePermanently')[1][1]==='contract'&&last('deletePermanently')[1][2]===1n,'confirmation deletes the selected record only');
  check(/Trash is empty/.test($('trashList').textContent),'deleted item disappears from Trash');
}
if (errors.length) { console.error("SMOKE FAILED (" + mode + "):\n" + errors.join("\n")); process.exit(1); }
console.log(`contracts smoke ok (${mode}): ${calls.length} backend calls, views today/inbox/source/contracts/record/${staff ? "connection/" : ""}docs walked`);
