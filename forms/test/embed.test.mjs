import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
const script=readFileSync(new URL('../dist/embed.js',import.meta.url),'utf8');
test('embed has no secret, filters context, validates resize origin/source and verifies the host',()=>{
 const dom=new JSDOM('<script src="https://forms.example.test/embed.js" data-form="abcdef123456" data-theme="dark" data-context=\'{"domain":"example.test","BAD":"drop"}\'></script>',{url:'https://product.example.test/private?secret=do-not-forward',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w.document,'currentScript',{value:w.document.querySelector('script')});w.eval(script);const f=w.document.querySelector('iframe');assert.ok(f);assert.ok(!f.src.includes('secret'));assert.ok(!f.src.includes('BAD'));assert.match(f.src,/ctx_domain=example.test/);assert.match(f.src,/theme=dark/);
 w.dispatchEvent(new w.MessageEvent('message',{origin:'https://wrong.test',source:f.contentWindow,data:{type:'kebabstack.forms.resize',height:900}}));assert.equal(f.style.height,'560px');
 w.dispatchEvent(new w.MessageEvent('message',{origin:'https://forms.example.test',source:f.contentWindow,data:{type:'kebabstack.forms.resize',height:900}}));assert.equal(f.style.height,'900px');
 let sent;f.contentWindow.postMessage=(...args)=>sent=args;w.dispatchEvent(new w.MessageEvent('message',{origin:'https://forms.example.test',source:f.contentWindow,data:{type:'kebabstack.forms.ready'}}));assert.equal(sent[0].type,'kebabstack.forms.host');assert.equal(sent[1],'https://forms.example.test');dom.window.close();
});
