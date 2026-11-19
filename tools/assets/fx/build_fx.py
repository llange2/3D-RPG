"""Builds the fx source sheets from the user's grey particle pack, the Governor images and the procedural water textures.

Convention for every additive picture (particles, flipbooks, water): STRAIGHT alpha, alpha = intensity and rgb = the colour at full brightness (white for the grey sprites, so the
game can tint them). The game blends them with SRC_ALPHA + ONE, so the colour under alpha 0 never counts (a lossy encoder lets colour leak into transparent pixels; with
premultiplied pictures and ONE + ONE that showed as light squares around the glows). Smoke is the same, drawn with normal blending.

Usage: python -I build_fx.py <pack_dir> <raw_dir> <out_dir> [what]    what = particles | smoke | impacts | all
"""
import json
import os
import sys

import numpy as np
from PIL import Image


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def on_black(path):
    """The picture composited on black: float rgb 0..1 (this is what additive blending shows)."""
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    return np.asarray(bg.convert("RGB"), dtype=np.float64) / 255.0


def intensity(rgb):
    return rgb.max(axis=2)


def window(h, w, margin=0.07):
    """1 inside, falling to 0 over `margin` of the size at every edge: no content reaches the rim of a cell."""
    ys = (np.arange(h) + 0.5) / h
    xs = (np.arange(w) + 0.5) / w
    wy = smooth(0.0, margin, ys) * smooth(0.0, margin, 1 - ys)
    wx = smooth(0.0, margin, xs) * smooth(0.0, margin, 1 - xs)
    return wy[:, None] * wx[None, :]


def resize(rgb, size):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").resize(size, Image.LANCZOS)
    return np.asarray(im, dtype=np.float64) / 255.0


def fit_cell(rgb, cell, fill=0.84, grey=False, crop=True):
    """Crop to the content, scale it into `fill` of the cell, centre it. Returns float rgb (cell, cell, 3), premultiplied."""
    if grey:
        l = rgb.max(axis=2)
        rgb = np.dstack([l, l, l])
    inten = intensity(rgb)
    if crop:
        ys, xs = np.where(inten > 0.04)
        if len(ys) == 0:
            return np.zeros((cell, cell, 3))
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        pad = int(0.04 * max(y1 - y0, x1 - x0))
        y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
        y1, x1 = min(rgb.shape[0], y1 + pad), min(rgb.shape[1], x1 + pad)
        rgb = rgb[y0:y1, x0:x1]
    h, w = rgb.shape[:2]
    scale = cell * fill / max(h, w)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    small = resize(rgb, (nw, nh)) * window(nh, nw, 0.05)[..., None]
    out = np.zeros((cell, cell, 3))
    oy, ox = (cell - nh) // 2, (cell - nw) // 2
    out[oy:oy + nh, ox:ox + nw] = small
    return out


def to_rgba_additive(rgb):
    """Premultiplied glow (colour on black) to straight alpha: alpha is the brightest channel, rgb the colour brought to full brightness (white where there is no light)."""
    a = intensity(rgb)
    straight = np.where(a[..., None] > 0.01, rgb / np.maximum(a[..., None], 1e-6), 1.0)
    return np.dstack([np.clip(straight, 0, 1), a])


def save_rgba(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path, optimize=True)


def procedural_drop(size=512):
    """A round droplet: a bright rim, a clear middle, a highlight at the upper left (grey, additive)."""
    ys, xs = np.mgrid[0:size, 0:size]
    x = (xs + 0.5) / size * 2 - 1
    y = (ys + 0.5) / size * 2 - 1
    r = np.sqrt(x * x + y * y)
    disc = smooth(1.0, 0.9, r)
    rim = np.exp(-(((r - 0.82) / 0.1) ** 2))
    body = 0.16 * smooth(1.0, 0.0, r)
    hx, hy = x + 0.38, y + 0.4
    hl = np.exp(-((hx * hx + hy * hy) / 0.012))
    hl2 = 0.35 * np.exp(-(((x - 0.32) ** 2 + (y - 0.38) ** 2) / 0.02))
    i = np.clip((0.7 * rim + body + hl + hl2) * disc, 0, 1)
    return np.dstack([i, i, i])


def blur_mist(rgb, radius=10):
    """A smoke puff as additive mist: softer, lower contrast."""
    from PIL import ImageFilter

    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(radius))
    a = np.asarray(im, dtype=np.float64) / 255.0
    return np.clip(a * 0.85, 0, 1)


# Row-major cells of fx_particles.png (8 x 8, 128 px). (name, kind, source)
PARTICLES = [
    ("dot", "pack", "circle_05"), ("spark", "pack", "star_04"), ("flame_tongue", "pack", "flame_05"), ("drop_teardrop", "raw", "spr_droplet"),
    ("drop_round", "proc", "drop"), ("splash_crown", "raw", "spr_splash"), ("ripple_ring", "pack", "circle_02"), ("bubble", "raw", "spr_bubble"),
    ("mist_a", "mist", "smoke_04"), ("mist_b", "mist", "smoke_05"), ("mist_c", "mist", "smoke_07"), ("steam_wisp", "pack", "trace_05"),
    ("dust", "pack", "dirt_01"), ("light_ring", "pack", "light_02"), ("snowflake", "raw", "spr_snowflake"), ("flare", "pack", "flare_01"),
    ("ice_shard_a", "raw", "spr_ice_shard_a"), ("ice_shard_b", "raw", "spr_ice_shard_b"), ("frost_glint", "pack", "star_07"), ("acid_blob", "raw", "spr_acid_blob"),
    ("acid_bubble", "raw", "spr_acid_bubble"), ("magic_spark_8", "pack", "star_08"), ("magic_wisp", "pack", "twirl_01"), ("cross_glint", "pack", "star_06"),
    ("magic_compass", "pack", "magic_03"), ("magic_cross_glow", "pack", "magic_05"), ("soft_star", "pack", "star_05"), ("lightning_bolt", "pack", "spark_05"),
    ("lightning_arc", "pack", "spark_07"), ("flame_jet", "pack", "muzzle_03"), ("slash_crescent", "pack", "slash_01"), ("burst_sparks", "pack", "scorch_01"),
    ("fire_puff_a", "pack", "fire_01"), ("fire_puff_b", "pack", "fire_02"), ("flame_cloud_a", "pack", "flame_01"), ("flame_cloud_b", "pack", "flame_02"),
    ("glow_rings", "pack", "light_01"), ("ring_soft", "pack", "circle_01"), ("ring_double", "pack", "circle_03"), ("swirl", "pack", "twirl_02"),
]
SMOKE = ["smoke_04", "smoke_05", "smoke_07", "smoke_10"]
IMPACTS = ["fire", "ice", "acid", "magic", "water"]


def load_source(kind, name, pack, raw):
    if kind == "proc":
        return procedural_drop()
    if kind == "raw":
        return on_black(os.path.join(raw, name + ".png"))
    rgb = on_black(os.path.join(pack, name + ".png"))
    if kind == "mist":
        return blur_mist(rgb)
    return rgb


def build_particles(pack, raw, out):
    cell, cols = 128, 8
    sheet = np.zeros((cols * cell, cols * cell, 4))
    index = []
    for n, (name, kind, src) in enumerate(PARTICLES):
        if kind == "raw" and not os.path.exists(os.path.join(raw, src + ".png")):
            print("missing raw", src, "- cell left empty")
            index.append({"name": name, "cell": n, "present": False})
            continue
        rgb = fit_cell(load_source(kind, src, pack, raw), cell, grey=True)
        y, x = divmod(n, cols)
        sheet[y * cell:(y + 1) * cell, x * cell:(x + 1) * cell] = to_rgba_additive(rgb)
        index.append({"name": name, "cell": n, "source": src})
    save_rgba(sheet, os.path.join(out, "fx_particles.png"))
    return index


def build_smoke(pack, out):
    cell = 256
    sheet = np.zeros((cell, cell * len(SMOKE), 4))
    for n, name in enumerate(SMOKE):
        im = Image.open(os.path.join(pack, name + ".png")).convert("RGBA")
        a = np.asarray(im, dtype=np.float64) / 255.0
        if a[..., 3].min() > 0.98:  # opaque: the picture is on black, so brightness is the coverage
            l = a[..., :3].max(axis=2)
            a = np.dstack([np.full_like(l, 0.8), np.full_like(l, 0.8), np.full_like(l, 0.8), l])
        # to a straight-alpha cell: crop, scale, fade at the rim (rgb stays grey, only the alpha falls off)
        mask = a[..., 3]
        ys, xs = np.where(mask > 0.04)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = a[y0:y1, x0:x1]
        h, w = crop.shape[:2]
        scale = cell * 0.92 / max(h, w)
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        small = np.asarray(Image.fromarray((crop * 255 + 0.5).astype(np.uint8), "RGBA").resize((nw, nh), Image.LANCZOS), dtype=np.float64) / 255.0
        small[..., 3] *= window(nh, nw, 0.06)
        oy, ox = (cell - nh) // 2, (cell - nw) // 2
        sheet[oy:oy + nh, n * cell + ox:n * cell + ox + nw] = small
    save_rgba(sheet, os.path.join(out, "fx_smoke.png"))


FRAMES, FCELL = 16, 512  # 512 px per frame (18. 11. 2026: 256 px looked pixelated; the raw pictures are 1024 px)


def flipbook(base_rgb, frame_cell=FCELL, frames=FRAMES):
    """One burst picture becomes `frames` frames: it swells fast, shines, then burns out from the edge inwards (a rising threshold on its brightness)."""
    # the middle of the cell is the point of impact: move the picture so that its centre of brightness lies there
    inten0 = intensity(base_rgb) ** 2
    hh, ww = inten0.shape
    cy = (inten0.sum(axis=1) * np.arange(hh)).sum() / inten0.sum()
    cx = (inten0.sum(axis=0) * np.arange(ww)).sum() / inten0.sum()
    shift = Image.fromarray((np.clip(base_rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").transform(
        (ww, hh), Image.AFFINE, (1, 0, cx - ww / 2, 0, 1, cy - hh / 2), resample=Image.BICUBIC)
    base_rgb = np.asarray(shift, dtype=np.float64) / 255.0
    inten = intensity(base_rgb)
    sheet = np.zeros((4 * frame_cell, 4 * frame_cell, 4))
    for k in range(frames):
        t = k / (frames - 1)
        # swells fast and keeps growing slowly (ease out), burns out from the edge inwards from early on, flashes first and then dims
        s = 0.2 + 0.95 * (1 - (1 - t) ** 2)
        th = 0.85 * smooth(0.18, 1.0, t)
        gain = (0.3 + 0.7 * smooth(0.0, 0.12, t)) * (1.0 - 0.4 * smooth(0.15, 0.7, t)) * (1 - smooth(0.72, 1.0, t))
        size = max(8, round(frame_cell * 0.92 * s))
        turned = Image.fromarray((np.clip(base_rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").rotate(-14 * t, resample=Image.BICUBIC)
        rgb = resize(np.asarray(turned, dtype=np.float64) / 255.0, (size, size))
        l = rgb.max(axis=2)
        mask = smooth(th, th + 0.22, l) if th > 0 else np.ones_like(l)
        rgb = rgb * (mask * gain)[..., None] * window(size, size, 0.06)[..., None]
        cell_img = np.zeros((frame_cell, frame_cell, 3))
        oy, ox = (frame_cell - size) // 2, (frame_cell - size) // 2
        if size <= frame_cell:
            cell_img[oy:oy + size, ox:ox + size] = rgb
        else:  # the last frames are a little larger than the cell: take the middle
            cy = (size - frame_cell) // 2
            cell_img = rgb[cy:cy + frame_cell, cy:cy + frame_cell]
            cell_img = cell_img * window(frame_cell, frame_cell, 0.06)[..., None]
        y, x = divmod(k, 4)
        sheet[y * frame_cell:(y + 1) * frame_cell, x * frame_cell:(x + 1) * frame_cell] = to_rgba_additive(cell_img)
    return sheet


# 19. 11. 2026: the user now delivers fire, ice, acid and magic as FINISHED 4x4 sheets (2048², 16 frames of 512, .ignore/impact_<name>.png), no longer as one burst picture.
# Fire, ice and acid are drawn on white paper, magic on a baked-in grey checkerboard ("transparency" of an image editor, 40 x 40 squares, dark first). Both are turned back
# into straight alpha: the paper/checker colour is the known background, the brightest channel of the pure colour counts as 1.
SHEET_BACKGROUNDS = {"fire": "white", "ice": "white", "acid": "white", "magic": "checker"}
CHECKER_SQUARES = 40
CHECKER_DARK, CHECKER_LIGHT = 46.5 / 255, 100.5 / 255  # measured in the top-left corner of impact_magic.png


def checker_background(size):
    """The baked-in checkerboard as a grey value per pixel (anti-aliased by 2x supersampling)."""
    ss = 2
    ys, xs = (np.mgrid[0:size * ss, 0:size * ss].astype(np.float32) + 0.5) / ss
    square = size / CHECKER_SQUARES
    parity = (np.floor(xs / square) + np.floor(ys / square)) % 2
    bg = np.where(parity == 0, CHECKER_DARK, CHECKER_LIGHT).astype(np.float32)
    return bg.reshape(size, ss, size, ss).mean(axis=(1, 3))


def unmix_white(rgb, cell):
    """Picture on white paper -> straight alpha. Ink density is the alpha, the colour is the ink at full brightness; the pale hot core inside the burst (white, yellow-white)
    would vanish with that rule (white paper = nothing), so inside the silhouette bright and pale pixels near the middle of a frame turn opaque."""
    from scipy import ndimage
    mn = rgb.min(axis=2)
    a = np.clip(((1 - mn) - 0.02) / 0.98, 0, 1)
    c = (rgb - mn[..., None]) / np.maximum(1 - mn, 1e-4)[..., None]
    c = np.where((a > 0)[..., None], c, 1.0)
    inside = ndimage.binary_fill_holes(mn < 0.9).astype(np.float64)
    inside = ndimage.gaussian_filter(inside, 2)
    ys, xs = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
    r = np.hypot(xs % cell - cell / 2, ys % cell - cell / 2)
    # the last frames have no core any more, only a pale haze that must stay a haze (it turned into white blotches)
    frame = (ys // cell) * 4 + xs // cell
    frame_fade = smooth(14, 10, frame)
    # hot = the second brightest channel is high (yellow-white fire, cyan-white ice, pale acid) but the pixel still carries ink: pure paper is a hole, not light
    hot = smooth(0.82, 0.97, np.sort(rgb, axis=2)[..., 1]) * smooth(0.99, 0.94, mn) * smooth(0.28 * cell, 0.15 * cell, r) * frame_fade
    heart = smooth(0.84, 0.94, rgb.mean(axis=2)) * smooth(0.12 * cell, 0.05 * cell, r) * frame_fade  # the very middle may be pure white: that is the point of impact
    core = np.maximum(hot, heart) * inside
    pale = rgb / np.maximum(rgb.max(axis=2), 1e-4)[..., None]
    c = c * (1 - core[..., None]) + pale * core[..., None]
    return c, np.maximum(a, core)


def unmix_checker(rgb, cell):
    """Picture on the baked-in checkerboard -> straight alpha (pixel = bg * (1 - a) + colour * a, brightest channel of the colour = 1).
    The alpha model gives the same colour on dark and light squares; adding the glow to the checker did not."""
    bg = checker_background(rgb.shape[0])[..., None]
    a = np.clip((rgb.max(axis=2, keepdims=True) - bg) / (1 - bg), 0, 1)
    a = np.clip((a - 0.09) / 0.91, 0, 1)  # the paper noise of the background must not become a haze
    c = np.clip((rgb - bg * (1 - a)) / np.maximum(a, 1e-3), 0, 1)
    return c, a[..., 0]


def sheet_impact(path, kind, frame_cell=FCELL):
    """A finished 4x4 sheet -> the game's flipbook (straight alpha, 4 x 4 frames of `frame_cell`)."""
    im = Image.open(path).convert("RGB")
    side = 4 * frame_cell
    if im.size != (side, side):
        im = im.resize((side, side), Image.LANCZOS)
    rgb = np.asarray(im, dtype=np.float64) / 255.0
    c, a = (unmix_white if kind == "white" else unmix_checker)(rgb, frame_cell)
    # no content may reach the rim of a frame (neighbouring frames lean over: the spikes of the magic star cross the borders)
    win = np.tile(window(frame_cell, frame_cell, 0.05), (4, 4))
    return np.dstack([np.clip(c, 0, 1), np.clip(a * win, 0, 1)])


def build_sheet_impacts(raw, out):
    done = []
    for name, kind in SHEET_BACKGROUNDS.items():
        p = os.path.join(raw, "impact_%s.png" % name)
        if not os.path.exists(p):
            print("missing", p)
            continue
        save_rgba(sheet_impact(p, kind), os.path.join(out, "fx_impact_%s.png" % name))
        done.append(name)
    return done


def build_impacts(raw, out):
    done = []
    for name in IMPACTS:
        p = os.path.join(raw, "impact_%s.png" % name)
        if not os.path.exists(p):
            print("missing", p)
            continue
        save_rgba(flipbook(on_black(p)), os.path.join(out, "fx_impact_%s.png" % name))
        done.append(name)
    return done


if __name__ == "__main__":
    pack, raw, out = sys.argv[1:4]
    what = sys.argv[4] if len(sys.argv) > 4 else "all"
    os.makedirs(out, exist_ok=True)
    if what in ("particles", "all"):
        idx = build_particles(pack, raw, out)
        json.dump({"file": "fx_particles.png", "grid": [8, 8], "cell": 128, "cells": idx}, open(os.path.join(out, "fx_particles.json"), "w", encoding="utf-8"), indent=1)
    if what in ("smoke", "all"):
        build_smoke(pack, out)
    if what in ("impacts", "all"):
        print("impacts:", build_impacts(raw, out))
    if what == "sheets":  # the finished sheets of the user (fire, ice, acid, magic); water still comes from impacts
        print("sheets:", build_sheet_impacts(raw, out))
