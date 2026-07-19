// ═══════════════════════════════════════════════
// 寂 JI — procedural sample pack
// Every sample is synthesized at load time: 100% original, royalty-free.
// ═══════════════════════════════════════════════

function buf(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(seconds * ctx.sampleRate)), ctx.sampleRate);
  return [b, b.getChannelData(0), ctx.sampleRate];
}
const TAU = Math.PI * 2;

function softclip(x, drive = 1) { return Math.tanh(x * drive); }

// simple one-pole filters operating on arrays
function lowpass(d, sr, cutoff) {
  const a = 1 - Math.exp(-TAU * cutoff / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; }
}
function highpass(d, sr, cutoff) {
  const a = 1 - Math.exp(-TAU * cutoff / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = d[i] - y; }
}

// ─── Drums ───────────────────────────────────

function kick(ctx, { pitch = 50, punch = 160, decay = 0.45, drive = 1.6 } = {}) {
  const [b, d, sr] = buf(ctx, decay + 0.05);
  let phase = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t / (decay * 0.28));
    const f = pitch + punch * Math.exp(-t * 55);
    phase += TAU * f / sr;
    const click = t < 0.004 ? (1 - t / 0.004) * 0.5 * (Math.random() * 2 - 1) : 0;
    d[i] = softclip(Math.sin(phase) * env * 1.2 + click, drive) * 0.9;
  }
  return b;
}

function kick808(ctx) { return kick(ctx, { pitch: 44, punch: 120, decay: 0.7, drive: 2.2 }); }

function snare(ctx, { tone = 190, decay = 0.22, snap = 0.7 } = {}) {
  const [b, d, sr] = buf(ctx, decay + 0.1);
  let phase = 0;
  const noise = new Float32Array(d.length);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  highpass(noise, sr, 1200);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    phase += TAU * (tone + 60 * Math.exp(-t * 90)) / sr;
    const body = Math.sin(phase) * Math.exp(-t / 0.055) * (1 - snap * 0.5);
    const n = noise[i] * Math.exp(-t / (decay * 0.45)) * snap;
    d[i] = softclip(body + n, 1.4) * 0.85;
  }
  return b;
}

function clap(ctx) {
  const [b, d, sr] = buf(ctx, 0.4);
  const noise = new Float32Array(d.length);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  highpass(noise, sr, 800); lowpass(noise, sr, 7500);
  const bursts = [0, 0.012, 0.025, 0.038];
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let e = 0;
    for (const bt of bursts) if (t >= bt) e = Math.max(e, Math.exp(-(t - bt) / (bt === 0.038 ? 0.09 : 0.008)));
    d[i] = noise[i] * e * 0.8;
  }
  return b;
}

function hat(ctx, { decay = 0.05, open = false } = {}) {
  const dec = open ? 0.35 : decay;
  const [b, d, sr] = buf(ctx, dec + 0.05);
  // 6 detuned square oscillators — classic metallic hat recipe
  const freqs = [263, 400, 421, 474, 587, 845].map(f => f * 7.23);
  const phases = new Float32Array(6);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let o = 0; o < 6; o++) {
      phases[o] += TAU * freqs[o] / sr;
      s += Math.sign(Math.sin(phases[o]));
    }
    d[i] = s / 6 * Math.exp(-t / (dec * 0.4));
  }
  highpass(d, sr, 6500);
  for (let i = 0; i < d.length; i++) d[i] *= 0.55;
  return b;
}

function rim(ctx) {
  const [b, d, sr] = buf(ctx, 0.08);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    p1 += TAU * 480 / sr; p2 += TAU * 1010 / sr;
    d[i] = (Math.sin(p1) * 0.6 + Math.sin(p2) * 0.4) * Math.exp(-t / 0.012) * 0.8;
  }
  return b;
}

function tom(ctx, base = 120) {
  const [b, d, sr] = buf(ctx, 0.4);
  let phase = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    phase += TAU * (base + 80 * Math.exp(-t * 25)) / sr;
    d[i] = softclip(Math.sin(phase) * Math.exp(-t / 0.13), 1.3) * 0.8;
  }
  return b;
}

function shaker(ctx) {
  const [b, d, sr] = buf(ctx, 0.12);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  highpass(d, sr, 4000);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const env = Math.min(t / 0.02, 1) * Math.exp(-Math.max(0, t - 0.02) / 0.03);
    d[i] *= env * 0.5;
  }
  return b;
}

// ─── FX / texture ────────────────────────────

function riser(ctx) {
  const [b, d, sr] = buf(ctx, 2.0);
  let phase = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, k = t / 2.0;
    phase += TAU * (120 + 1800 * k * k) / sr;
    const n = (Math.random() * 2 - 1) * 0.4 * k;
    d[i] = (Math.sin(phase) * 0.4 + n) * k * 0.7;
  }
  return b;
}

function impact(ctx) {
  const [b, d, sr] = buf(ctx, 1.4);
  let phase = 0;
  const noise = new Float32Array(d.length);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
  lowpass(noise, sr, 900);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    phase += TAU * (55 + 200 * Math.exp(-t * 30)) / sr;
    d[i] = softclip(Math.sin(phase) * Math.exp(-t / 0.5) + noise[i] * Math.exp(-t / 0.3) * 0.8, 1.8) * 0.85;
  }
  return b;
}

function vinyl(ctx) {
  const [b, d, sr] = buf(ctx, 2.0);
  for (let i = 0; i < d.length; i++) {
    let s = (Math.random() * 2 - 1) * 0.012;
    if (Math.random() < 0.0004) s += (Math.random() * 2 - 1) * 0.25; // crackle pops
    d[i] = s;
  }
  lowpass(d, sr, 6000); highpass(d, sr, 300);
  return b;
}

function pluck(ctx, freq = 220) {
  // Karplus–Strong string
  const [b, d, sr] = buf(ctx, 1.2);
  const N = Math.round(sr / freq);
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < d.length; i++) {
    const cur = line[idx], next = line[(idx + 1) % N];
    const out = (cur + next) * 0.5 * 0.996;
    line[idx] = out; d[i] = cur * 0.7;
    idx = (idx + 1) % N;
  }
  return b;
}

// ─── Pack builder ────────────────────────────

export function buildSamplePack(ctx) {
  return [
    { id: 'kick',    name: 'Kick · deep',   buffer: kick(ctx) },
    { id: 'kick808', name: 'Kick · 808',    buffer: kick808(ctx) },
    { id: 'kickpnch',name: 'Kick · punch',  buffer: kick(ctx, { pitch: 58, punch: 220, decay: 0.3, drive: 2.4 }) },
    { id: 'snare',   name: 'Snare',         buffer: snare(ctx) },
    { id: 'snaretr', name: 'Snare · trap',  buffer: snare(ctx, { tone: 210, decay: 0.16, snap: 0.85 }) },
    { id: 'clap',    name: 'Clap',          buffer: clap(ctx) },
    { id: 'hat',     name: 'Hat · closed',  buffer: hat(ctx) },
    { id: 'hattick', name: 'Hat · tick',    buffer: hat(ctx, { decay: 0.028 }) },
    { id: 'ohat',    name: 'Hat · open',    buffer: hat(ctx, { open: true }) },
    { id: 'rim',     name: 'Rim',           buffer: rim(ctx) },
    { id: 'tomlo',   name: 'Tom · low',     buffer: tom(ctx, 95) },
    { id: 'tomhi',   name: 'Tom · high',    buffer: tom(ctx, 170) },
    { id: 'shaker',  name: 'Shaker',        buffer: shaker(ctx) },
    { id: 'pluck',   name: 'Pluck · koto',  buffer: pluck(ctx, 220) },
    { id: 'pluckhi', name: 'Pluck · high',  buffer: pluck(ctx, 440) },
    { id: 'riser',   name: 'FX · riser',    buffer: riser(ctx) },
    { id: 'impact',  name: 'FX · impact',   buffer: impact(ctx) },
    { id: 'vinyl',   name: 'FX · vinyl',    buffer: vinyl(ctx) },
  ];
}

// generate a noise impulse response for the reverb
export function makeIR(ctx, seconds = 2.4, decay = 3.2) {
  const len = Math.floor(seconds * ctx.sampleRate);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}
