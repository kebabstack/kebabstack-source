# Customer workflows — 0.13.0 verification

This report records local verification with synthetic identities and records before
publication. The subsequent production rollout is recorded in
[RELEASE-0.13.0.md](RELEASE-0.13.0.md).

## Behavior exercised

- Each project has its own request types, fields, priorities, service targets and
  optional ordered steps. The editor includes an editable refund template and shows
  which configured groups have eligible project agents. Hub remains role authority.
- Non-admin configuration, cross-project type IDs, malformed IDs, missing required
  fields and stale project revisions are rejected. Types stay out of the internal
  employee catalog. Integrations without a type ID retain default-type intake.
- Required checks and explicit approvals are enforced in the backend. Generic status
  changes cannot skip a workflow or reopen a completed one. Concurrent step changes,
  agents outside the current team, and Finance members without project access cannot
  advance it. Owners/admins can handle every step.
- Returning for rework resets checks; cancellation and reopening require reasons.
  Customer replies never advance a step. Internal instructions and approval reasons
  do not appear in public schemas, ticket links or scoped customer API reads.
- Disabling/renaming a type or changing its fields and steps does not rewrite existing
  tickets. Exact creation retries still return the original ticket after type changes.
- Review exports include workflow snapshots. Erasure removes workflow state along with
  the ticket; deleted links cannot reopen or resurrect it. Existing retention, holds,
  retry tombstones and restore-journal checks remain covered by the customer suite.
- Populated 0.10, 0.11 and 0.12 upgrades preserve records. A second upgrade preserves an
  in-progress workflow at its approval gate. Pre-workflow tickets keep standard status
  handling. Stable signatures checked against the committed baseline and the preserved
  0.12 candidate, without replacing the repository baseline.

## Checks

- Pinned npm dependencies and Mops dependencies installed; Mops check/build and the
  actual ICP backend recipe built successfully. Customer tests use the ICP artifact.
- Backend customer, lifecycle, permissions and security suite: **108 passed, 0 failed,
  8 skipped**. All 11 customer tests ran against the actual ICP recipe artifact, including
  the populated 0.12 upgrade. Skips require older, unrelated historical fixtures that were
  not available; the populated lifecycle/Lunch preservation test ran and passed.
- All three frontend roles and canonical sign-in flows pass; 28 frontend tests pass.
- Release tooling: 5 tests pass; version/placeholders, SDK-copy checks and diff whitespace
  checks pass. No Hub, Lunch, SDK source, role policy or production configuration changed.
- Isolated Chrome visual checks cover desktop and 390px mobile: type list, editor,
  ordered steps, ticket checks/approval and public type selection. No horizontal overflow
  or runtime exceptions in the final visual run. The preview uses synthetic data.

## Limits

Steps are linear human workflows, with optional approval gates. There is no conditional
branch engine, payment execution, workflow webhook or four-eyes requirement. An approval
can be made by the same eligible agent who handled a previous step. As in earlier
customer support versions, external customers use private links, with no customer email
delivery or attachments. Team membership/roles follow Hub's directory freshness lease.
Retention removes active records; backup rotation and isolated restore reconciliation
remain operator responsibilities, as documented in the customer support guide.

Actual ICP recipe backend SHA-256:
`f465fa88ae6553b02b22ecfbc9bbe5a0104c980d8fae3b6c66c6c98ee21aa5b7`.

The combined backend run used `node --test --test-concurrency=1` over
`tests/customer-support.test.mjs`, `tests/lifecycle.test.mjs`,
`tests/permissions.test.mjs` and `tests/security.test.mjs`. The customer suite supports
`KEBAB_CUSTOMER_WASM`, `KEBAB_CUSTOMER_BASELINE`, `KEBAB_RETENTION_BASELINE` and
`KEBAB_WORKFLOW_BASELINE` for actual-artifact and 0.10/0.11/0.12 upgrade runs.
Lifecycle upgrade fixtures use `KEBAB_LIFECYCLE_BASELINE`.
