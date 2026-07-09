/**
 * Recording and export: WebM, MP4, WAV, MP3
 */

export class Recorder {
  constructor(audioEngine, canvas) {
    this.audio = audioEngine;
    this.canvas = canvas;
    this.mediaRecorder = null;
    this.chunks = [];
    this.recording = false;
    this.lastBlob = null;
    this.lastAudioBuffer = null;
    this.audioChunks = [];
    this.audioRecorder = null;
  }

  async start() {
    await this.audio.resume();
    const fps = 30;
    const videoStream = this.canvas.captureStream(fps);
    const audioStream = this.audio.getAudioStream();

    const tracks = [...videoStream.getVideoTracks()];
    if (audioStream) {
      tracks.push(...audioStream.getAudioTracks());
    }
    const combined = new MediaStream(tracks);

    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 5000000 });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(200);
    this.recording = true;

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

  async stop() {
    if (!this.recording) return null;

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
    const arrayBuffer = await blob.arrayBuffer();
    try {
      return await ctx.decodeAudioData(arrayBuffer);
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

  async exportMP4() {
    if (!this.lastBlob) return;

    if (this.lastBlob.type.includes("mp4")) {
      this.downloadBlob(this.lastBlob, `aural-canvas-${Date.now()}.mp4`);
      return;
    }

    try {
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

      await ffmpeg.writeFile("input.webm", await fetchFile(this.lastBlob));
      await ffmpeg.exec(["-i", "input.webm", "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "output.mp4"]);
      const data = await ffmpeg.readFile("output.mp4");
      const mp4 = new Blob([data.buffer], { type: "video/mp4" });
      this.downloadBlob(mp4, `aural-canvas-${Date.now()}.mp4`);
    } catch (err) {
      console.error("MP4 conversion failed:", err);
      alert("MP4 export requires loading ffmpeg.wasm (~25MB). Try WebM export, or check your network connection.");
    }
  }

  audioBufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = 2;
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
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  exportWAV() {
    if (!this.lastAudioBuffer) {
      alert("No audio recorded. Record a session first.");
      return;
    }
    const wav = this.audioBufferToWav(this.lastAudioBuffer);
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

    const mp3encoder = new lamejs.Mp3Encoder(2, sampleRate, 128);
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

    const blob = new Blob(mp3Data, { type: "audio/mp3" });
    this.downloadBlob(blob, `aural-canvas-audio-${Date.now()}.mp3`);
  }

  hasRecording() {
    return !!this.lastBlob;
  }
}
