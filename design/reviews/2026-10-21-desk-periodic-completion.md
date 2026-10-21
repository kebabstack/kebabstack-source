# Desk periodic completion review

- Standard: 1.2.0; candidate Desk 0.36.0, Website 0.5.9.
- Job: remove the second manual status update after a clear public staff solution.
- Scope: internal support; public Slack/Desk comments, current staff permissions,
  existing Resolve gates. Customer workflows and internal notes are excluded.
- Status: scoped review; not whole-app accessibility certification.
- Rules: PURPOSE-01/03/04/05, AUTOMATION-01/03/04/06, NAVIGATION-06.

## Behavior and evidence

The prior implementation assessed new Slack replies once. No periodic retry or
review of existing open requests existed. The new durable cursor visits up to
200 IDs and assesses up to four comments every 15 minutes. Failed responses retry
with bounded backoff; unchanged evaluated revisions avoid repeated AI charges.
A public staff comment must be the latest eligible evidence. A later requester
reply, note or status action prevents recycling old evidence. An explicit manual
reopen therefore wins. Required checklist/approval/offboarding gates still run.
This conservative boundary can leave genuinely solved tickets open, including
those followed by a requester acknowledgement; a new public staff confirmation
or manual Resolve remains necessary. It is not full-thread semantic completion.

`tests/desk-slack.test.mjs` exercises real Hub/Desk Wasm and timers, with mocked
AI/Slack boundaries: catch-up, retry after upgrade, keep-decision deduplication,
newer-message races, role revocation, checklist blocking, disabled assistance,
four-review batches and progress beyond the 200-ID boundary. Published-baseline
upgrade cases require the explicit baseline fixture. These checks establish
orchestration and authority; they do not measure the provider's classification
accuracy or certify a live Slack workspace.

The old Settings claim that AI never changes tickets without a click was wrong.
Settings/help now explain automation, pause, audit activity, retry and reopening.
The existing assistance switch remains the control, with the scope expanded in
this upgrade. Review that scope before a production rollout. No new API method,
Candid type, SDK surface or permission is introduced by the periodic review.

## Visual scope

The actual Desk shell was operated locally with synthetic backend responses at
1280×800 and 390×844. The assistance switch responds to click and Space; feedback
shows on/off. The mobile page scrolls without horizontal overflow and the global
bar remains at the viewport top. Provider details use a disclosure to avoid a
long unbroken explanation. Existing app tokens, logos and controls are reused.
Private screenshots accompany the operator's release report, not this source.
320px, tablet, dark-theme, 200% text and screen-reader certification remain open;
no whole-stack visual pass is claimed. Production is a separate approval step.
