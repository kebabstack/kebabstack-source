export const MODE_KEY = 'ship-the-bug-mode-v1';
export function readMode(search='',saved=null) {
 const value=new URLSearchParams(search).get('mode');
 if(value!==null)return value==='2d'?'2d':'3d';
 return saved==='2d'?'2d':'3d';
}
let saved=null;try{saved=globalThis.localStorage?.getItem(MODE_KEY);}catch{}
export const MODE=readMode(globalThis.location?.search,saved);
export function modeUrl(next,href=location.href) {
 if(!['2d','3d'].includes(next))throw Error('Unknown flight mode');
 const url=new URL(href);url.searchParams.set('mode',next);url.hash='';return url.href;
}
export function updateModeSwitchers(run,doc=document) {
 const available=['ready','done'].includes(run.phase)&&!run.publishing;
 for(const button of doc.querySelectorAll('[data-flight-mode]')) {
  const active=button.dataset.flightMode===MODE;
  button.setAttribute('aria-pressed',String(active));button.disabled=active||!available;
 }
}
export function mountModeSwitcher({getRun,navigate=url=>location.assign(url),doc=document,storage}) {
 if(storage===undefined)try{storage=globalThis.localStorage;}catch{}
 const buttons=[...doc.querySelectorAll('[data-flight-mode]')];
 const listeners=buttons.map(button=>{
  const click=()=>{const run=getRun(),next=button.dataset.flightMode;
   if(!['ready','done'].includes(run.phase)||run.publishing||next===MODE)return;
   try{storage?.setItem(MODE_KEY,next);}catch{}
   navigate(modeUrl(next));
  };
  button.addEventListener('click',click);return()=>button.removeEventListener('click',click);
 });
 updateModeSwitchers(getRun(),doc);return()=>listeners.forEach(remove=>remove());
}
