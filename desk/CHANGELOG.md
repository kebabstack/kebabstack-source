# Changelog — kebab-stack desk

## [0.24.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes. Align the side menu below the shared header and allow it to scroll independently on short screens.

## [0.24.0] — 2026-09-22

- Adopt shared typography, themes, buttons, fields and navigation across the service desk, customer projects and on-call/reporting. Public support and status views use the same semantic colours; project and reporting access are unchanged.

## [0.23.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.23.1] — 2026-09-21

- Session checks and Hub ticket redemption show a compact progress screen instead of presenting the company sign-in form again. Retry controls appear only when sign-in needs attention.
- Use the corrected shared JSON sanitizer: large external responses no longer build a deeply nested text value, and escaped backslash literals remain unchanged.

## [0.23.0] — 2026-09-19 — Consistent on-call workspace

- Hidden filters and optional fields stay hidden even when their normal layout uses flex or grid.
- Unified project navigation across coverage, incidents, time off and status. Response settings, monitoring sources and planning reminders sit together under project Settings.
- Renamed reporting to Time & compensation, removed duplicate setup actions and empty review columns, and made empty filters explicit. Rule history distinguishes current, previous and scheduled versions; new rules are clearly a new dated version.
- Incident owners get visible Hand off and Resolve actions with separate outcome forms. Coverage simulation stays available on demand, and future or ended plans no longer present themselves as live duty. Archived projects do not offer new planning.
- Clarified the operator guide and in-app help. Company-defined compensation remains an alpha workflow, with independent review, fixed exports and retention; no mobile paging or automatic payroll payment is implied.
- Requires Hub 0.31.0 for central reporting access, preserving the already-deployed Crumbs roles and existing Lunch directory contract. No production roles, project configuration or notification policies are enabled by installing the release.

## [0.22.0] — 2026-09-19 — Dated compensation rules (local alpha)

- HR can configure hourly readiness or prorated daily allowances, with separate
  weekday/weekend/explicit-holiday rates by response layer. Actual work has its own
  rates, daily minimum and rounding. Money and whole-minute time credits remain separate.
- A guided rules screen shows server-calculated examples before activation. Dated
  versions use optimistic revisions; unused future versions can be withdrawn.
  Existing statements retain their rules and local-day boundaries. A rule change
  inside a reporting period requires separate statements at that date.
- Calculations group approved evidence by person, local day and service/layer before
  rounding. DST days remain one day for a flat allowance; partial cover shares the
  allowance. Work minimum applies once per person/day, not per entry or callout.
- Calculation details show source records, payable time, rate and rule version.
  Released exports freeze money and credit lines, including signed linked corrections.
  Legacy statement exports stay byte-for-byte unchanged after upgrade.
- Server-side IANA conversion data covers 2020–2040. Holidays are explicit company
  dates; no statutory rates or national holiday calendars are inferred. Cross-midnight
  work with breaks must be split explicitly instead of guessing break allocation.
- Scoped Hub reporting rights, independent review/release, retention, Lunch sync and
  central roles are preserved. No production rollout or mobile paging in this candidate.

## [0.21.0] — 2026-09-19

- Added finite regional plans with up to three IANA timezones, local working hours, daily/weekly rotations, regional holiday exclusions and weekend/holiday backups. Explicit region priority resolves overlaps; 24/7 requirements keep uncovered hours visible. A preview shows elapsed primary hours and trimmed overlap before saving a draft.
- Regional authoring recipes are saved atomically with drafts, reused for the next period, and marked when assignments are edited manually. Published UTC intervals remain the authority for routing and reporting; no recurrence publishes itself.
- Added opt-in project planning reminders through Hub: pending cover requests, one near-start follow-up and a combined daily warning for coverage issues or missing continuation in the next seven days. Contacts come from the existing Hub-scoped roster; no local roles are granted.
- Durable notification jobs retain deduplication keys, recheck current consent/coverage/access before dispatch, stop after three attempts, survive upgrades and expire. UI distinguishes Hub acceptance from device delivery or human acknowledgement. Existing projects start with reminders off.
- Added regional clock-change, overlap, holiday, central-access, consent, deduplication, retry, retention and populated-upgrade regressions. Consolidated ONCALL.md and marketplace stage descriptions. Local alpha only; compensation extensions and verified mobile paging remain later stages.

## [0.20.0] — 2026-09-19

- Added future partial cover with recipient acceptance, project availability, cross-project double-booking checks, future coverage cutoffs, draft removal and archive/restore. Effective intervals drive planning, routing and payroll imports; obsolete draft evidence is excluded and replaced without changing released statements.
- Added next-period rotation prefill, explicit holiday/closure dates and plan/history JSON export. Planning history defaults to 730 days (400–3650 configurable), with seven-day grace after policy changes and protection for overlapping open payroll drafts. Availability is removed 93 days after its end.
- Added workspace/public status pages, deliberately published audience-specific notices, private incident links, maintenance and expiring operational confirmations. Changing audience starts fresh; internal notices and incident details never enter the public DTO.
- Added employee Service status navigation and optional public status links in customer intake. Failed refreshes are visible; maintenance requires explicit completion. Public pages reuse the existing support frontend and release patch. No measured uptime or subscriptions are claimed.
- Added authorization, split-duty accounting, publication isolation, retention and populated 0.19/second-upgrade regressions. See ONCALL.md and STATUS.md. Local alpha: regional calendar rules, statutory compensation, vendor adapters and verified phone delivery remain outstanding.

## [0.19.0] — 2026-09-19

- Added Service reporting: project-scoped HR/Finance access from Hub, participant service confirmation, independent time review, hourly compensation snapshots and released payroll CSV batches. Supplemental grants never make a requester a support agent.
- Added departed-person attestations, overlapping-record blockers, payroll identifiers scoped to each draft, exact integer rounding and separate linked corrections. Admins cannot approve their own service or release their own preparation/rules.
- Added independent automatic reporting retention, immutable repeated exports, source-void warnings and non-personal range markers preventing re-creation of deleted paid periods. Frontend clears protected content after access loss.
- Added the operator/pilot guide in REPORTING.md. Local alpha only: country-specific allowances, taxes, payroll-provider integration and real phone delivery remain outstanding; reconcile a complete period before replacing an existing spreadsheet.

## [0.18.0] — 2026-09-19

- Added project/service-scoped Alert sources with a write-only HTTP event contract, one-time source keys, expiry, rotation with a 15-minute maximum overlap, pause and permanent revocation. Hub-assigned Desk administrators manage sources; keys grant no staff reads or identity permissions.
- Sources start paused. A credential-only connection test creates no incident; the in-project guide provides the endpoint, copyable server-side examples, all seven event fields, recovery behavior, retry rules and operating limits.
- Atomic intake joins repeated notifications by occurrence and increasing sequence. Exact retries, out-of-order recovery, changed retries and closed/expired incidents have explicit outcomes. Recovery records a monitoring signal without acknowledging, cancelling escalation, changing ownership or resolving an incident.
- Payload/schema, timestamp, request-rate and storage bounds protect intake. Payload retention follows the incident; bounded digest markers survive for 731 days and event timestamps limit exact replay to 24 hours. Scoped intake can continue during Hub directory outages while protected reads and the notification worker retain their freshness gates.
- Added source authorization, malformed input, ordering, recovery, rotation, retention, outage, UI secret-lifetime and populated 0.17/second-upgrade regressions. The disposable preview includes a synthetic monitoring incident and a local HTTP integration endpoint.
- Local alpha: generic server-to-server contract, without bundled vendor/Watch adapters, verified phone paging, HR/Finance reporting or status publication. Existing customer intake, shared Hub permissions and Lunch are unchanged.

## [0.17.0] — 2026-09-19

- Added project-scoped incident response beside coverage: report a service impact, explicitly acknowledge ownership, add internal updates, request an accepted handoff and record a verified resolution. New incidents use the published coverage layers and an administrator-configured fallback; existing ownership does not follow a shift change.
- Persistent Hub notification jobs distinguish pending, Hub-accepted, failed and cancelled attempts. Bounded retries, acknowledgement deadlines, escalation exhaustion and missing recipients remain visible. Acknowledgement stops future escalation; already dispatched calls may still complete. Revoked owners reopen response after a fresh directory check.
- Actual work is self-reported with explicit intervals and breaks, retry protection, overlap rejection and reasoned void/replacement records. No incident duration becomes worked time automatically. These records are not approved payroll statements.
- Added policy-snapshot retention: resolved incidents and their notes, delivery records and unreviewed work expire after 30–365 days; unresolved incidents expire after 365 days. Expiry blocks reads before bounded background deletion. Existing backups and Hub/chat copies require their own retention.
- Added real local Hub delivery, failure/retry, consent/race, authorization, retention and populated planning/response upgrade regressions. Local preview includes a synthetic service incident.
- Local response alpha: authenticated manual reporting and the native Hub channel only. Monitoring webhooks/API keys, recovery events, external paging adapters, verified phone/device delivery, compensation review/payroll, AI assistance and status publication remain planned. See ONCALL.md before a pilot.

## [0.16.0] — 2026-09-18

- Added the first on-call planning preview: internal operations projects and an optional on-call workspace linked to an existing customer project. Administrators configure plans; Hub-assigned agents see their team's published coverage. Existing requester and customer boundaries are preserved.
- Daily/weekly rotations, optional backup, continuous/working-hours/after-hours templates, local IANA handoff times and finite 1–12 week previews. Invalid or ambiguous clock-change times are rejected. The backend validates bounded intervals, overlaps, responder eligibility, concurrency and explicit acceptance of gaps.
- Drafts remain private to administrators. Publication preserves the original roster and dates; coverage simulation sends no messages. Future whole-shift cover requests take effect only when the eligible replacement accepts, with original assignments and decision history retained. Revoked responders are shown as unresolved coverage.
- New side tables preserve the existing stable-state contract. Added local authorization, publication, consent, timezone, UI and populated-upgrade regressions, plus a disposable preview using real local Hub/Desk backends and synthetic people.
- Planning alpha only: no alert delivery/escalation, live paging-provider synchronization, attendance confirmation, worked-time capture, payroll exports, AI planning or status publishing yet. HR/Finance reporting remains a required later milestone before retiring an existing compensation spreadsheet. See ONCALL.md for limits and operator steps.

## [0.15.0] — 2026-09-18

- Added the Hub-only Operations summary, limited to an active centrally assigned app admin and a fresh directory. It returns numeric counts without personal records, free text or credentials. Existing data and role assignments are preserved.
- Internal tickets and customer projects are kept separate. Directory-change reviews, confirmed offboardings and lifecycle-processing health remain distinct.

## [0.14.0] — 2026-09-18

- Confirmed departures automatically synchronize hardware follow-up with connected Assets apps. The person panel shows verified completion without another manual checklist.
- Resolution and closure require a current hardware check. Missing apps, failures and outstanding positions remain visible and block completion; reactivation pauses remaining work.
- Added a reasoned cancellation for incorrect or cancelled HR departures, preserving completed handovers without inventing returns. The default Reclaim devices task is managed automatically by Assets.
- Added monotonic ticket revisions for concurrent case checks and tightened lifecycle decision authorization. Hardware coordination is excluded from external customer projects.

## [0.13.0] — 2026-09-17

- Project-specific request types with independent fields, priorities and service targets;
  a compact workflow editor and an optional refund template.
- Ordered handling steps with required checks, Hub team routing, explicit approvals,
  reasoned rework/cancellation and restart on reopening. Server-side gates prevent
  status changes or stale actions from bypassing the process.
- Each ticket snapshots its type and workflow. Later edits or paused intake do not
  rewrite active work; existing projects and pre-workflow tickets keep their behavior.
- Widget and public forms select request types; server integrations send `typeId`.
  Omitting it preserves default-type intake. Public schemas exclude internal workflow
  details. Embedded widgets can preselect a type using `data-request-type`.
- Workflow data follows automatic retention and manual erasure, and appears in the
  operator review export. Expanded in-project guide covers setup and API compatibility.
- Linear workflows only; no conditional automation, payment execution or customer email.


## [0.12.0] — 2026-09-17

- Customer projects now have automatic retention: 90 days after resolution/closure and 365 days without activity by default, configurable to 7–730 days. Expired records immediately lose staff/API/private-link access; a background job removes their content in bounded batches and reclaims accounted storage. Internal employee/lifecycle tickets are excluded.
- Added admin-confirmed erasure, stale-confirmation protection, expiring justified holds and reviewed privacy exports. Customers can download their own request without internal notes. Deletion revokes links and leaves bounded-duration digest retry markers so uncertain submissions do not recreate erased data.
- Project privacy notices and retention summaries appear before submission. Settings changes invalidate outdated form revisions. Hub/Slack activity notices no longer carry customer names, subjects or individual ticket URLs. Earlier delivered copies and historical backups remain operator responsibilities.
- A restricted 365-day deletion journal can be exported and reapplied after a controlled restore. Matching includes canister, project, ticket and creation time. Documented snapshot rotation, maintenance isolation and journal reconciliation limits; active-data erasure does not rewrite old backups. Existing projects receive a one-time seven-day transition grace; shorter policies require confirmation and at least 24 hours.
- Prominent Embedding guide, Form & team / Privacy & retention / Embed & API shortcuts, copyable widget setup and CSP/troubleshooting documentation. Ticket/private-portal views clear loaded content when deletion is detected. Embedded forms allow the privacy notice to open and the customer’s JSON export to download.

## [0.11.0] — 2026-09-17

- Customer projects separate external support from internal IT inside Desk. Project agents require both their Hub role and the selected Hub group; Hub/Desk admins retain access to all projects. Ticket reads, actions, assignment, notifications and searches enforce this boundary in the backend.
- Configurable public intake forms, an embeddable website widget and project-scoped HTTP API keys. Keys have explicit create/read/reply permissions, expiry, revocation and one-time secret display. Public intake is opt-in; browser origin restrictions do not substitute for authentication or bot protection.
- Customers need no Hub account. A private 90-day ticket link exposes only that conversation and public replies. Agents can revoke or replace it. Customer email is unverified and never resolves to a Hub identity, employee context or offboarding flow.
- Intake and customer replies support exact retries without duplicate writes. Schema revisions, input validation, quotas and bounded storage protect the public surface. Existing conversations survive paused intake, widget rotation, schema changes and upgrades.
- First version: link-based updates, without customer email delivery, attachments, AI processing, customer login or automatic retention/deletion. See the customer-support guide for integration details and operational limits. Existing internal support and Lunch directory integration are unchanged.

## [0.10.0] — 2026-09-17

- Unexpected directory deactivations create private account reviews. Existing offboarding requests are reused, events and cursors survive upgrades, and reactivation pauses checklist completion for review. A confirmed departure uses the existing Offboarding template.
- Agent tickets show the affected employee, related requests and progressive summaries from Assets, Contracts, Forms, Trust and Watch. Source permissions remain authoritative; documents, secrets and conversation bodies are excluded.
- Added Hub entry links, retry/error states, private review decisions and duplicate-request handling. Directory history gaps are surfaced in Workspace.

## [0.9.1] — 2026-09-17

- Shared company sign-in screen and progress states match the Hub across all six tools. Session checks and ticket redemption lock the continue button; failures allow an explicit retry.
- New ticket attempts clear any previous local session before redemption, so a rejected ticket cannot reopen a different account’s old session. Deep links and public access routes are preserved.

## [0.9.0] — 2026-09-17

- App roles now come exclusively from Hub permissions. Removed local admin claims, email lists and role-group settings; deprecated mutation APIs refuse changes. Active Hub owners/admins and Hub-assigned app admins have full app access. Employees keep their own and explicitly shared content; Watch requires an explicit viewer/admin assignment by default. The existing 60-second directory lease bounds revocation.
- Configure the central policy in Hub before upgrading this app; an absent or incompatible policy denies sign-in. Historical local role settings are retained only for migration inspection.

## [0.8.1] — 2026-09-08

- Load Hub profile pictures for the signed-in person, ticket requester, assignee and visible conversation authors. Images are loaded separately from the ticket and cached only in browser memory for up to one minute; initials remain the fallback. The shared Hub topbar receives the current photo too.
- The new authenticated photo method only allows the caller’s own photo or participants of a ticket they can read. It rechecks access and person-to-email mappings after the Hub call and honors the Hub’s avatars lane. No public image endpoint or stable data migration.

## [0.8.0] — 2026-09-08

- Redesigned the requester portal, service catalog, agent workspace and ticket detail around clear next steps, complete labels and a chronological conversation. Secondary routing, AI working notes and activity are expandable; empty attachment and checklist panels stay out of the way.
- Ticket descriptions and replies safely render Slack links, basic Markdown, lists, quotes and fenced code. HTML is always escaped; links allow only HTTP, HTTPS and mailto. A greeting-only ticket heading uses the first meaningful description line for display; the stored subject is unchanged. Slack mentions retain a supplied name or their Slack ID when no name is available; this release does not add directory resolution for those IDs.
- Open ticket pages check for updates every seven seconds while visible. Public replies and internal notes have separate in-memory drafts that survive navigation and refreshes within the app, and are cleared at sign-out. Drafts are not persistent across a reload or closed tab.
- Sending and file uploads guard against duplicate clicks, preserve typed replies on failure and show errors. A late AI draft is offered for review if the agent has continued typing. AI responses started with agent privileges are discarded after those privileges are lost. Stale ticket and filtered queue responses cannot overwrite a newer view. Agent-directory lookups are coalesced and cached for up to 30 seconds.
- Requesters cannot display internal notes or AI working notes; an in-place role downgrade clears the internal-note composer. Internal-note mode does not offer public attachments. Existing backend authorization remains authoritative.
- Responsive layouts, visible focus states, semantic links and form labels, full dates and a matching dark theme. Added UI regressions for unsafe markup, drafts, duplicate sends, late AI replies, stale responses and role changes.
- Backend behavior, stable state and Slack delivery transport are unchanged; the backend version advances with the frontend release.

## [0.7.1] — 2026-09-08

- The configured Desk URL is also the canonical frontend origin. Old canister links move to the custom domain while retaining known ticket, catalog and settings routes. Hub tickets, query parameters and sessions are never forwarded between origins.
- Custom-domain installation instructions cover DNS, the ownership file, Hub menu and notification URLs. Sign-in still goes through the existing Hub; the shared client restores the ticket route after login.
- Ticket data, role rules, Slack event intake endpoints and backend state are unchanged.

## [0.7.0] — 2026-09-06

Fixes from the full audit (`KEBABSTACK-AUDIT-2026-09-06.md`). Requires SDK 0.4 (bundled).

### Fixed — security
- **Slack control sequences are escaped.** A comment mirrored into the channel could carry `<!channel>`, `<!here>`, `<@user>` or a spoofed `<url|label>`; requester text and names are now escaped before they reach Slack (DK-02).
- **Events are verified before they are parsed**, oversized bodies are refused, and a refused signature is no longer written to the admin log (it was floodable from outside) (DK-03/10).
- `hub_upsert` uses the SDK's `upsertRows`: a re-issued address parks the previous holder under `former` and ends their sessions — before, the push path wrote the id table by hand and skipped that protection (DK-01).

### Fixed — bugs
- **Slack gets its 200 at once**: message and reaction events are acknowledged first and processed detached (the work needs outcalls); Slack retries after 3 seconds and disables event subscriptions after repeated failures, and the code claimed to do this already (DK-04).
- **Emoji in a Slack message or profile no longer trap the event**: every JSON from Slack and the AI provider passes the SDK's surrogate guard before parsing (mo:json traps on `\uD83D…` escapes) (DK-03).

## [0.6.0] — 2026-09-06

### Changed
- **People are ids.** Requester, assignee, event authors, checklist ticks, approvers, deciders, file uploaders and person-type fields now store the hub's stable person id (`p_…`) instead of the address (hub ≥ 0.17, SDK 0.3). A colleague's address can change or be re-issued; their tickets stay theirs and never land on the address's next holder. Rows carry `requesterEmail`/`assigneeEmail`, `TicketFull.people` lists a card for everyone the ticket mentions, `whoami`/`agents`/`PersonCard` carry `id`. Inputs from pickers (`assign`, `agentCreate.requester`, `setApprover`, person fields, the assignee filter) keep taking addresses; the backend resolves them.
- **One-time migration** right after this upgrade: every address stored so far is rewritten to the person's id via the hub (`connectorLookup`); addresses the hub never knew become `legacy:<address>` and still render. Writes answer "people ids are being migrated — try again in a minute" for the few seconds it takes; reads keep working. Requires hub 0.17 first.
- Notifications to a former colleague whose address moved on are skipped instead of reaching the new holder.

## [0.5.0] — 2026-09-06

### Added
- **Slack intake.** A support channel becomes a queue: a colleague's message becomes a request of the type chosen for that channel (first line = subject, sender = requester when Slack knows the e-mail); the bot answers in the thread with the key and a link; thread replies land on the request as comments, replies from desk land in the thread; a **✅** on the first message resolves (refused with a note while checklist items are open), removing it reopens. Several channels — also from different workspaces — feed one desk. The Slack app lives in the **hub** (Settings → Slack) and is assigned to desk there; desk fetches token + signing secret with `hub_slackCredentials` every 15 minutes and keeps them write-only. Events arrive at `https://<backend>.<gateway>/slack/events` (`http_request` → `http_request_update`), signed with the secret (5-minute window), deduplicated by event id, acknowledged fast; everything desk says back goes through an outbox flushed every 10 seconds, so no button waits for Slack. Settings → **Slack**: bots from the hub, channel picker (`users.conversations`), request type per channel, *Say hello*, pause/remove, the events URL to paste into Slack, set-up steps.
- Ticket page shows the Slack channel a request came from; the composer says that replies reach the thread. `TicketFull.slack` (optional).

### Fixed
- AI triage, summary and drafts now work with the **hub's** key alone — since 0.2.0 the gates still required a local key.

## [0.4.0] — 2026-09-05

- Use native keyboard-accessible controls for primary navigation.

- Correct setup/offboarding help and privacy statements; keep mobile navigation and content usable on narrow screens.

- Refresh the complete scoped directory every 30 seconds; deny access at 60 seconds from request start during Hub outage.
- Revoke sessions for people absent from a complete directory reply; discard stale replies after push/configuration changes and recheck login after awaits.
- Controller-only Hub changes clear old sessions/caches; ordinary members cannot claim app administration.
- Document the current access contract and deployment workflow; use portable dependency locks and regression tests.

## [0.3.0] — 2026-09-04

### Changed
- **The shared topbar.** desk no longer has a header of its own: the suite's `mountTopbar` from `hub-client.js` sits above the sidebar — brand (company logo from the hub), app name, Menu ▾ (your apps), the bell (the same inbox as on the hub's menu, unread count every 30 s), theme, person ▾. `loginWithTicket` passes the hub's `suiteToken` through for it. Same top in every app, so switching never changes it.

### Fixed
- `info().version` said 0.1.0 forever; the manifest and info now share one `BUILD_VERSION` constant.

## [0.2.0] — 2026-09-04

### Changed
- **AI key from the hub.** The desk asks the hub for the company's AI credentials (lane `ai`, `hub_aiCredentials`, cached 5 minutes, refreshed at sign-in) and uses its own fields only as a fallback. Settings show where the key comes from and link to the hub's Settings → AI; "Ask the hub again" refreshes after a rotation. Calls made with the hub key are reported (`hub_aiUsed`). Manifest wants the `ai` lane.

## [0.1.0] — 2026-09-02

### Added
- First release: request catalog with typed fields, queues, approvals, SLA, append-only ticket events, roles from hub groups, notifications through the hub, assistive AI (triage note, summary, draft), demo seed.
