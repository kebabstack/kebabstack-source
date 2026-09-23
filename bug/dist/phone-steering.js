import { TiltSteering } from './tilt.js';

// Ask once per page visit, before launch. OS permission still requires a real click.
export class PhoneSteering {
  constructor({ document, host = window, now, isPhone, canOffer, showModal, closeModal, announce = () => {} }) {
    Object.assign(this, { document, isPhone, canOffer, showModal, closeModal, announce });
    this.decided = false; this.activating = false;
    this.dialog = document.getElementById('steeringDialog');
    this.button = document.getElementById('tiltBtn');
    this.useTilt = document.getElementById('useTiltBtn');
    this.status = document.getElementById('steeringStatus');
    this.tilt = new TiltSteering({ host, now, onChange: state => this.changed(state) });
    this.useTilt.addEventListener('click', () => this.enable());
    document.getElementById('useArrowsBtn').addEventListener('click', () => this.arrows());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.arrows(); });
    this.dialog.addEventListener('close', () => {
      // Another dialog or a reset may interrupt the choice while OS permission is pending.
      this.cancelEnable();
    });
    this.button.addEventListener('click', () => {
      if (this.tilt.enabled) { this.decided = true; this.tilt.disable(); }
      else { this.open(); void this.enable(); }
    });
  }
  offer() {
    if (this.decided || !this.isPhone() || !this.canOffer()) return false;
    this.open(); return true;
  }
  open() {
    this.status.textContent = 'Hold your phone comfortably. You can change this later with the phone icon.';
    this.useTilt.disabled = false; this.useTilt.textContent = 'USE TILT';
    this.showModal('steeringDialog');
  }
  async enable() {
    if (this.activating) return;
    this.activating = true;
    // No await before this call: iOS must see the button's user activation.
    await this.tilt.enable();
  }
  cancelEnable() {
    if (this.activating) { this.activating = false; this.tilt.disable(); }
  }
  arrows() {
    this.decided = true; this.activating = false; this.tilt.disable();
    this.closeModal('steeringDialog');
  }
  changed({ enabled, pending, ready, message }) {
    this.button.setAttribute('aria-pressed', String(enabled));
    const label = enabled ? 'Disable tilt steering' : 'Enable tilt steering';
    this.button.setAttribute('aria-label', label); this.button.title = label;
    this.button.disabled = pending;
    if (this.dialog.open) {
      this.status.textContent = message;
      this.useTilt.disabled = pending || enabled;
      this.useTilt.textContent = pending ? 'ALLOW MOTION…' : enabled ? 'SETTING YOUR GRIP…' : 'TRY TILT AGAIN';
    }
    if (this.activating && ready) {
      this.decided = true; this.activating = false;
      this.closeModal('steeringDialog');
    } else if (!enabled && !pending) {
      const failed = this.activating; this.activating = false;
      // Failures stay in the chooser; signal loss during play gets a short message only.
      if (!this.dialog.open && (failed || message.startsWith('No motion'))) this.announce(message);
    }
  }
}
