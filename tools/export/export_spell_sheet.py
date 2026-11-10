"""Exports what the user defined in the documentation workbooks that the old g.py does not carry.

- old_code/documentation/MM3_Master_documentation.xlsx, sheet "Spells": name, description and explanation of all 78 spells.
  The numbers (mana, level, damage, school) of the sheet equal src/data/raw/SPELLS.json, only the texts differ (the new spells
  have their own names), so only the texts are exported.
- docs/RPG_0.1.xlsx (the user's current workbook), sheet "Monster": the column "entity 22: group" says who is undead (the flag of entity 20 is
  not used for that).

Run:  python -I tools/export/export_spell_sheet.py
Out:  src/data/spell-sheet.json, src/data/monster-groups.json
"""

import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT.parent / "old_code" / "documentation"
OUT = ROOT / "src" / "data"


# What the user added to the descriptions of the sheet (the workbook in old_code is read-only, 6. 11. 2026): spell id -> sentence appended.
DESCRIPTION_ADDITIONS = {
    72: "Works only outside.",  # Meteor Shower
    2: "Can be cast 3 times a day.",  # Pandora's box (`Party.pandora`, 3 per game day)
}

# Sentences of the sheet that the user rewrote (8. 11. 2026, 48th playtest): spell id -> list of (old text, new text); a pair only applies while the old text is still there.
# Prismatic Light only hits what the party sees, its beams do not pass walls. The rest is the spell consistency check of 8. 11. 2026: the text follows the spell
# (lines instead of "all monsters", acid instead of poison, ...) or the spell was changed to follow the text (Awaken, Dragon Breath, Turn Undead, Levitate, Resurrect).
DESCRIPTION_REPLACEMENTS = {
    73: [("Hits all monsters.", "Hits all monsters in view."), ("90-100 random", "90-110 random")],  # Prismatic Light: the data say 90 to 110
    14: [("10 poison damage", "10 acid damage")],  # Toxic Cloud
    19: [("Damages or destroys a group of undead monsters.", "Does 100 damage to one undead monster. Nothing reduces it.")],  # Turn Undead
    38: [("to all monsters.", "to all monsters in a line.")],  # Acid Spray
    39: [("to all monsters.", "to all monsters in a line.")],  # Cold Ray
    60: [("to all monsters and heals party", "to all monsters in a line and heals the party")],  # Moon Ray
    45: [("to an another biome", "to another biome. Works only outside.")],  # Nature's Gate
    62: [("walk through doors or brittle walls", "walk through a door or wall.")],  # Etherealise
    70: [("Revives a rotten character,", "Revives a rotten character with 1 hit point,")],  # Resurrect
    28: [("2â€“12", "2-12")],  # Power Cure: the workbook carries an en dash that was read in the wrong encoding
    31: [("unabled", "unable")],  # Immobilize
    41: [("lowering ist chance", "lowering its chance")],  # Clumsy
    48: [("Paralysed", "Paralyzed")],  # Cure Paralysis: the condition is called Paralyzed in the game
    # bug_fix_50 (10. 11. 2026): the damage type of the three "energy" spells is magic (the game has no energy element).
    8: [("energy damage", "magical damage")],  # Energy Blast
    76: [("energy damage", "magical damage")],  # Star Burst
    77: [("energy damage", "magical damage")],  # Implosion
    # The Suppress spells double the time that is left until the condition kills (`suppressCondition`).
    11: [('Reduces "Poisoned" status on one character to minimum.', "Doubles the time left until one character dies of poison. Holds until the character is cured.")],  # Suppress Poison
    18: [('Reduces "Crazy" status on one character to minimum.', "Doubles the time left until one character dies of madness. Holds until the character is cured.")],  # Suppress Madness
    23: [('Reduces "Diseased" status on one character to minimum.', "Doubles the time left until one character dies of disease. Holds until the character is cured.")],  # Suppress Disease
}

# Names the user corrected: spell id -> name.
NAME_REPLACEMENTS = {24: "Wizard's Eye"}


def clean(value):
    return value.strip() if isinstance(value, str) else value


def export_spells() -> int:
    ws = openpyxl.load_workbook(DOCS / "MM3_Master_documentation.xlsx", data_only=True)["Spells"]
    head = [c.value for c in ws[1]]
    out = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        d = dict(zip(head, row))
        if d["ID"] is None:
            continue
        spell_id = int(d["ID"])
        description = clean(d["Description"])
        if spell_id in DESCRIPTION_ADDITIONS and DESCRIPTION_ADDITIONS[spell_id] not in description:
            description = f"{description} {DESCRIPTION_ADDITIONS[spell_id]}"
        for old, new in DESCRIPTION_REPLACEMENTS.get(spell_id, []):
            description = description.replace(old, new)
        # Column H "Scales with level": the effect and the mana cost grow with the caster's level (bug_fix_50, 10. 11. 2026).
        # SPELLS.json also flags Dimensional Rift and Power Shield, the sheet does not: the sheet decides.
        scales = bool(d.get("Scales with level"))
        if scales:
            description = f"{description} Costs {int(d['Mana'])} mana per caster level."
        out[str(spell_id)] = {
            "name": NAME_REPLACEMENTS.get(spell_id, clean(d["Name"])),
            "description": description,
            "scalesWithLevel": scales,
            "explanation": clean(d.get("Explanation")) or "",
            "status": clean(d["Comment"]) or "",
        }
    (OUT / "spell-sheet.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(out)


def export_groups() -> int:
    ws = openpyxl.load_workbook(ROOT / "docs" / "RPG_0.1.xlsx", data_only=True)["Monster"]
    head = [c.value for c in ws[1]]
    group_col = next(i for i, h in enumerate(head) if h and "group" in str(h))
    out = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None or row[group_col] is None:
            continue
        out[str(int(row[0]))] = clean(row[group_col])
    (OUT / "monster-groups.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(out)


if __name__ == "__main__":
    print(f"spells: {export_spells()}, monster groups: {export_groups()}")
    sys.exit(0)
