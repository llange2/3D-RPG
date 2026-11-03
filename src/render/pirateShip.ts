import type { PropInstance } from "./terrainMesher";
import type { PropRenderer } from "./props";

/**
 * The pirate ship of ue_quest_4: the user's model (`obj_pirate_ship`, `tools/assets/sources/models/Pirate Ship.glb`) as one instance of the prop renderer, so that it is lit like every
 * other model of the overworld. It fades through the visibility of the model's meshes (there is only ever one ship on screen). `place`, `fadeOut` and `hide` are what the game calls.
 */
export const PIRATE_SHIP_MODEL = "obj_pirate_ship";

/** The file is 1.9 long, the ship about as long as three tiles: the old dummy was 5.4 long. */
const SCALE = 3.2;
/** The model lies along x with its bow towards +x; the game's yaw 0 is +z (the way the other models look), so the model is turned a quarter circle back. */
const MODEL_TURN = -Math.PI / 2;
/** The pirate ship rides in the water: its keel stands this far under the surface of a tile (the water is at height 0). */
const KEEL = 0.35;
/** How far it rocks in the swell, in radians, and how fast (radians a second). */
const ROCK = 0.04;
const ROCK_SPEED = 1.3;

export class PirateShip {
  private alpha = 0;
  private fading: { speed: number; done: () => void } | null = null;
  private clock = 0;
  private at: { x: number; z: number; yaw: number } | null = null;

  constructor(private readonly props: PropRenderer) {}

  /** Shows the ship at a world position, looking along `yaw` (the game's convention: 0 is +z). Brings it back fully visible unless it is fading out. */
  place(x: number, z: number, yaw: number): void {
    this.at = { x, z, yaw };
    if (!this.fading && this.alpha < 1) this.setAlpha(1);
    this.push();
  }

  /** The ship is gone at once (inside a place, or while it is away). */
  hide(): void {
    this.fading = null;
    this.at = null;
    this.setAlpha(0);
    this.push();
  }

  get shown(): boolean {
    return this.alpha > 0;
  }

  /** Fades the ship out in `seconds`; resolves when it is gone. */
  fadeOut(seconds: number): Promise<void> {
    if (this.alpha <= 0) return Promise.resolve();
    return new Promise((done) => {
      this.fading = { speed: this.alpha / Math.max(0.01, seconds), done };
    });
  }

  /** Runs the fade and the rocking in the swell. */
  update(dt: number): void {
    if (this.alpha <= 0) return;
    this.clock += dt;
    if (this.fading) {
      this.setAlpha(Math.max(0, this.alpha - this.fading.speed * dt));
      if (this.alpha <= 0) {
        const { done } = this.fading;
        this.fading = null;
        // the model is solid again for whoever draws it next (the debug showcase shows it too)
        this.props.setVisibility(PIRATE_SHIP_MODEL, 1);
        this.push();
        done();
        return;
      }
    }
    this.push();
  }

  /** The ship is only faded while it fades out: a hidden ship leaves the model's visibility alone (the showcase draws the same model, and `hide` runs every frame inside a place). */
  private setAlpha(a: number): void {
    this.alpha = a;
    this.props.setVisibility(PIRATE_SHIP_MODEL, this.fading ? a : 1);
  }

  /** One instance, rolling and pitching a little; none while the ship is away or faded out. */
  private push(): void {
    const owner = "pirate-ship";
    if (!this.at || this.alpha <= 0) {
      this.props.removeOwner(owner);
    } else {
      const inst: PropInstance = {
        model: PIRATE_SHIP_MODEL,
        x: this.at.x,
        y: -KEEL,
        z: this.at.z,
        rotY: this.at.yaw + MODEL_TURN,
        rotX: Math.sin(this.clock * ROCK_SPEED * 0.7 + 1) * ROCK * 0.6,
        rotZ: Math.sin(this.clock * ROCK_SPEED) * ROCK,
        scale: SCALE,
      };
      this.props.setInstances(owner, [inst]);
    }
    this.props.flush();
  }
}
