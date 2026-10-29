# Objekte des Spiels: wo sie stehen dürfen und was sie tun müssen

**Diese Liste gilt für alles, was ein Generator oder eine Regeldatei stellt** (Städte, Burgen, Höhlen, Dungeons, Pyramide/Raumschiff, Überwelt, Quests, Verkäufer).
Vor jeder Änderung an der Generierung (Regeln `src/data/rules/*.json`, Themes `src/data/dungeon-themes.ts`, Quests `src/actions/questGen.ts`, Städte `src/interiors/town.ts`,
Überwelt `src/world/*`, `src/data/talent-sellers.ts`) hier nachsehen, welches Objekt wo stehen darf.

- **Funktional = ja:** das Objekt muss eine Verwendung haben (ein Hebel zieht etwas, ein Fass ist ein Behälter, eine Truhe gibt etwas, ein Tor öffnet sich), auch wenn es nur eine Attrappe ist. Es ist **nie reine Deko**.
- **Orte:** ein Objekt steht nur in den Spalten, die für es gesetzt sind (Burg, Höhle, Dungeon, Stadt, Raumschiff = Innenraum der Pyramide, Überwelt).
- Quelle ist die Liste des Nutzers `.ignore/items.xlsx` plus die Korrekturen im Kopf von `tools/export/export_item_rules.py` (`ADD_PLACES`). Daraus entstehen **generiert** diese Datei und `src/data/item-rules.ts`
  (`python -I tools/export/export_item_rules.py`): nicht von Hand ändern. Änderungswünsche des Nutzers an der Liste kommen in die Excel-Datei oder nach `ADD_PLACES`, dann neu erzeugen.
- Im Code: `allowedIn(item, place)`, `isFunctional(item)` (`item-rules.ts`), `placeOf(map)` (`src/interiors/place.ts`), `itemIssues` in `validateContent` (ein Test über alle Orte schlägt bei einem Verstoß fehl), `plainProps(theme)` filtert die Deko.
- Jedes Objekt, das der Spieler sieht, sagt beim Betreten oder Anstoßen einen Satz (`src/data/prop-texts.ts`, `propLine`); neue Objekte bekommen eine Zeile. Bäume und Berge sind die Ausnahme.

| ID | Objekt | Funktional | Burg | Höhle | Dungeon | Stadt | Raumschiff | Überwelt | Anmerkung |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Chest | **ja** | x | x | x | x |  |  |  |
| 2 | Fountain |  | x |  |  | x |  | x |  |
| 3 | Portal | **ja** |  |  | x | x |  |  |  |
| 4 | Treasure | **ja** |  | x | x |  |  |  |  |
| 5 | Barrel | **ja** | x | x | x | x |  | x |  |
| 6 | Throne for an evil king |  | x |  | x |  |  |  |  |
| 7 | Mascot: Crow | **ja** |  |  |  | x |  |  |  |
| 8 | Mascot: Donkey | **ja** |  |  |  |  |  | x |  |
| 9 | Mascot: Fairy | **ja** |  |  |  |  |  | x |  |
| 10 | Mascot: Orb | **ja** |  |  |  |  |  | x |  |
| 11 | Mascot: Wolf | **ja** |  |  |  |  |  | x |  |
| 12 | Mining tools |  | x | x | x | x |  | x |  |
| 13 | Storage equipment |  | x | x | x | x |  |  |  |
| 14 | Table with food |  | x |  | x |  |  |  |  |
| 15 | Alchemy table |  | x |  | x |  |  |  |  |
| 16 | Wheelbarrow |  | x | x | x | x |  | x |  |
| 17 | Quest key blue | **ja** |  | x | x |  |  |  |  |
| 18 | Quest key black | **ja** |  | x | x |  |  |  |  |
| 19 | Quest key bronze | **ja** |  | x | x |  |  |  |  |
| 20 | Quest key golden | **ja** |  | x | x |  |  |  |  |
| 21 | Quest key green | **ja** |  | x | x |  |  |  |  |
| 22 | Quest key orange | **ja** |  | x | x |  |  |  |  |
| 23 | Quest key red | **ja** |  | x | x |  |  |  |  |
| 24 | Quest key silver | **ja** |  | x | x |  |  |  |  |
| 25 | Quest key rainbow | **ja** |  | x | x |  |  |  |  |
| 26 | Rustic caravan |  |  |  |  |  |  | x |  |
| 27 | Lion statue |  | x |  | x | x | x |  |  |
| 28 | Pegasus statue |  | x |  | x | x |  |  |  |
| 29 | Head statue |  | x |  | x | x |  |  |  |
| 30 | Good throne |  | x |  | x |  |  |  |  |
| 31 | Old tree |  |  |  |  |  |  | x |  |
| 32 | Gravestone |  | x | x | x | x |  | x |  |
| 33 | Large stone head |  |  | x | x |  |  | x |  |
| 34 | Obsidian dragon statue |  | x |  | x | x | x | x |  |
| 35 | Amethyst altar | **ja** | x | x | x | x | x | x |  |
| 36 | Giant sand clock | **ja** | x |  | x |  |  |  |  |
| 37 | Magic well red | **ja** | x | x | x |  |  |  |  |
| 38 | Skull on a spike |  |  | x |  |  |  | x |  |
| 39 | Lever | **ja** | x |  | x | x | x |  |  |
| 40 | Transporter | **ja** |  |  |  |  | x |  |  |
| 41 | Dungeon entrance | **ja** |  |  |  |  |  | x |  |
| 42 | Cave entrance | **ja** |  |  |  |  |  | x |  |
| 43 | Pyramid (3x3) | **ja** |  |  |  |  |  | x |  |
| 44 | Castle | **ja** |  |  |  |  |  | x |  |
| 45 | Hut |  |  |  |  |  |  | x |  |
| 46 | Oven |  | x |  | x |  |  | x |  |
| 47 | Village | **ja** |  |  |  |  |  | x |  |
| 48 | Persona: Cartographer |  | x |  |  | x |  |  |  |
| 49 | Persona: Job Offerer |  | x |  |  | x |  |  |  |
| 50 | Persona: Guild Apprentice |  | x |  |  | x |  |  |  |
| 51 | Persona: Sailor |  | x |  |  | x |  |  |  |
| 52 | Persona: Lord |  | x |  |  | x |  |  |  |
| 53 | Persona: Monk |  | x |  |  | x |  |  |  |
| 54 | Persona: Weapon master |  | x |  |  | x |  |  |  |
| 55 | Persona: Body builder |  | x |  |  | x |  |  |  |
| 56 | Persona: Mountaineer |  | x |  |  | x |  |  |  |
| 57 | Persona: Explorer |  | x |  |  | x |  |  |  |
| 58 | Persona: Good King |  | x |  |  |  |  |  |  |
| 59 | Persona: Neutral King |  | x |  |  |  |  |  |  |
| 60 | Persona: Evil King |  | x |  |  |  |  |  |  |
| 61 | Metal Statue |  | x |  | x | x |  |  |  |
| 62 | Coffin |  |  | x | x |  |  |  |  |
| 63 | Coffin opened |  |  | x | x |  |  |  |  |
| 64 | Quest: Keycard black | **ja** |  |  | x |  |  |  |  |
| 65 | Quest: Keycard blue | **ja** |  |  | x |  |  |  |  |
| 66 | Quest: Keycard red | **ja** |  |  | x |  |  |  |  |
| 67 | Power source crystal |  |  |  |  |  | x |  |  |
| 68 | Computer terminal |  |  |  |  |  | x |  |  |
| 69 | Grindstone |  | x |  | x | x |  |  |  |
| 70 | Bone pile |  |  | x | x |  |  |  |  |
| 71 | Abandoned fireplace |  |  | x | x |  |  | x |  |
| 72 | Noble chest | **ja** | x |  | x | x |  |  |  |
| 73 | Magic runes | **ja** |  | x | x |  |  | x |  |
| 74 | Iron chest | **ja** | x | x | x |  |  |  |  |
| 75 | Book shelf |  | x |  | x | x |  |  |  |
| 76 | Rustic lantern |  |  |  | x |  |  |  |  |
| 77 | Trap door | **ja** | x | x | x | x |  |  |  |
| 78 | Mascot: Bird Perch | **ja** |  |  |  | x |  |  |  |
| 79 | Mascot: Blue Mushroom | **ja** |  |  |  |  |  | x |  |
| 80 | Metal gate inverted | **ja** | x |  |  | x |  |  |  |
| 81 | Metal gate | **ja** |  |  | x |  |  |  |  |
| 82 | Persona: Skull miser | **ja** | x |  |  | x |  |  |  |
| 83 | Fractured vessels |  | x | x | x | x |  |  |  |
| 84 | Cyber wall (round inner corner) |  |  |  |  |  | x |  | Falls du die abgerundeten Wände auch ohne dieses Objekt darstellen kannst, benötigst du es nicht |
| 85 | Cyber wall (round outer corner) |  |  |  |  |  | x |  | Falls du die abgerundeten Wände auch ohne dieses Objekt darstellen kannst, benötigst du es nicht |
| 86 | Chalice | **ja** | x | x | x |  | x |  |  |
| 87 | Guillotine trap |  |  |  | x |  |  |  |  |
| 88 | Magic well (yellow) | **ja** | x | x | x |  |  |  |  |
| 89 | Mermaid fountain |  | x |  | x | x |  | x |  |
| 90 | Persona: Seth Squirm | **ja** | x |  | x | x |  |  |  |
| 91 | Well |  | x |  |  | x |  | x |  |
| 92 | Acid puddle | **ja** | x | x | x |  |  |  |  |
| 93 | Hanging Skeleton |  |  |  | x |  |  |  |  |
| 94 | Rustic Table |  | x |  | x | x |  |  |  |
| 95 | Stone Statue |  | x | x | x | x |  |  |  |
| 96 | Sapphire chest | **ja** | x |  | x | x |  |  |  |
| 97 | Book shelf (old) |  | x |  | x | x |  |  |  |
| 98 | Gallow |  | x | x | x |  |  |  |  |
| 99 | Wooden support beam |  |  |  | x |  |  |  |  |
| 100 | Castle gate |  | x |  |  |  |  |  |  |
| 101 | Monster Hut |  |  |  |  |  |  | x | Im Originalspiel spawnen die Monster neu (niemals mehr als die initiale Anzahl). Den Spawn Zyklus kenne ich nicht. Lass uns 1x pro Woche nehmen. |
| 102 | Monster Hut (burnt) |  |  |  |  |  |  | x | Wenn der Spieler sich entscheidet die Hütte niederzubrennen, erhält er XP und Loot (Level bestimmt sich durch das Monster Level) |
| 103 | Good Banner |  | x |  |  |  |  |  |  |
| 104 | Neutral Banner |  | x |  |  |  |  |  |  |
| 105 | Evil Banner |  | x |  |  |  |  |  |  |
| 106 | Persona: Generic 1 |  | x |  |  | x |  |  |  |
| 107 | Persona: Generic 2 |  | x |  |  | x |  |  |  |
| 108 | Persona: Generic 3 |  | x |  |  | x |  |  |  |
| 109 | Orb of ultimate power |  |  |  | x |  | x |  |  |
| 110 | Sign Temple |  |  |  |  | x |  |  |  |
| 111 | Sign Bank |  |  |  |  | x |  |  |  |
| 112 | Sign Guild |  |  |  |  | x |  |  |  |
| 113 | Sign Inn |  |  |  |  | x |  |  |  |
| 114 | Sign Smith |  |  |  |  | x |  |  |  |
| 115 | Sign Tavern |  |  |  |  | x |  |  |  |
| 116 | Sign Training |  |  |  |  | x |  |  |  |
| 117 | Crystals |  |  | x | x |  | x |  |  |
| 118 | Gong |  | x | x | x |  |  |  |  |
| 119 | Lectern |  | x |  | x | x |  |  |  |
| 120 | Lava puddle | **ja** | x | x | x |  |  |  |  |
| 121 | Magic Flames | **ja** | x | x | x |  | x |  |  |
| 122 | Quest: Keycard green | **ja** |  |  | x |  |  |  |  |
| 123 | Quest: Keycard purple | **ja** |  |  | x |  |  |  |  |
| 124 | Quest: Keycard brown | **ja** |  |  | x |  |  |  |  |
| 125 | Decoration: Moose King |  | x |  | x |  |  |  |  |
| 126 | Float | **ja** |  |  |  |  |  |  | Dieses Objekt erscheint automatisch sobald der Spieler das Wasser betritt, welches mehr als 1 Feld vom Ufer entfernt ist. Wasserflächen am Ufer können mit "Schwimmen" überquert werden, >1 Feld entfernt z.B. mit dem Zauberspruch "Walk on Water" |
| 127 | Stone coffin locked |  |  | x | x |  |  |  |  |
| 128 | Stone coffin unlocked |  |  | x | x |  |  |  |  |
