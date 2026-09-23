# Kebabstack Brand & Product System

Version **1.2.0** · 2026-09-23

Normative target · app adoption is reviewed separately.

Less work. More confidence.

Generated from [standard.json](standard.json). Edit the source, not this file.

**Must** is required. **Should** is the default, with a documented reason for deviation.
Exceptions and acceptance gates are defined under Governance.

## Less work. More confidence.

Kebabstack helps IT teams finish useful work, understand consequences and safely build the next improvement. Calm appearance is a means to that end.

### PURPOSE-01 · Start with the job (must)

Name the person, the job they need to finish, the current obstacle and the observable result before adding a screen or setting. A feature must remove work, reduce uncertainty or enable a necessary decision.

**Verify:** A reviewer can state the job and success condition in one sentence.

### PURPOSE-02 · Make the next step obvious (must)

Every active workflow shows its current state, next meaningful action, responsible person or team, and any blocker. Completed work moves out of the attention queue. Do not invent an action when the user is waiting on someone else.

> Payment recorded. IT: prepare the device. Buyer: invoice receipt pending.

**Verify:** A new operator can identify who acts next without opening help.

### PURPOSE-03 · Earn certainty with evidence (must)

Distinguish configured, queued, running, confirmed, failed and unknown. Show the source and freshness of consequential claims. Never turn an unavailable check into a green result, an empty count or proof of completion.

**Verify:** Disconnect one source: the page clearly shows unavailable data while retaining useful confirmed results.

### PURPOSE-04 · Remove the second piece of work (should)

Reuse known data, sensible defaults and linked records. Prefer a useful suggestion to another mandatory field. Offer repeatable automation after a real repeated task; do not make scripting a requirement for basic use.

**Verify:** List the manual steps and duplicate entries removed; measure the remaining steps with a representative operator.

### PURPOSE-05 · Keep the person in control (must)

Make changes explainable, attributable and recoverable where technically possible. The simplest interface still exposes scope, consequences and meaningful choices. Never hide a safety-critical distinction to make a screen look clean.

**Verify:** The user can explain what will change and how to recover, or sees explicitly that recovery is unavailable.

### PURPOSE-06 · Measure outcomes honestly (must)

Track task completion, errors, time to first useful result, repeat manual steps and recovery effort. Compare the same tasks and dataset before and after. Report observed time savings separately from estimates and external service costs.

**Verify:** A savings claim includes baseline, sample, measurement period and assumptions; otherwise label it an estimate.

## One family of tools

The approved kebabstack.dev marks are permanent. A tool feels like part of the suite before the user learns its name.

### IDENTITY-01 · Use the registry (must)

Product marks come only from design/logos/registry.json. Keep their exact paths, 24 × 24 viewBox, 1.6 stroke and round caps/joins. Do not substitute a similar icon, emoji, gradient tile or generated image.

**Verify:** Run npm run brand:check; inspect app header, favicon, menu, Kitchen, website and Cloud Engine console.

### IDENTITY-02 · Keep brand ownership clear (must)

Kebabstack is the suite; Hub, Desk, Assets, Trust, Contracts, Forms, Watch, Crumbs, Kitchen and Vault retain their registered product names. Company branding and external app logos remain separate. Phone is a reserved, planned mark, not a shipped capability. The suite skewer, wordmark, variants and clear-space rules come from design/brand/registry.json and its usage guide; legacy ring-handle assets are not alternatives for new work.

**Verify:** A renamed connected app still resolves its product mark from its validated identity; external branding is not overwritten.

### IDENTITY-03 · Preserve proportions and meaning (must)

Use 20–24 px marks in navigation, 26–36 px in headers and 36–48 px in catalogues, with at least 4 viewBox units of clear space. Keep a nearby product name. Decorative marks use empty alt text; icon-only controls have an accessible action name.

**Verify:** Check the smallest render at 100% and 200%; the visual mark and accessible control name have distinct jobs.

### IDENTITY-04 · Use colour by purpose (must)

Sage is the logo colour, forest is the main action colour, and warm orange is a restrained brand accent. Product identity never carries health or permission status. Logo sage is not approved for small body text on every background.

**Verify:** A monochrome view still communicates every status and action.

### IDENTITY-05 · Keep the character restrained (should)

Use warm paper, precise linework, generous grouping and occasional editorial diagrams. Avoid mascots, confetti, skeuomorphic tiles and stock imagery in work queues. Marketing may be more expressive; critical work remains calm.

**Verify:** Decoration does not push the first useful action below the initial viewport.

## Colour, type & rhythm

The shared visual language extends the Hub, Assets and Dealroom work. Reference and runtime tokens share one versioned semantic source.

### VISUAL-01 · Use semantic tokens (must)

Use tokens.json for the target palette, spacing, type, radii, motion and layer values. Components refer to purpose, not a literal hex code. hub/dist/tokens.css is the canonical generated runtime stylesheet; hub/dist/components.css defines shared workspace controls. Run runtime:sync and runtime:check instead of copying or redefining app palettes.

**Verify:** New design decisions reference a token. The implementation plan covers every SDK copy and app override.

### VISUAL-02 · Keep text legible (must)

Use the system sans stack or the existing locally hosted Inter for UI and headings. Use monospace only for identifiers, code and compact technical metadata. Body text is 16 px; dense desktop rows may use 14 px. Labels and useful metadata are at least 12 px. Never shrink text to hide a layout problem.

**Verify:** Check long labels, real records, zoom and mobile text without clipping or essential hover-only content.

### VISUAL-03 · Use a small type scale (should)

Use 24–32 px titles in operational workspaces and 32–40 px for introduction or marketing pages, 24 px section titles, 18 px panel titles and 16 px body text. Keep heading weight 500–600, body 400, line height 1.5–1.65 and long text around 60–75 characters per line. Use sentence case; reserve spaced uppercase for short optional eyebrows.

**Verify:** A page has one h1 and an ordered heading hierarchy; headings do not compete with every metric.

### VISUAL-04 · Separate boundaries from decoration (must)

Subtle borders may group cards. Interactive boundaries, focus rings and meaningful graphics need sufficient contrast independently. Text uses approved foreground/background pairs; colour is never the only indication of error, selection or health.

**Verify:** Validate contrast in light and dark themes and disabled, hover, selected and error states.

### VISUAL-05 · Use one rhythm (should)

Build from 4, 8, 12, 16, 24, 32, 48 and 64 px spacing. Default cards use a 16 px radius, controls 8 px, overlays 16 px and pills only for short statuses. Use 24 px panel padding and 16 px on small screens. Prefer a divider or spacing over nested cards.

**Verify:** Related controls group more tightly than unrelated sections; no card-in-card-in-card composition.

### VISUAL-06 · Design both themes (must)

Theme preference follows system until explicitly changed and is shared through the established suite shell. Check every semantic state in both themes. Dark mode is a deliberate palette, not CSS inversion. Exported documents declare their own readable print palette.

**Verify:** No white-on-light primary button, invisible graph, unreadable logo or flash of an unrelated theme.

## A place for everything

Put objects and work where people expect them. The Hub owns the company-wide context; each tool owns its domain work.

### NAVIGATION-01 · Keep one home for each decision (must)

Company people, app access and suite connections live in Hub. Ticket handling lives in Desk; custody in Assets; posture in Trust; agreement records in Contracts. Cross-app pages summarize and deep-link to the owning tool instead of duplicating editable settings.

**Verify:** There is one authoritative place to change each value, with a clear link from summaries.

### NAVIGATION-02 · Use a shallow, task-shaped menu (should)

Group frequent work first, then configuration, then help and operations when needed. Use familiar object or task names. Keep global app switching separate from local navigation. Show a contextual Back link or breadcrumb for deeper records; do not stack three independent tab bars.

**Verify:** A first-time operator finds a known task without scanning implementation terminology.

### NAVIGATION-03 · Remember the working context (must)

Use stable, shareable routes for records and meaningful views. Preserve authorized destination, filters, sorting and pagination across Back, refresh and SSO. Do not put tokens, personal information or secrets in routes or analytics.

**Verify:** Open a permitted deep link in a fresh session, sign in, then return to exactly that permitted destination.

### NAVIGATION-04 · Navigation describes a destination (must)

Use links for navigation and buttons for actions. Mark the current location. Icon and label align in a fixed slot; the whole target has a consistent hit area. Browser open-in-new-tab works for record links.

**Verify:** Keyboard, screen reader and browser link behavior agree; no clickable div stands in for a link.

### NAVIGATION-05 · Use one vocabulary (must)

Use person for a directory record, account or session only when that distinction matters, and explicit app roles from the central policy. Prefer Apps → Updates to internal names such as Pantry. Domain terms can differ only where their meaning differs.

**Verify:** The same action and state have the same label in UI, help, notifications and API examples.

### NAVIGATION-06 · Keep the global bar in view (must)

The company, app switcher, notifications and account controls stay visible while the workspace scrolls. Mount the shared topbar directly in the full workspace container, outside nested content scrollers. The host owns stickiness; do not pin only a child inside a header-height wrapper. Keep its normal-flow space, respect safe-area insets and use its shared offset for sticky side navigation. Long side menus scroll independently. In-page targets and keyboard focus must clear the bar. Never hide the bar based on scroll direction. Full-screen presentations and game play may use their documented immersive mode.

**Verify:** In a real browser, scroll long pages to the middle and bottom and back with wheel/touch and keyboard; the full bar remains at the viewport top. Repeat at narrow widths and 200% zoom. Check menu opening, long sidebar scrolling, anchor targets and focus visibility, including switching between short and long pages.

## Pages that explain themselves

Choose a page pattern by the job. A familiar frame reduces learning across the suite.

### LAYOUTS-01 · Queue: decide what needs attention (should)

Put title, scope and primary action first, then search and relevant filters, then the work list. Default to the meaningful unfinished scope. Show a compact count, owner, state and next useful fact; move full histories and identifiers to detail.

**Verify:** An operator can triage realistic records without opening every row.

### LAYOUTS-02 · Detail: do the work, then inspect (should)

Show identity and status once, followed by the next action. Put active work in the main column and supporting facts in a quieter side column. On small screens, use a single logical DOM order with the next action before secondary metadata.

**Verify:** Reading order and keyboard order remain coherent at desktop and 320 CSS px.

### LAYOUTS-03 · Settings: explain the choice (should)

Group settings by operator task and show current configuration before editing. Reveal conditional fields only when relevant; explain effects beside the control. Offer useful defaults. Do not show obsolete toggles or options that never change.

**Verify:** Each setting has a current value, owner, reason to exist and observable effect.

### LAYOUTS-04 · Setup: reach the first useful result (should)

Use short steps only for genuine dependencies. Allow save/resume, validation and a safe test. Show prerequisites, required external access and who can complete blocked steps. Collapse completed setup; keep setup status distinct from service health.

**Verify:** A new company can reach a meaningful test without searching the web or reading the whole architecture.

### LAYOUTS-05 · Give content room to reflow (must)

Use a fluid content width up to 1280 px for normal work, up to 1600 px for justified dense operations, and about 720 px for reading. Use 32 px desktop and 16 px mobile gutters. Collapse sidebars before compressing controls. Constrain wide tables locally, not the whole page.

**Verify:** No page-level horizontal scrolling at 320 CSS px, except genuinely two-dimensional content inside its labelled region.

### LAYOUTS-06 · Public tasks stay focused (must)

Guest dealrooms, customer intake, embedded forms and public status pages expose only their scoped task. They do not inherit admin navigation, company directory search or unrelated product promotion. Provide recovery for expired access and preserve non-sensitive drafts where safe.

**Verify:** Test a private link, expired link and unauthorized record directly; no hidden privileged content is fetched.

### LAYOUTS-07 · Context is a toolbar, not a feature card (must)

A website, project or team switcher belongs in the page heading or one compact context row. Give the selected object one clear label; do not repeat identical name/domain values. Do not wrap routine context in a large padded card. Put create/manage actions in the corresponding collection or settings, and show role metadata only where it explains available access. Never hide a safety-critical scope or blocker.

**Verify:** Inspect the complete initial viewport with realistic names and roles. Routine context must not look like the main task. Check switching context, finding management and keyboard operation.

### LAYOUTS-08 · Budget the space before the work (should)

On a standard desktop queue or report, show useful rows, metrics or the next decision in the initial viewport. At 1280 × 800 CSS px and 100% zoom, aim to start the primary report, queue or decision region within the first 320 px, including global navigation. Use at most a heading/context row, local navigation and one report/filter row before it. Reveal saved-filter management and optional configuration on demand. Necessary warnings may exceed this budget; accessibility and meaningful labels take priority over pixel targets.

**Verify:** Record the first useful content position and viewport. Review 800 px width, 320 CSS px reflow, long labels and 200% text enlargement. Do not force the desktop height budget on zoomed or narrow layouts.

## A small, consistent vocabulary

Reuse the same interaction for the same intent. A component is its behavior, accessibility and states as well as its appearance.

### COMPONENTS-01 · One main action per decision (must)

Use a forest-filled button for the next useful action in the active region, outlined secondary actions and quiet links for tertiary navigation. Label verbs with their object: Save policy, Assign device, Publish update. Do not give every card a competing primary button. Use the measured button geometry and states in the visual catalogue; tokens.json owns the dimensions.

**Verify:** The main action is obvious before reading the help text.

### COMPONENTS-02 · Explain unavailable actions (must)

Hide actions the role can never perform, without leaking protected data. For a permitted action blocked by prerequisites, keep its reason visible and link to the remedy. Do not rely on a tooltip attached to a disabled button. Read-only views identify who can make changes.

**Verify:** A keyboard user can understand every relevant blocked action and its next step.

### COMPONENTS-03 · Menus and tabs have distinct jobs (must)

Menus hold infrequent secondary actions; essential next actions stay visible. Tabs switch related content and expose current selection. Workflow steps show progress; filters narrow a collection. Do not disguise one as another. Use native controls or fully implement their keyboard pattern. The Menus & tabs catalogue defines spacing, hit areas, active indicators and keyboard behavior.

**Verify:** Arrow keys, Tab, Escape and focus behavior match the component used.

### COMPONENTS-04 · Use overlays sparingly (must)

Use a dialog for a short, focused decision; a drawer for contextual inspection; a page for lengthy work. Modal content traps focus, labels its purpose, makes the background inert and returns focus on close. Escape and the close control preserve or explicitly discard drafts. Avoid nested dialogs.

**Verify:** Keyboard-only opening, validation, cancellation and return focus all work.

### COMPONENTS-05 · Make selection and actions explicit (must)

A checkbox selects; a record link opens. Bulk actions state the number and scope selected, including whether selection spans pages. Preview consequences for destructive or externally visible changes. Report per-item results and make retry target only failed eligible items.

**Verify:** Selecting a row does not unexpectedly open it; partial failure cannot be mistaken for total success.

### COMPONENTS-06 · Prefer standard controls (should)

Use native buttons, links, inputs, selects and details where they satisfy the task. A custom searchable picker needs labels, active option, keyboard selection, clear state and no-results behavior. Dragging always has a non-dragging alternative.

**Verify:** Touch, keyboard, screen reader and long text work without a pointer-only shortcut.

### COMPONENTS-07 · Bound routine selectors and group secondary actions (must)

Use normal 14–16 px text for context and report selectors, with a content-appropriate desktop width, usually 240–360 px for object names and 160–240 px for report options. Retain 44 px touch targets; compactness comes from grouping and removing decoration, not tiny controls. Align controls on the same row, allow reflow, and avoid stretching a short selector across a whole report. Several bordered buttons are not a hierarchy: secondary navigation should be quiet and infrequent actions should have one labelled disclosure.

**Verify:** Measure computed control sizes and inspect their weight next to the primary content. Long options remain accessible through the native selector, narrow screens do not overflow, and disclosures work with keyboard and touch.

## Ask less. Validate clearly.

Forms should make the correct path easy without making users memorize rules.

### FORMS-01 · Label and group every input (must)

Keep labels visible; placeholders are examples, never labels. Associate help and errors programmatically. Mark optional fields when most are required, otherwise mark required fields consistently. Use fieldsets for related choices.

**Verify:** Every control has a useful accessible name, and help remains available after typing.

### FORMS-02 · Keep save behavior predictable (must)

Use an explicit Save for policies, integrations, settings and multi-field edits. If autosave is appropriate, show saving, saved and failed states and preserve the draft on failure. A toggle must not silently commit the rest of a form. Warn about abandoning a meaningful unsaved draft.

**Verify:** Change one field, fail the save, navigate away and return: there is no false success or silent loss.

### FORMS-03 · Validate where the correction belongs (must)

Validate format near the field after meaningful interaction. On submit, focus an error summary with links to invalid fields; keep entered values. Backend validation remains authoritative. Clearly distinguish invalid input from unavailable service or denied permission.

**Verify:** Multiple errors are discoverable and correcting one does not erase another field.

### FORMS-04 · Reuse known information (should)

Pre-fill confirmed data with its source and let authorized users correct it. Use appropriate autocomplete and inputmode. Do not ask for data already held just because another tool owns it. Only collect information needed for the stated purpose.

**Verify:** A returning user does not retype known identity or device information.

### FORMS-05 · Handle sensitive inputs deliberately (must)

Mask secrets, expose them only on an authorized explicit action, and explain whether they can be retrieved again. Never prefill a masked placeholder as a new credential. Keep tokens out of URLs, logs, screenshots and telemetry. A successful copy is reported only after the clipboard operation succeeds.

**Verify:** Cancel, failed copy, expiry and page navigation do not leak or overwrite the secret.

### FORMS-06 · Review consequential actions concretely (must)

For deletion, publication, permission changes, financial issuance and fleet actions, show affected scope, consequences and recovery limits before the final action. Routine reversible edits need no ritual confirmation. Recheck current authority and record version at execution.

**Verify:** A stale review cannot authorize a different set of records or silently overwrite another operator’s changes.

## Lists, search & data

Make the common comparison easy; keep detail available without turning each row into a report.

### DATA-01 · Show decision fields first (must)

Default to identity, state, owner, relevant time and the next-action signal. Choose additional columns only for the task. Right-align comparable numbers and use tabular numerals; keep units and currency visible. Never mix currencies into an unexplained total.

**Verify:** Representative long names, missing values and large amounts remain readable.

### DATA-02 · Keep query scope visible (must)

Search, active filters and sort order are visible and resettable. Say whether counts describe the complete authorized collection, the filtered result or the current page. Sorting applies to the promised dataset, not just the downloaded rows.

**Verify:** A filtered queue and exported result use the same documented scope.

### DATA-03 · Preserve context during refresh (must)

Keep focus, scroll, selection and in-progress edits stable. Do not reorder a queue under the pointer while the user is acting; announce new items with a refresh affordance when needed. Reject stale asynchronous results after identity, route or filter changes.

**Verify:** A slow response from the previous view cannot replace the current result.

### DATA-04 · Distinguish absent from zero (must)

Use Not recorded, Not checked, Not applicable and Unavailable where appropriate. A confirmed zero is a value. Show the last successful observation and freshness for imported or monitored data. Keep technical detail in a disclosure with a support reference.

**Verify:** An unavailable Watch check never reads All healthy or 0 problems.

### DATA-05 · Make imports recoverable (should)

Preview mapping, validation, duplicates and affected records before import. Provide a small downloadable example with fictitious data and precise field definitions. Report accepted and rejected rows separately and provide safe retry guidance.

**Verify:** Importing the same input twice does not create unintended duplicates; partial completion is explicit.

### DATA-06 · Exports describe their evidence (must)

Show scope, filters, generation time, timezone, currency and relevant policy version. Restrict export to current role and purpose. Neutralize spreadsheet formulas in untrusted CSV text; do not put private data into filenames. Reports preserve the distinction between draft, approved and released.

**Verify:** An exported report can be interpreted without the original browser session.

## Tell the truth about state

The screen should remain useful when a network, integration or human step takes longer than expected.

### STATES-01 · Design the complete state set (must)

Every data region defines initial/loading, loaded, empty, filtered-empty, partial, stale, error and forbidden states where applicable. A skeleton is a loading placeholder, not a count of zero. Keep independent regions useful when one fails.

**Verify:** Exercise each applicable state using a representative fixture.

### STATES-02 · Use progress that is real (must)

Acknowledge an action immediately. Show the current meaningful stage for longer work, not a fabricated percentage. Explain when it is safe to leave and whether the job continues. If a wait exceeds its timeout, offer a useful recovery path.

**Verify:** Simulate a slow call and lost connection; the user knows whether the operation is still running or uncertain.

### STATES-03 · Separate accepted from completed (must)

A request accepted into a queue is not a confirmed external result. Show saved in Hub, awaiting app confirmation, confirmed or failed separately. Optimistic UI is limited to reversible low-risk edits that can visibly recover.

**Verify:** A failed external write never leaves a success toast or permanently green status.

### STATES-04 · Make errors actionable (must)

Lead with what failed and what remains intact, then the next useful action. Preserve input. Offer retry only when safe; for ambiguous outcomes, check operation status before resubmitting. Put raw stack traces and sensitive provider errors behind sanitized operator diagnostics.

> Could not confirm the update. Your draft is still here. Check the job status before trying again.

**Verify:** The operator can recover or give support a reference without copying secrets.

### STATES-05 · Notify accessibly without stealing focus (must)

Use a polite live region for routine asynchronous results; use urgent alerts only for urgent failures. Success toasts are supplementary, not the only receipt for important work. Keep actionable errors persistent until addressed.

**Verify:** A screen reader receives one useful announcement, not every polling update.

### STATES-06 · Empty states explain a path (must)

Distinguish first use from no matches, lack of permission and missing integration. Offer one role-appropriate next action. Never show setup controls to employees who cannot use them.

**Verify:** No matching devices offers Clear filters; an unconfigured connector offers setup only to the authorized operator.

## Progress with a clear owner

A workflow is a sequence of verified outcomes, including exceptions and human decisions.

### WORKFLOWS-01 · Name outcomes, not implementation flags (must)

Use a small set of domain states with explicit entry/exit conditions. Model waiting, blocked and failed deliberately. Complete means the stated outcome is achieved; Cancelled is a terminal side branch, not the next step after success.

**Verify:** A transition table defines allowed actors, preconditions, evidence, effects and recovery for every transition.

### WORKFLOWS-02 · Show the next actor (must)

Each unfinished case names who is responsible now, the blocker and a due time if one exists. A stage counter and a per-record progress indicator have different scopes. Do not ask the current user to perform another person’s acceptance.

**Verify:** A paid sale awaiting buyer confirmation explains the exact blocker and permitted follow-up, not a mysteriously disabled handover.

### WORKFLOWS-03 · Coordinate without duplicating authority (must)

Link records through stable IDs and identify the owning tool. Offboarding can collect equipment, contracts, forms and tickets while each source enforces access. Deactivation stops access independently of ticket completion; equipment custody is not silently erased.

**Verify:** Repeated directory events correlate to the same unfinished case; source failure is visible and retryable.

### WORKFLOWS-04 · Treat manual exceptions as decisions (must)

If a real process allows an override, name who may use it, the reason required, the evidence retained and which safeguards remain. Do not add a universal Force complete button or silently invent acceptance on someone else’s behalf.

**Verify:** An override is auditable and cannot bypass a non-overridable safety or permission condition.

### WORKFLOWS-05 · Keep handovers explicit (must)

Assignment, ownership, payment, physical handover, data erasure and closure are distinct facts. Preserve history when a person departs. External buyer flows require their own scoped access; disabling an employee account does not grant external access automatically.

**Verify:** A former employee’s device remains traceable until a verified return, transfer or sale outcome.

### WORKFLOWS-06 · Close the loop (should)

Show completion evidence, remaining obligations and the relevant record of what happened. Remove resolved items from urgent queues without hiding their history. Offer a reusable template when a repeated workflow has stabilized.

**Verify:** The user can distinguish completed work from a case merely hidden by a filter.

## Access that people can explain

Hub is the authority for central app roles. The interface explains effective access without creating a second role system.

### ACCESS-01 · One central source of app authority (must)

Show effective app role, scope and provenance from Hub. Active Hub Owners and global Admins inherit app administration according to the central policy; only Owners delegate central app privileges. Do not add local app-admin lists. Follow docs/APP-PERMISSIONS.md for exact enforcement.

**Verify:** An employee, app admin, global admin, owner and inactive person each have verified positive and negative paths.

### ACCESS-02 · Limit views to their actual purpose (must)

Employees see their own and explicitly shared objects. Project, responder and HR/Finance capabilities expose only the data needed for that task. Read-only reporting does not imply access to incident narratives, customer messages or company-wide tickets.

**Verify:** Open a restricted route and call its API directly; neither returns data outside the scope.

### ACCESS-03 · Explain inheritance and propagation (must)

Show where access comes from and link authorized administrators to Hub. Distinguish policy saved from app enforcement confirmed. If fresh authorization cannot be established, fail closed and explain how to recover. Never promise immediate upstream IdP revocation.

**Verify:** A stale directory or disconnected app cannot masquerade as current confirmed access.

### ACCESS-04 · Keep sign-in on one journey (must)

Use the shared sign-in shell from tool entry through provider selection, verification and handoff. State the destination and company. Once company authentication succeeds, continue directly to the authorized destination without showing an interactive Hub home or original login screen.

**Verify:** Test direct entry, Hub launch, existing session, expiry, cancelled provider login and a deep link.

### ACCESS-05 · Recover safely from interrupted login (must)

Validate return destinations against configured origins. Keep background navigation inert during handoff; prevent duplicate submissions. Offer retry and a deliberate return on timeout. Re-authentication preserves safe task context without storing credentials or leaking protected drafts.

**Verify:** A slow or failed login never exposes a clickable admin page, arbitrary redirect or previous person’s content.

### ACCESS-06 · Treat guest access as a separate scope (must)

Private links, embedded intake and public forms use narrowly scoped capabilities with clear validity and recovery behavior. Browser widgets never contain privileged API secrets. Existing external integrations such as Lunch keep their documented identity/data contracts.

**Verify:** An external guest cannot enumerate records, cross projects or use a staff endpoint.

## Automate with confidence

A good automation removes a repeated chore while making its boundaries, evidence and recovery understandable.

### AUTOMATION-01 · Describe a rule in plain language (must)

Every rule shows trigger, matching scope, prerequisites, action, owner and failure behavior. Show what it will not match when that affects a decision. Give human-readable examples based on authorized records.

> When a person becomes inactive, open or update their offboarding case and collect accessible assigned equipment.

**Verify:** An IT operator can predict whether a sample event will run the rule.

### AUTOMATION-02 · Preview consequential automation (must)

Separate a non-mutating preview from a real run. Show affected records, external systems and required permissions. Require explicit configuration before automatic destructive or externally visible actions. Approved routine rules can then run without repeated prompts.

**Verify:** A preview performs no writes or notifications and says which results could not be verified.

### AUTOMATION-03 · Make repeated events harmless (must)

Use stable correlation and idempotency for repeat events and retries. Recheck authority and preconditions at execution. Show skipped, already handled and failed items separately. Never retry an uncertain financial or destructive action blindly.

**Verify:** Deliver one event twice, interrupt after a partial write and retry: there is one intended outcome.

### AUTOMATION-04 · Offer a useful run history (must)

A run shows trigger, rule version, actor, affected scope, per-step outcomes, timestamps and links to evidence. Expose Pause, retry failed work and manual recovery where supported. Pausing future runs does not claim to undo actions already performed.

**Verify:** An operator can answer what happened, why, what remains and who owns it without reading server logs.

### AUTOMATION-05 · Suggest the next useful automation (should)

Suggest a template after repeated manual work and show editable conditions. Avoid constant nudges, speculative savings and a blank workflow canvas as the first experience. Provide an accessible list/form editor even if a visual builder is added.

**Verify:** A basic recurring task can be configured without code; advanced users can inspect its documented contract.

### AUTOMATION-06 · AI respects evidence and authority (must)

Label generated drafts, cite accessible source records and state uncertainty or missing information. Treat retrieved text as data, not instructions. AI acts within the user’s rights; impactful actions use the same preview and execution safeguards as manual actions. Explain any external model data flow and retain only necessary history.

**Verify:** The user can correct or reject a suggestion; untrusted ticket text cannot grant permissions or trigger an action by itself.

## Privacy built into the task

Collect less, reveal deliberately and explain the actual lifecycle of data.

### PRIVACY-01 · Minimize the default view (must)

Show only fields useful for the current task and role. Avoid personal details in global lists, wallboards, notification previews and URLs. Reveal sensitive information explicitly when authorized, with a clear purpose.

**Verify:** HR reporting, employee views, public pages and TV mode use deliberately different data projections.

### PRIVACY-02 · Describe retention precisely (must)

Show what is stored, why, the configured retention period, the event that starts it and who owns the policy. Distinguish source data, audit evidence, issued documents and backups. Automatic cleanup must expose last run, next due work, holds and failures.

**Verify:** A completed ticket and retained invoice can have different policies without a misleading global deletion promise.

### PRIVACY-03 · Deletion is not revocation or archive (must)

Name the actual action: revoke a link, archive a record, anonymize fields, delete data or expire a backup. Preview scope and irreversible effects, handle linked records and explain lawful retention holds without claiming automated legal judgment.

**Verify:** A user can tell which copies remain and which external systems require a separate action.

### PRIVACY-04 · Do not claim compliance from appearance (must)

Design for data access, correction, export, deletion requests and restricted audit review. Document deployment location, operator access and external data processing limits. Do not describe the suite as GDPR-certified, confidential from operators or compliant merely because a feature exists.

**Verify:** Compliance language names the implemented support, required company policy and remaining operator responsibility.

### PRIVACY-05 · Keep audit useful and limited (must)

Audit consequential changes with actor, time, scope, before/after where appropriate and result. Redact secrets and restrict sensitive event details. Search and export respect the same permissions and retention policy as the source.

**Verify:** A routine support screenshot or log export cannot reveal credentials, unlock codes or unrelated personal data.

## Notifications & incident response

Attention is a scarce resource. Escalate a real obligation, not every state change.

### SIGNALS-01 · Notify someone who can act (must)

Every actionable notification includes what changed, impact, scope, owner, time and a direct permitted destination. Informational updates can be grouped. Distinguish delivery accepted, delivered where provable, acknowledged and resolved.

**Verify:** No notification says a responder was alerted merely because an outbound request was queued.

### SIGNALS-02 · Deduplicate and route deliberately (must)

Correlate repeated signals, rate-limit noisy sources and summarize repeats without hiding escalation. Respect configured severity, subscription scope and quiet hours; define explicit critical overrides. Recovery updates reference the same incident.

**Verify:** A flapping monitor produces one coherent incident with event history rather than an unbounded list of identical alerts.

### SIGNALS-03 · Separate technical failure from service impact (must)

A failed monitor or unknown check is not proof of a service outage. Explain evidence, last successful observation and customer impact independently. Do not auto-publish internal diagnostic detail to a public status page.

**Verify:** Internal notes, customer updates and public status each have an explicit audience and preview.

### SIGNALS-04 · Make on-call responsibility visible (must)

Show who is primary and backup now, the schedule timezone, next handover and uncovered intervals. Swaps and overrides have an explicit interval and conflict check. Do not promise phone wake-up reliability before delivery, acknowledgment and fallback paths are verified.

**Verify:** Test weekends, holidays, DST, missing coverage and an unacknowledged escalation.

### SIGNALS-05 · Public status is a deliberate publication (must)

Status updates need a clear audience, affected service, impact, timeline and next update expectation. Keep a publication history and distinguish planned maintenance from incidents. A monitor can prepare a draft under configured rules; automatic publication requires explicit policy.

**Verify:** Preview contains no employee identifiers, secrets or internal incident discussion.

### SIGNALS-06 · Use quiet visual urgency (should)

Use text labels and restrained semantic colour for severity. Avoid sirens, flashing banners, endless animation and default browser permission prompts. Ask for notification permission when a user chooses a useful channel and explain the benefit.

**Verify:** A noncritical update does not interrupt a focused workflow; critical work remains discoverable.

## Dashboards, reports & TV

A good overview answers a decision. It does not become another queue to maintain.

### REPORTING-01 · Give each metric a question (must)

Show the metric’s meaning, scope, timeframe, source and freshness. Put items requiring action ahead of decorative totals. A summary links to the same filtered source view where authorized. Do not mix readiness, performance and volume into an unexplained score.

**Verify:** A manager can state what decision each metric supports and why it changed.

### REPORTING-02 · Use honest charts (must)

Use labelled axes, units, time ranges and comparable baselines. Bars start at zero; a deliberately restricted line-chart axis is clearly labelled. Distinguish missing data from zero and forecasts from observations. Colour has a text or pattern alternative, and useful values are accessible without hover.

**Verify:** A chart has a concise textual summary and an accessible table or equivalent data view.

### REPORTING-03 · Do not invent trends (must)

Only show history retained by the source, with coverage and gaps. Display sample size and denominator for rates or scores; state the score policy/version where relevant. Do not animate a number from zero in a way that implies a live observation.

**Verify:** A newly installed tool shows insufficient history instead of a fabricated upward curve.

### REPORTING-04 · TV mode is a separate audience (must)

Use independently scoped read-only display access, explicit expiry/revocation and aggregate data by default. No employee names, private tickets, contracts or departure details on shared screens. Show unavailable sources and freshness prominently.

**Verify:** A revoked, expired or stale display hides protected data and cannot navigate into an admin session.

### REPORTING-05 · Design for the viewing distance (should)

Provide a deliberate 16:9 wallboard layout tested at 1920 × 1080 and 3840 × 2160. Use a few large summaries and readable labels, not a scaled desktop table. Subtle change transitions may help orientation; avoid mandatory carousels and constant movement.

**Verify:** At the intended room distance, viewers can read the key state without approaching the screen.

### REPORTING-06 · Reports preserve approval meaning (must)

Operational summaries, submitted time, approved time, compensation calculation, released statements and payroll export are distinct. Show units, timezone, policy version, currency, adjustments and approval history. A report does not claim money was paid unless that result is verified.

**Verify:** HR/Finance can reconcile a period without receiving unnecessary incident content; self-approval rules remain enforced.

## Accessible by default

WCAG 2.2 AA is the acceptance target. These rules are a practical baseline, not a certification or a substitute for a full audit.

### ACCESSIBILITY-01 · Meet contrast and reflow requirements (must)

Text normally needs at least 4.5:1 contrast; large text may use 3:1. Meaningful graphics and control boundaries need 3:1 where required. Support 200% text resizing and reflow at 320 CSS px without loss of functionality. Test text-spacing overrides.

**Verify:** Run automated contrast checks, then inspect actual rendered combinations and keyboard focus in both themes.

### ACCESSIBILITY-02 · Make every task keyboard operable (must)

Use logical DOM order, visible focus, a skip link and landmarks. Keep focus unobscured by sticky bars and overlays. Do not use positive tabindex. Pointer actions have keyboard equivalents; drag actions also have a simple non-dragging method.

**Verify:** Complete the principal task and recover from an error without touching a mouse.

### ACCESSIBILITY-03 · Use comfortable targets (must)

Aim for 44 × 44 CSS px controls and touch targets; dense desktop controls may be 36 px where spacing and purpose justify it. Meet WCAG 2.2 target-size requirements or their documented exceptions; do not use a tiny icon as the sole hit area.

**Verify:** Check adjacent controls at touch size and zoom, not only with a precise pointer.

### ACCESSIBILITY-04 · Expose names, relationships and updates (must)

Use semantic headings, lists, tables with headers and accessible form associations. Icon-only actions name the action, not the shape. Status changes are announced appropriately; charts and images provide equivalent information.

**Verify:** Inspect the accessibility tree and test representative flows with VoiceOver or another screen reader.

### ACCESSIBILITY-05 · Respect motion and sensory needs (must)

Honor prefers-reduced-motion. No essential information depends on motion, sound, colour or hover alone. Avoid flashes and autoplay media. Provide pause/stop controls for nonessential persistent movement or automatically updating presentations where required.

**Verify:** Reduced-motion mode retains every status and action with no shimmering skeleton or looping decorative animation.

### ACCESSIBILITY-06 · Keep authentication accessible (must)

Allow password managers, paste and platform authentication aids. Avoid arbitrary memory puzzles. Explain passkey, provider and popup progress; provide recovery when the external flow closes or fails. Do not time out a user’s work without warning and a recovery path where feasible.

**Verify:** Keyboard and assistive-technology users can complete sign-in and return to the intended task.

## Words, time & language

Be calm, direct and precise. The operator should not have to translate implementation vocabulary into a decision.

### WRITING-01 · Say the outcome first (must)

Use short sentences, concrete nouns and useful verbs. Explain the action and consequence next. Put implementation detail behind a relevant disclosure. Prefer one concise helper line to a paragraph that repeats the title.

**Verify:** Remove every sentence that neither helps a decision nor explains a necessary consequence.

### WRITING-02 · Use consistent microcopy (must)

Buttons describe the result; confirmations name scope; errors say what failed and how to proceed. Avoid vague OK, Submit, magic, bulletproof, guaranteed and blame. Completed work gets a calm receipt, not praise or confetti.

**Verify:** Save access policy; Access saved · awaiting app confirmation; Could not confirm access · check connection.

### WRITING-03 · Make time unambiguous (must)

Use locale-aware display and stable machine timestamps. Show an exact date/time and timezone for deadlines, schedules and evidence; relative time can supplement it. Let viewers distinguish their timezone from the schedule’s timezone. Define DST and period boundaries.

**Verify:** A handover across regions cannot be interpreted as two different instants.

### WRITING-04 · Localize meaning, not just strings (must)

Keep language selection consistent with the suite. Support longer translations, plural forms, diacritics and locale number/date formatting. Do not concatenate translated sentence fragments. Keep a currency code with ambiguous symbols and never silently convert amounts.

**Verify:** Test German-length labels and at least one narrow viewport with non-English names.

### WRITING-05 · Teach at the point of need (should)

Offer brief contextual help and a linked guide for external setup. Show prerequisite, procedure, verification and recovery; label planned behavior separately. Keep changelogs focused on changed user behavior and migration impact.

**Verify:** An IT operator can finish setup without a web search; a leader can understand operational dependencies and remaining work.

### WRITING-06 · Keep examples safe to publish (must)

Use fictitious people, example.com domains, placeholder IDs and sanitized records in docs, screenshots, templates and fixtures. Do not copy customer data or internal policy into public examples.

**Verify:** Review documentation and visual assets as part of the sanitized repository publication checks.

## Motion, speed & shared surfaces

Smooth means stable, responsive and understandable, even when the backend is slow.

### DELIVERY-01 · Animate orientation, not decoration (should)

Use 120 ms feedback, 180 ms state transitions and at most 240 ms for a deliberate panel movement. Prefer opacity and transforms; do not animate layout size in a busy queue. Never delay an action just to finish an animation.

**Verify:** Every transition has a purpose and a reduced-motion alternative.

### DELIVERY-02 · Keep the first useful view lightweight (must)

Reuse local assets, load detail when needed, bound lists and avoid loading all private data for an aggregate. Show independent results progressively. No third-party font or analytics request merely to render the core work surface.

**Verify:** Measure cold start and a slow connection; publish actual measurements rather than promising instant loads.

### DELIVERY-03 · Prevent layout and focus jumps (must)

Reserve image and skeleton dimensions. Keep stable keys, labels and button widths during async work. Do not rerender the active input or reorder current work because a polling request finished.

**Verify:** Typing, tabbing and clicking remain predictable while data refreshes.

### DELIVERY-04 · Keep every touchpoint in the family (must)

Apply the same logo, naming, token roles and content hierarchy to login, tools, Hub menu, Kitchen, Cloud Engine metadata, help, emails, exports, embeds and marketplace material. Functional documents such as invoices keep their required semantics.

**Verify:** Review a full journey including the email/link, login, task, confirmation and downloaded evidence.

### DELIVERY-05 · Shared foundations stay shared (must)

SDK client and runtime token copies remain byte-identical to their canonical sources. Use the shared sign-in shell. New components need documented states and keyboard behavior before adoption. Eliminate app overrides only as part of a verified migration, not by sweeping replacement.

**Verify:** Run SDK, logo and design drift checks and compare representative screenshots in all affected apps.

### DELIVERY-06 · Make extension a supported path (should)

Give templates, stable IDs, scoped API examples, field/schema discovery, verification and failure examples. Show what a key may do and where it must be stored. Prefer a working first integration over a long catalogue of possible integrations.

**Verify:** An operator can test an embed or API request with fictitious data and understand a denied or partial result.

## Keep the standard alive

The standard is versioned source. Adoption is verified per surface and role, not declared suite-wide because this page exists.

### GOVERNANCE-01 · Read the standard before changing UI (must)

Read design/README.md, the relevant rules and the affected module guides before design work. Reference rule IDs in reviews. New tools use the same foundations; a new tool does not get a new design language.

**Verify:** A change identifies its user task, relevant rules and acceptance evidence.

### GOVERNANCE-02 · Use explicit rule strength (must)

Must is an acceptance requirement. Should is the default and may differ for a documented task-specific reason. A must exception needs a written decision, owner, affected scope, compensating measure and expiry/review date; it never authorizes a permission or safety bypass.

**Verify:** Exceptions are discoverable in the app audit and do not silently redefine shared components.

### GOVERNANCE-03 · Record adoption honestly (must)

Use Not reviewed, Gap found, In progress and Verified with date, commit, role, viewport and evidence. Do not label an entire app compliant after reviewing one page. Shared visual adoption and complete workflow/accessibility certification are separate evidence claims.

**Verify:** The audit distinguishes inspected facts, hypotheses and untested scenarios.

### GOVERNANCE-04 · Verify before release (must)

Use the acceptance checklist for role scope, workflow integrity, accessibility, privacy and visual consistency. Preserve real authorization and data-integrity regressions. Follow the existing tested-release and production-authorization workflow. A design change never grants rollout authority.

**Verify:** No release has an unresolved critical data/access defect or silently skipped required check.

### GOVERNANCE-05 · Change one source, regenerate copies (must)

Edit standard.json and tokens.json as source; generate the browsable standard, Markdown and Hub-served copies with npm run design:build. Edit logos only in their registry. Bump the design version and changelog; bump affected modules for their releases.

**Verify:** npm run design:check and npm run brand:check pass; committed generated files match source.

### GOVERNANCE-06 · Review the value of the interface (should)

In each iteration, remove an unnecessary decision, duplicate entry or ambiguous state before adding a new configuration option. Test key jobs with an IT operator and the actual secondary roles, including employees and Finance.

**Verify:** Keep a short before/after task record; unresolved friction becomes a prioritized issue, not more help text.

### GOVERNANCE-07 · Review the assembled page, not only its tokens (must)

Passing token, contrast and functionality checks does not verify visual composition. For changed operational pages, capture before/after rendered views with realistic data at desktop and narrow widths in both themes. Record first-useful-content position, context/control sizes and repeated secondary actions. Review the full initial viewport, not just a cropped component. An automated layout check detects size/reflow regressions; it cannot approve hierarchy or usability. Correct an earlier review record when user feedback exposes a missed problem.

**Verify:** The change has an explicit composition verdict and evidence in its review record. Any untested role, text zoom or viewport stays unverified. A large empty context card or equally prominent routine actions is a failed review even when each token is correct.

## Primary references

- [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) — accessibility acceptance target, not a conformance certification.
- [Text resize](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [accessible authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html) — implementation context.
- [Suite identity](brand/README.md), [product logo rules](logos/README.md), [tokens](tokens.json), [component dimensions](UI-REFERENCE.md) and [adoption plan](ADOPTION.md).
- Exact runtime permission behavior: repository `docs/APP-PERMISSIONS.md`; this product standard does not replace its enforcement contract.
