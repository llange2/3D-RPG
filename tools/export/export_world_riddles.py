"""
Cleans the riddle list of the user's quest document (.ignore/quests_1.2.md, "Liste der Rätsel") into src/data/riddles-world.json.

The campaign keeps its own table (RIDDLES_MASTER, untouched); the generated world (riddle statues, mini quests, rumours, quest_6) reads
this file. The curation below is the whole decision: every dropped number has a reason, every fixed answer is listed, and no answer
may be used by more than MAX_SAME riddles (the user's answer to open point 8: "Ja", about four).

Usage: python -I tools/export/export_world_riddles.py
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / ".ignore" / "quests_1.2.md"
OUT = ROOT / "src" / "data" / "riddles-world.json"
REPORT = ROOT / "docs" / "RAETSEL_BEREINIGUNG.md"

MAX_SAME = 4

# Dropped: the answer is no single word, is one letter, is broken or stands in the question.
DROP = {
    1: "answer 'gold coin' is two words (coin has three riddles already)",
    13: "'death by arrow' is no single word",
    14: "'death by axe' is no single word",
    15: "'death by hanging' is no single word",
    18: "broken: the answer stands in the question text",
    20: "the answer 'that' stands in the question",
    24: "one-letter answer",
    50: "broken text ('rugo f smothering')",
    66: "broken: question holds answer and instructions",
    82: "one-letter answer",
    83: "'counterfeit money' is two words",
    86: "four words",
    94: "one-letter answer",
    99: "one-letter answer",
    110: "'right elbow' is two words",
    115: "one-letter answer",
    119: "'are you asleep' is no word",
    123: "'letter e' is no word",
    125: "'rubber band' is two words",
    130: "'garbage truck' is two words",
    145: "the answer 'echo' stands in the question",
    178: "'deck of cards' (same riddle as #40 and #141)",
    179: "'deck of cards' (same riddle as #141)",
    189: "'day/night' is two words",
    197: "one-letter answer",
    205: "same riddle as #80",
    207: "one-letter answer",
    235: "'fool's gold' is two words",
    # identical or near identical question texts
    186: "same question as #100",
    193: "same question as #120",
    185: "same question as #162",
    159: "same question as #133 (piano or keyboard)",
    105: "same riddle as #3",
}

# Fixed: the answer becomes one word; the old wording stays an accepted alias.
FIX = {
    57: ("chest", ["treasure chest"]),
    80: ("graphite", ["pencil lead", "lead", "pencil"]),
    93: ("ring", ["wedding ring"]),
    141: ("cards", ["deck of cards", "deck"]),
    144: ("ball", ["tennis ball"]),
}

# Words that mean the same to the player. Every group is accepted for every riddle whose answer is in it.
SYNONYMS = [
    ["clock", "watch"],
    ["piano", "keyboard"],
    ["coin", "penny", "money"],
    ["fire", "flame"],
    ["man", "human", "person", "mankind"],
    ["river", "stream"],
    ["stairs", "stair", "staircase", "steps"],
    ["cold", "chill", "flu"],
    ["tomorrow", "future"],
    ["soul", "spirit"],
    ["wind", "breeze"],
    ["shoes", "shoe"],
    ["boots", "boot"],
    ["book", "tome"],
    ["candle", "candlelight"],
    ["mind", "brain", "thought"],
    ["map", "atlas"],
    ["hole", "pit"],
    ["fear", "terror"],
    ["life", "living"],
    ["silence", "quiet"],
    ["echo", "reverberation"],
    ["darkness", "dark"],
    ["mirror", "reflection"],
    ["sand", "sandy"],
]


def load_doc() -> dict:
    line = DOC.read_text(encoding="utf-8").split("\n")[112].strip().rstrip(",")
    line = re.sub(r'\\([^"])', r"\1", line)
    line = re.sub(r'(?<![\w"])(\d+): \{', r'"\1": {', line)
    return json.loads("{" + line + "}")


def main() -> None:
    src = load_doc()
    if len(src) != 300:
        sys.exit(f"expected 300 riddles in the document, found {len(src)}")

    kept: dict[int, dict] = {}
    for key, r in src.items():
        n = int(key)
        if n in DROP:
            continue
        answer = r["answer"].strip().lower().replace("’", "'")
        aliases: list[str] = []
        if n in FIX:
            answer, aliases = FIX[n]
        kept[n] = {"question": r["question"].strip(), "answer": answer, "aliases": aliases}

    # cap the number of riddles that share an answer: keep the lowest numbers (the later "I am ..." riddles are the vaguer ones)
    capped: dict[int, str] = {}
    seen: Counter = Counter()
    for n in sorted(kept):
        a = kept[n]["answer"]
        seen[a] += 1
        if seen[a] > MAX_SAME:
            capped[n] = f"answer '{a}' already has {MAX_SAME} riddles"
    for n in capped:
        del kept[n]

    group_of = {}
    for g in SYNONYMS:
        for w in g:
            group_of[w] = g
    for r in kept.values():
        extra = [w for w in group_of.get(r["answer"], []) if w != r["answer"]]
        r["aliases"] = sorted(set(r["aliases"] + extra))

    out = {str(n): kept[n] for n in sorted(kept)}
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    answers = Counter(r["answer"] for r in kept.values())
    by_len = Counter(len(r["answer"]) for r in kept.values())
    quest6 = sorted({r["answer"] for r in kept.values() if re.fullmatch(r"[a-z]{3,8}", r["answer"]) and r["answer"] not in r["question"].lower()})
    lines = [
        "# Bereinigung der Rätselliste (generiert)",
        "",
        "Erzeugt von `tools/export/export_world_riddles.py` aus `.ignore/quests_1.2.md`; Ergebnis `src/data/riddles-world.json`. Die Kampagne nutzt weiter die unveränderte `RIDDLES_MASTER`.",
        "",
        f"- Vorher: {len(src)} Rätsel. Nachher: **{len(kept)}** (Ziel 250 bis 300).",
        f"- Verschiedene Antworten: {len(answers)}; höchstens {MAX_SAME} Rätsel je Antwort.",
        f"- Für quest_6 (ein Wort, 3 bis 8 Buchstaben, nicht in der Frage): {len(quest6)} verschiedene Wörter.",
        "",
        "## Gestrichen (Grund)",
        "",
    ]
    lines += [f"- #{n}: {why}" for n, why in sorted({**DROP, **capped}.items())]
    lines += ["", "## Repariert (neue Antwort, alte bleibt als Alias)", ""]
    lines += [f"- #{n}: `{a}` (Alias: {', '.join(al)})" for n, (a, al) in sorted(FIX.items())]
    lines += ["", "## Länge der Antworten", ""]
    lines += [f"- {k} Buchstaben: {v}" for k, v in sorted(by_len.items())]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(src)} -> {len(kept)} riddles, {len(answers)} answers, {len(quest6)} words for quest_6")


if __name__ == "__main__":
    main()
