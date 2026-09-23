import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/integrations/looker-studio.gs',import.meta.url),'utf8');
function fixture(){
 const data=new Map(),calls=[];let status=200;
 const fields=()=>{const items=[];const api={newDimension:add,newMetric:add,build:()=>items.map(({id,name})=>({name:id,label:name})),forIds:ids=>{const subset=fields();for(const id of ids){const item=items.find(i=>i.id===id);if(item)subset.items.push(item);}return subset;},asArray:()=>items,items};function add(){const item={setId(id){this.id=id;return this;},setName(name){this.name=name;return this;},setType(){return this;},setAggregation(){return this;},getId(){return this.id;}};items.push(item);return item;}return api;};
 const cc={getFields:fields,FieldType:{YEAR_MONTH_DAY:'date',NUMBER:'number'},AggregationType:{SUM:'sum'},newUserError:()=>({setText(t){this.text=t;return this;},throwException(){throw Error(this.text);}})};
 const context={DataStudioApp:{createCommunityConnector:()=>cc},PropertiesService:{getUserProperties:()=>({getProperty:k=>data.get(k),setProperty:(k,v)=>data.set(k,v),deleteProperty:k=>data.delete(k)})},Utilities:{formatDate:date=>date.toISOString().slice(0,10).replaceAll('-','')},UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});return {getResponseCode:()=>status,getContentText:()=>JSON.stringify({rows:[{value:String(Date.parse('2026-09-20T00:00:00Z')/1000),metrics:{visitors:'7',pageviews:'12'}}],truncated:false})};}}};vm.createContext(context);vm.runInContext(source,context);context.CRUMBS_API_ORIGIN='https://analytics.example.test';return {context,calls,data,setStatus:s=>{status=s;}};
}
test('Data Studio preserves field order, fills dates, fixes key destination and exposes failures',()=>{const {context:c,calls,setStatus}=fixture();assert.equal(c.setCredentials({key:'bad'}).errorCode,'INVALID_CREDENTIALS');assert.equal(c.setCredentials({key:'a'.repeat(64)}).errorCode,'NONE');assert.equal(c.isAuthValid(),true);
 const request={configParams:{origin:'https://attacker.test',site:'main'},dateRange:{startDate:'2026-09-20',endDate:'2026-09-21'},fields:[{name:'pageviews'},{name:'date'}]};const result=c.getData(request);assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[{values:[12,'20260920']},{values:[0,'20260921']}]);assert.equal(calls[0].url,'https://analytics.example.test/api/v1/query');assert.equal(calls[0].options.followRedirects,false);assert.ok(calls[0].options.headers.Authorization.startsWith('Bearer '));assert.equal(JSON.stringify(result).includes('a'.repeat(64)),false);setStatus(403);assert.throws(()=>c.getData(request),/HTTP 403/);c.resetAuth();assert.equal(c.isAuthValid(),false);
});
