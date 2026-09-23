# Website — validation

## 0.3.1 — suite-level entry, app-level examples

2026-09-22. Scoped follow-up to 0.3.0: replace the hero's duplicate Desk case
with the suite map and a stack-level primary action. Applicable design rules:
PURPOSE-01, IDENTITY-01/02, NAVIGATION-01/04/06, VISUAL-01/06,
ACCESSIBILITY-01/02 and DELIVERY-04/05.

- Hero uses canonical marks and shared runtime tokens. No new capability,
  metric, customer record, backend method or external request is introduced.
- Product links select the corresponding existing app tab and move focus into
  its panel. Pointer entry to Crumbs and keyboard entry to Desk verified in the
  browser; the SDK link is a regular anchor to the extension explanation.
- Desktop light theme and 320 px German/English reflow inspected. Mobile links
  are at least 72 px tall. Both themes remain legible; document width equals
  the viewport. The header stays at top 0 while scrolling to and from examples.
- Existing eleven website smokes, thirteen shared design checks and fourteen
  canonical logo checks pass. No suite backend/SDK/state changes.
- The earlier 0.3.0 wider app/demo coverage remains recorded below. This scoped
  review does not claim a full accessibility certification or business workflow
  retest. Deployment and exact live artifact checks are recorded privately.

## 0.3.0 — shared design and evidence-led product scenarios

2026-09-22. Preserves the previously deployed 0.2.4 navigation fix and its
release record; the foundation checkout initially contained 0.2.3.

- Pinned root and website npm dependencies installed. Website smoke suite:
  11 passing tests covering both languages, no-JavaScript content, links,
  downloadable files, CSP-compatible markup, app deep links and keyboard
  selection, menu/Escape focus, local scene controls, arithmetic, appearance,
  canonical logo geometry and byte-identical runtime tokens.
- Shared design checks: 13 tests pass; 14 canonical product marks pass the
  brand checker. No SDK, app frontend/backend or permission code changed.
- Real browser checks: every app preview at 320 px in German and 1280 px in
  English; document width equals viewport width throughout, app strips have
  equal client/scroll heights (66 px at 320), global header remains at top 0.
  Inspected 390 px analytics and 320 px Trust in light/dark themes, changed
  Desk steps and Crumbs periods, and switched language preserving the app.
- Short 640 × 360 viewport: header remains visible while scrolling; open menu
  and appearance control fit inside the screen. This checks an equivalent
  narrow layout, not native browser text-zoom or full accessibility certification.
- Content sources, illustrative records and metric definitions are recorded in
  CONTENT.md. No business records, live API requests or fabricated customer
  outcomes are published. Phone remains planned, current suite features alpha.
- This is a static website update with the existing certified-assets recipe.
  No Motoko business-state schema changed, so suite backend/security/permission
  tests are not a meaningful gate for this website-only release.

Publication receipts, the previous 0.2.4 artifact, exact 0.3.0 source/build hashes
and byte-for-byte live route checks are retained in the private deployment
record. Publication completion is reported separately after actual verification.

## 0.2.4 — app-navigation fix

2026-09-22. The local candidate was initially labelled 0.2.3. Before deployment,
read live source metadata and found the separately published 0.2.3 logo update
(`dd48db54c78aa4b3eec10acdc1c361e7ea204e49`). Preserved its website renderer
and identical shared logo registry, retained its changelog and advanced this
fix to 0.2.4. No application-suite source or deployment is changed.

- `npm ci`, `npm run build` and all seven existing smoke tests pass.
- Reproduced one pixel of vertical overflow at 792 px: the tab strip's client
  height was 67 px and its scroll height was 68 px. The active decoration
  extended below the tab, while the computed vertical overflow was `auto`.
- After the CSS fix, client and scroll heights match at 390, 792, 1280 and
  1440 px. Horizontal overflow remains available where needed; selecting Phone
  at 390 px scrolled the strip horizontally, with vertical position still zero.
- Arrow-key navigation from Phone to Crumbs works, with a visible inset focus
  outline. Reviewed the mobile rendering and restored the default viewport.
- Published with explicit user authorization from source
  `eb42cf605b21ef9da7da15f744f1885460869760`. Verified the installed Wasm hash
  and source/version metadata against the built artifact. All 14 HTTP routes
  match the local files on both kebabstack.dev and the canister hostname,
  including both languages, the real 404 response and declared security headers.
- Confirmed the live strip has no vertical overflow at 390 and 1280 px, while
  horizontal scrolling and keyboard focus still work. No browser warnings or
  errors. Kept the prior 0.2.3 artifact and new deployment receipts privately;
  existing domain configuration and other canisters remain unchanged.

## 0.2.2 — authorized production publication

2026-09-19. Published to the user's DFINITY Cloud Engine and registered
https://kebabstack.dev following explicit deployment and domain authorization.

- Deployed source `166d21a358a71a4648ddaa10415e8bb4252f9f75`; seven smoke tests
  pass. Verified the installed Wasm against the exact built artifact and read
  its private source/version metadata back from the running canister.
- Verified 14 routes at both the canister address and kebabstack.dev: 13 public
  files plus an unknown route returning the expected 404. All bodies match the
  generated files byte-for-byte; TLS hostname verification, CSP and nosniff pass.
- Domain service reports `registered`. Cloudflare has the gateway and ACME
  CNAMEs as DNS-only and exactly one canister-ID TXT record. Its previous mail
  records were retained; Universal SSL is disabled for this DNS-only zone.
- Browser-tested German/English, module selection and language switching with
  the selected app preserved on the public domain. No browser warnings/errors.
- Kept the production mapping and detailed deployment/verification receipts in
  ignored `website/.icp/` in both working copies. No operational IDs were added
  to tracked website sources. Other suite canisters were not deployed.

The following entries describe earlier local validation, before publication.

## 0.2.0

2026-09-19. Website content and explorer update only.

- `npm ci`, `npm run build` and all seven frontend/package smoke tests pass.
  Checks now cover nine modules, Desk on-call content, Crumbs collector scope,
  Phone's planned/concept labels and keyboard navigation through the new tabs.
- Browser-reviewed the Crumbs, Desk and Phone panels on desktop and at 320 px.
  Both languages select the correct panels; switching to English preserves the
  selected Phone panel. No page-wide horizontal overflow at 320 or 1280 px.
- Rebuilt the shared checkout's local preview with the reviewed website files.
  No canister deployment or DNS change was made for this content update. The
  static-site recipe is unchanged; its earlier validation is recorded below.

## 0.1.0

2026-09-19. This records local tests only; production and DNS were not changed.

- Installed pinned repository test dependencies with `npm ci`; this website's
  own lockfile has no dependencies and `npm ci` also succeeds in the module.
- Built both complete HTML pages using `npm run build`.
- Seven frontend/package smoke tests pass: both locales, static fallback,
  local links/downloads, metadata, tab selection/deep links/keyboard navigation,
  mobile menu/focus, public file allowlist, license bytes and domain declaration.
- Browser-reviewed desktop, tablet and phone layouts. Exercised module tabs,
  language switching with section preservation, mobile menu and Escape.
  Browser console reported no errors or warnings during these checks.
- Built the actual pinned `@dfinity/static-site@v0.3.3` canister using `icp` 1.4.0.
  SHA-256 of the compressed Wasm:
  `de8b914ecbaed8c3d9a66dba66a0a49b48d95691e37a64e3cd3d7c9768181b2d`.
- Deployed and repeated the deployment on an isolated local network, using a
  disposable CLI home and the local anonymous test identity. The canister's
  uploader accepted 13 assets and the response-header configuration.
- Compared served German/English pages, styles, script, domain declaration,
  pilot downloads and license byte-for-byte with the generated artifacts;
  all matched. Verified the restrictive Content-Security-Policy and an actual
  404 response for an unknown route.

No application backend, state schema, permission model, shared SDK source or
Kitchen package was changed. Motoko compiler/stable-signature checks and the
suite's backend authorization tests are therefore outside this change. These
website checks do not establish production readiness of the application suite.
