"""Exports the game data tables from old_code/g.py to JSON.

g.py imports ursina at module level, so it is never imported here. The file is parsed with `ast`
and only literal assignments are evaluated with `ast.literal_eval`.

Run:  python -I tools/export/export_g_data.py
Out:  src/data/raw/<table>.json, texts.json, itexts.json, constants.json, export_report.json
"""

import ast
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / "old_code" / "g.py"
OUT_DIR = ROOT / "src" / "data" / "raw"

# table name -> expected entry count (acceptance criterion of milestone M0)
TABLES = {
    "BASE_CLASS": 10,
    "BASE_RACE": 5,
    "MONSTER_DATA": 91,
    "QUEST_ITEMS": 22,
    "RIDDLES_MASTER": 300,
    "SPELLS": 78,
    "TALENTS": 20,
    "ACTIONS": 50,
    "BLOCKS": 47,
    "ITEMS": 142,
}
TEXT_LISTS = {"texts": 485, "itexts": 95}


def jsonable(value):
    """Converts literal data into something json.dumps accepts (tuple keys, sets)."""
    if isinstance(value, dict):
        return {
            (",".join(map(str, k)) if isinstance(k, tuple) else str(k)): jsonable(v)
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, (set, frozenset)):
        return sorted(jsonable(v) for v in value)
    return value


def assigned_name(node):
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
        return node.targets[0].id
    return None


def collect_text_list(tree, list_name):
    """Reads `<list_name>.append("...")` statements in file order."""
    items = []
    for node in tree.body:
        if not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)):
            continue
        call = node.value
        func = call.func
        if (
            isinstance(func, ast.Attribute)
            and func.attr == "append"
            and isinstance(func.value, ast.Name)
            and func.value.id == list_name
            and len(call.args) == 1
            and isinstance(call.args[0], ast.Constant)
            and isinstance(call.args[0].value, str)
        ):
            items.append(call.args[0].value)
    return items


def collect_extend_list(tree, list_name):
    """Strings of every `<list_name>.extend([...])` call at module level (the tavern rumours)."""
    items = []
    for node in tree.body:
        if not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)):
            continue
        call = node.value
        func = call.func
        if (
            isinstance(func, ast.Attribute)
            and func.attr == "extend"
            and isinstance(func.value, ast.Name)
            and func.value.id == list_name
            and len(call.args) == 1
            and isinstance(call.args[0], ast.List)
        ):
            items.extend(el.value for el in call.args[0].elts if isinstance(el, ast.Constant) and isinstance(el.value, str))
    return items


def write_json(name, data):
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=False) + "\n", encoding="utf-8")
    return path


def main():
    source_bytes = SOURCE.read_bytes()
    tree = ast.parse(source_bytes.decode("utf-8"), filename=str(SOURCE))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    report = {"source": "old_code/g.py", "sha256": hashlib.sha256(source_bytes).hexdigest(), "tables": {}, "errors": []}
    constants = {}
    found_tables = {}

    for node in tree.body:
        name = assigned_name(node)
        if name is None:
            continue
        if name in TABLES:
            found_tables[name] = jsonable(ast.literal_eval(node.value))
        elif name.isupper():
            try:
                constants[name] = jsonable(ast.literal_eval(node.value))
            except (ValueError, SyntaxError):
                pass  # references other names or calls functions: not plain data

    for name, expected in TABLES.items():
        data = found_tables.get(name)
        if data is None:
            report["errors"].append(f"{name}: not found in g.py")
            continue
        write_json(name, data)
        report["tables"][name] = {"count": len(data), "expected": expected}
        if len(data) != expected:
            report["errors"].append(f"{name}: {len(data)} entries, expected {expected}")

    for list_name, expected in TEXT_LISTS.items():
        items = collect_text_list(tree, list_name)
        write_json(list_name, items)
        report["tables"][list_name] = {"count": len(items), "expected": expected}
        if len(items) != expected:
            report["errors"].append(f"{list_name}: {len(items)} entries, expected {expected}")

    rumors = collect_extend_list(tree, "rumors")
    write_json("rumors", rumors)
    report["tables"]["rumors"] = {"count": len(rumors), "expected": len(rumors)}

    write_json("constants", constants)
    report["constants"] = len(constants)
    (OUT_DIR / "export_report.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")

    for name, info in report["tables"].items():
        mark = "OK " if info["count"] == info["expected"] else "ERR"
        print(f"{mark} {name:<16} {info['count']:>4} (expected {info['expected']})")
    print(f"    constants        {report['constants']:>4}")
    if report["errors"]:
        print("\n".join(f"ERROR: {e}" for e in report["errors"]), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
