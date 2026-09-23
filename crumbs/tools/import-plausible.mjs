#!/usr/bin/env node
/** Import extracted Plausible CSV exports without inventing cross-dimension totals. */
import {readFileSync,readdirSync,existsSync,realpathSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Crumbs} from '../sdk/client.mjs';
export const tables={visitors:[],sources:['source','referrer','utm_source','utm_medium','utm_campaign','utm_content','utm_term'],pages:['hostname','page'],entry_pages:['entry_page'],exit_pages:['exit_page'],custom_events:['name','link_url','path'],locations:['country','region','city'],devices:['device'],browsers:['browser','browser_version'],operating_systems:['operating_system','operating_system_version']};
export function csv(text){
 const rows=[];let row=[],field='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new Error('Unexpected quote in CSV');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x!==''))rows.push(row);row=[];}}
  else{if(closed)throw new Error('Unexpected text after CSV quote');field+=c;}
 }
 if(quoted)throw new Error('Unterminated CSV quote');if(field||closed||row.length){row.push(field);rows.push(row);}return rows;
}
export function convert(filename,text,site){
 const match=/^imported_(.+)_\d{8}_\d{8}\.csv$/.exec(basename(filename));if(!match||!tables[match[1]])throw new Error('Unsupported Plausible CSV filename: '+basename(filename));
 const table=match[1],[header,...records]=csv(text);if(!header||new Set(header).size!==header.length||!header.includes('date'))throw new Error('Invalid CSV header');
 for(const d of tables[table])if(!header.includes(d))throw new Error('Missing CSV column: '+d);
 return records.map(fields=>{
  if(fields.length!==header.length)throw new Error('CSV column count mismatch');const r=Object.fromEntries(header.map((h,i)=>[h,fields[i]]));
  const day=Date.parse(r.date+'T00:00:00Z')/1000;if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isSafeInteger(day)||new Date(day*1000).toISOString().slice(0,10)!==r.date)throw new Error('Invalid date');
  const value=JSON.stringify(Object.fromEntries(tables[table].map(k=>[k,r[k]])));if(value.length>2048)throw new Error('Historical dimension exceeds 2048 characters');
  const n=k=>{const v=r[k]??'0';if(!/^\d+$/.test(v)||BigInt(v)>18446744073709551615n)throw new Error('Invalid metric: '+k);return v;};
  const metrics={visitors:n('visitors'),visits:n(table==='entry_pages'?'entrances':table==='exit_pages'?'exits':'visits'),pageviews:n('pageviews'),events:n('events'),bounces:n('bounces'),durationSeconds:n('visit_duration'),engagementMs:'0',scrollDepthSum:'0',scrollSamples:'0',revenue:[]};
  return {id:createHash('sha256').update(JSON.stringify([site,table,day,value])).digest('hex'),site,day,dimension:'import:'+table,value,metrics};
 });
}
async function main(){
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
 if(!args.includes('--dir')||!args.includes('--site')||get('--timezone')!=='UTC')throw new Error('Usage: node tools/import-plausible.mjs --dir EXTRACTED_CSV_DIRECTORY --site SITE_ID --timezone UTC [--send]. Requires a UTC source export. Set CRUMBS_URL and CRUMBS_API_TOKEN for --send.');
 const dir=resolve(get('--dir')),site=get('--site');if(!/^[\w-]{1,80}$/.test(site))throw new Error('Invalid site ID');
 const rows=[];for(const file of readdirSync(dir).filter(f=>f.endsWith('.csv')).sort())rows.push(...convert(file,readFileSync(resolve(dir,file),'utf8'),site));if(!rows.length)throw new Error('No CSV rows found');
 const unique=new Map();for(const row of rows){const prev=unique.get(row.id);if(prev&&JSON.stringify(prev)!==JSON.stringify(row))throw new Error('Overlapping exports contain different metrics for the same dimensions');unique.set(row.id,row);}
 const data=[...unique.values()];process.stdout.write(JSON.stringify({rows:data.length,firstDay:data.reduce((n,r)=>Math.min(n,r.day),Infinity),lastDay:data.reduce((n,r)=>Math.max(n,r.day),0),tables:[...new Set(data.map(r=>r.dimension))],mode:args.includes('--send')?'send':'validation only'})+'\n');
 if(!args.includes('--send'))return;
 if(!process.env.CRUMBS_URL||!process.env.CRUMBS_API_TOKEN)throw new Error('Set collector URL and a manage-scope API key in the environment');
 const client=new Crumbs({baseUrl:process.env.CRUMBS_URL,token:process.env.CRUMBS_API_TOKEN});
 // Small batches stay below the collector HTTP body bound even with long dimensions.
 let batch=[];for(const row of data){if(batch.length&&Buffer.byteLength(JSON.stringify([...batch,row]))>40000){await client.request('/imports',{method:'POST',body:batch});batch=[];}batch.push(row);if(batch.length===100){await client.request('/imports',{method:'POST',body:batch});batch=[];}}if(batch.length)await client.request('/imports',{method:'POST',body:batch});
 process.stdout.write('Import complete. History remains separate from live statistics.\n');
}
if(process.argv[1]&&existsSync(process.argv[1])&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href)main().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
