/* BEGIN GENERATED APP LOGOS */
/* Generated from design/logos/registry.json. Do not edit. */
const APP_LOGO_PATHS = Object.freeze({
  "hub": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  "desk": "M3 8V4h18v4a4 4 0 0 0 0 8v4H3v-4a4 4 0 0 0 0-8m11-4v3m0 4v2m0 4v3",
  "assets": "M4 4h16v12H4zM2 20h20M8 16l-1 4m9-4 1 4",
  "trust": "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  "contracts": "M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8m-8 4h5",
  "forms": "M8 3H4v18h16V3h-4M8 2h8v4H8zM8 11h1m3 0h4m-8 5h1m3 0h4",
  "watch": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  "crumbs": "M3 3v18h18M7 16v-4m5 4V8m5 8V5",
  "kitchen": "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  "vault": "M3 3h18v5H3zM5 8v13h14V8m-10 4h6",
  "phone": "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm2 0v3h6V2m-4 16h2",
  "kebab-mcp": "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  "sdk": "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
  "bug": "M9 3l1 3m5-3-1 3M8 9a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0V9Zm0 1h8m-4 0v10M4 9l4 2m8 0 4-2M3 15h5m8 0h5M5 21l4-3m6 0 4 3"
});
export function appLogoHtml(id) { const d=Object.hasOwn(APP_LOGO_PATHS,id)?APP_LOGO_PATHS[id]:null; return d ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>' : ''; }
/* END GENERATED APP LOGOS */
// kebab-stack hub client — frontend half. Plain ES module, no dependencies.
//
//   import { takeHubTicket, hubJumpUrl, session, mountTopbar } from "./hub-client.js";
//
//   const ticket = takeHubTicket();                 // from #uht=… (strips it from the URL)
//   if (ticket) {
//     const r = await appBackend.loginWithTicket(ticket);  // your backend redeems it at the hub
//     if (r) { session.save(r.token); session.saveSuite(r.suiteToken); }
//   }
//   // no session? send them through the hub (SSO or passkey, the hub decides):
//   location.href = hubJumpUrl(HUB_URL, location.origin + location.pathname);
//
//   // the one topbar every app shares (brand · app name · menu · bell · theme · person):
//   const topbar = mountTopbar(document.getElementById("topbar"), {
//     hub: { actor: hubActor, token: session.loadSuite() }, hubUrl: HUB_URL,
//     app: { name: "watch", eyebrow: orgName }, person: { email, displayName },
//     onSignOut: signOut,
//   });
//
// The topbar talks to the HUB backend directly with the person's suite token
// (read-only: unread count, notifications, mark read, the person's apps, name,
// picture). Your app never proxies notifications and never sees other apps'.

/** Pull a hub ticket out of the URL fragment and remove it immediately.
 *  Also applies the theme the hub sent along (`&th=dark|light`, so the look does not flip between apps)
 *  and restores the deep link that hubJumpUrl() saved before the round trip. */
export function takeHubTicket() {
  const m = location.hash.match(/(?:^#|[#&])uht=([0-9a-fA-F]{16,160})/);
  if (!m) return null;
  const th = location.hash.match(/(?:^#|[#&])th=(dark|light)/);
  if (th) { document.documentElement.setAttribute("data-theme", th[1]); try { localStorage.setItem("ks-theme", th[1]); } catch (e) {} }
  let back = ""; try { back = sessionStorage.getItem("ks-return") || ""; sessionStorage.removeItem("ks-return"); } catch (e) {}
  history.replaceState(null, "", location.pathname + location.search + (back && back !== "#" ? back : ""));
  return m[1];
}

/** Where to send someone who has no session: the hub bounces back with a fresh ticket.
 *  The current deep link (hash) is kept for the way back — a notification's link survives the sign-in. */
export function hubJumpUrl(hubUrl, appUrl) {
  try { if (location.hash && location.hash.length > 1) sessionStorage.setItem("ks-return", location.hash); } catch (e) {}
  const url = new URL(hubUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid Hub address");
  url.search = ""; url.hash = "";
  url.searchParams.set("jump", appUrl);
  return url.href;
}

/** Shared sign-in state for bundled tools. The app owns its session; Hub owns authentication. */
export function appSignIn({ name, hubUrl, navigate = url => { location.href = url; } }) {
  const root = document.getElementById("login"), button = document.getElementById("loginBtn");
  let busy = true, failed = false, leaving = false;
  const paint = (waiting, message) => {
    busy = waiting;
    root?.setAttribute("aria-busy", String(waiting));
    root?.classList.toggle("is-waiting", waiting);
    if (button) button.disabled = waiting;
    const progress = document.getElementById("authProgress");
    if (progress) progress.textContent = message;
  };
  return {
    ready() { if (!leaving) paint(false, failed ? "Sign-in needs your attention." : "Continue to " + name + " with your company account."); },
    status(kind, text) {
      if (kind === "err") { failed = true; leaving = false; paint(false, "Sign-in needs your attention."); }
      else if (/signing in/i.test(text)) paint(true, "Confirming your access to " + name + "…");
      else if (/signed out/i.test(text)) { failed = false; leaving = false; paint(false, "You’re signed out."); }
    },
    continue() {
      if (busy) return false;
      try {
        const url = hubJumpUrl(hubUrl, location.origin + location.pathname);
        leaving = true; failed = false;
        const error = document.getElementById("loginStatus"); if (error) error.textContent = "";
        paint(true, "Connecting to your company Hub…");
        navigate(url);
        return true;
      } catch (_) {
        failed = true; leaving = false; paint(false, "Your company Hub is unavailable.");
        const error = document.getElementById("loginStatus");
        if (error) { error.className = "status err"; error.textContent = "We couldn’t open company sign-in. Please try again or contact IT."; }
        return false;
      }
    },
  };
}

/** Tiny session-token store (localStorage, one key per app). The suite token rides along under "<key>-suite". */
export const session = {
  key: "kebab-hub-session",
  save(token) { try { localStorage.setItem(this.key, token); } catch (e) {} },
  load() { try { return localStorage.getItem(this.key) || ""; } catch (e) { return ""; } },
  clear() { try { localStorage.removeItem(this.key); localStorage.removeItem(this.key + "-suite"); } catch (e) {} },
  saveSuite(token) { try { if (token) localStorage.setItem(this.key + "-suite", token); else localStorage.removeItem(this.key + "-suite"); } catch (e) {} },
  loadSuite() { try { return localStorage.getItem(this.key + "-suite") || ""; } catch (e) { return ""; } },
};

/** Initials for the avatar fallback ("Jane Doe" → "JD", "jane@acme.com" → "J"). */
export function initials(nameOrEmail) {
  const s = String(nameOrEmail || "").trim();
  if (!s) return "?";
  const parts = s.includes("@") ? [s] : s.split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

/** Candid IDL for the six read-only hub calls the topbar makes — pass this to Actor.createActor with the hub's backend canister id. */
export const topbarIdlFactory = ({ IDL }) => {
  const Notification = IDL.Record({ id: IDL.Nat, email: IDL.Text, fromApp: IDL.Text, title: IDL.Text, url: IDL.Text, kind: IDL.Text, at: IDL.Int, read: IDL.Bool, slack: IDL.Text });
  const AppLinkView = IDL.Record({ id: IDL.Nat, name: IDL.Text, url: IDL.Text, note: IDL.Text, kind: IDL.Text, connectorId: IDL.Nat, hidden: IDL.Bool, hasIcon: IDL.Bool });
  return IDL.Service({
    suiteState: IDL.Func([IDL.Text], [IDL.Opt(IDL.Record({ email: IDL.Text, displayName: IDL.Text, unread: IDL.Nat, expiresAt: IDL.Int, active: IDL.Bool, provider: IDL.Text }))], ["query"]),
    myNotifications: IDL.Func([IDL.Text, IDL.Nat], [IDL.Record({ total: IDL.Nat, unread: IDL.Nat, slackDm: IDL.Bool, items: IDL.Vec(Notification) })], ["query"]),
    markNotificationsRead: IDL.Func([IDL.Text, IDL.Vec(IDL.Nat)], [IDL.Nat], []),
    portalApps: IDL.Func([IDL.Text], [IDL.Vec(AppLinkView)], ["query"]),
    myAvatarPortal: IDL.Func([IDL.Text], [IDL.Opt(IDL.Vec(IDL.Nat8))], ["query"]),
    getCompanyLogo: IDL.Func([], [IDL.Opt(IDL.Record({ img: IDL.Vec(IDL.Nat8), mime: IDL.Text }))], ["query"]),
    tileIcon: IDL.Func([IDL.Nat], [IDL.Opt(IDL.Record({ img: IDL.Vec(IDL.Nat8), mime: IDL.Text }))], ["query"]),
  });
};

// ---------------------------------------------------------------------------
// The shared topbar. One look, one logic, everywhere in the suite.
//
//   brand (company logo or the suite mark → the menu) · app name · [hub: Console] · Apps ▾ · bell · theme · you ▾
//
// Freshness: unread count every 30 s (one cheap query), the full list when the
// bell opens, the app list every time the Apps panel opens, a refresh whenever
// the tab comes back, after every action. Two missed heartbeats → the bell says
// so instead of showing a stale number. Token gone → "Sign in again".
//
// Hub-only options (extra buttons, custom sections, jump, theme hooks, ids) are
// honoured only when the page runs on the hub's own origin — an app cannot make
// its top look different from the others.
// ---------------------------------------------------------------------------

const SKEWER_SVG = "<svg viewBox=\"0 0 40 48\" width=\"27\" height=\"35\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\"><path d=\"M20 3v42\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\"/><rect x=\"10\" y=\"9\" width=\"20\" height=\"6\" rx=\"3\" fill=\"#ffb23a\"/><rect x=\"4\" y=\"18\" width=\"32\" height=\"6\" rx=\"3\" fill=\"#ff8a3d\"/><rect x=\"7\" y=\"27\" width=\"26\" height=\"6\" rx=\"3\" fill=\"#ff6b4a\"/><rect x=\"12\" y=\"36\" width=\"16\" height=\"6\" rx=\"3\" fill=\"#f0503c\"/></svg>";
const BELL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
const GRID_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2.2"/><circle cx="12" cy="5" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="12" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/></svg>';
const MOON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

const TOPBAR_CSS = `
:root { --ks-topbar-h: 60px; --ks-topbar-offset: calc(var(--ks-topbar-h) + 1px + env(safe-area-inset-top, 0px)); }
/* The mount host owns stickiness. A sticky child inside a header-sized host
   cannot stay visible once that host scrolls away. Keep its normal-flow space. */
.ks-topbar-host { position: sticky; top: 0; z-index: 30; flex-shrink: 0; }
.ks-topbar-host > .ks-topbar { position: static; }
html:has(.ks-topbar-host) { scroll-padding-top: calc(var(--ks-topbar-offset) + 12px); }
.ks-topbar { display: flex; align-items: center; gap: 10px; height: var(--ks-topbar-h); padding: 0 16px; padding-top: env(safe-area-inset-top, 0); box-sizing: content-box; border-bottom: 1px solid var(--ks-rule); background: var(--ks-bg-sunk, var(--ks-bg)); position: sticky; top: 0; z-index: 30; }
@media (min-width: 760px) { .ks-topbar { padding-left: 28px; padding-right: 28px; gap: 14px; } }
.ks-topbar *, .ks-panel * { box-sizing: border-box; }
.ks-topbar [hidden], .ks-panel [hidden], .ks-panel[hidden] { display: none !important; }
.ks-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ks-brand a { display: flex; align-items: center; color: var(--ks-fg); text-decoration: none; border-radius: 8px; }
.ks-brand a:focus-visible { outline: 3px solid var(--ks-focus); outline-offset: 4px; }
.ks-brand img { max-height: 32px; max-width: 140px; display: block; }
.ks-brand .ks-mark { display: flex; color: var(--ks-fg); }
.ks-brand b { font: 600 18px/1.2 var(--ks-ui); color: var(--ks-fg); white-space: nowrap; display: block; }
.ks-brand .ks-eyebrow { font: 500 10px/1.3 var(--ks-ui); letter-spacing: .16em; text-transform: uppercase; color: var(--ks-fg-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 38vw; }
.ks-spacer { flex: 1; }
.ks-actions { display: flex; align-items: center; gap: 8px; min-width: 0; flex-shrink: 0; }
.ks-topbar button { font: 550 14px/20px var(--ks-ui); letter-spacing: 0; text-transform: none; cursor: pointer; color: var(--ks-fg); background: transparent; border: 1px solid var(--ks-rule-strong); border-radius: 8px; padding: 0 16px; height: 44px; transition: border-color .15s, color .15s, background .15s; }
.ks-topbar button:hover { border-color: var(--ks-accent); color: var(--ks-accent); }
.ks-topbar button:focus-visible, .ks-panel button:focus-visible, .ks-panel a:focus-visible, .ks-panel input:focus-visible { outline: 3px solid var(--ks-focus); outline-offset: 4px; }
.ks-round { width: 44px; padding: 0 !important; display: flex; align-items: center; justify-content: center; position: relative; }
.ks-menu-btn { display: flex; align-items: center; gap: 7px; }
.ks-badge { position: absolute; top: -5px; right: -5px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 999px; background: var(--ks-accent-strong, var(--ks-accent)); color: var(--ks-fg-inverse, #fff); font: 600 10.5px/17px var(--ks-mono); text-align: center; letter-spacing: 0; }
@keyframes ks-pop { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }
.ks-badge.ks-pop { animation: ks-pop .3s ease; }
@media (prefers-reduced-motion: reduce) { .ks-badge.ks-pop { animation: none; } }
.ks-bell.ks-stale { border-style: dashed; }
.ks-ident { display: flex !important; align-items: center; gap: 9px; padding: 0 12px 0 2px !important; border-color: transparent !important; text-transform: none !important; letter-spacing: 0 !important; font: 500 14px var(--ks-ui) !important; }
.ks-ident:hover { border-color: var(--ks-rule-strong) !important; color: var(--ks-fg) !important; }
.ks-avi { width: 32px; height: 32px; border-radius: 50%; background: var(--ks-accent); color: var(--ks-on-accent); display: flex; align-items: center; justify-content: center; font: 600 11px var(--ks-mono); overflow: hidden; flex-shrink: 0; }
.ks-avi img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ks-ident-name { white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.ks-caret { font-size: 10px; color: var(--ks-fg-muted); }
.ks-panel { position: fixed; top: calc(var(--ks-topbar-h) + 4px + env(safe-area-inset-top, 0px)); right: 16px; width: 400px; max-width: calc(100vw - 24px); background: var(--ks-bg-card); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-card, 16px); box-shadow: 0 14px 40px rgba(0,0,0,.14); z-index: 60; outline: none; }
.ks-panel-head { display: flex; align-items: center; gap: 10px; padding: 12px 18px 8px; flex-wrap: wrap; }
.ks-panel-head .ks-eyebrow { font: 500 11px var(--ks-ui); letter-spacing: .18em; text-transform: uppercase; color: var(--ks-fg-secondary); }
.ks-panel-head a { margin-left: auto; font: 400 13px var(--ks-ui); color: var(--ks-fg-secondary); padding: 8px 0; }
.ks-panel-head .ks-note { flex-basis: 100%; font: 400 12px var(--ks-ui); color: var(--ks-accent); }
.ks-list { max-height: min(60vh, 440px); overflow-y: auto; }
.ks-item { display: block; width: 100%; text-align: left; background: transparent; border: 0 !important; border-top: 1px solid var(--ks-rule) !important; border-radius: 0 !important; padding: 11px 18px !important; cursor: pointer; text-transform: none !important; letter-spacing: 0 !important; color: var(--ks-fg) !important; font: 400 13.5px var(--ks-ui) !important; }
.ks-item:hover { background: var(--ks-accent-dim, rgba(232,93,47,.08)); }
.ks-item .ks-t { font: 500 13.5px/1.4 var(--ks-ui); color: var(--ks-fg-secondary); }
.ks-item.ks-unread .ks-t { color: var(--ks-fg); }
.ks-item.ks-unread .ks-t::before { content: "●"; color: var(--ks-accent); font-size: 8px; vertical-align: 2px; margin-right: 7px; }
.ks-item .ks-m { font: 400 11px var(--ks-mono); color: var(--ks-fg-secondary); margin-top: 3px; }
.ks-more { padding: 10px 18px; border-top: 1px solid var(--ks-rule); font: 400 12px var(--ks-ui); color: var(--ks-fg-secondary); }
.ks-empty { padding: 16px 18px; font: 400 13.5px/1.5 var(--ks-ui); color: var(--ks-fg-secondary); }
.ks-empty a, .ks-empty button { color: var(--ks-fg); font: inherit; background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
.ks-panel-foot { display: flex; align-items: center; gap: 10px; padding: 10px 18px; border-top: 1px solid var(--ks-rule); font: 400 12.5px/1.5 var(--ks-ui); color: var(--ks-fg-secondary); flex-wrap: wrap; }
.ks-panel-foot a { color: var(--ks-fg); }
.ks-panel { box-sizing: border-box; }
#ks-appsPanel { --ks-launch-bg:var(--ks-bg-card); --ks-launch-ink:var(--ks-fg); --ks-launch-muted:var(--ks-fg-secondary); --ks-launch-line:var(--ks-rule); --ks-launch-soft:var(--ks-bg-sunk); --ks-launch-accent:var(--ks-accent); width: 500px; border: 1px solid var(--ks-launch-line); border-radius: 16px; background: var(--ks-launch-bg); color: var(--ks-launch-ink); box-shadow: 0 16px 60px #17283e26; max-height: calc(100dvh - var(--ks-topbar-h) - 28px - env(safe-area-inset-top, 0px)); overflow-y: auto; }
[data-theme="dark"] #ks-appsPanel { box-shadow:0 16px 60px #0005; }
#ks-appsPanel .ks-panel-head { padding: 22px 22px 17px; gap: 10px; }
#ks-appsPanel .ks-eyebrow { font: 600 16px/1.4 var(--ks-ui); letter-spacing: -.01em; color: var(--ks-launch-ink); text-transform: none; }
#ks-appsPanel .ks-panel-head a { color: var(--ks-launch-accent); font: 500 12px/1.5 var(--ks-ui); text-decoration: none; padding: 7px 0; }
#ks-appsPanel .ks-panel-head a:hover { text-decoration: underline; }
#ks-appsPanel .ks-note { font: 400 12px/1.6 var(--ks-ui); letter-spacing: 0; color: var(--ks-launch-accent); }
#ks-appsPanel .ks-search-wrap { display: block; position: relative; margin: 0 20px 14px; padding: 0; }
.ks-search-wrap > svg { position: absolute; width: 17px; height: 17px; left: 13px; top: 15px; color: var(--ks-launch-muted); pointer-events: none; }
#ks-appsPanel input.ks-find { display: block; box-sizing: border-box; margin: 0; width: 100%; min-width: 0; max-width: 100%; min-height: 46px; padding: 11px 14px 11px 39px; border: 1px solid var(--ks-rule-strong); border-radius: 8px; font: 400 16px/1.5 var(--ks-ui); background: var(--ks-launch-soft); color: var(--ks-launch-ink); -webkit-appearance: none; appearance: none; }
#ks-appsPanel input.ks-find::placeholder { color: var(--ks-launch-muted); opacity: 1; }
#ks-appsPanel .ks-apps { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; padding: 0 12px 12px; max-height: min(60vh,480px); overflow-y: auto; overscroll-behavior: contain; }
#ks-appsPanel .ks-app { display: flex; flex-direction: row; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 80px; height: auto; margin: 0; padding: 14px 11px !important; border: 1px solid transparent !important; border-radius: 12px !important; text-transform: none !important; letter-spacing: 0 !important; font: 500 13px/1.5 var(--ks-ui) !important; color: var(--ks-launch-ink) !important; text-align: left; background: transparent; cursor: pointer; }
#ks-appsPanel .ks-app:hover { background: var(--ks-launch-soft); border-color: var(--ks-launch-line) !important; }
#ks-appsPanel .ks-app.ks-current { border-color: var(--ks-launch-line) !important; background: var(--ks-launch-soft); }
#ks-appsPanel .ks-app-copy { min-width: 0; flex: 1; display: block; }
#ks-appsPanel .ks-app .ks-nm { display: block; white-space: normal; overflow-wrap: anywhere; font: 600 13px/1.5 var(--ks-ui); }
#ks-appsPanel .ks-app .ks-here { display: block; font: 400 11px/1.5 var(--ks-ui); color: var(--ks-launch-muted); margin: 3px 0 0; }
#ks-appsPanel .ks-app.ks-current .ks-here { color: var(--ks-launch-accent); }
#ks-appsPanel .ks-apps > .ks-empty { grid-column: 1/-1; color: var(--ks-launch-muted); padding: 20px 10px; }
#ks-appsPanel .ks-launch-foot { border-top: 1px solid var(--ks-launch-line); padding: 13px 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font: 400 11px/1.5 var(--ks-ui); color: var(--ks-launch-muted); }
#ks-appsPanel .ks-launch-foot kbd { font: inherit; border: 1px solid var(--ks-launch-line); padding: 1px 4px; border-radius: 4px; }
@media (max-width: 640px) { #ks-appsPanel { width: auto; left: 8px; right: 8px; max-width: none; } #ks-appsPanel input.ks-find { font-size: 16px; } #ks-appsPanel .ks-panel-head { padding: 17px 18px 13px; } #ks-appsPanel .ks-search-wrap { margin: 0 16px 12px; } #ks-appsPanel .ks-app { padding: 12px 9px !important; gap: 9px; } #ks-appsPanel .ks-ico { width: 35px; height: 35px; border-radius: 10px; } #ks-appsPanel .ks-launch-shortcut { display: none; } }
@media (max-width: 350px) { #ks-appsPanel .ks-apps { grid-template-columns: 1fr; } }
.ks-ico { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font: 600 15px var(--ks-mono); color: #1a1611; overflow: hidden; border: 1px solid rgba(0,0,0,.06); flex-shrink: 0; }
.ks-ico img { width: 100%; height: 100%; object-fit: contain; }
.ks-ico.pic { background: var(--ks-bg-sunk) !important; padding: 6px; }
.ks-app-mark { color: var(--ks-logo); display: flex; flex-shrink: 0; }
.ks-app-mark:empty { display: none; }
.ks-app-mark svg { width: 26px; height: 26px; }

.ks-ico.c0 { background: #FFB23A; } .ks-ico.c1 { background: #FF8A3D; } .ks-ico.c2 { background: #FF6B4A; color: #fff; } .ks-ico.c3 { background: #F0503C; color: #fff; } .ks-ico.c4 { background: #5fd1b2; } .ks-ico.c5 { background: #9fb2ff; } .ks-ico.c6 { background: #e9e4da; } .ks-ico.c7 { background: #ffd98a; }
.ks-identpanel { padding: 16px 18px; }
.ks-identpanel .ks-who { display: flex; align-items: center; gap: 12px; }
.ks-identpanel .ks-who .ks-avi { width: 44px; height: 44px; font-size: 14px; }
.ks-identpanel .ks-nm { font: 500 16px var(--ks-display); color: var(--ks-fg); }
.ks-identpanel .ks-em { font: 400 11.5px var(--ks-mono); color: var(--ks-fg-secondary); margin-top: 2px; word-break: break-all; }
.ks-identpanel .ks-via { font: 400 12.5px var(--ks-ui); color: var(--ks-fg-secondary); margin-top: 12px; }
.ks-identpanel .ks-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--ks-rule); }
.ks-identpanel .ks-section:empty { display: none; }
.ks-identpanel .ks-signout { display: block; width: 100%; margin-top: 14px; padding: 10px 18px; font: 550 14px/20px var(--ks-ui); letter-spacing: 0; text-transform: none; cursor: pointer; color: var(--ks-fg); background: transparent; border: 1px solid var(--ks-rule-strong); border-radius: 8px; min-height:44px; }
.ks-identpanel .ks-signout:hover { border-color: var(--ks-accent); color: var(--ks-accent); }
@media (max-width: 640px) { .ks-ident-name, .ks-caret, .ks-brand .ks-eyebrow { display: none; } .ks-actions { gap: 6px; } .ks-topbar button, .ks-round { height: 44px; } .ks-round { width: 44px; } .ks-panel { right: 8px; left: 8px; width: auto; } .ks-ident { padding: 0 2px !important; } .ks-avi { width: 36px; height: 36px; } .ks-brand .ks-mark svg, .ks-brand img { max-height: 28px; } }
@media (max-width: 480px) {
  .ks-topbar { padding-left: 12px; padding-right: 12px; gap: 6px; }
  .ks-brand { gap: 6px; }
  .ks-brand b { font-size: 16px; overflow: hidden; text-overflow: ellipsis; max-width: 22vw; }
  .ks-brand img { max-width: 48px; }
  .ks-actions { gap: 4px; }
  .ks-actions > button { flex-shrink: 0; }
  .ks-menu-btn { width: 44px; padding: 0 !important; justify-content: center; }
  .ks-menu-btn .ks-word { display: none; }
}
@media(max-width:480px){.ks-brand .ks-app-mark{display:none}.ks-brand b{max-width:calc(100vw - 246px)}.ks-brand a{min-height:44px}.ks-brand .ks-mark svg{width:24px;height:30px}}
@media(prefers-reduced-motion:reduce){.ks-topbar *,.ks-panel *{transition:none!important;animation:none!important}}

`;

function ensureCss() {
  if (document.getElementById("ks-topbar-css")) return;
  const st = document.createElement("style"); st.id = "ks-topbar-css"; st.textContent = TOPBAR_CSS; document.head.appendChild(st);
}
const escT = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** "just now · 5 min ago · 2 hours ago · 3 days ago" — the one phrasing for the whole suite. */
export const relTime = (ns) => { const s = Math.max(0, (Date.now() - Number(BigInt(ns) / 1000000n)) / 1000); if (s < 90) return "just now"; if (s < 5400) return Math.round(s / 60) + " min ago"; if (s < 129600) { const h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); } const d = Math.round(s / 86400); return d + (d === 1 ? " day ago" : " days ago"); };
const exactTime = (ns) => { try { return new Date(Number(BigInt(ns) / 1000000n)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return ""; } };
const blobUrl = (bytes, mime) => { try { return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime || "image/png" })); } catch (e) { return ""; } };
/** The suite's app-tile palette: the same colour and letters for an app everywhere (menu page, Apps panel, Apps list). */
export const hue = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 8; };
export const abbrev = (name) => { const w = String(name || "?").trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); };
export const appIconHtml = (a, cls) => `<span class="${cls || "ks-ico"} ${a.hasIcon ? "pic" : "c" + hue(a.name)}"${a.hasIcon ? ` data-icon="${Number(a.id)}"` : ""}>${a.hasIcon ? "" : escT(abbrev(a.name))}</span>`;
const originOf = (u) => { try { return new URL(u).origin; } catch (e) { return ""; } };

/**
 * Mount the shared topbar into `el`.
 *
 * Every app:
 *   opts.hub      { actor, token }     hub backend actor (topbarIdlFactory; may be a function returning it) + the person's suite token ("" = the hub's own passkey mode)
 *   opts.hubUrl   string               the hub frontend URL — brand click, app jumps, sign-out, reconnect
 *   opts.app      { name, eyebrow }    the app's name; eyebrow = the company name (from your backend's info().orgName — nothing else)
 *   opts.person   { email, displayName, avatarUrl?, role? }   initial identity; refreshed from the hub. role "admin" shows "You're an admin here."
 *   opts.onSignOut()                   clear the app's own session; the bar then signs the person out of the hub too
 *   opts.currentUrl string             this app's URL, to mark it in the Apps panel (default location.origin)
 *   opts.onState(state|null)           after every heartbeat
 *   opts.pollMs   number               15 000–60 000 (default 30 000)
 * Hub only (ignored elsewhere): extra [{id,label,title,onClick,hidden}] · identSection(container) · notifFooter(container) · jump(app) · brandHref/onBrand · theme {get,set} · ids {…}
 *
 * Returns { refresh(), refreshList(), setPerson(p), setToken(t), setApp(a), setExtraHidden(id, hidden), openNotifications(), closeAll(), destroy(), els, state, person }.
 */
export function mountTopbar(el, opts) {
  ensureCss();
  el.classList.add("ks-topbar-host");
  const o = Object.assign({ pollMs: 30000, currentUrl: location.origin }, opts || {});
  const onHub = originOf(o.hubUrl) !== "" && originOf(o.hubUrl) === location.origin;
  for (const k of ["extra", "identSection", "notifFooter", "jump", "brandHref", "onBrand", "theme", "ids", "brandTitle"]) if (o[k] !== undefined && !onHub) { console.warn(`kebab topbar: option "${k}" is for the hub only — ignored`); delete o[k]; }
  const pollMs = Math.min(60000, Math.max(15000, Number(o.pollMs) || 30000));
  const ids = Object.assign({ avatar: "ks-avatar", identName: "ks-identName", theme: "ks-theme", bell: "ks-bell", badge: "ks-badge", brandLogo: "ks-brandLogo", brandHome: "ks-brandHome", menuBtn: "ks-menuBtn" }, o.ids || {});
  const theme = o.theme || {
    get: () => document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
    set: (t) => { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("ks-theme", t); } catch (e) {} },
  };
  const hubBase = (o.hubUrl || "").replace(/\/+$/, "");
  const actorOf = () => (o.hub ? (typeof o.hub.actor === "function" ? o.hub.actor() : o.hub.actor) : null);
  let token = (o.hub && o.hub.token) || "";
  let person = Object.assign({ email: "", displayName: "" }, o.person || {});
  let state = undefined; // undefined = not asked yet · null = no valid token · object = live
  let missed = 0, lastBeat = 0, reconnectShown = false, destroyed = false, timer = 0;
  let notifCache = { items: [], unread: 0, total: 0 }, listKnown = false;
  let appsCache = null, appsErr = false;
  const iconCache = {};
  const baseTitle = document.title.replace(/^\(\d+\+?\) /, "");

  el.innerHTML = `
    <header class="ks-topbar" role="banner">
      <div class="ks-brand">
        <a id="${ids.brandHome}" href="${escT(o.brandHref || hubBase || "#")}" title="${escT(o.brandTitle || "Your menu")}" aria-label="${escT(o.brandTitle || "Your menu")}"><img id="${ids.brandLogo}" alt="" hidden><span class="ks-mark" id="ks-mark">${SKEWER_SVG}</span></a>
        <span class="ks-app-mark" id="ks-appMark" aria-hidden="true">${appLogoHtml(o.app?.id)}</span><div><b id="ks-appName">${escT((o.app && o.app.name) || "")}</b><div class="ks-eyebrow" id="ks-eyebrow" ${o.app && o.app.eyebrow ? "" : "hidden"}>${escT((o.app && o.app.eyebrow) || "")}</div></div>
      </div>
      <div class="ks-spacer"></div>
      <div class="ks-actions">
        <span id="ks-extra"></span>
        <button class="ks-menu-btn" id="${ids.menuBtn}" title="Your apps" aria-label="Your apps" aria-haspopup="dialog" aria-controls="ks-appsPanel" aria-expanded="false">${GRID_SVG}<span class="ks-word">Apps</span></button>
        <button class="ks-round ks-bell" id="${ids.bell}" title="Notifications" aria-label="Notifications" aria-haspopup="dialog" aria-controls="ks-notifPanel" aria-expanded="false">${BELL_SVG}<span class="ks-badge" id="${ids.badge}" aria-hidden="true" hidden>0</span></button>
        <button class="ks-round" id="${ids.theme}" title="Switch to dark" aria-label="Switch to dark">${MOON_SVG}</button>
        <button class="ks-ident" id="ks-ident" aria-label="You" aria-haspopup="dialog" aria-controls="ks-identPanel" aria-expanded="false"><span class="ks-avi" id="${ids.avatar}">–</span><span class="ks-ident-name" id="${ids.identName}">–</span><span class="ks-caret" aria-hidden="true">▾</span></button>
      </div>
    </header>
    <div class="ks-panel" id="ks-notifPanel" hidden role="dialog" aria-label="Notifications" tabindex="-1">
      <div class="ks-panel-head"><span class="ks-eyebrow">Notifications</span><a href="#" id="ks-allRead">Mark all read</a><span class="ks-note" id="ks-notifNote" hidden></span></div>
      <div class="ks-list" id="ks-notifList"></div>
      <div class="ks-panel-foot" id="ks-notifFoot"></div>
    </div>
    <div class="ks-panel" id="ks-appsPanel" hidden role="dialog" aria-label="Your apps" tabindex="-1">
      <div class="ks-panel-head"><span class="ks-eyebrow">Your workspace</span><a href="${escT(hubBase || "#")}" id="ks-fullMenu" ${onHub ? "hidden" : ""}>View all apps →</a><span class="ks-note" id="ks-appsNote" hidden></span></div>
      <label class="ks-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input class="ks-find" id="ks-find" type="search" aria-label="Find an app" placeholder="Find an app…" autocomplete="off"></label>
      <div class="ks-apps" id="ks-appsGrid"></div>
      <div class="ks-launch-foot"><span id="ks-appsCount" role="status">Your connected workspace</span><span class="ks-launch-shortcut"><kbd>Enter</kbd> open · <kbd>Esc</kbd> close</span></div>
    </div>
    <div class="ks-panel ks-identpanel" id="ks-identPanel" hidden role="dialog" aria-label="You" tabindex="-1"></div>`;

  const $ = (id) => el.querySelector("#" + id);
  const els = { bell: $(ids.bell), badge: $(ids.badge), theme: $(ids.theme), avatar: $(ids.avatar), identName: $(ids.identName), brandLogo: $(ids.brandLogo), brandHome: $(ids.brandHome), menuBtn: $(ids.menuBtn), ident: $("ks-ident"), notifPanel: $("ks-notifPanel"), appsPanel: $("ks-appsPanel"), identPanel: $("ks-identPanel"), extra: $("ks-extra"), eyebrow: $("ks-eyebrow"), appName: $("ks-appName") };
  const panels = [els.notifPanel, els.appsPanel, els.identPanel];
  const buttons = { [els.notifPanel.id]: els.bell, [els.appsPanel.id]: els.menuBtn, [els.identPanel.id]: els.ident };
  const noteFor = { [els.notifPanel.id]: $("ks-notifNote"), [els.appsPanel.id]: $("ks-appsNote") };
  const note = (panel, text) => { const n = noteFor[panel.id]; if (!n) return; n.textContent = text || ""; n.hidden = !text; };

  // ---- theme ----
  const paintTheme = () => { const dark = theme.get() === "dark"; els.theme.innerHTML = dark ? SUN_SVG : MOON_SVG; els.theme.title = dark ? "Switch to light" : "Switch to dark"; els.theme.setAttribute("aria-label", els.theme.title); };
  els.theme.onclick = () => { theme.set(theme.get() === "dark" ? "light" : "dark"); paintTheme(); };
  paintTheme();

  // ---- brand: company logo when the hub has one, the suite mark otherwise; the logo goes to the menu ----
  if (o.onBrand) els.brandHome.onclick = (e) => { e.preventDefault(); closeAll(); o.onBrand(); };
  (async () => { try { const a0 = actorOf(); const r = a0 && (await a0.getCompanyLogo()); if (r && r.length) { const u = blobUrl(r[0].img, r[0].mime); if (u) { els.brandLogo.src = u; els.brandLogo.hidden = false; $("ks-mark").hidden = true; } } } catch (e) {} })();

  // ---- panels: one open at a time; focus moves in and comes back; click outside / Escape closes ----
  let lastTrigger = null, focusTimer = 0;
  const closeAll = ({restoreFocus = true} = {}) => { clearTimeout(focusTimer); let wasOpen = false; for (const p of panels) { if (!p.hidden) wasOpen = true; p.hidden = true; const b = buttons[p.id]; if (b) b.setAttribute("aria-expanded", "false"); } if (restoreFocus && wasOpen && lastTrigger) { try { lastTrigger.focus(); } catch (e) {} } lastTrigger = null; };
  const toggle = (p) => { const open = !p.hidden; closeAll(); if (!open) { p.hidden = false; const b = buttons[p.id]; if (b) { b.setAttribute("aria-expanded", "true"); lastTrigger = b; } focusTimer = setTimeout(() => { if (p.hidden || destroyed) return; try { const f = p.querySelector("input:not([hidden])") || p.querySelector("button:not([hidden]), a:not([hidden])"); (f || p).focus({ preventScroll: true }); } catch (e) {} }, 0); } return !open; };
  const onDoc = (e) => { if (!el.contains(e.target)) closeAll({restoreFocus:false}); };
  const onKey = (e) => { if (e.key === "Escape") closeAll(); };
  document.addEventListener("click", onDoc); document.addEventListener("keydown", onKey);

  // ---- person ----
  const paintPerson = () => {
    els.identName.textContent = person.displayName || person.email || "–";
    els.ident.title = person.email || "You"; els.ident.setAttribute("aria-label", person.displayName ? `You: ${person.displayName}` : "You");
    if (person.avatarUrl) els.avatar.innerHTML = `<img src="${escT(person.avatarUrl)}" alt="">`; else els.avatar.textContent = initials(person.displayName || person.email);
  };
  const loadAvatar = async () => {
    const a = actorOf(); if (!a || person.avatarUrl) return;
    try { const r = await a.myAvatarPortal(token); if (r && r.length) { const u = blobUrl(r[0], "image/jpeg"); if (u) { person.avatarUrl = u; paintPerson(); } } } catch (e) {}
  };
  paintPerson();
  const viaText = () => { const p = state && state.provider; if (!p) return ""; if (p === "passkey") return "Signed in with your passkey."; if (p === "suite") return "Signed in through your menu."; return "Signed in with your company sign-in."; };
  const renderIdent = () => {
    const box = els.identPanel;
    if (!box.childElementCount) {
      box.innerHTML = `<div class="ks-who"><span class="ks-avi" id="ks-identAvi"></span><div style="min-width:0"><div class="ks-nm" id="ks-identNm"></div><div class="ks-em" id="ks-identEm"></div></div></div>
        <div class="ks-via" id="ks-identVia"></div><div class="ks-section" id="ks-identSection"></div>
        <button class="ks-signout" id="ks-signOut">Sign out</button>`;
      if (o.identSection) { try { o.identSection($("ks-identSection"), api); } catch (e) {} }
      $("ks-signOut").onclick = async () => {
        // sign out EVERYWHERE: the app's own session first, then the hub's — otherwise the next visit signs straight back in
        closeAll(); if (o.onSignOut) { try { await o.onSignOut(); } catch (e) {} }
        if (!onHub && hubBase) location.href = hubBase + "/?signout=1";
      };
    }
    $("ks-identAvi").innerHTML = person.avatarUrl ? `<img src="${escT(person.avatarUrl)}" alt="">` : escT(initials(person.displayName || person.email));
    $("ks-identNm").textContent = person.displayName || person.email; $("ks-identEm").textContent = person.email;
    const via = [viaText(), person.role === "admin" ? "You're an admin here." : ""].filter(Boolean).join(" ");
    $("ks-identVia").textContent = via; $("ks-identVia").hidden = !via;
  };
  els.ident.onclick = (e) => { e.stopPropagation(); if (toggle(els.identPanel)) renderIdent(); };

  // ---- bell: heartbeat (count) + list on open ----
  const setTitle = (n) => { try { document.title = (n > 0 ? `(${n > 99 ? "99+" : n}) ` : "") + baseTitle; } catch (e) {} };
  let lastN = -1;
  const paintBadge = () => {
    const a = actorOf();
    if (!a) { els.badge.hidden = true; els.bell.classList.add("ks-stale"); els.bell.title = "This app isn't connected to your hub yet"; els.bell.setAttribute("aria-label", els.bell.title); return; }
    if (state === null) { els.badge.hidden = true; els.bell.classList.add("ks-stale"); els.bell.title = "Notifications — your sign-in has expired"; els.bell.setAttribute("aria-label", els.bell.title); setTitle(0); return; }
    if (missed >= 2) { els.bell.classList.add("ks-stale"); els.bell.title = "Can't reach the hub right now"; els.bell.setAttribute("aria-label", els.bell.title); return; }
    els.bell.classList.remove("ks-stale");
    const n = state ? Number(state.unread) : 0;
    els.badge.textContent = n > 99 ? "99+" : String(n); els.badge.hidden = n === 0;
    if (lastN >= 0 && n > lastN) { els.badge.classList.remove("ks-pop"); void els.badge.offsetWidth; els.badge.classList.add("ks-pop"); }
    lastN = n; setTitle(n);
    els.bell.title = n ? `${n} new notification${n === 1 ? "" : "s"}` : "Notifications"; els.bell.setAttribute("aria-label", els.bell.title);
  };
  const heartbeat = async (force) => {
    const a = actorOf(); if (destroyed || !a) { paintBadge(); return; }
    if (!force && Date.now() - lastBeat < 2000) return; // focus + visibilitychange fire together
    lastBeat = Date.now();
    try {
      const r = await a.suiteState(token);
      state = r && r.length ? r[0] : null; missed = 0;
      if (state) { if (state.displayName && !person.displayName) person.displayName = state.displayName; if (state.email && !person.email) person.email = state.email; paintPerson(); }
    } catch (e) { missed += 1; }
    paintBadge();
    if (!els.identPanel.hidden) renderIdent();
    if (o.onState) { try { o.onState(state); } catch (e) {} }
  };
  const reconnectHtml = () => `<div class="ks-empty">Your sign-in has expired. ${reconnectShown ? "Still no luck? Ask your IT team." : '<a href="#" id="ks-reconnect">Sign in again</a> — you\'ll come straight back here.'}</div>`;
  const wireReconnect = () => { const a = $("ks-reconnect"); if (a) a.onclick = (e) => { e.preventDefault(); reconnectShown = true; try { sessionStorage.setItem("ks-reconnected", "1"); } catch (e2) {} location.href = hubJumpUrl(hubBase, location.origin + location.pathname); }; };
  try { reconnectShown = sessionStorage.getItem("ks-reconnected") === "1" && state === null; } catch (e) {}
  const renderList = () => {
    const list = $("ks-notifList");
    if (!actorOf()) { list.innerHTML = '<div class="ks-empty">This app isn\'t connected to your hub yet — ask whoever installed it.</div>'; $("ks-allRead").hidden = true; return; }
    if (state === null) { list.innerHTML = reconnectHtml(); wireReconnect(); $("ks-allRead").hidden = true; return; }
    if (!listKnown) { list.innerHTML = '<div class="ks-empty">Loading…</div>'; $("ks-allRead").hidden = true; return; }
    const items = notifCache.items;
    list.innerHTML = (items.length ? items.map((n) => `<button class="ks-item ${n.read ? "" : "ks-unread"}" data-nid="${Number(n.id)}"><div class="ks-t">${escT(n.title)}</div><div class="ks-m" title="${escT(exactTime(n.at))}">${escT(n.fromApp)} · ${relTime(n.at)}</div></button>`).join("") : '<div class="ks-empty">Nothing yet — your apps will tell you here when something needs you.</div>')
      + (Number(notifCache.total) > items.length ? `<div class="ks-more">and ${Number(notifCache.total) - items.length} older — they stay for 90 days</div>` : "");
    for (const b of list.querySelectorAll("[data-nid]")) b.onclick = () => openItem(Number(b.dataset.nid));
    $("ks-allRead").hidden = !items.some((n) => !n.read);
  };
  const refreshList = async () => {
    const a = actorOf(); if (!a) { renderList(); return; }
    try { const r = await a.myNotifications(token, 30n); if (state !== null) { notifCache = r; listKnown = true; if (state) state = Object.assign({}, state, { unread: r.unread }); } note(els.notifPanel, ""); }
    catch (e) { note(els.notifPanel, "Couldn't reach the hub — showing what we had."); }
    renderList(); paintBadge();
  };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  const openItem = async (id) => {
    const n = notifCache.items.find((x) => Number(x.id) === id); if (!n) return;
    if (!n.read) { try { await withTimeout(actorOf().markNotificationsRead(token, [BigInt(id)]), 1500); n.read = true; } catch (e) { note(els.notifPanel, "Couldn't reach the hub — try again."); } }
    closeAll();
    if (n.url && /^https:\/\//.test(n.url)) { if (originOf(n.url) === location.origin) location.href = n.url; else window.open(n.url, "_blank", "noopener"); }
    refreshList();
  };
  $("ks-allRead").onclick = async (e) => { e.preventDefault(); try { await withTimeout(actorOf().markNotificationsRead(token, []), 1500); } catch (e2) { note(els.notifPanel, "Couldn't reach the hub — try again."); } await refreshList(); };
  els.bell.onclick = (e) => { e.stopPropagation(); if (toggle(els.notifPanel)) { renderList(); refreshList(); renderFoot(); } };
  const renderFoot = () => {
    const f = $("ks-notifFoot");
    if (o.notifFooter) { if (!f.childElementCount) { try { o.notifFooter(f, api); } catch (e) {} } return; }
    f.innerHTML = `<span>Same notifications in every app.</span><a href="${escT(hubBase || "#")}">Also get them on Slack? Switch it on in your menu ›</a>`;
  };

  // ---- Apps panel: the person's apps, fresh on every open; search stays available ----
  const currentOrigin = originOf(o.currentUrl);
  const jumpDefault = (a) => {
    if (a.kind === "link" || a.kind === "oidc") { window.open(a.url, "_blank", "noopener"); return; } // outside links open in a new tab, no ticket travels
    if (a.kind === "win") { window.open(hubBase + "/?jump=" + Number(a.id), "_blank", "popup=yes,width=1060,height=640"); return; }
    location.href = hubBase + "/?jump=" + Number(a.id); // apps open in this tab, signed in through the hub
  };
  const paintApps = () => {
    const g = $("ks-appsGrid"), q = ($("ks-find").value || "").trim().toLowerCase();
    if (!actorOf()) { g.innerHTML = '<div class="ks-empty">This app isn\'t connected to your hub yet.</div>'; return; }
    if (state === null) { g.innerHTML = reconnectHtml(); wireReconnect(); return; }
    if (appsCache === null) { g.innerHTML = '<div class="ks-empty">Loading…</div>'; return; }
    const rows = appsCache.slice().sort((a, b) => a.name.localeCompare(b.name)).filter((a) => !q || (a.name + " " + (a.note || "")).toLowerCase().includes(q));
    $("ks-appsCount").textContent = q ? `${rows.length} of ${appsCache.length} apps` : `${appsCache.length} app${appsCache.length === 1 ? "" : "s"} available`;
    if (!appsCache.length) { g.innerHTML = '<div class="ks-empty">No apps on your menu yet.</div>'; return; }
    if (!rows.length) { g.innerHTML = '<div class="ks-empty">No app matches.</div>'; return; }
    g.innerHTML = rows.map((a) => { const cur = originOf(a.url) === currentOrigin; return `<button class="ks-app ${cur ? "ks-current" : ""}" data-app="${Number(a.id)}" title="${escT(a.note || a.name)}"${cur ? ' aria-current="page"' : ""}>${appIconHtml(a)}<span class="ks-app-copy"><span class="ks-nm">${escT(a.name)}</span><span class="ks-here">${cur ? 'Current app' : a.kind === 'link' ? 'Website ↗' : a.kind === 'oidc' ? 'Company sign-in ↗' : 'Open app →'}</span></span></button>`; }).join("");
    for (const b of g.querySelectorAll("[data-app]")) b.onclick = () => { const a = appsCache.find((x) => Number(x.id) === Number(b.dataset.app)); if (!a) return; closeAll(); if (b.classList.contains("ks-current")) return; (o.jump || jumpDefault)(a); };
    for (const ic of g.querySelectorAll("[data-icon]")) { const id = ic.dataset.icon; (async () => { if (iconCache[id] === undefined) { try { const r = await actorOf().tileIcon(BigInt(id)); iconCache[id] = r && r.length ? blobUrl(r[0].img, r[0].mime) : ""; } catch (e) { iconCache[id] = ""; } } if (iconCache[id]) { ic.innerHTML = `<img src="${iconCache[id]}" alt="">`; ic.classList.add("pic"); } })(); }
  };
  const refreshApps = async () => {
    const a = actorOf(); if (!a || state === null) { paintApps(); return; }
    try { const rows = await a.portalApps(token); appsCache = rows; appsErr = false; note(els.appsPanel, ""); const mine = rows.find((x) => originOf(x.url) === currentOrigin); if (mine && !onHub) els.appName.textContent = mine.name; }
    catch (e) { appsErr = true; note(els.appsPanel, appsCache ? "Couldn't reach the hub — showing your last list." : "Couldn't reach the hub."); if (appsCache === null) appsCache = []; }
    paintApps();
  };
  $("ks-find").oninput = paintApps;
  $("ks-find").onkeydown = (e) => {
    if (e.key === "Enter") { const first = $("ks-appsGrid").querySelector("[data-app]"); if (first) { e.preventDefault(); first.click(); } }
    if (e.key === "ArrowDown") { const first = $("ks-appsGrid").querySelector("[data-app]"); if (first) { e.preventDefault(); first.focus(); } }
  };
  els.menuBtn.onclick = (e) => { e.stopPropagation(); if (toggle(els.appsPanel)) { $("ks-find").value = ""; paintApps(); refreshApps(); } };

  // ---- extra buttons (hub only) ----
  const renderExtra = () => { els.extra.innerHTML = (o.extra || []).map((b) => `<button id="${escT(b.id)}" title="${escT(b.title || "")}" ${b.hidden ? "hidden" : ""}>${escT(b.label)}</button>`).join(""); for (const b of o.extra || []) { const btn = $(b.id); if (btn) btn.onclick = () => { closeAll(); b.onClick && b.onClick(); }; } };
  renderExtra();

  // ---- freshness: heartbeat every 30 s while visible, again when the tab comes back, list/apps refresh while open ----
  const tick = () => { if (document.hidden) return; heartbeat(); if (!els.notifPanel.hidden) refreshList(); };
  const onVis = () => { if (document.visibilityState === "visible") { heartbeat(); if (!els.notifPanel.hidden) refreshList(); } };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", onVis);
  timer = setInterval(tick, pollMs);
  heartbeat(true); loadAvatar();

  const api = {
    els, get state() { return state; }, get person() { return person; },
    refresh: () => heartbeat(true), refreshList, refreshApps,
    setPerson(p) { person = Object.assign(person, p || {}); paintPerson(); if (!els.identPanel.hidden) renderIdent(); },
    setToken(t) { token = t || ""; appsCache = null; listKnown = false; state = undefined; missed = 0; heartbeat(true); loadAvatar(); },
    setApp(a) { if (a && a.id != null) $("ks-appMark").innerHTML = appLogoHtml(a.id); if (a && a.name != null) els.appName.textContent = a.name; if (a && a.eyebrow != null) { els.eyebrow.textContent = a.eyebrow; els.eyebrow.hidden = !a.eyebrow; } },
    setExtraHidden(id, hidden) { const b = $(id); if (b) b.hidden = !!hidden; },
    openNotifications() { closeAll(); els.notifPanel.hidden = false; els.bell.setAttribute("aria-expanded", "true"); lastTrigger = els.bell; renderList(); refreshList(); renderFoot(); },
    closeAll,
    destroy() { destroyed = true; clearTimeout(focusTimer); clearInterval(timer); document.removeEventListener("click", onDoc); document.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); setTitle(0); el.innerHTML = ""; el.classList.remove("ks-topbar-host"); },
  };
  return api;
}

// Classic-script hosts (the hub's own index.html, jsdom smokes) reach the same functions here.
if (typeof globalThis !== "undefined") globalThis.kebabHub = { takeHubTicket, hubJumpUrl, session, initials, topbarIdlFactory, mountTopbar, relTime, hue, abbrev, appIconHtml };
