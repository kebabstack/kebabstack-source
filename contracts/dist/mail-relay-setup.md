# Mail intake from Google Workspace

This guide describes the included Cloudflare Email Worker. It is code you deploy and operate;
entering an address in Contracts does not create a mailbox or a running relay.

Example configuration: `contracts@example.org` → `contracts@relay.example.org`
→ the built-in **Contract intake** workspace → review → choose a final workspace.
These addresses are a proposed configuration, not a claim that mail routing is already active.

## 1. Use the shared intake

Choose **Contract intake** in the workspace selector. This built-in inbox is accessible to
active **Hub admins and Hub owners**; its membership follows their current Hub roles. A
Contracts-only administrator or teamspace owner has no automatic access. Everyone may submit
by email; this does not make the inbox visible to everyone. Hub role changes and deactivation
follow the existing access lease of at most 60 seconds. No role grants access to somebody
else's personal space or a teamspace they do not belong to.

From the review page, a reviewer can save to the current space or another space they own
(the source space must also be owned for a transfer). The original email, attachments and
suggestions move together. Existing contracts can be moved from their Access tab. Personal
means the reviewer's own personal space; filing into someone else's private space requires a
separate recipient workflow and is not implemented. Moving does not recall downloaded copies
or unread copies in Google. Google Group membership is configured separately; keep its human membership restricted to the intended intake reviewers.

Later replies continue to arrive in Contract intake. There is no automatic cross-workspace
search for a moved private contract. Choose its destination and **Move document there for review**;
this moves the unfiled email without creating a duplicate contract. Matching runs again only
inside that destination. Use **Add to an existing contract** to choose the record manually
when needed. Both spaces must be owned by the reviewer. Alternatively, give a high-volume
team a dedicated relay identity and address. Do not grant global search to solve routing.

## 2. Set up the public Google address

Use a private Google Group `contracts@example.org`. Enable conversation history to retain a
copy in Google, and restrict who can view conversations and membership. Enable external
posting if vendors need to keep the address in CC. Add the relay address as an external
member with **Each email** delivery; this requires the administrator's external-members
setting. Monitor spam/moderation so legitimate mail does not remain pending unnoticed.

Alternatively, keep a dedicated Gmail mailbox and configure an administrator-managed
forwarding copy. Retain the original mailbox; a forwarding-only alias offers no recovery copy.
No Gmail OAuth app or mailbox polling is required for the Group-forwarding design.

[Google Group settings](https://support.google.com/groups/answer/2464926?hl=en)

## 3. Prepare Cloudflare routing

Use a separate subdomain such as `relay.example.org`. In Cloudflare Email Routing,
add the subdomain and its required DNS records. Configure the exact recipient
`contracts@relay.example.org` to **Send to a Worker** after deploying the worker below.
Keep your company's existing Google mail delivery and MX records.

Add and verify a separate recovery destination that a reviewer monitors. It must not forward
back into either contracts@ address. The full original goes there when intake cannot complete.

[Cloudflare subdomain setup](https://developers.cloudflare.com/email-service/configuration/subdomains/)

## 4. Generate the relay identity and deploy

From this repository:

```sh
cd contracts/relay
npm ci
npm run mint
```

This prints a public **principal** and a secret key. Keep the secret out of chat, screenshots,
source files and Git. Save it in your organisation's secret manager and set it as a Worker secret.
Use a different identity for every destination space.

Configure `wrangler.toml`:

```toml
[vars]
CONTRACTS_CANISTER_ID = "<Contracts BACKEND canister>"
ALLOWED_RECIPIENTS = "contracts@relay.example.org"
MAILBOX_ADDRESS = "contracts@example.org"
FALLBACK_ADDRESS = "<separate verified recovery mailbox>"
```

`ALLOWED_RECIPIENTS` is required; an empty list rejects mail. `MAILBOX_ADDRESS` records the
public mailbox consistently for deduplication and prevents direct recovery loops.

```sh
npx wrangler login
npx wrangler secret put RELAY_SECRET
```

Paste the secret interactively. Do not include it in command arguments or commit it.

Before connecting the live email rule, perform both authorisation steps in Contracts:

1. **Workspace tools → Mail setup**: save the public address and public relay principal.
2. Open **Contract intake → Access & mail setup**: connect that same principal.

The operator trusts the principal; a Hub admin/owner binds it to the shared intake.
Other teamspaces still require their explicit space owner to bind a relay. Email headers
cannot select another workspace. An identity bound elsewhere needs a separate key.

```sh
npm test
npx wrangler deploy
```

Now bind the exact email routing rule to this Worker. Confirm the worker's dependencies,
CPU/memory limits and account plan support your expected traffic; parsing happens in Cloudflare,
storage in the configured canister, and supported text goes to the configured Hub AI provider.

## 5. Verify before relying on it

Use a fictional contract:

1. Send a small text PDF to contracts@. Confirm a Google copy and a Contracts inbox entry.
2. Open/download its original. Check source quotes and correct an extracted value.
3. Save to a space you own. Confirm the original is attached and no longer visible in the old space.
4. Send the same email again: it should be identified as a duplicate, not create another contract.
5. Reply with a changed term: check the proposal and its source evidence.
6. With a separate test configuration, remove relay trust and verify the original reaches recovery.
   Also test an oversized attachment and a parser failure before handling real agreements.

`npx wrangler tail` shows processing stage, source id and recovery outcome, without message
text or secrets. Contracts **Workspace tools → Status** shows arrivals, failed jobs and AI access.
The status is not proof of an end-to-end route: a test email confirms that.

## What is automatic, and what still needs review?

Implemented: MIME text/attachments; retry on transport errors; deduplication; bounded text PDF
extraction; source-backed AI suggestions; review/edit/save with original; workspace access gates.
Up to four earlier received messages referenced by RFC mail headers can provide context, inside
the same non-legacy workspace. Quoted text in the current message is also available. Unseen
messages and personal mailboxes are not available to the AI. The model sees bounded text, not
every page of long documents; check the original, including schedules and signature pages.

AI distinguishes negotiation, signature requests and **reported** execution from supplied text.
It does not verify handwriting, PDF digital signatures, signer authority or legal validity. A
file called signed.pdf, a typed name, invoice, or old quoted agreement is not proof of completion.
Scans/images are stored for visual review; OCR and signature validation are not implemented.
A new contract stays a draft until a person changes its status. Review uncertain lifecycle hints.

## Failure and recovery

Limits: 16 MB raw email, 10 attachments, 1.5 MB each; extracted text 60 KB per document;
email body 190 KB and HTML 480 KB. PDF parsing stops at 40 pages / the text budget.
If any attachment cannot fit, the worker sends the **complete original** to recovery instead
of committing an incomplete set. A PDF without readable text can still be stored for review.

MIME errors, canister refusals, missing credentials and exhausted transport retries all use
recovery. If forwarding also fails or is not configured, the worker rejects delivery.
`setReject` is an SMTP rejection, not a promise of automatic redelivery. Monitor the Google
archive/recovery mailbox and re-upload the saved .eml when needed. Matching prevents duplicate
committed sources; an interrupted upload can leave pending chunks until backend expiry.

[Cloudflare email handler API](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/)

Rotate a relay by generating a new identity, trusting and binding it, updating the Worker secret,
and testing a delivery before removing the old principal. Never remove the last working route
before the replacement has been verified.
