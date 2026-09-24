# Product website — Cloud Engine installation

This module publishes only the static marketing website. It is separate from
Kitchen and the application suite. It neither upgrades the suite nor publishes
its source. Target domain: **kebabstack.dev**. Version: **0.5.2**.

## Build and inspect

Use Node.js 22.22.2 or a newer supported version and the repository's pinned
dependencies. `icp` 1.4.0 was used for validation; the recipe is pinned to
`@dfinity/static-site@v0.3.3` (certified-assets, not the legacy asset canister).

```sh
# repository root
npm ci
cd website
npm ci
npm run build
npm test
icp build
npm run preview
```

Review http://127.0.0.1:4177/ and http://127.0.0.1:4177/en/. The preview binds
only to the local machine and applies the same declared security headers.
For a local canister test, use a disposable identity/home and the module's
dedicated gateway port 4180. Do not switch another project's local network or
reuse a production identity. Commands (with that isolated `ICP_HOME` already set):

```sh
icp network start -d
icp deploy -e local --identity anonymous
icp network stop local
```

There is no Motoko application code or persistent business state to migrate.
The static canister's code and uploader are a pinned, matched upstream pair.
The public build includes complete HTML in both languages, local assets,
MIT license, module release notes, pilot checklists, sitemap and domain file.
It excludes the source tree, operator documents, deployment IDs and private data.

## Deploy to the DFINITY Cloud Engine

Do this only for an explicitly authorized production rollout. Obtain the exact
engine subnet, console origin and authorized CLI identity from the operator;
do not infer them from another module's working copy. Provision a **new website
canister**, not a reused Hub, Kitchen, release store or application canister.

1. Review the content, including public-release/Marketplace status. Add the real
   publisher/contact and any notices required for that operator. The site does
   not collect forms. A configured build loads the operator’s Crumbs tracker;
   infrastructure may also log access.
2. Link an identity to the **exact** console origin, following
   [the official Cloud Engine guide](https://skills.internetcomputer.org/.well-known/skills/deploy-to-cloud-engine/SKILL.md).
   Existing valid operator identities can be reused explicitly. Avoid changing
   the global default identity just to deploy this module.
3. Run from `website/`, substituting the authorized identity and actual subnet:

```sh
icp deploy -e ic --identity <AUTHORIZED-IDENTITY> --subnet <ENGINE-SUBNET-ID>
```

4. Retain the generated `.icp/data/mappings/ic.ids.json` **privately** for future
   updates. Check that it contains exactly the intended website canister. Never
   commit it. Open the resulting `https://<WEBSITE-CANISTER-ID>.icp.net` URL.
5. Verify `/`, `/en/`, `/styles.css`, `/app.js`, `/favicon.svg`,
   `/pilot-de.md`, `/pilot-en.md`, `/LICENSE.txt`, `/CHANGELOG.txt`, and
   `/.well-known/ic-domains`. An unknown path must return a real 404.
   Check the served language, version, headers and interactive controls.

The optional Crumbs configuration is deployment-specific; no Hub connection,
login or cycle top-up is required by this website. Engine
infrastructure is still billable. Do not treat `icp build` as a deployment.

## Connect kebabstack.dev

`public/.well-known/ic-domains` already contains `kebabstack.dev`; the build
retains it and the certified-assets recipe uploads it automatically.

After deployment, use the actual website canister ID:

| DNS name | Type | Value |
| --- | --- | --- |
| `kebabstack.dev` | Provider-supported ALIAS / ANAME / CNAME flattening | `kebabstack.dev.icp1.io` |
| `_canister-id.kebabstack.dev` | TXT | Actual website canister ID, exactly one record |
| `_acme-challenge.kebabstack.dev` | CNAME | `_acme-challenge.kebabstack.dev.icp2.io` |

The apex requires a DNS provider that supports an appropriate alias/flattening
mechanism; an ordinary apex CNAME is not universally supported. Coordinate any
conflicting proxy/certificate configuration **for this domain** with the DNS
operator. Do not modify unrelated domains or security settings.

Validate, then register, using the current official domain service:

```sh
curl -fsS https://icp.net/custom-domains/v1/kebabstack.dev/validate
curl -fsS -X POST https://icp.net/custom-domains/v1/kebabstack.dev
curl -fsS https://icp.net/custom-domains/v1/kebabstack.dev
```

Wait for `registered`, then verify HTTPS, both languages, assets and the domain
declaration at kebabstack.dev. DNS configuration alone does not register the
domain. These commands and records are a procedure, not evidence that any DNS or
registration change has been made. No `www` domain is claimed or configured.

See the [official custom-domain guide](https://skills.internetcomputer.org/.well-known/skills/custom-domains/SKILL.md).

## Later releases and rollback

Bump `website/package.json`, its lockfile and the explicit `service:version`
metadata in `website/icp.yaml` together; add a dated entry to
`website/CHANGELOG.md`. The build copies that version into both pages and serves
the same changelog. Review all claims against current, tested suite features.

Keep the deployed source revision and build hash with the private deployment
record. Build/test a new revision, then use the same production mapping and
authorized identity for an in-place website update. Keep the prior public
artifact so it can be re-synced if needed. Do not use `--mode reinstall` for
routine content changes. Upstream recipe changes need separate review.

This independent static website has no Kitchen recipe and no format-2 suite
rollout. Any future changes to the application suite still follow
`kitchen/INSTALL.md` and its publication/update executor.

## Enable Crumbs for kebabstack.dev

Create `.analytics.local.json` beside package.json (gitignored):

```json
{
  "tracker": "https://analytics.example.org/tracker.js",
  "endpoint": "https://YOUR-BACKEND.icp.net/api/v1/events",
  "site": "kebabstack-dev",
  "retentionDays": 365
}
```

Copy the exact tracker URL, endpoint and website ID from Crumbs → Settings → Tracking script.
Confirm domain, collection and retention under General; reflect later retention
changes here and rebuild the notice. No API or reporting key belongs in this file.
Without it builds omit tracking and retain the analytics-free notice. Malformed
configuration fails the build. Keep the local configuration with the private
release record, not the public repository.

The production loader is limited to HTTPS kebabstack.dev, respects DNT/GPC before
loading the tracker and enables outbound/download events, not form or hash-route
tracking. German and English share the same website ID. `Explore: AppName` and
`Pilot: Download` are stable event names in both languages. Anchor selection does
not create extra pageviews; the default File Download event is a separate metric
from the pilot goal, not an additional download to sum.

The build permits only the exact Crumbs tracker URL in script-src and the exact
collection URL in connect-src. No wildcard, unsafe-inline or reporting API access
is added. Local JSDOM tests stub network delivery. Never run test payloads against
the live collector. After an authorized release, visit each real language page
once and check Crumbs Overview for the corresponding paths. These genuine smoke
visits will be part of the pilot traffic.

Analytics remains an alpha pilot. Cookie-free collection is not a legal
certification or an automatic consent exemption; see `crumbs/PRIVACY.md` and the
operator's actual site policy. Product demos do not read private analytics.

