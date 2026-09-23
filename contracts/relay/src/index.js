// contracts relay — Cloudflare Email Worker
//
// Receives the contracts address (say subscriptions@your-relay-domain), parses the message with
// postal-mime, reads text out of text PDFs (unpdf), and hands headers + text + files to the contracts
// canister through its intake lane (intakeBegin → intakeChunk → intakeCommit) with one trusted
// identity. That identity can hand in mail and nothing else (Settings → Relay in the app).
//
// Vars / secrets (wrangler.toml, `wrangler secret put`):
//   CONTRACTS_CANISTER_ID  the contracts BACKEND canister
//   RELAY_SECRET           base64 ed25519 secret key from scripts/mint-identity.mjs (secret, never in the file)
//   ALLOWED_RECIPIENTS     required, comma-separated: only these envelope recipients are handed in
//   FALLBACK_ADDRESS       optional, a verified Email Routing destination: where a message goes when the
//                          canister could not take it after retries (keep an independent Google archive as well)
//
// Logs (`wrangler tail`) carry sender domain, sizes and the source id — never the message text.

if (typeof globalThis.global === "undefined") globalThis.global = globalThis; // agent-js expects the Node global
import PostalMime from "postal-mime";
import { Actor, HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { idlFactory } from "../../dist/idl.js";
import { receiveEmail } from "./receive.js";
import { buildIntake, handIn, withRetry, CAPS } from "./intake.js";

const IC_HOST = "https://icp0.io";

function makeActor(env) {
  const b64 = String(env.RELAY_SECRET || "").replace(/\s+/g, ""); // interactive `secret put` pastes pick up newlines
  if (!b64) throw new Error("RELAY_SECRET is not set");
  const secret = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const identity = Ed25519KeyIdentity.fromSecretKey(secret.buffer);
  const agent = HttpAgent.createSync({ host: IC_HOST, identity });
  return Actor.createActor(idlFactory, { agent, canisterId: env.CONTRACTS_CANISTER_ID });
}

// text PDFs → text (page-bounded); scans give back "" and the canister marks the file "needs manual reading"
async function extractPdf(bytes) {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(bytes);
  const pages=[];
  try {
    let length=0;
    for(let n=1;n<=Math.min(doc.numPages,CAPS.pdfPages);n++) {
      const page=await doc.getPage(n);
      try {const content=await page.getTextContent();const text=content.items.map(i=>i.str||'').join(' ');pages.push(text);length+=text.length;} finally{page.cleanup();}
      if(length>=CAPS.extractBytes){pages.push('[Relay: text shortened. Review the complete original.]');break;}
    }
    if(doc.numPages>CAPS.pdfPages)pages.push('[Relay: later pages were not read. Review the complete original.]');
    return pages.join('\n\n');
  } finally {await doc.destroy();}
}

export default {
  async email(message, env) {
    return receiveEmail(message,env,{
      read:async raw=>new Uint8Array(await new Response(raw).arrayBuffer()),
      parse:raw=>PostalMime.parse(raw),
      prepare:(parsed,envelope,options)=>buildIntake(parsed,envelope,{...options,extractPdf}),
      deliver:async ({meta,parts})=>{const actor=makeActor(env);return withRetry(()=>handIn(actor,"",meta,parts),3);},
      log:message=>console.log(message),
    });
  },
};
