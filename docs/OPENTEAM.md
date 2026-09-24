# OpenTeam → Kebabstack Hub

Hub 0.35.0 adds an optional **read-only directory source** for companies using
OpenSaaS OpenTeam and Kebabstack on Cloud Engines, including OpenCloud.
It is disabled until an owner reviews an import. Installing or upgrading Hub
never connects a company's OpenTeam automatically.

## What an operator does

1. Open **Hub → Directory sync → OpenTeam** as a Hub owner.
2. Give the source a name and paste the **OpenTeam backend canister ID** from
   that deployment. A website URL is not a backend ID. No API key is required by
   the reviewed roster API; if the provider restricts roster readers, its
   operator must permit the Hub backend canister. Network reachability between
   the two deployments is required.
3. Keep the default employee scope, or deliberately include contractors and
   partners. AI agent identities are always excluded. Exclude stable member IDs
   already managed by another source, including the initial Hub owner's account
   if that address exists in OpenTeam.
4. Choose **Save & preview**. Review additions, updates, source deactivations and
   conflicts. No people change during preview. Up to 50 changed rows/conflicts
   are shown; the counts cover the full snapshot. Resolve and repeat as needed.
5. Choose **Apply & enable sync**. The same snapshot must still be current.
   Hub reads the full roster every five minutes, independently of the Okta pull
   interval. App permissions, Finance, authentication and groups stay in Hub.
6. Check the source's last successful sync and current error state. **Pause**
   stops imports but retains existing accounts/access. Editing the import scope
   pauses the source until a new preview is applied. Imported people appear in
   People with the source name and can use the Hub's existing sign-in methods.

A new source is authoritative directory input: an owner must trust its operator
and verify that it is their company's deployment. Treat it like granting an IdP
permission to provision employees. This connector does not prove the authenticity
of the source's employment decisions.

## Identity and departure behavior

- The pair `(source ID, OpenTeam memberId)` is permanent. Changing an email
  retains the Hub person ID and its central assignments.
- An email belonging to another current or historical Hub identity blocks the
  import. We never infer that these are the same person and transfer roles.
  Existing-source migration is deliberately not an automatic merge: exclude
  those IDs and reconcile ownership before moving a populated directory.
- Explicit `active=false`, an out-of-scope member or a missing member in a
  verified complete roster makes that source account inactive. Other active
  sources or audited force-active overrides can retain access; Hub's manual
  block continues to take precedence. Initial inactive imports do not mean a
  new employee departure. Changes enter the existing Hub lifecycle path, which
  connected Desk/Assets workflows consume according to their configuration.
- Five or more deactivations affecting at least 20% of an active source, or an
  empty roster replacing any active source, require owner preview and approval.
  This holds the last good roster instead of applying a surprising bulk change.
- OpenTeam erasure tombstones scrub the mirrored source name, email and profile
  attributes and remove that account's force-active override. The member ID
  cannot be revived. Hub's person registry/history, records in other tools and
  statutory retention are separate: this is **not** a suite-wide data-erasure
  receipt or a claim of complete GDPR fulfillment.
- A failed, unsupported, incomplete or changing response applies nothing.
  Last-success time remains visible; after 15 minutes the view marks sync
  overdue. There is no outage-based mass deactivation. Operators must handle
  urgent access removal in Hub during an outage. Delivery latency includes the
  polling interval, availability and downstream refresh/lease enforcement;
  it is not instantaneous revocation.

## Compatibility boundary

| Capability | Hub 0.35.0 |
|---|---|
| `team_info` handshake + `team_members_page` | Implemented; native Candid calls from the Hub backend |
| Stable member ID, names, email, title, department/manager IDs | Mirrored; department names and org-chart UI are not imported |
| Explicit active/erased/kind fields | Checked; missing activity or unknown kind fails the snapshot |
| Polling, complete snapshot validation, change sequence consistency | Implemented; 30-second bounded calls, 2-minute overall read budget, ≤100 pages / 10,000 records |
| Push subscription / change feed | Not used; five-minute polling |
| OpenTeam roles / groups / protected flags | Not imported as Kebabstack rights |
| Hub roles, per-app policies and Finance | Remain configured centrally in Hub |
| OpenSaaS shared sign-in / Launchpad leases | Not implemented by this connector; existing Hub SSO remains separate |
| OpenSaaS AI gateway / service trust / write-back / erasure receipts | Not implemented by this connector |
| Existing Lunch `team_info` / `team_members` provider | Preserved; separate minimal Hub provider contract |

The accepted profile is `team-directory` major 2, minor ≥29, with `changeSeq`
and explicit active/kind fields. Version 3 is rejected until reviewed. The
reference inspected was OpenSaaS **team-directory 2.35.0**, commit
`b8ca1a1d2811e2ca68cc5b1eda002aaebd2a7d6d` in the
[OpenSaaS organization](https://github.com/open-saas-and-aiware). Its source was
reviewed with authorized access. No private upstream implementation is vendored
or relicensed here. The consumer and synthetic fixture are independently written.
Accepting a compatible major/minor is a handshake policy, not a claim that every
provider version has been run against a real customer deployment.

## Verification and release status

`tests/openteam.test.mjs` exercises the native wire interface against a local
synthetic provider, real Hub state, negative permissions, complete-page checks,
identity conflicts, stale previews, departure guards, polling and upgrades.
The synthetic provider can also mutate between calls to reproduce roster skew.
It is not a deployed OpenTeam instance. `hub/test/openteam-ui.mjs` covers owner
review, staff read-only access, escaping and draft preservation.

For a populated prior-version upgrade, set `KEBAB_OPENTEAM_BASELINE` to the
verified Hub 0.34.0 Wasm and run the backend test. New sources persist across a
candidate upgrade; preexisting Lunch, Finance and owner settings must survive.
Committed stable signatures are checked separately without replacing them.

Hub 0.35.0 ships this connector as an **optional alpha feature**. Publishing or
deploying it does not connect any OpenTeam instance. A joint pilot against the
customer's actual OpenTeam build remains the final deployment acceptance step.

A precise statement for a decision-maker:

> Kebabstack implements an OpenTeam directory connector: it can import people
> and employment status into Hub while keeping Kebabstack permissions central.
> The directory contract is locally tested. Shared OpenSaaS login and wider
> suite integration are separate capabilities and are not claimed here.
