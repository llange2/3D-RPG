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


def flow(h=512, w=128):
    """The sheet of water that runs down the fountain (bug_fix_68): BLUE with its own opacity (straight alpha, drawn by alpha, not added: a pale picture added to a bright wall is white),
    streaks that run down, tiling in x and in y (the cone wraps round the column, the picture scrolls down it)."""
    n = periodic_noise(h, w, 2, 18, aniso=(0.25, 1.0), power=0.9, seed=11)
    fine = periodic_noise(h, w, 10, 40, aniso=(0.2, 1.0), power=0.6, seed=12)
    s = np.clip((n + 0.2) / 1.7, 0, 1) ** 1.1
    f = np.clip((fine + 0.5) / 2.0, 0, 1)
    streak = np.clip(0.75 * s + 0.35 * f, 0, 1)
    alpha = np.clip(0.3 + 0.46 * streak, 0, 1)
    deep = np.array([0.20, 0.50, 0.92])
    light = np.array([0.82, 0.94, 1.0])
    t = (streak ** 1.6)[:, :, None]
    rgb = deep[None, None, :] * (1 - t) + light[None, None, :] * t
    return rgb, alpha


def save_straight(rgb, alpha, path):
    rgba = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(path)


def water_drop(src, path, height=256):
    """The user's drop picture (`.ignore/water_drop.png`, tip up): cut to the drop, scaled to `height`, and the colour under the transparent rim set to the blue of the drop, so that
    bilinear filtering does not draw a grey fringe round it (the file has grey behind alpha 0)."""
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > 8)
    pad = 6
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, im.width), min(ys.max() + pad + 1, im.height))
    im = im.crop(box)
    arr = np.asarray(im).astype(np.float64)
    solid = arr[:, :, 3] > 200
    blue = arr[solid][:, :3].mean(axis=0)
    edge = arr[:, :, 3] < 40
    arr[edge, :3] = blue
    scale = height / arr.shape[0]
    out = Image.fromarray(arr.astype(np.uint8), "RGBA").resize((max(1, round(arr.shape[1] * scale)), height), Image.LANCZOS)
    out.save(path)
    return out.size


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    save_additive(ripple(), os.path.join(out, "fx_water_ripple.png"))
    save_straight(*flow(), os.path.join(out, "fx_water_flow.png"))
    if len(sys.argv) > 2:
        print("water drop", water_drop(sys.argv[2], os.path.join(out, "fx_water_drop.png")))
    print("water textures written to", out)
