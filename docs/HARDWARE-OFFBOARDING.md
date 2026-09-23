# Hardware offboarding

Implemented in Hub 0.27, Desk 0.14 and Assets 0.13; the suite remains alpha.
Use the [operator guide](OPERATIONS.md) for installation-specific rollout and recovery. Production receipts are intentionally kept outside the public source.

## Operator workflow

1. HR creates an Offboarding request in Desk, or an unexpected Okta/SCIM/Hub
   deactivation creates an internal account review. A deactivation alone does not
   prove a departure and never changes device custody.
2. Confirm the departure and any configured approval. Desk automatically captures
   the person's assigned laptops, phones, monitors, accessories and other hardware
   from every connected Assets app. New assignments are picked up on subsequent checks.
3. In Desk, **Person & related work → Hardware** shows the verified completion count.
   The Assets summary links to each device; its **Offboarding** card holds the plan,
   responsible Assets admin, due date and link back to the Desk case. Assets also has
   an **Offboarding** filter that includes outstanding archived devices.
4. Choose the outcome for each device:
   - **Return to IT:** keep the employee as holder until IT confirms the serial/tag
     and actual receipt. The device enters **With IT · preparing**. Record the
     applicable data, management and condition checks before **Ready for reuse**.
   - **Hand over to a colleague:** select an active recipient; save the plan, then
     confirm physical handover. Planning alone never changes the holder.
   - **Sell:** use the existing sale and dealroom. Payment, preparation, archived
     invoice and handover are required by the sale flow. Cancellation before
     handover leaves the hardware position open. A later financial cancellation
     cannot undo an already recorded physical handover.
   - **Exception:** an Assets admin confirms the device identifier and records a
     reason with follow-up responsibility. Missing hardware stays assigned and is
     marked lost; the exception is not recorded as a return.
5. Desk checks Assets again before resolving or closing. Outstanding positions or
   an unavailable source block completion. The shipped **Reclaim devices** checklist item follows Assets automatically;
   custom checklist wording stays operator-managed. A requester cannot self-complete an offboarding.

Review and not-departure decisions remain in Desk. Use **Cancel this offboarding**
with a reason for an incorrect or cancelled HR request. Outstanding plans stop;
recorded physical actions remain. A later departure starts a new case. Reactivation pauses outstanding
work until another explicit decision; completed physical actions are preserved.
Existing directory revocation and Lunch registration synchronization are unchanged.

## Selling to a former employee

For a new sale, choose **outside buyer** and supply a reachable private contact.
The employee's stable identity remains associated with the hardware follow-up and
Desk summary; the buyer receives no company account or directory access.

For an existing colleague sale, use **Continue after departure** after confirming
the Desk case. Enter a private email address, then create a private dealroom link.
An unissued offer resets acceptance and requires the buyer to accept again. An
issued invoice keeps its buyer, number, acceptance, stored data and exact archived
PDF. Access is to that same transaction, not a replacement invoice.

The link is a bearer credential: IT copies and sends it to the intended buyer
through an appropriate channel. Kebabstack does not automatically email the link
or verify ownership of the private mailbox. Links expire after 14 days and can be
replaced or revoked. The additional private contact used to enable an existing
invoice's dealroom is removed by the background sweep after its 14-day access
window. Buyer details already in a sale, financial records, events and backups
follow their existing retention; this is not a general personal-data erasure policy.

## Responsibilities and boundaries

Hub remains the permission authority. Desk staff with access to the internal case
see aggregate hardware progress. Device details still require the viewer's Assets
permission; mutations require Assets admin, a fresh directory lease and a fresh
Hub-brokered check of the Desk case. Customer-project tickets and employee portal
views do not receive these internal summaries or new offboarding notes.

The coordination stores case references and plans in new side tables; existing
asset, invoice and directory records retain their schema. Repeated synchronization
is idempotent. Serial/tag confirmation is an operator attestation, not sensor proof.
CSV imports cannot replace custody on an outstanding plan; MDM suggestions cannot
reassign hardware with a recorded follow-up. Hub's generic ownership transfer is
retired for devices because it cannot confirm receipt.

Background synchronization processes up to ten cases per sweep, normally starting
every 30 seconds. Refreshing the person panel checks that case immediately. App
outages, backlogs and directory freshness can delay progress. Cross-canister reads
are not atomic transactions with Okta; the system checks again around awaits but
does not promise instantaneous revocation. Repeated delays stay visible and require
operator investigation. Removing an Assets connector with existing work must not
be used to bypass verification.

## Why this reduces IT work

The stack discovers hardware from the stable employee identity, prepares the
follow-up and reads the result back from the system that records custody. IT no
longer needs to reconstruct the device list and tick the same result in two apps.
IT still confirms the departure, makes the disposition decision, performs physical
work, verifies preparation and reconciles money. No numerical savings are claimed;
measure avoided cross-app lookups and duplicate updates against your own baseline.

Upgrade all three apps together using the tested suite release procedure in
[Kitchen INSTALL](../kitchen/INSTALL.md). Older peers fail as unavailable rather
than claiming there is no hardware. Keep production deployment receipts separate
from the source changelogs.
