// The runtime behind the tools: the assistant token, the hub, the person's apps, one session per app.
// Everything that touches the network goes through `deps` so the tests can swap in fakes.
import { Actor, HttpAgent, fetchCandid } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { argsToCandid, fromCandid, unwrapOpt } from "./candid-json.mjs";
import { didToIdlFactory } from "./did-parse.mjs";

export const IC_HOST = "https://icp0.io";
export const CONFIG_PATH = process.env.KEBAB_MCP_CONFIG || path.join(os.homedir(), ".kebab-mcp", "config.json");

/** the slice of the hub the assistant plane needs (hub ≥ 0.18) */
export const hubIdl = ({ IDL }) => IDL.Service({
  redeemAssistantCode: IDL.Func([IDL.Text, IDL.Text], [IDL.Record({ ok: IDL.Bool, token: IDL.Text, email: IDL.Text, displayName: IDL.Text, id: IDL.Text, expiresAt: IDL.Int, orgName: IDL.Text, detail: IDL.Text })], []),
  assistantWhoami: IDL.Func([IDL.Text], [IDL.Opt(IDL.Record({ email: IDL.Text, displayName: IDL.Text, id: IDL.Text, client: IDL.Text, expiresAt: IDL.Int, orgName: IDL.Text, hubRole: IDL.Text }))], ["query"]),
  assistantApps: IDL.Func([IDL.Text], [IDL.Vec(IDL.Record({ tileId: IDL.Nat, name: IDL.Text, url: IDL.Text, note: IDL.Text, canisterId: IDL.Text }))], ["query"]),
  assistantTicket: IDL.Func([IDL.Text, IDL.Nat], [IDL.Record({ ok: IDL.Bool, ticket: IDL.Text, url: IDL.Text, detail: IDL.Text })], []),
  assistantPeople: IDL.Func([IDL.Text, IDL.Text], [IDL.Vec(IDL.Record({ id: IDL.Text, email: IDL.Text, displayName: IDL.Text, title: IDL.Text, department: IDL.Text, groups: IDL.Vec(IDL.Text) }))], ["query"]),
});
/** what every SDK app answers without a session */
const pingIdl = ({ IDL }) => IDL.Service({ hub_ping: IDL.Func([], [IDL.Text], ["query"]) });

export function loadConfig(p = CONFIG_PATH) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return null; } }
export function saveConfig(cfg, p = CONFIG_PATH) { fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 }); fs.writeFileSync(p, JSON.stringify(cfg, null, 2), { mode: 0o600 }); }

/** default network deps: agent-js against the IC HTTP gateway; an app's interface comes from its own canister metadata */
export function networkDeps(host = IC_HOST) {
  let agentP = null;
  const agent = () => (agentP ??= HttpAgent.create({ host }));
  const candid = async (canisterId) => fetchCandid(canisterId, await agent());
  return {
    actor: async (idlFactory, canisterId) => Actor.createActor(idlFactory, { agent: await agent(), canisterId }),
    candid,
    // 0.2.0: the interface is PARSED from the backend's `candid:service` metadata (read through the IC API) — never
    // fetched as JavaScript from a frontend URL and executed here (that let any app frontend run code on this machine).
    idlFactoryFor: async (app) => {
      let did = "";
      try { did = await candid(app.canisterId); } catch (e) { throw new Error(`${app.name}: could not read the interface of ${app.canisterId} (${e.message}) — the backend publishes no candid:service metadata`); }
      if (!did) throw new Error(`${app.name}: the backend ${app.canisterId} publishes no interface (candid:service)`);
      return didToIdlFactory(did);
    },
  };
}

export function createRuntime({ config, deps, saveConfig: save = saveConfig }) {
  let cfg = config;
  const apps = new Map(); // slug -> { app, idlFactory, actor, service, session, sessionAt }
  let appList = null, appListAt = 0;
  const hub = async () => { if (!cfg) throw new Error("not connected — run `kebab-mcp connect <code>` (the code comes from the hub menu: Connect an assistant)"); return deps.actor(hubIdl, cfg.hubCanisterId); };

  async function connect(code, clientName) {
    const m = String(code || "").trim().match(/^([a-z0-9-]+)\.([0-9a-f]{16,128})$/i);
    if (!m) throw new Error("that does not look like a hub code (expected <hub canister id>.<code>) — copy it from the hub menu: Connect an assistant");
    const h = await deps.actor(hubIdl, m[1]);
    const r = await h.redeemAssistantCode(code.trim(), clientName || "kebab-mcp");
    if (!r.ok) throw new Error(r.detail);
    cfg = { hubCanisterId: m[1], token: r.token, email: r.email, displayName: r.displayName, id: r.id, orgName: r.orgName, expiresAt: r.expiresAt.toString(), connectedAt: new Date().toISOString(), client: clientName || "kebab-mcp" };
    save(cfg); apps.clear(); appList = null;
    return { email: cfg.email, displayName: cfg.displayName, orgName: cfg.orgName, expiresAt: new Date(Number(r.expiresAt / 1000000n)).toISOString() };
  }
  async function whoami() {
    const h = await hub();
    const w = unwrapOpt(await h.assistantWhoami(cfg.token));
    if (!w) throw new Error("the hub no longer accepts this assistant — disconnected, expired (30 days), locked out or switched off. Reconnect from the hub menu.");
    return { ...fromCandid(w), expiresAt: new Date(Number(w.expiresAt / 1000000n)).toISOString() };
  }
  async function listApps(force = false) {
    if (!force && appList && Date.now() - appListAt < 60_000) return appList;
    const h = await hub();
    const rows = await h.assistantApps(cfg.token);
    const out = [];
    for (const r of rows) {
      let slug = "";
      try { slug = String(await (await deps.actor(pingIdl, r.canisterId)).hub_ping()); } catch (_) {} // not an SDK app → no slug, still callable by name
      out.push({ tileId: Number(r.tileId), name: r.name, slug: slug || r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), url: r.url, note: r.note, canisterId: r.canisterId });
    }
    appList = out; appListAt = Date.now();
    return out;
  }
  async function findApp(nameOrSlug) {
    const q = String(nameOrSlug || "").trim().toLowerCase();
    const list = await listApps();
    const hit = list.find((a) => a.slug === q) || list.find((a) => a.name.toLowerCase() === q) || list.find((a) => a.slug.includes(q) || a.name.toLowerCase().includes(q));
    if (!hit) throw new Error(`no app "${nameOrSlug}" on your menu — you have: ${list.map((a) => a.slug).join(", ") || "none"}`);
    return hit;
  }
  async function entry(nameOrSlug) {
    const app = await findApp(nameOrSlug);
    let e = apps.get(app.slug);
    if (!e) {
      const idlFactory = await deps.idlFactoryFor(app);
      const service = idlFactory({ IDL });
      const actor = await deps.actor(idlFactory, app.canisterId);
      e = { app, idlFactory, service, actor, session: "", sessionAt: 0 };
      apps.set(app.slug, e);
    }
    return e;
  }
  /** sign into an app as the person: hub ticket → loginWithTicket (once per ~9 h, or after the app forgot us) */
  async function session(e, fresh = false) {
    if (!fresh && e.session && Date.now() - e.sessionAt < 9 * 3600_000) return e.session;
    const h = await hub();
    const t = await h.assistantTicket(cfg.token, BigInt(e.app.tileId));
    if (!t.ok) throw new Error(`${e.app.name}: ${t.detail}`);
    if (typeof e.actor.loginWithTicket !== "function") throw new Error(`${e.app.name} has no loginWithTicket — not an SDK app`);
    const r = unwrapOpt(await e.actor.loginWithTicket(t.ticket));
    if (!r || !r.token) throw new Error(`${e.app.name} refused the sign-in — are you allowed into this app right now?`);
    e.session = r.token; e.sessionAt = Date.now();
    return e.session;
  }
  function methodOf(e, method) {
    const f = e.service._fields.find(([n]) => n === method);
    if (!f) throw new Error(`${e.app.name} has no method "${method}" — call kebab_describe first (methods: ${e.service._fields.map(([n]) => n).slice(0, 40).join(", ")}${e.service._fields.length > 40 ? ", …" : ""})`);
    return f[1];
  }
  /** does the app still accept our session? SDK apps answer `whoami(tok)` / `me(tok)` with null when it is gone */
  async function sessionAlive(e) {
    const probe = ["whoami", "me"].find((n) => e.service._fields.some(([name]) => name === n) && typeof e.actor[n] === "function");
    if (!probe) return true; // no way to tell — assume alive, never retry blindly
    try { return unwrapOpt(await e.actor[probe](e.session)) !== null; } catch (_) { return true; }
  }
  /** call any method; with session = true the app session token is prepended (every SDK method that takes `tok` first).
   *  A single `opt` result is unwrapped (null | value). Only QUERIES are retried, and only after the app confirmed the
   *  session is gone — an update is never sent twice (a request would otherwise be filed twice, audit MC-02). */
  async function call(nameOrSlug, method, args = [], withSession = true) {
    const e = await entry(nameOrSlug);
    const func = methodOf(e, method);
    const isQuery = func.annotations.includes("query") || func.annotations.includes("composite_query");
    const run = async () => {
      const full = withSession ? [await session(e), ...args] : args;
      const candidArgs = argsToCandid(func, full);
      const raw = await e.actor[method](...candidArgs);
      const single = func.retTypes.length === 1 && func.retTypes[0] instanceof IDL.OptClass;
      return fromCandid(single ? unwrapOpt(raw) : raw);
    };
    let out = await run();
    const empty = out === null || (Array.isArray(out) && out.length === 0);
    if (withSession && isQuery && empty && Date.now() - e.sessionAt > 60_000 && !(await sessionAlive(e))) { await session(e, true); out = await run(); }
    return out;
  }
  async function describe(nameOrSlug) {
    const e = await entry(nameOrSlug);
    let did = "";
    try { did = await deps.candid(e.app.canisterId); } catch (err) { did = `// candid:service metadata not readable (${err.message}); methods: ${e.service._fields.map(([n, f]) => n + " " + f.display()).join("\n// ")}`; }
    return { app: e.app, candid: did };
  }
  async function people(q) { const h = await hub(); return fromCandid(await h.assistantPeople(cfg.token, q || "")); }
  return { get config() { return cfg; }, connect, whoami, listApps, findApp, call, describe, people, disconnectLocal: () => { cfg = null; } };
}
