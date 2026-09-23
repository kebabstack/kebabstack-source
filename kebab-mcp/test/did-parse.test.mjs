// The .did parser must yield exactly the types the generated bindings (sdk/tools/did2idl.py) yield — checked against
// every committed backend.did of the suite, method by method via IDL.display().
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IDL } from "@dfinity/candid";
import { parseDidAst, buildService, didToIdlFactory } from "../lib/did-parse.mjs";

const ROOT = process.env.KEBAB_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."); // the monorepo (CI); KEBAB_ROOT for a checkout elsewhere
const apps = ["desk", "assets", "watch", "trust", "forms", "bug", "contracts"];

test("parses every backend.did of the suite and matches the generated idl.js of the seven apps", async () => {
  for (const m of [...apps, "hub", "kitchen", "vault"]) {
    const did = fs.readFileSync(path.join(ROOT, m, "backend", "backend.did"), "utf8");
    const svc = buildService(parseDidAst(did));
    assert.ok(svc._fields.length > 3, `${m}: methods parsed`);
    if (!apps.includes(m)) continue;
    const mod = await import(path.join(ROOT, m, "dist", "idl.js"));
    const ref = mod.idlFactory({ IDL });
    const mine = Object.fromEntries(svc._fields);
    for (const [name, f] of ref._fields) {
      assert.ok(mine[name], `${m}.${name} missing`);
      assert.equal(mine[name].display(), f.display(), `${m}.${name} differs`);
    }
    assert.equal(svc._fields.length, ref._fields.length, `${m}: method count`);
  }
});
test("doc comments, init args, quoted names and recursive types", () => {
  const did = `
    /// a documented type
    type Node = record { "odd name" : text; kids : vec Node; when : opt int };
    type Pair = record { text; nat };
    service : (text) -> {
      /// the person's own tickets
      get : (tok : text, id : nat) -> (opt Node) query;
      put : (Pair) -> (record { ok : bool; detail : text });
      fire : (text) -> () oneway;
    };`;
  const svc = buildService(parseDidAst(did));
  const f = Object.fromEntries(svc._fields);
  assert.deepEqual(Object.keys(f).sort(), ["fire", "get", "put"]);
  assert.deepEqual(f.get.annotations, ["query"]); assert.deepEqual(f.fire.annotations, ["oneway"]);
  assert.ok(f.get.retTypes[0] instanceof IDL.OptClass);
  const node = f.get.retTypes[0]._type; assert.ok(node instanceof IDL.RecClass, "recursive type becomes Rec");
  assert.ok(f.put.argTypes[0] instanceof IDL.TupleClass, "unnamed record fields = tuple");
  // encode/decode round trip through the recursive type
  const bytes = IDL.encode([f.get.retTypes[0]], [[{ "odd name": "a", kids: [{ "odd name": "b", kids: [], when: [] }], when: [3n] }]]);
  const [back] = IDL.decode([f.get.retTypes[0]], bytes);
  assert.equal(back[0].kids[0]["odd name"], "b");
  assert.equal(typeof didToIdlFactory(did), "function");
});
