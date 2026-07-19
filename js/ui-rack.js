// ═══════════════════════════════════════════════
// 寂 JI — channel rack + step sequencer (FL-style home)
// ═══════════════════════════════════════════════

import { $, el, status } from './ui-common.js';
import { currentPattern, defaultChannel, NUM_MIXER } from './state.js';
import { INSTRUMENTS } from './synths.js';

export class RackView {
  constructor(app) {
    this.app = app;               // { project, engine, selectedChannel, openInstrumentEditor(), markDirty() }
    this.root = $('#view-rack');
    this.lastPlayStep = -1;
  }

  render() {
    const { project } = this.app;
    const pat = currentPattern(project);
    this.root.innerHTML = '';
    const stepsLen = pat.bars * 16;

    project.channels.forEach((ch, ci) => {
      const row = el('div', 'rack-row' + (this.app.selectedChannel === ch.id ? ' selected' : ''));
      row.dataset.ch = ch.id;

      const sw = el('div', 'ch-swatch');
      sw.style.background = ch.color;

      const mute = el('button', 'ch-mute' + (ch.mute ? '' : ' on'), '●');
      mute.title = 'channel on/off';
      mute.onclick = () => { ch.mute = !ch.mute; this.app.markDirty(); this.render(); };

      const name = el('div', 'ch-name', ch.name);
      name.title = 'click: edit instrument · select channel';
      name.onclick = () => {
        this.app.selectedChannel = ch.id;
        this.app.openInstrumentEditor(ch);
        this.render();
      };
      name.oncontextmenu = e => {
        e.preventDefault();
        if (confirm(`delete channel "${ch.name}"?`)) {
          project.channels.splice(ci, 1);
          for (const p of project.patterns) { delete p.steps[ch.id]; delete p.notes[ch.id]; }
          if (this.app.selectedChannel === ch.id) this.app.selectedChannel = project.channels[0]?.id || null;
          this.app.engine.rebuildAll?.();
          this.app.markDirty(); this.render();
        }
      };

      const target = el('div', 'ch-target', `▸${ch.mixerTrack}`);
      target.title = 'mixer track — click to cycle';
      target.onclick = () => {
        ch.mixerTrack = ch.mixerTrack % NUM_MIXER + 1;
        target.textContent = `▸${ch.mixerTrack}`;
        this.app.engine.rebuildAll?.();
        this.app.markDirty();
      };

      const steps = el('div', 'steps');
      if (!pat.steps[ch.id] || pat.steps[ch.id].length !== stepsLen) {
        const old = pat.steps[ch.id] || [];
        pat.steps[ch.id] = Array.from({ length: stepsLen }, (_, i) => old[i] || 0);
      }
      const arr = pat.steps[ch.id];
      for (let s = 0; s < stepsLen; s++) {
        const st = el('div', 'step' + (s % 8 < 4 ? ' beat1' : '') + (arr[s] ? ' on' : ''));
        st.dataset.step = s;
        st.style.opacity = arr[s] ? (0.45 + arr[s] * 0.55) : '';
        const setStep = (on) => {
          arr[s] = on ? 1 : 0;
          st.classList.toggle('on', !!on);
          st.style.opacity = on ? 1 : '';
          this.app.markDirty();
        };
        st.onpointerdown = e => {
          e.preventDefault();
          const on = !arr[s];
          setStep(on);
          if (on) this.app.engine.audition(ch.id, 60, 1, 0.2);
          this._paint = on;
        };
        st.onpointerenter = e => { if (e.buttons === 1 && this._paint !== undefined) setStep(this._paint); };
        st.onwheel = e => {
          if (!arr[s]) return;
          e.preventDefault();
          arr[s] = Math.min(1, Math.max(0.1, arr[s] + (e.deltaY < 0 ? 0.1 : -0.1)));
          st.style.opacity = 0.45 + arr[s] * 0.55;
          this.app.markDirty();
        };
        steps.appendChild(st);
        if (s % 4 === 3 && s < stepsLen - 1) steps.appendChild(el('div', 'step-gap')).style.width = '6px';
      }

      row.append(sw, mute, name, target, steps);
      this.root.appendChild(row);
    });
    window.addEventListener('pointerup', () => { this._paint = undefined; }, { once: true });

    const add = el('button', 'rack-add', '＋ add channel');
    add.onclick = () => this.addChannelMenu(add);
    this.root.appendChild(add);
  }

  addChannelMenu(anchor) {
    const types = Object.entries(INSTRUMENTS).map(([t, C]) => ({ t, label: C.label }));
    const menu = el('div');
    Object.assign(menu.style, {
      position: 'fixed', background: 'var(--bg2)', border: '1px solid var(--line)',
      borderRadius: '3px', zIndex: 200, padding: '4px', boxShadow: '0 12px 40px rgba(0,0,0,.5)',
    });
    const r = anchor.getBoundingClientRect();
    menu.style.left = r.left + 'px'; menu.style.top = (r.top - types.length * 30 - 10) + 'px';
    for (const { t, label } of types) {
      const it = el('div', 'b-item', label);
      it.onclick = () => {
        const ch = defaultChannel(t, label.split('·')[1]?.trim() || t, {}, 1);
        this.app.project.channels.push(ch);
        this.app.selectedChannel = ch.id;
        this.app.engine.rebuildAll?.();
        this.app.markDirty(); this.render();
        menu.remove();
        status(`added ${label}`);
      };
      menu.appendChild(it);
    }
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }

  // playhead highlight — called from RAF loop
  tick() {
    const eng = this.app.engine;
    const g = eng.getPosition();
    if (g === null) {
      if (this.lastPlayStep !== -1) { this.clearPlayhead(); this.lastPlayStep = -1; }
      return;
    }
    const pat = currentPattern(this.app.project);
    const local = g % (pat.bars * 16);
    if (local === this.lastPlayStep) return;
    this.clearPlayhead();
    this.root.querySelectorAll(`.step[data-step="${local}"]`).forEach(s => s.classList.add('playing'));
    this.lastPlayStep = local;
  }
  clearPlayhead() {
    this.root.querySelectorAll('.step.playing').forEach(s => s.classList.remove('playing'));
  }
}
