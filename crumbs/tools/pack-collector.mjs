#!/usr/bin/env node
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),out=resolve(process.argv[2]??'/tmp/crumbs-collector-0.6.0.tar.gz');
if(!out.endsWith('.tar.gz'))throw new Error('Output must end in .tar.gz');
const tmp=mkdtempSync(join(tmpdir(),'crumbs-package-')),base=join(tmp,'crumbs');mkdirSync(base);
try{
 const files=['package.json','README.md','INSTALL.md','PRIVACY.md','ACCESS.md','METRICS.md','PARITY.md','CHANGELOG.md','collector/package.json','collector/package-lock.json','collector/server.mjs','collector/store.mjs','collector/privacy.mjs','collector/network.mjs','collector/api.mjs','collector/transport.mjs','dist/idl.js','dist/tracker.js','dist/openapi.json'];
 const hashes={};for(const file of files){mkdirSync(resolve(base,file,'..'),{recursive:true});copyFileSync(join(root,file),join(base,file));hashes[file]=createHash('sha256').update(readFileSync(join(base,file))).digest('hex');}
 writeFileSync(join(base,'manifest.json'),JSON.stringify({version:'0.6.0',files:hashes},null,2));execFileSync('tar',['-czf',out,'-C',tmp,'crumbs']);console.log(out+' sha256 '+createHash('sha256').update(readFileSync(out)).digest('hex'));
}finally{rmSync(tmp,{recursive:true,force:true});}
