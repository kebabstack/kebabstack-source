# Contracts domain: contracts.kebabstack.com

Installation-specific configuration of the company's Contracts installation (2026-10-11). Not part of any shared recipe.

| Setting | Value |
|---|---|
| Public URL | `https://contracts.kebabstack.com/` |
| Original URL | `https://pjaqp-diaaa-aaaaz-qacwa-cai.icp.net/` |
| Frontend canister | `pjaqp-diaaa-aaaaz-qacwa-cai` |
| Backend canister | `p4hbc-caaaa-aaaaz-qacvq-cai` |

## DNS (Cloudflare zone kebabstack.com, DNS only, TTL Auto)

| Type | Name | Value |
|---|---|---|
| CNAME | `contracts` | `contracts.kebabstack.com.icp1.io` |
| TXT | `_canister-id.contracts` | `pjaqp-diaaa-aaaaz-qacwa-cai` |
| CNAME | `_acme-challenge.contracts` | `_acme-challenge.contracts.kebabstack.com.icp2.io` |

## Ownership file and registration

Only the Kitchen may write to app frontends (asset `Commit` permission; the vault is the controller). Since Kitchen
0.9.0 a Hub owner places the ownership file through the installer instead of an ad-hoc upload:

```sh
icp canister call kj7q3-7aaaa-aaaaz-qaclq-cai setInstallationFile '("contracts", "/.well-known/ic-domains", "text/plain", blob "contracts.kebabstack.com\n")' -n ic --identity OPERATOR
```

Then validate, register and wait for `registered` (took about one minute; the certificate followed two minutes later):

```sh
curl --fail-with-body https://icp.net/custom-domains/v1/contracts.kebabstack.com/validate
curl --fail-with-body -X POST https://icp.net/custom-domains/v1/contracts.kebabstack.com
curl --fail-with-body https://icp.net/custom-domains/v1/contracts.kebabstack.com
```

Verified 2026-10-11: `https://contracts.kebabstack.com/` serves the app with a Let's Encrypt certificate, and
`/.well-known/ic-domains` returns `contracts.kebabstack.com` as `text/plain`. Release updates keep `/.well-known/` keys.

## Follow-up in the apps (Hub owner session)

1. Hub → Apps → Contracts tile: change only the URL to `https://contracts.kebabstack.com/`; connector, name and
   permissions stay.
2. Contracts → Settings → App address: `https://contracts.kebabstack.com/`. This drives the redirect from the old
   icp.net address (known routes only, never tickets or sessions) and the links in Slack notifications.
3. With the domain, Contracts takes part in the suite login (Hub ≥ 0.40 cookie on `.kebabstack.com`); nothing to configure.
