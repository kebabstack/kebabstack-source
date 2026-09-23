// Renders a sale into a PDF in the browser: page 1 = the invoice with the Swiss QR-bill payment part
// (receipt + payment part per SIX Implementation Guidelines QR-bill v2.3: 62 + 148 mm, Swiss QR Code
// 46 mm with the Swiss cross, structured addresses, SCOR reference), page 2 = the hand-over terms with
// the buyer's online acceptance. A credit note uses the same page without a payment part.
// Everything printed comes from the backend's InvoiceData — the PDF is a picture of the record.
// Needs window.PDFLib (pdf-lib 1.17, vendor/pdf-lib.min.js) and window.qrcode (qrcode-generator 1.4, vendor/qrcode.js).

const MM = 72 / 25.4;
const A4 = [210 * MM, 297 * MM];
const L = {
  en: { receipt: "Receipt", payment: "Payment part", account: "Account / Payable to", reference: "Reference", addinfo: "Additional information", payableBy: "Payable by", currency: "Currency", amount: "Amount", acceptance: "Acceptance point", separate: "Separate before paying in" },
  de: { receipt: "Empfangsschein", payment: "Zahlteil", account: "Konto / Zahlbar an", reference: "Referenz", addinfo: "Zusätzliche Informationen", payableBy: "Zahlbar durch", currency: "Währung", amount: "Betrag", acceptance: "Annahmestelle", separate: "Vor der Einzahlung abzutrennen" },
  fr: { receipt: "Récépissé", payment: "Section paiement", account: "Compte / Payable à", reference: "Référence", addinfo: "Informations supplémentaires", payableBy: "Payable par", currency: "Monnaie", amount: "Montant", acceptance: "Point de dépôt", separate: "A détacher avant le versement" },
  it: { receipt: "Ricevuta", payment: "Sezione pagamento", account: "Conto / Pagabile a", reference: "Riferimento", addinfo: "Informazioni supplementari", payableBy: "Pagabile da", currency: "Valuta", amount: "Importo", acceptance: "Punto di accettazione", separate: "Da staccare prima del versamento" },
};
// Helvetica in pdf-lib is WinAnsi: keep what it can print, replace the rest
const WIN = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""));
export const winAnsi = (s) => String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, (c) => (WIN.has(c) ? c : c === "✓" ? "OK" : c === "→" ? "->" : "?"));
export const fmtMinor = (minor) => { const n = Number(minor); const w = Math.floor(n / 100); return w.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'") + "." + String(n % 100).padStart(2, "0"); };
const groups4 = (t) => String(t).replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

function wrap(text, font, size, maxWidth) {
  const out = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxWidth) line = t;
      else { if (line) out.push(line); line = w; while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) { let cut = line.length - 1; while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--; out.push(line.slice(0, cut)); line = line.slice(cut); } }
    }
    out.push(line);
  }
  return out;
}

/** The Swiss QR Code as vector squares: 46 × 46 mm, error correction M, UTF-8, Swiss cross 7 × 7 mm in the middle. */
export function drawSwissQr(page, payload, x, y, sizeMm = 46) {
  const qrlib = globalThis.qrcode;
  qrlib.stringToBytes = qrlib.stringToBytesFuncs["UTF-8"];
  const qr = qrlib(0, "M"); qr.addData(payload, "Byte"); qr.make();
  const n = qr.getModuleCount(); const size = sizeMm * MM; const mod = size / n;
  const { rgb } = globalThis.PDFLib;
  const black = rgb(0, 0, 0), white = rgb(1, 1, 1);
  page.drawRectangle({ x, y, width: size, height: size, color: white });
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) page.drawRectangle({ x: x + c * mod, y: y + size - (r + 1) * mod, width: mod, height: mod, color: black });
  // Swiss cross: black square with a white cross, 7 × 7 mm incl. a thin white frame
  const cross = 7 * MM, cx = x + size / 2, cy = y + size / 2;
  page.drawRectangle({ x: cx - cross / 2, y: cy - cross / 2, width: cross, height: cross, color: white });
  const sq = cross - 1.2 * MM;
  page.drawRectangle({ x: cx - sq / 2, y: cy - sq / 2, width: sq, height: sq, color: black });
  const arm = 1.17 * MM, len = 3.9 * MM;
  page.drawRectangle({ x: cx - arm / 2, y: cy - len / 2, width: arm, height: len, color: white });
  page.drawRectangle({ x: cx - len / 2, y: cy - arm / 2, width: len, height: arm, color: white });
  return n;
}

/** The payment part + receipt (105 mm high) at the bottom of a page, per IG 2.3 section 3. */
export function drawPaymentPart(page, d, fonts) {
  const { rgb } = globalThis.PDFLib; const { reg, bold } = fonts; const t = L[d.lang] || L.en;
  const black = rgb(0, 0, 0);
  const T = (s, x, y, size, f = reg) => page.drawText(winAnsi(s), { x, y, size, font: f, color: black });
  const H = 105 * MM;
  // separation lines (a PDF has no perforation): text above the horizontal line, dashed lines
  page.drawLine({ start: { x: 0, y: H }, end: { x: 210 * MM, y: H }, thickness: 0.5, color: black, dashArray: [3, 3] });
  page.drawLine({ start: { x: 62 * MM, y: 0 }, end: { x: 62 * MM, y: H }, thickness: 0.5, color: black, dashArray: [3, 3] });
  page.drawText(winAnsi(t.separate), { x: 105 * MM - bold.widthOfTextAtSize(t.separate, 7) / 2, y: H + 1.5 * MM, size: 7, font: bold, color: black });
  const sellerLines = [d.seller.name, `${d.seller.street} ${d.seller.houseNo}`.trim(), `${d.seller.postalCode} ${d.seller.town}`.trim()];
  const buyerLines = [d.buyer.name, `${d.buyer.street} ${d.buyer.houseNo}`.trim(), `${d.buyer.postalCode} ${d.buyer.town}`.trim()];
  // ---- receipt (0–62 mm): title 7 · information 56 · amount 14 · acceptance point 18, margins 5
  let x = 5 * MM, y = H - 5 * MM - 11 * 0.8;
  T(t.receipt, x, y, 11, bold);
  y = H - 12 * MM;
  const rec = (heading, lines) => { T(heading, x, y, 6, bold); y -= 9; for (const l of lines) { if (!l) continue; T(l, x, y, 8); y -= 9; } y -= 3 * MM - 9 + 9; };
  rec(t.account, [groups4(d.ibanPretty), ...sellerLines]);
  if (d.reference) rec(t.reference, [groups4(d.referencePretty)]);
  rec(t.payableBy, buyerLines);
  // amount section: 42 → 28 mm
  T(t.currency, x, 40 * MM, 6, bold); T(t.amount, x + 22 * MM, 40 * MM, 6, bold);
  T(d.currency, x, 40 * MM - 9, 8); T(fmtMinor(d.grossMinor), x + 22 * MM, 40 * MM - 9, 8);
  // acceptance point: right aligned, 28 → 10 mm
  T(t.acceptance, 57 * MM - bold.widthOfTextAtSize(t.acceptance, 6), 24 * MM, 6, bold);
  // ---- payment part (62–210 mm): title 7 · QR 56 (46 + 5 + 5) · amount 22 · further info 10
  x = 67 * MM;
  T(t.payment, x, H - 5 * MM - 11 * 0.8, 11, bold);
  drawSwissQr(page, d.qrPayload, x, 42 * MM, 46);
  T(t.currency, x, 35 * MM, 8, bold); T(t.amount, x + 22 * MM, 35 * MM, 8, bold);
  T(d.currency, x, 35 * MM - 11, 10); T(fmtMinor(d.grossMinor), x + 22 * MM, 35 * MM - 11, 10);
  // information section (x 118 mm, width 87 mm): 93 → 15 mm
  x = 118 * MM; y = H - 12 * MM;
  const info = (heading, lines) => { T(heading, x, y, 8, bold); y -= 11; for (const l of lines) { if (!l) continue; for (const w of wrap(l, reg, 10, 87 * MM)) { T(w, x, y, 10); y -= 11; } } y -= 3 * MM - 11 + 11; };
  info(t.account, [groups4(d.ibanPretty), ...sellerLines]);
  if (d.reference) info(t.reference, [groups4(d.referencePretty)]);
  info(t.addinfo, [`${d.kind === "creditNote" ? "Credit note" : "Invoice"} ${d.number} - ${d.description}`]);
  info(t.payableBy, buyerLines);
}

/** Page 1: the invoice (or credit note). Returns the y where the body ended. */
function drawInvoicePage(page, d, fonts, opts) {
  const { rgb } = globalThis.PDFLib; const { reg, bold } = fonts;
  const black = rgb(0, 0, 0), grey = rgb(0.42, 0.42, 0.45), fill = rgb(0.93, 0.93, 0.94);
  const T = (s, x, y, size, f = reg, color = black) => page.drawText(winAnsi(s), { x, y, size, font: f, color });
  const R = (s, right, y, size, f = reg, color = black) => T(s, right - f.widthOfTextAtSize(winAnsi(s), size), y, size, f, color);
  const left = 20 * MM, right = 190 * MM, width = right - left;
  const credit = d.kind === "creditNote";
  // header
  let y = 297 * MM - 20 * MM;
  T(d.seller.name, left, y, 11, bold); y -= 13;
  for (const l of [`${d.seller.street} ${d.seller.houseNo}`.trim(), `${d.seller.postalCode} ${d.seller.town}`.trim(), d.seller.country === "CH" ? "Switzerland" : d.seller.country]) { T(l, left, y, 9); y -= 11; }
  if (d.seller.uid) T(`${d.seller.uid}${d.seller.vatRegistered ? " MWST" : ""}`, left, y, 9, reg, grey);
  R(credit ? "Credit note" : "Invoice", right, 297 * MM - 20 * MM, 20, bold);
  R(d.number, right, 297 * MM - 28 * MM, 12);
  R(`Date: ${d.issuedOn}`, right, 297 * MM - 33 * MM, 9, reg, grey);
  if (!credit) R(`Due: ${d.dueOn}`, right, 297 * MM - 37 * MM, 9, reg, grey);
  if (credit) R(`Cancels invoice ${d.creditOf}`, right, 297 * MM - 37 * MM, 9, reg, grey);
  // bill to + total box
  y = 297 * MM - 62 * MM;
  T("BILL TO", left, y, 7, bold, grey); y -= 12;
  T(d.buyer.name, left, y, 10, bold); y -= 12;
  for (const l of [`${d.buyer.street} ${d.buyer.houseNo}`.trim(), `${d.buyer.postalCode} ${d.buyer.town}`.trim(), d.buyer.country && d.buyer.country !== "CH" ? d.buyer.country : "", d.buyer.email]) { if (!l) continue; T(l, left, y, 9); y -= 11; }
  const bx = 118 * MM, bw = right - bx, by = 297 * MM - 78 * MM;
  page.drawRectangle({ x: bx, y: by, width: bw, height: 20 * MM, color: fill });
  T(credit ? "CREDITED" : "TOTAL", bx + 4 * MM, by + 20 * MM - 5 * MM, 8, bold);
  R(`${d.currency} ${fmtMinor(d.grossMinor)}`, right - 4 * MM, by + 6 * MM, 18, bold);
  if (!credit) R(`Due ${d.dueOn}`, right - 4 * MM, by + 2 * MM, 8, bold);
  // line items
  y = 297 * MM - 92 * MM;
  page.drawRectangle({ x: left, y: y - 3, width, height: 14, color: fill });
  const cols = [left + 4, left + width * 0.55, left + width * 0.68, left + width * 0.82, right - 4];
  T("ITEM", cols[0], y, 7, bold); R("QTY", cols[1], y, 7, bold); R("NET", cols[2], y, 7, bold); R("VAT", cols[3], y, 7, bold); R("GROSS", cols[4], y, 7, bold);
  y -= 18;
  const descLines = wrap(d.description, reg, 9, width * 0.5);
  T(descLines[0] || "", cols[0], y, 9, bold); R("1", cols[1], y, 9); R(fmtMinor(d.netMinor), cols[2], y, 9); R(`${d.vatRate}%`, cols[3], y, 9); R(fmtMinor(d.grossMinor), cols[4], y, 9);
  for (const l of descLines.slice(1)) { y -= 11; T(l, cols[0], y, 9); }
  y -= 8; page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) });
  y -= 16;
  R("Subtotal (net)", cols[3], y, 9); R(`${d.currency} ${fmtMinor(d.netMinor)}`, cols[4], y, 9); y -= 13;
  R(`VAT ${d.vatRate}%`, cols[3], y, 9); R(`${d.currency} ${fmtMinor(d.vatMinor)}`, cols[4], y, 9); y -= 16;
  page.drawRectangle({ x: left + width * 0.55, y: y - 4, width: width * 0.45, height: 16, color: fill });
  R("Total", cols[3], y, 10, bold); R(`${d.currency} ${fmtMinor(d.grossMinor)}`, cols[4], y, 10, bold);
  y -= 26;
  const notes = credit
    ? [`This credit note cancels invoice ${d.creditOf} in full. ${opts.cancelReason ? "Reason: " + opts.cancelReason : ""}`.trim()]
    : [`Please pay ${d.currency} ${fmtMinor(d.grossMinor)} by ${d.dueOn} with the payment part below (reference ${groups4(d.referencePretty)}).`, "Page 2: the hand-over terms for this sale and the buyer's acceptance."];
  if (d.footer) notes.push(d.footer);
  for (const n of notes) for (const l of wrap(n, reg, 9, width)) { T(l, left, y, 9, reg, grey); y -= 12; }
  return y;
}

function drawTermsPage(page, d, fonts, meta) {
  const { rgb } = globalThis.PDFLib; const { reg, bold } = fonts;
  const black = rgb(0, 0, 0), grey = rgb(0.42, 0.42, 0.45);
  const T = (s, x, y, size, f = reg, color = black) => page.drawText(winAnsi(s), { x, y, size, font: f, color });
  const left = 20 * MM, right = 190 * MM, width = right - left;
  let y = 297 * MM - 20 * MM;
  T(d.seller.name, left, y, 9, reg, grey); T(`${d.kind === "creditNote" ? "Credit note" : "Invoice"} ${d.number} - page 2`, right - reg.widthOfTextAtSize(`Invoice ${d.number} - page 2`, 9), y, 9, reg, grey);
  y -= 30;
  T("Hand-over terms", left, y, 16, bold); y -= 16;
  T("Sale of used company equipment", left, y, 10, reg, grey); y -= 22;
  const rows = [["Device", meta.device], ["Serial", meta.serial], ["Buyer", `${d.buyer.name}${d.buyer.email ? " · " + d.buyer.email : ""}`], ["Price", `${d.currency} ${fmtMinor(d.grossMinor)} incl. VAT`], ["Date", d.issuedOn], ["Terms version", String(d.waiverVersion)]];
  for (const [k, v] of rows) { if (!v) continue; T(k, left, y, 9, bold, grey); T(v, left + 32 * MM, y, 9); y -= 13; }
  y -= 10;
  for (const l of wrap(d.waiverText, reg, 10, width)) { if (y < 60 * MM) break; T(l, left, y, 10); y -= 14; }
  // acceptance
  y -= 14;
  page.drawLine({ start: { x: left, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) });
  T("ACCEPTANCE", left, y - 6, 7, bold, grey); y -= 20;
  if (d.acceptedLine) { for (const l of wrap(d.acceptedLine, reg, 10, width)) { T(l, left, y, 10); y -= 13; } }
  else {
    y -= 22;
    page.drawLine({ start: { x: left, y }, end: { x: left + 70 * MM, y }, thickness: 0.5, color: black });
    page.drawLine({ start: { x: right - 70 * MM, y }, end: { x: right, y }, thickness: 0.5, color: black });
    T("Place, date", left, y - 10, 8, reg, grey); T("Signature of the buyer", right - 70 * MM, y - 10, 8, reg, grey);
  }
}

/**
 * Build the PDF. data = InvoiceData from the backend (invoice or credit note); meta = { device, serial, cancelReason }.
 * Returns Uint8Array. Throws when the libraries are missing.
 */
export async function renderSalePdf(data, meta = {}) {
  const PDFLib = globalThis.PDFLib;
  if (!PDFLib || !globalThis.qrcode) throw new Error("PDF libraries not loaded");
  const { PDFDocument, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.kind === "creditNote" ? "Credit note" : "Invoice"} ${data.number}`);
  doc.setAuthor(winAnsi(data.seller.name)); doc.setProducer("kebab-stack assets"); doc.setCreator("kebab-stack assets");
  const fonts = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const p1 = doc.addPage(A4);
  drawInvoicePage(p1, data, fonts, meta);
  if (data.kind !== "creditNote" && data.qrPayload) drawPaymentPart(p1, data, fonts);
  const p2 = doc.addPage(A4);
  drawTermsPage(p2, data, fonts, meta);
  return await doc.save({ useObjectStreams: true });
}
