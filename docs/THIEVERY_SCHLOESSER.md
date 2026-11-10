# Thievery und Schlösser

Wann braucht eine Kiste oder Tür einen Dieb, und wie schwer ist das Schloss? Dieses Dokument hält die Regeln, die Werte und ihre Herleitung fest. Die Formel steht im Spiel in `src/data/locks.ts`, die Herleitung rechnet `tools/balance/thievery.ts --lever`.

## 1. Regeln

| Objekt | Probe | Härte (`LOCK_HARDNESS`) |
|---|---|---|
| Gewöhnliche Tür | keine | – |
| **Verschlossene Tür** (22 % der Dungeon-Türen, 32 % der Burgtüren, die Tresortür der Burg) | **leichte Probe**, dem Median-Ninja gelingt sie zu etwa 90 % | 0,39 (`door`) |
| Gitter, Fass, Brunnen, Pool, Kelch, Kristalle (alles ohne Schloss) | keine (es kann die Frage geben, wer trinkt oder hineingeht, das bleibt wie es war) | – |
| **Gewöhnliche Kiste** (`Chest`, `Noble chest`, `Iron chest`, `Sapphire chest`) | **Probe**, dem Median-Ninja gelingt sie zu etwa 70 %, dem Dieb zu etwa 90 % | 0,52 (`chest`) |
| **Königstruhe** der Burg (`lock: "code"`) | **schwere Probe**, dem Median-Ninja gelingt sie zu etwa 35 %, dem Dieb zu etwa 60 % | 0,76 (`king chest`) |
| Kisten der Quests (Schlüssel, Key Card, Orb), Kisten der Endräume, Schatzhaufen | keine, ihr Schloss ist die Quest | – |

Die Kisten in den Nischen der Burg (Alarm) tragen das Schloss der gewöhnlichen Kisten. Das Schloss kommt vor dem Alarm: wer es nicht knackt, löst ihn auch nicht aus.

**Ein Fehlschlag kostet etwas.** Bei jeder misslungenen Probe an einer Kiste oder Königstruhe löst der Versuchende mit **20 %** (`LOCK_FUMBLE_CHANCE`) die Falle der Kiste aus. Sie ist ein Feuer-, Eis- (nicht in Höhlen), Säure- oder Magiefall und läuft wie die Falle einer unverschlossenen Kiste (`springChestTrap`: Ausweichen über Glück, Elementarschutz, `trapDamageFor` mit der Heldenstufe). Die Kiste bleibt dabei zu, die Beute ändert sich nicht. Türen kennen keinen Fallenwurf. Vorher hieß ein Fehlschlag nur „nach ein paar Schritten nochmal“, ein 50-%-Schloss war also nur eine kleine Verzögerung.

## 2. Wie die Probe rechnet

`thieveryRoll` (`src/sim/character.ts`, Port von `get_thievery_roll_value`):

```
Skill = max(1, floor( ((Glück + Genauigkeit) / 2 + Thievery) × Stufe × 0,1 ))
Wurf  = gleichverteilt zwischen floor(Skill / 3) und Skill
```

Glück und Genauigkeit zählen mit Ausrüstung (`attr`). Thievery ist die Summe aus Klasse und Rasse und wächst nicht mit der Stufe (Dieb 30, Ninja 15, alle anderen 0; Elf und Zwerg +10, Gnom +5, Mensch 0, Ork −10). Die Stufe geht linear ein.

Die Probe macht **ein einziger Held: der aktive Held mit dem höchsten Skill** (`pickLock` in `handlers.ts`, Fall `treasure` und `door`; Dieb oder Ninja, sobald einer handeln kann, sonst der nächstbeste; bei Gleichstand der erste der Gruppe). Bis zum 10. 11. 2026 würfelte jeder aktive Held und der beste Wurf zählte; die Zielchancen gelten aber für den Ninja allein, vier Würfe gaben der Gruppe 5 bis 15 Punkte mehr. Der Wurf der Schlösser hat einen eigenen Zufallsstrom (`<uid>@lock`), die Beute der Kiste ändert sich also nicht. Die Versuchsnummer ist `state.steps * 7 + opened.size`: ein Fehlschlag gilt, bis die Gruppe einen Schritt gemacht hat, danach würfelt sie neu.

Die Chance eines Helden mit dem Skill S gegen die Schwierigkeit D ist `1,5 × (1 − D / S)` (zwischen 0 und 1). Nicht-Diebe haben trotzdem einen Skill: Glück und Genauigkeit stecken in jedem Helden, ein Ranger hat auf gleicher Stufe etwa 55 % des Skills eines Ninjas, ein Dieb etwa 130 %.

## 3. Die Schwierigkeit wächst mit der Stufe (Stufenhebel)

**Warum.** Der Skill wächst mit der Stufe, die Schwierigkeit war je Tier fest (1 / 9 / 23 / 42 / 83, geeicht auf die Stufe beim Eintritt ins Tier). Im Tier wächst der Skill des Ninjas aber um das 1,7- bis 2,1-fache, und der Wurf liegt zwischen `Skill / 3` und `Skill`: ab der Mitte des Tiers lag `Skill / 3` über der Schwierigkeit, die Chance war genau 100 %. Das Log des 40. Playtests (`.ignore/thief.jpg`): Ninja Stufe 10, Skill 52, Schloss 9, elf Versuche, elf Erfolge, der beste Wurf zwischen 20 und 51; auch die Türen (4 und 6, aus `=tier*2`) gingen immer auf.

**Wie.** Wie die Falle (`trapDamageFor`) rechnet das Schloss erst bei der Probe aus der Stufe der Gruppe. Der Generator legt nur fest, *dass* ein Schloss da ist (`difficulty` = 1, eine Marke) und welche Falle es für einen Fehlschlag hat (`lockTrap`, `trapDamage`, `trapLevel`):

```
L          = Ø Stufe der aktiven Helden, nach unten auf TIER_ENTRY[tier] geklemmt, nach oben auf TIER_EXIT[tier + 1] (Austritt des nächsten Tiers; Tier 5 unbegrenzt)
refSkill   = L × (3,8 + 0,055 × L)             // Skill des Median-Ninjas, Anpassung an den Simulator
ease       = min(1, 0,2 + 0,2 × L)             // Stufe 1 / 2 / 3: 0,4 / 0,6 / 0,8, ab Stufe 4: 1
Schwierigkeit = max(1, round(Härte × refSkill × ease × gear))   // gear = lockGear(L): 1 bis Stufe 10, 1,15 auf Stufe 11, 1,3 ab Stufe 12
```

* **Innerhalb eines Tiers bleibt die Chance gleich** (Ninja 67 bis 76 % an der Kiste, vorher 80 % → 100 %).
* **Das Tier zählt weiter**: Tiers sind die Stufenbänder des Kampfsimulators (`TIER_ENTRY` 1 / 5 / 11 / 19 / 33, `TIER_EXIT` 4 / 10 / 18 / 32 / 50). Wer unter dem Eintritt ankommt, bekommt das Schloss der Eintrittsstufe und scheitert öfter. **Wer das Tier überwachsen hat, findet ein weiter wachsendes Schloss, aber höchstens bis zum Austritt des nächsten Tiers** (seit dem 10. 11. 2026; vorher war die Stufe auf den eigenen `TIER_EXIT` geklemmt, siehe Abschnitt 5). Ein Tier-1-Schloss ist also nie härter als das Ende von Tier 2 (Stufe 10: Kiste 23, Tür 17).
* **Stufen 1 bis 3 sind leichter** (`lockEase`): Kisten der Stufe 1 haben Schwierigkeit 1, der Held mit einem Skill von 1 bis 4 öffnet sie fast immer (Median-Ninja 100 %, Gruppe ohne Dieb/Ninja 96 %); auf Stufe 3 sind es 89 % und 63 %.
* **Gruppenstufe** ist der Durchschnitt der Stufen der Helden, die handeln können (`lockPartyLevel`). Ein Neuling in einer erfahrenen Gruppe verschiebt sie kaum, und es gibt keinen Zirkelbezug (der beste Wurf bestimmt die Schwierigkeit nicht).

## 4. Herleitung (Simulator)

Aufruf: `npx tsx tools/balance/thievery.ts --lever [--chest=0.7 --king=0.35 --door=0.9]` (ohne `--lever` rechnet das Werkzeug wie früher die Tier-Tabellen aus; die Zahlen daraus gelten im Spiel nicht mehr).

* **Formel**: dieselbe wie `thieveryRoll`; die Chance rechnet der Simulator exakt und prüft sie gegen die echte Funktion (200 Helden mit 20 000 Würfen).
* **Helden**: alle zehn Klassen und fünf Rassen mit den Startattributen des Kampfsimulators (`hero.ts`), Attribute wachsen linear auf 40 bei Stufe 50 (Hinweis des Nutzers), typische Ausrüstung des Tiers (Ringe mit Glück und Genauigkeit zählen), zwölf Ausrüstungswürfe gemittelt.
* **Stufen je Tier** (Entwurfsbänder, `KAMPF_BALANCE.md` 4.1): L1 1 bis 4, L2 5 bis 10, L3 11 bis 18, L4 19 bis 32, L5 33 bis 50.
* **`refSkill` gegen den Median-Ninja** (Gnom-Ninja, Thievery 20): höchstens 7 % Abweichung ab Stufe 3 (`tests/unit/thievery.test.ts` prüft 8 %).
* **Härte**: das Werkzeug sucht je Art die Härte, bei der die Chance des Median-Ninjas, gemittelt über alle Stufen ab 4, am nächsten am Ziel liegt: 0,52 für 70 % (Kiste), 0,76 für 35 % (Königstruhe), 0,39 für 90 % (Tür) (Entscheidung des Nutzers: „Ninja ~70 %, Dieb ~90 %“).
* **Profile zum Vergleich**: Min (Ork-Druide), Kein Dieb (Gnom-Ranger), Ninja, Dieb, Max (Zwergen-Dieb) und drei Gruppen (ohne Dieb/Ninja, mit Ninja, mit Dieb).

### Erfolgschance bei Stufe Eintritt / Mitte / Austritt des Tiers

Gewöhnliche Kiste (Härte 0,52), L1 bis L5:

| Wer | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| Kein Dieb (Gnom-Ranger) | 53 / 24 / 4 % | 10 / 12 / 12 % | 21 / 25 / 25 % | 25 / 30 / 34 % | 31 / 36 / 40 % |
| Ninja (Gnom) | 100 / 89 / 76 % | 69 / 72 / 72 % | 75 / 76 / 74 % | 71 / 70 / 68 % | 70 / 68 / 67 % |
| Dieb (Gnom) | 100 / 100 / 94 % | 91 / 92 / 91 % | 92 / 91 / 90 % | 91 / 89 / 87 % | 89 / 87 / 85 % |
| Gruppe ohne Dieb/Ninja | 96 / 63 / 44 % | 38 / 41 / 45 % | 47 / 51 / 51 % | 46 / 53 / 61 % | 63 / 70 / 74 % |
| Gruppe mit Ninja | 100 / 95 / 87 % | 79 / 82 / 83 % | 86 / 87 / 86 % | 83 / 84 / 86 % | 86 / 87 / 88 % |

Königstruhe (Härte 0,76):

| Wer | L2 | L3 | L4 |
|---|---|---|---|
| Kein Dieb (Gnom-Ranger) | 0 % | 1 bis 2 % | 0 % |
| Ninja (Gnom) | 43 / 40 / 39 % | 41 / 41 / 39 % | 35 / 34 / 32 % |
| Dieb (Gnom) | 71 / 67 / 67 % | 66 / 64 / 63 % | 64 / 62 / 59 % |
| Gruppe ohne Dieb/Ninja | 2 % | 1 % | 1 bis 2 % |

Tür (Härte 0,39): Ninja 88 bis 93 %, Dieb 100 %, Gruppe ohne Dieb/Ninja 80 bis 95 %.

Man sieht drei Dinge:

1. **Die Chance bleibt innerhalb eines Tiers fast gleich**, der Ninja scheitert in jedem Tier an etwa jeder dritten Kiste.
2. **Ohne Dieb und Ninja scheitern Königstruhen praktisch immer, gewöhnliche Kisten etwa zur Hälfte.** Das fängt das Spiel über die Warnung in der Charaktererstellung ab. Mit 20 % Falle bei jedem Fehlschlag ist das jetzt spürbar.
3. **Nur auf den ersten Stufen ist es leicht**: Stufe 1 und 2 gelingt fast jeder Gruppe jede Kiste (Schwierigkeit 1 bzw. 2), danach kommt der Wert des Tiers.

## 5. Warnung bei der Charaktererstellung

Das Buch der Helden (`openRoster`, `src/ui/roster.ts`) fragt beim Verlassen („Close“ oder Esc), wenn die Gruppe weder Dieb noch Ninja hat (`hasLockpicker`, `src/sim/roster.ts`; gemeint ist jede Klasse mit Thievery über 0):

> You have created a group without a Thief/Ninja. You might face challenges cracking some locks in the game.

Mit „Accept“ geht der Dialog zu, mit „Back“ bleibt er offen. Der Dialog erscheint bei jedem Verlassen, solange die Gruppe so zusammengesetzt ist.

## 6. Wo es im Code liegt

| Was | Wo |
|---|---|
| Formel und Härten | `src/data/locks.ts` (`lockDifficulty`, `LOCK_HARDNESS`, `refSkill`, `lockEase`, `lockLevel`, `TIER_ENTRY`, `TIER_EXIT`, `LOCK_FUMBLE_CHANCE`, `hasOrdinaryLock`) |
| Schloss und Falle auf gewöhnliche Kisten setzen | `src/actions/rules.ts` (nach dem Fass-Fall, Parameter `difficulty` = 1 und `lockTrap`) |
| Burg: Königstruhen und Nischenkisten | `src/actions/castle.ts` |
| Fallendaten für Fehlschläge | `src/actions/lockTrap.ts` (`lockTrapParams`, eigener Zufallsstrom `lock-trap`) |
| Probe, Fehlschlag, Türen | `src/actions/handlers.ts` (`lockPartyLevel`, `pickLock`, `fumbleLock`, `springChestTrap` mit Parameter `fumbled`; Fälle `treasure` und `door`) |
| Texte des Fehlschlags | `src/data/chest-traps.ts` (`trapOpening` mit `fumbled`) |
| Türen im Regelwerk | `src/data/rules/dungeon.json`, `fortress.json` (`difficulty` 1, nur die Marke) |
| Warnung | `src/ui/roster.ts`, `UI.panel(…, { canDismiss })` in `src/ui/ui.ts` |
| Herleitung | `tools/balance/thievery.ts --lever` (`tools/balance/README.md`) |
| Test | `tests/unit/thievery.test.ts` (Zielchancen, Gleichbleiben im Tier, Stufen 1 bis 3, Türen, Falle bei Fehlschlag, Log-Ninja) |

Die Kampagne behält ihre eigenen Truhen (`min_thievery`, Wurf des gewählten Helden, Falle unter dem halben Wert); sie ist von den Werten oben nicht betroffen.

**Hinweis zu den Tabellen von Abschnitt 4:** sie stammen aus der Zeit, in der in der Gruppe der beste von mehreren Würfen zählte, und noch ohne `lockGear`. Aktuell zeigt `npx tsx tools/balance/thievery.ts --lever` die Zeilen mit einem Wurf je Gruppe und eine Zeile „Ninja mit Ring of the Thief“.

## 7. Werte ändern

Ändern sich Ausrüstung, Attribute oder die Formel der Probe, schlägt der erste Test von `thievery.test.ts` (Zielchancen) oder der Test zu `refSkill` fehl. Dann `npx tsx tools/balance/thievery.ts --lever` laufen lassen, den Abschnitt „Härte“ in `LOCK_HARDNESS` übernehmen und gegebenenfalls `refSkill` nachfitten (Tabelle „refSkill gegen den Skill des Median-Ninjas“). Eine geänderte Härte oder `refSkill` ändert nur die Probe zur Spielzeit (kein Generatorwert hängt daran, `GEN_VERSION` bleibt); eine geänderte Falle (`lockTrap`, `LOCK_FUMBLE_CHANCE` ist Spielzeit, die Falle selbst Generator) braucht `GEN_VERSION` und `golden:update`.

## 8. Auswertung des Journals vom 10. 11. 2026 (Ninja, Stufe 1 bis 10)

Quelle: `.ignore/mm3-saves-2026-11-10-06-16-23.json` (Seed `pearl-shore-794`, 84 Versuche, `tools/balance/read-journal.ts`). Die Chance je Versuch ist aus den Skills im Journal nachgerechnet.

| Bereich | Versuche | Gruppe erwartet | tatsächlich | Schloss | Ninja allein |
|---|---|---|---|---|---|
| Tier 1, Gruppenstufe 4 (im Band) | 13 Kisten | 83 % | 54 % (Pech) | 8 | 73 % |
| Tier 1, Gruppenstufe 5 bis 6 | 20 Kisten | 99 % | 100 % | **8** | 97 % |
| Tier 1, Gruppenstufe 8 bis 8,5 | 21 Kisten | 100 % | 100 % | **8** | 100 % |
| Tier 2, Gruppenstufe 10 (im Band) | 14 Kisten | 78 % | 93 % | 23 | 68 % |

**Befund.** Im Band stimmen die Zahlen (Ninja-Skill 15 / 22 / 32 / 36 / 43 bis 50 gegen `refSkill` 16 / 25 / 34 / 39 / 43). Der Fehler war die obere Klemme: die Gruppe blieb in Tier-1-Orten bis Stufe 8,5, das Schloss blieb auf Stufe 4 (Schwierigkeit 8) stehen, der Skill wuchs auf 32 und mehr, `Skill / 3` lag über dem Schloss, die Chance war 100 %. **Entscheidung des Nutzers: das Schloss wächst voll mit** (Faktor 1, keine obere Klemme): Ninja an der Kiste bei Stufe 5 bis 6 und 8 dann 73 % und 71 %, Gruppe 78 % und 77 %, das Gefühl von Stufe 4.

Der einzige Fehlschlag in Tier 2 kam, als Ninja und Wizard „Crazy“ waren: nur Ritter und Paladin würfelten (Skill 4 und 9 gegen 23). Das ist gewollt, ohne Dieb oder Ninja ist eine Kiste schwer.

**Nachtrag, zweites Journal vom 10. 11. 2026** (`.ignore/mm3-saves-2026-11-10-11-39-17.json`): ein Ninja der Stufe 46 mit den Attributen der Stufe 1 (Debug-Stufen ohne Attributswachstum und ohne Ausrüstung, Skill 216 statt etwa 290 des Median-Ninjas) bekam die Tür eines Tier-1-Orts nicht auf: ganz ohne obere Grenze war sie auf Stufe 46 gerechnet (Schwierigkeit 114, 71 % je Versuch, und der Wurf bleibt bis zum nächsten Schritt derselbe, 40 gleiche Fehlversuche). **Entscheidung: die obere Klemme sitzt am Austritt des nächsten Tiers** (`lockLevel`). Das lässt den Bereich des ersten Journals (Tier 1, Stufe 5 bis 10) unverändert, und ein Tier-1-Schloss ist für Stufe 46 jetzt Kiste 23 / Tür 17 (vorher 151 / 114). Ein ungerüsteter Ninja (74 % des Median-Skills) hat in jedem Tier an seinem Band die Chance von etwa 44 % an der Kiste, der Median-Ninja 70 %; darüber hinaus 100 %.

## 9. Auswertung des L13-Stands (Ring of the Thief, ein Wurf)

Quelle: `.ignore/mm3-saves-2026-11-10-15-22-42.json`. Seit der oberen Klemme am nächsten Tier (Abschnitt 8) gelangen alle 31 Versuche ab Gruppenstufe 10,5. Der Skill des Ninjas gegen `refSkill`: 0,93 bis 0,96 auf Stufe 4 bis 9 (keine Ringe, das Gefühl stimmte), 1,04 auf Stufe 10, 1,14 auf Stufe 11, **1,35 auf Stufe 12**: er trägt einen Ring of the Thief (+15 Genauigkeit, +15 Glück), das sind +15 im Term `(Glück + Genauigkeit) / 2 + Thievery`, ein Drittel des Skills. Der Simulator würfelt zwei zufällige Ringe, der Ring ist darin nicht enthalten. Dazu würfelten alle vier Helden, und der beste Wurf zählte (Ninja 82 bis 94 %, Gruppe 88 bis 99 %).

**Entscheidungen des Nutzers (10. 11. 2026):** (1) das Schloss zielt ab Stufe 10 auf den Ninja **mit** Ring (ca. 75 bis 80 %), ein Ninja ohne Ring hat dann etwa 50 %: `lockGear` hebt das Schloss auf 1,15 (Stufe 11) und 1,3 (ab Stufe 12), Stufe 1 bis 10 bleibt; (2) **nur der beste aktive Dieb würfelt**, nicht die Gruppe. Nachgerechnet mit dem Journal: Kiste Tier 3 Stufe 12 von 94 % auf 77 % (Schwierigkeit 28 auf 36), Kiste Tier 2 Stufe 11 etwa 71 %, Tür Tier 2 Stufe 11 etwa 90 %. Grenze der Daten: 31 Versuche, ein Ring; ob 1,3 für Stufe 20 bis 50 passt, zeigt erst ein späteres Journal (die beiden Zahlen stehen in `lockGear`).
