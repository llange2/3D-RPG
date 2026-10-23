/** Small seeded generator for the balance tool (mulberry32). The tool never touches the game's own generator state. */
export class R {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  float(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }
  /** Integer in [lo, hi], both inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }
}

/** FNV-1a over a string, for deriving one seed per scenario. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
