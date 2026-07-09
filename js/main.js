import { FluidSim } from "./fluid.js";
import { AudioEngine } from "./audio.js";
import { Recorder } from "./recorder.js";

const fluidCanvas = document.getElementById("fluid-canvas");
const overlayCanvas = document.getElementById("overlay-canvas");
const canvasWrap = document.getElementById("canvas-wrap");
const fctx = fluidCanvas.getContext("2d");
const octx = overlayCanvas.getContext("2d");

const fluid = new FluidSim();
const audio = new AudioEngine();
const recorder = new Recorder(audio, fluidCanvas);

const state = {
  axisX: 0.5,
  axisY: 0.5,
  rotation: 0,
  speed: 0,
  zoom: 1,
  autoAngle: 0,
  axisTool: true,
  draggingAxis: false,
  pointer: { down: false, x: 0, y: 0, nx: 0, ny: 0 },
  lastFreq: 0,
};

// --- Resize ---
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

// --- Coordinate transforms ---
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

// --- Drawing overlay (axis crosshair) ---
function drawOverlay() {
  const rect = getCanvasRect();
  octx.clearRect(0, 0, rect.width, rect.height);

  const { x: ax, y: ay } = axisScreenPos();

  octx.save();
  octx.strokeStyle = "rgba(108, 92, 231, 0.7)";
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

  const grad = octx.createLinearGradient(ax, 0, rect.width, 0);
  grad.addColorStop(0, "rgba(108,92,231,0)");
  grad.addColorStop(Math.max(0, (ax - 20) / rect.width), "rgba(108,92,231,0)");
  grad.addColorStop(Math.min(1, ax / rect.width), "rgba(108,92,231,0.3)");
  grad.addColorStop(1, "rgba(108,92,231,0.6)");
  octx.fillStyle = grad;
  octx.fillRect(0, 0, rect.width, rect.height);

  octx.beginPath();
  octx.arc(ax, ay, state.axisTool ? 10 : 6, 0, Math.PI * 2);
  octx.fillStyle = state.axisTool ? "rgba(108, 92, 231, 0.9)" : "rgba(108, 92, 231, 0.5)";
  octx.fill();
  octx.strokeStyle = "#fff";
  octx.lineWidth = 2;
  octx.stroke();

  octx.font = "11px sans-serif";
  octx.fillStyle = "rgba(200,200,220,0.8)";
  octx.fillText("0 Hz", ax + 12, ay - 8);
  octx.fillText(`${audio.freqMax} Hz →`, rect.width - 80, ay - 8);
  octx.restore();
}

// --- Main render loop ---
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

  if (state.pointer.down && !state.axisTool) {
    const freq = audio.updatePointerSound(state.pointer.nx, state.pointer.ny, state.axisX, state.axisY, true);
    if (freq != null) {
      state.lastFreq = freq;
      document.getElementById("freq-readout").textContent = `${Math.round(freq)} Hz`;
    }
  } else {
    audio.updatePointerSound(0, 0, 0, 0, false);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Pointer interaction ---
function splatFromPointer(nx, ny, dx, dy) {
  fluid.splat(nx, ny, dx, dy);
}

function onPointerDown(e) {
  audio.resume();
  const local = screenToLocal(e.clientX, e.clientY);

  if (state.axisTool) {
    const axis = axisScreenPos();
    const dist = Math.hypot(local.rawX - axis.x, local.rawY - axis.y);
    if (dist < 24) {
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

function onPointerUp() {
  state.pointer.down = false;
  state.draggingAxis = false;
  canvasWrap.classList.remove("axis-dragging");
}

canvasWrap.addEventListener("pointerdown", onPointerDown);
canvasWrap.addEventListener("pointermove", onPointerMove);
canvasWrap.addEventListener("pointerup", onPointerUp);
canvasWrap.addEventListener("pointerleave", onPointerUp);

// --- UI bindings ---
function bindRange(id, outId, fmt, onChange) {
  const el = document.getElementById(id);
  const out = document.getElementById(outId);
  if (!el) {
    console.error("Missing control:", id);
    return;
  }
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

bindRange("freq-min", "out-freq-min", (v) => `${v} Hz`, (v) => {
  audio.setFreqRange(+v, audio.freqMax);
});
bindRange("freq-max", "out-freq-max", (v) => `${v} Hz`, (v) => {
  audio.setFreqRange(audio.freqMin, +v);
});

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
    document.getElementById("sample-name").textContent = `Sample: ${name}`;
    document.getElementById("btn-use-tone").disabled = false;
  } catch (err) {
    alert("Could not load audio file. Please use a valid .wav or .mp3 file.");
    console.error(err);
  }
});

document.getElementById("btn-use-tone").addEventListener("click", () => {
  audio.useToneGenerator();
  document.getElementById("sample-name").textContent = "Default: oscillator tone";
  document.getElementById("btn-use-tone").disabled = true;
  document.getElementById("audio-upload").value = "";
});

// --- Recording ---
const recordBtn = document.getElementById("btn-record");
const recordStatus = document.getElementById("record-status");
const exportBtns = ["export-webm", "export-mp4", "export-wav", "export-mp3"].map((id) =>
  document.getElementById(id)
);

function setExportEnabled(on) {
  exportBtns.forEach((b) => (b.disabled = !on));
}

recordBtn.addEventListener("click", async () => {
  if (!recorder.recording) {
    await recorder.start();
    recordBtn.classList.add("recording");
    recordBtn.textContent = "■ Stop";
    recordStatus.textContent = "Recording…";
    setExportEnabled(false);
  } else {
    await recorder.stop();
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "● Record";
    recordStatus.textContent = "Recording saved";
    setExportEnabled(true);
  }
});

document.getElementById("export-webm").addEventListener("click", () => recorder.exportWebM());
document.getElementById("export-mp4").addEventListener("click", () => recorder.exportMP4());
document.getElementById("export-wav").addEventListener("click", () => recorder.exportWAV());
document.getElementById("export-mp3").addEventListener("click", () => recorder.exportMP3());

state.axisTool = false;
document.getElementById("btn-axis-tool").classList.remove("active");
