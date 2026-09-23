# Kebabstack suite identity

Version 1.0.0 · captured 22 September 2026.

The coloured skewer and **kebab-stack** lockup identify the suite. Product marks
are independently fixed in [the product registry](../logos/registry.json).
The written product name is **Kebabstack**; the visual wordmark has an orange
hyphen and no terminal dot, as on kebabstack.dev.

## Canonical source

Edit [registry.json](registry.json), then run `npm run design:build` and
`npm run design:check`. Do not hand-edit generated SVGs. This registry captures
the existing website header geometry unchanged; checks detect drift against that
website source and its optically adapted favicon. A future website migration
should import this registry and retain the same comparison coverage.

- [Light-surface SVG](mark-light.svg): dark rod, four fixed coloured layers.
- [Dark-surface SVG](mark-dark.svg): light rod, identical geometry and layers.
- [Square favicon](favicon.svg): existing 64 × 64 optical variant for 16/32/48 px.
- [Reusable HTML lockup](lockup.html): self-contained, no external font request.
- [Visual rules and measurements](../index.html#brand).

The transparent mark uses a **40 × 48** viewBox. Preserve its aspect ratio. The
header's mark box is **27 × 35 px**, with default SVG `preserveAspectRatio`; the
artwork is not stretched. The gap to the wordmark is **8 px**. Wordmark text is
**23 px, weight 700, tracking −1.1 px**, using the website's local UI font stack.
The text is live text, not a font-outlined print logo. For fixed print artwork,
prepare and review an outlined export from the chosen licensed font first.

Use a minimum standalone mark height of **24 px**. The smallest lockup uses
**18 px** text with the entire lockup scaled proportionally. Outside the mark or
complete lockup, leave at least **¼ of the mark's height** clear on every side.
No gradients, shadows, emoji substitutions, rotations, stretching or rearranged
layers. Layer colours stay `#ffb23a`, `#ff8a3d`, `#ff6b4a`, `#f0503c`.

The light lockup uses ink `#222a25`, paper `#f6f5f1` and hyphen `#d84b25`.
The dark adaptation uses surface `#202622`, rod/text `#f8f7f2` and hyphen `#ff8a3d`.
These brand colours identify the mark, not general UI action or status colours.
A mark beside a visible name is decorative; a standalone link needs an
accessible name such as “Kebabstack home”.

## Existing assets and adoption

`design/icon.svg`, `design/wordmark-light.svg`, `design/wordmark-dark.svg` and
`design/github-avatar.svg` predate the website geometry. They are **legacy**, not
additional approved choices. They remain temporarily for existing consumers;
new work must use this registry. Step two inventories and migrates app/runtime,
installer and other existing suite-brand surfaces with their own release checks.
This document does not claim that all deployed surfaces have already migrated.

Company logos remain company-owned branding. The Hub has its own people-shaped
product logo. Do not replace either with the suite skewer.
