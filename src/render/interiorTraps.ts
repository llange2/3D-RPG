import { isLastingTrap, trapElementOf, type TrapElement } from "../actions/registry";
import type { ActionInstance, MapContent } from "../actions/types";
import { BLOCK_PIT, BLOCKS } from "../campaign/blocks";
import type { TrapKind } from "../campaign/types";
import { hash2 } from "../core/noise";
import { CELL, type InteriorMap } from "../interiors/types";
import type { StaticModelInfo } from "./assets";
import { cellCenterX, cellCenterZ } from "./interiorMesher";
import { floatY, GUILLOTINE_ITEM, ITEM_MODELS, itemModelKey, itemProp, trapMover, trapSeconds, TRAP_MOTION } from "./itemProps";
import type { PropRenderer } from "./props";
import type { PropInstance } from "./terrainMesher";

const RAD = Math.PI / 180;

/** Which moving part a generated trap has: the spring trap is the old game's spear trap, the guillotine its blade. The rest (generic, steal gold) has none. */
export function trapKindOf(a: ActionInstance): TrapKind | null {
  if (a.kind !== "trap") return null;
  return a.params.trap === "spring" ? "spear" : a.params.trap === "guillotine" ? "guillotine" : null;
}

/**
 * The old items that mark an elemental trap: the old maps lay the lava puddle (120) on their fire traps, the acid puddle (92) on
 * the acid trap and the magic flames (121) on the magic traps (action 30 cells, all of `blistering-heights-cavern`, `baywatch-cavern`
 * and `swamp-town-cavern`). The old maps have no ice trap, so ice gets the blue crystals (117), which stand beside the path because
 * they are a tall obstacle there.
 */
export const TRAP_OBJECT: Record<TrapElement, number> = { fire: 120, acid: 92, magic: 121, ice: 117 };

/** The element of a generated generic trap, or null for every other action. */
export const elementOf = (a: ActionInstance): TrapElement | null => (a.kind === "trap" && a.params.trap === "generic" ? trapElementOf(a) : null);

/** Does this trap have something to see (a blade, spears, a pit, a puddle or flames)? */
export const hasTrapModel = (a: ActionInstance): boolean => trapKindOf(a) !== null || isLastingTrap(a) || elementOf(a) !== null;

/** Static model keys the elemental traps of a map need, so that they can be loaded before the first frame. */
export function trapModelKeys(content: MapContent): string[] {
  const keys = new Set<string>();
  for (const a of content.actions) {
    const element = elementOf(a);
    const key = element ? itemModelKey(TRAP_OBJECT[element]) : null;
    if (key) keys.add(key);
  }
  return [...keys];
}

/** Scale of the crystals that mark an ice trap: the whole cluster is two cells high in the old game. */
const CRYSTAL_SCALE = 0.55;
/** How far from the middle of the cell the crystals stand: against the wall of the corridor, clear of the path. */
const CRYSTAL_OFFSET = 1;

/**
 * The object of an elemental trap, placed like the old game's item table places it (lifted so that its lowest point is where the
 * table puts it). Puddles and flames lie in the middle of the cell at any angle; ice crystals stand to one side.
 */
export function elementalProp(element: TrapElement, cx: number, cy: number, rotation: number, staticInfo: Record<string, StaticModelInfo>): PropInstance | null {
  const item = TRAP_OBJECT[element];
  const key = itemModelKey(item);
  const model = ITEM_MODELS[String(item)];
  if (!key || !model) return null;
  const h = hash2(0x61, cx, cy) >>> 0;
  const angle = (h % 360) * RAD;
  const k = element === "ice" ? CRYSTAL_SCALE : 1;
  // a cell's side across the corridor: east or west in a corridor that runs north to south (rotation 0), north or south otherwise
  const side = ((h >>> 9) & 1 ? 1 : -1) * (element === "ice" ? CRYSTAL_OFFSET : 0);
  const x = cellCenterX(cx) + (rotation === 0 ? side : 0);
  const z = cellCenterZ(cy) + (rotation === 0 ? 0 : side);
  const bounds = staticInfo[key]?.bounds;
  const lift = model.y * k + (bounds ? bounds[1] * model.scale3[1] * k : 0);
  return { model: key, x, y: lift, z, rotY: angle, scale: model.scale * k, scaleXYZ: [model.scale3[0] * k, model.scale3[1] * k, model.scale3[2] * k] };
}

/**
 * Rotation of a blade or spear board in degrees. The old maps turn it with the corridor: 0 where the party walks north to south,
 * 90 where it walks east to west (all 40 guillotine and spear traps of the 35 maps), so the trap always spans the corridor.
 */
export function trapRotationAt(map: InteriorMap, x: number, y: number): number {
  const open = (dx: number, dy: number) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && map.cells[ny * map.width + nx] === CELL.FLOOR;
  };
  return (open(1, 0) || open(-1, 0)) && !open(0, -1) && !open(0, 1) ? 90 : 0;
}

interface Trap {
  uid: string;
  /** The moving part (blade or spears), or null. */
  mover: TrapKind | null;
  /** Elemental traps: the element, whose object lies on the cell. */
  element: TrapElement | null;
  cx: number;
  cy: number;
  rotation: number;
  /** Seconds since it went off, or null while at rest. */
  t: number | null;
  /** Pit only: it went off and is open. */
  open: boolean;
}

/**
 * The visible traps of a generated interior, drawn the way the hand-built maps do: a guillotine hangs in the ceiling and drops
 * when it goes off, spears shoot out of the floor, and a pit that went off stays open as a hole with spikes. The still parts
 * (hanging blades, open pits) share one owner, the moving parts another that is redrawn every frame.
 */
export class InteriorTraps {
  private readonly traps = new Map<string, Trap>();
  private owner = "";
  private width = 0;
  /** The flames of magic traps float on the spot like static monsters; they have an owner of their own, redrawn every frame. */
  private flames: PropInstance[] = [];
  private clock = 0;

  constructor(
    private readonly props: PropRenderer,
    private readonly staticInfo: Record<string, StaticModelInfo>,
  ) {}

  show(map: InteriorMap, content: MapContent, opened: ReadonlySet<string>, owner: string): void {
    this.dispose();
    this.owner = owner;
    this.width = map.width;
    for (const a of content.actions) {
      if (!hasTrapModel(a)) continue;
      this.traps.set(a.uid, { uid: a.uid, mover: trapKindOf(a), element: elementOf(a), cx: a.x, cy: a.y, rotation: trapRotationAt(map, a.x, a.y), t: null, open: isLastingTrap(a) && opened.has(a.uid) });
    }
    this.pushStill();
  }

  /** Grid indices of the open pits: the floor mesh leaves them out, the pit model is their floor. */
  holes(): Set<number> {
    const out = new Set<number>();
    for (const t of this.traps.values()) if (t.open) out.add(t.cy * this.width + t.cx);
    return out;
  }

  /** A pit went off. Returns true when it was closed before, so the floor must be cut open. */
  openPit(uid: string): boolean {
    const t = this.traps.get(uid);
    if (!t || t.mover || t.element || t.open) return false;
    t.open = true;
    this.pushStill();
    return true;
  }

  /** The blade falls or the spears shoot up (the old game's animation); the hanging blade makes way for its copy. */
  play(uid: string): void {
    const t = this.traps.get(uid);
    if (!t?.mover) return;
    t.t = 0;
    this.pushStill();
    this.update(0);
  }

  /** Has this trap only just gone off, so that the animation on screen is the one that belongs to the current step? */
  justSprung(uid: string): boolean {
    const t = this.traps.get(uid);
    return !!t?.mover && t.t !== null && t.t < 2 * TRAP_MOTION[t.mover].strike;
  }

  update(dt: number): void {
    if (this.flames.length > 0) {
      this.clock += dt;
      this.pushFlames();
      this.props.flush();
    }
    let moving = false;
    let ended = false;
    for (const t of this.traps.values()) {
      if (t.t === null || !t.mover) continue;
      t.t += dt;
      if (t.t >= trapSeconds(t.mover)) {
        t.t = null;
        ended = true;
      } else moving = true;
    }
    if (!moving && !ended) return;
    const list: PropInstance[] = [];
    for (const t of this.traps.values()) {
      if (t.t === null || !t.mover) continue;
      const inst = trapMover(t.mover, t.t, t.rotation, cellCenterX(t.cx), cellCenterZ(t.cy), this.staticInfo);
      if (inst) list.push(inst);
    }
    this.props.setInstances(`${this.owner}:traps-fx`, list);
    this.props.flush();
    // a blade that is back up hangs in the ceiling again
    if (ended) this.pushStill();
  }

  dispose(): void {
    if (this.owner) {
      this.props.removeOwner(`${this.owner}:traps`);
      this.props.removeOwner(`${this.owner}:traps-fx`);
      this.props.removeOwner(`${this.owner}:traps-float`);
      this.props.flush();
    }
    this.traps.clear();
    this.flames = [];
    this.owner = "";
  }

  private pushFlames(): void {
    this.props.setInstances(`${this.owner}:traps-float`, this.flames.map((p) => ({ ...p, y: p.y + floatY(this.clock, p.x * 7 + p.z * 13) })));
  }

  private pushStill(): void {
    const list: PropInstance[] = [];
    this.flames = [];
    const pit = BLOCKS[BLOCK_PIT]!.style.model!;
    for (const t of this.traps.values()) {
      const x = cellCenterX(t.cx);
      const z = cellCenterZ(t.cy);
      if (t.mover === "guillotine") {
        if (t.t !== null) continue;
        const blade = itemProp(GUILLOTINE_ITEM, t.rotation, x, z, this.staticInfo);
        if (blade) list.push(blade);
      } else if (t.element) {
        const object = elementalProp(t.element, t.cx, t.cy, t.rotation, this.staticInfo);
        if (object) (t.element === "magic" ? this.flames : list).push(object);
      } else if (!t.mover && t.open) {
        // the pit hangs below its floor: `y` is where the old game put the model's origin, the renderer rests the lowest point on the height it is given
        const bottom = this.staticInfo[pit.key]?.bounds[1] ?? 0;
        list.push({ model: pit.key, x, y: (pit.y ?? 0) + bottom * (pit.scaleXYZ?.[1] ?? pit.scale), z, rotY: 0, scale: pit.scale, scaleXYZ: pit.scaleXYZ });
      }
    }
    this.props.setInstances(`${this.owner}:traps`, list);
    this.pushFlames();
    this.props.flush();
  }
}
