// ═══════════════════════════════════════════════
// 寂 JI — audio engine
// transport · lookahead scheduler · mixer graph · session launcher
// Works against a live AudioContext or an OfflineAudioContext (export).
// ═══════════════════════════════════════════════

import { buildSamplePack, makeIR } from './samples.js';
import { createInstrument } from './synths.js';
import { createEffect } from './effects.js';
import { getPattern, NUM_MIXER } from './state.js';

const LOOKAHEAD = 0.12;   // seconds scheduled ahead
const TICK = 30;          // ms scheduler interval

export class Engine {
  constructor(project) {
    this.project = project;
    this.ctx = null;
    this.samples = new Map();      // id → {id, name, buffer}
    this.instruments = new Map();  // channelId → instrument
    this.strips = [];              // mixer strips (index matches project.mixer)
    this.ir = null;
    this.playing = false;
    this.mode = 'pattern';         // 'pattern' | 'song' | 'session'
    this.stepIdx = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.stepLog = [];             // {time, globalStep} for UI position
    this.session = { active: {}, queued: {} };  // col → patternId
    this.onSessionChange = null;
    this.masterAnalyser = null;
  }

  // ─── init ──────────────────────────────────
  ensureCtx() {
    if (this.ctx) { this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.ir = makeIR(this.ctx);
    for (const s of buildSamplePack(this.ctx)) this.samples.set(s.id, s);
    this.buildGraph(this.ctx);
    this.buildInstruments(this.ctx);
  }

  getSampleBuffer = id => { const s = this.samples.get(id); return s ? s.buffer : null; };

  addSample(id, name, buffer) { this.samples.set(id, { id, name, buffer, user: true }); }

  // ─── graph ─────────────────────────────────
  buildGraph(ctx, dest) {
    const destination = dest || ctx.destination;
    this.disposeStrips();
    this.strips = [];
    const mixer = this.project.mixer;
    const shared = { ir: this.ir, bpm: this.project.bpm };
    // build in order: master first (index 0), returns last
    const master = this.buildStrip(ctx, mixer[0], shared);
    master.post.connect(destination);
    this.strips[0] = master;
    const nRet = mixer.length - 1 - NUM_MIXER;
    const returns = [];
    for (let r = 0; r < nRet; r++) {
      const idx = 1 + NUM_MIXER + r;
      const st = this.buildStrip(ctx, mixer[idx], shared);
      st.post.connect(master.input);
      this.strips[idx] = st;
      returns.push(st);
    }
    for (let i = 1; i <= NUM_MIXER; i++) {
      const st = this.buildStrip(ctx, mixer[i], shared);
      st.post.connect(master.input);
      for (let r = 0; r < returns.length; r++) {
        const sg = ctx.createGain();
        sg.gain.value = mixer[i].sends[r] || 0;
        st.chainOut.connect(sg); sg.connect(returns[r].input);
        st.sendGains[r] = sg;
      }
      this.strips[i] = st;
    }
    this.masterAnalyser = master.analyser;
    this.applyMuteSolo();
  }

  buildStrip(ctx, track, shared) {
    const input = ctx.createGain();
    const chain = [];
    let node = input;
    for (const fx of track.effects) {
      if (!fx.enabled) { chain.push(null); continue; }
      const inst = createEffect(ctx, fx.type, fx.params, shared);
      if (!inst) { chain.push(null); continue; }
      node.connect(inst.input);
      node = inst.output;
      chain.push(inst);
    }
    const chainOut = ctx.createGain();
    node.connect(chainOut);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = track.pan;
    const vol = ctx.createGain(); vol.gain.value = track.volume * track.volume;
    const muteG = ctx.createGain(); muteG.gain.value = 1;
    const analyser = ctx.createAnalyser ? ctx.createAnalyser() : null;
    if (analyser) analyser.fftSize = 512;
    chainOut.connect(pan); pan.connect(vol); vol.connect(muteG);
    let post = muteG;
    if (analyser) { muteG.connect(analyser); post = analyser; }
    return { input, chain, chainOut, pan, vol, muteG, analyser, post, sendGains: [], track };
  }

  disposeStrips() {
    for (const st of this.strips) {
      if (!st) continue;
      for (const fx of st.chain) if (fx && fx.dispose) fx.dispose();
      try { st.post.disconnect(); st.input.disconnect(); } catch (e) {}
    }
  }

  buildInstruments(ctx) {
    this.instruments.clear();
    for (const ch of this.project.channels) {
      const inst = createInstrument(ctx, ch.type, ch.params, this.getSampleBuffer);
      const trackIdx = Math.min(Math.max(1, ch.mixerTrack), NUM_MIXER);
      inst.out.connect(this.strips[trackIdx].input);
      this.instruments.set(ch.id, inst);
    }
  }

  rebuildAll() {
    if (!this.ctx) return;
    for (const inst of this.instruments.values()) { try { inst.out.disconnect(); } catch (e) {} }
    this.buildGraph(this.ctx);
    this.buildInstruments(this.ctx);
    if (this.playing) this.syncFx(this.ctx.currentTime);
  }

  // ─── live param updates ────────────────────
  updateChannelParams(chId) {
    const ch = this.project.channels.find(c => c.id === chId);
    const inst = this.instruments.get(chId);
    if (ch && inst) inst.set(ch.params);
  }
  updateMixer(i) {
    const st = this.strips[i]; if (!st) return;
    const tr = this.project.mixer[i];
    st.vol.gain.value = tr.volume * tr.volume;
    if (st.pan.pan) st.pan.pan.value = tr.pan;
    for (let r = 0; r < st.sendGains.length; r++) st.sendGains[r].gain.value = tr.sends[r] || 0;
    this.applyMuteSolo();
  }
  updateFxParams(trackIdx, fxIdx) {
    const st = this.strips[trackIdx]; if (!st) return;
    const inst = st.chain[fxIdx];
    const fx = this.project.mixer[trackIdx].effects[fxIdx];
    if (inst && fx) inst.set({ ...inst.type ? {} : {}, ...fxDefaults(fx.type), ...fx.params });
  }
  applyMuteSolo() {
    const mixer = this.project.mixer;
    const anySolo = mixer.some((t, i) => i >= 1 && i <= NUM_MIXER && t.solo);
    mixer.forEach((t, i) => {
      const st = this.strips[i]; if (!st) return;
      let audible = !t.mute;
      if (anySolo && i >= 1 && i <= NUM_MIXER && !t.solo) audible = false;
      st.muteG.gain.value = audible ? 1 : 0;
    });
  }

  // channel-level mute (rack)
  channelAudible(ch) { return !ch.mute; }

  // ─── transport ─────────────────────────────
  setMode(m) {
    const was = this.playing;
    if (was) this.stop();
    this.mode = m;
    if (was) this.play();
  }

  play() {
    this.ensureCtx();
    if (this.playing) return;
    this.playing = true;
    this.stepIdx = 0;
    this.stepLog = [];
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.syncFx(this.nextStepTime);
    this.timer = setInterval(() => this.schedule(), TICK);
    this.schedule();
  }

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.stepLog = [];
    this.session.queued = {};
  }

  syncFx(t0) {
    for (const st of this.strips) {
      if (!st) continue;
      for (const fx of st.chain) if (fx && fx.sync) fx.sync(t0, this.project.bpm);
    }
  }

  stepDur() { return 60 / this.project.bpm / 4; }

  // ─── scheduler ─────────────────────────────
  schedule() {
    const ctx = this.ctx;
    const sd = this.stepDur();
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      let t = this.nextStepTime;
      // swing: push odd 16ths late
      if (this.stepIdx % 2 === 1) t += sd * (this.project.swing / 100) * 0.6;
      this.scheduleStep(this.stepIdx, t, sd);
      this.stepLog.push({ time: t, globalStep: this.stepIdx });
      if (this.stepLog.length > 128) this.stepLog.shift();
      this.stepIdx++;
      this.nextStepTime += sd;
    }
  }

  scheduleStep(globalStep, t, sd) {
    const proj = this.project;
    if (this.mode === 'pattern') {
      const pat = getPattern(proj, proj.currentPattern);
      const len = pat.bars * 16;
      this.firePatternStep(pat, ((globalStep % len) + len) % len, t, sd);
    } else if (this.mode === 'session') {
      // activate queued cells at bar boundaries
      if (globalStep % 16 === 0 && Object.keys(this.session.queued).length) {
        for (const col of Object.keys(this.session.queued)) {
          const pid = this.session.queued[col];
          if (pid === null) delete this.session.active[col];
          else this.session.active[col] = { patternId: pid, startStep: globalStep };
        }
        this.session.queued = {};
        if (this.onSessionChange) setTimeout(this.onSessionChange, (t - this.ctx.currentTime) * 1000);
      }
      for (const col of Object.keys(this.session.active)) {
        const cell = this.session.active[col];
        const pat = getPattern(proj, cell.patternId);
        if (!pat) continue;
        const len = pat.bars * 16;
        const local = ((globalStep - cell.startStep) % len + len) % len;
        if (globalStep >= cell.startStep) this.firePatternStep(pat, local, t, sd);
      }
    } else { // song
      this.applyAutomation(globalStep, t);
      const bar = globalStep / 16;
      for (const clip of proj.arrangement.clips) {
        if (bar >= clip.start && bar < clip.start + clip.length) {
          const pat = getPattern(proj, clip.patternId);
          if (!pat) continue;
          const len = pat.bars * 16;
          const local = (globalStep - clip.start * 16) % len;
          this.firePatternStep(pat, local, t, sd);
        }
      }
    }
  }

  firePatternStep(pat, localStep, t, sd) {
    for (const ch of this.project.channels) {
      if (ch.mute) continue;
      const inst = this.instruments.get(ch.id);
      if (!inst) continue;
      const steps = pat.steps[ch.id];
      if (steps && steps[localStep]) {
        inst.trigger(t, 60, steps[localStep], sd * 0.9);
      }
      const notes = pat.notes[ch.id];
      if (notes) {
        for (const n of notes) {
          if (Math.floor(n.s) === localStep) {
            const off = (n.s - localStep) * sd;
            inst.trigger(t + off, n.k, n.v, n.d * sd);
          }
        }
      }
    }
  }

  applyAutomation(globalStep, t) {
    const bar = globalStep / 16;
    for (const lane of this.project.arrangement.automation) {
      if (!lane.points.length) continue;
      const val = automationValue(lane.points, bar);
      const m = lane.target.match(/^mix\.(\d+)\.(volume|pan)$/);
      if (!m) continue;
      const st = this.strips[+m[1]];
      if (!st) continue;
      if (m[2] === 'volume') st.vol.gain.setValueAtTime(val * val, t);
      else if (st.pan.pan) st.pan.pan.setValueAtTime(val * 2 - 1, t);
    }
  }

  // ─── session launching ─────────────────────
  launchCell(col, patternId) {
    this.ensureCtx();
    if (this.mode !== 'session') { this.stop(); this.mode = 'session'; }
    this.session.queued[col] = patternId;
    if (!this.playing) {
      // start immediately: promote queue now
      for (const c of Object.keys(this.session.queued)) {
        const pid = this.session.queued[c];
        if (pid === null) delete this.session.active[c];
        else this.session.active[c] = { patternId: pid, startStep: 0 };
      }
      this.session.queued = {};
      this.play();
      if (this.onSessionChange) this.onSessionChange();
    }
  }
  stopCell(col) { if (this.session.active[col] || this.session.queued[col]) this.session.queued[col] = null; }
  stopAllCells() { this.session.active = {}; this.session.queued = {}; }

  // ─── position for UI ───────────────────────
  getPosition() {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    let cur = null;
    for (const e of this.stepLog) { if (e.time <= now) cur = e; else break; }
    if (!cur) return null;
    return cur.globalStep;
  }

  // ─── audition / preview ────────────────────
  audition(chId, midi, vel = 1, dur = 0.3) {
    this.ensureCtx();
    const inst = this.instruments.get(chId);
    if (inst) inst.trigger(this.ctx.currentTime + 0.01, midi, vel, dur);
  }
  previewSample(id) {
    this.ensureCtx();
    const b = this.getSampleBuffer(id);
    if (!b) return;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    const gn = this.ctx.createGain(); gn.gain.value = 0.7;
    src.connect(gn); gn.connect(this.strips[0].input);
    src.start();
  }

  meterLevel(i) {
    const st = this.strips[i];
    if (!st || !st.analyser) return 0;
    const data = new Float32Array(st.analyser.fftSize);
    st.analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (let k = 0; k < data.length; k++) { const a = Math.abs(data[k]); if (a > peak) peak = a; }
    return peak;
  }
}

function automationValue(points, bar) {
  const pts = points;
  if (bar <= pts[0].bar) return pts[0].val;
  if (bar >= pts[pts.length - 1].bar) return pts[pts.length - 1].val;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (bar >= a.bar && bar <= b.bar) {
      const f = (bar - a.bar) / Math.max(1e-6, b.bar - a.bar);
      return a.val + (b.val - a.val) * f;
    }
  }
  return pts[0].val;
}

function fxDefaults(type) { return {}; }

// ═══════════════════════════════════════════════
// Offline render → WAV
// ═══════════════════════════════════════════════

export async function renderToWav(project, samples, songLenBars) {
  const sr = 44100;
  const sd = 60 / project.bpm / 4;
  const bars = Math.max(1, songLenBars);
  const totalSec = bars * 16 * sd + 3; // tail
  const octx = new OfflineAudioContext(2, Math.ceil(totalSec * sr), sr);

  // clone a lightweight engine against the offline context
  const eng = Object.create(Engine.prototype);
  eng.project = project;
  eng.ctx = octx;
  eng.samples = samples;
  eng.instruments = new Map();
  eng.strips = [];
  eng.ir = makeIR(octx);
  eng.session = { active: {}, queued: {} };
  eng.mode = 'song';
  eng.getSampleBuffer = id => { const s = samples.get(id); return s ? s.buffer : null; };
  eng.buildGraph(octx, octx.destination);
  eng.buildInstruments(octx);
  eng.syncFx(0.02);

  // schedule the whole song up front
  const totalSteps = bars * 16;
  for (let s = 0; s < totalSteps; s++) {
    let t = 0.05 + s * sd;
    if (s % 2 === 1) t += sd * (project.swing / 100) * 0.6;
    eng.scheduleStep(s, t, sd);
  }

  const rendered = await octx.startRendering();
  return encodeWav(rendered);
}

export function songLengthBars(project) {
  let end = 4;
  for (const c of project.arrangement.clips) end = Math.max(end, c.start + c.length);
  return end;
}

function encodeWav(abuf) {
  const nCh = abuf.numberOfChannels, len = abuf.length, sr = abuf.sampleRate;
  const bytes = 44 + len * nCh * 2;
  const dv = new DataView(new ArrayBuffer(bytes));
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, nCh, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * nCh * 2, true); dv.setUint16(32, nCh * 2, true); dv.setUint16(34, 16, true);
  wstr(36, 'data'); dv.setUint32(40, len * nCh * 2, true);
  const chans = [];
  for (let c = 0; c < nCh; c++) chans.push(abuf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      let v = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}
