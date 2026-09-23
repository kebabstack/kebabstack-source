import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const html = readFileSync('kitchen/dist/index.html', 'utf8');
async function page(overrides = {}, authenticated = true, cookie = true) {
  const calls = [];
  const actor = { info: async () => ({ hubId: '', version: '0.6.0' }), cookResult: async () => [], myCook: async () => [], job: async () => [], cookWithCode: async code => { calls.push(code); return { ok: false, jobId: 0n, detail: 'invalid setup code' }; }, ...overrides };
  const dom = new JSDOM(html, { url: 'https://kitchen.test', runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  if (cookie) w.document.cookie = 'ic_env=' + encodeURIComponent('PUBLIC_CANISTER_ID:backend=aaaaa-aa');
  w.setInterval = () => 1; w.clearInterval = () => {};
  w.__agent = { HttpAgent: { create: async () => ({}) }, Actor: { createActor: () => actor }, AuthClient: { create: async () => ({ isAuthenticated: async () => authenticated, getIdentity: () => ({ getPrincipal: () => ({ toText: () => 'test-owner' }) }) }) } };
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*?;$/m, 'const { HttpAgent, Actor, AuthClient } = window.__agent;');
  w.eval(src);
  await new Promise(r => setTimeout(r, 20));
  return { w, calls, close: () => w.close() };
}
test('Kitchen: wrong code leaves a usable retry button', async () => {
  const p = await page();
  try {
    p.w.document.getElementById('setupCode').value = 'wrong';
    await p.w.document.getElementById('cook').onclick();
    assert.deepEqual(p.calls, ['wrong']);
    assert.equal(p.w.document.getElementById('cook').disabled, false);
    assert.match(p.w.document.getElementById('status').textContent, /invalid setup code/);
  } finally { p.close(); }
});
test('Kitchen: already cooked stack recovers its claim link after reload', async () => {
  const p = await page({ info: async () => ({ hubId: 'hub-id' }), cookResult: async () => [{ hubUrl: 'https://hub.test', claimCode: 'private-code', jobId: 1n }] });
  try {
    assert.equal(p.w.document.getElementById('cardDone').classList.contains('hidden'), false);
    assert.equal(p.w.document.getElementById('openHub').href, 'https://hub.test/#claim=private-code');
    assert.equal(p.w.document.getElementById('cook').disabled, true);
  } finally { p.close(); }
});
test('Kitchen: running job is recovered with the same login', async () => {
  const j = { id: 1n, state: 'running', steps: [{ name: 'create hub', status: 'run', detail: '' }] };
  const p = await page({ myCook: async () => [j], job: async () => [j] });
  try { assert.match(p.w.document.getElementById('steps').textContent, /create hub/); assert.equal(p.w.document.getElementById('cook').disabled, true); }
  finally { p.close(); }
});
test('Kitchen: missing canister configuration produces a visible error', async () => {
  const p = await page({}, false, false);
  try { assert.match(p.w.document.getElementById('status').textContent, /cannot find/); await p.w.document.getElementById('signin').onclick(); assert.match(p.w.document.getElementById('status').textContent, /not ready/); }
  finally { p.close(); }
});
