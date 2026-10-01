import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const css = readFileSync(new URL('../src/polish.css', import.meta.url), 'utf8');
test('overdrive and God Candle feedback never hide the game body', () => {
  const dom = new JSDOM(`<style>${css}</style><body data-mode="3d"><div class="surge"></div><main>Flight</main></body>`);
  const { document, getComputedStyle } = dom.window;
  for (const mode of ['2d', '3d']) {
    document.body.dataset.mode = mode;
    for (const state of ['is-playing', 'is-playing surge', 'is-playing surge god-candle-active', 'is-playing overdrive-active']) {
      document.body.className = state;
      const style = getComputedStyle(document.body);
      assert.ok(style.opacity === '' || Number(style.opacity) === 1, `${mode}: ${state} faded the entire game to ${style.opacity}`);
      assert.notEqual(style.position, 'fixed', `${mode}: ${state} applied overlay layout to the game body`);
      assert.equal(getComputedStyle(document.querySelector('body > .surge')).pointerEvents, 'none');
    }
  }
  dom.window.close();
});
