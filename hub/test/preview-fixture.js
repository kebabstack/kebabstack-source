const appNames=['Assets','Contracts','Desk','Forms','Trust','Watch'];
const people=[['p1','Alex Morgan','alex@example.test'],['p2','Jamie Weber','jamie@example.test'],['p3','Kim Bauer','kim@example.test'],['p4','Sam Fischer','sam@example.test'],['p5','Robin Meier','robin@example.test']];
const now=()=>BigInt(Date.now())*1000000n;
const policies=appNames.map((name,i)=>({app:name.toLowerCase(),defaultRole:i===5?'none':'member',people:[{id:'p2',role:'admin'},{id:'p5',role:'none'}],groups:[]}));
const revisions=appNames.map(()=>3n);
const employeeCan={assets:['See assigned devices','See and accept own offers and download own invoices'],contracts:['Manage own personal workspace','Use shared teamspaces within their membership and record permissions'],desk:['Create and follow own tickets','Read and decide explicitly assigned pending approvals'],forms:['Create and manage own forms and submissions','Use shared forms within their explicit viewer/editor permissions'],trust:['See own devices and their check results','Read the published check catalogue']};
const rolesFor=app=>{
 const none={id:'none',name:'No access',can:[],cannot:['Open the app or read protected data']};
 const admin={id:'admin',name:'Admin',can:['See and manage all app content, including other people’s content','Manage app settings'],cannot:['Grant app roles here — only Hub owners manage permissions','Act as another person’s identity']};
 const member={id:'member',name:app==='desk'?'Requester':'Employee',can:employeeCan[app]||[],cannot:['Read other people’s unshared content','Manage app settings']};
 if(app==='watch')return [none,{id:'viewer',name:'Viewer',can:['Read ALL monitored domains, events and reports'],cannot:['Change monitoring or app settings']},admin];
 const out=[none,member];
 if(app==='desk')out.push({id:'agent',name:'Agent',can:['Read and work on ALL tickets'],cannot:['Manage app settings or Hub permissions']});
 if(app==='trust')out.push({id:'viewer',name:'Fleet viewer',can:['Read ALL devices and their check results'],cannot:['Change checks, enrolment or settings']});
 return [...out,admin];
};
const decide=(p,pid)=>pid==='p1'?{role:'admin',source:'Global Hub owner'}:p.people.some(g=>g.id===pid)?{role:p.people.find(g=>g.id===pid).role,source:'Individual assignment'}:p.groups.length&&pid==='p3'?{role:p.groups[0].role,source:'Group: IT Operations'}:{role:p.defaultRole,source:'App default'};
const view=(id,p)=>({id,name:appNames[Number(id)-1],configured:true,revision:revisions[Number(id)-1],policy:p,roles:rolesFor(p.app),canManage:true,checkedAt:now(),enforced:true,status:[{app:p.app,model:1n,revision:'sample',directoryAt:now(),legacy:[],legacyGroups:[]}],people:people.map(([pid,name,email])=>({id:pid,name,email,...decide(p,pid),active:true,inherited:pid==='p1',assigned:[],previouslyAllowed:true}))});
const api={listConnectors:async()=>appNames.map((name,i)=>({id:BigInt(i+1),name,permissionApp:name.toLowerCase()})),listGroups:async()=>[{id:1n,name:'IT Operations',source:'manual'}],getAppPermissions:async id=>[view(id,policies[Number(id)-1])],previewAppPermissions:async(id,p)=>[view(id,p)],setAppPermissions:async(id,r,p)=>{policies[Number(id)-1]=p;revisions[Number(id)-1]++;return {ok:true,detail:'Saved in local sample only'};},checkAppPermissions:async()=>({ok:true,detail:'Local sample confirmation'}),personAppPermissions:async pid=>appNames.map((name,i)=>{const p=policies[i],d=decide(p,pid),role=rolesFor(p.app).find(r=>r.id===d.role);return {cid:BigInt(i+1),name,app:p.app,configured:true,...d,roleLabel:role.name,can:role.can,cannot:role.cannot};})};
const users=people.map(([id,displayName,email],i)=>({id,key:id,email,displayName,status:i===4?'deactivated':'active',active:i!==4,kind:'person',override:[],forced:false,connId:900000000n,connName:'Company directory',updatedAt:now(),role:i===0?'owner':'',attrs:[]}));
const groups=[{id:1n,name:'IT Operations',note:'Workplace & support',source:'manual',members:people.slice(0,2).map(x=>x[2]),createdAt:now(),canEdit:true},{id:2n,name:'Engineering',note:'Synced from the directory',source:'scim',members:people.slice(2,4).map(x=>x[2]),createdAt:now(),canEdit:false}];
const connectors=appNames.map((name,i)=>({id:BigInt(i+1),name,permissionApp:name.toLowerCase(),permissionsManaged:true,canisterId:'sample-'+i,note:['Devices & sales','Contracts & renewals','Tickets & requests','Forms & submissions','Device posture','Domain monitoring'][i],addedAt:now(),scope:[],filters:[],access:{mode:'everyone',groups:[],roles:[],people:[]},lanes:['identity','profile','notify'],pushedAt:now()}));
connectors.push({id:7n,name:'Lunch Check-in',permissionApp:'',permissionsManaged:false,canisterId:'aaaaa-aa',note:'Employee lunch registration',addedAt:now(),scope:[],filters:['entity=LLC','city^=Remote'],access:{mode:'everyone',groups:[],roles:[],people:[]},lanes:['identity'],pushedAt:now()});
const tiles=connectors.map(c=>({id:c.id,connectorId:c.id,name:c.name,url:'https://'+c.name.split(' ')[0].toLowerCase()+'.example.test/',kind:'app',hidden:false,hasIcon:false,note:c.note}));
const journal=[{at:now(),kind:'permissions',detail:'Jamie Weber assigned Admin in Assets by Alex Morgan'},{at:now()-60000000000n,kind:'scim',detail:'Company directory sync completed · 24 people, 4 groups'},{at:now()-240000000000n,kind:'apps',detail:'Forms connected to the company workspace'}];
Object.assign(api,{
 listConnectors:async()=>connectors,listAppLinks:async()=>tiles,portalApps:async()=>tiles,listOidcClients:async()=>[],listConnections:async()=>[],listGroups:async()=>groups,
 home:async()=>({orgName:'Example Company',setupDone:true,people:25n,active:24n,inactive:1n,withKey:2n,openInvites:1n,groups:4n,apps:7n,tiles:7n,pendingRequests:0n,accessRequests:0n,reviewsOverdue:0n,reviewsOpen:0n,sources:1n,scimOn:true,vaultId:'',sample:false,role:'owner',recent:journal}),
 getSetup:async()=>({orgName:'Example Company',setupDone:true,directoryMode:'hybrid'}),getSettings:async()=>({autoSyncSecs:3600n}),listSsoProvidersPublic:async()=>[{id:1n,name:'Company Okta',kind:'okta'}],listSsoProviders:async()=>[{id:1n,name:'Company Okta',kind:'okta',enabled:true,clientId:'example-client',issuer:'https://example.okta.test'}],
 listUsers:async({search='',offset=0n,limit=50n})=>{let rows=users.filter(u=>(u.displayName+' '+u.email).toLowerCase().includes(search.toLowerCase()));return{total:BigInt(rows.length),items:rows.slice(Number(offset),Number(offset+limit))}},listPersonRoles:async()=>[{...users[0],role:'owner'}],listPrincipalLinks:async()=>[],listInvites:async()=>[],listAdmins:async()=>[],
 portalWhoami:async()=>[{email:people[0][2],displayName:people[0][1],active:true}],myPerson:async()=>[{...users[0],displayName:people[0][1]}],getCompanyLogo:async()=>[],myAvatar:async()=>[],myAvatarPortal:async()=>[],tileIcon:async()=>[],version:async()=> '0.24.0',vaultInfo:async()=>({vaultId:''}),kitchenInfo:async()=>({kitchenId:''}),
 suiteState:async()=>[{email:people[0][2],displayName:people[0][1],unread:0n,active:true,expiresAt:now()+3600000000000n,provider:''}],myNotifications:async()=>({items:[],total:0n,unread:0n,slackDm:false}),getJournal:async()=>journal,
 listScimSources:async()=>[{id:1n,name:'Company directory',domains:['example.test'],enabled:true,createdAt:now(),lastSeen:now(),lastOp:'People and groups updated',note:'',userCount:24n,groupCount:4n,hasToken:true,legacyToken:false}],
 listAccessRequests:async()=>[],listGrants:async()=>[],listReviews:async()=>[],governanceSummary:async()=>({openRequests:0n,undecided:0n}),listAppOwners:async()=>[],listOwnershipTools:async()=>[],
 aiSettings:async()=>({provider:'openai',url:'',model:'',visionModel:'',hasKey:false}),assistantStatus:async()=>({enabled:false}),listAssistants:async()=>[],
});
// Release catalogue fixtures: no production calls or writes.
const releaseSamples=connectors.slice(0,6).map((c,i)=>({id:appNames[i].toLowerCase(),name:c.name,kind:'app',version:i===0?'0.12.0':'1.0.0',runningVersion:i===0?'0.11.1':'1.0.0',installed:[{backend:c.canisterId}],releaseId:'sample-'+i,sourceCommit:'sample-build',notes:i===0?'A clearer handover process and improved sales overview.\n\nExisting device assignments and sales are preserved.':'Maintenance release with the shared company sign-in.',state:['update_available','current','current','repair','current','current'][i],detail:i===3?'The backend is current, but the frontend does not match. Repair this release.':'Backend and frontend verified against the published release.',canUpdate:true,icon:['💻','📑','🎫','📝','🛡','◉'][i]}));
releaseSamples.push({id:'hub',name:'Hub',kind:'hub',version:'0.25.0',runningVersion:'0.25.0',installed:[{backend:'hub'}],state:'current',canUpdate:true,notes:'Apps, updates and history in one place.',releaseId:'sample-hub',sourceCommit:'sample-build',icon:'🍢'}, {id:'vault',name:'Backups',kind:'service',version:'0.2.1',runningVersion:'0.2.1',installed:[{backend:'vault'}],state:'current',canUpdate:true,notes:'Daily backup service.',releaseId:'sample-vault',sourceCommit:'sample-build',icon:'▣'},{id:'kitchen',name:'Update service',kind:'installer',version:'0.7.0',runningVersion:'0.7.0',installed:[{backend:'installer'}],state:'current',canUpdate:false,notes:'Verified release management.',releaseId:'sample-installer',sourceCommit:'sample-build',icon:'↻'});
window.__previewUpdateService={recipes:async()=>releaseSamples,checkForUpdates:async()=>releaseSamples,info:async()=>({version:'0.7.0',me:'sample-installer',pantryId:'sample-releases'}),listJobs:async()=>[{id:1n,by:'Sample owner',kind:'update',recipeId:'hub',version:'0.25.0',state:'done',startedAt:now()-3600000000000n,steps:[{name:'Verify release',status:'ok',detail:'Package checksums verified'},{name:'Snapshots',status:'ok',detail:'Backend and frontend saved'},{name:'Verify installation',status:'ok',detail:'Both components match the published release'}]}],applyRelease:async()=>({ok:false,detail:'This is a local sample. No live updates run here.'}),verifyInstalled:async()=>({ok:false,detail:'This is a local sample.'})};

// Operations sample sources; only this local fixture supplies these numbers.
const operationsSamples={
 desk:{active:18,unassigned:3,breached:2,departureReview:1,offboarding:2,lifecycleUnverified:0},
 trust:{total:120,passing:104,attention:5,unverified:11,assessed:109,score:96},
 assets:{total:186,stock:14,assigned:154,handover:5,preparing:2,sales:3},
 contracts:{total:42,due:3,overdue:1,unknown:2,unowned:1},
 watch:{enabled:12,alerts:1,warnings:0,stale:0,expiring:1,unknown:2,expiryDays:30}
};
api.operationsSources=async()=>Object.keys(operationsSamples).map((app,i)=>({cid:BigInt(i+1),app,name:app[0].toUpperCase()+app.slice(1),url:'https://'+app+'.example.test'}));
api.operationsSnapshot=async cid=>({schema:1n,state:{ready:null},checkedAt:now(),metrics:Object.entries(Object.values(operationsSamples)[Number(cid)-1]).map(([k,v])=>[k,BigInt(v)])});

// Sample-only shared-screen pairing across preview tabs. No production actor exists.
const displayKey='ks-preview-displays';
const readDisplays=()=>JSON.parse(localStorage.getItem(displayKey)||'{"pending":{},"grants":{},"next":0}');
const writeDisplays=v=>localStorage.setItem(displayKey,JSON.stringify(v));
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const displaySource=cid=>({cid:BigInt(cid),app:Object.keys(operationsSamples)[Number(cid)-1]});
api.operationsDisplayAdmin=async()=>({canManage:true,displays:Object.values(readDisplays().grants).map(g=>({...g,id:BigInt(g.id),createdAt:BigInt(g.createdAt),expiresAt:BigInt(g.expiresAt),active:BigInt(g.expiresAt)>now(),sources:g.cids.map(displaySource)}))});
api.operationsDisplayPair=async(code,keyHash)=>{const data=readDisplays(),expiresAt=now()+600000000000n;data.pending[code]={keyHash,expiresAt:String(expiresAt)};writeDisplays(data);return {ok:expiresAt};};
api.operationsDisplayApprove=async(code,name,cids,days)=>{const d=readDisplays(),p=d.pending[code];if(!p||BigInt(p.expiresAt)<=now())return {missing:null};const id=++d.next;d.grants[p.keyHash]={id,name,cids:cids.map(String),createdAt:String(now()),expiresAt:String(now()+days*86400000000000n)};delete d.pending[code];writeDisplays(d);return {ok:BigInt(id)};};
api.operationsDisplayRevoke=async id=>{const d=readDisplays();for(const[k,g]of Object.entries(d.grants))if(BigInt(g.id)===id)delete d.grants[k];writeDisplays(d);return true;};
api.operationsDisplayState=async secret=>{const hash=await digest(secret),d=readDisplays(),g=d.grants[hash];if(g&&BigInt(g.expiresAt)>now())return {ready:{id:BigInt(g.id),name:g.name,expiresAt:BigInt(g.expiresAt),checkedAt:now(),sources:g.cids.map(displaySource)}};const p=Object.values(d.pending).find(p=>p.keyHash===hash&&BigInt(p.expiresAt)>now());return p?{pending:BigInt(p.expiresAt)}:{ended:null};};
api.operationsDisplaySnapshot=async(secret,cid)=>{const state=await api.operationsDisplayState(secret);if(!state.ready?.sources.some(s=>s.cid===cid))return {schema:1n,state:{denied:null},checkedAt:now(),metrics:[]};const data=await api.operationsSnapshot(cid);return {...data,metrics:data.metrics.filter(([k])=>!['departureReview','offboarding','lifecycleUnverified','handover','sales'].includes(k))};};
api.operationsDisplayForget=async secret=>{const hash=await digest(secret),d=readDisplays();delete d.grants[hash];for(const[k,p]of Object.entries(d.pending))if(p.keyHash===hash)delete d.pending[k];writeDisplays(d);};

// Unsupported edits are refused in this sample preview; no backend actor is created.
api.getFinanceTeam=async()=>({config:{revision:1n,mode:'team',people:['sample-finance'],groups:[7n],apps:[{cid:3n,canisterId:{toText:()=> 'aaaaa-aa'}}]},canManage:true,people:[{id:'sample-finance',name:'Alex Morgan',email:'alex@example.test',active:true,member:true},{id:'sample-employee',name:'Jamie Parker',email:'jamie@example.test',active:true,member:false}],groups:[{id:7n,name:'Accounting'}],apps:[{cid:3n,canisterId:{toText:()=> 'aaaaa-aa'},name:'Assets',enabled:true,recipients:2n}]});
const fixture=new Proxy(api,{get:(o,k)=>k in o?o[k]:async()=>{throw Error('This action is not available in the local sample.')}});
const label=document.createElement('div');label.textContent='LOCAL PREVIEW · Sample data only';label.style.cssText='position:fixed;bottom:10px;right:14px;z-index:300;background:#213d31;color:#fff;padding:7px 12px;border-radius:7px;font:11px system-ui';document.body.append(label);
if(location.hash==='#/tv'){
 document.documentElement.dataset.surface='display';
 window.KebabDisplays.createTV(document.getElementById('tv'),fixture);
}else{
// Synthetic OpenTeam source: only enabled in the local preview, never production.
const ot={id:1n,name:'Example OpenTeam',kind:'openteam',baseUrl:'rrkah-fqaaa-aaaaa-aaaaq-cai',enabled:false,lastSync:[],userCount:0n,activeCount:0n};
const otConfig={includeExternal:false,excludeIds:[]};
Object.assign(api,{
 listConnections:async()=>[ot],listOpenTeamSources:async()=>[{id:1n,config:otConfig,lastSuccess:[]}],
 previewOpenTeamSource:async()=>({ok:true,detail:'Synthetic preview only. No live directory is connected.',token:1n,fetched:25n,created:24n,updated:0n,deactivated:0n,skipped:1n,conflicts:[],rows:people.map(([memberId,name,email])=>({memberId,name,email,action:'Add active person'}))}),
 applyOpenTeamSource:async()=>{ot.enabled=true;ot.userCount=24n;ot.activeCount=24n;return{ok:true,detail:'Local sample enabled'}},
 pauseOpenTeamSource:async()=>{ot.enabled=false;return true},
 setOpenTeamScope:async(_id,_expected,next)=>{Object.assign(otConfig,next);return{ok:true,detail:'Sample scope updated'}}
});
window.__smoke.setBackend(fixture);window.__smoke.setAnon(fixture);window._role='owner';window._setup=await api.getSetup();
await import('../sdk/hub-client.js');
window.eval('youPerson={email:"alex@example.test",displayName:"Alex Morgan"};portalMode="passkey";');
document.getElementById('login').classList.add('hidden');document.getElementById('layout').classList.remove('hidden');
await window.mountConsoleTopbar();await window.refreshConns();if(!window.applyRoute())window.go('dash');

}
