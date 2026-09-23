import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';import {JSDOM} from 'jsdom';
import {readMode,modeUrl,mountModeSwitcher,updateModeSwitchers} from '../src/mode.js';
import {context} from './canvas-context.mjs';
test('mode URLs stay on the same origin, remember valid choices and discard login fragments',()=>{
 assert.equal(readMode('?mode=2d'),'2d');assert.equal(readMode('?mode=3d','2d'),'3d');assert.equal(readMode('','2d'),'2d');assert.equal(readMode('?mode=untrusted','2d'),'3d');
 assert.equal(modeUrl('2d','https://play.example.test/?test=1#uht=secret'),'https://play.example.test/?test=1&mode=2d');assert.throws(()=>modeUrl('external','https://play.example.test/'));
});
test('start and result mode switches cannot discard an active or publishing flight',async()=>{
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8'),dom=new JSDOM(html);const doc=dom.window.document;let run={phase:'ready'},chosen=[];
 globalThis.location={href:'https://play.example.test/'};
 const cleanup=mountModeSwitcher({getRun:()=>run,doc,storage:{setItem(){}},navigate:url=>chosen.push(url)});
 const buttons=[...doc.querySelectorAll('[data-flight-mode="2d"]')];assert.equal(buttons.length,2);
 buttons[0].click();assert.equal(chosen.length,1);
 for(const phase of ['charging','flying']){run={phase};updateModeSwitchers(run,doc);buttons[1].click();assert.equal(chosen.length,1);}
 run={phase:'done',publishing:true};updateModeSwitchers(run,doc);buttons[1].click();assert.equal(chosen.length,1);
 run.publishing=false;updateModeSwitchers(run,doc);buttons[1].click();assert.equal(chosen.length,2);cleanup();dom.window.close();delete globalThis.location;
});
for(const mode of ['2d','3d'])test(`shared entrypoint loads only ${mode} controls, launches, pauses and resets`,async()=>{
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:`https://game.example.test/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let frame;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=cb=>{frame=cb;return 1;};w.HTMLCanvasElement.prototype.getContext=()=>context();w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const insert=w.document.head.insertBefore.bind(w.document.head);w.document.head.insertBefore=(element,before)=>{const out=insert(element,before);if(element.tagName==='LINK')setTimeout(()=>element.dispatchEvent(new w.Event('load')),0);return out;};
 const errors=[];w.console.error=e=>errors.push(String(e));
 const bundle=await build({entryPoints:[new URL('../src/entry.js',import.meta.url).pathname],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'offline',setup(b){
  b.onResolve({filter:/hub-client\.js$/},()=>({path:new URL('../../sdk/js/hub-client.js',import.meta.url).pathname}));
  b.onResolve({filter:/client-api\.js$/},()=>({path:'api',namespace:'test'}));
  b.onResolve({filter:/^\.\/scene\.js$/},args=>args.importer.endsWith('/src/main.js')?{path:'scene',namespace:'test'}:null);
  b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='api'?"export async function connect(){throw Error('Offline test')}":"export class GameView {constructor(host){this.renderer={domElement:document.createElement('canvas')};host.append(this.renderer.domElement);this.objects=[];this.cameraMode='chase';}reset(){}update(run){window.flightPosition={x:run.x,d:run.d};}ensureWorld(){}event(){}}"}));
 } }]});
 try{w.eval(bundle.outputFiles[0].text);await new Promise(r=>setTimeout(r,40));assert.deepEqual(errors,[]);assert.ok(w.document.body.classList.contains('loaded'));assert.equal(w.document.body.dataset.mode,mode);assert.equal(Boolean(w.document.getElementById('tiltBtn')),mode==='3d');assert.equal(w.document.querySelectorAll('[data-flight-mode]').length,4);
  assert.equal(w.document.getElementById('steeringDialog')?.open||false,false,'mode selection must precede any phone chooser');
  let now=100;const frames=n=>{for(let i=0;i<n;i++){now+=1000/60;frame(now);}};const key=(type,code,target=w.document)=>target.dispatchEvent(new w.KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  const angle=w.document.getElementById('angle');angle.focus();angle.value='46';angle.dispatchEvent(new w.Event('input'));
  key('keydown','Space',angle);frames(45);key('keyup','Space',angle);frames(5);assert.ok(w.document.body.classList.contains('is-playing'));assert.ok([...w.document.querySelectorAll('[data-flight-mode]')].every(b=>b.disabled));
  if(mode==='3d'){
   const canvas=w.document.querySelector('#world canvas');
   const mouse=buttons=>{const e=new w.Event('pointermove',{bubbles:true});Object.assign(e,{pointerType:'mouse',buttons,clientX:1000,clientY:100});canvas.dispatchEvent(e);};
   const x=w.flightPosition.x;mouse(0);frames(20);assert.equal(w.flightPosition.x,x,'idle mouse must never steer');
   mouse(1);frames(20);assert.equal(w.flightPosition.x,x,'dragging the mouse must never steer either');
   const right=w.flightPosition.x;key('keydown','KeyA');mouse(1);frames(35);assert.ok(w.flightPosition.x<right,'keyboard steering works while the mouse is held');
   key('keyup','KeyA');w.dispatchEvent(new w.Event('pointerup'));frames(90);const settled=w.flightPosition.x;mouse(0);frames(20);assert.ok(Math.abs(w.flightPosition.x-settled)<.02,'release must stop stale mouse steering');
  }
  key('keydown','KeyP');assert.ok(w.document.getElementById('pauseDialog').open);w.document.getElementById('resumeBtn').click();key('keydown','KeyR');frames(5);assert.equal(w.document.body.classList.contains('is-playing'),false);assert.deepEqual(errors,[]);
  const name=w.document.getElementById('resultName');
  name.focus();key('keydown','Space',name);frames(45);key('keyup','Space',name);frames(5);assert.equal(w.document.body.classList.contains('is-playing'),false,'typing spaces in a callsign never launches');
  if(mode==='2d'){
   const canvas=w.document.querySelector('#world canvas');
   const pointer=(type,x,y)=>{const event=new w.Event(type,{bubbles:true});Object.assign(event,{pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y});canvas.dispatchEvent(event);};
   pointer('pointermove',900,100);assert.equal(w.document.getElementById('angleValue').textContent,'60°');
   pointer('pointerdown',900,100);frames(45);pointer('pointerup',900,100);frames(5);assert.ok(w.document.body.classList.contains('is-playing'));
   key('keydown','KeyR');frames(5);pointer('pointerdown',900,100);frames(5);w.document.getElementById('helpBtn').click();pointer('pointerup',900,100);assert.equal(w.document.body.classList.contains('is-playing'),false);
   assert.deepEqual(errors,[]);
  }
 }finally{w.close();}
});
