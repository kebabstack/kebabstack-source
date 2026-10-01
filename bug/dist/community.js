import { compareFlight } from './result-board.js';
import { scoreOf } from './scoring.js';
import { connect, playerSession } from './client-api.js';
import { RULESET, RULESET_3D } from './ruleset.js';
import { validName } from './player-session.js';
const $ = id => document.getElementById(id);
const number = value => Number(value).toLocaleString('en-US');
const unwrap = r => { if ('err' in r) throw new Error(r.err); return r.ok; };
export class Community {
  constructor(ui) {
    Object.assign(this, ui); this.mode=ui.mode==='2d'?'2d':'3d'; this.boardMode=this.mode; this.connection = null; this.pilot = null; this.isLocal = false; this.session = ui.session || playerSession; this.profileLoadId = 0; this.authBusy = false; this.tab = 'global'; this.loadId = 0; this.resultLoadId = 0; this.resultRun = null; this.resultRows = null;
    $('profileBtn').addEventListener('click', () => this.openProfile());
    $('nameSaveBtn').addEventListener('click', () => this.saveName());
    $('playerName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void this.saveName(); } });
    $('iiLoginBtn').addEventListener('click', () => this.signIn());
    this.session.subscribe(() => { if (!this.authBusy) void this.boot(); });
    $('logoutBtn').addEventListener('click', () => this.signOut());
    $('scoresBtn').addEventListener('click', () => { this.showModal('scoresDialog'); void this.global(false,this.mode); });
    $('globalTab').addEventListener('click', () => this.global());
    $('archiveTab').addEventListener('click', () => this.global(true,'3d'));
    $('board3dBtn').addEventListener('click',()=>this.global(false,'3d'));
    $('board2dBtn').addEventListener('click',()=>this.global(false,'2d'));
    $('publishBtn').addEventListener('click', () => this.publish());
    $('resultName').addEventListener('input', () => { this.getRun().resultNameEdited = true; this.renderResult(); });
    $('resultName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void this.publish(); } });
    $('resultBoardRetry').addEventListener('click', () => this.loadResult(this.getRun()));
    $('removeScoresBtn').addEventListener('click', () => this.remove());
  }
  async api(expected) {
    if (!this.connection) this.connection = connect().then(c => { this.transport = c; this.isLocal = c.local; return c; }).catch(e => { this.connection = null; throw e; });
    return (await this.connection).actor(expected);
  }
  async boot() {
    // Old Hub launch URLs are scrubbed, never redeemed by the standalone game.
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has('uht')) { params.delete('uht'); history.replaceState(null, '', location.pathname + location.search + (params.size ? '#' + params : '')); }
    const id = ++this.profileLoadId, player = this.session.snapshot();
    this.pilot = { ...player, publicName: '' }; this.renderProfile();
    try {
      const profile = unwrap(await (await this.api(player.id)).arcadeProfile());
      if (id !== this.profileLoadId || this.session.snapshot().id !== player.id) return;
      this.pilot = { ...player, name: player.name || profile.name, publicName: profile.name };
      this.renderProfile();
      if (this.getRun().phase === 'ready') this.begin(this.getRun());
    } catch (e) {
      if (id === this.profileLoadId) $('profileStatus').textContent = e.message;
    }
  }
  canChangePlayer() {
    const r = this.getRun();
    // A completed flight may restore its original player after expiry or an
    // account change in another tab. Publication still checks its pinned owner.
    return !r.publishing && (r.phase === 'ready' || (r.phase === 'done' && r.playerId && this.session.snapshot().id !== r.playerId));
  }
  renderProfile() {
    const signedIn = this.pilot?.kind === 'ii';
    $('playerChip').textContent = this.pilot?.name || (signedIn ? 'INTERNET IDENTITY' : 'PLAY AS GUEST');
    // Preserve a callsign being edited when a background profile request finishes.
    if (document.activeElement !== $('playerName')) $('playerName').value = this.pilot?.name || '';
    $('logoutBtn').hidden = !signedIn;
    $('iiLoginBtn').hidden = signedIn;
    const locked = this.authBusy || !this.canChangePlayer();
    $('iiLoginBtn').disabled = locked; $('logoutBtn').disabled = locked;
    $('profileDescription').textContent = signedIn
      ? 'Signed in with Internet Identity. Your published callsign and best scores follow this identity on this website. A local profile is optional.'
      : 'Play immediately as a guest. Choose an optional name for this browser, or use Internet Identity to keep published scores across devices.';
    $('profileSwitchNote').textContent = locked && !this.authBusy ? 'Finish this flight and choose Play again before changing player.' : '';
    if (this.resultRun === this.getRun()) {
      if (!this.resultRun.resultNameEdited) $('resultName').value = this.pilot?.name || '';
      this.renderResult();
    }
  }
  openProfile(message = '') { this.renderProfile(); $('profileStatus').textContent = message; this.showModal('profileDialog'); }
  async saveName() {
    const name = $('playerName').value.trim();
    if (!validName(name)) { $('profileStatus').textContent = 'Use 3–20 letters, numbers, spaces, dots, hyphens or underscores.'; return; }
    try {
      const player = this.session.snapshot();
      this.session.saveName(name, player.id); this.profileLoadId++;
      this.pilot = { ...this.pilot, ...player, name }; this.renderProfile();
      $('profileStatus').textContent = 'Name saved on this device. Availability is checked when you publish a score.';
    } catch (e) { $('profileStatus').textContent = e.message; }
  }
  async signIn() {
    if (this.authBusy || !this.canChangePlayer()) return;
    this.authBusy = true; this.renderProfile(); $('profileStatus').textContent = 'Opening Internet Identity…';
    try {
      // Called directly from the click so popup blockers retain the user gesture.
      await this.session.signIn(); await this.boot();
      $('profileStatus').textContent = 'Signed in. Choose a callsign whenever you are ready.';
    } catch { $('profileStatus').textContent = 'Sign-in did not complete. Your guest profile is still available. You can try signing in again.'; }
    finally { this.authBusy = false; this.renderProfile(); }
  }
  async signOut() {
    if (this.authBusy || !this.canChangePlayer()) return;
    this.authBusy = true; this.renderProfile();
    try { await this.session.signOut(); await this.boot(); $('profileStatus').textContent = 'Signed out. Your original browser guest profile is ready.'; }
    catch (e) { $('profileStatus').textContent = e.message; }
    finally { this.authBusy = false; this.renderProfile(); }
  }
  reset() {
    this.resultRun = null; this.resultRows = null; this.resultLoadId++;
    $('publishBtn').disabled = false; $('publishBtn').textContent = `PUBLISH ${this.mode.toUpperCase()} SCORE`;
    $('resultName').disabled = false; $('againBtn').disabled = false; $('againBtn').textContent = 'PLAY AGAIN · KEEP PRIVATE';
  }
  begin(run) {
    const current = this.session.snapshot();
    if (run.ranking && !run.rankingError && run.playerId === current.id && Date.now() - run.rankingAt < 3_600_000) return;
    run.rankingAt = Date.now();
    const player = this.session.snapshot(); run.playerId = player.id; run.playerKind = player.kind;
    run.ranking = this.api(player.id).then(a => this.mode==='2d'?a.arcadeBeginMode({twoD:null}):a.arcadeBegin()).then(unwrap).then(ticket => {
      // Routes use a per-flight random seed; an old rooftop tab must not fail at UTC midnight.
      run.rankingError = null;
      return ticket;
    }).catch(e => { run.rankingError = e.message; return null; });
  }
  finish() {
    const r = this.getRun(); this.resultRun = r; this.resultRows = null;
    $('saveNote').dataset.state='';
    $('resultName').value = this.pilot?.name || ''; $('resultName').disabled = Boolean(r.practice);
    $('publishBtn').disabled = Boolean(r.practice); $('publishBtn').textContent = `PUBLISH ${this.mode.toUpperCase()} SCORE`;
    $('againBtn').textContent = 'PLAY AGAIN · KEEP PRIVATE';
    $('saveNote').textContent = r.practice ? 'Practice flight: compare freely; publishing is disabled.' : 'Your flight stays private until you choose Publish score.';
    this.renderResult();
    return this.loadResult(r);
  }
  async loadResult(r) {
    const id = ++this.resultLoadId;
    $('resultBoardStatus').textContent = 'Loading the leaderboard…'; $('resultBoardRetry').hidden = true;
    try {
      const rows = await this.readBoard(await this.api(),this.mode);
      if (this.getRun() !== r || this.resultRun !== r || id !== this.resultLoadId) return;
      this.resultRows = rows; this.renderResult();
      $('resultBoardStatus').textContent = `${this.isLocal?'Local test board · ':''}${this.mode.toUpperCase()} · Season ${this.mode==='2d'?1:2} · best score per pilot · top 100`;
    } catch (e) {
      if (this.getRun() !== r || this.resultRun !== r || id !== this.resultLoadId) return;
      $('resultBoardStatus').textContent = 'Leaderboard unavailable. You can still choose what to do with your flight.';
      $('resultBoardRetry').hidden = false;
    }
  }
  renderResult() {
    const r = this.getRun(); if (r !== this.resultRun) return;
    const flight = { name: $('resultName').value.trim() || this.pilot?.name || 'Your flight', score: scoreOf(r), meters: Math.floor(r.d), coins: r.coins };
    let rows=this.resultRows;
    if(r.publication) {
      rows=[...(rows||[])].filter(row=>row.name.toLowerCase()!==r.publication.best.name.toLowerCase());
      rows.push(r.publication.best); rows.sort((a,b)=>Number(b.score)-Number(a.score)||Number(a.at||0)-Number(b.at||0));
    }
    const model = rows === null ? null : compareFlight(rows, flight, this.pilot?.publicName || '', Boolean(r.published));
    $('resultRank').textContent = this.resultRows===null ? '—' : model?.rank || '—';
    if (model?.rank?.startsWith('#') && Number(model.rank.slice(1))>100) $('resultRank').textContent='100+';
    $('resultRankLabel').textContent = model?.retained ? 'YOUR PUBLISHED BEST' : r.published ? 'PUBLISHED' : 'PRIVATE PREVIEW';
    $('resultBoardNote').textContent = this.resultRows===null && r.publication ? 'Your best score is confirmed. Refresh the board to see your ranking.' : model ? model.note + (model.condensed ? ' Showing leaders and nearby scores.' : '') : r.published ? 'Score submitted. Refreshing the board…' : 'Your result is private. A ranking appears when the board connects.';
    const list = $('resultScoreList'); list.replaceChildren();
    const entries = model?.entries || [{ ...flight, rank: '—', preview: true, submitted: r.published }];
    for (const row of entries) {
      if (row.gapBefore) { const gap = document.createElement('div'); gap.className = 'result-board-gap'; gap.textContent = '···'; gap.setAttribute('aria-label', 'Other ranked pilots'); list.append(gap); }
      const item = document.createElement('div'); item.className = 'score-row' + (row.preview ? ' this-flight' : row.own ? ' own-best' : '');
      const rank = document.createElement('span'); rank.textContent = typeof row.rank === 'number' ? String(row.rank).padStart(2,'0') : row.rank;
      const name = document.createElement('div'); name.textContent = row.name;
      const detail = document.createElement('small');
      detail.textContent = (row.preview ? (row.submitted ? 'THIS FLIGHT · SUBMITTED · ' : 'YOU · PRIVATE FLIGHT · ') : row.own ? 'YOUR PUBLISHED BEST · ' : '') + `${number(row.meters)} m + ${number(row.coins)} coins`;
      name.append(detail);
      const score = document.createElement('strong'); score.textContent = number(row.score); item.append(rank, name, score); list.append(item);
    }
  }
  async publish() {
    const r = this.getRun();
    if (r.phase !== 'done' || r.practice || r.published || $('publishBtn').disabled) return;
    const name = $('resultName').value.trim();
    if (!/^[a-zA-Z0-9 ._-]{3,20}$/.test(name)) {
      $('saveNote').textContent = 'Choose a callsign: 3–20 letters, numbers, spaces, dots, hyphens or underscores.';
      $('resultName').focus(); return;
    }
    r.publishing = true; $('againBtn').disabled = true; $('publishBtn').disabled = true; $('resultName').disabled = true;
    $('saveNote').dataset.state='pending'; $('saveNote').textContent = `Saving to the ${this.mode.toUpperCase()} leaderboard…`; $('publishBtn').textContent='SAVING…';
    try {
      const ticket = await r.ranking;
      if (this.getRun() !== r) return;
      if (!ticket) { const error = new Error(r.rankingError || 'This flight did not connect to flight control. Save it on this device and try another run.'); error.terminal = true; throw error; }
      const api = await this.api(r.playerId); if (this.getRun() !== r) return;
      if (this.pilot?.publicName !== name) {
        const oldName = this.pilot?.publicName;
        const saved = unwrap(await api.arcadeSetName(name));
        await this.session.identity(r.playerId);
        this.pilot = { ...this.session.snapshot(), name: saved.name, publicName: saved.name };
        try { this.session.saveName(saved.name, r.playerId); } catch {}
        this.renderProfile();
        if (this.getRun() !== r) return;
        // A rename changes the same pilot's historical board label too.
        this.resultRows = this.resultRows?.map(row => oldName && row.name.toLowerCase() === oldName.toLowerCase() ? { ...row, name: this.pilot.name } : row) ?? null;
      }
      const coins = r.coinIds.map(id => { const [,chunk,index] = id.split(':'); return BigInt(Number(chunk) * 21 + Number(index)); });
      r.publishAttempted = true;
      const submission=r.submission ||= {runId:ticket.id,meters:BigInt(Math.floor(r.d)),coins,durationMs:BigInt(Math.round(r.elapsed*1000)),version:this.mode==='3d'?RULESET_3D:RULESET};
      await this.session.identity(r.playerId);
      const receipt=unwrap(await api.arcadePublish(this.mode==='2d'?{twoD:null}:{threeD:null},submission));
      const row=receipt.flight; r.publication=receipt;
      r.published = true; if (this.getRun() !== r) return;
      $('publishBtn').textContent = receipt.improved ? `${this.mode.toUpperCase()} BEST SAVED ✓` : 'BEST SCORE RETAINED ✓'; $('againBtn').textContent = 'PLAY AGAIN';
      $('saveNote').dataset.state='success';
      $('saveNote').textContent = receipt.improved
        ? `New ${this.mode.toUpperCase()} best: ${number(receipt.best.score)} points saved as ${row.name}. Find it on the ${this.mode.toUpperCase()} board.`
        : `Flight submitted: ${number(row.score)} points. Your ${this.mode.toUpperCase()} best of ${number(receipt.best.score)} stays on the board. Only your best flight is listed.`;
      // Keep confirmation visible even if the subsequent board refresh is offline.
      this.renderResult(); await this.loadResult(r);
    } catch (e) {
      if (this.getRun() === r) {
        const terminal = e.terminal || /old game version|incompatible game rules|Flight expired|flight was replaced|flight is missing|outside the arcade limits|exceeds the flight speed|Duplicate coin|beyond the flight|Too many coins/i.test(e.message);
        r.publicationBlocked = Boolean(terminal);
        $('saveNote').dataset.state='error';
        $('saveNote').textContent = e.message + (terminal ? ' This result can still be saved on this device.' : r.publishAttempted ? ' Your result is still here. You can retry this submission.' : '');
        $('saveNote').scrollIntoView?.({block:'nearest'});
        $('publishBtn').textContent=terminal ? 'PUBLICATION UNAVAILABLE' : 'RETRY PUBLICATION';
        $('publishBtn').disabled = Boolean(terminal); $('resultName').disabled = false;
        if (r.publishAttempted) $('againBtn').textContent = 'PLAY AGAIN';
      }
    } finally {
      r.publishing = false; if (this.getRun() === r) $('againBtn').disabled = false;
    }
  }
  readBoard(api,mode) { return mode==='2d'?api.arcadeLeaderboardMode({twoD:null}):api.arcadeLeaderboard(); }
  boardLabels() {
    $('board3dBtn').setAttribute('aria-pressed',String(this.boardMode==='3d'));$('board2dBtn').setAttribute('aria-pressed',String(this.boardMode==='2d'));
    $('archiveTab').hidden=this.boardMode==='2d';$('globalTab').textContent=this.boardMode==='2d'?'2D · Season 1':'3D · Season 2';
    $('removeScoresBtn').textContent=`Remove my published ${this.boardMode.toUpperCase()} scores`;
  }
  local() { this.boardMode=this.mode;this.boardLabels(); this.tab = 'local'; this.loadId++; $('globalTab').setAttribute('aria-pressed', 'false'); $('archiveTab').setAttribute('aria-pressed', 'false'); $('localTab').setAttribute('aria-pressed', 'true'); $('removeScoresBtn').hidden = true; }
  async global(archive = false, mode=this.boardMode) {
    this.boardMode=archive?'3d':mode==='2d'?'2d':'3d';this.boardLabels();const selectedMode=this.boardMode;
    this.tab = archive ? 'archive' : 'global'; const id = ++this.loadId;
    $('globalTab').setAttribute('aria-pressed', String(!archive)); $('archiveTab').setAttribute('aria-pressed', String(archive)); $('localTab').setAttribute('aria-pressed', 'false'); $('removeScoresBtn').hidden = false;
    $('boardStatus').textContent = 'Connecting to the global flight crew…'; $('scoreList').replaceChildren();
    try {
      const api = await this.api(); const rows = await (archive ? api.arcadeArchive() : this.readBoard(api,selectedMode)); if (id !== this.loadId) return;
      const own=rows.find(row=>this.pilot?.publicName && row.name.toLowerCase()===this.pilot.publicName.toLowerCase());
      $('boardStatus').textContent = this.isLocal ? 'Local canister test board. Deploy this app to open the same board worldwide.' : archive ? 'Early flights · original 3D rules · preserved archive' : `${selectedMode==='2d'?'2D · Season 1':'3D · Season 2'} · best score per pilot. ${own ? 'Your best: '+number(own.score)+' points.' : 'Scores in the other mode are on its own board.'}`;
      if (!rows.length) { const p = document.createElement('p'); p.className = 'score-empty'; p.textContent = archive ? 'No early public flights were recorded.' : `Be the first to ship a ${selectedMode.toUpperCase()} score.`; $('scoreList').append(p); }
      rows.forEach((r,i) => {
        const row = document.createElement('div'); row.className = 'score-row' + (r===own?' own-best':'');
        const rank = document.createElement('span'); rank.textContent = String(i + 1).padStart(2,'0');
        const name = document.createElement('div'); name.textContent = r.name + (r===own?' · YOU':'');
        const detail = document.createElement('small'); detail.textContent = `${number(r.meters)} m + ${number(r.coins)} coins × 50`; name.append(detail);
        const score = document.createElement('strong'); score.textContent = number(r.score); row.append(rank,name,score); $('scoreList').append(row);
      });
    } catch (e) { if (id === this.loadId) $('boardStatus').textContent = e.message; }
  }
  async remove() {
    $('removeScoresBtn').disabled = true;
    try { const mode=this.boardMode,api=await this.api();unwrap(await (mode==='2d'?api.arcadeRemoveMode({twoD:null}):api.arcadeRemove()));await this.global(false,mode);$('boardStatus').textContent=`Your published ${mode.toUpperCase()} scores have been removed. Your other mode’s scores are unchanged.`; }
    catch (e) { $('boardStatus').textContent = e.message; }
    finally { $('removeScoresBtn').disabled = false; }
  }
}
