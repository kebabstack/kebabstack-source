# Search visibility — website 0.5.0

The German and English homepages link to three substantive decision guides:
sovereign IT on OpenCloud, connected IT offboarding and cookieless web analytics.
These are search-intent hypotheses for small IT teams, not measured search-volume
or ranking claims. Each guide answers a different question with implemented
behavior and actual boundaries; avoid generating thin keyword variants.

## Implemented

- Eight complete HTML pages, reciprocal translated links and self-canonical URLs.
- Unique titles/descriptions, descriptive internal links, one main heading,
  software/breadcrumb microdata without invented ratings, prices or customers.
- A canonical-brand 1200×630 social image and Open Graph metadata.
- An eight-URL multilingual sitemap; robots.txt keeps the existing public
  `User-agent: * / Allow: /` policy. Googlebot, Bingbot, OAI-SearchBot and
  Claude-SearchBot are not blocked. No JS execution is needed to read the content.
- Strict CSP, no remote fonts, responsive pages and a real noindex 404.
- Existing Crumbs site/endpoint retained across all pages. Analytics can observe
  recognized referrals, but cannot prove that a crawler indexed or cited a page.

Crawler access and model-training permissions are different questions. This
release preserves the existing allow-all robots policy, including its training
behavior; it does not quietly change the publisher's policy. Future robots/CDN
changes must consider search, training and user-triggered fetches separately.
There is no special AI schema or guaranteed ranking effect from an llms.txt file;
we do not add a second, potentially drifting copy of the product claims.

## Operator follow-up

1. Use the real operator's Google Search Console domain property and Bing
   Webmaster Tools property. Verify domain ownership if not already done. No
   verification token or account was invented or added in this release.
2. Submit https://kebabstack.dev/sitemap.xml in those properties. Inspect a German
   and English guide for index eligibility and monitor indexing after publication.
3. Review actual search queries, impressions and useful visits before changing
   positioning. Crumbs' optional Search Console import needs the operator's
   configured Google OAuth client/property and explicit sign-in.
4. Keep public claims and alpha/Marketplace status current. Add the actual
   publisher's required contact/legal notices before broader public launch;
   deployment is not certification of those requirements.

A 200 response and open robots policy demonstrate reachability, not indexing or
inclusion in an AI answer. No search-account changes or sitemap submission are
claimed by these files. Relevant current primary guidance:

- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.openai.com/api/docs/bots
- https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler

## Maintenance check

Run the website build and smokes. Review the whole article at desktop and 320px,
including language switching, primary CTA, related guides and the persistent
header. Verify real production status codes, canonical/hreflang, robots, sitemap,
image, CSS and the exact analytics CSP destinations after deployment.
