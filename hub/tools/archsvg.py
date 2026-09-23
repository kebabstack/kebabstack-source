#!/usr/bin/env python3
"""Architecture diagram generator for the hub docs page.

Why a generator: hand-placed SVG labels collided with boxes and lines every
time the content changed. Here every box is sized from its text (monospace
metrics), edges are horizontal so labels have a guaranteed corridor, and an
overlap checker refuses to emit a diagram in which any text touches a box,
a line or another text. Run:

    python3 hub/tools/archsvg.py --write        # regenerate into hub/dist/index.html
    python3 hub/tools/archsvg.py --png out.png   # preview (needs cairosvg)

Fonts are the hub's --ks-mono stack (JetBrains Mono, advance 0.60 em); we
size with 0.62 em so narrower fallbacks fit as well.
"""
import re, sys, pathlib

CW = 0.62          # em per character (mono, conservative)
LH = 1.4           # line height factor
F_TITLE, F_BODY, F_SMALL, F_EYE = 14, 12.5, 11, 10
PAD_X, PAD_Y = 16, 12
COL_GAP_MIN = 60   # min corridor width when labels are short
NODE_GAP_MIN = 22

FG, FG2, FG3, RULE, RULE2, ACC, ACC_DIM, BG = (
    "var(--ks-fg)", "var(--ks-fg-secondary)", "var(--ks-fg-muted)",
    "var(--ks-rule)", "var(--ks-rule-strong)", "var(--ks-accent)", "var(--ks-accent-dim)", "var(--ks-bg-card)")

def tw(text, size): return len(text) * size * CW

class Box:
    def __init__(self, title, subs=(), style="solid", tsize=F_TITLE, ssize=F_SMALL):
        self.title, self.subs, self.style, self.tsize, self.ssize = title, list(subs), style, tsize, ssize
        self.w = max([tw(title, tsize)] + [tw(s, ssize) for s in subs]) + 2 * PAD_X
        self.h = tsize * LH + sum(ssize * LH for _ in subs) + 2 * PAD_Y
        self.x = self.y = 0
    def cx(self): return self.x + self.w / 2
    def cy(self): return self.y + self.h / 2
    def texts(self):
        out, y = [], self.y + PAD_Y + self.tsize
        out.append((self.cx(), y, self.title, self.tsize, FG if self.style != "dashed" else FG2))
        for s in self.subs:
            y += self.ssize * LH
            out.append((self.cx(), y, s, self.ssize, FG2 if self.style != "dashed" else FG3))
        return out

class Edge:
    """horizontal edge between a side node and the hub; labels above/below the line"""
    def __init__(self, node, above=(), below=(), dashed=False, both=False, color=None, to_hub=True):
        self.node, self.above, self.below, self.dashed, self.both, self.color, self.to_hub = node, list(above), list(below), dashed, both, color, to_hub

def layout(left, right, hub_title, hub_lines, hub_foot, edges_l, edges_r):
    # column widths
    lw = max(b.w for b in left); rw = max(b.w for b in right)
    hw = max([tw(hub_title, 15) + 2 * PAD_X] + [tw(l, F_BODY) + 2 * PAD_X for l in hub_lines] + [tw(hub_foot, F_SMALL) + 2 * PAD_X])
    def corridor(edges):
        w = COL_GAP_MIN
        for e in edges:
            for t in e.above + e.below: w = max(w, tw(t, F_SMALL) + 28)
        return w
    gl, gr = corridor(edges_l), corridor(edges_r)
    # vertical stacking: each node needs room for its edge labels around its centre line
    def stack(nodes, edges, y0):
        y = y0
        for b in nodes:
            e = next((e for e in edges if e.node is b), None)
            up = len(e.above) * F_SMALL * LH + 6 if e else 0
            dn = len(e.below) * F_SMALL * LH + 6 if e else 0
            # the label block sits on the centre line; make sure it stays inside the node's vertical slot
            slot = max(b.h, up + dn + 8)
            b.y = y + (slot - b.h) / 2
            y += slot + NODE_GAP_MIN
        return y - NODE_GAP_MIN
    eye_h = 30
    top = 20 + eye_h
    hl = stack(left, edges_l, top); hr = stack(right, edges_r, top)
    height = max(hl, hr) + 20
    # x positions
    x = 20
    for b in left: b.x = x + (lw - b.w) / 2
    hub_x = x + lw + gl
    for b in right: b.x = hub_x + hw + gr + (rw - b.w) / 2
    width = hub_x + hw + gr + rw + 20
    hub = dict(x=hub_x, y=top, w=hw, h=height - 20 - top)
    return width, height, hub, (x, lw), (hub_x + hw + gr, rw), gl, gr, top

def render(left, right, hub_title, hub_lines, hub_foot, edges_l, edges_r):
    W, H, hub, (lx, lw), (rx, rw), gl, gr, top = layout(left, right, hub_title, hub_lines, hub_foot, edges_l, edges_r)
    rects, texts, out = [], [], []
    def T(x, y, s, size, fill, anchor="middle", weight=None):
        texts.append((x, y, s, size, anchor))
        w = f' font-weight="{weight}"' if weight else ""
        out.append(f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" font-size="{size}" fill="{fill}"{w}>{esc(s)}</text>')
    out.append(f'<svg viewBox="0 0 {W:.0f} {H:.0f}" style="width:100%;max-width:{W:.0f}px" xmlns="http://www.w3.org/2000/svg" font-family="var(--ks-mono)" role="img" aria-label="Architecture of the kebab-stack hub">')
    out.append(f'<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{FG2}"/></marker>'
               f'<marker id="arra" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{ACC}"/></marker></defs>')
    # eyebrows
    T(lx + lw / 2, top - 12, "SOURCES", F_EYE, FG3); T(rx + rw / 2, top - 12, "YOUR APPS", F_EYE, FG3)
    # hub
    out.append(f'<rect x="{hub["x"]:.1f}" y="{hub["y"]:.1f}" width="{hub["w"]:.1f}" height="{hub["h"]:.1f}" rx="10" fill="{ACC_DIM}" stroke="{ACC}"/>')
    rects.append((hub["x"], hub["y"], hub["w"], hub["h"]))
    hx = hub["x"] + hub["w"] / 2
    block = 15 + 12 + len(hub_lines) * F_BODY * LH * 1.15
    y = hub["y"] + (hub["h"] - block) / 2 + 4
    T(hx, y, hub_title, 15, FG, weight="500")
    y += 12
    for l in hub_lines:
        y += F_BODY * LH * 1.15
        T(hx, y, l, F_BODY, FG2)
    T(hx, hub["y"] + hub["h"] - PAD_Y - 2, hub_foot, F_SMALL, FG3)
    # nodes
    for b in left + right:
        dash = ' stroke-dasharray="5 3"' if b.style == "dashed" else ""
        stroke = ACC if b.style == "accent" else (RULE if b.style == "dashed" else RULE2)
        dash = ' stroke-dasharray="6 3"' if b.style == "accent" else dash
        out.append(f'<rect x="{b.x:.1f}" y="{b.y:.1f}" width="{b.w:.1f}" height="{b.h:.1f}" rx="8" fill="{BG}" stroke="{stroke}"{dash}/>')
        rects.append((b.x, b.y, b.w, b.h))
        for (x, ty, s, size, fill) in b.texts(): T(x, ty, s, size, fill)
    # edges
    def edge(e, side):
        b = e.node; cy = b.cy()
        if side == "L": x1, x2 = b.x + b.w, hub["x"]
        else: x1, x2 = hub["x"] + hub["w"], b.x
        col = e.color or FG2; mk = "arra" if e.color else "arr"
        dash = ' stroke-dasharray="5 3"' if e.dashed else ""
        ms = f' marker-start="url(#{mk})"' if e.both else ""
        # direction: to_hub → arrow head at the hub side
        if (side == "L") == e.to_hub: xa, xb = x1, x2
        else: xa, xb = x2, x1
        out.append(f'<line x1="{xa:.1f}" y1="{cy:.1f}" x2="{xb:.1f}" y2="{cy:.1f}" stroke="{col}"{dash} marker-end="url(#{mk})"{ms}/>')
        mx = (x1 + x2) / 2
        yy = cy - 7
        for s in reversed(e.above):
            T(mx, yy, s, F_SMALL, FG3); yy -= F_SMALL * LH
        yy = cy + F_SMALL + 5
        for s in e.below:
            T(mx, yy, s, F_SMALL, FG3); yy += F_SMALL * LH
    for e in edges_l: edge(e, "L")
    for e in edges_r: edge(e, "R")
    out.append('</svg>')
    return "\n".join(out), rects, texts, (W, H)

def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

def check(rects, texts, size):
    """every text must fit inside the viewBox; texts outside boxes must not touch any box or other text."""
    W, H = size; problems = []
    def bbox(t):
        x, y, s, sz, anchor = t; w = tw(s, sz)
        x0 = x - w / 2 if anchor == "middle" else x
        return (x0, y - sz, w, sz * 1.15)
    def inter(a, b):
        return not (a[0] + a[2] <= b[0] or b[0] + b[2] <= a[0] or a[1] + a[3] <= b[1] or b[1] + b[3] <= a[1])
    boxes = []
    for t in texts:
        bb = bbox(t)
        if bb[0] < 0 or bb[1] < 0 or bb[0] + bb[2] > W or bb[1] + bb[3] > H: problems.append(f"outside viewBox: {t[2]!r}")
        inside = [r for r in rects if r[0] <= bb[0] and bb[0] + bb[2] <= r[0] + r[2] and r[1] <= bb[1] and bb[1] + bb[3] <= r[1] + r[3]]
        touching = [r for r in rects if inter(bb, r)]
        if not inside and touching: problems.append(f"label touches a box: {t[2]!r}")
        if inside and len(touching) > 1: problems.append(f"text in two boxes: {t[2]!r}")
        boxes.append(bb)
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            if inter(boxes[i], boxes[j]): problems.append(f"texts overlap: {texts[i][2]!r} / {texts[j][2]!r}")
    return problems

def build():
    left = [
        Box("You (owner / admin)", ["add people · invite · roles"]),
        Box("HR or sign-in system", ["Okta · Entra · Workday …", "joiners & leavers, SCIM 2.0"]),
        Box("Okta pull (optional)", ["scheduled read-only sync"], style="dashed"),
        Box("A person's browser", ["passkey / company SSO"]),
        Box("A person's AI assistant", ["MCP client · kebab-mcp", "one-time code → personal token"], style="dashed"),
    ]
    right = [
        Box("Your apps, built on the SDK", ["desk · assets · watch · trust · forms · contracts …", "one contract, one topbar, one bell"]),
        Box("Your app", ["any canister, any language"]),
        Box("The menu (this UI)", ["what your people open"]),
        Box("Other software", ["Grafana · GitLab · Nextcloud …", "sign in with OpenID Connect"]),
        Box("Vault (backups)", ["snapshots · restore · plan", "co-controller of hub + apps"], style="accent"),
        Box("Kitchen (installer)", ["cooks apps from recipes", "updates hub + apps"], style="accent"),
        Box("Slack DM (optional)", ["one bot per workspace"], style="dashed"),
    ]
    hub_title = "kebab-stack hub"
    hub_lines = ["people store · one stable id per person", "passkeys · invites · roles", "company SSO sessions (optional)",
                 "lock-out · guided offboarding", "app registry · lanes · access", "access requests · grants · reviews", "groups & org profile", "one AI key for the suite (lane ai)", "OpenID Connect provider (RS256)",
                 "notification broker", "journal (audit trail)"]
    hub_foot = "on your cloud engine · your operator"
    edges_l = [
        Edge(left[0], above=["1 · people in"]),
        Edge(left[1], above=["1 · people in", "joiners · leavers"]),
        Edge(left[2], above=["1 · pull"], dashed=True),
        Edge(left[3], above=["2 · sign-in"]),
        Edge(left[4], above=["9 · app tickets as the person"], dashed=True),
    ]
    edges_r = [
        Edge(right[0], above=["3 · sign-in tickets", "people list · lock-out"], below=["4 · notifications · suite token"], both=True, to_hub=False),
        Edge(right[1], above=["3 · tickets · directory"], below=["4 · notifications"], both=True, to_hub=False),
        Edge(right[2], above=["menu · bell"], to_hub=False),
        Edge(right[3], above=["8 · OpenID Connect", "code · id_token · userinfo"], both=True, to_hub=False),
        Edge(right[4], above=["6 · snapshot / restore"], below=["vault asks: owner?"], both=True, color=ACC, to_hub=False),
        Edge(right[5], above=["7 · install / update"], below=["kitchen asks: owner?"], both=True, color=ACC, to_hub=False),
        Edge(right[6], above=["5 · DM delivery"], dashed=True, to_hub=False),
    ]
    return render(left, right, hub_title, hub_lines, hub_foot, edges_l, edges_r)

def main():
    svg, rects, texts, size = build()
    problems = check(rects, texts, size)
    if problems:
        print("LAYOUT FAIL"); [print(" -", p) for p in problems]; sys.exit(1)
    print(f"layout OK · {len(texts)} texts · viewBox {size[0]:.0f}×{size[1]:.0f}")
    if "--png" in sys.argv:
        import cairosvg
        concrete = {"var(--ks-fg)": "#1f1b17", "var(--ks-fg-secondary)": "#5b544c", "var(--ks-fg-muted)": "#8a8177",
                    "var(--ks-rule)": "#d8d1c6", "var(--ks-rule-strong)": "#4a443d", "var(--ks-accent)": "#d8481f",
                    "var(--ks-accent-dim)": "#fbe9e1", "var(--ks-bg-card)": "#fffdf9", "var(--ks-mono)": "DejaVu Sans Mono"}
        s2 = svg
        for k, v in concrete.items(): s2 = s2.replace(k, v)
        s2 = s2.replace('style="width:100%;max-width:', 'style="background:#f7f3ec;max-width:')
        cairosvg.svg2png(bytestring=s2.encode(), write_to=sys.argv[sys.argv.index("--png") + 1], output_width=int(size[0]) * 2)
    if "--write" in sys.argv:
        p = pathlib.Path(__file__).resolve().parents[1] / "dist" / "index.html"
        html = p.read_text()
        a, b = "<!-- ARCH-SVG START -->", "<!-- ARCH-SVG END -->"
        assert a in html and b in html, "markers missing in index.html"
        pre, rest = html.split(a, 1); _, post = rest.split(b, 1)
        p.write_text(pre + a + "\n" + svg + "\n        " + b + post)
        print("written to", p)

if __name__ == "__main__":
    main()
