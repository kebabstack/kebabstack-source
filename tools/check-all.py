#!/usr/bin/env python3
"""Local-only release checks. Never deploys or changes controller settings."""
from pathlib import Path
import os, subprocess
ROOT=Path(__file__).resolve().parents[1]
ENV={**os.environ,'PATH':str(ROOT/'node_modules/.bin')+os.pathsep+os.environ.get('PATH',''),'NODE_PATH':str(ROOT/'node_modules')}
def run(args,cwd=ROOT):subprocess.run(args,cwd=cwd,env=ENV,check=True)
run(['node','design/logos/sync.mjs','--check'])
run(['npm','run','design:check'])
run(['npm','run','runtime:check'])
for module in ['hub','desk','assets','watch','crumbs','trust','forms','bug','contracts','vault','kitchen','sdk/example']:
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
for module in ['hub','desk','assets','watch','crumbs','trust','forms','bug','contracts']:run(['bash',module+'/test/run-smoke.sh'])
print('Checking the Crumbs collector and tracker',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'crumbs/collector')
run(['node','crumbs/tools/api-docs.mjs','--check'])
run(['npm','test'],ROOT/'crumbs')
print('Checking the contracts relay (node --test)',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'contracts/relay')
run(['npm','test'],ROOT/'contracts/relay')
run(['icp','build','frontend'],ROOT/'hub')
run(['node','--test','--test-concurrency=1','tests/json-safety.test.mjs','tests/crumbs.test.mjs','tests/security.test.mjs','tests/operations.test.mjs','tests/displays.test.mjs','tests/openteam.test.mjs','tests/finance.test.mjs','tests/permissions.test.mjs','tests/lifecycle.test.mjs','tests/hardware-offboarding.test.mjs','tests/trust-workspace.test.mjs','tests/customer-support.test.mjs','tests/oncall.test.mjs','tests/oncall-response.test.mjs','tests/oncall-reporting.test.mjs','tests/oncall-compensation.test.mjs','tests/oncall-calendar-status.test.mjs','tests/oncall-regional-reminders.test.mjs','tests/oncall-alerts.test.mjs','tests/kitchen-ui.test.mjs','tests/releases.test.mjs','tests/release-publisher.test.mjs'])
print('Checking kebab-mcp (the assistant server)',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'kebab-mcp');run(['npm','test'],ROOT/'kebab-mcp')
run(['python3','-m','unittest','discover','-s','tests','-p','test_*.py'])
print('Checking the static product website',flush=True)
run(['npm','ci','--ignore-scripts'],ROOT/'website')
run(['npm','run','build'],ROOT/'website')
run(['npm','test'],ROOT/'website')
print('All local release checks passed',flush=True)
