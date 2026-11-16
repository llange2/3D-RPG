# Was eine Welt verteilt

**Stand 16. 11. 2026 (`GEN_VERSION` 71).** Dieses Dokument hat drei Teile: (1) die **Rohwerte** der zwölf Kombinationen aus Weltgröße und Dungeon-Dichte (Messung vom 7. 11. 2026, 47. Playtest, `GEN_VERSION` 55; die Größenordnungen gelten weiter, die genauen Zahlen sind seitdem durch Inselstufen und wilde Monster etwas verschoben), (2) die **Umsetzung der Belohnungsfaktoren** (`bug_fix_59`: jede Welt zahlt die Summen der Default-Welt, Tabelle mit den aktuellen Faktoren) und (3) die **gleichmäßige Verteilung der wilden Monster** und das XP-Ziel von 850 Mio. Die früheren Vorschläge (Faktoren je Größe und Dichte) sind gelöscht, sie stehen in der Git-Historie. Das Werkzeug: `npx tsx tools/dev/reward-survey.ts <Seed>` (Mittel aus den Seeds `table-47`, `table-48`, `table-49`; ein Lauf dauert etwa eine Minute). Die Formeln der Faktoren stehen in `docs/FORMULAS_1.3.md` 7.6.

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

# Umsetzung in bug_fix_59 (14. 11. 2026, `GEN_VERSION` 67)

Entscheidung des Nutzers: **die Summen sind in jeder Weltgröße und in jedem Seed die der Default-Welt** (Gold, XP, Attribute, Resistenzen); die Auswahl „Dungeons“ ist aus dem Hauptmenü gestrichen (ein neues Spiel nimmt `default`, 0,75 der Höhlen und Dungeons). Die Faktoren werden **je Welt** gemessen (`src/actions/rewardMeasure.ts`, Formeln in `docs/FORMULAS_1.3.md` 7.6).

## 1. Stufen der Inseln (Generator)

Die Streuung des Roh-Golds kam aus der Aufteilung der weiteren Inseln auf Stufe 4 und 5 (Orte der Stufe 5 sind etwa sechsmal so viel wert). Seit `GEN_VERSION` 67 liegt die Grenze zwischen Stufe 4 und 5 dort, wo beide Stufen **etwa gleich viel Land** haben (`buildLayout`, Test `bugfix59.test.ts`); die Reihenfolge „je stärker, desto weiter von Starthaven“ bleibt. Default-Welt, Roh-Gold (Monster, Behälter, Endräume, Hütten, mit den Quests):

| | Gold gesamt roh (Mio) | XP roh (Mio je Held) |
|---|--:|--:|
| vorher (Seeds `table-47` bis `-51`) | 124 bis 174 | 509 bis 1 208 |
| nachher (Seeds `table-47` bis `-56`) | 144 bis 175 | 806 bis 1 204 |

Das Land allein glättet den Rest nicht (die Zahl der Orte, Berge und die Wahl der Monster streuen weiter); darum der Faktor je Welt.

## 2. Faktoren je Welt

Beim Anlegen eines Spiels vom Titel aus misst das Spiel die Welt (2 bis 9 Sekunden, hinter dem Ladebild), rechnet Gold-, XP-, Attribut-, Münz- und Resistenzfaktor aus und legt sie im Spielstand ab (`GameState.scale`; fehlt er, zahlt ein alter Stand nach den Tabellen). Ziele: **Gold 125 Mio mit den Quests** (Spanne 120 bis 130), **XP 850 Mio je Held** (seit 16. 11. 2026, vorher 950 Mio, siehe Abschnitt 3), **Attribute 190 Punkte je Held** (mit den Münzen), **Resistenzen 295 Punkte je Held** (alle vier Elemente); die drei letzten sind der Mittelwert von zehn Default-Welten (Seeds `table-47` bis `-56`).

Drei Seeds je Größe (`npx tsx tools/dev/reward-survey.ts table-47|48|49 small,default,large,huge default <Datei>`), Faktoren und danach gezahlte Summen. **Stand 16. 11. 2026, `GEN_VERSION` 71, XP-Ziel 850 Mio** (neu gemessen nach Abschnitt 3; die Zahlen vom 14. 11. 2026 hatten XP 950 Mio und die alte Verteilung der wilden Monster):

| Welt (Dungeons `default`) | Orte | Faktor Gold | Faktor XP | Faktor Attribut | Münze | Faktor Resistenz | Gold gezahlt (Mio) | XP je Held (Mio) | Attribute je Held | Resistenzen je Held |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| small | 26 bis 28 | 2,00 bis 2,78 | 5,1 bis 11,8 | 4 (Grenze) | 2,9 bis 4 (bis 12 Punkte) | 4 (Grenze) | 125,0 | 850 | 188 bis 190 | 168 bis 237 |
| default | 120 bis 123 | 0,75 bis 0,82 | 0,91 bis 1,11 | 0,95 bis 1,29 | 1 | 0,91 bis 1,36 | 125,0 bis 125,1 | 850 | 190 | 295 |
| large | 238 bis 257 | 0,34 bis 0,36 | 0,31 bis 0,36 | 0,40 bis 0,54 | 1 | 0,39 bis 0,45 | 124,9 bis 125,1 | 850 bis 851 | 190 | 295 |
| huge | 388 bis 403 | 0,20 bis 0,23 | 0,19 bis 0,21 | 0,30 bis 0,36 | 1 | 0,24 bis 0,26 | 124,9 bis 125,2 | 850 bis 851 | 190 | 295 |

- **Gold** liegt in jedem gemessenen Seed (zehn Default-Welten, drei je andere Größe) bei 125 Mio ± 0,2; die Spanne 120 bis 130 ist eingehalten (im Spiel kommen kleine Rundungen dazu, außerdem Gold aus Verkäufen, Arbeitsvermittlern und Monsterbeute, das hier nicht gezählt ist).
- **Kleine Welten:** wenige Quellen, darum greifen die Grenzen: ein einzelnes Geschenk wächst höchstens auf das Vierfache (`MAX_POINT_FACTOR`), die Münze auf 12 Punkte statt 3 (`MAX_COIN_FACTOR`), die 25 Münzen tragen den Rest. Die Resistenzen erreichen das Ziel in kleinen Welten nur zum Teil (60 % bis 100 %), die Attribute fast ganz.
- **XP auf kleinen Welten:** ein Kill gibt das Fünf- bis Zwölffache der Tabelle (Stand 16. 11. 2026); ob die Kurve der ersten Stufen dazu passt, ist nicht nachgerechnet (offen, Idee „Stufenfenster“ in `docs/FORMULAS_1.3.md` 10.5).
- **Nicht skaliert:** was die Quest-Geber zahlen (Orbs, Schädel, Perlen), der Heilbrunnen, die Stufenaufstiege der Kelche, die Zauberrollen (146 je Welt).
- Hütten: `hutXpPercent` (150 / 100 / 75 / 60 %) bleibt; der Weltfaktor kommt darauf, die Summe stimmt trotzdem.
- Training: 33,33 Mio je Held von L1 auf L100, **133,32 Mio für vier Helden** ohne Rabatt (`100 × L × (L + 1)`) gegen 125 Mio Gold: gewollt knapp, die Bank mit Zinsen und „Work for a week“ gleichen es aus.

## 3. Wilde Monster aller Stufen gleichmäßig (16. 11. 2026, `GEN_VERSION` 71)

**Anlass:** in `pearl-shore-794` (default, Dungeons `default`) waren 75 von 109 wilden Landmonstern der Stufe 5 Vulture Rocs (68,8 %), dazu 30 Jouster (27,5 %), die übrigen drei Monster zusammen 4 Stück. Der Roc hat 1 054 500 XP (Jouster 221 700, Black Knight 148 900). Ursache: `wayAt` ist die **Entfernung** zu Starthaven, und 69 % des L5-Landes liegen in der äußeren Hälfte dieser Entfernung; dort war der Roc (Skalenplatz 5710 unter allen Monstern der Stufe, auch denen ohne wilden Platz) das einzige Monster in Reichweite oder, jenseits seines Fensters, das nächste. Die Hütten sind unbeteiligt (es gibt keine auf Stufe 5). Auf den anderen Stufen war es ähnlich (acht Seeds, Land ohne Seemonster): Stufe 2 Dino Beetle 70 %, Stufe 3 Gargoyle 59 %, Stufe 1 und 4 zwischen 8 und 26 %. Auftrag des Nutzers: alle Stufen ausgleichen.

**Änderung** (`src/world/difficulty.ts` `pickWildMonster`, `spotShares`, `src/world/spawns.ts` `planOf`; gilt für alle fünf Stufen): `planOf` setzt zuerst alle Gruppen der Welt (Platz und Größe), dann ordnet `spotShares` die Gruppen **jeder Stufe nach ihrer Entfernung zu Starthaven** und gibt ihnen als Platz auf der Skala ihren **Rang** (0 bis 1000 in gleichen Schritten), und erst danach werden die Monster gewählt (eigener Zufallsstrom `wild-monsters`). Die wilden Monster der Stufe (nach XP, nur die mit „x“ im Blatt) stehen in der Mitte von n gleichen Teilen der Skala (`evenPlaces`; bei Stufe 5: 100, 300, 500, 700, 900). Jedes Monster bekommt so etwa 1/n der Gruppen; „je stärker, desto weiter von Starthaven“ bleibt (das schwächste am nächsten, das stärkste am weitesten). Ein Landanteil über alle Kacheln wurde zuerst probiert und verworfen: die Gruppen stehen nur auf offenem Boden, Berge und Wälder zählten mit, und Stufe 2 blieb bei 42 % Dino Beetle. Fenster (`WILD_WINDOW`), Gruppengrößen, Orte, Hütten und Seemonster sind unverändert; die Änderung betrifft den Generator (`GEN_VERSION` 71, `golden:update`).

**Messung** (Werkzeug `tools/dev/wild-stats.ts`, acht Seeds, Default-Welt, Land ohne Seemonster; Erwartung je Monster 1/n):

| Stufe | Monster (Anteil nachher) | vorher (größter Anteil) |
|---|---|---|
| 1 (n = 6, 232) | Cryo Spore 19,4 %, Candle Creep 18,1 %, Scorpia 17,7 %, Skeleton 15,1 %, Zombie 15,1 %, Wicked Witch 14,7 % | Cryo Spore 22,8 % bis Candle Creep 8,5 % |
| 2 (n = 3, 256) | Plasmoid 35,2 %, Mad Dwarf 32,8 %, Dino Beetle 32,0 % | Dino Beetle 70,3 % |
| 3 (n = 4, 354) | Fire Stalker 26,0 %, Gargoyle 25,1 %, Fire Lizard 24,9 %, Tree golem 24,0 % | Gargoyle 59,2 %, Tree golem 2,1 % |
| 4 (n = 6, 656) | Toxic worm 18,6 %, Death Snake 17,7 %, Paladin 16,6 %, Dinosaur 16,3 %, Cyclops 16,2 %, Major Demon 14,6 % | Toxic worm 26,1 %, Death Snake 8,2 % |
| 5 (n = 5, 789) | Vulture Roc 21,2 %, Vampire 20,8 %, Jouster 20,0 %, Werewolf 19,1 %, Black Knight 18,9 % | Vulture Roc 68,8 % (`pearl-shore-794`) |

Test: `tests/unit/wildEvenL5.test.ts` (alle Stufen, jedes Monster zwischen 0,6/n und 1,4/n), `playtest25.test.ts` (Stufen 1 und 2 auf den Rang umgestellt).

**Was das für die Belohnungen heißt:** der Roc gab fast die ganze wilde XP der Stufe 5, der Dino Beetle die der Stufe 2; ausgeglichen verteilt sich die XP auf die Monster nach ihrem Wert, und die starken sind seltener. Mittel aus `table-47` bis `-49`, Dungeons `default`, derselbe Generator vorher und nachher (Mio je Held):

| Welt | XP der wilden Monster vorher → nachher | XP roh ohne Quests vorher → nachher | Gold der Monster vorher → nachher |
|---|--:|--:|--:|
| small | 15,8 → 9,2 | 134 → 127 | 4,9 → 4,7 |
| default | 76,7 → 43,7 | 843 → 810 | 33,9 → 33,2 |
| large | 216,5 → 127,0 | 2 521 → 2 432 | 99,6 → 97,6 |
| huge | 372,4 → 226,0 | 4 233 → 4 087 | 167,3 → 163,8 |

Zehn Default-Welten (`table-47` bis `-56`, Dungeons `default`, XP roh mit den Quests): Mittel **851,5 Mio** (Spanne 674 bis 1 033) gegen **882,6 Mio** (692 bis 1 076) mit den alten Monstern bei demselben Generator; wilde XP 45,7 statt 76,8 Mio. Das Gold roh (151,6 gegen 152,3 Mio), die Attribute (185,8) und die Resistenzen (280,3) ändern sich durch die Monster nicht.

- **Neues XP-Ziel: 850 Mio je Held** (Entscheidung des Nutzers vom 16. 11. 2026, `REWARD_TARGETS.xp` in `rewardMeasure.ts`, vorher 950 Mio): der neue Mittelwert der zehn Default-Welten ist 851,5 Mio, gerundet 850. Gold 125 Mio, Attribute 190 und Resistenzen 295 sind unverändert (die Mittel der zehn Welten liegen heute bei 185,8 und 280,3, ohne dass die Monster etwas daran ändern: die Generatoränderungen seit `GEN_VERSION` 67 haben sie bewegt; nicht nachgezogen, nur XP war aufgetragen).
- **Was der Spieler merkt:** jeder Kill gibt mit dem Faktor etwas mehr als vorher (die Faktoren der Tabelle in Abschnitt 2 liegen bei Default 0,91 bis 1,11 statt 1,01 bis 1,25), die Summe der Welt ist um 100 Mio kleiner (850 statt 950). Ein Vulture Roc ist jetzt selten (20 % statt 69 % der wilden Gruppen auf Stufe 5), ein Black Knight oder Vampire häufiger; auf Stufe 2 und 3 stehen die schwächeren Monster (Plasmoid, Mad Dwarf, Fire Stalker) öfter.
- **Offen:** die Stufenkurve (`tools/balance/l1curve.ts`, `docs/FORMULAS_1.3.md` 10.5) ist für die XP der Tabelle gebaut; mit dem neuen Ziel und der neuen Verteilung der Stufe 1 nicht nachgerechnet.
