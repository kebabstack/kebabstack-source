// Device labels: a QR code that opens the device page, plus the fields IT chooses. Printed through the
// browser's print dialog onto Brother DK media or any label printer the operating system knows.
// Nothing here changes device data; the default layout is an admin setting in the backend.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const SIZES = {
  "62x29": { w: 62, h: 29, name: "62 × 29 mm · Brother DK-11209 (small address)" },
  "90x29": { w: 90, h: 29, name: "90 × 29 mm · Brother DK-11201 (standard address)" },
  "23x23": { w: 23, h: 23, name: "23 × 23 mm · Brother DK-11221 (square, QR + tag)" },
  "62xauto": { w: 62, h: 40, name: "62 mm continuous · Brother DK-22205 (40 mm cut)" },
};
export const FIELDS = [["tag", "Asset tag"], ["serial", "Serial number"], ["model", "Vendor and model"], ["org", "Company name"], ["logo", "Company logo"], ["found", "“If found, return to IT” line"]];
const DEFAULT = { size: "62x29", fields: ["qr", "tag", "serial", "model", "org"] };
const opt = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export function deviceUrl(appUrl, id) {
  const base = (appUrl && /^https:\/\//.test(appUrl) ? appUrl : location.origin + location.pathname).replace(/\/index\.html$/, "").replace(/\/+$/, "");
  return `${base}/#/d/${Number(id)}`;
}

export function labelHtml(asset, layout, { orgName = "", logoUrl = "", appUrl = "", qr } = {}) {
  const on = (f) => layout.fields.includes(f);
  const size = SIZES[layout.size] ? layout.size : DEFAULT.size;
  const text = [];
  if (on("tag")) text.push(`<div class="tag">${esc(asset.tag || "no tag")}</div>`);
  if (on("serial") && asset.serial && size !== "23x23") text.push(`<div class="serial">${esc(asset.serial)}</div>`);
  if (on("model") && size !== "23x23") text.push(`<div class="model">${esc([asset.vendor, asset.model].filter(Boolean).join(" ") || asset.kind || "")}</div>`);
  if ((on("org") || on("logo")) && size !== "23x23") text.push(`<div class="org">${on("logo") && logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ""}${on("org") ? `<span>${esc(orgName)}</span>` : ""}</div>`);
  if (on("found") && size !== "23x23") text.push(`<div class="found">If found, please return to ${esc(orgName || "the IT team")}.</div>`);
  const svg = qr ? qr(deviceUrl(appUrl, asset.id)) : "";
  return `<div class="label size-${size}"><div class="qr" aria-label="QR code to this device">${svg}</div><div class="txt">${text.join("")}</div></div>`;
}

export function createLabels({ root, printRoot, api, token, hub, settings, loadQr }) {
  let layout = null, logoUrl = "", qrLib = null, assets = [], busy = false;
  const $ = (q) => root.querySelector(q);
  async function prepare() {
    if (!layout) { try { layout = opt(await api().getLabelLayout(token())) || { ...DEFAULT }; } catch { layout = { ...DEFAULT }; } layout = { size: layout.size, fields: [...layout.fields] }; }
    if (!qrLib) { try { await loadQr(); qrLib = window.qrcode; } catch { qrLib = null; } }
    if (!logoUrl && layout.fields.includes("logo")) await loadLogo();
  }
  async function loadLogo() {
    try { const h = hub(); if (!h) return; const r = opt(await h.getCompanyLogo()); if (r && r.img && r.img.length) logoUrl = URL.createObjectURL(new Blob([new Uint8Array(r.img)], { type: r.mime || "image/png" })); } catch {}
  }
  const qr = (text) => {
    if (!qrLib) return `<div class="qr-missing">QR unavailable</div>`;
    const q = qrLib(0, "M"); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  };
  const context = () => ({ ...settings(), logoUrl, qr });
  function paint() {
    const size = SIZES[layout.size] || SIZES[DEFAULT.size], scale = 2.4, first = assets[0];
    root.innerHTML = `<h3>Label${assets.length > 1 ? `s · ${assets.length} devices` : ""}</h3>
      <p class="kv">Printed through your browser’s print dialog: choose the label printer and the matching media. The QR code opens this device in Assets, so a phone camera is enough to identify it.</p>
      <div class="label-stage"><div class="label-sizer" style="width:${size.w * scale}mm;height:${size.h * scale}mm"><div class="label-preview" style="transform:scale(${scale})">${labelHtml(first, layout, context())}</div></div>${assets.length > 1 ? `<p class="kv">Preview shows ${esc(first.tag || first.serial || "the first device")}; each device gets its own label.</p>` : ""}</div>
      <div class="row"><div><label for="labelSize">Label size</label><select id="labelSize" data-size>${Object.entries(SIZES).map(([k, s]) => `<option value="${k}"${k === layout.size ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div></div>
      <div class="label-fields">${FIELDS.map(([k, name]) => `<label class="check"><input type="checkbox" data-field="${k}"${layout.fields.includes(k) ? " checked" : ""}><span>${esc(name)}</span></label>`).join("")}</div>
      <div class="btnrow"><button class="primary sm" data-print>Print ${assets.length > 1 ? `${assets.length} labels` : "label"}</button><button class="sm" data-default>Save as default</button><button class="sm" data-close>Close</button><span class="status" role="status" data-status></span></div>`;
    $("[data-size]").onchange = (e) => { layout.size = e.target.value; paint(); };
    root.querySelectorAll("[data-field]").forEach((box) => (box.onchange = async () => {
      layout.fields = ["qr", ...FIELDS.map(([k]) => k).filter((k) => root.querySelector(`[data-field="${k}"]`).checked)];
      if (layout.fields.includes("logo") && !logoUrl) await loadLogo();
      paint();
    }));
    $("[data-print]").onclick = print;
    $("[data-default]").onclick = async () => {
      if (busy) return; busy = true; const status = $("[data-status]"); status.textContent = "saving…";
      try { const r = await api().setLabelLayout(token(), { size: layout.size, fields: layout.fields }); status.textContent = r.ok ? "saved as default for everyone" : r.detail; } catch (e) { status.textContent = e?.message || "could not save"; } finally { busy = false; }
    };
    $("[data-close]").onclick = close;
  }
  function print() {
    const size = SIZES[layout.size] || SIZES[DEFAULT.size];
    let style = document.getElementById("labelPageStyle");
    if (!style) { style = document.createElement("style"); style.id = "labelPageStyle"; document.head.append(style); }
    style.textContent = `@page{size:${size.w}mm ${size.h}mm;margin:0}`;
    printRoot.innerHTML = assets.map((a) => labelHtml(a, layout, context())).join("");
    document.body.classList.add("printing-labels");
    const done = () => { document.body.classList.remove("printing-labels"); printRoot.replaceChildren(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 60000);
  }
  function close() { assets = []; root.classList.add("hidden"); root.replaceChildren(); }
  async function open(list) {
    assets = list.filter(Boolean).slice(0, 200);
    if (!assets.length) return;
    root.classList.remove("hidden"); root.innerHTML = '<h3>Label</h3><p class="kv" role="status">Preparing the label…</p>';
    await prepare(); paint();
    root.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  return { open, close, layout: () => layout };
}
