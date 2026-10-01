export const GUEST_KEY = 'stb3d-browser-identity-v1';
const PROFILE_KEY = 'ship-the-bug-profile-v1:';
export const validName = name => /^[a-zA-Z0-9 ._-]{3,20}$/.test(name) && name === name.trim();

// Keep the existing browser key: replacing it would strand existing callsigns.
export class PlayerSession {
  constructor({ auth, storage, createGuest, restoreGuest }) {
    Object.assign(this, { auth, storage, createGuest, restoreGuest });
    this.guest = null;
    this.persistent = false;
  }
  guestIdentity() {
    if (this.guest) return this.guest;
    try { const saved = this.storage?.getItem(GUEST_KEY); if (saved) this.guest = this.restoreGuest(saved); } catch {}
    if (!this.guest) {
      this.guest = this.createGuest();
      try { this.storage?.setItem(GUEST_KEY, JSON.stringify(this.guest.toJSON())); } catch {}
    }
    this.checkGuestStorage();
    return this.guest;
  }
  checkGuestStorage() {
    this.persistent = false;
    try { const saved = this.storage?.getItem(GUEST_KEY); this.persistent = Boolean(saved && this.restoreGuest(saved).getPrincipal().toText() === this.guest.getPrincipal().toText()); } catch {}
    return this.persistent;
  }
  snapshot() {
    const principal = this.auth?.getPrincipal();
    const kind = principal ? 'ii' : 'guest';
    const id = (principal || this.guestIdentity().getPrincipal()).toText();
    let name = '';
    try { name = this.storage?.getItem(PROFILE_KEY + id) || ''; } catch {}
    return { id, kind, name: validName(name) ? name : '', status: this.auth?.getStatus() || 'signed-out' };
  }
  saveName(name, expected = this.snapshot().id) {
    if (!validName(name)) throw new Error('Use 3–20 letters, numbers, spaces, dots, hyphens or underscores.');
    if (expected !== this.snapshot().id) throw new Error('Your player changed. Open your profile again.');
    if (!this.storage) throw new Error('Browser storage is unavailable. You can still play without a saved profile.');
    this.storage.setItem(PROFILE_KEY + expected, name);
  }
  async identity(expected) {
    const before = this.snapshot();
    if (expected && before.id !== expected) throw new Error('Your player changed. This flight belongs to the player who launched it. Save it on this device or sign back in as that player.');
    const identity = before.kind === 'ii' ? await this.auth.getIdentity() : this.guestIdentity();
    // Never transfer an in-flight ticket to a different account after an async refresh.
    if (identity.getPrincipal().toText() !== before.id || this.snapshot().id !== before.id) throw new Error('Your player changed. Please try again.');
    if (before.kind === 'guest' && !this.checkGuestStorage()) throw new Error('Browser storage is disabled. Enable it to keep your callsign, or play without ranking.');
    return identity;
  }
  signIn() {
    if (!this.auth) return Promise.reject(new Error('Internet Identity is unavailable in this browser. Guest play is available.'));
    return this.auth.signIn();
  }
  async signOut() { await this.auth?.signOut(); }
  subscribe(listener) { return this.auth?.subscribe(listener) || (() => {}); }
}
