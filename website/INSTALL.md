# Product website — static hosting installation

This module publishes only the static marketing website. It is separate from
Kitchen and the application suite. It neither upgrades the suite nor publishes
its source. Target domain: **kebabstack.dev**. Version: **0.5.11**.

## Hetzner Webhosting and GoDaddy DNS

Use a separate document root for this domain so other hosted websites are not
overwritten. Add the domain as an external addon: registration remains at GoDaddy.
Build locally and upload only the contents of `dist/`, including hidden hosting
configuration files. Do not upload source, node_modules, credentials or Git history.

Before switching nameservers, export the complete Cloudflare zone and prepare the
GoDaddy zone. Preserve MX, SPF, DKIM, DMARC, verification and unrelated subdomain
records. Obtain web A/AAAA targets from the actual Hetzner hosting account.
Remove conflicting old web records only as part of the cutover. Check DNSSEC/DS
state and arrange a valid certificate before routing visitors: .dev requires HTTPS.
Verify both languages, guide routes, redirects, security headers and a true 404.
Keep the old hosting and DNS zone available until propagation and rollback checks
are complete. Domain booking, DNS changes and upload require operator access.

`dist/.htaccess` supplies Apache headers, production HTTPS/canonical redirects,
no directory listing and a true 404 page. Include this hidden file in uploads.
`_headers` is retained for the legacy static-canister recipe.
The Cloud Engine instructions below are retained for legacy deployment/rollback.

For subsequent static releases, review a clean commit, run the build and tests,
retain the exact artifact and SHA-256 manifest privately, then upload into a new
release directory. Verify it before changing the domain document root. Keep the
previous directory for rollback. Never publish the upload ZIP in the document root.
Use a deployment account restricted to this website for any later CI upload;
store its credential in the hosting deployment environment, never in source.
CI deployment is not enabled by this migration's source alone.

If mail is hosted elsewhere, disable local mail delivery for this addon domain
without changing the parent website's mail settings. After DNS cutover, verify
certificate auto-renewal in konsoleH; a successful one-time DNS challenge does not
prove automatic renewal. Configure and verify a certificate for `www` before
adding that hostname to DNS.

## Build and inspect

Use Node.js 22.22.2 or a newer supported version and the repository's pinned
dependencies. Hetzner deployment needs no ICP CLI or identity. The optional legacy
canister recipe uses `icp` 1.4.0 and `@dfinity/static-site@v0.3.3`.

```sh
# repository root
npm ci
cd website
npm ci
npm run build
npm test
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
   not collect forms. No analytics tracker is loaded; infrastructure may log access.
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

No Hub connection,
login or cycle top-up is required by this website. Engine
infrastructure is still billable. Do not treat `icp build` as a deployment.

## Legacy canister custom domain (not the Hetzner DNS configuration)

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

## Legacy canister releases and rollback

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

## Website analytics

Tracking is removed in 0.5.11. Old `.analytics.local.json` files are ignored.
The site retains only the local appearance preference. Hosting access logs are
managed separately by the infrastructure provider.

## Contact forwarding

The website links to `hello@kebabstack.dev`. Provision and verify its destination
privately with the existing mail provider before publishing this link. Retain existing
web records and inspect conflicting mail records before enabling routing.
Sending from the public address is separate from receiving/forwarding email.
Check an incoming message from a different sender; DNS records alone do not prove
mailbox delivery. The recipient address must not be committed to public source.
