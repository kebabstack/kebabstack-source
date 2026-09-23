/* Crumbs 0.6.0 — no cookies, storage, visitor identifiers or third-party scripts. */
(function () {
  'use strict';
  var script=document.currentScript;
  if(!script||window.__crumbsInstalled)return;
  window.__crumbsInstalled=true;
  var endpoint=script.dataset.endpoint||new URL('/api/v1/events',script.src).href;
  var site=script.dataset.site,domain=script.dataset.domain||location.hostname;
  var disabled=navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
  var lastUrl='',started=performance.now(),active=0,scroll=0,visible=!document.hidden,previousRef=document.referrer;
  var queue=[],sending=false,smallBatch=false,lastDelivery="not-sent";
  function id(){return crypto.randomUUID();}
  function allowed(){return navigator.globalPrivacyControl!==true&&navigator.doNotTrack!=='1'&&!disabled&&(!window.crumbsConsentRequired||window.crumbsConsentGranted===true);}
  function clean(value){return /@|eyJ[A-Za-z0-9_-]{15,}/.test(value)?'(redacted)':value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160);}
  function pageUrl(){var url=new URL(location.href);if(script.dataset.hash==='true'&&url.hash.startsWith('#/'))url=new URL(url.hash.slice(1),url.origin);url.hash='';var params=new URLSearchParams();['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref','source'].forEach(function(k){if(url.searchParams.has(k))params.set(k,clean(url.searchParams.get(k)));});url.search=params.toString();try{url.pathname=decodeURIComponent(url.pathname).replace(/[^/\s]+@[^/\s]+/g,':email').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,':id').replace(/\/\d{5,}(?=\/|$)/g,'/:id');}catch{url.pathname='/:invalid-path';}return url.href;}
  try{previousRef=document.referrer?new URL(document.referrer).origin:'';}catch{previousRef='';}
  function payload(kind,name,options){return Object.assign({id:id(),site:site,domain:domain,url:pageUrl(),referrer:previousRef,kind:kind,name:name||''},options||{});}
  async function drain(){
    if(sending||!queue.length||!allowed())return;sending=true;
    var batch=queue.slice(0,smallBatch?1:20),next=false;
    try{var r=await fetch(endpoint,{method:'POST',body:JSON.stringify(batch),headers:{'Content-Type':'text/plain'},credentials:'omit',keepalive:true});
      if(r.ok){lastDelivery='accepted';try{var receipt=await r.json();if(receipt.accepted===0&&receipt.duplicates===0&&receipt.ignored>0)lastDelivery='ignored';}catch{}var delivered=new Set(batch.map(function(e){return e.id;}));queue=queue.filter(function(e){return !delivered.has(e.id);});smallBatch=false;next=true;}else if(r.status>=400&&r.status<500&&r.status!==429){lastDelivery='rejected';if(batch.length>1)smallBatch=true;else queue=queue.filter(function(e){return e.id!==batch[0].id;});next=true;}else{lastDelivery=r.status===429?'rate-limited':'server-error';}
    }catch(_){lastDelivery='network-error';}finally{sending=false;if(next&&queue.length)queueMicrotask(drain);}
  }
  function send(event){if(!allowed())return;if(queue.length<100)queue.push(event);void drain();}
  function account(){var now=performance.now();if(visible)active+=now-started;started=now;}
  function engagement(){if(!allowed()){active=0;started=performance.now();return;}account();if(active>0&&lastUrl){send(Object.assign(payload('engagement',''),{url:lastUrl,engagementMs:Math.min(3600000,Math.round(active)),scrollDepth:scroll}));active=0;}}
  function pageview(){if(pageUrl()===lastUrl)return;engagement();var old=lastUrl;lastUrl=pageUrl();scroll=0;measureScroll();active=0;started=performance.now();try{previousRef=old?new URL(old).origin:(document.referrer?new URL(document.referrer).origin:'');}catch{previousRef='';}send(payload('pageview',''));}
  function track(name,options){send(payload('event',name,options));}
  var pending=window.crumbs?.q||[];window.crumbs=track;
  window.crumbs.pause=function(){disabled=true;queue=[];active=0;};
  window.crumbs.resume=function(){disabled=false;lastUrl='';pageview();};
  window.crumbs.pageview=pageview;
  window.crumbs.status=function(){return {state:navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'?'privacy-signal':disabled?'paused':window.crumbsConsentRequired&&!window.crumbsConsentGranted?'consent-required':'ready',lastDelivery:lastDelivery,pending:queue.length};};
  ['pushState','replaceState'].forEach(function(method){var original=history[method];history[method]=function(){var result=original.apply(this,arguments);pageview();return result;};});
  window.addEventListener('popstate',pageview);
  window.addEventListener('pageshow',function(e){if(e.persisted){lastUrl='';started=performance.now();active=0;visible=!document.hidden;pageview();}});
  if(script.dataset.hash==='true')window.addEventListener('hashchange',pageview);
  document.addEventListener('visibilitychange',function(){account();if(document.hidden){engagement();visible=false;}else{visible=true;started=performance.now();void drain();}});
  function measureScroll(){var height=Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0);scroll=Math.max(scroll,Math.min(100,Math.round((window.scrollY+window.innerHeight)/Math.max(1,height)*100)));}
  window.addEventListener('scroll',measureScroll,{passive:true});
  window.addEventListener('pagehide',function(){engagement();if(allowed()&&queue.length){var bytes=JSON.stringify(queue.slice(0,20));navigator.sendBeacon(endpoint,new Blob([bytes],{type:'text/plain'}));}});
  document.addEventListener('click',function(e){var event=e.target.closest?.('[data-crumbs-event]');if(event){var options={};if(event.dataset.crumbsRevenueMinor!==undefined){var amount=Number(event.dataset.crumbsRevenueMinor);if(Number.isSafeInteger(amount)&&amount>=0&&/^[A-Z]{3}$/.test(event.dataset.crumbsCurrency||'')){options.revenueMinor=amount;options.currency=event.dataset.crumbsCurrency;}}track(event.dataset.crumbsEvent,options);}var link=e.target.closest?.('a[href]');if(!link)return;var u=new URL(link.href,location.href);if(!/^https?:$/.test(u.protocol))return;
    if(script.dataset.outbound==='true'&&u.hostname!==location.hostname)track('Outbound Link: Click');
    if(script.dataset.downloads==='true'&&(link.hasAttribute('download')||/\.(pdf|zip|csv|docx?|xlsx?|pptx?|mp3|mp4)$/i.test(u.pathname)))track('File Download');
  });
  document.addEventListener('submit',function(){if(script.dataset.forms==='true')track('Form: Submission');});
  setInterval(drain,5000);setInterval(function(){if(visible)engagement();},30000);pageview();pending.forEach(function(args){track.apply(null,args);});
})();
