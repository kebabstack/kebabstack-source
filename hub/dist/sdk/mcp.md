# AI assistants on the hub — the MCP contract

A person connects a chat assistant on their own computer to the company's apps.
The assistant then acts **as that person** through the same tickets the menu
uses: same access rules, same 60-second lease, same lock-out. This page is the
contract for the hub side (≥ 0.19), the reference server (`kebab-mcp/`) and any
app that wants to be usable from the chat. `hub/backend/backend.did` is the
type-level truth.

## 1 · Flow

```
person (signed in)        hub                               assistant (kebab-mcp)              app
  Menu → Connect ─────▶ mintAssistantCode(sessionToken)
  copies the code       code = "<hub canister id>.<64 hex>", 10 min, one use
                                                    ◀──── redeemAssistantCode(code, clientName)
                        token (30 days) + who ─────▶ stored in ~/.kebab-mcp/config.json (0600)
                                                    ◀──── assistantApps(token)           what is on the person's menu
                                                    ◀──── assistantTicket(token, tileId) same gates as mintAppTicket
                        one-time ticket ───────────▶ loginWithTicket(ticket) ──────────▶ app session as the person
                                                          myTickets(tok) … every method that takes `tok` first
```

- **Code**: `mintAssistantCode` needs a live portal session; the person must be
  active and the lane on. Format `^<canister>\.<hex>$`; the prefix tells the
  server which hub to talk to, so one client works with any hub.
- **Token**: opaque, 30 days, no refresh — reconnect with a new code; the hub
  stores only its hash. Dies at once when the person disconnects it (menu), staff
  disconnect it (Settings → AI), the owner switches the lane off (for good), the
  person is locked out, or the person's address is re-issued to someone else
  (`assistantWhoami` → `null`, `assistantTicket` → `{ ok = false }`). A rename
  carries the token along.
- **Tickets**: `assistantTicket` runs exactly `mintAppTicket`'s checks (person
  active, tile on the menu and not hidden, access policy, grants) and journals kind `assistant`
  with the client name. The app never learns it was an assistant — it sees the
  person, as it must.
- **Sessions**: one app session per app, reused ≈ 9 h; the app's own lease
  (directory fresh within 60 s, person active) gates every call as always.

## 2 · Hub methods (assistant plane, no principal needed — the token is the credential)

| method | returns | notes |
|---|---|---|
| `redeemAssistantCode(code, clientName)` | `{ ok; token; email; displayName; id; expiresAt; orgName; detail }` | one use; at most ten live assistants per person; `clientName` ≤ 60 chars, shown to the person and staff |
| `assistantWhoami(token)` query | `?{ email; displayName; id; client; expiresAt; orgName; hubRole }` | `null` = token dead (any reason) |
| `assistantApps(token)` query | `[{ tileId; name; url; note; canisterId }]` | connector-bound tiles the person may open; `canisterId` = the app backend |
| `assistantTicket(token, tileId)` | `{ ok; ticket; url; detail }` | 90-s one-time ticket for `loginWithTicket` |
| `assistantPeople(token, q)` query | `[{ id; email; displayName; title; department; groups }]` | the union of what the person's own apps show in their pickers (scope, filters, policy, lanes), max 25 |

Person plane (portal session): `mintAssistantCode`, `myAssistants`,
`revokeAssistant(id)`. Staff/owner: `setAssistantsEnabled(on)`,
`listAssistants`, `revokeAssistantOf(id)`. Expired tokens and codes are pruned
by the 120-s timer.

## 3 · What makes an app usable from the chat

The reference server needs nothing app-specific — it reads each app at run
time. An app is "assistant-ready" when it follows the SDK conventions:

1. **Published interface**: the backend carries `candid:service` metadata (the
   Motoko recipe does this by default). The server reads it through the IC API
   and parses it (`kebab-mcp/lib/did-parse.mjs`) — it never fetches or executes
   code from an app's frontend (`dist/idl.js` is for browsers only).
2. **Documented Candid**: `///` comments on public methods end up in that
   metadata; `kebab_describe` shows them to the model. Write them for a reader
   who has never seen the app ("the person's own tickets").
3. **`tok : Text` first** on every session method — the server prepends the
   session automatically; public methods (`info`, `hub_ping`, `publicForm`) take
   none and are called with `withSession = false`.
4. **`{ ok; detail }` on writes**, `null` on unknown/unauthorized reads — never a
   trap. The model reads `detail` as-is, so keep it in plain language.
5. **Ids in, ids out**: people are stable ids (`p_…`) with addresses resolved
   next to them (`requesterEmail`, `people`), as documented in
   `onboard-app.md` § 2 — an assistant should never have to join tables.
6. **`hub_ping()` = recipe id** — that is the short name (`desk`, `assets`) the
   curated tools use; a non-SDK app is still callable by its tile name.

Nothing else. No app registers with the assistant, no app stores assistant
tokens, no app grants anything the person does not already have.

## 4 · The reference server (`kebab-mcp/`)

Node ≥ 20, stdio transport, `@modelcontextprotocol/sdk`. Tools:

| tool | kind | what |
|---|---|---|
| `kebab_connect` | write | exchange a code (asks the person for it) |
| `kebab_whoami` · `kebab_apps` | read | who, and which apps |
| `kebab_describe` | read | an app's live Candid with documentation |
| `kebab_call` | write | any method of any app, JSON → Candid (nat as number, opt as value/null, variant as `"tag"` or `{"tag": v}`, blob as base64) |
| `kebab_people` | read | directory search |
| `kebab_my_tickets` · `kebab_tickets` · `kebab_ticket` · `kebab_catalog` | read | desk |
| `kebab_new_request` · `kebab_comment` | write | desk |
| `kebab_devices` (assets) · `kebab_my_devices` (trust) · `kebab_domains` (watch) | read | curated reads |

Read tools carry `readOnlyHint: true`; writes do not, so a well-behaved client
asks the person before every write. The server's `instructions` tell the model
the same. Curated tools are thin wrappers over `kebab_call` — anything they miss
is one `kebab_describe` away.

Setup for people is in `kebab-mcp/README.md`; this contract is what the hub
serves under `/sdk/mcp.md` (linked from the menu card and *For developers*).

## 5 · Threat model, in plain terms

- **The token is a credential** — worth as much as the person's browser
  session for 30 days. It lives in one file readable by that user; treat a lost
  laptop like a lost password: disconnect in the menu (or staff do).
- **No escalation path**: the assistant can only obtain tickets for tiles the
  person may open, and every app re-checks the person on every call. Locking a
  person out kills their assistants within the lease.
- **Prompt injection**: ticket bodies, form answers and device names are data
  written by others and flow into the model's context. The server never acts on
  its own; the client's confirmation step for writes is the guard. Owners who do
  not want this exposure switch the lane off.
- **Audit**: every assistant sign-in is a journal row (kind `assistant`, the
  client name); staff see all connected assistants with last use.
- **What the server executes**: only its own code. App interfaces are parsed
  from canister metadata, never imported as JavaScript from a URL (0.2.0).
- **The lane is off by default** (hub 0.19); an owner turns it on. Switching it
  off disconnects every assistant for good.
- **Not covered**: per-tool scoping (a token is the whole person), rate limits
  beyond the apps' own, revocation of an *app* session already minted (dies with
  the lease), assistants on shared machines.
