# Plan: zwei Versionen, „Classic“ und „Fantastic Islands“

Stand: 25. 11. 2026. **Status: Plan, nichts umgesetzt.** Die Befunde stammen aus dem Code von `main` (Commit `e5578c4a`). Die Entscheidungen des Nutzers vom 25. 11. 2026 (Abschnitt 8) sind eingearbeitet.

## 1. Ziel

Das Spiel gibt es in zwei Versionen, die der Nutzer **in den Optionen wechselt**:

- **Classic**: das Spiel, wie es heute ist. Es darf sich durch den Umbau in nichts ändern (Aussehen, Welt, Spielstände).
- **Fantastic Islands**: dieselbe Engine mit **eigenen oder anderen Assets** (Modelle, Texturen, Bilder, Töne), **zusätzlichen Monstern** und teilweise **anderen Monsternamen**. Derselbe Seed ergibt dieselbe Inselwelt (Inseln, Orte, Wege); welche Monster dort stehen, darf sich unterscheiden.

Ein Wechsel lädt das Spiel in der anderen Version neu (wie heute der Wechsel der Texturqualität). Die Spielstände der beiden Versionen sind **nicht kompatibel** (Fantastic hat Monster, die Classic nicht kennt) und deshalb getrennt. Es gibt **einen** Code, **eine** Generierung, **ein** Repository, **einen** Installer. Bugfixes gelten damit automatisch für beide.

## 2. Entscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| Aufbau | Ein Code, Asset-Pakete („Packs“) mit Rückfall auf Classic | kein doppelter Bugfix, Generierung und Golden-Tests bleiben unberührt |
| Kennungen | `classic`, `fantastic`; Anzeige „Classic“, „Fantastic Islands“ | |
| Ort der Classic-Assets | bleibt `public/assets/` | kein Verschieben im Git, Installer und Tests unverändert |
| Ort des Fantastic-Packs | `public/assets-packs/fantastic/`, nur **abweichende** Dateien | das Repository (Pack 1,57 GiB) wächst nur um das Neue |
| Auswahl | Einstellung `pack` (Standard `classic`), URL-Schalter `?pack=` für Tests und Werkzeuge | wie `?seed=` und `?size=` |
| Wechsel | Speichern, Neuladen, Titelbild der neuen Version | Texturen und Registries bleiben die ganze Sitzung im Speicher |
| Spielstände | getrennt je Version; die Schlüssel von Classic bleiben **unverändert** (Nutzer, 25. 11.) | Fantastic hat Monster, die Classic nicht kennt: die Stände sind nicht kompatibel |
| Erfolge | gemeinsame Liste (Nutzer, 25. 11.) | ein Profil des Spielers; die Erfolgsliste selbst bleibt in beiden Versionen gleich |
| Wechsel | jederzeit in den Optionen, das Spiel lädt danach neu (Nutzer, 25. 11.) | siehe 4.3 |
| Installer | am Anfang **ein** Installer mit beiden Versionen, Wechsel im Spiel (Nutzer, 25. 11.) | |
| Weltform | derselbe Seed = dieselbe Inselwelt (Nutzer, 25. 11.) | Inseln, Orte und Wege hängen nicht von der Version ab (Test in Phase 5) |
| Namen | Monsternamen können je Version abweichen; Ids bleiben gleich | Namen sind Anzeige (`def.name`), die Ids sind die Schlüssel |
| Inhalt | Phasen 1 bis 4 liefern Assets und Namen; **zusätzliche Monster** kommen in Phase 5, die zum Umfang gehört | Monster ändern die Generierung und brauchen eigene Golden-Werte |

## 3. Befunde im Code

- **Fast alle Dateizugriffe laufen durch eine Stelle:** `assetUrl()` (`src/render/assets.ts`) und `assetPath()` (`src/ui/dom.ts`, baut dieselbe URL noch einmal selbst). Zusammen rund 45 Aufrufe in 22 Dateien, alle in `render`, `ui`, `audio`, `game`. Die Schichten `core`, `world`, `interiors`, `actions`, `sim`, `campaign` kennen keine Dateien.
- **Vorbei an `assetUrl`:** `src/campaign/loader.ts:8` (`fetch(`${BASE_URL}assets/…`)`), `ui/dom.ts:81`, drei Stellen in `src/ui/style.css`, vermutlich `index.html` (prüfen).
- **Rückfall gibt es schon:** `TextureCache.get` lädt bei „Textures: high“ aus `hd/tex/` und fällt bei einem Fehler auf `tex/` zurück.
- **Die Modelle laufen über Registries:** `models.static.original.json` und `models.monsters.original.json` (`registryFile`, `fetchJson`, `game.ts:492`); jeder Eintrag trägt seinen Dateipfad.
- **Einiges ist zur Bauzeit eingebunden:** `src/data/tables.ts` und `item-tuning.ts` importieren die JSON-Tabellen (`raw/*.json`, `item-models.json`) ins Bündel; dazu kommen Tabellen in Code (`monster-models.ts`, `personas.ts`, `render/crystalLook.ts`, `render/lamps.ts`, `render/projectiles.ts`, `SHOWCASE_EXTRAS`). Was dort pro Version anders sein soll (Größe, Höhe, Licht), kann nicht einfach durch eine andere Datei ersetzt werden.
- **Der Neustart nach einer Optionsänderung ist fertig:** `Game.applySettings` → `reloadPage()` → `prepareReload()` (speichert, `markResume`) und `main.ts` liest die Einstellung vor der ersten Textur (`setTextureQuality(readSettings().textureQuality)`).
- **Reihenfolge in `main.ts`:** `preloadImages`, `preloadSpellIcons` und andere starten **vor** `setTextureQuality`. Die Pack-Wahl muss deshalb ganz an den Anfang von `main()`.
- **Spielstände:** feste Schlüssel in `src/game/state.ts` (`KEYS` = `mm3-seed-rpg:save:v1` usw., `NAMED_INDEX`, `namedKey`); `SaveFile` hat `seed`, `genVersion`, `state.size` …, aber keine Versionskennung.
- **Build:** `tools/assets/lib.ts` hat feste `OUT = public/assets` und `OLD = ../old_code/resources`; die Quellen des Nutzers liegen in `tools/assets/sources/*` (703 MB Modelle). Die Phasen sind einzelne Skripte (`assets:*`).
- **Installer:** `installer/build.mjs` nimmt `public/assets` als `extraResources` nach `web/assets` (mit `NOT_SHIPPED`); `main.mjs` liefert alles aus `resources/web`.

## 4. Zielarchitektur

### 4.1 Pack-Schicht (neues Modul ohne Babylon, z. B. `src/assets/pack.ts`)

- `PackId = "classic" | "fantastic"`, `PACKS` (Name, Ordner).
- `initPack(id)`: für `classic` nichts (kein Netzwerkzugriff, Verhalten wie heute). Für `fantastic` wird `assets-packs/fantastic/pack.json` geladen (Liste der Dateien, die das Pack liefert, plus Version).
- `resolveAsset(path)`: liegt `path` im Pack, dann `…/assets-packs/<id>/<path>`, sonst `…/assets/<path>`.
- `assetUrl`, `assetPath`, der Kampagnenlader und die CSS-Stellen gehen alle durch `resolveAsset`. Das Modul liegt so, dass `ui` es ohne Babylon importieren kann.
- Die Liste der Pack-Dateien macht Rückfall ohne 404-Suche möglich; ein Pack ändert nie eine Datei in `public/assets/`.

### 4.2 Regeln für die Packs

- **Zusammengehörendes liegt zusammen:** ein Bilderbogen und sein Register (`ui/items.json`, `ui/spells.json`, Portrait- und Effektbögen, `minimap.webp`, `terrain/flat/tiles.json`) kommen nur beide oder keiner aus dem Pack. Ein Test prüft das.
- **Hohe Texturen:** ersetzt ein Pack `tex/X`, muss es `hd/tex/X` mitliefern, falls Classic eines hat. Sonst zeigte „Textures: high“ die alte HD-Textur unter der neuen normalen. Auch das prüft ein Test.
- **Registries werden gemischt:** die Registry des Packs enthält nur geänderte oder neue Einträge und wird über die von Classic gelegt (`{ ...classic, ...pack }`). Neue Modelle bekommen so neue Ids, ohne die alten zu berühren.
- **Tabellen pro Version:** was an den Modellen hängt (Größe, Höhe, Licht, Blickrichtung) bleibt für Classic **unverändert in Code und Daten**. Das Pack liefert nur Abweichungen (Datei `tuning.json` im Pack, zur Laufzeit geladen). Welche Tabellen das betrifft, klärt die Bestandsaufnahme in Phase 3.
- **Blickrichtung neuer Modelle nie raten** (Regel aus `CLAUDE.md`): `npm run sheet:monsters` bzw. Screenshot.

### 4.3 Auswahl und Wechsel

- `Settings.pack` (`src/game/settings.ts`, Standard `classic`, unbekannte Werte werden zu `classic`). Die Einstellung gehört nicht zu den Stufen Low/Medium/High (`quality.ts`).
- `main.ts`: **als Erstes** `initPack(params.get("pack") ?? readSettings().pack)`, dann alles andere. Der URL-Schalter gilt nur für diese Sitzung und wird nicht gespeichert.
- Optionsdialog (`game.ts` um Zeile 5776): ein Schalter „Version: Classic / Fantastic Islands“, auch im laufenden Spiel. Bei einer Änderung sagt der Dialog vorher, dass das Spiel neu lädt, dass die Spielstände der beiden Versionen nicht kompatibel sind und dass der Stand der laufenden Version in dieser Version gespeichert wird.
- Wechsel in `applySettings`: Einstellung schreiben, laufendes Spiel in den Autosave der **alten** Version speichern, `location.reload()`. Anders als bei der Texturqualität **ohne** `markResume`: die neue Version beginnt mit ihrem Titelbild, „Continue“ bietet ihren eigenen Stand an.
- Beim Wechsel zurück findet „Continue“ den gespeicherten Stand der ersten Version wieder; nichts wird übertragen oder umgewandelt.
- Das Titelbild (`ui/title.webp`) und das Logo sind Assets und können im Pack stehen; zusätzlich zeigt das Titelbild die Version als Text.

### 4.4 Spielstände

- Classic behält alle Schlüssel (`mm3-seed-rpg:save:v1`, `:quicksave:v1`, `campaign:*`, `named:*`). Fantastic bekommt ein Präfix (`mm3-seed-rpg:fantastic:…`), erzeugt durch eine Funktion `packKey(base)` in `state.ts`; `KEYS`, `NAMED_INDEX`, `namedKey` und `splitLegacySaves` laufen darüber.
- `SaveFile.pack?: PackId` (fehlt = `classic`). Die Listen („Load“, benannte Stände) zeigen nur Stände der aktiven Version. Ein Stand einer anderen Version (Import) wird **abgelehnt** mit dem Hinweis, in welcher Version er läuft; er wird nicht umgewandelt.
- Einstellungen (`settings:v1`) und Erfolge (`achievements:v1`) bleiben **gemeinsam**. Das setzt voraus: die Erfolgsliste ist in beiden Versionen gleich, und jeder Erfolg hängt an Ids, die es in beiden gibt (Prüfung in Phase 5, wenn Monster dazukommen; ein Erfolg, der ein neues Monster nennt, gibt es nicht).
- `GEN_VERSION` und die Golden-Werte ändern sich in den Phasen 1 bis 4 nicht, weil nichts in der Generierung berührt wird.

### 4.5 Build-Pipeline

- `tools/assets/lib.ts`: Schalter `--pack <id>` setzt `OUT = public/assets-packs/<id>` und `SOURCES = tools/assets/sources-packs/<id>`; ohne Schalter bleibt alles wie heute.
- Ein Pack hat **nur eigene Quellen** (kein `../old_code`). Jede Phase (`build-models`, `build-textures`, `build-hd-textures`, `build-item-icons`, `build-fx`, `build-audio` …) erzeugt nur, wofür das Pack eine Quelle hat.
- Neu: `tools/assets/build-pack.ts` schreibt `pack.json` (Dateiliste, Größen, Version) und prüft die Regeln aus 4.2.
- Generierte Dateien nicht von Hand ändern (Regel aus `CLAUDE.md` gilt für `public/assets-packs/**` genauso).

### 4.6 Namen und zusätzliche Monster

- **Namen (Phase 3, nur Anzeige):** das Pack kann `names.json` mitliefern (`{ "<Monster-Id>": "Name" }`). Die Anzeige (`def.name` in `sim/encounter.ts` und überall, wo ein Name erscheint: Protokoll, Hover-Texte, Kampfansicht, Showcase) liest den Namen über eine Funktion, die zuerst im Pack sucht. **Ids, Schlüssel und Tabellen bleiben gleich**; kein Code schlägt etwas anhand eines Namens nach (Bestandsaufnahme in Phase 3: Suche nach `.name` als Schlüssel). Texte, die einen Monsternamen enthalten (Rätsel, Gerüchte, Quests), brauchen dieselbe Prüfung.
- **Zusätzliche Monster (Phase 5):** neue Ids werden **hinten an die Tabelle angehängt**, nie dazwischen (die Reihenfolge kann in Ziehungen eingehen). Classic liest seine Tabellen unverändert; Fantastic liest Classic plus Erweiterung.
- **Ruleset:** die Version wird als Parameter `ruleset` (`classic` | `fantastic`) in die Weltgenerierung gereicht und gehört wie `size` und `dungeons` zur Weltidentität (`SaveFile.state`). Der Pfad von Classic bleibt **bytegleich**: der bestehende Golden-Test ändert sich durch Fantastic nie. Fantastic bekommt eigene Golden-Werte.
- **Weltform gleich:** Inseln, Orte und Wege dürfen nicht davon abhängen, welche Monster es gibt. Wo die Auswahl eines Monsters aus einer gewichteten Liste zieht, ergibt eine längere Liste andere Monster, aber **dieselben Ziehungen für alles andere**; jede Ziehung eines Ortes kommt aus ihrem eigenen abgeleiteten Strom (`derive`), nie aus einem gemeinsamen. Ein Test vergleicht für mehrere Seeds die Weltform (Gelände, Orte, Wege) beider Rulesets und verlangt Gleichheit.
- **Werte der neuen Monster:** wie bei den alten aus einer Tabelle des Nutzers (Classic: `docs/RPG_0.1.xlsx`, `npm run data:monsters`). Ob dafür eine eigene Tabelle oder zusätzliche Zeilen dienen, legt der Nutzer in Phase 5 fest. Balance (`docs/FORMULAS_1.3.md`, `tools/balance/*`) und das Showcase-Level müssen die neuen Monster mitnehmen.
- **Versionszähler:** ändert sich nur die Erweiterung von Fantastic, bleibt Classic unberührt. Ob dafür ein eigener Zähler neben `GEN_VERSION` nötig ist, wird zu Beginn von Phase 5 entschieden (Ziel: ein Fantastic-Fix zwingt Classic nie zu neuen Golden-Werten).

### 4.7 Release

- `installer/build.mjs`: zweiter Eintrag in `extraResources` (`public/assets-packs` → `web/assets-packs`), `NOT_SHIPPED` und `docs/RELEASE.md` ergänzen. `main.mjs` braucht keine Änderung (liefert alles aus `resources/web`); Bereichsanfragen für Audio und Video gelten für das Pack mit.
- **Ein Installer mit beiden Versionen** (Entscheidung des Nutzers), Wechsel in den Optionen. Die Größe des Packs bestimmt, ob das tragbar ist; wird es zu groß, ist ein zweiter Installer der Rückweg, ohne am Aufbau etwas zu ändern.

## 5. Phasen

Jede Phase ist für sich fertig und lässt Classic unverändert.

**Phase 0: Entscheidungen** (Abschnitt 8): erledigt am 25. 11. 2026, eine Frage ist noch offen (Abschnitt 8, Frage A).

**Phase 1: Pack-Schicht ohne neuen Inhalt** (klein bis mittel)
- Modul `pack.ts`, `assetUrl`/`assetPath`/Kampagnenlader/CSS darauf umstellen, `initPack` am Anfang von `main()`, Einstellung `pack`, `?pack=`.
- Ein Fantastic-Pack mit **einer** geänderten Textur und einer Registry-Änderung als Beweis.
- Abnahme: `npm run typecheck`, `npm test`, `npm run check:render`; Classic-Screenshots vor und nach dem Umbau gleich; mit `?pack=fantastic` ist die eine Textur zu sehen, alles andere wie Classic.

**Phase 2: Schalter in den Optionen und Spielstände** (mittel)
- Optionsdialog, Wechsel mit Neuladen, `packKey`, `SaveFile.pack`, Titelbild zeigt die Version.
- Abnahme: Prüfskript `tools/dev/check-pack-switch.ts` (Wechsel hin und zurück, jede Version findet nur ihren Stand, Classic-Stände aus der Zeit vor dem Umbau laden unverändert, Wechsel mitten im Spiel speichert in der alten Version).

**Phase 3: Pipeline und Tabellen pro Version** (mittel bis groß, hängt vom Inhalt des Packs ab)
- `--pack` in `lib.ts` und den Skripten, `build-pack.ts`, Registry-Mischung, `tuning.json` für Größe, Höhe, Licht.
- Namen pro Version (`names.json`, Abschnitt 4.6) mit der Prüfung, dass kein Code nach einem Namen sucht.
- Bestandsaufnahme: welche Tabellen (Abschnitt 3, „zur Bauzeit eingebunden“) müssen pro Version abweichen können?
- Showcase-Level: zeigt jedes Modell **der aktiven Version** (Regel aus `CLAUDE.md`); `tests/unit/showcase.test.ts` läuft für beide.
- Abnahme: `tests/unit/assets.test.ts` prüft für das Pack die Regeln aus 4.2; `check:render` mit `PACK=fantastic`.

**Phase 4: Release** (klein)
- Installer, `NOT_SHIPPED`, `docs/RELEASE.md`, `tools/dev/check-desktop.ts` mit beiden Versionen.

**Phase 5: zusätzliche Monster in Fantastic Islands** (groß; vor Beginn ein eigenes Teilkonzept im Anschluss an Abschnitt 4.6)
- `ruleset` in der Weltgenerierung und in `SaveFile.state`, Erweiterungstabelle (neue Ids hinten angehängt), Werte der neuen Monster, Modelle und Töne im Pack, Balance, Showcase.
- Abnahme: der Golden-Test von Classic ist **unverändert grün**; neue Golden-Werte für Fantastic; Test „gleiche Weltform bei gleichem Seed“; `npm run balance`-Werkzeuge mit den neuen Monstern; `check:chrome` für beide Rulesets.
- Reihenfolge: Phase 5 kann schon nach Phase 2 beginnen, weil sie nicht an der Pipeline hängt; die Modelle der neuen Monster brauchen aber Phase 3.

## 6. Tests und Prüfungen

- `tests/unit/pack.test.ts` (neu): `resolveAsset` (Classic = alter Pfad, Pack-Datei, Rückfall), Auflösung der Registries, `packKey` (Classic-Schlüssel unverändert), Einstellungen mit unbekanntem `pack`.
- `tests/unit/assets.test.ts`: Größenbudget und Texturregeln gelten für Classic wie bisher, für das Pack eigene Regeln (Abschnitt 4.2) und ein eigenes Budget.
- Die Prüfskripte in `tools/dev/` (`play.ts`, `shot.ts`, `check-render.ts`) nehmen `PACK=<id>` und hängen `?pack=` an die URL.
- Golden-Test und `check:chrome` bleiben in den Phasen 1 bis 4 unverändert (die Generierung wird nicht berührt). In Phase 5 kommen Golden-Werte und ein Weltform-Vergleich für Fantastic dazu.
- `tests/unit/names.test.ts` (neu, Phase 3): jede Id im Namensverzeichnis eines Packs gibt es in der Monstertabelle.

## 7. Risiken

| Risiko | Gegenmittel |
|---|---|
| Größe des Repositories (1,57 GiB) | Pack nur mit Abweichungen; vorher klären, ob Git LFS für `assets-packs/` sinnvoll ist |
| Ein Zugriff am Resolver vorbei zeigt Classic-Bild in Fantastic | Test, der in `src` nach `BASE_URL}assets` und `assets/` in Zeichenketten sucht; `main.ts` ordnet `initPack` ganz nach vorn |
| Texturen, Register und Bögen passen nicht zusammen | Gruppenregel und HD-Regel als Tests (4.2) |
| Classic ändert sich unbemerkt | Classic-Screenshots vor dem Umbau als Vergleich; Phase 1 ändert keine Datei in `public/assets/` |
| Wechsel mitten im Spiel verliert Stand | Speichern vor dem Neuladen, Prüfskript in Phase 2 |
| Zusätzliche Monster verschieben Ziehungen und damit die Weltform | eigener abgeleiteter Strom je Ziehung, Weltform-Test über mehrere Seeds (4.6); Erweiterung nur hinten anhängen |
| Ein Fix an Fantastic verlangt neue Golden-Werte von Classic | Classic-Pfad bytegleich, getrennte Golden-Werte; Versionszähler zu Beginn von Phase 5 klären |
| Namen werden irgendwo als Schlüssel benutzt | Bestandsaufnahme in Phase 3, Test `names.test.ts` |
| Ein gemeinsames Erfolgsprofil nennt ein Monster, das es in Classic nicht gibt | Erfolge nur an Ids, die in beiden Versionen existieren (4.4) |

## 8. Entscheidungen des Nutzers (25. 11. 2026) und offene Frage

| # | Frage | Entscheidung | Wirkung im Plan |
|---|---|---|---|
| 1 | Spielstände | **getrennt** je Version | 4.4: eigene Schlüssel für Fantastic, Classic unverändert |
| 2 | Erfolge | **gemeinsam** | 4.4: ein Profil, Erfolgsliste in beiden Versionen gleich |
| 3 | Reicht die Optik? | **vor allem eigene oder andere Assets**; Monsternamen können abweichen; die erweiterte Version hat **zusätzliche Monster** | 4.6: Namen pro Version (Phase 3), zusätzliche Monster (Phase 5) |
| 4 | Gleicher Seed, gleiche Welt? | **ja** | 4.6: Weltform darf nicht von der Version abhängen, Test in Phase 5 |
| 5 | Installer | am Anfang **ein Installer** mit Wechsel im Spiel | 4.7 |
| 6 | Wechsel im Spiel | erlaubt; die Spielstände sind nicht kompatibel, **das Spiel lädt beim Wechsel neu** | 4.3 |

**Offene Frage A:** Bei Frage 3 und 4 zusammen: „dieselbe Welt“ gilt für **Inseln, Orte und Wege**. Zusätzliche Monster ändern aber, was in einem Ort steht (wo Fantastic ein altes Monster durch ein neues ersetzt, sieht derselbe Ort anders aus). Ist das gewollt, oder soll jeder Ort **dieselben alten Monster an denselben Stellen** behalten und die neuen Monster nur **zusätzlich** dort stehen, wo Classic keines hat? Die zweite Lesart ist strenger und aufwendiger (Fantastic wäre eine Obermenge von Classic); die erste ist einfacher. Bis zur Antwort plant 4.6 die erste Lesart und nur die Weltform als gleich.

## 9. Regeln, die nach der Umsetzung in die Themendateien gehören

- `docs/REGELN_RENDERING.md`: „Jeder Dateizugriff läuft über `resolveAsset`; kein `BASE_URL}assets` in einer Zeichenkette.“ „Ein Pack ändert nie eine Datei von Classic; Bögen und Register, `tex/` und `hd/tex/` kommen zusammen.“ „Werte von Classic bleiben unverändert in Code und Daten; ein Pack liefert nur Abweichungen.“
- `docs/REGELN_SPIEL.md`: Spielstände je Version (Schlüssel, `SaveFile.pack`), Wechsel in den Optionen mit Neuladen, gemeinsame Erfolge.
- `docs/REGELN_GENERIERUNG.md`: `ruleset`, Erweiterungstabellen nur hinten anhängen, eigener Strom je Ziehung, Classic bytegleich.
- `docs/RELEASE.md`: `assets-packs` als zweiter Eintrag der `extraResources`.
- `docs/HANDOVER.md`: Abschnitt „Assets und Versionen“ mit der Pack-Schicht.
