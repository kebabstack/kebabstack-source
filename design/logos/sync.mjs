#!/usr/bin/env node
/** Generate all product marks. No network, deployment, or environment-specific data. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const registry=JSON.parse(await readFile(new URL('registry.json',import.meta.url),'utf8'));
const check=process.argv.includes('--check'), failures=[];
async function output(file,content){
 const dest=path.join(root,file), bytes=Buffer.from(content);
 let actual;try{actual=await readFile(dest);}catch{}
 if(actual?.equals(bytes))return;
 if(check){failures.push(file);return;}
 await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);
}
const products=['hub','desk','assets','trust','contracts','forms','watch','crumbs','kitchen','vault','bug'];
const attrs=`viewBox="${registry.viewBox}" fill="none" stroke="currentColor" stroke-width="${registry.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
const marks=Object.fromEntries(Object.entries(registry.apps).map(([id,a])=>[id,a.path]));
function svg(id,adaptive=true){return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs} color="${registry.colors.sage}">${adaptive?`<style>@media(prefers-color-scheme:dark){:root{color:${registry.colors.dark}}}</style>`:''}<path d="${marks[id]}"/></svg>\n`;}
for(const id of Object.keys(marks)){
 await output(`design/logos/svg/${id}.svg`,svg(id));
 const png=new Resvg(svg(id,false),{fitTo:{mode:'width',value:128}}).render().asPng();
 await output(`design/logos/png/${id}.png`,png);
 await output(`hub/dist/brand/${id}.svg`,svg(id));
 await output(`hub/dist/design/logos/svg/${id}.svg`,svg(id));
 await output(`hub/dist/design/logos/png/${id}.png`,png);
 if(products.includes(id)) await output(`kitchen/art/${id}.png`,png);
 if(products.includes(id)&&id!=='vault')await output(`${id}/dist/favicon.svg`,svg(id));
}
await output('contracts/dist/contract-mark.svg',svg('contracts'));
for(const file of ['bug/src/favicon.svg','bug/src/two-d/favicon.svg','bug/dist/two-d/favicon.svg','bug2d/src/favicon.svg','bug2d/dist/favicon.svg'])await output(file,svg('bug'));
const bugPng=new Resvg(svg('bug',false),{fitTo:{mode:'width',value:180}}).render().asPng();
for(const file of ['bug/dist/assets/apple-touch-icon.png','bug/src/assets/apple-touch-icon.png','bug2d/dist/assets/apple-touch-icon.png','bug2d/src/assets/apple-touch-icon.png'])await output(file,bugPng);
// Self-contained browser source: no remote dependency and no import-order coupling.
const browser=`/* Generated from design/logos/registry.json. Do not edit. */\nconst APP_LOGO_PATHS = Object.freeze(${JSON.stringify(marks,null,2)});\nexport function appLogoHtml(id) { const d=Object.hasOwn(APP_LOGO_PATHS,id)?APP_LOGO_PATHS[id]:null; return d ? '<svg ${attrs} aria-hidden="true"><path d="'+d+'"/></svg>' : ''; }\n`;
await output('design/logos/brand.js',browser);
let sdk=await readFile(path.join(root,'sdk/js/hub-client.js'),'utf8');
const start='/* BEGIN GENERATED APP LOGOS */',end='/* END GENERATED APP LOGOS */';
const block=start+'\n'+browser+end;
if(sdk.includes(start)) sdk=sdk.slice(0,sdk.indexOf(start))+block+sdk.slice(sdk.indexOf(end)+end.length);else sdk=block+'\n'+sdk;
await output('sdk/js/hub-client.js',sdk);
const global=browser.replace('export function','function')+'globalThis.kebabBrand = Object.freeze({html:appLogoHtml, paths:APP_LOGO_PATHS});\n';
await output('hub/dist/brand.js',global);
// Compiled into Hub; identity comes from the configured central app policy, never a display name.
const cases=Object.keys(marks).map(id=>`      case (${JSON.stringify(id)}) ?${JSON.stringify(svg(id))};`).join('\n');
await output('hub/backend/Brand.mo',`// Generated from design/logos/registry.json. Do not edit.\nimport Text "mo:core/Text";\nmodule {\n  public func logo(id : Text) : ?Blob {\n    let source : ?Text = switch (id) {\n${cases}\n      case (_) null;\n    };\n    switch (source) { case (?s) ?Text.encodeUtf8(s); case null null };\n  };\n};\n`);
// Keep embedded Operations marks byte-for-byte aligned, without a runtime dependency.
let ops=await readFile(path.join(root,'hub/dist/operations.js'),'utf8');
for(const [id,d] of Object.entries(marks))ops=ops.replace(new RegExp(`(${id}: \u007b[^\n]+icon:)'[^']+'`), (_,prefix)=>prefix+"'"+d+"'");
await output('hub/dist/operations.js',ops);
const cards=Object.entries(registry.apps).map(([id,a])=>`<article><img src="svg/${id}.svg" alt=""><h2>${a.name}</h2><code>${id}</code>${a.status?'<small>Planned product</small>':''}<div><a href="svg/${id}.svg">SVG</a><a href="png/${id}.png">PNG 128</a></div></article>`).join('');
await output('design/logos/index.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kebabstack · Logo library</title><style>html{color-scheme:light dark}*{box-sizing:border-box}body{font:16px system-ui,sans-serif;background:#f6f5f1;color:#222a25;margin:0;padding:64px 6vw}header{max-width:750px;margin-bottom:48px}h1{font-size:clamp(32px,5vw,56px);font-weight:500;letter-spacing:-.05em;margin:12px 0}p{line-height:1.7;color:#61685f}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}article{border:1px solid #ddded5;border-radius:12px;padding:28px;background:#fff}img{width:48px;height:48px;display:block;margin-bottom:24px}h2{font-size:17px;font-weight:500;margin-bottom:8px}code,small{display:block;color:#61685f;font-size:12px}article div{margin-top:24px;display:flex;gap:12px}a{color:inherit;font-size:12px}header>a{text-transform:uppercase;letter-spacing:.1em}@media(prefers-color-scheme:dark){body{background:#202923;color:#edf0e8}article{background:#26312a;border-color:#415044}p,code,small{color:#b5c2a7}}</style><header><a href="../">Kebabstack · Brand &amp; product system ↗</a><h1>One family. Every tool.</h1><p>The original kebabstack.dev product marks. One registry supplies the website, tools, Hub menu, installer and Cloud Engine console. Thin lines, calm colours, no competing logo styles.</p><p><a href="README.md">Logo rules and usage guide ↗</a></p></header><main>${cards}</main></html>\n`);
for(const file of ['README.md','registry.json','index.html'])await output('hub/dist/design/logos/'+file,await readFile(new URL(file,import.meta.url)));
if(failures.length){console.error('Logo drift: run npm run brand:sync\n'+failures.join('\n'));process.exit(1);}
console.log(`Brand ${registry.version}: ${Object.keys(marks).length} canonical product marks ${check?'verified':'synchronized'}.`);
