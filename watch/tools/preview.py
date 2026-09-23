#!/usr/bin/env python3
"""Serve a synthetic Watch review locally; never connects to a production backend."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=4195)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='watch-review-') as temporary:
    destination = Path(temporary)
    for source in (root / 'dist').iterdir():
        if source.is_file():
            shutil.copy2(source, destination / source.name)
    shutil.copy2(root / 'test/fixture.js', destination / 'fixture.js')
    shutil.copy2(root / 'test/agent-bundle.stub.js', destination / 'agent-bundle.js')
    index = destination / 'index.html'
    index.write_text(index.read_text().replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./preview.js"></script>').replace('<title>kebab-stack · watch</title>', '<title>Watch · Design preview</title>'))
    (destination / 'preview.js').write_text("""globalThis.__watchRole=new URLSearchParams(location.search).get('as')||'admin';
globalThis.__watchPreview=true;
await import('./fixture.js');
localStorage.setItem('ks-watch-session','preview');localStorage.setItem('ks-watch-session-suite','preview');
await import('./app.js');
""")
    print(f'Watch review (synthetic data): http://127.0.0.1:{args.port}/?review=watch-090#/overview', flush=True)
    print('Use ?as=viewer to review read-only access.', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), partial(SimpleHTTPRequestHandler, directory=str(destination))).serve_forever()
