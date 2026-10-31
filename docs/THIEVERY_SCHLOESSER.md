# Thievery und Schlösser

Wann braucht eine Kiste einen Dieb, und wie schwer ist das Schloss? Dieses Dokument hält die Regeln, die Werte und ihre Herleitung fest. Die Werte stehen im Spiel in `src/data/locks.ts`, die Herleitung rechnet `tools/balance/thievery.ts`.

## 1. Regeln

| Objekt | Probe | Schwierigkeit (`difficulty`) |
|---|---|---|
| Gewöhnliche Tür, Gitter | keine | – |
| Fass, Brunnen, Pool, Kelch, Kristalle (alles ohne Schloss) | keine (es kann die Frage geben, wer trinkt oder hineingeht, das bleibt wie es war) | – |
| **Gewöhnliche Kiste** (`Chest`, `Noble chest`, `Iron chest`, `Sapphire chest`) | **einfache Probe**, gelingt einem Ninja beim Eintritt ins Tier zu 80 % | `CHEST_LOCK` |
| **Königstruhe** der Burg (`lock: "code"`) | **schwere Probe**, gelingt einem Ninja beim Eintritt ins Tier zu 50 % | `KING_CHEST_LOCK` |
| Kisten der Quests (Schlüssel, Key Card, Orb), Kisten der Endräume, Schatzhaufen | keine, ihr Schloss ist die Quest | – |

Die Kisten in den Nischen der Burg (Alarm) tragen das Schloss der gewöhnlichen Kisten. Das Schloss kommt vor dem Alarm: wer es nicht knackt, löst ihn auch nicht aus.

### Die Werte (nach Tier = Level des Dungeons, der Burg, der Stadt)

| Tier | Gewöhnliche Kiste | Königstruhe |
|---|---|---|
| L1 | 1 | – (2) |
| L2 | 9 | 13 |
| L3 | 23 | 33 |
| L4 | 42 | 60 |
| L5 | 83 | – (119) |

Burgen gibt es nur auf Orten der Stufen 2 bis 4. Die Werte in Klammern stehen nur der Vollständigkeit halber in der Tabelle.

## 2. Wie die Probe rechnet

`thieveryRoll` (`src/sim/character.ts`, Port von `get_thievery_roll_value`):

```
Skill = max(1, floor( ((Glück + Genauigkeit) / 2 + Thievery) × Stufe × 0,1 ))
Wurf  = gleichverteilt zwischen floor(Skill / 3) und Skill
```

Glück und Genauigkeit zählen mit Ausrüstung (`attr`). Thievery ist die Summe aus Klasse und Rasse und wächst nicht mit der Stufe (Dieb 30, Ninja 15, alle anderen 0; Elf und Zwerg +10, Gnom +5, Mensch 0, Ork −10). Die Stufe geht linear ein.

Die Probe zählt den **besten Wurf aller aktiven Helden** (`handlers.ts`, Fall `treasure`). Der Wurf der Schlösser hat einen eigenen Zufallsstrom (`<uid>@lock`), die Beute der Kiste ändert sich also nicht. Die Versuchsnummer ist `state.steps * 7 + opened.size`: ein Fehlschlag gilt, bis die Gruppe einen Schritt gemacht hat, danach würfelt sie neu. Die Meldung sagt das („Try again in a few steps“).

Nicht-Diebe haben trotzdem einen Skill: Glück und Genauigkeit stecken in jedem Helden. Ein Ranger hat auf gleicher Stufe etwa 55 % des Skills eines Diebs. Den Abstand machen die Schwellen: bei der schweren Probe liegt der Ranger bei 2 bis 6 %, der Ninja bei etwa 50 %, der Dieb bei etwa 75 %.

## 3. Herleitung (Simulator)

Aufruf: `npx tsx tools/balance/thievery.ts --anchor=entry --ref=ninja --hardref=ninja`

* **Formel**: dieselbe wie `thieveryRoll`; die Chance rechnet der Simulator exakt und prüft sie gegen die echte Funktion (200 Helden mit 20 000 Würfen, größte Abweichung im Rauschen).
* **Helden**: alle zehn Klassen und fünf Rassen mit den Startattributen des Kampfsimulators (`hero.ts`), Attribute wachsen linear auf 40 bei Stufe 50 (Hinweis des Nutzers), typische Ausrüstung des Tiers (Ringe mit Glück und Genauigkeit zählen), zwölf Ausrüstungswürfe gemittelt.
* **Stufen je Tier** (die Entwurfsbänder des Kampfsimulators, `KAMPF_BALANCE.md` 4.1): L1 1 bis 4, L2 5 bis 10, L3 11 bis 18, L4 19 bis 32, L5 33 bis 50. Der Anker der Probe ist der Eintritt (Stufe 1 / 5 / 11 / 19 / 33). `--anchor=mid` setzt sie in die Bandmitte.
* **Bezugsheld** (Entscheidung des Nutzers): ein Held mit Thievery 20, der Median der Ninjas (Gnom-Ninja, Klasse 15 + Rasse 5). Die Schwierigkeit ist die höchste ganze Zahl, bei der er beim Eintritt ins Tier die einfache Probe zu mindestens 80 % und die schwere zu mindestens 50 % schafft.
* **Profile zum Vergleich**: Min (Ork-Druide, Thievery −10), Kein Dieb (Median, Gnom-Ranger, +5), Ninja (+20), Dieb (Median, Gnom-Dieb, +35), Max (Zwergen-Dieb, +40) und drei Gruppen (ohne Dieb/Ninja, mit Ninja, mit Dieb).

### Erfolgschance beim Eintritt ins Tier / in der Bandmitte / am Bandende

Einfache Probe (gewöhnliche Kiste), je Tier L1 bis L5:

| Wer | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| Min (Ork-Druide) | 50 / 50 / 58 % | 0 / 0 / 7 % | 0 / 0 / 7 % | 2 / 17 / 56 % | 5 / 37 / 69 % |
| Kein Dieb (Gnom-Ranger) | 53 / 100 / 100 % | 27 / 77 / 92 % | 31 / 69 / 85 % | 40 / 78 / 97 % | 47 / 78 / 95 % |
| Ninja (Gnom) | 100 / 100 / 100 % | 82 / 100 / 100 % | 81 / 99 / 100 % | 80 / 100 / 100 % | 80 / 99 / 100 % |
| Dieb (Gnom) | 100 % | 100 % | 97 / 100 / 100 % | 98 / 100 / 100 % | 97 / 100 / 100 % |
| Gruppe ohne Dieb/Ninja | 96 / 100 / 100 % | 67 / 99 / 100 % | 60 / 95 / 100 % | 70 / 99 / 100 % | 83 / 99 / 100 % |

Schwere Probe (Königstruhe), L2 bis L4:

| Wer | L2 | L3 | L4 |
|---|---|---|---|
| Min (Ork-Druide) | 0 / 0 / 0 % | 0 / 0 / 0 % | 0 / 3 / 20 % |
| Kein Dieb (Gnom-Ranger) | 2 / 48 / 70 % | 4 / 35 / 58 % | 3 / 48 / 75 % |
| Ninja (Gnom) | 56 / 93 / 100 % | 53 / 82 / 93 % | 51 / 82 / 97 % |
| Dieb (Gnom) | 81 / 100 / 100 % | 75 / 96 / 100 % | 76 / 98 / 100 % |
| Gruppe ohne Dieb/Ninja | 16 / 85 / 97 % | 6 / 64 / 90 % | 12 / 81 / 98 % |

Man sieht zwei Dinge:

1. **Innerhalb eines Tiers wächst die Chance stark**, weil der Skill linear mit der Stufe steigt. Beim Eintritt ist die Probe knapp, in der Bandmitte für Ninja und Dieb fast sicher.
2. **Ohne Dieb und Ninja scheitert man an den Schlössern**, vor allem ein einzelner Held mit schlechten Werten. Das fängt das Spiel nicht über die Formel ab, sondern über die Warnung in der Charaktererstellung.

## 4. Warnung bei der Charaktererstellung

Das Buch der Helden (`openRoster`, `src/ui/roster.ts`) fragt beim Verlassen („Close“ oder Esc), wenn die Gruppe weder Dieb noch Ninja hat (`hasLockpicker`, `src/sim/roster.ts`; gemeint ist jede Klasse mit Thievery über 0):

> You have created a group without a Thief/Ninja. You might face challenges cracking some locks in the game.

Mit „Accept“ geht der Dialog zu, mit „Back“ bleibt er offen. Der Dialog erscheint bei jedem Verlassen, solange die Gruppe so zusammengesetzt ist.

## 5. Wo es im Code liegt

| Was | Wo |
|---|---|
| Werte | `src/data/locks.ts` (`CHEST_LOCK`, `KING_CHEST_LOCK`, `chestLock`, `kingChestLock`, `hasOrdinaryLock`) |
| Schloss auf gewöhnliche Kisten setzen | `src/actions/rules.ts` (nach dem Fass-Fall, Parameter `difficulty`) |
| Burg: Königstruhen und Nischenkisten | `src/actions/castle.ts` |
| Probe | `src/actions/handlers.ts`, Fall `treasure` |
| Warnung | `src/ui/roster.ts`, `UI.panel(…, { canDismiss })` in `src/ui/ui.ts` |
| Herleitung | `tools/balance/thievery.ts` (`tools/balance/README.md`) |
| Test | `tests/unit/thievery.test.ts` (rechnet beide Tabellen mit dem Simulator nach) |

Die Kampagne behält ihre eigenen Truhen (`min_thievery`, Wurf des gewählten Helden, Falle unter dem halben Wert); sie ist von den Werten oben nicht betroffen.

## 6. Werte ändern

Ändern sich Ausrüstung, Attribute oder die Formel der Probe, schlägt der erste Test von `thievery.test.ts` fehl. Dann `npx tsx tools/balance/thievery.ts --anchor=entry --ref=ninja --hardref=ninja` laufen lassen, Abschnitt 5 („Vorschlag“) in `locks.ts` übernehmen, `GEN_VERSION` erhöhen und `npm run golden:update` ausführen. Andere Entscheidungen gehen über Schalter: `--anchor=mid|exit|mean` (Stufe, für die das Ziel gilt), `--ref=` und `--hardref=` (Bezugsheld: `min`, `nothief`, `ninja`, `thief`, `max`, `party:nothief|ninja|thief`), `--easy=` und `--hard=` (Ziele), `--growth=none` (kein Attributwachstum).
