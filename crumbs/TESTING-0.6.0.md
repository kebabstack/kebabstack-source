# Crumbs 0.6.0 candidate verification — 2026-09-23

Source branch: `codex/crumbs-business`, based on `55fae1811549a11177508d22db9154b12169436a`.
This is local verification, not production capacity, Google account acceptance or a deployed release.

## Technical evidence

- Pinned npm dependencies and Mops lock installed; Motoko 1.12.0/core 2.6.1 preserved. `mops check --fix`, Mops build and actual `icp build` succeeded.
- Candidate checked with `moc --stable-compatible` against the previous committed `crumbs/backend/backend.most` before promoting the new baseline. Previous stable hash: `09585f7fbca3ae4a659342c0b7244eaace3fdeefe2ad9edc1fe4f908ff930b3c`; candidate: `1e317154b04147018ec856c34a27bd615cca50b7c52935e7975d2b8de6e935fc`.
- 19 real PocketIC scenarios passed against the ICP recipe's executable (`CRUMBS_PACKAGED_CRUMBS_WASM`), including populated 0.5.1 upgrades preserving events, keys, site grants and existing goals, and repeat upgrades preserving saved filters/SEO snapshots. The optional 0.1.0 legacy-baseline test was not rerun because its binary was not provided; it is explicitly skipped.
- Authorization: owner/admin, named site read/manage, other-site denial, stale Hub lease, issuer demotion, revoked shares, signed collector boundaries, atomic validation, throttling, retention and real HTTP gateway/update path. New goal results and REST scope checked with success and negative cases.
- 19 tracker/collector/integration tests passed: URL/referrer minimization, consent/GPC, rejected/ignored receipts, BFCache, SDK budget, Google report shape/redaction/query opt-in, synchronous user-triggered Google popup, fixed Data Studio credential destination and CSV formula handling. Google and network classification use isolated fixtures, not live accounts or a licensed IP database.
- Native HMAC/JSON/path tests passed. Admin/viewer/manager plus two empty-state UI smokes passed, including saved filter/funnel, scroll-goal, acquisition, consolidated view, Google settings, revocation and late-response isolation.
- SDK copies, canonical logos/runtime tokens, release placeholders and generated OpenAPI checked. Bindings generated from the compiled source; no handwritten IDL.
- Website 0.4.0: bilingual build and 15 smokes, coherent sample channel totals and no private/customer data in the public examples.

## Scope and remaining acceptance

Native mode has UA/referrer filtering but no datacenter database or geography. Optional Node hosting-range filtering needs a licensed, updated local database and can exclude real proxy/VPN users. Google OAuth requires an operator-owned configured client/property; Data Studio requires operator deployment. No production Google integration was activated or claimed tested.

Retention allows up to 1,827 days but still has explicit raw-storage and 100,000-event query bounds. This is not proof of large-volume five-year retention, full Plausible/Matomo parity or a consent exemption. Production throughput, live data reconciliation, long-duration operation, snapshot recovery and complete screen-reader/text-zoom audit remain acceptance work in PARITY.md.

No Hub, Lunch, connected-app permissions or live deployments were changed. Release rollout requires a clean committed format-2 build and the approved Kitchen executor, not these local files.
