# Changelog — kebab-stack trust

## [0.9.1] — 2026-09-22

- Keep shared global navigation visible while workspace content scrolls by pinning the mount host. Preserve normal-flow spacing and add scroll clearance for anchors and keyboard focus. No authorization, directory or data-model changes.

## [0.9.0] — 2026-09-22

- Adopt the shared brand palette, typography, navigation and form controls across device posture, checks, deployment guidance and settings. Device data, enrollment and permissions are unchanged.

## [0.8.2] — 2026-09-22

- Use the canonical kebabstack.dev line logo in application branding, navigation assets and release catalogue. Product-logo rules and generated assets live in `design/logos`; company branding stays separate.
- Synchronize the shared browser client. Existing business data, sign-in and access contracts are unchanged.

## [0.8.1] — 2026-09-21

- Session checks and Hub ticket redemption show a compact progress screen instead of presenting the company sign-in form again. Retry controls appear only when sign-in needs attention.
- Use the corrected shared JSON sanitizer: large external responses no longer build a deeply nested text value, and escaped backslash literals remain unchanged.

## [0.8.0] — 2026-09-18

- Added the Hub-only Operations summary, limited to an active centrally assigned app admin and a fresh directory. It returns numeric counts without personal records, free text or credentials. Existing data and role assignments are preserved.
- Separates fully current assessment coverage from the average verified score. Missing, stale and error evidence stays unverified; demo devices are excluded.

## [0.7.2] — 2026-09-18

- The configured Trust address is now the canonical browser origin. Old links
  redirect before session use, preserving known routes and public device handles
  while discarding query strings, Hub tickets and legacy agent-key links. Direct
  sign-in and Hub launches use the same registered custom domain.

## [0.7.1] — 2026-09-18

- Routed the installer health check and retired legacy feeds through the HTTP
  gateway's verified update path. Normal certified domains now serve these
  responses instead of rejecting unsigned query bodies with HTTP 503; installers
  need no raw-domain bypass. Existing agents, records and removal attestations
  remain unchanged.

## [0.7.0] — 2026-09-18

- Reworked device deployment around the company's MDM: Add devices now provides
  hash-pinned installers for macOS, Linux and Windows, a macOS background-item
  profile, an explicitly optional quiet-notifications profile, a legacy migration
  script and local preflight/audit/removal scripts. The flow explains the Iru
  order and requires a pilot verification before fleet rollout.
- Removed the hidden public version/decommission feeds and the self-updater. Iru
  owns install, update and removal; Trust records a pending removal and an
  operator-supplied audit reference instead of claiming an offline agent was
  removed. Unknown/shared osquery services are left untouched.
- Installers use private staging, checksums, publisher verification where
  available, ownership markers, locks, service health checks and platform-scoped
  paths. macOS notification suppression is never enabled implicitly.

## [0.6.0] — 2026-09-18

- Redesigned the workspace around Devices, Checks, Investigate, Settings and Guide, using the warm paper/green design of Assets and Desk. Setup is a contextual Add devices action. Outstanding checks and next steps come first; passing checks, SQL, device facts and maintenance details are disclosed on demand. Responsive light/dark layouts retain the shared Hub sign-in and topbar.
- Device assessments now include every active check for the OS. Missing, failed-query and older-than-24-hour evidence cannot produce a verified passing status. Results have individual timestamps; updating/re-enabling a check invalidates old observations and versioned query IDs reject delayed answers to earlier definitions. Nonzero osquery statuses, including status-only errors, do not pass empty-result rules. Previously stored results remain unverified until fresh reports arrive.
- Browser device identifiers and new notification/query-result links no longer expose agent authentication keys. A stable public handle is mapped to each existing device. Existing agent keys, state and authorized legacy links continue working; this release does not rotate previously disclosed keys or erase old browser history/notifications.
- Investigations can target an operating system as well as a single device or the fleet; samples are excluded. AI drafts preserve newer manual edits. Late requests cannot repaint private results after navigation, sign-out or a central role change. Duplicate submissions are blocked and zero-target investigations finish with a useful next step.
- Settings use deliberate saves. Agent tuning no longer autosaves to the fleet; refresh actions preserve unrelated drafts. Check presets modify a draft selection before saving. Fleet viewers remain read-only and employees see their own devices; roles remain exclusively in Hub. Trust removal leaves Assets custody unchanged.
- Updated the in-app guide, installation workflow and limitations. Added role-based UI regressions and local canister tests for freshness, errors, public device handles, scoped access/queries and populated upgrades from 0.5.0. Hub/Lunch integration code and shared SDK sources are unchanged.

## [0.5.0] — 2026-09-17

- Added Hub-brokered support summaries for a person’s devices and check status, preserving fleet/own-device permissions. Device authentication keys and raw telemetry are excluded.

## [0.4.1] — 2026-09-17

- Shared company sign-in screen and progress states match the Hub across all six tools. Session checks and ticket redemption lock the continue button; failures allow an explicit retry.
- New ticket attempts clear any previous local session before redemption, so a rejected ticket cannot reopen a different account’s old session. Deep links and public access routes are preserved.

## [0.4.0] — 2026-09-17

- App roles now come exclusively from Hub permissions. Removed local admin claims, email lists and role-group settings; deprecated mutation APIs refuse changes. Active Hub owners/admins and Hub-assigned app admins have full app access. Employees keep their own and explicitly shared content; Watch requires an explicit viewer/admin assignment by default. The existing 60-second directory lease bounds revocation.
- Configure the central policy in Hub before upgrading this app; an absent or incompatible policy denies sign-in. Historical local role settings are retained only for migration inspection.

## [0.3.0] — 2026-09-06

Security fixes from the full audit (`KEBABSTACK-AUDIT-2026-09-06.md`).

### Fixed — security
- **Re-enrolment hands out a device's existing node key only when the hardware UUID matches.** The enrol secret sits on every device, so a serial number alone could fetch a colleague's key and take over their device record (posture, pending questions) (TR-01). A second device claiming a known serial with a different UUID becomes its own node.
- **Fleet caps:** at most 5 000 devices and 300 new enrolments an hour; host identifiers are capped at 64 characters (TR-02).
- **Sample devices refuse writes:** their guessable `demo-…` keys no longer accept check-ins, posture or query results (TR-05).
- **Only defined checks are recorded:** an agent reporting `cis:<anything>` can no longer grow a device's posture list without bound (TR-03).
- Windows keeps the enrolment secret readable by SYSTEM and Administrators only (TR-09).

### Fixed — bugs
- **Windows agents can enrol:** the flags file pointed at the Unix secret path (`/etc/osquery/enroll.secret`) on every platform, so a Windows install never found its secret (TR-08).
- `hub_upsert` uses the SDK's `upsertRows` (SDK 0.4): a re-issued address ends the previous holder's sessions.

## [0.2.0] — 2026-09-06

### Changed
- **Owners are ids.** Device owners — from Assets (`trust_serialOwners`, which sends person ids from assets 0.6.0; addresses from older versions are converted on arrival) and set by hand — are stored as the hub's stable person id (hub ≥ 0.17, SDK 0.3). "My devices" and check notifications follow the person through a rename; a re-issued address never inherits someone else's devices. `DeviceView.ownerEmail` carries the current address, `whoami` carries `id`.
- **One-time migration** right after this upgrade converts stored owner addresses via the hub; unknown addresses become `legacy:<address>`. Setting an owner by hand answers "people ids are being migrated — try again in a minute" for the few seconds it takes. Requires hub 0.17 first; update Assets to 0.6.0 in the same session.

## [0.1.0] — 2026-09-06

### Added
- First release of **trust**, ported into the stack from a working prototype (real macOS agents had proven the osquery TLS lane against a canister): enrolment with a shared secret and pre-configured installers (macOS · Linux · Windows alpha), the check engine (built-in CIS-derived catalogue for macOS/Windows/Linux, custom checks, rule grammar, per-OS seeding through the fast distributed lane), fleet and device pages with scores, live device facts, questions to the fleet or one device, device removal with agent self-uninstall, agent version following osquery's latest stable or pinned, live agent tuning.
- Built on `mo:kebab-hub` like the other apps: hub ticket sign-in, 60-second complete-directory lease with 30-second pulls, roles from the hub (owner/admin run it, helpdesk reads the fleet, members see their own devices), `claimAdmin` for hub owners/admins, the shared topbar, hub notifications to the device's person when a check starts failing (one message per device per batch, deduplicated by the hub), AI via the hub's key (lane `ai`) — no key stored here.
- Device owners from the **assets** app (`trust_serialOwners`, assets 0.5.0) with a manual fallback per device; a sample fleet for the first look.
