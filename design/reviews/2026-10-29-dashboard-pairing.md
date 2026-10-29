# Shared dashboard profile pairing

- Standard: current integrated Brand & Product System.
- Module: Hub 0.45.0; Website 0.5.12.
- Scope: Owner profile creation, six-digit enrollment, independent read-only device capabilities, reconnect and revocation.
- Review: 2026-10-29, scoped verification; not full accessibility certification.

## Evidence

- Real Chrome local preview: created a sample profile with leading-zero six-digit PIN, selected Assets and Until revoked. Enrolled a second tab; reloading retained Screen 2 and current sample totals without PIN entry.
- Actual viewport 1599 × 1143. Profile form, duration, source selection, profile and individual screen actions rendered without overlap. PageDown scrolled 446.5 px; header stayed at top 0.
- Requested 1280/320 viewport overrides were ineffective in the browser provider (measured width remained 1599). Narrow/short sizes, 200% text, Safari/iOS and screen reader remain unverified; no false responsive pass.
- Automated UI tests cover invalid input, stored credential recreation, offline recovery, temporary authorization suspension, revocation, stale data and explicitly selected sharing scopes.
- Backend regressions cover two independent keys from one PIN, idempotent enrollment, stop/start, durable guessing lock, expiry, owner permission loss, individual/group revocation and populated upgrades. Release evidence records actual packaged results separately.
- No production scope widened automatically. Existing grants retain duration and scope. PIN is enrollment-only, hash stored server-side, never stored on the TV or placed in URLs. Five failed attempts globally lock enrollment until an Owner resets; existing device access continues. This intentionally favors confidentiality over new-enrollment availability.
- A real macOS update/reboot was not performed; no claim that the user's exact disconnect cause was reproduced.

## Delivery

Private release evidence contains screenshots, test logs, exact artifact hashes and deployment receipts. Public documentation describes six-digit profiles and until-revoked approval; earlier expiring grants remain unchanged. Browser storage deletion/private browsing still requires enrollment. No claim of zero operations.
