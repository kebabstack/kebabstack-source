import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {enhanceTable,enhanceSelect,enhanceForm,observeWorkspace} from '../sdk/js/workspace-ui.js';
import {mountEvidenceViewer} from '../sdk/js/evidence-viewer.js';
function setup(html){const dom=new JSDOM(html,{url:'https://example.test/'});Object.assign(globalThis,{document:dom.window.document,MutationObserver:dom.window.MutationObserver,location:dom.window.location});return dom;}
const tick=()=>new Promise(r=>setImmediate(r));
test('table sorting keeps links/actions attached to records; numeric raw values, blanks and reset remain correct',()=>{
 const dom=setup('<form><div class="table-scroll"><table data-ks-table><thead><tr><th>Name</th><th data-ks-sort="number">Count</th><th data-ks-sort="none">Action</th></tr></thead><tbody><tr id="a"><td>Item 10</td><td data-sort-value="1000">1,000</td><td><button type="button">Open A</button></td></tr><tr id="b"><td>Item 2</td><td data-sort-value="0">0</td><td><button type="button">Open B</button></td></tr><tr id="c"><td>Item 3</td><td data-sort-value="">—</td><td></td></tr></tbody></table></div></form>');
 const table=document.querySelector('table');let clicked=false;document.querySelector('#a button').onclick=()=>clicked=true;const state=enhanceTable(table);
 table.tHead.querySelectorAll('button')[1].click();assert.deepEqual([...table.tBodies[0].rows].map(r=>r.id),['b','a','c']);table.tHead.querySelectorAll('button')[1].click();assert.deepEqual([...table.tBodies[0].rows].map(r=>r.id),['a','b','c']);document.querySelector('#a button').click();assert.ok(clicked);
 const search=document.querySelector('[type=search]');search.value='item 2';search.dispatchEvent(new dom.window.Event('input'));assert.equal(document.querySelector('#a').hidden,true);assert.equal(document.querySelector('#b').hidden,false);assert.match(document.querySelector('[role=status]').textContent,/1 of 3/);
 const cb=document.querySelector('[type=checkbox]');cb.checked=false;cb.dispatchEvent(new dom.window.Event('change'));assert.equal(table.rows[1].cells[1].hidden,true);
 [...document.querySelectorAll('button')].find(b=>b.textContent==='Reset table view').click();assert.deepEqual([...table.tBodies[0].rows].map(r=>r.id),['a','b','c']);assert.ok(!table.rows[1].cells[1].hidden);assert.ok(!table.rows[1].hidden);state.destroy();dom.window.close();
});
test('editable grids and existing sort controls are not intercepted',()=>{
 const dom=setup('<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td><input value="draft"></td></tr></tbody></table>');assert.equal(enhanceTable(document.querySelector('table')),undefined);assert.equal(document.querySelector('.ks-table-tools'),null);dom.window.close();
});
test('loaded report cardinality and refreshed rows remain exact without assuming server-wide totals',async()=>{
 const dom=setup('<main><table data-ks-table><thead><tr><th>Name</th><th data-ks-sort="number">Count</th></tr></thead><tbody>'+Array.from({length:1000},(_,i)=>`<tr><td>Group ${i}</td><td>${1000-i}</td></tr>`).join('')+'</tbody></table></main>');const stop=observeWorkspace();const table=document.querySelector('table');table.tHead.querySelectorAll('button')[1].click();assert.equal(table.rows[1].cells[1].textContent,'1');assert.equal(table.rows[1000].cells[1].textContent,'1000');
 table.tBodies[0].innerHTML='<tr><td>Replacement</td><td>20</td></tr>';await tick();assert.match(document.querySelector('[role=status]').textContent,/1 of 1 loaded/);assert.equal(document.querySelectorAll('.ks-table-tools').length,1);stop();dom.window.close();
});
test('option search retains selected value and never submits on Enter',()=>{
 const dom=setup('<form><label>Time zone<select>'+Array.from({length:30},(_,i)=>`<option value="${i}">Zone ${i}</option>`).join('')+'</select></label></form>');const select=document.querySelector('select');select.value='22';enhanceSelect(select);const search=document.querySelector('input');assert.equal(search.getAttribute('aria-label'),'Find Time zone');search.value='Zone 1';search.dispatchEvent(new dom.window.Event('input'));assert.equal(select.value,'22');assert.equal(select.selectedOptions[0].hidden,false);assert.equal(select.options[3].hidden,true);const e=new dom.window.KeyboardEvent('keydown',{key:'Enter',cancelable:true});search.dispatchEvent(e);assert.equal(e.defaultPrevented,true);assert.equal(document.activeElement,select);dom.window.close();
});
test('native form errors identify the invalid field and clear when corrected',()=>{
 const dom=setup('<form><label>Device name<input name="name" required></label><button>Save</button></form>');const form=document.querySelector('form');enhanceForm(form);assert.equal(form.checkValidity(),false);const input=form.elements.name;assert.equal(input.getAttribute('aria-invalid'),'true');const link=form.querySelector('.ks-form-errors a');assert.match(link.textContent,/Device name/);link.click();assert.equal(document.activeElement,input);input.value='Example';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(form.querySelector('.ks-form-errors').textContent,'');dom.window.close();
});
test('shared evidence viewer discards stale source responses and releases image URLs',async()=>{
 const dom=setup('<section></section>');const root=document.querySelector('section');let resolve,revoked=0;const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:example';URL.revokeObjectURL=()=>revoked++;
 const docs=[{id:1,name:'Example',mime:'image/png'}];let stale=false;
 let dispose=mountEvidenceViewer(root,{documents:docs,load:()=>new Promise(r=>resolve=r),stale:()=>stale});stale=true;resolve({mime:'image/png',bytes:new Uint8Array([1])});await tick();assert.equal(root.querySelector('img'),null);dispose();stale=false;
 dispose=mountEvidenceViewer(root,{documents:docs,load:async()=>({mime:'image/png',bytes:new Uint8Array([1])})});await tick();assert.ok(root.querySelector('img'));const zoom=root.querySelector('[data-zoom]');zoom.value='2';zoom.dispatchEvent(new dom.window.Event('change'));assert.equal(root.querySelector('img').style.width,'480px');dispose();assert.equal(revoked,1);assert.equal(root.querySelector('img'),null);
 let requested=false;dispose=mountEvidenceViewer(root,{documents:[{id:2,name:'unsafe',mime:'text/html'}],load:async()=>requested=true});assert.equal(requested,false);assert.equal(root.querySelector('iframe'),null);dispose();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();
});
test('replacement table body is observed and editable transitions cannot retain hidden fields',async()=>{
 const dom=setup('<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table>');const table=document.querySelector('table');const state=enhanceTable(table);const search=document.querySelector('[type=search]');search.value='missing';search.dispatchEvent(new dom.window.Event('input'));assert.equal(table.rows[1].hidden,true);
 const body=document.createElement('tbody');body.innerHTML='<tr><td>New</td><td>2</td></tr>';table.tBodies[0].replaceWith(body);await tick();assert.match(document.querySelector('[role=status]').textContent,/0 of 1/);
 body.rows[0].cells[1].innerHTML='<input value="draft">';await tick();assert.equal(body.rows[0].hidden,false);assert.equal(document.querySelector('.ks-table-tools').hidden,true);assert.equal(body.querySelector('input').value,'draft');state.destroy();dom.window.close();
});
