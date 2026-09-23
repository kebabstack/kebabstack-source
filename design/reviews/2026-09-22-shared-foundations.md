# Shared foundations — adoption wave 1

- Standard: 1.1.0.
- Source inspected: `5124ef2`, SDK 0.12.2, Hub 0.31.4.
- Date: 22 September 2026.
- Status: **Gap found. Initial source review and one interaction reproduction.**
- Scope: shared navigation, company sign-in, semantic tokens and suite identity.
- Primary task: enter the intended tool, switch tools and resume work without
  relearning controls, losing focus or seeing a misleading sign-in state.
- This record starts step two. It is not a shipped redesign or an accessibility
  certification. Application-specific workflows remain to be reviewed.

## Findings and implementation order

| Priority | Rule | Evidence | Change required |
|---|---|---|---|
| P2 | ACCESSIBILITY-02, DELIVERY-03 | `sdk/js/hub-client.js`: clicking outside an open Apps panel calls `closeAll()`, which always focuses its opening button. A DOM reproduction opens Apps, focuses and clicks a separate text input: the panel closes but `document.activeElement.id` becomes `ks-menuBtn`, not the clicked input. | Separate dismissal from focus restoration. Escape and explicit close restore the trigger; pointer dismissal must preserve the new target. Guard deferred focus against a panel closed or destroyed before its timer runs. Add regressions for both paths. |
| P2 | VISUAL-01, VISUAL-06, DELIVERY-05 | `hub/dist/tokens.css` still defines orange actions, warm brown surfaces and monospace display type. Hub, Assets, Trust and Watch override only parts of this with forest/paper values. Contracts has a separate neutral/blue palette, Desk defines `--desk-*`, and the Hub employee workspace defines `--ws-*`. | Map runtime roles to the approved semantic tokens at the canonical source. Remove redundant overrides after comparing real surfaces in both themes. Keep print styles and purposeful status colours; do not delete every override mechanically. |
| P2 | IDENTITY-02, IDENTITY-03 | The SDK's `SKEWER_SVG` and `sdk/ui/signin.html` retain the older ring-handle skewer. `design/brand/registry.json` defines the approved website geometry without that ring. | Generate suite marks from the registry alongside product marks, including shared sign-in and Hub sign-in. Preserve company logos and external app icons. Verify the rendered mark, not just favicon files. |
| P2 | VISUAL-01, VISUAL-05, COMPONENTS-01 | `TOPBAR_CSS` has 36 px uppercase pill controls and hardcoded blue/orange `--ks-launch-*` palettes. Shared sign-in has another palette and distinct control styling. | Use measured shared controls, semantic colours and clear sentence-case labels. Default to 44 px targets, with only explicit dense exceptions. Verify long app names and narrow screens before applying app-page changes. |
| P2 | VISUAL-04, ACCESSIBILITY-01 | `.ks-avi` uses a variable accent background with fixed white initials. Apps change the dark accent independently. Notification badges similarly combine independently overridden tokens. | Introduce/use the approved on-accent foreground as a pair with accent; measure actual rendered contrast in light and dark. Do not treat a source-level colour inspection as a complete contrast audit. |
| P2 | ACCESS-04, ACCESS-05 | Shared sign-in already distinguishes checking, handoff, ready and retry; these controls and waiting-state rules are spread between shared markup, CSS, the browser client and Hub. | Preserve the established protocol while consolidating presentation. Test delayed checking, rejected tickets, deep links, duplicate starts, expired sessions and reduced motion. Do not replace the handoff with a visible Hub workspace. |

## Baseline evidence

- All nine application `hub-client.js` copies match the canonical SDK source.
- All nine application `tokens.css` copies match `hub/dist/tokens.css`.
- The inconsistency comes from competing definitions, not stale SDK copies.
- The focus reproduction used JSDOM and fictitious local data, no backend, no
  production account and no network calls. Result:

  ```json
  {"openedFocus":"ks-find","clickedTarget":"note","actualFocus":"ks-menuBtn","panelClosed":true}
  ```

- Existing sign-in and Hub handoff checks are available in
  `sdk/tools/signin.test.mjs`, `hub/test/auth-flow.mjs` and `hub/test/handoff.mjs`.
  The 12 shared sign-in/Hub handoff checks passed on this unchanged baseline.
  This is a baseline result, not a pass for the future migration.
- No live IdP login or full screen-reader review was performed for this initial
  adoption review. No task-time or labour-saving claim has been measured.

## First implementation boundary

Implement the common entry and navigation surfaces first: canonical tokens,
suite mark, topbar, app switcher, notification/account panels and sign-in. Keep
application task pages in the following waves; changing shared tokens requires
checking those pages for regressions even before their individual redesign.

Use the same shared client and permission contracts. Do not add app-local roles,
duplicate authentication, a second employee directory or automatic publication.
Lunch remains on its existing directory connector contract. HR/Finance and public
views keep their current scope; a visual cleanup must not expand access.

## Acceptance before a shared runtime release

1. Focus: Escape restores the opener; pointer dismissal retains the clicked
   control; closing or destroying a panel cancels pending focus. One panel at a
   time, keyboard search, empty/failed app list and expired sign-in remain usable.
2. Identity: the exact registered suite/product geometry appears in shared entry
   and navigation, with company and third-party branding preserved.
3. Presentation: light/dark, 320 px reflow, 200% text, long labels, reduced motion,
   actual foreground/background contrast and visible control/focus boundaries.
4. Journey: direct app entry, Hub launch and a deep link reach the intended
   authorized page; slow/failed handoff cannot expose actionable Hub content.
5. Synchronization: canonical browser client, sign-in markup/CSS and runtime
   tokens have identical generated copies; module versions and changelogs agree.
6. Release: frontend regressions, pinned builds, committed stable-signature
   compatibility, populated packaged upgrades, permission and Lunch preservation,
   then the existing Kitchen publication/update/verification process.

## Remaining waves

After the common foundation, review Hub operations, everyday Desk/Assets tasks,
response/reporting, Trust/Watch/Contracts, then Forms/Crumbs/extensions and the
marketplace presentation. Follow `ADOPTION.md`; do not mark an entire product
verified from its shared header alone.
