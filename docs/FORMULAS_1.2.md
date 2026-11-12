# Formeln des Spiels

Stand: 12. 11. 2026 (Version 1.2, umgesetzt in `bug_fix_56`). Diese Datei sammelt **alle Rechenregeln** des Spiels an einer Stelle: wie Werte entstehen, wie Schaden, Preise, Zeiten und Chancen berechnet werden. Sie beschreibt den Code, sie ersetzt ihn nicht: Bei jeder Änderung an einer Formel gehört die Zeile hier mit hinein (Quelle jeweils in Klammern).

**Schreibweise:** `⌈x⌉` aufrunden, `⌊x⌋` abrunden, `trunc` Nachkommastellen abschneiden, `round` Rundung auf die nächste ganze Zahl (Pythons `round`: .5 geht zur geraden Nachbarzahl, `pyRound` in `sim/character.ts`), `Stufe` die Stufe des Helden, `Tier` die Stufe (1 bis 5) des Ortes. Alle Kampfzahlen stehen in `RULES.v4` (`sim/balance.ts`); der Zweig `legacy` ist die alte Rechnung und nur noch Rückweg (Abschnitt „Alte Formeln“ am Ende). Zufall kommt immer aus `core/rng.ts`, nie aus `Math.random`.

---

## 1\. Helden

### 1.1 Attribute

Es gibt sieben Attribute: Stärke (STÄ), Intelligenz (INT), Persönlichkeit (PER), Ausdauer (AUS), Tempo (TEM), Genauigkeit (GEN), Glück (GLÜ) (`ATTRIBUTES`).

- **Wert mit Ausrüstung** `attr(c, a)` = Grundwert (oder durch Zustände veränderter Wert) + Summe der Boni getragener Gegenstände + zeitweiliger Brunnen-/Schrein-Bonus (`mods.boon`).
- **Zustände verändern die Grundwerte** (`conditionAdjusted`, alle Werte mindestens 1):

| Zustand | Wirkung |
| --- | --- |
| Gesegnet (Blessed) | alle Attribute (STÄ, TEM, INT, PER, AUS, GEN, GLÜ) `+ Tier` des Tempels, der gesegnet hat (1 bis 5, `mods.blessing`; ohne Marke, etwa aus dem Debug-Menü, +1); Rüstungsbonus unverändert `max(1, 2 × Stufe)` |
| Wahnsinnig (Crazy) | STÄ +1, TEM +1; INT, PER, AUS, GEN, GLÜ je −3 |
| Verflucht (Cursed) | Glück `⌊GLÜ / 10⌋` |
| Krank (Diseased) | INT, PER, AUS je −5 |
| Betrunken (Drunk) | PER +3, GLÜ +3; STÄ, INT, AUS, TEM, GEN je −3 |
| Verliebt (Lovestruck) | alle Attribute +1 |
| Vergiftet (Poisoned) | STÄ, TEM, GEN je −5 |
| Schwach (Weak) | alle Attribute halbiert (`⌊x / 2⌋`) |

- **Steinhaut** halbiert das Tempo (`trunc(TEM / 2)`, mindestens 1) und gibt Rüstung (siehe 1.3).

### 1.2 Lebenspunkte (LP) – neu seit dem 55. Playtest

```
LP = round(Stufe × (AUS / 4 + Klassenwert_LP + Rassenwert_LP)) + 10        (+ Stufe, wenn der Party das Talent Body Builder gehört)
```

- `AUS` zählt mit Ausrüstung und Brunnen-Bonus (`attr(c, "end", true)`, mindestens 1); ist der Klammerwert ≤ 0, wird er 1.
- Der Teiler von AUS stand bis zum 54. Playtest bei **2**, jetzt **4** (`RULES.v4.healthEndDivisor`, `healthEndDivisor()` in `sim/balance.ts`; `legacy`: 2). Das „+ 10“ ist `healthFlat` (v4; legacy 0).
- Quelle: `recalcValues` in `sim/character.ts`. Ein Zuwachs an AUS (Kelch, Schrein, Brunnen) gibt dem Helden die gewonnenen LP sofort als aktuelle LP (`gainAttribute`).

### 1.3 Zauberpunkte (ZP)

Nur die Klassen mit Magie haben welche; `mana` = Klassenwert + Rassenwert, `lvl` = Stufe, Ergebnis `round(...)`, mindestens 0:

| Klasse | Zauberpunkte |
| --- | --- |
| Archer | `lvl × (10 − 90 / INT + mana)` + Prestidigitator |
| Cleric | `lvl × (25 − 250 / PER + mana)` + Prayer Master |
| Druid | `lvl × (25 − 500 / (PER + INT) + mana)` |
| Paladin | `lvl × (10 − 90 / PER + mana)` + Prayer Master |
| Ranger | `lvl × (10 − 180 / (PER + INT) + mana)` |
| Wizard | `lvl × (25 − 250 / INT + mana)` + Prestidigitator |
| alle anderen | 0 |

Prestidigitator und Prayer Master (Talente der Party) geben je `2 × Stufe` dazu. Der Orb gibt seit Balance v4 **keine** ZP mehr (legacy: ×1,2). Quelle: `recalcValues`.

### 1.4 Rüstung, Tempo, Widerstände

- **Rüstung** `armor(c)` = Summe `arm` der getragenen Gegenstände; **Rage** halbiert sie (`trunc(/2)`), **Steinhaut** addiert danach `Stufe des Zaubernden`.
- **Tempo im Kampf** `fightSpeed(c)` = TEM, mit Steinhaut `max(1, trunc(TEM / 2))`.
- **Widerstand** gegen ein Element (Feuer, Eis, Säure, Magie) in Prozent: Grundwert des Helden + Gegenstände + Brunnen-Bonus; wirksam höchstens **80 %** (`RESISTANCE_CAP`, `resistanceShare`).
- **Alter** in Jahren: `⌊(Minute − Geburtsminute) / 144 000⌋` (ein Jahr = 10 Wochen × 10 Tage × 24 h × 60 min) plus magisches Alter (Geister, Zauber); keine Wirkung außer der Anzeige und den 5 Jahren von Resurrect und Divine Intervention.

### 1.5 Erfahrung und Stufen

- **Schritt einer Stufe** (`xpStepV4(base, Stufe)`, `base` je Klasse 1000 bis 2000 aus `CONSTANTS.CHARACTER_XP`):
  - Stufe ≤ 10: `base × 2^(Stufe − 1)`
  - ab Stufe 11: `round(1 024 000 × 1,02^(Stufe − 10))`
- **Fehlende XP bis zur nächsten Stufe** `xpToNextLevel` = (Summe der Schritte 1 … Stufe) − bisherige XP, nie negativ.
- **Erfahrung verteilen** (`addXp`): jeder Held, der handeln kann, bekommt die **volle** Zahl (nicht aufgeteilt); Schlafende, Gelähmte, Versteinerte und Bewusstlose bekommen nichts.
- **Aufstieg** nur im Trainingslager (`train`): kostet Gold (siehe 5.5) und `TRAINING_MINUTES` = 120 Spielminuten je Held; danach volle LP und ZP.
- **Hinweis „kann aufsteigen“** (Toast): einmal je Held und Stufe, wenn die XP erstmals reichen (`Game.announceLevelUps`).

### 1.6 Diebesfertigkeit

```
Skill = max(1, ⌊((GLÜ + GEN) / 2 + Thievery) × Stufe × 0,1⌋)         (GLÜ, GEN mit Ausrüstung; Thievery = Klassen- + Rassenwert)
Wurf  = gleichverteilt zwischen ⌊Skill / 3⌋ und Skill
```

Quelle: `thieverySkill`, `thieveryRoll`. Schlösser: Abschnitt 8.1.

---

## 2\. Kampf

Alle Zahlen: `RULES.v4` in `sim/balance.ts`.

### 2.1 Reihenfolge und Reichweiten

- **Aktionsradius der Monster** und **Schussreichweite der Gruppe**: 7 Felder (Chebyshev, ein Quadrat), `MONSTER_ACTION_RADIUS = SHOT_RANGE = 7`. Ein Monster, auf das die Gruppe schießen darf, ist wach.
- **Nahkampfmodus** (`battleMode`): ein Monster steht neben der Gruppe. Die Helden handeln dann einer nach dem anderen nach Tempo, danach antworten die Monster; die Gruppe hält ihr Feld.
- **Weg der Monster** `wayToPlayer`: A\* auf dem Gitter, höchstens 30 Knoten (Wecken, Altes) bzw. `MOVE_STEP_LIMIT` = 80 (Bewegung und Scan), nur im Quadrat um die Gruppe; andere Monster sind Hindernisse.
- **Zielwahl der Gruppe** (Optionen → Controls → „Range attack targets“, `Game.focusMonster`):
  - *closest* (seit dem 55. Playtest): unter allen Monstern im 45°-Kegel vor der Gruppe, die sie sieht, das mit den **wenigsten Schritten bis zur Gruppe** (`closestInCone`, `stepsToParty` = Länge von `wayToPlayer`, 9999 ohne Weg); bei Gleichstand das nähere (Luftlinie), dann das mehr vorn liegende.
  - *weakest*: das Monster mit den wenigsten LP im Kegel; ein Monster direkt neben der Gruppe wird immer zuerst bekämpft.

### 2.2 Nahkampfschaden der Helden (`meleeDamage`)

```
Basis   = STÄ / 10 + Klassenwert_Nahkampf + Rassenwert_Nahkampf
Waffe   = gleichverteilt zwischen dam_min und dam_max der getragenen Gegenstände (0 zählt als 1)
Gesamt  = ⌈Waffe + Basis × Stufe / 3⌉ + Rage
         × (1 − Abwehrstellung 0,5), falls die Abwehrstellung an ist (STANCE_MODIFIER)
         − Rüstung des Monsters
         × (1 − res_physical des Monsters)
Ergebnis = max(0, trunc(Gesamt))
```

`/ 3` ist `meleeLevelDivisor` (legacy: 1, also `Basis × Stufe + Waffe`). Der Nahkampf trifft immer. Ringe mit Schaden zählen über `dam_min/max` mit.

### 2.3 Fernkampfschaden der Helden (`rangedDamage`)

```
Trefferchance = min(1, max(0, GEN / (Tempo_Monster × Abstand × 1)))        legacy: Faktor 0,5 im Nenner
              × 0,5, wenn der Abstand 1 ist (rangedPointBlank)
Basis   = GEN / 10 + 0,8 × (Klassenwert_Fernkampf + Rassenwert_Fernkampf)  (0,8 = rangedClassShare; legacy 1)
Waffe   = gleichverteilt zwischen ranged_dam_min + Ring-dam_min und ranged_dam_max + Ring-dam_max
Gesamt  = ⌈Basis × Stufe / 1,5 + Waffe⌉ + Rage                             (1,5 = rangedLevelDivisor; legacy 1)
         × (1 − Abwehrstellung), − trunc(Rüstung des Monsters × 2/3), × (1 − res_physical)        (2/3 = rangedArmorShare; legacy 1/2)
```

Jeder Held mit Fernwaffe schießt in der freien Bewegung; Pfeile je Schütze `shots`.

### 2.4 Durchschnittsschaden im Gegenstands-Tooltip (`averageHit`, `averageDamageLines`)

Dieselbe Formel mit der **Mitte** der Waffe statt des Wurfs, ohne Monster (keine Rüstung, kein Widerstand) und ohne Trefferchance. Die Zeile „Average … damage per hit“ zeigt den Wert **mit** dem Gegenstand; die farbige Zahl in Klammern ist die Änderung gegenüber dem, was der Held jetzt austeilt (grün besser, rot schlechter; bei einem getragenen Gegenstand keine Klammer). Ein Ring von STÄ/GEN wird über `attrChange` im Stufenanteil mitgerechnet.

### 2.5 Monsterschaden gegen Helden (`monsterDamage`)

```
Wurf = gleichverteilt zwischen damage_min und damage_max
Fernangriff: Trefferchance = min(1, max(0, Tempo_Monster / (fightSpeed(Ziel) × Abstand × 0,5)))     (Ninja: × 0,75 statt 0,5)
Frühe Fehlchance gegen Helden der Stufe 1 / 2 / 3: 50 % / 30 % / 15 % (earlyMiss), die Zahl wird für jeden Angriff gezogen
Physisch:  trunc(Wurf × 30 / (30 + Rüstung))        (monsterArmorK = 30; legacy: Wurf − Rüstung, Schüsse zusätzlich − ⌊Rüstung/2⌋)
Element:   round(Wurf × (1 − Widerstand%/100)) − Schutz (Protection from Elements: Stufe des Zaubernden); nie unter 0
           (Widerstand% = Wert des Helden + Gegenstände + Boon + Fee 15, höchstens 80; legacy: zusätzlich − 20 mit der Fee)
Gift:      wird nicht verringert
Ninja:     weicht einem Nahangriff mit 10 % aus (Schaden 0)
Abwehrstellung: Fernangriffe × 0,5
```

Ein Monster mit Fernangriff schießt aus der Ferne `min(2, ⌈Angriffe / 2⌉)` Schüsse je Zug (`monsterShots`), im Nahkampf macht es alle Angriffe (`no_of_attacks`).

Erzielt ein Monster keinen Schaden, hat es trotzdem eine 10% Chance die Sonderwirkung auszulösen. Diese wird wie in 2.6 beschrieben abgehandelt (`specialWithoutDamage`; ein Wurf je Angriff, nur bei Monstern mit Sonderwirkung; legacy: 0). Die Sonderwirkung gilt auch für Fernangriffe (der Terminator schießt nur).

### 2.6 Treffer auf einen Helden (`applyHit`)

- Power Shield: Schaden × (1 − 0,1). Schlafende erwachen bei Schaden.
- **Sonderwirkung** (Zustand der Monstertabelle) wirkt mit Wahrscheinlichkeit `10 / (GLÜ² × 0,05)`; **Dead** und **Rotten** nur halb so oft (`5 / …`).
- Mana-Raub: `min(ZP, ⌈Mana × steal_mana⌉)`; Altern: `+aging_years` magisches Alter.
- Bei LP ≤ 0: **tot**, wenn der Treffer mehr als `⌊Maximum-LP / 2⌋` war oder LP ≤ −`⌊Maximum-LP / 3⌋`, sonst **bewusstlos**. Ist die Sonderwirkung des Monsters Eradication (Terminator, „causes_status_eradication“ der Monstertabelle), wird aus „tot“ **verrottet** (Rotten); ein bereits verrotteter Held wird nicht zusätzlich tot.
- Ein Held im Dimensional Rift ist unverwundbar.

### 2.7 Maskottchen

- **Wolf**: tötet jedes Monster unter 10 % LP (`wolfBelow`; legacy 90 %).
- **Fee**: erhöht die Resistenzen (Feuer, Eis, Säure, Magie) **aller** Helden um **+15 %** (`fairyResistance`, wirkt wie ein Gegenstandsbonus; die Obergrenze von 80 % gilt weiter; auf dem Charakterbogen zählt sie zum aktuellen Wert, nicht zum Basiswert). Vorher (bis 11. 11. 2026): −30 Punkte je Elementartreffer. Legacy: −20 Punkte je Treffer.
- **Orb**: Angriffszauber +20 % Schaden (`orbSpellBonus`), keine ZP mehr.

### 2.8 Monster-XP

`XP = ⌊def.xp × xpPercent / 100⌋` (`monsterXp`); `xpPercent` ist 100, bei Hüttenmonstern 150 / 100 / 75 / 60 % für kleine / normale / große / riesige Welten (`hutXpPercent`). Die Werte `def.xp` sind die Spalte „entity 23: XP\_new“ der Monstertabelle.

---

## 3\. Zauber

- **Kosten** (`spellCost`): `mana` des Zaubers; skaliert der Zauber mit der Stufe, `max(1, ⌈mana × Stufe × 0,5⌉)` (`SCALING_COST_SHARE`).
- **Angriffsschaden** (`attackDamage`): gleichverteilt `dam_min … dam_max`, mal Stufe, wenn der Zauber skaliert; Abwehrstellung × 0,5; Orb × 1,2. Dann Widerstand des Monsters: `Schaden − trunc(Schaden × res_<Element>)` (`spellDamageToMonster`).
- **Schadensart**: bei mehreren möglichen Arten wird gezogen; **Dragon Breath** nimmt die vom Spieler gewählte Art (Säure, Feuer, Eis, Magie – nie physisch), ohne Wahl eine gezogene.
- **Flächenzauber**: Meteor Shower, Elemental Storm, Prismatic Light und Dragon Breath treffen jedes Monster im Aktionsradius, Star Burst jedes im Umkreis von 3 Feldern; Prismatic Light nur sichtbare Monster. Je Monster eigene Schadensart bei Storm und Prisma.
- **Heilung**: gleichverteilt `heal_min … heal_max` der Zaubertabelle; Moon Ray heilt jeden Helden um bis zu 50; Half For Me: die Zaubernden zahlen `⌈fehlende LP / 2⌉` (mindestens 1 LP bleibt), der andere bekommt das Doppelte.
- **Dauer**: Light, Protection, Detect Monster, Wizard's Eye je 8 Stunden (Light 8, Levitate und Walk on Water 4); Stone Skin und Rage 12 Stunden; Protection gibt `Stufe des Zaubernden` Punkte.
- **Schutz-/Phasenzauber** zählen in Zügen der Monster: Dimensional Phasing 5, Immobilize 3, Dimensional Rift 5.
- **Pandora's Box**: dreimal je Spieltag; Wurf 1–100: 1–30 Gold (1–100), 31–60 Gegenstand Stufe 1, 61–80 Monster Stufe 1, 81–85 Gold (101–200), 86–90 Gegenstand Stufe 2, 91–95 Monster Stufe 2, 96–99 Gold (1000–10 000), 100 Dragon Lord.
- **Raise Dead / Resurrect** (+5 Jahre Alter für die Zaubernden, −1 Ausdauer für den Geholten) holen mit 1 LP zurück; **Divine Intervention** macht alle ganz.
- **Teleport**: 2 bis 9 Felder vorwärts (Spieler wählt). **Turn Undead**: 100 Schaden an einem Untoten, ignoriert Widerstand. **Holy Word**: Untote mit mehr als 600 LP verlieren 25 % ihrer LP, sonst 150. **Mass Distortion**: jedes Monster auf der Linie mit 20 % halbe LP (nicht ab Treasure-Level 5). **Finger of Death**: 50 % Tod, nur Monster bis Treasure-Level 2.
- **Preise der Rollen** (`spellPrice`): `max(10, round(Wert × bargain))`. Lernen nur Zauber der Schule der Klasse und ab der Stufe des Zaubers (`learnBlock`).

---

## 4\. Gegenstände

- **Material** (`generateItem`): gleichverteilt von 1 bis `Treasure-Level + 3` (1 Holz, 2 Kupfer, 3 Eisen, 4 Stahl, 5 Gold, 6 Rubin, 7 Diamant, 8 Obsidian). Obsidian braucht also Treasure-Level ≥ 5.
- **Art**: Wurf 1–100: ≤ 30 Waffe, ≤ 80 Rüstung (je zur Hälfte Körperpanzer – Eintrag zwischen `Level` und `Level + 3` – oder Stiefel/Gürtel/Helm/Schild/Tiara), sonst Ring der Stufe 1 bis `Level`.
- **Waffenbonus** je Material (Holz … Obsidian): 0, 3, 6, 8, 11, 15, 30, 50 (Fernwaffen die Hälfte, abgerundet); **Rüstungsbonus**: 0, 2, 4, 6, 8, 10, 15, 20.
- **Wert** = ⌊Grundwert × Faktor + 0,9999⌋ mit Faktor je Material 0,5 / 1 / 3 / 10 / 30 / 60 / 90 / 100.
- **Obsidian-Ausrüstung** braucht das Talent Arms Master.
- **Treasure-Level in Orten**: Kisten der Regeln tragen `Tier` bzw. `min(8, Tier + 1)` (Boss-, Schrank- und Königskammer-Kisten). Die tiefere Hälfte eines Ortes ist nicht mehr eine Stufe härter (`tierAt` in `actions/rules.ts` gibt in jeder Tiefe den Tier des Ortes zurück).

## 5\. Wirtschaft

`bargain` (Preisfaktor der Party): Talent Merchant 0,5; Bargainer 0,75; sonst 1 (`bargainFactor`).

### 5.1 Herberge, Taverne

- **Zimmer** `max(10, round(20 × Tier × Anzahl Helden × bargain))`; heilt alle Lebenspunkte, beendet Schlaf und Bewusstlosigkeit, Uhr auf 8:00 des nächsten Morgens (die Zeit läuft wirklich: Zauber enden, Gift kann in der Nacht töten; der Vorrat bleibt unberührt). Schwäche, Rausch, Gift, Krankheit und Wahnsinn heilt nur noch der Tempel oder die Zeit.
- **Verpflegung** je Tier der Taverne: 5 Tage für 10, 10 für 50, 15 für 250, 20 für 1000, 40 für 5000 Gold; wird nur gekauft, wenn weniger Vorrat da ist (und mehr Gold als der Preis).

### 5.2 Schmied

- **Sortiment** je Tag aus Welt-Seed, Laden und Tag: 8 Rüstungen, 8 Waffen, 8 Ringe mit Items des Laden-Tiers (Material 1 bis Tier + 3).
- **Kaufpreis** `max(1, round(Wert × bargain))`; **Verkaufspreis** `max(1, ⌊Wert / 2⌋)`, mit Merchant × 1,5 (gerundet). Quest-Items sind unverkäuflich. Zurückkaufen zum gezahlten Preis.

### 5.3 Tempel

- **Heilung** `round(fehlende LP × 2 × Stufe des Helden)` (seit dem 55. Playtest mit der Stufe; vorher ohne).
- **Zustand heilen** `round(Preis × Stufe des Helden)` mit Preisen Poisoned 40, Diseased 80, Cursed 120, Crazy 100, Weak 30, Drunk 10, Sleeping 5, Paralyzed 150, Petrified 400, (Unconscious wird über die normale Heilung abgehandelt)
- **Wiederbelebung (tot)** `round(300 × Tier)`; der Held kommt mit der Hälfte der LP (mindestens 1) zurück.
- **Wiederbelebung (verrottet)**  `round(1000 × Tier)`; der Held kommt mit der Hälfte der LP (mindestens 1) zurück.
- **Spenden** (`templeDonate`): kostet `round(10 × Tier)`, das Gold ist in jedem Fall weg; mit 20 % Chance (`DONATION_BLESSING_CHANCE`) erhält der Held den Zustand „Blessed“ für 24 Stunden (`BLESSING_MINUTES`), dessen Stärke der Tier des Tempels ist (1.1). Der Button ist nur sichtbar, wenn der Held lebt und nicht gesegnet ist; eine laufende Segnung wird nie gestapelt.

### 5.4 Bank

- Einzahlen/Abheben ohne Gebühr; **Zinsen**: 0,5 % je Woche (jeden siebten Tag der Spielzeit, auf den Tresor inklusive der Wochen davor, abgerundet; `bankInterest`).
- **Schieber**: linear, `Betrag = round(Maximum × Position / 1000)`, mindestens 1 sobald der Schieber den Anfang verlassen hat (`bankSliderAmount`).

### 5.5 Training

- Kosten je Held `round(10 × Stufe² × bargain)` (legacy: 250 × Stufe); „Train all“: niedrigste Stufe zuerst, je Held eine Stufe, hört beim ersten unbezahlbaren auf.

### 5.6 Gilde

- Zauberrollen: alle Zauber der Schule, deren Stufe im Band der Gilde liegt (Gilde 1: 2–5, 2: 6–10, 3: 11–15, 4: 16–20, 5: ab 21).
- Mitgliedschaft `round(Preis des Talents × bargain)`.

### 5.7 Quartiermeister (neu im 55. Playtest)

- Einlagern kostet **1 000 Gold je Stück** (`STORAGE_FEE`), unbegrenzt Platz, normale und Quest-Gegenstände; Abholen kostenlos (`sim/quartermaster.ts`).

### 5.8 Dienststufe

Die Stufe richtet sich nach dem Level (Tier) der Stadt, in der der Laden steht (`ctx.tier`, in den erzeugten Städten immer so). Hat ein Laden kein eigenes Level, gilt der mittlere Level der Party: `< 8` → 1, `< 18` → 2, `< 28` → 3, `< 38` → 4, sonst 5 (`serviceLevel`).

---

## 6\. Zeit, Reisen, Rast

- Ein Schritt kostet in Orten **1 Minute**, in der offenen Welt **10 Minuten** (mit Pathfinder **7**); jede Aktion (Angriff, Zauber, Objekt) 1 Minute.
- **Nahrung**: eine Ration je vollen Spieltag (`advanceTime`); Rast braucht mindestens eine Ration. **Rast** (8 Stunden): heilt alle (außer Tote, Verrottete, Versteinerte), nimmt Schlaf und Bewusstlosigkeit.
- **Nacht** von 20:00 bis 6:00. Zeit: 1440 Minuten je Tag, 7 Tage je Woche.
- **Zustände laufen über Timer** (`sim/conditions.ts`): Vergiftet 2 Tage, Krank 3, Wahnsinnig 4 (dann tot, jeder weitere Treffer nimmt 2 Stunden), Betrunken 12 Stunden (dann schwach), Schwach 1 Tag, Schlafend 8 Stunden (jeder Treffer +2 Stunden), Verliebt 2 Tage.
- **Wasser**: Flachwasser betritt nur, wer schwimmen kann (Swimmer, Seafarer, Zauber), Tiefwasser nur mit Seafarer oder Walk on Water. Rasten geht nie auf Wasser.
- **Lava**: jeder Schritt `25` Feuerschaden je lebendem Helden, verringert wie jeder Elementartreffer (Widerstand, Protection, Fee); Rasten dort nicht möglich.

---

## 7\. Schlösser, Fallen, Belohnungen

### 7.1 Schlösser (`data/locks.ts`)

```
Schwierigkeit = max(1, round(Härte × refSkill(L) × lockEase(L) × lockGear(L)))
Härte:    Kiste 0,52 · Königstruhe 0,76 · Tür 0,39
refSkill(L) = L × (3,8 + 0,055 × L)
lockEase(L) = min(1, 0,2 + 0,2 × L)                      (Stufe 1–3 leichter: 0,4 / 0,6 / 0,8)
lockGear(L) = 1 + 0,3 × min(1, max(0, (L − 10) / 2))     (ab Stufe 10 bis +30 %)
L = Durchschnittsstufe der aktiven Helden, mindestens Eintritt des Tiers (1/5/11/19/33), höchstens Austritt des NÄCHSTEN Tiers (4/10/18/32/50; Tier 5 ohne Grenze)
```

Es würfelt nur der beste aktive Dieb (höchster Skill). Gelingt `Wurf ≥ Schwierigkeit`, geht das Schloss auf; ein Fehlschlag löst mit 20 % die Falle der Kiste aus (`LOCK_FUMBLE_CHANCE`).

- **Gitter der Nebenräume einer Burg** (55. Playtest): wie eine Tür, aber für `Tier + 1` gerechnet (`harder: 1`, höchstens Tier 5); Schatz dahinter `Level = min(8, Tier + 1)`. Seit dem 56. Playtest hängt das Gitter am Alarm: wer es aufbricht, ruft (beim ersten Mal je Burg) die leichten Wachen, wie die Truhen in den Nischen (`warn: "alarm"`, Merker `<Karte>@light`).

### 7.2 Fallen

- **Fallenschaden** `trunc/round(Grundschaden × (1 + Fallen-Level / 10))`, mindestens 1 (`trapDamageFor`).
- **Kistenfalle**: unverschlossene Kisten tragen mit 20 % eine Falle; Ausweichen `GLÜ / (20 × Stufe)`.
- **Generic-Falle** (Feuer, Eis, Säure, Magie) läuft über `elementalDamage`; Speer und Beil laden 8 Schritte nach (`TRAP_RELOAD_STEPS`).

### 7.3 Brunnen, Schreine, Brunnen-Boni

- **Boon** (Brunnen, Steinköpfe der Überwelt): `+5 × Tier` Punkte Attribut bzw. `+10 × Tier` Prozent Widerstand, 12 Stunden, je Stat nicht stapelbar.
- **Heilbrunnen** (nur Städte der Stufe 1): stellt LP/ZP wieder her, nur Helden bis Stufe 10.
- **Schrein**: Resistenz `3 + Tier`, Attribut 1, Heilung `Tier × 25` (Regeln `dungeon.json`/`fortress.json`).

### 7.4 Hütten (Monster Huts)

- Monster je Hütte 4 / 6 / 8 / 10 (kleine / normale / große / riesige Welt), im Umkreis von 5 Feldern.
- **Niederbrennen**: XP `10 × XP des Monsters` (`HUT_XP_FACTOR`), Gold `⌈13 × Gold des Monsters / 1000⌉ × 1000`, 7 Gegenstände nach Treasure-Level.

### 7.5 Beutegegenstände der Quests

- **Schädel** 1 000 Gold und 1 000 XP je Stück (Skull Miser), ab 5 ein Ring der Stufe 2.
- **Perlen** 50 000 Gold und 100 000 XP je Stück (Piratenkönigin), 20 in der Welt.
- **Artefakte** (neu im 55. Playtest): 200 000 XP je Stück an jeden Helden, der handeln kann (`ARTIFACT_XP`); je Art (gut, neutral, böse) 5 in der Welt (`ARTIFACTS_PER_KIND`), eines je Ort (auf einer kleinen Welt mit wenigen Dungeons auch zwei, damit die Zahl bleibt), in verschlossenen Kisten von Höhlen und Dungeons ab Stufe 2.
- **Orbs**: 11 für den König; **Quatloo-Münzen**: 25 in der Welt, eine kauft 3 Punkte eines Attributs.

---

## 8\. Welt und Generator (Auszug der Zahlen)

- **Weltgrößen**: klein 100 × 70, normal 200 × 140, groß 300 × 210, riesig 400 × 280 Kacheln; Landanteil 50 / 46 / 43 / 40 %; eine Kachel hinter der Kante ist die gegenüberliegende.
- **Chunk** 10 × 10 Kacheln. Sichtweite 10 / 18 / 25 Kacheln (nah/mittel/weit).
- **Monster der Überwelt**: je Insel `max(1, round(Fläche / 90))` wilde Gruppen; Hüttenmonster nach `levelAt` (Stufe der Insel + Weg zur nächsten Stadt); Gruppen über Stufe 1 halten 12 Kacheln Abstand zu Starthaven.
- **Orte**: eine Stadt/Burg/Höhle/Dungeon je 60 Landkacheln einer Insel (`LAND_PER_PLACE`); Dungeon-Dichte few 0,5 / default 0,75 / maximum 1.
- **Innenräume**: Wandhöhe Dungeon/Cyber 4,5, Festung 4,2, Stadt/Höhle 3. Kein gerader Gang über 8 Zellen. Labyrinth 25 / 33 / 39 / 47 / 55 Zellen für Stufe 1–5.
- **Burgen**: 17 bis 21 Zellen je Seite; Nebenräume (2×2-Blöcke außerhalb von Tor, Thron und Statuen) bekommen immer ein Banner und einen Gegenstand; unter Stufe 5 mit 50 % hinter einem Gitter.
- **Quartiermeister** steht in genau einer Stadt der Stufe 3, die Städte der Stufe 2 nennen den Dungeon von Seth Squirm (`townHints`).

---

## 9\. Alte Formeln (Rückweg)

`BALANCE.mode = "legacy"` in `sim/balance.ts` schaltet auf die alten Formeln zurück: LP `(AUS / 2 + …) × Stufe`, Nahkampf `Basis × Stufe + Waffe`, Fernkampf ohne Faktor 0,8 und ohne Teiler 1,5, Monsterrüstung als flacher Abzug, Wolf 90 %, Fee 20, Orb +20 % ZP, Training `250 × Stufe`, Stufentabelle mit flachen 1 024 000 ab Stufe 11. Siehe `docs/BALANCE_V4_UMSETZUNG.md` und `docs/KAMPF_BALANCE_V4.md`.

## 10\. Versionskontrolle

- | Version | Änderung |
  | --- | --- |
  | 1.0 | Initiales Dokument |
  | 1.1 | \- 1.1:"Blessed" aktualisiert<br>2.3: Monsterrüstung bei Fernkampf zählt jetzt 2/3 (vorher 1/2)<br>\- 4: Den Bonus der "tieferen Ort" entfernt (Materiallevel jetzt max Dungeon Tier+1)<br>5.1: aktualisiert<br>\- 5.3: aktualisiert<br>\- 5.8: ergänzt (Ladenstufe = Stufe der Stadt) |
  | 1.2 | 2.5 Ergänzt: Sonderwirkung Monster auch wenn kein Schaden erzielt wird<br>2.5/2.7: Fee erhöht die Resistenzen aller Helden um 15 % statt 30 Punkte abzuziehen<br>2.6: Eradication (Terminator) macht verrottet statt tot, Sonderwirkung auch bei Fernangriffen |
