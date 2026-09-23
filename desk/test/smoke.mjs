import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const html = fs.readFileSync("index.html", "utf8").replace('<script type="module" src="/app.js"></script>', "");
const now = BigInt(Date.now()) * 1000000n;
const H = 3600n * 1000000000n;
const ANA = "p_00000000000000a1", ME = "p_00000000000000ee"; // desk 0.6.0: people are hub person ids
const row = (id, over = {}) => ({ id: BigInt(id), key: "DSK-" + id, typeId: 1n, typeName: "Something is broken", typeIcon: "🔧", subject: "Wifi drops " + id, status: "open", waitingOn: "", priority: "high", requester: ANA, requesterName: "Ana Ruiz", assignee: ME, assigneeName: "Me", queue: "desk-agents", channel: "portal", createdAt: now - 30n * H, updatedAt: now - H, dueAt: [now + 20n * H], respondBy: [now - H], firstResponseAt: [], openTasks: 1n, totalTasks: 2n, approval: "", breached: true, requesterEmail: "ana@example.com", assigneeEmail: "me@example.com", ...over });
const type1 = { id: 1n, name: "Something is broken", icon: "🔧", description: "Laptop, wifi…", fields: [{ key: "where", title: "Where?", kind: "select", options: ["My device", "Office"], required: false, sensitive: false }, { key: "mgr", title: "Manager", kind: "person", options: [], required: true, sensitive: true }], checklist: ["a", "b"], queue: "", approval: "manager", defaultPriority: "normal", respondH: 4n, resolveH: 24n, dueField: "", visibility: "all", enabled: true, sortOrder: 1n };
const calls = [];
let role = process.argv[2] || "admin";
const flow = process.argv[3] || "";
globalThis.__fakeBackend = new Proxy({}, { get: (_, m) => async (...a) => {
  calls.push(m);
  switch (m) {
    case "info": return { orgName: "Acme", hubId: "aaaaa-aa", hubSet: true, appUrl: flow.startsWith("canonical") ? "https://new.desk.test/" : "https://desk.test/", version: "0.8.1" };
    // hub calls made by the shared topbar (same fake actor: the stub ignores the canister id)
    case "suiteState": return [{ email: "me@example.com", displayName: "Me Myself", unread: 3n, expiresAt: now + 3600n * 1000000000n, active: true, provider: "suite" }];
    case "myNotifications": return { total: 1n, unread: 1n, slackDm: true, items: [{ id: 3n, email: "me@example.com", fromApp: "watch", title: "DNS change", url: "https://watch.test/#/d/1", kind: "watch.dns", at: now, read: false, slack: "off" }] };
    case "markNotificationsRead": return 1n;
    case "portalApps": return [{ id: 1n, name: "desk", url: "https://desk.test/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: false }];
    case "myAvatarPortal": case "getCompanyLogo": case "tileIcon": return [];
    case "whoami": return [{ id: ME, email: "me@example.com", displayName: "Me Myself", role, groups: ["desk-agents"], orgName: "Acme", hubId: "aaaaa-aa", needsClaim: role === "admin", aiOn: true }];
    case "loginWithTicket": return [{ token: "t0k", email: "me@example.com", displayName: "Me", role, suiteToken: "su1te" }];
    case "myTickets": case "listTickets": return [row(1), row(2, { status: "waiting", waitingOn: "requester", dueAt: [], breached: false })];
    case "myApprovals": return [row(3, { approval: "pending" })];
    case "stats": return { total: 3n, new: 1n, open: 1n, waiting: 1n, resolved: 0n, closed: 0n, unassigned: 1n, breached: 1n, mine: 1n, approvals: 1n };
    case "catalog": case "adminCatalog": return [type1];
    case "agents": return [{ id: ME, email: "me@example.com", displayName: "Me Myself" }];
    case "workspaceServiceStatus": return [];
    case "oncallCalendar": return [{settings:{revision:0n,archivedAt:0n,retentionDays:730n},absences:[]}];
    case "oncallProjects": return [{id:1n,name:'Operations',description:'Coverage',scope:{internal:'desk-agents'},services:['API']}];
    case "oncallWorkspace": return [{project:{id:1n,name:'Operations',description:'Coverage',scope:{internal:'desk-agents'},services:['API']},members:[{id:ME,name:'Me Myself'}],plans:[],canManage:role==='admin'}];
    case "listCustomerProjects": return [];
    case "directory": return [{ email: "ana@example.com", displayName: "Ana Ruiz", department: "Ops" }];
    case "getTicket": return [{ ticket: { id: 1n, key: "DSK-1", typeId: 1n, subject: "Wifi drops", body: "since monday", status: "waiting", waitingOn: "approval", priority: "high", requester: role === "requester" ? ME : ANA, assignee: "", queue: "desk-agents", channel: "portal", fields: [["where", "Office"]], links: [["asset", "MBP-1"], ["url", "https://x.y"]], createdAt: now - H, updatedAt: now, dueAt: [now + H], respondBy: [], firstResponseAt: [], resolvedAt: [], closedAt: [] }, row: row(1), events: [{ id: 1n, ticketId: 1n, at: now - H, who: ANA, actorKind: "requester", kind: "created", body: "via portal", meta: [] }, { id: 2n, ticketId: 1n, at: now, who: ANA, actorKind: "requester", kind: "comment", body: "hello", meta: [] }, { id: 3n, ticketId: 1n, at: now, who: "ai", actorKind: "ai", kind: "ai", body: "triage", meta: [] }, { id: 4n, ticketId: 1n, at: now, who: ME, actorKind: "agent", kind: "note", body: "internal", meta: [] }, { id: 5n, ticketId: 1n, at: now, who: ME, actorKind: "agent", kind: "file", body: "shot.png", meta: [] }], tasks: [{ title: "a", state: "open", by: "", at: 0n }, { title: "b", state: "done", by: ME, at: now }], approval: [{ approver: "group:desk-admins", state: "pending", decidedBy: "", at: now, note: "" }], files: [{ id: 1n, name: "shot.png", mime: "image/png", size: 2048n, by: ME, at: now }], requester: { id: ANA, email: "ana@example.com", displayName: "Ana Ruiz", title: "Ops", department: "Ops", location: "", manager: "bob@example.com", groups: ["x"], active: true, known: true }, people: [{ id: ANA, email: "ana@example.com", displayName: "Ana Ruiz", title: "Ops", department: "Ops", location: "", manager: "", groups: [], active: true, known: true }, { id: ME, email: "me@example.com", displayName: "Me Myself", title: "", department: "IT", location: "", manager: "", groups: [], active: true, known: true }], requestType: [type1], canAct: role !== "requester", canApprove: role === "admin", role , slack: [{ channel: "C0123ABCDEF", channelName: "it-support" }] }];
    case "getSettings": return [{ hubId: "aaaaa-aa", appUrl: "", orgName: "Acme", agentGroup: "desk-agents", adminGroup: "desk-admins", adminEmails: ["me@example.com"], keyPrefix: "DSK", autoCloseDays: 7n, aiProvider: "openai", aiUrl: "", aiModel: "", aiKeySet: false, demoSeeded: false, peopleCount: 5n, lastDirectoryPull: now, agentCount: 1n, adminCount: 1n , aiSource: "hub", aiHubModel: "openai · gpt-4.1-mini"}];
    case "adminLogRows": return [{ at: now, who: "me@example.com", what: "x" }];
    case "slackStatus": return [{ eventsUrl: "https://ccccc-cc.icp.net/slack/events", gateway: "icp.net", bots: [{ id: 1n, name: "Acme bot", teamName: "Acme", hasSigning: true, botKnown: true }], credsAt: now, credsError: "", outbox: 0n, intakes: [{ id: 1n, name: "#it-support", hubBotId: 1n, channel: "C0123ABCDEF", channelName: "it-support", typeId: 1n, enabled: true, createdAt: now, lastEventAt: now, lastResult: "DSK-7 created from a message" }] }];
    case "slackChannels": return { ok: true, detail: "", channels: [["C0123ABCDEF", "it-support"], ["C0999ZZZZZZ", "helpdesk"]] };
    case "slackRefresh": return { ok: true, count: 1n, detail: "" };
    case "slackSayHello": return { ok: true, detail: "posted — check the channel" };
    case "addSlackIntake": return { ok: true, id: 2n, detail: "" };
    default: return { ok: true, detail: "", id: 1n, key: "DSK-1", text: "draft" };
  }
} });
const dom = new JSDOM(html, { url: "https://desk.test/#uht=" + "ab".repeat(20), runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document; globalThis.location = window.location; globalThis.history = window.history; globalThis.localStorage = window.localStorage; globalThis.sessionStorage = window.sessionStorage;
let jump = "";
if (flow) {
  const sdk = await import(pathToFileURL(path.resolve("hub-client.js")).href);
  history.replaceState(null, "", "/#/t/1");
  if (flow !== "canonical") {
    sdk.hubJumpUrl("https://hub.test/", "https://desk.test/");
    history.replaceState(null, "", "/#uht=" + "ab".repeat(20) + "&th=dark");
  } else history.replaceState(null, "", "/?discard=private#/t/1");
  if (flow.startsWith("canonical")) globalThis.location = new Proxy({}, { get: (_, key) => key === "replace" ? (url) => { jump = url; } : window.location[key] });
}
globalThis.setInterval = () => 0; window.scrollTo = () => {}; globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error("alert: " + m) };
globalThis.Blob = window.Blob; globalThis.URL = window.URL;
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
process.on("unhandledRejection", (e) => errors.push("unhandled: " + (e && e.message)));
// stub fetch of the module graph: rewrite import of agent-bundle to our stub (same name, cwd) — imports are relative so this just works
await import(pathToFileURL(path.resolve("app.js")).href);
const tick = () => new Promise((r) => setTimeout(r, 30));
for (let i = 0; i < 5; i++) await tick();
const check = (cond, msg) => { if (!cond) errors.push("ASSERT " + msg) };
if (flow.startsWith("canonical")) {
  check(jump === "https://new.desk.test/#/t/1", "old links retain the ticket ID without transferring secrets");
  check(!calls.includes("loginWithTicket") && !calls.includes("whoami"), "old-origin tickets and sessions are not used");
  check(!document.getElementById("layout").classList.contains("on"), "old origin does not render ticket data");
  console.log(flow, errors.length ? errors.join("\n") : "SMOKE OK"); process.exit(errors.length ? 1 : 0);
}
if (flow === "return") {
  check(location.hash === "#/t/1", "ticket route restored after Hub sign-in");
  check(calls.includes("loginWithTicket") && calls.includes("getTicket"), "returned session opens the requested ticket");
}
check(window.document.getElementById("layout").classList.contains("on"), "layout shown after ticket login");
check(!!window.document.querySelector("#topbar .ks-topbar") && /Desk/.test(window.document.getElementById("ks-appName").textContent) && window.document.getElementById("ks-badge").textContent === "3", "shared topbar mounted above the sidebar with the bell count");
check(!window.document.getElementById("themeBtn") && !window.document.getElementById("whoChip") && !window.document.getElementById("hubLink"), "no app-specific header elements left");
check(!window.location.hash.includes("uht="), "ticket stripped from URL");
const go = async (h) => { window.location.hash = h; window.dispatchEvent(new window.Event("hashchange")); for (let i = 0; i < 4; i++) await tick(); };
await go("#/queue"); if (role !== "requester") check(document.querySelectorAll("#qRows tr").length === 2, "queue rows: " + document.querySelectorAll("#qRows tr").length);
const beforeOncall=calls.filter(x=>x==='oncallProjects'||x==='oncallWorkspace').length;
await go('#/service-status');check(/No status pages/.test(document.getElementById('v-service-status').textContent),'every active role can open published workspace status');
await go('#/oncall');
if(role==='requester'){
  check(!document.querySelector('[data-view="oncall"]'), 'requesters have no on-call navigation');
  check(calls.filter(x=>x==='oncallProjects'||x==='oncallWorkspace').length===beforeOncall,'requester route cannot load on-call data');
}else{
  check(document.querySelector('#v-oncall.active .oc-project'),'staff on-call overview mounted');
  await go('#/oncall/1');check(/No coverage published yet/.test(document.getElementById('v-oncall').textContent),'empty project has a clear next step');
  await go('#/oncall/new');check(!!document.getElementById('ocProjectForm')===(role==='admin'),'only admins get project setup');
}
await go("#/me"); check(document.querySelectorAll("#meRows tr").length === 2, "my rows"); check(!document.getElementById("meApprovals").classList.contains("hidden"), "approvals card visible");
check(!document.getElementById('v-oncall').textContent,'leaving on-call clears its context');
await go("#/new"); check(document.querySelectorAll("#catGrid .cat").length === 1, "catalog cards");
await go("#/new/1"); check(!document.getElementById("newForm").classList.contains("hidden"), "form shown"); check(document.querySelectorAll("#nfFields [data-key]").length === 2, "fields rendered");
document.getElementById("nfSubject").value = "x"; document.querySelector("#nfFields [data-key=mgr]").value = "manager@example.com"; document.getElementById("nfSubmit").click(); await tick(); await tick(); check(window.location.hash === "#/t/1", "redirect to ticket after file: " + window.location.hash);
for (let i = 0; i < 4; i++) await tick();
check(!document.getElementById("tWrap").classList.contains("hidden"), "ticket shown");
check(document.querySelectorAll("#tTimeline .ev").length === (role === "requester" ? 2 : 4), "timeline events: " + document.querySelectorAll("#tTimeline .ev").length);
check(/Ana Ruiz/.test(document.getElementById("tTimeline").textContent) && /Me Myself/.test(document.getElementById("tTimeline").textContent) && !/p_0000/.test(document.getElementById("tTimeline").textContent), "timeline shows names resolved from person ids, never the ids: " + document.getElementById("tTimeline").textContent.slice(0, 120));
check(!/p_0000/.test(document.getElementById("tFiles").textContent) && /Me Myself/.test(document.getElementById("tFiles").textContent), "file uploader resolved by id");
if (role !== "requester") { await new Promise((r) => setTimeout(r, 30)); const sel = document.getElementById("tAssignee"); check(sel && sel.options.length >= 1 && sel.options[0].value === "", "assignee select present"); }
check(!document.getElementById("tApproval").classList.contains("hidden"), "approval box");
check(/Slack · #it-support/.test(document.getElementById("tOrigin").textContent) && /Slack thread/.test(document.getElementById("cHint").textContent), "slack-anchored ticket shows the channel and the composer says replies reach the thread");
if (role === "admin") { check(!!document.getElementById("apYes"), "approve button for admin"); document.getElementById("apYes").click(); await tick(); await tick(); }
if (role !== "requester") check(document.querySelectorAll("#tStatusBtns button").length > 0, "status buttons");
document.getElementById("cBody").value = "hi"; document.getElementById("cSend").click(); await tick(); await tick();
if (role !== "requester") { document.getElementById("aiDraft").click(); await tick(); await tick(); check(document.getElementById("cBody").value === "draft", "ai draft into box"); }
if (role !== "requester") { document.getElementById("tFieldsEdit").click(); check(!!document.getElementById("tFieldsSave"), "fields edit form"); }
await go("#/agent-new"); check(document.querySelectorAll("#anFields [data-key]").length === (role === "requester" ? 0 : 2), "agent-new fields");
await go("#/settings/catalog"); if (role === "admin") { check(document.querySelectorAll("#ctRows tr").length === 1, "catalog admin rows"); document.querySelector("#ctRows button[data-act=edit]").click(); await tick(); check(!document.getElementById("ctForm").classList.contains("hidden"), "type form opened"); check(document.querySelectorAll("#ctFields .fieldrow").length === 2, "type fields"); document.getElementById("ctSave").click(); await tick(); await tick(); }
await go("#/settings/ai");
if (role === "admin") {
  await go("#/settings/slack"); for (let i = 0; i < 4; i++) await tick();
  check(document.querySelectorAll("#skRows tr").length === 1 && /it-support/.test(document.getElementById("skRows").textContent) && /DSK-7 created/.test(document.getElementById("skRows").textContent), "slack intake row");
  check(document.getElementById("skPill").textContent === "on" && /ccccc-cc\.icp\.net\/slack\/events/.test(document.getElementById("skUrl").textContent), "slack status + events url");
  check(document.getElementById("skBot").options.length === 1 && document.getElementById("skType").options.length === 1, "bot + type pickers filled");
  document.getElementById("skLoad").click(); for (let i = 0; i < 4; i++) await tick(); check(document.getElementById("skChannel").options.length === 2, "channels loaded into picker: " + document.getElementById("skChannel").options.length);
  document.getElementById("skAddBtn").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("addSlackIntake") && /added/.test(document.getElementById("skAddStatus").textContent), "intake added via pickers");
  document.querySelector("#skRows [data-hello]").click(); for (let i = 0; i < 4; i++) await tick(); check(/posted/.test(document.getElementById("skStatus").textContent), "say hello");
}
await go("#/settings/log"); await go("#/settings/general"); await go("#/docs");
if (role === "requester") { check(document.querySelector("#v-queue").classList.contains("active") === false, "requester cannot see queue"); await go("#/queue"); check(document.querySelector("#v-me").classList.contains("active"), "queue redirected to me"); }
console.log(role.toUpperCase(), errors.length ? "FAIL\n" + errors.join("\n") : "SMOKE OK", "| calls:", [...new Set(calls)].length, "distinct backend methods");
process.exit(errors.length ? 1 : 0);
