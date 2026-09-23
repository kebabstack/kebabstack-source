import {context} from './canvas-context.mjs';import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {build} from 'esbuild';import {JSDOM} from 'jsdom';import {registerGameTools} from '../src/game-tools.js';
test('game tools validate input and use the live reset action',()=>{
 const tools=[];let state={phase:'flying',boosts:2};const stop=registerGameTools({registerTool:t=>tools.push(t)},{read:()=>({...state}),restart:()=>{state={phase:'ready',boosts:5};}});
 assert.deepEqual(tools.map(t=>t.name),['read_flight','restart_flight']);assert.equal(tools[0].execute({}).phase,'flying');assert.throws(()=>tools[1].execute({invalid:true}));assert.equal(state.phase,'flying');assert.deepEqual(tools[1].execute({}),{phase:'ready',boosts:5});stop();
});
test('real entrypoint charges, launches, fires, boosts, pauses and restarts offline',async()=>{
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://pixel.example.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;let frame;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=cb=>{frame=cb;return 1;};w.HTMLCanvasElement.prototype.getContext=()=>context();w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const errors=[];w.console.error=e=>errors.push(String(e));
 const bundle=await build({entryPoints:[new URL('../src/main.js',import.meta.url).pathname],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'offline-api',setup(b){b.onResolve({filter:/hub-client\.js$/},()=>({path:new URL('../../sdk/js/hub-client.js',import.meta.url).pathname}));b.onResolve({filter:/client-api\.js$/},()=>({path:'api',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"export async function connect(){throw Error('Offline test')}"}));}}]});
 try{
  w.eval(bundle.outputFiles[0].text);await new Promise(r=>setTimeout(r,20));assert.deepEqual(errors,[]);assert.ok(w.document.body.classList.contains('loaded'));
  assert.equal(w.document.querySelector('#tiltBtn, #steeringDialog, #touchSteer, #cameraBtn'),null);
  for(const code of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS']){const e=new w.KeyboardEvent('keydown',{code,bubbles:true,cancelable:true});w.document.dispatchEvent(e);assert.equal(e.defaultPrevented,false);}
  const key=(type,code)=>w.document.dispatchEvent(new w.KeyboardEvent(type,{code,bubbles:true}));let now=100;const frames=n=>{for(let i=0;i<n;i++){now+=1000/60;frame(now);}};
  key('keydown','Space');frames(45);assert.match(w.document.getElementById('actionText').textContent,/CHARGING|PERFECT/);key('keyup','Space');frames(5);assert.ok(w.document.body.classList.contains('is-playing'));
  key('keydown','KeyF');frames(20);key('keyup','KeyF');key('keydown','Space');key('keyup','Space');frames(5);assert.match(w.document.getElementById('boostPips').getAttribute('aria-label'),/^4 /);
  key('keydown','KeyP');assert.ok(w.document.getElementById('pauseDialog').open);w.document.getElementById('resumeBtn').click();assert.equal(w.document.getElementById('pauseDialog').open,false);
  key('keydown','KeyR');frames(5);assert.equal(w.document.body.classList.contains('is-playing'),false);assert.match(w.document.getElementById('boostPips').getAttribute('aria-label'),/^5 /);assert.deepEqual(errors,[]);
 }finally{w.close();}
});
