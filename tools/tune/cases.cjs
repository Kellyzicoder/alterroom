// Each reference export, the slider value it was made with, and the tuning knobs that affect it (with search ranges).
// Exposure, Contrast, Whites + and Blacks − have no knobs: they use measured curves (run measure.py).
const R = (ref, adj) => ({ ref, adj })
module.exports = [
  { name: 'Exposure', params: {}, refs: [R('exposure_p1', { exposure: 1 }), R('exposure_p2', { exposure: 2 }), R('exposure_m1', { exposure: -1 }), R('exposure_m2', { exposure: -2 })] },
  { name: 'Contrast', params: {}, refs: [R('contrast_p50', { contrast: 50 }), R('contrast_p100', { contrast: 100 }), R('contrast_m50', { contrast: -50 }), R('contrast_m100', { contrast: -100 })] },
  { name: 'Highlights+', params: { highlightsUp: [0.2, 6], 'highlightsZoneUp.0': [-0.5, 0.9], 'highlightsZoneUp.1': [0.1, 2] }, refs: [R('highlights_p100', { highlights: 100 })] },
  { name: 'Highlights-', params: { highlightsDown: [0.2, 6], 'highlightsZoneDown.0': [-0.5, 0.9], 'highlightsZoneDown.1': [0.1, 2] }, refs: [R('highlights_m100', { highlights: -100 })] },
  { name: 'Shadows+', params: { shadowsUp: [0.2, 6], 'shadowsZoneUp.0': [-0.8, 0.6], 'shadowsZoneUp.1': [0.05, 1] }, refs: [R('shadows_p100', { shadows: 100 })] },
  { name: 'Shadows-', params: { shadowsDown: [0.2, 6], 'shadowsZoneDown.0': [-0.8, 0.6], 'shadowsZoneDown.1': [0.05, 1] }, refs: [R('shadows_m100', { shadows: -100 })] },
  { name: 'Whites+', params: {}, refs: [R('whites_p100', { whites: 100 })] },
  { name: 'Whites-', params: { whitesDown: [0.05, 6], whitesFromDown: [-1, 0.95] }, refs: [R('whites_m100', { whites: -100 })] },
  { name: 'Blacks+', params: { blacksUp: [0.05, 6], blacksToUp: [0.05, 1.5] }, refs: [R('blacks_p100', { blacks: 100 })] },
  { name: 'Blacks-', params: {}, refs: [R('blacks_m100', { blacks: -100 })] },
  { name: 'WhiteBalance', params: { miredPerStep: [0.5, 5], wbBaseK: [3500, 8000], duvPerStep: [0.00005, 0.002], tintK: [3500, 8000] }, refs: [R('temp_p50', { temp: 50 }), R('temp_m50', { temp: -50 }), R('tint_p50', { tint: 50 }), R('tint_m50', { tint: -50 })] },
  { name: 'Vibrance', params: { vibranceStrength: [0.1, 3], skinProtect: [0, 1] }, refs: [R('vibrance_p100', { vibrance: 100 }), R('vibrance_m100', { vibrance: -100 })] },
  { name: 'Saturation', params: { saturationStrength: [0.1, 3] }, refs: [R('saturation_p50', { saturation: 50 }), R('saturation_m50', { saturation: -50 })] },
]
