import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeSocial } from "./social.mjs";
import { guides } from "./guides.mjs";
import { content } from "./content.mjs";
import { readAnalytics } from "./analytics.mjs";
const analytics = await readAnalytics();
import { renderScenario } from "./scenarios.mjs";
const suiteBrand = JSON.parse(
  await readFile(
    new URL("../../design/brand/registry.json", import.meta.url),
    "utf8",
  ),
);

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "dist");
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const lines = (value) => esc(value).replaceAll("\n", "<br>");
const brand = JSON.parse(
  await readFile(
    new URL("../../design/logos/registry.json", import.meta.url),
    "utf8",
  ),
);
const paths = {
  ...Object.fromEntries(
    Object.values(brand.apps).map((app) => [app.symbol, app.path]),
  ),
  arrow: "M5 12h14m-6-6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  server: "M3 3h18v7H3zM3 14h18v7H3zM7 6.5h.01M7 17.5h.01",
  browser: "M3 4h18v16H3zM3 9h18M6 6.5h.01M9 6.5h.01",
  plus: "M12 5v14M5 12h14",
  menu: "M4 6h16M4 12h16M4 18h16",
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
const logo = () =>
  '<span class="brand-mark" aria-hidden="true"><svg viewBox="' +
  suiteBrand.viewBox +
  '">' +
  suiteBrand.geometry +
  '</svg></span><span>kebab<span class="brand-hyphen">-</span>stack</span>';
const arrow = icon("arrow");
const hrefs = ["#stack", "#engine", "#build", "#start"];

function stackOverview(c) {
  const de = c === content.de,
    t = (a, b) => (de ? a : b);
  const roles = de
    ? { desk: "Support", assets: "Inventar", trust: "Gerätestatus", contracts: "Verträge", forms: "Formulare", watch: "Domains", crumbs: "Analytics" }
    : { desk: "Support", assets: "Inventory", trust: "Device posture", contracts: "Agreements", forms: "Submissions", watch: "Domains", crumbs: "Analytics" };
  const apps = c.modules.filter((m) => m.id !== "hub" && !m.planned);
  const hub = c.modules.find((m) => m.id === "hub");
  return `<aside class="hero-stack" aria-labelledby="stack-overview-title">
    <p class="tiny-label">${t("DIE GEMEINSAME BASIS", "THE SHARED FOUNDATION")}</p>
    <h2 id="stack-overview-title">${t("Ein Hub. Dein ganzer Stack.", "One Hub. Your whole stack.")}</h2>
    <a class="stack-hub" href="#app-hub">${icon(hub.icon)}<span><strong>Hub</strong><span>${t("Menschen · Anmeldung · Rechte", "People · Sign-in · Permissions")}</span></span>${arrow}</a>
    <div class="stack-connector" aria-hidden="true"></div>
    <ul class="stack-apps">${apps.map((m) => `<li><a href="#app-${m.id}" data-crumbs-event="Explore: ${esc(m.name)}">${icon(m.icon)}<strong>${esc(m.name)}</strong><span>${esc(roles[m.id])}</span></a></li>`).join("")}
      <li><a class="stack-extension" href="#build">${icon("plus")}<strong>${t("Deine App", "Your app")}</strong><span>${t("Mit dem SDK", "With the SDK")}</span></a></li>
    </ul>
  </aside>`;
}
function explorer(c) {
  const lang = c === content.de ? "de" : "en";
  return `<div class="app-explorer" data-explorer><nav class="app-tabs" aria-label="${esc(c.explorerLabel)}">${c.modules.map((m) => `<a class="app-tab" id="tab-${m.id}" href="#app-${m.id}" data-crumbs-event="Explore: ${esc(m.name)}">${icon(m.icon)}<span>${esc(m.name)}${m.tabStatus ? `<small class="tab-status">${esc(m.tabStatus)}</small>` : ""}</span></a>`).join("")}</nav>${c.modules.map((m) => `<article class="module-panel" id="app-${m.id}"><div class="module-copy"><p class="app-category">${icon(m.icon)} ${esc(m.name)} <span>/ ${esc(m.category)}</span></p><h3>${esc(m.title)}</h3><p>${esc(m.text)}</p><ul class="feature-list">${m.features.map((f) => `<li>${icon(m.planned ? "plus" : "check")}${esc(f)}</li>`).join("")}</ul><span class="alpha-label${m.planned ? " status-planned" : ""}">${esc(m.status || c.alpha)}</span><p class="module-boundary">${esc(m.note)}</p>${guides.some(g => g.app === m.id) ? `<a class="text-link" href="${guides.find(g => g.app === m.id)[lang].path}">${esc(guides.find(g => g.app === m.id)[lang].label)} ${arrow}</a>` : ""}</div><figure class="module-preview">${renderScenario(m.id, lang, icon, esc)}<figcaption>${esc(m.illustration || c.illustration)}</figcaption></figure></article>`).join("")}</div>`;
}

const origin = 'https://kebabstack.dev';
const guideCards = (lang, except = '') => `<div class="guide-links">${guides.filter(g => g.id !== except).map(g => `<a class="guide-link" href="${g[lang].path}">${icon(brand.apps[g.app].symbol)}<span><strong>${esc(g[lang].label)}</strong><span>${esc(g[lang].heading)}</span></span>${arrow}</a>`).join('')}</div>`;
function guideBody(lang, guide) {
  const g = guide[lang], de = lang === 'de', home = de ? '/' : '/en/';
  return `<div class="shell guide-layout"><nav class="breadcrumbs" aria-label="${de ? 'Brotkrümelnavigation' : 'Breadcrumb'}" itemscope itemtype="https://schema.org/BreadcrumbList"><span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem"><a itemprop="item" href="${home}"><span itemprop="name">Kebabstack</span></a><meta itemprop="position" content="1"></span><span aria-hidden="true">/</span><span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem"><span itemprop="name" aria-current="page">${esc(g.label)}</span><meta itemprop="item" content="${origin + g.path}"><meta itemprop="position" content="2"></span></nav>
  <article class="guide-article" itemscope itemtype="https://schema.org/SoftwareApplication"><meta itemprop="name" content="${guide.id === 'analytics' ? 'Kebabstack Crumbs' : 'Kebabstack'}"><meta itemprop="applicationCategory" content="BusinessApplication"><meta itemprop="operatingSystem" content="Web browser"><link itemprop="license" href="https://kebabstack.dev/LICENSE.txt"><link itemprop="url" href="${origin + g.path}">
  <header class="guide-heading"><p class="eyebrow">${icon(brand.apps[guide.app].symbol)} ${esc(g.label)} · Alpha</p><h1>${esc(g.heading)}</h1><p class="guide-intro" itemprop="description">${esc(g.intro)}</p></header>
  ${g.sections.map(([heading, text]) => `<section class="guide-section"><h2>${esc(heading)}</h2><p>${esc(text)}</p></section>`).join('')}
  <section class="guide-decision"><h2>${esc(g.decision)}</h2><p>${esc(g.decisionText)}</p><a class="button button-primary" href="${home}#app-${guide.app}">${esc(g.next)} ${arrow}</a></section>
  <p class="guide-status">${de ? 'Implementierte Alpha. Der Quellcode ist öffentlich unter MIT verfügbar. OpenCloud Marketplace ist in Vorbereitung.' : 'Implemented alpha. Public source is available under MIT. OpenCloud Marketplace integration is in preparation.'}</p></article>
  <aside class="guide-related"><h2>${de ? 'Weiterlesen' : 'Keep exploring'}</h2>${guideCards(lang, guide.id)}</aside></div>`;
}

function page(lang, guide = null) {
  const c = content[lang];
  const home = lang === "de" ? "/" : "/en/";
  const alternate = guide ? guide[lang === "de" ? "en" : "de"].path : lang === "de" ? "/en/" : "/";
  const urlPath = guide ? guide[lang].path : home;
  const title = guide ? guide[lang].title : c.title, description = guide ? guide[lang].description : c.description;
  const languagePath = l => guide ? guide[l].path : l === 'de' ? '/' : '/en/';
  const navPrefix = guide ? home : '';
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#f6f5f1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="kebabstack"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="https://kebabstack.dev${urlPath}"><meta property="og:locale" content="${lang === "de" ? "de_DE" : "en_GB"}"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:image" content="https://kebabstack.dev/social.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Kebabstack — connected IT tools on OpenCloud"><meta name="twitter:card" content="summary_large_image"><meta name="website-version" content="${version}"><link rel="canonical" href="https://kebabstack.dev${urlPath}"><link rel="alternate" hreflang="de" href="https://kebabstack.dev${languagePath('de')}"><link rel="alternate" hreflang="en" href="https://kebabstack.dev${languagePath('en')}"><link rel="alternate" hreflang="x-default" href="https://kebabstack.dev${languagePath('de')}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><script src="/theme.js"></script><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/styles.css"><script src="/app.js" defer></script>${analytics ? `<script src="/analytics.js" defer data-site="${esc(analytics.site)}" data-tracker="${esc(analytics.tracker)}" data-endpoint="${esc(analytics.endpoint)}"></script>` : ""}</head>
<body itemscope itemtype="https://schema.org/WebSite"><meta itemprop="name" content="Kebabstack"><link itemprop="url" href="https://kebabstack.dev/">
<a class="skip-link" href="#main">${esc(c.skip)}</a>
<header class="site-header"><div class="shell header-inner"><a class="brand" href="${home}" aria-label="kebabstack">${logo()}</a><nav class="desktop-nav" aria-label="${lang === "de" ? "Hauptnavigation" : "Main navigation"}">${c.nav
    .slice(0, 3)
    .map((n, i) => `<a href="${navPrefix}${hrefs[i]}">${esc(n)}</a>`)
    .join(
      "",
    )}</nav><div class="header-actions"><label class="theme-control" hidden><span class="sr-only">${esc(c.theme)}</span><select id="theme-choice" aria-label="${esc(c.theme)}">${["system", "light", "dark"].map((v, i) => `<option value="${v}">${esc(c.themeOptions[i])}</option>`).join("")}</select></label><div class="language-switch" aria-label="${lang === "de" ? "Sprache" : "Language"}"><a href="${languagePath('de')}" lang="de" hreflang="de" ${lang === "de" ? 'aria-current="page"' : ""}>DE</a><span>/</span><a href="${languagePath('en')}" lang="en" hreflang="en" ${lang === "en" ? 'aria-current="page"' : ""}>EN</a></div><a class="button button-small button-dark header-cta" href="${navPrefix}#start">${esc(c.nav[3])} ${arrow}</a><button class="menu-toggle" hidden aria-expanded="false" aria-controls="mobile-nav" aria-label="${esc(c.menu)}" data-open-label="${esc(c.menu)}" data-close-label="${esc(c.close)}">${icon("menu")}</button></div></div><nav class="mobile-nav shell" id="mobile-nav" aria-label="${lang === "de" ? "Mobile Navigation" : "Mobile navigation"}" hidden>${c.nav.map((n, i) => `<a href="${navPrefix}${hrefs[i]}">${esc(n)} ${arrow}</a>`).join("")}<label class="mobile-theme" hidden><span>${esc(c.theme)}</span><select data-theme-choice aria-label="${esc(c.theme)}">${["system", "light", "dark"].map((v, i) => `<option value="${v}">${esc(c.themeOptions[i])}</option>`).join("")}</select></label></nav></header>
<main id="main">${guide ? guideBody(lang, guide) : `
<section class="hero shell"><div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span>${esc(c.eyebrow)}</p><h1>${c.hero.map((line, i) => `<span${i === 2 ? ' class="accent-text"' : ""}>${esc(line)}</span>`).join("")}</h1><p class="hero-intro">${esc(c.intro)}</p><div class="hero-buttons"><a class="button button-primary" href="#stack">${esc(c.heroPrimary)} ${arrow}</a><a class="text-link" href="#engine">${esc(c.heroSecondary)} <span>↗</span></a></div><ul class="hero-notes">${c.heroNotes.map((n) => `<li>${icon("check")}${esc(n)}</li>`).join("")}</ul></div>${stackOverview(c)}</section>
<div class="foundation-strip"><div class="shell">${c.ribbon.map((r, i) => `<span>${icon(["people", "layers", "code"][i])}${esc(r)}</span>`).join("")}<span class="strip-label">BUILT TO BE YOURS.</span></div></div>
<section class="section shell" id="stack"><div class="section-heading"><div><p class="eyebrow">${esc(c.suiteKicker)}</p><h2>${lines(c.suiteTitle)}</h2></div><p class="section-intro">${esc(c.suiteIntro)}</p></div>${explorer(c)}<div class="supporting-header"><h3>${esc(c.moreTitle)}</h3><span class="tiny-label">ALPHA</span></div><div class="supporting-grid">${c.supporting.map((m) => `<article class="supporting-card"><div class="supporting-icon">${icon(m[3])}</div><h4>${m[0]}<span>${esc(m[1])}</span></h4><p>${esc(m[2])}</p></article>`).join("")}</div></section>
<section class="engine-section" id="engine"><div class="shell section"><div class="section-heading"><div><p class="eyebrow">${esc(c.engineKicker)}</p><h2>${lines(c.engineTitle)}</h2></div><p class="section-intro">${esc(c.engineIntro)}</p></div><div class="engine-grid"><div class="architecture" role="img" aria-label="${esc(c.layers.map((l) => l.join(": ")).join(". "))}">${c.layers.map((l, i) => `<div class="architecture-row"><span class="architecture-number">0${i + 1}</span><div class="architecture-layer layer-${i}"><div>${icon(["browser", "layers", "server"][i])}<span class="tiny-label">${c.layerLabels[i]}</span></div><h3>${esc(l[0])}</h3><p>${esc(l[1])}</p>${i === 2 ? '<div class="nodes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ""}</div></div>`).join("")}<span class="diagram-caption">${lang === "de" ? "Vereinfachte Architektur" : "Simplified architecture"}</span></div><div class="engine-explainer">${c.enginePoints.map((p, i) => `<article><span class="explain-number">0${i + 1}</span><div><p class="tiny-label">${esc(p[0])}</p><h3>${esc(p[1])}</h3><p>${esc(p[2])}</p></div></article>`).join("")}<div class="opencloud-note"><p>${esc(c.opencloudText)}</p><a class="text-link" href="https://opencloud.org/">${esc(c.opencloudLink)} ↗</a></div></div></div><p class="boundary-note">${icon("shield")}${esc(c.engineNote)}</p></div></section>
<section class="build-section" id="build"><div class="shell section"><p class="eyebrow">${esc(c.buildKicker)}</p><h2>${lines(c.buildTitle)}</h2><div class="build-grid"><div><p class="build-intro">${esc(c.buildIntro)}</p><ol class="build-steps">${c.buildSteps.map((s) => `<li><span>${s[0]}</span><div><h3>${esc(s[1])}</h3><p>${esc(s[2])}</p></div></li>`).join("")}</ol></div><div class="source-card"><div class="source-header">${icon("code")}<span>${esc(c.codeLabel)}</span><span class="source-tag">MIT</span></div><div class="file-tree"><div class="tree-root">kebabstack/</div>${["hub/", "desk/", "assets/", "sdk/example/", "docs/agent/"].map((p, i) => `<div class="tree-line${i === 3 ? " tree-highlight" : ""}"><code>${i === 4 ? "└" : "├"}─ ${p}</code><span>${esc(c.tree[i])}</span></div>`).join("")}</div><div class="source-add"><span>+</span><div><code>your-next-idea/</code><p>${esc(c.codeComment)}</p></div>${icon("spark")}</div><div class="license-note"><h3>${esc(c.licenseTitle)}</h3><p>${esc(c.licenseText)}</p><a href="/LICENSE.txt">${esc(c.licenseLink)} ${arrow}</a></div></div></div><p class="build-boundary">${esc(c.buildNote)}</p><a class="button button-primary" href="https://github.com/kebabstack/kebabstack-source">${lang === "de" ? "Quellcode auf GitHub" : "View source on GitHub"} ${arrow}</a></div></section>
<section class="section shell economics" id="benefits"><div class="section-heading"><div><p class="eyebrow">${esc(c.economicsKicker)}</p><h2>${lines(c.economicsTitle)}</h2></div><p class="section-intro">${esc(c.economicsIntro)}</p></div><div class="benefit-grid">${c.economicsCards.map((p) => `<article><span class="benefit-number">${p[0]}</span><h3>${esc(p[1])}</h3><p>${esc(p[2])}</p></article>`).join("")}</div><div class="cost-model"><p class="tiny-label">${esc(c.costHeading)}</p><div class="cost-equation">${c.costParts.map((p, i) => `${i ? '<span class="cost-plus">+</span>' : ""}<span class="cost-term">${i === 0 ? "<strong>0</strong>" : icon(["code", "server", "spark", "people", "layers"][i])}${esc(p)}</span>`).join("")}</div><p>${esc(c.costNote)}</p></div></section>
<section class="start-section" id="start"><div class="section shell"><div class="start-grid"><div><p class="eyebrow">${esc(c.startKicker)}</p><h2>${lines(c.startTitle)}</h2><p class="start-intro">${esc(c.startIntro)}</p><ol class="pilot-steps">${c.pilot.map((p, i) => `<li><span>${i + 1}</span><div><h3>${esc(p[0])}</h3><p>${esc(p[1])}</p></div></li>`).join("")}</ol><a class="button button-dark" href="/pilot-${lang}.md" download data-crumbs-event="Pilot: Download">${esc(c.downloadPilot)} ${icon("download")}</a></div><aside class="roadmap"><span class="roadmap-mark">${logo()}</span><h3>${esc(c.roadmapTitle)}</h3><ol>${c.roadmap.map((r, i) => `<li><span class="roadmap-node node-${i}"></span><div><span class="roadmap-status">${esc(r[0])}</span><p>${esc(r[1])}</p></div></li>`).join("")}</ol><p class="roadmap-note">${esc(c.roadmapNote)}</p></aside></div></div></section>
<section class="section shell guides-home" aria-labelledby="guides-heading"><p class="eyebrow">${lang === "de" ? "IN DER PRAXIS" : "IN PRACTICE"}</p><h2 id="guides-heading">${lang === "de" ? "Was soll deine IT einfacher machen?" : "What should be easier for your IT team?"}</h2>${guideCards(lang)}</section>
<section class="section shell faq"><div><p class="eyebrow">FAQ</p><h2>${esc(c.faqTitle)}</h2></div><div class="faq-list">${c.faq.map((f) => `<details><summary>${esc(f[0])}${icon("plus")}</summary><p>${esc(f[1])}</p>${f[2] ? `<p><a href="${esc(f[2])}">${esc(f[3])} ${arrow}</a></p>` : ""}</details>`).join("")}</div></section>
<section class="closing shell"><div><span class="closing-skewer" aria-hidden="true">${logo()}</span><h2>${lines(c.endTitle)}</h2></div><a class="button button-primary" href="#stack">${esc(c.endLink)} ${arrow}</a></section>
`}
</main><footer class="site-footer shell"><div class="footer-top"><a class="brand" href="${home}" aria-label="kebabstack">${logo()}</a><p>${esc(c.footerTag)}</p><a class="footer-language" href="${alternate}" hreflang="${lang === "de" ? "en" : "de"}" lang="${lang === "de" ? "en" : "de"}">${lang === "de" ? "Read in English" : "Auf Deutsch lesen"} ↗</a></div><div class="footer-bottom"><span>© 2026 kebabstack contributors</span><span>${esc(c.footerStatus)}</span><a href="https://github.com/kebabstack/kebabstack-source">GitHub</a><a href="/LICENSE.txt">${esc(c.footerLicense)}</a><a href="/CHANGELOG.txt">${esc(c.footerVersion)} ${version}</a></div>${analytics ? `<details class="privacy-note"><summary>${esc(c.analyticsPrivacyTitle)}</summary><p>${esc(c.analyticsPrivacy)}</p><p>${esc(c.analyticsProcessing).replace("{days}", analytics.retentionDays)}</p></details>` : `<p class="privacy-note">${esc(c.footerPrivacy)}</p>`}</footer>
</body></html>`;
}

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "en"), { recursive: true });
await cp(path.join(root, "public"), out, { recursive: true });
await writeSocial(new URL("../dist/", import.meta.url));
await cp(
  path.join(root, "../hub/dist/tokens.css"),
  path.join(out, "tokens.css"),
);
// System theme inherits the exact dark token declarations, never a second palette.
const runtime = await readFile(path.join(out, "tokens.css"), "utf8");
const light = runtime.match(/:root \{([\s\S]*?)\n\}/)[1];
const dark = runtime.match(/\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1];
await writeFile(
  path.join(out, "theme.css"),
  '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {' +
    dark +
    "\n} }\n@media print { :root, [data-theme=dark] {" +
    light +
    "\n} }\n",
);
for (const lang of ["de", "en"]) {
  await writeFile(
    path.join(out, lang === "de" ? "index.html" : "en/index.html"),
    page(lang),
  );
  for (const guide of guides) {
    const destination = path.join(out, guide[lang].path);
    await mkdir(destination, {recursive:true});
    await writeFile(path.join(destination, 'index.html'), page(lang, guide));
  }
  const c = content[lang];
  const checklist = `# kebabstack — ${lang === "de" ? "Pilot-Checkliste" : "Pilot checklist"}\n\n${c.roadmap.map((r) => `**${r[0]}** — ${r[1]}`).join("\n\n")}\n\n${c.pilot.map((p) => `## ${p[0]}\n\n- [ ] ${p[1]}`).join("\n\n")}\n\n## ${c.costHeading}\n\n${c.costParts.join(" + ")}\n\n${c.costNote}\n\n${c.engineNote}\n\n${c.buildNote}\n\nhttps://kebabstack.dev${lang === "en" ? "/en/" : "/"}\n`;
  await writeFile(path.join(out, `pilot-${lang}.md`), checklist);
}
await cp(path.join(root, "../LICENSE"), path.join(out, "LICENSE.txt"));
await cp(path.join(root, "CHANGELOG.md"), path.join(out, "CHANGELOG.txt"));
await writeFile(
  path.join(out, "robots.txt"),
  "User-agent: *\nAllow: /\nSitemap: https://kebabstack.dev/sitemap.xml\n",
);
await writeFile(
  path.join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${[{de:{path:'/'},en:{path:'/en/'}},...guides].map(g => ['de','en'].map(lang => `<url><loc>${origin + g[lang].path}</loc>${['de','en','x-default'].map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${origin + g[l === 'x-default' ? 'de' : l].path}"/>`).join('')}</url>`).join('')).join('')}</urlset>\n`,
);
await writeFile(
  path.join(out, "404.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>404 · kebabstack</title><link rel="icon" href="/favicon.svg"><script src="/theme.js"></script><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/styles.css"></head><body><main class="not-found shell"><a class="brand" href="/">${logo()}</a><p class="eyebrow">404</p><h1>Nothing on this skewer.</h1><p>${content.de.notFound} / ${content.en.notFound}</p><a class="button button-primary" href="/">${content.de.backHome} ${arrow}</a><a class="text-link" href="/en/">${content.en.backHome} ↗</a></main></body></html>`,
);
console.log(`Built kebabstack website ${version}: 8 bilingual pages → dist/`);

if (analytics) {
  const headers = await readFile(path.join(out, '_headers'), 'utf8');
  await writeFile(path.join(out, '_headers'), headers
    .replace("script-src 'self'", `script-src 'self' ${analytics.tracker}`)
    .replace("connect-src 'none'", `connect-src ${analytics.endpoint}`));
}
