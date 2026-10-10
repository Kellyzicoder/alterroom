"""Prepare photos for the tuner.

Usage: python3 tools/tune/prep.py ORIGINAL.jpg "path/to/Lightroom exports"

Writes tools/tune/data/original_N.png and <export name>_N.png at 1/2 and 1/4 size
(N = 2 or 4). PNG keeps them lossless. The original is turned upright using its EXIF orientation.
"""
import sys, os, glob
from PIL import Image, ImageOps

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(out, exist_ok=True)
original = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')
exports = sorted(glob.glob(os.path.join(sys.argv[2], '*.jp*g')))
for k in (2, 4):
    original.reduce(k).save(f'{out}/original_{k}.png')
    for f in exports:
        name = os.path.splitext(os.path.basename(f))[0]
        Image.open(f).convert('RGB').reduce(k).save(f'{out}/{name}_{k}.png')
print(f'{len(exports)} exports + original saved to {out}')
