// Progress reflects source state, never an invented percentage or completion time.
export const analysisPending = view => ['received', 'processing'].includes(view?.source.status);
export const proposalIds = view => (view?.proposals || []).filter(p => p.status === 'open').map(p => String(p.id));

export function busyButton(button, label) {
  const children = [...button.childNodes].map(n => n.cloneNode(true)), disabled = button.disabled;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  const spinner = document.createElement('span'); spinner.className = 'wait-spinner'; spinner.setAttribute('aria-hidden', 'true');
  button.replaceChildren(spinner, document.createTextNode(label));
  return () => { button.replaceChildren(...children); button.disabled = disabled; button.removeAttribute('aria-busy'); };
}

export function analysisFeedback(root, {phase = 'starting', title, detail = '', elapsed = '', action, actionLabel}) {
  if (!root.querySelector('[data-analysis-title]')) {
    root.innerHTML = '<section class="analysis-feedback" aria-label="Document analysis"><span class="analysis-symbol" aria-hidden="true"><span class="wait-spinner"></span><span class="analysis-check">✓</span><span class="analysis-alert">!</span></span><div class="analysis-copy"><div role="status" aria-live="polite" aria-atomic="true"><strong data-analysis-title></strong><p data-analysis-detail></p></div><small data-analysis-elapsed aria-live="off"></small><ol class="analysis-steps" aria-label="Analysis stages"><li>Original saved</li><li>AI analysis</li><li>Ready to review</li></ol><button type="button" class="pill outline sm" data-analysis-action hidden></button></div></section>';
  }
  root.hidden = false;
  const card = root.firstElementChild; card.dataset.phase = phase;
  const update = (selector, text) => { const el = root.querySelector(selector); if (el.textContent !== text) el.textContent = text; };
  update('[data-analysis-title]', title); update('[data-analysis-detail]', detail); update('[data-analysis-elapsed]', elapsed);
  const button = root.querySelector('[data-analysis-action]'); button.hidden = !action; button.textContent = actionLabel || ''; button.onclick = action || null;
}

// One query at a time. Route/session guards prevent late responses or background
// polling from touching another document/workspace. Form replacement is the caller's decision.
export function watchAnalysis(root, {initial, load, stale, onComplete, baseline = proposalIds(initial), requested = false, now = Date.now, schedule = setTimeout, cancel = clearTimeout, delay = 4000}) {
  const started = now(); let timer, stopped = false, inFlight = false, sawPending = analysisPending(initial), latest = initial;
  const elapsed = () => { const s = Math.max(0, Math.floor((now() - started) / 1000)); return s < 60 ? `${s}s elapsed` : `${Math.floor(s / 60)}m ${s % 60}s elapsed`; };
  const stop = () => { stopped = true; cancel(timer); };
  const unavailable = () => { stop(); analysisFeedback(root, {phase:'attention', title:'Document no longer available here', detail:'It may have been moved or your access may have changed.'}); onComplete?.(null, 'attention'); };
  const paint = view => {
    if (!view) { unavailable(); return false; }
    latest = view;
    const pending = analysisPending(view), fresh = proposalIds(view).some(id => !baseline.includes(id));
    // A query just after restart can briefly return the previous reading.
    if (!pending && (sawPending || fresh || !requested || ['failed','ignored','filed'].includes(view.source.status) || (view.source.status==='review' && !!view.source.note))) {
      stop();
      const ready = fresh;
      const phase = ready ? 'ready' : 'attention';
      analysisFeedback(root, {phase, title:ready ? 'AI reading complete' : 'Analysis needs your review', detail:ready ? 'The latest suggestions are ready. Check the details before saving.' : view.source.note || 'No new suggestions were returned. Your original and earlier details are still available.', elapsed:elapsed()});
      onComplete?.(view, phase); return false;
    }
    sawPending ||= pending;
    const reading = view.source.status === 'processing';
    analysisFeedback(root, {phase:reading?'reading':'queued', title:reading?'AI is reading your document…':'Waiting for AI…', detail:view.source.note || (reading?'Reading the original and finding parties, dates and prices.':'Your original is saved. The analysis will start in the background.'), elapsed:elapsed() + (now()-started >= 90000 ? ' · Still waiting. You can leave and return to your inbox.' : ' · You can leave this page; analysis continues.')});
    return true;
  };
  const check = async () => {
    if (stopped || stale()) { stop(); return; }
    if (inFlight) return;
    cancel(timer); inFlight = true;
    try {
      const view = await load();
      if (stopped || stale()) { stop(); return; }
      if (paint(view)) timer = schedule(check, delay);
    } catch (_) {
      if (stopped || stale()) { stop(); return; }
      analysisFeedback(root, {phase:'attention', title:'Progress could not be refreshed', detail:'The analysis may still be running. Check its status again; this will not start another AI request.', elapsed:elapsed(), action:check, actionLabel:'Check progress'});
    } finally { inFlight = false; }
  };
  if (!stale() && paint(initial)) timer = schedule(check, delay);
  return {stop, check, latest:() => latest};
}
