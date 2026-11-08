# Was eine Welt verteilt: Übersicht der 12 Kombinationen

Stand 7. 11. 2026 (47. Playtest, Punkt 7), `GEN_VERSION` 55. Reine Auswertung, am Spiel ist dafür nichts geändert. Das Werkzeug: `npx tsx tools/dev/reward-survey.ts <Seed>` (Mittel aus den Seeds `table-47`, `table-48`, `table-49`; ein Lauf dauert etwa eine Minute).

## So ist gezählt

- **Je Partymitglied** (vier Helden): was die ganze Gruppe bekommt (Monster-XP, Schrein-XP, Orbs), zählt voll; was ein einzelner Held bekommt (ein Kelch, ein Attributspunkt, eine Münze in einer Maschine, eine Rolle), zählt ein Viertel. **Gold ist Gruppengold** (nicht geteilt); Zauberrollen stehen als Anzahl und je Mitglied.
- **Monster:** alle Gruppen und Bosse in allen Orten (Dungeons, Höhlen, Burgen, Städte; das Raumschiff einmal), alle wilden Gruppen der Überwelt und alle Hüttenmonster, jedes einmal besiegt (XP der Monstertabelle, bei Hüttenmonstern nach `hutXpPercent`; Gold = Monstergold). **Nicht gezählt:** Hinterhalte, das Auffüllen der Hütten jede Woche, Gegenstände, die Monster fallen lassen, die Wachen der Burgen (kommen nur mit dem Alarm), das Piratenschiff.
- **Hütten:** die Monster und das Niederbrennen (`hut_xp`, Gold 13 × Monstergold; 7 Gegenstände nicht gezählt).
- **Objekte:** alles, was Truhen, Fässer, Schätze, Schreine, Kelche, Brunnen und Rätselstatuen **selbst auslösen**, mit den echten Handlern (`resolveAction`) ausgewertet. Schlösser, Siegel und Alarme sind übersprungen, der Inhalt zählt voll (auch die Königstruhen mit 5 Mio Gold und die Schatzkammern hinter brüchigen Wänden). Temporäre Brunnen-Boni und das Gold der Arbeitsvermittler zählen nicht.
- **Quests:** was die Auftraggeber zahlen: 31 Orbs × 1 Mio XP **und** 1 Mio Gold (König), Silberschädel × 1’000 XP und Gold (Geizhals), Perlen × 100’000 XP und 50’000 Gold (Piratenkönigin). Die Münzen (je 3 freie Attributspunkte an der Maschine nach Wahl des Spielers) stehen in der Spalte „frei“.
- **Stufen (Kelche):** Stufenaufstiege einzelner Helden aus Kelchen; sie sind nicht in XP umgerechnet.
- Eine Zahl wie 18.8 „frei“ gilt ab Default gleich, weil 25 Münzen in jeder Welt ab Default im Spiel sind.

## XP je Partymitglied

| Welt | Dungeons | Orte | Monster in Orten | Wilde Monster | Hütten | Objekte | Quests | **Summe** |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| small | few | 22 | 122’324’330 | 14’610’958 | 3’557’186 | 501’875 | 32’801’333 | **173’795’681** |
| small | default | 27 | 152’808’871 | 15’386’700 | 3’591’088 | 503’125 | 32’906’667 | **205’196’451** |
| small | maximum | 32 | 166’161’101 | 15’728’445 | 3’581’916 | 504’875 | 32’143’333 | **218’119’670** |
| default | few | 87 | 666’928’187 | 82’375’140 | 3’635’951 | 514’750 | 32’981’667 | **786’435’695** |
| default | default | 122 | 814’247’709 | 76’527’067 | 3’635’532 | 522’375 | 33’015’000 | **927’947’682** |
| default | maximum | 157 | 1’160’607’731 | 88’002’277 | 3’635’951 | 527’500 | 33’015’000 | **1’285’788’459** |
| large | few | 172 | 1’470’711’894 | 193’769’797 | 3’635’891 | 541’125 | 33’015’000 | **1’701’673’707** |
| large | default | 246 | 2’144’531’709 | 228’854’746 | 3’635’891 | 560’125 | 33’015’000 | **2’410’597’470** |
| large | maximum | 322 | 3’054’101’975 | 243’692’884 | 3’635’891 | 577’750 | 33’015’000 | **3’335’023’500** |
| huge | few | 271 | 3’031’703’859 | 405’817’928 | 3’635’925 | 557’375 | 33’015’000 | **3’474’730’087** |
| huge | default | 393 | 4’792’784’791 | 421’926’345 | 3’635’925 | 582’500 | 33’015’000 | **5’251’944’562** |
| huge | maximum | 515 | 6’390’149’925 | 445’113’221 | 3’635’925 | 613’125 | 33’015’000 | **6’872’527’196** |

## Attribute, Resistenzen und Stufenaufstiege je Partymitglied

| Welt | Dungeons | STR | INT | PER | END | SPD | ACC | LCK | frei (Münzen) | Feuer | Eis | Säure | Magie | Stufen (Kelche) |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| small | few | 4.8 | 4.8 | 2.6 | 4.3 | 3.8 | 5.1 | 8.8 | 11.0 | 9.2 | 5.0 | 5.6 | 5.8 | 1.3 |
| small | default | 4.9 | 5.1 | 3.0 | 8.1 | 7.1 | 7.9 | 12.7 | 14.5 | 9.2 | 5.3 | 7.3 | 8.3 | 2.1 |
| small | maximum | 11.8 | 6.0 | 4.2 | 7.0 | 11.6 | 4.6 | 11.8 | 14.8 | 9.2 | 6.1 | 6.7 | 8.3 | 3.3 |
| default | few | 17.3 | 31.2 | 22.8 | 26.2 | 31.4 | 28.0 | 32.9 | 18.5 | 22.3 | 27.4 | 20.8 | 16.0 | 9.8 |
| default | default | 28.0 | 42.3 | 34.3 | 30.3 | 46.2 | 37.0 | 44.0 | 18.8 | 33.7 | 29.8 | 32.9 | 33.4 | 14.9 |
| default | maximum | 40.9 | 44.4 | 48.3 | 48.4 | 59.7 | 48.8 | 54.2 | 18.8 | 30.3 | 26.8 | 45.8 | 30.7 | 18.3 |
| large | few | 35.9 | 49.5 | 50.5 | 34.6 | 39.8 | 43.7 | 34.5 | 18.8 | 34.7 | 60.9 | 39.6 | 28.6 | 27.4 |
| large | default | 54.4 | 70.9 | 47.1 | 55.8 | 55.4 | 59.3 | 47.3 | 18.8 | 63.5 | 76.0 | 56.4 | 58.2 | 40.1 |
| large | maximum | 70.4 | 72.1 | 79.3 | 78.3 | 65.9 | 86.7 | 79.5 | 18.8 | 103.0 | 85.2 | 63.2 | 98.1 | 51.8 |
| huge | few | 61.8 | 63.1 | 55.8 | 43.6 | 56.5 | 36.6 | 57.3 | 18.8 | 86.2 | 66.0 | 73.2 | 60.0 | 38.3 |
| huge | default | 83.9 | 82.8 | 89.3 | 64.5 | 84.1 | 64.5 | 88.4 | 18.8 | 117.3 | 109.7 | 102.3 | 100.6 | 55.0 |
| huge | maximum | 95.7 | 114.8 | 115.6 | 94.4 | 102.3 | 93.8 | 102.3 | 18.8 | 136.8 | 135.3 | 120.7 | 142.4 | 75.4 |

## Gold (Gruppe) und Zauber

| Welt | Dungeons | Monster | Objekte und Hütten | Quests | **Summe Gold (Gruppe)** | Zauberrollen | je Mitglied |
|---|---|--:|--:|--:|--:|--:|--:|
| small | few | 3’722’731 | 37’730’117 | 31’901’333 | **73’354’181** | 146 | 36.5 |
| small | default | 4’924’105 | 40’898’623 | 31’956’667 | **77’779’395** | 146 | 36.5 |
| small | maximum | 6’345’516 | 44’151’693 | 31’243’333 | **81’740’542** | 146 | 36.5 |
| default | few | 25’985’437 | 91’277’981 | 31’998’333 | **149’261’752** | 146 | 36.5 |
| default | default | 30’980’818 | 118’608’454 | 32’015’000 | **181’604’273** | 146 | 36.5 |
| default | maximum | 42’161’036 | 148’759’020 | 32’015’000 | **222’935’056** | 146 | 36.5 |
| large | few | 61’057’765 | 178’873’797 | 32’015’000 | **271’946’561** | 146 | 36.5 |
| large | default | 88’265’894 | 250’352’071 | 32’015’000 | **370’632’966** | 146 | 36.5 |
| large | maximum | 123’442’145 | 330’473’767 | 32’015’000 | **485’930’912** | 146 | 36.5 |
| huge | few | 123’599’308 | 341’020’340 | 32’015’000 | **496’634’648** | 146 | 36.5 |
| huge | default | 186’517’691 | 472’622’686 | 32’015’000 | **691’155’377** | 146 | 36.5 |
| huge | maximum | 240’951’914 | 634’294’512 | 32’015’000 | **907’261’426** | 146 | 36.5 |

## Was auffällt

- **XP:** die Welt skaliert über die Monster fast linear mit der Zahl der Orte; die Quests (Orbs) sind eine feste Größe (~33 Mio) und fallen ab Default kaum noch ins Gewicht. Objekte geben nur etwa eine halbe Million XP.
- **Attribute und Resistenzen** wachsen mit der Zahl der Orte, nicht mit der Größe der Welt allein: „few“ in einer Large-Welt liegt in der Größenordnung von „maximum“ in einer Default-Welt.
- **Gold:** die Orte (Truhen, Endräume) bringen ein Mehrfaches der Monster; die Quests zählen nur 32 Mio.
- **Zauber:** 146 Rollen (jeder Zauber genau zweimal) in jeder der zwölf Welten, auch in der kleinen mit wenigen Dungeons.

---

# Vorschläge: die zwölf Welten angleichen

Stand 8. 11. 2026. **Nur Vorschläge, am Spiel ist nichts geändert.** Alle Zahlen sind aus den Tabellen oben gerechnet (Mittel der drei Seeds; die kleinen Welten schwanken stark, weil sie nur 22 bis 32 Orte haben, darum sind die Faktoren auf 5 % gerundet).

## Lesart der Vorgabe

- **Baseline** ist `default / default` (100 %). Jede Größe wird gegen die Summe dieser Welt gemessen (XP 927’947’682 je Mitglied, Gold 181’604’273, Attribute 262 Punkte, Resistenzen 130 Prozentpunkte, 14.9 Kelchstufen).
- **Grenzen 50 % und 400 %** gelten für den **Faktor**, mit dem eine Welt ihre Belohnung gegenüber der Rohsumme anpasst. Das Ergebnis liegt dann ebenfalls im Band: die Summen aller Welten bleiben in 50 % bis 400 % der Baseline (XP: 63 % bis 372 %). Der höhere obere Wert hat denselben Grund wie in der Vorgabe: In `huge / maximum` entdeckt man nicht alles, dort muss der Ausgleich nicht bis zur Baseline reichen.
- **Was nicht skaliert wird:** die Quests (Orbs, Schädel, Perlen: ~33 Mio XP und ~32 Mio Gold sind in jeder Welt gleich), die Schrein-XP und die **Hütten** (sie sind schon nach Weltgröße ausgeglichen, `hutXpPercent`, und liegen überall bei ~3.6 Mio XP). Skaliert werden die **Monster der Orte und der Überwelt** (XP, Gold) und die **Gaben der Orte** (Gold in Truhen, Punkte, Stufen).

## Die Regel

```
Faktor = clamp( (Baseline − fester Anteil) / skalierbarer Anteil , 0.5 , 4.0 )   gerundet auf 5 %
```

Der **Idealfaktor** bringt die Summe einer Welt genau auf die Baseline; die Grenzen kappen ihn. Weil die Summe fast linear mit der Zahl der Orte wächst, braucht eine kleine Welt ein Mehrfaches und eine große die Hälfte. Der Faktor hängt an `(Weltgröße, Dungeon-Dichte)`: zwölf Zahlen, beim Neuanlegen des Spiels bekannt (`GameState.size`, `GameState.dungeons`).

## XP (je Partymitglied)

| Welt | Dungeons | Orte | Roh (% der Baseline) | Idealfaktor | **Vorschlag** | Summe neu (Mio) | **neu (%)** |
|---|---|--:|--:|--:|--:|--:|--:|
| small | few | 22 | 18.7 | 6.51 | **400 %** | 585 | **63** |
| small | default | 27 | 22.1 | 5.30 | **400 %** | 710 | **77** |
| small | maximum | 32 | 23.5 | 4.90 | **400 %** | 764 | **82** |
| default | few | 87 | 84.8 | 1.19 | **120 %** | 936 | **101** |
| default | default | 122 | 100.0 | 1.00 | **100 %** | 928 | **100** |
| default | maximum | 157 | 138.6 | 0.71 | **70 %** | 911 | **98** |
| large | few | 172 | 183.4 | 0.54 | **55 %** | 953 | **103** |
| large | default | 246 | 259.8 | 0.38 | **50 %** | 1’224 | **132** |
| large | maximum | 322 | 359.4 | 0.27 | **50 %** | 1’686 | **182** |
| huge | few | 271 | 374.5 | 0.26 | **50 %** | 1’756 | **189** |
| huge | default | 393 | 566.0 | 0.17 | **50 %** | 2’645 | **285** |
| huge | maximum | 515 | 740.6 | 0.13 | **50 %** | 3’455 | **372** |

- Die Spanne der Summen schrumpft von **1 : 39.5** (18.7 % bis 740.6 %) auf **1 : 5.9** (63 % bis 372 %). Von `default / few` bis `large / few` liegt alles bei 98 % bis 103 %.
- Auf den kleinen Welten reicht der Faktor 4 nicht ganz bis zur Baseline (63 % bis 82 %); ein höherer Faktor wäre ein einzelner Kill mit dem Vierfachen der Tabelle, das ist die Grenze der Vorgabe. Auf `large / default` und größer hält die Untergrenze 50 % die Welt über der Baseline; wer dort 40 % erlauben würde, brächte `large / default` auf 106 % und `huge / maximum` auf 299 %.
- **Entdeckt man in `huge / maximum` nur die Hälfte der Orte**, bekommt man etwa 190 % der Baseline (372 % ÷ 2). Das ist der Spielraum, den die Vorgabe mit dem hohen Maximum lässt.
- **Ohne Tabelle** ginge `Faktor ≈ 122 / Zahl der Orte` (gekappt). Er trifft small und alle Welten ab `large / default` genau, liegt aber bei `default / few` +17 %, `default / maximum` +11 % und `large / few` +29 % daneben (die Orte höherer Stufen sind mehr XP wert). Die Tabelle ist genauer und billiger.

## Gold (Gruppe)

Dieselbe Regel; skaliert werden das Gold der Monster und das der Truhen, Schätze und Endräume. Die Königstruhen sind darin enthalten, Quests und Hütten-Niederbrennen nicht.

| Welt | Dungeons | Roh (%) | Idealfaktor | **Vorschlag** | **neu (%)** |
|---|---|--:|--:|--:|--:|
| small | few | 40.4 | 3.61 | **360 %** | **100** |
| small | default | 42.8 | 3.27 | **325 %** | **100** |
| small | maximum | 45.0 | 2.98 | **300 %** | **101** |
| default | few | 82.2 | 1.28 | **130 %** | **102** |
| default | default | 100.0 | 1.00 | **100 %** | **100** |
| default | maximum | 122.8 | 0.78 | **80 %** | **102** |
| large | few | 149.7 | 0.62 | **60 %** | **97** |
| large | default | 204.1 | 0.44 | **50 %** | **111** |
| large | maximum | 267.6 | 0.33 | **50 %** | **143** |
| huge | few | 273.5 | 0.32 | **50 %** | **146** |
| huge | default | 380.6 | 0.23 | **50 %** | **199** |
| huge | maximum | 499.6 | 0.17 | **50 %** | **259** |

Die Spanne schrumpft von 1 : 12.4 auf 1 : 2.7. Gold ist die einzige Größe, bei der die kleinen Welten mit dem Faktor unter 4 die Baseline erreichen (die Truhen der Orte bringen ein Mehrfaches der Monster, und ihre Zahl ist der Hebel).

## Attribute und Resistenzen

Die Punkte kommen aus **Quellen** mit festem Betrag je Stufe: Endraum-Pakete (nur Attribute, Stufe 1 bis 3: 5 / 10 / 20), Schatzkammern hinter brüchigen Wänden (`VAULT_PACKAGE` 5 / 10 / 20 / 40, die Resistenz ist doppelt so groß, also 10 / 20 / 40 / 80; eine Quelle in 10 % der Kammern), Schreine (Attribut +1, Resistenz `2 + Stufe`) und die Münzen (je 3 freie Punkte, unten). Die Summe wächst deshalb mit der Zahl der Orte.

| Welt | Dungeons | Attribute roh (%) | Resistenzen roh (%) | **Zielfaktor T** | Attribute neu (%) | Resistenzen neu (%) | Resistenz je Element neu (Mittel je Held) |
|---|---|--:|--:|--:|--:|--:|--:|
| small | few | 13.0 | 19.7 | **4.0** | **52** | **79** | 25.6 |
| small | default | 18.6 | 23.2 | **4.0** | **75** | **93** | 30.1 |
| small | maximum | 21.7 | 23.3 | **4.0** | **87** | **93** | 30.3 |
| default | few | 72.4 | 66.6 | **1.4** | **101** | **93** | 30.3 |
| default | default | 100.0 | 100.0 | **1.0** | **100** | **100** | 32.5 |
| default | maximum | 131.5 | 102.9 | **0.85** | **112** | **88** | 28.4 |
| large | few | 110.1 | 126.2 | **0.8** | **88** | **101** | 32.8 |
| large | default | 148.9 | 195.8 | **0.6** | **89** | **118** | 38.1 |
| large | maximum | 203.1 | 269.3 | **0.5** | **101** | **135** | 43.7 |
| huge | few | 143.0 | 219.9 | **0.6** | **86** | **132** | 42.8 |
| huge | default | 212.7 | 331.2 | **0.5** | **106** | **166** | 53.7 |
| huge | maximum | 274.3 | 412.3 | **0.5** | **137** | **206** | 66.9 |

(T ist ein gemeinsamer Wert für Attribute und Resistenzen; die Resistenzen entscheiden bei den großen Welten, die Attribute bei den kleinen.)

**Was die Mathematik sagt – der Betrag allein reicht nicht.** Um `small / few` auf die Untergrenze von 50 % zu heben, braucht es T = 3.85. Mit dem Betrag je Quelle allein wären das **20 / 40 statt 5 / 10 auf Stufe 1** und **80 / 160 auf Stufe 3**, und eine einzelne Resistenzgabe über 100 % ist wertlos. Mit 7 / 14 (T = 1.4) erreicht man auf den kleinen Welten nur 18 % bis 30 %. Darum zwei Hebel, die sich multiplizieren (T = g × c):

| Hebel | Was | Bereich |
|---|---|---|
| **g** – Betrag je Quelle | die Pakete der Endräume, die Beträge der Schatzkammern (`VAULT_PACKAGE`), der Schrein-Betrag | 1.0 bis **2.0** |
| **c** – Zahl der Quellen | Pakete je Endraum (`packages` [1, 2]), Chance einer Schatzkammer-Gabe (100 ‰), Schreine je Karte (`perMap` [0, 2]) | 0.5 bis **2.0** |

Daraus die Vorschläge: **small** g = 2.0, c = 2.0; **default / few** g = 1.4, c = 1 (hier gilt der Vorschlag 7 / 14); **ab `default / maximum`** T < 1, **bevorzugt über c** (Chance und Zahl der Quellen sinken, die Beträge bleiben ganze Punkte), nicht über g.

| Stufe der Gabe | heute Attribut / Resistenz | g = 1.4 | g = 2.0 |
|---|---|---|---|
| 1 | 5 / 10 | 7 / 14 | 10 / 20 |
| 2 | 10 / 20 | 14 / 28 | 20 / 40 |
| 3 | 20 / 40 | 28 / 56 | 40 / 80 |
| 4 (nur Schatzkammer in Orten der Stufe 5) | 40 / 80 | unverändert | unverändert |

Stufe 4 bleibt, wie sie ist: 80 % Resistenz sind schon fast Immunität, ein größerer Betrag verpufft. Der Schrein-Betrag 1 wird bei g = 2.0 zu 2.

**Fund am Rand:** Resistenzen haben im Code **keine Obergrenze** (`elementalDamage` rechnet `1 − Resistenz / 100`, ab 100 % ist der Schaden 0). Die Tabelle zeigt, dass `huge / default` und `huge / maximum` heute im Mittel bei **107 % bis 134 % je Element und Held** liegen, also jede Punktzahl darüber wertlos ist (die Verteilung ist gleichmäßig: `resistanceRecipient` gibt an den mit dem wenigsten Wert). Mit T = 0.5 sinkt das auf 54 % bis 67 %. **Das ist der Grund, warum die großen Welten T < 1 bekommen**, nicht eine Angleichung um ihrer selbst willen. Wer die großen Welten in Ruhe lassen will, nimmt dort T = 1 und erlaubt Resistenzen bis 100 % (bei `huge` verpufft dann trotzdem die Hälfte).

## Kelchstufen, Münzen, Zauber

- **Stufen aus Kelchen** (Endräume der Stufe 4, 1 bis 3 Kelche zu je einer Stufe, `END_LOOT[4].levelUps`): `small` hat 1.3 / 2.1 / 3.3 (9 % bis 22 % der Baseline), `huge / maximum` 75.4 (506 %). Vorschlag: **kleine Welten 2 Stufen je Kelch** (2.6 / 4.2 / 6.6, also 17 % bis 44 %), **`huge` 1 bis 2 Kelche** statt 1 bis 3 (`huge / maximum` etwa 380 %). Mehr als 2 Stufen je Kelch ist keine Gabe mehr, sondern ein Sprung über die Stufe des Ortes; die Stufen der kleinen Welten kommen ohnehin aus der XP, und die ist nach dem Faktor oben nicht mehr zu niedrig. Die 50 % für die Kelchstufen werden bewusst nicht erzwungen.
- **Münzen** (frei verteilbare Attributspunkte): in `small` 11.0 bis 14.8 gegen 18.8 ab Default, also 59 % bis 79 %: im Band, nichts zu tun.
- **Zauberrollen:** 146 in jeder Welt, bleibt (eine kleine Welt ist dichter, aber nicht ärmer an Zaubern).

## Alles zusammen: Parameter je Welt

| Welt | Dungeons | XP-Faktor (Monster) | Gold-Faktor | Attribute / Resistenzen T | Kelchstufen |
|---|---|--:|--:|--:|---|
| small | few | 400 % | 360 % | 4.0 (g 2 × c 2) | 2 je Kelch |
| small | default | 400 % | 325 % | 4.0 (g 2 × c 2) | 2 je Kelch |
| small | maximum | 400 % | 300 % | 4.0 (g 2 × c 2) | 2 je Kelch |
| default | few | 120 % | 130 % | 1.4 (g 1.4) | 1 |
| default | default | 100 % | 100 % | 1.0 | 1 |
| default | maximum | 70 % | 80 % | 0.85 (c) | 1 |
| large | few | 55 % | 60 % | 0.8 (c) | 1 |
| large | default | 50 % | 50 % | 0.6 (c) | 1 |
| large | maximum | 50 % | 50 % | 0.5 (c) | 1 |
| huge | few | 50 % | 50 % | 0.6 (c) | 1 bis 2 Kelche |
| huge | default | 50 % | 50 % | 0.5 (c) | 1 bis 2 Kelche |
| huge | maximum | 50 % | 50 % | 0.5 (c) | 1 bis 2 Kelche |

**Was zwingend ist** (Werte, die heute außerhalb von 50 % bis 400 % liegen): XP und Gold auf allen kleinen Welten, XP in `huge / default` und `huge / maximum`, Gold in `huge / maximum`, Attribute und Resistenzen auf den kleinen Welten, Resistenzen und Kelchstufen in `huge / maximum`. Die Kelchstufen der kleinen Welten bleiben auch mit 2 je Kelch unter 50 % (17 % bis 44 %), weil mehr keine Gabe mehr wäre (siehe oben). **Was Angleichung ist** (innerhalb des Bandes, aber weit von der Baseline): alles andere in der Tabelle; das kann man auch weglassen oder zur Hälfte machen, ohne die Grenzen zu verletzen.

## Wo es greifen würde (Hinweise für die Umsetzung)

- **XP:** `monsterXp` (`src/sim/encounter.ts`) multipliziert schon mit `MonsterInstance.xpPercent`; der Weltfaktor kommt dazu (neue Tabelle `REWARD_SCALE[size][density]`, etwa in `src/world/`). Hüttenmonster und Burgwachen tragen `xpPercent` schon (`hutXpPercent`, `100 / castle.scale`): dort **nicht doppelt** anwenden, also nur bei Monstern ohne gesetzten Wert. Zur Spielzeit angewendet, ändert es den Generator nicht: **kein `GEN_VERSION`**.
- **Gold:** das Monstergold zur Spielzeit; das Truhengold steht als Parameter `gold` in den Aktionen (`rewardsOf` in `actions/endRoom.ts`, Truhenregeln in `src/data/rules/*.json`). Wird es beim Erzeugen skaliert, braucht es `GEN_VERSION` und `golden:update`; zur Auflösung (Faktor im Kontext von `resolveAction`) nicht.
- **Punkte und Stufen:** Beträge in `END_LOOT`, `VAULT_PACKAGE` und im Parameter `amount` der Schreine (Regeln in `dungeon.json`, `cave.json`, `fortress.json`); die Zahl der Quellen (c) und die Kelche (`levelUps`) ändern den Generator: **`GEN_VERSION` erhöhen, `golden:update`**.
- **Alte Spielstände:** der Faktor folgt aus Größe und Dichte, die im Spielstand stehen; ein geladener Stand bekäme ihn also mitten im Spiel. Wer das nicht will, schreibt den Faktor beim Anlegen ins `GameState`.

## Zu prüfen, bevor es gebaut wird

1. **Frühe Stufen:** der Faktor 4 gilt für jeden Kill, auch in der Stufe 1. Das Stufenfenster in `docs/KAMPF_BALANCE_L1.md` und `tools/balance/l1curve.ts` ist für die XP der Tabelle gebaut; auf `small` käme die Gruppe mit weniger Kills auf die Stufen 2 und 3. Mit `l1curve.ts` die Kurve je Stufe (nicht nur die Summe) für `small / few` und `huge / maximum` nachrechnen.
2. **`tools/dev/reward-survey.ts`** liest die XP direkt aus `MONSTERS[id].xp`; es muss den Faktor mitrechnen, sonst zeigt eine neue Messung die alten Zahlen. Danach alle zwölf Zeilen neu messen (drei Seeds) und die Faktoren auf 5 % nachziehen: `small` ist mit 22 bis 32 Orten pro Seed sehr unruhig.
3. **Ein Spiel auf `small / few`:** vier Gruppen aus Monstern mit dem Vierfachen der XP fühlen sich anders an als vierzig; ob die Sprünge pro Kill gefallen, entscheidet der Playtest, nicht die Rechnung.
4. **Entscheidung für Sie:** (a) Hütten bleiben außen vor (empfohlen, ~0.4 % der Baseline); (b) T < 1 auf den großen Welten, mindestens für die Resistenzen; (c) Kelchstufen mit 2 je Kelch auf `small` und 1 bis 2 Kelche auf `huge`; (d) Tabelle oder Formel `122 / Orte` für den XP-Faktor.
