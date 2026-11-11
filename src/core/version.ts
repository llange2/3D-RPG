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
 * 21 = the user's monster sheet (docs/RPG_0.1.xlsx): treasure levels and XP of the monsters changed, so the monsters of the interiors changed; the overworld holds
 * Monster Huts (`world/huts.ts`: ten monsters each within ten tiles, one hut per monster with an entity-9 value, two of each on large and huge worlds) and the wild
 * groups are the sheet's "x" monsters by the level of the spot (`world/difficulty.ts`), no longer drawn from the family of the biome.
 * 22 = twenty-fifth playtest: the towns of level 1 and 2 stand at the opposite ends of the start island (the level-2 monsters no longer roam next to Starthaven);
 * every Monster Hut stands once on every size of world, with 4, 6, 8 and 10 monsters (small, default, large, huge) within five tiles of it, and the huts keep much
 * more room from each other and from the start (`world/huts.ts`).
 * 23 = the safe zone round Starthaven (and the spot where a game begins) is three tiles (was twelve); the huts of levels 1 and 2 stand in the order of their monsters
 * outwards from the town, and the wild groups draw only monsters within 150 thousandths of the level of the spot (was 700).
 * 24 = twenty-sixth playtest: the wild groups are planned for the whole world island by island (a number that follows the land of the island, at least one on every island,
 * spread evenly and away from the huts) instead of drawn chunk by chunk; the sea has its own groups, picked by the distance from Starthaven; the stronger a monster, the farther it
 * stands from the first town in every level (huts and wild groups); the farther of the two main islands is level 5 and the other islands are level 4 or 5 by their distance from
 * Starthaven; the ground beside a place counts as open ground on an island without roads.
 * 25 = twenty-eighth playtest: the lava islands (the island of level 5 is always one; a large or huge world has a second; no other island has the climate) are rock
 * and lava all over, their ways are streams of lava one or two tiles wide that run through the mountains (`RoadSeg.lava`), walkable at the price of 25 points of fire damage
 * a step (`sim/lava.ts`); meadows and forests have patches of bare earth (`TileInfo.dirt`); the places of a lava island are fewer.
 * 26 = the ground cleared round a place on a lava island is one tile wide (was two) and lava (was plain ground).
 * 27 = quest document 1.2, first step: the caves and dungeons are no longer one of the 23 themes of the old maps but a quest (quest_1 to quest_6) in a layout, planned for the
 * whole world at once (`interiors/dungeonPlan.ts`): exactly five pyramids spread over the islands (the entrances of the spaceship's sections), the keys (up to nine) in the end rooms
 * of level 1 and 2 places and the key cards of the pyramids in those of level 4 and 5 dungeons, the 21 orbs on the level 5 dungeons; every place has an end room that opens when
 * its quest is solved (a sealed wall cell, or a pocket in the rock that a teleport reaches) and holds the quest items and 2 to 4 rewards of its level. The dungeons have four
 * layouts (tube, hub, maze, classic) and the caves three (ring, classic, big cave). There are exactly three castles (levels 2, 3 and 4; good, neutral, evil), each a keep of the
 * document in a yard (`interiors/castle.ts`), with a king, four statues that spell a word, two chests of 5 million gold and chests in the yard that raise an alarm. The pyramids
 * lead into one spaceship of five sections with airlocks (`interiors/spaceship.ts`); 25 Quatloo coins and 15 silver skulls hide in the chests, Seth Squirm and his machines stand in a dungeon of level 2. Levels and attribute points of the end rooms (and the chalices of the control deck) lie in chalices: the party picks the one hero who gets them.
 * 28 = the layouts dungeon_1 (tube) and dungeon_2 (hub) are compact: 8 to 15 rooms on a 72 x 72 map, about three wall cells between rooms and no corridor longer than 9 cells
 * (the tube winds up as a snake or a spiral, the hub is a star of two rings round the hall).
 * 29 = thirtieth playtest: no corridor of a dungeon is straight for more than eight cells (a stretch is cut by a bend round one cell of rock, the maze by swapping one of its
 * connectors for a wall between the two halves it leaves; `bendLongCorridors`, `shortenMazeStraights`); the carving of the moose king (item 125) is a wall hanging, so it no
 * longer counts as an object that blocks the cell in front of it.
 * 30 = 31st playtest: a castle is the keep alone (no yard; the gate is the way out and the party starts inside it), its alarm chests stand in the niches of the corridors with a
 * banner across from each, and the statue that wants the word stands out of every passage; Swamp Town (tier 4) has three brittle walls; the caves get islands of rock in their big
 * halls; every orb is a chest of its own.
 * 31 = 32nd playtest: the monster sheet's new treasure levels (Dragon Worm 4, Black Knight 5) change who lives where; the throne room of a castle always has two banners
 * beside the king.
 * 32 = 33rd playtest: the attribute points of an end room on levels 1 to 3 lie in a magic well, a barrel or crystals instead of a chalice (the chalice is for levels 4 and 5).
 * 33 = thievery locks: an ordinary chest carries a `difficulty` by tier (1 / 9 / 23 / 42 / 83, `data/locks.ts`), the chests of the castle too, and the king's chests ask 2 / 13 / 33 / 60 / 119 instead of tier + 1.
 * 34 = 34th playtest: every spell lies exactly twice in the world as a scroll (`planSpellLoot`, `scrolls` on the containers of caves, dungeons and castles of the spell's level), the
 * bookshelves (items 75 and 97) are containers, a chest without a lock springs a trap one time in five (`trapped`, `trapDamage`, `trapLevel`), the end rooms hand out no random scrolls any more.
 * 35 = 35th playtest: 0 to 3 treasure chambers behind brittle walls in every cave and dungeon (`DungeonRef.vaults`, `carveVaults`, `actions/vaults.ts`: a chest with twice the loot, one time in
 * ten points of an attribute or a resistance of the level below), a pile of bones hides something one time in five (`find`, a rat one time in five of those), the maze (dungeon_3) has ten
 * more groups of monsters (`MAZE_GROUPS`), Pandora's box is no starting spell and no scroll of a starting spell lies in the world (`isStartingSpell`).
 * 36 = 36th playtest: storage equipment (item 13) is searched like a pile of bones; quest 1 is never built in the maze (quest document 1.3); the heads in the corners of the field of
 * quest 1 look diagonally outward (`bearing`); no group of monsters starts on a cell where a rune, a wrong answer or a portal sets the party down, and the runes of the maze set it down
 * beside a room rather than in its middle.
 * 37 = 36th playtest, follow-up: no object is placed on a cell where a rune or a wrong answer sets the party down (the targets are reserved).
 * 38 = 37th playtest: a wild group above level 1 keeps `STRONG_KEEP_OFF` (12) tiles from Starthaven and the start (another island of level 4 can lie a few tiles off the first town on a small world).
 * 39 = 38th playtest: only the towns of the first tier have a healing fountain, and it is a random one of the town's fountains (it was the one nearest the middle); the fountain action
 * carries `full` (everything back up to level 10) instead of `heal`.
 * 40 = 39th playtest: brittle walls only lead to secrets (the treasure chambers of caves and dungeons, the vault of a castle, the hidden quarter of a town): the rule `breakable`
 * (anchor `wallBetween`) is gone from all four rule sets, it put walls between two parts of a place that the party reaches anyway (Pit of Ula, seed kelp-hold-768).
 * 41 = 40th playtest: the runes of quest 3 lie within three steps of the gong that sounds last (every gong has runes of its own, `placeRunes`, `finalGong`) instead of in the middle of the place;
 * the riddle list has no more anachronisms (telephone, piano, keyboard, postage stamp, tea, envelope, pencil, ...) and 18 riddles of the Middle Ages in their place.
 * 42 = 41st playtest: the Skull Miser leaves the cells of the town plan alone (he took the cartographer's cell of Starthaven) and every seller of the plan gets a place; the quest objects follow the passage rule;
 * a quest that teleports (1, 3) tries a pocket in every size before a sealed end room (the Grotto of Wilana had a sealed one, so the runes teleported nobody).
 * 43 = 42nd playtest: the riddle of the bulette is replaced by one of snow (#319); the end room of quest 2 lies next to the hall or is a pocket in the rock that runes in the hall lead to (it was sealed far away in the
 * maze of the Catacombs of Kela); a shop never stands on a street that goes on, it is dug into the house wall as a niche (the smith of Quinudale).
 * 44 = 43rd playtest: the ordinary monsters of a cave or dungeon are of the place's own level only (`pickMonsters`): the level 2 Cave of Aldoa let Vampire Bats and Wild Fungus of level 1 out of its gongs.
 * 45 = thievery locks grow with the level of the party (`data/locks.ts` `lockDifficulty`): `difficulty` of chests, king's chests and doors is only a marker (1, the doors' `=tier*2` is gone), a locked chest keeps a trap
 * for a failed attempt (`lockTrap`, `trapDamage`, `trapLevel`, `actions/lockTrap.ts`).
 * 46 = ue_quest_4 (quest document 1.4, the Pirate Queen): 20 Pearls of Youth and Beauty hide in the ordinary chests of the caves and dungeons of level 3 and 4 and in the alarm chests of the castles of level 3 and 4
 * (`DungeonRef.pearls`, `CastleLayout.pearls`).
 * 47 = the user's new village model: its door is at the right end of the front, so the road of a town ends at the right-hand one of its two entrance tiles (seen from outside; `poiEntrances`).
 * 48 = quest_7 (quest document 1.5, the spaceship): the bridge, control room, life support, storage bay and engine room in a grid with four airlocks and the console on the bridge; crates, power crystals,
 * computers with the code words of the mini quests, terminators; 8 orbs in the ship (none on the bridge) and 23 on the level 5 dungeons; the pyramid of the bridge stands on the hardest territory (`sectionOrder`).
 * 49 = the spaceship's objects (user, 6. 11. 2026): nothing in the room of a section's tube, crystals, orbs and crates spread over the rooms, objects never shut a passage (`blocksPassage`), two cells round the console free.
 * 50 = the spaceship (user, 6. 11. 2026): every robot of the game turns up in the four sections after the bridge (not only the ED-409), steps of one cell in its walls are smoothed away so that the round corner models fit (`straightenCorners`).
 * 51 = the spaceship's doors (user, 6. 11. 2026): a sliding door in each corridor that leaves a room, shut behind the party again (`actions/spaceship.ts`, param `slide`); the airlocks look the same but stay open.
 * 52 = the spaceship's doors stand only between straight walls (user, 6. 11. 2026): two cells of straight wall either side of a door (`straightFor`).
 * Also the shelter of a town (trees and rock three tiles from its footprint, `SHELTER_*` in `world.ts`) and at most three monsters within the action radius of a town's exit (`EXIT_MONSTER_LIMIT`: the huts keep out of it, the wild groups there are cut down).
 * 53 = the wall decorations of the dungeons (45th playtest, point 4): one kind per dungeon by the monsters that live in it, hung every ten cells on the walls (`data/wall-deco.ts`); the moose king left the random props.
 * 54 = the Capybara (user, 7. 11. 2026): the start town has one more brittle wall, behind which a one-cell pocket holds the Easter egg mascot (`CAPYBARA_POCKET` in `interiors/town.ts`, site `capybara`).
 * 55 = the 47th playtest: the maze (`dungeon_3`) is 25, 33, 39, 47 and 55 cells wide for level 1 to 5 (quest document 1.6); the wall decorations are picked so that every one turns up about equally often (the undead have the wizard and the witch, the beasts sometimes the lion or the moose, `ANY_PERMILLE`); the lava towns have white ambient light.
 * 56 = the 48th playtest, quest document 1.7: the tower (`dungeon_5`, `interiors/tower.ts`) is a layout of quests 2, 4 and 5: a round building of 2 or 3 floors on one map joined by stairs (a staircase and, on the floor above at
 * the same place, the Fort door that leads down), 2 x 2 tiles on the overworld with no road to it (a bare way of cleared ground, `RoadSeg.bare`, keeps it reachable; never on a lava island); Star Burst and Prismatic Light hit every
 * monster around the party (the plan of the world draws the layouts of quests 2, 4 and 5 from five dungeon layouts now, so most dungeons changed).
 * 57 = the tower optimisation (48th playtest, second list): a tower has no guillotine and pits and spear traps only on its ground floor (a magical trap in their place, `towerTrap`), no door beside a staircase, the staircase's
 * foot cell is open floor (`TowerLayout.stairs[].foot`, so the layout draws other rims), towers are named "Tower of ..." (`towerName`), and the Kudo crab lives on water only (`TERRAIN_OVERRIDES`).
 * 58 = the tower follow-up (bug_fix_46): the staircase turned a quarter circle clockwise from the wall (its end cell, not its foot, must be open), the wooden support beam is an edge decoration in regular patterns
 * in the big rooms of the dungeons and towers (`actions/beams.ts`, params `side`, `bearing`) and no longer one of the random props; a place that must hide a coin, a skull or a pearl always has an ordinary chest for it (`#chest_spare:0`).
 * 59 = the wooden stairs of the towers (49th playtest, point 3): the stairs fill their cell and rise a storey to the Fort door, so the staircase's foot cell is no longer kept open (`rimSpot`, other
 * rims are drawn); the cell above the stairs is a shaft one storey higher (`towerShafts`, rendering only).
 * 60 = the 51st playtest: a tower furnishes with the table, the intact bookshelf, the fireplace, the alchemy table, the table with food and stored goods first, never with a gravestone (`towerDecor`); the names of
 * dungeons, caves and towers have twice as many parts (`data/names.ts`); a locked place on a lava island has a lane of dirt cut into the rock for its hint wagon (`RoadSeg.alley`, `World.hintAlleys`).
 * 61 = the 52nd playtest: the king never shuts a way (`generateCastle`): the rock at the corners beside him gives way, so that his chamber of three cells has a step round him and the party reaches the king's
 * chests from the cell in front of him.
 * 62 = the 53rd playtest (bug_fix_50, third list): the end room of a tower is a pocket in the rock reached by teleport (`finishDungeon`, quests 4 and 5), no name is told twice in the hints of one word
 * (`letterHints`), the answer statue stands near the wall it opens by the way the party walks (`placeNearEnd`), a bookshelf only takes a cell with a wall beside it (`generateContent`) and a room with stone columns has
 * no wooden beams (`planBeams`).
 * 63 = the 55th playtest: the side rooms of a castle's keep hold something (a banner and a chest or provisions; below level 5 half of them behind a gate to pick, with a chest of the next level), the artifacts of the
 * three kingdoms lie in locked chests (`DungeonRef.artifacts`) and the king's henchman waits in each castle (`CastleLayout.keeper`), the towns of level 2 tell where Seth Squirm lives, one town of level 3 has the
 * quartermaster (`InteriorMap.townHints`), and the health of a hero counts Endurance a quarter, not a half (this one is no generator change, it moves the golden numbers of the heroes).
 */
export const GEN_VERSION = 63;
