# kebab-stack Trust

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

Trust gives IT a practical worklist of devices that need attention. Employees can
see their own devices and understand what their company checks. A read-only
[osquery agent](https://github.com/osquery/osquery) reports system facts; Trust
shows the evidence and the next step. IT performs remediation through its normal
management tools, then verifies a fresh report.

## The everyday workflow

1. **Devices** starts with four filters: All devices, Needs attention, Not verified
   and Checks passing. Search by device/person and narrow by operating system or
   missing assignment. Current failures appear first. Samples are labelled.
2. Open a device for the next action and its outstanding checks. Passing checks,
   SQL/evidence, last reported device facts and investigation tools use disclosures
   so that technical detail does not obscure the work.
3. **Checks** exposes each query and pass rule to everyone signed in. Admins
   select a baseline per OS or add a custom check. A preset changes the selection;
   **Save changes** applies it. Unsaved selections survive navigation in the current
   session. They are cleared when the signed-in identity or role changes.
4. **Investigate** targets one device, a chosen OS or the fleet. Read-only SQL can
   be written directly or drafted with the Hub-configured AI provider. Review and
   run are separate actions. Samples cannot answer. Recent query text is visible
   to everyone signed in; returned device data is admin-only.
5. **Add devices** prepares enrolment and an OS-specific installer. **Settings**
   holds the Assets connection, agent update policy, explicit agent-performance
   save, removed devices and activity. **Guide** explains the same flow in the app.

## What the status means

| Status | Meaning |
| --- | --- |
| Needs attention | At least one recent, applicable check failed. |
| Waiting for checks | Results are missing or have no individually recorded age. |
| Check unavailable | The agent reported a query error; it is not a pass or confirmed policy failure. |
| Out of date | The device's last contact or an applicable check is older than 24 hours. |
| No active checks | IT has not enabled any checks for this OS. |
| Checks passing | Every active, applicable check has a recent successful result. |

The **Not verified** filter groups missing, unavailable, old and unconfigured
results. Current failures take priority in the worklist; old or missing
evidence remains visible alongside them on the device. The retained API score uses all expected
checks as its denominator, including missing results. It is not a security or
compliance rating. Each check has its own receipt timestamp. Updating a custom
check or re-enabling a check requires fresh results; versioned query identifiers
reject delayed answers to an earlier definition.

The catalogue is a CIS-derived starting point, not a certified CIS assessment.
A passing check means its configured rule matched the agent's reported rows.
Empty rows are only a valid pass for a rule explicitly allowing them; nonzero
osquery distributed-query statuses are treated as unavailable, including
status-only errors. Trust cannot detect every unsupported/permission-limited
query that reports success with no rows, or a tampered agent that lies.

## People, access and connected tools

Roles are managed only in [Hub → Permissions](../docs/APP-PERMISSIONS.md).
Active Hub owners/admins and Trust Admins manage the fleet. Fleet viewers read all
devices without administration; employees see their assigned devices. Sign-in
uses the shared Hub screen and ticket flow. The existing 60-second complete-directory
lease bounds cached access; Trust is not a second role-management system.

Assets supplies serial → Hub person ID through its allowed `trust_serialOwners`
connection, normally pulled every 15 minutes. Trust allows a manual fallback for
serials absent from that feed. Assignment changes belong in Assets when Assets
supplies the record. Removing monitoring in Trust does not return, sell or change
custody of hardware in Assets.

Newly failing checks can notify the assigned active employee through the Hub
(bell and optionally Slack DM). Delivery is best effort. Desk can read
permission-checked summaries through the Hub's
[employee context](../docs/LIFECYCLE.md), including unavailable/old results.
This release changes neither Hub role policies nor Lunch's directory integration.

## Agent operation and limits

- Installers support macOS, Linux and **Windows pilot**. Pilot on a real device
  before broad deployment. Trust retrieves active checks through the distributed
  lane, seeded on `/config` retrieval (normally every five minutes); answers
  arrive on subsequent agent polls. Offline devices take longer.
- Agent watchdog limits and polling settings apply only after **Save agent
  settings**, when agents next retrieve configuration. File carving and event
  streams stay disabled.
- The deployment tool is the update authority. **Add devices** generates a
  reviewed, SHA-256-pinned installer for the selected OS; Trust does not run a
  hidden updater on employee devices. macOS also gets a managed background-item
  profile and an explicitly optional quiet-notifications profile for Iru.
- Removal blocks re-enrolment immediately and creates an operator-verification
  record. IT removes the agent through Iru, runs the matching audit script and
  saves the Iru job reference. Trust never claims removal merely because a
  device is offline, and it never deletes a generic osquery installation.
- AI drafting sends the question to the configured provider. Device answers are
  not automatically attached; do not paste confidential evidence into a question
  unless that disclosure is appropriate for the company's provider policy.
- Queries can expose system and application metadata within the agent's granted
  permissions. The deployment's Cloud Engine, operators, hosting jurisdiction and
  AI provider determine data-location/confidentiality properties. This UI is not
  a confidentiality or regulatory guarantee.
- No posture-based sign-in gate or automatic remediation is implemented. IT still
  deploys agents, chooses suitable checks, investigates and fixes problems. Trust
  can reduce manual evidence collection; no measured time or cost saving is claimed.

## Deployment guide

The **Add devices** flow is the source of truth for rollout. Prepare the
enrolment secret, download the macOS background-item profile, assign it in Iru,
wait for the profile to be reported as installed, and then deploy the selected
installer as a one-time Custom Script running as root/System. Start with one
pilot device and verify a fresh result, the Assets person assignment and the
local audit before expanding the blueprint. The optional quiet profile suppresses
the macOS background-item notification category for every app on that device;
it is a company policy choice and is never silently assumed by Trust.

The generated installer downloads an official osquery artifact, checks its
SHA-256 and publisher signature where the platform exposes one, writes only to
Trust-owned paths, uses a lock, validates the Trust health endpoint and refuses
unknown existing services. `preflight`, `audit`, `uninstall` and `audit-removed`
files are available from the same flow for Iru jobs. Windows remains a pilot
path; Linux supports systemd on x86_64 and arm64.

Devices with the old installer need the explicit migration download. Migration
only proceeds when the existing Trust endpoint, service definition and updater
match the known legacy shape. Shared or unknown osquery installations stop with
an actionable error for IT review. No automatic deletion of `/var/osquery`,
`/opt/osquery`, `/etc/osquery` or another vendor's service is attempted.

## Upgrade and development

Install or update through **Hub → Apps**, following [INSTALL.md](INSTALL.md).
The 0.6 upgrade preserves enrolled agent keys, ownership, settings and stored
results. The 0.7 upgrade preserves those records and changes only the endpoint
deployment model: existing legacy agents remain enrolled until IT explicitly
migrates them through the generated migration script. Results from earlier
releases become unverified until fresh reports arrive because those versions did
not record individual check timestamps.

Browser device IDs now use separate stable `device-N` handles. The Candid field
is still named `nodeKey` for compatibility, but browser results and new device
links no longer return the agent's authentication key. Existing agents retain
their keys; this does **not** rotate credentials exposed by earlier releases or
remove them from old notifications/browser history. Old device links remain
subject to the same signed-in ownership/role checks. Enrolment returns the real
agent key only through its existing secret-protected protocol.

Local checks (isolated identities/canisters only):

```sh
npm ci
(cd trust && ../node_modules/.bin/mops install --locked && ../node_modules/.bin/mops check --fix && ../node_modules/.bin/mops build)
python3 tools/sync-bindings.py trust
bash trust/test/run-smoke.sh
node --test tests/trust-workspace.test.mjs
```

Set `KEBAB_TRUST_BASELINE` to a directory containing a previously released
`backend.wasm` and matching `backend.did` from 0.5 to run the populated upgrade test.
`KEBAB_TRUST_MANAGED_BASELINE` accepts the released 0.7.0 artifacts to additionally
verify that the patch upgrade preserves removal evidence and device revocation.
`KEBAB_TEST_WASM_DIR` can select extracted release artifacts by module for testing
the executables that will actually be published. Keep the committed stable
signature and check compatibility before any baseline replacement.

`node trust/tools/preview.mjs` builds a temporary preview directory with fictional
data and a stubbed actor. Serve the printed directory locally; it never calls
production canisters and its Admin/Viewer/Employee links are preview controls only.

## Hub Operations

This app contributes aggregate-only, Admin-authorized summaries to Hub → Operations. See [definitions, access and freshness](../docs/HUB-OPERATIONS.md). Individual records remain in the app.
