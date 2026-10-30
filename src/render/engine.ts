import { Engine } from "@babylonjs/core/Engines/engine";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { NO_SIGHT_LIMIT, registerSightLimit, setSight } from "./sightLimit";

/** `low` renders the picture at two thirds of its size per side and lets the browser scale it up. */
export type Resolution = "normal" | "low";
export const RESOLUTION_SCALING: Record<Resolution, number> = { normal: 1, low: 1.5 };

export interface Atmosphere {
  fogColor: string;
  fogDensity: number;
  /** Linear fog (world units from the eye: clear up to `start`, fully fogged at `end`) instead of the exponential `fogDensity`. */
  fogRange?: { start: number; end: number } | null;
  /** 0 = night, 1 = full day. Even the night keeps a faint glow (`NIGHT_GLOW`): the stones are only just to be made out. */
  light: number;
  ambient: string;
  /** No sky overhead (dungeons, caves): the day does not reach here, the hemisphere keeps only a faint glow. */
  underground: boolean;
  /** The light the party carries: it lights a ring around the party and nothing beyond (`range` in world units, a cell is 3). Intensity 0 = none. */
  torch: { intensity: number; range: number };
}

/** How many lamps (map objects that give light) can light the scene at once: the nearest ones to the party. */
export const LAMP_LIGHTS = 2;
/** The reach of a lamp's light in world units (a cell is 3), unless the lamp says otherwise. */
export const LAMP_RANGE = 5;

export interface Renderer {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  hemi: HemisphericLight;
  sun: DirectionalLight;
  torch: PointLight;
  /** A small pool of point lights that `Game` hands to the nearest lamps; disabled (no cost beyond the shader variant) while the map has no lamps. */
  lamps: PointLight[];
  /** Renders at another size from now on (the page keeps running). */
  setResolution(resolution: Resolution): void;
  setAtmosphere(a: Atmosphere): void;
}

/** The far plane where no linear fog sets it (interiors, closed maps). */
const SIGHT_FAR = 900;

/** How far the world is drawn: how many chunks around the party and how thick the fog is. */
export type ViewDistance = "close" | "medium" | "far";
export const VIEW_DISTANCES: readonly ViewDistance[] = ["close", "medium", "far"];

/** The farthest the world is seen, in tiles, by view distance (the user's figures); everything below follows from it. */
export const VIEW_TILES: Record<ViewDistance, number> = { close: 10, medium: 18, far: 25 };

/** Chunks (10 tiles each) drawn around the party in every direction: the nearest edge is at least 10, 20 and 30 tiles out, so the fog (fully closed at 10, 18 and 25 tiles) hides it. */
export const VIEW_CHUNKS: Record<ViewDistance, number> = { close: 1, medium: 2, far: 3 };
export const chunkRadius = (view: ViewDistance): number => VIEW_CHUNKS[view];

/** Share of the interiors' windows of models (cave rock, floor cobbles, the open campaign maps, 26 tiles wide) that stays drawn: 10, 18 and 25 tiles. */
export const VIEW_SHARE: Record<ViewDistance, number> = { close: 0.4, medium: 0.7, far: 1 };

/**
 * The fog of the open overworld by view distance, in world units (a tile is 3): fully fogged at `VIEW_TILES` (10, 18 and 25 tiles), clear for
 * the first 70 %, so nothing is seen farther and the edge of what is drawn never shows. Linear for all three; the biome's exponential fog
 * only reaches interiors now.
 */
export const VIEW_FOG_RANGE: Record<ViewDistance, { start: number; end: number } | null> = {
  close: { start: 21, end: 30 },
  medium: { start: 38, end: 54 },
  far: { start: 52, end: 75 },
};

/** `?view=close|medium|far` beats the stored choice (for tools and shared links). */
export function readViewDistance(stored: ViewDistance = "medium"): ViewDistance {
  const v = new URLSearchParams(location.search).get("view");
  return v === "close" || v === "medium" || v === "far" ? v : stored;
}

const hex = (c: string): Color3 => Color3.FromHexString(c);

/** Colour of the old game's daylight (see `setAtmosphere`). */
const DAYLIGHT = new Color3(1.15, 0.85, 0.68);
const DUNGEON_GROUND = new Color3(0.28, 0.26, 0.24);
/** Brightness of the hemisphere light at night and underground, where only the party's own light really shows things (the day was 0.12 at its darkest). */
export const NIGHT_GLOW = 0.06;

export function createRenderer(canvas: HTMLCanvasElement, resolution: Resolution = "normal"): Renderer {
  registerSightLimit();
  const engine = new Engine(canvas, true, { powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: false }, true);
  engine.setHardwareScalingLevel(RESOLUTION_SCALING[resolution]);
  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;
  scene.autoClearDepthAndStencil = true;
  scene.fogMode = Scene.FOGMODE_EXP2;

  const camera = new UniversalCamera("camera", new Vector3(0, 1.7, 0), scene);
  camera.fov = 1.15;
  camera.minZ = 0.1;
  camera.maxZ = SIGHT_FAR;
  camera.inputs.clear(); // the game drives the camera itself
  camera.rotation = new Vector3(0, 0, 0);
  let sightRange = NO_SIGHT_LIMIT;
  scene.onBeforeRenderObservable.add(() => setSight(camera.position.x, camera.position.y, camera.position.z, sightRange));

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.groundColor = DUNGEON_GROUND;
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, -0.3), scene);
  sun.intensity = 0.55;
  const torch = new PointLight("torch", new Vector3(0, 2, 0), scene);
  torch.range = 22;
  torch.intensity = 0;
  torch.diffuse = new Color3(1, 0.82, 0.55);
  const lamps = Array.from({ length: LAMP_LIGHTS }, (_, i) => {
    const lamp = new PointLight(`lamp${i}`, new Vector3(0, 3, 0), scene);
    lamp.intensity = 0;
    lamp.range = LAMP_RANGE;
    lamp.setEnabled(false);
    return lamp;
  });
  // the shader of a standard material takes four lights by default: hemisphere, sun, the party's light and the lamps are more
  scene.onNewMaterialAddedObservable.add((m) => {
    if (m instanceof StandardMaterial) m.maxSimultaneousLights = 6;
  });

  const r: Renderer = {
    engine,
    scene,
    camera,
    hemi,
    sun,
    torch,
    lamps,
    setResolution(resolution) {
      engine.setHardwareScalingLevel(RESOLUTION_SCALING[resolution]);
    },
    setAtmosphere(a) {
      scene.fogColor = Color3.FromHexString(a.fogColor);
      // changing the fog mode recompiles the shaders, so only touch it when it differs
      const mode = a.fogRange ? Scene.FOGMODE_LINEAR : Scene.FOGMODE_EXP2;
      if (scene.fogMode !== mode) scene.fogMode = mode;
      if (a.fogRange) {
        scene.fogStart = a.fogRange.start;
        scene.fogEnd = a.fogRange.end;
      } else scene.fogDensity = a.fogDensity;
      scene.clearColor = new Color4(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b, 1);
      // beyond the fog's end everything is fog colour, which still showed as pale shapes against the sky (castles at the edge of the drawn chunks):
      // the far plane and `sightLimit` cut there (by depth and by distance), so nothing is seen farther than the view distance
      camera.maxZ = a.fogRange ? a.fogRange.end : SIGHT_FAR;
      sightRange = a.fogRange ? a.fogRange.end : NO_SIGHT_LIMIT;
      const amb = hex(a.ambient);
      torch.intensity = a.torch.intensity;
      torch.range = a.torch.range;
      if (a.underground) {
        // underground: only the party's light shows anything. Beyond it the stones are barely to be made out, as in the old
        // game without the Light spell (screenshot 17 of the old game is nearly black, 18 shows the lit ring around the party)
        hemi.diffuse = amb;
        hemi.groundColor = DUNGEON_GROUND;
        hemi.intensity = NIGHT_GLOW;
        hemi.specular = Color3.Black();
        sun.diffuse = amb;
        sun.intensity = 0;
        return;
      }
      // daylight, measured on the old game's screenshots (town square and meadow): its sun is warm and strong, the ground
      // textures come out about as bright as they are (a little less blue) and the walls only about 12 % darker than the floors.
      // So the sky and the ground of the hemisphere are the same warm colour (vertical faces get as much as flat ones) and the
      // sun only adds a little on top. The shader clamps the light to 1 per channel, so red above 1 only keeps the walls from
      // falling behind the floor.
      const warm = amb.multiply(DAYLIGHT);
      hemi.diffuse = warm;
      hemi.groundColor = warm;
      hemi.specular = Color3.Black();
      hemi.intensity = NIGHT_GLOW + (1 - NIGHT_GLOW) * a.light;
      sun.diffuse = warm;
      sun.intensity = 0.13 * a.light;
    },
  };
  window.addEventListener("resize", () => engine.resize());
  return r;
}
