# Changelog — Doku

## [0.2.0] — 2026-10-21

- Create articles directly in Doku and propose edits without a Desk ticket, using the existing WYSIWYG editor and explicit review. Existing Desk drafts retain their source permission checks.
- Reviewers and admins can share one published version with external readers, with an optional password, 1–3,650 days of validity or no expiry. Default validity is seven days; later article changes are not included automatically.
- Compact random links, copy controls, named link management and idempotent revocation. Public views show no company navigation, draft, author identity, ticket or version history.
- Password proofs use a per-link salt and PBKDF2-HMAC-SHA256 (600,000 iterations); only the proof verifier is stored. Ten failed attempts per link per minute are allowed. Expiry and revocation are checked by the backend; copies already made cannot be recalled.
- Preserve existing content and permissions through an additive, stable-compatible upgrade.

## [0.1.1] — 2026-10-21

- Correct the install recipe to use the existing installer’s supported Hub dependency. Desk 0.37.0 is checked by the operator before installation. The published 0.1.0 recipe was blocked before app creation; its files remain immutable.

## [0.1.0] — 2026-10-21

- First alpha milestone: confirmed internal Desk solution → saved WYSIWYG proposal → human-approved documentation change.
- Central Reader, Author, Reviewer and Admin roles; source access checked through Hub and Desk. No default employee access.
- New and existing articles, explicit save, source/current-version review, search and immutable published history. Stale edits, source changes and reopened tickets block publication; repeated publication does not create duplicate versions.
- Locally bundled Tiptap editor and canonical open-book mark with shared sign-in, navigation and semantic colours. One internal library; images, spaces, AI proposals and Slack reminders are planned.
