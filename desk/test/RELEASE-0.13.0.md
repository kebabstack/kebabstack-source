# Desk 0.13.0 — production rollout, 2026-09-17

Deployed after explicit operator authorization. Desk moved from 0.9.1 to 0.13.0,
including employee context, directory follow-up, customer projects, automatic
retention and project-specific request types/workflows.

## Publication and deployment

The format-2 bundle was built from a clean committed checkout at `bd579a7`.
The identical stamped artifacts were tested, published and installed using
`kitchen/tools/release.mjs`. The catalogue was activated atomically; existing
immutable packages and bootstrap/domain assets were retained. Unrelated Vault
and Bug recipes retain their prior published packages.

| Component | Previous | Deployed | Update job |
| --- | --- | --- | --- |
| Update service | 0.7.2 | 0.7.3 | Operator helper, with snapshot |
| Hub | 0.25.1 | 0.26.0 | 68 |
| Assets | 0.11.1 | 0.12.0 | 69 |
| Contracts | 0.8.1 | 0.9.0 | 70 |
| Forms | 0.3.1 | 0.4.0 | 71 |
| Trust | 0.4.1 | 0.5.0 | 72 |
| Watch | 0.6.1 | 0.7.0 | 73 |
| Desk | 0.9.1 | 0.13.0 | 74 |

Each app operation completed with backend/frontend snapshots, exact backend and
frontend verification, and restoration of temporary upload permissions. Final
release checks report the deployed versions and release IDs as current. Lunch,
Vault and Bug were not upgraded.

Desk release ID:
`f9a7acbbe1376996d6e0621f1ae34222d73cfd8015cf89a3a784f93cdfdb1bc5`.

## Verification

- The stamped package backend run passed 35 tests with no failures; four fixture
  checks were skipped. Two skipped system-upgrade checks were then run separately
  against the exact previous production Hub and installer artifacts: both passed.
  The remaining two skips concern older permission fixtures. Populated Desk
  0.10/0.11/0.12 upgrades and lifecycle/Lunch preservation ran successfully.
- All seven affected applications passed their frontend smoke suites. Hub's
  upgrade regression now derives its expectation from the declared version;
  this test-only correction is committed separately at `777ae15`.
- Before/after comparisons confirmed unchanged connector access contracts, all
  six central policies and their effective per-person roles. All six apps report
  central permission enforcement. Canister settings and running status passed.
- Lunch's executable, settings and complete employee roster were unchanged.
- The live Desk domain serves the new modules, widget, guide and changelog with
  correct deployment values. The hosted support API returned the expected JSON
  404 for an unavailable widget, exercising the gateway's HTTP upgrade route.
- No synthetic customers, projects or tickets were created in production.

The operator's CLI identity has no linked portal session, so a live end-user SSO
sign-in was not performed. Role and sign-in behavior passed the isolated frontend
and backend suites; production policy enforcement was checked independently.
Successful customer submissions, approval actions and timed deletion were tested
with isolated fixtures, not production records. Earlier feature limits in
[WORKFLOW-VERIFICATION.md](WORKFLOW-VERIFICATION.md) and the customer support guide
continue to apply.

Sanitized publication, snapshot, job, preservation and test receipts are retained
in the operator's release archive. Personal roster/policy contents and sessions
are not included in this repository or that archive.
