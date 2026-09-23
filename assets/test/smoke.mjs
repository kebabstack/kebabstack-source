// assets frontend smoke: boots dist/ in jsdom against a scripted fake backend,
// walks intake (hand path + reading path), devices, one device, import, settings,
// in both roles. Catches the blank-page class (ReferenceError, missing ids, routing).
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const html = fs.readFileSync("index.html", "utf8").replace('<script type="module" src="./app.js"></script>', "");
const now = BigInt(Date.now()) * 1000000n;
const ANA = "p_00000000000000a1", ME = "p_00000000000000ee"; // assets 0.6.0: people are hub person ids
const asset = (id, over = {}) => ({ id: BigInt(id), tag: "INV-000" + id, serial: "C02XG2JHJGH" + id, vendor: "Apple", model: "MacBook Pro 14\"", kind: "laptop", status: "assigned", assignee: ANA, holder: "", note: "", createdAt: now, updatedAt: now, createdBy: ME, archived: false, ...over });
const row = (id, over = {}) => ({ asset: asset(id, over), assigneeName: "Ana Ruiz", photoCount: 1n, lastEvent: "handed out to Ana Ruiz", lastAt: now, mdm: id === 1 ? "Iru" : "", mdmUser: id === 1 ? "ben@example.com" : "", mdmMismatch: id === 1, assigneeEmail: over.assignee === "" ? "" : "ana@example.com", createdByName: "Me Myself" });
const ev = (id, kind, detail, photoId = 0n) => ({ id: BigInt(id), assetId: 1n, at: now, by: "Me Myself", kind, detail, to: "", photoId }); // by/to arrive as names (showEvent)
// sales (0.7.0)
const seller = { name: "Acme AG", street: "Musterstrasse", houseNo: "11", postalCode: "8002", town: "Zürich", country: "CH", uid: "CHE-123.456.789", vatRegistered: true };
const buyer = { pid: ANA, name: "Ana Ruiz", email: "ana@example.com", street: "Seestrasse", houseNo: "7b", postalCode: "8802", town: "Kilchberg", country: "CH" };
const billing = { legalName: "Acme AG", street: "Musterstrasse", houseNo: "11", postalCode: "8002", town: "Zürich", country: "CH", uid: "CHE-123.456.789", vatRegistered: true, vatRateBp: 810n, iban: "CH9300762011623852957", currency: "CHF", prefix: "IT-", yearInNumber: true, paymentDays: 14n, lang: "en", depreciationMonths: 36n, floorPct: 10n, minPriceMinor: 5000n, waiverText: "The buyer takes over the device as used equipment. No warranty.", waiverVersion: 2n, footer: "Thank you" };
let saleStatus = "accepted", saleInvoice = "";
const qrPayload = () => ["SPC","0200","1",billing.iban,"S",seller.name,seller.street,seller.houseNo,seller.postalCode,seller.town,"CH","","","","","","","","650.00","CHF","S",buyer.name,buyer.street,buyer.houseNo,buyer.postalCode,buyer.town,"CH","SCOR","RF94IT20260001","Invoice IT-2026-0001 - Used hardware","EPD",""].join("\n");
const sale = (over = {}) => ({ id: 7n, assetId: 1n, status: saleStatus, buyer, grossMinor: 65000n, vatRateBp: 810n, netMinor: 60130n, vatMinor: 4870n, currency: "CHF", proposedMinor: [62000n], priceNote: "battery worn", description: "Used hardware — MacBook Pro 14\" · serial C02XG2JHJGH1 · INV-0001", wiped: true, mdmRemoved: true, checksBy: ME, waiverVersion: 2n, acceptedBy: saleStatus === "offered" ? "" : ANA, acceptedAt: saleStatus === "offered" ? 0n : now, acceptedHow: saleStatus === "offered" ? "" : "online", invoiceNo: saleInvoice, issuedAt: saleInvoice ? now : 0n, issuedOn: saleInvoice ? "2026-09-07" : "", dueOn: saleInvoice ? "2026-09-21" : "", reference: saleInvoice ? "RF94IT20260001" : "", pdfId: saleInvoice ? 3n : 0n, pdfHash: "", paidAt: 0n, paidNote: "", creditNoteNo: "", cancelledAt: 0n, cancelReason: "", creditPdfId: 0n, createdBy: ME, createdAt: now, updatedAt: now, ...over });
const invoiceData = () => ({ kind: "invoice", number: "IT-2026-0001", issuedOn: "2026-09-07", dueOn: "2026-09-21", reference: "RF94IT20260001", referencePretty: "RF94 IT20 2600 01", seller, ibanPretty: "CH93 0076 2011 6238 5295 7", buyer, description: sale().description, netMinor: 60130n, vatRateBp: 810n, vatMinor: 4870n, grossMinor: 65000n, currency: "CHF", net: "601.30", vat: "48.70", gross: "650.00", vatRate: "8.1", qrPayload: qrPayload(), lang: "en", footer: "Thank you", waiverText: billing.waiverText, waiverVersion: 2n, acceptedLine: "Accepted online by Ana Ruiz (ana@example.com) on 2026-09-06 via the company sign-in — terms v2, sale record #7.", creditOf: "" });
const saleView = (over = {}) => { const s = sale(over); return { handedOverAt: fakeDeal.handedOverAt, stillInAbm: (s.status === "paid" || s.status === "issued") ? "Apple Business Manager · Group · Iru · Group" : "", sale: s, deviceName: "Apple MacBook Pro 14\"", deviceTag: "INV-0001", deviceSerial: "C02XG2JHJGH1", createdByName: "Me Myself", acceptedByName: "Ana Ruiz", checksByName: "Me Myself", invoice: s.invoiceNo ? [invoiceData()] : [], creditNote: [], proposal: [{ proposedMinor: 62000n, basis: "purchase price 2'999.00 CHF on 2024-03-01 · 30 of 36 months elapsed" }], waiverText: billing.waiverText, waiverVersion: 2n }; };
// Apple Business Manager (0.8.0)
const abmDev = (serial, mdmServer, over = {}) => ({ serial, connId: 1n, connName: "Apple Business Manager · Group", model: "MacBook Pro 14\"", family: "Mac", productType: "MacBookPro18,3", capacity: "512GB", color: "Space Gray", orderNo: "W123", orderDate: "2024-03-12", addedAt: "2024-03-14", source: "RESELLER", status: mdmServer ? "ASSIGNED" : "UNASSIGNED", mdmServer, updatedAt: "2026-09-01", syncedAt: now, ...over });
const abmConns = [{ id: 1n, name: "Apple Business Manager · Group", clientId: "BUSINESSAPI.11111111-2222-3333-4444-555555555555", keyId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", signedUntil: now + 170n * 86400n * 1000000000n, scope: "business.api", enabled: true, createdAt: now, lastSync: now, lastResult: "3 devices · 1 in the register · 2 not in the register · 1 without a device-management service · 2 services", devices: 3n, matched: 1n, unmatched: 2n, noMdm: 1n }];
const abmRows = [
  { device: abmDev("C02XG2JHJGH1", "Iru · Group"), assetId: [1n], assetTag: "INV-0001", assetStatus: "assigned", assigneeName: "Ana Ruiz" },
  { device: abmDev("F9XQ2ABM0001", "Iru · Group", { model: "iPhone 15", family: "iPhone", productType: "iPhone15,4", capacity: "128GB", color: "Black", orderDate: "2025-01-20" }), assetId: [], assetTag: "", assetStatus: "", assigneeName: "" },
  { device: abmDev("F9XQ2ABM0002", "", { model: "iPad Air", family: "iPad", productType: "iPad13,16", capacity: "64GB", color: "Blue", orderDate: "2023-11-02", source: "APPLE" }), assetId: [], assetTag: "", assetStatus: "", assigneeName: "" },
  { device: abmDev("SOLD00000001", "Iru · Group", { model: "MacBook Air 13\"", orderDate: "2021-05-05" }), assetId: [4n], assetTag: "INV-0004", assetStatus: "sold", assigneeName: "" },
];
const adopted = [];
let lastAssertion = "";
// a real P-256 key so the browser-side signing can be verified here
import { generateKeyPairSync, verify as cryptoVerify } from "node:crypto";
const abmPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const abmPemPkcs8 = abmPair.privateKey.export({ type: "pkcs8", format: "pem" });
const abmPemSec1 = abmPair.privateKey.export({ type: "sec1", format: "pem" });
let attached = null;
const calls = [];
let role = process.argv[2] || "admin";
let aiOn = process.argv[3] !== "noai";
const flow = process.argv[4] || "";
let fakeDeal = { exists:false, active:false, expiresAt:now+14n*86400n*1000000000n, generation:0n, openedAt:0n, downloadedAt:0n, completedAt:0n, handedOverAt:0n, history:[], notification:"" };
globalThis.__fakeBackend = new Proxy({}, { get: (_, m) => async (...a) => {
  calls.push(m);
  switch (m) {
    case "info": return { orgName: "Acme", hubId: "aaaaa-aa", hubSet: true, appUrl: flow.startsWith("canonical") ? "https://new.assets.test/" : "https://assets.test/", version: "0.1.0" };
    // hub calls made by the shared topbar (same fake actor: the stub ignores the canister id)
    case "suiteState": return [{ email: "me@example.com", displayName: "Me Myself", unread: 1n, expiresAt: now + 3600n * 1000000000n, active: true, provider: "suite" }];
    case "myNotifications": return { total: 1n, unread: 1n, slackDm: true, items: [{ id: 3n, email: "me@example.com", fromApp: "desk", title: "Ticket answered", url: "https://desk.test/#/t/1", kind: "desk", at: now, read: false, slack: "off" }] };
    case "markNotificationsRead": return 1n;
    case "portalApps": return [{ id: 1n, name: "assets", url: "https://assets.test/", note: "", kind: "app", connectorId: 1n, hidden: false, hasIcon: false }];
    case "myAvatarPortal": case "getCompanyLogo": case "tileIcon": return [];
    case "whoami": return [{ id: ME, email: "me@example.com", displayName: "Me Myself", role, roleSource: "hub owner", orgName: "Acme", hubId: "aaaaa-aa", needsClaim: false, aiOn, aiSource: aiOn ? "hub" : "", ai: { source: aiOn ? "hub" : "", keySet: true, laneGranted: aiOn, connectorId: 7n, model: aiOn ? "openai · gpt-4.1-mini" : "" } }];
    case "loginWithTicket": return flow === "rejected" ? [] : [{ token: "t0k", email: "me@example.com", displayName: "Me", role, suiteToken: "su1te" }];
    case "stats": return { total: 3n, byStatus: [["assigned", 2n], ["in_stock", 1n]], recent: [{ event: ev(9, "handed_out", "handed out to Ana Ruiz", 5n), name: "Apple MacBook Pro 14\"" }], photos: 1n, photoBytes: 120000n };
    case "listAssets": return [row(1), row(2, { status: "in_stock", assignee: "" }), row(3, { kind: "phone", model: "iPhone 15", serial: "G6TX9RQ2L7" })];
    case "pendingHandoverCount": return 0n;
    case "handoverOf": case "formerBuyerStatus": return [];
    case "getAsset": return [{ asset: asset(1), assigneeName: "Ana Ruiz", assigneeEmail: "ana@example.com", createdByName: "Me Myself", events: [ev(9, "handed_out", "handed out to Ana Ruiz", 5n), ev(8, "created", "created via photo intake")], photos: [{ id: 5n, assetId: 1n, eventId: 9n, at: now, by: "me@example.com", mime: "image/jpeg", size: 120000n }], mdm: [{ connId: 1n, connName: "Iru", kind: "iru", externalId: "x1", deviceName: "Ana's MacBook", osVersion: "15.6", lastSeen: "2026-09-04T08:00:00Z", userEmail: "ben@example.com", userName: "Ben Ko", compliance: "", syncedAt: now }], mdmMismatch: true, abm: [abmDev("C02XG2JHJGH1", "Iru · Group")] }];
    case "notifyStatus": return [{ at: now, ok: false, detail: "this app has no notify lane — an admin can grant it under Apps → Lanes", to: "ana@example.com", title: "A device is offered to you — review the price and terms" }];
    case "offerSale": return { ok: true, detail: "offered — but Ana Ruiz could NOT be notified: this app has no notify lane — an admin can grant it under Apps → Lanes. Tell them yourself, or fix it under Settings → Notifications" };
    case "listAbm": return abmConns;
    case "addAbm": lastAssertion = a[1].assertion[0] || ""; abmConns.push({ id: 2n, name: a[1].name || "Apple Business Manager", clientId: a[1].clientId, keyId: a[1].keyId, signedUntil: now + 179n * 86400n * 1000000000n, scope: "business.api", enabled: true, createdAt: now, lastSync: 0n, lastResult: "", devices: 0n, matched: 0n, unmatched: 0n, noMdm: 0n }); return { ok: true, detail: "", id: 2n };
    case "updateAbm": return { ok: true, detail: "" };
    case "removeAbm": return { ok: true, detail: "devices already in the register stay" };
    case "testAbm": return { ok: true, detail: "reached Apple Business Manager · Group: 3 devices on the first page, 1 already in the register" };
    case "syncAbm": return { ok: true, detail: "3 devices · 1 in the register · 2 not in the register · 1 without a device-management service · 2 services" };
    case "listAbmDevices": return abmRows.filter((r) => a[1] === "all" || (a[1] === "unmatched" && !r.assetId.length) || (a[1] === "matched" && r.assetId.length) || (a[1] === "nomdm" && !r.device.mdmServer) || (a[1] === "sold" && ["sold", "scrapped", "lost"].includes(r.assetStatus)));
    case "abmAdopt": adopted.push(...a[1]); a[1].forEach((sn) => { const r = abmRows.find((x) => x.device.serial === sn); if (r) { r.assetId = [9n]; r.assetStatus = "unknown"; } }); return { ok: true, detail: a[1].length + " added", created: BigInt(a[1].length) };
    case "photo": return [{ mime: "image/jpeg", bytes: [255, 216, 255] }];
    case "directory": return [{ email: "ana@example.com", displayName: "Ana Ruiz", department: "Ops" }];
    case "intakeMatch": return a[1].some((v) => /C02XG2/i.test(v)) ? [{ row: row(1), score: 90n, why: "serial matches (0/O, 1/I, 5/S read alike) (C02XG2JHJGH1)" }] : [];
    case "intakeRead": return { ok: true, detail: "", reads: [{ kind: "serial", value: "CO2XG2JHJGH1", confidence: 0.55 }, { kind: "asset_tag", value: "INV-0001", confidence: 0.95 }], vendor: "Apple", model: "MacBook Pro 14\"", kind: "laptop", sticker: "current", notes: "sticker slightly worn" };
    case "intakeCommit": return { ok: true, detail: "handed out to Ana Ruiz", assetId: 1n, eventId: 10n };
    case "getSettings": return [{ hubId: "aaaaa-aa", appUrl: "", orgName: "Acme", adminGroup: "assets-admins", adminEmails: ["me@example.com"], tagPrefix: "INV-", peopleCount: 12n, lastDirectoryPull: now, adminCount: 1n, photoBytes: 120000n, aiSource: aiOn ? "hub" : "", aiModel: aiOn ? "openai · gpt-4.1-mini" : "", ai: { source: aiOn ? "hub" : "", keySet: true, laneGranted: aiOn, connectorId: 7n, model: "" } }];
    case "adminLogRows": return [{ at: now, who: "me@example.com", what: "x" }];
    case "importCsv": return { ok: true, created: 2n, updated: 1n, skipped: 0n, detail: "" };
    case "exportCsv": return "id,tag\n1,INV-0001\n";
    case "listMdm": return [{ id: 1n, kind: "iru", name: "Iru", url: "https://acme.api.kandji.io", clientId: "", secretSet: true, enabled: true, createdAt: now, lastSync: now, lastResult: "42 devices · 40 matched · 2 created · 1 mismatch", devices: 42n, matched: 40n, created: 2n }];
    case "testMdm": return { ok: true, detail: "reached Iru: 42 devices on the first page, 40 already in the register" };
    case "syncMdm": return { ok: true, detail: "42 devices · 40 matched · 2 created" };
    case "addMdm": return { ok: true, detail: "", id: 2n };
    // sales
    case "saleOfDevice": return { purchase: [{ priceMinor: 299900n, currency: "CHF", date: "2024-03-01", note: "shop", by: ME, at: now }], sale: [], proposal: [{ proposedMinor: 62000n, basis: "purchase price 2'999.00 CHF on 2024-03-01 · 30 of 36 months elapsed" }], billingReady: "" };
    case "priceProposal": return [{ proposedMinor: 62000n, basis: "rule" }];
    case "createSale": return { ok: true, id: 7n, detail: "" };
    case "salesBoard": { const rows = [saleView(), saleView({ id:8n,status:"paid",invoiceNo:"IT-2026-0002",pdfId:3n })].map(v => ({...v.sale, buyerName:v.sale.buyer.name, deviceName:v.deviceName, deviceTag:v.deviceTag, phase:v.sale.status === "paid" ? "paid" : v.sale.status === "issued" ? "invoice" : "offer", receiptPending:false})); return {counts:[["offer",1n],["paid",1n]],total:2n,matched:2n,rows,hasMore:false}; }
    case "deviceUnlockPin": return {ok:true,pin:"001234",detail:"Visible for 30 seconds"};
    case "listSales": return [saleView(), saleView({ id: 8n, status: "paid", invoiceNo: "IT-2026-0002", pdfId: 3n, pdfHash: "ab".repeat(32) })];
    case "getSale": return [saleView()];
    case "myOffers": return [saleView({ status: "offered", acceptedBy: "", acceptedAt: 0n, acceptedHow: "", buyer: { ...buyer, street: "", houseNo: "", postalCode: "", town: "" } }), saleView({ id: 8n, status: "paid", invoiceNo: "IT-2026-0002", pdfId: 3n, pdfHash: "ab".repeat(32) })];
    case "acceptOffer": return { ok: true, detail: "" };
    case "issueInvoice": saleStatus = "issued"; saleInvoice = "IT-2026-0001"; return { ok: true, detail: "", invoiceNo: "IT-2026-0001" };
    case "attachSaleDocument": attached = { id: a[1], kind: a[2], bytes: a[3] }; return { ok: true, detail: "", docId: 5n };
    case "saleDocument": return [{ name: "IT-2026-0002.pdf", mime: "application/pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), hash: "ab".repeat(32) }];
    case "dealStatus": return [fakeDeal];
    case "createDealLink": fakeDeal = {...fakeDeal,exists:true,active:true,generation:fakeDeal.generation+1n};saleStatus="offered";return {ok:true,detail:"",url:"https://assets.test/deal.html#7."+"ab".repeat(32),expiresAt:fakeDeal.expiresAt};
    case "revokeDealLink":fakeDeal.active=false;return {ok:true,detail:"link revoked"};
    case "completeSaleHandover": case "completeDealHandover":fakeDeal.handedOverAt=now;return {ok:true,detail:"hand-over recorded"};
    case "getBilling": return [billing];
    case "setBilling": return { ok: true, detail: "saved" };
    case "salesExportCsv": return "number,kind\nIT-2026-0001,invoice\n";
    case "setPurchase": return { ok: true, detail: "" };
    case "markPaid": saleStatus = "paid"; return { ok: true, detail: "" };
    case "setSaleChecks": case "recordWaiver": case "updateSale": return { ok: true, detail: "" };
    case "cancelSale": return { ok: true, detail: "cancelled", creditNoteNo: "" };
    default: return { ok: true, detail: "", id: 1n, eventId: 1n };
  }
} });
const dom = new JSDOM(html, { url: "https://assets.test/#uht=" + "ab".repeat(20), runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document; globalThis.location = window.location; globalThis.history = window.history; globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
let jump = "";
if (flow && flow !== "admin-deal") {
  const sdk = await import(pathToFileURL(path.resolve("hub-client.js")).href);
  history.replaceState(null, "", "/#/offers/7");
  if (["auto", "retry"].includes(flow)) {
    // Capture navigation only; run the real boot/login handler and shared SDK.
    globalThis.location = new Proxy({}, { get: (_, key) => window.location[key], set: (_, key, value) => { if (key === "href") jump = value; else window.location[key] = value; return true; } });
    if (flow === "retry") sessionStorage.setItem("ks-assets-offer-login", String(Date.now()));
  } else if (flow === "signed") localStorage.setItem("ks-assets-session", "existing-session");
  else {
    sdk.hubJumpUrl("https://hub.test/", "https://assets.test/");
    history.replaceState(null, "", "/#uht=" + "ab".repeat(20) + "&th=dark");
  }
  if (flow.startsWith("canonical")) {
    if (flow === "canonical") history.replaceState(null, "", "/?ignored=secret#/offers/7");
    globalThis.location = new Proxy({}, { get: (_, key) => key === "replace" ? (url) => { jump = url; } : window.location[key] });
  }
}
globalThis.setInterval = () => 0; window.scrollTo = () => {}; window.Element.prototype.scrollIntoView = () => {}; globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error("alert: " + m) };
globalThis.Blob = window.Blob; globalThis.URL = window.URL; window.URL.createObjectURL = () => "blob:smoke"; globalThis.URL.createObjectURL = () => "blob:smoke";
// createImageBitmap + canvas are not in jsdom: the intake's shrink() is stubbed by injecting a ready photo
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
process.on("unhandledRejection", (e) => errors.push("unhandled: " + (e && e.message)));
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.PDFLib = require("./vendor/pdf-lib.min.js"); globalThis.qrcode = require("./vendor/qrcode.js");
await import(pathToFileURL(path.resolve("app.js")).href);
const tick = () => new Promise((r) => setTimeout(r, 30));
for (let i = 0; i < 5; i++) await tick();
const check = (cond, msg) => { if (!cond) errors.push("ASSERT " + msg) };
const $ = (id) => document.getElementById(id);
if (flow.startsWith("canonical")) {
  check(jump === "https://new.assets.test/#/offers/7", "domain switch keeps the offer and drops credentials/query strings");
  check(!calls.includes("loginWithTicket") && !calls.includes("whoami"), "old-origin credentials are never used after the domain switch");
  check(!$("layout").classList.contains("on"), "old origin does not render buyer data");
  console.log(flow, errors.length ? errors.join("\n") : "SMOKE OK"); process.exit(errors.length ? 1 : 0);
}
if (["auto", "retry", "rejected"].includes(flow)) {
  check(!$("layout").classList.contains("on"), "no offer is exposed before authentication");
  if (flow === "auto") {
    check(new URL(jump).searchParams.get("jump") === "https://assets.test/", "automatic Hub jump targets this app only");
    check(sessionStorage.getItem("ks-return") === "#/offers/7", "offer survives Hub/Okta sign-in");
  } else check(jump === "", "a failed/rejected login does not loop");
  if (flow === "rejected") check(/not accepted/.test($("loginStatus").textContent), "rejected ticket explains retry");
  console.log(flow, errors.length ? errors.join("\n") : "SMOKE OK"); process.exit(errors.length ? 1 : 0);
}
if (flow === "admin-deal") {
  buyer.pid="";saleStatus="draft";
  location.hash="#/sale/7";for(let i=0;i<5;i++)await tick();
  check(!$("sDealCard").classList.contains("hidden")&&!!$("dealCreate"),"external sale offers dealroom link");
  check(!$("paperBtn")&&!document.querySelector('[data-act="offer"]'),"external flow no longer asks for paper or internal offer");
  $("dealCreate").click();for(let i=0;i<6;i++)await tick();
  check(calls.includes("createDealLink")&&!$("dealLinkBox").classList.contains("hidden")&&$("dealLink").value.includes("deal.html#7."),"new link is shown for copying");
  $("dealRefresh").click();for(let i=0;i<5;i++)await tick();check($("dealLink").value==="","raw link is not retained after refresh");
  saleStatus="issued";saleInvoice="IT-2026-0001";fakeDeal.completedAt=0n;
  $("dealRefresh").click();for(let i=0;i<5;i++)await tick();
  check(!$("ckWiped").disabled&&$("sChecksTitle").textContent==="Prepare for hand-over","preparation remains editable after automatic invoice");
  $("pinRead").click(); for(let i=0;i<4;i++)await tick(); check($("pinValue").textContent==="001234","PIN keeps leading zeros"); $("pinHide").click(); check($("pinValue").textContent==="","hide clears PIN from DOM");
  document.querySelector('[data-act="paid"]').click();await tick();$("sPaidGo").click();for(let i=0;i<5;i++)await tick();
  check(!$("sChecksCard").classList.contains("hidden")&&!$("handoverCard").classList.contains("hidden"),"paid deal still requires hand-over");
  check(!$("handoverGo").disabled && /does not block/.test($("handoverHelp").textContent),"unconfirmed invoice receipt does not block a prepared paid hand-over");
  $("handoverAbm").checked=true;$("handoverGo").click();for(let i=0;i<5;i++)await tick();
  check(calls.includes("completeSaleHandover")&&$("handoverCard").classList.contains("hidden")&&$("ckWiped").disabled,"completed hand-over is locked");
  $("dealRevoke").click();for(let i=0;i<5;i++)await tick();check(calls.includes("revokeDealLink")&&!$("dealRevoke"),"revoke updates the link card");
  console.log("ADMIN DEALROOM", errors.length?errors.join("\n"):"SMOKE OK");process.exit(errors.length?1:0);
}
if (flow) {
  check(location.hash === "#/offers/7", "the exact offer is restored after login");
  check(document.querySelectorAll("#offerRows [data-offer]").length === 1 && !!document.querySelector('[data-offer="7"] [data-accept]'), "only the requested offer is open for review");
  check(!calls.includes("acceptOffer"), "opening the link does not accept the offer");
  check(!sessionStorage.getItem("ks-return"), "return route is consumed");
  console.log(flow, errors.length ? errors.join("\n") : "SMOKE OK"); process.exit(errors.length ? 1 : 0);
}
check($("layout").classList.contains("on"), "layout shown after ticket login");
check(!!document.querySelector("#topbar .ks-topbar") && /Assets/.test($("ks-appName").textContent) && !$("ks-badge").hidden && $("ks-badge").textContent === "1", "shared topbar mounted with the bell count");
check(!document.getElementById("themeBtn") && !document.getElementById("whoChip") && !document.getElementById("hubLink"), "no app-specific header elements left");
check(!window.location.hash.includes("uht="), "ticket stripped from URL");
const go = async (h) => { window.location.hash = h; window.dispatchEvent(new window.Event("hashchange")); for (let i = 0; i < 4; i++) await tick(); };
if (role === "admin") {
  check(window.location.hash === "#/devices", "admin lands on the register: " + window.location.hash);
  check(!$("devScan").classList.contains("hidden"), "admin can see the scan shortcut");
  await go("#/intake");
  check($("aiOff").classList.contains("hidden") === aiOn, "ai banner reflects aiOn");
  if (!aiOn) check(/Find devices by tag or serial/.test($("aiOff").textContent) && !!$("aiOff").querySelector('a[href="#/settings/connections"]'), "banner offers a manual fallback and settings link"); // the deep link needs a real HUB_URL (placeholder in this build)
  check(document.querySelectorAll("#recentRows .ev").length === 1, "recent events on intake");
  // hand path: search → candidate → step 2 → save
  $("handBtn").click(); await tick();
  check(!$("ik1").classList.contains("hidden") && $("ik0").classList.contains("hidden"), "hand path opens step 1");
  $("ikQuery").value = "C02XG2JHJGH1"; $("ikQuery").dispatchEvent(new window.Event("input")); for (let i = 0; i < 12; i++) await tick();
  check(document.querySelectorAll("#cands .cand").length === 1, "candidate from fuzzy match: " + document.querySelectorAll("#cands .cand").length);
  document.querySelector('#cands [data-pick="1"]').click(); await tick();
  check(!$("ik2").classList.contains("hidden"), "step 2 shown");
  check(document.querySelector('#actChips .chip.on').dataset.act === "returned", "assigned device defaults to returned");
  document.querySelector('#actChips [data-act="handed_out"]').click(); await tick();
  check(!$("toRow").classList.contains("hidden"), "to-row for handed_out");
  $("ikTo").value = "an"; $("ikTo").dispatchEvent(new window.Event("input")); for (let i = 0; i < 10; i++) await tick();
  check(document.querySelectorAll("#toList [data-email]").length === 1, "directory picker rows");
  document.querySelector("#toList [data-email]").click(); await tick();
  $("ikSave").click(); for (let i = 0; i < 6; i++) await tick();
  check(!$("ik3").classList.contains("hidden") && /handed out to Ana/.test($("doneTitle").textContent), "saved screen: " + $("doneTitle").textContent);
  check(calls.includes("intakeCommit"), "intakeCommit called");
  $("doneNext").click(); await tick(); check(!$("ik0").classList.contains("hidden"), "next photo resets");
  // new-device path: no match → add
  $("handBtn").click(); await tick(); $("ikQuery").value = "ZZZ99999"; $("ikQuery").dispatchEvent(new window.Event("input")); for (let i = 0; i < 12; i++) await tick();
  check(/no device matches/.test($("cands").textContent), "no-match text");
  $("ikNew").click(); await tick(); $("nModel").value = "ThinkPad"; $("ikUseNew").click(); await tick();
  check(/ThinkPad \(new\)/.test($("ikDevName").textContent), "new device in step 2");
  check(document.querySelector('#actChips .chip.on').dataset.act === "handed_out", "new device defaults to handed_out");
  // devices
  await go("#/devices"); check(document.querySelectorAll("#devRows .dev").length === 3, "device rows: " + document.querySelectorAll("#devRows .dev").length);
  check(/Review MDM/.test(document.querySelector('#devRows .dev[data-id="1"]').textContent), "mismatch pill on row");
  check(document.querySelectorAll("#stats .stat").length === 3, "status stats");
  document.querySelector('#devRows .dev[data-id="1"]').click(); for (let i = 0; i < 5; i++) await tick();
  check(window.location.hash === "#/d/1" && /MacBook/.test($("dName").textContent), "device detail: " + $("dName").textContent);
  check(document.querySelectorAll("#dEvents .ev").length === 2 && document.querySelectorAll("#dEvents img").length === 1, "history with photo");
  check(/Ana Ruiz/.test($("dKv").textContent) && /ana@example.com/.test($("dKv").textContent) && /Me Myself/.test($("dKv").textContent) && !/p_0000/.test($("dKv").textContent + $("dEvents").textContent), "device card shows names + address resolved from person ids, never the ids: " + $("dKv").textContent.slice(0, 160));
  check(!$("dMdm").classList.contains("hidden") && /Iru/.test($("dMdm").textContent) && /Ben Ko/.test($("dMdm").textContent) && /Record the hand-over/.test($("dMdm").textContent), "mdm block with mismatch advice");
  check(!!$("dDoAct"), "admin action button"); $("dDoAct").click(); await tick(); check(!$("dActCard").classList.contains("hidden") && document.querySelector('#dActChips .chip.on').dataset.act === "returned", "action card default");
  $("dEdit").click(); check(!$("dEditCard").classList.contains("hidden") && $("eSerial").value === "C02XG2JHJGH1", "edit prefilled");
  // ---- selling: purchase card, price proposal, start a sale for the colleague who has it
  for (let i = 0; i < 3; i++) await tick();
  check(!$("dSaleCard").classList.contains("hidden") && $("pPrice").value === "2999.00" && $("pDate").value === "2024-03-01", "purchase details prefilled: " + $("pPrice").value);
  check(/Rule price today/.test($("dProposal").textContent) && /620\.00/.test($("dProposal").textContent) && !$("dSellBtn").disabled, "rule price shown, sell enabled");
  $("dSellBtn").click(); await tick();
  check(!$("dSellForm").classList.contains("hidden") && $("bPrice").value === "620.00" && $("bPerson").dataset.email === "ana@example.com", "sell form prefilled with rule price and current holder: " + $("bPrice").value + " / " + $("bPerson").dataset.email);
  $("bPrice").value = "650"; $("bStreet").value = "Seestrasse"; $("bHouse").value = "7b"; $("bPostal").value = "8802"; $("bTown").value = "Kilchberg"; $("bPriceNote").value = "battery worn";
  $("bCreate").click(); for (let i = 0; i < 6; i++) await tick();
  check(calls.includes("createSale"), "createSale called");
  check(window.location.hash === "#/sale/7", "lands on the sale: " + window.location.hash);
  for (let i = 0; i < 4; i++) await tick();
  check($("v-sale").classList.contains("active") && /MacBook/.test($("sTitle").textContent) && /accepted/.test($("sPills").textContent) && $("sMoney").textContent === "650.00 CHF", "sale page: " + $("sTitle").textContent + " · " + $("sMoney").textContent);
  check(/Ana Ruiz/.test($("sKv").textContent) && /Kilchberg/.test($("sKv").textContent) && /net 601\.30/.test($("sKv").textContent) && /VAT 48\.70/.test($("sKv").textContent), "buyer + VAT split on the sale page");
  check(/this sale differs/.test($("sProposal").textContent), "deviation from the rule price is flagged");
  check($("ckWiped").checked && $("ckMdm").checked && /accepted/.test($("sTermsLine").textContent) && /Accepted online by Ana Ruiz/.test($("sTermsLine").textContent), "checks + acceptance shown");
  check(!!document.querySelector('#sActions [data-act="issue"]'), "issue button for an accepted sale");
  // issue → invoice number → PDF rendered in the browser → archived → offered as download
  document.querySelector('#sActions [data-act="issue"]').click(); for (let i = 0; i < 40; i++) await tick();
  check(calls.includes("issueInvoice") && attached && attached.kind === "invoice" && attached.id === 7n, "issued and the PDF was archived");
  check(attached && attached.bytes instanceof Uint8Array && attached.bytes.length > 8000 && String.fromCharCode(...attached.bytes.slice(0, 5)) === "%PDF-", "archived bytes are a PDF: " + (attached && attached.bytes.length));
  check(/IT-2026-0001/.test($("sKv").textContent) && /invoiced/.test($("sPills").textContent) && /RF94 IT20 2600 01/.test($("sKv").textContent), "sale page after issue: " + $("sTitle").textContent);
  check(/archived as IT-2026-0001\.pdf/.test($("sDocStatus").textContent), "doc status: " + $("sDocStatus").textContent);
  check(!!document.querySelector('#sActions [data-act="paid"]') && !!document.querySelector('#sActions [data-act="cancel"]'), "paid + cancel actions after issue");
  document.querySelector('#sActions [data-act="paid"]').click(); await tick(); check(!$("sPaidRow").classList.contains("hidden"), "paid note row opens");
  $("sPaidNote").value = "bank 2026-09-10"; $("sPaidGo").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("markPaid"), "markPaid called");
  check(/still in ABM/.test($("sPills").textContent) && /released the device in Apple Business Manager/.test($("handoverAbmRow").textContent), "paid sale reminds to release the device in ABM: " + $("sPills").textContent.slice(0, 120));
  // sales list + export
  await go("#/d/1"); for (let i = 0; i < 3; i++) await tick(); check(!$("dAbm").classList.contains("hidden") && /Apple Business Manager · Group/.test($("dAbm").textContent) && /Iru · Group/.test($("dAbm").textContent) && /2024-03-12/.test($("dAbm").textContent), "device card shows the Apple Business Manager box");
  await go("#/sales"); check($("v-sales").classList.contains("active") && document.querySelectorAll("#saleRows .dev").length === 2 && /IT-2026-0002/.test($("saleRows").textContent), "sales list rows: " + document.querySelectorAll("#saleRows .dev").length);
  $("salesCsv").click(); for (let i = 0; i < 3; i++) await tick(); check(calls.includes("salesExportCsv"), "finance export");
  await go("#/import"); $("impText").value = "tag,serial\nINV-1,ABC"; $("impRun").click(); for (let i = 0; i < 4; i++) await tick(); check(/2 created/.test($("impStatus").textContent), "import status: " + $("impStatus").textContent);
  await go("#/settings"); check(!$("sGroup") && !!document.querySelector("[data-hub-permissions-link]") && $("sAiPill").textContent === (aiOn ? "on" : "off"), "settings loaded, ai pill " + $("sAiPill").textContent);
  check(document.querySelectorAll("#logRows tr").length === 1, "admin log");
  for (let i = 0; i < 3; i++) await tick(); check($("sNtPill").textContent === "failing" && /not delivered/.test($("sNtLine").textContent) && /What it may know/.test($("sNtLine").textContent), "notifications card shows the refused delivery and the fix: " + $("sNtLine").textContent.slice(0, 100));
  await new Promise((r) => setTimeout(r, 60));
  check(document.querySelectorAll("#mdmRows tr").length === 1 && /Iru/.test($("mdmRows").textContent) && /mismatch/.test($("mdmRows").textContent), "mdm connection row");
  if (!aiOn) check(/not granted the AI lane/.test($("sAiLine").textContent), "precise ai reason");
  $("mdKind").value = "jamf"; $("mdKind").dispatchEvent(new window.Event("change")); check(!$("mdClientRow").classList.contains("hidden") && /Jamf/.test($("mdUrlLabel").textContent + $("mdHint").textContent), "mdm form adapts to jamf");
  $("mdKind").value = "iru"; $("mdKind").dispatchEvent(new window.Event("change")); check($("mdClientRow").classList.contains("hidden"), "iru needs no client id");
  document.querySelector('#mdmRows [data-md-test="1"]').click(); for (let i = 0; i < 4; i++) await tick(); check(/reached Iru/.test($("mdStatus").textContent), "mdm test status");
  $("mdUrl").value = "https://x.api.kandji.io"; $("mdSecret").value = "tok"; $("mdAdd").click(); for (let i = 0; i < 4; i++) await tick(); check(calls.includes("addMdm") && /added/.test($("mdStatus").textContent), "mdm add");
  // Apple Business Manager card: rows, test, drop a PEM, add
  for (let i = 0; i < 3; i++) await tick();
  check(document.querySelectorAll("#abmRows tr").length === 1 && /BUSINESSAPI\.1111/.test($("abmRows").textContent) && /2 not in the register/.test($("abmRows").textContent), "abm connection row");
  document.querySelector('#abmRows [data-ab-test="1"]').click(); for (let i = 0; i < 4; i++) await tick(); check(/reached Apple Business Manager/.test($("abStatus").textContent), "abm test status");
  $("abClient").value = "BUSINESSAPI.99999999-0000-0000-0000-000000000000"; $("abAdd").click(); for (let i = 0; i < 3; i++) await tick(); check(/drop the \.pem/.test($("abStatus").textContent), "abm add without key refused: " + $("abStatus").textContent);
  const dropPem = async (pem, name) => { const f = new window.File([pem], name, { type: "application/x-pem-file" }); const ev = new window.Event("drop", { bubbles: true, cancelable: true }); Object.defineProperty(ev, "dataTransfer", { value: { files: [f] } }); $("abDrop").dispatchEvent(ev); for (let i = 0; i < 8; i++) await tick(); };
  await dropPem("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n", "broken.pem");
  check(/could not be read/.test($("abStatus").textContent), "a broken pem is refused in the browser: " + $("abStatus").textContent);
  await dropPem(abmPemPkcs8, "AuthKey_12345678-1234-1234-1234-123456789abc.pem");
  check(/key loaded/.test($("abStatus").textContent) && /PKCS#8/.test($("abKeyInfo").textContent) && $("abKeyId").value === "12345678-1234-1234-1234-123456789abc", "pem dropped, key id prefilled from the file name: " + $("abKeyInfo").textContent + " / " + $("abKeyId").value);
  $("abName").value = "ABM · Second org"; $("abAdd").click(); for (let i = 0; i < 8; i++) await tick(); check(calls.includes("addAbm") && /added/.test($("abStatus").textContent) && document.querySelectorAll("#abmRows tr").length === 2, "abm add: " + $("abStatus").textContent);
  // the assertion the browser signed verifies with the public key and carries Apple's claims
  { const [h, p, sg] = lastAssertion.split("."); const hd = JSON.parse(Buffer.from(h, "base64url")), cl = JSON.parse(Buffer.from(p, "base64url"));
    check(hd.alg === "ES256" && hd.kid === "12345678-1234-1234-1234-123456789abc" && cl.sub === "BUSINESSAPI.99999999-0000-0000-0000-000000000000" && cl.iss === cl.sub && cl.aud === "https://account.apple.com/auth/oauth2/v2/token" && cl.exp - cl.iat === 180 * 86400 - 3600 && typeof cl.jti === "string", "assertion claims: " + JSON.stringify({ hd, cl }));
    check(cryptoVerify("sha256", Buffer.from(h + "." + p), { key: abmPair.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sg, "base64url")) === true, "browser-signed assertion verifies with the public key"); }
  // SEC1 keys are wrapped into PKCS#8 before import
  await dropPem(abmPemSec1, "sec1.pem"); check(/key loaded/.test($("abStatus").textContent) && /SEC1/.test($("abKeyInfo").textContent), "sec1 pem accepted: " + $("abKeyInfo").textContent);
  $("abCancel").click();
  // the Apple page: gap list, filters, add one, add all
  await go("#/apple"); for (let i = 0; i < 3; i++) await tick();
  check($("v-apple").classList.contains("active") && document.querySelectorAll("#apRows tr").length === 4 && /not in the register/.test($("apRows").textContent) && /INV-0001/.test($("apRows").textContent), "apple page rows: " + document.querySelectorAll("#apRows tr").length);
  check(/3 Apple devices known/.test($("apLead").textContent) && /2 not in the register/.test($("apLead").textContent), "apple lead: " + $("apLead").textContent);
  check(document.querySelectorAll("#apRows .pill.warn").length === 1, "one device without device management flagged");
  document.querySelector('#apFilters [data-f="nomdm"]').click(); for (let i = 0; i < 4; i++) await tick(); check(document.querySelectorAll("#apRows tr").length === 1 && /iPad Air/.test($("apRows").textContent), "nomdm filter");
  document.querySelector('#apFilters [data-f="sold"]').click(); for (let i = 0; i < 4; i++) await tick(); check(document.querySelectorAll("#apRows tr").length === 1 && /SOLD00000001/.test($("apRows").textContent) && /INV-0004/.test($("apRows").textContent), "sold-but-still-in-ABM filter");
  document.querySelector('#apFilters [data-f="unmatched"]').click(); for (let i = 0; i < 4; i++) await tick(); check(document.querySelectorAll("#apRows tr").length === 2 && !$("apAddAll").classList.contains("hidden") && /Add all 2/.test($("apAddAll").textContent), "unmatched filter + add all button");
  document.querySelector('#apRows [data-ap-add="F9XQ2ABM0001"]').click(); for (let i = 0; i < 5; i++) await tick(); check(adopted.includes("F9XQ2ABM0001") && /1 added/.test($("apStatus").textContent), "add one: " + $("apStatus").textContent);
  window.confirm = () => true; $("apAddAll").click(); for (let i = 0; i < 5; i++) await tick(); check(adopted.includes("F9XQ2ABM0002") && document.querySelectorAll("#apRows tr").length === 1 && /nothing matches/.test($("apRows").textContent), "add all → gap closed");
  document.querySelector('#apFilters [data-f="all"]').click(); for (let i = 0; i < 4; i++) await tick(); check(document.querySelectorAll("#apRows a[href^='#/d/']").length === 4, "every Apple device now links into the register");
  await go("#/settings"); for (let i = 0; i < 4; i++) await tick();
  // billing settings card
  for (let i = 0; i < 3; i++) await tick();
  check($("blName").value === "Acme AG" && $("blIban").value === "CH93 0076 2011 6238 5295 7" && $("blVatRate").value === "8.1" && $("blPrefix").value === "IT-" && $("blMin").value === "50.00" && $("blWaiverVersion").textContent === "v2", "billing prefilled: " + $("blIban").value + " " + $("blVatRate").value);
  $("blDays").value = "30"; $("blSave").click(); for (let i = 0; i < 4; i++) await tick();
  check(calls.includes("setBilling") && /saved/.test($("blStatus").textContent), "billing saved");
  await go("#/docs"); check($("v-docs").classList.contains("active") && /Selling devices/.test($("v-docs").textContent), "docs");
} else {
  check(window.location.hash === "#/devices", "member lands on devices: " + window.location.hash);
  check($("devScan").classList.contains("hidden"), "member cannot see the scan shortcut");
  check(document.querySelectorAll("#nav .tab").length === 3, "member tabs (devices, offers, docs)");
  await go("#/intake"); check(!$("v-intake").classList.contains("active") && $("v-devices").classList.contains("active"), "member cannot open intake");
  await go("#/d/1"); for (let i = 0; i < 3; i++) await tick(); check(!$("dDoAct") && $("dAdminRow").classList.contains("hidden"), "member sees no admin controls");
  await go("#/settings"); check(!$("v-settings").classList.contains("active"), "member cannot open settings");
  await go("#/sales"); check(!$("v-sales").classList.contains("active"), "member cannot open the sales list");
  // offers: read the terms, add the address, accept with the version shown; download the paid invoice
  await go("#/offers/999");
  check(/not available for your signed-in account/.test($("offerRows").textContent) && !document.querySelector("#offerRows [data-offer]"), "unavailable link does not show another offer");
  await go("#/offers/7");
  check(document.querySelectorAll("#offerRows [data-offer]").length === 1, "deep link isolates the requested offer");
  document.querySelector('#offerRows [data-accept]').click(); await tick();
  check(document.querySelectorAll("#offerRows [data-offer]").length === 1 && location.hash === "#/offers/7", "accept keeps the selected offer open");
  document.querySelector('#offerRows [data-decline]').click(); await tick();
  check(document.querySelectorAll("#offerRows [data-offer]").length === 1, "decline keeps the selected offer open");
  await go("#/offers"); for (let i = 0; i < 3; i++) await tick();
  check($("v-offers").classList.contains("active") && document.querySelectorAll("#offerRows [data-offer]").length === 2, "offers listed: " + document.querySelectorAll("#offerRows [data-offer]").length);
  const card = document.querySelector('#offerRows [data-offer="7"]');
  check(/No warranty/.test(card.textContent) && !!card.querySelector("[data-accept]") && card.querySelector("[data-accept]").dataset.v === "2", "open offer shows the terms and accept with version 2");
  card.querySelector('[data-f="street"]').value = "Seestrasse"; card.querySelector('[data-f="houseNo"]').value = "7b"; card.querySelector('[data-f="postalCode"]').value = "8802"; card.querySelector('[data-f="town"]').value = "Kilchberg";
  card.querySelector("[data-accept]").click(); for (let i = 0; i < 5; i++) await tick();
  check(calls.includes("acceptOffer"), "acceptOffer called with the address");
  const paidCard = document.querySelector('#offerRows [data-offer="8"]');
  check(paidCard && /Download invoice IT-2026-0002/.test(paidCard.textContent) && !paidCard.querySelector("[data-accept]"), "paid sale offers the invoice download only");
  paidCard.querySelector("[data-dl]").click(); for (let i = 0; i < 3; i++) await tick(); check(calls.includes("saleDocument"), "download via saleDocument");
  await go("#/sale/7"); for (let i = 0; i < 4; i++) await tick(); check($("v-sale").classList.contains("active") && $("sAdminCard").classList.contains("hidden") && $("sEditCard").classList.contains("hidden") && $("sChecksCard").classList.contains("hidden"), "a buyer opening their sale sees no admin cards");
}
console.log(role.toUpperCase(), aiOn ? "" : "(no ai)", errors.length ? "FAIL\n" + errors.join("\n") : "SMOKE OK", "| calls:", [...new Set(calls)].length, "distinct backend methods");
process.exit(errors.length ? 1 : 0);
