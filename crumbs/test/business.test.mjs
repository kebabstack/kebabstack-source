import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchSearchReport,safeSearchText,searchPath,authorize} from '../dist/search-console.js';
import {csvCell} from '../dist/business.js';
test('Search Console uses independent totals, exact property, opt-in terms and merged sanitized pages',async()=>{
 const calls=[],args={token:'not-stored',site:{id:'main',domain:'example.test'},connection:{property:'sc-domain:example.test'},from:1790035200n,until:1790121600n};
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body,init});return {ok:true,json:async()=>({rows:body.dimensions[0]==='page'?[{keys:['https://example.test/pricing?a=1'],clicks:2,impressions:10,position:2},{keys:['https://example.test/pricing?a=2'],clicks:3,impressions:30,position:6},{keys:['https://other.test/'],clicks:5,impressions:10,position:1}]:body.dimensions[0]==='query'?[{keys:['safe search'],clicks:2,impressions:5,position:1},{keys:['alice@example.test'],clicks:5,impressions:7,position:1}]:[{clicks:100,impressions:1000,position:9}]})};};
 const r=await fetchSearchReport({...args,fetcher});assert.equal(calls.length,2);assert.match(calls[0].url,/sc-domain%3Aexample.test\/searchAnalytics\/query$/);assert.equal(r.totals.clicks,100n);assert.deepEqual(r.queries,[]);assert.deepEqual(r.pages,[{value:'/pricing',clicks:5n,impressions:40n,positionMilli:5000n}]);assert.equal(JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v).includes('not-stored'),false);
 const withQueries=await fetchSearchReport({...args,fetcher,includeQueries:true});assert.equal(withQueries.queries.length,1);assert.equal(withQueries.queries[0].value,'safe search');
 assert.equal(safeSearchText('somebody@example.test'),'(redacted)');assert.equal(searchPath('https://example.test/123456?secret=1','example.test'),'/:id');
 await assert.rejects(fetchSearchReport({...args,fetcher:async()=>({ok:false,status:403})}),/Verify this property/);
});
test('CSV cells cannot start spreadsheet formulas and quotes remain escaped',()=>{assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(csvCell('normal'),'"normal"');assert.ok(csvCell('  =1+1').startsWith("\"'"));});

test('Google popup is requested synchronously on the explicit continue click',async()=>{let opened=false;globalThis.window={google:{accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:()=>{opened=true;assert.equal(config.include_granted_scopes,false);config.callback({access_token:'ephemeral'});}})}}}};try{const pending=authorize('client');assert.equal(opened,true);assert.equal(await pending,'ephemeral');}finally{delete globalThis.window;}});
