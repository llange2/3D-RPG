# Windows-Release mit Installer

Das Spiel läuft als Desktop-Programm: eine Electron-Hülle (`installer/main.mjs`) um den Vite-Build, verpackt von electron-builder
in einen NSIS-Installer. Alles liegt in `installer/` mit eigenen Abhängigkeiten (`installer/package.json`); das Spiel selbst und
seine `node_modules` bleiben unberührt.

## Installer bauen

```
cd installer
npm install                  # nur beim ersten Mal (Electron, electron-builder)
npm run build                # Typprüfung, Vite-Build, Installer
npm run build:dir            # nur das entpackte Programm (win-unpacked), zum schnellen Ausprobieren
```

- Ausgabe: `RELEASE_DIR` oder der Ordner `release` neben dem Projektordner (`C:\Sonstiges\3D RPG\release`):
  `dist\MM3-Seed-RPG-Setup-<Version>.exe`, dazu `web\` (Vite-Build, Zwischenstand) und `build\icon.png`. Der Ordner muss **außerhalb** des Projekts
  liegen (`game/dist` bleibt gelöscht, `build.mjs` bricht sonst ab).
- `npm run build -- --skip-checks` lässt die Typprüfung aus.
- Die Version steht in `installer/package.json` (`version`); vor einem neuen Release dort erhöhen.
- Die Assets (`public/assets`, rund 500 MB) werden nicht kopiert, electron-builder nimmt sie als `extraResources` direkt aus `public/assets`.
  **Nicht ausgeliefert** werden die Teile, die das Spiel nicht lädt (`NOT_SHIPPED` in `build.mjs`): `manifest.json`,
  `textures.stats.json` (der reduzierte Modellsatz ist seit bug_fix_68 gelöscht). Die Originalmodelle (`models-original`, im Git) gehören
  dazu; **haben sich Modelle geändert, vorher `npm run assets:originals` laufen lassen**.
- Keine Original-MM3-Dateien und nicht `MATURASC.TTF` im Installer (der Build kopiert nur `public/assets`).

## Was der Installer fragt

Assistent mit Zielordner (pro Benutzer oder für alle) und einer eigenen Seite „Shortcuts“ (`installer/nsis/installer.nsh`):

- **Startmenü-Verknüpfung** (Vorgabe: an) und **Desktop-Verknüpfung** (Vorgabe: aus), je ein Häkchen.
- Ein stiller Aufruf (`MM3-Seed-RPG-Setup-<Version>.exe /S`) legt die Startmenü-Verknüpfung an, die Desktop-Verknüpfung nicht.
- Der Deinstaller entfernt beide Verknüpfungen. **Spielstände bleiben erhalten** (`deleteAppDataOnUninstall: false`).

## Das Programm

- `installer/main.mjs`: ein Fenster, das `app://game/index.html` lädt. Das eigene Protokoll liest die Dateien aus `resources/web` (Vite-Build und
  `assets/`), setzt die Dateitypen selbst (`.js` als `text/javascript`, `.glb`, `.webp` …) und beantwortet Bereichsanfragen für Audio und Video.
- Spielstände und Einstellungen liegen im `localStorage` des Programms: `%APPDATA%\MM3 Seed RPG`. Das Release hat **kein Debug-Menü** (seit v1.1, `DEBUG_MENU` = `import.meta.env.DEV`), also auch kein
  Export/Import saves: Stände aus dem Browser kommen nur über den Dev-Server dort hinein.
- Das Symbol ist `installer/icon.png` (v1.1, die Gruppe auf dem Felsen, Quelle `.ignore/icon.png`); `build.mjs` setzt es auf ein transparentes Quadrat von 512 px.
- Das Programm startet **immer im Vollbild** und zeigt beim Laden keinen Mauszeiger (der Systemzeiger bleibt weg, bis das Spiel seinen eigenen hat).
  **F11** oder **Alt+Enter** verlässt und betritt das Vollbild. Es gibt kein Menü und keinen Neuladen-Shortcut (F8 und F9 sind Quick Save und Quick Load des Spiels).
  Entwicklerwerkzeuge sind aus (`MM3_DEVTOOLS=1` schaltet sie ein).
- Nur eine Instanz: ein zweiter Start holt das laufende Fenster nach vorn (zwei Instanzen würden dieselben Stände schreiben).
- `MM3_LOG_MISSING=1` schreibt jede nicht gefundene Datei auf die Konsole (zum Prüfen, ob etwas im Installer fehlt);
  `GAME_WEB_DIR=<Ordner>` lädt einen anderen gebauten Spielordner.

## Prüfung

Nach `npm run build:dir`: `release\dist\win-unpacked\MM3 Seed RPG.exe` starten, Titelbild, neues Spiel, Ton, Speichern und Laden ausprobieren.
Der Installer selbst: ausführen, die Seite „Shortcuts“ mit und ohne Häkchen, danach Startmenü prüfen, Deinstallieren.

## Nicht enthalten

Keine Codesignatur (Windows SmartScreen zeigt beim ersten Start „Unbekannter Herausgeber“), kein automatisches Update, nur x64.

## Regeln für Agenten (aus CLAUDE.md)

- **Windows-Release** (16. 11. 2026, `docs/RELEASE.md`, Ordner `installer/` mit eigenen `node_modules`, kein `GEN_VERSION`): Electron-Hülle (`installer/main.mjs`, Protokoll `app://game/`, Bereichsanfragen für Video selbst beantwortet, weil `net.fetch` auf Dateien `Content-Range` weglässt) um den Vite-Build, verpackt von electron-builder als NSIS-Installer (`npm run build` in `installer/`, Ausgabe `RELEASE_DIR`, nie in `game/`); Startmenü- und Desktop-Verknüpfung wählt der Nutzer auf der eigenen Seite `installer/nsis/installer.nsh` (die Datei braucht eine UTF-8-BOM, `createStartMenuShortcut` bleibt aus; `WinShell::…` gibt es im Installer nicht). Ausgeliefert wird `public/assets` ohne den reduzierten Modellsatz (`NOT_SHIPPED` in `build.mjs`): ein neuer Asset-Ordner, den das Spiel lädt, darf dort nicht stehen. Prüfung des Programms: `tools/dev/check-desktop.ts <Ordner>`.
