// A small Candid (.did) parser that builds agent-js IDL types directly — no generated code, nothing to execute.
// Since 0.2.0 this replaces importing `<app url>/idl.js` (remote JavaScript run inside this process, audit MC-01):
// the interface comes from the canister's own `candid:service` metadata via the IC API instead.
//
// Covers what kebab-stack backends emit (moc): type definitions, records, variants, tuples, vec, opt, blob, func,
// primitives, named (also recursive) types, service with optional init args, query/oneway/composite_query
// annotations, `//` and `///` comments, quoted identifiers.
import { IDL } from "@dfinity/candid";

const PRIM = {
  text: () => IDL.Text, nat: () => IDL.Nat, int: () => IDL.Int, bool: () => IDL.Bool, blob: () => IDL.Vec(IDL.Nat8),
  nat8: () => IDL.Nat8, nat16: () => IDL.Nat16, nat32: () => IDL.Nat32, nat64: () => IDL.Nat64,
  int8: () => IDL.Int8, int16: () => IDL.Int16, int32: () => IDL.Int32, int64: () => IDL.Int64,
  float32: () => IDL.Float32, float64: () => IDL.Float64, principal: () => IDL.Principal,
  null: () => IDL.Null, reserved: () => IDL.Reserved, empty: () => IDL.Empty,
};

class Parser {
  constructor(text) { this.t = text; this.i = 0; }
  ws() { for (;;) { const m = /^(\s+|\/\/[^\n]*)/.exec(this.t.slice(this.i)); if (!m) break; this.i += m[0].length; } }
  peek(lit) { this.ws(); return this.t.startsWith(lit, this.i); }
  peekWord(w) { this.ws(); return new RegExp("^" + w + "(?![A-Za-z0-9_])").test(this.t.slice(this.i)); }
  eat(lit) { this.ws(); if (!this.t.startsWith(lit, this.i)) throw new SyntaxError(`expected ${JSON.stringify(lit)} at ${JSON.stringify(this.t.slice(this.i, this.i + 40))}`); this.i += lit.length; }
  ident() {
    this.ws();
    const m = /^([A-Za-z_][A-Za-z0-9_]*|"(?:[^"\\]|\\.)*"|\d+)/.exec(this.t.slice(this.i));
    if (!m) throw new SyntaxError(`identifier expected at ${JSON.stringify(this.t.slice(this.i, this.i + 40))}`);
    this.i += m[0].length;
    return m[0].startsWith('"') ? JSON.parse(m[0]) : m[0];
  }
  // ---- AST: { k: "prim"|"named"|"record"|"tuple"|"variant"|"vec"|"opt"|"func", ... }
  typ() {
    if (this.peekWord("record")) {
      this.eat("record"); this.eat("{"); const fields = [];
      while (!this.peek("}")) {
        const save = this.i; const name = this.ident();
        if (this.peek(":")) { this.eat(":"); fields.push([name, this.typ()]); } else { this.i = save; fields.push([null, this.typ()]); }
        if (this.peek(";")) this.eat(";");
      }
      this.eat("}");
      if (fields.length && fields.every(([n]) => n === null || /^\d+$/.test(n))) return { k: "tuple", items: fields.map(([, t]) => t) };
      return { k: "record", fields };
    }
    if (this.peekWord("variant")) {
      this.eat("variant"); this.eat("{"); const fields = [];
      while (!this.peek("}")) {
        const name = this.ident();
        if (this.peek(":")) { this.eat(":"); fields.push([name, this.typ()]); } else fields.push([name, { k: "prim", name: "null" }]);
        if (this.peek(";")) this.eat(";");
      }
      this.eat("}");
      return { k: "variant", fields };
    }
    if (this.peekWord("vec")) { this.eat("vec"); return { k: "vec", of: this.typ() }; }
    if (this.peekWord("opt")) { this.eat("opt"); return { k: "opt", of: this.typ() }; }
    if (this.peekWord("func")) { this.eat("func"); return { k: "func", ...this.funcSig() }; }
    if (this.peekWord("service")) { this.eat("service"); this.eat(":"); this.serviceBody(); return { k: "prim", name: "principal" }; }
    const name = this.ident();
    if (PRIM[name]) return { k: "prim", name };
    return { k: "named", name };
  }
  funcSig() {
    this.eat("("); const args = [];
    while (!this.peek(")")) {
      const save = this.i; this.ident();
      if (this.peek(":")) { this.eat(":"); args.push(this.typ()); } else { this.i = save; args.push(this.typ()); }
      if (this.peek(",")) this.eat(",");
    }
    this.eat(")"); this.eat("->"); this.eat("("); const rets = [];
    while (!this.peek(")")) {
      const save = this.i; this.ident();
      if (this.peek(":")) { this.eat(":"); rets.push(this.typ()); } else { this.i = save; rets.push(this.typ()); }
      if (this.peek(",")) this.eat(",");
    }
    this.eat(")"); const ann = [];
    for (;;) { this.ws(); const m = /^(query|oneway|composite_query)(?![A-Za-z0-9_])/.exec(this.t.slice(this.i)); if (!m) break; ann.push(m[1]); this.i += m[0].length; }
    return { args, rets, ann };
  }
  serviceBody() {
    if (this.peek("(")) { let depth = 0; for (;;) { const c = this.t[this.i++]; if (c === undefined) throw new SyntaxError("unterminated init args"); if (c === "(") depth++; else if (c === ")" && --depth === 0) break; } this.eat("->"); }
    this.eat("{"); const methods = [];
    while (!this.peek("}")) {
      const name = this.ident(); this.eat(":");
      if (this.peekWord("func")) this.eat("func");
      methods.push([name, this.funcSig()]);
      if (this.peek(";")) this.eat(";");
    }
    this.eat("}");
    return methods;
  }
}

/** Parse a .did text. Returns { types: Map<name, AST>, methods: [[name, {args, rets, ann}]] }. */
export function parseDidAst(text) {
  const p = new Parser(String(text)); const types = new Map(); let methods = null;
  for (;;) {
    p.ws(); if (p.i >= p.t.length) break;
    if (p.peekWord("type")) { p.eat("type"); const name = p.ident(); p.eat("="); types.set(name, p.typ()); p.eat(";"); }
    else if (p.peekWord("service")) { p.eat("service"); if (p.peek(":")) p.eat(":"); methods = p.serviceBody(); if (p.peek(";")) p.eat(";"); }
    else throw new SyntaxError(`unexpected at ${JSON.stringify(p.t.slice(p.i, p.i + 40))}`);
  }
  if (!methods) throw new SyntaxError("no service in this .did");
  return { types, methods };
}

/** Build IDL types from the AST. Named types are inlined (like the generated idl.js); a genuinely recursive type becomes IDL.Rec. */
export function buildService(ast) {
  const built = new Map(); const visiting = new Map(); // name -> IDL.Rec while under construction
  const build = (t) => {
    switch (t.k) {
      case "prim": return PRIM[t.name]();
      case "vec": return IDL.Vec(build(t.of));
      case "opt": return IDL.Opt(build(t.of));
      case "tuple": return IDL.Tuple(...t.items.map(build));
      case "record": return IDL.Record(Object.fromEntries(t.fields.map(([n, f]) => [n, build(f)])));
      case "variant": return IDL.Variant(Object.fromEntries(t.fields.map(([n, f]) => [n, build(f)])));
      case "func": return IDL.Func(t.args.map(build), t.rets.map(build), t.ann);
      case "named": {
        if (built.has(t.name)) return built.get(t.name);
        if (visiting.has(t.name)) return visiting.get(t.name); // recursion → the Rec placeholder
        const def = ast.types.get(t.name);
        if (!def) throw new SyntaxError(`unknown type ${t.name}`);
        const rec = IDL.Rec(); visiting.set(t.name, rec);
        const inner = build(def);
        visiting.delete(t.name);
        // was the placeholder used? then keep the Rec (filled), else inline
        let out = inner;
        if (recUsed(inner, rec)) { rec.fill(inner); out = rec; }
        built.set(t.name, out);
        return out;
      }
      default: throw new SyntaxError(`unsupported type kind ${t.k}`);
    }
  };
  const fields = Object.fromEntries(ast.methods.map(([name, sig]) => [name, IDL.Func(sig.args.map(build), sig.rets.map(build), sig.ann)]));
  return IDL.Service(fields);
}
// does `type` reference `rec` anywhere? (only then the type is recursive)
function recUsed(type, rec, seen = new Set()) {
  if (type === rec) return true;
  if (!type || seen.has(type)) return false; seen.add(type);
  const kids = [];
  if (type instanceof IDL.VecClass || type instanceof IDL.OptClass) kids.push(type._type);
  else if (type instanceof IDL.RecordClass || type instanceof IDL.VariantClass) kids.push(...type._fields.map(([, t]) => t));
  else if (type instanceof IDL.FuncClass) kids.push(...type.argTypes, ...type.retTypes);
  else if (type instanceof IDL.RecClass) kids.push(type._type);
  return kids.some((k) => recUsed(k, rec, seen));
}

/** .did text → agent-js idlFactory (what Actor.createActor takes). */
export function didToIdlFactory(text) {
  const ast = parseDidAst(text);
  const service = buildService(ast);
  return () => service;
}
