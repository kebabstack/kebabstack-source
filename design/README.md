# Kebabstack Brand & Product System

**Version 1.2.0 · 23 September 2026 · Normative target for new and revised work.**

Less work. More confidence. Kebabstack should remove repetitive IT work, help
operators automate and extend the suite, and make state, responsibility and
consequences unambiguous.

[Browse the standard](index.html) · [Kebabstack logo](index.html#brand) ·
[Buttons](index.html#buttons) · [Menus & tabs](index.html#menus) · [Workspace composition](index.html#workspace) ·
[Measured UI reference](UI-REFERENCE.md) · [Read all rules](STANDARD.md) ·
[Review checklist](REVIEW-TEMPLATE.md) · [Adoption plan](ADOPTION.md) ·
[Permanent logo library](logos/README.md) · [Changelog](CHANGELOG.md)

The standard covers visual identity, design tokens, navigation, layouts,
components, forms, data, workflow logic, permissions, SSO, automation, AI,
privacy, notification design, on-call, reporting, TV mode, accessibility,
localization, motion, performance and delivery across the complete suite.

## Apply it to a change

1. Name the user, task, current obstacle and observable success condition.
2. Read the relevant chapters in `STANDARD.md`; use their rule IDs in reviews.
3. Reuse the shared foundations and choose a page/interaction pattern.
4. Design the actual roles, states, exceptions and recovery path, not just success.
5. Copy `REVIEW-TEMPLATE.md` into the module's review record and attach evidence.
6. Update help/changelog, run required checks and record remaining gaps.

**Must** is an acceptance requirement. **Should** is the default with a documented
reason for deviation. An exception to a must rule needs an owner, scope, reason,
compensating measure and review date. It does not permit weakening access control,
misrepresenting results or bypassing the repository's deployment rules.

## Source of truth

| Source | Responsibility |
|---|---|
| `standard.json` | Normative rule text, stable IDs and verification prompts |
| `tokens.json` | Target semantic tokens, component dimensions and approved contrast pairs |
| `brand/registry.json` | Suite skewer, wordmark specification and generated variants |
| `adoption.json` | Stage-two review order and acceptance gates |
| `site/` | Documentation UI source; examples are clearly labelled, fictitious demos |
| `logos/registry.json` | Existing permanent product marks, separately versioned 1.0.0 |
| `../hub/dist/tokens.css` | Canonical generated runtime tokens |
| `../hub/dist/components.css` | Shared workspace controls and navigation measures |
| `runtime/sync.mjs` | Generate runtime values and check identical app copies |
| `../sdk/js/hub-client.js` | Canonical runtime client and navigation |
| `../docs/APP-PERMISSIONS.md` | Exact central permission contract |

The normative standard does **not** claim every workflow is accessibility-certified.
The official app rollout now uses this palette and shared controls through one
runtime source. Read [the suite adoption record](reviews/2026-09-22-suite-standard.md)
for concrete checks, fixes and remaining manual verification. Lunch and other
third-party integrations keep their own design and directory contracts.

Examples on this site are design demonstrations, not a running job queue, a new
backend API, an AI integration or an automated compliance certification.

## Build and verify

```sh
npm ci
npm run design:build
npm run design:check
npm run brand:check
npm run runtime:sync
npm run runtime:check
```

The generator emits `design/index.html`, `design/standard.css`,
`design/standard.js`, `design/reference-tokens.css`, `design/STANDARD.md`,
`design/ADOPTION.md` and self-contained copies under `hub/dist/design/`.
The existing `/design/logos/` route remains intact and links to the full standard.
Do not hand-edit generated output. No remote font, tracker, authentication,
production data or secret is needed to read the standard.

Preview from a local checkout with `python3 -m http.server --bind 127.0.0.1 4199` and
open `/design/`. The same static documentation is packaged in the next Hub
release; building or previewing it does not deploy that release.

Changing rules or tokens requires a design version/changelog update. Runtime
adoption separately requires the affected module release and the checks in
`AGENTS.md`. The logo registry version changes only when its own contract changes.
Use `npm run design:check` in CI to prevent source/served-copy drift. Run all
app/runtime checks required by the files actually changed.

## Accessibility and portability

WCAG 2.2 AA is the acceptance target; this is not a certification. The rules and
examples use the [W3C quick reference](https://www.w3.org/WAI/WCAG22/quickref/).
Automated checks cannot replace keyboard, zoom, screen-reader and real-task review.
The files are ordinary, MIT-licensed repository content suitable for the future
sanitized public repository. Keep examples fictitious and production evidence in
private operator records.
