import { registerGameTools } from './game-tools.js';
import { OVERDRIVE_SECONDS } from './overdrive.js';

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
const storageKey = 'ship-the-bug-2d-flights-v1';
const newFlight = () => createRun(today(), crypto.getRandomValues(new Uint32Array(1))[0]);
const state = { run: newFlight(), paused: false, keys: new Set(), touchFire: false, sound: false, saved: false, modalPause: false };
let view, last = 0, accumulator = 0, hudTime = 0;
const commander = new Commander();
const community = new Community({ showModal, closeModal, getRun: () => state.run, toast });
for (const surface of document.querySelectorAll('main, .game-header, #world')) protectGameSurface(surface);
const releaseHolds = [];
function clearHolds() { for (const release of releaseHolds) release(); }
let audio = null, notice = null;

function tone(freq = 500, duration = .1, type = 'square', volume = .025, slide = 0) {
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
  if (!replacing) state.modalPause = state.paused;
  state.paused = true; clearHolds();
  state.keys.clear(); state.touchFire = false; cancelCharge(state.run);
  if (!$ (id).open) $(id).showModal();
}
function closeModal(id) { if ($(id).open) $(id).close(); }
for (const id of ['helpDialog', 'scoresDialog', 'profileDialog']) {
  $(id).addEventListener('close', () => { if (!hasDialog()) state.paused = state.modalPause; accumulator = 0; });
  $(id).addEventListener('click', e => {
    if (e.target === $(id)) { const r = $(id).getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(id); }
  });
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
function hasDialog() { return Boolean(document.querySelector('dialog[open]')); }
function pause() {
  if (state.run.phase !== 'flying' || hasDialog()) return;
  state.paused = true; clearHolds(); state.keys.clear(); state.touchFire = false;
  $('pauseDialog').showModal();
}
function resume() { closeModal('pauseDialog'); state.paused = false; accumulator = 0; state.keys.clear(); state.touchFire = false; }
$('pauseDialog').addEventListener('cancel', e => { e.preventDefault(); resume(); });
$('resumeBtn').addEventListener('click', resume);
$('pauseBtn').addEventListener('click', pause);
function reset() {
  clearHolds(); state.modalPause = false;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  state.run = newFlight(); state.run.angle = Number($('angle').value);
  state.paused = false; state.saved = false; state.keys.clear(); state.touchFire = false;
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
function toggleSound() {
  state.sound = !state.sound;
  $('soundBtn').setAttribute('aria-pressed', String(state.sound));
  $('soundBtn').setAttribute('aria-label', state.sound ? 'Mute sound' : 'Enable sound');
  $('soundBtn').innerHTML = state.sound ? '<svg viewBox="0 0 24 24"><path d="m11 4-6 5H2v6h3l6 5ZM16 8q5 4 0 8m3-11q8 7 0 14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="m11 4-6 5H2v6h3l6 5ZM16 8l6 8m0-8-6 8"/></svg>';
  tone(520, .08, 'triangle');
}
$('soundBtn').addEventListener('click', toggleSound);
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (hasDialog()) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) actionStart(); }
  else if (['KeyF', 'KeyJ'].includes(e.code)) { e.preventDefault(); state.keys.add(e.code); if (!e.repeat) shoot(); }
  else if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); reset(); }
  else if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) { e.preventDefault(); pause(); }
  else if (e.code === 'KeyM' && !e.repeat) toggleSound();
});
document.addEventListener('keyup', e => {
  state.keys.delete(e.code);
  if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); actionEnd(); }
});
window.addEventListener('blur', () => { state.keys.clear(); state.touchFire = false; cancelCharge(state.run); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelCharge(state.run); pause(); } accumulator = 0; });

const touchMedia = matchMedia('(any-pointer: coarse)');
const detectTouch = () => { document.body.classList.toggle('touch', touchMedia.matches || navigator.maxTouchPoints > 0); };
detectTouch(); touchMedia.addEventListener('change', detectTouch);
window.addEventListener('orientationchange', () => { clearHolds(); pause(); });
screen.orientation?.addEventListener('change', () => { clearHolds(); pause(); });

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
  const current = loadScores(), early = loadScores('ship-the-bug-2d-early');
  if (!current.length && !early.length) {
    const empty = document.createElement('div'); empty.className = 'score-empty'; empty.textContent = 'A clean flight log. Finish a run and choose to save it here.'; list.append(empty);
  }
  for (const [title, scores] of [['2D · Season 1', current], ['Early flights · original rules', early]]) {
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
  const r = state.run, z = ZONES[r.zone], next = ZONES[r.zone + 1];
  $('score').textContent = fmt(scoreOf(r)); $('distance').textContent = fmt(r.d); $('coins').textContent = fmt(r.coins);
  $('speed').textContent = Math.round(r.speed) + ' m/s';
  $('zoneName').textContent = z.name; $('zoneTag').textContent = z.tag; $('stageDot').style.background = z.color;
  $('zoneProgress').style.width = next ? `${clamp((r.d - z.at) / (next.at - z.at), 0, 1) * 100}%` : '100%';
  $('nextZone').textContent = next ? `NEXT: ${next.name.toUpperCase()} · ${fmt(next.at - r.d)} m` : 'ENDLESS MAINNET · KEEP SHIPPING';
  $('actionFill').style.transform = `scaleX(${r.phase === 'charging' ? r.charge : 0})`;
  $('actionText').textContent = r.phase === 'charging' ? (r.charge >= .94 ? 'PERFECT — RELEASE!' : `CHARGING ${Math.round(r.charge * 100)}%`) : r.phase === 'flying' ? (r.prompts > 0 ? (needsBoost(r) ? 'BOOST NOW' : 'PROMPT BOOST') : 'OUT OF PROMPTS') : 'HOLD TO CHARGE';
  $('actionHint').textContent = r.phase === 'flying' ? (needsBoost(r) ? 'BOOST NOW — YOUR BUG IS SLOWING DOWN' : 'SPACE / TAP TO BOOST · F TO FIRE') : 'RELEASE NEAR FULL · THE METER SWINGS BACK';
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
function tick(dt) {
  view.ensureWorld(state.run.d);
  if (state.touchFire || state.keys.has('KeyF') || state.keys.has('KeyJ')) shoot();
  stepRun(state.run, dt, 0, view.objects);
  processEvents();
}
function frame(time) {
  const dt = Math.min(.06, Math.max(0, (time - (last || time)) / 1000)); last = time;
  if (!state.paused && !hasDialog()) {
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

  canvas.addEventListener('click', () => shoot());
  $('version').textContent = 'v' + VERSION;
  reset(); view.update(state.run, .016);
  document.body.classList.add('loaded');
  const unregisterTools=registerGameTools(document.modelContext,{read:()=>({phase:state.run.phase,score:scoreOf(state.run),distance:Math.floor(state.run.d),boosts:state.run.prompts,paused:state.paused}),restart:reset});
  window.addEventListener('pagehide',unregisterTools,{once:true});
  requestAnimationFrame(frame);
  void community.boot();

} catch (error) {
  console.error(error);
  $('loadMessage').textContent = 'The 2D game could not start. Reload to try again.';
}
