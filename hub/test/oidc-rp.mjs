#!/usr/bin/env node
// A minimal OpenID Connect relying party for testing the hub as a provider. No dependencies (Node ≥ 20).
//
//   node hub/test/oidc-rp.mjs <issuer> <client_id> [client_secret]
//
// What it does, in order — each step prints ✓ or the exact failure:
//   1. discovery      GET <issuer>/.well-known/openid-configuration
//   2. jwks           GET jwks_uri — RSA + EC keys present, kids unique
//   3. authorize      builds the URL (state, nonce, PKCE S256) and opens a local callback on http://127.0.0.1:8787/cb
//                     → register exactly that redirect URI on the client in the hub, then open the printed URL in a browser
//   4. token          POST code + verifier (+ secret via client_secret_basic when given) → id_token, access_token
//   5. id_token       header/kid → key from JWKS → signature (RS256 or ES256) verified with Node's crypto; iss/aud/exp/iat/nonce checked
//   6. userinfo       GET with the access token → same sub as the id_token
//   7. replay         posting the same code again must be refused (invalid_grant)
import http from "node:http";
import crypto from "node:crypto";

const [issuer, clientId, clientSecret] = process.argv.slice(2);
if (!issuer || !clientId) { console.error("usage: node oidc-rp.mjs <issuer> <client_id> [client_secret]"); process.exit(2); }
const REDIRECT = "http://127.0.0.1:8787/cb";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const ok = (m) => console.log("  ✓", m);
const fail = (m) => { console.error("  ✗", m); process.exit(1); };

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  if (!r.ok) fail(`${url} → HTTP ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { fail(`${url} → not JSON: ${text.slice(0, 200)}`); }
}

console.log("1 · discovery");
const disc = await getJson(issuer.replace(/\/$/, "") + "/.well-known/openid-configuration");
if (disc.issuer !== issuer.replace(/\/$/, "")) fail(`issuer mismatch: ${disc.issuer}`);
for (const k of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "jwks_uri"]) if (!disc[k]) fail(`discovery lacks ${k}`);
if (!disc.code_challenge_methods_supported?.includes("S256")) fail("no S256");
ok(`issuer ${disc.issuer} · algs ${disc.id_token_signing_alg_values_supported.join(",")}`);

console.log("2 · jwks");
const jwks = await getJson(disc.jwks_uri);
if (!Array.isArray(jwks.keys) || !jwks.keys.length) fail("empty JWKS — is the signing key still generating? (Apps → Sign-in for other apps)");
const kids = jwks.keys.map((k) => k.kid); if (new Set(kids).size !== kids.length) fail("duplicate kids");
ok(jwks.keys.map((k) => `${k.kty}/${k.alg} ${k.kid}`).join(" · "));

console.log("3 · authorize");
const state = b64u(crypto.randomBytes(16)), nonce = b64u(crypto.randomBytes(16));
const verifier = b64u(crypto.randomBytes(32));
const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: "openid profile email groups", state, nonce, code_challenge: challenge, code_challenge_method: "S256" });
const finalUrl = `${disc.authorization_endpoint}${disc.authorization_endpoint.includes("?") ? "&" : "?"}${params}`; // exactly what oauth2 libraries do
console.log("\n  Open this in a browser (the redirect URI " + REDIRECT + " must be registered on the client):\n\n  " + finalUrl + "\n");

const code = await new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1:8787");
    if (u.pathname !== "/cb") { res.writeHead(404); res.end(); return; }
    if (u.searchParams.get("error")) { res.end("error: " + u.searchParams.get("error")); fail(`authorize returned ${u.searchParams.get("error")}: ${u.searchParams.get("error_description")}`); }
    if (u.searchParams.get("state") !== state) { res.end("bad state"); fail("state mismatch"); }
    res.setHeader("Content-Type", "text/html"); res.end("<p style='font:16px system-ui'>Code received — back to the terminal.</p>");
    srv.close(); resolve(u.searchParams.get("code"));
  });
  srv.listen(8787, "127.0.0.1");
});
ok("code received (" + code.length + " chars), state matched");

console.log("4 · token");
const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
const headers = { "Content-Type": "application/x-www-form-urlencoded" };
if (clientSecret) headers.Authorization = "Basic " + Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64");
const tr = await fetch(disc.token_endpoint, { method: "POST", headers, body });
const tok = JSON.parse(await tr.text());
if (!tr.ok) fail(`token endpoint → ${tr.status} ${JSON.stringify(tok)}`);
if (!tok.id_token || !tok.access_token || tok.token_type !== "Bearer") fail("token response incomplete: " + JSON.stringify(tok));
ok(`id_token (${tok.id_token.length} chars), access_token, expires_in ${tok.expires_in}`);

console.log("5 · id_token");
const [h64, p64, s64] = tok.id_token.split(".");
const header = JSON.parse(Buffer.from(h64, "base64url")); const payload = JSON.parse(Buffer.from(p64, "base64url"));
const jwk = jwks.keys.find((k) => k.kid === header.kid); if (!jwk) fail(`kid ${header.kid} not in JWKS`);
const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
let sigOk;
if (header.alg === "RS256") sigOk = crypto.verify("RSA-SHA256", Buffer.from(`${h64}.${p64}`), { key: pub, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(s64, "base64url"));
else if (header.alg === "ES256") sigOk = crypto.verify("SHA256", Buffer.from(`${h64}.${p64}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(s64, "base64url"));
else fail("unexpected alg " + header.alg);
if (!sigOk) fail("signature INVALID");
const now = Math.floor(Date.now() / 1000);
if (payload.iss !== disc.issuer) fail("iss mismatch"); if (payload.aud !== clientId) fail("aud mismatch"); if (payload.nonce !== nonce) fail("nonce mismatch");
if (!(payload.iat <= now + 300 && payload.exp > now - 300)) fail(`time window off: iat ${payload.iat} exp ${payload.exp} now ${now}`);
if (!payload.sub || !payload.email) fail("sub/email missing");
ok(`${header.alg} signature valid (kid ${header.kid}) · sub ${payload.sub} · ${payload.email} · groups ${JSON.stringify(payload.groups ?? "(lane off)")} · hub_role ${payload.hub_role ?? "(lane off)"}`);

console.log("6 · userinfo");
const ui = await getJson(disc.userinfo_endpoint, { Authorization: "Bearer " + tok.access_token });
if (ui.sub !== payload.sub) fail("userinfo sub differs from id_token sub");
ok(`sub matches · ${Object.keys(ui).join(", ")}`);

console.log("7 · replay");
const rr = await fetch(disc.token_endpoint, { method: "POST", headers, body });
const rj = JSON.parse(await rr.text());
if (rr.ok || rj.error !== "invalid_grant") fail("replayed code was NOT refused: " + JSON.stringify(rj));
ok("second use of the code refused (invalid_grant)");
console.log("\nOIDC RP OK — the hub behaves as an OpenID Connect provider for this client.");
