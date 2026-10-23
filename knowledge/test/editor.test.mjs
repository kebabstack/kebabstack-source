import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
test('rich editor retains structured formatting and strips executable pasted content',async()=>{
 const dom=new JSDOM('<main><div id="editor"></div><div id="toolbar"></div></main>',{pretendToBeVisual:true,url:'https://knowledge.example.test'});
 const saved=new Map();for(const name of ['window','document','navigator','Node','HTMLElement','Element','Text','MutationObserver','DOMParser','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));const value=dom.window[name];if(value!==undefined)Object.defineProperty(globalThis,name,{value:typeof value==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name)?value.bind(dom.window):value,configurable:true,writable:true});}
 try{const {createEditor,toolbar}=await import('../dist/editor.js');const ed=createEditor(document.getElementById('editor'),{content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Verified network procedure'}]}]}});toolbar(ed,document.getElementById('toolbar'));
 ed.commands.selectAll();ed.commands.toggleBold();assert.equal(ed.getJSON().content[0].content[0].marks[0].type,'bold');ed.commands.toggleHeading({level:2});assert.equal(ed.getJSON().content[0].type,'heading');
 ed.commands.toggleOrderedList();assert.deepEqual({...ed.getJSON().content[0].attrs},{start:1,type:null});
 ed.commands.setContent('<p>Readable <strong>solution</strong><script>alert(1)</script><img src="https://outside.invalid/track" onerror="alert(1)"><a href="javascript:alert(1)">unsafe link</a></p>');assert.doesNotMatch(ed.getHTML(),/<script|<img|javascript:|onerror/);assert.match(ed.getText(),/Readable/);assert.equal(document.querySelector('[aria-label="Text formatting"]').querySelectorAll('button').length,11);ed.destroy();
 }finally{dom.window.close();for(const [name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
