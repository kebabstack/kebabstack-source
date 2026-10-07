// Register many devices from photos: upload, read with AI, review one table, import, print labels.
// Uses the same backend calls as single registration (intakeRead, intakeMatch, registerDevice); nothing new to authorize.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opt = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const KINDS = ["laptop", "phone", "tablet", "monitor", "accessory", "other"];
const MAX_PHOTOS = 60;

// Dell: the 7-character Service Tag is what support and warranty use; the long serial goes to the note.
export function rowFromReading(r, defaults = {}) {
  const reads = r?.reads || [];
  const pick = (kind) => reads.filter((x) => x.kind === kind).sort((a, b) => b.confidence - a.confidence)[0]?.value || "";
  const vendor = r?.vendor || "", dell = /dell/i.test(vendor);
  let serviceTag = pick("service_tag"), serial = pick("serial");
  if (dell && !serviceTag) { const short = reads.find((x) => x.kind === "serial" && /^[A-Z0-9]{7}$/i.test(x.value)); if (short) { serviceTag = short.value; if (serial === short.value) serial = reads.find((x) => x.kind === "serial" && x.value !== short.value)?.value || ""; } }
  const note = dell && serviceTag && serial ? `S/N ${serial}` : "";
  const low = reads.length ? Math.min(...reads.map((x) => Number(x.confidence) || 0)) : 1;
  return { serial: dell && serviceTag ? serviceTag : serial || serviceTag, tag: pick("asset_tag") || "", vendor, model: r?.model || "", kind: KINDS.includes(r?.kind) ? r.kind : defaults.kind || "other", note, location: defaults.location || "", confidence: low, reads };
}

export function createBulk({ root, api, token, shrink, labels, attachPicker }) {
  let photos = [], rows = [], options = null, step = 1, running = false, created = [];
  const $ = (q) => root.querySelector(q);
  const stepsHtml = () => `<div class="steps">${["1 · photos", "2 · reading", "3 · review", "4 · import"].map((t, i) => `<span class="step ${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}">${t}</span>`).join("")}</div>`;
  async function loadOptions() { try { options = opt(await api().registerOptions(token())); } catch { options = null; } }
  const locationOptions = (current = "") => `<option value="">—</option>${(options?.locations || []).map((l) => `<option value="${esc(l)}"${l === current ? " selected" : ""}>${esc(l)}</option>`).join("")}`;
  function show() { step = 1; photos = []; rows = []; created = []; paint(); }
  function paint() {
    if (step === 1) {
      root.innerHTML = `${stepsHtml()}<div class="card flat"><h3>Photos of the labels</h3><p class="kv">One photo per device: the factory label with serial number or Service Tag. Up to ${MAX_PHOTOS} at once; pictures are shrunk in the browser and kept as evidence on each device.</p>
        <label class="bulk-drop" for="bulkFiles"><input type="file" id="bulkFiles" accept="image/*" multiple class="hidden"><span><b>Choose photos</b> or drop them here</span></label>
        <div class="bulk-thumbs" data-thumbs></div>
        <div class="btnrow"><button class="primary" data-read ${photos.length ? "" : "disabled"}>Read ${photos.length || ""} photo${photos.length === 1 ? "" : "s"} with AI</button><button class="sm" data-clear ${photos.length ? "" : "disabled"}>Clear</button><span class="status" role="status" data-status></span></div></div>`;
      const input = $("#bulkFiles"), drop = $(".bulk-drop");
      input.onchange = () => addFiles([...input.files]);
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))); };
      paintThumbs();
      $("[data-read]").onclick = read; $("[data-clear]").onclick = () => { photos.forEach((p) => p.url && URL.revokeObjectURL(p.url)); photos = []; paint(); };
    } else if (step === 2) {
      root.innerHTML = `${stepsHtml()}<div class="card flat"><h3>Reading ${photos.length} photos</h3><div class="bulk-progress"><span data-bar style="width:0%"></span></div><p class="kv" data-status role="status">Starting…</p><div class="bulk-thumbs" data-thumbs></div></div>`;
      paintThumbs();
    } else if (step === 3) {
      const dup = rows.filter((r) => r.duplicate).length, blank = rows.filter((r) => !r.serial && !r.model).length;
      root.innerHTML = `${stepsHtml()}<div class="card flat"><h3>Review ${rows.length} devices</h3><p class="kv">Correct anything the reading got wrong. Tags are generated on import unless you type one${options?.nextTag ? ` (next: ${esc(options.nextTag)})` : ""}.${dup ? ` ${dup} already in the register, unticked.` : ""}${blank ? ` ${blank} without serial or model need your input.` : ""}</p>
        <div class="bulk-defaults"><strong>Apply to all rows</strong><div class="row"><div><label for="bulkKind">Kind</label><select id="bulkKind"><option value="">—</option>${KINDS.map((k) => `<option value="${k}">${k}</option>`).join("")}</select></div><div><label for="bulkLocation">Location</label><select id="bulkLocation">${locationOptions()}</select></div><div class="pick" style="margin:0"><label for="bulkTo">Hand out to</label><input type="text" id="bulkTo" placeholder="start typing a name…" autocomplete="off"><div class="list hidden" id="bulkToList"></div></div></div></div>
        <div class="table-scroll bulk-table"><table><thead><tr><th></th><th>Photo</th><th>Vendor</th><th>Model</th><th>Kind</th><th>Serial / Service Tag</th><th>Tag</th><th>Location</th><th>Note</th><th>Check</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${r.duplicate ? "dup" : !r.serial && !r.model ? "blank" : ""}"><td><input type="checkbox" data-f="include" ${r.include ? "checked" : ""} aria-label="Import row ${i + 1}"></td><td><img src="${esc(r.photo.url)}" alt="" class="bulk-thumb"></td><td><input data-f="vendor" value="${esc(r.vendor)}"></td><td><input data-f="model" value="${esc(r.model)}"></td><td><select data-f="kind">${KINDS.map((k) => `<option value="${k}"${k === r.kind ? " selected" : ""}>${k}</option>`).join("")}</select></td><td><input data-f="serial" value="${esc(r.serial)}" class="mono ${r.confidence < 0.6 ? "low" : ""}" title="${r.confidence < 0.6 ? "low confidence reading — compare with the photo" : ""}"></td><td><input data-f="tag" value="${esc(r.tag)}" placeholder="automatic"></td><td><select data-f="location">${locationOptions(r.location)}</select></td><td><input data-f="note" value="${esc(r.note)}"></td><td class="kv">${r.duplicate ? `already registered: ${esc(r.duplicate)}` : r.serial || r.model ? (r.confidence < 0.6 ? "check the serial" : "ok") : "needs serial or model"}</td></tr>`).join("")}</tbody></table></div>
        <div class="btnrow"><button class="primary" data-import>Register ${rows.filter((r) => r.include).length} devices</button><button class="sm" data-back>Back to photos</button><span class="status" role="status" data-status></span></div></div>`;
      attachPicker?.("bulkTo", "bulkToList");
      $("#bulkKind").onchange = (e) => { if (!e.target.value) return; rows.forEach((r) => (r.kind = e.target.value)); root.querySelectorAll('[data-f="kind"]').forEach((s) => (s.value = e.target.value)); };
      $("#bulkLocation").onchange = (e) => { rows.forEach((r) => (r.location = e.target.value)); root.querySelectorAll('[data-f="location"]').forEach((s) => (s.value = e.target.value)); };
      root.querySelectorAll("tbody [data-f]").forEach((el) => (el.onchange = () => { const r = rows[Number(el.closest("tr").dataset.i)]; if (el.dataset.f === "include") r.include = el.checked; else r[el.dataset.f] = el.value.trim(); if (el.dataset.f === "include") return; $("[data-import]").textContent = `Register ${rows.filter((x) => x.include).length} devices`; }));
      root.querySelectorAll('tbody [data-f="include"]').forEach((el) => (el.onchange = () => { rows[Number(el.closest("tr").dataset.i)].include = el.checked; $("[data-import]").textContent = `Register ${rows.filter((x) => x.include).length} devices`; }));
      $("[data-import]").onclick = importRows; $("[data-back]").onclick = () => { step = 1; paint(); };
    } else {
      const failed = rows.filter((r) => r.include && r.error);
      root.innerHTML = `${stepsHtml()}<div class="card done"><div class="big">🍢</div><h3>${created.length} device${created.length === 1 ? "" : "s"} registered</h3><div class="kv">${created.map((a) => esc(a.tag)).join(" · ")}</div>${failed.length ? `<div class="warnbox" style="margin-top:12px"><b>${failed.length} not registered:</b><ul>${failed.map((r) => `<li>${esc(r.serial || r.model)} — ${esc(r.error)}</li>`).join("")}</ul></div>` : ""}<div class="btnrow" style="justify-content:center"><button class="primary" data-labels ${created.length ? "" : "disabled"}>Print ${created.length} labels</button>${failed.length ? '<button class="sm" data-review>Back to the table</button>' : ""}<button class="sm" data-again>Register more</button><a class="sm" href="#/devices">Open the device list</a></div></div><div class="card flat hidden" data-label-card></div>`;
      $("[data-labels]").onclick = () => labels(root.querySelector("[data-label-card]")).open(created);
      $("[data-again]").onclick = show; if ($("[data-review]")) $("[data-review]").onclick = () => { step = 3; paint(); };
    }
  }
  function paintThumbs() { const box = $("[data-thumbs]"); if (box) box.innerHTML = photos.map((p, i) => `<figure class="${p.state || ""}"><img src="${esc(p.url)}" alt=""><figcaption>${esc(p.caption || p.file?.name || "")}</figcaption>${step === 1 ? `<button type="button" class="x" data-remove="${i}" aria-label="Remove photo">×</button>` : ""}</figure>`).join(""); root.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = () => { const p = photos.splice(Number(b.dataset.remove), 1)[0]; if (p?.url) URL.revokeObjectURL(p.url); paint(); })); }
  async function addFiles(files) {
    const status = $("[data-status]");
    for (const file of files) { if (photos.length >= MAX_PHOTOS) { status.textContent = `At most ${MAX_PHOTOS} photos per round.`; break; } photos.push({ file, url: URL.createObjectURL(file), state: "" }); }
    paint();
  }
  async function read() {
    if (running || !photos.length) return; running = true; step = 2; paint();
    await loadOptions();
    const bar = $("[data-bar]"), status = $("[data-status]"), tok = token();
    let done = 0; rows = [];
    const work = photos.map((p, i) => async () => {
      try {
        if (!p.bytes) { const s = await shrink(p.file); p.bytes = s.bytes; p.mime = s.mime; }
        let r = null;
        for (let attempt = 0; attempt < 2 && !r?.ok; attempt++) { r = await api().intakeRead(tok, [...p.bytes], p.mime); if (!r.ok && r.retryable?.[0] === true && attempt === 0) await new Promise((res) => setTimeout(res, 1500)); }
        const row = r?.ok ? rowFromReading(r) : { serial: "", tag: "", vendor: "", model: "", kind: "other", note: "", location: "", confidence: 0, reads: [] };
        row.photo = p; row.include = true; row.error = r?.ok ? "" : r?.detail || "photo could not be read";
        if (row.serial || row.tag) { try { const m = await api().intakeMatch(tok, [row.serial, row.tag].filter(Boolean)); const hit = m.find((x) => Number(x.score) >= 90); if (hit) { row.duplicate = `${hit.row.asset.tag || hit.row.asset.serial} (#${Number(hit.row.asset.id)})`; row.include = false; } } catch {} }
        p.state = r?.ok ? "ok" : "fail"; p.caption = r?.ok ? (row.serial || row.model || "read") : "not read";
        rows[i] = row;
      } catch (e) { p.state = "fail"; p.caption = "not read"; rows[i] = { serial: "", tag: "", vendor: "", model: "", kind: "other", note: "", location: "", confidence: 0, reads: [], photo: p, include: true, error: String(e?.message || e) }; }
      done++; bar.style.width = `${Math.round((done / photos.length) * 100)}%`; status.textContent = `${done} of ${photos.length} read`; paintThumbs();
    });
    await Promise.all(Array.from({ length: 2 }, async () => { while (work.length) await work.shift()(); }));
    running = false; step = 3; paint();
  }
  async function importRows() {
    if (running) return; running = true;
    const button = $("[data-import]"), status = $("[data-status]"); button.disabled = true;
    const to = root.querySelector("#bulkTo")?.dataset.email || "";
    created = []; let n = 0; const todo = rows.filter((r) => r.include);
    for (const r of todo) {
      status.textContent = `registering ${++n} of ${todo.length}…`;
      try {
        const res = await api().registerDevice(token(), { create: { tag: r.tag, serial: r.serial, vendor: r.vendor, model: r.model, kind: r.kind, note: r.note }, assignee: to, location: r.location, photo: r.photo.bytes ? [[...r.photo.bytes]] : [], mime: r.photo.mime || "" });
        if (res.ok) { r.error = ""; r.include = false; r.done = true; created.push({ id: res.assetId, tag: res.tag, serial: r.serial, vendor: r.vendor, model: r.model, kind: r.kind }); } else r.error = res.detail;
      } catch (e) { r.error = String(e?.message || e); }
    }
    running = false; step = 4; paint();
  }
  return { show };
}
