/**
 * Stable-fluids style 2D paint simulation (no gravity).
 * Based on techniques from Jamie Wong / Pixel Pour.
 */

const N = 128;

function idx(x, y) {
  return x + y * N;
}

export class FluidSim {
  constructor() {
    this.densityR = new Float32Array(N * N);
    this.densityG = new Float32Array(N * N);
    this.densityB = new Float32Array(N * N);
    this.velX = new Float32Array(N * N);
    this.velY = new Float32Array(N * N);
    this.prevDensityR = new Float32Array(N * N);
    this.prevDensityG = new Float32Array(N * N);
    this.prevDensityB = new Float32Array(N * N);
    this.prevVelX = new Float32Array(N * N);
    this.prevVelY = new Float32Array(N * N);

    this.iterations = 8;
    this.diffusion = 0.0002;
    this.viscosity = 0.0002;
    this.densityDecay = 0.998;
    this.velocityDecay = 0.99;
    this.mode = "paint";
    this.color = { r: 0.42, g: 0.36, b: 0.9 };
    this.splatRadius = 0.25;
    this.splatForce = 6000;
    this.pushStrength = 0.5;
  }

  setMode(mode) {
    this.mode = mode;
  }

  setColor(hex) {
    const n = parseInt(hex.slice(1), 16);
    this.color = {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  clear() {
    this.densityR.fill(0);
    this.densityG.fill(0);
    this.densityB.fill(0);
    this.velX.fill(0);
    this.velY.fill(0);
  }

  /** Normalized UV 0..1 */
  splat(nx, ny, dx, dy) {
    const radius = this.splatRadius * 0.18;
    const force = this.splatForce * 0.00002;
    const push = this.pushStrength;

    const cx = nx * N;
    const cy = ny * N;
    const r = Math.max(3, radius * N);

    for (let y = Math.max(1, Math.floor(cy - r)); y < Math.min(N - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(1, Math.floor(cx - r)); x < Math.min(N - 1, Math.ceil(cx + r)); x++) {
        const dist = Math.hypot(x - cx, y - cy) / r;
        if (dist > 1) continue;
        const falloff = (1 - dist) * (1 - dist);
        const i = idx(x, y);

        this.velX[i] += dx * force * push * falloff;
        this.velY[i] += dy * force * push * falloff;

        if (this.mode === "paint") {
          const amount = falloff * 2.5;
          this.densityR[i] = Math.min(4, this.densityR[i] + this.color.r * amount);
          this.densityG[i] = Math.min(4, this.densityG[i] + this.color.g * amount);
          this.densityB[i] = Math.min(4, this.densityB[i] + this.color.b * amount);
        }
      }
    }
  }

  step(dt) {
    this.prevVelX.set(this.velX);
    this.prevVelY.set(this.velY);
    this.diffuse(this.velX, this.prevVelX, this.viscosity, dt);
    this.diffuse(this.velY, this.prevVelY, this.viscosity, dt);
    this.project(this.velX, this.velY, this.prevVelX, this.prevVelY);

    this.prevVelX.set(this.velX);
    this.prevVelY.set(this.velY);
    this.advect(this.velX, this.prevVelX, this.prevVelX, this.prevVelY, dt);
    this.advect(this.velY, this.prevVelY, this.prevVelX, this.prevVelY, dt);
    this.project(this.velX, this.velY, this.prevVelX, this.prevVelY);

    this.prevDensityR.set(this.densityR);
    this.prevDensityG.set(this.densityG);
    this.prevDensityB.set(this.densityB);
    this.advect(this.densityR, this.prevDensityR, this.velX, this.velY, dt);
    this.advect(this.densityG, this.prevDensityG, this.velX, this.velY, dt);
    this.advect(this.densityB, this.prevDensityB, this.velX, this.velY, dt);

    for (let i = 0; i < N * N; i++) {
      this.densityR[i] *= this.densityDecay;
      this.densityG[i] *= this.densityDecay;
      this.densityB[i] *= this.densityDecay;
      this.velX[i] *= this.velocityDecay;
      this.velY[i] *= this.velocityDecay;
    }
  }

  diffuse(out, src, diff, dt) {
    out.set(src);
    const a = dt * diff * N * N;
    for (let k = 0; k < this.iterations; k++) {
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = idx(x, y);
          out[i] =
            (src[i] +
              a *
                (out[idx(x - 1, y)] +
                  out[idx(x + 1, y)] +
                  out[idx(x, y - 1)] +
                  out[idx(x, y + 1)])) /
            (1 + 4 * a);
        }
      }
      this.setBoundary(0, out);
      src.set(out);
    }
  }

  advect(out, src, velX, velY, dt) {
    const dt0 = dt * N;
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = idx(x, y);
        let px = x - dt0 * velX[i];
        let py = y - dt0 * velY[i];
        px = Math.max(0.5, Math.min(N - 1.5, px));
        py = Math.max(0.5, Math.min(N - 1.5, py));
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const s1 = px - x0;
        const s0 = 1 - s1;
        const t1 = py - y0;
        const t0 = 1 - t1;
        out[i] =
          s0 * (t0 * src[idx(x0, y0)] + t1 * src[idx(x0, y1)]) +
          s1 * (t0 * src[idx(x1, y0)] + t1 * src[idx(x1, y1)]);
      }
    }
    this.setBoundary(1, out);
  }

  project(velX, velY, p, div) {
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = idx(x, y);
        div[i] =
          (-0.5 *
            (velX[idx(x + 1, y)] -
              velX[idx(x - 1, y)] +
              velY[idx(x, y + 1)] -
              velY[idx(x, y - 1)])) /
          N;
        p[i] = 0;
      }
    }
    this.setBoundary(0, div);
    this.setBoundary(0, p);

    for (let k = 0; k < this.iterations; k++) {
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = idx(x, y);
          p[i] =
            (div[i] +
              p[idx(x - 1, y)] +
              p[idx(x + 1, y)] +
              p[idx(x, y - 1)] +
              p[idx(x, y + 1)]) /
            4;
        }
      }
      this.setBoundary(0, p);
    }

    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = idx(x, y);
        velX[i] -= 0.5 * N * (p[idx(x + 1, y)] - p[idx(x - 1, y)]);
        velY[i] -= 0.5 * N * (p[idx(x, y + 1)] - p[idx(x, y - 1)]);
      }
    }
    this.setBoundary(1, velX);
    this.setBoundary(2, velY);
  }

  setBoundary(b, arr) {
    for (let x = 1; x < N - 1; x++) {
      arr[idx(x, 0)] = b === 2 ? -arr[idx(x, 1)] : arr[idx(x, 1)];
      arr[idx(x, N - 1)] = b === 2 ? -arr[idx(x, N - 2)] : arr[idx(x, N - 2)];
    }
    for (let y = 1; y < N - 1; y++) {
      arr[idx(0, y)] = b === 1 ? -arr[idx(1, y)] : arr[idx(1, y)];
      arr[idx(N - 1, y)] = b === 1 ? -arr[idx(N - 2, y)] : arr[idx(N - 2, y)];
    }
    arr[idx(0, 0)] = 0.5 * (arr[idx(1, 0)] + arr[idx(0, 1)]);
    arr[idx(0, N - 1)] = 0.5 * (arr[idx(1, N - 1)] + arr[idx(0, N - 2)]);
    arr[idx(N - 1, 0)] = 0.5 * (arr[idx(N - 2, 0)] + arr[idx(N - 1, 1)]);
    arr[idx(N - 1, N - 1)] = 0.5 * (arr[idx(N - 2, N - 1)] + arr[idx(N - 1, N - 2)]);
  }

  samplePaintRegions(maxSamples = 8) {
    const cells = [];
    const stride = 4;
    for (let y = 0; y < N; y += stride) {
      for (let x = 0; x < N; x += stride) {
        const i = idx(x, y);
        const intensity = this.densityR[i] + this.densityG[i] + this.densityB[i];
        if (intensity > 0.08) {
          cells.push({ nx: x / N, ny: y / N, intensity });
        }
      }
    }
    cells.sort((a, b) => b.intensity - a.intensity);
    return cells.slice(0, maxSamples);
  }

  renderTo(ctx, width, height) {
    const imageData = ctx.createImageData(N, N);
    const data = imageData.data;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        const pi = (x + y * N) * 4;
        const dr = this.densityR[i];
        const dg = this.densityG[i];
        const db = this.densityB[i];
        const r = Math.min(255, dr * 80);
        const g = Math.min(255, dg * 80);
        const b = Math.min(255, db * 80);
        const a = Math.min(255, (dr + dg + db) * 40);
        data[pi] = r;
        data[pi + 1] = g;
        data[pi + 2] = b;
        data[pi + 3] = a > 8 ? a : 0;
      }
    }

    if (!this._offscreen) {
      this._offscreen = document.createElement("canvas");
      this._offscreen.width = N;
      this._offscreen.height = N;
    }
    const off = this._offscreen.getContext("2d");
    off.putImageData(imageData, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this._offscreen, 0, 0, width, height);
    ctx.restore();
  }
}

export { N as FLUID_GRID_SIZE };
