/** Action vocabulary. Pure data, no DOM, no Babylon. */

export type ActionKind = "treasure" | "door" | "trap" | "lore" | "transfer" | "service" | "ambush" | "shrine" | "fountain" | "breakable_wall" | "decor" | "riddle" | "gong" | "lever" | "head" | "teleporter" | "talent" | "portal" | "work" | "legacy";

export type ParamValue = number | string | boolean;

export interface ActionInstance {
  /** `<mapKey>#<ruleId>:<n>`. Stable, deterministic, key of save deltas. */
  uid: string;
  kind: ActionKind;
  x: number;
  y: number;
  params: Record<string, ParamValue>;
  /** Links to other actions by uid (replaces the absolute x/y strings of the old game). */
  refs?: Record<string, string>;
  /** Campaign maps: the action as the old editor stored it, resolved by src/campaign/engine.ts. */
  legacy?: LegacyPayload;
}

export interface LegacyPayload {
  /** Old action id (see action_handler.py). */
  id: number;
  /** First action parameter (shop tier and the like). */
  ap: number | string | null;
  /** The editor's additional parameters, mostly strings. */
  ax: Record<string, unknown>;
  /** Cell in the editor's absolute coordinates. */
  ex: number;
  ey: number;
}

export interface SpawnPoint {
  uid: string;
  x: number;
  y: number;
  /** MONSTER_DATA ids of the group. */
  monsterIds: number[];
  boss: boolean;
}

export interface MapContent {
  mapKey: string;
  tier: number;
  actions: ActionInstance[];
  spawns: SpawnPoint[];
}

export type AnchorKind =
  | "exit"
  | "mouth"
  | "deadEnd"
  | "roomCenter"
  | "roomEdge"
  | "corridor"
  | "bossRoom"
  | "bossRoomEdge"
  | "lot"
  | "plaza"
  | "plazaCorner"
  | "wallBetween"
  | "street"
  | "talentSite"
  | "portalSite"
  | "workSite"
  | "chestSite"
  | "looseSite"
  | "cageSite"
  | "guardSite"
  | "decorSite"
  | "fountainSite"
  | "vaultGate"
  | "vaultDoor"
  | "vaultWall"
  | "vaultChest"
  | "vaultGuard"
  | "beforeTreasure";

export interface Anchor {
  x: number;
  y: number;
  depth: number;
  roomId: number;
  /** Direction hint: for mouths and doors the direction of travel through the cell, for lots the door facing. */
  facing?: "N" | "E" | "S" | "W";
  lotId?: number;
  /** Params the cell brings along (a town's ground plan says which talent a person sells and which object a chest is). */
  params?: Record<string, ParamValue>;
}

export interface RuleCount {
  perMap?: [number, number];
  /** Probability in permille per candidate anchor. */
  chance?: number;
}

export interface RuleWhen {
  /** Anchor depth as a fraction of the maximum depth (0..1000 permille). */
  minDepth?: number;
  maxDepth?: number;
  minTier?: number;
  maxTier?: number;
  minRoomSize?: number;
  excludeEntranceRoom?: boolean;
  /** Only in places of this dungeon class (`data/dungeon-themes.ts`). A rule with `theme` runs only in a themed cave or dungeon. */
  klass?: "A" | "B" | "C";
  theme?: boolean;
  /** Only in castles of these kinds (`data/castles.ts`). */
  alignment?: ("good" | "neutral" | "evil")[];
}

export interface Rule {
  id: string;
  kind: ActionKind | "spawn";
  anchor: AnchorKind;
  when?: RuleWhen;
  count: RuleCount;
  /** Values starting with `=` are expressions over tier, depth, rand(a,b), min, max. */
  params?: Record<string, ParamValue>;
  variants?: { weight: number; params: Record<string, ParamValue> }[];
  /** Town services: the rule hands these out to the building lots. */
  assign?: string[];
}

export interface RuleSet {
  /** Added to the POI tier when computing the map tier. */
  tierBonus: number;
  rules: Rule[];
}
