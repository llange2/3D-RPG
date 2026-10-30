import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/**
 * How the old game put a weapon or shield into a monster's hand (`UrsinaActor.assign_item` of entities.py): the item hangs under the joint
 * `RightHand` or `LeftHand` of the skeleton, scaled 40 times, at a position and a heading/pitch/roll that Panda3D reads in its own frame
 * (z up, y forward, bone units in centimetres). The skeletons here are the same glTF files, whose bones live in the glTF frame (y up), so the
 * fit is turned into it once: Panda3D's glTF loader maps (x, y, z) to (x, -z, y), and a transform T in the Panda frame is C^-1 T C in the glTF one.
 */
interface PandaFit {
  pos: readonly [number, number, number];
  /** Heading about z, pitch about x, roll about y, in degrees. Panda3D applies the roll first, then the pitch, then the heading. */
  hpr: readonly [number, number, number];
  scale: number;
}

export type Hand = "right" | "left";

/**
 * Where a weapon is gripped, along its long axis in item units (-1 pommel, 1 tip): swords and the like by the hilt, hammer and axe low on the haft.
 * Read off the models' profiles; a shield has none (it is strapped on with the old numbers). The axe's haft ran a third of its length out behind the Minotaur's fist
 * at -0.4 (32nd playtest, point 5): it is gripped at its end now, the haft ends in the hand.
 */
export const GRIP_Y: Record<string, number> = { wpn_sword1: -0.78, wpn_sword2: -0.78, wpn_sword3: -0.78, wpn_axe: -0.88, wpn_hammer: -0.4 };

export const HAND_FIT: Record<Hand, PandaFit> = {
  right: { pos: [15, 13, 28], hpr: [0, -90, 20], scale: 40 },
  left: { pos: [0, 0, 7], hpr: [0, 180, 0], scale: 40 },
};

type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];

const mul = (a: Mat3, b: Mat3): Mat3 => {
  const r: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i]![j]! += a[i]![k]! * b[k]![j]!;
  return r;
};

const transpose = (a: Mat3): Mat3 => [
  [a[0][0], a[1][0], a[2][0]],
  [a[0][1], a[1][1], a[2][1]],
  [a[0][2], a[1][2], a[2][2]],
];

const rad = (deg: number) => (deg * Math.PI) / 180;

const rotX = (a: number): Mat3 => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
const rotY = (a: number): Mat3 => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
const rotZ = (a: number): Mat3 => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];

/** glTF (y up) to Panda3D (z up): (x, y, z) becomes (x, -z, y). */
const GLTF_TO_PANDA: Mat3 = [
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
];

/** Unit quaternion of a rotation matrix (column vectors), by the trace method. */
function quaternionOf(m: Mat3): Quaternion {
  const trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return new Quaternion((m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4);
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    return new Quaternion(s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s);
  }
  if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    return new Quaternion((m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s);
  }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
  return new Quaternion((m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s);
}

/** The local transform of an item under a hand joint, in the glTF frame of the skeleton. */
export function handTransform(hand: Hand, gripY = 0): { position: Vector3; rotation: Quaternion; scale: number } {
  const fit = HAND_FIT[hand];

  const [h, p, r] = fit.hpr;
  // Panda3D composes heading (z), pitch (x) and roll (y) so that the roll is applied first
  const rotation = mul(rotZ(rad(h)), mul(rotX(rad(p)), rotY(rad(r))));
  const toGltf = transpose(GLTF_TO_PANDA);
  const [px, py, pz] = fit.pos;
  // C^-1 p
  const position = new Vector3(toGltf[0][0] * px + toGltf[0][1] * py + toGltf[0][2] * pz, toGltf[1][0] * px + toGltf[1][1] * py + toGltf[1][2] * pz, toGltf[2][0] * px + toGltf[2][1] * py + toGltf[2][2] * pz);
  const turned = mul(toGltf, mul(rotation, GLTF_TO_PANDA));
  const q = quaternionOf(turned);
  if (gripY !== 0) {
    // a held weapon: its grip (at `gripY` along the item's long axis, in item units) lies in the palm, so that the hand closes round the hilt and not round the air
    // beyond it. The old numbers put the centre of the item a fixed distance from the wrist, right for the model the old game's skeleton had and a hand's breadth too far for these.
    const blade = new Vector3(turned[0][1], turned[1][1], turned[2][1]);
    position.copyFrom(PALM).addInPlace(blade.scale(-gripY * fit.scale));
  }
  return { position, rotation: q, scale: fit.scale };
}

/** The middle of the palm in the glTF frame of the hand joint, in centimetres: a hand's breadth along the fingers from the wrist. */
const PALM = new Vector3(0, 6, 0);

/** Hangs a mesh of an item under the joint node of a hand with the old game's fit. */
export function holdInHand(item: TransformNode, joint: TransformNode, hand: Hand, gripY = 0): void {
  const t = handTransform(hand, gripY);
  item.parent = joint;
  item.position.copyFrom(t.position);
  item.rotationQuaternion = t.rotation;
  item.scaling.setAll(t.scale);
}
