# Desk on-call and incident management

Status: planning and a native incident-response slice are implemented in
Desk 0.23.0 / Hub 0.31.0, deployed to the workspace on 19 September 2026 as an alpha. The response slice includes
manual incident reporting, Hub notification jobs, bounded escalation, explicit
ownership, accepted handoffs, unreviewed actual-work records and generic scoped
monitoring intake with deduplication/recovery evidence. The
[operator guide](../desk/ONCALL.md) defines precise limits. Milestones A/B below are
not complete: broader calendars, vendor adapters and verified device delivery
remain outstanding, alongside broader payroll rules and AI assistance. Partial cover, explicit holiday exceptions, availability and internal/public status publication are implemented in the alpha; see [status operations](../desk/STATUS.md). Scoped HR/Finance reporting is implemented in the alpha; see [the reporting guide](../desk/REPORTING.md).
PagerDuty is a functional reference, not a required provider or a parity claim.

## Product boundary

Desk projects can enable Requests, On-call, Incidents and Status independently.
Only enabled modules appear in navigation. Existing internal support and customer
projects keep their access, intake, workflow and retention behavior during an
additive migration. An internal operations project must not be implemented as a
public customer project with fictitious customer contacts.

A project defines its work and audience. A service identifies what is supported.
A team owns the response. A schedule determines who covers a time interval.
An escalation policy determines who is contacted and when. Those are separate
objects so one eligible team's schedule can support several services without
duplicating shifts. Linking a schedule never grants access to another project.

Company-specific names, people, regions, response times, compensation rules and
monitoring URLs remain installation configuration. Public examples use synthetic
data and generic templates; internal reference documents are not bundled.

For organizations that compensate on-call work, the complete workflow includes
HR/Finance reporting. This is part of the first complete operational pilot, not
an unspecified later extension. Enabling On-call exposes **Reporting** to eligible
people; companies without compensation reporting can leave it disabled.

## Configuration model

| Object | Responsibility |
| --- | --- |
| Project | Internal or customer audience, enabled modules, Hub group bindings and data retention |
| Service | Owning project, responsible team, runbook links, alert sources, escalation policy and optional public component |
| Team | References to centrally eligible Hub people/groups; no separate account directory |
| Schedule | Rotation order, handoff rules, required coverage windows, timezone, optional coverage layers and calendar exceptions |
| Override | Accepted replacement for an explicit interval, reason and audit trail; a draft request does not change responsibility |
| Escalation policy | Ordered targets, acknowledgement deadlines, bounded repeats and an explicit fallback |
| Alert source | Authenticated service-scoped intake, stable source identity, deduplication and recovery events |
| Alert | Observed signal and its history; repeated delivery does not duplicate work |
| Incident | Human response, severity, owner, linked alerts, investigation and verified closure |
| Delivery attempt | Pending, provider-accepted, failed or other supported delivery evidence; receipt is not human acknowledgement |
| Status publication | Separately approved audience-safe service impact and update history |
| Service record | Confirmed readiness interval or actual work interval, participant, source revision and review history; distinct from the planned schedule |
| Compensation policy | Effective-dated, versioned rules for readiness, actual work, supplements or time credit, with explicit units and currencies |
| Reporting period | Scoped review, approved calculation snapshot and traceable export batches; exporting is not proof of payment |

Primary and secondary are useful preset labels, not hardcoded roles or a limit
of two escalation stages. Region names, number of teams and shift lengths are
configuration. A participant remains subject to their Hub role and project access.

## Starting templates

Templates create editable configuration using the same engine. They do not fork
the application or force every company into a global operations model.

| Template | Starting behavior |
| --- | --- |
| Small IT team | One weekly rotation, one backup target, chosen support hours |
| After-hours support | Working-hours queue plus night/weekend on-call coverage |
| Product operations | Continuous coverage, primary/secondary response and optional customer status page |
| Follow-the-sun | Region-specific coverage windows, explicit handoffs and optional additional weekend coverage |

Start with a short setup: choose the project and service, select the Hub team,
choose a template, preview coverage, configure escalation, and test a notification.
Advanced rules stay collapsed until needed. Before activation, show who would
actually receive an alert now and at the next handoff, including a missing target.

## Operator experience

The project overview answers: who is covering now, what needs acknowledgement,
which incidents are active, and whether upcoming required coverage is complete.
On-call opens a calendar with My shifts, Swap shift and Cover temporarily.
Incidents opens the current response with runbook, source evidence, ownership,
next action and communication deadline together. Status opens an explicit
publication preview. Settings holds configuration rather than everyday work.

Schedule planning must distinguish intended coverage from confirmed publication
to an external paging provider. A failed provider update must remain visible;
it must not present an unconfirmed replacement as the effective paging target.
Only one system owns schedule edits during each migration phase.

Planning supports daily, weekly and custom rotations, availability exceptions,
coverage layers and holidays. Use IANA timezone rules and deterministic handoffs;
do not encode fixed UTC offsets as local recurring time. Define overlapping
layer/override precedence and reject ambiguous conflicting assignments. Preview
missing and repeated daylight-saving hours and the differing seasonal changes
between regions. Historical assignments use immutable revisions.

Shift changes are explicit intervals with eligible substitutes and acceptance.
Changing the schedule does not silently transfer an acknowledged incident;
incident handoff separately records the outgoing summary and incoming acceptance.

## Usability contract

The design target is an operator who can understand the next action during an
interruption, including on a phone. The primary screen contains current response,
current coverage and the next actionable gap. Configuration vocabulary belongs
in setup and expandable details, not in the responder's path. Counts and health
indicators include freshness; unknown or stale data must not appear healthy.

Each routine journey has a clear outcome:

| Situation | What the operator sees and does |
| --- | --- |
| First setup | Choose a template and Hub team, set coverage hours and timezone, then review a calendar and a plain-language escalation summary. The wizard creates the necessary underlying objects together. |
| Start of day | See who covers now, the next handoff and work needing attention. Open the relevant incident or coverage gap directly. |
| New urgent alert | Open the incident from the notification, see affected service and source evidence, then choose **I'm on it**. Show who accepted responsibility and when; retain the incident destination through sign-in. |
| Cannot take a shift | Select the interval and request an eligible replacement. Keep the original effective assignment visible until acceptance; show unresolved requests before the shift starts. |
| Coverage is missing | Show the exact uncovered interval and eligible alternatives with conflicts explained. Preview the proposed change before publication. |
| Incident handoff | Review open investigation, next steps and promised updates; request transfer to an eligible responder and show whether they accepted. |
| Customers need an update | Draft from the incident, preview the public wording and affected components, then publish with an explicit audience. Internal notes stay outside the public draft. |

Simple teams should not have to configure project, service, schedule and escalation
as separate administrative chores. The guided setup may create them in one flow
while preserving those distinct objects for later reuse. Advanced controls appear
when required by the chosen template or a deliberate expansion; existing advanced
rules must remain visible in the resulting summary rather than being hidden by a
simple editor.

Before a plan goes live, **Test this plan** simulates an alert at a selected time:
first recipient, acknowledgement deadline, subsequent targets and fallback. It
also checks the next handoffs and required coverage window. Simulation sends no
messages and is labelled accordingly. A separate real notification test verifies
the configured delivery channel; neither result substitutes for the other.

Actions show pending, confirmed or failed state using the same language throughout
Desk. A provider accepting a message is not labelled as a person being reached.
Concurrent changes are shown before overwriting another operator's work, and
safe retries use idempotent operations. Reversible drafts offer undo; an already
delivered notification or published customer update needs a recorded correction.
Routine reads and previews need no confirmation dialogs.

Keyboard navigation, labelled controls, readable contrast, text alongside status
colors and reduced-motion support are acceptance requirements. Animation can
explain a transition but must not delay acknowledgement or compete with an alert.

## Assistance that reduces work

Assistance is available beside the relevant task. Basic setup, paging and incident
response remain usable without an AI key, a chat conversation or model availability.
Existing Desk AI facilities are not assumed to implement these new capabilities.

| Assistance | Useful output | Required boundary |
| --- | --- | --- |
| Describe a schedule | Convert a plain-language request into an editable plan with a calendar preview and a short list of missing decisions | Never invent timezone, availability, response deadlines or employee consent. Validate coverage and eligibility deterministically. |
| Repair a gap | Suggest eligible replacements and show their availability conflicts and resulting shift load | Explain configured workload weights; do not label a plan fair merely because a model proposed it. Publication remains an explicit operator action. |
| Understand an incident | Summarize source evidence, related permitted records, recent changes and useful runbook steps | Link evidence, distinguish hypotheses from observations and mark missing context. Model output cannot lower urgency, silence alerts or claim recovery. |
| Prepare a handoff | Draft the current state, unfinished work and next promised update from the scoped incident timeline | The incoming responder accepts responsibility separately. A summary never transfers ownership. |
| Communicate impact | Draft an audience-appropriate status update from approved facts | Review before publication; include no private ticket contents, contact information or speculative root cause. |

Schedule calculations, source deduplication, acknowledgement and escalation timers
are deterministic backend responsibilities. AI suggestions pass the same backend
authorization and validation as manual edits. A model timeout must not delay an
alert, hide evidence or interrupt an escalation. Related records are retrieved only
within the requesting person's project permissions; linking tools does not grant
broader access. Alert bodies, tickets and runbooks are untrusted data, never
authority to execute instructions.

Administrators can see whether assistance uses an external model, which data is
sent and the configured usage limits. Exclude credentials and private contact
methods from model payloads. Retention and deletion cover stored drafts and
derived summaries as well as their source records. Show suggestion provenance and
age so responders do not mistake an older summary for the latest incident state.

## Usability validation

The following are proposed targets, not measured results or competitor claims.
Evaluate them with representative small-team and multi-region operators, including
people who did not build the feature. Record completion, critical errors, time and
help needed; revise the design where operators misinterpret responsibility.

| Scenario | Initial acceptance target |
| --- | --- |
| New administrator creates a simple weekly plan | A reviewable draft within five minutes without external documentation; excludes identity provisioning and provider setup |
| Responder checks current responsibility | Identify the effective responder and next handoff within ten seconds, including an unresolved coverage state |
| Responder accepts an incident from a notification | At most two deliberate interactions after authentication, with confirmed ownership visible |
| Operator changes a shift | Understand whether the request is pending or effective without reading an audit log |
| Administrator publishes a regional plan | See coverage gaps, conflicting assignments and relevant daylight-saving transitions before activation |
| Delivery or AI fails | Understand what succeeded, what remains pending and the available next action; core response still works without AI |
| Operator publishes an incident update | Identify the audience and exact outgoing content before publication; no internal information appears in the public preview |
| HR/Finance prepares a period | Reach the authorized report directly, identify every blocking issue, trace a person's total to reviewed quantities and rules, and preview the approved export without opening incident conversations |

## Alert and incident behavior

1. Authenticate intake, persist the signal, then acknowledge receipt. Apply
   explicit payload, rate and storage limits. Replayed/reordered events must not
   resurrect closed work or create duplicate incidents.
2. Route by service and urgency. Routine warnings can remain in a work queue;
   paging and automatic incident creation require enabled rules. Group related
   signals while keeping their individual evidence inspectable.
3. Resolve eligible recipients from the effective schedule and Hub access.
   Missing coverage is recorded and invokes a configured fallback. Never silently
   discard a critical signal because no person is scheduled.
4. Execute notification attempts through a durable queue. Track provider results,
   retries and the next escalation. Timers must recover after upgrades/restarts;
   concurrent acknowledgement and escalation require an explicit race policy.
5. Acknowledge means a responder accepted responsibility. Recovery means the
   monitoring condition cleared. Resolution means the incident was concluded.
   These remain separate states. Silencing suppresses notifications for a bounded
   interval with a reason; it does not claim recovery.
6. Link relevant support tickets without exposing their contents across projects.
   A public status update is a separate reviewed publication. Closing the incident
   does not automatically close every affected customer's ticket.

Notifications use replaceable providers. Browser push, chat, email, SMS and voice
must each be labelled implemented, pilot or planned as adapters are delivered.
Provider credentials are server-side, scoped and auditable. Supported channels,
delivery evidence, retries, fallback behavior and costs must be documented.
A connection wizard includes a real test notification and acknowledgement.

## Permissions, retention and existing integrations

Hub remains authoritative for identities, roles and group membership. Existing
global Owner/Admin inheritance and ordinary employee boundaries remain intact.
No Desk-local admin grants or schedule-based privilege elevation are introduced.
Operational self-service such as accepting one's shift must be explicitly allowed
within central eligibility and the project's scope, with backend enforcement.

Deactivation removes eligibility after Desk learns the change through its existing
directory contract. Affected current/future coverage becomes unresolved and the
configured fallback is notified. Do not silently assign a replacement or rewrite
past participation. Upstream provisioning and directory freshness delays remain
explicit. Lunch's directory interface and synchronization are unchanged.

Define separate retention policies for alert payloads, incidents, schedule history,
private contact methods and public publications. Customer-ticket erasure must also
remove identifying copies from new incident links and derived views. A public
timeline must not depend on retaining a customer's private ticket. Export,
deletion and backup restore behavior require tests before a public pilot.

Hub Operations and paired TVs may receive approved aggregate counts such as
active incidents and coverage gaps. On-call names, phone numbers and private
incident text do not enter the shared TV contract.

## HR, Finance and payroll reporting

Implementation note: Desk 0.23.0 / Hub 0.31.0 implement the scoped compensation alpha described in [REPORTING.md](../desk/REPORTING.md). The broader policy, calendar and payroll integration capabilities below remain a target design, not a claim that every item has shipped.

HR and Finance enter **Desk → Reporting → On-call** directly from the Hub. A
project can open the same report prefiltered to its scope. The landing view shows
the reporting period, included teams/projects, people needing review and approved
totals. Details expand per person; there is no need to navigate technical incidents
or calculate totals from a calendar. A company-wide report includes only explicitly
authorized scopes and states which scopes are included.

The first view is a readable table: person, readiness units, actual work hours,
supplements or time credit, proposed amount and review state. Keep different units
and currencies separate. Amounts appear only to people entitled to see them; a
time reviewer can validate work without seeing private compensation rates. Missing
rates, unconfirmed intervals and missing payroll identifiers are actionable issues,
never silently treated as zero. A time-only export is labelled as such.

### Central access and separation of duties

Scoped time review, compensation, release and export capabilities are implemented
in the reporting alpha. The broader capability model below remains a design target; Hub must expose
their effective scope and enforce them through the shared permission contract
before this feature ships. Assign them to individuals or Hub groups centrally;
Desk does not maintain local role grants. Role labels are presets and configurable
combinations, rather than hardcoded assumptions about department names.

| Capability preset | Intended access |
| --- | --- |
| Participant | Own service records and personal statement; submit actual work and request corrections, without approving own claims |
| Time reviewer | Review readiness and actual-work records for authorized teams/projects; no compensation amounts or exports unless separately granted |
| HR / compensation reviewer | Review personnel mapping, approved time, applicable rates and calculated statements within the granted scope; manage compensation policies only with that additional capability |
| Finance / payroll reporter | Read approved statements and download authorized payroll exports; a separate capability controls release of a reporting period |

Reporting access does not grant incident administration, schedule editing or
access to private customer conversations. An existing Desk Agent role does not
automatically acquire access to other people's compensation. Existing global Hub
Owner/Admin and app Admin inheritance remains as documented: administrators can
access all app content. The UI must state that boundary rather than imply payroll
confidentiality from those administrators or infrastructure controllers.

Policy can require a separate person to approve claims and release a period;
the workflow enforces this even for administrators. Exceptional corrections need
a recorded reason and renewed review, not a silent bypass. All reads, mutations,
exports and generated-file downloads enforce current authorization, project scope
and directory freshness on the backend. Revocation cannot recall an already
downloaded file.

### From service to a reviewed statement

1. Build readiness candidates from the effective historical schedule, including
   accepted replacements. Record confirmation that the service was provided;
   planned assignment alone is not proof. Unresolved coverage or attendance stays
   visible rather than being assigned to an arbitrary employee.
2. Record actual incident work separately. Offer start/stop or manual intervals
   with breaks and a reason for corrections. An incident's open duration and the
   time since acknowledgement are not worked hours. Include work without an
   incident where the company's policy allows it.
3. Apply the company's versioned rules to reviewed records: for example readiness
   per shift/hour/day, actual work, weekend/holiday supplements or time credit.
   Show quantity, unit, rate, rule version and result for every payable line.
   The company supplies the applicable rules; the product does not infer employment
   terms from a template or an AI response.
4. Review exceptions and approve a fixed reporting-period revision. Later changes
   to rates, rosters or employee profiles must not silently recalculate an approved
   statement. Corrections create linked adjustments and renewed approval.
5. Export approved records for the payroll process, with a batch identifier and
   a clear distinction between a full export and later adjustments. Re-downloading
   the same batch preserves its identity; it does not create a new payable batch.
   Marking a batch exported never marks wages paid. Reconciliation with the payroll
   system or an authorized recorded confirmation is a separate step.

Use actual instants for elapsed duration and explicit local calendars for day
classification. Define period boundaries, breaks, overnight shifts, daylight-saving
changes, holiday calendars, rounding and stacking of supplements in each policy.
Use exact decimal or integer monetary arithmetic with versioned rounding rules.
Overlapping work claims are flagged for review. A shared shift covering several
services must not multiply readiness pay; cross-project time consolidation needs
an authorized scope and must not reveal another project's details. Whether actual
work replaces or adds to readiness compensation is an explicit policy choice.

AI may explain a calculation or highlight inconsistent records using permitted
data. Calculation, eligibility, approval and export decisions remain deterministic
and reviewable. No model approves its own suggested rate or invents missing time.

### Export, privacy and replacement of the spreadsheet

Provide a documented Excel-compatible CSV export first, with a preview and fields
for a stable payroll/person identifier, period, pay-item code, quantity, unit, rate,
amount, currency, cost center/project allocation, approval revision and batch ID.
Allow mapping to the company's payroll codes and export profile. Downloading CSV
is not a shipped payroll-system integration, salary calculation or payment service.
Taxes, deductions and bank transfers remain with the company's payroll system.

Keep payroll identifiers and private rates in the restricted reporting area, not
the general Hub directory. Never include incident narratives, customer contacts,
bank details or private alert payloads in payroll exports. Escape untrusted text
as spreadsheet data, including formula-like names and identifiers. Record who
approved, changed and exported a statement. These application records remain
subject to documented administrator/controller and retention limits; they are not
an independent tamper-proof audit archive.

Reporting records have an explicit company retention policy separate from raw
incidents and customer tickets. Store only the minimum service evidence required
for the reviewed statement, so customer-ticket erasure does not require retaining
private ticket content. Apply deletion and correction rules to generated files,
AI drafts and backup restore procedures too. Offboarding removes the person's
access when the directory change is enforced; required historical records remain
available to authorized reviewers under retention, without reusing their identity
for a new employee.

Before replacing an existing spreadsheet, reconcile at least one complete period
against the current reviewed process. Compare each person's quantities, applicable
rates, adjustments and totals, including a replacement, an overnight/holiday shift,
overlapping claims, a departed employee and a late correction. Existing synthetic
fixtures exercise boundary cases missing from that period. Historical imports
need stable identity mapping, source provenance, preview and duplicate detection;
importing a row does not declare it approved or paid. Once cutover is accepted,
name the reporting authority and preserve the old source according to retention
so there are no two competing editable payroll records.

## Availability and operator decision

OpenCloud engines have their own execution environment. A failure in a monitored
service does not by itself establish a failure of Desk. Test the actual dependency
paths: the company's engine, gateways, authentication, alert ingress and chosen
notification providers. Critical notifications must not depend on an open browser.
Public status delivery and emergency communication need a defined recovery path.

The executive decision is whether this workflow can meet the company's response
objectives with acceptable operating effort. Measure coverage gaps, acknowledgement
latency, delivery failures and handoff completeness. Staff still configure sources,
maintain coverage, investigate incidents and pay infrastructure/provider costs.
No reliability, savings, legal-compliance or competitor-parity claim follows from
implementing a calendar or a status page.

Companies may preview scheduling before payroll reporting is available. A pilot
intended to replace an existing on-call and compensation spreadsheet requires the
reviewed reporting workflow above before that spreadsheet is retired. The decision
includes both responder effort and the HR/Finance work needed at period close.

## Delivery sequence and acceptance

| Milestone | Reviewable result | Acceptance before calling it implemented |
| --- | --- | --- |
| A: Project foundation and planning | Optional modules, services, schedules, coverage preview, overrides, templates, plan simulation and readiness evidence model | Small-team and multi-region scenarios use the same model; timezone/overlap/eligibility tests; simple-plan and coverage usability targets; populated upgrades preserve existing projects and Lunch |
| B: Alerts and response | Authenticated intake, deduplication, incidents, ownership, actual-work recording and durable escalation with one implemented provider | Successful and denied access; retries/restarts; repeated and late events; acknowledgement races; no-recipient fallback; verified device delivery and acknowledgement; mobile ownership and failure-state usability targets |
| C: HR/Finance reporting | Hub-controlled reporting capabilities, service review, compensation policies, approved period revisions and payroll CSV | Positive and negative scope tests including direct file download; no self-approval where required; exact calculation and timezone fixtures; overlapping/shared shifts; rate changes, departed people, repeat exports and late adjustments; CSV safety; retained/deleted data and populated upgrades; one period reconciled with the existing process |
| D: Communication | Project status pages, support-widget notices, internal summaries and audience-safe publication | Cross-project isolation, publication preview, retention, subscriber delivery where supported, stale/unknown states and outage exercises |
| E: Migration and broader distribution | One pilot, explicit cutover, additional adapters and public operator guide | Legacy sync cannot overwrite the new authority; old data retained as required; verified recovery; reporting accepted before spreadsheet retirement; supported features distinguished from planned extensions |

The first preview is not authorization to retire an existing paging service.
An existing provider can remain authoritative during a shadow pilot; switching
ownership is a separate configured operation after the acceptance checks pass.
Native operation is the product goal; a commercial paging account is not a
permanent requirement of the model. Direct adapters remain optional.

Assistance is delivered alongside the relevant milestone after its manual journey
works. It is not a prerequisite for safe planning or reliable response. Each
assistant capability needs successful and denied access cases, invalid-suggestion
rejection, model-failure behavior and source-linked output review before a pilot.

## References

- [PagerDuty schedules](https://support.pagerduty.com/main/docs/schedule-basics):
  functional reference for rotations, coverage restrictions, layers and overrides.
- [PagerDuty escalation policies](https://support.pagerduty.com/main/docs/escalation-policies):
  functional reference for connecting service response to schedules and escalation.
- [Prometheus Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/):
  existing signal grouping, routing, inhibition and silences.
- [Existing Desk customer support](../desk/CUSTOMER-SUPPORT.md).
- [Central app permissions](APP-PERMISSIONS.md).
- [Marketplace roadmap](MARKETPLACE-ROADMAP.md).

Regional authoring and opt-in Hub planning reminders are implemented in the 0.21 local alpha. See ONCALL.md for exact bounds. Dated company rates, prorated daily allowances and separate time credits follow in 0.22 (see REPORTING.md). This does not complete country-specific payroll integration, mobile paging, live provider migration or a production rollout.
