# Kebabstack: staged path to a public release

Accepted product direction, 18 September 2026. Target repository:
`kebabstack/kebabstack-source`. Prepare it privately after sanitization; publish the
reviewed release when its acceptance gates are met. The existing operational
repository and deployments remain separate. Marketplace acceptance depends on
the platform operator; a clean repository alone does not establish readiness.

## Scope and sequence

| Stage | Outcome | Acceptance | Status |
| --- | --- | --- | --- |
| 0 · Publication foundation | Repeatable source audit, export without internal history, explicit content review | Unsafe source blocks export; existing files stay intact; license and public source bytes are preserved | Implemented; public snapshot acceptance is tracked in SOURCE-RELEASE.md |
| 1 · Hub Operations | Useful overview of Desk, Trust, Assets, Contracts, Watch and offboarding; work and TV views | Backend-enforced scopes; clear stale/error/empty states; useful 1080p/4K layout; no personal Owner session on a shared TV | Work view and TV pairing implemented locally; history next |
| 2 · Connected follow-up | Three clear templates: Trust protection, contract/seat review, Watch findings | Dry run, explicit enablement, one existing/new Desk case, durable retries, source-verified outcome | Planned |
| 3 · SaaS account reconciliation | Provider accounts and seats compared with Hub people and Contracts | Supported providers chosen from pilot need; first read-only; no usage or savings claims from allocations alone | Planned |
| 4 · Evidence export | Period- and scope-specific access, posture, handover and workflow evidence | Sources and timestamps included; gaps explicit; retained data and permissions honored | Planned |
| 5 · Assistant controls | Narrower rights for the existing MCP integration | Per-app/action scopes, read-only defaults, explicit server-side checks for protected actions and execution history | Planned |
| 6 · Public pilot and marketplace package | Sanitized GitHub repository, reproducible release, first-run guide and honest portfolio | Fresh installation, populated upgrades, restore, dependency/license review, operator handover and marketplace requirements checked | Planned |

Stage status describes tested implementation, not deployment. A stage is not
complete because a mockup exists or a compiler passes. Record the exact source,
tests, known limits and rollout evidence. Production changes use the established
release executor and need authorization for that rollout.

## Stage 1: Hub Operations

Use **Hub → Operations** for overview and prioritization. Desk remains the place
to assign and complete operational work; the source apps own their records.

- Desk: open/unassigned/overdue requests and explicitly defined period counts.
  Internal support and customer projects remain separate permission scopes.
- Trust: fleet posture plus current-report coverage and missing/stale reports.
- Assets: ready-to-assign hardware, preparation and outstanding returns, using
  actual disposition/readiness rules across every hardware type.
- Contracts: decision and cancellation deadlines, responsible owners and
  allocation reviews. Keep currency totals separate.
- Watch: unreviewed findings, monitoring health and known expiry dates.
- Offboarding: confirmed cases, unresolved outcomes and verified completion.

The versioned cross-app summary contract minimizes returned data and validates
both Hub and source permissions. Recheck permissions after asynchronous calls.
Source failures must never appear as a healthy zero. Historical charts require
retained aggregates with documented definitions; do not reconstruct them from
today's record status.

TV access needs a separate expiring/revocable dashboard-only read capability,
with approved aggregate scopes. No employee names, emails, free-text tickets,
serials, credentials or raw contracts on the shared screen. Small aggregate
groups can still reveal sensitive information: only explicitly approved scopes
belong on a shared display. Views have no mutation controls. Test permissions,
revocation, missing sources, routing, reduced motion and physical screen layouts.

Deliver the live-data work view first, then TV pairing/presentation, then period
history. These are sub-deliveries within Stage 1, not claims that the complete
dashboard is already available.

## Stage 2: work follows the signal

The accepted product direction also includes configurable **Desk on-call and
incident management** for internal operations and customer projects. Company
response teams are configurations of a general model, not bespoke product forks.
A first finite scheduling and accepted-cover slice is implemented locally in the
Desk 0.16.0 candidate; native incident response, Hub delivery/escalation and
unreviewed actual-work entries follow locally in 0.17.0; [exact behavior and limits](../desk/ONCALL.md). Generic scoped monitoring intake and recovery evidence follow locally in 0.18.0. Scoped HR/Finance reporting follows locally in 0.19; partial cover, availability and status publication in 0.20; regional planning and opt-in reminders in 0.21; dated daily/hourly compensation and separate time credits in 0.22. Vendor adapters and verified device paging remain planned. Readiness and actual work feed reviewed
compensation statements and payroll exports; reporting must be accepted before
replacing an existing compensation spreadsheet. Access remains controlled in Hub.
See the [foundation design and acceptance milestones](DESK-ONCALL-DESIGN.md).
This is additional scope, not a claim that the existing Desk already replaces a
paging provider. Its staged delivery must preserve the contracts below.

Every rule has a responsible team, explanation, source link, deduplication key,
current status and verification condition. Repeated signals update the same
case. Distinguish a planned action, successful API request and verified result.
Use stable record/person identities; email addresses can be reused.

The initial templates do not wipe devices, revoke vendor accounts or cancel
contracts automatically. Those actions require separately defined capabilities,
approvals and tested connectors. Existing hardware offboarding remains intact.

## Stage 6: repository and portfolio

The target is a reproducible product another IT team can operate. Include a short
problem/solution README, architecture and permission model, synthetic screenshots,
three realistic workflow demonstrations, installation/update/recovery instructions,
supported integration boundaries, contribution/security guidance and release notes.

Describe the maintainer's product, UX, architecture, implementation and operating
decisions truthfully. Preserve the MIT license, third-party attributions and
contributors' credit. Do not invent customer endorsements, adoption numbers,
savings, certifications or a completed security audit. Measure pilot outcomes.

Publication uses a new reviewed source snapshot, never the internal Git history.
Exclude deployment receipts, customer configurations, local paths, credentials,
user data and unreviewed screenshots/binary assets. Upstream SDK/package names
and legitimate attribution must not be removed by blanket brand replacement.
See [the publication procedure](PUBLIC-SOURCE.md).

## Preserved contracts

All stages preserve central Hub roles, employee data boundaries, SCIM handling,
stable person identity and Lunch's existing directory interface. The dashboard
must not need additional directory grants for Lunch or change its synchronization.
Maintain canonical SDK copies, compiler pins, stable compatibility and populated
upgrade tests. Marketplace cleanup is not authorization to rewrite live state.

## Current evidence and open gates

- The existing repository is already a monorepo. Public packaging and a supported
  operating path are the remaining distribution work.
- `tools/public-source.py` exports committed blobs only, with per-file checksums,
  executable modes and license preservation. It contains no network publication
  or production deployment operation.
- Its regressions cover working-tree and history exclusion, credentials, binary
  metadata, changed reviews, source/destination protection, symlinks/submodules,
  private markers and links to excluded documents.
- The initial audit still requires generic mail-relay examples, removal/replacement
  of links to internal receipts, binary/license review and classification of
  remaining canister references. No sanitized version is claimed ready yet.
- Repository creation/upload, public release and marketplace submission have not
  happened. The GitHub account is available; the target name has been selected.

### On-call reporting progress — 19 September 2026

Desk 0.19.0 and the Hub reporting extension (released as Hub 0.31.0) introduced an alpha for scoped hourly service reporting. The [operator and pilot guide](../desk/REPORTING.md) separates implemented confirmation/review/release/CSV and retention from planned country-specific rules. A complete reporting-period reconciliation remains a gate before spreadsheet cutover; marketplace publication and production rollout are separate.

Desk 0.23.0 and Hub 0.31.0 completed local UX and populated-upgrade review. See the module changelogs and reporting guide. Verified mobile paging, pilot reconciliation and marketplace acceptance remain separate gates.
