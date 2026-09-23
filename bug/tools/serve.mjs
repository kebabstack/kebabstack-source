import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4177);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/runtime-config.json') {
      try { const runtime = await readFile(resolve(root, '../.preview-backend.json')); res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(runtime); return; } catch {}
    }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return; }
    const candidate = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    let data = await readFile(candidate);
    // Loopback preview talks to a disposable PocketIC HTTP port. Production keeps its HTTPS CSP.
    if (candidate.endsWith('/index.html')) data = data.toString('utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g, '');
    res.writeHead(200, { 'Content-Type': types[extname(candidate)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Ship the Bug 2D + 3D → http://127.0.0.1:${port}`));
