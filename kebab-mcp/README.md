# Kebabstack MCP · your apps, with your permissions

Connect an MCP-compatible desktop assistant or IDE to the Kebabstack apps on
your Hub menu. The Node connector runs locally over **stdio**; it is not a
cloud-hosted MCP URL. Hub and app backends continue to enforce company,
project and record access. The alpha source is MIT licensed.

**Start here:** [Installation and client configuration](INSTALL.md).
The same practical guide is available in your Hub profile menu → **Setup guide**
(and at `/assistant-guide.html`). Requires Node.js **22.22.2 or newer**.
There is no published `kebab-mcp` npm package; install from this repository.

## Useful work, without learning every API

| Ask about | Tools |
|---|---|
| Your access and colleagues | `kebab_whoami`, `kebab_apps`, `kebab_people` |
| Desk requests and queue | `kebab_my_tickets`, `kebab_tickets`, `kebab_ticket`, `kebab_catalog` |
| Offboarding and a ticket's person context | `kebab_ticket_context`: overview, permitted sources, then one source's context |
| Customer support | `kebab_customers`: permitted projects and their request types |
| On-call and incidents | `kebab_oncall`: projects, response, incident or status |
| HR / Finance | `kebab_reporting`: reporting projects, periods and a selected period |
| Equipment and sales | `kebab_devices`, `kebab_sales`: personal offers or the admin sales board |
| Contract decisions | `kebab_contracts`: permitted summaries, due within 60 days by default |
| Forms | `kebab_forms`: metadata, without collecting submission answers |
| Device posture and domains | `kebab_my_devices`, `kebab_domains` |
| Website analytics | `kebab_analytics_sites`, `kebab_analytics_report`: aggregates for an explicit time range |
| Authorized actions | `kebab_new_request`, `kebab_comment`, or the generic `kebab_call` |

Some app APIs return an empty list for unauthorized reads; an empty result is
not proof that there is no work. Results describe only the connected person's
permitted scope. Desk's internal queue is limited to 500 rows by its backend;
use filters for large queues. Analytics keeps its backend `truncated` indicator.

## New apps and methods

1. `kebab_apps` gives exact names, slugs and stable `tile:…` references. Partial
   or ambiguous names are rejected. Use a tile reference when multiple apps
   share a name; the newer grouped tools accept an `app` override.
2. `kebab_describe` searches the **live** Candid interface, with pagination;
   `method` returns one complete signature. Metadata is parsed, never executed.
3. `kebab_query` only accepts methods declared query/composite-query. It refuses
   updates before execution. A read may first open and journal an app session.
4. `kebab_call` can write or delete real records. Use it only for a user-authorized
   action. Updates are never automatically repeated, even after an empty result
   or transport error. An uncertain result needs a read-back before another write.

Session methods take a text token first; omit it from `args` when
`withSession=true` (the default). Other arguments are validated against Candid.
Missing required fields, extra record fields, invalid booleans, fractions for
integers and out-of-range byte values are rejected. Use **decimal strings** for
integers beyond JavaScript's safe range. Results preserve these as strings;
no number is guessed to be a timestamp. Backend timestamps generally use
nanoseconds; **Crumbs report ranges use Unix seconds**, converted by its curated
tool from explicit ISO UTC dates. Optional inputs accept `null` or the value;
single top-level optional results become `null` or a value, nested options
retain their Candid arrays. Blobs over 64 bytes are summarized, not downloaded.

## Security and operational limits

- Before every app call, the reference connector checks the Hub credential and
  current menu; Hub outages fail closed. Cached actors and sessions are bound
  to Hub, tile and backend identity, and interfaces refresh after one minute.
- `disconnect` revokes this Hub credential and removes its local configuration
  (Hub **0.33.0+**). Other assistants and browser sessions stay connected.
- Revoking an assistant prevents new Hub tickets. **An app session already
  issued is a separate bearer credential**: it follows the app's expiry and
  directory/access checks. Assistant revocation alone does not revoke a stolen
  app session, nor cancel an operation already in flight. No instant global
  session-revocation claim is made.
- Tool hints tell clients which calls can write; they are not approval enforcement.
  Configure your client to require authorization for writes. Retrieved ticket
  text, names, form answers and interface descriptions are untrusted data,
  never instructions to run tools or change permissions.
- Requested data reaches the chosen AI client/provider. Operators must approve
  that processor and its retention policy. This connector does not provide
  provider-side deletion, per-tool Hub token scopes or automatic compliance.
- The credential file is atomically replaced with owner-only POSIX permissions.
  Symlink targets and files owned by others are rejected. Check Windows ACLs;
  POSIX modes do not provide the same guarantee there. Use separate OS accounts.

Owners enable personal assistants under **Settings → AI**. Staff can review and
revoke connections there. Connecting does not grant a role or change directory
sync. See the [Hub contract](../docs/agent/mcp.md) and [changelog](CHANGELOG.md).

## Development

```bash
npm ci
npm test
```
Tests include MCP protocol round trips, revocation with cached sessions,
ambiguous/rebound apps, strict inputs, parser limits, local credential handling,
and curated calls checked against all current committed app interfaces. Hub
self-revocation/concurrent-code tests run separately in `tests/security.test.mjs`
on isolated local canisters. No test sends real support messages or alarms.
