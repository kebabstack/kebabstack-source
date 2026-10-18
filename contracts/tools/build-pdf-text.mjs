// Rebuild the lazy browser PDF reader from the pinned lock in tools/pdf-text.
// Run npm ci --ignore-scripts --prefix contracts/tools/pdf-text first.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('./pdf-text/package.json', import.meta.url));
const {build} = require('esbuild');
await build({entryPoints:[fileURLToPath(new URL('./pdf-text-entry.js',import.meta.url))],
  outfile:fileURLToPath(new URL('../dist/vendor/pdf-text.js',import.meta.url)),
  nodePaths:[fileURLToPath(new URL('./pdf-text/node_modules',import.meta.url))],
  bundle:true,format:'esm',platform:'browser',external:['node:*','@napi-rs/canvas'],
  legalComments:'inline',minify:true});
