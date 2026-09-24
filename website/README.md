# kebabstack product website

Version **0.5.2**. A standalone, bilingual product website intended for
**kebabstack.dev**, hosted on a Cloud Engine.

The site explains the working alpha suite, including Crumbs analytics and Desk
on-call response, Cloud Engines, the cost model and how an IT team can extend
the MIT code. The planned Phone companion for iOS and Android is clearly marked
as a concept that is not yet available. The MIT source is publicly available on GitHub; OpenCloud Marketplace integration remains planned. Product illustrations
use synthetic data and are labelled; they are not live dashboards or screenshots.

## Work locally

From the repository root, run `npm ci` for the pinned shared test tools. Then:

```sh
cd website
npm ci
npm run build
npm test
npm run preview
```

Open http://127.0.0.1:4177. German is `/`; English is `/en/`. Both are rendered
as complete HTML, including all module descriptions. JavaScript enhances the
app explorer and mobile menu; reading and language switching work without it.
There are no runtime packages, remote fonts or forms. The production website
uses the configured Crumbs tracker; unconfigured builds remain analytics-free.
The optional appearance choice is the only local-storage preference.

`src/scenarios.mjs` contains the bilingual product scenarios and shared example
analytics fixture. `src/content.mjs` contains the page translations; `src/build.mjs` renders the pages.
`public/` holds the shared CSS, progressive enhancement, domain declaration and
certified-assets header configuration. Only the generated `dist/` is published.
No internal operator documentation or repository history is copied into it.
The root MIT license is copied byte-for-byte. `dist/` is a reproducible output,
not an independently edited source tree. The build copies canonical
`hub/dist/tokens.css` byte-for-byte and derives the system dark theme from it.
The suite mark comes from `design/brand/registry.json`, product marks from
`design/logos/registry.json`. Never add a parallel logo or palette here.

See [INSTALL](INSTALL.md) for deployment and DNS, [CHANGELOG](CHANGELOG.md) for
release notes, and [content evidence](CONTENT.md) before changing product claims.
There is no application backend, Mops project, SDK copy or suite recipe in this
module; existing application deployments and stable signatures are unaffected.

## Before publication

Review the public copy and publisher/contact/privacy requirements for the actual
operator. No legal entity or contact address has been invented. Add the real
operator's required notices before a public launch. Public code links should be
added only after the sanitized repository is actually available. Deploying this
site does not publish the application source or submit it to a marketplace.

## Crumbs pilot

The production site records pageviews, referral/engagement metrics, app-explorer
choices and pilot downloads in the existing Crumbs website. Examples on the page
stay synthetic. No report key, user identity or form content is embedded.
See INSTALL.md for the ignored per-deployment configuration, exact CSP and live
verification. Local previews and canister-alias visits do not load the tracker.

## Search and sharing

The homepages link to complete German/English guides for sovereign IT, offboarding
and cookieless analytics. `src/guides.mjs` is their content source; the build emits
all routes, reciprocal metadata, sitemap and structured HTML data. `src/social.mjs`
renders the sharing image from canonical brand/token registries using the pinned
root build dependency. See [search visibility and operator steps](SEARCH.md).
