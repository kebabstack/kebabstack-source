# Contracts relay tooling

## [0.2.1] — 2026-09-10

- Pin sharp 0.35.4 in the local Wrangler/Miniflare toolchain to replace the affected bundled image libraries. Worker behavior, intake protocol and secrets are unchanged.
- Include relay installation and tests in the root release check so fresh CI runs cannot silently skip them.
