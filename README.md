# Aural Canvas

Liquid paint on a moving sonic canvas — combining fluid painting, frequency-mapped audio, and live recording.

## Download desktop app

| Version | Link |
|---------|------|
| **v2.0.0** (latest — daw, 4k export) | [releases/latest](https://github.com/rbarnabas/AuralCanvas/releases/latest) |
| v1.0.0 | [releases/tag/v1.0.0](https://github.com/rbarnabas/AuralCanvas/releases/tag/v1.0.0) |

See [RELEASE-v2.md](RELEASE-v2.md) for v2 changes.

Inspired by [Binaura Loom](https://www.binaura.net/loom/?mode=editor), [Pixel Pour](https://bitbof.com/experiments/2019_01_27_pixel_pour/), and [Tone Generator](https://www.szynalski.com/tone-generator/).

## Features

- **Paint / Push modes** — add liquid color or move existing paint without adding more
- **Fluid simulation** — additive paint with no gravity, pushed by cursor strokes
- **Sonic canvas** — X axis maps 0–1000 Hz; Y axis modulates amplitude
- **Draggable frequency axis** — move the 0 Hz origin anywhere on canvas
- **Loom-style canvas** — adjustable rotation, auto-spin speed, and zoom
- **Tone generator** — sine/square/saw/triangle oscillators, or upload .wav/.mp3 samples
- **Live volume control** — adjust while performing
- **Record & export** — WebM video, MP4 (via ffmpeg.wasm), WAV audio, MP3 audio

## Download ZIP

Latest master ZIP (always includes newest JS/CSS fixes):

**https://github.com/rbarnabas/AuralCanvas/archive/refs/heads/master.zip**

After extracting, start a local server inside the folder:

```bash
cd AuralCanvas-master
python3 -m http.server 8080
# open http://localhost:8080
```

> Do **not** open `index.html` directly from Finder/Explorer. ES modules require HTTP.
> Check the subtitle for `build 9d23ea5` to confirm you have the fixed version.

## Live demo (GitHub Pages)

After Pages is enabled, the app is available at:

**https://rbarnabas.github.io/AuralCanvas/**

> Hard-refresh (Cmd+Shift+R) if you still see the old version after an update.

To enable Pages manually: GitHub repo → **Settings** → **Pages** → Source: **GitHub Actions**.

## Usage

1. Click the canvas to enable audio
2. Use **Paint** mode to add color; **Push** mode to sculpt existing fluid
3. Drag the purple crosshair (Axis Tool) to reposition the frequency origin
4. Adjust sliders live while drawing — rotation, speed, paint force, frequencies
5. Hit **Record**, perform your piece, then **Stop** and export

## Desktop app (Electron)

Aural Canvas can be packaged as a standalone Mac `.dmg` and Windows `.exe` installer.

### Prerequisites

- [Node.js](https://nodejs.org/) 20 LTS or newer (includes `npm`)
- macOS to build `.dmg` locally; Windows to build `.exe` locally
- Cross-platform builds also run via GitHub Actions (see below)

### Step 1 — Install dependencies

```bash
cd aural-canvas   # or AuralCanvas-master after clone
npm install
```

This installs `electron` and `electron-builder` as dev dependencies.

### Step 2 — Run in development

```bash
npm start
```

Opens the app in an Electron window (DevTools enabled when unpackaged).

### Step 3 — Build production installers

```bash
# Current platform only
npm run build

# macOS .dmg (Intel + Apple Silicon)
npm run build:mac

# Windows .exe (NSIS installer)
npm run build:win

# Both (requires platform toolchains / CI for cross-build)
npm run build:all
```

Installers are written to `dist/`:

| Platform | Output |
|----------|--------|
| macOS | `Aural Canvas-1.0.0-mac-arm64.dmg`, `...-x64.dmg` |
| Windows | `Aural Canvas-1.0.0-win-x64.exe` |

### Step 4 — Optional custom icons

Add branded icons before release builds (see `build/README.md`):

- `build/icon.icns` — macOS
- `build/icon.ico` — Windows

### Step 5 — GitHub Actions releases

Push a version tag to build installers in the cloud and attach them to a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or run **Actions → Build Desktop App → Run workflow** manually.

### Project layout

```
electron/
  main.js      # Electron main process (window, permissions, menu)
  preload.js   # Secure bridge exposed as window.auralCanvas
package.json   # Scripts + electron-builder config
build/         # Icons and macOS entitlements
dist/          # Generated installers (gitignored)
```

## Browser support

- Chrome / Edge recommended for recording (WebM + MediaRecorder)
- MP4 export downloads ffmpeg.wasm on first use (~25 MB)
- Safari may have limited MediaRecorder codec support
