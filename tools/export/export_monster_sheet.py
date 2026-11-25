"""Exports the sheet "Monster" of the user's workbook docs/MONSTER_1.2.xlsx: every number and ability of the monsters.

The sheet replaces what src/data/raw/MONSTER_DATA.json (from the old g.py) says about a monster; src/data/tables.ts lays the two together.
Column "entity 9: outside_spawner_hut_xp": a number = the monster has a Monster Hut on the overworld (the number is the XP of burning it
down), "x" = the monster lives on the overworld without a hut, empty = it does not appear outside.

The 91 monsters of Classic (ids 1 to 91) go to monster-sheet.json, the monsters that Fantastic Islands adds (ids from 92 on, appended at the end, never
in between) go to monster-sheet-fantastic.json: Classic reads its own file unchanged. The sheet has no column "undead" any more (the column
"entity 22: group" says who is undead, see export_spell_sheet.py).

Run:  python -I tools/export/export_monster_sheet.py   (or: npm run data:monsters)
Out:  src/data/monster-sheet.json, src/data/monster-sheet-fantastic.json
"""

import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / "docs" / "MONSTER_1.2.xlsx"
OUT = ROOT / "src" / "data" / "monster-sheet.json"
OUT_FANTASTIC = ROOT / "src" / "data" / "monster-sheet-fantastic.json"
# the first id that only Fantastic Islands has
FIRST_FANTASTIC_ID = 92

# header text (part of it) -> key; the sheet names both petrified and death "entity 8i", the status word tells them apart
ABILITY_COLUMNS = [
    ("ranged attack", "ranged"),
    ("hits_all", "hitsAll"),
    ("causes_status_poisoned", "poisoned"),
    ("causes_status_cursed", "cursed"),
    ("causes_status_sleep", "sleeping"),
    ("causes_status_insanity", "crazy"),
    ("causes_status_disease", "diseased"),
    ("causes_status_weakness", "weak"),
    ("causes_status_petrified", "petrified"),
    ("causes_status_death", "dead"),
    ("causes_status_paralysis", "paralyzed"),
    ("causes_status_eradication", "eradication"),
]


def find(head, text):
    for i, h in enumerate(head):
        if h and text in str(h).lower():
            return i
    raise KeyError(text)


def ordered(rows, file):
    """The rows in the order of the file they replace, new ids behind them in ascending order."""
    known = list(json.loads(file.read_text(encoding="utf-8"))) if file.exists() else []
    keys = [k for k in known if k in rows] + sorted((k for k in rows if k not in known), key=int)
    return {k: rows[k] for k in keys}


def number(value):
    if value in (None, ""):
        return None
    return float(value) if isinstance(value, float) and not float(value).is_integer() else int(value)


def main() -> int:
    ws = openpyxl.load_workbook(SHEET, data_only=True)["Monster"]
    head = [c.value for c in ws[1]]
    col = {
        "name": find(head, "entity 0"),
        "health": find(head, "entity 1:"),
        "armor": find(head, "entity 2:"),
        "speed": find(head, "entity 3:"),
        "attacks": find(head, "entity 4:"),
        "damageMin": find(head, "damage_min"),
        "damageMax": find(head, "damage_max"),
        "attackType": find(head, "attack_type"),
        "regen": find(head, "regeneration"),
        "stealMana": find(head, "steal_mana"),
        "aging": find(head, "increases_magical_age"),
        "hut": find(head, "entity 9"),
        "resMagic": find(head, "res_magic"),
        "resFire": find(head, "res_fire"),
        "resPhysical": find(head, "res_physical"),
        "resCold": find(head, "res_cold"),
        "resPoison": find(head, "res_poison"),
        "gold": find(head, "entity 16"),
        "iconHeight": find(head, "icon_height"),
        "terrain": find(head, "entity 19"),
        "boss": find(head, "final_boss"),
        "group": find(head, "entity 22"),
        "xp": find(head, "entity 23:"),
        "level": find(head, "entity 24:"),
    }
    abilities = {key: find(head, text) for text, key in ABILITY_COLUMNS}
    out = {}
    extra = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        m = {}
        for key, i in col.items():
            v = row[i]
            m[key] = v.strip() if isinstance(v, str) else number(v)
        hut = m["hut"]
        m["hut"] = "x" if isinstance(hut, str) and hut.lower() == "x" else hut
        for key, i in abilities.items():
            m[key] = isinstance(row[i], str) and row[i].strip().lower() == "x"
        age = row[col["aging"]]
        m["aging"] = 1 if isinstance(age, str) and age.strip().lower() == "x" else number(age)
        (extra if int(row[0]) >= FIRST_FANTASTIC_ID else out)[str(int(row[0]))] = m
    # the sheet is sorted by XP: the files keep the order they have (so that a changed row is a small diff), a new id comes last
    classic = ordered(out, OUT)
    fantastic = ordered(extra, OUT_FANTASTIC)
    OUT.write_text(json.dumps(classic, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    OUT_FANTASTIC.write_text(json.dumps(fantastic, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"monsters: {len(classic)} (Classic) + {len(fantastic)} (Fantastic Islands)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
