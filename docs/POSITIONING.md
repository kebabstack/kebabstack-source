# Why kebab-stack may be worth running

Reviewed 2026-09-05. Audience: startup founders, SME executives and the IT
practitioner who will run it. This document governs product claims in the README
and how-tos. Implemented features are listed in the README; limitations in GAPS.md.

## The decision

kebab-stack is a candidate when a small IT team needs a shared directory, request
handling, inventory and domain monitoring, can work with the current feature set,
and is willing to own an alpha deployment. It may reduce software licence spend
and duplicate integration work. A paid, supported SaaS product may remain cheaper
once support time, missing integrations and migration are included.

Evaluate an actual workflow: onboard five test people, assign a device, process
and approve a request, deactivate a person, restore test data. Count manual steps,
time, failures and remaining SaaS dependencies. Do not extrapolate a successful
demo to thousands of people without load and failure tests.

## A cost model you can check

Compare the same required capabilities and service level, in one currency and tax
basis. Monthly total cost is:

`licences + infrastructure + external APIs + operating hours × hourly cost + migration cost / amortisation months`

For kebab-stack the licence term is zero under MIT. Infrastructure includes the
chosen engine configuration and capacity. External services can include the IdP,
AI, Slack and domains. Operating time includes upgrades, access review, incident
handling, restore drills and maintaining local changes. Migration includes data
conversion, integrations, training and parallel operation. Subtract only software
contracts you can really cancel; a ticket app does not replace email or endpoint
management.

Purely illustrative inputs, **not a price quote or benchmark**: retiring 600 units
of monthly licence cost while adding 200 of infrastructure/APIs, 250 of operation
and 100 of migration amortisation saves 50. If operation takes twice the assumed
time, that becomes a loss of 200. Replace every input with your own invoice,
provider quote and pilot measurement. Headcount alone is not a capacity measure.

OpenCloud describes infrastructure billing separately from per-seat OpenSaaS fees
and lets customers select nodes/operators/geographies. Those are provider claims,
not a measured kebab-stack bill or availability guarantee. Check the actual offer
for your engine. [OpenCloud](https://opencloud.org/) (checked 2026-09-05).

## What Motoko changes for a traditional IT team

A canister combines backend code and persistent application memory. The apps use
Motoko maps/records instead of a separately deployed SQL service. Orthogonal
persistence keeps that state across calls; compatible upgrades preserve it.
The compiler's stable-type check catches structural incompatibilities before
upgrade. It does not prove a changed business rule, authorization decision or
migration is correct. State changes still require design, compatibility checks,
representative upgrade tests and a recovery plan.

This removes some familiar services to operate. It introduces different constraints:
asynchronous inter-canister calls, message/instruction/memory limits, platform
specific deployment tools and a smaller specialist ecosystem. Cross-canister
operations are not one database transaction. A failed frontend update can leave
backend and frontend versions different until repaired.

[Motoko persistence documentation](https://docs.internetcomputer.org/languages/motoko/fundamentals/actors/orthogonal-persistence/enhanced/)
· [official upgrade/build workflow](https://skills.internetcomputer.org/skills/mops-cli/).

## Sovereignty, precisely

You can inspect and modify the MIT source. Your controller identities authorize
upgrades; Kitchen and Vault are powerful co-controllers and belong in the trust
model. Engine node selection can support location/operator requirements, subject
to the actual deployment. ICP protocol governance, gateways, identity providers
and application dependencies remain dependencies. The apps are not portable as-is
to a generic Docker/PostgreSQL host.

Replication protects availability/integrity under the platform's assumptions; it
is not application-level end-to-end encryption. Credentials and personal data in
canister state must not be advertised as unreadable to infrastructure operators.
AI can send ticket text or device images to the configured API; Slack receives
notification metadata. Disable integrations that your data policy does not allow.
Snapshots remain on the platform; CSV exports cover specific records and are not
a full, portable backup of every module.

## Claims allowed today

| Claim | Evidence and boundary |
|---|---|
| No kebab-stack seat licence | MIT; infrastructure and operation remain payable |
| Shared sign-in and directory | Hub contract used by Desk, Assets, Watch; app-specific roles/configuration remain |
| Bounded revocation in bundled apps | Complete directory lease below 60 seconds; Hub outage fails closed; upstream sync latency is additional |
| More control over software and infrastructure | Source and controllers plus engine configuration; no universal residency or privacy guarantee |
| Snapshot and restore | Per canister through Vault; no atomic suite backup or off-site disaster recovery |
| Extensible with an SDK | Working example and contract; compatibility and security tests remain required |
| Optional AI assistance | Explicit credentials/capabilities; no general autonomous IT agent shipped |

Do not claim guaranteed savings, zero operations, unlimited scale, instant global
offboarding, complete SaaS replacement, compliance certification or immunity to
bugs. Keep the food-themed names, but explain the operational function on first use.
