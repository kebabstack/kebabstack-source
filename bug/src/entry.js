import { MODE, MODE_KEY } from './mode.js';
import { loadingFailed, gameReady } from './loading.js';
import { ZONES, POWERUPS } from './ecosystem.js';
import { TOKENS_TO_LINK, relaySignal } from './relay.js';
const $=id=>document.getElementById(id);
gameReady(false);
$('loadRetry').addEventListener('click', () => location.reload());
const TIPS=['Release the charge just before the meter swings back: a perfect launch adds momentum.','Five coins in a row within 2.5 seconds each add bonus FLOW. At 100 FLOW, Overdrive starts by itself.','A really close pass of a mine or candle is worth +20 FLOW once you clear it.','Hold F to fire in short bursts. Holding forever overheats the blaster.','Press M for sound. The engine pitch follows your airspeed.','Save a prompt boost for the final crawl: you get 1.6 seconds to rescue a landing.'];
$('loadTip').textContent='TIP · '+TIPS[Math.floor(Math.random()*TIPS.length)];
document.body.dataset.mode=MODE;
try{localStorage.setItem(MODE_KEY,MODE);}catch{}
$('world').setAttribute('aria-label',`${MODE.toUpperCase()} flight world`);
$('resultModeLabel').textContent=`FLIGHT COMPLETE · ${MODE.toUpperCase()} · SEASON ${MODE==='2d'?1:2}`;
$('resultCrewLabel').textContent=`${MODE.toUpperCase()} FLIGHT CREW`;
$('localTab').textContent=`On this device (${MODE.toUpperCase()})`;
$('briefingBtn').addEventListener('click', () => $('helpBtn').click());

// Text-only zoom can make the briefing taller than the space above the launch controls.
const intro = $('intro');
const controls = document.querySelector('.bottom-area');
function fitBriefing() {
  const room = Math.max(0, controls.offsetTop - intro.offsetTop - 8);
  intro.style.setProperty('--briefing-room', room + 'px');
  intro.classList.toggle('scroll-briefing', intro.scrollHeight > room);
}
if (typeof ResizeObserver === 'function') {
  const briefingSize = new ResizeObserver(() => requestAnimationFrame(fitBriefing));
  for (const node of [intro, controls, intro.parentElement]) briefingSize.observe(node);
} else {
  window.addEventListener('resize', fitBriefing);
}
fitBriefing();
document.fonts?.ready.then(fitBriefing);

function buildFlightPlan() {
  const atlas = $('atlas');
  for (const zone of ZONES) {
    const card = document.createElement('article');
    const glyph = document.createElement('span');
    glyph.className = 'atlas-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = zone.glyph;
    const text = document.createElement('div');
    const position = document.createElement('small');
    position.textContent = `${zone.period} · ${zone.at.toLocaleString('en-US')} m`;
    const title = document.createElement('h4');
    title.textContent = zone.name;
    const fact = document.createElement('p');
    fact.textContent = zone.fact;
    const pickup = POWERUPS[zone.pickup];
    const fieldNote = document.createElement('p');
    fieldNote.className = 'atlas-token';
    fieldNote.textContent = `${zone.token} +50 · Link ${TOKENS_TO_LINK} to activate: ${relaySignal(zone)}. ${pickup.name}: ${pickup.effect}.`;
    const source = document.createElement('a');
    source.href = zone.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Mission source ↗';
    source.setAttribute('aria-label', `Source for ${zone.name} (opens a new tab)`);
    text.append(position, title, fact, fieldNote, source);
    card.style.setProperty('--mission-ink', zone.color);
    card.append(glyph, text);
    atlas.append(card);
  }
}
async function start() {
 buildFlightPlan();
 if(MODE==='2d') {
  const css=document.createElement('link');css.rel='stylesheet';css.href='./two-d/retro.css';
  const ready=new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=()=>reject(Error('2D styles could not load.'));});
  document.head.insertBefore(css,document.querySelector('link[href="./modes.css"]'));
  document.querySelector('link[rel="icon"]').href='./two-d/favicon.svg';
  document.querySelector('.brand img').src='./two-d/favicon.svg';
  document.querySelector('.brand-sub').textContent='MISSION CONTROL';
  $('gameTitle').innerHTML='SHIP<br>THE <em>BUG.</em><span>2D</span>';
  document.querySelector('#intro .eyebrow').textContent='GENESIS RELAY / ZÜRICH';
  document.querySelector('#intro > p').textContent='Ride the relay trails from the first DFINITY experiments to a working OpenSaaS app.';
  for(const id of ['cameraBtn','tiltBtn','steerGuide','touchSteer','steeringDialog','webbCredits'])$(id)?.remove();
  $('controlHint').innerHTML='MOUSE AIM <span>·</span> <kbd>SPACE</kbd> CHARGE / BOOST <span>·</span> <kbd>F</kbd> FIRE';
  $('moonHelp').remove();$('moonCombo').remove();$('hazardLegend').textContent='PATCH FIREWALLS';
  const help=document.querySelectorAll('.help-list li');
  for(const row of help)row.innerHTML=row.innerHTML.replaceAll('green button','gold button');
  help[2].innerHTML='<b>Follow the arc.</b><span>Aim with the mouse, or drag on the sky. Hold to charge and release to launch. The slider and Space also work. Cyan solar currents give free lift; save your five boosts for the gaps.</span>';
  help[3].querySelector('span').textContent='Press SPACE or the gold button mid-flight to boost. Five prompts per flight. Each relay token adds 50 points. Follow the trails for FLOW and collect the larger pickups for abilities. Firewalls and mines cost momentum. An Identity shield covers one hit. Orange armor needs two pulses. Lift pickups get weaker as pressure rises.';
  help[4].querySelector('span').textContent=help[4].querySelector('span').textContent.replace('mine or candle','mine or firewall');
  help[6].querySelector('b').textContent='Patch the firewall. With lasers.';
  help[5].querySelector('span').textContent='Motoko appears from 500 m in its own clear stretches, with no overlapping walls or mines. Watch the pink cannon charge, then time a boost or land two hits. The blaster leads its movement automatically.';
  help[6].querySelector('span').textContent='Hold F / J or FIRE. Nearby threats get automatic aim assistance. Fire in bursts to avoid overheating. Each coin adds 50 points; combat rewards are simulated cycles. A final 1.6-second window lets you use a remaining boost.';
  document.querySelector('#helpDialog > .privacy-note').textContent='P / Escape pauses · R restarts · M toggles sound. 2D and 3D share your callsign and sign-in, with separate scoreboards. Choose your next mode at the start or after a flight. Publishing is always your choice.';
  await ready;await import('./two-d/main.js');
 } else await import('./main.js');
}
start().catch(error=>{console.error(error);loadingFailed('The game could not load. Try again, or switch to 2D Retro.');});
