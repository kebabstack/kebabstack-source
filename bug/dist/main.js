import { MODE, mountModeSwitcher, updateModeSwitchers } from './mode.js';
import { OVERDRIVE_SECONDS } from './overdrive.js';
import { PhoneSteering } from './phone-steering.js';
import { bindPress, protectGameSurface } from './touch-controls.js';
import { pressureOf } from './challenge.js';
import { Commander } from './commander.js';
import { COIN_BONUS, scoreOf, burnRate, burnMood } from './scoring.js';
import { Community } from './community.js';
import { VERSION, STEP, ZONES, createRun, beginCharge, cancelCharge, launch, boost, stepRun, clamp, altitudeAt, zoneIndex, fire, findTarget, needsBoost } from './physics.js';
import { POWERUPS } from './ecosystem.js';
import { GameView } from './scene.js';

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const today = () => Math.floor(Date.now() / 86400000);
const storageKey = 'ship-the-bug-cyberspace-flights-s2';
const newFlight = () => createRun(today(), crypto.getRandomValues(new Uint32Array(1))[0]);
const state = { run: newFlight(), paused: false, keys: new Set(), touchSteer: 0, touchDirections: new Map(), touchFire: false, sound: false, saved: false, modalPause: false };
let spaceHeld = false;
let view, last = 0, accumulator = 0, hudTime = 0;
const commander = new Commander();
const community = new Community({ mode: MODE, showModal, closeModal, getRun: () => state.run, toast });
const phone = new PhoneSteering({ document, isPhone: () => document.body.classList.contains('touch'),
  canOffer: () => Boolean(view) && state.run.phase === 'ready' && !hasDialog(),
  showModal, closeModal, announce: message => toast('ARROW CONTROLS READY', message, 3)
});
const tilt = phone.tilt;
for (const surface of document.querySelectorAll('main, .game-header, #world')) protectGameSurface(surface);
const releaseHolds = [];
function clearHolds() { spaceHeld = false; for (const release of releaseHolds) release(); }
let audio = null, notice = null;

function tone(freq = 500, duration = .1, type = 'sine', volume = .025, slide = 0) {
  if (!state.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, audio.currentTime);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration + .01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Sound is optional; a refused AudioContext cannot block the game. */ }
}
function toast(title, sub = '', duration = 2.2) {
  notice = {text: title + (sub ? ' · ' + sub : ''), until: performance.now() + duration * 1000};
}
function showModal(id) {
  const replacing = hasDialog();
  // Hub sign-in may finish while the phone chooser is open. Never stack them.
  if (id !== 'steeringDialog' && $('steeringDialog').open) closeModal('steeringDialog');
  if (!replacing) state.modalPause = state.paused;
  state.paused = true; clearHolds();
  state.keys.clear(); state.touchFire = false; state.touchSteer = 0; state.touchDirections.clear(); cancelCharge(state.run);
  if (!$ (id).open) $(id).showModal();
}
function closeModal(id) { if (id === 'steeringDialog') phone.cancelEnable(); if ($(id).open) $(id).close(); }
for (const id of ['helpDialog', 'scoresDialog', 'profileDialog', 'steeringDialog']) {
  $(id).addEventListener('close', () => { if (!hasDialog()) state.paused = state.modalPause; accumulator = 0; });
  $(id).addEventListener('click', e => {
    if (id !== 'steeringDialog' && e.target === $(id)) { const r = $(id).getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(id); }
  });
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
function hasDialog() { return Boolean(document.querySelector('dialog[open]')); }
function pause() {
  if (state.run.phase !== 'flying' || hasDialog()) return;
  state.paused = true; clearHolds(); state.keys.clear(); state.touchFire = false; state.touchSteer = 0; state.touchDirections.clear();
  $('pauseDialog').showModal();
}
function resume() { tilt.recenter(); closeModal('pauseDialog'); state.paused = false; accumulator = 0; state.keys.clear(); state.touchFire = false; }
$('pauseDialog').addEventListener('cancel', e => { e.preventDefault(); resume(); });
$('resumeBtn').addEventListener('click', resume);
$('pauseBtn').addEventListener('click', pause);
function reset() {
  clearHolds(); phone.cancelEnable(); tilt.recenter(); state.modalPause = false;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  state.run = newFlight(); state.run.angle = Number($('angle').value);
  state.paused = false; state.saved = false; state.keys.clear(); state.touchFire = false; state.touchSteer = 0; state.touchDirections.clear();
  accumulator = 0; view.reset(state.run.day, state.run.seed);
  document.body.classList.remove('is-playing', 'night');
  commander.reset(); community.reset(); notice = null;
  $('saveBtn').disabled = false; $('saveBtn').textContent = 'Save only on this device'; $('localSaveNote').textContent = '';
  $('saveNote').textContent = 'Your choice, every run. Nothing is sent to a server.';
  $('dayLabel').textContent = new Date(state.run.day * 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase() + ' / NEW ROUTE EVERY FLIGHT';
  updateHUD();
}
function actionStart() {
  if (state.paused || hasDialog()) return;
  if (phone.offer()) return;
  if (state.run.phase === 'ready') { beginCharge(state.run); tone(160, .12, 'triangle'); }
  else if (state.run.phase === 'flying') { if (!boost(state.run)) toast('OUT OF PROMPTS', 'Time to trust the trajectory.'); }
}
function actionEnd() {
  if (state.paused || hasDialog()) { cancelCharge(state.run); return; }
  if (launch(state.run)) { community.begin(state.run); document.body.classList.add('is-playing'); updateHUD(); }
}
function bindHold(element) {
  releaseHolds.push(bindPress(element, {
    start: () => { if (state.paused || hasDialog()) return false; actionStart(); },
    end: actionEnd, cancel: () => cancelCharge(state.run)
  }));
  // Keyboard/screen-reader activation without a hold still gives a useful throw.
  element.addEventListener('click', e => {
    if (e.detail === 0 && !state.paused && !hasDialog()) {
      if (phone.offer()) return;
      if (state.run.phase === 'ready') { beginCharge(state.run); state.run.charge = .65; actionEnd(); }
      else if (state.run.phase === 'flying') boost(state.run);
    }
  });
}
bindHold($('actionBtn'));
function shoot() {
  if (state.paused || hasDialog()) return false;
  return fire(state.run, view.objects);
}
releaseHolds.push(bindPress($('fireBtn'), {
  start: () => { if (state.paused || hasDialog()) return false; state.touchFire = true; shoot(); },
  end: () => { state.touchFire = false; }
}));
$('fireBtn').addEventListener('click', e => { if (e.detail === 0) shoot(); });
$('angle').addEventListener('input', () => { state.run.angle = Number($('angle').value); $('angleValue').textContent = state.run.angle + '°'; });
$('restartBtn').addEventListener('click', reset);
$('abortBtn').addEventListener('click', reset);
$('againBtn').addEventListener('click', reset);
$('helpBtn').addEventListener('click', () => showModal('helpDialog'));
function switchCamera() {
  view.cameraMode = view.cameraMode === 'chase' ? 'cinematic' : 'chase';
  $('cameraLabel').textContent = view.cameraMode === 'chase' ? 'CHASE' : 'CINEMA';
  $('cameraBtn').setAttribute('aria-label', `Camera: ${view.cameraMode}. Change camera`);
  toast(view.cameraMode === 'chase' ? 'CHASE CAMERA' : 'CINEMATIC CAMERA', 'Same bug. A different perspective.', 1.5);
}
$('cameraBtn').addEventListener('click', switchCamera);
function toggleSound() {
  state.sound = !state.sound;
  $('soundBtn').setAttribute('aria-pressed', String(state.sound));
  $('soundBtn').setAttribute('aria-label', state.sound ? 'Mute sound' : 'Enable sound');
  $('soundBtn').innerHTML = state.sound ? '<svg viewBox="0 0 24 24"><path d="m11 4-6 5H2v6h3l6 5ZM16 8q5 4 0 8m3-11q8 7 0 14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="m11 4-6 5H2v6h3l6 5ZM16 8l6 8m0-8-6 8"/></svg>';
  tone(520, .08, 'triangle');
}
$('soundBtn').addEventListener('click', toggleSound);
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.isContentEditable) return;
  // Space still launches after using the angle slider; arrows keep editing its value.
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !(e.target.id === 'angle' && e.code === 'Space')) return;
  if (hasDialog()) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { spaceHeld = true; actionStart(); } }
  else if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); state.keys.add(e.code); }
  else if (['KeyF', 'KeyJ'].includes(e.code)) { e.preventDefault(); state.keys.add(e.code); if (!e.repeat) shoot(); }
  else if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); reset(); }
  else if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) { e.preventDefault(); pause(); }
  else if (e.code === 'KeyC' && !e.repeat) switchCamera();
  else if (e.code === 'KeyM' && !e.repeat) toggleSound();
});
document.addEventListener('keyup', e => {
  state.keys.delete(e.code);
  if (e.code === 'Space' && spaceHeld) { e.preventDefault(); spaceHeld = false; actionEnd(); }
});
window.addEventListener('blur', () => { state.keys.clear(); state.touchFire = false; state.touchSteer = 0; state.touchDirections.clear(); cancelCharge(state.run); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelCharge(state.run); pause(); } accumulator = 0; });

for (const [id, direction] of [['leftBtn', -1], ['rightBtn', 1]]) {
  releaseHolds.push(bindPress($(id), {
    start: pointer => {
      if (state.paused || hasDialog()) return false;
      state.touchDirections.set(pointer, direction);
      state.touchSteer = [...state.touchDirections.values()].reduce((a,b) => a+b,0);
    },
    end: pointer => {
      state.touchDirections.delete(pointer);
      state.touchSteer = [...state.touchDirections.values()].reduce((a,b) => a+b,0);
    }
  }));
}
const touchMedia = matchMedia('(any-pointer: coarse)');
const detectTouch = () => { document.body.classList.toggle('touch', touchMedia.matches || navigator.maxTouchPoints > 0); };
detectTouch(); touchMedia.addEventListener('change', detectTouch);
window.addEventListener('orientationchange', () => { clearHolds(); tilt.recenter(); pause(); });
screen.orientation?.addEventListener('change', () => { clearHolds(); tilt.recenter(); pause(); });

function loadScores(key = storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter(r => r && Number.isFinite(r.distance) && r.distance >= 0 && Number.isFinite(r.cycles) && typeof r.zone === 'string' && Number.isFinite(r.at)).slice(0, 20) : [];
  } catch { return []; }
}
$('saveBtn').addEventListener('click', () => {
  if (state.saved || state.run.phase !== 'done') return;
  const r = state.run, rows = loadScores();
  rows.push({ score: scoreOf(r), coins: r.coins, distance: Math.floor(r.d), cycles: r.cycles, zone: ZONES[r.zone].name, duration: r.elapsed, day: r.day, at: Date.now(), version: VERSION, destroyed: r.destroyed, minesCleared: r.minesCleared, shots: r.shotsFired });
  rows.sort((a, b) => (b.score ?? b.distance) - (a.score ?? a.distance));
  try {
    localStorage.setItem(storageKey, JSON.stringify(rows.slice(0, 20)));
    state.saved = true; $('saveBtn').disabled = true; $('saveBtn').textContent = 'SAVED ON THIS DEVICE ✓';
    $('localSaveNote').textContent = 'Saved on this device.';
  } catch { $('localSaveNote').textContent = 'Browser storage is unavailable. Your flight could not be saved.'; }
});
function showLocalScores() {
  const list = $('scoreList'); list.replaceChildren();
  const current = loadScores(), early = loadScores('ship-the-bug-cyberspace-flights-v1');
  if (!current.length && !early.length) {
    const empty = document.createElement('div'); empty.className = 'score-empty'; empty.textContent = 'A clean flight log. Finish a run and choose to save it here.'; list.append(empty);
  }
  for (const [title, scores] of [['Season 2', current], ['Early flights · original rules', early]]) {
  if (scores.length) { const heading=document.createElement('h3');heading.textContent=title;heading.className='local-season';list.append(heading); }
  scores.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'score-row';
    const rank = document.createElement('span'); rank.textContent = String(i + 1).padStart(2, '0');
    const name = document.createElement('div'); name.textContent = r.zone;
    const date = document.createElement('small'); date.textContent = new Date(r.at).toLocaleDateString('en-GB') + ` · ${fmt(r.distance)} m · ${r.coins ?? 0} coins`; name.append(date);
    const distance = document.createElement('strong'); distance.textContent = fmt(r.score ?? r.distance) + ' pts';
    row.append(rank, name, distance); list.append(row);
  });
  }
  $('boardStatus').textContent = 'Flights saved only in this browser, grouped by rules.';
}
$('localTab').addEventListener('click', () => { community.local(); showLocalScores(); });
function finish() {
  const r = state.run;
  $('resultTitle').textContent = r.zone >= 9 ? 'Hello, mainnet.' : r.zone >= 3 ? 'Well, it shipped.' : 'A promising bug.';
  $('resultQuip').textContent = 'Out of momentum. ' + (r.mineHits ? 'Red rings mark mines. Try a gap or one well-timed pulse.' : r.ghost.hits ? 'Try two quick pulses when Motoko circles in front.' : r.overheats > 1 ? 'Use shorter bursts so the blaster is ready when it matters.' : r.prompts ? 'You still had a boost. Save the next landing!' : 'A cleaner route or a lucky updraft could carry the next bug further.');
  $('resultScore').textContent = fmt(scoreOf(r));
  $('resultDistance').textContent = fmt(r.d) + ' m';
  $('resultBonus').textContent = `${fmt(r.d)} distance + ${r.coins} coins × ${COIN_BONUS} = ${fmt(scoreOf(r))} points`;
  void community.finish();
  $('resultZone').textContent = ZONES[r.zone].name;
  $('resultTime').textContent = Math.round(r.elapsed) + ' sec';
  $('resultCombat').textContent = `${r.destroyed} firewalls patched · ${r.minesCleared} mines defused · ${r.ghost.kills} ghosts debugged · ${r.shotsFired} pulses fired · ${r.flow.activations} overdrives · ${r.flow.nearMisses} close calls · ${fmt(r.burnTotal)} K simulated cycles`;
  $('resultSeals').replaceChildren();
  for (const kind of r.seals) {
    const badge = document.createElement('span'); badge.textContent = POWERUPS[kind]?.name || kind;
    badge.style.setProperty('--seal', POWERUPS[kind]?.color || '#b5ffd0'); $('resultSeals').append(badge);
  }
  if (!r.seals.size) $('resultSeals').textContent = 'Catch ecosystem artifacts to earn your mission patches.';
  $('resultDialog').showModal();
  $('resultTitle').focus({preventScroll:true}); $('resultDialog').scrollTop = 0;
  tone(330, .3, 'triangle');
}
$('resultDialog').addEventListener('cancel', e => { e.preventDefault(); if (!state.run.publishing) reset(); });

ZONES.forEach(z => {
  const article = document.createElement('article');
  const glyph = document.createElement('span'); glyph.className = 'atlas-glyph'; glyph.textContent = z.glyph; glyph.style.color = z.color;
  const content = document.createElement('div');
  const heading = document.createElement('b'); heading.textContent = z.name;
  const fact = document.createElement('p'); fact.textContent = z.fact;
  const link = document.createElement('a'); link.href = z.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Explore the real technology ↗';
  content.append(heading, fact, link); article.append(glyph, content); $('atlas').append(article);
});
ZONES.forEach((z, i) => {
  const dot = document.createElement('i'); dot.dataset.label = z.key.toUpperCase(); dot.dataset.zone = i;
  $('journeyLine').append(dot);
});
function updateHUD() {
  updateModeSwitchers(state.run);
  const r = state.run, z = ZONES[r.zone], next = ZONES[r.zone + 1];
  $('score').textContent = fmt(scoreOf(r)); $('distance').textContent = fmt(r.d); $('coins').textContent = fmt(r.coins);
  $('speed').textContent = Math.round(r.speed) + ' m/s';
  $('zoneName').textContent = z.name; $('zoneTag').textContent = z.tag; $('stageDot').style.background = z.color;
  $('zoneProgress').style.width = next ? `${clamp((r.d - z.at) / (next.at - z.at), 0, 1) * 100}%` : '100%';
  $('nextZone').textContent = next ? `NEXT: ${next.name.toUpperCase()} · ${fmt(next.at - r.d)} m` : 'ENDLESS MAINNET · KEEP SHIPPING';
  $('actionFill').style.transform = `scaleX(${r.phase === 'charging' ? r.charge : 0})`;
  $('actionText').textContent = r.phase === 'charging' ? (r.charge >= .94 ? 'PERFECT — RELEASE!' : `CHARGING ${Math.round(r.charge * 100)}%`) : r.phase === 'flying' ? (r.prompts > 0 ? (needsBoost(r) ? 'BOOST NOW' : 'PROMPT BOOST') : 'OUT OF PROMPTS') : 'HOLD TO CHARGE';
  $('actionHint').textContent = r.phase === 'flying' ? (needsBoost(r) ? 'BOOST NOW — YOUR BUG IS SLOWING DOWN' : 'SPACE / TAP TO BOOST · STEER LEFT & RIGHT') : 'RELEASE NEAR FULL · THE METER SWINGS BACK';
  $('actionBtn').classList.toggle('rescue-ready', needsBoost(r));
  if (notice && performance.now() < notice.until && !needsBoost(r)) $('actionHint').textContent = notice.text;
  $('actionBtn').disabled = r.phase === 'done' || (r.phase === 'flying' && r.prompts === 0);
  if (r.phase === 'done') { $('actionText').textContent = 'FLIGHT COMPLETE'; $('actionHint').textContent = 'READY FOR YOUR NEXT MISSION'; }
  $('boostPips').setAttribute('aria-label',`${r.prompts} prompt boosts remaining`);
  [...$('boostPips').children].forEach((p, i) => p.classList.toggle('used', i >= r.prompts));
  [...$('journeyLine').children].forEach((p, i) => { p.classList.toggle('active', i === r.zone); p.classList.toggle('passed', i < r.zone); });
  document.body.classList.toggle('night', r.d >= 430);
  document.body.style.setProperty('--chapter', z.color);
  commander.update(r);
  $('burnRate').textContent = burnRate(r);
  $('burnFill').style.width = Math.min(100, burnRate(r) / 1.8) + '%';
  $('burnMood').textContent = burnMood(r);
  const flow=r.flow,flowValue=flow.active>0?flow.active/OVERDRIVE_SECONDS*100:flow.charge;
  $('flowLabel').textContent=flow.active>0?`OVERDRIVE ${Math.ceil(flow.active)}s`:flow.cooldown>0?'FLOW · RECHARGING':`FLOW ${flow.charge}%`;
  $('flowFill').style.width=flowValue+'%';$('flowMeter').setAttribute('aria-valuenow',String(Math.round(flowValue)));
  $('flowMeter').setAttribute('aria-valuetext',flow.active>0?`Overdrive active for ${Math.ceil(flow.active)} seconds`:`${flow.charge} percent charged`);
  document.body.classList.toggle('overdrive-active',r.phase==='flying'&&flow.active>0);
  $('flightWeather').textContent = r.phase === 'flying' ? r.wind.label : 'ZÜRICH';
  $('flightWeather').classList.toggle('incoming', r.phase === 'flying' && r.wind.warning);
  $('flightPressure').textContent = r.phase === 'flying' ? ['CRUISE', 'TURBULENT', 'REDLINE'][Math.min(2, Math.floor(pressureOf(r)))] : 'MAINNET';
  const abilities = [r.shield ? '⌘ IDENTITY SHIELD' : '', r.anchor ? '▥ STATE SAVED' : '', r.magnetTime > 0 ? `◉ OISY MAGNET ${Math.ceil(r.magnetTime)}s` : ''].filter(Boolean);
  $('abilityHud').textContent = abilities.join('   /   ');
  const target = findTarget(r, view.objects);
  $('fireBtn').disabled = r.phase !== 'flying' || r.stillTime > 0;
  $('fireBtn').classList.toggle('locked', Boolean(target));
  $('fireStatus').textContent = r.overheated ? 'COOLING…' : target?.kind === 'ghost' ? `GHOST · ${r.ghost.hp} HIT${r.ghost.hp > 1 ? 'S' : ''}` : target?.kind === 'mine' ? 'MINE · 1 HIT' : target ? `LOCK · ${(target.hp || 1) - (r.wallDamage.get(target.id) || 0)} HIT${(target.hp || 1) > 1 ? 'S' : ''}` : 'BURSTS > SPAM';
  $('fireBtn').classList.toggle('overheated', r.overheated);
  $('weaponHeat').style.width = Math.round(r.weaponHeat * 100) + '%';
  $('weaponMeter').setAttribute('aria-valuenow', String(Math.round(r.weaponHeat * 100)));
  $('weaponMeter').setAttribute('aria-valuetext', r.overheated ? 'Overheated, cooling' : `${Math.round(r.weaponHeat * 100)} percent heat`);
  $('fireBtn').style.setProperty('--charge', String(1 - Math.min(1, r.shotCooldown / .22)));
  view.target = target;
}
function processEvents() {
  for (const e of state.run.effects.splice(0)) {
    view.event(e, state.run);
    if (e.kind === 'zone') {
      commander.update(state.run);
      tone(659, .2, 'triangle'); setTimeout(() => tone(880, .18, 'triangle'), 140);
    } else if (e.kind === 'shot') {
      tone(1300, .09, 'sawtooth', .012, -950);
    } else if (e.kind === 'collect') {
      if (e.type === 'cycle') {
        tone(900 + state.run.combo % 6 * 90, .07, 'sine', .015);
      }
    } else if (e.kind === 'done') finish();
    else if (e.kind === 'bounce') tone(110, .09, 'triangle', .022, -60);
    else if (e.label) {
      if(e.kind==='overdrive'){toast('OVERDRIVE','Clean flying. Full energy!',2);tone(220,.55,'sawtooth',.018,990);}
      else if(e.kind==='near-miss'){toast('CLOSE CALL','+20 FLOW',1.1);tone(740,.16,'sine',.015,210);}
      else if (e.kind === 'boost' || e.kind === 'portal') tone(240, .35, 'sawtooth', .018, 800);
      else if (['destroy','ghost-destroy','mine-destroy'].includes(e.kind)) tone(180, .3, 'sawtooth', .025, -130);
      else if (e.kind === 'ghost-hit') { toast('MOTOKO PULSE HIT', '−33% momentum'); tone(130,.17,'square',.02,-70); }
      else if (['hazard','mine-hit'].includes(e.kind)) tone(130, .17, 'square', .02, -70);
      else if (e.kind === 'ghost-shot') tone(650,.18,'sawtooth',.018,-420);
      else if (e.kind === 'ghost-warning') tone(310,.35,'triangle',.015,340);
      else tone(340, .14, 'triangle', .022, 230);
    }
  }
}
function steering() {
  const keyDirection = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0);
  return keyDirection || state.touchSteer || (tilt.enabled ? tilt.value() : 0);
}
function tick(dt) {
  view.ensureWorld(state.run.d);
  if (state.touchFire || state.keys.has('KeyF') || state.keys.has('KeyJ')) shoot();
  stepRun(state.run, dt, steering(), view.objects);
  processEvents();
}
function frame(time) {
  const dt = Math.min(.06, Math.max(0, (time - (last || time)) / 1000)); last = time;
  if (!state.paused && !hasDialog() && !view.inspectGhost) {
    accumulator = Math.min(accumulator + dt, .1);
    while (accumulator >= STEP) { tick(STEP); accumulator -= STEP; }
  } else accumulator = 0;
  // No motion during pause/help/result; an idle rooftop can still breathe.
  view.update(state.run, state.paused || hasDialog() ? 0 : dt);
  hudTime += dt; if (hudTime > .06) { updateHUD(); hudTime = 0; }

  requestAnimationFrame(frame);
}
try {
  view = new GameView($('world'), state.run.day, state.run.seed);
  const canvas = view.renderer.domElement;
  canvas.addEventListener('click', e => { if (e.pointerType === 'touch' || e.pointerType === 'pen' || (!e.pointerType && touchMedia.matches)) shoot(); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); toast('GRAPHICS PAUSED', 'The graphics context was lost. Reload to reconnect.', 30); });
  mountModeSwitcher({getRun:()=>state.run});
  $('version').textContent = 'v' + VERSION;
  reset(); view.update(state.run, .016);
  document.body.classList.add('loaded');
  requestAnimationFrame(frame);
  void community.boot();
  // Opt-in, visible inspection controls. No test controls are present at the normal URL.
  if (new URL(location.href).searchParams.get('test') === '1') {
    const lab = document.createElement('aside'); lab.className = 'lab'; lab.setAttribute('aria-label', 'Scene inspection');
    const labToggle = document.createElement('button'); labToggle.className = 'lab-toggle'; labToggle.textContent = 'Toggle inspection';
    labToggle.addEventListener('click', () => lab.classList.toggle('collapsed')); lab.append(labToggle);
    const touchPreview = document.createElement('button'); touchPreview.textContent = 'Show touch controls';
    touchPreview.addEventListener('click', () => { document.body.classList.add('touch'); }); lab.append(touchPreview);
    ZONES.forEach((z, i) => {
      const b = document.createElement('button'); b.textContent = `Preview ${z.key}`;
      b.addEventListener('click', () => {
        reset(); state.run.practice = true; state.run.d = z.at + (i ? 60 : 0); state.run.zone = i; state.run.y = i ? 24 : 21.2;
        state.run.phase = i ? 'flying' : 'ready'; state.run.speed = i ? 85 : 0; state.paused = true;
        document.body.classList.toggle('is-playing', i > 0);
        for (let n = 0; n < 120; n++) view.update(state.run, 1 / 60);
        updateHUD();
      }); lab.append(b);
    });
    for (const kind of ['Boost trail', 'Firewall hit']) {
      const button = document.createElement('button'); button.textContent = `Test ${kind}`;
      button.addEventListener('click', () => {
        reset(); const r = state.run; r.practice = true; r.d = kind === 'Boost trail' ? 2100 : 1350; r.y = 12;
        r.zone = zoneIndex(r.d); r.phase = 'flying'; r.speed = 65; r.vy = 0;
        state.paused = false; document.body.classList.add('is-playing'); view.ensureWorld(r.d);
        if (kind === 'Firewall hit') {
          const wall = view.objects.find(o => o.kind === 'hazard' && o.d > r.d + 30);
          r.x = wall.x; r.y = wall.y;
        }
        for (let i = 0; i < 120; i++) view.update(r, 1 / 60);
        if (kind === 'Firewall hit') fire(r, view.objects); else boost(r);
        processEvents();
        for (let i = 0; i < (kind === 'Boost trail' ? 95 : 60); i++) { tick(STEP); view.update(r, STEP); }
        state.paused = true; updateHUD();
      }); lab.append(button);
    }
    for (const kind of ['Ghost chase', 'Late patrol', 'Ghost warning', 'Ghost projectile', 'Ghost hit', 'Ghost shot', 'Coin score']) {
      const b = document.createElement('button'); b.textContent = 'Test ' + kind;
      b.addEventListener('click', () => {
        reset(); const r = state.run; r.practice = true; r.phase = 'flying'; r.d = 580; r.zone = 2; r.y = 22; r.speed = 30; r.vy = 0;
        document.body.classList.add('is-playing');
        if (kind === 'Late patrol') { r.d=4100; r.zone=zoneIndex(r.d); }
        if (kind === 'Coin score') { r.coins = 12; r.d = 780; r.phase = 'done'; finish(); }
        else if (kind === 'Ghost hit') {
          r.d=720;r.y=12;r.speed=60;
          Object.assign(r.ghost,{active:true,fade:1,phase:'recover',x:8,y:15,d:744,offsetY:3,offsetD:24,encounter:1});
          view.snapCamera=true;view.update(r,.016);
          r.ghost.shots.push({id:1,x:r.x,y:r.y,d:r.d+1,vx:0,vy:0,vd:-120,life:1});
          stepRun(r,STEP,0,[]);processEvents();view.update(r,STEP);
        } else {
          for (let i = 0; i < 120; i++) view.update(r, 1 / 60);
          const steps = kind === 'Late patrol' ? 350 : kind === 'Ghost chase' ? 190 : kind === 'Ghost warning' ? 475 : kind === 'Ghost projectile' ? 565 : kind === 'Ghost shot' ? 260 : 660;
          for (let i = 0; i < (['Ghost warning','Ghost projectile'].includes(kind)?700:steps); i++) {
            stepRun(r, STEP, 0, []); processEvents(); view.update(r, STEP);
            if(kind==='Ghost warning'&&r.ghost.phase==='warning'&&r.ghost.time>.55)break;
            if(kind==='Ghost projectile'&&r.ghost.shots.length&&r.ghost.phase==='fire'&&r.ghost.time>.1)break;
          }
          if (kind === 'Ghost shot') {
            for (let i=0;i<150;i++) { fire(r, []); stepRun(r, STEP, 0, []); processEvents(); view.update(r, STEP); }
          }
        }
        state.paused = !['Ghost chase','Late patrol'].includes(kind); updateHUD();
      }); lab.append(b);
    }
    for (const kind of ['Minefield', 'Mine hit', 'Mine shot', 'Motoko model', 'Motoko rear']) {
      const b=document.createElement('button'); b.textContent='Test '+kind;
      b.addEventListener('click',()=>{
        reset(); const r=state.run; r.practice=true; r.phase='flying'; r.seed=38;
        r.d=2160; r.y=7; r.speed=55; r.zone=zoneIndex(r.d); r.mineWarning=true;
        view.reset(r.day,r.seed); view.ensureWorld(r.d); document.body.classList.add('is-playing');
        if(kind.startsWith('Motoko')) {
          r.d=650; r.y=25; r.zone=2; view.inspectGhost=kind==='Motoko rear'?'rear':true;
          Object.assign(r.ghost,{active:true,fade:1,phase:'orbit',x:0,y:28,d:672,offsetY:3,offsetD:22,hp:2,encounter:1});
        } else if(kind!=='Minefield') {
          const mine=view.objects.find(o=>o.kind==='mine'&&!o.airborne&&o.d>r.d+35);
          r.x=mine.x; r.y=mine.y; r.d=mine.d-(kind==='Mine hit'?2:40);
          if(kind==='Mine shot') fire(r,[mine]);
          for(let i=0;i<(kind==='Mine hit'?1:25);i++) {stepRun(r,STEP,0,[mine]);processEvents();view.update(r,STEP);}
        }
        for(let i=0;i<90;i++) view.update(r,1/60);
        state.paused=!kind.startsWith('Motoko'); updateHUD();
      }); lab.append(b);
    }
    const driveTest=document.createElement('button');driveTest.textContent='Test Overdrive';
    driveTest.addEventListener('click',()=>{
      reset();const r=state.run;r.practice=true;r.phase='flying';r.d=1900;r.y=24;r.speed=80;r.zone=zoneIndex(r.d);r.flow.charge=96;
      document.body.classList.add('is-playing');view.ensureWorld(r.d);
      for(let i=0;i<120;i++)view.update(r,1/60);
      stepRun(r,STEP,0,[{id:'practice-flow',kind:'cycle',x:r.x,y:r.y,d:r.d,radius:2.7}]);processEvents();
      for(let i=0;i<90;i++){stepRun(r,STEP,0,[]);processEvents();view.update(r,STEP);}
      state.paused=true;updateHUD();
    });lab.append(driveTest);
    for (const kind of ['Boost rescue', 'Final stop']) {
      const b=document.createElement('button');b.textContent='Test '+kind;
      b.addEventListener('click',()=>{
        reset();const r=state.run;r.practice=true;r.phase='flying';r.d=1850;r.y=1.15;r.vy=0;r.speed=9;
        r.prompts=kind==='Boost rescue'?2:0;r.zone=zoneIndex(r.d);commander.zone=r.zone;
        view.ensureWorld(r.d);document.body.classList.add('is-playing');
        for(let i=0;i<90;i++)view.update(r,1/60);state.paused=false;updateHUD();
      });lab.append(b);
    }
    const output = document.createElement('output'); output.id = 'renderStats'; lab.append(output); document.body.append(lab);
    setInterval(() => { output.textContent = JSON.stringify({ ...view.stats(), shots: state.run.shotsFired, patched: state.run.destroyed, minesCleared: state.run.minesCleared, mineHits: state.run.mineHits, projectiles: state.run.projectiles.length, coins: state.run.coins, score: scoreOf(state.run), flow:state.run.flow.charge,overdrive:state.run.flow.active,overdrives:state.run.flow.activations,nearMisses:state.run.flow.nearMisses,ghost: state.run.ghost.phase, ghostHits: state.run.ghost.hits, ghostKills:state.run.ghost.kills, ghostHp:state.run.ghost.hp, heat:Math.round(state.run.weaponHeat*100), elapsed:Math.round(state.run.elapsed), settling:state.run.stillTime, commander:document.getElementById('commander').dataset.visible, ghostVisible:state.run.ghost.fade>.5, tilt:tilt.enabled, steer:steering(), x:Math.round(state.run.x*10)/10 }); }, 800);
  }
} catch (error) {
  console.error(error);
  $('loadMessage').textContent = 'A WebGL 2 browser is needed for this flight. Try a current Chrome, Safari or Firefox with graphics acceleration enabled.';
}
