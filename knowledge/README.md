# Doku — reviewed team knowledge

Doku 0.2.0 is an **alpha release** of a documentation app in Kebabstack.
Write a guide directly, or turn an internal Desk ticket into a human-reviewed documentation change. Nothing
is published merely because a ticket was resolved.

## Employee and reviewer workflow

1. Choose **Create article → Start writing** in the library for a blank draft, or use **Propose edit** on a published article. For a ticket-based guide, a Desk agent resolves an internal request and confirms a reusable solution
   under **Documentation**. Customer-project requests are excluded.
2. **Create documentation proposal** opens Doku through shared Hub sign-in.
   Choose a new article or an update to an existing article.
3. Edit the text in the locally bundled Tiptap WYSIWYG editor. The narrow toolbar
   supports headings, paragraphs, bold, italic, lists, quotes and code. No CDN,
   remote fonts, images or raw HTML are involved. Pasted links become plain text.
4. Save the draft. Saving does not replace the published article. A reviewer
   checks the source, current article and intended audience, then approves it.
5. Readers see the published version; previous published versions remain readable.

All published material belongs to **one internal library**, visible to everyone
with Doku access. A draft belongs to its author and Doku reviewers. Desk-sourced drafts additionally
require current Desk staff access; directly written drafts do not. Authors cannot publish. Reviewers/admins may explicitly
approve their own work; mandatory two-person approval is not implemented.
Publication is an intentional audience expansion from a support ticket to the
library. Remove personal data and secrets before approving.

The source confirmation is tied to a resolved ticket and solution revision.
Reopening or reconfirming it prevents an older proposal being published. An
article or proposal changed by another person also blocks stale writes. Start a
new proposal from current evidence; automatic merging is not implemented.

## What is implemented, and what is next

Implemented alpha: manual article creation and edits, external version links, central roles, ticket/suite sign-in, confirmed Desk solution,
new/update proposals, explicit save, WYSIWYG editing, source review, publication,
immutable version history, search and bounded lists. Draft lists use opaque references. Opening a Desk draft rechecks current Desk access;
its saved source snapshot is retained. Manual drafts explicitly have no Desk source.

Planned: automatic AI matching/proposals, durable source events, Slack review
notifications and delivery history, spaces with separate audiences, attachments,
images, public documentation portals/search, retention and migration/import tooling. This
milestone sends no document to an AI provider and sends no Slack message.

For executives: the milestone tests whether solutions become usable knowledge
without replacing trusted articles prematurely. No measured time saving or cost
saving is claimed. Operators still assign roles, review content, update and back
up canisters. Hosting, maintenance and later AI/Slack providers have separate
costs. Cloud Engine deployment does not establish a specific data jurisdiction or
confidentiality from infrastructure operators.

## Share a published version

Reviewers/admins select a published version, choose **Share**, name the link,
review the external audience and create it. Copy the compact random link from the
same dialog. Choose 1, 7 (default), 30 or a custom number of days (1–3,650), or
**Never**. Optional passwords require 12–128 characters in the app; send them by a
separate channel. Settings are fixed when created: revoke and create another link
to change the version, duration or password. Links and passwords are capabilities:
any recipient can forward them. This does not authenticate named recipients.

An external visitor needs no company account. They see only that published title
and body, version number and dates. They receive no source ticket, draft, author
identity, other article or history. New publications never change existing links.
Revocation/expiry blocks subsequent reads at the backend. An open page rechecks
access every 30 seconds and when returning to the tab, clearing content on failure.
Already copied, photographed, printed or downloaded material cannot be recalled.
Company role removal alone does not revoke company-owned external links; review
and revoke those links separately when a recipient or business need changes.

Short links use a 128-bit random-looking code in this app's URL fragment, with no
external shortener. A custom short domain is not provisioned by this release.
The page requests no indexing and sends no referrer. This is not end-to-end
encryption or confidentiality from infrastructure operators. See the password and
storage model in [INSTALL](INSTALL.md).

## Bounds and recovery

50,000 text characters, 100,000 serialized characters and 2,000 nodes per document;
1,000 published articles, 10,000 total proposals and 100 versions per article.
Lists scan at most 30 articles per request; search continues across bounded pages.
Up to 100 retained sharing links per article and 10,000 in total.
Proposals, links and versions are retained; there is no automatic deletion policy.
Unsaved edits live only in the open browser page. Save before leaving; navigation
and closing warn about unsaved changes. Rejected saves preserve the open editor.
Unchanged updates cannot create another version. After an interrupted publish, retrying the same revision returns the published
article without creating another version. Restoring an old version requires a
new reviewed proposal; the history selector is read-only.

API: generated Candid in `backend/backend.did`, generated browser IDL in
`dist/idl.js`. No REST/OpenAPI or curated MCP tool is advertised for this milestone.
The generic assistant lane must enforce the same personal roles; no service
credential bypass is provided. See [INSTALL](INSTALL.md), [CHANGELOG](CHANGELOG.md)
and [the suite permission contract](../docs/APP-PERMISSIONS.md).

## Reproduce the browser workflow locally

After building Hub, Desk and Doku, run `node knowledge/tools/preview.mjs` from the
repository root. It creates only isolated synthetic PocketIC canisters and serves
their UI at `http://127.0.0.1:4197`. `knowledge/test/browser.mjs` uses Playwright
and Chrome; set `KEBAB_PLAYWRIGHT_MODULE` to an installed Playwright module if it
is not in the normal Node resolution path, and `KEBAB_BROWSER_OUTPUT` to an
evidence directory. Stop the preview after the test. Never expose this synthetic
fixture server outside loopback or point it at production.
