/**
 * Model stage of the asset pipeline. Reads the original glb/obj models, keeps only the base colour texture
 * (WebP), decimates the geometry to a triangle budget and writes small glb files plus a registry (models.json).
 * OBJ files are converted by a small parser here because their .mtl files in the old project are broken;
 * the texture is the image with the same name next to the OBJ.
 *
 * Two profiles: `reduced` (default, the low-poly set the game ships with) and `original` (`--original`: the same pipeline
 * without triangle budget and texture downscale, ~470 MB, written beside the reduced set for the menu's model switch).
 */
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { Document, Logger, NodeIO, getBounds, type Primitive, type TypedArray } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, prune, resample, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { PERSONAS, personaModelId } from "../../src/data/personas";
import { OLD, OUT, ROOT, ensureDir, mb, pool, upToDate } from "./lib";

const OBJ_DIR = join(OLD, "objects");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

export interface ModelSpec {
  key: string;
  /** Path relative to resources/objects (without folder prefix for the objects root). */
  source: string;
  maxTris: number;
  texSize: number;
  /** Keep skins and animations (monsters, NPCs). */
  animated?: boolean;
  /**
   * Shading of the rebuilt normals. `crease` (the default) smooths what bends gently and keeps edges sharper than `CREASE_ANGLE`, so statues
   * and trees lose the faceted look of the reduced meshes while walls and boxes stay crisp. `flat` shows every triangle, `smooth` averages
   * everything (the default for animated models).
   */
  normals?: "flat" | "smooth" | "crease";
  /** OBJ only: texture file (relative to resources) for models whose .mtl and image next to the file are missing. */
  texture?: string;
  /** Names of glTF nodes to leave out (a model that carries a floor slab the game draws itself). */
  drop?: string[];
  /** Keep the triangle budget in the `original` profile too (models the game instances by the hundred). */
  capped?: boolean;
  /**
   * Rebuild the model as a grid of `cells` x `cells` squares whose heights are averaged from the source (a bumpy slab such as the
   * old dirt tile) and whose texture coordinates run flat over a window of `uvSpan` of the texture. For models whose texture is a
   * baked atlas, one island per lump: no simplifier keeps those together, triangles end up on the wrong island.
   */
  heightfield?: { cells: number; uvSpan: number };
}

export type ModelProfile = "reduced" | "original";

/**
 * Where a profile writes. The registry names must match `registryFile` in src/render/modelSet.ts (tests/unit/assets.test.ts
 * compares them); `file` in the registries is relative to the asset root, so the game needs nothing else to tell the sets apart.
 */
export const PROFILES: Record<ModelProfile, { dir: string; staticRegistry: string; monsterRegistry: string; webpQuality: number }> = {
  reduced: { dir: "models", staticRegistry: "models.static.json", monsterRegistry: "models.monsters.json", webpQuality: 80 },
  original: { dir: "models-original", staticRegistry: "models.static.original.json", monsterRegistry: "models.monsters.original.json", webpQuality: 90 },
};

export interface ModelInfo {
  file: string;
  tris: number;
  bytes: number;
  /** Bounding box of the default scene: [minX,minY,minZ,maxX,maxY,maxZ]. */
  bounds: [number, number, number, number, number, number];
  animations: string[];
  /** Top of the slab a tile model stands on (model units); 0 for animated models. */
  groundTop: number;
  /** Converted from OBJ: these render inside-out in Babylon and need their faces flipped at load time. */
  fromObj: boolean;
  /**
   * Mean brightness of the colour texture(s), 0 to 1 (luma of the stored values). The old textures are painted dark, a sapphire
   * chest averages 0.04 and a fountain 0.26, and the game draws a model with the factor that brings it to a common brightness.
   */
  mean?: number;
}

/** Mean luma (0 to 1) of the colour textures of a document, or undefined when it has none. */
async function meanBrightness(doc: Document): Promise<number | undefined> {
  const means: number[] = [];
  for (const tex of doc.getRoot().listTextures()) {
    const image = tex.getImage();
    if (!image) continue;
    const { channels } = await sharp(Buffer.from(image)).removeAlpha().stats();
    means.push((0.299 * channels[0]!.mean + 0.587 * channels[1]!.mean + 0.114 * channels[2]!.mean) / 255);
  }
  return means.length > 0 ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 1000) / 1000 : undefined;
}

// ---------------------------------------------------------------- OBJ reader

interface ObjMesh {
  positions: number[];
  uvs: number[];
  normals: number[];
  indices: number[];
}

function parseObj(text: string): ObjMesh {
  const pos: number[][] = [];
  const uv: number[][] = [];
  const nrm: number[][] = [];
  const out: ObjMesh = { positions: [], uvs: [], normals: [], indices: [] };
  const lookup = new Map<string, number>();
  const vertex = (token: string): number => {
    const hit = lookup.get(token);
    if (hit !== undefined) return hit;
    const [vi, ti, ni] = token.split("/").map((s) => (s === "" || s === undefined ? NaN : Number(s)));
    const p = pos[vi! < 0 ? pos.length + vi! : vi! - 1]!;
    out.positions.push(p[0]!, p[1]!, p[2]!);
    if (ti !== undefined && !Number.isNaN(ti)) {
      const t = uv[ti < 0 ? uv.length + ti : ti - 1]!;
      out.uvs.push(t[0]!, 1 - t[1]!); // OBJ origin is bottom-left, glTF top-left
    } else out.uvs.push(0, 0);
    if (ni !== undefined && !Number.isNaN(ni)) {
      const n = nrm[ni < 0 ? nrm.length + ni : ni - 1]!;
      out.normals.push(n[0]!, n[1]!, n[2]!);
    } else out.normals.push(0, 1, 0);
    const id = out.positions.length / 3 - 1;
    lookup.set(token, id);
    return id;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("v ")) pos.push(line.slice(2).trim().split(/\s+/).map(Number));
    else if (line.startsWith("vt ")) uv.push(line.slice(3).trim().split(/\s+/).map(Number));
    else if (line.startsWith("vn ")) nrm.push(line.slice(3).trim().split(/\s+/).map(Number));
    else if (line.startsWith("f ")) {
      const tokens = line.slice(2).trim().split(/\s+/);
      const ids = tokens.map(vertex);
      for (let i = 1; i < ids.length - 1; i++) out.indices.push(ids[0]!, ids[i]!, ids[i + 1]!);
    }
  }
  return out;
}

function findTexture(objPath: string): string | null {
  const base = objPath.slice(0, -extname(objPath).length);
  return [".jpg", ".png", ".jpeg"].map((e) => base + e).find((p) => existsSync(p)) ?? null;
}

async function docFromObj(objPath: string, textureFile?: string): Promise<Document> {
  const mesh = parseObj(readFileSync(objPath, "utf-8"));
  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(mesh.positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(mesh.normals)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(mesh.uvs)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(mesh.indices)).setBuffer(buffer));
  const material = doc.createMaterial(basename(objPath, ".obj")).setMetallicFactor(0).setRoughnessFactor(1);
  const texPath = textureFile ? join(OLD, textureFile) : findTexture(objPath);
  if (texPath && existsSync(texPath)) {
    const texture = doc.createTexture(basename(texPath)).setImage(new Uint8Array(readFileSync(texPath))).setMimeType(texPath.endsWith(".png") ? "image/png" : "image/jpeg");
    material.setBaseColorTexture(texture);
  }
  prim.setMaterial(material);
  const meshNode = doc.createMesh(basename(objPath, ".obj")).addPrimitive(prim);
  const node = doc.createNode(basename(objPath, ".obj")).setMesh(meshNode);
  doc.createScene().addChild(node);
  return doc;
}

// ---------------------------------------------------------------- processing

function triCount(doc: Document): number {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives() as Primitive[]) {
      tris += Math.floor((prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0) / 3);
    }
  }
  return tris;
}

async function processDoc(doc: Document, spec: ModelSpec, profile: ModelProfile): Promise<void> {
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  for (const node of doc.getRoot().listNodes()) if (spec.drop?.includes(node.getName())) node.dispose();
  if (spec.heightfield) heightfieldDoc(doc, spec.heightfield.cells, spec.heightfield.uvSpan);
  doc.createExtension(EXTTextureWebP).setRequired(false);
  // flat matte look: drop normal, roughness, occlusion and emissive maps, keep the colour
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
    mat.setMetallicFactor(0).setRoughnessFactor(1).setEmissiveFactor([0, 0, 0]);
  }
  await doc.transform(prune());

  // scale every base colour texture to the budget and convert to WebP
  for (const tex of doc.getRoot().listTextures()) {
    const image = tex.getImage();
    if (!image) continue;
    const out = await sharp(Buffer.from(image))
      .resize(spec.texSize, spec.texSize, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .webp({ quality: PROFILES[profile].webpQuality, effort: 4 })
      .toBuffer();
    tex.setImage(new Uint8Array(out)).setMimeType("image/webp");
  }

  await MeshoptSimplifier.ready;
  // Flat-shaded sources have one normal per face, which splits every vertex and leaves the simplifier nothing to
  // collapse. Normals are therefore dropped first and rebuilt after simplification.
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute("NORMAL", null);
  await doc.transform(weld());
  const before = triCount(doc);
  const steps = [];
  // error is the largest tolerated deviation relative to the model size; a generous value lets the triangle budget decide
  if (before > spec.maxTris) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: spec.maxTris / before, error: 0.35, lockBorder: false }));
  steps.push(dedup(), prune());
  await doc.transform(...steps.splice(0));
  // The simplifier stops short of the target on models with loose parts (bone piles, rubble). Models up to HEAVY triangles
  // are accepted as they come out; only the outliers above that are asked again for what is left.
  const HEAVY = 4500;
  for (let pass = 0; pass < 3 && !spec.animated; pass++) {
    const now = triCount(doc);
    if (now <= Math.max(HEAVY, spec.maxTris * 1.25)) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: spec.maxTris / now, error: 0.5 + pass * 0.25, lockBorder: false }), prune());
  }
  // last resort for noisy organic meshes: the sloppy simplifier ignores UV seams and always reaches its target
  if (!spec.animated && triCount(doc) > Math.max(HEAVY, spec.maxTris * 1.5)) {
    const total = triCount(doc);
    console.log(`  ${spec.key}: ${total} triangles after normal passes, budget ${spec.maxTris}: sloppy pass`);
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        const pos = prim.getAttribute("POSITION");
        if (!idx || !pos) continue;
        const own = Math.floor(idx.getCount() / 3);
        const target = Math.max(12, Math.floor((own / total) * spec.maxTris)) * 3;
        const [simpler] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(idx.getArray() as ArrayLike<number>), pos.getArray() as Float32Array, 3, null, target, 0.9);
        idx.setArray(new Uint32Array(simpler));
      }
    }
    await doc.transform(prune());
  }
  if (spec.animated) steps.push(resample({ tolerance: 0.001 }));
  await doc.transform(...steps);
  // a height grid is an open surface: its signed volume says nothing about which way it faces, and it was built facing up
  if (!spec.animated && !spec.heightfield) {
    const flipped = fixWinding(doc);
    if (flipped > 0) console.log(`  ${spec.key}: flipped winding of ${flipped} primitive(s)`);
  }
  const mode = spec.normals ?? (spec.animated ? "smooth" : "crease");
  computeNormals(doc, mode);
  // the creased normals were written per triangle corner: vertices that came out identical are one again
  if (mode === "crease") await doc.transform(weld());
}

/**
 * Replaces the first primitive by a height grid (see `ModelSpec.heightfield`): every vertex of the source falls into one cell of the
 * grid and the cell takes the mean height, empty cells take their neighbours', one pass of blur takes the grain out. The tile keeps its
 * footprint and its relief, loses the pebbles that were smaller than a cell. The grid faces up in glTF's right-handed system.
 */
function heightfieldDoc(doc: Document, cells: number, uvSpan: number): void {
  const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const src = prim.getAttribute("POSITION")!.getArray() as Float32Array;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < src.length; i += 3) {
    minX = Math.min(minX, src[i]!);
    maxX = Math.max(maxX, src[i]!);
    minZ = Math.min(minZ, src[i + 2]!);
    maxZ = Math.max(maxZ, src[i + 2]!);
  }
  const n = cells + 1;
  const sum = new Float64Array(n * n);
  const count = new Uint32Array(n * n);
  for (let i = 0; i < src.length; i += 3) {
    const gx = Math.round(((src[i]! - minX) / (maxX - minX)) * cells);
    const gz = Math.round(((src[i + 2]! - minZ) / (maxZ - minZ)) * cells);
    sum[gz * n + gx]! += src[i + 1]!;
    count[gz * n + gx]!++;
  }
  let h = Float64Array.from(sum, (s, i) => (count[i]! > 0 ? s / count[i]! : NaN));
  // vertices without a source vertex: the mean of the neighbours that have one, repeated until the grid is full
  for (let pass = 0; pass < 8 && h.some(Number.isNaN); pass++) {
    const next = h.slice();
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        if (!Number.isNaN(h[z * n + x]!)) continue;
        let s = 0, c = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const v = h[(z + dz) * n + x + dx];
          if (x + dx >= 0 && x + dx < n && z + dz >= 0 && z + dz < n && v !== undefined && !Number.isNaN(v)) (s += v), c++;
        }
        if (c > 0) next[z * n + x] = s / c;
      }
    }
    h = next;
  }
  const smooth = h.slice();
  for (let z = 1; z < n - 1; z++) for (let x = 1; x < n - 1; x++) smooth[z * n + x] = (h[z * n + x]! * 4 + h[z * n + x - 1]! + h[z * n + x + 1]! + h[(z - 1) * n + x]! + h[(z + 1) * n + x]!) / 8;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      pos.set([minX + ((maxX - minX) * x) / cells, smooth[i]!, minZ + ((maxZ - minZ) * z) / cells], i * 3);
      uv.set([0.3 + (x / cells) * uvSpan, 0.3 + (z / cells) * uvSpan], i * 2);
    }
  }
  const index: number[] = [];
  for (let z = 0; z < cells; z++) {
    for (let x = 0; x < cells; x++) {
      const a = z * n + x, b = a + 1, c = a + n, d = c + 1;
      index.push(a, c, b, b, c, d); // (x,z) -> (x,z+1) -> (x+1,z): the cross product points up
    }
  }
  prim.getAttribute("POSITION")!.setArray(pos);
  prim.getAttribute("TEXCOORD_0")!.setArray(uv);
  prim.setAttribute("NORMAL", null);
  prim.getIndices()!.setArray(new Uint32Array(index));
}

/**
 * Some source meshes (Meshy exports) have clockwise winding, so their faces point inward and light them from behind.
 * A closed mesh has a positive signed volume when its winding is counter-clockwise; flip primitives where it is negative.
 */
function fixWinding(doc: Document): number {
  let flipped = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      if (!idx || !pos) continue;
      const i = idx.getArray()!;
      const p = pos.getArray()!;
      let volume = 0;
      for (let t = 0; t < i.length; t += 3) {
        const a = i[t]! * 3, b = i[t + 1]! * 3, c = i[t + 2]! * 3;
        volume +=
          p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
          p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
          p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
      }
      if (volume < 0) {
        const copy = i.slice();
        for (let t = 0; t < copy.length; t += 3) {
          copy[t + 1] = i[t + 2]!;
          copy[t + 2] = i[t + 1]!;
        }
        idx.setArray(copy);
        flipped++;
      }
    }
  }
  return flipped;
}

/**
 * Height (in model units) of the largest upward facing flat area. Tile models (trees, mountains, buildings) stand on a
 * slab whose top is that plateau; the game sinks the slab into the terrain so only what grows out of it shows.
 */
function groundTopOf(doc: Document): number {
  const bins = new Map<number, number>();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix(); // column-major 4x4
    const world = (p: TypedArray, o: number): [number, number, number] => [
      m[0]! * p[o]! + m[4]! * p[o + 1]! + m[8]! * p[o + 2]! + m[12]!,
      m[1]! * p[o]! + m[5]! * p[o + 1]! + m[9]! * p[o + 2]! + m[13]!,
      m[2]! * p[o]! + m[6]! * p[o + 1]! + m[10]! * p[o + 2]! + m[14]!,
    ];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const p = pos.getArray()!;
      const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: p.length / 3 }, (_, k) => k);
      for (let t = 0; t < idx.length; t += 3) {
        const a = world(p, idx[t]! * 3), b = world(p, idx[t + 1]! * 3), c = world(p, idx[t + 2]! * 3);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const area = Math.hypot(nx, ny, nz) / 2;
        if (area === 0 || ny / (2 * area) < 0.85) continue; // clearly upward facing only
        const bin = Math.round(((a[1] + b[1] + c[1]) / 3) * 20) / 20;
        bins.set(bin, (bins.get(bin) ?? 0) + area);
      }
    }
  }
  // the slab top is the lowest height that holds a sizeable horizontal area (canopies and roofs lie higher)
  const levels = [...bins.keys()].sort((x, y) => x - y);
  for (const y of levels) {
    const window = (bins.get(y) ?? 0) + (bins.get(Math.round((y + 0.05) * 20) / 20) ?? 0) + (bins.get(Math.round((y - 0.05) * 20) / 20) ?? 0);
    if (window >= 0.7) return y;
  }
  return levels[0] ?? 0;
}

/** Edges sharper than this stay hard in the `crease` mode (degrees between the two faces' normals). */
const CREASE_ANGLE = 75;

/**
 * Rebuilds vertex normals: `flat` gives every triangle its own normal, `smooth` averages over shared positions, `crease` averages over the
 * faces at a position whose normals lie within `CREASE_ANGLE` of the corner's own face (area-weighted), so curved surfaces come out smooth and
 * sharp edges survive.
 */
function computeNormals(doc: Document, mode: "flat" | "smooth" | "crease"): void {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION")!;
      const p = pos.getArray() as Float32Array;
      const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: p.length / 3 }, (_, i) => i);
      const normals = new Float32Array(p.length);
      const face = (a: number, b: number, c: number): [number, number, number] => {
        const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
        const vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
        return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; // length = 2 x area, so larger faces weigh more
      };
      if (mode !== "smooth") {
        // unweld: every triangle gets three own vertices, so each can carry its own normal
        const attrs = prim.listSemantics().filter((s) => s !== "NORMAL");
        const newAttrs = new Map<string, TypedArray>();
        for (const s of attrs) {
          const acc = prim.getAttribute(s)!;
          const size = acc.getElementSize();
          const src = acc.getArray()! as TypedArray;
          const dst = new (src.constructor as new (n: number) => TypedArray)(idx.length * size);
          for (let i = 0; i < idx.length; i++) for (let k = 0; k < size; k++) dst[i * size + k] = src[idx[i]! * size + k]!;
          newAttrs.set(s, dst);
        }
        const flat = new Float32Array(idx.length * 3);
        const faceNormals: [number, number, number][] = [];
        for (let t = 0; t < idx.length; t += 3) {
          const [nx, ny, nz] = face(idx[t]!, idx[t + 1]!, idx[t + 2]!);
          const len = Math.hypot(nx, ny, nz) || 1;
          faceNormals.push([nx, ny, nz]);
          for (let k = 0; k < 3; k++) flat.set([nx / len, ny / len, nz / len], (t + k) * 3);
        }
        if (mode === "crease") {
          // the faces around every position (vertices are grouped by position, so UV seams do not break the shading)
          const posKey = (i: number) => `${Math.round(p[i * 3]! * 1e4)},${Math.round(p[i * 3 + 1]! * 1e4)},${Math.round(p[i * 3 + 2]! * 1e4)}`;
          const around = new Map<string, number[]>();
          for (let t = 0; t < idx.length; t += 3) {
            for (let k = 0; k < 3; k++) {
              const kk = posKey(idx[t + k]!);
              const list = around.get(kk);
              if (list) list.push(t / 3);
              else around.set(kk, [t / 3]);
            }
          }
          const cos = Math.cos((CREASE_ANGLE * Math.PI) / 180);
          for (let t = 0; t < idx.length; t += 3) {
            const own = faceNormals[t / 3]!;
            const ownLen = Math.hypot(own[0], own[1], own[2]);
            if (ownLen === 0) continue; // a degenerate triangle keeps its zero-length fallback below
            for (let k = 0; k < 3; k++) {
              let sx = 0, sy = 0, sz = 0;
              for (const f of around.get(posKey(idx[t + k]!))!) {
                const n = faceNormals[f]!;
                const len = Math.hypot(n[0], n[1], n[2]);
                if (len === 0 || (n[0] * own[0] + n[1] * own[1] + n[2] * own[2]) / (len * ownLen) < cos) continue;
                sx += n[0];
                sy += n[1];
                sz += n[2];
              }
              const len = Math.hypot(sx, sy, sz) || 1;
              flat.set([sx / len, sy / len, sz / len], (t + k) * 3);
            }
          }
        }
        for (const s of attrs) {
          const acc = prim.getAttribute(s)!;
          const type = acc.getType();
          const normalized = acc.getNormalized();
          prim.setAttribute(s, doc.createAccessor().setType(type).setArray(newAttrs.get(s)!).setNormalized(normalized).setBuffer(buffer));
        }
        prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(flat).setBuffer(buffer));
        prim.setIndices(null);
      } else {
        // smooth: group vertices by position so that UV seams do not show as shading cracks
        const key = (i: number) => `${Math.round(p[i * 3]! * 1e4)},${Math.round(p[i * 3 + 1]! * 1e4)},${Math.round(p[i * 3 + 2]! * 1e4)}`;
        const sum = new Map<string, [number, number, number]>();
        for (let t = 0; t < idx.length; t += 3) {
          const n = face(idx[t]!, idx[t + 1]!, idx[t + 2]!);
          for (let k = 0; k < 3; k++) {
            const kk = key(idx[t + k]!);
            const s = sum.get(kk) ?? [0, 0, 0];
            s[0] += n[0];
            s[1] += n[1];
            s[2] += n[2];
            sum.set(kk, s);
          }
        }
        for (let i = 0; i < p.length / 3; i++) {
          const s = sum.get(key(i)) ?? [0, 1, 0];
          const len = Math.hypot(s[0], s[1], s[2]) || 1;
          normals.set([s[0] / len, s[1] / len, s[2] / len], i * 3);
        }
        prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer));
      }
    }
  }
}

export async function buildModel(spec: ModelSpec, profile: ModelProfile = "reduced"): Promise<ModelInfo | null> {
  const src = join(OBJ_DIR, spec.source);
  if (!existsSync(src)) {
    console.warn(`  missing source: ${spec.source}`);
    return null;
  }
  const { dir } = PROFILES[profile];
  const out = join(OUT, dir, `${spec.key}.glb`);
  const stamp = join(import.meta.dirname, "build-models.ts");
  const cacheFile = join(ROOT, ".cache", dir, `${spec.key}.json`); // build cache, not served
  if (upToDate(out, src, stamp) && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf-8")) as ModelInfo;
    // a cache from before the brightness was recorded: read it from the built file instead of building the model again
    if (cached.mean === undefined) {
      cached.mean = await meanBrightness(await io.readBinary(new Uint8Array(readFileSync(out))));
      if (cached.mean !== undefined) writeFileSync(cacheFile, JSON.stringify(cached));
    }
    return cached;
  }

  const doc = extname(src).toLowerCase() === ".obj" ? await docFromObj(src, spec.texture) : await io.readBinary(new Uint8Array(readFileSync(src)));
  // the originals ignore the budgets of the table below: Infinity switches every simplify step off, 4096 never shrinks a 2048 texture
  await processDoc(doc, profile === "original" ? { ...spec, maxTris: spec.capped ? spec.maxTris : Infinity, texSize: 4096 } : spec, profile);
  ensureDir(out);
  await io.write(out, doc);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  const b = getBounds(scene);
  const info: ModelInfo = {
    file: `${dir}/${spec.key}.glb`,
    tris: triCount(doc),
    bytes: statSync(out).size,
    bounds: [...b.min, ...b.max] as ModelInfo["bounds"],
    animations: doc.getRoot().listAnimations().map((a) => a.getName()),
    groundTop: spec.animated ? 0 : groundTopOf(doc),
    fromObj: extname(src).toLowerCase() === ".obj",
    mean: await meanBrightness(doc),
  };
  ensureDir(cacheFile);
  writeFileSync(cacheFile, JSON.stringify(info));
  return info;
}

/** Deletes model files in the profile's folder that no build step produces any more. */
function pruneStale(keys: Set<string>, profile: ModelProfile): void {
  const dir = join(OUT, PROFILES[profile].dir);
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const key = name.replace(/\.glb(\.json)?$/, "");
    if (name.endsWith(".json") || !keys.has(key)) {
      unlinkSync(join(dir, name));
      console.log(`  removed stale ${name}`);
    }
  }
}

// ---------------------------------------------------------------- what to build

const S = (key: string, source: string, maxTris: number, texSize = 512, animated = false): ModelSpec => ({ key, source, maxTris, texSize, animated });

/** Map decorations of the hand-built campaign: one model per item id of the old ITEMS table (see export_item_models.py). */
function campaignItemModels(): ModelSpec[] {
  const path = join(ROOT, "src", "data", "item-models.json");
  if (!existsSync(path)) return [];
  const table = JSON.parse(readFileSync(path, "utf-8")) as Record<string, { source: string | null; persona: boolean }>;
  const specs: ModelSpec[] = [];
  for (const [id, item] of Object.entries(table)) {
    const n = Number(id);
    if (!item.source || n >= 200) continue;
    // buildings and big statues get a few more triangles than keys and signs; statues, heads and thrones are looked at from one cell away, where
    // 800 triangles show as facets (fountains, lion, pegasus, heads, thrones, dragon, metal and stone statues), and only a few stand in a level
    const big = [26, 41, 42, 43, 44, 45, 47, 101, 102].includes(n);
    const closeUp = [2, 6, 27, 28, 29, 30, 33, 34, 61, 95].includes(n);
    // the bone pile (70) keeps its 10 000 triangles: its texture is a baked atlas, any simplification (even to 3000) shatters it
    const spec = S(`ci_${n}`, item.source, n === 70 ? 10000 : closeUp ? 3000 : big ? 1800 : 800, big || closeUp ? 512 : 256);
    // the rounded corners of the spaceship: their .mtl points at a path on the author's disk (the outer one at the dungeon ceiling by mistake); both wear the cyber wall
    specs.push(n === 84 || n === 85 ? { ...spec, texture: "textures/tex_cyber_wall.jpg" } : spec);
  }
  return specs;
}

/** Props, buildings, vegetation and terrain pieces used by the overworld and the interiors. */
export const STATIC_MODELS: ModelSpec[] = [
  // points of interest seen from the overworld
  { ...S("poi_castle", "Castle.obj", 9000, 1024), normals: "smooth" },
  { ...S("poi_town", "Village.obj", 9000, 1024), normals: "smooth" },
  S("poi_hut", "Hut.obj", 1200),
  S("poi_pyramid", "Pyramid.obj", 900),
  S("poi_dungeon", "Dungeon entrance.obj", 1200),
  S("poi_cave", "Cave entrance.glb", 1200),
  S("poi_gate", "Castle Gate.glb", 1500),
  S("poi_portal", "Portal.obj", 600),
  // vegetation and mountains (each covers one tile)
  S("veg_trees", "Trees.glb", 700),
  S("veg_snowy_forest", "Snowy Forest.obj", 700),
  S("veg_palms", "Desert with palm trees.glb", 700),
  S("veg_old_tree", "Old tree.obj", 500),
  S("veg_forest_tile", "Forest tile.obj", 700),
  S("mtn_mountain", "Mountain.glb", 650),
  S("mtn_snowy", "Snowy mountain.glb", 650),
  S("mtn_desert", "Desert mountain.glb", 500),
  S("mtn_swamp", "Swamp mountain.glb", 500),
  S("mtn_lava", "Lava Mountain.obj", 500),
  // the ground of the outside map (old blocks 8, 12, 24, 25 and 26): a slab with bushes, stones and tufts of grass on it, 2250 to 5800 triangles
  // each. The game stands them on the flat ground texture close to the party (hundreds at a time), so they keep about 200 triangles
  // (`capped`: also in the original set), smooth shaded because they are lumps, not buildings
  { ...S("gnd_grass", "Grass.glb", 220, 512), normals: "smooth", capped: true },
  { ...S("gnd_snow", "Snow.glb", 220, 512), normals: "smooth", capped: true },
  { ...S("gnd_swamp", "Swamp.glb", 220, 512), normals: "smooth", capped: true },
  { ...S("gnd_desert", "Desert.glb", 220, 512), normals: "smooth", capped: true },
  // the dirt tile's texture is a baked atlas that no simplifier keeps together: a 9 x 9 height grid with the texture laid flat over it
  { ...S("gnd_dirt", "Dirt.obj", 220, 512), normals: "smooth", capped: true, heightfield: { cells: 9, uvSpan: 0.34 } },
  // the cobblestone road (campaign block 9): 1500 triangles, kept whole, and only 90 cells of the outside map; flat shaded, so that every stone shows its facets (smooth normals made the road look flat)
  { ...S("gnd_cobble", "Cobblestone.obj", 1600, 1024), normals: "flat", capped: true },
  // the ground tiles in full, for the quality "ultra" (2250 to 5800 triangles each, 1024 px textures; the original set keeps 4096 px)
  ...["grass:Grass.glb", "snow:Snow.glb", "swamp:Swamp.glb", "desert:Desert.glb", "dirt:Dirt.obj"].map((e) => {
    const [name, file] = e.split(":") as [string, string];
    return { ...S(`gndx_${name}`, file, 1_000_000, 1024), normals: "smooth" as const };
  }),
  // small decoration (grass, flowers, mushrooms, rocks) is generated procedurally in the game: the original
  // floor decoration models have thousands of triangles each, far too many for hundreds of instances
  // interior objects
  S("obj_chest", "Chest.obj", 600, 256),
  S("obj_chest_iron", "Iron chest.obj", 600, 256),
  S("obj_chest_noble", "Noble chest.obj", 600, 256),
  S("obj_chest_sapphire", "Sapphire chest.obj", 600, 256),
  S("obj_loot", "Loot.obj", 500, 256),
  S("obj_spear_trap", "Spear Trap.obj", 500, 256),
  S("obj_pit", "Pit.glb", 500, 256),
  S("obj_guillotine", "Guillotine trap.obj", 700, 256),
  S("obj_well_red", "Magic well red.obj", 900, 256),
  S("obj_well_yellow", "Magic well yellow.obj", 900, 256),
  S("obj_altar", "Amethyst altar.obj", 900, 256),
  S("obj_fountain", "Fountain.obj", 1200, 256),
  S("obj_gravestone", "Gravestone.obj", 400, 256),
  S("obj_lantern", "Rustic lantern.obj", 400, 256),
  S("obj_barrel", "Wooden_barrel.obj", 400, 256),
  S("obj_statue", "Statue.obj", 900, 256),
  S("obj_throne", "Evil throne.obj", 900, 256),
  S("obj_sign_inn", "Sign Inn.glb", 500, 256),
  S("obj_sign_bank", "Sign Bank.glb", 500, 256),
  S("obj_sign_guild", "Sign Guild.glb", 500, 256),
  S("obj_sign_smith", "Sign Smith.glb", 500, 256),
  S("obj_sign_tavern", "Sign Tavern.glb", 500, 256),
  S("obj_sign_temple", "Sign Temple.glb", 500, 256),
  S("obj_sign_training", "Sign Training.glb", 500, 256),
  S("obj_banner_good", "Good Banner.glb", 400, 256),
  S("obj_banner_evil", "Evil Banner.glb", 400, 256),
  S("obj_orb", "Orb.obj", 300, 256),
  // door frames of the campaign maps (old blocks 19, 41, 47): a wall piece with the doorway that the metal gates fit into
  // the frames carry a floor slab of their own (the gate's groove textured in, a different scale than the street): the cell draws its own floor
  { ...S("frame_city", "City door frame.glb", 300, 512), drop: ["Cube"] },
  { ...S("frame_dungeon", "Dungeon Door frame.glb", 3700, 512), drop: ["Mesh_0", "Cube"] },
  // the old game gave this one the fortress wall texture in code; its own .mtl points at a path on the author's disk
  { ...S("frame_fortress", "Fortress gate.obj", 400, 512), texture: "textures/tex_fortress_wall.jpg" },
  // dungeon blocks the old game built from models instead of textured cubes (add_block 15 to 18 and 20): the doors, the walls that
  // can be broken and what is left of them, and the gate frame. All are one cell big at the scale 1.5 x 1.473 x 1.5.
  // the door models carry a floor slab of 10 000 triangles (and a flat underlay) that the cells draw themselves; without them a
  // door stays under the triangle budget (the simplifier's "sloppy" pass, the only way to get lower otherwise, shatters them)
  { ...S("blk_door_closed", "Dungeon Door closed.glb", 3700, 512), drop: ["Mesh_0", "Cube"] },
  { ...S("blk_door_open", "Dungeon Door open.glb", 3700, 512), drop: ["Mesh_0", "Cube"] },
  // the same for the walls and the gate: only the wall piece stays, floor and ceiling come from the cell (flat or `blk_floor`)
  { ...S("blk_brittle_wall", "Dungeon brittle wall.glb", 1500, 512), drop: ["Mesh_0", "Cube"] },
  { ...S("blk_cracked_wall", "Dungeon cracked wall.glb", 1500, 512), drop: ["Mesh_0", "Cube"] },
  { ...S("blk_gate2", "Dungeon Gate 2.glb", 1500, 512), drop: ["Mesh_0", "Cube"] },
  // the pillars of the old fortress block 40 ("4 pillars": four columns at the corners of one cell), the only pillars the generated levels use. The
  // texture differs by kind of place: the dungeon gets the fortress wall's stone, a castle its pillar texture, a town its columns
  { ...S("blk_pillars_dungeon", "4 pillars.obj", 700, 512), texture: "textures/tex_fortress_wall.jpg" },
  { ...S("blk_pillars_castle", "4 pillars.obj", 700, 512), texture: "textures/tex_fortress_pillar.jpg" },
  { ...S("blk_pillars_city", "4 pillars.obj", 700, 512), texture: "textures/tex_city_columns.jpg" },
  // the city's walls that can be broken and what is left of them (blocks 5 and 6): they look like any other city wall until broken
  { ...S("blk_city_brittle", "City brittle wall.glb", 300, 1024), drop: ["Cube"] },
  { ...S("blk_city_cracked", "City cracked wall.glb", 600, 1024), drop: ["Cube"] },
  // the old floor of every dungeon cell: a cobbled mesh of 10 000 triangles whose texture is a baked atlas, one island per stone.
  // `capped`: even the original set gets the reduced triangle count (a view holds a few hundred of these); the UV islands of the stones keep the
  // simplifier at about 2760 triangles however low the budget, and the sloppy pass would shatter the cobbles
  { ...S("blk_floor", "Dungeon floor and ceiling.glb", 1400, 1024), drop: ["Cube"], capped: true },
  // the cave's walls and the way out (blocks 44 and 45): one rock model per wall cell, 10 000 triangles each in the original; a view holds
  // a few hundred of them, so the budget is low
  S("blk_cave_wall", "Cave wall.glb", 700, 512),
  S("blk_cave_exit", "Cave exit.glb", 1100, 512),
  // what flies at the target in a ranged attack (old items 9018 to 9023); the originals have 10 000 triangles each
  S("proj_arrow", "Arrow.obj", 500, 256),
  S("proj_fire", "Fireball.obj", 600, 256),
  S("proj_ice", "Ice attack.obj", 600, 256),
  S("proj_magic", "Magic attack.obj", 600, 256),
  S("proj_physical", "Physical attack.obj", 600, 256),
  S("proj_poison", "Poison Cloud.obj", 600, 256),
  // what the animated monsters hold in their hands (MONSTER_DATA `anim_weapon`, `anim_shield`; `src/data/equipment.ts`), 1 000 triangles each in the original
  S("wpn_sword1", "Sword 1.glb", 600, 256),
  S("wpn_sword2", "Sword 2.glb", 600, 256),
  S("wpn_sword3", "Sword 3.glb", 600, 256),
  S("wpn_shield1", "Shield 1.glb", 600, 256),
  S("wpn_shield2", "Shield 2.glb", 600, 256),
  S("wpn_shield3", "Shield 3.glb", 600, 256),
  S("wpn_axe", "Axe.glb", 600, 256),
  S("wpn_hammer", "Battle Hammer.glb", 600, 256),
  ...campaignItemModels(),
];

/** Maps monster ids to their static model by reading the old entities.py (add_monster). */
export function readStaticMonsterMap(): Record<number, { model: string; scale: number; y: number }> {
  const text = readFileSync(join(OLD, "..", "entities.py"), "utf-8");
  const start = text.indexOf("def add_monster");
  const body = text.slice(start, start + 60000);
  const result: Record<number, { model: string; scale: number; y: number }> = {};
  const caseRe = /case (\d+):/g;
  const cases: { id: number; at: number }[] = [];
  for (let m = caseRe.exec(body); m; m = caseRe.exec(body)) cases.push({ id: Number(m[1]), at: m.index });
  cases.forEach((c, i) => {
    const block = body.slice(c.at, cases[i + 1]?.at ?? c.at + 4000);
    const model = /model='resources\/objects\/monster\/([^']+)'/.exec(block)?.[1];
    if (!model) return;
    const scale = Number(/scale=([\d.]+)\s*\*\s*scale/.exec(block)?.[1] ?? 1);
    const y = Number(/position=\([^,]+,\s*([\d.]+)\s*\*\s*scale/.exec(block)?.[1] ?? 1);
    result[c.id] = { model, scale, y };
  });
  return result;
}

export interface MonsterModel extends ModelInfo {
  animated: boolean;
  /** World scale (anim_scale for animated models, the static scale of the old add_monster otherwise). */
  scale: number;
  /** Height offset of static models (the old game positioned them by hand). */
  y: number;
}

/** One model per monster: the animated glb where the old game had one, else the static obj. */
export async function buildMonsters(profile: ModelProfile = "reduced"): Promise<Record<number, MonsterModel>> {
  const monsters = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "src", "data", "raw", "MONSTER_DATA.json"), "utf-8")) as Record<string, { name: string; anim_path?: string; anim_scale?: number }>;
  const staticMap = readStaticMonsterMap();
  const result: Record<number, MonsterModel> = {};
  const jobs = Object.entries(monsters).map(([id, m]) => ({ id: Number(id), ...m }));
  await pool(jobs, 3, async (job) => {
    const animSource = job.anim_path?.replace("resources/objects/", "");
    const stat = staticMap[job.id];
    if (animSource && existsSync(join(OBJ_DIR, animSource))) {
      const info = await buildModel(S(`monster_${job.id}`, animSource, 3500, 512, true), profile);
      if (info) result[job.id] = { ...info, animated: true, scale: job.anim_scale ?? 1, y: 0 };
    } else if (stat) {
      const info = await buildModel(S(`monster_${job.id}`, `monster/${stat.model}.obj`, 2500, 512), profile);
      if (info) result[job.id] = { ...info, animated: false, scale: stat.scale, y: stat.y };
    } else {
      // not wired up in the old add_monster: look for an obj whose name starts with the monster name
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const hit = readdirSync(join(OBJ_DIR, "monster")).find((f) => f.endsWith(".obj") && norm(f).startsWith(norm(job.name)));
      if (hit) {
        const info = await buildModel(S(`monster_${job.id}`, `monster/${hit}`, 2500, 512), profile);
        if (info) result[job.id] = { ...info, animated: false, scale: 1, y: 1 };
      } else console.warn(`  monster ${job.id} (${job.name}) has no model`);
    }
  });
  // the people of the campaign maps: the same rig, so the same renderer. Ids from PERSONA_BASE up, size and clip as in the old game
  await pool(Object.entries(PERSONAS), 3, async ([item, persona]) => {
    const source = `personas/animated/${persona.file}.glb`;
    if (!existsSync(join(OBJ_DIR, source))) {
      console.warn(`  persona ${item} (${persona.file}) has no animated model`);
      return;
    }
    const id = personaModelId(Number(item));
    const info = await buildModel(S(`monster_${id}`, source, 3500, 512, true), profile);
    if (info) result[id] = { ...info, animated: true, scale: persona.scale, y: 0 };
  });
  return result;
}

export async function buildAllModels(only?: string, profile: ModelProfile = "reduced"): Promise<Record<string, ModelInfo>> {
  const registry: Record<string, ModelInfo> = {};
  const specs = STATIC_MODELS.filter((s) => !only || s.key.startsWith(only));
  await pool(specs, 3, async (spec) => {
    const info = await buildModel(spec, profile);
    if (info) registry[spec.key] = info;
  });
  return registry;
}

if (process.argv[1]?.endsWith("build-models.ts")) {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const profile: ModelProfile = process.argv.includes("--original") ? "original" : "reduced";
  const registry = await buildAllModels(only, profile);
  let bytes = 0;
  let tris = 0;
  for (const [key, info] of Object.entries(registry).sort()) {
    bytes += info.bytes;
    tris += info.tris;
    console.log(`${key.padEnd(24)} ${String(info.tris).padStart(6)} tris ${String(Math.round(info.bytes / 1024)).padStart(6)} KB`);
  }
  console.log(`static: ${Object.keys(registry).length} models, ${tris} tris, ${mb(bytes)} MB`);
  // a partial build (--only) updates its entries and keeps the others
  const registryFile = join(OUT, PROFILES[profile].staticRegistry);
  const previous = only && existsSync(registryFile) ? (JSON.parse(readFileSync(registryFile, "utf-8")) as Record<string, ModelInfo>) : {};
  writeFileSync(registryFile, JSON.stringify({ ...previous, ...registry }, null, 1));
  if (!only) {
    const monsters = await buildMonsters(profile);
    let mBytes = 0;
    for (const m of Object.values(monsters)) mBytes += m.bytes;
    const animated = Object.values(monsters).filter((m) => m.animated).length;
    console.log(`monsters: ${Object.keys(monsters).length} models (${animated} animated), ${mb(mBytes)} MB`);
    writeFileSync(join(OUT, PROFILES[profile].monsterRegistry), JSON.stringify(monsters, null, 1));
    pruneStale(new Set([...Object.keys(registry), ...Object.keys(monsters).map((id) => `monster_${id}`)]), profile);
  }
}
