# Arbeitsregeln für Agenten (MM3 Seed RPG)

Zuerst lesen: `docs/HANDOVER.md` (technische Übergabe: Architektur, Systeme, Befehle, Rezepte; am Anfang steht die Übersicht aller Dokumente in `docs/`) und `README.md` (Befehle, Kurzüberblick). Die Namen „N. Playtest“ und „bug_fix_N“ unten sind Namen von Zweigen und Tests; ihre ausführlichen Protokolle (bis 16. 11. 2026) stehen nur noch in der Git-Historie von `docs/HANDOVER.md`. **Bei jeder Änderung an der Generierung (Städte, Burgen, Höhlen, Dungeons, Überwelt, Quests, Verkäufer) vorher `docs/OBJECTS.md` lesen:** welches Objekt wo stehen darf und welches nie reine Deko sein darf.

## Weitere Regeln nach Thema (ausgelagert)
Die themenbezogenen Regeln stehen in `docs/`. **Vor einer Änderung in dem Bereich die passende Datei lesen** (Inhalt unverändert, nur aus dieser Datei verschoben):
- `docs/REGELN_GENERIERUNG.md`: Platzierung und Generierung (Überwelt, Inseln, Städte, Burgen, Dungeons, Höhlen, Türme, Raumschiff, Quests, Objekte, Monster, Hütten), dazu `docs/OBJECTS.md`
- `docs/REGELN_RENDERING.md`: Darstellung (Modelle, Böden, Wände, Decken, Karten-Symbole, Licht, Sicht, Texturen, Töne, Effekte)
- `docs/REGELN_SPIEL.md`: Spielsystem (Zustände, Kampf, Balance, Zauber, Spielstände, Optionen, Debug-Menü)
- `docs/REGELN_PLAYTESTS.md`: Regeln, die zu einem Playtest oder Bugfix entstanden sind und mehrere Themen berühren
- `docs/RELEASE.md`: Windows-Release (Electron-Hülle, Installer)

Neue Regeln gehören in die passende dieser Dateien, nicht hierher; in `CLAUDE.md` bleibt nur, was für jede Änderung gilt.

## Projekt in einem Satz
Browser-Neuaufbau des Python/Ursina-Spiels in `../old_code`: TypeScript + Babylon.js + Vite + Vitest. Seed-basierte Kugelwelt aus Inseln (vier Größen und feste Inselregeln, siehe unten) mit
betretbaren Orten plus die 34 handgebauten Kampagnenkarten des Altspiels. Alles in `game/`.

## Harte Regeln
- **Determinismus:** In `src/core`, `world`, `interiors`, `actions`, `sim`, `campaign` kommt jeder Zufall aus `src/core/rng.ts`
  (`rngFor`, `derive`). Verboten: `Math.random`, `Math.sin`, `Math.cos`, `Math.pow`, `Math.exp`, Float-Rauschen, Lesen von Nachbar-Chunks.
- **Isomorphie:** Diese Module importieren weder DOM noch `@babylonjs/*`. Rendering, UI, Audio und Spielschleife liegen in `render`, `ui`, `audio`, `game`.
- **Generatoränderung = `GEN_VERSION` erhöhen** (`src/core/version.ts`), dann `npm run golden:update`. Ohne das schlägt der Golden-Test in `tests/unit/world.test.ts` fehl.
  Ablauf: ändern → `npm test` → Auswirkungen prüfen → Version erhöhen → `golden:update` → `npm test` → `npm run check:chrome`.
- **`../old_code` ist schreibgeschützt.** Nur lesen (Datenquelle für Export und Asset-Pipeline).
- **Generierte Dateien nicht von Hand ändern:** `src/data/raw/*.json` (Befehl `npm run data:export`), `src/data/item-models.json` (Befehl `python -I tools/export/export_item_models.py`), `public/assets/**` (Befehl `npm run assets:build` bzw. `npm run data:maps`; `public/assets/models-original/` und `models.*.original.json` kommen aus `npm run assets:originals`, sind optional und zählen nicht zum Größenbudget).
- **Geteilte Babylon-Ressourcen nie mit den Instanzen freigeben:** Materialien und Texturen eines Monstertyps (`MonsterRenderer`) bzw. eines Themes (`InteriorView`) gehören allen Instanzen. `dispose(false, true)` auf einer Instanz machte alle Monster dieses Typs weiß oder schwarz. Instanzen mit `dispose(false, false)` entfernen.
- **Props gehören einem Besitzer und müssen mit ihm verschwinden:** Chunks (`"cx,cy"`), `interior:<key>`, `campaign`, `campaign-fx` (bewegte Teile von Fallbeil und Speerfalle, gehört `CampaignView`), `loot`. Beim Wechsel zwischen Kampagne und generierter Welt alle Props der verlassenen Seite entfernen (`campaignView.dispose()` in `beginPlay`). Sonst stehen Berge und Dörfer der Kampagne ohne Kollision in der anderen Welt. `npm run check:render` prüft das.
- **Blickrichtung von Modellen nie raten:** Die geladenen Monstermodelle blicken nach +z. Bei neuen Modellen mit `npm run sheet:monsters` bzw. einem Screenshot prüfen.
- **`game/dist` nicht anlegen oder verändern.** Der Nutzer hat den Ordner absichtlich gelöscht. Build-Prüfungen mit `--outDir` in ein Temp-Verzeichnis außerhalb von `game/`.
- Temporäre Dateien gehören nicht nach `game/` und nicht nach `/tmp`, sondern in das vom Werkzeug genannte Scratchpad- bzw. Job-Temp-Verzeichnis.
- Keine Original-MM3-Dateien (`old_code/documentation/`) und nicht `MATURASC.TTF` ausliefern.
- **Jeder Weg in eine neue Szene läuft zwischen `Game.beginLoading` und `Game.endLoading`** (Ladebildschirm des Altspiels, wartet mit `whenDrawable`, bis alles zeichenbar ist). Sonst erscheinen Props vor den Wänden, deren Texturen noch laden. Die Methoden sind async: Skripte und Tests warten auf die Promises (`enter`, `leave`, `campaign`), nicht auf Schlafzeiten.
- **`Game.onArrived` hört nach jedem `await` auf, wenn die Szene gewechselt hat** (`fxEpoch`, 7. 11. 2026, bug_fix_43): die Ausgangszelle der Stadt fragt „Leave?“ und beendet ihren Zug erst nach der Antwort; mit den Zellkoordinaten der Stadt (1, 6) lief dann `monsterTurn` gegen die Monster der Überwelt, und eine Kudo Crab von Kachel (2, 6) schlug vor dem ersten Schritt zu. Jede neue Stelle in `onArrived`, die nach einem `await` mit `x, y` weiterrechnet, prüft die Epoche. Prüfung: `tools/dev/check-leave-town.ts`.
- **Das Spiel zeigt die Simulation zeitversetzt:** `sim/*` entscheidet alles sofort, `Game.handleEvents` legt Flug, Log, Ton und Tod auf eine Zeitachse (`later`, `fxEpoch`). Alles, was dort verzögert läuft, muss beim Szenenwechsel verfallen (`sceneChanged`). Zustand (gefallene Monster, Beute) wird sofort geschrieben, nur die Darstellung wartet.
- **Maße aus dem Altcode nur aus aktivem Code:** `entities.py` hält frühere Größen und Höhen als Kommentar (Village, Pyramid). `export_item_models.py` entfernt Kommentare; neue Items gegen den Altcode prüfen.
- **Browserprüfungen bei parallelen Änderungen:** `VITE_FROZEN=1 VITE_PORT=5174 npx vite --port 5174 --strictPort` startet einen Server ohne Neuladen; dagegen `GAME_URL=http://localhost:5174/ …` (nach eigenen Änderungen neu starten). Der normale Server lädt die Seite bei jeder gespeicherten Datei neu und bricht laufende Skripte ab.
- **Testdateien vor dem Schreiben prüfen:** `tests/unit/playtest<N>.test.ts` gibt es für die früheren Playtests schon; das Schreib-Werkzeug überschreibt ohne Git kommentarlos (so ging `playtest11.test.ts` einmal verloren). Neue Tests in eine neue Datei.
- **Zwei Versionen: „Classic“ und „Fantastic Islands“** (25. 11. 2026, `docs/PLAN_FANTASTIC_ISLANDS.md`, Abschnitt 4 „Versionen“ in `docs/HANDOVER.md`; Auswahl in Options > Controls > Version, `?pack=classic|fantastic`). **Der Standardort für jede weitere Erweiterung (neue Monster, Objekte, Assets, Namen, Inhalte) ist Fantastic Islands.** Classic bleibt, wie es ist, und bekommt nur Fehlerbehebungen; eine Änderung an Classics Tabellen, Ziehungen oder Dateien ist nie die Vorgabe für eine Erweiterung. Dazu gilt immer: jede Datei unter `assets/` über `resolveAsset` (`src/assets/pack.ts`), nie über eine selbst gebaute Adresse; ein Pack (`public/assets-packs/fantastic/`, gebaut von `npm run assets:pack` aus `tools/assets/sources-packs/fantastic/`) enthält nur Abweichendes und ändert nie eine Datei von Classic; neue Speicherschlüssel über `packKey` (die Stände der Versionen sind getrennt, Erfolge gemeinsam); Monster werden über Ids angesprochen, nie über Namen (die Namen sind Anzeige und können je Version abweichen, `BASE_MONSTER_NAMES` für alles, was die Generierung nach einem Namen entscheidet). Der Golden-Test von Classic ändert sich nie durch Fantastic. Einzelheiten: `docs/REGELN_RENDERING.md`, `docs/REGELN_SPIEL.md`, `docs/REGELN_GENERIERUNG.md`.
- **Das Showcase-Level ist die Pflicht-Schau aller Monster und Objekte** (Esc > Debug > Teleport to Level, **erster Eintrag**, `interiors/showcase.ts`, Inhalt `actions/showcase.ts`, Spiel `Game.spawnShowcase`; Theme „Dungeon“, weil dort am wenigsten Licht ist: so sieht man jedes Licht): ein dunkler Saal, in dem jedes Monster der Tabelle, jede Persona, jedes Altitem mit Modell und die Modelle der Ansicht ohne Item (`SHOWCASE_EXTRAS`) auf einer eigenen Zelle stehen, **ohne Funktion** (nur Ansichten und `decor`, keine Kämpfer, keine Truhen, kein Hebel). **Regel: Wird ein neues Monster, ein neues Objekt oder ein neues Licht ergänzt, muss es dort zu sehen sein.** Monster (Tabelle `MONSTERS`), Personas (`PERSONAS`) und Altitems (`item-models.json` mit `source`) kommen von selbst hinein; ein neues Modell der Ansicht, das kein Item ist (`obj_*` in `INTERIOR_MODELS`), gehört in `SHOWCASE_EXTRAS`; ein neues Licht (Objekt: `ITEM_LAMPS`, Monster: `MONSTER_LAMPS`, beides in `render/lamps.ts`) braucht sonst nichts. `tests/unit/showcase.test.ts` schlägt fehl, wenn etwas fehlt; das Showcase ist ein Ort (`SHOWCASE_ID`, `World.poiById`), kein Teil der Welt, der Weg hinaus führt dorthin zurück, wo die Gruppe stand.

## Vor dem Abschluss einer Änderung
```
npm run typecheck
npm test            # 877 Tests, ca. 40 bis 100 s (Zeitgrenze 30 s je Test in vitest.config.ts; bei Last reißen trotzdem Zeitmessungen wie der Chunk-Test, ohne dass ein Fehler vorliegt)
npm run check:chrome   # nur bei Generatoränderungen, braucht laufenden Dev-Server (npm run dev) und Chrome
npm run check:render   # nur bei Rendering-Änderungen (Monster, Innenräume, Materialien), gleiche Voraussetzungen
npm run check:effects -- <Ordner>   # nur bei Änderungen an Kampf-Darstellung, Zauberbildern, Zeiger (Screenshots in <Ordner>)
npm run check:spells -- <Ordner>    # nur bei Änderungen am Zauberfenster oder an Zaubern (Screenshots in <Ordner>)
npm run check:melee -- <Ordner>     # nur bei Änderungen an Schritten, Versetz-Zaubern oder Hüttentexten im Nahkampf (Screenshots in <Ordner>)
npm run check:pack -- <Ordner>      # nur bei Änderungen an den Versionen, am Pack oder an den Spielstand-Schlüsseln (Schalter in Options > Controls, Screenshots in <Ordner>)
npm run check:options -- <Ordner>   # nur bei Änderungen am Optionsdialog oder an „Train all“ (Screenshots in <Ordner>)
```
Rendering- oder Kampagnenänderungen zusätzlich im Browser prüfen (`tools/dev/play.ts`, `shot.ts`, `campaign-sweep.ts`), nicht nur per Typecheck.
Ein Playtest-Fehler gilt erst als behoben, wenn er im Browser nachgestellt und danach gelöst gesehen wurde (Screenshot oder Prüfskript).

## Offene Punkte für das Clean-up (Finalisierung des Spiels)
Beim Clean-up zur Finalisierung des Spiels **diese Fragen dem Nutzer stellen, nicht selbst entscheiden**:
- **„Es gibt noch die alten Kampfformeln im Code. Sollen diese beim Clean-up endgültig gelöscht werden?“** Gemeint ist der `legacy`-Zweig von Balance v4 (`BALANCE`, `isV4`, `RULES.legacy`, alle Stellen mit `LEGACY (balance v4)`, `ORB_MANA_BONUS`, `CURRENT`/`PARAM` und der Legacy-Zweig von `tools/balance/verify.ts`, die Legacy-Tests). Liste und Rückweg: `docs/FORMULAS_1.3.md` Abschnitt 9. Bis dahin bleiben sie als Rückweg im Code.

## Konventionen
- Code, Kommentare, UI-Texte und Commit-Texte: **Englisch**. Dokumentation für den Nutzer und Antworten an den Nutzer: **Deutsch mit korrekten Umlauten**.
- Kommentare erklären das Warum, nicht das Was. Stil und Dichte des umgebenden Codes übernehmen.
- TypeScript `strict` mit `noUncheckedIndexedAccess`: Indexzugriffe brauchen `!` oder eine Prüfung.
- Daten statt Code: Tuning von Truhen, Fallen, Monstern und Beute gehört in `src/data/rules/*.json` bzw. `src/data/*.ts`.

## Umgebung (Windows 11)
- Bash-Tool = Git Bash. Das Arbeitsverzeichnis ist dort persistent; absolute Pfade oder `cd "…" &&` je Befehl nutzen.
- Der Sicherheits-Hook der bisherigen Sitzung blockierte `rm -rf`, Heredocs mit `${…}` oder `>(` (auch `Map<number, X>()` in einem Skript) und Umleitungen auf dynamische Pfade. Quelltext mit dem Edit-Werkzeug ändern, nicht mit Heredocs. Nicht umgehen: Dateien mit dem Schreib-Werkzeug anlegen, statt zu löschen verschieben oder einzelne Dateien entfernen.
- Chrome-Pfad ist in `tools/dev/*.ts` fest auf `C:\Program Files\Google\Chrome\Application\chrome.exe` gesetzt.
- Es gibt ein Git-Repository in `game/` (Remote `origin`, GitHub `llange2/3D-RPG`, Hauptzweig `main`). Arbeit auf einem eigenen Zweig je Playtest (`playtest_23` …); **Commit und Push laufen automatisch** (Stop-Hook in `.claude/settings.json`, Skript `tools/dev/auto-commit-push.sh`: nach jeder Antwort alles außer `.claude/worktrees` stagen, committen, mit `push -u origin HEAD` pushen; nie auf `main`/`master`, nie `--force`, die git-Hooks bleiben an). Eine inhaltliche Commit-Nachricht schreibt der Agent trotzdem selbst, sobald ein Teil fertig ist; der Hook fängt nur den Rest auf. Pull Request und Merge nur auf Wunsch des Nutzers, `main` wird nach dem Merge per `git pull` nachgezogen.
- **Ein Worktree wird gelöscht, sobald sein Zweig gemergt ist** (8. 11. 2026): `.claude/worktrees/<name>` ist eine volle Kopie des Projekts (mit eigenen `public/assets`, rund 650 MB und 3 000 Dateien). Bis zum 8. 11. lagen dort 61 Stück (40 GB, 175 000 Dateien): der Dev-Server beobachtete und durchsuchte sie alle und antwortete auf die erste Anfrage erst nach über 10 s („Warten auf localhost…“, „Game is loading…“ ohne Prozente minutenlang). Ablauf am Ende jedes Auftrags: Pull Request, Merge, `git pull` auf `main`, dann den Worktree entfernen (`ExitWorktree` mit `remove`, oder `git worktree remove <Pfad>`; die `node_modules`-Junction zuerst allein mit `cmd /c rmdir <Pfad>\node_modules` lösen, damit nichts durch sie hindurch gelöscht wird) und den gemergten lokalen Zweig mit `git branch -d`. Nie einen Worktree entfernen, der ungemergte oder ungepushte Commits oder Änderungen trägt (`git status`, `git rev-list --count origin/main..<Zweig>`). `vite.config.ts` schließt `.claude/**` vom Dateiwächter und vom Abhängigkeits-Scan aus (`server.watch.ignored`, `optimizeDeps.entries`); das ist ein Netz, keine Erlaubnis, Worktrees liegen zu lassen. Zeigt der Dev-Server trotzdem „Warten auf localhost…“, zuerst `git worktree list` und den Ordner `.claude/worktrees` ansehen.
