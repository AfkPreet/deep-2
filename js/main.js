// ═══════════════════════════════════════════════
// 寂 JI — app bootstrap & global wiring
// ═══════════════════════════════════════════════

import { defaultProject, defaultPattern, saveLocal, loadLocal, exportFile, importFile, currentPattern, uid, deliverBlob } from './state.js';
import { Engine, renderToWav, songLengthBars } from './engine.js';
import { $, status } from './ui-common.js';
import { RackView } from './ui-rack.js';
import { PianoRoll } from './ui-pianoroll.js';
import { SessionView } from './ui-session.js';
import { ArrangeView } from './ui-arrange.js';
import { MixerView } from './ui-mixer.js';
import { BrowserView } from './ui-browser.js';
import { Editors } from './ui-editors.js';

const app = {
  project: loadLocal() || defaultProject(),
  engine: null,
  selectedChannel: null,
  dirty: false,
  view: 'rack',
  markDirty() { this.dirty = true; },
  openInstrumentEditor(ch) { editors.openInstrument(ch); },
  openFxEditor(t, f) { editors.openFx(t, f); },
};
app.engine = new Engine(app.project);
app.selectedChannel = app.project.channels[0]?.id || null;

const editors = new Editors(app);
app.rack = new RackView(app);
app.piano = new PianoRoll(app);
app.session = new SessionView(app);
app.arrange = new ArrangeView(app);
app.mixer = new MixerView(app);
app.browser = new BrowserView(app);

// ─── view tabs ───────────────────────────────
const views = { rack: app.rack, piano: app.piano, session: app.session, arrange: app.arrange, mixer: app.mixer };
document.querySelectorAll('.vtab').forEach(btn => {
  btn.onclick = () => switchView(btn.dataset.view);
});
function switchView(v) {
  app.view = v;
  document.querySelectorAll('.vtab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  $(`#view-${v}`).classList.add('active');
  if (v === 'piano') { app.piano.refreshChannels(); app.piano.render(); }
  if (v === 'arrange') { app.arrange.refreshSelectors(); app.arrange.render(); }
  if (v === 'rack') app.rack.render();
  if (v === 'session') app.session.render();
  if (v === 'mixer') app.mixer.render();
  if (v === 'session' && app.engine.mode !== 'session') status('launch a cell to enter session mode');
}

// ─── transport ───────────────────────────────
const btnPlay = $('#btn-play');
btnPlay.onclick = togglePlay;
$('#btn-stop').onclick = () => { app.engine.stop(); btnPlay.classList.remove('playing'); };
function togglePlay() {
  if (app.engine.playing) { app.engine.stop(); btnPlay.classList.remove('playing'); }
  else {
    if (app.engine.mode === 'session') app.engine.mode = modeBtnState();
    app.engine.play();
    btnPlay.classList.add('playing');
  }
}
function modeBtnState() { return $('#mode-song').classList.contains('active') ? 'song' : 'pattern'; }

$('#mode-pat').onclick = () => setMode('pattern');
$('#mode-song').onclick = () => setMode('song');
function setMode(m) {
  $('#mode-pat').classList.toggle('active', m === 'pattern');
  $('#mode-song').classList.toggle('active', m === 'song');
  app.engine.setMode(m);
  status(m === 'song' ? 'song mode — plays the arrangement' : 'pattern mode — loops the current pattern');
}

$('#bpm').value = app.project.bpm;
$('#bpm').onchange = e => {
  app.project.bpm = Math.min(300, Math.max(40, +e.target.value || 128));
  e.target.value = app.project.bpm;
  if (app.engine.playing) app.engine.syncFx(app.engine.ctx.currentTime + 0.05);
  app.markDirty();
};
$('#swing').value = app.project.swing;
$('#swing').oninput = e => { app.project.swing = +e.target.value; app.markDirty(); };

// ─── pattern selector ────────────────────────
const patSel = $('#pattern-select');
function refreshPatterns() {
  patSel.innerHTML = '';
  for (const p of app.project.patterns) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = `${p.name} · ${p.bars} bar${p.bars > 1 ? 's' : ''}`;
    patSel.appendChild(o);
  }
  patSel.value = app.project.currentPattern;
}
patSel.onchange = () => { app.project.currentPattern = patSel.value; app.rack.render(); if (app.view === 'piano') app.piano.render(); app.markDirty(); };
$('#pat-prev').onclick = () => stepPattern(-1);
$('#pat-next').onclick = () => stepPattern(1);
function stepPattern(d) {
  const ps = app.project.patterns;
  const i = ps.findIndex(p => p.id === app.project.currentPattern);
  const ni = (i + d + ps.length) % ps.length;
  app.project.currentPattern = ps[ni].id;
  refreshPatterns(); app.rack.render(); if (app.view === 'piano') app.piano.render();
}
$('#pat-add').onclick = () => {
  const bars = +prompt('pattern length in bars (1–8)', '1') || 1;
  const p = defaultPattern(`Pattern ${app.project.patterns.length + 1}`, Math.min(8, Math.max(1, bars)));
  app.project.patterns.push(p);
  app.project.currentPattern = p.id;
  refreshPatterns(); app.rack.render(); app.markDirty();
};
$('#pat-clone').onclick = () => {
  const src = currentPattern(app.project);
  const p = JSON.parse(JSON.stringify(src));
  p.id = uid('pt'); p.name = src.name + ' copy';
  app.project.patterns.push(p);
  app.project.currentPattern = p.id;
  refreshPatterns(); app.rack.render(); app.markDirty();
};
$('#pat-del').onclick = () => {
  if (app.project.patterns.length <= 1) return status('cannot delete the last pattern');
  if (!confirm(`delete ${currentPattern(app.project).name}?`)) return;
  const id = app.project.currentPattern;
  app.project.patterns = app.project.patterns.filter(p => p.id !== id);
  app.project.arrangement.clips = app.project.arrangement.clips.filter(c => c.patternId !== id);
  for (const sc of app.project.scenes) for (const k of Object.keys(sc.clips)) if (sc.clips[k] === id) delete sc.clips[k];
  app.project.currentPattern = app.project.patterns[0].id;
  refreshPatterns(); app.rack.render(); app.markDirty();
};

// ─── save / open / export ────────────────────
$('#btn-save').onclick = async () => { status(await exportFile(app.project)); };
$('#btn-open').onclick = () => $('#file-open').click();
$('#file-open').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const p = await importFile(f);
    loadProject(p);
    status(`opened ${p.name || f.name}`);
  } catch (err) { status('could not open — not a JI project file'); }
  e.target.value = '';
};
function loadProject(p) {
  app.engine.stop();
  btnPlay.classList.remove('playing');
  app.project = p;
  app.engine.project = p;
  app.selectedChannel = p.channels[0]?.id || null;
  if (app.engine.ctx) app.engine.rebuildAll();
  $('#bpm').value = p.bpm; $('#swing').value = p.swing;
  refreshPatterns();
  app.piano.refreshChannels();
  app.arrange.refreshSelectors();
  switchView(app.view);
  saveLocal(p);
}

$('#btn-export').onclick = async () => {
  app.engine.ensureCtx();
  const bars = songLengthBars(app.project);
  if (!app.project.arrangement.clips.length) {
    status('arrangement is empty — place patterns in ARRANGE first');
    return;
  }
  status(`rendering ${bars} bars…`);
  $('#btn-export').disabled = true;
  try {
    const blob = await renderToWav(app.project, app.engine.samples, bars);
    const msg = await deliverBlob(blob, `${app.project.name || 'song'}.wav`);
    status(`rendered ${bars} bars — ${msg}`);
  } catch (err) {
    console.error(err);
    status('export failed: ' + err.message);
  }
  $('#btn-export').disabled = false;
};

// ─── computer keyboard piano ─────────────────
const KEYMAP = { z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59, ',': 60, q: 60, 2: 61, w: 62, 3: 63, e: 64, r: 65, 5: 66, t: 67, 6: 68, y: 69, 7: 70, u: 71, i: 72 };
let octaveShift = 0;
const heldKeys = new Set();
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
  if (e.key === '[') { octaveShift = Math.max(-3, octaveShift - 1); status(`octave ${octaveShift >= 0 ? '+' : ''}${octaveShift}`); return; }
  if (e.key === ']') { octaveShift = Math.min(3, octaveShift + 1); status(`octave ${octaveShift >= 0 ? '' : ''}${octaveShift}`); return; }
  const midi = KEYMAP[e.key.toLowerCase()];
  if (midi !== undefined && !heldKeys.has(e.key) && app.selectedChannel) {
    heldKeys.add(e.key);
    const ch = app.project.channels.find(c => c.id === app.selectedChannel);
    app.engine.audition(app.selectedChannel, midi + octaveShift * 12 + (ch?.type === 'b808' ? -12 : 0), 1, 0.4);
  }
});
window.addEventListener('keyup', e => heldKeys.delete(e.key));

// ─── UI clock (playhead, meters, position) ───
const posBar = $('#pos-bar'), posBeat = $('#pos-beat'), posStep = $('#pos-step');
function raf() {
  const g = app.engine.getPosition();
  if (g !== null) {
    posBar.textContent = Math.floor(g / 16) + 1;
    posBeat.textContent = Math.floor((g % 16) / 4) + 1;
    posStep.textContent = (g % 4) + 1;
    if (app.view === 'rack') app.rack.tick();
    if (app.view === 'piano') app.piano.render();
    if (app.view === 'arrange' && app.engine.mode === 'song') app.arrange.render();
  } else {
    if (app.view === 'rack') app.rack.tick();
  }
  if (app.view === 'mixer') app.mixer.tick();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// ─── autosave ────────────────────────────────
setInterval(() => { if (app.dirty) { saveLocal(app.project); app.dirty = false; } }, 3000);
window.addEventListener('beforeunload', () => saveLocal(app.project));

// ─── boot ────────────────────────────────────
refreshPatterns();
app.rack.render();
app.piano.refreshChannels();
app.arrange.refreshSelectors();
// samples need an AudioContext, which needs a user gesture — lazy render on first interaction
const lazySamples = () => { app.browser.renderSamples(); document.removeEventListener('pointerdown', lazySamples); };
document.addEventListener('pointerdown', lazySamples);
status('寂 — rack ready · click steps, space to play');
