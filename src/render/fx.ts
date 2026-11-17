import type { Camera } from "@babylonjs/core/Cameras/camera";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { ShoreFoam } from "./foam";
import { type Blend, additiveMaterial, sheetTexture } from "./fxMaterials";
import { lightAt } from "./fxLight";
import type { LampFx } from "./lamps";
import { type CellUv, EFFECT_LEVELS, type EffectsLevel, FOUNTAIN_SHAPES, FX_FILES, IMPACT_FRAMES, IMPACT_GRID, IMPACT_KINDS, type ImpactKind, PARTICLE_CELLS, PARTICLE_GRID, type FountainShape, cellUv } from "./fxSheets";
import type { PropInstance } from "./terrainMesher";
import type { World } from "../world/world";

/**
 * The cheap effects: the water of the fountains, and what a spell does where it lands. Everything is drawn as quads of pictures (`fxSheets.ts`): ONE mesh for all
 * the pale additive particles, one for the drops (the user's blue drop, drawn by its alpha), one per impact element, and per fountain a disc (the lit water), a sheet of
 * blue water (an open cone, or the thin stream of the mermaid's horn). No particle system, no render pass, no light of the lamp pool.
 *
 * The water follows the light of the scene like the stone of the fountain does (`lightAt`): in the sun it is as bright as it was, in a dark place only the party's torch or a lamp shows it,
 * and far from them it is dark (the first version shone in the dark, bug_fix_68). Quads are rebuilt on the CPU every frame (some hundred at the most), the meshes are never culled
 * and never sorted (the additive ones do not care for the order).
 */

const RANGE = 42;
const MAX_DT = 0.1;
/** How far an impact is moved towards the camera, so that it stands in front of the monster it hits and not inside it. */
const IMPACT_TOWARDS_EYE = 0.7;
const IMPACT_SIZE = 3.4;
const IMPACT_SECONDS = 0.6;
/** Pale blue of the pale water particles (mist, rings); the grey sprites are multiplied by it. */
const WATER: readonly [number, number, number] = [0.72, 0.9, 1];
const GRAVITY = 9;
/** How fast the light of a fountain follows the light of the scene (per second): a torch that goes out or a lamp that comes close does not make the water jump. */
const LIGHT_FOLLOW = 7;
/** How far from the party a lamp still shows a halo (it fades out over the last 45 %), and how near it must be to throw off sparks, smoke and the like. */
const LAMP_FX_REACH = 30;
const LAMP_FX_EMIT = 20;

/** A number from a lamp's key, so that two lamps do not flicker in step. */
function keyPhase(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 6283;
  return h / 1000;
}

/** A tiny deterministic generator: the effects are only to look at, but a screenshot should come out the same twice. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Quads of one picture in one dynamic mesh. The colour of a quad (vertex colour) multiplies the picture: that is the tint and the fade. */
class QuadBatch {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly uvs: Float32Array;
  private readonly colours: Float32Array;
  private count = 0;
  private drawn = 0;

  constructor(scene: Scene, name: string, texture: Texture, readonly capacity: number, blend: Blend = "add", vertexAlpha = false) {
    this.positions = new Float32Array(capacity * 12);
    this.uvs = new Float32Array(capacity * 8);
    this.colours = new Float32Array(capacity * 16).fill(1);
    const indices = new Uint16Array(capacity * 6);
    for (let i = 0; i < capacity; i++) indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const data = new VertexData();
    data.positions = this.positions;
    data.uvs = this.uvs;
    data.colors = this.colours;
    data.indices = indices;
    this.mesh = new Mesh(name, scene);
    data.applyToMesh(this.mesh, true);
    this.mesh.material = additiveMaterial(scene, name, texture, blend);
    // (smoke fades by the alpha of its quad, the others by their colour)
    this.mesh.hasVertexAlpha = vertexAlpha;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.doNotSyncBoundingInfo = true;
    this.mesh.setEnabled(false);
  }

  start(): void {
    this.count = 0;
  }

  get full(): boolean {
    return this.count >= this.capacity;
  }

  /** A quad around (x, y, z): (ax, ay, az) is the half-extent to the right, (bx, by, bz) the one upwards, both as world vectors; the colour multiplies the picture (tint and fade). */
  quad(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, uv: CellUv, r: number, g: number, bl: number, alpha = 1): void {
    if (this.count >= this.capacity) return;
    const p = this.positions;
    const o = this.count * 12;
    p[o] = x - ax - bx; p[o + 1] = y - ay - by; p[o + 2] = z - az - bz;
    p[o + 3] = x + ax - bx; p[o + 4] = y + ay - by; p[o + 5] = z + az - bz;
    p[o + 6] = x + ax + bx; p[o + 7] = y + ay + by; p[o + 8] = z + az + bz;
    p[o + 9] = x - ax + bx; p[o + 10] = y - ay + by; p[o + 11] = z - az + bz;
    const t = this.uvs;
    const u = this.count * 8;
    t[u] = uv.u0; t[u + 1] = uv.v0; t[u + 2] = uv.u1; t[u + 3] = uv.v0; t[u + 4] = uv.u1; t[u + 5] = uv.v1; t[u + 6] = uv.u0; t[u + 7] = uv.v1;
    const c = this.colours;
    const k = this.count * 16;
    for (let i = 0; i < 4; i++) {
      c[k + i * 4] = r;
      c[k + i * 4 + 1] = g;
      c[k + i * 4 + 2] = bl;
      c[k + i * 4 + 3] = alpha;
    }
    this.count++;
  }

  /** Uploads the quads of this frame (the ones of the last frame that are left over collapse to nothing). */
  finish(): void {
    for (let i = this.count; i < this.drawn; i++) this.positions.fill(0, i * 12, i * 12 + 12);
    if (this.count > 0 || this.drawn > 0) {
      this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions, false, false);
      this.mesh.updateVerticesData(VertexBuffer.UVKind, this.uvs, false, false);
      this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colours, false, false);
    }
    this.drawn = this.count;
    this.mesh.setEnabled(this.count > 0);
  }

  clear(): void {
    this.count = 0;
    this.finish();
  }
}

/** A fountain on the map: its water is drawn while the party is near. */
interface Site {
  owner: string;
  shape: FountainShape;
  /** Where the model stands: its lowest point is at (x, y, z). */
  x: number;
  y: number;
  z: number;
  /** The size of a model unit along each axis, and the turn about the vertical (the instance's). */
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  clock: { arc: number; foot: number; mist: number };
  /** How bright the scene is where the water is (0 to 1, `lightAt`), followed smoothly. */
  light: number;
  /** The lit water of the basin (tiered) or of the foot of the stream (horn), and the sheet of blue water. Each has geometry of its own (the colours are changed to follow the light). */
  disc: { mesh: Mesh; base: Float32Array; shown: number } | null;
  sheet: { mesh: Mesh; base: Float32Array; shown: number } | null;
}

/** A lamp as the effects see it (`Game.updateLamps` hands over every lamp in reach, not only the two that get a light): the halo round it, and what rises from it. */
export interface FxLamp {
  key: string;
  x: number;
  y: number;
  z: number;
  color: readonly [number, number, number];
  range?: number;
  fx?: LampFx;
  /** The size of the halo (world units across) instead of the one the range gives: lava glows over a whole tile. */
  glow?: number;
}

interface Particle {
  kind: "drop" | "puff" | "ring" | "smoke";
  cell: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  /** Size at the start and at the end (world units across; for a drop its height). */
  size0: number;
  size1: number;
  /** Peak brightness. */
  peak: number;
  /** A drop ends where it falls on the water: the height, and what it does there. */
  floor: number;
  lands: "ripple" | "small" | "none";
  scale: number;
  /** The fountain it belongs to: its light is the particle's (a particle of a lamp has none: it shines with its own colour, `tint`, and `lit` is the light of the place for the smoke). */
  site: Site | null;
  /** The colour of a particle that is not pale water, and the light that smoke takes at its place. */
  tint?: readonly [number, number, number];
  lit?: number;
}

interface Impact {
  kind: ImpactKind;
  x: number;
  y: number;
  z: number;
  t: number;
  /** World units across (the burst of a spell, a smaller splash for the water the party wades into). */
  size: number;
}

/** A point of a fountain model, in the world: `mx`, `mz` in the file's coordinates (the engine mirrors glTF in x), `my` in model units over the lowest point. */
function fountainPoint(site: Site, mx: number, my: number, mz: number): [number, number, number] {
  const lx = -mx * site.sx;
  const lz = mz * site.sz;
  const c = Math.cos(site.rotY);
  const s = Math.sin(site.rotY);
  return [site.x + lx * c + lz * s, site.y + my * site.sy, site.z - lx * s + lz * c];
}

/** The unit disc of the basin water: colour 1 in the middle, falling to 0 at the rim, so that the lit water has no edge. UVs are the plan position. */
function discData(): VertexData {
  const segments = 28;
  const rings: [number, number][] = [[0, 0.9], [0.5, 0.85], [0.8, 0.5], [1, 0]];
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const add = (r: number, k: number, a: number): void => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    pos.push(x, 0, z);
    col.push(k, k, k, 1);
    uv.push(x * 0.75 + 0.5, z * 0.75 + 0.5);
  };
  add(0, rings[0]![1], 0);
  for (let ring = 1; ring < rings.length; ring++) for (let i = 0; i < segments; i++) add(rings[ring]![0], rings[ring]![1], (i / segments) * Math.PI * 2);
  const at = (ring: number, i: number): number => 1 + (ring - 1) * segments + (i % segments);
  for (let i = 0; i < segments; i++) idx.push(0, at(1, i), at(1, i + 1));
  for (let ring = 1; ring < rings.length - 1; ring++) {
    for (let i = 0; i < segments; i++) idx.push(at(ring, i), at(ring + 1, i), at(ring + 1, i + 1), at(ring, i), at(ring + 1, i + 1), at(ring, i + 1));
  }
  const data = new VertexData();
  data.positions = pos;
  data.colors = col;
  data.uvs = uv;
  data.indices = idx;
  return data;
}

/** What the flow picture looks like on average (alpha-weighted, 0 to 1): a vertex colour of `water / FLOW_PICTURE` turns it into the colour of the water. */
const FLOW_PICTURE: readonly [number, number, number] = [0.37, 0.62, 0.94];
/** The drops are see-through, and a fifth of what they were (the user, 17. 11. 2026). */
const DROP_ALPHA = 0.55;
const DROP_SHRINK = 0.2;

/**
 * The open sheet of water that runs down, a surface of revolution: `profile` gives height and distance from the axis (model units) from the top to the bottom, the mesh is made for
 * `topY` to `bottomY` (height 1 from y = 0 down to y = -1, the radii as they are, so the instance's scale makes world units of both) with the streaks of the flow picture around it
 * (`wraps` times round, the picture runs once down it). The colour is that of `water`, a little darker at the bottom, where the water is thinner.
 */
function sheetData(profile: readonly (readonly [number, number])[], topY: number, bottomY: number, water: readonly [number, number, number], segments = 24, wraps = 2): VertexData {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rows = profile.length;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [y, r] of profile) {
      const t = (topY - y) / (topY - bottomY);
      const shade = 1 - 0.14 * t;
      pos.push(c * r, -t, s * r);
      col.push((water[0] / FLOW_PICTURE[0]) * shade, (water[1] / FLOW_PICTURE[1]) * shade, (water[2] / FLOW_PICTURE[2]) * shade, 1);
      uv.push((i / segments) * wraps, 1 - t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < rows - 1; k++) {
      const a = i * rows + k;
      const b = (i + 1) * rows + k;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const data = new VertexData();
  data.positions = pos;
  data.colors = col;
  data.uvs = uv;
  data.indices = idx;
  return data;
}

/** What `PropRenderer` tells about the props that come and go: the fountains among them get their water. */
export interface PropWatcher {
  set(owner: string, props: readonly PropInstance[]): void;
  remove(owner: string): void;
}

export class Effects implements PropWatcher {
  private level: EffectsLevel;
  private ready = false;
  private main: QuadBatch | null = null;
  private drops: QuadBatch | null = null;
  private smoke: QuadBatch | null = null;
  private lamps: readonly FxLamp[] = [];
  /** How bright the sky is (0 night, 1 day): by day the halos of the lamps are faint. */
  private day = 0;
  private impactBatches = new Map<ImpactKind, QuadBatch>();
  private rippleTexture: Texture | null = null;
  private flowTexture: Texture | null = null;
  private waterMaterial: StandardMaterial | null = null;
  private flowMaterial: StandardMaterial | null = null;
  private readonly sites = new Map<string, Site>();
  private particles: Particle[] = [];
  private impacts: Impact[] = [];
  private clock = 0;
  private readonly random = rng(0x5eed);
  private readonly foam: ShoreFoam;

  constructor(
    private readonly scene: Scene,
    level: EffectsLevel,
  ) {
    this.level = level;
    this.foam = new ShoreFoam(scene);
  }

  get active(): boolean {
    return this.level !== "off";
  }

  // ---- the foam of the shore: the chunks of the overworld ask for theirs (`ChunkManager`) and give it back

  /** The foam of one overworld chunk, or null (the effects are off, or no water of the chunk touches land). */
  shoreFoam(world: World, cx: number, cy: number): Mesh | null {
    return this.level === "off" ? null : this.foam.build(world, cx, cy);
  }

  releaseFoam(mesh: Mesh): void {
    this.foam.release(mesh);
  }

  setLevel(level: EffectsLevel): void {
    if (!EFFECT_LEVELS.includes(level) || level === this.level) return;
    this.level = level;
    if (level === "off") this.hideAll();
  }

  // ---- fountains: PropRenderer reports every owner's props, the fountains are kept by their place

  set(owner: string, props: readonly PropInstance[]): void {
    const found: Site[] = [];
    for (const p of props) {
      const shape = FOUNTAIN_SHAPES[p.model];
      if (!shape) continue;
      const key = `${owner}|${p.model}@${p.x.toFixed(2)},${p.z.toFixed(2)}`;
      const old = this.sites.get(key);
      if (old) {
        old.y = p.y;
        found.push(old);
        continue;
      }
      const [sx, sy, sz] = p.scaleXYZ ?? [p.scale, p.scale, p.scale];
      const site: Site = { owner, shape, x: p.x, y: p.y, z: p.z, sx, sy, sz, rotY: p.rotY, clock: { arc: 0, foot: 0, mist: 0 }, light: -1, disc: null, sheet: null };
      this.sites.set(key, site);
      found.push(site);
    }
    // the fountains this owner had before that are not among the props any more
    for (const [key, site] of this.sites) {
      if (site.owner === owner && !found.includes(site)) this.dropSite(key, site);
    }
  }

  remove(owner: string): void {
    for (const [key, site] of this.sites) if (site.owner === owner) this.dropSite(key, site);
  }

  private dropSite(key: string, site: Site): void {
    site.disc?.mesh.dispose(false, false);
    site.sheet?.mesh.dispose(false, false);
    this.sites.delete(key);
  }

  // ---- spells

  /** The element of a spell strikes at `at`: a burst of 16 frames in the middle of the point of impact. */
  impact(kind: ImpactKind, at: { x: number; y: number; z: number }, size = IMPACT_SIZE): void {
    if (this.level === "off") return;
    this.ensure();
    if (this.impacts.length < 24) this.impacts.push({ kind, x: at.x, y: at.y, z: at.z, t: 0, size });
  }

  /** Forgets what is in the air (a scene change). The fountains belong to their owners and go with them. */
  clear(): void {
    this.particles = [];
    this.impacts = [];
    this.main?.clear();
    this.drops?.clear();
    this.smoke?.clear();
    for (const b of this.impactBatches.values()) b.clear();
  }

  // ---- lamps: a halo round every lamp in reach, and what rises from it

  /** The lamps in reach of the party (every frame, from `Game.updateLamps`) and how bright the sky is. */
  setLamps(lamps: readonly FxLamp[], day: number): void {
    this.lamps = lamps;
    this.day = day;
  }

  private hideAll(): void {
    this.clear();
    for (const s of this.sites.values()) {
      s.disc?.mesh.setEnabled(false);
      s.sheet?.mesh.setEnabled(false);
    }
  }

  /** Loads the pictures and builds the meshes the first time something is shown (a game with the effects off never asks for them). */
  private ensure(): void {
    if (this.ready) return;
    this.ready = true;
    this.main = new QuadBatch(this.scene, "fx:particles", sheetTexture(this.scene, FX_FILES.particles, false), 420);
    this.drops = new QuadBatch(this.scene, "fx:drops", sheetTexture(this.scene, FX_FILES.drop, false), 200, "combine", true);
    this.smoke = new QuadBatch(this.scene, "fx:smoke", sheetTexture(this.scene, FX_FILES.smoke, false), 80, "combine", true);
    for (const kind of IMPACT_KINDS) this.impactBatches.set(kind, new QuadBatch(this.scene, `fx:impact:${kind}`, sheetTexture(this.scene, FX_FILES.impact[kind], false), 12, "combine"));
    this.rippleTexture = sheetTexture(this.scene, FX_FILES.ripple, true);
    this.flowTexture = sheetTexture(this.scene, FX_FILES.flow, true);
    this.waterMaterial = additiveMaterial(this.scene, "fx:water-disc", this.rippleTexture);
    this.flowMaterial = additiveMaterial(this.scene, "fx:water-flow", this.flowTexture, "combine");
  }

  /** The mesh of a fountain's disc or sheet: its own geometry (the colours change with the light), the material shared. */
  private makeMesh(name: string, data: VertexData, material: StandardMaterial): { mesh: Mesh; base: Float32Array; shown: number } {
    const mesh = new Mesh(name, this.scene);
    data.applyToMesh(mesh, true);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    return { mesh, base: Float32Array.from(data.colors as number[]), shown: -1 };
  }

  /** Sets the colours of a disc or sheet to its own colours times the light (only when the light has changed visibly). */
  private tint(part: { mesh: Mesh; base: Float32Array; shown: number }, light: number): void {
    if (Math.abs(part.shown - light) < 0.012) return;
    part.shown = light;
    const colours = new Float32Array(part.base.length);
    for (let i = 0; i < colours.length; i += 4) {
      colours[i] = part.base[i]! * light;
      colours[i + 1] = part.base[i + 1]! * light;
      colours[i + 2] = part.base[i + 2]! * light;
      colours[i + 3] = 1;
    }
    part.mesh.updateVerticesData(VertexBuffer.ColorKind, colours, false, false);
  }

  update(dtSeconds: number): void {
    const dt = Math.min(MAX_DT, dtSeconds);
    if (this.level === "off") return;
    const camera = this.scene.activeCamera;
    if (camera) this.foam.animate(dt, camera.globalPosition);
    const idle = this.sites.size === 0 && this.particles.length === 0 && this.impacts.length === 0 && this.lamps.length === 0;
    if (!camera || idle) {
      if (this.ready && this.main && this.main.mesh.isEnabled()) this.clear();
      return;
    }
    this.ensure();
    this.clock += dt;
    const main = this.main!;
    const drops = this.drops!;
    const smoke = this.smoke!;
    main.start();
    drops.start();
    smoke.start();
    for (const b of this.impactBatches.values()) b.start();
    const view = viewAxes(camera);
    this.updateSites(dt, camera);
    this.updateLamps(dt, camera, view);
    this.updateParticles(dt, view);
    this.updateImpacts(dt, camera, view);
    main.finish();
    drops.finish();
    smoke.finish();
    for (const b of this.impactBatches.values()) b.finish();
    // the water of the basin shines with its own picture, which slides over it; the sheet of water runs down
    if (this.rippleTexture) {
      this.rippleTexture.uOffset = this.clock * 0.035;
      this.rippleTexture.vOffset = this.clock * 0.022;
    }
    if (this.flowTexture) this.flowTexture.vOffset = this.clock * 1.1;
  }

  // ---- fountains

  private updateSites(dt: number, camera: Camera): void {
    const full = this.level === "full";
    const cam = camera.globalPosition;
    for (const site of this.sites.values()) {
      const near = (site.x - cam.x) ** 2 + (site.z - cam.z) ** 2 < RANGE * RANGE;
      if (!near) {
        site.disc?.mesh.setEnabled(false);
        site.sheet?.mesh.setEnabled(false);
        continue;
      }
      if (!site.sheet) this.buildSite(site);
      site.disc!.mesh.setEnabled(true);
      site.sheet!.mesh.setEnabled(true);
      // the light where the water is, followed smoothly (the first time: at once)
      const at = fountainPoint(site, site.shape.kind === "horn" ? site.shape.spoutX : 0, site.shape.basinY + 0.35, site.shape.kind === "horn" ? site.shape.spoutZ : 0);
      // (to the power of 1.5: the stone of the fountain is lit at a slant and has a colour of its own, so it is darker than the light on it, and the water must not stand out from it in a dim place)
      const target = lightAt(this.scene, at[0], at[1], at[2]) ** 1.5;
      site.light = site.light < 0 ? target : site.light + (target - site.light) * Math.min(1, dt * LIGHT_FOLLOW);
      this.tint(site.disc!, site.light);
      this.tint(site.sheet!, site.light);
      this.emit(site, dt, full);
    }
  }

  /** Builds the meshes of a fountain and puts them where its water is. */
  private buildSite(site: Site): void {
    const shape = site.shape;
    site.disc = this.makeMesh(`fx:disc:${site.owner}`, discData(), this.waterMaterial!);
    if (shape.kind === "tiered") {
      // the lit water of the basin, and the sheet of water from the rim of the urn over the faces down into the basin (`flow`: nowhere inside the stone)
      const water = fountainPoint(site, 0, shape.basinY, 0);
      site.disc.mesh.position.set(water[0], water[1] + 0.03, water[2]);
      site.disc.mesh.scaling.set(shape.basinR * site.sx, 1, shape.basinR * site.sz);
      site.sheet = this.makeMesh(`fx:sheet:${site.owner}`, sheetData(shape.flow, shape.topY, shape.basinY, shape.water), this.flowMaterial!);
      const rim = fountainPoint(site, 0, shape.topY, 0);
      site.sheet.mesh.position.set(rim[0], rim[1], rim[2]);
      site.sheet.mesh.scaling.set(site.sx, (shape.topY - shape.basinY) * site.sy, site.sz);
    } else {
      // the glow where the stream falls into the water, and the stream itself: a thin sheet round the model's own column, from a little below its top, narrowing towards the water
      const foot = fountainPoint(site, shape.spoutX, shape.basinY, shape.spoutZ);
      site.disc.mesh.position.set(foot[0], foot[1] + 0.03, foot[2]);
      site.disc.mesh.scaling.set(0.11 * site.sx, 1, 0.11 * site.sz);
      const profile = [[shape.streamTopY, shape.streamTopR], [shape.basinY, shape.streamFootR]] as const;
      site.sheet = this.makeMesh(`fx:sheet:${site.owner}`, sheetData(profile, shape.streamTopY, shape.basinY, shape.water, 12, 1), this.flowMaterial!);
      const top = fountainPoint(site, shape.spoutX, shape.streamTopY, shape.spoutZ);
      site.sheet.mesh.position.set(top[0], top[1], top[2]);
      site.sheet.mesh.scaling.set(site.sx, (shape.streamTopY - shape.basinY) * site.sy, site.sz);
    }
  }

  /** A drop leaves `from` and lands on `to`: the parabola with the given upward speed that meets it. */
  private throwDrop(site: Site, from: readonly [number, number, number], to: readonly [number, number, number], up: number, size: number, lands: Particle["lands"]): void {
    const fall = Math.max(0.05, from[1] - to[1]);
    const time = (up + Math.sqrt(up * up + 2 * GRAVITY * fall)) / GRAVITY;
    this.particles.push({
      kind: "drop", cell: PARTICLE_CELLS.drop_teardrop, x: from[0], y: from[1], z: from[2], vx: (to[0] - from[0]) / time, vy: up, vz: (to[2] - from[2]) / time,
      age: 0, life: time + 0.8, size0: size, size1: size, peak: 1, floor: to[1], lands, scale: site.sy, site,
    });
  }

  /** A ring that spreads over the water where something falls into it. */
  private ring(site: Site, x: number, y: number, z: number, big: boolean): void {
    // (flat on the water, so the width of the model counts, not its height; the ring of the small mermaid fountain is smaller)
    const across = (site.sx + site.sz) / 2;
    const unit = across * (site.shape.kind === "horn" ? 0.35 : 1);
    // a ring never spreads beyond the water: its outer edge stops at the wall of the basin
    const centre = fountainPoint(site, 0, 0, 0);
    const room = Math.max(0.02, site.shape.basinR * across * 0.96 - Math.hypot(x - centre[0], z - centre[2]));
    const size1 = Math.min((big ? 0.6 : 0.3) * unit, room * 2);
    this.particles.push({
      kind: "ring", cell: PARTICLE_CELLS.ripple_ring, x, y: y + 0.04, z, vx: 0, vy: 0, vz: 0, age: 0, life: big ? 1.1 : 0.7,
      size0: Math.min((big ? 0.12 : 0.08) * unit, size1), size1, peak: big ? 0.55 : 0.4, floor: -1e9, lands: "none", scale: site.sy, site,
    });
  }

  private emit(site: Site, dt: number, full: boolean): void {
    const { shape, sy, clock } = site;
    const r = this.random;
    if (shape.kind === "tiered") {
      // the drops leave the rim of the urn and fly in an arc, over the faces, into the basin
      clock.arc += dt * (full ? 13 : 6);
      while (clock.arc >= 1) {
        clock.arc -= 1;
        const a = r() * Math.PI * 2;
        const reach = 0.4 + 0.1 * r();
        const from = fountainPoint(site, Math.cos(a) * 0.02, shape.topY, Math.sin(a) * 0.02);
        const to = fountainPoint(site, Math.cos(a) * reach, shape.basinY, Math.sin(a) * reach);
        this.throwDrop(site, from, to, (1.1 + 0.5 * r()) * Math.sqrt(sy), 0.17 * sy * DROP_SHRINK, full ? "ripple" : "none");
      }
      // where the sheet of water enters the basin: rings round the foot of it
      clock.foot += dt * (full ? 9 : 4);
      while (clock.foot >= 1) {
        clock.foot -= 1;
        const a = r() * Math.PI * 2;
        const at = fountainPoint(site, Math.cos(a) * shape.footR, shape.basinY, Math.sin(a) * shape.footR);
        this.ring(site, at[0], at[1], at[2], true);
      }
      if (full) {
        // mist over the basin where the water lands
        clock.mist += dt * 3.2;
        while (clock.mist >= 1) {
          clock.mist -= 1;
          const a = r() * Math.PI * 2;
          const rad = shape.footR - 0.04 + r() * 0.08;
          const cell = [PARTICLE_CELLS.mist_a, PARTICLE_CELLS.mist_b, PARTICLE_CELLS.mist_c][Math.floor(r() * 3)]!;
          const at = fountainPoint(site, Math.cos(a) * rad, shape.basinY + 0.12, Math.sin(a) * rad);
          this.particles.push({
            kind: "puff", cell, x: at[0], y: at[1], z: at[2], vx: Math.cos(a) * 0.08, vy: 0.22, vz: Math.sin(a) * 0.08, age: 0, life: 2.4 + r(), size0: 0.4 * sy, size1: 1.1 * sy, peak: 0.16,
            floor: -1e9, lands: "none", scale: sy, site,
          });
        }
      }
      return;
    }
    // the jug: drops fall from its mouth (no upward throw: they drip and fall, drifting a little to the side) into the water beside the stream, and rings where the stream and the drops fall in
    clock.arc += dt * (full ? 11 : 5);
    while (clock.arc >= 1) {
      clock.arc -= 1;
      const along = shape.throwR * (0.3 + 0.9 * r());
      const side = (r() - 0.5) * 0.06;
      const from = fountainPoint(site, shape.spoutX + (r() - 0.5) * 0.02, shape.mouthY, shape.spoutZ + (r() - 0.5) * 0.02);
      const to = fountainPoint(site, shape.spoutX + shape.throwX * along - shape.throwZ * side, shape.basinY, shape.spoutZ + shape.throwZ * along + shape.throwX * side);
      this.throwDrop(site, from, to, 0, 0.075 * sy * DROP_SHRINK, full ? "ripple" : "none");
    }
    clock.foot += dt * (full ? 8 : 4);
    while (clock.foot >= 1) {
      clock.foot -= 1;
      const a = r() * Math.PI * 2;
      const at = fountainPoint(site, shape.spoutX + Math.cos(a) * 0.05, shape.basinY, shape.spoutZ + Math.sin(a) * 0.05);
      this.ring(site, at[0], at[1], at[2], false);
    }
    if (full) {
      clock.mist += dt * 1.6;
      while (clock.mist >= 1) {
        clock.mist -= 1;
        const a = r() * Math.PI * 2;
        const cell = [PARTICLE_CELLS.mist_a, PARTICLE_CELLS.mist_b, PARTICLE_CELLS.mist_c][Math.floor(r() * 3)]!;
        const at = fountainPoint(site, shape.spoutX + Math.cos(a) * 0.06, shape.basinY + 0.06, shape.spoutZ + Math.sin(a) * 0.06);
        this.particles.push({
          kind: "puff", cell, x: at[0], y: at[1], z: at[2], vx: Math.cos(a) * 0.05, vy: 0.18, vz: Math.sin(a) * 0.05, age: 0, life: 2 + r(), size0: 0.12 * sy, size1: 0.3 * sy, peak: 0.14,
          floor: -1e9, lands: "none", scale: sy, site,
        });
      }
    }
  }

  // ---- the halos and what rises from the lamps

  private updateLamps(dt: number, camera: Camera, view: ViewAxes): void {
    if (this.lamps.length === 0) return;
    const main = this.main!;
    const cam = camera.globalPosition;
    const full = this.level === "full";
    // by day a halo is faint (the sky outshines it), at night and underground it is the whole of it
    const strength = 1 - 0.72 * this.day;
    for (const l of this.lamps) {
      const d = Math.hypot(l.x - cam.x, l.z - cam.z);
      if (d > LAMP_FX_REACH) continue;
      const near = 1 - smooth(LAMP_FX_REACH * 0.55, LAMP_FX_REACH, d);
      // a flame breathes
      const flicker = l.fx === "torch" || l.fx === "lava" ? 0.86 + 0.14 * Math.sin(this.clock * 13 + keyPhase(l.key)) * Math.sin(this.clock * 4.3 + keyPhase(l.key) * 0.7) : 1;
      const k = 0.5 * strength * near * flicker;
      const size = l.glow ?? Math.min(2.6, Math.max(0.6, (l.range ?? 5) * 0.16));
      const cell = l.fx === "crystal" || l.fx === "magic" || l.fx === "portal" ? PARTICLE_CELLS.soft_star : PARTICLE_CELLS.dot;
      const h = size / 2;
      if (!main.full) main.quad(l.x, l.y, l.z, view.rx * h, view.ry * h, view.rz * h, view.ux * h, view.uy * h, view.uz * h, cellUv(cell, PARTICLE_GRID), l.color[0] * k, l.color[1] * k, l.color[2] * k);
      if (full && l.fx && d < LAMP_FX_EMIT) this.emitLamp(l, dt, strength);
    }
  }

  /** What a lamp throws off: sparks and smoke of a flame, embers of lava, bubbles of acid, wisps of magic, glints of a crystal, motes of a portal, twinkles of gold. */
  private emitLamp(l: FxLamp, dt: number, strength: number): void {
    const r = this.random;
    const roll = (perSecond: number): boolean => r() < perSecond * dt;
    const add = (cell: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size0: number, size1: number, peak: number, tint: readonly [number, number, number]): void => {
      this.particles.push({ kind: "puff", cell, x, y, z, vx, vy, vz, age: 0, life, size0, size1, peak, floor: -1e9, lands: "none", scale: 1, site: null, tint: [tint[0] * strength, tint[1] * strength, tint[2] * strength] });
    };
    const around = (radius: number): [number, number] => {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * radius;
      return [Math.cos(a) * rad, Math.sin(a) * rad];
    };
    switch (l.fx) {
      case "torch": {
        if (roll(2.4)) add(PARTICLE_CELLS.spark, l.x + (r() - 0.5) * 0.12, l.y, l.z + (r() - 0.5) * 0.12, (r() - 0.5) * 0.3, 0.8 + r() * 0.9, (r() - 0.5) * 0.3, 0.7 + r() * 0.7, 0.14, 0.04, 0.95, [1, 0.72, 0.36]);
        if (roll(0.55) && !this.smoke!.full) {
          const lit = lightAt(this.scene, l.x, l.y + 0.4, l.z);
          this.particles.push({
            kind: "smoke", cell: Math.floor(r() * SMOKE_PUFFS), x: l.x + (r() - 0.5) * 0.1, y: l.y + 0.2, z: l.z + (r() - 0.5) * 0.1, vx: (r() - 0.5) * 0.25, vy: 0.5 + r() * 0.3, vz: (r() - 0.5) * 0.25,
            age: 0, life: 2.6 + r() * 1.2, size0: 0.22, size1: 1.1, peak: 0.34, floor: -1e9, lands: "none", scale: 1, site: null, lit,
          });
        }
        break;
      }
      case "lava": {
        if (roll(1.6)) {
          const [ox, oz] = around(0.5);
          add(PARTICLE_CELLS.dot, l.x + ox, l.y, l.z + oz, (r() - 0.5) * 0.2, 0.6 + r() * 0.8, (r() - 0.5) * 0.2, 1 + r() * 1.1, 0.12, 0.03, 1, [1, 0.5, 0.16]);
        }
        break;
      }
      case "acid": {
        if (roll(1.1)) {
          const [ox, oz] = around(0.45);
          add(PARTICLE_CELLS.acid_bubble, l.x + ox, l.y, l.z + oz, 0, 0.4 + r() * 0.4, 0, 1.6 + r(), 0.12, 0.2, 0.7, [0.55, 1, 0.25]);
        }
        break;
      }
      case "magic": {
        if (roll(1.3)) {
          const [ox, oz] = around(0.35);
          add(PARTICLE_CELLS.magic_wisp, l.x + ox, l.y, l.z + oz, (r() - 0.5) * 0.2, 0.4 + r() * 0.4, (r() - 0.5) * 0.2, 1.4 + r() * 0.8, 0.22, 0.12, 0.7, [0.78, 0.5, 1]);
        }
        break;
      }
      case "crystal": {
        if (roll(0.9)) {
          const [ox, oz] = around(0.35);
          add(PARTICLE_CELLS.frost_glint, l.x + ox, l.y + (r() - 0.5) * 0.7, l.z + oz, 0, 0, 0, 0.9, 0.3, 0.3, 1, [0.5, 0.95, 1]);
        }
        break;
      }
      case "portal": {
        if (roll(3)) {
          // a mote that leaves the rim of the portal and drifts up, turning round it
          const a = r() * Math.PI * 2;
          add(PARTICLE_CELLS.soft_star, l.x + Math.cos(a) * 0.55, l.y - 0.6 + r() * 1.2, l.z + Math.sin(a) * 0.55, -Math.sin(a) * 0.35, 0.3 + r() * 0.3, Math.cos(a) * 0.35, 1.4, 0.16, 0.05, 0.8, [0.6, 0.72, 1]);
        }
        break;
      }
      case "gold": {
        if (roll(1)) {
          const [ox, oz] = around(0.4);
          add(PARTICLE_CELLS.cross_glint, l.x + ox, l.y + (r() - 0.3) * 0.6, l.z + oz, 0, 0.1, 0, 1, 0.26, 0.26, 1, [1, 0.86, 0.42]);
        }
        break;
      }
    }
  }

  // ---- particles

  private updateParticles(dt: number, view: ViewAxes): void {
    const main = this.main!;
    const drops = this.drops!;
    const live: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.kind === "drop") {
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y <= p.floor && p.vy < 0) {
          this.land(p);
          continue;
        }
      } else if (p.kind === "puff" || p.kind === "smoke") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      live.push(p);
      const t = p.age / p.life;
      // (a particle of a fountain is as bright as the scene is where the fountain stands: no glowing water in the dark; what a lamp throws off shines in the colour of the lamp)
      const lit = p.site ? Math.max(0, p.site.light) : (p.lit ?? 1);
      if (p.kind === "smoke") {
        // grey smoke, drawn by its alpha: darker where the place is dark, it thins out as it rises
        if (this.smoke!.full) continue;
        const a = p.peak * smooth(0, 0.2, t) * (1 - smooth(0.4, 1, t));
        const size = p.size0 + (p.size1 - p.size0) * t;
        const h = size / 2;
        const grey = 0.62 * lit;
        this.smoke!.quad(p.x, p.y, p.z, view.rx * h, view.ry * h, view.rz * h, view.ux * h, view.uy * h, view.uz * h, smokeUv(p.cell), grey, grey, grey * 1.04, a);
        continue;
      }
      if (p.kind === "drop") {
        if (drops.full) continue;
        // the tip trails: the picture is turned so that its point faces against the motion on the screen
        const sr = p.vx * view.rx + p.vy * view.ry + p.vz * view.rz;
        const su = p.vx * view.ux + p.vy * view.uy + p.vz * view.uz;
        const len = Math.hypot(sr, su) || 1;
        const dx = -sr / len;
        const dy = -su / len;
        // (the user's drop is 148 x 256: a little more than half as wide as it is high)
        const hw = p.size0 * 0.29;
        const hh = p.size0 * 0.5;
        drops.quad(
          p.x, p.y, p.z,
          (view.rx * dy - view.ux * dx) * hw, (view.ry * dy - view.uy * dx) * hw, (view.rz * dy - view.uz * dx) * hw,
          (view.rx * dx + view.ux * dy) * hh, (view.ry * dx + view.uy * dy) * hh, (view.rz * dx + view.uz * dy) * hh,
          FULL_PICTURE, lit, lit, lit, DROP_ALPHA,
        );
        continue;
      }
      if (main.full) continue;
      const fade = smooth(0, 0.18, t) * (1 - smooth(0.45, 1, t));
      const k = p.peak * fade * (p.site ? lit : 1);
      const size = p.size0 + (p.size1 - p.size0) * t;
      const uv = cellUv(p.cell, PARTICLE_GRID);
      const [cr, cg, cb] = p.tint ?? WATER;
      if (p.kind === "ring") {
        // flat on the water: the axes are the world's x and z
        main.quad(p.x, p.y, p.z, size / 2, 0, 0, 0, 0, size / 2, uv, cr * k, cg * k, cb * k);
      } else {
        const h = size / 2;
        main.quad(p.x, p.y, p.z, view.rx * h, view.ry * h, view.rz * h, view.ux * h, view.uy * h, view.uz * h, uv, cr * k, cg * k, cb * k);
      }
    }
    this.particles = live;
  }

  /** A drop reaches the water: a ring spreads over it, or only a small one when it falls into the upper bowl. */
  private land(p: Particle): void {
    if (p.lands === "none") return;
    const big = p.lands === "ripple";
    if (!p.site) return;
    this.ring(p.site, p.x, p.floor, p.z, big);
    if (big && this.random() < 0.45) {
      // a spray: one small drop thrown up that falls back
      this.particles.push({
        kind: "drop", cell: PARTICLE_CELLS.drop_round, x: p.x, y: p.floor + 0.02, z: p.z, vx: (this.random() - 0.5) * 0.5, vy: 1.3 + this.random() * 0.9, vz: (this.random() - 0.5) * 0.5, age: 0, life: 1.5,
        size0: 0.1 * p.scale * DROP_SHRINK, size1: 0.1 * p.scale * DROP_SHRINK, peak: 1, floor: p.floor, lands: "none", scale: p.scale, site: p.site,
      });
    }
  }

  // ---- impacts

  private updateImpacts(dt: number, camera: Camera, view: ViewAxes): void {
    const cam = camera.globalPosition;
    const live: Impact[] = [];
    for (const i of this.impacts) {
      i.t += dt;
      if (i.t >= IMPACT_SECONDS) continue;
      live.push(i);
      const batch = this.impactBatches.get(i.kind);
      if (!batch) continue;
      const frame = Math.min(IMPACT_FRAMES - 1, Math.floor((i.t / IMPACT_SECONDS) * IMPACT_FRAMES));
      // towards the eye in the plan, and no further than the eye is
      const dx = cam.x - i.x;
      const dz = cam.z - i.z;
      const d = Math.hypot(dx, dz) || 1;
      const move = Math.min(IMPACT_TOWARDS_EYE, d * 0.4);
      const h = i.size / 2;
      batch.quad(i.x + (dx / d) * move, i.y, i.z + (dz / d) * move, view.rx * h, view.ry * h, view.rz * h, view.ux * h, view.uy * h, view.uz * h, cellUv(frame, IMPACT_GRID), 1, 1, 1);
    }
    this.impacts = live;
  }

  dispose(): void {
    this.foam.dispose();
    this.hideAll();
    for (const [key, site] of this.sites) this.dropSite(key, site);
    this.main?.mesh.dispose(false, true);
    this.drops?.mesh.dispose(false, true);
    this.smoke?.mesh.dispose(false, true);
    this.smoke = null;
    for (const b of this.impactBatches.values()) b.mesh.dispose(false, true);
    this.waterMaterial?.dispose(false, true);
    this.flowMaterial?.dispose(false, true);
    this.rippleTexture?.dispose();
    this.flowTexture?.dispose();
    this.impactBatches.clear();
    this.main = null;
    this.drops = null;
    this.ready = false;
  }
}

/** The whole of a single picture. */
const FULL_PICTURE: CellUv = { u0: 0, u1: 1, v0: 0, v1: 1 };

/** The four puffs of the smoke picture lie side by side. */
const SMOKE_PUFFS = 3;
const smokeUv = (puff: number): CellUv => ({ u0: puff / 4, u1: (puff + 1) / 4, v0: 0, v1: 1 });

/** The camera's right and up directions in the world. */
interface ViewAxes {
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
}

function viewAxes(camera: Camera): ViewAxes {
  const m = camera.getWorldMatrix().m;
  return { rx: m[0]!, ry: m[1]!, rz: m[2]!, ux: m[4]!, uy: m[5]!, uz: m[6]! };
}
