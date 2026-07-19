// ═══════════════════════════════════════════════
// 寂 JI — effects rack
// Each effect: create(ctx, params, shared) → { input, output, set(params), sync(t0, bpm), dispose() }
// shared = { ir } (reverb impulse response)
// ═══════════════════════════════════════════════

function g(ctx, v = 1) { const n = ctx.createGain(); n.gain.value = v; return n; }

function wetdry(ctx, wetNode, mix) {
  // returns {input, output, setMix}
  const input = g(ctx), output = g(ctx);
  const dry = g(ctx, 1 - mix), wet = g(ctx, mix);
  input.connect(dry); dry.connect(output);
  input.connect(wetNode.in); wetNode.out.connect(wet); wet.connect(output);
  return { input, output, setMix: m => { dry.gain.value = 1 - m; wet.gain.value = m; } };
}

const noop = () => {};

// ─── EQ3 ─────────────────────────────────────
function eq3(ctx, p) {
  const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 250;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.Q.value = 0.8;
  const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 4000;
  lo.connect(mid); mid.connect(hi);
  const set = p => { lo.gain.value = p.low; mid.gain.value = p.mid; mid.frequency.value = p.midFreq; hi.gain.value = p.high; };
  set(p);
  return { input: lo, output: hi, set, sync: noop };
}
eq3.label = 'EQ 3-BAND';
eq3.defaults = { low: 0, mid: 0, midFreq: 1000, high: 0 };
eq3.params = [
  { key: 'low', label: 'LOW', min: -18, max: 18, unit: 'dB' },
  { key: 'mid', label: 'MID', min: -18, max: 18, unit: 'dB' },
  { key: 'midFreq', label: 'MID HZ', min: 200, max: 6000, log: true },
  { key: 'high', label: 'HIGH', min: -18, max: 18, unit: 'dB' },
];

// ─── Compressor ──────────────────────────────
function comp(ctx, p) {
  const c = ctx.createDynamicsCompressor();
  const makeup = g(ctx);
  c.connect(makeup);
  const set = p => {
    c.threshold.value = p.threshold; c.ratio.value = p.ratio;
    c.attack.value = p.attack; c.release.value = p.release;
    makeup.gain.value = Math.pow(10, p.makeup / 20);
  };
  set(p);
  return { input: c, output: makeup, set, sync: noop };
}
comp.label = 'COMPRESSOR';
comp.defaults = { threshold: -20, ratio: 4, attack: 0.005, release: 0.2, makeup: 3 };
comp.params = [
  { key: 'threshold', label: 'THRESH', min: -60, max: 0, unit: 'dB' },
  { key: 'ratio', label: 'RATIO', min: 1, max: 20 },
  { key: 'attack', label: 'ATTACK', min: 0.001, max: 0.3, log: true, unit: 's' },
  { key: 'release', label: 'RELEASE', min: 0.02, max: 1, unit: 's' },
  { key: 'makeup', label: 'MAKEUP', min: 0, max: 18, unit: 'dB' },
];

// ─── Reverb ──────────────────────────────────
function reverb(ctx, p, shared) {
  const conv = ctx.createConvolver(); conv.buffer = shared.ir;
  const pre = ctx.createDelay(0.2);
  const damp = ctx.createBiquadFilter(); damp.type = 'lowpass';
  pre.connect(conv); conv.connect(damp);
  const wd = wetdry(ctx, { in: pre, out: damp }, p.mix);
  const set = p => { wd.setMix(p.mix); pre.delayTime.value = p.predelay; damp.frequency.value = p.damp; };
  set(p);
  return { input: wd.input, output: wd.output, set, sync: noop };
}
reverb.label = 'REVERB';
reverb.defaults = { mix: 0.25, predelay: 0.02, damp: 6000 };
reverb.params = [
  { key: 'mix', label: 'MIX', min: 0, max: 1 },
  { key: 'predelay', label: 'PRE-DLY', min: 0, max: 0.2, unit: 's' },
  { key: 'damp', label: 'DAMP', min: 500, max: 16000, log: true, unit: 'Hz' },
];

// ─── Delay (tempo-synced) ────────────────────
function delay(ctx, p, shared) {
  const dl = ctx.createDelay(4);
  const fb = g(ctx, p.feedback);
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
  dl.connect(tone); tone.connect(fb); fb.connect(dl);
  const wd = wetdry(ctx, { in: dl, out: tone }, p.mix);
  const set = p => {
    const beat = 60 / (shared.bpm || 120);
    dl.delayTime.value = beat * p.time;   // time in beats
    fb.gain.value = p.feedback; tone.frequency.value = p.tone; wd.setMix(p.mix);
  };
  set(p);
  return { input: wd.input, output: wd.output, set, sync: (t0, bpm) => { shared.bpm = bpm; set(p); }, _p: p };
}
delay.label = 'DELAY';
delay.defaults = { time: 0.75, feedback: 0.35, tone: 5000, mix: 0.25 };
delay.params = [
  { key: 'time', label: 'BEATS', min: 0.125, max: 2, step: 0.125 },
  { key: 'feedback', label: 'FDBK', min: 0, max: 0.9 },
  { key: 'tone', label: 'TONE', min: 500, max: 12000, log: true, unit: 'Hz' },
  { key: 'mix', label: 'MIX', min: 0, max: 1 },
];

// ─── Distortion / saturation ─────────────────
function dist(ctx, p) {
  const pre = g(ctx), shaper = ctx.createWaveShaper(), post = g(ctx);
  shaper.oversample = '4x';
  pre.connect(shaper); shaper.connect(post);
  const set = p => {
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = i / 511.5 - 1;
      curve[i] = p.mode < 0.5 ? Math.tanh(x * p.drive) : Math.sign(x) * Math.min(1, Math.abs(x * p.drive * 0.6));
    }
    shaper.curve = curve;
    post.gain.value = Math.pow(10, p.output / 20) / Math.max(1, Math.sqrt(p.drive) * 0.7);
  };
  set(p);
  return { input: pre, output: post, set, sync: noop };
}
dist.label = 'SATURATE';
dist.defaults = { drive: 3, mode: 0, output: 0 };
dist.params = [
  { key: 'drive', label: 'DRIVE', min: 1, max: 30, log: true },
  { key: 'mode', label: 'SOFT/HARD', min: 0, max: 1, step: 1 },
  { key: 'output', label: 'OUT', min: -18, max: 6, unit: 'dB' },
];

// ─── Chorus ──────────────────────────────────
function chorus(ctx, p) {
  const dl1 = ctx.createDelay(0.1), dl2 = ctx.createDelay(0.1);
  const lfo1 = ctx.createOscillator(), lfo2 = ctx.createOscillator();
  const d1 = g(ctx, 0.004), d2 = g(ctx, 0.004);
  lfo1.connect(d1); d1.connect(dl1.delayTime);
  lfo2.connect(d2); d2.connect(dl2.delayTime);
  lfo1.start(); lfo2.start();
  const sum = g(ctx, 0.5);
  dl1.connect(sum); dl2.connect(sum);
  const inSplit = g(ctx); inSplit.connect(dl1); inSplit.connect(dl2);
  const wd = wetdry(ctx, { in: inSplit, out: sum }, p.mix);
  const set = p => {
    dl1.delayTime.value = 0.018; dl2.delayTime.value = 0.026;
    lfo1.frequency.value = p.rate; lfo2.frequency.value = p.rate * 1.31;
    d1.gain.value = d2.gain.value = p.depth * 0.008;
    wd.setMix(p.mix);
  };
  set(p);
  return { input: wd.input, output: wd.output, set, sync: noop, dispose: () => { lfo1.stop(); lfo2.stop(); } };
}
chorus.label = 'CHORUS';
chorus.defaults = { rate: 0.6, depth: 0.5, mix: 0.4 };
chorus.params = [
  { key: 'rate', label: 'RATE', min: 0.05, max: 6, log: true, unit: 'Hz' },
  { key: 'depth', label: 'DEPTH', min: 0, max: 1 },
  { key: 'mix', label: 'MIX', min: 0, max: 1 },
];

// ─── Limiter ─────────────────────────────────
function limiter(ctx, p) {
  const c = ctx.createDynamicsCompressor();
  c.knee.value = 0; c.ratio.value = 20; c.attack.value = 0.001;
  const out = g(ctx);
  c.connect(out);
  const set = p => { c.threshold.value = p.ceiling; c.release.value = p.release; out.gain.value = Math.pow(10, p.boost / 20); };
  set(p);
  return { input: c, output: out, set, sync: noop };
}
limiter.label = 'LIMITER';
limiter.defaults = { ceiling: -1, release: 0.1, boost: 0 };
limiter.params = [
  { key: 'ceiling', label: 'CEILING', min: -12, max: 0, unit: 'dB' },
  { key: 'release', label: 'RELEASE', min: 0.02, max: 0.5, unit: 's' },
  { key: 'boost', label: 'IN BOOST', min: 0, max: 12, unit: 'dB' },
];

// ─── Autofilter + LFO ────────────────────────
function autofilter(ctx, p) {
  const f = ctx.createBiquadFilter();
  const lfo = ctx.createOscillator(); lfo.type = 'sine';
  const depth = g(ctx);
  lfo.connect(depth); depth.connect(f.frequency); lfo.start();
  const set = p => {
    f.type = p.type < 0.5 ? 'lowpass' : 'bandpass';
    f.frequency.value = p.cutoff; f.Q.value = p.res;
    lfo.frequency.value = p.rate;
    depth.gain.value = p.depth * p.cutoff * 0.9;
  };
  set(p);
  return { input: f, output: f, set, sync: noop, dispose: () => lfo.stop() };
}
autofilter.label = 'AUTOFILTER';
autofilter.defaults = { cutoff: 1200, res: 4, rate: 0.5, depth: 0.6, type: 0 };
autofilter.params = [
  { key: 'cutoff', label: 'CUTOFF', min: 80, max: 12000, log: true, unit: 'Hz' },
  { key: 'res', label: 'RES', min: 0.3, max: 18 },
  { key: 'rate', label: 'LFO HZ', min: 0.05, max: 12, log: true },
  { key: 'depth', label: 'DEPTH', min: 0, max: 1 },
  { key: 'type', label: 'LP/BP', min: 0, max: 1, step: 1 },
];

// ─── Gate / stutter (Gross-Beat-style) ───────
// A tempo-synced square LFO gates the signal. Phase-locked on transport start via sync().
function gate(ctx, p, shared) {
  const vca = g(ctx, 1);
  const state = { osc: null, shaper: null, off: null, p };
  function rebuild(t0, bpm) {
    if (state.osc) { try { state.osc.stop(); } catch (e) {} state.off.disconnect(); state.shaper.disconnect(); }
    const osc = ctx.createOscillator(); osc.type = 'square';
    const beat = 60 / (bpm || 120);
    osc.frequency.value = 1 / (beat * state.p.rate);
    // square (−1..1) → gate curve (depth control)
    const sh = ctx.createWaveShaper();
    const c = new Float32Array(3);
    c[0] = 1 - state.p.depth; c[1] = (1 - state.p.depth + 1) / 2; c[2] = 1;
    sh.curve = c;
    const off = g(ctx, 1);
    vca.gain.value = 0;
    osc.connect(sh); sh.connect(vca.gain);
    osc.start(t0 !== undefined ? t0 : ctx.currentTime);
    state.osc = osc; state.shaper = sh; state.off = off;
  }
  rebuild(undefined, shared.bpm || 120);
  const set = np => { Object.assign(state.p, np); rebuild(undefined, shared.bpm || 120); };
  return {
    input: vca, output: vca, set,
    sync: (t0, bpm) => { shared.bpm = bpm; rebuild(t0, bpm); },
    dispose: () => { try { state.osc.stop(); } catch (e) {} },
  };
}
gate.label = 'GATE / STUTTER';
gate.defaults = { rate: 0.25, depth: 1 };
gate.params = [
  { key: 'rate', label: 'BEATS', min: 0.0625, max: 1, step: 0.0625 },
  { key: 'depth', label: 'DEPTH', min: 0, max: 1 },
];

// ─── Sidechain pump ──────────────────────────
// Sawtooth LFO at beat rate, shaped into a duck-and-recover curve.
function pump(ctx, p, shared) {
  const vca = g(ctx, 1);
  const state = { osc: null, sh: null, p };
  function rebuild(t0, bpm) {
    if (state.osc) { try { state.osc.stop(); } catch (e) {} state.sh.disconnect(); }
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const beat = 60 / (bpm || 120);
    osc.frequency.value = 1 / (beat * state.p.rate);
    const sh = ctx.createWaveShaper();
    // saw ramps −1→1 each cycle; map to gain: start ducked, recover with a curve
    const N = 256, c = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const phase = i / (N - 1);                       // 0..1 through the beat
      const rec = Math.pow(phase, 1 / (0.3 + state.p.shape * 2)); // recovery curve
      c[i] = 1 - state.p.amount + state.p.amount * rec;
    }
    sh.curve = c;
    vca.gain.value = 0;
    osc.connect(sh); sh.connect(vca.gain);
    osc.start(t0 !== undefined ? t0 : ctx.currentTime);
    state.osc = osc; state.sh = sh;
  }
  rebuild(undefined, shared.bpm || 120);
  const set = np => { Object.assign(state.p, np); rebuild(undefined, shared.bpm || 120); };
  return {
    input: vca, output: vca, set,
    sync: (t0, bpm) => { shared.bpm = bpm; rebuild(t0, bpm); },
    dispose: () => { try { state.osc.stop(); } catch (e) {} },
  };
}
pump.label = 'PUMP (SIDECHAIN)';
pump.defaults = { amount: 0.7, rate: 1, shape: 0.4 };
pump.params = [
  { key: 'amount', label: 'AMOUNT', min: 0, max: 1 },
  { key: 'rate', label: 'BEATS', min: 0.25, max: 2, step: 0.25 },
  { key: 'shape', label: 'SHAPE', min: 0, max: 1 },
];

// ─── OTT-style multiband ─────────────────────
function ott(ctx, p) {
  const input = g(ctx), output = g(ctx);
  const bands = [];
  const mk = (type, freq, freq2) => {
    const f1 = ctx.createBiquadFilter(); f1.type = type; f1.frequency.value = freq;
    let entry = f1, exit = f1;
    if (freq2) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = freq2; f1.connect(f2); exit = f2; }
    const c = ctx.createDynamicsCompressor();
    c.knee.value = 6; c.attack.value = 0.002; c.release.value = 0.06;
    const up = g(ctx, 1);
    exit.connect(c); c.connect(up); up.connect(output);
    input.connect(entry);
    bands.push({ c, up });
  };
  mk('lowpass', 250);
  mk('highpass', 250, 2500);
  mk('highpass', 2500);
  const dryG = g(ctx, 0); input.connect(dryG); dryG.connect(output);
  const set = p => {
    for (const b of bands) {
      b.c.threshold.value = -12 - p.depth * 36;
      b.c.ratio.value = 3 + p.depth * 9;
      b.up.gain.value = Math.pow(10, (p.depth * 14 + p.gain) / 20) * (1 - p.mix === 1 ? 0 : 1) * p.mix;
    }
    dryG.gain.value = 1 - p.mix;
  };
  set(p);
  return { input, output, set, sync: noop };
}
ott.label = 'OTT MULTIBAND';
ott.defaults = { depth: 0.5, gain: 0, mix: 1 };
ott.params = [
  { key: 'depth', label: 'DEPTH', min: 0, max: 1 },
  { key: 'gain', label: 'GAIN', min: -12, max: 12, unit: 'dB' },
  { key: 'mix', label: 'MIX', min: 0, max: 1 },
];

// ─── registry ────────────────────────────────
export const EFFECTS = {
  eq3, comp, reverb, delay, dist, chorus, limiter, autofilter, gate, pump, ott,
};

export function createEffect(ctx, type, params, shared) {
  const fn = EFFECTS[type];
  if (!fn) return null;
  const inst = fn(ctx, { ...fn.defaults, ...params }, shared || {});
  inst.type = type;
  return inst;
}
