// ═══════════════════════════════════════════════
// 寂 JI — project state, defaults, persistence
// ═══════════════════════════════════════════════

let _id = 0;
export const uid = p => `${p}${Date.now().toString(36)}${(_id++).toString(36)}`;

export const NUM_MIXER = 10;      // insert tracks
export const NUM_RETURNS = 2;     // A: reverb, B: delay
export const SESSION_SCENES = 6;

export const CHANNEL_COLORS = ['#c9a96a', '#7ba888', '#8a9fb5', '#b58a9f', '#a8967b', '#7b9fa8', '#9f8ab5', '#b5a88a'];

export function defaultChannel(type = 'sub', name = 'channel', params = {}, mixerTrack = 1) {
  return { id: uid('ch'), name, type, params, mixerTrack, mute: false, color: CHANNEL_COLORS[_id % CHANNEL_COLORS.length] };
}

export function defaultPattern(name, bars = 1) {
  return { id: uid('pt'), name, bars, steps: {}, notes: {} };
  // steps[chId] = Float32-like array of velocities 0..1, length bars*16 (0 = off)
  // notes[chId] = [{k: midi, s: startStep(float), d: durSteps, v: velocity}]
}

export function defaultMixerTrack(name) {
  return { name, volume: 0.8, pan: 0, sends: [0, 0], effects: [], mute: false, solo: false };
  // effects: [{ id, type, params, enabled }]
}

export function defaultProject() {
  const channels = [
    defaultChannel('drum', 'Kick', { sampleId: 'kick' }, 1),
    defaultChannel('drum', 'Snare', { sampleId: 'snare' }, 2),
    defaultChannel('drum', 'Clap', { sampleId: 'clap' }, 2),
    defaultChannel('drum', 'Hat', { sampleId: 'hat' }, 3),
    defaultChannel('drum', 'Open Hat', { sampleId: 'ohat' }, 3),
    defaultChannel('b808', '808', {}, 4),
    defaultChannel('sub', 'Keys', { wave: 'triangle', cutoff: 2400, envAmt: 900, attack: 0.01, release: 0.4 }, 5),
    defaultChannel('sub', 'Lead', { wave: 'sawtooth', unison: 4, detune: 14, cutoff: 5000 }, 6),
  ];
  const pat = defaultPattern('Pattern 1');
  // a starter groove
  const step = (ch, idxs, vel = 1) => {
    const a = new Array(16).fill(0);
    idxs.forEach(i => a[i] = vel);
    pat.steps[ch.id] = a;
  };
  step(channels[0], [0, 6, 10]);        // kick
  step(channels[2], [4, 12]);           // clap
  step(channels[3], [0, 2, 4, 6, 8, 10, 12, 14], 0.7); // hats
  pat.notes[channels[5].id] = [
    { k: 36, s: 0, d: 3, v: 1 }, { k: 36, s: 6, d: 2, v: 0.9 }, { k: 39, s: 10, d: 2, v: 0.9 }, { k: 34, s: 13, d: 3, v: 1 },
  ];

  const mixer = [];
  mixer.push(defaultMixerTrack('MASTER'));
  const names = ['KICK', 'SNR', 'HATS', 'BASS', 'KEYS', 'LEAD', 'TRK 7', 'TRK 8', 'TRK 9', 'TRK 10'];
  for (let i = 0; i < NUM_MIXER; i++) mixer.push(defaultMixerTrack(names[i]));
  const retA = defaultMixerTrack('REV ·A'); retA.effects.push({ id: uid('fx'), type: 'reverb', params: { mix: 1 }, enabled: true });
  const retB = defaultMixerTrack('DLY ·B'); retB.effects.push({ id: uid('fx'), type: 'delay', params: { mix: 1, feedback: 0.45 }, enabled: true });
  mixer.push(retA, retB);
  mixer[0].effects.push({ id: uid('fx'), type: 'limiter', params: {}, enabled: true });

  return {
    version: 1,
    name: 'untitled',
    bpm: 128,
    swing: 0,
    channels,
    patterns: [pat],
    currentPattern: pat.id,
    scenes: Array.from({ length: SESSION_SCENES }, (_, i) => ({ id: uid('sc'), name: `Scene ${i + 1}`, clips: {} })),
    // scenes[i].clips[channelRackCol]  — session columns are "slots" 0..7 holding patternIds
    arrangement: {
      lanes: 8,
      clips: [],   // {id, patternId, lane, start(bars), length(bars)}
      automation: [], // {target: 'mix.1.volume', points: [{bar, val}]}
    },
    mixer,       // [master, 1..NUM_MIXER, returnA, returnB]
  };
}

// ─── persistence ─────────────────────────────
const LS_KEY = 'ji-studio-project';

export function saveLocal(project) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(project)); } catch (e) { /* quota */ }
}
export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && p.version === 1 && Array.isArray(p.channels)) return p;
  } catch (e) {}
  return null;
}

export function exportFile(project) {
  const blob = new Blob([JSON.stringify(project, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name || 'project'}.jiproj`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function importFile(file) {
  return file.text().then(t => {
    const p = JSON.parse(t);
    if (!p || !Array.isArray(p.channels) || !Array.isArray(p.patterns)) throw new Error('not a JI project');
    return p;
  });
}

export function getPattern(project, id) {
  return project.patterns.find(p => p.id === id) || project.patterns[0];
}
export function currentPattern(project) {
  return getPattern(project, project.currentPattern);
}
