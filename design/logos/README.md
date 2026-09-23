# Kebabstack product logos

**This is the permanent product-logo standard.** The thin line marks on kebabstack.dev 0.2.2 were approved on 22 September 2026. The website and the applications now consume the same registry; neither is a separate design authority.

Open [the visual library](index.html). Download [SVG originals](svg/) or [128 px PNG exports](png/). All files and rules are portable repository content, including in the sanitized public source export.

| Product | Fixed symbol |
| --- | --- |
| Hub | People |
| Desk | Ticket |
| Assets | Laptop |
| Trust | Shield with check |
| Contracts | Folded document |
| Forms | Clipboard |
| Watch | Globe |
| Crumbs | Bar chart |
| Kitchen / Update service | Layers |
| Vault / Backups | Archive |
| Phone (planned) | Phone |
| Kebabstack MCP | Spark |
| SDK | Code brackets |
| Ship the Bug | Line bug |

The original website supplies the product paths and the supporting symbols. Ship the Bug extends that family using the same drawing rules. A mark for Phone reserves its identity; it does not mean the product is released.

## Drawing and use

- 24 × 24 viewBox; 1.6-unit strokes; round caps and joins; no filled illustration, gradient, shadow, emoji or coloured app tile.
- Preserve the registered path, proportions and internal spacing. Do not substitute a similar icon from another library.
- Sage `#77826b` is the default. Light sage `#b5c2a7` supports dark surfaces. Inline marks may inherit the approved text/accent colour for an active state, as on the website. A product never gets its own competing palette.
- Display at 20–24 px in navigation, 26–36 px in application headers, 36–48 px in catalogues. Keep at least four units of clear space around a mark; render SVG directly whenever possible.
- Show the product name beside a logo. Decorative SVGs use `aria-hidden="true"`; images beside names have empty alternative text. Icon-only links need an accessible name.
- The company logo and Kebabstack's coloured skewer identify the organisation and suite. They are not substitutes for an individual product mark. Company uploads and third-party application logos remain independent. Game illustration is content, not an alternative product logo.

## One source, generated outputs

Edit **[registry.json](registry.json)** only. After installing the pinned root dependencies:

```sh
npm ci
npm run brand:sync
python3 sdk/tools/sync-signin.py
python3 hub/tools/sync-sdk.py
npm run brand:check
python3 sdk/tools/check-sdk.py
```

The generator writes deterministic SVGs, pinned-renderer PNGs, favicons, the Contracts mark alias, game source/build aliases, Kitchen pictures, Hub-served downloads, the embedded browser registry, Operations marks and the Hub's stateless logo module. Do not edit generated files. The shared browser SDK remains canonical under `sdk/js/hub-client.js`; synchronize its app copies after any change.

The Hub selects built-in logos from the validated central permission policy's **app identity**, never the display name, URL or a role inferred from an icon. Renaming a menu entry keeps its logo. Existing stored pictures are preserved but not displayed for those built-in products. Their picture controls are disabled, and the backend refuses overrides. Removing a picture cannot bypass this rule. External applications retain normal picture management. Logo selection grants no access and changes no directory or Lunch payload.

Kitchen packages the generated PNGs in immutable releases. Cloud Engine consoles use each application's local `/favicon.svg`, advertised by `__META_ICON_PATH`, with the verified frontend origin in `__META_BASE_URL`. Metadata identifies the main frontend; it does not replace company branding. Existing console settings are preserved during normal updates. Installer/bootstrap branding may need a separate asset update because the release store deliberately retains bootstrap files.

## Adding a product

1. Assign one stable product ID and one recognisable symbol in the registry. Reuse neither another product's identity nor its symbol.
2. Draw within this family and review the visual library at navigation size in light and dark mode. Update this table and the registry version for an intentional brand change.
3. Add generation targets for its favicon, source/build copies and recipe picture. Set `app.id` when mounting the shared topbar. Register its central permission identity independently; a logo is not authorization.
4. Add its website mapping and console metadata. Bump the affected module versions and changelogs, generate bindings only from compiled source if relevant, and run the release checks.
5. Publish and deploy the identical tested bundle through Kitchen. Verify the actual app header, sign-in target, Hub menu, Updates catalogue, favicon and console icon. Do not silently rename or replace established logos in later redesigns.

`npm run brand:check` is part of local/CI checks and the release packer. It fails when a generated surface drifts from the registry. A reviewer still needs to check new surfaces and any deliberate registry change.

For IT operators this removes per-app picture maintenance. For a company it gives employees a stable visual identity across sign-in, navigation and administration; no monetary saving is claimed.

For an existing company, run `node kitchen/tools/sync-console-brand.mjs --kitchen INSTALLER_ID --identity OPERATOR` after the frontend rollout. It first verifies all actual logo files; `--apply` then reconciles only logo metadata and checks that unrelated settings survive. See the [operator guide](../../kitchen/INSTALL.md).

## Complete product standard

This logo contract remains version 1.0.0. The broader [Brand & Product System](../README.md)
defines the visual, interaction and behavior rules for the whole suite. Browse
[the full standard](../index.html) for tokens, navigation, components, workflows,
SSO, privacy, accessibility and the staged app review plan.
