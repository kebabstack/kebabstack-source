# Trust deployment files

Trust generates the files in **Devices → Add devices**. The generated installer
contains the enrolment secret and is therefore an operator credential. Keep it
inside Iru or another approved management system; do not paste it into chat,
email or a public ticket.

## Iru / Kandji order

1. Assign `trust-background.mobileconfig` to a pilot blueprint. It manages the
   exact Trust launch daemon labels and keeps the service visible as managed.
2. Wait for the device record to report the profile as installed. If the company
   wants no macOS background-item banners, assign
   `trust-notifications.mobileconfig` as a separate, documented policy. It
   suppresses that macOS notification category for all applications on the
   device, so it is never bundled into the installer automatically.
3. Run the matching `trust-<os>-install` script once as root/System. Configure
   Iru to retry a failed script, and keep the output in the job record.
4. Confirm a fresh device result and Assets assignment in Trust. Expand the
   blueprint only after the pilot passes.

`preflight` checks prerequisites without installing. `audit` checks the local
service and Trust-owned files. `uninstall` removes only a Trust v2 installation,
and `audit-removed` confirms that it is gone. These scripts exit nonzero when
ownership, service definitions, MDM profiles or signatures are unexpected.

## Existing installations

The migration script is only for the previous Trust installer on the same Trust
server. It checks the endpoint and exact service definitions before taking over.
It leaves generic osquery files, databases and services untouched. If the check
cannot prove ownership, stop and review the device manually.

Trust revokes an enrolled device immediately when an admin removes monitoring.
That action does not execute an uninstall on the endpoint. Run `uninstall` via
Iru, then `audit-removed`, and save the Iru job reference under the pending
removal record in Trust. Re-enabling enrolment does not reinstall anything.

The files are generated from `unix.sh`, `windows.ps1`, `release.json` and the
profile templates. Run `python3 trust/tools/build-agent-templates.py` after
changing those sources; do not hand-edit `AgentDeployment.mo`.
