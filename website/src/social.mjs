import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
// Code-native composition; every mark and colour comes from the canonical registries.
export async function writeSocial(out) {
  const brand = JSON.parse(await readFile(new URL('../../design/brand/registry.json', import.meta.url), 'utf8'));
  const logos = JSON.parse(await readFile(new URL('../../design/logos/registry.json', import.meta.url), 'utf8'));
  const {light: t} = JSON.parse(await readFile(new URL('../../design/tokens.json', import.meta.url), 'utf8'));
  const names = ['desk', 'assets', 'trust', 'contracts', 'forms', 'watch', 'crumbs'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${t.bg}"/>
    <g transform="translate(64 64)" color="${brand.colors.ink}"><svg width="54" height="70" viewBox="${brand.viewBox}">${brand.geometry}</svg></g>
    <text x="134" y="115" font-family="Helvetica, Arial, sans-serif" font-size="46" font-weight="700" letter-spacing="-2.2" fill="${brand.colors.ink}">kebab<tspan fill="${brand.colors.hyphen}">-</tspan>stack</text>
    <g fill="${t.ink}" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="58"><text x="64" y="248">Your IT. Less busywork.</text><text x="64" y="322">More possibility.</text></g>
    <text x="64" y="383" fill="${t.secondary}" font-family="Helvetica, Arial, sans-serif" font-size="25">Connected IT tools on OpenCloud · Currently in alpha</text>
    <path d="M64 435H1136" stroke="${t.line}"/>
    ${names.map((name, i) => `<g transform="translate(${64+i*154} 468)"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${t.logo}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${logos.apps[name].path}"/></svg><text x="0" y="59" font-family="Helvetica, Arial, sans-serif" font-size="21" fill="${t.ink}">${name[0].toUpperCase()+name.slice(1)}</text></g>`).join('')}
    <text x="1136" y="588" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${t.secondary}">kebabstack.dev</text>
  </svg>`;
  await writeFile(new URL('social.png', out), new Resvg(svg).render().asPng());
}
