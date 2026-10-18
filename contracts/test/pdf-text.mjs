// Exercise the shipped bundle, including cleanup; a successful decode must not be
// converted into a manual-review fallback by a mismatched PDF.js lifecycle API.
import assert from 'node:assert/strict';
import {readPdfText} from '../dist/vendor/pdf-text.js';
const stream='BT /F1 10 Tf 20 350 Td (Example agreement. Annual fee: EUR 1500.) Tj ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Annot /Subtype /Link /Rect [20 320 150 340] /A << /S /URI /URI (https://example.com/legal/terms) >> >>'];
let pdf='%PDF-1.4\n';const offsets=[];
objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
const xref=pdf.length;
pdf+='xref\n0 7\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
assert.match(await readPdfText(new TextEncoder().encode(pdf)),/Example agreement\. Annual fee: EUR 1500\./);
assert.match(await readPdfText(new TextEncoder().encode(pdf)), /Linked URL: https:\/\/example\.com\/legal\/terms/);
console.log('contracts PDF bundle: text extraction and cleanup passed');
// Signed PDFs may paint values before labels. Read their visual row positions.
const {readingOrder}=await import('../dist/vendor/pdf-text.js');
const item=(str,x,y)=>({str,height:10,transform:[10,0,0,10,x,y]});
assert.equal(readingOrder([item('12/03/2027',150,90),item('Contract Start Date*:',10,100),item('13/03/2026',150,100),item('Contract End Date*:',10,90)]),'Contract Start Date*: 13/03/2026\nContract End Date*: 12/03/2027');
console.log('contracts PDF reading order: labels and date values stay together');
