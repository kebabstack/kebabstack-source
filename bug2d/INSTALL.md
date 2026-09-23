# Deploy Ship the Bug 2D alongside 3D

This module is **bug2d v0.2.0**, a separate two-canister application. Never link it to
an existing `bug` backend or frontend. Do not use the Kitchen `bug` recipe for this
module: that recipe continues to maintain the 3D game. This 2D release uses the CLI.

1. `npm ci`, `npm run build:backend`, `npm run build`, `npm test`, and
   `npm run test:backend`. The backend check compares the committed stable signature
   before refreshing generated Candid and browser bindings. Compiler stays at 1.12.0.
2. Deploy this module to the installation's recorded engine subnet using the
   controller identity: `icp deploy -e ic --subnet YOUR_ENGINE_SUBNET`.
   Record the two new IDs. Never copy mappings from `bug/`.
3. As controller call the new backend's `setHub` with the existing Hub backend ID.
   In Hub, connect this backend with the identity, roles and groups lanes, the same
   access policy as the 3D game, and a new **Ship the Bug 2D** tile. Keep the 3D tile.
4. Set `PUBLIC_HUB_URL` on the frontend to the installation's Hub URL. Put the new
   tile ID in `/.well-known/bug-deployment.json` as `{"hubTileId":NEW_TILE_ID}` in a
   deployment-only copy. Frontend reads the injected `PUBLIC_CANISTER_ID:backend`.
   Shared source keeps the backend and Hub URL placeholders. Verify the cookie
   after a settings change: if it has not refreshed, supply the Hub URL as `hubUrl`
   in the deployment-only `runtime-config.json` (leave `backend` null to use the
   certified canister ID). Preserve this file on later asset uploads.
5. Upload the frontend assets, including the installation metadata. Check both
   game links and their separate boards. Keep the new canister mappings in the
   installation record. Future updates use these IDs with `--no-create`, preserving
   stable memory and the `/.well-known/` installation files.

The fresh 2D board starts empty. This is not a migration of 3D scores. Guest keys
are browser/origin-bound; Hub identities can sign in again. Backend configuration
is controller-only; the app has no first-visitor claim window.

For the 0.1.0 → 0.2.0 update, snapshot both existing 2D canisters first, then use
an upgrade with main memory retained. The score board and profiles are preserved.
No state schema or compiler change is needed. Test the populated old-Wasm upgrade
with `KEBAB_BASELINE_WASM=/path/to/0.1.0.wasm npm run test:backend`.
