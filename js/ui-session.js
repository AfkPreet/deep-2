// ═══════════════════════════════════════════════
// 寂 JI — session view (Ableton-style clip grid)
// columns = 8 slots · rows = scenes · cells hold patterns
// ═══════════════════════════════════════════════

import { $, el, status } from './ui-common.js';
import { SESSION_SCENES } from './state.js';

const COLS = 8;

export class SessionView {
  constructor(app) {
    this.app = app;
    this.root = $('#view-session');
    app.engine.onSessionChange = () => this.render();
  }

  render() {
    const { project, engine } = this.app;
    this.root.innerHTML = '';
    const grid = el('div', 'sess-grid');
    grid.style.gridTemplateColumns = `repeat(${COLS}, 120px) 44px`;

    // headers
    for (let c = 0; c < COLS; c++) grid.appendChild(el('div', 'sess-head', `SLOT ${c + 1}`));
    grid.appendChild(el('div', 'sess-head', ''));

    project.scenes.forEach((scene, si) => {
      for (let c = 0; c < COLS; c++) {
        const pid = scene.clips[c] || null;
        const pat = pid ? project.patterns.find(p => p.id === pid) : null;
        const active = engine.session.active[c];
        const queued = engine.session.queued[c];
        let cls = 'sess-cell';
        if (pat) cls += ' filled';
        if (pat && active && active.patternId === pid) cls += ' playing';
        if (pat && queued === pid) cls += ' queued';
        const cell = el('div', cls, pat ? pat.name : '');
        cell.title = pat
          ? 'click: launch (quantized to bar) · right-click: clear'
          : 'right-click: assign a pattern';
        cell.onclick = () => {
          if (pat) {
            engine.launchCell(c, pid);
            status(`queued ${pat.name} → slot ${c + 1}`);
            this.render();
          }
        };
        cell.oncontextmenu = e => {
          e.preventDefault();
          this.assignMenu(e, scene, c);
        };
        grid.appendChild(cell);
      }
      // scene launch
      const sc = el('div', 'sess-scene', '▸');
      sc.title = `launch ${scene.name}`;
      sc.onclick = () => {
        let launched = 0;
        for (let c = 0; c < COLS; c++) {
          if (scene.clips[c]) { engine.launchCell(c, scene.clips[c]); launched++; }
          else engine.stopCell(c);
        }
        status(launched ? `launching ${scene.name}` : `${scene.name} is empty`);
        this.render();
      };
      grid.appendChild(sc);
    });

    // stop row
    for (let c = 0; c < COLS; c++) {
      const stop = el('div', 'sess-cell sess-stop', '■');
      stop.title = 'stop this slot';
      stop.onclick = () => { this.app.engine.stopCell(c); this.render(); };
      grid.appendChild(stop);
    }
    const stopAll = el('div', 'sess-scene', '■');
    stopAll.title = 'stop all';
    stopAll.onclick = () => { this.app.engine.stopAllCells(); this.render(); };
    grid.appendChild(stopAll);

    this.root.appendChild(grid);
    this.root.appendChild(el('div', 'dim-label sess-note',
      'right-click a cell to assign a pattern · click to launch (quantized to the next bar) · ▸ launches a whole scene'));
  }

  assignMenu(e, scene, col) {
    const menu = el('div');
    Object.assign(menu.style, {
      position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px',
      background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: '3px',
      zIndex: 200, padding: '4px', minWidth: '140px', boxShadow: '0 12px 40px rgba(0,0,0,.5)',
    });
    const none = el('div', 'b-item', '— empty —');
    none.onclick = () => { delete scene.clips[col]; this.app.markDirty(); this.render(); menu.remove(); };
    menu.appendChild(none);
    for (const pat of this.app.project.patterns) {
      const it = el('div', 'b-item', pat.name);
      it.onclick = () => { scene.clips[col] = pat.id; this.app.markDirty(); this.render(); menu.remove(); };
      menu.appendChild(it);
    }
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }
}
