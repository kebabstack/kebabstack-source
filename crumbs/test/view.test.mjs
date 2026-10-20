import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {chart,bindChart,table} from '../dist/view.js';
function setup(html){const dom=new JSDOM(`<main>${html}</main>`);const root=dom.window.document.querySelector('main');bindChart(root);return {root,win:dom.window};}
test('chart pointer and keyboard expose exact selected metric, missing zero and comparison',()=>{
 const {root,win}=setup(chart([{value:'0',metrics:{visitors:99,pageviews:1234}},{value:'120',metrics:{pageviews:5}}],0,180,{metric:'pageviews',interval:60,previous:{byKey:new Map([[0,9],[60,8],[120,7]])}}));
 const host=root.querySelector('.interactive-chart'),tip=root.querySelector('.chart-tooltip'),points=root.querySelectorAll('[data-chart-point]');
 points[0].dispatchEvent(new win.Event('pointermove',{bubbles:true}));assert.equal(tip.hidden,false);assert.match(tip.textContent,/1970-01-01 00:00: 1,234 pageviews · previous 9/);
 points[1].dispatchEvent(new win.Event('pointermove',{bubbles:true}));assert.match(tip.textContent,/00:01: 0 pageviews · previous 8/);
 points[2].dispatchEvent(new win.Event('pointerdown',{bubbles:true}));assert.match(tip.textContent,/00:02: 5 pageviews/);
 host.focus();host.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.match(tip.textContent,/1,234 pageviews/);
 host.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.match(tip.textContent,/1,234 pageviews/);
 host.dispatchEvent(new win.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.match(root.querySelector('[aria-live]').textContent,/5 pageviews/);
 host.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(tip.hidden,true);
 assert.equal(root.querySelectorAll('tbody tr').length,3);
});
test('single bucket, timezone labels and hostile text remain safe',()=>{
 const {root,win}=setup(chart([],0,1,{labels:[{at:0,text:'Local <img src=x onerror=alert(1)>',short:'Local'}]}));
 const point=root.querySelector('[data-chart-point]');assert.ok(Number(point.getAttribute('width'))>0);point.dispatchEvent(new win.Event('pointermove',{bubbles:true}));
 assert.match(root.querySelector('.chart-tooltip').textContent,/Local <img/);assert.equal(root.querySelector('img'),null);assert.match(root.textContent,/0 visitors/);
 assert.equal(chart([],0,0),'');
});
test('35-row breakdown preserves the last filter, exact counts and safe values',()=>{
 const rows=Array.from({length:35},(_,i)=>({value:i===34?'/last?x="<img>':`/page-${i}`,metrics:{visitors:BigInt(100-i)}}));const {root}=setup(table(rows,'path'));
 const buttons=root.querySelectorAll('button');assert.equal(buttons.length,35);assert.equal(buttons[34].dataset.value,rows[34].value);assert.equal(buttons[34].querySelector('.number').textContent,'66');assert.equal(root.querySelector('img'),null);assert.equal(root.querySelector('[role=region]').tabIndex,0);
 assert.match(table([],'path'),/No data/);
});
