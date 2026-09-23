import { ZONES } from './ecosystem.js';
import { needsBoost } from './physics.js';
export class Commander {
  constructor({document=globalThis.document,now=()=>performance.now()}={}) {
    this.element=document.getElementById('commander');this.title=document.getElementById('commanderTitle');
    this.message=document.getElementById('commanderMessage');this.now=now;this.reset();
  }
  hide() {this.element.dataset.visible='false';this.element.setAttribute('aria-hidden','true');this.kind='';}
  reset() {this.zone=0;this.until=0;this.nudged=false;this.hide();}
  show(title,text,seconds,kind) {
    this.title.textContent=title;this.message.textContent=text;this.until=this.now()+seconds*1000;this.kind=kind;
    this.element.dataset.mood=kind==='boost'?'alert':'happy';this.element.dataset.visible='true';this.element.setAttribute('aria-hidden','false');
  }
  update(run) {
    if(run.phase!=='flying'){this.zone=run.zone;this.hide();return;}
    if(run.zone!==this.zone){
      this.zone=run.zone;const z=ZONES[run.zone];
      if(!needsBoost(run))this.show(z.name.toUpperCase(),z.message,4.5,'epoch');
    }
    const rescue=needsBoost(run);
    if(rescue&&!this.nudged){
      this.nudged=true;
      this.show('ONE MORE PROMPT, PILOT!',`You still have ${run.prompts} boost${run.prompts===1?'':'s'}. Tap BOOST now to keep flying!`,3,'boost');
    } else if(!rescue){this.nudged=false;if(this.kind==='boost')this.hide();}
    if(this.now()>=this.until)this.hide();
  }
}
