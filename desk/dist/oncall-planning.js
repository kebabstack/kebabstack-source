/** Finite, reviewed planning snapshots. The backend owns publication and access.
 * Recurrences are expanded with IANA timezone rules; never by adding UTC days.
 */
const NS = 1_000_000n;
const formatters = new Map();
function formatter(zone) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-GB', {timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
  return formatters.get(zone);
}
export function localAt(ms, zone) {
  const p=Object.fromEntries(formatter(zone).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function localInstant(local, zone) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw Error('Enter a valid local date and time.');
  const guess=Date.parse(local+'Z');
  if(!Number.isFinite(guess)||new Date(guess).toISOString().slice(0,16)!==local)throw Error('Enter a valid local date and time.');
  const offsets=new Set();
  for(let hours=-48;hours<=48;hours+=6){const sample=guess+hours*3600000;offsets.add(Date.parse(localAt(sample,zone)+'Z')-sample);}
  const candidates=[...offsets].map(offset=>guess-offset).filter(ms=>localAt(ms,zone)===local);
  if(candidates.length!==1)throw Error(`${local.replace('T',' ')} ${candidates.length?'occurs twice':'does not exist'} in ${zone} because of a clock change. Choose another handoff time.`);
  return BigInt(candidates[0])*NS;
}
export function addDays(date, days) {
  const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export function effectivePerson(plan, swaps, index) {
  return swaps.filter(s=>Number(s.shift)===index&&Object.hasOwn(s.state,'accepted')).reduce((_,s)=>s.toPersonId,plan.input.shifts[index].personId);
}
export function generatePlan({projectId,startDate,weeks=4,timezone,handoff='09:00',rotationDays=7,coverage='always',primary=[],backup=[],holidays=[]}) {
  if(!Number.isInteger(weeks)||weeks<1||weeks>12)throw Error('Choose 1–12 weeks.');
  if(![1,7].includes(rotationDays))throw Error('Choose a daily or weekly rotation.');
  if(!['always','weekdays','afterhours'].includes(coverage))throw Error('Choose coverage hours.');
  if(!primary.length||new Set(primary).size!==primary.length||new Set(backup).size!==backup.length)throw Error('Choose each responder once per rotation.');
  timezone=formatter(timezone).resolvedOptions().timeZone;
  if(holidays.length>93||holidays.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||addDays(d,0)!==d))throw Error('Use valid holiday dates as YYYY-MM-DD.');
  const days=weeks*7,startAt=localInstant(startDate+'T'+handoff,timezone),endAt=localInstant(addDays(startDate,days)+'T'+handoff,timezone);
  const layers=backup.length?['Primary','Backup']:['Primary'],windows=[],shifts=[];
  const window=(date,start,end)=>{
    const a=localInstant(date+'T'+start,timezone),b=end==='24:00'?localInstant(addDays(date,1)+'T00:00',timezone):localInstant(date+'T'+end,timezone);
    if(a<endAt&&b>startAt)return{startAt:a<startAt?startAt:a,endAt:b>endAt?endAt:b};
  };
  let coverageWindows=[];
  if(coverage==='always')coverageWindows=[{startAt,endAt}];
  else for(let i=0;i<=days;i++){
    const date=addDays(startDate,i),weekday=new Date(date+'T12:00:00Z').getUTCDay(),working=weekday>=1&&weekday<=5&&!holidays.includes(date);
    const ranges=coverage==='weekdays'?(working?[['08:00','18:00']]:[]):working?[['00:00','08:00'],['18:00','24:00']]:[['00:00','24:00']];
    for(const [a,b]of ranges){const w=window(date,a,b);if(w)coverageWindows.push(w);}
  }
  for(let layer=0;layer<layers.length;layer++){
    const members=layer?backup:primary;
    for(const w of coverageWindows)windows.push({...w,layer:BigInt(layer)});
    for(let i=0;i<days;i+=rotationDays){
      const a=localInstant(addDays(startDate,i)+'T'+handoff,timezone),b=localInstant(addDays(startDate,Math.min(days,i+rotationDays))+'T'+handoff,timezone),personId=members[(i/rotationDays)%members.length];
      for(const w of coverageWindows){const start=a>w.startAt?a:w.startAt,end=b<w.endAt?b:w.endAt;if(start<end)shifts.push({startAt:start,endAt:end,layer:BigInt(layer),personId});}
    }
  }
  if(windows.length>400||shifts.length>400)throw Error('This plan has too many shifts. Choose a shorter planning period.');
  for(let i=0;i<shifts.length;i++)for(let j=0;j<i;j++)if(shifts[i].personId===shifts[j].personId&&shifts[i].startAt<shifts[j].endAt&&shifts[j].startAt<shifts[i].endAt)throw Error('A responder cannot be primary and backup at the same time. Choose separate rotations.');
  return{projectId:BigInt(projectId),startAt,endAt,timezone,layers,windows,shifts,template:`${coverage} · ${rotationDays===7?'weekly':'daily'}`};
}
export function resultValue(result) {
  if(result?.ok)return result.ok;
  const e=result?.err;
  throw Error(e?.invalid||e?.limit||(e&&Object.hasOwn(e,'stale')?'This plan changed. Refresh before continuing.':e&&Object.hasOwn(e,'denied')?'Your Hub account does not have access to this action.':'This record is unavailable. Refresh and try again.'));
}
