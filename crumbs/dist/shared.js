import {idlFactory} from './idl.js';
import {HttpAgent,Actor} from './agent-bundle.js';
import {metricCards,chart,table} from './view.js';
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const params=new URLSearchParams(location.hash.slice(1)),token=params.get('key')??'',site=params.get('site')??'';
history.replaceState(null,'',location.pathname);
const $=id=>document.getElementById(id);
async function load(){try{if(!site||!token)throw new Error('Open the original shared link to view this report.');const agent=await HttpAgent.create({host:'https://icp0.io'}),actor=Actor.createActor(idlFactory,{agent,canisterId:BACKEND_CANISTER_ID}),until=BigInt(Math.floor(Date.now()/1000)+1),from=until-30n*86400n;const request={site,from,until,dimension:'',filters:[],limit:100n};const results=await Promise.all(['','day','path','source'].map(dimension=>actor.report(token,{...request,dimension})));if(results.some(r=>'err'in r))throw new Error('This report is unavailable, expired or revoked.');$('notice').hidden=true;$('content').hidden=false;const [total,days,pages,sources]=results.map(r=>r.ok);$('metrics').innerHTML=metricCards(total.totals);$('chart').innerHTML=chart(days.rows,Number(from),Number(until));$('pages').innerHTML=table(pages.rows,'path').replaceAll('<button','<div').replaceAll('</button>','</div>');$('sources').innerHTML=table(sources.rows,'source').replaceAll('<button','<div').replaceAll('</button>','</div>');}catch(e){$('content').hidden=true;$('notice').hidden=false;$('notice').textContent=e.message;}}
void load();setInterval(()=>{if(!document.hidden)void load();},30000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)$('content').hidden=true;else void load();});
