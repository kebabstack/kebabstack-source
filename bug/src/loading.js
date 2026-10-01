// A hidden tab never paints; fall back to a timer so loading can finish in the background.
export const nextPaint = () => new Promise(resolve => { if (document.hidden) setTimeout(resolve, 16); else requestAnimationFrame(() => resolve()); });
export function loadingProgress(percent, message) {
  document.getElementById('loadProgress').value = percent;
  document.getElementById('loadMessage').textContent = message;
}
export function loadingFailed(message) {
  // Native modal dialogs are above every CSS overlay. Close them so recovery
  // controls stay reachable if graphics fail while paused or viewing a profile.
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  gameReady(false);
  document.getElementById('loadMessage').textContent = message;
  document.getElementById('loadRecovery').hidden = false;
}

export function gameReady(ready = true) {
  for (const element of document.querySelectorAll('main, .game-header, #world')) element.inert = !ready;
  document.body.classList.toggle('loaded', ready);
}
