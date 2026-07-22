# aural canvas 2.0 — release notes

Desktop-focused high-performance release. v1.0 remains available at [releases](https://github.com/rbarnabas/AuralCanvas/releases).

## fixes

- **no click pop** — smoother exponential gain ramps on all voices
- **axis tool overlay** — crosshair visible only when axis tool is selected; hidden during recording (never in export video)
- **audiowide font** — global GUI typography, lowercase labels

## new features

- **4k export** — post-render upscale to 3840×2160 webm or mp4 (live canvas unchanged)
- **mini daw** — docked / pop-out multitrack panel with:
  - 4 tracks, arm/solo/mute
  - per-track volume, pan, EQ, compression, reverb, echo
  - canvas recordings route to armed track when daw is open
  - hi-res mix export (16/24-bit wav, 44.1–192 kHz)

## install

Download **v2.0.0** from GitHub Releases (.dmg / .exe) or run locally:

```bash
npm install
npm start
```

## tag

```bash
git tag v2.0.0
git push origin v2.0.0
```
