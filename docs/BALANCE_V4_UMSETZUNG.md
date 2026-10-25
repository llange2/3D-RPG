# Balance v4: Umsetzung im Spiel (25.10.2026)

Die Kampf-, Stufen- und Trainingsregeln des Vorschlags v4 (`docs/KAMPF_BALANCE.md`, Zusammenfassungstabelle; Messungen in `docs/KAMPF_BALANCE_V4.md`) sind im Spiel umgesetzt.
**Jede geänderte Stelle trägt im Code den Kommentar `BALANCE v4`**; die alte Fassung steht daneben als `LEGACY (balance v4)` bzw. als `legacy`-Zweig derselben Funktion.

```
grep -rn "BALANCE v4" src tools tests docs     # alle geänderten Stellen
grep -rn "LEGACY (balance v4)" src             # alle alten Formeln, die beim Clean-up fallen können
```

## Zurücksetzen und Nachändern

* **Zurücksetzen mit einer Zeile:** in `src/sim/balance.ts` `export const BALANCE = { mode: "v4" }` auf `"legacy"` setzen. Dann rechnet das Spiel wieder mit den alten Formeln (Leben, Nahkampf, Bogen, Wolf, Fee, Orb, Aufstiegstabelle, Training). Getestet: `npx tsx tools/balance/verify.ts 5000 legacy` und die Tests, die die alten Zahlen im Modus `legacy` prüfen (`legacyRules` in `tests/unit/sim.test.ts`, `playtest13.test.ts`, `combatFixes.test.ts`).
* **Nachändern:** alle Zahlen stehen in `RULES.v4` (`src/sim/balance.ts`): `healthFlat`, `meleeLevelDivisor`, `rangedClassShare`, `rangedHitFactor`, `wolfBelow`, `fairyReduction`, `orbSpellBonus`, `xpFactor`/`xpGrowth`/`xpGrowthUntil`/`xpGrowthAfter`, `trainingPerLevelSquared`. Danach `npx tsx tools/balance/verify.ts 5000` (muss „OK“ melden; das Werkzeug liest die gleichen Formeln aus `tools/balance/proposals.ts`, `makeV4`) und `tests/unit/balanceV4.test.ts` anpassen.
* **Beobachtungen aus dem Spiel** (zu schwer, zu leicht) gehören gegen die Simulation gelegt: `npx tsx tools/balance/challenge.ts --formulas=v4 --cells=1:1,1:10,2:10,2:20,3:20,3:30,4:30,4:40,5:40,5:50 --runs=300` (Erklärung im Kopf der Datei).

## Geänderte Stellen

| # | Datei und Funktion | Alt | Neu (v4) | Grund |
|---|---|---|---|---|
| 1 | `src/sim/balance.ts` (neu) | – | Schalter `BALANCE`, Zahlen `RULES`, Hilfen `healthFlat()`, `wolfBelow()`, `fairyReduction()`, `orbSpellBonus()`, `orbManaBonus()`, `xpStepV4()` | ein Ort für alle Zahlen und den Rückweg |
| 2 | `src/sim/character.ts`, `recalcValues` | `Leben = rund(Stufe × (AUS/2 + Klasse + Rasse))` | `… + 10` | Ein Magier hatte auf Stufe 1 nur 2 Lebenspunkte |
| 3 | `src/sim/character.ts`, `recalcValues` (Orb) | Orb: +20 % Zauberpunkte | Orb gibt keine Zauberpunkte mehr (`orbManaBonus()` = 0); `ORB_MANA_BONUS` bleibt für den Legacy-Modus | Orb wirkt jetzt als Zauberschaden (Nr. 9) |
| 4 | `src/sim/character.ts`, `xpToNextLevel` | `Basis × 2^(Stufe−1)` bis Stufe 10, danach 1'024'000 je Stufe | Summe von `xpStepV4`: `Basis × 2^(Stufe−1)` bis Stufe 18, danach je Stufe × 1,08, je Stufe auf ganze Punkte gerundet (26.10.2026 so festgelegt; die erste v4-Tabelle war `Basis × 25 × 1,25^(Stufe−1)`: `xpFactor: 25`, `xpGrowth: 1.25` in `RULES.v4` bringen sie zurück) | Die alte Tabelle wurde ab Stufe 11 flach |
| 5 | `src/sim/combat.ts`, `meleeDamage` | `aufrunden(Basis × Stufe + Waffe) − Rüstung` | `aufrunden(Waffe + Basis × Stufe / 3) − Rüstung`, danach `× (1 − res_physical)` des Monsters (Spalte des Monsterblatts, 0 bis 1), abgerundet, nie unter 0. Rage, Verteidigungshaltung und Rüstungsabzug bleiben an ihrer Stelle | Die Rüstung der Monster schluckte den Nahkampf; Terminator, Skelette, Geister sind jetzt nahkampfresistent |
| 6 | `src/sim/combat.ts`, `rangedDamage` | Trefferchance `GEN / (Tempo × Entfernung × 0,5)`; Klassenwert × 1 | Trefferchance `GEN / (Tempo × Entfernung)`; Klassenwert × 0,8 | Der Bogen war die stärkste Waffe des Spiels |
| 7 | `src/sim/combat.ts`, `elementalDamage` | Fee −20 (Konstante aus `constants.json`) | Fee −30 über `fairyReduction()`; die erzeugte `constants.json` bleibt unverändert | Fee soll auf Höhe von Wolf und Orb liegen |
| 8 | `src/campaign/engine.ts`, `trapDamageTo` | Fee −20 fest im Code | Fee −30 über `fairyReduction(20)` | Die Kampagnenfallen hatten ihre eigene 20 |
| 9 | `src/sim/spells.ts`, `attackDamage` und `castSpell` | – | Orb: Schaden von Angriffszaubern × 1,2 (abgerundet); `castSpell` gibt `party.mascot` weiter | Der Orb brachte mit +20 % Mana praktisch nichts |
| 10 | `src/sim/encounter.ts`, `WOLF_EXECUTE_BELOW`, `killIfDead` | Wolf tötet unter 90 % der Lebenspunkte | unter 10 % (`wolfBelow()`) | Bei 90 % war jeder Kampf ein Spaziergang |
| 11 | `src/sim/economy.ts`, `trainingCost` | `250 × Stufe` | `10 × Stufe²` (mit Verhandlungsrabatt wie bisher) | Formel aus der Quellenliste des Nutzers |
| 12 | `src/ui/panels.ts`, `MASCOTS` | feste Texte (90 %, 20 Punkte, 20 % Zauberpunkte) | Texte aus den Zahlen in `balance.ts` | Anzeige muss zu den Regeln passen |
| 13 | `tools/balance/` | `CURRENT` = altes Spiel | `verify.ts` prüft je nach Modus `PROPOSALS.v4` oder `CURRENT`; `xpStep` von `v4` ruft `xpStepV4` des Spiels | Werkzeug und Spiel müssen übereinstimmen |
| 14 | `tests/unit/` | – | `balanceV4.test.ts` (neu) prüft alles oben in beiden Modi; `sim.test.ts`, `combatFixes.test.ts`, `playtest13.test.ts`, `playtest14.test.ts` angepasst (alte Zahlen im Legacy-Modus, Trainingskosten ohne feste Summen) | |

**Nicht geändert:** Monsterschläge gegen Rüstung, Fehlschuss der Monster, Todesregel, Sonderangriffs-Chance, Mana, Zauber und Zaubertabelle, Monster-XP, `GEN_VERSION` (die Regeln ändern den Generator nicht).

## Erwartetes Verhalten (aus der Simulation, `docs/KAMPF_BALANCE_V4.md`)

Mittel über fünf Gruppen, Monster der Klasse t, typische Ausrüstung des Tiers: Tier 1 Stufe 1 10 % Lebenspunkteverlust je Kampf (0,08 Tote); Tier 2 Stufe 10 7 %; Tier 3 Stufe 20 3 %; Tier 4 Stufe 30 13 %; Tier 5 Stufe 40 46 %, Stufe 50 31 %, Stufe 60 22 %. Tier 5 ist auf den Stufen 40 und 50 also noch zu hart; der Terminator (Stufe 40: 35 % Sieg, Stufe 50: 99 %) ist für Helden der Stufe 60 keine besondere Herausforderung mehr. Die Nahkampfgruppe (Ritter, Barbar, Paladin, Kleriker) ist am schwächsten.

## Beobachtung: Goblins treffen im Fernkampf kaum (26.10.2026, Gruppe Stufe 1)

Geprüft mit `npx tsx tools/balance/goblin.ts`. **Kein Fehler in v4, sondern die Rüstungsregel für Monsterschläge, die „wie heute“ blieb** (`monsterDamage` in `sim/combat.ts`, unverändert seit der Korrektur 3.5):
* Der Goblin (physisch, Schaden 3–9, Tempo 15) trifft mit seinem Schuss ganz normal: Trefferchance `Tempo / (Tempo des Helden × Entfernung × 0,5)`, also 100 % auf ein Feld, 94 % auf zwei, 63 % auf drei, 38 % auf fünf beim Ritter.
* Der Schaden ist danach `Schaden − Rüstung − Rüstung/2` (Fernkampf), nie unter 0. Die Startrüstung der Helden: Ritter 11, Ninja 5, Bogenschütze 4, Druide 3. Der **Ritter nimmt 0 Schaden** (11 + 5 = 16 > 9), Ninja, Bogenschütze und Druide werden auf zwei Felder nur in 13 / 41 / 72 % der Schüsse verletzt (Mittel 0,2 / 0,8 / 2,2 Punkte), auf fünf Felder in 6 / 19 / 29 %.
* Früher (vor der Korrektur 3.5) richtete ein **Fehlschuss** vollen Schaden an; das ist weg, deshalb wirkt der Goblin seitdem viel harmloser. v4 hat daran nichts geändert (der Vorschlag mit „Mindestdurchschlag 50 %“ ist in der Tabelle des Nutzers als „wie heute“ gestrichen).
* Wenn Goblins (und alle anderen schwachen Schützen) wieder spürbar treffen sollen: Mindestschaden `max(½ × Schaden, Schaden − Rüstung)` für Monsterschläge (der Parameter `floorVsMonsters` 0,5 der Simulation, `v3x`), oder die Rüstung im Fernkampf nur einmal abziehen. Das ist eine Regeländerung und nicht gemacht.

## Offene Frage für das Clean-up

> **Es gibt noch die alten Kampfformeln im Code. Sollen diese beim Clean-up endgültig gelöscht werden?**

Beim Clean-up zur Finalisierung des Spiels ist diese Frage dem Nutzer zu stellen (nicht von selbst löschen). Löschen heißt: `BALANCE`, `isV4`, `setBalanceMode` und `RULES.legacy` in `src/sim/balance.ts`, alle `LEGACY (balance v4)`-Zweige in `character.ts`, `combat.ts`, `economy.ts`, `panels.ts`, `spells.ts`, `ORB_MANA_BONUS`, in `tools/balance/` `CURRENT`/`PARAM` und der Legacy-Zweig von `verify.ts`, sowie die Legacy-Tests (`legacyRules`, `inMode("legacy", …)`).
