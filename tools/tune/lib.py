"""Colour maths shared by measure.py (same matrices and formulas as src/gl/color.ts and src/accuracy.ts)."""
import numpy as np
from PIL import Image
S2X=np.array([[0.4124564,0.3575761,0.1804375],[0.2126729,0.7151522,0.072175],[0.0193339,0.119192,0.9503041]])
P2X=np.array([[0.7976749,0.1351917,0.0313534],[0.2880402,0.7118741,0.0000857],[0,0,0.82521]])
BR=np.array([[0.8951,0.2664,-0.1614],[-0.7502,1.7135,0.0367],[0.0389,-0.0685,1.0296]])
D65=np.array([0.95047,1,1.08883]); D50=np.array([0.96422,1,0.82521])
def adapt(s,d):
  a=BR@s; b=BR@d; return np.linalg.inv(BR)@np.diag(b/a)@BR
S2P=np.linalg.inv(P2X)@adapt(D65,D50)@S2X
P2S=np.linalg.inv(S2P)
PLUMA=P2X[1]
def lin(c): return np.where(c<=0.04045,c/12.92,((np.maximum(c,0)+0.055)/1.055)**2.4)
def enc(c): c=np.clip(c,0,1); return np.where(c<=0.0031308,c*12.92,1.055*c**(1/2.4)-0.055)
import os
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
def L(n,k=4): return np.asarray(Image.open(f'{DATA}/{n}_{k}.png')).astype(float)/255
def toP(d): return lin(d)@S2P.T
def fromP(p): return enc(p@P2S.T)
def rgbtone(x, f):
  """DNG SDK RefBaselineRGBTone: curve f on max & min channel, middle keeps its hue ratio."""
  mx=x.max(1); mn=x.min(1)
  fmx=f(mx); fmn=f(mn)
  d=np.where(mx-mn>1e-9,mx-mn,1)
  out=fmn[:,None]+(fmx-fmn)[:,None]*(x-mn[:,None])/d[:,None]
  return np.where((mx-mn>1e-9)[:,None],out,f(x))
# Lab ΔE76 like accuracy.ts
def lab(d):
  l=lin(d)@S2X.T/D65
  f=np.where(l>216/24389,np.cbrt(l),(24389/27*l+16)/116)
  return np.stack([116*f[:,1]-16,500*(f[:,0]-f[:,1]),200*(f[:,1]-f[:,2])],1)
def score(a,b):
  e=np.linalg.norm(lab(a)-lab(b),axis=1); return round(float((e<2.3).mean()*100),1), round(float(e.mean()),2)
