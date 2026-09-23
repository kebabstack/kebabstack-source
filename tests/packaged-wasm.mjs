// Optional immutable release input for local upgrade/authorization fixtures.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const directory=process.env.KEBAB_TEST_BUNDLE;
const catalogue=directory?JSON.parse(readFileSync(resolve(directory,'index.json'),'utf8')):undefined;
export function candidateBackend(name){
 if(!catalogue)return resolve(name,'backend/dist/backend.wasm');
 const recipe=catalogue.recipes?.find(r=>r.id===name),backend=recipe?.backend;
 const prefix=`recipes/${name}/${recipe?.version}/${recipe?.releaseId}/`;
 if(catalogue.format!==2||!backend?.path.startsWith(prefix)||backend.path.includes('..'))throw Error('Missing or invalid packaged backend: '+name);
 const file=resolve(directory,backend.path.slice('recipes/'.length)),bytes=readFileSync(file);
 if(bytes.length!==backend.size||createHash('sha256').update(bytes).digest('hex')!==backend.sha256)throw Error('Packaged backend checksum mismatch: '+name);
 return file;
}
