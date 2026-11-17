Quellgrafiken für Partikel und Wassereffekte (gebaut von tools/assets/build-fx.ts nach public/assets/fx/*.webp)
================================================================================================================

Konvention aller additiven Bilder: gerader Alpha, Alpha = Intensität, RGB = die Farbe (die grauen Sprites sind weiß und lassen sich im Code einfärben).
Das Spiel mischt sie mit SRC_ALPHA + ONE; die Farbe unter Alpha 0 zählt nie (ein verlustbehafteter Encoder lässt dort Farbe hineinsickern).
fx_smoke.png: dasselbe, gedacht für normale Mischung.

Dateien
-------
fx_particles.png    1024x1024, Raster 8x8, Zellen 128x128, grau (im Code einfärben). Belegung: fx_particles.json (Zellindex und Quelle).
fx_smoke.png        1024x256, vier Wölkchen à 256x256, grau, gerader Alpha.
fx_impact_fire.png  1024x1024, Raster 4x4, 16 Bilder à 256x256, einmalig (zeilenweise abspielen), farbig. Zellmitte = Einschlagpunkt.
fx_impact_ice.png   dito
fx_impact_acid.png  dito
fx_impact_magic.png dito
fx_impact_water.png dito
fx_water_ripple.png 512x512, nahtlos in x und y (Lichtnetz eines Beckenbodens), hellblau-weiß, additiv.
fx_water_jet.png    128x512 (Breite x Höhe), nahtlos in der Höhe, senkrechte Wasserstreifen, an den Seiten weich auslaufend, additiv.

Herkunft
--------
- Graue Partikel (Punkt, Ringe, Sterne, Funken, Rauch, Flammen, Magie, Wirbel, Blitze): Paket des Nutzers (Kenney "Particle Pack", CC0, vom Nutzer bestätigt).
- Tropfen, Blase, Eissplitter, Säureblase und die Einschlagbilder für Feuer und Eis: erzeugt mit dem AI Governor (Image Generator, Z-Image Turbo, 1024x1024,
  schwarzer Hintergrund). Einschlag Säure/Magie/Wasser, Säureklecks, Wasserkrone (Spritzerkrone) und Eiskristall (Schneeflocke): vom Nutzer neu erstellt.
  Die Flipbooks sind aus je einem Einschlagbild berechnet (wachsen, aufleuchten, vom Rand her ausbrennen, leichte Drehung).
- Runder Tropfen (fx_particles Zelle 4) und die beiden Wassertexturen: prozedural (periodisches Rauschen bzw. iterierte Sinusverzerrung), daher nahtlos.
- Neu bauen: tools/assets/fx/README.md.
