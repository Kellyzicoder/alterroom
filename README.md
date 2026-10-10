# Alterroom

A lightweight, browser-based photo editor. The goal: apply your own Lightroom-style presets, fast, even on low-end laptops.

Edits run on the GPU using WebGL shaders, so sliders update in real time.

## Features (v0.5.1)

- **Library:** add up to 100 photos, filmstrip with live thumbnails, each photo keeps its own edits; ← → to move between photos
- **Copy and paste settings:** copy one photo's look and paste it onto the selected photos or all of them (⌘/Ctrl+Shift+C / V, like Lightroom)
- **Presets & LUTs:** load Lightroom presets (`.xmp`) and colour looks (`.cube` 3D LUTs, with an amount slider). Settings Alterroom can't do yet are listed, not silently dropped
- **Matched to Lightroom:** Exposure, Contrast, White Balance and Saturation use curves measured from real Lightroom exports (85–99% of pixels match)
- **Light:** Exposure, Contrast, Highlights, Shadows, Whites, Blacks
- **Colour:** Temperature, Tint, Vibrance, Saturation
- **Colour mix:** Hue, Saturation and Luminance for 8 colours
- **Colour grading:** three-wheel view plus single Shadows, Midtones, Highlights and Global wheels, with Luminance, Blending and Balance
- **Tone curve (Pro):** draggable RGB / Red / Green / Blue point curves plus a 4-region parametric curve
- Edits in **linear ProPhoto RGB**, with **halo-free Highlights and Shadows** (edge-aware guided filter)
- **Movable panels:** drag to reorder, pop out into floating windows (move, resize, dock back), resize the sidebar. Your layout is remembered
- Beginner / Pro modes, collapsible panels, coloured slider tracks, a tip for every control
- Eye button per panel to switch its edits off; hold `\` or the button to see the original
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
| `src/gl/tuning.ts` | Tuning knobs that control how closely each slider matches Lightroom (set by the auto-tuner) |
| `src/gl/measured.ts` | Lightroom's tone curves, measured from reference exports |
| `src/gl/tone.ts` | Turns the measured curves into lookup tables for the GPU |
| `src/gl/curve.ts` | Builds the tone curve lookup table (monotone cubic spline + parametric regions) |
| `src/edit.ts` | Every setting, its default, and the edit state (sliders, curves, LUT) |
| `src/io/xmp.ts` | Reads Lightroom `.xmp` presets (Camera Raw `crs:` settings) |
| `src/io/cube.ts` | Reads `.cube` 3D LUTs |
| `src/library.ts` | Photo library: file references, thumbnails, copying edits |
| `src/accuracy.ts` | Match meter: compares against a reference image using ΔE in Lab colour space |
| `src/ui/` | Panels, floating windows, saved layout, sliders, colour wheel, curve editor and control definitions |
| `src/App.tsx` | Puts it together: open, edit, before/after, export |
| `tools/tune/` | Auto-tuner: scores every slider against Lightroom exports and tunes the knobs ([how to use](tools/tune/README.md)) |

**Edit order:** sRGB → linear ProPhoto → undo the JPEG's tone curve (scene brightness) → white balance → exposure → highlights/shadows (edge-aware) → whites/blacks → put the curve back → contrast → vibrance → saturation → sRGB → tone curve → colour mix → colour grading → LUT.

**Why "undo the tone curve"?** Measured against Lightroom: it treats a JPEG as if a tone curve was already applied, undoes it, multiplies for Exposure and White Balance, then puts it back without shifting hue. Copying that took Exposure from 10–42% to 85–99% match.

**Highlights/Shadows** use a guided filter (He et al., 2010) on a small copy of the photo's log brightness. That gives a smooth brightness map that still stops at edges, so a whole region can be brightened without glowing halos.

## Measuring accuracy

Match score = % of pixels with ΔE (CIE76) below 2.3, the "just noticeable difference".
Scores below are against Lightroom Classic exports of one JPEG photo (half size, sRGB, no sharpening).

| Slider | Match |
| --- | --- |
| Exposure +1 / +2 / −1 / −2 | 95% / 82% / 99% / 98% |
| Contrast +50 / +100 / −50 / −100 | 97% / 88% / 98% / 92% |
| Temp +50 / −50 | 83% / 88% |
| Tint +50 / −50 | 97% / 96% |
| Saturation +50 / −50 | 96% / 99% |
| Whites +100 / −100 | 65% / 99% |
| Blacks +100 / −100 | 95% / 93% |
| Highlights +100 / −100 | 79% / 84% |
| Shadows +100 / −100 | 65% / 80% |
| Vibrance +100 / −100 | 51% / 43% |

Only one test photo so far (dark and very magenta), so treat these as early numbers. See [tools/tune](tools/tune/README.md) to add more.

## Roadmap

- [x] v0.1 Load image, WebGL pipeline, 3 sliders, export
- [x] v0.2 Screen-size preview + full-res export, Lightroom ranges, match meter
- [x] v0.3 Linear ProPhoto, Temp/Tint, Highlights/Shadows/Whites/Blacks, Vibrance, beginner-friendly panels
- [ ] Tune every slider to 95%+ match against Lightroom exports (auto-tuner done in v0.5.1; Exposure, Contrast, Tint, Saturation, Blacks mostly there)
- [x] v0.4 `.xmp` preset import, `.cube` LUTs, colour grading wheels, tone curve, colour mix (HSL)
- [x] v0.5 Library of up to 100 photos, copy/paste settings
- [ ] v0.6 Batch export to a zip
- [ ] v0.7 RAW and HEIC
- [ ] v0.8 Clarity, Texture, sharpening, noise reduction, calibration, dehaze

## Note

Alterroom is an independent project and isn't affiliated with Adobe. Imported presets are approximated, so results will be close to Lightroom but not identical.
