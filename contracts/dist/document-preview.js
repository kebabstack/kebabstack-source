// Render only inert images or PDF pages. Never embed uploaded HTML in the app origin.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountDocumentPreview(root,{documents,load,stale}){
 const files=documents.filter(d=>Number(d.size)>0&&['application/pdf','image/png','image/jpeg','image/webp','image/gif'].includes(d.mime));
 if(!files.length){root.remove();return ()=>{};}
 let drawSequence=0,generation=0,pdf=null,objectUrl=null,renderTask=null,page=1,zoom=1,disposed=false;
 const outdated=n=>disposed||stale()||n!==generation;
 function release(){renderTask?.cancel();renderTask=null;pdf?.loadingTask.destroy();pdf=null;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;}
 root.className='scard document-preview';
 root.innerHTML=`<h3>Original document</h3><div class="preview-controls"><label>Document <select data-file>${files.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label><button type="button" class="pill outline sm" data-prev aria-label="Previous page">←</button><span data-page></span><button type="button" class="pill outline sm" data-next aria-label="Next page">→</button><label>Zoom <select data-zoom><option value="1">Fit width</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select></label></div><p role="status"></p><div class="preview-viewport" tabindex="0" aria-label="Original document preview"></div>`;
 const viewport=root.querySelector('.preview-viewport'),status=root.querySelector('[role=status]');
 async function draw(n){
  const sequence=++drawSequence;
  if(outdated(n))return;
  renderTask?.cancel();renderTask=null;
  root.querySelector('[data-prev]').disabled=!pdf||page<=1;
  root.querySelector('[data-next]').disabled=!pdf||page>=pdf.numPages;
  root.querySelector('[data-page]').textContent=pdf?`${page} / ${pdf.numPages}`:'Image';
  const width=Math.max(240,viewport.clientWidth-24)*zoom;
  if(!pdf){const img=viewport.querySelector('img');if(img)img.style.width=width+'px';return;}
  const currentPage=page,source=pdf;
  try{const p=await source.getPage(currentPage);if(outdated(n)||sequence!==drawSequence||source!==pdf||currentPage!==page)return;
   const base=p.getViewport({scale:1}),scale=Math.min(width/base.width,3),view=p.getViewport({scale});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=width+'px';canvas.setAttribute('aria-label',`Page ${page} of ${pdf.numPages}`);viewport.replaceChildren(canvas);
   const task=p.render({canvasContext:canvas.getContext('2d'),viewport:view});renderTask=task;await task.promise;if(!outdated(n)&&sequence===drawSequence&&currentPage===page)status.textContent='Compare the original with the recorded terms. Zoom or change pages as needed.';
  }catch(e){if(!outdated(n)&&e.name!=='RenderingCancelledException')status.textContent='This page could not be displayed. Download the original from Documents.';}
 }
 async function open(){const n=++generation;release();page=1;viewport.replaceChildren();status.textContent='Loading original…';
  try{const d=await load(BigInt(root.querySelector('[data-file]').value));if(outdated(n))return;if(!d)throw Error('unavailable');const bytes=d.bytes instanceof Uint8Array?d.bytes:new Uint8Array(d.bytes);
   if(d.mime==='application/pdf'){const {openPdf}=await import('./vendor/pdf-text.js');if(outdated(n))return;const next=await openPdf(bytes);if(outdated(n)){await next.loadingTask.destroy();return;}pdf=next;}
   else if(['image/png','image/jpeg','image/webp','image/gif'].includes(d.mime)){objectUrl=URL.createObjectURL(new Blob([bytes],{type:d.mime}));const img=document.createElement('img');img.src=objectUrl;img.alt=d.name;viewport.append(img);status.textContent='Compare the original with the recorded terms.';}else throw Error('unsupported');
   await draw(n);
  }catch(_){if(!outdated(n))status.textContent='Preview unavailable. Download the original from Documents.';}
 }
 root.querySelector('[data-file]').onchange=open;
 root.querySelector('[data-zoom]').onchange=e=>{zoom=Number(e.target.value);draw(generation);};
 root.querySelector('[data-prev]').onclick=()=>{if(pdf&&page>1){page--;draw(generation);}};
 root.querySelector('[data-next]').onclick=()=>{if(pdf&&page<pdf.numPages){page++;draw(generation);}};
 let lastWidth=0;const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(viewport.clientWidth!==lastWidth){lastWidth=viewport.clientWidth;draw(generation);}});resize?.observe(viewport);
 open();return ()=>{disposed=true;generation++;resize?.disconnect();release();viewport.replaceChildren();};
}
