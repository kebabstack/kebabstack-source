#!/usr/bin/env python3
"""Render the trusted repository guide's Markdown subset without runtime dependencies."""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def inline(text):
    code = []

    def keep(match):
        code.append('<code>' + html.escape(match[1]) + '</code>')
        return f'CODETOKEN{len(code) - 1}END'

    text = re.sub(r'`([^`]+)`', keep, text)
    text = html.escape(text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    for i, value in enumerate(code):
        text = text.replace(f'CODETOKEN{i}END', value)
    return text


lines = (ROOT / 'CUSTOMER-SUPPORT.md').read_text().splitlines()
out, index = [], 0
while index < len(lines):
    line = lines[index]
    index += 1
    if not line.strip():
        continue
    if line.startswith('```'):
        block = []
        while index < len(lines) and not lines[index].startswith('```'):
            block.append(lines[index])
            index += 1
        index += 1
        out.append('<pre><code>' + html.escape('\n'.join(block)) + '</code></pre>')
    elif match := re.match(r'^(#{1,6}) (.+)$', line):
        level, title = len(match[1]), match[2]
        anchor = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
        alias = 'privacy' if title == 'Privacy, deletion and backups' else 'embedding' if title.startswith('Embedding:') else ''
        if alias:
            out.append(f'<span id="{alias}"></span>')
        out.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>')
    elif line.startswith('|'):
        rows = [line]
        while index < len(lines) and lines[index].startswith('|'):
            rows.append(lines[index])
            index += 1
        out.append('<div class="scroll"><table>')
        for row_index, row in enumerate(rows):
            if re.fullmatch(r'[|\s:\-]+', row):
                continue
            tag = 'th' if row_index == 0 else 'td'
            out.append('<tr>' + ''.join(f'<{tag}>{inline(cell.strip())}</{tag}>' for cell in row.strip('|').split('|')) + '</tr>')
        out.append('</table></div>')
    elif re.match(r'^(\d+\. |\- )', line):
        ordered = line[0].isdigit()
        tag = 'ol' if ordered else 'ul'
        pattern = r'^\d+\. ' if ordered else r'^- '
        rows = [re.sub(pattern, '', line)]
        while index < len(lines) and re.match(pattern, lines[index]):
            rows.append(re.sub(pattern, '', lines[index]))
            index += 1
        out.append(f'<{tag}>' + ''.join('<li>' + inline(row) + '</li>' for row in rows) + f'</{tag}>')
    else:
        paragraph = [line]
        while index < len(lines) and lines[index].strip() and not re.match(r'^(#|```|\||\d+\. |\- )', lines[index]):
            paragraph.append(lines[index])
            index += 1
        out.append('<p>' + inline(' '.join(paragraph)) + '</p>')

page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Embedding & privacy guide · Desk</title><link rel="stylesheet" href="./support.css"><style>main{max-width:920px}h2{margin-top:48px;scroll-margin-top:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;font:13px/1.7 ui-monospace,monospace}code{font:13px ui-monospace,monospace;overflow-wrap:anywhere}li{margin:12px 0}.scroll{overflow:auto}table{border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:12px;text-align:left}nav{display:flex;flex-wrap:wrap;gap:16px;margin:24px 0}</style></head><body><main><a href="./#/customers">← Customer projects</a><nav aria-label="Guide sections"><a href="#embedding">Embed a widget</a><a href="#request-types-and-workflows">Request types & workflows</a><a href="#server-api">Product API</a><a href="#privacy">Privacy & deletion</a><a href="#backups-and-restore-procedure">Restore procedure</a><a href="#embedding-troubleshooting">Troubleshooting</a></nav>'''
(ROOT / 'dist/customer-support.html').write_text(page + '\n'.join(out) + '</main></body></html>\n')
print('Customer guide rendered from CUSTOMER-SUPPORT.md')
