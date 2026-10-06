# Forms → Desk public intake review

- Standard: existing integrated Brand & Product System; canonical runtime unchanged.
- Candidate: Forms 0.6.0 / Desk 0.28.0, branch `codex/forms-desk-intake`.
- Task: publish a themed public form and hand accepted responses to a selected
  customer project without another support workflow or exposed integration key.
- Status: alpha candidate; scoped checks below. Not a full accessibility or
  production-hosting certification. No production deployment in this change.
- Prior manual workflow: embedded Jotform and notification emails. No measured
  task-time or cost saving is claimed.

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Ownership and next step | Pass (scoped) | Publish & connect; drawer shows delivery state and authenticated Desk link. Routed responses reject Forms review/assignment mutations. |
| Permissions | Pass | Local canister tests reject unauthorized configuration, caller/form mismatches, employee ticket reads and response-context reads. |
| Retry and upgrade | Pass | Exact public retries, legacy-endpoint rejection for configured forms, queued delivery after upgrade, no duplicate ticket, committed-release populated upgrade. |
| Privacy | Pass (scoped) | Explicit unverified context, no automatic parent URL collection, opt-in retention with grace, secret not returned publicly. Desk copies retain their independent policy. |
| Mail | Deliberately inactive | Provider-neutral adapter contract prepared; no worker, credentials, verified-recipient workflow or external sending yet. UI says not connected. |
| Visual identity | Pass (scoped) | Shared tokens and logos; design, brand and runtime release guards pass. No custom app palette. |
| Responsive embed | Pass (scoped) | Actual browser at 320 px: host scroll width 320, iframe/body 272; no horizontal overflow. Auto height 1242 before content cleanup. Dark and light embed inspected. |
| Global navigation | Pass (scoped) | Publication view, desktop actual scrollY 1078.5: shared topbar top 0 and height 61. |
| Public submit | Pass | Browser synthetic fixture reaches numbered confirmation; backend tests separately verify acceptance/validation/handoff. Preview is not a live backend connection. |
| Keyboard and screen reader | Partial | Contact labels exposed in accessibility tree, real inputs/buttons; full keyboard/zoom/assistive-technology audit remains. |
| Real host integration | Pending | Target gateway CSP, mobile in-app browsers and anti-abuse infrastructure must be tested before replacing production Jotform. |

## Deliberate boundaries

- First Desk handoff uses customer projects and request types without required
  extra fields. All form answers appear in the ticket message.
- Origin allowlist plus parent handshake governs browser embedding, not public
  submission authentication. Honeypot/quotas are not human verification.
- Forms does not import old Jotform submissions, automatically verify ownership
  of a reported resource, or resolve/restore a suspended application.
- The external mail adapter is a documented contract, not an implemented sender.
- No Lunch, central permission policy or production project was modified.

## Recovery and operations

See `forms/INTAKE.md` for queue retries, pausing, changing destinations, deletion
of separate copies and operator checks. Ten failed network attempts require
operator retry; definite Desk rejections stop automatic retries immediately.

## Recorded checks

- Stable signatures compared against committed `7fbb31d` baselines before promotion.
- Populated Forms 0.5.2 → 0.6.0 and Desk 0.27.1 → 0.28.0 upgrades passed.
- Combined local intake/customer suite: 12 passed; two unrelated historical
  upgrade fixtures skipped. Run serially because PocketIC's port-file naming
  can collide between test subprocesses sharing a parent.
- Forms-specific permission/availability regressions: 3 passed.
- Forms frontend: admin/member/public smokes and embed source/origin test passed.
- Desk frontend suite: 98 passed before the additional Forms-source case;
  customer-project subset with the new case: 12 passed.
- Design/runtime/brand guards, generated binding drift, release metadata and
  whitespace checks passed. Release-packaged executables remain a rollout gate.
- Final browser reflow check: host 320/320, iframe body 272/272 client/scroll
  widths; radio control width 13 px after correcting an overly broad field rule.
