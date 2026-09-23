import { paintCustomerWorkflow } from './customer-workflows.js';
import { ticketPrivacy } from './customer-privacy.js';
import { createPersonContext } from './person-context.js';
import { escapeHtml as esc, formatMessage, plainMessage, readableSubject } from './message-format.js';

const opt = x => x?.length ? x[0] : null;
const ms = ns => Number(BigInt(ns) / 1000000n);
const date = ns => new Date(ms(ns)).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const initials = name => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
export const statusLabel = t => t.status === 'waiting' ? ({requester: 'Waiting for your reply', 'third-party': 'Waiting for a partner', approval: 'Awaiting approval'}[t.waitingOn] || 'Waiting') : ({new: 'Received', open: 'In progress', resolved: 'Resolved', closed: 'Closed'}[t.status] || t.status);
export const typeLabel = value => ({'Question / how do I…': 'Question or advice', 'Question / how do I...': 'Question or advice'}[value] || value);
export const statusPill = (t, staff = false) => `<span class="pill s-${esc(t.status)}">${esc(staff && t.status === 'waiting' && t.waitingOn === 'requester' ? 'Waiting for requester' : statusLabel(t))}</span>`;

export function createTicketView({ profilePictures, $, getBackend, getMe, session, loadAgents, renderFields, collectFields, setStatus }) {
  let current = null, activeId = null, generation = 0, pending = 0, loading = false, kind = 'comment', aiSuggestion = null;
  let checklistOpen = false, customerSignature = "", privacySignature = "";
  let agents = []; const drafts = new Map(), dirty = new Set();
  const api = () => getBackend();
  const personContext = createPersonContext({root: $("tPersonContext"), lifecycleRoot: $("tLifecycle"), api, getMe, session, reload: id => load(id)});
  const same = id => activeId === String(id) && !!getMe();
  const draftKey = (id, mode = kind) => `${getMe()?.id}:${id}:${mode}`;
  const forget = id => { for(const key of drafts.keys())if(key.startsWith(`${getMe()?.id}:${id}:`))drafts.delete(key); };
  const clearTicketData = () => { paintCustomerWorkflow({el:$('tWorkflow'),value:null}); $('cBody').value=''; for(const id of ['tWorkflow','tCustomer','tSubject','tBody','tTimeline','tActivity','tAuthor','tAuthorAvatar','tFieldsView','tRequester','tTasks','tLinks','tFiles','tApproval'])$(id)?.replaceChildren(); for(const input of $('tWrap').querySelectorAll('input,textarea'))input.value=''; };
  const remember = () => { if (activeId) drafts.set(draftKey(activeId), $('cBody').value); };
  const html = (id, value) => { const el = $(id); if (el.innerHTML !== value) el.innerHTML = value; };
  const toggle = (id, show) => $(id).classList.toggle('hidden', !show);
  const error = e => typeof e === 'string' ? e : 'The connection was interrupted. Your changes have not been confirmed. Please try again.';
  const nameOf = pid => {
    if (!pid || pid === 'system') return 'Desk';
    if (pid === 'ai') return 'AI assistant';
    if (pid === current?.ticket.requester && opt(current?.customer)) return opt(current.customer).name;
    const person = current?.people?.find(p => p.id === pid || p.email === pid) || (current?.requester?.id === pid ? current.requester : null) || agents.find(p => p.id === pid || p.email === pid) || (getMe()?.id === pid ? getMe() : null);
    return person?.displayName || person?.email || (pid.startsWith('slack:') ? 'Slack member' : pid.startsWith('legacy:') ? pid.slice(7) : pid.startsWith('p_') ? 'Former colleague' : pid);
  };
  const setControl = (id, value) => { if (!dirty.has(id) && document.activeElement !== $(id)) $(id).value = value; };
  const sync = (text, stale = false) => { $('tSync').textContent = text; $('tSync').dataset.stale = String(stale); $('tSync').title = 'Checks for new replies every 7 seconds while this page is visible.'; };
  function nextStep(t, staff) {
    if (t.status === 'resolved' || t.status === 'closed') return ['All sorted.', 'This request has been resolved. If you need more help, you can reopen the conversation.', '✓'];
    if (t.waitingOn === 'approval' && t.status === 'waiting') return ['A decision is needed.', staff ? 'Review the approval below before continuing with this request.' : 'Your request is waiting for approval. We’ll keep you updated here.', '◷'];
    if (t.waitingOn === 'requester' && t.status === 'waiting') return [staff ? 'Waiting for the requester.' : 'Your team needs a little more information.', staff ? 'The next step is with the requester. Their reply will appear in the conversation.' : 'Reply below so your IT team can keep things moving.', '↩'];
    if (t.waitingOn === 'third-party' && t.status === 'waiting') return ['Waiting for a partner.', staff ? 'Keep the requester updated while you follow up with the partner.' : 'Your IT team is following up with an external partner.', '◷'];
    if (staff) return [t.assignee ? 'Ready for the next step.' : 'This request needs an owner.', t.assignee ? 'Review the conversation, send an update or resolve the request when the work is complete.' : 'Assign it to yourself or a teammate, then follow up with the requester.', '→'];
    return [t.status === 'new' ? 'Your request is with the IT team.' : 'Your IT team is on it.', 'Add anything that might help below. Updates and replies will appear in this conversation.', '✓'];
  }
  const reviewPending = () => ['review','reactivated'].includes(Object.keys(opt(current?.lifecycle)?.state || {})[0]);
  function paintComposer() {
    const staff = !!current?.canAct;
    if (!staff) kind = 'comment';
    else if (current?.internal) kind = 'note';
    $('cSeg').querySelector('[data-k=comment]').classList.toggle('hidden',staff && !!current?.internal);
    $('tComposer').dataset.kind = kind;
    $('cSeg').querySelectorAll('button[data-k]').forEach(b => { b.classList.toggle('active', b.dataset.k === kind); b.setAttribute('aria-pressed', String(b.dataset.k === kind)); });
    toggle('cNoteBtn', staff); toggle('aiBtns', staff && getMe()?.aiOn && !opt(current?.customer)); toggle('cAttach', kind !== 'note' && !opt(current?.customer));
    $('cHint').textContent = kind === 'note' ? 'Only your support team can see this note. Attachments are public, so they are unavailable here.' : staff ? (opt(current?.slack) ? 'Public reply · visible to the requester and shared with the Slack thread.' : (opt(current?.customer) ? 'Visible in the customer’s private ticket link. No email is sent.' : 'Public reply · visible to the requester.')) : (opt(current?.slack) ? 'Reply to your IT team here or in the Slack thread.' : 'Reply directly to your IT team.');
    $('cBody').maxLength = opt(current?.customer) && kind === 'comment' ? 2000 : 20000;
    $('cBody').placeholder = kind === 'note' ? 'Add context for your teammates…' : staff ? 'Write a clear, helpful reply…' : 'Add an update or ask a question…';
    $('cSend').textContent = kind === 'note' ? 'Save internal note' : 'Send reply ↗';
    $('cDraftState').textContent = $('cBody').value ? 'Draft kept while navigating' : '';
  }
  function reconcileEvents(events) {
    const root = $('tTimeline'), wanted = new Set(events.map(e => String(e.id)));
    for (const child of [...root.children]) if (!wanted.has(child.dataset.eventId)) child.remove();
    events.forEach((event, index) => {
      const id = String(event.id), internal = ['note', 'ai'].includes(event.kind);
      const who = event.kind === 'ai' ? 'AI assistant' : nameOf(event.who);
      const mode = event.kind === 'note' ? 'note' : event.kind === 'ai' ? 'ai' : event.actorKind === 'agent' ? 'agent' : '';
      const badge = internal ? 'Internal · support team only' : event.kind === 'file' ? 'Attachment' : event.actorKind === 'agent' ? 'IT support' : '';
      const content = `<div class="message-heading"><div class="avatar" data-avatar-person="${esc(event.who)}">${esc(event.kind === 'ai' ? '✦' : initials(who))}</div><div><span class="who">${esc(who)}</span>${badge ? `<span class="message-badges"><span class="pill">${badge}</span></span>` : ''}</div><time class="when" datetime="${new Date(ms(event.at)).toISOString()}">${date(event.at)}</time></div>${event.kind === 'ai' ? `<details><summary>AI working notes</summary><div class="rich-text">${formatMessage(event.body)}</div></details>` : `<div class="rich-text">${formatMessage(event.body)}</div>`}`;
      let node = [...root.children].find(n => n.dataset.eventId === id);
      if (!node) { node = document.createElement('article'); node.dataset.eventId = id; }
      node.className = `ev ${mode}`;
      if (node._rendered !== content) { const opened = node.querySelector('details')?.open; node.innerHTML = content; if (opened && node.querySelector('details')) node.querySelector('details').open = true; node._rendered = content; }
      if (root.children[index] !== node) root.insertBefore(node, root.children[index] || null);
    });
  }
  function paint(full, fresh) {
    const t = full.ticket, r = full.row, staff = full.canAct, me = getMe();
    const mayWrite = staff || t.requester === me.id;
    if (!staff && kind === 'note') { drafts.delete(draftKey(t.id,'note')); kind = 'comment'; $('cBody').value = drafts.get(draftKey(t.id,'comment')) || ''; }
    current = full;
    $('v-ticket').dataset.role = staff ? 'agent' : 'requester';
    $('tKey').textContent = t.key;
    $('tSubject').textContent = readableSubject(t.subject, t.body);
    $('tType').textContent = typeLabel(r.typeName);
    $('tReplyJump').textContent = full.internal && staff ? 'Add note ↓' : 'Reply ↓';
    toggle('tEditBtn', mayWrite); toggle('tReplyJump', mayWrite); toggle('tComposer', mayWrite);
    html('tMeta', `${statusPill(t, staff)}<span class="separator">·</span><span>Created ${date(t.createdAt)}</span>${staff ? `<span class="separator">·</span><span>${esc(t.priority[0].toUpperCase() + t.priority.slice(1))} priority</span>` : ''}`);
    const via = opt(full.slack);
    $('tOrigin').textContent = opt(full.customer) ? `Customer support · ${opt(full.customer).projectName}` : via ? `Slack${via.channelName ? ' · #' + via.channelName : ''}` : t.channel === 'directory' ? 'Directory follow-up' : 'Support portal';
    $('tAuthor').textContent = opt(full.customer)?.name || full.requester.displayName || full.requester.email || 'Requester';
    $('tAuthorAvatar').textContent = initials($('tAuthor').textContent); $('tAuthorAvatar').dataset.avatarPerson = full.requester.id; delete $('tAuthorAvatar').dataset.avatarFallback;
    $('tCreated').textContent = date(t.createdAt);
    html('tBody', formatMessage(t.body || 'No description was provided.'));
    const defs = opt(full.requestType)?.fields || [];
    html('tFieldsView', t.fields.filter(([,v]) => v).map(([k,v]) => `<div>${esc(defs.find(d => d.key === k)?.title || k)}</div><div>${esc(defs.find(d => d.key === k)?.kind === 'person' ? nameOf(v) : v)}</div>`).join(''));
    const paused = staff && reviewPending();
    const workflow=opt(full.customerWorkflow);
    toggle('tNextStep', !paused && !workflow);
    paintCustomerWorkflow({el:$('tWorkflow'),value:workflow,act:(button,kind,revision,...args)=>{if(kind==='check')delete $('tWorkflow').dataset.signature;return action(button,'workflowStatus',id=>kind==='check'?api().checkCustomerStep(session.load(),id,revision,...args):api().moveCustomerStep(session.load(),id,revision,kind,...args));}});
    const [title, text, icon] = nextStep(t, staff);
    $('tStepTitle').textContent = title; $('tStepText').textContent = text; $('tStepIcon').textContent = icon; $('tNextStep').dataset.state = t.status;
    const active = !['resolved','closed'].includes(t.status);
    html('tStatusBtns', mayWrite && !paused && !workflow ? `<button data-s="${active ? 'resolved' : 'open'}" data-w="">${active ? (staff ? 'Resolve request' : 'Mark as solved') : 'Reopen request'}</button>` : '');
    toggle('tActions', staff); toggle('tStaff', staff); toggle('tSupportCard', !staff); toggle('tRequesterCard', false);
    if (staff) {
      const states = [['new','Received'],['open','In progress'],['waiting:requester','Waiting for requester'],['waiting:third-party','Waiting for a partner'],['resolved','Resolved'],['closed','Closed']];
      if (t.waitingOn === 'approval') states.push(['waiting:approval','Awaiting approval']);
      html('tState', states.map(([v,l]) => `<option value="${v}"${v === 'new' || v === 'waiting:approval' || ((paused||workflow) && ['resolved','closed'].includes(v)) ? ' disabled' : ''}>${l}</option>`).join(''));
      $('tState').disabled=!!workflow?.run.outcome;
      setControl('tState', t.status === 'waiting' ? `waiting:${t.waitingOn}` : t.status);
      const choices = agents.map(a => `<option value="${esc(a.email)}">${esc(a.displayName)}${a.id === me.id ? ' (you)' : ''}</option>`);
      if (t.assignee && !agents.some(a => a.id === t.assignee)) choices.push(`<option value="${esc(r.assigneeEmail || t.assignee)}">${esc(r.assigneeName || nameOf(t.assignee))}</option>`);
      html('tAssignee', '<option value="">Not assigned</option>' + choices.join(''));
      setControl('tAssignee', agents.find(a => a.id === t.assignee)?.email || r.assigneeEmail || '');
      toggle('tAssignMe', t.assignee !== me.id);
      setControl('tQueue', t.queue); setControl('tPriority', t.priority);
      setControl('tDue', opt(t.dueAt) ? new Date(ms(opt(t.dueAt))).toISOString().slice(0,10) : '');
    }
    $('tQueue').disabled = !!opt(full.customer); $('tQueueSave').disabled = !!opt(full.customer);
    const customer = opt(full.customer);
    if ($('tCustomer')) {
      toggle('tCustomer', !!customer);
      const signature = customer ? JSON.stringify([String(t.id), customer.projectName, customer.name, customer.email]) : "";
      if(customer && signature !== customerSignature) {
        customerSignature = signature; privacySignature = "";
        html('tCustomer', `<span class="eyebrow">${esc(customer.projectName)}</span><h3>${esc(customer.name)}</h3><p>${esc(customer.email)}</p><p class="kv">Customer-provided email · not verified</p><details><summary>Private ticket link</summary><p class="kv">Anyone with the link can read and reply. Replacing it revokes the old link.</p><button id="tCustomerLink">Create replacement link</button> <button id="tCustomerRevoke">Revoke link</button><div id="tCustomerLinkResult" role="status"></div></details><div id="tCustomerPrivacy"></div>`);
        for (const [buttonId,revoke] of [['tCustomerLink',false],['tCustomerRevoke',true]]) $(buttonId).onclick = async e => {
          const button=e.currentTarget, selected=String(t.id), stamp=generation; pending++; $("tCustomerLink").disabled=true; $("tCustomerRevoke").disabled=true;
          try{const result=await api().customerTicketLink(session.load(),t.id,revoke);if(stamp!==generation||!same(selected))return;const target=$('tCustomerLinkResult');target.textContent=result.detail;if(result.ok&&result.url){const input=document.createElement('input');input.type="text";input.readOnly=true;input.value=result.url;input.setAttribute('aria-label','New private ticket link');target.append(input);input.select();}}catch{if(same(selected))$('tCustomerLinkResult').textContent='Could not confirm the change. Please retry.';}finally{pending--;button.disabled=false;if(same(selected)){if($('tCustomerLink'))$('tCustomerLink').disabled=false;if($('tCustomerRevoke'))$('tCustomerRevoke').disabled=false;}}
        };
      }
    }
    const support = r.assigneeName || 'Your IT team';
    html('tSupport', `<div class="support-person"><div class="avatar" data-avatar-person="${esc(t.assignee)}">${r.assigneeName ? esc(initials(support)) : '✳'}</div><div><strong>${esc(support)}</strong><span>${r.assigneeName ? 'Your point of contact' : 'Here to help'}</span></div></div>`);
    const person = full.requester;
    html('tRequester', `<div class="profile-top"><div class="avatar" data-avatar-person="${esc(person.id)}">${esc(initials(person.displayName))}</div><div><strong>${esc(person.displayName)}</strong><a href="mailto:${esc(person.email)}">${esc(person.email)}</a></div></div><div class="profile-grid">${[['Role',person.title],['Department',person.department],['Location',person.location],['Manager',person.manager]].filter(([,v]) => v).map(([l,v]) => `<div><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div>${person.known && !person.active ? '<span class="pill off">Deactivated account</span>' : ''}`);
    const visibleEvents = [...full.events].sort((a,b) => a.at < b.at ? -1 : a.at > b.at ? 1 : Number(a.id) - Number(b.id));
    const messages = visibleEvents.filter(e => ['comment','note','ai','file'].includes(e.kind) && (staff || !['note','ai'].includes(e.kind)));
    reconcileEvents(messages);
    $('tCommentCount').textContent = String(messages.filter(e => e.kind === 'comment').length);
    const activity = visibleEvents.filter(e => !['comment','note','ai','file'].includes(e.kind));
    toggle('tActivityCard', activity.length > 0); $('tActivityCount').textContent = `(${activity.length})`;
    const labels = {created:'Request created',status:'Status updated',assign:'Assignment updated',queue:'Support team updated',priority:'Priority updated',field:'Request information updated',task:'Checklist updated',link:'Related link updated',approval:'Approval updated',lifecycle:'Directory follow-up'};
    html('tActivity', activity.map(e => `<div class="activity-event"><span><strong>${esc(labels[e.kind] || e.kind)}</strong> · ${esc(nameOf(e.who))}${e.kind !== 'created' && e.body ? `<br>${esc(plainMessage(e.body))}` : ''}</span><time>${date(e.at)}</time></div>`).join(''));
    const tasks = staff ? full.tasks : [];
    toggle('tTasksCard', staff && (tasks.length > 0 || checklistOpen)); toggle('tTaskAdd', staff); toggle('tAddChecklist', staff && !tasks.length && !checklistOpen);
    $('tTaskCount').textContent = `${tasks.filter(t => t.state === 'done').length} of ${tasks.length}`;
    html('tTasks', tasks.map((task,index) => `<div class="task ${esc(task.state)}"><span class="t">${esc(task.title)}${task.by === "system:assets" ? '<small class="kv"> · checked in Assets</small>' : ""}</span><select data-task="${index}"${task.by === "system:assets" ? ' disabled title="Updated automatically from Assets"' : paused ? ' disabled title="Review the directory change first"' : ''} aria-label="Status of ${esc(task.title)}"><option value="open"${task.state === 'open' ? ' selected' : ''}>To do</option><option value="done"${task.state === 'done' ? ' selected' : ''}>Done</option><option value="na"${task.state === 'na' ? ' selected' : ''}>Not needed</option></select></div>`).join(''));
    if(customer && $('tCustomerPrivacy')) {
      const sig=JSON.stringify([String(t.id),String(t.updatedAt),String(customer.deleteAt),customer.hold,full.role||getMe()?.role,Number(opt(customer.hold)?.until||0)>Date.now()*1e6],(_,v)=>typeof v==='bigint'?String(v):v);
      if(sig!==privacySignature){privacySignature=sig;const selected=String(t.id),privacyRoot=$('tCustomerPrivacy');
        ticketPrivacy({el:privacyRoot,customer,ticket:t,api,token:()=>session.load(),admin:full.role==='admin',active:()=>same(selected)&&privacyRoot.isConnected&&$('tCustomerPrivacy')===privacyRoot&&!!opt(current?.customer)&&getMe()?.role==='admin',reload:async()=>{privacySignature='';await refresh();},onErase:()=>{forget(selected);clearTicketData();current=null;customerSignature='';privacySignature='';$('tCustomer').replaceChildren();toggle('tWrap',false);location.hash='#/customers/'+customer.projectId;}});
      }
    }
    toggle('tFieldsCard', staff && defs.length > 0 && !opt(full.customer));
    toggle('tLinksCard', staff || t.links.length > 0); toggle('tLinkAdd', staff);
    html('tLinks', t.links.map(([k,v]) => `<div><span class="pill">${esc(k)}</span> ${/^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v)}${staff ? ` <button class="icon-button" data-k="${esc(k)}" data-v="${esc(v)}" aria-label="Remove link ${esc(v)}">×</button>` : ''}</div>`).join(''));
    toggle('tFilesCard', full.files.length > 0);
    html('tFiles', full.files.map(f => `<div><a href="#" data-f="${f.id}">${esc(f.name)}</a><span class="rowsub">${Math.max(1,Math.round(Number(f.size)/1024))} KB · ${esc(nameOf(f.by))}</span></div>`).join(''));
    const ap = opt(full.approval);
    toggle('tApproval', !!ap);
    if (ap) {
      const approver = ap.approver.startsWith('group:') ? ap.approver.slice(6) : nameOf(ap.approver);
      const signature = JSON.stringify([ap, full.canApprove], (_,v) => typeof v === 'bigint' ? String(v) : v);
      if ($('tApproval').dataset.signature !== signature) {
        $('tApproval').dataset.signature = signature;
        html('tApproval', `<h3>${ap.state === 'pending' ? 'Approval needed' : ap.state === 'approved' ? 'Approved' : 'Not approved'}</h3><div class="kv">${ap.state === 'pending' ? `Waiting for ${esc(approver)}.` : `Decision by ${esc(nameOf(ap.decidedBy))} · ${date(ap.at)}${ap.note ? ' · ' + esc(ap.note) : ''}`}</div>${ap.state === 'pending' && full.canApprove && t.requester !== me.id ? '<label for="apNote">Note with your decision (optional)</label><input id="apNote" type="text" maxlength="1000"><div class="btnrow"><button id="apYes" class="primary">Approve request</button><button id="apNo">Decline request</button></div><span class="status" id="apStatus" role="status"></span>' : ''}${ap.state === 'pending' && me.role === 'admin' ? '<details><summary>Change approver</summary><label for="apRoute">Email address or group:Name</label><div class="inline-control"><input id="apRoute" type="text"><button id="apRouteBtn">Save approver</button></div></details>' : ''}`);
        if ($('apYes')) $('apYes').onclick = e => action(e.currentTarget, 'apStatus', id => api().decideApproval(session.load(), id, true, $('apNote').value));
        if ($('apNo')) $('apNo').onclick = e => action(e.currentTarget, 'apStatus', id => api().decideApproval(session.load(), id, false, $('apNote').value));
        if ($('apRouteBtn')) $('apRouteBtn').onclick = e => action(e.currentTarget, 'apStatus', id => api().setApprover(session.load(), id, $('apRoute').value.trim()), () => { delete $('tApproval').dataset.signature; });
      }
    }
    if (fresh) {
      toggle('tEdit', false); toggle('tFieldsForm', false); toggle('aiDraftReview', false);
      $('cBody').value = drafts.get(draftKey(t.id)) || '';
      for (const key of ['cStatus','tStatus']) setStatus(key,'','');
    }
    paintComposer();
    profilePictures?.apply(); profilePictures?.load(t.id);
  }
  async function load(id, {background = false} = {}) {
    const textId = String(id);
    if (!/^\d+$/.test(textId) || !getMe()) { toggle('tWrap',false); toggle('tMissing',true); return; }
    if (background && (pending || loading || !same(id))) return;
    const fresh = activeId !== textId;
    if (fresh) { paintCustomerWorkflow({el:$('tWorkflow'),value:null}); customerSignature=""; privacySignature=""; $("tCustomer")?.replaceChildren(); personContext.reset(); remember(); activeId = textId; current = null; kind = 'comment'; checklistOpen = false; aiSuggestion = null; dirty.clear(); toggle('tWrap',false); toggle('tMissing',false); }
    const stamp = ++generation, person = getMe().id; loading = true;
    if (!background) sync('Loading request…');
    try {
      const [full, people] = await Promise.all([api().getTicket(session.load(), BigInt(textId)), getMe().role === 'requester' ? [] : loadAgents()]);
      if (stamp !== generation || !same(textId) || getMe().id !== person) return;
      agents = people;
      const value = opt(full);
      toggle('tWrap',!!value); toggle('tMissing',!value);
      if (!value) { forget(textId); clearTicketData(); customerSignature=''; privacySignature=''; personContext.reset(); $('tMissing').textContent = 'This request is unavailable. It may not exist, or your account may not have access.'; current = null; sync('Request unavailable',true); return; }
      if(opt(value.customer)) {
        agents = await api().customerProjectAgents(session.load(),opt(value.customer).projectId);
        if(stamp!==generation || !same(textId) || getMe()?.id!==person)return;
        personContext.reset();
        $('tBack').href = '#/customers/'+opt(value.customer).projectId;
        $('tBack').textContent = '← '+opt(value.customer).projectName;
        $('tBack').onclick = e => {e.preventDefault();location.hash='#/customers/'+opt(value.customer).projectId;};
      } else { $('tBack').onclick = e=>{e.preventDefault();location.hash=getMe()?.role==='requester'?'#/me':'#/queue';}; }
      paint(value, fresh); sync('Up to date');
      if(!opt(value.customer))void personContext.load(value, !background);
    } catch (e) {
      if (stamp !== generation || !same(textId)) return;
      sync('Updates paused · retry',true);
      if (!current) { toggle('tMissing',true); $('tMissing').textContent = 'We couldn’t load this request. Use the refresh button to try again.'; }
      else if (!background) setStatus('tStatus','err',error(e));
    } finally { if (stamp === generation) loading = false; }
  }
  async function action(button, statusId, work, success) {
    if (!current || !activeId || button.disabled) return;
    const id = BigInt(activeId), person = getMe().id, role = getMe().role, staff = current.canAct;
    const authorized = () => same(id) && getMe().id === person && getMe().role === role && (!staff || current?.canAct);
    button.disabled = true; pending++; setStatus(statusId,'','Saving…');
    try {
      const result = await work(id);
      if (!authorized()) return;
      if (result?.ok === false) throw result.detail || result.text || 'The change could not be saved.';
      if (!same(id) || getMe().id !== person) return;
      dirty.delete(button.id);
      setStatus(statusId,'ok','Saved');
      if (success) success(result);
    } catch (e) { if (authorized()) setStatus(statusId,'err',error(e)); }
    finally { pending--; button.disabled = false; }
    if (same(id) && getMe()?.id === person) await load(id, {background:true});
  }
  const statusChange = (button, state, waiting = '') => action(button,'tStatus',id => current.canAct ? api().setStatus(session.load(),id,state,waiting) : api().requesterSetStatus(session.load(),id,state));
  $('tStatusBtns').onclick = e => { const b = e.target.closest('button[data-s]'); if (b) statusChange(b,b.dataset.s,b.dataset.w); };
  $('tState').onchange = e => { const [state,waiting=''] = e.target.value.split(':'); statusChange(e.target,state,waiting); };
  $('tReplyJump').onclick = () => $('cBody').focus();
  $('tRefresh').onclick = () => { if (activeId) load(activeId); };
  $('cBody').oninput = () => { remember(); paintComposer(); };
  $('cSeg').onclick = e => { const b = e.target.closest('button[data-k]'); if (!b || (b.dataset.k === 'note' && !current?.canAct)) return; remember(); kind = b.dataset.k; $('cBody').value = drafts.get(draftKey(activeId)) || ''; paintComposer(); $('cBody').focus(); };
  $('cSend').onclick = async e => {
    const text = $('cBody').value.trim(), mode = kind, original = $('cBody').value;
    if (!text) { setStatus('cStatus','err','Write a message before sending.'); $('cBody').focus(); return; }
    const key = draftKey(activeId,mode);
    await action(e.currentTarget,'cStatus',id => mode === 'note' ? api().addNote(session.load(),id,text) : api().comment(session.load(),id,text), () => {
      if (drafts.get(key) === original || !drafts.has(key)) drafts.delete(key);
      if (kind === mode && $('cBody').value === original) { $('cBody').value = ''; remember(); }
    });
    paintComposer();
  };
  $('cBody').onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); $('cSend').click(); } };
  $('cAttach').onclick = () => $('cFile').click();
  $('cFile').onchange = async () => {
    const file = $('cFile').files[0]; if (!file || !current || kind === 'note') return;
    if (file.size > 1500000) { setStatus('cStatus','err','Choose a file smaller than 1.5 MB.'); $('cFile').value = ''; return; }
    await action($('cAttach'),'cStatus',async id => api().addFile(session.load(),id,file.name,file.type || 'application/octet-stream',new Uint8Array(await file.arrayBuffer())));
    $('cFile').value = '';
  };
  $('aiSum').onclick = e => action(e.currentTarget,'cStatus',id => api().aiSummary(session.load(),id));
  $('aiDraft').onclick = async e => {
    const original = $('cBody').value, mode = kind;
    await action(e.currentTarget,'cStatus',id => api().aiDraft(session.load(),id,original.trim()), result => {
      if ($('cBody').value === original && kind === mode) { remember(); kind = 'comment'; $('cBody').value = result.text; remember(); paintComposer(); setStatus('cStatus','ok','Draft ready. Review it before sending.'); }
      else { aiSuggestion = result.text; html('aiDraftText',formatMessage(result.text)); toggle('aiDraftReview',true); }
    });
  };
  $('aiDraftUse').onclick = () => { if (!aiSuggestion) return; remember(); kind = 'comment'; $('cBody').value = aiSuggestion; remember(); toggle('aiDraftReview',false); paintComposer(); $('cBody').focus(); };
  $('tAssignMe').onclick = e => action(e.currentTarget,'tStatus',id => api().assign(session.load(),id,getMe().email), () => dirty.delete('tAssignee'));
  $('tAssignee').onchange = e => action(e.target,'tStatus',id => api().assign(session.load(),id,e.target.value));
  $('tPriority').onchange = e => action(e.target,'tStatus',id => api().setPriority(session.load(),id,e.target.value));
  $('tQueueSave').onclick = e => action(e.currentTarget,'tStatus',id => api().setQueue(session.load(),id,$('tQueue').value.trim()), () => dirty.delete('tQueue'));
  $('tDueSave').onclick = e => action(e.currentTarget,'tStatus',id => api().setDue(session.load(),id,$('tDue').value ? [BigInt(new Date($('tDue').value + 'T00:00:00Z').getTime()) * 1000000n] : []), () => dirty.delete('tDue'));
  $('tAddChecklist').onclick = () => { checklistOpen = true; toggle('tTasksCard',true); toggle('tAddChecklist',false); $('tTaskTitle').focus(); };
  $('tTaskAddBtn').onclick = e => action(e.currentTarget,'tStatus',id => api().addTask(session.load(),id,$('tTaskTitle').value.trim()), () => { $('tTaskTitle').value = ''; });
  $('tTasks').onchange = e => { if (e.target.dataset.task !== undefined) action(e.target,'tStatus',id => api().setTask(session.load(),id,BigInt(e.target.dataset.task),e.target.value)); };
  $('tLinkAddBtn').onclick = e => action(e.currentTarget,'tStatus',id => api().addLink(session.load(),id,$('tLinkKind').value.trim(),$('tLinkRef').value.trim()), () => { $('tLinkKind').value = ''; $('tLinkRef').value = ''; });
  $('tLinks').onclick = e => { const b=e.target.closest('button[data-k]'); if (b) action(b,'tStatus',id => api().removeLink(session.load(),id,b.dataset.k,b.dataset.v)); };
  $('tEditBtn').onclick = () => { if (!current) return; if ($('tEdit').classList.contains('hidden')) { $('teSubject').value=current.ticket.subject; $('teBody').value=current.ticket.body; toggle('tEdit',true); $('teSubject').focus(); } else toggle('tEdit',false); };
  $('teCancel').onclick = () => toggle('tEdit',false);
  $('teSave').onclick = e => action(e.currentTarget,'tStatus',id => api().setSubject(session.load(),id,$('teSubject').value,$('teBody').value), () => toggle('tEdit',false));
  $('tFieldsEdit').onclick = () => {
    if (!current?.canAct) return;
    const form=$('tFieldsForm'); if (!form.classList.contains('hidden')) { toggle('tFieldsForm',false); return; }
    toggle('tFieldsForm',true); const defs=opt(current.requestType)?.fields || []; const values=current.ticket.fields.map(([key,value])=>[key,defs.find(d=>d.key===key)?.kind==='person' ? current.people.find(p=>p.id===value)?.email || value : value]); renderFields(form,defs,values);
    form.insertAdjacentHTML('beforeend','<div class="btnrow"><button id="tFieldsSave" class="primary">Save information</button></div>');
    $('tFieldsSave').onclick = e => action(e.currentTarget,'tStatus',id => api().setFields(session.load(),id,collectFields(form)), () => toggle('tFieldsForm',false));
  };
  for (const id of ['tQueue','tDue','tPriority','tAssignee','tState']) $(id).addEventListener('input', () => dirty.add(id));
  $('tFiles').onclick = async e => {
    const link=e.target.closest('a[data-f]'); if (!link) return; e.preventDefault();
    try {
      const file=opt(await api().fileData(session.load(),BigInt(link.dataset.f)));
      if (!file) { setStatus('tStatus','err','This attachment is no longer available.'); return; }
      const url=URL.createObjectURL(new Blob([new Uint8Array(file.data)],{type:file.mime || 'application/octet-stream'}));
      const a=document.createElement('a'); a.href=url; a.download=file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url),5000);
    } catch(e) { setStatus('tStatus','err',error(e)); }
  };
  const refresh = () => { if (activeId && !document.hidden && getMe()) return load(activeId,{background:true}); };
  setInterval(refresh,7000); document.addEventListener('visibilitychange',refresh);
  window.addEventListener('beforeunload',e => { remember(); if ([...drafts.values()].some(Boolean)) { e.preventDefault(); e.returnValue=''; } });
  return {load, refresh, leave(){paintCustomerWorkflow({el:$('tWorkflow'),value:null}); customerSignature=""; privacySignature=""; $("tCustomer")?.replaceChildren(); personContext.reset(); remember(); activeId=null; generation++; loading=false; current=null;}, reset(){paintCustomerWorkflow({el:$('tWorkflow'),value:null}); customerSignature=""; privacySignature=""; $("tCustomer")?.replaceChildren(); personContext.reset(); activeId=null; current=null; generation++; loading=false; drafts.clear(); dirty.clear(); $('cBody').value=''; toggle('tWrap',false);}};
}
