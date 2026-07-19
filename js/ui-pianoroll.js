// ═══════════════════════════════════════════════
// 寂 JI — piano roll (FL-grade: draw, move, resize, velocity, scale glow)
// ═══════════════════════════════════════════════

import { $, status } from './ui-common.js';
import { currentPattern } from './state.js';

const KEY_H = 14;
const STEP_W = 34;
const KEYS_W = 56;
const LOW = 24, HIGH = 108;   // C1..C8
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class PianoRoll {
  constructor(app) {
    this.app = app;
    this.canvas = $('#pr-canvas');
    this.ctx2d = this.canvas.getContext('2d');
    this.velCanvas = $('#pr-vel');
    this.velCtx = this.velCanvas.getContext('2d');
    this.wrap = $('#pr-wrap');
    this.chSelect = $('#pr-channel');
    this.snapSel = $('#pr-snap');
    this.scaleSel = $('#pr-scale');
    this.rootSel = $('#pr-root');
    this.drag = null;
    this.bindEvents();
  }

  channelId() { return this.chSelect.value || this.app.selectedChannel; }
  notes() {
    const pat = currentPattern(this.app.project);
    const id = this.channelId();
    if (!id) return [];
    if (!pat.notes[id]) pat.notes[id] = [];
    return pat.notes[id];
  }
  snap() { return parseFloat(this.snapSel.value); }
  totalSteps() { return currentPattern(this.app.project).bars * 16; }

  refreshChannels() {
    const cur = this.chSelect.value;
    this.chSelect.innerHTML = '';
    for (const ch of this.app.project.channels) {
      const o = document.createElement('option');
      o.value = ch.id; o.textContent = ch.name;
      this.chSelect.appendChild(o);
    }
    if (cur && this.app.project.channels.some(c => c.id === cur)) this.chSelect.value = cur;
    else if (this.app.selectedChannel) this.chSelect.value = this.app.selectedChannel;
  }

  scaleSet() {
    const v = this.scaleSel.value;
    if (!v) return null;
    const root = this.rootSel.selectedIndex;
    return new Set(v.split(',').map(n => (parseInt(n) + root) % 12));
  }

  resize() {
    const steps = this.totalSteps();
    this.canvas.width = KEYS_W + steps * STEP_W;
    this.canvas.height = (HIGH - LOW) * KEY_H;
    this.velCanvas.width = this.canvas.width;
    this.velCanvas.height = 80;
  }

  keyToY(k) { return (HIGH - 1 - k) * KEY_H; }
  yToKey(y) { return HIGH - 1 - Math.floor(y / KEY_H); }
  stepToX(s) { return KEYS_W + s * STEP_W; }
  xToStep(x) { return (x - KEYS_W) / STEP_W; }

  render() {
    this.resize();
    const c = this.ctx2d;
    const W = this.canvas.width, H = this.canvas.height;
    const steps = this.totalSteps();
    const scale = this.scaleSet();
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();

    c.fillStyle = col('--bg0'); c.fillRect(0, 0, W, H);

    // rows
    for (let k = LOW; k < HIGH; k++) {
      const y = this.keyToY(k);
      const pc = k % 12;
      const black = [1, 3, 6, 8, 10].includes(pc);
      c.fillStyle = black ? '#101113' : '#141518';
      if (scale && scale.has(pc)) c.fillStyle = black ? '#15171a' : '#191b20';
      c.fillRect(KEYS_W, y, W - KEYS_W, KEY_H);
      if (pc === 0) { c.fillStyle = '#1d2024'; c.fillRect(KEYS_W, y + KEY_H - 1, W - KEYS_W, 1); }
    }
    // grid lines
    for (let s = 0; s <= steps; s++) {
      const x = this.stepToX(s);
      c.fillStyle = s % 16 === 0 ? col('--ink2') : s % 4 === 0 ? '#26292d' : '#1a1c1f';
      c.fillRect(x, 0, 1, H);
    }
    // keys column
    c.fillStyle = col('--bg1'); c.fillRect(0, 0, KEYS_W, H);
    for (let k = LOW; k < HIGH; k++) {
      const y = this.keyToY(k), pc = k % 12;
      const black = [1, 3, 6, 8, 10].includes(pc);
      c.fillStyle = black ? '#191b1e' : '#22252a';
      c.fillRect(0, y + 1, KEYS_W - 6, KEY_H - 2);
      if (pc === 0) {
        c.fillStyle = col('--ink2'); c.font = '9px monospace';
        c.fillText('C' + (Math.floor(k / 12) - 1), 4, y + KEY_H - 3);
      }
    }

    // notes
    const chColor = this.app.project.channels.find(ch => ch.id === this.channelId())?.color || col('--accent');
    for (const n of this.notes()) {
      const x = this.stepToX(n.s), y = this.keyToY(n.k);
      const w = n.d * STEP_W;
      c.globalAlpha = 0.35 + n.v * 0.65;
      c.fillStyle = chColor;
      c.fillRect(x + 1, y + 1.5, w - 2, KEY_H - 3);
      c.globalAlpha = 1;
      c.fillStyle = col('--bg0');
      c.fillRect(x + w - 4, y + 3, 2, KEY_H - 6); // resize grip
    }

    // playhead
    const g = this.app.engine.getPosition();
    if (g !== null) {
      const local = g % steps;
      c.fillStyle = col('--ink0'); c.globalAlpha = 0.35;
      c.fillRect(this.stepToX(local), 0, 2, H); c.globalAlpha = 1;
    }

    this.renderVel(chColor);
  }

  renderVel(chColor) {
    const c = this.velCtx;
    const W = this.velCanvas.width, H = 80;
    c.fillStyle = '#121315'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#26292d'; c.fillRect(KEYS_W, 0, 1, H);
    for (const n of this.notes()) {
      const x = this.stepToX(n.s);
      c.fillStyle = chColor;
      c.globalAlpha = 0.8;
      c.fillRect(x + 1, H - n.v * (H - 8) - 4, 5, n.v * (H - 8));
      c.globalAlpha = 1;
    }
  }

  hitNote(x, y) {
    const k = this.yToKey(y), s = this.xToStep(x);
    const notes = this.notes();
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.k === k && s >= n.s && s <= n.s + n.d) {
        const nearEdge = s > n.s + n.d - 0.35;
        return { note: n, idx: i, edge: nearEdge };
      }
    }
    return null;
  }

  bindEvents() {
    const pos = e => {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    this.canvas.addEventListener('pointerdown', e => {
      const [x, y] = pos(e);
      if (x < KEYS_W) { // key preview
        this.app.engine.audition(this.channelId(), this.yToKey(y), 1, 0.4);
        return;
      }
      const hit = this.hitNote(x, y);
      if (e.button === 2) {
        if (hit) { this.notes().splice(hit.idx, 1); this.app.markDirty(); this.render(); }
        return;
      }
      this.canvas.setPointerCapture(e.pointerId);
      if (hit && hit.edge) {
        this.drag = { kind: 'resize', note: hit.note, x0: x };
      } else if (hit) {
        this.drag = { kind: 'move', note: hit.note, x0: x, y0: y, s0: hit.note.s, k0: hit.note.k, moved: false };
      } else {
        const snap = this.snap();
        const s = Math.floor(this.xToStep(x) / snap) * snap;
        const k = this.yToKey(y);
        if (s < 0 || s >= this.totalSteps()) return;
        const n = { k, s, d: this.lastDur || snap, v: 0.9 };
        this.notes().push(n);
        this.app.engine.audition(this.channelId(), k, 0.9, 0.25);
        this.drag = { kind: 'resize', note: n, x0: x, fresh: true };
        this.app.markDirty();
        this.render();
      }
    });

    this.canvas.addEventListener('pointermove', e => {
      const [x, y] = pos(e);
      if (!this.drag) {
        const hit = this.hitNote(x, y);
        this.canvas.style.cursor = hit ? (hit.edge ? 'ew-resize' : 'move') : 'crosshair';
        return;
      }
      const d = this.drag, snap = this.snap();
      if (d.kind === 'resize') {
        const end = Math.max(d.note.s + snap, Math.ceil(this.xToStep(x) / snap) * snap);
        d.note.d = Math.min(this.totalSteps() - d.note.s, end - d.note.s);
        this.lastDur = d.note.d;
      } else if (d.kind === 'move') {
        const ds = Math.round((this.xToStep(x) - this.xToStep(d.x0)) / snap) * snap;
        const dk = this.yToKey(y) - this.yToKey(d.y0);
        const ns = Math.min(this.totalSteps() - d.note.d, Math.max(0, d.s0 + ds));
        const nk = Math.min(HIGH - 1, Math.max(LOW, d.k0 + dk));
        if (ns !== d.note.s || nk !== d.note.k) d.moved = true;
        if (nk !== d.note.k) this.app.engine.audition(this.channelId(), nk, d.note.v, 0.15);
        d.note.s = ns; d.note.k = nk;
      }
      this.app.markDirty();
      this.render();
    });

    this.canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // velocity lane
    const velEdit = e => {
      const r = this.velCanvas.getBoundingClientRect();
      const x = e.clientX - r.left + this.wrap.scrollLeft * 0;
      const y = e.clientY - r.top;
      const s = this.xToStep(x + 0); // canvases share width; vel canvas not scrolled — align by same coords
      let best = null, bd = 1e9;
      for (const n of this.notes()) {
        const dd = Math.abs(n.s - s);
        if (dd < bd && dd < 1) { bd = dd; best = n; }
      }
      if (best) {
        best.v = Math.min(1, Math.max(0.05, 1 - (y - 4) / 72));
        this.app.markDirty();
        this.render();
      }
    };
    this.velCanvas.addEventListener('pointerdown', e => { this.velCanvas.setPointerCapture(e.pointerId); velEdit(e); this._velDrag = true; });
    this.velCanvas.addEventListener('pointermove', e => { if (this._velDrag) velEdit(e); });
    this.velCanvas.addEventListener('pointerup', () => { this._velDrag = false; });

    // keep velocity lane horizontally synced with the roll
    this.wrap.addEventListener('scroll', () => {
      this.velCanvas.style.transform = `translateX(${-this.wrap.scrollLeft}px)`;
    });

    for (const sel of [this.snapSel, this.scaleSel, this.rootSel, this.chSelect]) {
      sel.addEventListener('change', () => this.render());
    }
  }
}
