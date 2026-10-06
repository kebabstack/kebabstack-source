# External mail relay — prepared contract, not enabled

Forms and Desk do not send external email in this release. Hub staff notifications
remain separate. There is no configured provider, API credential, active worker,
or delivery promise. The contract below is the boundary for a later adapter;
it is not a currently served endpoint.

## Operator workflow

A future operator will connect one relay, verify a sender domain, test delivery,
and explicitly enable it. The relay will receive only the chosen recipient and
message, not a Hub directory or unrestricted Desk access. Until that work is
implemented, the UI must say **External mail is not connected**.

## Proposed adapter request

`POST /v1/messages` over TLS with server-held authorization and
`Idempotency-Key: <opaque delivery ID>`.

```json
{
  "version": 1,
  "id": "opaque-delivery-id",
  "kind": "verify-email",
  "to": "alex@example.com",
  "subject": "Confirm your support email",
  "text": "Open the single-use verification link to confirm this address.",
  "expiresAt": "2026-10-01T12:00:00Z"
}
```

Allowed future kinds: `verify-email`, `receipt`, `ticket-update`. The server
chooses the sender; callers cannot supply arbitrary headers or sender addresses.
The adapter rejects newlines in headers, oversized messages, unknown properties,
expired messages and recipient changes under an existing delivery ID. A repeated
identical ID returns the same provider reference. The same ID with different
content returns 409; it never sends a second message silently.

Acceptance response: `202 {"id":"…","state":"accepted","providerId":"…"}`.
Acceptance means queued by the provider, not delivered or read. Delivery events
must be authenticated and deduplicated. Retry transient errors with backoff;
bounces and permanent failures require visible operator attention.

## Required work before activation

- Implement the durable mail outbox, authenticated adapter and delivery history.
- Verify the recipient with an expiring single-use token. Never turn an entered
  address into a Hub account or grant access to another person's existing ticket.
- Send private ticket access only to its verified recipient; no private notes,
  staff-only links or full page URLs in an email.
- Keep verification and ticket-access tokens out of logs, notification titles,
  analytics, referrers, source repositories and public previews.
- Implement expiry, cancellation on erasure and handling of late callbacks.
- Test duplicate delivery, provider outages, bounce handling, recipient changes
  and deletion. Configure provider-specific data retention separately.

## Decision for an organisation

This separates the support workflow from the mail provider. It avoids making a
particular commercial mail service mandatory, but requires a later adapter and
operational ownership. It does not yet replace Jotform's notification emails.
