#!/usr/bin/env python3
"""Synchronize committed Candid/browser bindings from successful local builds.
Stable .most baselines are deliberately untouched. --check reports drift only.
"""
import pathlib, re, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
check='--check' in sys.argv
bad=[]
def put(path,data):
    if path.exists() and path.read_text()==data:return
    if check:bad.append(str(path.relative_to(ROOT)))
    else:path.write_text(data)
modules = ['hub','desk','assets','watch','crumbs','trust','forms','bug','contracts','vault','kitchen']
selected = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
if any(module not in modules for module in selected): sys.exit('Unknown module')
for module in selected or modules:
    built=ROOT/module/'backend/dist/backend.did'
    if not built.exists():sys.exit(f'build {module} first')
    put(ROOT/module/'backend/backend.did','\n'.join(line.rstrip() for line in built.read_text().splitlines())+'\n')
    generated=subprocess.check_output(['python3',str(ROOT/'sdk/tools/did2idl.py'),str(built)],text=True)
    if module in ['desk','assets','watch','crumbs','trust','forms','bug','contracts']:put(ROOT/module/'dist/idl.js',generated)
    elif module in ['hub','kitchen']:
        name='idlFactory' if module=='hub' else 'idl'
        replacement=generated[generated.index('export const'):].replace('export const idlFactory',f'const {name}',1).strip()
        path=ROOT/module/'dist/index.html';data=path.read_text()
        data,n=re.subn(r'const '+name+r' = \(\{ IDL \}\) => \{.*?\n\};',lambda _:replacement,data,count=1,flags=re.S)
        if n!=1:sys.exit(f'cannot find {module} inline binding')
        put(path,data)
        if module=='kitchen':
            path=ROOT/'hub/dist/index.html';data=path.read_text()
            replacement=generated[generated.index('export const'):].replace('export const idlFactory','const kitchenIdlFactory',1).strip()
            data,n=re.subn(r'const kitchenIdlFactory = \(\{ IDL \}\) => \{.*?\n\};',lambda _:replacement,data,count=1,flags=re.S)
            if n!=1:sys.exit('cannot find Hub installer binding')
            put(path,data)
if bad:sys.exit('Generated bindings drift: '+', '.join(bad))
print('Bindings in step' if check else 'Candid and browser bindings synchronized; stable baselines preserved')
