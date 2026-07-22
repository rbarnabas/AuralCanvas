/**
 * Recording and export v2 — WebM, MP4, 4K upscale, WAV, MP3, DAW routing.
 */

const UHD = { w: 3840, h: 2160 };

export class Recorder {
  constructor(audioEngine, canvas) {
    this.audio = audioEngine;
    this.canvas = canvas;
    this.daw = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.recording = false;
    this.lastBlob = null;
    this.lastAudioBuffer = null;
    this.audioChunks = [];
    this.audioRecorder = null;
    this._exportStatusEl = null;
  }

  setDaw(daw) {
    this.daw = daw;
  }

  setExportStatusEl(el) {
    this._exportStatusEl = el;
  }

  _status(msg) {
    if (this._exportStatusEl) this._exportStatusEl.textContent = msg;
  }

  async start({ useDaw = false } = {}) {
    await this.audio.resume();

    if (useDaw && this.daw?.enabled) {
      this.daw.startLiveCapture();
      this.recording = true;
      return;
    }

    const fps = 30;
    const videoStream = this.canvas.captureStream(fps);

    let audioStream = null;
    audioStream = this.audio.getAudioStream();

    const tracks = [...videoStream.getVideoTracks()];
    if (audioStream) tracks.push(...audioStream.getAudioTracks());
    const combined = new MediaStream(tracks);

    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(combined, {
      mimeType: mime,
      videoBitsPerSecond: 8_000_000,
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(200);
    this.recording = true;

    if (!useDaw || !this.daw?.enabled) {
      this.audioChunks = [];
      const ctx = this.audio.getContext();
      const dest = ctx.createMediaStreamDestination();
      this.audio.getMasterGain().connect(dest);
      const audioMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      this.audioRecorder = new MediaRecorder(dest.stream, { mimeType: audioMime });
      this.audioRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };
      this.audioRecorder.start(200);
    }
  }

  async stop({ useDaw = false } = {}) {
    if (!this.recording) return null;

    if (useDaw && this.daw?.enabled) {
      this.recording = false;
      await this.daw.stopLiveCapture();
      return null;
    }

    return new Promise((resolve) => {
      const finish = async () => {
        this.recording = false;

        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
        this.lastBlob = blob;

        if (this.audioChunks.length) {
          const audioBlob = new Blob(this.audioChunks, { type: this.audioRecorder.mimeType });
          this.lastAudioBuffer = await this.decodeAudioBlob(audioBlob);
        }

        resolve(blob);
      };

      this.mediaRecorder.onstop = finish;
      this.mediaRecorder.stop();
      if (this.audioRecorder?.state === "recording") this.audioRecorder.stop();
    });
  }

  async decodeAudioBlob(blob) {
    const ctx = this.audio.getContext();
    try {
      return await ctx.decodeAudioData(await blob.arrayBuffer());
    } catch {
      return null;
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  exportWebM() {
    if (!this.lastBlob) return;
    this.downloadBlob(this.lastBlob, `aural-canvas-${Date.now()}.webm`);
  }

  async _loadFfmpeg() {
    const { FFmpeg } = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm");
    const { fetchFile, toBlobURL } = await import(
      "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm"
    );
    const ffmpeg = new FFmpeg();
    const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return { ffmpeg, fetchFile };
  }

  async exportMP4() {
    if (!this.lastBlob) return;
    this._status("encoding mp4…");
    try {
      const { ffmpeg, fetchFile } = await this._loadFfmpeg();
      await ffmpeg.writeFile("input.webm", await fetchFile(this.lastBlob));
      await ffmpeg.exec([
        "-i",
        "input.webm",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "output.mp4",
      ]);
      const data = await ffmpeg.readFile("output.mp4");
      this.downloadBlob(new Blob([data.buffer], { type: "video/mp4" }), `aural-canvas-${Date.now()}.mp4`);
      this._status("mp4 exported");
    } catch (err) {
      console.error(err);
      alert("MP4 export failed. Check network for ffmpeg.wasm.");
      this._status("mp4 failed");
    }
  }

  async export4K(format = "webm") {
    if (!this.lastBlob) {
      alert("Record a session first (DAW off).");
      return;
    }
    this._status(`rendering 4K ${format}…`);
    try {
      const { ffmpeg, fetchFile } = await this._loadFfmpeg();
      await ffmpeg.writeFile("input.webm", await fetchFile(this.lastBlob));
      const scale = `scale=${UHD.w}:${UHD.h}:flags=lanczos`;
      if (format === "mp4") {
        await ffmpeg.exec([
          "-i",
          "input.webm",
          "-vf",
          scale,
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-crf",
          "18",
          "-c:a",
          "aac",
          "-b:a",
          "320k",
          "out.mp4",
        ]);
        const data = await ffmpeg.readFile("out.mp4");
        this.downloadBlob(new Blob([data.buffer], { type: "video/mp4" }), `aural-canvas-4k-${Date.now()}.mp4`);
      } else {
        await ffmpeg.exec([
          "-i",
          "input.webm",
          "-vf",
          scale,
          "-c:v",
          "libvpx-vp9",
          "-b:v",
          "12M",
          "-c:a",
          "libopus",
          "-b:a",
          "320k",
          "out.webm",
        ]);
        const data = await ffmpeg.readFile("out.webm");
        this.downloadBlob(new Blob([data.buffer], { type: "video/webm" }), `aural-canvas-4k-${Date.now()}.webm`);
      }
      this._status(`4K ${format} exported`);
    } catch (err) {
      console.error(err);
      alert("4K export requires ffmpeg.wasm (~25MB download).");
      this._status("4K export failed");
    }
  }

  audioBufferToWav(buffer, bitDepth = 16) {
    const numCh = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = bitDepth === 24 ? 3 : 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
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

  exportWAV(bitDepth = 16) {
    if (!this.lastAudioBuffer) {
      alert("No audio recorded. Record a session first.");
      return;
    }
    const wav = this.audioBufferToWav(this.lastAudioBuffer, bitDepth);
    this.downloadBlob(wav, `aural-canvas-audio-${Date.now()}.wav`);
  }

  exportMP3() {
    if (!this.lastAudioBuffer) {
      alert("No audio recorded. Record a session first.");
      return;
    }
    if (typeof lamejs === "undefined") {
      alert("MP3 encoder not loaded.");
      return;
    }

    const buffer = this.lastAudioBuffer;
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(2, sampleRate, 320);
    const blockSize = 1152;
    const mp3Data = [];

    for (let i = 0; i < ch0.length; i += blockSize) {
      const left = new Int16Array(blockSize);
      const right = new Int16Array(blockSize);
      for (let j = 0; j < blockSize; j++) {
        const idx = i + j;
        if (idx >= ch0.length) break;
        left[j] = Math.max(-32768, Math.min(32767, ch0[idx] * 32767));
        right[j] = Math.max(-32768, Math.min(32767, ch1[idx] * 32767));
      }
      const chunk = mp3encoder.encodeBuffer(left, right);
      if (chunk.length > 0) mp3Data.push(chunk);
    }
    const end = mp3encoder.flush();
    if (end.length > 0) mp3Data.push(end);

    this.downloadBlob(new Blob(mp3Data, { type: "audio/mp3" }), `aural-canvas-audio-${Date.now()}.mp3`);
  }

  hasRecording() {
    return !!this.lastBlob;
  }
}
