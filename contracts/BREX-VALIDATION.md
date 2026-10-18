# Contracts 0.21.0 — Brex validation

Date: 18 October 2026. Release source: `ab1b534b340ab9a90d3cb654748581594e40318c`.
Format-2 release ID: `e080986ee268bde73c055142d359d02cfe1a30c9e45f6837da995cb6cbd16481`.
Packaged backend SHA-256: `59260e8dc682158e964d47d7f677e69334ba126c5c6f24e9f59e83148e5e6dd1`.

## Scope and dependencies

This release incorporates Contracts 0.20.0 and adds read-only Brex imports per
personal/teamspace, card selection, daily reconciliation, review, individual
payment assignment and guided completion. Brex GET responses feed the bounded
parser and space-scoped ledger; generated Candid/browser IDL connects the review
UI. Hub supplies current authorization and optional AI. Contract edits use the
existing validators and revision checks. No new Hub permission lane is required.

Assignments change payment evidence, not confirmed contract terms. Up to 50
selected payments are validated together before mutation. Existing group decisions
remain the default for untouched payments. After individual assignment, future
payments require review and group-wide actions cannot erase individual decisions.
Each payment retains its last 20 decisions. One charge cannot be divided into
monetary portions across contracts.

## Executed checks

- Pinned dependency installation, backend checks/builds, generated bindings and
  stable compatibility against the committed signatures passed. Baselines were
  not replaced. The exact downloaded Contracts 0.20.0 executable also matched
  the live module hash before the update.
- Nine targeted tests passed against the final stamped package, with no skips:
  existing documents/terms across upgrade; space and role isolation; token
  non-disclosure; card filtering; deduplication and signed refunds; stale responses;
  explicit guided overwrite; daily timer and retry; archived spaces; and split
  assignment, revision conflicts, atomic refusal, reopening and draft creation.
- A populated integration restart preserved individual assignments and history.
  New payments in a split group remained pending. Selected assignment did not
  change the contracts' revisions or terms.
- The realistic synthetic import contained 10,000 payments, 1,000 merchant groups
  and 100 provider pages. Totals and review pagination remained exact on replay.
  This is test evidence, not a maximum capacity or production latency guarantee.
- Frontend smokes and Brex DOM checks passed. A misleading historic group-contract
  link in split review failed its regression before the fix and passed afterwards.
- Browser operation assigned two payments of one vendor to two different
  contracts, retaining separate history and the remaining pending payments.
  Desktop and 390px narrow layouts were inspected; actual scrolling retained
  global navigation in narrow and 1280×400 short viewports. Screenshots use only
  synthetic records. Full accessibility certification remains outstanding.
- Runtime, branding, design, release-placeholder and canonical SDK checks passed.
  Public-source checks include an external private-marker list and exact reviewed
  binary hashes. Internal history and installation receipts are not distributed.
- Website 0.5.7 passed 16 tests. The public repository preserves Bug 0.20.2 and
  legacy Bug2D 0.2.5; its 175 game frontend tests passed. These independent game
  versions are not replaced by the older internal game checkout.

## Full suite result

`npm run check` completed successfully: **281 backend cases, 241 passed,
0 failed, 40 skipped**. Website: 16 passed; MCP: 45 passed; Python/tool tests:
21 passed. All module builds, committed stable-signature checks, bindings,
frontend smokes, Crumbs collector/API tests and shared integrity gates passed.
The final package separately passed all nine Contracts/Brex cases and the
populated Lunch/central-permissions case with no skips.


## Deployment and verification boundaries

Only Contracts is selected for the Kitchen update. The publication catalogue
retains the ten other published recipes exactly. The tested format-2 artifact is
published and used by the same update executor; no deployment-time restamping is
part of this workflow. The product website has its own independent deployment.
Private before/after receipts check central permissions, connector configuration,
Lunch, Finance/reporting access, canister settings and immutable release assets.

No real Brex credential, payment or real AI provider response was used in these
acceptance tests. An operator must connect a dedicated read-only token, test it
and select cards. A successful read test cannot prove the token lacks additional
permissions. Hosting controllers and snapshots remain inside the credential
trust boundary. AI suggestions never authorize payment or silently replace terms.

Other module versions remain independent. Historical upgrade cases without their
baseline artifacts are explicitly skipped below; the affected current Contracts
upgrade and packaged Lunch/permission checks were run separately. Development
dependency advisories and pre-existing compiler warnings remain; this feature
release is not an independent security audit or proof that the stack is defect-free.

## Broad-suite skipped historical fixtures

- Crumbs: 0.1.0 populated upgrade preserves reports and legacy visibility, then persists named access
- Crumbs native: actual populated prior release upgrades with website grants, keys and metrics
- populated 0.10 Desk upgrade preserves employee tickets and new project boundaries survive another upgrade
- populated customer upgrade keeps settings and holds; restored deleted records can be erased by a matching journal
- populated 0.12 upgrade preserves existing intake and workflow snapshots survive another upgrade
- assignment and subtasks: populated 0.25 upgrade
- internal bulk: populated production upgrade
- slack upgrade: published baseline retains ticket, file, thread and central role policy
- Displays: upgrade from Operations 0.28 isolates capabilities, preserves Lunch and survives upgrade
- production Hub and Assets upgrade with legacy paid invoices, archived PDFs, custody and Lunch unaffected
- committed release upgrades preserve responses; retention stays off until configured and respects grace
- hardware upgrade: preserves Lunch, central roles, held devices and issued colleague invoices
- upgrade baselines do not backfill departures and preserve Lunch and ticket data
- populated 0.17 upgrade preserves response and a second upgrade preserves source credentials and deduplication
- populated 0.19 upgrade preserves plans and payroll, then partial cover/status survive a second candidate upgrade
- populated 0.21 upgrade preserves legacy CSV and grants; dated snapshot survives second upgrade
- populated 0.20 upgrade preserves calendar/status/payroll; regional rules and reminders survive a second upgrade
- populated Hub 0.29 / Desk 0.18 upgrade preserves operations; released statements and grants survive another upgrade
- pending delivery survives an upgrade and a populated planning upgrade preserves plans
- populated Desk upgrade preserves tickets, permissions and new planning history
- populated Hub 0.34 upgrade preserves Lunch, Finance and owner permissions without enabling any source
- Operations: populated upgrade preserves scopes, records and Lunch
- lunch team-directory keeps its roster, filters and legacy access across Hub upgrade and six-app centralization
- populated deployed baselines upgrade with records intact and historical local admins inert
- deployed Crumbs policy survives the Hub reporting upgrade with deny-by-default and scoped Analyst access
- branding release upgrades populated current apps without changing records, policies or external pictures
- populated installer upgrade keeps bindings, adoption records and journal
- Hub itself upgrades through the shared executor without changing owners or external connector configuration
- upgrade preserves Hub identities and app records from the deployed baseline
- contracts: upgrade keeps legacy records and evidence, freezes former access and preserves new spaces across a second upgrade
- notifications: upgrade repairs historical root hash links without changing routes or recipient access
- contracts: review notifications stay actionable across a 0.7.0 upgrade
- contracts: notification destinations tolerate trailing app slashes and keep workspace access
- contracts: SaaS upgrade preserves 0.6.3 originals, then keys, policies and prices across another upgrade
- contracts: current populated upgrade preserves agreements, source bytes and workspace boundaries
- brex: populated previous-version upgrade retains contract terms and installs an empty disconnected integration
- Trust: populated 0.7 patch upgrade preserves removal evidence and agent revocation
- Trust: populated 0.5 upgrade preserves agent keys, ownership, checks, results, tuning and central roles
- Workboard Operations populated upgrade: shared totals, explicit TV consent and revocation
- workboard populated upgrade: scopes, source truth and Lunch
