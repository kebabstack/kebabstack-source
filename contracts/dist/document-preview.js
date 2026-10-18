import {mountEvidenceViewer} from './evidence-viewer.js';
export function mountDocumentPreview(root,{documents,load,stale}){
 const files=documents.filter(d=>Number(d.size)>0&&['application/pdf','image/png','image/jpeg','image/webp','image/gif'].includes(d.mime));
 if(!files.length){root.remove();return ()=>{};}
 root.className='scard document-preview';
 return mountEvidenceViewer(root,{documents:files,load:id=>load(BigInt(id)),stale,openPdf:async bytes=>(await import('./vendor/pdf-text.js')).openPdf(bytes)});
}
