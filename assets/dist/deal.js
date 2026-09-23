import { idlFactory } from "./idl.js";
// Patched by the Kitchen / manual deployment, just like app.js.
const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const opt = (v) => v?.[0] ?? null;
const when = (n) => new Date(Number(BigInt(n) / 1000000n)).toLocaleString([], {dateStyle:"medium", timeStyle:"short"});
const money = (n, currency) => new Intl.NumberFormat(undefined, {style:"currency",currency}).format(Number(n) / 100);
let backend, saleId, key, view, busy = false, downloadedHash = "";
function message(text = "", error = false) { $("message").textContent = text; $("message").classList.toggle("error", error); }
function unavailable(text = "This private link is invalid, expired or has been replaced. Ask the seller for a new link.") {
  view = null; $("room").innerHTML = `<section class="panel"><p class="eyebrow">Private dealroom</p><h1>This link is unavailable.</h1><p>${esc(text)}</p><button id="retry">Try again</button></section>`;
  $("retry").onclick = refresh; $("room").setAttribute("aria-busy", "false");
}
async function action(fn) {
  if (busy) return;
  busy = true; message();
  document.querySelectorAll("fieldset,button").forEach(el => el.disabled = true);
  try { await fn(); }
  catch (_) { message("The connection was interrupted. Refresh the offer to check its saved status before trying again.", true); }
  finally { busy = false; document.querySelectorAll("fieldset,button").forEach(el => el.disabled = false); if ($("confirmReceipt")) $("confirmReceipt").disabled = downloadedHash !== view?.pdfHash; if ($("downloadInvoice")) $("downloadInvoice").disabled = !view?.pdfReady; }
}
async function refresh() {
  try { const next = opt(await backend.getDeal(saleId, key)); if (!next) return unavailable(); view = next; render(); }
  catch (_) { if (!view) unavailable("The connection could not be established. Try again; your link has not been changed."); else message("Could not refresh. Please try again.", true); }
}
function field(id, label, value, max, wide = false, auto = "") {
  return `<label${wide ? ' class="wide"' : ''} for="${id}">${label}<input id="${id}" name="${id}" value="${esc(value)}" maxlength="${max}"${auto ? ` autocomplete="${auto}"` : ""}${id === "houseNo" ? "" : " required"}></label>`;
}
function render() {
  const d = view, invoice = opt(d.invoice), cancelled = d.status === "cancelled", complete = Number(d.completedAt) > 0;
  const price = money(d.grossMinor, d.currency);
  const summary = `<section class="panel summary"><p class="eyebrow">Your offer · #${d.id}</p><h2>${esc(d.device)}</h2><p class="price">${esc(price)}</p><p class="small">Including ${esc(d.vatRate)}% VAT</p><dl><dt>Seller</dt><dd>${esc(d.sellerName)}</dd><dt>Buyer</dt><dd>${esc(d.buyer.name)}\n${esc(d.buyer.email)}</dd><dt>Serial</dt><dd>${esc(d.serial)}</dd><dt>Item</dt><dd>${esc(d.description)}</dd><dt>Link valid</dt><dd>Until ${esc(when(d.expiresAt))}</dd></dl></section>`;
  let body;
  if (cancelled) {
    body = `<div class="notice warning"><strong>This sale is cancelled.</strong>${invoice ? "Do not pay this invoice. Contact the seller about the credit note or any refund." : "No invoice was issued for this offer. There is nothing more to do here."}</div>`;
  } else if (!invoice && d.changed) {
    body = `<div class="notice warning"><strong>The offer has changed.</strong>Please ask the seller for a new link before accepting.</div>`;
  } else if (!invoice) {
    body = `<h2>Review your offer</h2><p>Check the device and price, then complete your billing address. Accepting creates your invoice immediately.</p>
      <form id="acceptForm"><fieldset><div class="fields">${field("street","Street",d.buyer.street,70,true,"address-line1")}${field("houseNo","Building no. (optional)",d.buyer.houseNo,16)}${field("postalCode","Postal code",d.buyer.postalCode,16,false,"postal-code")}${field("town","Town / city",d.buyer.town,35,false,"address-level2")}${field("country","Country code (CH, DE, …)",d.buyer.country || "CH",2,false,"country")}</div>
      <h3>Hand-over terms · version ${d.termsVersion}</h3><div class="terms" tabindex="0" aria-label="Hand-over terms">${esc(d.terms)}</div>
      <label class="check"><input id="acceptTerms" type="checkbox" required><span>I am ${esc(d.buyer.name)}, or authorised to act for them. I accept this offer for <b>${esc(price)}</b> and the hand-over terms above.</span></label>
      <div class="actions"><button class="primary" type="submit">Accept & get invoice</button></div></fieldset></form>
      <details id="declineBox"><summary>Not taking this device? Decline the offer</summary><p>Declining cancels this sale and informs the seller.</p><label for="declineReason">Reason (optional)</label><textarea id="declineReason" maxlength="300" rows="2"></textarea><div class="actions"><button id="decline" class="danger">Decline & cancel sale</button></div></details>`;
  } else {
    body = `<h2>${complete ? "You’re all set." : "Your invoice is ready."}</h2>
      ${complete ? `<div class="notice"><strong>Invoice receipt confirmed ${esc(when(d.completedAt))}</strong>The seller has been informed. ${Number(d.handedOverAt) ? "The device hand-over has been recorded." : Number(d.paidAt) ? "Payment has been confirmed. Arrange the hand-over with the seller." : "Please pay the invoice by its due date. The seller will confirm payment and arrange the hand-over."}</div>` : '<p>Download your invoice, then confirm that you have received it. Payment is a separate step.</p>'}
      <div class="invoice"><p class="eyebrow">${esc(invoice.seller.name)}</p><div class="number">${esc(invoice.number)}</div><p>${esc(price)} · Due ${esc(invoice.dueOn)}</p><div class="actions"><button id="downloadInvoice" class="primary">Download invoice PDF</button></div></div>
      ${!d.pdfReady ? '<div class="notice warning">The seller is still preparing this invoice PDF. Refresh in a moment.</div>' : ""}
      ${!complete ? '<p class="small" id="downloadHint">Download the PDF to enable receipt confirmation.</p><label class="check"><input id="receiptCheck" type="checkbox"><span>I have received the invoice. This confirms receipt only, not payment.</span></label><div class="actions"><button id="confirmReceipt" disabled>Confirm invoice received</button></div>' : ""}
      <details><summary>Accepted offer & hand-over terms</summary><div class="terms" tabindex="0">${esc(d.terms)}</div><p class="small">${esc(invoice.acceptedLine)}</p></details>`;
  }
  $("room").innerHTML = `<div class="intro"><p class="eyebrow">${esc(d.sellerName)} · Private dealroom</p><h1>${cancelled ? "Offer closed." : complete ? "Thank you, " + esc(d.buyer.name.split(" ")[0]) + "." : "A new chapter for this device."}</h1></div><div class="columns"><section class="panel"><ol class="steps" aria-label="Your progress"><li class="active"><b>${invoice ? "✓" : "01"}</b>Review & accept</li><li class="${invoice ? "active" : ""}"><b>${complete ? "✓" : "02"}</b>Get invoice</li><li class="${complete ? "active" : ""}"><b>${complete ? "✓" : "03"}</b>Confirm receipt</li></ol>${body}<div class="actions"><button id="refreshRoom">Refresh status</button></div></section>${summary}</div>`;
  $("room").setAttribute("aria-busy", "false");
  $("refreshRoom").onclick = () => action(refresh);
  if ($("acceptForm")) $("acceptForm").onsubmit = e => {
    e.preventDefault(); if (!$("acceptForm").reportValidity()) return;
    const address = Object.fromEntries(["street","houseNo","postalCode","town","country"].map(k => [k,$(k).value.trim()])); address.country = address.country.toUpperCase();
    const quote = d.quote;
    action(async () => { message("Accepting and preparing your invoice…"); const r = await backend.acceptDeal(saleId, key, quote, address); if (r.ok) await refresh(); message(r.detail, !r.ok); });
  };
  if ($("decline")) $("decline").onclick = () => {
    const reason = $("declineReason").value.trim(), quote = d.quote;
    action(async () => { const r = await backend.declineDeal(saleId, key, quote, reason); if (r.ok) await refresh(); message(r.detail, !r.ok); });
  };
  if ($("downloadInvoice")) {
    $("downloadInvoice").disabled = !d.pdfReady;
    $("downloadInvoice").onclick = () => action(async () => {
      const doc = opt(await backend.dealDocument(saleId, key)); if (!doc) { await refresh(); return message("The PDF is unavailable. Please check the offer status or contact the seller.", true); }
      const bytes = new Uint8Array(doc.bytes), hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n=>n.toString(16).padStart(2,"0")).join("");
      if (hash !== doc.hash || hash !== d.pdfHash) throw Error("invoice hash mismatch");
      const url = URL.createObjectURL(new Blob([bytes], {type: "application/pdf"})); const a = document.createElement("a"); a.href = url; a.download = doc.name; a.rel = "noopener"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      downloadedHash = hash; if ($("downloadHint")) $("downloadHint").textContent = "Your download has started. Once you have the PDF, confirm receipt below."; message("Invoice downloaded. You can download this same archived copy again while the link is valid.");
    });
  }
  if ($("confirmReceipt")) {
    $("confirmReceipt").disabled = downloadedHash !== d.pdfHash;
    $("confirmReceipt").onclick = () => {
      if (!$("receiptCheck").checked) return message("Please tick that you have received the invoice.", true);
      action(async () => { const r = await backend.confirmDeal(saleId, key, invoice.number, downloadedHash); if (r.ok) await refresh(); message(r.detail, !r.ok); });
    };
  }
}
async function boot() {
  if (window.self !== window.top) return unavailable("Open your private link directly in a browser tab.");
  // The secret is a URL fragment: never sent with the HTTP request or referrer.
  // Remove it from the current history entry; retain only in this tab for refresh.
  const fragment = location.hash.slice(1); let capability = fragment;
  if (!capability) { try { capability = sessionStorage.getItem("ks-assets-deal") || ""; } catch (_) {} }
  const match = /^([1-9][0-9]{0,19})\.([a-f0-9]{64})$/.exec(capability);
  if (!match) return unavailable();
  saleId = BigInt(match[1]); key = match[2];
  try { sessionStorage.setItem("ks-assets-deal", capability); if (fragment) history.replaceState(null, "", location.pathname); } catch (_) {}
  const { HttpAgent, Actor } = await import("./agent-bundle.js");
  const agent = await HttpAgent.create({host:"https://icp0.io"});
  backend = Actor.createActor(idlFactory, {agent, canisterId:BACKEND_CANISTER_ID});
  await refresh(); if (view) { try { await backend.visitDeal(saleId, key); } catch (_) {} }
}
boot().catch(() => unavailable("Could not connect to this dealroom. Please try opening your original link again."));
