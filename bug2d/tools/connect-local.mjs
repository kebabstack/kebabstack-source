import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const network = JSON.parse(execFileSync('icp', ['network','status','--json'], { encoding:'utf8' }));
const ids = JSON.parse(readFileSync('.icp/cache/mappings/local.ids.json','utf8'));
const backend = ids.backend;
if (typeof backend !== 'string' || !network.api_url) throw new Error('Deploy the local backend first.');
writeFileSync('.preview-backend.json', JSON.stringify({ backend, host: network.api_url }, null, 2)+'\n');
console.log('Preview connected to local canister ' + backend + ' via ' + network.api_url);
