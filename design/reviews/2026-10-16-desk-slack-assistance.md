# Desk Slack assistance and images review

- Standard version: 1.2.0.
- App: Desk 0.33.0; source recorded in the release manifest.
- Surface: Slack intake/completion and ticket attachments.
- Roles: staff, requester, unknown Slack user, revoked staff; internal support only.
- Review: 2026-10-16, Codex. Status: scoped verification; live Slack workspace acceptance pending.
- Intended outcome: avoid entering the same completion status twice; concise request titles; usable images in both destinations.
- Previous manual work: open Desk and resolve after writing the completion in Slack; open Slack separately for shared images. No timed productivity sample was taken, so no quantified savings are claimed.

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task and completion | Pass locally | Mocked Slack/AI boundaries against real Wasm verify title, linked ID, resolved status and image bytes. |
| Role / project boundaries | Pass scoped | Only active staff with a fresh directory can auto-resolve. Requester, revoked staff, checklist and concurrent-change cases are tested. Customer projects excluded. |
| Direct entry / expiry | Scoped | Local direct ticket link and existing role smokes; no new sign-in flow. |
| Error / retry / concurrency | Pass scoped | Bad JSON, fabricated evidence, unsupported file URL, missing scope, duplicate file event, retry after populated upgrade, new reply during AI call. |
| Input / draft / review | Pass scoped | Existing composer unchanged. Image preview checks ticket generation and viewer after loading. Internal notes retain public-attachment restriction. |
| Lists / exports | Not applicable | No list/export scope changes. |
| Canonical branding / runtime | Pass | Shared runtime/design checks; no new palette, logo or local token override. |
| Initial viewport / layout | Scoped | Ticket layout retained. Attachments open from conversation or attachment list; close returns focus. Preview provides full-size and download links. |
| Reflow / themes | Pass scoped | Actual IAB at 320×740 light/dark, 1280×800 and 800×500 dark. Document scroll width equals viewport width. 1200×700 synthetic PNG loads and scales. 200% text enlargement not tested. |
| NAVIGATION-06 | Pass scoped | Real scrolling on the long ticket at mobile/desktop; global brand control remains at y=8 / 12.5 px. Short viewport tested. |
| Keyboard / accessibility | Partial | Native links/buttons, image alt, live preview, explicit focus on close and return to source. Full screen-reader and contrast certification not performed. |
| Privacy / secrets / retention | Pass scoped | Private image token only sent to exact Slack file host. Signed upload URL receives bytes without bearer token. Non-images and SVG excluded from preview. Both systems retain independent copies; deletion does not propagate. |
| Time / evidence | Scoped | AI resolution stores the author's quoted completion evidence; current permissions and ticket revision required. |
| Automation / recovery | Pass scoped | Bounded durable image retry ledger; failure activity; staff retry button. Manual status/reopen remains available; AI assistance can be disabled. |
| Help / changelog | Pass | README, INSTALL, served changelog and settings describe automation, scopes, file limits and historical-placeholder limitation. |
| Module / release checks | Recorded in private release receipts | Mops check/build, committed stable signature compatibility, Desk frontend smokes, local Slack integration and published-baseline populated upgrade. Packaged executable checks are separate release evidence. |

## Remaining acceptance

Production requires an authorized release deployment and the Slack app's `files:read` / `files:write` scopes. Tests do not establish that the live workspace grants those scopes. No live Slack messages were sent. AI semantic accuracy depends on the configured model; uncertainty keeps a request open, but natural-language classification is not guaranteed. Historical Slack file placeholders are not backfilled. Stored files remain bounded to 1.5 MB and 20 per ticket; oversized Slack images use an available labelled preview.

Local screenshots are retained in the private release evidence, not as production data or a claim of complete product certification.
