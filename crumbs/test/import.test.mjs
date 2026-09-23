import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csv,convert,tables} from '../tools/import-plausible.mjs';
import {api} from '../collector/api.mjs';
import {Crumbs} from '../sdk/client.mjs';
test('Plausible history keeps compound dimensions and decimal precision; overlapping files share IDs',()=>{
 assert.deepEqual(csv('"a","b"\r\n"two, words","a""b\nc"\r\n'),[['a','b'],['two, words','a"b\nc']]);assert.throws(()=>csv('"unterminated'));
 const data='date,browser,browser_version,visitors,visits,visit_duration,bounces,pageviews\n2026-09-01,Firefox,130,9007199254740993,4,90,1,8\n';
 const [a]=convert('imported_browsers_20260901_20260930.csv',data,'main'),[b]=convert('imported_browsers_20260901_20260901.csv',data,'main');assert.equal(a.id,b.id);assert.equal(a.metrics.visitors,'9007199254740993');assert.deepEqual(JSON.parse(a.value),{browser:'Firefox',browser_version:'130'});assert.throws(()=>convert('x.csv',data,'main'));
 for(const [name,dimensions] of Object.entries(tables)){const row=convert('imported_'+name+'_20260901_20260930.csv',['date',...dimensions].join(',')+'\n'+['2026-09-01',...dimensions.map(()=> 'example')].join(',')+'\n','main');assert.equal(row[0].dimension,'import:'+name);}
});
test('REST and typed client normalize Candid variants and paginate exports',async()=>{
 const g={id:'signup',site:'main',name:'Signup',kind:{event:null},value:'Signup'};
 assert.equal((await api({goals:async()=>({ok:[g]})},'GET','/api/v1/goals','valid',null,new URLSearchParams({site:'main'})))[0].kind,'event');
 const requests=[];const client=new Crumbs({baseUrl:'https://analytics.test/',token:'secret',fetch:async(url,options)=>{requests.push([url,options]);const first=!new URL(url).searchParams.get('cursor');return {ok:true,json:async()=>({events:first?[{id:1},{id:2}]:[{id:3}],cursor:first?'next':''})};}});
 const out=[];for await(const row of client.exportEvents('main',{limit:2}))out.push(row.id);assert.deepEqual(out,[1,2,3]);assert.equal(requests[0][1].headers.Authorization,'Bearer secret');assert.match(requests[1][0],/cursor=next/);
});
