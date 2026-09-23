// Browser uploads and email deliveries use the same authenticated intake protocol.
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export function clipText(text, max) {
  const bytes = enc.encode(String(text || ''));
  if (bytes.length <= max) return String(text || '');
  return new TextDecoder().decode(bytes.subarray(0, max - 80)).replace(/�$/, '') + '\n[Text shortened; review the original document.]';
}
export async function uploadDocument(file, backend, token, progress = () => {}, stale = () => false) {
  const check = () => { if (stale()) throw new Error('Workspace changed. The upload was stopped.'); };
  check(); progress('Reading your document…');
  const isMail = /\.eml$/i.test(file.name) || file.type === 'message/rfc822';
  if (file.size > (isMail ? 16000000 : 1500000)) throw new Error(isMail ? 'Email exceeds 16 MB. Upload a smaller saved email.' : 'This file exceeds 1.5 MB. Please compress the PDF and try again.');
  let m;
  if (isMail) m = await (await import('./vendor/postal-mime.js')).default.parse(await file.arrayBuffer());
  else {
    const bytes = await file.arrayBuffer();
    const mime = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : /\.txt$/i.test(file.name) ? 'text/plain' : 'application/octet-stream');
    m = { subject: file.name, text: mime === 'text/plain' ? new TextDecoder().decode(bytes) : 'Uploaded document: ' + file.name,
      messageId: 'file:' + hex(await crypto.subtle.digest('SHA-256', bytes)), attachments: [{filename:file.name,mimeType:mime,content:bytes}] };
  }
  const attachments = [], parts = [], notes = [];
  for (const a of m.attachments || []) {
    check();
    const bytes = typeof a.content === 'string' ? enc.encode(a.content) : new Uint8Array(a.content || []);
    if (!bytes.length) continue;
    const name = a.filename || 'attachment';
    if (bytes.length > 1500000) throw new Error(`${name} exceeds 1.5 MB. Nothing was uploaded; reduce this attachment first.`);
    if (attachments.length >= 10) throw new Error('This email contains more than 10 attachments. Nothing was uploaded; split it into smaller emails.');
    let textExtract = '';
    if (a.mimeType === 'application/pdf' || /\.pdf$/i.test(name)) {
      try { textExtract = await (await import('./vendor/pdf-text.js')).readPdfText(bytes); }
      catch (_) { notes.push(`${name}: Text extraction unavailable; AI will read the original pages.`); }
    } else if (/^text\//.test(a.mimeType || '')) textExtract = new TextDecoder().decode(bytes);
    if (!textExtract.trim() && (a.mimeType === 'application/pdf' || /^image\//.test(a.mimeType || ''))) notes.push(`${name}: Scan or image detected; AI will read the original visually.`);
    attachments.push({name: name.slice(0,200), mime:a.mimeType || 'application/octet-stream', size:BigInt(bytes.length), sha256:hex(await crypto.subtle.digest('SHA-256',bytes)), textExtract:clipText(textExtract,60000), link:''});
    parts.push(bytes);
  }
  const date = m.date && new Date(m.date);
  const meta = {kind:'eml',mailbox:'',providerId:'',messageId:String(m.messageId || ''),inReplyTo:String(m.inReplyTo || ''),references:(Array.isArray(m.references)?m.references.join(' '):String(m.references||'')).slice(0,2000),fromAddr:m.from?.address || '',fromName:m.from?.name || '',to:(m.to||[]).map(x=>x.address||''),cc:(m.cc||[]).map(x=>x.address||''),subject:(m.subject||file.name).slice(0,500),sentAt:date&&!Number.isNaN(date.getTime())?date.toISOString():'',text:clipText((m.text||'')+(notes.length?'\n[Upload notes] '+notes.join('\n'):''),190000),html:enc.encode(m.html||'').length<=480000?String(m.html||''):'',attachments};
  check(); progress('Saving the original securely…');
  const begin = await backend.intakeBegin(token, meta);
  if (!begin.ok) {
    if (/^duplicate/i.test(begin.detail) && begin.id) return {sourceId:begin.id, duplicate:true, notes};
    throw new Error(begin.detail || 'Upload could not be started.');
  }
  for (let i=0;i<parts.length;i++) { check(); const r=await backend.intakeChunk(token,begin.id,BigInt(i),parts[i]); if(!r.ok)throw new Error(r.detail); }
  check(); const r=await backend.intakeCommit(token,begin.id);
  if(!r.ok)throw new Error(r.detail || 'The original could not be saved.');
  if(!r.sourceId)throw new Error(r.detail || 'This document has already been received and moved to another workspace.');
  return {...r,notes};
}
