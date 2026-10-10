"""Measure Lightroom's tone curves from the reference exports and write src/gl/measured.ts.

Usage: python3 tools/tune/measure.py      (after prep.py; needs numpy, scipy, pillow; takes a few minutes)

1. EXPAND: one curve G (display level -> scene brightness) so that, for every Exposure export,
   Lightroom's result = compress(2^EV * expand(original)), applied hue-preservingly.
2. One curve per export for Contrast ±50/±100 and Whites +100 (hue-preserving) and Blacks −100 (per channel).
"""
import os, json
import numpy as np
from scipy.optimize import least_squares
from lib import L, toP, fromP, rgbtone, lin, enc, score

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(2)
O = L('original').reshape(-1, 3)
bright = np.where(O.max(1) > 0.75)[0]  # add extra bright pixels so the top of the curves is well measured
idx = np.concatenate([rng.choice(len(O), 24000, replace=False), rng.choice(bright, min(6000, len(bright)), replace=False)])
P = toP(O[idx])
UNIFORM = slice(0, 24000)  # Whites and Blacks match better when fitted on an even sample
K = np.array([0, 2, 4, 6, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 216, 224, 232, 240, 244, 248, 252, 255]) / 255
smooth = lambda t, w: w * np.diff(t, 2) * 255


def fit_expand():
    refs = {ev: L(n).reshape(-1, 3)[idx] for ev, n in [(1, 'exposure_p1'), (2, 'exposure_p2'), (-1, 'exposure_m1'), (-2, 'exposure_m2')]}

    def table(u):  # log G goes up at every knot; G(white) = 1
        lg = np.concatenate([[0], np.cumsum(np.exp(u))])
        return np.concatenate([[0], np.exp(lg - lg[-1])])

    def model(G, ev):
        f = lambda v: lin(np.interp(np.minimum(np.interp(enc(v), K, G) * 2.0 ** ev, 1), G, K))
        return fromP(rgbtone(P, f))

    def res(u):
        G = table(u)
        return np.concatenate([(model(G, ev) - R).ravel() * 255 for ev, R in refs.items()] + [smooth(np.log(G[1:]), 3)])

    u0 = np.log(np.diff(np.log(np.maximum(lin(K[1:]), 1e-6))).clip(1e-3))
    G = table(least_squares(res, u0, max_nfev=1500).x)
    for ev, R in refs.items():
        print('exposure %+d: match %.1f%%, avg ΔE %.2f' % ((ev,) + score(model(G, ev), R)), flush=True)
    return G


def fit_curve(name, hue_preserving, part=slice(None)):
    R = L(name).reshape(-1, 3)[idx][part]
    X = P[part]
    table = lambda u: np.minimum(np.concatenate([[u[0]], u[0] + np.cumsum(u[1:])]), 1)

    def model(T):
        f = lambda v: lin(np.interp(enc(v), K, T))
        return fromP(rgbtone(X, f) if hue_preserving else f(X))

    def res(u):  # last term: the curve may not go above white
        T = table(u)
        return np.concatenate([(model(T) - R).ravel() * 255, smooth(T, 2), [max(0, u[0] + u[1:].sum() - 1) * 1000]])

    T = table(least_squares(res, np.concatenate([[0], np.diff(K)]), bounds=(0, 1), max_nfev=600).x)
    print('%s: match %.1f%%, avg ΔE %.2f' % ((name,) + score(model(T), R)), flush=True)
    return T


def num(x, d):
    s = f'{x:.{d}f}'
    s = s.rstrip('0').rstrip('.') if '.' in s else s
    return '0' if s in ('', '-0') else s


arr = lambda a, d=5: '[' + ', '.join(num(float(x), d) for x in a) + ']'

G = fit_expand()
c = {n: fit_curve(n, True) for n in ['contrast_p100', 'contrast_p50', 'contrast_m50', 'contrast_m100']}
c['whites_p100'] = fit_curve('whites_p100', True, UNIFORM)
blacks = fit_curve('blacks_m100', False, UNIFORM)
json.dump({'knots': K.tolist(), 'expand': G.tolist(), 'curves': {k: v.tolist() for k, v in c.items()}, 'blacks_m100': blacks.tolist()},
          open(os.path.join(HERE, 'measured.json'), 'w'))

ts = f'''/**
 * Lightroom behaviour measured from reference exports (Lightroom Classic, JPEG photo, one slider changed at a time).
 * Made by tools/tune/measure.py. Values are display levels 0..1 at the knots below (0..255 scale).
 *
 * EXPAND: Lightroom treats a JPEG as if a tone curve had already been applied to it. Undoing that curve gives
 * "scene" brightness (white = 1), where Exposure and White Balance are simple multiplications.
 * The curves are applied hue-preservingly (on the largest and smallest channel, like Adobe's DNG SDK).
 */
export const KNOTS = {arr(np.round(K * 255), 0)}
export const EXPAND = {arr(G, 6)}
/** Contrast measured at these slider values: display in → display out. */
export const CONTRAST: Record<number, number[]> = {{
  100: {arr(c['contrast_p100'])},
  50: {arr(c['contrast_p50'])},
  [-50]: {arr(c['contrast_m50'])},
  [-100]: {arr(c['contrast_m100'])},
}}
/** Whites +100: display in → display out, applied without shifting hue. */
export const WHITES_UP = {arr(c['whites_p100'])}
/** Blacks −100: display in → display out, applied to each channel on its own. */
export const BLACKS_DOWN = {arr(blacks)}
'''
open(os.path.join(HERE, '..', '..', 'src', 'gl', 'measured.ts'), 'w').write(ts)
print('wrote src/gl/measured.ts')
