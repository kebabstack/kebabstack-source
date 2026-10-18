# Assets automatic inventory tags

- Standard: 1.2.0; Assets: 0.28.0; reviewer: Codex; date: 2026-10-15.
- Scope: all device creation, CSV import, editing and AI correction; populated upgrade.
- Status: local candidate; no production deployment in this review.
- Rules: FORMS-02/03/04, DATA-05, STATES-02, GOVERNANCE-03/04.

## Findings and behavior

P1: only registerDevice allocated a tag; CSV, MDM, Apple and legacy scan/create
could produce untagged devices. Editing, CSV and AI could overwrite tags.
Allocation now happens only in createInternal, in the same message as insertion.
A stable high-water counter survives archive, sample removal and upgrades. New
and legacy creation inputs cannot supply the inventory number. Editing rejects
a different tag; CSV matches by serial and ignores tags. Bulk uses serials to
identify potential existing devices instead of foreign inventory tags.

The first upgrade seeds the counter from normalized existing tag numeric suffixes
(including archived records) and fills blank tags in device-id order, recording
history. It does not renumber nonempty labels or alter invoice snapshots. Repair
runs synchronously before requests are served and is idempotent. Added primitive
stable fields preserve the pinned plain persistent actor model; no compiler,
library or enhanced-migration-chain conversion was introduced. Stable compatibility
is checked against the committed baseline, plus an actual 0.27.2 populated upgrade.

## Evidence and limits

| Gate | Result / scope |
|---|---|
| Backend integrity | Eight Assets security tests including atomic concurrent allocation, denied member creation, manual-edit rejection, CSV retry and tag preservation, sample removal without reuse, legacy repair and repeated upgrades. |
| Connected flows | Apple adoption/MDM preservation; sales, Finance and hardware/offboarding checks, including Lunch and central permissions preservation. Legacy Finance fixture requiring a separate historical baseline is skipped, not passed. |
| Frontend | Admin/member/no-AI smoke, photo batch tests: no editable tags or AI tag changes; foreign values never sent as new inventory numbers. |
| Responsive / navigation | Local synthetic preview at 390×844; tag read-only in editing; unchanged global bar remains visible after actual scrolling to the edit form. Existing shared styles, logos and navigation untouched. |
| Accessibility | Native read-only input semantics; tag removed from photo form. Full screen-reader, both-theme and 200% zoom certification not repeated. |
| Runtime / design | Canonical sync/check and design checks; no shared runtime source changes. |
| Upgrade boundaries | Existing nonempty tags preserved, including historical irregularities. Repair is in-memory during upgrade; no live inventory or user photo was accessed for testing. |
| Delivery | Local candidate; actual format-2 package verification and authorized rollout remain separate gates. |

The operator no longer enters or reconciles inventory numbers. No measured time
saving is claimed. CSV now requires serials; rows without serials are skipped,
and tag-only legacy import files are rejected with an explanation. Existing
serial-less devices can still be viewed/edited; new manual registration accepts
a model. Before the first allocation the scheme can be configured; afterwards it
is fixed and the next-number preview is not a reservation.
