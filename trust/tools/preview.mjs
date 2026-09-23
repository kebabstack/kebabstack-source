// Isolated design review using fictional data. No network calls to live canisters.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(os.tmpdir(),'kebab-trust-preview');
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,'trust/dist'),out,{recursive:true});
fs.copyFileSync(path.join(root,'trust/test/agent-bundle.stub.js'),path.join(out,'agent-bundle.js'));
fs.copyFileSync(path.join(root,'trust/test/fixture.mjs'),path.join(out,'fixture.mjs'));
fs.writeFileSync(path.join(out,'preview.mjs'),`
import {installFixture} from './fixture.mjs';
const role=new URL(location.href).searchParams.get('role')||'admin';
const f=installFixture({role,aiOn:!new URL(location.href).searchParams.has('noai')});
f.devs[0].ownerName='Alex Morgan';f.devs[0].ownerEmail='alex@example.test';
f.devs[1].hostname='Studio Mac mini';
f.devs[2].hostname='Sample MacBook Air';
f.checks.push({...f.checks[0],id:'lin_osversion',title:'Operating system reports a version',os:'linux',sql:'SELECT version FROM os_version',rule:'nonEmpty'});
for(const [id,name,person,os,state,age] of [['4','Design MacBook Pro','Sam Rivers','macos','stale',3],['5','Support ThinkPad','Casey Brooks','windows','error',0],['6','Engineering workstation','Jordan Ellis','linux','passing',0]]){
 f.devs.push({...f.devs[0],nodeKey:'device-'+id,hostname:name,ownerName:person,ownerEmail:person.split(' ')[0].toLowerCase()+'@example.test',hardwareSerial:'DEMO-REVIEW-'+id,os,osVersion:os==='windows'?'11':os==='linux'?'24.04':'15.6',lastSeen:f.now-BigInt(age)*86400000000000n,postureAt:f.now-BigInt(age)*86400000000000n,posture:[],failingChecks:[],failing:0n,assessment:{state,expected:4n,passed:state==='passing'?4n:0n,pending:0n,failing:0n,errors:state==='error'?1n:0n,stale:state==='stale'?4n:0n}});
}
for(const d of f.devs.slice(3)){const applicable=f.checks.filter(c=>c.enabled&&(c.os===d.os||c.os==='all'));d.posture=applicable.map(c=>[c.id,true,'Reported by sample agent']);d.assessment.expected=BigInt(applicable.length);d.assessment.passed=d.assessment.state==='passing'?BigInt(applicable.length):0n;d.assessment.stale=d.assessment.state==='stale'?BigInt(applicable.length):0n;}
localStorage.setItem('ks-trust-session','local-preview');
await import('./app.js');
`);
let html=fs.readFileSync(path.join(out,'index.html'),'utf8').replace('<script type="module" src="./app.js"></script>','<script type="module" src="./preview.mjs"></script>');
html=html.replace('<body>','<body><div style="background:#315f4f;color:#fff;text-align:center;padding:7px 12px;font:11px system-ui">LOCAL PREVIEW · Fictional data · <a style="color:inherit" href="?role=admin#/devices">Admin</a> · <a style="color:inherit" href="?role=helpdesk#/devices">Fleet viewer</a> · <a style="color:inherit" href="?role=member#/devices">Employee</a></div>');
fs.writeFileSync(path.join(out,'index.html'),html);
console.log(out);
