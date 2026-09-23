export const first = value => Array.isArray(value) ? value[0] : value;
export const millis = value => Number(value || 0) / 1e6;
// Count affected domains once. Check failures must never become website outages.
export function domainState(row, settings = {}, now = Date.now()) {
  const d=row.domain, checks=first(row.checks)||{}, records=row.records||[], issues=[];
  const expiry=first(row.expiryDays), expiring=expiry!=null && Number(expiry)<=Number(settings.expiryWarnDays||30);
  const issue=(severity,title,action,target,detail)=>issues.push({severity,title,action,target,detail});
  if(records.some(r=>r.status==='dangling')) issue('alert','DNS points to a missing target','Review DNS','recordsCard','Repair or remove the broken target with your DNS provider, then check again.');
  if(records.some(r=>r.status==='nxdomain')) issue('alert','Domain name not found','Review DNS','recordsCard','Check registration and DNS configuration with your provider, then run another check.');
  if(records.some(r=>r.status==='changed'&&!/resolvers unreachable|resolver check unavailable|resolvers disagree/i.test(r.detail))) issue('alert','Unexpected DNS change','Review change','recordsCard','Compare the answers below. Accept a change only after confirming it was intended.');
  if(expiring) issue(Number(expiry)<=7?'alert':'warn',Number(expiry)<0?'Registry expiry date has passed':`Domain expires ${Number(expiry)===0?'today':`in ${Number(expiry)} days`}`,'Review expiry','dMeta','Check renewal with your registrar. Watch does not renew domains.');
  if(records.some(r=>r.status==='unresolved'||/resolvers unreachable|resolver check unavailable/i.test(r.detail))||/^error:/i.test(d.lastResult)) issue('warn','DNS check unavailable','Review check','recordsCard','Watch could not verify current DNS answers. Review the check details and retry.');
  if(records.some(r=>r.status==='disagree'||/resolvers disagree/i.test(r.detail))) issue('warn','DNS answers are still settling','Review answers','recordsCard','The resolvers disagree. Wait for propagation or investigate the conflicting answers.');
  if(millis(d.lastCheck)&&now-millis(d.lastCheck)>Math.max(Number(settings.intervalMins||15)*3,30)*60000) issue('warn','DNS check overdue','Review monitoring','recordsCard','Recent DNS evidence is missing. Run a check and review the check history if the delay continues.');
  if(checks.certificateDetail&&/failed|unavailable|error|retry|trapped|could not/i.test(checks.certificateDetail)) issue('warn','Certificate check unavailable','Review check','protectionCard','The certificate-log check failed. Previous evidence is retained; this does not establish a website outage.');
  else if(millis(checks.certificateAt)&&now-millis(checks.certificateAt)>48*3600000) issue('warn','Certificate evidence is overdue','Review checks','protectionCard','The last successful certificate-log check is more than two days old.');
  if(checks.certificateEnds&&!issues.some(i=>/Certificate/.test(i.title))&&Math.ceil((Date.parse(checks.certificateEnds+'T00:00:00Z')-now)/86400000)<=14) issue('warn','Logged certificate is near or past expiry','Review certificate','protectionCard','Verify the certificate served by your website. This date comes from public logs.');
  if(millis(checks.postureAt)&&now-millis(checks.postureAt)>48*3600000) issue('warn','Security checks are overdue','Review checks','protectionCard','Daily security evidence is more than two days old.');
  if(['weak','missing'].includes(row.grade)) issue('warn','Security checks need attention','Review security','protectionCard','Review mail policies, registrar lock and the other findings below.');
  if(Number(checks.lookalikes)) issue('warn','Similar domain names found','Review names','protectionCard','Check whether these registered names belong to you or need investigation.');
  const pending=!millis(d.lastCheck)||!records.length||records.some(r=>r.status==='baseline')||records.length<d.types.length;
  if(!pending&&(!millis(checks.postureAt)||!millis(checks.certificateAt))&&!issues.length) issue('pending','Daily checks pending','View checks','protectionCard','DNS has been checked. Daily security and certificate evidence is still being collected.');
  const state=!d.enabled?'paused':issues.some(i=>i.severity==='alert')?'alert':issues.some(i=>i.severity==='warn')?'warn':pending||issues.length?'pending':'ok';
  return {state,issues,expiring:!!d.enabled&&expiring,attention:!!d.enabled&&['alert','warn'].includes(state),title:!d.enabled?'Monitoring paused':issues[0]?.title||(pending?'First DNS check pending':'No current findings'),label:{paused:'Paused',pending:'Pending',alert:'Action needed',warn:'Needs review',ok:'Checks clear'}[state]};
}
export function domainCounts(rows,settings,now){return rows.reduce((c,r)=>{const s=domainState(r,settings,now);c.all++;c.attention+=Number(s.attention);c.expiring+=Number(s.expiring);c.paused+=Number(!r.domain.enabled);return c;},{all:0,attention:0,expiring:0,paused:0});}
export const eventCategory=k=>['changed','dangling','expiry','error','posture','cert','lookalike'].includes(k)?'attention':['accepted','resolved','improved','learned'].includes(k)?'decisions':'other';
// Only consecutive identical failures coalesce; recovery and decisions remain visible.
export function groupEvents(rows){const out=[];for(const row of rows){const e=row.event,last=out.at(-1);if(last&&e.kind==='error'&&last.event.kind==='error'&&String(e.domainId)===String(last.event.domainId)&&e.rtype===last.event.rtype&&e.detail===last.event.detail){last.count++;last.firstAt=e.at;}else out.push({...row,count:1,firstAt:e.at});}return out;}
