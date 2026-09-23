// Contract tests against every CURRENT committed app interface, not historical mock signatures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { IDL } from '@dfinity/candid';
import { z } from 'zod';
import { didToIdlFactory } from '../lib/did-parse.mjs';
import { argsToCandid } from '../lib/candid-json.mjs';
import { registerTools } from '../lib/tools.mjs';
const cases=[
 ['kebab_my_tickets',{},['desk.myTickets','desk.myApprovals']],
 ['kebab_tickets',{},['desk.listTickets']],['kebab_ticket',{id:'DSK-42'},['desk.getTicket']],
 ['kebab_catalog',{},['desk.catalog']],['kebab_new_request',{requestType:'Help',subject:'Test'},['desk.catalog','desk.createRequest']],
 ['kebab_comment',{id:42,body:'Test'},['desk.comment']],
 ['kebab_devices',{},['assets.listAssets']],['kebab_my_devices',{},['trust.devices']],['kebab_domains',{},['watch.listDomains']],
 ['kebab_ticket_context',{id:42},['desk.personOverview']],['kebab_ticket_context',{id:42,sources:true},['desk.personContextSources']],['kebab_ticket_context',{id:42,source:2},['desk.personContext']],
 ['kebab_customers',{},['desk.listCustomerProjects']],['kebab_customers',{project:1},['desk.listCustomerTypes']],
 ['kebab_oncall',{},['desk.oncallProjects']],['kebab_oncall',{view:'response',id:1},['desk.oncallResponse']],['kebab_oncall',{view:'incident',id:1},['desk.oncallIncident']],['kebab_oncall',{view:'status',id:1},['desk.oncallStatus']],
 ['kebab_reporting',{},['desk.reportingPeriods']],['kebab_reporting',{view:'projects'},['desk.reportingProjects']],['kebab_reporting',{view:'period',id:1},['desk.reportingPeriod']],
 ['kebab_sales',{},['assets.myOffers']],['kebab_sales',{view:'board',phase:'offer'},['assets.salesBoard']],['kebab_sales',{view:'board'},['assets.salesBoard']],
 ['kebab_contracts',{},['contracts.listContracts']],['kebab_forms',{},['forms.listForms']],['kebab_analytics_sites',{},['crumbs.listSites']],
 ['kebab_analytics_report',{site:'example',from:'2026-09-01T00:00:00Z',until:'2026-09-02T00:00:00Z'},['crumbs.report']],
];
for(const [name,input,expected]of cases)test(`${name} ${JSON.stringify(input)} matches the current app contract`,async()=>{
 const called=[];
 const run=async(app,method,args,queryOnly)=>{
  const service=didToIdlFactory(fs.readFileSync(new URL(`../../${app}/backend/backend.did`,import.meta.url),'utf8'))({IDL});
  const f=service._fields.find(([n])=>n===method)?.[1]; assert.ok(f,`${app}.${method} exists`);
  if(queryOnly)assert.ok(f.annotations.includes('query')||f.annotations.includes('composite_query'),`${method} is a query`);
  const typed=argsToCandid(f,['synthetic-session',...args]);IDL.encode(f.argTypes,typed);called.push(`${app}.${method}`);
  if(method==='report'){assert.equal(typed[1].from,1788220800n);assert.equal(typed[1].until,1788307200n);return{ok:{rows:[],truncated:false}};}
  if(method==='salesBoard')assert.equal(typed[1],input.phase==='offer'?'offer':'','all maps to the backend empty phase');
  if(method==='catalog')return[{id:1,name:'Help'}];if(method==='getTicket')return{id:42};
  if(method==='createRequest'||method==='comment')return{ok:true};return[];
 };
 const rt={query:(a,m,args)=>run(a,m,args,true),call:(a,m,args)=>run(a,m,args,false)};
 const tools=new Map();registerTools({registerTool:(n,def,fn)=>tools.set(n,{def,fn})},rt);
 const tool=tools.get(name),result=await tool.fn(z.object(tool.def.inputSchema).parse(input));
 assert.notEqual(result.isError,true,result.content[0].text);assert.deepEqual(called,expected);
});
test('ambiguous or partial request types never file a ticket; explicit backend denials become MCP errors',async()=>{
 let writes=0;
 const rt={query:async()=>[{id:1,name:'Help'},{id:2,name:'Help'}],call:async()=>{writes++;return{ok:false,detail:'not allowed'};}};
 const tools=new Map();registerTools({registerTool:(n,def,fn)=>tools.set(n,{def,fn})},rt);
 const invoke=async(name,args)=>{const t=tools.get(name);return t.fn(z.object(t.def.inputSchema).parse(args));};
 assert.equal((await invoke('kebab_new_request',{requestType:'Help',subject:'Test'})).isError,true);
 assert.equal((await invoke('kebab_new_request',{requestType:'Hel',subject:'Test'})).isError,true);assert.equal(writes,0);
 assert.equal((await invoke('kebab_new_request',{requestType:'1',subject:'Test'})).isError,true);assert.equal(writes,1);
});
