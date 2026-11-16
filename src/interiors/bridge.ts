import { CELL } from "./types";

/**
 * The bridge of the spaceship (quest document 1.9, spaceship_1): the one section whose layout is fixed. It is the same in every world, stands at the very front of the ship and
 * is joined to the control room by the airlock at its east end. The grid below is the document's, token for token (the legend of the document):
 *
 *   CW wall           CO1..CO4 / CI1..CI4  walls with rounded corners (the engine rounds them where the walls run on straight, `roundCorners.ts`)
 *   CF floor          CD sliding door   CL locked door (a dialog, a minimal lock)   LC the airlock   LE its lever   DEN the transporter tube (the way in and out)
 *   CO final console  MT Terminator   MA Titanic Automato   SK bone pile (decoration)   TE computer terminal   TG temporal field generator
 *
 * A CI cell sits in the corner of a room, where two floor cells meet at a right angle: it is made floor, so that the room's corner is the round one of the model (`roundCorners.ts`
 * rounds a floor cell with walls on two sides; a wall cell there stays a square notch). A CI cell that has no such floor beside it (the caps of the corridor with the lever and the tube)
 * is a wall like the others. Pure data: no DOM, no Babylon, no random numbers.
 */

const ROWS: readonly string[] = [
  "CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW",
  "CW CI3 CF CF MT CD CF CF CF CF CF CF MA CF CF CF CW CW CI3 LE CI4 CW",
  "CW SK MT SK CF CW CO2 CF SK CF CO1 CW CL CW CO2 CF CO4 CW CO3 CF CO4 CW",
  "CW MT CO MT CF CW CW CF CF CF CW CF CF CF CW CF CF CD CF CF CF LC",
  "CW CF MT CF CF CW CO3 CF MT CF CW CF CF SK CW CF CO1 CW CO2 CF CO1 CW",
  "CW CI2 CF SK MT CD CF CF CF CI1 CW TG CF TE CW MA CW CW CI2 DEN CI1 CW",
  "CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW CW",
];

export const BRIDGE_TOKENS: readonly (readonly string[])[] = ROWS.map((r) => r.split(" "));
export const BRIDGE_W = 22;
export const BRIDGE_H = 7;

export type BridgeThing = "MT" | "MA" | "SK" | "TE" | "TG" | "CO" | "CD" | "CL" | "LE" | "LC" | "DEN";
const THINGS: ReadonlySet<string> = new Set(["MT", "MA", "SK", "TE", "TG", "CO", "CD", "CL", "LE", "LC", "DEN"]);

const token = (x: number, y: number): string => BRIDGE_TOKENS[y]?.[x] ?? "CW";
const isWallToken = (t: string): boolean => /^C[WIO]\d?$/.test(t) && t !== "CO";

/** Is the cell floor? Everything but the wall tokens; a CI cell is floor where floor lies on two sides of it at a right angle (a corner of a room). */
function isFloorAt(x: number, y: number): boolean {
  const t = token(x, y);
  if (!isWallToken(t)) return true;
  if (!/^CI\d$/.test(t)) return false;
  const open = (dx: number, dy: number): boolean => !isWallToken(token(x + dx, y + dy));
  return (open(1, 0) || open(-1, 0)) && (open(0, 1) || open(0, -1));
}

/** The cells of the bridge, row by row: `CELL.FLOOR` or `CELL.SOLID`. */
export function bridgeCells(): number[][] {
  return BRIDGE_TOKENS.map((row, y) => row.map((_, x) => (isFloorAt(x, y) ? CELL.FLOOR : CELL.SOLID)));
}

export interface BridgeFeature {
  thing: BridgeThing;
  /** The cell inside the bridge's grid. */
  x: number;
  y: number;
}

/** Everything that stands on the bridge, in reading order. */
export function bridgeFeatures(): BridgeFeature[] {
  const out: BridgeFeature[] = [];
  BRIDGE_TOKENS.forEach((row, y) => row.forEach((t, x) => THINGS.has(t) && out.push({ thing: t as BridgeThing, x, y })));
  return out;
}

/** The first feature of a kind (the console, the tube, the airlock, the lever: there is one of each). */
export function bridgeFeature(thing: BridgeThing): BridgeFeature {
  return bridgeFeatures().find((f) => f.thing === thing)!;
}

/** The axis the party crosses a door or the airlock along: `y` for the locked door in the corridor that runs north to south, `x` for the others. */
export const BRIDGE_DOOR_AXIS: Readonly<Record<"CD" | "CL" | "LC", "x" | "y">> = { CD: "x", CL: "y", LC: "x" };

/** The words of the computer terminal in the generator room (document 1.9) and of the temporal field generator, which the screen shows. */
export const BRIDGE_TERMINAL_TEXT = [
  "To whomever might find this. We came from a solar system far from here, because we detected that this planets constellation had an unknown energy signature. To study it, we designed an experiment to study the effects on organisms. We placed genetically created or enhances humanoids and creatures on the planet and enclosed the planet in a temporal field.",
  "A second on this station equaled eons on the planet. Research was going well and we saw life flourishing. 3 days ago a still unknown anomaly of the planet occurred. It is still unclear what exactly happened and I can only describe it that it somehow caused a virus or made parts of our systems sentient. It shut down the temporal core, which meant that time on the planet and here is now the same. It also turned the machine against the crew.",
  "Only two of us survived, but I got heavily injured. My partner exited towards the surface in order to plant an emergency beacon. Unfortunately the world's fauna has turned vile and he was killed almost immediately. I have no idea, if the ship's keycards he carried were destroyed or stolen. I managed to lock myself in this room and reset the ship's systems. It seems that the virus is flushed out, but the robots seem to have lost the connection and are still vicious.",
  "Since my wounds are too severe, I am afraid that I do not have much longer.",
].join("\n\n");
export const TEMPORAL_GENERATOR_TEXT = "Temporal field generator offline";
/** Every bone pile of the bridge says the same. */
export const BRIDGE_BONES_TEXT = "Ordinary human remains, except that the clothing looks like something you have never seen before.";
