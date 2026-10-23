/**
 * Version of the world generator. Saves store it next to the world seed.
 * Any change that alters generated output must bump this number and keep the old generator available,
 * otherwise existing saves would load a different world. The golden-hash tests fail on unannounced changes.
 */
/**
 * History: 1 = first release. 2 = places are single objects without a wall ring (3x3 tiles for towns and castles), towns
 * are compact (21 to 27 cells, a square with a fountain, no column blocks). 3 = every place is one tile, as on the old outside
 * map (the Village, Castle, Dungeon entrance and Cave entrance are about one cell wide), so the flattened ground around towns
 * and castles shrinks and the 3x3 block is gone. 4 = the world follows the old outside map: a place on every 13 x 13 tiles or so
 * instead of every 120 (a grid of cells per region, joined by a tree of roads), roads one tile wide, more mountains and groves,
 * a different mix of places (a third towns); castles are small compounds under the open sky (26 to 34 by 24 to 32 cells);
 * monsters never come from above the tier's own treasure level (they gave far more XP than the old maps at the same depth).
 * 5 = the overworld is as full as the finished strip of the old outside map: a place on a grid of 8-tile cells (about one per 14 x 14
 * tiles), wild monster groups 0-3 per chunk, wells, huts, caravans, stone heads and fountains as decoration (`DECO.LANDMARK`); castles
 * have no guillotine traps; the way out of every map is a wall flanked by walls on both sides; town houses of two cells get no door on that side.
 * 6 = woods and mountains: the flat start area shrinks from 30/56 to 18/34 tiles, forests are wood noise of about 56 tiles with up to 85 % of
 * the tiles blocked (the solid forest blocks of the old outside map), mountain ranges from their own noise (the top tenth of it) outside the
 * start area, so that no world is without mountains within a hundred tiles of the start.
 * 7 = no flat start zone: Starthaven lies in a basin framed by a ring of mountains and forest, like Fountain Head on the old outside map.
 * 8 = water monsters only in water: interiors and ambushes never draw from the aquatic theme (it has no land monster), a boss never comes
 * from it, and wild groups on land in the ocean biome use the beast family instead of piranhas.
 * 9 = mountain passes are at most five tiles long: the ranges are broken into lumps (World.lump), the middle of every range thicker than four
 * tiles is open highland (World.insideMass), and a road that keeps to the rock for three tiles or more is plain road at every third tile
 * (World.opensUp). Caves and dungeons have a theme of the old maps (data/dungeon-themes.ts: monsters, boss, trap, props, quest, keys); the
 * entrance of a key dungeon asks for its key and a pyramid for its key card; the cyber look is the pyramid's alone.
 * 10 = the changes of the twelfth playtest, entered as one version after they were mixed up with 8 and 9 by two agents working on the same files:
 * the world's own terrain begins right outside the ring of mountains and forest around Starthaven (the blend into the start climate and height
 * ends at `RING_REACH`, three tiles of transition, trees, rocks and landmarks fade out from the edge of the basin; before, up to 32 tiles of
 * flat meadow remained wherever the world has mountains: seed iron-vale-164). Together with 5 to 7 this is: a place on a grid of 8-tile
 * cells, wild groups 0-3 per chunk, landmarks, woods and ridges from their own noise, the basin with its ring, castles without guillotine
 * traps, exits and house doors in walls that continue on both sides.
 * 11 = no made-to-measure ground around Starthaven (no basin, no ring, no start climate): the town stands on the world's own terrain like every
 * town of the old outside map (on the shore, between mountains, in a wood), its entrance tile is always walkable and a road leaves it; the party
 * starts on the road a few tiles in front of the entrance, facing the town (`World.startPosition`); other places may stand 12 tiles from it.
 * 12 = fifteenth playtest: caves are 40 x 40 (were 80 x 80), every town has all seven services, pillars are floor cells with four columns
 * (`InteriorMap.pillars`, no solid pillar cells), the grey boulders (`DECO.ROCK`) of the overworld are gone, wild monsters and mascots only stand on
 * ground that is open to the party (`World.isOpenGround`: not walled in by mountains, trees or water).
 * 13 = sixteenth playtest: towns are the ground plans of the five hand-built towns of the old game, one per tier (Fountain Head, Baywatch, Wildabar,
 * Swamp Town, Blistering Heights; turned and mirrored by chance, `data/town-blueprints.ts`) with their shops, chests, fountains and the people who
 * sell talents (`talent` actions); a wall that can be broken looks like any other wall and needs the Perceptive talent (no strength roll); two doors
 * never follow each other directly; a theme's chest or shrine object is never also a plain prop; the caves of Fountain Head Cavern and the
 * Arachnoid Cavern sell talents, and the start region always has one of the former.
 * 14 = seventeenth session (the user's town list and object list): towns and castles stand on 2 x 2 tiles and pyramids (the dungeons that ask for a key
 * card, now known when the region is built, `planPlaces`) on 3 x 3, everything else on one; no message lies on the streets of a town any more, its
 * dead ends hold a person, a barrel or scenery, chests may be shut by a gate and guarded, the guild apprentice stands in every town and sells the
 * membership, the Crow's perch has a dead end of the start town; the old objects follow the user's list (`data/item-rules.ts`: no functional
 * object as plain decoration, objects only in the places the list names), so the props of several caves and dungeons changed and the caves no
 * longer sell talents (the lords stand in castles).
 * 15 = gongs may stand in caves again (the user corrected the object list): the Arachnoid Cavern's gongs are gongs, not mining tools.
 * 16 = nineteenth playtest: the places have an entrance side that every road ends at (`Poi.side`, it faces the place the road hangs on; roads are chains
 * of straight pieces with right-angle bends, `RoadSeg`, instead of wobbling curves); a place two tiles wide has two entrance tiles; the ground around a place
 * is cleared two tiles out (was one), so a place on a speck of land in the sea is an island; water beside land, a road or a bridge is shallow (a shore the
 * party can wade, `World.settle`); trees near roads and places stand on a loose lattice with at least two free tiles between them, the woods thin out over the
 * next four tiles (`VEG_NEAR`, `VEG_FAR`); landmarks the party could not get to are not built; places keep six tiles from each other (were five); towns get small
 * variations of the old ground plan (walls knocked through, dead ends filled, niches, walkable pillars, scenery), a portal near the way in, and the first
 * tier a job master.
 * 17 = twentieth playtest: the world is no longer endless. It is a globe of islands in deep water (`world/islands.ts`): four sizes (small 70 x 70, default 100 x 100,
 * large 200 x 200, huge 300 x 300), a tile past the east edge is the first one in the west and the same north and south, and the land keeps five tiles from the
 * seam (the shore and at least four deep tiles round it). An island has one climate, a level (tier) by its distance from the start island, and 1 to 4 towns
 * per level by size (`WorldSize.towns`); the places stand on the islands (one in about 60 land tiles), the roads join the places of an island, a region of the old
 * generator is an island now (`p:<island>:0:<index>`, key chains per island) and the chunk is 10 x 10 tiles (the sizes are multiples of ten). Castles are good, neutral or
 * evil with their banner and monsters, and keep treasure vaults (`interiors/fortress.ts`); the monster of a level never exceeds the level (`pickMonster`); the town's
 * portal stands in a niche and no object shuts a passage (`town.ts`).
 * 18 = twenty-first playtest: the sizes are small 70 x 100, default 140 x 200, large 210 x 300 and huge 280 x 400 (towns per level 1, 2, 3, 4), and the layout follows
 * the user's rules (`world/islands.ts`): levels 1 and 2 share the big start island (level 1 on one side of its axis, level 2 on the other), a bridge joins it with the
 * level-3 island, levels 4 and 5 have an island of their own and never share one, and the sea between them fills with small islands of level 4 or 5 (the bigger the
 * world, the more of them); the islands are rounder (`SHAPE_AMPLITUDE`) and a good quarter of the world is land. No object stands in a passage of one cell or shuts a
 * wider one (`interiors/passage.ts`: vessels in the towns, decoration, chests and the like in every place), and a column has no wall within a cell of it.
 * 19 = twenty-second playtest: the world is wider than it is high (small 100 x 70, default 200 x 140, large 300 x 210, huge 400 x 280); no island is a circle any
 * more (`world/islands.ts`: each is a raster of its own made of ellipses, a triangle or a bay, warped and roughened: a continent with arms and a bay, ovals with bulges,
 * triangles, strips, rings of land round a bay with a small island in it); there are never more small islands than big ones and the number of big ones grows with the world
 * (the number of big ones follows the land share asked for: 50, 46, 43 and 40 %); the sea at the edge is two tiles at least; a lava island is ringed by mountains with one way in (`World.coastRing`); rivers by climate (meadow and swamp
 * have them, desert and lava none) and an inland water at most three tiles wide is shallow throughout (`World.narrowInland`).
 * 20 = twenty-third playtest: a door of a town stands in a wall that goes on on both sides (no free cell beside the wall cell that carries a shop's door or the way out),
 * and a wall that gives way is never beside a shop.
 */
export const GEN_VERSION = 20;
