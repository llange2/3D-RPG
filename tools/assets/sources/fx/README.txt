Quellgrafiken für Partikel und Wassereffekte (gebaut von tools/assets/build-fx.ts nach public/assets/fx/*.webp)
================================================================================================================

Konvention aller additiven Bilder: gerader Alpha, Alpha = Intensität, RGB = die Farbe (die grauen Sprites sind weiß und lassen sich im Code einfärben).
Das Spiel mischt sie mit SRC_ALPHA + ONE; die Farbe unter Alpha 0 zählt nie (ein verlustbehafteter Encoder lässt dort Farbe hineinsickern).
fx_smoke.png, fx_water_flow.png und fx_water_drop.png: dasselbe, aber für normale Mischung (die Farbe zählt, der Alpha deckt).

Dateien
-------
fx_particles.png    1024x1024, Raster 8x8, Zellen 128x128, grau (im Code einfärben). Belegung: fx_particles.json (Zellindex und Quelle).
fx_smoke.png        1024x256, vier Wölkchen à 256x256, grau, gerader Alpha.
fx_impact_fire.png  2048x2048, Raster 4x4, 16 Bilder à 512x512, einmalig (zeilenweise abspielen), farbig. Zellmitte = Einschlagpunkt.
fx_impact_ice.png   dito
fx_impact_acid.png  dito
fx_impact_magic.png dito
fx_impact_water.png dito
fx_water_ripple.png 512x512, nahtlos in x und y (Lichtnetz eines Beckenbodens), hellblau-weiß, additiv.
fx_water_flow.png   128x512 (Breite x Höhe), nahtlos in x und y, blau (tiefblau bis hellblau) mit eigenem Alpha 0,3 bis 0,76, senkrechte Streifen. NICHT additiv: normale Mischung
                    (der Wasservorhang der Brunnen, auf einer hellen Wand würde Addieren Weiß ergeben).
fx_water_drop.png   148x256, das Tropfenbild des Nutzers (.ignore/water_drop.png), Spitze oben, blau, auf Tropfen zugeschnitten, Farbe unter dem Rand blau gesetzt. Normale Mischung.
fx_foam.png         512x512, nahtlos in x und y, weißer Schaum (Alpha = Intensität), additiv: der Uferschaum der Überwelt. Aus einem Flux.2-Bild (foam_f1, siehe tools/assets/fx/foam_tex.py).

Herkunft
--------
- Graue Partikel (Punkt, Ringe, Sterne, Funken, Rauch, Flammen, Magie, Wirbel, Blitze): Paket des Nutzers (Kenney "Particle Pack", CC0, vom Nutzer bestätigt).
- Tropfen, Blase, Eissplitter, Säureblase und die Einschlagbilder für Feuer und Eis: erzeugt mit dem AI Governor (Image Generator, Z-Image Turbo, 1024x1024,
  schwarzer Hintergrund). Einschlag Säure/Magie/Wasser, Säureklecks, Wasserkrone (Spritzerkrone) und Eiskristall (Schneeflocke): vom Nutzer neu erstellt.
  Die Flipbooks sind aus je einem Einschlagbild berechnet (wachsen, aufleuchten, vom Rand her ausbrennen, leichte Drehung).
  Ausnahme seit dem 19. 11. 2026: fx_impact_fire/ice/acid/magic sind die fertigen 4x4-Blätter des Nutzers (2048², `.ignore/impact_*.png`, auf Weiß bzw. Schachbrett), von
  build_fx.py (Modus `sheets`) nur noch in geraden Alpha umgerechnet; nur fx_impact_water kommt noch aus einem Einzelbild.
- Runder Tropfen (fx_particles Zelle 4) und die beiden Wassertexturen: prozedural (periodisches Rauschen bzw. iterierte Sinusverzerrung), daher nahtlos.
- Neu bauen: tools/assets/fx/README.md.
