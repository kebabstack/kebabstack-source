# Kebabstack

**An open-source IT suite for startups and SMEs, running on a Cloud Engine.**

kebab-stack brings people, sign-in, service requests, device inventory and domain
monitoring into one suite. The Hub supplies the directory and access rules; apps
share its sign-in and navigation. Kitchen installs and updates the modules, and
Vault takes and restores canister snapshots.

Hub **Permissions** centrally defines roles for Assets, Contracts, Desk, Forms,
Trust, Watch and Crumbs. Global Hub owners/admins inherit app administration; employees
receive their own and explicitly shared content. See the [permission model and
upgrade sequence](docs/APP-PERMISSIONS.md) before rolling out these releases.

**Status: public alpha source.** This is a working codebase, not a
feature-equivalent replacement for every IAM, ITSM or endpoint-management product.
Start with a disposable pilot. Read the [known limits](docs/GAPS.md) and
[operator guide](docs/OPERATIONS.md) before deciding what to run here.

The [staged product and marketplace roadmap](docs/MARKETPLACE-ROADMAP.md) tracks
Hub Operations, connected workflows and the acceptance gates for a sanitized
public distribution. Planned functionality is separate from the implemented
modules listed below.

## Why consider it?

There are no kebab-stack per-seat licence fees or paid security tiers: the code
is MIT licensed. A shared directory and sign-in can reduce duplicate integration
work. Motoko stores application state with the backend, so these modules do not
need a separately operated application SQL database or Kubernetes cluster. Crumbs supports native canister collection; an optional Node collector adds a local SQLite delivery queue.

You still pay for Cloud Engine infrastructure, external services such as AI, and
people's time to configure, maintain and support the suite. Savings depend on the
subscriptions you can actually retire and the workload you measure. We have no
validated monthly cost or capacity benchmark yet. [Decision guide and cost model](docs/POSITIONING.md)
· [Entscheidungshilfe auf Deutsch](docs/DECISION.de.md).

Sovereignty here means access to the source and control of your application
canisters and engine configuration. It does not automatically mean confidentiality
from node operators, a particular country, or independence from ICP. Review the
chosen operators, jurisdictions, controllers and external data flows.

## What exists

| Module | Role | Status |
|---|---|---|
| [Hub](docs/INSTALL.md) | Directory, passkey/SSO sign-in (several providers), groups, access policies, SCIM input from several sources, Okta pull, notifications; OIDC provider for external software | alpha |
| [Desk](desk/README.md) | Internal and customer support, connected offboarding, project workflows, on-call schedules, incident response, service status and scoped HR/Finance reports | alpha |
| [Assets](assets/README.md) | Device inventory, MDM/Apple imports, assignment history and hardware sales; employee offers and external magic-link dealrooms with invoices | alpha |
| [Watch](watch/README.md) | DNS/domain monitoring, posture and expiry evidence; optional notifications | alpha |
| [Crumbs](crumbs/README.md) | Cookieless analytics, AI/campaign sources, scroll goals, revenue, multi-site reports and optional guided Google integrations; native collection with optional Node ingress | alpha pilot |
| [Vault](vault/README.md) | Per-canister snapshots, schedules and restore | alpha |
| [Kitchen](kitchen/README.md) | Verified releases in Hub → Apps | alpha |
| [SDK](sdk/README.md) | Motoko and browser contracts for another app | alpha |
| [Forms](forms/README.md) | Form builder with anonymous public links; review pipeline (received → in review → accepted/declined) with ratings, assignees, notes, insights and CSV; sharing, import, 90-day trash | alpha |
| [Trust](trust/README.md) | Device posture from a read-only osquery agent: enrolment, checks and scores, per-person view, plain-language questions; owners from Assets | alpha |
| [Bug](bug/README.md) | Ship the Bug — 2D/3D switch, shared profiles, public play, optional Hub sign-in and separate opt-in leaderboards | alpha |
| [Contracts](contracts/README.md) | Upload → AI review → SaaS overview; owners, seats, renewals, scoped license keys and 90-day reminders; USD/CHF/EUR costs and management reports without currency conversion; email relay configured separately | alpha |
| [kebab-mcp](kebab-mcp/README.md) | Your apps from your AI assistant: an MCP server that signs into every app as the person through the hub (one-time code → personal token, live Candid, curated tools) | alpha |

Hub, Desk, Assets, Watch, Crumbs, Trust, Forms, Bug, Contracts and Kitchen each have a backend and a static frontend
canister. Vault has one backend and is operated through the Hub. A snapshot is
per canister, not an atomic backup of the whole suite.

## Identity and access in plain terms

A person is a directory entry; a passkey login is linked to that person with an
invitation. An app receives only the directory and capabilities granted to it.
Revoking access in the Hub triggers a push; bundled apps also refresh their
complete directory every 30 seconds and refuse access once its age reaches 60
seconds. A Hub outage therefore interrupts app access. Upstream IdP changes only
start this window **after the Hub has learned of them**. External OIDC clients
have their own token/session expiry; outbound SCIM deprovisioning is not shipped.

## Start here

1. [Install](docs/INSTALL.md): prepare the engine and controller identity, deploy
   Kitchen, generate a one-time setup code, then finish setup in the browser.
2. [Operate and recover](docs/OPERATIONS.md): controller recovery, offboarding,
   upgrades, snapshots, rollback and external services.
3. [Build an app](docs/agent/onboard-app.md) using the SDK.
4. [Connect an AI assistant](kebab-mcp/README.md): the hub's assistant lane and the
   `kebab-mcp` server — a chat assistant acts as the person, with the person's rights.
5. [Contribute and verify](CONTRIBUTING.md): pinned tools, tests, version rules and
   release checks. Every module has its own version and changelog.

The complete suite is published at [kebabstack/kebabstack-source](https://github.com/kebabstack/kebabstack-source). This distribution starts with a reviewed snapshot and a new Git history; customer records, secrets, deployment receipts and private configuration are excluded. The repository and served `/sdk/` documentation are maintained together. See [what is included and how to review it](docs/SOURCE-RELEASE.md). Marketplace listing and operational qualification remain separate milestones.

## Licence

Kebabstack code is [MIT licensed](LICENSE). Bundled upstream code and credited imagery retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

Hardware coordination across Hub, Desk and Assets is described in the [offboarding operator guide](docs/HARDWARE-OFFBOARDING.md): discover assigned equipment, plan its disposition and verify the result without duplicate updates.

## Cross-app Operations

Hub → Operations combines current Desk, Trust, Assets, Contracts and Watch summaries with a focused next-action panel. Administration remains in the source tools and permissions in Hub. The signed-in work view and separately paired TV screens are implemented; retained trends follow. See [coverage and limits](docs/HUB-OPERATIONS.md).

Scoped on-call HR/Finance reporting is available as an **alpha** in Desk. See [the service reporting workflow and pilot limits](desk/REPORTING.md). Hourly statements and CSV exports do not automate payroll payment or country-specific compensation law.

## Product logos

[Logo library and design rules](design/logos/README.md) define the permanent Kebabstack product marks approved from kebabstack.dev. Use `design/logos/registry.json`; never invent a separate app logo, emoji or coloured tile. Run `npm run brand:sync` and `npm run brand:check` when changing a mark or adding a tool. Keep the website, app favicon/header, Hub menu, Kitchen recipe and Cloud Engine console aligned. Company and external-app branding remain separate.

## Product design standard

The [Brand & Product System](design/README.md) is the shared design and UX authority.
Before changing a user-facing flow or adding a tool, read its relevant rules in
[the complete standard](design/STANDARD.md), reuse the canonical logos/shared
foundations, and use [the review template](design/REVIEW-TEMPLATE.md). The standard
covers behavior, permissions, SSO, states, automation, privacy and accessibility
as well as appearance. Existing apps are migrated through the
[adoption plan](design/ADOPTION.md); the target tokens do not silently replace
`hub/dist/tokens.css`. Run `npm run design:build` and `npm run design:check` for
standard changes. Keep source, generated docs, versions and changelogs aligned.
