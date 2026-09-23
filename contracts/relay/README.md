# Contracts email relay

A Cloudflare Email Worker receives a forwarded Google Workspace copy and hands text and original
attachments to a dedicated Contracts workspace. It uses the same intake protocol as browser uploads.

Start with [the Google Workspace setup runbook](RUNBOOK.md), also available in the app under
**Guide → Mail setup**. It covers the shared intake space, Google Group, separate Cloudflare
subdomain, relay identity, recovery mailbox and a complete test delivery.

`npm ci && npm test` runs MIME fixtures, intake protocol and failure/recovery regressions.
`npm run mint` generates a relay principal and secret (never publish or commit the secret).
`npm run deploy` deploys the configured Worker after setup and authorisation.

An email address alone does not activate the integration. OCR and verified-signature detection
are not implemented; text-based lifecycle suggestions require human review. Company mail copies
remain in Google and recovery, separately from Contracts workspace membership.
