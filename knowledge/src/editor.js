import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
const extensions = [StarterKit.configure({heading:{levels:[2,3]},link:false,underline:false,trailingNode:false})];
export function createEditor(element, {content, editable=true, onChange=()=>{}}={}) {
 return new Editor({element,extensions,content,editable,editorProps:{attributes:{class:'document-body',role:'textbox','aria-label':editable?'Document content':'Document preview','aria-multiline':'true',spellcheck:'true'}},onUpdate:({editor})=>onChange(editor.getJSON())});
}
export function toolbar(editor, root) {
 const commands=[['Paragraph','¶',c=>c.setParagraph()],['Heading','H2',c=>c.toggleHeading({level:2})],['Subheading','H3',c=>c.toggleHeading({level:3})],['Bold','B',c=>c.toggleBold()],['Italic','I',c=>c.toggleItalic()],['Bullet list','•',c=>c.toggleBulletList()],['Numbered list','1.',c=>c.toggleOrderedList()],['Quote','“',c=>c.toggleBlockquote()],['Code block','</>',c=>c.toggleCodeBlock()],['Undo','↶',c=>c.undo()],['Redo','↷',c=>c.redo()]];
 root.setAttribute('role','toolbar');root.setAttribute('aria-label','Text formatting');
 commands.forEach(([label,text,action])=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.title=label;b.setAttribute('aria-label',label);b.onmousedown=e=>e.preventDefault();b.onclick=()=>action(editor.chain().focus()).run();root.append(b)});
 const active=[()=>editor.isActive('paragraph'),()=>editor.isActive('heading',{level:2}),()=>editor.isActive('heading',{level:3}),()=>editor.isActive('bold'),()=>editor.isActive('italic'),()=>editor.isActive('bulletList'),()=>editor.isActive('orderedList'),()=>editor.isActive('blockquote'),()=>editor.isActive('codeBlock')];
 const paint=()=>{[...root.children].forEach((b,i)=>{if(i<active.length)b.setAttribute('aria-pressed',String(active[i]()));else b.disabled=i===9?!editor.can().undo():!editor.can().redo();});};editor.on('transaction',paint);paint();
}
