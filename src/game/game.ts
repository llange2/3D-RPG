import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { BLOCKS as CAMPAIGN_BLOCKS } from "../campaign/blocks";
import { LegacyEngine, hasItem, textOf, tidy, trapReloading, trapRotation, type CampaignHost } from "../campaign/engine";
import { arrival, loadCampaignMap } from "../campaign/loader";
import type { CampaignMapModel } from "../campaign/model";
import { crossesSlab, slabBetween, stepFacing, type SlabMap } from "../campaign/slabs";
import { CAMPAIGN_START, facingOfRotation, mapSlugOf, type TrapKind } from "../campaign/types";
import { CampaignView } from "../render/campaignView";
import { ACTION_DEFS, actionTrigger, blocksCell, buildMapContent, heapGone, isLastingTrap, isReloadingTrap, isSpent, isTrapAction, validateContent } from "../actions";
import { resolveAction, type ActionContext, type Effect } from "../actions/handlers";
import type { ActionInstance, MapContent } from "../actions/types";
import { AudioManager } from "../audio/audio";
import { LAYER, Rng, rngFor, seedFromString } from "../core/rng";
import { GEN_VERSION } from "../core/version";
import { OVERWORLD_THEMES } from "../data/overworld-themes";
import { endFlag, isEndBoss, ringBlocked } from "../actions/quests";
import { KING_GREETING, guardsOf, type Alignment } from "../data/castles";
import { BLACK_CARD, ORB, ORBS_FOR_KING, SKULL, SKULLS_FOR_RING } from "../data/quest-table";
import { CONSTANTS, MAP_ITEMS, MONSTERS, QUEST_ITEMS, RIDDLES_MASTER, RUMORS, SPELLS, TEXTS, talentInfo } from "../data/tables";
import { CELL, SHOWCASE_ID, generateInterior, planDungeon, type Facing, type InteriorMap } from "../interiors";
import { inEndRoom } from "../interiors/endRoom";
import { MONSTER_STEP_SECONDS, MonsterRenderer } from "../render/monsters";
import { TextureCache, fetchJson, type MonsterModelInfo, type StaticModelInfo } from "../render/assets";
import { ChunkManager } from "../render/chunkManager";
import { LAMP_RANGE, VIEW_DISTANCES, VIEW_FOG_RANGE, VIEW_SHARE, chunkRadius, createRenderer, readViewDistance, type Renderer, type Resolution, type ViewDistance } from "../render/engine";
import { groundHeightAt, setTileModels, tileCenterX, tileCenterZ } from "../render/heights";
import { doorLook, doorModelKeys, doorSound } from "../render/interiorDoors";
import { INTERIOR_MODELS, InteriorView, brokenWallModelKeys, castleGateModelKeys, caveModelKeys, pillarModelKeys, roundModelKeys } from "../render/interiorView";
import { themeModelKeys } from "../render/interiorProps";
import { trapKindOf, trapModelKeys } from "../render/interiorTraps";
import { ITEM_LAMPS, LOOT_LAMP, MONSTER_LAMPS, crystalLamps, lampSource, type LampKind, type LampSource, type MonsterLamp } from "../render/lamps";
import { cellCenterX, cellCenterZ } from "../render/interiorMesher";
import { TerrainMaterials } from "../render/materials";
import { markResume, readModelSet, registryFile, storeModelSet, takeResume, type ModelSet } from "../render/modelSet";
import { PropRenderer } from "../render/props";
import { PROJECTILE_MODELS, Projectiles, flightSeconds, type Point, type ProjectileKind } from "../render/projectiles";
import { afterFrames, whenDrawable } from "../render/ready";
import { SkyDome } from "../render/sky";
import { LANDMARK_MODELS, groundPropLift, landmarkItemAt, setFlatGround, setUltraGround, tileModelKeys, type PropInstance } from "../render/terrainMesher";
import { FLAT_TERRAINS, type FlatRegister } from "../data/flatTerrain";
import { FlatTileSet } from "../render/flatGround";
import { ITEM_MODELS, itemModelKey, itemProp } from "../render/itemProps";
import { addCondition, canAct, recalcValues, xpToNextLevel } from "../sim/character";
import { conditionEventText, type ConditionEvent } from "../sim/conditions";
import { cellAt, centreOn, clampCells, fitMap, panBy, zoomStep, type MapViewport, type ZoomLimits } from "./mapView";
import { monsterById } from "../sim/combat";
import { walkOnLava } from "../sim/lava";
import {
  battleActor, cancelRifts, createEncounter, createMonster, identifyMonsters, immobilize, isAdjacent, isPhased, makeClumsy, monsterTurn, monstersReaching, nearestInCone, partyAttack, phaseMonsters, pullMonsters,
  specialSpell, spellInLine, spellRound, updateBattleMode, GRAVITY_RADIUS, IMMOBILIZE_TURNS, MONSTER_ACTION_RADIUS, PHASE_RADIUS, PHASE_TURNS,
  type CombatEvent, type Encounter, type GridView, type MonsterInstance,
} from "../sim/encounter";
import { ACTION_MINUTES, activeCharacters, addXp, advanceTime, carriedItems, giveItem, takeItems, canSail, canSwim, hasEffect, isDefeated, isNight, MINUTES_PER_DAY, rest, setMascot, stepMinutes, surroundings } from "../sim/party";
import { RIFT_TURNS, SPELL_AGING, castSpell, isAttackSpell, learnBlock, movesParty, needsAdjacent, quickCast, type FizzleReason, type PandoraOutcome, type SpellResult } from "../sim/spells";
import { canCombine, combine, combineGroups, duplicate, duplicableSlots, ringSlots, transformRing } from "../sim/itemSpells";
import { pickGateSpot, safeCells, type Spot } from "./spellSites";
import { pickFromBackpack } from "../ui/itemSpells";
import { visibleCells } from "../sim/vision";
import type { Character, Place, TimedEffect } from "../sim/types";
import { BIOME, CHUNK_SIZE, DECO, DEFAULT_WORLD_SIZE, GROUND, WORLD_SIZES, isTileWalkable, parseWorldSize, poiEntrances, wrap, wrapDelta, type Poi, type PoiKind, type TileInfo, type WorldSize } from "../world/types";
import { chunkSpawns, type OverworldSpawn } from "../world/spawns";
import { World } from "../world/world";
import { MinimapIcons } from "./minimapIcons";
import { MAP_OPEN_CELLS, OVERWORLD_LEGEND, type MapEvent, describeInteriorCell, describeOverworldTile, drawInteriorMap, drawOverworldMap, hasHiddenUse, interiorLegend } from "./minimap";
import { FACING_VEC, PlayerRig, type MoveDir } from "./player";
import { DEBUG_MENU, DEBUG_GOLD, DEBUG_LEVELS, debugAllSpells, debugAllTalents, debugGold, debugLevels, maintainGod, setGodMode, teleportTargets } from "./debug";
import { identifyLines } from "./identify";
import { PERSONAS, personaModelId, personaYaw } from "../data/personas";
import { sellerParams } from "../data/talent-sellers";
import { CARAVAN_ITEM, caravansIn, caravansOf, type CaravanSpot } from "../world/caravans";
import { BURNT_HUT_ITEM, HUT_ITEM, HUT_ITEMS, HUT_MODELS, HUT_RADIUS, hutGold, hutIndex, hutXpPercent, slotDistance, slotKey, type HutSpot } from "../world/huts";
import { hutScene } from "../data/hut-texts";
import { generateItem, generateRing, questItem } from "../sim/items";
import { cheats } from "../sim/cheats";
import { readSettings, writeSettings, type Settings } from "./settings";
import { Explored, fromSaveFile, spanOf, isCampaignPlace, kindOfState, newCampaignState, newGameState, readSave, describeSave, writeSave, GAME_KINDS, SAVE_SLOTS, type GameKind, type GameState, type LootPile, type SaveFile, type SaveSlot } from "./state";
import { askSpellDetails, openInventory, pickSpell, quickCastOption, type CharacterView, type SpellChoice } from "../ui/panels";
import { openService, serviceMusic } from "../ui/services";
import { setAnimatedTown } from "../ui/townScenes";
import { BIRD_PERCH, BLUE_MUSHROOM, MASCOT_ASK, MASCOT_ITEM, isSolidSpotItem, mascotSpotItem } from "../data/mascots";
import { propLine } from "../data/prop-texts";
import { BOON_SPENT, boonText } from "../data/boon-texts";
import { BOON_HOURS, applyBoon } from "../sim/boons";
import { landmarkBoon, type LandmarkBoon } from "./landmarkBoons";
import { SKULL_MISER_MET, lockSeenFlag, reachedFlag, worldQuestLog } from "./questLog";
import { overworldMascotSpots, townMascotSpot, type MascotSpot } from "../world/mascots";
import { START_TOWN_ID, innStart, portalStart } from "../actions";
import { cureEffects, protectionEffect } from "../ui/avatarFx";
import { cursorStepped, setCursorFade } from "../ui/cursor";
import { h } from "../ui/dom";
import { thousands } from "../core/format";
import { UI, randomSeed, type HudInfo, type Option } from "../ui/ui";
import { TRAP_RELOAD_STEPS, type ServiceKind } from "../actions/registry";

type Mode = "title" | "overworld" | "interior";

/** The options while they are being turned over in the dialog: the stored settings and the model set (which is stored on its own). */
type OptionsDraft = Settings & { models: ModelSet };

interface CampaignRuntime {
  slug: string;
  model: CampaignMapModel;
}

interface InteriorRuntime {
  poi: Poi;
  map: InteriorMap;
  content: MapContent;
  blocked: Set<number>;
  actionAt: Map<number, ActionInstance>;
  /** Campaign maps only: cells monsters must not enter (action 26) and the model behind the map. */
  noMonster?: Set<number>;
  /** Campaign maps only: brittle walls the party can step up to (they are in `blocked` for everybody else), with the border their wall piece stands on. */
  slabs?: SlabMap;
  campaign?: CampaignRuntime;
}

/** Prefix of the keys in `state.opened` that say which town portals the party has touched. */
const PORTAL_KEY = "portal@";

const ATTACK_SOUND: Record<string, number> = { acid: 9025, fire: 9027, ice: 9026, magic: 9029, physical: 9015, poison: 9025 };
/** What a spell of an element throws (old items 9018 to 9022). A monster's physical shot is an arrow, a spell's is the "physical attack". */
const SPELL_PROJECTILE: Record<string, ProjectileKind> = { acid: "acid", poison: "acid", fire: "fire", ice: "ice", magic: "magic", physical: "physical" };
const monsterProjectile = (damageType: string): ProjectileKind => (damageType === "physical" ? "arrow" : SPELL_PROJECTILE[damageType] ?? "magic");

/** The campaign's open country. Every other campaign map is a town, castle, dungeon or cave. */
const CAMPAIGN_OUTSIDE = "outside";

/**
 * What the loading screen's percentage stands for: the map's data is in at 10 %, its models at 50 %, the scene is built at
 * 60 %; the rest is the wait until the scene can draw all of it.
 */
const LOAD_DATA = 0.1;
const LOAD_MODELS = 0.5;
const LOAD_BUILT = 0.6;

type PartyAttackEvent = Extract<CombatEvent, { type: "party_attack" }>;

/** Said when a spell that would carry the party away is cast in melee, and when the party tries to step away from it. */
const IN_MELEE_SPELL = "That spell cannot be cast during a fight: the party cannot leave its field while monsters are next to it.";
const IN_MELEE_STEP = "The party cannot step away from a fight: monsters are next to it.";
/** How many open quests of the generated world the short list beside the minimap shows. */
const HUD_QUESTS = 3;
const HUD_QUEST_CHARS = 42;

/** What a spell that did not work says, by reason (the rest read "The spell fizzles (reason)"). */
const FIZZLE_TEXT: Partial<Record<FizzleReason, (caster: string) => string>> = {
  mana: (n) => `${n} lacks the spell points.`,
  in_town: () => "It is too dangerous to cast Pandora's box in a town.",
  in_battle: () => IN_MELEE_SPELL,
  no_beacon: (n) => `${n} has not lit a fire to go back to yet. Set one first.`,
  no_food: () => "The party has no food to rest on.",
  no_effect: () => "It would have no effect.",
  cannot_revive: () => "Nobody can bring that hero back: no Endurance is left.",
  no_hp: (n) => `${n} has too few hit points to pay for it.`,
  needs_target: () => "That spell needs somebody else to work on.",
  cannot_act: (n) => `${n} cannot act.`,
};

/** What a spell that lasts says when it is cast: the caster, and the hero it works on. */
const BUFF_TEXT: Partial<Record<TimedEffect["kind"], (caster: string, target: string) => string>> = {
  stone_skin: (_, t) => `${t}'s skin turns to stone: more armor, but half the speed.`,
  rage: (_, t) => `${t} flies into a rage: more damage, but half the armor.`,
  power_shield: () => "A shield of force surrounds the party and takes a tenth off every blow.",
  detect_monster: () => "The monsters of the land show themselves on the map.",
};

const VIEW_NAMES: Record<ViewDistance, string> = { close: "Close", medium: "Medium", far: "Far" };
/** Loudness of the music and the effects when switched on (the menu only turns them on and off). */
const MUSIC_VOLUME = 0.45;
const SFX_VOLUME = 0.7;
/** How much of its daytime colour the distance fog keeps at night (the sky and the ground are as dark by then, a bright fog would stand out as a white wall). */
const NIGHT_FOG = 0.05;
/** Chunks around the party (of 10 x 10 tiles) whose wild monsters are alive: nine across, which is 90 tiles, more than any view distance reaches. */
const SPAWN_CHUNKS = 4;

/** Reveal map in the campaign's outside map, which has no edge: half the side of the square it uncovers, in tiles. */
const REVEAL_RADIUS = 150;
/** Seconds between the noise of a chest opening and the sound of what is in it. */
const CHEST_SOUND_GAP = 0.35;
/** Monsters of an ambush or a spawn action fade in over this long (seconds). */
const APPEAR_SECONDS = 0.3;
/** A Monster Hut is drawn when it lies within this many tiles of the party (the farthest view is four chunks). */
const HUT_REACH = 60;
/** The Monster Huts refill once a week of game time. */
const HUT_WEEK = 7 * MINUTES_PER_DAY;
/** Caravans are looked up for the towns within this many tiles of the party's chunk (the farthest view is four chunks). */
const CARAVAN_REACH = 40;
/** How far from the party the debug menu looks for a place to identify in the open country (tiles). */
const IDENTIFY_RADIUS = 14;
/**
 * The light the party carries (see `Atmosphere.torch`): it lights four cells around it, eight with the Light spell (two cells more than
 * at first, from the user's playtests; 1.465 * (1 - 3.5 / 25) = 1.26 keeps the near field as bright as before). Linear falloff to the range, so the intensity makes up for the near wall being less lit than with
 * the old, longer reach: it is set so that what is a cell away (3.5 units from the light) is as bright as it was with three and six
 * cells (calibrated against screenshot 18 of the old game: 1.4 * (1 - 3.5 / 10.5) = 1.26 * (1 - 3.5 / 13.5) = 0.93), and only the reach grows.
 */
/** Models of the mascots' places: the five mascots, the empty bird perch and the empty blue mushroom. */
const MASCOT_MODELS = [...Object.values(MASCOT_ITEM), BIRD_PERCH, BLUE_MUSHROOM].map((id) => itemModelKey(id)).filter((k): k is string => !!k);
/** The old item 126 "Float": the raft the party stands on while it crosses deep water (Walk on Water, Seafarer). */
const RAFT_ITEM = 126;
const RAFT_OWNER = "raft";
/**
 * Height of the deck above the water: the old raft stood 26 cm out of it and looked like a plate lying on the sea. Lower than about 10 cm the painted ground tiles
 * (drawn with a depth bias, `FLAT_Z_OFFSET`) swallow it a few cells away: at 6 cm only the ends of the planks showed.
 */
const RAFT_DECK = 0.18;
/** The raft is the old model scaled evenly, see below. */
const RAFT_SCALE = 3;
/** The model's height (`Float.glb`, 0.269 high before scaling) and its lowest point, which the prop renderer rests on `y` less 2 cm. */
const RAFT_Y = RAFT_DECK + 0.02 - 0.269 * RAFT_SCALE;
/**
 * The raft is scaled evenly (stretching only its width and length made it a thin plate): the camera stands 1.7 above the water and sees the ground only from
 * about 2.6 units away, so the raft lies in front of the party and a third of its length (`RAFT_VISIBLE`) reaches into the picture.
 */
const RAFT_LENGTH = 1.89 * RAFT_SCALE;
const RAFT_VISIBLE = 1 / 3;
/** The share of the lower half of the picture that is free of the party's portraits and buttons: the visible third of the raft starts at their top edge (about 600 of 720 pixels). */
const RAFT_FREE_VIEW = 2 / 3;
/** Distance from the camera at which that edge meets the deck (camera 1.7 up, half the vertical field of view 0.575). */
const RAFT_SIGHT_START = (1.7 - RAFT_DECK) / (Math.tan(0.575) * RAFT_FREE_VIEW);
/** How far ahead of the party the raft's middle lies, so that `RAFT_VISIBLE` of its length starts at `RAFT_SIGHT_START`. */
const RAFT_AHEAD = RAFT_SIGHT_START - RAFT_LENGTH * (0.5 - RAFT_VISIBLE);

const TORCH = { range: 13.5, intensity: 1.26 };
const TORCH_LIT = { range: 25, intensity: 1.465 };
/**
 * Map objects of the campaign that give light (their item numbers): where the old game only drew them, they light their
 * surroundings here, about one cell around (`LAMP_RANGE` is set in the engine), the others (`render/lamps.ts`, which also lights the
 * objects of generated places) further. `y` is the height of the light.
 */
const LAMPS: Readonly<Record<number, LampKind>> = ITEM_LAMPS;
/** The monsters that glow, by the number in the monster table (`MONSTER_LAMPS` names them). */
const MONSTER_GLOW: ReadonlyMap<number, MonsterLamp> = new Map(Object.values(MONSTERS).flatMap((m) => (MONSTER_LAMPS[m.name] ? [[m.id, MONSTER_LAMPS[m.name]!] as [number, MonsterLamp]] : [])));
/** Lamps farther from the party than this are ignored (units); the pool serves the nearest ones. */
const LAMP_REACH = 18;
const LAMP_INTENSITY = 1.7;
/** Seconds a lamp takes to fade in or out of a light of the pool. */
const LAMP_FADE = 0.4;
/** The noise of a trap going off. The pit has none here: its stones fall once, when it opens (`useAction`); the magic trap sounds like its element's spell. */
const TRAP_SOUND: Record<string, number> = { spring: 9036, guillotine: 9042, steal_gold: 9038 };

/** How the save slots are named in the load lists of the title screen and of the menu. */
const SLOT_NAMES: Record<SaveSlot, string> = { manual: "Saved game", quick: "Quicksave (F5)", auto: "Autosave" };
const KIND_NAMES: Record<GameKind, string> = { world: "World", campaign: "Campaign" };

export class Game {
  mode: Mode = "title";
  world!: World;
  state!: GameState;
  /** The model set in use. Differs from the stored choice only when the originals were asked for but are not built. */
  modelSet: ModelSet = "lowpoly";
  private originalsBuilt: boolean | null = null;
  private r!: Renderer;
  private textures!: TextureCache;
  private terrain!: TerrainMaterials;
  private sky!: SkyDome;
  private props!: PropRenderer;
  private projectiles!: Projectiles;
  /** Bumped when the scene changes, so effects scheduled for the old scene do nothing. */
  private fxEpoch = 0;
  /** `performance.now()` until which a volley is in the air; the party does not shoot or cast in the meantime. */
  private volleyUntil = 0;
  private monsters!: MonsterRenderer;
  private chunks: ChunkManager | null = null;
  private interiorView!: InteriorView;
  private campaignView!: CampaignView;
  private campaignDirty = false;
  private pendingTravel: { slug: string; x: number; y: number; rot: number } | null = null;
  private pendingArrival: { x: number; y: number } | null = null;
  readonly ui = new UI();
  readonly audio = new AudioManager();
  private staticInfo: Record<string, StaticModelInfo> = {};
  private player!: PlayerRig;
  private enc: Encounter = createEncounter();
  private interior: InteriorRuntime | null = null;
  private overworldSpawns = new Map<string, OverworldSpawn[]>();
  private sceneInst!: SceneInstrumentation;
  private fog = { r: 0.8, g: 0.88, b: 0.95, d: 0.011 };
  private fpsSmooth = 60;
  private frameTimes: number[] = [];
  private busy = false;
  /** The facing the HUD showed last. */
  private hudFacing: Facing | null = null;
  private over = false;
  private minimapDirty = true;
  /** The symbols of the old game's map (one sheet); null until it has loaded, then the maps use it. */
  private minimapIcons: MinimapIcons | null = null;
  private lastAutosave = 0;
  private lootOwner = "loot";
  private lightLevel = 1;
  private lamps: LampSource[] = [];
  /** The gold light of every pile of loot on the map (`renderLoot`). */
  private lootLamps: LampSource[] = [];
  /** The lights of the pool (`Renderer.lamps`) and the lamp each one holds now, with how bright it is (0 to 1). */
  private lampSlots: { lamp: LampSource | null; level: number }[] = [];
  /** Whether the lamp pool also serves the monsters that glow (`MONSTER_GLOW`): in the interiors of generated places. */
  private glowMonsters = false;
  private readonly glowModels: ReadonlySet<number> = new Set(MONSTER_GLOW.keys());
  /** Whether the overworld is drawn with the old game's tile models on flat ground (the setting, or `?tiles=`). */
  private tileModels = true;
  private viewDistance: ViewDistance = "medium";
  private settings: Settings = readSettings();
  /** `performance.now()` of the last update of the frame counter (it is redrawn four times a second). */
  private fpsShownAt = 0;
  /** The painted ground tiles of the flat mode; null when they are not built, and the ground stays 3D then. */
  private flatTiles: FlatTileSet | null = null;

  /** `progress` is told how far the start is (0 to 1), for the message that stands in until the first screen. */
  static async create(canvas: HTMLCanvasElement, progress?: (share: number) => void): Promise<Game> {
    const g = new Game();
    await g.init(canvas, progress);
    progress?.(1);
    return g;
  }

  // ---------------------------------------------------------------- setup

  private async init(canvas: HTMLCanvasElement, progress?: (share: number) => void): Promise<void> {
    // before any chunk is built: the terrain heights and the party's eyes depend on whether the overworld is flat (tile models)
    // generated levels are always flat: the tile models (mountains, woods) are made for level ground, rolling terrain was dropped
    this.tileModels = true;
    setTileModels(this.tileModels);
    this.viewDistance = readViewDistance(this.settings.viewDistance);
    this.r = createRenderer(canvas, this.settings.resolution);
    progress?.(0.05);
    this.audio.enableButtonSounds();
    this.audio.setMusicVolume(this.settings.music ? MUSIC_VOLUME : 0);
    this.audio.sfxVolume = this.settings.sfx ? SFX_VOLUME : 0;
    setAnimatedTown(this.settings.animatedTown);
    setCursorFade(this.settings.fadeCursor);
    this.textures = new TextureCache(this.r.scene);
    this.terrain = new TerrainMaterials(this.r.scene, this.textures);
    this.flatTiles = await this.loadFlatTiles();
    progress?.(0.1);
    this.sky = new SkyDome(this.r.scene, this.textures);
    this.props = new PropRenderer(this.r.scene);
    this.projectiles = new Projectiles(this.props);
    const [staticInfo, monsterInfo] = await this.loadModelRegistries(readModelSet());
    progress?.(0.15);
    // the model switch covers the ground too: the original set brings the full ground tiles of the old game, the reduced one the reduced tiles
    setUltraGround(this.modelSet === "original");
    this.staticInfo = staticInfo;
    this.monsters = new MonsterRenderer(this.r.scene, monsterInfo, staticInfo);
    this.interiorView = new InteriorView(this.r, this.textures, this.props, staticInfo);
    this.interiorView.setModelFloor(this.settings.floorModel);
    this.interiorView.setViewShare(VIEW_SHARE[this.viewDistance]);
    this.campaignView = new CampaignView(this.interiorView, this.props, staticInfo, this.monsters);
    this.campaignView.setViewShare(VIEW_SHARE[this.viewDistance]);
    this.applyGround();
    // the map symbols load beside everything else; until they are there (or if the sheet is missing) the maps are coloured squares
    void MinimapIcons.load().then((icons) => {
      this.minimapIcons = icons;
      this.minimapDirty = true;
    });
    await this.props.preload(staticInfo, [...tileModelKeys(), ...LANDMARK_MODELS, ...MASCOT_MODELS, ...HUT_MODELS, ...(itemModelKey(RAFT_ITEM) ? [itemModelKey(RAFT_ITEM)!] : []), "poi_town", "poi_castle", "poi_dungeon", "poi_cave", "poi_pyramid", "obj_loot", ...PROJECTILE_MODELS], (share) => progress?.(0.15 + 0.8 * share));
    this.sceneInst = new SceneInstrumentation(this.r.scene);
    this.sceneInst.captureFrameTime = true;

    this.player = new PlayerRig({
      // in melee the party holds its field: a step is refused (the bump says why, `onBlocked`)
      // the melee flag is looked at afresh before every step: whatever ended the fight (a spell, the Wolf, a trap), a party with no monster beside it walks on
      canEnter: (x, y) => {
        if (this.enc.battleMode) updateBattleMode(this.enc, this.player.tx, this.player.ty, this.gridView());
        return !this.enc.battleMode && this.canEnter(x, y);
      },
      heightAt: (x, y) => this.heightAt(x, y),
      stepStarted: (x, y) => this.onStepStarted(x, y),
      arrived: (x, y) => void this.onArrived(x, y),
      blocked: (x, y) => void this.onBlocked(x, y),
    });

    this.ui.onCard = (i) => void this.openInventory(i);
    this.ui.onAction = (a) => void this.onAction(a);
    this.ui.onQuests = () => void this.openQuestLog();
    this.ui.onMascot = () => void this.openInventory("mascot");
    window.addEventListener("keydown", (e) => this.onKey(e));
    this.r.scene.getEngine().getRenderingCanvas()?.addEventListener("pointerdown", (e) => {
      if (e.button === 0 && this.mode !== "title" && !this.ui.modalOpen) void this.attackFocus();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.mode !== "title" && !this.over) this.save("auto");
    });
    this.r.engine.runRenderLoop(() => this.frame());
  }

  /** The register of the painted ground tiles (`npm run assets:textures`), or null when it is missing or has no plain tile for a terrain. */
  private async loadFlatTiles(): Promise<FlatTileSet | null> {
    try {
      const set = new FlatTileSet(await fetchJson<FlatRegister>("terrain/flat/tiles.json"));
      if (FLAT_TERRAINS.every((t) => set.has(t))) return set;
      console.warn("flat ground tiles: a terrain has no plain tile, the ground stays 3D");
    } catch (e) {
      console.warn("flat ground tiles are not built (npm run assets:textures), the ground stays 3D", e);
    }
    return null;
  }

  /**
   * The ground follows the floor choice: the painted tiles when floors are flat (and built), the old ground models otherwise. That is the
   * overworld, the outdoor cells of campaign maps and, through `InteriorView.setModelFloor`, the floors of dungeons and towns. The
   * overworld's chunks need `ChunkManager.rebuild` after a change; the interior and campaign views redraw themselves.
   */
  private applyGround(): void {
    const tiles = this.settings.floorModel ? null : this.flatTiles;
    setFlatGround(tiles);
    this.interiorView.setFlatTiles(tiles);
    this.campaignView.setFlatGround(tiles !== null);
  }

  /** Registries of a model set. The originals are optional: when they are not built, the low-poly set is used instead. */
  private async loadModelRegistries(set: ModelSet): Promise<[Record<string, StaticModelInfo>, Record<string, MonsterModelInfo>]> {
    try {
      const registries = await Promise.all([fetchJson<Record<string, StaticModelInfo>>(registryFile("static", set)), fetchJson<Record<string, MonsterModelInfo>>(registryFile("monsters", set))]);
      this.modelSet = set;
      return registries;
    } catch (e) {
      if (set === "lowpoly") throw e;
      console.warn("original models are not built (npm run assets:originals), using the low-poly set", e);
      return this.loadModelRegistries("lowpoly");
    }
  }

  /** Whether the originals are built, so the menu can say so before it reloads the page. */
  private async haveOriginals(): Promise<boolean> {
    // the dev server answers a missing file with the index page, so the registry is parsed instead of trusting the status
    this.originalsBuilt ??= await fetchJson(registryFile("static", "original")).then(
      () => true,
      () => false,
    );
    return this.originalsBuilt;
  }

  /**
   * Continues the autosave without the title screen when the page was reloaded by the model switch (`switchModelSet`).
   * Returns false when this load is not such a reload.
   */
  async resumeAfterReload(): Promise<boolean> {
    const kind = takeResume();
    if (kind === null) return false;
    const save = readSave(kind === "campaign" ? "campaign" : "world", "auto");
    if (!save) return false;
    await this.loadFromFile(save);
    return true;
  }

  /** Shows the title screen and starts or continues a game. */
  async start(defaultSeed: string): Promise<void> {
    this.mode = "title";
    this.ui.setHudVisible(false);
    this.audio.setAmbient(new Map());
    this.audio.playMusic(9000);
    const choice = await this.ui.title({ seed: defaultSeed || randomSeed(), size: parseWorldSize(new URLSearchParams(location.search).get("size")), saves: this.titleSaves(), onOptions: () => void this.optionsMenu() });
    this.audio.play(9001);
    if (choice.action === "load") await this.loadFromFile(choice.save);
    else if (choice.action === "campaign") await this.newCampaign(choice.seed);
    else await this.newGame(choice.seed, true, choice.size);
  }

  /**
   * What "Load game" on the title screen offers. The world and the campaign are saved apart: the autosave of each is its
   * "Continue" entry, below them come the saves made in the menu and by F5. Slots without a save are left out.
   */
  private titleSaves(): Option<SaveFile>[] {
    const out: Option<SaveFile>[] = [];
    for (const kind of GAME_KINDS) {
      const file = readSave(kind, "auto");
      if (file) out.push({ label: `Continue the ${kind === "world" ? "world" : "campaign"}`, value: file, note: describeSave(file) });
    }
    const continues = out.length;
    for (const kind of GAME_KINDS) {
      for (const slot of SAVE_SLOTS) {
        const file = slot === "auto" ? null : readSave(kind, slot);
        if (file) out.push({ label: `${KIND_NAMES[kind]}: ${SLOT_NAMES[slot]}`, value: file, note: describeSave(file), apart: continues > 0 && out.length === continues });
      }
    }
    return out;
  }

  /** A new game in the hand-built campaign maps. The seed only decides the party's password riddles. */
  async newCampaign(seed: string): Promise<void> {
    this.setSeedInUrl(seed);
    this.world = new World(seed);
    this.state = newCampaignState(seed);
    this.over = false;
    await this.beginPlay();
    this.ui.log("The campaign begins in Fountain Head. Press J for your quest log.", "info");
  }

  /** `inTown`: begin on the street in front of the inn of Starthaven (what a player gets); false begins outside on the road, for the tools that measure the overworld. */
  async newGame(seed: string, inTown = true, size: WorldSize = DEFAULT_WORLD_SIZE): Promise<void> {
    this.setSeedInUrl(seed, size);
    this.world = new World(seed, size);
    const start = this.world.startPosition();
    this.state = newGameState(seed, start, size);
    // a new game begins in Starthaven, on the street in front of the inn, with the back to its door
    const town = inTown ? this.world.poiById(START_TOWN_ID) : null;
    if (town) {
      const map = generateInterior(this.world, town, 0);
      const spot = innStart(map, buildMapContent(this.world, town, map));
      const front = this.world.frontOf(town);
      this.state.at = { mode: "interior", poiId: town.id, x: spot.x, y: spot.y, facing: spot.facing, ret: { x: front.x, y: front.y, facing: front.side } };
    }
    this.over = false;
    await this.beginPlay();
    this.ui.log(inTown ? `A new ${WORLD_SIZES[size].label.toLowerCase()} world: seed "${seed}". You stand on a street of Starthaven, in front of the inn.` : `A new ${WORLD_SIZES[size].label.toLowerCase()} world: seed "${seed}". Starthaven lies just ${{ N: "north", E: "east", S: "south", W: "west" }[start.facing]} of you.`, "info");
  }

  private async loadFromFile(file: ReturnType<typeof readSave> & object): Promise<void> {
    const size = parseWorldSize(file.state.size);
    this.setSeedInUrl(file.seed, size);
    this.world = new World(file.seed, size);
    this.state = fromSaveFile(file);
    this.over = false;
    if (file.genVersion !== GEN_VERSION) {
      this.ui.log(`This save was made with generator version ${file.genVersion}; the world may look different.`, "bad");
      if (!this.state.campaign) this.migrateSave(file.genVersion);
    }
    await this.beginPlay();
  }

  /**
   * A save of an older generator: the towns and the footprint of every place changed, so a position inside an interior
   * or next to a place would be a wall now. Leave the interior through its way out and forget what was explored there.
   */
  private migrateSave(fromVersion: number): void {
    const s = this.state;
    const at = s.at;
    // before version 17 the world was endless, before 19 the islands lay elsewhere (other sizes, shapes, levels per island): the coordinates mean nothing now (the
    // party could stand in the sea), so it starts again in front of Starthaven
    if (fromVersion < 19) {
      const start = this.world.startPosition();
      s.at = { mode: "overworld", x: start.x, y: start.y, facing: start.facing };
      s.explored = new Explored(spanOf(s.size));
      s.loot = {};
      s.visited = new Set();
      return;
    }
    if (at.mode === "interior" && !at.poiId.startsWith("campaign:")) s.at = { mode: "overworld", x: at.ret.x, y: at.ret.y, facing: at.ret.facing };
    s.explored.forgetInteriors();
  }

  /** The closest tile the party can stand on, for a position that is no longer free (a place was built over it). */
  private nearestWalkableTile(x: number, y: number): { x: number; y: number } {
    for (let r = 0; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (isTileWalkable(this.world.tile(x + dx, y + dy))) return { x: x + dx, y: y + dy };
        }
      }
    }
    return { x, y };
  }

  private setSeedInUrl(seed: string, size: WorldSize = DEFAULT_WORLD_SIZE): void {
    const params = new URLSearchParams(location.search);
    params.set("seed", seed);
    params.set("size", size);
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }

  private async beginPlay(): Promise<void> {
    cheats.god = false; // the debug cheats are for one game
    this.ui.setHudVisible(true);
    const at = this.state.at;
    if (isCampaignPlace(at) && this.state.campaign) {
      await this.openCampaignMap(at.poiId.slice("campaign:".length), { x: at.x, y: at.y, rotation: { N: 0, E: 90, S: 180, W: 270 }[at.facing] }, false);
      return;
    }
    // coming from the campaign (title screen, load, new game): its mountains, houses and fountains must not stay in the world
    this.campaignView.dispose();
    if (at.mode === "interior") {
      const poi = this.world.poiById(at.poiId);
      if (poi) {
        await this.openInterior(poi, { x: at.x, y: at.y, facing: at.facing }, at.ret);
        return;
      }
    }
    const loc = at.mode === "overworld" ? at : { x: this.world.startPosition().x, y: this.world.startPosition().y, facing: "N" as Facing };
    const free = isTileWalkable(this.world.tile(loc.x, loc.y)) ? loc : { ...loc, ...this.nearestWalkableTile(loc.x, loc.y) };
    await this.enterOverworld(free.x, free.y, loc.facing);
  }

  // ---------------------------------------------------------------- world access

  private currentTile(x: number, y: number): TileInfo {
    return this.world.tile(x, y);
  }

  private heightAt(x: number, y: number): number {
    if (this.mode === "interior") return 0;
    return groundHeightAt((tx, ty) => this.world.tile(tx, ty), x, y);
  }

  private cellIndex(x: number, y: number): number {
    return y * this.interior!.map.width + x;
  }

  private monsterAt(x: number, y: number): MonsterInstance | undefined {
    return this.enc.monsters.find((m) => m.hp > 0 && m.x === x && m.y === y);
  }

  /** The tile of a step in progress already belongs to the party: a monster that takes it meanwhile would be walked into. */
  private enteredByParty(x: number, y: number): boolean {
    const e = this.player.entering;
    return !!e && e.x === x && e.y === y;
  }

  private gridView(): GridView {
    if (this.mode === "interior" && this.interior) {
      const rt = this.interior;
      const { map } = rt;
      return {
        walkable: (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.cells[y * map.width + x] === CELL.FLOOR && !rt.blocked.has(y * map.width + x) && !rt.noMonster?.has(y * map.width + x) && !this.isClosedDoor(x, y) && !this.enteredByParty(x, y) && !this.mascotSpotAt(x, y),
        water: () => false,
        // campaign maps have open ground that blocks nothing (water) and tiles that do (mountains, forests)
        opaque: (x, y) => {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
          const i = y * map.width + x;
          const cell = map.cells[i];
          if (cell === CELL.LOW && map.styles) return !!map.styles.list[map.styles.cell[i]!]?.model;
          return cell !== CELL.FLOOR || this.isClosedDoor(x, y);
        },
        // the old game kept monsters from shooting past any item that blocks a cell (a closed gate above all), and here the
        // party's arrows and spells stop there as well; generated interiors keep their own rule, where only walls and closed
        // doors stop a shot
        obstacle: (x, y) => !!rt.campaign && rt.blocked.has(y * map.width + x),
        // the party can stand in front of a brittle wall's wall piece, and nothing reaches across it
        wallBetween: (x0, y0, x1, y1) => slabBetween(rt.slabs, map.width, x0, y0, x1, y1),
      };
    }
    return {
      walkable: (x, y) => {
        const t = this.world.tile(x, y);
        return isTileWalkable(t) && t.poiId === null && !this.enteredByParty(x, y) && !this.mascotSpotAt(x, y) && !this.caravanAt(x, y) && !this.hutAt(x, y);
      },
      water: (x, y) => {
        const g = this.world.tile(x, y).ground;
        return (g === GROUND.WATER || g === GROUND.SHALLOW) && !this.enteredByParty(x, y);
      },
      opaque: (x, y) => {
        const t = this.world.tile(x, y);
        return t.deco === 1 || t.ground === GROUND.MOUNTAIN || t.ground === GROUND.POI_BLOCK;
      },
    };
  }

  private isClosedDoor(x: number, y: number): boolean {
    const a = this.interior?.actionAt.get(this.cellIndex(x, y));
    return !!a && a.kind === "door" && !this.state.opened.has(a.uid);
  }

  private canEnter(x: number, y: number, ghost = false): boolean {
    if (this.over) return false;
    if (this.monsterAt(x, y)) return false;
    if (this.mascotSpotAt(x, y)) return false;
    if (this.caravanAt(x, y)) return false;
    if (this.hutAt(x, y)) return false;
    if (this.mode === "interior" && this.interior) {
      const { map, blocked } = this.interior;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
      const cell = map.cells[y * map.width + x];
      if (cell === CELL.LOW) return this.canCross(x, y);
      const i = y * map.width + x;
      // a brittle wall's cell is open to the party from the side opposite its wall piece; the wall piece itself is a wall
      const open = !blocked.has(i) || !!this.interior.slabs?.has(i);
      return cell === CELL.FLOOR && open && (ghost || !crossesSlab(this.interior.slabs, map.width, this.player.tx, this.player.ty, x, y)) && !this.isClosedDoor(x, y);
    }
    const t = this.world.tile(x, y);
    // shallow water (a ford, a shore) is swum, not walked: only for the Swimmer, and for whoever can cross deep water
    if (t.ground === GROUND.SHALLOW && t.deco === 0) return this.canSwim();
    if (isTileWalkable(t)) return true;
    // the Seafarer talent and spells let the party cross deep water as long as they last (lava is walked, and burns: `lavaStep`)
    if (t.deco === 0 && t.ground === GROUND.WATER) return canSail(this.state.party);
    return false;
  }

  private canSwim(): boolean {
    return canSwim(this.state.party);
  }

  // ---------------------------------------------------------------- mode changes

  private worldPos(x: number, y: number): { x: number; y: number; z: number } {
    if (this.mode === "interior") return { x: cellCenterX(x), y: 0, z: cellCenterZ(y) };
    return { x: tileCenterX(x), y: this.heightAt(x, y), z: tileCenterZ(y) };
  }

  /**
   * Puts the loading screen up and freezes the party, before the old scene is torn down. Every way into a map goes through
   * here and `endLoading`, like the old game's `load_entities`.
   */
  private async beginLoading(): Promise<void> {
    this.busy = true;
    this.player.locked = true;
    await this.ui.loading.show();
  }

  /**
   * The new scene is built: waits until it can draw all of it (textures in, shaders compiled, monster models instanced), so that
   * no prop shows up alone before the walls around it, and takes the loading screen down. The party can move again afterwards.
   */
  private async endLoading(): Promise<void> {
    const loading = this.ui.loading;
    loading.set(LOAD_BUILT);
    await this.monsters.whenIdle();
    await whenDrawable(this.r.scene, (share) => loading.set(LOAD_BUILT + (1 - LOAD_BUILT) * share));
    // two frames with everything in place, so that textures and buffers are on the graphics card before the screen goes
    await afterFrames(this.r.scene, 2);
    await loading.hide();
    this.player.locked = false;
  }

  /** The loading screen must not outlive a map that could not be loaded (the party would be stuck behind it). */
  private abortLoading(): void {
    void this.ui.loading.hide(0);
    this.player.locked = false;
    this.busy = false;
  }

  private async enterOverworld(x: number, y: number, facing: Facing): Promise<void> {
    await this.beginLoading();
    try {
      this.mode = "overworld";
      this.interior = null;
      this.interiorView.dispose();
      this.setLamps([]);
      this.monsters.clear();
      this.sceneChanged();
      this.enc = createEncounter();
      this.overworldSpawns.clear();
      this.props.setInstances(this.lootOwner, []);
      this.sky.setVisible(true);
      this.chunks?.dispose();
      this.chunks = new ChunkManager(this.world, this.r, this.terrain, this.props, chunkRadius(this.viewDistance));
      this.state.at = { mode: "overworld", x, y, facing };
      const p = this.worldPos(x, y);
      this.player.place(x, y, facing, p.x, p.z);
      this.chunks.update(x, y);
      this.chunks.loadAll();
      this.syncOverworldMonsters();
      this.renderLoot();
      this.markExplored();
      this.updateAmbient();
      await this.endLoading();
    } catch (e) {
      this.abortLoading();
      throw e;
    }
    this.audio.playMusic(2);
    this.busy = false;
    this.refresh();
  }

  /** Builds and shows the interior of a POI. `at` and `ret` are used when a save is restored. */
  private async openInterior(poi: Poi, at?: { x: number; y: number; facing: Facing }, ret?: { x: number; y: number; facing: Facing }): Promise<void> {
    // the step counts of an earlier game (a load) would keep traps reloading for good
    this.trapFired.clear();
    await this.beginLoading();
    let map: InteriorMap;
    try {
      map = generateInterior(this.world, poi, 0);
      const content = buildMapContent(this.world, poi, map);
      if (import.meta.env.DEV && !map.showcase) {
        const issues = validateContent(map, content);
        if (issues.length) console.warn(`interior ${poi.id} has content issues`, issues);
      }
      this.ui.loading.set(LOAD_DATA);
      await this.monsters.preload([
        ...content.actions.flatMap((a) => (typeof a.params.persona === "number" && (a.kind === "talent" || a.kind === "lore" || a.kind === "work" || a.kind === "king" || a.kind === "skullmiser") ? [personaModelId(a.params.persona)] : [])),
        ...(map.showcase ? [...map.showcase.monsters.map((m) => m.defId), ...map.showcase.personas.map((p) => personaModelId(p.persona))] : []),
      ]);
      await this.props.ensure(this.staticInfo, [...INTERIOR_MODELS, ...caveModelKeys(map), ...castleGateModelKeys(map), ...roundModelKeys(map), ...pillarModelKeys(map), ...doorModelKeys(map, content), ...brokenWallModelKeys(map, content), ...trapModelKeys(content), ...themeModelKeys(content)], (share) => this.ui.loading.set(LOAD_DATA + (LOAD_MODELS - LOAD_DATA) * share));
      // walls broken earlier are open
      for (const a of content.actions) if (a.kind === "breakable_wall" && this.state.broken.has(a.uid)) map.cells[a.y * map.width + a.x] = CELL.FLOOR;
      // the end room of a quest solved earlier is open
      const seal = map.dungeon?.endRoom?.seal;
      if (seal && this.state.opened.has(endFlag(map.key))) map.cells[seal.y * map.width + seal.x] = CELL.FLOOR;
      const blocked = new Set<number>();
      const actionAt = new Map<number, ActionInstance>();
      for (const a of content.actions) {
        actionAt.set(a.y * map.width + a.x, a);
        if (blocksCell(a) && !heapGone(a, this.state.opened)) blocked.add(a.y * map.width + a.x);
      }
      this.chunks?.dispose();
      this.chunks = null;
      this.monsters.clear();
      this.sceneChanged();
      this.props.setInstances(this.lootOwner, []);
      this.mode = "interior";
      this.interior = { poi, map, content, blocked, actionAt };
      this.syncQuestBlocks();
      this.enc = createEncounter();
      this.interiorView.show(map, content, this.state.opened, this.state.broken);
      this.setLamps(crystalLamps(content), true);
      this.sky.setVisible(map.theme.open);
      this.spawnInteriorMonsters();
      this.spawnPersonas();
      this.spawnShowcase();
      const start = at ?? map.spawn;
      // back out on the tile in front of the place, looking away from it
      const front = this.world.frontOf(poi);
      const returnTo = ret ?? { x: front.x, y: front.y, facing: front.side as Facing };
      this.state.at = { mode: "interior", poiId: poi.id, x: start.x, y: start.y, facing: start.facing, ret: returnTo };
      const p = this.worldPos(start.x, start.y);
      this.player.place(start.x, start.y, start.facing, p.x, p.z);
      this.interiorView.focus(start.x, start.y);
      this.state.visited.add(poi.id);
      this.renderLoot();
      this.markExplored();
      this.updateAmbient();
      await this.endLoading();
    } catch (e) {
      this.abortLoading();
      throw e;
    }
    this.audio.playMusic(map.theme.music);
    this.audio.play(9012);
    this.ui.toast(poi.name);
    this.busy = false;
    this.refresh();
    this.save("auto");
  }

  private async exitInterior(): Promise<void> {
    const at = this.state.at;
    if (at.mode !== "interior") return;
    this.busy = true;
    this.audio.play(9011);
    await this.enterOverworld(at.ret.x, at.ret.y, at.ret.facing);
    this.busy = false;
    this.save("auto");
  }

  // ---------------------------------------------------------------- monsters

  /** The old scene is gone: shots in the air vanish and effects that were still waiting for them are dropped. */
  private sceneChanged(): void {
    this.fxEpoch++;
    this.lootHeld.clear();
    this.volleyUntil = 0;
    this.projectiles.clear();
  }

  private monsterWorld(m: MonsterInstance): { x: number; y: number; z: number } {
    const def = monsterById(m.defId);
    const p = this.worldPos(m.x, m.y);
    if (this.mode === "overworld" && def.terrain === "water") p.y = -0.7;
    return p;
  }

  /** `fade` (seconds): the monster is not there when the scene is built but turns up (an ambush), so it fades in. */
  private addMonsterView(m: MonsterInstance, fade = 0): void {
    const p = this.monsterWorld(m);
    void this.monsters.add(m.uid, m.defId, p.x, p.y, p.z, null, fade);
  }

  /** Places members of a group on free tiles around a centre. */
  private placeGroup(uidBase: string, ids: number[], cx: number, cy: number, free: (x: number, y: number) => boolean): MonsterInstance[] {
    const placed: MonsterInstance[] = [];
    const taken = new Set<string>();
    const queue: [number, number][] = [[cx, cy]];
    const seen = new Set<string>([`${cx},${cy}`]);
    for (let head = 0; head < queue.length && placed.length < ids.length; head++) {
      const [x, y] = queue[head]!;
      if (free(x, y) && !taken.has(`${x},${y}`) && !this.monsterAt(x, y)) {
        const i = placed.length;
        const uid = `${uidBase}#${i}`;
        taken.add(`${x},${y}`);
        if (!this.state.killed.has(uid)) placed.push(createMonster(uid, ids[i]!, x, y));
        else placed.push({ uid, defId: ids[i]!, x, y, hp: 0 });
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (Math.abs(nx - cx) > 3 || Math.abs(ny - cy) > 3 || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
    return placed.filter((m) => m.hp > 0);
  }

  /** The persons of the old maps who sell talents stand on their cells (animated, they never move and never fight). */
  private spawnPersonas(): void {
    const rt = this.interior;
    if (!rt) return;
    for (const a of rt.content.actions) {
      const persona = a.kind === "talent" || a.kind === "lore" || a.kind === "work" || a.kind === "king" || a.kind === "skullmiser" ? a.params.persona : undefined;
      if (typeof persona !== "number" || !PERSONAS[persona] || !this.monsters.knows(personaModelId(persona))) continue;
      // they face the longest stretch of open ground next to them, the way a person in a street looks along it
      let bearing = 0;
      let longest = -1;
      for (const [facing, degrees] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const) {
        const [dx, dy] = FACING_VEC[facing];
        let run = 0;
        while (run < 8 && rt.map.cells[(a.y + dy * (run + 1)) * rt.map.width + (a.x + dx * (run + 1))] === CELL.FLOOR) run++;
        if (run > longest) {
          longest = run;
          bearing = degrees;
        }
      }
      const p = this.worldPos(a.x, a.y);
      void this.monsters.add(`npc:${a.uid}`, personaModelId(persona), p.x, p.y, p.z, { yaw: personaYaw(persona, bearing), idle: PERSONAS[persona]!.idle });
    }
  }

  /**
   * The debug showcase: every monster and every person of the game stands on its cell, facing the party. They are views only, no monster of the encounter,
   * so none of them fights, blocks a cell or can be shot at (`interiors/showcase.ts`).
   */
  private spawnShowcase(): void {
    const showcase = this.interior?.map.showcase;
    if (!showcase) return;
    for (const m of showcase.monsters) {
      if (!this.monsters.knows(m.defId)) continue;
      const p = this.worldPos(m.x, m.y);
      void this.monsters.add(`showcase:m${m.defId}`, m.defId, p.x, p.y, p.z);
    }
    for (const s of showcase.personas) {
      const model = personaModelId(s.persona);
      if (!PERSONAS[s.persona] || !this.monsters.knows(model)) continue;
      const p = this.worldPos(s.x, s.y);
      void this.monsters.add(`showcase:p${s.persona}`, model, p.x, p.y, p.z, { yaw: personaYaw(s.persona, 180), idle: PERSONAS[s.persona]!.idle });
    }
  }

  private spawnInteriorMonsters(): void {
    const rt = this.interior!;
    const view = this.gridView();
    for (const s of rt.content.spawns) {
      for (const m of this.placeGroup(s.uid, s.monsterIds, s.x, s.y, (x, y) => view.walkable(x, y))) {
        this.enc.monsters.push(m);
        this.addMonsterView(m);
      }
    }
  }

  /** Keeps the wild monsters of the chunks around the party alive in the encounter. */
  private syncOverworldMonsters(): void {
    if (this.mode !== "overworld") return;
    const { tx, ty } = this.player;
    const px = Math.floor(tx / CHUNK_SIZE);
    const py = Math.floor(ty / CHUNK_SIZE);
    const view = this.gridView();
    // the world is a globe: a monster is kept at the copy of its place that is nearest to the party, so that it can be met across the seam
    for (const m of this.enc.monsters) {
      const nx = tx + wrapDelta(tx, m.x, this.world.width);
      const ny = ty + wrapDelta(ty, m.y, this.world.height);
      if (nx === m.x && ny === m.y) continue;
      m.x = nx;
      m.y = ny;
      const p = this.monsterWorld(m);
      this.monsters.place(m.uid, p.x, p.y, p.z);
    }
    const wanted = new Set<string>();
    this.refillHuts();
    this.placeHutMonsters(wanted, view);
    for (let cy = py - SPAWN_CHUNKS; cy <= py + SPAWN_CHUNKS; cy++) {
      for (let cx = px - SPAWN_CHUNKS; cx <= px + SPAWN_CHUNKS; cx++) {
        const key = `${cx},${cy}`;
        let spawns = this.overworldSpawns.get(key);
        if (!spawns) {
          spawns = chunkSpawns(this.world, cx, cy);
          this.overworldSpawns.set(key, spawns);
          for (const s of spawns) {
            // a world smaller than the view holds the same group in two chunks: the one that is there already stays
            if (this.enc.monsters.some((m) => m.uid.startsWith(`${s.uid}#`))) continue;
            const water = monsterById(s.monsterIds[0]!).terrain === "water";
            const free = water ? (tx: number, ty: number) => view.water(tx, ty) && this.world.tile(tx, ty).ground === GROUND.WATER : (tx: number, ty: number) => view.walkable(tx, ty);
            for (const m of this.placeGroup(s.uid, s.monsterIds, s.x, s.y, free)) {
              this.enc.monsters.push(m);
              this.addMonsterView(m);
            }
          }
        }
        for (const s of spawns) for (let i = 0; i < s.monsterIds.length; i++) wanted.add(`${s.uid}#${i}`);
      }
    }
    // forget monsters of chunks that are far away
    const before = this.enc.monsters.length;
    this.enc.monsters = this.enc.monsters.filter((m) => {
      const keep = wanted.has(m.uid) || Math.max(Math.abs(Math.floor(m.x / CHUNK_SIZE) - px), Math.abs(Math.floor(m.y / CHUNK_SIZE) - py)) <= SPAWN_CHUNKS + 1;
      if (!keep) this.monsters.remove(m.uid);
      return keep;
    });
    if (this.enc.monsters.length !== before) this.overworldSpawns = new Map([...this.overworldSpawns].filter(([k]) => {
      const [cx, cy] = k.split(",").map(Number) as [number, number];
      return Math.max(Math.abs(cx - px), Math.abs(cy - py)) <= SPAWN_CHUNKS + 1;
    }));
  }

  // ---------------------------------------------------------------- loot

  private mapKey(): string {
    return this.mode === "interior" && this.interior ? this.interior.map.key : "ow";
  }

  private lootHere(): LootPile[] {
    return (this.state.loot[this.mapKey()] ??= []);
  }

  /** Cells (`mapKey|x,y`) whose pile is not drawn yet because the monster that dropped it is still falling. */
  private readonly lootHeld = new Map<string, number>();

  private lootKey(x: number, y: number): string {
    return `${this.mapKey()}|${this.sameCell(x, y)}`;
  }

  /** The key of a cell: on the overworld, which is a globe, the same tile whichever copy of it the coordinates name. */
  private sameCell(x: number, y: number): string {
    return this.mode === "overworld" ? `${this.world.wrapX(x)},${this.world.wrapY(y)}` : `${x},${y}`;
  }

  /** Where a pile is drawn: on the overworld the copy of its tile that is nearest to the party. */
  private nearestTo(x: number, y: number): { x: number; y: number } {
    if (this.mode !== "overworld") return { x, y };
    return { x: this.player.tx + wrapDelta(this.player.tx, x, this.world.width), y: this.player.ty + wrapDelta(this.player.ty, y, this.world.height) };
  }

  private renderLoot(): void {
    const piles = this.lootHere().filter((p) => !this.lootHeld.has(this.lootKey(p.x, p.y)));
    const shown = piles.map((p) => {
      const at = this.nearestTo(p.x, p.y);
      return { key: this.lootKey(p.x, p.y), ...this.worldPos(at.x, at.y) };
    });
    this.props.setInstances(
      this.lootOwner,
      shown.map((w) => ({ model: "obj_loot", x: w.x, y: w.y, z: w.z, rotY: 0, scale: 0.8 })),
    );
    // loot glows gold (32nd playtest, point 14); the lights of the pool come on with the first pile
    this.lootLamps = shown.map((w) => lampSource(LOOT_LAMP, w.x, w.z, `l:${w.key}`));
    this.enableLampLights();
    this.props.flush();
  }

  private collectLoot(x: number, y: number): void {
    const piles = this.lootHere();
    const here = this.sameCell(x, y);
    const i = piles.findIndex((p) => this.sameCell(p.x, p.y) === here);
    if (i < 0) return;
    const pile = piles[i]!;
    const party = this.state.party;
    if (pile.gold > 0) {
      party.gold += pile.gold;
      this.ui.log(`You collect ${thousands(pile.gold)} gold.`, "loot");
    }
    const left: typeof pile.items = [];
    for (const item of pile.items) {
      if (giveItem(party, item)) this.ui.log(`You take ${item.name.trim()}.`, "loot");
      else left.push(item);
    }
    pile.gold = 0;
    pile.items = left;
    if (left.length > 0) this.ui.log("Your backpacks are full. The rest stays on the ground.", "bad");
    else piles.splice(i, 1);
    this.audio.play(9020);
    this.renderLoot();
  }

  /** Puts loot on a cell. `hold`: the pile exists at once but is only drawn after `releaseLoot` (the monster that dropped it is still dying). */
  private dropLoot(x: number, y: number, gold: number, items: LootPile["items"], hold = false): void {
    if (gold <= 0 && items.length === 0) return;
    const piles = this.lootHere();
    const here = this.sameCell(x, y);
    let pile = piles.find((p) => this.sameCell(p.x, p.y) === here);
    if (!pile) piles.push((pile = { x, y, gold: 0, items: [] }));
    pile.gold += gold;
    pile.items.push(...items);
    if (hold) {
      const key = this.lootKey(x, y);
      this.lootHeld.set(key, (this.lootHeld.get(key) ?? 0) + 1);
    }
    this.renderLoot();
  }

  /** The monster is gone: its pile (if it left one) appears. */
  private releaseLoot(x: number, y: number, epoch: number): void {
    if (epoch !== this.fxEpoch) return; // the scene changed meanwhile and cleared the holds
    const key = this.lootKey(x, y);
    const left = (this.lootHeld.get(key) ?? 0) - 1;
    if (left > 0) this.lootHeld.set(key, left);
    else this.lootHeld.delete(key);
    this.renderLoot();
  }

  // ---------------------------------------------------------------- steps and triggers

  /** Set by an ambush for the rest of the current step. */
  private ambushGrace = false;

  /**
   * The old game fired a trap as soon as the party crossed the border of its cell, so the blade of a guillotine fell (and
   * the spears of a spring trap shot up) in front of the camera. Here the action runs on arrival, with the camera in the
   * plane of the thin blade or spear board, where it cannot be seen: so the animation starts as the step onto the cell
   * begins, and the trap has struck about when the party arrives.
   */
  private onStepStarted(x: number, y: number): void {
    // the party moves: a hero in the Dimensional Rift is back
    for (const i of cancelRifts(this.state.party)) this.ui.log(`${this.state.party.characters[i]!.name} steps back into the world.`, "info");
    const rt = this.interior;
    if (!rt) return;
    const a = rt.actionAt.get(this.cellIndex(x, y));
    if (!rt.campaign) {
      // a generated trap: the same reason, the same remedy; one that is spent (or the hovering party) does not fire
      if (a && trapKindOf(a) && !this.trapReloading(a.uid)) this.fireTrap(a);
      return;
    }
    const legacy = a?.legacy;
    if (legacy?.id !== 24 && legacy?.id !== 17) return;
    if (trapReloading(this.state.campaign!.progress, rt.campaign.slug, legacy.ex, legacy.ey, this.state.steps)) return;
    this.springTrap(legacy.id === 17 ? "spear" : "guillotine", x, y, trapRotation(legacy.ax));
  }

  /** A generated spear or guillotine trap goes off: the blade falls or the spears shoot up, and the spring sounds again as it starts back. */
  private fireTrap(a: ActionInstance): void {
    this.interiorView.playTrap(a.uid);
    this.later(0.3, () => this.audio.play(9037));
  }

  private springTrap(kind: TrapKind, x: number, y: number, rotation: number): void {
    this.campaignView.playTrap(kind, x, y, rotation);
    // the old game sounded the spring again when the moving part starts back
    this.later(0.3, () => this.audio.play(9037));
  }

  private async onArrived(x: number, y: number): Promise<void> {
    const s = this.state;
    s.steps++;
    cursorStepped();
    this.syncSurroundings();
    // a levitating party does not walk: the wind takes the place of the footsteps
    if (hasEffect(s.party, "levitate")) this.audio.windStep(0.6);
    else this.audio.play(this.mode === "overworld" ? stepSound(this.world.tile(x, y)) : 9010, 0.6);
    this.passTime(stepMinutes(this.outdoors()));
    this.campaignView.focus(x, y);
    this.interiorView.focus(x, y);
    s.at = this.campaignLocation() ?? (this.mode === "interior" && s.at.mode === "interior" ? { ...s.at, x, y, facing: this.player.facing } : { mode: "overworld", x, y, facing: this.player.facing });
    this.markExplored();
    this.noteEndRoom(x, y);
    this.updateAmbient();
    this.collectLoot(x, y);

    if (this.mode === "overworld") {
      this.chunks?.update(x, y);
      this.syncOverworldMonsters();
      this.lavaStep(x, y);
    } else if (this.interior) {
      const a = this.interior.actionAt.get(this.cellIndex(x, y));
      if (this.interior.campaign) {
        if (a?.legacy) await this.runCampaignAction(a);
      } else if (a && actionTrigger(a) === "enter") await this.useAction(a);
      // the empty perch (the Crow is with the party) can be walked over; it says whose it is
      else if (!this.interior.campaign) {
        const spot = this.mascotSpots().find((m) => m.x === x && m.y === y);
        if (spot && mascotSpotItem(spot.item, s.party.mascot) === BIRD_PERCH) this.ui.log(propLine(BIRD_PERCH), "info");
      }
    }

    if (this.ambushGrace) {
      // an ambush springs the monsters up in front of the party; the party gets the first move
      this.ambushGrace = false;
      updateBattleMode(this.enc, x, y, this.gridView());
    } else if (this.enc.monsters.length > 0 && !this.over) {
      updateBattleMode(this.enc, x, y, this.gridView());
      const events = monsterTurn(this.state.party, this.gridView(), this.enc, x, y, this.combatRng(), MONSTER_ACTION_RADIUS);
      this.handleEvents(events);
      updateBattleMode(this.enc, x, y, this.gridView());
    }
    this.minimapDirty = true;
    this.refresh();
    if (s.steps - this.lastAutosave >= 60) this.save("auto");

    // like the old outside map: the "enter" question comes on the tile in front of a place, the party never walks into it
    if (this.mode === "overworld" && !this.enc.battleMode && !this.over) {
      const place = this.world.poiAtEntrance(x, y);
      if (place) await this.promptEnterPoi(place.id);
    }
  }

  /** A step takes ten minutes in the open country (the overworld and the campaign's outside map), one in towns, castles, dungeons and caves. */
  private outdoors(): boolean {
    return this.mode === "overworld" || this.interior?.campaign?.slug === CAMPAIGN_OUTSIDE;
  }

  /** Lets game time pass and tells which spells and conditions ran out. */
  private passTime(minutes: number): void {
    this.syncSurroundings();
    const passed = advanceTime(this.state.party, minutes);
    this.logEnded(passed.expired);
    this.logConditions(passed.conditions);
  }

  /** Poison killing, drink turning into weakness, sleep ending: what the clock did to the heroes. The last hero to fall ends the game. */
  private logConditions(events: ConditionEvent[]): void {
    const party = this.state.party;
    for (const e of events) {
      const c = party.characters[e.character];
      if (c) this.ui.log(conditionEventText(c.name, e), e.outcome === "died" ? "bad" : "info");
    }
    if (events.some((e) => e.outcome === "died") && !party.characters.some((c) => canAct(c)) && !this.over) void this.gameOver();
  }

  private logEnded(expired: TimedEffect[]): void {
    for (const e of expired) this.ui.log(e.kind === "light" ? "Your light fades." : e.kind === "protection" ? "Your protection wears off." : e.kind === "blessed" ? "The blessing fades." : `The ${e.kind.replace(/_/g, " ")} spell ends.`, "info");
  }

  private async onBlocked(x: number, y: number): Promise<void> {
    if (this.over || this.busy) return;
    // melee: a step to a free tile is refused, as are the spells that carry the party away (`spellRefusal`); a monster in the way is still fought
    if (this.enc.battleMode && this.canEnter(x, y)) {
      this.audio.play(9014, 0.5);
      this.ui.log(IN_MELEE_STEP, "bad");
      return;
    }
    // the party stands in a brittle wall's cell and bumps into its wall piece: the cell's own action asks about the wall (as the
    // old game did on entering), and a monster behind the wall piece is out of reach
    const rt = this.interior;
    if (this.mode === "interior" && rt?.slabs && rt.slabs.get(this.cellIndex(this.player.tx, this.player.ty)) === stepFacing(x - this.player.tx, y - this.player.ty)) {
      const own = rt.actionAt.get(this.cellIndex(this.player.tx, this.player.ty));
      if (own?.legacy) {
        this.passTime(ACTION_MINUTES);
        await this.runCampaignAction(own);
        return;
      }
      this.audio.play(9014, 0.35);
      return;
    }
    const m = this.monsterAt(x, y);
    if (m) {
      await this.attackMonster(m);
      return;
    }
    const spot = this.mascotSpotAt(x, y);
    if (spot) {
      await this.meetMascot(spot);
      return;
    }
    const caravan = this.caravanAt(x, y);
    if (caravan) {
      await this.visitCaravan(caravan);
      return;
    }
    const hut = this.hutAt(x, y);
    if (hut) {
      await this.visitHut(hut);
      return;
    }
    if (this.mode === "overworld") {
      // a town, castle, dungeon entrance, cave or pyramid is an object on the map: walking into it asks to enter. A town has its streets open
      // on every side; the others have one opening, on the side the roads end at, and only the tiles in front of it (two for a place two
      // tiles wide) lead in (from there the party may also bump into the place to be asked again)
      const poiId = this.world.tile(x, y).poiId;
      const poi = poiId ? this.world.poiById(poiId) : null;
      if (poi) {
        if (poi.kind === "town" || poiEntrances(poi).some((e) => e.x === this.world.wrapX(this.player.tx) && e.y === this.world.wrapY(this.player.ty))) {
          await this.promptEnterPoi(poi.id);
          return;
        }
        this.ui.log(`There is no way in on this side of the ${poi.kind === "dungeon" && poi.size === 3 ? "pyramid" : poi.kind}. Its entrance is elsewhere.`, "info");
      } else if (this.world.tile(x, y).deco === DECO.LANDMARK) {
        // a well, a hut, a stone head: everything the party bumps into says what it is (trees and mountains are the exception); about a third of the fountains and stone heads are magic (a plain well never is)
        const boon = landmarkBoon(this.world, x, y);
        if (boon) await this.useBoon(x, y, boon);
        else this.ui.log(propLine(landmarkItemAt(this.world.wrapX(x), this.world.wrapY(y)), `${this.world.wrapX(x)},${this.world.wrapY(y)}`), "info");
      } else if (this.world.tile(x, y).ground === GROUND.SHALLOW) {
        this.ui.log("The water is too deep to wade through. Someone who can swim could cross it.", "info");
      } else if (this.world.tile(x, y).ground === GROUND.WATER) {
        this.ui.log("Open water. Only a seafarer, or a spell that lets you walk on water, gets across.", "info");
      }
    }
    if (this.mode === "interior" && this.interior) {
      const a = this.interior.actionAt.get(this.cellIndex(x, y));
      if (this.interior.campaign) {
        if (a?.legacy) {
          this.passTime(ACTION_MINUTES);
          await this.runCampaignAction(a);
          return;
        }
        // an object without a story action of its own still answers when the party bumps into it
        const model = this.interior.campaign.model;
        const abs = model.toAbsolute(x, y);
        const item = model.get(abs.x, abs.y)?.i;
        if (item !== undefined && MAP_ITEMS[item]?.obstacle) {
          await this.examineItem(item, x, y);
          return;
        }
        this.audio.play(9014, 0.35);
        return;
      }
      // a wall that can be broken is just a wall to a party that cannot tell
      const plainWall = a?.kind === "breakable_wall" && !this.state.party.talents.includes("talent_perceptive");
      if (a && !plainWall && actionTrigger(a) === "interact" && !(ACTION_DEFS[a.kind].persistence === "once" && this.state.opened.has(a.uid))) {
        this.passTime(ACTION_MINUTES);
        await this.useAction(a);
        return;
      }
      if (a && a.kind === "treasure") this.ui.log("The chest is empty.", "info");
    }
    this.audio.play(9014, 0.35);
  }


  /**
   * A magic fountain or stone head of the open land (`landmarkBoon`): once a day it raises one attribute or resistance of the whole party for twelve hours.
   * The day it was used is part of the key, like the fountains of the places (`useAction`), so the save needs nothing new.
   */
  private async useBoon(x: number, y: number, boon: LandmarkBoon): Promise<void> {
    const day = Math.floor(this.state.party.minutes / MINUTES_PER_DAY);
    const used = `boon:${this.world.wrapX(x)},${this.world.wrapY(y)}@${day}`;
    if (this.state.opened.has(used)) {
      this.audio.play(9014, 0.35);
      this.ui.log(BOON_SPENT[boon.source], "info");
      return;
    }
    this.passTime(ACTION_MINUTES);
    // the keys of the days before are of no use any more
    for (const k of [...this.state.opened]) if (k.startsWith("boon:") && !k.endsWith(`@${day}`)) this.state.opened.delete(k);
    this.state.opened.add(used);
    applyBoon(this.state.party, boon.stat, boon.amount);
    this.audio.play(9032);
    this.ui.log(boonText(boon.source, boon.pick, boon.stat, boon.amount, BOON_HOURS), "good");
    this.refresh();
  }

  /**
   * What happens when the party bumps into a map object that has no action of its own. Fountains work like the ones in
   * generated towns (the old fountains were decoration only); everything else says what it is.
   */
  private async examineItem(item: number, x: number, y: number): Promise<void> {
    if (item === 2) {
      this.passTime(ACTION_MINUTES);
      await this.useAction({ uid: `${this.interior!.map.key}#fountain:${x},${y}`, kind: "fountain", x, y, params: { heal: 10 } });
      return;
    }
    this.ui.log(propLine(item, `${this.interior!.map.key}:${x},${y}`), "info");
    this.audio.play(9014, 0.35);
  }

  // ---------------------------------------------------------------- campaign

  /** Cell grid, content and the sets the movement code needs, derived from the campaign model as it is now. */
  private campaignSnapshot(model: CampaignMapModel): Pick<InteriorRuntime, "map" | "content" | "blocked" | "actionAt" | "noMonster" | "slabs"> {
    const map = model.toInteriorMap();
    const content = model.toContent();
    const blocked = new Set<number>();
    const slabs = new Map<number, Facing>();
    const noMonster = new Set<number>();
    const actionAt = new Map<number, ActionInstance>();
    for (const a of content.actions) {
      const i = a.y * map.width + a.x;
      actionAt.set(i, a);
      if (a.legacy?.id === 26) noMonster.add(i);
    }
    for (const [x, y, c] of model.entries()) {
      // a closed door or a brittle wall is a floor cell for the renderer (it holds the door model) that nobody can enter
      const shut = c.b !== undefined && CAMPAIGN_BLOCKS[c.b]?.cls === "floor" && !model.isWalkable(x, y);
      if (!shut && (c.i === undefined || !model.hasObstacle(x, y))) continue;
      const l = model.toLocal(x, y);
      if (l.x >= 0 && l.y >= 0 && l.x < map.width && l.y < map.height) {
        blocked.add(l.y * map.width + l.x);
        // only the party may step into a brittle wall's cell, and only an empty one
        const side = model.slabAt(x, y);
        if (side && !model.hasObstacle(x, y)) slabs.set(l.y * map.width + l.x, side);
      }
    }
    return { map, content, blocked, actionAt, noMonster, slabs };
  }

  private campaignPoi(model: CampaignMapModel): Poi {
    const family = model.dominantFamily();
    const kind: PoiKind = family === "city" || family === "outside" ? "town" : family === "fortress" ? "castle" : family === "cave" ? "cave" : "dungeon";
    return { id: `campaign:${model.slug}`, kind, name: model.name, x: 0, y: 0, size: 1, side: "S", region: { rx: 0, ry: 0 }, anchor: false, tier: 1, biome: BIOME.MEADOW };
  }

  /** Keeps the cell changes of the current map in the save state. */
  private stashCampaign(): void {
    const camp = this.state.campaign;
    const rt = this.interior;
    if (camp && rt?.campaign) camp.maps[rt.campaign.slug] = rt.campaign.model.exportOverrides();
  }

  /** Where the party stands, in the editor's coordinates, for the save file. */
  private campaignLocation(): GameState["at"] | null {
    const rt = this.interior;
    if (!rt?.campaign) return null;
    const abs = rt.campaign.model.toAbsolute(this.player.tx, this.player.ty);
    return { mode: "interior", poiId: `campaign:${rt.campaign.slug}`, x: abs.x, y: abs.y, facing: this.player.facing, ret: { x: 0, y: 0, facing: "S" } };
  }

  /**
   * Loads and shows a campaign map. `at` is in the map's own (editor) coordinates and is repaired when it is not free
   * ground; without it the party appears where the old editor put the start.
   */
  private async openCampaignMap(slug: string, at?: { x: number; y: number; rotation: number }, stash = true): Promise<void> {
    const camp = this.state.campaign;
    if (!camp) return;
    await this.beginLoading();
    let model: CampaignMapModel;
    let music: number;
    try {
      const from = this.interior?.campaign?.slug ?? "";
      if (stash) this.stashCampaign();
      model = await loadCampaignMap(slug, camp.maps[slug] ?? {});
      this.ui.loading.set(LOAD_DATA);
      await this.props.ensure(this.staticInfo, [...CampaignView.modelKeys(model), "obj_loot"], (share) => this.ui.loading.set(LOAD_DATA + (LOAD_MODELS - LOAD_DATA) * share));
      const start = model.safeStart();
      const arrive = at ? arrival(model, at.x, at.y, at.rotation, from) : { x: start.x, y: start.y, rotation: { N: 0, E: 90, S: 180, W: 270 }[start.facing] };
      this.chunks?.dispose();
      this.chunks = null;
      this.monsters.clear();
      this.sceneChanged();
      this.props.setInstances(this.lootOwner, []);
      this.mode = "interior";
      this.enc = createEncounter();
      const snap = this.campaignSnapshot(model);
      this.interior = { poi: this.campaignPoi(model), ...snap, campaign: { slug, model } };
      this.campaignView.mascot = this.state.party.mascot;
      this.campaignView.show(model, snap.map, snap.content);
      this.setLamps(this.collectLamps(model));
      this.sky.setVisible(snap.map.theme.open);
      this.spawnInteriorMonsters();
      const local = model.toLocal(arrive.x, arrive.y);
      const facing = facingOfRotation(arrive.rotation);
      const p = this.worldPos(local.x, local.y);
      this.player.place(local.x, local.y, facing, p.x, p.z);
      this.campaignView.focus(local.x, local.y);
      this.interiorView.focus(local.x, local.y);
      const place = this.campaignLocation();
      if (place) this.state.at = place;
      this.state.visited.add(`campaign:${slug}`);
      this.renderLoot();
      this.markExplored();
      this.updateAmbient();
      music = model.music || snap.map.theme.music;
      await this.endLoading();
    } catch (e) {
      this.abortLoading();
      throw e;
    }
    this.audio.playMusic(music);
    this.audio.play(9012);
    this.ui.toast(model.name);
    this.busy = false;
    this.refresh();
    this.save("auto");
  }

  /** Rebuilds what the party sees and walks on after an action changed the map. */
  private campaignChanged(): void {
    const rt = this.interior;
    if (!rt?.campaign) return;
    const snap = this.campaignSnapshot(rt.campaign.model);
    Object.assign(rt, snap);
    this.campaignView.mascot = this.state.party.mascot;
    this.campaignView.update(snap.map);
    this.campaignDirty = false;
    this.minimapDirty = true;
  }

  /** Talents and spells that let the party cross water. */
  private canCross(x: number, y: number): boolean {
    const rt = this.interior;
    if (!rt?.campaign) return false;
    const abs = rt.campaign.model.toAbsolute(x, y);
    const water = rt.campaign.model.blockDef(abs.x, abs.y)?.water;
    if (!water) return false;
    const party = this.state.party;
    return party.talents.includes(`talent_${water}`) || hasEffect(party, "levitate") || hasEffect(party, "walk_on_water");
  }

  private campaignHost(model: CampaignMapModel): CampaignHost {
    const ui = this.ui;
    const state = this.state;
    const cellOf = (x: number, y: number) => model.toLocal(x, y);
    return {
      party: state.party,
      progress: state.campaign!.progress,
      map: model,
      rng: new Rng(seedFromString(`${state.seed}:campaign:${state.steps}:${state.kills}:${state.party.minutes}:${state.party.gold}`)),
      ui: {
        message: (text) => ui.message(text),
        confirm: (text) => ui.confirm("", text, "Yes", "No"),
        pickCharacter: async (question, includeIncapacitated = false) => {
          const options = state.party.characters.map((c, i) => ({ label: c.name, value: i, note: `${c.hp}/${c.health} HP`, disabled: !includeIncapacitated && !canAct(c) }));
          return ui.choose("", question, options);
        },
        askText: (question) => ui.prompt(question),
        pickPortal: (title, options) => ui.choose(title, "", options),
        sound: (id) => this.audio.play(id),
        log: (text, kind) => ui.log(text, kind),
      },
      port: {
        teleport: (x, y, rotation) => {
          const l = cellOf(x, y);
          const p = this.worldPos(l.x, l.y);
          this.player.place(l.x, l.y, facingOfRotation(rotation, this.player.facing), p.x, p.z);
          this.campaignView.focus(l.x, l.y);
          this.interiorView.focus(l.x, l.y);
          this.markExplored();
          this.updateAmbient();
          this.pendingArrival = { x: l.x, y: l.y };
        },
        transfer: async (slug, x, y, rot) => {
          this.pendingTravel = { slug, x, y, rot };
        },
        changed: () => {
          this.campaignDirty = true;
        },
        addMonster: (x, y, id) => {
          const l = cellOf(x, y);
          const m = createMonster(`c:${model.slug}:${x},${y}:m#0`, id, l.x, l.y);
          if (state.killed.has(m.uid)) return;
          this.enc.monsters.push(m);
          this.addMonsterView(m, APPEAR_SECONDS);
        },
        openService: (service, tier) => this.openCampaignService(service, tier),
        hurt: (i) => {
          ui.hitCard(i);
          ui.hurtFlash();
          this.audio.play(this.painSound(i), 0.8);
        },
        checkDefeat: () => {
          if (isDefeated(state.party) && !this.over) void this.gameOver();
        },
        gate: (item, x, y, rotation, direction) => {
          const l = cellOf(x, y);
          this.campaignView.playGate(item, l.x, l.y, rotation, direction);
        },
        trap: (kind, x, y, rotation) => {
          // stepping onto the cell has started the animation already
          const l = cellOf(x, y);
          if (!this.campaignView.trapJustSprung(l.x, l.y)) this.springTrap(kind, l.x, l.y, rotation);
        },
        steps: () => state.steps,
        refresh: () => this.refresh(),
      },
    };
  }

  private async openCampaignService(service: ServiceKind, tier: number): Promise<void> {
    const rt = this.interior;
    if (!rt?.campaign) return;
    const here = rt.campaign.model.toAbsolute(this.player.tx, this.player.ty);
    const poi: Poi = { ...rt.poi, id: `campaign:${rt.campaign.slug}:${here.x},${here.y}` };
    const progress = this.state.campaign!.progress;
    this.audio.playMusic(serviceMusic(service));
    this.audio.play(9001);
    await openService(this.ui, service, {
      party: this.state.party,
      world: this.world,
      rootSeed: this.world.rootSeed,
      poi,
      tier,
      x: here.x,
      y: here.y,
      changed: () => this.refresh(),
      sound: (id) => this.audio.play(id),
      soldOut: this.state.opened,
      log: (t, k) => this.ui.log(t, k),
      rumour: () => {
        const rng = new Rng(seedFromString(`${this.state.seed}:rumour:${this.state.steps}:${this.state.party.minutes}`));
        const intro = TEXTS[308 + rng.int(10)]!;
        // one time in five the barkeep lets a password slip (the five riddles of this tavern's level)
        if (rng.int(5) === 0 && progress.passwords.length > 0) {
          const level = Math.max(1, Math.min(20, tier));
          const from = (level - 1) * 5;
          const pool = progress.passwords.slice(from, from + 5).concat(progress.passwords.slice(0, 5));
          const answer = RIDDLES_MASTER[pool[rng.int(pool.length)]!]?.answer ?? "";
          const text = [318, 320, 322][rng.int(3)]!;
          return `${intro}\n${TEXTS[text]}${answer}${TEXTS[text + 1]}`;
        }
        return `${intro}\n${RUMORS[rng.int(RUMORS.length)]}`;
      },
    });
    this.audio.playMusic(rt.map.theme.music);
    this.save("auto");
  }

  /** Runs the action on a campaign cell, then whatever it queued (travel, arrival on a teleport target). */
  private async runCampaignAction(a: ActionInstance): Promise<void> {
    const rt = this.interior;
    if (!rt?.campaign || !a.legacy || this.busy) return;
    this.busy = true;
    this.player.locked = true;
    const model = rt.campaign.model;
    try {
      const engine = new LegacyEngine(this.campaignHost(model));
      await engine.activate(a.legacy.ex, a.legacy.ey);
      for (let guard = 0; guard < 5; guard++) {
        if (this.campaignDirty) this.campaignChanged();
        if (this.pendingTravel) {
          const t = this.pendingTravel;
          this.pendingTravel = null;
          this.busy = false;
          await this.openCampaignMap(t.slug, { x: t.x, y: t.y, rotation: t.rot });
          return;
        }
        const arrive = this.pendingArrival;
        if (!arrive) break;
        this.pendingArrival = null;
        const next = this.interior?.actionAt.get(this.cellIndex(arrive.x, arrive.y));
        if (next?.legacy) await engine.activate(next.legacy.ex, next.legacy.ey);
      }
      if (this.campaignDirty) this.campaignChanged();
    } finally {
      this.busy = false;
      this.player.locked = false;
    }
    this.refresh();
  }

  /** The quests as the log shows them: the campaign keeps its own list, the generated world's is read from its plan and the flags in the save (`game/questLog.ts`). */
  private questLogView(): { open: string[]; done: string[] } {
    const progress = this.state.campaign?.progress;
    if (progress) return { open: Object.keys(progress.quests.active).map(tidy), done: Object.keys(progress.quests.completed).map(tidy) };
    const carried = carriedItems(this.state.party);
    return worldQuestLog({ world: this.world, opened: this.state.opened, visited: this.state.visited, carried: (type) => carried.filter((i) => i.type === type).length });
  }

  private async openQuestLog(): Promise<void> {
    if (this.ui.modalOpen) return;
    const view = this.questLogView();
    const campaign = !!this.state.campaign;
    await this.ui.panel((close, root) => {
      const list = (title: string, names: string[], empty: string): HTMLElement => {
        const box = document.createElement("div");
        box.append(Object.assign(document.createElement("h3"), { textContent: title }));
        if (names.length === 0) box.append(Object.assign(document.createElement("p"), { textContent: empty, className: "small" }));
        for (const n of names) box.append(Object.assign(document.createElement("p"), { textContent: n }));
        return box;
      };
      const button = Object.assign(document.createElement("button"), { className: "btn close", textContent: "Close (Esc)", onclick: close });
      root.append(
        button,
        Object.assign(document.createElement("h2"), { textContent: "Quests" }),
        list("Open", view.open, campaign ? "No open quests. Talk to the people of the maps." : "No open quests yet. Enter the caves and dungeons, talk to the people of the towns."),
        list("Completed", view.done, "Nothing completed yet."),
      );
    });
  }

  // ---------------------------------------------------------------- POIs

  // ---------------------------------------------------------------- mascots

  private mascotCache: { key: string; spots: MascotSpot[] } | null = null;
  /** What the mascot props show now: the scene and the party's mascot. */
  private mascotShown = "";

  /** The mascots' places of the scene the party is in: the four wild ones outside, the Crow's perch in the start town, none elsewhere. */
  private mascotSpots(): MascotSpot[] {
    if (!this.state) return [];
    const rt = this.interior;
    let key: string;
    let make: () => MascotSpot[];
    if (this.mode === "overworld") {
      key = `ow:${this.world.seedText}`;
      make = () => overworldMascotSpots(this.world);
    } else if (this.mode === "interior" && rt && !rt.campaign && rt.poi.id === START_TOWN_ID) {
      key = `in:${rt.map.key}`;
      make = () => {
        const spot = townMascotSpot(rt.map, rt.content);
        return spot ? [spot] : [];
      };
    } else {
      this.mascotCache = null;
      return [];
    }
    if (this.mascotCache?.key !== key) this.mascotCache = { key, spots: make() };
    return this.mascotCache.spots;
  }

  /** The mascot's place on this tile or cell, if something solid stands on it (the empty perch and empty places can be walked over). */
  private mascotSpotAt(x: number, y: number): MascotSpot | undefined {
    const spots = this.mascotSpots();
    if (spots.length === 0) return undefined;
    // the overworld is a globe: a place of the world is on every copy of it
    const here = this.mode === "overworld" ? { x: this.world.wrapX(x), y: this.world.wrapY(y) } : { x, y };
    return spots.find((s) => s.x === here.x && s.y === here.y && isSolidSpotItem(mascotSpotItem(s.item, this.state.party.mascot)));
  }

  /** Draws the mascots at their places, as the old game does: the one in the party is gone, the Crow leaves its perch and the Fairy its mushroom. */
  private syncMascots(): void {
    const spots = this.mascotSpots();
    const sig = `${this.mascotCache?.key ?? ""}|${this.state.party.mascot}`;
    if (sig === this.mascotShown) return;
    this.mascotShown = sig;
    const list: PropInstance[] = [];
    for (const s of spots) {
      const shown = mascotSpotItem(s.item, this.state.party.mascot);
      if (!shown) continue;
      const w = this.worldPos(s.x, s.y);
      // compass bearing towards the tile it faces (0 north), the same convention as the old map's item rotation
      const bearing = (Math.atan2(s.faceX - s.x, s.y - s.faceY) * 180) / Math.PI;
      const inst = itemProp(shown, (bearing + 360) % 360, w.x, w.z, this.staticInfo);
      if (!inst) continue;
      inst.y += w.y + (this.mode === "overworld" ? groundPropLift() : 0);
      list.push(inst);
    }
    this.props.setInstances("mascots", list);
    this.props.flush();
  }

  // ---------------------------------------------------------------- monster huts

  /** The huts by tile (canonical coordinates), for the many questions "is a hut here?" of the path finding. */
  private hutTiles: { world: World; byTile: Map<number, HutSpot> } | null = null;
  /** What the hut props show now: the party's chunk and which huts are burnt. */
  private hutShown = "";

  private hutTable(): Map<number, HutSpot> {
    if (this.hutTiles?.world !== this.world) this.hutTiles = { world: this.world, byTile: new Map(hutIndex(this.world).huts.map((h) => [h.y * this.world.width + h.x, h])) };
    return this.hutTiles.byTile;
  }

  private hutBurnt(hut: HutSpot): boolean {
    return this.state.opened.has(`hut:${hut.id}@burnt`);
  }

  /** The Monster Hut on this tile, if it still stands: a burnt-out hut is not in the way. */
  private hutAt(x: number, y: number): HutSpot | undefined {
    if (this.mode !== "overworld" || !this.state) return undefined;
    const hut = this.hutTable().get(this.world.wrapY(y) * this.world.width + this.world.wrapX(x));
    return hut && !this.hutBurnt(hut) ? hut : undefined;
  }

  /** Draws the huts near the party (a burnt one as its ruin) and takes them down inside a place. */
  private syncHuts(): void {
    if (!this.state) return;
    const near = this.mode === "overworld" ? hutIndex(this.world).huts.filter((h) => Math.abs(wrapDelta(this.player.tx, h.x, this.world.width)) <= HUT_REACH && Math.abs(wrapDelta(this.player.ty, h.y, this.world.height)) <= HUT_REACH) : [];
    const sig = near.map((h) => `${h.id}${this.hutBurnt(h) ? "b" : ""}@${Math.floor(this.player.tx / CHUNK_SIZE)},${Math.floor(this.player.ty / CHUNK_SIZE)}`).join("|");
    if (sig === this.hutShown) return;
    this.hutShown = sig;
    const list: PropInstance[] = [];
    for (const h of near) {
      // the globe: the copy of the hut that is nearest to the party
      const w = this.worldPos(this.player.tx + wrapDelta(this.player.tx, h.x, this.world.width), this.player.ty + wrapDelta(this.player.ty, h.y, this.world.height));
      const inst = itemProp(this.hutBurnt(h) ? BURNT_HUT_ITEM : HUT_ITEM, ((h.monster * 7) % 4) * 90, w.x, w.z, this.staticInfo);
      if (!inst) continue;
      inst.y += w.y + groundPropLift();
      list.push(inst);
    }
    this.props.setInstances("huts", list);
    this.props.flush();
  }

  /** The party bumps into a Monster Hut: the scene inside, and the question whether to burn it down. */
  private async visitHut(hut: HutSpot): Promise<void> {
    this.player.locked = true;
    const burn = await this.ui.confirm("Monster Hut", hutScene(hut.monster), "Burn it down", "Leave it");
    this.player.locked = false;
    if (!burn) return;
    this.burnHut(hut);
  }

  /**
   * The hut burns: it is replaced by its ruin, its monsters stay but no new ones come, and the party gets `HUT_XP_FACTOR` (10) times the monster's XP (`hut_xp`), 13 times
   * the gold of the monster rounded up to the next thousand and seven items of its treasure level (a pile on the ruin, which is walked over).
   */
  private burnHut(hut: HutSpot): void {
    const def = MONSTERS[hut.monster]!;
    const party = this.state.party;
    this.state.opened.add(`hut:${hut.id}@burnt`);
    addXp(party, def.hut_xp);
    const rng = rngFor(this.world.rootSeed, LAYER.LOOT, "hut", hut.id);
    const items = Array.from({ length: HUT_ITEMS }, () => generateItem(rng, def.treasure_level));
    this.dropLoot(hut.x, hut.y, hutGold(hut.monster), items);
    this.audio.play(9001);
    this.ui.log(`The hut burns down. +${thousands(def.hut_xp)} xp`, "good");
    for (const c of party.characters) if (c.xp > 0 && xpReady(c)) this.ui.toast(`${c.name} can advance a level!`);
    this.hutShown = "";
    this.syncHuts();
    this.refresh();
    this.save("auto");
  }

  /** Remembers when a monster of a hut fell, for the refill of the next week. */
  private noteHutDeath(uid: string): void {
    const found = /^h:([^:]+):(\d+):(\d+)#0$/.exec(uid);
    if (!found) return;
    const key = slotKey(found[1]!, Number(found[2]));
    const slot = (this.state.hutSlots[key] ??= { gen: 0 });
    if (slot.gen === Number(found[3])) slot.died = this.state.party.minutes;
  }

  /**
   * A new week refills the huts: every slot whose monster fell in an earlier week gets a new one, but only while the party is out of sight of it
   * (farther than the view reaches), and never for a hut that is burnt. The monster itself appears when the slot comes near the party.
   */
  private refillHuts(): void {
    if (this.mode !== "overworld") return;
    const now = this.state.party.minutes;
    const week = Math.floor(now / HUT_WEEK);
    const hidden = (chunkRadius(this.viewDistance) + 1) * CHUNK_SIZE;
    const { byId } = hutIndex(this.world);
    for (const [key, slot] of Object.entries(this.state.hutSlots)) {
      if (slot.died === undefined || week <= Math.floor(slot.died / HUT_WEEK)) continue;
      const at = key.lastIndexOf(":");
      const hut = byId.get(key.slice(0, at));
      const place = hut?.slots[Number(key.slice(at + 1))];
      if (!hut || !place || this.hutBurnt(hut)) continue;
      if (slotDistance(this.world, this.player.tx, this.player.ty, place) <= hidden) continue;
      slot.gen++;
      delete slot.died;
    }
  }

  /** Puts the monsters of the huts near the party into the encounter, one for each slot that is not waiting for a refill. */
  private placeHutMonsters(wanted: Set<string>, view: GridView): void {
    const { tx, ty } = this.player;
    const W = this.world.width;
    const H = this.world.height;
    const reach = SPAWN_CHUNKS * CHUNK_SIZE + HUT_RADIUS;
    const xpPercent = hutXpPercent(this.world.size);
    for (const hut of hutIndex(this.world).huts) {
      if (Math.abs(wrapDelta(tx, hut.x, W)) > reach || Math.abs(wrapDelta(ty, hut.y, H)) > reach) continue;
      hut.slots.forEach((slot, i) => {
        const state = this.state.hutSlots[slotKey(hut.id, i)];
        if (state?.died !== undefined) return;
        const base = `h:${hut.id}:${i}:${state?.gen ?? 0}`;
        wanted.add(`${base}#0`);
        if (this.enc.monsters.some((m) => m.uid === `${base}#0`)) return;
        // the globe: at the copy of its place that is nearest to the party
        const sx = tx + wrapDelta(tx, slot.x, W);
        const sy = ty + wrapDelta(ty, slot.y, H);
        for (const m of this.placeGroup(base, [hut.monster], sx, sy, (x, y) => view.walkable(x, y))) {
          m.xpPercent = xpPercent;
          this.enc.monsters.push(m);
          this.addMonsterView(m);
        }
      });
    }
  }

  // ---------------------------------------------------------------- caravans

  private caravanCache: { key: string; spots: CaravanSpot[] } | null = null;
  /** What the caravan props show now: the world and the area they were taken for. */
  private caravanShown = "";

  /** The rusty caravans near the party's towns in the open country (`world/caravans.ts`); none inside a place. */
  private caravanSpots(): CaravanSpot[] {
    if (!this.state || this.mode !== "overworld") return [];
    const cx = Math.floor(this.player.tx / CHUNK_SIZE);
    const cy = Math.floor(this.player.ty / CHUNK_SIZE);
    const key = `${this.world.seedText}:${cx},${cy}`;
    if (this.caravanCache?.key !== key) {
      const x = cx * CHUNK_SIZE;
      const y = cy * CHUNK_SIZE;
      this.caravanCache = { key, spots: caravansIn(this.world, x - CARAVAN_REACH, y - CARAVAN_REACH, x + CHUNK_SIZE + CARAVAN_REACH, y + CHUNK_SIZE + CARAVAN_REACH) };
    }
    return this.caravanCache.spots;
  }

  private caravanAt(x: number, y: number): CaravanSpot | undefined {
    return this.mode === "overworld" ? this.caravanSpots().find((c) => c.x === x && c.y === y) : undefined;
  }

  /** Draws the caravans, turned towards their town, and takes them down again inside a place. */
  private syncCaravans(): void {
    const spots = this.caravanSpots();
    const sig = spots.length === 0 ? "" : `${this.caravanCache?.key ?? ""}`;
    if (sig === this.caravanShown) return;
    this.caravanShown = sig;
    const list: PropInstance[] = [];
    for (const s of spots) {
      const w = this.worldPos(s.x, s.y);
      const bearing = (Math.atan2(s.faceX - s.x, s.y - s.faceY) * 180) / Math.PI;
      const inst = itemProp(CARAVAN_ITEM, (bearing + 360) % 360, w.x, w.z, this.staticInfo);
      if (!inst) continue;
      inst.y += w.y + groundPropLift();
      list.push(inst);
    }
    this.props.setInstances("caravans", list);
    this.props.flush();
  }

  /** The party bumps into a caravan: the talent it sells, asked and paid like at the people of the towns (`talent` action). */
  private async visitCaravan(caravan: CaravanSpot): Promise<void> {
    this.passTime(ACTION_MINUTES);
    await this.useAction({ uid: caravan.id, kind: "talent", x: caravan.x, y: caravan.y, params: { talent: caravan.talent, ...sellerParams(caravan.talent) } });
  }

  /** The party walks up to a mascot's place: the old question, and on yes the mascot joins (and the previous one goes back to its place). */
  private async meetMascot(spot: MascotSpot): Promise<void> {
    const party = this.state.party;
    if (party.mascot === spot.mascot) {
      // the mascot is with the party: what is left of its place (the blue mushroom) still says what it is
      this.ui.log(propLine(mascotSpotItem(spot.item, party.mascot), spot.mascot), "info");
      return;
    }
    // action 13 of the old game: with `new_mascot` set (every wild mascot here) the meeting alone adds it to the mascots found,
    // the question comes after that, so a "No" keeps the find
    if (!party.mascots.includes(spot.mascot)) party.mascots.push(spot.mascot);
    this.player.locked = true;
    const yes = await this.ui.confirm(spot.mascot, MASCOT_ASK[spot.mascot] ?? "Choose this mascot?", "Yes", "No");
    this.player.locked = false;
    if (!yes) return;
    this.audio.play(9001);
    setMascot(party, spot.mascot);
    this.ui.log(`The ${spot.mascot.toLowerCase()} joins the party.`, "good");
    this.refresh();
    this.save("auto");
  }

  private async promptEnterPoi(poiId: string): Promise<void> {
    const poi = this.world.poiById(poiId);
    if (!poi) return;
    if (this.enc.battleMode) {
      this.audio.play(9014, 0.5);
      this.ui.log(IN_MELEE_STEP, "bad");
      return;
    }
    this.player.locked = true;
    const kind = poi.kind === "town" ? "town" : poi.kind === "castle" ? "castle" : poi.kind === "cave" ? "cave" : "dungeon";
    // when one king holds the eleventh orb, the other two castles are rubble
    if (poi.kind === "castle") {
      const winner = [...this.state.opened].find((k) => k.startsWith("king:winner="))?.split("=")[1];
      if (winner && this.world.castleAlignment(poi.id) !== winner) {
        this.audio.play(9014, 0.5);
        await this.ui.message("Of this castle only a heap of rubble is left. Its walls were crushed when the king of another realm took the power of the orbs.", poi.name);
        this.player.locked = false;
        return;
      }
    }
    // a key dungeon asks for its key, a pyramid for its key card; neither is used up (the old maps keep the item)
    const plan = planDungeon(this.world, poi);
    const need = plan?.requires ?? null;
    if (need && !hasItem(this.state.party, need)) {
      const name = QUEST_ITEMS.find((q) => q.type === need)?.name ?? need;
      const text = need.endsWith("_keycard") ? `A slot in the wall of the pyramid waits for a ${name}.` : `The way in is barred by a heavy lock. It needs the ${name}.`;
      this.audio.play(9014, 0.5);
      // the quest log lists the key to find from now on
      this.state.opened.add(lockSeenFlag(poi.id));
      await this.ui.message(text, poi.name);
      this.player.locked = false;
      this.refresh();
      return;
    }
    // (the quest and layout of the place are no longer written here: "Riddle (dungeon_3)" gave the quest away; Debug > Identify names them)
    const first = this.state.visited.has(poi.id) ? "" : `\nLevel ${poi.tier} ${kind === "town" ? "settlement" : "danger"}.`;
    const yes = await this.ui.confirm(poi.name, `Enter the ${kind} of ${poi.name}?${first}`, "Enter", "Stay outside");
    this.player.locked = false;
    if (yes) await this.openInterior(poi);
  }

  // ---------------------------------------------------------------- actions

  private actionContext(): ActionContext {
    const rt = this.interior;
    return {
      party: this.state.party,
      rootSeed: this.world.rootSeed,
      attempt: this.state.steps,
      monsterThemes: rt?.map.theme.monsterThemes ?? { beast: 1 },
      tier: rt?.content.tier ?? 1,
    };
  }

  /** Step number at which a generated spear or guillotine trap went off last, by action uid (the campaign keeps its own in its progress). */
  private readonly trapFired = new Map<string, number>();

  /** Is this trap still reloading? Asking changes nothing. */
  private trapReloading(uid: string): boolean {
    const last = this.trapFired.get(uid);
    return last !== undefined && this.state.steps - last < TRAP_RELOAD_STEPS;
  }

  private async useAction(a: ActionInstance): Promise<void> {
    if (isSpent(a, this.state.opened)) return;
    // an object the party can walk over says what it is the first time only (every step over a bone pile would be a line in the log)
    if (a.kind === "decor" && actionTrigger(a) === "enter") {
      const seen = `${a.uid}@seen`;
      if (this.state.opened.has(seen)) return;
      this.state.opened.add(seen);
    }
    // an object whose use is not written on it shows on the map once the party has been to it, whether or not anything came of it (a fountain
    // at full health heals nobody): `knownContent` reads the part of the key before the `@`
    if (hasHiddenUse(a)) this.state.opened.add(`${a.uid}@visited`);
    // spears and the blade have to reload first; stepping onto the cell meanwhile does nothing (the old game: 8 seconds)
    if (isReloadingTrap(a)) {
      if (this.trapReloading(a.uid)) return;
      this.trapFired.set(a.uid, this.state.steps);
    }
    // a trap that has gone off stays on the map (Wizard's Eye shows it even without the Crow)
    if (isTrapAction(a)) this.state.opened.add(`${a.uid}@fired`);
    this.busy = true;
    // a fountain works once a day: the day it was used is part of the key, so nothing else has to be saved or reset
    const usedKey = `${a.uid}@${Math.floor(this.state.party.minutes / MINUTES_PER_DAY)}`;
    const ctx = { ...this.actionContext(), content: this.interior?.content, opened: this.state.opened, attempt: this.state.steps * 7 + this.state.opened.size, usedToday: this.state.opened.has(usedKey) };
    let outcome = resolveAction(a, ctx);
    // a statue asks its question; the answer is the player's, and the statue decides on it
    const ask = outcome.effects.find((e) => e.type === "ask");
    if (ask?.type === "ask") {
      this.player.locked = true;
      const answer = await this.ui.prompt(ask.question, "The statue asks");
      this.player.locked = false;
      outcome = resolveAction(a, { ...ctx, answer });
    }
    // a chalice asks who is to drink from it
    const pick = outcome.effects.find((e) => e.type === "pick");
    if (pick?.type === "pick") {
      this.player.locked = true;
      // what the object says before it asks (the colour of the liquid, the plaque of a machine)
      for (const e of outcome.effects) if (e.type === "text") this.ui.log(e.text, "info");
      const options = this.state.party.characters.map((c, i) => ({ label: c.name, value: i, note: `${c.hp}/${c.health} HP`, disabled: !canAct(c) }));
      const hero = await this.ui.choose("", pick.question, options);
      this.player.locked = false;
      outcome = resolveAction(a, { ...ctx, hero });
    }
    // a brittle wall (only a party with the Perceptive talent gets this far) asks whether to break it
    const confirm = outcome.effects.find((e) => e.type === "confirm");
    if (confirm?.type === "confirm") {
      this.player.locked = true;
      const yes = await this.ui.confirm(confirm.title, confirm.question, confirm.yes, confirm.no);
      this.player.locked = false;
      outcome = resolveAction(a, { ...ctx, answer: yes ? "yes" : null });
    }
    // a pit that goes off for the first time opens (its uid in `opened` means "open"); it hurts again every time after that
    const opening = isLastingTrap(a) && outcome.consumed && !this.state.opened.has(a.uid);
    if (opening || (outcome.consumed && ACTION_DEFS[a.kind].persistence === "once")) this.state.opened.add(a.uid);
    if (outcome.usedToday) this.state.opened.add(usedKey);
    // levers and heads keep their position in the same set: a head of the ring that comes or goes opens or shuts its cell
    if (outcome.state) {
      for (const k of outcome.state.remove) this.state.opened.delete(k);
      for (const k of outcome.state.add) this.state.opened.add(k);
      this.syncQuestBlocks();
      this.interiorView.refreshObjects();
      // (a gong rings with its own sound: the `sound` effect)
      if (a.kind !== "gong") this.audio.play(a.kind === "lever" ? 9034 : 9014, 0.6);
    }
    if (opening) {
      this.audio.play(9007);
      this.interiorView.openPit(a.uid);
    }
    // the key or key card in its chest is gone from the map once it is taken; the runes of the gongs appear with the last gong
    if ((a.kind === "treasure" && outcome.consumed && typeof a.params.quest === "string") || (a.kind === "gong" && outcome.state)) this.interiorView.refreshObjects();
    // an emptied heap of treasure leaves its cell, which the party may then walk over
    if (this.interior && !this.interior.campaign && heapGone(a, this.state.opened)) {
      this.interior.blocked.delete(a.y * this.interior.map.width + a.x);
      this.interiorView.refreshObjects();
    }
    await this.applyEffects(a, outcome.effects);
    this.busy = false;
    this.refresh();
  }

  private async applyEffects(a: ActionInstance, effects: Effect[]): Promise<void> {
    const ui = this.ui;
    const rt = this.interior;
    this.playLootSounds(a, effects);
    for (const e of effects) {
      switch (e.type) {
        case "text":
          if (a.kind === "lore") await ui.message(e.text, rt?.poi.name ?? "");
          else ui.log(e.text, e.tone ?? (a.kind === "trap" ? "bad" : "info"));
          break;
        case "gold":
          if (e.amount > 0) ui.log(`You find ${thousands(e.amount)} gold.`, "loot");
          break;
        case "item":
          ui.log(e.stored ? `You find ${e.item.type === "spell" ? "the spell scroll " : ""}${e.item.name.trim()}.` : `You find ${e.item.name.trim()}, but every backpack is full. It stays behind.`, e.stored ? "loot" : "bad");
          if (!e.stored) this.dropLoot(this.player.tx, this.player.ty, 0, [e.item]);
          break;
        case "damage":
          // a trap of the elements shows that element's picture over the portrait, like a monster's spell
          ui.hitCard(e.character, e.damageType);
          ui.hurtFlash();
          // stepping onto the cell has started the blade or the spears already (`onStepStarted`); the pit made its noise when it opened
          if (trapKindOf(a) && !this.interiorView.trapJustSprung(a.uid)) this.fireTrap(a);
          // (the trap of a chest that was not locked throws its element, like the generic trap)
          if (!isLastingTrap(a)) this.audio.play(a.params.trap === "generic" || a.kind === "treasure" ? (ATTACK_SOUND[e.damageType] ?? 9029) : (TRAP_SOUND[String(a.params.trap)] ?? 9016));
          this.audio.play(this.painSound(e.character), 0.8);
          if (e.conditions.length) ui.log(`${this.state.party.characters[e.character]!.name} is ${e.conditions.join(" and ").toLowerCase()}!`, "bad");
          break;
        case "attribute":
        case "resistance":
        case "heal":
          this.audio.play(9032);
          break;
        case "transfer":
          if (e.mode === "poi_exit") {
            this.player.locked = true;
            const leave = await ui.confirm("Leave", `Leave ${rt?.poi.name ?? "this place"}?`, "Leave", "Stay");
            this.player.locked = false;
            if (leave) await this.exitInterior();
          }
          break;
        case "service":
          await this.openServiceScreen(e.service, e.tier);
          break;
        case "door":
          if (e.state === "opened" || e.state === "unlocked") {
            // an airlock is opened by its second lever: the door that opens is not the object that was used
            const doorUid = e.uid ?? a.uid;
            if (e.uid) this.state.opened.add(e.uid);
            this.interiorView.setDoor(doorUid, true);
            // the sound follows what is drawn: a wooden door that was picked open must not clank like a gate
            this.audio.play(doorSound(rt ? doorLook(rt.map, a.x, a.y) : "door"));
            if (e.state === "unlocked") ui.log("The lock clicks open.", "good");
          } else this.audio.play(9014);
          break;
        case "wall":
          if (rt) {
            rt.map.cells[a.y * rt.map.width + a.x] = CELL.FLOOR;
            this.state.broken.add(a.uid);
            this.interiorView.wallBroken(a.uid);
            this.audio.play(9050);
          }
          break;
        case "confirm":
          break;
        case "talent":
          this.audio.play(9000);
          this.audio.play(9024);
          break;
        case "work":
          this.audio.play(9000);
          ui.log(`You work for ${e.days} days and earn ${thousands(e.gold)} gold.`, "loot");
          this.passTime(e.days * MINUTES_PER_DAY);
          break;
        case "portal":
          await this.usePortal();
          break;
        case "ambush":
          this.spawnAmbush(e.monsterIds);
          break;
        case "ask":
          break;
        case "jump":
          this.jumpTo(e.x, e.y);
          break;
        case "endroom":
          this.openEndRoom();
          break;
        case "guards":
          this.spawnGuards(e.kind);
          break;
        case "king":
          await this.meetKing(e.alignment);
          break;
        case "skulls":
          await this.meetSkullMiser();
          break;
        case "ending":
          await this.playEnding();
          break;
        case "condition":
          ui.log(`${this.state.party.characters[e.character]!.name} is ${e.condition.toLowerCase()}!`, "bad");
          break;
        case "pick":
          break;
        case "sound":
          this.audio.play(e.id);
          break;
        case "defeat":
          await this.gameOver();
          break;
      }
    }
    this.minimapDirty = true;
  }

  /**
   * The alarm of a castle: the guards of its kind come. Light guards fill the corridors of the keep, heavy ones stand on the way from the king to the gate of the keep.
   * There is one kind of each in a castle (`guardsOf`), their number follows the size of the world and their experience the other way round.
   */
  private spawnGuards(kind: "light" | "heavy"): void {
    const rt = this.interior;
    const castle = rt?.map.castle;
    if (!rt || !castle) return;
    const rng = rngFor(this.world.rootSeed, LAYER.SPAWN, rt.map.key, "guards", kind, this.state.steps);
    const id = guardsOf(castle.alignment, rt.map.tier, rngFor(this.world.rootSeed, LAYER.SPAWN, rt.map.key, "guards"))[kind];
    const count = Math.max(2, Math.round((kind === "light" ? rng.range(10, 20) : rng.range(6, 10)) * castle.scale));
    const w = rt.map.width;
    // the cells they come to: the keep, or the way from the king to the cell inside its gate
    let cells: number[];
    if (kind === "light") cells = castle.keep;
    else {
      const prev = new Map<number, number>([[castle.king.y * w + castle.king.x, -1]]);
      const queue = [castle.king.y * w + castle.king.x];
      const goal = castle.door.y * w + castle.door.x;
      for (let head = 0; head < queue.length && !prev.has(goal); head++) {
        const i = queue[head]!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = (Math.floor(i / w) + dy) * w + (i % w) + dx;
          if (rt.map.cells[n] !== CELL.FLOOR || prev.has(n)) continue;
          prev.set(n, i);
          queue.push(n);
        }
      }
      cells = [];
      for (let at = goal; at >= 0 && prev.has(at); at = prev.get(at)!) cells.push(at);
    }
    const view = this.gridView();
    const free = rng.shuffle(cells.filter((i) => view.walkable(i % w, Math.floor(i / w)) && Math.abs((i % w) - this.player.tx) + Math.abs(Math.floor(i / w) - this.player.ty) > 2 && !this.monsterAt(i % w, Math.floor(i / w))));
    const xpPercent = Math.round(100 / castle.scale);
    let n = 0;
    for (const i of free) {
      if (n >= count) break;
      const x = i % w;
      const y = Math.floor(i / w);
      const uid = `guard:${rt.map.key}:${kind}:${this.state.steps}:${n}`;
      if (this.state.killed.has(uid)) continue;
      const m: MonsterInstance = { ...createMonster(uid, id, x, y), xpPercent };
      this.enc.monsters.push(m);
      this.addMonsterView(m, APPEAR_SECONDS);
      n++;
    }
    this.audio.play(9044);
    updateBattleMode(this.enc, this.player.tx, this.player.ty, view);
  }

  /**
   * The party before a king (quest document 1.2, ue_quest_3): all the orbs of ultimate power in the backpacks go to him, for each one the party gets a
   * million gold and every hero a million experience. The first king to hold eleven wins: the other two castles are destroyed and the king gives the black
   * key card. Further orbs can still be brought to the winner. What each king holds is `king:<kind>=<n>` in the saved set, the winner `king:winner=<kind>`.
   */
  private async meetKing(alignment: Alignment): Promise<void> {
    const party = this.state.party;
    const opened = this.state.opened;
    const held = Number([...opened].find((k) => k.startsWith(`king:${alignment}=`))?.split("=")[1] ?? 0);
    const orbs = carriedItems(party).filter((i) => i.type === ORB).length;
    if (orbs === 0) {
      this.player.locked = true;
      await this.ui.message(`${KING_GREETING[alignment]}${held > 0 ? ` He holds ${held} of the ${ORBS_FOR_KING} orbs he wants.` : ""}`, this.interior?.poi.name ?? "");
      this.player.locked = false;
      return;
    }
    this.player.locked = true;
    const yes = await this.ui.confirm("The king", `Give all ${orbs} Orb${orbs === 1 ? "" : "s"} of ultimate power to the king? The party gets ${thousands(orbs * 1_000_000)} gold and every hero ${thousands(orbs * 1_000_000)} experience. All the orbs you carry go to this king.`, "Give them", "Keep them");
    this.player.locked = false;
    if (!yes) return;
    takeItems(party, ORB);
    party.gold += orbs * 1_000_000;
    addXp(party, orbs * 1_000_000);
    const total = held + orbs;
    for (const k of [...opened]) if (k.startsWith(`king:${alignment}=`)) opened.delete(k);
    opened.add(`king:${alignment}=${total}`);
    this.audio.play(9000);
    this.ui.log(`You give the king ${orbs} Orb${orbs === 1 ? "" : "s"} of ultimate power: ${thousands(orbs * 1_000_000)} gold and ${thousands(orbs * 1_000_000)} experience for everyone.`, "loot");
    const winner = [...opened].find((k) => k.startsWith("king:winner="));
    if (!winner && total >= ORBS_FOR_KING) {
      opened.add(`king:winner=${alignment}`);
      const card = questItem(BLACK_CARD);
      if (card && !giveItem(party, card) && this.interior) this.dropLoot(this.player.tx, this.player.ty, 0, [card]);
      this.player.locked = true;
      await this.ui.message(`The king holds ${total} orbs. Power surges through his hall, and far away the walls of the other two castles crumble to dust. He hands you the black key card: "Take it. The transport tube of the mothership control deck obeys no other."`, this.interior?.poi.name ?? "");
      this.player.locked = false;
    } else if (!winner) {
      this.ui.log(`The king holds ${total} of the ${ORBS_FOR_KING} orbs he wants.`, "info");
    }
    this.minimapDirty = true;
  }

  /**
   * The end of the game: the party steps into the transport tube of the control deck with the black key card. The outro of the old game plays if the file
   * `assets/ui/outro.mp4` is there (it is 88 MB and kept out of git: `public/assets/ui/outro.mp4` is copied in by hand from `old_code/resources/movies/Game Outro.mp4`), then a last message.
   */
  private async playEnding(): Promise<void> {
    this.player.locked = true;
    this.state.opened.add("game:won");
    await new Promise<void>((resolve) => {
      const video = document.createElement("video");
      video.src = "assets/ui/outro.mp4";
      video.autoplay = true;
      video.controls = false;
      video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;background:#000;z-index:9999;object-fit:contain;cursor:pointer";
      const done = (): void => {
        video.remove();
        resolve();
      };
      video.onended = done;
      video.onerror = done;
      video.onclick = done;
      document.body.appendChild(video);
      void video.play().catch(done);
    });
    await this.ui.message("The simulation ends. The world you walked through was a game, and you have won it. You may keep playing: the islands are still there.", this.interior?.poi.name ?? "");
    this.player.locked = false;
  }

  /**
   * The Skull Miser of the start town (quest document 1.2, ue_quest_2): he pays 1000 gold for the party and 1000 experience for every hero for each silver
   * skull, all that the party carries at once. The quest is done when the fifth skull is handed in (a random ring of level 2 as a bonus, once); more skulls
   * are still paid for. What was handed in is `skulls=<n>` in the saved set.
   */
  private async meetSkullMiser(): Promise<void> {
    const party = this.state.party;
    const opened = this.state.opened;
    const handed = Number([...opened].find((k) => k.startsWith("skulls="))?.split("=")[1] ?? 0);
    const skulls = carriedItems(party).filter((i) => i.type === SKULL).length;
    // the quest log lists the Skull Miser from now on
    opened.add(SKULL_MISER_MET);
    this.player.locked = true;
    if (skulls === 0) {
      await this.ui.message(handed >= SKULLS_FOR_RING ? "The Skull Miser rubs his hands. \"More silver skulls? Bring them, bring them. I pay well, though I have no more rings to give.\"" : `The Skull Miser rubs his hands. \"Silver skulls! I buy silver skulls, a thousand gold and a thousand experience for each. Bring me ${SKULLS_FOR_RING} of them and there is a ring in it for you.\"${handed > 0 ? ` You have brought ${handed} so far.` : ""}`, this.interior?.poi.name ?? "");
      this.player.locked = false;
      return;
    }
    const yes = await this.ui.confirm("The Skull Miser", `Sell ${skulls} silver skull${skulls === 1 ? "" : "s"}? The party gets ${thousands(skulls * 1000)} gold and every hero ${thousands(skulls * 1000)} experience.`, "Sell", "Keep");
    this.player.locked = false;
    if (!yes) return;
    takeItems(party, SKULL);
    party.gold += skulls * 1000;
    addXp(party, skulls * 1000);
    const total = handed + skulls;
    for (const k of [...opened]) if (k.startsWith("skulls=")) opened.delete(k);
    opened.add(`skulls=${total}`);
    this.audio.play(9000);
    this.ui.log(`You sell ${skulls} silver skull${skulls === 1 ? "" : "s"}: ${thousands(skulls * 1000)} gold and ${thousands(skulls * 1000)} experience for everyone.`, "loot");
    if (handed < SKULLS_FOR_RING && total >= SKULLS_FOR_RING && !opened.has("skulls:ring")) {
      opened.add("skulls:ring");
      const ring = generateRing(rngFor(this.world.rootSeed, LAYER.LOOT, "skull-ring"), 2);
      if (!giveItem(party, ring)) this.dropLoot(this.player.tx, this.player.ty, 0, [ring]);
      this.player.locked = true;
      await this.ui.message(`"The fifth skull! My collection is complete. Here, a ring for your trouble: ${ring.name.trim()}."`, this.interior?.poi.name ?? "");
      this.player.locked = false;
    }
    this.minimapDirty = true;
  }

  /**
   * The quest of the place is done: its end room opens. A sealed one loses the wall cell in front of it, one in a pocket of the rock (quest 1 and 3
   * and any place without room for a sealed one) takes the party in by teleport. The flag stays in the save, so the room is open when the party
   * comes back.
   */
  private openEndRoom(): void {
    const rt = this.interior;
    const end = rt?.map.dungeon?.endRoom;
    if (!rt || !end) return;
    this.state.opened.add(endFlag(rt.map.key));
    if (end.seal && rt.map.cells[end.seal.y * rt.map.width + end.seal.x] !== CELL.FLOOR) {
      rt.map.cells[end.seal.y * rt.map.width + end.seal.x] = CELL.FLOOR;
      this.interiorView.refresh(rt.map);
      // the wall goes down into the floor as long as the sound of the stone lasts (it used to stand until the next step)
      this.interiorView.sinkWall(end.seal.x, end.seal.y, this.audio.durationOf(9050, 1.6));
      this.audio.play(9050);
      this.ui.log("A wall slides aside with a grinding of stone.", "good");
    }
    if (end.isolated) this.jumpTo(end.cx, end.cy);
  }

  /**
   * The portal of a town (the old Portal, action 28): touching it registers the town, and the party may then go to any other town whose portal it has
   * touched. The portals the party knows are `portal@<town id>` in `state.opened`, which is saved with the game.
   */
  private async usePortal(): Promise<void> {
    const rt = this.interior;
    if (!rt) return;
    if (this.enc.battleMode) {
      this.audio.play(9014, 0.5);
      this.ui.log(IN_MELEE_STEP, "bad");
      return;
    }
    const here = PORTAL_KEY + rt.poi.id;
    this.state.opened.add(here);
    const options = this.portalOptions(here);
    this.audio.play(9041, 0.5);
    if (options.length === 0) {
      this.ui.log(`The portal of ${rt.poi.name} flickers and remembers you. It knows no other town yet: touch the portals of other towns first.`, "info");
      return;
    }
    await this.portalTravel(options);
  }

  /**
   * A chest that gives something opens with its own noise, then the coins and items follow: the pile of loot for gold and ordinary
   * items, the fanfare for a quest item (a key, a key card). One of each, however much the chest held.
   */
  private playLootSounds(a: ActionInstance, effects: Effect[]): void {
    const gold = effects.some((e) => e.type === "gold" && e.amount > 0);
    const items = effects.flatMap((e) => (e.type === "item" ? [e.item] : []));
    const plain = gold || items.some((i) => !i.quest);
    const special = items.some((i) => i.quest);
    if (!plain && !special) return;
    const opens = a.kind === "treasure";
    if (opens) this.audio.play(9008);
    let at = opens ? CHEST_SOUND_GAP : 0;
    const play = (id: number): void => {
      if (at > 0) this.later(at, () => this.audio.play(id));
      else this.audio.play(id);
      at += CHEST_SOUND_GAP;
    };
    if (plain) play(9020);
    if (special) play(9018);
  }

  /** The cry of a hurt hero: the women of the old portraits (`CHARACTER_FEMALE`) have their own. */
  private painSound(character: number): number {
    const avatar = this.state.party.characters[character]?.avatar ?? "";
    return CONSTANTS.CHARACTER_FEMALE.includes(avatar) ? 9021 : 9022;
  }

  /** A step on lava burns every hero (`walkOnLava`); a hovering party and a party in a place are not touched. */
  private lavaStep(x: number, y: number): void {
    if (this.over || this.world.tile(x, y).ground !== GROUND.LAVA_POOL) return;
    const party = this.state.party;
    const step = walkOnLava(party, this.combatRng());
    if (step.hits.length === 0) return;
    this.audio.play(ATTACK_SOUND.fire!);
    this.ui.hurtFlash();
    const names = step.hits.map((h) => `${party.characters[h.character]!.name} ${h.damage}`).join(", ");
    this.ui.log(`The lava burns the party: ${names}.`, "combat");
    for (const hit of step.hits) {
      this.ui.hitCard(hit.character, "fire");
      if (hit.conditions.length) this.ui.log(`${party.characters[hit.character]!.name} is ${hit.conditions.join(" and ").toLowerCase()}!`, "bad");
    }
    this.audio.play(this.painSound(step.hits[0]!.character), 0.7);
    if (step.defeated) void this.gameOver();
  }

  /** A rune throws the party to another cell of the place. */
  private jumpTo(x: number, y: number): void {
    const rt = this.interior;
    if (!rt) return;
    const p = this.worldPos(x, y);
    this.player.place(x, y, this.player.facing, p.x, p.z);
    if (this.state.at.mode === "interior") this.state.at = { ...this.state.at, x, y, facing: this.player.facing };
    this.interiorView.focus(x, y);
    this.audio.play(9041);
    this.markExplored();
    this.noteEndRoom(x, y);
    this.minimapDirty = true;
  }

  /**
   * The party stands in the end room of a cave or dungeon: the quest of the place is done (the quest log moves it to "Completed", the map ticks the place off). The flag is
   * `reached:<place id>` in the saved set, so a save from before the log only gets it with the next visit to the end room.
   */
  private noteEndRoom(x: number, y: number): void {
    const rt = this.interior;
    const end = rt?.map.dungeon?.endRoom;
    if (!rt || rt.campaign || !end || x < end.x || y < end.y || x >= end.x + end.w || y >= end.y + end.h) return;
    const flag = reachedFlag(rt.poi.id);
    if (this.state.opened.has(flag)) return;
    this.state.opened.add(flag);
    this.ui.log(`Quest completed: you have reached the end of ${rt.poi.name}. See the quest log (J).`, "good");
    this.audio.play(9018);
    this.refresh();
  }

  /** The cells that the heads of a ring block follow the levers: set them again from the state in the save. */
  private syncQuestBlocks(): void {
    const rt = this.interior;
    if (!rt) return;
    const standing = new Set(ringBlocked(rt.content, rt.map.width, this.state.opened));
    for (const a of rt.content.actions) {
      if (a.kind !== "head" || (a.params.mode !== "ring" && a.params.mode !== "moan")) continue;
      const i = a.y * rt.map.width + a.x;
      if (standing.has(i)) rt.blocked.add(i);
      else rt.blocked.delete(i);
    }
  }

  private spawnAmbush(ids: number[]): void {
    const { tx, ty, facing } = this.player;
    const view = this.gridView();
    const [dx, dy] = FACING_VEC[facing];
    const placed = this.placeGroup(`ambush:${this.state.steps}:${tx},${ty}`, ids, tx + dx * 2, ty + dy * 2, (x, y) => view.walkable(x, y) && !(x === tx && y === ty));
    this.audio.play(9044);
    this.ambushGrace = placed.length > 0;
    for (const m of placed) {
      this.enc.monsters.push(m);
      this.addMonsterView(m, APPEAR_SECONDS);
    }
    updateBattleMode(this.enc, tx, ty, this.gridView());
  }

  private async openServiceScreen(kind: ServiceKind, tier: number): Promise<void> {
    const rt = this.interior;
    this.audio.playMusic(serviceMusic(kind));
    this.audio.play(9001);
    await openService(this.ui, kind, {
      party: this.state.party,
      world: this.world,
      rootSeed: this.world.rootSeed,
      poi: rt?.poi ?? null,
      tier,
      x: rt?.poi.x ?? this.player.tx,
      y: rt?.poi.y ?? this.player.ty,
      changed: () => this.refresh(),
      sound: (id) => this.audio.play(id),
      soldOut: this.state.opened,
      log: (t, k) => this.ui.log(t, k),
      // the guild houses of the endless world only let members in; the membership is sold by the guild apprentice who stands in the streets of the town
      membershipFrom: "The guild's apprentice, a young person with a heavy book, stands somewhere in the streets of this town. They sell the membership.",
    });
    this.audio.playMusic(rt?.map.theme.music ?? 2);
    this.save("auto");
  }

  // ---------------------------------------------------------------- combat

  private combatRng() {
    return rngFor(this.world.rootSeed, LAYER.SPAWN, "combat", this.state.steps, this.state.kills, this.enc.monsters.length, this.state.party.minutes);
  }

  /**
   * What the party aims at: the first monster in the facing direction within reach and sight (walls and closed gates hide what is behind them), and
   * where none stands on that line the nearest one within 45 degrees to either side that it can see, as the monsters can shoot along diagonals too.
   */
  private focusMonster(): MonsterInstance | null {
    const { tx, ty, facing } = this.player;
    const [dx, dy] = FACING_VEC[facing];
    const view = this.gridView();
    // the wall piece of a brittle wall hides what is behind it from the party standing right in front of it
    if (view.wallBetween?.(tx, ty, tx + dx, ty + dy)) return null;
    for (let i = 1; i <= MONSTER_ACTION_RADIUS; i++) {
      const x = tx + dx * i;
      const y = ty + dy * i;
      const m = this.monsterAt(x, y);
      if (m && !isPhased(m)) return m;
      if (view.opaque(x, y) || view.obstacle?.(x, y)) break;
    }
    return this.enc.monsters.length === 0 ? null : nearestInCone(view, this.enc, tx, ty, dx, dy);
  }

  /** True while the arrows or spells of the last action are still flying. */
  private inFlight(): boolean {
    return performance.now() < this.volleyUntil;
  }

  private async attackFocus(): Promise<void> {
    if (this.busy || this.over || this.player.busy || this.inFlight()) return;
    const m = this.focusMonster();
    if (!m) {
      this.audio.play(9014, 0.4);
      return;
    }
    await this.attackMonster(m);
  }

  private async attackMonster(m: MonsterInstance): Promise<void> {
    if (this.inFlight()) return;
    const { tx, ty } = this.player;
    const view = this.gridView();
    const adjacent = isAdjacent(m.x, m.y, tx, ty, view);
    updateBattleMode(this.enc, tx, ty, view);
    const events = partyAttack(this.state.party, view, this.enc, tx, ty, this.combatRng(), { kind: adjacent ? "melee" : "ranged", targetUid: m.uid });
    this.handleEvents(events);
    updateBattleMode(this.enc, tx, ty, view);
    this.refresh();
  }

  /** Where shots leave the party: just ahead of the camera and a little below the eyes. */
  private muzzle(): Point {
    const p = this.player;
    const [dx, dy] = FACING_VEC[p.facing];
    // tile y grows to the south, which is -z
    return { x: p.x + dx * 0.9, y: p.y - 0.5, z: p.z - dy * 0.9 };
  }

  /**
   * Sends off what the party's ranged and magic attacks throw at the monsters. Returns, per monster, the seconds its hit
   * has to wait for the shot to arrive. `spell` is the kind of a cast spell: it is one projectile aimed at the farthest
   * monster it hits; without it every ranged attack is a volley of arrows.
   */
  private launchPartyShots(events: CombatEvent[], spell?: ProjectileKind): Map<string, number> {
    const flights = new Map<string, number>();
    const hits = events.filter((e): e is PartyAttackEvent => e.type === "party_attack" && e.kind !== "melee");
    const from = this.muzzle();
    if (spell) {
      let far: { at: Point; dist: number } | null = null;
      for (const e of hits) {
        const at = this.monsters.anchor(e.uid);
        const dist = at ? Math.hypot(at.x - from.x, at.z - from.z) : -1;
        if (at && (!far || dist > far.dist)) far = { at, dist };
      }
      if (!far) return flights;
      const seconds = this.projectiles.launch(spell, from, far.at);
      for (const e of hits) flights.set(e.uid, seconds);
      return flights;
    }
    for (const e of hits) {
      const at = this.monsters.anchor(e.uid);
      if (at) flights.set(e.uid, this.projectiles.launch("arrow", from, at, e.shots ?? 1));
    }
    return flights;
  }

  /** A monster's ranged attack flies at the party. Returns how long it takes, so the hit can be shown on arrival. */
  private launchMonsterShot(uid: string, damageType: string, delay: number): number {
    const m = this.enc.monsters.find((x) => x.uid === uid);
    if (!m) return 0;
    const seconds = flightSeconds(Math.hypot(m.x - this.player.tx, m.y - this.player.ty));
    const kind = monsterProjectile(damageType);
    this.later(delay, () => {
      const from = this.monsters.anchor(uid);
      // aimed at the camera, a little lower so that the last frames are not cut off by the near plane
      if (from) this.projectiles.launch(kind, from, { x: this.player.x, y: this.player.y - 0.7, z: this.player.z });
    });
    return seconds;
  }

  /** Runs `run` after `seconds` unless the scene has changed by then. */
  private later(seconds: number, run: () => void): void {
    if (seconds <= 0) {
      run();
      return;
    }
    const epoch = this.fxEpoch;
    setTimeout(() => {
      if (epoch === this.fxEpoch) run();
    }, seconds * 1000);
  }

  /**
   * Shows what a combat step did. The simulation has already decided everything; the pictures follow its timeline:
   * the party's arrows and spells fly first and their hits show when they arrive, then the monsters answer (their shots
   * fly as well). Melee has no flight, so it all shows at once.
   */
  private handleEvents(events: CombatEvent[], spell?: ProjectileKind): void {
    const party = this.state.party;
    const flights = this.launchPartyShots(events, spell);
    const landing = (uid: string) => flights.get(uid) ?? 0;
    // the monsters answer when the party's last shot has landed
    const answer = Math.max(0, ...flights.values());
    let end = answer;
    const at = (seconds: number, run: () => void) => {
      end = Math.max(end, seconds);
      this.later(seconds, run);
    };
    // a monster steps first and attacks from the tile it reached; its attack waits until the model has walked there, or the shot
    // would leave a tile the monster has not reached yet (and come out of nowhere, before the monster is seen)
    const walkers = new Set(events.flatMap((e) => (e.type === "monster_move" ? [e.uid] : [])));
    let defeat = false;
    for (const e of events) {
      switch (e.type) {
        case "monster_move":
          at(answer, () => {
            const m = this.enc.monsters.find((x) => x.uid === e.uid);
            if (!m) return;
            const p = this.monsterWorld(m);
            this.monsters.moveTo(m.uid, p.x, p.y, p.z);
          });
          break;
        case "monster_pull":
          // Gravity: a quick slide to the place it would have walked to, no walking clip
          at(0, () => {
            const m = this.enc.monsters.find((x) => x.uid === e.uid);
            if (!m) return;
            const p = this.monsterWorld(m);
            this.monsters.slideTo(m.uid, p.x, p.y, p.z);
          });
          break;
        case "monster_attack": {
          const target = party.characters[e.target]!;
          const name = monsterById(this.enc.monsters.find((x) => x.uid === e.uid)?.defId ?? 1).name;
          const start = answer + (walkers.has(e.uid) ? MONSTER_STEP_SECONDS : 0);
          const flight = e.ranged ? this.launchMonsterShot(e.uid, e.damageType, start) : 0;
          at(start, () => this.monsters.attack(e.uid));
          at(start + flight, () => {
            if (e.damage > 0) {
              this.ui.log(`${name} ${e.ranged ? "shoots" : "hits"} ${target.name} for ${e.damage}.`, "combat");
              this.ui.hitCard(e.target, e.damageType);
              this.ui.hurtFlash();
              this.audio.play(e.ranged || e.damageType !== "physical" ? ATTACK_SOUND[e.damageType] ?? 9019 : 9016);
              this.audio.play(this.painSound(e.target), 0.7);
            } else {
              this.ui.log(`${name} misses ${target.name}.`, "combat");
              this.audio.play(9017);
            }
            for (const c of e.conditions) this.ui.log(`${target.name} is ${c.toLowerCase()}!`, "bad");
            if (e.drained) this.ui.log(`${name} drains ${e.drained} spell points from ${target.name}.`, "bad");
            if (e.aged) this.ui.log(`${target.name} ages ${e.aged === 1 ? "a year" : `${e.aged} years`}.`, "bad");
          });
          break;
        }
        case "monster_regen":
          // the wound closes when the monsters have had their turn
          at(answer, () => {
            const m = this.enc.monsters.find((x) => x.uid === e.uid);
            if (m && Math.max(Math.abs(m.x - this.player.tx), Math.abs(m.y - this.player.ty)) <= 6) this.ui.log(`${monsterById(m.defId).name} regenerates ${e.amount} hit points.`, "combat");
          });
          break;
        case "party_attack": {
          const def = monsterById(e.defId);
          const who = e.attacker !== null ? party.characters[e.attacker]!.name : "The party";
          // the twang of the bow is heard when the arrows leave; a spell made its sound when it was cast
          if (e.kind === "ranged") this.audio.play(9019);
          at(landing(e.uid), () => {
            if (e.damage > 0) {
              this.ui.log(`${who} ${e.kind === "magic" ? "burns" : e.kind === "ranged" ? "shoots" : "hits"} ${def.name} for ${e.damage}.`, "combat");
              if (e.kind === "melee") this.audio.play(9016);
              this.audio.play(9033, 0.6);
            } else {
              this.ui.log(`${who} misses.`, "combat");
              this.audio.play(9017);
            }
          });
          break;
        }
        case "wolf_kill":
          // zombie_attack is a stand-in until the Wolf gets a sound of its own
          at(landing(e.uid), () => {
            this.ui.log(`The wolf leaps at ${monsterById(e.defId).name} and finishes it off.`, "good");
            this.audio.play(9046);
          });
          break;
        case "monster_dead": {
          const def = monsterById(e.defId);
          this.state.killed.add(e.uid);
          this.noteHutDeath(e.uid);
          // quest 5: the end boss stands before the end room, and its death opens it
          if (isEndBoss(e.uid)) this.openEndRoom();
          this.state.kills++;
          this.dropLoot(e.x, e.y, e.loot.gold, e.loot.item ? [e.loot.item] : [], true);
          const epoch = this.fxEpoch;
          at(landing(e.uid), () => {
            this.ui.log(`${def.name} is defeated. +${thousands(e.xp)} xp`, "good");
            this.audio.play(9045);
            // the pile appears when the body is gone: at once for a model without a death clip, after the clip for one with
            this.monsters.die(e.uid, () => this.releaseLoot(e.x, e.y, epoch));
            for (const c of party.characters) if (c.xp > 0 && xpReady(c)) this.ui.toast(`${c.name} can advance a level!`);
          });
          break;
        }
        case "effects_ended":
          at(answer, () => this.logEnded(e.effects));
          break;
        case "conditions_ended":
          at(answer, () => this.logConditions(e.conditions));
          break;
        case "denied":
          this.audio.play(9014);
          this.ui.log(e.reason === "no_ranged_weapon" ? "Nobody has a ranged weapon equipped." : e.reason === "out_of_range" ? "The target is too far away." : e.reason === "cannot_act" ? "Nobody can act." : "Nothing to attack.", "bad");
          break;
        case "defeat":
          defeat = true;
          break;
      }
    }
    if (defeat) at(end + 0.3, () => void this.gameOver());
    if (end > 0) {
      this.volleyUntil = performance.now() + end * 1000;
      // the cards already show the new numbers; once everything has landed they get their final look
      at(end, () => this.refresh());
    }
    this.minimapDirty = true;
  }

  // ---------------------------------------------------------------- spells that need the map

  /** Where the party stands, as a save keeps it (Lloyd's Beacon remembers it). */
  private locationNow(): Place {
    const s = this.state;
    const { tx, ty, facing } = this.player;
    return this.campaignLocation() ?? (this.mode === "interior" && s.at.mode === "interior" ? { ...s.at, x: tx, y: ty, facing } : { mode: "overworld", x: tx, y: ty, facing });
  }

  /** In a town: Pandora's box is too dangerous there. (The campaign's open country is filed as a town of the old maps, but it is no town.) */
  private inTown(): boolean {
    const rt = this.interior;
    return this.mode === "interior" && !!rt && rt.poi.kind === "town" && rt.campaign?.slug !== CAMPAIGN_OUTSIDE;
  }

  /** Whether the party stands in deep water (the sea of the generated world, the campaign's `seafarer` water). */
  private deepWaterHere(): boolean {
    const { tx, ty } = this.player;
    if (this.mode === "overworld") {
      const t = this.world.tile(tx, ty);
      return t.ground === GROUND.WATER && t.deco === 0;
    }
    const rt = this.interior;
    if (!rt?.campaign) return false;
    const abs = rt.campaign.model.toAbsolute(tx, ty);
    return rt.campaign.model.blockDef(abs.x, abs.y)?.water === "seafarer";
  }

  /** Whether the party stands on water of any depth (a ford, a shore, the sea, a campaign river): there is no camping there, not even with magic. */
  private onWater(): boolean {
    const { tx, ty } = this.player;
    if (this.mode === "overworld") {
      const g = this.world.tile(tx, ty).ground;
      return g === GROUND.WATER || g === GROUND.SHALLOW || g === GROUND.LAVA_POOL;
    }
    const rt = this.interior;
    if (!rt?.campaign) return false;
    const abs = rt.campaign.model.toAbsolute(tx, ty);
    return !!rt.campaign.model.blockDef(abs.x, abs.y)?.water;
  }

  /** Tells the simulation where the party stands: Walk on Water holds while it is in deep water. */
  private syncSurroundings(): void {
    surroundings.inDeepWater = !!this.state && this.mode !== "title" && this.deepWaterHere();
  }

  /** Monsters that Dimensional Phasing has taken out of the world are drawn purple and still; the ones that came back normal. */
  private syncMonsterEffects(): void {
    for (const m of this.enc.monsters) this.monsters.setPhased(m.uid, isPhased(m));
  }

  /**
   * Is the cell between two cells of a straight line free to be passed over (Jump)? Inside a map a jump clears floor, a pit or a
   * hole in the floor, but not a wall, a closed door or a brittle wall; the overworld has no walls to speak of.
   */
  private clearBetween(x0: number, y0: number, x1: number, y1: number): boolean {
    const rt = this.interior;
    if (this.mode !== "interior" || !rt) return true;
    const { map, blocked } = rt;
    const sx = Math.sign(x1 - x0);
    const sy = Math.sign(y1 - y0);
    for (let x = x0 + sx, y = y0 + sy; x !== x1 || y !== y1; x += sx, y += sy) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
      const i = y * map.width + x;
      const cell = map.cells[i];
      if (cell !== CELL.FLOOR && cell !== CELL.LOW) return false;
      if (blocked.has(i) && !rt.slabs?.has(i)) return false;
      if (this.isClosedDoor(x, y)) return false;
    }
    return !crossesSlab(rt.slabs, map.width, x0, y0, x1, y1);
  }

  /**
   * The first of the distances ahead whose cell the party can reach, as a cell; null when none. "hop" (Jump) also needs the cells
   * in between to be open, "ghost" (Etherealise) passes doors and brittle walls on its way and only needs the target to be free,
   * "warp" (Teleport) is the plain check.
   */
  private ahead(distances: number[], how: "hop" | "ghost" | "warp" = "warp"): { x: number; y: number } | null {
    const { tx, ty, facing } = this.player;
    const [dx, dy] = FACING_VEC[facing];
    for (const d of distances) {
      const x = tx + dx * d;
      const y = ty + dy * d;
      if (!this.canEnter(x, y, how === "ghost") || this.inClosedEndRoom(x, y)) continue;
      if (how === "hop" && !this.clearBetween(tx, ty, x, y)) continue;
      return { x, y };
    }
    return null;
  }

  /** The end room of the place before its quest is done: a spell that carried the party in would pass the boss (and the quest). */
  private inClosedEndRoom(x: number, y: number): boolean {
    const rt = this.interior;
    const end = this.mode === "interior" ? rt?.map.dungeon?.endRoom : undefined;
    return !!rt && inEndRoom(end, x, y) && !this.state.opened.has(endFlag(rt.map.key));
  }

  private moveAhead(distances: number[], how: "hop" | "ghost" | "warp" = "warp"): boolean {
    if (this.player.busy) return false;
    const to = this.ahead(distances, how);
    if (!to) return false;
    const p = this.worldPos(to.x, to.y);
    this.player.place(to.x, to.y, this.player.facing, p.x, p.z);
    void this.onArrived(to.x, to.y);
    this.audio.play(9039);
    return true;
  }

  private jump(): void {
    if (!this.moveAhead([2], "hop")) this.ui.log("There is no room to jump there.", "bad");
  }

  /** The party's wild-card spells that move it are checked before the spell points are paid. */
  private spellRefusal(spellId: number, beacon?: "set" | "return", distance = 0): string | null {
    if (this.enc.battleMode && movesParty(spellId, beacon)) return IN_MELEE_SPELL;
    // the castles and the spaceship are magically closed to every spell that carries the party away (quest document 1.2)
    const here = this.interior?.map;
    if (movesParty(spellId, beacon) && here?.castle) return "The castle seems to be magically protected against movement spells.";
    if (movesParty(spellId, beacon) && here?.dungeon?.quest === "spaceship") return `Something in this strange construct is preventing you from casting ${SPELLS[spellId]?.title ?? "that spell"}.`;
    const { tx, ty } = this.player;
    const view = this.gridView();
    const near = (radius: number) => this.enc.monsters.filter((m) => m.hp > 0 && !isPhased(m) && (m.x - tx) ** 2 + (m.y - ty) ** 2 <= radius * radius);
    if (isAttackSpell(spellId)) {
      const m = this.focusMonster();
      if (!m) return "There is nothing to aim at.";
      if (needsAdjacent(spellId) && !isAdjacent(m.x, m.y, tx, ty, view)) return "That spell only works on a monster next to the party.";
      return null;
    }
    switch (spellId) {
      case 13:
        return near(PHASE_RADIUS).length === 0 ? "No monster is near enough." : null;
      case 22:
        return near(GRAVITY_RADIUS).some((m) => !isAdjacent(m.x, m.y, tx, ty, view)) ? null : "No monster is near enough to be pulled.";
      case 26:
        return identifyMonsters(this.enc, tx, ty).length === 0 ? "There is no monster in range to identify." : null;
      case 66:
        return this.portalOptions().length === 0 ? "The party knows no town portal yet. Touch the portal of a town first." : null;
      case 42:
        return this.safeSpots().length === 0 ? "There is no safe place close enough." : null;
      case 52:
        return this.onWater() ? "The party cannot rest on water or lava." : null;
      case 45:
        this.gateSpot = this.pickGate();
        return this.outsideNow() ? (this.gateSpot ? null : "Nature's Gate finds nowhere to open.") : "Nature's Gate only opens in the open country.";
      case 47:
        return this.ahead([distance]) ? null : "There is no room to teleport there.";
      case 62:
        return this.ahead([2], "ghost") ? null : "There is no room beyond.";
      case 16:
        return this.ahead([2], "hop") ? null : "There is no room to jump there.";
      default:
        return null;
    }
  }

  /** Time Distortion: the cells nearest to the party that no monster can reach. */
  private safeSpots(): Spot[] {
    const { tx, ty } = this.player;
    return safeCells(this.enc, tx, ty, (x, y) => this.canEnter(x, y) && !this.inClosedEndRoom(x, y));
  }

  /** The open country: the generated overworld and the campaign's outside map. */
  private outsideNow(): boolean {
    return this.mode === "overworld" || this.interior?.campaign?.slug === CAMPAIGN_OUTSIDE;
  }

  /** Where Nature's Gate would put the party: a different kind of ground, no monster near. Null when there is nowhere. */
  private gateSpot: { x: number; y: number; facing: Facing } | null = null;

  private pickGate(): { x: number; y: number; facing: Facing } | null {
    const rng = this.combatRng();
    const facingAt = (ok: (x: number, y: number) => boolean, x: number, y: number): Facing => (["N", "E", "S", "W"] as const).find((f) => ok(x + FACING_VEC[f][0], y + FACING_VEC[f][1])) ?? "N";
    if (this.mode === "overworld") {
      const here = this.world.tile(this.player.tx, this.player.ty).biome;
      const spot = pickGateSpot(this.world, rng, here);
      return spot ? { x: spot.x, y: spot.y, facing: facingAt((x, y) => isTileWalkable(this.world.tile(x, y)), spot.x, spot.y) } : null;
    }
    const rt = this.interior;
    if (!rt?.campaign) return null;
    const model = rt.campaign.model;
    const abs = model.toAbsolute(this.player.tx, this.player.ty);
    const here = model.blockDef(abs.x, abs.y)?.id;
    const { tx, ty } = this.player;
    const spots = model
      .entries()
      .filter(([x, y]) => model.isEnterable(x, y) && model.blockDef(x, y)?.family === "outside" && model.blockDef(x, y)?.id !== here)
      .map(([x, y]) => model.toLocal(x, y))
      .filter((l) => this.canEnter(l.x, l.y) && !this.enc.monsters.some((m) => m.hp > 0 && (m.x - l.x) ** 2 + (m.y - l.y) ** 2 <= (MONSTER_ACTION_RADIUS + 2) ** 2) && (l.x !== tx || l.y !== ty));
    const l = spots[rng.int(spots.length)];
    return l ? { x: l.x, y: l.y, facing: facingAt((x, y) => this.canEnter(x, y), l.x, l.y) } : null;
  }

  /** Brings the party to a place it lit a fire at (Lloyd's Beacon): the same ways in as loading a save. */
  private async travelTo(at: Place): Promise<void> {
    this.state.at = at;
    if (isCampaignPlace(at) && this.state.campaign) {
      await this.openCampaignMap(at.poiId.slice("campaign:".length), { x: at.x, y: at.y, rotation: { N: 0, E: 90, S: 180, W: 270 }[at.facing] });
      return;
    }
    if (at.mode === "interior") {
      const poi = this.world.poiById(at.poiId);
      if (poi) {
        await this.openInterior(poi, { x: at.x, y: at.y, facing: at.facing }, at.ret);
        return;
      }
    }
    const free = at.mode === "overworld" ? at : { ...this.world.startPosition() };
    await this.enterOverworld(free.x, free.y, free.facing as Facing);
  }

  /** The towns whose portal the party knows, as the entries of the portal list (the generated world and the campaign each keep their own record). */
  private portalOptions(exclude = ""): Option<string>[] {
    const camp = this.state.campaign;
    if (camp) {
      return Object.keys(camp.progress.portals)
        .slice(0, 12)
        .map((k) => ({ label: textOf(k), value: k }));
    }
    return [...this.state.opened]
      .filter((k) => k.startsWith(PORTAL_KEY) && k !== exclude)
      .map((k) => this.world.poiById(k.slice(PORTAL_KEY.length)))
      .flatMap((p) => (p ? [{ label: p.name, value: p.id }] : []))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Asks which town and goes there; the party appears next to that town's portal. */
  private async portalTravel(options: Option<string>[]): Promise<void> {
    this.player.locked = true;
    const choice = await this.ui.choose(TEXTS[412]!, "", options);
    this.player.locked = false;
    if (choice === null) return;
    const camp = this.state.campaign;
    if (camp) {
      const p = camp.progress.portals[choice];
      if (!p) return;
      this.audio.play(9041);
      await this.openCampaignMap(mapSlugOf(p.map), { x: p.x, y: p.y, rotation: p.rot });
      return;
    }
    const to = this.world.poiById(choice);
    if (!to) return;
    const map = generateInterior(this.world, to, 0);
    const arrival = portalStart(map, buildMapContent(this.world, to, map));
    this.audio.play(9041);
    await this.openInterior(to, arrival);
  }

  /**
   * The results of the spells the game carries out. Returns whether the cast costs a round of the monsters: spells that move the party
   * to another place (or let it rest) do not, the monsters of the old place are gone.
   */
  private async worldSpell(spellId: number, caster: Character, pick: SpellChoice, result: Extract<SpellResult, { kind: "world" }>): Promise<boolean> {
    const party = this.state.party;
    const { tx, ty } = this.player;
    const events: CombatEvent[] = [];
    switch (spellId) {
      case 13: {
        const caught = phaseMonsters(this.enc, tx, ty);
        this.audio.play(9041);
        this.ui.log(`${caught.length} monster${caught.length === 1 ? "" : "s"} slip out of this world for ${PHASE_TURNS} turns.`, "good");
        return true;
      }
      case 22: {
        events.push(...pullMonsters(this.gridView(), this.enc, tx, ty));
        this.audio.play(9029);
        this.ui.log(events.length ? "Gravity drags the monsters to the party." : "Nothing moves.", events.length ? "good" : "info");
        this.handleEvents(events);
        return true;
      }
      case 26: {
        const lines = identifyMonsters(this.enc, tx, ty).map((m) => `${m.name}: ${m.hp}/${m.maxHp} hit points, armor ${m.armor}, ${m.attacks} attack${m.attacks === 1 ? "" : "s"} a round${m.abilities ? `, ${m.abilities}` : ""}`);
        this.audio.play(9039);
        await this.ui.message(lines.join("\n"), "Identify Monster");
        return true;
      }
      case 32: {
        if (result.beacon === "set") {
          this.audio.play(9039);
          this.ui.log(`${caster.name} lights a fire here. ${caster.name} can come back to it with Lloyd's Beacon.`, "good");
          return true;
        }
        if (!result.place) return false;
        this.audio.play(9041);
        this.ui.log(`${caster.name} follows the beacon back to the fire.`, "good");
        await this.travelTo(result.place);
        return false;
      }
      case 42: {
        const spots = this.safeSpots();
        const spot = spots[this.combatRng().int(spots.length)];
        if (!spot) return true;
        const p = this.worldPos(spot.x, spot.y);
        this.player.place(spot.x, spot.y, this.player.facing, p.x, p.z);
        this.audio.play(9041);
        this.ui.log("Time bends, and the party stands where nothing can reach it.", "good");
        void this.onArrived(spot.x, spot.y);
        return false;
      }
      case 45: {
        const spot = this.gateSpot ?? this.pickGate();
        this.gateSpot = null;
        if (!spot) return true;
        this.audio.play(9041);
        this.ui.log("The gate opens on another land.", "good");
        if (this.mode === "overworld") await this.enterOverworld(spot.x, spot.y, spot.facing);
        else {
          const p = this.worldPos(spot.x, spot.y);
          this.player.place(spot.x, spot.y, spot.facing, p.x, p.z);
          void this.onArrived(spot.x, spot.y);
        }
        return false;
      }
      case 47:
        if (!this.moveAhead([pick.distance ?? 0])) this.ui.log("There is no room to teleport there.", "bad");
        return false;
      case 62:
        // Etherealise: one field is skipped, doors and brittle walls included (the party passes through them like a shadow)
        if (!this.moveAhead([2], "ghost")) this.ui.log("There is no room beyond.", "bad");
        else this.ui.log(`${caster.name} turns to mist, and the party slips through.`, "good");
        return false;
      case 52: {
        // Super Shelter: the same as resting with no monster about
        const r = rest(party);
        if (!r.ok) {
          this.ui.log("No food available. The party cannot rest!", "bad");
          return false;
        }
        this.audio.play(9030);
        this.ui.log("A shelter of magic closes round the party, which rests and recovers.", "good");
        this.logConditions(r.conditions ?? []);
        this.save("auto");
        return false;
      }
      case 66:
        await this.portalTravel(this.portalOptions());
        return false;
      default:
        void pick;
        return true;
    }
  }

  /** Pandora's box: gold, an item, a monster. */
  private pandora(outcome: PandoraOutcome): void {
    const party = this.state.party;
    switch (outcome.type) {
      case "gold":
        party.gold += outcome.amount;
        this.audio.play(9020);
        this.ui.log(`Gold pours out of the rift: ${thousands(outcome.amount)}.`, "loot");
        break;
      case "item": {
        this.audio.play(9018);
        if (giveItem(party, outcome.item)) this.ui.log(`Out of the rift falls ${outcome.item.name.trim()}.`, "loot");
        else {
          this.dropLoot(this.player.tx, this.player.ty, 0, [outcome.item]);
          this.ui.log(`Out of the rift falls ${outcome.item.name.trim()}, and it lies at your feet: the backpacks are full.`, "loot");
        }
        break;
      }
      case "monster": {
        const { tx, ty, facing } = this.player;
        const [dx, dy] = FACING_VEC[facing];
        const view = this.gridView();
        const spot = [1, 2, 3].map((d) => ({ x: tx + dx * d, y: ty + dy * d })).find((c) => view.walkable(c.x, c.y) && !this.monsterAt(c.x, c.y));
        if (!spot) {
          this.ui.log("The rift closes before anything comes through.", "info");
          break;
        }
        const m = createMonster(`pandora:${this.state.steps}:${party.minutes}`, outcome.defId, spot.x, spot.y);
        this.enc.monsters.push(m);
        this.addMonsterView(m, APPEAR_SECONDS);
        this.audio.play(9044);
        this.ui.log(`${monsterById(outcome.defId).name} steps out of the rift!`, "bad");
        updateBattleMode(this.enc, tx, ty, view);
        break;
      }
    }
  }

  /** Combine, Duplication and Transform Ring: which items, then the change. The spell points are spent whatever is chosen (the spell sheet says so). */
  private async itemSpell(spellId: number, hero: number): Promise<void> {
    const c = this.state.party.characters[hero]!;
    const ui = this.ui;
    const cancelled = (why: string) => {
      this.audio.play(9040);
      ui.log(`${why} The spell is cancelled.`, "bad");
    };
    if (spellId === 55) {
      const groups = combineGroups(c);
      if (groups.length === 0) return cancelled(`${c.name} carries no three items of one kind and material.`);
      const picked = await pickFromBackpack(ui, c, { title: "Combine", text: "pick three items of the same kind and material.", allowed: groups.flatMap((g) => g.slots), count: 3, valid: (s) => canCombine(c, s), verb: "Combine" });
      if (!picked) return cancelled("Nothing was combined.");
      const made = combine(c, picked, this.combatRng());
      if (!made) return cancelled("That was no combination.");
      this.audio.play(9024);
      ui.log(`Three items melt into ${made.name.trim()}.`, "good");
    } else if (spellId === 58) {
      const slots = duplicableSlots(c);
      if (slots.length === 0) return cancelled(`${c.name} carries nothing to copy.`);
      const picked = await pickFromBackpack(ui, c, { title: "Duplication", text: "pick the item to copy. It may fail, and it may be lost.", allowed: slots, count: 1, valid: () => true, verb: "Duplicate" });
      if (!picked) return cancelled("Nothing was copied.");
      const name = c.inventory[picked[0]!]!.name.trim();
      const r = duplicate(this.state.party, c, picked[0]!, this.combatRng());
      this.audio.play(r === "destroyed" ? 9040 : 9024);
      ui.log(r === "duplicated" ? `${name} is copied.` : r === "destroyed" ? `${name} crumbles to dust.` : r === "no_room" ? `${name} would have been copied, but there is no room in the backpacks.` : "Nothing happens.", r === "duplicated" ? "good" : r === "nothing" ? "info" : "bad");
    } else {
      const slots = ringSlots(c);
      if (slots.length === 0) return cancelled(`${c.name} carries no ring.`);
      const picked = await pickFromBackpack(ui, c, { title: "Transform Ring", text: "pick the ring to change. It may be lost.", allowed: slots, count: 1, valid: () => true, verb: "Transform" });
      if (!picked) return cancelled("No ring was changed.");
      const r = transformRing(c, picked[0]!, this.combatRng());
      this.audio.play(r.result === "changed" ? 9024 : 9040);
      ui.log(r.result === "changed" ? `The ring becomes ${r.ring!.name.trim()}.` : "The ring shatters.", r.result === "changed" ? "good" : "bad");
    }
    recalcValues(c, this.state.party.talents, false, this.state.party.mascot);
  }

  private async castSpells(): Promise<void> {
    if (this.busy || this.over || this.inFlight()) return;
    const party = this.state.party;
    const caster = this.enc.battleMode && this.enc.attacker !== null && canAct(party.characters[this.enc.attacker]!) ? this.enc.attacker : null;
    // the bottom entry of the menus repeats the last spell: in a fight only its caster may use it, and an attack spell needs a target in sight
    const quick = quickCast(party, this.focusMonster() !== null, caster);
    let who = caster;
    let pick: SpellChoice | null = null;
    if (who === null) {
      const casters = party.characters.map((c, i) => ({ c, i })).filter(({ c }) => c.spells.length > 0 && canAct(c));
      if (casters.length === 0) {
        this.ui.log(party.characters.every((c) => c.mana <= 0) ? "Nobody in the party has magical abilities." : "Nobody can cast a spell right now.", "bad");
        return;
      }
      if (casters.length === 1) who = casters[0]!.i;
      else {
        const options: Option<number | SpellChoice>[] = casters.map(({ c, i }) => ({ label: c.name, value: i, note: `${c.sp}/${c.mana} SP` }));
        if (quick) options.push(quickCastOption(party, quick));
        const choice = await this.ui.choose("Who casts?", "", options);
        if (choice === null) return;
        if (typeof choice === "number") who = choice;
        else {
          who = quick!.caster;
          pick = await askSpellDetails(this.ui, party, choice.spellId);
          if (!pick) return;
        }
      }
    }
    this.busy = true;
    pick ??= await pickSpell(this.ui, party, who, quick, (id) => this.audio.play(id));
    if (!pick) {
      this.busy = false;
      return;
    }
    // what cannot work now is refused before the spell points are spent
    const refusal = this.spellRefusal(pick.spellId, pick.beacon, pick.distance);
    if (refusal) {
      this.audio.play(9014);
      this.ui.log(refusal, "bad");
      this.busy = false;
      return;
    }
    party.lastCast = { caster: party.characters[who]!.name, spellId: pick.spellId, target: pick.target, element: pick.element };
    this.syncSurroundings();
    const result = castSpell(party, who, pick.spellId, this.combatRng(), { ...pick, here: this.locationNow(), town: this.inTown(), battle: this.enc.battleMode });
    const c = party.characters[who]!;
    // spells that carry the party off or let it rest do not give the monsters a round: they are left behind
    let round = result.kind !== "fizzle" && result.kind !== "attack" && result.kind !== "jump";
    switch (result.kind) {
      case "fizzle":
        this.audio.play(9040);
        this.ui.log(FIZZLE_TEXT[result.reason]?.(c.name) ?? `The spell fizzles (${result.reason.replace(/_/g, " ")}).`, "bad");
        break;
      case "attack": {
        const target = this.focusMonster();
        if (!target) break; // checked before the spell was paid for; only a monster that vanished in between gets here
        this.audio.play(ATTACK_SOUND[result.type] ?? 9029);
        const magic = { damage: result.damage, type: result.type };
        const { tx, ty } = this.player;
        const events = result.special
          ? specialSpell(party, this.gridView(), this.enc, tx, ty, this.combatRng(), result.special, target.uid, magic)
          : result.penetrate
            ? spellInLine(party, this.gridView(), this.enc, tx, ty, this.combatRng(), target.uid, magic, result.undead)
            : partyAttack(party, this.gridView(), this.enc, tx, ty, this.combatRng(), { kind: "magic", targetUid: target.uid, magic });
        this.handleEvents(events, SPELL_PROJECTILE[result.type] ?? "magic");
        for (const healed of result.healed ?? []) this.ui.avatarEffect(healed.target, "cure_hp");
        if (result.healed?.length) this.ui.log("Moonlight washes over the party and heals it.", "good");
        break;
      }
      // the picture of the spell appears over the portrait of whoever it works on (the old Avatar.avatar_effect)
      case "heal":
        this.audio.play(9031);
        this.ui.avatarEffect(result.target, "cure_hp");
        this.ui.log(`${party.characters[result.target]!.name} is healed for ${result.amount}.`, "good");
        if (result.paid) this.ui.log(`${c.name} pays ${result.paid} hit points for it.`, "info");
        break;
      case "cure":
        this.audio.play(9031);
        for (const fx of cureEffects(result.removed)) this.ui.avatarEffect(result.target, fx);
        this.ui.log(result.removed.length ? `${party.characters[result.target]!.name} is cured of ${result.removed.join(", ")}.` : "It had no effect.", result.removed.length ? "good" : "info");
        break;
      case "suppress":
        this.audio.play(9031);
        if (result.condition) for (const fx of cureEffects([result.condition])) this.ui.avatarEffect(result.target, fx);
        this.ui.log(result.condition ? `${party.characters[result.target]!.name}'s ${result.condition.toLowerCase()} is held back: the time to find a cure starts over.` : "It had no effect.", result.condition ? "good" : "info");
        break;
      case "revive":
        this.audio.play(9031);
        this.ui.avatarEffect(result.target, "cure_hp");
        this.ui.log(`${party.characters[result.target]!.name} returns to life.`, "good");
        if (result.endurance) this.ui.log(`${party.characters[result.target]!.name} comes back with one point of Endurance less, and ${c.name} feels older.`, "info");
        break;
      case "intervention":
        this.audio.play(9031);
        for (const i of result.healed) this.ui.avatarEffect(i, "cure_hp");
        this.ui.log(result.revived.length ? "Divine light lifts the fallen and heals the whole party." : "Divine light heals the whole party.", "good");
        this.ui.log(`${c.name} feels ${SPELL_AGING} years older.`, "info");
        break;
      case "bless":
        this.audio.play(9032);
        this.ui.log(`${party.characters[result.target]!.name} is blessed.`, "good");
        break;
      case "buff":
        this.audio.play(result.effect.kind === "light" ? 9035 : result.effect.kind === "protection" ? 9047 : 9039);
        if (result.effect.kind === "protection" && result.effect.element) this.ui.avatarEffect(who, protectionEffect(result.effect.element));
        else if (result.effect.kind === "levitate") this.ui.avatarEffect(who, "gui_levitate");
        this.ui.log(BUFF_TEXT[result.effect.kind]?.(c.name, party.characters[result.effect.character ?? -1]?.name ?? "") ?? `${c.name} casts ${result.effect.kind.replace(/_/g, " ")}.`, "good");
        break;
      case "rift":
        this.audio.play(9041);
        this.ui.log(`${party.characters[result.target]!.name} steps out of the world for ${RIFT_TURNS} turns, or until the party moves.`, "good");
        break;
      case "food":
        this.audio.play(9039);
        this.ui.log("A ration of food appears in the party's hands.", "good");
        break;
      case "monster_effect": {
        const target = this.focusMonster();
        if (!target) break;
        const name = monsterById(target.defId).name;
        this.audio.play(9039);
        if (result.spellId === 31) this.ui.log(immobilize(target) ? `${name} cannot move for ${IMMOBILIZE_TURNS} turns.` : `${name} has been held once already: nothing happens.`, "info");
        else this.ui.log(makeClumsy(target) ? `${name} stumbles about: its attacks miss more often.` : `${name} is clumsy already.`, "info");
        break;
      }
      case "pandora":
        this.audio.play(9041);
        this.pandora(result.outcome);
        break;
      case "items":
        this.audio.play(9039);
        await this.itemSpell(result.spellId, result.target);
        break;
      case "world":
        round = await this.worldSpell(result.spellId, c, pick, result);
        break;
      case "jump":
        this.jump();
        break;
    }
    // every spell that worked and did not strike a monster costs a round (an attack spell has had its round already)
    if (round) {
      const { tx, ty } = this.player;
      this.handleEvents(spellRound(party, this.gridView(), this.enc, tx, ty, this.combatRng()));
      updateBattleMode(this.enc, tx, ty, this.gridView());
    } else if (result.kind === "attack") {
      // the spell may have killed the last monster beside the party: without this the party stayed in melee with nobody there and no step was allowed
      // (32nd playtest, point 12: a Fire Stalker killed with Star Burst)
      updateBattleMode(this.enc, this.player.tx, this.player.ty, this.gridView());
    }
    this.busy = false;
    this.refresh();
  }

  private async gameOver(): Promise<void> {
    if (this.over) return;
    this.over = true;
    this.audio.play(9023);
    this.audio.stopMusic();
    const choice = await this.ui.gameOver();
    const save = readSave(kindOfState(this.state), "auto");
    if (choice === "load" && save) await this.loadFromFile(save);
    else await this.start(this.world.seedText);
  }

  // ---------------------------------------------------------------- input and menus

  private onKey(e: KeyboardEvent): void {
    // the loading screen has the floor: a key pressed under it would turn the party or open a menu on a half-built map
    if (this.mode === "title" || this.ui.modalOpen || this.ui.loading.active || e.metaKey || e.altKey) return;
    const k = e.key;
    const player = this.player;
    const cmd = (dir: MoveDir) => {
      if (!this.busy) player.command({ type: "move", dir });
      e.preventDefault();
    };
    // Ctrl + arrow left / right sidesteps (the arrows alone turn); every other Ctrl combination stays with the browser
    if (e.ctrlKey) {
      if (k === "ArrowLeft") return cmd("left");
      if (k === "ArrowRight") return cmd("right");
      return;
    }
    switch (k) {
      case "w": case "W": case "ArrowUp": return cmd("forward");
      case "s": case "S": case "ArrowDown": return cmd("back");
      case "a": case "A": return cmd("left");
      case "d": case "D": return cmd("right");
      case "q": case "Q": case "ArrowLeft": player.command({ type: "turn", by: -1 }); e.preventDefault(); return;
      case "e": case "E": case "ArrowRight": player.command({ type: "turn", by: 1 }); e.preventDefault(); return;
      case " ": e.preventDefault(); void this.attackFocus(); return;
      case "f": case "F": void this.castSpells(); return;
      case "i": case "I": case "c": case "C": void this.openInventory(0); return;
      case "r": case "R": void this.camp(); return;
      case "j": case "J": void this.openQuestLog(); return;
      case "m": case "M": void this.openMap(); return;
      case "Escape": void this.menu(); return;
      case "F5": e.preventDefault(); this.save("quick"); this.ui.toast("Quicksaved"); return;
      case "F9": { e.preventDefault(); const q = readSave(kindOfState(this.state), "quick"); if (q) void this.loadFromFile(q); return; }
      case "1": case "2": case "3": case "4": void this.openInventory(Number(k) - 1); return;
      case "5": void this.openInventory("mascot"); return;
      case "t": case "T": void this.openInventory("perks"); return;
    }
  }

  private async onAction(a: "attack" | "cast" | "rest" | "map" | "menu" | "inventory"): Promise<void> {
    if (this.ui.modalOpen) return;
    if (a === "attack") await this.attackFocus();
    else if (a === "cast") await this.castSpells();
    else if (a === "rest") await this.camp();
    else if (a === "map") await this.openMap();
    else if (a === "menu") await this.menu();
    else await this.openInventory(0);
  }

  private async openInventory(view: CharacterView): Promise<void> {
    if (this.ui.modalOpen) return;
    this.audio.play(9006);
    await openInventory(this.ui, this.state.party, view, {
      changed: () => this.refresh(),
      mascots: () => this.state.campaign?.progress.mascots ?? this.state.party.mascots,
      log: (t, k) => this.ui.log(t, k ?? "info"),
      sound: (id) => this.audio.play(id),
      useScroll: async (character, slot, item) => {
        const c = this.state.party.characters[character]!;
        const spell = item.spellId;
        if (!spell) return;
        // same rules as the guild and the old game: only the school of the hero's class, and only from the spell's level on
        const block = learnBlock(c, spell);
        if (block !== null) {
          const name = item.name.trim();
          this.audio.play(9014);
          this.ui.log(
            block === "known" ? `${c.name} already knows ${name}.` : block === "level" ? `${c.name} is too inexperienced for ${name} (level ${SPELLS[spell]!.level}).` : `A ${c.classType} cannot learn ${name}.`,
            block === "known" ? "info" : "bad",
          );
        } else {
          c.spells.push(spell);
          c.spells.sort((x, y) => x - y);
          c.inventory[slot] = null;
          this.passTime(ACTION_MINUTES);
          this.audio.play(9024);
          this.ui.log(`${c.name} learns ${item.name.trim()} from the scroll.`, "good");
        }
        this.refresh();
      },
    });
    this.refresh();
  }

  /**
   * Camping, as in the old `rest`: monsters that cannot reach the party do not matter. When some can, all but one of the heroes
   * are asleep and the monsters get up to nine turns to arrive; if one stands next to the party by then, the camp is broken up
   * (and the sleepers stay asleep until they are hit, woken or twelve steps have passed). Otherwise the party rests eight hours.
   */
  private async camp(): Promise<void> {
    if (this.busy || this.over || this.inFlight()) return;
    const party = this.state.party;
    if (this.onWater()) {
      this.ui.log("The party cannot rest on water or lava.", "bad");
      return;
    }
    const { tx, ty } = this.player;
    const hunters = monstersReaching(this.gridView(), this.enc, tx, ty);
    const warning = hunters.length > 0 ? " Monsters are about: they will find the camp, and most of the party will be asleep when they do." : "";
    if (!(await this.ui.confirm("Rest", `Camp for eight hours? The party eats one ration (${party.food} left).${warning}`, "Rest", "Not now"))) return;
    this.busy = true;
    try {
      if (hunters.length > 0 && !(await this.campAmbush())) return;
      const r = rest(party);
      if (!r.ok) {
        this.ui.log("No food available. The party cannot rest!", "bad");
        return;
      }
      this.audio.play(9030);
      this.ui.log("The party rests and recovers.", "good");
      this.logConditions(r.conditions ?? []);
      this.save("auto");
    } finally {
      this.busy = false;
      this.refresh();
    }
  }

  /** The monsters come for the camp. Returns true when nobody reached it and the rest can go on. */
  private async campAmbush(): Promise<boolean> {
    const party = this.state.party;
    const rng = this.combatRng();
    const awake = party.characters.map((c, i) => i).filter((i) => canAct(party.characters[i]!));
    // everybody who can act but one, picked at random, falls asleep
    const keep = awake.length > 0 ? awake[rng.int(awake.length)]! : -1;
    for (const i of awake) if (i !== keep) addCondition(party.characters[i]!, "Sleeping", party.minutes);
    this.ui.log("The party is caught asleep!", "bad");
    this.refresh();
    const { tx, ty } = this.player;
    for (let turn = 0; turn < 9; turn++) {
      const events = monsterTurn(party, this.gridView(), this.enc, tx, ty, this.combatRng(), MONSTER_ACTION_RADIUS);
      this.handleEvents(events);
      updateBattleMode(this.enc, tx, ty, this.gridView());
      this.refresh();
      if (this.over || events.some((e) => e.type === "defeat")) return false;
      if (this.enc.battleMode) {
        this.ui.log("Monsters have reached the camp!", "bad");
        return false;
      }
      await new Promise((r) => setTimeout(r, 220));
    }
    return true;
  }

  private async openMap(): Promise<void> {
    if (this.ui.modalOpen) return;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const interior = this.mode === "interior" && this.interior ? this.interior : null;
    // the picture can be zoomed and moved (a big outside map does not fit): the middle cell and the cells across; it opens on the party
    // the outside map shows the globe once: the middle stays inside the world, the party stands where the world puts it (the arrow jumps across the seam)
    const bounds = interior ? { width: interior.map.width, height: interior.map.height } : { width: this.world.width, height: this.world.height };
    const limits: ZoomLimits = { min: 11, max: Math.max(bounds.width, bounds.height) + 4 };
    const here = (): { x: number; y: number } => (interior ? { x: this.player.tx, y: this.player.ty } : { x: this.world.wrapX(this.player.tx), y: this.world.wrapY(this.player.ty) });
    // opens 25 cells across (the user's wish); zooming out is one wheel step away
    let view: MapViewport = { ...here(), cells: clampCells(MAP_OPEN_CELLS, limits) };
    const monsters = this.enc.monsters.filter((m) => m.hp > 0).map((m) => ({ x: m.x, y: m.y }));
    // the game stands still while the map is open, so what the Crow sees is the same until it is closed
    const traps = this.trapsShown();
    const eye = this.eyeOn();
    const events = interior ? [] : this.overworldEvents();
    // only a party with the Cartographer talent has a map to read (35th playtest): the big map stays black, the minimap beside the cards is there for everybody. The campaign keeps its old rules.
    const blank = !this.state.campaign && !this.state.party.talents.includes("talent_cartographer");
    const draw = () => {
      if (blank) {
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#0a0705";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#8a7a5a";
        ctx.font = "20px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ["Nobody in the party knows how to draw a map.", "The cartographer of a town teaches it:", "the talent \"Cartographer\"."].forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - 1) * 30));
        return;
      }
      if (interior) {
        drawInteriorMap(canvas, interior.map, interior.content, this.state.explored, this.state.opened, this.player.tx, this.player.ty, this.player.facing, monsters, view.cells, traps, view, this.minimapIcons, eye);
      } else {
        drawOverworldMap(canvas, this.world, this.state.explored, this.player.tx, this.player.ty, this.player.facing, monsters, view.cells, eye, view, this.minimapIcons, false, events);
      }
    };
    const show = (next: MapViewport) => {
      if (next.x === view.x && next.y === view.y && next.cells === view.cells) return;
      view = next;
      draw();
    };
    draw();
    const legend = blank ? [] : interior ? interiorLegend(interior.map, interior.content, traps.size > 0, this.state.opened, eye) : OVERWORLD_LEGEND;
    let removeKeys = () => undefined as void;
    await this.ui.panel((close, root) => {
      const tip = h("div", { class: "map-tip hud-hide" });
      // the map is scaled by the style sheet, so the pointer is turned into a cell through the size it is shown at
      const fractions = (e: MouseEvent | WheelEvent) => {
        const r = canvas.getBoundingClientRect();
        return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, cellPx: r.width / view.cells };
      };
      let drag: { x: number; y: number } | null = null;
      canvas.addEventListener("mousemove", (e) => {
        const { fx, fy, cellPx } = fractions(e);
        if (drag) {
          // the map follows the pointer: whole cells at a time, and the pixels that did not make a cell are kept for the next move
          const mx = -Math.trunc((e.clientX - drag.x) / cellPx);
          const my = -Math.trunc((e.clientY - drag.y) / cellPx);
          if (mx !== 0 || my !== 0) {
            show(panBy(view, mx, my, bounds));
            drag = { x: drag.x - mx * cellPx, y: drag.y - my * cellPx };
          }
        }
        const { x: cx, y: cy } = cellAt(view, fx, fy);
        if (blank) {
          tip.classList.add("hud-hide");
          return;
        }
        // beyond the edge of the outside map there is nothing: the world is shown once
        if (!interior && (cx < 0 || cy < 0 || cx >= this.world.width || cy >= this.world.height)) {
          tip.classList.add("hud-hide");
          return;
        }
        const text = interior
          ? describeInteriorCell(interior.map, interior.content, this.state.explored, this.state.opened, cx, cy, monsters, traps, this.state.party.talents.includes("talent_perceptive"), eye)
          : describeOverworldTile(this.world, this.state.explored, cx, cy, monsters, events);
        const me = here();
        const atParty = cx === me.x && cy === me.y;
        tip.classList.toggle("hud-hide", !!drag || (!text && !atParty));
        if (drag || (!text && !atParty)) return;
        tip.textContent = `${atParty ? "You are here" : text}  (${cx}, ${cy})`;
        // a cave or dungeon whose end room the party has reached gets a green tick after its position (35th playtest)
        const placeId = interior ? null : this.world.tile(cx, cy).poiId;
        if (placeId && this.state.opened.has(reachedFlag(placeId))) tip.append(h("span", { class: "map-tick", text: " ✔", style: "color:#6fdc6f;font-weight:bold" }));
        const box = root.getBoundingClientRect();
        tip.style.left = `${e.clientX - box.left + 14}px`;
        tip.style.top = `${e.clientY - box.top + 14}px`;
      });
      canvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = "grabbing";
        e.preventDefault();
      });
      const release = () => {
        drag = null;
        canvas.style.cursor = "grab";
      };
      window.addEventListener("mouseup", release);
      canvas.addEventListener("mouseleave", () => tip.classList.add("hud-hide"));
      // the wheel zooms around the pointer; the page behind must not scroll
      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const { fx, fy } = fractions(e);
          show(zoomStep(view, e.deltaY < 0 ? 1 : -1, limits, fx, fy));
        },
        { passive: false },
      );
      const step = () => Math.max(1, Math.round(view.cells / 10));
      const onKey = (e: KeyboardEvent) => {
        const k = e.key;
        const pan: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (pan[k]) show(panBy(view, pan[k]![0] * step(), pan[k]![1] * step(), bounds));
        else if (k === "+" || k === "=") show(zoomStep(view, 1, limits));
        else if (k === "-" || k === "_") show(zoomStep(view, -1, limits));
        else if (k === "c" || k === "C" || k === "Home") show(centreOn(view, here().x, here().y));
        else if (k === "f" || k === "F") show(fitMap(bounds.width, bounds.height, limits));
        else return;
        e.preventDefault();
        e.stopPropagation();
      };
      window.addEventListener("keydown", onKey, true);
      removeKeys = () => {
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("mouseup", release);
      };
      canvas.style.cssText = "display:block;border:2px solid var(--gold-dim);border-radius:6px;image-rendering:pixelated;cursor:grab";
      root.classList.add("map-panel");
      const tool = (text: string, title: string, onclick: () => void) => h("button", { class: "btn", text, title, onclick });
      root.append(
        h("button", { class: "btn close", text: "Close (Esc)", onclick: close }),
        h("h2", { text: interior ? interior.poi.name : "The wide world" }),
        h(
          "div",
          { class: "map-tools" },
          tool("+", "Zoom in (+ or the wheel)", () => show(zoomStep(view, 1, limits))),
          tool("−", "Zoom out (- or the wheel)", () => show(zoomStep(view, -1, limits))),
          tool("Whole map", "Show the whole map (F)", () => show(fitMap(bounds.width, bounds.height, limits))),
          tool("My position", "Centre the map on the party (C)", () => show(centreOn(view, here().x, here().y))),
        ),
        h(
          "div",
          { class: "map-body" },
          canvas,
          h(
            "div",
            { class: "legend" },
            h("div", { class: "legend-head", text: "Legend" }),
            ...legend.map((e) => {
              // the picture of the old game's symbol where the sheet is there, else the colour
              const icons = this.minimapIcons;
              const picture = icons && e.icon ? `background:url(${icons.legendIcon(e.icon)}) center / cover` : `background:${e.color}`;
              return h("div", { class: "legend-row" }, h("i", { style: picture }), h("span", { text: e.label }));
            }),
            h("div", { class: "small", text: "Move the pointer over the map to see what a spot holds. Drag to move the map, wheel or + and - to zoom, arrow keys to move, C to come back." }),
          ),
        ),
        tip,
      );
    });
    removeKeys();
  }

  private async menu(): Promise<void> {
    if (this.ui.modalOpen) return;
    for (;;) {
      const choice = await this.ui.choose("Menu", this.state.campaign ? "The campaign of the hand-built maps." : `World seed: ${this.state.seed}\nShare the page address to share this world.`, [
        { label: "Resume", value: "resume" },
        { label: "Save game", value: "save" },
        { label: "Load game", value: "load" },
        { label: "Copy seed link", value: "link" },
        { label: "Options", value: "options", note: "graphics, sound" },
        ...(DEBUG_MENU ? [{ label: "Debug", value: "debug", note: "cheats for testing" }] : []),
        { label: "Back to title", value: "title" },
      ]);
      if (choice === "debug") {
        // some cheats (Reveal map) are for looking at the game: they close the whole menu
        if (await this.debugMenu()) return;
        continue;
      }
      if (choice === "options") {
        // Back from the options returns here; Apply with a change of models reloads the page, which ends the menu
        if (await this.optionsMenu()) return;
        continue;
      }
      if (choice === "save") {
        this.save("manual");
        this.save("auto");
        this.ui.toast("Game saved");
      } else if (choice === "load") {
        await this.loadMenu();
      } else if (choice === "link") {
        try {
          await navigator.clipboard.writeText(location.href);
          this.ui.toast("Link copied");
        } catch {
          this.ui.log(location.href, "info");
        }
      } else if (choice === "title") {
        this.save("auto");
        await this.start(this.state.seed);
      }
      return;
    }
  }

  /** Esc > Debug (`game/debug.ts`, switched off with `DEBUG_MENU`): cheats for testing. Stays open so that several can be used in a row; true when a cheat asked for the menu to close. */
  private async debugMenu(): Promise<boolean> {
    const party = this.state.party;
    for (;;) {
      const choice = await this.ui.choose("Debug", "Cheats for testing. God mode ends with the game, the rest stays.", [
        { label: `God mode: ${cheats.god ? "on" : "off"}`, value: "god", note: "no damage, endless food" },
        { label: `+${DEBUG_LEVELS} Levels`, value: "levels", note: "each hero" },
        { label: "+100k Gold", value: "gold" },
        { label: "All spells", value: "spells", note: "of each hero's school" },
        { label: "All talents", value: "talents" },
        { label: "Reveal map", value: "map", note: this.mode === "overworld" ? (this.state.campaign ? "150 tiles around" : "the whole world") : "this level" },
        { label: "Identify", value: "identify", note: this.mode === "overworld" ? "the nearest place" : "this place" },
        ...(this.state.campaign ? [] : [{ label: "Teleport to Level", value: "teleport", note: "any town, cave, dungeon or castle" }]),
      ]);
      if (!choice) return false;
      this.audio.play(9001); // menu-selection, like every other menu click
      switch (choice) {
        case "god":
          setGodMode(party, !cheats.god);
          this.ui.toast(`God mode ${cheats.god ? "on" : "off"}`);
          break;
        case "levels":
          debugLevels(party);
          this.ui.toast(`+${DEBUG_LEVELS} levels for each hero`);
          break;
        case "gold":
          debugGold(party);
          this.ui.toast(`+${thousands(DEBUG_GOLD)} gold`);
          break;
        case "spells":
          this.ui.toast(`${debugAllSpells(party)} spells learnt`);
          break;
        case "talents":
          this.ui.toast(`${debugAllTalents(party)} talents added`);
          break;
        case "map":
          this.revealMap();
          this.ui.toast("Map revealed");
          this.refresh();
          return true;
        case "identify":
          await this.identifyPlace();
          break;
        case "teleport":
          if (await this.teleportToLevel()) return true;
          break;
      }
      this.refresh();
    }
  }

  /** Debug: a list of every place of the world with its level; the party appears at the entrance of the one picked, whatever key it asks for. True when the party went. */
  private async teleportToLevel(): Promise<boolean> {
    // the showcase comes first: a dark hall with every monster, person and object of the game (`interiors/showcase.ts`)
    const options: Option<string>[] = [
      { label: "Showcase: all monsters and objects", value: SHOWCASE_ID, note: "Dungeon" },
      ...teleportTargets(this.world.allPois()).map(({ poi, kind }) => ({ label: `${kind}: ${poi.name}`, value: poi.id, note: `Level ${poi.tier}` })),
    ];
    const id = await this.ui.choose("Teleport to Level", "The party appears at the entrance. Keys and key cards are not needed.", options);
    const poi = id === null ? null : this.world.poiById(id);
    if (!poi) return false;
    this.audio.play(9041);
    // the showcase is no place of the world: the way out leads back to where the party stood
    const at = this.state.at;
    await this.openInterior(poi, undefined, poi.id === SHOWCASE_ID ? (at.mode === "interior" ? at.ret : { x: at.x, y: at.y, facing: at.facing }) : undefined);
    return true;
  }

  /** Debug: what the generator knows about the place the party is in, or about the closest one in the open country (`game/identify.ts`). */
  private async identifyPlace(): Promise<void> {
    let poi: Poi | null = null;
    if (this.mode === "interior" && this.interior) {
      poi = this.interior.campaign ? null : this.interior.poi;
      if (!poi) {
        await this.ui.message(`${this.interior.map.theme.id}\nA map of the campaign: its quests are the old game's own.`, this.interior.poi.name);
        return;
      }
    } else if (this.mode === "overworld") {
      const { tx, ty } = this.player;
      let best = Infinity;
      for (const p of this.world.poisInRect(tx - IDENTIFY_RADIUS, ty - IDENTIFY_RADIUS, tx + IDENTIFY_RADIUS, ty + IDENTIFY_RADIUS)) {
        const d = Math.max(Math.abs(p.x - tx), Math.abs(p.y - ty));
        if (d < best) {
          best = d;
          poi = p;
        }
      }
    }
    if (!poi) {
      this.ui.toast(`No place within ${IDENTIFY_RADIUS} tiles`);
      return;
    }
    const [title = "", ...rest] = identifyLines(poi, planDungeon(this.world, poi), this.world.castleSpellsOf(poi.id));
    await this.ui.message(rest.join("\n"), title);
  }

  /** Marks the whole level as explored: the whole globe of a generated world (the huge one is wider than a square of `REVEAL_RADIUS` tiles), the square around the party in the campaign. */
  private revealMap(): void {
    const ex = this.state.explored;
    if (this.mode === "interior" && this.interior) {
      const { map } = this.interior;
      const key = `in:${map.key}`;
      const size = map.width * map.height;
      for (let i = 0; i < size; i++) ex.mark(key, i, size);
    } else {
      if (this.state.campaign) {
        const { tx, ty } = this.player;
        for (let y = ty - REVEAL_RADIUS; y <= ty + REVEAL_RADIUS; y++) for (let x = tx - REVEAL_RADIUS; x <= tx + REVEAL_RADIUS; x++) ex.markOverworld(x, y);
      } else {
        const { w, h } = spanOf(this.state.size);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ex.markOverworld(x, y);
      }
    }
    this.minimapDirty = true;
  }

  /**
   * The options, graphics and sound, as switches. A click only turns a switch over on a draft; Apply puts the whole draft into effect at
   * once, so the page is reloaded at most once however much was changed, and only for the model set (the renderers keep their models and
   * textures for the whole session). Back drops the draft. Returns true when the page reloads and the menu has nothing to return to.
   */
  private async optionsMenu(): Promise<boolean> {
    const draft: OptionsDraft = { ...this.settings, viewDistance: this.viewDistance, models: this.modelSet };
    const onOff = (v: boolean) => (v ? "on" : "off");
    const picked = await this.ui.toggles(
      "Options",
      "",
      [
        { label: () => `Ground and floors: ${draft.floorModel ? "3D" : "flat"}`, flip: () => (draft.floorModel = !draft.floorModel) },
        { label: () => `Models: ${draft.models === "original" ? "original" : "low poly"}`, flip: () => (draft.models = draft.models === "original" ? "lowpoly" : "original") },
        { label: () => `Distance: ${VIEW_NAMES[draft.viewDistance]}`, flip: () => (draft.viewDistance = VIEW_DISTANCES[(VIEW_DISTANCES.indexOf(draft.viewDistance) + 1) % VIEW_DISTANCES.length]!) },
        { label: () => `Resolution: ${draft.resolution}`, flip: () => (draft.resolution = draft.resolution === "normal" ? "low" : "normal") },
        { label: () => `Animated town scenes: ${onOff(draft.animatedTown)}`, flip: () => (draft.animatedTown = !draft.animatedTown) },
        { label: () => `Fade out cursor, if unused: ${onOff(draft.fadeCursor)}`, flip: () => (draft.fadeCursor = !draft.fadeCursor) },
        { label: () => `Show FPS: ${onOff(draft.showFps)}`, flip: () => (draft.showFps = !draft.showFps) },
        { label: () => `Music: ${onOff(draft.music)}`, flip: () => (draft.music = !draft.music) },
        { label: () => `Sound effects: ${onOff(draft.sfx)}`, flip: () => (draft.sfx = !draft.sfx) },
      ],
      "Apply puts every change into effect at once. Switching the models restarts the game: it is saved first.",
    );
    return picked === "apply" ? this.applyOptions(draft) : false;
  }

  /** Puts a draft of the options into effect and stores it. Everything applies on the spot except the model set, which reloads the page. */
  private async applyOptions(draft: OptionsDraft): Promise<boolean> {
    const { models, ...next } = draft;
    const before = this.settings;
    // the view distance in the draft is the one in use, which a ?view= in the address may have set: only a changed choice is stored
    const viewChanged = next.viewDistance !== this.viewDistance;
    this.settings = { ...next, viewDistance: viewChanged ? next.viewDistance : before.viewDistance };

    if (next.floorModel !== before.floorModel) {
      this.interiorView.setModelFloor(next.floorModel);
      this.applyGround();
      // the caravans, huts and mascots stand a little higher on the 3D ground than on the flat one: draw them again
      this.caravanShown = "";
      this.hutShown = "";
      this.mascotShown = "";
      if (this.chunks && this.mode === "overworld") {
        this.chunks.rebuild();
        this.chunks.update(this.player.tx, this.player.ty);
        this.chunks.loadAll();
      }
    }
    if (viewChanged) {
      this.viewDistance = next.viewDistance;
      // a ?view= in the address would override the choice the next time
      const params = new URLSearchParams(location.search);
      if (params.has("view")) {
        params.delete("view");
        const query = params.toString();
        history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
      }
      if (this.chunks) {
        this.chunks.setRadius(chunkRadius(next.viewDistance));
        if (this.mode === "overworld") this.chunks.update(this.player.tx, this.player.ty);
      }
      this.interiorView.setViewShare(VIEW_SHARE[next.viewDistance]);
      this.campaignView.setViewShare(VIEW_SHARE[next.viewDistance]);
    }
    if (next.resolution !== before.resolution) this.r.setResolution(next.resolution);
    setAnimatedTown(next.animatedTown);
    setCursorFade(next.fadeCursor);
    if (!next.showFps) this.ui.setFps(null);
    this.audio.setMusicVolume(next.music ? MUSIC_VOLUME : 0);
    this.audio.sfxVolume = next.sfx ? SFX_VOLUME : 0;
    if (next.sfx !== before.sfx && this.mode !== "title") this.updateAmbient();
    writeSettings(this.settings);

    if (models === this.modelSet) {
      this.ui.toast("Options applied");
      return false;
    }
    return this.switchModelSet(models);
  }

  /**
   * Switches between the low-poly and the original models, ground tiles included. The renderers hold the loaded models and their textures
   * for the whole session, so the switch is a page reload: the game is saved first and `resumeAfterReload` continues it.
   * Returns true when the page reloads.
   */
  private async switchModelSet(next: ModelSet): Promise<boolean> {
    if (next === "original" && !(await this.haveOriginals())) {
      this.ui.toast("Original models are not built (npm run assets:originals)");
      return false;
    }
    // the choice goes first: if the browser cannot store it, it cannot keep the save either, and nothing is lost by stopping here
    if (!storeModelSet(next)) {
      this.ui.toast("Could not store the setting (browser storage unavailable)");
      return false;
    }
    // on the title screen there is no game to save and to continue
    if (this.mode !== "title") {
      this.save("auto");
      markResume(kindOfState(this.state));
    }
    location.reload();
    return true;
  }

  /**
   * Lists the saves (the one made in the menu, the quicksave and the autosave), first those of the kind of game being played,
   * then those of the other kind, and continues the chosen one.
   */
  private async loadMenu(): Promise<void> {
    const mine = kindOfState(this.state);
    const options = [...GAME_KINDS].sort((a) => (a === mine ? -1 : 1)).flatMap((kind) =>
      SAVE_SLOTS.map((slot) => {
        const file = readSave(kind, slot);
        return { label: `${KIND_NAMES[kind]}: ${SLOT_NAMES[slot]}`, value: { kind, slot }, note: file ? describeSave(file) : "empty", disabled: !file };
      }),
    );
    const pick = await this.ui.choose("Load game", "The game you are playing now is replaced. Save first if you want to keep it.", options);
    if (!pick) return;
    const file = readSave(pick.kind, pick.slot);
    if (file) await this.loadFromFile(file);
  }

  save(slot: SaveSlot): void {
    if (this.mode === "title" || this.over || !this.state) return;
    // turning on the spot does not move the party, so the stored facing is brought up to date here
    const at = this.state.at;
    this.state.at = this.campaignLocation() ?? (this.mode === "interior" && at.mode === "interior" ? { ...at, x: this.player.tx, y: this.player.ty, facing: this.player.facing } : { mode: "overworld", x: this.player.tx, y: this.player.ty, facing: this.player.facing });
    this.stashCampaign();
    const ok = writeSave(this.state, slot);
    this.lastAutosave = this.state.steps;
    if (!ok) this.ui.log("Could not save (browser storage unavailable).", "bad");
  }

  // ---------------------------------------------------------------- ambient sound

  /**
   * Background sounds around the party. Campaign maps carry sound cells (`s` the sound, `sp` how far it carries); the closest
   * source of each sound counts and its volume falls off linearly to zero at that distance, as in the old `ambient_sound`
   * (which looked five cells around). The endless world has its fountains in the squares of the towns and its weather over
   * the country: birds by day, crickets by night, wind over snow, desert and mountains.
   */
  private updateAmbient(): void {
    const levels = new Map<number, number>();
    const add = (sound: number, distance: number, carries: number) => {
      const volume = Math.max(0, 1 - distance / Math.max(1, carries));
      if (volume > (levels.get(sound) ?? 0)) levels.set(sound, volume);
    };
    const rt = this.interior;
    if (this.mode === "interior" && rt?.campaign) {
      const model = rt.campaign.model;
      const here = model.toAbsolute(this.player.tx, this.player.ty);
      for (let dx = -5; dx < 5; dx++) {
        for (let dy = -5; dy < 5; dy++) {
          const cell = model.get(here.x + dx, here.y + dy);
          if (!cell?.s) continue;
          const distance = Math.hypot(dx, dy);
          if (distance > 5) continue;
          // a sound cell without a parameter carries 5 cells, one with 0 only one
          const carries = cell.sp === undefined || cell.sp === null || cell.sp === "" ? 5 : Number(cell.sp) || 1;
          add(Number(cell.s), distance, carries);
        }
      }
    } else if (this.mode === "interior" && rt) {
      for (const a of rt.content.actions) if (a.kind === "fountain") add(1, Math.hypot(a.x - this.player.tx, a.y - this.player.ty), 5);
    } else if (this.mode === "overworld") {
      const tile = this.world.tile(this.player.tx, this.player.ty);
      const night = isNight(this.state.party);
      if (tile.biome === BIOME.SNOW || tile.biome === BIOME.DESERT || tile.ground === GROUND.MOUNTAIN || tile.ground === GROUND.PASS) levels.set(5, 0.5);
      else if (tile.biome === BIOME.LAVA) levels.set(7, 0.3);
      else if (night || tile.biome === BIOME.SWAMP) levels.set(6, 0.5);
      else if (tile.biome !== BIOME.OCEAN) levels.set(2, 0.5);
    }
    this.audio.setAmbient(levels);
  }

  // ---------------------------------------------------------------- hud

  /**
   * The map shows what the party has seen: the cells at its feet, and in front of it, inside the cone of the screen, whatever no
   * wall hides (a wall that was seen is drawn, what lies behind it is not: a wall that can be broken must not give away the way
   * behind it). Turning on the spot reveals as well, see `frame`.
   */
  private markExplored(): void {
    const { tx, ty, facing } = this.player;
    const ex = this.state.explored;
    const view = this.gridView();
    const seen = visibleCells(view.opaque, tx, ty, facing, this.sightRadius());
    if (this.mode === "interior" && this.interior) {
      const { map } = this.interior;
      const key = `in:${map.key}`;
      for (const [x, y] of seen) {
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        ex.mark(key, y * map.width + x, map.width * map.height);
      }
    } else {
      for (const [x, y] of seen) ex.markOverworld(x, y);
    }
    this.minimapDirty = true;
  }

  /** The short list beside the minimap: the campaign shows all its open quests, the generated world the first few (the whole log is one click or J away) and nothing before the first one. */
  private hudQuests(): HudInfo["quests"] {
    if (this.state.campaign) return { open: Object.keys(this.state.campaign.progress.quests.active).map(tidy), done: Object.keys(this.state.campaign.progress.quests.completed).length };
    const view = this.questLogView();
    if (view.open.length === 0 && view.done.length === 0) return null;
    // (the lines are cut short: the panel is narrow and sits above the buttons; the full text is in the log)
    const shown = view.open.slice(0, HUD_QUESTS).map((q) => (q.length > HUD_QUEST_CHARS ? `${q.slice(0, HUD_QUEST_CHARS - 1).trimEnd()}…` : q));
    return { open: view.open.length > shown.length ? [...shown, `... and ${view.open.length - shown.length} more (J)`] : shown, done: view.done.length };
  }

  private hudInfo(): HudInfo {
    const rt = this.interior;
    const tile = this.mode === "overworld" ? this.world.tile(this.player.tx, this.player.ty) : null;
    return {
      place: rt ? rt.poi.name : "The wilds",
      sub: rt?.campaign ? "campaign" : rt ? `${rt.map.theme.id.replace(/_/g, " ")} - level ${rt.poi.tier}` : `${tile ? OVERWORLD_THEMES[tile.biome === BIOME.OCEAN ? BIOME.MEADOW : tile.biome].id : ""}`,
      facing: this.player.facing,
      // the world is a globe: the position shown is the one on the map, not how far the party has walked past the seam
      x: this.mode === "overworld" ? this.world.wrapX(this.player.tx) : this.player.tx,
      y: this.mode === "overworld" ? this.world.wrapY(this.player.ty) : this.player.ty,
      battle: this.enc.battleMode,
      attacker: battleActor(this.state.party, this.enc),
      quests: this.hudQuests(),
      mascot: this.state.party.mascot,
      alarm: this.dangerNear(),
    };
  }

  /**
   * What makes the crow come alive: a monster within the action radius (the old `monster_action` switched its clip on for
   * exactly that) or a trap on the cell the party stands on or up to three ahead, which the crow gives away before the party
   * steps on it.
   */
  private dangerNear(): boolean {
    const { tx, ty, facing } = this.player;
    if (this.enc.monsters.some((m) => m.hp > 0 && Math.max(Math.abs(m.x - tx), Math.abs(m.y - ty)) <= MONSTER_ACTION_RADIUS)) return true;
    const rt = this.interior;
    if (this.mode !== "interior" || !rt) return false;
    const [dx, dy] = FACING_VEC[facing];
    for (let i = 0; i <= 3; i++) {
      const a = rt.actionAt.get(this.cellIndex(tx + dx * i, ty + dy * i));
      if (a && isTrapAction(a) && !isSpent(a, this.state.opened)) return true;
    }
    return false;
  }

  /** Wizard's Eye is on: the map shows everything for as long as it lasts, and its frame turns gold. */
  private eyeOn(): boolean {
    return !!this.state && hasEffect(this.state.party, "wizard_eye");
  }

  /**
   * The traps the map gives away while Wizard's Eye is on: with the Crow as the mascot every trap of the level, without it only the traps that
   * have gone off (the old game showed them with the Crow alone). Keys are `x,y`.
   */
  private trapsShown(): Set<string> {
    const out = new Set<string>();
    const rt = this.interior;
    if (this.mode !== "interior" || !rt || !this.eyeOn()) return out;
    const crow = this.state.party.mascot === "Crow";
    for (const a of rt.content.actions) {
      if (!isTrapAction(a) || isSpent(a, this.state.opened)) continue;
      if (crow || this.state.opened.has(`${a.uid}@fired`)) out.add(`${a.x},${a.y}`);
    }
    return out;
  }

  private refresh(): void {
    if (this.mode === "title") return;
    if (cheats.god) maintainGod(this.state.party);
    this.ui.updateHud(this.state.party, this.hudInfo());
    this.syncMonsterEffects();
    this.minimapDirty = true;
    if (!activeCharacters(this.state.party).length && !this.over) void this.gameOver();
  }

  /** Detect Monster is on: the maps show every monster, not only the ones on ground the party has seen. */
  private detectOn(): boolean {
    return !!this.state && hasEffect(this.state.party, "detect_monster");
  }

  private drawMinimap(): void {
    const canvas = this.ui.minimap;
    const monsters = this.enc.monsters.filter((m) => m.hp > 0).map((m) => ({ x: m.x, y: m.y }));
    const detect = this.detectOn();
    if (this.mode === "interior" && this.interior) {
      const rt = this.interior;
      drawInteriorMap(canvas, rt.map, rt.content, this.state.explored, this.state.opened, this.player.tx, this.player.ty, this.player.facing, monsters, undefined, this.trapsShown(), undefined, this.minimapIcons, this.eyeOn(), detect);
    } else {
      drawOverworldMap(canvas, this.world, this.state.explored, this.player.tx, this.player.ty, this.player.facing, monsters, undefined, this.eyeOn(), undefined, this.minimapIcons, detect, this.overworldEvents());
    }
    canvas.classList.toggle("eye", this.eyeOn());
  }

  /** Every caravan of the world (fixed by the seed), for the maps. */
  private caravanSites: { world: World; list: (MapEvent & { talent: string })[] } | null = null;

  /**
   * What the maps mark with a question mark on the open land: the mascots still waiting (the one in the party is gone from its place), the Monster Huts
   * that still stand and the caravans of the talent traders. Where they stand is known from the seed, the maps show them once the tile has been seen.
   */
  private overworldEvents(): MapEvent[] {
    if (!this.state) return [];
    if (this.caravanSites?.world !== this.world) {
      const list: (MapEvent & { talent: string })[] = [];
      for (const poi of this.world.allPois()) for (const c of caravansOf(this.world, poi)) list.push({ x: c.x, y: c.y, label: "Caravan (talent trader)", talent: c.talent });
      this.caravanSites = { world: this.world, list };
    }
    // a caravan whose talent the party has bought has nothing left to sell: its question mark is grey
    const out: MapEvent[] = this.caravanSites.list.map(({ talent, ...ev }) => (this.state.party.talents.includes(talent) ? { ...ev, label: `Caravan (${talentInfo(talent).name}: bought)`, done: true } : ev));
    for (const s of this.mode === "overworld" ? this.mascotSpots() : []) if (s.mascot !== this.state.party.mascot) out.push({ x: s.x, y: s.y, label: "Mascot" });
    for (const h of hutIndex(this.world).huts) if (!this.hutBurnt(h)) out.push({ x: h.x, y: h.y, label: "Monster Hut" });
    return out;
  }

  // ---------------------------------------------------------------- frame

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, this.r.engine.getDeltaTime() / 1000 || 0.016);
    this.frameTimes.push(this.r.engine.getDeltaTime());
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    const fps = this.r.engine.getFps();
    if (Number.isFinite(fps) && fps > 0) this.fpsSmooth += (fps - this.fpsSmooth) * 0.05;
    // the engine's own count is the mean of the last frames; shown four times a second so that the digits can be read
    if (this.settings.showFps && now - this.fpsShownAt > 250) {
      this.fpsShownAt = now;
      this.ui.setFps(Number.isFinite(fps) ? fps : null);
    }

    if (this.mode === "title" || !this.state) {
      // slow orbit around the start of the world as a backdrop
      this.r.camera.position.set(0, 14, -30);
      this.r.camera.rotation.set(0.25, performance.now() / 12000, 0);
      this.r.scene.render();
      void now;
      return;
    }

    if (this.campaignDirty && !this.busy) this.campaignChanged();
    this.player.update(dt);
    // turning does not go through onArrived, so the compass and the minimap arrow would show the old direction until the next step
    if (this.player.facing !== this.hudFacing) {
      this.hudFacing = this.player.facing;
      this.markExplored();
      this.refresh();
    }
    this.interiorView.update(dt);
    this.terrain.animate(dt);
    this.monsters.update(dt, this.player.x, this.player.z);
    this.projectiles.update(dt);
    this.campaignView.tick(dt);
    this.syncMascots();
    this.syncCaravans();
    this.syncHuts();
    this.syncRaft();
    if (this.chunks) {
      this.chunks.update(this.player.tx, this.player.ty);
      this.chunks.tick(5);
    }
    this.updateAtmosphere(dt);

    this.r.camera.position.set(this.player.x, this.player.y, this.player.z);
    this.r.camera.rotation.set((window as unknown as { __pitch?: number }).__pitch ?? 0, this.player.yaw, 0); // __pitch: test hook to look up or down
    this.r.torch.position.set(this.player.x, this.player.y + 0.3, this.player.z);
    this.updateLamps(dt);
    this.r.scene.render();

    if (this.minimapDirty && !this.ui.modalOpen) {
      this.minimapDirty = false;
      this.drawMinimap();
    }
    const focus = this.focusMonster();
    if (focus) {
      const def = monsterById(focus.defId);
      this.ui.setFocus(def.name, focus.hp, def.health);
    } else this.ui.setFocus(null);
  }

  /** Whether the raft is in the scene, so that it is taken out once when the party leaves the water and not asked about every frame. */
  private raftShown = false;

  /**
   * The raft under the party while it stands in deep water (or steps onto it): it follows the camera and turns with it, since the party looks over its
   * deck. The prop renderer takes one instance of the Float model, owned by `raft`; leaving the water or the open country removes it.
   */
  private syncRaft(): void {
    const key = itemModelKey(RAFT_ITEM);
    let show = false;
    if (key && this.mode === "overworld" && this.props.has(key)) {
      const here = this.world.tile(this.player.tx, this.player.ty);
      const next = this.player.entering;
      show = here.ground === GROUND.WATER || (next !== null && this.world.tile(next.x, next.y).ground === GROUND.WATER);
    }
    if (!show) {
      if (this.raftShown) {
        this.props.removeOwner(RAFT_OWNER);
        this.props.flush();
        this.raftShown = false;
      }
      return;
    }
    this.raftShown = true;
    const yaw = this.player.yaw;
    this.props.setInstances(RAFT_OWNER, [{ model: key!, x: this.player.x + Math.sin(yaw) * RAFT_AHEAD, y: RAFT_Y, z: this.player.z + Math.cos(yaw) * RAFT_AHEAD, rotY: yaw, scale: RAFT_SCALE }]);
    this.props.flush();
  }

  private updateAtmosphere(dt: number): void {
    const party = this.state.party;
    const hour = (party.minutes % 1440) / 60;
    const day = hour >= 7 && hour < 18 ? 1 : hour >= 5 && hour < 7 ? (hour - 5) / 2 : hour >= 18 && hour < 20 ? 1 - (hour - 18) / 2 : 0;
    this.lightLevel += (day - this.lightLevel) * Math.min(1, dt * 2);
    const lit = hasEffect(party, "light");
    // the party's own light: a ring of three cells (six with the Light spell). It is all there is underground, and it takes over from the sun at night
    const ring = lit ? TORCH_LIT : TORCH;
    if (this.mode === "interior" && this.interior) {
      const t = this.interior.map.theme;
      const k = 1 - Math.exp(-dt * 3);
      const open = t.open;
      // under the open sky of a town or castle the fog follows the day like the overworld's does (white fog around a black night looks wrong)
      const nightK = open ? NIGHT_FOG + (1 - NIGHT_FOG) * this.lightLevel : 1;
      const target = hex(t.fog.color);
      this.fog = {
        r: this.fog.r + (target.r * nightK - this.fog.r) * k,
        g: this.fog.g + (target.g * nightK - this.fog.g) * k,
        b: this.fog.b + (target.b * nightK - this.fog.b) * k,
        d: this.fog.d + (t.fog.density * (lit ? 0.7 : 1) - this.fog.d) * k,
      };
      this.r.setAtmosphere({
        fogColor: toHex(this.fog),
        fogDensity: this.fog.d,
        fogRange: open ? VIEW_FOG_RANGE[this.viewDistance] : null,
        light: this.lightLevel,
        ambient: t.ambient,
        underground: !open,
        torch: { intensity: ring.intensity * (open ? 1 - this.lightLevel : 1), range: ring.range },
      });
      if (open) this.sky.set("#ffffff", this.lightLevel);
      this.props.setDaylight(open ? this.lightLevel : 0);
      return;
    }
    const tile = this.world.tile(this.player.tx, this.player.ty);
    const theme = OVERWORLD_THEMES[tile.biome === BIOME.OCEAN ? BIOME.MEADOW : tile.biome];
    const k = 1 - Math.exp(-dt * 1.4);
    const target = hex(theme.fog.color);
    const nightK = NIGHT_FOG + (1 - NIGHT_FOG) * this.lightLevel;
    this.fog = {
      r: this.fog.r + (target.r * nightK - this.fog.r) * k,
      g: this.fog.g + (target.g * nightK - this.fog.g) * k,
      b: this.fog.b + (target.b * nightK - this.fog.b) * k,
      d: this.fog.d + (theme.fog.density - this.fog.d) * k,
    };
    this.r.setAtmosphere({
      fogColor: toHex(this.fog),
      fogDensity: this.fog.d,
      fogRange: VIEW_FOG_RANGE[this.viewDistance],
      light: this.lightLevel,
      ambient: "#ffffff",
      underground: false,
      torch: { intensity: ring.intensity * (1 - this.lightLevel), range: ring.range },
    });
    this.sky.set(theme.sky.horizon, this.lightLevel);
    this.props.setDaylight(this.lightLevel);
  }

  /** Campaign objects that give light, with their cells in this map's own grid. */
  private collectLamps(model: CampaignMapModel): LampSource[] {
    const out: LampSource[] = [];
    for (const [x, y, c] of model.entries()) {
      const lamp = c.i === undefined ? undefined : LAMPS[c.i];
      if (!lamp) continue;
      const l = model.toLocal(x, y);
      out.push(lampSource(lamp, cellCenterX(l.x), cellCenterZ(l.y)));
    }
    return out;
  }

  private setLamps(sources: LampSource[], monsters = false): void {
    this.lamps = sources;
    // the lights of the pool only exist for a map that has lamps (switching them changes the shaders once, at the map change); a place under ground
    // has them as well, because a monster that glows (a ghost, a candle creep) may come into it at any time
    this.glowMonsters = monsters;
    this.lampSlots = this.r.lamps.map(() => ({ lamp: null, level: 0 }));
    this.enableLampLights();
  }

  private enableLampLights(): void {
    const on = this.lamps.length > 0 || this.glowMonsters || this.lootLamps.length > 0;
    for (const light of this.r.lamps) light.setEnabled(on);
  }

  /**
   * Hands the pool of lamp lights to the lamps nearest to the party. A light stays with its lamp while the lamp is among the nearest, and the lamps
   * fade in and out over `LAMP_FADE` (32nd playtest, point 2): a lamp that moves out of the nearest few dims where it is, and the next one waits for
   * the free light and then fades in, instead of one popping off and the other on in a single frame. By day outside they add nothing; underground and at night they do.
   */
  private updateLamps(dt: number): void {
    if (this.lamps.length === 0 && !this.glowMonsters && this.lootLamps.length === 0) return;
    const open = this.interior ? this.interior.map.theme.open : true;
    const need = open ? 1 - this.lightLevel : 1;
    const { x, z } = this.player;
    // the monsters that glow carry their light with them: they are lamps that move
    const carried: LampSource[] = this.glowMonsters
      ? this.monsters.glowing(this.glowModels).map((g) => ({ ...MONSTER_GLOW.get(g.defId)!, x: g.x, y: g.y, z: g.z, key: `m:${g.uid}` }))
      : [];
    const near = [...this.lamps, ...this.lootLamps, ...carried]
      .map((lamp) => ({ lamp, d: Math.hypot(lamp.x - x, lamp.z - z) }))
      .filter((e) => e.d < LAMP_REACH)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lampSlots.length);
    const step = Math.min(dt, 0.1) / LAMP_FADE;
    for (const slot of this.lampSlots) {
      if (!slot.lamp) continue;
      const key = slot.lamp.key;
      const e = near.find((n) => n.lamp.key === key);
      if (e) {
        slot.lamp = e.lamp;
        const target = Math.min(1, (LAMP_REACH - e.d) / 4);
        slot.level = slot.level < target ? Math.min(target, slot.level + step) : Math.max(target, slot.level - step);
      } else {
        slot.level -= step;
        if (slot.level <= 0) slot.lamp = null;
      }
    }
    for (const e of near) {
      if (this.lampSlots.some((s) => s.lamp?.key === e.lamp.key)) continue;
      const free = this.lampSlots.find((s) => !s.lamp);
      if (free) {
        free.lamp = e.lamp;
        free.level = 0;
      }
    }
    this.r.lamps.forEach((light, i) => {
      const slot = this.lampSlots[i];
      if (!slot?.lamp || slot.level <= 0) {
        light.intensity = 0;
        return;
      }
      const lamp = slot.lamp;
      light.position.set(lamp.x, lamp.y, lamp.z);
      light.diffuse.set(lamp.color[0], lamp.color[1], lamp.color[2]);
      light.range = lamp.range ?? LAMP_RANGE;
      light.intensity = (lamp.intensity ?? LAMP_INTENSITY) * need * slot.level;
    });
  }

  /** Whether the party is in the dark (underground, or outside at night): what it sees is the ring of its own light. */
  private inTheDark(): boolean {
    if (this.mode === "interior" && this.interior && !this.interior.map.theme.open) return true;
    return this.lightLevel < 0.5;
  }

  /** How far the party sees ahead, in cells: the ring of its light (and a cell beyond) in the dark, far in daylight. */
  private sightRadius(): number {
    if (!this.inTheDark()) return 8;
    return hasEffect(this.state.party, "light") ? 9 : 5;
  }

  // ---------------------------------------------------------------- tools for tests and benchmarks

  /** Teleports the party (overworld coordinates or interior cells). */
  teleport(x: number, y: number, facing: Facing = "N"): void {
    if (this.mode === "title") return;
    const p = this.worldPos(x, y);
    this.player.place(x, y, facing, p.x, p.z);
    if (this.mode === "interior") this.interiorView.focus(x, y);
    if (this.mode === "overworld") {
      this.state.at = { mode: "overworld", x, y, facing };
      this.chunks?.update(x, y);
      this.syncOverworldMonsters();
    } else if (this.interior?.campaign) {
      this.campaignView.focus(x, y);
      const place = this.campaignLocation();
      if (place) this.state.at = place;
    } else if (this.state.at.mode === "interior") this.state.at = { ...this.state.at, x, y, facing };
    this.markExplored();
    this.updateAmbient();
    this.refresh();
  }

  /**
   * Test helper: puts the party next to the first action of a kind (and service) facing it.
   * Returns the action or null. Used by automated play-throughs.
   */
  debugGoto(kind: string, service?: string): ActionInstance | null {
    const rt = this.interior;
    if (!rt) return null;
    const a = rt.content.actions.find((x) => x.kind === kind && (!service || x.params.service === service) && !this.state.opened.has(x.uid));
    if (!a) return null;
    const view = this.gridView();
    const dirs = ["N", "E", "S", "W"] as const;
    for (const d of dirs) {
      const dx = FACING_VEC[d][0];
      const dy = FACING_VEC[d][1];
      const x = a.x - dx;
      const y = a.y - dy;
      if (view.walkable(x, y)) {
        this.teleport(x, y, d);
        return a;
      }
    }
    return null;
  }

  /** Test helper: puts the party `distance` tiles from the first living monster (with free ground in between), facing it. */
  debugGotoMonster(distance = 2): MonsterInstance | null {
    const view = this.gridView();
    for (const m of this.enc.monsters) {
      if (m.hp <= 0) continue;
      for (const d of ["N", "E", "S", "W"] as const) {
        const [dx, dy] = FACING_VEC[d];
        let free = true;
        for (let k = 1; k <= distance; k++) free = free && view.walkable(m.x - dx * k, m.y - dy * k);
        if (free) {
          this.teleport(m.x - dx * distance, m.y - dy * distance, d);
          return m;
        }
      }
    }
    return null;
  }

  /** Test helper: opens a campaign map (starting a campaign game first when none is running). */
  async debugCampaign(slug: string, x?: number, y?: number, rotation = 0): Promise<void> {
    if (!this.state?.campaign) await this.newCampaign(this.state?.seed ?? "campaign");
    await this.openCampaignMap(slug, x === undefined || y === undefined ? undefined : { x, y, rotation });
  }

  /** Test helper: puts the party next to the n-th action with a legacy id, facing it (or on it when it fires on entering). */
  debugCampaignGoto(id: number, nth = 0): { x: number; y: number } | null {
    const rt = this.interior;
    if (!rt?.campaign) return null;
    const hits = rt.content.actions.filter((a) => a.legacy?.id === id);
    const a = hits[nth];
    if (!a) return null;
    const view = this.gridView();
    for (const d of ["N", "E", "S", "W"] as const) {
      const [dx, dy] = FACING_VEC[d];
      const x = a.x - dx;
      const y = a.y - dy;
      if (view.walkable(x, y) || (x === this.player.tx && y === this.player.ty)) {
        this.teleport(x, y, d);
        return { x: a.legacy!.ex, y: a.legacy!.ey };
      }
    }
    return null;
  }

  /** Test helper: the campaign model of the current map (editor coordinates). */
  get campaignModel(): CampaignMapModel | null {
    return this.interior?.campaign?.model ?? null;
  }

  async enterPoiById(id: string): Promise<boolean> {
    const poi = this.world.poiById(id);
    if (!poi) return false;
    await this.openInterior(poi);
    return true;
  }

  async leave(): Promise<void> {
    await this.exitInterior();
  }

  stats() {
    return {
      fps: this.fpsSmooth,
      frameMs: this.sceneInst.frameTimeCounter.current,
      drawCalls: this.sceneInst.drawCallsCounter.current,
      activeMeshes: this.r.scene.getActiveMeshes().length,
      triangles: this.r.scene.getActiveIndices() / 3,
      chunks: this.chunks?.stats.loaded ?? 0,
      maxChunkBuildMs: this.chunks?.stats.maxBuildMs ?? 0,
      instances: this.props.instanceCount(),
      monsters: this.monsters.count(),
      frameTimes: this.frameTimes.slice(),
    };
  }

  get internals() {
    return { r: this.r, player: this.player, props: this.props, enc: this.enc, interior: this.interior, ui: this.ui, chunks: this.chunks, monsters: this.monsters, projectiles: this.projectiles };
  }
}

/** True when a character has enough experience for the next level (XP is capped at what the level needs). */
function xpReady(c: Character): boolean {
  return c.xp > 0 && xpToNextLevel(c) === 0;
}

function stepSound(t: TileInfo): number {
  if (t.biome === BIOME.SNOW) return 9053;
  if (t.biome === BIOME.SWAMP) return 9054;
  return 9010;
}

function hex(c: string): { r: number; g: number; b: number } {
  const n = parseInt(c.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function toHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
