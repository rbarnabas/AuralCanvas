/**
 * Mini-DAW v2 — multitrack timeline, mixer, FX, hi-res export.
 */

const FX_DEFAULTS = {
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  compThreshold: -24,
  compRatio: 4,
  reverb: 0,
  echo: 0,
  echoTime: 0.35,
};

function makeTrack(id, name) {
  return {
    id,
    name,
    volume: 0.85,
    pan: 0,
    mute: false,
    solo: false,
    armed: id === 0,
    clips: [],
    fx: { ...FX_DEFAULTS },
    _liveChunks: null,
    _liveRecorder: null,
    _liveStart: 0,
  };
}

export class MiniDAW {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.enabled = false;
    this.poppedOut = false;
    this.tracks = [0, 1, 2, 3].map((i) => makeTrack(i, `track ${i + 1}`));
    this.playhead = 0;
    this.timelineDuration = 60;
    this.pxPerSec = 72;

    this.input = null;
    this.masterGain = null;
    this.masterPan = null;
    this.recordDest = null;
    this.trackNodes = new Map();
    this._liveDest = null;
    this._liveRecorder = null;
    this._liveChunks = [];
    this._armedTrackId = 0;
    this.exportSampleRate = 48000;
    this.exportBitDepth = 24;
  }

  async init() {
    await this.audio.resume();
    const ctx = this.audio.getContext();
    this.input = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.masterPan = ctx.createStereoPanner();
    this.recordDest = ctx.createMediaStreamDestination();

    this.masterGain.connect(this.masterPan);
    this.masterPan.connect(ctx.destination);
    this.masterPan.connect(this.recordDest);

    for (const track of this.tracks) {
      this._buildTrackNodes(track);
    }
    this.input.connect(this.masterGain);
    this._updateMix();
  }

  getRecordStream() {
    return this.recordDest?.stream ?? null;
  }

  getArmedTrack() {
    return this.tracks.find((t) => t.armed) || this.tracks[0];
  }

  _buildTrackNodes(track) {
    const ctx = this.audio.getContext();
    const input = ctx.createGain();
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 120;
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1200;
    eqMid.Q.value = 1;
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 6000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = track.fx.compThreshold;
    comp.ratio.value = track.fx.compRatio;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    const dry = ctx.createGain();
    const reverbSend = ctx.createGain();
    const reverbConv = ctx.createConvolver();
    reverbConv.buffer = this._makeImpulse(2.5, 2);
    reverbConv.normalize = true;
    const reverbReturn = ctx.createGain();
    const echoDelay = ctx.createDelay(1.5);
    echoDelay.delayTime.value = track.fx.echoTime;
    const echoFeedback = ctx.createGain();
    echoFeedback.gain.value = 0.35;
    const echoWet = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const gain = ctx.createGain();

    input.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(comp);
    comp.connect(dry);
    dry.connect(pan);
    comp.connect(reverbSend);
    reverbSend.connect(reverbConv);
    reverbConv.connect(reverbReturn);
    reverbReturn.connect(pan);
    comp.connect(echoDelay);
    echoDelay.connect(echoFeedback);
    echoFeedback.connect(echoDelay);
    echoDelay.connect(echoWet);
    echoWet.connect(pan);
    pan.connect(gain);
    gain.connect(this.masterGain);

    this.trackNodes.set(track.id, {
      input,
      eqLow,
      eqMid,
      eqHigh,
      comp,
      dry,
      reverbSend,
      reverbReturn,
      echoDelay,
      echoFeedback,
      echoWet,
      pan,
      gain,
    });
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.audio.getContext();
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const impulse = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this._routeCanvasToArmed();
    } else {
      this.audio.setDawInput(null);
      this.stopLiveCapture();
    }
  }

  _routeCanvasToArmed() {
    const track = this.getArmedTrack();
    const nodes = this.trackNodes.get(track.id);
    if (nodes) this.audio.setDawInput(nodes.input);
  }

  armTrack(id) {
    this._armedTrackId = id;
    for (const t of this.tracks) t.armed = t.id === id;
    if (this.enabled) this._routeCanvasToArmed();
    this.renderUI();
  }

  updateTrack(id, patch) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return;
    Object.assign(track, patch);
    if (patch.fx) Object.assign(track.fx, patch.fx);
    this._applyTrackParams(track);
    this._updateMix();
    this.renderUI();
  }

  _applyTrackParams(track) {
    const n = this.trackNodes.get(track.id);
    if (!n) return;
    const fx = track.fx;
    n.eqLow.gain.value = fx.eqLow;
    n.eqMid.gain.value = fx.eqMid;
    n.eqHigh.gain.value = fx.eqHigh;
    n.comp.threshold.value = fx.compThreshold;
    n.comp.ratio.value = fx.compRatio;
    n.reverbSend.gain.value = fx.reverb * 0.6;
    n.reverbReturn.gain.value = fx.reverb * 0.5;
    n.echoWet.gain.value = fx.echo * 0.45;
    n.echoDelay.delayTime.value = fx.echoTime;
    n.pan.pan.value = track.pan;
    n.gain.gain.value = track.mute ? 0 : track.volume;
  }

  _updateMix() {
    const solo = this.tracks.some((t) => t.solo);
    for (const track of this.tracks) {
      const n = this.trackNodes.get(track.id);
      if (!n) continue;
      let vol = track.volume;
      if (track.mute) vol = 0;
      else if (solo && !track.solo) vol = 0;
      n.gain.gain.setTargetAtTime(vol, this.audio.getContext().currentTime, 0.02);
      this._applyTrackParams(track);
    }
  }

  /** Route live canvas audio into armed track while recording. */
  startLiveCapture() {
    if (!this.enabled) return null;
    const ctx = this.audio.getContext();
    const track = this.getArmedTrack();
    const nodes = this.trackNodes.get(track.id);
    if (!nodes) return null;

    this._liveDest = ctx.createMediaStreamDestination();
    nodes.gain.connect(this._liveDest);

    this._liveChunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this._liveRecorder = new MediaRecorder(this._liveDest.stream, { mimeType: mime });
    this._liveRecorder.ondataavailable = (e) => {
      if (e.data.size) this._liveChunks.push(e.data);
    };
    this._liveRecorder.start(100);
    track._liveStart = this.playhead;
    return track.id;
  }

  async stopLiveCapture() {
    if (!this._liveRecorder) return null;
    const track = this.getArmedTrack();

    return new Promise((resolve) => {
      this._liveRecorder.onstop = async () => {
        try {
          const blob = new Blob(this._liveChunks, { type: this._liveRecorder.mimeType });
          const buf = await this._decodeBlob(blob);
          if (buf) {
            track.clips.push({
              id: `${Date.now()}`,
              name: `canvas ${track.clips.length + 1}`,
              start: track._liveStart,
              buffer: buf,
              duration: buf.duration,
            });
            this.timelineDuration = Math.max(
              this.timelineDuration,
              track._liveStart + buf.duration + 2
            );
          }
        } catch (e) {
          console.error(e);
        }
        this._liveRecorder = null;
        this._liveChunks = [];
        this._liveDest = null;
        this.renderUI();
        resolve(track);
      };
      this._liveRecorder.stop();
    });
  }

  async _decodeBlob(blob) {
    const ctx = this.audio.getContext();
    return ctx.decodeAudioData(await blob.arrayBuffer());
  }

  renderUI() {
    const timeline = document.getElementById("daw-timeline");
    const mixer = document.getElementById("daw-mixer");
    if (!timeline || !mixer) return;

    mixer.innerHTML = "";
    for (const track of this.tracks) {
      const strip = document.createElement("div");
      strip.className = "daw-strip" + (track.armed ? " armed" : "");
      strip.innerHTML = `
        <button type="button" class="daw-arm" data-id="${track.id}" title="arm">${track.armed ? "●" : "○"}</button>
        <span class="daw-track-name">${track.name}</span>
        <label class="daw-mini">vol<input type="range" min="0" max="1" step="0.01" value="${track.volume}" data-id="${track.id}" data-param="volume"/></label>
        <label class="daw-mini">pan<input type="range" min="-1" max="1" step="0.01" value="${track.pan}" data-id="${track.id}" data-param="pan"/></label>
        <label class="daw-mini">eq<input type="range" min="-12" max="12" step="0.5" value="${track.fx.eqMid}" data-id="${track.id}" data-fx="eqMid"/></label>
        <label class="daw-mini">comp<input type="range" min="1" max="12" step="0.5" value="${track.fx.compRatio}" data-id="${track.id}" data-fx="compRatio"/></label>
        <label class="daw-mini">verb<input type="range" min="0" max="1" step="0.01" value="${track.fx.reverb}" data-id="${track.id}" data-fx="reverb"/></label>
        <label class="daw-mini">echo<input type="range" min="0" max="1" step="0.01" value="${track.fx.echo}" data-id="${track.id}" data-fx="echo"/></label>
        <button type="button" class="daw-mute" data-id="${track.id}">${track.mute ? "m" : "—"}</button>
        <button type="button" class="daw-solo" data-id="${track.id}">${track.solo ? "s" : "—"}</button>
      `;
      mixer.appendChild(strip);
    }

    timeline.innerHTML = "";
    const width = this.timelineDuration * this.pxPerSec;
    timeline.style.width = `${width}px`;
    for (const track of this.tracks) {
      const row = document.createElement("div");
      row.className = "daw-track-row";
      for (const clip of track.clips) {
        const el = document.createElement("div");
        el.className = "daw-clip";
        el.style.left = `${clip.start * this.pxPerSec}px`;
        el.style.width = `${Math.max(24, clip.duration * this.pxPerSec)}px`;
        el.textContent = clip.name;
        row.appendChild(el);
      }
      timeline.appendChild(row);
    }

    mixer.querySelectorAll("[data-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const id = +e.target.dataset.id;
        if (e.target.classList.contains("daw-arm")) this.armTrack(id);
        if (e.target.classList.contains("daw-mute")) {
          const t = this.tracks.find((x) => x.id === id);
          this.updateTrack(id, { mute: !t.mute });
        }
        if (e.target.classList.contains("daw-solo")) {
          const t = this.tracks.find((x) => x.id === id);
          this.updateTrack(id, { solo: !t.solo });
        }
      });
      el.addEventListener("input", (e) => {
        const id = +e.target.dataset.id;
        const v = +e.target.value;
        if (e.target.dataset.param) this.updateTrack(id, { [e.target.dataset.param]: v });
        if (e.target.dataset.fx) {
          const t = this.tracks.find((x) => x.id === id);
          this.updateTrack(id, { fx: { ...t.fx, [e.target.dataset.fx]: v } });
        }
      });
    });
  }

  async exportMix(format = "wav") {
    const sr = this.exportSampleRate;
    const duration = this.timelineDuration;
    const offline = new OfflineAudioContext(2, sr * duration, sr);

    const master = offline.createGain();
    master.connect(offline.destination);

    for (const track of this.tracks) {
      if (track.mute) continue;
      const tg = offline.createGain();
      tg.gain.value = track.volume;
      const pan = offline.createStereoPanner();
      pan.pan.value = track.pan;
      tg.connect(pan);
      pan.connect(master);

      for (const clip of track.clips) {
        const src = offline.createBufferSource();
        src.buffer = clip.buffer;
        src.connect(tg);
        src.start(clip.start);
      }
    }

    const rendered = await offline.startRendering();
    if (format === "wav") return this._bufferToWav(rendered, this.exportBitDepth);
    return rendered;
  }

  _bufferToWav(buffer, bitDepth = 24) {
    const numCh = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);
    const writeStr = (o, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    const ch = [];
    for (let c = 0; c < numCh; c++) ch.push(buffer.getChannelData(c));
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, ch[c][i]));
        if (bitDepth === 24) {
          const v = s < 0 ? s * 0x800000 : s * 0x7fffff;
          view.setUint8(offset, v & 0xff);
          view.setUint8(offset + 1, (v >> 8) & 0xff);
          view.setUint8(offset + 2, (v >> 16) & 0xff);
          offset += 3;
        } else {
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          offset += 2;
        }
      }
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
