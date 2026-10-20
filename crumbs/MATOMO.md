# Matomo historical migration

The importer preserves daily **aggregate reports**, original timezone, source
method and available metrics. It does not reconstruct raw visits, visitor IDs,
journeys, heatmaps or recordings. Imported History stays separate from native
traffic; no cross-tool unique-person total is claimed. Daily source dates are
stored as UTC date labels, not converted observations. The UI displays the
original Matomo timezone; do not merge these rows into native daily buckets.

## Export and validate

Retain a private immutable archive according to your retention policy. Use a
read-authorized Matomo token from the secret manager as `MATOMO_TOKEN`:

```sh
node crumbs/tools/export-matomo.mjs --url https://YOUR.matomo.cloud/index.php --site 2 --from 2022-09-01 --until 2026-10-19 --timezone America/Los_Angeles --out /private/matomo.json
node crumbs/tools/import-matomo.mjs --file /private/matomo.json --site WEBSITE_ID
```

The end date is exclusive. Export reads Matomo's site timezone and refuses a
mismatch. API tokens are POSTed only to the supplied HTTPS origin; redirects are
refused. The archive has format `crumbs-matomo-v1`, source URL, idSite, timezone,
and complete flat daily reports. API errors, unsupported methods, hierarchical
reports, invalid integers and conflicting duplicate source rows fail validation.
`--methods` chooses comma-separated supported methods (see the importer). Plugins
such as Provider/Resolution must be installed and authorized in Matomo. Check
exported totals against Matomo before adoption; custom server/plugin truncation
cannot be inferred from every API response. Never mark a partial export complete.

## Import

Choose sufficient Crumbs retention before sending; increasing it does not recover
already deleted records. Set `CRUMBS_URL` and a website-scoped manage key in
`CRUMBS_API_TOKEN`, then repeat the import with `--send`. A validation-only run
never transmits records. The backend caps retained aggregate rows at 100,000 and
historical query results at 5,000: four years of every page/source can exceed this.
Choose the reports required for business decisions and keep the full external
archive. Do not silently truncate or replace high-cardinality rows with totals.

Retries use stable IDs tied to source, site, timezone, date, method and label;
changed totals for an existing row are rejected. A multi-batch run is not an
atomic transaction; a failed run can be repeated. Automatic rollback/replacement
is not implemented. Existing History shows the original metrics and explicitly
labels unavailable visitor/pageview counts instead of showing them as measured
zero. Preserve original goal/conversion metrics without treating them as native
event counts. Raw source labels can contain personal data: review the private
archive before upload and restrict access accordingly.

Retiring Matomo also requires the other sites sharing that account, data retention,
parallel measurement, current dataset operation and workload acceptance. This
importer alone is not a cutover certificate.
