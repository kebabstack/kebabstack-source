import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('authored GLSL smoothstep calls with constant edges obey the GPU portability contract', async () => {
  // GLSL leaves edge0 >= edge1 undefined. A reversed fade is 1 - smoothstep(low, high, x).
  // This checks the shader contract rather than one driver that happens to accept it.
  const root=new URL('../src/',import.meta.url), invalid=[];
  for(const name of await readdir(root)) {
    if(!name.endsWith('.js'))continue;
    const source=await readFile(new URL(name,root),'utf8');
    for(const match of source.matchAll(/(?<![.\w])smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
      if(Number(match[1])>=Number(match[2]))invalid.push(`${name}: ${match[0]}`);
    }
  }
  assert.deepEqual(invalid,[]);
});
