# Doku manual authoring and sharing — product review

- Standard: 1.2.0; Doku 0.2.0 on isolated `codex/knowledge-milestone`.
- Task: write a guide without a ticket, review it and give outsiders read-only
  access to one selected published version.
- Roles: author, reviewer/admin, reader, no Desk staff access, anonymous visitor.
- Review: 21 October 2026; synthetic company / real isolated PocketIC canisters.
- Status: local workflow verified; production Doku 0.2.0 updated and release-verified.
- Rules: PURPOSE-02/05, LAYOUTS-06, NAVIGATION-06, COMPONENTS-04,
  FORMS-01/02/05/06, ACCESS-02/06, STATES-04/06, DATA-03.
- No measured time/cost saving; no complete accessibility certification claimed.

| Gate | Result and evidence |
|---|---|
| Primary task / next actor | Manual Create article → Start writing → WYSIWYG save → reviewer publication → Share → anonymous read passes |
| Roles / scope | Backend checks deny readers/forged sessions/link holders staff operations. Manual drafts work without Desk rights; old Desk sources retain both app checks |
| Entry / error / stale states | Public route fetches only sharedInfo/readShared. Wrong password, revoked/unknown link, stale article, empty text and duplicate request input have explicit outcomes |
| Retry / concurrency | Same request ID returns same draft/link; changed inputs rejected; concurrent link requests create one link; old versions remain immutable |
| Save / audience decision | Draft save remains explicit. Publication and external sharing are separate explicit audience decisions |
| Lists / bounds | Internal pages retain bounded search/history. Link list capped at 100 per article; exact boundary and overflow exercised |
| Shared design | Existing canonical book mark, semantic colours, locally bundled editor, native dialog and controls; no added palette or app logo |
| Layout / themes | Browser at 1280×800, 800×900, 320×740 and 1280×440; modal fits viewport, content scrolls, no horizontal page overflow; light/dark screenshots |
| Real scroll | Existing Desk editor wheel test repeated at all four viewports; global bar and formatting stay visible. Public document scroll is tested; it intentionally has no company navigation |
| Keyboard / focus | Native labelled dialog, Escape and focus return to Share checked. Full screen-reader / 200% text-only zoom remain untested |
| Privacy | Only chosen title/body/version/dates public; no private source/history/author. Password input clears; page reload needs password again. No private app API fetched on public entry |
| Freshness / recovery | Backend expiry/revocation; open public page rechecks every 30 seconds/on return; copies cannot be recalled. Settings fixed per link; replace by revoke/create |
| Help / release | Source/served changelog, guide, README, INSTALL, central permission contract and recipe updated. Exact package and live checks recorded privately |

## Decisions and limitations

Seven days is the default; password protection is optional. Choosing Never explicitly
keeps a link active until revoked. Links grant access to one immutable published
version and can be forwarded by recipients. A compact capability in the URL fragment
is the scoped guest-access exception to NAVIGATION-03/FORMS-05; company sessions and
passwords never appear in the link. The public shell sends no referrer and requests
no indexing. This does not revoke copies or hide data from infrastructure operators.

The password form uses a per-link 600,000-iteration PBKDF2 proof; the backend stores
only its hash and enforces a bounded failed-attempt window. A malicious holder can
briefly lock other visitors out of that link. There is no custom short domain,
named-recipient authentication, reader analytics, automatic link-retention cleanup,
AI proposal generation or Slack reminder delivery in this release.

Native dialog scrolling is used for long settings/link histories. The current full
suite and packaged/live results must be read from the release receipt; passing local
UI tests alone is not a deployed or stack-wide verification claim.

A 180-character unbroken title reproduced a 6,548px-wide page at a 1,280px
viewport. Heading and library row wrapping now retain the viewport width; the
browser regression covers internal article, public article and library, along
with a custom two-day link.

Production: the same stamped artifact was published, updated with backend/frontend
snapshots and independently verified. The real anonymous unavailable-link route and
company sign-in screen passed browser checks; private creation, correct-password
reading and revocation used synthetic local canisters. No production business
records or sharing links were created merely for verification.
