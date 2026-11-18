// Exercise the real Hub console using the local sample actor and an in-memory photo.
import assert from 'node:assert/strict';
import {once} from 'node:events';

export async function checkHubProfile(browser) {
  // macOS WebKit uses Option+Tab to navigate buttons with its default keyboard settings.
  const nextControl = browser.browserType().name() === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  const savedPort = process.env.HUB_PREVIEW_PORT;
  process.env.HUB_PREVIEW_PORT = '0';
  const {previewServer} = await import('../tools/preview-ux.mjs');
  if (savedPort === undefined) delete process.env.HUB_PREVIEW_PORT;
  else process.env.HUB_PREVIEW_PORT = savedPort;
  if (!previewServer.listening) await once(previewServer, 'listening');
  const origin = 'http://127.0.0.1:' + previewServer.address().port;
  try {
    for (const [width,height] of [[320,568],[640,320],[1280,800]]) {
      const page = await browser.newPage({viewport:{width,height}});
      page.setDefaultTimeout(5000);
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      try {
        await page.goto(origin);
        const account = page.locator('#cTopbar .ks-ident');
        await account.focus(); await account.press('Enter');
        await page.locator('#cYouBtn').press('Enter');
        const profile = page.getByRole('dialog',{name:'Your profile',exact:true});
        await profile.waitFor();
        assert(await profile.evaluate(el => el.matches(':modal') && el.contains(document.activeElement)));
        await page.keyboard.press(nextControl);
        assert(await page.locator('#youAviUpload').evaluate(el => el === document.activeElement), 'keyboard reaches the photo action in the profile');
        await page.locator('#youCopyKey').scrollIntoViewIfNeeded();
        assert(await page.locator('#youCopyKey').evaluate(el => {
          const rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }), 'key action is reachable');

        const data = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width=32; canvas.height=32;
          canvas.getContext('2d').fillRect(0,0,32,32);
          return canvas.toDataURL().split(',')[1];
        });
        const file = {name:'profile.png', mimeType:'image/png', buffer:Buffer.from(data,'base64')};
        await page.locator('#youAviUpload').focus();
        await page.locator('#youAviFile').setInputFiles(file);
        const crop = page.getByRole('dialog',{name:'Position your photo',exact:true});
        await crop.waitFor();
        assert(await crop.evaluate(el => el.matches(':modal') && el.scrollWidth === el.clientWidth));
        await page.keyboard.press('Escape');
        await crop.waitFor({state:'hidden'});
        await page.waitForFunction(() => document.activeElement.id === 'youAviUpload');
        assert(await profile.isVisible(), 'cancelling a crop leaves the profile open');

        await page.locator('#youAviFile').setInputFiles(file);
        await crop.waitFor();
        await crop.getByRole('slider',{name:'Photo zoom'}).press('ArrowRight');
        await crop.getByRole('button',{name:'Save',exact:true}).click();
        await crop.waitFor({state:'hidden'});
        await page.locator('#youBig img').waitFor();
        await page.locator('#youAviRemove').click();
        await page.locator('#youBig img').waitFor({state:'detached'});
        await page.keyboard.press('Escape');
        await profile.waitFor({state:'hidden'});
        assert(await account.evaluate(el => el === document.activeElement), 'profile returns to the visible account button');
      } finally { await page.close(); }
    }
  } finally { await new Promise(resolve => previewServer.close(resolve)); }
}
