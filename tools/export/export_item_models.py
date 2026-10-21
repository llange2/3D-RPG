"""Reads which 3D model, size and pose the old game used for every map item (entities.py, add_item).

Output: src/data/item-models.json
  { "<item id>": { "name": "...", "source": "Chest.obj" | "Fairy.glb" | "personas/Cartographer.obj",
                   "scale": 1.0, "scale3": [1.0, 1.0, 1.0], "rotX": 0, "rotZ": 0, "yaw": 0, "y": 0.0, "persona": false } }

`source` is relative to resources/objects. The model has an .obj next to a texture, or is a .glb. Items the old game
draws as plain cubes (markers, invisible blockers) have no source.

The old code gives most items a `scale` of one number, a few a tuple (the Village is 4.5 wide but 5.5 high) and a few a
rotation with pitch or roll (the trap door lies flat through `rotation=(0, rotation, 270)`, the inverted metal gate is
rolled by 180). `scale` stays the first number for old readers, `scale3` is the real size, `rotX`/`rotZ` are pitch and
roll in degrees and `yaw` is what the code adds to the rotation stored on the map cell (`270+rotation` -> 270).

Usage: python -I tools/export/export_item_models.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENTITIES = ROOT.parent / "old_code" / "entities.py"
OBJECTS = ROOT.parent / "old_code" / "resources" / "objects"
OUT = ROOT / "src" / "data" / "item-models.json"


def resolve(source: str) -> str | None:
    """File below resources/objects for a model name as the old code writes it (with or without extension)."""
    if (OBJECTS / source).is_file():
        return source
    for ext in (".obj", ".glb"):
        if (OBJECTS / (source + ext)).is_file():
            return source + ext
    return None


def evaluate(expression: str, **names: float) -> float | None:
    """Value of a number the old code writes as an expression (`0.4*scale`, `blocksize/3`); None if it is something else."""
    try:
        return float(eval(expression.strip(), {"__builtins__": {}}, {"blocksize": 3, "scale": 1, "rotation": 0, **names}))  # noqa: S307 - constants from our own source
    except Exception:
        return None


def split_top_level(text: str) -> list[str]:
    """Splits `a, f(b, c), d` at the commas that are not inside brackets."""
    parts, depth, current = [], 0, ""
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += ch
    parts.append(current)
    return parts


def scale_of(block: str) -> list[float]:
    """[x, y, z] size: `scale=0.6` is uniform, `scale=(1, 1.37, 1)` is not."""
    m = re.search(r"scale\s*=\s*(\([^)]*\)|[\w.*/]+)", block)
    if not m:
        return [1.0, 1.0, 1.0]
    raw = m.group(1).strip()
    if raw.startswith("("):
        values = [evaluate(p) for p in split_top_level(raw[1:-1])]
    else:
        values = [evaluate(raw)]
    values = [v if v is not None else 1.0 for v in values]
    if len(values) == 1:
        values = values * 3
    return [round(v, 3) for v in values[:3]]


def pose_of(block: str) -> tuple[float, float, float]:
    """(pitch, roll, yaw offset) in degrees from `rotation=(0, rotation, 270)` and the like."""
    m = re.search(r"rotation\s*=\s*\(([^)]*)\)", block)
    if not m:
        return 0.0, 0.0, 0.0
    parts = split_top_level(m.group(1))
    if len(parts) != 3:
        return 0.0, 0.0, 0.0
    pitch, yaw, roll = (evaluate(p) for p in parts)
    return pitch or 0.0, roll or 0.0, yaw or 0.0


def first_y(block: str) -> float:
    """Height the old code gave the entity: `position=(o2t(0), 1.1, o2t(0))`. Anything it cannot evaluate counts as 0."""
    m = re.search(r"position\s*=\s*\(\s*o2t\(0\)\s*,\s*([^,]+),", block)
    if not m:
        return 0.0
    try:
        return round(float(eval(m.group(1).strip().replace("blocksize", "3"), {"__builtins__": {}}, {})), 3)  # noqa: S307 - constants from our own source
    except Exception:
        return 0.0


# Items whose extra yaw differs here from the old code. Every building on the Outside map faces the compass bearing stored
# on its cell (`ir`: the "enter" action lies on the cell in front of it, checked for all 29 places). The old game's GLB loader
# showed the cave's door on +x, so the old code adds 270 degrees; the glTF import here shows it on -z, which needs 180.
YAW_OVERRIDE = {42: 180.0}


def strip_comment(line: str) -> str:
    """The code part of a line: a `#` outside a string starts a comment (the old code keeps earlier sizes and heights as comments)."""
    quote = ""
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = ""
        elif ch in "\"'":
            quote = ch
        elif ch == "#":
            return line[:i]
    return line


def main() -> None:
    lines = ENTITIES.read_text(encoding="utf-8").split("\n")
    start = next(i for i, line in enumerate(lines) if "def add_item(" in line)
    end = next(i for i in range(start + 1, len(lines)) if re.match(r"    def ", lines[i]))
    blocks: dict[int, tuple[str, list[str]]] = {}
    current: int | None = None
    for i in range(start, end):
        line = lines[i]
        m = re.match(r"\s+case (\d+):\s*#?\s*(.*)", line)
        if m:
            current = int(m.group(1))
            blocks[current] = (m.group(2).strip(), [])
            continue
        if current is not None:
            blocks[current][1].append(strip_comment(line))

    items = json.loads((ROOT / "src" / "data" / "raw" / "ITEMS.json").read_text(encoding="utf-8"))
    result: dict[str, dict] = {}
    missing = []
    for item_id, (comment, body) in sorted(blocks.items()):
        text = "\n".join(body)
        model = re.search(r"model\s*=\s*[\"']resources/objects/([^\"']+)[\"']", text)
        persona = bool(model and model.group(1).startswith("personas/"))
        source = resolve(model.group(1)) if model else None
        if model and source is None:
            missing.append((item_id, model.group(1)))
        name = items.get(str(item_id), {}).get("name", comment)
        scale3 = scale_of(text)
        pitch, roll, yaw = pose_of(text)
        yaw = YAW_OVERRIDE.get(item_id, yaw)
        result[str(item_id)] = {
            "name": name,
            "source": source,
            "scale": scale3[0],
            "scale3": scale3,
            "rotX": pitch,
            "rotZ": roll,
            "yaw": yaw,
            "y": first_y(text),
            "persona": persona,
        }
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    have = sum(1 for v in result.values() if v["source"])
    print(f"{len(result)} items, {have} with a model, {len(missing)} models not found: {missing}")


if __name__ == "__main__":
    main()
