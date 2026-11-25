"""Exports the spell table of the game and the monster groups.

- docs/SPELLS.md (the user's table of the 78 spells, one row each, the columns of the sheet "Spells" of MM3_Master_documentation.xlsx plus the column Explanation): name, description, explanation and the
  numbers the user changes (mana, scales with level, damage, damage types, penetrating). Since 22. 11. 2026 (bug_fix_79) this file is the source, no longer the workbook in old_code (read-only,
  it still carries the numbers of the old game). The other numbers (level, price, schools, healing) are those of src/data/raw/SPELLS.json, which equal the table's.
- docs/MONSTER_1.2.xlsx (the user's current workbook), sheet "Monster": the column "entity 22: group" says who is undead (the sheet has no flag of
  entity 20 any more). All ids go into one file, those of Fantastic Islands (from 92 on) come last.

Run:  python -I tools/export/export_spell_sheet.py
Out:  src/data/spell-sheet.json, src/data/monster-groups.json
"""

import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "data"
SPELLS_MD = ROOT / "docs" / "SPELLS.md"


def clean(value):
    return value.strip() if isinstance(value, str) else value


def unescape(cell: str) -> str:
    """A cell of the markdown table as plain text: line breaks `<br>` become newlines, the backslash escapes of the table go."""
    return re.sub(r"\\(.)", r"\1", cell.replace("<br>", "\n")).strip()


def read_table() -> list[dict]:
    lines = [l for l in SPELLS_MD.read_text(encoding="utf-8").splitlines() if l.startswith("|")]
    head = [unescape(c) for c in lines[0].strip()[1:-1].split(" | ")]
    rows = []
    for line in lines[2:]:
        cells = line.strip()[1:-1].split(" | ")
        if len(cells) != len(head):
            raise SystemExit(f"SPELLS.md: {len(cells)} cells instead of {len(head)} in the row {line[:40]}")
        rows.append(dict(zip(head, [unescape(c) for c in cells])))
    return rows


def boolean(cell: str) -> bool:
    return cell.strip().upper() in ("WAHR", "TRUE")


def number(cell: str):
    cell = cell.strip()
    return int(cell) if cell else None


def export_spells() -> int:
    out = {}
    for d in read_table():
        spell_id = int(d["ID"])
        description = clean(d["Description"])
        # Column "Scales with level": the effect and the mana cost grow with the caster's level (bug_fix_50, 10. 11. 2026).
        scales = boolean(d["Scales with level"])
        mana = int(d["Mana"])
        if scales:
            # the cost per caster level is half the table's number since the 54th playtest (`SCALING_COST_SHARE` in sim/spells.ts), rounded up per cast
            per_level = mana / 2
            shown = str(int(per_level)) if per_level == int(per_level) else str(per_level)
            description = f"{description} Costs {shown} mana per caster level (rounded up)."
        entry = {
            "name": clean(d["Name"]),
            "description": description,
            "scalesWithLevel": scales,
            "explanation": clean(d.get("Explanation")) or "",
            "mana": mana,
        }
        if d["Category"] == "Offensive":
            entry["penetrating"] = boolean(d["Penetrating"])
            entry["damMin"] = number(d["Dam_min"])
            entry["damMax"] = number(d["Dam_max"])
            entry["damType"] = [t for t in d["Dam_type"].split(",") if t]
        out[str(spell_id)] = entry
    (OUT / "spell-sheet.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(out)


def export_groups() -> int:
    ws = openpyxl.load_workbook(ROOT / "docs" / "MONSTER_1.2.xlsx", data_only=True)["Monster"]
    head = [c.value for c in ws[1]]
    group_col = next(i for i, h in enumerate(head) if h and "group" in str(h))
    out = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None or row[group_col] is None:
            continue
        out[str(int(row[0]))] = clean(row[group_col])
    # the file keeps the order it has (a small diff), a new id comes last
    file = OUT / "monster-groups.json"
    known = list(json.loads(file.read_text(encoding="utf-8"))) if file.exists() else []
    out = {k: out[k] for k in [k for k in known if k in out] + sorted((k for k in out if k not in known), key=int)}
    file.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(out)


if __name__ == "__main__":
    print(f"spells: {export_spells()}, monster groups: {export_groups()}")
    sys.exit(0)
