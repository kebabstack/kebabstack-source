// The relay's pure logic: a parsed mail → the intake meta + attachment parts the contracts canister takes,
// and the three-step hand-in (intakeBegin → intakeChunk… → intakeCommit). No Workers globals besides
// `crypto.subtle` and TextEncoder/TextDecoder, so `node --test` covers it end to end.
//
// Caps mirror the canister (contracts/backend/main.mo: MAX_TEXT 200 KB, MAX_HTML 500 KB, MAX_ATTACHMENT
// 1.5 MB, MAX_ATTACHMENTS 10, MAX_EXTRACT 60 KB) with a little headroom so the relay never gets a
// "too large" back for something it could have trimmed itself.
export const CAPS = { textBytes: 190_000, htmlBytes: 480_000, attachmentBytes: 1_500_000, attachments: 10, chunkBytes: 1_500_000, pdfPages: 40, extractBytes: 60_000 };

const enc = new TextEncoder();
export const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256Hex = async (bytes) => hexOf(await crypto.subtle.digest("SHA-256", bytes));
/** postal-mime hands attachment content as ArrayBuffer (binary) or string (text parts) — always bytes here. */
export const bytesOf = (content) => content instanceof Uint8Array ? content : content instanceof ArrayBuffer ? new Uint8Array(content) : typeof content === "string" ? enc.encode(content) : new Uint8Array(content || []);
/** Cut a text to at most `maxBytes` UTF-8 bytes (never inside a code point) and mark the cut. */
export function clipBytes(s, maxBytes, marker = "\n[relay: text cut]") {
  s = String(s || "");
  const b = enc.encode(s);
  if (b.length <= maxBytes) return s;
  const keep = Math.max(0, maxBytes - enc.encode(marker).length);
  return new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, keep)).replace(/�+$/, "") + marker;
}
export const addresses = (list) => (list || []).map((a) => String((a && a.address) || "").trim().toLowerCase()).filter(Boolean);
/** Split bytes into ≤ chunkBytes pieces (in order). */
export function chunks(bytes, chunkBytes = CAPS.chunkBytes) { const out = []; for (let off = 0; off < bytes.length; off += chunkBytes) out.push(bytes.subarray(off, off + chunkBytes)); return out.length ? out : [bytes]; }
const stripHtml = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/**
 * parsed (postal-mime) + envelope { to, from, raw? } → { meta, parts, notes }.
 * opts.extractPdf(bytes) → text|null runs on text PDFs (the worker plugs unpdf in; tests plug a stub).
 * opts.mailbox overrides the mailbox (default: the envelope recipient, i.e. the contracts address).
 */
export async function buildIntake(parsed, envelope, opts = {}) {
  const notes = [];
  let incomplete = false;
  const fromAddr = String((parsed.from && parsed.from.address) || envelope.from || "").toLowerCase();
  const fromName = String((parsed.from && parsed.from.name) || "").trim();
  let text = parsed.text && parsed.text.trim() ? parsed.text : stripHtml(parsed.html);
  const parts = [];
  const attachments = [];
  for (const a of parsed.attachments || []) {
    const name = a.filename || (a.contentId ? "inline-" + a.contentId.replace(/[<>]/g, "") : "attachment");
    const bytes = bytesOf(a.content);
    if (!bytes.length) continue;
    if (bytes.length > CAPS.attachmentBytes) { incomplete = true; notes.push(`${name} (${(bytes.length / 1e6).toFixed(1)} MB) left out — over the 1.5 MB cap`); continue; }
    if (attachments.length >= CAPS.attachments) { incomplete = true; notes.push(`${name} left out — more than ${CAPS.attachments} files`); continue; }
    const mime = String(a.mimeType || "application/octet-stream").toLowerCase();
    let textExtract = "";
    if (opts.extractPdf && (mime === "application/pdf" || /\.pdf$/i.test(name))) {
      try { const t = await opts.extractPdf(bytes); if (t && t.trim()) textExtract = clipBytes(t, CAPS.extractBytes, "\n[relay: extract cut]"); } catch (e) { notes.push(`${name}: text could not be read (${String(e && e.message || e).slice(0, 80)})`); }
    }
    attachments.push({ name: name.slice(0, 200), mime, size: BigInt(bytes.length), sha256: await sha256Hex(bytes), textExtract, link: "" });
    parts.push({ index: attachments.length - 1, bytes });
  }
  if (notes.length) text = (text ? text + "\n\n" : "") + "[relay] " + notes.join("; ");
  const references = Array.isArray(parsed.references) ? parsed.references.join(" ") : String(parsed.references || "");
  const meta = {
    kind: "relay",
    mailbox: String(opts.mailbox || envelope.to || "").toLowerCase(),
    // a stable id for this delivery, so a redelivery by the sending server is refused before any bytes travel
    providerId: envelope.raw ? "raw:" + (await sha256Hex(bytesOf(envelope.raw))).slice(0, 40) : "",
    messageId: String(parsed.messageId || "").trim(),
    inReplyTo: String(parsed.inReplyTo || "").trim(),
    references: references.slice(0, 2000),
    fromAddr, fromName,
    to: addresses(parsed.to), cc: addresses(parsed.cc),
    subject: String(parsed.subject || "(no subject)").slice(0, 500),
    sentAt: parsed.date && !Number.isNaN(new Date(parsed.date).getTime()) ? new Date(parsed.date).toISOString() : "",
    text: clipBytes(text, CAPS.textBytes),
    html: (() => { const h = String(parsed.html || ""); return enc.encode(h).length <= CAPS.htmlBytes ? h : ""; })(),
    attachments,
  };
  return { meta, parts, notes, incomplete };
}

/**
 * The three-step hand-in against an actor with intakeBegin/intakeChunk/intakeCommit.
 * Returns { ok, duplicate, sourceId, status, detail }. Throws only on transport errors (so callers can retry).
 */
export async function handIn(actor, tok, meta, parts) {
  const b = await actor.intakeBegin(tok, meta);
  if (!b.ok) return { ok: false, duplicate: /^duplicate/i.test(b.detail), sourceId: Number(b.id || 0), status: "", detail: b.detail };
  for (const p of parts) {
    for (const c of chunks(p.bytes)) {
      const r = await actor.intakeChunk(tok, b.id, BigInt(p.index), c);
      if (!r.ok) return { ok: false, duplicate: false, sourceId: 0, status: "", detail: `chunk of ${meta.attachments[p.index].name}: ${r.detail}` };
    }
  }
  const c = await actor.intakeCommit(tok, b.id);
  return { ok: c.ok, duplicate: /duplicate/i.test(c.status || "") || /^duplicate/i.test(c.detail || ""), sourceId: Number(c.sourceId || 0), status: c.status || "", detail: c.detail || "" };
}

/** Retry a thrown promise (transport errors) with backoff; the last error is rethrown. */
export async function withRetry(fn, attempts = 3, delayMs = (i) => 400 * 2 ** i, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(i); } catch (e) { last = e; if (i + 1 < attempts) await sleep(delayMs(i)); }
  }
  throw last;
}
