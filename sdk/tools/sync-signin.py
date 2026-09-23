#!/usr/bin/env python3
"""Synchronize shared app sign-in markup, styling and the browser SDK. No deployment."""
from pathlib import Path
import argparse
ROOT=Path(__file__).resolve().parents[2]
args=argparse.ArgumentParser();args.add_argument('--check',action='store_true');check=args.parse_args().check
apps=['assets','contracts','desk','forms','trust','watch','crumbs']
problems=[]
def sync(path,data):
 if check:
  if not path.exists() or path.read_bytes()!=data:problems.append(str(path.relative_to(ROOT)))
 else:path.write_bytes(data)
for app in apps:
 sync(ROOT/app/'dist/signin.css',(ROOT/'hub/dist/signin.css').read_bytes())
 target=ROOT/app/'dist/index.html';html=target.read_text();start=html.index('<section id="login"');end=html.index('</section>\n  </div>\n</section>',start)+len('</section>\n  </div>\n</section>')
 markup=(ROOT/'sdk/ui/signin.html').read_text().strip().replace('__APP_NAME__',app.title())
 updated=html[:start]+markup+html[end:]
 if check:
  if html!=updated:problems.append(app+'/dist/index.html sign-in markup')
 else:target.write_text(updated)
for app in [*apps,'bug','bug2d']:
 sync(ROOT/app/'dist/hub-client.js',(ROOT/'sdk/js/hub-client.js').read_bytes())
if problems:raise SystemExit('Stale sign-in copies: '+', '.join(problems))
print('Shared sign-in markup, styles and SDK copies '+('verified' if check else 'synchronized'))
