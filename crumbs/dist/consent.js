/* Optional website consent UI. Load after tracker.js; no third-party service. */
(function(){
 'use strict';var script=document.currentScript;if(!script||window.crumbsPreferences)return;
 var tracker=window.crumbs;if(!tracker||!tracker.grantConsent)return;
 var site=script.dataset.site||'',name='crumbs_choice_v1_'+encodeURIComponent(site),secure=location.protocol==='https:'?'; Secure':'';
 var cookieMode=tracker.status().mode==='cookie',root=document.createElement('section');root.className='crumbs-consent';root.setAttribute('aria-label','Website analytics preferences');
 var panel=document.createElement('div');panel.className='crumbs-consent-panel';panel.id='crumbs-consent-panel';
 var heading=document.createElement('h2');heading.textContent='Your analytics choice';panel.append(heading);
 var text=document.createElement('p');text.textContent=cookieMode?'Allow optional analytics cookies to measure pageviews and recognize this browser on later visits? The identifier lasts up to 90 days.':'Allow this website to measure pageviews without analytics cookies? Visitor estimates use a daily pseudonym.';panel.append(text);
 var detail=document.createElement('p');detail.textContent='Rejecting keeps analytics off. You can change your choice here at any time. Your choice is remembered for 90 days.';panel.append(detail);
 try{var url=new URL(script.dataset.privacyUrl,location.href);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&script.dataset.privacyUrl){var link=document.createElement('a');link.href=url.href;link.textContent='Privacy notice';panel.append(link);}}catch{}
 var actions=document.createElement('div');actions.className='crumbs-consent-actions';
 function button(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
 var open=button('Analytics preferences',function(){panel.hidden=false;open.setAttribute('aria-expanded','true');reject.focus();});open.setAttribute('aria-controls',panel.id);
 function choose(yes){document.cookie=name+'='+(yes?'allow':'deny')+'; Path=/; Max-Age=7776000; SameSite=Lax'+secure;if(yes)tracker.grantConsent();else tracker.revokeConsent();panel.hidden=true;open.setAttribute('aria-expanded','false');open.focus();}
 var reject=button('Reject analytics',function(){choose(false);}),accept=button('Allow analytics',function(){choose(true);});actions.append(reject,accept);panel.append(actions);root.append(panel,open);
 var remembered=document.cookie.split('; ').find(function(x){return x.startsWith(name+'=');});var choice=remembered?.slice(name.length+1);
 if(choice==='allow'){tracker.grantConsent();panel.hidden=true;}else if(choice==='deny'){tracker.revokeConsent();panel.hidden=true;}open.setAttribute('aria-expanded',String(!panel.hidden));
 document.body.append(root);window.crumbsPreferences=function(){open.click();};
})();
