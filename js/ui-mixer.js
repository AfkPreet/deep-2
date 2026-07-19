// ═══════════════════════════════════════════════
// 寂 JI — mixer (Logic-style strips: inserts, sends, fader, meter, M/S)
// strip order on screen: 1..10, RET A, RET B, MASTER
// ═══════════════════════════════════════════════

import { $, el, makeKnob } from './ui-common.js';
import { NUM_MIXER, uid } from './state.js';
import { EFFECTS } from './effects.js';

export class MixerView {
  constructor(app) {
    this.app = app;
    this.root = $('#view-mixer');
    this.meters = [];
  }

  render() {
    this.root.innerHTML = '';
    this.meters = [];
    const order = [];
    for (let i = 1; i <= NUM_MIXER; i++) order.push(i);
    const mixer = this.app.project.mixer;
    for (let i = NUM_MIXER + 1; i < mixer.length; i++) order.push(i);
    order.push(0);
    for (const i of order) this.root.appendChild(this.strip(i));
  }

  strip(i) {
    const app = this.app;
    const tr = app.project.mixer[i];
    const isMaster = i === 0;
    const isReturn = i > NUM_MIXER;
    const s = el('div', 'mx-strip' + (isMaster ? ' master' : ''));

    const name = el('div', 'mx-name', tr.name);
    name.style.cursor = 'pointer';
    name.title = 'double-click to rename';
    name.ondblclick = () => {
      const n = prompt('track name', tr.name);
      if (n) { tr.name = n.toUpperCase().slice(0, 8); this.render(); app.markDirty(); }
    };

    // insert slots
    const fxBox = el('div', 'mx-fx');
    tr.effects.forEach((fx, fi) => {
      const def = EFFECTS[fx.type];
      const slot = el('div', 'mx-fx-slot' + (fx.enabled ? '' : ' off'), def ? def.label : fx.type);
      slot.title = 'click: edit · right-click: menu';
      slot.onclick = () => app.openFxEditor(i, fi);
      slot.oncontextmenu = e => {
        e.preventDefault();
        this.fxMenu(e, tr, fi);
      };
      fxBox.appendChild(slot);
    });
    const add = el('div', 'mx-fx-add', '+ insert');
    add.onclick = e => this.addFxMenu(e, tr, i);
    fxBox.appendChild(add);

    // sends
    const sends = el('div', 'mx-sends');
    if (!isMaster && !isReturn) {
      ['A', 'B'].forEach((label, r) => {
        const k = makeKnob({
          label: `SND ${label}`, min: 0, max: 1, value: tr.sends[r] || 0, size: 22, default: 0,
          onChange: v => { tr.sends[r] = v; app.engine.updateMixer(i); app.markDirty(); },
        });
        sends.appendChild(k);
      });
    }

    // pan
    const panK = makeKnob({
      label: 'PAN', min: -1, max: 1, value: tr.pan, size: 22, default: 0,
      onChange: v => { tr.pan = v; app.engine.updateMixer(i); app.markDirty(); },
    });

    // fader + meter
    const zone = el('div', 'mx-fader-zone');
    const fader = el('div', 'mx-fader');
    const fill = el('div', 'mx-fader-fill');
    const handle = el('div', 'mx-fader-handle');
    fader.append(fill, handle);
    const meter = el('div', 'mx-meter');
    const mFill = el('div', 'mx-meter-fill');
    meter.appendChild(mFill);
    zone.append(fader, meter);
    this.meters.push({ i, mFill });

    const db = el('div', 'mx-db');
    const setFaderUI = () => {
      const pct = tr.volume * 100;
      fill.style.height = pct + '%';
      handle.style.bottom = `calc(${pct}% - 1px)`;
      const d = tr.volume <= 0.001 ? -Infinity : 40 * Math.log10(tr.volume);
      db.textContent = d === -Infinity ? '-∞' : (d >= 0 ? '+' : '') + d.toFixed(1);
    };
    setFaderUI();
    let fd = null;
    fader.addEventListener('pointerdown', e => { fader.setPointerCapture(e.pointerId); fd = { y: e.clientY, v: tr.volume }; });
    fader.addEventListener('pointermove', e => {
      if (!fd) return;
      const h = fader.getBoundingClientRect().height;
      tr.volume = Math.min(1.26, Math.max(0, fd.v + (fd.y - e.clientY) / h));
      setFaderUI();
      app.engine.updateMixer(i);
      app.markDirty();
    });
    fader.addEventListener('pointerup', () => { fd = null; });
    fader.addEventListener('dblclick', () => { tr.volume = 0.8; setFaderUI(); app.engine.updateMixer(i); });

    // mute / solo
    const bottom = el('div', 'mx-bottom');
    if (!isMaster) {
      const m = el('button', 'mx-ms' + (tr.mute ? ' mute-on' : ''), 'M');
      m.onclick = () => { tr.mute = !tr.mute; app.engine.applyMuteSolo(); app.markDirty(); this.render(); };
      bottom.appendChild(m);
      if (!isReturn) {
        const so = el('button', 'mx-ms' + (tr.solo ? ' solo-on' : ''), 'S');
        so.onclick = () => { tr.solo = !tr.solo; app.engine.applyMuteSolo(); app.markDirty(); this.render(); };
        bottom.appendChild(so);
      }
    }

    s.append(name, fxBox, sends, panK, zone, db, bottom);
    return s;
  }

  fxMenu(e, tr, fi) {
    const fx = tr.effects[fi];
    const menu = this.menu(e, [
      [fx.enabled ? 'bypass' : 'enable', () => { fx.enabled = !fx.enabled; this.app.engine.rebuildAll(); this.app.markDirty(); this.render(); }],
      ['move up', () => { if (fi > 0) { [tr.effects[fi - 1], tr.effects[fi]] = [tr.effects[fi], tr.effects[fi - 1]]; this.app.engine.rebuildAll(); this.app.markDirty(); this.render(); } }],
      ['remove', () => { tr.effects.splice(fi, 1); this.app.engine.rebuildAll(); this.app.markDirty(); this.render(); }],
    ]);
  }

  addFxMenu(e, tr, i) {
    const items = Object.entries(EFFECTS).map(([type, def]) => [def.label.toLowerCase(), () => {
      tr.effects.push({ id: uid('fx'), type, params: { ...def.defaults }, enabled: true });
      this.app.engine.rebuildAll();
      this.app.markDirty();
      this.render();
      this.app.openFxEditor(i, tr.effects.length - 1);
    }]);
    this.menu(e, items);
  }

  menu(e, items) {
    const menu = el('div');
    Object.assign(menu.style, {
      position: 'fixed', left: e.clientX + 'px', top: Math.min(e.clientY, window.innerHeight - items.length * 26 - 20) + 'px',
      background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: '3px',
      zIndex: 200, padding: '4px', minWidth: '130px', boxShadow: '0 12px 40px rgba(0,0,0,.5)',
      maxHeight: '70vh', overflowY: 'auto',
    });
    for (const [label, fn] of items) {
      const it = el('div', 'b-item', label);
      it.onclick = () => { fn(); menu.remove(); };
      menu.appendChild(it);
    }
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
    return menu;
  }

  tick() {
    if (!this.root.closest('.view').classList.contains('active')) return;
    for (const { i, mFill } of this.meters) {
      const lvl = this.app.engine.meterLevel(i);
      mFill.style.height = Math.min(100, lvl * 130) + '%';
    }
  }
}
