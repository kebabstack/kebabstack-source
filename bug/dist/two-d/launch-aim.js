const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function pointerAngle(x, y, origin) {
  // The launch compresses vertical velocity by .4; use that same projection.
  return Math.round(clamp(Math.atan2((origin[1] - y) / .4, Math.max(24, x - origin[0])) * 180 / Math.PI, 25, 60));
}
export function bindLaunchAim(canvas, { getRun, origin, allowed, setAngle, start, end, cancel, shoot }, host = window) {
  let pointer = null;
  const aim = event => {
    if (!allowed() || !['ready', 'charging'].includes(getRun().phase)) return;
    const rect = canvas.getBoundingClientRect();
    setAngle(pointerAngle(event.clientX - rect.left, event.clientY - rect.top, origin()));
  };
  const release = (event, aborted = false) => {
    if (pointer === null || (event && event.pointerId !== pointer)) return;
    const id = pointer; pointer = null;
    if (!aborted && event) aim(event);
    try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch {}
    (aborted ? cancel : end)();
  };
  canvas.addEventListener('pointermove', event => {
    if (pointer === event.pointerId || (pointer === null && event.pointerType === 'mouse')) aim(event);
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null || !allowed()) return;
    event.preventDefault();
    if (getRun().phase === 'flying') { shoot(); return; }
    if (getRun().phase !== 'ready') return;
    aim(event); pointer = event.pointerId; start();
    try { canvas.setPointerCapture(pointer); } catch {}
  });
  canvas.addEventListener('pointerup', event => release(event));
  for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => release(event, true));
  host.addEventListener('blur', () => release(null, true));
  canvas.ownerDocument.addEventListener('visibilitychange', () => { if (canvas.ownerDocument.hidden) release(null, true); });
  return () => release(null, true);
}
