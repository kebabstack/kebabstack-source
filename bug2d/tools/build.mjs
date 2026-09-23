import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/vendor/', root), { recursive: true });
for (const name of ['game-tools.js','index.html','style.css','arcade.css','retro.css','main.js','physics.js','scene.js','overdrive.js','ghost.js','touch-controls.js','challenge.js','mines.js','scoring.js','result-board.js','commander.js','community.js','ecosystem.js','favicon.svg','app.js']) {
  await cp(new URL('src/' + name, root), new URL('dist/' + name, root));
}
await cp(new URL('src/assets/', root), new URL('dist/assets/', root), { recursive: true });
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
await writeFile(new URL('dist/build-info.json', root), JSON.stringify({ version: pkg.version, renderer: 'Canvas2D', builtAt: new Date().toISOString(), mode: 'kebabstack-2d-modern-retro', backend: 'runtime-canister-env', score: 'floor(meters) + coins * 50' }, null, 2) + '\n');
await build({ entryPoints: [new URL('src/client-api.js', root).pathname], outfile: new URL('dist/client-api.js', root).pathname, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, external: ['./app.js'] });
await writeFile(new URL('dist/runtime-config.json', root), JSON.stringify({backend: null}) + '\n');
const html = await readFile(new URL('dist/index.html', root), 'utf8');
const hashes = [...html.matchAll(/<script(?: type="importmap")?>([\s\S]*?)<\/script>/g)].map(m => "'sha256-" + createHash('sha256').update(m[1]).digest('base64') + "'");
const csp = "default-src 'self'; script-src 'self' " + hashes.join(' ') + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://icp-api.io; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
await writeFile(new URL('dist/index.html',root),html.replace('<meta charset="utf-8">','<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="'+csp.replace("; frame-ancestors 'none'",'')+'">'));
await writeFile(new URL('dist/.ic-assets.json5', root), JSON.stringify([{ match: '**/*', headers: { 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Cache-Control':'no-cache' } }, { match:'index.html', headers:{ 'Content-Security-Policy':csp, 'X-Frame-Options':'DENY' } }],null,2)+'\n');
console.log(`Built Ship the Bug ${pkg.version}. All runtime assets are local in dist/.`);

for (const [from,to] of [['../sdk/js/hub-client.js','hub-client.js'],['../hub/dist/tokens.css','tokens.css'],['CHANGELOG.md','CHANGELOG.md']]) await cp(new URL(from,root),new URL('dist/'+to,root));
