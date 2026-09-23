# Install and update Trust

Use **Hub → Apps → Add app → Trust** for a new installation, or **Apps → Updates**
for an existing installation. Updates come from the company's configured release
store and use the same snapshot/upgrade/verification executor as the operator CLI.
See the [update service operator guide](../kitchen/INSTALL.md) for publishing,
recovery and adoption of previously installed canisters.

Requires Hub 0.23.0 or later and a saved **Hub → Permissions → Trust** policy.
Missing/incompatible policies deny protected sign-in. Review the
[central permission model](../docs/APP-PERMISSIONS.md); there is no role editor in
Trust. Hub owners/admins have administration, Fleet viewers have read access to the
fleet, and Employees see their own assigned devices.

## First device

1. Open Trust **Settings → Device assignments**. Set the Assets backend ID and
   choose **Save configuration**. In **Assets → Settings → Device trust**, allow
   the displayed Trust backend ID. **Refresh assignments** uses the saved
   connection. Trust normally refreshes assignments every 15 minutes.
2. Under **Deployment settings**, confirm the public Trust URL used in
   sign-in and notifications, and the agent gateway domain. Save configuration explicitly.
   Gateway changes require re-issued installers; already installed agents retain
   their configured endpoint.
3. Open **Devices → Add devices** and prepare the deployment. For macOS,
   download and assign the Background Items profile in Iru first; wait until
   Iru reports it installed. The optional Quiet Notifications profile suppresses
   all macOS background-item notices, so enable it only as a documented company
   policy. Then download the OS installer and run it once as root/System through
   Iru. **Windows is a pilot path.**
4. Keep the pilot device online and verify its assignment and checks. The local
   installer audit confirms the service and Trust-owned files; Trust itself then
   confirms enrolment and fresh evidence. A successful MDM job alone does not
   prove that the agent enrolled.
5. In **Checks**, select the appropriate per-OS baseline or custom checks and
   **Save changes**. Presets only change the draft selection. Shared SQL and
   recent investigations make the collection visible to employees.

For plain-language investigations, a Hub owner configures an AI provider under
**Hub → Settings → AI** and grants Trust AI access under **Apps → Trust → What it
may know**. Trust **Settings → AI assistance → Check connection** refreshes it.
SQL investigations work without AI. Questions go to that provider; device answers
are not automatically attached. Review the SQL and target OS before running.

## Routine administration

For a custom browser domain, first configure DNS, publish the installation-specific
`/.well-known/ic-domains` ownership file and register the domain with the ICP
gateway. Wait for valid HTTPS, then set the existing Hub app link and Trust address
to the same HTTPS origin (without a path, query or fragment). Old browser links
redirect there before using a session. Known routes and public device handles
survive; login tickets, query strings and legacy agent-key links do not travel
between origins. Agent gateway settings remain separate. The update service
preserves domain ownership files; do not add company domains to shared recipes.

- **Devices**: work through attention and unverified states. The device page
  shows next steps and evidence; IT applies fixes through its normal tools.
- **Settings → Agent updates**: deploy reviewed installer updates through Iru.
  Trust does not maintain a second hidden update channel.
- **Agent performance**: change polling/watchdog values, then choose **Save agent
  settings**. Edits alone do not affect the fleet; offline devices converge later.
- **Remove from Trust**: revokes enrolment and creates a pending removal record.
  Remove the agent through Iru, run the generated audit-removed script and save
  the Iru job reference. It does not alter Assets custody. **Settings → Removed
  devices** allows enrolment again; reinstall separately.
- **Sample data**: available in Settings for evaluation, labelled in the fleet,
  excluded from investigations and unable to submit agent reports.

## Upgrade to 0.7

The populated upgrade from 0.5 retains devices, agent authentication keys, owner assignments,
check selections, stored results and tuning. It adds separate browser identifiers
and per-check observation metadata without replacing the existing Node state.
Old agent results are retained but wait for fresh evidence before receiving a
verified passing state. No re-enrolment is required by the backend upgrade.

The 0.7 release retires the legacy public update/removal feeds. Existing agents
continue reporting; their old updater becomes inactive. Migrate those endpoints
explicitly using the download in **Add devices**. Future software updates and
uninstalls are deployed through your management tool. Removal in Trust alone
does not uninstall an endpoint agent.

The browser API's historical `nodeKey` field now contains a public device handle.
External clients using that field as an agent credential must instead keep the
key returned at enrolment. Old keys are not rotated by this upgrade: previously
exposed browser links/notifications need separate review if credential exposure is
suspected. Do not describe this as retroactive removal of leaked keys.

Build and publish a tested format-2 bundle from a clean checkout, then deploy the
identical stamped artifact via the update service. Preserve the existing release
store and immutable package paths. Production deployment requires authorization
for that deployment. Do not patch tracked deployment placeholders or commit live
IDs; exceptional bootstrap/adoption work follows the operator guide.

Before rollout, run frontend smokes, local authorization/data-integrity tests,
stable compatibility against the committed baseline, and a populated upgrade
using the actual packaged executable. Verify the unchanged Hub/Lunch artifacts
and existing central permissions when assembling a suite release.

## Operations rollout

Publish with Hub 0.28 and the matching source releases through the tested suite update service. No new roles, directory lanes or Lunch changes are required. Existing records remain in place. See [Operations rollout and verification](../docs/HUB-OPERATIONS.md#release-and-verification).
