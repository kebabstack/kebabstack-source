/* Kebabstack Forms embed. No credentials, cookies or parent URL collection. */
(() => {
  const script = document.currentScript;
  if (!script) return;
  const source = new URL(script.src), slug = script.dataset.form || '';
  if (!/^[a-f0-9]{6,40}$/.test(slug)) return;
  const frame = document.createElement('iframe');
  frame.title = script.dataset.title || 'Contact form';
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText = 'display:block;width:100%;border:0;min-height:240px;height:560px';
  const params = new URLSearchParams({embed:'1', parent:location.origin, theme:['light','dark'].includes(script.dataset.theme)?script.dataset.theme:'system'});
  let context = {}; try { const parsed=JSON.parse(script.dataset.context || '{}'); if(parsed && !Array.isArray(parsed) && typeof parsed==='object')context=parsed; } catch {}
  for (const [key,value] of Object.entries(context).slice(0,12)) if (/^[a-z0-9_]{1,40}$/.test(key) && typeof value === 'string') params.set('ctx_'+key,value.slice(0,1000));
  frame.src = new URL('./', source).href + '#/f/' + slug + '?' + params;
  script.after(frame);
  const listener = e => {
    if (e.source !== frame.contentWindow || e.origin !== source.origin) return;
    if(e.data?.type==='kebabstack.forms.ready'){frame.contentWindow.postMessage({type:'kebabstack.forms.host'},source.origin);return;}
    if(e.data?.type !== 'kebabstack.forms.resize')return;
    const height = Number(e.data.height); if (Number.isFinite(height) && height>=100 && height<=20000) frame.style.height = Math.ceil(height)+'px';
  };
  window.addEventListener('message', listener);
})();
