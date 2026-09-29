# Website: persistence as an operator benefit

- Standard: 1.2.0; product website 0.5.3; reviewed 29 September 2026.
- Audience and task: an IT operator or buyer evaluates what the Cloud Engine
  foundation changes in daily operations and future extensions.
- Previous obstacle: the technology section described platform layers before
  explaining the practical benefit. No task-time or savings measurement exists.
- Intended outcome: understand that core application state needs no separate
  SQL service, and survives compatible upgrades; understand the remaining work.
- Rules: PURPOSE-02/04, WRITING-01/02, NAVIGATION-06, ACCESSIBILITY-02,
  GOVERNANCE-07. This is a scoped marketing-content review, not app certification.

## Acceptance evidence

| Gate | Result and evidence |
|---|---|
| Primary task and outcome | Pass: benefit-first heading, code/state diagram, three operator outcomes, optional technical explanation and direct sources. |
| Permissions, sessions, edits, filters, notifications | Not applicable: static public information; no business state, login or new input is introduced. |
| Static fallback and failure | Pass: explanation and source links are ordinary HTML; native details works without application JavaScript. Existing eight-page static fallback tests pass. |
| Canonical identity and measures | Pass: existing product marks and shared semantic tokens; no new palette, logo or runtime override. Brand, design and runtime checks pass. |
| Assembled surface | Pass within scope: existing section and anchor, one diagram beside three benefits, one disclosure. No second navigation, primary action or simulated customer result. |
| Responsive visual review | After-change review at 1280 × 800 and 800 × 800, light/dark; German dark and English light at 320 × 740; English at 1280 × 600. No horizontal page overflow at 320 or 1280. Long German labels wrap. Private rendered evidence retained with release receipt. |
| Scroll and keyboard | Pass: actual scrolling at 320 × 740 and 1280 × 600 retains the header at viewport top 0. Native disclosure opens with Enter. Mobile navigation reaches the existing section and closes after selection. |
| Wider accessibility | Partial: semantic heading/figure/list and native disclosure inspected, shared focus/color styles retained. No new animation. Screen-reader certification, 200% text enlargement and additional browser engines were not performed. |
| Privacy and audience | Pass: no new tracking, external media, customer data or connection. Existing ignored analytics configuration and exact destination CSP retained. |
| Claim sources and scope | Pass: `website/CONTENT.md` maps statements to persistent actors, update executor and official Motoko documentation. Core apps and compatible upgrades are explicitly scoped; backups, recovery, migrations and platform dependencies remain visible. |
| Documentation and release | README, bilingual sovereign-IT guides, evidence map, version metadata and changelog updated. Website build and all 16 existing smoke tests pass. |
| Representative task repeated | Pass: navigate to technology in both languages, read benefits, expand explanation by keyboard, inspect source links. No usability study or quantified effort reduction claimed. |

## Findings and boundaries

The prior section was reviewed from source, not captured as a rendered before
image. Screenshot evidence is after-change evidence only. The initial homepage
composition, app explorer, navigation and data-handling behavior are unchanged.
This review does not claim full-site accessibility certification.

Persistence is attributed to the platform. The graphic explains a compatible
update; each application's data belongs to its own canister. It is not a live
status display, suite-wide transaction, migration test or backup guarantee.

Production deployment and exact served-file verification are recorded in the
private website release receipt. No suite backend or Kitchen release is changed.
