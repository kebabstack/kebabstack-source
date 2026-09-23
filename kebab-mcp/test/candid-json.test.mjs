import { test } from "node:test";
import assert from "node:assert/strict";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { argsToCandid, toCandid, fromCandid } from "../lib/candid-json.mjs";

test("scalars: numbers become BigInt for nat/int, strings stay, bools coerce", () => {
  assert.equal(toCandid(IDL.Nat, 42), 42n);
  assert.equal(toCandid(IDL.Int, "-7"), -7n);
  assert.equal(toCandid(IDL.Nat64, 5), 5n);
  assert.equal(toCandid(IDL.Nat8, 200), 200);
  assert.equal(toCandid(IDL.Text, "x"), "x");
  assert.equal(toCandid(IDL.Bool, "true"), true);
  assert.equal(toCandid(IDL.Principal, "aaaaa-aa").toText(), "aaaaa-aa");
});
test("opt: null → [], value → [value], [value] → [value]", () => {
  assert.deepEqual(toCandid(IDL.Opt(IDL.Nat), null), []);
  assert.deepEqual(toCandid(IDL.Opt(IDL.Nat), 3), [3n]);
  assert.deepEqual(toCandid(IDL.Opt(IDL.Nat), [3]), [3n]);
  assert.deepEqual(toCandid(IDL.Opt(IDL.Text), "a"), ["a"]);
});
test("records, tuples, variants, vecs, blobs", () => {
  const T = IDL.Record({ view: IDL.Text, n: IDL.Nat, tags: IDL.Vec(IDL.Text), when: IDL.Opt(IDL.Int), status: IDL.Variant({ open: IDL.Null, closed: IDL.Null }), pair: IDL.Tuple(IDL.Text, IDL.Text) });
  const v = toCandid(T, { view: "open", n: 1, tags: ["a"], when: null, status: "open", pair: ["k", "v"] });
  assert.deepEqual(v, { view: "open", n: 1n, tags: ["a"], when: [], status: { open: null }, pair: ["k", "v"] });
  assert.deepEqual(toCandid(IDL.Variant({ received: IDL.Null, rated: IDL.Nat }), { rated: 4 }), { rated: 4n });
  assert.throws(() => toCandid(IDL.Variant({ a: IDL.Null }), "b"), /unknown variant tag/);
  const blob = toCandid(IDL.Vec(IDL.Nat8), Buffer.from("hi").toString("base64"));
  assert.deepEqual([...blob], [104, 105]);
});
test("argsToCandid checks arity and maps every argument", () => {
  const f = IDL.Func([IDL.Text, IDL.Nat, IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], [IDL.Bool], []);
  assert.deepEqual(argsToCandid(f, ["tok", 7, [["k", "v"]]]), ["tok", 7n, [["k", "v"]]]);
  assert.throws(() => argsToCandid(f, ["tok"]), /takes 3 argument/);
});
test("fromCandid: BigInt → number, Principal → text, opt arrays stay arrays, blobs summarised", () => {
  const out = fromCandid({ id: 42n, big: 2n ** 70n, who: Principal.fromText("aaaaa-aa"), maybe: [], some: [1n], data: new Uint8Array(3) });
  assert.equal(out.id, 42); assert.equal(typeof out.big, "string"); assert.equal(out.who, "aaaaa-aa");
  assert.deepEqual(out.maybe, []); assert.deepEqual(out.some, [1]); assert.equal(out.data.bytes, 3);
});
