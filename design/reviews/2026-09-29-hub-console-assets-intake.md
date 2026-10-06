# Product design review

- Standard version: 1.1.2
- App / module version / commit: Hub 0.37.1, Assets 0.17.1, shared SDK 0.14.1 / release candidate
- Surface and primary task: open the Hub console from an official app; recover from a temporary device-photo reading failure while registering hardware
- Roles and data scopes tested: global Hub Owner/Admin/Helpdesk navigation hint; ordinary and app-only admins remain without a console link; Assets administrator intake only
- Review date / reviewer: 2026-09-29 / Kebabstack release review
- Status: In progress
- Relevant rule IDs: NAVIGATION-06, STATES-03, STATES-05, FORMS-03, GOVERNANCE-07
- Previous manual steps / errors (measured, with sample): a temporary vision 503 left a disabled-looking intake path; mobile layout squeezed the photo beside the recovery copy
- Intended outcome and completion evidence: a global role-aware Hub link is shown in the shared top bar, and a failed read keeps the photo, retries once, then offers a clear manual path

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task, next actor, blockers and completion | Pass | 503 preview exposes one retry and manual entry; manual entry focuses Serial and preserves the photo in the draft |
| Positive and negative role / guest / project permissions | Pass | Hub role hint tests cover Owner/Admin/Helpdesk, ordinary member, inactive and app-only admin |
| Direct entry, Hub launch, deep link and session expiry | Pass | Console link targets `?console=1#/home`; linked-passkey entry is explicit; company SSO is not promoted to console authority |
| Loading, empty, partial, stale, error and forbidden states | Pass | Retryable 5xx, credential, usage-limit and malformed-result messages are bounded; stale responses are discarded |
| Retry, duplicate action, interruption and concurrent edit | Pass | One bounded retry, duplicate suppression and draft/session sequence guards are covered by focused intake tests |
| Input validation, draft preservation, save and review | Pass | Existing image limits remain; manual values are not overwritten by a late AI response |
| Lists, filters, counts, exports and pagination scope | Not applicable | No list or export behavior changed |
| Canonical logos, tokens, type, spacing and components | Pass | `npm run runtime:check`, `npm run brand:check` |
| Assembled initial viewport and first useful content | Pass | Desktop preview shows the recovery action beside the retained image; narrow preview reflows the image above the controls |
| Light/dark, 320 px reflow, desktop, text zoom and long labels | In progress | Light/dark, 320 px and 800 px previews checked; 200% text enlargement remains a manual certification item |
| Global bar remains visible during wheel/touch/keyboard scrolling | Pass | Shared mount host owns stickiness; 800 px preview reports top bar at 0 after the manual transition |
| Keyboard, focus, screen reader, contrast and reduced motion | In progress | Manual path focus and live status verified; full assistive-technology certification remains open |
| Privacy, secrets, retention and audience boundaries | Pass | Provider response bodies and keys are never rendered; no inventory record is created by recognition |
| Timezones, currency, source evidence and freshness | Not applicable | No time or money calculations changed |
| Notifications, automation history and recovery | Pass | Console link hides on expired, failed or changed-token heartbeats; intake recovery remains actionable |
| Contextual guide, help, changed behavior and changelog | Pass | Hub/Assets install and README guidance plus module changelogs updated |
| Representative task repeated after change | Pass | Photo retained → temporary 503 → bounded retry → manual device form verified in preview |
| Module tests and release checks | Pass | Pinned Mops builds/stable checks, backend security tests, frontend smokes, runtime/design/brand/release checks passed |

## Findings

| Priority | Rule ID | Observation / reproduction | User impact | Fix / owner | Status |
|---|---|---|---|---|---|
| P1 | STATES-03 | A provider 503 previously presented an opaque failure during photo intake | Registration appeared blocked | Keep the draft, retry once and expose manual entry / Assets | Fixed in candidate |
| P2 | LAYOUTS-07 | A 320 px viewport placed recovery copy beside the image | Text and controls were hard to scan | Stack the photo and copy below 600 px / Assets | Fixed in candidate |

## Deliberate exception, if any

- Rule / exact scope: Console API access still requires a linked Hub passkey.
- Reason and alternative considered: Company SSO currently authenticates app sessions, while console APIs authorize linked principals. Granting ephemeral SSO console authority would broaden the security contract; the link therefore starts an explicit matching-passkey flow.
- Owner / decision date: Kebabstack release review / 2026-09-29
- Compensating measure: Owner/Admin/Helpdesk roles receive the link, and a mismatched or ordinary passkey gets a visible explanation without logging out the company session.
- Review or expiry date: revisit with a dedicated SSO-console authorization design

## Delivery

- What was actually verified, and what remains untested: local preview, focused tests, backend authorization tests, smokes, pinned builds and release guards verified; full real-IdP and assistive-technology certification remains untested.
- Before/after task outcome, with measurement limitations: manual fallback is reachable after the first failed read; no production provider recovery is claimed.
- Known gaps and next action: run populated deployed-baseline upgrade and preservation checks, then publish the exact stamped bundle if authorized.
- Local preview / release candidate / deployed (with verification evidence): release candidate in isolated checkout; not deployed.
- Production authorization and release artifact reference, if deployed: pending explicit authorization for this new deployment.
