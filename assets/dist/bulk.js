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
  const low = reads.length ? Math.min(...reads.map((x) => Number(x.confidence) || 0)) : 0;
  return { serial: dell && serviceTag ? serviceTag : serial || serviceTag, tag: pick("asset_tag") || "", vendor, model: r?.model || "", kind: KINDS.includes(r?.kind) ? r.kind : defaults.kind || "other", note, location: defaults.location || "", confidence: low, reads };
}

export function createBulk({ root, api, token, shrink, labels, attachPicker, ensureAi = async () => ({ok:true}), review }) {
  let photos = [], rows = [], options = null, step = 1, running = false, created = [], recipient = "", initialized = false, draftToken = "";
  const $ = (q) => root.querySelector(q);
  const stepsHtml = () => `<div class="photo-steps" aria-label="Import progress">${["1 Photos", "2 Read", "3 Review", "4 Save"].map((t, i) => `<span class="photo-step ${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}">${t}</span>`).join("")}</div>`;
  async function loadOptions() { try { options = opt(await api().registerOptions(token())); } catch { options = null; } }
  const locationOptions = (current = "") => `<option value="">—</option>${(options?.locations || []).map((l) => `<option value="${esc(l)}"${l === current ? " selected" : ""}>${esc(l)}</option>`).join("")}`;
  function show() { if (initialized && draftToken === token()) return; if (initialized && running) { root.textContent = "Your session changed. Reopen this task after the current request finishes."; return; } if (initialized) reset(); initialized = true; draftToken = token(); paint(); }
  function reset() { if (running) return; photos.forEach(p => URL.revokeObjectURL(p.url)); step = 1; photos = []; rows = []; created = []; recipient = ""; paint(); }
  const selectedCount = () => rows.filter(r => r.include && !r.done).length;
  function syncCount() { const b = $("[data-import]"); if (b) { b.textContent = `Register ${selectedCount()} device${selectedCount() === 1 ? "" : "s"}`; b.disabled = !selectedCount(); } }
  function editPhoto(i) { recipient = $("#bulkTo")?.dataset.email ?? recipient; const r = rows[i]; review?.({url:r.photo.url, title:`Photo ${i+1} · Review reading`, values:r, locations:options?.locations || [], onSave: values => {Object.assign(r,values); r.reviewed = true; paint();}}); }
  async function retryRow(i) {
    if (running) return;
    recipient = $("#bulkTo")?.dataset.email ?? recipient;
    const r = rows[i]; if (r.done) return;
    running = true; root.querySelectorAll('button,input,select').forEach(el => el.disabled = true);
    try {
      const ready = await ensureAi(); if (!ready.ok) throw Error(ready.detail);
      if (!r.photo.bytes) { const prepared = await shrink(r.photo.file); r.photo.bytes = prepared.bytes; r.photo.mime = prepared.mime; URL.revokeObjectURL(prepared.url); }
      const answer = await api().intakeRead(token(), [...r.photo.bytes], r.photo.mime);
      if (!answer.ok) throw Error(answer.detail);
      const proposal = rowFromReading(answer, r);
      review?.({url:r.photo.url, title:`Photo ${i+1} · New AI reading`, values:{...r,...proposal}, current:r, locations:options?.locations || [], onSave: values => {Object.assign(r,values); r.error=''; r.reviewed = true; paint();}});
    } catch(e) { r.error = e.message || 'Could not read this photo. Try again.'; }
    finally { running = false; paint(); }
  }
  function paint() {
    if (step === 1) {
      root.innerHTML = `${stepsHtml()}<div class="card flat"><h3>Photos of the labels</h3><p class="kv">One photo per device: the factory label with serial number or Service Tag. Up to ${MAX_PHOTOS} at once; pictures are shrunk in the browser and kept as evidence on each device.</p>
        <div class="bulk-drop"><input type="file" id="bulkFiles" accept="image/*" multiple class="hidden"><input type="file" id="bulkCamera" accept="image/*" capture="environment" class="hidden"><b>One label photo per asset</b><div class="btnrow"><button type="button" data-choose>Choose photos</button><button type="button" data-camera>Take a photo</button></div><span>Or drop photos here. You can add more before reading.</span></div><p class="kv">Photos are sent to your company’s configured AI service when you start reading. Nothing enters the register until you confirm. Keep this tab open to retain the draft.</p>
        <div class="bulk-thumbs" data-thumbs></div>
        <div class="btnrow"><button class="primary" data-read ${photos.length ? "" : "disabled"}>Read ${photos.length || ""} photo${photos.length === 1 ? "" : "s"} with AI</button><button class="sm" data-clear ${photos.length ? "" : "disabled"}>Clear</button><span class="status" role="status" data-status></span></div></div>`;
      const input = $("#bulkFiles"), drop = $(".bulk-drop");
      input.onchange = () => addFiles([...input.files]);
      $("[data-choose]").onclick = () => input.click();
      $("[data-camera]").onclick = () => $("#bulkCamera").click();
      $("#bulkCamera").onchange = e => addFiles([...e.target.files]);
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))); };
      paintThumbs();
      $("[data-read]").onclick = read; $("[data-clear]").onclick = () => { photos.forEach((p) => p.url && URL.revokeObjectURL(p.url)); photos = []; paint(); };
    } else if (step === 2) {
      root.innerHTML = `${stepsHtml()}<div class="card flat"><h3>Reading ${photos.length} photo${photos.length === 1 ? "" : "s"}</h3><div class="bulk-progress"><span data-bar style="width:0%"></span></div><p class="kv" data-status role="status">Starting…</p><div class="bulk-thumbs" data-thumbs></div></div>`;
      paintThumbs();
    } else if (step === 3) {
      const dup = rows.filter((r) => r.duplicate).length, blank = rows.filter((r) => !r.serial && !r.model).length;
      root.innerHTML = `${stepsHtml()}<div class="card flat"><h3>Review ${rows.length} device${rows.length === 1 ? "" : "s"}</h3><p class="kv">Check the serial and model. Open the photo to zoom or edit other details. Tags are generated on import unless you type one${options?.nextTag ? ` (next: ${esc(options.nextTag)})` : ""}.${dup ? ` ${dup} already in the register, unticked.` : ""}${blank ? ` ${blank} without serial or model need your input.` : ""}</p>
        <details class="bulk-defaults"><summary>Set kind, location or recipient for all</summary><div class="row"><div><label for="bulkKind">Kind</label><select id="bulkKind"><option value="">—</option>${KINDS.map((k) => `<option value="${k}">${k}</option>`).join("")}</select></div><div><label for="bulkLocation">Location</label><select id="bulkLocation">${locationOptions()}</select></div><div><label for="bulkStatus">Status</label><select id="bulkStatus"><option value="">—</option><option value="in_stock">in stock</option><option value="deployed">deployed (in use at the location)</option></select></div><div class="pick" style="margin:0"><label for="bulkTo">Hand out to</label><input type="text" id="bulkTo" placeholder="start typing a name…" autocomplete="off"><div class="list hidden" id="bulkToList"></div></div></div></details>
        <div class="table-scroll bulk-table"><table><thead><tr><th></th><th>Photo</th><th>Vendor</th><th>Model</th><th>Kind</th><th>Serial / Service Tag</th><th>Tag</th><th>Location</th><th>Status</th><th>Note</th><th>Review</th></tr></thead><tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${r.done ? "saved" : r.duplicate ? "dup" : !r.serial && !r.model ? "blank" : ""}"><td><input type="checkbox" data-f="include" ${r.include ? "checked" : ""} ${r.done ? "disabled" : ""} aria-label="Import row ${i + 1}"></td><td data-label="Photo"><button type="button" class="bulk-photo" data-review="${i}"><img src="${esc(r.photo.url)}" alt="Label photo ${i+1}" class="bulk-thumb"><span>View & edit</span></button></td><td data-label="Vendor"><input type="text" aria-label="Vendor for photo ${i+1}" data-f="vendor" value="${esc(r.vendor)}"></td><td data-label="Model"><input type="text" aria-label="Model for photo ${i+1}" data-f="model" value="${esc(r.model)}"></td><td data-label="Kind"><select aria-label="Kind for photo ${i+1}" data-f="kind">${KINDS.map((k) => `<option value="${k}"${k === r.kind ? " selected" : ""}>${k}</option>`).join("")}</select></td><td data-label="Serial / Service Tag"><input type="text" aria-label="Serial / Service Tag for photo ${i+1}" data-f="serial" value="${esc(r.serial)}" class="mono ${r.confidence < 0.6 ? "low" : ""}" title="${r.confidence < 0.6 ? "low confidence reading — compare with the photo" : ""}"></td><td data-label="Inventory tag"><span>${r.done ? esc(r.tag) : "Assigned when saved"}</span></td><td data-label="Location"><select aria-label="Location for photo ${i+1}" data-f="location">${locationOptions(r.location)}</select></td><td data-label="Status"><select aria-label="Status for photo ${i+1}" data-f="status"><option value="in_stock"${r.status !== "deployed" ? " selected" : ""}>in stock</option><option value="deployed"${r.status === "deployed" ? " selected" : ""}>deployed</option></select></td><td data-label="Note"><input type="text" aria-label="Note for photo ${i+1}" data-f="note" value="${esc(r.note)}"></td><td class="kv" data-label="Review"><span role="status">${r.done ? "Registered" : r.error ? esc(r.error) : r.duplicate ? `already registered: ${esc(r.duplicate)}` : r.reviewed ? "Reviewed" : r.serial || r.model ? (r.confidence < 0.6 ? "check the serial" : "ok") : "needs serial or model"}</span>${!r.done ? `<button type="button" data-retry="${i}">Read again</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
        <div class="btnrow"><button class="primary" data-import>Register ${selectedCount()} device${selectedCount() === 1 ? "" : "s"}</button><button class="sm" data-back>Back to photos</button><span class="status" role="status" data-status></span></div></div>`;
      attachPicker?.("bulkTo", "bulkToList");
      $("#bulkTo").dataset.email = recipient; $("#bulkTo").value = recipient;
      root.querySelectorAll('[data-review]').forEach(b => b.onclick = () => editPhoto(Number(b.dataset.review)));
      root.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => retryRow(Number(b.dataset.retry)));
      root.querySelectorAll('tr.saved input,tr.saved select,tr.saved button').forEach(el => el.disabled = true);
      syncCount();
      $("#bulkKind").onchange = (e) => { if (!e.target.value) return; rows.filter(r => !r.done).forEach((r) => (r.kind = e.target.value)); root.querySelectorAll('tr:not(.saved) [data-f="kind"]').forEach((s) => (s.value = e.target.value)); };
      $("#bulkLocation").onchange = (e) => { rows.filter(r => !r.done).forEach((r) => (r.location = e.target.value)); root.querySelectorAll('tr:not(.saved) [data-f="location"]').forEach((s) => (s.value = e.target.value)); };
      $("#bulkStatus").onchange = (e) => { if (!e.target.value) return; rows.filter(r => !r.done).forEach((r) => (r.status = e.target.value)); root.querySelectorAll('tr:not(.saved) [data-f="status"]').forEach((s) => (s.value = e.target.value)); };
      root.querySelectorAll("tbody [data-f]").forEach((el) => (el.oninput = () => { const r = rows[Number(el.closest("tr").dataset.i)]; if (el.dataset.f === "include") r.include = el.checked; else r[el.dataset.f] = el.value.trim(); if (el.dataset.f === "include") return; syncCount(); }));
      root.querySelectorAll('tbody [data-f="include"]').forEach((el) => (el.onchange = () => { rows[Number(el.closest("tr").dataset.i)].include = el.checked; syncCount(); }));
      $("[data-import]").onclick = importRows; $("[data-back]").onclick = () => { recipient = $("#bulkTo")?.dataset.email ?? recipient; step = 1; paint(); };
    } else {
      const failed = rows.filter((r) => r.include && r.error);
      root.innerHTML = `${stepsHtml()}<div class="card done"><div class="big">🍢</div><h3>${created.length} device${created.length === 1 ? "" : "s"} registered</h3><div class="kv">${created.map((a) => esc(a.tag)).join(" · ")}</div>${failed.length ? `<div class="warnbox" style="margin-top:12px"><b>${failed.length} not registered:</b><ul>${failed.map((r) => `<li>${esc(r.serial || r.model)} — ${esc(r.error)}</li>`).join("")}</ul></div>` : ""}<div class="btnrow" style="justify-content:center"><button class="primary" data-labels ${created.length ? "" : "disabled"}>Print ${created.length} labels</button>${failed.length ? '<button class="sm" data-review>Back to the table</button>' : ""}<button class="sm" data-again>Register more</button><a class="sm" href="#/devices">Open the device list</a></div></div><div class="card flat hidden" data-label-card></div>`;
      $("[data-labels]").onclick = () => labels(root.querySelector("[data-label-card]")).open(created);
      $("[data-again]").onclick = reset; if ($("[data-review]")) $("[data-review]").onclick = () => { step = 3; paint(); };
    }
  }
  function paintThumbs() { const box = $("[data-thumbs]"); if (box) box.innerHTML = photos.map((p, i) => `<figure class="${p.state || ""}"><img src="${esc(p.url)}" alt=""><figcaption>${esc(p.caption || p.file?.name || "")}</figcaption>${step === 1 ? `<button type="button" class="x" data-remove="${i}" aria-label="Remove photo">×</button>` : ""}</figure>`).join(""); root.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = () => { const p = photos.splice(Number(b.dataset.remove), 1)[0]; if (p?.url) URL.revokeObjectURL(p.url); paint(); })); }
  async function addFiles(files) {
    let rejected = 0;
    for (const file of files) { if (photos.length >= MAX_PHOTOS) { rejected++; continue; } photos.push({ file, url: URL.createObjectURL(file), state: "" }); }
    paint(); if (rejected) $("[data-status]").textContent = `At most ${MAX_PHOTOS} photos per round; ${rejected} not added.`;
  }
  async function read() {
    if (running || !photos.length) return; running = true;
    $("[data-status]").textContent = "Checking AI connection…"; $("[data-read]").disabled = true;
    const ready = await ensureAi();
    if (!ready.ok) {running=false; paint(); $("[data-status]").textContent=ready.detail; return;}
    step = 2; paint();
    await loadOptions();
    const bar = $("[data-bar]"), status = $("[data-status]"), tok = token();
    let done = 0; const previousRows = rows; rows = [];
    const work = photos.map((p, i) => async () => {
      try {
        const prior = previousRows.find(r => r.photo === p); if (prior) { rows[i] = prior; done++; bar.style.width = `${Math.round(done/photos.length*100)}%`; return; }
        if (!p.bytes) { const s = await shrink(p.file); p.bytes = s.bytes; p.mime = s.mime; URL.revokeObjectURL(s.url); }
        let r = null;
        for (let attempt = 0; attempt < 2 && !r?.ok; attempt++) { r = await api().intakeRead(tok, [...p.bytes], p.mime); if (r.ok || r.retryable?.[0] !== true || attempt === 1) break; await new Promise((res) => setTimeout(res, 1500)); }
        const row = r?.ok ? rowFromReading(r) : { serial: "", tag: "", vendor: "", model: "", kind: "other", note: "", location: "", confidence: 0, reads: [] };
        row.photo = p; row.include = true; row.error = r?.ok ? "" : r?.detail || "photo could not be read";
        if (row.serial) { try { const m = await api().intakeMatch(tok, [row.serial]); const hit = m.find((x) => Number(x.score) >= 90); if (hit) { row.duplicate = `${hit.row.asset.tag || hit.row.asset.serial} (#${Number(hit.row.asset.id)})`; row.include = false; } } catch {} }
        p.state = r?.ok ? "ok" : "fail"; p.caption = r?.ok ? (row.serial || row.model || "read") : "not read";
        rows[i] = row;
      } catch (e) { p.state = "fail"; p.caption = "not read"; rows[i] = { serial: "", tag: "", vendor: "", model: "", kind: "other", note: "", location: "", confidence: 0, reads: [], photo: p, include: true, error: String(e?.message || e) }; }
      done++; bar.style.width = `${Math.round((done / photos.length) * 100)}%`; status.textContent = `${done} of ${photos.length} read`; paintThumbs();
    });
    await Promise.all(Array.from({ length: 2 }, async () => { while (work.length) await work.shift()(); }));
    running = false; if (tok !== token()) { reset(); return; } step = 3; paint();
  }
  async function importRows() {
    if (running) return;
    const picker = $("#bulkTo");
    if (picker?.value.trim() && !picker.dataset.email) { $("[data-status]").textContent = "Pick the person from the directory, or clear the field."; return; }
    running = true;
    const button = $("[data-import]"), status = $("[data-status]"); button.disabled = true;
    const to = root.querySelector("#bulkTo")?.dataset.email ?? recipient; recipient = to;
    const saveToken = token(); let n = 0; const todo = rows.filter((r) => r.include && !r.done).map(r => ({...r}));
    root.querySelectorAll("button,input,select").forEach(el => el.disabled = true);
    for (const r of todo) {
      if (saveToken !== token()) break;
      status.textContent = `registering ${++n} of ${todo.length}…`;
      try {
        if (!r.serial.trim()) throw Error("Enter the serial or Service Tag before registering this photo.");
        if (!r.photo.bytes) throw Error("Photo could not be prepared. Read it again before registering.");
        const res = await api().registerDevice(saveToken, { create: { tag: "", serial: r.serial, vendor: r.vendor, model: r.model, kind: r.kind, note: r.note }, assignee: to, location: r.location, status: to ? "" : r.status === "deployed" ? "deployed" : "", photo: r.photo.bytes ? [[...r.photo.bytes]] : [], mime: r.photo.mime || "" });
        if (res.ok) { r.error = ""; r.include = false; r.done = true; r.tag = res.tag; created.push({ id: res.assetId, tag: res.tag, serial: r.serial, vendor: r.vendor, model: r.model, kind: r.kind }); } else r.error = res.detail;
      } catch (e) { r.error = String(e?.message || e); }
      Object.assign(rows.find(x => x.photo === r.photo), r);
    }
    running = false; if (saveToken !== token()) { reset(); return; } step = 4; paint();
  }
  return { show };
}
