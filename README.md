# Alterroom

A lightweight, browser-based photo editor. The goal: apply your own Lightroom-style presets, fast, even on low-end laptops.

Edits run on the GPU using WebGL shaders, so sliders update in real time.

## Features (v0.1)

- Open a photo (click or drag-and-drop)
- Exposure, contrast and saturation sliders (double-click a value to reset it)
- Hold-to-compare before/after
- Export as JPG

## Getting started

```bash
npm install
npm run dev
```

Then open the link Vite prints (usually http://localhost:5173).

## How it works

| File | What it does |
| --- | --- |
| `src/gl/shaders.ts` | GPU code that runs for every pixel: sRGB ↔ linear conversion, exposure, contrast, saturation |
| `src/gl/renderer.ts` | Sets up WebGL, uploads the photo as a texture, draws it and exports it |
| `src/App.tsx` | UI: file open, sliders, before/after, export |

Exposure is applied in **linear light** (physically correct, like a camera); contrast and saturation are applied in display space.

## Roadmap

- [x] Load image, WebGL pipeline, 3 sliders, export
- [ ] Temperature, tint, highlights, shadows, vibrance
- [ ] Import Lightroom `.xmp` presets
- [ ] Save and load your own presets
- [ ] Preview at screen size and full resolution on export (faster on big photos)
- [ ] Batch apply a preset to multiple photos

## Note

Alterroom is an independent project and isn't affiliated with Adobe. Imported presets are approximated, so results will be close to Lightroom but not identical.
