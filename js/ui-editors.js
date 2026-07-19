// ═══════════════════════════════════════════════
// 寂 JI — instrument editor & FX editor panels
// ═══════════════════════════════════════════════

import { $, el, makeKnob } from './ui-common.js';
import { INSTRUMENTS } from './synths.js';
import { EFFECTS } from './effects.js';

const K = (key, label, min, max, opt = {}) => ({ kind: 'knob', key, label, min, max, ...opt });
const SEL = (key, label, options) => ({ kind: 'select', key, label, options });

const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];

const INSTRUMENT_UI = {
  sub: [
    { title: 'OSCILLATOR', items: [
      SEL('wave', 'WAVE', WAVES), K('unison', 'UNISON', 1, 7, { step: 1 }), K('detune', 'DETUNE', 0, 50, { unit: 'ct' }),
      SEL('wave2', 'OSC2', WAVES), K('osc2mix', 'OSC2 MIX', 0, 1), K('osc2semi', 'OSC2 SEMI', -24, 24, { step: 1 }),
    ]},
    { title: 'FILTER', items: [
      K('cutoff', 'CUTOFF', 60, 16000, { log: true, unit: 'Hz' }), K('res', 'RES', 0.1, 20),
      K('envAmt', 'ENV AMT', 0, 8000, { unit: 'Hz' }), K('fAttack', 'F.ATK', 0.001, 1, { log: true, unit: 's' }), K('fDecay', 'F.DEC', 0.02, 2, { unit: 's' }),
    ]},
    { title: 'ENVELOPE', items: [
      K('attack', 'ATTACK', 0.001, 2, { log: true, unit: 's' }), K('decay', 'DECAY', 0.02, 3, { unit: 's' }),
      K('sustain', 'SUSTAIN', 0, 1), K('release', 'RELEASE', 0.02, 4, { unit: 's' }), K('gain', 'GAIN', 0, 1),
    ]},
  ],
  fm: [
    { title: 'OPERATORS', items: [
      K('ratio1', 'RATIO 1', 0.25, 16), K('index1', 'INDEX 1', 0, 800),
      K('ratio2', 'RATIO 2', 0.25, 16), K('index2', 'INDEX 2', 0, 800),
      K('modDecay', 'MOD DEC', 0.02, 2, { unit: 's' }), K('brightness', 'BRIGHT', 500, 16000, { log: true, unit: 'Hz' }),
    ]},
    { title: 'ENVELOPE', items: [
      K('attack', 'ATTACK', 0.001, 2, { log: true, unit: 's' }), K('decay', 'DECAY', 0.02, 3, { unit: 's' }),
      K('sustain', 'SUSTAIN', 0, 1), K('release', 'RELEASE', 0.02, 4, { unit: 's' }), K('gain', 'GAIN', 0, 1),
    ]},
  ],
  b808: [
    { title: '808', items: [
      K('decay', 'DECAY', 0.1, 3, { unit: 's' }), K('punch', 'PUNCH', 0, 200, { unit: 'Hz' }),
      K('drive', 'DRIVE', 1, 10), K('tone', 'TONE', 200, 4000, { log: true, unit: 'Hz' }),
      K('glide', 'GLIDE', 0, 0.3, { unit: 's' }), K('sub', 'SUB OSC', 0, 1), K('gain', 'GAIN', 0, 1),
    ]},
  ],
  smp: [
    { title: 'SAMPLE', items: [
      SEL('sampleId', 'SAMPLE', 'samples'), K('rootMidi', 'ROOT', 24, 96, { step: 1 }),
      K('start', 'START', 0, 0.95), SEL('loop', 'LOOP', [false, true]),
    ]},
    { title: 'SHAPE', items: [
      K('attack', 'ATTACK', 0.001, 1, { log: true, unit: 's' }), K('release', 'RELEASE', 0.01, 2, { unit: 's' }),
      K('cutoff', 'CUTOFF', 100, 20000, { log: true, unit: 'Hz' }), K('gain', 'GAIN', 0, 1),
    ]},
  ],
  drum: [
    { title: 'DRUM', items: [
      SEL('sampleId', 'SAMPLE', 'samples'), K('pitch', 'PITCH', -12, 12, { unit: 'st' }),
      K('decay', 'DECAY', 0.05, 1), K('gain', 'GAIN', 0, 1),
    ]},
  ],
};

export class Editors {
  constructor(app) {
    this.app = app;
    $('#editor-close').onclick = () => $('#editor-overlay').classList.add('hidden');
    $('#fx-close').onclick = () => $('#fx-overlay').classList.add('hidden');
    $('#editor-overlay').onclick = e => { if (e.target.id === 'editor-overlay') $('#editor-overlay').classList.add('hidden'); };
    $('#fx-overlay').onclick = e => { if (e.target.id === 'fx-overlay') $('#fx-overlay').classList.add('hidden'); };
  }

  openInstrument(ch) {
    const app = this.app;
    const Cls = INSTRUMENTS[ch.type];
    const defaults = Cls ? Cls.defaults : {};
    const p = ch.params;
    const get = k => p[k] !== undefined ? p[k] : defaults[k];

    $('#editor-name').value = ch.name;
    $('#editor-name').oninput = e => { ch.name = e.target.value; app.markDirty(); app.rack.render(); app.piano.refreshChannels(); };
    $('#editor-type').textContent = Cls ? Cls.label : ch.type;

    const body = $('#editor-body');
    body.innerHTML = '';
    const sections = INSTRUMENT_UI[ch.type] || [];
    for (const sec of sections) {
      const s = el('div', 'param-section');
      s.appendChild(el('div', 'param-section-title', sec.title));
      const row = el('div', 'param-row');
      for (const item of sec.items) {
        if (item.kind === 'select') {
          const w = el('div', 'knob-wrap');
          const sel = document.createElement('select');
          sel.style.width = '70px'; sel.style.fontSize = '10px';
          let opts = item.options;
          if (opts === 'samples') {
            opts = [...app.engine.samples.values()].map(s => s.id);
            app.engine.ensureCtx();
            opts = [...app.engine.samples.values()].map(s => s.id);
          }
          for (const o of opts) {
            const oe = document.createElement('option');
            oe.value = String(o);
            oe.textContent = opts === item.options ? String(o) : (app.engine.samples.get(o)?.name || o);
            // label with sample names when listing samples
            if (item.options === 'samples') oe.textContent = app.engine.samples.get(o)?.name || o;
            sel.appendChild(oe);
          }
          sel.value = String(get(item.key));
          sel.onchange = () => {
            let v = sel.value;
            if (v === 'true') v = true; else if (v === 'false') v = false;
            p[item.key] = v;
            app.engine.updateChannelParams(ch.id);
            app.markDirty();
            this.previewCh(ch);
          };
          w.append(sel, el('div', 'knob-label', item.label));
          row.appendChild(w);
        } else {
          const knob = makeKnob({
            label: item.label, min: item.min, max: item.max, value: get(item.key),
            log: item.log, step: item.step, unit: item.unit, default: defaults[item.key],
            onChange: v => {
              p[item.key] = v;
              app.engine.updateChannelParams(ch.id);
              app.markDirty();
            },
          });
          row.appendChild(knob);
        }
      }
      s.appendChild(row);
      body.appendChild(s);
    }

    // preview strip
    const prev = el('div', 'param-section');
    prev.appendChild(el('div', 'param-section-title', 'PREVIEW — click a key, or play Z–M on your keyboard'));
    const keys = el('div', 'param-row');
    for (let m = 48; m <= 72; m++) {
      const black = [1, 3, 6, 8, 10].includes(m % 12);
      const k = el('button', '', '');
      Object.assign(k.style, {
        width: '20px', height: black ? '34px' : '52px',
        background: black ? 'var(--bg3)' : 'var(--ink1)',
        border: '1px solid var(--bg0)', borderRadius: '0 0 3px 3px',
        alignSelf: 'flex-start',
      });
      k.onpointerdown = () => app.engine.audition(ch.id, m, 1, 0.5);
      keys.appendChild(k);
    }
    keys.style.gap = '1px';
    prev.appendChild(keys);
    body.appendChild(prev);

    $('#editor-overlay').classList.remove('hidden');
  }

  previewCh(ch) { this.app.engine.audition(ch.id, ch.type === 'b808' ? 36 : 60, 1, 0.3); }

  openFx(trackIdx, fxIdx) {
    const app = this.app;
    const tr = app.project.mixer[trackIdx];
    const fx = tr.effects[fxIdx];
    const def = EFFECTS[fx.type];
    if (!def) return;
    $('#fx-title').textContent = `${tr.name} — ${def.label}`;
    const body = $('#fx-body');
    body.innerHTML = '';
    const row = el('div', 'param-row');
    for (const spec of def.params) {
      const val = fx.params[spec.key] !== undefined ? fx.params[spec.key] : def.defaults[spec.key];
      row.appendChild(makeKnob({
        label: spec.label, min: spec.min, max: spec.max, value: val,
        log: spec.log, step: spec.step, unit: spec.unit, default: def.defaults[spec.key],
        onChange: v => {
          fx.params[spec.key] = v;
          app.engine.updateFxParams(trackIdx, fxIdx);
          app.markDirty();
        },
      }));
    }
    body.appendChild(row);
    $('#fx-overlay').classList.remove('hidden');
  }
}
