# Aural Canvas

Liquid paint on a moving sonic canvas — combining fluid painting, frequency-mapped audio, and live recording.

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
> Check the subtitle for `build 7cbdeb8` to confirm you have the fixed version.

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

## Browser support

- Chrome / Edge recommended for recording (WebM + MediaRecorder)
- MP4 export downloads ffmpeg.wasm on first use (~25 MB)
- Safari may have limited MediaRecorder codec support
