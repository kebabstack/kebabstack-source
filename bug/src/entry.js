import { MODE, MODE_KEY } from './mode.js';
const $=id=>document.getElementById(id);
document.body.dataset.mode=MODE;
try{localStorage.setItem(MODE_KEY,MODE);}catch{}
$('world').setAttribute('aria-label',`${MODE.toUpperCase()} flight world`);
$('resultModeLabel').textContent=`FLIGHT COMPLETE · ${MODE.toUpperCase()} · SEASON ${MODE==='2d'?1:2}`;
$('resultCrewLabel').textContent=`${MODE.toUpperCase()} FLIGHT CREW`;
$('localTab').textContent=`On this device (${MODE.toUpperCase()})`;
async function start() {
 if(MODE==='2d') {
  const css=document.createElement('link');css.rel='stylesheet';css.href='./two-d/retro.css';
  const ready=new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=()=>reject(Error('2D styles could not load.'));});
  document.head.insertBefore(css,document.querySelector('link[href="./modes.css"]'));
  document.querySelector('link[rel="icon"]').href='./two-d/favicon.svg';
  document.querySelector('.brand img').src='./two-d/favicon.svg';
  document.querySelector('.brand-sub').textContent='ONE BUG · TWO DIMENSIONS';
  $('gameTitle').innerHTML='SHIP<br>THE <em>BUG.</em><span>2D</span>';
  document.querySelector('#intro .eyebrow').textContent='KEBABSTACK ARCADE · 16-BIT FLIGHT';
  document.querySelector('#intro > p').textContent='ZÜRICH → INFINITY';
  document.querySelector('#intro .launch-coordinates').textContent='Five boosts. Full send.';
  for(const id of ['cameraBtn','tiltBtn','steerGuide','touchSteer','steeringDialog','webbCredits'])$(id)?.remove();
  $('controlHint').innerHTML='MOUSE AIM <span>·</span> <kbd>SPACE</kbd> CHARGE / BOOST <span>·</span> <kbd>F</kbd> FIRE';
  const help=document.querySelectorAll('.help-list li');
  for(const row of help)row.innerHTML=row.innerHTML.replaceAll('green button','gold button');
  help[2].innerHTML='<b>Follow the arc.</b><span>Aim with the mouse, or drag on the sky. Hold to charge and release to launch. The slider and Space also work. Cyan solar currents give free lift; save your five boosts for the gaps.</span>';
  help[5].querySelector('span').textContent='Motoko appears from 500 m in its own clear stretches, with no overlapping walls or mines. Watch the pink cannon charge, then time a boost or land two hits. The blaster leads its movement automatically.';
  help[6].querySelector('span').textContent='Hold F / J or FIRE. Nearby threats get automatic aim assistance. Fire in bursts to avoid overheating. Each coin adds 50 points; combat rewards are simulated cycles. A final 1.6-second window lets you use a remaining boost.';
  document.querySelector('#helpDialog > .privacy-note').textContent='P / Escape pauses · R restarts · M toggles sound. 2D and 3D share your callsign and sign-in, with separate scoreboards. Choose your next mode at the start or after a flight. Publishing is always your choice.';
  await ready;await import('./two-d/main.js');
 } else await import('./main.js');
}
start().catch(error=>{console.error(error);$('loadMessage').textContent='The game could not load. Reload to try again.';});
