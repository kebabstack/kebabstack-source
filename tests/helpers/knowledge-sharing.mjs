import assert from 'node:assert/strict';
import {Principal} from '@icp-sdk/core/principal';
import {pbkdf2Sync,createHash,randomBytes} from 'node:crypto';
const ok=r=>{assert.ok('ok'in r,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.ok;};
const denied=r=>assert.ok('err'in r);
const doc=text=>JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
export async function manualAndSharing({k,kt,pic,article,refresh,upgrade}){
 // Match the browser transport: staff uses a company session; visitors have neither
 // an IC identity nor an app session. Controller authority must never mask a gap.
 k.setPrincipal(Principal.anonymous());
 denied(await k.createManualProposal('invalid',[],'manual-invalid-0001'));denied(await k.createManualProposal(kt.reader,[],'manual-reader-0001'));
 denied(await k.createManualProposal(kt.author,[99999n],'manual-missing-0001'));
 const p=ok(await k.createManualProposal(kt.author,[],'manual-author-0001'));
 assert.equal(ok(await k.createManualProposal(kt.author,[],'manual-author-0001')),p);
 denied(await k.createManualProposal(kt.author,[article],'manual-author-0001'));
 const detail=ok(await k.proposal(kt.outsider,p));assert.deepEqual(detail.proposal.source,[]);assert.deepEqual(detail.currentSource,[]);
 denied(await k.proposal(kt.reader,p));denied(await k.publishProposal(kt.author,p,1n));denied(await k.publishProposal(kt.outsider,p,1n));
 const manualText='A manually written guide with no Desk access dependency. '.repeat(600);
 ok(await k.saveProposal(kt.author,p,1n,{title:'Manual guide for external visitors',document:doc(manualText)}));
 const published=ok(await k.publishProposal(kt.outsider,p,2n));assert.equal(ok(await k.publishProposal(kt.outsider,p,2n)),published);
 const edit=ok(await k.createManualProposal(kt.author,[published],'manual-edit-00001'));
 const stale=ok(await k.createManualProposal(kt.reviewer,[published],'manual-edit-00002'));
 const hidden=ok(await k.createManualProposal(kt.outsider,[],'manual-private-01'));denied(await k.proposal(kt.author,hidden));
 ok(await k.saveProposal(kt.outsider,hidden,1n,{title:'Private draft title',document:doc('This text must never be exposed through sharing.')}));
 const config={article:published,revision:1n,name:'External readers',days:[7n],password:[],requestId:'share-unprotected-01'};
 for(const tok of ['invalid',kt.author,kt.reader]){denied(await k.createShare(tok,config));assert.deepEqual(await k.shareLinks(tok,published),[]);}
 denied(await k.createShare(kt.owner,{...config,revision:99n}));
 for(const days of [0n,3651n])denied(await k.createShare(kt.owner,{...config,days:[days]}));
 denied(await k.createShare(kt.owner,{...config,password:[{salt:[1],verifier:[2]}]}));
 const [a,b]=await Promise.all([k.createShare(kt.reviewer,config),k.createShare(kt.reviewer,config)]);const link=ok(a);assert.equal(ok(b).code,link.code);assert.match(link.code,/^[a-f0-9]{32}$/);
 denied(await k.createShare(kt.reviewer,{...config,name:'Changed input'}));
 assert.equal((await k.shareLinks(kt.reviewer,published)).length,1);
 assert.equal((await k.sharedInfo(link.code))[0].salt.length,0);
 const publicDoc=ok(await k.readShared(link.code,[]));assert.equal(publicDoc.document,doc(manualText));
 assert.deepEqual(Object.keys(publicDoc).sort(),['document','expiresAt','publishedAt','revision','title']);
 assert.deepEqual(await k.article(link.code,published),[]);assert.deepEqual(await k.history(link.code,published),[]);denied(await k.proposal(link.code,hidden));
 denied(await k.readShared('f'.repeat(32),[]));assert.deepEqual(await k.sharedInfo('f'.repeat(32)),[]);
 ok(await k.saveProposal(kt.author,edit,1n,{title:'A later internal version',document:doc('Later published changes are not included in old links.')}));ok(await k.publishProposal(kt.reviewer,edit,2n));denied(await k.publishProposal(kt.reviewer,stale,1n));assert.deepEqual(ok(await k.readShared(link.code,[])),publicDoc);
 // Browser KDF output is a per-link bearer proof; only its SHA-256 verifier persists.
 const salt=randomBytes(16),proof=pbkdf2Sync('synthetic password with spaces',salt,600000,32,'sha256'),verifier=createHash('sha256').update(proof).digest();
 const locked=ok(await k.createShare(kt.owner,{...config,name:'Password required',days:[],password:[{salt,verifier}],requestId:'share-password-0001'}));
 const info=(await k.sharedInfo(locked.code))[0];assert.equal(info.iterations,600000n);assert.deepEqual(Buffer.from(info.salt[0]),salt);assert.deepEqual(Object.keys(info).sort(),['expiresAt','iterations','salt']);
 for(let i=0;i<10;i++)assert.equal((await k.readShared(locked.code,Buffer.alloc(32,i))).err.kind,'password');
 assert.equal((await k.readShared(locked.code,proof)).err.kind,'rateLimited');
 await pic.advanceTime(61000);await pic.tick(3);await refresh();
 assert.equal(ok(await k.readShared(locked.code,proof)).title,'Manual guide for external visitors');
 const secondSalt=randomBytes(16);const secondProof=pbkdf2Sync('synthetic password with spaces',secondSalt,600000,32,'sha256');
 const locked2=ok(await k.createShare(kt.owner,{...config,name:'Different recipient',days:[],password:[{salt:secondSalt,verifier:createHash('sha256').update(secondProof).digest()}],requestId:'share-password-0002'}));
 denied(await k.readShared(locked2.code,proof));ok(await k.readShared(locked2.code,secondProof));
 const list=await k.shareLinks(kt.owner,published);assert.ok(!JSON.stringify(list,(_,v)=>typeof v==='bigint'?String(v):v).includes('verifier'));
 denied(await k.revokeShare(kt.author,link.id));ok(await k.revokeShare(kt.owner,locked2.id));ok(await k.revokeShare(kt.owner,locked2.id));assert.deepEqual(await k.sharedInfo(locked2.code),[]);denied(await k.readShared(locked2.code,secondProof));
 for(let i=3;i<100;i++)ok(await k.createShare(kt.owner,{...config,name:'Bounded link '+i,requestId:'share-bound-'+String(i).padStart(8,'0')}));
 assert.equal((await k.shareLinks(kt.owner,published)).length,100);denied(await k.createShare(kt.owner,{...config,requestId:'share-over-capacity'}));
 const codes=(await k.shareLinks(kt.owner,published)).map(s=>s.code);assert.equal(new Set(codes).size,100);
 await upgrade();assert.deepEqual(await k.shareLinks(kt.owner,published),await k.shareLinks(kt.reviewer,published));assert.deepEqual(ok(await k.readShared(link.code,[])),publicDoc);ok(await k.readShared(locked.code,proof));denied(await k.readShared(locked2.code,secondProof));assert.deepEqual(ok(await k.proposal(kt.outsider,hidden)).proposal.source,[]);
 // Exact expiry is server-enforced, even with no signed-in company session.
 await pic.setTime(Number(link.expiresAt[0]/1000000n)+1);await pic.tick(3);assert.deepEqual(await k.sharedInfo(link.code),[]);denied(await k.readShared(link.code,[]));ok(await k.readShared(locked.code,proof));
 await refresh();ok(await k.revokeShare(kt.owner,locked.id));denied(await k.readShared(locked.code,proof));
}
