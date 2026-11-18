"""Cuts the user's cogwheel (`.ignore/cogwheel.png`, a gear on a flat grey backdrop with its shadow) out of its background and writes `fx_cog.png`: 256 x 256, grey, straight alpha.

The gear is brown and olive with a dark outline, the backdrop and the shadow on it are pale or mid grey without colour, so a pixel is the gear when it is coloured or dark. The openings between
the spokes and in the hub are backdrop as well (they are found by the same test, not by filling from the edge). The picture is turned to grey (the bits that fly off a robot are silver, grey
and steel: the game tints them in many tones of grey), its contrast is raised a little so that it reads at the size of a few pixels.

Usage: python -I cog_tex.py <cogwheel.png> <output.png>
"""
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
a = np.asarray(img).astype(np.float32)
lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
sat = a.max(axis=2) - a.min(axis=2)

# the backdrop: the median colour of the border (it is nearly flat); the gear is what differs from it by colour or by darkness
border = np.concatenate([a[:20].reshape(-1, 3), a[-20:].reshape(-1, 3), a[:, :20].reshape(-1, 3), a[:, -20:].reshape(-1, 3)])
back = np.median(border, axis=0)
back_lum = float(back @ np.array([0.299, 0.587, 0.114]))
colour_distance = np.linalg.norm(a - back, axis=2)
gear = ((sat > 26) & (colour_distance > 34)) | (lum < back_lum - 70)
# remove specks of the backdrop and holes of the gear's own surface, keep the openings of the spokes
gear = ndimage.binary_opening(gear, iterations=3)
gear = ndimage.binary_closing(gear, iterations=2)
labels, n = ndimage.label(gear)
if n > 1:
    sizes = ndimage.sum(gear, labels, range(1, n + 1))
    gear = labels == (1 + int(np.argmax(sizes)))
# a soft edge
alpha = ndimage.gaussian_filter(gear.astype(np.float32), 1.1)
alpha = np.clip((alpha - 0.2) / 0.6, 0, 1)

# the gear in grey, a little contrast (the engraved cracks and the outline stay dark)
grey = lum / 255.0
inside = grey[gear]
lo, hi = np.percentile(inside, 3), np.percentile(inside, 97)
grey = np.clip((grey - lo) / max(hi - lo, 1e-3), 0, 1) ** 0.9
grey = 0.28 + 0.72 * grey

rgba = np.zeros((*grey.shape, 4), dtype=np.uint8)
rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = np.round(grey * 255).astype(np.uint8)
rgba[..., 3] = np.round(alpha * 255).astype(np.uint8)
pic = Image.fromarray(rgba, "RGBA")
# crop to the gear with a small margin, square, 256 px
ys, xs = np.nonzero(alpha > 0.05)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
half = max(x1 - x0, y1 - y0) // 2 + 6
pic = pic.crop((cx - half, cy - half, cx + half, cy + half)).resize((256, 256), Image.LANCZOS)
pic.save(out)
print("wrote", out, "gear share", round(float(gear.mean()), 3))
