# Install and update the local MCP connector

Requires Git, Node.js 22.22.2+ and an MCP client supporting a local stdio server.
Use a company-approved client: requested app data is shared with that client
and potentially its AI provider. Hub must have personal assistants enabled.

```bash
git clone https://github.com/kebabstack/kebabstack-source.git kebabstack
cd kebabstack/kebab-mcp
npm ci
```

There is no published npm package. Keep the source folder in a permanent place.

1. In the Hub profile menu choose **Connect an assistant**.
2. Copy the one-use code (valid ten minutes). In the connector folder:
   ```bash
   node server.mjs connect "PASTE_YOUR_CODE_HERE" --as "Desktop assistant"
   ```
3. Configure your client to start a local stdio server. Clients accepting a
   `mcpServers` JSON object can use:
   ```json
   { "mcpServers": { "kebab": {
     "command": "node",
     "args": ["/absolute/path/to/kebabstack/kebab-mcp/server.mjs"]
   } } }
   ```
   Replace the path; if needed use the full Node executable path too. Windows
   paths in JSON need escaped backslashes. Restart the client.
4. Ask which Kebabstack apps you can access, or run `node server.mjs status`.

The connection lasts 30 days. Credentials stay in `~/.kebab-mcp/config.json`
(or `KEBAB_MCP_CONFIG`); do not share or commit that file. The connector does
not elevate your permissions. Token files must belong to the current OS user
and cannot be symlinks. Check Windows file ACLs manually.

## Update

Review upstream changes, then from the same connector folder:

```bash
git pull --ff-only
npm ci
node server.mjs status
```

Restart every client using the connector. A Hub rollout **does not** update
Node code already running on another computer. Existing connections continue
to work until revoked/expired; there is no need to generate another code merely
because the connector version changed. Custom forks should review/rebase rather
than overwrite local changes. Releases identify the tested source commit.

## Disconnect

```bash
node server.mjs disconnect
```

On Hub 0.33.0+, this revokes the assistant token first, then deletes the local
file. If the Hub cannot confirm revocation, the command fails and preserves the
configuration for retry. On an older Hub, or when the computer is unavailable,
revoke it in **Hub profile → connected assistants**. Staff can also revoke under
Settings → AI. After Hub revocation, `node server.mjs disconnect --local` can
remove a leftover file; `--local` alone never revokes a token.

Restart other running clients after reconnecting or changing the local config.
A revoked assistant cannot obtain new tickets. Already-issued app sessions are
separate credentials governed by each app's expiry and access checks; see the
[security limits](README.md#security-and-operational-limits).
