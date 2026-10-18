# Assets general bug and UX review

- Standard: 1.2.0.
- Module: Assets 0.27.1, isolated branch `codex/assets-photo-workflow`.
- Reviewer/date: Codex, 2026-10-14.
- Status: scoped local verification complete; production release gates remain open.
- Scope: inventory, scan/register, photo batch and re-read, Apple reconciliation, sales/dealroom, Finance, hardware offboarding, settings, CSV and navigation.
- Roles: admin/member in frontend smoke; owner/admin/Finance/employee/buyer and denied access in backend suites.
- Relevant rules: NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07, shared identity and semantic tokens.
- No measured task-time or savings claim. Synthetic data only. No production access, identity reauth, export or deployment.

## Findings and disposition

| Priority | Finding | Fix and evidence |
|---|---|---|
| P1 | `registerDevice` could return success after photo storage rejected the evidence. | Shared photo validation before tag allocation/device creation. Empty, oversized and unsupported MIME negative tests plus successful evidence registration. |
| P1 | Scan commit could create a device or store a photo before rejecting the action/photo. | Validate action and photo before mutation. Tests assert no partial new device and no orphan photo on existing device. No new state fields or API change. |
| P1 | Clearing a previous bulk recipient could fall back to the previous person and assign hardware unexpectedly. | Preserve empty choice; unresolved directory input blocks registration. Regression covers choose, edit, clear, modal repaint and register. |
| P2 | Re-read review ignored note-only changes and deliberately cleared fields. | Note additions participate in review; manual empty edits are distinguished from absent AI proposals. Frontend smoke checks review and backend payload. Existing notes remain append-only in this workflow. |
| P2 | Defaults changed the displayed values of already registered batch rows after partial failure. | Only pending rows receive defaults in state and DOM. |
| P2 | Apple reconciliation required horizontal scrolling to connect serial and Add on phones. | Labelled cards at widths up to 700 px; desktop table retained. 320 px light/dark screenshots show serial, state and action together. |
| P2 | Storage-full guidance implied archiving frees photo bytes. | Removed that implication; guidance now asks IT to review capacity and retention. |

## Acceptance evidence

| Gate | Result | Evidence / limits |
|---|---|---|
| Primary task and completion | Pass locally | Photo registration/re-read smoke plus real Wasm evidence assertions. |
| Positive/negative roles | Pass in tested scopes | 7 Assets security tests; 4 Finance tests; 7 sales/hardware tests. |
| Entry, Hub links and session handling | Pass in scripted cases | Admin/member, AI unavailable, ticket/suite/rejected and canonical-route frontend smoke. |
| Failure, partial save, retry and duplicates | Pass in tested cases | 14 frontend unit tests, photo negative cases, payment and sales tests. |
| Concurrent edits | Partial | Re-read fetches latest fields before applying. It is not an atomic backend compare-and-set; a simultaneous edit between read and write remains possible. |
| Input review/save | Pass in tested cases | Recipient-clear and unresolved-recipient regressions, note-only/blank-field smoke, preserved photo evidence. |
| Lists, filters, exports | Partial | Functional smoke and backend sales counts/Finance exports; no large real inventory load benchmark. |
| Canonical design | Pass automated | runtime:check, design:check, brand:check; canonical files unchanged. |
| Responsive visual review | Pass for inspected screens | 320 px: scan, Apple, Finance payments/values, CSV, connections. 390 px: Devices, Sales, General settings. Apple also 800×900 and 1280×800; 320 px dark. Prior photo review has its own broader viewport evidence. |
| Navigation during scroll | Pass in tested views | Finance at 320 px, scrollY 1480, topbar y=0; Apple long cards also topbar y=0. Prior review includes short/desktop scrolling. |
| Accessibility | Partial | Labels and native controls checked; no full screen-reader, contrast, reduced-motion or 200% text certification. Physical iOS/Android camera/HEIC not tested. |
| Privacy/provider boundaries | Partial | Local permission/error tests pass. Real AI provider, MDM, ABM and notification delivery not exercised. |
| Notifications/history | Pass in local suites | Sales/offboarding/Finance tests; real delivery not tested. |
| Module checks | Pass | Pinned Mops install/check/build; committed-baseline stable compatibility; compiled DID and browser IDL unchanged. |
| Production and packaged upgrade | Not run | Two production-baseline upgrade tests explicitly skipped without baseline artifacts; candidate-to-candidate populated photo upgrade passes. No deployment authorization used. |

## Delivery and remaining gates

Local source candidate only. Changes are versioned as 0.27.1 and both changelogs agree. Browser screenshots are stored privately with the photo-review evidence (`audit-apple-320.png`, `audit-apple-dark-320.png`, `audit-apple-800.png`, `audit-apple-desktop.png`). They contain only fixture data; fixture Apple aggregate counts are intentionally simplistic and are not production data validation.

The public-source gate recorded in the preceding review remains blocked (88 findings at that checkpoint). This turn does not export or publish private source. Before rollout: resolve export review, build the format-2 artifact, exercise its packaged executables and production-baseline populated upgrade, then obtain the specific deployment authorization. Real label recognition needs representative phone photos on the configured provider. No blanket claim of an exhaustive security audit or full accessibility certification.
