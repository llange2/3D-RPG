import type { Camera } from "@babylonjs/core/Cameras/camera";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { assetUrl } from "./assets";
import { type CellUv, EFFECT_LEVELS, type EffectsLevel, FOUNTAIN_SHAPES, FX_FILES, IMPACT_FRAMES, IMPACT_GRID, IMPACT_KINDS, type ImpactKind, PARTICLE_CELLS, PARTICLE_GRID, type FountainShape, cellUv } from "./fxSheets";
import type { PropInstance } from "./terrainMesher";

/**
 * The cheap effects: the water of the town fountains, and what a spell does where it lands. Everything is drawn as quads of additive pictures (`fxSheets.ts`): ONE mesh for all
 * particles, one per impact element, and per fountain a disc (the lit water of the basin) and a cone (the water that runs over the rim). No particle system, no render pass,
 * no light of the lamp pool: the glow lives in the pictures. Quads are rebuilt on the CPU every frame (some hundred at the most), the meshes are never culled and never sorted
 * (additive blending does not care for the order).
 */

const RANGE = 42;
const MAX_DT = 0.1;
/** How far an impact is moved towards the camera, so that it stands in front of the monster it hits and not inside it. */
const IMPACT_TOWARDS_EYE = 0.7;
const IMPACT_SIZE = 3.4;
const IMPACT_SECONDS = 0.6;
/** Pale blue of water; the grey sprites are multiplied by it. */
const WATER: readonly [number, number, number] = [0.72, 0.9, 1];
const GRAVITY = 9;

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

/**
 * `add`: the picture is added to what is behind it (glows, water: they shine in the dark and in the sun, but add up to white on a bright sky). `combine`: it covers what is behind it by
 * its alpha (the impacts of the spells: in daylight the burst keeps its colour, acid stays green).
 */
type Blend = "add" | "combine";

function additiveMaterial(scene: Scene, name: string, texture: Texture, blend: Blend = "add"): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  // the colour is in the picture and the alpha is its intensity: SRC_ALPHA + ONE adds colour x alpha (as the glow lines do), the vertex colour tints and fades
  m.emissiveTexture = texture;
  m.opacityTexture = texture;
  m.alphaMode = blend === "add" ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.fogEnabled = false;
  m.zOffset = -2;
  return m;
}

function sheetTexture(scene: Scene, file: string, wrap: boolean): Texture {
  const t = new Texture(assetUrl(file), scene, false, true, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  t.hasAlpha = true;
  const mode = wrap ? Constants.TEXTURE_WRAP_ADDRESSMODE : Constants.TEXTURE_CLAMP_ADDRESSMODE;
  t.wrapU = mode;
  t.wrapV = mode;
  t.anisotropicFilteringLevel = 2;
  return t;
}

/** Quads of one picture in one dynamic mesh. The colour of a quad (vertex colour) multiplies the picture: that is the tint and the fade. */
class QuadBatch {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly uvs: Float32Array;
  private readonly colours: Float32Array;
  private count = 0;
  private drawn = 0;

  constructor(scene: Scene, name: string, texture: Texture, readonly capacity: number, blend: Blend = "add") {
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
  quad(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, uv: CellUv, r: number, g: number, bl: number): void {
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

interface Particle {
  kind: "drop" | "puff" | "ring";
  cell: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  /** Size at the start and at the end (world units across). */
  size0: number;
  size1: number;
  /** Peak brightness. */
  peak: number;
  /** A drop ends where it falls on the water: the height, and what it does there. */
  floor: number;
  lands: "ripple" | "small" | "none";
  scale: number;
}

interface Impact {
  kind: ImpactKind;
  x: number;
  y: number;
  z: number;
  t: number;
}

/** A fountain on the map: its water is drawn while the party is near. */
interface Site {
  owner: string;
  shape: FountainShape;
  x: number;
  y: number;
  z: number;
  /** World units of a model unit (the instance's scale). */
  s: number;
  clock: { jet: number; rim: number; mist: number };
  disc: Mesh | null;
  cone: Mesh | null;
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

/** The open cone of the water that runs over the rim of the upper bowl: height 1, radius 1 at the top and `spread` at the bottom, the streaks of the jet picture around it. */
function coneData(spread: number): VertexData {
  const segments = 24;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.push(c, 0, s, c * spread, -1, s * spread);
    col.push(0.34, 0.34, 0.34, 1, 0.16, 0.16, 0.16, 1);
    uv.push((i / segments) * 2, 1, (i / segments) * 2, 0);
  }
  for (let i = 0; i < segments; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
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
  private impactBatches = new Map<ImpactKind, QuadBatch>();
  private rippleTexture: Texture | null = null;
  private jetTexture: Texture | null = null;
  private discSource: Mesh | null = null;
  private coneSource: Mesh | null = null;
  private readonly sites = new Map<string, Site>();
  private particles: Particle[] = [];
  private impacts: Impact[] = [];
  private clock = 0;
  private readonly random = rng(0x5eed);

  constructor(
    private readonly scene: Scene,
    level: EffectsLevel,
  ) {
    this.level = level;
  }

  get active(): boolean {
    return this.level !== "off";
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
      const site: Site = { owner, shape, x: p.x, y: p.y, z: p.z, s: p.scaleXYZ?.[1] ?? p.scale, clock: { jet: 0, rim: 0, mist: 0 }, disc: null, cone: null };
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
    site.disc?.dispose(false, false);
    site.cone?.dispose(false, false);
    this.sites.delete(key);
  }

  // ---- spells

  /** The element of a spell strikes at `at`: a burst of 16 frames in the middle of the point of impact. */
  impact(kind: ImpactKind, at: { x: number; y: number; z: number }): void {
    if (this.level === "off") return;
    this.ensure();
    if (this.impacts.length < 24) this.impacts.push({ kind, x: at.x, y: at.y, z: at.z, t: 0 });
  }

  /** Forgets what is in the air (a scene change). The fountains belong to their owners and go with them. */
  clear(): void {
    this.particles = [];
    this.impacts = [];
    this.main?.clear();
    for (const b of this.impactBatches.values()) b.clear();
  }

  private hideAll(): void {
    this.clear();
    for (const s of this.sites.values()) {
      s.disc?.setEnabled(false);
      s.cone?.setEnabled(false);
    }
  }

  /** Loads the pictures and builds the meshes the first time something is shown (a game with the effects off never asks for them). */
  private ensure(): void {
    if (this.ready) return;
    this.ready = true;
    this.main = new QuadBatch(this.scene, "fx:particles", sheetTexture(this.scene, FX_FILES.particles, false), 360);
    for (const kind of IMPACT_KINDS) this.impactBatches.set(kind, new QuadBatch(this.scene, `fx:impact:${kind}`, sheetTexture(this.scene, FX_FILES.impact[kind], false), 12, "combine"));
    this.rippleTexture = sheetTexture(this.scene, FX_FILES.ripple, true);
    this.jetTexture = sheetTexture(this.scene, FX_FILES.jet, true);
    const disc = new Mesh("fx:water-disc", this.scene);
    discData().applyToMesh(disc);
    disc.material = additiveMaterial(this.scene, "fx:water-disc", this.rippleTexture);
    const cone = new Mesh("fx:water-cone", this.scene);
    coneData(1.18).applyToMesh(cone);
    cone.material = additiveMaterial(this.scene, "fx:water-cone", this.jetTexture);
    for (const m of [disc, cone]) {
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = true;
      m.doNotSyncBoundingInfo = true;
      m.setEnabled(false);
    }
    this.discSource = disc;
    this.coneSource = cone;
  }

  update(dtSeconds: number): void {
    const dt = Math.min(MAX_DT, dtSeconds);
    if (this.level === "off") return;
    const camera = this.scene.activeCamera;
    const idle = this.sites.size === 0 && this.particles.length === 0 && this.impacts.length === 0;
    if (!camera || idle) {
      if (this.ready && this.main && this.main.mesh.isEnabled()) this.clear();
      return;
    }
    this.ensure();
    this.clock += dt;
    const main = this.main!;
    main.start();
    for (const b of this.impactBatches.values()) b.start();
    const view = viewAxes(camera);
    this.updateSites(dt, camera);
    this.updateParticles(dt, view);
    this.updateImpacts(dt, camera, view);
    main.finish();
    for (const b of this.impactBatches.values()) b.finish();
    // the water of the basin shines with its own picture, which slides over it; the streaks run down
    if (this.rippleTexture) {
      this.rippleTexture.uOffset = this.clock * 0.035;
      this.rippleTexture.vOffset = this.clock * 0.022;
    }
    if (this.jetTexture) this.jetTexture.vOffset = this.clock * 1.5;
  }

  // ---- fountains

  private updateSites(dt: number, camera: Camera): void {
    const full = this.level === "full";
    const cam = camera.globalPosition;
    for (const site of this.sites.values()) {
      const near = (site.x - cam.x) ** 2 + (site.z - cam.z) ** 2 < RANGE * RANGE;
      if (!near) {
        site.disc?.setEnabled(false);
        site.cone?.setEnabled(false);
        continue;
      }
      const { shape, s } = site;
      if (!site.disc) {
        site.disc = this.discSource!.clone(`fx:disc:${site.owner}`);
        site.cone = this.coneSource!.clone(`fx:cone:${site.owner}`);
        site.disc.position.set(site.x, site.y + shape.basinY * s + 0.03, site.z);
        site.disc.scaling.set(shape.basinR * s, 1, shape.basinR * s);
        site.cone.position.set(site.x, site.y + shape.upperY * s, site.z);
        site.cone.scaling.set(shape.upperR * 1.15 * s, (shape.upperY - shape.basinY) * s, shape.upperR * 1.15 * s);
      }
      site.disc.setEnabled(true);
      site.cone!.setEnabled(true);
      this.emit(site, dt, full);
    }
  }

  private emit(site: Site, dt: number, full: boolean): void {
    const { shape, s, clock } = site;
    const r = this.random;
    // the jet from the finial: drops that go up a little and fall back into the upper bowl
    clock.jet += dt * (full ? 16 : 7);
    while (clock.jet >= 1) {
      clock.jet -= 1;
      const a = r() * Math.PI * 2;
      const out = r() * 0.35 * s;
      this.particles.push({
        kind: "drop", cell: PARTICLE_CELLS.drop_teardrop, x: site.x + Math.cos(a) * 0.04 * s, y: site.y + shape.topY * s, z: site.z + Math.sin(a) * 0.04 * s,
        vx: Math.cos(a) * out, vy: (2.2 + r() * 1.1) * Math.sqrt(s), vz: Math.sin(a) * out, age: 0, life: 2, size0: 0.12 * s, size1: 0.12 * s, peak: 0.95,
        floor: site.y + (shape.upperY - 0.04) * s, lands: full ? "small" : "none", scale: s,
      });
    }
    // the water over the rim of the upper bowl: drops that fall into the basin and ring it
    clock.rim += dt * (full ? 15 : 6);
    while (clock.rim >= 1) {
      clock.rim -= 1;
      const a = r() * Math.PI * 2;
      const ring = shape.upperR * 1.2 * s;
      this.particles.push({
        kind: "drop", cell: PARTICLE_CELLS.drop_teardrop, x: site.x + Math.cos(a) * ring, y: site.y + shape.upperY * s, z: site.z + Math.sin(a) * ring,
        vx: Math.cos(a) * 0.25, vy: 0, vz: Math.sin(a) * 0.25, age: 0, life: 2, size0: 0.17 * s, size1: 0.17 * s, peak: 0.9,
        floor: site.y + shape.basinY * s + 0.04, lands: full ? "ripple" : "none", scale: s,
      });
    }
    if (full) {
      // mist over the basin where the water lands
      clock.mist += dt * 3.2;
      while (clock.mist >= 1) {
        clock.mist -= 1;
        const a = r() * Math.PI * 2;
        const rad = shape.upperR * 1.3 * s + r() * 0.15 * s;
        const cell = [PARTICLE_CELLS.mist_a, PARTICLE_CELLS.mist_b, PARTICLE_CELLS.mist_c][Math.floor(r() * 3)]!;
        this.particles.push({
          kind: "puff", cell, x: site.x + Math.cos(a) * rad, y: site.y + (shape.basinY + 0.12) * s, z: site.z + Math.sin(a) * rad,
          vx: Math.cos(a) * 0.08, vy: 0.22, vz: Math.sin(a) * 0.08, age: 0, life: 2.4 + r(), size0: 0.4 * s, size1: 1.1 * s, peak: 0.16, floor: -1e9, lands: "none", scale: s,
        });
      }
    }
  }

  // ---- particles

  private updateParticles(dt: number, view: ViewAxes): void {
    const main = this.main!;
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
      } else if (p.kind === "puff") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      live.push(p);
      if (main.full) continue;
      const t = p.age / p.life;
      const fade = p.kind === "drop" ? 1 : smooth(0, 0.18, t) * (1 - smooth(0.45, 1, t));
      const k = p.peak * fade;
      const size = p.size0 + (p.size1 - p.size0) * t;
      const uv = cellUv(p.cell, PARTICLE_GRID);
      if (p.kind === "ring") {
        // flat on the water: the axes are the world's x and z
        main.quad(p.x, p.y, p.z, size / 2, 0, 0, 0, 0, size / 2, uv, WATER[0] * k, WATER[1] * k, WATER[2] * k);
      } else if (p.kind === "drop") {
        // the tip trails: the picture is turned so that its point faces against the motion on the screen
        const sr = p.vx * view.rx + p.vy * view.ry + p.vz * view.rz;
        const su = p.vx * view.ux + p.vy * view.uy + p.vz * view.uz;
        const len = Math.hypot(sr, su) || 1;
        const dx = -sr / len;
        const dy = -su / len;
        const hw = size * 0.32;
        const hh = size * 0.55;
        main.quad(
          p.x, p.y, p.z,
          (view.rx * dy - view.ux * dx) * hw, (view.ry * dy - view.uy * dx) * hw, (view.rz * dy - view.uz * dx) * hw,
          (view.rx * dx + view.ux * dy) * hh, (view.ry * dx + view.uy * dy) * hh, (view.rz * dx + view.uz * dy) * hh,
          uv, WATER[0] * k, WATER[1] * k, WATER[2] * k,
        );
      } else {
        const h = size / 2;
        main.quad(p.x, p.y, p.z, view.rx * h, view.ry * h, view.rz * h, view.ux * h, view.uy * h, view.uz * h, uv, WATER[0] * k, WATER[1] * k, WATER[2] * k);
      }
    }
    this.particles = live;
  }

  /** A drop reaches the water: a ring spreads over it, or only a small one when it falls into the upper bowl. */
  private land(p: Particle): void {
    if (p.lands === "none") return;
    const big = p.lands === "ripple";
    this.particles.push({
      kind: "ring", cell: PARTICLE_CELLS.ripple_ring, x: p.x, y: p.floor + 0.01, z: p.z, vx: 0, vy: 0, vz: 0, age: 0, life: big ? 1.1 : 0.7,
      size0: (big ? 0.12 : 0.08) * p.scale, size1: (big ? 0.6 : 0.3) * p.scale, peak: big ? 0.55 : 0.4, floor: -1e9, lands: "none", scale: p.scale,
    });
    if (big && this.random() < 0.45) {
      // a spray: one small drop thrown up that falls back
      this.particles.push({
        kind: "drop", cell: PARTICLE_CELLS.drop_round, x: p.x, y: p.floor + 0.02, z: p.z, vx: (this.random() - 0.5) * 0.5, vy: 1.3 + this.random() * 0.9, vz: (this.random() - 0.5) * 0.5, age: 0, life: 1.5,
        size0: 0.08 * p.scale, size1: 0.08 * p.scale, peak: 0.8, floor: p.floor, lands: "none", scale: p.scale,
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
      const h = IMPACT_SIZE / 2;
      batch.quad(i.x + (dx / d) * move, i.y, i.z + (dz / d) * move, view.rx * h, view.ry * h, view.rz * h, view.ux * h, view.uy * h, view.uz * h, cellUv(frame, IMPACT_GRID), 1, 1, 1);
    }
    this.impacts = live;
  }

  dispose(): void {
    this.hideAll();
    for (const [key, site] of this.sites) this.dropSite(key, site);
    this.main?.mesh.dispose(false, true);
    for (const b of this.impactBatches.values()) b.mesh.dispose(false, true);
    this.discSource?.dispose(false, true);
    this.coneSource?.dispose(false, true);
    this.rippleTexture?.dispose();
    this.jetTexture?.dispose();
    this.impactBatches.clear();
    this.main = null;
    this.ready = false;
  }
}

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
