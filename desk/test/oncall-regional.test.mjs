import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateRegionalPlan,continueRegionalRecipe} from '../dist/oncall-regional.js';
import {localInstant} from '../dist/oncall-planning.js';
const region=(name,timezone,person)=>({name,timezone,startMinute:480n,endMinute:1200n,days:[0n,1n,2n,3n,4n,5n,6n],holidays:[],primary:[person],backup:[],backupMode:{none:null}});
const recipe={startDate:'2026-03-02',weeks:5n,timezone:'UTC',rotationDays:7n,requirement:{continuous:null},regions:[region('Europe','Europe/Zurich','a'),region('America','America/Los_Angeles','b')]};
const at=(p,date,time)=>p.shifts.find(s=>s.layer===0n&&s.startAt<=localInstant(date+'T'+time,'UTC')&&s.endAt>localInstant(date+'T'+time,'UTC'))?.personId;
test('EU/US clock-change weeks keep local hours and expose uncovered hours instead of inventing 24/7 coverage',()=>{
 const {input:p,summary}=generateRegionalPlan(1n,recipe);
 assert.equal(at(p,'2026-03-06','07:30'),'a');assert.equal(at(p,'2026-03-16','06:30'),undefined);assert.equal(at(p,'2026-03-30','06:30'),'a');
 assert.equal(at(p,'2026-03-06','03:30'),'b');assert.equal(at(p,'2026-03-16','03:30'),undefined);
 assert.ok(summary.missingHours>0);assert.equal(summary.hours.reduce((a,b)=>a+b,0)+summary.missingHours,35*24);
 for(let i=0;i<p.shifts.length;i++)for(let j=0;j<i;j++)assert.ok(!(p.shifts[i].layer===p.shifts[j].layer&&p.shifts[i].startAt<p.shifts[j].endAt&&p.shifts[j].startAt<p.shifts[i].endAt));
 assert.equal(p.windows[0].startAt,p.startAt);assert.equal(p.windows[0].endAt,p.endAt);
});
test('priority trims overlap explicitly and regional-only hours omit only intentional gaps',()=>{
 const both=[region('First','UTC','a'),region('Second','UTC','b')];
 const a=generateRegionalPlan(1n,{...recipe,weeks:1n,regions:both}),b=generateRegionalPlan(1n,{...recipe,weeks:1n,regions:both.toReversed()});
 assert.equal(a.summary.overlapHours[1],84);assert.ok(a.input.shifts.every(s=>s.personId==='a'));assert.ok(b.input.shifts.every(s=>s.personId==='b'));
 const p=generateRegionalPlan(1n,{...recipe,weeks:1n,regions:both,requirement:{regional:null}});assert.equal(p.summary.missingHours,0);assert.equal(p.input.windows.reduce((n,w)=>n+Number(w.endAt-w.startAt)/3.6e12,0),84);
});
test('weekend and regional holiday backups neither become primary nor create weekday backup requirements',()=>{
 const eu={...region('Europe','Europe/Zurich','a'),days:[1n,2n,3n,4n,5n],holidays:['2026-03-04'],backup:['c'],backupMode:{nonworking:null}};
 const p=generateRegionalPlan(1n,{...recipe,weeks:1n,regions:[eu]}).input;
 const has=(day,layer)=>p.shifts.some(s=>s.layer===layer&&s.startAt<=localInstant(day+'T12:00','Europe/Zurich')&&s.endAt>localInstant(day+'T12:00','Europe/Zurich'));
 assert.equal(has('2026-03-03',1n),false);assert.equal(has('2026-03-04',1n),true);assert.equal(has('2026-03-07',1n),true);assert.equal(has('2026-03-04',0n),false);
});
test('overnight shifts clip to the plan, count elapsed autumn hours and reject ambiguous handoffs or double duty',()=>{
 const full={...region('Night','Europe/Zurich','a'),startMinute:0n,endMinute:1440n};const p=generateRegionalPlan(1n,{...recipe,startDate:'2026-10-19',weeks:1n,timezone:'Europe/Zurich',regions:[full]}).input;
 assert.equal(p.endAt-p.startAt,169n*3600000000000n);assert.equal(p.shifts.reduce((n,s)=>n+s.endAt-s.startAt,0n),p.endAt-p.startAt);
 assert.throws(()=>generateRegionalPlan(1n,{...recipe,startDate:'2026-10-19',weeks:1n,regions:[{...full,startMinute:150n,endMinute:360n}]}),/occurs twice/);
 assert.throws(()=>generateRegionalPlan(1n,{...recipe,regions:[{...full,backup:['a'],backupMode:{always:null}}]}),/simultaneously/);
 assert.throws(()=>generateRegionalPlan(1n,{...recipe,regions:[{...full,holidays:['2026-02-31']}]}),/real holiday/);
});
test('continuation advances regional rotations by elapsed local calendar days and keeps inputs immutable',()=>{
 const r={...recipe,regions:[{...recipe.regions[0],primary:['a','b','c'],holidays:['2026-03-05','2026-12-25']} ]},next=continueRegionalRecipe(r,'2026-03-16');
 assert.deepEqual(next.regions[0].primary,['c','a','b']);assert.deepEqual(next.regions[0].holidays,['2026-12-25']);assert.deepEqual(r.regions[0].primary,['a','b','c']);
});
