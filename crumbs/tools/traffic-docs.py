#!/usr/bin/env python3
"""Generate served operator guidance from the canonical Markdown sources."""
import html,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[1]
def inline(text):
    text=html.escape(text)
    text=re.sub(r'`([^`]+)`',r'<code>\1</code>',text)
    text=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',text)
    return re.sub(r'https://[^\s<]+',lambda m:'<a href="'+m[0].rstrip('.')+'">'+m[0].rstrip('.')+'</a>'+('.' if m[0].endswith('.') else ''),text)
def render(source):
    out=[];paragraph=[];code=None
    def flush():
        if paragraph:out.append('<p>'+inline(' '.join(paragraph))+'</p>');paragraph.clear()
    for line in source.splitlines():
        if line.startswith('```'):
            flush()
            if code is None:code=[]
            else:out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>');code=None
        elif code is not None:code.append(line)
        elif line.startswith('#'):
            flush();level=min(len(line)-len(line.lstrip('#'))+1,6);out.append(f'<h{level}>'+inline(line.lstrip('# '))+f'</h{level}>')
        elif not line:flush()
        else:paragraph.append(line)
    flush();return '\n'.join(out)
result='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crumbs traffic and migration</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="style.css"><main class="docs"><a href="./">Back to Crumbs</a><h1>Traffic data and Matomo migration</h1>'+render((root/'TRAFFIC.md').read_text())+'<section id="matomo">'+render((root/'MATOMO.md').read_text())+'</section></main></html>\n'
target=root/'dist/traffic.html'
if '--check' in sys.argv:
    if target.read_text()!=result:sys.exit('Run python3 crumbs/tools/traffic-docs.py')
else:target.write_text(result)
