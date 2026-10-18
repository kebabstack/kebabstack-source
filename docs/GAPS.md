# Current limits and adoption gates

Evidence review: 18 October 2026. This replaces the historical September overview;
module README/INSTALL guides and changelogs define implemented behavior. The suite
remains alpha. Source, automated tests and selected browser reviews do not certify
every live workflow, tenant integration, accessibility requirement or operating scale.

| Area | Current boundary | Before broader adoption |
|---|---|---|
| Release validation | Build/stable-signature, frontend and local backend tests are implemented. Package and populated-upgrade evidence is release-specific; historical baselines are sometimes unavailable. | Test the exact package against the previously published release; record every skip and installation-specific verification. See [release workflow](../kitchen/INSTALL.md). |
| Recovery | Snapshots are per canister; they are not an atomic whole-suite backup or independent external archive. | Define RPO/RTO, controller recovery, cross-module restore order and representative restore exercises. |
| Identity lifecycle | Hub and bundled apps use the shared person/access contracts; rename, replacement-person and revocation behavior has scoped regressions. External provisioning and older app versions can have different behavior. | Follow [person migrations](PERSON-IDS.md), test actual source lifecycle events and app versions, and do not assume arbitrary identities can be merged automatically. |
| Identity integrations | SSO, SCIM, OIDC and optional directory connectors have documented subsets. Local fixtures do not qualify every external tenant or relying party. | Test the real provider configuration and required lifecycle/filter semantics. |
| AI assistants | MCP acts with the person's current permitted app access; it rechecks Hub authorization and does not automatically replay updates. Client/provider data handling is a separate trust boundary. | Review [MCP installation and revocation](../kebab-mcp/INSTALL.md); secure local credentials and approve appropriate model/provider data flows. |
| Revocation | Bundled-app directory freshness checks, IdP synchronization and external sessions have separate timing and failure behavior. | Measure the actual end-to-end offboarding path; do not promise instantaneous universal revocation. |
| External provisioning | The suite is not a complete outbound SaaS provisioning/offboarding replacement. | Keep vendor-specific account and subscription work explicit. |
| Trust | Posture is reported by an endpoint agent; a compromised endpoint can misreport. A passing test does not establish fleet-wide compliance. | Validate supported device/OS installation, collection freshness and actual operator response. See [Trust](../trust/README.md). |
| Notification delivery | Notification and integration queues/retries differ by module. A configured destination is not proof of successful delivery. | Test denied scopes, outages, retries and visible failure history for each enabled connector. |
| Apple Business Manager | Read-only inventory and adoption require operator-managed Apple credentials and renewal. Do not infer additional Apple actions from inventory visibility. | Follow [Assets setup](../assets/INSTALL.md) and verify a representative live sync and renewal procedure. |
| Contracts | Browser document upload, PDF extraction, AI proposals, document preview and linked-terms evidence are implemented. Extraction and fetched terms can still be incomplete, inaccessible or wrong; human review remains necessary. | Test representative languages/layouts and compare proposals with source evidence; distinguish current fetched terms from the signed contract's applicable version. See [Contracts](../contracts/README.md). |
| Crumbs | Cookieless daily estimates and optional consented browser recognition have different identity semantics. Exact-count/load tests are bounded; they are not a throughput guarantee or proof that visitors equal people. | Compare controlled pageviews/events with reports, test consent/revocation and realistic cardinality; review [collection modes](../crumbs/dist/consent.html) and [API coverage](../crumbs/dist/api.html). |
| Game data | Public game source supports guest play, optional player identity and opt-in publication. Existing installations and the legacy 2D app must be assessed independently. | Verify profile ownership, score removal and compatible upgrades; do not treat the game as a company directory permission surface. |
| Cost and scale | No validated suite-wide operating-cost, capacity or availability benchmark. | Measure representative workloads and staff time; agree supported bounds. |
| Audit | Application journals and bounded histories are not an independent immutable compliance archive. | Establish export/retention and recovery requirements before making certification claims. |
| Cryptography | Identity/signing code remains security-sensitive; interoperability and negative tests are not an independent cryptographic audit. | Obtain specialist review for the intended identity-provider use. |
| Development dependencies | The pinned Mops development toolchain still has npm advisory findings. MCP and optional collector dependency audits must be tracked separately; passing tests do not clear advisories. | Review patched compatible tool versions without silently changing compiler/state contracts, and validate the complete build/upgrade path. |
| UX/accessibility | Automated smokes and selected real-browser checks cover specific views. Full module/role/viewport/workflow and assistive-technology certification remains incomplete. | Maintain the [integrity evidence matrix](INTEGRITY-CHECK.md), perform real scrolling/keyboard/zoom/mobile checks and validate with representative users. |

These are explicit adoption boundaries, not features promised for the next release.
See [operations](OPERATIONS.md), [positioning](POSITIONING.md) and each module's
current setup guide. A public source update does not mean that every installation
has been upgraded.
