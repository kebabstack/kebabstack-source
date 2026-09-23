# kebab-stack Watch

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

Watch helps an IT team review DNS changes, domain expiry and domain-security findings in one workspace. It runs on a Cloud Engine such as OpenCloud and uses the company's Hub for sign-in, permissions and notifications.

## Daily workflow

1. **Domains** shows one row per domain, ordered by attention needed. Search names/notes or filter to attention, expiry or paused monitoring. Each domain contributes once to a filter count, even if several checks need attention.
2. **Open a domain** to see the next step. Unexpected DNS answers expand for review; unchanged records stay collapsed. Accept an intended change, or fix DNS with your provider and run another check. A missing name, broken CNAME target, failed check or unresolved resolver disagreement cannot be accepted as healthy.
3. **Activity** keeps changes, decisions and failures. Consecutive identical failures are grouped for reading; underlying evidence remains intact. **Reports** offers monthly reports, a factual monitoring summary and an admin-only CSV export. Creating a report manually also notifies admins, which is stated before submission.
4. **Settings** has one draft and one Save changes action. Custom intervals and warning thresholds remain intact. Failed saves preserve the draft. Role administration belongs in Hub → Permissions.

A failed check describes a gap in Watch's evidence; it does not establish a website outage. The workspace shows overdue checks and retains the last successful certificate evidence with its timestamp.

## What is monitored

- **DNS:** selected A, AAAA, CNAME, MX, TXT, NS and CAA records, every 5–120 minutes through Cloudflare and Google DNS-over-HTTPS. Cosmetic differences are normalized. A/AAAA keep a known-address set; other types use an exact accepted answer set.
- **Address changes:** addresses can be learned during the first 48 hours or for explicitly trusted hosting operators. New addresses at the same known operator are learned with an alert asking the operator to review them. Other unfamiliar addresses require acceptance.
- **Broken CNAME targets:** a missing target is flagged for DNS repair. Recovery retains a reviewable change if the restored target differs from the accepted baseline.
- **Registry expiry:** daily RDAP checks, with configurable warning lead time and additional 14/7/1-day thresholds.
- **Security checks:** daily DNSSEC indicators, registrar lock, mail policy (DMARC, SPF, MTA-STS) and certificate-issuer restrictions (CAA).
- **Certificate transparency:** public-log issuer/name discoveries and the newest logged certificate's end date. Failed checks retain old evidence, space retries by three hours across upgrades, and record recovery.
- **Similar names:** selected misspellings and other endings, checked weekly for apex domains. Ignoring a name stops further checks of that name.

## Access

Active Hub owners/global admins and per-app Watch Admins can manage all monitoring. Explicitly assigned **Viewers** can read all domains, activity and reports, but cannot mutate settings, acknowledge changes, trigger checks or export evidence. Other employees have **No access** by default; Watch has no private employee workspace. Configure access only in [Hub → Permissions](../docs/APP-PERMISSIONS.md).

Notifications use the Hub bell and recipient Slack preferences. Per-domain watchers supplement optional administrator notifications. Lunch and other directory integrations are unaffected by Watch's workspace changes.

## What this helps the company decide

Watch provides a review queue and evidence of monitoring work. An IT owner can see domains requiring action; management can review historical reports and completed checks. It does not replace registrar administration, domain renewal or incident response. Coverage, check failures and data age must be considered alongside the findings; no availability or compliance guarantee is implied.

## Limits and data handling

There are no HTTP uptime probes or direct inspections of a website's served TLS certificate. Certificate-log dates describe issued certificates only. DNSSEC uses resolver validation flags, not independent local verification. Registry data and lookalike coverage can be incomplete. Public HTTPS lookups disclose monitored names and IP addresses to DNS resolvers, RDAP services and crt.sh; these may reveal internal project information. Removing a watched domain stops monitoring but retains historical events for evidence.

Install and update through **Hub → Apps** using a tested release. See [installation and custom domains](INSTALL.md), [release notes](CHANGELOG.md) and the in-app **How Watch works** guide.

## Connected workflows

Desk can show permission-checked summaries of related employee records. See [employee context and directory follow-up](../docs/LIFECYCLE.md). Watch also contributes Admin-authorized aggregate summaries to [Hub → Operations](../docs/HUB-OPERATIONS.md); its existing metric definitions are unchanged by the workspace filters.
