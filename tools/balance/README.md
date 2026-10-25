# Balance-Werkzeug (Kampf, Stufen, XP)

Rechnet große Mengen Kämpfe und Aufstiege durch, ohne das Spiel zu starten oder zu verändern. Es liest nur die Datentabellen und
`src/sim` des Spiels (Monster, Zauber, Klassen, Gegenstandsgenerator); geschrieben wird ausschließlich nach `tools/balance/out/`
(Zwischenstände, jederzeit neu erzeugbar). Die Ergebnisse und Vorschläge stehen in `docs/KAMPF_BALANCE.md`.

Alle Befehle laufen im Ordner `game/` mit `npx tsx tools/balance/<datei> ...`. Das Werkzeug ist absichtlich **nicht** in `package.json`
eingetragen (das Spiel bleibt unberührt).

## Was gerechnet wird

* **Formeln austauschbar** (`formulas.ts`): `CURRENT` ist eine Zeile-für-Zeile-Kopie der Spielformeln (Leben, Mana, Nahkampf, Fernkampf, Schaden der
  Monster, Sonderangriffe, XP-Tabelle, Trainingskosten, Maskottchen). Ein Vorschlag ist `{ ...CURRENT, ...Änderungen }` (`proposals.ts`).
  `parametric.ts` ist eine Formelfamilie um `CURRENT`, mit der `search.ts` nach Parametern sucht.
* **Kampfsimulator ohne Karte** (`fight.ts`): Die Gruppe sieht die Monster in einem Abstand, darf beim Anlaufen schießen oder zaubern (ein Zug für alle,
  dann laufen die Monster einen Schritt), danach handeln im Nahkampf alle Helden nacheinander nach Geschwindigkeit, dann die Monster. Zauber (Angriff,
  Heilung) kommen aus der Zaubertabelle des Spiels mit den echten Stufen, Kosten und Schaden; Maskottchen Wolf, Fee und Orb wirken wie im Spiel.
* **Helden und Ausrüstung** (`hero.ts`): zehn Klassen, fünf Rassen, Startattribute der Altspiel-Helden (sonst nach den Klassenvoraussetzungen),
  Attributwachstum mit der Stufe (Annahme, siehe unten), Ausrüstung aus dem echten Gegenstandsgenerator des Spiels (Material 1 bis 8, Ringe mit Vor- und Nachsilben).
* **Szenarien** (`scenario.ts`): Gruppe der Stufe L trifft Gruppen eines Tiers, viele Läufe, auf Wunsch mehrere Kämpfe hintereinander ohne Rast.
  Monstergruppen: `class` (Monster genau dieser Schwierigkeitsklasse `treasure_level`, Gruppengröße wie im Generator), `world` (die Gruppen, die der Generator
  in drei Beispielwelten wirklich gesetzt hat) oder `pool` (wie `pickMonster`).
* **Aufstieg** (`journey.ts`, `xpcurve.ts`, `xpfit.ts`, `supply.ts`): wie viele Kämpfe eine Stufe kostet, und wie viel XP und Gold die generierte Welt je Tier überhaupt hergibt.

## Stand der Formeln

**BALANCE v4 (25.10.2026): das Spiel rechnet seit dem mit den Formeln des Vorschlags `v4`** (`PROPOSALS.v4`, `makeV4` in `proposals.ts`; Schalter und Zahlen in `src/sim/balance.ts`, Umsetzung in `docs/BALANCE_V4_UMSETZUNG.md`). `CURRENT` ist damit der **alte** Stand (Modus `legacy` des Spiels) und die Vergleichsbasis aller Berichte („heute“). `verify.ts` folgt dem Modus des Spiels: `npx tsx tools/balance/verify.ts 5000` prüft `v4`, `… 5000 legacy` prüft `CURRENT`. Neu: `challenge.ts` (Herausforderung je Tier und Stufe, Paare mit `--cells=`), `weapons.ts`, `xpneed.ts`, `worldmix.ts`, `monlist.ts`; `BALANCE_EXCLUDE=Terminator` nimmt Monster aus den Klassenpools, `BALANCE_WEAPON=t5:57` setzt den mittleren Waffenschaden eines Ausrüstungsstands.

`CURRENT` bildet das Spiel **nach den Korrekturen aus `docs/KAMPF_BALANCE.md` 3.5** ab (Attribute und Resistenzen mit Ausrüstung, kein negativer Schlag, Fehlschuss ohne Schaden, Ringschaden auch im Fernkampf, halbe Chance für „Dead“/„Eradication“).
Die Berichte vor den Korrekturen liegen unverändert in `out/report-vor-korrektur/`; `out/report/` ist der neue Stand.

## Prüfung gegen das Spiel

* `verify.ts` vergleicht `CURRENT` mit den echten Funktionen (`recalcValues`, `meleeDamage`, `rangedDamage`, `monsterDamage`, `xpToNextLevel`) auf Tausenden
  zufälliger Helden, Ausrüstungen und Monster: muss „OK“ melden.
* `crosscheck.ts` lässt dieselben Helden und Gruppen durch die echte Kampfengine des Spiels und durch den Simulator laufen (Siegquote und Überlebende).

## Befehle

| Befehl | Zweck |
|---|---|
| `cli.ts grid [--party=0] [--levels=…] [--tiers=…] [--runs=80] [--chain=1] [--mascot=none\|Wolf\|Fairy\|Orb] [--gear=…] [--formulas=…]` | Raster Stufe × Tier (Siegquote, Helden am Boden, Tote, HP-Verlust, Runden) |
| `cli.ts compare --proposal=<Name>` | dasselbe Raster für Spiel und Vorschlag nebeneinander |
| `cli.ts power` | Leben, Mana, Nahkampf, Fernkampf, Zauber je Klasse und Stufe (ohne Würfel) |
| `cli.ts ranged` / `ranged-compare` | Nahkampfrunde gegen Bogensalve gegen Zauberrunde je Gruppe und Stufe |
| `cli.ts archetypes` | Nahkampf-, Fernkampf-, Zaubergruppen im Vergleich (Anteil Fernkampfschaden) |
| `cli.ts sens` | Empfindlichkeit gegen Annahmen (Attributwachstum, Ausrüstung, Abstand, Gang/Halle, kein Bogen, keine Zauber) |
| `cli.ts journey` / `journey-compare` | Kämpfe je Stufe, wenn die Gruppe immer im höchsten tragbaren Tier jagt (mit Gold) |
| `sweep.ts [Formeln] [Stufen] [Maskottchen] [Läufe]` | alle 715 Klassenkombinationen, CSV in `out/` und Streuung |
| `xpcurve.ts [Formeln…] [--bands=…]` | Stufe nach dem Räumen von x % der Tiers; Kämpfe je Stufe |
| `xpfit.ts [Kämpfe] [Bänder]` | glatte XP-Kurve an den Inhalt der Welt anpassen |
| `supply.ts [Seed] [Größe]` | XP, Gold und Monster je Tier einer generierten Welt (alle Orte werden erzeugt, Ergebnis zwischengespeichert) |
| `groups.ts` | was der Generator wirklich in ein Tier setzt |
| `monsterxp.ts` | Monster-XP gegen Monsterstärke (Ausreißer) |
| `search.ts <Name> [Schritte] [Läufe] [Bänder]` | Parameter der Formelfamilie suchen (Ergebnis in `out/search-<Name>.json`) |
| `inspect.ts <Suchname\|Vorschlag\|current>` | Zielwerte gegen Ergebnis, Zelle für Zelle |

## Annahmen, die man kennen muss

* **Attributwachstum:** Das Spiel hat keinen Automatismus (nur Schreine, Ringe, Tränke). Das Werkzeug lässt alle Attribute linear auf 40 bei Stufe 50 steigen
  (Hinweis des Nutzers: „im Schnitt 40 Glück bei Maximalstufe“). `--attr-to=` und `--attr-at=` ändern das, `--growth=none` schaltet es aus.
* **Ausrüstung:** „typisch“ für das Tier (Material 2 bis 6, Ringe der Stufe 1 bis 5 gewürfelt) und „beste“ des Tiers (Material 4 bis 8, die besten zwei Ringe von 40).
  Mehrere Würfe der Ausrüstung werden gemittelt (ein Ring der Ausdauer +50 allein ist 25 Lebenspunkte je Stufe wert).
* **Spielweise:** Abstand beim ersten Sehen 5 Felder, höchstens 3 Monster gleichzeitig im Nahkampf, Fokus auf das schwächste Monster, Heilzauber unter 40 % Leben,
  Angriffszauber nur wenn sie mehr bringen als die Waffe und höchstens ein Drittel des Manas kosten. Buffs, Schutzzauber und Zustandszauber sind nicht modelliert
  (das macht die Rechnung für die Gruppe eher etwas zu streng).
* **Nach jedem Kampf Rast** (Standard): Leben und Mana voll, Tote wieder da (die Zahl der Toten wird gezählt, der Preis des Tempels nicht). `--chain=N` rechnet N Kämpfe
  ohne Rast.
