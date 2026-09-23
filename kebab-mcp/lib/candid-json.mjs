// JSON <-> Candid, guided by the method's IDL types (from the app's idl.js).
// The assistant speaks JSON; canisters speak Candid. Conventions:
//   nat/int/nat64…  ← number or numeric string           → number (or string when it does not fit)
//   opt T           ← null / undefined / the value / [v]  → the value or null
//   vec nat8 (blob) ← base64 string or array of bytes    → "<N bytes, base64:…>" (short blobs inline)
//   record          ← object                             → object
//   variant         ← "tag" | { tag: value } | { tag: null } → { tag: value }
//   tuple           ← array                              → array
//   principal       ← text                               → text
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";

class ToCandid extends IDL.Visitor {
  visitType(t, v) { return v; }
  visitBool(t, v) { if (typeof v === "string") return v === "true"; return !!v; }
  visitNull() { return null; }
  visitReserved() { return null; }
  visitText(t, v) { return v == null ? "" : String(v); }
  visitInt(t, v) { return BigInt(typeof v === "number" ? Math.trunc(v) : v); }
  visitNat(t, v) { return BigInt(typeof v === "number" ? Math.trunc(v) : v); }
  visitFloat(t, v) { return Number(v); }
  visitFixedInt(t, v) { return t._bits > 32 ? BigInt(typeof v === "number" ? Math.trunc(v) : v) : Number(v); }
  visitFixedNat(t, v) { return t._bits > 32 ? BigInt(typeof v === "number" ? Math.trunc(v) : v) : Number(v); }
  visitPrincipal(t, v) { return typeof v === "string" ? Principal.fromText(v) : v; }
  visitVec(t, ty, v) {
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) { // blob
      if (typeof v === "string") return Uint8Array.from(Buffer.from(v, "base64"));
      return Uint8Array.from(v || []);
    }
    if (!Array.isArray(v)) throw new Error(`expected an array for ${t.display()}`);
    return v.map((x) => ty.accept(this, x));
  }
  visitOpt(t, ty, v) {
    if (v === null || v === undefined) return [];
    if (Array.isArray(v) && (v.length === 0 || (v.length === 1 && !(ty instanceof IDL.VecClass) && !(ty instanceof IDL.TupleClass)))) return v.length ? [ty.accept(this, v[0])] : [];
    return [ty.accept(this, v)];
  }
  visitRecord(t, fields, v) {
    if (v === null || typeof v !== "object") throw new Error(`expected an object for ${t.display()}`);
    const out = {};
    for (const [k, ty] of fields) out[k] = ty.accept(this, v[k]);
    return out;
  }
  visitTuple(t, comps, v) {
    if (!Array.isArray(v)) throw new Error(`expected an array for ${t.display()}`);
    return comps.map((ty, i) => ty.accept(this, v[i]));
  }
  visitVariant(t, fields, v) {
    let tag, val;
    if (typeof v === "string") { tag = v; val = null; } else if (v && typeof v === "object") { const ks = Object.keys(v); if (ks.length !== 1) throw new Error(`variant needs exactly one tag, got ${ks.join(",")}`); tag = ks[0]; val = v[tag]; } else throw new Error(`expected a variant for ${t.display()}`);
    const f = fields.find(([k]) => k === tag);
    if (!f) throw new Error(`unknown variant tag "${tag}" (one of ${fields.map(([k]) => k).join(", ")})`);
    return { [tag]: f[1].accept(this, val) };
  }
  visitRec(t, ty, v) { return ty.accept(this, v); }
  visitFunc(t, v) { return v; }
  visitService(t, v) { return v; }
}
const toCandidVisitor = new ToCandid();
export function toCandid(type, json) { return type.accept(toCandidVisitor, json); }
export function argsToCandid(func, args) {
  if (!Array.isArray(args)) throw new Error("args must be a JSON array, one entry per Candid argument");
  if (args.length !== func.argTypes.length) throw new Error(`method takes ${func.argTypes.length} argument(s), got ${args.length}`);
  return func.argTypes.map((t, i) => toCandid(t, args[i]));
}

/** Candid → JSON: BigInt → number when safe (else string), Principal → text, blobs → a short note, opt → value|null. */
export function fromCandid(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") {
    // canister timestamps are nanoseconds since 1970 — between 2017 and 2033 they fall in this band; hand the model an ISO time instead of 19 digits
    if (v >= 1_500_000_000_000_000_000n && v <= 2_000_000_000_000_000_000n) return new Date(Number(v / 1_000_000n)).toISOString();
    return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  }
  if (v instanceof Uint8Array || (typeof v === "object" && v && v.constructor && v.constructor.name === "Uint8Array")) return v.length <= 64 ? { bytes: v.length, base64: Buffer.from(v).toString("base64") } : { bytes: v.length };
  if (typeof v === "object" && v && typeof v.toText === "function" && v._arr) return v.toText();
  if (Array.isArray(v)) return v.map(fromCandid);
  if (typeof v === "object") { const out = {}; for (const [k, x] of Object.entries(v)) out[k] = fromCandid(x); return out; }
  return v;
}
/** opt-aware: a Candid `opt T` arrives as [] or [v]; when the result type is known, unwrap it. */
export function unwrapOpt(v) { return Array.isArray(v) && v.length <= 1 ? (v.length ? v[0] : null) : v; }
