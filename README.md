# Alterroom

A lightweight, browser-based photo editor. The goal: apply your own Lightroom-style presets, fast, even on low-end laptops.

Edits run on the GPU using WebGL shaders, so sliders update in real time.

## Features (v0.3)

- **Light:** Exposure, Contrast, Highlights, Shadows, Whites, Blacks
- **Colour:** Temperature, Tint, Vibrance, Saturation
- Edits in **linear ProPhoto RGB**, the same working space Lightroom uses
- **Halo-free Highlights and Shadows** using an edge-aware guided filter
- Beginner / Pro modes, collapsible panels, coloured slider tracks, a tip for every slider
- Eye button per panel to switch its edits off; hold `\` or the button to see the original
- Smooth on large photos: preview at screen size, export at full resolution
- **Lightroom match meter:** load a Lightroom or Camera Raw export and see how closely Alterroom matches it

## Getting started

```bash
npm install
npm run dev
```

Then open the link Vite prints (usually http://localhost:5173).

## How it works

| File | What it does |
| --- | --- |
| `src/gl/shaders.ts` | GPU code: the edge-aware mask passes and the main per-pixel edit |
| `src/gl/renderer.ts` | Sets up WebGL, builds the mask once per photo, draws the preview and exports |
| `src/gl/color.ts` | Colour maths: sRGB ↔ ProPhoto matrices and Bradford white balance |
| `src/gl/tuning.ts` | Tuning knobs that control how closely each slider matches Lightroom |
| `src/accuracy.ts` | Match meter: compares against a reference image using ΔE in Lab colour space |
| `src/ui/` | Panels, sliders and slider definitions (ranges, help text, track colours) |
| `src/App.tsx` | Puts it together: open, edit, before/after, export |

**Edit order:** sRGB → linear ProPhoto → white balance → exposure (with highlight roll-off) → highlights/shadows (edge-aware) → whites/blacks → contrast → vibrance → saturation → sRGB.

**Highlights/Shadows** use a guided filter (He et al., 2010) on a small copy of the photo's log brightness. That gives a smooth brightness map that still stops at edges, so a whole region can be brightened without glowing halos.

## Measuring accuracy

Match score = % of pixels with ΔE (CIE76) below 2.3, the "just noticeable difference".
The target is **95%+ per slider**, tested against Adobe Camera Raw exports of JPEG photos (sRGB, sharpening and noise reduction off).

## Roadmap

- [x] v0.1 Load image, WebGL pipeline, 3 sliders, export
- [x] v0.2 Screen-size preview + full-res export, Lightroom ranges, match meter
- [x] v0.3 Linear ProPhoto, Temp/Tint, Highlights/Shadows/Whites/Blacks, Vibrance, beginner-friendly panels
- [ ] Tune every slider to 95%+ match against Lightroom exports
- [ ] v0.4 `.xmp` preset import, `.cube` LUTs, colour grading wheels, tone curve, HSL
- [ ] v0.5 Library of up to 100 photos, copy/paste settings
- [ ] v0.6 Batch export to a zip
- [ ] v0.7 RAW and HEIC
- [ ] v0.8 Clarity, Texture, sharpening, noise reduction, calibration, dehaze

## Note

Alterroom is an independent project and isn't affiliated with Adobe. Imported presets are approximated, so results will be close to Lightroom but not identical.
