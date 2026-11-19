"""Turns the spell-impact videos of the user (text-to-video, effect on pure black) into the raw 4x4 sheets that `build_fx.py ... sheets` reads.

Call: python -I video_sheets.py <ffmpeg.exe> <video folder> <output folder>
  videos:  <folder>/impact_<fire|ice|acid|magic>.mp4  (or <name>_impact.mp4)
  output:  <folder>/impact_<name>.png  (2048², 4 x 4 frames of 512, rows first, RGB on black)

Black is "nothing" for the game's additive blending, so a frame on black needs no keying here; `build_fx.py` turns brightness into straight alpha.
What this script decides:
  - the span of the effect: from the first visible spark to the last frame that is still more than a haze (`LAST_LEVEL`), 16 frames spread evenly over it;
  - a fade-out when the video ends before the effect has (frames at the end of the sheet must be almost invisible, the game loops the flipbook);
  - a round fade-out when the effect grows past the picture (the sheet cell would cut it with a straight edge: ice cloud, magic rays).
ffmpeg comes from `node_modules/ffmpeg-static/ffmpeg.exe` (npm) unless another one is at hand.
"""
import os
import subprocess
import sys

import numpy as np
from PIL import Image

FRAME = 512  # one flipbook frame, sheet 2048²
FRAMES = 16
FIRST_LEVEL = 0.0003  # mean brightness of the first usable frame: a tiny spark
LAST_LEVEL = 0.005  # below this the effect is only a haze, the sheet ends there
END_FADE_FROM = 11  # frame index where a still-bright ending starts to fade
CLIPPED_RIM = 0.03  # share of bright pixels in the outer 2 % band that counts as "cut by the edge of the picture" (measured: ice 0.32, magic 0.07, fire 0.005, acid 0.011)
NAMES = ["fire", "ice", "acid", "magic"]


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def find_video(folder, name):
    for candidate in ("impact_%s.mp4" % name, "%s_impact.mp4" % name):
        p = os.path.join(folder, candidate)
        if os.path.exists(p):
            return p
    return None


def read_frames(ffmpeg, path):
    """All frames of the video as float RGB at the flipbook size (lanczos: sparkles keep their peak)."""
    cmd = [ffmpeg, "-v", "error", "-i", path, "-vf", "scale=%d:%d:flags=lanczos" % (FRAME, FRAME), "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, FRAME, FRAME, 3).astype(np.float32) / 255.0


def pick_span(frames):
    level = frames.max(axis=3).mean(axis=(1, 2))
    seen = np.nonzero(level > FIRST_LEVEL)[0]
    first = int(seen[0]) if len(seen) else 0
    bright = np.nonzero(level > LAST_LEVEL)[0]
    last = int(bright[-1]) if len(bright) else len(frames) - 1
    return first, max(last, first + FRAMES - 1), level


def touches_rim(frames):
    band = max(2, FRAME // 50)
    m = frames.max(axis=3)
    rim = np.concatenate([m[:, :band, :].reshape(len(m), -1), m[:, -band:, :].reshape(len(m), -1), m[:, :, :band].reshape(len(m), -1), m[:, :, -band:].reshape(len(m), -1)], axis=1)
    return float((rim > 0.25).mean(axis=1).max()) > CLIPPED_RIM


def round_fade():
    ys, xs = (np.mgrid[0:FRAME, 0:FRAME].astype(np.float32) + 0.5) / FRAME - 0.5
    return smooth(0.5, 0.36, np.hypot(xs, ys))[..., None]


def build(ffmpeg, video):
    frames = read_frames(ffmpeg, video)
    first, last, level = pick_span(frames)
    last = min(last, len(frames) - 1)
    picks = np.round(np.linspace(first, last, FRAMES)).astype(int)
    chosen = frames[picks].copy()
    notes = ["video frames %d, span %d..%d" % (len(frames), first, last)]
    ending = float(level[picks[-1]])
    if ending > 0.01:  # the video stopped while the effect was still shining
        k = np.arange(FRAMES, dtype=np.float32)
        gain = 1.0 - 0.99 * smooth(END_FADE_FROM, FRAMES - 1, k)
        chosen *= gain[:, None, None, None]
        notes.append("fade-out added (last frame was %.3f)" % ending)
    if touches_rim(frames[first:last + 1]):
        chosen *= round_fade()
        notes.append("effect reaches the picture edge: round fade-out")
    sheet = np.zeros((4 * FRAME, 4 * FRAME, 3), dtype=np.float32)
    for k in range(FRAMES):
        y, x = divmod(k, 4)
        sheet[y * FRAME:(y + 1) * FRAME, x * FRAME:(x + 1) * FRAME] = chosen[k]
    return sheet, notes


if __name__ == "__main__":
    ffmpeg, folder, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    for name in NAMES:
        video = find_video(folder, name)
        if video is None:
            print("missing video for", name)
            continue
        sheet, notes = build(ffmpeg, video)
        path = os.path.join(out, "impact_%s.png" % name)
        Image.fromarray((np.clip(sheet, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(path, optimize=True)
        print(name, "->", path, "; ".join(notes))
