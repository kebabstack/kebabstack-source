#!/usr/bin/env python3
"""did2idl — turn a moc-generated .did into an agent-js idlFactory (plain JS).

    python3 sdk/tools/did2idl.py backend/backend.did > dist/idl.js

Covers what kebab-stack backends use: records, variants, vec, opt, tuples,
primitives, named types, query/oneway annotations. No generics, no
service-level init args.
"""
import re, sys

PRIM = {"text": "IDL.Text", "nat": "IDL.Nat", "int": "IDL.Int", "bool": "IDL.Bool", "blob": "IDL.Vec(IDL.Nat8)",
        "nat8": "IDL.Nat8", "nat16": "IDL.Nat16", "nat32": "IDL.Nat32", "nat64": "IDL.Nat64", "int8": "IDL.Int8",
        "int16": "IDL.Int16", "int32": "IDL.Int32", "int64": "IDL.Int64", "float64": "IDL.Float64", "float32": "IDL.Float32",
        "principal": "IDL.Principal", "null": "IDL.Null", "reserved": "IDL.Reserved", "empty": "IDL.Empty"}

class P:
    def __init__(s, t): s.t = t; s.i = 0
    def ws(s):
        while True:
            m = re.match(r'\s+|//[^\n]*', s.t[s.i:])
            if not m: break
            s.i += m.end()
    def peek(s, lit): s.ws(); return s.t.startswith(lit, s.i)
    def eat(s, lit):
        s.ws()
        if not s.t.startswith(lit, s.i): raise SyntaxError(f"expected {lit!r} at {s.t[s.i:s.i+40]!r}")
        s.i += len(lit)
    def ident(s):
        s.ws(); m = re.match(r'[A-Za-z_][A-Za-z0-9_]*|"[^"]*"|\d+', s.t[s.i:])
        if not m: raise SyntaxError(f"ident at {s.t[s.i:s.i+40]!r}")
        s.i += m.end(); return m.group(0).strip('"')
    def typ(s):
        s.ws()
        if s.peek("record"):
            s.eat("record"); s.eat("{"); fields = []
            while not s.peek("}"):
                save = s.i; name = s.ident()
                if s.peek(":"): s.eat(":"); fields.append((name, s.typ()))
                else: s.i = save; fields.append((None, s.typ()))
                if s.peek(";"): s.eat(";")
            s.eat("}")
            if fields and all(n is None for n, _ in fields):  # tuple
                return "IDL.Tuple(" + ", ".join(f for _, f in fields) + ")"
            return "IDL.Record({ " + ", ".join(f"{js(n)}: {t}" for n, t in fields) + " })"
        if s.peek("variant"):
            s.eat("variant"); s.eat("{"); fields = []
            while not s.peek("}"):
                name = s.ident()
                if s.peek(":"): s.eat(":"); fields.append((name, s.typ()))
                else: fields.append((name, "IDL.Null"))
                if s.peek(";"): s.eat(";")
            s.eat("}")
            return "IDL.Variant({ " + ", ".join(f"{js(n)}: {t}" for n, t in fields) + " })"
        if s.peek("vec"): s.eat("vec"); return f"IDL.Vec({s.typ()})"
        if s.peek("opt"): s.eat("opt"); return f"IDL.Opt({s.typ()})"
        if s.peek("func"):
            s.eat("func"); args, rets, ann = s.func_sig()
            annotations = "[" + ", ".join(repr(x) for x in ann) + "]"
            return f"IDL.Func([{', '.join(args)}], [{', '.join(rets)}], {annotations})"
        name = s.ident()
        if name in PRIM: return PRIM[name]
        return name  # named type (hoisted below)
    def func_sig(s):
        s.eat("("); args = []
        while not s.peek(")"):
            # optional "name:" label
            save = s.i; name = s.ident()
            if s.peek(":"): s.eat(":"); args.append(s.typ())
            else: s.i = save; args.append(s.typ())
            if s.peek(","): s.eat(",")
        s.eat(")"); s.eat("->"); s.eat("("); rets = []
        while not s.peek(")"):
            rets.append(s.typ())
            if s.peek(","): s.eat(",")
        s.eat(")"); ann = []
        while True:
            s.ws()
            m = re.match(r'(query|oneway|composite_query)', s.t[s.i:])
            if not m: break
            ann.append(m.group(1)); s.i += m.end()
        return args, rets, ann

def js(name):
    return name if re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', name) else repr(name)

def main(path):
    src = open(path).read()
    p = P(src); types = []; methods = []
    while True:
        p.ws()
        if p.i >= len(p.t): break
        if p.peek("type"):
            p.eat("type"); name = p.ident(); p.eat("="); types.append((name, p.typ())); p.eat(";")
        elif p.peek("service"):
            p.eat("service"); p.eat(":")
            if p.peek("("):  # init args
                depth = 0
                while True:
                    c = p.t[p.i]; p.i += 1
                    if c == "(": depth += 1
                    elif c == ")":
                        depth -= 1
                        if depth == 0: break
                p.eat("->")
            p.eat("{")
            while not p.peek("}"):
                name = p.ident(); p.eat(":"); args, rets, ann = p.func_sig()
                methods.append((name, args, rets, ann))
                if p.peek(";"): p.eat(";")
            p.eat("}")
            if p.peek(";"): p.eat(";")
        else:
            raise SyntaxError(f"unexpected at {p.t[p.i:p.i+40]!r}")
    # emit named types in dependency order (JS const has no hoisting)
    names = {n for n, _ in types}; byname = dict(types); done = []; seen = set()
    def visit(n):
        if n in seen: return
        seen.add(n)
        # only bare identifiers count as references: not `IDL.Record` (a .did type may be called Record), not field keys (`terms:`)
        for dep in re.findall(r'(?<![.\w])([A-Za-z_][A-Za-z0-9_]*)(?!\s*:)', byname[n]):
            if dep in names and dep != n: visit(dep)
        done.append(n)
    for n, _ in types: visit(n)
    out = ["// generated by sdk/tools/did2idl.py from backend.did — do not edit by hand", "export const idlFactory = ({ IDL }) => {"]
    for name in done: out.append(f"  const {name} = {byname[name]};")
    out.append("  return IDL.Service({")
    for name, args, rets, ann in sorted(methods):
        a = "[" + ", ".join(f'"{x}"' for x in ann) + "]"
        out.append(f"    {js(name)}: IDL.Func([{', '.join(args)}], [{', '.join(rets)}], {a}),")
    out.append("  });"); out.append("};")
    print("\n".join(out))

if __name__ == "__main__":
    main(sys.argv[1])
