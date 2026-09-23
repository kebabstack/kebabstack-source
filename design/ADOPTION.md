# Adopting the Kebabstack product standard

Version 1.2.0. Shared visual foundations implemented across official apps. Workflow and accessibility evidence remains scoped to the recorded checks; this is not a blanket certification.

Step one defines the shared standard. Step two reviews and migrates actual apps.
The order below is a plan, not a claim that the work has already been done.

## 01 · Shared foundations

**Scope:** SDK, logos, tokens, sign-in, app switcher. **Status:** In progress.

One recognizable, accessible journey across the stack.

Verify shared palette, controls, suite mark, focus, sign-in, direct/deep-link handoff and role boundaries. Retain real IdP and assistive-technology checks as separate evidence.

See reviews/2026-09-22-suite-standard.md for the cross-suite visual adoption, regression checks and remaining manual certification boundaries.

## 02 · Hub & operations

**Scope:** Hub, Kitchen, Vault, Cloud Engine console. **Status:** In progress.

Understand access, automate work and operate the suite with confidence.

People → effective permissions → app confirmation; sync provenance; updates and partial recovery; snapshot/restore consequences; TV pairing, expiry and aggregate scope.

See reviews/2026-09-22-suite-standard.md for the cross-suite visual adoption, regression checks and remaining manual certification boundaries.

## 03 · Everyday work

**Scope:** Desk & Assets. **Status:** In progress.

Resolve requests and equipment work without duplicate entry.

Employee/agent/admin journeys; customer project boundaries; offboarding with inactive people; device return and external sale; next-action blockers and actual physical handover.

See reviews/2026-09-22-suite-standard.md for the cross-suite visual adoption, regression checks and remaining manual certification boundaries.

## 04 · Response & reporting

**Scope:** Desk on-call, customer support, status, HR/Finance. **Status:** In progress.

Coordinate incidents, schedules and defensible reporting.

Coverage, DST and swaps; acknowledgment vs delivery; customer/public audience previews; project scope; time review, compensation, release and export boundaries.

See reviews/2026-09-22-suite-standard.md for the cross-suite visual adoption, regression checks and remaining manual certification boundaries.

## 05 · Risk & commitments

**Scope:** Trust, Watch & Contracts. **Status:** In progress.

Understand the evidence and act before a problem becomes costly.

Posture score denominators and freshness; device deployment/recovery guides; unavailable DNS/certificate checks; actionable renewal deadlines and currency/report scope.

See reviews/2026-09-22-suite-standard.md for the cross-suite visual adoption, regression checks and remaining manual certification boundaries.

## 06 · Build & publish

**Scope:** Forms, Crumbs, SDK/MCP, Bug, website & marketplace. **Status:** In progress.

Create useful extensions and publish a credible, coherent product.

Form creation and guest scope; analytics empty/history states; embed guides and key scopes; AI evidence; game-specific visual exception; marketing truth; sanitized screenshots and docs.

See reviews/2026-09-22-suite-standard.md for the cross-suite visual adoption, regression checks and remaining manual certification boundaries.

## Runtime migration contract

`tokens.json` is the target reference. `hub/dist/tokens.css` stays the current
runtime authority until the shared migration is reviewed. Map existing `--ks-bg`,
`--ks-bg-card`, `--ks-fg`, `--ks-fg-secondary`, `--ks-accent`, `--ks-focus` and
related runtime roles to the reference semantics; remove redundant per-app
overrides only after comparison. `reference-tokens.css` is scoped to the design
documentation and is not a second application SDK.

Inventory each app override, check both themes and representative layouts, then
change the canonical runtime source and synchronize its copies. Use the existing
shared sign-in and client; do not rebuild permission logic in a design component.
Run role/state/frontend checks and the release checks required by the change.
Preserve directory/Lunch behavior, stable contracts and production deployment
placeholders. Ship through the existing reviewed release process.

## Acceptance checklist

- **Job & next step:** Name the primary role, job, next actor, blocker and completion evidence.
- **Authority & scope:** Test permitted and denied roles, inactive identities, direct URLs, API calls and guest/project boundaries.
- **State & recovery:** Exercise loading, empty, partial, stale, forbidden, error, retry, duplicate events and interrupted writes.
- **Forms & consequences:** Check drafts, validation, save behavior, concurrency, bulk scope and consequential-action preview.
- **Shared design:** Check canonical logos, semantic tokens, type, spacing, hierarchy, components, themes and full cross-app journey.
- **Accessible interaction:** Keyboard, focus, semantic structure, screen reader, contrast, 200% text, 320 px reflow and reduced motion.
- **Data & evidence:** Verify query/count/export scope, units, currencies, timezone, data freshness and source links.
- **Privacy & audiences:** Check data minimization, secrets, retention/cleanup evidence, public updates and TV/HR projections.
- **Words & setup:** Use consistent language, useful errors, translated-length labels and prerequisite → action → verify → recover guides.
- **Release & outcome:** Record before/after task evidence, module versions/changelogs, required tests, known gaps and deployment status.

## Priorities

- **P0:** Access bypass, secret exposure, destructive ambiguity or false completion of a consequential action. Blocks release.
- **P1:** Core task cannot be completed, material state is wrong, or keyboard/screen-reader users are blocked. Blocks the affected release until fixed or an explicit safe scope reduction is reviewed.
- **P2:** Avoidable friction, inconsistent hierarchy, duplicated entry or an unclear secondary state. Prioritize within the redesign wave.
- **P3:** Cosmetic polish with no material task impact. Bundle with the affected surface.

## Record evidence

Use [REVIEW-TEMPLATE.md](REVIEW-TEMPLATE.md). Record date, commit, module version,
role, data scope, viewport, theme and evidence per task. Do not substitute a
visual screenshot for authorization or data-integrity verification. Keep
production/customer evidence outside the public repository.

An exception records the rule, owner, reason, scope, compensating measure and
review date. A skipped or untested path is never passed. A verified surface can
still have explicitly recorded noncritical gaps; do not imply certification.
