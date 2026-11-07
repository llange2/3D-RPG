# Level-1-Monster und Fallen über die Heldenstufen (45. Playtest, Punkt 11)

**Stand: nur Vorschlag, im Spiel ist nichts geändert.** Alle Zahlen stammen aus dem Kampfwerkzeug (`tools/balance/`), das nur die Datentabellen und `src/sim` liest.
Beobachtung des Nutzers: Die Kämpfe gegen Level-1-Monster (`treasure_level` 1) sind auf den Heldenstufen 1 bis 3 noch schwer, danach in Ordnung, und ab Stufe 7 machen
sie keinen Schaden mehr. Gewünscht: leichter auf 1 bis 3, danach wie bisher, und erst bei etwa Stufe 20 (mit entsprechender Rüstung) kein Schaden mehr.
Fallen sollen mit einbezogen werden (sie skalieren heute mit der Stufe).

Grundlage ist der Spielstand `.ignore/mm3-saves-2026-11-07-09-22-43.json` (Seed `frost-mere-472`, Gruppe Maximus Ritter 8, Ortis Paladin 7, Callas Dieb 8, Kastore Zauberer 7).
Für das Werkzeug liegt die Gruppe als `tools/balance/out/save-2026-11-07.json` (abgeleitet, jederzeit neu erzeugbar).

## 1. Befund

### 1.1 Der Spielstand: Rüstung ist doppelt so hoch wie der stärkste Schlag

| Held | Klasse | Stufe | Leben | Rüstung | Resistenzen Feuer/Eis/Säure/Magie |
|---|---|---|---|---|---|
| Maximus | Ritter | 8 | 158 | 30 | 10 / 10 / 10 / 10 |
| Ortis | Paladin | 7 | 108 | 38 | 7 / 7 / 7 / 7 |
| Callas | Dieb | 8 | 114 | 30 | 5 / 5 / 20 / 5 |
| Kastore | Zauberer | 7 | 48 | 27 | 10 / 0 / 0 / 10 |

Von den 18 Landmonstern der Klasse 1 sind **10 körperlich** (Cursed Fool, Giant Spider, Goblin, Moose Rat, Oh No Bug, Orc Warrior, Phase Head, Skeleton, Vampire Bat, Zombie)
und **8 elementar** (Bubble Man, Candle Creep, Cryo Spore, Scorpia, Screamer, Sprite, Wicked Witch, Wild Fungus). Ein körperlicher Schlag verliert die Rüstung als **feste Zahl**
(`monsterDamage`: `Wurf − Rüstung`, nie unter 0), ein elementarer die Resistenz in Prozent.

* Der höchste Wurf eines körperlichen Level-1-Monsters ist **18** (Zombie 3–18), der der schwächsten 4 (Vampire Bat). Ab **Rüstung 18** richtet **kein** körperliches Level-1-Monster mehr
  Schaden an (`l1curve.ts pass`). Die Gruppe des Spielstands trägt 27 bis 38.
* Die 8 elementaren Monster treffen mit 3 bis 10 je Angriff durch 5 bis 10 % Resistenz und bleiben auf jeder Stufe gleich gefährlich. Gegen 108 bis 158 Leben sind das 2 bis 4 %.
* Fünf Kampfrunden gegen je zwei Exemplare jedes Level-1-Monsters (echte Kampfengine, Gruppe des Spielstands, Bogen / nur Schwert): im Mittel **2 % / 5 %** des Lebens, die
  schlimmsten sind Wicked Witch (24 / 35 %) und Candle Creep (32 / 53 %), alle körperlichen 0 %.

### 1.2 Die Rüstung wächst, die Monster nicht

Rüstung der Standardgruppe mit der Ausrüstung ihrer Stufe (`l1curve.ts curve`): Stufe 1 bis 5 **15 bis 21**, Stufe 7 bis 10 **24 bis 32**, Stufe 12 bis 15 **42 bis 51**, Stufe 20 **51 bis 54**,
Stufe 30 **52 bis 66**. Der Spielstand (Stufe 7/8: 27 bis 38) bestätigt das Modell. Die Monster haben keine Stufe: ihr Schaden ist in der Tabelle fest. Darum ist die Mitte des
Spiels für die Klasse 1 schon **ab Stufe 2 bis 3** (Rüstung 15 bis 21) für alles Körperliche "frei" und nur der Rest (Elementare, Fallen) trägt die Schwierigkeit.

### 1.3 Warum Stufe 1 bis 3 schwer ist: wenige Monster und die Fallen

Standardgruppe Ritter, Ninja, Bogenschütze, Druide, Werkzeug-Stand `v4` (Spiel), 100 Läufe, je eine Art Level-1-Monster, Gruppen aus **2** bzw. **3** gleichen Monstern (die Regeln des
Generators setzen 1 bis 2 je Gruppe auf Klasse 1, mit der Tiefe bis 3):

| Stufe | Ausrüstung | Rüstung (Rit/Nin/Bog/Dru) | 2er-Gruppen: Leben verloren (Mittel) | schlimmste Art | 3er-Gruppen: Leben verloren | schlimmste Art | Tote je Kampf (3er) |
|---|---|---|---|---|---|---|---|
| 1 | Start | 15/21/15/21 | 14 % | Candle Creep 98 % | 21 % | Candle Creep 100 % | 0,19 |
| 2 | Start | 15/21/15/21 | 8 % | Candle Creep 63 % | 15 % | Candle Creep 100 % | 0,03 |
| 3 | t1 | 15/21/15/21 | 4 % | Candle Creep 30 % | 9 % | Candle Creep 73 % | 0,00 |
| 4 | t1 | 15/21/15/21 | 2 % | Wicked Witch 19 % | 6 % | Candle Creep 46 % | 0,00 |
| 5 | t1 | 15/21/15/21 | 1 % | Candle Creep 10 % | 3 % | Candle Creep 29 % | 0,00 |
| 7 | t2 | 32/32/24/31 | 1 % | Wicked Witch 6 % | 2 % | Wicked Witch 12 % | 0,00 |
| 10 | t2 | 32/32/24/31 | 0 % | Wicked Witch 4 % | 1 % | Wicked Witch 6 % | 0,00 |
| 12 und höher | t3 bis t5 | 42 bis 66 | 0 % | Wicked Witch ≤ 1 % | 0 % | Wicked Witch ≤ 1 % | 0,00 |

* Die Schwierigkeit auf Stufe 1 bis 3 hängt an **wenigen elementaren Monstern**: Candle Creep (70 Leben, 2 × 2–10 Feuer aus der Ferne, höchster Wert der Klasse) und Wicked Witch (4–16 Magie, Fluch)
  vor allem, dazu Sprite, Scorpia und Cryo Spore (4–16 Eis, trifft alle). Drei Candle Creeps schlagen eine frische Gruppe immer (Sieg 0 %), zwei Hexen in 4 von 10 Fällen (Sieg 62 %, 1,4 Tote). In
  Dreiergruppen kosten auf Stufe 1 (`monsters.ts v4 1 1 3`) diese fünf 31 bis 100 % des Lebens, die übrigen 13 Arten höchstens 20 %, die körperlichen meist 0 bis 7 %.
* Der Fehlerzustand "Fluch" und die Fernschüsse umgehen die Rüstung. Genau diese Monster sind es, gegen die die Stufe-1-Gruppe mit ihren 18 bis 26 Lebenspunkten je Held nichts hat.
* **Fallen:** Der Schaden einer Falle ist `Wert des Ortes × (1 + Stufe / 10)` (`trapDamageFor`), im Ort der Klasse 1 im Mittel 6,9 (Speer 7, Grube 5,5, Beil 9, Elementar 6). Ein Held der Stufe 1 hat
  18 bis 26 Leben: **eine Falle nimmt 37 % eines Helden** (7,6 von 20), auf Stufe 3 noch 20 %, auf Stufe 10 nur 9 % und auf Stufe 20 6 %. Die Falle wächst mit der Stufe, aber langsamer als das
  Leben, und sie wird auf Stufe 20 mit 20,6 nie harmlos.

## 2. Der Vorschlag: ein Stufenfenster für den Schaden ("wie bei den Fallen")

**Grundgedanke:** Die Monster einer Klasse sind für ein Stufenband gedacht (Entwurfsbänder des Kampfwerkzeugs, schon in `src/data/locks.ts`: Klasse 1 = Stufe 1 bis 4, 2 = 5 bis 10, 3 = 11 bis 18,
4 = 19 bis 32, 5 = 33 bis 50). Ihr Schaden bekommt einen Faktor `S(Klasse, Heldenstufe)`, der auf den Würfelwurf **vor** Rüstung und Resistenz wirkt:

1. **Anlauf:** Ab der Eintrittsstufe der Klasse steigt `S` in drei Stufen von **0,4** auf **1,0** (Klasse 1: Stufe 1 = 0,4, 2 = 0,6, 3 = 0,8, ab 4 = 1,0).
   Ein Held unter der Eintrittsstufe ("zu früh") trifft die Monster in voller Stärke.
2. **Normalbereich:** `S = 1` bis zwei Stufen nach dem Ende des Bandes (Klasse 1: bis Stufe 6).
3. **Auslauf:** danach fällt `S` gerade auf **0** bei der Eintrittsstufe der Klasse **t + 3** (Klasse 1: Stufe 19 → Stufe 20 und mehr: kein Schaden; Klasse 2: Stufe 33; Klasse 3 und höher: nie).
   Das ist die Stelle des Nutzers, "eher bei Stufe 20".

| Stufe | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 12 | 14 | 16 | 18 | 19 | 20+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `S` Klasse 1 | 0,40 | 0,60 | 0,80 | 1,00 | 1,00 | 1,00 | 0,92 | 0,85 | 0,69 | 0,54 | 0,38 | 0,23 | 0,08 | 0,00 | 0,00 |

Die Tabelle für alle Klassen: `npx tsx tools/balance/l1curve.ts scale`.

### 2.1 Wirkung (Werkzeug, Formelsatz `v6:rampFrom=0.4,rampLevels=3,fadeAfter=2,zeroTiers=3`)

Mittlerer Schaden **je Monsterzug** gegen den Ritter mit der Ausrüstung seiner Stufe, gemittelt über die 18 Level-1-Monster, und wie viele der 18 mit irgendeinem Wurf überhaupt noch
verletzen können (`l1curve.ts hit "v4;v6:…"`):

| Stufe | Rüstung | heute (`v4`) | Vorschlag | verletzen heute / Vorschlag |
|---|---|---|---|---|
| 1 | 15 | 3,5 | **1,4** | 11 / 8 |
| 2 | 15 | 3,5 | **2,0** | 11 / 8 |
| 3 | 15 | 3,5 | **2,7** | 11 / 8 |
| 4 | 15 | 3,5 | 3,5 | 11 / 11 |
| 5 | 15 | 3,5 | 3,5 | 11 / 11 |
| 7 | 32 | 3,4 | 3,2 | 8 / 8 |
| 10 | 32 | 3,4 | 2,3 | 8 / 8 |
| 12 | 43 | 2,8 | 1,5 | 8 / 8 |
| 15 | 43 | 2,8 | 0,9 | 8 / 8 |
| 18 | 43 | 2,8 | 0,2 | 8 / 6 |
| 20 | 54 | 2,6 | **0,0** | 8 / **0** |

Kämpfe (`l1curve.ts curve`, Läufe 100; "Leben verloren" im Mittel der 18 Arten, Gruppen aus 2 bzw. 3):

| Stufe | 2er heute | 2er Vorschlag | 3er heute | 3er Vorschlag | schlimmste Art (3er) heute → Vorschlag |
|---|---|---|---|---|---|
| 1 | 14 % | 6 % | 21 % | 13 % | Candle Creep 100 % → 96 % |
| 2 | 8 % | 5 % | 15 % | 10 % | 100 % → 81 % |
| 3 | 4 % | 3 % | 9 % | 7 % | 73 % → 57 % |
| 4 | 2 % | 2 % | 6 % | 6 % | 46 % → 46 % |
| 5 | 1 % | 1 % | 3 % | 3 % | 29 % → 29 % |
| 7 | 1 % | 1 % | 2 % | 1 % | 12 % → 11 % |
| 10 | 0 % | 0 % | 1 % | 0 % | 6 % → 4 % |
| 20 | 0 % | 0 % | 0 % | 0 % | 0 % → 0 % (kein Schaden) |

Die Spielstand-Gruppe (Stufe 7/8, echte Zahlen, je zwei Exemplare jeder Art, `save.ts battery`): Mittel heute 2 % (Bogen) / 5 % (nur Schwert), mit dem Vorschlag 2 % / 4 %: **auf Stufe 7 bis 8 ändert sich
fast nichts**, wie gewünscht ("danach okay").

Die Stufen 1 bis 3 werden spürbar leichter (die Hälfte des Schadens auf Stufe 1), aber **die drei Ausreißer bleiben die schweren Kämpfe**: Drei Candle Creeps (70 Leben) lassen sich mit
einem Faktor allein nicht zähmen, weil die Gruppe sie nicht schnell genug erschlägt. Dafür gehört ein kleiner Eingriff in die Monstertabelle dazu (2.3).

### 2.2 Fallen

Gleicher Faktor, gleiche Stelle wie die Stufenskalierung: `trapDamageFor(damage, level)` bekommt die Klasse des Ortes und rechnet `damage × (1 + level / 10) × S(Klasse, level)`. Ergebnis für eine
Falle der Klasse 1 (`l1curve.ts traps`), Standardgruppe, Leben aus dem Werkzeug:

| Stufe | Leben Rit/Nin/Bog/Dru | heute: Schaden | heute: % eines Helden | Vorschlag: Schaden | Vorschlag: % |
|---|---|---|---|---|---|
| 1 | 26/20/18/18 | 7,6 | **37 %** | 3,0 | 15 % |
| 2 | 42/30/27/26 | 8,3 | 26 % | 5,0 | 16 % |
| 3 | 60/48/36/36 | 8,9 | 20 % | 7,2 | 16 % |
| 4 | 76/62/46/44 | 9,6 | 17 % | 9,6 | 17 % |
| 5 | 95/75/55/55 | 10,3 | 15 % | 10,3 | 15 % |
| 7 | 129/104/76/94 | 11,7 | 12 % | 10,8 | 11 % |
| 10 | 190/155/115/135 | 13,8 | 9 % | 9,5 | 6 % |
| 15 | 295/242/220/175 | 17,2 | 7 % | 5,3 | 2 % |
| 20 | 410/300/320/410 | 20,6 | 6 % | 0 | 0 % |

Eine Falle bleibt damit auf Stufe 1 bis 7 ein Ereignis (15 bis 17 % eines Helden) und verschwindet bei Stufe 20 mit den Monstern derselben Klasse. Trap-Schaden an Truhen (`chestTrap`) und die
Schlösser (`lockDifficulty`, die schon ein Stufenfenster haben) laufen auf denselben Faktor.

### 2.3 Zwei Datenkorrekturen für die Ausreißer (Monstertabelle, `docs/RPG_0.1.xlsx`)

Die Tabelle gehört dem Nutzer; hier nur, was das Werkzeug ausrechnet (`OVERRIDE="…" GROUP=3 l1curve.ts curve`, mit dem Stufenfenster):

| Änderung | Stufe 1 (3er) | Stufe 2 | Stufe 3 | Stufe 5 |
|---|---|---|---|---|
| ohne (nur Stufenfenster) | Candle Creep 96 % | 81 % | 57 % | 29 % |
| Candle Creep 70 → **45** Leben | Wicked Witch 69 % | 58 % | 44 % | 17 % |
| zusätzlich Candle Creep **1 statt 2 Angriffe** und Wicked Witch 4–16 → **3–12** | Wicked Witch 51 % | 44 % | 32 % | 12 % |

Das macht aus "Gruppe verliert" ein "Gruppe verliert die Hälfte ihres Lebens" auf Stufe 1, ohne dass die Monster auf Stufe 4 bis 6 etwas verlieren (dort sind sie ausgeglichen).

## 3. Verworfene Varianten

* **Rüstung als Prozentsatz statt fester Abzug** (`pctK=30`: Schlag × 30 / (30 + Rüstung)). Dann sind körperliche Monster nie mehr "frei" (auch bei Stufe 12 gehen 40 % durch), aber Stufe 1 wird
  **schwerer** (Mittel 36 % statt 21 %: die körperlichen Level-1-Monster, die heute an der Rüstung 15 bis 21 abprallen, treffen wieder). Das widerspricht dem Wunsch für Stufe 1 bis 3.
* **Mindestanteil, der durch jede Rüstung geht** (`chip=0,25 × S` des Wurfs). Hält auch die körperlichen Level-1-Monster bis Stufe 12 bei 1 Schaden je Treffer, hebt aber die Mitte
  (Stufe 4 bis 7: 3,5 → 5,0 je Zug) um 40 %. Nicht empfohlen, außer der Nutzer will ausdrücklich, dass auch Körperliche bis Stufe 12 kratzen.
* **Eigene Monsterstufen** (Monster wachsen mit der Gruppe): zu viel Umbau, und der Spieler könnte die Stärke nicht mehr ablesen (Klasse 1 bliebe nicht Klasse 1).

## 4. Umsetzung (wenn der Nutzer zustimmt)

1. `src/data/monster-scale.ts` (rein, ohne Zufall): `monsterScale(tier, level)`, die Zahlen (`RAMP_FROM`, `RAMP_LEVELS`, `FADE_AFTER`, `ZERO_TIERS`) in `RULES.v4` bzw. einer Datenzeile, **wie `TIER_ENTRY` / `TIER_EXIT` in
   `locks.ts`** (dieselben Bänder).
2. `sim/combat.ts` `monsterDamage`: `total = Math.round(total × S(monster.treasure_level, target.level))` direkt nach dem Wurf, vor Rüstung / Resistenz / Fee; Kommentar `BALANCE v4`; ein Zweig im Modus `legacy`
   (ohne Faktor, Rückweg). `tools/balance/formulas.ts` und `proposals.ts` (`makeV6` ist da) zeigen die Formel; `verify.ts` muss "OK" melden, `tests/unit/balanceV4.test.ts` bekommt Fälle für Stufe 1, 4, 7, 20.
3. `data/chest-traps.ts` `trapDamageFor(damage, level, tier)` mit demselben Faktor; die vier Aufrufer in `actions/handlers.ts` (Zeilen 239, 266, 618, 824) kennen die Klasse des Ortes (`trapLevel`, `tier`).
4. **Kein `GEN_VERSION`:** es ändert sich nur die Rechnung zur Spielzeit, keine Welt und kein Spielstand.
5. Die Anzeige "Identify Monster" (Schaden) und der Tooltip der Falle sollten den skalierten Wert nennen.
6. Danach `npx tsx tools/balance/verify.ts 5000` in beiden Modi, `npm test`.

## 5. Offene Fragen an den Nutzer

1. **Anlauf für alle Klassen oder nur für Klasse 1?** Der Anlauf auf 0,4 gilt in der Rechnung bei jeder Eintrittsstufe (Klasse 2 ab Stufe 5, Klasse 3 ab 11 ...). Das macht jeden Klassenwechsel sanfter,
   verändert aber den ganzen Spielverlauf. Vorschlag: zuerst **nur Klasse 1** (Parameter `rampTiers`).
2. **Auslauf für Klasse 2 (null bei Stufe 33) und höher?** Vorschlag: zuerst nur Klasse 1 (null bei Stufe 20); die Klasse 2 mit demselben Muster (Eintritt der Klasse 5 = Stufe 33) später.
3. **Ist "kein Schaden" bei Stufe 20 wirklich Null?** Dann kann eine Stufe-20-Gruppe Level-1-Hütten und -Dungeons gefahrlos leeren (XP und Beute sind dort klein, die Hüttenbeute ebenso). Wer das nicht will,
   lässt `S` bei 0,05 enden statt bei 0 (dann 1 Schaden bei hohen Würfen).
4. **Monstertabelle:** Candle Creep (70 → 45 Leben, 1 Angriff) und Wicked Witch (4–16 → 3–12) wie in 2.3?
5. **Fallen mit demselben Faktor** (2.2) und ebenso die Schlösser (sie haben schon ein Fenster)?

## 6. Nachrechnen

```
npx tsx tools/balance/l1curve.ts armor                          # Spielstand: Rüstung, Resistenzen, die 18 Level-1-Monster
npx tsx tools/balance/l1curve.ts pass                           # Schaden eines Treffers durch Rüstung X / Resistenz Y
GROUP=2 npx tsx tools/balance/l1curve.ts curve 100 v4           # Gruppe der Stufe L gegen Level-1-Gruppen (GROUP=3 für Dreiergruppen)
npx tsx tools/balance/l1curve.ts hit "v4;v6:rampFrom=0.4,rampLevels=3,fadeAfter=2,zeroTiers=3"
npx tsx tools/balance/l1curve.ts scale                          # Faktor S je Klasse und Stufe
npx tsx tools/balance/l1curve.ts traps "v6:rampFrom=0.4,rampLevels=3,fadeAfter=2,zeroTiers=3"
SAVE_FILE=tools/balance/out/save-2026-11-07.json BRIEF=1 npx tsx tools/balance/save.ts battery "v4;v6:rampFrom=0.4,rampLevels=3,fadeAfter=2,zeroTiers=3" 1 2 200 5
OVERRIDE="Candle Creep:health=45,no_of_attacks=1;Wicked Witch:damage_min=3,damage_max=12" GROUP=3 npx tsx tools/balance/l1curve.ts curve 100 "v6:rampFrom=0.4,rampLevels=3,fadeAfter=2,zeroTiers=3"
```

Der Formelsatz `v6` (`makeV6`, `scaleOf` in `tools/balance/proposals.ts`) ist nur im Werkzeug; das Spiel kennt ihn nicht.

## 7. Nachtrag: der Versuch des Nutzers (7. 11. 2026, im Spiel)

Der Nutzer hat statt des Stufenfensters (Abschnitt 2) zwei andere Regeln angeordnet, **im Spiel umgesetzt** (`monsterDamage` in `sim/combat.ts`, Zahlen `monsterArmorK` und `earlyMiss` in `RULES.v4` von `sim/balance.ts`, Kommentar `BALANCE v4`, im Modus `legacy` aus):

1. **Körperlicher Schaden bei Treffer** (Schlag und Fernschuss): `Rohschaden × 30 / (30 + Rüstung)` statt `Rohschaden − Rüstung`. Die Sonderregeln des Fernschusses (halbe Rüstung, Viertel-Boden) entfallen damit.
2. **Zusätzliche Fehlchance** der Monster gegen Helden der Stufe 1 / 2 / 3: **50 % / 30 % / 15 %** (jeder Angriff, auch Elementare und Fernschüsse, zusätzlich zur Trefferchance eines Schusses).

Messung (Werkzeug, Formelsatz `v4` = Spiel, vorher `v5:bowRes=1,bowDiv=1.5,bowAdj=0.5,eArmor=0.5,eFloor=0.25,eShots=2`; `l1curve.ts hit`, Ritter mit der Ausrüstung seiner Stufe, mittlerer Schaden je Monsterzug der 18 Level-1-Monster **einschließlich** der Fehlchance):

| Stufe | Rüstung | vorher | Versuch | | Stufe | Rüstung | vorher | Versuch |
|---|---|---|---|---|---|---|---|---|
| 1 | 15 | 3,5 | 4,4 | | 10 | 32 | 3,4 | 6,6 |
| 2 | 15 | 3,5 | 6,1 | | 15 | 43 | 2,8 | 5,7 |
| 3 | 15 | 3,5 | 7,4 | | 20 | 54 | 2,6 | 5,1 |
| 5 | 15 | 3,5 | 8,7 | | 25 | 54 | 2,6 | 5,1 |
| 7 | 32 | 3,4 | 6,6 | | | | | |

Kämpfe (`l1curve.ts curve`, Leben verloren im Mittel der 18 Arten, vorher → Versuch): 2er-Gruppen Stufe 1: 14 → **18 %**, Stufe 2: 8 → 12 %, Stufe 3: 4 → 6 %, Stufe 4: 2 → 5 %; 3er-Gruppen Stufe 1: 21 → **36 %**, Stufe 3: 9 → 17 %, Stufe 5: 3 → 6 %. Ab Stufe 7 bleibt der Verlust unter 2 %. Die Spielstand-Gruppe (Stufe 7/8, 2 × jede Art): 2 / 5 % → **4 / 9 %** (Bogen / Schwert); Zombie, Giant Spider und Skeleton, vorher 0 %, kosten jetzt 6 bis 25 %.

Lesart: Die Regel macht **keinen** Level-1-Monster mehr harmlos (auch auf Stufe 30 nicht: 5,1 je Zug, 17 bis 18 von 18 Arten verletzen) und **verdoppelt** den Schaden ab Stufe 2. Die zusätzliche Fehlchance gleicht nur Stufe 1 zum Teil aus (3,5 → 4,4 statt 8,7 ohne sie); auf Stufe 2 und 3 ist es schwerer als vorher, weil die körperlichen Monster (Giant Spider mit 8 Angriffen, Zombie, Skeleton) die Rüstung 15 bis 21 jetzt zum Teil durchdringen. Ein kleineres K hilft kaum (K 10: 3,7 / 5,2 / 6,3 auf Stufe 1 / 2 / 3), weil die 8 Elementaren (Rüstung wirkt dort nicht) ohnehin die Hälfte des Schadens liefern. Wer Stufe 1 bis 3 leichter will, braucht eine größere Fehlchance (etwa 65 / 50 / 35 %) oder das Stufenfenster aus Abschnitt 2.
