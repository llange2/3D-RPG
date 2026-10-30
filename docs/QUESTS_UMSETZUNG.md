# Quests und Levelgenerierung nach Quest-Dokument 1.2: Umsetzung

Stand 2026-10-29, Zweig `quests_v1_2`, `GEN_VERSION` 27. Quelle: `.ignore/quests_1.2.md`; die Antworten zu Abschnitt 9 der Liste `.ignore/quests_offene_punkte.md` sind eingearbeitet.
Entscheidungen der Sitzung: Die 23 Dungeon-Themes der Altkarten sind **ersetzt** (Quest, Layout und Stufe bestimmen den Ort), Reihenfolge „Fundament zuerst“.

## 1. Was jetzt gilt

| Baustein | Wo | Kern |
|---|---|---|
| Rätselliste | `tools/export/export_world_riddles.py` → `src/data/riddles-world.json`, `docs/RAETSEL_BEREINIGUNG.md` | 300 → **258** Rätsel, jede Antwort ein Wort, höchstens vier Rätsel je Antwort, Alias-Liste (`clock`/`watch`), Antwortprüfung `answerMatches` (Groß/Klein, Artikel, Plural, Alias, ein Tippfehler ab 5 Buchstaben). 150 Wörter mit 3–8 Buchstaben für quest_6. Die Kampagne behält die alte Liste. |
| Boss-Tabelle | `docs/RPG_0.1.xlsx` (Spalte „Boss for“), `src/data/quest-table.ts` `BOSS_PAIRS` | Alle zehn Paare stehen in der Tabelle (Top Jouster → Jouster; 81, 82, 84, 86 ergänzt). |
| Weltplan | `src/interiors/dungeonPlan.ts` `planPlaces`, `World.plan` | Für die **ganze Welt**: fünf Pyramiden (je Insel reihum), Schlüssel, Key Cards, Orbs, Quest, Layout, Aussehen, Mini-Quests, Münzen, Schädel, Seth. |
| Schlüssel | `KEY_COLORS` (9: Items 17–25) | Verschlossen sind die L3–5-Dungeons, so viele wie Schlüssel da sind und in Endräumen von L1/2-Orten (Dungeon und Höhle) liegen können (je Raum 1/2/3/3 nach Weltgröße); alle anderen sind offen, Höhlen immer. |
| Key Cards | `CARD_COLORS` blau, rot, grün, lila, braun (Items 65, 66, 122–124) | Je Pyramide eine, im Endraum eines L4/5-Dungeons (kleine Welt: bis zu drei je Raum). Die **schwarze** Key Card (Item 64) gibt der König. |
| Orbs | `ORBS_IN_WORLD` 31 | 2 je Sektion (10), 21 möglichst gleichmäßig auf die L5-Dungeons (gibt es keine, auf L4), eine Truhe mit `count`. |
| Endraum | `interiors/endRoom.ts`, `actions/endRoom.ts` | Jeder Ort hat einen. **Versiegelt** (eine Wandzelle, die die Quest öffnet; Quest 2: in der Wand der Halle) oder **Tasche im Fels** (Quest 1 und 3, Teleport; darin ein Portal ID3 zurück zum Eingang, in Höhlen Runen ID73). Inhalt: Schlüssel/Key Cards/Orbs je in einer Truhe, die den Gegenstand zeigt, dazu 2–4 Belohnungen der Tabelle „Loot“ (Gold, Attributspunkte, Levelaufstieg, Treasure, Zauber). Grenzfall: findet ein Ort keinen Fels für den Wunschtyp, nimmt er den anderen. |
| Layouts Dungeon | `interiors/dungeon.ts` | `dungeon_1` Schlauch aus 8–9 Räumen auf einer Schlange, kleine Einbuchtungen; `dungeon_2` Halle 5×4 mit Wegen zu Räumen, **jede** Wegmündung bekommt eine Tür/ein Gitter; `dungeon_3` Labyrinth (Gänge und Wände je 1 Feld, kleine Räume 3×3–4×4, keine Türen, **Runen auf aufgebrochenen Schleifen**, das Labyrinth ist ohne sie ganz); `dungeon_4` klassisch mit kleinen Kammern (2×2 oder Kreuz) mit großem Schatz. Laternen (ID76) in allen Dungeons. |
| Layouts Höhle | `interiors/cave.ts` | `cave_1` Ring 2–3 breit, 2–5 Auswölbungen von 20–25 Feldern, innere Kammern mit kurzem Zugang; `cave_2` der alte Zellautomat; `cave_3` Baum aus Kammern (jede nur über einen Weg) mit einzelnen Felsfeldern. Mindestens 230 Bodenzellen. |
| Quests 1–6 | `actions/questGen.ts`, Prüfung `questChecks.ts` | Siehe 2. |
| Mini-Quests, Gerüchte | `questGen.ts` `placeMinis`, `sim/economy.ts` `wordRumour` | Siehe 3. |
| Burgen | `interiors/castle.ts`, `actions/castle.ts`, `data/castles.ts` | Siehe 4. |
| Raumschiff | `interiors/spaceship.ts`, `actions/spaceship.ts` | Siehe 5. |
| ue_quest_1/2/3 | `actions/machines.ts`, `Game.meetSkullMiser`, `Game.meetKing` | Siehe 6. |

## 2. Die sechs Quests

* **quest_1 (stöhnende Statuen):** Eingangsraum 9×9, darin ein 3×3-Feld mit freiem Rand (5×5). Acht Statuen (`head` mit `mode: "moan"`), je ein Hebel (`lever` mit `target`) und vier Dummy-Hebel (12 insgesamt) in den übrigen Räumen und Sackgassen. Lösung: die vier Ecken, oder (30 %) eine Seite. Der Start ist nie die Lösung (mindestens zwei Statuen falsch). Die leere Mitte (`rune`, `need: "moan"`) teleportiert bei richtigem Stand in den Endraum. Hinweisstatue am Eingang (EN).
* **quest_2 (Richtung der Gesichter):** Fünf Kelche (`chalice`) mit Zahl 1–5 und Richtung N/E/S/W; der Held trinkt (Auswahl, Abbrechen möglich), Zustand L1/2: Poisoned/Diseased/Crazy/Cursed, L3–5: Petrified/Dead/Paralyzed/Rotten (gelten wie überall im Spiel, auch die Todesfristen). Fünf Köpfe (`head`, `mode: "rotate"`) in einer Reihe an einer Wand der 11×7-Halle, Kopf 1 links vom Blickenden; jeder Kopf sagt einen Satz zur Zahl und fragt vor dem Drehen (im Uhrzeigersinn). Der letzte richtige Kopf öffnet den Endraum (Wand der Halle).
* **quest_3 (Gongs):** 4 (oder 5) Gongs in den Räumen, die den Ecken der Karte am nächsten liegen (der fünfte in der Mitte), je 5–7 Monster aus dem Pool des Ortes (Anzahl und XP nach Weltgröße), nach dem letzten Gong erscheinen Runen (`rune`, `need: "gongs"`) in der Mitte des Ortes: Teleport in den Endraum. Monstertyp `beast` oder `plant`.
* **quest_4 (Rechnen):** 5–8 Statuen (nach Raumzahl) mit Tafeln (EN), Endstatue nahe dem Endraum (`riddle`, Antwort = Summe, Eingabe als Zahl). Rechenarten: Addition und Subtraktion, dazu „zwei/drei Brüder je n“ (explizite Vielfache); Summe höchstens dreistellig; die Tafeln tragen `fallen`, `questChecks` rechnet nach.
* **quest_5 (Endgegner):** Bevölkerung = Stufe des Ortes (3 von 5 Monstern, zwei weitere der Monstertypen), Boss das Paar aus der Tabelle (`BOSS_PAIRS`). **Variante B:** der Boss (`#q-endboss`) steht vor der Siegelwand, sein Tod öffnet den Endraum (`isEndBoss`). Genau ein Boss.
* **quest_6 (Rätselwort):** Wort aus der Liste (3–8 Buchstaben, Plan wählt es, damit Tavernen es verraten können), eine Statue je Buchstabe mit Geschichte (Brüder, Schwestern, Wachen, Lehrlinge; Namenspool für alle 26 Buchstaben, doppelte Buchstaben „gleicher Name“, `data/letter-hints.ts`), die Antwortstatue nahe dem Endraum stellt eine allgemeine Frage („welches Wort ergeben die Anfangsbuchstaben?“).

Quest-Objekte stehen nie hinter einer versteckten Wand (die Höhlen haben keine; die zufälligen `breakable_wall` der Regeln liegen nur auf freien Zellen zwischen zwei erreichbaren Bereichen).

## 3. Mini-Quests und Gerüchte

Jeder Ort trägt 0 bis `MAX_MINIS` (2/3/4/4 nach Weltgröße) Mini-Quests; die Gesamtzahl wird so begrenzt, dass die 258 Rätsel **jedes höchstens einmal** in der Welt vorkommen (Wörter von quest_6, Burgwörter und Mini-Quests). Statue (oder Kristall, ID117) mit einem Rätsel; Schwierigkeit zufällig: Antworten leicht (beliebig viele) oder schwer (3, danach schweigt sie) mal Strafe bei falscher Antwort nichts (×1), Wegteleport (×2), Fallenfeld (×3, der Teleport führt auf eine eigene Falle des Ortes und verletzt einen Helden). Belohnung = **2 × normale Truhe × Schwierigkeit** (höchstens 12×; Items gedeckelt auf 10 je Truhe). Gerüchte: ein Drittel der Runden in der Taverne verrät ein Wort (`wordRumour`): zu 70 % die Antwort eines Rätsels eines Ortes bis eine Stufe über der Taverne, sonst die eines nicht benutzten (lustiges Gerücht).

## 4. Burgen

Genau **drei** (aus Orten gemacht, die der Zufall zu Höhlen/Dungeons machte: `World.planCastles`), auf je einem Ort der Stufe 2, 3 und 4, Gesinnung gut/neutral/böse zufällig auf die drei verteilt. Die Burg ist eine der zwei Beispielkarten des Dokuments (`data/castle-plans.ts`), gedreht und gespiegelt, in einem Hof von 6 Feldern (`interiors/castle.ts`, 28–31 Felder je Seite) mit Außenwand und Ausgang im Süden. Ein Ausgang an der Hofmauer, ein Tor am Bergfried. Inhalt: Banner (Items 103–105, alle 3 Felder an den Wänden des Bergfrieds), Thron (30 oder 6), König (Persona 58/59/60) vor dem Thron, vier Statuen (Item nach Gesinnung) in den Ecken mit 45°-Blick, Antwortstatue und **zwei Truhen mit 5 Mio Gold** im Thronraum (Siegel bis zum Wort, dann Alarm und schwere Wachen zwischen Thronraum und Tor, dann „Schlösser knacken“ = Dieb-Wurf), vier bis sechs Hoftruhen (eine Stufe höher, doppelt so viel Beute), die beim ersten Aufbrechen (mit Warnung) Alarm schlagen und 10–20 leichte Wachen in den Hof rufen. Wachen: Gruppe nach Gesinnung (gut `humanoid`, neutral `magical_construct`, böse `undead`), leicht = Stufe der Burg, schwer = +1, sonst das nächsthöhere Monster, genau zwei verschiedene IDs je Burg. Zauber, die die Gruppe versetzen, sind gesperrt. Statuenart je Burg einheitlich.

## 5. Raumschiff

Die fünf Pyramiden führen in **dieselbe** Karte (`spaceship:0`), die Gruppe erscheint an der Transportröhre der Sektion ihrer Pyramide. 5 Sektionen à 26 Felder nebeneinander, Sektion 0 ist das Kontrolldeck (Halle 11×11 mit der Endröhre in der Mitte). Zwischen den Sektionen je eine Schleuse mit Hebel (ID39) in einer Nische auf jeder Seite; Texte wörtlich aus dem Dokument; jeder Hebel nur einmal. Je Sektion: Roboter (alle vier Roboter der Tabelle), eine Truhe mit **2 Orbs**, Kristalle (ID67: Segen oder Schaden) und Computer (ID68). quest_6 im Raumschiff: die Computer geben Buchstaben-Hinweise, ein Computer im Kontrolldeck will das Wort und schaltet zwei **Kelche** (ID86, 1–2 Mio XP) frei. Die Endröhre beendet das Spiel mit der schwarzen Key Card (`Game.playEnding`).

## 6. ue_quest_1, 2, 3

* **Quatloo-Münzen:** 25, in gewöhnlichen Truhen der Orte der Stufen 1–3 (höchstens 4 je Ort) und je 2 im Hof der L2- und L3-Burg. In **einem** L2-Dungeon steht hinter einer Tür ein Raum mit Seth Squirm (Persona 90) und sieben Statuen (eine Sorte je Weltseed: ID29, 33 oder 34), je Attribut eine; Münze + Heldenwahl (Abbrechen) = 3 Punkte, kein Maximum.
* **Skull Miser:** immer in einer Sackgasse von Starthaven (Persona 82). 15 Silberschädel in gewöhnlichen Truhen der L1-Orte. Alle Schädel werden auf einmal verkauft (1000 Gold für die Gruppe, 1000 XP je Held, je Schädel); der fünfte (insgesamt) bringt einmalig einen zufälligen L2-Ring.
* **Orbs und Könige:** je Orb 1 Mio Gold (Gruppe) und 1 Mio XP je Held, **alle** Orbs im Inventar werden mit Bestätigung abgegeben (Warnung vor der Verteilung auf mehrere Könige). Der erste König mit 11 Orbs gewinnt: schwarze Key Card, die beiden anderen Burgen sind Trümmer. Auch beim Sieger können weitere Orbs abgegeben werden.

## 6a. Gelesen/entschieden, weil das Dokument es offen ließ

* **Levelaufstieg und Attributspunkte** (Endraum-Loot, Antwort des Nutzers): jedes Paket liegt in einem **Kelch** (Objekt 86, `Chalice.obj`, Aktion `chalice` mit `bonus: level|attr|xp`, `handlers.ts` `chaliceGift`). Der Spieler wird gefragt, wer trinkt; **nur dieser Held** bekommt den Bonus (1 Level, 5/10/20 Punkte einer zufälligen Art, die Farbe der Flüssigkeit nennt die Art, oder 1–2 Mio XP). Dasselbe gilt für die Kelche des Kontrolldecks im Raumschiff. Objekt 86 ist dafür auch in Höhlen erlaubt (`ADD_PLACES` in `export_item_rules.py`).
* Welche Gesinnung auf welche Burgstufe kommt: zufällig je Welt.
* Raumschiff-Kontrolldeck ist Sektion 0 (ab Pyramide 1 erreichbar); quest_6 dort als Computerrätsel (siehe 5).
* Eine Welt hat 31 Orbs, aber drei Könige brauchen je 11: der Sieger zerstört die anderen, es reicht also für genau einen.
* `dungeon_3`: Teleportfelder sind aufgebrochene Wandstücke von Schleifen; sie sind überspringbar (Sprung) und das Labyrinth ist auch ohne Sprung ganz.

## 7. Bekannte Lücken und Abweichungen (bitte prüfen)

1. **Raumschiff:** die Schleuse ist ein Gitter als Platzhalter, die Sektionen sind Raum-und-Gang-Karten, nicht die Beispielkarte. **Runde Wände:** `interiors/roundCorners.ts` setzt die Modelle `Round inner corner.obj` (Objekt 84, Boden-Zelle in einer Raumecke oder Gangbiegung) und `Round outer corner.obj` (85, Wandzelle an der Ecke eines Wandblocks), aber nur, wo die Wände auf beiden Seiten gerade weiterlaufen; andere Ecken bleiben eckig. Der Mesher lässt die verdeckten Wandflächen weg (`roundWalls`), die Ansicht stellt die Modelle im Umkreis von 14 Zellen (`interiorView.pushRoundCorners`). Beide Modelle tragen im Bau `tex_cyber_wall` (ihre `.mtl` zeigt auf einen Pfad der Festplatte des Autors, `build-models.ts`). Die Drehung (`cornerYaw`) wurde im Browser ermittelt. Die Kollision bleibt zellweise: in einer Ecke kann man ein Stück in die Rundung hineinlaufen. Das **Outro-Video** (88 MB, vom Nutzer nach `public/assets/ui/outro.mp4` kopiert) steht in `.gitignore` und wird nicht eingecheckt.
2. **Layouts** sind Stilvorlagen, keine Kopien der Beispielkarten; die Kartenfehler aus Abschnitt 4 der Offene-Punkte-Liste betreffen sie nicht. Versteckte Zugänge in `cave_1`/`cave_2` gibt es nur über die zufälligen brüchigen Wände der Regeln.
3. **Wachen der Burg** werden beim Alarm gesetzt und nicht gespeichert (nach Laden stehen sie nicht mehr); das Flag des Alarms bleibt.
4. **Fallenfeld der Mini-Quests:** die Strafe „Fallenfeld“ ist eine einzelne Falle des Ortes (oder Grube/Feuerpfütze), kein Feld aus mehreren.
5. **`docs/DUNGEON_THEMES.md`** und `docs/GENERATOR_REGELN.xlsx` beschreiben den alten Stand und sind überholt; `docs/OBJECTS.md` (generiert) gilt: Portal ID3 auch im Dungeon, Schlüssel ID17–25 auch in Höhlen, Runen ID73 funktional (nicht mehr Deko).
6. **`docs/RPG_0.1.xlsx`** enthielt vor dieser Sitzung eine ungesicherte Änderung (Dragon Worm: Terrain jetzt `water`); sie wurde mit den Boss-Vermerken zusammen übernommen, `monster-sheet.json` und zwei Tests (`monsterSheet`, `playtest13`) folgen ihr.
7. Der Dungeon-Entrance-Dialog nennt nur noch Quest und Layout als Zeile (`blurb`).

## 8. Prüfung

`npm run typecheck`, `npm test` (754), `npm run check:chrome` (Node und Chrome erzeugen identische Welten), Sichtprüfung im Browser: Burg (Gang mit Löwenstatue, Minikarte) und Raumschiff (Gang mit Schleuse, Cyber-Optik). Neue Tests: `tests/unit/quests12-*.test.ts` (Rätsel, Plan, Orte und Layouts, Spielfluss der Quests, Burgen, ue-Quests, Raumschiff, Mini-Quests).
