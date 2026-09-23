// trust frontend smoke: boots dist/ in jsdom against a scripted fake backend and
// walks fleet, one device, checks, ask, enrolment, settings in all three roles.
// Catches the blank-page class (ReferenceError, missing ids, routing, role gates).
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const html = fs.readFileSync("index.html", "utf8").replace('<script type="module" src="./app.js"></script>', "");
import { installFixture } from "./fixture.mjs";
const role = process.argv[2] || "admin", aiOn = process.argv[3] !== "noai";
const fixture=installFixture({role,aiOn}), {calls,deploymentArgs,devs,checks,overrides}=fixture;
const flow=process.argv[3]||'';
if(flow.startsWith('canonical'))overrides.info=()=>({hubId:'aaaaa-aa',hubSet:true,appUrl:'https://new.trust.test/'});
const dom = new JSDOM(html, { url: "https://trust.test/#uht=" + "ab".repeat(20), runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document; globalThis.location = window.location; globalThis.history = window.history; globalThis.localStorage = window.localStorage;
globalThis.sessionStorage=window.sessionStorage;
let redirected='';
if(flow.startsWith('canonical')){
  history.replaceState(null,'','/?private=discard#/d/device-12');
  if(flow==='canonical-ticket'){
    const sdk=await import(pathToFileURL(path.resolve('hub-client.js')).href);
    sdk.hubJumpUrl('https://hub.test/','https://trust.test/');
    history.replaceState(null,'','/#uht='+'ab'.repeat(20)+'&th=dark');
  }
  globalThis.location=new Proxy({}, {get:(_,key)=>key==='replace'?(url)=>{redirected=url;}:window.location[key]});
}
const intervals=[];globalThis.setInterval = callback => {intervals.push(callback);return 0;}; window.scrollTo = () => {}; window.Element.prototype.scrollIntoView = () => {}; globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error("alert: " + m) };
globalThis.Blob = window.Blob; globalThis.URL = window.URL; window.URL.createObjectURL = () => "blob:smoke"; globalThis.URL.createObjectURL = () => "blob:smoke"; globalThis.URL.revokeObjectURL=()=>{};
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => {} } }, configurable: true });
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
process.on("unhandledRejection", (e) => errors.push("unhandled: " + (e && e.message)));
await import(pathToFileURL(path.resolve("app.js")).href);
const tick = () => new Promise((r) => setTimeout(r, 30));
for (let i = 0; i < 6; i++) await tick();
const check = (cond, msg) => { if (!cond) errors.push("ASSERT " + msg) };
const $ = (id) => document.getElementById(id);
if(flow.startsWith('canonical')){
  check(redirected==='https://new.trust.test/#/d/device-12','public device route retained, secrets discarded');
  check(!calls.includes('loginWithTicket')&&!calls.includes('whoami'),'old-origin credentials never redeemed');
  check(!$("layout").classList.contains('on'),'private device data not rendered on old origin');
  console.log(flow,errors.length?errors.join('\n'):'SMOKE OK');process.exit(errors.length?1:0);
}
const go = async (h) => { window.location.hash = h; window.dispatchEvent(new window.Event("hashchange")); for (let i = 0; i < 6; i++) await tick(); };
check($("layout").classList.contains("on"), "layout shown after ticket login");
check(!!document.querySelector("#topbar .ks-topbar") && /Trust/.test($("ks-appName").textContent) && !$("ks-badge").hidden && $("ks-badge").textContent === "1", "shared topbar mounted with the bell count");
check(!window.location.hash.includes("uht="), "ticket stripped from URL");
check(window.location.hash === "#/devices", "lands on devices: " + window.location.hash);
const tabs = [...document.querySelectorAll("#nav .tab")].map((t) => t.dataset.view);
if (role === "admin") {
  check(tabs.join() === "devices,checks,ask,settings,docs", "admin tabs: " + tabs.join());
  check(document.querySelectorAll("#devRows .dev").length === 3, "fleet rows: " + document.querySelectorAll("#devRows .dev").length);
  check(document.querySelectorAll("#stats .stat").length === 4, "fleet stats");
  check(!$("failCard").classList.contains("hidden") && document.querySelectorAll("#failRows .fail").length === 1, "what fails most (only failing checks)");
  document.querySelector("#failRows .fail").click(); await tick();
  check(document.querySelectorAll("#devRows .dev").length === 1 && /failing/.test($("devCount").textContent), "filter by failing check");
  document.querySelector("#failRows .fail").click(); await tick(); check(document.querySelectorAll("#devRows .dev").length === 3, "filter cleared");
  $("devQ").value = "ben"; $("devQ").dispatchEvent(new window.Event("input")); check(document.querySelectorAll("#devRows .dev").length === 1, "text filter");
  $("devQ").value = ""; $("devQ").dispatchEvent(new window.Event("input"));
  // device page
  await go("#/d/n1");
  check(/Ada's MacBook Pro/.test($("dName").textContent) && !/\.local/.test($("dName").textContent), "device name cleaned: " + $("dName").textContent);
  check(document.querySelectorAll("#dPosture .tile").length === 4 && document.querySelectorAll("#dPosture .tile.bad").length === 1, "posture tiles");
  check(/1 check needs attention/.test($("dNext").textContent), "next action");
  check(/Me Myself/.test($("dOwnerLine").textContent) && /me@example.com/.test($("dOwnerLine").textContent) && !/p_0000/.test($("dOwnerLine").textContent) && $("dOwnerPick").classList.contains("hidden"), "owner from assets shown as name + address (never the id), not editable: " + $("dOwnerLine").textContent);
  check(document.querySelectorAll("#dFacts .fact").length === 3 && /120.5 GB free/.test($("dFacts").textContent) && !/restart would not hurt/.test($("dFacts").textContent), "facts painted: " + $("dFacts").textContent.slice(0, 80));
  check(!!$("dRemove") && !$("dAskCard").classList.contains("hidden"), "admin controls on device");
  check($("dAiRow").classList.contains("hidden") !== aiOn, "device ask row reflects ai");
  $("dSql").value = "SELECT name FROM apps"; $("dRun").click(); for (let i = 0; i < 6; i++) await tick();
  check(calls.includes("createScopedQuery") && /answered/.test($("dRes").textContent), "device query ran + results: " + $("dRes").textContent.slice(0, 60));
  await go("#/d/n2");
  check(!$("dOwnerPick").classList.contains("hidden") && /Unassigned/.test($("dOwnerLine").textContent), "unowned device editable");
  check(/Agent configuration pending/.test($("dPills").textContent), "config pending pill");
  check(/Waiting for the agent/.test($("dFacts").textContent), "facts pending message");
  $("dOwnerIn").value = "an"; $("dOwnerIn").dispatchEvent(new window.Event("input")); for (let i = 0; i < 10; i++) await tick();
  check(document.querySelectorAll("#dOwnerList [data-email]").length === 1, "directory picker rows");
  document.querySelector("#dOwnerList [data-email]").click(); $("dOwnerSave").click(); for (let i = 0; i < 4; i++) await tick();
  check(calls.includes("setDeviceOwner"), "owner saved via picker");
  // checks
  await go("#/checks");
  check(document.querySelectorAll("#chkGroups .chk").length === 5, "macOS checks incl custom: " + document.querySelectorAll("#chkGroups .chk").length);
  check(document.querySelectorAll("#chkGroups [data-del]").length === 1, "delete only on custom");
  check($("chkSave").disabled, "save disabled when clean");
  const cb = document.querySelector('#chkGroups [data-chk="firewallStealth"]'); cb.checked = true; cb.dispatchEvent(new window.Event("change")); await tick();
  check(!$("chkSave").disabled && /Save changes/.test($("chkSave").textContent), "dirty → save enabled");
  $("chkSave").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("setChecks") && /4 checks active/.test($("chkStatus").textContent), "checks saved");
  document.querySelector('#chkOs [data-os="windows"]').click(); await tick(); check(document.querySelectorAll("#chkGroups .chk").length === 1, "windows tab");
  check(document.querySelectorAll("#recentQ .chk").length === 1 && /drafted by AI/.test($("recentQ").textContent), "recent questions listed");
  $("cId").value = "x1"; $("cTitle").value = "X"; $("cSql").value = "SELECT 1"; $("cSave").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("addCheck") && /added and active/.test($("cStatus").textContent), "custom check added");
  // ask
  await go("#/ask");
  check($("aiOff").classList.contains("hidden") === aiOn && $("aiRow").classList.contains("hidden") !== aiOn, "ai banner/row reflect aiOn");
  if (!aiOn) check(/AI assistance is not enabled/.test($("aiOff").textContent), "banner names the lane as the reason");
  if (aiOn) { $("qQ").value = "which apps"; $("qGen").click(); for (let i = 0; i < 4; i++) await tick(); check($("qSql").value === "SELECT name FROM apps" && /Draft ready/.test($("qGenStatus").textContent), "ai draft into editor"); }
  $("qSql").value = "SELECT name FROM apps"; $("qRun").click(); for (let i = 0; i < 6; i++) await tick();
  check(/Sent to 2 devices/.test($("qRunStatus").textContent) && /2 of 2 answered/.test($("qRes").textContent) && document.querySelectorAll("#qRes tr").length === 2, "fleet query + results table");
  // enrol
  await go("#/enroll");
  check($("st1").classList.contains("done") && /9f3a/.test($("enrollLine").textContent), "secret set state");
  check(/Trust install installer/.test($("insBox").textContent) && $("insName").textContent === "trust-macos-install.sh" && $("insHost").textContent === "ccccc-cc.icp.net", "installer shown");
  check($("bgProfileDl") && $("quietProfileDl"), "macOS deployment profiles available");
  check(deploymentArgs.some(a => a[2] === "install" && a[3] === false), "installer does not require optional global quiet-notification policy");
  document.querySelector('#insOs [data-os="windows"]').click(); for (let i = 0; i < 4; i++) await tick(); check($("insName").textContent === "trust-windows-install.ps1", "windows installer name");
  $("enGen").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("generateEnroll"), "rotate secret");
  // settings
  await go("#/settings");
  check(/Managed by the deployment tool/.test($("verEff").textContent), "deployment tool owns agent updates");
  check(document.querySelectorAll("#rmRows [data-allow]").length === 1, "removed list in settings");
  check(!$("sGroup") && !!document.querySelector("[data-hub-permissions-link]") && $("sAssets").value === "bbbbb-bb" && $("sSelfId").textContent === "ccccc-cc", "settings loaded");
  check($("sOwnPill").textContent === "on" && /40 devices with a person/.test($("sOwnMeta").textContent), "owners wired: " + $("sOwnMeta").textContent);
  check($("sAiPill").textContent === (aiOn ? "on" : "off"), "ai pill");
  check(document.querySelectorAll("#tuneRows input[type=number]").length === 4, "explicit tuning controls");
  check($("sSeed").classList.contains("hidden") && !$("sUnseed").classList.contains("hidden"), "sample fleet buttons reflect seeded");
  check(document.querySelectorAll("#logRows tr").length === 1, "admin log");
  $("sOwnPull").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("pullOwnersNow") && /40 devices/.test($("sOwnStatus").textContent), "pull owners");
  await go("#/docs"); check($("v-docs").classList.contains("active"), "docs");
} else if (role === "helpdesk") {
  check(tabs.join() === "devices,checks,docs", "helpdesk tabs: " + tabs.join());
  check(document.querySelectorAll("#devRows .dev").length === 3 && document.querySelectorAll("#stats .stat").length === 4, "helpdesk sees the whole fleet with stats");
  await go("#/d/n1"); check(!$("dRemove") && $("dAskCard").classList.contains("hidden") && $("dOwnerPick").classList.contains("hidden"), "helpdesk: no admin controls");
  await go("#/settings"); check(!$("v-settings").classList.contains("active") && $("v-devices").classList.contains("active"), "helpdesk cannot open settings");
  await go("#/checks"); check(document.querySelectorAll("#chkGroups input[type=checkbox]").length === 0 && $("chkAdminCard").classList.contains("hidden"), "checks read-only");
} else {
  check(tabs.join() === "devices,checks,docs", "member tabs: " + tabs.join());
  check($("devTitle").textContent === "My devices" && document.querySelectorAll("#devRows .dev").length === 1 && $("stats").classList.contains("hidden"), "member sees own device, no stats");
  await go("#/d/n1"); check(/Ada's MacBook Pro/.test($("dName").textContent) && !$("dRemove") && $("dAskCard").classList.contains("hidden"), "member device page without admin controls");
  await go("#/d/n2"); check(/not found/i.test($("dName").textContent), "member cannot open someone else's device");
  await go("#/ask"); check(!$("v-ask").classList.contains("active"), "member cannot open ask");
  await go("#/enroll"); check(!$("v-enroll").classList.contains("active"), "member cannot open enrolment");
  await go("#/checks"); check(document.querySelectorAll("#chkGroups .chk").length === 5 && /not active/.test($("chkGroups").textContent), "member reads the catalogue incl. inactive marker");
}
if(role==='admin'&&aiOn){
  // A partial/stale fleet must never look all green, even if the historical score is 100.
  const old=devs[1].assessment;
  devs[1].score=100n;devs[1].assessment={...old,state:'stale',pending:0n,stale:4n};
  await go('#/devices');
  check(/Out of date/.test(document.querySelector('#devRows a[href="#/d/n2"]').textContent),'old score does not override fresh assessment');
  document.querySelector('#stats [data-state="unverified"]').click();
  check(document.querySelectorAll('#devRows .dev').length===1,'unverified status narrows the worklist');
  $('devClear').click();devs[1].assessment=old;
  await go('#/settings');
  $('sAssets').value='draft-not-saved';$('tDist').value='45';$('tDist').dispatchEvent(new window.Event('input'));
  const tuningBefore=calls.filter(x=>x==='setTuning').length;
  await new Promise(r=>setTimeout(r,800));
  check(calls.filter(x=>x==='setTuning').length===tuningBefore,'agent tuning never autosaves');
  $('sOwnPull').click();await tick();await tick();
  check($('sAssets').value==='draft-not-saved'&&$('tDist').value==='45','refreshing owners preserves unsaved configuration and tuning');
  $('tuneSave').click();await tick();await tick();check(calls.filter(x=>x==='setTuning').length===tuningBefore+1,'explicit save applies tuning');
  $('tDist').value='4001';$('tuneSave').click();await tick();check(calls.filter(x=>x==='setTuning').length===tuningBefore+1,'out-of-range tuning is rejected before mutation');
  await go('#/ask');
  let finishDraft;overrides.aiToQuery=()=>new Promise(r=>finishDraft=r);
  $('qQ').value='agent version';$('qGen').click();await tick();$('qSql').value='SELECT manual_edit FROM apps';$('qSql').dispatchEvent(new window.Event('input'));
  finishDraft({ok:true,sql:'SELECT late_draft FROM apps',detail:''});await tick();
  check($('qSql').value==='SELECT manual_edit FROM apps','late AI draft never overwrites newer manual SQL');delete overrides.aiToQuery;
  let finishRun,scopeSeen;overrides.createScopedQuery=(_t,_args,scope)=>{scopeSeen=scope;return new Promise(r=>finishRun=r);};
  $('qScope').value='windows';const queryBefore=calls.filter(x=>x==='createScopedQuery').length;$('qRun').click();$('qRun').click();await tick();
  check(scopeSeen==='windows'&&calls.filter(x=>x==='createScopedQuery').length===queryBefore+1,'OS scope passed and duplicate submission blocked');
  finishRun({ok:true,id:'zero',targeted:0n,detail:''});await tick();check(/No enrolled devices/.test($('qRunStatus').textContent),'zero-target query offers a next step');delete overrides.createScopedQuery;
  await go('#/d/n1');
  let finishDevice;overrides.deviceDetail=()=>new Promise(r=>finishDevice=r);$('dRefresh').click();await tick();await go('#/docs');
  finishDevice([{device:{...devs[0],hostname:'LATE PRIVATE DEVICE'},info:[],checks:[]}]);await tick();
  check(!document.body.textContent.includes('LATE PRIVATE DEVICE'),'late device response ignored after navigating away');delete overrides.deviceDetail;
  await go('#/enroll');check($('insBox').textContent.includes('installer'),'admin installer available before role downgrade');
  let finishInstall;overrides.deploymentFile=()=>new Promise(r=>finishInstall=r);document.querySelector('#insOs [data-os="linux"]').click();await tick();
  fixture.setRole('member');for(const callback of intervals)await callback();await tick();
  finishInstall(['SECRET FROM OLD ADMIN REQUEST']);await tick();
  check($('addDevices').classList.contains('hidden')&&!$('v-enroll').classList.contains('active'),'central role downgrade removes enrolment controls immediately after refresh');
  check(!$('insBox').textContent&&!document.body.textContent.includes('SECRET FROM OLD ADMIN REQUEST'),'late admin installer never repaints after downgrade');
  check(!$('dActions').textContent&&!$('logRows').textContent&&!$('qRes').textContent,'private results cleared on role downgrade');
}

console.log(role.toUpperCase(), aiOn ? "" : "(no ai)", errors.length ? "FAIL\n" + errors.join("\n") : "SMOKE OK", "| calls:", [...new Set(calls)].length, "distinct backend methods");
process.exit(errors.length ? 1 : 0);
