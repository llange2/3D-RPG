"""Cut a 5x2 state sheet into single cells, and put single cells back into a sheet (docs/ZIELBILD_CHARAKTERZUSTAENDE.md, section 5b).

  python -I state_sheet.py cut   <sheet.png> <out_dir> <prefix>          # grey gutters are detected; 2 px inset against the border
  python -I state_sheet.py sheet <dir> <prefix> <out.png> [cell=288]     # <dir>/<prefix>*.png (sorted) -> 5x2 grid, 16 px gutters #7F7F7F

The cell names are <prefix>_NN_<state>.png in the order of the target picture (Normal ... Sleeping). Pure Pillow/NumPy, no game code.
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

STATES = ["normal", "blessed", "crazy", "cursed", "diseased", "drunk", "paralyzed", "petrified", "poisoned", "sleeping"]
GUTTER = 16
INSET = 2


def runs(fraction, threshold=0.9):
    found, start = [], None
    for i, v in enumerate(fraction):
        if v >= threshold and start is None:
            start = i
        if v < threshold and start is not None:
            found.append((start, i - 1))
            start = None
    if start is not None:
        found.append((start, len(fraction) - 1))
    return found


def cell_spans(gutters):
    return [(a[1] + 1 + INSET, b[0] - INSET) for a, b in zip(gutters, gutters[1:])]


def cut(sheet, out_dir, prefix):
    img = Image.open(sheet).convert("RGB")
    a = np.array(img).astype(int)
    # mid grey, no colour cast: the gutter between and around the cells
    grey = (abs(a[:, :, 0] - a[:, :, 1]) < 8) & (abs(a[:, :, 1] - a[:, :, 2]) < 8) & (a[:, :, 0] > 110) & (a[:, :, 0] < 150)
    cols, rows = cell_spans(runs(grey.mean(axis=0))), cell_spans(runs(grey.mean(axis=1)))
    if len(cols) != 5 or len(rows) != 2:
        sys.exit("expected 5 x 2 cells, found %d x %d" % (len(cols), len(rows)))
    os.makedirs(out_dir, exist_ok=True)
    n = 0
    for y0, y1 in rows:
        for x0, x1 in cols:
            n += 1
            path = os.path.join(out_dir, "%s_%02d_%s.png" % (prefix, n, STATES[n - 1]))
            img.crop((x0, y0, x1 + 1, y1 + 1)).save(path)
            print(path)


def sheet(directory, prefix, out, cell=288):
    files = sorted(glob.glob(os.path.join(directory, prefix + "*.png")))
    if len(files) != 10:
        sys.exit("expected 10 cells, found %d" % len(files))
    canvas = Image.new("RGB", (GUTTER + 5 * (cell + GUTTER), GUTTER + 2 * (cell + GUTTER)), (127, 127, 127))
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGB").resize((cell, cell), Image.LANCZOS)
        canvas.paste(im, (GUTTER + (i % 5) * (cell + GUTTER), GUTTER + (i // 5) * (cell + GUTTER)))
    canvas.save(out)
    print(out, canvas.size)


if __name__ == "__main__":
    if len(sys.argv) >= 5 and sys.argv[1] == "cut":
        cut(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) >= 5 and sys.argv[1] == "sheet":
        sheet(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]) if len(sys.argv) > 5 else 288)
    else:
        sys.exit(__doc__)
