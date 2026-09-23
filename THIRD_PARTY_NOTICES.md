# Licenses and attribution

Original Kebabstack code is distributed under the root [MIT license](LICENSE).
That license does not replace upstream licenses, image credits or trademark rights.
Dependency versions and integrity values are recorded in the npm and Mops locks.
Dependencies installed at build time retain their own notices in their packages.

## Included browser code

| Component | Location / origin | License and notice |
| --- | --- | --- |
| DFINITY agent, identity, Candid, principal and auth client | Shared `*/dist/agent-bundle.js`; upstream [agent-js](https://github.com/dfinity/agent-js) | Apache-2.0; [license](third-party/licenses/dfinity-apache-2.0.txt), original bundled comments retained |
| ICP SDK and cryptographic dependencies | Bug browser client; dependency versions in `bug/package-lock.json` and `bug2d/package-lock.json` | Upstream package licenses and retained bundle comments; [Noble curves](third-party/licenses/noble-curves-MIT.txt), [Noble hashes](third-party/licenses/noble-hashes-MIT.txt) |
| Three.js 0.185.1 | `bug/dist/vendor/`, copied by `bug/tools/build.mjs` | [MIT](bug/dist/vendor/THREE-LICENSE.txt) |
| pdf-lib 1.17.1 | `assets/dist/vendor/pdf-lib.min.js` | [MIT](third-party/licenses/pdf-lib-1.17.1-LICENSE.txt); Andrew Dillon |
| qrcode-generator 1.4.4 | `assets/dist/vendor/qrcode.js` | [MIT](third-party/licenses/qrcode-generator-1.4.4-LICENSE.txt); Kazuhiko Arase |
| QR encoding port | `assets/backend/lib/` | [Original attribution and license](assets/backend/lib/Qr-NOTICE.txt) |
| postal-mime 2.7.6 | `contracts/dist/vendor/postal-mime.js` and mail relay | [MIT-0](third-party/licenses/postal-mime-MIT-0.txt); Andris Reinman |
| unpdf 1.8.1 and PDF.js | `contracts/dist/vendor/pdf-text.js` | [Build notice](contracts/dist/vendor/pdf-text-NOTICE.txt), [MIT](contracts/dist/vendor/unpdf-LICENSE.txt), [Apache-2.0](contracts/dist/vendor/pdfjs-LICENSE.txt) |

## Images and marks

The canonical Kebabstack product SVGs, PNG exports and drawing rules are included
in [the logo registry](design/logos/README.md). The generated 2D space backgrounds
are original game illustration, not telescope data. The optional game's three Webb
photographs use CC BY 4.0 and retain their original metadata; see the complete
[credits and source links](bug/src/assets/webb/CREDITS.md), also shown in the game.
The supplied third-party astronaut portrait is not included: its redistribution
license was not documented. The flight guide uses the canonical Bug mark instead.

References to Internet Computer, DFINITY, OpenCloud and other vendors identify
platforms or integrations. They do not imply endorsement or transfer trademark
rights. Company logos uploaded to a running installation are not part of this source.

Please include this file and the applicable notices when redistributing the code.
