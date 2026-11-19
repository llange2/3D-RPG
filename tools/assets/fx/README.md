# Werkzeuge für die Effekt-Grafiken (`tools/assets/sources/fx`)

Die Quellbilder in `tools/assets/sources/fx/` sind **fertig und eingecheckt**. Diese Skripte erzeugen sie neu; zum Spielen oder Bauen der Assets (`npm run assets:fx`) braucht man sie nicht.

| Skript | Aufgabe |
|---|---|
| `build_fx.py` | Baut Partikelblatt (`fx_particles.png`, 8 × 8 Zellen à 128 px), Rauchblatt (`fx_smoke.png`) und die fünf Einschlag-Flipbooks (`fx_impact_*.png`, 4 × 4 Bilder à 512 px, Blatt 2048²) aus den Eingabebildern. Aufruf: `python -I build_fx.py <paket> <roh> <ausgabe> [particles\|smoke\|impacts\|all]` |
| `build_fx.py … sheets` | Seit dem 19. 11. 2026 liefert der Nutzer Feuer, Eis, Säure und Magie als **fertige** 4 × 4-Blätter (`.ignore/impact_<fire\|ice\|acid\|magic>.png`, 2048², 16 Bilder à 512 px, kein Alpha). Feuer, Eis und Säure sind auf Weiß gemalt, Magie auf einem eingebrannten Schachbrett (40 × 40 Felder, dunkel zuerst, 46,5 / 100,5 von 255). `sheet_impact` rechnet beides in geraden Alpha zurück (`unmix_white`: tintendichte = Alpha, Farbe auf volle Helligkeit; ein blasser heißer Kern in der Mitte der Bilder 1 bis 14 wird deckend, sonst verschwände er mit dem Papier; `unmix_checker`: bekannter Hintergrund je Pixel, hellster Kanal der Farbe = 1) und blendet 5 % an jedem Bildrand aus (die Spitzen des Magie-Sterns reichen in die Nachbarbilder). Aufruf: `python -I build_fx.py x ../../../.ignore ../sources/fx sheets` (das Wasser-Blatt kommt weiter aus `impacts` mit `fx-raw/impact_water.png`, wenn es neu gebaut werden soll). Danach `npm run assets:fx`. |
| `water_tex.py` | Erzeugt die nahtlosen Wassertexturen `fx_water_ripple.png` (Lichtnetz, 512², additiv) und `fx_water_flow.png` (der blaue Wasservorhang, 128 × 512, mit eigenem Alpha) prozedural und schneidet mit einem zweiten Argument das Tropfenbild des Nutzers zu (`fx_water_drop.png`, 148 × 256). Aufruf: `python -I water_tex.py <ausgabe> [<water_drop.png>]` |
| `foam_tex.py` | Macht aus einem Schaumbild des Image Generators (weiß auf Schwarz) die nahtlose Uferschaum-Textur `fx_foam.png` (512², additiv). Aufruf: `python -I foam_tex.py <Rohbild> <ausgabe.png> [512]`. Gewählt wurde `foam_f1` (Flux.2) von sechs Bildern (je drei Z-Image und Flux.2), Rohbild in `.ignore/fx-raw/foam_f1.png`. |
| `gov.py` + `jobs_fx.json` | Schickt Bildaufträge nacheinander an den AI Governor (Image Generator) und lädt die Ergebnisse. Aufruf: `GOV_TOKEN=… GOV_URL=http://sam:8080 python -I gov.py jobs_fx.json <roh>`. Das Token steht nie im Repo. |

## Eingaben (liegen nur lokal in `.ignore/`)

- `.ignore/PNG`: das graue Partikelpaket des Nutzers (512 px; Kenney „Particle Pack“, CC0).
- `.ignore/fx-raw`: die Rohbilder (1024², farbig auf Schwarz): `impact_<fire|ice|acid|magic|water>.png` und `spr_*.png` (Tropfen, Spritzerkrone, Blase, Eissplitter, Schneeflocke/Eiskristall, Säureklecks, Säureblase). Einige vom Governor, `impact_acid/magic/water`, `spr_acid_blob`, `spr_splash` (Wasserkrone) und `spr_snowflake` (Eiskristall) vom Nutzer.

Neu bauen: `python -I build_fx.py ../../../.ignore/PNG ../../../.ignore/fx-raw ../sources/fx all` , `python -I water_tex.py ../sources/fx ../../../.ignore/water_drop.png` und `python -I foam_tex.py ../../../.ignore/fx-raw/foam_f1.png ../sources/fx/fx_foam.png`.

## Bildkonvention (wichtig für den Code)

Alle Bilder haben **geraden Alpha: Alpha = Intensität, RGB = die Farbe** (die grauen Sprites sind weiß, der Code färbt sie ein). Das Spiel mischt sie mit SRC_ALPHA + ONE, die Farbe unter Alpha 0 zählt nie. (Vormultiplizierte Bilder mit ONE + ONE zeigten nach der WebP-Kompression helle Quadrate: der Encoder lässt Farbe in transparente Pixel hineinsickern.) Die Flipbooks laufen zeilenweise, Bild 1 ist klein und schwach, der Höhepunkt liegt in der Mitte, Bild 16 ist fast unsichtbar; die Zellmitte ist der Einschlagpunkt.
