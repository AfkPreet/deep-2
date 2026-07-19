// ═══════════════════════════════════════════════
// 寂 JI — shared UI widgets (knobs, helpers)
// ═══════════════════════════════════════════════

export const $ = s => document.querySelector(s);
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function fmtVal(v, spec) {
  const unit = spec.unit || '';
  let s;
  if (Math.abs(v) >= 1000) s = (v / 1000).toFixed(1) + 'k';
  else if (Math.abs(v) >= 10) s = v.toFixed(1);
  else s = v.toFixed(2);
  return s.replace(/\.?0+$/, '') + unit;
}

// SVG arc knob. spec: {label, min, max, value, log, step, unit, onChange, size}
export function makeKnob(spec) {
  const wrap = el('div', 'knob-wrap');
  const size = spec.size || 34;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'knob' + (size < 30 ? ' small' : ''));
  svg.setAttribute('viewBox', '0 0 40 40');
  const track = document.createElementNS(svgNS, 'path');
  track.setAttribute('stroke', 'var(--line)');
  const arc = document.createElementNS(svgNS, 'path');
  arc.setAttribute('stroke', 'var(--accent)');
  for (const p of [track, arc]) {
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-width', '2.5');
    p.setAttribute('stroke-linecap', 'round');
  }
  const dot = document.createElementNS(svgNS, 'line');
  dot.setAttribute('stroke', 'var(--ink0)');
  dot.setAttribute('stroke-width', '2');
  svg.append(track, arc, dot);

  const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25; // 270° sweep
  const polar = (a, r) => [20 + Math.cos(a) * r, 20 + Math.sin(a) * r];
  const arcPath = (a0, a1) => {
    const [x0, y0] = polar(a0, 15), [x1, y1] = polar(a1, 15);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A 15 15 0 ${large} 1 ${x1} ${y1}`;
  };
  track.setAttribute('d', arcPath(A0, A1));

  let value = spec.value;
  const toNorm = v => spec.log
    ? Math.log(v / spec.min) / Math.log(spec.max / spec.min)
    : (v - spec.min) / (spec.max - spec.min);
  const fromNorm = n => {
    let v = spec.log ? spec.min * Math.pow(spec.max / spec.min, n) : spec.min + n * (spec.max - spec.min);
    if (spec.step) v = Math.round(v / spec.step) * spec.step;
    return Math.min(spec.max, Math.max(spec.min, v));
  };

  const valEl = el('div', 'knob-val');
  function draw() {
    const n = Math.min(1, Math.max(0, toNorm(value)));
    const a = A0 + n * (A1 - A0);
    if (n > 0.004) { arc.setAttribute('d', arcPath(A0, a)); arc.setAttribute('visibility', 'visible'); }
    else arc.setAttribute('visibility', 'hidden');
    const [x0, y0] = polar(a, 8), [x1, y1] = polar(a, 14);
    dot.setAttribute('x1', x0); dot.setAttribute('y1', y0);
    dot.setAttribute('x2', x1); dot.setAttribute('y2', y1);
    valEl.textContent = fmtVal(value, spec);
  }
  draw();

  let dragY = null, dragStart = 0;
  svg.addEventListener('pointerdown', e => {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    dragY = e.clientY; dragStart = toNorm(value);
  });
  svg.addEventListener('pointermove', e => {
    if (dragY === null) return;
    const dn = (dragY - e.clientY) / 150 * (e.shiftKey ? 0.15 : 1);
    value = fromNorm(Math.min(1, Math.max(0, dragStart + dn)));
    draw();
    spec.onChange(value);
  });
  svg.addEventListener('pointerup', () => { dragY = null; });
  svg.addEventListener('dblclick', () => {
    if (spec.default !== undefined) { value = spec.default; draw(); spec.onChange(value); }
  });

  wrap.append(svg, el('div', 'knob-label', spec.label), valEl);
  wrap.setValue = v => { value = v; draw(); };
  return wrap;
}

export function status(msg) {
  const s = document.getElementById('status-msg');
  if (s) s.textContent = msg;
}

export function confirmDlg(msg) { return window.confirm(msg); }
