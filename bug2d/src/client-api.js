import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { idlFactory } from './generated/backend.did.js';
import { BACKEND_CANISTER_ID, HUB_URL } from './app.js';

export async function connect() {
  let config = {};
  try { config = await (await fetch('./runtime-config.json', { cache: 'no-store' })).json(); } catch {}
  // Installation-specific metadata survives Kitchen recipe upgrades. It never
  // supplies identities or an API host; custom domains still use icp-api.io.
  let deployment = {};
  try { deployment = await (await fetch('/.well-known/bug-deployment.json', { cache: 'no-store', signal: AbortSignal.timeout(2500) })).json(); } catch {}
  const env = safeGetCanisterEnv() || {};
  const canisterId = env['PUBLIC_CANISTER_ID:backend'] || config.backend || (!BACKEND_CANISTER_ID.startsWith('__') ? BACKEND_CANISTER_ID : null);
  if (!canisterId) throw new Error('The global leaderboard is not connected yet. You can play and save on this device.');
  const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const host = local ? config.host || 'http://127.0.0.1:8000' : 'https://icp-api.io';
  let identity;
  const key = 'stb2d-browser-identity-v1';
  try { const stored = localStorage.getItem(key); if (stored) identity = Ed25519KeyIdentity.fromJSON(stored); } catch {}
  if (!identity) {
    identity = Ed25519KeyIdentity.generate();
    // A non-persisted key would strand a player's unique name on the next load.
    try { localStorage.setItem(key, JSON.stringify(identity.toJSON())); }
    catch { throw new Error('Browser storage is disabled. Enable it to keep your callsign, or play without ranking.'); }
  }
  const agent = await HttpAgent.create({ host, identity });
  if (local) await agent.fetchRootKey();
  const hubTileId = Number.isSafeInteger(deployment?.hubTileId) && deployment.hubTileId > 0 ? deployment.hubTileId : null;
  return { actor: Actor.createActor(idlFactory, { agent, canisterId }), local, agent, hubTileId, hubActor: (factory, id) => Actor.createActor(factory, { agent, canisterId: id }), hubUrl: env['PUBLIC_HUB_URL'] || config.hubUrl || (!HUB_URL.startsWith('__') ? HUB_URL : '') };
}
