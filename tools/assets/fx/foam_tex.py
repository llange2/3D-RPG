"""The foam texture (`fx_foam.png`, bug_fix_68): a picture of white foam on black from the image generator, made seamless in x and y and turned into an additive picture
(alpha = intensity, rgb = the white of the foam with a hint of blue).

Seamless: the picture is rolled by half its size, so that its borders become its middle (where it is continuous), and the two are blended by a mask that is 1 in the
middle of the original and 0 at its borders: the borders then show the rolled picture, whose own borders lie in the continuous middle of the original.
Usage: python -I foam_tex.py <raw foam picture> <out.png> [size=512]
"""
import sys

import numpy as np
from PIL import Image

FOAM = np.array([0.93, 0.97, 1.0])


def seamless(img):
    h, w = img.shape[:2]
    rolled = np.roll(np.roll(img, h // 2, axis=0), w // 2, axis=1)
    # 1 in the middle, 0 at the borders, smooth (a cosine in each direction)
    my = np.sin(np.pi * (np.arange(h) + 0.5) / h) ** 2
    mx = np.sin(np.pi * (np.arange(w) + 0.5) / w) ** 2
    mask = (my[:, None] * mx[None, :])[..., None]
    return img * mask + rolled * (1 - mask)


def main(src, out, size):
    raw = np.asarray(Image.open(src).convert("L"), dtype=np.float64) / 255.0
    # a little sharper, the contrast is what makes it read as bubbles
    lum = np.clip((raw - 0.06) / 0.86, 0, 1)
    tiled = seamless(lum[..., None])[..., 0]
    img = Image.fromarray((tiled * 255 + 0.5).astype(np.uint8), "L").resize((size, size), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float64) / 255.0
    alpha = np.clip(a ** 0.9, 0, 1)
    rgb = np.broadcast_to(FOAM[None, None, :], alpha.shape + (3,))
    rgba = np.dstack([rgb, alpha])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(out)
    print("foam written", out, size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 512)
