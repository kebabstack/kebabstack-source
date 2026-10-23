#!/usr/bin/env python3
"""Local-only release checks. Never deploys or changes controller settings."""
from pathlib import Path
import os, subprocess
ROOT=Path(__file__).resolve().parents[1]
ENV={**os.environ,'PATH':str(ROOT/'node_modules/.bin')+os.pathsep+os.environ.get('PATH',''),'NODE_PATH':str(ROOT/'node_modules')}
def run(args,cwd=ROOT):subprocess.run(args,cwd=cwd,env=ENV,check=True)
run(['npm','ci','--ignore-scripts'],ROOT/'knowledge')
run(['npm','run','build'],ROOT/'knowledge')
run(['node','design/logos/sync.mjs','--check'])
run(['npm','run','design:check'])
run(['npm','run','runtime:check'])
for module in ['knowledge','hub','desk','assets','watch','crumbs','trust','forms','bug','contracts','vault','kitchen','sdk/example']:
    cwd=ROOT/module
    print(f'Checking/building {module}',flush=True)
    run(['mops','install','--locked'],cwd);run(['mops','check'],cwd);run(['mops','build'],cwd)
    moc=subprocess.check_output(['mops','toolchain','bin','moc'],cwd=cwd,env=ENV,text=True).strip()
    if (cwd/'backend/backend.most').exists():run([moc,'--stable-compatible','backend/backend.most','backend/dist/backend.most'],cwd)
    ENV['PATH']=str(Path(moc).parent)+os.pathsep+ENV['PATH']
run(['python3','tools/sync-bindings.py','--check'])
run(['python3','tools/check-release.py','--placeholders-from-index']) # the working clone may carry live ids in tracked frontends; the index (= what gets committed) must hold the placeholders
run(['python3','sdk/tools/check-sdk.py'])
print('Installing pinned game dependencies for frontend checks',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'bug')
for module in ['knowledge','hub','desk','assets','watch','crumbs','trust','forms','bug','contracts']:run(['bash',module+'/test/run-smoke.sh'])
print('Checking the Crumbs collector and tracker',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'crumbs/collector')
run(['node','crumbs/tools/api-docs.mjs','--check'])
run(['npm','test'],ROOT/'crumbs')
# Contracts removed its mail relay in 0.14.0. Browser PDF/intake checks run in its frontend smoke.
run(['icp','build','frontend'],ROOT/'hub')
# Discover regression files so new module tests cannot be omitted from a stale hand-written list.
run(['node','--test','--test-concurrency=1', *[str(path.relative_to(ROOT)) for path in sorted((ROOT/'tests').glob('*.test.mjs'))]])
print('Checking the independently deployed product website',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'website')
run(['npm','run','build'],ROOT/'website')
run(['npm','test'],ROOT/'website')
print('Checking kebab-mcp (the assistant server)',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'kebab-mcp');run(['npm','test'],ROOT/'kebab-mcp')
run(['python3','-m','unittest','discover','-s','tests','-p','test_*.py'])
print('All local release checks passed',flush=True)
