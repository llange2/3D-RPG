import { flipWinding } from "./winding";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/Rendering/outlineRenderer"; // registers `renderOverlay`, the tint of a monster in another dimension
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import { equipmentModel } from "../data/equipment";
import { MONSTERS } from "../data/tables";
import { assetUrl, type MonsterModelInfo, type StaticModelInfo } from "./assets";
import { GRIP_Y, holdInHand, type Hand } from "./equipment";
import { toStandardMaterial } from "./props";

const ATTACK_NAMES = ["Charged_Upward_Slash", "Left_Slash", "Axe_Spin_Attack", "Archery_Shot_1", "mage_soell_cast_3", "mage_soell_cast_4", "Charged_Spell_Cast_1", "Sweeping_Kick"];
const IDLE_NAMES = ["Alert", "Idle_11", "Idle_9", "Idle_3"];
/** How long a monster takes to walk one tile; the game times a monster's attack after its step by it. */
export const MONSTER_STEP_SECONDS = 0.28;
const MOVE_SECONDS = MONSTER_STEP_SECONDS;
/** Gravity pulls a monster to the party in this time, without a walking clip. */
export const PULL_SECONDS = 0.2;
/** Dimensional Phasing: a monster in the other dimension is purple and half transparent. */
const PHASE_COLOR = new Color3(0.62, 0.22, 0.95);
const PHASE_ALPHA = 0.5;

/**
 * Flying monsters among the static models (the animated ones all walk): the height of the middle of the body above the floor.
 * Without an entry a static model stands on the floor. The old game hung these at the height of the heroes' eyes (origin 2.0
 * for the vampire bat, 1.6 for the screamer, 1.7 for the vulture roc); the camera here is at 1.7.
 */
const HOVER: Record<number, number> = { 62: 1.6, 74: 1.7, 75: 1.7 };

/** The height of the party's eyes above the floor (the camera in `engine.ts`). */
const EYE_LEVEL = 1.7;

/**
 * Static monsters without feet (heads, hands, eyes, ghosts, wizards on a cloud) float with their eyes at the height of the party's eyes, so that
 * the party looks them in the eye and the middle of the screen is where the monster looks. Where the eyes are in the model, as a share of its
 * height (0 the bottom, 1 the top), measured on the contact sheet of `npm run sheet:monsters`. A monster with feet stands on the floor.
 */
export const EYES_AT: Readonly<Record<number, number>> = {
  7: 0.5, // Carnage Hand (no eyes: the middle of the palm)
  15: 0.64, // Death Agent
  23: 0.59, // Evil Eye
  28: 0.84, // Ghost
  34: 0.66, // Guardian
  43: 0.58, // Medusa
  48: 0.57, // Mystic cloud
  52: 0.88, // Oh No Bug
  56: 0.55, // Phase Head
  66: 0.79, // Sorcerer
  67: 0.58, // Spirit Shield
  69: 0.59, // Terminator
  77: 0.82, // Wicked Witch
  84: 0.65, // Eye Master
};

/**
 * Factor on a monster's colour texture. The old paint is dark, and some monsters are nearly black (the Moo Master's robe averages 0.08,
 * the vampires' 0.10): under the party's torch they read as unlit. A texture below the target is lifted towards it, the rest keeps the
 * factor of 1.3 that every monster had.
 */
const MONSTER_BASE_BOOST = 1.3;
const MONSTER_TARGET_MEAN = 0.34;
const MONSTER_MAX_BOOST = 3.2;
export const monsterBoost = (mean?: number): number => (mean === undefined || mean <= 0 ? MONSTER_BASE_BOOST : Math.max(MONSTER_BASE_BOOST, Math.min(MONSTER_MAX_BOOST, MONSTER_TARGET_MEAN / mean)));

interface View {
  uid: string;
  holder: TransformNode;
  groups: AnimationGroup[];
  skeletons: Skeleton[];
  animated: boolean;
  /** How far the holder's origin sits above the ground height it is given (the model's origin is its middle, not its feet, when static). */
  lift: number;
  /** Hangs in the air instead of standing (see HOVER). */
  hovers: boolean;
  info: MonsterModelInfo;
  /** A person of a campaign map: keeps the direction of its cell and loops the clip it was given, instead of turning to the party. */
  npc: NpcLook | null;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  t: number;
  walking: boolean;
  dying: number | null;
  attackUntil: number;
  bobSeed: number;
  /** A monster that appears out of nowhere (an ambush) fades in: seconds so far and in all. Null once it is solid. */
  fade: { t: number; seconds: number } | null;
  /** In another dimension (Dimensional Phasing): still, purple, half transparent. */
  phased: boolean;
  /** Seconds the current move takes when it is not a walk (Gravity); null for a step. */
  slide: number | null;
}

/** How a person of a campaign map stands: `yaw` in degrees (Babylon), `idle` the clip it loops. */
export interface NpcLook {
  yaw: number;
  idle: string;
}

/** Draws monsters: animated glb models with idle/walk/attack/dead clips, or static models that bob a little. */
export class MonsterRenderer {
  private readonly containers = new Map<number, Promise<AssetContainer | null>>();
  /** The weapons and shields (static models `wpn_*`), loaded once and instanced into every monster that holds one. */
  private readonly items = new Map<string, Promise<AssetContainer | null>>();
  private readonly views = new Map<string, View>();
  /** Views that are still waiting for their model (see `whenIdle`). */
  private readonly adding = new Set<Promise<void>>();
  private time = 0;

  constructor(
    private readonly scene: Scene,
    private readonly info: Record<string, MonsterModelInfo>,
    /** The registry of the static models, where the weapons and shields are. */
    private readonly staticInfo: Record<string, StaticModelInfo> = {},
  ) {}

  private item(key: string): Promise<AssetContainer | null> {
    let p = this.items.get(key);
    if (!p) {
      const info = this.staticInfo[key];
      p = info
        ? LoadAssetContainerAsync(assetUrl(info.file), this.scene).then((c) => {
            for (const m of c.meshes as Mesh[]) {
              if (m.material) m.material = toStandardMaterial(m.material as PBRMaterial | StandardMaterial, this.scene, monsterBoost(info.mean));
              m.isPickable = false;
            }
            return c;
          })
        : Promise.resolve(null);
      this.items.set(key, p);
    }
    return p;
  }

  /** What a monster holds, by hand: its weapon in the right, its shield in the left (MONSTER_DATA of the old game). */
  private async kit(defId: number): Promise<{ hand: Hand; container: AssetContainer; key: string }[]> {
    const def = MONSTERS[defId];
    const wanted: [Hand, string | null][] = [
      ["right", equipmentModel(def?.anim_weapon)],
      ["left", equipmentModel(def?.anim_shield)],
    ];
    const out: { hand: Hand; container: AssetContainer; key: string }[] = [];
    for (const [hand, key] of wanted) {
      const container = key ? await this.item(key) : null;
      if (container && key) out.push({ hand, container, key });
    }
    return out;
  }

  private container(defId: number): Promise<AssetContainer | null> {
    let p = this.containers.get(defId);
    if (!p) {
      const info = this.info[String(defId)];
      if (!info) {
        p = Promise.resolve(null);
      } else {
        p = LoadAssetContainerAsync(assetUrl(info.file), this.scene).then((c) => {
          for (const m of c.meshes as Mesh[]) {
            if (info.fromObj && m.getTotalVertices() > 0) flipWinding(m as Mesh);
            if (m.material) {
              const std = toStandardMaterial(m.material as PBRMaterial | StandardMaterial, this.scene, monsterBoost(info.mean));
              // no `twoSidedLighting`: after `flipWinding` it turns the normals of the outer faces inside out, and under the party's
              // torch the 45 monsters from OBJ files (Cobra Fiend, Cult Leader, ...) stayed black; in daylight it did not show
              if (info.fromObj) std.backFaceCulling = false;
              m.material = std;
            }
            m.isPickable = false;
            if (m.skeleton) m.alwaysSelectAsActiveMesh = true; // skinned bounds are not reliable
          }
          return c;
        });
      }
      this.containers.set(defId, p);
    }
    return p;
  }

  async preload(ids: number[]): Promise<void> {
    await Promise.all([...new Set(ids)].map((id) => Promise.all([this.container(id), this.kit(id)])));
  }

  has(uid: string): boolean {
    return this.views.has(uid);
  }

  /** Resolves when every `add` called so far has finished, so the loading screen can wait for the monsters of a new map. */
  async whenIdle(): Promise<void> {
    while (this.adding.size > 0) await Promise.allSettled([...this.adding]);
  }

  /** Whether the registry of the model set in use has a model for this id (the persona models only exist once the assets were rebuilt). */
  knows(defId: number): boolean {
    return this.info[String(defId)] !== undefined;
  }

  /** Creates the view of a monster at the given world position. Safe to call before the model has loaded. `npc` makes it a person who stands where he is put. */
  add(uid: string, defId: number, x: number, y: number, z: number, npc: NpcLook | null = null, fadeSeconds = 0): Promise<void> {
    const p: Promise<void> = this.create(uid, defId, x, y, z, npc, fadeSeconds).finally(() => this.adding.delete(p));
    this.adding.add(p);
    return p;
  }

  private async create(uid: string, defId: number, x: number, y: number, z: number, npc: NpcLook | null, fadeSeconds: number): Promise<void> {
    if (this.views.has(uid)) return;
    const info = this.info[String(defId)];
    const container = await this.container(defId);
    const kit = info?.animated ? await this.kit(defId) : [];
    if (!container || !info || this.views.has(uid)) return;
    const entries = container.instantiateModelsToScene((n) => `${uid}:${n}`, false);
    const holder = new TransformNode(`monster:${uid}`, this.scene);
    for (const root of entries.rootNodes) root.parent = holder;
    // the old game's `assign_item`: the weapon in the right hand, the shield in the left, hung under the hand joints of the skeleton so that they follow its clips
    for (const { hand, container: itemContainer, key } of kit) {
      const joint = holder.getDescendants(false, (n) => n.name === `${uid}:${hand === "right" ? "RightHand" : "LeftHand"}`)[0] as TransformNode | undefined;
      if (!joint) continue;
      const copy = itemContainer.instantiateModelsToScene((n) => `${uid}:${hand}:${n}`, false);
      for (const root of copy.rootNodes) {
        for (const mesh of root.getChildMeshes(true)) holdInHand(mesh, joint, hand, GRIP_Y[key] ?? 0);
        root.dispose();
      }
    }
    const scale = info.scale;
    holder.scaling.setAll(scale);
    const hover = info.animated ? undefined : HOVER[defId];
    const eyes = info.animated ? undefined : EYES_AT[defId];
    // a static model's origin is the middle of its mesh: standing means lifting it by its depth below the origin
    const lift = info.animated
      ? 0
      : eyes !== undefined
        ? EYE_LEVEL - (info.bounds[1] + eyes * (info.bounds[4] - info.bounds[1])) * scale
        : hover !== undefined
          ? hover - ((info.bounds[1] + info.bounds[4]) / 2) * scale
          : -info.bounds[1] * scale;
    holder.position.set(x, y + lift, z);
    const view: View = {
      uid,
      holder,
      groups: entries.animationGroups,
      skeletons: entries.skeletons,
      animated: info.animated,
      lift,
      hovers: hover !== undefined || eyes !== undefined,
      info,
      npc,
      from: { x, y: holder.position.y, z },
      to: { x, y: holder.position.y, z },
      t: 1,
      walking: false,
      dying: null,
      attackUntil: 0,
      bobSeed: Math.random() * 10,
      fade: fadeSeconds > 0 ? { t: 0, seconds: fadeSeconds } : null,
      phased: false,
      slide: null,
    };
    if (view.fade) this.setVisibility(view, 0);
    this.views.set(uid, view);
    for (const g of view.groups) g.stop();
    if (npc) holder.rotation.y = (npc.yaw * Math.PI) / 180;
    this.playIdle(view);
  }

  /**
   * Per mesh, not per material: the materials belong to the type of monster and are shared by every monster of it. (A mesh with a
   * visibility below 1 is drawn with alpha blending, so nothing else has to be switched.)
   */
  private setVisibility(view: View, visibility: number): void {
    for (const mesh of view.holder.getChildMeshes()) mesh.visibility = visibility;
  }

  private group(view: View, names: string[]): AnimationGroup | undefined {
    for (const n of names) {
      const g = view.groups.find((x) => x.name.includes(n));
      if (g) return g;
    }
    return undefined;
  }

  private playIdle(view: View): void {
    for (const g of view.groups) g.stop();
    // a person loops the clip the old game gave him (chatting, bowing, squatting), the others one of the idle clips
    const g = (view.npc ? this.group(view, [view.npc.idle]) : undefined) ?? this.group(view, IDLE_NAMES) ?? view.groups[0];
    g?.start(true, view.npc ? 1 : 0.8 + (view.bobSeed % 0.4));
  }

  /** Walks the monster to a new position (world coordinates). */
  moveTo(uid: string, x: number, y: number, z: number): void {
    const v = this.views.get(uid);
    if (!v) return;
    const yy = y + v.lift;
    v.from = { x: v.holder.position.x, y: v.holder.position.y, z: v.holder.position.z };
    v.to = { x, y: yy, z };
    v.t = 0;
    if (v.animated && !v.walking) {
      v.walking = true;
      for (const g of v.groups) g.stop();
      this.group(v, ["Walking"])?.start(true);
    }
  }

  /** Draws a monster to a new place in a moment, standing (Gravity): no walking clip, `PULL_SECONDS` long. */
  slideTo(uid: string, x: number, y: number, z: number, seconds = PULL_SECONDS): void {
    const v = this.views.get(uid);
    if (!v) return;
    v.from = { x: v.holder.position.x, y: v.holder.position.y, z: v.holder.position.z };
    v.to = { x, y: y + v.lift, z };
    v.t = 0;
    v.slide = seconds;
  }

  /**
   * Dimensional Phasing: the monster stops where it is (its clip is paused), turns purple and half transparent, and returns to normal
   * when it ends. The tint is an overlay and the transparency the mesh's own visibility, so the materials the type shares stay as they are.
   */
  setPhased(uid: string, on: boolean): void {
    const v = this.views.get(uid);
    if (!v || v.phased === on) return;
    v.phased = on;
    for (const mesh of v.holder.getChildMeshes()) {
      mesh.renderOverlay = on;
      if (on) {
        mesh.overlayColor = PHASE_COLOR;
        mesh.overlayAlpha = 0.4;
      }
      mesh.visibility = on ? PHASE_ALPHA : 1;
    }
    if (on) {
      v.walking = false;
      v.attackUntil = 0;
      for (const g of v.groups) g.pause();
    } else this.playIdle(v);
  }

  /** Teleports without animation. */
  place(uid: string, x: number, y: number, z: number): void {
    const v = this.views.get(uid);
    if (!v) return;
    const yy = y + v.lift;
    v.holder.position.set(x, yy, z);
    v.from = v.to = { x, y: yy, z };
    v.t = 1;
  }

  /** Where a shot at this monster should hit: the middle of its body, over the tile it walks to. Null when it has no view. */
  anchor(uid: string): { x: number; y: number; z: number } | null {
    const v = this.views.get(uid);
    if (!v) return null;
    const [, minY, , , maxY] = v.info.bounds;
    // `to.y` is the height of the model's origin; the old game aimed at a fixed height, a bat and a dragon need different ones
    const mid = ((minY + maxY) / 2) * v.info.scale;
    // a flyer's origin is already the middle of its body, so a shot goes there and not half a metre above
    return { x: v.to.x, y: v.to.y + (v.hovers ? mid : Math.min(2.2, Math.max(0.5, mid))), z: v.to.z };
  }

  attack(uid: string): void {
    const v = this.views.get(uid);
    if (!v || !v.animated) return;
    const g = this.group(v, ATTACK_NAMES);
    if (!g) return;
    for (const other of v.groups) other.stop();
    g.start(false);
    v.attackUntil = this.time + 1.1;
    v.walking = false;
  }

  /**
   * A monster falls: one with a death clip plays it to the end and is removed after it, one without (the static models and some animated
   * ones) is removed at once. `then` runs when it is gone, which is when its loot may appear.
   */
  die(uid: string, then: () => void): void {
    const v = this.views.get(uid);
    const dead = v ? this.group(v, ["Dead"]) : undefined;
    if (!v || !dead) {
      this.remove(uid);
      then();
      return;
    }
    v.dying = Number.POSITIVE_INFINITY;
    for (const g of v.groups) g.stop();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.remove(uid);
      then();
    };
    dead.onAnimationGroupEndObservable.addOnce(finish);
    dead.start(false);
    // the end event does not come while the page is hidden and not drawing, so the clip's length is the fallback
    const fps = dead.targetedAnimations[0]?.animation.framePerSecond || 30;
    setTimeout(finish, ((dead.to - dead.from) / fps) * 1000 + 600);
  }

  remove(uid: string): void {
    const v = this.views.get(uid);
    if (!v) return;
    for (const g of v.groups) g.dispose();
    // The materials and textures belong to the shared container: every monster of a type uses the same ones, so
    // disposing them here turns all other monsters of that type (and every later spawn) white or black.
    v.holder.dispose(false, false);
    for (const s of v.skeletons) s.dispose();
    this.views.delete(uid);
  }

  clear(): void {
    for (const uid of [...this.views.keys()]) this.remove(uid);
  }

  update(dt: number, camX: number, camZ: number): void {
    this.time += dt;
    for (const v of this.views.values()) {
      if (v.fade) {
        v.fade.t += dt;
        const done = v.fade.t >= v.fade.seconds;
        if (!v.phased) this.setVisibility(v, done ? 1 : v.fade.t / v.fade.seconds);
        if (done) v.fade = null;
      }
      if (v.t < 1) {
        v.t = Math.min(1, v.t + dt / (v.slide ?? MOVE_SECONDS));
        const e = v.t;
        v.holder.position.x = v.from.x + (v.to.x - v.from.x) * e;
        v.holder.position.y = v.from.y + (v.to.y - v.from.y) * e;
        v.holder.position.z = v.from.z + (v.to.z - v.from.z) * e;
        if (v.t >= 1) v.slide = null;
        if (v.t >= 1 && v.walking && v.dying === null) {
          v.walking = false;
          this.playIdle(v);
        }
      } else if (!v.animated && v.dying === null && !v.phased) {
        v.holder.position.y = v.to.y + Math.sin(this.time * 2 + v.bobSeed) * 0.05;
      }
      if (v.attackUntil > 0 && this.time > v.attackUntil && v.dying === null && !v.phased) {
        v.attackUntil = 0;
        this.playIdle(v);
      }
      if (v.dying === null && !v.npc) {
        // face the party. The loaded models look along +z: with the former atan2(-dx, -dz) every one of the 91 showed its
        // back (checked model by model in the browser)
        const dx = camX - v.holder.position.x;
        const dz = camZ - v.holder.position.z;
        v.holder.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  count(): number {
    return this.views.size;
  }
}
