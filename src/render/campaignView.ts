import { BLOCK_OPEN_DOOR, BLOCK_PIT, BLOCKS } from "../campaign/blocks";
import type { MapContent } from "../actions/types";
import type { CampaignMapModel } from "../campaign/model";
import type { GateDirection, TrapKind } from "../campaign/types";
import type { InteriorMap } from "../interiors/types";
import { mascotSpotItem } from "../data/mascots";
import { PERSONAS, personaModelId, personaYaw } from "../data/personas";
import type { StaticModelInfo } from "./assets";
import { cellCenterX, cellCenterZ } from "./interiorMesher";
import type { InteriorView } from "./interiorView";
import { GUILLOTINE_ITEM, SPEAR_MODEL, TRAP_MOTION, gateTravel, itemModelKey, itemProp, trapMover, trapSeconds } from "./itemProps";
import type { MonsterRenderer } from "./monsters";
import type { PropRenderer } from "./props";
import { hash2 } from "../core/noise";
import { FLAT_SLAB_SINK, GROUND_FILL, groundModel, hasOwnSlab, slabLift, type PropInstance } from "./terrainMesher";

/**
 * The ground tile that a tree, palm or mountain cell stands on, by the cell's floor texture (the cells of the same biome next to it are
 * made of it). Lava and bare rock have no ground tile.
 */
const GROUND_UNDER: Record<string, string> = { "terrain/meadow": "gnd_grass", "terrain/forest": "gnd_grass", "terrain/snow": "gnd_snow", "terrain/swamp": "gnd_swamp", "terrain/desert": "gnd_desert" };
/** Ground tiles that are square already and stay at the old game's size. */
const UNGROWN_GROUND = new Set(["gnd_dirt", "gnd_cobble"]);

/** Cells around the party whose props are drawn on big open maps. */
const WINDOW = 26;
/** The cave's wall models are a thousand triangles each: only those within this many cells of the party are drawn. */
const CAVE_WINDOW = 13;

interface Trap {
  kind: TrapKind;
  cx: number;
  cy: number;
  rotation: number;
  t: number;
}

/** A metal gate on its way out of the cell. */
interface Gate {
  item: number;
  cx: number;
  cy: number;
  rotation: number;
  /** Heights of the model's origin at the start and at the end. */
  from: number;
  to: number;
  seconds: number;
  t: number;
}

interface Placed {
  inst: PropInstance;
  cx: number;
  cy: number;
  item?: number;
}

/** A person of the map (campaign items 48 to 60 and others): an animated actor, not a prop. */
interface Npc {
  uid: string;
  item: number;
  cx: number;
  cy: number;
  x: number;
  z: number;
  /** Degrees (Babylon). */
  yaw: number;
}

/** People within this many cells of the party are alive on the map; the rest are taken out (the animated models cost per frame). */
const NPC_NEAR = 16;

/**
 * Draws a campaign map: the cell grid goes through the interior view (floors, walls, ceilings with per-cell textures),
 * the map items (chests, statues, gates, signs) and tile models (mountains, forests) are prop instances.
 */
export class CampaignView {
  private readonly owner = "campaign";
  /** Owner of the moving parts of traps: they are redrawn every frame, so they must not share a buffer with the thousands of still props. */
  private readonly fxOwner = "campaign-fx";
  private model: CampaignMapModel | null = null;
  private all: Placed[] = [];
  private windowed = false;
  private focusAt: { x: number; y: number } | null = null;
  private traps: Trap[] = [];
  private gates: Gate[] = [];
  private npcs: Npc[] = [];
  /** The cell the people were last placed around (null: all of them). */
  private npcFocus: { x: number; y: number } | null = null;

  constructor(
    private readonly interior: InteriorView,
    private readonly props: PropRenderer,
    private readonly staticInfo: Record<string, StaticModelInfo>,
    private readonly monsters: MonsterRenderer,
  ) {}

  /** Model keys the map needs, so they can be loaded before the first frame. */
  static modelKeys(model: CampaignMapModel): string[] {
    const keys = new Set<string>();
    for (const [, , c] of model.entries()) {
      if (c.i !== undefined) {
        const k = itemModelKey(c.i);
        if (k) keys.add(k);
      }
      const block = c.b === undefined ? undefined : BLOCKS[c.b];
      if (block?.style.model) keys.add(groundModel(block.style.model.key));
      const under = block?.style.model && hasOwnSlab(block.style.model.key) ? GROUND_UNDER[block.style.floor ?? ""] : undefined;
      if (under) keys.add(groundModel(under));
      // blocks that appear through actions later: the open door, what a broken wall leaves, the pit
      const later = c.a === 14 ? BLOCK_OPEN_DOOR : c.a === 23 ? BLOCK_PIT : c.a === 8 ? Number(c.ax?.replacement_block) : undefined;
      const laterKey = later === undefined ? undefined : BLOCKS[later]?.style.model?.key;
      if (laterKey) keys.add(laterKey);
    }
    // the 3D floor of the dungeon cells
    keys.add("blk_floor");
    // gates, doors and levers appear through actions later
    for (const id of [80, 81, 87, 39, 63, 128]) {
      const k = itemModelKey(id);
      if (k) keys.add(k);
    }
    // the spears of a spring trap are not a map item: they come out of the floor when the action fires
    if (model.entries().some(([, , c]) => c.a === 17)) keys.add(SPEAR_MODEL);
    return [...keys];
  }

  /**
   * Flat ground (graphics mode "flat"): the ground tile models (`gnd_*`: lumps of bushes and stones, the cobble) stay out, the painted tiles
   * of the interior view lie under the party instead. Takes effect at once on the map that is shown.
   */
  setFlatGround(on: boolean): void {
    if (this.flatGround === on) return;
    this.flatGround = on;
    if (!this.model || !this.map) return;
    this.all = this.collect(this.model);
    this.push();
  }

  private flatGround = false;
  private map: InteriorMap | null = null;

  /** Shows a map. The caller has loaded the models (`CampaignView.modelKeys`) and built `map` and `content` from the model. */
  show(model: CampaignMapModel, map: InteriorMap, content: MapContent): void {
    this.model = model;
    this.map = map;
    this.stopTraps();
    this.all = this.collect(model);
    // big open maps draw only what is near: thin instances are not culled one by one
    this.windowed = (map.theme.open || map.kind === "cave") && this.all.length > 600;
    this.baseWindow = map.kind === "cave" ? CAVE_WINDOW : WINDOW;
    this.windowRadius = Math.max(6, Math.round(this.baseWindow * this.viewShare));
    this.focusAt = null;
    this.npcFocus = null;
    this.interior.show(map, content, new Set(), new Set());
    this.push();
    this.syncNpcs();
  }

  /** The model changed (a wall broke, a gate opened, a chest moved): rebuild mesh and props. */
  update(map: InteriorMap): void {
    if (!this.model) return;
    this.map = map;
    this.all = this.collect(this.model);
    this.interior.refresh(map);
    this.push();
    this.syncNpcs();
  }

  /** The party moved: on big open maps, the props around it are swapped in once it has walked a few cells; the people near it come to life. */
  focus(cx: number, cy: number): void {
    if (!this.model) return;
    if (!this.npcFocus || Math.max(Math.abs(cx - this.npcFocus.x), Math.abs(cy - this.npcFocus.y)) >= 4) {
      this.npcFocus = { x: cx, y: cy };
      this.syncNpcs();
    }
    if (!this.windowed) return;
    if (this.focusAt && Math.max(Math.abs(cx - this.focusAt.x), Math.abs(cy - this.focusAt.y)) < 4) return;
    this.focusAt = { x: cx, y: cy };
    this.push();
  }

  /** Brings the people near the party (`NPC_NEAR` cells, or all of them before the first step) to life and removes the far ones. */
  private syncNpcs(): void {
    const at = this.npcFocus;
    for (const n of this.npcs) {
      const near = !at || Math.max(Math.abs(n.cx - at.x), Math.abs(n.cy - at.y)) <= NPC_NEAR;
      const alive = this.monsters.has(n.uid);
      if (near && !alive) void this.monsters.add(n.uid, personaModelId(n.item), n.x, 0, n.z, { yaw: n.yaw, idle: PERSONAS[n.item]!.idle });
      else if (!near && alive) this.monsters.remove(n.uid);
    }
  }

  /**
   * A trap went off on this cell: the blade falls and is hauled back up, or the spears shoot out of the floor and sink again
   * (the old game's trap animations). The blade that hangs in a guillotine is hidden meanwhile and a copy takes its place;
   * `tick` drives it.
   */
  playTrap(kind: TrapKind, cx: number, cy: number, rotationDeg: number): void {
    this.traps = this.traps.filter((t) => t.cx !== cx || t.cy !== cy);
    this.traps.push({ kind, cx, cy, rotation: rotationDeg, t: 0 });
    this.push();
    this.tick(0);
  }

  /**
   * A gate opens on this cell. The old game slid a copy of the gate model to three times its height, below the floor for the
   * gate that drops and into the ceiling for the one that rises, at 0.8 seconds per started unit of travel, and then removed it.
   */
  playGate(item: number, cx: number, cy: number, rotationDeg: number, direction: GateDirection): void {
    const travel = gateTravel(item, direction);
    if (!travel) return;
    this.gates.push({ item, cx, cy, rotation: rotationDeg, ...travel, t: 0 });
    this.tick(0);
  }

  /** Has the trap on this cell only just been sprung (so that its animation is the one that belongs to the current step)? */
  trapJustSprung(cx: number, cy: number): boolean {
    return this.traps.some((t) => t.cx === cx && t.cy === cy && t.t < 2 * TRAP_MOTION[t.kind].strike);
  }

  /** Moves the traps on by `dt` seconds. */
  tick(dt: number): void {
    if (this.traps.length === 0 && this.gates.length === 0) return;
    for (const t of this.traps) t.t += dt;
    for (const g of this.gates) g.t += dt;
    const before = this.traps.length;
    this.traps = this.traps.filter((t) => t.t < trapSeconds(t.kind));
    this.gates = this.gates.filter((g) => g.t < g.seconds);
    const moving: PropInstance[] = [];
    for (const g of this.gates) {
      const inst = this.placeItem(g.item, g.rotation, cellCenterX(g.cx), cellCenterZ(g.cy), g.from + ((g.to - g.from) * g.t) / g.seconds);
      if (inst) moving.push(inst);
    }
    for (const t of this.traps) {
      const inst = trapMover(t.kind, t.t, t.rotation, cellCenterX(t.cx), cellCenterZ(t.cy), this.staticInfo);
      if (inst) moving.push(inst);
    }
    this.props.setInstances(this.fxOwner, moving);
    this.props.flush();
    // a guillotine that arrived at the top is the hanging one again
    if (this.traps.length !== before) this.push();
  }

  private stopTraps(): void {
    this.traps = [];
    this.gates = [];
    this.props.removeOwner(this.fxOwner);
  }

  private push(): void {
    let list = this.windowed && this.focusAt ? this.all.filter((p) => Math.max(Math.abs(p.cx - this.focusAt!.x), Math.abs(p.cy - this.focusAt!.y)) <= this.windowRadius) : this.all;
    if (this.traps.length > 0) list = list.filter((p) => p.item !== GUILLOTINE_ITEM || !this.traps.some((t) => t.kind === "guillotine" && t.cx === p.cx && t.cy === p.cy));
    this.props.setInstances(
      this.owner,
      list.map((p) => p.inst),
    );
    this.props.flush();
  }

  /**
   * A map item as a prop, or null when it has no model. `originY` replaces the height the old game gave the item (the blade
   * of a trap moves, everything else stays where its table row put it).
   */
  private placeItem(item: number, rotationDeg: number, px: number, pz: number, originY?: number): PropInstance | null {
    return itemProp(item, rotationDeg, px, pz, this.staticInfo, originY);
  }

  /** Is one of the eight cells around this one not a wall (floor, water, ground a model stands on)? */
  private touchesOpen(model: CampaignMapModel, x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = model.get(x + dx, y + dy)?.b;
        if (b !== undefined && BLOCKS[b] && BLOCKS[b]!.cls !== "wall") return true;
      }
    }
    return false;
  }

  private collect(model: CampaignMapModel): Placed[] {
    const out: Placed[] = [];
    const before = this.npcs;
    this.npcs = [];
    for (const [x, y, c] of model.entries()) {
      const block = c.b === undefined ? undefined : BLOCKS[c.b];
      if (!block) continue; // items on cells without a block are the editor's hidden staging area
      const local = model.toLocal(x, y);
      const px = cellCenterX(local.x);
      const pz = cellCenterZ(local.y);
      const tile = block.style.model;
      // a wall piece of the cave hides inside the rock unless open ground is next to it
      const hidden = block.cls === "wall" && !this.touchesOpen(model, x, y);
      if (tile && !hidden && !(this.flatGround && tile.key.startsWith("gnd_"))) {
        // `y` is where the old game put the model's origin (the pit hangs below its floor); the prop renderer rests the lowest point on the height it is given
        const bottom = this.staticInfo[tile.key]?.bounds[1] ?? 0;
        const lift = (tile.y === undefined ? 0 : tile.y + bottom * (tile.scaleXYZ?.[1] ?? tile.scale)) + (this.flatGround && hasOwnSlab(tile.key) ? FLAT_SLAB_SINK : 0);
        // the reduced ground tiles are drawn larger and a hair apart in height, as on the overworld (see `GROUND_FILL`)
        const grows = tile.key.startsWith("gnd_") && !UNGROWN_GROUND.has(tile.key) && groundModel(tile.key) === tile.key;
        const k = grows ? GROUND_FILL : 1;
        out.push({
          cx: local.x,
          cy: local.y,
          inst: {
            model: groundModel(tile.key),
            x: px,
            y: lift + (grows ? slabLift(hash2(0x6a0e, x, y) >>> 0) : 0),
            z: pz,
            rotY: ((((c.br ?? 0) + (tile.yaw ?? 0)) % 360) * Math.PI) / 180,
            scale: tile.scale * k,
            scaleXYZ: tile.scaleXYZ && [tile.scaleXYZ[0] * k, tile.scaleXYZ[1], tile.scaleXYZ[2] * k],
          },
        });
        // trees, palms and mountains stand on the ground of their neighbours, so no dark floor shows around them (the same as the overworld's)
        const under = !this.flatGround && hasOwnSlab(tile.key) ? GROUND_UNDER[block.style.floor ?? ""] : undefined;
        if (under) {
          const gk = groundModel(under);
          const full = gk !== under;
          out.push({
            cx: local.x,
            cy: local.y,
            inst: { model: gk, x: px, y: slabLift(hash2(0x6a0e, x, y) >>> 0), z: pz, rotY: ((hash2(0x6a0d, x, y) >>> 10) % 4) * (Math.PI / 2), scale: 1.7 * (full ? 1 : GROUND_FILL), scaleXYZ: [1.7 * (full ? 1 : GROUND_FILL), 1, 1.7 * (full ? 1 : GROUND_FILL)] },
          });
        }
      }
      if (c.i === undefined) continue;
      // a mascot's place shows its mascot only while the party does not have it (the Crow leaves a perch, the Fairy a mushroom)
      const shown = mascotSpotItem(c.i, this.mascot);
      if (shown === 0) continue;
      // a person is an animated actor where the model set has one (the static model of the old game's fallback otherwise)
      if (PERSONAS[c.i] && this.monsters.knows(personaModelId(c.i))) {
        this.npcs.push({ uid: `npc:${model.slug}:${x},${y}`, item: c.i, cx: local.x, cy: local.y, x: px, z: pz, yaw: personaYaw(c.i, c.ir ?? 0) });
        continue;
      }
      const inst = this.placeItem(shown, c.ir ?? 0, px, pz);
      if (inst) out.push({ cx: local.x, cy: local.y, inst, item: c.i });
    }
    // people that left the map (an action took them away) go with it
    for (const n of before) if (!this.npcs.some((m) => m.uid === n.uid)) this.monsters.remove(n.uid);
    return out;
  }

  private windowRadius = WINDOW;
  private baseWindow = WINDOW;
  private viewShare = 1;

  /** The view distance's share of the window of props around the party on big open maps. */
  setViewShare(share: number): void {
    this.viewShare = share;
    this.windowRadius = Math.max(6, Math.round(this.baseWindow * share));
    this.interior.setViewShare(share);
    if (this.model && this.windowed) this.push();
  }

  /** The party's mascot: set before `show` and `update`, which draw the mascots' places accordingly. */
  mascot = "Crow";

  dispose(): void {
    this.stopTraps();
    for (const n of this.npcs) this.monsters.remove(n.uid);
    this.npcs = [];
    this.props.removeOwner(this.owner);
    this.props.flush();
    this.model = null;
  }
}
