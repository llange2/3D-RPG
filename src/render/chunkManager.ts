import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { CHUNK_SIZE } from "../world/types";
import type { World } from "../world/world";
import type { TerrainMaterials } from "./materials";
import type { PropRenderer } from "./props";
import { meshChunk, type PropInstance } from "./terrainMesher";
import type { Renderer } from "./engine";

interface LoadedChunk {
  cx: number;
  cy: number;
  mesh: Mesh;
  multi: MultiMaterial;
  props: PropInstance[];
  /** True while the chunk is drawn with the simple stand-in models. */
  detail: Detail;
}

/** What a chunk draws: everything, without the ground lumps (`nearOnly`), or also with the stand-in models for trees and mountains. */
type Detail = "full" | "thin" | "stand-in";

/**
 * Chunks within this Chebyshev distance of the party get the detailed prop models: every chunk the farthest view draws (3 chunks, sight 25 tiles). Two
 * made the outer ring stand-ins, and that ring begins 20 tiles out, inside the sight: the horizon showed simplified mountains and trees that turned
 * into the real ones one step later. Only the spare ring beyond the view (never seen, cut by the sight limit) still gets the stand-ins.
 */
const NEAR_CHUNKS = 3;
/** Ground lumps are low and the fog already veils them out there: beyond this many chunks the flat ground texture they stand on is all there is (they cost much). */
const LUMP_CHUNKS = 2;

function detailAt(dist: number): Detail {
  return dist > NEAR_CHUNKS ? "stand-in" : dist > LUMP_CHUNKS ? "thin" : "full";
}

function withLod(props: PropInstance[], detail: Detail): PropInstance[] {
  if (detail === "full") return props;
  const thin = props.filter((p) => !p.nearOnly);
  if (detail === "thin") return thin;
  // the stand-in has its own size: the tile model's per-axis scale (a mountain is taller than wide) must not stretch it
  return thin.map((p) => (p.lod ? { ...p, model: p.lod.model, scale: p.lod.scale, scaleXYZ: undefined, lod: undefined } : p));
}

export interface ChunkStats {
  loaded: number;
  triangles: number;
  lastBuildMs: number;
  maxBuildMs: number;
}

/**
 * Streams overworld chunks around the player: builds the nearest missing chunks (a time budget per frame keeps
 * the frame rate steady) and drops chunks that are too far away.
 */
export class ChunkManager {
  private readonly chunks = new Map<string, LoadedChunk>();
  private queue: { cx: number; cy: number; d: number }[] = [];
  private centre = { cx: Number.NaN, cy: Number.NaN };
  readonly stats: ChunkStats = { loaded: 0, triangles: 0, lastBuildMs: 0, maxBuildMs: 0 };

  constructor(
    private readonly world: World,
    private readonly r: Renderer,
    private readonly materials: TerrainMaterials,
    private readonly props: PropRenderer,
    /** Chunks loaded around the player in each direction. */
    public radius: number,
  ) {}

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  /** A new view distance: the next `update` re-plans around the party with it (chunks beyond the new radius go, missing ones are queued). */
  setRadius(radius: number): void {
    this.radius = radius;
    this.centre = { cx: Number.NaN, cy: Number.NaN };
  }

  /** Drops every chunk so the next `update` builds them again (the ground changed: 3D models or flat tiles). */
  rebuild(): void {
    for (const [k, c] of this.chunks) this.unload(k, c);
    this.queue = [];
    this.centre = { cx: Number.NaN, cy: Number.NaN };
  }

  /** Call whenever the player moved. Re-plans which chunks to load and unload. */
  update(tx: number, ty: number): void {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    if (cx === this.centre.cx && cy === this.centre.cy) return;
    this.centre = { cx, cy };
    this.queue = [];
    for (let dy = -this.radius; dy <= this.radius; dy++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        if (!this.chunks.has(this.key(cx + dx, cy + dy))) this.queue.push({ cx: cx + dx, cy: cy + dy, d: Math.max(Math.abs(dx), Math.abs(dy)) * 10 + Math.abs(dx) + Math.abs(dy) });
      }
    }
    this.queue.sort((a, b) => a.d - b.d);
    for (const [k, c] of this.chunks) {
      const dist = Math.max(Math.abs(c.cx - cx), Math.abs(c.cy - cy));
      if (dist > this.radius + 1) {
        this.unload(k, c);
        continue;
      }
      const detail = detailAt(dist);
      if (detail !== c.detail) {
        c.detail = detail;
        this.props.setInstances(k, withLod(c.props, detail));
      }
    }
  }

  /** Builds queued chunks until the time budget (ms) is spent. At least one chunk per call. */
  tick(budgetMs: number): void {
    const start = performance.now();
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (this.chunks.has(this.key(next.cx, next.cy))) continue;
      this.load(next.cx, next.cy);
      if (performance.now() - start >= budgetMs) break;
    }
    this.props.flush();
  }

  /** Builds every missing chunk right now (used for the first frame). */
  loadAll(): void {
    while (this.queue.length > 0) this.tick(1e9);
  }

  pending(): number {
    return this.queue.length;
  }

  private load(cx: number, cy: number): void {
    const t0 = performance.now();
    const geo = meshChunk(this.world, cx, cy);
    const mesh = new Mesh(`chunk:${cx},${cy}`, this.r.scene);
    const vd = new VertexData();
    vd.positions = geo.positions;
    vd.normals = geo.normals;
    vd.uvs = geo.uvs;
    vd.colors = geo.colors;
    vd.indices = geo.indices;
    vd.applyToMesh(mesh, false);
    mesh.hasVertexAlpha = false;
    const multi = new MultiMaterial(`chunkmat:${cx},${cy}`, this.r.scene);
    mesh.subMeshes = [];
    const vertexCount = geo.positions.length / 3;
    geo.groups.forEach((g, i) => {
      multi.subMaterials.push(this.materials.get(g.material));
      new SubMesh(i, 0, vertexCount, g.start, g.count, mesh);
    });
    mesh.material = multi;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    mesh.alwaysSelectAsActiveMesh = false;
    const detail = detailAt(Math.max(Math.abs(cx - this.centre.cx), Math.abs(cy - this.centre.cy)));
    this.chunks.set(this.key(cx, cy), { cx, cy, mesh, multi, props: geo.props, detail });
    this.props.setInstances(this.key(cx, cy), withLod(geo.props, detail));

    const ms = performance.now() - t0;
    this.stats.lastBuildMs = ms;
    this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
    this.stats.loaded = this.chunks.size;
    this.stats.triangles += geo.indices.length / 3;
  }

  private unload(key: string, c: LoadedChunk): void {
    this.stats.triangles -= (c.mesh.getTotalIndices() ?? 0) / 3;
    c.mesh.dispose(false, false);
    c.multi.dispose(false, false);
    this.props.removeOwner(key);
    this.chunks.delete(key);
    this.stats.loaded = this.chunks.size;
  }

  dispose(): void {
    for (const [k, c] of this.chunks) this.unload(k, c);
    this.queue = [];
  }
}
