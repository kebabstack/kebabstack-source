#!/usr/bin/env bash
# RSA self-test: Motoko interpreter generates a real RSA-2048 key with backend/Rsa.mo,
# signs a JWT-shaped message (RS256) and Node's OpenSSL verifies the signature from the
# public JWK — the same check every relying party performs. Exit ≠ 0 = do not deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! OUT=$(moc -r $(mops sources) test/rsa-test.mo 2>&1); then printf '%s\n' "$OUT"; exit 1; fi
echo "$OUT" | grep -q "^OK$" || { echo "$OUT"; echo "RSA motoko self-test FAILED"; exit 1; }
N=$(echo "$OUT" | grep '^N=' | cut -d= -f2); SIG=$(echo "$OUT" | grep '^SIG=' | cut -d= -f2)
node -e '
const crypto = require("crypto"); const [N, SIG] = process.argv.slice(1);
const key = crypto.createPublicKey({ key: { kty: "RSA", n: Buffer.from(N, "hex").toString("base64url"), e: "AQAB" }, format: "jwk" });
const msg = Buffer.from("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0");
const ok = crypto.verify("RSA-SHA256", msg, { key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(SIG, "hex"));
const bad = crypto.verify("RSA-SHA256", Buffer.concat([Buffer.from("x"), msg]), { key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(SIG, "hex"));
if (!ok || bad || key.asymmetricKeyDetails.modulusLength !== 2048) { console.error("node verify FAILED", ok, bad); process.exit(1); }
console.log("RSA OK · RSA-2048 key generated in Motoko, RS256 signature verified by OpenSSL, tamper detected");
' "$N" "$SIG"
