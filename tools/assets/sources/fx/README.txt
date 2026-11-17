Quellgrafiken für Partikel und Wassereffekte (noch nicht in der Pipeline eingebunden)
=====================================================================================

Konvention aller additiven Bilder: RGB = Farbe x Intensität (vormultipliziert, Schwarz = unsichtbar), Alpha = Intensität.
Sie funktionieren so mit additiver Mischung unverändert; die grauen lassen sich im Code einfärben.
Ausnahme fx_smoke.png: gerader Alpha (normale Mischung).

Dateien
-------
fx_particles.png    1024x1024, Raster 8x8, Zellen 128x128, grau (im Code einfärben). Belegung: fx_particles.json (Zellindex und Quelle).
fx_smoke.png        1024x256, vier Wölkchen à 256x256, grau, gerader Alpha.
fx_impact_fire.png  1024x1024, Raster 4x4, 16 Bilder à 256x256, einmalig (zeilenweise abspielen), farbig. Zellmitte = Einschlagpunkt.
fx_impact_ice.png   dito
fx_impact_acid.png  dito
fx_impact_magic.png dito
fx_impact_water.png dito (optional)
fx_water_ripple.png 512x512, nahtlos in x und y (Lichtnetz eines Beckenbodens), hellblau-weiß, additiv.
fx_water_jet.png    128x512 (Breite x Höhe), nahtlos in der Höhe, senkrechte Wasserstreifen, an den Seiten weich auslaufend, additiv.

Herkunft
--------
- Graue Partikel (Punkt, Ringe, Sterne, Funken, Rauch, Flammen, Magie, Wirbel, Blitze): Paket des Nutzers aus .ignore/PNG
  (512 px, grau; es sieht aus wie das "Particle Pack" von Kenney, das als CC0 gilt: bitte bestätigen).
- Tropfen, Spritzerkrone, Blase, Eissplitter, Schneeflocke, Säureklecks, Säureblase und die Einschlagbilder (Feuer, Eis, Säure, Magie, Wasser):
  erzeugt mit dem AI Governor (Image Generator, Modell Z-Image Turbo, 1024x1024, schwarzer Hintergrund), danach per Skript auf Zellen gefittet;
  die Flipbooks sind aus je einem Einschlagbild berechnet (wachsen, aufleuchten, vom Rand her ausbrennen, leichte Drehung).
- Runder Tropfen (fx_particles Zelle 4) und die beiden Wassertexturen: prozedural (periodisches Rauschen bzw. iterierte Sinusverzerrung), daher nahtlos.
