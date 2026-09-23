import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const cwd=fileURLToPath(new URL('..',import.meta.url)),mops=resolve(cwd,'../node_modules/.bin/mops');
const moc=execFileSync(mops,['toolchain','bin','moc'],{cwd,encoding:'utf8'}).trim();
const sources=execFileSync(mops,['sources'],{cwd,encoding:'utf8'}).trim().split(/\s+/);
execFileSync(moc,['-r',...sources,'test/motoko/native.test.mo'],{cwd,stdio:'inherit'});
console.log('Native HMAC RFC 4231 vectors and JSON/path unit checks passed');
