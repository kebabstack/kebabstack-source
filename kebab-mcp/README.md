# kebab-mcp — your company's apps for your AI assistant

An [MCP](https://modelcontextprotocol.io) server that connects a chat assistant on
your computer (a desktop chat app, an IDE — any MCP client) to your company's
kebab-stack: the service desk, the device register, forms, device health,
domains, and every app your operator adds later. The assistant signs into each
app **as you**, with exactly your rights — the hub mints the tickets, the apps do
the gating, the same lease and lock-out apply. Nothing is granted that you could
not do by hand in the browser.

## Install from the source repository

Use Node.js 22.22.2 or newer. This alpha is distributed through GitHub; an
npm package has not been published. Install the locked dependencies locally:

```bash
git clone https://github.com/kebabstack/kebabstack-source.git kebabstack
cd kebabstack/kebab-mcp
npm ci
```

Keep this checkout in a permanent location. To update it, review the changes,
then run `git pull --ff-only` and `npm ci` again. Restart the assistant afterward.

## Connect

1. In the hub: **Menu → your name → Connect an assistant**. Copy the code
   (`<hub canister id>.<64 hex>`; valid 10 minutes, one use).
2. On your computer:
   ```bash
   node server.mjs connect "PASTE_YOUR_CODE_HERE" --as "Desktop chat"
   ```
   The token (30 days, revocable in the hub menu anytime) is stored in
   `~/.kebab-mcp/config.json`, readable by you only.
3. Tell your chat client to start the server — in its MCP servers config
   (most desktop chat apps and IDEs read a `mcpServers` block like this):
   ```json
   { "mcpServers": { "kebab": { "command": "node", "args": ["/absolute/path/to/kebabstack/kebab-mcp/server.mjs"] } } }
   ```
   Replace the example with the full path to your local `server.mjs`. If the
   desktop client cannot find Node, use the full path to the Node executable too.
   Or skip step 2 and let the assistant ask you for the code: it has a
   `kebab_connect` tool.

From the `kebab-mcp` directory, `node server.mjs status` shows who is connected
and which apps; `node server.mjs disconnect` forgets the local token (disconnect
it in the hub menu too).

Some Hub versions show a shorthand `npx kebab-mcp` command. Use the local
commands above instead. Do not accept an npm download prompt for that name;
this repository is the distribution source.

## What the assistant can do

- **Ask:** "what's open in IT?", "who has the MacBook with tag INV-0042?",
  "which team is Ana in?", "are any of our domains expiring?", "is my laptop
  healthy?" — curated tools: `kebab_my_tickets`, `kebab_tickets` (agents),
  `kebab_ticket`, `kebab_catalog`, `kebab_people`, `kebab_devices`,
  `kebab_my_devices`, `kebab_domains`.
- **Act:** "file a request: printer on floor 3 jams", "reply on DSK-42 that it
  is fixed" — `kebab_new_request`, `kebab_comment`. Writes are marked so the
  client asks you first.
- **Anything else:** `kebab_describe <app>` returns the app's live interface with
  its documentation; `kebab_call <app> <method> <args>` calls it. New apps and new
  methods need no update of this package.

## For operators

Owners switch the lane on or off for the company under **Settings → AI →
Personal assistants**; staff see every connected assistant there (person,
client, last use) and can disconnect one. Every app session an assistant opens
is journaled (kind `assistant`). Hub ≥ 0.19 required; the contract is in
`docs/agent/mcp.md`.

## Development

```bash
npm ci && npm test        # JSON↔Candid coercion + an in-memory MCP round trip against fake canisters
```
No network in the tests; the real network layer is `lib/runtime.mjs` →
`networkDeps()` (agent-js against the IC HTTP gateway). An app's interface is
parsed from its backend's `candid:service` metadata (`lib/did-parse.mjs`) —
nothing fetched from the network is ever executed here.
