# Install and operate Doku

Requires the integrated Kebabstack foundation and Hub 0.44.0. Desk-based
proposals additionally require Desk 0.37.0; manual creation and external reading
do not require Desk access.
Use pinned moc 1.12.0, core 2.6.1 and repository Mops 3.2.0. New app state uses
ordinary persistent initializers; existing modules retain their committed state
contract. This release does not migrate the compiler or existing application data.

## Build and install

Run root `npm ci`, then `npm ci --ignore-scripts` and `npm run build` in
`knowledge`. Install pinned Motoko dependencies, run `mops check --fix` and
`mops build`. Generate Candid/browser IDL with `tools/sync-bindings.py knowledge`.
The initial stable baseline is compiler-generated for this first installation.
Future upgrades must check the committed baseline before replacing it.

Build a clean format-2 package using `kitchen/tools/pack-recipes.py --build`.
Publish and deploy the identical artifact through the shared executor as
specified in [Kitchen's operator guide](../kitchen/INSTALL.md): update Hub and
Desk, verify its running version is at least 0.37.0, then `release.mjs install --app knowledge`. The current installer validates Hub/Kitchen dependencies only; the Desk prerequisite is an explicit operator check. The recipe configures `setHub`,
patches deployment placeholders in the package and creates the connected app.
Never commit deployment IDs or directly restamp/deploy a different Wasm.

## Permissions and first use

In Hub → Permissions choose Doku and save its policy. Default is **No access**;
active Hub owners/admins inherit Admin. Assign Reader for published documentation,
Author for draft creation/editing and Reviewer for review/publication. Opening a
Desk-based proposal also requires current Agent/Admin access to its source Desk.
Use **Check app enforcement** before first protected sign-in. Shared sign-in and
30-second directory pulls use the existing 60-second maximum directory lease.
A Hub outage can therefore interrupt Doku access.

Start in Doku → Create article, or from a resolved **internal** Desk request → Documentation. Review and
confirm a reusable solution, then open Doku. The first release has one internal
library; all granted readers can see all published articles and version history.
There are no separately restricted internal spaces. Reviewers/admins may share a
specific published version externally; all documents are internal until a link is
explicitly created. Treat external sharing as a separate audience decision.

For an existing app, `setHub` cannot rebind stored content to a different company.
Take backend/frontend snapshots with Vault. Restoring is an operator decision:
backend rollback may discard newer work. Keep exact release receipts privately.
No production business records should be created merely to exercise a test.

## Limits and diagnostics

A stale source or version gives an explicit error. Create a fresh proposal rather
than overwriting another person's work. Unavailable Desk evidence blocks opening
and publishing a Desk-sourced draft. Manual drafts remain independent. Published documents remain independent of the ticket.
A discarded draft remains retained for audit; no automatic retention/deletion is
implemented. Review storage and pilot limits in the README.

AI configuration and Slack setup are not required for this milestone. Those
integrations are planned and must not be advertised as active.

## External links and password handling

The backend exposes two intentionally anonymous capability methods: `sharedInfo`
returns only salt/expiry/KDF parameters; `readShared` returns only the selected
published version after validation. Both use consensus update calls and check
server time and revocation. (Link management is never anonymous.) No anonymous
library/history endpoint exists. `shareLinks`, `createShare` and `revokeShare`
require a current Reviewer/Admin session under the same Hub directory lease.

A secret random seed, a domain-separated derivation and monotonic link ID produce
a 128-bit code. Lookup stores a SHA-256 digest; the private management API can
reconstruct the code for copying. Passwords never leave the browser: Web Crypto
PBKDF2-HMAC-SHA256 with 600,000 iterations and a fresh 16-byte salt derives a
32-byte bearer proof; SHA-256 of that proof is persisted. The proof is sent over
TLS on unlock and kept only for that request, with no browser storage. A captured
proof still grants the same link access, so this is not a password-authenticated
key exchange or end-to-end encryption. Browser minimum length is a usability
policy; authorized custom clients may deliberately choose weaker passwords or
no password, just as reviewers can choose an unprotected link.

Ten failed unlocks per link in a rolling one-minute bucket trigger a temporary
lockout. This bound is shared by all visitors to that link; a malicious holder can
briefly block other visitors. Wait a minute, or revoke and issue a new link.
Unknown random link probes create no stored rate-limit records. Sharing state is
bounded to 100 retained links per article / 10,000 total; revoked/expired links
are retained for audit and count toward those pilot limits. No reader analytics,
IP logging, single-use links or named-recipient access is implemented. Monitor
storage/cycles and review links periodically. Do not promise instantaneous
revocation of already delivered content.

The password cost follows [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
and unpredictable scoped links, rate limiting and no-referrer follow
[OWASP token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
A future custom short domain is a separate operator configuration; this release
uses the existing app address and a compact fragment route.
