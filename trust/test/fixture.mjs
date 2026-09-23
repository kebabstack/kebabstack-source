// Fictional data for the isolated workspace preview and browser regressions.
export function installFixture({role="admin",aiOn=true}={}) {
const now = BigInt(Date.now()) * 1000000n;
const posture = [["filevault", true, "encrypted=1"], ["firewall", false, "global_state=0"], ["screenlock", true, "enabled=1"]];
const ME = "p_00000000000000ee"; // trust 0.2.0: owners are hub person ids
const dev = (key, over = {}) => ({ nodeKey: key, hostname: "Ada's MacBook Pro.local", hardwareSerial: "C02XG2JHJGH7", osVersion: "15.6", platform: "darwin", os: "macos", owner: ME, ownerName: "Me Myself", ownerEmail: "me@example.com", ownerSource: "assets", enrolledAt: now - 86400n * 1000000000n, lastSeen: now, postureAt: now, posture, assessment:{state:"attention",expected:4n,passed:2n,failing:1n,pending:1n,errors:0n,stale:0n},failingChecks:["firewall"],score: 50n, failing: 1n, configCurrent: true, demo: false, ...over });
const devs = [dev("n1"), dev("n2", { hostname: "Ben's Air", hardwareSerial: "FVFZK1ABCDEF", owner: "", ownerName: "", ownerSource: "", posture: [], assessment:{state:"pending",expected:4n,passed:0n,failing:0n,pending:4n,errors:0n,stale:0n},failingChecks:[],score: 0n, failing: 0n, configCurrent: false }), dev("demo-1", { hostname: "Sample", hardwareSerial: "DEMO0001", ownerSource: "manual", demo: true,assessment:{state:"passing",expected:4n,passed:4n,failing:0n,pending:0n,errors:0n,stale:0n},failingChecks:[], score: 100n, failing: 0n, posture: ["filevault","firewall","screenlock","chrome"].map(id=>[id,true,"ok"]) })];
const checks = [
  { id: "filevault", title: "Disk encryption (FileVault) on", sql: "SELECT de.encrypted FROM disk_encryption", level: 1n, category: "Encryption", os: "macos", rule: "eq:encrypted:1", enabled: true, custom: false },
  { id: "firewall", title: "Firewall on", sql: "SELECT global_state FROM alf;", level: 1n, category: "Network", os: "macos", rule: "ne:global_state:0", enabled: true, custom: false },
  { id: "screenlock", title: "Screen lock asks for a password", sql: "SELECT enabled FROM screenlock;", level: 1n, category: "Access", os: "macos", rule: "eq:enabled:1", enabled: true, custom: false },
  { id: "firewallStealth", title: "Firewall stealth mode on", sql: "SELECT stealth_enabled FROM alf;", level: 2n, category: "Network", os: "macos", rule: "eq:stealth_enabled:1", enabled: false, custom: false },
  { id: "win_bitlocker", title: "BitLocker on C:", sql: "SELECT protection_status FROM bitlocker_info", level: 1n, category: "Encryption", os: "windows", rule: "eq:protection_status:1", enabled: true, custom: false },
  { id: "chrome", title: "Chrome installed", sql: "SELECT name FROM apps WHERE name = 'Google Chrome.app'", level: 1n, category: "Apps", os: "macos", rule: "nonEmpty", enabled: true, custom: true },
];
const calls = [], deploymentArgs = [], overrides = {};
const ai = { source: aiOn ? "hub" : "", keySet: true, laneGranted: aiOn, connectorId: 7n, model: aiOn ? "openai · gpt-4.1-mini" : "" };
globalThis.__fakeBackend = new Proxy({}, { get: (_, m) => async (...a) => {
  calls.push(m);
  if(overrides[m])return overrides[m](...a);
  switch (m) {
    case "info": return { orgName: "Acme", hubId: "aaaaa-aa", hubSet: true, appUrl: "", version: "0.1.0" };
    case "suiteState": return [{ email: "me@example.com", displayName: "Me Myself", unread: 1n, expiresAt: now + 3600n * 1000000000n, active: true, provider: "suite" }];
    case "myNotifications": return { total: 1n, unread: 1n, slackDm: true, items: [{ id: 3n, email: "me@example.com", fromApp: "trust", title: "Ada's MacBook Pro: Firewall on needs attention", url: "https://trust.test/#/d/n1", kind: "trust.check", at: now, read: false, slack: "off" }] };
    case "markNotificationsRead": return 1n;
    case "portalApps": return [{ id: 1n, name: "trust", url: "https://trust.test/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: false }];
    case "myAvatarPortal": case "getCompanyLogo": case "tileIcon": return [];
    case "whoami": return [{ id: ME, email: "me@example.com", displayName: "Me Myself", role, roleSource: "hub owner", orgName: "Acme", hubId: "aaaaa-aa", needsClaim: false, aiOn, ai, enrollConfigured: true, ownersConfigured: true }];
    case "loginWithTicket": return [{ token: "t0k", email: "me@example.com", displayName: "Me", role, suiteToken: "su1te" }];
    case "devices": return role === "member" ? [devs[0]] : devs;
    case "fleetStats": return [{ devices: 3n, compliant: 1n, avgScore: 55n, activeChecks: 5n, onLatestConfig: 2n, configVersion: 3n, enrollConfigured: true, ownersConfigured: true, unowned: 1n, failingByCheck: [["firewall", "Firewall on", 1n, 2n], ["filevault", "Disk encryption (FileVault) on", 0n, 3n]] }];
    case "checksCatalog": return checks;
    case "recentQueries": return [{ title: "Chrome versions", sql: "SELECT name, bundle_short_version FROM apps WHERE name LIKE '%Chrome%'", source: "ai", createdAt: now }];
    case "deviceDetail": {
      const d=devs.find(x=>x.nodeKey===a[1]);if(!d||(role==='member'&&d.nodeKey!=='n1'))return [];
      return [{device:d,info:d.nodeKey==='n1'?[['os','Operating system',JSON.stringify([{name:'macOS',version:'15.6',build:'24G84'}])],['disk','Disk',JSON.stringify([{free_gb:120.5,total_gb:494.4}])],['uptime','Uptime',JSON.stringify([{total_seconds:'1900000'}])]]:[],
        checks:checks.filter(c=>c.enabled&&(c.os===d.os||c.os==='all')).map(c=>{const p=d.posture.find(p=>p[0]===c.id);return {...c,pass:p?.[1]||false,detail:p?.[2]||'',observedAt:p?d.postureAt:0n,state:['stale','error'].includes(d.assessment.state)?d.assessment.state:p?'current':'pending'};})}];
    }
    case "refreshDeviceInfo": return true;
    case "directory": return [{ email: "ana@example.com", displayName: "Ana Ruiz", department: "Ops" }];
    case "setDeviceOwner": return { ok: true, detail: "" };
    case "aiToQuery": return aiOn ? { ok: true, sql: "SELECT name FROM apps", detail: "" } : { ok: false, sql: "", detail: "no AI key" };
    case "createScopedQuery": case "createQuery": return { ok: true, id: "q1", targeted: a[1].nodeKey ? 1n : 2n, detail: "" };
    case "queryResults": return [{ title: "Chrome versions", sql: "SELECT name FROM apps", answered: a[1] === "q1" ? 2n : 0n, targeted: 2n, rows: [["n1", "Ada's MacBook Pro.local", JSON.stringify([{ name: "Google Chrome.app" }])], ["n2", "Ben's Air", "[]"]] }];
    case "getSettings": return [{ hubId: "aaaaa-aa", appUrl: "", orgName: "Acme", adminGroup: "trust-admins", adminEmails: ["me@example.com"], peopleCount: 12n, lastDirectoryPull: now, adminCount: 1n, assetsId: "bbbbb-bb", ownersCount: 40n, ownersPulledAt: now, ownersLastError: "", manualOwners: 1n, selfId: "ccccc-cc", backendHost: "ccccc-cc.icp.net", gatewayDomain: "icp.net", enrollFingerprint: "••••…9f3a", enrollConfigured: true, versionMode: "stable", pinnedVersion: "5.23.0", stableVersion: "5.24.0", effectiveVersion: "5.24.0", tuneDistInterval: 15n, tuneWatchdogMem: 150n, tuneWatchdogUtil: 30n, tuneScheduleSplay: 30n, configVersion: 3n, ai, demoSeeded: true }];
    case "deploymentFile": {
      deploymentArgs.push(a);
      const kind=a[2], os=a[1];
      if (kind === "background") return [{name:"trust-background.mobileconfig",body:"<plist>org.kebabstack.trust.background</plist>"}];
      if (kind === "notifications") return [{name:"trust-notifications.mobileconfig",body:"<plist>com.apple.BTMNotificationAgent</plist>"}];
      return [{name:os === "windows" ? `trust-${os}-${kind}.ps1` : `trust-${os}-${kind}.sh`,body:`#!/bin/bash\n# Trust ${kind} installer\nVERSION=\"5.23.0\"\n`}];
    }
    case "removedList": return [["ABCDEF123456", now]];
    case "removalRecords": return [];
    case "adminLogRows": return [{ at: now, who: "me@example.com", what: "x" }];
    case "setChecks": checks.forEach(c=>c.enabled=a[1].includes(c.id));return { ok: true, detail: "4 checks active" };
    case "addCheck": return { ok: true, detail: "" };
    case "setTuning": return { ok: true, detail: "" };
    case "pullOwnersNow": return { ok: true, count: 40n, detail: "" };
    default: return { ok: true, detail: "", effective: "5.24.0", count: 1n, removed: 1n };
  }
} });
return {calls,deploymentArgs,devs,checks,overrides,now,setRole:value=>{role=value}};
}
