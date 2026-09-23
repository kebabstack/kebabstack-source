const now = BigInt(Date.now()) * 1000000n;
const dom1 = { id: 1n, name: "example.com", types: ["A", "MX", "TXT"], enabled: true, watchers: ["p_00000000000000a1"], note: "main site", createdAt: now, createdBy: "me@example.com", lastCheck: now, lastResult: "1 change", expiresAt: "2027-03-01", expiryCheckedAt: now, expiryDetail: "active" };
const rec = (t, status, values, expected) => ({ domainId: 1n, rtype: t, values, expected, status, firstSeen: now, lastSeen: now, lastChangedAt: status === "changed" ? now : 0n, detail: "" });
const row1 = { domain: dom1, records: [rec("A", "ok", ["93.184.216.34"], ["93.184.216.34", "93.184.216.35"]), rec("MX", "changed", ["10 mail.new.example"], ["10 mail.old.example"]), rec("TXT", "ok", ["v=spf1 -all"], ["v=spf1 -all"])], open: 1n, worst: "alert", expiryDays: [178n], grade: "weak" };
const row2 = { domain: { ...dom1, id: 2n, name: "app.example.com", types: ["CNAME"], lastResult: "ok", expiresAt: "" }, records: [rec("CNAME", "ok", ["app.vendor.example"], ["app.vendor.example"])], open: 0n, worst: "ok", expiryDays: [], grade: "n/a" };
for(const r of [row1,row2])r.checks=[{certificateAt:now,certificateDetail:'',certificateEnds:'2027-03-01',certificateRetryAt:0n,postureAt:now,lookalikes:0n}];
row1.checks[0].lookalikes=1n;
const rows=[row2,row1];
if(globalThis.__watchPreview){
 const add=(id,name,patch={})=>{const r=structuredClone(row2);r.domain={...r.domain,id:BigInt(id),name,...patch};r.records.forEach(x=>x.domainId=BigInt(id));rows.push(r);return r;};
 const certFailure=add(3,'api.example.com');certFailure.checks[0].certificateDetail='Certificate check unavailable: upstream returned 503';certFailure.checks[0].certificateAt=now-3n*86400n*1000000000n;certFailure.checks[0].certificateRetryAt=now+2n*3600n*1000000000n;
 const expiry=add(4,'example.dev',{expiresAt:new Date(Date.now()+12*86400000).toISOString().slice(0,10)});expiry.expiryDays=[12n];
 add(6,'archive.example.com',{enabled:false,note:'Retired campaign site'});
 const fresh=add(7,'docs.example.com',{lastCheck:0n});fresh.records=[];fresh.checks=[];
}
const posture = { domainId: 1n, checkedAt: now, dnssec: "unsigned", lock: "locked", mail: "yes", dmarc: "none", spf: "strict", mtaSts: "missing", caa: "missing", detail: "" };
const cert = { domainId: 1n, checkedAt: now, issuers: ["Let's Encrypt"], names: ["example.com", "old.example.com", "shop.example.com"], certEnds: "2026-11-11", certIssuer: "Let's Encrypt", detail: "" };
const look = { name: "examp1e.com", domainId: 1n, registered: true, firstSeen: now, checkedAt: now, registeredSince: now, detail: "" };
const owners = [{ ip: "93.184.216.34", owner: "EDGECAST-NET", org: "Edgecast Inc.", checkedAt: now }];
const report = { id: 1n, month: "2026-08", generatedAt: now, domains: 2n, runs: 2880n, lookups: 23040n, alerts: 3n, accepted: 3n, learned: 4n, problems: 0n, postureWeak: 1n, text: "Acme — domain watch: report for August 2026.\n\n2 domains watched." };
const ev = (id, kind, rtype, before, after, detail) => ({ id: BigInt(id), domainId: 1n, at: now, kind, rtype, before, after, detail, by: "timer" });
const run = { id: 3n, at: now, domains: 2n, queries: 8n, changes: 1n, problems: 0n, detail: "", by: "timer" };
export const calls = []; export const controls = { settingsFailure:false, delayDomain:null };
let role = globalThis.__watchRole || 'admin';
globalThis.__fakeBackend = new Proxy({}, { get: (_, m) => async (...a) => {
  calls.push(m);
  if(m === "getDomain" && controls.delayDomain) return controls.delayDomain(...a);
  if(m === "setSettings" && controls.settingsFailure) return {ok:false,detail:"Synthetic save failure"};
  switch (m) {
    case "info": return { orgName: "Acme", hubId: "aaaaa-aa", hubSet: true, appUrl: "", version: "0.9.0" };
    // hub calls made by the shared topbar (same fake actor: the stub ignores the canister id)
    case "suiteState": return [{ email: "me@example.com", displayName: "Me Myself", unread: 2n, expiresAt: now + 3600n * 1000000000n, active: true, provider: "suite" }];
    case "myNotifications": return { total: 2n, unread: 2n, slackDm: true, items: [{ id: 3n, email: "me@example.com", fromApp: "watch", title: "DNS change: example.com MX", url: "https://watch.test/#/d/1", kind: "watch.dns", at: now, read: false, slack: "off" }, { id: 2n, email: "me@example.com", fromApp: "desk", title: "Ticket answered", url: "https://desk.test/#/t/1", kind: "desk", at: now, read: false, slack: "off" }] };
    case "markNotificationsRead": return 1n;
    case "portalApps": return [{ id: 1n, name: "watch", url: "https://watch.test/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: false }, { id: 2n, name: "desk", url: "https://desk.test/", note: "", kind: "app", connectorId: 2n, hidden: false, hasIcon: false }];
    case "myAvatarPortal": case "getCompanyLogo": case "tileIcon": return [];
    case "whoami": return [{ id: "p_00000000000000ee", email: "me@example.com", displayName: "Me Myself", role, roleSource: "hub owner", orgName: "Acme", hubId: "aaaaa-aa", needsClaim: false }];
    case "loginWithTicket": return [{ token: "t0k", email: "me@example.com", displayName: "Me", role, suiteToken: "su1te" }];
    case "listDomains": return rows;
    case "summary": return [{ domains: BigInt(rows.length), enabled: BigInt(rows.filter(r=>r.domain.enabled).length), open: 1n, warn: 0n, recordSets: 4n, intervalMins: 15n, monitoringSince: now - 86400n * 1000000000n * 3n, runs: 288n, lastRun: [run], changes30d: 1n, events30d: 6n, recipients: ["me@example.com"], expiringSoon: 0n, busy: false, postureWeak: 1n, postureGood: 0n, lookalikesRegistered: 1n, reports: 1n, expiryWarnDays: 14n }];
    case "recentEvents": return [{ event: ev(9, "changed", "MX", ["10 mail.old.example"], ["10 mail.new.example"], "records changed"), domain: "example.com" }, { event: ev(8, "baseline", "A", [], ["93.184.216.34"], "1 record"), domain: "example.com" }];
    case "getDomain": { const row=rows.find(r=>r.domain.id===a[1]); if(!row)return []; return [{ row, events: a[1]===1n?[ev(9, 'changed', 'MX', ['10 mail.old.example'], ['10 mail.new.example'], 'records changed')]:[], watcherNames: ["Ana Ruiz"], watcherEmails: ["ana@example.com"], posture: [a[1]===1n?posture:{...posture,domainId:a[1],dnssec:'signed',dmarc:'reject',caa:'set'}], postureText: "x", cert: [{...cert,names:a[1]===1n?cert.names:[row.domain.name],domainId:a[1],checkedAt:rows.find(r=>r.domain.id===a[1])?.checks[0]?.certificateAt||0n,detail:rows.find(r=>r.domain.id===a[1])?.checks[0]?.certificateDetail||''}], lookalikes: a[1]===1n?[look]:[], owners, registrable: 'example.com', apex: a[1]===1n }]; }
    case "listReports": return [report];
    case "reportNow": return { ok: true, detail: "September 2026 so far — 1 alert, 0 decisions" };
    case "ignoreLookalike": return { ok: true, detail: "" };
    case "listRuns": return Array.from({ length: 25 }, (_, i) => ({ ...run, id: BigInt(30 - i), changes: i === 0 ? 1n : 0n }));
    case "directory": return [{ email: "ana@example.com", displayName: "Ana Ruiz", department: "Ops" }];
    case 'addDomain': {const id=5n,row=structuredClone(row2);row.domain={...row.domain,...a[1],id,lastCheck:0n};row.records=[];row.checks=[];rows.push(row);return {ok:true,detail:'',id};}
    case "checkNow": return { ok: true, detail: "2 domains · 8 lookups · 1 change · 0 problems", run };
    case 'acceptChange': {const r=rows.find(r=>r.domain.id===a[1])?.records.find(r=>r.rtype===a[2]);if(r){r.status='ok';r.expected=[...r.values];}return {ok:true,detail:'Change accepted.'};}
    case 'updateDomain': {const r=rows.find(r=>r.domain.id===a[1]);if(r)Object.assign(r.domain,a[2]);return {ok:true,detail:'Changes saved.'};}
    case "getSettings": return [{ hubId: "aaaaa-aa", appUrl: "", orgName: "Acme", adminGroup: "watch-admins", adminEmails: ["me@example.com"], intervalMins: 17n, expiryWarnDays: 45n, notifyAdmins: true, peopleCount: 12n, lastDirectoryPull: now, adminCount: 1n, monitoringSince: now, trustedOperators: ["Cloudflare"], operatorsSeen: ["Cloudflare", "Edgecast Inc."] }];
    case "adminLogRows": return [{ at: now, who: "me@example.com", what: "x" }];
    case "exportEvidence": return "section,when\ndomain,x\n";
    case "testAlert": return { ok: true, detail: "sent to 1 of 1 (me@example.com) — check the bell on the hub menu" };
    default: return { ok: true, detail: "" };
  }
} });

export { row1, row2, now };
