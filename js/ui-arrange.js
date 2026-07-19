// ═══════════════════════════════════════════════
// 寂 JI — arrangement timeline (Logic-style) + automation lanes
// ═══════════════════════════════════════════════

import { $, el, status } from './ui-common.js';
import { uid, NUM_MIXER } from './state.js';

const BAR_W = 72;
const LANE_H = 44;
const RULER_H = 26;
const HEAD_W = 70;
const AUTO_H = 90;
const TOTAL_BARS = 64;

export class ArrangeView {
  constructor(app) {
    this.app = app;
    this.canvas = $('#ar-canvas');
    this.c = this.canvas.getContext('2d');
    this.patSel = $('#ar-pattern');
    this.autoSel = $('#ar-autotarget');
    this.showAuto = false;
    this.drag = null;
    $('#ar-autoshow').onclick = () => {
      this.showAuto = !this.showAuto;
      $('#ar-autoshow').textContent = this.showAuto ? 'HIDE LANE' : 'SHOW LANE';
      this.render();
    };
    this.bindEvents();
  }

  refreshSelectors() {
    const cur = this.patSel.value;
    this.patSel.innerHTML = '';
    for (const p of this.app.project.patterns) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      this.patSel.appendChild(o);
    }
    if (cur) this.patSel.value = cur;

    const curA = this.autoSel.value;
    this.autoSel.innerHTML = '';
    const mk = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; this.autoSel.appendChild(o); };
    mk('mix.0.volume', 'master · volume');
    for (let i = 1; i <= NUM_MIXER; i++) {
      mk(`mix.${i}.volume`, `${this.app.project.mixer[i].name.toLowerCase()} · volume`);
      mk(`mix.${i}.pan`, `${this.app.project.mixer[i].name.toLowerCase()} · pan`);
    }
    if (curA) this.autoSel.value = curA;
  }

  lanes() { return this.app.project.arrangement.lanes; }
  autoLane() {
    const target = this.autoSel.value;
    let lane = this.app.project.arrangement.automation.find(a => a.target === target);
    if (!lane) { lane = { target, points: [] }; this.app.project.arrangement.automation.push(lane); }
    return lane;
  }

  height() { return RULER_H + this.lanes() * LANE_H + (this.showAuto ? AUTO_H : 0); }

  render() {
    this.canvas.width = HEAD_W + TOTAL_BARS * BAR_W;
    this.canvas.height = this.height();
    const c = this.c;
    const W = this.canvas.width, H = this.canvas.height;
    const css = getComputedStyle(document.documentElement);
    const col = n => css.getPropertyValue(n).trim();

    c.fillStyle = col('--bg0'); c.fillRect(0, 0, W, H);

    // ruler
    c.fillStyle = col('--bg1'); c.fillRect(0, 0, W, RULER_H);
    c.font = '10px monospace';
    for (let b = 0; b < TOTAL_BARS; b++) {
      const x = HEAD_W + b * BAR_W;
      c.fillStyle = b % 4 === 0 ? col('--ink1') : col('--ink2');
      if (b % 4 === 0) c.fillText(b + 1, x + 5, 17);
      c.fillRect(x, b % 4 === 0 ? 6 : 14, 1, RULER_H);
    }

    // lanes
    for (let l = 0; l < this.lanes(); l++) {
      const y = RULER_H + l * LANE_H;
      c.fillStyle = l % 2 ? '#101113' : '#121316';
      c.fillRect(HEAD_W, y, W, LANE_H);
      c.fillStyle = col('--bg1'); c.fillRect(0, y, HEAD_W, LANE_H);
      c.fillStyle = col('--ink2'); c.font = '9px monospace';
      c.fillText(`LANE ${l + 1}`, 8, y + 26);
      c.fillStyle = '#1a1c1f'; c.fillRect(0, y + LANE_H - 1, W, 1);
    }
    // bar grid over lanes
    for (let b = 0; b <= TOTAL_BARS; b++) {
      const x = HEAD_W + b * BAR_W;
      c.fillStyle = b % 4 === 0 ? '#26292d' : '#191b1e';
      c.fillRect(x, RULER_H, 1, this.lanes() * LANE_H);
    }

    // clips
    for (const clip of this.app.project.arrangement.clips) {
      const pat = this.app.project.patterns.find(p => p.id === clip.patternId);
      const x = HEAD_W + clip.start * BAR_W;
      const y = RULER_H + clip.lane * LANE_H;
      const w = clip.length * BAR_W;
      c.fillStyle = col('--bg2');
      c.fillRect(x + 1, y + 4, w - 2, LANE_H - 8);
      c.strokeStyle = col('--accent-dim');
      c.strokeRect(x + 1.5, y + 4.5, w - 3, LANE_H - 9);
      c.fillStyle = col('--accent');
      c.fillRect(x + 1, y + 4, 3, LANE_H - 8);
      c.fillStyle = col('--ink0'); c.font = '10px sans-serif';
      c.save();
      c.beginPath(); c.rect(x + 6, y, w - 10, LANE_H); c.clip();
      c.fillText(pat ? pat.name : '?', x + 9, y + 24);
      c.restore();
      // pattern-loop tick marks inside the clip
      if (pat) {
        c.fillStyle = '#26292d';
        for (let bb = pat.bars; bb < clip.length; bb += pat.bars) {
          c.fillRect(x + bb * BAR_W, y + 6, 1, LANE_H - 12);
        }
      }
    }

    // automation lane
    if (this.showAuto) {
      const ay = RULER_H + this.lanes() * LANE_H;
      c.fillStyle = '#0e0f11'; c.fillRect(0, ay, W, AUTO_H);
      c.fillStyle = col('--bg1'); c.fillRect(0, ay, HEAD_W, AUTO_H);
      c.fillStyle = col('--ink2'); c.font = '8px monospace';
      c.fillText('AUTO', 8, ay + 20);
      const opt = this.autoSel.selectedOptions[0];
      if (opt) c.fillText(opt.textContent.slice(0, 9), 8, ay + 32);
      const lane = this.autoLane();
      const pts = [...lane.points].sort((a, b) => a.bar - b.bar);
      c.strokeStyle = col('--accent'); c.lineWidth = 1.5;
      c.beginPath();
      if (pts.length) {
        pts.forEach((p, i) => {
          const x = HEAD_W + p.bar * BAR_W;
          const y = ay + 8 + (1 - p.val) * (AUTO_H - 16);
          if (i === 0) { c.moveTo(HEAD_W, y); c.lineTo(x, y); }
          c.lineTo(x, y);
        });
        const last = pts[pts.length - 1];
        c.lineTo(W, ay + 8 + (1 - last.val) * (AUTO_H - 16));
      } else {
        c.moveTo(HEAD_W, ay + AUTO_H / 2); c.lineTo(W, ay + AUTO_H / 2);
      }
      c.stroke();
      c.fillStyle = col('--accent');
      for (const p of pts) {
        const x = HEAD_W + p.bar * BAR_W;
        const y = ay + 8 + (1 - p.val) * (AUTO_H - 16);
        c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill();
      }
    }

    // playhead
    const g = this.app.engine.getPosition();
    if (g !== null && this.app.engine.mode === 'song') {
      const x = HEAD_W + (g / 16) * BAR_W;
      c.fillStyle = col('--ink0'); c.globalAlpha = 0.5;
      c.fillRect(x, 0, 2, H); c.globalAlpha = 1;
    }
  }

  hitClip(x, y) {
    const bar = (x - HEAD_W) / BAR_W;
    const lane = Math.floor((y - RULER_H) / LANE_H);
    const clips = this.app.project.arrangement.clips;
    for (let i = clips.length - 1; i >= 0; i--) {
      const cl = clips[i];
      if (cl.lane === lane && bar >= cl.start && bar <= cl.start + cl.length) {
        return { clip: cl, idx: i, edge: bar > cl.start + cl.length - 0.3 };
      }
    }
    return null;
  }

  bindEvents() {
    const pos = e => {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    this.canvas.addEventListener('pointerdown', e => {
      const [x, y] = pos(e);
      const inAuto = this.showAuto && y > RULER_H + this.lanes() * LANE_H;

      if (inAuto) {
        const ay = RULER_H + this.lanes() * LANE_H;
        const bar = Math.max(0, Math.round(((x - HEAD_W) / BAR_W) * 4) / 4);
        const val = Math.min(1, Math.max(0, 1 - (y - ay - 8) / (AUTO_H - 16)));
        const lane = this.autoLane();
        if (e.button === 2) {
          const idx = lane.points.findIndex(p => Math.abs(p.bar - bar) < 0.3);
          if (idx >= 0) lane.points.splice(idx, 1);
        } else {
          const ex = lane.points.find(p => Math.abs(p.bar - bar) < 0.25);
          if (ex) { ex.val = val; } else { lane.points.push({ bar, val }); }
          lane.points.sort((a, b) => a.bar - b.bar);
        }
        this.app.markDirty(); this.render();
        return;
      }

      if (y < RULER_H || x < HEAD_W) return;
      const lane = Math.floor((y - RULER_H) / LANE_H);
      if (lane >= this.lanes()) return;
      const hit = this.hitClip(x, y);

      if (e.button === 2) {
        if (hit) { this.app.project.arrangement.clips.splice(hit.idx, 1); this.app.markDirty(); this.render(); }
        return;
      }
      this.canvas.setPointerCapture(e.pointerId);
      if (hit && hit.edge) {
        this.drag = { kind: 'resize', clip: hit.clip };
      } else if (hit) {
        this.drag = { kind: 'move', clip: hit.clip, x0: x, y0: y, s0: hit.clip.start, l0: hit.clip.lane };
      } else {
        const pid = this.patSel.value || this.app.project.patterns[0]?.id;
        if (!pid) return;
        const pat = this.app.project.patterns.find(p => p.id === pid);
        const start = Math.floor((x - HEAD_W) / BAR_W);
        const clip = { id: uid('cl'), patternId: pid, lane, start, length: pat ? pat.bars : 1 };
        this.app.project.arrangement.clips.push(clip);
        this.drag = { kind: 'resize', clip };
        this.app.markDirty(); this.render();
      }
    });

    this.canvas.addEventListener('pointermove', e => {
      const [x, y] = pos(e);
      if (!this.drag) {
        const overAuto = this.showAuto && y > RULER_H + this.lanes() * LANE_H;
        const hit = !overAuto && y > RULER_H && this.hitClip(x, y);
        this.canvas.style.cursor = hit ? (hit.edge ? 'ew-resize' : 'move') : 'crosshair';
        return;
      }
      const d = this.drag;
      if (d.kind === 'resize') {
        const endBar = Math.max(d.clip.start + 1, Math.ceil((x - HEAD_W) / BAR_W));
        d.clip.length = endBar - d.clip.start;
      } else {
        const db = Math.round((x - d.x0) / BAR_W);
        const dl = Math.floor((y - RULER_H) / LANE_H) - d.l0;
        d.clip.start = Math.max(0, d.s0 + db);
        d.clip.lane = Math.min(this.lanes() - 1, Math.max(0, d.l0 + dl));
      }
      this.app.markDirty(); this.render();
    });

    this.canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.autoSel.addEventListener('change', () => this.render());
  }
}
