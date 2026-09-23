// JSON <-> Candid, guided by parsed live Candid types; never silently repair a write.
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

function integer(v, unsigned = false, bits = 0) {
  if (!(typeof v === "bigint" || (typeof v === "number" && Number.isSafeInteger(v)) || (typeof v === "string" && /^-?\d+$/.test(v) && v.length <= 4096))) throw new Error("expected an exact integer; use a decimal string for large values");
  const n = BigInt(v);
  if (unsigned && n < 0n) throw new Error("expected a non-negative integer");
  if (bits && (n < (unsigned ? 0n : -(1n << BigInt(bits - 1))) || n >= (1n << BigInt(unsigned ? bits : bits - 1)))) throw new Error(`integer is outside the ${bits}-bit range`);
  return n;
}
function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
class ToCandid extends IDL.Visitor {
  visitType(t, v) { throw new Error("unsupported input type"); }
  visitBool(t, v) { if (typeof v === "boolean") return v; if (v === "true" || v === "false") return v === "true"; throw new Error("expected true or false"); }
  visitNull(t, v) { if (v !== null) throw new Error("expected null"); return null; }
  visitReserved() { return null; }
  visitText(t, v) { if (typeof v !== "string") throw new Error("expected text"); return v; }
  visitInt(t, v) { return integer(v); }
  visitNat(t, v) { return integer(v, true); }
  visitFloat(t, v) { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("expected a finite number"); return v; }
  visitFixedInt(t, v) { const n = integer(v, false, t._bits); return t._bits > 32 ? n : Number(n); }
  visitFixedNat(t, v) { const n = integer(v, true, t._bits); return t._bits > 32 ? n : Number(n); }
  visitPrincipal(t, v) { return typeof v === "string" ? Principal.fromText(v) : v; }
  visitVec(t, ty, v) {
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) { // blob
      if (typeof v === "string") {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v)) throw new Error("expected padded base64");
        return Uint8Array.from(Buffer.from(v, "base64"));
      }
      if (!Array.isArray(v) && !(v instanceof Uint8Array)) throw new Error("expected bytes or base64");
      return Uint8Array.from(v, x => Number(integer(x, true, 8)));
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
    if (!object(v)) throw new Error("expected a record object");
    const keys = new Set(fields.map(([k]) => k));
    if (Object.keys(v).some(k => !keys.has(k))) throw new Error("record contains unknown fields; inspect the method interface");
    const out = {};
    for (const [k, ty] of fields) { try { Object.defineProperty(out, k, { value: ty.accept(this, Object.hasOwn(v, k) ? v[k] : undefined), enumerable: true }); } catch (e) { throw new Error(`field ${k}: ${e.message}`); } }
    return out;
  }
  visitTuple(t, comps, v) {
    if (!Array.isArray(v)) throw new Error(`expected an array for ${t.display()}`);
    if (v.length !== comps.length) throw new Error(`tuple needs ${comps.length} entries`);
    return comps.map((ty, i) => ty.accept(this, v[i]));
  }
  visitVariant(t, fields, v) {
    let tag, val;
    if (typeof v === "string") { tag = v; val = null; } else if (object(v)) { const ks = Object.keys(v); if (ks.length !== 1) throw new Error(`variant needs exactly one tag, got ${ks.join(",")}`); tag = ks[0]; val = v[tag]; } else throw new Error(`expected a variant for ${t.display()}`);
    const f = fields.find(([k]) => k === tag);
    if (!f) throw new Error(`unknown variant tag "${tag}" (one of ${fields.map(([k]) => k).join(", ")})`);
    return { [tag]: f[1].accept(this, val) };
  }
  visitRec(t, ty, v) { return ty.accept(this, v); }
  visitFunc(t, v) { return v; }
  visitService(t, v) { return v; }
}
const toCandidVisitor = new ToCandid();
export function toCandid(type, json) {
  // JSON from an assistant must not exhaust the process through recursive values.
  let nodes = 0;
  const check = (v, depth) => { if (++nodes > 100000 || depth > 64) throw new Error("input exceeds the size/depth limit"); if (v && typeof v === "object") for (const x of Object.values(v)) check(x, depth + 1); };
  check(json, 0);
  return type.accept(toCandidVisitor, json);
}
export function argsToCandid(func, args) {
  if (!Array.isArray(args)) throw new Error("args must be a JSON array, one entry per Candid argument");
  if (args.length !== func.argTypes.length) throw new Error(`method takes ${func.argTypes.length} argument(s), got ${args.length}`);
  return func.argTypes.map((t, i) => { try { return toCandid(t, args[i]); } catch (e) { throw new Error(`argument ${i + 1}: ${e.message}`); } });
}

/** Candid → JSON: BigInt → number when safe (else string), Principal → text, blobs → a short note, opt → value|null. */
export function fromCandid(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") {
    return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  }
  if (v instanceof Uint8Array || (typeof v === "object" && v && v.constructor && v.constructor.name === "Uint8Array")) return v.length <= 64 ? { bytes: v.length, base64: Buffer.from(v).toString("base64") } : { bytes: v.length };
  if (typeof v === "object" && v && typeof v.toText === "function" && v._arr) return v.toText();
  if (Array.isArray(v)) return v.map(fromCandid);
  if (typeof v === "object") { const out = {}; for (const [k, x] of Object.entries(v)) Object.defineProperty(out, k, { value: fromCandid(x), enumerable: true }); return out; }
  return v;
}
/** opt-aware: a Candid `opt T` arrives as [] or [v]; when the result type is known, unwrap it. */
export function unwrapOpt(v) { return Array.isArray(v) && v.length <= 1 ? (v.length ? v[0] : null) : v; }
