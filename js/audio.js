/**
 * Web Audio engine v2 — smooth voices, DAW routing, no click pops.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.recordDest = null;
    this.analyser = null;
    this.started = false;
    this.dawInput = null;

    this.waveform = "sine";
    this.volume = 0.7;
    this.freqMin = 0;
    this.freqMax = 1000;
    this.yAmplitude = 1;
    this.voiceCount = 4;

    this.useSample = false;
    this.sampleBuffer = null;
    this.sampleName = "";

    this.voices = [];
    this.pointerVoice = null;
    this._voicePool = [];
  }

  async init() {
    if (this.ctx) return;
    const options = { latencyHint: "interactive" };
    try {
      this.ctx = new AudioContext(options);
    } catch {
      this.ctx = new AudioContext();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;
    this.analyser = this.ctx.createAnalyser();
    this.recordDest = this.ctx.createMediaStreamDestination();

    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.recordDest);
    this._connectOutput(this.masterGain);

    this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    this.started = true;
  }

  _connectOutput(node) {
    node.connect(this.ctx.destination);
  }

  /** Route master bus through DAW (or back to speakers). */
  setDawInput(dawInputNode) {
    if (!this.masterGain) return;
    try {
      this.masterGain.disconnect();
    } catch (_) {}
    this.dawInput = dawInputNode;
    if (dawInputNode) {
      this.masterGain.connect(dawInputNode);
    } else {
      this.masterGain.connect(this.analyser);
      this.masterGain.connect(this.recordDest);
      this._connectOutput(this.masterGain);
    }
  }

  async resume() {
    if (!this.ctx) await this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  setWaveform(w) {
    this.waveform = w;
    for (const voice of this.voices) {
      if (voice.osc) voice.osc.type = w;
    }
    if (this.pointerVoice?.osc) this.pointerVoice.osc.type = w;
  }

  setFreqRange(min, max) {
    this.freqMin = Math.min(min, max);
    this.freqMax = Math.max(min, max);
  }

  posToFreq(nx, ny, axisX, axisY) {
    const dx = nx - axisX;
    const range = 0.5;
    const t = (dx / range + 1) * 0.5;
    const clamped = Math.max(0, Math.min(1, t));
    return this.freqMin + clamped * (this.freqMax - this.freqMin);
  }

  posToAmp(ny, axisY) {
    const dy = Math.abs(ny - axisY);
    const amp = 1 - Math.min(1, dy * 2);
    return 0.08 + amp * this.yAmplitude * 0.4;
  }

  _rampGain(gainNode, target, attackSec = 0.06) {
    const t = this.ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), t + attackSec);
  }

  _muteGain(gainNode, releaseSec = 0.12) {
    const t = this.ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    const v = Math.max(0.0001, gainNode.gain.value);
    gainNode.gain.setValueAtTime(v, t);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + releaseSec);
  }

  createVoice(freq, amp) {
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp), t + 0.06);
    gain.connect(this.masterGain);

    if (this.useSample && this.sampleBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.sampleBuffer;
      src.loop = true;
      src.playbackRate.value = Math.max(0.1, freq / 440);
      src.connect(gain);
      src.start();
      return { gain, src, freq, amp, isSample: true };
    }

    const osc = this.ctx.createOscillator();
    osc.type = this.waveform;
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(gain);
    osc.start();
    return { gain, osc, freq, amp, isSample: false };
  }

  releaseVoice(voice) {
    if (!voice) return;
    this._muteGain(voice.gain, 0.1);
    const stopAt = this.ctx.currentTime + 0.12;
    if (voice.osc) {
      try {
        voice.osc.stop(stopAt);
      } catch (_) {}
    }
    if (voice.src) {
      try {
        voice.src.stop(stopAt);
      } catch (_) {}
    }
    setTimeout(() => {
      try {
        voice.gain.disconnect();
      } catch (_) {}
    }, 150);
  }

  updatePointerSound(nx, ny, axisX, axisY, active) {
    if (!this.started) return;

    if (!active) {
      if (this.pointerVoice) {
        this._muteGain(this.pointerVoice.gain, 0.08);
      }
      return;
    }

    const freq = this.posToFreq(nx, ny, axisX, axisY);
    const amp = this.posToAmp(ny, axisY);

    if (!this.pointerVoice) {
      this.pointerVoice = this.createVoice(freq, amp);
    } else {
      const t = this.ctx.currentTime;
      if (this.pointerVoice.osc) {
        this.pointerVoice.osc.frequency.setTargetAtTime(freq, t, 0.04);
      }
      if (this.pointerVoice.src) {
        this.pointerVoice.src.playbackRate.setTargetAtTime(Math.max(0.1, freq / 440), t, 0.04);
      }
      this._rampGain(this.pointerVoice.gain, amp, 0.04);
    }

    return freq;
  }

  updatePaintVoices(regions, axisX, axisY) {
    if (!this.started) return;

    while (this.voices.length > this.voiceCount) {
      this.releaseVoice(this.voices.pop());
    }

    const used = Math.min(regions.length, this.voiceCount);

    for (let i = 0; i < used; i++) {
      const { nx, ny, intensity } = regions[i];
      const freq = this.posToFreq(nx, ny, axisX, axisY);
      const amp = this.posToAmp(ny, axisY) * Math.min(1, intensity);

      if (i < this.voices.length) {
        const v = this.voices[i];
        const t = this.ctx.currentTime;
        if (v.osc) v.osc.frequency.setTargetAtTime(freq, t, 0.06);
        if (v.src) v.src.playbackRate.setTargetAtTime(Math.max(0.1, freq / 440), t, 0.06);
        this._rampGain(v.gain, amp, 0.05);
      } else {
        this.voices.push(this.createVoice(freq, amp));
      }
    }

    while (this.voices.length > used) {
      this.releaseVoice(this.voices.pop());
    }
  }

  async loadSample(file) {
    await this.resume();
    const arrayBuffer = await file.arrayBuffer();
    this.sampleBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.useSample = true;
    this.sampleName = file.name;
    return this.sampleName;
  }

  useToneGenerator() {
    this.useSample = false;
    this.sampleName = "";
    for (const v of [...this.voices, this.pointerVoice]) this.releaseVoice(v);
    this.voices = [];
    this.pointerVoice = null;
  }

  getAudioStream() {
    return this.recordDest?.stream ?? null;
  }

  getContext() {
    return this.ctx;
  }

  getMasterGain() {
    return this.masterGain;
  }

  getSampleRate() {
    return this.ctx?.sampleRate ?? 48000;
  }
}
