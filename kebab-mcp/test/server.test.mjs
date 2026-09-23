// End-to-end over the MCP protocol (in-memory transport): connect with a code, list apps, sign into "desk"
// through a hub ticket, call curated and generic tools, see writes go through with the person's session.
// The hub and the apps are fakes shaped exactly like the real Candid interfaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { IDL } from "@dfinity/candid";
import { createRuntime } from "../lib/runtime.mjs";
import { buildServer } from "../server.mjs";

const HUB = "rwlgt-iiaaa-aaaaa-aaaaa-cai", DESK = "rrkah-fqaaa-aaaaa-aaaaq-cai", ASSETS = "aaaaa-aa";
const now = BigInt(Date.now()) * 1000000n;
const calls = [];
// the desk's real-shaped bindings (a subset) — what <desk>/idl.js would export
const deskIdl = ({ IDL }) => {
  const Row = IDL.Record({ id: IDL.Nat, key: IDL.Text, subject: IDL.Text, status: IDL.Text, requester: IDL.Text, requesterName: IDL.Text });
  return IDL.Service({
    hub_ping: IDL.Func([], [IDL.Text], ["query"]),
    loginWithTicket: IDL.Func([IDL.Text], [IDL.Opt(IDL.Record({ token: IDL.Text, email: IDL.Text, displayName: IDL.Text, role: IDL.Text, suiteToken: IDL.Text }))], []),
    myTickets: IDL.Func([IDL.Text], [IDL.Vec(Row)], ["query"]),
    myApprovals: IDL.Func([IDL.Text], [IDL.Vec(Row)], ["query"]),
    listTickets: IDL.Func([IDL.Text, IDL.Record({ status: IDL.Text, queue: IDL.Text, assignee: IDL.Text, q: IDL.Text, view: IDL.Text })], [IDL.Vec(Row)], ["query"]),
    catalog: IDL.Func([IDL.Text], [IDL.Vec(IDL.Record({ id: IDL.Nat, name: IDL.Text, fields: IDL.Vec(IDL.Record({ key: IDL.Text, kind: IDL.Text, required: IDL.Bool })) }))], ["query"]),
    createRequest: IDL.Func([IDL.Text, IDL.Nat, IDL.Text, IDL.Text, IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], [IDL.Record({ ok: IDL.Bool, id: IDL.Nat, key: IDL.Text, detail: IDL.Text })], []),
    setPriority: IDL.Func([IDL.Text, IDL.Nat, IDL.Text], [IDL.Record({ ok: IDL.Bool, detail: IDL.Text })], []),
    info: IDL.Func([], [IDL.Record({ orgName: IDL.Text, version: IDL.Text })], ["query"]),
  });
};
const fakeDesk = {
  hub_ping: async () => "desk",
  loginWithTicket: async (t) => { calls.push(["desk.loginWithTicket", t]); return t.startsWith("tkt-") ? [{ token: "desk-sess-1", email: "ana@acme.com", displayName: "Ana Ruiz", role: "requester", suiteToken: "s" }] : []; },
  myTickets: async (tok) => { calls.push(["desk.myTickets", tok]); return [{ id: 42n, key: "DSK-42", subject: "Wifi drops", status: "open", requester: "p_00000000000000a1", requesterName: "Ana Ruiz" }]; },
  myApprovals: async () => [],
  listTickets: async (tok, f) => { calls.push(["desk.listTickets", f]); return []; },
  catalog: async () => [{ id: 3n, name: "Something is broken", fields: [{ key: "where", kind: "select", required: false }] }],
  createRequest: async (tok, typeId, subject, body, fields) => { calls.push(["desk.createRequest", tok, typeId, subject, body, fields]); return { ok: true, id: 43n, key: "DSK-43", detail: "" }; },
  setPriority: async (tok, id, p) => { calls.push(["desk.setPriority", tok, id, p]); return { ok: true, detail: "" }; },
  info: async () => ({ orgName: "Acme", version: "0.6.0" }),
};
let hubEnabled = true, redeemed = 0;
const fakeHub = {
  redeemAssistantCode: async (code, client) => { redeemed++; calls.push(["hub.redeem", code, client]); if (redeemed > 1) return { ok: false, token: "", email: "", displayName: "", id: "", expiresAt: 0n, orgName: "", detail: "unknown or already used code" }; return { ok: true, token: "asst-token-xyz", email: "ana@acme.com", displayName: "Ana Ruiz", id: "p_00000000000000a1", expiresAt: now + 30n * 86400n * 1000000000n, orgName: "Acme", detail: "" }; },
  assistantWhoami: async (tok) => (hubEnabled && tok === "asst-token-xyz" ? [{ email: "ana@acme.com", displayName: "Ana Ruiz", id: "p_00000000000000a1", client: "test", expiresAt: now, orgName: "Acme", hubRole: "" }] : []),
  assistantApps: async (tok) => (hubEnabled && tok === "asst-token-xyz" ? [{ tileId: 5n, name: "Service desk", url: "https://desk.example", note: "requests", canisterId: DESK }, { tileId: 6n, name: "Devices", url: "https://assets.example", note: "", canisterId: ASSETS }] : []),
  assistantTicket: async (tok, tileId) => { calls.push(["hub.ticket", tok, tileId]); return hubEnabled && tok === "asst-token-xyz" ? { ok: true, ticket: "tkt-" + tileId, url: "https://desk.example", detail: "" } : { ok: false, ticket: "", url: "", detail: "assistant token unknown, expired, revoked or switched off" }; },
  assistantPeople: async (tok, q) => [{ id: "p_00000000000000b2", email: "ben@acme.com", displayName: "Ben Ko", title: "IT", department: "Ops", groups: ["desk-agents"] }].filter((p) => p.displayName.toLowerCase().includes(q.toLowerCase())),
};
const fakeAssets = { hub_ping: async () => "assets" };
const deps = {
  actor: async (idlFactory, canisterId) => { if (canisterId === HUB) return fakeHub; if (canisterId === DESK) return fakeDesk; if (canisterId === ASSETS) return fakeAssets; throw new Error("unknown canister " + canisterId); },
  candid: async (cid) => `service : {\n  /// the person's own tickets\n  myTickets : (tok : text) -> (vec Row) query;\n}`,
  idlFactoryFor: async (app) => (app.canisterId === DESK ? deskIdl : ({ IDL }) => IDL.Service({ hub_ping: IDL.Func([], [IDL.Text], ["query"]) })),
};

async function pair(rt) {
  const server = buildServer(rt);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(ct);
  return client;
}
const textOf = (r) => r.content[0].text;
const jsonOf = (r) => JSON.parse(textOf(r));

test("connect → whoami → curated + generic tools act as the person through hub tickets", async () => {
  let saved = null;
  const rt = createRuntime({ config: null, deps, saveConfig: (c) => { saved = c; } });
  const client = await pair(rt);
  const tools = (await client.listTools()).tools;
  assert.ok(tools.find((t) => t.name === "kebab_call") && tools.find((t) => t.name === "kebab_my_tickets"), "generic + curated tools registered");
  assert.equal(tools.find((t) => t.name === "kebab_my_tickets").annotations.readOnlyHint, true);
  assert.equal(tools.find((t) => t.name === "kebab_new_request").annotations.readOnlyHint, false, "writes are marked");
  // not connected yet
  let r = await client.callTool({ name: "kebab_whoami", arguments: {} });
  assert.equal(r.isError, true); assert.match(textOf(r), /not connected/);
  // wrong code shape is refused locally, a real code is exchanged once
  r = await client.callTool({ name: "kebab_connect", arguments: { code: "nonsense" } });
  assert.equal(r.isError, true); assert.match(textOf(r), /hub code/);
  r = await client.callTool({ name: "kebab_connect", arguments: { code: HUB + ".0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", clientName: "Desktop chat" } });
  assert.equal(r.isError, undefined, textOf(r));
  assert.equal(jsonOf(r).email, "ana@acme.com");
  assert.equal(saved.token, "asst-token-xyz"); assert.equal(saved.hubCanisterId, HUB);
  assert.equal(calls.find((c) => c[0] === "hub.redeem")[2], "Desktop chat");
  // whoami + apps (slug from hub_ping)
  r = await client.callTool({ name: "kebab_whoami", arguments: {} });
  const w = jsonOf(r);
  assert.equal(w.me.email, "ana@acme.com");
  assert.deepEqual(w.apps.map((a) => a.app), ["desk", "assets"]);
  // curated: my tickets → hub ticket → desk.loginWithTicket → desk.myTickets with the app session
  r = await client.callTool({ name: "kebab_my_tickets", arguments: {} });
  assert.equal(r.isError, undefined, textOf(r));
  assert.equal(jsonOf(r).mine[0].key, "DSK-42");
  assert.deepEqual(calls.find((c) => c[0] === "hub.ticket").slice(1), ["asst-token-xyz", 5n]);
  assert.deepEqual(calls.find((c) => c[0] === "desk.myTickets"), ["desk.myTickets", "desk-sess-1"]);
  // the session is reused, not re-minted
  const ticketsBefore = calls.filter((c) => c[0] === "hub.ticket").length;
  r = await client.callTool({ name: "kebab_tickets", arguments: { view: "unassigned" } });
  assert.equal(calls.filter((c) => c[0] === "hub.ticket").length, ticketsBefore, "one app session per app");
  assert.equal(calls.find((c) => c[0] === "desk.listTickets")[1].view, "unassigned");
  // curated write: file a request — type resolved by name, fields as tuples, the person's session first
  r = await client.callTool({ name: "kebab_new_request", arguments: { requestType: "something is broken", subject: "Printer", body: "jams", fields: { where: "Office" } } });
  assert.equal(r.isError, undefined, textOf(r)); assert.equal(jsonOf(r).key, "DSK-43");
  const cr = calls.find((c) => c[0] === "desk.createRequest");
  assert.deepEqual(cr.slice(1), ["desk-sess-1", 3n, "Printer", "jams", [["where", "Office"]]]);
  // generic: describe + call with JSON args coerced to Candid (nat → BigInt), session prepended
  r = await client.callTool({ name: "kebab_describe", arguments: { app: "desk" } });
  assert.equal(jsonOf(r).methods.find(m => m.name === "myTickets").kind, "query");
  r = await client.callTool({ name: "kebab_call", arguments: { app: "desk", method: "setPriority", args: [42, "high"] } });
  assert.equal(r.isError, undefined, textOf(r)); assert.equal(jsonOf(r).ok, true);
  assert.deepEqual(calls.find((c) => c[0] === "desk.setPriority").slice(1), ["desk-sess-1", 42n, "high"]);
  r = await client.callTool({ name: "kebab_call", arguments: { app: "desk", method: "info", args: [], withSession: false } });
  assert.equal(jsonOf(r).orgName, "Acme");
  r = await client.callTool({ name: "kebab_call", arguments: { app: "desk", method: "nope", args: [] } });
  assert.equal(r.isError, true); assert.match(textOf(r), /no method "nope"/);
  r = await client.callTool({ name: "kebab_call", arguments: { app: "payroll", method: "x", args: [] } });
  assert.equal(r.isError, true); assert.match(textOf(r), /no app "payroll"/);
  // people
  r = await client.callTool({ name: "kebab_people", arguments: { query: "ben" } });
  assert.equal(jsonOf(r)[0].email, "ben@acme.com");
  // the hub switches assistants off → every tool fails in plain language, nothing hangs
  hubEnabled = false;
  r = await client.callTool({ name: "kebab_whoami", arguments: {} });
  assert.equal(r.isError, true); assert.match(textOf(r), /no longer accepts this assistant/);
  hubEnabled = true;
  await client.close();
});
