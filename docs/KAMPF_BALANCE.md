# Kampfformeln, XP und Aufstiege – Befund und Vorschlag

Stand 23.10.2026. **Am Spiel wurden nur die vier Fehler aus Abschnitt 3.5 behoben**; die Formeln des Vorschlags (Abschnitt 4) sind nicht umgesetzt. Alles, was hier steht, kommt aus dem neuen Werkzeug `tools/balance/` (Bedienung: `tools/balance/README.md`)
und seinen Zwischenständen in `tools/balance/out/` (die Tabellen dieses Dokuments liegen als Rohausgabe in `tools/balance/out/report/`).
**„Heute“ heißt in diesem Dokument: das Spiel nach den Korrekturen aus 3.5.** Alle Zahlen sind damit neu gerechnet; die ursprüngliche Rechnung vor den Korrekturen (Zielwert 0,76) liegt unverändert in `tools/balance/out/report-vor-korrektur/`.

## 1. Kurzfassung

**Befund**

1. **Stufe 1 bis 4 sind schwach, weil das Leben zu klein ist und die Rüstung die Schläge der Helden schluckt.** Ein Magier hat auf Stufe 1 **2** Lebenspunkte, ein Bogenschütze 8,
   ein Ritter 16. Gegen Monster der Klasse 2 stirbt auf Stufe 1 im Schnitt **fast ein Held je Kampf** (0,82), auf Stufe 2 noch 0,25. Gleichzeitig trifft der Nahkampf kaum: die
   Rüstung der Monster wird voll abgezogen, ein Nahkampfschlag der Standardgruppe richtet auf Stufe 1 gegen Rüstung 20 zusammen **1** Schaden an.
2. **Danach sind die Klassen 1 und 2 nach wenigen Stufen kein Gegner mehr** (Klasse 1 ab Stufe 2 bei 1 % Verlust, Klasse 2 ab Stufe 4 bei 2 %), Klasse 3 ab Stufe 18 unter 10 %,
   Klasse 4 ab Stufe 30, Klasse 5 erst zwischen Stufe 50 und 60. Das Leben wächst linear mit der Stufe, der Schaden auch, die Monster bleiben, wie sie sind.
3. **Der Fernkampf ist die stärkste Waffe des Spiels.** Eine Bogensalve der Standardgruppe ist schon aus drei Feldern Entfernung so stark wie eine ganze Nahkampfrunde (0,92 bis 1,01),
   aus einem Feld 1,2- bis 2-mal so stark; eine Fernkampfgruppe erreicht auf Stufe 5 das 3,3-fache. Die Gruppen laufen darum fast nur mit dem Bogen: **93 bis 98 %** des
   Schadens der Standardgruppe auf Stufe 1 bis 11 kommen aus dem Bogen, bei der reinen Fernkampfgruppe 96 bis 100 %, selbst die Nahkampfgruppe (Ritter, Barbar, Paladin, Kleriker) macht auf Stufe 1 bis 8
   zwischen 45 und 77 % mit dem Bogen.
4. **Der Aufstieg flacht bei 1'024'000 ab, und die Welt gibt viel mehr her, als die Tabelle verlangt.** Eine Beispielwelt (Standardgröße) enthält ab Tier 4 über 100 Millionen XP; wer
   die Hälfte von Tier 1 bis 4 räumt, steht mit der heutigen Tabelle auf **Stufe 71**, wer Tier 5 mitnimmt, über Stufe 300. Ab Stufe 20 braucht eine Stufe im Mittel 5 Kämpfe, ab Stufe 35 einen.
   Davor ist es umgekehrt: Stufe 1 bis 6 kosten 0 bis 3 Kämpfe, Stufe 10 dagegen bis zu 58.
5. Beim Nachrechnen sind **vier Fehler im Spielcode** aufgefallen (Abschnitt 3.5), die **inzwischen behoben sind**: ein Nahkampfschlag konnte negativ werden und Monster heilen, ein **verfehlter** Fernschuss
   eines Monsters richtete vollen Schaden an, die Attribute der Ausrüstung (Stärke, Genauigkeit, Glück) und ihre Resistenzen wirkten im Kampf gar nicht (Ringschaden auch im Fernkampf nicht), und „Causes Dead“ / „Eradication“ trafen mit derselben Chance wie jeder andere Zustand.
   Der Befund ist dadurch etwas milder als zuerst gerechnet (Zielwert 0,76 → 0,60), die Aussagen 1 bis 4 gelten unverändert. Offen bleibt die Wirkung des Wolfs (alles unter 90 % Leben stirbt): sie macht jeden Kampf zum Spaziergang (3.6).

**Vorschlag (alle Zahlen sind geprüft, Abschnitt 4 und 5)** – „heute“ ist das Spiel nach den Korrekturen aus 3.5 (STÄ, GEN, GLÜ und Resistenzen schließen die Ausrüstung ein):

| Was | heute | Vorschlag |
|---|---|---|
| Leben | `(AUS/2 + Klasse + Rasse) × Stufe` | `(AUS/2 + Klasse + Rasse) × Stufe + 10` |
| Nahkampf | `(STÄ×0,1 + Klasse) × Stufe + Waffe − Rüstung(Gegner)`, nie unter 0 | `(Waffe + (STÄ×0,1 + Klasse) /3 × Stufe − Rüstung(Gegner))* (1-res_physical(Gegner))`, nie unter 0|
| Fernkampf, Trefferchance | `GEN / (Tempo(Gegner) × Entfernung × 0,5)` | `GEN / (Tempo(Gegner) × Entfernung)` |
| Fernkampf, Schaden | `(GEN×0,1 + Klasse) × Stufe + Waffe − 0,5 × Rüstung`, nie unter 0 | `Waffe + (GEN×0,1 + 0,8 × Klasse) × Stufe − 0,5 × Rüstung` |
| Monsterschlag gegen Rüstung (physisch) | `Schaden − Rüstung`, bis 0 | wie heute |
| Verfehlter Schuss eines Monsters | richtet keinen Schaden an (behoben, 3.5) | wie heute |
| Sonderangriff „Causes Dead / Eradication“ | `5 / (GLÜ² × 0,05)` (behoben, 3.5) | wie heute, alle anderen Zustände `10 / (GLÜ² × 0,05)` |
| Wolf | tötet unter 90 % / −20 je Elementartreffer | Wenn Gegner Lebensenergie < 10% fällt > Tod |
| Fee | −20 je Elementartreffer (nie unter 0) | '−30 je Elementartreffer (nie unter 0)' |
| Orb | + 20% Mana | 'Angriffszaubersprüchen +10% Schaden'
| XP für den Aufstieg | `Basis × 2^(Stufe−1)`, ab Stufe 11 flach 1'024'000 | `Basis × 25 × 1,25^(Stufe−1)` bis Stufe 18, danach je Stufe +8 % |
| Trainingskosten | `250 × Stufe` | `10 × Stufe²` (die Formel aus Ihrer Quellenliste) |

Die Zauber, die Monsterwerte (Leben, Schaden, Rüstung, Tempo), die Manaformel und die Todesregel bleiben, wie sie sind. Das Ergebnis im Zielbild des Werkzeugs (kleiner ist besser,
Abschnitt 4.1): **0,60 heute (vor den Korrekturen aus 3.5: 0,76), 0,17 mit dem Vorschlag**; die Todesfälle in Tier 5 halbieren sich, die Todesfälle gegen Klasse 2 gehen auf Stufe 1 von 0,82 auf 0,30 und auf Stufe 2 von 0,25 auf 0,13 zurück.

## 2. Das Werkzeug

`tools/balance/` rechnet Kämpfe, Aufstiege und die Welt durch, ohne das Spiel zu starten (TypeScript, läuft mit `npx tsx tools/balance/<Datei>`; **nicht** in `package.json` eingetragen).

* **Formeln austauschbar** (`formulas.ts`): `CURRENT` ist eine Zeile-für-Zeile-Kopie der Spielformeln. `verify.ts` vergleicht sie mit den echten Funktionen (`recalcValues`, `meleeDamage`, `rangedDamage`,
  `monsterDamage`, `xpToNextLevel`) auf 10'000 zufälligen Helden, Ausrüstungen und Monstern: **identisch** (auch nach den Korrekturen aus 3.5; `CURRENT` ist seitdem der korrigierte Stand). Ein Vorschlag ist `{ ...CURRENT, ...Änderungen }` (`proposals.ts`).
* **Kampfsimulator ohne Karte** (`fight.ts`) mit den Regeln der Spielengine: Gruppe sieht die Monster in 5 Feldern Abstand, darf beim Anlaufen schießen oder zaubern, im Nahkampf handeln alle Helden nach Tempo, dann die Monster;
  höchstens drei Monster gleichzeitig im Nahkampf, Sonderangriffe, Todesregel, Ninja-Ausweichen, Wolf, Fee, Orb. Die Zauber kommen aus der Zaubertabelle (echte Stufen, Mana, Schaden, durchschlagend ja/nein).
  **Gegenprobe** mit der echten Engine (`crosscheck.ts`, derselbe Saal wie `tools/dev/balance.ts`): Siegquoten und Überlebende liegen bei Gruppen von einem und zwei Monstern innerhalb weniger Prozentpunkte
  (z. B. Stufe 1, Tier 2, ein Monster: 69 % echt gegen 75 % Werkzeug), bei drei Monstern ist der Simulator etwas strenger (76 % gegen 67 %), weil dort alle drei gleichzeitig ankommen.
* **Helden und Ausrüstung** (`hero.ts`): alle zehn Klassen, fünf Rassen, die Startwerte der Altspiel-Helden, Ausrüstung aus dem **echten Gegenstandsgenerator** (Material 1 bis 8, Ringe mit Vor- und Nachsilben).
  Gebündelt als Stufen: „typisch“ für ein Tier (Material 2 bis 6, gewürfelte Ringe) und „beste“ (Material 4 bis 8, die besten zwei von 40 Ringen), jeweils auch ohne Ringe, ohne Bogen, mit Zweihänder.
* **Gruppen** (`sweep.ts`): alle **715** Vierergruppen aus den zehn Klassen, dazu acht benannte Aufstellungen (Standard, Nahkampf, Zauberer, Fernkampf, Klassisch, Ausgewogen, Vier Krieger, Vier Bogner), die vier Maskottchen-Fälle
  (keines, Fee, Orb, Wolf), jede Stufe von 1 bis 150.
* **Monster**: „Klasse t“ heißt Monster mit `treasure_level` t, in Gruppen so groß wie der Generator sie im Tier t setzt (Mittel 1,7 / 2,1 / 2,7 / 3,2 / 3,3). Alternativ die Gruppen aus drei erzeugten Welten.
* **Welt** (`supply.ts`): erzeugt alle Orte von drei Beispielwelten (alpha, beta, gamma, Standardgröße) und zählt Monster, XP und Gold je Tier. Das ist die Grundlage der XP-Rechnung.

**Annahmen, die man kennen muss** (alle als Schalter im Werkzeug, Empfindlichkeit in 3.4):

* Das Spiel hat **kein Attributwachstum**; die Rechnung lässt alle Attribute linear auf **40 bei Stufe 50** steigen (Ihr Hinweis „im Schnitt 40 Glück bei Maximalstufe“). Ohne Wachstum sind die oberen Tiers deutlich härter.
* Es wird immer **nach jedem Kampf gerastet** (Leben und Mana voll); Tote zählen als Todesfall, ihr Preis nicht. Mit `--chain=N` rechnet man N Kämpfe ohne Rast.
* Nicht modelliert: Segens-, Schutz- und Zustandszauber, „Hits All“, Manaraub, Altern, Gift/Schwäche-Abzüge. Das macht die Gruppe in der Rechnung eher etwas zu schwach.
* „Tier“ ist die Schwierigkeitsklasse der Monster; die gezeigten Ränder (Bänder) des Zielbilds sind Annahmen (4.1).

## 3. Befund im Einzelnen (heutige Formeln)

„Heute“ ist der Stand des Spiels **nach den Korrekturen aus 3.5**; die Tabellen vor den Korrekturen stehen in `out/report-vor-korrektur/`. Die Korrekturen machen das Spiel insgesamt etwas leichter (3.5, Wirkung), ändern den Befund aber nicht.

### 3.1 Schwierigkeit nach Stufe und Tier

Standardgruppe (Ritter, Ninja, Bogenschütze, Druide), typische Ausrüstung des Tiers, 300 Läufe je Zelle. Je Zelle: Siegquote, **Tote je Kampf**, Verlust an Lebenspunkten (Rohdaten: `out/report/grid-compare.txt`).

| Stufe | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|
| 1 | 86 % · 0,82 · 24 % | 45 % · 2,37 · 64 % | 9 % · 3,64 · 92 % | 3 % · 3,82 · 96 % |
| 3 | 99 % · 0,06 · 5 % | 56 % · 1,69 · 51 % | 20 % · 3,16 · 84 % | 8 % · 3,48 · 90 % |
| 5 | 100 % · 0,00 · 1 % | 70 % · 1,13 · 39 % | 35 % · 2,35 · 72 % | 11 % · 3,15 · 86 % |
| 10 | 100 % · 0,00 · 0 % | 95 % · 0,04 · 17 % | 58 % · 1,08 · 52 % | 23 % · 2,51 · 75 % |
| 15 | 100 % | 100 % · 0,00 · 11 % | 69 % · 0,53 · 44 % | 25 % · 2,16 · 73 % |
| 20 | 100 % | 100 % · 0,00 · 6 % | 86 % · 0,28 · 34 % | 41 % · 1,53 · 63 % |
| 30 | 100 % | 100 % · 0,00 · 1 % | 100 % · 0,01 · 9 % | 68 % · 0,65 · 43 % |
| 40 | 100 % | 100 % · 0,00 · 1 % | 100 % · 0,00 · 5 % | 91 % · 0,21 · 21 % |
| 50 | 100 % | 100 % | 100 % · 0,00 · 3 % | 99 % · 0,08 · 13 % |

Man sieht zwei Dinge: Tier 1 und 2 sind nach ein bis vier Stufen kein Hindernis mehr, **zwischen Tier 2 und Tier 3 liegt eine Wand** (auf Stufe 4 ist Tier 2 trivial, Tier 3 kostet noch immer 39 % der Lebenspunkte
und 1,2 Tote je Kampf), und die oberen Tiers werden erst sehr spät bequem. Die Gesamtschwierigkeit hängt stark an der **Ausrüstung**: mit der besten Ausrüstung des Tiers sinkt der Verlust auf ein Fünftel bis ein Viertel (Abschnitt 3.4).

### 3.2 Warum Stufe 1 bis 4 so schwach sind

* **Leben:** Stufe 1: Ritter 16, Ninja 11, Bogenschütze 8, Druide 8, Magier 2. Ein einzelner Treffer von 10 bis 30 Punkten (Tier 1: Ogre 2–32; Tier 2: Castle Guard 2–80, Carnage Hand 60–120) tötet.
  Zusätzlich gilt die Todesregel: ein Treffer über der Hälfte des Maximums macht aus „bewusstlos“ „tot“ – bei 8 Lebenspunkten also schon 5 Schaden.
* **Der Nahkampf trifft nicht:** `Schlag = (STÄ/10 + Klasse) × Stufe + Waffe − Rüstung der Monster`. Auf Stufe 1 ist der Stufenanteil 2 bis 5, die Waffe 4 bis 13, die Rüstung der Monster bei Ninja 15,
  Giant Spider 14, Carnage Hand 25. Gegen Rüstung 20 richten die vier Helden der Standardgruppe zusammen **1** Punkt an (Stufe 5: 43, Stufe 10: 105). Darum wird auf den ersten Stufen geschossen, nicht geschlagen.
* **Rüstung hebt Monsterschläge ganz auf:** `Schaden − Rüstung`, bis 0. Tier-1-Monster schlagen mit 2 bis 12; schon Rüstung 15 (Lederrüstung, Helm, Stiefel aus Kupfer) macht die meisten harmlos. Gefährlich sind darum nur Elementar- und Magieschläge,
  Gift und die Ausnahmen mit großem Schlag – das erklärt, warum die Gruppe entweder nichts spürt oder plötzlich tot ist.
* **Folge:** Nach Gruppen getrennt (Rohdaten `archetypes-current.txt`): auf Stufe 1 gegen Tier-1-Gruppen verlieren die Zaubergruppe 0,24, die klassische 0,30 und die ausgewogene Gruppe **0,51** Helden je Kampf, die Standardgruppe 0,03.

### 3.3 Der Fernkampf

Schaden einer ganzen Partyaktion gegen ein Monster mit Rüstung 20 und Tempo 30, Mittel über 24 Ausrüstungswürfe (`out/report/ranged.txt`):

| Stufe | Standard: Salve aus 1 Feld / Nahkampfrunde | aus 3 Feldern | Fernkampfgruppe: aus 1 Feld | aus 3 Feldern |
|---|---|---|---|---|
| 5 | 1,99 | 0,98 | 3,28 | 1,66 |
| 10 | 1,73 | 0,92 | 2,28 | 1,26 |
| 20 | 1,40 | 0,93 | 1,58 | 1,04 |
| 30 | 1,32 | 1,00 | 1,47 | 1,10 |
| 40 | 1,21 | 1,01 | 1,25 | 1,04 |

Ihre Beobachtung „ein Fernangriff ist etwa eine Nahkampfrunde aller vier“ stimmt für drei Felder genau. Der Fehler sitzt aber an mehreren Stellen zugleich:

1. **Der Klassenwert des Fernkampfs ist höher als der des Nahkampfs** (Archer 5 gegen 0, Ninja 3 gegen 2, Ranger 2 gegen 1).
2. **Die Rüstung zählt nur halb** (`− 0,5 × Rüstung`), im Nahkampf voll. Gegen Rüstung 20 ist das ein Unterschied von 10 Punkten je Schuss.
3. **Eine Salve ist ein Zug für alle**, im Nahkampf braucht man vier. Und beim Anlaufen der Monster gibt es mehrere freie Salven (Abstand 5: vier Stück), ohne dass jemand zurückschlägt.
4. **Die Trefferchance hat den Faktor 0,5** (`GEN / (Tempo × Entfernung × 0,5)`), also doppelt so hoch wie die Formel „GEN / (Tempo × Entfernung)“ aussagt, und sie ist auf 1 gedeckelt: aus nächster Nähe trifft praktisch jeder Schuss.
5. **Die Waffe des Ritters ist ein Bogen:** fast jede Klasse darf einen tragen, die Bogenwaffe liegt auf einem eigenen Platz neben Schwert und Schild.

Anteil des Schadens aus dem Bogen (Rohdaten `archetypes-*.txt`; Stufen 1 · 3 · 5 · 8 · 11 · 15 · 19 · 25 · 33):

| Gruppe | heute | Vorschlag |
|---|---|---|
| Standard | 96 · 97 · 95 · 98 · 93 · 79 · 61 · 40 · 20 % | 60 · 82 · 58 · 73 · 54 · 32 · 25 · 14 · 1 % |
| Nahkampf (Ritter, Barbar, Paladin, Kleriker) | 61 · 77 · 45 · 67 · 44 · 38 · 27 · 32 · 11 % | 28 · 42 · 23 · 36 · 18 · 10 · 12 · 11 · 2 % |
| Fernkampf (Bogenschütze, Waldläufer, Ninja, Dieb) | 96 · 100 · 100 · 100 · 100 · 88 · 77 · 44 · 28 % | 62 · 89 · 64 · 86 · 63 · 35 · 35 · 11 · 2 % |

### 3.4 Wovon das Ergebnis abhängt (Empfindlichkeit)

Standardgruppe, Verlust an Lebenspunkten · Tote je Kampf in sechs Zellen (Stufe/Tier): `out/report/sens-current.txt`, `sens-v3x.txt`. Auszug heutige Formeln:

| Annahme | L3/T2 | L8/T3 | L12/T3 | L20/T4 | L28/T4 | L38/T5 |
|---|---|---|---|---|---|---|
| Grundannahme | 4 % · 0,04 | 30 % · 0,47 | 12 % · 0,00 | 31 % · 0,17 | 8 % · 0,00 | 29 % · 0,28 |
| Attribute wachsen nicht | 7 % · 0,05 | 24 % · 0,42 | 19 % · 0,11 | 39 % · 0,35 | 18 % · 0,05 | 41 % · **1,02** |
| Attribute bis 60 (statt 40) | 5 % · 0,00 | 24 % · 0,19 | 8 % · 0,00 | 26 % · 0,22 | 9 % · 0,00 | 19 % · 0,13 |
| **beste Ausrüstung des Tiers** | 0 % | 7 % | 3 % | 6 % | 2 % | 4 % |
| Ausrüstung eine Stufe schlechter | 7 % · 0,03 | 33 % · 0,49 | 14 % | 40 % · 0,20 | 12 % | 28 % · 0,26 |
| kein Bogen im Nahkampf | 3 % | 28 % | 16 % | 34 % | 9 % | 30 % |
| keine Salve beim Anlaufen | 19 % · 0,26 | 38 % · 0,63 | 19 % | 43 % · 0,30 | 14 % | 30 % · 0,28 |

Zwei Folgerungen: (1) **Die Ausrüstung ist der stärkste Hebel** (Faktor 4 bis 5 zwischen „typisch“ und „beste“), weil Rüstung und Waffenbonus flach gelten (Material bis +20 Rüstung und +50 Schaden je Teil); seit den Korrekturen aus 3.5 zählen
auch die Attribute und Resistenzen der Ausrüstung im Kampf. Das ist keine
Formel, sondern die Itemtabelle; sie bleibt hier unberührt. (2) Ohne Attributwachstum verdoppelt bis vervierfacht sich der Tod in Tier 4 und 5; **das Wachstum der Attribute (Schreine, Tränke, Ringe) ist darum Teil der Balance** und sollte bewusst so geplant sein.

### 3.5 Fehler im Spielcode (behoben)

Alle vier habe ich im Code nachgesehen und am 23.10.2026 **behoben** (`src/sim/combat.ts`, `src/sim/character.ts` und, für die Elementarformel der Kampagne, `src/campaign/engine.ts`). Die Tests stehen in
`tests/unit/combatFixes.test.ts`; `tools/balance/verify.ts` meldet nach den Korrekturen weiter „OK“. Jeder Punkt: erst der Befund, dann was geändert wurde.

1. **Negativer Nahkampfschaden heilte Monster.** `meleeDamage` begrenzte nur dann auf 0, wenn das Monster Rüstung hatte (`if (monster.armor > 0) total = Math.max(0, …)`). Bei Rüstung 0 (Goblin, Bubble Man, Wild Fungus …) blieb ein negativer Wert
   stehen und `target.hp -= damage` **heilte** das Monster. Betroffen war vor allem der Magier (Stärke 7, Klassenwert −2, ab Stufe ≈ 3), später auch der Druide. Gleiches galt für `rangedDamage`.
   **Behoben:** beide Funktionen enden in `Math.max(0, …)`, mit und ohne Rüstung des Monsters.
2. **Ein verfehlter Fernschuss eines Monsters richtete vollen Schaden an.** In `monsterDamage` wurde bei Elementarschaden mit `* hit` multipliziert (Fehlschuss = 0), bei `physical` nicht:
   `total = Math.max(0, total - arm * hit)` ließ bei `hit = 0` den Schaden **ungekürzt** stehen (nicht einmal die Rüstung zog ab). Ein Fehlschuss von Goblin, Orc Warrior, Ogre, Evil Ranger, Archer … war also schlimmer als ein Treffer. Die Trefferchance der Monster hatte bei physischen Fernangriffen keine Wirkung.
   **Behoben:** `monsterDamage` gibt bei einem Fehlschuss sofort 0 zurück (alle Schadensarten); die Zweige für Element, Rüstung und Gift rechnen nur noch den Treffer.
3. **Die Attributboni der Ausrüstung wirkten im Kampf nicht.** Nahkampf las `c.str`, Fernkampf `c.acc`, Sonderangriffe `c.lck`, Elementarschutz `target.resFire` usw. – jeweils das Grundattribut, nie `attr(c, …)` mit Gegenständen. Ringe und Zusätze mit +Stärke,
   +Genauigkeit, +Glück oder +Feuerresistenz änderten das Kampfergebnis nicht (nur Ausdauer für das Leben, Intelligenz/Persönlichkeit für das Mana, Rüstung und Waffenschaden). Ihre Formel „Melee = … Stärke …“ meint vermutlich die Summe.
   Ebenso addierten **Ringe mit +Schaden nur den Nahkampf** (`dam_min/max`), den Fernkampf nicht, obwohl Ihre Formel „incl. Modificators from rings“ beide nennt.
   **Behoben:** Nahkampfschaden liest `attr(c, "str")`, Fernkampf (Trefferchance und Schaden) `attr(c, "acc")`, die Sonderangriffs-Chance `attr(c, "lck")`; die Resistenz gegen Feuer, Eis, Säure und Magie ist der neue Helfer `resistance(c, element)`
   (Grundwert plus Ausrüstung) in `elementalDamage` (Monster, Fallen) und in der Kampagnen-Engine. Ringe mit Schaden zählen jetzt auch im Fernkampf (`ringDamage`; nur Ringe, nicht die Nahkampfwaffe). Bedingungen wie „Schwach“ oder „Vergiftet“ ändern die Werte weiterhin nicht,
   wie im Altspiel (`attr(c, …)` mit dem Grundattribut).
4. **Die Sonderangriffs-Chance war bei Glück ≤ 14 gleich 100 %** (`10 / (GLÜ² × 0,05)` = 200 / GLÜ²; Glück 20: 50 %, 30: 22 %, 40: 12,5 %). Besonders hart bei „Causes Dead“ (Minotaur, Minotaur King, Lich) und „Eradication“ (Terminator):
   ein Held mit Glück 20 starb bei jedem zweiten Treffer des Minotauren.
   **Behoben nach dem Vorschlag dieses Dokuments:** „Causes Dead“ und „Causes Eradication“ treffen mit der halben Chance `5 / (GLÜ² × 0,05)` (Glück 20: 25 %, 30: 11 %, 40: 6 %; bei Glück ≤ 10 weiter 100 %).
   Alle anderen Zustände bleiben bei `10 / (GLÜ² × 0,05)`, also bei Glück ≤ 14 weiter sicher; das ist eine Entwurfsfrage und hier bewusst nicht angefasst.

Dazu Kleinigkeiten, die in den Zahlen stecken: Die Manaformel im Code ist nicht „Basismana × Stufe“, sondern je Klasse `Stufe × (10 oder 25 − 90…500 / INT oder PER + Basis)` (die Rasse gibt nur −2 bis +2); die Todesregel ist
„Treffer > Hälfte des Maximums oder Leben unter −⅓“; `Hits All`, `Drains Spell Points`, `Breaks Armor` und Regeneration der Monster sind im Kampf nicht umgesetzt.

**Wirkung der Korrekturen** (gleiche Würfe, Vorher-Zahlen aus `out/report-vor-korrektur/`):

| | vor der Korrektur | nach der Korrektur |
|---|---|---|
| Zielwert gegen Zielbild (4.1), heutige Formeln | 0,76 (Verlust 0,24, Tote 0,47, Bogen 0,046) | **0,60** (Verlust 0,32, Tote 0,23, Bogen 0,057) |
| Zielwert, Vorschlag v3x | 0,172 | 0,170 (Verlust 0,12, Tote 0,03, Bogen 0,021) |
| Standardgruppe, Stufe 1 gegen Tier 2 | 79 % · 1,08 Tote · 31 % Verlust | 86 % · 0,82 Tote · 24 % Verlust |
| Standardgruppe, Stufe 20 gegen Tier 4 | 80 % · 0,32 · 35 % | 86 % · 0,28 · 34 % |
| Standardgruppe, Stufe 30 gegen Tier 5 | 66 % · 0,79 · 42 % | 68 % · 0,65 · 43 % |
| Terminator (Stufe 36, zwei Stück) | 32 % Sieg · 3,17 Tote | 62 % · 2,28 |
| Minotaur King | 31 % · 2,67 | 72 % · 1,14 |
| Minotaur | 100 % · 0,31 | 100 % · 0,06 |

Das Spiel wird mit den Korrekturen **etwas leichter**, am stärksten bei den lethalen Sonderangriffen in Tier 5 und auf Stufe 1 bis 3. Die Aussagen des Befunds (zu wenig Leben auf Stufe 1 bis 4, Nahkampf gegen Rüstung chancenlos,
Bogen als stärkste Waffe, flache XP-Tabelle) bleiben bestehen; der Bogenanteil des Vorschlags steigt von 0,009 auf 0,021, weil Genauigkeit und Ringschaden der Ausrüstung jetzt auch den Bogen stärken.

### 3.6 Maskottchen

Verlust an Lebenspunkten mit gegen ohne Maskottchen (Mittel über sechs Zellen der Eintrittsstufen von Tier 3 bis 5 und vier Gruppen, 200 Läufe; `out/report` bzw. `mascots.ts`):

| | heute | Vorschlag (andere Formeln) |
|---|---|---|
| ohne | 27,5 % · 0,24 Tote | 29,7 % · 0,18 Tote |
| **Wolf, Schwelle 90 % (heute)** | **−77 %** · −93 % Tote | **−77 %** |
| Wolf 60 % / 40 % / **33 %** / 30 % | −45 / −26 / ≈ −19 / −16 % | −44 / −28 / **≈ −22 %** / −20 % |
| Fee −20 (heute) / −30 / −40 | −15 % / ≈ −24 / −33 % | −14 % / **≈ −20 %** / −27 % |
| Orb +20 % Mana / +100 % | +2 % / −2 % | 0 % / −1 % |

(≈ = zwischen zwei gemessenen Werten geschätzt)

* Der **Wolf** mit 90 % ist keine Fähigkeit, sondern ein Schalter „Kampf gewonnen“: jeder Schlag, der mehr als 10 % des Lebens nimmt, tötet. Mit **33 %** wird er zum Finisher und liegt auf einer Stufe mit Fee und gutem Ring.
* Die **Fee** mit −20 hilft nur gegen Elementar- und Magieschläge; −30 bringt sie auf dasselbe Niveau wie den Wolf.
* Der **Orb** hat praktisch keine Wirkung (innerhalb der Messstreuung): Mana ist in einem Kampf selten knapp (die Zauber sind billig im Verhältnis zum Vorrat), auch bei fünf Kämpfen ohne Rast bleibt er unter 5 %. Mit reiner Mana-Erhöhung ist er nicht zu retten; eine zweite Wirkung wäre nötig
  (z. B. Manaregeneration je Schritt oder +10 % Zauberschaden). Das ist eine Entwurfsfrage, keine Formel; ich habe es nicht angefasst.

### 3.7 Levelaufstieg und XP

**Die Tabelle heute** (`xpToNextLevel`): Schritt von Stufe L auf L+1 = `Basis × 2^(L−1)` bis Stufe 10 (Ritter 1'500 → 768'000), ab Stufe 11 **immer 1'024'000**, unabhängig von der Klasse.

**Was die Welt hergibt** (Mittel über drei Beispielwelten der Standardgröße, ganze Welt, alle Orte, jede Gruppe einmal):

| Tier | Monster | Gruppen | XP | kumuliert | Gold | XP je Gruppe |
|---|---|---|---|---|---|---|
| 1 | 434 | 259 | 1,6 Mio. | 1,6 Mio. | 67 k | 6 k |
| 2 | 241 | 115 | 2,0 Mio. | 3,6 Mio. | 132 k | 18 k |
| 3 | 667 | 246 | 17,4 Mio. | 21 Mio. | 838 k | 71 k |
| 4 | 1'621 | 509 | 106 Mio. | 127 Mio. | 4,3 Mio. | 207 k |
| 5 | 1'462 | 439 | 504 Mio. | 630 Mio. | 12,5 Mio. | 1,15 Mio. |

Wer in jedem Tier die Hälfte räumt, erreicht mit der heutigen Tabelle (Mittel der Helden der Standardgruppe): nach Tier 1 **Stufe 9,8**, Tier 2 **10,8**, Tier 3 **19**, Tier 4 **71**, Tier 5 **300+**. Die flache Tabelle kann die oberen Tiers also nicht abbilden.
Kämpfe je Stufe (Mittel; kleinster bis größter Wert im Band; Bänder wie in 4.1):

| | Tier 1 (L1–4) | Tier 2 (L5–11) | Tier 3 (L12–19) | Tier 4 (L20–33) | Tier 5 (L34–50) |
|---|---|---|---|---|---|
| heute | 1 (0–2) | 22 (1–58) | 14 | 5 | 1 |
| nur „+10 % ab Stufe 10“ | 1 (0–2) | 21 (1–52) | 20 (14–28) | 21 (10–36) | 17 (7–33) |
| **Vorschlag, glatt** | **9 (6–13)** | **12 (6–22)** | **16 (7–28)** | **18 (10–28)** | **11 (5–18)** |

Ihr Vorschlag **+10 % ab Stufe 10 ist richtig** für den hinteren Teil: er passt zum Inhalt der Welt (nach dem Räumen der halben Welt Stufe 48 statt 300) und hält die Kämpfe je Stufe zwischen 10 und 36.
Offen bleibt der Anfang: dort ist die Verdopplung zu steil. Stufe 1 bis 6 kosten ein bis drei Kämpfe, dann steigt der Preis bis Stufe 10 auf 47 Kämpfe in einem Tier, das nur 18'000 XP je Gruppe gibt.
Die Verdopplung ist für den Vorrat der Tiers 1 und 2 (3,6 Mio. XP) zu steil: Stufe 6 braucht kumuliert nur 46'500 XP, Stufe 10 aber 766'000 und Stufe 11 schon 1,53 Mio.

**Trainingskosten.** Das Spiel verlangt `250 × Stufe` je Held (das Handover nennt als Altwert `Stufe² × 10`, wie in Ihrer Liste). Mit 250 × Stufe ist die Gruppe in der Rechnung auf Stufe 3 bis 8 **goldgebunden**
(Tier-2-Gruppen geben nur etwa 1'150 Gold, vier Helden kosten auf Stufe 5 zusammen 5'000), und auf den hohen Stufen ist das Gold wertlos (Stufe 40: 10'000 Gold je Held gegen 28'000 Gold aus einer Tier-5-Gruppe). `10 × Stufe²` kostet auf Stufe 5 nur 250, auf Stufe 20 4'000, auf Stufe 40 16'000 je Held
und bleibt in jedem Tier unter einem Drittel des Goldes eines Stufenanstiegs.

## 4. Der Vorschlag

### 4.1 Zielbild und Vorgehen

Ich habe die Formeln nicht geraten, sondern gegen ein Zielbild gesucht (`search.ts`, Zielgrößen in `DEFAULT_TARGETS`). Das Zielbild ist meine Annahme und gehört Ihnen zum Ändern:

* **Bänder**: Tier 1 ab Stufe 1, Tier 2 ab 5, Tier 3 ab 11, Tier 4 ab 19, Tier 5 ab 33. Das sind die Stufen, auf denen die Gruppe bei der glatten XP-Tabelle ankommt, wenn sie die Hälfte der darunterliegenden Tiers geräumt hat; zugleich liegen sie nahe an den Stufen, ab denen die Monster
  mit den heutigen Formeln beherrschbar sind (Tier 3 ab 8–10, Tier 4 ab 22, Tier 5 ab 35–40). Das Spiel selbst kennt ähnliche Grenzen (`serviceLevel`: Händlerstufe 2 ab Stufe 8, 3 ab 18, 4 ab 28, 5 ab 38; Zauberstufen der Gilden 2–5 / 6–10 / 11–15 / 16–20 / 21+).
* **Ziel je Tier ab 3**: beim Betreten des Bandes kostet ein Kampf etwa **40 %** der Lebenspunkte der Gruppe, am Ende des Bandes etwa **12 %**, geometrisch dazwischen. Tier 1 und 2 sind Aufwärm-Tiers (20 % → 3 % bzw. 10 % → 4 %), weil ihre Monster so schwach sind, dass jede Gruppe sie nach wenigen Stufen
  übertrifft; dort wird nur verlangt, dass **auf Stufe 1 bis 4 höchstens 0,1 Helden je Kampf sterben**.
* In den Bändern: Siegquote mindestens 90 %, Todesfälle höchstens 0,2 je Kampf (Tier 5: 0,25).
* Fernkampf: ohne Bogen darf der Verlust um das 1,15- bis 1,6-fache höher sein („stark, aber nicht übermächtig“).
* Robustheit: mit der besten Ausrüstung darf ein Tier nicht trivial werden (mindestens ein Drittel des Verlusts), mit schlechterer Ausrüstung oder ohne Attributwachstum nicht über das Dreifache steigen.
* Bewertet wird an fünf Gruppen (Standard, Nahkampf, Fernkampf, Klassisch mit halber Gewichtung, Zauberer mit halber Gewichtung).

Dann habe ich einige tausend Parameterkombinationen einer Formelfamilie um die Spielformeln durchprobiert, vereinfacht (gerundet, Terme entfernt, die nichts bringen) und die Reste geprüft. Die Familie hat unter anderem: Leben mit Grundwert und Faktor, Nahkampf- und Fernkampfstufenanteil mit Faktor,
Rüstungsfaktor, Mindestdurchschlag, Fernkampf-Trefferchance, Todesregel, Obergrenze und Faktor der Sonderangriffe. Die Ergebnisse waren auffallend stabil: unterschiedliche Läufe fanden dieselben fünf, sechs Hebel.

Was jede Änderung bringt (Zielwert, kleiner ist besser; Vorschlag = 0,17; `out/report/ablation-v3.txt`, 300 Läufe; gerechnet auf dem Spiel nach den Korrekturen aus 3.5):

| Ohne … | Zielwert | Was dann kaputt geht |
|---|---|---|
| Grundleben (+25, ×1,1) | **0,90** | Tote Helden auf Stufe 1 bis 4 und in den Eintrittsstufen (Todesanteil 0,76) |
| Mindestdurchschlag der Monster (50 %) | 0,38 | Rüstung hebt Schläge auf: die Verlustkurve passt nicht mehr zum Zielbild (Abweichung 0,35 statt 0,12) |
| Trefferchance ohne 0,5 | 0,26 | Der Bogen bleibt zu stark (Bogenanteil 0,047 gegen 0,021) |
| Lethal-Sonderangriffe nicht halbiert (Stand vor 3.5) | 0,24 | Tote in Tier 5 (Todesanteil 0,10); die Halbierung ist seit 3.5 im Spiel und kein Teil des Vorschlags mehr |
| Nahkampf-Anhebung und Rüstungsfaktor 0,4 | 0,22 | Nahkampf kommt gegen Rüstung nicht an, die Gruppe bleibt beim Bogen |
| Nahkampffaktor 1,5 allein zurück auf 1 | 0,19 | schwächere Mitte, mehr Tote (0,05) |

Die Fehlschuss-Korrektur stand früher als siebte Zeile hier (sie verbesserte den Zielwert nicht, weil Monster mit Fernangriff schwächer werden); sie ist ein Fehler im Spiel und seit 3.5 behoben.

### 4.2 Die Formeln (Vorschlag)

Alle Größen wie im Spiel; Rundung wie im Spiel. `AUS`, `STÄ`, `GEN`, `GLÜ`: die Grundattribute **plus** Ausrüstung (so rechnet das Spiel seit den Korrekturen aus 3.5, Punkt 3; vorher galt das nur für AUS beim Leben und INT/PER beim Mana).

```
Leben          = runden( 1,1 × (AUS/2 + Klassenwert + Rassenwert) × Stufe + 25 )

Nahkampf       = aufrunden( Waffe + 1,5 × (STÄ×0,1 + Klassenwert Nahkampf) × Stufe ) − abrunden( 0,4 × Rüstung des Monsters )     [nie unter 0]
Fernkampf      = aufrunden( Waffe + (GEN×0,1 + 0,8 × Klassenwert Fernkampf) × Stufe ) − abrunden( 0,5 × Rüstung des Monsters )   [nie unter 0]
Fern, Treffer  = GEN / ( Tempo des Monsters × Entfernung )                                              [höchstens 1]

Monster, Nahkampf (physisch)  = max( abrunden(0,5 × Schaden), Schaden − Rüstung des Helden )
Monster, Fernkampf (physisch) = Treffer ? max( abrunden(0,5 × Schaden), Schaden − (Rüstung + abrunden(Rüstung/2)) ) : 0
Monster, Elementar/Magie/Gift = wie heute (Gift ohne Abzug), Fehlschuss = 0                             (Fehlschuss = 0 seit 3.5 im Spiel)
Sonderangriff                 = 10 / (GLÜ² × 0,05)         für alle Zustände,
                                  5 / (GLÜ² × 0,05)         für „Causes Dead“ und „Causes Eradication“   (seit 3.5 im Spiel)
Wolf: tötet unter 1/3 des Lebens    Fee: −30 je Elementartreffer    Orb: unverändert (siehe 3.6)

Aufstieg (Held, Klassenbasis 1000 bis 2000)  Schritt(L) = Basis × 25 × 1,25^(L−1)      bis L = 18
                                              Schritt(L) = Schritt(18) × 1,08^(L−18)     ab L = 19
Training       = 10 × Stufe²                                                           je Held
```

Unverändert: Mana (alle Klassen), Rassen und Klassenwerte, die Zauber, Todesregel (`Treffer > ½ Maximum` oder `Leben < −⅓`), alle Monsterwerte, Gegenstandstabelle.

Beispiele (Standardgruppe, heute → Vorschlag):

| | Stufe 1 | Stufe 10 | Stufe 30 | Stufe 50 |
|---|---|---|---|---|
| Leben Ritter | 16 → 43 | 185 → 229 | 841 → 950 | 1'519 → 1'696 |
| Leben Magier | 2 → 28 | 49 → 79 | 381 → 444 | 1'066 → 1'197 |
| Nahkampf Ritter (gegen Rüstung 15) | 6 → 17 | 55 → 92 | 203 → 312 | 398 → 602 |
| Fernkampf Bogenschütze, 1 Feld | 9 → 6 | 80 → 61 | 256 → 226 | 466 → 416 |
| Fernkampf Bogenschütze, 4 Felder | 3 → 1 | 35 → 16 | 143 → 63 | 324 → 145 |

(Tabelle: `out/report/power-current.txt` / `power-v3x.txt`, Gegner Rüstung 15, Tempo 30, gemittelt über Ausrüstungswürfe.) Ein Held wird dadurch auf der ersten Stufe fast verdreifacht, der Nahkampf ist gegen Rüstung etwa anderthalb- bis dreimal so stark,
der Bogen auf großer Entfernung ein Drittel bis knapp halb so stark. Die Zauber bleiben die stärksten Aktionen ab Stufe 20 (Disintegrate 250, Implosion 1'000 …).

### 4.3 Wirkung

**Schwierigkeit** (Standardgruppe, 300 Läufe; Siegquote · Tote · Verlust; vollständig in `grid-compare.txt`):

| Zelle | heute | Vorschlag |
|---|---|---|
| Stufe 1 gegen Tier 2 | 86 % · 0,82 · 24 % | 75 % · 0,30 · 50 % |
| Stufe 3 gegen Tier 2 | 99 % · 0,06 · 5 % | 99 % · 0,02 · 22 % |
| Stufe 5 gegen Tier 3 | 70 % · 1,13 · 39 % | 57 % · 0,66 · 56 % |
| Stufe 10 gegen Tier 3 | 95 % · 0,04 · 17 % | 92 % · 0,00 · 28 % |
| Stufe 15 gegen Tier 4 | 69 % · 0,53 · 44 % | 62 % · 0,30 · 49 % |
| Stufe 20 gegen Tier 4 | 86 % · 0,28 · 34 % | 83 % · 0,14 · 31 % |
| Stufe 30 gegen Tier 5 | 68 % · 0,65 · 43 % | 79 % · 0,35 · 35 % |
| Stufe 40 gegen Tier 5 | 91 % · 0,21 · 21 % | 96 % · 0,09 · 17 % |

Die mittlere Schwierigkeit ändert sich also bewusst wenig: **die Tiers bleiben so hart wie heute, aber Stufe 1 bis 4 sterben nicht mehr**, und in Tier 5 sterben nur noch halb so viele. Die frühen Tiers werden ein wenig anspruchsvoller (Verlust statt 1–5 % jetzt 9 %–22 %), weil die Rüstung nicht mehr alles aufhebt.
Zielwert gegen Zielbild: **0,60 → 0,17** (Verlust 0,32 → 0,12, Tote 0,23 → 0,03, Bogen 0,057 → 0,021). Vor den Korrekturen aus 3.5 war der Abstand größer: 0,76 → 0,17 (Verlust 0,24 → 0,12, Tote 0,47 → 0,04, Bogen 0,046 → 0,009).

**Gruppenvielfalt** (alle 715 Vierergruppen, 25 Läufe, Eintrittsstufen; `sweep-*.txt`): Verlust im Mittel Stufe 11/Tier 3: 22 % → 29 %, Stufe 19/Tier 4: 40 % → 43 %, Stufe 33/Tier 5: 41 % → 38 %, Stufe 45: 22 % → 21 %. Die Streuung zwischen den besten und schlechtesten
Gruppen ist ähnlich (10-%- bis 90-%-Quantil auf Stufe 33: 27–54 % → 25–51 %). Einfluss einer Klasse in der Gruppe (Faktor gegenüber dem Mittel, unter 1 = leichter): Bogenschütze 0,86–0,99, Ninja 0,89–1,00, Ritter 0,92–0,97, Barbar 0,89–1,00; Kleriker 1,05–1,14, Druide 1,03–1,11,
Magier 1,11 bis 1,12 auf Stufe 3 bis 11 und 0,85 bis 0,86 ab Stufe 33. Kein Klassenfaktor liegt außerhalb ±15 %. Der Kleriker bleibt meist der schwächste Gruppenpartner (wenig eigener Schaden, Heilzauber fest).
Mit dem Vorschlag **sterben auf Stufe 1 und 3 in keiner der acht Aufstellungen Helden** (0,00 je Kampf; auf Stufe 5 höchstens 0,03), heute bis 0,51 (Stufe 1).

**Todesfälle in Tier 5.** Die Treiber sind wenige Monster (Stufe 36, zwei gleiche Monster, Standardgruppe; `out/report/monsters-*-L36T5.txt`):

| Monster (Klasse 5) | heute Sieg · Tote | Vorschlag |
|---|---|---|
| Terminator (232–928 × 1, „Eradication“) | 62 % · 2,28 | 99 % · 0,69 |
| Minotaur King (3–300 × 3, „Dead“) | 72 % · 1,14 | 81 % · 1,25 |
| Minotaur (3–300 × 2, „Dead“) | 100 % · 0,06 | 100 % · 0,13 |
| Great Hydra (5'000 Leben, 12 Angriffe) | 6 % · Gruppe tot | 0 % · Gruppe tot |

(„heute“ schließt die halbierte Chance von „Dead“ und „Eradication“ aus 3.5 ein; vor der Korrektur waren es Terminator 32 % · 3,17, Minotaur King 31 % · 2,67, Minotaur 100 % · 0,31.) Beim Minotaur King und beim Minotaur bringt der Vorschlag darum keine weiteren Toten weniger mehr; sein Gewinn liegt hier beim Terminator.
Alle anderen Monster der Klasse 5 sind für diese Gruppe auf Stufe 36 kein Todesrisiko (höchstens 0,03 Tote je Kampf; nennenswerten Verlust machen nur die Drachen mit 30 bis 50 %). **Die Great Hydra ist mit 5'000 Leben, Rüstung 60 und zwölf Angriffen für kein Level der Rechnung bis 50 mit zwei Stück zu besiegen** und gehört wohl in eine eigene Kategorie
(Endboss); ich habe sie nicht verändert.

**Fernkampf** (Salve aus einem / drei Feldern im Verhältnis zur Nahkampfrunde; `out/report/ranged.txt`):

| Stufe | Standard heute | Standard Vorschlag | Fernkampf heute | Fernkampf Vorschlag |
|---|---|---|---|---|
| 5 | 1,99 / 0,98 | 0,49 / 0,16 | 3,28 / 1,66 | 0,65 / 0,22 |
| 10 | 1,73 / 0,92 | 0,61 / 0,20 | 2,28 / 1,26 | 0,78 / 0,26 |
| 20 | 1,40 / 0,93 | 0,71 / 0,25 | 1,58 / 1,04 | 0,79 / 0,28 |
| 30 | 1,32 / 1,00 | 0,75 / 0,29 | 1,47 / 1,10 | 0,82 / 0,32 |

Eine Salve aus einem Feld ist jetzt etwa 0,5 bis 0,8 Nahkampfrunden wert, aus drei Feldern 0,2 bis 0,3: Bogenschützen bleiben die Spezialisten für den Anlauf (die freien Salven sind weiterhin wertvoll), aber der Nahkampf lohnt sich wieder.

**Empfindlichkeit des Vorschlags** (`sens-v3x.txt`): Mit der besten Ausrüstung sinkt der Verlust auf 3 bis 11 % (heute 0 bis 7 %), ohne Attributwachstum steigt er in Tier 5 auf 35 % und 0,76 Tote (heute 41 % / 1,02), im Gang (ein Angreifer) liegt er in Tier 4/5 bei 16–33 %.
Der Vorschlag hält also bei jeder dieser Annahmen mindestens das Niveau von heute.

### 4.4 XP, Aufstieg und Training im Detail

**Schritte pro Stufe für einen Ritter (Basis 1'500)**, dazu die Summe bis zur jeweiligen Stufe:

| Stufe | heute (Schritt) | Nutzervorschlag +10 % ab 10 | Vorschlag glatt | kumuliert (glatt) |
|---|---|---|---|---|
| 1 | 1'500 | 1'500 | 37'500 | 0 |
| 3 | 6'000 | 6'000 | 58'594 | 84'375 |
| 5 | 24'000 | 24'000 | 91'553 | 216'211 |
| 8 | 192'000 | 192'000 | 178'814 | 565'256 |
| 10 | 768'000 | 768'000 | 279'397 | 967'587 |
| 15 | 1'024'000 | 1'237'000 | 852'651 | 3'260'605 |
| 18 | 1'024'000 | 1'646'000 | 1'665'335 | 6'511'338 |
| 20 | 1'024'000 | 1'992'000 | 1'942'446 | 9'975'234 |
| 30 | 1'024'000 | 5'167'000 | 4'193'596 | 38'114'602 |
| 40 | 1'024'000 | 13'401'000 | 9'053'659 | 98'865'388 |
| 50 | 1'024'000 | 34'759'000 | 19'546'170 | 230'021'777 |

Die Klassenbasis bleibt (Dieb 1'000 = zwei Drittel des Wertes eines Zauberers mit 2'000). Der Aufstieg kostet damit in allen Tiers 5 bis 28 Kämpfe je Stufe (Mittel 9 / 12 / 16 / 18 / 11) und folgt dem Vorrat der Welt.

**Was „glatt“ gegenüber „+10 % ab 10“ ändert:** (1) Stufe 1 bis 6 kosten 6 bis 13 statt 0 bis 3 Kämpfe, damit die Gruppe auf den schwachen Stufen etwas länger spielt (Ausrüstung kaufen, Zauber lernen);
(2) der Buckel auf Stufe 8 bis 10 (bis 47 Kämpfe in Tier 2) verschwindet; (3) die Tier-Grenzen der Welt bei Stufe ≈ 12 / 20 / 34 passen zu den Stufen, ab denen die Monster mit den neuen Formeln beherrschbar sind;
(4) ab Stufe 19 wachsen die Schritte um 8 % statt 10 %, damit Tier 5 nicht auf 33 Kämpfe je Stufe (Stufe 50) steigt. **Wenn Sie nur Ihre +10 % wollen**, gilt der Rest des Vorschlags unverändert (Variante `v3u` im Werkzeug); der Preis sind 1 Kampf je Stufe auf Stufe 1 bis 4 und eine Spitze auf Stufe 10.

Wirkung auf einen Durchlauf (`journey`: Gruppe jagt immer im höchsten Tier, das sie verkraftet; Siegquote ≥ 90 %, Verlust ≤ 60 %, Tote < 0,35; Mittel aus der Welt, Gold aus den Beispielwelten):

| | Kämpfe bis Stufe 25 | bis Stufe 40 | bis Stufe 54 | Gold knapp |
|---|---|---|---|---|
| heute | 206 | 280 | 295 (davon 1 Kampf je Stufe ab 40) | Stufe 3 bis 8 |
| Kampf neu + XP „+10 %“ | 324 | 775 | 1'206 | Stufe 3 bis 8 |
| **komplett (Vorschlag)** | **279** | **541** | **791** | nie |

Mit dem Vorschlag erreicht die Gruppe Stufe 54 nach rund 790 Gruppenkämpfen (etwa die Hälfte aller Gruppen der Welt), statt wie heute nach 295, und dabei jagt sie in den Tiers 1 bis 5 ungefähr auf den Stufen
1–2 · 3–8 · 9–20 · 21–34 · ab 35 (Rohdaten `journey-*.txt`).

**Monster-XP.** Die XP der Monster folgen ihrer Stärke recht gut (log XP = 1,52 + 1,16 · log Bedrohung, Korrelation 0,93 über 91 Monster). Das Werkzeug listet die Ausreißer (`monsterxp.ts`).
Ich schlage **nur wenige Anpassungen** vor und nur, wenn Sie sie wollen; die XP-Tabelle funktioniert auch mit den heutigen Werten:

| Monster | Tier | XP heute | Kurve | Vorschlag |
|---|---|---|---|---|
| Medusa | 5 | 3'000'000 | 159'000 | 690'000 |
| Minotaur | 5 | 3'000'000 | 705'000 | 1'500'000 |
| Minotaur King | 5 | 6'000'000 | 1'963'000 | 3'400'000 |
| Terminator | 5 | 3'000'000 | 1'066'000 | 1'800'000 |
| Lich | 5 | 120'000 | 16'000 | 44'000 |
| Priest of Moo | 5 | 120'000 | 31'000 | 61'000 |
| Cleric of Moo | 3 | 32'000 | 9'100 | 17'000 |
| Mystic cloud / Phantom / Wicked Witch | 3 | 30'000 / 16'000 / 16'000 | 6'900 / 4'600 / 3'600 | 14'000 / 8'600 / 7'500 |
| Black Knight | 4 | 100'000 | 311'000 | 180'000 |
| Dinosaur | 4 | 80'000 | 263'000 | 150'000 |
| Giant Spider / Ninja | 1 | 3'000 / 3'000 | 9'500 / 8'600 | 5'300 / 5'100 |
| Oh No Bug | 1 | 1'000 | 4'900 | 2'200 |
| Rat Overlord | 2 | 8'000 | 31'000 | 16'000 |

Das ist der halbe Weg (geometrisches Mittel) zur Kurve. Die Welt-XP von Tier 5 sinken damit um 40 % (504 → 300 Mio.), die anderen Tiers ändern sich um höchstens ±11 %. Die Kurve kennt die **Sonderangriffe nicht**: Medusa (versteinert), Lich (tötet),
Minotaur (tötet) sind womöglich bewusst hoch bewertet. Vollständige Liste und Rechnung: `monsterxp.ts`.

## 5. Offene Fragen und Risiken

1. **Zielbild und Bänder sind meine Annahme** (4.1). Wenn Sie andere Stufen für die Tiers wünschen (z. B. die Händlerstufen 8/18/28/38 des Spiels), lässt sich das mit `search.ts <Name> 900 40 1,8,18,28,38` neu suchen; die Hebel bleiben vermutlich dieselben.
2. **Attributwachstum und Ausrüstung** bestimmen die Ergebnisse stärker als jede Formel (3.4). Ob die 40 bei Stufe 50 tragen, entscheidet über Tier 4 und 5. Ein Held mit der besten Ausrüstung braucht nur ein Viertel der Lebenspunkte; hier sind
   die Gegenstandstabelle (Materialboni +20 Rüstung und +50 Schaden je Teil) und das Gold der Schmiede der eigentliche Hebel, nicht die Kampfformel.
3. **Die vier Fehler (3.5)** sind behoben, unabhängig vom Rest. Alle Zahlen dieses Dokuments sind danach neu gerechnet; der Befund bleibt, das Spiel ist insgesamt etwas leichter (Zielwert heute 0,76 → 0,60), der Vorschlag ändert sich kaum (0,172 → 0,170).
4. **Nicht modelliert:** Segenszauber, Schutz, Zustandszauber, „Hits All“, Altern. Sie machen die Gruppe im Spiel eher stärker als hier.
5. **Das Handover führt aus, dass das Altspiel die Trainingsgrenze „Stufe des Trainers × 10“ und den Aufstieg bei halber Tabellen-XP kannte** (Abschnitt 14, Punkt 12). Der Vorschlag verlangt weiter volle XP und keine Grenze.
6. **Der Orb** (3.6) braucht eine zweite Wirkung, sonst bleibt er ein Dekoobjekt.
7. **Die Great Hydra** ist mit den heutigen Werten unbesiegbar und gehört in eine eigene Kategorie.
8. **Die Welt ändert sich** (`GEN_VERSION` 20 beim Schreiben): die Verteilung der Monster auf die Tiers (und damit die XP-Tabelle) hängt am Generator. Nach Änderungen an Orten, Gruppen oder Themes `npx tsx tools/balance/supply.ts <Seed>` (nach Löschen
   der Zwischenspeicher `tools/balance/out/supply-*.json`) und `xpcurve.ts` neu laufen lassen.

## 6. Umsetzung (wenn Sie zustimmen)

Alle Stellen liegen im Spiel; zu ändern wäre **nichts außerhalb dieser Dateien**. Die vier Fehler aus 3.5 sind schon erledigt (in der Tabelle als „erledigt“ markiert); offen sind die Faktoren des Vorschlags:

| Änderung | Datei und Stelle |
|---|---|
| Leben | `src/sim/character.ts`, `recalcValues`: `c.health` |
| Nahkampf, Fernkampf: Faktoren | `src/sim/combat.ts`, `meleeDamage`, `rangedDamage` (nie unter 0, Attribute plus Ausrüstung statt `c.str`/`c.acc` und Ringschaden im Fernkampf sind **erledigt**, 3.5) |
| Monsterschlag, Mindestdurchschlag | `src/sim/combat.ts`, `monsterDamage` (der Fehlschuss ohne Schaden ist **erledigt**, 3.5) |
| Sonderangriffs-Chance | `src/sim/combat.ts`, `applyHit` (Chance je Zustand; „Dead“ und „Rotten“ halb: **erledigt**, 3.5) |
| Wolf, Fee | `src/sim/encounter.ts` (`WOLF_EXECUTE_BELOW`), `src/data/raw/constants.json` (`MASCOT_FAIRY_ELEMENTAL_DAMAGE_REDUCTION`, von `export_g_data.py` erzeugt: Wert in `old_code` ändern oder im Export überschreiben) |
| XP-Tabelle | `src/sim/character.ts`, `xpToNextLevel` |
| Trainingskosten | `src/sim/economy.ts`, `trainingCost` |
| Monster-XP | `src/data/raw/MONSTER_DATA.json` ist **erzeugt** (`npm run data:export`): Änderung im Export als Überschreibung, nicht von Hand |
| Tests | `tests/unit` (Kampf- und XP-Tests ergänzen), danach `npm run balance` und `tools/balance/verify.ts` (müsste nach der Umsetzung die neuen Formeln als `CURRENT` führen) |

Vor einer Umsetzung die Werte im Werkzeug nachziehen (`formulas.ts`: `CURRENT` auf die neuen Formeln setzen, `verify.ts` muss weiter „OK“ melden) und die Tabellen dieses Dokuments mit `cli.ts grid`, `archetypes`, `ranged`, `sweep.ts` und `journey` neu erzeugen.

## 7. Wiederholen

```
cd game
npx tsx tools/balance/verify.ts 10000                                   # Formeln = Spiel
npx tsx tools/balance/crosscheck.ts 300                                 # Simulator = echte Engine
npx tsx tools/balance/cli.ts compare --proposal=v3x --runs=300 --levels=1,2,3,4,5,6,8,10,12,15,18,20,25,30,35,40,50,60,70   # Tabelle 3.1 / 4.3
npx tsx tools/balance/cli.ts archetypes --formulas=v3x --levels=1,3,5,8,11,15,19,25,33,40                                  # Gruppen und Bogenanteil
npx tsx tools/balance/cli.ts ranged-compare --proposal=v3x --levels=1,3,5,10,15,20,30,40                                    # Fernkampf
npx tsx tools/balance/cli.ts power --formulas=v3x --levels=1,5,10,20,30,50                                                  # Leben, Nahkampf, Bogen (4.2)
npx tsx tools/balance/monsters.ts v3x 36 5 2 100                                                                            # Todesfälle in Tier 5
npx tsx tools/balance/tweak.ts v3 300 "mScale=1" "rHit=0.5"                                                                 # Ablation (4.1)
npx tsx tools/balance/cli.ts sens --formulas=v3x                        # Empfindlichkeit
npx tsx tools/balance/sweep.ts v3x 3,11,19,33,45 none,Wolf 25           # alle 715 Gruppen
npx tsx tools/balance/mascots.ts v3x 200                                # Maskottchen
npx tsx tools/balance/xpcurve.ts current xp_g10 xs_25_125_18_108        # XP gegen den Vorrat der Welt
npx tsx tools/balance/cli.ts journey --formulas=v3x --maxlevel=55       # Kämpfe je Stufe, Gold
npx tsx tools/balance/inspect.ts v3x 300                                # Zielbild Zelle für Zelle
npx tsx tools/balance/search.ts neu 900 40                              # Parameter neu suchen
```

Eigene Vorschläge: in `tools/balance/proposals.ts` einen Eintrag `{ ...CURRENT, … }` oder eine Parametermenge (`parametric.ts`) anlegen und mit `--formulas=<Name>` an alle Befehle geben.
