/**
 * The Cave Explorer talent: a party that has it senses a brittle wall of a cave before it stands in front of it. Within `SENSE_STEPS` steps over open ground the
 * party stops, one hero says what he or she feels, and the player confirms with "OK". It happens once per wall (`senseFlag` in `state.opened`).
 * Pure functions, no DOM: the game asks them from `Game.senseBrittleWalls`.
 */

export const CAVE_EXPLORER = "talent_cave_explorer";
/** How many steps over open floor a brittle wall may be away from the party for the party to sense it. */
export const SENSE_STEPS = 3;

/** The flag in `state.opened` that says the party has been told about this wall. */
export const senseFlag = (uid: string): string => `${uid}@sensed`;

/**
 * What a hero says (43rd playtest, follow-up). Every line tells the same: somewhere close the rock is hollow. The wall decides which one it is (`senseLine`),
 * so a wall always has the same voice, and a cave does not repeat itself over and over.
 */
export const SENSE_LINES: readonly string[] = [
  "I feel a slight breeze. There seems to be a hidden wall around.",
  "Do you hear that? A small stream of water is trickling somewhere behind the rock. There must be a hollow wall nearby.",
  "The air smells different here, stale like a room nobody has opened for ages. Something is hidden behind these walls.",
  "Listen to the echo. It sounds hollow, as if there was a chamber behind one of the walls close by.",
];

/** The words of the hero who stops: `Suddenly <name> stops: '<line>'`. `pick` is any whole number that depends on the wall (a hash of its uid). */
export function senseLine(name: string, pick: number): string {
  return `Suddenly ${name} stops: '${SENSE_LINES[Math.abs(pick) % SENSE_LINES.length]}'`;
}

/** A small whole number from a text (FNV-1a), to choose the line of a wall and the hero who speaks without a random generator. */
export function pickOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The cells the party can reach from (x, y) in at most `steps` steps over open floor (four directions, the cell it stands on included). `open` says whether
 * a cell can be stood on.
 */
export function reachableWithin(x: number, y: number, steps: number, open: (x: number, y: number) => boolean): Set<string> {
  const seen = new Set<string>([`${x},${y}`]);
  let front: [number, number][] = [[x, y]];
  for (let s = 0; s < steps; s++) {
    const next: [number, number][] = [];
    for (const [cx, cy] of front) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key) || !open(nx, ny)) continue;
        seen.add(key);
        next.push([nx, ny]);
      }
    }
    front = next;
  }
  return seen;
}

/**
 * The walls (by cell) within `steps` fields of the party: the wall is `steps` steps away when the party reaches the cell in front of it in `steps - 1`, so a wall
 * on the other side of a rock does not count however close it lies. `walls` are the cells of the brittle walls that are still standing.
 */
export function wallsSensed(x: number, y: number, walls: readonly { x: number; y: number }[], open: (x: number, y: number) => boolean, steps = SENSE_STEPS): { x: number; y: number }[] {
  if (walls.length === 0) return [];
  const reach = reachableWithin(x, y, steps - 1, open);
  return walls.filter((w) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => reach.has(`${w.x + dx!},${w.y + dy!}`)));
}
