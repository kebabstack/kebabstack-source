import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';

const controller = createIdentity('review-controller').getPrincipal();
const owner = createIdentity('review-owner').getPrincipal();
const helpdesk = createIdentity('review-helpdesk').getPrincipal();
const member = createIdentity('review-member').getPrincipal();
const stranger = createIdentity('review-stranger').getPrincipal();
const setupCode = 'ab'.repeat(32);
let server;
before(async () => { server = await PocketIcServer.start(); });
after(async () => { await server?.stop(); });

const candidateWasm = module => process.env.KEBAB_TEST_WASM_DIR ? resolve(process.env.KEBAB_TEST_WASM_DIR, module, 'backend.wasm') : resolve(module, 'backend/dist/backend.wasm');

async function install(pic, module, options = {}) {
  const code = execFileSync('python3', ['sdk/tools/did2idl.py', `${module}/backend/dist/backend.did`], { encoding: 'utf8' });
  const { idlFactory } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const wasm = candidateWasm(module);
  return { ...(await pic.setupCanister({ sender: controller, controllers: [controller], wasm, idlFactory, ...options })), idlFactory };
}

async function initialized(pic, options = {}) {
  const fixture = await install(pic, 'hub', { environmentVariables: [{ name: 'KEBAB_CLAIM_CODE', value: setupCode }], ...options });
  const hub = fixture.actor;
  hub.setPrincipal(owner);
  assert.equal((await hub.claimHubWithCode(setupCode, { orgName: 'Test company', displayName: 'Owner', email: 'owner@example.test' })).ok, true);
  for (const [email, principal] of [['helpdesk@example.test', helpdesk], ['member@example.test', member]]) {
    hub.setPrincipal(owner);
    assert.equal(await hub.addLocalUser(email, email, '', ''), true);
    const invite = await hub.createInvite(email);
    hub.setPrincipal(principal);
    assert.equal(await hub.claimInvite(invite[0]), true);
  }
  hub.setPrincipal(owner);
  assert.equal((await hub.setPersonRole('helpdesk@example.test', 'helpdesk')).ok, true);
  return fixture;
}

// Existing app regressions opt into a central policy explicitly. Watch's old
// read-only fixture grants Viewer; the central-permissions matrix tests its No access default.
async function connectTestApp(hub, args) {
  const c = await hub.connectApp(args);
  const app = args.name.toLowerCase();
  if (c.ok && ['assets','contracts','desk','forms','trust','watch'].includes(app)) {
    const r = await hub.setAppPermissions(c.id, 0n, {app,defaultRole:app==='watch'?'viewer':'member',people:[],groups:[]});
    assert.equal(r.ok,true,r.detail);
  }
  return c;
}

test('an unconfigured hub cannot be claimed by a stranger', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor } = await install(pic, 'hub');
    actor.setPrincipal(stranger);
    const result = await actor.claimHub({ orgName: 'Taken over', displayName: 'Stranger', email: 'stranger@example.test' });
    assert.equal(result.ok, false, 'a public URL must not grant ownership');
  } finally { await pic.tearDown(); }
});

test('helpdesk cannot mint an invitation to the owner identity', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    hub.setPrincipal(helpdesk);
    assert.deepEqual(await hub.createInvite('owner@example.test'), [], 'an invitation must not bypass the role hierarchy');
  } finally { await pic.tearDown(); }
});

test('exclusion filters apply to ticket access as well as directory visibility', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    const app = await install(pic, 'watch');
    const connector = await hub.connectApp({ name: 'Watch', canisterId: app.canisterId.toText(), note: '', lanes: ['identity', 'roles'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'Watch', kind: 'app', url: 'https://watch.example.test' }] });
    assert.equal(connector.ok, true);
    assert.equal(await hub.setUserProfile('member@example.test', [['department', 'Blocked']]), true);
    assert.equal(await hub.setConnectorFilters(connector.id, ['department=Blocked']), true);
    hub.setPrincipal(member);
    const ticket = await hub.mintAppTicket('', connector.tileId);
    assert.equal(ticket.ok, false, 'a filtered person must not receive an app ticket');
  } finally { await pic.tearDown(); }
});

test('removing app access invalidates a cached session after a full directory refresh', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub, canisterId } = await initialized(pic);
    const { actor: app, canisterId: appId } = await install(pic, 'watch');
    app.setPrincipal(controller);
    await app.setHub(canisterId.toText());
    const connector = await connectTestApp(hub, { name: 'Watch', canisterId: appId.toText(), note: '', lanes: ['identity', 'roles'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'Watch', kind: 'app', url: 'https://watch.example.test' }] });
    hub.setPrincipal(member);
    const ticket = await hub.mintAppTicket('', connector.tileId);
    assert.equal(ticket.ok, true);
    const session = (await app.loginWithTicket(ticket.ticket))[0];
    assert.ok(session);
    assert.equal((await app.whoami(session.token)).length, 1);
    hub.setPrincipal(owner);
    assert.equal((await hub.setAppPermissions(connector.id, 1n, { app:'watch', defaultRole:'none', people:[], groups:[] })).ok,true);
    const adminTicket = await hub.mintAppTicket('', connector.tileId);
    const adminSession = (await app.loginWithTicket(adminTicket.ticket))[0];
    assert.ok(adminSession);
    const refreshed = await app.syncNow(adminSession.token);
    assert.equal(refreshed.ok, true);
    assert.deepEqual(await app.whoami(session.token), [], 'a removed person must not remain active in the directory cache');
  } finally { await pic.tearDown(); }
});

for (const module of ['desk', 'assets', 'watch', 'trust', 'forms', 'bug', 'contracts']) {
  test(`${module}: cached access expires within 60 seconds if the Hub stops`, async () => {
    const pic = await PocketIc.create(server.getUrl());
    try {
      const { actor: hub, canisterId: hubId } = await initialized(pic);
      const { actor: app, canisterId: appId } = await install(pic, module);
      app.setPrincipal(controller);
      await app.setHub(hubId.toText());
      const c = await connectTestApp(hub, { name: module, canisterId: appId.toText(), note: '', lanes: ['identity', 'roles', 'groups'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: module, kind: 'app', url: `https://${module}.example.test` }] });
      hub.setPrincipal(member);
      const t = await hub.mintAppTicket('', c.tileId);
      const session = (await app.loginWithTicket(t.ticket))[0];
      assert.ok(session);
      assert.equal((await app.whoami(session.token)).length, 1);
      await pic.stopCanister({ sender: controller, canisterId: hubId });
      await pic.advanceTime(60_000);
      await pic.tick();
      assert.deepEqual(await app.whoami(session.token), []);
    } finally { await pic.tearDown(); }
  });
}

test('setup code refuses a wrong code and cannot claim an already initialized Hub', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await install(pic, 'hub', { environmentVariables: [{ name: 'KEBAB_CLAIM_CODE', value: setupCode }] });
    hub.setPrincipal(stranger);
    const args = { orgName: 'Example', displayName: 'Owner', email: 'owner@example.test' };
    assert.equal((await hub.claimHubWithCode('wrong', args)).ok, false);
    assert.equal((await hub.claimHub(args)).ok, false);
    hub.setPrincipal(owner);
    assert.equal((await hub.claimHubWithCode(setupCode, args)).ok, true);
    hub.setPrincipal(stranger);
    assert.equal((await hub.claimHubWithCode(setupCode, args)).ok, false);
  } finally { await pic.tearDown(); }
});

test('Kitchen refuses an open cook and a wrong setup code', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor } = await install(pic, 'kitchen', { environmentVariables: [{ name: 'KEBAB_SETUP_CODE', value: setupCode }] });
    actor.setPrincipal(stranger);
    assert.equal((await actor.cook()).ok, false);
    assert.equal((await actor.cookWithCode('wrong')).ok, false);
  } finally { await pic.tearDown(); }
});

test('an owner may grant AI access but an admin cannot grant the company credential', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await hub.setPersonRole('helpdesk@example.test', 'admin');
    const { canisterId: appId } = await install(pic, 'watch');
    const c = await connectTestApp(hub, { name: 'Watch', canisterId: appId.toText(), note: '', lanes: ['identity'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [] });
    hub.setPrincipal(helpdesk);
    assert.equal((await hub.setConnectorLanes(c.id, ['identity', 'AI'])).ok, false);
    hub.setPrincipal(owner);
    assert.equal((await hub.setConnectorLanes(c.id, ['identity', 'ai'])).ok, true);
  } finally { await pic.tearDown(); }
});

test('invites remain usable for members, single-use, and cannot rebind a linked login', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await hub.addLocalUser('new@example.test', 'New person', '', '');
    const [code] = await hub.createInvite('new@example.test');
    hub.setPrincipal(member);
    assert.equal(await hub.claimInvite(code), false);
    hub.setPrincipal(stranger);
    assert.equal(await hub.claimInvite(code), true);
    assert.equal(await hub.claimInvite(code), false);
  } finally { await pic.tearDown(); }
});

// Mock the provider transport but execute parsing, JWKS selection, RSA verification
// and session creation in the real Hub Wasm. Node generates independent RSA fixtures.
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { CanisterCyclesCostSchedule, SubnetStateType } from '@dfinity/pic';
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
const verifier = 'v'.repeat(64);
function jwt(claims, tamper = false) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(input), rsa.privateKey);
  if (tamper) signature[0] ^= 1;
  return input + '.' + signature.toString('base64url');
}
async function answerOutcall(pic, body) {
  for (let i = 0; i < 30; i++) {
    await pic.tick(2);
    const [r] = await pic.getPendingHttpsOutcalls();
    if (r) {
      await pic.mockPendingHttpsOutcall({ requestId: r.requestId, subnetId: r.subnetId, response: { type: 'success', statusCode: 200, headers: [], body: Buffer.from(JSON.stringify(body)) } });
      return r;
    }
  }
  assert.fail('expected HTTPS outcall');
}
for (const scenario of ['valid', 'tampered signature', 'wrong nonce', 'unverified email', 'expired']) {
  test(`SSO: ${scenario}`, async () => {
    const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
    try {
      const { actor: hub, canisterId, idlFactory } = await initialized(pic);
      const provider = await hub.addSsoProvider({ name: 'Test provider', kind: 'google', issuer: '', clientId: 'test-client', clientSecret: 'test-secret' });
      const seconds = Math.floor((await pic.getTime()) / 1000);
      const claims = { iss: 'https://accounts.google.com', aud: 'test-client', sub: '123', iat: seconds, exp: seconds + 3600, email: 'member@example.test', email_verified: scenario !== 'unverified email', nonce: scenario === 'wrong nonce' ? 'wrong' : createHash('sha256').update(verifier).digest('base64url') };
      if (scenario === 'expired') claims.exp = seconds - 1;
      const defer = pic.createDeferredActor(idlFactory, canisterId);
      const result = await defer.ssoExchange(provider.id, 'code', 'https://hub.example.test', verifier);
      await answerOutcall(pic, { id_token: jwt(claims, scenario === 'tampered signature') });
      const keysCall = await answerOutcall(pic, { keys: [jwk] });
      assert.match(keysCall.url, /googleapis.com\/oauth2\/v3\/certs/);
      const r = await result();
      assert.equal(r.ok, scenario === 'valid', r.detail);
      if (r.ok) assert.equal((await hub.ssoWhoami(r.token))[0].email, 'member@example.test');
    } finally { await pic.tearDown(); }
  });
}

// Okta's org authorization server returns a "thin" ID token in the code flow — email_verified is
// only served by /userinfo. The hub must look it up there (bound to sub + address) instead of refusing.
for (const scenario of ['thin token, userinfo verifies', 'thin token, userinfo says unverified', 'thin token, userinfo for another subject', 'thin token, userinfo with another address', 'explicit email_verified false']) {
  test(`SSO Okta: ${scenario}`, async () => {
    const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
    try {
      const { actor: hub, canisterId, idlFactory } = await initialized(pic);
      const issuer = 'https://acme.okta.test';
      const provider = await hub.addSsoProvider({ name: 'Sign in with Okta', kind: 'okta', issuer, clientId: 'okta-client', clientSecret: 's3cret' });
      assert.equal(provider.ok, true, provider.detail);
      const seconds = Math.floor((await pic.getTime()) / 1000);
      const claims = { iss: issuer, aud: 'okta-client', sub: '00u123', iat: seconds, exp: seconds + 3600, email: 'member@example.test', nonce: createHash('sha256').update(verifier).digest('base64url') };
      if (scenario === 'explicit email_verified false') claims.email_verified = false;
      const defer = pic.createDeferredActor(idlFactory, canisterId);
      const result = await defer.ssoExchange(provider.id, 'code', 'https://hub.example.test', verifier);
      await answerOutcall(pic, { id_token: jwt(claims), access_token: 'at-1', token_type: 'Bearer' });
      const keysCall = await answerOutcall(pic, { keys: [jwk] });
      assert.match(keysCall.url, /acme\.okta\.test\/oauth2\/v1\/keys/);
      if (scenario !== 'explicit email_verified false') {
        const info = { sub: '00u123', email: 'member@example.test', email_verified: true };
        if (scenario === 'thin token, userinfo says unverified') info.email_verified = false;
        if (scenario === 'thin token, userinfo for another subject') info.sub = '00u999';
        if (scenario === 'thin token, userinfo with another address') info.email = 'other@example.test';
        const uiCall = await answerOutcall(pic, info);
        assert.match(uiCall.url, /acme\.okta\.test\/oauth2\/v1\/userinfo/);
        assert.ok(uiCall.headers.some((h) => String(h.name ?? h[0]).toLowerCase() === 'authorization' && (h.value ?? h[1]) === 'Bearer at-1'), 'userinfo is fetched with the access token');
      }
      const r = await result();
      assert.equal(r.ok, scenario === 'thin token, userinfo verifies', r.detail);
      if (r.ok) assert.equal((await hub.ssoWhoami(r.token))[0].email, 'member@example.test');
      if (scenario === 'explicit email_verified false') assert.match(r.detail, /must verify/);
      if (scenario === 'thin token, userinfo for another subject') assert.match(r.detail, /subject/);
    } finally { await pic.tearDown(); }
  });
}

for (const module of ['desk', 'assets', 'watch', 'trust', 'forms', 'bug', 'contracts']) {
  test(`${module}: a member cannot claim app admin when no roles lane was granted`, async () => {
    const pic = await PocketIc.create(server.getUrl());
    try {
      const { actor: hub, canisterId: hubId } = await initialized(pic);
      const { actor: app, canisterId: appId } = await install(pic, module);
      app.setPrincipal(controller); await app.setHub(hubId.toText());
      const c = await connectTestApp(hub, { name: module, canisterId: appId.toText(), note: '', lanes: ['identity'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: module, kind: 'app', url: `https://${module}.example.test` }] });
      hub.setPrincipal(member); const ticket = await hub.mintAppTicket('', c.tileId);
      const [s] = await app.loginWithTicket(ticket.ticket); assert.ok(s);
      assert.equal((await app.claimAdmin(s.token)).ok, false);
    } finally { await pic.tearDown(); }
  });
}

async function scim(hub, token, method, path = '', value = null) {
  const r = await hub.http_request_update({ method, url: '/scim/v2/Users' + path, headers: [['Authorization', 'Bearer ' + token]], body: Buffer.from(value ? JSON.stringify(value) : '') });
  return { status: r.status_code, body: JSON.parse(Buffer.from(r.body).toString() || '{}') };
}
test('SCIM: duplicate concurrent creates and email rebinding are refused', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    const token = await hub.genScimToken();
    const replies = await Promise.all([scim(hub, token, 'POST', '', { userName: 'scim@example.test', active: true }), scim(hub, token, 'POST', '', { userName: 'scim@example.test', active: true })]);
    assert.deepEqual(replies.map(r => r.status).sort(), [201, 409]);
    const id = replies.find(r => r.status === 201).body.id;
    assert.equal((await scim(hub, token, 'PUT', '/' + id, { userName: 'owner@example.test', active: true })).status, 409);
    assert.equal((await scim(hub, token, 'PATCH', '/' + id, { Operations: [{ op: 'replace', path: 'userName', value: 'owner@example.test' }] })).status, 409);
    assert.equal((await scim(hub, token, 'GET', '/' + id)).body.userName, 'scim@example.test');
  } finally { await pic.tearDown(); }
});
// person registry (hub 0.17): ids are minted by a zero-second timer after install/upgrade
async function settled(pic) { for (let i = 0; i < 4; i++) { await pic.advanceTime(1000); await pic.tick(); } }
test('person ids: minted for everyone, a rename moves role, seat, passkey link and history; connectorLookup finds old addresses', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner);
    const card = (await hub.personCard('member@example.test'))[0];
    assert.ok(card && /^p_[0-9a-f]{16}$/.test(card.pid), 'an opaque id exists for a local person: ' + JSON.stringify(card, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    const ids = new Set((await hub.listUsers({ activeOnly: false, conn: [], limit: 100n, offset: 0n, search: '' })).items.map(u => u.personId));
    assert.equal(ids.has(''), false, 'every account carries an id');
    const g = await hub.addGroup('IT', ''); assert.equal(g.ok, true);
    assert.equal((await hub.setGroupMembers(g.id, ['member@example.test'], [])).ok, true);
    assert.equal((await hub.setPersonRole('member@example.test', 'helpdesk')).ok, true);
    const renamed = await hub.renameLocalUser('member@example.test', 'member.new@example.test');
    assert.equal(renamed.ok, true, renamed.detail);
    assert.deepEqual(await hub.groupsOf('member.new@example.test'), ['IT'], 'the seat follows the person');
    assert.deepEqual(await hub.groupsOf('member@example.test'), [], 'the old address holds nothing');
    assert.ok((await hub.listPersonRoles()).some(r => r.email === 'member.new@example.test' && r.role === 'helpdesk'), 'the role follows the person');
    assert.equal((await hub.personCard('member.new@example.test'))[0].pid, card.pid, 'same person, same id');
    assert.deepEqual(await hub.connectorLookup(['member@example.test', 'nobody@example.test']), [['member@example.test', card.pid]], 'the old address still resolves to the person');
    hub.setPrincipal(member);
    const me = (await hub.myAccess());
    assert.deepEqual(me.email, ['member.new@example.test'], 'the passkey link follows the person');
    hub.setPrincipal(owner);
    assert.equal((await hub.renameLocalUser('member.new@example.test', 'owner@example.test')).ok, false, 'no rename onto an address another active person holds');
  } finally { await pic.tearDown(); }
});
test('person ids: a re-issued address transfers nothing to the newcomer', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner);
    const g = await hub.addGroup('Finance', ''); assert.equal((await hub.setGroupMembers(g.id, ['member@example.test'], [])).ok, true);
    assert.equal((await hub.setPersonRole('member@example.test', 'helpdesk')).ok, true);
    const before = (await hub.personCard('member@example.test'))[0];
    // the person leaves (local record deactivated, kept for history) …
    assert.equal(await hub.setLocalUserActive('member@example.test', false), true);
    // … and HR pushes a NEW account under the same address
    const token = await hub.genScimToken();
    assert.equal((await scim(hub, token, 'POST', '', { userName: 'member@example.test', active: true })).status, 201);
    await settled(pic);
    const after = (await hub.personCard('member@example.test'))[0];
    assert.notEqual(after.pid, before.pid, 'a new person, not the old one');
    assert.deepEqual(after.formerHolders, [before.pid], 'the previous holder is remembered as former');
    assert.deepEqual(await hub.groupsOf('member@example.test'), [], 'no seat transferred');
    assert.equal((await hub.listPersonRoles()).some(r => r.email === 'member@example.test'), false, 'no role transferred');
    hub.setPrincipal(member);
    assert.deepEqual((await hub.myAccess()).email, [], 'the old passkey no longer signs in as anyone');
    hub.setPrincipal(owner);
    assert.deepEqual(await hub.connectorLookup(['member@example.test']), [['member@example.test', after.pid]], 'lookup answers the current holder');
  } finally { await pic.tearDown(); }
});
test('SCIM: a userName rename is accepted for a free address and refused onto another active person', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    const token = await hub.genScimToken();
    const created = await scim(hub, token, 'POST', '', { userName: 'scim@example.test', active: true });
    assert.equal(created.status, 201);
    await settled(pic);
    const pid = (await hub.personCard('scim@example.test'))[0].pid;
    assert.equal((await scim(hub, token, 'PATCH', '/' + created.body.id, { Operations: [{ op: 'replace', path: 'userName', value: 'scim.renamed@example.test' }] })).status, 200);
    assert.equal((await hub.personCard('scim.renamed@example.test'))[0].pid, pid, 'same person after the rename');
    assert.deepEqual(await hub.personCard('scim@example.test'), [], 'the old address is free again');
    assert.equal((await scim(hub, token, 'PUT', '/' + created.body.id, { userName: 'owner@example.test', active: true })).status, 409, 'no rebinding onto an active person');
  } finally { await pic.tearDown(); }
});
// assistants (hub 0.18): one-time code → personal token → app tickets as the person, revocable, company switch
test('assistants: code is single-use, token opens apps as the person only, disconnect and the company switch end it', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    await settled(pic);
    const { actor: app, canisterId: appId } = await install(pic, 'bug');
    app.setPrincipal(controller); await app.setHub(hubId.toText());
    hub.setPrincipal(owner);
    const c = await connectTestApp(hub, { name: 'bug', canisterId: appId.toText(), note: '', lanes: ['identity'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'bug', kind: 'app', url: 'https://bug.example.test' }] });
    assert.equal(c.ok, true);
    // off by default (0.19): nobody can mint a code until the owner switches the lane on
    hub.setPrincipal(member);
    assert.equal((await hub.mintAssistantCode('')).ok, false, 'the lane starts switched off');
    hub.setPrincipal(owner); assert.equal((await hub.setAssistantsEnabled(true)).ok, true);
    // the member mints a code from the menu (passkey session, token "")
    hub.setPrincipal(member);
    const minted = await hub.mintAssistantCode('');
    assert.equal(minted.ok, true, minted.detail);
    assert.match(minted.code, /^[a-z0-9-]+\.[0-9a-f]{64}$/, 'code = <hub canister>.<one-time code>');
    // anyone holding the code (the person's own assistant) exchanges it once
    hub.setPrincipal(stranger);
    const r = await hub.redeemAssistantCode(minted.code, 'Desktop chat');
    assert.equal(r.ok, true, r.detail);
    assert.equal(r.email, 'member@example.test');
    assert.match(r.id, /^p_[0-9a-f]{16}$/, 'the person id travels with the token');
    assert.equal((await hub.redeemAssistantCode(minted.code, 'again')).ok, false, 'a code is single-use');
    const who = (await hub.assistantWhoami(r.token))[0];
    assert.equal(who.email, 'member@example.test'); assert.equal(who.client, 'Desktop chat');
    const apps = await hub.assistantApps(r.token);
    assert.equal(apps.length, 1); assert.equal(apps[0].canisterId, appId.toText(), 'the assistant learns the backend canister to talk to');
    const t = await hub.assistantTicket(r.token, apps[0].tileId);
    assert.equal(t.ok, true, t.detail);
    const session = (await app.loginWithTicket(t.ticket))[0];
    assert.ok(session, 'the app accepts the assistant-minted ticket like a portal ticket');
    assert.equal(session.email, 'member@example.test', 'the assistant is the member, nobody else');
    const people = await hub.assistantPeople(r.token, 'helpdesk');
    assert.equal(people.length, 1); assert.equal(people[0].email, 'helpdesk@example.test');
    // the person sees and disconnects it from the menu
    hub.setPrincipal(member);
    const mine = await hub.myAssistants('');
    assert.equal(mine.length, 1); assert.equal(mine[0].client, 'Desktop chat'); assert.equal(mine[0].uses, 1n);
    assert.equal((await hub.revokeAssistant('', mine[0].id)).ok, true);
    assert.deepEqual(await hub.assistantWhoami(r.token), [], 'a disconnected token is dead');
    assert.equal((await hub.assistantTicket(r.token, apps[0].tileId)).ok, false);
    // a second assistant, then the owner switches the lane off for the company
    const minted2 = await hub.mintAssistantCode('');
    hub.setPrincipal(stranger);
    const r2 = await hub.redeemAssistantCode(minted2.code, 'IDE');
    assert.equal(r2.ok, true);
    hub.setPrincipal(helpdesk);
    assert.equal((await hub.setAssistantsEnabled(false)).ok, false, 'only owners switch the lane');
    hub.setPrincipal(owner);
    assert.equal((await hub.setAssistantsEnabled(false)).ok, true);
    assert.deepEqual(await hub.assistantWhoami(r2.token), [], 'the company switch refuses every assistant at once');
    hub.setPrincipal(member);
    assert.equal((await hub.mintAssistantCode('')).ok, false, 'no new codes while switched off');
  } finally { await pic.tearDown(); }
});
test('assistants: a locked-out person\'s assistant stops working', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner); assert.equal((await hub.setAssistantsEnabled(true)).ok, true);
    hub.setPrincipal(member);
    const minted = await hub.mintAssistantCode('');
    hub.setPrincipal(stranger);
    const r = await hub.redeemAssistantCode(minted.code, 'Desktop chat');
    assert.equal(r.ok, true);
    assert.equal((await hub.assistantWhoami(r.token)).length, 1);
    hub.setPrincipal(owner);
    assert.equal(await hub.setLocalUserActive('member@example.test', false), true);
    assert.deepEqual(await hub.assistantWhoami(r.token), [], 'lock-out ends the assistant too');
  } finally { await pic.tearDown(); }
});
test('bulk deactivation blocks a person across local and SCIM records', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    const token = await hub.genScimToken();
    const created = await scim(hub, token, 'POST', '', { userName: 'member@example.test', active: true });
    assert.equal(created.status, 201);
    // The local user key is the canonical LOCAL_CONN (0) + email.
    const all = await hub.listUsers({ activeOnly: false, conn: [], limit: 100n, offset: 0n, search: '' });
    const local = all.items.find(u => u.email === 'member@example.test' && u.connId === 0n);
    assert.ok(local);
    await hub.deactivateUsers([local.key], 'offboard');
    hub.setPrincipal(member);
    assert.equal((await hub.portalWhoami(''))[0].active, false);
    hub.setPrincipal(owner); assert.equal(await hub.clearOverrides([local.key]), 2n);
    hub.setPrincipal(member); assert.equal((await hub.portalWhoami(''))[0].active, true);
  } finally { await pic.tearDown(); }
});

// ---- regressions from the full audit of 2026-09-06 (KEBABSTACK-AUDIT-2026-09-06.md) ----
test('audit HB1-01: a newcomer that arrives inactive under a departed person\'s address is a new person — nothing transfers on activation', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner);
    const g = await hub.addGroup('Finance', ''); assert.equal((await hub.setGroupMembers(g.id, ['member@example.test'], [])).ok, true);
    assert.equal((await hub.setPersonRole('member@example.test', 'helpdesk')).ok, true);
    const before = (await hub.personCard('member@example.test'))[0];
    assert.equal(await hub.setLocalUserActive('member@example.test', false), true);
    // HR stages the successor first (active = false — what IdPs do), then activates them
    const token = await hub.genScimToken();
    const created = await scim(hub, token, 'POST', '', { userName: 'member@example.test', active: false });
    assert.equal(created.status, 201);
    await settled(pic);
    const staged = (await hub.personCard('member@example.test'))[0];
    assert.notEqual(staged.pid, before.pid, 'a staged newcomer is already a new person, not "history joining history"');
    assert.deepEqual(staged.formerHolders, [before.pid]);
    assert.equal((await scim(hub, token, 'PATCH', '/' + created.body.id, { Operations: [{ op: 'replace', path: 'active', value: true }] })).status, 200);
    await settled(pic);
    assert.deepEqual(await hub.groupsOf('member@example.test'), [], 'no seat transferred on activation');
    assert.equal((await hub.listPersonRoles()).some(r => r.email === 'member@example.test'), false, 'no role transferred on activation');
    hub.setPrincipal(member);
    assert.deepEqual((await hub.myAccess()).email, [], 'the departed person\'s passkey signs in as nobody');
  } finally { await pic.tearDown(); }
});
test('audit HB1-03: no local twin of an address that an active account holds elsewhere', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner);
    const token = await hub.genScimToken();
    assert.equal((await scim(hub, token, 'POST', '', { userName: 'hr@example.test', active: true })).status, 201);
    await settled(pic);
    assert.equal(await hub.addLocalUser('hr@example.test', 'Twin', '', ''), false, 'an address held by an active account elsewhere gets no local twin');
    assert.equal(await hub.addLocalUser('owner@example.test', 'Twin', '', ''), false, 'not even for the owner');
    // a locked-out passkey person keeps no session, but the menu can still tell them why
    assert.equal(await hub.setLocalUserActive('member@example.test', false), true);
    hub.setPrincipal(member);
    assert.equal((await hub.portalWhoami(''))[0].active, false, 'whoami says "inactive" so the menu shows the notice');
    assert.equal((await hub.mintAssistantCode('')).ok, false, 'nothing else works for a locked-out person');
    assert.deepEqual((await hub.myNotifications('', 1n)).items, [], 'reads are closed');
  } finally { await pic.tearDown(); }
});
test('audit HB2-01: an assistant token follows a rename and dies when the address is re-issued', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner); assert.equal((await hub.setAssistantsEnabled(true)).ok, true);
    hub.setPrincipal(member);
    const minted = await hub.mintAssistantCode('');
    hub.setPrincipal(stranger);
    const r = await hub.redeemAssistantCode(minted.code, 'Desktop chat');
    assert.equal(r.ok, true, r.detail);
    hub.setPrincipal(owner);
    assert.equal((await hub.renameLocalUser('member@example.test', 'renamed.member@example.test')).ok, true);
    const who = (await hub.assistantWhoami(r.token))[0];
    assert.equal(who && who.email, 'renamed.member@example.test', 'the token follows the person to the new address');
    // the person leaves and the NEW address is handed to a newcomer
    assert.equal(await hub.setLocalUserActive('renamed.member@example.test', false), true);
    assert.deepEqual(await hub.assistantWhoami(r.token), [], 'locked out');
    const token = await hub.genScimToken();
    assert.equal((await scim(hub, token, 'POST', '', { userName: 'renamed.member@example.test', active: true })).status, 201);
    await settled(pic);
    assert.deepEqual(await hub.assistantWhoami(r.token), [], 'the newcomer is active, but the old assistant is dead — it must never act as the newcomer');
    assert.equal((await hub.assistantTicket(r.token, 1n)).ok, false);
    // off means off: switching the lane off disconnects every assistant for good
    hub.setPrincipal(member);
    hub.setPrincipal(owner);
    assert.equal((await hub.setAssistantsEnabled(false)).ok, true);
    assert.equal((await hub.setAssistantsEnabled(true)).ok, true);
    assert.deepEqual(await hub.assistantWhoami(r.token), [], 'switching on again does not revive tokens');
  } finally { await pic.tearDown(); }
});
test('audit HB2-04/07: a failed grant leaves the access request open; a hidden tile mints no ticket', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    const { canisterId } = await install(pic, 'watch');
    const c = await connectTestApp(hub, { name: 'Selected', canisterId: canisterId.toText(), note: '', lanes: ['identity'], access: { mode: 'selected', groups: [], roles: ['owner'], people: [] }, tile: [{ name: 'Selected', kind: 'app', url: 'https://watch.example.test' }] });
    hub.setPrincipal(member);
    const req = await hub.requestAccess('', c.id, 'x'.repeat(295), 1n);
    assert.equal(req.ok, true, req.detail);
    hub.setPrincipal(owner);
    const bad = await hub.decideAccessRequest(req.id, true, [999999n], '');
    assert.equal(bad.ok, false, 'impossible hours are refused, not silently "approved"');
    assert.ok((await hub.listAccessRequests(true)).some(r => r.id === req.id && r.state === 'open'), 'the request stays open');
    const good = await hub.decideAccessRequest(req.id, true, [1n], '');
    assert.equal(good.ok, true, good.detail);
    assert.ok((await hub.listGrants(true)).some(gr => gr.email === 'member@example.test'), 'a real grant exists despite the long reason');
    hub.setPrincipal(member);
    assert.equal((await hub.mintAppTicket('', c.tileId)).ok, true);
    hub.setPrincipal(owner);
    assert.equal((await hub.setTileHidden(c.tileId, true)).ok, true);
    hub.setPrincipal(member);
    assert.equal((await hub.mintAppTicket('', c.tileId)).ok, false, 'off the menu means off');
  } finally { await pic.tearDown(); }
});
test('audit SD-01: after a rename an app resolves the person to the NEW address (one address per id)', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    await settled(pic);
    const { actor: desk, canisterId: deskId } = await install(pic, 'desk');
    desk.setPrincipal(controller); await desk.setHub(hubId.toText());
    hub.setPrincipal(owner);
    const c = await connectTestApp(hub, { name: 'desk', canisterId: deskId.toText(), note: '', lanes: ['identity', 'roles'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'desk', kind: 'app', url: 'https://desk.example.test' }] });
    const login = async (who) => { hub.setPrincipal(who); const t = await hub.mintAppTicket('', c.tileId); assert.equal(t.ok, true, t.detail); const s = (await desk.loginWithTicket(t.ticket))[0]; assert.ok(s); return s.token; };
    const memberTok = await login(member);
    await settled(pic); // the desk's id migration + first directory pull
    const types = await desk.catalog(memberTok);
    assert.ok(types.length > 0, 'desk ships request types');
    const created = await desk.createRequest(memberTok, types[0].id, 'Wifi drops', 'since monday', []);
    assert.equal(created.ok, true, created.detail);
    hub.setPrincipal(owner);
    // "renamed…" sorts AFTER "member@…": a naive first-match over the id table would keep answering the dead address
    assert.equal((await hub.renameLocalUser('member@example.test', 'renamed.member@example.test')).ok, true);
    const adminTok = await login(owner);
    assert.equal((await desk.syncNow(adminTok)).ok, true);
    const rows = await desk.listTickets(adminTok, { view: 'all', status: '', queue: '', assignee: '', q: '' });
    const row = rows.find(r => r.id === created.id);
    assert.ok(row, 'the ticket is listed');
    assert.equal(row.requesterEmail, 'renamed.member@example.test', 'the requester resolves to the new address');
  } finally { await pic.tearDown(); }
});
test('audit FO-01: 600 calls with a wrong slug do not lock the public forms; a real submission still lands', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    await settled(pic);
    const { actor: forms, canisterId: formsId } = await install(pic, 'forms');
    forms.setPrincipal(controller); await forms.setHub(hubId.toText());
    hub.setPrincipal(owner);
    const c = await connectTestApp(hub, { name: 'forms', canisterId: formsId.toText(), note: '', lanes: ['identity', 'roles'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'forms', kind: 'app', url: 'https://forms.example.test' }] });
    const t = await hub.mintAppTicket('', c.tileId); const tok = (await forms.loginWithTicket(t.ticket))[0].token;
    await settled(pic);
    const f = (await forms.createForm(tok, 'Feedback'))[0]; assert.ok(f, 'form created');
    assert.equal((await forms.setFormStatus(tok, f.id, { open: null })).ok, true);
    forms.setPrincipal(stranger);
    for (let i = 0; i < 600; i++) assert.equal((await forms.submitPublic('0000000000000000', '', '', '{"q":"junk"}', '')).ok, false);
    const real = await forms.submitPublic(f.slug, 'Ana', '', '{"q":"real"}', '');
    assert.equal(real.ok, true, 'junk calls do not count towards the window: ' + real.detail);
    assert.equal((await forms.submitPublic(f.slug, 'Ana', '', 'x'.repeat(70_000), '')).ok, false, 'answers are capped at 64 KB in bytes');
  } finally { await pic.tearDown(); }
});
test('audit TR-01/05: re-enrolment with a colleague\'s serial does not hand out their node key; sample devices refuse writes', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    await settled(pic);
    const { actor: trust, canisterId: trustId } = await install(pic, 'trust');
    trust.setPrincipal(controller); await trust.setHub(hubId.toText());
    hub.setPrincipal(owner);
    const c = await connectTestApp(hub, { name: 'trust', canisterId: trustId.toText(), note: '', lanes: ['identity', 'roles'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'trust', kind: 'app', url: 'https://trust.example.test' }] });
    const t = await hub.mintAppTicket('', c.tileId); const tok = (await trust.loginWithTicket(t.ticket))[0].token;
    await settled(pic);
    assert.equal((await trust.setEnroll(tok, 'shared-secret-1234')).ok, true);
    trust.setPrincipal(stranger);
    const enrol = async (host, serial) => {
      const res = await trust.http_request_update({ method: 'POST', url: '/enroll', headers: [], body: Buffer.from(JSON.stringify({ enroll_secret: 'shared-secret-1234', host_identifier: host, host_details: { system_info: { hostname: host, hardware_serial: serial }, os_version: { version: '15', platform: 'darwin', name: 'macOS' } } })) });
      return JSON.parse(Buffer.from(res.body).toString());
    };
    const a = await enrol('uuid-A', 'SERIAL-1'); assert.equal(a.node_invalid, false); assert.ok(a.node_key);
    const again = await enrol('uuid-A', 'SERIAL-1'); assert.equal(again.node_key, a.node_key, 'the same hardware keeps its key');
    const b = await enrol('uuid-B', 'SERIAL-1'); assert.equal(b.node_invalid, false);
    assert.notEqual(b.node_key, a.node_key, 'another device claiming the serial gets its own key, never the colleague\'s');
    const demo = await trust.http_request_update({ method: 'POST', url: '/config', headers: [], body: Buffer.from(JSON.stringify({ node_key: 'demo-1' })) });
    assert.equal(JSON.parse(Buffer.from(demo.body).toString()).node_invalid, true, 'sample devices accept no check-ins');
  } finally { await pic.tearDown(); }
});

// ---- contracts (P16): the acceptance table of docs/CONTRACTS.md, against the real hub Wasm and a mocked AI provider
const TERMS = { amountMinor: [150000n], currency: 'EUR', taxBasis: 'net', interval: 'year', quantity: [], unitMinor: [], start: '2025-01-01', end: '', renewalRule: 'auto', renewalDate: '2027-01-01', noticeDays: [], noticeMonths: [3n], noticeDate: '', decideBy: '', note: '' };
const cinput = (over = {}) => ({ title: 'Sunrise Cloud — Team plan', vendor: 'Sunrise Cloud', product: 'Team', customerRef: 'SC-4471', responsible: '', deputy: '', visibility: 'team', viewers: [], seats: [25n], holders: [], tags: [], ...over });
const mail = (over = {}) => ({ kind: 'relay', mailbox: 'subscriptions@relay.example.test', providerId: 'raw:' + 'a1'.repeat(20), messageId: '<renewal-1@sunrise-cloud.example>', inReplyTo: '', references: '', fromAddr: 'billing@sunrise-cloud.example', fromName: 'Sunrise Cloud Billing', to: ['me@example.test'], cc: ['subscriptions@relay.example.test'], subject: 'Your Team plan renews on 1 January 2027', sentAt: '2026-09-01T08:00:00Z', text: 'Dear customer, your Team plan (account SC-4471) renews automatically on 2027-01-01. The new yearly price is EUR 1,650.00 net (was EUR 1,500.00). You can cancel with two months notice before the renewal date.', html: '', attachments: [], ...over });
const aiAnswer = (events) => ({ choices: [{ message: { content: JSON.stringify({ schemaVersion: 1, events }) } }] });
const field = (f, value, quote, basis = 'explicit') => ({ field: f, value, basis, evidence: quote ? [{ partId: 'body', quote }] : [] });
async function contractsFixture(pic, { ai = true, hubOptions = {}, appOptions = {} } = {}) {
  const { actor: hub, canisterId: hubId } = await initialized(pic, hubOptions);
  await settled(pic);
  const { actor: app, canisterId: appId, idlFactory } = await install(pic, 'contracts', appOptions);
  app.setPrincipal(controller); await app.setHub(hubId.toText());
  hub.setPrincipal(owner);
  const c = await connectTestApp(hub, { name: 'contracts', canisterId: appId.toText(), note: '', lanes: ai ? ['identity', 'roles', 'groups', 'ai'] : ['identity', 'roles', 'groups'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'contracts', kind: 'app', url: 'https://contracts.example.test' }] });
  assert.equal(c.ok, true, c.detail);
  if (ai) assert.equal((await hub.setAi({ provider: 'openai', url: 'https://ai.example.test/v1/chat/completions', model: 'test-model', key: 'k-test-0000', visionModel: [] })).ok, true);
  const login = async (principal) => { hub.setPrincipal(principal); const t = await hub.mintAppTicket('', c.tileId); assert.equal(t.ok, true, t.detail); const s = (await app.loginWithTicket(t.ticket))[0]; assert.ok(s, 'session'); return s.token; };
  const adminRoot = await login(owner), memberRoot = await login(member), helpdeskTok = await login(helpdesk);
  await settled(pic);
  const memberId = (await app.whoami(memberRoot))[0].id, adminId = (await app.whoami(adminRoot))[0].id;
  const created = await app.createSpace(adminRoot, 'Test team', 'Shared acceptance fixture'); assert.equal(created.ok,true,created.detail);
  const adminTok = (await app.openSpace(adminRoot,created.id)).token;
  assert.equal((await app.updateSpace(adminTok,1n,'Test team','Shared acceptance fixture',[{pid:adminId,role:{owner:null}},{pid:memberId,role:{editor:null}}],false)).ok,true);
  const memberTok = (await app.openSpace(memberRoot,created.id)).token;
  return { hub, hubId, app, appId, idlFactory, adminTok, memberTok, helpdeskTok, memberId, adminId, adminRoot, memberRoot, spaceId:created.id, login, connector: c };
}
async function pendingContractsAi(pic) {
  for (let i = 0; i < 40; i++) {
    await pic.tick(2);
    const requests = await pic.getPendingHttpsOutcalls();
    if (requests.length) return requests[0];
  }
  assert.fail('Expected a Contracts AI request');
}
async function respondContractsAi(pic, req, body, statusCode = 200) {
  await pic.mockPendingHttpsOutcall({requestId:req.requestId,subnetId:req.subnetId,response:{type:'success',statusCode,headers:[],body:Buffer.from(JSON.stringify(body))}});
}
test('contracts: native PDF and image payloads, visual evidence, receipt filing and recoverable deletion', async () => {
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,appId,hub,adminRoot,adminTok:firstToken,helpdeskTok,memberRoot,login,spaceId}=await contractsFixture(pic);
    let adminTok=firstToken;
    hub.setPrincipal(owner);
    assert.equal((await hub.setAi({provider:'anthropic',url:'https://api.anthropic.com/v1/messages',model:'text-model',key:'fixture-key',visionModel:['vision-model']})).ok,true);
    await pic.advanceTime(16_000);await settled(pic);await app.refreshAiStatus(adminRoot);
    const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
    const upload=async(bytes,name,mime)=>{
      const b=await app.intakeBegin(adminTok,mail({kind:'eml',messageId:'file:'+name,providerId:'',subject:name,text:'Uploaded document: '+name,attachments:[{name,mime,size:BigInt(bytes.length),sha256:createHash('sha256').update(bytes).digest('hex'),textExtract:'',link:''}]}));
      assert.equal(b.ok,true,b.detail);assert.equal((await app.intakeChunk(adminTok,b.id,0n,bytes)).ok,true);
      const c=await app.intakeCommit(adminTok,b.id);assert.equal(c.ok,true,c.detail);return c.sourceId;
    };
    const sid=await upload(image,'purchase.png','image/png');
    const req=await pendingContractsAi(pic);const payload=JSON.parse(Buffer.from(req.body).toString());
    assert.equal(payload.model,'vision-model');assert.equal(payload.temperature,undefined);
    const imageBlock=payload.messages[0].content.find(x=>x.type==='image');assert.equal(imageBlock.source.media_type,'image/png');assert.deepEqual(Buffer.from(imageBlock.source.data,'base64'),image);
    const doc=(await app.getSource(adminTok,sid))[0].documents[0];
    const visual=(f,value,quote)=>({field:f,value,basis:'explicit',evidence:[{partId:'visual:doc:'+doc.id,quote}]});
    const event={kind:'receipt',contractCandidates:[],effectiveDate:'',proposedFields:[visual('recordType','receipt','Payment successful'),visual('vendor','Example Software','Example Software'),visual('amountMinor','24.90','CHF 24.90'),visual('currency','CHF','CHF 24.90')],uncertainties:['Image readings need review.'],summary:'Software purchase paid via Stripe'};
    await respondContractsAi(pic,req,{content:[{type:'text',text:JSON.stringify({schemaVersion:1,events:[event]})}]});await settled(pic);
    const view=(await app.getSource(adminTok,sid))[0];assert.equal(view.proposals.length,1);assert.equal(view.proposals[0].kind,'receipt');assert.equal(view.proposals[0].changes.find(x=>x.field==='amountMinor').newValue,'2490');
    const saved=await app.createContractFromSource(adminTok,sid,{proposalId:[view.proposals[0].id],destination:'',fields:[{field:'title',value:'Example receipt'},{field:'vendor',value:'Example Software'},{field:'recordType',value:'receipt'},{field:'amountMinor',value:'2490'},{field:'currency',value:'CHF'}]});assert.equal(saved.ok,true,saved.detail);
    assert.ok((await app.getContract(adminTok,saved.contractId))[0].contract.tags.includes('document-type:receipt'));assert.equal((await app.getContract(adminTok,saved.contractId))[0].row.complete,true,'receipt needs no invented renewal or notice dates');
    assert.equal((await app.setTrashed(helpdeskTok,'contract',saved.contractId,true)).ok,false);
    assert.equal((await app.setTrashed(adminTok,'contract',saved.contractId,true)).ok,true);
    assert.deepEqual(await app.getContract(adminTok,saved.contractId),[]);assert.deepEqual(await app.documentData(adminTok,doc.id),[]);assert.deepEqual(await app.getSource(adminTok,sid),[]);
    assert.equal((await app.exportAll(adminTok))[0].contracts.length,0);assert.equal((await app.listTrash(adminTok)).length,1);assert.deepEqual(await app.listTrash(memberRoot),[]);
    assert.equal((await app.setTrashed(adminTok,'contract',saved.contractId,false)).ok,true);assert.equal((await app.documentData(adminTok,doc.id)).length,1);
    const sid2=await upload(Buffer.concat([Buffer.from('%PDF-1.4\nfixture-original-pages\n%%EOF'),Buffer.alloc(1_399_960,32)]),'scan.pdf','application/pdf');
    const req2=await pendingContractsAi(pic).catch(async e=>{throw new Error(e.message+' '+JSON.stringify((await app.connectionStatus(adminTok))[0].jobs,(_,v)=>typeof v==='bigint'?String(v):v));});const pdf=JSON.parse(Buffer.from(req2.body).toString()).messages[0].content.find(x=>x.type==='document');assert.equal(pdf.source.media_type,'application/pdf');assert.match(Buffer.from(pdf.source.data,'base64').toString(),/fixture-original-pages/);
    assert.equal((await app.setTrashed(adminTok,'source',sid2,true)).ok,true);
    await respondContractsAi(pic,req2,{content:[{type:'text',text:JSON.stringify({schemaVersion:1,events:[event]})}]});await settled(pic);
    assert.deepEqual(await app.getSource(adminTok,sid2),[]);assert.equal((await app.setTrashed(adminTok,'source',sid2,false)).ok,true);assert.equal((await app.getSource(adminTok,sid2))[0].proposals.length,0,'late response cannot resurrect trashed content');
    assert.equal((await app.setTrashed(adminTok,'source',sid,true)).ok,true);assert.equal((await app.getContract(adminTok,saved.contractId))[0].documents.length,0,'deleted source originals leave the record view');
    await pic.upgradeCanister({upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]},sender:controller,canisterId:appId,wasm:candidateWasm('contracts')});
    await settled(pic);adminTok=(await app.openSpace(await login(owner),spaceId)).token;assert.equal((await app.listTrash(adminTok)).length,1,'trash survives an actual upgrade');assert.deepEqual(await app.documentData(adminTok,doc.id),[]);
    assert.equal((await app.setTrashed(adminTok,'source',sid,false)).ok,true);assert.equal((await app.documentData(adminTok,doc.id)).length,1);
    const oversized=await upload(Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(1_499_980,32)]),'large.pdf','application/pdf');await settled(pic);
    assert.match((await app.getSource(adminTok,oversized))[0].source.note,/Compress it below 1.4 MB/,'oversized AI payloads give an actionable error and keep the original');assert.equal((await pic.getPendingHttpsOutcalls()).length,0);
    hub.setPrincipal(owner);await hub.setAi({provider:'openai',url:'https://api.openai.com/v1/chat/completions',model:'text-model',key:'fixture-key',visionModel:['vision-model']});
    await pic.advanceTime(16_000);await settled(pic);await app.refreshAiStatus(await login(owner));
    const openaiPdf=Buffer.from('%PDF-1.4\nopenai original\n%%EOF');await upload(openaiPdf,'openai.pdf','application/pdf');
    const openaiReq=await pendingContractsAi(pic),openaiBody=JSON.parse(Buffer.from(openaiReq.body).toString());
    assert.equal(openaiBody.model,'vision-model');assert.equal(openaiBody.max_completion_tokens,6000);assert.equal(openaiBody.temperature,undefined);
    assert.equal(openaiBody.messages[1].content.find(x=>x.type==='file').file.file_data,'data:application/pdf;base64,'+openaiPdf.toString('base64'));
    await respondContractsAi(pic,openaiReq,{choices:[{finish_reason:'stop',message:{content:JSON.stringify({schemaVersion:1,events:[{kind:'other',contractCandidates:[],effectiveDate:'',proposedFields:[],uncertainties:[],summary:'Transport fixture'}]})}}]});await settled(pic);
  } finally {await pic.tearDown();}
});
test('contracts: permanent trash deletion enforces access, preserves shared files, frees storage and survives upgrades', async () => {
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,appId,adminRoot,memberRoot,helpdeskTok,adminId,memberId,spaceId,login}=await contractsFixture(pic,{ai:false});
    let adminTok=(await app.openSpace(adminRoot,spaceId)).token, memberTok=(await app.openSpace(memberRoot,spaceId)).token;
    const pdf=Buffer.from('%PDF-1.4\nshared original contract\n%%EOF');
    const upload=async(name)=>{
      const meta=mail({kind:'manual',providerId:name,messageId:name,subject:name,text:'Text '+name,html:'<p>'+name+'</p>',attachments:[{name:'agreement.pdf',mime:'application/pdf',size:BigInt(pdf.length),sha256:createHash('sha256').update(pdf).digest('hex'),textExtract:'Extracted '+name,link:''}]});
      const begin=await app.intakeBegin(adminTok,meta);assert.equal(begin.ok,true,begin.detail);
      assert.equal((await app.intakeChunk(adminTok,begin.id,0n,pdf)).ok,true);
      const committed=await app.intakeCommit(adminTok,begin.id);assert.equal(committed.ok,true,committed.detail);
      return (await app.getSource(adminTok,committed.sourceId))[0];
    };
    const a=await upload('first'),b=await upload('second');
    assert.equal((await app.deletePermanently(adminTok,'source',a.source.id)).ok,false,'active source cannot be purged');
    assert.equal((await app.setTrashed(adminTok,'source',a.source.id,true)).ok,true);
    for(const tok of ['',memberRoot,helpdeskTok])assert.equal((await app.deletePermanently(tok,'source',a.source.id)).ok,false,'authentication and workspace enforced');
    let space=(await app.getSpace(adminTok))[0].space;
    assert.equal((await app.updateSpace(adminTok,space.revision,space.name,space.description,[{pid:adminId,role:{owner:null}},{pid:memberId,role:{viewer:null}}],false)).ok,true);
    assert.equal((await app.deletePermanently(memberTok,'source',a.source.id)).ok,false,'viewer cannot permanently delete');
    const before=(await app.connectionStatus(adminTok))[0].blobBytes;
    assert.equal((await app.deletePermanently(adminTok,'source',a.source.id)).ok,true);
    assert.equal((await app.setTrashed(adminTok,'source',a.source.id,false)).ok,false,'permanently deleted source cannot be restored');
    assert.deepEqual(await app.documentData(adminTok,a.documents[0].id),[]);
    assert.deepEqual(Buffer.from((await app.documentData(adminTok,b.documents[0].id))[0].bytes),pdf,'shared original remains readable');
    assert.ok((await app.connectionStatus(adminTok))[0].blobBytes < before,'unused body/HTML/text storage reclaimed');
    const again=await upload('first');assert.notEqual(again.source.id,a.source.id,'same document can be uploaded again after deletion');
    assert.deepEqual(Buffer.from((await app.documentData(adminTok,again.documents[0].id))[0].bytes),pdf,'dedupe index points to a surviving original');
    assert.equal((await app.moveIncomingSource(adminTok,b.source.id,(await app.whoami(adminRoot))[0].space)).ok,true,'move shared copy into another workspace');
    assert.equal((await app.setTrashed(adminTok,'source',again.source.id,true)).ok,true);
    assert.equal((await app.deletePermanently(adminTok,'source',again.source.id)).ok,true);
    assert.deepEqual(Buffer.from((await app.documentData(adminRoot,b.documents[0].id))[0].bytes),pdf,'other workspace keeps the shared bytes');
    assert.equal((await app.deletePermanently(adminTok,'source',b.source.id)).ok,false,'old workspace cannot purge moved copy');
    assert.equal((await app.setTrashed(adminRoot,'source',b.source.id,true)).ok,true);
    assert.equal((await app.deletePermanently(adminRoot,'source',b.source.id)).ok,true);
    assert.equal((await app.connectionStatus(adminTok))[0].blobBytes,0n,'last reference releases the actual PDF bytes');
    const linked=await upload('linked');
    const key=await app.saveLicenseKey(adminTok,[],0n,{tool:'Permanent fixture',vendor:'Example',key:'ERASE-THIS-KEY',ownerId:adminId,seats:[2n],expires:'2027-09-01',note:'Key record'});assert.equal(key.ok,true,key.detail);
    assert.equal((await app.linkSource(adminTok,linked.source.id,[key.id],[])).ok,true);
    const prop=await app.proposeChange(adminTok,key.id,[linked.source.id],[{field:'note',value:'Proposed note'}],'Review note');assert.equal(prop.ok,true);
    assert.equal((await app.deletePermanently(adminTok,'contract',key.id)).ok,false,'active record cannot be purged');
    assert.equal((await app.setTrashed(adminTok,'contract',key.id,true)).ok,true);
    assert.equal((await app.deletePermanently(memberTok,'contract',key.id)).ok,false,'restricted record stays protected');
    assert.equal((await app.deletePermanently(adminTok,'source',linked.source.id)).ok,false,'child of trashed record cannot be deleted separately');
    // Restoring in another tab invalidates the delete operation, even with the original session.
    assert.equal((await app.setTrashed(adminTok,'contract',key.id,false)).ok,true);
    assert.equal((await app.deletePermanently(adminTok,'contract',key.id)).ok,false);
    assert.equal((await app.setTrashed(adminTok,'contract',key.id,true)).ok,true);
    assert.equal((await app.deletePermanently(adminTok,'contract',key.id)).ok,true);
    assert.equal((await app.deletePermanently(adminTok,'contract',key.id)).ok,false,'duplicate request cannot delete anything else');
    assert.deepEqual(await app.revealLicenseKey(adminTok,key.id),[]);assert.deepEqual(await app.documentData(adminTok,linked.documents[0].id),[]);
    assert.equal((await app.connectionStatus(adminTok))[0].blobBytes,0n);
    assert.equal((await app.listTrash(adminTok)).length,0);
    await pic.upgradeCanister({sender:controller,canisterId:appId,wasm:candidateWasm('contracts'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});await settled(pic);
    adminTok=(await app.openSpace(await login(owner),spaceId)).token;
    assert.equal((await app.setTrashed(adminTok,'contract',key.id,false)).ok,false,'upgrade does not resurrect purged records');
    const exported=(await app.exportAll(adminTok))[0];
    for(const field of ['contracts','sources','documents','proposals','observations','tasks','rules','audit'])assert.equal(exported[field].length,0,field+' was cleaned up');
  } finally {await pic.tearDown();}
});

test('contracts: late AI cannot resurrect a permanently deleted original',async()=>{
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try{
    const {app,adminTok}=await contractsFixture(pic);
    const b=await app.intakeBegin(adminTok,mail({kind:'manual',providerId:'late-purge',messageId:'late-purge',text:'Example Software'}));
    const {sourceId}=await app.intakeCommit(adminTok,b.id),req=await pendingContractsAi(pic);
    assert.equal((await app.setTrashed(adminTok,'source',sourceId,true)).ok,true);
    assert.equal((await app.deletePermanently(adminTok,'source',sourceId)).ok,true);
    await respondContractsAi(pic,req,aiAnswer([{kind:'offer',contractCandidates:[],effectiveDate:'',proposedFields:[field('vendor','Example Software','Example Software')],uncertainties:[],summary:'Late result'}]));await settled(pic);
    assert.deepEqual(await app.getSource(adminTok,sourceId),[]);
    const exported=(await app.exportAll(adminTok))[0];assert.equal(exported.sources.length,0);assert.equal(exported.proposals.length,0);assert.equal(exported.observations.length,0);
    assert.equal((await app.connectionStatus(adminTok))[0].openJobs,0n);assert.equal((await app.connectionStatus(adminTok))[0].blobBytes,0n);
  }finally{await pic.tearDown();}
});

test('contracts: keep supported fields when one text quote fails, reject forged visual references', async()=>{
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try{
    const{app,adminTok}=await contractsFixture(pic);
    const b=await app.intakeBegin(adminTok,mail({kind:'manual',subject:'Receipt',text:'Example Software. Paid CHF 24.90.'}));const c=await app.intakeCommit(adminTok,b.id);
    await extractWith(pic,[{kind:'receipt',contractCandidates:[],effectiveDate:'',proposedFields:[field('vendor','Example Software','Example Software'),field('amountMinor','999.00','CHF 999.00')],uncertainties:[],summary:'Payment receipt'}]);
    const v=(await app.getSource(adminTok,c.sourceId))[0];assert.equal(v.proposals.length,1);assert.equal(v.proposals[0].changes.length,1);assert.match(v.proposals[0].uncertainties.join(' '),/amountMinor/);
    const b2=await app.intakeBegin(adminTok,mail({kind:'manual',providerId:'',messageId:'second',subject:'Second receipt',text:'Example Software.'}));const c2=await app.intakeCommit(adminTok,b2.id);
    await extractWith(pic,[{kind:'receipt',contractCandidates:[],effectiveDate:'',proposedFields:[{...field('vendor','Example Software','Example Software'),evidence:[{partId:'visual:doc:1',quote:'Example Software'}]}],uncertainties:[],summary:'Forged reference'}]);
    assert.equal((await app.getSource(adminTok,c2.sourceId))[0].proposals.length,0);
  }finally{await pic.tearDown();}
});
test('contracts: AI diagnostics use a compatible Anthropic request, protect access and budget, and separate configuration from provider health', async () => {
  const pic = await PocketIc.create(server.getUrl(), {application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,appId,idlFactory,hub,adminRoot,memberRoot,connector}=await contractsFixture(pic);
    hub.setPrincipal(owner);
    assert.equal((await hub.setAi({provider:'anthropic',url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-5',key:'fixture-private-key',visionModel:[]})).ok,true);
    await pic.advanceTime(16_000); await settled(pic);
    let s=(await app.refreshAiStatus(memberRoot))[0];
    assert.equal(s.model,'claude-sonnet-5'); assert.equal(s.laneGranted,true); assert.equal(s.credentialsReady,true);
    assert.deepEqual(s.lastTest,[]); assert.equal(s.callsToday,0n); assert.equal(s.canTest,false);
    assert.ok(!JSON.stringify(s,(_,v)=>typeof v==='bigint'?String(v):v).includes('fixture-private-key'));
    assert.deepEqual(await app.getAiStatus('invalid-session'),[]);
    assert.equal((await app.testAiConnection(memberRoot)).ok,false,'space ownership does not grant technical admin test access');
    assert.equal((await pic.getPendingHttpsOutcalls()).length,0,'reading status never calls the model');
    const deferred=pic.createDeferredActor(idlFactory,appId);
    const result=await deferred.testAiConnection(adminRoot);
    const req=await pendingContractsAi(pic), body=JSON.parse(Buffer.from(req.body).toString());
    assert.equal(body.model,'claude-sonnet-5'); assert.equal(body.output_config.effort,'low'); assert.ok(!('temperature' in body)); assert.ok(!('top_p' in body));
    assert.match(body.messages[0].content,/No contract or personal data/);
    assert.equal((await app.testAiConnection(adminRoot)).ok,false,'duplicate test refused while first request runs');
    await respondContractsAi(pic,req,{content:[{type:'text',text:'{"ok":true}'}]});
    assert.equal((await result()).ok,true);
    s=(await app.getAiStatus(adminRoot))[0]; assert.equal(s.lastTest[0].ok,true); assert.equal(s.callsToday,1n);
    assert.equal((await app.exportAll(adminRoot))[0].contracts.length,0,'test cannot create a contract');
    assert.equal((await app.testAiConnection(adminRoot)).ok,false,'one-minute test cooldown');
    await pic.advanceTime(61_000); await settled(pic);
    const failure=await deferred.testAiConnection(adminRoot), req2=await pendingContractsAi(pic);
    await respondContractsAi(pic,req2,{error:{message:'`temperature` is deprecated for this model. PRIVATE ECHO'}},400);
    const f=await failure(); assert.equal(f.ok,false); assert.match(f.detail,/deprecated temperature/); assert.ok(!f.detail.includes('PRIVATE ECHO'));
    s=(await app.getAiStatus(memberRoot))[0]; assert.equal(s.credentialsReady,true); assert.equal(s.lastTest[0].ok,false,'configured access is not a passed provider test');
    hub.setPrincipal(owner); await hub.setConnectorLanes(connector.id,['identity','roles','groups']);
    await pic.advanceTime(16_000); await settled(pic);
    s=(await app.refreshAiStatus(adminRoot))[0]; assert.equal(s.laneGranted,false); assert.equal(s.credentialsReady,false); assert.deepEqual(s.lastTest,[]);
  } finally {await pic.tearDown();}
});
test('contracts: exhausted document analysis can be retried without losing its source or starting concurrent extraction', async () => {
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,adminTok:initialToken,helpdeskTok,login,spaceId}=await contractsFixture(pic);
    let adminTok=initialToken;
    const b=await app.intakeBegin(adminTok,mail({kind:'eml',providerId:'retry-exhaustion',messageId:'retry-exhaustion'}));
    const committed=await app.intakeCommit(adminTok,b.id); assert.equal(committed.ok,true,committed.detail);
    for(let i=0;i<3;i++) {
      const job=(await app.connectionStatus(adminTok))[0].jobs.find(j=>j.ref===committed.sourceId&&!j.doneAt);
      const now=await pic.getTime();
      // Refresh the directory before the due job; a jump of hours intentionally expires its lease.
      const wait=Number(job.nextAt/1000000n)-now-30_000;
      if(wait>0) {
        await pic.advanceTime(wait); await settled(pic);
        adminTok=(await app.openSpace(await login(owner),spaceId)).token;
      }
      await pic.advanceTime(35_000);
      await settled(pic);
      const req=await pendingContractsAi(pic);
      assert.equal((await app.reprocessSource(adminTok,committed.sourceId)).ok,false,'active extraction cannot be duplicated');
      await respondContractsAi(pic,req,{error:{message:'provider rejected PRIVATE ECHO'}},503); await settled(pic);
      const status=(await app.getSource(adminTok,committed.sourceId))[0].source;
      assert.equal(status.status,i<2?'received':'failed');
      assert.match(status.note,i<2?/Retrying automatically/:/paused after three attempts/);
      assert.ok(!status.note.includes('PRIVATE ECHO'));
    }
    let state=(await app.connectionStatus(adminTok))[0], job=state.jobs.find(j=>j.ref===committed.sourceId&&!j.doneAt);
    assert.equal(job.attempts,3n);
    assert.equal((await app.reprocessSource(helpdeskTok,committed.sourceId)).ok,false,'unrelated user cannot retry private content');
    assert.equal((await app.reprocessSource(adminTok,committed.sourceId)).ok,true);
    job=(await app.connectionStatus(adminTok))[0].jobs.find(j=>j.ref===committed.sourceId&&!j.doneAt); assert.equal(job.attempts,0n);
    await extractWith(pic,[{kind:'offer',contractCandidates:[],effectiveDate:'',proposedFields:[],uncertainties:[],summary:'A licence offer'}]);
    const source=(await app.getSource(adminTok,committed.sourceId))[0];
    assert.equal(source.source.status,'review'); assert.equal(source.proposals.length,1); assert.equal(source.text,mail().text);
  } finally {await pic.tearDown();}
});
// the extraction job runs on a 20-second timer: let it fire, answer the provider outcall, let the result settle
async function extractWith(pic, events) {
  await pic.advanceTime(21_000); await pic.tick(2);
  await answerOutcall(pic, aiAnswer(events));
  await settled(pic);
}

test('contracts: relay gate, dedupe (redelivery · CC copy · eml upload), a proposal with evidence, revision conflict, routine invoice filed, cancellation stays a person\'s decision', async () => {
  const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const { app, adminTok, memberTok, helpdeskTok, memberId } = await contractsFixture(pic);
    // the record: created by an admin, the member is responsible; terms typed by hand drive the deadlines
    const created = await app.createContract(adminTok, cinput({ responsible: memberId }));
    assert.equal(created.ok, true, created.detail); const cid = created.id;
    let rec = (await app.getContract(adminTok, cid))[0];
    assert.equal(rec.contract.status, 'draft'); assert.equal(rec.contract.revision, 1n);
    const st = await app.setTerms(adminTok, cid, 1n, TERMS, 'from the order form'); assert.equal(st.ok, true, st.detail);
    rec = (await app.getContract(adminTok, cid))[0];
    assert.equal(rec.contract.terms.noticeDate, '2026-10-01', 'renewal 2027-01-01 minus 3 calendar months');
    assert.equal(rec.contract.terms.decideBy, '2026-09-17', '14 days before the last cancellation date');
    assert.equal((await app.setStatus(adminTok, cid, rec.contract.revision, 'active', 'signed')).ok, true);
    rec = (await app.getContract(adminTok, cid))[0]; assert.equal(rec.contract.status, 'active');
    assert.ok(rec.tasks.some((t) => t.kind === 'decide' && t.dueOn === '2026-09-17' && t.assignee === memberId), 'a decide task for the responsible person: ' + JSON.stringify(rec.tasks.map((t) => [t.kind, t.dueOn])));
    assert.equal((await app.addRule(adminTok, 'senderAddress', 'billing@sunrise-cloud.example', cid)).ok, true);
    // relay gate: only listed principals hand in relay mail, with no session and nothing else
    app.setPrincipal(stranger);
    assert.equal((await app.intakeBegin('', mail())).ok, false, 'an unknown principal is not a relay');
    assert.equal((await app.setRelayPrincipals(adminTok, [stranger.toText()])).ok, true);
    assert.equal((await app.setSpaceRelay(adminTok, stranger.toText(), true)).ok, true);
    assert.equal((await app.intakeBegin('', mail({ kind: 'eml' }))).ok, false, 'the relay hands in relay messages only');
    assert.deepEqual(await app.listSources('', '', []), [], 'the relay identity reads nothing');
    assert.deepEqual(await app.whoami(''), []);
    const b = await app.intakeBegin('', mail()); assert.equal(b.ok, true, b.detail);
    const c1 = await app.intakeCommit('', b.id); assert.equal(c1.ok, true, c1.detail); assert.equal(c1.status, 'received'); const sid = c1.sourceId;
    // dedupe: the same delivery again (provider id), and the same message handed in by a person as .eml (message id + content)
    assert.match((await app.intakeBegin('', mail())).detail, /^duplicate/);
    app.setPrincipal(member);
    const b2 = await app.intakeBegin(memberTok, mail({ kind: 'eml', providerId: '', mailbox: '' })); assert.equal(b2.ok, true, b2.detail);
    const c2 = await app.intakeCommit(memberTok, b2.id); assert.equal(c2.status, 'duplicate'); assert.equal(c2.sourceId, sid);
    const src = (await app.getSource(adminTok, sid))[0];
    assert.deepEqual(src.source.contractId, [cid], 'the confirmed sender rule files the message to the contract');
    assert.equal((await app.listSources(adminTok, '', [])).length, 1, 'one source, not three');
    // the AI reads it: a renewal notice with evidence that occurs in the text → one proposal; the record is untouched
    await extractWith(pic, [{ kind: 'renewal_notice', contractCandidates: [String(cid)], effectiveDate: '2027-01-01', proposedFields: [field('amountMinor', '1650.00', 'EUR 1,650.00 net'), field('renewalDate', '2027-01-01', 'renews automatically on 2027-01-01'), field('noticeMonths', '2', 'two months notice', 'ambiguous')], uncertainties: ['notice period stated in words'], summary: 'Price rises to 1,650.00 EUR' }]);
    const open = await app.listProposals(adminTok, '', []);
    assert.equal(open.length, 1, 'one proposal: ' + JSON.stringify((await app.getSource(adminTok, sid))[0].source.note));
    const p = open[0];
    assert.deepEqual(p.contractId, [cid]); assert.equal(p.kind, 'renewal_notice'); assert.equal(p.baseRevision, (await app.getContract(adminTok, cid))[0].contract.revision);
    assert.deepEqual(p.changes.map((ch) => [ch.field, ch.oldValue, ch.newValue, ch.basis]), [['amountMinor', '150000', '165000', 'explicit'], ['noticeMonths', '3', '2', 'ambiguous']], 'the unchanged renewal date is not a change; old values come from the record');
    assert.equal(p.changes[0].evidence[0].quote, 'EUR 1,650.00 net');
    assert.equal((await app.getSource(adminTok, sid))[0].source.status, 'review');
    assert.equal((await app.getContract(adminTok, cid))[0].contract.terms.amountMinor[0], 150000n, 'nothing changed on the record by itself');
    assert.equal((await app.listProposals(memberTok, '', [])).length, 1, 'the responsible person sees it');
    assert.equal((await app.listProposals(helpdeskTok, '', [])).length, 0, 'helpdesk has no role here');
    // revision conflict: the record moves under the reviewer → refused; with the fresh revision → confirmed field-wise, deadlines recomputed
    const before = (await app.getContract(adminTok, cid))[0].contract.revision;
    assert.equal((await app.setTerms(adminTok, cid, before, { ...TERMS, note: 'PO 4711' }, 'note added')).ok, true);
    const stale = await app.decideProposal(memberTok, p.id, { expectedRevision: before, target: [], newContract: false, accept: [{ field: 'amountMinor', value: '1650.00' }], note: '' });
    assert.equal(stale.ok, false); assert.match(stale.detail, /changed since/);
    const fresh = await app.decideProposal(memberTok, p.id, { expectedRevision: stale.revision, target: [], newContract: false, accept: [{ field: 'amountMinor', value: '1650.00' }], note: 'checked with the invoice' });
    assert.equal(fresh.ok, true, fresh.detail);
    rec = (await app.getContract(memberTok, cid))[0];
    assert.equal(rec.contract.terms.amountMinor[0], 165000n, 'money accepted as a decimal text lands in minor units');
    assert.equal(rec.contract.terms.noticeMonths[0], 3n, 'the ambiguous field was not ticked — unchanged');
    assert.equal(rec.contract.terms.note, 'PO 4711', 'the colleague\'s edit survived');
    assert.equal((await app.getSource(adminTok, sid))[0].source.status, 'filed');
    assert.equal((await app.listProposals(adminTok, 'confirmed', [])).length, 1);
    assert.ok(rec.audit.some((a) => /proposal #\d+ confirmed/.test(a.what) && /checked with the invoice/.test(a.what)), 'history line with the note');
    // routine invoice: same amount, same interval, contract active → filed without a proposal or a task
    app.setPrincipal(stranger);
    const b3 = await app.intakeBegin('', mail({ providerId: 'raw:' + 'b2'.repeat(20), messageId: '<inv-2026-09@sunrise-cloud.example>', subject: 'Invoice 2026-09 — Team plan', text: 'Invoice for your Team plan (account SC-4471): EUR 1,650.00 per year, due 2026-10-01.' }));
    assert.equal(b3.ok, true, b3.detail); const c3 = await app.intakeCommit('', b3.id); assert.equal(c3.ok, true);
    const tasksBefore = (await app.listTasks(adminTok, true, [cid])).length;
    await extractWith(pic, [{ kind: 'invoice', contractCandidates: [String(cid)], effectiveDate: '', proposedFields: [field('amountMinor', '1650.00', 'EUR 1,650.00 per year'), field('interval', 'year', 'per year')], uncertainties: [], summary: 'Yearly invoice' }]);
    const inv = (await app.getSource(adminTok, c3.sourceId))[0];
    assert.equal(inv.source.status, 'filed', inv.source.note); assert.match(inv.source.note, /routine invoice/);
    assert.equal((await app.listProposals(adminTok, '', [])).length, 0, 'no proposal for a routine invoice');
    assert.equal((await app.listTasks(adminTok, true, [cid])).length, tasksBefore, 'no task for a routine invoice');
    // a cancellation request in the mail is a proposal, never a status change — ending is a person's decision through the task
    const b4 = await app.intakeBegin('', mail({ providerId: 'raw:' + 'c3'.repeat(20), messageId: '<cancel-1@example.test>', fromAddr: 'me@example.test', fromName: 'Me', subject: 'Cancellation of the Sunrise Cloud Team plan', text: 'We hereby cancel the Sunrise Cloud Team plan with account SC-4471 effective at the end of the current term.' }));
    assert.equal(b4.ok, true, b4.detail); const c4 = await app.intakeCommit('', b4.id); assert.equal(c4.ok, true);
    await extractWith(pic, [{ kind: 'cancellation_request', contractCandidates: [String(cid)], effectiveDate: '', proposedFields: [], uncertainties: [], summary: 'Cancellation requested' }]);
    const cp = await app.listProposals(adminTok, '', []);
    assert.equal(cp.length, 1); assert.equal(cp[0].kind, 'cancellation_request');
    const r4 = await app.decideProposal(memberTok, cp[0].id, { expectedRevision: (await app.getContract(memberTok, cid))[0].contract.revision, target: [cid], newContract: false, accept: [], note: 'noted' });
    assert.equal(r4.ok, true, r4.detail);
    rec = (await app.getContract(memberTok, cid))[0];
    assert.equal(rec.contract.status, 'active', 'the mail did not end the contract');
    const decide = rec.tasks.find((t) => t.kind === 'decide' && !t.doneAt);
    assert.ok(decide, 'decide task still open');
    assert.equal((await app.completeTask(helpdeskTok, decide.id, 'cancel', '')).ok, false, 'helpdesk cannot decide');
    assert.equal((await app.completeTask(memberTok, decide.id, 'nope', '')).ok, false, 'a decide task needs continue or cancel');
    assert.equal((await app.completeTask(memberTok, decide.id, 'cancel', 'we move on')).ok, true);
    rec = (await app.getContract(memberTok, cid))[0];
    assert.equal(rec.contract.status, 'cancelling');
    assert.ok(rec.tasks.some((t) => /Send the cancellation to the vendor/.test(t.title) && !t.doneAt), 'a follow-up task — this app never contacts the vendor');
    // the record's messages and documents belong to it; a guessed id gives nothing
    assert.equal(rec.sources.length, 2, 'rejecting a proposed match does not file the source into the selected contract'); assert.deepEqual((await app.getSource(memberTok, c4.sourceId))[0].source.contractId, []); assert.deepEqual(await app.getSource(memberTok, 9999n), []); assert.deepEqual(await app.documentData(memberTok, 9999n), []);
  } finally { await pic.tearDown(); }
});

test('contracts: the AI\'s answer is checked — no JSON, a quote that is not in the text, a candidate that was not offered: nothing is proposed', async () => {
  const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const { app, adminTok, memberId } = await contractsFixture(pic);
    const created = await app.createContract(adminTok, cinput({ responsible: memberId })); const cid = created.id;
    assert.equal((await app.addRule(adminTok, 'senderAddress', 'billing@sunrise-cloud.example', cid)).ok, true);
    assert.equal((await app.setRelayPrincipals(adminTok, [stranger.toText()])).ok, true);
    assert.equal((await app.setSpaceRelay(adminTok, stranger.toText(), true)).ok, true);
    app.setPrincipal(stranger);
    const b = await app.intakeBegin('', mail()); const c = await app.intakeCommit('', b.id); assert.equal(c.ok, true); const sid = c.sourceId;
    const status = async () => (await app.getSource(adminTok, sid))[0].source;
    // 1 · prose instead of JSON
    await pic.advanceTime(21_000); await pic.tick(2);
    await answerOutcall(pic, { choices: [{ message: { content: 'Sure! Here is what I found: the price went up.' } }] });
    await settled(pic);
    let s = await status(); assert.equal(s.status, 'received'); assert.match(s.note, /unusable.*valid JSON/);
    assert.equal((await app.listProposals(adminTok, '', [])).length, 0);
    // 2 · a fabricated quote
    assert.equal((await app.reprocessSource(adminTok, sid)).ok, true);
    await extractWith(pic, [{ kind: 'price_change', contractCandidates: [String(cid)], effectiveDate: '', proposedFields: [field('amountMinor', '9999.99', 'EUR 9,999.99')], uncertainties: [], summary: 'x' }]);
    s = await status(); assert.equal(s.status, 'received'); assert.match(s.note, /does not occur/);
    assert.equal((await app.listProposals(adminTok, '', [])).length, 0);
    // 3 · a candidate that was never offered, an unknown field, a bogus kind
    for (const [ev, why] of [
      [{ kind: 'price_change', contractCandidates: ['999'], effectiveDate: '', proposedFields: [], uncertainties: [], summary: 'x' }, /not offered/],
      [{ kind: 'price_change', contractCandidates: [String(cid)], effectiveDate: '', proposedFields: [field('ownerPassword', 'x', 'Dear customer')], uncertainties: [], summary: 'x' }, /unknown field/],
      [{ kind: 'delete_everything', contractCandidates: [], effectiveDate: '', proposedFields: [], uncertainties: [], summary: 'x' }, /unknown event kind/],
    ]) {
      assert.equal((await app.reprocessSource(adminTok, sid)).ok, true);
      await extractWith(pic, [ev]);
      s = await status(); assert.equal(s.status, 'received'); assert.match(s.note, why);
    }
    assert.equal((await app.listProposals(adminTok, '', [])).length, 0, 'nothing got through');
    // 4 · a field with evidence "missing" basis and no quote is allowed; a field without evidence otherwise is not
    assert.equal((await app.reprocessSource(adminTok, sid)).ok, true);
    await extractWith(pic, [{ kind: 'renewal_notice', contractCandidates: [String(cid)], effectiveDate: '', proposedFields: [field('currency', 'EUR', '', 'explicit')], uncertainties: [], summary: 'x' }]);
    s = await status(); assert.match(s.note, /has no evidence/);
    // the record never moved
    assert.equal((await app.getContract(adminTok, cid))[0].contract.revision, 1n);
    const cs = (await app.connectionStatus(adminTok))[0];
    assert.ok(cs.aiCallsToday >= 1n, 'reads are counted against the budget: ' + cs.aiCallsToday); // ≥ 1, not 6: the day counter may roll over at UTC midnight
  } finally { await pic.tearDown(); }
});

test('contracts: team roles — employee membership isolates content, Hub Admin overrides are explicit; import defuses formulas; a new contract from mail is a draft', async () => {
  const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const { hub, app, adminTok, memberTok, helpdeskTok, memberId, memberRoot, adminRoot, spaceId, login } = await contractsFixture(pic, { ai: false });
    const adminId = (await app.whoami(adminTok))[0].id;
    const a = await app.createContract(adminTok, cinput({ responsible: memberId })); assert.equal(a.ok, true);
    const b = await app.createContract(adminTok, cinput({ title: 'Board minutes tool', vendor: 'Quiet Vendor', product: '', customerRef: '', responsible: adminId, visibility: 'restricted' })); assert.equal(b.ok, true);
    const c = await app.createContract(adminTok, cinput({ title: 'Nimbus', vendor: 'Nimbus', product: 'Pro', customerRef: '', responsible: adminId })); assert.equal(c.ok, true);
    const titles = async (tok) => (await app.listContracts(tok, { q: '', status: '', responsible: '', onlyIncomplete: false, onlyDue: false, includeArchived: false })).map((r) => r.title).sort();
    assert.deepEqual(await titles(memberTok), ['Nimbus', 'Sunrise Cloud — Team plan'], 'a team editor sees team records except restricted records');
    assert.deepEqual(await titles(helpdeskTok), [], 'hub helpdesk is a plain member here');
    assert.deepEqual(await app.getContract(memberTok, b.id), [], 'a guessed id of a restricted contract gives nothing');
    assert.equal((await app.updateContract(helpdeskTok, c.id, 1n, cinput({ title: 'hijack' }))).ok, false, 'an outsider cannot edit');
    assert.equal((await app.setTerms(helpdeskTok, a.id, 1n, TERMS, '')).ok, false);
    const mine = await app.createContract(memberRoot, cinput({ title: 'My tool', vendor: 'Small Vendor', responsible: adminId }));
    assert.equal(mine.ok, true); assert.equal((await app.getContract(memberRoot, mine.id))[0].contract.responsible, memberId, 'a member files their own — the responsible person is them, whatever they typed');
    assert.equal((await app.getSettings(memberTok)).length, 0); assert.equal((await app.exportAll(memberTok)).length, 1, 'space members can export authorized contents');
    assert.deepEqual(await app.getContract(adminRoot, mine.id), [], 'Hub owner has no automatic access to personal files'); assert.equal((await app.setRelayPrincipals(memberTok, [])).ok, false);
    assert.equal((await app.connectionStatus(memberTok)).length, 1, 'space editors can inspect their own inbox processing');
    // the editors group in the hub makes helpdesk an editor here: everything except restricted records
    hub.setPrincipal(owner);
    const g = await hub.addGroup('contracts-editors', ''); assert.equal(g.ok, true, g.detail);
    assert.equal((await hub.setGroupMembers(g.id, ['helpdesk@example.test'], [])).ok, true);
    await pic.advanceTime(31_000); await pic.tick(3); await settled(pic); // the app's 30-second directory pull carries the new group membership
    const editorTok = await login(helpdesk);
    assert.equal((await app.whoami(editorTok))[0].role, 'member', 'retired editor group does not grant a role');
    assert.deepEqual(await titles(editorTok), [], 'Hub editor group does not grant space access');
    assert.equal((await app.openSpace(editorTok, spaceId)).ok, false);
    assert.deepEqual(await app.getContract(editorTok, b.id), []);
    assert.equal((await app.connectionStatus(editorTok)).length, 1, 'members can inspect the connection for their own workspace');
    assert.equal((await app.getSettings(editorTok)).length, 0, 'settings stay with admins');
    // import: header mapping, a row that already exists is skipped, a formula in a cell is defused on export, the responsible person resolves by address
    const csv = 'Vendor;Product;Amount;Currency;Interval;Renews;Notice months;Owner e-mail\nRocket Mail;Business;1.200,00;EUR;year;2027-03-01;3;member@example.test\n=1+1;Evil;10;EUR;month;;;\nSunrise Cloud;Team;1500.00;EUR;year;2027-01-01;3;member@example.test\n';
    const mapping = [['Vendor', 'vendor'], ['Product', 'product'], ['Amount', 'amount'], ['Currency', 'currency'], ['Interval', 'interval'], ['Renews', 'renewalDate'], ['Notice months', 'noticeMonths'], ['Owner e-mail', 'responsibleEmail']];
    assert.equal((await app.importPreview(memberTok, csv, ';', mapping)).ok, true, 'space editors can import');
    const pv = await app.importPreview(adminTok, csv, ';', mapping);
    assert.equal(pv.ok, true, pv.detail); assert.equal(pv.rows.length, 3);
    assert.equal(pv.rows.filter((r) => r.exists.length).length, 0, 'the sheet\'s Sunrise row has no customer reference, so it does not match SC-4471 — a new draft, never an overwrite');
    const ic = await app.importCommit(adminTok, csv, ';', mapping, 'sheet 2026-09');
    assert.equal(ic.ok, true, ic.detail); assert.equal(ic.created, 3n);
    const rocket = (await app.listContracts(adminTok, { q: 'Rocket', status: '', responsible: '', onlyIncomplete: false, onlyDue: false, includeArchived: false }))[0];
    const rr = (await app.getContract(adminTok, rocket.id))[0];
    assert.equal(rr.contract.terms.amountMinor[0], 120000n, '1.200,00 → minor units'); assert.equal(rr.contract.responsible, memberId, 'responsible by address'); assert.equal(rr.contract.status, 'draft'); assert.equal(rr.contract.terms.noticeDate, '2026-12-01');
    const out = await app.exportCsv(adminTok);
    assert.match(out, /"'=1\+1"/, 'a leading = is defused with a quote prefix');
    assert.doesNotMatch(out, /[\n,;]=1\+1/, 'no cell starts with a formula character');
    const mine2 = await app.exportCsv(memberTok);
    assert.ok(/Rocket Mail/.test(mine2) && !/My tool/.test(mine2) && !/Board minutes/.test(mine2) && /Nimbus/.test(mine2), 'export stays in the team and respects restricted records');
    // a proposal for an unknown vendor becomes a DRAFT contract, never an active one
    assert.equal((await app.setRelayPrincipals(adminTok, [stranger.toText()])).ok, true);
    assert.equal((await app.setSpaceRelay(adminTok, stranger.toText(), true)).ok, true);
    app.setPrincipal(stranger);
    const ib = await app.intakeBegin('', mail({ fromAddr: 'sales@pixelforge.example', fromName: 'Pixelforge', subject: 'Order confirmation — Studio plan', text: 'Thank you for your order of the Studio plan: EUR 480.00 per month, starting 2026-10-01.', messageId: '<order-1@pixelforge.example>', providerId: 'raw:' + 'd4'.repeat(20) }));
    const icm = await app.intakeCommit('', ib.id); assert.equal(icm.ok, true);
    assert.deepEqual((await app.getSource(adminTok, icm.sourceId))[0].source.contractId, [], 'no rule, no vendor match → unfiled');
    const pr = await app.proposeChange(adminTok, c.id, [icm.sourceId], [{ field: 'amountMinor', value: '480.00' }], 'typed from the order');
    assert.equal(pr.ok, true, pr.detail);
    const nd = await app.decideProposal(adminTok, pr.id, { expectedRevision: 0n, target: [], newContract: true, accept: [{ field: 'amountMinor', value: '480.00' }, { field: 'interval', value: 'month' }, { field: 'start', value: '2026-10-01' }], note: '' });
    assert.equal(nd.ok, true, nd.detail);
    const drafted = (await app.getContract(adminTok, nd.contractId))[0];
    assert.equal(drafted.contract.status, 'draft'); assert.equal(drafted.contract.vendor, 'Pixelforge'); assert.equal(drafted.contract.terms.amountMinor[0], 48000n); assert.equal(drafted.contract.origin, 'mail:' + icm.sourceId);
    assert.equal((await app.decideProposal(memberTok, pr.id, { expectedRevision: 0n, target: [], newContract: true, accept: [], note: '' })).ok, false, 'already decided');
    assert.equal((await app.getSource(adminTok, icm.sourceId))[0].source.status, 'filed');
    // sample data is removable and never touches real records
    assert.equal((await app.seedDemo(adminTok)).ok, true);
    const withDemo = (await titles(adminTok)).length;
    assert.equal((await app.removeDemo(adminTok)).ok, true);
    assert.equal((await titles(adminTok)).length, withDemo - 6, 'six sample contracts came and went');
    assert.ok((await titles(adminTok)).includes('Nimbus'));
  } finally { await pic.tearDown(); }
});

// ---- assets 0.7.0: selling a device — offer, the buyer's own acceptance, gapless numbers, Swiss QR-bill data, archive, credit note
test('assets: a device sale — only the buyer accepts the terms, numbers are gapless, the QR-bill payload and VAT split are right, the PDF is archived once, a credit note cancels', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    await pic.setTime(Date.parse('2026-09-08T10:00:00Z'));
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    // a fourth person: another member who is neither admin nor buyer
    hub.setPrincipal(owner);
    assert.equal(await hub.addLocalUser('other@example.test', 'other@example.test', '', ''), true);
    const inv = await hub.createInvite('other@example.test'); hub.setPrincipal(stranger); assert.equal(await hub.claimInvite(inv[0]), true);
    await settled(pic);
    const { actor: app, canisterId: appId } = await install(pic, 'assets', process.env.KEBAB_ASSETS_BASELINE ? { wasm: resolve(process.env.KEBAB_ASSETS_BASELINE) } : {});
    app.setPrincipal(controller); await app.setHub(hubId.toText());
    hub.setPrincipal(owner);
    const c = await connectTestApp(hub, { name: 'assets', canisterId: appId.toText(), note: '', lanes: ['identity', 'roles', 'groups'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'assets', kind: 'app', url: 'https://assets.example.test' }] });
    assert.equal(c.ok, true, c.detail);
    const login = async (p) => { hub.setPrincipal(p); const t = await hub.mintAppTicket('', c.tileId); assert.equal(t.ok, true, t.detail); const s = (await app.loginWithTicket(t.ticket))[0]; assert.ok(s); return s.token; };
    const adminTok = await login(owner), memberTok = await login(member), otherTok = await login(stranger);
    const linkSettings = { adminGroup: '', appUrl: 'https://assets.example.test/', tagPrefix: 'INV-', orgName: 'Test company' };
    assert.equal((await app.setSettings(memberTok, linkSettings)).ok, false, 'members cannot redirect notifications');
    assert.equal((await app.setSettings(adminTok, linkSettings)).ok, true);
    await settled(pic); await pic.advanceTime(2000); await pic.tick(3); // the id migration timer of a fresh install
    // billing: the company as creditor (SIX's example IBAN passes mod 97)
    const billing = { legalName: 'Test company AG', street: 'Musterstrasse', houseNo: '11', postalCode: '8002', town: 'Zürich', country: 'CH', uid: 'CHE-123.456.789', vatRegistered: true, vatRateBp: 810n, iban: 'CH93 0076 2011 6238 5295 7', currency: 'CHF', prefix: 'IT-', yearInNumber: true, paymentDays: 14n, lang: 'en', depreciationMonths: 36n, floorPct: 10n, minPriceMinor: 5000n, waiverText: 'Used equipment, no warranty, wiped before hand-over.', waiverVersion: 1n, footer: '' };
    assert.equal((await app.setBilling(memberTok, billing)).ok, false, 'members do not set billing');
    assert.equal((await app.setBilling(adminTok, { ...billing, iban: 'CH93 0076 2011 6238 5295 8' })).ok, false, 'a wrong IBAN check digit is refused');
    const sb = await app.setBilling(adminTok, billing); assert.equal(sb.ok, true, sb.detail);
    assert.equal((await app.getBilling(memberTok)).length, 0);
    const b = (await app.getBilling(adminTok))[0]; assert.equal(b.iban, 'CH9300762011623852957'); assert.equal(b.waiverVersion, 2n, 'a changed terms text bumps the version');
    // the device, with the member as holder and a purchase price
    const ca = await app.createAsset(adminTok, { tag: 'INV-0042', serial: 'C02TESTSERIAL1', vendor: 'Apple', model: 'MacBook Pro 14"', kind: 'laptop', note: '' }); assert.equal(ca.ok, true, ca.detail);
    const aid = ca.id;
    assert.equal((await app.addEventTo(adminTok, aid, 'handed_out', 'member@example.test', '')).ok, true);
    assert.equal((await app.setPurchase(adminTok, aid, [299900n], 'CHF', '2024-03-01', 'shop')).ok, true);
    const sod = await app.saleOfDevice(adminTok, aid);
    assert.ok(sod.proposal.length && sod.proposal[0].proposedMinor >= 29990n && sod.proposal[0].proposedMinor < 299900n, 'the rule proposes a written-down price: ' + (sod.proposal[0] && sod.proposal[0].proposedMinor));
    assert.equal(sod.billingReady, '', 'billing complete');
    // the sale: buyer picked by address (the picker's vocabulary), resolved to the person id
    const buyer = { pid: 'member@example.test', name: '', email: '', street: '', houseNo: '', postalCode: '', town: '', country: 'CH' };
    assert.equal((await app.createSale(memberTok, aid, buyer, 65000n, '')).ok, false, 'admins start sales');
    const cs = await app.createSale(adminTok, aid, buyer, 65000n, 'battery worn'); assert.equal(cs.ok, true, cs.detail); const sid = cs.id;
    assert.equal((await app.createSale(adminTok, aid, buyer, 65000n, '')).ok, false, 'one open sale per device');
    let v = (await app.getSale(adminTok, sid))[0];
    assert.equal(v.sale.status, 'draft'); assert.equal(v.sale.buyer.name, 'member@example.test', 'name follows the directory (local users carry their address as name)'); assert.equal(v.sale.buyer.email, 'member@example.test');
    assert.equal(v.sale.netMinor, 60130n); assert.equal(v.sale.vatMinor, 4870n);
    assert.equal((await app.issueInvoice(adminTok, sid)).ok, false, 'no invoice before acceptance');
    // 0.8.4 — a refused notification is no longer silent: the app was connected without the notify lane
    if (process.env.KEBAB_ASSETS_BASELINE) {
      assert.equal((await app.info()).version, process.env.KEBAB_ASSETS_BASELINE_VERSION || '0.8.4');
      await pic.upgradeCanister({ sender: controller, canisterId: appId, wasm: candidateWasm('assets'), upgradeModeOptions: { skip_pre_upgrade: [], wasm_memory_persistence: [{ keep: null }] } });
      assert.equal((await app.info()).version, readFileSync('assets/mops.toml','utf8').match(/^version\s*=\s*"([^"]+)"/m)[1]);
      assert.equal((await app.getSale(adminTok, sid))[0].sale.status, 'draft', 'sale survives upgrade');
      assert.equal((await app.getSettings(adminTok))[0].appUrl, linkSettings.appUrl, 'configured URL survives upgrade');
    }
    const offered1 = await app.offerSale(adminTok, sid); assert.equal(offered1.ok, true); assert.match(offered1.detail, /could NOT be notified: this app has no notify lane/);
    let nt = (await app.notifyStatus(adminTok))[0]; assert.equal(nt.ok, false); assert.equal(nt.to, 'member@example.test'); assert.match(nt.detail, /notify lane/);
    assert.deepEqual(await app.notifyStatus(memberTok), [], 'members do not see delivery state');
    hub.setPrincipal(owner); assert.equal((await hub.setConnectorLanes(c.id, ['identity', 'roles', 'groups', 'notify'])).ok, true);
    const offered2 = await app.offerSale(adminTok, sid); assert.equal(offered2.ok, true, offered2.detail); assert.match(offered2.detail, /was told through the hub/);
    nt = (await app.notifyStatus(adminTok))[0]; assert.equal(nt.ok, true);
    hub.setPrincipal(member); const memberSuite = (await app.loginWithTicket((await hub.mintAppTicket('', c.tileId)).ticket))[0].suiteToken;
    const bell = await hub.myNotifications(memberSuite, 10n); assert.ok(bell.items.some((n) => /offered to you/.test(n.title)), 'the offer reaches the buyer\'s bell: ' + JSON.stringify(bell.items.map((n) => n.title)));
    assert.equal(bell.items.find(n => n.kind === 'assets.offer').url, `https://assets.example.test/#/offers/${sid}`, 'offer notification links to this sale without a doubled slash');
    // the buyer sees it; nobody else accepts for them
    assert.equal((await app.myOffers(memberTok)).length, 1); assert.equal((await app.myOffers(otherTok)).length, 0);
    assert.equal((await app.getSale(otherTok, sid)).length, 0, 'another member cannot open the sale');
    const address = [{ street: 'Seestrasse', houseNo: '7b', postalCode: '8802', town: 'Kilchberg', country: 'CH' }];
    assert.equal((await app.acceptOffer(adminTok, sid, 2n, address)).ok, false, 'an admin cannot accept for the buyer');
    assert.equal((await app.acceptOffer(otherTok, sid, 2n, address)).ok, false, 'another person cannot accept');
    assert.equal((await app.recordWaiver(adminTok, sid, 'signed scan')).ok, false, 'paper acceptance is for outside buyers only');
    assert.match((await app.acceptOffer(memberTok, sid, 1n, address)).detail, /terms changed/, 'the version shown must be the current one');
    assert.match((await app.acceptOffer(memberTok, sid, 2n, [])).detail, /postal address/, 'the invoice needs the buyer address');
    const acc = await app.acceptOffer(memberTok, sid, 2n, address); assert.equal(acc.ok, true, acc.detail);
    v = (await app.getSale(memberTok, sid))[0]; assert.equal(v.sale.status, 'accepted'); assert.equal(v.sale.acceptedHow, 'online'); assert.equal(v.sale.buyer.town, 'Kilchberg');
    // issue: checks first, then the gapless number, the SCOR reference, the QR payload, the device marked sold
    assert.equal((await app.completeSaleHandover(adminTok, sid, true, '')).ok, false, 'no delivery before payment');
    assert.equal((await app.setSaleChecks(adminTok, sid, true, true)).ok, true);
    const is = await app.issueInvoice(adminTok, sid); assert.equal(is.ok, true, is.detail);
    const invoiceBell = await hub.myNotifications(memberSuite, 10n);
    assert.equal(invoiceBell.items.find(n => n.kind === 'assets.invoice').url, `https://assets.example.test/#/offers/${sid}`, 'invoice notification opens the same buyer record');
    assert.match(is.invoiceNo, /^IT-\d{4}-0001$/, is.invoiceNo);
    v = (await app.getSale(adminTok, sid))[0];
    const d = v.invoice[0];
    assert.equal(d.number, is.invoiceNo); assert.match(d.reference, /^RF\d{2}IT\d{4}0001$/, d.reference);
    const lines = d.qrPayload.split('\n');
    assert.equal(lines.length, 32, 'QR payload: 32 elements incl. billing information');
    assert.deepEqual(lines.slice(0, 5), ['SPC', '0200', '1', 'CH9300762011623852957', 'S']);
    assert.deepEqual(lines.slice(5, 11), ['Test company AG', 'Musterstrasse', '11', '8002', 'Zürich', 'CH']);
    assert.deepEqual(lines.slice(11, 18), ['', '', '', '', '', '', ''], 'no ultimate creditor');
    assert.deepEqual(lines.slice(18, 20), ['650.00', 'CHF']);
    assert.deepEqual(lines.slice(20, 27), ['S', 'member@example.test', 'Seestrasse', '7b', '8802', 'Kilchberg', 'CH']);
    assert.equal(lines[27], 'SCOR'); assert.equal(lines[28], d.reference); assert.equal(lines[30], 'EPD');
    assert.match(lines[31], /^\/\/S1\/10\/IT-\d{4}-0001\/11\/\d{6}\/30\/123456789\/32\/8\.1\/40\/0:14$/, lines[31]);
    assert.ok(d.qrPayload.length <= 997);
    assert.equal(d.net, '601.30'); assert.equal(d.vat, '48.70'); assert.equal(d.gross, '650.00'); assert.equal(d.vatRate, '8.1');
    assert.match(d.acceptedLine, /^Accepted online by member@example\.test \(member@example\.test\) on \d{4}-\d{2}-\d{2} via the company sign-in — terms v2, sale record #1\.$/, d.acceptedLine);
    const asset = (await app.getAsset(adminTok, aid))[0]; assert.equal(asset.asset.status, 'assigned', 'invoicing does not assert a hand-over');
    // archive: once, PDF only, readable by admins and the buyer
    assert.equal((await app.attachSaleDocument(adminTok, sid, 'invoice', new Uint8Array(200))).ok, false, 'not a PDF');
    const pdf = new Uint8Array(300); pdf.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    assert.equal((await app.attachSaleDocument(memberTok, sid, 'invoice', pdf)).ok, false, 'buyers do not archive');
    const at = await app.attachSaleDocument(adminTok, sid, 'invoice', pdf); assert.equal(at.ok, true, at.detail);
    assert.match((await app.attachSaleDocument(adminTok, sid, 'invoice', pdf)).detail, /already archived/);
    assert.equal((await app.saleDocument(memberTok, at.docId)).length, 1, 'the buyer downloads their invoice');
    assert.equal((await app.saleDocument(otherTok, at.docId)).length, 0, 'nobody else does');
    assert.equal((await app.saleDocument(adminTok, at.docId))[0].hash.length, 64);
    assert.equal((await app.updateSale(adminTok, sid, v.sale.buyer, 60000n, '', '')).ok, false, 'an issued invoice is not edited');
    // a second sale on another device: the next number; cancelling it after issue yields a numbered credit note and the device goes back to stock
    const ca2 = await app.createAsset(adminTok, { tag: 'INV-0043', serial: 'C02TESTSERIAL2', vendor: 'Apple', model: 'iPad', kind: 'tablet', note: '' });
    const ext = { pid: '', name: 'Outside Buyer GmbH', email: 'buy@outside.example', street: 'Bahnhofstrasse', houseNo: '1', postalCode: '8001', town: 'Zürich', country: 'CH' };
    const cs2 = await app.createSale(adminTok, ca2.id, ext, 20000n, ''); assert.equal(cs2.ok, true, cs2.detail);
    assert.equal((await app.offerSale(adminTok, cs2.id)).ok, true);
    assert.equal((await app.recordWaiver(adminTok, cs2.id, '')).ok, false, 'where is the signed copy?');
    assert.equal((await app.recordWaiver(adminTok, cs2.id, 'signed copy in the IT folder')).ok, true);
    assert.equal((await app.setSaleChecks(adminTok, cs2.id, true, true)).ok, true);
    const is2 = await app.issueInvoice(adminTok, cs2.id); assert.equal(is2.ok, true, is2.detail); assert.match(is2.invoiceNo, /-0002$/, 'gapless: ' + is2.invoiceNo);
    assert.equal((await app.getSale(adminTok, cs2.id))[0].invoice[0].acceptedLine.startsWith('Signed on paper — signed copy in the IT folder'), true);
    assert.equal((await app.cancelSale(adminTok, cs2.id, '')).ok, false, 'a reason is required');
    const cn = await app.cancelSale(adminTok, cs2.id, 'buyer withdrew'); assert.equal(cn.ok, true, cn.detail); assert.match(cn.creditNoteNo, /-0003$/, 'the credit note takes the next number: ' + cn.creditNoteNo);
    const v2 = (await app.getSale(adminTok, cs2.id))[0]; assert.equal(v2.sale.status, 'cancelled'); assert.equal(v2.creditNote[0].creditOf, is2.invoiceNo); assert.equal(v2.creditNote[0].qrPayload, '', 'a credit note has no payment part');
    assert.equal((await app.getAsset(adminTok, ca2.id))[0].asset.status, 'in_stock', 'the device is back in stock');
    // paid, and finance's export lists invoices and the credit note
    assert.equal((await app.markPaid(adminTok, sid, 'bank statement 12')).ok, true);
    assert.equal((await app.getSale(adminTok, sid))[0].sale.status, 'paid');
    assert.equal((await app.salesBoard(memberTok,'', '', 0n)).total,0n,'members cannot read the sales board');
    let board = await app.salesBoard(adminTok,'paid','',0n);
    assert.equal(board.matched,1n); assert.equal(board.rows[0].phase,'paid');
    assert.ok(!('buyer' in board.rows[0]) && !('email' in board.rows[0]),'summary excludes address and email');
    assert.equal((await app.completeSaleHandover(memberTok,sid,true,'')).ok,false);
    assert.equal((await app.setSaleChecks(adminTok,sid,false,true)).ok,true,'checks remain editable after payment');
    assert.equal((await app.completeSaleHandover(adminTok,sid,true,'')).ok,false,'wipe is required');
    assert.equal((await app.setSaleChecks(adminTok,sid,true,true)).ok,true);
    assert.equal((await app.completeSaleHandover(adminTok,sid,true,'Collected')).ok,true);
    assert.equal((await app.completeSaleHandover(adminTok,sid,true,'Retry')).ok,true,'completion is idempotent');
    assert.equal((await app.setSaleChecks(adminTok,sid,false,false)).ok,false,'completed checks are locked');
    assert.equal((await app.getAsset(adminTok,aid))[0].asset.status,'sold');
    board = await app.salesBoard(adminTok,'complete','',0n);
    assert.equal(board.matched,1n); assert.equal(board.rows[0].phase,'complete');
    assert.equal((await app.salesBoard(adminTok,'open','',0n)).matched,0n,'closed and cancelled are excluded from work queue');
    assert.equal((await app.salesBoard(adminTok,'complete','unmatched search',0n)).matched,0n);
    assert.equal((await app.salesBoard(adminTok,'complete','',100n)).rows.length,0);

    const csv = await app.salesExportCsv(adminTok, '');
    assert.equal(csv.split('\n').filter(Boolean).length, 4, 'header + 2 invoices + 1 credit note');
    assert.match(csv, new RegExp(`"${is.invoiceNo}",invoice,"\\d{4}-\\d{2}-\\d{2}","\\d{4}-\\d{2}-\\d{2}","paid","member@example.test"`), csv);
    assert.match(csv, new RegExp(`"${cn.creditNoteNo}",credit note,"\\d{4}-\\d{2}-\\d{2}",,cancelled,"Outside Buyer GmbH",.*,-185.01,8.1,-14.99,-200.00,"CHF"`), csv);
    assert.equal(await app.salesExportCsv(memberTok, ''), '', 'the export is for admins');
    assert.deepEqual(await app.listSales(memberTok, ''), []);
    assert.equal((await app.listSales(adminTok, 'paid')).length, 1);
  } finally { await pic.tearDown(); }
});

// ---- hub 0.20: SCIM sources — two identity providers, each in its own scope
async function scimG(hub, token, method, path = '', value = null) {
  const r = await hub.http_request_update({ method, url: '/scim/v2/Groups' + path, headers: [['Authorization', 'Bearer ' + token]], body: Buffer.from(value ? JSON.stringify(value) : '') });
  return { status: r.status_code, body: JSON.parse(Buffer.from(r.body).toString() || '{}') };
}
test('SCIM sources: two providers see only their own people and groups; domain scope; one address per source; rotation, pause, removal; the old token is source 1', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner);
    // the pre-0.20 method still works and is source 1
    const legacy = await hub.genScimToken(); assert.equal(legacy.length, 128);
    let list = await hub.listScimSources(); assert.equal(list.length, 1); assert.equal(list[0].id, 1n); assert.equal(list[0].name, 'SCIM'); assert.equal(list[0].enabled, true);
    const b = await hub.addScimSource('Okta B', ['@b.example', 'B.EXAMPLE']); assert.equal(b.ok, true, b.detail); assert.equal(b.id, 2n); assert.equal(b.token.length, 128);
    assert.equal((await hub.addScimSource('okta b', [])).ok, false, 'source names are unique');
    assert.deepEqual((await hub.listScimSources()).find((x) => x.id === 2n).domains, ['b.example'], 'domains are cleaned');
    hub.setPrincipal(helpdesk); assert.equal((await hub.addScimSource('X', [])).ok, false, 'owners add sources'); hub.setPrincipal(owner);
    // each provisions its own people
    const a1 = await scim(hub, legacy, 'POST', '', { userName: 'alice@a.example', displayName: 'Alice', active: true }); assert.equal(a1.status, 201, JSON.stringify(a1.body));
    const b1 = await scim(hub, b.token, 'POST', '', { userName: 'bob@b.example', displayName: 'Bob', active: true }); assert.equal(b1.status, 201, JSON.stringify(b1.body));
    const bx = await scim(hub, b.token, 'POST', '', { userName: 'carol@a.example', displayName: 'Carol', active: true }); assert.equal(bx.status, 403, 'outside the source\'s domains'); assert.match(bx.body.detail, /b\.example/);
    const ax = await scim(hub, legacy, 'POST', '', { userName: 'bob@b.example', displayName: 'Bob again', active: true }); assert.equal(ax.status, 409); assert.match(ax.body.detail, /another source \(Okta B\)/);
    assert.deepEqual((await scim(hub, legacy, 'GET')).body.Resources.map((u) => u.userName), ['alice@a.example'], 'A lists only its own');
    assert.deepEqual((await scim(hub, b.token, 'GET')).body.Resources.map((u) => u.userName), ['bob@b.example'], 'B lists only its own');
    assert.equal((await scim(hub, b.token, 'GET', '/' + a1.body.id)).status, 404, 'a foreign id does not exist for B');
    assert.equal((await scim(hub, b.token, 'DELETE', '/' + a1.body.id)).status, 404);
    assert.equal((await scim(hub, b.token, 'PATCH', '/' + b1.body.id, { Operations: [{ op: 'replace', path: 'userName', value: 'bob@a.example' }] })).status, 403, 'a rename outside the domains is refused');
    // groups: unique names across the hub; each source sees its own
    const ga = await scimG(hub, legacy, 'POST', '', { displayName: 'Engineering', members: [{ value: a1.body.id }] }); assert.equal(ga.status, 201, JSON.stringify(ga.body));
    const gb = await scimG(hub, b.token, 'POST', '', { displayName: 'Engineering', members: [] }); assert.equal(gb.status, 409); assert.match(gb.body.detail, /another source/);
    const gb2 = await scimG(hub, b.token, 'POST', '', { displayName: 'Sales', members: [{ value: b1.body.id }] }); assert.equal(gb2.status, 201, JSON.stringify(gb2.body));
    assert.deepEqual((await scimG(hub, b.token, 'GET')).body.Resources.map((g) => g.displayName), ['Sales']);
    assert.deepEqual((await scimG(hub, legacy, 'GET')).body.Resources.map((g) => g.displayName), ['Engineering']);
    assert.equal((await scimG(hub, b.token, 'GET', '/' + ga.body.id)).status, 404, "A's group is invisible to B");
    assert.deepEqual((await scimG(hub, b.token, 'GET', '/' + gb2.body.id)).body.members.map((m) => m.display), ['bob@b.example']);
    // the directory knows both, named by source
    const users = (await hub.listUsers({ offset: 0n, limit: 100n, conn: [], search: '', activeOnly: false })).items;
    assert.equal(users.find((u) => u.email === 'alice@a.example').connName, 'SCIM'); assert.equal(users.find((u) => u.email === 'bob@b.example').connName, 'Okta B');
    // rotation: the old key dies at once; for source 1 the pre-0.20 plain token dies with it
    const rot = await hub.rotateScimSourceToken(2n); assert.equal(rot.ok, true, rot.detail);
    assert.equal((await scim(hub, b.token, 'GET')).status, 401); assert.equal((await scim(hub, rot.token, 'GET')).status, 200);
    assert.equal((await hub.listScimSources()).find((x) => x.id === 1n).legacyToken, false, 'a fresh 0.20 hub has no plain token');
    const rot1 = await hub.rotateScimSourceToken(1n); assert.equal(rot1.ok, true);
    assert.equal((await scim(hub, legacy, 'GET')).status, 401); assert.equal((await scim(hub, rot1.token, 'GET')).status, 200);
    assert.equal((await hub.listScimSources()).find((x) => x.id === 1n).legacyToken, false);
    // pause: pushes refused, its groups become editable here; the other source is untouched
    assert.equal((await hub.setScimSourceEnabled(2n, false)).ok, true);
    assert.equal((await scim(hub, rot.token, 'GET')).status, 401);
    let groups = await hub.listGroups();
    assert.equal(groups.find((g) => g.name === 'Sales').editable, true); assert.equal(groups.find((g) => g.name === 'Engineering').editable, false);
    assert.equal((await hub.setScimSourceEnabled(2n, true)).ok, true); assert.equal((await scim(hub, rot.token, 'GET')).status, 200);
    const st = await hub.scimStatus(); assert.equal(st.enabled, true); assert.equal(st.userCount, 2n);
    assert.equal((await hub.updateScimSource(2n, 'Okta B', [], 'now any domain')).ok, true);
    assert.equal((await scim(hub, rot.token, 'POST', '', { userName: 'dave@c.example', displayName: 'Dave', active: true })).status, 201, 'domain scope lifted');
    // removal: its people are dropped, its groups stay as ordinary groups, the other source keeps everything
    const rm = await hub.removeScimSource(2n); assert.equal(rm.ok, true, rm.detail); assert.equal(rm.people, 2n);
    assert.equal((await scim(hub, rot.token, 'GET')).status, 401);
    groups = await hub.listGroups();
    assert.equal(groups.find((g) => g.name === 'Sales').source, 'manual'); assert.equal(groups.find((g) => g.name === 'Engineering').source, 'scim');
    assert.deepEqual((await scim(hub, rot1.token, 'GET')).body.Resources.map((u) => u.userName), ['alice@a.example']);
    assert.equal((await hub.listUsers({ offset: 0n, limit: 100n, conn: [], search: '', activeOnly: false })).items.some((u) => u.email === 'bob@b.example'), false, 'bob is gone');
    assert.equal((await hub.scimStatus()).userCount, 1n);
  } finally { await pic.tearDown(); }
});

test('SCIM attributes: enterprise fields, the work address and custom-schema attributes are stored and drive an app\'s exclude filters', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);
    hub.setPrincipal(owner);
    const token = await hub.genScimToken();
    const ENT = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
    const CUSTOM = 'urn:okta:acme_scim:1.0:user:custom';
    const post = (userName, displayName, addr, custom) => scim(hub, token, 'POST', '', {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User', ENT, CUSTOM],
      userName, displayName, title: 'Engineer', active: true,
      addresses: [{ type: 'home', locality: 'Bern' }, { type: 'work', streetAddress: 'Somewhere 1', postalCode: '8000', ...addr }],
      [ENT]: { department: 'Engineering', costCenter: 'CC-7', employeeNumber: '4711', manager: { value: 'm1', displayName: 'Mia Manager' } },
      [CUSTOM]: custom,
    });
    const zh = await post('zoe@example.test', 'Zoe', { locality: 'Zurich', region: 'ZH', country: 'CH' }, { entity: 'AG', onsite: true });
    assert.equal(zh.status, 201, JSON.stringify(zh.body));
    const us = await post('ray@example.test', 'Ray', { locality: 'Remote - US', region: 'CA', country: 'US' }, { entity: 'LLC', onsite: false });
    assert.equal(us.status, 201, JSON.stringify(us.body));
    const attrs = async (id) => Object.fromEntries((await hub.getUser(`900000000:${id}`))[0].attributes);
    let a = await attrs(zh.body.id);
    assert.equal(a.department, 'Engineering', 'enterprise extension is read (was dropped before 0.20.1)');
    assert.equal(a.costCenter, 'CC-7'); assert.equal(a.employeeNumber, '4711'); assert.equal(a.manager, 'Mia Manager');
    assert.equal(a.city, 'Zurich', 'work address wins over home'); assert.equal(a.state, 'ZH'); assert.equal(a.countryCode, 'CH');
    assert.equal(a.entity, 'AG'); assert.equal(a.onsite, 'true');
    assert.equal(a.streetAddress, undefined, 'street is not kept'); assert.equal(a.postalCode, undefined);
    // an app registered by hand (no manifest) gets the same population rule the pull lane uses
    const lunch = await connectTestApp(hub, { name: 'Lunch', canisterId: 'aaaaa-aa', note: '', lanes: ['identity'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [] });
    assert.equal(lunch.ok, true, lunch.detail);
    assert.equal((await hub.accessPreview(lunch.id)).count, 5n, 'owner, helpdesk, member + both SCIM people');
    assert.equal(await hub.setConnectorFilters(lunch.id, ['city^=Remote', 'entity=LLC']), true);
    let pv = await hub.accessPreview(lunch.id);
    assert.equal(pv.count, 4n, 'the remote LLC person is excluded'); assert.equal(pv.sample.includes('Ray'), false); assert.equal(pv.sample.includes('Zoe'), true);
    // PATCH: Okta-style whole address object, Entra-style scalar path, custom-extension path, removal
    const pid = zh.body.id;
    let r = await scim(hub, token, 'PATCH', '/' + pid, { Operations: [{ op: 'replace', path: 'addresses[type eq "work"]', value: { locality: 'Remote - CH', region: 'BE', country: 'CH' } }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    a = await attrs(pid); assert.equal(a.city, 'Remote - CH'); assert.equal(a.state, 'BE');
    assert.equal((await hub.accessPreview(lunch.id)).count, 3n, 'moving to a Remote city excludes the person');
    r = await scim(hub, token, 'PATCH', '/' + pid, { Operations: [{ op: 'replace', path: 'addresses[type eq "work"].locality', value: 'Zurich' }, { op: 'replace', path: `${CUSTOM}:entity`, value: 'GmbH' }, { op: 'replace', path: `${ENT}:department`, value: 'Ops' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    a = await attrs(pid); assert.equal(a.city, 'Zurich'); assert.equal(a.entity, 'GmbH'); assert.equal(a.department, 'Ops');
    assert.equal(Object.keys(a).filter((k) => k.toLowerCase() === 'entity').length, 1, 'no duplicate keys after a PATCH');
    assert.equal((await hub.accessPreview(lunch.id)).count, 4n);
    r = await scim(hub, token, 'PATCH', '/' + pid, { Operations: [{ op: 'remove', path: `${CUSTOM}:entity` }] });
    assert.equal(r.status, 200); a = await attrs(pid); assert.equal(a.entity, undefined, 'remove drops the attribute');
    // path-less PUT-style replace keeps working and refreshes the address
    r = await scim(hub, token, 'PATCH', '/' + pid, { Operations: [{ op: 'replace', value: { addresses: [{ type: 'work', locality: 'Basel' }] } }] });
    assert.equal(r.status, 200); a = await attrs(pid); assert.equal(a.city, 'Basel');
  } finally { await pic.tearDown(); }
});

test('assets: Apple Business Manager — a browser-signed 180-day assertion (the key never reaches the canister), devices and their device-management service, the gap, adoption as unknown, an MDM sync links by serial', async () => {
  const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    await settled(pic);
    const { actor: app, canisterId: appId, idlFactory: appIdl } = await install(pic, 'assets');
    app.setPrincipal(controller); await app.setHub(hubId.toText());
    hub.setPrincipal(owner);
    const c = await connectTestApp(hub, { name: 'assets', canisterId: appId.toText(), note: '', lanes: ['identity', 'roles', 'groups'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: 'assets', kind: 'app', url: 'https://assets.example.test' }] });
    assert.equal(c.ok, true, c.detail);
    const login = async (p) => { hub.setPrincipal(p); const t = await hub.mintAppTicket('', c.tileId); assert.equal(t.ok, true, t.detail); const s = (await app.loginWithTicket(t.ticket))[0]; assert.ok(s); return s.token; };
    let adminTok = await login(owner), memberTok = await login(member);
    await settled(pic); await pic.advanceTime(2000); await pic.tick(3);
    // one device is already in the register
    const existing = await app.createAsset(adminTok, { tag: 'INV-0001', serial: 'C02ABM000001', vendor: 'Apple', model: 'MacBook Pro 14"', kind: 'laptop', note: '' });
    assert.equal(existing.ok, true, existing.detail);
    // what the browser does with the .pem Apple issued: sign a client assertion (ES256, ≤ 180 days) — the key stays there
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const clientId = 'BUSINESSAPI.c75c0a8a-a026-4dae-99aa-89ea1e1103e5', keyId = 'e339d085-a821-438a-a527-d044edacf50a';
    const assertionFor = async (over = {}) => {
      const t = Math.floor((await pic.getTime()) / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT', ...over.header })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ iss: clientId, sub: clientId, aud: 'https://account.apple.com/auth/oauth2/v2/token', iat: t, exp: t + 180 * 86400 - 3600, jti: 'jti-' + t, ...over.claims })).toString('base64url');
      const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
      return `${header}.${payload}.${sig.toString('base64url')}`;
    };
    const good = await assertionFor();
    assert.equal((await app.addAbm(memberTok, { name: 'ABM', clientId, keyId, assertion: [good] })).ok, false, 'admins only');
    assert.equal((await app.addAbm(adminTok, { name: 'ABM', clientId: 'not-a-client', keyId, assertion: [good] })).ok, false, 'client id shape is checked');
    assert.equal((await app.addAbm(adminTok, { name: 'ABM', clientId, keyId, assertion: [] })).ok, false, 'no assertion, no connection');
    assert.equal((await app.addAbm(adminTok, { name: 'ABM', clientId, keyId: '', assertion: [good] })).ok, false, 'the key id is required');
    assert.match((await app.addAbm(adminTok, { name: 'ABM', clientId, keyId: 'other-kid', assertion: [good] })).detail, /signed for key id/, 'kid must match the key id');
    assert.match((await app.addAbm(adminTok, { name: 'ABM', clientId, keyId, assertion: [await assertionFor({ claims: { sub: 'BUSINESSAPI.x', iss: 'BUSINESSAPI.x' } })] })).detail, /another client id/);
    assert.match((await app.addAbm(adminTok, { name: 'ABM', clientId, keyId, assertion: [await assertionFor({ header: { alg: 'RS256' } })] })).detail, /ES256/);
    assert.match((await app.addAbm(adminTok, { name: 'ABM', clientId, keyId, assertion: [await assertionFor({ claims: { exp: Math.floor((await pic.getTime()) / 1000) - 10 } })] })).detail, /already expired/);
    assert.match((await app.addAbm(adminTok, { name: 'ABM', clientId, keyId, assertion: [await assertionFor({ claims: { exp: Math.floor((await pic.getTime()) / 1000) + 400 * 86400 } })] })).detail, /180 days/);
    const added = await app.addAbm(adminTok, { name: 'Apple Business Manager · Group', clientId, keyId, assertion: [good] });
    assert.equal(added.ok, true, added.detail);
    const conns = await app.listAbm(adminTok);
    assert.equal(conns.length, 1); assert.equal(conns[0].scope, 'business.api'); assert.ok(Number(conns[0].signedUntil) > Number(await pic.getTime()) * 1e6, 'signedUntil is in the future');
    assert.equal(Object.keys(conns[0]).some((k) => /key$|assertion|jwt/i.test(k)), false, 'neither key nor assertion is readable');
    assert.deepEqual(await app.listAbm(memberTok), []);
    // the token exchange: Apple's parameters in the query string, the assertion signed with OUR key
    const expectToken = async () => {
      const call = await answerOutcall(pic, { access_token: 'abm-at', token_type: 'Bearer', expires_in: 3600, scope: 'business.api' });
      if (call.httpMethod !== undefined) assert.equal(String(call.httpMethod).toUpperCase(), 'POST');
      const u = new URL(call.url);
      assert.equal(u.origin + u.pathname, 'https://account.apple.com/auth/oauth2/token');
      assert.equal(u.searchParams.get('grant_type'), 'client_credentials'); assert.equal(u.searchParams.get('client_id'), clientId); assert.equal(u.searchParams.get('scope'), 'business.api');
      assert.equal(u.searchParams.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      assert.equal(u.searchParams.get('client_assertion'), good, 'the canister sends exactly the browser-signed assertion');
      const [h, p, s] = good.split('.');
      assert.equal(verify('sha256', Buffer.from(h + '.' + p), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true, 'the assertion verifies with the public key');
    };
    const device = (serial, over = {}) => ({ type: 'orgDevices', id: serial, attributes: { serialNumber: serial, deviceModel: 'MacBook Pro 14"', productFamily: 'Mac', productType: 'MacBookPro18,3', deviceCapacity: '512GB', color: 'Space Gray', orderNumber: 'W123', orderDateTime: '2024-03-12T09:41:00Z', addedToOrgDateTime: '2024-03-14T10:00:00Z', purchaseSourceType: 'RESELLER', status: 'ASSIGNED', updatedDateTime: '2026-09-01T00:00:00Z', ...over } });
    // test: token + first page only
    const defer = pic.createDeferredActor(appIdl, appId);
    let pending = await defer.testAbm(adminTok, added.id);
    await expectToken();
    let page = await answerOutcall(pic, { data: [device('C02ABM000001'), device('F9XQ2ABM0001', { deviceModel: 'iPhone 15', productFamily: 'iPhone', productType: 'iPhone15,4', deviceCapacity: '128GB', color: 'Black', orderDateTime: '2025-01-20T08:00:00Z' })], links: { self: 'x', next: 'https://api-business.apple.com/v1/orgDevices?cursor=p2&limit=200' } });
    assert.match(page.url, /^https:\/\/api-business\.apple\.com\/v1\/orgDevices\?limit=50&fields%5BorgDevices%5D=serialNumber,/, 'small pages with a sparse fieldset — mo:json is quadratic in the body size'); assert.ok(page.headers.some((x) => (x.name || x[0]).toLowerCase() === 'authorization' && (x.value || x[1]) === 'Bearer abm-at'));
    let r = await pending(); assert.equal(r.ok, true, r.detail); assert.match(r.detail, /2 devices on the first page, 1 already in the register/);
    // sync: two pages of devices, two device-management services
    pending = await defer.syncAbm(adminTok, added.id);
    await expectToken();
    await answerOutcall(pic, { data: [device('C02ABM000001'), device('F9XQ2ABM0001', { deviceModel: 'iPhone 15', productFamily: 'iPhone', productType: 'iPhone15,4', deviceCapacity: '128GB', color: 'Black', orderDateTime: '2025-01-20T08:00:00Z' })], links: { self: 'x', next: 'https://api-business.apple.com/v1/orgDevices?cursor=p2&limit=200' } });
    page = await answerOutcall(pic, { data: [device('F9XQ2ABM0002', { deviceModel: 'iPad Air', productFamily: 'iPad', productType: 'iPad13,16', deviceCapacity: '64GB', color: 'Blue', status: 'UNASSIGNED', purchaseSourceType: 'APPLE', orderDateTime: '2023-11-02T00:00:00Z' }), device('DESKTOP000001', { deviceModel: 'Mac mini', productType: 'Macmini9,1' })], links: { self: 'y' } });
    assert.match(page.url, /cursor=p2/);
    const servers = await answerOutcall(pic, { data: [{ type: 'mdmServers', id: 'srv-a', attributes: { serverName: 'Iru · Group', serverType: 'MDM' } }, { type: 'mdmServers', id: 'srv-b', attributes: { serverName: 'Iru · Second', serverType: 'MDM' } }] });
    assert.match(servers.url, /\/v1\/mdmServers\?limit=100$/);
    const relA = await answerOutcall(pic, { data: [{ type: 'orgDevices', id: 'C02ABM000001' }, { type: 'orgDevices', id: 'F9XQ2ABM0001' }], links: { self: 'z' } });
    assert.match(relA.url, /\/v1\/mdmServers\/srv-a\/relationships\/devices\?limit=500$/);
    await answerOutcall(pic, { data: [{ type: 'orgDevices', id: 'DESKTOP000001' }], links: { self: 'z' } });
    r = await pending(); assert.equal(r.ok, true, r.detail);
    assert.equal(r.detail, '4 devices · 1 in the register · 3 not in the register · 1 without a device-management service · 2 services');
    // the gap, three ways
    const all = await app.listAbmDevices(adminTok, 'all', 0n); assert.equal(all.length, 4);
    assert.equal(all.find((x) => x.device.serial === 'C02ABM000001').assetTag, 'INV-0001'); assert.equal(all.find((x) => x.device.serial === 'C02ABM000001').device.mdmServer, 'Iru · Group');
    assert.equal((await app.listAbmDevices(adminTok, 'unmatched', 0n)).length, 3);
    const nomdm = await app.listAbmDevices(adminTok, 'nomdm', 0n); assert.equal(nomdm.length, 1); assert.equal(nomdm[0].device.serial, 'F9XQ2ABM0002');
    assert.deepEqual(await app.listAbmDevices(memberTok, 'all', 0n), [], 'members see no Apple list');
    const detail = (await app.getAsset(adminTok, existing.id))[0]; assert.equal(detail.abm[0].orderNo, 'W123'); assert.equal(detail.abm[0].mdmServer, 'Iru · Group');
    // adopt: unknown, Apple, model from ABM, kind from the family, order details in the history; the register's own serial is skipped
    assert.equal((await app.abmAdopt(memberTok, ['F9XQ2ABM0001'])).ok, false);
    const ad = await app.abmAdopt(adminTok, ['F9XQ2ABM0001', 'F9XQ2ABM0002', 'C02ABM000001', 'NOPE']);
    assert.equal(ad.ok, true, ad.detail); assert.equal(ad.created, 2n); assert.match(ad.detail, /2 added · 2 skipped/);
    const rows = await app.listAssets(adminTok, 'F9XQ2ABM0001', '', false);
    assert.equal(rows.length, 1); const a1 = rows[0].asset;
    assert.equal(a1.status, 'unknown'); assert.equal(a1.vendor, 'Apple'); assert.equal(a1.model, 'iPhone 15 128GB'); assert.equal(a1.kind, 'phone'); assert.match(a1.note, /not seen by any device-management service/);
    const a1d = (await app.getAsset(adminTok, a1.id))[0];
    assert.ok(a1d.events.some((e) => e.kind === 'note' && /ordered 2025-01-20 · order W123 · via reseller · Black/.test(e.detail)), JSON.stringify(a1d.events.map((e) => e.detail)));
    assert.equal((await app.listAbmDevices(adminTok, 'unmatched', 0n)).length, 1, 'only the Mac mini is left in the gap');
    assert.equal((await app.listAbmDevices(adminTok, 'unmatched', 0n))[0].device.serial, 'DESKTOP000001');
    // the MDM sees the iPhone later → the MDM sync links it by serial and records the hand-over
    const mdm = await app.addMdm(adminTok, { kind: 'iru', name: 'Iru', url: 'https://acme.api.kandji.io', clientId: '', secret: 'tok' }); assert.equal(mdm.ok, true, mdm.detail);
    pending = await defer.syncMdm(adminTok, mdm.id);
    const iru = await answerOutcall(pic, { results: [{ device_id: 'k1', serial_number: 'f9xq2abm0001', device_name: "Member's iPhone", model: 'iPhone 15', platform: 'iPhone', os_version: '18.6', last_check_in: '2026-09-07T08:00:00Z', user: { email: 'member@example.test', name: 'Member' } }] });
    assert.match(iru.url, /acme\.api\.kandji\.io\/api\/v1\/devices/);
    r = await pending(); assert.equal(r.ok, true, r.detail); assert.match(r.detail, /1 matched/); assert.match(r.detail, /1 assigned/);
    const linked = (await app.getAsset(adminTok, a1.id))[0];
    assert.equal(linked.asset.status, 'assigned'); assert.equal(linked.assigneeEmail, 'member@example.test'); assert.equal(linked.mdm[0].connName, 'Iru'); assert.equal(linked.abm[0].connName, 'Apple Business Manager · Group');
    assert.equal((await app.listAbmDevices(adminTok, 'matched', 0n)).length, 3);
    assert.deepEqual(await app.listAbmDevices(adminTok, 'sold', 0n), [], 'nothing sold yet — the release backlog is empty');
    // a device sold in the register but still listed by Apple lands in the release backlog
    const soldEv = await app.addEventTo(adminTok, existing.id, 'sold', 'Buyer Co', 'sold outside'); assert.equal(soldEv.ok, true, soldEv.detail);
    const backlog = await app.listAbmDevices(adminTok, 'sold', 0n); assert.equal(backlog.length, 1); assert.equal(backlog[0].device.serial, 'C02ABM000001'); assert.equal(backlog[0].assetStatus, 'sold');
    // remove the connection: the Apple list goes, the register keeps its devices
    const rm = await app.removeAbm(adminTok, added.id); assert.equal(rm.ok, true, rm.detail);
    assert.deepEqual(await app.listAbmDevices(adminTok, 'all', 0n), []);
    assert.equal((await app.getAsset(adminTok, a1.id))[0].asset.status, 'assigned');
    assert.deepEqual(await app.listAbm(adminTok), []);
    // an expired assertion: the connection says so instead of asking Apple
    const again = await app.addAbm(adminTok, { name: 'ABM again', clientId, keyId, assertion: [await assertionFor()] }); assert.equal(again.ok, true, again.detail);
    await pic.advanceTime(181 * 86400 * 1000); await settled(pic); adminTok = await login(owner);
    const late = await app.testAbm(adminTok, again.id); assert.equal(late.ok, false); assert.match(late.detail, /expired on \d{4}-\d{2}-\d{2}/);
    assert.match((await app.updateAbm(adminTok, again.id, { name: '', clientId: 'BUSINESSAPI.new', keyId: '', assertion: [], enabled: true })).detail, /freshly signed/, 'a new client id needs a new assertion');
    const renewed = await app.updateAbm(adminTok, again.id, { name: '', clientId: '', keyId: '', assertion: [await assertionFor()], enabled: true }); assert.equal(renewed.ok, true, renewed.detail);
    assert.ok(Number((await app.listAbm(adminTok))[0].signedUntil) > Number(await pic.getTime()) * 1e6, 'renewed');
  } finally { await pic.tearDown(); }
});

// Optional stateful upgrade check: KEBAB_BASELINE_DIR points to Wasm built from
// the deployed commit. Never compare to a just-overwritten stable baseline.
import { existsSync, readFileSync } from 'node:fs';
const baselineDir = process.env.KEBAB_BASELINE_DIR;
test('upgrade preserves Hub identities and app records from the deployed baseline', { skip: !baselineDir }, async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    assert.ok(existsSync(resolve(baselineDir, 'hub/backend.wasm')));
    const { actor: hub, canisterId: hubId } = await initialized(pic, { wasm: resolve(baselineDir, 'hub/backend.wasm') });
    const apps = [];
    for (const module of ['desk', 'assets', 'watch']) {
      const app = await install(pic, module, { wasm: resolve(baselineDir, module, 'backend.wasm') });
      app.actor.setPrincipal(controller); await app.actor.setHub(hubId.toText());
      const c = await (process.env.KEBAB_BASELINE_CENTRAL ? args => connectTestApp(hub, args) : args => hub.connectApp(args))({ name: module, canisterId: app.canisterId.toText(), note: '', lanes: ['identity', 'roles', 'groups'], access: { mode: 'everyone', groups: [], roles: [], people: [] }, tile: [{ name: module, kind: 'app', url: `https://${module}.example.test` }] });
      const ticket = await hub.mintAppTicket('', c.tileId);
      const [s] = await app.actor.loginWithTicket(ticket.ticket); assert.ok(s);
      if (module === 'watch') assert.equal((await app.actor.addDomain(s.token, { name: 'example.com', types: ['A'], watchers: [], note: 'upgrade fixture' })).ok, true);
      else assert.equal((await app.actor.seedDemo(s.token)).ok, true);
      const count = module === 'watch' ? (await app.actor.listDomains(s.token)).length : (await app.actor.stats(s.token)).total;
      assert.ok(count > 0); apps.push({ module, app, count, tile: c.tileId });
    }
    // a pre-0.20 SCIM token: after the upgrade it must still authenticate, as source 1
    const legacyTok = await hub.genScimToken(); assert.equal(legacyTok.length, 128);
    assert.equal((await scim(hub, legacyTok, 'POST', '', { userName: 'pushed@example.test', displayName: 'Pushed Person', active: true })).status, 201);
    await pic.upgradeCanister({ upgradeModeOptions: { skip_pre_upgrade: [], wasm_memory_persistence: [{ keep: null }] }, sender: controller, canisterId: hubId, wasm: candidateWasm('hub') });
    assert.equal((await hub.portalWhoami(''))[0].email, 'owner@example.test');
    assert.equal(await hub.myRole(), 'owner');
    assert.equal((await scim(hub, legacyTok, 'GET')).status, 200, 'the old token still works after the upgrade');
    const srcs = await hub.listScimSources();
    assert.equal(srcs.length, 1); assert.equal(srcs[0].id, 1n); assert.equal(srcs[0].legacyToken, !process.env.KEBAB_BASELINE_CENTRAL); assert.equal(srcs[0].userCount, 1n);
    assert.deepEqual((await scim(hub, legacyTok, 'GET')).body.Resources.map((u) => u.userName), ['pushed@example.test']);
    const rotated = await hub.rotateScimSourceToken(1n); assert.equal(rotated.ok, true);
    assert.equal((await scim(hub, legacyTok, 'GET')).status, 401, 'the plain pre-0.20 token dies with the first rotation');
    assert.equal((await scim(hub, rotated.token, 'GET')).status, 200);
    for (const { module, app, count, tile } of apps) {
      await pic.upgradeCanister({ upgradeModeOptions: { skip_pre_upgrade: [], wasm_memory_persistence: [{ keep: null }] }, sender: controller, canisterId: app.canisterId, wasm: candidateWasm(module) });
      const ticket = await hub.mintAppTicket('', tile);
      const [s] = await app.actor.loginWithTicket(ticket.ticket); assert.ok(s);
      assert.equal(module === 'watch' ? (await app.actor.listDomains(s.token)).length : (await app.actor.stats(s.token)).total, count);
    }
    for (const module of ['vault', 'kitchen']) {
      const f = await install(pic, module, { wasm: resolve(baselineDir, module, 'backend.wasm') }); f.actor.setPrincipal(controller);
      assert.equal((await f.actor.setHub(hubId.toText())).ok, true);
      await pic.upgradeCanister({ upgradeModeOptions: { skip_pre_upgrade: [], wasm_memory_persistence: [{ keep: null }] }, sender: controller, canisterId: f.canisterId, wasm: candidateWasm(module) });
      assert.equal((await f.actor.info()).hubId, hubId.toText());
      const expectedVersion = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(resolve(module, 'mops.toml'), 'utf8'))?.[1];
      assert.ok(expectedVersion, `${module} declares its release version`);
      assert.equal((await f.actor.info()).version, expectedVersion);
    }
  } finally { await pic.tearDown(); }
});

test('Vault snapshots and restores a populated Hub on PocketIC', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    const { actor: vault, canisterId: vaultId } = await install(pic, 'vault');
    vault.setPrincipal(controller);
    await pic.updateCanisterSettings({ sender: controller, canisterId: hubId, controllers: [controller, vaultId] });
    const snap = await vault.snapshot(hubId.toText(), 'before a test change'); assert.equal(snap.ok, true, snap.detail);
    assert.equal(await hub.addLocalUser('after-snapshot@example.test', 'Later', '', ''), true);
    const restored = await vault.restore(hubId.toText(), snap.id, true); assert.equal(restored.ok, true, restored.detail);
    assert.equal(await hub.addLocalUser('after-snapshot@example.test', 'Later', '', ''), true, 'snapshot removed the later record');
    assert.equal((await hub.portalWhoami(''))[0].email, 'owner@example.test');
  } finally { await pic.tearDown(); }
});

test('temporary app access expires and cannot reappear after cleanup', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    const { canisterId } = await install(pic, 'watch');
    const c = await connectTestApp(hub, { name: 'Temporary', canisterId: canisterId.toText(), note: '', lanes: ['identity'], access: { mode: 'selected', groups: [], roles: ['owner'], people: [] }, tile: [{ name: 'Temporary', kind: 'app', url: 'https://watch.example.test' }] });
    const g = await hub.grantAccess({ email: 'member@example.test', target: 'app:' + c.id, hours: 1n, reason: 'One hour task' }); assert.equal(g.ok, true, g.detail);
    hub.setPrincipal(member); assert.equal((await hub.mintAppTicket('', c.tileId)).ok, true);
    await pic.advanceTime(3600000); await pic.tick(2);
    assert.equal((await hub.mintAppTicket('', c.tileId)).ok, false, 'expired access must be denied');
    await pic.advanceTime(300000); await pic.tick(5);
    assert.equal((await hub.mintAppTicket('', c.tileId)).ok, false, 'cleanup must not resurrect the stored grant');
    hub.setPrincipal(owner);
    const again = await hub.grantAccess({ email: 'member@example.test', target: 'app:' + c.id, hours: 1n, reason: 'A separate task' });
    assert.equal(again.ok, true, again.detail);
    hub.setPrincipal(member); assert.equal((await hub.mintAppTicket('', c.tileId)).ok, true);
  } finally { await pic.tearDown(); }
});

test('Helpdesk lifecycle actions affect only lower roles, including bulk operations', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    const { items } = await hub.listUsers({ activeOnly: false, conn: [], limit: 100n, offset: 0n, search: '' });
    const key = email => items.find(u => u.email === email).key;
    hub.setPrincipal(helpdesk);
    assert.equal(await hub.deactivateUser(key('owner@example.test'), 'forbidden'), false);
    assert.equal(await hub.deactivateUser(key('helpdesk@example.test'), 'equal role'), false);
    assert.equal(await hub.deactivateUsers([key('owner@example.test'), key('member@example.test')], 'mixed batch'), 1n);
    hub.setPrincipal(owner); assert.equal((await hub.portalWhoami(''))[0].active, true);
    hub.setPrincipal(member); assert.equal((await hub.portalWhoami(''))[0].active, false);
  } finally { await pic.tearDown(); }
});
test('admins cannot bypass higher identity rank through activation, deletion or linking', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await hub.setPersonRole('helpdesk@example.test', 'admin');
    const { items } = await hub.listUsers({ activeOnly: false, conn: [], limit: 100n, offset: 0n, search: '' });
    const ownerKey = items.find(u => u.email === 'owner@example.test').key;
    hub.setPrincipal(helpdesk);
    assert.equal(await hub.unlinkPrincipal(owner.toText()), false);
    assert.equal((await hub.linkMyPrincipal('owner@example.test')).ok, false);
    assert.equal(await hub.setLocalUserActive('owner@example.test', false), false);
    assert.equal(await hub.removeLocalUser('owner@example.test'), false);
    assert.equal(await hub.setUserKinds([ownerKey], 'service'), 0n);
    hub.setPrincipal(owner); assert.equal(await hub.deactivateUser(ownerKey, 'test disabled identity'), true);
    hub.setPrincipal(helpdesk);
    assert.equal(await hub.reactivateUser(ownerKey, 'bypass'), false);
    assert.equal(await hub.clearOverride(ownerKey), false);
    assert.equal(await hub.clearOverrides([ownerKey]), 0n);
    assert.deepEqual(await hub.createInvite('owner@example.test'), []);
    hub.setPrincipal(controller); assert.equal(await hub.clearOverride(ownerKey), true);
    hub.setPrincipal(owner); assert.equal(await hub.myRole(), 'owner');
  } finally { await pic.tearDown(); }
});
test('legacy principal owner roles also protect the linked person', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await hub.addAdmin(member.toText(), 'Legacy owner'); await hub.setAdminRole(member.toText(), 'owner');
    const { items } = await hub.listUsers({ activeOnly: false, conn: [], limit: 100n, offset: 0n, search: '' });
    const memberKey = items.find(u => u.email === 'member@example.test').key;
    hub.setPrincipal(helpdesk);
    assert.equal(await hub.deactivateUser(memberKey, 'must not ignore legacy role'), false);
    assert.deepEqual(await hub.createInvite('member@example.test'), []);
  } finally { await pic.tearDown(); }
});

test('contracts: spaces isolate personal and team content, uploads, exports, nested actions and live revocation', async () => {
  const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const f = await contractsFixture(pic,{ai:false}); const {app,adminRoot,memberRoot,adminTok,memberTok,helpdeskTok,memberId,adminId,spaceId}=f;
    const privateRecord = await app.createContract(memberRoot,cinput({title:'PERSONAL SECRET'})); assert.equal(privateRecord.ok,true);
    assert.deepEqual(await app.getContract(adminRoot,privateRecord.id),[]);
    assert.equal((await app.openSpace(adminRoot,'personal:'+memberId)).ok,true,'central admin can open another personal workspace');
    assert.equal((await app.openSpace(helpdeskTok,'personal:'+memberId)).ok,false,'another employee cannot');
    assert.doesNotMatch(await app.exportCsv(adminRoot),/PERSONAL SECRET/);
    const ownSpace = await app.createSpace(helpdeskTok,'Legal','Agreements'); assert.equal(ownSpace.ok,true,'any Hub member creates a teamspace');
    const legal = (await app.openSpace(helpdeskTok,ownSpace.id)).token;
    const secret = await app.createContract(legal,cinput({title:'LEGAL SECRET'})); assert.equal(secret.ok,true);
    assert.equal((await app.openSpace(adminRoot,ownSpace.id)).ok,true,'central admin can open every teamspace');
    assert.equal((await app.openSpace(memberRoot,ownSpace.id)).ok,false,'unshared teamspace stays closed to another employee');
    assert.deepEqual(await app.getContract(adminTok,secret.id),[]);
    const bytes = new TextEncoder().encode('Confidential attachment'); const hash=createHash('sha256').update(bytes).digest('hex');
    const meta = mail({kind:'eml', providerId:'same-id',messageId:'same-message',attachments:[{name:'secret.txt',mime:'text/plain',size:BigInt(bytes.length),sha256:hash,textExtract:'Confidential attachment',link:''}]});
    const upload = await app.intakeBegin(legal,meta); assert.equal(upload.ok,true,upload.detail);
    assert.equal((await app.intakeChunk(adminTok,upload.id,0n,bytes)).ok,false,'foreign scope cannot write an intake');
    assert.equal((await app.intakeCommit(adminTok,upload.id)).ok,false,'foreign scope cannot consume it');
    assert.equal((await app.intakeChunk(legal,upload.id,0n,bytes)).ok,true);
    const src = await app.intakeCommit(legal,upload.id); assert.equal(src.ok,true);
    assert.deepEqual(await app.getSource(adminTok,src.sourceId),[]);
    const doc=(await app.getSource(legal,src.sourceId))[0].documents[0];
    assert.deepEqual(await app.documentData(adminTok,doc.id),[]); assert.deepEqual(await app.documentText(memberRoot,doc.id),[]);
    assert.equal((await app.documentData(legal,doc.id))[0].name,'secret.txt');
    const again=await app.intakeBegin(adminTok,meta); assert.equal(again.ok,true,'dedupe cannot reveal another space delivery');
    assert.equal((await app.intakeChunk(adminTok,again.id,0n,bytes)).ok,true);
    const ownSource=await app.intakeCommit(adminTok,again.id);assert.equal(ownSource.ok,true);assert.notEqual(ownSource.sourceId,src.sourceId);
    assert.equal((await app.linkSource(adminTok,src.sourceId,[],[])).ok,false);
    assert.equal((await app.setSourceStatus(adminTok,src.sourceId,'ignored','')).ok,false);
    assert.equal((await app.reprocessSource(adminTok,src.sourceId)).ok,false);
    const publicRecord=await app.createContract(adminTok,cinput({title:'TEAM RECORD'}));assert.equal(publicRecord.ok,true);
    assert.equal((await app.proposeChange(adminTok,publicRecord.id,[src.sourceId],[{field:'note',value:'stolen'}],'')).ok,false);
    const task=await app.addTask(legal,secret.id,'Legal task','2027-01-01','');assert.equal(task.ok,true);
    assert.equal((await app.assignTask(adminTok,task.id,memberId)).ok,false);
    const proposal=await app.proposeChange(legal,secret.id,[],[{field:'note',value:'Legal detail'}],'PRIVATE PROPOSAL');assert.equal(proposal.ok,true);
    assert.equal((await app.assignProposal(adminTok,proposal.id,memberId)).ok,false);
    assert.doesNotMatch(JSON.stringify(await app.exportAll(adminTok),(_,v)=>typeof v==='bigint'?String(v):v),/LEGAL SECRET|PERSONAL SECRET|PRIVATE PROPOSAL/);
    assert.doesNotMatch(JSON.stringify(await app.today(adminTok),(_,v)=>typeof v==='bigint'?String(v):v),/LEGAL SECRET|PERSONAL SECRET/);
    assert.equal((await app.updateSpace(adminTok,2n,'Test team','',[{pid:adminId,role:{owner:null}},{pid:memberId,role:{viewer:null}}],false)).ok,true);
    assert.equal((await app.getContract(memberTok,publicRecord.id)).length,1);
    assert.equal((await app.setTerms(memberTok,publicRecord.id,1n,TERMS,'')).ok,false,'viewer cannot edit');
    assert.equal((await app.createContract(memberTok,cinput())).ok,false);
    assert.equal((await app.updateSpace(memberTok,3n,'Hijack','',[],false)).ok,false,'viewer cannot manage');
    assert.equal((await app.updateSpace(adminTok,3n,'Test team','',[{pid:memberId,role:{viewer:null}}],false)).ok,false,'cannot remove last owner');
    assert.equal((await app.updateSpace(adminTok,3n,'Test team','',[{pid:adminId,role:{owner:null}}],false)).ok,true);
    assert.deepEqual(await app.whoami(memberTok),[],'removed membership invalidates an existing scoped session immediately');
    assert.deepEqual(await app.getContract(memberTok,publicRecord.id),[]);
    assert.equal((await app.getContract(memberRoot,privateRecord.id)).length,1,'personal scope unaffected');
    await app.signOut(adminRoot); assert.deepEqual(await app.whoami(adminTok),[],'root logout invalidates its space sessions');
  } finally { await pic.tearDown(); }
});

test('contracts: scoped rules and AI candidates never cross spaces; owned transfers move evidence and revoke the old context', async () => {
  const pic=await PocketIc.create(server.getUrl());
  try {
    const {app,adminRoot,adminTok,memberTok}=await contractsFixture(pic,{ai:false});
    const own=await app.createContract(adminRoot,cinput({title:'Personal vendor',vendor:'Sunrise Cloud'}));assert.equal(own.ok,true);
    const team=await app.createContract(adminTok,cinput({title:'Team vendor',vendor:'Sunrise Cloud'}));assert.equal(team.ok,true);
    assert.equal((await app.addRule(adminRoot,'senderAddress','billing@sunrise-cloud.example',own.id)).ok,true);
    const b=await app.intakeBegin(adminTok,mail({kind:'eml',providerId:'team-mail'}));assert.equal(b.ok,true);
    const commit=await app.intakeCommit(adminTok,b.id);assert.equal(commit.ok,true);
    let src=(await app.getSource(adminTok,commit.sourceId))[0];assert.deepEqual(src.source.contractId,[],'private matching rule cannot file team mail');
    assert.deepEqual(src.candidates.map(c=>c.id),[team.id],'candidate selection only offers this space');
    assert.equal((await app.linkSource(adminTok,commit.sourceId,[team.id],[])).ok,true);
    const destination=(await app.listSpaces(adminRoot)).find(s=>s.kind==='personal').id;
    assert.equal((await app.moveContract(memberTok,team.id,1n,destination)).ok,false,'editor cannot move to another person personal space');
    assert.equal((await app.moveContract(adminTok,team.id,1n,destination)).ok,true);
    assert.deepEqual(await app.getContract(adminTok,team.id),[]);assert.deepEqual(await app.getSource(memberTok,commit.sourceId),[]);
    assert.equal((await app.getContract(adminRoot,team.id)).length,1);assert.equal((await app.getSource(adminRoot,commit.sourceId)).length,1);
  } finally {await pic.tearDown();}
});

test('contracts: upgrade keeps legacy records and evidence, freezes former access and preserves new spaces across a second upgrade', { skip: !process.env.KEBAB_CONTRACTS_BASELINE_DIR }, async () => {
  const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const {actor:hub,canisterId:hubId} = await initialized(pic); await settled(pic);
    const baseline = process.env.KEBAB_CONTRACTS_BASELINE_DIR;
    const oldCode = execFileSync('python3',['sdk/tools/did2idl.py',resolve(baseline,'backend.did')],{encoding:'utf8'});
    const oldIdl = (await import('data:text/javascript;base64,'+Buffer.from(oldCode).toString('base64'))).idlFactory;
    const installed = await install(pic,'contracts',{wasm:resolve(baseline,'backend.wasm'),idlFactory:oldIdl});
    let app = installed.actor; app.setPrincipal(controller); await app.setHub(hubId.toText());
    assert.equal((await app.info()).version,'0.1.0','genuine previous release');
    hub.setPrincipal(owner);
    const conn = await connectTestApp(hub, {name:'contracts',canisterId:installed.canisterId.toText(),note:'',lanes:['identity','roles','groups'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'contracts',kind:'app',url:'https://contracts.example.test'}]});
    const login = async who => {hub.setPrincipal(who);const t=await hub.mintAppTicket('',conn.tileId);return (await app.loginWithTicket(t.ticket))[0].token;};
    let adminRoot=await login(owner),memberRoot=await login(member);
    const mid=(await app.whoami(memberRoot))[0].id;
    const cid=(await app.createContract(adminRoot,cinput({title:'Before upgrade',responsible:mid,visibility:'restricted'}))).id;
    assert.equal((await app.setTerms(adminRoot,cid,1n,TERMS,'signed before upgrade')).ok,true);
    const bytes=Buffer.from('Signed agreement survives the upgrade');
    const b=await app.intakeBegin(adminRoot,mail({kind:'eml',providerId:'legacy-unique',attachments:[{name:'signed.txt',mime:'text/plain',size:BigInt(bytes.length),sha256:createHash('sha256').update(bytes).digest('hex'),textExtract:'Signed agreement',link:''}]}));
    assert.equal(b.ok,true,b.detail);assert.equal((await app.intakeChunk(adminRoot,b.id,0n,bytes)).ok,true);
    const src=await app.intakeCommit(adminRoot,b.id);assert.equal(src.ok,true,src.detail);
    assert.equal((await app.linkSource(adminRoot,src.sourceId,[cid],[])).ok,true);
    const docId=(await app.getSource(adminRoot,src.sourceId))[0].documents[0].id;
    await pic.upgradeCanister({upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]},sender:controller,canisterId:installed.canisterId,wasm:candidateWasm('contracts')});
    app=pic.createActor(installed.idlFactory,installed.canisterId);
    adminRoot=await login(owner);memberRoot=await login(member);
    const legacy=await app.openSpace(adminRoot,'legacy');assert.equal(legacy.ok,true,legacy.detail);
    const rec=(await app.getContract(legacy.token,cid))[0];assert.equal(rec.contract.title,'Before upgrade');assert.equal(rec.contract.terms.amountMinor[0],150000n);assert.equal(rec.documents[0].id,docId);
    assert.deepEqual(Buffer.from((await app.documentData(legacy.token,docId))[0].bytes),bytes);
    const oldMember=await app.openSpace(memberRoot,'legacy');assert.equal(oldMember.ok,true);assert.equal((await app.getContract(oldMember.token,cid)).length,1);
    // A new Hub admin gets infrastructure settings, but no inherited contract contents.
    hub.setPrincipal(owner);assert.equal((await hub.setPersonRole('helpdesk@example.test','admin')).ok,true);
    await pic.advanceTime(31_000);await settled(pic);
    const promoted=await login(helpdesk);assert.equal((await app.openSpace(promoted,'legacy')).ok,false);
    assert.deepEqual(await app.getContract(promoted,cid),[]);
    const sp=await app.createSpace(adminRoot,'Legal','New explicit members');assert.equal(sp.ok,true);
    const scoped=await app.openSpace(adminRoot,sp.id);
    assert.equal((await app.moveContract(legacy.token,cid,rec.contract.revision,sp.id)).ok,true);
    assert.deepEqual(await app.getContract(oldMember.token,cid),[]);
    assert.equal((await app.getContract(scoped.token,cid)).length,1);
    await pic.upgradeCanister({upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]},sender:controller,canisterId:installed.canisterId,wasm:candidateWasm('contracts')});
    adminRoot=await login(owner);
    const reopened=await app.openSpace(adminRoot,sp.id);assert.equal(reopened.ok,true);
    assert.equal((await app.getContract(reopened.token,cid))[0].documents[0].id,docId);
    assert.deepEqual(Buffer.from((await app.documentData(reopened.token,docId))[0].bytes),bytes);
    assert.equal((await app.openSpace(await login(helpdesk),sp.id)).ok,false);
  } finally {await pic.tearDown();}
});

test('contracts: general agreements need no invented price or expiry; archived spaces block relay intake; rejected draft creation is atomic', async () => {
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,adminTok,adminId,memberId,memberTok}=await contractsFixture(pic,{ai:false});
    const c=await app.createContract(adminTok,cinput({title:'Mutual NDA',responsible:adminId,seats:[]}));assert.equal(c.ok,true);
    const nda={...TERMS,amountMinor:[],currency:'',interval:'none',start:'2026-09-08',renewalDate:'',renewalRule:'indefinite',noticeMonths:[]};
    assert.equal((await app.setTerms(adminTok,c.id,1n,nda,'Signed without payment or fixed expiry')).ok,true);
    assert.equal((await app.getContract(adminTok,c.id))[0].row.complete,true);
    assert.equal((await app.setTerms(adminTok,c.id,2n,{...nda,amountMinor:[100n]},'Invalid contradictory fee')).ok,false);
    assert.equal((await app.setTerms(adminTok,c.id,2n,{...nda,end:'2027-09-08'},'Invalid fixed end')).ok,false);
    const b=await app.intakeBegin(adminTok,mail({kind:'manual',providerId:'draft-atomic'}));const src=await app.intakeCommit(adminTok,b.id);
    const p=await app.proposeChange(adminTok,c.id,[src.sourceId],[{field:'amountMinor',value:'10.00'}],'Test proposal');assert.equal(p.ok,true,p.detail);
    const before=(await app.exportAll(adminTok))[0].contracts.length;
    const d=await app.decideProposal(adminTok,p.id,{expectedRevision:0n,target:[],newContract:true,accept:[{field:'amountMinor',value:'-10.00'}],note:''});assert.equal(d.ok,false);
    assert.equal((await app.exportAll(adminTok))[0].contracts.length,before,'invalid decision creates no orphan draft');
    assert.equal((await app.getProposal(adminTok,p.id))[0].status,'open');
    app.setPrincipal(stranger);assert.equal((await app.setRelayPrincipals(adminTok,[stranger.toText()])).ok,true);assert.equal((await app.setSpaceRelay(adminTok,stranger.toText(),true)).ok,true);
    const pending=await app.intakeBegin('',mail({providerId:'archive-pending'}));assert.equal(pending.ok,true);
    const sp=(await app.getSpace(adminTok))[0].space;
    assert.equal((await app.updateSpace(adminTok,sp.revision,sp.name,sp.description,[{pid:adminId,role:{owner:null}},{pid:memberId,role:{editor:null}}],true)).ok,true);
    assert.equal((await app.intakeCommit('',pending.id)).ok,false,'an archived space cannot accept a pending delivery');
    assert.equal((await app.intakeBegin('',mail({providerId:'archive-new'}))).ok,false);
    assert.equal((await app.createContract(memberTok,cinput())).ok,false);
    assert.equal((await app.getContract(memberTok,c.id)).length,1,'archive keeps member read access');
  } finally {await pic.tearDown();}
});


test('contracts: AI availability is discovered without a document and refreshed after upgrade and revocation', async () => {
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,appId,hub,adminRoot,helpdeskTok,spaceId,connector}=await contractsFixture(pic);
    await pic.advanceTime(301_000); await settled(pic); await pic.tick(5);
    let me=(await app.whoami(adminRoot))[0]; assert.ok(me,'directory/session remains valid');
    assert.equal(me.aiChecked,true); assert.equal(me.aiOn,true,'no first document is needed to discover configured AI');
    hub.setPrincipal(owner); const usage=(await hub.aiInfo()).apps.find(x=>x.id===connector.id);
    assert.ok(usage.fetches>0n); assert.equal(usage.calls,0n,'checking configuration must not make a model call');
    app.setPrincipal(controller); assert.equal(await app.addAdminEmail('helpdesk@example.test'),false);
    assert.equal((await app.whoami(helpdeskTok))[0].role,'member');
    assert.equal((await app.openSpace(helpdeskTok,spaceId)).ok,false,'technical app administration grants no team content access');
    await pic.upgradeCanister({upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]},sender:controller,canisterId:appId,wasm:candidateWasm('contracts')});
    await settled(pic); await pic.tick(5);
    me=(await app.whoami(adminRoot))[0]; assert.equal(me.aiChecked,true); assert.equal(me.aiOn,true,'startup timer restores AI status after upgrade');
    hub.setPrincipal(owner); assert.equal((await hub.setConnectorLanes(connector.id,['identity','roles','groups'])).ok,true);
    await pic.advanceTime(301_000); await settled(pic); await pic.tick(5);
    me=(await app.whoami(adminRoot))[0]; assert.equal(me.aiChecked,true); assert.equal(me.aiOn,false,'background refresh notices removed AI access');
  } finally {await pic.tearDown();}
});


test('contracts: rejecting an unfiled suggestion creates no contract and preserves the document and decision author', async () => {
  const pic = await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const { app, adminTok, adminId, memberTok, memberId, helpdeskTok } = await contractsFixture(pic);
    const start = await app.intakeBegin(adminTok, mail({kind:'manual',subject:'Unsolicited offer',text:'An optional licence costs EUR 480.00 per month.',providerId:'rejection-fixture',messageId:'rejection-fixture'}));
    assert.equal(start.ok,true,start.detail);
    const committed = await app.intakeCommit(adminTok,start.id); assert.equal(committed.ok,true,committed.detail);
    await extractWith(pic,[{kind:'offer',contractCandidates:[],effectiveDate:'',proposedFields:[field('amountMinor','480.00','EUR 480.00'),field('interval','month','per month')],uncertainties:[],summary:'Optional licence offer'}]);
    const source = (await app.getSource(adminTok,committed.sourceId))[0];
    const p = source.proposals.find(p=>p.status==='open'); assert.ok(p,'unfiled proposal exists'); assert.deepEqual(p.contractId,[]);
    const decision = {expectedRevision:0n,target:[],newContract:true,accept:[],note:'Not needed by our team'};
    assert.equal((await app.decideProposal(helpdeskTok,p.id,decision)).ok,false,'outsider cannot reject');
    const sp=(await app.getSpace(adminTok))[0].space;
    assert.equal((await app.updateSpace(adminTok,sp.revision,sp.name,sp.description,[{pid:adminId,role:{owner:null}},{pid:memberId,role:{viewer:null}}],false)).ok,true);
    assert.equal((await app.decideProposal(memberTok,p.id,decision)).ok,false,'viewer cannot reject');
    const before=(await app.exportAll(adminTok))[0].contracts.length;
    const result = await app.decideProposal(adminTok,p.id,decision); assert.equal(result.ok,true,result.detail); assert.equal(result.contractId,0n);
    assert.equal((await app.exportAll(adminTok))[0].contracts.length,before,'no empty draft created');
    const after=(await app.getSource(adminTok,committed.sourceId))[0];
    assert.deepEqual(after.source.contractId,[],'original source stays unfiled');
    assert.notEqual(after.source.status,'ignored','manual filing remains possible');
    assert.equal(after.proposals[0].status,'rejected'); assert.equal(after.proposals[0].decidedBy,adminId); assert.equal(after.proposals[0].note,decision.note);
    assert.equal((await app.decideProposal(adminTok,p.id,decision)).ok,false,'replay cannot change the recorded decision');
  } finally { await pic.tearDown(); }
});

test('contracts: document-first filing is atomic, retry-safe and transfers original evidence only between owned spaces', async () => {
  const pic=await PocketIc.create(server.getUrl());
  try {
    const {app,adminRoot,adminTok,memberTok,helpdeskTok,memberRoot}=await contractsFixture(pic,{ai:false});
    const bytes=Buffer.from('Confidential agreement. Contract value CHF 1200.');
    const meta=mail({kind:'eml',providerId:'doc-first',messageId:'doc-first',text:'Review the attached agreement.',attachments:[{name:'agreement.txt',mime:'text/plain',size:BigInt(bytes.length),sha256:createHash('sha256').update(bytes).digest('hex'),textExtract:bytes.toString(),link:''}]});
    const b=await app.intakeBegin(adminTok,meta);assert.equal(b.ok,true,b.detail);
    assert.equal((await app.intakeChunk(adminTok,b.id,0n,bytes)).ok,true);
    const source=await app.intakeCommit(adminTok,b.id);assert.equal(source.ok,true,source.detail);
    const sid=source.sourceId;
    const destination=(await app.listSpaces(adminRoot)).find(s=>s.kind==='personal').id;
    const decision={proposalId:[],destination,fields:[{field:'title',value:'Reviewed equipment agreement'},{field:'amountMinor',value:'120000'},{field:'currency',value:'CHF'},{field:'interval',value:'once'},{field:'product',value:'Completed by reviewer'}]};
    const count=(await app.exportAll(adminTok))[0].contracts.length;
    assert.equal((await app.createContractFromSource(helpdeskTok,sid,decision)).ok,false,'outsider cannot read or file');
    assert.equal((await app.createContractFromSource(memberTok,sid,decision)).ok,false,'editor cannot transfer to another person personal space');
    assert.equal((await app.createContractFromSource(adminTok,sid,{...decision,fields:[{field:'title',value:'Invalid'},{field:'amountMinor',value:'-1.00'}]})).ok,false);
    assert.equal((await app.exportAll(adminTok))[0].contracts.length,count,'invalid terms create no orphan draft');
    const result=await app.createContractFromSource(adminTok,sid,decision);assert.equal(result.ok,true,result.detail);
    assert.deepEqual(await app.getSource(memberTok,sid),[],'original team loses document access');
    const saved=(await app.getContract(adminRoot,result.contractId))[0];
    assert.equal(saved.contract.terms.amountMinor[0],120000n);assert.equal(saved.contract.product,'Completed by reviewer');assert.equal(saved.contract.status,'draft');
    assert.equal(saved.documents.length,1,'original attached in the same transaction');
    assert.deepEqual(await app.documentData(memberRoot,saved.documents[0].id),[]);
    const retry=await app.createContractFromSource(adminRoot,sid,decision);assert.equal(retry.ok,false);assert.equal(retry.contractId,result.contractId,'repeat points at saved contract');
    const before=(await app.exportAll(adminRoot))[0].contracts.length;
    await settled(pic);assert.equal((await app.exportAll(adminRoot))[0].contracts.length,before,'queued AI does not recreate a filed source');
  } finally {await pic.tearDown();}
});

test('contracts: received thread evidence is scoped, signature reports remain drafts, and late AI cannot replace manual filing', async () => {
  const pic=await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    const {app,adminTok,adminRoot}=await contractsFixture(pic);
    const old=await app.intakeBegin(adminTok,mail({kind:'eml',providerId:'thread-old',messageId:'<prior@test>',text:'A signature is still required.',attachments:[]}));assert.equal(old.ok,true,old.detail);const oldSrc=await app.intakeCommit(adminTok,old.id);assert.equal(oldSrc.ok,true,oldSrc.detail);
    await extractWith(pic,[]);
    const b=await app.intakeBegin(adminTok,mail({kind:'eml',providerId:'thread-new',messageId:'<new@test>',references:'<prior@test>',inReplyTo:'<prior@test>',text:'We are negotiating the price.',attachments:[]}));assert.equal(b.ok,true,b.detail);const c=await app.intakeCommit(adminTok,b.id);assert.equal(c.ok,true,c.detail);
    await extractWith(pic,[{kind:'signature_request',contractCandidates:[],effectiveDate:'',proposedFields:[{field:'note',value:'Signature was requested in the previous message.',basis:'explicit',evidence:[{partId:'thread:'+oldSrc.sourceId,quote:'A signature is still required.'}]}],uncertainties:['No final signed copy is available.'],summary:'Earlier signature request; negotiation is ongoing'}]);
    const v=(await app.getSource(adminTok,c.sourceId))[0];assert.equal(v.proposals.length,1,'same-space historical quote validates');
    const filed=await app.createContractFromSource(adminTok,c.sourceId,{proposalId:[v.proposals[0].id],destination:'',fields:[{field:'title',value:'Negotiated agreement'},{field:'note',value:'Awaiting final signed copy'}]});assert.equal(filed.ok,true,filed.detail);
    assert.equal((await app.getContract(adminTok,filed.contractId))[0].contract.status,'draft','AI event cannot activate agreement');
    const priv=await app.intakeBegin(adminRoot,mail({kind:'eml',providerId:'private-ref',messageId:'<private@test>',references:'<prior@test>',text:'Unrelated private agreement.',attachments:[]}));assert.equal(priv.ok,true,priv.detail);const pc=await app.intakeCommit(adminRoot,priv.id);assert.equal(pc.ok,true,pc.detail);
    await extractWith(pic,[{kind:'other',contractCandidates:[],effectiveDate:'',proposedFields:[{field:'note',value:'Leak',basis:'explicit',evidence:[{partId:'thread:'+oldSrc.sourceId,quote:'A signature is still required.'}]}],uncertainties:[],summary:'Must not cross spaces'}]);
    assert.equal((await app.getSource(adminRoot,pc.sourceId))[0].proposals.length,0,'cross-space thread evidence rejected');
    assert.equal((await app.setSourceStatus(adminRoot,pc.sourceId,'ignored','Discard the rejected fixture before testing another in-flight job')).ok,true);
    const late=await app.intakeBegin(adminTok,mail({kind:'eml',providerId:'late-ai',messageId:'late-ai',text:'This agreement is reviewed manually while the provider responds.',attachments:[]}));assert.equal(late.ok,true,late.detail);
    const lateSource=await app.intakeCommit(adminTok,late.id);assert.equal(lateSource.ok,true);
    await pic.advanceTime(21_000);await pic.tick(6);
    assert.ok((await pic.getPendingHttpsOutcalls()).length,'AI request is in flight');
    const manual=await app.createContractFromSource(adminTok,lateSource.sourceId,{proposalId:[],destination:'',fields:[{field:'title',value:'Human-reviewed title'}]});assert.equal(manual.ok,true,manual.detail);
    await answerOutcall(pic,aiAnswer([{kind:'other',contractCandidates:[],effectiveDate:'',proposedFields:[field('title','Incorrect late title','This agreement')],uncertainties:[],summary:'Late result'}]));await settled(pic);
    const after=(await app.getSource(adminTok,lateSource.sourceId))[0];assert.equal(after.source.status,'filed');assert.equal(after.proposals.length,0);
    assert.equal((await app.getContract(adminTok,manual.contractId))[0].contract.title,'Human-reviewed title','late AI does not overwrite a human filing');
    const mb=await app.intakeBegin(adminTok,mail({kind:'eml',providerId:'moving-ai',messageId:'moving-ai',text:'Agreement for a personal project.',attachments:[]}));assert.equal(mb.ok,true);
    const ms=await app.intakeCommit(adminTok,mb.id);assert.equal(ms.ok,true);
    await pic.advanceTime(21_000);await pic.tick(6);const movingRequest=(await pic.getPendingHttpsOutcalls())[0];assert.ok(movingRequest);assert.match(Buffer.from(movingRequest.body).toString(),/Agreement for a personal project/,'the pending request is for the moving source');
    const personal=(await app.listSpaces(adminRoot)).find(s=>s.kind==='personal').id;
    assert.equal((await app.moveIncomingSource(adminTok,ms.sourceId,personal)).ok,true);
    await answerOutcall(pic,aiAnswer([{kind:'other',contractCandidates:[],effectiveDate:'',proposedFields:[field('title','Obsolete workspace suggestion','Agreement')],uncertainties:[],summary:'Obsolete context'}]));await settled(pic);
    assert.equal((await app.getSource(adminRoot,ms.sourceId))[0].proposals.length,0,'in-flight old workspace output is discarded');
    await extractWith(pic,[{kind:'offer',contractCandidates:[],effectiveDate:'',proposedFields:[field('title','Personal project','Agreement')],uncertainties:[],summary:'Reanalysed in destination'}]);
    assert.equal((await app.getSource(adminRoot,ms.sourceId))[0].proposals[0].summary,'Reanalysed in destination');


  } finally {await pic.tearDown();}
});

test('contracts: shared intake follows central Hub app administration; routing preserves evidence and removes old access', async () => {
  const pic=await PocketIc.create(server.getUrl());
  try {
    const {app,hub,adminRoot,memberRoot,helpdeskTok,spaceId,login}=await contractsFixture(pic,{ai:false});
    const intake=await app.openSpace(adminRoot,'intake');assert.equal(intake.ok,true,intake.detail);
    assert.equal((await app.listSpaces(adminRoot)).find(s=>s.id==='intake').kind,'intake');
    assert.equal((await app.openSpace(memberRoot,'intake')).ok,false,'ordinary member is not a reviewer');
    assert.equal((await app.openSpace(helpdeskTok,'intake')).ok,false,'Hub helpdesk is not a reviewer');
    assert.equal((await app.setAdminEmails(adminRoot,['helpdesk@example.test'])).ok,false);
    assert.equal((await app.whoami(helpdeskTok))[0].role,'member','local administrator mutation is inert');
    assert.equal((await app.openSpace(helpdeskTok,'intake')).ok,false,'ordinary member stays excluded');
    assert.equal((await app.updateSpace(intake.token,0n,'Public intake','',[],false)).ok,false,'cannot replace the Hub access policy');
    hub.setPrincipal(owner);assert.equal((await hub.setPersonRole('helpdesk@example.test','admin')).ok,true);
    await pic.advanceTime(31_000);await settled(pic);
    const hubAdminRoot=await login(helpdesk);
    const hubAdminIntake=await app.openSpace(hubAdminRoot,'intake');assert.equal(hubAdminIntake.ok,true,'new Hub admin can review intake');
    assert.equal((await app.getSpace(hubAdminIntake.token))[0].members.length,2,'Hub owner and admin');
    assert.equal((await app.openSpace(hubAdminRoot,spaceId)).ok,true,'Hub admin can open every teamspace');
    const personal=(await app.listSpaces(adminRoot)).find(s=>s.kind==='personal').id;
    assert.equal((await app.openSpace(hubAdminRoot,personal)).ok,true,'Hub admin can open another personal space');
    app.setPrincipal(stranger);
    assert.equal((await app.setRelayPrincipals(adminRoot,[stranger.toText()])).ok,true);
    assert.equal((await app.setSpaceRelay(intake.token,stranger.toText(),true)).ok,true);
    const bytes=Buffer.from('The agreement is awaiting signature.');
    const meta=mail({providerId:'shared-intake',messageId:'<shared-intake@test>',attachments:[{name:'agreement.txt',mime:'text/plain',size:BigInt(bytes.length),sha256:createHash('sha256').update(bytes).digest('hex'),textExtract:bytes.toString(),link:''}]});
    const pending=await app.intakeBegin('',meta);assert.equal(pending.ok,true,pending.detail);
    assert.equal((await app.intakeChunk('',pending.id,0n,bytes)).ok,true);
    const received=await app.intakeCommit('',pending.id);assert.equal(received.ok,true,received.detail);
    const source=(await app.getSource(hubAdminIntake.token,received.sourceId))[0];assert.ok(source,'second Hub reviewer sees original');
    assert.deepEqual(await app.getSource(memberRoot,received.sourceId),[]);
    assert.equal((await app.moveIncomingSource(memberRoot,received.sourceId,personal)).ok,false,'ordinary member cannot route somebody else source');
    assert.equal((await app.moveIncomingSource(intake.token,received.sourceId,personal)).ok,true,'owner routes complete source');
    assert.deepEqual(await app.getSource(hubAdminIntake.token,received.sourceId),[],'other intake reviewer loses access');
    const repeat=await app.intakeBegin('',meta);assert.equal(repeat.ok,false);assert.match(repeat.detail,/duplicate/i);assert.equal(repeat.id,0n,'receipt does not disclose private source id');
    const forwarded=await app.intakeBegin('',{...meta,providerId:'forward-copy'});assert.equal(forwarded.ok,true);
    assert.equal((await app.intakeChunk('',forwarded.id,0n,bytes)).ok,true);
    const again=await app.intakeCommit('',forwarded.id);assert.equal(again.ok,true);assert.equal(again.status,'duplicate');assert.equal(again.sourceId,0n);
    assert.equal((await app.listSources(intake.token,'',[])).length,0,'duplicate cannot recreate routed content in old intake');
    assert.deepEqual(await app.documentData(hubAdminIntake.token,source.documents[0].id),[],'file bytes also protected');
    assert.deepEqual(Buffer.from((await app.documentData(adminRoot,source.documents[0].id))[0].bytes),bytes,'original retained in destination');
    const existing=await app.createContract(adminRoot,cinput({title:'Existing personal agreement'}));assert.equal(existing.ok,true);
    assert.equal((await app.linkSource(adminRoot,received.sourceId,[existing.id],[])).ok,true,'late mail can update an existing record instead of creating a duplicate');
    assert.equal((await app.moveIncomingSource(adminRoot,received.sourceId,'intake')).ok,false,'linked evidence moves only with its complete contract');
    await settled(pic);
    assert.equal((await app.getSource(adminRoot,received.sourceId))[0].source.contractId[0],existing.id,'cancelled old extraction cannot undo routing');
    hub.setPrincipal(owner);assert.equal((await hub.setPersonRole('helpdesk@example.test','')).ok,true);
    await pic.advanceTime(31_000);await settled(pic);
    assert.deepEqual(await app.getSpace(hubAdminIntake.token),[],'old scoped session loses intake access after Hub demotion');
    assert.equal((await app.openSpace(hubAdminRoot,'intake')).ok,false);
    assert.equal((await app.whoami(hubAdminRoot))[0].role,'member','Hub demotion removes administration; no local fallback');
    assert.equal((await app.openSpace(adminRoot,'intake')).ok,true,'Hub owner still has access');
  } finally {await pic.tearDown();}
});


// Use a real pre-fix Hub to distinguish generated URLs from read-time repair.
const notificationBaseline = process.env.KEBAB_NOTIFICATION_BASELINE_DIR;
test('notifications: upgrade repairs historical root hash links without changing routes or recipient access', {skip: !notificationBaseline}, async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const {actor:hub,canisterId} = await initialized(pic, {wasm:resolve(notificationBaseline,'hub/backend.wasm')});
    const cases = [
      ['https://contracts.example.test//#/s/team:2/inbox/3','https://contracts.example.test/#/s/team:2/inbox/3'],
      ['https://contracts.example.test////#/s/p_123/c/7/terms','https://contracts.example.test/#/s/p_123/c/7/terms'],
      ['https://contracts.example.test/#/s/intake/inbox/3',null],
      ['https://contracts.example.test/app//#/s/team:2/inbox/3',null],
      ['https://contracts.example.test//?ticket=a%2Fb#/s/team:2/inbox/3',null],
      ['https://contracts.example.test//',null],
      ['https://contracts.example.test//%23/s/team:2/inbox/3',null],
      ['https://other.example.test/path?next=https://contracts.example.test//#/x',null],
      ['https://contracts.example.test//#/search?q=a//b#part', 'https://contracts.example.test/#/search?q=a//b#part'],
    ];
    for (const [i,[url]] of cases.entries()) assert.equal((await hub.hub_notify({email:'member@example.test',title:'Link '+i,url,kind:'contracts.review',dedupeKey:'link-'+i})).ok,true);
    hub.setPrincipal(member);
    const before=await hub.myNotifications('',30n);
    assert.equal(before.items.find(n=>n.title==='Link 0').url,cases[0][0], 'baseline retains the reported bad URL');
    await hub.markNotificationsRead('',[before.items.find(n=>n.title==='Link 1').id]);
    const stored=await hub.myNotifications('',30n);
    await pic.upgradeCanister({upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]},sender:controller,canisterId,wasm:candidateWasm('hub')});
    const after=await hub.myNotifications('',30n);
    assert.equal(after.total,stored.total);assert.equal(after.unread,stored.unread);
    for(const [i,[url,expected]] of cases.entries()) {
      const n=after.items.find(n=>n.title==='Link '+i),old=stored.items.find(x=>x.id===n.id);
      assert.equal(n.url,expected??url);
      assert.deepEqual({...n,url:old.url},old,'only the returned link changes');
    }
    hub.setPrincipal(stranger);assert.deepEqual((await hub.myNotifications('',30n)).items,[]);
    hub.setPrincipal(owner);assert.deepEqual((await hub.myNotifications('',30n)).items,[]);
    assert.equal(await hub.markNotificationsRead('',[after.items[0].id]),0n,'another person cannot mark the recipient notification');
    assert.equal((await hub.hub_notify({email:'member@example.test',title:'New link',url:cases[0][0],kind:'contracts.review',dedupeKey:'new'})).ok,true);
    hub.setPrincipal(member);assert.equal((await hub.myNotifications('',30n)).items.find(n=>n.title==='New link').url,cases[0][1]);
  } finally {await pic.tearDown();}
});

const reviewNotificationBaseline = process.env.KEBAB_CONTRACTS_REVIEW_BASELINE_WASM;
for (const upgrade of [false, true]) test(`contracts: review notifications stay actionable${upgrade ? ' across a 0.7.0 upgrade' : ''}`, {skip: upgrade && !reviewNotificationBaseline}, async () => {
  const pic = await PocketIc.create(server.getUrl(), {application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const fixture = await contractsFixture(pic, {appOptions: upgrade ? {wasm:resolve(reviewNotificationBaseline)} : {}});
    const {app, appId, hub, memberId, adminId, spaceId, connector, login} = fixture;
    let {adminTok, memberTok, helpdeskTok} = fixture;
    const settings = (await app.getSettings(adminTok))[0];
    assert.equal((await app.setSettings(adminTok, {...settings, appUrl:'https://contracts.example.test/'})).ok, true);
    // The notify lane is deliberately absent: real delivery failures leave requests in retry backoff.
    const sources = {};
    for (const name of ['open', 'filed', 'rejected', 'ignored', 'trashed', 'reassigned', 'partial']) {
      const title = 'Review fixture ' + name;
      const begin = await app.intakeBegin(adminTok, mail({kind:'manual', providerId:'review-'+name, messageId:'review-'+name, subject:title, text:title}));
      assert.equal(begin.ok, true, begin.detail);
      const committed = await app.intakeCommit(adminTok, begin.id); assert.equal(committed.ok, true, committed.detail);
      await extractWith(pic, [{kind:'offer', contractCandidates:[], effectiveDate:'', proposedFields:[field('title',title,title)], uncertainties:[], summary:title}]);
      const view = (await app.getSource(adminTok, committed.sourceId))[0];
      assert.equal(view.proposals.length, 1, name); assert.equal(view.proposals[0].status, 'open', name);
      sources[name] = view;
    }
    await pic.advanceTime(31_000); await settled(pic);
    const queued = (await app.connectionStatus(adminTok))[0];
    assert.equal(queued.outboxPending, 14n, 'every source has a request pending for each of the two space members');
    if (upgrade) assert.ok(readFileSync(reviewNotificationBaseline).includes(Buffer.from('A message could not be filed to a contract')), 'test starts from the actual release with the misleading text');
    const reject = async p => {
      const result = await app.decideProposal(adminTok, p.id, {expectedRevision:p.baseRevision, target:[], newContract:false, accept:[], note:'Reviewed; no change needed'});
      assert.equal(result.ok, true, result.detail);
    };
    const filed = sources.filed;
    const saved = await app.createContractFromSource(adminTok, filed.source.id, {proposalId:[filed.proposals[0].id], destination:'', fields:[{field:'title',value:'Saved software agreement'},{field:'vendor',value:'Example vendor'}]});
    assert.equal(saved.ok, true, saved.detail);
    assert.equal((await app.getSource(adminTok,filed.source.id))[0].source.status, 'filed');
    await reject(sources.rejected.proposals[0]);
    assert.equal((await app.getSource(adminTok,sources.rejected.source.id))[0].source.status, 'review', 'all proposals can be rejected while the source remains available');
    assert.equal((await app.setSourceStatus(adminTok,sources.ignored.source.id,'ignored','Unrelated')).ok,true);
    assert.equal((await app.setTrashed(adminTok,'source',sources.trashed.source.id,true)).ok,true);
    const reassigned = sources.reassigned.proposals[0];
    assert.equal((await app.assignProposal(adminTok,reassigned.id,adminId)).ok,true);
    assert.equal((await app.assignProposal(adminTok,reassigned.id,memberId)).ok,true);
    // Completing one assigned proposal must cancel its request even if another proposal remains open.
    const extra = await app.proposeChange(adminTok,saved.contractId,[sources.partial.source.id],[{field:'note',value:'Separate suggestion'}],'Extra review');
    assert.equal(extra.ok,true,extra.detail);
    assert.equal((await app.assignProposal(adminTok,extra.id,memberId)).ok,true);
    await reject((await app.getSource(adminTok,sources.partial.source.id))[0].proposals.find(p=>p.id===extra.id));
    if (upgrade) {
      await pic.upgradeCanister({sender:controller,canisterId:appId,wasm:candidateWasm('contracts'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
      await settled(pic);
      adminTok = (await app.openSpace(await login(owner),spaceId)).token;
      memberTok = (await app.openSpace(await login(member),spaceId)).token;
      helpdeskTok = await login(helpdesk);
      assert.equal((await app.getContract(adminTok,saved.contractId))[0].contract.title,'Saved software agreement', 'upgrade preserves the saved record');
      assert.equal((await app.deletePermanently(adminTok,'source',sources.trashed.source.id)).ok,true,'pre-upgrade Trash supports permanent deletion');
      assert.equal((await app.setTrashed(adminTok,'source',sources.trashed.source.id,false)).ok,false);
    }
    hub.setPrincipal(owner);
    assert.equal((await hub.setConnectorLanes(connector.id,['identity','roles','groups','ai','notify'])).ok,true);
    await pic.advanceTime(601_000); await settled(pic);
    await pic.advanceTime(31_000); await settled(pic);
    const expectedTitle = 'Document analysed — review the extracted details and save';
    for (const principal of [owner, member]) {
      hub.setPrincipal(principal);
      const received = (await hub.myNotifications('',100n)).items.filter(n=>n.kind==='contracts.review');
      assert.equal(received.length, principal===owner ? 3 : 4, 'only actionable reviews reach the Hub');
      for (const name of ['open','reassigned','partial']) {
        const url = `https://contracts.example.test/#/s/${spaceId}/inbox/${sources[name].source.id}`;
        assert.ok(received.some(n=>n.url===url && n.title===expectedTitle), name+' has a clear review request and direct link');
      }
      const assigned = received.filter(n=>n.title.startsWith('Contract review assigned'));
      assert.equal(assigned.length, principal===owner ? 0 : 1, 'only the current assignee of an open proposal is notified');
      assert.ok(received.every(n=>!n.title.includes('could not be filed')));
    }
    hub.setPrincipal(helpdesk); assert.equal((await hub.myNotifications('',100n)).items.length,0,'unrelated people get no notification');
    assert.equal((await app.getSource(memberTok,sources.open.source.id)).length,1);
    assert.deepEqual(await app.getSource(helpdeskTok,sources.open.source.id),[],'notification links grant no workspace access');
    const after = (await app.connectionStatus(adminTok))[0];
    assert.equal(after.outboxPending,0n); assert.equal(after.outboxFailed,0n,'obsolete reviews do not become delivery failures');
    assert.equal((await app.getSource(adminTok,sources.partial.source.id))[0].proposals.filter(p=>p.status==='open').length,1);
  } finally { await pic.tearDown(); }
});

test('contracts: notification destinations tolerate trailing app slashes and keep workspace access', {skip: !notificationBaseline}, async () => {
  const pic=await PocketIc.create(server.getUrl());
  try {
    const {app,hub,adminTok,memberTok,memberId,helpdeskTok,spaceId,connector}=await contractsFixture(pic,{ai:false,hubOptions:{wasm:resolve(notificationBaseline,'hub/backend.wasm')}});
    hub.setPrincipal(owner);assert.equal((await hub.setConnectorLanes(connector.id,['identity','roles','groups','notify'])).ok,true);
    const contract=await app.createContract(adminTok,cinput());assert.equal(contract.ok,true);
    const settings=(await app.getSettings(adminTok))[0];
    for (const [i,base] of ['https://contracts.example.test/','https://contracts.example.test','https://contracts.example.test///'].entries()) {
      const set=await app.setSettings(adminTok,{...settings,appUrl:base});assert.equal(set.ok,true,set.detail);
      const b=await app.intakeBegin(adminTok,mail({kind:'manual',providerId:'notify-'+i}));assert.equal(b.ok,true);
      const src=await app.intakeCommit(adminTok,b.id);assert.equal(src.ok,true);
      const proposal=await app.proposeChange(adminTok,contract.id,[src.sourceId],[{field:'note',value:'Review '+i}],'Review');assert.equal(proposal.ok,true);
      assert.equal((await app.assignProposal(adminTok,proposal.id,memberId)).ok,true);
      await pic.advanceTime(31_000);await settled(pic);
      hub.setPrincipal(member);
      const notifications=await hub.myNotifications('',30n);
      assert.ok(notifications.items.some(n=>n.url===`https://contracts.example.test/#/s/${spaceId}/inbox/${src.sourceId}`), 'old Hub receives an already-correct URL: '+JSON.stringify(notifications,(_,v)=>typeof v==='bigint'?String(v):v));
      assert.equal((await app.getSource(memberTok,src.sourceId)).length,1);
      assert.deepEqual(await app.getSource(helpdeskTok,src.sourceId),[], 'a link grants no access to an unrelated workspace');
    }
  } finally {await pic.tearDown();}
});

test('contracts: layout evidence keeps SaaS dates, successful rereads replace old AI, and purchase details save atomically', async () => {
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,appId,adminTok,adminRoot,memberTok,helpdeskTok}=await contractsFixture(pic);
    const bytes=Buffer.from('%PDF-1.4 original-layout-fixture');
    const b=await app.intakeBegin(adminTok,mail({kind:'manual',providerId:'layout-order',text:'Uploaded order form',attachments:[{name:'order.pdf',mime:'application/pdf',size:BigInt(bytes.length),sha256:createHash('sha256').update(bytes).digest('hex'),textExtract:'Example Cloud 13/03/2026 Contract Start Date*: 12/03/2027 Contract End Date*: Quantity Monthly/Unit Price 150 USD 4.80',link:''}]}));
    assert.equal(b.ok,true);assert.equal((await app.intakeChunk(adminTok,b.id,0n,bytes)).ok,true);
    const src=await app.intakeCommit(adminTok,b.id);assert.equal(src.ok,true);
    const doc=(await app.getSource(adminTok,src.sourceId))[0].documents[0];
    const event=fields=>({kind:'subscription',contractCandidates:[],effectiveDate:'',proposedFields:fields,uncertainties:[],summary:'Annual subscription with 150 seats.'});
    const textField=(key,value,quote)=>({field:key,value,basis:'explicit',evidence:[{partId:'doc:'+doc.id,quote}]});
    const visual=(key,value,quote,basis='explicit')=>({field:key,value,basis,evidence:[{partId:'visual:doc:'+doc.id,quote}]});
    let req=await pendingContractsAi(pic);
    await respondContractsAi(pic,req,aiAnswer([event([textField('vendor','Example Cloud','Example Cloud')])]));await settled(pic);
    let view=(await app.getSource(adminTok,src.sourceId))[0];const old=view.proposals.find(p=>p.status==='open');assert.ok(old);
    assert.equal((await app.reprocessSource(adminTok,src.sourceId)).ok,true);await pic.advanceTime(16_000);
    req=await pendingContractsAi(pic);
    const payload=JSON.parse(Buffer.from(req.body).toString());assert.match(payload.messages[0].content,/unitInterval|monthly unit price/i);
    const fields=[
      visual('recordType','subscription','Order Form'),visual('title','Example Cloud subscription','Order Form','derived'),textField('vendor','Example Cloud','Example Cloud'),
      textField('start','2026-03-13','Contract Start Date*: 13/03/2026'),textField('end','2027-03-12','Contract End Date*: 12/03/2027'),
      textField('seats','150','Quantity 150'),textField('quantity','150','Quantity 150'),textField('unitMinor','4.80','Monthly/Unit Price USD 4.80'),
      visual('amountMinor','9339.84','Total USD 9,339.84'),visual('currency','USD','USD'),visual('taxBasis','gross','Total Price Inclusive of taxes'),visual('interval','year','Billing Frequency: Annual'),
      visual('unitInterval','month','Monthly/Unit Price'),visual('renewalRule','auto','shall automatically renew'),visual('renewalTermMonths','12','additional one year periods'),visual('noticeDays','30','at least 30 days before the end'),
      visual('orderReference','Q-EXAMPLE','Quote Number: Q-EXAMPLE'),visual('purchaseOrder','PO-EXAMPLE','PO Number: PO-EXAMPLE'),visual('paymentTerms','Net 30; Wire Transfer','Payment Terms: Net 30'),visual('billingContact','billing@example.test','billing@example.test'),visual('commercialNotes','Calendar-annual true-up. Estimated tax; first-renewal increase cap subject to conditions.','Calendar Annually'),
    ];
    const compact={...event(fields),fields:fields.map(f=>[({amountMinor:'amountDecimal',unitMinor:'unitPriceDecimal'}[f.field]||f.field),f.value,f.basis,f.evidence.map(e=>[e.partId,e.quote])])};delete compact.proposedFields;
    await respondContractsAi(pic,req,{choices:[{message:{content:JSON.stringify({schemaVersion:2,events:[compact]})}}]});await settled(pic);
    view=(await app.getSource(adminTok,src.sourceId))[0];assert.equal(view.proposals.find(p=>p.id===old.id).status,'superseded');
    const proposal=view.proposals.find(p=>p.status==='open');assert.ok(proposal);assert.equal(view.proposals.filter(p=>p.status==='open').length,1);
    const start=proposal.changes.find(f=>f.field==='start');assert.equal(start.newValue,'2026-03-13');assert.equal(start.basis,'ambiguous');assert.equal(start.evidence[0].partId,'visual:doc:'+doc.id);
    assert.equal(proposal.changes.find(f=>f.field==='end').newValue,'2027-03-12');assert.equal(proposal.changes.find(f=>f.field==='seats').newValue,'150');
    const chosen=proposal.changes.map(f=>({field:f.field,value:f.newValue}));
    const bad=await app.createContractFromSource(adminTok,src.sourceId,{proposalId:[proposal.id],destination:'',fields:[...chosen,{field:'renewalDate',value:'bad-date'}]});assert.equal(bad.ok,false);
    assert.equal((await app.exportAll(adminTok))[0].commercialDetails.length,0,'a refused filing creates no sidecar');
    const saved=await app.createContractFromSource(adminTok,src.sourceId,{proposalId:[proposal.id],destination:'',fields:chosen});assert.equal(saved.ok,true,saved.detail);
    let record=(await app.getContract(adminTok,saved.contractId))[0];const terms=record.contract.terms;
    assert.equal(terms.start,'2026-03-13');assert.equal(terms.end,'2027-03-12');assert.equal(terms.noticeDate,'2027-02-10');assert.equal(terms.unitMinor[0],480n);assert.equal(terms.amountMinor[0],933984n);
    assert.equal(record.commercialDetails.find(f=>f.field==='unitInterval').value,'month');assert.equal(record.commercialDetails.find(f=>f.field==='purchaseOrder').value,'PO-EXAMPLE');
    assert.deepEqual(await app.getContract(helpdeskTok,saved.contractId),[]);assert.deepEqual((await app.exportAll(adminRoot))[0].commercialDetails,[]);
    assert.equal((await app.setCommercialDetails(helpdeskTok,saved.contractId,record.contract.revision,[{field:'paymentTerms',value:'Forged'}])).ok,false);
    assert.equal((await app.setCommercialDetails(memberTok,saved.contractId,record.contract.revision,[{field:'renewalTermMonths',value:'-1'}])).ok,false);
    assert.equal((await app.setCommercialDetails(adminTok,saved.contractId,record.contract.revision,[{field:'purchaseOrder',value:'PO-EDITED'}])).ok,true);
    assert.equal((await app.setCommercialDetails(adminTok,saved.contractId,record.contract.revision,[{field:'purchaseOrder',value:'STALE'}])).ok,false);
    assert.match(await app.exportCsv(memberTok),/PO-EDITED/);
    await pic.upgradeCanister({upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]},sender:controller,canisterId:appId,wasm:candidateWasm('contracts')});
    const space=(await app.openSpace(adminRoot,'team:1'));assert.equal(space.ok,true);
    record=(await app.getContract(space.token,saved.contractId))[0];assert.equal(record.commercialDetails.find(f=>f.field==='purchaseOrder').value,'PO-EDITED');
    assert.equal((await app.setTrashed(space.token,'contract',saved.contractId,true)).ok,true);assert.doesNotMatch(await app.exportCsv(space.token),/PO-EDITED/);assert.deepEqual((await app.exportAll(space.token))[0].commercialDetails,[]);
  } finally {await pic.tearDown();}
});


test('contracts: timeout stays pending, bounded retry returns compact facts, invalid evidence and permanent errors preserve old suggestions', async()=>{
  const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
  try {
    const {app,hub,adminTok,adminRoot}=await contractsFixture(pic);
    hub.setPrincipal(owner);await hub.setAi({provider:'anthropic',url:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-5',visionModel:[],key:'fixture-key'});
    await pic.advanceTime(16_000);await settled(pic);await app.refreshAiStatus(adminRoot);
    const b=await app.intakeBegin(adminTok,mail({providerId:'timeout-compact',messageId:'timeout-compact',text:'Example Cloud. Start 2026-03-13. 150 seats.'}));
    const {sourceId}=await app.intakeCommit(adminTok,b.id);
    let req=await pendingContractsAi(pic), payload=JSON.parse(Buffer.from(req.body).toString());
    assert.equal(payload.output_config.effort,'medium');assert.match(payload.messages[0].content,/"schemaVersion":2/);
    await pic.mockPendingHttpsOutcall({requestId:req.requestId,subnetId:req.subnetId,response:{type:'reject',statusCode:2,message:'Canister http request timed out; PRIVATE PAYLOAD'}});await settled(pic);
    let view=(await app.getSource(adminTok,sourceId))[0];assert.equal(view.source.status,'received');assert.match(view.source.note,/AI_TIMEOUT.*Retrying automatically/);assert.ok(!view.source.note.includes('PRIVATE PAYLOAD'));
    const job=(await app.connectionStatus(adminTok))[0].jobs.find(j=>j.ref===sourceId);assert.equal(job.attempts,1n);assert.ok(Number(job.nextAt/1000000n)-await pic.getTime()<=30_000);
    for(let i=0;i<3;i++){await pic.advanceTime(17_000);await settled(pic);}req=await pendingContractsAi(pic);
    const event={kind:'subscription',contractCandidates:[],effectiveDate:'',fields:[['vendor','Example Cloud','explicit',[['body','Example Cloud']]],['start','2026-03-13','explicit',[['body','Start 2026-03-13']]],['seats','150','explicit',[['body','150 seats']]]],uncertainties:[],summary:'Example subscription'};
    await respondContractsAi(pic,req,{content:[{type:'text',text:JSON.stringify({schemaVersion:2,events:[event]})}]});await settled(pic);
    view=(await app.getSource(adminTok,sourceId))[0];const old=view.proposals.find(p=>p.status==='open');assert.ok(old);assert.equal(old.changes.find(f=>f.field==='start').newValue,'2026-03-13');
    assert.equal((await app.reprocessSource(adminTok,sourceId)).ok,true);req=await pendingContractsAi(pic);
    const forged={...event,fields:[['vendor','Private other company','explicit',[['visual:doc:99999','Private other company']]]]};
    await respondContractsAi(pic,req,{content:[{type:'text',text:JSON.stringify({schemaVersion:2,events:[forged]})}]});await settled(pic);
    view=(await app.getSource(adminTok,sourceId))[0];assert.equal(view.proposals.filter(p=>p.status==='open').length,1);assert.equal(view.proposals.find(p=>p.status==='open').id,old.id);assert.match(view.source.note,/not supplied/);
    assert.equal((await app.reprocessSource(adminTok,sourceId)).ok,true);req=await pendingContractsAi(pic);
    await respondContractsAi(pic,req,{error:{message:'PRIVATE key or document'}},401);await settled(pic);
    view=(await app.getSource(adminTok,sourceId))[0];assert.equal(view.source.status,'failed');assert.match(view.source.note,/rejected access/);assert.ok(!view.source.note.includes('PRIVATE'));assert.equal(view.proposals.find(p=>p.status==='open').id,old.id);
    assert.equal((await app.connectionStatus(adminTok))[0].jobs.filter(j=>j.ref===sourceId&&!j.doneAt).length,0,'permanent rejection does not make more paid calls');
  } finally {await pic.tearDown();}
});


test('contracts: decimal currency wire names stay in dollars and reject cents-scaled suggestions without losing other facts',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const {app,adminTok}=await contractsFixture(pic);
  const b=await app.intakeBegin(adminTok,mail({providerId:'money-wire',messageId:'money-wire',text:'Example Software. Total USD 9,339.84. Unit price USD 4.80 per month. Start 2026-03-13.'}));
  const {sourceId}=await app.intakeCommit(adminTok,b.id);
  const event=(total,unit)=>({kind:'subscription',contractCandidates:[],effectiveDate:'',fields:[['vendor','Example Software','explicit',[['body','Example Software']]],['start','2026-03-13','explicit',[['body','2026-03-13']]],['amountDecimal',total,'explicit',[['body','USD 9,339.84']]],['unitPriceDecimal',unit,'explicit',[['body','USD 4.80']]]],uncertainties:[],summary:'Software subscription'});
  let req=await pendingContractsAi(pic);
  await respondContractsAi(pic,req,{choices:[{message:{content:JSON.stringify({schemaVersion:2,events:[event('9339.84','4.80')]})}}]});await settled(pic);
  let p=(await app.getSource(adminTok,sourceId))[0].proposals.find(p=>p.status==='open');assert.equal(p.changes.find(f=>f.field==='amountMinor').newValue,'933984');assert.equal(p.changes.find(f=>f.field==='unitMinor').newValue,'480');
  await app.reprocessSource(adminTok,sourceId);req=await pendingContractsAi(pic);
  await respondContractsAi(pic,req,{choices:[{message:{content:JSON.stringify({schemaVersion:2,events:[event('933984','480')]})}}]});await settled(pic);
  p=(await app.getSource(adminTok,sourceId))[0].proposals.find(p=>p.status==='open');assert.equal(p.changes.find(f=>f.field==='start').newValue,'2026-03-13');assert.ok(!p.changes.some(f=>f.field==='amountMinor'||f.field==='unitMinor'));assert.match(p.uncertainties.join(' '),/100 times/);
 }finally{await pic.tearDown();}
});

test('contracts: SaaS keys stay private, group assignments update without sharing, and price changes retain history',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const {app,hub,adminTok,memberTok,memberRoot,adminRoot,helpdeskTok,adminId,memberId}=await contractsFixture(pic,{ai:false});
  const input={tool:'Pixel editor',vendor:'Example software',key:'SECRET-KEY-DO-NOT-EXPORT',ownerId:adminId,seats:[3n],expires:'2027-09-01',note:'Design team'};
  const key=await app.saveLicenseKey(adminTok,[],0n,input);assert.equal(key.ok,true,key.detail);
  assert.deepEqual(await app.revealLicenseKey(memberTok,key.id),[],'team editor is not automatically a key viewer');
  assert.deepEqual(await app.revealLicenseKey(helpdeskTok,key.id),[]);
  assert.deepEqual(await app.revealLicenseKey(memberRoot,key.id),[],'workspace-bound access');
  assert.equal((await app.revealLicenseKey(adminTok,key.id))[0],input.key);
  const serialize=v=>JSON.stringify(v,(_,v)=>typeof v==='bigint'?String(v):v);
  for(const data of [await app.portfolio(adminTok),await app.getContract(adminTok,key.id),await app.exportAll(adminTok)])assert.ok(!serialize(data).includes(input.key),'secret is outside ordinary queries, exports and audit');
  assert.equal((await app.saveLicenseKey(adminTok,[key.id],0n,{...input,key:'STALE'})).ok,false);
  assert.equal((await app.saveLicenseKey(adminTok,[key.id],1n,{...input,key:'',note:'Updated'})).ok,true);
  assert.equal((await app.revealLicenseKey(adminTok,key.id))[0],input.key,'blank replacement retains key');
  assert.equal((await app.setTrashed(adminTok,'contract',key.id,true)).ok,true);assert.deepEqual(await app.revealLicenseKey(adminTok,key.id),[]);
  assert.equal((await app.setTrashed(adminTok,'contract',key.id,false)).ok,true);
  hub.setPrincipal(owner);const group=await hub.addGroup('Design','License roster');assert.equal(group.ok,true);await hub.setGroupMembers(group.id,['member@example.test','helpdesk@example.test'],[]);
  await pic.advanceTime(31_000);await settled(pic);
  assert.equal((await app.directoryGroups(adminTok)).find(g=>g.name==='Design').members,2n);
  const rec=await app.createContract(adminTok,cinput({responsible:adminId,visibility:'restricted'}));assert.equal(rec.ok,true);
  assert.equal((await app.setLicenseAssignments(adminTok,rec.id,1n,[memberId],['Design'])).ok,true);
  let roster=(await app.licenseAssignment(adminTok,rec.id))[0];assert.equal(roster.people.length,2,'direct + group deduplicated');assert.deepEqual(await app.getContract(helpdeskTok,rec.id),[],'licensing grants no contract access');
  assert.equal((await app.setLicenseAssignments(memberTok,rec.id,2n,[],[])).ok,false);
  assert.equal((await app.setTerms(adminTok,rec.id,2n,TERMS,'Initial')).ok,true);
  await pic.advanceTime(1000);assert.equal((await app.setTerms(adminTok,rec.id,3n,{...TERMS,amountMinor:[200000n]},'Price update')).ok,true);
  const hist=(await app.portfolio(adminTok))[0].rows.find(r=>r.contract.id===rec.id).history;
  assert.ok(hist.some(h=>h.terms.amountMinor[0]===150000n));assert.equal(hist.at(-1).terms.amountMinor[0],200000n);
  hub.setPrincipal(owner);await hub.setGroupMembers(group.id,[],['helpdesk@example.test']);await pic.advanceTime(31_000);await settled(pic);
  roster=(await app.licenseAssignment(adminTok,rec.id))[0];assert.equal(roster.people.length,1,'group removal reflected');
  const upload=await app.intakeBegin(adminTok,mail({kind:'manual',providerId:'compact-save',text:'Subscription for the team'}));assert.equal(upload.ok,true);const src=await app.intakeCommit(adminTok,upload.id);
  const fields=[{field:'title',value:'Saved directly from review'},{field:'product',value:'Review tool'},{field:'trackStatus',value:'active'},{field:'ownerId',value:memberId},{field:'start',value:'2026-09-01'},{field:'end',value:'2027-08-31'},{field:'renewalRule',value:'auto'},{field:'noticeDays',value:'30'}];
  const bad=await app.createContractFromSource(adminTok,src.sourceId,{proposalId:[],destination:(await app.whoami(adminTok))[0].space,fields:fields.map(f=>f.field==='ownerId'?{...f,value:'p_unknown'}:f)});assert.equal(bad.ok,false);assert.deepEqual((await app.getSource(adminTok,src.sourceId))[0].source.contractId,[],'invalid owner does not create an orphan');
  const filed=await app.createContractFromSource(adminTok,src.sourceId,{proposalId:[],destination:(await app.whoami(adminTok))[0].space,fields});assert.equal(filed.ok,true,filed.detail);const saved=(await app.getContract(adminTok,filed.contractId))[0].contract;assert.equal(saved.status,'active');assert.equal(saved.responsible,memberId);assert.ok(saved.terms.noticeDate,'deadline computed on one-save filing');
  const policy=(await app.portfolio(adminTok))[0].policy;
  assert.equal((await app.setRenewalPolicy(memberTok,policy)).ok,false,'editor cannot change workspace delivery');
  assert.equal((await app.setRenewalPolicy(adminTok,{...policy,days:[30n]})).ok,false,'90-day first warning required');
  assert.equal((await app.setRenewalPolicy(adminTok,{...policy,groups:['Design']})).ok,true);
 }finally{await pic.tearDown();}
});

test('contracts: SaaS reminders warn at 90 days and earlier cancellation deadlines, deduplicate, and respect access',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  await pic.setTime(Date.UTC(2026,8,10,10));
  const {app,hub,adminTok,memberTok,adminRoot,memberRoot,adminId,memberId,spaceId,connector}=await contractsFixture(pic,{ai:false});
  hub.setPrincipal(owner);await hub.setConnectorLanes(connector.id,['identity','roles','groups','notify']);
  const config=(await app.getSettings(adminTok))[0];assert.equal((await app.setSettings(adminTok,{...config,appUrl:'https://contracts.example.test/'})).ok,true);
  const create=async(tok,title,t)=>{const c=await app.createContract(tok,cinput({title,product:title}));assert.equal(c.ok,true);assert.equal((await app.setTerms(tok,c.id,1n,t,'Confirmed')).ok,true);assert.equal((await app.setStatus(tok,c.id,2n,'active','Confirmed')).ok,true);return c.id;};
  const renewal='2026-12-09';
  const cid=await create(adminTok,'Ninety-day contract',{...TERMS,renewalDate:renewal,noticeMonths:[],noticeDays:[30n]});
  const early=await create(adminTok,'Long notice contract',{...TERMS,renewalDate:'2027-03-01',noticeMonths:[],noticeDays:[120n]});
  const personal=await create(memberRoot,'PERSONAL DO NOT DISCLOSE',{...TERMS,renewalDate:renewal,noticeMonths:[],noticeDays:[30n]});
  await pic.advanceTime(121_000);await settled(pic);await pic.advanceTime(31_000);await settled(pic);
  hub.setPrincipal(owner);const first=await hub.myNotifications('',100n);
  assert.ok(first.items.some(n=>n.title.includes('Ninety-day contract')),JSON.stringify({first,status:await app.connectionStatus(adminTok),portfolio:await app.portfolio(adminTok)},(_,v)=>typeof v==='bigint'?String(v):v));assert.ok(first.items.some(n=>n.title.includes('Long notice contract')),'early cancellation does not wait for renewal-90');
  assert.ok(first.items.some(n=>n.title.includes('PERSONAL DO NOT DISCLOSE')),'central Admin has content access and receives the enabled admin reminder');
  assert.ok(first.items.find(n=>n.title.includes('Ninety-day contract')).url.endsWith(`/s/${spaceId}/c/${cid}`));
  hub.setPrincipal(member);const mine=await hub.myNotifications('',100n);assert.ok(mine.items.some(n=>n.title.includes('PERSONAL DO NOT DISCLOSE')));
  await pic.advanceTime(6*3600_000);await settled(pic);await pic.advanceTime(31_000);await settled(pic);
  hub.setPrincipal(owner);assert.equal((await hub.myNotifications('',100n)).items.filter(n=>n.title.includes('Ninety-day contract')).length,1,'same threshold not sent twice');
 }finally{await pic.tearDown();}
});

test('contracts: vendor terms read a public page as supplementary evidence without changing contract fields',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const {app,appId,idlFactory,adminTok,helpdeskTok,hub,connector}=await contractsFixture(pic,{ai:false});
  const b=await app.intakeBegin(adminTok,mail({kind:'manual',providerId:'vendor-check-source',text:'Private deal information must not be sent to vendor.'}));assert.equal(b.ok,true);const src=await app.intakeCommit(adminTok,b.id);await settled(pic);
  assert.equal((await app.lookupVendorTerms(helpdeskTok,src.sourceId,'https://example.com/terms')).ok,false);
  assert.equal((await app.lookupVendorTerms(adminTok,src.sourceId,'https://127.0.0.1/terms')).ok,false);
  assert.equal((await app.lookupVendorTerms(adminTok,src.sourceId,'https://0x7f.0x00.0x00.0x01/terms')).ok,false);
  hub.setPrincipal(owner);await hub.setConnectorLanes(connector.id,['identity','roles','groups','ai']);await hub.setAi({provider:'openai',url:'https://ai.example.test/v1/chat/completions',model:'test-model',key:'fixture-key',visionModel:[]});
  await pic.advanceTime(301_000);await settled(pic);await app.refreshAiStatus(adminTok);
  const deferred=pic.createDeferredActor(idlFactory,appId);const finish=await deferred.lookupVendorTerms(adminTok,src.sourceId,'https://example.com/terms');
  let request=await pendingContractsAi(pic);assert.equal(request.url,'https://example.com/terms');assert.equal(request.httpMethod,'GET');assert.equal(request.body.length,0,'no private document sent to vendor');
  assert.equal((await app.lookupVendorTerms(adminTok,src.sourceId,'https://example.com/terms')).ok,false,'duplicate click cannot start another lookup while the first is running');
  const quote='Subscriptions renew automatically unless cancelled at least 30 days before renewal.';
  await pic.mockPendingHttpsOutcall({requestId:request.requestId,subnetId:request.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('<html><p>'+quote+'</p></html>')}});
  request=await pendingContractsAi(pic);assert.ok(!Buffer.from(request.body).toString().includes('Private deal information'));
  await respondContractsAi(pic,request,{choices:[{message:{content:JSON.stringify({renewalRule:'auto',noticeDays:'30',noticeMonths:'',quote,detail:'Current public subscription terms.'})}}]});
  const result=await finish();assert.equal(result.ok,true,result.detail);
  const check=(await app.vendorTermsStatus(adminTok,src.sourceId))[0];assert.equal(check.status,'ready');assert.equal(check.noticeDays[0],30n);
  assert.equal((await app.portfolio(adminTok))[0].rows.length,0,'web lookup never files or confirms a contract');
  assert.deepEqual(await app.vendorTermsStatus(helpdeskTok,src.sourceId),[]);
 }finally{await pic.tearDown();}
});

test('contracts: SaaS upgrade preserves 0.6.3 originals, then keys, policies and prices across another upgrade',{skip:!process.env.KEBAB_CONTRACTS_SAAS_BASELINE_DIR},async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const baseline=process.env.KEBAB_CONTRACTS_SAAS_BASELINE_DIR;
  const oldCode=execFileSync('python3',['sdk/tools/did2idl.py',resolve(baseline,'backend.did')],{encoding:'utf8'}),oldIdl=(await import('data:text/javascript;base64,'+Buffer.from(oldCode).toString('base64'))).idlFactory;
  const f=await contractsFixture(pic,{ai:false,appOptions:{wasm:resolve(baseline,'backend.wasm'),idlFactory:oldIdl}});let app=f.app;
  assert.equal((await app.info()).version,'0.6.3');
  const cid=(await app.createContract(f.adminTok,cinput())).id;await app.setTerms(f.adminTok,cid,1n,TERMS,'Before upgrade');
  const bytes=Buffer.from('Original contract retained');const b=await app.intakeBegin(f.adminTok,mail({kind:'eml',providerId:'saas-upgrade',attachments:[{name:'original.txt',mime:'text/plain',size:BigInt(bytes.length),sha256:createHash('sha256').update(bytes).digest('hex'),textExtract:bytes.toString(),link:''}]}));await app.intakeChunk(f.adminTok,b.id,0n,bytes);const src=await app.intakeCommit(f.adminTok,b.id);await app.linkSource(f.adminTok,src.sourceId,[cid],[]);const doc=(await app.getSource(f.adminTok,src.sourceId))[0].documents[0].id;
  const upgrade=()=>pic.upgradeCanister({upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]},sender:controller,canisterId:f.appId,wasm:candidateWasm('contracts')});
  const login=async()=>{f.hub.setPrincipal(owner);const ticket=await f.hub.mintAppTicket('',f.connector.tileId);const root=(await app.loginWithTicket(ticket.ticket))[0].token;return (await app.openSpace(root,f.spaceId)).token;};
  await upgrade();app=pic.createActor(f.idlFactory,f.appId);let tok=await login();
  assert.equal((await app.info()).version,'0.7.0');assert.equal((await app.getContract(tok,cid))[0].contract.terms.amountMinor[0],150000n);assert.deepEqual(Buffer.from((await app.documentData(tok,doc))[0].bytes),bytes);
  const key=await app.saveLicenseKey(tok,[],0n,{tool:'Editor',vendor:'Example',key:'PERSISTENT-SECRET',ownerId:f.adminId,seats:[1n],expires:'',note:''});assert.equal(key.ok,true);
  let policy=(await app.portfolio(tok))[0].policy;assert.equal((await app.setRenewalPolicy(tok,{...policy,days:[90n,14n],hubAdmins:false})).ok,true);
  assert.equal((await app.setTerms(tok,cid,2n,{...TERMS,amountMinor:[250000n]},'After upgrade')).ok,true);
  await upgrade();app=pic.createActor(f.idlFactory,f.appId);tok=await login();
  assert.deepEqual(await app.revealLicenseKey(tok,key.id),['PERSISTENT-SECRET']);const portfolio=(await app.portfolio(tok))[0];assert.deepEqual(portfolio.policy.days,[90n,14n]);assert.equal(portfolio.rows.find(r=>r.contract.id===cid).history.at(-1).terms.amountMinor[0],250000n);assert.deepEqual(Buffer.from((await app.documentData(tok,doc))[0].bytes),bytes);
 }finally{await pic.tearDown();}
});

// External bearer access must stay confined to one sale, including across an upgrade.
test('assets: external dealroom — scoped links, atomic invoice, receipt, IT hand-over and immutable history', { timeout: 240000 }, async () => {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const Principal = controller.constructor;
  const pic = await PocketIc.create(server.getUrl());
  try {
    await pic.setTime(Date.parse('2026-09-08T10:00:00Z'));
    const { actor: hub, canisterId: hubId } = await initialized(pic);
    const baselineCode = process.env.KEBAB_ASSETS_BASELINE_DID ? execFileSync('python3',['sdk/tools/did2idl.py',process.env.KEBAB_ASSETS_BASELINE_DID],{encoding:'utf8'}) : null;
    const baselineIdl = baselineCode ? (await import('data:text/javascript;base64,'+Buffer.from(baselineCode).toString('base64'))).idlFactory : null;
    let { actor: app, canisterId: appId, idlFactory: candidateIdl } = await install(pic, 'assets', process.env.KEBAB_ASSETS_BASELINE ? {wasm:resolve(process.env.KEBAB_ASSETS_BASELINE), ...(baselineIdl ? {idlFactory:baselineIdl} : {})} : {});
    app.setPrincipal(controller); await app.setHub(hubId.toText());
    hub.setPrincipal(owner);
    const c = await connectTestApp(hub, { name:'assets', canisterId:appId.toText(), note:'', lanes:['identity','roles','groups'], access:{mode:'everyone',groups:[],roles:[],people:[]}, tile:[{name:'assets',kind:'app',url:'https://assets.example.test'}] });
    assert.ok(c.ok,c.detail);
    const login = async p => { hub.setPrincipal(p); const t = await hub.mintAppTicket('',c.tileId); assert.ok(t.ok,t.detail); return (await app.loginWithTicket(t.ticket))[0]; };
    let adminSession = await login(owner), adminTok = adminSession.token, memberTok = (await login(member)).token;
    const settings = {adminGroup:'',appUrl:'https://assets.example.test/',tagPrefix:'INV-',orgName:'Test company'};
    assert.ok((await app.setSettings(adminTok,settings)).ok);
    await settled(pic); await pic.advanceTime(2000); await pic.tick(3);
    const terms = 'Used equipment. Before hand-over the device must be wiped and removed from company management.\n' + 'The buyer has reviewed the equipment and the agreed price. '.repeat(65) + '\nEND OF COMPLETE TERMS';
    const billing = {legalName:'Test company AG',street:'Musterstrasse',houseNo:'11',postalCode:'8002',town:'Zürich',country:'CH',uid:'CHE-123.456.789',vatRegistered:true,vatRateBp:810n,iban:'CH9300762011623852957',currency:'CHF',prefix:'IT-',yearInNumber:true,paymentDays:14n,lang:'en',depreciationMonths:36n,floorPct:10n,minPriceMinor:5000n,waiverText:terms,waiverVersion:1n,footer:'TEST FIXTURE — not a real invoice'};
    assert.ok((await app.setBilling(adminTok,billing)).ok);
    const buyer = {pid:'',name:'Élodie Müller',email:'buyer@example.test',street:'Seestrasse',houseNo:'7b',postalCode:'8802',town:'Kilchberg',country:'CH'};
    const address = {street:'Seestrasse',houseNo:'7b',postalCode:'8802',town:'Kilchberg',country:'CH'};
    let seq=0;
    const create = async () => { const a=await app.createAsset(adminTok,{tag:'DEAL-'+(++seq),serial:'SERIAL-DEAL-'+seq,vendor:'Apple',model:'MacBook Pro 14 inch',kind:'laptop',note:''}); assert.ok(a.ok,a.detail); const s=await app.createSale(adminTok,a.id,buyer,50000n,'');assert.ok(s.ok,s.detail);return {aid:a.id,sid:s.id}; };
    // Populate the old release with an already-issued outside sale and an archived document.
    const legacy=await create(); assert.ok((await app.offerSale(adminTok,legacy.sid)).ok);
    assert.ok((await app.recordWaiver(adminTok,legacy.sid,'Signed paper held by IT')).ok);
    assert.ok((await app.setSaleChecks(adminTok,legacy.sid,true,true)).ok);
    const oldInvoice=await app.issueInvoice(adminTok,legacy.sid);assert.ok(oldInvoice.ok,oldInvoice.detail);
    const oldBytes=Buffer.from('%PDF-1.4\n'+ 'legacy archive '.repeat(15));
    assert.ok((await app.attachSaleDocument(adminTok,legacy.sid,'invoice',oldBytes)).ok);
    const oldView=(await app.getSale(adminTok,legacy.sid))[0];
    if(process.env.KEBAB_ASSETS_BASELINE) { await pic.upgradeCanister({sender:controller,canisterId:appId,wasm:candidateWasm('assets'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}}); app=pic.createActor(candidateIdl,appId); app.setPrincipal(controller); }
    assert.equal((await app.info()).version,readFileSync('assets/mops.toml','utf8').match(/^version\s*=\s*"([^"]+)"/m)[1]);
    assert.deepEqual((await app.getSale(adminTok,legacy.sid))[0].sale,oldView.sale,'historical invoice unchanged by upgrade');
    const mint=async sid => { const r=await app.createDealLink(adminTok,sid);assert.ok(r.ok,r.detail);assert.match(r.url,/^https:\/\/assets\.example\.test\/deal\.html#[1-9][0-9]*\.[a-f0-9]{64}$/);return r.url.split('.').at(-1); };
    const oldKey=await mint(legacy.sid);
    assert.equal((await app.getDeal(legacy.sid,oldKey))[0].acceptedHow,oldView.sale.acceptedHow,'link does not invent a new acceptance on an issued invoice');
    assert.deepEqual(Buffer.from((await app.dealDocument(legacy.sid,oldKey))[0].bytes),oldBytes);
    assert.equal((await app.completeSaleHandover(adminTok,legacy.sid,false,'')).ok,false,'receipt optional does not bypass payment');
    assert.ok((await app.markPaid(adminTok,legacy.sid,'Synthetic bank confirmation')).ok);
    assert.equal((await app.completeSaleHandover(memberTok,legacy.sid,false,'')).ok,false,'receipt optional does not bypass admin authorization');
    assert.ok((await app.revokeDealLink(adminTok,legacy.sid)).ok);
    assert.ok((await app.completeSaleHandover(adminTok,legacy.sid,false,'Collected; receipt not yet confirmed')).ok,'paid prepared sale can finish even when the unconfirmed dealroom link is revoked');
    const legacyStatus=(await app.dealStatus(adminTok,legacy.sid))[0];
    assert.equal(legacyStatus.completedAt,0n,'IT handover must never invent buyer confirmation');
    assert.ok(legacyStatus.handedOverAt>0n);
    assert.deepEqual(Buffer.from((await app.saleDocument(adminTok,oldView.sale.pdfId))[0].bytes),oldBytes,'hand-over keeps the archived invoice unchanged');
    const a=await create();
    assert.equal((await app.createDealLink(memberTok,a.sid)).ok,false);
    assert.deepEqual(await app.dealStatus(memberTok,a.sid),[]);
    let key=await mint(a.sid);app.setPrincipal(Principal.anonymous());
    const first=(await app.getDeal(a.sid,key))[0]; assert.equal(first.status,'offered');assert.equal(first.invoice.length,0);
    assert.deepEqual(await app.getDeal(legacy.sid,key),[],'key is bound to sale');
    assert.deepEqual(await app.getDeal(a.sid,'0'.repeat(64)),[]);
    assert.deepEqual(await app.getDeal(a.sid,key.toUpperCase()),[]);
    assert.deepEqual(await app.getSale('',a.sid),[]);
    assert.equal((await app.revokeDealLink(memberTok,a.sid)).ok,false);
    assert.equal((await app.completeDealHandover(memberTok,a.sid,true,'')).ok,false);
    assert.ok(await app.visitDeal(a.sid,key));assert.ok(await app.visitDeal(a.sid,key));
    assert.equal((await app.dealStatus(adminTok,a.sid))[0].history.filter(x=>x.action==='opened').length,1,'previews only record one open');
    assert.equal((await app.confirmDeal(a.sid,key,'','')).ok,false);
    assert.equal((await app.acceptDeal(a.sid,key,'stale',address)).ok,false);
    assert.equal((await app.acceptDeal(a.sid,key,first.quote,{...address,country:'12'})).ok,false);
    assert.equal((await app.acceptDeal(a.sid,key,first.quote,{...address,street:''})).ok,false);
    assert.equal((await app.acceptDeal(a.sid,key,first.quote,{...address,street:'x'.repeat(71)})).ok,false);
    const before=(await app.getSale(adminTok,a.sid))[0].sale;
    assert.ok((await app.updateSale(adminTok,a.sid,buyer,51000n,'price corrected',before.description)).ok);
    assert.deepEqual(await app.getDeal(a.sid,key),[],'editing an offer revokes its link');
    key=await mint(a.sid);const previous=key;key=await mint(a.sid);
    assert.deepEqual(await app.getDeal(a.sid,previous),[],'replacement invalidates previous link');
    const changed=(await app.getDeal(a.sid,key))[0];
    assert.ok((await app.setBilling(adminTok,{...billing,legalName:'Updated company AG'})).ok);
    assert.equal((await app.getDeal(a.sid,key))[0].changed,true);
    assert.equal((await app.acceptDeal(a.sid,key,changed.quote,address)).ok,false,'billing snapshot is part of accepted offer');
    assert.equal((await app.declineDeal(a.sid,key,changed.quote,'')).ok,false);
    key=await mint(a.sid);const offer=(await app.getDeal(a.sid,key))[0];
    assert.equal((await app.acceptDeal(a.sid,key,offer.quote,{...address,town:"東京"})).ok,false,"unsupported PDF text must not silently change the invoice");
    const acceptance=await app.acceptDeal(a.sid,key,offer.quote,address);assert.ok(acceptance.ok,acceptance.detail);
    let accepted=(await app.getDeal(a.sid,key))[0]; const invoice=accepted.invoice[0];
    assert.equal(accepted.status,'issued');assert.equal(accepted.acceptedHow,'dealroom');assert.equal(accepted.pdfReady,true);
    assert.equal(invoice.number,'IT-2026-0002','failed accepts consumed no invoice numbers');
    assert.ok(invoice.qrPayload.split('\n')[29].length + invoice.qrPayload.split('\n')[31].length <= 140,'combined QR additional information limit');
    assert.equal(invoice.grossMinor,51000n);assert.equal(invoice.waiverText,terms);
    assert.equal((await app.getAsset(adminTok,a.aid))[0].asset.status,'in_stock','invoice does not assert physical hand-over');
    assert.ok((await app.acceptDeal(a.sid,key,offer.quote,address)).ok,'retry succeeds idempotently');
    assert.equal((await app.getDeal(a.sid,key))[0].invoice[0].number,invoice.number);
    assert.equal((await app.declineDeal(a.sid,key,offer.quote,'changed my mind')).ok,false,'issued invoices require IT credit note');
    assert.equal((await app.confirmDeal(a.sid,key,invoice.number,accepted.pdfHash)).ok,false,'viewing invoice metadata does not confirm receipt');
    const doc=(await app.dealDocument(a.sid,key))[0];assert.ok(doc.bytes.length>1000);
    assert.equal(createHash('sha256').update(Buffer.from(doc.bytes)).digest('hex'),doc.hash);
    if(process.env.KEBAB_DEALROOM_ARTIFACTS){const dir=resolve(process.env.KEBAB_DEALROOM_ARTIFACTS);mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'invoice.pdf'),Buffer.from(doc.bytes));writeFileSync(resolve(dir,'qr-payload.txt'),invoice.qrPayload);writeFileSync(resolve(dir,'invoice.json'),JSON.stringify({invoice,view:accepted},(_,v)=>typeof v==='bigint'?v.toString():v,2));}
    assert.equal((await app.confirmDeal(a.sid,key,invoice.number,'bad')).ok,false);
    assert.ok((await app.confirmDeal(a.sid,key,invoice.number,doc.hash)).ok);
    assert.ok((await app.confirmDeal(a.sid,key,invoice.number,doc.hash)).ok);
    assert.equal((await app.getDeal(a.sid,key))[0].paidAt,0n,'buyer cannot mark payment');
    assert.equal((await app.markPaid('',a.sid,'')).ok,false);
    assert.equal((await app.markPaid(memberTok,a.sid,'')).ok,false);
    assert.equal((await app.completeDealHandover(adminTok,a.sid,true,'')).ok,false);
    await settled(pic);
    assert.match((await app.dealStatus(adminTok,a.sid))[0].notification,/notify lane/,'failed notification remains in outbox');
    hub.setPrincipal(owner);assert.ok((await hub.setConnectorLanes(c.id,['identity','roles','groups','notify'])).ok);
    await pic.advanceTime(310000);await settled(pic); adminSession=await login(owner);adminTok=adminSession.token;
    const notifications=await hub.myNotifications(adminSession.suiteToken,100n);
    assert.ok(notifications.items.some(n=>/completed the dealroom/.test(n.title)),'completion delivered after retry: '+JSON.stringify({notes:notifications.items.map(n=>[n.title,n.email]),pending:(await app.dealStatus(adminTok,a.sid))[0].notification}));
    assert.ok(notifications.items.filter(n=>n.kind==='assets.dealroom').every(n=>n.url===`https://assets.example.test/#/sale/${a.sid}`&&!n.url.includes(key)),'IT notifications never carry buyer capability');
    assert.equal((await app.dealStatus(adminTok,a.sid))[0].notification,'');
    assert.ok((await app.markPaid(adminTok,a.sid,'Bank statement checked')).ok);
    assert.equal((await app.createSale(adminTok,a.aid,buyer,50000n,'')).ok,false,'reservation remains until hand-over');
    assert.equal((await app.completeDealHandover(adminTok,a.sid,true,'')).ok,false,'preparation still required');
    assert.ok((await app.setSaleChecks(adminTok,a.sid,true,true)).ok);
    assert.ok((await app.completeDealHandover(adminTok,a.sid,false,'Collected at reception')).ok);
    assert.equal((await app.getAsset(adminTok,a.aid))[0].asset.status,'sold');
    assert.equal((await app.setSaleChecks(adminTok,a.sid,false,false)).ok,false,'cannot rewrite completed preparation');
    assert.ok((await app.setBilling(adminTok,{...billing,legalName:'Future seller',waiverText:'New terms'})).ok);
    assert.deepEqual((await app.getDeal(a.sid,key))[0].invoice[0],invoice,'subsequent billing changes do not rewrite an invoice');
    assert.deepEqual(Buffer.from((await app.dealDocument(a.sid,key))[0].bytes),Buffer.from(doc.bytes));
    const status=(await app.dealStatus(adminTok,a.sid))[0];assert.equal(status.history.filter(e=>e.action==='accepted').length,1);assert.equal(status.history.filter(e=>e.action==='completed').length,1);assert.ok(status.history.some(e=>e.action==='handed_over'));
    const rejected=await create(), rejectKey=await mint(rejected.sid), rejectView=(await app.getDeal(rejected.sid,rejectKey))[0];
    assert.ok((await app.declineDeal(rejected.sid,rejectKey,rejectView.quote,'No longer needed')).ok);
    assert.ok((await app.declineDeal(rejected.sid,rejectKey,rejectView.quote,'')).ok);
    assert.equal((await app.getSale(adminTok,rejected.sid))[0].sale.status,'cancelled');assert.equal((await app.getDeal(rejected.sid,rejectKey))[0].invoice.length,0);
    assert.equal((await app.acceptDeal(rejected.sid,rejectKey,rejectView.quote,address)).ok,false);
    assert.ok((await app.createSale(adminTok,rejected.aid,buyer,50000n,'')).ok,'decline releases reservation');
    const expire=await create(), expireKey=await mint(expire.sid); assert.ok((await app.revokeDealLink(adminTok,expire.sid)).ok);assert.deepEqual(await app.getDeal(expire.sid,expireKey),[]);
    const expiring=await mint(expire.sid);
    const credit=await app.cancelSale(adminTok,a.sid,'Return arranged');assert.ok(credit.ok);
    const cv=(await app.getSale(adminTok,a.sid))[0];assert.equal(cv.creditNote[0].seller.name,invoice.seller.name,'credit note uses original seller');assert.equal(cv.creditNote[0].qrPayload,'');assert.equal(cv.creditNote[0].creditOf,invoice.number);
    assert.deepEqual(await app.dealDocument(a.sid,key),[],'cancelled invoice cannot be offered for payment');
    await pic.advanceTime(14*86400000+1000);await pic.tick(2);
    assert.deepEqual(await app.getDeal(expire.sid,expiring),[],'14-day expiry enforced on canister');
  } finally { await pic.tearDown(); }
});


test('assets: unlock PIN is read-only, admin-only, transient and rechecks access after the outcall; sales counts include every page', {timeout:120000}, async () => {
  const pic=await PocketIc.create(server.getUrl(), { application: [{ state: { type: SubnetStateType.New }, costSchedule: CanisterCyclesCostSchedule.Free }] });
  try {
    await pic.setTime(Date.parse('2026-09-17T10:00:00Z'));
    const {actor:hub,canisterId:hubId}=await initialized(pic);
    const {actor:app,canisterId:appId,idlFactory}=await install(pic,'assets');
    app.setPrincipal(controller);await app.setHub(hubId.toText());hub.setPrincipal(owner);
    const c=await connectTestApp(hub, {name:'assets',canisterId:appId.toText(),note:'',lanes:['identity','roles','groups'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'assets',kind:'app',url:'https://assets.example.test'}]});assert.ok(c.ok,c.detail);
    const login=async p=>{hub.setPrincipal(p);const t=await hub.mintAppTicket('',c.tileId);return (await app.loginWithTicket(t.ticket))[0].token;};
    let adminTok=await login(owner);const memberTok=await login(member);
    await settled(pic);await pic.advanceTime(2000);await pic.tick(3);
    assert.equal((await app.deviceUnlockPin('',1n)).ok,false);
    assert.equal((await app.deviceUnlockPin(memberTok,1n)).ok,false);
    assert.equal((await app.deviceUnlockPin(adminTok,1n)).ok,false);
    const mdm=await app.addMdm(adminTok,{kind:'iru',name:'Fixture MDM',url:'https://fixture.api.kandji.io',clientId:'',secret:'fixture-secret'});assert.ok(mdm.ok);
    const deferred=pic.createDeferredActor(idlFactory,appId);
    let pending=await deferred.syncMdm(adminTok,mdm.id);
    await answerOutcall(pic,{results:[{device_id:'test-device',serial_number:'PIN-TEST-001',device_name:'Test Mac',model:'MacBook Pro',platform:'Mac',os_version:'15.0',last_check_in:'2026-09-17'}]});assert.ok((await pending()).ok);
    const id=(await app.listAssets(adminTok,'PIN-TEST-001','',false))[0].asset.id;
    pending=await deferred.deviceUnlockPin(adminTok,id);
    const request=await answerOutcall(pic,{pin:'001234'});
    assert.match(request.url,/\/devices\/test-device\/secrets\/unlockpin$/);
    if(request.httpMethod)assert.equal(String(request.httpMethod).toUpperCase(),'GET');
    assert.equal((await pending()).pin,'001234','leading zeroes survive');
    const log=await app.adminLogRows(adminTok);assert.ok(!JSON.stringify(log,(_,v)=>typeof v==='bigint'?String(v):v).includes('001234'),'PIN is not audited');
    pending=await deferred.deviceUnlockPin(adminTok,id);await answerOutcall(pic,{pin:'<script>bad</script>'});assert.equal((await pending()).pin,'');
    pending=await deferred.deviceUnlockPin(adminTok,id);await answerOutcall(pic,{});const missing=await pending();assert.equal(missing.pin,'');assert.match(missing.detail,/Activation Lock/);
    pending=await deferred.deviceUnlockPin(adminTok,id);await pic.tick(2);await app.signOut(adminTok);await answerOutcall(pic,{pin:'001234'});const revoked=await pending();assert.equal(revoked.ok,false);assert.equal(revoked.pin,'');
    adminTok=await login(owner);
    const buyer={pid:'',name:'Test Buyer',email:'fixture@example.test',street:'',houseNo:'',postalCode:'',town:'',country:'CH'};
    for(let i=0;i<103;i++){const a=await app.createAsset(adminTok,{tag:'PAGE-'+i,serial:'PAGE-SERIAL-'+i,vendor:'Test',model:'Device',kind:'laptop',note:''});assert.ok(a.ok);assert.ok((await app.createSale(adminTok,a.id,buyer,10000n,'')).ok);}
    const first=await app.salesBoard(adminTok,'offer','',0n),second=await app.salesBoard(adminTok,'offer','',100n);
    assert.equal(first.total,103n);assert.equal(first.matched,103n);assert.equal(first.rows.length,100);assert.equal(first.hasMore,true);assert.equal(second.rows.length,3);assert.equal(second.hasMore,false);assert.equal(new Set([...first.rows,...second.rows].map(r=>String(r.id))).size,103);
    assert.equal(first.counts.find(([p])=>p==='offer')[1],103n,'counts precede pagination');
    assert.equal((await app.salesBoard(adminTok,'offer','PAGE-SERIAL-102',0n)).matched,1n,'serial search remains available without exposing serials or contacts in list rows');
  } finally {await pic.tearDown();}
});

test('desk: profile pictures require ticket access and the Hub avatar lane', async () => {
 const pic=await PocketIc.create(server.getUrl());
 try {
  const {actor:hub,canisterId:hubId}=await initialized(pic);await settled(pic);
  const {actor:desk,canisterId:deskId}=await install(pic,'desk');desk.setPrincipal(controller);await desk.setHub(hubId.toText());hub.setPrincipal(owner);
  const c=await connectTestApp(hub, {name:'desk',canisterId:deskId.toText(),note:'',lanes:['identity','roles','avatars'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'desk',kind:'app',url:'https://desk.example.test'}]});
  const login=async principal=>{hub.setPrincipal(principal);const t=await hub.mintAppTicket('',c.tileId);return (await desk.loginWithTicket(t.ticket))[0].token;};
  const memberTok=await login(member), ownerTok=await login(owner);await settled(pic);
  const m=(await desk.whoami(memberTok))[0],o=(await desk.whoami(ownerTok))[0];
  hub.setPrincipal(member);const photo=Buffer.alloc(200000,1);photo[0]=255;photo[1]=216;assert.equal(await hub.setMyAvatar('',photo),true);
  hub.setPrincipal(owner);assert.equal(await hub.setMyAvatar('',Buffer.from([255,216,3])),true);
  const type=(await desk.catalog(ownerTok))[0];const privateTicket=await desk.createRequest(ownerTok,type.id,'Owner request','Private',[]);assert.equal(privateTicket.ok,true);
  assert.deepEqual(await desk.profilePictures('invalid',[],[m.id]),[]);
  assert.deepEqual(await desk.profilePictures(memberTok,[],[o.id]),[],'self scope cannot enumerate colleagues');
  assert.deepEqual(await desk.profilePictures(memberTok,[privateTicket.id],[o.id]),[],'another requester cannot read ticket photos');
  assert.equal((await desk.profilePictures(memberTok,[],[m.id]))[0][1].length,200000,'supports existing Hub photos above 100 KB');
  assert.equal((await desk.profilePictures(ownerTok,[privateTicket.id],[o.id])).length,1);
  hub.setPrincipal(owner);await hub.setConnectorLanes(c.id,['identity','roles']);
  assert.deepEqual(await desk.profilePictures(memberTok,[],[m.id]),[],'avatar lane is enforced by the Hub');
 } finally {await pic.tearDown();}
});

test('watch: large certificate evidence, failed-check backoff, recovery and populated upgrade', {timeout:180000}, async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try {
  await pic.setTime(Date.parse('2026-09-21T12:00:00Z'));
  const {actor:hub,canisterId:hubId}=await initialized(pic);
  const {actor:app,canisterId:appId,idlFactory}=await install(pic,'watch',process.env.KEBAB_WATCH_BASELINE?{wasm:resolve(process.env.KEBAB_WATCH_BASELINE)}:{});
  app.setPrincipal(controller);await app.setHub(hubId.toText());hub.setPrincipal(owner);
  const c=await connectTestApp(hub,{name:'watch',canisterId:appId.toText(),note:'',lanes:['identity','roles'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'watch',kind:'app',url:'https://watch.example.test'}]});assert.ok(c.ok,c.detail);
  const login=async()=>{hub.setPrincipal(owner);const t=await hub.mintAppTicket('',c.tileId);return(await app.loginWithTicket(t.ticket))[0].token;};let tok=await login();
  const added=await app.addDomain(tok,{name:'service.example.test',types:['TXT'],watchers:[],note:'Synthetic certificate checks'});assert.ok(added.ok,added.detail);
  const deferred=pic.createDeferredActor(idlFactory,appId);let certBody=JSON.stringify(Array.from({length:2700},(_,id)=>({issuer_name:'C=US, O=Example CA, CN=Issuer',name_value:'service.example.test',not_after:'2027-01-01T00:00:00',id}))),certCalls=0;
  const largeCertBody=certBody;
  if(process.env.KEBAB_WATCH_BASELINE)certBody=JSON.stringify([{issuer_name:'C=US, O=Example CA',name_value:'service.example.test',not_after:'2027-01-01T00:00:00'}]);
  async function drain(){let quiet=0;for(let i=0;i<240 && quiet<8;i++){await pic.tick(3);const requests=await pic.getPendingHttpsOutcalls();quiet=requests.length?0:quiet+1;for(const req of requests){let body='{}',status=200;if(req.url.startsWith('https://crt.sh/')){certCalls++;body=certBody;}else if(/dns.google|cloudflare-dns/.test(req.url))body='{"Status":0,"Answer":[]}';else status=404;await pic.mockPendingHttpsOutcall({requestId:req.requestId,subnetId:req.subnetId,response:{type:'success',statusCode:status,headers:[],body:Buffer.from(body)}});}}}
  const check=async()=>{const finish=await deferred.checkNow(tok,[added.id]);await drain();assert.ok((await finish()).ok);};
  await check();let detail=(await app.getDomain(tok,added.id))[0],baseline=detail.cert[0];assert.ok(baseline.checkedAt>0n);assert.deepEqual(baseline.issuers,['Example CA']);assert.equal(baseline.certEnds,'2027-01-01');assert.equal(certCalls,1);
  if(process.env.KEBAB_WATCH_BASELINE){
   await pic.upgradeCanister({sender:controller,canisterId:appId,wasm:candidateWasm('watch'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
   assert.deepEqual((await app.getDomain(tok,added.id))[0].cert[0],baseline,'published baseline evidence survives the upgrade');
   certBody=largeCertBody;await pic.advanceTime(86401000);await drain();tok=await login();await check();baseline=(await app.getDomain(tok,added.id))[0].cert[0];assert.equal(baseline.detail,'');
  }
  certBody='{"upstream":"not a certificate array"}';await pic.advanceTime(86401000);await drain();tok=await login();
  await check();detail=(await app.getDomain(tok,added.id))[0];assert.match(detail.cert[0].detail,/unavailable/);assert.equal(detail.cert[0].checkedAt,baseline.checkedAt,'failure must not claim fresh evidence');assert.deepEqual(detail.cert[0].issuers,baseline.issuers);assert.equal(detail.row.checks[0].certificateAt,baseline.checkedAt);assert.match(detail.row.checks[0].certificateDetail,/unavailable/);assert.ok(detail.row.checks[0].certificateRetryAt>baseline.checkedAt);
  const callsAfterFailure=certCalls,errors=detail.events.filter(e=>e.kind==='error'&&e.rtype==='cert').length;
  for(let i=0;i<3;i++){await pic.advanceTime(60001);await drain();}tok=await login();await check();assert.equal(certCalls,callsAfterFailure,'timer and manual checks respect the retry pause');assert.equal((await app.getDomain(tok,added.id))[0].events.filter(e=>e.kind==='error'&&e.rtype==='cert').length,errors);
  await pic.upgradeCanister({sender:controller,canisterId:appId,wasm:candidateWasm('watch'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  await drain();tok=await login();await check();assert.equal(certCalls,callsAfterFailure,'retry pause survives a populated upgrade');
  certBody=JSON.stringify([{issuer_name:'C=US, O=Example CA',name_value:'service.example.test',not_after:'2027-03-01T00:00:00'}]);await pic.advanceTime(3*3600000);await drain();tok=await login();await check();detail=(await app.getDomain(tok,added.id))[0];assert.equal(detail.cert[0].certEnds,'2027-03-01');assert.equal(detail.cert[0].detail,'');assert.ok(detail.events.some(e=>e.rtype==='cert'&&e.kind==='resolved'));
 } finally {await pic.tearDown()}
});

test('Hub: large Okta profiles stay flat through page splitting and preserve Unicode', {timeout:120000},async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try {
  const {actor:hub,canisterId,idlFactory}=await initialized(pic);
  const added=await hub.addConnection({name:'Synthetic pull source',kind:'okta',baseUrl:'https://example.okta.test',clientId:'fixture-client',clientSecret:''});assert.ok(added.ok,added.detail);
  const deferred=pic.createDeferredActor(idlFactory,canisterId);deferred.setPrincipal(owner);
  const finish=await deferred.syncNow(added.id);
  await answerOutcall(pic,{access_token:'synthetic-test-token',token_type:'Bearer',expires_in:3600});
  await answerOutcall(pic,[{id:'synthetic-large-profile',status:'ACTIVE',profile:{email:'large@example.test',displayName:'Zürich 😀',customNotes:'a'.repeat(180000)}}]);
  const result=await finish();assert.ok(result.ok,result.detail);assert.equal(result.created,1n);assert.equal(result.fetched,1n);
  const person=(await hub.listUsers({offset:0n,limit:10n,conn:[added.id],search:'large@example.test',activeOnly:true})).items[0];assert.equal(person.displayName,'Zürich 😀');
 } finally {await pic.tearDown()}
});

test('watch: DNS failures cannot be accepted or trimmed into a healthy baseline', {timeout:180000}, async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try {
  await pic.setTime(Date.parse('2026-09-21T12:00:00Z'));
  const {actor:hub,canisterId:hubId}=await initialized(pic);
  const {actor:app,canisterId:appId,idlFactory}=await install(pic,'watch');app.setPrincipal(controller);await app.setHub(hubId.toText());hub.setPrincipal(owner);
  const c=await connectTestApp(hub,{name:'watch',canisterId:appId.toText(),note:'',lanes:['identity','roles'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'watch',kind:'app',url:'https://watch.example.test'}]});
  const login=async principal=>{hub.setPrincipal(principal);const t=await hub.mintAppTicket('',c.tileId);return(await app.loginWithTicket(t.ticket))[0].token;};let tok=await login(owner),viewer=await login(member);
  const added=await app.addDomain(tok,{name:'service.example.test',types:['CNAME','TXT','A'],watchers:[],note:'Synthetic DNS integrity regression'});assert.ok(added.ok);
  const deferred=pic.createDeferredActor(idlFactory,appId);let targetMissing=true,txt='v=old',nx=false,failed=false,partialFailure=false,ips=['192.0.2.1','192.0.2.2'];
  async function drain(){let quiet=0;for(let i=0;i<240&&quiet<8;i++){await pic.tick(3);const requests=await pic.getPendingHttpsOutcalls();quiet=requests.length?0:quiet+1;for(const req of requests){const u=new URL(req.url);let status=200,body='[]';if(/dns.google|cloudflare-dns/.test(u.hostname)){const name=u.searchParams.get('name'),type=({A:1,CNAME:5,TXT:16})[u.searchParams.get('type')]||0;if(failed||(partialFailure&&u.hostname==='dns.google')){status=503;body='unavailable';}else{const missing=nx&&name==='service.example.test'||targetMissing&&name==='target.example.test';const values=name==='service.example.test'?(type===5?['target.example.test']:type===16?[txt]:type===1?ips:[]):[];body=JSON.stringify({Status:missing?3:0,Answer:missing?[]:values.map(data=>({name,type,TTL:60,data}))});}}else if(!req.url.startsWith('https://crt.sh/')){status=404;body='{}';}await pic.mockPendingHttpsOutcall({requestId:req.requestId,subnetId:req.subnetId,response:{type:'success',statusCode:status,headers:[],body:Buffer.from(body)}});}}}
  const check=async()=>{const end=await deferred.checkNow(tok,[added.id]);await drain();assert.ok((await end()).ok);};
  const record=async type=>(await app.getDomain(tok,added.id))[0].row.records.find(r=>r.rtype===type);
  await check();assert.equal((await record('CNAME')).status,'dangling');
  assert.equal((await app.acceptChange(tok,added.id,'CNAME')).ok,false);await app.acceptAll(tok,added.id);assert.equal((await record('CNAME')).status,'dangling');
  assert.equal((await app.acceptChange(viewer,added.id,'CNAME')).ok,false);assert.equal((await app.trimKnown(viewer,added.id,'A')).ok,false);
  txt='v=new';partialFailure=true;await check();assert.deepEqual((await record('TXT')).expected,['v=old']);assert.match((await record('TXT')).detail,/unavailable/);assert.equal((await app.acceptChange(tok,added.id,'TXT')).ok,false);partialFailure=false;await check();assert.equal((await record('TXT')).status,'changed');assert.equal((await app.acceptChange(viewer,added.id,'TXT')).ok,false);assert.equal((await app.acceptChange(tok,added.id,'TXT')).ok,true);assert.equal((await record('TXT')).status,'ok');
  ips=['192.0.2.1'];await check();assert.equal((await app.trimKnown(tok,added.id,'A')).ok,true);assert.deepEqual((await record('A')).expected,ips);
  txt='v=another';await check();failed=true;await check();assert.equal((await app.acceptChange(tok,added.id,'TXT')).ok,false);assert.equal((await app.trimKnown(tok,added.id,'A')).ok,false);await app.acceptAll(tok,added.id);assert.equal((await record('TXT')).status,'changed');
  failed=false;nx=true;await check();assert.equal((await record('TXT')).status,'nxdomain');assert.equal((await app.acceptChange(tok,added.id,'TXT')).ok,false);await app.acceptAll(tok,added.id);assert.equal((await record('TXT')).status,'nxdomain');
  nx=false;targetMissing=false;await check();assert.equal((await record('CNAME')).status,'ok');assert.equal((await app.acceptChange(tok,added.id,'TXT')).ok,true);
  await app.updateDomain(tok,added.id,{types:['A'],watchers:[],note:'',enabled:true});assert.equal((await app.acceptChange(tok,added.id,'TXT')).ok,false);
  await app.updateDomain(tok,added.id,{types:['A'],watchers:[],note:'',enabled:false});assert.equal((await app.trimKnown(tok,added.id,'A')).ok,false);assert.equal((await app.acceptAll(tok,added.id)).ok,false);
  await app.removeDomain(tok,added.id);assert.equal((await app.acceptAll(tok,added.id)).ok,false);
 } finally {await pic.tearDown();}
});

test('assistants: self-disconnect revokes only the supplied credential and stays idempotent while disabled', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);hub.setPrincipal(owner);await hub.setAssistantsEnabled(true);
    hub.setPrincipal(member);
    const first = await hub.redeemAssistantCode((await hub.mintAssistantCode('')).code, 'First');
    const second = await hub.redeemAssistantCode((await hub.mintAssistantCode('')).code, 'Second');
    assert.equal(first.ok, true);assert.equal(second.ok, true);
    hub.setPrincipal(stranger);
    assert.equal((await hub.assistantDisconnect('')).ok, false);
    assert.equal((await hub.assistantDisconnect('0'.repeat(128))).ok, false);
    assert.equal((await hub.assistantDisconnect(first.token)).ok, true);
    assert.deepEqual(await hub.assistantWhoami(first.token), []);
    assert.equal((await hub.assistantWhoami(second.token)).length, 1, 'another assistant stays connected');
    assert.equal((await hub.assistantDisconnect(first.token)).ok, true, 'repeat is harmless');
    hub.setPrincipal(owner);await hub.setAssistantsEnabled(false);hub.setPrincipal(stranger);
    assert.equal((await hub.assistantDisconnect(second.token)).ok, true, 'can clean up after company switch-off');
  } finally { await pic.tearDown(); }
});

test('assistants: concurrent code generation leaves only the latest code usable', async () => {
  const pic = await PocketIc.create(server.getUrl());
  try {
    const { actor: hub } = await initialized(pic);
    await settled(pic);hub.setPrincipal(owner);await hub.setAssistantsEnabled(true);hub.setPrincipal(member);
    const codes = await Promise.all([hub.mintAssistantCode(''),hub.mintAssistantCode(''),hub.mintAssistantCode('')]);
    assert.ok(codes.every(c=>c.ok));
    const results = await Promise.all(codes.map(c=>hub.redeemAssistantCode(c.code,'Parallel')));
    assert.equal(results.filter(r=>r.ok).length,1,'at most one pending code per person after asynchronous minting');
  } finally { await pic.tearDown(); }
});
