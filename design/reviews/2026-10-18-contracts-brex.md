# Product design review: Contracts payment review

- Standard: 1.1.2; Contracts 0.21.0 candidate, codex/contracts-brex.
- Primary task: connect read-only card evidence in a space, decide its contract,
  answer missing details without locating each attribute in the contract editor.
- Reviewer/date: Codex, 2026-10-18. Status: Scoped local verification completed; live acceptance is recorded separately.
- Roles: owner allowed; editor and another personal space denied in real local backend tests.
- Rules: NAVIGATION-06, LAYOUTS-07/08, COMPONENTS-07, GOVERNANCE-07.
- Prior workflow: no Brex integration; no measured before/after time or savings.

| Gate | Result | Evidence / limitation |
|---|---|---|
| Task, next actor and completion | Pass | Test → card selection → review → attach/create → question → value preview → explicit save |
| Permissions | Pass locally | Owner/editor/cross-space and stale response negative tests |
| Deep links / session expiry | Partial | Local routes and existing suite smokes; real Hub launch not exercised live |
| Loading/error/stale/forbidden | Pass locally | Safe connection errors, pending import, empty/access states and stale AI tests |
| Retry and concurrency | Pass locally | Dedup IDs, retained cursors, 429 timer retry, revision checks |
| Input and explicit save | Pass locally | Existing validators; replacement confirmation; AI is preview only |
| Lists and evidence | Pass locally | 10k backend fixture, 65-group browser fixture, bounded search and pagination |
| Canonical runtime / brand | Pass | Shared assets, runtime/design/brand gates; neutral card navigation icon |
| Initial viewport | Pass scoped | 1280 desktop, 390 and 320 mobile; toolbar selector bounded |
| Reflow / themes | Partial | 320/390/800, desktop light and dark inspected; 200% text enlargement not certified |
| Global navigation scrolling | Pass scoped | Real scrolling on long queue/settings at desktop, 390×700, 320×640 and 1280×400; shared topbar remains visible |
| Keyboard / assistive tech | Partial | Labels, native controls, visible Tab focus from answer to AI checkbox and status semantics inspected; full screen-reader/contrast certification outstanding |
| Privacy / retention | Pass scoped | Token masked and never returned; card filter before persistence/AI; hosting and backup trust documented |
| Currency / freshness | Pass locally | CHF/JPY tests, signed evidence; last completed scan and partial progress visible |
| Automation / history | Pass locally | Explicit future-match rule; changed amount reopens; bounded decision history |
| Help / changelog | Pass | BREX.md served as brex-guide.md; install notes and 0.21.0 changelog |
| Repeated primary task | Pass scoped | Browser attached a synthetic group, answered tax question, previewed and confirmed, then saw next question |
| Release | Pass scoped | Final format-2 checksums and nine Contracts/Brex tests on stamped Wasm passed; see BREX-VALIDATION.md |

## Individual assignment follow-up

The 0.21.0 candidate adds selection of up to 50 individual payments, separate
contract assignment and per-payment history. Split groups disable automatic future
assignment and group-wide mutation. The split workflow was operated in the browser with two contracts at the same
vendor, separate histories and retained pending payments. Its backend regression
passed on the stamped package, including upgrade, stale revision, atomic rejection,
new imports, reopen and draft creation. The misleading historic group-contract
link was reproduced and removed; per-payment guide links remain available.

One payment cannot be divided into monetary portions. No full accessibility
certification or live Brex acceptance is claimed.
