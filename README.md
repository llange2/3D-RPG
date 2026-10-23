# MM3 Seed RPG

Browser rewrite of `../old_code` (Python/Ursina "Might & Magic III" remake): TypeScript, Babylon.js, Vite, Vitest.
Two ways to play, both with the old game's rules and artwork:

- **Endless world** (`?seed=...`): overworld with biomes, roads, rivers and towns, castles, dungeons and caves whose insides
  are generated from the seed. Each place is one object on the map, as on the old game's outside map: walk into it to
  enter. Actions (chests, doors, traps, shops, shrines, fountains...) are placed by data-driven rules.
- **Campaign**: the 34 hand-built maps of the old game (plus its test map) with their quests, riddles and puzzles.
  Start it from the title screen (`New game`, then `New campaign`) or with `?campaign=1` (a map slug works too, e.g. `?campaign=outside`).

Full plan: `C:\Users\spend\.claude\plans\based-on-the-game-sequential-scone.md`.
Technical handover for the next developer or agent (architecture, determinism rules, pipelines, open points): `docs/HANDOVER.md`, working rules in `CLAUDE.md`.

## Play

`npm run dev`, then open <http://localhost:5173/>. Move W A S D / arrow keys, turn Q E, attack Space, spells F,
inventory I, rest R, map M, quest log J (campaign), menu Esc, quick save F5, quick load F9. The endless world and the campaign
keep separate saves, so one of each can be played side by side (title screen: `Continue the world` / `Continue the campaign`).
The spell menu (F) ends with the last spell cast and who cast it (quick cast), greyed out when it cannot be cast.

Overworld: it is flat and its woods and mountains are the old game's tile models (as on the old outside map), and so are the ground
tiles (grass, snow, swamp, desert, dirt: bushes, stones and tufts, simplified to about 200 triangles, drawn within one chunk of the
party; farther away the flat ground texture is all there is). Places and short one-tile roads are about as dense as there. With the
`flat` ground (below) the painted ground tiles of `terrain/flat` take their place.

Options (title screen and Esc menu, `Options`): switches that only turn a draft over; `Apply` (right of `Back`) puts all of them into effect at
once, `Back` drops them. Ground and floors (3D or flat: the overworld, the outdoor cells of campaign maps, dungeon floors; towns always have
their flat floor; flat is the painted ground tiles with their transitions, 3D the old ground models), models (low poly or original: all
models, ground tiles and monsters; the original set brings the full ground tiles of the old game, 5 to 7 million triangles), distance
(close, medium, far: 2, 3 or 4 chunks around the party; close is clear for 10 tiles and fully fogged at 15, medium for 22 and 38; `?view=`
overrides it), resolution (normal or low: the picture is rendered smaller), show FPS, music and sound effects. Only the models restart the
page (the game is saved first); everything else applies at once. The choices are remembered.

Models: the game shows the reduced low-poly models by default. After `npm run assets:originals`, `Models: original` in the options
switches to the unreduced originals (sharper props, several times the graphics memory). The switch saves the game and
reloads the page; the choice is remembered, `?models=original|lowpoly` overrides it.

Map (M): the wheel or + and - zoom (around the pointer), dragging or the arrow keys move the map, `Whole map` (F) shows a whole level,
`My position` (C) comes back.

Guild: it sells the spell scrolls of all three schools in the band of its level (guild 1: spells of level 2 to 5, guild 2: 6 to 10 ...);
a scroll is read with a right click in the backpack, where the class and level of the spell decide. Two-handed weapons push the shield
into the backpack when they are put on (one free place more is needed when weapon and shield are both worn).

## Commands

| Command | Purpose |
|---|---|
| `npm run data:export` | Parses `old_code/g.py` (no Ursina import) into `src/data/raw/*.json`, fails on wrong table counts |
| `npm run data:maps` | Exports the 35 campaign maps (`*.map` pickles, read without running the old code) to `public/assets/campaign/` |
| `python -I tools/export/export_item_models.py` | Which model, size (per axis) and pose (pitch, roll, yaw offset) the old game used for each map decoration (`src/data/item-models.json`) |
| `npm run data:validate` | zod schemas, key/id consistency, text-id ranges, asset references |
| `npm test` | Vitest (generator, rules, simulation, campaign data and engine) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run assets:build` | Textures, models, audio, manifest with size budget check |
| `npm run assets:originals` | Optional, ~470 MB, ~5 min: the unreduced models (no triangle budget, full textures) into `public/assets/models-original/` for the menu's `Models` switch; not part of the size budget |
| `npm run assets:report` | Size report plus provenance ledger of `old_code/resources` into `tools/assets/reports/` |
| `npm run golden:update` | Rewrites `tests/golden/world-hashes.json` (only after bumping `GEN_VERSION` on purpose) |
| `npm run check:chrome` | Hashes of worlds, interiors and actions computed in Node and in Chrome must match (needs `npm run dev`) |
| `npm run check:render` | In Chrome: all 91 monsters keep their textures after others of their type were removed, a town opened after a dungeon wears its own textures, nothing of a campaign map stays in a generated world (needs `npm run dev`) |
| `npm run check:models -- <outDir>` | In Chrome: the menu's model switch (low poly, reload into the same game with originals only, back, fallback when the originals are not built, campaign) with screenshots (needs `npm run dev` and `npm run assets:originals`) |
| `npm run check:effects -- <outDir>` | In Chrome: own mouse pointer, a projectile for ranged attacks and attack spells, the healing picture over a portrait, screenshots (needs `npm run dev`) |
| `npm run check:spells -- <outDir>` | In Chrome: the spell window (all 36 plates of the biggest school, pictures, costs), casting from it, travelling and item spells, screenshots (needs `npm run dev`) |
| `npm run data:spells` | Spell names and descriptions from the user's workbook, undead from the monster sheet (`src/data/spell-sheet.json`, `monster-groups.json`) |
| `npm run data:monsters` | All monster stats, abilities, XP, treasure level and Monster Hut XP from the user's workbook `docs/RPG_0.1.xlsx` (`src/data/monster-sheet.json`) |
| `npm run sheet:projectiles -- <outDir>` | Side view of the six projectiles in flight, to check by eye which way they point (needs `npm run dev`) |
| `npm run sheet:monsters -- <outDir>` | Contact sheets of all 91 monsters seen from the front, to check by eye which way they face (needs `npm run dev`) |
| `npm run bench -- overworld\|interior\|campaign` | Frame times, draw calls and triangles over a fixed camera path in Chrome (needs `npm run dev`) |
| `npm run balance -- 150 1,2,3 2` | Headless fights of the default party against monster groups of each tier |
| `npm run dev` / `npm run build` | Vite dev server / production build |

`tools/dev/play.ts` drives the game in Chrome from a list of steps (keys, clicks, evals, screenshots); `GAME_QUERY="&campaign=1"`
adds URL parameters.

## Rules for generator code (`src/core`, `world`, `interiors`, `actions`, `sim`, `campaign`)

- All randomness comes from `src/core/rng.ts`. No `Math.random`, `Math.sin`, `Math.cos`, `Math.pow`, `Math.exp`.
- Every decision is a pure function of `(worldSeed, layer, coordinates)`. Never read neighbouring chunks.
- Changing generated output requires bumping `GEN_VERSION` (`src/core/version.ts`) once saves exist.
- These modules must not import DOM or Babylon, so they run in Node, Vitest and Web Workers.

## Layout

```
src/core        PRNG, integer noise, version
src/world       biomes, rivers, roads, POIs, chunk generation, wild monster spawns
src/interiors   dungeon, cave, fortress and town generators, topology analysis
src/actions     action registry, rule engine, anchors, validation, effect handlers
src/campaign    hand-built maps: model with change tracking, block catalogue, legacy action engine
src/sim         characters, items, combat, spells, economy (ports of the old formulas)
src/render      Babylon.js: terrain chunks, interior and campaign views, props, monsters, sky
src/game        game loop, state and saves, minimap, benchmark
src/ui          HUD, dialogs, shops, inventory
tools           asset pipeline (sharp, gltf-transform, meshoptimizer, ffmpeg) and data export
tests           unit tests, golden hashes
```

## Campaign notes

- Cells keep the old editor's absolute coordinates; `CampaignMapModel` converts to the grid (the old y axis points north) and
  records every change (broken walls, opened gates, moved chests) as overrides that go into the save.
- `src/campaign/engine.ts` ports the quest, riddle and puzzle actions of `action_handler.py` (50 action ids). It is headless
  and talks to the game through `CampaignUi` and `CampaignPort`, so `tests/unit/campaign-engine.test.ts` plays it with a script.
- Where the old maps contain mistakes, the game repairs them instead of crashing: transfers to a wrong or missing cell arrive
  in front of the way back (4 of them), a misspelled map name has an alias, `0/0` means "no target", and a start position in
  the void moves to the biggest walkable region. Password riddles (action 22) ask the question of the party's own list so that
  the hints of NPCs and taverns match the lock.
- Differences on purpose: a key is taken after "yes", not before the question; the endless-dungeon exit (action 51) only
  shows its text; map decorations without an old model (three generic persona cubes) are not drawn.

## Status

| Milestone | State |
|---|---|
| M0 scaffold, data export, asset report, provenance ledger | done |
| M1 deterministic generator (world, interiors, 500 seeds per interior kind, identical in Node and Chrome) | done |
| M2 overworld rendering (biomes, sky, fog, props, roads) | done |
| M3 interiors with themes | done |
| M4 rule engine, handlers, monsters, loot | done |
| M5 party, combat, spells, shops, UI | done |
| M6 save and load, audio, balance, performance | done (KTX2 not done: `toktx` is not available here; textures stay WebP) |
| M7 campaign import | done: 35 maps, 50 action ids, quest log, portals, saves |

Measured on an RTX 3060 Laptop in headless Chrome (1920x1080), see `npm run bench`:

| Scenario | Average FPS | Worst 1% | Draw calls (max) | Triangles (max) |
|---|---|---|---|---|
| overworld | 373 | 167 | 95 | 482k |
| generated interiors | 245 | 56 | 92 (budget 80) | 173k |
| campaign maps | 524 | 128 | 227 | 413k |

Total assets 108 MB (core 14 MB), budget 250 MB.
