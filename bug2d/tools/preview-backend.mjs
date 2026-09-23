import { PocketIc, PocketIcServer } from '@dfinity/pic';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { idlFactory } from '../src/generated/backend.did.js';
const server = await PocketIcServer.start({ttl:86_400});
const pic = await PocketIc.create(server.getUrl()); await pic.setTime(Date.now());
const {canisterId} = await pic.setupCanister({idlFactory,wasm:readFileSync(new URL('../backend/dist/backend.wasm',import.meta.url))});
const port=await pic.makeLive();
const config={backend:canisterId.toText(),host:`http://127.0.0.1:${port}`};
writeFileSync('.preview-backend.json',JSON.stringify(config,null,2)+'\n');
console.log('Local test leaderboard: '+config.host+' / '+config.backend);
console.log('Keep this terminal open. In a second terminal: npm start');
console.log('This test board starts fresh each time; deployed canister scores persist.');
const keepAlive=setInterval(()=>{},60000);
async function stop(){clearInterval(keepAlive);try{await pic.tearDown();await server.stop();const saved=JSON.parse(readFileSync('.preview-backend.json','utf8'));if(saved.host===config.host)unlinkSync('.preview-backend.json');}finally{process.exit(0);}}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
