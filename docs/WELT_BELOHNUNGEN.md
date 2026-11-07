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
