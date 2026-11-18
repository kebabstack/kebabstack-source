# Falcon endpoint alerts in Desk, Operations and shared screens

Desk 0.39.0 and Hub 0.47.0, reviewed 17 November 2026 against product standard 1.2.0.

| Workflow | Verification |
|---|---|
| Close an internal endpoint alert | The provider editor showed four statuses and three closing classifications. The local integration test exercises each classification, a failed confirmation, a concurrent console decision and adoption of an already closed alert. |
| Show counts at a glance | The Operations and display UI tests cover unavailable totals, delayed sync and confirmed zero. A Trust-only profile can opt into two aggregate counts and the last successful sync. Existing Trust-only approvals retain their scope. |
| Permission and retry | The integration tests exercise staff-only edits, confirmed writes, tenant changes, and removal of screen access. Provider telemetry and incident identities are excluded from the screen payload. |
| Limits | No task time or assistive-technology certification was measured. The tests exercise the screen client and local canisters. Physical TV and tenant confirmation are separate operational checks. |
