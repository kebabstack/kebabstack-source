# On-call planning and incident response in Desk

Status: **Desk 0.23.0 alpha**, deployed to the workspace on 19 September 2026. Planning and native incident
response, scoped HTTP intake and recovery signals are implemented. This is part of the broader
[on-call, incident and reporting design](../docs/DESK-ONCALL-DESIGN.md), not a verified
production paging service. Vendor-specific monitoring adapters, external paging
adapters and AI assistance remain planned. Status publication is a separate [status alpha](STATUS.md). Scoped HR/Finance statements and payroll CSV are implemented in the separate [reporting alpha](REPORTING.md). Keep the existing paging and compensation authority.

## Set up a team

1. In Hub, give responders the **Desk Agent** role and membership of the intended
   support group. Active Hub owners/admins and Desk admins retain inherited access.
2. In Desk, open **On-call → Set up on-call**. Choose **Internal operations** and
   its Hub team, or attach On-call to an existing customer project. A customer
   workspace also links directly to its enabled on-call module. Internal operations
   create no public form, customer contact or widget. Optional monitoring source
   keys are a separate write-only contract.
3. Name the project and the services it covers. Alert sources bind to one of these service labels. Routing still follows the
   project’s shared response policy; there are no per-service policies yet.
4. Choose continuous coverage, weekdays 08:00–18:00, or after-hours 18:00–08:00 plus
   weekends. Set an IANA timezone, first day, handoff time and daily/weekly rotation.
   Select people in rotation order; an optional backup rotation uses distinct
   people when its shifts overlap primary duty.
5. **Review plan** saves an administrator-only draft. Review exact dates, local
   handoffs and uncovered intervals. Change individual assignments if necessary,
   then save to revalidate. **Test this plan** checks a time without sending any
   messages. Publication requires explicit acceptance of any remaining gaps.
6. **Publish plan** makes the reviewed dates visible to the team. The published
   dates and original assignments are preserved. Plan the next period before the
   displayed coverage end; plans never extend themselves. Opt-in planning reminders warn the designated contacts when another published period is needed.

The templates expand a finite 1–12 week period using the browser's IANA timezone
rules. Each period stores reviewed absolute start/end instants. The backend checks
bounds, overlapping windows/shifts, team eligibility and concurrent revisions;
subsequent timezone catalogue changes do not rewrite the stored instants. Local
handoff times that are missing or repeated during a clock change are rejected;
choose another handoff time. The default handoff is 09:00. Regeneration is required
if a draft's first date passes before publication.

## Cover and handoffs

The project shows current duty, the next shift, required coverage gaps and the
period's end. Published views check every 30 seconds while visible. Unchanged
checks preserve inputs; changed plans wait until you finish interacting before
repainting. Access loss clears the view even with a cover form open. An explicit
refresh replaces the view; the last check is shown. Connection failure shows an
unavailable state rather than a healthy zero.

For a future whole shift, the assigned responder or an administrator can request
an eligible replacement and give a short reason. The original assignment remains
in effect until the replacement selects **Accept shift**. Administrators cannot
accept on another person's behalf. Decline and cancellation preserve the request
history; acceptance checks the target's current eligibility and overlapping layers.
Opt-in planning reminders can notify the substitute through Hub. Future parts of
an ongoing shift can also be requested; past service cannot be rewritten. Incident
ownership uses a separate accepted handoff.

Hub deactivation, role loss or removal from the project group makes future/current
coverage unresolved once Desk receives the directory update. It does not erase
original assignments or accepted replacement records. Incident response, when explicitly enabled below, uses its configured fallback.
Changing coverage does not transfer an incident that someone already owns. People and decisions use stable Hub person IDs; reusing
an email address does not transfer their planning records to another person.

## Respond to an incident

1. Open the project’s **Incidents → Set up response**. A Hub-assigned Desk admin
   chooses the acknowledgement timeout (1–60 minutes), an eligible fallback and
   retention (30–365 days after resolution). Desk needs its canonical HTTPS URL,
   a Hub connection and the Hub `notify` lane. New incidents snapshot these rules;
   changing configuration does not rewrite existing response or retention.
2. **Report an incident** selects a service already named in this project, impact
   and known facts. Reporting is authenticated and project-scoped. All impact
   levels use the same configured timing in this alpha. Monitoring webhooks and
   API keys are not connected; do not run unattended integrations with a personal
   session token.
3. Desk resolves the current published primary layer, then subsequent layers at
   the configured acknowledgement deadline, then the explicit fallback. Missing
   coverage moves to the next stage on the next timer check. No plan routes
   directly to fallback. An exhausted response stays open with a visible manual
   action; there are no unlimited repeats or invented recipients.
4. **I’m on it** atomically assigns the signed-in person and stops future
   escalation. Another responder cannot overwrite that acknowledgement with a
   stale action. Any currently eligible team member may take responsibility.
   Active owners remain assigned through schedule changes. Loss of their current
   Hub role/team eligibility reopens the incident after a fresh directory check.
5. Add internal updates beside the response timeline. **Handoff or resolve**
   requests a replacement with a summary; the old owner remains responsible until
   the selected recipient accepts. Admins cannot accept on somebody else’s behalf.
   Resolution requires an acknowledged incident and a recorded verified outcome.
   Monitoring recovery events can add recovery evidence. Resolution still requires a responder; a green signal never closes the incident automatically.

### Delivery evidence and availability

Pending jobs, retries and acknowledgement deadlines are persisted and timers are
recreated after an upgrade. A 10-second timer checks response; it is not a hard
real-time guarantee. Each delivery has up to three attempts, separated by backoff,
a dispatch lease and a stable Hub deduplication key. Provider rejections surface
the Hub reason (for example a missing notify lane); uncertain calls are not labelled
as confirmed delivery. At most eight calls are started
per timer pass. Directory staleness pauses delivery and denies protected access.
A paused project prevents new incidents; existing response continues.

**Hub accepted** means the Hub accepted the notification into its return lane.
It does not mean a phone received it or a person read it. Hub preferences control
bell and configured chat delivery; the Hub's own quotas and channel limitations
still apply. Desk sends a generic incident reference and protected deep link, not
incident notes, customer data or work records. If acknowledgement races a call
already dispatched, that notification may still arrive; it cannot reopen or
reassign the acknowledged incident. Handoff notices use the same queue.

Before operational use, test the configured provider and actual recipient device,
acknowledgement, missing coverage, disabled recipients, provider/Hub outage and
recovery. These local tests do not establish end-to-end device delivery. Native
Hub delivery is one implemented channel, not phone/SMS paging or PagerDuty parity.
Keep an independent emergency communication path for a Hub/engine outage.

### Actual work and retention

A responder records **their own** real start/end instants, breaks and short work
summary. The incident’s open duration and time since acknowledgement are never
converted to worked time. Entries must start after incident creation, end in the
past and span at most 24 hours each. Overlapping own entries are rejected across
projects without exposing the other project. Correct an entry by voiding it with
a reason and adding a replacement; the original remains visible until retention.

These entries are visible to the incident’s authorized response team. They are
**unreviewed operational records**, not compensation claims, payroll approvals or
wage calculations. Desk 0.19.0 imports minimal evidence into the separate [Service reporting](REPORTING.md) area, protected by project-scoped Hub capabilities. Do not use broad Agent/Admin grants as a
substitute for scoped reporting.

Each incident carries its creation-time retention policy. Resolved incidents
expire after that many days; unresolved incidents expire 365 days after creation.
Reads and actions reject expired records immediately, and a timer deletes up to
ten expired incidents per pass with their timeline, handoff, delivery and work
records. Existing Hub/chat notifications and historical backups need separate
rotation/deletion handling. There are no incident holds or retention overrides. The separate reporting alpha retains its imported service evidence according to the statement policy; incident deletion does not erase that retained statement.

Capacity bounds: 200 retained incidents per project, 1,000 overall, 5,000 delivery
records overall/100 per incident, and 5,000 work entries overall/100 per incident.
User timeline additions stop at 180 events, leaving bounded system-event capacity.
Quota exhaustion is explicit; it does not claim successful delivery. These are
safety bounds, not a measured capacity or availability guarantee.

## Access and data boundaries

- Administrators create projects, edit drafts and publish plans. Agents can view
  published plans for their Hub team and participate in eligible cover requests.
- Requesters receive no on-call access or navigation. Attaching On-call to a customer
  project uses its existing team boundary; it does not widen customer-ticket access.
- Drafts, direct API reads and all mutations enforce authorization in the backend,
  including Desk's existing directory freshness lease. There are no local admin
  grants. Group references currently use the same Hub group names as customer
  support; do not rename/reuse a referenced group without reviewing its consumers.
- HR/Finance capabilities are implemented in the separate reporting alpha. Do not grant Desk Admin or Agent solely to obtain payroll reporting: those roles have broader content access. Use Requester plus project capabilities in Hub.
- Published names and accepted replacement decisions are stored as planning
  evidence, not attendance confirmation or approved compensation. Planning stores no wage rates, payroll identifiers, bank details or customer conversation text. Separate reporting holds scoped rates and payroll identifiers; it does not collect bank details.

## Current limits and pilot decision

Single-region templates and up to three ordered regional rotations generate finite
published UTC intervals. Regional hours use browser IANA timezone data; review
clock-change weeks before publication. The plan retains one display timezone.
Daily/weekly rotations, whole or partial future cover with consent, project
availability, cancellations, archive/restore and planning retention are implemented.
There may be at most 30 projects, 128 stored plans per project and 512 plans overall.
Each plan spans at most 93 days, with up to six response layers, 400 windows,
400 shifts, 200 whole-shift and 200 partial-cover records. The authoring UI exposes
primary and backup. Holiday dates are explicit; holiday feeds and leave-system
synchronization remain planned. Statutory allowances and verified device paging
are not implemented. Planning reminders support operations but do not constitute
a paging or availability guarantee.

Use this slice to evaluate planning, clarity and permissions with synthetic or
explicitly approved pilot data. Keep the existing duty/notification authority and
payroll source in place. An executive decision to replace those processes needs
verified delivery/escalation, reviewed HR/Finance period reconciliation and the
remaining migration/retention controls, not just a successful calendar preview.

## Local preview and verification

Install pinned dependencies with `npm ci` at the repository root. In `hub` and
`desk`, run `mops install`, `mops check --fix` and `mops build` with the repository's
pinned toolchain, then from the root:

```sh
node desk/tools/oncall-preview.mjs
```

The loopback-only preview at `http://127.0.0.1:4186` creates disposable real local
Hub/Desk canisters with synthetic people. It supports switching between an admin
and responders, saving drafts, publication, accepting cover and working a synthetic
incident. Hub receipts in the preview come from its disposable local Hub. It never contacts
a production Hub or an external messaging provider. Stop the process to discard the data.
`KEBAB_PREVIEW_PORT` can select another local port.

Verification commands:

```sh
bash desk/test/run-smoke.sh
node --test --test-concurrency=1 tests/oncall.test.mjs tests/oncall-response.test.mjs tests/oncall-alerts.test.mjs tests/customer-support.test.mjs
KEBAB_ONCALL_BASELINE=/path/to/committed-prior-desk-build node --test tests/oncall.test.mjs
# Also verify the executable built by the deployment recipe (after icp build backend in desk):
KEBAB_CUSTOMER_WASM=desk/.icp/cache/artifacts/backend KEBAB_ONCALL_BASELINE=/path/to/committed-prior-desk-build node --test tests/oncall.test.mjs
```

The response-specific populated upgrade uses `KEBAB_RESPONSE_BASELINE` pointing to
a compiled 0.16 planning candidate. It also verifies a second upgrade with a pending
notification job.

The baseline directory must contain `backend.wasm` and its generated `backend.did`
from the committed prior release. The populated upgrade case preserves employee
and customer tickets, effective Hub policies, settings and published planning
history through a second upgrade. Also check `moc --stable-compatible` against the
committed `.most` before replacing any baseline; do not treat fresh installation
as upgrade verification. Generated bindings come from `tools/sync-bindings.py desk`.
The timezone identifier allowlist can be regenerated with
`node desk/tools/generate-timezones.mjs`; review its recorded ICU/tz version.

A production rollout needs a tested format-2 Kitchen bundle and authorization for
that rollout. This local alpha does not update the published release catalogue.

## Connect monitoring

This local alpha adds a **generic server-side event contract**, not a catalog of
vendor adapters. An operator may need a small adapter that maps the monitor's
payload and preserves occurrence IDs, event sequences and original timestamps.
There is no subscription cost claim or verified delivery guarantee. Do not retire
an existing paging authority before testing the complete incident/delivery path.

1. Configure the project's response timing/fallback under **Incidents → Response
   settings**. Publish coverage or deliberately use the fallback outside coverage.
2. Open **Alert sources → Connect a source**, choose its fixed service, name and
   key lifetime (1–365 days, default 90). The source begins **paused**.
3. Copy the once-displayed key into the integration's secret store. The backend
   stores only its SHA-256 digest; the frontend does not persist it. A lost
   creation response is safely repeatable but cannot reveal the old key: refresh
   and rotate. Never put a key in a browser widget, URL, screenshot or repository.
4. Run the source page's connection test from the integration host. It validates
   endpoint/credentials without creating an incident or notifying anyone. Refresh
   the page, then **Enable source**. Testing does not prove future monitor health.
5. Send a controlled firing event and check the incident and its delivery evidence.
   Acknowledge it explicitly, send recovery, verify the service and resolve it.
   Remove any exercise data under the ordinary retention policy.

Only Hub-assigned Desk administrators manage/list source configuration. Source
keys are machine credentials independent of their creator's employee session;
removing that person does not automatically revoke the integration. Revoke the
source explicitly during credential ownership changes. Responders retain their
project-scoped incident access and can see the signal without seeing credentials.
The alert-source extension does not grant HR/Finance access; configure the separate 0.19 reporting capabilities in Hub.

### HTTP contract

Send `POST https://<DESK-BACKEND>.<gateway>/oncall/v1/sources/<id>/events` with
`Authorization: Bearer <64-hex-key>` and `Content-Type: application/json`.
The frontend domain does not serve this API. A browser `Origin` header is rejected;
this is an additional browser restriction, not authentication. CORS is not enabled.
Duplicate Authorization headers are rejected. The query gateway upgrades this
request to an update; no incident is created by a query call.

All seven JSON fields are required **strings**; unknown/duplicate fields are
rejected. Source configuration fixes the project and service; the sender cannot
supply a different project/service, assign a person or change response policy.

```json
{
  "alertId": "healthcheck-outage-001",
  "sequence": "1",
  "occurredAt": "<original Unix time in milliseconds>",
  "state": "firing",
  "title": "API health check failed",
  "detail": "Synthetic exercise. Verify before closing.",
  "severity": "major"
}
```

- `alertId`: unique per outage occurrence, 1–128 ASCII letters/numbers or `.-_:`.
  Use a provider occurrence ID, or a persisted monitor fingerprint plus its firing
  start time. A monitor name alone is not an occurrence ID. Never include PII.
- `sequence`: positive increasing integer string up to 9007199254740991, scoped to
  this occurrence. Persist the exact event for retries. No float/JSON number.
- `occurredAt`: Unix milliseconds string, at most 24 hours old or 5 minutes ahead.
  Later sequences cannot move the observed time backwards. These are source
  observations, not a trusted clock or proof of continuous availability.
- `state`: `firing` or `recovered`. Recovery retains every other required field.
- `title`: 3–160 characters; `detail`: up to 2000. Only the first firing payload
  becomes the incident narrative. Later payload bodies are not appended/stored;
  signal transitions are recorded separately, up to 20 timeline transitions.
- `severity`: `minor`, `major`, `critical`. All use the same project response timing.

`POST .../test` uses the same headers and an empty object `{}`. It works while
paused, validates credentials, records a connection-test timestamp and returns 200.
It never creates an incident, checks a monitor schedule or verifies device delivery.

| HTTP | Meaning and operator action |
|---|---|
| 202 | New incident durably created and response queued. Not a delivery receipt. |
| 200 | Connection test or accepted repeat/recovery/older/closed occurrence; inspect `outcome`. |
| 400 / 413 / 415 | Invalid fields, timestamp, body size or content type; correct sender. |
| 401 / 403 | Invalid/expired/revoked key or browser origin; fix credentials/integration. |
| 404 / 405 | Wrong path/method; use the backend POST endpoint. |
| 409 | Paused source, changed payload at an existing sequence or backwards time; correct before retry. |
| 429 | Request or storage bound reached. Rate failures: wait at least 60 seconds, retry exact event with backoff. Storage failures need operator action. |
| 503 | Project/incident response unavailable or new incident creation paused; inspect configuration, retry with backoff. |

Responses contain `outcome` and `incidentId` (string or null), without incident
contents. An expired incident ID can remain in a retry receipt; it grants no access.
Persist and retry the **same** event after uncertain network errors. Do not replace
its timestamp or sequence. Once an event is older than 24 hours, inspect Desk and
the monitor before deliberately issuing a new observation; do not blindly replay
an offline backlog with new timestamps.

### Ordering, recovery and human ownership

The source ID and digest of `alertId` identify one occurrence. Equal sequence and
identical normalized payload is a duplicate; equal sequence with changed content
is a conflict. Lower sequences are ignored without replacing the latest signal.
Higher sequences update the signal, without changing the original title, severity,
response policy, escalation, owner or acknowledged status.

Recovery arriving before firing stores a marker without an incident. A delayed
firing event for that occurrence cannot create one, even with a higher sequence.
A human-resolved or expired occurrence never reopens from subsequent events. A
**new outage requires a new occurrence ID**. Flapping before human resolution
updates the existing signal and keeps the same response. A source is fixed to one
service and two distinct sources intentionally do not deduplicate each other.

Recovery is visible next to the incident timeline. It does not cancel escalation,
acknowledge responsibility, close the incident or create a work record. If the
team resolves while monitoring still fires, both facts remain visible.

### Keys, limits, outages and retention

Pause refuses all event intake with 409, but credential-only tests remain allowed;
existing incidents and escalation continue. Resume deliberately and follow the
24-hour event age rule. Rotation keeps the previous key for at most 15 minutes
(or its earlier original expiry); the newly displayed key has the chosen lifetime.
Concurrent/stale rotations are refused. Revocation immediately rejects both keys
and cannot be reversed. For a suspected credential leak, revoke and create a new
source rather than using the overlap window. Repeating an uncertain rotation may
require refreshing and rotating once more; a secret is never retrievable later.

Bounds: 10 non-revoked sources/project, 300 retained source records/Desk,
60 authenticated requests/minute/source, 600/minute/Desk, 8 KB body, 40 headers,
2000 occurrence markers/source, 20000/Desk, plus the existing 200 incidents/project
and 1000/Desk. Rate and size checks do not provide infrastructure-level DDoS
protection. Do not split sources merely to evade capacity limits.

Intake credentials do not depend on the directory lease. Desk can durably create
an incident during Hub unavailability; the notification worker pauses until the
directory is fresh, and protected staff reads remain denied. The page's last
accepted event means traffic was received, **not** that the monitor is healthy.
Authenticated failures retain only a fixed reason and aggregate count. Invalid-key
and oversized/unauthenticated failures are not attributed to source history.

Incident payload, work and timeline retain their existing policy. Minimal occurrence
markers contain source/incident IDs, alert/payload digests, sequence, condition and
timestamps, not raw alert identifiers or bodies. They expire 731 days after first
receipt, long enough to outlive the maximum incident lifetime (an incident resolved
just before day 365 can remain another 365 days). Cleanup removes up to 100 markers
per sweep. Exact replays also fail the 24-hour timestamp window after markers expire;
never reuse an occurrence ID for freshly timestamped events.
Revoked source metadata is removed after 90 days; old key digests are cleared when
the overlap expires. Expired sources stay visible until rotated or revoked. These
are bounded alpha policies, not customizable retention/holds or a privacy certificate.
Restoring an old snapshot also restores old keys/dedup state: isolate intake, revoke
restored credentials, reconcile incident/deletion history and rotate backups before
reopening. No automatic on-call deletion-journal reconciliation is shipped.

For populated response → sources upgrade tests, set `KEBAB_ALERTS_BASELINE` to a
saved 0.17 build directory and run `tests/oncall-alerts.test.mjs`. This checks an
upgrade with existing incidents and a second upgrade with live source credentials
and accepted-event markers. Run against `KEBAB_CUSTOMER_WASM` set to the recipe's
actual executable as well as the ordinary Mops build.

## Service reporting

The scoped compensation reporting alpha is now implemented locally. Open **Service reporting** in Desk; assign HR/Finance access only through Hub. [REPORTING.md](REPORTING.md) describes the workflow, independent approvals, CSV and retention. Broader country/payroll rules in the design remain planned.

## Everyday planning (0.20 local alpha)

- **Plan next period** reuses the latest future end/timezone and prefills the eligible
  roster after the last planned responder. Review manually changed rotations; the
  original recurring pattern cannot always be inferred. Nothing extends automatically.
- **Public holidays & closures** accepts explicit local dates. Working hours omit
  them; after-hours coverage includes the full day; continuous coverage stays unchanged.
  These dates do not set pay rates or determine statutory holidays.
- **Availability** records project-specific unavailable time without a private reason.
  People enter their own time; Desk admins may enter it for the team. Coverage stays
  assigned until a replacement accepts. Warnings and new response targets account for
  absence; existing incident ownership is retained. Started absence stays historical.
- **Request cover** can cover a future portion of an ongoing shift. Only the recipient
  accepts. Hub eligibility, ownership, absence, pending requests and published service
  across projects are rechecked. Other projects' details stay private. Requests appear
  in Desk. Opt-in planning reminders use Hub; verified mobile paging remains a later stage.
- **Plan history & actions** exports original plans and replacement history as JSON.
  Downloads contain personal service data and need company retention/access controls.
  Admins can discard a draft or stop future coverage with a reason. Past service and
  incident work remain intact.
- **Settings** allows naming, appended services, history retention and archive/restore.
  Resolve incidents, pause sources, disable status and end remaining coverage first.
  Archived projects retain scoped reports/history until automatic retention removes them.

Planning history defaults to **730 days after the original period end**, configurable
400–3650 days, with a seven-day deletion grace after policy changes. Overlapping,
retained, unreleased payroll periods protect source plans. At most ten plans are
removed per timer pass. Availability expires 93 days after its end. Backups and
exports have independent retention. Bounds: 512 retained plans overall, 128 per
project and 200 partial-cover records per plan; discard unused drafts when needed.

Effective intervals feed coverage, new response targets and readiness reporting.
Refresh an open report after changing coverage: old evidence remains excluded and
replacement intervals require confirmation/review. Released CSVs stay immutable.
Readiness remains planned service, not measured work.

Regional rules and opt-in reminders are available in the 0.21 local alpha below.
Still planned: holiday feeds, automatic continuation, leave-system sync and an explicit policy for simultaneous
service across projects. The current version conservatively rejects double-booking
and generates each plan in one project timezone.

## Regional coverage (0.21 local alpha)

From **Coverage → Plan next period → Plan across regions**, add up to three regions.
Each has its own IANA timezone, hours (including overnight), daily or weekly primary
rotation, and optional backup on primary days or weekends/listed holidays. Primary
days are every day or Monday–Friday in the UI. A holiday is a date whose primary
window is omitted; weekend/holiday backup uses the region’s hours and does not
become primary automatically. Overnight shifts belong to the date they start.

Choose **24/7** when every primary hour needs coverage. **Only regional hours**
intentionally excludes time outside the configured windows. Region order is
explicit priority: an earlier region owns overlapping time in each response layer.
The preview shows elapsed primary hours and overlap removed from later regions.
Save the draft, inspect exact gaps/dates/people, then publish. A person cannot cover
primary and backup simultaneously. Absent/revoked responders and double bookings
against other published projects are checked by the backend before publication.

Periods start/end at midnight in the review timezone; an existing non-midnight plan
may leave a gap when switching models. The new draft and reminders expose that
transition; keep the existing plan until its replacement has been reviewed. Local
clock times which occur twice or do not exist are rejected rather than guessed.

Rules are reusable authoring metadata, not executable backend recurrence. The
backend enforces permissions and interval integrity; the browser expands IANA
rules and the administrator reviews their result. Published UTC intervals drive
routing and payroll evidence even if timezone data changes later. Next-period
rotations advance by elapsed local calendar days; weekends/excluded dates still
advance the rotation. Manual assignment edits are marked and not repeated as rules.
Holiday dates before the new period are omitted. Rules are deleted with their plan.

## Planning reminders (0.21 local alpha)

Open **Coverage → Reminders**. A Desk administrator enables the policy and selects
one to three existing project members as planning contacts. These contacts receive
no additional editing permissions. Existing projects remain opt-in after upgrade.

- Pending cover requests notify the requested replacement through Hub. One further
  reminder can be sent within 24 hours of the start, at least one hour after the
  initial request reminder. Recipient acceptance in Desk is always required.
- Planning contacts receive at most one combined warning per UTC day if the next
  seven days have a gap, unavailable responder, or lack contiguous published plan
  periods. Drafts do not satisfy coverage. Deliberately accepted gaps still warn.
- Checks rotate through projects on the existing timer, normally within five
  minutes for the maximum 30 projects. This is not an instantaneous/SLA guarantee.
  Current Hub directory freshness and canonical HTTPS Desk URL are required.
- Before each attempt the worker rechecks current eligibility, project state,
  cover consent, cutoff and whether a coverage warning still applies. A queued
  reminder is cancelled when it is no longer relevant. Pausing prevents new
  dispatch; a call already sent to Hub can still complete.
- Each durable job has a stable Hub deduplication key, a dispatch lease and at most
  three attempts. Failed attempts remain visible; the next applicable daily warning
  has its own key. No mobile/phone delivery is claimed. **Hub accepted** means only
  the Hub receipt, not that anyone saw the message. The actual inbox/forwarding
  behavior depends on the Hub configuration.
- At most 5,000 reminder records are stored. Full storage is visible and can prevent
  new reminders. Cover records expire seven days after shift start; daily records
  expire seven days after that UTC day ends. Up to 50 latest records are shown.
  Administrators see project attempts; members see their own. Copies in Hub, other
  channels and backups have separate retention.

For operators, the intent is fewer manual chases while preserving consent and
review. For a pilot decision, verify a cross-DST period, a revoked replacement and
a refused Hub notification before relying on reminders. There is no measured time
saving or guaranteed delivery claim; retain the current paging authority.

## Finding the right action

Each project keeps the same navigation: **Coverage**, **Incidents**, **Time off**, and **Status page**. Administrators open **Settings** for the project, incident routing, alert sources and planning reminders. Responders can inspect their reminder attempts without changing policy. The coverage simulation is available on demand. On an owned incident, **Hand off** requests accepted responsibility and **Resolve** records a checked outcome.

**Time & compensation** is the separate payroll workspace. Responders confirm service; scoped HR and Finance users see only their permitted projects and reporting data. Configuration of rates does not grant operational access.
