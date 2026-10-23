"""Paints the ground tiles that mix three terrains: `mix_<top left>_<top right>_<bottom left>_<bottom right>.jpg` in `sources/terrain-flat/`.

Why: the flat ground lays one painted tile on every corner of the map, and a tile shows one or two terrains. A road that crosses a coast on a bridge makes a
corner of cobblestone, land and water, for which the hand-painted set has no picture (`tools/dev/corner-keys.ts` counts them). This tool paints them with the
blending of the user's tile generator (`.ignore/Tile Generator/tile_blend.py`: a corner gradient with coastline noise, an edge softness, and a band of a
third texture along a border), reusing its functions, and fits it to the painted set:

  * Every pair of terrains was painted with its own softness and band (water against cobblestone has a dirt band 22 % wide, grass against water one of 10 %,
    stone against grass none): `STYLES` holds what was measured on the painted edge tiles (`.ignore/p23/fit2.py`).
  * A tile has four quarters; one terrain appears twice (`W`), the other two once (`T`, `U`). The tile is painted in two steps like two ordinary tiles:
    `T` against `U` first (the W quarters are given to whichever of the two is nearer), then `W` over the result, with the style of the pair `W`/`T` where
    `T` is nearer and of `W`/`U` where `U` is.
  * Along each side the tile has to be what the painted neighbour is: the outer 7 % of every side is replaced by the painted tile that has the same split on
    that side (a `grass`/`water` tile for a side that is half grass and half water, the plain tile for a side of one terrain), faded in so that no seam shows.

Usage: python tools/assets/gen-mixed-tiles.py [--force] [--only mix_a_b_c_d] [--land grass,snow,...] [--jobs 4]
Needs Pillow, numpy and scipy. Deterministic: the noise of a tile comes from its name.
"""

from __future__ import annotations

import argparse
import itertools
import re
import sys
import zlib
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.ndimage import distance_transform_edt

SRC = Path(__file__).resolve().parent / "sources" / "terrain-flat"
SIZE = 856
SEED = 206901
NOISE = 0.35
EDGE_MARGIN = 0.18
SEAM = 0.07  # share of a side that is taken over from the painted neighbour tile
QUALITY = 90

LAND = ["desert", "dirt", "grass", "snow", "swamp"]
TRIPLES_WITH = ("cobblestone", "water")

# (band terrain or None, softness % of the tile, band width % of the tile), fitted to the painted tiles of each pair (the lower the error the better).
STYLES: dict[frozenset, tuple[str | None, float, float]] = {
    frozenset(("cobblestone", "grass")): (None, 30, 0),
    frozenset(("cobblestone", "snow")): (None, 20, 0),
    frozenset(("cobblestone", "swamp")): (None, 20, 0),
    frozenset(("cobblestone", "desert")): (None, 20, 0),
    frozenset(("cobblestone", "dirt")): (None, 20, 0),
    frozenset(("cobblestone", "water")): ("dirt", 16, 22),
    frozenset(("grass", "water")): ("dirt", 25, 10),
    frozenset(("snow", "water")): (None, 25, 0),
    frozenset(("swamp", "water")): (None, 25, 0),
    frozenset(("dirt", "water")): (None, 25, 0),
    frozenset(("desert", "water")): ("grass", 25, 18),
}
DEFAULT_STYLE = (None, 25, 0)

# ---------------------------------------------------------------- the generator's own functions (tile_blend.py)


def derive_seed(seed: int, code: str) -> int:
    return (int(seed) * 1_000_003 + zlib.crc32(code.encode("utf-8"))) & 0xFFFFFFFF


def value_noise(size: int, seed: int, blur_radius: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    sigma = max(0.5, blur_radius)
    factor = max(1, int(sigma / 4))
    small = max(2, int(round(size / factor)))
    arr = rng.random((small, small)).astype(np.float32)
    a = ndimage.gaussian_filter(arr, sigma=sigma * small / size, mode="nearest")
    if small != size:
        a = ndimage.zoom(a, size / small, order=3, mode="nearest")
        a = a[:size, :size]
    a = a - a.mean()
    return a / (float(np.max(np.abs(a))) + 1e-6)


def edge_fade_window(size: int, margin_frac: float) -> np.ndarray:
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.minimum(np.minimum(xs, size - 1 - xs), np.minimum(ys, size - 1 - ys))
    w = np.clip(d / max(1.0, size * margin_frac), 0.0, 1.0)
    return w * w * (3 - 2 * w)


def corner_gradient(size: int, tl: float, tr: float, bl: float, br: float) -> np.ndarray:
    u = np.linspace(0.0, 1.0, size, dtype=np.float32)
    U, V = np.meshgrid(u, u)
    return (tl * (1 - U) + tr * U) * (1 - V) + (bl * (1 - U) + br * U) * V


def smoothstep_mask(values: np.ndarray, center: float, width: float) -> np.ndarray:
    width = max(width, 1e-3)
    t = np.clip((values - (center - width / 2)) / width, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def falloff(x: np.ndarray, inner: float, outer: float) -> np.ndarray:
    """1.0 for x <= inner, 0.0 for x >= outer, smooth in between."""
    t = np.clip((x - inner) / max(outer - inner, 1e-6), 0.0, 1.0)
    return 1.0 - t * t * (3 - 2 * t)


def keep_largest(binary: np.ndarray, count: int) -> np.ndarray:
    labeled, n = ndimage.label(binary)
    if n <= count:
        return binary
    sizes = ndimage.sum(binary, labeled, index=range(1, n + 1))
    return np.isin(labeled, np.argsort(sizes)[::-1][:count] + 1)


def signed_distance(binary: np.ndarray) -> np.ndarray:
    return distance_transform_edt(binary) - distance_transform_edt(~binary)


def band_weights(sd: np.ndarray, half_width: float, feather: float):
    lo, hi = -half_width, half_width
    aw = np.clip(falloff(sd, lo - feather, lo + feather), 0, 1)
    bw = np.clip(1.0 - falloff(sd, hi - feather, hi + feather), 0, 1)
    cw = np.clip(1.0 - aw - bw, 0, 1)
    total = np.where(aw + bw + cw < 1e-6, 1.0, aw + bw + cw)
    return aw / total, cw / total, bw / total


def blend(a: np.ndarray, b: np.ndarray, mask: np.ndarray, style, texture) -> np.ndarray:
    """`a` where mask is 0, `b` where it is 1; with a band texture along the border, as `composite_with_transition`."""
    band, feather, width = style
    if band is None:
        m = mask[..., None]
        return a * (1 - m) + b * m
    sd = signed_distance(mask >= 0.5)
    aw, cw, bw = band_weights(sd, max(width / 100 * SIZE, 0.5) / 2.0, max(feather / 100 * SIZE, 0.5) / 2.0)
    return a * aw[..., None] + texture(band) * cw[..., None] + b * bw[..., None]


# ---------------------------------------------------------------- the painted set


QUADRANTS_AT = {
    "tl": (0,), "tr": (1,), "bl": (2,), "br": (3,),
    "top": (0, 1), "bottom": (2, 3), "left": (0, 2), "right": (1, 3), "tlbr": (0, 3), "trbl": (1, 2),
}


def quarters_of(name: str):
    """The terrain of the four quarters of a painted tile by its file name (`src/data/flatTerrain.ts`), or None for island and pond."""
    parts = name.split("_")
    if len(parts) == 2 and parts[1] == "full":
        return (parts[0],) * 4
    if len(parts) == 3:
        first, second, rest = parts
        shape, _, at = rest.partition("-")
        if shape in ("island", "pond"):
            return None
        majority, other = (second, first) if shape in ("inner", "island") else (first, second)
        q = [majority] * 4
        for i in QUADRANTS_AT[at]:
            q[i] = other
        return tuple(q)
    return None


def painted_tiles() -> dict[tuple, str]:
    tiles = {}
    for f in SRC.glob("*.jpg"):
        q = quarters_of(f.stem)
        if q:
            tiles[q] = f.stem
    return tiles


_cache: dict[str, np.ndarray] = {}


def picture(name: str) -> np.ndarray:
    if name not in _cache:
        _cache[name] = np.asarray(Image.open(SRC / f"{name}.jpg").convert("RGB").resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32)
    return _cache[name]


def texture(terrain: str) -> np.ndarray:
    return picture(f"{terrain}_full")


# ---------------------------------------------------------------- one tile


def generate(q: tuple[str, str, str, str], painted: dict[tuple, str]) -> np.ndarray:
    name = "mix_" + "_".join(q)
    count = Counter(q)
    kinds = sorted(count)
    assert len(kinds) == 3 and sorted(count.values()) == [1, 1, 2], q
    w_kind = next(k for k, n in count.items() if n == 2)
    t_kind, u_kind = [k for k in kinds if k != w_kind]
    diagonal = q[0] == q[3] == w_kind or q[1] == q[2] == w_kind
    seed = derive_seed(SEED, name)

    # the gradients of the three terrains, with the coastline noise only near their borders and never at the sides
    g = {k: corner_gradient(SIZE, *[1.0 if x == k else 0.0 for x in q]) for k in kinds}
    edge_w = edge_fade_window(SIZE, EDGE_MARGIN)
    outer = min(max(NOISE, 0.05), 0.25)
    inner = outer * 0.55
    gp = {}
    for k in kinds:
        margin = g[k] - np.maximum.reduce([g[u] for u in kinds if u != k])
        prox = falloff(np.abs(margin) / 2, inner, outer)
        n = value_noise(SIZE, derive_seed(seed, k), max(1.0, SIZE * 0.12))
        gp[k] = np.clip(g[k] + NOISE * n * edge_w * prox, 0.0, 1.0)

    def weights(softness_pct: float) -> dict[str, np.ndarray]:
        fw = max(softness_pct / 100, 0.5 / SIZE)
        w = {}
        for k in kinds:
            margin = gp[k] - np.maximum.reduce([gp[u] for u in kinds if u != k])
            w[k] = smoothstep_mask(margin / 2 + 0.5, 0.5, fw)
        total = np.maximum(sum(w.values()), 1e-6)
        return {k: v / total for k, v in w.items()}

    # the region of each terrain: one piece each (two for the doubled one when it holds opposite corners), no flecks
    label = np.argmax(np.stack([gp[k] for k in kinds]), axis=0)
    kept = np.zeros(label.shape, dtype=bool)
    for i, k in enumerate(kinds):
        kept |= keep_largest(label == i, 2 if (k == w_kind and diagonal) else 1)
    if not kept.all():
        idx = distance_transform_edt(~kept, return_distances=False, return_indices=True)
        label = label[idx[0], idx[1]]
    is_t = label == kinds.index(t_kind)
    is_u = label == kinds.index(u_kind)
    is_w = label == kinds.index(w_kind)

    # step 1: T against U, the W region given to the nearer of the two
    style_tu = STYLES.get(frozenset((t_kind, u_kind)), DEFAULT_STYLE)
    wts = weights(style_tu[1])
    pair = wts[t_kind] + wts[u_kind]
    ratio = wts[u_kind] / np.maximum(pair, 1e-6)
    d_t = distance_transform_edt(~is_t)
    d_u = distance_transform_edt(~is_u)
    nearer_u = (d_u < d_t).astype(np.float32)
    trust = np.clip(pair / 0.3, 0.0, 1.0)
    mask1 = trust * ratio + (1 - trust) * nearer_u
    step1 = blend(texture(t_kind), texture(u_kind), mask1, style_tu, texture)

    # step 2: W over it, in the style of the pair W/T where T is nearer, W/U where U is
    sigma = d_t / np.maximum(d_t + d_u, 1e-6)
    sigma = sigma * sigma * (3 - 2 * sigma)
    tex_w = texture(w_kind)
    parts = []
    for other in (t_kind, u_kind):
        style = STYLES.get(frozenset((w_kind, other)), DEFAULT_STYLE)
        parts.append(blend(step1, tex_w, weights(style[1])[w_kind], style, texture))
    out = parts[0] * (1 - sigma[..., None]) + parts[1] * sigma[..., None]

    # the sides are those of the painted tiles with the same split there
    margin_px = max(2, int(SEAM * SIZE))
    ramp = np.clip(1 - np.arange(SIZE, dtype=np.float32) / margin_px, 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)
    sides = {
        "top": ((q[0], q[1], q[0], q[1]), lambda w: ramp[:, None] * np.ones((1, SIZE), np.float32)),
        "bottom": ((q[2], q[3], q[2], q[3]), lambda w: ramp[::-1][:, None] * np.ones((1, SIZE), np.float32)),
        "left": ((q[0], q[0], q[2], q[2]), lambda w: np.ones((SIZE, 1), np.float32) * ramp[None, :]),
        "right": ((q[1], q[1], q[3], q[3]), lambda w: np.ones((SIZE, 1), np.float32) * ramp[::-1][None, :]),
    }
    for side, (pattern, weight) in sides.items():
        donor_name = f"{pattern[0]}_full" if len(set(pattern)) == 1 else painted.get(pattern)
        if donor_name is None:
            print(f"  {name}: no painted tile for the {side} side {pattern}", file=sys.stderr)
            continue
        w = weight(None)[..., None]
        out = out * (1 - w) + picture(donor_name) * w
    return np.clip(out, 0, 255).astype(np.uint8)


def quarter_sets(land: list[str]):
    """Every way to colour four quarters with cobblestone, water and one land terrain, one of the three used twice."""
    for x in land:
        trio = (*TRIPLES_WITH, x)
        for doubled in trio:
            multiset = [doubled, *trio]
            for q in sorted(set(itertools.permutations(multiset))):
                yield q


def job(args):
    q, force, out_dir = args
    name = "mix_" + "_".join(q)
    out = Path(out_dir) / f"{name}.jpg"
    if out.exists() and not force:
        return name, False
    Image.fromarray(generate(q, painted_tiles())).save(out, quality=QUALITY, subsampling=0, optimize=True)
    return name, True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="paint again what exists")
    ap.add_argument("--only", help="one tile, e.g. mix_grass_water_cobblestone_cobblestone")
    ap.add_argument("--land", default=",".join(LAND), help="the land terrains to paint with cobblestone and water")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--out", help="paint into this folder instead of the sources (to look at them first)")
    args = ap.parse_args()
    sets = [q for q in quarter_sets(args.land.split(","))]
    if args.only:
        sets = [q for q in sets if "mix_" + "_".join(q) == args.only]
    out_dir = args.out or str(SRC)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    todo = [(q, args.force, out_dir) for q in sets]
    print(f"{len(todo)} tiles")
    with Pool(args.jobs) as pool:
        done = 0
        for name, made in pool.imap_unordered(job, todo):
            done += 1
            print(f"{done}/{len(todo)} {name}{'' if made else ' (exists)'}", flush=True)


if __name__ == "__main__":
    main()
