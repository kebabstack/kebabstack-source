// The tools an assistant gets. Two layers:
//   generic  — kebab_apps · kebab_describe · kebab_call: every method of every app on the person's menu, from the live Candid
//   curated  — the questions people actually ask (tickets, devices, colleagues, domains), each a thin wrapper over the generic layer
// Every call runs as the connected person, with that person's rights — the hub mints the tickets, the apps do the gating.
import { z } from "zod";

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ isError: true, content: [{ type: "text", text: msg }] });
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const RW_ANY = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }; // kebab_call reaches delete/remove/archive too
const wrap = (fn) => async (args) => { try { return text(await fn(args)); } catch (e) { return fail(e && e.message ? e.message : String(e)); } };

export function registerTools(server, rt) {
  // ---- connection ----
  server.registerTool("kebab_connect", {
    title: "Connect to your company hub",
    description: "Exchange the one-time code from the hub menu (Menu → your name → Connect an assistant) for this assistant's personal token. Ask the person for the code; it looks like <hub-canister-id>.<64 hex characters> and is valid for 10 minutes.",
    inputSchema: { code: z.string().describe("the code shown in the hub menu"), clientName: z.string().optional().describe("how this assistant should be listed in the hub, e.g. 'Desktop chat'") },
    annotations: RW,
  }, wrap(({ code, clientName }) => rt.connect(code, clientName)));

  server.registerTool("kebab_whoami", {
    title: "Who am I here",
    description: "The connected person (name, address, stable id, company, hub role) and the apps on their menu. Call this first when unsure what is available.",
    inputSchema: {},
    annotations: RO,
  }, wrap(async () => ({ me: await rt.whoami(), apps: (await rt.listApps()).map((a) => ({ app: a.slug, name: a.name, note: a.note, url: a.url })) })));

  // ---- generic layer ----
  server.registerTool("kebab_apps", {
    title: "List my apps",
    description: "The apps this person can open, with the short name (slug) to use in kebab_describe / kebab_call.",
    inputSchema: {},
    annotations: RO,
  }, wrap(async () => (await rt.listApps(true)).map((a) => ({ app: a.slug, name: a.name, note: a.note, url: a.url }))));

  server.registerTool("kebab_describe", {
    title: "Describe an app's interface",
    description: "The app's live Candid interface with its documentation comments. Conventions: methods whose first argument is `tok : text` take the session — kebab_call adds it for you, pass the remaining arguments only. Writes return { ok; detail } in plain language. Use this before kebab_call on a method you have not seen.",
    inputSchema: { app: z.string().describe("app slug or name from kebab_apps, e.g. 'desk'") },
    annotations: RO,
  }, wrap(async ({ app }) => { const d = await rt.describe(app); return `# ${d.app.name} (${d.app.slug}) · ${d.app.url}\n${d.candid}`; }));

  server.registerTool("kebab_call", {
    title: "Call an app method as the person",
    description: "Call any method of an app on the person's menu, signed in as that person. args = JSON array of the arguments AFTER the session token (nat/int as numbers, opt as value or null, variants as {\"tag\": value} or \"tag\", blobs as base64). Set withSession=false for public methods without a token (info, hub_ping, publicForm). Writes change real data — confirm with the person first.",
    inputSchema: {
      app: z.string().describe("app slug or name"),
      method: z.string().describe("method name from kebab_describe"),
      args: z.array(z.any()).default([]).describe("arguments after the session token, as JSON"),
      withSession: z.boolean().default(true).describe("prepend the person's session token (default true)"),
    },
    annotations: RW_ANY,
  }, wrap(({ app, method, args, withSession }) => rt.call(app, method, args, withSession)));

  // ---- curated: people ----
  server.registerTool("kebab_people", {
    title: "Find colleagues",
    description: "Search the company directory by name or address: id, address, name, title, department, hub groups (active people only, as every app's picker sees them).",
    inputSchema: { query: z.string().describe("part of a name or address; empty = first 25") },
    annotations: RO,
  }, wrap(({ query }) => rt.people(query)));

  // ---- curated: service desk (app slug "desk") ----
  server.registerTool("kebab_my_tickets", {
    title: "My tickets",
    description: "The person's own service-desk tickets (all states) plus approvals waiting for them.",
    inputSchema: {},
    annotations: RO,
  }, wrap(async () => ({ mine: await rt.call("desk", "myTickets", []), approvalsWaitingForMe: await rt.call("desk", "myApprovals", []) })));

  server.registerTool("kebab_tickets", {
    title: "Service-desk queue (agents)",
    description: "For agents/admins: tickets by view — open | mine | unassigned | waiting | breached | done | all — optionally filtered by status, queue, assignee (address) or a search text.",
    inputSchema: { view: z.enum(["open", "mine", "unassigned", "waiting", "breached", "done", "all"]).default("open"), status: z.string().default(""), queue: z.string().default(""), assignee: z.string().default("").describe("address"), q: z.string().default("").describe("search text") },
    annotations: RO,
  }, wrap(({ view, status, queue, assignee, q }) => rt.call("desk", "listTickets", [{ view, status, queue, assignee, q }])));

  server.registerTool("kebab_ticket", {
    title: "One ticket in full",
    description: "A ticket with its timeline, checklist, approval, files and the people involved. id = the number (42) or the key (DSK-42).",
    inputSchema: { id: z.union([z.number(), z.string()]).describe("ticket number or key like DSK-42") },
    annotations: RO,
  }, wrap(async ({ id }) => {
    const n = typeof id === "number" ? id : Number(String(id).replace(/^[A-Za-z]+-/, ""));
    if (!Number.isFinite(n)) throw new Error("give a ticket number or a key like DSK-42");
    const t = await rt.call("desk", "getTicket", [n]); // opt → null | ticket
    if (!t) throw new Error("no such ticket, or not yours to see");
    return t;
  }));

  server.registerTool("kebab_new_request", {
    title: "File a service-desk request",
    description: "File a request for the connected person. requestType = the name of a catalog entry (call kebab_catalog to see them and their fields); fields = key/value pairs the type asks for (dates yyyy-mm-dd, person fields as addresses). Confirm subject and details with the person before calling.",
    inputSchema: { requestType: z.string(), subject: z.string(), body: z.string().default(""), fields: z.record(z.string()).default({}) },
    annotations: RW,
  }, wrap(async ({ requestType, subject, body, fields }) => {
    const cat = await rt.call("desk", "catalog", []);
    const q = requestType.trim().toLowerCase();
    const rt2 = cat.find((c) => c.name.toLowerCase() === q) || cat.find((c) => c.name.toLowerCase().includes(q));
    if (!rt2) throw new Error(`no request type "${requestType}" — available: ${cat.map((c) => c.name).join(", ")}`);
    return rt.call("desk", "createRequest", [rt2.id, subject, body, Object.entries(fields)]);
  }));

  server.registerTool("kebab_catalog", {
    title: "Service-desk catalog",
    description: "What can be requested: request types with their fields (key, title, kind, required) and approval rules.",
    inputSchema: {},
    annotations: RO,
  }, wrap(() => rt.call("desk", "catalog", [])));

  server.registerTool("kebab_comment", {
    title: "Reply on a ticket",
    description: "Post a public comment on a ticket as the person (requester or agent). Agents: use kebab_call with addNote for an internal note.",
    inputSchema: { id: z.union([z.number(), z.string()]), body: z.string() },
    annotations: RW,
  }, wrap(({ id, body }) => rt.call("desk", "comment", [Number(String(id).replace(/^[A-Za-z]+-/, "")), body])));

  // ---- curated: devices (app slug "assets") ----
  server.registerTool("kebab_devices", {
    title: "Devices — who has what",
    description: "Search the device register (tag, serial, vendor, model, holder). Admins see everything, members their own devices. status filter: assigned | in_stock | loaned | sold | scrapped | lost | unknown.",
    inputSchema: { query: z.string().default(""), status: z.string().default(""), archived: z.boolean().default(false) },
    annotations: RO,
  }, wrap(({ query, status, archived }) => rt.call("assets", "listAssets", [query, status, archived])));

  // ---- curated: device posture (app slug "trust") ----
  server.registerTool("kebab_my_devices", {
    title: "My devices' health",
    description: "Devices with their posture checks and score — a member sees their own devices, staff see the fleet.",
    inputSchema: {},
    annotations: RO,
  }, wrap(() => rt.call("trust", "devices", [])));

  // ---- curated: domains (app slug "watch") ----
  server.registerTool("kebab_domains", {
    title: "Our domains",
    description: "Watched domains with open changes, worst state, expiry days and grade.",
    inputSchema: {},
    annotations: RO,
  }, wrap(() => rt.call("watch", "listDomains", [])));
}
