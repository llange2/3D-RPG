# Zielbild: alle Zustände eines Charakters

Stand: 25. 11. 2026. Vorgabe für die Porträts eines Helden in allen Zuständen, gedacht für neue Bilder (zum Beispiel das Pack „Fantastic Islands“, siehe `docs/PLAN_FANTASTIC_ISLANDS.md`). Beschrieben wird **das Bild als Ganzes**: Zeichenstil, Zustände, Aufteilung. Der Held selbst (Gesicht, Haare, Kleidung) ist bewusst offen.

Zwei Beispielbilder liegen daneben (beide aus den Porträts des Altspiels, Held `character03`, nur als Muster für **Aufteilung und Zustände**, nicht für den Stil):

- `zielbild/beispiel_zustaende_sauber.png` (2016 × 816): so soll die fertige Bildvorlage aussehen, ohne Text.
- `zielbild/beispiel_zustaende_beschriftet.png` (2096 × 1396): dasselbe Raster mit Nummern, Namen und Dateinamen sowie den zwei gemeinsamen Bildern (Tot, Verwest). Die Beschriftung gehört nicht ins fertige Bild.

## 1. Was das Spiel braucht

Das Spiel zeigt das Porträt eines Helden in dem **schlimmsten** Zustand, den er gerade hat (`portraitOf`, `src/ui/avatarFx.ts`). Je Held gibt es **10 eigene Bilder**; **2 weitere sind für alle Helden gleich**.

| Nr. | Zustand (Spiel) | Dateisuffix | Zeigt das Bild auch für |
|---|---|---|---|
| 1 | Normal | (keins), `character03.webp` | kein Zustand, alle sonstigen |
| 2 | Blessed | `_Blessed` | |
| 3 | Crazy | `_Crazy` | |
| 4 | Cursed | `_Cursed` | **Weak** (Schwach) |
| 5 | Diseased | `_Diseased` | |
| 6 | Drunk | `_Drunk` | **Lovestruck** (Verliebt) |
| 7 | Paralyzed | `_Paralyzed` | |
| 8 | Petrified | `_Petrified` | |
| 9 | Poisoned | `_Poisoned` | |
| 10 | Sleeping | `_Sleeping` | **Unconscious** (Bewusstlos) |
| gemeinsam | Dead | `character00_Dead.webp` | alle Helden |
| gemeinsam | Rotten | `character00_Rotten.webp` | alle Helden |

Folge für das Malen: **Nr. 4 muss sowohl „verflucht“ als auch „geschwächt“ lesbar sein, Nr. 6 sowohl „betrunken“ als auch „verliebt“, Nr. 10 sowohl „schlafend“ als auch „bewusstlos“.** Deshalb sind diese drei Bilder bewusst nicht zu speziell (kein Fluchzeichen, kein Weinglas, kein Kissen).

## 2. Aufteilung des Bildes (Layout)

**Ein Bild pro Held, 5 Spalten × 2 Zeilen = 10 gleich große Quadrate.** Gelesen von links nach rechts, dann die nächste Zeile, in der Reihenfolge der Tabelle oben:

```
Zeile 1:   1 Normal      2 Blessed     3 Crazy       4 Cursed      5 Diseased
Zeile 2:   6 Drunk       7 Paralyzed   8 Petrified   9 Poisoned    10 Sleeping
```

| Merkmal | Vorgabe |
|---|---|
| Zelle | quadratisch, im Beispiel 384 × 384 px; zum Malen 512 × 512 oder größer, das Spiel zeigt am Ende 192 × 192 |
| Zwischenraum | 16 px, **einfarbig mittelgrau** (`#7F7F7F`), auch als äußerer Rand: Gesamtgröße = 16 + 5 × (Zelle + 16) breit, 16 + 2 × (Zelle + 16) hoch (Beispiel: 2016 × 816) |
| Text | **keiner**: keine Nummern, keine Namen, keine Wasserzeichen. Die Zuordnung ergibt sich nur aus der Reihenfolge |
| Zuschnitt | Zelle (Spalte c, Zeile r, jeweils ab 0): x = 16 + c × (Zelle + 16), y = 16 + r × (Zelle + 16) |
| Gemeinsame Bilder | **Dead** und **Rotten** sind ein eigenes, einmaliges Bild für alle Helden (Format wie eine Zelle) und gehören nicht in die Bögen der Helden |

**Bildaufbau in jeder Zelle (in allen zehn gleich):**

- Brustbild frontal oder mit höchstens leichter Neigung des Kopfes, Blick in die Kamera (Ausnahme: Schlafend, siehe unten).
- Der Kopf füllt **etwa 70 bis 80 % der Zellhöhe**; Scheitel mit etwas Luft (ca. 5 %), Schultern angeschnitten am unteren Rand.
- **Augenlinie bei etwa 40 % der Zellhöhe**, Gesicht waagerecht zentriert. Die Augen stehen in allen zehn Zellen auf derselben Höhe, damit das Bild beim Wechsel des Zustands nicht „springt“.
- Gleiche Kamera, gleiche Brennweite (kein Weitwinkel-Verzerren), gleiche Lichtrichtung (weiches Licht von vorn links oben) in allen Zellen.
- Der Hintergrund ist **in allen zehn Zellen derselbe** (ruhiger, dunkler, leicht unscharfer Farbgrund im Ton des Helden). Kein Zustand darf einen eigenen Hintergrund bekommen (Ausnahme: Dead und Rotten, siehe 4).
- Alle Merkmale, die den Helden ausmachen (Frisur, Haarfarbe, Schmuck, Kopfschutz, Augenfarbe, Narben, Kleidungskragen) bleiben in allen zehn Zellen **identisch**. Nur Ausdruck, Hautton und die unten genannten Zeichen ändern sich.

## 3. Zeichenstil: handgemalt (hand-painted)

Der Stil gilt für alle Zellen gleich und für alle Helden eines Packs.

- **Malerei, nicht Foto, nicht Cel-Shading:** Ölfarbe oder deckende Gouache auf Leinwand, mit sichtbarem, aber ruhigem Pinselduktus. In den Flächen (Haut, Haar, Stoff) sind einzelne Pinselstriche zu erkennen, besonders im Haar und im Hintergrund; die Kanten sind **weich gemalt**, nicht mit einer schwarzen Umrisslinie gezogen.
- **Farbe:** gedeckte, leicht warme Palette mit feiner Körnung der Leinwand (Craquelé und Leinwandstruktur nur ganz schwach, es darf bei 192 px nicht flimmern). Hauttöne mit Farbwechseln (rötlich an Wangen und Nase, kühl an Schläfen), nicht als glatte Fläche.
- **Licht:** ein weiches Hauptlicht, ein schwacher Randlicht-Saum (Haar, Schulter) zur Trennung vom Hintergrund. Schatten sind getönt (warm-braun oder kühl-violett), nie reines Schwarz.
- **Detailgrad:** Augen, Mund und Augenbrauen sind der feinste Teil und tragen den Zustand; Haare, Kleidung und Hintergrund sind lockerer gemalt. Das Gesicht muss bei **64 px Breite** (verkleinerte Fassung für die Zustandsleiste) noch ablesbar sein.
- **Übertreibung:** leicht überzeichneter Ausdruck wie in einem gemalten Bühnenporträt. Der Zustand muss auf einen Blick erkennbar sein, aber nicht comichaft: keine Strichaugen, keine Sprechblasen, keine Symbole außerhalb des Gesichts (außer Heiligenschein bei Gesegnet).
- **Keine Fremdkörper:** keine Schrift, kein Rahmen, kein Passepartout, kein Logo, keine Signatur, kein Vignettenrand, keine Bildunterschrift.
- **Ein Stil für alle:** gleiche Pinselstärke, gleiche Sättigung und gleicher Kontrast bei allen Helden und allen Zuständen. Die Zustände ändern Farbe und Ausdruck, aber nie die Technik.

## 4. Die Zustände im Einzelnen

Jedes Bild zeigt **denselben Helden** wie Nr. 1, nur im jeweiligen Zustand. „Bleibt“ heißt: wie in Nr. 1.

**1. Normal.** Neutraler, wacher, ruhiger Blick in die Kamera, Mund geschlossen, Brauen entspannt, gesunde Hautfarbe. Dieses Bild legt Frisur, Schmuck, Hintergrund und Lichtstimmung fest; alle anderen leiten sich davon ab. Es ist das Bild, das der Spieler am häufigsten sieht, und darf kein Zustand „vortäuschen“.

**2. Blessed (Gesegnet).** Entspannt-heiteres, mildes Lächeln, Augen weich und leicht nach oben gerichtet, Brauen hoch und offen. Haut etwas wärmer und heller, ein warmer goldener Schimmer auf Stirn und Wangen. **Heiligenschein:** ein dünner, leuchtender goldener Ring, schwebend über dem Kopf, vollständig innerhalb der Zelle (nicht angeschnitten). Sonst nichts Zusätzliches.

**3. Crazy (Wahnsinnig).** Weit aufgerissene Augen mit sichtbarem Weiß um die Iris, **kleine Pupillen**, ein breites, verzerrtes Grinsen mit sichtbaren Zähnen, Stirn in Falten, Brauen unterschiedlich hoch. Haut eine Spur gerötet. Wirkt „unter Strom“, nicht wütend.

**4. Cursed (Verflucht, auch Geschwächt).** Niedergeschlagen: Mundwinkel hängen, Brauen innen hochgezogen, Blick matt und leicht nach unten, Augenlider schwer. Haut fahl und etwas grau, Augenringe. Kein Fluchsymbol im Bild, damit es auch für „Schwach“ passt.

**5. Diseased (Krank).** Angewidertes, leidendes Gesicht: Nase gerümpft, Zunge etwas herausgestreckt oder Mund verzogen, Stirn gefurcht, Augen müde und feucht. Haut blass mit fleckigen roten Stellen (Fieberröte an Wangen und Nasenspitze), leicht glänzend. Keine Eiterbeulen, kein Blut, keine Fliegen (es muss bei 64 px sauber lesbar bleiben).

**6. Drunk (Betrunken, auch Verliebt).** Breites, schiefes, seliges Lachen, Augen halb geschlossen oder schief, Kopf eine Spur geneigt, Wangen und Nase deutlich gerötet. Muss auch als „verliebt, benommen“ funktionieren: **kein** Glas, keine Flasche, keine Herzchen.

**7. Paralyzed (Gelähmt).** Erstarrt: Augen **weit offen und starr**, nicht blinzelnd, Pupillen auf einen Punkt gerichtet, Mund leicht offen (eine Lippenöffnung wie ein stummer Schreckenslaut), Brauen hoch. Muskeln spürbar angespannt, Haut normal, aber leicht blass. Kein Funkenschlag, keine Eiskristalle.

**8. Petrified (Versteinert).** Das Gesicht ist **zu Stein geworden**: Haut, Haar und Schmuck in warmem Grau-Beige, matt, mit Steinmaserung und feinen Rissen, die Augen sind leer und ohne Glanz, der Ausdruck ist eingefroren (der Ausdruck aus Nr. 1, mit einem Anflug von Schreck). Das Bild ist **kontrastärmer und entsättigt**; die Konturen bleiben aber so scharf, dass der Held wiederzuerkennen ist. Kein Sockel, keine Statue als Ganzes.

**9. Poisoned (Vergiftet).** Grünlich-fahle Haut (ein kräftiger, aber nicht neonfarbener Grünstich auf Gesicht, Hals und Händen), Schweißglanz auf Stirn und Schläfen, Augen glasig und leicht verdreht, Mund schmal und zusammengepresst, als wolle der Held sich übergeben. Haare und Schmuck behalten ihre Farbe (nur Haut und Licht wechseln).

**10. Sleeping (Schlafend, auch Bewusstlos).** **Augen fest geschlossen**, Lider glatt, Mund geschlossen und entspannt, Kopf **eine Spur zur Seite geneigt**, Brauen entspannt. Haut normal, Licht eine Spur dunkler. Kein „Zzz“, kein Kissen, kein Bett.

**Gemeinsam: Dead (Tot).** Ein **Grabstein** mit der Aufschrift „RIP“ in Stein gemeißelter Schrift, davor ein kleiner Erdhügel mit ein bis zwei weißen Blumen, im Hintergrund Wiese und Himmel (der einzige helle, bunte Hintergrund). Gilt für alle Helden, keine Gesichter.

**Gemeinsam: Rotten (Verwest).** Ein **Totenschädel**, frontal, gealtertes Elfenbein, dunkle Augenhöhlen, Schulterreste oder Halswirbel angeschnitten am unteren Rand, Hintergrund wie die Hintergründe der Heldenbilder. Gilt für alle Helden, keine Gesichter.

## 5. Prompt-Vorlage für den Bildgenerator

Empfehlung (**nicht erprobt**; Stand der Bildgenerator-Anbindung siehe `tools/assets/fx/gov.py`): jedes der zehn Bilder als **eigene Anfrage** mit gleichem Seed-Grundtext erzeugen, nicht das ganze Raster in einem Zug. Bei zehn Zellen in einem Zug ist zu erwarten, dass Modelle wie Z-Image Turbo und Flux.2 Klein Gesicht und Schmuck nicht gleich halten. Erst Nr. 1 erzeugen und freigeben, dann die anderen mit Nr. 1 als Bildvorlage (Bild-zu-Bild oder Edit-Modus, soweit das Modell es kann) und dem Zustandstext aus Abschnitt 4. Das Raster setzt danach ein Skript zusammen.

Grundtext (Englisch, Platzhalter in Klammern):

```
hand-painted oil portrait, bust of [HERO DESCRIPTION], front view, head fills three quarters of the frame,
eyes at 40 percent of the height, visible soft brush strokes, soft painted edges without outlines,
muted warm palette, soft key light from upper left, faint rim light, dark softly blurred painted background
[BACKGROUND COLOUR], subtle canvas texture, painterly stage portrait, square image
```

Zustandszusatz (Beispiele, Rest aus Abschnitt 4 ableiten):

```
Blessed:    gentle mild smile, eyes soft and slightly upward, warm golden glow on the skin, thin glowing golden halo floating above the head
Paralyzed:  eyes wide open and fixed, mouth slightly open, brows raised, frozen tense expression, slightly pale skin
Petrified:  face turned to warm grey-beige stone, matte, fine cracks, blank eyes, frozen expression, desaturated
Poisoned:   sickly green skin, sweaty forehead, glassy eyes, thin pressed lips, nauseous
Sleeping:   eyes firmly closed, relaxed mouth, head tilted slightly, slightly darker light
```

Negativ (für Modelle mit Negativtext):

```
text, letters, numbers, watermark, signature, logo, frame, border, vignette, photograph, 3d render, cel shading,
black outline, comic, anime, extra people, hands, background scene, cropped head
```

## 6. Abnahme (Checkliste)

1. Zehn Bilder, in der Reihenfolge von Abschnitt 2; das Raster ist 16 + 5 × (Zelle + 16) px breit und 16 + 2 × (Zelle + 16) px hoch.
2. Kein Text im Bild, Zwischenräume und Rand einfarbig `#7F7F7F`.
3. Augenlinie bei etwa 40 % der Zellhöhe in allen zehn Zellen, Kopfgröße gleich (Prüfung: die zehn Zellen als Blätterbild übereinanderlegen).
4. Hintergrund, Licht und Pinselstil in allen zehn Zellen gleich; Frisur und Schmuck gleich.
5. **Lesbarkeitstest:** alle zehn Zellen auf **64 × 64 px** verkleinern; jeder Zustand muss ohne Beschriftung erkennbar bleiben (Normal, Blessed, Crazy, Cursed, Diseased, Drunk, Paralyzed, Petrified, Poisoned, Sleeping). Besonders prüfen: Crazy ≠ Paralyzed (beide haben weite Augen: Crazy mit Grinsen und Falten, Paralyzed starr mit offenem Mund), Cursed ≠ Diseased, Petrified ≠ Poisoned (Grau gegen Grün).
6. Nr. 4, 6 und 10 passen zugleich zu Schwach, Verliebt und Bewusstlos (Abschnitt 1).
7. Dead und Rotten einmal für alle Helden vorhanden.
8. Zuschnitt auf 192 × 192 px je Zelle ergibt Dateien `characterNN.webp`, `characterNN_<Suffix>.webp` wie in der Tabelle in Abschnitt 1; `tools/assets/build-portrait-sheets.ts` baut daraus wie bisher die Bögen. Wie das Pack die Dateien einbindet, regelt die Pipeline (Phase 3 im Plan), nicht dieses Dokument.

## 7. Hinweis zum Beispiel

Das Beispiel stammt aus den Porträts des Altspiels (Held `character03`); dessen Stil ist **realistischer** als der hier beschriebene „handgemalte“. Es zeigt Zustände, Reihenfolge und Raster, nicht den Zielstil. Das Beispiel ist aus den Dateien in `public/assets/icons/portraits/` zusammengesetzt (2× hochskaliert, daher etwas weicher als die Originale).
