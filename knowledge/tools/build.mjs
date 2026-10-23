import {build} from 'esbuild';
await build({entryPoints:['src/editor.js'],bundle:true,format:'esm',target:'es2022',outfile:'dist/editor.js',minify:true,legalComments:'eof'});
import {readFile,writeFile,readdir} from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
let notices='Doku editor — third-party notices\n\nThe following packages are included in the locally bundled editor.\n\n';
for(const [path,pkg]of Object.entries(lock.packages)){if(!path||pkg.dev)continue;const meta=JSON.parse(await readFile(path+'/package.json','utf8'));const files=await readdir(path);const license=files.find(f=>/^licen[sc]e(?:\.md|\.txt)?$/i.test(f));if(!license)throw new Error('Missing license for '+meta.name);notices+=meta.name+' '+meta.version+'\n'+(await readFile(path+'/'+license,'utf8'))+'\n\n';}
await writeFile('dist/third-party-notices.txt',notices);
