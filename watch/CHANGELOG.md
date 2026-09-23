# Changelog — kebab-stack watch

## [0.10.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes.

## [0.10.0] — 2026-09-22

- Adopt shared visual tokens, action/field sizes and navigation. Remove conflicting local dark-mode accents; preserve evidence, freshness and read-only/admin access.

## [0.9.1] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.9.0] — 2026-09-21

- Redesigned the Watch workspace in the suite's shared visual language: searchable domain rows, distinct attention/expiry/paused filters, clear next steps and mobile layouts.
- Moved event history to Activity, grouped consecutive identical failures without removing evidence, and simplified reports and the operator guide.
- Added compact check evidence to domain queries so certificate failures and stale DNS/security evidence remain visible in the overview. Counts deduplicate affected domains and exclude paused monitoring from active alerts.
- Collapsed unchanged DNS records, removed blind bulk acceptance from the UI and separated DNS repair from accepting expected changes. Partial resolver failures retain last-known evidence and cannot establish a new baseline. Missing names/broken targets cannot be marked healthy by accepting or trimming a baseline. Paused, removed and deselected record sets reject baseline changes.
- Kept unexpected CNAME changes reviewable after target recovery and prevented repeated NXDOMAIN answers from appearing healthy.
- Replaced the three competing settings saves with one draft, save and discard flow; preserve custom interval values and failed-save drafts. Clear obsolete domain controls and ignore late navigation responses.
- Prepared canonical custom-domain sign-in with public-route-only redirects; authentication fragments and query strings never cross origins. Domain ownership, registration and company URLs remain deployment configuration.
- Preserved central Hub permissions, monitoring records and certificate retry behavior. Updated installation/release guidance and added frontend, authorization, DNS-integrity and populated-upgrade regressions.

## [0.8.1] — 2026-09-21

- Session checks and Hub ticket redemption show a compact progress screen instead of presenting the company sign-in form again. Retry controls appear only when sign-in needs attention.
- Use the corrected shared JSON sanitizer: large external responses no longer build a deeply nested text value, and escaped backslash literals remain unchanged.
- Certificate failures retain the last successful evidence and wait three hours before retrying, including across upgrades. Identical errors are not repeated in the event feed; recovery is recorded.
- Reject non-array or excessively nested certificate JSON. Late replies to removed/paused domains are discarded. Public-log expiry is labelled as logged evidence rather than the live server certificate.

## [0.8.0] — 2026-09-18

- Added the Hub-only Operations summary, limited to an active centrally assigned app admin and a fresh directory. It returns numeric counts without personal records, free text or credentials. Existing data and role assignments are preserved.
- Separates enabled-domain alerts, late/error checks and missing/stale expiry evidence. Paused domains do not contribute.

## [0.7.0] — 2026-09-17

- Added Hub-brokered support summaries for domains a person created or watches, preserving centrally assigned access. Notes and DNS details are excluded.

## [0.6.1] — 2026-09-17

- Shared company sign-in screen and progress states match the Hub across all six tools. Session checks and ticket redemption lock the continue button; failures allow an explicit retry.
- New ticket attempts clear any previous local session before redemption, so a rejected ticket cannot reopen a different account’s old session. Deep links and public access routes are preserved.

## [0.6.0] — 2026-09-17

- App roles now come exclusively from Hub permissions. Removed local admin claims, email lists and role-group settings; deprecated mutation APIs refuse changes. Active Hub owners/admins and Hub-assigned app admins have full app access. Employees keep their own and explicitly shared content; Watch requires an explicit viewer/admin assignment by default. The existing 60-second directory lease bounds revocation.
- Configure the central policy in Hub before upgrading this app; an absent or incompatible policy denies sign-in. Historical local role settings are retained only for migration inspection.

## [0.5.1] — 2026-09-06

### Fixed
- **A new address at the same operator is learned but announced.** Before, any new A/AAAA value whose RDAP owner matched the known addresses (the same cloud provider — which also hosts whoever might take the name over) was added silently; now admins and watchers get one notification and an alert event, while the set still grows so Geo-DNS stays quiet after that (audit WA-01). Trusted operators and the first 48 hours stay silent as before.
- Every answer from the resolvers, RDAP and crt.sh passes the SDK's surrogate guard before parsing — an emoji in a TXT record or a registrant name no longer traps the check every 15 minutes (WA-02).
- `hub_upsert` uses the SDK's `upsertRows` (SDK 0.4).

## [0.5.0] — 2026-09-06

### Changed
- **People are ids.** Watchers, who added a domain and who accepted a change now store the hub's stable person id (`p_…`) instead of the address (hub ≥ 0.17, SDK 0.3); alerts follow a watcher through a rename and never reach the address's next holder. Events and runs arrive display-resolved (names), `DomainDetail.watcherEmails` feeds the watcher editor, `whoami` carries `id`. Pickers keep speaking addresses.
- **One-time migration** right after this upgrade converts stored addresses via the hub; unknown ones become `legacy:<address>`. Domain edits answer "people ids are being migrated — try again in a minute" for the few seconds it takes; checks and alerts run as usual. Requires hub 0.17 first.

## [0.4.0] — 2026-09-05

- Correct setup/offboarding help and privacy statements; clarify what monitoring requests disclose.

- Enforce a complete-directory authorization lease below 60 seconds with 30-second refresh and fail-closed outage behavior.
- Revoke absent/inactive people, discard stale directory replies and recheck sign-in after external calls; clear old Hub sessions on reconfiguration.
- Require Hub owner/admin authority for app bootstrap; update installation guidance and portable SDK lock resolution.

## [0.3.1] — 2026-09-04

### Changed
- **The shared topbar.** watch no longer has a header of its own: it mounts the suite's `mountTopbar` from `hub-client.js` — brand (company logo from the hub), app name, Menu ▾ (your apps), the bell (the same inbox as on the hub's menu, unread count every 30 s), theme, person ▾. `loginWithTicket` passes the hub's `suiteToken` through for it. Same top in every app, so switching never changes it.

## [0.3.0] — 2026-09-04

### Added
- **Who runs the new address?** A new A/AAAA address is looked up at the address registry (RDAP netblock owner). Same operator as the known addresses, a **trusted operator** (Settings) or a domain in its **first 48 hours** → learned quietly (event "learned"), otherwise an alert that names the operator. Operators are shown next to every known address.
- **Posture**, once a day per domain: DNSSEC (resolvers' validation flag), registrar lock (RDAP status), e-mail protection (DMARC policy, SPF, MTA-STS), CAA. Five plain sentences on the domain page, one "posture" pill on the board when it is weak; any **weakening is an alert**, improvements are recorded.
- **Certificates** from the public logs (crt.sh), once a day: issuers seen, other names seen under the domain (offered for watching — forgotten subdomains surface here), end date of the newest certificate covering the name with warnings at 14/7/3/1 days. A **new issuer is an alert**.
- **Lookalike names**, once a week per apex: up to 30 misspellings and other endings checked at the registries; registered ones listed (hideable), a **newly registered one is an alert**.
- **Monthly report**: on the first day of a month a plain-language report for the previous month is written (alerts, decisions, learned addresses, problems, posture, certificates, lookalikes, expiry), admins are notified, reports are listed on the Evidence page; admins can write one for the current month so far.
- Evidence CSV gains posture and report rows; the statement mentions posture, certificates, lookalikes and reports.

### Fixed
- Expiry warnings now fire at the *smallest* threshold reached (a domain first seen with 5 days left warned once at the 30-day level and then never again).


## [0.2.0] — 2026-09-04

### Changed
- **A and AAAA are a set of known addresses**, not an exact answer: load-balanced and geo-routed domains answer with different addresses per resolver and rotate them, which made every such domain flap between "changed" and "resolvers disagree". Now only an address never seen before — on both resolvers — is a change; accepting adds it to the known set; "Trim known to served" forgets old ones. The baseline is the union of both resolvers. Every other type keeps exact matching.
- Every alert writes an event with the hub's answer per recipient ("alert to 2 of 2", or "hub refused: …"), so a silent alert path is visible in the history instead of guessed at.


## [0.1.1] — 2026-09-04

### Added
- **Send a test alert** (Settings): one notification to every recipient through the hub, with the hub's answer per person — proves the alert chain without touching a DNS record. The overview says so when there was nothing to alert yet.


## [0.1.0] — 2026-09-04

### Added
- First release: domains with watched record types (A, AAAA, CNAME, MX, TXT, NS, CAA), two-resolver DNS-over-HTTPS checks every 15 minutes, baseline → change → accept, resolver-disagreement damping, dangling-CNAME detection, RDAP expiry with 30/14/7/1-day warnings, alerts through the hub to admins and per-domain watchers, run log, evidence statement and CSV export, settings (interval, expiry threshold, admins), member read-only view.
