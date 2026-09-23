import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer} from '@dfinity/pic';

test('shared JSON sanitation parses large certificate arrays without a deep text rope, preserving escaped literals', {timeout:120000}, async()=>{
  const cwd=resolve('watch'),mops=resolve('node_modules/.bin/mops');
  const moc=execFileSync(mops,['toolchain','bin','moc'],{cwd,encoding:'utf8'}).trim();
  const sources=execFileSync(mops,['sources'],{cwd,encoding:'utf8'}).trim().split(/\s+/);
  const wasm=resolve('test-results/json-safety.wasm');mkdirSync(resolve('test-results'),{recursive:true});
  execFileSync(moc,[...sources,resolve('tests/fixtures/sdk/JsonSafety.mo'),'-o',wasm],{cwd,stdio:'pipe'});
  const server=await PocketIcServer.start(),pic=await PocketIc.create(server.getUrl());
  try {
    const {actor}=await pic.setupCanister({wasm,idlFactory:({IDL})=>IDL.Service({sanitize:IDL.Func([IDL.Text],[IDL.Text],['query']),parseRows:IDL.Func([IDL.Text],[IDL.Opt(IDL.Nat)],['query'])})});
    const body=JSON.stringify(Array.from({length:2700},(_,id)=>({issuer_name:'C=US, O=Example CA, CN=Issuer',name_value:'example.test\nwww.example.test',not_after:'2027-01-01T00:00:00',id})));
    assert.ok(body.length>350000 && body.length<400000);
    assert.deepEqual(await actor.parseRows(body),[2700n]);
    assert.equal(await actor.sanitize('x'.repeat(1_400_000)),'x'.repeat(1_400_000));
    for(const text of ['Zürich 😀',String.raw`literal \\uD83D`,String.raw`literal \\uDE00`,String.raw`\\\\uD800`]){
      const json=JSON.stringify({text});assert.equal(await actor.sanitize(json),json);
    }
    assert.equal(await actor.sanitize(String.raw`{"text":"\uD83D\uDE00"}`),'{"text":"??"}');
    assert.equal(await actor.sanitize(String.raw`{"text":"\uD8GG"}`),String.raw`{"text":"\uD8GG"}`,'malformed JSON is not silently repaired');
  } finally {await pic.tearDown();await server.stop()}
});
