# Stack integrity and bug-check acceptance

This is the operator's default quality requirement for every change. It supplements
module instructions and the shared design standard. It is not a claim that testing
can prove absence of defects.

## Every change

1. Map the changed behavior to its producers, consumers and persisted data. Include
   Hub permissions/SSO, dependent apps, browser SDK, MCP, external connectors and
   operator-run components where applicable. Inventory all modules, including SDK,
   Kitchen/Vault, website and optional services; record independent version lines.
2. Reconcile source and generated Candid/browser IDL, REST routes, OpenAPI, SDK
   declarations, MCP tools, examples and actual responses. Check meaningful allowed
   and denied requests, pagination, field types, missing data and scope. A route
   documented but absent, or a shipped feature omitted from setup help, is a gap.
3. Reconcile runtime/frontend/package versions, source and served changelogs,
   README/INSTALL/privacy/metric guides, contextual help, website claims and release
   recipes. Explain intentional Candid-only or optional-host behavior. Do not copy
   a new version into an independently versioned component without justification.
4. Run `npm run check` for the local suite gates. It covers suite build/stable checks,
   generated bindings, release metadata, runtime/brand/design consistency, frontend
   smokes, security/integration tests, MCP and tool tests. Inspect what it actually
   executes: it is fail-fast and not exhaustive. If a stage fails, run independent
   later gates separately, resolve related failures and report unrelated blockers.
   Never report unexecuted downstream stages as passed.
5. Add focused regressions for the defect or boundary, not tests that simply mirror
   implementation. Exercise realistic record counts, distinct visitors/groups,
   attachment sizes, date ranges, multilingual input or batches as relevant. Verify
   exact expected counts and rejected operations. Include retries, simultaneous calls,
   timeouts and partial failure. Document workload bounds and untested extremes.
6. Test relevant user workflows in the real browser at desktop, narrow and short
   viewports, including real scrolling, keyboard navigation, empty/error/stale states
   and roles. Follow the design review template and disclose missing checks.
7. Build from a clean reviewed commit. Validate actual stamped executables and a
   populated upgrade from the previous published release, preserving permissions,
   existing data and connected workflows. Never replace the committed stable baseline
   before compatibility checking. Source-build success does not certify the package.
8. Deploy only with authorization. Publish/update/verify through the shared executor;
   preserve unrelated catalogue entries, immutable packages and bootstrap files.
   Compare live version, executable hash and served assets with the exact package.
   Verify the affected authenticated workflow when access is available. Record an
   access blocker instead of inventing live verification.

## General bug check

Create a module-by-module evidence matrix, not only a list of tests that already pass.
For each module record core workflows, roles, interfaces, documentation, versions,
realistic-load evidence, upgrade coverage, live/source parity and unresolved gaps.
Inspect unfinished features and contradictory claims as well as runtime failures.
Prioritize data integrity, authorization, lost/duplicated work and blocked workflows.
A style preference is not a security vulnerability.

A reported failure should get a reproducer first where feasible, then a regression
against the actual packaged artifact. When the current test suite missed it, explain
which fixture, boundary or integration was missing and strengthen that coverage.
For example, a 5,000-event success did not establish that Crumbs reports fit the
canister query budget at 50,000 events; both dataset size and cardinality matter.

## Evidence and completion

Report the checked source commit and deployed release separately. State what changed,
which dependent surfaces were updated, tests/results, exact skipped checks, known
limits and deployment status. Mark a review partial when the full matrix is incomplete.
Do not hide unrelated findings or silently roll unrelated apps into an authorized
single-app deployment. Zero failed tests is evidence, not a guarantee of correctness.

Suggested request:

> Run a deep stack-wide bug and integrity check under docs/INTEGRITY-CHECK.md.
> Inspect real workflows, realistic load, data integrity and authorization, plus all
> dependencies, APIs/SDKs, documentation, versions and release artifacts. Reproduce
> defects, fix affected surfaces together, test populated upgrades and packaged builds,
> and report gaps and skipped checks explicitly. Deploy only with my authorization.

## Daily visual and publication review

Maintain a per-module evidence matrix, including complete workflows, roles and
error states. Actually operate the browser at desktop, tablet, phone and short
viewports: alignment, control sizes, whitespace, long labels, sortable/filterable
tables, searchable large selections, zoom, keyboard focus, touch targets, dialogs
and scrolling containment. Record before/after evidence and re-run affected tasks.
Separate defects and avoidable work from stylistic preferences.

Exercise concurrency, retries, interruption and stale sessions; compare known
counts across list, detail, export and API. AI extraction requires representative
inputs and ground truth, not merely a successful request. Test writes only in
isolated environments. Preserve human corrections and explain unknown results.

Before updating the public repository, follow PUBLIC-SOURCE.md. Publish a reviewed
source snapshot without private Git history, tenant data, credentials, deployment
configuration, private evidence or binary metadata. Review the exact final diff
and new public commits; inspect existing public history for leaks. Never print
credential values. Block publication on a finding; report potential exposure and
request rotation where needed. Do not rewrite public history without approval.
Public technical dependencies, licenses and attribution are not tenant data.

Check the product website against implemented and released behavior in both
languages. Update its content evidence, limits, links and release notes; preserve
labelled synthetic examples and distinguish product capabilities from the site's
own configuration. Test the website separately.

Prepare exact release artifacts before requesting deployment approval and any
necessary personal ICP identity reauthentication. Do not request secrets in chat
or renew a valid identity unnecessarily. Report fixed/retested, open, untested
and blocked items separately, with commits, dates, test skips and publication
status. Reused evidence must be labelled as such.

## Rotating coverage, not repeated smoke-only checks

Keep a private persistent matrix of module × workflow × role × state × viewport
or load case, with actual evidence date/commit, status, risk and next action.
Daily: prioritize new critical findings and changed consumers; additionally select
one unverified and one longest-unverified executable case. Rotate operations
(Hub/Kitchen/Vault), evidence (Assets/Contracts), service (Desk/Slack/on-call),
assurance (Forms/Trust/Watch), and platform (Crumbs/SDK/MCP/website/games) across
five weekday runs. A blocked case retains its cause and recovery condition; select
another case rather than recording a pass. Only executed, evidenced checks advance
the rotation. Inspect the real app that consumes a shared component; passing its
unit tests does not certify all consumers. Revisit skipped groups before repeating
comfortable checks. Report newly closed gaps, overdue cases and the next focus.
