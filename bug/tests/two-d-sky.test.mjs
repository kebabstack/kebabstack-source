import test from 'node:test';import assert from 'node:assert/strict';
import { SpaceSky } from '../src/two-d/space-sky.js';
import { context } from './canvas-context.mjs';
test('space art loads progressively, tolerates failure and bounds cached surfaces across resize',()=>{
 const previous=globalThis.Image,created=[];
 globalThis.Image=class {constructor(){created.push(this);this.naturalWidth=1536;this.naturalHeight=1024;}set src(value){this.url=value;}};
 const ctx=context();let surfaces=0;
 const view={w:1440,h:900,baseGround:712,ctx,motionReduced:true,time:0,surface(w,h,draw){surfaces++;draw(ctx);return {};}};
 try {
  const sky=new SpaceSky();sky.draw(view,{d:0});assert.equal(created.length,1);assert.equal(sky.cache.size,0);
  created[0].onload();sky.draw(view,{d:500});assert.equal(created.length,1);assert.equal(sky.cache.size,1);
  sky.draw(view,{d:800});assert.equal(created.length,2);created[1].onerror();
  sky.draw(view,{d:1700});assert.equal(sky.cache.size,1);assert.equal(created.length,2);
  sky.draw(view,{d:2200});assert.equal(created.length,3);created[2].onload();
  sky.draw(view,{d:4000});assert.equal(sky.cache.size,2);
  for(let i=0;i<100;i++)sky.draw(view,{d:4100+i});assert.equal(surfaces,2);
  view.w=390;view.h=844;sky.draw(view,{d:5000});assert.equal(sky.cache.size,1);assert.equal(surfaces,3);assert.equal(created.length,3);
 }finally{globalThis.Image=previous;}
});
