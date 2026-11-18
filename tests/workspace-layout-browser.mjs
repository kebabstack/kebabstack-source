// Use installed Chrome and Playwright (or set KEBAB_PLAYWRIGHT_MODULE, as in the Doku browser checks).
// Run from the repository root with node tests/workspace-layout-browser.mjs.
import assert from 'node:assert/strict';
import {checkHubProfile} from '../hub/test/profile-browser.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.KEBAB_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});

function installFixture(app) {
  const user = {id:'qa', email:'qa@example.test', displayName:'QA operator', role:'admin', space:'team:1', spaceRole:[{owner:null}], orgName:'Example', aiOn:true};
  const space = {id:user.space, kind:'team', role:{owner:null}, name:'Example team', member:true, archived:false};
  const actor = {
    info:async () => ({orgName:user.orgName, hubId:'', hubSet:true}),
    whoami:async () => [user],
    listForms:async () => [],
    listSpaces:async () => [space],
    openSpace:async () => ({ok:true, token:'local-space'}),
    inbox:async () => [],
    listSources:async () => []
  };
  globalThis.__fakeBackend = actor;
  localStorage.setItem('ks-' + app + '-session', 'local-browser-fixture');
}

async function openApp(app, width, height) {
  const page = await browser.newPage({viewport:{width,height}});
  page.setDefaultTimeout(5000);
  // No remote traffic. Serve the application's actual modules, replacing only the agent transport.
  const host = app + '.example.test';
  await page.addInitScript(installFixture, app);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== host) return route.abort();
    const filename = url.pathname.slice(1) || 'index.html';
    if (app === 'crumbs' && filename === 'agent-bundle.js') {
      const body = `import {fixture} from './fixture.mjs';
        const {actor} = fixture();
        actor.info = async () => ({orgName:'Example', hubId:''});
        export const HttpAgent = {create:async () => ({})}, Actor = {createActor:() => actor};`;
      return route.fulfill({contentType:'text/javascript', body});
    }
    let source = 'dist/' + filename;
    if (filename === 'agent-bundle.js') source = 'test/agent-bundle.stub.js';
    if (app === 'crumbs' && filename === 'fixture.mjs') source = 'test/fixture.mjs';
    const asset = fileURLToPath(new URL('../' + app + '/' + source, import.meta.url));
    try {
      const body = await readFile(asset);
      const contentType = /\.m?js$/.test(filename) ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html';
      await route.fulfill({body, contentType});
    } catch { await route.abort(); }
  });
  const hashes = {forms:'', contracts:'#/inbox', crumbs:'#/settings/general'};
  await page.goto('https://' + host + '/' + hashes[app]);
  await page.locator('#layout').waitFor();
  return page;
}

async function checkPanel(page, opener, dialog, action, interact) {
  await opener.focus();
  await opener.press('Enter');
  await dialog.waitFor();
  assert(await dialog.evaluate(el => el.matches(':modal')), 'native modal is active');
  await interact();
  const bounds = await dialog.evaluate(el => ({
    top:el.getBoundingClientRect().top, bottom:el.getBoundingClientRect().bottom,
    viewport:innerHeight, excessWidth:el.scrollWidth-el.clientWidth,
    scrollRange:el.scrollHeight-el.clientHeight
  }));
  assert(bounds.top >= 0 && bounds.bottom <= bounds.viewport + 1, 'full panel fits the viewport');
  assert(bounds.excessWidth <= 1, 'fields and actions fit without horizontal scrolling');
  await action.scrollIntoViewIfNeeded();
  assert(await action.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && el.contains(document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2));
  }), 'action can be reached and hit after scrolling');
  if (bounds.scrollRange > 0) assert(await dialog.evaluate(el => el.scrollTop > 0), 'overflowing panel actually scrolls');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert(await opener.evaluate(el => document.activeElement === el), 'keyboard focus returns to the opener');
}

try {
  for (const [width,height] of [[320,568],[640,320],[1280,800]]) {
    const forms = await openApp('forms', width, height);
    const source = forms.locator('#impSrc');
    await checkPanel(forms, forms.locator('#importBtn'), forms.locator('#importModal'), forms.locator('#impCancel'), async () => {
      await forms.getByRole('button',{name:'Text outline'}).click();
      const guide = forms.locator('#impHelpT summary');
      assert(!await forms.locator('#impCopyPrompt').isVisible(), 'format details start collapsed');
      assert(await source.evaluate(el => {
        const dialog = el.closest('dialog'), field = el.getBoundingClientRect(), panel = dialog.getBoundingClientRect();
        const visible = Math.min(field.bottom,panel.bottom) - Math.max(field.top,panel.top);
        return dialog.scrollTop === 0 && visible >= 44;
      }), 'the source field is visible before users scroll or type');
      await guide.focus();
      await guide.press('Enter');
      assert(await forms.locator('#impCopyPrompt').isVisible(), 'expanded guide includes the copyable prompt');
      assert.match(await forms.locator('#impHelpT').innerText(), /\[scale 1-5\]/);
      await guide.press('Enter');
      await source.fill('# Requests\nWhat is needed? [paragraph]');
      await forms.getByRole('button',{name:'Analyze',exact:true}).click();
      assert(await forms.locator('#impCreate').isEnabled(), 'analyzed outline enables creation');
      await source.fill('');
      assert(await forms.locator('#impCreate').isDisabled(), 'changed source invalidates analysis');
    });
    await forms.close();

    const contracts = await openApp('contracts', width, height);
    await checkPanel(contracts, contracts.locator('#spaceCreate'), contracts.locator('#spaceModal'), contracts.locator('#spNewSave'), async () => {
      const field = contracts.getByLabel('Name', {exact:true});
      assert(await field.evaluate(el => document.activeElement === el));
      await field.fill('Purchasing');
    });
    await contracts.close();

    const crumbs = await openApp('crumbs', width, height);
    const timezone = crumbs.locator('#siteForm select[name=timezone]');
    await timezone.waitFor();
    assert(await timezone.evaluate(el => el.options.length > 20), 'real timezone choices are present');
    assert(await timezone.evaluate(el => {
      const form = el.closest('form').getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return rect.left >= form.left-1 && rect.right <= form.right+1 && document.documentElement.scrollWidth <= innerWidth+1;
    }), 'timezone and its form fit the available width');
    await crumbs.close();
  }
  await checkHubProfile(browser);
  console.log('Hub profile, photo crop, import, teamspace and website settings passed on desktop, narrow and short viewports.');
} finally {
  await browser.close();
}
