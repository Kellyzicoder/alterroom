# Lightroom tuner

Measures how close Alterroom's sliders are to Lightroom, and tunes them to get closer.

## 1. Make reference exports in Lightroom Classic

Use a JPEG photo. On a virtual copy, reset all settings, then export one JPEG per slider change, named like this:

| File | Slider |
| --- | --- |
| `baseline` | no changes |
| `exposure_p1`, `exposure_p2`, `exposure_m1`, `exposure_m2` | Exposure +1, +2, −1, −2 |
| `contrast_p50`, `contrast_p100`, `contrast_m50`, `contrast_m100` | Contrast |
| `highlights_p100`, `highlights_m100`, `shadows_…`, `whites_…`, `blacks_…` | ±100 |
| `temp_p50`, `temp_m50`, `tint_p50`, `tint_m50` | ±50 |
| `vibrance_p100`, `vibrance_m100`, `saturation_p50`, `saturation_m50` | |

Export settings: JPEG, quality 100, sRGB, no resizing, no output sharpening.

## 2. Run it

Once: `npx playwright install chromium` and `pip3 install numpy scipy pillow`.

```bash
python3 tools/tune/prep.py path/to/original.jpg "path/to/exports folder"
npm run tune:measure   # measures Lightroom's curves → src/gl/measured.ts (a few minutes)
npm run tune:score     # match score for every slider
npm run tune           # searches the knobs in src/gl/tuning.ts; copy the printed values in
```

**Match score** = % of pixels where the colour difference (ΔE) is under 2.3, about the smallest difference people can see.

## What it found (Oct 2026, one photo)

- Lightroom treats a JPEG as if a tone curve had already been applied. It undoes that curve, multiplies for
  Exposure and White Balance, then puts the curve back, without shifting hue. `EXPAND` in `measured.ts` is that curve.
- White balance acts like Bradford cone gains, scaled so no channel gets darker.
- Saturation works on the "undone" (scene) values.
- Contrast, Whites + and Blacks − are measured curves. The other sides of Whites and Blacks, plus Highlights and Shadows,
  are formulas with tuned knobs.
- Vibrance isn't figured out yet.

All of this comes from one dark, very magenta photo. More photos (daylight, skin, sky, greens) will make it more reliable.
