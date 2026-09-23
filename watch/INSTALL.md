# Install and operate Watch

Requires a configured Hub (0.23.0 or later for central permissions) and the company's Cloud Engine, including OpenCloud. Install and update through **Hub → Apps** and the [release service](../kitchen/INSTALL.md).

## First installation

1. Publish a tested format-2 release bundle to the company's release store, following the release guide. In Hub → Apps → Add app, install Watch. The installer creates the components and fills the backend/Hub frontend placeholders.
2. Under Hub → Permissions, save Watch's policy and check enforcement. Hub owners/global admins inherit Admin. Assign Watch Admins and optional Viewers explicitly; the default is No access. Viewers read all monitoring, not a personal subset.
3. Check the app's identity, roles and notify lanes. Keep the company sign-in URL on the Hub's Watch tile. The installer/service binds Watch to the Hub; existing manually deployed components can be adopted rather than replaced.
4. In Watch → Settings, set the DNS interval, registry expiry lead time and administrator notifications. Save once. App address/company name and optional trusted operators are under their expandable sections.
5. Under Hub connection → Connection checks, send a test notification if desired. It contacts current Watch admins and the initiating admin; it is a real notification. Add a domain to establish its baseline. Daily/weekly checks fill in additional evidence as scheduled.

The Hub directory refreshes automatically. Refresh directory is available for diagnostics. Access and roles are never configured through a Watch-local administrator list.

## Local verification and release

Use an isolated checkout. Never commit deployment IDs or custom company URLs into portable frontend files.

```sh
npm ci
cd watch
../node_modules/.bin/mops install --locked
../node_modules/.bin/mops check --fix
../node_modules/.bin/mops build
```

Compare `backend/dist/backend.most` against the **committed** `backend/backend.most` with the pinned compiler's `--stable-compatible`; do not replace the baseline first. From the repository root, regenerate bindings with `python3 tools/sync-bindings.py watch`. Run `NODE_PATH="$PWD/node_modules" bash watch/test/run-smoke.sh`, `node --test watch/test/workspace.test.mjs` and the Watch security/permission regressions, including a populated upgrade from the deployed release. Build the actual ICP recipe executable as well; its build configuration can differ from Mops.

Commit the reviewed source, then build/publish a format-2 bundle and update **only Watch** using `kitchen/tools/release.mjs update --app watch`. Verify the identical published artifact afterward. Preserve existing release-store packages, frontend domain files, controllers, data, roles and Hub connection. For suite releases, include the release guide's central-permission and Lunch preservation checks. Production rollout requires authorization for that rollout.

Watch 0.9.0 adds computed query information, not a new stored record format. Existing domains, watchers, accepted baselines, event history and certificate retry state remain in place.

## Custom domain

Use the **frontend** component ID, never the backend ID. For a company choosing `watch.example.com`, create these records in the `example.com` DNS zone:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `watch` | `watch.example.com.icp1.io` |
| TXT | `_canister-id.watch` | `WATCH_FRONTEND_ID` |
| CNAME | `_acme-challenge.watch` | `_acme-challenge.watch.example.com.icp2.io` |

On Cloudflare, use DNS only (gray cloud) for both CNAMEs and Auto TTL. Preserve unrelated DNS records and zone security settings.

The frontend must also serve `/.well-known/ic-domains` containing `watch.example.com` on its own line. Keep any existing ownership entries. This is deployment configuration, not a tenant-specific file to commit into the marketplace source.

After public DNS resolves, validate and register the domain with the platform's custom-domain service. Follow the current [custom-domain documentation](https://docs.internetcomputer.org/guides/frontends/custom-domains/). Confirm a valid HTTPS certificate and that the hostname serves the expected Watch frontend **before** switching application URLs.

Then set both the Watch tile URL in Hub and Watch → Settings → App details → Public app address to `https://watch.example.com`. This address drives alert links and canonical sign-in. The old component hostname redirects to the configured origin before starting SSO. Only allowlisted public routes are preserved; tickets, tokens and query strings are never copied across origins. Sign in afresh after the origin switch. Test both Hub-launched and direct sign-in. The API transport host remains unchanged.

## Check failures and recovery

A certificate failure does not advance its successful-evidence timestamp. First failures remain unverified, retries wait at least three hours, and the retry pause survives upgrades. Repeated identical failures do not create new duplicate events; older consecutive duplicates are grouped in Activity. Check now respects this retry pause and shows its earliest eligible attempt on the domain page.

A failed DNS request retains last-known answers but cannot be accepted or trimmed as fresh evidence. Missing names and broken targets require DNS repair. Paused/removed domains and deselected record types cannot have their baseline changed through old links or direct API calls.
