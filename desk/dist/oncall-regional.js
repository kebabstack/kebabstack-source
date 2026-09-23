import {localInstant,addDays} from './oncall-planning.js';
const minute=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const merge=ranges=>ranges.sort((a,b)=>a.startAt<b.startAt?-1:1).reduce((out,r)=>{const last=out.at(-1);if(last&&last.endAt>=r.startAt)last.endAt=last.endAt>r.endAt?last.endAt:r.endAt;else out.push({...r});return out;},[]);
/** Regional rules are a reusable authoring recipe, never a live recurrence.
 * Ordered regional ownership becomes reviewed UTC intervals shared by response/payroll.
 */
export function generateRegionalPlan(projectId,recipe){
 const {startDate,timezone,regions}=recipe,weeks=Number(recipe.weeks),rotationDays=Number(recipe.rotationDays);
 if(!Number.isInteger(weeks)||weeks<1||weeks>12||![1,7].includes(rotationDays)||regions.length<1||regions.length>3)throw Error('Choose 1–3 regions and 1–12 weeks.');
 const startAt=localInstant(startDate+'T00:00',timezone),endAt=localInstant(addDays(startDate,weeks*7)+'T00:00',timezone),continuous=Object.hasOwn(recipe.requirement,'continuous'),raw=[[],[]];
 for(const [priority,r]of regions.entries()){
  const start=Number(r.startMinute),end=Number(r.endMinute),days=r.days.map(Number),holidaySet=new Set(r.holidays);
  if(!r.name.trim()||r.name.length>40||!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>=1440||end<0||end>1440||start===end||!days.length||days.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('Each region needs a name, valid hours and working days.');
  if(r.holidays.length>93||r.holidays.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||addDays(d,0)!==d))throw Error('Use real holiday dates as YYYY-MM-DD.');
  if(!r.primary.length||r.primary.length>50||r.backup.length>50||[r.primary,r.backup].some(xs=>xs.some(x=>!x)||new Set(xs).size!==xs.length))throw Error('Choose each responder once per regional rotation.');
  if(!Object.hasOwn(r.backupMode,'none')&&!r.backup.length)throw Error('Choose a backup rotation or select No backup.');
  const interval=(date)=>{const a=localInstant(date+'T'+minute(start),r.timezone),b=localInstant((end<=start||end===1440?addDays(date,1):date)+'T'+minute(end===1440?0:end),r.timezone);return{startAt:a<startAt?startAt:a,endAt:b>endAt?endAt:b};};
  // Include adjacent local dates: offsets may cross the reference calendar boundary.
  for(let i=-2;i<=weeks*7+2;i++){
   const day=addDays(startDate,i),weekday=new Date(day+'T12:00Z').getUTCDay(),holiday=holidaySet.has(day),working=days.includes(weekday)&&!holiday,w=interval(day);
   if(w.endAt<=w.startAt)continue;
   const tick=Math.floor(i/rotationDays),pick=members=>members[((tick%members.length)+members.length)%members.length];
   if(working)raw[0].push({...w,personId:pick(r.primary),priority});
   if(Object.hasOwn(r.backupMode,'always')&&working||Object.hasOwn(r.backupMode,'nonworking')&&(weekday===0||weekday===6||holiday))raw[1].push({...w,personId:pick(r.backup),priority});
  }
 }
 const hasBackup=regions.some(r=>!Object.hasOwn(r.backupMode,'none')),layers=hasBackup?['Primary','Backup']:['Primary'],shifts=[],windows=[],hours=regions.map(()=>0),overlapHours=regions.map(()=>0);
 for(let layer=0;layer<layers.length;layer++){
  const source=raw[layer],points=[...new Set(source.flatMap(s=>[s.startAt,s.endAt]))].sort((a,b)=>a<b?-1:1),owned=[];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],choices=source.filter(s=>s.startAt<=a&&s.endAt>=b).sort((a,b)=>a.priority-b.priority);if(!choices.length)continue;
   const first=choices[0],last=owned.at(-1);if(last&&last.endAt===a&&last.personId===first.personId&&last.priority===first.priority)last.endAt=b;else owned.push({startAt:a,endAt:b,personId:first.personId,priority:first.priority});
   if(layer===0){hours[first.priority]+=Number(b-a)/3.6e12;for(const choice of choices.slice(1))overlapHours[choice.priority]+=Number(b-a)/3.6e12;}
  }
  const required=layer===0&&continuous?[{startAt,endAt}]:merge(source.map(s=>({startAt:s.startAt,endAt:s.endAt})));
  windows.push(...required.map(w=>({...w,layer:BigInt(layer)})));shifts.push(...owned.map(({priority,...s})=>({...s,layer:BigInt(layer)})));
 }
 if(!windows.length)throw Error('These rules produce no required coverage. Change the dates or coverage days.');
 if(windows.length>400||shifts.length>400)throw Error('Choose a shorter period; this plan exceeds 400 intervals.');
 for(let i=0;i<shifts.length;i++)for(let j=0;j<i;j++)if(shifts[i].personId===shifts[j].personId&&shifts[i].startAt<shifts[j].endAt&&shifts[j].startAt<shifts[i].endAt)throw Error('One person would cover primary and backup simultaneously. Adjust the rotations.');
 const missingHours=continuous?Number(endAt-startAt)/3.6e12-hours.reduce((a,b)=>a+b,0):0;
 return{input:{projectId:BigInt(projectId),startAt,endAt,timezone,layers,windows,shifts,template:'Regional · '+(rotationDays===7?'weekly':'daily')},summary:{hours,overlapHours,missingHours}};
}
export function continueRegionalRecipe(recipe,startDate){
 const days=Math.round((Date.parse(startDate+'T12:00Z')-Date.parse(recipe.startDate+'T12:00Z'))/86400000),turns=Math.floor(days/Number(recipe.rotationDays));
 const rotate=xs=>xs.length?[...xs.slice(((turns%xs.length)+xs.length)%xs.length),...xs.slice(0,((turns%xs.length)+xs.length)%xs.length)]:[];
 return{...recipe,startDate,regions:recipe.regions.map(r=>({...r,primary:rotate(r.primary),backup:rotate(r.backup),holidays:r.holidays.filter(d=>d>=startDate)}))};
}
