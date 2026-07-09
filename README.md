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

## Run locally

Because the app uses ES modules, serve it over HTTP (opening `index.html` directly may not work in all browsers):

```bash
# Python 3
cd aural-canvas
python3 -m http.server 8080

# Then open http://localhost:8080
```

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
