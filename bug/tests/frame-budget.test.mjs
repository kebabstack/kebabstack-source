import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameBudget } from '../src/frame-budget.js';

test('smooth 60/40 Hz rendering and isolated hitches retain full visual detail',()=>{
  for (const ms of [16.67, 25]) {
    const budget=new FrameBudget();
    for(let i=0;i<180;i++)budget.sample(i===50?200:ms);
    assert.equal(budget.level,0);
  }
});
test('sustained slow rendering steps down twice and never oscillates during play',()=>{
  const budget=new FrameBudget();
  for(let i=0;i<24;i++)budget.sample(60);
  assert.equal(budget.level,1);
  for(let i=0;i<120;i++)budget.sample(16.67);
  assert.equal(budget.level,1);
  for(let i=0;i<48;i++)budget.sample(50);
  assert.equal(budget.level,2);
  for(let i=0;i<120;i++)budget.sample(8);
  assert.equal(budget.level,2);
});
test('pauses, hidden tabs and resume gaps cannot trigger a quality reduction',()=>{
  const budget=new FrameBudget();
  for(let i=0;i<200;i++)budget.sample(80,false);
  for(let i=0;i<23;i++)budget.sample(60);
  budget.sample(5000);
  for(let i=0;i<60;i++)budget.sample(16.67);
  assert.equal(budget.level,0);
});
