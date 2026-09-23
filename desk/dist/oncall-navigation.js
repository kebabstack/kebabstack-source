import {escapeHtml as esc} from './message-format.js';
export function projectNavigation(w, active='coverage', action='') {
 const base=`#/oncall/${w.project.id}`;
 const settings=[['project-settings','Project'],['response-settings','Incident response'],['sources','Alert sources'],['reminders','Planning reminders']];
 const configuring=w.canManage&&settings.some(([id])=>id===active);
 const tabs=[['coverage','Coverage',base],['incidents','Incidents',base+'/incidents'],['availability','Time off',base+'/availability'],['status','Status page',base+'/status'],...(w.canManage?[['settings','Settings',base+'/project-settings']]:[['reminders','Reminders',base+'/reminders']])];
 const link=([id,title,url])=>`<a href="${url}" ${id===active||id==='settings'&&configuring?'aria-current="page"':''}>${esc(title)}</a>`;
 return `<nav class="oc-module-nav" aria-label="On-call project">${tabs.map(link).join('')}${action}</nav>${configuring?`<nav class="oc-settings-nav" aria-label="Project settings">${settings.map(([id,title])=>link([id,title,base+'/'+id])).join('')}</nav>`:''}`;
}
