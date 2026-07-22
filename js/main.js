import { FluidSim } from "./fluid.js";
import { AudioEngine } from "./audio.js";
import { Recorder } from "./recorder.js";
import { MiniDAW } from "./daw.js";

const APP_VERSION = "2.0.0";

const fluidCanvas = document.getElementById("fluid-canvas");
const overlayCanvas = document.getElementById("overlay-canvas");
const canvasWrap = document.getElementById("canvas-wrap");
const fctx = fluidCanvas.getContext("2d");
const octx = overlayCanvas.getContext("2d");

const fluid = new FluidSim();
const audio = new AudioEngine();
const recorder = new Recorder(audio, fluidCanvas);
const daw = new MiniDAW(audio);
recorder.setDaw(daw);

const state = {
  axisX: 0.5,
  axisY: 0.5,
  rotation: 0,
  speed: 0,
  zoom: 1,
  autoAngle: 0,
  axisTool: false,
  draggingAxis: false,
  pointer: { down: false, x: 0, y: 0, nx: 0, ny: 0 },
  lastFreq: 0,
  dawOpen: false,
};

function resize() {
  const rect = canvasWrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  for (const c of [fluidCanvas, overlayCanvas]) {
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    c.style.width = `${rect.width}px`;
    c.style.height = `${rect.height}px`;
  }
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function getCanvasRect() {
  return canvasWrap.getBoundingClientRect();
}

function screenToLocal(clientX, clientY) {
  const rect = getCanvasRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  let x = clientX - rect.left - cx;
  let y = clientY - rect.top - cy;
  x /= state.zoom;
  y /= state.zoom;
  const rad = (-state.rotation - state.autoAngle) * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  return {
    x: rx + cx,
    y: ry + cy,
    nx: (rx + cx) / rect.width,
    ny: (ry + cy) / rect.height,
    rawX: clientX - rect.left,
    rawY: clientY - rect.top,
  };
}

function axisScreenPos() {
  const rect = getCanvasRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const ax = (state.axisX - 0.5) * rect.width;
  const ay = (state.axisY - 0.5) * rect.height;
  const rad = (state.rotation + state.autoAngle) * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const zx = ax * state.zoom;
  const zy = ay * state.zoom;
  return {
    x: cx + zx * cos - zy * sin,
    y: cy + zx * sin + zy * cos,
  };
}

/** Axis overlay only when tool is active — never burned into fluid canvas / recording. */
function drawOverlay() {
  const rect = getCanvasRect();
  octx.clearRect(0, 0, rect.width, rect.height);

  if (!state.axisTool || recorder.recording) {
    overlayCanvas.style.visibility = "hidden";
    return;
  }
  overlayCanvas.style.visibility = "visible";

  const { x: ax, y: ay } = axisScreenPos();
  octx.save();
  octx.strokeStyle = "rgba(108, 92, 231, 0.85)";
  octx.lineWidth = 1.5;
  octx.setLineDash([6, 4]);

  octx.beginPath();
  octx.moveTo(0, ay);
  octx.lineTo(rect.width, ay);
  octx.stroke();
  octx.beginPath();
  octx.moveTo(ax, 0);
  octx.lineTo(ax, rect.height);
  octx.stroke();
  octx.setLineDash([]);

  octx.beginPath();
  octx.arc(ax, ay, 12, 0, Math.PI * 2);
  octx.fillStyle = "rgba(108, 92, 231, 0.95)";
  octx.fill();
  octx.strokeStyle = "#fff";
  octx.lineWidth = 2;
  octx.stroke();

  octx.font = '12px "Audiowide", sans-serif';
  octx.fillStyle = "rgba(200,200,220,0.9)";
  octx.fillText("0 hz", ax + 14, ay - 10);
  octx.fillText(`${audio.freqMax} hz →`, rect.width - 90, ay - 10);
  octx.restore();
}

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  state.autoAngle += state.speed * dt * 15;
  fluid.step(dt);

  const rect = getCanvasRect();
  fctx.save();
  fctx.fillStyle = "#080810";
  fctx.fillRect(0, 0, rect.width, rect.height);
  fctx.translate(rect.width / 2, rect.height / 2);
  fctx.rotate((state.rotation + state.autoAngle) * (Math.PI / 180));
  fctx.scale(state.zoom, state.zoom);
  fctx.translate(-rect.width / 2, -rect.height / 2);
  fluid.renderTo(fctx, rect.width, rect.height);
  fctx.restore();

  drawOverlay();

  const regions = fluid.samplePaintRegions(audio.voiceCount);
  audio.updatePaintVoices(regions, state.axisX, state.axisY);

  if (state.pointer.down && !state.draggingAxis) {
    const freq = audio.updatePointerSound(state.pointer.nx, state.pointer.ny, state.axisX, state.axisY, true);
    if (freq != null) {
      document.getElementById("freq-readout").textContent = `${Math.round(freq)} hz`;
    }
  } else if (!state.pointer.down) {
    audio.updatePointerSound(0, 0, 0, 0, false);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function splatFromPointer(nx, ny, dx, dy) {
  fluid.splat(nx, ny, dx, dy);
}

async function onPointerDown(e) {
  e.preventDefault();
  if (e.target.setPointerCapture) {
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
  }
  await audio.resume();
  const local = screenToLocal(e.clientX, e.clientY);

  if (state.axisTool) {
    const axis = axisScreenPos();
    const dist = Math.hypot(local.rawX - axis.x, local.rawY - axis.y);
    if (dist < 20) {
      state.draggingAxis = true;
      canvasWrap.classList.add("axis-dragging");
      return;
    }
  }

  state.pointer.down = true;
  state.pointer.x = local.x;
  state.pointer.y = local.y;
  state.pointer.nx = local.nx;
  state.pointer.ny = local.ny;
  splatFromPointer(local.nx, local.ny, 0, 0);
}

function onPointerMove(e) {
  const local = screenToLocal(e.clientX, e.clientY);
  if (state.draggingAxis) {
    const rect = getCanvasRect();
    const rad = (-state.rotation - state.autoAngle) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let x = local.rawX - rect.width / 2;
    let y = local.rawY - rect.height / 2;
    x /= state.zoom;
    y /= state.zoom;
    const ux = x * cos - y * sin;
    const uy = x * sin + y * cos;
    state.axisX = Math.max(0, Math.min(1, ux / rect.width + 0.5));
    state.axisY = Math.max(0, Math.min(1, uy / rect.height + 0.5));
    syncAxisSliders();
    return;
  }
  if (!state.pointer.down) return;
  const dx = local.x - state.pointer.x;
  const dy = local.y - state.pointer.y;
  splatFromPointer(local.nx, local.ny, dx, dy);
  state.pointer.x = local.x;
  state.pointer.y = local.y;
  state.pointer.nx = local.nx;
  state.pointer.ny = local.ny;
}

function onPointerUp(e) {
  if (e?.target?.releasePointerCapture) {
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }
  state.pointer.down = false;
  state.draggingAxis = false;
  canvasWrap.classList.remove("axis-dragging");
}

for (const target of [fluidCanvas, canvasWrap]) {
  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", onPointerUp);
  target.addEventListener("pointerleave", onPointerUp);
}

function bindRange(id, outId, fmt, onChange) {
  const el = document.getElementById(id);
  const out = document.getElementById(outId);
  if (!el) return;
  const update = () => {
    if (out) out.textContent = fmt(el.value);
    onChange(el.value);
  };
  el.addEventListener("input", update);
  el.addEventListener("change", update);
  update();
}

bindRange("paint-size", "out-size", (v) => (+v).toFixed(2), (v) => (fluid.splatRadius = +v));
bindRange("paint-force", "out-force", (v) => v, (v) => (fluid.splatForce = +v));
bindRange("paint-push", "out-push", (v) => (+v).toFixed(2), (v) => (fluid.pushStrength = +v));
document.getElementById("paint-color").addEventListener("input", (e) => fluid.setColor(e.target.value));
document.getElementById("btn-paint").addEventListener("click", () => setMode("paint"));
document.getElementById("btn-push").addEventListener("click", () => setMode("push"));

function setMode(mode) {
  fluid.setMode(mode);
  document.getElementById("btn-paint").classList.toggle("active", mode === "paint");
  document.getElementById("btn-push").classList.toggle("active", mode === "push");
}

bindRange("canvas-rotation", "out-rotation", (v) => `${v}°`, (v) => (state.rotation = +v));
bindRange("canvas-speed", "out-speed", (v) => (+v).toFixed(1), (v) => (state.speed = +v));
bindRange("canvas-zoom", "out-zoom", (v) => (+v).toFixed(2), (v) => (state.zoom = +v));

function syncAxisSliders() {
  document.getElementById("axis-x").value = state.axisX * 100;
  document.getElementById("axis-y").value = state.axisY * 100;
  document.getElementById("out-axis-x").textContent = `${(state.axisX * 100).toFixed(0)}%`;
  document.getElementById("out-axis-y").textContent = `${(state.axisY * 100).toFixed(0)}%`;
}

bindRange("axis-x", "out-axis-x", (v) => `${(+v).toFixed(0)}%`, (v) => (state.axisX = +v / 100));
bindRange("axis-y", "out-axis-y", (v) => `${(+v).toFixed(0)}%`, (v) => (state.axisY = +v / 100));
bindRange("freq-min", "out-freq-min", (v) => `${v} hz`, (v) => audio.setFreqRange(+v, audio.freqMax));
bindRange("freq-max", "out-freq-max", (v) => `${v} hz`, (v) => audio.setFreqRange(audio.freqMin, +v));
bindRange("volume", "out-volume", (v) => `${v}%`, (v) => audio.setVolume(+v / 100));
document.getElementById("waveform").addEventListener("change", (e) => audio.setWaveform(e.target.value));
bindRange("y-amplitude", "out-y-amp", (v) => (+v >= 0.5 ? "on" : "low"), (v) => (audio.yAmplitude = +v));
bindRange("voice-count", "out-voices", (v) => v, (v) => (audio.voiceCount = +v));

document.getElementById("btn-axis-tool").addEventListener("click", () => {
  state.axisTool = !state.axisTool;
  document.getElementById("btn-axis-tool").classList.toggle("active", state.axisTool);
  canvasWrap.classList.toggle("axis-drag", state.axisTool);
});

document.getElementById("btn-clear").addEventListener("click", () => {
  fluid.clear();
  audio.voices.forEach((v) => audio.releaseVoice(v));
  audio.voices = [];
});

document.getElementById("audio-upload").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const name = await audio.loadSample(file);
    document.getElementById("sample-name").textContent = `sample: ${name}`;
    document.getElementById("btn-use-tone").disabled = false;
  } catch {
    alert("Could not load audio file.");
  }
});

document.getElementById("btn-use-tone").addEventListener("click", () => {
  audio.useToneGenerator();
  document.getElementById("sample-name").textContent = "default: oscillator tone";
  document.getElementById("btn-use-tone").disabled = true;
  document.getElementById("audio-upload").value = "";
});

const recordBtn = document.getElementById("btn-record");
const recordStatus = document.getElementById("record-status");
const exportBtns = [
  "export-webm",
  "export-mp4",
  "export-webm-4k",
  "export-mp4-4k",
  "export-wav",
  "export-mp3",
].map((id) => document.getElementById(id));

function setExportEnabled(on) {
  exportBtns.forEach((b) => {
    if (b) b.disabled = !on;
  });
}

recorder.setExportStatusEl(recordStatus);

recordBtn.addEventListener("click", async () => {
  const useDaw = state.dawOpen && daw.enabled;
  if (!recorder.recording) {
    await daw.init();
    await recorder.start({ useDaw });
    recordBtn.classList.add("recording");
    recordBtn.textContent = "■ stop";
    recordStatus.textContent = useDaw ? "recording → daw track…" : "recording…";
    setExportEnabled(false);
  } else {
    await recorder.stop({ useDaw });
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "● record";
    recordStatus.textContent = useDaw ? "clip added to timeline" : "recording saved";
    setExportEnabled(!useDaw);
  }
});

document.getElementById("export-webm").addEventListener("click", () => recorder.exportWebM());
document.getElementById("export-mp4").addEventListener("click", () => recorder.exportMP4());
document.getElementById("export-webm-4k").addEventListener("click", () => recorder.export4K("webm"));
document.getElementById("export-mp4-4k").addEventListener("click", () => recorder.export4K("mp4"));
document.getElementById("export-wav").addEventListener("click", () => recorder.exportWAV());
document.getElementById("export-mp3").addEventListener("click", () => recorder.exportMP3());

const dawPanel = document.getElementById("daw-panel");
document.getElementById("btn-daw-toggle").addEventListener("click", async () => {
  await daw.init();
  state.dawOpen = !state.dawOpen;
  dawPanel.classList.toggle("open", state.dawOpen);
  document.getElementById("btn-daw-toggle").classList.toggle("active", state.dawOpen);
  daw.setEnabled(state.dawOpen);
  daw.renderUI();
  document.getElementById("app").classList.toggle("daw-open", state.dawOpen);
});

document.getElementById("daw-popout").addEventListener("click", () => {
  daw.poppedOut = !daw.poppedOut;
  dawPanel.classList.toggle("popout", daw.poppedOut);
});

document.getElementById("daw-export-wav").addEventListener("click", async () => {
  recordStatus.textContent = "rendering daw mix…";
  const blob = await daw.exportMix("wav");
  daw.downloadBlob(blob, `aural-canvas-daw-${Date.now()}.wav`);
  recordStatus.textContent = "daw mix exported";
});

bindRange("daw-samplerate", "out-daw-sr", (v) => v, (v) => (daw.exportSampleRate = +v));
bindRange("daw-bitdepth", "out-daw-bd", (v) => v, (v) => (daw.exportBitDepth = +v));

state.axisTool = false;
document.getElementById("btn-axis-tool").classList.remove("active");
document.getElementById("version-tag").textContent = `v${APP_VERSION} desktop`;

daw.init().catch(console.error);
