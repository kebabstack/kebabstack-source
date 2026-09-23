// Mints the relay's ed25519 identity. Prints the PRINCIPAL (paste it into the app: Connection → Relay)
// and the base64 secret (for `npx wrangler secret put RELAY_SECRET`). Run once per rotation; the secret
// is shown a single time — store it only in the Cloudflare secret, nowhere else, never in git.
import { Ed25519KeyIdentity } from "@dfinity/identity";

const id = Ed25519KeyIdentity.generate();
const secret = Buffer.from(id.getKeyPair().secretKey).toString("base64");
console.log("RELAY PRINCIPAL :", id.getPrincipal().toText());
console.log("RELAY_SECRET    :", secret);
console.log("\nnext:");
console.log("  1. contracts app → Connection → Relay → add the principal above, save");
console.log("  2. npx wrangler secret put RELAY_SECRET   (paste the secret)");
console.log("  3. npx wrangler deploy");
