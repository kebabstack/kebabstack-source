#!/usr/bin/env node
/** Preserve daily Matomo aggregate reports and their original timezone/definitions. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Crumbs} from '../sdk/client.mjs';
export const methods=['VisitsSummary.get','Actions.get','Actions.getPageUrls','Actions.getEntryPageUrls','Actions.getExitPageUrls','Referrers.getWebsites','Referrers.getCampaigns','UserCountry.getCountry','UserCountry.getCity','DevicesDetection.getType','DevicesDetection.getBrowsers','DevicesDetection.getOs','Resolution.getResolution','Provider.getProvider','Goals.get'];
export function convertMatomo(bundle,site){
 if(bundle.format!=='crumbs-matomo-v1'||!Array.isArray(bundle.reports)||!bundle.source||typeof bundle.source!=='string'||!/^\d+$/.test(String(bundle.idSite))||!bundle.timezone)throw Error('Expected crumbs-matomo-v1 archive with source, idSite, timezone and reports');
 new Intl.DateTimeFormat('en',{timeZone:bundle.timezone});
 if(!/^[\w-]{1,80}$/.test(site))throw Error('Invalid destination website');
 const output=new Map();
 for(const report of bundle.reports){
  if(!methods.includes(report.method)||report.period!=='day'||report.complete!==true)throw Error('Only complete, supported daily reports are accepted');
  const date=report.date,day=Date.parse(date+'T00:00:00Z')/1000;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isSafeInteger(day)||new Date(day*1000).toISOString().slice(0,10)!==date)throw Error('Invalid report date');
  const data=Array.isArray(report.data)?report.data:[report.data];
  for(const row of data){
   if(!row||typeof row!=='object'||row.result==='error'||row.subtable||row.idsubdatatable)throw Error('Error or hierarchical report: export a complete flat report');
   const label=String(row.label??'Total');
   const mappings=report.method==='Actions.getPageUrls'?{visitors:'nb_uniq_visitors',visits:'nb_visits',pageviews:'nb_hits'}:report.method==='Actions.getEntryPageUrls'?{visitors:'entry_nb_uniq_visitors',visits:'entry_nb_visits',bounces:'entry_bounce_count',durationSeconds:'entry_sum_visit_length'}:report.method==='Actions.getExitPageUrls'?{visitors:'exit_nb_uniq_visitors',visits:'exit_nb_visits'}:{visitors:'nb_uniq_visitors',visits:'nb_visits',pageviews:'nb_pageviews',bounces:'bounce_count',durationSeconds:'sum_visit_length',events:'nb_events'};
   const metrics={visitors:'0',visits:'0',pageviews:'0',events:'0',bounces:'0',durationSeconds:'0',engagementMs:'0',scrollDepthSum:'0',scrollSamples:'0',revenue:[]},available=[];
   for(const [target,source]of Object.entries(mappings)){if(row[source]===undefined)continue;if(typeof row[source]==='number'&&!Number.isSafeInteger(row[source]))throw Error('Unsafe numeric metric '+source+'; export an exact integer string');const n=String(row[source]);if(!/^\d+$/.test(n)||BigInt(n)>18446744073709551615n)throw Error('Invalid integer metric '+source);metrics[target]=n;available.push(target);}
   // Keep source metrics, including goals/conversions, without pretending they are native event totals.
   const sourceMetrics=Object.fromEntries(Object.entries(row).filter(([k,v])=>k!=='label'&&(typeof v==='number'||typeof v==='string')).sort(([a],[b])=>a<b?-1:a>b?1:0));
   const value=JSON.stringify({source:'Matomo',origin:bundle.source,idSite:String(bundle.idSite),timezone:bundle.timezone,date,label,available,sourceMetrics});
   if(value.length>2048)throw Error('Historical row exceeds 2048 characters; export narrower source columns');
   const id=createHash('sha256').update(JSON.stringify(['matomo',site,bundle.source,String(bundle.idSite),bundle.timezone,date,report.method,label])).digest('hex');
   const result={id,site,day,dimension:'matomo:'+report.method,value,metrics},old=output.get(id);
   if(old&&JSON.stringify(old)!==JSON.stringify(result))throw Error('Conflicting reports for the same source/day/label');output.set(id,result);
  }
 }
 if(!output.size)throw Error('No historical rows');if(output.size>100000)throw Error('Import exceeds 100000-row backend capacity');return [...output.values()];
}
async function main(){const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];if(!a.includes('--file')||!a.includes('--site'))throw Error('Usage: --file ARCHIVE.json --site SITE [--send]');const rows=convertMatomo(JSON.parse(readFileSync(get('--file'),'utf8')),get('--site'));console.log(JSON.stringify({rows:rows.length,mode:a.includes('--send')?'send':'validation only',notice:'Original Matomo daily labels and timezone; separate from native traffic. Missing metrics are unavailable.'}));if(!a.includes('--send'))return;if(!process.env.CRUMBS_URL||!process.env.CRUMBS_API_TOKEN)throw Error('Set CRUMBS_URL and a manage-scope CRUMBS_API_TOKEN');const client=new Crumbs({baseUrl:process.env.CRUMBS_URL,token:process.env.CRUMBS_API_TOKEN});let batch=[];for(const row of rows){if(batch.length&&(batch.length===100||Buffer.byteLength(JSON.stringify([...batch,row]))>40000)){await client.importAggregates(batch);batch=[];}batch.push(row);}if(batch.length)await client.importAggregates(batch);console.log('Import complete; retries are idempotent and conflicting revisions are rejected.');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
