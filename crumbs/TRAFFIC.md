# Native location, network and traffic classification

Crumbs 0.11.0 adds native lookup for both cookieless and consented-cookie events.
There is no extra runtime server and no per-visitor external lookup. Native IP/UA
still enter replicated ingress execution, as documented in PRIVACY.md; neither
is persisted in analytics events. GeoIP is an estimate, not a person's location.

## Operator workflow

Download DB-IP **City Lite CSV** and **ASN Lite CSV** from https://db-ip.com/db/lite.php.
These are CC BY 4.0 datasets with monthly releases and reduced accuracy/coverage.
Retain their license/source information. Crumbs links to DB-IP in report guidance.
No database is bundled into the public source or Wasm. Prepare it on an operator's
machine (this is a maintenance command, not a running collector):

```sh
python3 crumbs/tools/prepare-traffic.py --source /private/dbip-city-lite.csv.gz --output /private/city-package --kind geo --published 2026-10-01 --expires 2026-12-01 --id dbip-city-2026-10 --attribution DB-IP-Lite-CC-BY-4.0
python3 crumbs/tools/prepare-traffic.py --source /private/dbip-asn-lite.csv.gz --output /private/asn-package --kind network --published 2026-10-01 --expires 2026-12-01 --id dbip-asn-2026-10 --attribution DB-IP-Lite-CC-BY-4.0
node crumbs/tools/upload-traffic.mjs --dir /private/city-package --canister BACKEND_ID --identity OPERATOR --network NETWORK
```

The upload command validates files without sending by default. Add `--send` only
for an authorized destination; production upload is a production change. URL
networks require `--root-key` with independently verified trust. Never export a
private identity key. Dataset writes are controller-only Candid methods, not
website-manager operations or REST endpoints. Prepare/upload the ASN package in
the same way. The 0.11.1 uploader requires a 0.11.1 or newer backend. It sends up to 16,384 ranges per call; the canister validates the whole batch before storing separate 1,024-range lookup chunks. Lookup cost and dataset format remain unchanged. Each kind activates atomically; partial uploads leave the preceding
active dataset untouched. An interrupted upload remains pending: cancel its exact
ID using `cancelTrafficDataset`, then retry. Never activate a partial dataset.

Keep datasets current with these maintenance commands before expiry. This release
does not schedule downloads. Expired/unmatched datasets yield empty attributes;
collection continues. `trafficDatasets()` exposes source, release and expiry.
The maximum validity window is 93 days. A dataset is capped at 10 million disjoint
ranges, 500,000 metadata entries and a 96 MB logical metadata charge. These are
safety limits, not a throughput guarantee. Updates temporarily retain old and new
data; storage/cycles and upgrade headroom remain operator responsibilities.

## Hosting ranges and automation

A separate `hosting` dataset accepts CSV `start_ip,end_ip,provider`. Use published
cloud-provider ranges with recorded source/date; normalize overlapping ranges
before preparing. The supplied tool normalizes overlapping AWS EC2 and Google
Cloud customer ranges from their official JSON files:

```sh
python3 crumbs/tools/prepare-hosting.py --aws /private/aws-ip-ranges.json --google /private/google-cloud.json --output /private/hosting.csv
python3 crumbs/tools/prepare-traffic.py --source /private/hosting.csv --output /private/hosting-package --kind hosting --published 2026-10-19 --expires 2026-11-19 --id cloud-ranges-2026-10-19 --attribution AWS-EC2-and-Google-Cloud-public-ranges
```

Sources: https://ip-ranges.amazonaws.com/ip-ranges.json and
https://www.gstatic.com/ipranges/cloud.json. These cover those published provider
ranges, not every host, VPN or bot. Retain the original source snapshots and dates.
Upload the resulting package with the same validation-first uploader.

ASN names alone are not a reliable hosting classification.
A match appears as **Hosting network**, never “confirmed bot”. No match means
**Unclassified**, not “human”. Browser-reported `navigator.webdriver` appears as
**Browser automation signal** and is forgeable. Existing known-UA and referrer-spam
exclusions remain. No generic screen resolution is automatically classified as a bot.

Reports, goals, funnels and journeys accept `asn`, `network`, `screen`,
`trafficClass`, `geoSource`, `networkSource`, `hostingSource` filters/breakdowns.
Normalized exports include optional `context`; old events have null context.
Screen size is supplied by the browser, not used to strengthen visitor identity.
GPC/DNT and existing consent rules continue to apply in both modes. Public Candid
HTTP headers remain forgeable: these classifications never authorize access.
Retries preserve the first derived location/network context after dataset changes.

## Adoption decision

This enables investigation, not automatic Matomo equivalence or perfect bot
recognition. Validate known cloud traffic and ordinary visits, compare both APIs
with identical instants and filters, and measure realistic volume/cardinality.
Historic events cannot acquire missing location/network evidence retrospectively.
