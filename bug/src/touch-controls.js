// One pointer per button, independent across buttons, including two-thumb play.
export function bindPress(element, { start, end = () => {}, cancel = end }, host = window) {
  let pointer = null;
  const release = (event, aborted = false) => {
    if (pointer === null || (event && event.pointerId !== pointer)) return;
    const id = pointer; pointer = null;
    event?.preventDefault();
    try { if (element.hasPointerCapture(id)) element.releasePointerCapture(id); } catch {}
    (aborted ? cancel : end)(id);
  };
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    if (start(event.pointerId) === false) return;
    pointer = event.pointerId;
    try { element.setPointerCapture(pointer); } catch {}
  });
  element.addEventListener('pointerup', event => release(event));
  for (const type of ['pointercancel', 'lostpointercapture']) element.addEventListener(type, event => release(event, true));
  host.addEventListener('blur', () => release(null, true));
  element.ownerDocument.addEventListener('visibilitychange', () => { if (element.ownerDocument.hidden) release(null, true); });
  // WebKit's long-press recognizer also needs the touch default suppressed.
  for (const type of ['touchstart', 'touchmove']) element.addEventListener(type, event => event.preventDefault(), { passive: false });
  return () => release(null, true);
}

export function protectGameSurface(root) {
  for (const type of ['contextmenu', 'selectstart', 'dragstart']) root.addEventListener(type, event => event.preventDefault());
}
