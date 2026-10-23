# Doku milestone — stack integrity record

Date: 21 October 2026. Isolated branch: `codex/knowledge-milestone`.
Base: integrated shared foundations, followed by reviewed suite changes and the
exact published Operations sources for Hub 0.43/Desk 0.35/Assets 0.30. The concurrent
Desk 0.36 completion-review release was then preserved; Doku changes use Desk 0.37.
The old live working copy and other editors' working files were not modified.

## Producer/consumer map

Desk confirms a bounded internal-ticket solution in additive side state. The Hub
broker authenticates the Doku connector and the person in both apps, checks source
identity/access after the call and supplies the registered source link. Doku stores
a source snapshot, independently revisioned draft and immutable published versions.
Publication checks current evidence and both content revisions before a synchronous
commit. No global event bus, AI call, Slack delivery or source comments are added.

Candid/browser bindings are compiler generated. `Knowledge.mo` and the role
vocabulary are shared and served from Hub. Desk consumes target discovery; Doku
consumes only the narrow source projection. No REST/OpenAPI/curated MCP endpoint
is promised. The existing generic assistant path retains personal permissions.
Doku has no person-context/Operations/TV projection in this milestone.

## Module inventory and rollout scope

| Module | Effect / independent version line |
|---|---|
| Knowledge | New Doku 0.1.1 backend/frontend, editor, docs, recipe and tests; production install target |
| Hub | 0.44.0 evidence broker/roles/logo, preserves live 0.43 Operations/TV; production update target |
| Desk | 0.37.0 confirmed solution/handoff, preserves concurrent 0.36 periodic assistance; production update target |
| SDK | 0.17.0 types/roles/registry; existing directory/SSO/Lunch semantics retained |
| Assets / Contracts / Watch / Trust / Forms | Canonical logo-registry copy and source patch versions only; not rollout targets |
| Crumbs / Bug / legacy Bug2D | Canonical registry source synchronization only. These branch lines are independent of newer live releases; no package publication/downgrade is authorized by this change |
| Kitchen / Vault | No backend rollout. New recipe and scoped packer option; current release catalogue and immutable files preserved |
| MCP | Preserves upstream Desk 0.36 tool/help reconciliation; no new curated Doku tool or deployment |
| Website | Independent deployment, not changed or deployed here; no AI/Slack documentation claim added |
| Optional services / external apps | No connector configuration change; Lunch directory/policies exercised in populated upgrade |

## Validation and remaining evidence

All suite modules were installed with pinned Mops, checked/built, and checked
against their committed stable baselines. Knowledge's initial baseline was generated
from compiled source; it is a first installation, not an old-version upgrade.
Generated bindings, release metadata, brand, runtime and design checks passed.
The first all-in-one run stopped at the Crumbs generated OpenAPI version after
source patch bump; regenerated it and passed the metadata gate. Independent later
stages are run separately rather than described as passed by that initial command.

Focused backend tests cover allowed/denied roles, source access, source content
minimization, stale/conflicting writes, concurrent publication, retries, immutable
history, malformed/rich-text input and a roughly 42,000-character guide. Fresh and
populated Hub 0.43/Desk 0.36 package upgrades pass locally, preserving existing
tickets and Lunch results. This is not a 10,000-proposal capacity certification.

Actual-browser tests use real isolated PocketIC backends behind a local-only
preview transport, with synthetic users/data. They cover the Desk handoff,
WYSIWYG edit/save/publish, library reading/search and actual scrolling at desktop,
800px, 320px and short viewports. Full screen-reader and text-only zoom certification
remain untested. See the [design review](../design/reviews/2026-10-21-knowledge-milestone.md).

Broad frontend/security/tool/MCP/website checks, exact packaged executables and
live publication/deployment verification are recorded in the private operator
receipt as they complete. Optional historical-baseline tests skipped by the suite
must be listed separately; they are not substitutes for the targeted populated
upgrade above. Existing compiler warnings and dependency advisories are not
silently interpreted as an exploit or a full-stack clean bill of health.

The authorized production scope is Hub + Desk update and Doku install through
Kitchen. Publish the exact checked format-2 artifacts and compare resulting module
hashes, versions and frontend files. Do not replace unrelated catalogue entries or
create synthetic business records in production. Production authorization was given
explicitly in the request for this milestone; no repeated approval is needed.

## Completed release evidence

The remaining broad local stages passed: 247 backend checks, all frontend smokes,
collector tests, website build/tests, MCP tests and 21 tooling tests. The broad
backend run skipped 42 optional historical fixtures, recorded individually in the
private receipt. Scoped actual-package tests passed 26 cases; four were skipped,
with the populated Lunch test then passed separately. The other three historical
fixtures remain untested. Doku's fresh/populated cases were rerun successfully on
the final 0.1.1 package. Browser/editor checks also pass; this is not maximum-load
or full accessibility certification.

A stale served design README initially stopped packing and was synchronized.
The 0.1.0 recipe's unsupported Desk dependency then stopped installation before
creating any app. The existing installer accepts Hub/Kitchen dependencies only.
Doku 0.1.1 retains the Hub gate and documents the explicit Desk 0.37.0 operator
check, which passed live. The old immutable package remains retained. A temporary
gateway read failure was retried; successful publication verified the complete
catalogue and retained old packages and unrelated app releases.

Hub 0.44.0 and Desk 0.37.0 were updated; Doku 0.1.1 was installed and then verified
through the shared executor. Doku's central policy defaults to no employee access;
existing global owner/admin inheritance applies. Its enforcement response, invalid
session denial, canonical console mark, published frontend and working sign-in
screen were checked live. Vault registered both new canisters for the existing
backup service. No synthetic business records or identity links were created.

The deployment principal has operator rights but no personal Hub portal session,
so a complete personal production SSO/Desk-to-Doku journey was not exercised. That
full journey passed against isolated real canisters in the browser; the distinction
is retained in the private receipt. Source stays in the isolated branch; the old
working copy and independent live app releases are preserved.


## 0.2.0 follow-up — manual creation and external version links

Scope: Knowledge only. Existing Hub 0.44 / Desk 0.37 / SDK 0.17 producers and
permissions remain unchanged. An additive manual-proposal map distinguishes new
source-free drafts without weakening existing Desk draft checks or changing their
stable records. The Candid proposal view now exposes an optional source; generated
browser bindings and the only shipped consumer were updated together. Reload open
Doku pages after the release to use the new response shape. Existing internal
articles/history stay private unless a reviewer/admin explicitly creates a link.

The new sharing mixin consumes immutable published versions. Its management API
requires central Reviewer/Admin access. Two anonymous update methods accept a
128-bit capability and optionally a derived password proof, returning metadata or
a deliberately minimal published-version projection. No generic staff token,
other article, private source, draft or history is reachable through that API.
Expiry/revocation and per-link failed-password bounds are synchronous; link
creation is idempotent and bounded. Short links use the existing origin's fragment,
no new domain or third-party shortener. A URL capability is an explicit scoped
exception to the general rule against putting company session tokens in URLs.
There is no external analytics/AI/Slack delivery in this change.

The canonical logo/runtime and shared SDK are unchanged; sync and byte-equality
checks were run. Kitchen's Doku recipe description, package/module/frontend
versions, Candid/IDL, source/served changelog, guide, README, INSTALL and central
permissions document were reconciled. There is still no curated REST/MCP surface.
The website's two-language content map/source does not advertise Doku; no new
marketing claim or independent website deployment is included.

Fresh and actual published Doku 0.1.1 populated upgrades pass, including existing
Desk drafts, 34 published articles, version history, central permissions and Lunch
preservation. Additional checks cover manual drafts without Desk rights, denied
reader/other-author operations, missing/empty content, stale versions, request
reuse, concurrent link creation, protected/unprotected links, metadata minimization,
wrong-password bounds/recovery, per-link salt isolation, immutable shared snapshots,
server expiry, revocation and persisted state after restart. A 33k-character manual
guide and all 100 retained links for one article are exercised; overflow is denied.
This is not a 10,000-link or 10,000-proposal capacity certification.

Actual browser evidence covers both Desk and manual workflows, WYSIWYG save/review,
anonymous public reading, wrong/correct passwords, no internal API fetch on public
entry, no password persistence, revoke/reopen, history selection, light/dark,
1280×800, 800×900, 320×740 and 1280×440 layouts. Wheel scrolling and global navigation
remain tested in the Desk editor; public pages intentionally omit company navigation.
Native dialog focus return is checked. Full screen-reader and 200% text-only zoom
certification remain outstanding.

Production scope is a Knowledge-only update through the existing shared executor,
using the continuing explicit deployment authorization. The complete current
catalogue must be preserved, including independent newer Crumbs/Bug and legacy
source version lines listed above. Exact packaged upgrade tests and final broad
suite/release/live evidence are recorded in the private release receipt; pending
or skipped gates must not be represented as passed.

### Final local verification for 0.2.0

The complete `npm run check` finished successfully: pinned suite builds and stable
checks, generated bindings/release metadata, brand/design/runtime, all frontend
smokes, 247 broad backend checks, 30 collector checks, 16 website checks, 45 MCP
checks and 21 Python tooling checks. The generic backend run skipped 42 optional
historical fixtures; their exact names are retained privately. Doku's actual
0.1.1 populated upgrade and the populated Lunch preservation case were then
executed separately, rather than counted as covered by those skips.

The initial scoped package run passed 21 checks and skipped five older fixtures;
the additional Lunch case passed, leaving four unrelated historical package
fixtures unexecuted. The final Doku artifact was tested again: fresh installation
and populated prior-release upgrade both passed with an explicitly anonymous
transport, staff session tokens and unauthenticated external visitors. Both real
browser workflows passed on the final frontend, including the long-title fix.
The shipped application source is `b7635c83ba04fbf904cc9102bcc64a5884248dac`; the
anonymous-transport regression is retained separately in `e8a22e2`.

### Production verification for 0.2.0

Doku alone was updated through the shared release executor after the complete
catalogue was published and verified. Backend/frontend snapshots were taken;
upload permissions and deployment configuration were restored/preserved. Release
`e27d70041d5185b514f35dc958c8cecf41b0fb0fca9da77d3f075af1ce3db90e`
was then independently verified without redeployment. The running backend hash
is `8776442da938762ee1ae92d83691fa146a0406238792ea0b00e71664bbc925f0`;
served frontend and sign-in configuration match the same artifact.

Live checks confirm version 0.2.0, the sharing asset hash, central policy enforcement,
invalid session denial and unavailable-link denial. A fresh anonymous Chrome
context called the actual public canister endpoint and received the expected
unavailable-link page with no company navigation; company sign-in also loaded
without JavaScript errors. The accessible personal browser was on sign-in, so a
complete signed-in production authoring/sharing transaction was not performed.
No production business records, public links or new identity bindings were created
for testing. Complete staff/guest workflows passed locally against real canisters.

Final catalogue check: all 12 installed apps are current and their frontend hashes
match. Every non-Doku recipe is byte-for-byte equal to the pre-release catalogue.
