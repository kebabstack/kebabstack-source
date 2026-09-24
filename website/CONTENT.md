# Content evidence and maintenance

Reviewed against the shared suite source `4faa5e5` on 2026-09-22 for website
0.3.2. These are **illustrated workflows from implemented alpha capabilities**,
not production screenshots, customer stories, benchmarks or measured savings.
The sanitized MIT source is publicly available; Marketplace distribution remains upcoming.

## Suite overview

The hero is a simplified navigation map, not a live dashboard. Hub's shared
people, sign-in and permissions correspond to `docs/APP-PERMISSIONS.md` and
`sdk/README.md`. The seven app links lead to their examples below; the extension
link leads to the implemented SDK explanation. It does not claim that every app
exchanges every data type or that a new app is installed. Planned Phone remains
in the labelled app explorer, not among the implemented hero links. The detailed
Desk offboarding case appears only in its own app section.

## The example contract

`src/scenarios.mjs` renders the same cases in German and English. Names are
explicit example names; domains use reserved `example.com` / `.net` names.
There are no employee records, customer contacts, device serials, access tokens,
operational records, or private report requests in the public artifact. The
optional public collection endpoint is supplied at deployment time.

The scenes are simplified editorial compositions in the shared design language,
not pixel-exact replicas of every application screen. Demo controls change only
local scene visibility; they do not deactivate people, create tickets, assign
hardware, publish DNS, pay invoices or contact an integration. Without JavaScript,
all scenes remain readable in order. Phone remains a labelled planned concept.

| Example / claim | Implementation evidence | Boundary preserved in the example |
| --- | --- | --- |
| Hub Operations | `docs/HUB-OPERATIONS.md`, `hub/backend/main.mo` operations snapshots, `tests/operations.test.mjs`, `tests/displays.test.mjs` | Current permitted summaries; 12 internal tickets, 48 inventory devices and 3 contract decisions are separate counts, not a health score. Trust's 2 failing devices are part of 40 enrolled devices, not proof of fleet-wide coverage. Actions belong in source tools. |
| Desk deactivation → review → offboarding | `docs/LIFECYCLE.md`, `desk/backend/main.mo` lifecycle event handling/decision methods, `tests/lifecycle.test.mjs`, `desk/test/person-context.test.mjs` | Hub must learn of a known person's change first. Existing open case reused. Account review is not an automatic departure verdict. IT confirms; cross-app context obeys source permissions. No guaranteed end-to-end timing. |
| Hardware follow-up from Desk | `docs/HARDWARE-OFFBOARDING.md`, `desk/backend/main.mo` hardware close guard, `assets/backend/main.mo`, `tests/hardware-offboarding.test.mjs` | After confirmation and configured approvals, assigned hardware is discovered. 1 of 3 items complete: dock prepared, display still being prepared, notebook sale not handed over. Unavailable sources do not count as done. |
| Assets former-employee sale | `docs/HARDWARE-OFFBOARDING.md`, `assets/README.md`, Assets sale/dealroom and handover code/tests | Outside buyer uses a private transaction link. Company account stays inactive. Paid is not handed over; preparation and physical work remain IT responsibilities. No automatic link email or device wipe claimed. |
| Trust evidence-led triage | `trust/README.md`, device/check frontend, backend osquery result handling and tests | FileVault passing, firewall currently failing, screen-lock result missing. No invented combined score, guaranteed safety, remote remediation or compliance certification. Assignment can come from Assets. |
| Contracts renewal decision | `contracts/README.md`, overview and record views, reminder/price/allocation tests | Decision on 12 Oct precedes recorded 31 Oct cancellation deadline and 1 Dec renewal. 17 of 20 allocated licenses is not observed usage. EUR 400/month is a synthetic recorded price; no currency conversion or promised saving. Actual vendor action is separate. |
| Forms submission review | `forms/README.md`, review pipeline and access tests | 14 example responses: 8 received, 3 in review, 2 accepted, 1 declined. The highlighted workshop is one of the 3 in review. Internal notes stay with authorized reviewers. |
| Watch missing CNAME target | `watch/README.md`, DNS resolver/check code and review guards | Both example resolvers report NXDOMAIN for the target. Cannot accept a missing target as healthy. Fix with DNS provider then recheck. This is not proof of takeover or measured HTTP downtime. |
| Crumbs reporting | `crumbs/README.md`, `crumbs/METRICS.md`, reporting/funnel code, `crumbs/test/`, `tests/crumbs.test.mjs` | Native collection now available, Node/SQLite optional. UTC ranges, visit counts, pageviews, bounce rate and ordered funnel estimates. No claim these are kebabstack.dev traffic, real customers or a Plausible replacement benchmark. |
| Kitchen / Vault | `kitchen/README.md`, `vault/README.md` | Verified updates through Hub after bootstrap. Per-canister snapshots, not atomic suite or off-site backups. |
| SDK / assistant / Bug | `sdk/README.md`, `docs/agent/onboard-app.md`, `kebab-mcp/README.md`, `bug/README.md` | Existing rights for assistant; operator configures providers/data flows. Bug is optional public play with opt-in profiles/leaderboards. |
| Phone companion | Reserved planned product in `design/logos/registry.json`, `docs/MARKETPLACE-ROADMAP.md` | Concept only. Native delivery infrastructure and platform permissions still required; no verified phone-paging claim. |
| MIT, costs, engine dependency | `LICENSE`, `docs/POSITIONING.md`, `docs/MARKETPLACE-ROADMAP.md`, official Cloud Engine guides | Infrastructure, external APIs, operating time and migration cost remain. No zero-operations, validated savings, location or confidentiality guarantee. |

## Analytics fixture arithmetic

The two synthetic week fixtures share one source for charts, totals and labels.
They are plausible reporting examples, not outputs collected from a real site.

| UTC period | Visits | Pageviews | Bounces | Bounce rate | Ordered funnel stages | Completion |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| 14–20 Sep 2026 | 1,200 | 1,920 | 360 | 30% | 540 → 180 → 54 | 10% |
| 07–13 Sep 2026 | 1,000 | 1,500 | 400 | 40% | 450 → 120 → 36 | 8% |

Totals sum the seven daily fixture rows. Bounce rate is bounces / visits;
funnel completion is last / first stage. Each funnel stage counts estimated
visitors reaching that step in order within one session, not visits or a separate
sum to add to traffic. Daily rotating visitor estimates are not unique people
across days. Configuring the page/event steps is required. The samples have no
GeoIP, revenue, arbitrary growth claim, imported-history merge or personal IDs.
Tests keep arithmetic, translations, accessible controls and sample labels aligned.

## Design and publication

`hub/dist/tokens.css` is copied byte-for-byte during build; system dark mode is
derived from its dark declarations. Geometry comes from `design/brand/registry.json`
and `design/logos/registry.json`. No independent palette or logo variants.
Product diagrams have readable text at 320 CSS px, labelled statuses, real links
for navigation and buttons only for working local demo interactions.

Appearance preference is stored locally under `kebabstack-appearance`; it carries
no user identifier and is never sent. The authorized production build uses the
operator’s Crumbs tracker with pageviews, engagement, app-choice and download
events. DNT/GPC and non-production hostnames disable collection. The notice
describes actual collection and configured event retention, including separate
infrastructure/snapshot limits. No analytics cookies, remote fonts, report keys
or form values are added. Do not turn the example into a production-data demo.

Platform sources consulted for the existing deployment and rechecked where used:

- https://skills.internetcomputer.org/.well-known/skills/static-site/SKILL.md
- https://skills.internetcomputer.org/.well-known/skills/deploy-to-cloud-engine/SKILL.md
- https://skills.internetcomputer.org/.well-known/skills/cloud-engine-canisters/SKILL.md
- https://opencloud.org/

Before public source/Marketplace launch, add the actual publisher's required
contact/notices. Do not invent an operator entity or link to an unreleased repo.

## Crumbs 0.6.0 evidence (website 0.4.0)

- Channel and AI classification: `crumbs/backend/lib/Channels.mo`, first-event visit attribution in `lib/Analytics.mo`. Recognized referring services are not AI crawlers; missing referrers remain unknown.
- Scroll goals, source/campaign revenue and saved filters: `crumbs/backend/mixins/Analytics.mo`, `mixins/Business.mo`, `crumbs/dist/business.js`. The demo's channels sum to 1,200/1,000 visits and 54/36 enquiries, matching its two reporting periods. All records are synthetic examples of supported behavior.
- Combined reporting reads only permitted websites, sums website/day estimates and does not identify people across websites.
- Search Console is an on-demand optional Google OAuth integration, not a configured production connection or automated SEO advice. Data Studio is an operator-deployed connector with an expiring read key, not a published marketplace connector.
- No claim of full Plausible/Matomo parity, automatic GDPR exemption, EU-only processing, or unbounded five-year capacity. See `crumbs/PARITY.md` before replacement decisions.

## Search decision guides (website 0.5.0)

`src/guides.mjs` renders three complete bilingual guides, linked from the homepages
and one another. Sovereign IT claims use README.md, docs/POSITIONING.md,
docs/APP-PERMISSIONS.md and docs/OPERATIONS.md. Offboarding uses docs/LIFECYCLE.md,
docs/HARDWARE-OFFBOARDING.md and their existing integration tests. Analytics uses
crumbs/METRICS.md, PRIVACY.md, PARITY.md and the 0.6.0 verification record above.
No search volumes, customer outcomes, replacement equivalence or legal guarantees
are asserted. Public source is available; Marketplace distribution remains upcoming. SEARCH.md records
crawler policy, primary documentation and the separate operator account steps.

## OpenTeam connector (website 0.5.2)

The Hub feature list and bilingual FAQ use `docs/OPENTEAM.md`,
`hub/backend/OpenTeam.mo` and `tests/openteam.test.mjs`. Hub 0.35.0 implements
an optional read-only directory source with reviewed initial import, bounded
five-minute polling, stable member identities and the existing lifecycle path.
The local synthetic provider tests the reviewed OpenTeam 2.35.0 directory contract;
it is not an end-to-end customer pilot or OpenSaaS-wide certification. Shared
OpenSaaS login, upstream roles, groups and write-back are not claimed. Product
examples remain synthetic; no company is connected by publishing this page.
