# Doku first milestone — product review

- Standard: 1.2.0; logo registry 1.1.0, existing marks preserved.
- Candidate: Doku 0.1.1, Hub 0.44.0, Desk 0.37.0; isolated `codex/knowledge-milestone`.
- Task: reuse a resolved internal Desk solution as a reviewed documentation change.
- Scope: one internal library, manual proposals and explicit approval. AI, Slack
  reminders, spaces and attachments are planned, not active in this milestone.
- Review: 21 October 2026, local synthetic company and isolated PocketIC canisters.
- Status: deployed and release-verified (Doku 0.1.1, Hub 0.44.0, Desk 0.37.0); complete accessibility certification remains partial.
- Rules: PURPOSE-02/03/05, IDENTITY-01/04, NAVIGATION-06, LAYOUTS-07/08,
  GOVERNANCE-07, permission/source freshness and review/audience requirements.
- No baseline task-time measurement or quantified savings claim.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task and completion | Pass locally | Actual Desk and Doku canisters: confirm solution, follow handoff, edit/save, approve, read published article |
| Positive and negative roles | Pass locally | Reader/author/reviewer/admin, forged token, missing Desk staff rights, source revocation |
| Direct entry and session boundaries | Partial | Local deep link with real app session; live company sign-in screen loads without JavaScript errors. Personal production SSO was not exercised: the deployment owner principal has no personal portal session. |
| Loading, empty, stale and errors | Pass locally | Explicit empty library, source failure, save errors and stale publication; no empty-success replacement of evidence |
| Retry and concurrent writes | Pass locally | Same request ID, changed request inputs, concurrent saves/publications, stale article, reopened source, reconfirmed solution |
| Input/editor/save/review | Pass locally | Locally bundled Tiptap; formatting and paste sanitization; backend schema, depth and size bounds; source/current-version review; audience confirmation |
| Lists/search/history | Pass locally | Search and bounded cursor API; immutable old version survives second publication and populated restart. 34-article pagination/search boundary and a ~42k-character guide; maximum catalogue capacity not certified |
| Canonical foundations | Pass | Registry-generated open book; existing icons unchanged; canonical SDK/tokens/components; brand/runtime/design checks |
| Initial viewport and controls | Pass locally | Calm library, two-column editor/source review, one-column narrow layout; no decorative product tile |
| Light/dark, 320px, desktop | Pass for recorded viewports | Browser 1280×800, 800×900, 320×740 and 1280×440; no horizontal overflow. Full assistive-technology and 200% text-only zoom certification outstanding |
| Real scroll containment | Pass | Wheel scrolling on a long editable document; global host stays at viewport top at all four sizes. Formatting toolbar stays below it |
| Keyboard/focus | Partial | Labelled controls, editor keyboard support, focus styles and toolbar semantics; full screen-reader audit outstanding |
| Privacy/retention | Explicit | No ticket body/internal notes copied. Drafts need Desk access; publication intentionally shares with all library readers. Retention/deletion not yet provided |
| Source freshness | Pass locally | Hub checks both app memberships and connector binding around source await; Desk requires current lease and internal source; publish checks source/article/proposal revisions |
| Notifications/automation | Not implemented | No AI/Slack claim, no silent auto-publication; Desk's separately released assistance remains intact |
| Help and documentation | Pass | README, INSTALL, served guide/changelog, permissions and release recipe describe actual alpha bounds |
| Representative task repeat | Pass locally | Browser flow repeated after frontend fixes; backend run on fresh and populated prior release |
| Release | Pass | Exact format-2 packages published; Hub/Desk updated and Doku installed through the shared executor. Doku verification confirmed backend, frontend and sign-in configuration; central permission enforcement and canonical console logo checked live |

## Findings addressed

- Shared Desk person context initially listed Doku as an unavailable source. Doku
  is now excluded until it implements that projection; this is not a health failure.
- Numbered-list JSON includes a nullable `type` attribute. Validator and actual
  editor grammar now agree, including nested quote/list blocks; regression retained.
- Editor editability toggles no longer emit a false content-change event after saving; the real browser regression covers publication immediately after save.
- Save freezes editing and formatting until confirmed, and ignores stale UI replies
  after navigation. A changed source never silently rebases a saved proposal.

- Initial 0.1.0 installation was blocked before app creation because the existing installer only supports Hub/Kitchen dependencies. Doku 0.1.1 uses the supported Hub requirement; Desk 0.37.0 was checked live before installation.
- A fresh dependency install exposed a test-only prototype comparison in editor attributes. The assertion now compares the serialized attribute values; formatting and paste-sanitization checks pass.

## Delivery boundary

Published material is a deliberate audience expansion; reviewers explicitly
confirm the audience. Self-approval is allowed and documented. The first release
has no restricted spaces, automatic deletion, import/export, images, AI matching,
Slack reminders or complete accessibility certification. These limits are visible
in the app guide. No production ticket was created for testing.
