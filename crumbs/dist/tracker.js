/* Crumbs 0.9.1 — cookieless by default; optional first-party identifier requires explicit consent. */
(function () {
  'use strict';
  var script=document.currentScript;
  if(!script||window.__crumbsInstalled)return;
  window.__crumbsInstalled=true;
  var endpoint=script.dataset.endpoint||new URL('/api/v1/events',script.src).href;
  if(script.dataset.consent==='required')window.crumbsConsentRequired=true;
  var site=script.dataset.site,domain=script.dataset.domain||location.hostname;
  var disabled=false,cookieMode=script.dataset.mode==='cookie',cookieName='crumbs_v1_'+encodeURIComponent(site||domain);
  var cookieId='',retryAt=0,failures=0,dropped=0,controller=null,epoch=0;
  var lastUrl='',lastNavigation='',started=performance.now(),active=0,scroll=0,visible=!document.hidden,previousRef=document.referrer;
  var queue=[],sending=false,smallBatch=false,lastDelivery="not-sent";
  function id(){return crypto.randomUUID();}
  function privacy(){return navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';}
  function clearIdentity(){if(cookieMode)document.cookie=cookieName+'=; Path=/; Max-Age=0; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');cookieId='';}
  function allowed(){if(privacy()){queue=[];active=0;clearIdentity();return false;}return !disabled&&(!(cookieMode||window.crumbsConsentRequired)||window.crumbsConsentGranted===true);}
  function identity(){
    if(!cookieMode||!allowed())return '';
    var entry=document.cookie.split('; ').find(function(x){return x.startsWith(cookieName+'=');}),value=entry?entry.slice(cookieName.length+1).split('.'):[];
    if(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value[0]||'')&&Number(value[1])>Date.now()&&Number(value[1])<=Date.now()+90*86400000)return value[0];
    var token=id(),expires=Date.now()+90*86400000;
    document.cookie=cookieName+'='+token+'.'+expires+'; Path=/; Max-Age=7776000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
    // If cookies are blocked, use the cookieless estimate instead of claiming a persisted browser.
    return document.cookie.split('; ').some(function(x){return x.startsWith(cookieName+'='+token+'.');})?token:'';
  }
  function clean(value){return /@|eyJ[A-Za-z0-9_-]{15,}/.test(value)?'(redacted)':value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160);}
  function pageUrl(){var url=new URL(location.href);if(script.dataset.hash==='true'&&url.hash.startsWith('#/'))url=new URL(url.hash.slice(1),url.origin);url.hash='';var params=new URLSearchParams();['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref','source'].forEach(function(k){if(url.searchParams.has(k))params.set(k,clean(url.searchParams.get(k)));});url.search=params.toString();try{url.pathname=decodeURIComponent(url.pathname).replace(/[^/\s]+@[^/\s]+/g,':email').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,':id').replace(/\/\d{5,}(?=\/|$)/g,'/:id');}catch{url.pathname='/:invalid-path';}return url.href;}
  try{previousRef=document.referrer?new URL(document.referrer).origin:'';}catch{previousRef='';}
  function payload(kind,name,options){var e={id:id(),site:site,domain:domain,url:pageUrl(),referrer:previousRef,kind:kind,name:name||''};
    ['id','props','interactive','revenueMinor','currency'].forEach(function(k){if(options&&options[k]!==undefined)e[k]=options[k];});
    e.screenWidth=Math.min(16384,Math.max(0,Math.round(window.screen?.width||0)));e.screenHeight=Math.min(16384,Math.max(0,Math.round(window.screen?.height||0)));e.automation=navigator.webdriver===true;
    if(cookieMode&&allowed()){cookieId=identity();if(cookieId){e.cookieId=cookieId;e.cookieConsent=true;}}return e;}
  function batchOf(){var batch=[],size=2;for(var e of queue){var bytes=new TextEncoder().encode(JSON.stringify(e)).length+1;if(size+bytes>45000||batch.length>=(smallBatch?1:20))break;batch.push(e);size+=bytes;}return batch;}
  function receiptValid(receipt,count){if(!receipt||typeof receipt!=='object')return false;
    var fields=receipt.durability==='canister'&&receipt.delivery==='committed'?['accepted','duplicates','ignored']:receipt.durability==='collector'&&receipt.delivery==='asynchronous'?['queued','ignored']:[];
    return fields.length>0&&fields.every(function(k){return Number.isSafeInteger(receipt[k])&&receipt[k]>=0;})&&fields.reduce(function(n,k){return n+receipt[k];},0)===count;
  }
  async function drain(){
    if(sending||!queue.length||!allowed()||Date.now()<retryAt)return;sending=true;
    var batch=batchOf(),next=false,run=epoch;controller=new AbortController();var timeout=setTimeout(function(){controller?.abort();},15000);
    try{var r=await fetch(endpoint,{method:'POST',body:JSON.stringify(batch),headers:{'Content-Type':'text/plain'},credentials:'omit',keepalive:true,signal:controller.signal});
      if(run!==epoch)return;
      if(r.ok){var receipt;try{receipt=await r.json();}catch{}if(!receiptValid(receipt,batch.length)){lastDelivery='invalid-receipt';failures++;retryAt=Date.now()+Math.min(60000,5000*2**Math.min(failures,4));return;}
        lastDelivery=receipt.ignored===batch.length?'ignored':receipt.durability==='collector'?'queued-at-collector':'accepted';
        var delivered=new Set(batch.map(function(e){return e.id;}));queue=queue.filter(function(e){return !delivered.has(e.id);});smallBatch=false;failures=0;retryAt=0;next=true;
      }else if(r.status>=400&&r.status<500&&![408,425,429].includes(r.status)){lastDelivery='rejected';if(batch.length>1)smallBatch=true;else{queue=queue.filter(function(e){return e.id!==batch[0].id;});dropped++;}next=true;
      }else{lastDelivery=r.status===429?'rate-limited':'server-error';failures++;var after=r.headers?.get('Retry-After'),seconds=Number(after);retryAt=Math.max(Date.now()+Math.min(60000,5000*2**Math.min(failures,4)),after?(Number.isFinite(seconds)?Date.now()+Math.max(0,seconds)*1000:Date.parse(after)||0):0);}
    }catch(_){if(run===epoch){lastDelivery='network-error';failures++;retryAt=Date.now()+Math.min(60000,5000*2**Math.min(failures,4));}}
    finally{clearTimeout(timeout);controller=null;sending=false;if((next||run!==epoch)&&queue.length)queueMicrotask(drain);}
  }
  function send(event){if(!allowed())return;var copy;try{copy=JSON.parse(JSON.stringify(event));}catch{dropped++;lastDelivery='invalid-event';return;}if(new TextEncoder().encode(JSON.stringify(copy)).length>44000){dropped++;lastDelivery='event-too-large';return;}if(queue.length<100)queue.push(copy);else{dropped++;lastDelivery='queue-full';}void drain();}
  function account(){var now=performance.now();if(visible)active+=now-started;started=now;}
  function engagement(){if(!allowed()){active=0;started=performance.now();return;}account();if(active>0&&lastUrl){send(Object.assign(payload('engagement',''),{url:lastUrl,engagementMs:Math.min(3600000,Math.round(active)),scrollDepth:scroll}));active=0;}}
  function pageview(){if(!allowed()){active=0;started=performance.now();return;}var navigation=location.pathname+location.search+(script.dataset.hash==='true'?location.hash:'');if(navigation===lastNavigation)return;lastNavigation=navigation;engagement();var old=lastUrl;lastUrl=pageUrl();scroll=0;measureScroll();active=0;started=performance.now();try{previousRef=old?new URL(old).origin:(document.referrer?new URL(document.referrer).origin:'');}catch{previousRef='';}send(payload('pageview',''));}
  function track(name,options){send(payload('event',name,options));}
  var pending=window.crumbs?.q||[];window.crumbs=track;
  window.crumbs.pause=function(){disabled=true;epoch++;controller?.abort();queue=[];active=0;lastUrl='';lastNavigation='';retryAt=0;clearIdentity();};
  window.crumbs.resume=function(){disabled=false;if(allowed())pageview();};
  window.crumbs.grantConsent=function(){window.crumbsConsentGranted=true;window.crumbs.resume();};
  window.crumbs.revokeConsent=function(){window.crumbsConsentGranted=false;window.crumbs.pause();};
  window.crumbs.pageview=pageview;
  window.crumbs.status=function(){return {state:navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'?'privacy-signal':disabled?'paused':(cookieMode||window.crumbsConsentRequired)&&!window.crumbsConsentGranted?'consent-required':'ready',mode:cookieMode?'cookie':'cookieless',identity:cookieId?'cookie':'daily-estimate',lastDelivery:lastDelivery,pending:queue.length,dropped:dropped};};
  ['pushState','replaceState'].forEach(function(method){var original=history[method];history[method]=function(){var result=original.apply(this,arguments);pageview();return result;};});
  window.addEventListener('popstate',pageview);
  window.addEventListener('pageshow',function(e){if(e.persisted){lastUrl='';lastNavigation='';started=performance.now();active=0;visible=!document.hidden;pageview();}});
  if(script.dataset.hash==='true')window.addEventListener('hashchange',pageview);
  document.addEventListener('visibilitychange',function(){account();if(document.hidden){engagement();visible=false;}else{visible=true;started=performance.now();void drain();}});
  function measureScroll(){var height=Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0);scroll=Math.max(scroll,Math.min(100,Math.round((window.scrollY+window.innerHeight)/Math.max(1,height)*100)));}
  window.addEventListener('scroll',measureScroll,{passive:true});
  window.addEventListener('pagehide',function(){engagement();if(allowed()&&queue.length){var bytes=JSON.stringify(batchOf());navigator.sendBeacon(endpoint,new Blob([bytes],{type:'text/plain'}));}});
  document.addEventListener('click',function(e){var event=e.target.closest?.('[data-crumbs-event]');if(event){var options={};if(event.dataset.crumbsRevenueMinor!==undefined){var amount=Number(event.dataset.crumbsRevenueMinor);if(Number.isSafeInteger(amount)&&amount>=0&&/^[A-Z]{3}$/.test(event.dataset.crumbsCurrency||'')){options.revenueMinor=amount;options.currency=event.dataset.crumbsCurrency;}}track(event.dataset.crumbsEvent,options);}var link=e.target.closest?.('a[href]');if(!link)return;var u=new URL(link.href,location.href);if(!/^https?:$/.test(u.protocol))return;
    if(script.dataset.outbound==='true'&&u.hostname!==location.hostname)track('Outbound Link: Click');
    if(script.dataset.downloads==='true'&&(link.hasAttribute('download')||/\.(pdf|zip|csv|docx?|xlsx?|pptx?|mp3|mp4)$/i.test(u.pathname)))track('File Download');
  });
  document.addEventListener('submit',function(){if(script.dataset.forms==='true')track('Form: Submission');});
  setInterval(drain,5000);setInterval(function(){if(visible)engagement();},30000);pageview();pending.forEach(function(args){track.apply(null,args);});
})();
