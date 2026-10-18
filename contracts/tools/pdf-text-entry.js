import { getDocumentProxy } from 'unpdf';
// Read horizontal PDF text in page order, not internal drawing order. In signed
// order forms, the original content and overlaid values often occupy different
// streams. Preserve words within a visual row without mixing their labels.
export function readingOrder(items) {
  const runs=items.filter(x=>x.str?.trim()).map((x,i)=>({text:x.str,x:x.transform?.[4]??0,y:x.transform?.[5]??0,height:Math.abs(x.height||x.transform?.[3]||10),i}));
  runs.sort((a,b)=>b.y-a.y||a.x-b.x||a.i-b.i);
  const lines=[];
  for(const run of runs){const last=lines.at(-1);if(last&&Math.abs(last.y-run.y)<=Math.min(last.height,run.height)*0.3)last.runs.push(run);else lines.push({y:run.y,height:run.height,runs:[run]});}
  return lines.map(line=>line.runs.sort((a,b)=>a.x-b.x||a.i-b.i).map(x=>x.text).join(' ')).join('\n');
}
// Local, bounded text extraction. Original pages also reach the visual reader.
export async function readPdfText(bytes) {
  const doc = await getDocumentProxy(bytes.slice(), { isEvalSupported: false, useSystemFonts: true });
  try {
    if (doc.numPages > 50) throw new Error('PDF has more than 50 pages; upload a shorter extract');
    let text = '';
    for (let i = 1; i <= doc.numPages && text.length < 60000; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += '[Page '+i+']\n'+readingOrder(content.items) + '\n';
      // Link annotations often contain the actual terms URL while visible text only says 'Terms'.
      const links=(await page.getAnnotations()).map(a=>a.url).filter(u=>typeof u==='string'&&/^https:\/\//i.test(u));
      for(const url of [...new Set(links)].slice(0,30))text+='Linked URL: '+url.slice(0,1000)+'\n';
      page.cleanup();
    }
    return text.slice(0,60000);
  } finally { await doc.loadingTask.destroy(); }
}

// Shared pinned PDF parser for the local, inert canvas preview.
export const openPdf = bytes => getDocumentProxy(bytes.slice(), { isEvalSupported: false, useSystemFonts: true });
