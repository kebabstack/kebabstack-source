// hub load-smoke: evaluate the inline script in jsdom — catches ReferenceErrors,
// missing ids and syntax slips at module evaluation (the blank-page class).
import { JSDOM } from "jsdom";
import fs from "node:fs";
const html = fs.readFileSync("index.html", "utf8");
const errors = [];
const dom = new JSDOM(html, { url: "https://hub.test/#/people/groups", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {}; // jsdom has none; deep links call it after a timeout
window.addEventListener("error", (e) => errors.push("window.error: " + e.message));
// the shared topbar (sdk/js/hub-client.js, served under dist/sdk/) is an ES module; the classic script reaches it via globalThis.kebabHub
try { window.eval(fs.readFileSync("sdk/hub-client.js", "utf8").replace(/^export (const|function) /gm, "$1 ")); } catch (e) { errors.push("hub-client.js: " + e.message); }
window.eval(fs.readFileSync("permissions.js", "utf8"));
window.eval(fs.readFileSync("updates.js", "utf8"));
window.eval(fs.readFileSync("operations.js", "utf8"));
window.eval(fs.readFileSync("displays.js", "utf8"));
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
for (const [i, src] of scripts.entries()) {
  try { window.eval(src); } catch (e) { errors.push(`script ${i}: ${e.constructor.name}: ${e.message}`); }
}
await new Promise((r) => setTimeout(r, 300));
// exercise pure UI helpers that need no backend
try {
  window.eval(`showTab("users", "groups", true); showTab("settings", "oidc", true); showTab("settings", "admins", true);`);
  const active = [...window.document.querySelectorAll(".spane.active")].map((p) => p.dataset.pane || p.dataset.spane);
  if (!active.includes("users-groups") || !active.includes("admins")) errors.push("tabs did not switch: " + active.join(","));
} catch (e) { errors.push("showTab: " + e.message); }
// skewer: render, click a tray piece, expect it on the stick; locked pieces stay
try {
  window.eval(`window.__sk = { granted: new Set(["identity"]), needs: new Set(["identity","profile"]), wants: new Set(["avatars"]), onChange: (l) => { window.__last = l; } }; const d = document.createElement("div"); document.body.appendChild(d); window.__skRoot = d; renderSkewer(d, window.__sk);`);
  const root = window.__skRoot;
  const selected = () => [...root.querySelectorAll('input[data-lane]:checked')].map(e=>e.dataset.lane);
  if (JSON.stringify(selected()) !== JSON.stringify(["identity", "profile"])) errors.push("data selection initial: " + selected());
  root.querySelector('[data-lane="groups"]').click();
  if (!selected().includes("groups")) errors.push("data selection add failed");
  root.querySelector('[data-lane="groups"]').click();
  if (selected().includes("groups")) errors.push("data selection remove failed");
  root.querySelector('[data-lane="profile"]').click();
  if (!selected().includes("profile") || !root.querySelector('[data-lane="profile"]').disabled) errors.push("required field removable");
  if (!window.__last?.includes("identity")) errors.push("data selection change callback missing");
  window.eval(`wzReset(); wz.step = 1; wz.kind = "hub"; wzPaint();`); // the hub-app path (step 0 is the chooser)
  if (!window.document.querySelector('#wzSteps .wzstep.active')) errors.push("wizard did not paint its steps");
  window.document.getElementById("wzNext").click(); await new Promise((r) => setTimeout(r, 20));
  if (!/press Check first/.test(window.document.getElementById("cwStatus").textContent)) errors.push("wizard step 1 guard missing: " + window.document.getElementById("cwStatus").textContent);
} catch (e) { errors.push("skewer/wizard: " + e.message); }
// the menu: paint with fake apps, pin one, search
try {
  window.eval(`menuApps = [{ id: 1n, name: "desk", note: "requests", kind: "app", url: "https://d" }, { id: 2n, name: "Ship the Bug", note: "", kind: "win", url: "https://g" }, { id: 3n, name: "Wiki", note: "docs", kind: "link", url: "https://w" }]; paintMenu(); greet({ displayName: "Ana Ruiz", email: "ana@x.y", active: true });`);
  const rows = window.document.querySelectorAll("#pApps .mrow").length; if (rows !== 3) errors.push("menu rows: " + rows);
  if (!/Ana/.test(window.document.getElementById("pGreet").textContent)) errors.push("greeting missing name");
  window.document.querySelector('#pApps [data-pin="2"]').click();
  if (window.document.getElementById("pPinned").classList.contains("hidden")) errors.push("pin did not create Your usual");
  if (window.document.querySelectorAll("#pApps .mrow").length !== 2) errors.push("pinned row still in all");
  window.document.getElementById("pMenuSearch").value = "wiki"; window.document.getElementById("pMenuSearch").dispatchEvent(new window.Event("input"));
  if (window.document.querySelectorAll("#pApps .mrow").length !== 1) errors.push("search filter");
  if (window.document.querySelector('#pHome button button')) errors.push("nested menu buttons");
  if (window.document.querySelector('#pApps [data-pin="3"]')?.tagName !== "BUTTON") errors.push("favourite must be a keyboard button");
  const oldOpen = window.openApp;
  window.openApp = id => { window.__openedMenuId = Number(id); };
  window.document.getElementById("pMenuSearch").value = "e";
  window.document.getElementById("pMenuSearch").dispatchEvent(new window.Event("input"));
  window.document.getElementById("pMenuSearch").dispatchEvent(new window.KeyboardEvent("keydown", {key:"Enter"}));
  if (window.__openedMenuId !== 1) errors.push("Enter opened a hidden favourite instead of first visible match");
  window.openApp = oldOpen;
  window.document.getElementById("pMenuSearch").value = "nonexistent-app";
  window.document.getElementById("pMenuSearch").dispatchEvent(new window.Event("input"));
  window.document.querySelector('[data-menu-clear]').click();
  if (window.document.getElementById("pMenuSearch").value !== "") errors.push("Clear search failed");
  if (window.document.activeElement !== window.document.getElementById("pMenuSearch")) errors.push("Clear search lost keyboard focus");

} catch (e) { errors.push("menu: " + e.message); }
// backups: tabs switch, rows paint from a fake vault status, schedule dialog reads it back
try {
  window.eval(`showTab("backups", "setup", true);`);
  if (!window.document.querySelector('.spane.active[data-pane="backups-setup"]')) errors.push("backups setup tab");
  window.eval(`bkTargets = [{ canisterId: "aaaaa-bbbbb-ccccc-ddddd-cai", name: "hub · backend", kind: "hub-backend" }, { canisterId: "eeeee-fffff-ggggg-hhhhh-cai", name: "desk · backend", kind: "app-backend" }];
    bkStatus = { "aaaaa-bbbbb-ccccc-ddddd-cai": { protected: true, state: "running", snapshots: [{ id: "ab", takenAt: 1700000000000000000n, size: 2048n, note: "n", by: "", kind: "manual" }], snapshotsSize: 2048n, schedule: [{ enabled: true, everyHours: 0n, atHourUtc: 3n, keep: 7n, lastRun: 0n, lastResult: "" }], busy: false, detail: "" },
                 "eeeee-fffff-ggggg-hhhhh-cai": { protected: false, state: "", snapshots: [], snapshotsSize: 0n, schedule: [], busy: false, detail: "not protected yet" } };
    document.getElementById("bkRows").innerHTML = bkTargets.map(bkRow).join(""); bkPaintSchedules();`);
  const rows = window.document.querySelectorAll("#bkRows tr");
  if (rows.length !== 2) errors.push("backups rows: " + rows.length);
  if (!/protected/.test(rows[0].textContent) || !/daily 3:00 UTC/.test(rows[0].textContent)) errors.push("backups protected row text");
  if (!window.document.querySelector('#bkRows [data-bkhow]')) errors.push("unprotected row lacks How to protect");
  if (window.document.querySelectorAll("#bkSchedRows tr").length !== 1) errors.push("schedule rows");
  window.eval(`bkOpenSched("aaaaa-bbbbb-ccccc-ddddd-cai");`);
  if (window.document.getElementById("bkSchedOv").classList.contains("hidden")) errors.push("schedule overlay hidden");
  if (window.document.getElementById("bkSchedN").value !== "3" || window.document.getElementById("bkSchedKeep").value !== "7") errors.push("schedule dialog values");
  window.document.getElementById("bkSchedCancel").click();
} catch (e) { errors.push("backups: " + e.message); }
// home v2: fake backend, fresh hub → 1/5 steps + sample offer; busy hub → attention items + all steps done
try {
  const base = { orgName: "Acme", setupDone: true, people: 1n, active: 1n, inactive: 0n, withKey: 1n, openInvites: 0n, groups: 0n, apps: 0n, tiles: 0n, pendingRequests: 0n, sources: 0n, scimOn: false, vaultId: "", sample: false, role: "owner", recent: [] };
  window.__home = base;
  const fake = { home: async () => window.__home, portalWhoami: async () => [{ displayName: "Nora Kaya", email: "nora@x.y", active: true }], listConnections: async () => [], vaultInfo: async () => ({ vaultId: "" }) };
  window.__smoke.setBackend(fake);
  window._role = "owner";
  await window.eval(`refreshDash()`);
  await new Promise((r) => setTimeout(r, 50));
  const steps = window.document.querySelectorAll("#setupList .step").length; if (steps !== 5) errors.push("home steps: " + steps);
  if (!/1 of 5/.test(window.document.getElementById("setupProgress").textContent)) errors.push("home progress fresh: " + window.document.getElementById("setupProgress").textContent);
  if (!window.document.getElementById("sampleAdd")) errors.push("home: sample offer missing on a fresh hub");
  if (!/Nora/.test(window.document.getElementById("pulseText").textContent)) errors.push("home: greeting lacks the name");
  if (!window.document.querySelector('#statgrid .stat[data-to="#/people/directory"]')) errors.push("home: people card not clickable");
  window.__home = { ...base, people: 24n, active: 23n, inactive: 1n, withKey: 9n, openInvites: 2n, groups: 3n, apps: 2n, tiles: 4n, pendingRequests: 1n, vaultId: "aaaaa-bbbbb-ccccc-ddddd-cai", sample: true };
  await window.eval(`refreshDash()`);
  await new Promise((r) => setTimeout(r, 50));
  if (!/complete/i.test(window.document.getElementById("setupProgress").textContent)) errors.push("home progress busy: " + window.document.getElementById("setupProgress").textContent);
  const attn = window.document.querySelectorAll("#attnList .attn").length; if (attn !== 1) errors.push("home attention items: " + attn); // open invites only — app requests left with 0.19
  if (!window.document.getElementById("sampleRemove")) errors.push("home: remove-sample missing while sample is loaded");
  if (!/ACME/.test(window.document.getElementById("pulseEye").textContent)) errors.push("home: org eyebrow");
} catch (e) { errors.push("home: " + e.message); }
// docs wiki: deep link to a tab + section, generated diagram present, no dangling section links
try {
  window.eval(`location.hash = "#/docs/security/keys"; applyRoute();`);
  if (!window.document.querySelector('.spane.active[data-pane="howit-security"]')) errors.push("docs: security tab not active via deep link");
  if (!window.document.querySelector("#howit svg[aria-label]")) errors.push("docs: architecture svg missing");
  const tabs = new Set([...window.document.querySelectorAll('[data-pane^="howit-"]')].map((p) => p.dataset.pane.slice(6)));
  for (const a of window.document.querySelectorAll('#howit a[href^="#/docs/"]')) { const [, , tab, sec] = a.getAttribute("href").split("/"); if (!tabs.has(tab) || (sec && !window.document.getElementById("doc-" + sec))) errors.push("docs: dangling link " + a.getAttribute("href")); }
} catch (e) { errors.push("docs: " + e.message); }
// Release navigation is integrated into Apps; non-owners cannot open deployment controls.
try {
  window._role='admin'; window.eval('showTab("connectors","updates",true)');
  if(!window.document.querySelector('[data-pane="connectors-apps"].active'))errors.push('release owner guard');
  if(window.document.getElementById('navKitchen'))errors.push('duplicate release navigation');
} catch(e){errors.push('release navigation: '+e.message);}
// apps: one table from fake connectors + tiles + oidc clients, menu switch, panel, wizard chooser
try {
  const fakeApps = {
    listConnectors: async () => [
      { id: 1n, name: "desk", canisterId: "aaaaa-aa", note: "requests", addedAt: 0n, scope: [], filters: [], access: { mode: "everyone", groups: [], roles: [], people: [] }, lanes: ["identity", "profile", "groups", "roles", "notify"], pushedAt: 0n },
      { id: 2n, name: "Grafana", canisterId: "zzzzz-zz", note: "", addedAt: 0n, scope: [], filters: [], access: { mode: "selected", groups: ["IT"], roles: [], people: [] }, lanes: ["identity", "groups"], pushedAt: 0n }],
    listAppLinks: async () => [{ id: 7n, name: "desk", url: "https://d.example/", note: "", kind: "app", connectorId: 1n, hidden: false }, { id: 8n, name: "Handbook", url: "https://h.example/", note: "policies", kind: "link", connectorId: 0n, hidden: true }],
    listOidcClients: async () => [{ cid: 2n, name: "Grafana", clientId: "kb_1", redirectUris: ["https://g.example/login/generic_oauth"], isPublic: false, alg: "RS256", consent: "once", enabled: true, createdAt: 0n, lanes: ["identity", "groups"], access: { mode: "selected", groups: ["IT"], roles: [], people: [] }, tileUrl: "" }],
    listGroups: async () => [], setTileHidden: async () => ({ ok: true, detail: "" }),
  };
  window.__smoke.setBackend(fakeApps);
  // ---- sources: SCIM sources list (0.20), add → key shown once, pause, edit row
  window.__smoke.setBackend({ listConnections: async () => [], getSetup: async () => ({ orgName: "Acme", directoryMode: "hybrid" }), getSettings: async () => ({ autoSyncSecs: 3600n }), listScimSources: fakeApps.listScimSources || (async () => [{ id: 1n, name: "Okta (HQ)", domains: ["acme.example"], enabled: true, createdAt: 0n, lastSeen: 0n, lastOp: "", note: "", userCount: 12n, groupCount: 3n, hasToken: true, legacyToken: false }, { id: 2n, name: "Entra (subsidiary)", domains: [], enabled: false, createdAt: 0n, lastSeen: 0n, lastOp: "", note: "", userCount: 0n, groupCount: 0n, hasToken: true, legacyToken: false }]), addScimSource: async () => ({ ok: true, id: 3n, token: "t".repeat(128), detail: "" }), setScimSourceEnabled: async () => ({ ok: true, detail: "" }), updateScimSource: async () => ({ ok: true, detail: "" }) });
  window._role = "owner";
  await window.eval(`refreshConns()`); await new Promise((r) => setTimeout(r, 30));
  const scards = window.document.querySelectorAll("#scimSources [data-scim]");
  if (scards.length !== 2) errors.push("sources: scim source cards " + scards.length);
  const stxt = window.document.getElementById("scimSources").textContent;
  if (!/Okta \(HQ\)/.test(stxt) || !/12 people/.test(stxt) || !/acme\.example/.test(stxt) || !/paused/.test(stxt) || !/any domain/.test(stxt)) errors.push("sources: card content: " + stxt.slice(0, 200));
  if (!window.document.querySelector('#scimSources [data-scim-rotate="1"]') || !window.document.querySelector('#scimSources [data-scim-remove="2"]')) errors.push("sources: owner buttons");
  if (!/Resume/.test(window.document.querySelector('#scimSources [data-scim-toggle="2"]').textContent)) errors.push("sources: paused source offers Resume");
  window.document.getElementById("scimNewName").value = "Okta (subsidiary)"; window.document.getElementById("scimNewDomains").value = "sub.example, other.example";
  window.document.getElementById("scimAdd").click(); await new Promise((r) => setTimeout(r, 40));
  if (window.document.getElementById("scimNewToken").classList.contains("hidden") || !/t{128}/.test(window.document.getElementById("scimTokenText").textContent)) errors.push("sources: new key shown once");
  if (!/source #3 created/.test(window.document.getElementById("scimStatusTxt").textContent)) errors.push("sources: add status: " + window.document.getElementById("scimStatusTxt").textContent);
  window.document.querySelector('#scimSources [data-scim-edit="1"]').click();
  if (window.document.querySelector('#scimSources [data-scim-editrow="1"]').classList.contains("hidden")) errors.push("sources: edit row opens");
  const uOpts = [...window.document.getElementById("uConn").options].map((o) => o.textContent);
  if (!uOpts.some((t) => /Okta \(HQ\) \(SCIM\)/.test(t)) || !uOpts.some((t) => /Entra/.test(t))) errors.push("users filter lists the SCIM sources: " + uOpts.join("|"));
  const legacyAppRows = fakeApps.listConnectors;
  fakeApps.listConnectors = async () => (await legacyAppRows()).map(c => c.id === 1n ? {...c, permissionsManaged: true, permissionApp: "desk"} : c);
  window.__smoke.setBackend(fakeApps);
  await window.eval(`refreshConnectors()`);
  const trs = window.document.querySelectorAll("#connectorRows tr"); if (trs.length !== 3) errors.push("apps: rows " + trs.length);
  const txt = window.document.getElementById("connectorRows").textContent;
  if (!/Hub permissions/.test(trs[0].cells[1].textContent) || /everyone/.test(trs[0].cells[1].textContent)) errors.push("apps: central policy must replace the retired everyone label");
  if (!/hub app/.test(txt) || !/other software/.test(txt) || !/>link</.test(window.document.getElementById("connectorRows").innerHTML)) errors.push("apps: type pills missing");
  if (txt.indexOf("desk") > txt.indexOf("Grafana") || txt.indexOf("Grafana") > txt.indexOf("Handbook")) errors.push("apps: not alphabetical");
  if (trs[0].cells.length !== 5) errors.push("apps: expected app, access, menu, software and edit columns");
  const sws = window.document.querySelectorAll('#connectorRows input[data-menu-tile]'); if (sws.length !== 2) errors.push("apps: menu switches " + sws.length);
  if (!window.document.querySelector('#connectorRows input[data-menu-needurl]')) errors.push("apps: oidc without address should show a disabled switch");
  await window.eval(`apOpen(2, "oidc")`);
  if (window.document.getElementById("apOv").classList.contains("hidden")) errors.push("apps: panel hidden");
  if (!/Only selected/.test(window.document.getElementById("apAccessSummary").textContent)) errors.push("apps: access summary");
  window.eval(`apShow("tech")`);
  if (window.document.getElementById("apTechOidc").classList.contains("hidden") || !/kb_1/.test(window.document.getElementById("apTech").textContent)) errors.push("apps: oidc technical tab");
  window.eval(`document.getElementById("apClose").click(); document.getElementById("wzOpen").click();`);
  if (!window.document.querySelector('#wzApp .wzpane.active[data-step="0"]')) errors.push("wizard: chooser not first");
  window.document.querySelector('#wzApp [data-wzkind="oidc"]').click();
  if (!window.document.querySelector('#wzApp .wzpane.active[data-step="10"]')) errors.push("wizard: oidc pane not shown");
  window.eval(`document.getElementById("oiBase").value = "https://grafana.acme.com"; oiApplyPreset();`);
  if (window.document.getElementById("oiRedirects").value !== "https://grafana.acme.com/login/generic_oauth" || window.document.getElementById("oiTile").value !== "https://grafana.acme.com/") errors.push("wizard: preset did not prefill");
  window.document.getElementById("wzBack").click();
  if (!window.document.querySelector('#wzApp .wzpane.active[data-step="0"]')) errors.push("wizard: back to chooser");
  window.document.querySelector('#wzApp [data-wzkind="link"]').click();
  if (!window.document.querySelector('#wzApp .wzpane.active[data-step="11"]')) errors.push("wizard: link pane not shown");
  window.document.getElementById("wzClose").click();
} catch (e) { errors.push("apps: " + e.message); }
// version + changelog: chip shows the constant, renderer turns the served markdown into headings/lists
try {
  if (!/^v\d+\.\d+\.\d+$/.test(window.document.getElementById("verText").textContent)) errors.push("version chip: " + window.document.getElementById("verText").textContent);
  window.__clMd = "# T\n\n## [0.8.0] — 2026-09-03\n\n### Added\n- **Apps as one list.** with `code`\n- second\n\n## [0.7.0] — 2026-09-03\n\n### Fixed\n- x\n";
  const html = window.eval(`renderChangelog(window.__clMd)`);
  if (!/<h2>v0\.8\.0<\/h2>/.test(html) || !/<h3>Added<\/h3>/.test(html) || (html.match(/<li>/g) || []).length !== 3 || !/<b>Apps as one list\.<\/b>/.test(html) || !/<code>code<\/code>/.test(html)) errors.push("changelog renderer: " + html.slice(0, 200));
  window.__clMd = "- <script>alert(1)</script>";
  if (/<script/.test(window.eval(`renderChangelog(window.__clMd)`))) errors.push("changelog renderer does not escape");
} catch (e) { errors.push("version: " + e.message); }
// OIDC provider: settings tab, authorize-request parser, consent card from a fake backend (no redirect — jsdom cannot navigate)
try {
  window.eval(`showTab("settings", "oidc", true);`);
  if (!window.document.querySelector('#settings .spane.active[data-spane="oidc"]')) errors.push("oidc: settings tab missing");
  const p = window.eval(`oidcParamsFromHash("#/oidc/authorize?client_id=kb_abc&redirect_uri=https%3A%2F%2Fapp.example%2Fcb&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")`);
  if (!p || p.clientId !== "kb_abc" || p.redirectUri !== "https://app.example/cb" || p.codeChallengeMethod !== "S256" || p.responseType !== "code" || p.scope !== "openid") errors.push("oidc: parser " + JSON.stringify(p));
  if (window.eval(`oidcParamsFromHash("#/oidc/authorize?client_id=x")`) !== null) errors.push("oidc: parser accepted a request without redirect_uri");
  if (window.eval(`oidcParamsFromHash("#/apps/apps")`) !== null) errors.push("oidc: parser matched a normal route");
  const p2 = window.eval(`oidcParamsFromHash("#/oidc/authorize", "?client_id=kb_q&redirect_uri=https%3A%2F%2Fa%2Fcb&state=z")`);
  if (!p2 || p2.clientId !== "kb_q" || p2.state !== "z") errors.push("oidc: parser ignores query before the hash");
  window.sessionStorage.setItem("ks-oidc", JSON.stringify(p));
  const fakeOidc = { oidcPreview: async () => ({ ok: true, name: "Grafana", shares: ["who you are (name, e-mail)", "your groups"], consented: false, email: "jane@acme.com", displayName: "Jane Doe", detail: "" }), oidcAuthorize: async () => ({ ok: true, code: "c", redirectUri: "https://app.example/cb", detail: "" }) };
  window.__smoke.fakeOidc = fakeOidc;
  await window.eval(`showOidcConsent(window.__smoke.fakeOidc, "")`);
  if (window.document.getElementById("oidcOv").classList.contains("hidden")) errors.push("oidc: consent card hidden");
  if (window.document.getElementById("oidcApp").textContent !== "Grafana") errors.push("oidc: app name not shown");
  if (!/your groups/.test(window.document.getElementById("oidcShares").textContent)) errors.push("oidc: shares not shown");
  if (!/jane@acme.com/.test(window.document.getElementById("oidcWho").textContent)) errors.push("oidc: person not shown");
  if (window.document.getElementById("oidcGo").disabled) errors.push("oidc: continue disabled");
  window.__smoke.fakeOidc = { oidcPreview: async () => ({ ok: false, name: "Grafana", shares: [], consented: false, email: "jane@acme.com", displayName: "Jane", detail: "this app is not available to you" }) };
  await window.eval(`showOidcConsent(window.__smoke.fakeOidc, "")`);
  if (!/not available/.test(window.document.getElementById("oidcShares").textContent) || !window.document.getElementById("oidcGo").classList.contains("hidden")) errors.push("oidc: refusal not rendered");
  window.sessionStorage.removeItem("ks-oidc");
} catch (e) { errors.push("oidc: " + e.message); }
// person registry (0.17): the identity card on a person — id, history, former holder, rename for local people
try {
  const calls = [];
  const fakePersons = {
    getUser: async (key) => [{ key, connId: key.startsWith("0:") ? 0n : 1n, connName: "Okta", externalId: "x", email: key.startsWith("0:") ? "ana@acme.com" : "ben@acme.com", displayName: "Ana Ruiz", status: "ACTIVE", active: true, override: [], updatedAt: 0n, attributes: [], kind: "person", forced: false, role: "", personId: "p_3f9a1c77b2e04d5a" }],
    scimStatus: async () => ({ enabled: false }),
    listScimSources: async () => [{ id: 1n, name: "Okta (HQ)", domains: ["acme.example"], enabled: true, createdAt: now, lastSeen: now, lastOp: "POST /Users", note: "", userCount: 12n, groupCount: 3n, hasToken: true, legacyToken: false }, { id: 2n, name: "Entra (subsidiary)", domains: [], enabled: false, createdAt: now, lastSeen: 0n, lastOp: "", note: "paused for migration", userCount: 0n, groupCount: 0n, hasToken: true, legacyToken: false }],
    addScimSource: async () => ({ ok: true, id: 3n, token: "t".repeat(128), detail: "" }),
    rotateScimSourceToken: async () => ({ ok: true, token: "r".repeat(128), detail: "" }),
    setScimSourceEnabled: async () => ({ ok: true, detail: "" }), updateScimSource: async () => ({ ok: true, detail: "" }), removeScimSource: async () => ({ ok: true, detail: "", people: 0n }),
    personCard: async (email) => [{ pid: "p_3f9a1c77b2e04d5a", email, emails: ["ana.old@acme.com", email], createdAt: 0n, sealed: false, formerHolders: ["p_00000000deadbeef"] }],
    renameLocalUser: async (from, to) => { calls.push(["renameLocalUser", from, to]); return { ok: true, detail: "" }; },
    listUsers: async () => ({ items: [], total: 0n }),
  };
  window.__smoke.setBackend(fakePersons);
  window._role = "owner";
  await window.eval(`openDetail("0:ana@acme.com")`); await new Promise((r) => setTimeout(r, 40));
  const D = (id) => window.document.getElementById(id);
  if (D("dPid").textContent !== "p_3f9a1c77b2e04d5a") errors.push("persons: id on the card: " + D("dPid").textContent);
  if (!/earlier addresses: ana\.old@acme\.com/.test(D("dPidHistory").textContent) || !/1 former holder/.test(D("dPidHistory").textContent) || !/nothing of theirs transferred/.test(D("dPidHistory").textContent)) errors.push("persons: history + former holder: " + D("dPidHistory").textContent);
  if (D("dRename").classList.contains("hidden")) errors.push("persons: rename offered for a local person");
  D("dRenameTo").value = "ana.new@acme.com"; window.confirm = () => true; D("dRenameBtn").click(); await new Promise((r) => setTimeout(r, 40));
  if (!calls.some((c) => c[0] === "renameLocalUser" && c[1] === "ana@acme.com" && c[2] === "ana.new@acme.com")) errors.push("persons: rename call " + JSON.stringify(calls));
  await window.eval(`openDetail("1:ben")`); await new Promise((r) => setTimeout(r, 40));
  if (!D("dRename").classList.contains("hidden")) errors.push("persons: no rename for a mastered account");
  window.document.getElementById("detail").classList.add("hidden");
} catch (e) { errors.push("persons: " + e.message); }
// access governance: Access page from a fake backend (requests, grants, reviews), app-panel owners, portal ask + reviews
try {
  const NOW = BigInt(Date.now()) * 1000000n;
  const fakeGov = {
    listUsers: async () => ({ items: [{ email: "ana@acme.com", displayName: "Ana Ruiz" }, { email: "ben@acme.com", displayName: "Ben Ko" }], total: 2n }),
    listConnectors: async () => [
      { id: 1n, name: "desk", canisterId: "aaaaa-aa", note: "", addedAt: 0n, scope: [], filters: [], access: { mode: "everyone", groups: [], roles: [], people: [] }, lanes: ["identity"], pushedAt: 0n, owners: [] },
      { id: 2n, name: "Grafana", canisterId: "zzzzz-zz", note: "", addedAt: 0n, scope: [], filters: [], access: { mode: "selected", groups: ["IT"], roles: [], people: ["ana@acme.com"] }, lanes: ["identity"], pushedAt: 0n, owners: ["ben@acme.com"] }],
    listAppLinks: async () => [], listOidcClients: async () => [],
    governanceSummary: async () => ({ openRequests: 1n, activeGrants: 1n, endingSoon: 0n, openReviews: 1n, overdueReviews: 0n, undecided: 2n }),
    listAccessRequests: async (openOnly) => openOnly
      ? [{ id: 5n, email: "ana@acme.com", cid: 2n, appName: "Grafana", reason: "dashboards", wantedHours: 168n, at: NOW, state: "open", decidedBy: "", decidedAt: 0n, note: "", grantId: 0n }]
      : [{ id: 4n, email: "ben@acme.com", cid: 2n, appName: "Grafana", reason: "", wantedHours: 0n, at: NOW, state: "denied", decidedBy: "root@acme.com", decidedAt: NOW, note: "ask your lead", grantId: 0n }],
    listGrants: async () => [{ id: 9n, email: "ana@acme.com", target: "app:2", targetName: "Grafana", reason: "covering", grantedBy: "root@acme.com", grantedAt: NOW, expiresAt: NOW + 3600n * 1000000000n * 30n, state: "active", endedAt: 0n, endedBy: "" }],
    listReviews: async () => [{ review: { id: 3n, name: "Q3 review", startedBy: "root@acme.com", startedAt: NOW, dueAt: NOW + 86400n * 1000000000n * 7n, state: "open", closedAt: 0n, apps: [2n] }, items: 2n, decided: 0n, removed: 0n, overdue: false }],
    listReviewItems: async () => [
      { id: 21n, reviewId: 3n, cid: 2n, appName: "Grafana", subject: "person:ana@acme.com", detail: "Ana Ruiz", reviewers: ["ben@acme.com"], decision: "", decidedBy: "", decidedAt: 0n, note: "", applied: "" },
      { id: 22n, reviewId: 3n, cid: 2n, appName: "Grafana", subject: "group:IT", detail: "4 members", reviewers: ["ben@acme.com"], decision: "keep", decidedBy: "ben@acme.com", decidedAt: NOW, note: "", applied: "" }],
    requestableApps: async () => [{ cid: 2n, name: "Grafana", note: "dashboards", openRequest: false }],
    myAccessRequests: async () => [{ id: 4n, email: "ben@acme.com", cid: 2n, appName: "Grafana", reason: "", wantedHours: 0n, at: NOW, state: "denied", decidedBy: "root@acme.com", decidedAt: NOW, note: "ask your lead", grantId: 0n }],
    myReviewItems: async () => [{ item: { id: 21n, reviewId: 3n, cid: 2n, appName: "Grafana", subject: "person:ana@acme.com", detail: "Ana Ruiz", reviewers: ["ben@acme.com"], decision: "", decidedBy: "", decidedAt: 0n, note: "", applied: "" }, reviewName: "Q3 review", dueAt: NOW }],
  };
  window.__smoke.setBackend(fakeGov);
  await window.eval(`refreshAccess()`);
  if (!window.document.querySelector('.navstep[data-view="access"]')) errors.push("access: nav entry missing");
  if (!/ana@acme.com/.test(window.document.getElementById("acReqRows").textContent) || !window.document.querySelector('#acReqRows [data-req-approve="5"]')) errors.push("access: open request row");
  if (window.document.querySelector('#acReqRows [data-req-hours="5"]').value !== "168") errors.push("access: asked-for duration not preselected");
  if (!/denied/.test(window.document.getElementById("acReqHistRows").textContent) || !/ask your lead/.test(window.document.getElementById("acReqHistRows").textContent)) errors.push("access: history row");
  if (!/Grafana/.test(window.document.getElementById("acGrantRows").textContent) || !window.document.querySelector('#acGrantRows [data-grant-revoke="9"]') || !/left/.test(window.document.getElementById("acGrantRows").textContent)) errors.push("access: grant row");
  if (window.document.querySelectorAll("#acRevApps input").length !== 2 || !/owner (Ben Ko|ben@acme.com)/.test(window.document.getElementById("acRevApps").textContent) || !/no owner/.test(window.document.getElementById("acRevApps").textContent)) errors.push("access: review app pills");
  if (!/Q3 review/.test(window.document.getElementById("acRevRows").textContent) || !/0 \/ 2/.test(window.document.getElementById("acRevRows").textContent)) errors.push("access: review row");
  if (window.document.getElementById("acReqN").textContent !== "1" || window.document.getElementById("acRevN").textContent !== "2") errors.push("access: tab counts");
  await window.eval(`acShowReview(3)`);
  if (window.document.getElementById("acRevDetail").classList.contains("hidden") || window.document.querySelectorAll("#acRevItemRows tr").length !== 2) errors.push("access: review detail");
  if (!window.document.querySelector('#acRevItemRows [data-item-remove="21"]') || window.document.querySelector('#acRevItemRows [data-item-remove="22"]')) errors.push("access: decided item still offers buttons");
  window.eval(`showTab("access", "reviews", true);`);
  if (!window.document.querySelector('#access .spane.active[data-pane="access-reviews"]')) errors.push("access: tabs");
  // owners in the app panel
  await window.eval(`refreshConnectors()`); await window.eval(`apOpen(2, "hub")`);
  if (!/ben@acme.com/.test(window.document.getElementById("apOwners").textContent) || window.document.getElementById("apOwnersClear").classList.contains("hidden")) errors.push("access: owners in app panel");
  await window.eval(`apOpen(1, "hub")`);
  if (!/Nobody yet/.test(window.document.getElementById("apOwners").textContent)) errors.push("access: no-owner text");
  window.document.getElementById("apClose").click();
  // portal: ask + reviews to do
  window.eval(`portalMode = "passkey";`);
  await window.eval(`renderPortalAsk()`); await window.eval(`renderPortalReviews()`);
  if (window.document.getElementById("pAsk").classList.contains("hidden") || !window.document.querySelector('#pAskRows [data-ask="2"]')) errors.push("portal: ask section");
  if (!/not approved/.test(window.document.getElementById("pAskMine").textContent)) errors.push("portal: own request outcome");
  window.document.querySelector('#pAskRows [data-ask="2"]').click();
  if (window.document.getElementById("askOv").classList.contains("hidden") || !/Grafana/.test(window.document.getElementById("askTitle").textContent)) errors.push("portal: ask dialog");
  window.document.getElementById("askClose").click();
  if (window.document.getElementById("pReviews").classList.contains("hidden") || !window.document.querySelector('#pReviewRows [data-rv-remove="21"]') || !/1 entry/.test(window.document.getElementById("pReviewsMeta").textContent)) errors.push("portal: reviews to do");
} catch (e) { errors.push("access: " + e.message); }
// login: skewer states (waiting → landing / settling), no SSO placeholder text, pictures on menu rows + apps list + panel, menu skewer gone
try {
  if (/No SSO providers configured yet/.test(html)) errors.push("login: SSO placeholder text still present");
  if (window.document.getElementById("pSkewerApps")) errors.push("menu: the little skewer should be gone");
  if (window.document.querySelectorAll("#lgSvg .lg-piece").length !== 4) errors.push("login: skewer pieces");
  window.eval(`loginWait()`);
  if (window.document.getElementById("login").getAttribute("aria-busy") !== "true" || !window.document.getElementById("loginBtn").disabled) errors.push("login: waiting blocks duplicate input");
  window.eval(`loginSettle()`);
  if (window.document.getElementById("login").getAttribute("aria-busy") !== "false" || window.document.getElementById("login").classList.contains("is-waiting")) errors.push("login: cancellation restores ready state");
  // This fixture has no AuthClient; passkeys must stay disabled until one is ready.
  // auth-flow.mjs exercises enabled controls with a fully initialized client.
  if (!window.document.getElementById("loginBtn").disabled) errors.push("login: uninitialized passkey client enabled");
  await window.eval(`loginLand()`);
  if (!window.document.getElementById("authProgress").textContent.includes("Access confirmed")) errors.push("login: verified handoff status");
  window.eval(`loginSettle()`);
  // pictures
  window.URL.createObjectURL = () => "blob:smoke";
  const fakeIcons = {
    tileIcon: async (id) => (Number(id) === 7 ? [{ img: [137, 80, 78, 71], mime: "image/png" }] : []),
    listConnectors: async () => [{ id: 1n, name: "desk", canisterId: "aaaaa-aa", note: "", addedAt: 0n, scope: [], filters: [], access: { mode: "everyone", groups: [], roles: [], people: [] }, lanes: ["identity"], pushedAt: 0n, owners: [] }],
    listOidcClients: async () => [], listGroups: async () => [],
    listAppLinks: async () => [{ id: 7n, name: "desk", url: "https://d.example/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: true }, { id: 8n, name: "Handbook", url: "https://h.example/", note: "", kind: "link", connectorId: 0n, hidden: false, hasIcon: false }],
  };
  window.__smoke.setBackend(fakeIcons); window.__smoke.setAnon(fakeIcons);
  window.document.getElementById("pMenuSearch").value = ""; // the menu test above left a query behind
  window.eval(`iconUrls = {}; menuApps = [{ id: 7n, name: "desk", url: "https://d.example/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: true }, { id: 8n, name: "Handbook", url: "https://h.example/", note: "", kind: "link", connectorId: 0n, hidden: false, hasIcon: false }]; paintMenu();`);
  await new Promise((r) => setTimeout(r, 30));
  const pics = window.document.querySelectorAll("#pApps .mico.pic img");
  if (pics.length !== 1 || !/DE|HA/.test(window.document.getElementById("pApps").textContent)) errors.push("menu: picture row / initials fallback (" + pics.length + ")");
  await window.eval(`refreshConnectors()`);
  await new Promise((r) => setTimeout(r, 30));
  if (window.document.querySelectorAll("#connectorRows .aico").length !== 2 || window.document.querySelectorAll("#connectorRows .aico.pic").length !== 1) errors.push("apps: picture cells");
  await window.eval(`apOpen(1, "hub")`);
  await new Promise((r) => setTimeout(r, 30));
  if (!window.document.getElementById("apIcon").classList.contains("pic") || window.document.getElementById("apIconClear").classList.contains("hidden")) errors.push("apps: panel picture");
  await window.eval(`apOpen(8, "tile")`);
  await new Promise((r) => setTimeout(r, 30));
  if (window.document.getElementById("apIcon").classList.contains("pic") || window.document.getElementById("apIcon").textContent !== "HA" || !window.document.getElementById("apIconClear").classList.contains("hidden")) errors.push("apps: panel initials fallback");
  window.document.getElementById("apClose").click();
} catch (e) { errors.push("login/pictures: " + e.message); }
// settings → AI: tab, info render, lane pill known to the skewer
try {
  window.__smoke.setBackend({ aiInfo: async () => ({ on: true, provider: "openai", url: "https://api.openai.com/v1/chat/completions", model: "gpt-4.1-mini", visionModel: "", keyHint: "…ab12", setAt: BigInt(Date.now()) * 1000000n, apps: [{ id: 1n, name: "desk", hasLane: true, calls: 12n, lastCall: BigInt(Date.now()) * 1000000n, fetches: 3n, lastFetch: BigInt(Date.now()) * 1000000n }, { id: 2n, name: "assets", hasLane: false, calls: 0n, lastCall: 0n, fetches: 0n, lastFetch: 0n }] }) });
  window.eval(`window._role = "owner"; showTab("settings", "ai", true);`);
  if (!window.document.querySelector('#settings .spane.active[data-spane="ai"]')) errors.push("ai: settings tab");
  await window.eval(`refreshAiAdmin()`);
  if (!/on · openai · gpt-4.1-mini/.test(window.document.getElementById("aiState").textContent)) errors.push("ai: state pill");
  if (window.document.querySelectorAll("#aiApps tr").length !== 2 || !/granted/.test(window.document.getElementById("aiApps").textContent) || !/never/.test(window.document.getElementById("aiApps").textContent)) errors.push("ai: apps table");
  if (window.document.getElementById("aiSave").disabled) errors.push("ai: owner cannot edit");
  if (!/lane-ai/.test(html) || !/ai: \{ label: "AI"/.test(html)) errors.push("ai: lane unknown to the wizard");
} catch (e) { errors.push("ai: " + e.message); }
// assistants (0.18): settings card (owner switch, staff list), menu card (code, list, disconnect)
try {
  const NOW = BigInt(Date.now()) * 1000000n;
  const calls = [];
  let enabled = true;
  const fakeAsst = {
    listAssistants: async () => ({ enabled, items: [{ id: 7n, client: "Desktop chat", email: "ana@acme.com", createdAt: NOW, expiresAt: NOW + 86400n * 1000000000n * 20n, lastUsedAt: NOW, uses: 12n, active: true }] }),
    setAssistantsEnabled: async (on) => { calls.push(["setAssistantsEnabled", on]); enabled = on; return { ok: true, detail: "" }; },
    revokeAssistantOf: async (id) => { calls.push(["revokeAssistantOf", id]); return { ok: true, detail: "" }; },
    myAssistants: async () => [{ id: 3n, client: "Desktop chat", email: "me@acme.com", createdAt: NOW, expiresAt: NOW + 86400n * 1000000000n * 30n, lastUsedAt: 0n, uses: 0n, active: true }],
    mintAssistantCode: async () => ({ ok: true, code: "aaaaa-aa.0123456789abcdef0123456789abcdef", detail: "" }),
    revokeAssistant: async (tok, id) => { calls.push(["revokeAssistant", id]); return { ok: true, detail: "" }; },
  };
  window.__smoke.setBackend(fakeAsst); window.__smoke.setAnon(fakeAsst);
  window.eval(`window._role = "owner"; showTab("settings", "ai", true);`);
  await window.eval(`refreshAssistantsAdmin()`);
  const D = (id) => window.document.getElementById(id);
  if (D("asstState").textContent !== "on" || D("asstToggle").textContent !== "Switch off" || D("asstToggle").disabled) errors.push("assistants: owner sees the switch on");
  if (window.document.querySelectorAll("#asstRows tr").length !== 1 || !/ana@acme.com/.test(D("asstRows").textContent) || !/Desktop chat/.test(D("asstRows").textContent) || !window.document.querySelector('#asstRows [data-asst-of="7"]')) errors.push("assistants: staff list with disconnect");
  window.confirm = () => true; D("asstToggle").click(); await new Promise((r) => setTimeout(r, 30));
  if (!calls.some((c) => c[0] === "setAssistantsEnabled" && c[1] === false) || D("asstState").textContent !== "off") errors.push("assistants: switch off → pill off: " + D("asstState").textContent);
  window.document.querySelector('#asstRows [data-asst-of="7"]').click(); await new Promise((r) => setTimeout(r, 30));
  if (!calls.some((c) => c[0] === "revokeAssistantOf" && c[1] === 7n)) errors.push("assistants: staff disconnect call");
  // menu card
  window.eval(`portalMode = "passkey";`);
  await window.eval(`loadMyAssistants()`);
  if (!/Desktop chat/.test(D("pAsstList").textContent) || !/not used yet/.test(D("pAsstList").textContent) || !window.document.querySelector('[data-asst-revoke="3"]')) errors.push("assistants: my list: " + D("pAsstList").textContent.slice(0, 80));
  D("pAsstConnect").click(); await new Promise((r) => setTimeout(r, 30));
  if (D("pAsstCode").classList.contains("hidden") || D("pAsstCodeText").textContent !== "aaaaa-aa.0123456789abcdef0123456789abcdef") errors.push("assistants: code shown: " + D("pAsstCodeText").textContent);
  window.document.querySelector('[data-asst-revoke="3"]').click(); await new Promise((r) => setTimeout(r, 30));
  if (!calls.some((c) => c[0] === "revokeAssistant" && c[1] === 3n)) errors.push("assistants: own disconnect call");
  if (!/doc-assistant/.test(html) || !/kebab-mcp/.test(html)) errors.push("assistants: docs card");
} catch (e) { errors.push("assistants: " + e.message); }
// the console wears the same topbar: "Console · company", Menu button, the bell from suiteState (token "" = linked person), person from youPerson
try {
  window.__smoke.setBackend({ suiteState: async () => [{ email: "me@acme.com", displayName: "Me Myself", unread: 2n, expiresAt: 0n, active: true, provider: "passkey" }], portalApps: async () => [], myAvatarPortal: async () => [], getCompanyLogo: async () => [], tileIcon: async () => [] });
  window.document.getElementById("layout").classList.remove("hidden");
  window.eval(`youPerson = { email: "me@acme.com", displayName: "Me Myself" }; window._role = "owner"; window._setup = { orgName: "Acme" };`);
  await window.eval(`mountConsoleTopbar()`); await new Promise((r) => setTimeout(r, 60));
  const d = window.document;
  if (!d.querySelector("#cTopbar .ks-topbar") || !/Console/.test(d.querySelector("#cTopbar #ks-appName").textContent) || !/Acme/i.test(d.querySelector("#cTopbar #ks-eyebrow").textContent)) errors.push("console topbar: not mounted as Console · Acme");
  if (d.querySelector("#cTopbar #ks-badge").hidden || d.querySelector("#cTopbar #ks-badge").textContent !== "2") errors.push("console topbar: bell count from suiteState");
  if (!d.getElementById("cNavBtn")) errors.push("console topbar: mobile navigation button missing");
  if (!/Me Myself/.test(d.querySelector("#cTopbar #ks-identName").textContent)) errors.push("console topbar: person");
  if (d.getElementById("cBell") || d.getElementById("youChip") || d.getElementById("themeBtn")) errors.push("console: old bell/you chip/theme button still present");
  d.querySelector("#cTopbar #ks-ident").click(); await new Promise((r) => setTimeout(r, 20));
  if (!d.getElementById("cYouBtn") || !d.querySelector("#cTopbar #ks-signOut")) errors.push("console topbar: person panel lacks the You section or sign out");
  window.eval(`consoleTopbar.closeAll()`);
} catch (e) { errors.push("console topbar: " + e.message); }
// the shared topbar in the portal: mounts from the SDK, bell count from suiteState, list on open, mark read, menu from portalApps, person panel = the hub's own (picture upload), Slack switch in the footer
try {
  const calls = [];
  const NOW = BigInt(Date.now()) * 1000000n;
  let unread = 2n;
  window.__smoke.setBackend({
    suiteState: async (t) => { calls.push("suiteState:" + t); return [{ email: "ana@acme.com", displayName: "Ana Ruiz", unread, expiresAt: NOW + 3600n * 1000000000n, active: true, provider: "passkey" }]; },
    myNotifications: async (t, n) => { calls.push("myNotifications"); return { total: 2n, unread, slackDm: false, items: [{ id: 7n, email: "ana@acme.com", fromApp: "watch", title: "DNS change: example.com MX", url: "https://watch.test/#/d/1", kind: "watch.dns", at: NOW, read: unread === 0n, slack: "off" }, { id: 6n, email: "ana@acme.com", fromApp: "desk", title: "Ticket #12 answered", url: "https://desk.test/#/t/12", kind: "desk", at: NOW - 3600n * 1000000000n, read: true, slack: "sent" }] }; },
    markNotificationsRead: async (t, ids) => { calls.push("markRead:" + ids.length); unread = 0n; return 1n; },
    portalApps: async () => { calls.push("portalApps"); return [{ id: 1n, name: "desk", url: "https://desk.test/", note: "requests", kind: "app", connectorId: 1n, hidden: false, hasIcon: false }, { id: 2n, name: "watch", url: "https://watch.test/", note: "domains", kind: "app", connectorId: 2n, hidden: false, hasIcon: false }]; },
    myAvatarPortal: async () => [], getCompanyLogo: async () => [], tileIcon: async () => [],
    portalWhoami: async () => [{ email: "ana@acme.com", displayName: "Ana Ruiz", provider: "passkey", expiresAt: NOW + 3600n * 1000000000n, active: true }],
  });
  window.eval(`portalMode = "passkey";`);
  await window.eval(`mountPortalTopbar({ email: "ana@acme.com", displayName: "Ana Ruiz" })`);
  await new Promise((r) => setTimeout(r, 60));
  const d = { getElementById: (id) => window.document.querySelector("#pTopbar #" + id) || window.document.querySelector("#portal #" + id) || window.document.getElementById(id), querySelector: (q) => window.document.querySelector("#pTopbar " + q) || window.document.querySelector(q), querySelectorAll: (q) => window.document.querySelectorAll("#pTopbar " + q), dispatchEvent: (e) => window.document.dispatchEvent(e) };
  if (!window.document.querySelector("#pTopbar .ks-topbar")) errors.push("topbar: not mounted from the SDK");
  if (!d.getElementById("pBell") || !d.getElementById("pThemeBtn") || !d.getElementById("pNameTop") || !d.getElementById("pAviTop")) errors.push("topbar: compat ids missing");
  if (d.getElementById("pBellN").hidden || d.getElementById("pBellN").textContent !== "2") errors.push("topbar: unread badge from suiteState: " + d.getElementById("pBellN").textContent);
  if (!/Ana Ruiz/.test(d.getElementById("pNameTop").textContent) || d.getElementById("pAviTop").textContent !== "AR") errors.push("topbar: person");
  if (!d.getElementById("pConsoleBtn") || !d.getElementById("pConsoleBtn").hidden) errors.push("topbar: Console button present but hidden when not coming from the console");
  if (!/Menu/.test(d.getElementById("ks-appName").textContent) || d.getElementById("ks-fullMenu").hidden !== true) errors.push("topbar on the hub: brand says Menu, no 'Full menu' link to itself");
  d.getElementById("pBell").click(); await new Promise((r) => setTimeout(r, 40));
  if (d.getElementById("ks-notifPanel").hidden || d.querySelectorAll("#ks-notifList .ks-item").length !== 2 || d.querySelectorAll("#ks-notifList .ks-unread").length !== 1) errors.push("topbar: notification list on open");
  if (!d.getElementById("pNotifSlack") || d.getElementById("pNotifSlack").closest("#ks-notifFoot") === null) errors.push("topbar: the hub's Slack switch is not in the footer");
  d.querySelector('#ks-notifList [data-nid="7"]').click(); await new Promise((r) => setTimeout(r, 60));
  if (!calls.includes("markRead:1") || !d.getElementById("pBellN").hidden) errors.push("topbar: open item → mark read → badge gone: " + calls.join(","));
  if (!d.getElementById("ks-notifPanel").hidden) errors.push("topbar: panel should close after opening an item");
  d.getElementById("pBrandHome").click(); // brand click stays in place (portal home)
  d.getElementById("ks-menuBtn").click(); await new Promise((r) => setTimeout(r, 40));
  if (d.getElementById("ks-appsPanel").hidden || d.querySelectorAll("#ks-appsGrid .ks-app").length !== 2 || !calls.includes("portalApps")) errors.push("topbar: app menu");
  if (!d.querySelector("#ks-appsGrid .ks-app .ks-ico.c" + (["c0","c1","c2","c3","c4","c5","c6","c7"].length ? "" : ""))) {} // palette class present
  if (!/c[0-7]/.test(d.querySelector("#ks-appsGrid .ks-ico").className)) errors.push("topbar: app icons use the suite palette");
  d.getElementById("ks-ident").click(); await new Promise((r) => setTimeout(r, 20));
  if (d.getElementById("ks-identPanel").hidden || !d.getElementById("ks-identPanel").contains(d.getElementById("pAviUpload")) || !d.getElementById("ks-signOut") || !/Ana Ruiz/.test(d.getElementById("ks-identNm").textContent) || !/passkey/.test(d.getElementById("ks-identVia").textContent)) errors.push("topbar: person panel = shared template + the hub's picture section: " + d.getElementById("ks-identPanel").textContent.slice(0, 100));
  if (!d.getElementById("ks-appsPanel").hidden) errors.push("topbar: two panels open at once");
  d.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  if (!d.getElementById("ks-identPanel").hidden) errors.push("topbar: Escape did not close");
  // token gone → reconnect state, never a stale zero
  window.__smoke.setBackend({ suiteState: async () => [], myNotifications: async () => ({ total: 0n, unread: 0n, slackDm: true, items: [] }), portalApps: async () => [], myAvatarPortal: async () => [], getCompanyLogo: async () => [], tileIcon: async () => [] });
  await window.eval(`portalTopbar.refresh()`); await new Promise((r) => setTimeout(r, 20));
  if (!d.getElementById("pBell").classList.contains("ks-stale")) errors.push("topbar: expired token should show the stale bell");
  d.getElementById("pBell").click(); await new Promise((r) => setTimeout(r, 30));
  if (!d.getElementById("ks-reconnect")) errors.push("topbar: reconnect link missing when the token is gone");
  window.eval(`portalTopbar.closeAll()`);
} catch (e) { errors.push("topbar: " + e.message); }
// Operations is a console route and discards late reads when navigating away.
try {
  let finish;
  window._role="helpdesk";
  window.__smoke.setBackend({operationsSources:()=>new Promise(resolve=>{finish=resolve;})});
  window.go("operations");
  if(!window.document.getElementById("operations").classList.contains("active") || window.location.hash!=="#/operations") errors.push("Operations route did not open");
  window.go("howit");finish([]);await new Promise(resolve=>setTimeout(resolve,20));
  if(window.document.querySelector("#operations [data-source]")) errors.push("Operations left data after navigation");
} catch(e) { errors.push("Operations: "+e.message); }
console.log(errors.length ? "HUB SMOKE FAIL\n" + errors.join("\n") : "HUB SMOKE OK (" + scripts.length + " scripts evaluated; tabs, data sharing, wizard, menu, apps, backups, home, docs, kitchen, oidc, version, access, persons, assistants, login, pictures, ai, bell exercised)");
process.exit(errors.length ? 1 : 0);
