/* Offline documentation interactions; never calls an application backend. */
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pages = $$('.page');
  const search = $('#rule-search');
  const clear = $('#clear-search');
  const results = $('#results-list');
  const count = $('#results-count');
  const sidebar = $('.sidebar');
  const navToggle = $('#nav-toggle');
  const rules = $$('.rule').map(node => ({ id: node.id, title: node.querySelector('h2').textContent, text: node.dataset.search || node.textContent, body: node.querySelector('p').textContent, chapter: node.closest('.page').querySelector('h1').textContent }));
  rules.unshift(...$$('[data-catalogue]').map(node => ({id:node.id,title:node.querySelector('h1').textContent,text:node.dataset.search,body:node.querySelector('.intro').textContent,chapter:'Visual catalogue'})));
  document.documentElement.classList.add('js');

  function show(page, current, focus = false) {
    pages.forEach(node => node.classList.toggle('is-active', node === page));
    $$('.sidebar nav a[href^="#"], .catalogue-links a').forEach(link => {
      if (link.hash === '#' + current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = (page.querySelector('h1')?.innerText || page.querySelector('h1')?.textContent || 'Design standard') + ' · Kebabstack';
    if (focus) { const heading = page.querySelector('h1'); heading?.focus({ preventScroll: true }); window.scrollTo(0,0); }
  }
  function closeNav() { sidebar.classList.remove('is-open'); navToggle.setAttribute('aria-expanded','false'); }
  function route(focus = false) {
    let id = 'overview';
    try { id = decodeURIComponent(location.hash.slice(1) || 'overview'); } catch {}
    if (id === 'main') { closeNav(); $('#main').focus(); return; }
    const target = document.getElementById(id);
    const page = target?.closest('.page') || $('#overview');
    search.value = ''; clear.hidden = true; results.replaceChildren(); sidebar.classList.remove('is-searching');
    show(page, page.id, focus && !target?.classList.contains('rule'));
    closeNav();
    if (target?.classList.contains('rule')) { target.focus({ preventScroll:true }); target.scrollIntoView({ block:'start' }); }
  }
  window.addEventListener('hashchange', () => route(true));
  navToggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open'); navToggle.setAttribute('aria-expanded',String(open));
    if (open) search.focus();
  });
  sidebar.addEventListener('keydown', event => { if (event.key === 'Escape' && sidebar.classList.contains('is-open')) { closeNav(); navToggle.focus(); }});
  // Re-selecting the current destination also exits search and returns focus.
  $$('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    if (link.hash === location.hash) route(true);
  }));
  function updateSearch() {
    const query = search.value.trim().toLocaleLowerCase(); clear.hidden = !query;
    sidebar.classList.toggle('is-searching', Boolean(query));
    if (!query) { const wasOpen = sidebar.classList.contains('is-open'); route(); if (wasOpen) { sidebar.classList.add('is-open'); navToggle.setAttribute('aria-expanded','true'); } search.focus(); return; }
    const words = query.split(/\s+/);
    const matches = rules.filter(rule => {
      const terms = rule.text.toLocaleLowerCase().match(/[\p{L}\p{N}-]+/gu) || [];
      return words.every(word => terms.some(term => word.length <= 3 ? term === word : term.startsWith(word)));
    });
    results.replaceChildren();
    for (const rule of matches) {
      const link = document.createElement('a'); link.className = 'search-result'; link.href = '#' + rule.id;
      const meta = document.createElement('span'); meta.textContent = rule.id + ' · ' + rule.chapter;
      const title = document.createElement('strong'); title.textContent = rule.title;
      const body = document.createElement('p'); body.textContent = rule.body;
      link.append(meta,title,body); results.append(link);
      link.addEventListener('click', () => { if (link.hash === location.hash) route(true); });
    }
    count.textContent = `${matches.length} ${matches.length === 1 ? 'reference' : 'references'} found`;
    $('#no-results').hidden = matches.length !== 0;
    show($('#search-results'),'search-results');
  }
  search.addEventListener('input',updateSearch);
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value=''; updateSearch(); }});
  clear.addEventListener('click', () => { search.value=''; updateSearch(); search.focus(); });

  const theme = $('#theme'); const system = window.matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try { const stored = localStorage.getItem('kebab-design-theme'); if (['light','dark','system'].includes(stored)) choice=stored; } catch {}
  function applyTheme() { document.documentElement.dataset.theme = choice === 'system' ? (system.matches ? 'dark' : 'light') : choice; theme.value=choice; }
  theme.addEventListener('change', () => { choice=theme.value; try { localStorage.setItem('kebab-design-theme',choice); } catch {} applyTheme(); });
  system.addEventListener('change',applyTheme); applyTheme();

  const demoStates = {
    ready: ['Ready for handover','success','IT · Next step','Record the physical handover','Payment and preparation are confirmed. Record the handover only after the device is given to the buyer.','Preview handover',false],
    blocked: ['Awaiting buyer','warning','Buyer · Next step','Confirm invoice receipt','Preparation is complete. The buyer still needs to confirm receipt in their private dealroom.','Handover unavailable',true],
    pending: ['Awaiting confirmation','info','IT · Check result','The handover result is not confirmed','The request was accepted, but the result is still unknown. Check the existing operation before retrying.','Check operation',false],
    unavailable: ['Source unavailable','warning','IT · Check connection','Preparation could not be verified','Last confirmed status: payment recorded. An unavailable check does not mean the device is ready.','Review connection',false],
    complete: ['Complete','success','Outcome verified','Device handed over','The handover is recorded. Evidence stays with the sale; no further action is needed here.','View evidence',false]
  };
  const stateSelect = $('#demo-state'); const demoAction = $('#demo-action');
  function setState() {
    const state = demoStates[stateSelect.value];
    $('#demo-status').textContent=state[0]; $('#demo-status').className='badge '+state[1];
    $('#demo-actor').textContent=state[2]; $('#demo-title').textContent=state[3]; $('#demo-description').textContent=state[4];
    demoAction.textContent=state[5]; demoAction.disabled=state[6];
    $$('#demo-steps li').forEach((li,i) => { li.removeAttribute('aria-current'); if(i === (stateSelect.value === 'complete' ? 3 : 2)) li.setAttribute('aria-current','step'); });
    $('#demo-message').textContent='';
  }
  stateSelect.addEventListener('change',setState);
  const dialog = $('#demo-dialog');
  demoAction.addEventListener('click', () => {
    if (stateSelect.value === 'ready') dialog.showModal();
    else $('#demo-message').textContent={pending:'Example: open the existing operation record and inspect its confirmed result. Do not create a second handover.',unavailable:'Example: open the connector’s last successful check and its recovery guide.',complete:'Example evidence: handover recorded by IT, with time and preparation checks. No real sale has been changed.'}[stateSelect.value] || '';
  });
  $('#demo-cancel').addEventListener('click', () => dialog.close());
  $('#demo-confirm').addEventListener('click', () => { dialog.close(); stateSelect.value='complete'; setState(); $('#demo-message').textContent='Example complete. This only changed the demonstration; no device or sale was updated.'; });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const first = $('#demo-cancel'), last = $('#demo-confirm');
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener('close', () => demoAction.focus());
  // Local component specimens. No backend, external requests or app data.
  $$('[data-button-demo]').forEach(button => button.addEventListener('click', () => {
    $('#button-demo-result').textContent = button.dataset.buttonDemo + '. Design example only.';
  }));
  const buttonState=$('#button-state'), playground=$('#button-playground'), reason=$('#button-reason');
  function setButtonState() {
    const state=buttonState.value;
    playground.disabled=state==='disabled';
    playground.setAttribute('aria-disabled',String(state==='loading'||state==='disabled'));
    playground.setAttribute('aria-busy',String(state==='loading'));
    playground.querySelector('.button-visible-label').textContent=state==='loading'?'Saving…':'Save changes';
    reason.textContent={ready:'Ready. Clicking previews feedback only.',disabled:'Add a team name before saving. The draft is preserved.',loading:'Saving example: awaiting confirmation. Keep this operation in view; do not submit it again.'}[state];
  }
  buttonState.addEventListener('change',setButtonState);
  playground.addEventListener('click',()=>{
    if(buttonState.value!=='ready') return;
    reason.textContent='Ready-state click received. No settings or app data were changed.';
  });
  const tabs=$$('.kit-tabs [role=tab]');
  function selectTab(tab,focus=false) {
    for(const item of tabs) {
      const selected=item===tab;
      item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;
      document.getElementById(item.getAttribute('aria-controls')).hidden=!selected;
    }
    if(focus)tab.focus();
    tab.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();selectTab(tabs[next],true);}
    });
  });
  $$('[data-menu-example]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();
    $$('[data-menu-example]').forEach(item=>item.removeAttribute('aria-current'));
    link.setAttribute('aria-current','page');
    $('#menu-demo-title').textContent=link.dataset.menuExample;
    $('#menu-demo-description').textContent=link.dataset.menuExample+' selected. One active destination; the icon and label keep their alignment.';
  }));
  setButtonState(); setState(); route();
})();
