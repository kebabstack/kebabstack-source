# Product design review — Assets: labels for the selection, read photos again

- Standard version: design/STANDARD.md at commit of this review
- App / module version / commit: Assets 0.26.0 (release worktree, this commit)
- Surface and primary task: Devices list → select devices → print only those labels; re-read the stored photo of selected devices and take over corrected details
- Roles and data scopes tested: Assets admin (both flows), employee (neither button offered; backend refuses `rereadPhoto`/`applyReading`), AI off (read-again button hidden)
- Review date / reviewer: 2026-10-13 / Claude (owner request: four selected devices printed 165 labels; one AI attempt misreads too often)
- Status: Verified for the two flows below; not a full-app verification
- Relevant rule IDs: BEHAVIOR (one obvious next action, reversible defaults), STATES (empty/partial/error per row), AUTOMATION (AI proposes, a person confirms, history names the evidence), PERMISSIONS (admins only, backend-enforced)
- Previous manual steps / errors / task time: printing a subset meant filtering the list by search until only the wanted devices remained, or opening each device's label (4 devices ≈ 4 × 3 clicks); a misread serial meant retyping it from the photo on the device page
- Intended outcome and completion evidence: selection → one click → labels for exactly n devices; selection → one click → per-field proposals → one click applies, history entry with the photo

## Acceptance evidence

| Gate | Result | Evidence / limitation |
|---|---|---|
| Primary task, next actor, blockers and completion | Pass | smoke: `Print labels (2 selected)` / `Print labels (2)`; label card opens for the two devices; re-read card shows `MacBook Pro 14" → MacBook Pro 16"`, apply calls `applyReading`, status `1 updated` |
| Positive and negative role / guest / project permissions | Pass | PocketIC: member `rereadPhoto` → refused without an HTTPS outcall; member `applyReading` → refused; admin path succeeds |
| Direct entry, Hub launch, deep link and session expiry | Pass | admin re-checked after the vision call (`rereadPhoto` returns "access has expired"), as for intake reading |
| Loading, empty, partial, stale, error and forbidden states | Pass | per row: waiting, reading, no photo, failed (reason), confirms stored details, applied; low confidence (< 0.6) shown and left unticked |
| Retry, duplicate action, interruption and concurrent edit | Pass | one retry on a retryable vendor error (as intake); Close cancels a running read (late answers ignored); duplicate tag/serial refused by the backend as in manual editing |
| Input validation, draft preservation, save and review | Pass | empty proposals never replace stored values; nothing is written before Apply; backend `cleanInput` caps and normalises |
| Lists, filters, counts, exports and pagination scope | Pass | counts follow the selection; without a selection the head button keeps the filtered-list count |
| Canonical logos, tokens, type, spacing and components | Pass | shared `.card.flat`, `.btnrow`, `.status`; new `.reread-*` rules use `--ks-rule`, `--ks-muted`, `--ks-danger` only |
| Assembled initial viewport … (LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07) | Pass | review card sits under the selection bar, scrolled into view; no new top-level chrome |
| Light/dark, 320 px reflow, desktop, text zoom and long labels | Pass | three-column row collapses to two under 560 px; `overflow-wrap:anywhere` on serials and reasons |
| Global bar remains visible during scrolling (NAVIGATION-06) | Not applicable | no change to the global bar or scroll containers |
| Keyboard, focus, screen reader, contrast and reduced motion | Pass | native checkboxes with `aria-label`, status text in `role="status"`, buttons are `<button>` |
| Privacy, secrets, retention and audience boundaries | Pass | the stored photo never leaves the canister except to the configured vision model (as intake); no new storage; the AI key stays Hub-side |
| Timezones, currency, source evidence and freshness | Pass | history event carries the photo id that was read |
| Notifications, automation history and recovery | Pass | `edited · details corrected from the photo (read again with AI)` with photo; a wrong application is corrected by editing as before |
| Contextual guide, help, changed behavior and changelog | Pass | README "Device labels" and new "Reading photos again"; CHANGELOG 0.26.0 |
| Representative task repeated after change | Pass | smoke runs admin / admin-noai / member; PocketIC assets test |
| Module tests and release checks | Pass | `assets/test/run-smoke.sh`, `tests/security.test.mjs` assets block, `moc --stable-compatible` against the committed baseline |

Rendered evidence: local preview (`node assets/tools/preview.mjs`, `?demo=reread`) rendered with headless Chrome at 1280 × 900 and 800 × 1100, light theme: head button *Print labels (2 selected)*, bar buttons *Print labels (2)* and *Read photos again*, review card with one proposal ticked and one device without a photo. Dark theme and 320 px reflow not rendered; the 320 px layout is a CSS rule only.

## Findings

| Priority | Rule ID | Observation / reproduction | User impact | Fix / owner | Status |
|---|---|---|---|---|---|
| P2 | BEHAVIOR | Selection bar showed **Print labels** only after a bulk status change; the head button always printed the whole list | 4 selected devices printed 165 labels | Bar button always offered with the count; head button prints the selection when one exists / Claude | Fixed in 0.26.0 |
| P2 | AUTOMATION | No way to run the vision model again on a stored photo; a misread serial had to be retyped | Error-prone first read stays | `rereadPhoto` + review card + `applyReading` / Claude | Fixed in 0.26.0 |

## Deliberate exception, if any

- None.
