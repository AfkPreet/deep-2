// ═══════════════════════════════════════════════
// 寂 JI — browser sidebar: sample pack, presets, drag-drop import
// ═══════════════════════════════════════════════

import { $, el, status } from './ui-common.js';
import { PRESETS } from './synths.js';
import { defaultChannel, uid } from './state.js';

export class BrowserView {
  constructor(app) {
    this.app = app;
    this.sampleList = $('#sample-list');
    this.presetList = $('#preset-list');
    this.dropZone = $('#drop-zone');
    this.bindDrop();
    this.renderPresets();
  }

  renderSamples() {
    this.app.engine.ensureCtx();
    this.sampleList.innerHTML = '';
    for (const s of this.app.engine.samples.values()) {
      const it = el('div', 'b-item');
      it.append(el('span', '', s.name), el('span', 'b-play', '▸'));
      it.title = 'click: preview · double-click: add as drum channel';
      it.onclick = () => this.app.engine.previewSample(s.id);
      it.ondblclick = () => {
        const ch = defaultChannel('drum', s.name, { sampleId: s.id }, 1);
        this.app.project.channels.push(ch);
        this.app.engine.rebuildAll();
        this.app.markDirty();
        this.app.rack.render();
        this.app.piano.refreshChannels();
        status(`added drum channel: ${s.name}`);
      };
      this.sampleList.appendChild(it);
    }
  }

  renderPresets() {
    this.presetList.innerHTML = '';
    for (const pr of PRESETS) {
      const it = el('div', 'b-item');
      it.append(el('span', '', pr.name), el('span', 'b-play', '＋'));
      it.title = 'click: add as new channel';
      it.onclick = () => {
        const ch = defaultChannel(pr.type, pr.name.split('·')[1]?.trim() || pr.name, { ...pr.params }, 1);
        this.app.project.channels.push(ch);
        this.app.selectedChannel = ch.id;
        this.app.engine.rebuildAll();
        this.app.markDirty();
        this.app.rack.render();
        this.app.piano.refreshChannels();
        status(`added ${pr.name}`);
        this.app.engine.audition(ch.id, pr.type === 'b808' ? 36 : 60, 1, 0.4);
      };
      this.presetList.appendChild(it);
    }
  }

  bindDrop() {
    const dz = this.dropZone;
    dz.onclick = () => $('#file-audio').click();
    $('#file-audio').onchange = e => { this.importFiles([...e.target.files]); e.target.value = ''; };
    for (const evt of ['dragover', 'dragenter']) {
      document.body.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('dragover'); });
    }
    document.body.addEventListener('dragleave', e => { if (!e.relatedTarget) dz.classList.remove('dragover'); });
    document.body.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('audio') || /\.(wav|mp3|ogg|flac|m4a|aif+)$/i.test(f.name));
      if (files.length) this.importFiles(files);
    });
  }

  async importFiles(files) {
    this.app.engine.ensureCtx();
    for (const f of files) {
      try {
        const ab = await f.arrayBuffer();
        const buffer = await this.app.engine.ctx.decodeAudioData(ab);
        const id = uid('usr');
        const name = '↑ ' + f.name.replace(/\.[^.]+$/, '').slice(0, 18);
        this.app.engine.addSample(id, name, buffer);
        status(`imported ${f.name} (${buffer.duration.toFixed(2)}s)`);
      } catch (err) {
        status(`could not decode ${f.name}`);
      }
    }
    this.renderSamples();
  }
}
