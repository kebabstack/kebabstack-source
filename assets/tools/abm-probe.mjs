#!/usr/bin/env node
// Apple Business Manager API probe — does from a terminal exactly what the assets canister does,
// but prints Apple's full answers. Use it when Settings → Apple Business Manager → Test fails and
// the status line does not say enough. Nothing is written to Apple; the key stays on this machine.
//
//   node assets/tools/abm-probe.mjs <client id> <key id> <path/to/key.pem> [school]
//
// Node 18+ (fetch + crypto built in), no dependencies.
import { readFileSync } from "node:fs";
import { createPrivateKey, sign, randomUUID } from "node:crypto";

const [clientId, keyId, pemPath, flavour] = process.argv.slice(2);
if (!clientId || !keyId || !pemPath) { console.error("usage: node abm-probe.mjs <client id> <key id> <key.pem> [school]"); process.exit(2); }
const school = flavour === "school" || /^SCHOOLAPI\./i.test(clientId);
const scope = school ? "school.api" : "business.api";
const api = school ? "https://api-school.apple.com/v1" : "https://api-business.apple.com/v1";
const b64u = (b) => Buffer.from(b).toString("base64url");

// 1 · client assertion (ES256, kid = key id, sub = iss = client id, five minutes)
const key = createPrivateKey(readFileSync(pemPath));
const now = Math.floor(Date.now() / 1000);
const header = b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
const payload = b64u(JSON.stringify({ iss: clientId, sub: clientId, aud: "https://account.apple.com/auth/oauth2/v2/token", iat: now, exp: now + 300, jti: randomUUID() }));
const sig = sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
const assertion = `${header}.${payload}.${b64u(sig)}`;
console.log(`key: ${key.asymmetricKeyType} ${JSON.stringify(key.asymmetricKeyDetails)} · scope ${scope}`);

// 2 · token — Apple documents the parameters in the query string of a POST
const q = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion, scope });
const tr = await fetch(`https://account.apple.com/auth/oauth2/token?${q}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } });
const tt = await tr.text();
console.log(`\ntoken: HTTP ${tr.status}\n${tt.slice(0, 1200)}`);
if (!tr.ok) process.exit(1);
const token = JSON.parse(tt).access_token;

// 3 · the reads the canister does, each shown in full
for (const path of ["/orgDevices?limit=200", "/orgDevices?limit=100", "/orgDevices", "/mdmServers?limit=100"]) {
  const r = await fetch(api + path, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const t = await r.text();
  console.log(`\nGET ${path}: HTTP ${r.status}`);
  for (const [k, v] of r.headers) if (/^(x-|retry|content-type|apple)/i.test(k)) console.log(`  ${k}: ${v}`);
  console.log(t.slice(0, 1500));
  if (r.ok) { try { const j = JSON.parse(t); console.log(`  → ${j.data?.length ?? 0} items · next: ${j.links?.next ?? "—"} · total: ${j.meta?.paging?.total ?? "?"}`); } catch (_) {} }
}
