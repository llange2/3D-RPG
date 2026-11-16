import { colorHex, type CrystalResult, type PlacedCrystal, type WallNode } from "../actions/crystals";
import type { ActionInstance } from "../actions/types";
import { DARK_CRYSTAL, faint } from "../render/crystalLook";
import type { CrystalScene } from "../render/interiorView";
import type { Facing, LightLine } from "../interiors/types";

/**
 * What the game remembers and draws of quest_8, the crystal paths (quest document 1.10). The crystals the party has set down are strings in the save's `opened` set (`crystal:<map>@x,y#seq`),
 * so the save format stays as it is; `seq` counts them in the order they were set down (the older line wins where two cross, `simulateCrystals`). No DOM and no Babylon: the pieces
 * `Game` plugs together.
 */

const PREFIX = "crystal:";

export const crystalFlag = (mapKey: string, x: number, y: number, seq: number): string => `${PREFIX}${mapKey}@${x},${y}#${seq}`;

const parse = (flag: string): { map: string; x: number; y: number; seq: number } | null => {
  if (!flag.startsWith(PREFIX)) return null;
  const at = flag.lastIndexOf("@");
  const hash = flag.lastIndexOf("#");
  if (at < 0 || hash < at) return null;
  const [x, y] = flag.slice(at + 1, hash).split(",").map(Number) as [number, number];
  return { map: flag.slice(PREFIX.length, at), x, y, seq: Number(flag.slice(hash + 1)) };
};

/** The crystals set down in a place. */
export function crystalsIn(opened: ReadonlySet<string>, mapKey: string): PlacedCrystal[] {
  const out: PlacedCrystal[] = [];
  for (const f of opened) {
    if (!f.startsWith(PREFIX)) continue;
    const p = parse(f);
    if (p && p.map === mapKey) out.push({ x: p.x, y: p.y, seq: p.seq });
  }
  return out.sort((a, b) => a.seq - b.seq);
}

/** The number the next crystal gets: above every one set down in any place, so the order never repeats. */
export function nextCrystalSeq(opened: ReadonlySet<string>): number {
  let top = 0;
  for (const f of opened) {
    const p = f.startsWith(PREFIX) ? parse(f) : null;
    if (p && p.seq > top) top = p.seq;
  }
  return top + 1;
}

/** The wall crystals of a place, read from its actions. */
export function wallNodesOf(actions: readonly ActionInstance[]): WallNode[] {
  return actions
    .filter((a) => a.kind === "crystal")
    .map((a) => ({ uid: a.uid, x: a.x, y: a.y, dir: (a.params.facing as Facing | undefined) ?? "N", role: a.params.role === "target" ? ("target" as const) : ("source" as const), color: Number(a.params.color) }));
}

/** What the view draws for the light of a place. A target waits in a faint shade of the colour it wants and shines in it once it has it; a dark crystal is the plain white one. */
export function sceneOf(nodes: readonly WallNode[], placed: readonly PlacedCrystal[], result: CrystalResult): CrystalScene {
  const walls = nodes.map((n) => {
    const own = colorHex(n.color);
    const got = n.role === "target" ? result.targets.get(n.uid) === n.color : true;
    return { x: n.x, y: n.y, dir: n.dir, color: got ? own : faint(own) };
  });
  const stands = placed.map((c) => {
    const mask = result.crystals.get(`${c.x},${c.y}`) ?? 0;
    return { x: c.x, y: c.y, color: mask === 0 ? DARK_CRYSTAL : colorHex(mask) };
  });
  const lines: LightLine[] = result.links.map((l) => ({ color: colorHex(l.color), points: [l.from, l.to] }));
  return { walls, stands, lines };
}
