# Kampfbalance: Prüfung des überarbeiteten Vorschlags (v4)

Stand 24.10.2026. Geprüft wurde die Zusammenfassungstabelle in `docs/KAMPF_BALANCE.md` in der Fassung des Nutzers (Abschnitt 1, Spalte „Vorschlag“), im Werkzeug `tools/balance/` als Formelsatz **`v4`** abgelegt.
**Am Spiel wurde nichts geändert.** Geändert bzw. neu sind nur Dateien in `tools/balance/` und diese Datei. Rohdaten: `tools/balance/out/report-v4/`.

## 0. Nachtrag vom 25.10.2026: Nahkampf-Lesart geklärt, feste Stufenpaare

Der Nutzer hat die Nahkampfformel klargestellt: **`Waffe + (STÄ×0,1 + Klasse) / 3 × Stufe − Rüstung`**, dann `× (1 − res_physical)` (Ritter, Klassenwert +2, Stufe 35, Stärke 30, Waffe 10: 68,3 Schaden). Das ist im Werkzeug jetzt der Formelsatz **`v4`** (vorher `v4a`); die wörtliche Lesart mit `Waffe ×` heißt `v4mul`. **Die Abschnitte 1 bis 3 und 5 bis 7 unten rechnen noch mit der alten wörtlichen Lesart (`v4mul`)**; die Zahlen der richtigen Lesart stehen hier und in Abschnitt 4 (Zeile `v4a` = jetzt `v4`).

Simuliert wurden die vom Nutzer genannten Paare: schwache Gruppe und starke Gruppe je Tier (Tier 1: Stufe 1 und 10, Tier 2: 10 und 20, Tier 3: 20 und 30, Tier 4: 30 und 40, Tier 5: 40 und 50). Die Quest-XP der Helden sind damit in den Stufen enthalten. Gegner: Monster der Klasse t, Gruppengröße wie im Generator; Ausrüstung typisch für das Tier; Attribute wachsen auf 40 bei Stufe 50; 300 Läufe je Zelle und Gruppe. Mittel über fünf Gruppen (HP-Verlust · Tote je Kampf · Sieg), `out/report-v4/zellen-class.txt`:

| Tier | Stufe | heute | **v4** | v4 ohne Terminator |
|---|---|---|---|---|
| 1 | 1 | 13 % · 0,37 · 94 % | **10 % · 0,08 · 99 %** | |
| 1 | 10 | 0 % | 0 % | |
| 2 | 10 | 5 % · 0,03 | **7 % · 0,03 · 100 %** | |
| 2 | 20 | 1 % | 1 % | |
| 3 | 20 | 3 % | **3 % · 0,00 · 100 %** | |
| 3 | 30 | 1 % | 1 % | |
| 4 | 30 | 12 % · 0,05 · 99 % | **13 % · 0,06 · 98 %** | 13 % · 0,06 |
| 4 | 40 | 5 % · 0,00 | 6 % · 0,01 · 100 % | 6 % · 0,01 |
| 5 | 40 | 42 % · 0,27 · 78 % | **46 % · 0,31 · 72 %** | 43 % · 0,05 · 77 % |
| 5 | 50 | 26 % · 0,08 · 94 % | **31 % · 0,13 · 90 %** | 27 % · 0,02 · 93 % |

* **Auch mit diesen Paaren ist die Herausforderung nicht gleich:** schwach gegen schwach (Tier 1, Stufe 1) 10 %, stark gegen stark (Tier 5, Stufe 50) 31 %, und Tier 5 mit Stufe 40 sogar 46 %. Tier 2 und 3 kosten 1–7 %, Tier 4 6–13 %. Der Sprung kommt von Tier 4 auf Tier 5 (13 % → 46 % am unteren, 6 % → 31 % am oberen Paar); Am unteren Paar kosten Tier 1 bis 4 10 / 7 / 3 / 13 %: Tier 2 und 3 sind etwas zu leicht, Tier 4 passt zu Tier 1, Tier 5 ist die Wand.
* **v4 ist gegen heute leichter für den Anfang** (Tote auf Stufe 1: 0,37 → 0,08), **aber in Tier 5 etwas härter** (31 gegen 26 % auf Stufe 50). Grund: Nahkampf (ein Drittel des Stufenanteils) und Bogen (Trefferchance ohne Faktor 0,5) sind schwächer als heute. Die Nahkampfgruppe (Ritter, Barbar, Paladin, Kleriker) ist am schwächsten: Tier 4 auf Stufe 30 **30 %** (heute 25 %), Tier 5 auf Stufe 40 **63 % · 0,51 Tote** (heute 56 % · 0,37), auf Stufe 50 noch 53 %. Mit `res_physical` 0,6 bis 1 (Terminator, Vampir, Geister, Mumien) trifft sie fast nichts.
* **Der Terminator** bestimmt die Toten in Tier 5 (0,31 → 0,05 ohne ihn auf Stufe 40; 0,13 → 0,02 auf Stufe 50), **nicht den Verlust** (46 → 43 %). Tier 5 ist also auch ohne ihn zu hart.
* **Was die Gruppe im Spiel wirklich trifft** (Gruppen, wie der Generator sie in Dungeons, Burgen und Höhlen setzt; `zellen-world.txt`): überall 1–7 % Verlust, nur Tier 1 auf Stufe 1 12 % · 0,36. Dort sind die Monster gemischt (in Tier-5-Orten nur 14 % der Klasse 5). Die Wand liegt in der Überwelt, in Hütten und bei Bossen.
* **Wie viel Stufe Tier 5 braucht:** für 25 % Verlust ab Stufe etwa 60, für 12 % etwa 80 (Vergleich: Tier 4 hat 25 % schon auf Stufe 26, Tier 3 auf Stufe 11). Tier 5 liegt damit etwa 20 Stufen über dem, was die Paare vorsehen (Stufe 40 und 50). Entweder die Tier-5-Stufen steigen (Quest-XP und Tabelle), oder die Klasse-5-Monster (Lebenspunkte 400 bis 5'000, Rüstung 30 bis 100) sind zu stark für Stufe 40 bis 50.

### Nachtrag 2 (25.10.2026): Endgame-Waffen (Schaden 57), Stufe 60, Orb +20 %

* **Waffen:** Bisher nicht einberechnet. Die „typische“ Ausrüstung von Tier 5 hat im Werkzeug einen mittleren Nahkampfschaden von **22,7** (Waffe plus Ringe), die beste Ausrüstung 57,2 (`weapons.ts`). Jetzt rechnet `BALANCE_WEAPON=t5:57` Tier 5 mit **57** (Spannweite der Waffe bleibt; der Bogen wird um denselben Faktor angehoben, im Mittel 36,5 statt 15,1).
* **Ergebnis: fast keine Änderung.** Der Grund: Waffenschaden ist nur ein Summand (der Ritter schlägt auf Stufe 40 mit 141 statt 107, der Bogner mit 97 statt 62), die Kämpfe in Tier 5 entscheiden Zauber (Disintegrate 250, Implosion 1'000 …), Stufenanteil und das Leben der Monster. Mittel über fünf Gruppen, Klasse-5-Monster, v4 (`zellen-waffe57.txt`, `zellen-t5-l60-typisch.txt`):

| Tier 5, Stufe | v4, typische Waffen (22,7) | v4, Waffen 57 | heute, Waffen 57 |
|---|---|---|---|
| 40 | 46 % · 0,31 · 72 % | 46 % · 0,36 · 73 % | 40 % · 0,23 · 82 % |
| 50 | 31 % · 0,13 · 90 % | 31 % · 0,12 · 90 % | 23 % · 0,07 · 95 % |
| 60 | 22 % · 0,06 · 95 % | **22 % · 0,07 · 94 %** | 16 % · 0,03 · 98 % |

  Die Nahkampfgruppe profitiert kaum (Stufe 40: 64 % → 64 %, Stufe 60: 43 %; mit Rüstung 30 bis 100 und `res_physical` bis 1 bleibt der Nahkampf schwach). Die Schlussfolgerung von Abschnitt 0 gilt also unverändert: **Tier 5 kostet auf Stufe 40 und 50 zu viel (46 / 31 %), auf Stufe 60 (Endstufe) 22 %: das ist weniger als das Doppelte von Tier 4 auf Stufe 30 (13 %).** Misst man Tier 5 erst an der Endstufe 60 statt an Stufe 40 und 50, ist die Zunahme „leicht“: 10 % (Tier 1, Stufe 1) → 7 % (Tier 2) → 3 % (Tier 3) → 13 % (Tier 4) → 22 % (Tier 5, Stufe 60).
* **Terminator** (Standardgruppe, zwei Stück, Waffen 57, `monster-l60-t5-waffe57.txt`): Stufe 40 **35 % Sieg · 2,5 Tote**, Stufe 45 76 % · 1,3 Tote, Stufe 50 **99 % · 0,31 Tote · 25 % Verlust**, Stufe 60 99 % · 0,10 Tote · 15 % Verlust. Er ist also ab Stufe 40 ein ernster Kampf (der Kampf in Stufe 40 bis 45 ist gefährlich), aber **für Helden der Endstufe 60 nicht mehr „besonders herausfordernd“** (15 % Verlust). Soll er dort fordern, müsste er stärker sein oder in größerer Zahl auftreten. Die anderen Klasse-5-Monster sind auf Stufe 60 ebenfalls leicht (Great Hydra 37 % Verlust, Minotaur King 11 %, Kudo crab 12 %).
* **Orb +20 % Zauberschaden** (Dokument `KAMPF_BALANCE.md` und Werkzeug `v4` angepasst): Verlust −8 % gegenüber ohne Orb (Wolf 10 %: −7 %, Fee −30: −17 %; `mascots-v4.txt`). Der Orb ist damit so stark wie der Wolf, die Fee bleibt die stärkste; für ungefähr gleiche Werte (je −17 bis −20 %) bräuchte der Orb +50 %, der Wolf 30 %.

## 1. Ergebnis in Kürze

**Die Herausforderung ist mit v4 nicht gleichmäßig.** Entlang des XP-Pfads (Stufe, auf der die Gruppe ein Tier erreicht, wenn sie die Hälfte der darunterliegenden Tiers geräumt hat) kostet ein Kampf gegen Monster der Klasse t zu Beginn des Tiers im Mittel von fünf Gruppen:

| Tier (Monsterklasse) | Eintrittsstufe | HP-Verlust je Kampf | Tote je Kampf | Sieg |
|---|---|---|---|---|
| 1 | 1 | 12 % | 0,12 | 98 % |
| 2 | 11 | **5 %** | 0,03 | 100 % |
| 3 | 16 | **6 %** | 0,00 | 100 % |
| 4 | 23 | 20 % | 0,15 | 97 % |
| 5 | 35 | **40 %** | 0,47 | 77 % |

* **Schwache Gruppe gegen schwache Monster (Tier 1, Stufe 1) und starke Gruppe gegen starke Monster (Tier 5, Stufe 35) sind nicht gleich schwer:** 12 % gegen 40 % Verlust, 0,12 gegen 0,47 Tote je Kampf. Dazwischen liegen zwei Tiers (2 und 3), die mit 5 bis 6 % fast nichts kosten.
* Die Zunahme zu den schweren Monstern ist damit **nicht „leicht“, sondern eine Wand** zwischen Tier 3 und Tier 4/5. Innerhalb eines Tiers sinkt der Verlust wie gewollt (Tier 5: 40 % → 19 % bis Stufe 52), das ist die Wirkung des Aufstiegs.
* **v4 ist besser als der heutige Stand**, aber nur teilweise: Tote auf Stufe 1 gegen Tier 1 0,39 → 0,12, Verlust in Tier 5 am Eintritt 52 % → 40 %, in Tier 4 24 % → 20 %. Die Tiers 2 und 3 bleiben genauso leicht wie heute (4–6 %).
* Der **Bogen ist nicht mehr die beste Waffe** (Salve aus 1 Feld bei Ritter Stufe 35: 123 → 120 Schaden, aus 4 Feldern 68 → 34), der Nahkampf gewinnt dafür sehr stark (siehe Abschnitt 4: das hängt an der Lesart der Nahkampfformel).

Was zur Ungleichheit führt, ist **nicht die Kampfformel**, sondern das Zusammenspiel von XP-Pfad und Monsterstärke (Abschnitt 3). Die Formeln von v4 sind gut genug; die Verteilung der Stufen auf die Tiers nicht.

## 2. Wie gemessen wurde

* **Formeln v4** (`proposals.ts`, `makeV4`): Leben `(AUS/2 + Klasse + Rasse) × Stufe + 10`; Nahkampf `(Waffe × (STÄ×0,1 + Klasse) / 3 × Stufe − Rüstung) × (1 − res_physical)`, nie unter 0; Fernkampf-Trefferchance `GEN / (Tempo × Entfernung)`; Fernkampfschaden `Waffe + (GEN×0,1 + 0,8×Klasse) × Stufe − 0,5 × Rüstung`; Monsterschlag wie heute; Wolf tötet unter 10 %; Fee −30; Orb +20 % Angriffszauberschaden (ohne Zusatzmana; in diesem Dokument zunächst mit 10 % gerechnet, `v4` im Werkzeug hat seit dem Nachtrag 2 die 20 %); XP-Tabelle `Basis × 25 × 1,25^(Stufe−1)` bis Stufe 18, danach +8 % je Stufe; Training `10 × Stufe²`. Alles andere (Mana, Zauber, Todesregel, halbierte Chance für „Dead“/„Eradication“) wie im Spiel.
* **Gegner:** Klasse t = Monster mit `treasure_level` t (nur Landmonster), Gruppengröße wie der Generator sie im Tier t setzt. Das sind die Gruppen der Überwelt (dort sind 91–98 % der wilden Gruppen eines Tiers reine Klasse-t-Gruppen, `out/report-v4/worldmix.txt`).
* **Gruppen:** Standard, Nahkampf, Fernkampf, Klassisch, Zauberer (gleich gewichtet); Ausrüstung „typisch für das Tier“; Attribute wachsen linear auf 40 bei Stufe 50; Rast nach jedem Kampf; 200 Läufe je Zelle und Gruppe.
* **XP-Pfad:** Der Vorrat der Welt neu gemessen (drei Beispielwelten, `GEN_VERSION` 24, Monster-XP „XP_new“): Tier 1 3,2 Mio. XP, Tier 2 5,7 Mio., Tier 3 27 Mio., Tier 4 111 Mio., Tier 5 488 Mio. (die Zahlen aus `KAMPF_BALANCE.md` 3.7 waren 1,6 / 2,0 / 17 / 106 / 504 Mio.: Tier 1 und 2 geben jetzt etwa das Doppelte bis Dreifache). Mit der v4-Tabelle erreicht die Gruppe nach dem Räumen der Hälfte der Tiers darunter Stufe **1 / 11 / 16 / 23 / 35** für Tier 1 bis 5. Die festen Bänder des alten Zielbilds (1 / 5 / 11 / 19 / 33) liefern dasselbe Bild (unten).
* **Prüfung des Werkzeugs:** `verify.ts` meldet weiter „OK“ (5000 zufällige Helden, Ausrüstungen und Monster: Formeln des Werkzeugs = Spiel). Die Zahlen für „heute“ weichen von der Tabelle in `KAMPF_BALANCE.md` 3.1 ab (Standardgruppe Stufe 1 gegen Tier 2: damals 86 % Sieg / 0,82 Tote, jetzt 62 % / 1,70); ich habe die Ursache nicht untersucht (die Monstertabelle und die Gruppen des Generators haben sich seit dem Bericht geändert).

## 3. Warum die Herausforderung nicht gleich ist

„Iso-Stufe“ = niedrigste Stufe, ab der ein Kampf im Tier höchstens 25 % der Lebenspunkte kostet (und weniger als 0,15 Tote). Das ist die Stufe, auf der die Gruppe dem Tier „gewachsen“ ist:

| Tier | Iso-Stufe 25 % (v4) | Eintrittsstufe nach XP-Pfad | Unterschied |
|---|---|---|---|
| 1 | 1 | 1 | 0 |
| 2 | 6 | 11 | **+5** (zu hoch, zu leicht) |
| 3 | 10 | 16 | **+6** (zu leicht) |
| 4 | 24 | 23 | −1 (passt) |
| 5 | 52 | 35 | **−17** (zu schwer; ohne Terminator 42, also −7) |

Wären die Eintrittsstufen 1 / 6 / 10 / 24 / 42–52, wäre die Herausforderung am Eintritt jedes Tiers etwa 25 %. Die v4-Tabelle verlangt dafür (Mittel der Standardgruppe) 0,46 Mio. XP für Stufe 7 (= 14 % des XP-Vorrats von Tier 1), 1,05 Mio. für Stufe 10 (12 % des Vorrats unter Tier 3), 20,3 Mio. für Stufe 24 (56 % des Vorrats unter Tier 4) und 127 Mio. für Stufe 42 (**87 %** des Vorrats unter Tier 5). Mit anderen Worten: **die Tiers 1 bis 3 geben viel zu viel XP für ihre Schwierigkeit, Tier 4 und 5 zu wenig.** Das ist keine Frage der Kampfformel. Hebel (Vorschläge, nicht gerechnet bis zum Ende):

1. **Monster-XP von Tier 1 bis 3 senken** (im Verhältnis etwa auf ein Drittel bis ein Viertel, wenn die Tabelle bleibt) oder die XP-Tabelle anfangs steiler machen (Stufe 7 erst bei ~1,5 Mio. statt 0,46 Mio.). Die Verdopplung der Tier-1/2-XP durch die neue Monstertabelle hat den Abstand vergrößert.
2. **Tier 4 und 5 stärker belohnen oder die Monster dort entschärfen**, sonst braucht man für Tier 5 fast alles darunter.
3. Eine Abflachung der Stärke der Monster von Tier 3 auf 4 (HP ×3 bis ×4, Rüstung +10) wäre die unmittelbarste Stelle; die Helden wachsen nur linear.

### Ausreißer: Terminator

Der Terminator (Rüstung 100, `res_physical` 1, „Causes Eradication“, 232–928 Schaden) ist mit der neuen Nahkampfformel **gegen jeden Nahkampfschlag immun**. Standardgruppe Stufe 35 gegen zwei Terminator: 6 % Sieg, 3,4 Tote. Er bestimmt die Toten in Tier 5: ohne ihn fallen sie an der Eintrittsstufe von 0,47 auf 0,08 und der Verlust von 40 % auf 35 % (Stufe 41: 25 %, Stufe 52: 13 %: das wäre die „leichte Zunahme“ des Zielbilds). Die Nahkampfgruppe verliert mit ihm 0,79 Tote je Kampf, ohne ihn 0,09. `res_physical` 0,8 bis 1 haben außerdem Skeleton, Zombie, Ghoul, Ghost, Fire Stalker, Mummy (King), Vampire (King), Reaper, Spirit Shield: dort wirkt der Nahkampf kaum, der Bogen wirkt voll (`res_physical` gilt in der Formel nur für den Nahkampf).

### Verteilung auf die Gruppen

HP-Verlust · Tote je Kampf an der Eintrittsstufe, v4:

| Gruppe | T1 / L1 | T2 / L11 | T3 / L16 | T4 / L23 | T5 / L35 | T5 ohne Terminator |
|---|---|---|---|---|---|---|
| Standard | 8 % · 0,01 | 4 % · 0,01 | 5 % · 0,00 | 14 % · 0,06 | 42 % · 0,56 | 28 % · 0,04 |
| Nahkampf | 13 % · 0,06 | 4 % · 0,01 | 7 % · 0,00 | **31 % · 0,28** | 48 % · 0,79 | 43 % · 0,09 |
| Fernkampf | 8 % · 0,04 | 4 % · 0,01 | 5 % · 0,00 | 14 % · 0,10 | 39 % · 0,36 | 32 % · 0,02 |
| Klassisch | 16 % · 0,20 | 6 % · 0,04 | 6 % · 0,00 | 19 % · 0,20 | 31 % · 0,26 | 31 % · 0,09 |
| Zauberer | 18 % · 0,28 | 7 % · 0,06 | 7 % · 0,00 | 22 % · 0,14 | 40 % · 0,36 | 35 % · 0,17 |

Auf Stufe 1 sind Zauberer und Klassisch (Magier mit 12 statt 2 Lebenspunkten) mit 0,2–0,3 Toten je Kampf deutlich schwächer als die Standardgruppe (0,01), aber weit besser als heute (0,55–0,66). Die Nahkampfgruppe ist in Tier 4 am schwächsten (31 %).

## 4. Offene Frage: die Lesart der Nahkampfformel

`(Waffe x (STÄ×0,1 + Klasse) /3 × Stufe − Rüstung)` ist nicht eindeutig. Gerechnet sind drei Lesarten (Ritter, Rüstung des Gegners 15, Schaden eines Schlags):

| Lesart | Formel | Ritter Stufe 11 | Stufe 35 | Tier 5 am Eintritt (Verlust · Tote) |
|---|---|---|---|---|
| heute | `(STÄ×0,1 + Klasse) × Stufe + Waffe − Rüstung` | 63 | 260 | 52 % · 0,40 |
| **`v4` (wörtlich)** | `Waffe × (STÄ×0,1 + Klasse) / 3 × Stufe − Rüstung` | **313** | **1'907** | 40 % · 0,47 |
| `v4a` | `Waffe + (STÄ×0,1 + Klasse) / 3 × Stufe − Rüstung` | 22 | 92 | 55 % · 0,47 |
| `v4b` | `Waffe + (STÄ×0,1 + Klasse) × Stufe − Rüstung`, mit `res_physical` | wie heute (63) | wie heute (260) | 53 % · 0,41 |

Die wörtliche Lesart macht den Nahkampf **fünf- bis siebenmal so stark wie heute** (ein Schlag des Ritters auf Stufe 35 tötet fast jedes Tier-5-Monster), und er wächst mit Waffe × Stufe, also schneller als alles andere; selbst der Magier schlägt auf Stufe 35 mit 419 Schaden zu (heute 68). Ob das gewollt ist, entscheidet über Zauber und Bogen: Nahkampf 1'907, Bogensalve aus einem Feld 120. `v4a` macht den Nahkampf dagegen schwächer als heute (Tier 5 wird härter). **Bitte klären, welche Lesart gemeint ist**; ohne Antwort gelten die Zahlen der wörtlichen Lesart.

## 5. Maskottchen

HP-Verlust gegen ohne Maskottchen, Mittel über sechs Zellen in Tier 3 bis 5 und vier Gruppen (300 Läufe, Messstreuung ±3 Prozentpunkte; `out/report-v4/mascots-v4.txt`):

| | heute (Spiel) | v4 |
|---|---|---|
| Wolf | tötet unter 90 %: **−77 %** | tötet unter 10 %: **−7 %** |
| Fee | −20 je Treffer: −15 % | −30 je Treffer: **−20 %** |
| Orb | +20 % Mana: ±0–2 % | +10 % Zauberschaden: **−3 bis −6 %** |

Der Wolf ist mit 10 % praktisch wertlos (6 % bei einer Schwelle von 5 %), die Fee dreimal so stark wie Wolf und Orb. Gleich stark (je etwa −20 %) wären: Wolf bei **30 %** (−18 %), Fee −30 (−20 %), Orb **+50 % Zauberschaden** (−18 %). Die Fee wirkt nur auf Elementartreffer und fast nur in Tier 4 und darunter; in Tier 5 ändert sie wenig, weil dort die Treffer um ein Vielfaches über 30 liegen.

## 6. Was das Spiel dem Spieler wirklich zeigt

Die Gruppen der Überwelt sind reine Klasse-t-Gruppen, aber **die Orte (Dungeons, Burgen, Höhlen) sind gemischt**: in den Orten von Tier 5 sind nur 14 % der Monster Klasse 5, 17 % Klasse 4, 37 % Klasse 3, 25 % Klasse 2 und 7 % Klasse 1 (Tier 4: 3 / 15 / 38 / 24 / 21 %). Rechnet man mit den Gruppen, die der Generator wirklich setzt (`--groups=world`), kostet ein Kampf in jedem Tier an den Eintrittsstufen nur noch 5–10 % (Tote 0,08–0,33): das Spiel ist im Innern **durchgehend leicht**, die Wand sieht man nur an den Gruppen draußen, in Hütten und bei Bossen. Wenn „Herausforderung“ das Gefühl im Dungeon meint, ist es dort bei v4 wie heute zu leicht.

## 7. Empfindlichkeit

(Standardgruppe, v4, `out/report-v4/sens-v4.txt`.) Wie bei den früheren Berichten dominieren Annahmen, die das Spiel nicht festlegt:

* **Attributwachstum:** ohne Wachstum steigt der Verlust in Tier 4 und 5 auf 49–53 % mit 0,9 Toten je Kampf (mit Wachstum auf 40: 37 %, 0,4); mit 60 statt 40 bei Stufe 50 sinkt er auf 23–24 %. Das Wachstum der Attribute (Schreine, Tränke, Ringe) gehört zur Balance.
* **Ausrüstung:** mit der besten Ausrüstung des Tiers fällt der Verlust überall auf 1–7 %.
* **Zauber, Abstand, Gang oder Halle** ändern die Ergebnisse um höchstens ±10 Prozentpunkte.

## 8. Empfehlung

1. Die Formeln von v4 (Leben +10, Bogen-Trefferchance, Bogenschaden, XP-Tabelle, Training) können so bleiben; sie bringen Stufe 1 und das Tier-4-Niveau an die Zielwerte.
2. **Nahkampf-Lesart klären** (Abschnitt 4); sie entscheidet, ob der Nahkampf alles andere überholt.
3. **Terminator entschärfen** (z. B. `res_physical` 0,5 statt 1) oder bewusst als Zauber- und Bogenziel lassen und die Nahkampfgruppen davor warnen.
4. **Den Abstand zwischen Tier 3 und 4 schließen:** entweder die XP von Tier 1 bis 3 senken bzw. die Tabelle anfangs steiler machen (Eintrittsstufen ≈ 1 / 7 / 10 / 24 / 40) oder die Monster von Tier 4 und 5 schwächen. Ohne das bleiben Tier 2 und 3 ein Spaziergang und Tier 5 eine Wand.
5. **Wolf auf etwa 30 % und Orb auf etwa +50 % Zauberschaden**, wenn die drei Maskottchen gleich viel wert sein sollen.

## 9. Wiederholen

```
cd game
npx tsx tools/balance/verify.ts 5000                                              # Formeln = Spiel
npx tsx tools/balance/supply.ts alpha; ... beta; ... gamma                        # Vorrat der Welt (Zwischenspeicher in out/ vorher verschieben)
npx tsx tools/balance/challenge.ts --formulas=current,v3x,v4 --runs=200 --perparty # Tabellen dieses Dokuments (XP-Pfad, Klasse-t-Gruppen)
npx tsx tools/balance/challenge.ts --formulas=current,v4 --path=bands              # feste Bänder 1/5/11/19/33
npx tsx tools/balance/challenge.ts --formulas=current,v4 --groups=world            # Gruppen, wie der Generator sie setzt
BALANCE_EXCLUDE=Terminator npx tsx tools/balance/challenge.ts --formulas=v4        # ohne einzelne Monster
npx tsx tools/balance/challenge.ts --formulas=v4 --mascot=Wolf                     # mit Maskottchen
npx tsx tools/balance/mascots.ts v4 300                                            # Wert der Maskottchen
npx tsx tools/balance/xpneed.ts v4 1,7,10,24,42                                    # XP für gewünschte Eintrittsstufen
npx tsx tools/balance/cli.ts power --formulas=v4 --levels=1,5,11,23,35,50          # Leben, Nahkampf, Bogen je Stufe
```

Neu im Werkzeug: `challenge.ts` (Herausforderung je Tier entlang des XP-Pfads, Iso-Stufen, je Gruppe), `xpneed.ts`, `worldmix.ts`, `monlist.ts`; Formelsätze `v4`, `v4a`, `v4b` in `proposals.ts`; `orbSpell` (Orb als Zauberschaden) in `formulas.ts`/`fight.ts`; `BALANCE_EXCLUDE` in `scenario.ts`; Orb- und Maskottchenzeilen in `mascots.ts`. Der alte Vorrat der Welt liegt unverändert in `out/supply-alt/`.
