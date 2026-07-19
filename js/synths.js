// ═══════════════════════════════════════════════
// 寂 JI — instruments
// SUB (subtractive poly) · FM (4-op-lite) · SMP (sampler) · 808 (bass) · DRM (drum kit)
// Every instrument: new Instr(ctx, params) → .out (GainNode), .trigger(time, midi, vel, durSec), .set(params)
// ═══════════════════════════════════════════════

export const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

// ─── Subtractive poly ────────────────────────
export class SubSynth {
  static type = 'sub';
  static label = 'SUB · subtractive';
  static defaults = {
    wave: 'sawtooth', wave2: 'square', osc2semi: 0, osc2mix: 0.0, detune: 8, unison: 2,
    cutoff: 4000, res: 1.2, envAmt: 2200,
    attack: 0.005, decay: 0.25, sustain: 0.6, release: 0.25,
    fAttack: 0.004, fDecay: 0.22, glide: 0, gain: 0.5,
  };
  constructor(ctx, params) {
    this.ctx = ctx;
    this.p = { ...SubSynth.defaults, ...params };
    this.out = ctx.createGain();
    this.out.gain.value = this.p.gain;
  }
  set(params) { Object.assign(this.p, params); this.out.gain.value = this.p.gain; }
  trigger(t, midi, vel = 1, dur = 0.25) {
    const { ctx, p } = this;
    const f = midiHz(midi);
    const vg = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = p.res;
    // filter envelope
    filt.frequency.setValueAtTime(Math.min(20000, p.cutoff), t);
    filt.frequency.linearRampToValueAtTime(Math.min(20000, p.cutoff + p.envAmt * vel), t + p.fAttack);
    filt.frequency.setTargetAtTime(p.cutoff, t + p.fAttack, p.fDecay);
    // amp envelope
    const peak = 0.32 * vel;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(peak, t + p.attack);
    vg.gain.setTargetAtTime(peak * p.sustain, t + p.attack, p.decay);
    const offT = t + Math.max(dur, p.attack + 0.01);
    vg.gain.setTargetAtTime(0, offT, Math.max(0.01, p.release / 3));
    const stopT = offT + p.release + 0.3;

    const oscs = [];
    const uni = Math.max(1, Math.round(p.unison));
    for (let u = 0; u < uni; u++) {
      const o = ctx.createOscillator();
      o.type = p.wave;
      o.frequency.value = f;
      o.detune.value = uni > 1 ? (u / (uni - 1) - 0.5) * 2 * p.detune : 0;
      o.connect(filt); o.start(t); o.stop(stopT); oscs.push(o);
    }
    if (p.osc2mix > 0) {
      const o2 = ctx.createOscillator();
      o2.type = p.wave2;
      o2.frequency.value = midiHz(midi + p.osc2semi);
      const g2 = ctx.createGain(); g2.gain.value = p.osc2mix;
      o2.connect(g2); g2.connect(filt);
      o2.start(t); o2.stop(stopT); oscs.push(o2);
    }
    filt.connect(vg); vg.connect(this.out);
    oscs[0].onended = () => { vg.disconnect(); filt.disconnect(); };
  }
}

// ─── FM synth (2-pair, 4-op-lite) ────────────
export class FMSynth {
  static type = 'fm';
  static label = 'FM · operator';
  static defaults = {
    ratio1: 2, index1: 220, ratio2: 7.01, index2: 60,
    attack: 0.004, decay: 0.4, sustain: 0.3, release: 0.3,
    modDecay: 0.18, brightness: 8000, gain: 0.5,
  };
  constructor(ctx, params) {
    this.ctx = ctx;
    this.p = { ...FMSynth.defaults, ...params };
    this.out = ctx.createGain();
    this.out.gain.value = this.p.gain;
  }
  set(params) { Object.assign(this.p, params); this.out.gain.value = this.p.gain; }
  trigger(t, midi, vel = 1, dur = 0.25) {
    const { ctx, p } = this;
    const f = midiHz(midi);
    const car = ctx.createOscillator(); car.frequency.value = f;
    const vg = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.brightness;

    const mkMod = (ratio, index) => {
      const m = ctx.createOscillator(); m.frequency.value = f * ratio;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(index * vel, t);
      mg.gain.setTargetAtTime(index * vel * 0.15, t, p.modDecay);
      m.connect(mg); mg.connect(car.frequency);
      return m;
    };
    const m1 = mkMod(p.ratio1, p.index1);
    const m2 = mkMod(p.ratio2, p.index2);

    const peak = 0.3 * vel;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(peak, t + p.attack);
    vg.gain.setTargetAtTime(peak * p.sustain, t + p.attack, p.decay);
    const offT = t + Math.max(dur, p.attack + 0.01);
    vg.gain.setTargetAtTime(0, offT, Math.max(0.01, p.release / 3));
    const stopT = offT + p.release + 0.3;

    car.connect(lp); lp.connect(vg); vg.connect(this.out);
    [car, m1, m2].forEach(o => { o.start(t); o.stop(stopT); });
    car.onended = () => { vg.disconnect(); lp.disconnect(); };
  }
}

// ─── 808 bass ────────────────────────────────
export class Bass808 {
  static type = 'b808';
  static label = '808 · bass';
  static defaults = {
    decay: 0.9, punch: 60, drive: 2.5, tone: 900,
    glide: 0.06, sub: 0.4, gain: 0.6,
  };
  constructor(ctx, params) {
    this.ctx = ctx;
    this.p = { ...Bass808.defaults, ...params };
    this.out = ctx.createGain();
    this.out.gain.value = this.p.gain;
    this.lastFreq = null;
  }
  set(params) { Object.assign(this.p, params); this.out.gain.value = this.p.gain; }
  trigger(t, midi, vel = 1, dur = 0.5) {
    const { ctx, p } = this;
    const f = midiHz(midi);
    const o = ctx.createOscillator(); o.type = 'sine';
    // pitch punch + optional glide from previous note
    const startF = this.lastFreq && p.glide > 0 ? this.lastFreq : f + p.punch;
    o.frequency.setValueAtTime(startF, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f), t + (this.lastFreq && p.glide > 0 ? p.glide : 0.03));
    this.lastFreq = f;

    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2;
    const subG = ctx.createGain(); subG.gain.value = p.sub;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; curve[i] = Math.tanh(x * p.drive); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.tone;

    const vg = ctx.createGain();
    const hold = Math.max(dur, 0.05);
    const peak = 0.55 * vel;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(peak, t + 0.004);
    vg.gain.setTargetAtTime(0, t + hold, p.decay / 4);
    const stopT = t + hold + p.decay + 0.3;

    o.connect(shaper); sub.connect(subG); subG.connect(shaper);
    shaper.connect(lp); lp.connect(vg); vg.connect(this.out);
    [o, sub].forEach(x => { x.start(t); x.stop(stopT); });
    o.onended = () => { vg.disconnect(); lp.disconnect(); shaper.disconnect(); };
  }
}

// ─── Sampler (pitched one-shot) ──────────────
export class Sampler {
  static type = 'smp';
  static label = 'SMP · sampler';
  static defaults = {
    sampleId: 'pluck', rootMidi: 57, attack: 0.002, release: 0.08,
    start: 0, cutoff: 20000, gain: 0.6, loop: false,
  };
  constructor(ctx, params, getSample) {
    this.ctx = ctx;
    this.getSample = getSample;
    this.p = { ...Sampler.defaults, ...params };
    this.out = ctx.createGain();
    this.out.gain.value = this.p.gain;
  }
  set(params) { Object.assign(this.p, params); this.out.gain.value = this.p.gain; }
  trigger(t, midi, vel = 1, dur = 0.25) {
    const { ctx, p } = this;
    const buffer = this.getSample(p.sampleId);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (midi - p.rootMidi) / 12);
    src.loop = p.loop;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.cutoff;
    const vg = ctx.createGain();
    const peak = 0.8 * vel;
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(peak, t + p.attack);
    const end = p.loop ? t + Math.max(dur, 0.05) : t + Math.max(dur, buffer.duration);
    vg.gain.setTargetAtTime(0, end, Math.max(0.005, p.release / 3));
    src.connect(lp); lp.connect(vg); vg.connect(this.out);
    src.start(t, p.start * buffer.duration);
    src.stop(end + p.release + 0.2);
    src.onended = () => { vg.disconnect(); lp.disconnect(); };
  }
}

// ─── Drum channel (one sample per channel) ───
export class DrumChannel {
  static type = 'drum';
  static label = 'DRM · drum';
  static defaults = { sampleId: 'kick', pitch: 0, decay: 1, gain: 0.7 };
  constructor(ctx, params, getSample) {
    this.ctx = ctx;
    this.getSample = getSample;
    this.p = { ...DrumChannel.defaults, ...params };
    this.out = ctx.createGain();
    this.out.gain.value = this.p.gain;
  }
  set(params) { Object.assign(this.p, params); this.out.gain.value = this.p.gain; }
  trigger(t, midi, vel = 1) {
    const { ctx, p } = this;
    const buffer = this.getSample(p.sampleId);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, p.pitch / 12);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.9 * vel, t);
    if (p.decay < 1) {
      vg.gain.setTargetAtTime(0, t + buffer.duration * p.decay * 0.5, buffer.duration * p.decay * 0.2 + 0.01);
    }
    src.connect(vg); vg.connect(this.out);
    src.start(t);
    src.onended = () => vg.disconnect();
  }
}

// ─── registry / factory ──────────────────────
export const INSTRUMENTS = {
  sub: SubSynth, fm: FMSynth, b808: Bass808, smp: Sampler, drum: DrumChannel,
};

export function createInstrument(ctx, type, params, getSample) {
  const Cls = INSTRUMENTS[type] || SubSynth;
  return new Cls(ctx, params, getSample);
}

// ─── instrument presets (browser panel) ──────
export const PRESETS = [
  { name: 'Sub · warm keys',  type: 'sub', params: { wave: 'triangle', cutoff: 2200, res: 0.8, envAmt: 800, attack: 0.01, decay: 0.5, sustain: 0.5, release: 0.5, unison: 1 } },
  { name: 'Sub · super saw',  type: 'sub', params: { wave: 'sawtooth', unison: 5, detune: 18, cutoff: 6000, res: 1, envAmt: 3000, sustain: 0.7, release: 0.35 } },
  { name: 'Sub · acid',       type: 'sub', params: { wave: 'sawtooth', unison: 1, cutoff: 500, res: 14, envAmt: 3500, fDecay: 0.12, sustain: 0.4, release: 0.08 } },
  { name: 'Sub · airy pad',   type: 'sub', params: { wave: 'sawtooth', unison: 4, detune: 12, cutoff: 1400, res: 0.6, envAmt: 400, attack: 0.8, decay: 1, sustain: 0.8, release: 1.6, gain: 0.4 } },
  { name: 'FM · e-piano',     type: 'fm',  params: { ratio1: 1, index1: 90, ratio2: 14, index2: 25, modDecay: 0.3, sustain: 0.25, release: 0.5 } },
  { name: 'FM · bell',        type: 'fm',  params: { ratio1: 3.5, index1: 300, ratio2: 7.01, index2: 80, modDecay: 0.5, decay: 1.2, sustain: 0.05, release: 1.5 } },
  { name: 'FM · metal pluck', type: 'fm',  params: { ratio1: 2, index1: 400, ratio2: 11.3, index2: 150, modDecay: 0.06, sustain: 0.1, release: 0.2 } },
  { name: '808 · long trap',  type: 'b808', params: { decay: 1.4, drive: 3, glide: 0.08 } },
  { name: '808 · tight',      type: 'b808', params: { decay: 0.45, drive: 2, glide: 0, tone: 700 } },
  { name: 'SMP · koto pluck', type: 'smp', params: { sampleId: 'pluck', rootMidi: 57 } },
];
