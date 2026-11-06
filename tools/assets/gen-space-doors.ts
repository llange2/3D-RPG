/**
 * The two leaves of the spaceship's sliding doors (`render/interiorDoors.ts`): the user's picture of a double door (`sources/models/Space_door.png`, 1776.png) cut in
 * the middle, the left half on one box and the right half on the other (6. 11. 2026). The boxes are as big as the opening of the user's frame `Space_lock.glb`
 * (measured on its triangles, second file of 6. 11. 2026: 0.929 wide, 0.862 high, the frame 0.16 deep) with a little overlap into the frame, so that no gap shows, and as thick as the
 * slot of the frame: a section through the frame at the opening shows a sheet only 0.02 thick there (the thick border starts at 0.78 from the middle) with a slot of 0.011 in it, so a leaf
 * of 0.01 hides in the sheet (one of 0.04 stood out of it on both sides and covered the frame while it slid, user, 6. 11. 2026). Each leaf stands on its own middle, its lowest point at y = 0 (the prop renderer puts it on the floor), the front face looks along +z.
 *
 * Usage: npx tsx tools/assets/gen-space-doors.ts   (writes `Space_door_left.glb` and `Space_door_right.glb` next to the picture)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import { ROOT } from "./lib";

const DIR = join(ROOT, "tools", "assets", "sources", "models");

/** Size of a leaf in the units of the frame model: half the opening plus an overlap into the frame, the opening's height plus the same, the thickness of the slot. */
export const LEAF = { width: 0.478, height: 0.872, depth: 0.01 };

type V3 = [number, number, number];

/** A box as four vertices per face, `uv` gives the texture coordinates of each corner (u across, v up) per face. */
function boxArrays(w: number, h: number, d: number, uvOf: (face: string, cu: number, cv: number) => [number, number]) {
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = 0;
  const y1 = h;
  const z0 = -d / 2;
  const z1 = d / 2;
  // each face: normal and its four corners, counter-clockwise seen from outside; (cu, cv) of a corner is 0 or 1 along the face's own u and v
  const faces: { name: string; n: V3; c: V3[] }[] = [
    { name: "front", n: [0, 0, 1], c: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { name: "back", n: [0, 0, -1], c: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { name: "left", n: [-1, 0, 0], c: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { name: "right", n: [1, 0, 0], c: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { name: "top", n: [0, 1, 0], c: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { name: "bottom", n: [0, -1, 0], c: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ];
  const corner: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const f of faces) {
    const base = pos.length / 3;
    f.c.forEach((p, i) => {
      pos.push(...p);
      nor.push(...f.n);
      uv.push(...uvOf(f.name, corner[i]![0], corner[i]![1]));
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
}

async function leaf(side: "left" | "right"): Promise<void> {
  const src = sharp(join(DIR, "Space_door.png"));
  const meta = await src.metadata();
  const half = Math.floor(meta.width! / 2);
  // the picture's own half (left half of the picture for the left leaf): it fills the whole front face
  const png = await sharp(join(DIR, "Space_door.png"))
    .extract({ left: side === "left" ? 0 : meta.width! - half, top: 0, width: half, height: meta.height! })
    .png()
    .toBuffer();
  const doc = new Document();
  const buffer = doc.createBuffer();
  const tex = doc.createTexture(`space_door_${side}`).setImage(new Uint8Array(png)).setMimeType("image/png");
  const mat = doc.createMaterial(`space_door_${side}`).setBaseColorTexture(tex).setRoughnessFactor(0.7).setMetallicFactor(0.2);
  // the back face is mirrored: the pair of leaves seen from the other side is the same picture again (the door is symmetrical), the edges take a strip of the dark centre
  const edge = side === "left" ? 0.995 : 0.005;
  const a = boxArrays(LEAF.width, LEAF.height, LEAF.depth, (face, cu, cv) => {
    if (face === "front") return [cu, 1 - cv];
    if (face === "back") return [1 - cu, 1 - cv];
    return [edge, 0.5];
  });
  const acc = (type: "VEC3" | "VEC2", array: Float32Array<ArrayBuffer>) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", acc("VEC3", a.pos))
    .setAttribute("NORMAL", acc("VEC3", a.nor))
    .setAttribute("TEXCOORD_0", acc("VEC2", a.uv))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(a.idx).setBuffer(buffer))
    .setMaterial(mat);
  const mesh = doc.createMesh(`space_door_${side}`).addPrimitive(prim);
  const node = doc.createNode(`space_door_${side}`).setMesh(mesh);
  doc.createScene("Scene").addChild(node);
  const out = join(DIR, `Space_door_${side}.glb`);
  writeFileSync(out, await new NodeIO().writeBinary(doc));
  console.log(`wrote ${out}`);
}

if (process.argv[1]?.endsWith("gen-space-doors.ts")) {
  await leaf("left");
  await leaf("right");
}
