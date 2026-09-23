# Official app adoption — 22 September 2026

Standard 1.1.1; shared runtime adoption. Scope: Hub, Desk, Assets, Contracts,
Forms, Trust, Watch, Crumbs, unified Bug, and the Kitchen bootstrap. Vault is
operated through Hub. Lunch and external applications are excluded.

## Implemented

- One semantic light/dark palette, readable UI typography, canonical suite and
  product marks; paired foreground/background colours on actions and avatars.
- Common menu, tab, button, field, focus and panel measures, shared app switching,
  account/notification panels and sign-in waiting/retry states. Company logos and
  external app icons remain distinct. Existing registered public/guest scopes stay
  separate from administrative navigation.
- Contracts: remove the duplicate product masthead and retain workspace context;
  align the navigation rail and use forest styling for its spend summary.
- Forms: separate primary creation/import from secondary tools, distinguish draft
  preview/public opening, make form titles keyboard links and fix narrow-list and
  option-editor overflow. Avoid changing question/response or sharing semantics.
- Assets dealroom, Desk public support/status and Crumbs shared reports inherit
  semantic colours and control styling. Bug retains its deliberate visual game
  exception; shared account/navigation chrome follows the suite.
- Fix app-menu outside-click focus stealing and cancel pending focus after panel
  close/destruction. Regression covers successful dismissal and Escape restoration.

## Evidence and release gates

Local validation completed: all 13 pinned module builds and committed stable
signature checks; frontend smokes for all official apps and Kitchen; SDK focus
and sign-in regressions; 166 backend security tests passed with no failures.
The 28 historical-baseline cases skipped by that default run are not counted as
passes. Release validation separately supplies the deployed baseline to populated
packaged upgrade and Lunch/permission tests.

Browser review covered synthetic desktop workspaces for Hub, Desk, Contracts,
Forms, Assets, Trust, Watch and Crumbs, light/dark examples, the sign-in waiting
state, the setup screen and narrow navigation/list layouts down to 320 px. Desk
uses a scrollable mobile navigation strip instead of squeezing every section
into overlapping labels. No production business records were edited for QA.

Use the module frontend smokes across their existing employee, viewer, editor,
agent, admin and guest fixtures. Shared SDK tests cover deep links, duplicate
sign-in, failure/retry, ticket scrubbing and menu focus. Browser review uses only
synthetic records; source/asset checks enforce identical runtime and logo copies.
Build every affected pinned backend, compare with the committed stable signature,
and test populated **packaged** upgrades and central permission/Lunch preservation
before deploying through the shared Kitchen executor. Operator logs and production
metadata remain private outside this repository.

This is a cross-suite visual/interaction rollout, not a claim that every rule or
workflow has been manually certified. A real company IdP round trip, full screen
reader review, 200% text review of every workflow, and exhaustive translated-label
coverage remain separate checks. No measured labour-saving claim is made.
