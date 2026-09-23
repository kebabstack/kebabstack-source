// Hub-owned pictures; no persistent copy or public photo endpoint in Desk.
export function createProfilePictures({getBackend,getMe,session,onOwn}) {
  const cache=new Map(), requests=new Map(); let generation=0;
  function apply(root=document) {
    root.querySelectorAll('[data-avatar-person]').forEach(el=>{
      const url=cache.get(el.dataset.avatarPerson); if(!url || el.querySelector('img')?.src===url) return;
      const fallback=el.dataset.avatarFallback || el.textContent; el.dataset.avatarFallback=fallback;
      const img=document.createElement('img');img.src=url;img.alt='';img.decoding='async';img.onerror=()=>{if(el.contains(img)) el.textContent=fallback;};el.replaceChildren(img);
    });
  }
  async function load(ticketId=null) {
    if(!getMe()) return;
    const people=[...new Set([getMe().id,...(ticketId===null?[]:[...document.querySelectorAll('[data-avatar-person]')].map(el=>el.dataset.avatarPerson))])].filter(Boolean).slice(0,32);
    const key=String(ticketId ?? 'self')+':'+people.join(','), prior=requests.get(key);
    if(prior && Date.now()-prior.at<60000) {apply();return prior.promise;}
    const stamp=generation, person=getMe().id;
    const promise=(async()=>{
      try {
        const rows=[]; for(let i=0;i<people.length;i+=4) {const batch=await getBackend().profilePictures(session.load(),ticketId===null?[]:[BigInt(ticketId)],people.slice(i,i+4));if(Array.isArray(batch)) rows.push(...batch);}
        if(stamp!==generation || getMe()?.id!==person || !Array.isArray(rows)) return;
        for(const [id,bytes] of rows) {
          const u8=new Uint8Array(bytes);
          // Hub avatars are raster images. Reject other content and keep the initials.
          const mime=u8[0]===137&&u8[1]===80?'image/png':u8[0]===255&&u8[1]===216?'image/jpeg':u8[0]===82&&u8[8]===87?'image/webp':null;
          if(!mime || u8.length>400000) continue;
          const old=cache.get(id), url=URL.createObjectURL(new Blob([u8],{type:mime}));cache.set(id,url);
          if(old) URL.revokeObjectURL(old);
        }
        if(cache.has(person)) onOwn(cache.get(person));
        apply();
      } catch (_) { requests.delete(key); }
    })();
    requests.set(key,{at:Date.now(),promise}); return promise;
  }
  function reset(){generation++;for(const url of cache.values()) URL.revokeObjectURL(url);cache.clear();requests.clear();}
  return{load,apply,reset};
}
