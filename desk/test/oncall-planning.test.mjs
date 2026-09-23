import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localInstant,localAt,generatePlan,effectivePerson} from '../dist/oncall-planning.js';
const hour=3_600_000_000_000n;
const input={projectId:1n,startDate:'2026-03-23',weeks:2,timezone:'Europe/Zurich',handoff:'09:00',rotationDays:7,primary:['a','b'],backup:[]};
test('weekly rotations preserve local handoff through spring and autumn clock changes',()=>{
 const spring=generatePlan(input);assert.equal(spring.shifts[0].endAt-spring.shifts[0].startAt,167n*hour);assert.equal(spring.shifts[1].endAt-spring.shifts[1].startAt,168n*hour);assert.equal(localAt(Number(spring.shifts[0].endAt/1_000_000n),input.timezone),'2026-03-30T09:00');
 const autumn=generatePlan({...input,startDate:'2026-10-19'});assert.equal(autumn.shifts[0].endAt-autumn.shifts[0].startAt,169n*hour);
});
test('nonexistent, repeated and malformed local times cannot be published accidentally',()=>{
 assert.throws(()=>localInstant('2026-03-29T02:30','Europe/Zurich'),/does not exist/);assert.throws(()=>localInstant('2026-10-25T02:30','Europe/Zurich'),/occurs twice/);assert.throws(()=>localInstant('2026-02-31T09:00','UTC'),/valid/);assert.throws(()=>localInstant('2026-01-01T09:00','Bad/Zone'));
 assert.equal(localAt(Number(localInstant('2026-06-01T09:00','Asia/Kathmandu')/1_000_000n),'Asia/Kathmandu'),'2026-06-01T09:00');
});
test('after-hours windows exclude working hours and count real weekend durations',()=>{
 const p=generatePlan({...input,startDate:'2026-03-23',weeks:1,coverage:'afterhours'});
 const mondayNoon=localInstant('2026-03-23T12:00',input.timezone),sunday=localInstant('2026-03-29T12:00',input.timezone);
 assert.equal(p.windows.some(w=>w.startAt<=mondayNoon&&w.endAt>mondayNoon),false);assert.equal(p.windows.some(w=>w.startAt<=sunday&&w.endAt>sunday),true);
 assert.equal(p.shifts.reduce((t,s)=>t+s.endAt-s.startAt,0n),117n*hour);
});
test('backup uses distinct people, validates limits and preserves original coverage until acceptance',()=>{
 assert.throws(()=>generatePlan({...input,backup:['a']}),/primary and backup/);assert.throws(()=>generatePlan({...input,weeks:13}));assert.throws(()=>generatePlan({...input,primary:['a','a']}));
 const p=generatePlan({...input,backup:['c','d']});assert.equal(p.layers.length,2);assert.equal(p.shifts.length,4);
 const plan={input:p},pending={shift:0n,toPersonId:'e',state:{pending:null}};assert.equal(effectivePerson(plan,[pending],0),'a');assert.equal(effectivePerson(plan,[{...pending,state:{accepted:null}}],0),'e');
});
test('explicit holidays change working and after-hours windows without changing 24/7 coverage',()=>{
 const base={...input,startDate:'2026-12-21',weeks:1,holidays:['2026-12-25']},at=localInstant('2026-12-25T12:00',base.timezone);
 assert.equal(generatePlan({...base,coverage:'weekdays'}).windows.some(w=>w.startAt<=at&&w.endAt>at),false);
 assert.equal(generatePlan({...base,coverage:'afterhours'}).windows.some(w=>w.startAt<=at&&w.endAt>at),true);
 assert.deepEqual(generatePlan({...base,holidays:[]}).windows,generatePlan(base).windows);
 assert.throws(()=>generatePlan({...base,holidays:['2026-02-31']}),/valid holiday/);
});
