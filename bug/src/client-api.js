import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { AuthClient } from '@icp-sdk/auth/client';
import { idlFactory } from './generated/backend.did.js';
import { BACKEND_CANISTER_ID } from './app.js';
import { PlayerSession } from './player-session.js';

let storage;
try { storage = globalThis.localStorage; } catch {}
let auth;
try { auth = new AuthClient({ agentOptions: { host: 'https://icp-api.io' } }); } catch {}
export const playerSession = new PlayerSession({ auth, storage,
  createGuest: () => Ed25519KeyIdentity.generate(), restoreGuest: json => Ed25519KeyIdentity.fromJSON(json) });

export async function connect() {
  let config = {};
  try { config = await (await fetch('./runtime-config.json', { cache: 'no-store', signal: AbortSignal.timeout(4000) })).json(); } catch {}
  const env = safeGetCanisterEnv() || {};
  const canisterId = env['PUBLIC_CANISTER_ID:backend'] || config.backend || (!BACKEND_CANISTER_ID.startsWith('__') ? BACKEND_CANISTER_ID : null);
  if (!canisterId) throw new Error('The global leaderboard is not connected yet. You can play and save on this device.');
  const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const host = local ? config.host || 'http://127.0.0.1:8000' : 'https://icp-api.io';
  // Local preview supplies its isolated replica's key. Production uses the SDK trust anchor.
  const rootKey = local && config.rootKey ? Uint8Array.from(config.rootKey) : undefined;
  const actors = new Map();
  return { local, async actor(expected) {
    const identity = await playerSession.identity(expected), id = identity.getPrincipal().toText();
    if (actors.has(id)) { const saved = actors.get(id); saved.agent.replaceIdentity(identity); return saved.actor; }
    const agent = await HttpAgent.create({ host, identity, rootKey });
    const actor = Actor.createActor(idlFactory, { agent, canisterId });
    actors.clear(); actors.set(id, { agent, actor }); return actor;
  } };
}
