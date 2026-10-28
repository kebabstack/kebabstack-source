import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import { guides } from "../src/guides.mjs";
import { traffic, sum } from "../src/scenarios.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const script = await readFile(path.join(dist, "app.js"), "utf8");
const load = async (lang, hash = "") => {
  const html = await readFile(
    path.join(dist, lang === "de" ? "index.html" : "en/index.html"),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: `https://kebabstack.dev/${lang === "en" ? "en/" : ""}${hash}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  return dom;
};

for (const lang of ["de", "en"]) {
  test(`${lang}: complete static fallback, metadata, downloadable files and local links`, async () => {
    const dom = await load(lang),
      d = dom.window.document;
    assert.equal(d.documentElement.lang, lang);
    assert.equal(d.querySelectorAll("h1").length, 1);
    assert.equal(d.querySelectorAll(".module-panel:not([hidden])").length, 10);
    assert.equal(d.querySelectorAll(".faq-list details").length, 7);
    const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "unique anchor/control ids");
    assert.equal(
      d.querySelector("link[rel=canonical]").href,
      `https://kebabstack.dev/${lang === "en" ? "en/" : ""}`,
    );
    assert.match(d.querySelector(".roadmap").textContent, /Alpha/);
    assert.match(d.querySelector(".roadmap").textContent, /Coming soon/);
    assert.match(
      d.querySelector("#app-phone .alpha-label").textContent,
      /GEPLANT|PLANNED/,
    );
    assert.match(
      d.querySelector("#app-phone figcaption").textContent,
      /geplant|planned/,
    );
    assert.match(
      d.querySelector("#app-crumbs .module-boundary").textContent,
      /Collector|collector/,
    );
    assert.match(
      d.querySelector("#app-desk").textContent,
      /Rufbereitschaft|on-call/,
    );
    assert.equal(
      d.querySelectorAll("script:not([src]), [onclick], [style]").length,
      0,
      "strict CSP needs no inline code or styles",
    );
    for (const el of d.querySelectorAll("a[href],link[href],script[src]")) {
      const ref = el.getAttribute("href") || el.getAttribute("src");
      if (ref.startsWith("#")) {
        assert.ok(d.getElementById(ref.slice(1)), `anchor ${ref}`);
        continue;
      }
      if (!ref.startsWith("/")) continue;
      let local = path.join(dist, ref);
      if ((await stat(local)).isDirectory())
        local = path.join(local, "index.html");
      assert.ok((await stat(local)).isFile(), ref);
    }
    const checklist = await readFile(
      path.join(dist, `pilot-${lang}.md`),
      "utf8",
    );
    assert.equal((checklist.match(/- \[ \]/g) || []).length, 3);
    assert.match(checklist, /Alpha/);
    dom.window.close();
  });

  test(`${lang}: explorer selection, deep links and keyboard navigation`, async () => {
    const dom = await load(lang, "#app-contracts"),
      w = dom.window,
      d = w.document;
    w.eval(script);
    const selected = () => d.querySelector("[role=tab][aria-selected=true]");
    const visible = () =>
      [...d.querySelectorAll("[role=tabpanel]")].filter((e) => !e.hidden);
    assert.equal(selected().id, "tab-contracts");
    assert.equal(visible().length, 1);
    assert.equal(visible()[0].id, "app-contracts");
    const desk = d.getElementById("tab-desk");
    desk.click();
    assert.equal(visible()[0].id, "app-desk");
    assert.equal(w.location.hash, "#app-desk");
    desk.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(selected().id, "tab-knowledge");
    assert.equal(d.activeElement.id, "tab-knowledge");
    selected().dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    assert.equal(selected().id, "tab-phone");
    selected().dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(selected().id, "tab-hub");
    assert.equal(
      [...d.querySelectorAll("[role=tab]")].filter((e) => e.tabIndex === 0)
        .length,
      1,
    );
    dom.window.close();
  });

  test(`${lang}: mobile menu opens, closes on Escape and restores focus`, async () => {
    const dom = await load(lang),
      w = dom.window,
      d = w.document;
    w.eval(script);
    const toggle = d.querySelector(".menu-toggle"),
      menu = d.getElementById("mobile-nav");
    assert.equal(toggle.hidden, false);
    toggle.click();
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(menu.hidden, false);
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.equal(menu.hidden, true);
    assert.equal(d.activeElement, toggle);
    toggle.click();
    menu.querySelector("a").click();
    assert.equal(menu.hidden, true);
    dom.window.close();
  });
}

test("public package contains only intended website files, preserves MIT and declares the intended domain", async () => {
  const walk = async (dir, prefix = "") => {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (entry.isDirectory())
        result.push(...(await walk(path.join(dir, entry.name), rel + "/")));
      else result.push(rel);
    }
    return result;
  };
  assert.deepEqual(
    (await walk(dist)).sort(),
    [
      ".well-known/ic-domains", ".htaccess",
      "404.html",
      "CHANGELOG.txt",
      "LICENSE.txt",
      "_headers",
      "app.js",

      "en/index.html",
      "favicon.svg",
      "index.html",
      "pilot-de.md",
      "pilot-en.md",
      "robots.txt",
      "sitemap.xml",
      "social.png",
      ...guides.flatMap(g => ["de", "en"].map(l => g[l].path.slice(1) + "index.html")),
      "styles.css",
      "tokens.css",
      "theme.css",
      "theme.js",
    ].sort(),
  );
  assert.equal(
    await readFile(path.join(dist, "LICENSE.txt"), "utf8"),
    await readFile(path.join(root, "../LICENSE"), "utf8"),
  );
  assert.equal(
    await readFile(path.join(dist, ".well-known/ic-domains"), "utf8"),
    "kebabstack.dev\n",
  );
  const { version } = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  const recipe = await readFile(path.join(root, "icp.yaml"), "utf8");
  assert.equal(recipe.match(/name: service:version\s+value: "([^"]+)"/)?.[1], version,
    "deployed Wasm metadata must match the website package version");
  for (const filename of ["README.md", "INSTALL.md", "CHANGELOG.md"])
    assert.ok((await readFile(path.join(root, filename), "utf8")).includes(version),
      `${filename} must describe this website release`);
  for (const file of ["index.html", "en/index.html"])
    assert.ok(
      (await readFile(path.join(dist, file), "utf8")).includes(
        `content="${version}"`,
      ),
    );
});

test("rendered identity and runtime tokens are the canonical suite sources", async () => {
  assert.equal(
    await readFile(path.join(dist, "tokens.css"), "utf8"),
    await readFile(path.join(root, "../hub/dist/tokens.css"), "utf8"),
  );
  const brand = JSON.parse(
    await readFile(path.join(root, "../design/brand/registry.json"), "utf8"),
  );
  const html = await readFile(path.join(dist, "index.html"), "utf8");
  assert.ok(
    html.includes(`<svg viewBox="${brand.viewBox}">${brand.geometry}</svg>`),
  );
  const logos = JSON.parse(
    await readFile(path.join(root, "../design/logos/registry.json"), "utf8"),
  );
  for (const app of [
    "hub",
    "desk",
    "assets",
    "trust",
    "contracts",
    "forms",
    "watch",
    "crumbs",
    "phone",
    "kitchen",
    "vault",
    "bug",
    "kebab-mcp",
  ])
    assert.ok(html.includes(logos.apps[app].path), app);
});

test("analytics examples agree across daily counts, totals, rate and sequential funnel", () => {
  for (const p of traffic) {
    assert.equal(p.visits.length, 7);
    for (let i = 0; i < 7; i++) {
      assert.ok(p.visitors[i] <= p.visits[i] && p.visits[i] <= p.views[i]);
      assert.ok(p.bounces[i] >= 0 && p.bounces[i] <= p.visits[i]);
    }
    assert.equal(sum(p.channels.map(row => row[1])), sum(p.visits));
    assert.equal(sum(p.channels.map(row => row[2])), p.funnel[2]);
    assert.ok(p.funnel[0] <= sum(p.visitors));
    assert.ok(p.funnel[2] <= p.funnel[1] && p.funnel[1] <= p.funnel[0]);
  }
  assert.equal(sum(traffic[0].visits), 1200);
  assert.equal(sum(traffic[0].views), 1920);
  assert.equal(sum(traffic[0].bounces) / sum(traffic[0].visits), 0.3);
  assert.equal(sum(traffic[1].visits), 1000);
  assert.equal(sum(traffic[1].views), 1500);
  assert.equal(sum(traffic[1].bounces) / sum(traffic[1].visits), 0.4);
});

for (const lang of ["de", "en"])
  test(`${lang}: walkthrough decisions, analytics selection, theme and unrelated anchors preserve context`, async () => {
    const dom = await load(lang),
      w = dom.window,
      d = w.document;
    w.eval(script);
    assert.equal(
      d.querySelector("[role=tab][aria-selected=true]").id,
      "tab-desk",
    );
    assert.equal(d.querySelector("#desk-0").hidden, false);
    assert.match(
      d.querySelector("#desk-0").textContent,
      /bestätigt den Austritt|confirms the departure/,
    );
    d.querySelector('[data-scene="desk-1"]').click();
    assert.equal(d.querySelector("#desk-0").hidden, true);
    assert.equal(d.querySelector("#desk-1").hidden, false);
    d.querySelector('[data-scene="desk-2"]').click();
    assert.match(
      d.querySelector("#desk-2").textContent,
      /verhindern den Abschluss|prevent completion/,
    );
    d.getElementById("tab-crumbs").click();
    d.querySelector('[data-scene="traffic-previous"]').click();
    assert.equal(d.querySelector("#traffic-previous").hidden, false);
    assert.equal(d.querySelector("#traffic-current").hidden, true);
    assert.match(d.querySelector("#traffic-previous").textContent, /40%/);
    w.history.replaceState(null, "", "#engine");
    w.dispatchEvent(new w.HashChangeEvent("hashchange"));
    assert.equal(
      d.querySelector("[role=tab][aria-selected=true]").id,
      "tab-crumbs",
    );
    const theme = d.querySelector("#theme-choice");
    theme.value = "dark";
    theme.dispatchEvent(new w.Event("change"));
    assert.equal(d.documentElement.dataset.theme, "dark");
    assert.equal(d.querySelector("[data-theme-choice]").value, "dark");
    theme.value = "system";
    theme.dispatchEvent(new w.Event("change"));
    assert.equal(d.documentElement.hasAttribute("data-theme"), false);
    assert.equal(w.localStorage.length, 1);
    dom.window.close();
  });

test('website interactions do not collect analytics', async () => {
  const headers = await readFile(path.join(dist, '_headers'), 'utf8');
  assert.match(headers, /connect-src 'none'/);
  await assert.rejects(stat(path.join(dist, 'analytics.js')), {code:'ENOENT'});
  for (const lang of ['de','en']) {
    const dom = await load(lang), w = dom.window, d = w.document, calls = [];
    try {
      w.fetch = (...args) => { calls.push(args); throw new Error('Unexpected network request'); };
      w.navigator.sendBeacon = (...args) => { calls.push(args); return false; };
      w.eval(script);
      d.getElementById('tab-desk').click();
      assert.equal(d.querySelectorAll('[data-crumbs-event], [data-tracker], [data-endpoint]').length, 0);
      for (const tag of d.querySelectorAll('script[src]')) assert.equal(new URL(tag.src).origin, 'https://kebabstack.dev');
      assert.equal(calls.length, 0);
      assert.equal(d.cookie, '');
    } finally { w.close(); }
  }
});

test('every guide is crawlable, translated, linked and readable without JavaScript', async () => {
  const sitemap = new JSDOM(await readFile(path.join(dist, 'sitemap.xml'), 'utf8'), {contentType:'application/xml'});
  const locations = [...sitemap.window.document.querySelectorAll('loc')].map(el => el.textContent);
  assert.equal(locations.length, 8); assert.equal(new Set(locations).size, 8);
  const titles = new Set(), descriptions = new Set();
  for (const guide of guides) for (const lang of ['de', 'en']) {
    const url = 'https://kebabstack.dev' + guide[lang].path;
    const dom = new JSDOM(await readFile(path.join(dist, guide[lang].path, 'index.html'), 'utf8'), {url,runScripts:'outside-only'}), d = dom.window.document;
    assert.equal(d.documentElement.lang, lang);
    assert.equal(d.querySelectorAll('h1').length, 1);
    assert.equal(d.querySelector('link[rel=canonical]').href, url);
    assert.equal(d.querySelector('meta[property="og:url"]').content, url);
    assert.ok(locations.includes(url));
    assert.ok(d.querySelector('article').textContent.length > 1800, 'substantive visible content');
    titles.add(d.title); descriptions.add(d.querySelector('meta[name=description]').content);
    for (const l of ['de','en']) {
      assert.equal(d.querySelector(`link[hreflang=${l}]`).href, 'https://kebabstack.dev' + guide[l].path);
      assert.equal(d.querySelector(`.language-switch a[lang=${l}]`).pathname, guide[l].path);
    }
    assert.ok(d.querySelector('[itemtype="https://schema.org/BreadcrumbList"]'));
    assert.ok(d.querySelector('[itemtype="https://schema.org/SoftwareApplication"]'));
    assert.equal(d.querySelectorAll('script:not([src]),[onclick],[style]').length, 0);
    const home = await load(lang);
    assert.ok(home.window.document.querySelector(`a[href="${guide[lang].path}"]`), 'linked from homepage');
    home.window.close();
    for (const link of d.querySelectorAll('a[href],link[href],script[src]')) {
      const target = new URL(link.href || link.src, url);
      if (target.origin !== 'https://kebabstack.dev') continue;
      let file = path.join(dist, target.pathname);
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      if (target.hash) {
        const destination = new JSDOM(await readFile(file,'utf8'));
        assert.ok(destination.window.document.getElementById(target.hash.slice(1)), target.href);
        destination.window.close();
      }
    }
    dom.window.matchMedia = () => ({matches:false,addEventListener(){}});
    dom.window.eval(script); // shared enhancement must also work without an explorer
    assert.ok(d.querySelector('h1').textContent);
    dom.window.close();
  }
  assert.equal(titles.size, 6); assert.equal(descriptions.size, 6);
  const robots = await readFile(path.join(dist,'robots.txt'),'utf8');
  assert.match(robots,/User-agent: \*\nAllow: \//); assert.match(robots,/Sitemap: https:\/\/kebabstack.dev\/sitemap.xml/);
  const png = await readFile(path.join(dist,'social.png'));
  assert.equal(png.readUInt32BE(16),1200); assert.equal(png.readUInt32BE(20),630);
  sitemap.window.close();
});
