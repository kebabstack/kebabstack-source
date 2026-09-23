# On-call service reporting

Status: **Desk 0.23.0 / Hub 0.31.0 alpha**, not a production payroll system.
The implementation supports dated company policies for readiness and actual work,
with money or time credits. A complete company reporting period must be reconciled
with the existing process before retiring a payroll spreadsheet. Phone delivery,
country-specific legal rules and payroll-provider integrations remain planned.
No tax, legal compliance or automatic-payment claim is made.

## IT operator: assign access once in Hub

Upgrade Hub and Desk together using tested release bundles. Existing app roles remain
unchanged. In **Hub → Permissions → Desk**, save central base roles, then open
**Desk reporting access**. Assign people or Hub groups to existing on-call projects:

| Capability | Allows | Does not grant |
| --- | --- | --- |
| Review time | Review confirmed readiness and actual work; attest evidence for an inactive participant | Rates, amounts or other people's payroll IDs; incident access |
| Prepare compensation | Set dated rules, prepare periods, map payroll IDs, propose/review corrections | Release or export without those separate grants; incident access |
| Release statements | Read calculations and release independently reviewed periods | Change policy, export without an export grant, incident access |
| Export approved payroll | Read and download released statements | Drafts, time approval, configuration, incident access |

Keep HR/Finance as Desk **Requester** and add only the relevant project capabilities.
Granting Agent would expose the existing support workspace. Base **No access** and
account deactivation override reporting grants. Global Hub Owner/Admin retain full
administration, but must obey the same separation-of-duties rules. Group grants are
additive; remove every applicable grant to withdraw a capability. Manual groups
carrying grants are owner-managed; trusted IdP groups continue to follow SCIM.

The supplemental grant is bound to the exact Desk backend, carried in the existing
Hub directory lease and checked on every protected reporting call. It does not
change Lunch or other roster integrations. Directory refresh normally runs every
30 seconds; a directory older than 60 seconds denies protected reads and writes.
Revocation is not instantaneous. Downloaded files cannot be recalled.

## Participant, reviewer and payroll workflow

1. Open **Desk → Service reporting → Compensation rules**. Choose hourly readiness
   or an allowance per full local calendar day, the response layers and reward (money
   or time credit). Set weekday/weekend/holiday rates for readiness and actual work.
   Review the server-calculated examples and activate from a local midnight. Choose
   **Actual work only** to omit readiness. Currency precision (0–3), payroll codes,
   cost center, explicit holiday dates and retention (30–3650 days) are under details.
2. Prepare a named period of up to 32 days, starting within the past year. Dates use
   the selected IANA timezone; UI rejects ambiguous or nonexistent local times.
   Existing project periods cannot overlap. Publication is not proof of service:
   assigned responders must confirm the imported, period-clipped readiness interval.
   Accepted replacements follow the effective published assignment.
3. Completed incident work is imported separately, using explicit recorded intervals
   and breaks. Incident titles, conversations, customer details and work narratives
   are not copied. Additional work can be self-submitted with a payroll-safe reason.
   Work spanning a reporting boundary must be excluded and split explicitly, including
   breaks; the system does not guess how to allocate those breaks.
4. A time reviewer approves another person's confirmed evidence or excludes it with
   a reason. For departed/inactive people, a reviewer can attest documented service;
   a different reviewer must approve that attestation. Historical person IDs and
   names remain; current eligibility does not rewrite past assignments.
5. Enter the company's payroll identifiers, never bank details. Mappings belong to
   this draft and freeze on release. Review missing coverage and record the evidence
   reconciliation. Same-person readiness overlaps and same-person work overlaps
   across retained statements block release; the other project's content is not
   exposed. Readiness and work can overlap because this alpha calculates them additively.
6. A separate authorized person releases the statement. A person cannot release a
   period they prepared, their own policy, their own payable claims or attestations.
   Admins cannot bypass these checks. Revision checks reject stale edits.
7. Download CSV through the protected export action. Its stable batch ID identifies
   the released snapshot. Repeated downloads produce the same bytes and are journaled.
   **Export is not payment**: your payroll process must reject duplicate batch imports.

## How the calculation works

New dated rules are immutable versions. The first can begin within the previous year
if it does not reach into an existing statement. Later versions start in the future,
after existing statement end dates and prior versions. Unused future versions may be
withdrawn; their history remains. Existing drafts and released statements never adopt
later rules. New periods must use whole local days in the rule's timezone. If a rule
changes mid-month, create separate statements ending/starting at that boundary.

The project has one reporting timezone and one explicit company holiday calendar.
This is not a per-person employment-jurisdiction engine. Saturday/Sunday use weekend
rates; listed holidays replace weekend/weekday rates rather than adding a supplement.
The backend resolves civil dates using generated IANA offset tables (2020–2040), not
client-supplied classifications. Each prepared statement snapshots its day boundaries,
classifications and rule. A later timezone database refresh cannot rewrite it.

Readiness is grouped by person, local day and response layer. Hourly pay uses elapsed
seconds. A daily allowance uses `covered seconds / actual seconds in that local day`:
a whole 23- or 25-hour day earns one allowance. Partial days and accepted covers share
it proportionally. Rounding occurs once per person/day/layer, so independent shares
can differ from an unsplit allowance by one minor unit. This is a **prorated full-day
allowance**, not a flat payment for any partial shift.

Actual work is summed per person/local day, less explicit breaks. A nonzero daily total
receives the configured minimum (0–1440 minutes), then rounds **up** to 1, 5, 6, 10,
15, 30 or 60 minutes. This is a daily minimum, **not a per-callout minimum**. Multiple
entries on the same day do not multiply it. A break-bearing interval across local
midnight blocks release and has no guessed calculation line; exclude and resubmit
split evidence with the correct breaks. Readiness and work remain additive.

Money uses integer minor units; time credit uses whole minutes. Both use integer
half-up rounding only after daily grouping: `(payable seconds × rate + divisor/2) /
divisor`. The divisor is 3600 for hourly rates and the local day's actual seconds for
a daily allowance. Neither rounding nor a time credit changes the evidence duration.

The shipped calendar was generated from IANA tzdb 2026c-rearguard.

The dated-rule CSV has separate `amount_minor` and `credit_minutes` columns, explicit
currency/precision, recorded/payable/divisor seconds, local day, rule revision and
source-record IDs. A credit has no currency. Configure the importer for this schema;
never sum cash and time columns or treat downloading as payment. Legacy hourly
statements retain their previous per-record calculation and CSV schema byte-for-byte.

Example rates in the local demo and tests are synthetic and are not pay recommendations.

## Corrections and retention

Released records and calculated lines cannot be overwritten. Voiding a source work
entry invalidates its draft evidence; the record must be excluded and replaced. Late-added incident work and a
late source correction flag a released statement while leaving its export unchanged.
Create a linked correction with a reason and signed amount for a participant on the
original statement. Another compensation preparer reviews it; an independent releaser
then approves a separate batch. Money corrections use `ADJUSTMENT` and the original currency/precision. Time-credit
corrections use `TIME_ADJUSTMENT` and signed whole minutes. The selected unit must
exist for that person on the original statement. Review this code with your payroll importer. The original warning
remains historical evidence; it does not automatically certify a correction's sufficiency.

Automatic deletion follows **period end + the snapshotted retention days**, independently
of shorter incident retention. Reads and exports deny access at expiry; a bounded
10-second sweep removes records, lines, mappings and review journals (up to ten periods
per sweep). Linked corrections expire with the original period and must be made while
it is retained. Company rule history remains (up to 64 versions per project); statement-specific
rule/day snapshots and correction units are deleted with the statement. Minimal project/time ranges
without person identities or amounts remain for 366 days after period end to prevent
re-creating a paid period after payroll payload deletion. Normal creation accepts only
the last year's periods. Retention of downloaded exports and backups is an operator
responsibility; older backups can contain deleted records and must expire separately.

Capacity in this alpha: 200 retained periods, 200 records per period, 5000 retained
records, 2400 range markers, 1000 journal events per period. Limits fail visibly; evidence is not silently
truncated. Long or large rotations may require shorter reporting periods. If a journal
is full, financial mutations and further export downloads stop; plan retention and
operational capacity before a wider rollout.

## Executive decision and pilot gate

The intended benefit is removing duplicate scheduling-to-payroll transcription while
keeping independent review. Savings have not been measured. Record the time currently
spent preparing one period, then compare it with preparation, exception review and
payroll import time during the pilot. Do not infer savings from the number of shifts.

Pilot acceptance: reconcile all people, replacements, breaks and amounts for one whole
period; test an inactive account, a correction, an access revocation and retention;
confirm payroll imports preserve the batch ID and signed adjustments. Only then choose
Desk as the reporting authority. Existing spreadsheets remain authoritative until that
cutover is agreed. Controllers and deployment administrators retain platform-level
powers; app permissions are not a confidentiality boundary against those operators.

## Local verification for this candidate

Both pinned Motoko builds and the actual ICP recipe executables were exercised.
Stable compatibility was checked against the committed Hub/Desk signatures and the
saved pre-reporting candidates, without replacing those baselines. Tests cover:

- Seven reporting backend scenarios: scoped grants, no-self-approval, exact amounts,
  CSV safety, repeat exports, late/voided work, linked corrections, departed people,
  overlapping records, expiry, retry safety and DST elapsed hours.
- Populated Hub 0.29 / Desk 0.18 upgrade, followed by another upgrade with approved
  reporting state; the older committed Desk planning-upgrade test also passes.
- Eleven current central-permission scenarios including the Lunch roster/filter
  upgrade test; nine selected identity, directory and Desk security regressions.
- Hub and Desk frontend smokes, scoped reporting UI, canonical-link handoff, generated
  bindings, SDK-copy consistency and release metadata.

The historical all-six-app legacy migration test requires other apps' old baseline
artifacts and was excluded from this candidate's final permission run. The changed
Hub and Desk received populated upgrade tests described above. These checks establish
local behavior, not a completed company payroll pilot or production paging reliability.

### Partial coverage changes (Desk 0.20)

Readiness uses accepted effective intervals, including partial replacement and future
coverage cutoffs. An open statement blocks release when imported readiness differs
from its source. **Refresh records** retains obsolete entries as excluded evidence
and imports replacements for review. Repeated refresh cannot pay both assignments.
Changes outside a statement's interval do not invent service within it. Published
operational status is not payroll evidence and is never imported into statements.

### Compensation candidate checks (0.22)

`tests/oncall-compensation.test.mjs` exercises a complete October with a holiday on
the DST fallback day, accepted partial cover, departed-person attestation, daily
minimum aggregation, separate time credits, signed corrections, immutable repeat
exports and expiry. Additional cases cover 23-hour spring days, half-hour DST and
quarter-hour UTC offsets; released dated statements also survive an upgrade. Negative cases cover unauthorized configuration, stale versions,
invalid dates, wrong units, rule boundaries and ambiguous break allocation. The
populated 0.21 upgrade retains a released legacy CSV; a second upgrade retains dated
rules and their statement snapshots. All scenarios use isolated local identities.

For rule/calendar maintenance regenerate `backend/reporting/ZoneData.mo` with
`python3 desk/tools/generate-payroll-zones.py` from a deliberately reviewed local tzdb.
Re-run the DST/holiday tests, package a normal release and document the tzdb change.
Never silently fetch or replace timezone rules in a running financial calculation.
