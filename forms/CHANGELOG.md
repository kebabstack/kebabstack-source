# Changelog — kebab-stack forms

## [0.5.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes.

## [0.5.0] — 2026-09-22

- Separate primary creation/import actions from secondary settings, trash and help. Clarify draft preview versus the public form. Adopt shared themes, controls, navigation and sign-in without changing form/response permissions.

## [0.4.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.4.1] — 2026-09-21

- Session checks and Hub ticket redemption show a compact progress screen instead of presenting the company sign-in form again. Retry controls appear only when sign-in needs attention.

## [0.4.0] — 2026-09-17

- Added Hub-brokered support summaries for owned/shared forms and assigned reviews. Existing form permissions apply; submission answers, respondent identities and edit links are excluded.

## [0.3.1] — 2026-09-17

- Shared company sign-in screen and progress states match the Hub across all six tools. Session checks and ticket redemption lock the continue button; failures allow an explicit retry.
- New ticket attempts clear any previous local session before redemption, so a rejected ticket cannot reopen a different account’s old session. Deep links and public access routes are preserved.

## [0.3.0] — 2026-09-17

- App roles now come exclusively from Hub permissions. Removed local admin claims, email lists and role-group settings; deprecated mutation APIs refuse changes. Active Hub owners/admins and Hub-assigned app admins have full app access. Employees keep their own and explicitly shared content; Watch requires an explicit viewer/admin assignment by default. The existing 60-second directory lease bounds revocation. App admins can access all content, including personal workspaces/forms; employee-to-employee isolation remains enforced.
- Configure the central policy in Hub before upgrading this app; an absent or incompatible policy denies sign-in. Historical local role settings are retained only for migration inspection.

## [0.2.1] — 2026-09-06

Fixes from the full audit (`KEBABSTACK-AUDIT-2026-09-06.md`).

### Fixed
- **Public rate window counts accepted submissions only.** Before, 600 calls with any slug (even an invalid one) blocked every form for five minutes (FO-01).
- **Answer cap is 64 KB in bytes**, not characters (which allowed up to 256 KB), and the canister keeps a total answer budget (≈ 256 MB) instead of relying on the 50 000-submission cap alone; counted once after the upgrade (FO-02).
- **Preview (`?p=1`) works again** — the fill page now loads the signed-in person for previews (FO-03).
- **Restore from the trash keeps shares**: the check used addresses where shares are ids since 0.2.0 and dropped every share (FO-04).
- `hub_upsert` uses the SDK's `upsertRows` (SDK 0.4): a re-issued address ends the previous holder's sessions and never downgrades a real id.

## [0.2.0] — 2026-09-06

### Changed
- **People are ids.** Form owners, shares, assignees, ratings and note authors now store the hub's stable person id (`p_…`) instead of the address (hub ≥ 0.17, SDK 0.3). A colleague's address can change or be re-issued; their forms and their reviews stay theirs and never appear with the address's next holder. `whoami` carries `id`; every `SubView` carries `people` = (id, current address, name) for the ids it mentions; `getForm.shares` still hands the share editor (address, role, name). Pickers, `assignSubmission`, `setShares` and the hub's offboarding calls keep speaking addresses; a share echoed back without an address (a former colleague) is dropped instead of refused.
- Submission notifications to a former colleague whose address moved on are skipped.
- **One-time migration** right after this upgrade: stored addresses are rewritten to ids via the hub; addresses the hub never knew become `legacy:<address>` and still render. Signed-in writes answer "people ids are being migrated — try again in a minute" for the few seconds it takes; public submissions are unaffected. Requires hub 0.17 first.

## [0.1.0] — 2026-09-06

### Added
- First release of **forms**, ported into the stack from a working standalone tool (form builder with sections, question types and branching; anonymous public links with optional respondent editing, deadline and cap; review pipeline with ratings, assignee and notes; insights and CSV export; sharing as editor/viewer; Google Forms / text-outline import; 90-day trash; submission notifications).
- Built on `mo:kebab-hub` like the other apps: hub ticket sign-in, 60-second complete-directory lease with 30-second pulls, roles from the hub (owners/admins run the settings, everyone in the directory builds and reviews what they own or were given), `claimAdmin` for hub owners/admins, the shared topbar, directory pickers for sharing and assignees (no more full directory list in the browser), `hub_notify` on new submissions, `hub_ownedObjects`/`hub_reassign` for offboarding.
- Respondents never touch the session lane: the public fill page renders without sign-in or topbar and shows the company name.
- Every write answers `{ ok; detail }` in plain language; `getForm` returns form + meta + shares in one call; a sample form for the first look.
