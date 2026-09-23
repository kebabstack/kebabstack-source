#!/usr/bin/env node
// Canonical runtime values and shared stylesheet distribution. No deployment.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=f=>readFile(path.join(root,f),'utf8');
const check=process.argv.includes('--check'),drift=[];
async function emit(f,s){if(await read(f).catch(()=>null)===s)return;if(check)drift.push(f);else await writeFile(path.join(root,f),s);}
const t=JSON.parse(await read('design/tokens.json'));
const roles={bg:'bg','bg-card':'surface','bg-elev':'surface','bg-sunk':'sunken',fg:'ink','fg-body':'ink','fg-secondary':'secondary','fg-muted':'muted','fg-disabled':'muted','fg-inverse':'on-accent',rule:'line','rule-strong':'control',accent:'accent','accent-strong':'accent-hover','accent-dim':'accent-soft','on-accent':'on-accent',focus:'focus',logo:'logo','indicator-teal':'success','indicator-rust':'warning','section-teal':'success','section-blue':'info','code-bg':'sunken','code-fg':'ink',danger:'danger','danger-bg':'danger-bg',warning:'warning','warning-bg':'warning-bg',success:'success','success-bg':'success-bg',info:'info','info-bg':'info-bg'};
const palette=theme=>Object.entries(roles).map(([k,v])=>`  --ks-${k}: ${t[theme][v]};`).join('\n');
const dimensions=Object.entries(t.components).flatMap(([component,values])=>Object.entries(values).map(([key,value])=>`  --ks-${component}-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}: ${value}px;`)).join('\n');
const old=await read('hub/dist/tokens.css'),base=old.slice(old.indexOf('/* ===================================================================\n   Base element styling'));
if(!base.startsWith('/*'))throw Error('Runtime token boundary missing');
const css=`/* Kebabstack runtime tokens · generated from design/tokens.json.
   Edit the registry and run npm run runtime:sync. Application palettes must
   reference these semantic roles instead of redefining them. */
:root {
  color-scheme: light;
  --ks-ui: ${t.fonts.ui};
  --ks-display: var(--ks-ui);
  --ks-mono: ${t.fonts.mono};
  --ks-fz-eyebrow: 12px; --ks-fz-body: 16px; --ks-fz-body-sm: 14px;
  --ks-fz-h3: 20px; --ks-fz-h2: 30px; --ks-fz-h1: clamp(30px, 4vw, 40px); --ks-fz-marker: 12px;
  --ks-lh-tight: 1.15; --ks-lh-display: 1.2; --ks-lh-body: 1.6; --ks-lh-meta: 1.5;
  --ks-tracking-display: -.025em; --ks-tracking-h2: -.02em;
  --ks-tracking-eyebrow: .1em; --ks-tracking-mono: .02em;
  --ks-weight-display: 600; --ks-weight-body: 400; --ks-weight-ui: 400; --ks-weight-ui-strong: 600;
${t.space.map((n,i)=>`  --ks-space-${i+1}: ${n}px;`).join('\n')}
  --ks-space-9: 96px; --ks-space-10: 128px; --ks-space-section: 96px;
  --ks-container: ${t.layout.content}px; --ks-prose: ${t.layout.reading}px; --ks-gutter: ${t.layout.gutterDesktop}px;
  --ks-radius-inline: 8px; --ks-radius-card: ${t.radius.panel}px; --ks-radius-input: ${t.radius.control}px; --ks-radius-pill: 9999px;
  --ks-rule-w: 1px; --ks-card-stripe-w: 3px;
  --ks-section-default: var(--ks-accent); --ks-border: var(--ks-rule);
  --ks-bg-cta-inverse: var(--ks-fg); --ks-grid-line: #24352e0a; --ks-grid-tile: 24px;
${dimensions}
${palette('light')}
}
[data-theme="dark"] {
  color-scheme: dark;
  --ks-grid-line: #edf2ea0a;
${palette('dark')}
}

${base.replace('color: #ffffff;','color: var(--ks-on-accent);').replace('outline: 2px solid var(--ks-focus);','outline: 3px solid var(--ks-focus);').replace('outline-offset: 2px;','outline-offset: 4px;').replace('/* Headings carry the mono display face: the terminal is the brand. */','/* Readable UI headings; monospace is reserved for identifiers and code. */')}`;
await emit('hub/dist/tokens.css',css);
const apps=['assets','contracts','desk','forms','trust','watch','crumbs','bug','bug2d','kitchen'];
for(const app of apps)await emit(app+'/dist/tokens.css',css);
const components=await read('hub/dist/components.css');
for(const app of apps)await emit(app+'/dist/components.css',components);
const brand=JSON.parse(await read('design/brand/registry.json'));
const mark=`<svg viewBox="${brand.viewBox}" width="27" height="35" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${brand.geometry}</svg>`;
let client=await read('sdk/js/hub-client.js');
client=client.replace(/const SKEWER_SVG = [^\n]+;/,`const SKEWER_SVG = ${JSON.stringify(mark)};`);
await emit('sdk/js/hub-client.js',client);
for(const file of ['sdk/ui/signin.html','hub/dist/index.html']){
 let s=await read(file),i=0;
 const g=brand.geometry.replace('<path ','<path class="lg-stick" ').replace(/<rect /g,()=>`<rect class="lg-piece" data-i="${i++}" `);
 s=s.replace(/<svg id="lgSvg"[\s\S]*?<\/svg>/,`<svg id="lgSvg" viewBox="${brand.viewBox}" width="27" height="35" xmlns="http://www.w3.org/2000/svg">${g}</svg>`);
 s=s.replace('<span style="color:#ffb695">-</span>','<span class="brand-hyphen">-</span>');
 await emit(file,s);
}
if(drift.length){console.error('Runtime drift:\n'+drift.join('\n'));process.exit(1);}
console.log('Canonical runtime tokens, components and suite mark '+(check?'verified':'synchronized'));
