"""Exports the hand-built campaign maps (*.map pickles of the old game) to JSON for the web game.

The pickles reference classes of the old game (g.Map, ursina Vec3). They are read with an unpickler that replaces every
class by an inert stand-in, so neither Ursina nor the old game code has to be importable and no foreign code runs.

Output (public/assets/campaign/):
  index.json        one entry per map: name, slug, size, counts
  <slug>.json       cells with block, item, action, monster and sound data; coordinates stay absolute (around 5000/5000)
                    like in the old game, `origin` tells the loader where the map starts, because actions refer to
                    other cells and to cells of other maps with absolute coordinates.

Usage: python -I tools/export/export_maps.py [source maps dir]
"""
from __future__ import annotations

import json
import pickle
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = ROOT.parent / "old_code" / "resources" / "maps"
OUT = ROOT / "public" / "assets" / "campaign"
# test fixtures of the old map editor; they are not part of the campaign
SKIP = {"0_test_mesh_collider", "default", "all_items", "all_monsters", "0000"}
# 0000.map is the old test map: kept as a debug map, flagged in the index
DEBUG = {"0000"}
KEEP_KEYS = {
    "Block": "b",
    "Block_Rotation": "br",
    "Item": "i",
    "Item_Rotation": "ir",
    "Action": "a",
    "Action_Parameter": "ap",
    "Action_Additional_Parameter": "ax",
    "Monster": "m",
    "Monster_Parameter": "mp",
    "Monster_Additional_Parameter": "mh",
    "Monster_Rotation": "mr",
    "Sound": "s",
    "Sound_Parameter": "sp",
}
CENTER = 5000


class Inert:
    def __init__(self, *args, **kwargs):
        self._args = args

    def __setstate__(self, state):
        self._state = state


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):  # noqa: D401 - pickle API
        return type(name, (Inert,), {})


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def facing_of(view_direction) -> str:
    """The old game stores the player's y rotation in degrees (it grows without bounds while turning)."""
    args = getattr(view_direction, "_args", None)
    if not args or len(args) < 2:
        return "N"
    yaw = round(float(args[1]) / 90.0) % 4
    # Ursina: 0 = +z (north on the map), 90 = +x (east)
    return ["N", "E", "S", "W"][int(yaw)]


def clean(value):
    """JSON-safe copy; the old editor stored strings for almost everything."""
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def export_map(path: Path, report: dict) -> dict | None:
    state = SafeUnpickler(path.open("rb")).load()._state
    cells = state["map"]
    xs = sorted(k[0] for k in cells)
    ys = sorted(k[1] for k in cells)
    mx, my = statistics.median(xs), statistics.median(ys)
    kept: dict[tuple[int, int], dict] = {}
    for (x, y), c in cells.items():
        if abs(x - mx) > 90 or abs(y - my) > 90:
            report["dropped_outliers"].append({"map": path.stem, "x": x, "y": y, "keys": sorted(c.keys())})
            continue
        row = {KEEP_KEYS[k]: clean(v) for k, v in c.items() if k in KEEP_KEYS and v not in ("", None)}
        row_ok = {k: v for k, v in row.items() if not (k in ("br", "ir", "mr") and v == 0)}
        if not row_ok:
            # cell that only exists in the editor
            continue
        kept[(x, y)] = row_ok
        for k in c:
            if k not in KEEP_KEYS:
                report["unknown_keys"][k] = report["unknown_keys"].get(k, 0) + 1
    start_x = state.get("start_x", CENTER)
    start_y = state.get("start_y", CENTER)
    all_x = [k[0] for k in kept] + [start_x]
    all_y = [k[1] for k in kept] + [start_y]
    origin = (min(all_x) - 1, min(all_y) - 1)
    size = (max(all_x) - origin[0] + 2, max(all_y) - origin[1] + 2)
    out_cells = []
    for (x, y), row in sorted(kept.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        out_cells.append({"x": x, "y": y, **row})
    slug = slugify(path.stem)
    data = {
        "name": path.stem,
        "slug": slug,
        "debug": path.stem in DEBUG,
        "music": state.get("music", 1),
        "start": {"x": start_x, "y": start_y, "facing": facing_of(state.get("view_direction"))},
        "origin": list(origin),
        "width": size[0],
        "height": size[1],
        "cells": out_cells,
    }
    (OUT / f"{slug}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    actions = sum(1 for c in out_cells if "a" in c)
    monsters = sum(1 for c in out_cells if "m" in c)
    return {
        "name": data["name"],
        "slug": slug,
        "debug": data["debug"],
        "width": data["width"],
        "height": data["height"],
        "music": data["music"],
        "cells": len(out_cells),
        "actions": actions,
        "monsters": monsters,
        "bytes": (OUT / f"{slug}.json").stat().st_size,
    }


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"dropped_outliers": [], "unknown_keys": {}, "skipped": []}
    index = []
    for path in sorted(src.glob("*.map"), key=lambda p: p.name.lower()):
        if path.stem in SKIP - DEBUG:
            report["skipped"].append(path.stem)
            continue
        entry = export_map(path, report)
        if entry:
            index.append(entry)
    (OUT / "index.json").write_text(json.dumps({"maps": index, "report": report}, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(m["bytes"] for m in index)
    print(f"exported {len(index)} maps ({total / 1024:.0f} KB), skipped {len(report['skipped'])}, dropped {len(report['dropped_outliers'])} stray cells")
    for m in index:
        print(f"  {m['slug']:28s} {m['width']:4d}x{m['height']:<4d} cells {m['cells']:5d} actions {m['actions']:4d} monsters {m['monsters']:3d} {m['bytes'] // 1024:4d} KB")


if __name__ == "__main__":
    main()
