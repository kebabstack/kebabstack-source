# The hub as an OpenID Connect provider — alpha implementation

Status: **built 2026-09-03** (hub backend `main.mo` OIDC section + `Rsa.mo`, frontend Apps → Sign-in for other apps + consent view, tests `hub/test/run-rsa.sh`, `hub/test/oidc-rp.mjs`). Deployed: pending. Reviews: pending.

## Why

The Hub signs people into its own apps with tickets and can also be a relying
party of Google/Okta. Its separate OIDC provider lets external software request
sign-in using the same directory. This is an alpha implementation, not a guarantee
of compatibility with every product. External applications control their own
sessions: Hub revocation does not instantly terminate them. SAML and outbound
SCIM are not implemented.

## What already exists and gets reused

- **ES256 signing in-canister**: `mo:ecdsa` P-256 keys generated from
  `raw_rand`, JWT header/payload assembly, base64url, public **JWK** export —
  built for Okta `private_key_jwt`. The provider supports ES256 and custom RSA-2048/RS256 signing.
- **HTTP endpoints on the backend canister**: the SCIM router
  (`http_request` → `upgrade` → `http_request_update` for state-changing
  calls). OIDC endpoints join it under `/oidc/…` and `/.well-known/…`.
- **Connectors**: access policy (`accessForConn` — lock-out wins), lanes,
  menu tile, journal, owner UI. An OIDC client *is* a connector; lanes decide
  which claims it receives.
- **Sign-in on the frontend**: passkey session (Internet Identity), linked
  person, `CANONICAL_ORIGIN`. The authorization page is one more view.

## Endpoints

| | Where | Method | Call type |
|---|---|---|---|
| `/.well-known/openid-configuration` | backend | GET | update |
| `/oidc/jwks` | backend | GET | update |
| `/oidc/authorize` | backend → 302 to the **frontend** view `/#/oidc/authorize` | browser | update (redirect only) |
| `/oidc/token` | backend | POST | update (code is consumed) |
| `/oidc/userinfo` | backend | GET, Bearer | query |

**Issuer** = `https://<backend-canister-id>.icp.net` — the discovery document
must live under the issuer, and only the backend serves HTTP from code. The
authorization endpoint may be on another host (allowed by OIDC Core § 3); it
points at the frontend. Consequence: a later custom domain for the backend
changes the issuer and every client must be reconfigured — decide the domain
before the first production client.

## Flow (Authorization Code + PKCE, the only response type)

1. App redirects the browser to
   `<issuer>/oidc/authorize?client_id&redirect_uri&scope&state&nonce&code_challenge&code_challenge_method=S256`;
   the backend answers 302 to `<frontend>/#/oidc/authorize?…` (the frontend also
   accepts the parameters before the hash, for libraries that use `URL.searchParams`).
2. The hub view: if no passkey session → the normal sign-in; then a consent
   card — "Sign in to **Grafana** as Jane Doe (jane@acme.com)? Grafana will
   receive: who you are · your groups." — one button. (Consent is remembered
   per client; owners can require it every time.)
3. Frontend calls `oidcAuthorize(sessionToken, params)` (authenticated update call). Backend:
   client exists and enabled · `redirect_uri` exact-matches one registered URI
   · PKCE present for public clients · the caller's person resolved · access
   policy of the client says **active** (lock-out or group scoping refuse
   here) · issues a **code**: 32 random bytes, bound to client, redirect_uri,
   nonce, code_challenge, person, **60 s**, single use.
4. Frontend redirects to `redirect_uri?code&state`.
5. App's backend `POST /oidc/token` with `grant_type=authorization_code`,
   `code`, `redirect_uri`, `client_id` + `client_secret` (post or basic) or
   `code_verifier`. Backend verifies everything, consumes the code, re-checks
   access, returns `{ id_token, access_token, token_type: "Bearer", expires_in }`.
6. Optional `GET /oidc/userinfo` with the access token (opaque, 1 h) → the
   same claims, re-checked against the live directory.

## Tokens and claims

`id_token`: RS256 (or ES256 per client), `kid` of the hub key, `iss`, `aud` = client_id, `sub` =
an opaque id keyed by the person’s email; changing the email creates a new subject, and purging retires the old subject, `iat`, `exp`
= 15 min, `nonce`, `auth_time`, `amr` describing passkey or federated sign-in. Claims by lane:

| Lane (what the app may know) | Claims |
|---|---|
| who signed in (always) | `sub`, `email`, `name`, `preferred_username` |
| job profile | `title`, `department`, `manager_email`, `location` |
| groups | `groups: [names]` |
| hub role | `hub_role: owner\|admin\|helpdesk\|member` |
| photos | `picture` (avatar URL on the hub) |

No refresh tokens. An app must reauthorize; `prompt=none` is refused. Existing
sign-in can avoid another passkey interaction, but consent/login policy still applies. No `end_session_endpoint`
yet. No dynamic client registration ever — clients are created by owners.

## Client registry (owner UI, Apps → Sign-in for other apps)

Setup is preset-driven: pick the app (Grafana, GitLab, Nextcloud, Outline,
oauth2-proxy, other) and paste its address — callback URI and menu entry are
prefilled, and after Create the page shows the exact settings block for that
app (grafana.ini, gitlab.rb, Nextcloud user_oidc form, Outline .env,
oauth2-proxy flags). The client appears on the menu as "signed in" (tile kind
`oidc`), under Connected apps (lanes, access) and under Sign-in for other apps.
Advanced: type, signature, consent, note, menu address.

Name · redirect URIs (exact, https only, `http://localhost` allowed for dev) ·
type: **confidential** (secret, shown once, stored as SHA-256) or **public**
(PKCE mandatory, `token_endpoint_auth_method: none`) · lanes · access policy ·
menu tile (the app's own login URL) · consent: once / every time. Generated:
`client_id` (`kb_` + 24 hex). The client shows the provider values the app
needs in copy-ready form: issuer, discovery URL, client id, secret.

## Keys

One RSA-2048 provider key plus one P-256 key for the whole hub, created on first use, `kid` =
`hub-<yyyymmdd>-<4 hex>`. **Rotate** (owner button): new key signs, old key
stays in the JWKS for 24 h, then drops (RSA rotation; ES256 rotation is not implemented). Keys never leave the canister; node
operators of the engine subnet can read canister state — same statement as
for every other secret in the hub (documented under Security).

## Signing algorithm — decision 2026-09-03

Compatibility target: whatever today's OIDC modules in common SaaS accept. That is
**RS256**: OpenID Connect Core § 15.1 makes RS256 mandatory for providers,
every relying-party library supports it, and ES256 still trips real software
(oauth2-proxy refused ES256 id_tokens until a config flag was added, issue
#1626). So the MVP signs **RS256 by default** and offers ES256 per client
(the ES256 code already exists). Cost: RSA signing and 2048-bit key
generation in Motoko — no library signs RSA today (`mo:rsa` verifies and
exports JWKs, which we reuse for the JWKS endpoint). Feasibility is measured
first with `hub/probe-rsa/` — **measured on the engine, 2026-09-03**
(instructions as charged; limit 40 B per update call):

| Operation | Instructions |
|---|---|
| 2048-bit modpow, 2048-bit exponent (RS256 sign without CRT) | 1.90 B |
| 1024-bit modpow (one CRT half; one Miller-Rabin round) | 0.34 B |
| 512-bit prime found (267 candidates, sieve + 8 MR rounds) | 4.1 B |
| 1024-bit prime found (23 candidates — a lucky draw) | 3.8 B |

Verdict: **signing fits in one call** (≈ 0.7 B with CRT, ≈ 1 s of execution);
**key generation does not reliably** — a 1024-bit prime needs ~350 odd
candidates on average, ≈ 25 B expected and 2–3× that when unlucky, and a key
needs two. So the key is generated in the background: a resumable search that
tests ≤ 60 candidates per timer slice (≈ 3.4 B typical, ≈ 13 B worst case;
five `raw_rand` calls per slice, requested in parallel) until both primes are
found, started when the first OIDC client is created or by the owner button,
resumed by the 5-minute tick after an upgrade. One to three minutes, once per
hub; the client page says "signing key: generating…" until then. `bench`
numbers stay in the repo so the estimate can be re-checked.

## Limits, honestly

- **RS256 + ES256, nothing else** (no PS256, no HS256). Client chooses; RS256 default.
- **Lock-out is instant for new sign-ins** (code and token are refused, userinfo
  refuses). An app's *own* session lives as long as the app decides — the
  same limit Okta has; back-channel logout is a later step.
- Only `response_type=code`; no implicit, no hybrid, no device flow.
- Issuer tied to the backend canister URL until a custom domain is set up.
- Rate limit: 600 successful token exchanges per client per 5 min; codes and tokens live in
  memory with TTL sweeps; at most 1 000 live codes.

## Verification plan (before anyone uses it)

1. **Protocol RP**: a Node script with `openid-client` (discovery → authorize
   URL → paste code → token → verify id_token against the JWKS → userinfo).
   Runs from a laptop; exercises every endpoint and claim.
2. **A real app**: Grafana in Docker (`GF_AUTH_GENERIC_OAUTH_*`) against the
   hub — the most common "we just want SSO" case; verifies RS256 end to end,
   groups → role mapping, lock-out behaviour.
3. Optional third: Okta inbound federation (Okta as RP, hub as IdP) or
   oauth2-proxy in front of any static site.
4. Two independent reviews — **done 2026-09-03** (security: 6 MEDIUM / 10 LOW,
   design: 2 Blocker / 5 Warning; all Blockers, MEDIUMs and Warnings fixed the
   same day, see WORKLOG) — one security (redirect handling, code binding,
   PKCE, secret storage, timing), one Motoko design (`reviewing-motoko`).

## Effort

Backend ≈ 700 lines (registry, authorize, token, userinfo, discovery, JWKS,
key rotation, sweeps), frontend ≈ 400 (authorize view, client UI, copy-ready
values), docs (How this hub works → new tab "Sign-in for other apps"), tests.
Four to five working sessions including RSA and both reviews.

## Decisions requested

1. ~~Apps or separate registry~~ → **Apps/connectors** (decided 2026-09-03).
2. ~~ES256 only~~ → RS256 default + ES256 (decided, see above); probe first.
3. ~~Test targets~~ → `openid-client` script + Grafana (decided 2026-09-03).
4. Issuer on the backend canister URL now; custom domain before production.
