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
| Zelle | quadratisch, im Beispiel 384 × 384 px; zum Malen 512 × 512 oder größer, das Spiel zeigt am Ende 192 × 192. Bei ChatGPT (Abschnitt 5a) sind es 288 × 288 px, damit 5 Zellen genau in ein 1536 px breites Bild passen |
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

## 5a. Prompt für ChatGPT (Image 2) mit dem Zielbild als Referenz

**Vorgehen:** `docs/zielbild/beispiel_zustaende_sauber.png` als Referenzbild anhängen, `[Charakterbeschreibung]` ersetzen, den Prompt absenden. Das Ergebnis wird danach auf das Raster zugeschnitten (siehe unten).

**Warum der Prompt so aufgebaut ist (Befund aus den ersten zwei Versuchen, 25. 11. 2026):** Stil, Zustände und Reihenfolge kamen gut, aber das Raster füllte das ganze Querformat (1536 × 1024 px, 3:2) aus. Fünf Spalten × zwei Zeilen auf 3:2 ergeben zwangsläufig **hochformatige** Zellen (rund 290 × 485 px). Quadratische Zellen gehen in 3:2 nur, wenn das Raster **nicht** das ganze Bild füllt: mit Zellen von 288 px und 16 px Zwischenraum ist es genau 1536 px breit, aber nur 624 px hoch; darunter bleibt eine graue Fläche von 400 px. Das verlangt der Prompt ausdrücklich. Außerdem änderte sich im Versteinert-Bild die Frisur (Locken wurden zu Steinlocken anderer Form); der Prompt verlangt dort dieselbe Frisur in Stein. Das Referenzbild zeigt eine Person; damit sie nicht übernommen wird, sagt der Prompt, dass nur Aufbau und Stil gelten.

**Der Prompt** (Anfang wie vorgegeben; „in zehn Zuständen, die …“ ergänzt, damit der Satz mit „einen“ und „die“ grammatisch aufgeht):

```
Zeichne einen [Charakterbeschreibung] in zehn Zuständen, die zusammen ein Raster aus zehn quadratischen Porträts bilden. Das angehängte Referenzbild zeigt NUR den Aufbau des Rasters, die Reihenfolge der Zustände, die Ausdrücke und den Malstil. Übernimm NICHT die abgebildete Person, ihr Gesicht, ihre Haare, ihren Schmuck oder ihre Kleidung, sondern male die oben beschriebene Figur.

FORMAT (sehr wichtig, geht vor allem anderen):
- Das Bild ist ein Querformat 3:2 (1536 × 1024 px). Der gesamte Hintergrund ist eine einfarbige, mittelgraue Fläche (#7F7F7F).
- Darauf liegt, bündig am oberen Bildrand, ein Raster aus 5 Spalten × 2 Zeilen mit insgesamt 10 Porträts. Jedes Porträt ist EXAKT QUADRATISCH (288 × 288 px), niemals hochformatig oder gestreckt. Zwischen den Porträts und rundum am Rand liegen 16 px der grauen Fläche. Das Raster ist dadurch 1536 px breit und nur 624 px hoch.
- Das Raster füllt NICHT das ganze Bild: Unter der zweiten Zeile bleibt eine leere, einfarbig graue Fläche von etwa 400 px. Lass lieber diesen grauen Rest frei, als die Porträts zu strecken oder hochformatig zu machen.
- Kein Text, keine Nummern, keine Beschriftungen, keine Rahmen, keine Wasserzeichen.

REIHENFOLGE (von links nach rechts, dann nächste Zeile):
Zeile 1: 1 Normal, 2 Gesegnet, 3 Wahnsinnig, 4 Verflucht, 5 Krank
Zeile 2: 6 Betrunken, 7 Gelähmt, 8 Versteinert, 9 Vergiftet, 10 Schlafend

AUFBAU JEDES PORTRÄTS (in allen zehn gleich): Brustbild, frontal, Blick in die Kamera (außer 10), Kopf füllt etwa drei Viertel der Höhe, Augenlinie bei etwa 40 % der Höhe, Gesicht mittig, Schultern unten angeschnitten. Gleiche Kamera, gleiches weiches Licht von links oben, derselbe ruhige, dunkle, leicht unscharfe Hintergrund in einem Farbton in allen zehn Porträts. Die Augen stehen in allen zehn auf derselben Höhe.

DIE ZEHN ZUSTÄNDE (immer dieselbe Figur: gleiche Gesichtszüge, Frisur, Haarfarbe, Kopfschmuck, Kleidung; es ändern sich nur Ausdruck, Hautton und die genannten Zeichen):
1 Normal: neutraler, wacher, ruhiger Blick, Mund geschlossen, gesunde Hautfarbe.
2 Gesegnet: mildes, heiteres Lächeln, Augen weich und leicht nach oben, warme goldene Haut, dünner leuchtender goldener Heiligenschein schwebend über dem Kopf, vollständig im Bild.
3 Wahnsinnig: weit aufgerissene Augen mit sichtbarem Weiß und kleinen Pupillen, breites verzerrtes Grinsen mit Zähnen, Stirn in Falten, Brauen ungleich hoch.
4 Verflucht: niedergeschlagen, Mundwinkel hängen, Brauen innen hochgezogen, matter Blick nach unten, schwere Lider, fahle graue Haut, Augenringe; kein Fluchsymbol.
5 Krank: angewidert und leidend, Nase gerümpft, Zunge etwas herausgestreckt, gefurchte Stirn, müde feuchte Augen, blasse Haut mit roten Fieberflecken; kein Blut, keine Beulen.
6 Betrunken: breites, schiefes, seliges Lachen, Augen halb geschlossen, Kopf leicht geneigt, deutlich gerötete Wangen und Nase; kein Glas, keine Flasche, keine Herzchen.
7 Gelähmt: erstarrt, Augen weit offen und starr, Mund leicht offen wie im stummen Schreck, Brauen hoch, Haut leicht blass; kein Funken, kein Eis.
8 Versteinert: das Gesicht ist zu Stein geworden: Haut, Haar und Schmuck in mattem warmem Grau-Beige mit Steinmaserung und feinen Rissen, leere glanzlose Augen, eingefrorener Ausdruck. Die Frisur hat dieselbe Form, Länge und Anordnung wie in den anderen neun Porträts, nur in Stein. Entsättigt, aber das Gesicht bleibt wiedererkennbar. Keine Statue als Ganzes, kein Sockel.
9 Vergiftet: grünlich-fahle Haut (kräftiges, nicht neonfarbenes Grün auf Gesicht und Hals), Schweißglanz auf Stirn und Schläfen, glasige Augen, schmaler zusammengepresster Mund, übel. Haare und Schmuck behalten ihre Farbe.
10 Schlafend: Augen fest geschlossen, Mund geschlossen und entspannt, Kopf eine Spur zur Seite geneigt, Haut normal, Licht eine Spur dunkler; kein „Zzz“, kein Kissen.

MALSTIL (in allen zehn gleich): handgemaltes Ölporträt (oder deckende Gouache) auf Leinwand mit sichtbarem, ruhigem Pinselduktus, besonders in Haar und Hintergrund; weiche gemalte Kanten ohne schwarze Umrisslinie; gedeckte, leicht warme Farben, getönte Schatten (nie reines Schwarz), ein weiches Hauptlicht mit schwachem Randlicht an Haar und Schulter; feine Leinwandstruktur, die bei kleiner Größe nicht flimmert. Augen, Mund und Brauen am feinsten ausgearbeitet, Haare, Kleidung und Hintergrund lockerer. Leicht überzeichneter Ausdruck wie in einem gemalten Bühnenporträt, aber nicht comichaft. Kein Foto, kein 3D-Render, kein Cel-Shading, kein Anime.

Gib genau ein Bild aus.
```

**Beispiele für `[Charakterbeschreibung]`** (mit Artikel „einen“; Aussehen, Haare, Kopfschmuck, Kleidung und Hintergrundfarbe angeben, damit sie in allen zehn gleich bleiben): „menschlichen Waldläufer mittleren Alters mit kurzem rotbraunem Haar, Narbe über dem linken Auge, Lederkragen und moosgrünem Umhang, Hintergrund dunkles Waldgrün“; „Zwergen-Kleriker mit geflochtenem grauem Bart, Eisenreif auf der Stirn und blauer Kutte, Hintergrund dunkles Blau“.

**Wenn die Zellen trotzdem hochformatig kommen:** als Folgenachricht senden: „Die Porträts sind hochformatig. Erzeuge dasselbe Bild neu mit exakt quadratischen Porträts (288 × 288 px) und lasse unter dem Raster eine einfarbig graue Fläche von etwa 400 px frei. Gleiche Figur, gleiche Zustände.“

**Kommen die Zellen hochformatig und das Neuwürfeln hilft nicht:** nicht stauchen, sondern die Zellen einzeln links und rechts ergänzen lassen, siehe Abschnitt 5b.

**Nach der Erzeugung:**
1. Das Raster oben herausschneiden: 1536 × 624 px ab Oberkante (liegt es mittig statt oben, den tatsächlichen Raster-Ausschnitt nehmen).
2. Die Zellen ausschneiden: Zelle (Spalte c, Zeile r, jeweils ab 0) hat die Ecke x = 16 + c × 304, y = 16 + r × 304 und die Größe 288 × 288; weicht das Ergebnis um einige Pixel ab, die graue Fläche als Maß nehmen.
3. Jede Zelle auf 192 × 192 px verkleinern und gemäß Abschnitt 1 benennen; Abnahme nach Abschnitt 6.

## 5b. Hochformatige Zellen quadratisch machen (Governor „Image Reference“)

Stand 25. 11. 2026. Liefert ChatGPT trotz Prompt hochformatige Zellen (so geschehen bei beiden ersten Ergebnissen: Raster 1536 × 1024, Zellen rund 291 × 487 px), muss man nicht neu würfeln: Die Zellen werden einzeln ausgeschnitten und vom Modell **links und rechts um die fehlenden Teile ergänzt**. Die Zustände, die Gesichter und der Malstil bleiben dabei erhalten; das hat bei beiden Helden funktioniert.

**Werkzeug:** App „Image Reference“ des Governors (`POST /app/image_reference/generate`, Modell Flux.2 Klein 4B, ein Referenzbild je Auftrag, Ergebnis 1024 × 1024 bei `resolution=square-1024`). Anbindung: `tools/assets/fx/gov_ref.py` (Geschwister von `gov.py`, multipart wegen der Bilddatei; Token und Adresse nur über `GOV_TOKEN` und `GOV_URL`, nie ins Repository). Zuschnitt und Raster: `tools/assets/fx/state_sheet.py`. Ein Auftrag dauert 40 bis 60 s, die Aufträge laufen nacheinander (20 Zellen ≈ 15 min); Aufruf mit `run_in_background`.

**Ablauf:**
1. Zellen ausschneiden: `python -I tools/assets/fx/state_sheet.py cut <ergebnis.png> <ordner> <präfix>` erkennt die grauen Zwischenräume selbst und schreibt `<präfix>_01_normal.png` … `<präfix>_10_sleeping.png` (2 px Rand weg, damit kein Grau mitkommt).
2. Je Zelle ein Auftrag, `jobs.json` im Format von `gov_ref.py` (`name`, `reference`, `prompt`, `resolution`, `seed`), danach `GOV_TOKEN=… GOV_URL=http://sam:8080 python -I tools/assets/fx/gov_ref.py <jobs.json> <ausgabe>`. **Immer derselbe Seed** (hier 1) für alle Zellen eines Helden.
3. Raster zusammensetzen (Zelle 288 px, 16 px Zwischenraum `#7F7F7F`, also 1536 × 624 wie in 5a): `python -I tools/assets/fx/state_sheet.py sheet <ordner> <präfix> <ausgabe.png>`.

**Prompt (Grundform, wirkt mit dem Original-Hochformat als Referenz):**

```
Extend the missing parts of the picture left and right. Keep the person, hair, jewellery and background unchanged.
Both shoulders and upper arms are covered by the same dark teal garment with a wide V-neckline, no bare shoulders.
```

Der erste Satz stammt vom Nutzer („Extend the missing parts of the picture left and right“) und genügt für das Gesicht. Die Kleidungsangabe (zweiter und dritter Satz, Farbe und Schnitt des jeweiligen Helden einsetzen) ist **nötig**, siehe Befunde. Zustandsabhängige Zusätze:

| Zustand | Änderung am Prompt |
|---|---|
| Blessed | anhängen: `Keep the golden halo above the head complete.` (der Ring blieb ohne Zusatz nicht immer vollständig) |
| Petrified | Kleidungssatz ersetzen: `Both shoulders and upper arms are covered by short sleeves of the same wide V-neck garment as in the other portraits, carved in the same grey-beige stone as the face. No bare shoulders, no bare arms, no sleeveless top.` |
| alle anderen | Grundform |

**Befunde (Versuche am selben Tag):**
- **Nur der Satz des Nutzers, ohne Kleidung:** das Modell erfindet die Seiten jedes Mal neu. Bei Held 1 hatten 7 von 10 Bildern **nackte Schultern** (ärmelloses Oberteil), drei dagegen bedeckte; dazu schwankte die Kopfgröße (zwei Bilder deutlich näher herangezoomt). Das ist die Inkonsistenz, die der Prompt mit Kleidungsangabe beseitigt.
- **Kleidung im Prompt:** alle Zellen haben denselben V-Ausschnitt mit bedeckten Schultern, gleiche Kopfgröße, Augenlinie bei etwa 35 % der Höhe (die Vorgabe von Abschnitt 2 ist 40 %; die Augen stehen aber in allen zehn Bildern gleich hoch).
- **Versteinert** bekam mit dem allgemeinen Kleidungssatz blanke Steinschultern und -arme (Kleidung als ärmelloses Steinhemd); erst „short sleeves … carved in stone“ passt zu den anderen neun.
- **Selbst auf ein Quadrat gepolsterte Zelle als Referenz** (Zelle in der Mitte, Seiten aus verschmierten Randstreifen, auch mit Kleidungsprompt): schlechter. Die Streifen bleiben als dunkle Balken stehen. Nicht verwenden; die unveränderte Hochformat-Zelle ist die Referenz.
- Das Modell malt das Bild **neu** (nicht nur die Seiten): Kopf und Schmuck stimmen im Wesentlichen, Einzelheiten (Locken, Perlenkette, Hautstruktur) weichen vom Original ab. Wer das Original genau halten muss, braucht einen Raster-Satz ohne diesen Schritt (siehe 5a, Quadrate gleich beim ersten Mal).

**Ergebnis:** `zielbild/beispiel_handgemalt_held1.png` (lockige schwarze Haare, Perlenkette als Stirnschmuck über dem linken Auge) und `zielbild/beispiel_handgemalt_held2.png` (lange, wellige dunkle Haare, schlichte Kette mit türkisem Stein); beide 1536 × 624, zehn quadratische Zellen. Die 20 Zellen in voller Größe (1024 × 1024) liegen im Arbeitsordner `.ignore/zustaende/quadrat_final/` (Namen `h1_NN_<zustand>.png`, `h2_…`); der Ordner ist nicht im Repository.

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
