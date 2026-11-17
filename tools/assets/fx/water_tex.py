"""Seamless water textures for the fountain: a ripple/caustic layer (tiles in x and y) and a falling-water jet (tiles in y).

Both are made from periodic noise (random spectrum, inverse FFT), so the seams are exact. Stored the way the additive particles are:
straight alpha, alpha = intensity, rgb = the colour (see build_fx.py).
Usage: python -I water_tex.py <out_dir>
"""
import os
import sys

import numpy as np
from PIL import Image

TINT = np.array([0.78, 0.93, 1.0])


def periodic_noise(h, w, kmin, kmax, aniso=(1.0, 1.0), power=1.4, seed=0):
    """Zero-mean periodic noise with a band-limited power-law spectrum (`aniso` stretches the frequencies in y, x)."""
    rng = np.random.default_rng(seed)
    ky = np.fft.fftfreq(h)[:, None] * h / aniso[0]
    kx = np.fft.fftfreq(w)[None, :] * w / aniso[1]
    k = np.sqrt(kx**2 + ky**2)
    amp = np.where((k >= kmin) & (k <= kmax), 1.0 / np.maximum(k, 1e-6) ** power, 0.0)
    spec = amp * np.exp(2j * np.pi * rng.random((h, w)))
    n = np.real(np.fft.ifft2(spec))
    return n / (n.std() + 1e-9)


def save_additive(intensity, path):
    i = np.clip(intensity, 0, 1)
    rgb = np.broadcast_to(TINT[None, None, :], i.shape + (3,))
    rgba = np.dstack([rgb, i])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(path)


def ripple_layer(size=512, repeat=2, time=4.2, sharp=8.0):
    """The network of light on a pool floor: iterated sine warping on a torus (periodic by construction), `repeat` cells across."""
    # the -250 keeps the divisions below tame, as in the shader this pattern comes from; the angle itself repeats `repeat` times
    t = np.mod((np.arange(size) + 0.5) / size * 2 * np.pi * repeat, 2 * np.pi) - 250.0
    px, py = np.meshgrid(t, t)
    ix, iy = px.copy(), py.copy()
    c = np.ones_like(px)
    inten = 0.005
    for n in range(5):
        tt = time * (1.0 - 3.5 / (n + 1))
        ix, iy = px + (np.cos(tt - ix) + np.sin(tt + iy)), py + (np.sin(tt - iy) + np.cos(tt + ix))
        c = c + 1.0 / np.sqrt((px / (np.sin(ix + tt) / inten + 1e-9)) ** 2 + (py / (np.cos(iy + tt) / inten + 1e-9)) ** 2)
    c = c / 5.0
    c = 1.17 - np.power(np.abs(c), 1.4)
    i = np.power(np.abs(c), sharp)
    return i / max(np.percentile(i, 99.5), 1e-6)


def ripple(size=512):
    """Two scales and phases mixed, so the pattern does not read as one stamp repeated."""
    a = ripple_layer(size, 1, 4.2, 7.0)
    b = ripple_layer(size, 3, 1.7, 8.0)
    return np.clip(np.maximum(a, 0.75 * b) * 1.15, 0, 1)


def jet(h=512, w=128):
    # long vertical streaks: low frequency along y, higher across x
    n = periodic_noise(h, w, 2, 16, aniso=(0.28, 1.0), power=0.9, seed=3)
    s = np.clip((n + 0.35) / 1.5, 0, 1) ** 1.2
    xs = (np.arange(w) + 0.5) / w
    # soft edges left and right (never a hard cut), a little brighter in the middle
    env = np.sin(np.pi * xs) ** 0.7
    core = np.exp(-(((xs - 0.5) / 0.28) ** 2))
    i = s * env * (0.55 + 0.45 * core)
    return i / max(i.max(), 1e-6)


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    save_additive(ripple(), os.path.join(out, "fx_water_ripple.png"))
    save_additive(jet(), os.path.join(out, "fx_water_jet.png"))
    print("water textures written to", out)
